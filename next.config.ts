
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* Salida standalone para la imagen Docker de producción (ECS Fargate) */
  output: "standalone",

  /* Permitir acceso de desarrollo desde el Redmi por LAN */
  allowedDevOrigins: ["192.168.1.41", "192.168.1.19"],

  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
