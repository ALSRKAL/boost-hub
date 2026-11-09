import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { COLLECTIONS } from "@/lib/constants";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import { cancelProviderOrder, ProviderError } from "@/lib/provider";

export const runtime = "nodejs";

const CANCELLABLE_STATUSES = new Set(["pending", "processing", "in_progress"]);

interface CancelRequestBody {
  orderId?: unknown;
  userId?: unknown;
}

function getBearerToken(authHeader: string | null): string | null {
  if (!authHeader?.startsWith("Bearer ")) return null;
  return authHeader.slice("Bearer ".length).trim();
}

export async function POST(request: NextRequest) {
  let body: CancelRequestBody;

  try {
    body = (await request.json()) as CancelRequestBody;
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
    console.error("Failed to verify Firebase ID token for cancel:", error);
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
      { error: "You can only cancel your own orders." },
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

    if (!order.supportsCancel) {
      return NextResponse.json(
        { error: "This service does not allow cancellation." },
        { status: 400 }
      );
    }

    if (!CANCELLABLE_STATUSES.has(String(order.status ?? ""))) {
      return NextResponse.json(
        { error: "Only pending or in-progress orders can be cancelled." },
        { status: 400 }
      );
    }

    if (
      typeof order.providerOrderId !== "string" ||
      order.providerOrderId.trim().length === 0
    ) {
      return NextResponse.json(
        { error: "This order has no provider reference yet. Try again shortly." },
        { status: 400 }
      );
    }

    try {
      await cancelProviderOrder(order.providerOrderId);
    } catch (providerError) {
      const classified =
        providerError instanceof ProviderError
          ? providerError
          : new ProviderError({
              code: "UNKNOWN",
              rawMessage:
                providerError instanceof Error
                  ? providerError.message
                  : "Provider cancellation failed.",
              operation: "cancel",
            });

      console.error("Provider cancel error", {
        orderId,
        providerOrderId: order.providerOrderId,
        code: classified.code,
        rawMessage: classified.rawMessage,
        httpStatus: classified.httpStatus,
        ambiguous: classified.ambiguous,
      });

      if (classified.ambiguous || !classified.safeToRefund) {
        await orderRef
          .update({
            providerLastStatus: "cancel_unknown",
            cancelRequestedAt: FieldValue.serverTimestamp(),
            cancelErrorMessage: classified.customerMessage,
            cancelErrorCode: classified.code,
            cancelUpdatedAt: FieldValue.serverTimestamp(),
            needsReconciliation: true,
            updatedAt: FieldValue.serverTimestamp(),
          })
          .catch((updateError) => {
            console.error("Failed to flag ambiguous cancellation:", updateError);
          });

        return NextResponse.json(
          {
            success: false,
            pendingConfirmation: true,
            message:
              "The provider did not confirm the cancellation. Do not retry; support will verify it.",
          },
          { status: 202 }
        );
      }

      await orderRef
        .update({
          cancelErrorMessage: classified.customerMessage,
          cancelErrorCode: classified.code,
          cancelUpdatedAt: FieldValue.serverTimestamp(),
        })
        .catch((updateError) => {
          console.error("Failed to store cancellation error:", updateError);
        });

      return NextResponse.json(
        { error: classified.customerMessage, code: classified.code },
        { status: 400 }
      );
    }

    await orderRef.update({
      status: "cancelled",
      refundState: "awaiting_provider_refund",
      providerLastStatus: "cancel_requested",
      cancelRequestedAt: FieldValue.serverTimestamp(),
      cancelUpdatedAt: FieldValue.serverTimestamp(),
      cancelErrorMessage: null,
      cancelErrorCode: null,
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({
      success: true,
      note: "Cancellation requested. The refund is credited after the provider confirms.",
    });
  } catch (error) {
    console.error("Failed to cancel order:", error);
    return NextResponse.json(
      { error: "Unable to cancel the order right now." },
      { status: 500 }
    );
  }
}
