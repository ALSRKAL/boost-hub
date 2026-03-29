import { NextRequest, NextResponse } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { COLLECTIONS, USER_ROLES } from "@/lib/constants";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import {
  fetchProviderBalance,
  fetchProviderOrderStatuses,
  type ProviderOrderStatus,
} from "@/lib/provider";
import { parseRefillWindowHours } from "@/lib/refill-utils";

export const runtime = "nodejs";

const ACTIVE_SYNCABLE_STATUSES = ["pending", "processing", "in_progress"] as const;
const REFUND_AWAITING_STATE = "awaiting_provider_refund";
const REFUNDED_TO_USER_STATE = "refunded_to_user";

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

function normalizeProviderStatus(status: string): {
  orderStatus:
    | "pending"
    | "processing"
    | "in_progress"
    | "completed"
    | "partial"
    | "failed"
    | "cancelled";
  shouldRefund: boolean;
  refundState: "none" | "awaiting_provider_refund" | "refunded_to_user";
} {
  const normalized = status.trim().toLowerCase().replace(/\s+/g, "_");

  if (normalized === "refunded") {
    return {
      orderStatus: "cancelled",
      shouldRefund: true,
      refundState: REFUNDED_TO_USER_STATE,
    };
  }

  if (normalized === "canceled" || normalized === "cancelled") {
    return {
      orderStatus: "cancelled",
      shouldRefund: false,
      refundState: REFUND_AWAITING_STATE,
    };
  }

  if (normalized === "completed") {
    return { orderStatus: "completed", shouldRefund: false, refundState: "none" };
  }

  if (normalized === "partial") {
    return { orderStatus: "partial", shouldRefund: false, refundState: "none" };
  }

  if (normalized === "failed") {
    return { orderStatus: "failed", shouldRefund: false, refundState: "none" };
  }

  if (normalized === "processing") {
    return { orderStatus: "processing", shouldRefund: false, refundState: "none" };
  }

  if (normalized === "in_progress") {
    return { orderStatus: "in_progress", shouldRefund: false, refundState: "none" };
  }

  return { orderStatus: "pending", shouldRefund: false, refundState: "none" };
}

async function isAuthorizedAdmin(request: NextRequest): Promise<boolean> {
  const authHeader = request.headers.get("authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    return false;
  }

  const token = authHeader.slice("Bearer ".length).trim();

  try {
    const decoded = await getAdminAuth().verifyIdToken(token);
    const adminDb = getAdminDb();
    const userSnap = await adminDb.collection(COLLECTIONS.users).doc(decoded.uid).get();

    return userSnap.exists && userSnap.get("role") === USER_ROLES.admin;
  } catch (error) {
    console.error("Failed to verify admin token for order sync:", error);
    return false;
  }
}

async function isAuthorizedRequest(request: NextRequest): Promise<boolean> {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");

  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    return true;
  }

  const expectedSecret = process.env.SYNC_ORDERS_SECRET;
  const providedSecret =
    request.headers.get("x-sync-secret") ??
    request.nextUrl.searchParams.get("secret");

  if (expectedSecret && providedSecret === expectedSecret) {
    return true;
  }

  return isAuthorizedAdmin(request);
}

async function loadSyncableOrders() {
  const adminDb = getAdminDb();
  const [activeSnapshot, cancelledSnapshot] = await Promise.all([
    adminDb
    .collection(COLLECTIONS.orders)
    .where("status", "in", [...ACTIVE_SYNCABLE_STATUSES])
      .get(),
    adminDb
      .collection(COLLECTIONS.orders)
      .where("status", "==", "cancelled")
      .get(),
  ]);

  const docs = [...activeSnapshot.docs, ...cancelledSnapshot.docs];

  return docs
    .map((doc) => {
      const data = doc.data();

      return {
        id: doc.id,
        userId: data.userId,
        charge: data.charge,
        status: data.status,
        providerOrderId: data.providerOrderId,
        refundState: data.refundState,
        serviceName: data.serviceName as string | undefined,
        supportsRefill: data.supportsRefill as boolean | undefined,
        completedAt: data.completedAt as Timestamp | undefined,
      };
    })
    .filter(
      (order): order is {
        id: string;
        userId: string;
        charge: number;
        status: string;
        providerOrderId: string;
        refundState: string | undefined;
        serviceName: string | undefined;
        supportsRefill: boolean | undefined;
        completedAt: Timestamp | undefined;
      } =>
        typeof order.userId === "string" &&
        typeof order.providerOrderId === "string" &&
        typeof order.charge === "number" &&
        (ACTIVE_SYNCABLE_STATUSES.includes(
          order.status as (typeof ACTIVE_SYNCABLE_STATUSES)[number]
        ) ||
          (order.status === "cancelled" &&
            order.refundState === REFUND_AWAITING_STATE))
    );
}

async function fetchAllProviderStatuses(orderIds: string[]) {
  const batches = chunk(orderIds, 50);
  const records = await Promise.all(
    batches.map((batch) => fetchProviderOrderStatuses(batch))
  );

  return Object.assign({}, ...records) as Record<string, ProviderOrderStatus>;
}

async function refundAndCancelOrder(order: {
  id: string;
  userId: string;
  charge: number;
}, nextStatus: string, providerStatus: ProviderOrderStatus) {
  const adminDb = getAdminDb();
  const orderRef = adminDb.collection(COLLECTIONS.orders).doc(order.id);
  const userRef = adminDb.collection(COLLECTIONS.users).doc(order.userId);

  await adminDb.runTransaction(async (transaction) => {
    const orderSnap = await transaction.get(orderRef);

    if (!orderSnap.exists) {
      return;
    }

    const currentStatus = String(orderSnap.get("status") ?? "");
    const currentRefundState = String(orderSnap.get("refundState") ?? "none");

    const canStillRefund =
      ACTIVE_SYNCABLE_STATUSES.includes(
        currentStatus as (typeof ACTIVE_SYNCABLE_STATUSES)[number]
      ) ||
      (currentStatus === "cancelled" &&
        currentRefundState === REFUND_AWAITING_STATE);

    if (!canStillRefund || currentRefundState === REFUNDED_TO_USER_STATE) {
      return;
    }

    transaction.update(orderRef, {
      status: nextStatus,
      refundState: REFUNDED_TO_USER_STATE,
      providerLastStatus: providerStatus.status,
      providerRefundConfirmedAt: FieldValue.serverTimestamp(),
      refundedToUserAt: FieldValue.serverTimestamp(),
      refundedAmount: order.charge,
      updatedAt: FieldValue.serverTimestamp(),
      ...(typeof providerStatus.startCount === "number"
        ? { startCount: providerStatus.startCount }
        : {}),
      ...(typeof providerStatus.remains === "number"
        ? { remains: providerStatus.remains }
        : {}),
      ...(typeof providerStatus.charge === "number"
        ? { providerCharge: providerStatus.charge }
        : {}),
    });

    transaction.update(userRef, {
      balance: FieldValue.increment(order.charge),
    });
  });
}

async function updateOrderStatusOnly(
  orderId: string,
  providerStatus: ProviderOrderStatus,
  orderMeta?: {
    previousStatus?: string;
    serviceName?: string;
    supportsRefill?: boolean;
    completedAt?: Timestamp;
  }
) {
  const adminDb = getAdminDb();
  const orderRef = adminDb.collection(COLLECTIONS.orders).doc(orderId);
  const { orderStatus, refundState } = normalizeProviderStatus(providerStatus.status);

  // Detect transition to completed: store completion timing for refill countdown
  const isNewlyCompleted =
    orderStatus === "completed" &&
    orderMeta?.previousStatus !== "completed" &&
    !orderMeta?.completedAt;

  const completionFields: Record<string, unknown> = {};
  if (isNewlyCompleted) {
    completionFields.completedAt = FieldValue.serverTimestamp();

    const serviceName = orderMeta?.serviceName ?? "";
    const supportsRefill = orderMeta?.supportsRefill ?? false;
    const windowHours = parseRefillWindowHours(serviceName, supportsRefill);
    completionFields.refillWindowHours = windowHours === Infinity ? 999999 : windowHours;

    // Pre-compute refillAvailableAt if we have a finite window
    if (windowHours !== null && windowHours !== 0 && windowHours !== Infinity) {
      const MINIMUM_WAIT_HOURS = 24;
      const availableAt = new Date(Date.now() + MINIMUM_WAIT_HOURS * 60 * 60 * 1000);
      completionFields.refillAvailableAt = Timestamp.fromDate(availableAt);
    } else if (windowHours === Infinity || windowHours === null) {
      // Lifetime or unknown: available immediately after completion
      completionFields.refillAvailableAt = FieldValue.serverTimestamp();
    }
  }

  await orderRef.update({
    status: orderStatus,
    refundState,
    providerLastStatus: providerStatus.status,
    updatedAt: FieldValue.serverTimestamp(),
    ...completionFields,
    ...(typeof providerStatus.startCount === "number"
      ? { startCount: providerStatus.startCount }
      : {}),
    ...(typeof providerStatus.remains === "number"
      ? { remains: providerStatus.remains }
      : {}),
    ...(typeof providerStatus.charge === "number"
      ? { providerCharge: providerStatus.charge }
      : {}),
  });
}

export async function GET(request: NextRequest) {
  if (!(await isAuthorizedRequest(request))) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const orders = await loadSyncableOrders();
    const providerBalanceBefore = await fetchProviderBalance()
      .then((result) => result.balance)
      .catch((error) => {
        console.error("Failed to read provider balance before sync:", error);
        return null;
      });

    if (orders.length === 0) {
      await getAdminDb()
        .collection("system_metrics")
        .doc("order_sync")
        .set(
          {
            lastRunAt: FieldValue.serverTimestamp(),
            checked: 0,
            updated: 0,
            refunded: 0,
            skipped: 0,
            awaitingProviderRefund: 0,
            providerBalanceBefore,
            providerBalanceAfter: providerBalanceBefore,
          },
          { merge: true }
        );

      return NextResponse.json({
        success: true,
        summary: {
          checked: 0,
          updated: 0,
          refunded: 0,
          skipped: 0,
          awaitingProviderRefund: 0,
          providerBalanceBefore,
          providerBalanceAfter: providerBalanceBefore,
        },
      });
    }

    const providerStatuses = await fetchAllProviderStatuses(
      orders.map((order) => order.providerOrderId)
    );

    let updated = 0;
    let refunded = 0;
    let skipped = 0;
    let awaitingProviderRefund = 0;

    for (const order of orders) {
      const providerStatus = providerStatuses[order.providerOrderId];

      if (!providerStatus) {
        skipped += 1;
        continue;
      }

      const { orderStatus, shouldRefund } = normalizeProviderStatus(
        providerStatus.status
      );

      if (shouldRefund) {
        await refundAndCancelOrder(order, orderStatus, providerStatus);
        updated += 1;
        refunded += 1;
        continue;
      }

      if (
        orderStatus === "cancelled" &&
        order.refundState !== REFUND_AWAITING_STATE
      ) {
        await updateOrderStatusOnly(order.id, providerStatus);
        updated += 1;
        awaitingProviderRefund += 1;
        continue;
      }

      if (
        orderStatus === "cancelled" &&
        order.refundState === REFUND_AWAITING_STATE
      ) {
        if (
          typeof providerStatus.startCount === "number" ||
          typeof providerStatus.remains === "number" ||
          typeof providerStatus.charge === "number"
        ) {
          await updateOrderStatusOnly(order.id, providerStatus);
          updated += 1;
        } else {
          skipped += 1;
        }
        awaitingProviderRefund += 1;
        continue;
      }

      if (order.status !== orderStatus) {
        await updateOrderStatusOnly(order.id, providerStatus, {
          previousStatus: order.status,
          serviceName: order.serviceName,
          supportsRefill: order.supportsRefill,
          completedAt: order.completedAt,
        });
        updated += 1;
        continue;
      }

      if (
        typeof providerStatus.startCount === "number" ||
        typeof providerStatus.remains === "number" ||
        typeof providerStatus.charge === "number"
      ) {
        await updateOrderStatusOnly(order.id, providerStatus, {
          previousStatus: order.status,
          serviceName: order.serviceName,
          supportsRefill: order.supportsRefill,
          completedAt: order.completedAt,
        });
        updated += 1;
        continue;
      }

      skipped += 1;
    }

    const providerBalanceAfter = await fetchProviderBalance()
      .then((result) => result.balance)
      .catch((error) => {
        console.error("Failed to read provider balance after sync:", error);
        return null;
      });

    await getAdminDb()
      .collection("system_metrics")
      .doc("order_sync")
      .set(
        {
          lastRunAt: FieldValue.serverTimestamp(),
          checked: orders.length,
          updated,
          refunded,
          skipped,
          awaitingProviderRefund,
          providerBalanceBefore,
          providerBalanceAfter,
        },
        { merge: true }
      );

    return NextResponse.json({
      success: true,
      summary: {
        checked: orders.length,
        updated,
        refunded,
        skipped,
        awaitingProviderRefund,
        providerBalanceBefore,
        providerBalanceAfter,
      },
    });
  } catch (error) {
    console.error("Order sync failed:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to sync orders.",
      },
      { status: 500 }
    );
  }
}
