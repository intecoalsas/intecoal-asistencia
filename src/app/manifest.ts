import type { MetadataRoute } from "next";

/** Manifest PWA de INTECOAL Asistencia (servido en /manifest.webmanifest). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "INTECOAL Asistencia",
    short_name: "INTECOAL",
    description: "Control de asistencia de INTECOAL S.A.S. mediante códigos QR del kiosco.",
    lang: "es-CO",
    start_url: "/login",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    theme_color: "#0D0D0D",
    background_color: "#F2F2F2",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
