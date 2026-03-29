import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { COLLECTIONS } from "@/lib/constants";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import { sendAdminDepositNotification } from "@/lib/push";

export const runtime = "nodejs";

interface DepositRequestBody {
  userId?: unknown;
  amount?: unknown;
  utr?: unknown;
}

function getBearerToken(authHeader: string | null): string | null {
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }

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
  const utr = typeof body.utr === "string" ? body.utr.trim() : "";
  const amount = Number(body.amount);

  if (!userId || !utr || !Number.isFinite(amount)) {
    return NextResponse.json(
      { error: "userId, amount, and utr are required." },
      { status: 400 }
    );
  }

  if (decodedToken.uid !== userId) {
    return NextResponse.json(
      { error: "You can only create deposits for your own account." },
      { status: 403 }
    );
  }

  if (amount < 10 || amount > 100000) {
    return NextResponse.json(
      { error: "Deposit amount must be between ₹10 and ₹100000." },
      { status: 400 }
    );
  }

  try {
    const adminDb = getAdminDb();
    const depositRef = adminDb.collection(COLLECTIONS.deposits).doc();

    await depositRef.set({
      userId,
      userEmail: decodedToken.email ?? "",
      amount: Number(amount.toFixed(2)),
      utr,
      status: "pending",
      createdAt: FieldValue.serverTimestamp(),
    });

    await sendAdminDepositNotification({
      depositId: depositRef.id,
      userEmail: decodedToken.email ?? "مستخدم",
      amount: Number(amount.toFixed(2)),
    });

    return NextResponse.json({
      success: true,
      depositId: depositRef.id,
    });
  } catch (error) {
    console.error("Failed to create deposit:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to create deposit right now.",
      },
      { status: 500 }
    );
  }
}
