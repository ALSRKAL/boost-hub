import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { COLLECTIONS } from "@/lib/constants";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import { createProviderRefill, ProviderError } from "@/lib/provider";
import { canRequestRefill, formatCountdown } from "@/lib/refill-utils";

export const runtime = "nodejs";

interface RefillRequestBody {
  orderId?: unknown;
  userId?: unknown;
}

function getBearerToken(authHeader: string | null): string | null {
  if (!authHeader?.startsWith("Bearer ")) return null;
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
      { error: "Order and account are required." },
      { status: 400 }
    );
  }

  if (decodedToken.uid !== userId) {
    return NextResponse.json(
      { error: "You can only request refills for your own orders." },
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
        { error: "This service does not support refills." },
        { status: 400 }
      );
    }

    if (
      typeof order.providerOrderId !== "string" ||
      order.providerOrderId.trim().length === 0
    ) {
      return NextResponse.json(
        { error: "This order has no provider reference yet. Try again after the next sync." },
        { status: 400 }
      );
    }

    const decision = canRequestRefill(
      {
        supportsRefill: Boolean(order.supportsRefill),
        status: String(order.status ?? ""),
        completedAt: order.completedAt,
        refillAvailableAt: order.refillAvailableAt,
        refillRequestedAt: order.refillRequestedAt,
        refillWindowHours:
          typeof order.refillWindowHours === "number"
            ? order.refillWindowHours
            : null,
      },
      Date.now()
    );

    if (!decision.allowed) {
      const messages: Record<string, string> = {
        "no-refill": "This service does not support refills.",
        inactive: "Cancelled or failed orders cannot be refilled.",
        "not-completed": "Refill becomes available after the order completes.",
        expired: "The refill window for this order has expired.",
        cooldown:
          decision.availableAtMs !== undefined
            ? `Next refill available in ${formatCountdown(
                decision.availableAtMs - Date.now()
              )}.`
            : "This order was refilled recently.",
        waiting:
          decision.availableAtMs !== undefined
            ? `Refill will be available in ${formatCountdown(
                decision.availableAtMs - Date.now()
              )}.`
            : "Refill is not available yet.",
      };

      return NextResponse.json(
        { error: messages[decision.reason ?? ""] ?? "Refill is not available." },
        { status: 400 }
      );
    }

    let refillRequestId: string;

    try {
      refillRequestId = await createProviderRefill(order.providerOrderId);
    } catch (providerError) {
      const classified =
        providerError instanceof ProviderError
          ? providerError
          : new ProviderError({
              code: "UNKNOWN",
              rawMessage:
                providerError instanceof Error
                  ? providerError.message
                  : "Provider refill failed.",
              operation: "refill",
            });

      console.error("Provider refill error", {
        orderId,
        providerOrderId: order.providerOrderId,
        code: classified.code,
        rawMessage: classified.rawMessage,
        httpStatus: classified.httpStatus,
        ambiguous: classified.ambiguous,
      });

      const currentCount =
        typeof order.refillCount === "number" ? order.refillCount : 0;

      // Providers often report an already-processed refill. Record the attempt
      // so the 24h cooldown starts instead of allowing an infinite retry loop.
      if (classified.code === "ALREADY_REFILLED") {
        await orderRef.update({
          refillRequestId: `provider-refill-${order.providerOrderId}-${Date.now()}`,
          refillStatus: "requested",
          refillCount: currentCount + 1,
          refillRequestedAt: FieldValue.serverTimestamp(),
          refillUpdatedAt: FieldValue.serverTimestamp(),
          refillErrorMessage: null,
          refillErrorCode: null,
        });

        return NextResponse.json({
          success: true,
          note: "The provider indicates this order was already refilled for this period.",
        });
      }

      // A timeout/reset may mean the provider accepted the refill. Start the
      // cooldown and flag it instead of allowing a duplicate refill.
      if (classified.ambiguous || !classified.safeToRefund) {
        await orderRef.update({
          refillRequestId: `ambiguous-refill-${order.providerOrderId}-${Date.now()}`,
          refillStatus: "requested",
          refillCount: currentCount + 1,
          refillRequestedAt: FieldValue.serverTimestamp(),
          refillUpdatedAt: FieldValue.serverTimestamp(),
          refillErrorMessage: classified.customerMessage,
          refillErrorCode: classified.code,
        });

        return NextResponse.json(
          {
            success: false,
            pendingConfirmation: true,
            message:
              "The provider did not confirm the refill. Do not retry; support will verify it.",
          },
          { status: 202 }
        );
      }

      await orderRef
        .update({
          refillStatus: "failed",
          refillErrorMessage: classified.customerMessage,
          refillErrorCode: classified.code,
          refillUpdatedAt: FieldValue.serverTimestamp(),
        })
        .catch((updateError) => {
          console.error("Failed to store refill error state:", updateError);
        });

      return NextResponse.json(
        { error: classified.customerMessage, code: classified.code },
        { status: 400 }
      );
    }

    const currentCount =
      typeof order.refillCount === "number" ? order.refillCount : 0;

    await orderRef.update({
      refillRequestId,
      refillStatus: "requested",
      refillCount: currentCount + 1,
      refillRequestedAt: FieldValue.serverTimestamp(),
      refillUpdatedAt: FieldValue.serverTimestamp(),
      refillErrorMessage: null,
      refillErrorCode: null,
    });

    return NextResponse.json({ success: true, refillRequestId });
  } catch (error) {
    console.error("Failed to create refill request:", error);
    return NextResponse.json(
      { error: "Unable to request a refill right now." },
      { status: 500 }
    );
  }
}
