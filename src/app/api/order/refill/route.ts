import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { COLLECTIONS } from "@/lib/constants";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import { createProviderRefill, ProviderError } from "@/lib/provider";
import { canRequestRefill, formatCountdown } from "@/lib/refill-utils";
import { localize, readApiLanguage } from "@/lib/api-language";
import { providerMessageForCode } from "@/lib/error-messages";

export const runtime = "nodejs";

interface RefillRequestBody {
  orderId?: unknown;
  userId?: unknown;
  lang?: unknown;
}

function getBearerToken(authHeader: string | null): string | null {
  if (!authHeader?.startsWith("Bearer ")) return null;
  return authHeader.slice("Bearer ".length).trim();
}

export async function POST(request: NextRequest) {
  let body: RefillRequestBody;
  const requestLanguage = readApiLanguage(request);

  try {
    body = (await request.json()) as RefillRequestBody;
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
    console.error("Failed to verify Firebase ID token for refill:", error);
    return NextResponse.json(
      { error: localize(language, "Unauthorized.", "يجب تسجيل الدخول للمتابعة.") },
      { status: 401 }
    );
  }

  const orderId = typeof body.orderId === "string" ? body.orderId.trim() : "";
  const userId = typeof body.userId === "string" ? body.userId.trim() : "";

  if (!orderId || !userId) {
    return NextResponse.json(
      { error: localize(language, "Order and account are required.", "الطلب والحساب مطلوبان.") },
      { status: 400 }
    );
  }

  if (decodedToken.uid !== userId) {
    return NextResponse.json(
      {
        error: localize(
          language,
          "You can only request refills for your own orders.",
          "يمكنك طلب تعويض لطلباتك فقط."
        ),
      },
      { status: 403 }
    );
  }

  try {
    const adminDb = getAdminDb();
    const orderRef = adminDb.collection(COLLECTIONS.orders).doc(orderId);
    const orderSnap = await orderRef.get();

    if (!orderSnap.exists) {
      return NextResponse.json(
        { error: localize(language, "Order not found.", "لم يتم العثور على الطلب.") },
        { status: 404 }
      );
    }

    const order = orderSnap.data();

    if (!order || order.userId !== userId) {
      return NextResponse.json(
        { error: localize(language, "Order not found.", "لم يتم العثور على الطلب.") },
        { status: 404 }
      );
    }

    if (!order.supportsRefill) {
      return NextResponse.json(
        {
          error: localize(
            language,
            "This service does not support refills.",
            "هذه الخدمة لا تدعم التعويض."
          ),
        },
        { status: 400 }
      );
    }

    if (
      typeof order.providerOrderId !== "string" ||
      order.providerOrderId.trim().length === 0
    ) {
      return NextResponse.json(
        {
          error: localize(
            language,
            "This order has no provider reference yet. Try again after the next sync.",
            "لا يوجد مرجع مزود لهذا الطلب بعد. حاول بعد المزامنة التالية."
          ),
        },
        { status: 400 }
      );
    }

    const decision = canRequestRefill(
      {
        supportsRefill: Boolean(order.supportsRefill),
        status: String(order.status ?? ""),
        completedAt: order.completedAt,
        refillAvailableAt: order.refillAvailableAt,
        refillRequestedAt: order.refillRequestedAt,
        refillWindowHours:
          typeof order.refillWindowHours === "number"
            ? order.refillWindowHours
            : null,
      },
      Date.now()
    );

    if (!decision.allowed) {
      const messages: Record<string, string> = {
        "no-refill": localize(
          language,
          "This service does not support refills.",
          "هذه الخدمة لا تدعم التعويض."
        ),
        inactive: localize(
          language,
          "Cancelled or failed orders cannot be refilled.",
          "لا يمكن تعويض الطلبات الملغاة أو الفاشلة."
        ),
        "not-completed": localize(
          language,
          "Refill becomes available after the order completes.",
          "يتاح التعويض بعد اكتمال الطلب."
        ),
        expired: localize(
          language,
          "The refill window for this order has expired.",
          "انتهت مدة ضمان التعويض لهذا الطلب."
        ),
        cooldown:
          decision.availableAtMs !== undefined
            ? localize(
                language,
                `Next refill available in ${formatCountdown(
                  decision.availableAtMs - Date.now()
                )}.`,
                `التعويض التالي متاح بعد ${formatCountdown(
                  decision.availableAtMs - Date.now(),
                  language
                )}.`
              )
            : localize(
                language,
                "This order was refilled recently.",
                "تم تعويض هذا الطلب مؤخرًا."
              ),
        waiting:
          decision.availableAtMs !== undefined
            ? localize(
                language,
                `Refill will be available in ${formatCountdown(
                  decision.availableAtMs - Date.now()
                )}.`,
                `سيتاح التعويض بعد ${formatCountdown(
                  decision.availableAtMs - Date.now(),
                  language
                )}.`
              )
            : localize(
                language,
                "Refill is not available yet.",
                "التعويض غير متاح بعد."
              ),
      };

      return NextResponse.json(
        {
          error:
            messages[decision.reason ?? ""] ??
            localize(language, "Refill is not available.", "التعويض غير متاح."),
        },
        { status: 400 }
      );
    }

    let refillRequestId: string;

    try {
      refillRequestId = await createProviderRefill(order.providerOrderId);
    } catch (providerError) {
      const classified =
        providerError instanceof ProviderError
          ? providerError
          : new ProviderError({
              code: "UNKNOWN",
              rawMessage:
                providerError instanceof Error
                  ? providerError.message
                  : "Provider refill failed.",
              operation: "refill",
            });

      console.error("Provider refill error", {
        orderId,
        providerOrderId: order.providerOrderId,
        code: classified.code,
        rawMessage: classified.rawMessage,
        httpStatus: classified.httpStatus,
        ambiguous: classified.ambiguous,
      });

      const currentCount =
        typeof order.refillCount === "number" ? order.refillCount : 0;

      // Providers often report an already-processed refill. Record the attempt
      // so the 24h cooldown starts instead of allowing an infinite retry loop.
      if (classified.code === "ALREADY_REFILLED") {
        await orderRef.update({
          refillRequestId: `provider-refill-${order.providerOrderId}-${Date.now()}`,
          refillStatus: "requested",
          refillCount: currentCount + 1,
          refillRequestedAt: FieldValue.serverTimestamp(),
          refillUpdatedAt: FieldValue.serverTimestamp(),
          refillErrorMessage: null,
          refillErrorCode: null,
        });

        return NextResponse.json({
          success: true,
          note: localize(
            language,
            "The provider indicates this order was already refilled for this period.",
            "يشير المزود إلى أن هذا الطلب تم تعويضه لهذه الفترة مسبقًا."
          ),
        });
      }

      // A timeout/reset may mean the provider accepted the refill. Start the
      // cooldown and flag it instead of allowing a duplicate refill.
      if (classified.ambiguous || !classified.safeToRefund) {
        await orderRef.update({
          refillRequestId: `ambiguous-refill-${order.providerOrderId}-${Date.now()}`,
          refillStatus: "requested",
          refillCount: currentCount + 1,
          refillRequestedAt: FieldValue.serverTimestamp(),
          refillUpdatedAt: FieldValue.serverTimestamp(),
          refillErrorMessage: classified.customerMessage,
          refillErrorCode: classified.code,
        });

        return NextResponse.json(
          {
            success: false,
            pendingConfirmation: true,
            message: localize(
              language,
              "The provider did not confirm the refill. Do not retry; support will verify it.",
              "لم يؤكد المزود التعويض. لا تعِد المحاولة؛ سيتحقق الدعم منه."
            ),
          },
          { status: 202 }
        );
      }

      await orderRef
        .update({
          refillStatus: "failed",
          refillErrorMessage: classified.customerMessage,
          refillErrorCode: classified.code,
          refillUpdatedAt: FieldValue.serverTimestamp(),
        })
        .catch((updateError) => {
          console.error("Failed to store refill error state:", updateError);
        });

      return NextResponse.json(
        {
          error:
            providerMessageForCode(classified.code, language) ??
            localize(
              language,
              classified.customerMessage,
              "تعذّر طلب التعويض. حاول مرة أخرى."
            ),
          code: classified.code,
        },
        { status: 400 }
      );
    }

    const currentCount =
      typeof order.refillCount === "number" ? order.refillCount : 0;

    await orderRef.update({
      refillRequestId,
      refillStatus: "requested",
      refillCount: currentCount + 1,
      refillRequestedAt: FieldValue.serverTimestamp(),
      refillUpdatedAt: FieldValue.serverTimestamp(),
      refillErrorMessage: null,
      refillErrorCode: null,
    });

    return NextResponse.json({ success: true, refillRequestId });
  } catch (error) {
    console.error("Failed to create refill request:", error);
    return NextResponse.json(
      {
        error: localize(
          language,
          "Unable to request a refill right now.",
          "تعذّر طلب التعويض حاليًا. حاول مرة أخرى."
        ),
      },
      { status: 500 }
    );
  }
}
