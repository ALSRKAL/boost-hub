import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { COLLECTIONS, formatCurrency } from "@/lib/constants";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import { sendAdminDepositNotification } from "@/lib/push";
import { roundMoney } from "@/lib/money";
import { localize, readApiLanguage } from "@/lib/api-language";

export const runtime = "nodejs";

interface DepositRequestBody {
  userId?: unknown;
  amount?: unknown;
  utr?: unknown;
  lang?: unknown;
}

const UTR_PATTERN = /^[A-Z0-9-]{8,40}$/;
const MIN_DEPOSIT = 10;
const MAX_DEPOSIT = 100_000;

function getBearerToken(authHeader: string | null): string | null {
  if (!authHeader?.startsWith("Bearer ")) return null;
  return authHeader.slice("Bearer ".length).trim();
}

export async function POST(request: NextRequest) {
  let body: DepositRequestBody;
  const requestLanguage = readApiLanguage(request);

  try {
    body = (await request.json()) as DepositRequestBody;
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
    console.error("Failed to verify Firebase ID token for deposit:", error);
    return NextResponse.json(
      { error: localize(language, "Unauthorized.", "يجب تسجيل الدخول للمتابعة.") },
      { status: 401 }
    );
  }

  const userId = typeof body.userId === "string" ? body.userId.trim() : "";
  const utr = typeof body.utr === "string" ? body.utr.trim().toUpperCase() : "";
  const rawAmount = Number(body.amount);
  const amount = roundMoney(rawAmount);

  if (!userId || !utr || !Number.isFinite(rawAmount)) {
    return NextResponse.json(
      {
        error: localize(
          language,
          "Amount and transaction reference are required.",
          "المبلغ ومرجع العملية مطلوبان."
        ),
      },
      { status: 400 }
    );
  }

  if (decodedToken.uid !== userId) {
    return NextResponse.json(
      {
        error: localize(
          language,
          "You can only create deposits for your own account.",
          "يمكنك إنشاء إيداعات لحسابك فقط."
        ),
      },
      { status: 403 }
    );
  }

  if (!UTR_PATTERN.test(utr)) {
    return NextResponse.json(
      {
        error: localize(
          language,
          "Enter a valid transaction reference (8–40 letters, digits, or hyphens).",
          "أدخل مرجع عملية صالحًا (من 8 إلى 40 حرفًا أو رقمًا أو شرطة)."
        ),
      },
      { status: 400 }
    );
  }

  if (amount < MIN_DEPOSIT || amount > MAX_DEPOSIT) {
    return NextResponse.json(
      {
        error: localize(
          language,
          `Deposit amount must be between ${formatCurrency(
            MIN_DEPOSIT
          )} and ${formatCurrency(MAX_DEPOSIT)}.`,
          `يجب أن يكون مبلغ الإيداع بين ${formatCurrency(
            MIN_DEPOSIT
          )} و${formatCurrency(MAX_DEPOSIT)}.`
        ),
      },
      { status: 400 }
    );
  }

  try {
    const adminDb = getAdminDb();
    // Deterministic ID makes retries and duplicate UTR submissions idempotent.
    const depositRef = adminDb
      .collection(COLLECTIONS.deposits)
      .doc(`${userId}_${utr}`);
    const existing = await depositRef.get();

    if (existing.exists) {
      return NextResponse.json(
        {
          error: localize(
            language,
            "This transaction reference has already been submitted. Check your deposit history.",
            "رقم المرجع (UTR) هذا تم إرساله مسبقًا. راجع سجل الإيداعات."
          ),
        },
        { status: 409 }
      );
    }

    await depositRef.set({
      userId,
      userEmail: decodedToken.email ?? "",
      amount,
      utr,
      status: "pending",
      createdAt: FieldValue.serverTimestamp(),
    });

    // Notification delivery must not delay or fail the deposit response.
    void sendAdminDepositNotification({
      depositId: depositRef.id,
      userEmail: decodedToken.email ?? "A customer",
      amount,
    });

    return NextResponse.json({
      success: true,
      depositId: depositRef.id,
      status: "pending",
    });
  } catch (error) {
    console.error("Failed to create deposit:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? localize(
                language,
                error.message,
                "تعذّر إرسال الإيداع حاليًا. حاول مرة أخرى."
              )
            : localize(
                language,
                "Unable to submit the deposit right now.",
                "تعذّر إرسال الإيداع حاليًا. حاول مرة أخرى."
              ),
      },
      { status: 500 }
    );
  }
}
