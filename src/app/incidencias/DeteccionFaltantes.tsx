// src/app/incidencias/DeteccionFaltantes.tsx
"use client";

import React, { useState } from "react";
import { ScanSearch } from "lucide-react";

/** Ejecución manual de la detección de marcaciones faltantes (solo ADMIN). */
export default function DeteccionFaltantes({ onCompletada }: { onCompletada: () => void }) {
  const [enviando, setEnviando] = useState(false);
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);

  const ejecutar = async () => {
    setEnviando(true);
    setMensaje(null);
    try {
      const res = await fetch("/api/incidencias/deteccion", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const j = (await res.json().catch(() => ({}))) as { mensaje?: string; error?: string };
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      setMensaje({ ok: true, texto: j.mensaje ?? "Detección completada" });
      onCompletada();
    } catch (e) {
      setMensaje({ ok: false, texto: (e as Error).message });
    } finally {
      setEnviando(false);
    }
  };

  return (
    <section className="flex flex-wrap items-center gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] px-4 py-3">
      <div className="flex-1 min-w-[240px]">
        <p className="font-medium text-[var(--color-text-primary)]">Detección de marcaciones faltantes</p>
        <p className="text-sm text-[var(--color-text-secondary)]">
          Revisa los últimos 31 días terminados y registra las ausencias o jornadas incompletas que falten. No duplica incidencias ni modifica marcaciones.
        </p>
      </div>
      <button
        type="button"
        onClick={() => void ejecutar()}
        disabled={enviando}
        className="flex items-center gap-2 rounded bg-[var(--color-amber)] px-4 py-1.5 text-sm font-medium text-[var(--color-on-primary)] disabled:opacity-50"
      >
        <ScanSearch className="h-4 w-4" /> {enviando ? "Revisando…" : "Detectar ahora"}
      </button>
      {mensaje && (
        <p className={`w-full text-sm ${mensaje.ok ? "text-[var(--color-success)]" : "text-[var(--color-error)]"}`}>{mensaje.texto}</p>
      )}
    </section>
  );
}
