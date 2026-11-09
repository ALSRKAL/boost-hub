import { NextRequest, NextResponse } from "next/server";
import { COLLECTIONS, USER_ROLES } from "@/lib/constants";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import { fetchProviderBalance, getProfitMargin, ProviderError } from "@/lib/provider";
import { localize, readApiLanguage } from "@/lib/api-language";

export const runtime = "nodejs";

const CACHE_TTL_MS = 30_000;

let cached: {
  at: number;
  payload: {
    balance: number;
    currency?: string;
    checkedAt: string;
    profitMargin: number;
    profitPercent: number;
  };
} | null = null;

function marginFields() {
  const profitMargin = getProfitMargin();

  return {
    profitMargin,
    profitPercent: Math.round((profitMargin - 1) * 100),
  };
}

function getBearerToken(authHeader: string | null): string | null {
  if (!authHeader?.startsWith("Bearer ")) return null;
  return authHeader.slice("Bearer ".length).trim();
}

export async function GET(request: NextRequest) {
  const language = readApiLanguage(request);
  const token = getBearerToken(request.headers.get("authorization"));

  if (!token) {
    return NextResponse.json(
      { error: localize(language, "Unauthorized.", "يجب تسجيل الدخول للمتابعة.") },
      { status: 401 }
    );
  }

  let uid: string;

  try {
    const decoded = await getAdminAuth().verifyIdToken(token);
    const userSnap = await getAdminDb()
      .collection(COLLECTIONS.users)
      .doc(decoded.uid)
      .get();

    if (!userSnap.exists || userSnap.get("role") !== USER_ROLES.admin) {
      return NextResponse.json(
        { error: localize(language, "Forbidden.", "ليست لديك صلاحية الوصول.") },
        { status: 403 }
      );
    }

    uid = decoded.uid;
  } catch (error) {
    console.error("Provider balance auth failed:", error);
    return NextResponse.json(
      { error: localize(language, "Unauthorized.", "يجب تسجيل الدخول للمتابعة.") },
      { status: 401 }
    );
  }

  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return NextResponse.json(cached.payload, {
      headers: { "Cache-Control": "no-store" },
    });
  }

  try {
    const balance = await fetchProviderBalance();
    const payload = {
      balance: balance.balance,
      currency: balance.currency,
      checkedAt: new Date().toISOString(),
      ...marginFields(),
    };

    cached = { at: Date.now(), payload };

    return NextResponse.json(payload, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Provider balance request failed", {
      adminUid: uid,
      code: error instanceof ProviderError ? error.code : "UNKNOWN",
      rawMessage: error instanceof Error ? error.message : "Unknown error",
    });

    return NextResponse.json(
      {
        error: localize(
          language,
          "Provider balance is unavailable.",
          "رصيد المزود غير متاح."
        ),
        code: error instanceof ProviderError ? error.code : "UNKNOWN",
        // The configured margin does not depend on the provider being online.
        ...marginFields(),
      },
      { status: 502 }
    );
  }
}
