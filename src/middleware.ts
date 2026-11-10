import { NextResponse, type NextRequest } from "next/server";
import { isLanguage, LANGUAGE_COOKIE } from "@/lib/i18n";

/**
 * Makes `?lang=ar` / `?lang=en` work for crawlers and shared links without a
 * client-side redirect. The language is exposed to server components through
 * the `x-lang` request header and persisted in the cookie for the browser.
 */
export function middleware(request: NextRequest) {
  const requested = request.nextUrl.searchParams.get("lang");

  if (!isLanguage(requested)) {
    return NextResponse.next();
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-lang", requested);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.cookies.set(LANGUAGE_COOKIE, requested, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });

  return response;
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|icon.svg|icon-192.png|icon-512.png|apple-icon.png|og-image.*|manifest.webmanifest|robots.txt|sitemap.xml).*)",
  ],
};
