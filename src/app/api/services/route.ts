import { NextResponse } from "next/server";
import { fetchProviderServices, mapProviderServiceToPublic } from "@/lib/provider";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const services = (await fetchProviderServices())
      .map(mapProviderServiceToPublic)
      .filter((item): item is NonNullable<typeof item> => item !== null);

    return NextResponse.json(services, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Services API route failed:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to fetch services right now.",
      },
      { status: 500 }
    );
  }
}
