import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { COLLECTIONS } from "@/lib/constants";
import { getAdminDb } from "@/lib/firebase-admin";
import {
  fetchProviderBalance,
  fetchProviderOrderStatuses,
  ProviderError,
  type ProviderOrderStatus,
  type ProviderStatusBatchResult,
} from "@/lib/provider";
import {
  calculatePartialRefund,
  calculateRemainingFullRefund,
  isRefundLocked,
  normalizeProviderStatus,
} from "@/lib/provider-sync";
import {
  getFirstRefillWaitMs,
  LIFETIME_REFILL_HOURS,
  parseRefillWindowHours,
} from "@/lib/refill-utils";
import { roundMoney } from "@/lib/money";

const ACTIVE_SYNCABLE_STATUSES = ["pending", "processing", "in_progress"] as const;
const STATUS_FILTERS = [...ACTIVE_SYNCABLE_STATUSES, "partial"] as const;
const REFUNDED_TO_USER_STATE = "refunded_to_user";

export type SyncSource = "cron" | "sync_secret" | "admin" | "customer";

export interface SyncableOrder {
  id: string;
  userId: string;
  quantity: number;
  charge: number;
  status: string;
  providerOrderId: string;
  refundState: string | undefined;
  refundedAmount: number | undefined;
  refundAnomaly: string | null | undefined;
  needsReconciliation: boolean;
  partialRefundEvaluated: boolean;
  serviceName: string | undefined;
  supportsRefill: boolean | undefined;
  completedAt: Timestamp | undefined;
  providerLastStatus: string | undefined;
}

export interface SyncSummary {
  checked: number;
  updated: number;
  refunded: number;
  refundedAmount: number;
  skipped: number;
  errors: number;
  refundAnomalies: number;
  awaitingProviderRefund: number;
  providerBalanceBefore?: number | null;
  providerBalanceAfter?: number | null;
}

interface RefundOutcome {
  refunded: boolean;
  amount: number;
  anomaly?: string | null;
  skipped?: boolean;
}

export interface SyncOrdersOptions {
  /** When set, only this user's orders are synced. */
  userId?: string;
  source?: SyncSource;
  /** Global sync also reads the provider balance before/after. */
  includeProviderBalance?: boolean;
  /** Only global/admin sync writes system metrics. */
  writeMetrics?: boolean;
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

async function writeOrderSyncMetrics(payload: Record<string, unknown>) {
  await getAdminDb()
    .collection(COLLECTIONS.systemMetrics)
    .doc("order_sync")
    .set(payload, { merge: true });
}

async function loadSyncableOrders(options: {
  userId?: string;
}): Promise<SyncableOrder[]> {
  const adminDb = getAdminDb();

  const docs = options.userId
    ? (await adminDb
        .collection(COLLECTIONS.orders)
        .where("userId", "==", options.userId)
        .get()).docs
    : (
        await Promise.all([
          adminDb
            .collection(COLLECTIONS.orders)
            .where("status", "in", [...STATUS_FILTERS])
            .get(),
          adminDb
            .collection(COLLECTIONS.orders)
            .where("status", "==", "cancelled")
            .get(),
          adminDb
            .collection(COLLECTIONS.orders)
            .where("status", "==", "failed")
            .get(),
        ])
      ).flatMap((snapshot) => snapshot.docs);

  return docs
    .map((doc) => {
      const data = doc.data();

      return {
        id: doc.id,
        userId: data.userId as string,
        quantity: Number(data.quantity ?? 0),
        charge: Number(data.charge ?? 0),
        status: String(data.status ?? ""),
        providerOrderId: data.providerOrderId as string,
        refundState: data.refundState as string | undefined,
        refundedAmount:
          typeof data.refundedAmount === "number" ? data.refundedAmount : undefined,
        refundAnomaly: data.refundAnomaly as string | null | undefined,
        needsReconciliation: Boolean(data.needsReconciliation),
        partialRefundEvaluated: Boolean(data.partialRefundEvaluated),
        serviceName: data.serviceName as string | undefined,
        supportsRefill: data.supportsRefill as boolean | undefined,
        completedAt: data.completedAt as Timestamp | undefined,
        providerLastStatus: data.providerLastStatus as string | undefined,
      };
    })
    .filter((order): order is SyncableOrder => {
      if (
        typeof order.userId !== "string" ||
        typeof order.providerOrderId !== "string" ||
        order.providerOrderId.length === 0 ||
        !Number.isFinite(order.charge)
      ) {
        return false;
      }

      // Fully refunded orders never need another refund.
      if (order.refundState === REFUNDED_TO_USER_STATE) return false;

      // A partial order is evaluated once. After that the refund lock or the
      // evaluated flag prevents repeated refunds.
      if (
        order.status === "partial" &&
        (order.partialRefundEvaluated || isRefundLocked(order.refundState))
      ) {
        return false;
      }

      return (
        STATUS_FILTERS.includes(
          order.status as (typeof STATUS_FILTERS)[number]
        ) ||
        order.status === "cancelled" ||
        order.status === "failed"
      );
    });
}

function providerMetadata(providerStatus: ProviderOrderStatus) {
  return {
    providerLastStatus: providerStatus.status,
    ...(typeof providerStatus.startCount === "number"
      ? { startCount: providerStatus.startCount }
      : {}),
    ...(typeof providerStatus.remains === "number"
      ? { remains: providerStatus.remains }
      : {}),
    ...(typeof providerStatus.charge === "number"
      ? { providerCharge: providerStatus.charge }
      : {}),
  };
}

/**
 * Full refund for cancelled/failed/refunded statuses.
 * If a partial refund already happened, only the remaining charge is refunded.
 */
async function refundOrderFull(
  order: SyncableOrder,
  nextStatus: "cancelled" | "failed",
  providerStatus: ProviderOrderStatus
): Promise<RefundOutcome> {
  const adminDb = getAdminDb();
  const orderRef = adminDb.collection(COLLECTIONS.orders).doc(order.id);
  const userRef = adminDb.collection(COLLECTIONS.users).doc(order.userId);
  const now = Timestamp.now();

  return adminDb.runTransaction(async (transaction) => {
    const [orderSnap, userSnap] = await Promise.all([
      transaction.get(orderRef),
      transaction.get(userRef),
    ]);

    if (!orderSnap.exists) {
      return { refunded: false, amount: 0, skipped: true };
    }

    const currentRefundState = String(orderSnap.get("refundState") ?? "none");

    if (currentRefundState === REFUNDED_TO_USER_STATE) {
      return { refunded: false, amount: 0, skipped: true };
    }

    const charge = Number(orderSnap.get("charge") ?? 0);
    const alreadyRefunded = Number(orderSnap.get("refundedAmount") ?? 0);
    const refundAmount = calculateRemainingFullRefund({
      charge,
      alreadyRefunded,
    });
    const totalRefunded = roundMoney(alreadyRefunded + refundAmount);

    transaction.update(orderRef, {
      status: nextStatus,
      refundState: REFUNDED_TO_USER_STATE,
      refundedAmount: totalRefunded,
      refundedToUserAt: now,
      providerRefundConfirmedAt: now,
      refundAnomaly: null,
      needsReconciliation: false,
      providerError: null,
      providerErrorCode: null,
      lastSyncedAt: now,
      updatedAt: now,
      ...providerMetadata(providerStatus),
    });

    if (userSnap.exists && refundAmount > 0) {
      transaction.update(userRef, {
        balance: FieldValue.increment(refundAmount),
      });
    }

    return {
      refunded: refundAmount > 0,
      amount: refundAmount,
      skipped: false,
    };
  });
}

/**
 * Partial refund = unused share of the charge, in integer paise.
 * The `partially_refunded` state and `partialRefundEvaluated` flag make this
 * idempotent across repeated and concurrent sync runs.
 */
async function refundOrderPartial(
  order: SyncableOrder,
  providerStatus: ProviderOrderStatus
): Promise<RefundOutcome> {
  const adminDb = getAdminDb();
  const orderRef = adminDb.collection(COLLECTIONS.orders).doc(order.id);
  const userRef = adminDb.collection(COLLECTIONS.users).doc(order.userId);
  const now = Timestamp.now();

  return adminDb.runTransaction(async (transaction) => {
    const [orderSnap, userSnap] = await Promise.all([
      transaction.get(orderRef),
      transaction.get(userRef),
    ]);

    if (!orderSnap.exists) {
      return { refunded: false, amount: 0, skipped: true };
    }

    const currentRefundState = String(orderSnap.get("refundState") ?? "none");

    if (isRefundLocked(currentRefundState)) {
      return { refunded: false, amount: 0, skipped: true };
    }

    const charge = Number(orderSnap.get("charge") ?? 0);
    const quantity = Math.trunc(Number(orderSnap.get("quantity") ?? 0));
    const alreadyRefunded = Number(orderSnap.get("refundedAmount") ?? 0);
    const calculation = calculatePartialRefund({
      charge,
      quantity,
      remains: providerStatus.remains,
    });

    const baseFields = {
      status: "partial",
      refundPartialRemains: providerStatus.remains ?? null,
      partialRefundEvaluated: true,
      lastSyncedAt: now,
      updatedAt: now,
      ...providerMetadata(providerStatus),
    };

    if (calculation.refundMinor > 0) {
      transaction.update(orderRef, {
        ...baseFields,
        refundState: "partially_refunded",
        refundedAmount: roundMoney(alreadyRefunded + calculation.refundAmount),
        refundedToUserAt: now,
        refundAnomaly: null,
        needsReconciliation: false,
        providerError: null,
        providerErrorCode: null,
      });

      if (userSnap.exists) {
        transaction.update(userRef, {
          balance: FieldValue.increment(calculation.refundAmount),
        });
      }

      return {
        refunded: true,
        amount: calculation.refundAmount,
        anomaly: null,
      };
    }

    transaction.update(orderRef, {
      ...baseFields,
      refundState: "none",
      refundAnomaly: calculation.anomaly,
      needsReconciliation: Boolean(calculation.anomaly),
      ...(calculation.anomaly ? {} : { providerError: null, providerErrorCode: null }),
    });

    return {
      refunded: false,
      amount: 0,
      anomaly: calculation.anomaly,
    };
  });
}

async function updateOrderStatusOnly(
  order: SyncableOrder,
  providerStatus: ProviderOrderStatus
) {
  const adminDb = getAdminDb();
  const orderRef = adminDb.collection(COLLECTIONS.orders).doc(order.id);
  const { orderStatus } = normalizeProviderStatus(providerStatus.status);

  const isNewlyCompleted =
    orderStatus === "completed" && order.status !== "completed" && !order.completedAt;

  const completionFields: Record<string, unknown> = {};

  if (isNewlyCompleted) {
    completionFields.completedAt = FieldValue.serverTimestamp();

    const windowHours = parseRefillWindowHours(
      order.serviceName ?? "",
      Boolean(order.supportsRefill)
    );
    const storedWindow =
      windowHours === Number.POSITIVE_INFINITY ? LIFETIME_REFILL_HOURS : windowHours;

    completionFields.refillWindowHours = storedWindow;

    if (storedWindow !== null && storedWindow !== 0) {
      const waitMs = getFirstRefillWaitMs(windowHours);
      completionFields.refillAvailableAt = Timestamp.fromDate(
        new Date(Date.now() + waitMs)
      );
    }
  }

  const preservedRefundState = isRefundLocked(order.refundState)
    ? order.refundState
    : "none";

  // A cancellation request that the provider ignored should not leave the
  // order permanently un-cancelable after a definitive active status.
  const clearIgnoredCancelRequest =
    order.providerLastStatus === "cancel_unknown" &&
    ["pending", "processing", "in_progress"].includes(orderStatus);

  await orderRef.update({
    status: orderStatus,
    refundState: preservedRefundState,
    refundAnomaly: null,
    needsReconciliation: false,
    providerError: null,
    providerErrorCode: null,
    lastSyncedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    ...(clearIgnoredCancelRequest
      ? {
          cancelRequestedAt: null,
          cancelErrorCode: null,
          cancelErrorMessage: null,
        }
      : {}),
    ...completionFields,
    ...providerMetadata(providerStatus),
  });
}

async function markProviderSyncError(
  order: SyncableOrder,
  rawError: string,
  code: string
) {
  // Raw upstream text stays in server logs; order documents are readable by
  // their owner, so only a sanitized message and code are persisted.
  console.error("Provider sync error", {
    orderId: order.id,
    providerOrderId: order.providerOrderId,
    code,
    rawError,
  });

  await getAdminDb()
    .collection(COLLECTIONS.orders)
    .doc(order.id)
    .update({
      providerError:
        code === "INVALID_ORDER"
          ? "The provider could not find this order."
          : "Provider status is temporarily unavailable.",
      providerErrorCode: code,
      providerErrorAt: FieldValue.serverTimestamp(),
      lastSyncedAt: FieldValue.serverTimestamp(),
      ...(code === "INVALID_ORDER" ? { needsReconciliation: true } : {}),
    });
}

async function fetchAllProviderStatuses(
  orderIds: string[]
): Promise<ProviderStatusBatchResult> {
  const batches = chunk(Array.from(new Set(orderIds)), 100);
  const results = await Promise.all(
    batches.map(async (batch): Promise<ProviderStatusBatchResult> => {
      try {
        return await fetchProviderOrderStatuses(batch);
      } catch (error) {
        const message =
          error instanceof ProviderError
            ? error.rawMessage
            : error instanceof Error
              ? error.message
              : "Provider status batch failed.";

        console.error("Provider status batch failed", {
          size: batch.length,
          code: error instanceof ProviderError ? error.code : "UNKNOWN",
          rawMessage: message,
        });

        return {
          statuses: {},
          errors: Object.fromEntries(batch.map((id) => [id, message])),
        };
      }
    })
  );

  return results.reduce<ProviderStatusBatchResult>(
    (merged, result) => ({
      statuses: { ...merged.statuses, ...result.statuses },
      errors: { ...merged.errors, ...result.errors },
    }),
    { statuses: {}, errors: {} }
  );
}

/**
 * Syncs provider status for either every syncable order (global/admin) or one
 * customer's orders. Customer-scoped calls do not read the provider balance or
 * write global metrics.
 */
export async function syncOrders(
  options: SyncOrdersOptions = {}
): Promise<SyncSummary> {
  const {
    userId,
    source = "cron",
    includeProviderBalance = false,
    writeMetrics = false,
  } = options;

  try {
    const orders = await loadSyncableOrders({ userId });

    const providerBalanceBefore = includeProviderBalance
      ? await fetchProviderBalance()
          .then((result) => result.balance)
          .catch((error) => {
            console.error("Failed to read provider balance before sync:", error);
            return null;
          })
      : null;

    if (orders.length === 0) {
      if (writeMetrics) {
        await writeOrderSyncMetrics({
          lastRunAt: FieldValue.serverTimestamp(),
          lastSuccessfulRunAt: FieldValue.serverTimestamp(),
          lastRunStatus: "success",
          lastRunSource: source,
          lastError: null,
          checked: 0,
          updated: 0,
          refunded: 0,
          skipped: 0,
          errors: 0,
          refundAnomalies: 0,
          awaitingProviderRefund: 0,
          providerBalanceBefore,
          providerBalanceAfter: providerBalanceBefore,
        });
      }

      return {
        checked: 0,
        updated: 0,
        refunded: 0,
        refundedAmount: 0,
        skipped: 0,
        errors: 0,
        refundAnomalies: 0,
        awaitingProviderRefund: 0,
        ...(includeProviderBalance
          ? {
              providerBalanceBefore,
              providerBalanceAfter: providerBalanceBefore,
            }
          : {}),
      };
    }

    const { statuses, errors: statusErrors } = await fetchAllProviderStatuses(
      orders.map((order) => order.providerOrderId)
    );

    let updated = 0;
    let refunded = 0;
    let skipped = 0;
    let errors = 0;
    let refundAnomalies = 0;
    let awaitingProviderRefund = 0;
    let refundedAmount = 0;

    for (const order of orders) {
      try {
        const statusError = statusErrors[order.providerOrderId];

        if (statusError) {
          await markProviderSyncError(
            order,
            statusError,
            /incorrect order|order id|unknown order|invalid order|no status/i.test(
              statusError
            )
              ? "INVALID_ORDER"
              : "SYNC_UNAVAILABLE"
          );
          errors += 1;
          continue;
        }

        const providerStatus = statuses[order.providerOrderId];

        if (!providerStatus) {
          skipped += 1;
          continue;
        }

        const { orderStatus, shouldRefund } = normalizeProviderStatus(
          providerStatus.status
        );

        if (shouldRefund) {
          const outcome = await refundOrderFull(
            order,
            orderStatus === "failed" ? "failed" : "cancelled",
            providerStatus
          );

          updated += 1;

          if (outcome.refunded) {
            refunded += 1;
            refundedAmount = roundMoney(refundedAmount + outcome.amount);
          }

          continue;
        }

        if (orderStatus === "partial") {
          const outcome = await refundOrderPartial(order, providerStatus);

          updated += 1;

          if (outcome.refunded) {
            refunded += 1;
            refundedAmount = roundMoney(refundedAmount + outcome.amount);
          }

          if (outcome.anomaly) {
            refundAnomalies += 1;
            console.error("Partial refund anomaly", {
              orderId: order.id,
              providerOrderId: order.providerOrderId,
              anomaly: outcome.anomaly,
              remains: providerStatus.remains,
              quantity: order.quantity,
            });
          }

          continue;
        }

        // A cancellation that the provider did not honour must not leave a
        // permanent awaiting-refund flag. If it delivered, reflect delivery;
        // otherwise keep waiting for a definitive provider status.
        if (order.status === "cancelled" || order.status === "failed") {
          if (orderStatus === "completed") {
            await updateOrderStatusOnly(order, providerStatus);
            updated += 1;
            continue;
          }

          awaitingProviderRefund += 1;
          skipped += 1;
          continue;
        }

        if (order.status !== orderStatus) {
          await updateOrderStatusOnly(order, providerStatus);
          updated += 1;
          continue;
        }

        if (
          typeof providerStatus.startCount === "number" ||
          typeof providerStatus.remains === "number" ||
          typeof providerStatus.charge === "number"
        ) {
          await updateOrderStatusOnly(order, providerStatus);
          updated += 1;
          continue;
        }

        skipped += 1;
      } catch (orderError) {
        errors += 1;
        console.error(`Failed to sync order ${order.id}:`, orderError);

        await markProviderSyncError(
          order,
          orderError instanceof Error ? orderError.message : "Order sync failed.",
          "SYNC_FAILED"
        ).catch((markError) => {
          console.error("Failed to mark sync error:", markError);
        });
      }
    }

    const providerBalanceAfter = includeProviderBalance
      ? await fetchProviderBalance()
          .then((result) => result.balance)
          .catch((error) => {
            console.error("Failed to read provider balance after sync:", error);
            return null;
          })
      : null;

    if (writeMetrics) {
      const lastError =
        errors > 0
          ? `${errors} order(s) failed to sync.`
          : refundAnomalies > 0
            ? `${refundAnomalies} partial refund anomaly(ies) need review.`
            : null;

      await writeOrderSyncMetrics({
        lastRunAt: FieldValue.serverTimestamp(),
        ...(errors > 0
          ? { lastFailedAt: FieldValue.serverTimestamp() }
          : { lastSuccessfulRunAt: FieldValue.serverTimestamp() }),
        lastRunStatus: errors > 0 ? "failed" : "success",
        lastRunSource: source,
        lastError,
        checked: orders.length,
        updated,
        refunded,
        refundedAmount,
        skipped,
        errors,
        refundAnomalies,
        awaitingProviderRefund,
        providerBalanceBefore,
        providerBalanceAfter,
      });
    }

    return {
      checked: orders.length,
      updated,
      refunded,
      refundedAmount,
      skipped,
      errors,
      refundAnomalies,
      awaitingProviderRefund,
      ...(includeProviderBalance
        ? { providerBalanceBefore, providerBalanceAfter }
        : {}),
    };
  } catch (error) {
    if (writeMetrics) {
      await writeOrderSyncMetrics({
        lastRunAt: FieldValue.serverTimestamp(),
        lastFailedAt: FieldValue.serverTimestamp(),
        lastRunStatus: "failed",
        lastRunSource: source,
        lastError:
          error instanceof ProviderError
            ? error.rawMessage
            : error instanceof Error
              ? error.message
              : "Failed to sync orders.",
      }).catch((metricsError) => {
        console.error("Failed to write order sync metrics:", metricsError);
      });
    }

    throw error;
  }
}
