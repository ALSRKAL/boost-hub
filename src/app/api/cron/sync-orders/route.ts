import { NextRequest, NextResponse } from "next/server";
import { COLLECTIONS, USER_ROLES } from "@/lib/constants";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import { syncOrders, type SyncSource } from "@/lib/order-sync";

export const runtime = "nodejs";

async function isAuthorizedAdmin(request: NextRequest): Promise<boolean> {
  const authHeader = request.headers.get("authorization");

  if (!authHeader?.startsWith("Bearer ")) return false;

  const token = authHeader.slice("Bearer ".length).trim();

  try {
    const decoded = await getAdminAuth().verifyIdToken(token);
    const userSnap = await getAdminDb()
      .collection(COLLECTIONS.users)
      .doc(decoded.uid)
      .get();

    return userSnap.exists && userSnap.get("role") === USER_ROLES.admin;
  } catch (error) {
    console.error("Failed to verify admin token for order sync:", error);
    return false;
  }
}

async function isAuthorizedRequest(request: NextRequest): Promise<boolean> {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");

  if (cronSecret && authHeader === `Bearer ${cronSecret}`) return true;

  const expectedSecret = process.env.SYNC_ORDERS_SECRET;
  const providedSecret =
    request.headers.get("x-sync-secret") ?? request.nextUrl.searchParams.get("secret");

  if (expectedSecret && providedSecret === expectedSecret) return true;

  return isAuthorizedAdmin(request);
}

function getRequestSource(request: NextRequest): SyncSource {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");

  if (cronSecret && authHeader === `Bearer ${cronSecret}`) return "cron";

  const expectedSecret = process.env.SYNC_ORDERS_SECRET;
  const providedSecret =
    request.headers.get("x-sync-secret") ?? request.nextUrl.searchParams.get("secret");

  if (expectedSecret && providedSecret === expectedSecret) return "sync_secret";

  return "admin";
}

export async function GET(request: NextRequest) {
  if (!(await isAuthorizedRequest(request))) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const requestSource = getRequestSource(request);

  try {
    const summary = await syncOrders({
      source: requestSource,
      includeProviderBalance: true,
      writeMetrics: true,
    });

    return NextResponse.json({ success: true, summary });
  } catch (error) {
    console.error("Order sync failed:", error);

    return NextResponse.json(
      { error: "Order sync failed. Check the server logs for the provider error." },
      { status: 500 }
    );
  }
}
