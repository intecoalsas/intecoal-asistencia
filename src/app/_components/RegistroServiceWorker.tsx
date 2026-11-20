// src/app/_components/RegistroServiceWorker.tsx
"use client";

import { useEffect } from "react";

/** Registra el service worker mínimo (solo página sin conexión). */
export default function RegistroServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((err) => {
      console.error("[PWA] No se pudo registrar el service worker:", err);
    });
  }, []);
  return null;
}
