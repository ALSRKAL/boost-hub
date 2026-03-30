import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { COLLECTIONS } from "@/lib/constants";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import { createProviderRefill } from "@/lib/provider";

export const runtime = "nodejs";

interface RefillRequestBody {
  orderId?: unknown;
  userId?: unknown;
}

function getBearerToken(authHeader: string | null): string | null {
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }

  return authHeader.slice("Bearer ".length).trim();
}

export async function POST(request: NextRequest) {
  let body: RefillRequestBody;

  try {
    body = (await request.json()) as RefillRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const token = getBearerToken(request.headers.get("authorization"));

  if (!token) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let decodedToken;

  try {
    decodedToken = await getAdminAuth().verifyIdToken(token);
  } catch (error) {
    console.error("Failed to verify Firebase ID token for refill:", error);
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const orderId = typeof body.orderId === "string" ? body.orderId.trim() : "";
  const userId = typeof body.userId === "string" ? body.userId.trim() : "";

  if (!orderId || !userId) {
    return NextResponse.json(
      { error: "orderId and userId are required." },
      { status: 400 }
    );
  }

  if (decodedToken.uid !== userId) {
    return NextResponse.json(
      { error: "You can only request a refill for your own order." },
      { status: 403 }
    );
  }

  try {
    const adminDb = getAdminDb();
    const orderRef = adminDb.collection(COLLECTIONS.orders).doc(orderId);
    const orderSnap = await orderRef.get();

    if (!orderSnap.exists) {
      return NextResponse.json({ error: "Order not found." }, { status: 404 });
    }

    const order = orderSnap.data();

    if (!order || order.userId !== userId) {
      return NextResponse.json({ error: "Order not found." }, { status: 404 });
    }

    if (!order.supportsRefill) {
      return NextResponse.json(
        { error: "This service does not support refill." },
        { status: 400 }
      );
    }

    if (
      typeof order.providerOrderId !== "string" ||
      order.providerOrderId.trim().length === 0
    ) {
      return NextResponse.json(
        { error: "Provider order ID is missing for this order." },
        { status: 400 }
      );
    }

    const orderStatus = String(order.status ?? "");

    if (!["completed", "partial"].includes(orderStatus)) {
      return NextResponse.json(
        { error: "Refill is only available after the order is completed or partial." },
        { status: 400 }
      );
    }

    const REFILL_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24h between any two refills
    const nowMs = Date.now();

    // ── 24h cooldown since last refill ───────────────────────────────
    if (order.refillRequestedAt) {
      const lastRefillMs = order.refillRequestedAt.toDate().getTime();
      if (nowMs < lastRefillMs + REFILL_COOLDOWN_MS) {
        const remainMs = lastRefillMs + REFILL_COOLDOWN_MS - nowMs;
        const remainHours = Math.floor(remainMs / (1000 * 60 * 60));
        const remainMins = Math.ceil((remainMs % (1000 * 60 * 60)) / (1000 * 60));
        return NextResponse.json(
          {
            error: `Next refill available in ${remainHours} hours ${remainMins} minutes.`,
          },
          { status: 400 }
        );
      }
    } else {
      // No refill done yet — enforce 24h from order completion (first refill wait)
      if (order.refillAvailableAt) {
        const availableAtMs = order.refillAvailableAt.toDate().getTime();
        if (nowMs < availableAtMs) {
          const remainMs = availableAtMs - nowMs;
          const remainHours = Math.floor(remainMs / (1000 * 60 * 60));
          const remainMins = Math.ceil((remainMs % (1000 * 60 * 60)) / (1000 * 60));
          return NextResponse.json(
            {
              error: `Refill will be available in ${remainHours} hours ${remainMins} minutes.`,
            },
            { status: 400 }
          );
        }
      } else if (order.completedAt) {
        const completedAtMs = order.completedAt.toDate().getTime();
        if (nowMs < completedAtMs + REFILL_COOLDOWN_MS) {
          const remainMs = completedAtMs + REFILL_COOLDOWN_MS - nowMs;
          const remainHours = Math.floor(remainMs / (1000 * 60 * 60));
          const remainMins = Math.ceil((remainMs % (1000 * 60 * 60)) / (1000 * 60));
          return NextResponse.json(
            {
              error: `Refill will be available in ${remainHours} hours ${remainMins} minutes.`,
            },
            { status: 400 }
          );
        }
      }
    }

    // ── Check refill window expiry ──────────────────────────────────
    const refillWindowHours = order.refillWindowHours as number | null | undefined;
    if (
      order.completedAt &&
      typeof refillWindowHours === "number" &&
      refillWindowHours > 0 &&
      refillWindowHours < 999999
    ) {
      const completedAtMs = order.completedAt.toDate().getTime();
      const expiryMs = completedAtMs + refillWindowHours * 60 * 60 * 1000;
      if (nowMs > expiryMs) {
        return NextResponse.json(
          { error: "The refill window for this order has expired." },
          { status: 400 }
        );
      }
    }

    let refillRequestId: string;

    try {
      refillRequestId = await createProviderRefill(order.providerOrderId);
    } catch (providerError) {
      const msg =
        providerError instanceof Error ? providerError.message : "Provider refill failed.";

      // If provider says refill was already done / no more refills for this period,
      // record the attempt so the 24h cooldown timer still starts
      if (/no more refill|already.*refill|refill.*already/i.test(msg)) {
        const currentCount = typeof order.refillCount === "number" ? order.refillCount : 0;
        await orderRef.update({
          refillRequestId: `provider-refill-${order.providerOrderId}-${Date.now()}`,
          refillStatus: "requested",
          refillCount: currentCount + 1,
          refillRequestedAt: FieldValue.serverTimestamp(),
          refillUpdatedAt: FieldValue.serverTimestamp(),
        });

        return NextResponse.json({
          success: true,
          note: "Provider indicates this order was already refilled for this period.",
        });
      }

      // Other provider errors → return 400, not 500
      console.error("Provider refill error:", providerError);
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    const currentCount = typeof order.refillCount === "number" ? order.refillCount : 0;
    await orderRef.update({
      refillRequestId,
      refillStatus: "requested",
      refillCount: currentCount + 1,
      refillRequestedAt: FieldValue.serverTimestamp(),
      refillUpdatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({
      success: true,
      refillRequestId,
    });
  } catch (error) {
    console.error("Failed to create refill request:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to request refill right now.",
      },
      { status: 500 }
    );
  }
}

