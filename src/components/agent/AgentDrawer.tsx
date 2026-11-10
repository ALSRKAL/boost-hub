"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useAgent } from "@/context/AgentContext";
import { useLanguage } from "@/context/LanguageContext";
import Button from "@/components/ui/Button";
import Icon from "@/components/ui/Icon";
import { StatusBadge } from "@/components/ui/Badge";
import CopyButton from "@/components/ui/CopyButton";
import { formatCurrency, formatNumber } from "@/lib/constants";
import type { AgentAction } from "@/lib/agent-tools";
import {
  localizePlatformKey,
  localizeServiceName,
} from "@/lib/service-localization";
import { translateErrorMessage } from "@/lib/error-messages";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function num(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function bilingual(
  value: unknown,
  language: "en" | "ar",
  fallback = ""
): string {
  const recordValue = record(value);
  return str(recordValue[language] ?? recordValue.en, fallback);
}

export function AgentDrawer() {
  const {
    open,
    openAgent,
    closeAgent,
    messages,
    isSending,
    error,
    sendMessage,
    prepareService,
    confirmDraft,
    requestOrderAction,
    confirmedDrafts,
    formContext,
    pendingPatch,
  } = useAgent();
  const { language, t } = useLanguage();
  const [draft, setDraft] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    textareaRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeAgent();
    };
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = originalOverflow;
    };
  }, [open, closeAgent]);

  useEffect(() => {
    if (open) {
      scrollRef.current?.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [messages, isSending, open]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={openAgent}
        className="fixed bottom-20 end-4 z-40 flex h-11 w-11 items-center justify-center rounded-full border border-ink bg-ink text-white shadow-[var(--shadow-pop)] transition-transform hover:-translate-y-0.5 sm:bottom-5"
        aria-label={t("Open order assistant", "فتح المساعد الذكي")}
        title={`${t("Order assistant", "المساعد الذكي")} · ⌘K`}
      >
        <Icon name="message" size={19} />
      </button>
    );
  }

  const quickChips = [
    {
      en: "Recommend guaranteed Instagram followers",
      ar: "رشّح لي أفضل خدمة متابعين إنستغرام بضمان",
    },
    {
      en: "Check my link & prepare an order",
      ar: "افحص رابطي وجهّز لي طلباً",
    },
    {
      en: "Check my latest order status",
      ar: "ما هي حالة آخر طلباتي؟",
    },
    {
      en: "How do I add funds via UPI?",
      ar: "كيف أشحن رصيدي عبر UPI؟",
    },
  ];

  function submit() {
    const value = draft.trim();
    if (!value || isSending) return;
    setDraft("");
    void sendMessage(value);
  }

  return createPortal(
    <div className="fixed inset-0 z-[140] flex justify-end">
      <button
        type="button"
        className="absolute inset-0 cursor-default bg-ink/30"
        aria-label={t("Close order assistant", "إغلاق المساعد الذكي")}
        onClick={closeAgent}
        tabIndex={-1}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={t("Order assistant", "المساعد الذكي")}
        className="relative flex h-full w-full max-w-[440px] flex-col border-s border-line-strong bg-canvas shadow-[var(--shadow-pop)]"
      >
        <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-line px-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border border-line bg-surface text-accent">
              <Icon name="message" size={16} />
            </span>
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold text-ink">
                {t("Order assistant", "المساعد الذكي")}
              </p>
              <p className="truncate text-[10.5px] text-ink-mute">
                {t(
                  "Catalog, links, orders, wallet",
                  "الكتالوج والروابط والطلبات والمحفظة"
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="status status-neutral">
              {language === "ar" ? "AR" : "EN"}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={closeAgent}
              aria-label={t("Close", "إغلاق")}
            >
              <Icon name="x" size={14} />
            </Button>
          </div>
        </header>

        <div
          ref={scrollRef}
          className="scroll-thin min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4"
        >
          {messages.length === 0 ? (
            <div className="rounded-[var(--radius-sm)] border border-line bg-surface p-4">
              <p className="text-[13px] font-medium text-ink">
                {t(
                  "Tell me what you want to order.",
                  "أخبرني بما تريد طلبه."
                )}
              </p>
              <p className="mt-1 text-[11.5px] leading-5 text-ink-mute">
                {t(
                  "I can search the live catalog, check your link, fill the order form, place a confirmed order, check status, and guide a deposit.",
                  "أستطيع البحث في الكتالوج، فحص رابطك، تعبئة نموذج الطلب، تنفيذ طلب مؤكد، متابعة الحالة، وإرشادك للإيداع."
                )}
              </p>
              {formContext.serviceName ? (
                <p className="mt-2 text-[10.5px] text-ink-mute">
                  {t("Current form", "النموذج الحالي")}:{" "}
                  <span className="text-ink">
                    {language === "ar"
                      ? localizeServiceName(formContext.serviceName)
                      : formContext.serviceName}
                  </span>
                  {formContext.quantity
                    ? ` · ${formatNumber(formContext.quantity)}`
                    : ""}
                </p>
              ) : null}
              {pendingPatch ? (
                <p className="mt-2 text-[10.5px] text-accent">
                  {t(
                    "A prepared draft is waiting on the order form.",
                    "هناك مسودة مجهزة بانتظارك في نموذج الطلب."
                  )}
                </p>
              ) : null}
            </div>
          ) : (
            messages.map((message) => (
              <div key={message.id} className="space-y-2">
                <div
                  className={
                    message.role === "user"
                      ? "ms-auto max-w-[88%] rounded-[var(--radius-sm)] bg-ink px-3 py-2 text-[12.5px] leading-5 text-white"
                      : "max-w-[94%] rounded-[var(--radius-sm)] border border-line bg-surface px-3 py-2 text-[12.5px] leading-5 text-ink"
                  }
                >
                  <p className="whitespace-pre-wrap break-words">
                    {message.content}
                  </p>
                </div>

                {message.role === "assistant"
                  ? (message.actions ?? []).map((action, index) => (
                      <ActionCard
                        key={`${message.id}-${action.type}-${index}`}
                        action={action}
                        onConfirm={confirmDraft}
                        onOrderAction={requestOrderAction}
                        confirmedDrafts={confirmedDrafts}
                        isSending={isSending}
                        onUseService={(serviceId) => {
                          if (formContext.link && formContext.quantity) {
                            void prepareService(serviceId);
                          } else {
                            void sendMessage(
                              t(
                                `Use service ${serviceId} and prepare the order with the link and quantity from my request.`,
                                `استخدم الخدمة ${serviceId} وجهّز الطلب بالرابط والكمية من طلبي.`
                              )
                            );
                          }
                        }}
                      />
                    ))
                  : null}
              </div>
            ))
          )}

          {isSending ? (
            <p className="text-[11.5px] text-ink-mute" role="status">
              {t("Working…", "جارٍ العمل…")}
            </p>
          ) : null}

          {error ? (
            <p className="rounded-[var(--radius-xs)] border border-[#eec9c5] bg-danger-soft px-2.5 py-2 text-[11.5px] text-danger" role="alert">
              {translateErrorMessage(error, language)}
            </p>
          ) : null}
        </div>

        <div className="shrink-0 border-t border-line bg-canvas px-4 py-3">
          <div className="flex flex-wrap gap-1.5 pb-2">
            {quickChips.map((chip) => (
              <button
                key={chip.en}
                type="button"
                className="chip shrink-0 whitespace-nowrap"
                onClick={() => void sendMessage(t(chip.en, chip.ar))}
                disabled={isSending}
              >
                {t(chip.en, chip.ar)}
              </button>
            ))}
          </div>
          <div className="flex items-end gap-2">
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  submit();
                }
              }}
              rows={2}
              placeholder={t(
                "Describe your order, paste a link, or ask about your wallet…",
                "صف طلبك أو الصق رابطًا أو اسأل عن محفظتك…"
              )}
              className="control min-h-[44px] resize-none py-2 text-[12.5px]"
              maxLength={2000}
              aria-label={t("Message", "الرسالة")}
            />
            <Button
              size="sm"
              onClick={submit}
              disabled={!draft.trim() || isSending}
              isLoading={isSending}
              aria-label={t("Send", "إرسال")}
              className="mb-0.5"
            >
              <Icon name="arrow-up-right" size={14} />
            </Button>
          </div>
          <p className="mt-1.5 text-[10px] text-ink-mute">
            {t(
              "Prices are customer prices. The assistant cannot change your balance.",
              "الأسعار هي أسعار العملاء. لا يستطيع المساعد تغيير رصيدك."
            )}
          </p>
        </div>
      </aside>
    </div>,
    document.body
  );
}

function ActionCard({
  action,
  onConfirm,
  onOrderAction,
  confirmedDrafts,
  isSending,
  onUseService,
}: {
  action: AgentAction;
  onConfirm: (clientRequestId: string) => void;
  onOrderAction: (orderId: string, action: "refill" | "cancel") => void;
  confirmedDrafts: Set<string>;
  isSending: boolean;
  onUseService: (serviceId: string) => void;
}) {
  const { language, t } = useLanguage();
  const payload = record(action.payload);

  if (action.type === "services") {
    const services = list(payload.services).map(record);

    if (services.length === 0) return null;

    return (
      <div className="rounded-[var(--radius-sm)] border border-line bg-surface p-2.5">
        <p className="rule-label">
          {t("Matching services", "خدمات مطابقة")}
        </p>
        <div className="mt-2 space-y-2">
          {services.slice(0, 6).map((service, index) => {
            const id = str(service.id);
            const rawName = str(service.name);
            const name =
              language === "ar" ? localizeServiceName(rawName) : rawName;
            const price = num(service.customerRatePer1000);
            const estimate = num(service.estimatedTotalCharge);
            const min = num(service.min);
            const max = num(service.max);
            const refill = service.refillGuarantee === true;
            const targetLabel = bilingual(
              service.targetLabel,
              language,
              str(service.target)
            );

            return (
              <div
                key={`${id}-${index}`}
                className="rounded-[var(--radius-xs)] border border-line px-2.5 py-2"
              >
                <p className="line-clamp-2 text-[12px] font-medium leading-5 text-ink">
                  {name}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[10.5px] text-ink-mute">
                  <span>
                    {language === "ar"
                      ? localizePlatformKey(str(service.platform))
                      : str(service.platform)}
                  </span>
                  <span>{targetLabel}</span>
                  <span className="num-sm text-ink">
                    {formatCurrency(price)} {t("/ 1k", "/ 1000")}
                  </span>
                  <span className="num-sm">
                    {formatNumber(min)}–{formatNumber(max)}
                  </span>
                  <span
                    className={
                      refill ? "text-positive" : "text-ink-mute"
                    }
                  >
                    {refill
                      ? t("Refill", "تعويض")
                      : t("No refill", "بدون تعويض")}
                  </span>
                </div>
                <div className="mt-1.5 flex items-center justify-between gap-2">
                  <span className="text-[10.5px] text-ink-mute">
                    {t("Estimated total", "الإجمالي المقدر")}{" "}
                    <span className="num-sm text-ink">
                      {formatCurrency(estimate)}
                    </span>
                  </span>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => onUseService(id)}
                    disabled={isSending || !id}
                  >
                    {t("Use service", "اختيار وتعبئة")}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (action.type === "prefill_order") {
    const clientRequestId = str(payload.clientRequestId);
    const rawServiceName = str(payload.serviceName);
    const serviceName =
      language === "ar" ? localizeServiceName(rawServiceName) : rawServiceName;
    const link = str(payload.link);
    const quantity = num(payload.quantity);
    const totalCharge = num(payload.totalCharge);
    const walletBalance = num(payload.walletBalance);
    const balanceAfter = num(payload.balanceAfter);
    const canPlace = payload.canPlace === true;
    const targetLabel = bilingual(
      record(payload.linkCheck).targetLabel,
      language
    );

    return (
      <div className="rounded-[var(--radius-sm)] border border-line-strong bg-surface p-3">
        <div className="flex items-start justify-between gap-2">
          <p className="rule-label">{t("Prepared order", "الطلب المجهز")}</p>
          <span className="status status-info">
            {t("Draft", "مسودة")}
          </span>
        </div>
        <p className="mt-1 text-[12.5px] font-medium leading-5 text-ink">
          {serviceName}
        </p>
        <dl className="mt-2 space-y-1 text-[11px]">
          <div className="flex items-start justify-between gap-2">
            <dt className="text-ink-mute">{t("Target", "الهدف")}</dt>
            <dd className="min-w-0 text-end">
              <span className="block text-[10px] text-ink-mute">
                {targetLabel}
              </span>
              <span
                dir="ltr"
                className="block break-all font-mono text-[10.5px] text-ink"
              >
                {link}
              </span>
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-ink-mute">{t("Quantity", "الكمية")}</dt>
            <dd className="num-sm text-ink">{formatNumber(quantity)}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-ink-mute">{t("Total", "الإجمالي")}</dt>
            <dd className="num-sm font-semibold text-ink">
              {formatCurrency(totalCharge)}
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-ink-mute">{t("Wallet", "المحفظة")}</dt>
            <dd className="num-sm text-ink">
              {formatCurrency(walletBalance)}
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-ink-mute">{t("After", "بعد الطلب")}</dt>
            <dd
              className={`num-sm ${
                balanceAfter < 0 ? "text-danger" : "text-ink"
              }`}
            >
              {balanceAfter < 0
                ? t("Insufficient", "غير كافٍ")
                : formatCurrency(balanceAfter)}
            </dd>
          </div>
        </dl>

        {!canPlace ? (
          <div className="mt-2 rounded-[var(--radius-xs)] border border-[#eed9b4] bg-warning-soft px-2.5 py-2 text-[11px] leading-5 text-warning">
            {t(
              "The wallet balance is below this order total. Add funds before confirming.",
              "رصيد المحفظة أقل من إجمالي الطلب. أضف رصيدًا قبل التأكيد."
            )}{" "}
            <Link href="/add-funds" className="font-medium underline">
              {t("Add funds", "إضافة رصيد")}
            </Link>
          </div>
        ) : null}

        <div className="mt-2.5 flex items-center justify-between gap-2">
          <span className="text-[10px] text-ink-mute">
            {t(
              "Review the fields on the form. Confirm only if correct.",
              "راجع الحقول في النموذج. أكد فقط إذا كانت صحيحة."
            )}
          </span>
          <Button
            size="sm"
            variant="primary"
            onClick={() => onConfirm(clientRequestId)}
            disabled={
              !clientRequestId ||
              !canPlace ||
              isSending ||
              confirmedDrafts.has(clientRequestId)
            }
            isLoading={
              isSending && confirmedDrafts.has(clientRequestId)
            }
          >
            {confirmedDrafts.has(clientRequestId)
              ? t("Confirming…", "جارٍ التأكيد…")
              : t("Confirm & place order", "تأكيد وتنفيذ الطلب")}
          </Button>
        </div>
      </div>
    );
  }

  if (action.type === "order_placed") {
    const orderId = str(payload.orderId);
    const charge = num(payload.charge);

    return (
      <div className="rounded-[var(--radius-sm)] border border-[#c4e2cf] bg-positive-soft p-3">
        <p className="text-[12.5px] font-medium text-positive">
          {t("Order created", "تم إنشاء الطلب")}
        </p>
        <p className="mt-1 num-sm text-[11px] text-ink">
          <span dir="ltr">#{orderId.slice(0, 12)}</span> ·{" "}
          {formatCurrency(charge)}
        </p>
        <Link
          href="/orders"
          className="mt-2 inline-block text-[11px] font-medium text-positive underline"
        >
          {t("Open orders", "عرض الطلبات")}
        </Link>
      </div>
    );
  }

  if (action.type === "account") {
    const orders = list(payload.orders).map(record).slice(0, 3);

    if (orders.length === 0) return null;

    return (
      <div className="rounded-[var(--radius-sm)] border border-line bg-surface p-2.5">
        <p className="rule-label">{t("Your orders", "طلباتك")}</p>
        <div className="mt-2 space-y-2">
          {orders.map((order, index) => {
            const orderId = str(order.orderId);
            const status = str(order.status);
            const rawServiceName = str(order.serviceName);
            const serviceName =
              language === "ar"
                ? localizeServiceName(rawServiceName)
                : rawServiceName;
            const charge = num(order.charge);
            const quantity = num(order.quantity);
            const refillEligible = order.refillEligible === true;
            const cancelEligible = order.cancelEligible === true;

            return (
              <div
                key={`${orderId}-${index}`}
                className="rounded-[var(--radius-xs)] border border-line px-2.5 py-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="num-sm text-[10.5px] text-ink">
                      <span dir="ltr">#{orderId.slice(0, 12)}</span>
                    </p>
                    <p className="mt-0.5 line-clamp-2 text-[11.5px] font-medium leading-4 text-ink">
                      {serviceName}
                    </p>
                    <p className="mt-0.5 text-[10.5px] text-ink-mute">
                      <span className="num-sm">
                        {formatNumber(quantity)}
                      </span>{" "}
                      ·{" "}
                      <span className="num-sm">
                        {formatCurrency(charge)}
                      </span>
                    </p>
                  </div>
                  <StatusBadge status={status} />
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {refillEligible ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => onOrderAction(orderId, "refill")}
                      disabled={isSending}
                    >
                      {t("Request refill", "طلب تعويض")}
                    </Button>
                  ) : null}
                  {cancelEligible ? (
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => onOrderAction(orderId, "cancel")}
                      disabled={isSending}
                    >
                      {t("Cancel order", "إلغاء الطلب")}
                    </Button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (action.type === "order_action") {
    const message = str(payload.message);
    if (!message) return null;

    return (
      <div className="rounded-[var(--radius-sm)] border border-line bg-surface px-3 py-2 text-[11.5px] leading-5 text-ink-soft">
        {translateErrorMessage(message, language)}
      </div>
    );
  }

  if (action.type === "deposit") {
    const upiId = str(payload.upiId);
    const guide = payload.guide === true;
    const message = str(payload.message);
    const balance = num(payload.balance);

    return (
      <div className="rounded-[var(--radius-sm)] border border-line bg-surface p-2.5">
        <p className="rule-label">
          {guide
            ? t("UPI deposit", "إيداع UPI")
            : t("Deposit request", "طلب الإيداع")}
        </p>
        {guide ? (
          <>
            <div className="mt-2 flex items-center justify-between gap-2 rounded-[var(--radius-xs)] border border-line bg-subtle px-2.5 py-2">
              <div>
                <p className="text-[10px] text-ink-mute">UPI ID</p>
                <p className="mt-0.5 num-sm text-[12px] text-ink">
                  {upiId || t("Not configured", "غير مهيأ")}
                </p>
              </div>
              {upiId ? (
                <CopyButton value={upiId} label={t("Copy", "نسخ")} />
              ) : null}
            </div>
            {balance > 0 ? (
              <p className="mt-2 text-[10.5px] text-ink-mute">
                {t("Current balance", "الرصيد الحالي")}:{" "}
                <span className="num-sm text-ink">
                  {formatCurrency(balance)}
                </span>
              </p>
            ) : null}
            <Link
              href="/add-funds"
              className="mt-2 inline-block text-[11px] font-medium text-accent underline"
            >
              {t("Open Add funds", "فتح صفحة إضافة الرصيد")}
            </Link>
          </>
        ) : (
          <p className="mt-1 text-[11.5px] leading-5 text-ink-soft">
            {message
              ? translateErrorMessage(message, language)
              : t("Deposit submitted.", "تم إرسال الإيداع.")}
          </p>
        )}
      </div>
    );
  }

  return null;
}
