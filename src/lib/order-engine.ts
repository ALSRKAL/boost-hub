import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { COLLECTIONS } from "@/lib/constants";
import { getAdminDb } from "@/lib/firebase-admin";
import {
  calculateSellingRate,
  calculateTotalCost,
  createProviderOrder,
  fetchProviderServices,
  getProfitMargin,
  mapProviderServiceToPublic,
  parseProviderNumber,
  ProviderError,
  type ProviderService,
} from "@/lib/provider";
import {
  parseRefillWindowHours,
  LIFETIME_REFILL_HOURS,
} from "@/lib/refill-utils";
import { isCustomCommentsService } from "@/lib/services";
import { validateServiceLink } from "@/lib/service-guidance";
import { pick, type Language } from "@/lib/i18n";
import { calculateCharge, fromMinor, toMinor } from "@/lib/money";
import { providerMessageForCode } from "@/lib/error-messages";

const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;
const MAX_LINK_LENGTH = 2048;
const MAX_COMMENT_LINES = 300;

export interface PlaceOrderInput {
  userId: string;
  userEmail?: string;
  serviceId: string;
  link: string;
  quantity: number;
  comments?: string | null;
  runs?: number | null;
  interval?: number | null;
  requestId: string;
  lang?: Language;
}

export interface PlaceOrderResult {
  status: number;
  body: Record<string, unknown>;
}

function toPositiveInteger(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

function findRequestedService(
  services: ProviderService[],
  serviceId: string
): ProviderService | null {
  return (
    services.find((service) => String(service.service ?? "") === serviceId) ?? null
  );
}

export function isValidTargetLink(link: string): boolean {
  if (link.length < 3 || link.length > MAX_LINK_LENGTH) return false;
  if (/\s/.test(link) || /[<>]/.test(link)) return false;

  const schemeMatch = link.match(/^([a-z][a-z0-9+.-]*):/i);

  if (schemeMatch) {
    const scheme = schemeMatch[1].toLowerCase();
    return scheme === "http" || scheme === "https";
  }

  return true;
}

function normalizeComments(
  raw: unknown,
  language: Language = "en"
): {
  comments: string | null;
  error?: string;
} {
  const msg = (en: string, ar: string) =>
    language === "ar" ? ar : en;

  if (typeof raw !== "string" || !raw.trim()) {
    return { comments: null };
  }

  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return { comments: null };
  }

  if (lines.length > MAX_COMMENT_LINES) {
    return {
      comments: null,
      error: msg(
        `Custom comments are limited to ${MAX_COMMENT_LINES} lines.`,
        `التعليقات المخصصة محدودة بـ ${MAX_COMMENT_LINES} سطرًا.`
      ),
    };
  }

  if (lines.some((line) => line.length > 500)) {
    return {
      comments: null,
      error: msg(
        "Each comment must be 500 characters or fewer.",
        "يجب ألا يزيد كل تعليق عن 500 حرف."
      ),
    };
  }

  return { comments: lines.join("\n") };
}

/**
 * Single transactional order path used by both /api/order and the AI agent.
 * The caller must already have verified that `userId` belongs to the requester.
 */
export async function placeOrder(
  input: PlaceOrderInput
): Promise<PlaceOrderResult> {
  const serviceId = input.serviceId.trim();
  const link = input.link.trim();
  const userId = input.userId.trim();
  const requestId = input.requestId.trim();
  const quantity = toPositiveInteger(input.quantity);
  const lang = input.lang === "ar" ? "ar" : "en";
  const msg = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const runs = input.runs ?? null;
  const interval = input.interval ?? null;

  if (!serviceId || !link || !userId || quantity === null) {
    return {
      status: 400,
      body: {
        error: msg(
          "Service, target link, quantity, and account are required.",
          "الخدمة ورابط الهدف والكمية والحساب مطلوبة."
        ),
      },
    };
  }

  if (!REQUEST_ID_PATTERN.test(requestId)) {
    return {
      status: 400,
      body: {
        error: msg(
          "Invalid request identifier. Refresh the page and try again.",
          "معرّف الطلب غير صالح. حدّث الصفحة وحاول مرة أخرى."
        ),
      },
    };
  }

  if (!isValidTargetLink(link)) {
    return {
      status: 400,
      body: {
        error: msg(
          "Enter a valid target: a full https:// link or a username with no spaces.",
          "أدخل هدفًا صالحًا: رابط https:// كامل أو اسم مستخدم بدون مسافات."
        ),
      },
    };
  }

  try {
    const providerServices = await fetchProviderServices();
    const requestedService = findRequestedService(providerServices, serviceId);

    if (!requestedService) {
      return {
        status: 404,
        body: {
          error: msg(
            "The selected service is no longer available. Refresh the catalog.",
            "الخدمة المحددة لم تعد متاحة. حدّث الكتالوج."
          ),
        },
      };
    }

    const publicService = mapProviderServiceToPublic(requestedService);

    if (!publicService) {
      return {
        status: 400,
        body: {
          error: msg(
            "The selected service has incomplete provider data.",
            "بيانات الخدمة المحددة غير مكتملة لدى المزود."
          ),
        },
      };
    }

    const linkCheck = validateServiceLink(link, {
      id: serviceId,
      name: requestedService.name?.trim() || publicService.name,
      category: requestedService.category?.trim() || publicService.category,
      type: publicService.type,
      refill: publicService.refill,
      cancel: publicService.cancel,
      dripfeed: publicService.dripfeed,
      averageTime: publicService.averageTime,
      min: publicService.min,
      max: publicService.max,
      price: publicService.price,
    });

    if (linkCheck.error) {
      return {
        status: 400,
        body: {
          error: pick(linkCheck.error, lang),
          code: "LINK_TARGET_MISMATCH",
        },
      };
    }

    const providerRate = parseProviderNumber(requestedService.rate);
    const serviceMin = Math.max(
      1,
      Math.trunc(parseProviderNumber(requestedService.min, 1))
    );
    const serviceMax = Math.max(
      serviceMin,
      Math.trunc(parseProviderNumber(requestedService.max, serviceMin))
    );

    if (quantity < serviceMin || quantity > serviceMax) {
      return {
        status: 400,
        body: {
          error: msg(
            `Quantity for this service must be between ${serviceMin.toLocaleString(
              "en-IN"
            )} and ${serviceMax.toLocaleString("en-IN")}.`,
            `يجب أن تكون الكمية لهذه الخدمة بين ${serviceMin.toLocaleString(
              "en-IN"
            )} و${serviceMax.toLocaleString("en-IN")}.`
          ),
        },
      };
    }

    const commentService = isCustomCommentsService(publicService.type);
    const normalizedComments = normalizeComments(input.comments, lang);

    if (normalizedComments.error) {
      return { status: 400, body: { error: normalizedComments.error } };
    }

    if (commentService && !normalizedComments.comments) {
      return {
        status: 400,
        body: {
          error: msg(
            "This service requires custom comments, one per line.",
            "هذه الخدمة تتطلب تعليقات مخصصة، تعليقًا واحدًا في كل سطر."
          ),
        },
      };
    }

    if (commentService && normalizedComments.comments) {
      const lineCount = normalizedComments.comments.split("\n").length;

      if (lineCount !== quantity) {
        return {
          status: 400,
          body: {
            error: msg(
              `Quantity must equal the number of comment lines (${lineCount}).`,
              `يجب أن تساوي الكمية عدد أسطر التعليقات (${lineCount}).`
            ),
          },
        };
      }
    }

    if (!commentService && normalizedComments.comments) {
      return {
        status: 400,
        body: {
          error: msg(
            "This service does not accept custom comments.",
            "هذه الخدمة لا تقبل تعليقات مخصصة."
          ),
        },
      };
    }

    const supportsDripfeed = publicService.dripfeed;

    if (runs !== null || interval !== null) {
      if (!supportsDripfeed) {
        return {
          status: 400,
          body: {
            error: msg(
              "This service does not support drip-feed.",
              "هذه الخدمة لا تدعم التسليم المرحلي."
            ),
          },
        };
      }

      if (runs === null || interval === null || runs < 2) {
        return {
          status: 400,
          body: {
            error: msg(
              "Drip-feed needs at least 2 runs and a positive interval.",
              "التسليم المرحلي يحتاج إلى دفعتين على الأقل وفاصل زمني موجب."
            ),
          },
        };
      }

      if (runs > quantity) {
        return {
          status: 400,
          body: {
            error: msg(
              "Drip-feed runs cannot exceed the quantity.",
              "لا يمكن أن يتجاوز عدد الدفعات الكمية."
            ),
          },
        };
      }

      if (interval > 1440) {
        return {
          status: 400,
          body: {
            error: msg(
              "Drip-feed interval cannot exceed 1440 minutes.",
              "لا يمكن أن يتجاوز الفاصل الزمني 1440 دقيقة."
            ),
          },
        };
      }
    }

    const ourSellingRate = calculateSellingRate(providerRate);
    const totalCost = calculateCharge(ourSellingRate, quantity, {
      minimumMinor: 1,
    });

    if (totalCost <= 0) {
      return {
        status: 400,
        body: {
          error: msg(
            "This service has an invalid price. Contact support.",
            "سعر هذه الخدمة غير صالح. تواصل مع الدعم."
          ),
        },
      };
    }

    const providerCharge = calculateTotalCost(providerRate, quantity);
    const adminDb = getAdminDb();
    const userRef = adminDb.collection(COLLECTIONS.users).doc(userId);
    const orderRef = adminDb.collection(COLLECTIONS.orders).doc(requestId);

    let duplicate = false;
    let balanceAfter = 0;
    let existingCharge = totalCost;
    let existingProviderOrderId: string | undefined;
    let existingStatus = "pending";

    try {
      await adminDb.runTransaction(async (transaction) => {
        const [userSnap, orderSnap] = await Promise.all([
          transaction.get(userRef),
          transaction.get(orderRef),
        ]);

        if (orderSnap.exists) {
          if (
            orderSnap.get("userId") !== userId ||
            String(orderSnap.get("serviceId")) !== serviceId
          ) {
            throw new Error("REQUEST_CONFLICT");
          }

          const previousStatus = String(orderSnap.get("status") ?? "");

          if (previousStatus === "failed" || previousStatus === "cancelled") {
            throw new Error("PREVIOUS_ATTEMPT_FAILED");
          }

          duplicate = true;
          existingCharge = Number(orderSnap.get("charge") ?? totalCost);
          existingProviderOrderId =
            typeof orderSnap.get("providerOrderId") === "string"
              ? orderSnap.get("providerOrderId")
              : undefined;
          existingStatus = previousStatus || "pending";
          balanceAfter = Number(userSnap.get("balance") ?? 0);
          return;
        }

        if (!userSnap.exists) {
          throw new Error("USER_NOT_FOUND");
        }

        const balance = Number(userSnap.get("balance") ?? 0);

        if (!Number.isFinite(balance) || toMinor(balance) < toMinor(totalCost)) {
          throw new Error("INSUFFICIENT_FUNDS");
        }

        balanceAfter = fromMinor(toMinor(balance) - toMinor(totalCost));

        transaction.update(userRef, { balance: balanceAfter });

        const refillWindowHours = parseRefillWindowHours(
          requestedService.name ?? "",
          publicService.refill
        );

        transaction.set(orderRef, {
          userId,
          userEmail:
            typeof userSnap.get("email") === "string"
              ? userSnap.get("email")
              : input.userEmail ?? "",
          serviceId,
          serviceName: requestedService.name ?? "",
          category: requestedService.category ?? "",
          link,
          quantity,
          charge: totalCost,
          providerCharge,
          profitMargin: getProfitMargin(),
          supportsRefill: publicService.refill,
          supportsCancel: publicService.cancel,
          refillWindowHours:
            refillWindowHours === Number.POSITIVE_INFINITY
              ? LIFETIME_REFILL_HOURS
              : refillWindowHours,
          refundState: "none",
          status: "pending",
          requestId,
          ...(normalizedComments.comments
            ? { comments: normalizedComments.comments }
            : {}),
          ...(runs !== null ? { runs } : {}),
          ...(interval !== null ? { interval } : {}),
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      });
    } catch (transactionError) {
      const code =
        transactionError instanceof Error ? transactionError.message : "";

      if (code === "INSUFFICIENT_FUNDS") {
        return {
          status: 400,
          body: {
            error: msg(
              "Insufficient balance. Add funds and try again.",
              "رصيد المحفظة غير كافٍ. يرجى شحن الرصيد والمحاولة مرة أخرى."
            ),
          },
        };
      }

      if (code === "USER_NOT_FOUND") {
        return {
          status: 404,
          body: {
            error: msg("User account not found.", "لم يتم العثور على حساب المستخدم."),
          },
        };
      }

      if (code === "REQUEST_CONFLICT") {
        return {
          status: 409,
          body: {
            error: msg(
              "This request identifier was already used.",
              "تم استخدام معرّف الطلب هذا مسبقًا."
            ),
          },
        };
      }

      if (code === "PREVIOUS_ATTEMPT_FAILED") {
        return {
          status: 409,
          body: {
            error: msg(
              "The previous attempt failed. Submit the order again.",
              "فشلت المحاولة السابقة. أرسل الطلب مرة أخرى."
            ),
          },
        };
      }

      console.error("Order reservation transaction failed:", transactionError);
      return {
        status: 500,
        body: {
          error: msg(
            "Could not reserve the order. Please try again.",
            "تعذّر حجز الطلب. حاول مرة أخرى."
          ),
        },
      };
    }

    if (duplicate) {
      return {
        status: 200,
        body: {
          success: true,
          duplicate: true,
          orderId: orderRef.id,
          providerOrderId: existingProviderOrderId,
          charge: existingCharge,
          balanceAfter,
          orderStatus: existingStatus,
        },
      };
    }

    let providerOrderId: string;

    try {
      providerOrderId = await createProviderOrder({
        serviceId,
        link,
        quantity,
        ...(normalizedComments.comments
          ? { comments: normalizedComments.comments }
          : {}),
        ...(runs !== null ? { runs } : {}),
        ...(interval !== null ? { interval } : {}),
      });
    } catch (providerError) {
      const classified =
        providerError instanceof ProviderError
          ? providerError
          : new ProviderError({
              code: "UNKNOWN",
              rawMessage:
                providerError instanceof Error
                  ? providerError.message
                  : "Provider order failed.",
              operation: "add",
            });

      console.error("Provider order error", {
        orderId: orderRef.id,
        code: classified.code,
        rawMessage: classified.rawMessage,
        httpStatus: classified.httpStatus,
        ambiguous: classified.ambiguous,
        safeToRefund: classified.safeToRefund,
      });

      if (classified.ambiguous || !classified.safeToRefund) {
        try {
          await orderRef.update({
            providerError: classified.customerMessage,
            providerErrorCode: classified.code,
            providerErrorAt: Timestamp.now(),
            needsReconciliation: true,
            providerLastStatus: "unknown",
            updatedAt: FieldValue.serverTimestamp(),
          });
        } catch (updateError) {
          console.error(
            "CRITICAL: could not flag ambiguous provider order:",
            updateError
          );
        }

        return {
          status: 202,
          body: {
            success: false,
            pendingConfirmation: true,
            orderId: orderRef.id,
            code: classified.code,
            message: msg(
              "The provider did not confirm the order. Your wallet is charged and the order is marked for review. Do not resubmit; support will reconcile it.",
              "لم يؤكد المزود الطلب. تم خصم المبلغ من محفظتك وتمييز الطلب للمراجعة. لا تُعد الإرسال؛ سيتولى الدعم تسويته."
            ),
          },
        };
      }

      let refunded = false;

      await adminDb
        .runTransaction(async (transaction) => {
          const [orderSnap, userSnap] = await Promise.all([
            transaction.get(orderRef),
            transaction.get(userRef),
          ]);

          if (!orderSnap.exists) return;
          if (orderSnap.get("refundState") === "refunded_to_user") return;

          transaction.update(orderRef, {
            status: "failed",
            refundState: "refunded_to_user",
            refundedAmount: totalCost,
            refundedToUserAt: Timestamp.now(),
            providerLastStatus: "failed",
            providerError: classified.customerMessage,
            providerErrorCode: classified.code,
            providerErrorAt: Timestamp.now(),
            needsReconciliation: false,
            updatedAt: FieldValue.serverTimestamp(),
          });

          if (userSnap.exists) {
            transaction.update(userRef, {
              balance: FieldValue.increment(totalCost),
            });
          }
        })
        .then(() => {
          refunded = true;
        })
        .catch(async (refundError) => {
          console.error(
            "CRITICAL: failed to refund rejected order:",
            refundError
          );

          await orderRef
            .update({
              status: "failed",
              refundState: "awaiting_provider_refund",
              providerLastStatus: "failed",
              providerError: classified.customerMessage,
              providerErrorCode: classified.code,
              providerErrorAt: Timestamp.now(),
              needsReconciliation: true,
              updatedAt: FieldValue.serverTimestamp(),
            })
            .catch((flagError) => {
              console.error(
                "CRITICAL: could not flag failed refund for review:",
                flagError
              );
            });
        });

      return {
        status: 502,
        body: {
          error: `${
            providerMessageForCode(classified.code, lang) ??
            classified.customerMessage
          } ${
            refunded
              ? msg("Your wallet was not charged.", "لم يتم خصم أي مبلغ من محفظتك.")
              : msg(
                  "The automatic refund failed; support will reconcile the charge.",
                  "تعذّر الاسترداد التلقائي؛ سيتولى الدعم تسوية المبلغ."
                )
          }`,
          code: classified.code,
        },
      };
    }

    let stored = false;

    for (let attempt = 0; attempt < 3 && !stored; attempt += 1) {
      try {
        await orderRef.update({
          providerOrderId,
          updatedAt: FieldValue.serverTimestamp(),
        });
        stored = true;
      } catch (error) {
        console.error(
          `Failed to store provider order id (attempt ${attempt + 1}/3):`,
          error
        );
        await new Promise((resolve) =>
          setTimeout(resolve, 250 * (attempt + 1))
        );
      }
    }

    if (!stored) {
      console.error(
        `CRITICAL: order ${orderRef.id} was accepted by provider ${providerOrderId} but the reference was not stored.`
      );
    }

    return {
      status: 200,
      body: {
        success: true,
        orderId: orderRef.id,
        providerOrderId,
        charge: totalCost,
        balanceAfter,
      },
    };
  } catch (error) {
    console.error("Order engine failed:", {
      code: error instanceof ProviderError ? error.code : "UNKNOWN",
      rawMessage: error instanceof Error ? error.message : "Unknown error",
    });
    return {
      status: 500,
      body: {
        error: msg(
          "Unable to place the order right now. Please try again.",
          "تعذّر إنشاء الطلب حاليًا. حاول مرة أخرى."
        ),
      },
    };
  }
}
