import type { Language } from "@/lib/i18n";

/**
 * Last line of defence for Arabic mode: every customer/admin-facing error
 * string goes through here before rendering. Known API, provider, validation,
 * and Firebase messages are mapped to natural Arabic. Unknown English text is
 * replaced with a safe Arabic fallback so raw upstream errors never leak.
 */

const ARABIC_PATTERN = /[\u0600-\u06FF]/;
const TECHNICAL_TOKENS = new Set([
  "UTR",
  "UPI",
  "ID",
  "API",
  "INR",
  "QR",
  "SMS",
  "SMM",
  "SEO",
  "AI",
  "HTTP",
  "HTTPS",
  "URL",
  "USERNAME",
]);

export function isArabicText(value: string): boolean {
  return ARABIC_PATTERN.test(value);
}

export function hasLatinText(value: string): boolean {
  const words = value.match(/[A-Za-z]{2,}/g) ?? [];
  return words.some((word) => !TECHNICAL_TOKENS.has(word.toUpperCase()));
}

const PROVIDER_MESSAGES_AR: Record<string, string> = {  BALANCE: "هذه الخدمة غير متاحة مؤقتًا. حاول لاحقًا.",
  AUTH: "هذه الخدمة غير متاحة مؤقتًا. حاول لاحقًا.",
  SUSPENDED: "هذه الخدمة غير متاحة مؤقتًا. حاول لاحقًا.",
  UPSTREAM: "مزود الخدمة غير متاح مؤقتًا. حاول بعد قليل.",
  INVALID_TARGET:
    "تم رفض الرابط أو اسم المستخدم. تأكد من أنه عام وصحيح.",
  INVALID_QUANTITY:
    "تم رفض الكمية لهذه الخدمة. راجع الحد الأدنى والأقصى المسموح.",
  SERVICE_NOT_FOUND: "هذه الخدمة لم تعد متاحة. حدّث الكتالوج.",
  DUPLICATE_ORDER:
    "يوجد طلب نشط لنفس الرابط على هذه الخدمة. انتظر انتهاءه قبل إعادة الطلب.",
  INVALID_ORDER: "لم يجد المزود هذا الطلب. قد يكون قيد المعالجة.",
  REFILL_UNAVAILABLE: "التعويض غير متاح لهذا الطلب حاليًا.",
  ALREADY_REFILLED: "تم تعويض هذا الطلب لهذه الفترة مسبقًا.",
  CANCEL_UNAVAILABLE: "لم يعد بالإمكان إلغاء هذا الطلب.",
  AMBIGUOUS:
    "لم يؤكد المزود الطلب. لا تُعد الإرسال؛ سيتولى الدعم تسويته.",
  NETWORK: "تعذّر الوصول إلى مزود الخدمة. حاول مرة أخرى.",
  UNKNOWN: "رفض مزود الخدمة الطلب. حاول مرة أخرى.",
  REFUND_FAILED: "تعذّر استرداد المبلغ من المزود. تواصل مع الدعم.",
};

const ERROR_CODE_LABELS_AR: Record<string, string> = {
  BALANCE: "رصيد المزود",
  AUTH: "مصادقة المزود",
  SUSPENDED: "حساب المزود معلّق",
  UPSTREAM: "خطأ لدى المزود",
  INVALID_TARGET: "هدف غير صالح",
  INVALID_QUANTITY: "كمية غير صالحة",
  SERVICE_NOT_FOUND: "خدمة غير موجودة",
  DUPLICATE_ORDER: "طلب مكرر",
  INVALID_ORDER: "طلب غير معروف",
  REFILL_UNAVAILABLE: "تعويض غير متاح",
  ALREADY_REFILLED: "تم التعويض مسبقًا",
  CANCEL_UNAVAILABLE: "إلغاء غير متاح",
  AMBIGUOUS: "نتيجة غير مؤكدة",
  NETWORK: "خطأ شبكة",
  UNKNOWN: "خطأ غير معروف",
  REFUND_FAILED: "فشل الاسترداد",
};

export function localizeErrorCode(
  code: string | null | undefined,
  language: Language
): string {
  if (!code) return "";
  if (language !== "ar") return code;
  return ERROR_CODE_LABELS_AR[code] ?? "خطأ مزود";
}

const EXACT_MESSAGES: Record<string, string> = {
  // Order engine
  "Invalid request body.": "طلب غير صالح.",
  "Unauthorized.": "يجب تسجيل الدخول للمتابعة.",
  "You can only place orders for your own account.":
    "يمكنك إنشاء طلبات لحسابك فقط.",
  "Service, target link, quantity, and account are required.":
    "الخدمة ورابط الهدف والكمية والحساب مطلوبة.",
  "Invalid request identifier. Refresh the page and try again.":
    "معرّف الطلب غير صالح. حدّث الصفحة وحاول مرة أخرى.",
  "The selected service has incomplete provider data.":
    "بيانات الخدمة المحددة غير مكتملة لدى المزود.",
  "This service requires custom comments, one per line.":
    "هذه الخدمة تتطلب تعليقات مخصصة، تعليقًا واحدًا في كل سطر.",
  "This service does not accept custom comments.":
    "هذه الخدمة لا تقبل تعليقات مخصصة.",
  "This service does not support drip-feed.":
    "هذه الخدمة لا تدعم التسليم المرحلي.",
  "Drip-feed needs at least 2 runs and a positive interval.":
    "التسليم المرحلي يحتاج إلى دفعتين على الأقل وفاصل زمني موجب.",
  "Drip-feed runs cannot exceed the quantity.":
    "لا يمكن أن يتجاوز عدد الدفعات الكمية.",
  "Drip-feed interval cannot exceed 1440 minutes.":
    "لا يمكن أن يتجاوز الفاصل الزمني 1440 دقيقة.",
  "This service has an invalid price. Contact support.":
    "سعر هذه الخدمة غير صالح. تواصل مع الدعم.",
  "Insufficient balance. Add funds and try again.":
    "رصيد المحفظة غير كافٍ. يرجى شحن الرصيد والمحاولة مرة أخرى.",
  "User account not found.": "لم يتم العثور على حساب المستخدم.",
  "This request identifier was already used.":
    "تم استخدام معرّف الطلب هذا مسبقًا.",
  "The previous attempt failed. Submit the order again.":
    "فشلت المحاولة السابقة. أرسل الطلب مرة أخرى.",
  "Could not reserve the order. Please try again.":
    "تعذّر حجز الطلب. حاول مرة أخرى.",
  "Unable to place the order right now. Please try again.":
    "تعذّر إنشاء الطلب حاليًا. حاول مرة أخرى.",

  // Deposits
  "Amount and transaction reference are required.":
    "المبلغ ومرجع العملية مطلوبان.",
  "You can only create deposits for your own account.":
    "يمكنك إنشاء إيداعات لحسابك فقط.",
  "Enter a valid transaction reference (8–40 letters, digits, or hyphens).":
    "أدخل مرجع عملية صالحًا (من 8 إلى 40 حرفًا أو رقمًا أو شرطة).",
  "This transaction reference has already been submitted. Check your deposit history.":
    "رقم المرجع (UTR) هذا تم إرساله مسبقًا. راجع سجل الإيداعات.",
  "Unable to submit the deposit right now.":
    "تعذّر إرسال الإيداع حاليًا. حاول مرة أخرى.",

  // Refill / cancel
  "Order and account are required.": "الطلب والحساب مطلوبان.",
  "You can only request refills for your own orders.":
    "يمكنك طلب تعويض لطلباتك فقط.",
  "You can only cancel your own orders.": "يمكنك إلغاء طلباتك فقط.",
  "Order not found.": "لم يتم العثور على الطلب.",
  "This service does not support refills.": "هذه الخدمة لا تدعم التعويض.",
  "This order has no provider reference yet. Try again after the next sync.":
    "لا يوجد مرجع مزود لهذا الطلب بعد. حاول بعد المزامنة التالية.",
  "Refill is not available.": "التعويض غير متاح.",
  "Unable to request a refill right now.":
    "تعذّر طلب التعويض حاليًا. حاول مرة أخرى.",
  "This service does not allow cancellation.":
    "هذه الخدمة لا تسمح بالإلغاء.",
  "Only pending or in-progress orders can be cancelled.":
    "يمكن إلغاء الطلبات قيد الانتظار أو قيد التنفيذ فقط.",
  "This order has no provider reference yet. Try again shortly.":
    "لا يوجد مرجع مزود لهذا الطلب بعد. حاول بعد قليل.",
  "Unable to cancel the order right now.":
    "تعذّر إلغاء الطلب حاليًا. حاول مرة أخرى.",
  "The cancellation was rejected.": "تم رفض طلب الإلغاء.",
  "The refill was rejected.": "تم رفض طلب التعويض.",
  "Refill requested.": "تم طلب التعويض.",
  "Refill confirmation pending.": "بانتظار تأكيد التعويض.",
  "Cancellation confirmation pending.": "بانتظار تأكيد الإلغاء.",
  "Cancellation requested. The refund is credited after provider confirmation.":
    "تم طلب الإلغاء. يُضاف المبلغ المسترد بعد تأكيد المزود.",

  // Admin resolution
  "Your session expired. Sign in again.":
    "انتهت صلاحية الجلسة. سجّل الدخول مرة أخرى.",
  "The resolution action failed.":
    "تعذّرت معالجة الطلب. حاول مرة أخرى.",
  "The resolution action failed. Check the server logs.":
    "تعذّرت معالجة الطلب. راجع سجلات الخادم.",
  "Unknown resolution action.": "إجراء معالجة غير معروف.",
  "A valid order identifier is required.":
    "معرّف طلب صالح مطلوب.",
  "That is not a valid provider order ID.":
    "معرّف طلب المزود غير صالح.",
  "This order was already fully refunded.":
    "تم استرداد هذا الطلب بالكامل مسبقًا.",
  "Review flag cleared.": "تم مسح علامة المراجعة.",

  // Sync
  "The provider sync failed.": "تعذّرت مزامنة المزود.",
  "Provider sync complete.": "اكتملت مزامنة المزود.",

  // Catalogue
  "The catalog could not be loaded.": "تعذّر تحميل الكتالوج.",
  "Unexpected catalog response.": "استجابة كتالوج غير متوقعة.",
  "Catalog unavailable": "الكتالوج غير متاح",
  "No services available": "لا توجد خدمات متاحة",
  "The provider returned an empty catalog. Try again in a moment.":
    "أعاد المزود كتالوجًا فارغًا. حاول بعد قليل.",
  "Reload catalog": "إعادة تحميل الكتالوج",
  "Unable to load the service catalog right now.":
    "تعذّر تحميل كتالوج الخدمات حاليًا.",

  // Dashboard loads
  "The order ledger could not be loaded.": "تعذّر تحميل سجل الطلبات.",
  "The deposit ledger could not be loaded.": "تعذّر تحميل سجل الإيداعات.",
  "Your orders could not be loaded.": "تعذّر تحميل طلباتك.",
  "The deposit queue could not be loaded.": "تعذّر تحميل قائمة الإيداعات.",
  "The user directory could not be loaded.":
    "تعذّر تحميل دليل المستخدمين.",
  "Your deposit history could not be loaded.":
    "تعذّر تحميل سجل إيداعاتك.",

  // Provider balance
  "Provider balance is unavailable.": "رصيد المزود غير متاح.",
  Unavailable: "غير متاح",

  // Empty / status
  Uncategorized: "غير مصنف",
  "No orders yet": "لا توجد طلبات بعد",

  // Auth
  "Enter your email address.": "أدخل بريدك الإلكتروني.",
  "Enter your password.": "أدخل كلمة المرور.",
  "Enter a valid email address.": "أدخل بريدًا إلكترونيًا صالحًا.",
  "Email or password is incorrect.":
    "البريد الإلكتروني أو كلمة المرور غير صحيحة.",
  "No account exists with this email.":
    "لا يوجد حساب بهذا البريد الإلكتروني.",
  "Too many attempts. Wait a minute and try again.":
    "محاولات كثيرة جدًا. انتظر دقيقة ثم حاول مرة أخرى.",
  "Network unavailable. Check your connection and retry.":
    "الشبكة غير متاحة. تحقق من اتصالك وحاول مرة أخرى.",
  "This account has been disabled.": "تم تعطيل هذا الحساب.",
  "Sign in failed. Please try again.":
    "تعذّر تسجيل الدخول. حاول مرة أخرى.",
  "Could not send the reset email. Please try again.":
    "تعذّر إرسال بريد إعادة التعيين. حاول مرة أخرى.",
  "An account already exists with this email. Sign in instead.":
    "يوجد حساب بهذا البريد الإلكتروني بالفعل. سجّل الدخول بدلًا من ذلك.",
  "Password must be at least 6 characters.":
    "يجب أن تكون كلمة المرور 6 أحرف على الأقل.",
  "Could not create the account. Please try again.":
    "تعذّر إنشاء الحساب. حاول مرة أخرى.",
  "Passwords do not match.": "كلمتا المرور غير متطابقتين.",
  "Email is required.": "البريد الإلكتروني مطلوب.",
  "Use at least 6 characters.": "استخدم 6 أحرف على الأقل.",
  "This domain is not authorized in Firebase. Add it in Firebase Console → Authentication → Settings → Authorized domains.":
    "هذا النطاق غير مصرح به في Firebase. أضفه من Firebase Console ← Authentication ← Settings ← Authorized domains.",

  // New order validation
  "Target link or username is required.":
    "رابط الهدف أو اسم المستخدم مطلوب.",
  "Remove spaces from the target.": "أزل المسافات من الهدف.",
  "Target is too short.": "الهدف قصير جدًا.",
  "Target is too long.": "الهدف طويل جدًا.",
  "Only http:// and https:// links are accepted.":
    "يُقبل فقط روابط http:// و https://.",
  "Traffic services require a full https:// URL.":
    "خدمات الزيارات تتطلب رابط https:// كاملًا.",
  "Select a service first.": "اختر خدمة أولًا.",
  "Enter a quantity.": "أدخل الكمية.",
  "Use a whole number greater than zero.":
    "استخدم عددًا صحيحًا أكبر من صفر.",
  "Add at least one comment, one per line.":
    "أضف تعليقًا واحدًا على الأقل، تعليقًا في كل سطر.",
  "Each comment must be 500 characters or fewer.":
    "يجب ألا يزيد كل تعليق عن 500 حرف.",
  "Use at least 2 runs.": "استخدم دفعتين على الأقل.",
  "Runs cannot exceed the quantity.":
    "لا يمكن أن يتجاوز عدد الدفعات الكمية.",
  "Interval must be 1–1440 minutes.":
    "يجب أن يكون الفاصل بين 1 و1440 دقيقة.",
  "Sign in again to place this order.":
    "سجّل الدخول مرة أخرى لإنشاء هذا الطلب.",
  "The charge is zero. Check the quantity.":
    "المبلغ صفر. تحقق من الكمية.",
  "Insufficient balance. Add funds before ordering.":
    "الرصيد غير كافٍ. أضف رصيدًا قبل الطلب.",
  "This order request was already processed.":
    "تمت معالجة طلب الشراء هذا مسبقًا.",
  "The order was rejected.": "تم رفض الطلب.",
  "The provider did not confirm the order. Do not resubmit; support will reconcile it.":
    "لم يؤكد المزود الطلب. لا تُعد الإرسال؛ سيتولى الدعم تسويته.",
  "Sign in again to submit a deposit.":
    "سجّل الدخول مرة أخرى لإرسال الإيداع.",
  "Deposit submitted. It is credited after an administrator verifies the payment.":
    "تم إرسال الإيداع. يُضاف الرصيد بعد تحقق المدير من الدفع.",

  // Assistant
  "Too many assistant requests. Wait a minute and retry.":
    "طلبات كثيرة على المساعد. انتظر دقيقة ثم حاول مرة أخرى.",
  "The order preparation failed. Please retry.":
    "تعذّر تجهيز الطلب. حاول مرة أخرى.",
  "The order action failed. Please retry.":
    "تعذّر تنفيذ إجراء الطلب. حاول مرة أخرى.",
  "A customer message is required.": "رسالة العميل مطلوبة.",
};

const PATTERNS: Array<{ pattern: RegExp; replacement: (match: RegExpMatchArray) => string }> = [
  {
    pattern: /^Quantity for this service must be between ([\d,]+) and ([\d,]+)\.$/,
    replacement: (m) => `يجب أن تكون الكمية لهذه الخدمة بين ${m[1]} و${m[2]}.`,
  },
  {
    pattern: /^Quantity must equal the number of comment lines \((\d+)\)\.$/,
    replacement: (m) => `يجب أن تساوي الكمية عدد أسطر التعليقات (${m[1]}).`,
  },
  {
    pattern: /^Quantity must equal the (\d+) comment lines\.$/,
    replacement: (m) => `يجب أن تساوي الكمية عدد أسطر التعليقات (${m[1]}).`,
  },
  {
    pattern: /^Custom comments are limited to (\d+) lines\.$/,
    replacement: (m) => `التعليقات المخصصة محدودة بـ ${m[1]} سطرًا.`,
  },
  {
    pattern: /^Provider reported negative remains \((\d+)\)\.$/,
    replacement: (m) => `أبلغ المزود عن كمية متبقية سالبة (${m[1]}).`,
  },
  {
    pattern: /^Provider reported remains \((\d+)\) greater than quantity \((\d+)\)\.$/,
    replacement: (m) =>
      `أبلغ المزود عن كمية متبقية (${m[1]}) أكبر من الكمية (${m[2]}).`,
  },
  {
    pattern: /^Deposit amount must be between (.+) and (.+)\.$/,
    replacement: (m) => `يجب أن يكون مبلغ الإيداع بين ${m[1]} و${m[2]}.`,
  },
  {
    pattern: /^Range is ([\d,]+)–([\d,]+)\.$/,
    replacement: (m) => `النطاق هو ${m[1]}–${m[2]}.`,
  },
  {
    pattern: /^Maximum (\d+) comments\.$/,
    replacement: (m) => `الحد الأقصى ${m[1]} تعليق.`,
  },
  {
    pattern: /^Checked ([\d,]+), updated ([\d,]+), refunded ([\d,]+), anomalies ([\d,]+), awaiting ([\d,]+)\.$/,
    replacement: (m) =>
      `تم فحص ${m[1]} وتحديث ${m[2]} واسترداد ${m[3]}، مع ${m[4]} حالة شاذة و${m[5]} بانتظار الاسترداد.`,
  },
  {
    pattern: /^Checked ([\d,]+), updated ([\d,]+), refunded ([\d,]+), awaiting ([\d,]+)(?:, ([\d,]+) failed)?\.$/,
    replacement: (m) =>
      `تم فحص ${m[1]} وتحديث ${m[2]} واسترداد ${m[3]}، و${m[4]} بانتظار الاسترداد${
        m[5] ? `، وفشل ${m[5]}` : ""
      }.`,
  },
  {
    pattern: /^(.+) credited to (.+)\.$/,
    replacement: (m) => `تم إضافة ${m[1]} إلى ${m[2]}.`,
  },
  {
    pattern: /^Deposit from (.+) rejected\.$/,
    replacement: (m) => `تم رفض إيداع ${m[1]}.`,
  },
  {
    pattern: /^Refunded (.+) and canceled the order\.$/,
    replacement: (m) => `تم استرداد ${m[1]} وإلغاء الطلب.`,
  },
  {
    pattern: /^Provider order (.+) linked\. Sync will track it\.$/,
    replacement: (m) => `تم ربط طلب المزود ${m[1]}. ستتابعه المزامنة.`,
  },
  {
    pattern: /^Order placed(?: · #(.+))?\. Track it in Orders\.$/,
    replacement: (m) => `تم إنشاء الطلب${m[1] ? ` · #${m[1]}` : ""}. تابعته في الطلبات.`,
  },
  {
    pattern: /^This credits (.+) to (.+) and marks the order canceled\. It cannot be undone from this screen\.$/,
    replacement: (m) =>
      `سيتم إضافة ${m[1]} إلى ${m[2]} وإلغاء الطلب. لا يمكن التراجع من هذه الشاشة.`,
  },
  {
    pattern: /^Current refund state: (.+)\. Every action is written transactionally and recorded against your admin account\.$/,
    replacement: (m) =>
      `حالة الاسترداد الحالية: ${m[1]}. كل إجراء يُسجّل في معاملة ويُربط بحساب المدير.`,
  },
];

const REFUND_ANOMALIES_AR: Record<string, string> = {
  "Charge is not positive.": "المبلغ المحتسب غير موجب.",
  "Order quantity is invalid for a partial refund.":
    "كمية الطلب غير صالحة للاسترداد الجزئي.",
  "Partial status has no usable remains value.":
    "حالة الطلب الجزئية لا تتضمن كمية متبقية صالحة.",
};

export function providerMessageForCode(
  code: string | null | undefined,
  language: Language
): string | null {
  if (language !== "ar" || !code) return null;
  return PROVIDER_MESSAGES_AR[code] ?? null;
}

export function translateErrorMessage(
  message: string | null | undefined,
  language: Language
): string {
  if (!message) return language === "ar" ? "حدث خطأ غير متوقع." : "";
  if (language !== "ar") return message;

  const trimmed = message.trim();

  if (!trimmed) return "حدث خطأ غير متوقع.";
  if (isArabicText(trimmed) && !hasLatinText(trimmed)) return trimmed;

  const exact = EXACT_MESSAGES[trimmed];

  if (exact) return exact;

  for (const { pattern, replacement } of PATTERNS) {
    const match = trimmed.match(pattern);

    if (match) return replacement(match);
  }

  // Provider/API messages sometimes arrive with a trailing detail sentence.
  for (const [english, arabic] of Object.entries(EXACT_MESSAGES)) {
    if (english.length >= 8 && trimmed.includes(english)) return arabic;
  }

  const anomaly = REFUND_ANOMALIES_AR[trimmed];

  if (anomaly) return anomaly;

  return "حدث خطأ غير متوقع. حاول مرة أخرى أو تواصل مع الدعم.";
}

export function localizeRefundAnomaly(
  anomaly: string | null | undefined,
  language: Language
): string {
  if (!anomaly) return "";
  if (language !== "ar") return anomaly;

  const mapped = REFUND_ANOMALIES_AR[anomaly];

  if (mapped) return mapped;

  if (/^Provider reported negative remains \(\d+\)\.$/.test(anomaly)) {
    return translateErrorMessage(anomaly, language);
  }

  if (
    /^Provider reported remains \(\d+\) greater than quantity \(\d+\)\.$/.test(
      anomaly
    )
  ) {
    return translateErrorMessage(anomaly, language);
  }

  return "حالة استرداد غير طبيعية قيد المراجعة.";
}

export function localizeStatusText(
  status: string,
  language: Language
): string {
  if (language !== "ar") return status;

  const labels: Record<string, string> = {
    pending: "قيد الانتظار",
    processing: "قيد المعالجة",
    in_progress: "قيد التنفيذ",
    completed: "مكتمل",
    partial: "جزئي",
    cancelled: "ملغي",
    canceled: "ملغي",
    failed: "فاشل",
  };

  return labels[status.toLowerCase()] ?? "غير معروف";
}

export function localizeSyncSource(
  source: "cron" | "sync_secret" | "admin" | undefined,
  language: Language
): string {
  if (!source) return "—";
  if (language !== "ar") {
    if (source === "cron") return "Scheduled";
    if (source === "sync_secret") return "Secret trigger";
    return "Manual";
  }

  if (source === "cron") return "مجدول";
  if (source === "sync_secret") return "مشغّل آمن";
  return "يدوي";
}

export function localizeStoredNote(
  note: string | null | undefined,
  language: Language
): string {
  if (!note) return "";
  if (note === "Rejected by admin") {
    return language === "ar" ? "مرفوض من المدير" : note;
  }
  return translateErrorMessage(note, language);
}
