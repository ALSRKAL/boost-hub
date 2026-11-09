/**
 * Deterministic Arabic localization for provider-supplied catalog text.
 *
 * The upstream SMM provider returns ~2,200 service names and ~340 category
 * names in English marketing prose. This module turns them into readable
 * Arabic without network calls, preserving numbers, emojis, and technical
 * tokens (API, UPI, UTR, QR, INR, ID). Anything that cannot be translated is
 * dropped rather than leaked as English into the Arabic interface.
 */

const ALLOWED_LATIN = new Set([
  "API",
  "UPI",
  "UTR",
  "QR",
  "INR",
  "ID",
  "SMS",
  "SEO",
  "AI",
]);

const PLATFORMS: Array<{ source: string; label: string }> = [
  {
    source: "instagram|insta|ig|imstagram|instgaram|nstagram|instanat",
    label: "إنستغرام",
  },
  { source: "tiktok|tik\\s*tok|tik", label: "تيك توك" },
  { source: "youtube|yt", label: "يوتيوب" },
  { source: "telegram|tg", label: "تيليجرام" },
  { source: "facebook|fb", label: "فيسبوك" },
  { source: "twitter|x\\.com|twitter|x", label: "إكس (تويتر)" },
  { source: "snapchat|snap", label: "سناب شات" },
  { source: "spotify", label: "سبوتيفاي" },
  { source: "whatsapp|wa", label: "واتساب" },
  { source: "discord", label: "ديسكورد" },
  { source: "linkedin", label: "لينكدإن" },
  { source: "shopee", label: "شوبي" },
  { source: "substack", label: "سبستاك" },
  { source: "soundcloud", label: "ساوند كلاود" },
  { source: "twitch", label: "تويتش" },
  { source: "coinmarketcap", label: "كوين ماركت كاب" },
  { source: "google", label: "جوجل" },
  { source: "website|web", label: "موقع" },
];

const NOUNS: Array<{ source: string; label: string }> = [
  { source: "followers?", label: "متابعين" },
  { source: "subscribers?", label: "مشتركين" },
  { source: "members?", label: "أعضاء" },
  { source: "joiners?", label: "منضمين" },
  { source: "likes?", label: "إعجابات" },
  { source: "reactions?", label: "تفاعلات" },
  { source: "recations?", label: "تفاعلات" },
  { source: "reacticons?", label: "تفاعلات" },
  { source: "comments?", label: "تعليقات" },
  { source: "reviews?", label: "مراجعات" },
  { source: "views?", label: "مشاهدات" },
  { source: "viewers?", label: "مشاهدين" },
  { source: "plays?", label: "تشغيلات" },
  { source: "streams?", label: "بث" },
  { source: "shares?", label: "مشاركات" },
  { source: "saves?", label: "حفظ" },
  { source: "reposts?", label: "إعادة نشر" },
  { source: "retweets?", label: "إعادة تغريد" },
  { source: "tweets?", label: "تغريدات" },
  { source: "mentions?", label: "إشارات" },
  { source: "votes?", label: "تصويتات" },
  { source: "poll|polls|pole", label: "استطلاعات" },
  { source: "impressions?", label: "مرات ظهور" },
  { source: "reach", label: "وصول" },
  { source: "visits?", label: "زيارات" },
  { source: "clicks?", label: "نقرات" },
  { source: "installs?", label: "تثبيتات" },
  { source: "downloads?", label: "تنزيلات" },
  { source: "videos?", label: "فيديوهات" },
  { source: "shorts?", label: "شورتس" },
  { source: "reels?", label: "ريلز" },
  { source: "stor(?:y|ies)", label: "ستوري" },
  { source: "posts?", label: "منشورات" },
  { source: "photos?", label: "صور" },
  { source: "profiles?", label: "ملفات شخصية" },
  { source: "accounts?", label: "حسابات" },
  { source: "channels?", label: "قنوات" },
  { source: "groups?", label: "مجموعات" },
  { source: "pages?", label: "صفحات" },
  { source: "links?", label: "روابط" },
  { source: "messages?", label: "رسائل" },
  { source: "chats?", label: "محادثات" },
  { source: "shares?", label: "مشاركات" },
  { source: "endorsements?", label: "تزكيات" },
  { source: "connections?", label: "اتصالات" },
  { source: "recommendations?", label: "توصيات" },
  { source: "restacks?", label: "إعادة نشر" },
  { source: "sends?", label: "إرسالات" },
  { source: "replies?", label: "ردود" },
  { source: "threads?", label: "سلاسل" },
  { source: "bookmarks?", label: "إشارات مرجعية" },
  { source: "listeners?", label: "مستمعين" },
  { source: "follows?", label: "متابعات" },
];

const MODIFIERS: Array<{ source: string; label: string }> = [
  { source: "real|genuine", label: "حقيقي" },
  { source: "hq|high\\s*quality", label: "جودة عالية" },
  { source: "premium", label: "بريميوم" },
  { source: "lq|low\\s*quality", label: "جودة منخفضة" },
  { source: "cheap(?:est)?|chepest", label: "الأرخص" },
  { source: "fast(?:est)?|super\\s*fast|superfast|ultra\\s*fast|ultrafast", label: "سريع" },
  { source: "instant|super\\s*instant|superinstant", label: "فوري" },
  { source: "non\\s*drop|no\\s*drop|nondrop|nodrop", label: "بدون نقصان" },
  { source: "low\\s*drop", label: "نقصان قليل" },
  { source: "guaranteed|guarantee", label: "مضمون" },
  { source: "lifetime", label: "مدى الحياة" },
  { source: "active|working|works", label: "نشط" },
  { source: "positive", label: "إيجابي" },
  { source: "negative", label: "سلبي" },
  { source: "indian", label: "هندي" },
  { source: "usa|american", label: "أمريكي" },
  { source: "arab(?:ic)?", label: "عربي" },
  { source: "turkish|turk", label: "تركي" },
  { source: "russian", label: "روسي" },
  { source: "brazilian", label: "برازيلي" },
  { source: "egyptian", label: "مصري" },
  { source: "targeted", label: "مستهدف" },
  { source: "worldwide|global", label: "عالمي" },
  { source: "new|latest", label: "جديد" },
  { source: "old", label: "قديم" },
  { source: "verified", label: "موثّق" },
  { source: "female", label: "إناث" },
  { source: "male", label: "ذكور" },
  { source: "stable", label: "مستقر" },
  { source: "smooth", label: "سلس" },
  { source: "exclusive", label: "حصري" },
  { source: "manual", label: "يدوي" },
  { source: "auto|automatic", label: "تلقائي" },
  { source: "monetizable", label: "قابل للربح" },
  { source: "unique", label: "فريد" },
  { source: "concurrent", label: "متزامن" },
  { source: "unlimited", label: "غير محدود" },
  { source: "limited", label: "محدود" },
  { source: "bonus", label: "إضافي" },
  { source: "free", label: "مجاني" },
  { source: "cheapest", label: "الأرخص" },
  { source: "best", label: "الأفضل" },
  { source: "good", label: "جيد" },
  { source: "bad", label: "سيئ" },
];

const PHRASES: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /\bno\s*refills?\b/gi, replacement: "بدون تعويض" },
  { pattern: /\bnon\s*refills?\b/gi, replacement: "بدون تعويض" },
  { pattern: /\bno\s*cancel(?:lation)?\b/gi, replacement: "بدون إلغاء" },
  { pattern: /\bflag\s*off\b/gi, replacement: "إيقاف العلامة" },
  { pattern: /\bflag\s*on\b/gi, replacement: "تشغيل العلامة" },
  { pattern: /\bauto\s+negative\s+reactions?\b/gi, replacement: "تفاعلات سلبية تلقائية" },
  { pattern: /\bauto\s+positive\s+reactions?\b/gi, replacement: "تفاعلات إيجابية تلقائية" },
  { pattern: /\bnegative\s+reactions?\b/gi, replacement: "تفاعلات سلبية" },
  { pattern: /\bpositive\s+reactions?\b/gi, replacement: "تفاعلات إيجابية" },
  { pattern: /\bbonus\s+views?\b/gi, replacement: "مشاهدات إضافية" },
  { pattern: /\bbonus\s+followers?\b/gi, replacement: "متابعين إضافيين" },
  { pattern: /\bvideo\s+views?\b/gi, replacement: "مشاهدات فيديو" },
  { pattern: /\bpost\s+views?\b/gi, replacement: "مشاهدات منشورات" },
  { pattern: /\bstory\s+views?\b/gi, replacement: "مشاهدات ستوري" },
  { pattern: /\breels?\s+views?\b/gi, replacement: "مشاهدات ريلز" },
  { pattern: /\bprofile\s+views?\b/gi, replacement: "مشاهدات ملف شخصي" },
  { pattern: /\bpage\s+likes?\b/gi, replacement: "إعجابات الصفحة" },
  { pattern: /\bpost\s+likes?\b/gi, replacement: "إعجابات المنشور" },
  { pattern: /\bwatch\s*time\b/gi, replacement: "وقت مشاهدة" },
  { pattern: /\bwatch\s*hours?\b/gi, replacement: "ساعات مشاهدة" },
  { pattern: /\blive\s*stream(?:s|ing)?\b/gi, replacement: "بث مباشر" },
  { pattern: /\bcustom\s*comments?\b/gi, replacement: "تعليقات مخصصة" },
  { pattern: /\brandom\s*comments?\b/gi, replacement: "تعليقات عشوائية" },
  { pattern: /\bfuture\s*posts?\b/gi, replacement: "منشورات مستقبلية" },
  { pattern: /\blast\s*(\d+)\s*posts?\b/gi, replacement: "آخر $1 منشور" },
  { pattern: /\blast\s*post\b/gi, replacement: "آخر منشور" },
  { pattern: /\bmax\s*unlimited\b/gi, replacement: "الحد الأقصى غير محدود" },
  { pattern: /\binstant\s*start\b/gi, replacement: "بدء فوري" },
  { pattern: /\bhigh\s*quality\b/gi, replacement: "جودة عالية" },
  { pattern: /\bnon\s*drop\b/gi, replacement: "بدون نقصان" },
  { pattern: /\bno\s*drop\b/gi, replacement: "بدون نقصان" },
  { pattern: /\blow\s*drop\b/gi, replacement: "نقصان قليل" },
  { pattern: /\bmoney\s*back\b/gi, replacement: "استرداد المال" },
  { pattern: /\bbest\s*services?\b/gi, replacement: "أفضل الخدمات" },
  { pattern: /\bcheapest\s*services?\b/gi, replacement: "أرخص الخدمات" },
  { pattern: /\bfast\s*services?\b/gi, replacement: "خدمات سريعة" },
  { pattern: /\breal\s*active\b/gi, replacement: "حقيقي ونشط" },
  { pattern: /\bhigh\s*speed\b/gi, replacement: "سرعة عالية" },
  { pattern: /\bsuper\s*fast\b/gi, replacement: "سريع جداً" },
  { pattern: /\bultra\s*fast\b/gi, replacement: "فائق السرعة" },
  { pattern: /\bnot\s*enough\s*data\b/gi, replacement: "بيانات غير كافية" },
  { pattern: /\b0\s*-\s*10\s*(?:mints?|minutes?)\b/gi, replacement: "0-10 دقائق" },
  { pattern: /\b(?:mints?|minutes?)\b/gi, replacement: "دقائق" },
  { pattern: /\b(\d+)\s*mins?\b/gi, replacement: "$1 دقيقة" },
  { pattern: /\bhrs?\b/gi, replacement: "ساعة" },
  { pattern: /\bhours?\b/gi, replacement: "ساعة" },
  { pattern: /\bseconds?\b/gi, replacement: "ثانية" },
  { pattern: /\bsecs?\b/gi, replacement: "ثانية" },
  { pattern: /\bdays?\b/gi, replacement: "يوم" },
  { pattern: /\bmonths?\b/gi, replacement: "شهر" },
  { pattern: /\byears?\b/gi, replacement: "سنة" },
  { pattern: /\bper\s*day\b/gi, replacement: "يومياً" },
  { pattern: /\bper\s*1\s*k\b/gi, replacement: "لكل 1000" },
  { pattern: /\bper\s*1000\b/gi, replacement: "لكل 1000" },
  { pattern: /\b1\s*k\b/gi, replacement: "1000" },
  { pattern: /\b(\d+(?:\.\d+)?)\s*k\b/gi, replacement: "$1 ألف" },
  { pattern: /\b(\d+(?:\.\d+)?)\s*m\b/gi, replacement: "$1 مليون" },
  { pattern: /\b(\d+)\s*d\b/gi, replacement: "$1 يوم" },
  { pattern: /\b(\d+)\s*h\b/gi, replacement: "$1 ساعة" },
  { pattern: /\b(\d+)\s*sec\b/gi, replacement: "$1 ثانية" },
  { pattern: /\b(\d+)\s*hrs?\b/gi, replacement: "$1 ساعة" },
  { pattern: /\b(\d+)\s*days?\b/gi, replacement: "$1 يوم" },
  { pattern: /\b(\d+)\s*years?\b/gi, replacement: "$1 سنة" },
  { pattern: /\b(\d+)\s*months?\b/gi, replacement: "$1 شهر" },
];

const TERMS: Record<string, string> = {
  // Platforms and networks
  instagram: "إنستغرام",
  insta: "إنستغرام",
  ig: "إنستغرام",
  imstagram: "إنستغرام",
  instgaram: "إنستغرام",
  nstagram: "إنستغرام",
  instanat: "إنستغرام",
  tiktok: "تيك توك",
  tik: "تيك توك",
  youtube: "يوتيوب",
  yt: "يوتيوب",
  telegram: "تيليجرام",
  tg: "تيليجرام",
  facebook: "فيسبوك",
  fb: "فيسبوك",
  twitter: "إكس (تويتر)",
  x: "إكس (تويتر)",
  snapchat: "سناب شات",
  snap: "سناب شات",
  spotify: "سبوتيفاي",
  whatsapp: "واتساب",
  wa: "واتساب",
  discord: "ديسكورد",
  linkedin: "لينكدإن",
  shopee: "شوبي",
  substack: "سبستاك",
  soundcloud: "ساوند كلاود",
  twitch: "تويتش",
  coinmarketcap: "كوين ماركت كاب",
  google: "جوجل",
  adwords: "إعلانات جوجل",
  adword: "إعلانات جوجل",
  android: "أندرويد",
  ios: "آي أو إس",

  // Service nouns
  followers: "متابعين",
  follower: "متابعين",
  subscribers: "مشتركين",
  subscriber: "مشتركين",
  members: "أعضاء",
  member: "أعضاء",
  joiners: "منضمين",
  joiner: "منضمين",
  likes: "إعجابات",
  like: "إعجابات",
  reactions: "تفاعلات",
  reaction: "تفاعلات",
  recations: "تفاعلات",
  reacticons: "تفاعلات",
  comments: "تعليقات",
  comment: "تعليقات",
  reviews: "مراجعات",
  review: "مراجعات",
  views: "مشاهدات",
  view: "مشاهدات",
  viewers: "مشاهدين",
  plays: "تشغيلات",
  play: "تشغيلات",
  streams: "بث",
  stream: "بث",
  shares: "مشاركات",
  share: "مشاركات",
  saves: "حفظ",
  save: "حفظ",
  reposts: "إعادة نشر",
  repost: "إعادة نشر",
  retweets: "إعادة تغريد",
  retweet: "إعادة تغريد",
  tweets: "تغريدات",
  tweet: "تغريدات",
  mentions: "إشارات",
  mention: "إشارات",
  votes: "تصويتات",
  vote: "تصويتات",
  poll: "استطلاعات",
  polls: "استطلاعات",
  pole: "استطلاعات",
  impressions: "مرات ظهور",
  imression: "مرات ظهور",
  impression: "مرات ظهور",
  reach: "وصول",
  visits: "زيارات",
  visit: "زيارات",
  clicks: "نقرات",
  click: "نقرات",
  installs: "تثبيتات",
  downloads: "تنزيلات",
  videos: "فيديوهات",
  video: "فيديوهات",
  videoviews: "مشاهدات فيديو",
  shorts: "شورتس",
  reels: "ريلز",
  reel: "ريلز",
  story: "ستوري",
  stories: "ستوري",
  posts: "منشورات",
  post: "منشورات",
  photos: "صور",
  photo: "صور",
  profiles: "ملفات شخصية",
  profile: "ملف شخصي",
  accounts: "حسابات",
  account: "حساب",
  accunts: "حسابات",
  channels: "قنوات",
  channel: "قناة",
  groups: "مجموعات",
  group: "مجموعة",
  pages: "صفحات",
  page: "صفحة",
  links: "روابط",
  link: "رابط",
  messages: "رسائل",
  message: "رسالة",
  chats: "محادثات",
  chat: "محادثة",
  endorsements: "تزكيات",
  connections: "اتصالات",
  recommendations: "توصيات",
  restacks: "إعادة نشر",
  sends: "إرسالات",
  replies: "ردود",
  thread: "سلسلة",
  threads: "سلاسل",
  bookmarks: "إشارات مرجعية",
  listeners: "مستمعين",
  follows: "متابعات",
  interactions: "تفاعلات",
  engagements: "تفاعلات",
  engagement: "تفاعل",

  // Quality and delivery
  real: "حقيقي",
  genuine: "حقيقي",
  hq: "جودة عالية",
  lq: "جودة منخفضة",
  quality: "جودة",
  premium: "بريميوم",
  cheap: "رخيص",
  cheapest: "الأرخص",
  chepest: "الأرخص",
  best: "الأفضل",
  good: "جيد",
  bad: "سيئ",
  new: "جديد",
  latest: "الأحدث",
  updated: "محدّث",
  update: "تحديث",
  old: "قديم",
  exclusive: "حصري",
  private: "خاص",
  pvt: "خاص",
  manual: "يدوي",
  auto: "تلقائي",
  automatic: "تلقائي",
  targeted: "مستهدف",
  target: "هدف",
  worldwide: "عالمي",
  worldwi: "عالمي",
  worlwilde: "عالمي",
  world: "عالم",
  global: "عالمي",
  ww: "عالمي",
  unlimited: "غير محدود",
  unlitimed: "غير محدود",
  limited: "محدود",
  maximum: "الحد الأقصى",
  max: "الحد الأقصى",
  max100: "الحد الأقصى 100",
  minimum: "الحد الأدنى",
  min: "الحد الأدنى",
  upto: "حتى",
  per: "لكل",
  perday: "يومياً",
  daily: "يومي",
  bonus: "إضافي",
  extra: "إضافي",
  free: "مجاني",
  offer: "عرض",
  offers: "عروض",
  sale: "تخفيض",
  discount: "خصم",
  promotion: "ترويج",
  advertising: "إعلانات",
  ads: "إعلانات",
  ad: "إعلان",
  seo: "تحسين محركات البحث",
  traffic: "زيارات",
  website: "موقع",
  marketing: "تسويق",
  digital: "رقمي",
  services: "خدمات",
  service: "خدمة",
  server: "سيرفر",
  provider: "مزود",
  base: "أساسي",
  native: "أصلي",
  instant: "فوري",
  superinstant: "فوري جداً",
  fast: "سريع",
  faster: "أسرع",
  fastest: "الأسرع",
  superfast: "سريع جداً",
  ultrafast: "فائق السرعة",
  speed: "سرعة",
  slow: "بطيء",
  stable: "مستقر",
  smooth: "سلس",
  completed: "مكتمل",
  complete: "مكتمل",
  working: "نشط",
  works: "نشط",
  active: "نشط",
  enabled: "مفعّل",
  enable: "تفعيل",
  disabled: "معطّل",
  disable: "إيقاف",
  cancel: "إلغاء",
  cancellation: "إلغاء",
  refill: "تعويض",
  reffill: "تعويض",
  refills: "تعويض",
  nondrop: "بدون نقصان",
  nodrop: "بدون نقصان",
  drop: "نقصان",
  guaranteed: "مضمون",
  guarantee: "ضمان",
  warranties: "ضمانات",
  warranty: "ضمان",
  lifetime: "مدى الحياة",
  "24h": "24 ساعة",
  "48h": "48 ساعة",
  "365d": "365 يوم",
  "30d": "30 يوم",

  // Geography and audience
  indian: "هندي",
  indians: "هنود",
  india: "الهند",
  usa: "أمريكا",
  uk: "بريطانيا",
  arab: "عربي",
  arabic: "عربي",
  arabia: "العربية",
  saudi: "السعودية",
  emirates: "الإمارات",
  uae: "الإمارات",
  turkey: "تركيا",
  turkish: "تركي",
  turk: "تركي",
  germany: "ألمانيا",
  france: "فرنسا",
  italy: "إيطاليا",
  russia: "روسيا",
  russian: "روسي",
  spain: "إسبانيا",
  brazil: "البرازيل",
  brazilian: "برازيلي",
  pakistan: "باكستان",
  nigeria: "نيجيريا",
  egypt: "مصر",
  egyptian: "مصري",
  indonesia: "إندونيسيا",
  thailand: "تايلاند",
  vietnam: "فيتنام",
  korea: "كوريا",
  japan: "اليابان",
  china: "الصين",
  philippines: "الفلبين",
  australia: "أستراليا",
  canada: "كندا",
  malaysia: "ماليزيا",
  mexico: "المكسيك",
  netherlands: "هولندا",
  poland: "بولندا",
  taiwan: "تايوان",
  sweden: "السويد",
  switzerland: "سويسرا",
  azerbaijan: "أذربيجان",
  azerbaijani: "أذربيجاني",
  iraq: "العراق",
  iran: "إيران",
  colombia: "كولومبيا",
  bangladesh: "بنغلاديش",
  countries: "دول",
  country: "دولة",
  europe: "أوروبا",
  latin: "لاتيني",
  america: "أمريكا",
  south: "جنوب",
  united: "المتحدة",
  kingdom: "المملكة",
  states: "الولايات",
  pradesh: "براديش",
  andhra: "أندرا",
  assam: "آسام",
  bihar: "بيهار",
  chhattisgarh: "تشهاتيسجاره",
  gujarat: "غوجارات",
  haryana: "هاريانا",
  karnataka: "كارناتاكا",
  kerala: "كيرالا",
  madhya: "ماديا",
  maharashtra: "ماهاراشترا",
  punjab: "البنجاب",
  rajasthan: "راجستان",
  telangana: "تيلانجانا",
  bengal: "البنغال",
  west: "غرب",
  "türkiye": "تركيا",
  rkiye: "تركيا",

  // Content, audiences, topics
  future: "مستقبلي",
  last: "آخر",
  first: "أول",
  under: "أقل من",
  over: "أكثر من",
  more: "المزيد",
  all: "الكل",
  any: "أي",
  no: "بدون",
  non: "بدون",
  not: "غير",
  one: "واحد",
  both: "كلاهما",
  with: "مع",
  without: "بدون",
  or: "أو",
  and: "و",
  for: "لـ",
  from: "من",
  in: "في",
  on: "على",
  of: "من",
  the: "",
  is: "",
  to: "إلى",
  by: "بواسطة",
  your: "الخاص بك",
  own: "خاص",
  users: "مستخدمين",
  user: "مستخدم",
  person: "شخص",
  people: "أشخاص",
  humans: "بشري",
  human: "بشري",
  female: "إناث",
  male: "ذكور",
  age: "عمر",
  verified: "موثّق",
  blue: "أزرق",
  business: "أعمال",
  creator: "منشئ محتوى",
  community: "مجتمع",
  topic: "موضوع",
  hashtag: "هاشتاغ",
  trend: "ترند",
  trending: "رائج",
  explore: "استكشاف",
  search: "بحث",
  ranking: "ترتيب",
  referral: "إحالة",
  code: "رمز",
  robot: "روبوت",
  bot: "بوت",
  panel: "لوحة",
  dashboard: "لوحة",
  backend: "خلفي",
  wholesale: "جملة",
  hub: "مركز",
  rates: "أسعار",
  rate: "سعر",
  price: "سعر",
  cost: "تكلفة",
  wallet: "محفظة",
  order: "طلب",
  orders: "طلبات",
  refund: "استرداد",
  support: "دعم",
  contact: "تواصل",
  data: "بيانات",
  details: "تفاصيل",
  detail: "تفاصيل",
  description: "وصف",
  content: "محتوى",
  deliver: "تسليم",
  delivery: "تسليم",
  off: "إيقاف",
  clip: "مقطع",
  song: "أغنية",
  music: "موسيقى",
  artist: "فنان",
  celeb: "مشاهير",
  celebrities: "مشاهير",
  celebrity: "مشاهير",
  fans: "معجبين",
  cricket: "كريكيت",
  sports: "رياضة",
  pets: "حيوانات أليفة",
  animals: "حيوانات",
  foodie: "طعام",
  restaurant: "مطعم",
  beauty: "جمال",
  makeup: "مكياج",
  wedding: "زفاف",
  shaadi: "زفاف",
  fitness: "لياقة",
  gym: "رياضة",
  luxury: "فاخر",
  lifestyle: "أسلوب حياة",
  photography: "تصوير",
  spiritual: "روحاني",
  devotional: "روحاني",
  fashion: "أزياء",
  comedy: "كوميديا",
  memes: "ميمز",
  influencers: "مؤثرين",
  influencer: "مؤثر",
  travel: "سفر",
  cars: "سيارات",
  bikes: "دراجات",
  work: "عمل",
  mobile: "جوال",
  app: "تطبيق",
  games: "ألعاب",
  gaming: "ألعاب",
  concurrent: "متزامن",
  retention: "احتفاظ",
  monetization: "تحقيق الربح",
  monetizable: "قابل للربح",
  revenue: "إيراد",
  royalties: "عوائد",
  eligible: "مؤهل",
  watch: "مشاهدة",
  devices: "أجهزة",
  unique: "فريد",
  activity: "نشاط",
  increased: "متزايد",
  always: "دائم",
  demand: "طلب",
  emergency: "طارئ",
  flag: "علامة",
  flags: "علامات",
  button: "زر",
  buttom: "زر",
  overflow: "تجاوز",
  list: "قائمة",
  expand: "توسيع",
  type: "نوع",
  mix: "متنوع",
  pack: "حزمة",
  package: "حزمة",
  packages: "حزم",
  bulk: "جملة",
  single: "مفرد",
  trial: "تجريبي",
  sample: "تجريبي",
  test: "تجريبي",
  monthly: "شهري",
  weekly: "أسبوعي",
  total: "إجمالي",
  estimated: "مقدّر",
  realtime: "مباشر",
  online: "متصل",
  offline: "غير متصل",
  performance: "أداء",
  growth: "نمو",
  viral: "انتشار",
  boost: "تعزيز",
  top: "أعلى",
  playlist: "قائمة تشغيل",
  album: "ألبوم",
  track: "مقطع",
  podcast: "بودكاست",
  radio: "راديو",
  news: "أخبار",
  article: "مقال",
  blog: "مدونة",
  subscribe: "اشتراك",
};

const JUNK = new Set([
  "s1",
  "s2",
  "s3",
  "r30",
  "r365",
  "rav",
  "jaco",
  "uder",
  "wilde",
  "sanju",
  "webbox",
  "collin",
  "smmbin",
  "smm",
  "inttttt",
  "xxxx",
  "xxxxxxxxx",
  "everydaycurrentgk230849",
  "instanat",
  "ndi",
  "nstant",
  "superinstant",
  "chepest",
  "custome",
  "costum",
  "custum",
  "worlwilde",
  "worldwi",
  "imression",
  "reacticons",
  "recations",
  "unlitimed",
  "sped",
  "ike",
  "buttom",
  "accunts",
  "disaplay",
  "proffesional",
  "reffill",
  "ds",
]);

const PLATFORM_SOURCE = PLATFORMS.map((item) => item.source).join("|");
const NOUN_SOURCE = NOUNS.map((item) => item.source).join("|");
const MODIFIER_SOURCE = MODIFIERS.map((item) => item.source).join("|");

const PLATFORM_NOUN_RE = new RegExp(
  `\\b(${PLATFORM_SOURCE})\\s+(${NOUN_SOURCE})\\b`,
  "gi"
);

const PLATFORM_MODIFIER_NOUN_RE = new RegExp(
  `\\b(${PLATFORM_SOURCE})\\s+(${MODIFIER_SOURCE})\\s+(${NOUN_SOURCE})\\b`,
  "gi"
);

const PLATFORM_NOUN_NOUN_RE = new RegExp(
  `\\b(${PLATFORM_SOURCE})\\s+(${NOUN_SOURCE})\\s+(${NOUN_SOURCE})\\b`,
  "gi"
);

const PLATFORM_NOUN_NOUN_NOUN_RE = new RegExp(
  `\\b(${PLATFORM_SOURCE})\\s+(${NOUN_SOURCE})\\s+(${NOUN_SOURCE})\\s+(${NOUN_SOURCE})\\b`,
  "gi"
);

const PLATFORM_MODIFIER_MODIFIER_NOUN_RE = new RegExp(
  `\\b(${PLATFORM_SOURCE})\\s+(${MODIFIER_SOURCE})\\s+(${MODIFIER_SOURCE})\\s+(${NOUN_SOURCE})\\b`,
  "gi"
);

const NOUN_PLATFORM_RE = new RegExp(
  `\\b(${NOUN_SOURCE})\\s+(?:of|on|for)\\s+(${PLATFORM_SOURCE})\\b`,
  "gi"
);

function lookupPlatform(value: string): string | null {
  const normalized = value.trim().toLowerCase().replace(/\s+/g, " ");

  for (const platform of PLATFORMS) {
    const aliases = platform.source.split("|");

    for (const alias of aliases) {
      const pattern = new RegExp(`^(?:${alias})$`, "i");

      if (pattern.test(normalized) || pattern.test(normalized.replace(/\s+/g, ""))) {
        return platform.label;
      }
    }
  }

  return null;
}

function lookupNoun(value: string): string | null {
  const normalized = value.trim().toLowerCase();

  for (const noun of NOUNS) {
    if (new RegExp(`^(?:${noun.source})$`, "i").test(normalized)) {
      return noun.label;
    }
  }

  return null;
}

function lookupModifier(value: string): string | null {
  const normalized = value.trim().toLowerCase();

  for (const modifier of MODIFIERS) {
    if (new RegExp(`^(?:${modifier.source})$`, "i").test(normalized)) {
      return modifier.label;
    }
  }

  return null;
}

const SMALL_CAPS: Record<string, string> = {
  "ᴀ": "A",
  "ʙ": "B",
  "ᴄ": "C",
  "ᴅ": "D",
  "ᴇ": "E",
  "ꜰ": "F",
  "ɢ": "G",
  "ʜ": "H",
  "ɪ": "I",
  "ᴊ": "J",
  "ᴋ": "K",
  "ʟ": "L",
  "ᴍ": "M",
  "ɴ": "N",
  "ᴏ": "O",
  "ᴘ": "P",
  "ʀ": "R",
  "ꜱ": "S",
  "ᴛ": "T",
  "ᴜ": "U",
  "ᴠ": "V",
  "ᴡ": "W",
  "ʏ": "Y",
  "ᴢ": "Z",
  "ᵁ": "U",
  "ᴬ": "A",
  "ᴮ": "B",
  "ᴰ": "D",
  "ᴳ": "G",
  "ᴴ": "H",
  "ᴵ": "I",
  "ᴶ": "J",
  "ᴷ": "K",
  "ᴸ": "L",
  "ᴹ": "M",
  "ᴾ": "P",
  "ᴿ": "R",
  "ᵀ": "T",
  "ᵂ": "W",
};

const SMALL_CAPS_RE = new RegExp(
  `[${Object.keys(SMALL_CAPS).join("")}]`,
  "g"
);

function decodeEntities(value: string): string {
  const normalized = value.normalize("NFKC");

  return normalized
    .replace(SMALL_CAPS_RE, (character) => SMALL_CAPS[character] ?? character)
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&nbsp;/gi, " ");
}

const cache = new Map<string, string>();

export function localizeServiceText(raw: string): string {
  if (!raw) return "";

  const cached = cache.get(raw);

  if (cached !== undefined) return cached;

  let text = decodeEntities(raw);

  // Runs of X are provider filler, not the X platform.
  text = text.replace(/\bx{3,}\b/gi, " ");

  // "Instagram Followers" -> "متابعين إنستغرام"
  text = text.replace(
    PLATFORM_MODIFIER_MODIFIER_NOUN_RE,
    (_match, platform, modifierOne, modifierTwo, noun) => {
      const platformLabel = lookupPlatform(String(platform));
      const modifierOneLabel = lookupModifier(String(modifierOne));
      const modifierTwoLabel = lookupModifier(String(modifierTwo));
      const nounLabel = lookupNoun(String(noun));

      if (!platformLabel || !nounLabel) return _match;

      return `${nounLabel} ${modifierOneLabel ?? ""} ${
        modifierTwoLabel ?? ""
      } ${platformLabel}`
        .replace(/\s{2,}/g, " ")
        .trim();
    }
  );

  text = text.replace(PLATFORM_MODIFIER_NOUN_RE, (_match, platform, modifier, noun) => {
    const platformLabel = lookupPlatform(String(platform));
    const modifierLabel = lookupModifier(String(modifier));
    const nounLabel = lookupNoun(String(noun));

    if (!platformLabel || !nounLabel) return _match;

    return `${nounLabel}${modifierLabel ? ` ${modifierLabel}` : ""} ${platformLabel}`;
  });

  // "Instagram Story Views" -> "مشاهدات ستوري إنستغرام"
  text = text.replace(
    PLATFORM_NOUN_NOUN_NOUN_RE,
    (_match, platform, nounOne, nounTwo, nounThree) => {
      const platformLabel = lookupPlatform(String(platform));
      const nounOneLabel = lookupNoun(String(nounOne));
      const nounTwoLabel = lookupNoun(String(nounTwo));
      const nounThreeLabel = lookupNoun(String(nounThree));

      if (!platformLabel || !nounOneLabel || !nounTwoLabel || !nounThreeLabel) {
        return _match;
      }

      return `${nounThreeLabel} ${nounTwoLabel} ${nounOneLabel} ${platformLabel}`;
    }
  );

  text = text.replace(PLATFORM_NOUN_NOUN_RE, (_match, platform, nounOne, nounTwo) => {
    const platformLabel = lookupPlatform(String(platform));
    const nounOneLabel = lookupNoun(String(nounOne));
    const nounTwoLabel = lookupNoun(String(nounTwo));

    if (!platformLabel || !nounOneLabel || !nounTwoLabel) return _match;

    return `${nounTwoLabel} ${nounOneLabel} ${platformLabel}`;
  });

  text = text.replace(PLATFORM_NOUN_RE, (_match, platform, noun) => {
    const platformLabel = lookupPlatform(String(platform));
    const nounLabel = lookupNoun(String(noun));

    if (!platformLabel || !nounLabel) return _match;

    return `${nounLabel} ${platformLabel}`;
  });

  text = text.replace(NOUN_PLATFORM_RE, (_match, noun, platform) => {
    const platformLabel = lookupPlatform(String(platform));
    const nounLabel = lookupNoun(String(noun));

    if (!platformLabel || !nounLabel) return _match;

    return `${nounLabel} ${platformLabel}`;
  });

  // Numeric shorthand before word-level translation.
  text = text.replace(/\b(\d+(?:\.\d+)?)\s*k\b/gi, "$1 ألف");
  text = text.replace(/\b(\d+(?:\.\d+)?)\s*m\b/gi, "$1 مليون");
  text = text.replace(/\b1\s*million\b/gi, "مليون");
  text = text.replace(/\b(\d+)\s*d\b/gi, "$1 يوم");
  text = text.replace(/\b(\d+)\s*h\b/gi, "$1 ساعة");

  for (const phrase of PHRASES) {
    text = text.replace(phrase.pattern, phrase.replacement);
  }

  // Word-level pass. Unknown Latin tokens are removed.
  text = text.replace(/[A-Za-z][A-Za-z0-9'’._+&-]*/g, (token) => {
    const lower = token.toLowerCase().replace(/[._-]+$/g, "");
    const upper = token.toUpperCase();

    if (JUNK.has(lower)) return "";

    const term = TERMS[lower];

    if (term !== undefined) return term;

    if (ALLOWED_LATIN.has(upper)) return upper;

    // Possessive/plural leftovers such as "followers2" or "s2".
    if (/^[a-z]+\d+$/.test(lower)) {
      const base = lower.replace(/\d+$/, "");
      const baseTerm = TERMS[base];
      return baseTerm ?? "";
    }

    return "";
  });

  // Cleanup: empty brackets, repeated separators, stray punctuation.
  text = text
    .replace(/\[\s*\]/g, " ")
    .replace(/\(\s*\)/g, " ")
    .replace(/\{\s*\}/g, " ")
    .replace(/<\s*>/g, " ")
    .replace(/\s*\|\s*(?=\||$)/g, " ")
    .replace(/([·•])\s*\1+/g, "$1")
    .replace(/\s*([,;:/·•])\s*(?=[,;:/·•])/g, "$1")
    .replace(/\s[-–—]\s+(?=\[)/g, " ")
    .replace(/^[\s\-–—|·•,:;/]+/g, "")
    .replace(/[\s\-–—|·•,:;/]+$/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  // Final safety net: no Latin word may survive except the allowlist.
  text = text.replace(/[A-Za-z][A-Za-z0-9'’._+&-]*/g, (token) =>
    ALLOWED_LATIN.has(token.toUpperCase()) ? token.toUpperCase() : ""
  );

  text = text.replace(/\s{2,}/g, " ").trim();

  if (!text || !/[\u0600-\u06FF]/.test(text)) {
    text = "خدمات عامة";
  }

  cache.set(raw, text);

  return text;
}

export function localizeServiceName(name: string): string {
  return localizeServiceText(name);
}

export function localizeCategory(category: string): string {
  const localized = localizeServiceText(category);

  return localized === "خدمات عامة" ? "خدمات متنوعة" : localized;
}

export function localizePlatformLabel(label: string): string {
  return lookupPlatform(label) ?? localizeServiceText(label);
}

const SECTION_LABELS_AR: Record<string, string> = {
  followers: "المتابعون والمشتركون",
  members: "الأعضاء والمنضمون",
  likes: "الإعجابات والتفاعلات",
  views: "المشاهدات والوصول",
  comments: "التعليقات والمراجعات",
  shares: "المشاركات والحفظ",
  story: "الستوري والبث والاستطلاعات",
  reels: "الريلز",
  posts: "المنشورات",
  other: "خدمات أخرى",
};

export function localizeSectionLabel(
  key: string,
  fallback: string
): string {
  return SECTION_LABELS_AR[key] ?? localizeServiceText(fallback);
}

const TYPE_LABELS_AR: Record<string, string> = {
  default: "افتراضي",
  "custom comments": "تعليقات مخصصة",
  package: "حزمة",
  poll: "استطلاع",
  "drip feed": "تسليم مرحلي",
  subscriptions: "اشتراكات",
  "subscriptions (auto)": "اشتراكات تلقائية",
};

export function localizeServiceType(type: string): string {
  const normalized = type.trim().toLowerCase();
  return TYPE_LABELS_AR[normalized] ?? localizeServiceText(type);
}

export function localizePlatformKey(key: string): string {
  const labels: Record<string, string> = {
    instagram: "إنستغرام",
    tiktok: "تيك توك",
    youtube: "يوتيوب",
    twitter: "إكس (تويتر)",
    facebook: "فيسبوك",
    telegram: "تيليجرام",
    whatsapp: "واتساب",
    spotify: "سبوتيفاي",
    snapchat: "سناب شات",
    linkedin: "لينكدإن",
    discord: "ديسكورد",
    website: "زيارات مواقع",
    other: "خدمات أخرى",
  };

  return labels[key] ?? localizeServiceText(key);
}
