import type { Metadata, Viewport } from "next";
import { cookies, headers } from "next/headers";
import localFont from "next/font/local";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import { LanguageProvider } from "@/context/LanguageContext";
import { APP_CONFIG } from "@/lib/constants";
import { isLanguage, LANGUAGE_COOKIE, languageDir } from "@/lib/i18n";
import { seoForLanguage, SITE_URL } from "@/lib/seo";

const plexSans = localFont({
  variable: "--font-plex-sans",
  src: [
    { path: "./fonts/IBMPlexSans-Regular.ttf", weight: "400", style: "normal" },
    { path: "./fonts/IBMPlexSans-Medium.ttf", weight: "500", style: "normal" },
    { path: "./fonts/IBMPlexSans-SemiBold.ttf", weight: "600", style: "normal" },
  ],
  display: "swap",
});

const plexMono = localFont({
  variable: "--font-plex-mono",
  src: [
    { path: "./fonts/IBMPlexMono-Regular.ttf", weight: "400", style: "normal" },
    { path: "./fonts/IBMPlexMono-Medium.ttf", weight: "500", style: "normal" },
    { path: "./fonts/IBMPlexMono-SemiBold.ttf", weight: "600", style: "normal" },
  ],
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const cookieStore = await cookies();
  const requestHeaders = await headers();
  const headerLanguage = requestHeaders.get("x-lang");
  const cookieLanguage = cookieStore.get(LANGUAGE_COOKIE)?.value;
  const language = isLanguage(headerLanguage)
    ? headerLanguage
    : isLanguage(cookieLanguage)
      ? cookieLanguage
      : null;
  const seo = seoForLanguage(language ?? "default");
  const locale =
    language === "ar" ? "ar_AR" : language === "en" ? "en_US" : "ar_AR";

  return {
    metadataBase: new URL(SITE_URL),
    title: {
      default: seo.title,
      template: `%s · ${APP_CONFIG.name}`,
    },
    description: seo.description,
    applicationName: APP_CONFIG.name,
    generator: "Next.js",
    keywords: [
      "BoostHub",
      "SMM panel",
      "social media services",
      "Instagram followers",
      "TikTok views",
      "YouTube views",
      "Telegram members",
      "لوحة خدمات السوشيال ميديا",
      "متابعين إنستغرام",
      "مشاهدات تيك توك",
      "مشاهدات يوتيوب",
      "أعضاء تيليجرام",
      "خدمات سوشيال ميديا",
    ],
    authors: [{ name: "BoostHub", url: SITE_URL }],
    creator: "BoostHub",
    publisher: "BoostHub",
    category: "social media services",
    alternates: {
      canonical: "/",
      languages: {
        ar: "/?lang=ar",
        en: "/?lang=en",
        "x-default": "/",
      },
    },
    openGraph: {
      type: "website",
      siteName: APP_CONFIG.name,
      title: seo.title,
      description: seo.description,
      url: "/",
      locale,
      alternateLocale: locale === "ar_AR" ? ["en_US"] : ["ar_AR"],
      images: [
        {
          url: seo.image,
          width: 1200,
          height: 630,
          alt: seo.imageAlt,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: seo.title,
      description: seo.description,
      images: [seo.image],
    },
    icons: {
      icon: [
        { url: "/icon.svg", type: "image/svg+xml" },
        { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
        { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
      ],
      shortcut: "/favicon.ico",
      apple: [{ url: "/apple-icon.png", sizes: "180x180", type: "image/png" }],
    },
    manifest: "/manifest.webmanifest",
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-image-preview": "large",
        "max-snippet": -1,
        "max-video-preview": -1,
      },
    },
    other: {
      "format-detection": "telephone=no",
    },
  };
}

export const viewport: Viewport = {
  themeColor: "#f6f5f0",
  colorScheme: "light",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const requestHeaders = await headers();
  const headerLanguage = requestHeaders.get("x-lang");
  const cookieLanguage = cookieStore.get(LANGUAGE_COOKIE)?.value;
  const language = isLanguage(headerLanguage)
    ? headerLanguage
    : isLanguage(cookieLanguage)
      ? cookieLanguage
      : "en";

  return (
    <html
      lang={language}
      dir={languageDir(language)}
      className={`${plexSans.variable} ${plexMono.variable} h-full`}
    >
      <body className="min-h-full antialiased">
        <LanguageProvider initialLanguage={language}>
          <AuthProvider>{children}</AuthProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
