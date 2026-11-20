// src/app/calendario/components/GestionNovedades.tsx
"use client";

import React, { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Plus, RefreshCcw, Search, X } from "lucide-react";
import { Cargando, ErrorCarga } from "@/app/historial/components/EstadoCarga";

type Estado = "PENDIENTE" | "AUTORIZADA" | "RECHAZADA";
type Tipo = "VACACIONES" | "INCAPACIDAD" | "PERMISO" | "LICENCIA" | "OTRO";

interface Persona { nombre: string; apellido: string }
interface Novedad {
  id: string;
  tipo: Tipo;
  estado: Estado;
  fechaInicio: string;
  fechaFin: string;
  motivo: string;
  motivoDecision: string | null;
  resueltaEn: string | null;
  createdAt: string;
  user: Persona & { id: string; documento: string };
  registradaPor: Persona;
  resueltaPor: Persona | null;
}
interface Empleado { id: string; nombre: string; apellido: string; documento: string; role: string; isActive: boolean }

const TIPOS: { v: Tipo; l: string }[] = [
  { v: "VACACIONES", l: "Vacaciones" },
  { v: "INCAPACIDAD", l: "Incapacidad" },
  { v: "PERMISO", l: "Permiso" },
  { v: "LICENCIA", l: "Licencia" },
  { v: "OTRO", l: "Otro" },
];
const TIPO_L = Object.fromEntries(TIPOS.map((t) => [t.v, t.l])) as Record<Tipo, string>;
const ESTADO_CLS: Record<Estado, string> = {
  PENDIENTE: "border-[var(--color-warning-border)] text-[var(--color-warning)]",
  AUTORIZADA: "border-[var(--color-success-border)] text-[var(--color-success)]",
  RECHAZADA: "border-[var(--color-error-border)] text-[var(--color-error)]",
};
const ESTADO_L: Record<Estado, string> = { PENDIENTE: "Pendiente", AUTORIZADA: "Autorizada", RECHAZADA: "Rechazada" };

const inputCls =
  "rounded border border-[var(--color-border)] bg-[var(--color-bg-main)] px-3 py-1.5 text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-amber)]";
const nombre = (p: Persona | null) => (p ? `${p.nombre} ${p.apellido}` : "—");
const fFecha = (iso: string) => new Date(iso).toLocaleDateString("es-CO", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" });
const fFechaHora = (iso: string | null) => (iso ? new Date(iso).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" }) : "—");

function Badge({ estado }: { estado: Estado }) {
  return <span className={`rounded border px-2 py-0.5 text-xs font-medium ${ESTADO_CLS[estado]}`}>{ESTADO_L[estado]}</span>;
}

// ── Detalle y decisión ───────────────────────────────────────────────────
function DetalleNovedad({
  n, esAdmin, onCerrar, onDecidida,
}: { n: Novedad; esAdmin: boolean; onCerrar: () => void; onDecidida: (msg: string) => void }) {
  const [motivo, setMotivo] = useState("");
  const [confirmado, setConfirmado] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const puedeDecidir = esAdmin && n.estado === "PENDIENTE";

  const decidir = async (decision: "AUTORIZAR" | "RECHAZAR") => {
    if (!motivo.trim() || !confirmado) return;
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch(`/api/calendario/novedades/${n.id}/decision`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, motivo: motivo.trim() }),
      });
      const j = (await res.json().catch(() => ({}))) as { mensaje?: string; error?: string };
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      onDecidida(j.mensaje ?? "Decisión registrada");
    } catch (e) {
      setError((e as Error).message);
      setEnviando(false);
    }
  };

  const fila = (l: string, v: React.ReactNode) => (
    <div className="grid grid-cols-[140px_1fr] gap-2 text-sm">
      <span className="text-[var(--color-text-secondary)]">{l}</span>
      <span className="text-[var(--color-text-primary)]">{v}</span>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-lg space-y-4 rounded border border-[var(--color-border)] bg-[var(--color-bg-card)] p-5">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">Detalle de la novedad</h3>
          <button onClick={onCerrar} aria-label="Cerrar" className="text-[var(--color-text-secondary)]"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-1.5">
          {fila("Empleado", `${nombre(n.user)} · ${n.user.documento}`)}
          {fila("Tipo", TIPO_L[n.tipo])}
          {fila("Periodo", `${fFecha(n.fechaInicio)} – ${fFecha(n.fechaFin)}`)}
          {fila("Estado", <Badge estado={n.estado} />)}
          {fila("Motivo", n.motivo)}
          {fila("Registrada por", `${nombre(n.registradaPor)} · ${fFechaHora(n.createdAt)}`)}
          {n.estado !== "PENDIENTE" && (
            <>
              {fila("Decidida por", nombre(n.resueltaPor))}
              {fila("Fecha de decisión", fFechaHora(n.resueltaEn))}
              {fila("Motivo de decisión", n.motivoDecision ?? "—")}
            </>
          )}
        </div>

        {puedeDecidir && (
          <div className="space-y-3 border-t border-[var(--color-border)] pt-4">
            <p className="text-xs text-[var(--color-text-secondary)]">
              Solo las novedades autorizadas afectan la asistencia. Si cubre semanas ya cerradas, el historial no cambia hasta reabrirlas y volver a cerrarlas.
            </p>
            <div className="flex flex-col gap-1">
              <label htmlFor="nov-motivo-dec" className="text-xs text-[var(--color-text-secondary)]">Motivo de la decisión (obligatorio)</label>
              <textarea id="nov-motivo-dec" rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} disabled={enviando} className={inputCls} />
            </div>
            <label className="flex items-center gap-2 text-sm text-[var(--color-text-primary)]">
              <input type="checkbox" checked={confirmado} onChange={(e) => setConfirmado(e.target.checked)} disabled={enviando} />
              Confirmo la decisión sobre esta novedad
            </label>
            {error && <ErrorCarga mensaje={error} />}
            <div className="flex justify-end gap-2">
              <button onClick={() => decidir("RECHAZAR")} disabled={enviando || !motivo.trim() || !confirmado} className="rounded bg-[var(--color-error)] px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50">Rechazar</button>
              <button onClick={() => decidir("AUTORIZAR")} disabled={enviando || !motivo.trim() || !confirmado} className="rounded bg-[var(--color-amber)] px-4 py-1.5 text-sm font-medium text-[var(--color-on-primary)] disabled:opacity-50">Autorizar</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Registro ─────────────────────────────────────────────────────────────
function FormularioNovedad({ empleados, onRegistrada }: { empleados: Empleado[]; onRegistrada: (msg: string) => void }) {
  const [userId, setUserId] = useState("");
  const [tipo, setTipo] = useState<Tipo>("PERMISO");
  const [fechaInicio, setFechaInicio] = useState("");
  const [fechaFin, setFechaFin] = useState("");
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fechasInvalidas = Boolean(fechaInicio && fechaFin && fechaFin < fechaInicio);
  const valido = userId && fechaInicio && fechaFin && motivo.trim() && !fechasInvalidas;

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valido) return;
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch("/api/calendario/novedades", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, tipo, fechaInicio, fechaFin, motivo: motivo.trim() }),
      });
      const j = (await res.json().catch(() => ({}))) as { mensaje?: string; error?: string };
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      setUserId(""); setFechaInicio(""); setFechaFin(""); setMotivo("");
      onRegistrada(j.mensaje ?? "Novedad registrada");
    } catch (er) {
      setError((er as Error).message);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <form onSubmit={enviar} className="space-y-3 rounded border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4">
      <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Registrar novedad</h2>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-[220px] flex-col gap-1">
          <label htmlFor="nov-emp" className="text-xs text-[var(--color-text-secondary)]">Empleado</label>
          <select id="nov-emp" value={userId} onChange={(e) => setUserId(e.target.value)} className={inputCls} required>
            <option value="">Selecciona…</option>
            {empleados.map((e) => <option key={e.id} value={e.id}>{e.nombre} {e.apellido} · {e.documento}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="nov-tipo" className="text-xs text-[var(--color-text-secondary)]">Tipo</label>
          <select id="nov-tipo" value={tipo} onChange={(e) => setTipo(e.target.value as Tipo)} className={inputCls}>
            {TIPOS.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="nov-ini" className="text-xs text-[var(--color-text-secondary)]">Desde</label>
          <input id="nov-ini" type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} className={inputCls} required />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="nov-fin" className="text-xs text-[var(--color-text-secondary)]">Hasta</label>
          <input id="nov-fin" type="date" value={fechaFin} min={fechaInicio || undefined} onChange={(e) => setFechaFin(e.target.value)} className={inputCls} required />
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="nov-motivo" className="text-xs text-[var(--color-text-secondary)]">Motivo</label>
        <textarea id="nov-motivo" rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} className={inputCls} required />
      </div>
      {fechasInvalidas && <p className="text-xs text-[var(--color-error)]">La fecha final no puede ser anterior a la inicial.</p>}
      {error && <ErrorCarga mensaje={error} />}
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-[var(--color-text-secondary)]">La novedad queda Pendiente hasta que un administrador la autorice o rechace.</p>
        <button type="submit" disabled={!valido || enviando} className="flex items-center gap-2 rounded bg-[var(--color-amber)] px-4 py-1.5 text-sm font-medium text-[var(--color-on-primary)] disabled:opacity-50">
          <Plus className="h-4 w-4" /> Registrar
        </button>
      </div>
    </form>
  );
}

// ── Listado con filtros ──────────────────────────────────────────────────
export default function GestionNovedades({ esAdmin }: { esAdmin: boolean }) {
  const [items, setItems] = useState<Novedad[] | null>(null);
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);
  const [detalle, setDetalle] = useState<Novedad | null>(null);
  const [filtros, setFiltros] = useState({ userId: "", tipo: "", estado: "", desde: "", hasta: "" });

  const consultar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams(Object.entries(filtros).filter(([, v]) => v)).toString();
      const res = await fetch(`/api/calendario/novedades${qs ? `?${qs}` : ""}`, { credentials: "include" });
      const j = (await res.json().catch(() => ({}))) as { data?: Novedad[]; error?: string };
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      setItems(j.data ?? []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [filtros]);

  useEffect(() => { consultar(); }, [consultar]);

  useEffect(() => {
    fetch("/api/empleados", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { employees: [] }))
      .then((j: { employees?: Empleado[] }) =>
        setEmpleados((j.employees ?? []).filter((e) => e.role === "EMPLEADO" && e.isActive)))
      .catch(() => setEmpleados([]));
  }, []);

  const setF = (k: keyof typeof filtros) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setFiltros((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="space-y-6">
      <FormularioNovedad empleados={empleados} onRegistrada={(m) => { setExito(m); consultar(); }} />

      {exito && (
        <div className="flex items-center gap-2 rounded border border-[var(--color-success-border)] bg-[var(--color-success-bg)] p-3 text-sm text-[var(--color-success)]">
          <CheckCircle2 className="h-4 w-4 shrink-0" /> {exito}
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="f-emp" className="text-xs text-[var(--color-text-secondary)]">Empleado</label>
          <select id="f-emp" value={filtros.userId} onChange={setF("userId")} className={inputCls}>
            <option value="">Todos</option>
            {empleados.map((e) => <option key={e.id} value={e.id}>{e.nombre} {e.apellido}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="f-tipo" className="text-xs text-[var(--color-text-secondary)]">Tipo</label>
          <select id="f-tipo" value={filtros.tipo} onChange={setF("tipo")} className={inputCls}>
            <option value="">Todos</option>
            {TIPOS.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="f-est" className="text-xs text-[var(--color-text-secondary)]">Estado</label>
          <select id="f-est" value={filtros.estado} onChange={setF("estado")} className={inputCls}>
            <option value="">Todos</option>
            {(["PENDIENTE", "AUTORIZADA", "RECHAZADA"] as Estado[]).map((s) => <option key={s} value={s}>{ESTADO_L[s]}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="f-desde" className="text-xs text-[var(--color-text-secondary)]">Desde</label>
          <input id="f-desde" type="date" value={filtros.desde} onChange={setF("desde")} className={inputCls} />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="f-hasta" className="text-xs text-[var(--color-text-secondary)]">Hasta</label>
          <input id="f-hasta" type="date" value={filtros.hasta} onChange={setF("hasta")} className={inputCls} />
        </div>
        <button onClick={consultar} disabled={loading} className="flex items-center gap-2 rounded border border-[var(--color-amber)] px-3 py-1.5 text-sm text-[var(--color-accent-text)] disabled:opacity-50">
          {loading ? <RefreshCcw className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Buscar
        </button>
      </div>

      {error && <ErrorCarga mensaje={error} />}
      {loading && <Cargando mensaje="Consultando novedades…" />}
      {!loading && !error && items?.length === 0 && (
        <p className="text-sm text-[var(--color-text-secondary)]">No hay novedades con estos filtros.</p>
      )}
      {!loading && items && items.length > 0 && (
        <div className="overflow-x-auto rounded border border-[var(--color-border)] bg-[var(--color-bg-card)]">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-[var(--color-text-secondary)]">
              <tr>
                <th className="px-3 py-2">Empleado</th>
                <th className="px-3 py-2">Tipo</th>
                <th className="px-3 py-2">Periodo</th>
                <th className="px-3 py-2">Estado</th>
                <th className="px-3 py-2">Decisión</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="text-[var(--color-text-primary)]">
              {items.map((n) => (
                <tr key={n.id} className="border-t border-[var(--color-border)] align-top">
                  <td className="px-3 py-2">
                    <div>{nombre(n.user)}</div>
                    <div className="text-xs text-[var(--color-text-secondary)]">{n.user.documento}</div>
                  </td>
                  <td className="px-3 py-2">{TIPO_L[n.tipo]}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{fFecha(n.fechaInicio)} – {fFecha(n.fechaFin)}</td>
                  <td className="px-3 py-2"><Badge estado={n.estado} /></td>
                  <td className="px-3 py-2 text-xs text-[var(--color-text-secondary)]">
                    {n.estado === "PENDIENTE" ? "—" : <>{nombre(n.resueltaPor)}<br />{fFechaHora(n.resueltaEn)}</>}
                  </td>
                  <td className="px-3 py-2">
                    <button onClick={() => { setExito(null); setDetalle(n); }} className="rounded border border-[var(--color-amber)] px-3 py-1 text-xs font-medium text-[var(--color-accent-text)] hover:bg-[var(--color-amber)] hover:text-[var(--color-on-primary)]">
                      {esAdmin && n.estado === "PENDIENTE" ? "Revisar" : "Ver detalle"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {detalle && (
        <DetalleNovedad
          n={detalle}
          esAdmin={esAdmin}
          onCerrar={() => setDetalle(null)}
          onDecidida={(m) => { setDetalle(null); setExito(m); consultar(); }}
        />
      )}
    </div>
  );
}
