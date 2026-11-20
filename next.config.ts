
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
