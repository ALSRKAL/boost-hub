import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/firebase-admin";
import { syncOrders } from "@/lib/order-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const COOLDOWN_MS = 30_000;
const lastSyncAt = new Map<string, number>();

function getBearerToken(authHeader: string | null): string | null {
  if (!authHeader?.startsWith("Bearer ")) return null;
  return authHeader.slice("Bearer ".length).trim();
}

export async function POST(request: NextRequest) {
  const token = getBearerToken(request.headers.get("authorization"));

  if (!token) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let decodedToken;

  try {
    decodedToken = await getAdminAuth().verifyIdToken(token);
  } catch (error) {
    console.error("Failed to verify Firebase ID token for order sync:", error);
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    userId?: unknown;
  };
  const requestedUserId =
    typeof body.userId === "string" ? body.userId.trim() : "";

  if (requestedUserId && requestedUserId !== decodedToken.uid) {
    return NextResponse.json(
      { error: "You can only sync your own orders." },
      { status: 403 }
    );
  }

  const now = Date.now();
  const previous = lastSyncAt.get(decodedToken.uid) ?? 0;

  if (now - previous < COOLDOWN_MS) {
    return NextResponse.json(
      {
        error: "Order status was checked moments ago. Try again shortly.",
        retryAfterMs: COOLDOWN_MS - (now - previous),
      },
      {
        status: 429,
        headers: { "Cache-Control": "no-store" },
      }
    );
  }

  lastSyncAt.set(decodedToken.uid, now);

  try {
    const summary = await syncOrders({
      userId: decodedToken.uid,
      source: "customer",
    });

    return NextResponse.json(
      { success: true, summary },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Customer order sync failed:", error);

    return NextResponse.json(
      { error: "Order status could not be refreshed." },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
