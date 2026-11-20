// src/app/historial/components/EstadoCarga.tsx
"use client";

import React from "react";
import { RefreshCcw, AlertTriangle, CalendarOff } from "lucide-react";

export function Cargando({ mensaje = "Cargando…" }: { mensaje?: string }) {
  return (
    <div className="flex items-center gap-2 py-10 text-[var(--color-text-secondary)]">
      <RefreshCcw className="h-5 w-5 animate-spin" />
      <span>{mensaje}</span>
    </div>
  );
}

export function ErrorCarga({ mensaje }: { mensaje: string }) {
  return (
    <div className="flex items-center gap-2 rounded border border-[var(--color-error-border)] bg-[var(--color-error-bg)] p-4 text-[var(--color-error)]">
      <AlertTriangle className="h-5 w-5 shrink-0" />
      <span>{mensaje}</span>
    </div>
  );
}

export function SinConsolidado({ texto = "Este período no tiene un cierre consolidado vigente." }: { texto?: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-[var(--color-text-secondary)]">
      <CalendarOff className="h-10 w-10 opacity-40" />
      <p className="text-sm">{texto}</p>
    </div>
  );
}
