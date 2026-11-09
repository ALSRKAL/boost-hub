import { NextResponse, type NextRequest } from "next/server";
import {
  fetchProviderServices,
  mapProviderServiceToPublic,
  type PublicService,
} from "@/lib/provider";
import { localize, readApiLanguage } from "@/lib/api-language";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CACHE_TTL_MS = 60_000;

let cached: { at: number; data: PublicService[] } | null = null;

export async function GET(request: NextRequest) {
  const language = readApiLanguage(request);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return NextResponse.json(cached.data, {
      headers: { "Cache-Control": "no-store" },
    });
  }

  try {
    const services = (await fetchProviderServices())
      .map(mapProviderServiceToPublic)
      .filter((item): item is PublicService => item !== null)
      // Zero-rate services cannot be ordered and are not sellable.
      .filter((item) => Number.parseFloat(item.price) > 0)
      // The provider's "test" service is not orderable through its API.
      .filter((item) => item.name.trim().toLowerCase() !== "test")
      .sort((left, right) => {
        if (left.category !== right.category) {
          return left.category.localeCompare(right.category);
        }
        return left.name.localeCompare(right.name);
      });

    cached = { at: Date.now(), data: services };

    return NextResponse.json(services, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Services API route failed:", error);

    return NextResponse.json(
      {
        error: localize(
          language,
          "Unable to load the service catalog right now.",
          "تعذّر تحميل كتالوج الخدمات حاليًا."
        ),
      },
      { status: 500 }
    );
  }
}
