import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { COLLECTIONS } from "@/lib/constants";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import { isLanguage } from "@/lib/i18n";
import { localize, readApiLanguage } from "@/lib/api-language";

export const runtime = "nodejs";

function getBearerToken(authHeader: string | null): string | null {
  if (!authHeader?.startsWith("Bearer ")) return null;
  return authHeader.slice("Bearer ".length).trim();
}

export async function POST(request: NextRequest) {
  let body: { language?: unknown };
  const requestLanguage = readApiLanguage(request);

  try {
    body = (await request.json()) as { language?: unknown };
  } catch {
    return NextResponse.json(
      { error: localize(requestLanguage, "Invalid request body.", "طلب غير صالح.") },
      { status: 400 }
    );
  }

  const token = getBearerToken(request.headers.get("authorization"));

  if (!token) {
    return NextResponse.json(
      { error: localize(requestLanguage, "Unauthorized.", "يجب تسجيل الدخول للمتابعة.") },
      { status: 401 }
    );
  }

  if (!isLanguage(body.language)) {
    return NextResponse.json(
      { error: localize(requestLanguage, "Invalid language.", "اللغة غير صالحة.") },
      { status: 400 }
    );
  }

  let uid: string;

  try {
    const decoded = await getAdminAuth().verifyIdToken(token);
    uid = decoded.uid;
  } catch (error) {
    console.error("Language preference auth failed:", error);
    return NextResponse.json(
      { error: localize(requestLanguage, "Unauthorized.", "يجب تسجيل الدخول للمتابعة.") },
      { status: 401 }
    );
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
      {
        error: localize(
          requestLanguage,
          "Unable to save the language preference.",
          "تعذّر حفظ تفضيل اللغة."
        ),
      },
      { status: 500 }
    );
  }
}
