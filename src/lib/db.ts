import {
  collection,
  doc,
  onSnapshot,
  query,
  where,
  orderBy,
  runTransaction,
  increment,
  Timestamp,
  type Unsubscribe,
} from "firebase/firestore";
import { getFirebaseDb } from "@/lib/firebase";
import { COLLECTIONS, formatDateTime, type UserRole } from "@/lib/constants";
import { roundMoney } from "@/lib/money";

// ============================================================
// Document schemas
// ============================================================

export type DepositStatus = "pending" | "approved" | "rejected";

export type OrderStatus =
  | "pending"
  | "processing"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "partial"
  | "failed";

export interface DepositDoc {
  id: string;
  userId: string;
  userEmail: string;
  amount: number;
  utr: string;
  status: DepositStatus;
  createdAt: Timestamp;
  reviewedAt?: Timestamp;
  reviewedBy?: string;
  notes?: string;
}

export interface OrderDoc {
  id: string;
  userId: string;
  userEmail: string;
  serviceId: string;
  serviceName: string;
  category: string;
  link: string;
  quantity: number;
  charge: number;
  providerOrderId?: string;
  providerCharge?: number;
  profitMargin?: number;
  supportsRefill?: boolean;
  supportsCancel?: boolean;
  comments?: string;
  runs?: number;
  interval?: number;
  refillRequestId?: string;
  refillStatus?: "requested" | "processing" | "completed" | "failed";
  refillCount?: number;
  refillErrorMessage?: string | null;
  refillErrorCode?: string | null;
  refundState?:
    | "none"
    | "awaiting_provider_refund"
    | "partially_refunded"
    | "refunded_to_user";
  providerLastStatus?: string;
  providerRefundConfirmedAt?: Timestamp;
  refundedToUserAt?: Timestamp;
  refundedAmount?: number;
  refundPartialRemains?: number;
  refundAnomaly?: string | null;
  providerError?: string | null;
  providerErrorCode?: string | null;
  providerErrorAt?: Timestamp;
  dismissedProviderError?: string | null;
  dismissedProviderErrorCode?: string | null;
  reviewDismissedAt?: Timestamp;
  adminResolution?: {
    action: "refund_cancel" | "attach_provider" | "dismiss_review";
    adminUid: string;
    at: Timestamp;
  };
  previousProviderOrderId?: string;
  needsReconciliation?: boolean;
  lastSyncedAt?: Timestamp;
  completedAt?: Timestamp;
  refillWindowHours?: number | null;
  refillAvailableAt?: Timestamp;
  status: OrderStatus;
  startCount?: number;
  remains?: number;
  createdAt: Timestamp;
  updatedAt?: Timestamp;
  refillRequestedAt?: Timestamp;
  refillUpdatedAt?: Timestamp;
  cancelRequestedAt?: Timestamp;
  cancelUpdatedAt?: Timestamp;
  cancelErrorMessage?: string | null;
  cancelErrorCode?: string | null;
  requestId?: string;
}

export interface UserDoc {
  uid: string;
  email: string;
  displayName: string;
  balance: number;
  role: UserRole;
  createdAt?: Timestamp;
}

export type OrderSyncRunStatus = "success" | "failed";
export type OrderSyncRunSource = "cron" | "sync_secret" | "admin";

export interface OrderSyncMetricDoc {
  id: string;
  lastRunAt?: Timestamp;
  lastSuccessfulRunAt?: Timestamp;
  lastFailedAt?: Timestamp;
  lastRunStatus?: OrderSyncRunStatus;
  lastRunSource?: OrderSyncRunSource;
  checked?: number;
  updated?: number;
  refunded?: number;
  refundedAmount?: number;
  refundAnomalies?: number;
  errors?: number;
  skipped?: number;
  awaitingProviderRefund?: number;
  providerBalanceBefore?: number | null;
  providerBalanceAfter?: number | null;
  lastError?: string | null;
}

// ============================================================
// Generic subscription helper
// ============================================================

function mapDocs<T>(snapshot: { docs: Array<{ id: string; data(): unknown }> }): T[] {
  return snapshot.docs.map((item) => ({ id: item.id, ...(item.data() as object) }) as T);
}

// ============================================================
// Deposits
// ============================================================

export function subscribeAllDeposits(
  onChange: (deposits: DepositDoc[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const db = getFirebaseDb();
  const q = query(collection(db, COLLECTIONS.deposits), orderBy("createdAt", "desc"));

  return onSnapshot(
    q,
    (snap) => onChange(mapDocs<DepositDoc>(snap)),
    (error) => onError?.(error)
  );
}

export function subscribeUserDeposits(
  userId: string,
  onChange: (deposits: DepositDoc[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const db = getFirebaseDb();
  const q = query(
    collection(db, COLLECTIONS.deposits),
    where("userId", "==", userId),
    orderBy("createdAt", "desc")
  );

  return onSnapshot(
    q,
    (snap) => onChange(mapDocs<DepositDoc>(snap)),
    (error) => onError?.(error)
  );
}

/**
 * Approve a pending deposit and credit the user in one transaction.
 * The status check inside the transaction makes retries idempotent.
 */
export async function approveDeposit(
  deposit: DepositDoc,
  adminUid: string
): Promise<void> {
  const db = getFirebaseDb();
  const depositRef = doc(db, COLLECTIONS.deposits, deposit.id);
  const userRef = doc(db, COLLECTIONS.users, deposit.userId);

  await runTransaction(db, async (transaction) => {
    const [depositSnap, userSnap] = await Promise.all([
      transaction.get(depositRef),
      transaction.get(userRef),
    ]);

    if (!depositSnap.exists()) {
      throw new Error("This deposit no longer exists.");
    }

    if (depositSnap.get("status") !== "pending") {
      throw new Error("This deposit has already been reviewed.");
    }

    if (!userSnap.exists()) {
      throw new Error("The deposit owner no longer exists.");
    }

    const amount = Number(depositSnap.get("amount") ?? 0);

    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error("This deposit has an invalid amount.");
    }

    transaction.update(depositRef, {
      status: "approved" satisfies DepositStatus,
      reviewedAt: Timestamp.now(),
      reviewedBy: adminUid,
    });

    transaction.update(userRef, {
      balance: increment(roundMoney(amount)),
    });
  });
}

export async function rejectDeposit(
  depositId: string,
  adminUid: string,
  notes?: string
): Promise<void> {
  const db = getFirebaseDb();
  const depositRef = doc(db, COLLECTIONS.deposits, depositId);

  await runTransaction(db, async (transaction) => {
    const depositSnap = await transaction.get(depositRef);

    if (!depositSnap.exists()) {
      throw new Error("This deposit no longer exists.");
    }

    if (depositSnap.get("status") !== "pending") {
      throw new Error("This deposit has already been reviewed.");
    }

    transaction.update(depositRef, {
      status: "rejected" satisfies DepositStatus,
      reviewedAt: Timestamp.now(),
      reviewedBy: adminUid,
      ...(notes ? { notes } : {}),
    });
  });
}

// ============================================================
// Orders
// ============================================================

export function subscribeUserOrders(
  userId: string,
  onChange: (orders: OrderDoc[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const db = getFirebaseDb();
  const q = query(
    collection(db, COLLECTIONS.orders),
    where("userId", "==", userId),
    orderBy("createdAt", "desc")
  );

  return onSnapshot(
    q,
    (snap) => onChange(mapDocs<OrderDoc>(snap)),
    (error) => onError?.(error)
  );
}

export function subscribeAllOrders(
  onChange: (orders: OrderDoc[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const db = getFirebaseDb();
  const q = query(collection(db, COLLECTIONS.orders), orderBy("createdAt", "desc"));

  return onSnapshot(
    q,
    (snap) => onChange(mapDocs<OrderDoc>(snap)),
    (error) => onError?.(error)
  );
}

// ============================================================
// Users
// ============================================================

export function subscribeAllUsers(
  onChange: (users: UserDoc[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const db = getFirebaseDb();
  const q = query(collection(db, COLLECTIONS.users), orderBy("createdAt", "desc"));

  return onSnapshot(
    q,
    (snap) =>
      onChange(
        snap.docs.map((item) => ({ uid: item.id, ...item.data() }) as UserDoc)
      ),
    (error) => onError?.(error)
  );
}

// ============================================================
// System metrics
// ============================================================

export function subscribeOrderSyncMetrics(
  onChange: (metrics: OrderSyncMetricDoc | null) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const db = getFirebaseDb();
  const metricsRef = doc(db, COLLECTIONS.systemMetrics, "order_sync");

  return onSnapshot(
    metricsRef,
    (snap) => {
      if (!snap.exists()) {
        onChange(null);
        return;
      }

      onChange({ id: snap.id, ...(snap.data() as Omit<OrderSyncMetricDoc, "id">) });
    },
    (error) => onError?.(error)
  );
}

// ============================================================
// Helpers
// ============================================================

export function timestampToDate(ts: Timestamp | undefined | null): string {
  if (!ts) return "—";

  try {
    return formatDateTime(ts.toDate());
  } catch {
    return "—";
  }
}
