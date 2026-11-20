// src/app/historial/components/BtnExportar.tsx
"use client";

import React, { useState } from "react";
import { Download } from "lucide-react";

interface BtnExportarProps {
  /** URL del endpoint de exportación (relativa). */
  url: string;
  /** Nombre de archivo sugerido para la descarga. */
  filename: string;
  /** Texto del botón */
  label?: string;
  /** Si true, deshabilita el botón */
  disabled?: boolean;
}

/**
 * Botón de exportación a Excel.
 * Llama al endpoint GET indicado con credenciales de sesión
 * y descarga el archivo .xlsx resultante en el navegador.
 */
export default function BtnExportar({
  url,
  filename,
  label = "Exportar Excel",
  disabled = false,
}: BtnExportarProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const handleClick = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(j.error ?? `Error HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const href = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = href;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(href);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <button
        onClick={handleClick}
        disabled={disabled || loading}
        className="flex items-center gap-2 rounded border border-[var(--color-success-border)] bg-[var(--color-success-bg)] px-3 py-1.5 text-sm font-medium text-[var(--color-success)] hover:bg-[var(--color-success-bg)] disabled:opacity-40 transition-colors"
      >
        <Download className={`h-4 w-4 ${loading ? "animate-bounce" : ""}`} />
        {loading ? "Generando…" : label}
      </button>
      {error && (
        <p className="text-xs text-[var(--color-error)]">{error}</p>
      )}
    </div>
  );
}
