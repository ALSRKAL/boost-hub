import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/firebase-admin";
import { placeOrder } from "@/lib/order-engine";
import { readApiLanguage, localize } from "@/lib/api-language";
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
  const requestLanguage = readApiLanguage(request);

  try {
    body = (await request.json()) as OrderRequestBody;
  } catch {
    return NextResponse.json(
      { error: localize(requestLanguage, "Invalid request body.", "طلب غير صالح.") },
      { status: 400 }
    );
  }

  const language = readApiLanguage(request, body.lang);
  const token = getBearerToken(request.headers.get("authorization"));

  if (!token) {
    return NextResponse.json(
      { error: localize(language, "Unauthorized.", "يجب تسجيل الدخول للمتابعة.") },
      { status: 401 }
    );
  }

  let decodedToken;

  try {
    decodedToken = await getAdminAuth().verifyIdToken(token);
  } catch (error) {
    console.error("Failed to verify Firebase ID token:", error);
    return NextResponse.json(
      { error: localize(language, "Unauthorized.", "يجب تسجيل الدخول للمتابعة.") },
      { status: 401 }
    );
  }

  const userId = typeof body.userId === "string" ? body.userId.trim() : "";

  if (decodedToken.uid !== userId) {
    return NextResponse.json(
      {
        error: localize(
          language,
          "You can only place orders for your own account.",
          "يمكنك إنشاء طلبات لحسابك فقط."
        ),
      },
      { status: 403 }
    );
  }

  const quantity = Number(body.quantity);
  const lang: Language = language;
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
