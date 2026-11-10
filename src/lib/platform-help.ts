import type { Bilingual, Language } from "@/lib/i18n";

const b = (en: string, ar: string): Bilingual => ({ en, ar });

export const PAGE_LABELS: Record<string, Bilingual> = {
  "/dashboard": b("Overview", "النظرة العامة"),
  "/new-order": b("New order", "طلب جديد"),
  "/services": b("Services catalog", "كتالوج الخدمات"),
  "/orders": b("Orders", "الطلبات"),
  "/add-funds": b("Add funds", "إضافة رصيد"),
};

export function isAllowedAgentPath(path: string): boolean {
  return Object.prototype.hasOwnProperty.call(PAGE_LABELS, path);
}

export function pageLabel(path: string): Bilingual {
  return PAGE_LABELS[path] ?? b("Page", "صفحة");
}

export interface PlatformHelpEntry {
  id: string;
  title: Bilingual;
  summary: Bilingual;
  why: Bilingual;
  steps: Bilingual[];
  notes?: Bilingual[];
  page?: string;
  keywords: RegExp[];
}

export const PLATFORM_HELP: PlatformHelpEntry[] = [
  {
    id: "general",
    title: b("What BoostHub does", "ماذا تقدم لوحة BoostHub"),
    summary: b(
      "BoostHub is a social media services panel: choose a service, pay from your wallet, and track delivery in one ledger.",
      "BoostHub لوحة خدمات سوشيال ميديا: اختر خدمة، ادفع من محفظتك، وتابع التنفيذ في سجل واحد."
    ),
    why: b(
      "Every screen has one clear job: order, catalog, tracking, or wallet. The assistant can explain any of them and move you to the right page.",
      "كل شاشة لها وظيفة واضحة: الطلب أو الكتالوج أو المتابعة أو المحفظة. يستطيع المساعد شرح أي منها ونقلك للصفحة المناسبة."
    ),
    steps: [
      b("New order: pick a platform, section, service, link, and quantity.", "طلب جديد: اختر المنصة والقسم والخدمة والرابط والكمية."),
      b("Services: browse the full catalog and compare rates.", "الخدمات: تصفح الكتالوج الكامل وقارن الأسعار."),
      b("Orders: track statuses, refills, cancellations, and refunds.", "الطلبات: تابع الحالات والتعويض والإلغاء والاسترداد."),
      b("Add funds: top up the wallet with UPI.", "إضافة رصيد: اشحن المحفظة عبر UPI."),
    ],
    notes: [
      b(
        "Ask the assistant anything about the panel in Arabic or English.",
        "اسأل المساعد عن أي شيء في اللوحة بالعربية أو الإنجليزية."
      ),
    ],
    page: "/dashboard",
    keywords: [],
  },
  {
    id: "ordering",
    title: b("How to place an order", "طريقة إنشاء طلب"),
    summary: b(
      "Choose the platform, the section, the exact service, then enter the target link and quantity.",
      "اختر المنصة ثم القسم ثم الخدمة المحددة، ثم أدخل رابط الهدف والكمية."
    ),
    why: b(
      "The service determines the accepted link type, the quantity range, and the final charge, so the order is validated before any balance is deducted.",
      "الخدمة تحدد نوع الرابط المقبول ونطاق الكمية والمبلغ النهائي، لذلك يتم التحقق من الطلب قبل خصم أي رصيد."
    ),
    steps: [
      b("Open New order from the sidebar.", "افتح «طلب جديد» من القائمة الجانبية."),
      b("Pick the platform, then the section, then the service.", "اختر المنصة ثم القسم ثم الخدمة."),
      b("Paste the exact target link or username.", "الصق رابط الهدف أو اسم المستخدم المطلوب بالضبط."),
      b("Enter the quantity and review the total charge.", "أدخل الكمية وراجع إجمالي المبلغ."),
      b("Press Place order. The balance is deducted immediately.", "اضغط «تأكيد الطلب». يُخصم المبلغ من الرصيد فورًا."),
    ],
    notes: [
      b(
        "Keep the account or content public until delivery finishes.",
        "أبقِ الحساب أو المحتوى عامًا حتى ينتهي التنفيذ."
      ),
      b(
        "Do not submit the same link and service twice while an order is active.",
        "لا ترسل نفس الرابط ونفس الخدمة مرتين أثناء وجود طلب نشط."
      ),
    ],
    page: "/new-order",
    keywords: [
      /\b(place|create|make|submit|buy)\b.*\border\b/i,
      /\bhow\b.*\border\b/i,
      /أطلب|اطلب|إنشاء طلب|انشاء طلب|كيف أطلب|كيف اطلب|شراء خدمة/,
    ],
  },
  {
    id: "pricing",
    title: b("How pricing works", "طريقة حساب السعر"),
    summary: b(
      "Every service is priced per 1,000 units. The charge is the service rate multiplied by your quantity, divided by 1,000.",
      "كل خدمة مسعّرة لكل 1000 وحدة. المبلغ = سعر الخدمة × الكمية ÷ 1000."
    ),
    why: b(
      "The rate is shown before ordering so the total is known in advance. The minimum charge for any order is ₹0.01.",
      "يظهر السعر قبل الطلب حتى تعرف الإجمالي مسبقًا. الحد الأدنى لأي طلب هو ₹0.01."
    ),
    steps: [
      b("Open Services or New order.", "افتح «الخدمات» أو «طلب جديد»."),
      b("Check the rate shown per 1,000 units.", "راجع السعر المعروض لكل 1000 وحدة."),
      b("Multiply by your quantity and divide by 1,000.", "اضرب السعر في الكمية ثم اقسم على 1000."),
      b("The panel shows the exact total before you confirm.", "تعرض اللوحة الإجمالي الدقيق قبل التأكيد."),
    ],
    notes: [
      b(
        "The displayed price is the customer price. There are no hidden fees at checkout.",
        "السعر المعروض هو سعر العميل. لا توجد رسوم مخفية عند الدفع."
      ),
    ],
    page: "/services",
    keywords: [
      /\bprice|pricing|rate|cost|charge|how much\b/i,
      /سعر|أسعار|اسعار|تكلفة|كم سعر|كم يكلف|حساب السعر|المبلغ/,
    ],
  },
  {
    id: "links",
    title: b("Which link to use", "الرابط المطلوب"),
    summary: b(
      "Use the exact public link the service asks for: a profile, post, reel, video, story, live stream, channel, or track.",
      "استخدم الرابط العام الدقيق الذي تطلبه الخدمة: ملف شخصي أو منشور أو ريلز أو فيديو أو ستوري أو بث أو قناة أو مقطع."
    ),
    why: b(
      "A wrong link type is rejected by the provider, so the panel validates it before ordering.",
      "نوع الرابط الخاطئ يُرفض من المزود، لذلك تتحقق اللوحة منه قبل الطلب."
    ),
    steps: [
      b("Open the service and read Accepted link format.", "افتح الخدمة واقرأ «صيغة الرابط المقبولة»."),
      b("Copy the full URL, not a screenshot or short name.", "انسخ الرابط الكامل، لا صورة أو اسمًا مختصرًا."),
      b("Make sure there are no spaces in the link.", "تأكد من عدم وجود مسافات في الرابط."),
      b("For profile services, a username alone may be accepted.", "لخدمات الملف الشخصي، قد يُقبل اسم المستخدم وحده."),
    ],
    notes: [
      b(
        "The account, post, story, or live stream must stay public for the whole delivery window.",
        "يجب أن يبقى الحساب أو المنشور أو الستوري أو البث عامًا طوال فترة التنفيذ."
      ),
      b(
        "For Instagram followers, turn off Settings → Follow and invite friends → Flag for review.",
        "لمتابعي إنستغرام، أوقف: الإعدادات ← المتابعة ودعوة الأصدقاء ← تمييز للمراجعة."
      ),
    ],
    page: "/new-order",
    keywords: [
      /\blink|url|username|target|profile\b/i,
      /رابط|الرابط|يوزر|اسم المستخدم|الهدف|بروفايل/,
    ],
  },
  {
    id: "deposits",
    title: b("How to add funds with UPI", "طريقة إضافة الرصيد عبر UPI"),
    summary: b(
      "Pay by UPI, then submit the transaction reference (UTR). An administrator verifies it before the balance changes.",
      "ادفع عبر UPI ثم أرسل رقم مرجع العملية (UTR). يتحقق المدير منه قبل تحديث الرصيد."
    ),
    why: b(
      "UPI transfers are verified manually to protect both the customer and the wallet balance.",
      "تُتحقق تحويلات UPI يدويًا لحماية العميل والرصيد معًا."
    ),
    steps: [
      b("Open Add funds.", "افتح «إضافة رصيد»."),
      b("Send the exact amount to the UPI ID or scan the QR code.", "أرسل المبلغ بالضبط إلى معرف UPI أو امسح رمز QR."),
      b("Copy the UTR / transaction reference from your UPI app.", "انسخ رقم UTR أو مرجع العملية من تطبيق UPI."),
      b("Submit the amount and UTR.", "أرسل المبلغ ورقم UTR."),
      b("Wait for admin approval; the balance appears after verification.", "انتظر موافقة المدير؛ يظهر الرصيد بعد التحقق."),
    ],
    notes: [
      b("Minimum deposit is ₹10 and maximum is ₹100,000.", "الحد الأدنى للإيداع ₹10 والأقصى ₹100,000."),
      b(
        "Each UTR can be submitted once. A rejected deposit keeps its reference, so check history before retrying.",
        "كل رقم UTR يُرسل مرة واحدة. الإيداع المرفوض يحتفظ بمرجعه، لذا راجع السجل قبل إعادة المحاولة."
      ),
    ],
    page: "/add-funds",
    keywords: [
      /\bdeposit|add funds|top.?up|upi|utr|transaction reference\b/i,
      /إيداع|ايداع|شحن|أضيف رصيد|اضيف رصيد|إضافة رصيد|اضافة رصيد|UPI|UTR|مرجع العملية|تحويل/,
    ],
  },
  {
    id: "wallet",
    title: b("Wallet balance", "رصيد المحفظة"),
    summary: b(
      "The wallet pays for orders. Each order deducts its charge immediately, and refunds return to the same wallet.",
      "المحفظة تدفع قيمة الطلبات. كل طلب يخصم مبلغه فورًا، والاسترداد يعود إلى نفس المحفظة."
    ),
    why: b(
      "Keeping the balance in one wallet makes the available amount and every deduction visible in one place.",
      "تجميع الرصيد في محفظة واحدة يجعل المتاح وكل خصم ظاهرًا في مكان واحد."
    ),
    steps: [
      b("Your current balance appears in the header and on the Overview page.", "يظهر رصيدك الحالي في الهيدر وصفحة النظرة العامة."),
      b("If the balance is below the order total, the Place order button is disabled.", "إذا كان الرصيد أقل من إجمالي الطلب، يُعطّل زر تأكيد الطلب."),
      b("Add funds from Add funds, then return to the order form.", "أضف رصيدًا من صفحة إضافة الرصيد ثم عد إلى نموذج الطلب."),
    ],
    page: "/add-funds",
    keywords: [
      /\bbalance|wallet|funds|insufficient\b/i,
      /رصيد|محفظة|الرصيد|المحفظة|غير كاف|غير كافي/,
    ],
  },
  {
    id: "orders",
    title: b("Tracking orders", "متابعة الطلبات"),
    summary: b(
      "The Orders page lists every order with its status, provider reference, charge, date, and available actions.",
      "صفحة الطلبات تعرض كل طلب مع حالته ومرجع المزود والمبلغ والتاريخ والإجراءات المتاحة."
    ),
    why: b(
      "Statuses are synchronized from the provider automatically, so you see progress without refreshing manually.",
      "تُزامن الحالات من المزود تلقائيًا، لذلك ترى التقدم دون تحديث يدوي."
    ),
    steps: [
      b("Open Orders from the sidebar.", "افتح «الطلبات» من القائمة الجانبية."),
      b("Use the status tabs to filter: all, pending, in progress, completed, partial, canceled.", "استخدم تبويبات الحالة: الكل، قيد الانتظار، قيد التنفيذ، مكتمل، جزئي، ملغي."),
      b("Open any order to see its target link and details.", "افتح أي طلب لعرض رابطه وتفاصيله."),
      b("Use Refill or Cancel when the buttons are available.", "استخدم «تعويض» أو «إلغاء» عند ظهور الأزرار."),
    ],
    notes: [
      b(
        "The page refreshes active orders automatically while it is open.",
        "تُحدّث الصفحة الطلبات النشطة تلقائيًا أثناء فتحها."
      ),
    ],
    page: "/orders",
    keywords: [
      /\borders?|track|tracking|status\b/i,
      /طلبات|طلبي|الطلب|تتبع|متابعة|حالة الطلب|حالة طلبي/,
    ],
  },
  {
    id: "statuses",
    title: b("Order status meanings", "معاني حالات الطلب"),
    summary: b(
      "Pending means received; In progress means delivery started; Completed means finished; Partial means part delivered; Canceled or Failed means stopped.",
      "قيد الانتظار: تم الاستلام. قيد التنفيذ: بدأ التسليم. مكتمل: انتهى. جزئي: تم تسليم جزء. ملغي أو فاشل: توقف."
    ),
    why: b(
      "Each status tells you whether to wait, keep the link public, or request an action. Partial orders usually refund the undelivered part automatically.",
      "كل حالة تخبرك هل تنتظر أو تبقي الرابط عامًا أو تطلب إجراءً. الطلبات الجزئية عادة تُسترد قيمتها غير المسلّمة تلقائيًا."
    ),
    steps: [
      b("Pending: wait and keep the account/content public.", "قيد الانتظار: انتظر وأبقِ الحساب/المحتوى عامًا."),
      b("In progress: do not change the username or delete the content.", "قيد التنفيذ: لا تغيّر اسم المستخدم أو تحذف المحتوى."),
      b("Completed: the full quantity was delivered; refill starts from completion when included.", "مكتمل: تم تسليم الكمية كاملة؛ يبدأ التعويض من الاكتمال عند توفره."),
      b("Partial: the unused part is refunded automatically.", "جزئي: يُسترد الجزء غير المستخدم تلقائيًا."),
      b("Canceled or Failed: check the refund note under the status.", "ملغي أو فاشل: راجع ملاحظة الاسترداد أسفل الحالة."),
    ],
    page: "/orders",
    keywords: [
      /\bpending|in progress|partial|completed|canceled|failed|refunded\b/i,
      /قيد الانتظار|قيد التنفيذ|مكتمل|جزئي|ملغي|فاشل|مسترد|معنى الحالة/,
    ],
  },
  {
    id: "refill",
    title: b("Refill guarantee", "ضمان التعويض"),
    summary: b(
      "A refill restores a drop in a completed order when the service includes a refill guarantee.",
      "التعويض يعالج النقصان في طلب مكتمل عندما تكون الخدمة تشمل ضمان تعويض."
    ),
    why: b(
      "Refills are limited by the guarantee window and by the provider, so the button appears only while the order is eligible.",
      "التعويض محدود بمدة الضمان وبالمزود، لذلك يظهر الزر فقط أثناء أهلية الطلب."
    ),
    steps: [
      b("Open Orders and find the completed order.", "افتح «الطلبات» وابحث عن الطلب المكتمل."),
      b("Press Refill when it is available.", "اضغط «تعويض» عند توفره."),
      b("Wait for provider confirmation; the order status updates automatically.", "انتظر تأكيد المزود؛ تتحدث حالة الطلب تلقائيًا."),
    ],
    notes: [
      b(
        "Orders without a refill guarantee cannot be refilled. Repeated refills have a cooldown.",
        "الطلبات بدون ضمان تعويض لا يمكن تعويضها. التعويض المتكرر له فترة انتظار."
      ),
    ],
    page: "/orders",
    keywords: [/\brefill|guarantee\b/i, /تعويض|ضمان|ريفيل|نقصان/],
  },
  {
    id: "cancel",
    title: b("Canceling an order", "إلغاء الطلب"),
    summary: b(
      "Cancellation can be requested only while the order is pending or in progress and the service supports it.",
      "يمكن طلب الإلغاء فقط أثناء انتظار الطلب أو تنفيذه وعندما تدعم الخدمة الإلغاء."
    ),
    why: b(
      "The provider must confirm the cancellation. The refund is credited only after that confirmation.",
      "يجب أن يؤكد المزود الإلغاء. يُضاف المبلغ المسترد فقط بعد هذا التأكيد."
    ),
    steps: [
      b("Open Orders and locate the active order.", "افتح «الطلبات» وحدد الطلب النشط."),
      b("Press Cancel and confirm the request.", "اضغط «إلغاء» وأكد الطلب."),
      b("Wait for the provider confirmation; the refund note updates automatically.", "انتظر تأكيد المزود؛ تتحدث ملاحظة الاسترداد تلقائيًا."),
    ],
    notes: [
      b(
        "Completed orders and services without cancellation support cannot be canceled.",
        "الطلبات المكتملة والخدمات التي لا تدعم الإلغاء لا يمكن إلغاؤها."
      ),
    ],
    page: "/orders",
    keywords: [/\bcancel|cancellation\b/i, /إلغاء|الغاء|ألغي|الغي|إلغاء الطلب/],
  },
  {
    id: "refunds",
    title: b("Refunds", "الاسترداد"),
    summary: b(
      "If an order is canceled or fails, the charge returns to your wallet. Partial orders refund only the undelivered part.",
      "إذا أُلغي الطلب أو فشل، يعود المبلغ إلى محفظتك. الطلبات الجزئية تُسترد فقط قيمة الجزء غير المسلّم."
    ),
    why: b(
      "Refunds are calculated from the unused quantity so you pay only for what was actually delivered.",
      "يُحسب الاسترداد من الكمية غير المستخدمة حتى تدفع فقط مقابل ما تم تسليمه فعليًا."
    ),
    steps: [
      b("Open Orders and check the refund note under the status.", "افتح «الطلبات» وراجع ملاحظة الاسترداد أسفل الحالة."),
      b("If the note says awaiting provider refund, no action is needed; it updates automatically.", "إذا كانت الملاحظة «بانتظار استرداد المزود»، لا تحتاج إجراءً؛ تتحدث تلقائيًا."),
      b("If the amount is missing after confirmation, contact support with the order ID.", "إذا لم يصل المبلغ بعد التأكيد، تواصل مع الدعم مع رقم الطلب."),
    ],
    page: "/orders",
    keywords: [/\brefund|money back\b/i, /استرداد|مسترد|استرجاع|فلوسي|المبلغ/],
  },
  {
    id: "dripfeed",
    title: b("Drip-feed delivery", "التسليم المرحلي"),
    summary: b(
      "Drip-feed splits the quantity into scheduled runs instead of delivering everything at once.",
      "التسليم المرحلي يقسم الكمية إلى دفعات مجدولة بدل تسليم كل شيء دفعة واحدة."
    ),
    why: b(
      "It looks more natural and keeps activity steady over time. It is available only on services marked Drip-feed supported.",
      "يبدو أكثر طبيعية ويحافظ على نشاط ثابت. متاح فقط للخدمات التي تدعم التسليم المرحلي."
    ),
    steps: [
      b("Select a service that shows Drip-feed supported.", "اختر خدمة تظهر عليها «يدعم التغذية المرحلية»."),
      b("Enable Drip-feed delivery in the order form.", "فعّل «التسليم المرحلي» في نموذج الطلب."),
      b("Set the number of runs and the interval in minutes.", "حدد عدد الدفعات والفاصل بالدقائق."),
      b("Confirm the order and keep the link public until the last run.", "أكد الطلب وأبقِ الرابط عامًا حتى آخر دفعة."),
    ],
    page: "/new-order",
    keywords: [/\bdrip.?feed|runs|interval\b/i, /تجزئة|تغذية مرحلية|دفعات|تسليم مرحلي|فاصل/],
  },
  {
    id: "comments",
    title: b("Custom comments", "التعليقات المخصصة"),
    summary: b(
      "Custom comment services require one comment per line. The quantity is set from the number of lines.",
      "خدمات التعليقات المخصصة تتطلب تعليقًا واحدًا في كل سطر. تُضبط الكمية من عدد الأسطر."
    ),
    why: b(
      "The provider delivers exactly the comments you submit, so the quantity must match the line count.",
      "المزود يسلّم التعليقات التي ترسلها بالضبط، لذلك يجب أن تطابق الكمية عدد الأسطر."
    ),
    steps: [
      b("Choose a service whose type is Custom Comments.", "اختر خدمة نوعها «تعليقات مخصصة»."),
      b("Write one comment per line in the comments box.", "اكتب تعليقًا واحدًا في كل سطر داخل مربع التعليقات."),
      b("The quantity updates automatically from the line count.", "تتحدث الكمية تلقائيًا من عدد الأسطر."),
      b("Submit the order.", "أرسل الطلب."),
    ],
    notes: [
      b("Maximum 300 lines, and each comment can be up to 500 characters.", "الحد الأقصى 300 سطر، وكل تعليق حتى 500 حرف."),
    ],
    page: "/new-order",
    keywords: [/\bcustom comments|comments?\b/i, /تعليقات مخصصة|تعليقات|كومنت/],
  },
  {
    id: "account",
    title: b("Account and language", "الحساب واللغة"),
    summary: b(
      "You can reset your password, change the interface language, and sign out from the header menu.",
      "يمكنك إعادة تعيين كلمة المرور وتغيير لغة الواجهة وتسجيل الخروج من قائمة الحساب في الهيدر."
    ),
    why: b(
      "The language choice is saved to your account, so it is applied on your next sign-in.",
      "اختيار اللغة يُحفظ في حسابك، لذلك يُطبّق عند تسجيل الدخول التالي."
    ),
    steps: [
      b("Use Forgot password on the sign-in page to reset the password.", "استخدم «نسيت كلمة المرور» في صفحة الدخول لإعادة تعيين كلمة المرور."),
      b("Use the EN / ع toggle in the header to change the language.", "استخدم مفتاح EN / ع في الهيدر لتغيير اللغة."),
      b("Open the account menu in the header to sign out.", "افتح قائمة الحساب في الهيدر لتسجيل الخروج."),
    ],
    page: "/dashboard",
    keywords: [/\baccount|password|language|sign out|logout\b/i, /حساب|كلمة المرور|اللغة|لغة|خروج|تسجيل الخروج/],
  },
  {
    id: "support",
    title: b("Contacting support", "التواصل مع الدعم"),
    summary: b(
      "Contact support from the Overview page by WhatsApp or phone, and include the order ID.",
      "تواصل مع الدعم من صفحة النظرة العامة عبر واتساب أو الهاتف، وأرفق رقم الطلب."
    ),
    why: b(
      "The order ID lets support find the exact order, provider reference, and refund state quickly.",
      "رقم الطلب يمكّن الدعم من إيجاد الطلب ومرجع المزود وحالة الاسترداد بسرعة."
    ),
    steps: [
      b("Open Overview and scroll to the support line.", "افتح النظرة العامة وانزل إلى سطر الدعم."),
      b("Send the order ID and a clear description of the issue.", "أرسل رقم الطلب ووصفًا واضحًا للمشكلة."),
      b("If money is involved, include the charge amount and the refund note.", "إذا كان الأمر متعلقًا بالمال، أرفق المبلغ وملاحظة الاسترداد."),
    ],
    page: "/dashboard",
    keywords: [/\bsupport|contact|whatsapp|help me\b/i, /دعم|تواصل|واتساب|مساعدة|مشكلة/],
  },
  {
    id: "navigation",
    title: b("Finding a page", "الوصول إلى الصفحة"),
    summary: b(
      "Overview shows your summary; New order creates an order; Services lists the catalog; Orders tracks purchases; Add funds tops up the wallet.",
      "النظرة العامة تعرض الملخص؛ طلب جديد لإنشاء طلب؛ الخدمات للكتالوج؛ الطلبات للمتابعة؛ إضافة رصيد لشحن المحفظة."
    ),
    why: b(
      "Each screen has one job, so the assistant can move you directly to the page you need.",
      "كل شاشة لها وظيفة واحدة، لذلك يستطيع المساعد نقلك مباشرة إلى الصفحة التي تحتاجها."
    ),
    steps: [
      b("Ask the assistant to open a page, or use the sidebar.", "اطلب من المساعد فتح صفحة، أو استخدم القائمة الجانبية."),
      b("Current page: from the header title.", "الصفحة الحالية: من عنوان الهيدر."),
    ],
    page: "/dashboard",
    keywords: [/\bpage|navigate|where|open\b/i, /صفحة|صفحة|أين|اين|افتح|خذني|ودني|انتقل|روح/],
  },
  {
    id: "safety",
    title: b("Safety rules", "قواعد الأمان"),
    summary: b(
      "Never share your password, keep the target public, and avoid duplicate orders for the same link.",
      "لا تشارك كلمة المرور، وأبقِ الهدف عامًا، وتجنب تكرار الطلب لنفس الرابط."
    ),
    why: b(
      "The provider needs public access to deliver, and duplicates can be rejected or charged twice.",
      "المزود يحتاج وصولًا عامًا للتنفيذ، والتكرار قد يُرفض أو يُخصم مرتين."
    ),
    steps: [
      b("Keep the account or content public until delivery ends.", "أبقِ الحساب أو المحتوى عامًا حتى ينتهي التسليم."),
      b("Do not change the username or delete the post during delivery.", "لا تغيّر اسم المستخدم أو تحذف المنشور أثناء التنفيذ."),
      b("Do not share your panel password with anyone.", "لا تشارك كلمة مرور اللوحة مع أي شخص."),
      b("Wait for the current order to finish before ordering the same link again.", "انتظر انتهاء الطلب الحالي قبل طلب نفس الرابط مرة أخرى."),
    ],
    page: "/new-order",
    keywords: [/\bsafe|safety|scam|password|public\b/i, /أمان|امان|احتيال|نصب|كلمة المرور|عام|آمن/],
  },
  {
    id: "troubleshooting",
    title: b("Common problems", "المشاكل الشائعة"),
    summary: b(
      "Most issues are a link mismatch, insufficient balance, a pending deposit, or an order still processing at the provider.",
      "أغلب المشاكل هي رابط غير متوافق أو رصيد غير كافٍ أو إيداع معلّق أو طلب ما زال قيد المعالجة لدى المزود."
    ),
    why: b(
      "Checking these four points first usually explains the symptom without waiting for support.",
      "فحص هذه النقاط الأربع أولًا يفسر المشكلة عادة دون انتظار الدعم."
    ),
    steps: [
      b("Link rejected: re-read Accepted link format and use the exact public URL.", "رفض الرابط: أعد قراءة «صيغة الرابط المقبولة» واستخدم الرابط العام الدقيق."),
      b("Insufficient balance: add funds, then return to the form.", "رصيد غير كافٍ: أضف رصيدًا ثم عد إلى النموذج."),
      b("Deposit pending: wait for admin verification; each UTR is submitted once.", "إيداع معلّق: انتظر تحقق المدير؛ كل UTR يُرسل مرة واحدة."),
      b("Order not moving: keep the link public and wait for the provider sync.", "الطلب لا يتحرك: أبقِ الرابط عامًا وانتظر مزامنة المزود."),
    ],
    page: "/orders",
    keywords: [/\bproblem|issue|error|not working|stuck|failed\b/i, /مشكلة|خطأ|خطا|لا يعمل|معلق|معلّق|فشل|رفض/],
  },
  {
    id: "services",
    title: b("Understanding the catalog", "فهم الكتالوج"),
    summary: b(
      "The catalog groups services by platform and section. Each row shows the rate, quantity range, average time, and refill/cancel flags.",
      "الكتالوج يجمع الخدمات حسب المنصة والقسم. كل صف يعرض السعر ونطاق الكمية ومتوسط الوقت وخيارات التعويض والإلغاء."
    ),
    why: b(
      "These flags tell you what the service supports before you pay, so you can choose the right one.",
      "هذه العلامات تخبرك بما تدعمه الخدمة قبل الدفع، حتى تختار المناسب."
    ),
    steps: [
      b("Use platform chips to narrow the catalog.", "استخدم شرائح المنصات لتضييق الكتالوج."),
      b("Use the section chips to choose followers, likes, views, comments, and more.", "استخدم شرائح الأقسام لاختيار المتابعين أو الإعجابات أو المشاهدات أو التعليقات."),
      b("Search by service name, ID, or category.", "ابحث باسم الخدمة أو المعرف أو القسم."),
      b("Open the service to see its exact link format and guarantee.", "افتح الخدمة لعرض صيغة الرابط والضمان."),
    ],
    page: "/services",
    keywords: [/\bservices?|catalog|categor(y|ies)\b/i, /خدمات|خدمة|كتالوج|قسم|أقسام|اقسام/],
  },
];

export function getPlatformHelp(id: string): PlatformHelpEntry | null {
  return PLATFORM_HELP.find((entry) => entry.id === id) ?? null;
}

export function matchPlatformHelp(text: string): PlatformHelpEntry | null {
  const value = text.trim();

  if (!value) return null;

  for (const entry of PLATFORM_HELP) {
    if (entry.keywords.some((pattern) => pattern.test(value))) {
      return entry;
    }
  }

  return null;
}

export function helpReply(
  entry: PlatformHelpEntry,
  language: Language
): string {
  const pick = (value: Bilingual) =>
    language === "ar" ? value.ar : value.en;

  const lines = [pick(entry.title), pick(entry.summary), "", pick(entry.why)];

  if (entry.steps.length) {
    lines.push("");
    entry.steps.forEach((step, index) => {
      lines.push(`${index + 1}. ${pick(step)}`);
    });
  }

  if (entry.notes?.length) {
    lines.push("");
    entry.notes.forEach((note) => {
      lines.push(`- ${pick(note)}`);
    });
  }

  return lines.join("\n");
}

export function helpToolData(entry: PlatformHelpEntry) {
  return {
    id: entry.id,
    title: entry.title,
    summary: entry.summary,
    why: entry.why,
    steps: entry.steps,
    notes: entry.notes ?? [],
    page: entry.page ?? null,
    pageLabel: entry.page ? pageLabel(entry.page) : null,
  };
}
