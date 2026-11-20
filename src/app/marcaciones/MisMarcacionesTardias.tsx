// src/app/marcaciones/MisMarcacionesTardias.tsx
"use client";

import React, { useCallback, useEffect, useState } from "react";
import { RefreshCcw } from "lucide-react";

type Estado = "PENDIENTE" | "INCORPORADA" | "RECHAZADA";

interface MarcacionTardia {
  id: string;
  tipo: string;
  fechaLaboral: string;
  recibidaEn: string;
  estado: Estado;
  motivoRechazo: string | null;
  resueltaEn: string | null;
}

const TIPO_L: Record<string, string> = {
  ENTRADA_MANANA: "Entrada mañana",
  SALIDA_ALMUERZO: "Salida almuerzo",
  ENTRADA_ALMUERZO: "Entrada almuerzo",
  SALIDA_JORNADA: "Salida jornada",
};

const ESTADO: Record<Estado, { l: string; cls: string; ayuda: string }> = {
  PENDIENTE: { l: "Pendiente de revisión", cls: "border-[var(--color-warning-border)] text-[var(--color-warning)]", ayuda: "Aún no cuenta como asistencia." },
  INCORPORADA: { l: "Incorporada", cls: "border-[var(--color-success-border)] text-[var(--color-success)]", ayuda: "Se registró como asistencia." },
  RECHAZADA: { l: "Rechazada", cls: "border-[var(--color-error-border)] text-[var(--color-error)]", ayuda: "No se registró como asistencia." },
};

const fFecha = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("es-CO", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short", year: "numeric" });
const fFechaHora = (iso: string) =>
  new Date(iso).toLocaleString("es-CO", { timeZone: "America/Bogota", dateStyle: "medium", timeStyle: "short" });

/** Marcaciones tardías del empleado autenticado (solo lectura). */
export default function MisMarcacionesTardias() {
  const [items, setItems] = useState<MarcacionTardia[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const consultar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/marcaciones/tardias", { credentials: "include" });
      const j = (await res.json().catch(() => ({}))) as { data?: MarcacionTardia[]; error?: string };
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      setItems(j.data ?? []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void consultar(); }, [consultar]);

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-[var(--color-text-primary)]">Mis marcaciones tardías</h2>
          <p className="text-sm text-[var(--color-text-secondary)]">
            Marcaciones recibidas después del cierre de la semana. Un administrador decide si se incorporan a tu asistencia.
          </p>
        </div>
        <button onClick={() => void consultar()} disabled={loading} className="flex items-center gap-1 text-sm text-[var(--color-accent-text)] hover:underline disabled:opacity-50">
          <RefreshCcw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Actualizar
        </button>
      </div>

      {error && <p className="rounded border border-[var(--color-error-border)] bg-[var(--color-error-bg)] p-3 text-sm text-[var(--color-error)]">{error}</p>}
      {!error && loading && !items && <p className="text-sm text-[var(--color-text-secondary)]">Cargando…</p>}
      {!error && items?.length === 0 && (
        <p className="text-sm text-[var(--color-text-secondary)]">No tienes marcaciones tardías.</p>
      )}

      {!error && items && items.length > 0 && (
        <div className="overflow-x-auto rounded border border-[var(--color-border)] bg-[var(--color-bg-card)]">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-[var(--color-text-secondary)]">
              <tr>
                <th className="px-3 py-2">Fecha laboral</th>
                <th className="px-3 py-2">Tipo</th>
                <th className="px-3 py-2">Recibida</th>
                <th className="px-3 py-2">Estado</th>
              </tr>
            </thead>
            <tbody className="text-[var(--color-text-primary)]">
              {items.map((m) => (
                <tr key={m.id} className="border-t border-[var(--color-border)] align-top">
                  <td className="px-3 py-2 whitespace-nowrap">{fFecha(m.fechaLaboral)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{TIPO_L[m.tipo] ?? m.tipo}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{fFechaHora(m.recibidaEn)}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded border px-2 py-0.5 text-xs font-medium ${ESTADO[m.estado].cls}`}>{ESTADO[m.estado].l}</span>
                    <p className="mt-1 text-xs text-[var(--color-text-secondary)]">{ESTADO[m.estado].ayuda}</p>
                    {m.estado === "RECHAZADA" && m.motivoRechazo && (
                      <p className="mt-1 text-xs text-[var(--color-error)]">Motivo: {m.motivoRechazo}</p>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
