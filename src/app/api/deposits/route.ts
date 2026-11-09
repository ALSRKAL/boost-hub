import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { COLLECTIONS, formatCurrency } from "@/lib/constants";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import { sendAdminDepositNotification } from "@/lib/push";
import { roundMoney } from "@/lib/money";

export const runtime = "nodejs";

interface DepositRequestBody {
  userId?: unknown;
  amount?: unknown;
  utr?: unknown;
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

  try {
    body = (await request.json()) as DepositRequestBody;
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
    console.error("Failed to verify Firebase ID token for deposit:", error);
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const userId = typeof body.userId === "string" ? body.userId.trim() : "";
  const utr = typeof body.utr === "string" ? body.utr.trim().toUpperCase() : "";
  const rawAmount = Number(body.amount);
  const amount = roundMoney(rawAmount);

  if (!userId || !utr || !Number.isFinite(rawAmount)) {
    return NextResponse.json(
      { error: "Amount and transaction reference are required." },
      { status: 400 }
    );
  }

  if (decodedToken.uid !== userId) {
    return NextResponse.json(
      { error: "You can only create deposits for your own account." },
      { status: 403 }
    );
  }

  if (!UTR_PATTERN.test(utr)) {
    return NextResponse.json(
      {
        error:
          "Enter a valid transaction reference (8–40 letters, digits, or hyphens).",
      },
      { status: 400 }
    );
  }

  if (amount < MIN_DEPOSIT || amount > MAX_DEPOSIT) {
    return NextResponse.json(
      {
        error: `Deposit amount must be between ${formatCurrency(
          MIN_DEPOSIT
        )} and ${formatCurrency(MAX_DEPOSIT)}.`,
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
          error:
            "This transaction reference has already been submitted. Check your deposit history.",
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
            ? error.message
            : "Unable to submit the deposit right now.",
      },
      { status: 500 }
    );
  }
}
