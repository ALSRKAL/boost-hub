import { NextRequest, NextResponse } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { COLLECTIONS, USER_ROLES } from "@/lib/constants";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import { fromMinor, roundMoney, toMinor } from "@/lib/money";
import { calculateRemainingFullRefund } from "@/lib/provider-sync";
import { localize, readApiLanguage } from "@/lib/api-language";
import { translateErrorMessage } from "@/lib/error-messages";

export const runtime = "nodejs";

type AdminOrderAction = "refund_cancel" | "attach_provider" | "dismiss_review";

const ORDER_ID_PATTERN = /^[A-Za-z0-9_-]{6,128}$/;
const PROVIDER_ORDER_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const REFUNDED_STATE = "refunded_to_user";

class ResolutionError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ResolutionError";
    this.status = status;
  }
}

function getBearerToken(authHeader: string | null): string | null {
  if (!authHeader?.startsWith("Bearer ")) return null;
  return authHeader.slice("Bearer ".length).trim();
}

async function requireAdmin(request: NextRequest): Promise<string> {
  const token = getBearerToken(request.headers.get("authorization"));

  if (!token) {
    throw new ResolutionError(401, "Unauthorized.");
  }

  let uid: string;

  try {
    const decoded = await getAdminAuth().verifyIdToken(token);
    uid = decoded.uid;
  } catch (error) {
    console.error("Admin order resolution auth failed:", error);
    throw new ResolutionError(401, "Unauthorized.");
  }

  const userSnap = await getAdminDb()
    .collection(COLLECTIONS.users)
    .doc(uid)
    .get();

  if (!userSnap.exists || userSnap.get("role") !== USER_ROLES.admin) {
    throw new ResolutionError(403, "Forbidden.");
  }

  return uid;
}

function parseAction(value: unknown): AdminOrderAction | null {
  if (
    value === "refund_cancel" ||
    value === "attach_provider" ||
    value === "dismiss_review"
  ) {
    return value;
  }

  return null;
}

/**
 * Atomically refunds whatever remains unrefunded and closes the order.
 * `refundedAmount` tracks every credit, so a repeated request cannot double-pay.
 */
async function refundAndCancel(orderId: string, adminUid: string) {
  const adminDb = getAdminDb();
  const orderRef = adminDb.collection(COLLECTIONS.orders).doc(orderId);
  const now = Timestamp.now();

  return adminDb.runTransaction(async (transaction) => {
    const orderSnap = await transaction.get(orderRef);

    if (!orderSnap.exists) {
      throw new ResolutionError(404, "This order no longer exists.");
    }

    const userId = String(orderSnap.get("userId") ?? "");
    const userRef = userId
      ? adminDb.collection(COLLECTIONS.users).doc(userId)
      : null;
    const userSnap = userRef ? await transaction.get(userRef) : null;

    const refundState = String(orderSnap.get("refundState") ?? "none");
    const charge = Number(orderSnap.get("charge") ?? 0);
    const alreadyRefunded = Number(orderSnap.get("refundedAmount") ?? 0);
    const refundAmount = calculateRemainingFullRefund({
      charge,
      alreadyRefunded,
    });

    if (
      refundState === REFUNDED_STATE &&
      toMinor(alreadyRefunded) >= toMinor(charge)
    ) {
      return {
        alreadyResolved: true,
        refundedAmount: 0,
        totalRefunded: roundMoney(alreadyRefunded),
        balanceAfter:
          userSnap && userSnap.exists
            ? Number(userSnap.get("balance") ?? 0)
            : null,
      };
    }

    if (refundAmount > 0 && (!userSnap || !userSnap.exists)) {
      throw new ResolutionError(
        409,
        "The order owner no longer exists, so the refund cannot be credited."
      );
    }

    const balanceAfter =
      userSnap && userSnap.exists
        ? fromMinor(
            toMinor(Number(userSnap.get("balance") ?? 0)) + toMinor(refundAmount)
          )
        : null;

    transaction.update(orderRef, {
      status: "cancelled",
      refundState: REFUNDED_STATE,
      refundedAmount: roundMoney(alreadyRefunded + refundAmount),
      ...(refundAmount > 0 ? { refundedToUserAt: now } : {}),
      refundAnomaly: null,
      needsReconciliation: false,
      providerError: null,
      providerErrorCode: null,
      providerErrorAt: null,
      cancelUpdatedAt: now,
      adminResolution: {
        action: "refund_cancel",
        adminUid,
        at: now,
      },
      updatedAt: now,
    });

    if (refundAmount > 0 && userRef && userSnap && userSnap.exists) {
      transaction.update(userRef, {
        balance: FieldValue.increment(refundAmount),
      });
    }

    return {
      alreadyResolved: false,
      refundedAmount: refundAmount,
      totalRefunded: roundMoney(alreadyRefunded + refundAmount),
      balanceAfter,
    };
  });
}

/**
 * Links a provider order id discovered after an ambiguous add, then returns the
 * order to the normal sync pipeline.
 */
async function attachProviderOrder(
  orderId: string,
  providerOrderId: string,
  adminUid: string
) {
  const adminDb = getAdminDb();
  const orderRef = adminDb.collection(COLLECTIONS.orders).doc(orderId);
  const now = Timestamp.now();

  return adminDb.runTransaction(async (transaction) => {
    const orderSnap = await transaction.get(orderRef);

    if (!orderSnap.exists) {
      throw new ResolutionError(404, "This order no longer exists.");
    }

    if (String(orderSnap.get("refundState") ?? "none") === REFUNDED_STATE) {
      throw new ResolutionError(
        409,
        "This order is already refunded and cannot be linked to a provider order."
      );
    }

    const duplicateSnap = await transaction.get(
      adminDb
        .collection(COLLECTIONS.orders)
        .where("providerOrderId", "==", providerOrderId)
        .limit(2)
    );

    const duplicate = duplicateSnap.docs.find((doc) => doc.id !== orderId);

    if (duplicate) {
      throw new ResolutionError(
        409,
        `Provider order ${providerOrderId} is already linked to order ${duplicate.id}.`
      );
    }

    const previousProviderOrderId =
      typeof orderSnap.get("providerOrderId") === "string"
        ? (orderSnap.get("providerOrderId") as string)
        : null;

    transaction.update(orderRef, {
      providerOrderId,
      status: "pending",
      providerLastStatus: "attached",
      needsReconciliation: false,
      refundAnomaly: null,
      providerError: null,
      providerErrorCode: null,
      providerErrorAt: null,
      partialRefundEvaluated: false,
      ...(previousProviderOrderId && previousProviderOrderId !== providerOrderId
        ? { previousProviderOrderId }
        : {}),
      adminResolution: {
        action: "attach_provider",
        adminUid,
        at: now,
      },
      updatedAt: now,
    });

    return { providerOrderId, previousProviderOrderId };
  });
}

async function dismissReview(orderId: string, adminUid: string) {
  const adminDb = getAdminDb();
  const orderRef = adminDb.collection(COLLECTIONS.orders).doc(orderId);
  const orderSnap = await orderRef.get();

  if (!orderSnap.exists) {
    throw new ResolutionError(404, "This order no longer exists.");
  }

  const now = Timestamp.now();
  const previousProviderError =
    typeof orderSnap.get("providerError") === "string"
      ? (orderSnap.get("providerError") as string)
      : null;
  const previousProviderErrorCode =
    typeof orderSnap.get("providerErrorCode") === "string"
      ? (orderSnap.get("providerErrorCode") as string)
      : null;

  // The critical error code drives the review queue, so a dismissal must clear
  // the active fields while keeping the original error for the audit trail.
  await orderRef.update({
    needsReconciliation: false,
    refundAnomaly: null,
    providerError: null,
    providerErrorCode: null,
    providerErrorAt: null,
    ...(previousProviderError || previousProviderErrorCode
      ? {
          dismissedProviderError: previousProviderError,
          dismissedProviderErrorCode: previousProviderErrorCode,
        }
      : {}),
    reviewDismissedAt: now,
    adminResolution: {
      action: "dismiss_review",
      adminUid,
      at: now,
    },
    updatedAt: now,
  });
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  const language = readApiLanguage(request);

  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { error: localize(language, "Invalid request body.", "طلب غير صالح.") },
      { status: 400 }
    );
  }

  try {
    const adminUid = await requireAdmin(request);
    const action = parseAction(body.action);
    const orderId = typeof body.orderId === "string" ? body.orderId.trim() : "";

    if (!action) {
      return NextResponse.json(
        {
          error: localize(
            language,
            "Unknown resolution action.",
            "إجراء معالجة غير معروف."
          ),
        },
        { status: 400 }
      );
    }

    if (!ORDER_ID_PATTERN.test(orderId)) {
      return NextResponse.json(
        {
          error: localize(
            language,
            "A valid order identifier is required.",
            "معرّف طلب صالح مطلوب."
          ),
        },
        { status: 400 }
      );
    }

    if (action === "refund_cancel") {
      const result = await refundAndCancel(orderId, adminUid);

      return NextResponse.json({
        success: true,
        action,
        orderId,
        ...result,
      });
    }

    if (action === "attach_provider") {
      const providerOrderId =
        typeof body.providerOrderId === "string"
          ? body.providerOrderId.trim()
          : "";

      if (!PROVIDER_ORDER_ID_PATTERN.test(providerOrderId)) {
        return NextResponse.json(
          {
            error: localize(
              language,
              "Enter the provider order id exactly as shown on the provider panel (letters, digits, dash, or underscore).",
              "أدخل معرف طلب المزود كما يظهر في لوحة المزود (أحرف أو أرقام أو شرطة أو شرطة سفلية)."
            ),
          },
          { status: 400 }
        );
      }

      const result = await attachProviderOrder(
        orderId,
        providerOrderId,
        adminUid
      );

      return NextResponse.json({
        success: true,
        action,
        orderId,
        ...result,
      });
    }

    await dismissReview(orderId, adminUid);

    return NextResponse.json({ success: true, action, orderId });
  } catch (error) {
    if (error instanceof ResolutionError) {
      return NextResponse.json(
        { error: translateErrorMessage(error.message, language) },
        { status: error.status }
      );
    }

    console.error("Admin order resolution failed:", error);

    return NextResponse.json(
      {
        error: localize(
          language,
          "The resolution action failed. Check the server logs.",
          "تعذّرت معالجة الطلب. راجع سجلات الخادم."
        ),
      },
      { status: 500 }
    );
  }
}
