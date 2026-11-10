import type { MetadataRoute } from "next";
import { SEO_COPY } from "@/lib/seo";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "BoostHub — Social Media Services Panel",
    short_name: "BoostHub",
    description: SEO_COPY.bilingual.description,
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#f6f5f0",
    theme_color: "#17191e",
    lang: "ar",
    dir: "rtl",
    categories: ["business", "shopping"],
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
