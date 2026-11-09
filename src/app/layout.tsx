import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import { LanguageProvider } from "@/context/LanguageContext";
import { APP_CONFIG } from "@/lib/constants";
import { isLanguage, LANGUAGE_COOKIE, languageDir } from "@/lib/i18n";

const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const cookieStore = await cookies();
  const cookieLanguage = cookieStore.get(LANGUAGE_COOKIE)?.value;
  const language = isLanguage(cookieLanguage) ? cookieLanguage : "en";

  return {
    title: {
      default:
        language === "ar"
          ? `${APP_CONFIG.name} — لوحة`
          : `${APP_CONFIG.name} — Panel`,
      template: `%s · ${APP_CONFIG.name}`,
    },
    description:
      language === "ar"
        ? `${APP_CONFIG.name}: أنشئ الطلبات وتابع التنفيذ وأدر رصيدك.`
        : `${APP_CONFIG.name} panel: place orders, track delivery, and manage your balance.`,
    robots: { index: false, follow: false },
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
  const cookieLanguage = cookieStore.get(LANGUAGE_COOKIE)?.value;
  const language = isLanguage(cookieLanguage) ? cookieLanguage : "en";

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
