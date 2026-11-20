// src/app/marcaciones/CorreccionMarcacion.tsx
"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";

type Marca = { id: string; version: number; corregida: boolean };

interface Version {
  id: string;
  versionNumber: number;
  timestampUTC: string;
  estado: "ORIGINAL" | "CORREGIDO" | "ANULADO";
  esOriginal: boolean;
  auditLog: { motivo: string; createdAt: string; incidentId: string | null; admin: { nombre: string; apellido: string } } | null;
}

interface Incidencia { id: string; documento: string; fecha: string; tipo: string; estado: string; descripcion: string }

const TIPOS: { v: string; l: string }[] = [
  { v: "ENTRADA_MANANA", l: "Entrada mañana" },
  { v: "SALIDA_ALMUERZO", l: "Salida almuerzo" },
  { v: "ENTRADA_ALMUERZO", l: "Entrada almuerzo" },
  { v: "SALIDA_JORNADA", l: "Salida jornada" },
];

const inputCls =
  "rounded border border-[var(--color-border)] bg-[var(--color-bg-main)] px-3 py-1.5 text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-amber)]";
const hora = (iso: string) => new Date(iso).toLocaleTimeString("es-CO", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit", hour12: false });
const fechaHora = (iso: string) => new Date(iso).toLocaleString("es-CO", { timeZone: "America/Bogota", dateStyle: "medium", timeStyle: "short" });

export default function CorreccionMarcacion({
  nombre, documento, fecha, marcas, esAdmin, onCerrar, onCorregida,
}: {
  nombre: string;
  documento: string;
  fecha: string;
  marcas: Record<string, Marca>;
  esAdmin: boolean;
  onCerrar: () => void;
  onCorregida: (mensaje: string) => void;
}) {
  const disponibles = TIPOS.filter((t) => marcas[t.v]);
  const [tipo, setTipo] = useState(disponibles[0]?.v ?? "");
  const marca = marcas[tipo];
  const [versiones, setVersiones] = useState<Version[] | null>(null);
  const [errorHist, setErrorHist] = useState<string | null>(null);
  const [nuevaHora, setNuevaHora] = useState("");
  const [motivo, setMotivo] = useState("");
  const [incidencias, setIncidencias] = useState<Incidencia[]>([]);
  const [incidenciaId, setIncidenciaId] = useState("");
  const [resolver, setResolver] = useState(false);
  const [confirmado, setConfirmado] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargarHistorial = useCallback(async (id: string) => {
    setVersiones(null);
    setErrorHist(null);
    try {
      const r = await fetch(`/api/marcaciones/${id}/historial`, { credentials: "include" });
      const j = (await r.json().catch(() => ({}))) as { data?: { versions: Version[] }; error?: string };
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      setVersiones(j.data?.versions ?? []);
    } catch (e) {
      setErrorHist((e as Error).message);
    }
  }, []);

  useEffect(() => { if (marca) void cargarHistorial(marca.id); }, [marca, cargarHistorial]);

  useEffect(() => {
    if (!esAdmin) return;
    fetch("/api/incidencias", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { incidents: [] }))
      .then((j: { incidents?: Incidencia[] }) =>
        setIncidencias((j.incidents ?? []).filter((i) => i.documento === documento && i.fecha === fecha)))
      .catch(() => setIncidencias([]));
  }, [esAdmin, documento, fecha]);

  const incSeleccionada = useMemo(() => incidencias.find((i) => i.id === incidenciaId), [incidencias, incidenciaId]);
  const puedeResolver = !!incSeleccionada && ["PENDIENTE", "EN_REVISION"].includes(incSeleccionada.estado);
  const valido = !!marca && /^\d{2}:\d{2}$/.test(nuevaHora) && motivo.trim().length > 0 && confirmado && !enviando;

  const corregir = async () => {
    if (!valido || !marca) return;
    setEnviando(true);
    setError(null);
    try {
      const r = await fetch(`/api/marcaciones/${marca.id}/correccion`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nuevaHora, motivo: motivo.trim(), versionEsperada: marca.version,
          incidenciaId: incidenciaId || undefined, resolverIncidencia: puedeResolver && resolver,
        }),
      });
      const j = (await r.json().catch(() => ({}))) as { mensaje?: string; error?: string };
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      onCorregida(j.mensaje ?? "Marcación corregida");
    } catch (e) {
      setError((e as Error).message);
      setEnviando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true">
      <div className="max-h-[90vh] w-full max-w-xl space-y-4 overflow-y-auto rounded border border-[var(--color-border)] bg-[var(--color-bg-card)] p-5">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">
            {esAdmin ? "Historial y corrección de marcación" : "Historial de marcación"}
          </h3>
          <button onClick={onCerrar} aria-label="Cerrar" className="text-[var(--color-text-secondary)]"><X className="h-5 w-5" /></button>
        </div>
        <p className="text-sm text-[var(--color-text-secondary)]">{nombre} · {documento} · {fecha}</p>

        <div className="flex flex-col gap-1">
          <label htmlFor="corr-tipo" className="text-xs text-[var(--color-text-secondary)]">Marca</label>
          <select id="corr-tipo" value={tipo} onChange={(e) => { setTipo(e.target.value); setError(null); }} className={inputCls}>
            {disponibles.map((t) => <option key={t.v} value={t.v}>{t.l}{marcas[t.v]?.corregida ? " (corregida)" : ""}</option>)}
          </select>
        </div>

        <section className="space-y-2">
          <h4 className="text-xs font-semibold uppercase text-[var(--color-text-secondary)]">Versiones</h4>
          {errorHist && <p className="text-sm text-[var(--color-error)]">{errorHist}</p>}
          {!errorHist && !versiones && <p className="text-sm text-[var(--color-text-secondary)]">Cargando…</p>}
          {versiones && versiones.length === 0 && (
            <p className="text-sm text-[var(--color-text-secondary)]">Sin correcciones: se conserva el registro original del kiosco.</p>
          )}
          {versiones && versiones.length > 0 && (
            <ul className="space-y-2 text-sm">
              {versiones.map((v) => (
                <li key={v.id} className="rounded border border-[var(--color-border)] p-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-[var(--color-text-primary)]">v{v.versionNumber} · {hora(v.timestampUTC)}</span>
                    <span className={`rounded border px-2 py-0.5 text-xs ${v.esOriginal ? "border-[var(--color-border)] text-[var(--color-text-secondary)]" : "border-[var(--color-warning-border)] text-[var(--color-warning)]"}`}>
                      {v.esOriginal ? "Original" : "Corregida"}
                    </span>
                  </div>
                  {v.auditLog && (
                    <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
                      {v.auditLog.admin.nombre} {v.auditLog.admin.apellido} · {fechaHora(v.auditLog.createdAt)} · Motivo: {v.auditLog.motivo}
                      {v.auditLog.incidentId ? " · Vinculada a incidencia" : ""}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {esAdmin && marca && (
          <section className="space-y-3 border-t border-[var(--color-border)] pt-4">
            <h4 className="text-xs font-semibold uppercase text-[var(--color-text-secondary)]">Corregir hora</h4>
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-1">
                <label htmlFor="corr-hora" className="text-xs text-[var(--color-text-secondary)]">Nueva hora</label>
                <input id="corr-hora" type="time" value={nuevaHora} onChange={(e) => setNuevaHora(e.target.value)} className={inputCls} />
              </div>
              {incidencias.length > 0 && (
                <div className="flex min-w-[220px] flex-1 flex-col gap-1">
                  <label htmlFor="corr-inc" className="text-xs text-[var(--color-text-secondary)]">Incidencia relacionada (opcional)</label>
                  <select id="corr-inc" value={incidenciaId} onChange={(e) => { setIncidenciaId(e.target.value); setResolver(false); }} className={inputCls}>
                    <option value="">Ninguna</option>
                    {incidencias.map((i) => <option key={i.id} value={i.id}>{i.tipo} · {i.estado} · {i.descripcion.slice(0, 40)}</option>)}
                  </select>
                </div>
              )}
            </div>
            {puedeResolver && (
              <label className="flex items-center gap-2 text-sm text-[var(--color-text-primary)]">
                <input type="checkbox" checked={resolver} onChange={(e) => setResolver(e.target.checked)} />
                Marcar la incidencia como resuelta con este motivo
              </label>
            )}
            <div className="flex flex-col gap-1">
              <label htmlFor="corr-motivo" className="text-xs text-[var(--color-text-secondary)]">Motivo (obligatorio)</label>
              <textarea id="corr-motivo" rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} className={inputCls} />
            </div>
            <p className="text-xs text-[var(--color-text-secondary)]">
              Se conserva la hora original y cada versión anterior. Si la semana está cerrada, se reabre y se vuelve a cerrar con una nueva versión.
            </p>
            <label className="flex items-center gap-2 text-sm text-[var(--color-text-primary)]">
              <input type="checkbox" checked={confirmado} onChange={(e) => setConfirmado(e.target.checked)} />
              Confirmo la corrección de esta marcación
            </label>
            {error && <p className="rounded border border-[var(--color-error-border)] bg-[var(--color-error-bg)] p-2 text-sm text-[var(--color-error)]">{error}</p>}
            <div className="flex justify-end gap-2">
              <button onClick={onCerrar} disabled={enviando} className="rounded border border-[var(--color-border)] px-4 py-1.5 text-sm text-[var(--color-text-secondary)] disabled:opacity-50">Cancelar</button>
              <button onClick={() => void corregir()} disabled={!valido} className="rounded bg-[var(--color-amber)] px-4 py-1.5 text-sm font-medium text-[var(--color-on-primary)] disabled:opacity-50">
                {enviando ? "Corrigiendo…" : "Corregir"}
              </button>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
