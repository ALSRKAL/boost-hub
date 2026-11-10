import type { Language } from "@/lib/i18n";

export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
  "https://smm-ten-coral.vercel.app";

export const SEO_COPY = {
  ar: {
    title: "BoostHub | لوحة خدمات السوشيال ميديا — متابعين ومشاهدات وإعجابات",
    shortTitle: "BoostHub — لوحة خدمات السوشيال ميديا",
    description:
      "اطلب خدمات السوشيال ميديا من BoostHub: متابعين، مشاهدات، إعجابات، تعليقات ومشاركات لإنستغرام وتيك توك ويوتيوب وتيليجرام. أسعار واضحة لكل 1000 وحدة، تعويض، ومتابعة تلقائية للطلبات.",
    image: "/og-image-ar.png",
    imageAlt:
      "BoostHub — لوحة خدمات السوشيال ميديا لمتابعين ومشاهدات وإعجابات",
  },
  en: {
    title:
      "BoostHub | Social Media Services Panel — Followers, Views & Likes",
    shortTitle: "BoostHub — Social Media Services Panel",
    description:
      "Order social media services from BoostHub: followers, views, likes, comments and shares for Instagram, TikTok, YouTube and Telegram. Clear per-1,000 pricing, refills and automatic order tracking.",
    image: "/og-image-en.png",
    imageAlt:
      "BoostHub — social media services panel for followers, views and likes",
  },
  bilingual: {
    title:
      "BoostHub — لوحة خدمات السوشيال ميديا | Social Media Services Panel",
    description:
      "منصة BoostHub لخدمات السوشيال ميديا: متابعين، مشاهدات، إعجابات، تعليقات ومشاركات — أسعار واضحة ومتابعة تلقائية. Social media services with clear per-1,000 pricing and automatic order tracking.",
    image: "/og-image.png",
    imageAlt:
      "BoostHub — social media services panel · لوحة خدمات السوشيال ميديا",
  },
} as const;

export function seoForLanguage(language: Language | "default") {
  return language === "ar"
    ? SEO_COPY.ar
    : language === "en"
      ? SEO_COPY.en
      : SEO_COPY.bilingual;
}
