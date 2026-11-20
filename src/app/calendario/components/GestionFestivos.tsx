// src/app/calendario/components/GestionFestivos.tsx
"use client";

import React, { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Plus, RefreshCcw } from "lucide-react";
import { Cargando, ErrorCarga } from "@/app/historial/components/EstadoCarga";

interface Festivo {
  id: string;
  fecha: string;
  descripcion: string;
  isActive: boolean;
  createdAt: string;
  creadoPor: { nombre: string; apellido: string } | null;
}

const inputCls =
  "rounded border border-[var(--color-border)] bg-[var(--color-bg-main)] px-3 py-1.5 text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-amber)]";

function fFecha(iso: string) {
  return new Date(iso).toLocaleDateString("es-CO", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

export default function GestionFestivos() {
  const [items, setItems] = useState<Festivo[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);
  const [fecha, setFecha] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [enviando, setEnviando] = useState(false);

  const consultar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/calendario/festivos", { credentials: "include" });
      const j = (await res.json().catch(() => ({}))) as { data?: Festivo[]; error?: string };
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      setItems(j.data ?? []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { consultar(); }, [consultar]);

  const enviar = async (url: string, method: string, body: unknown) => {
    setEnviando(true);
    setError(null);
    setExito(null);
    try {
      const res = await fetch(url, {
        method, credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = (await res.json().catch(() => ({}))) as { mensaje?: string; error?: string };
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      setExito(j.mensaje ?? "Operación realizada");
      await consultar();
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setEnviando(false);
    }
  };

  const crear = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fecha || !descripcion.trim()) return;
    if (await enviar("/api/calendario/festivos", "POST", { fecha, descripcion: descripcion.trim() })) {
      setFecha("");
      setDescripcion("");
    }
  };

  const alternar = async (f: Festivo) => {
    const accion = f.isActive ? "desactivar" : "activar";
    const motivo = window.prompt(`Motivo para ${accion} el festivo «${f.descripcion}» (${fFecha(f.fecha)}):`);
    if (motivo === null) return;
    if (!motivo.trim()) { setError("El motivo es obligatorio."); return; }
    await enviar(`/api/calendario/festivos/${f.id}`, "PATCH", { isActive: !f.isActive, motivo: motivo.trim() });
  };

  return (
    <div className="space-y-6">
      <form onSubmit={crear} className="flex flex-wrap items-end gap-3 rounded border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="fest-fecha" className="text-xs text-[var(--color-text-secondary)]">Fecha</label>
          <input id="fest-fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={inputCls} required />
        </div>
        <div className="flex min-w-[240px] flex-1 flex-col gap-1">
          <label htmlFor="fest-desc" className="text-xs text-[var(--color-text-secondary)]">Descripción</label>
          <input id="fest-desc" type="text" maxLength={191} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Ej.: Día de la Independencia" className={inputCls} required />
        </div>
        <button type="submit" disabled={enviando || !fecha || !descripcion.trim()} className="flex items-center gap-2 rounded bg-[var(--color-amber)] px-4 py-1.5 text-sm font-medium text-[var(--color-on-primary)] disabled:opacity-50">
          <Plus className="h-4 w-4" /> Registrar festivo
        </button>
        <p className="w-full text-xs text-[var(--color-text-secondary)]">
          Aplica a toda la empresa. Las semanas ya cerradas no cambian: para corregirlas hay que reabrirlas y volver a cerrarlas.
        </p>
      </form>

      {exito && (
        <div className="flex items-center gap-2 rounded border border-[var(--color-success-border)] bg-[var(--color-success-bg)] p-3 text-sm text-[var(--color-success)]">
          <CheckCircle2 className="h-4 w-4 shrink-0" /> {exito}
        </div>
      )}
      {error && <ErrorCarga mensaje={error} />}

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase text-[var(--color-text-secondary)]">Festivos registrados</h2>
        <button onClick={consultar} disabled={loading} className="flex items-center gap-1 text-xs text-[var(--color-accent-text)] hover:underline disabled:opacity-50">
          <RefreshCcw className="h-3.5 w-3.5" /> Actualizar
        </button>
      </div>

      {loading && <Cargando mensaje="Consultando festivos…" />}
      {!loading && items?.length === 0 && (
        <p className="text-sm text-[var(--color-text-secondary)]">No hay festivos registrados.</p>
      )}
      {!loading && items && items.length > 0 && (
        <div className="overflow-x-auto rounded border border-[var(--color-border)] bg-[var(--color-bg-card)]">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-[var(--color-text-secondary)]">
              <tr>
                <th className="px-3 py-2">Fecha</th>
                <th className="px-3 py-2">Descripción</th>
                <th className="px-3 py-2">Estado</th>
                <th className="px-3 py-2">Registrado por</th>
                <th className="px-3 py-2">Acción</th>
              </tr>
            </thead>
            <tbody className="text-[var(--color-text-primary)]">
              {items.map((f) => (
                <tr key={f.id} className="border-t border-[var(--color-border)]">
                  <td className="px-3 py-2 whitespace-nowrap">{fFecha(f.fecha)}</td>
                  <td className="px-3 py-2">{f.descripcion}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded border px-2 py-0.5 text-xs font-medium ${f.isActive ? "border-[var(--color-success-border)] text-[var(--color-success)]" : "border-[var(--color-border)] text-[var(--color-text-secondary)]"}`}>
                      {f.isActive ? "Activo" : "Inactivo"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-[var(--color-text-secondary)]">
                    {f.creadoPor ? `${f.creadoPor.nombre} ${f.creadoPor.apellido}` : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <button onClick={() => alternar(f)} disabled={enviando} className="rounded border border-[var(--color-amber)] px-3 py-1 text-xs font-medium text-[var(--color-accent-text)] hover:bg-[var(--color-amber)] hover:text-[var(--color-on-primary)] disabled:opacity-50">
                      {f.isActive ? "Desactivar" : "Activar"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
