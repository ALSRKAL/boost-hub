import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { COLLECTIONS } from "@/lib/constants";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import { isLanguage } from "@/lib/i18n";

export const runtime = "nodejs";

function getBearerToken(authHeader: string | null): string | null {
  if (!authHeader?.startsWith("Bearer ")) return null;
  return authHeader.slice("Bearer ".length).trim();
}

export async function POST(request: NextRequest) {
  let body: { language?: unknown };

  try {
    body = (await request.json()) as { language?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const token = getBearerToken(request.headers.get("authorization"));

  if (!token) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (!isLanguage(body.language)) {
    return NextResponse.json({ error: "Invalid language." }, { status: 400 });
  }

  let uid: string;

  try {
    const decoded = await getAdminAuth().verifyIdToken(token);
    uid = decoded.uid;
  } catch (error) {
    console.error("Language preference auth failed:", error);
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    await getAdminDb()
      .collection(COLLECTIONS.users)
      .doc(uid)
      .set(
        {
          preferredLanguage: body.language,
          languageChosen: true,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to save language preference:", error);
    return NextResponse.json(
      { error: "Unable to save the language preference." },
      { status: 500 }
    );
  }
}
