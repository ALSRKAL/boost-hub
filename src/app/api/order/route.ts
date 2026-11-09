import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/firebase-admin";
import { placeOrder } from "@/lib/order-engine";
import type { Language } from "@/lib/i18n";

export const runtime = "nodejs";

interface OrderRequestBody {
  serviceId?: unknown;
  link?: unknown;
  quantity?: unknown;
  userId?: unknown;
  requestId?: unknown;
  comments?: unknown;
  runs?: unknown;
  interval?: unknown;
  lang?: unknown;
}

function getBearerToken(authHeader: string | null): string | null {
  if (!authHeader?.startsWith("Bearer ")) return null;
  return authHeader.slice("Bearer ".length).trim();
}

function optionalPositiveInteger(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export async function POST(request: NextRequest) {
  let body: OrderRequestBody;

  try {
    body = (await request.json()) as OrderRequestBody;
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
    console.error("Failed to verify Firebase ID token:", error);
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const userId = typeof body.userId === "string" ? body.userId.trim() : "";

  if (decodedToken.uid !== userId) {
    return NextResponse.json(
      { error: "You can only place orders for your own account." },
      { status: 403 }
    );
  }

  const quantity = Number(body.quantity);
  const lang: Language = body.lang === "ar" ? "ar" : "en";
  const result = await placeOrder({
    userId,
    userEmail: decodedToken.email ?? "",
    serviceId: typeof body.serviceId === "string" ? body.serviceId : "",
    link: typeof body.link === "string" ? body.link : "",
    quantity: Number.isInteger(quantity) ? quantity : 0,
    comments: typeof body.comments === "string" ? body.comments : null,
    runs:
      body.runs === undefined ? null : optionalPositiveInteger(body.runs),
    interval:
      body.interval === undefined
        ? null
        : optionalPositiveInteger(body.interval),
    requestId: typeof body.requestId === "string" ? body.requestId : "",
    lang,
  });

  return NextResponse.json(result.body, { status: result.status });
}
