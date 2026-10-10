import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/", name: "LMS Credit Core", short_name: "LMS Credit",
    description: "Administración de clientes, préstamos y cobros",
    lang: "es-DO", start_url: "/dashboard", scope: "/",
    display: "standalone", background_color: "#F5F6FB", theme_color: "#6B21E8",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
