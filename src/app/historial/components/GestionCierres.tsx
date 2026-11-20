// src/app/historial/components/GestionCierres.tsx
"use client";

import React, { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, RefreshCcw, RotateCcw } from "lucide-react";
import { useAuth } from "@/app/_components/AuthProvider";
import { Cargando, ErrorCarga, SinConsolidado } from "./EstadoCarga";

type EstadoPeriodo = "ABIERTA" | "PENDIENTE_CIERRE" | "CERRADA" | "REABIERTA";

interface CierreItem {
  id: string;
  version: number;
  tipo: "AUTOMATICO" | "MANUAL_ADMIN";
  cerradoEn: string;
  motivo: string | null;
}

interface IntentoItem {
  id: string;
  intentoNum: number;
  resultado: "EN_PROGRESO" | "EXITO" | "FALLO";
  errorMsg: string | null;
  iniciado: string;
  finalizado: string | null;
  abandonado: boolean;
  revisionRequerida: boolean;
}

interface PeriodoItem {
  id: string;
  inicioSemana: string;
  finSemana: string;
  estado: EstadoPeriodo;
  versionVigente: number | null;
  consolidacionPendiente: boolean;
  cierres: CierreItem[];
  intentos: IntentoItem[];
  revisionRequerida: boolean;
  motivosRevision: string[];
}

const MESES_ES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function fFecha(iso: string) {
  const d = new Date(iso);
  return `${d.getUTCDate()} ${MESES_ES[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

function fFechaHora(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" });
}

const ESTADO_CLASES: Record<EstadoPeriodo, string> = {
  ABIERTA: "border-[var(--color-info-border)] text-[var(--color-info)]",
  PENDIENTE_CIERRE: "border-[var(--color-warning-border)] text-[var(--color-warning)]",
  CERRADA: "border-[var(--color-success-border)] text-[var(--color-success)]",
  REABIERTA: "border-[var(--color-warning-border)] text-[var(--color-warning)]",
};

const RESULTADO_CLASES: Record<IntentoItem["resultado"], string> = {
  EN_PROGRESO: "text-[var(--color-warning)]",
  EXITO: "text-[var(--color-success)]",
  FALLO: "text-[var(--color-error)]",
};

function Badge({ children, className }: { children: React.ReactNode; className: string }) {
  return (
    <span className={`rounded border px-2 py-0.5 text-xs font-medium ${className}`}>{children}</span>
  );
}

function DialogoReabrir({
  p,
  onCancelar,
  onExito,
}: {
  p: PeriodoItem;
  onCancelar: () => void;
  onExito: (mensaje: string) => void;
}) {
  const [motivo, setMotivo] = useState("");
  const [confirmado, setConfirmado] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const puedeEnviar = motivo.trim().length > 0 && confirmado && !enviando;

  const enviar = async () => {
    if (!puedeEnviar) return;
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch("/api/historial/cierres/reabrir", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ periodoId: p.id, motivo: motivo.trim() }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string; mensaje?: string };
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      onExito(j.mensaje ?? "Período reabierto correctamente");
    } catch (e) {
      setError((e as Error).message);
      setEnviando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md space-y-4 rounded border border-[var(--color-border)] bg-[var(--color-bg-card)] p-5">
        <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">Reabrir semana</h3>
        <p className="text-sm text-[var(--color-text-secondary)]">
          Semana del {fFecha(p.inicioSemana)} al {fFecha(p.finSemana)} (versión vigente v{p.versionVigente ?? "—"}).
          El período pasará a REABIERTA. Los cierres existentes se conservan y la acción queda auditada.
        </p>
        <div className="flex flex-col gap-1">
          <label htmlFor="motivo-reapertura" className="text-xs text-[var(--color-text-secondary)]">
            Motivo (obligatorio)
          </label>
          <textarea
            id="motivo-reapertura"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={3}
            disabled={enviando}
            className="rounded border border-[var(--color-border)] bg-[var(--color-bg-main)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-amber)]"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-[var(--color-text-primary)]">
          <input
            type="checkbox"
            checked={confirmado}
            onChange={(e) => setConfirmado(e.target.checked)}
            disabled={enviando}
          />
          Confirmo que deseo reabrir esta semana
        </label>
        {error && <ErrorCarga mensaje={error} />}
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancelar}
            disabled={enviando}
            className="rounded border border-[var(--color-border)] px-4 py-1.5 text-sm text-[var(--color-text-secondary)] disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={enviar}
            disabled={!puedeEnviar}
            className="rounded bg-[var(--color-amber)] px-4 py-1.5 text-sm font-medium text-[var(--color-on-primary)] disabled:opacity-50"
          >
            {enviando ? "Reabriendo…" : "Reabrir"}
          </button>
        </div>
      </div>
    </div>
  );
}

function TarjetaPeriodo({
  p,
  onReabrir,
  onRecuperar,
  recuperando,
}: {
  p: PeriodoItem;
  onReabrir?: (p: PeriodoItem) => void;
  onRecuperar?: (p: PeriodoItem) => void;
  recuperando?: boolean;
}) {
  return (
    <div className="space-y-4 rounded border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-semibold text-[var(--color-text-primary)]">
            Semana del {fFecha(p.inicioSemana)} al {fFecha(p.finSemana)}
          </h3>
          <p className="text-xs text-[var(--color-text-secondary)]">
            {p.versionVigente !== null ? `Versión vigente: v${p.versionVigente}` : "Sin cierre exitoso"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge className={ESTADO_CLASES[p.estado]}>{p.estado.replace("_", " ")}</Badge>
          {p.revisionRequerida && (
            <Badge className="border-[var(--color-error-border)] bg-[var(--color-error-bg)] text-[var(--color-error)]">Revisión requerida</Badge>
          )}
          {onRecuperar && p.consolidacionPendiente && (
            <button
              onClick={() => onRecuperar(p)}
              disabled={recuperando}
              className="flex items-center gap-1 rounded border border-[var(--color-error-border)] px-3 py-1 text-xs font-medium text-[var(--color-error)] hover:bg-[var(--color-error)] hover:text-white disabled:opacity-50"
            >
              <RefreshCcw className={`h-3.5 w-3.5 ${recuperando ? "animate-spin" : ""}`} />
              {recuperando ? "Consolidando…" : "Recuperar consolidación"}
            </button>
          )}
          {onReabrir && p.estado === "CERRADA" && (
            <button
              onClick={() => onReabrir(p)}
              className="flex items-center gap-1 rounded border border-[var(--color-amber)] px-3 py-1 text-xs font-medium text-[var(--color-accent-text)] hover:bg-[var(--color-amber)] hover:text-[var(--color-on-primary)]"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Reabrir
            </button>
          )}
        </div>
      </div>

      {p.revisionRequerida && (
        <ul className="flex flex-col gap-1 text-xs text-[var(--color-error)]">
          {p.motivosRevision.map((m) => (
            <li key={m} className="flex items-center gap-1">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {m}
            </li>
          ))}
        </ul>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <section className="space-y-2">
          <h4 className="text-xs font-semibold uppercase text-[var(--color-text-secondary)]">
            Versiones de cierre ({p.cierres.length})
          </h4>
          {p.cierres.length === 0 ? (
            <p className="text-sm text-[var(--color-text-secondary)]">Sin cierres registrados.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-[var(--color-text-secondary)]">
                  <tr><th className="py-1 pr-3">Versión</th><th className="py-1 pr-3">Tipo</th><th className="py-1 pr-3">Fecha</th><th className="py-1">Motivo</th></tr>
                </thead>
                <tbody className="text-[var(--color-text-primary)]">
                  {p.cierres.map((c) => (
                    <tr key={c.id} className="border-t border-[var(--color-border)]">
                      <td className="py-1 pr-3">v{c.version}</td>
                      <td className="py-1 pr-3">{c.tipo === "AUTOMATICO" ? "Automático" : "Manual (ADMIN)"}</td>
                      <td className="py-1 pr-3 whitespace-nowrap">{fFechaHora(c.cerradoEn)}</td>
                      <td className="py-1 text-[var(--color-text-secondary)]">{c.motivo ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="space-y-2">
          <h4 className="text-xs font-semibold uppercase text-[var(--color-text-secondary)]">
            Intentos de cierre ({p.intentos.length})
          </h4>
          {p.intentos.length === 0 ? (
            <p className="text-sm text-[var(--color-text-secondary)]">Sin intentos registrados.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-[var(--color-text-secondary)]">
                  <tr><th className="py-1 pr-3">#</th><th className="py-1 pr-3">Resultado</th><th className="py-1 pr-3">Inicio</th><th className="py-1">Fin</th></tr>
                </thead>
                <tbody className="text-[var(--color-text-primary)]">
                  {p.intentos.map((i) => (
                    <React.Fragment key={i.id}>
                      <tr className="border-t border-[var(--color-border)]">
                        <td className="py-1 pr-3">{i.intentoNum}</td>
                        <td className={`py-1 pr-3 ${RESULTADO_CLASES[i.resultado]}`}>
                          {i.resultado.replace("_", " ")}
                          {i.abandonado && " (abandonado)"}
                          {i.revisionRequerida && <AlertTriangle className="ml-1 inline h-3.5 w-3.5 text-[var(--color-error)]" />}
                        </td>
                        <td className="py-1 pr-3 whitespace-nowrap">{fFechaHora(i.iniciado)}</td>
                        <td className="py-1 whitespace-nowrap">{fFechaHora(i.finalizado)}</td>
                      </tr>
                      {i.errorMsg && (
                        <tr><td colSpan={4} className="pb-2 text-xs text-[var(--color-text-secondary)]">{i.errorMsg}</td></tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

export default function GestionCierres() {
  const [limite, setLimite] = useState(12);
  const [periodos, setPeriodos] = useState<PeriodoItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();
  const esAdmin = user?.role === "ADMIN";
  const [aReabrir, setAReabrir] = useState<PeriodoItem | null>(null);
  const [exito, setExito] = useState<string | null>(null);
  const [errorAccion, setErrorAccion] = useState<string | null>(null);
  const [recuperandoId, setRecuperandoId] = useState<string | null>(null);

  const consultar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/historial/cierres?limite=${limite}`, { credentials: "include" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      const j = (await res.json()) as { data: PeriodoItem[] };
      setPeriodos(j.data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [limite]);

  useEffect(() => { consultar(); }, [consultar]);

  const recuperar = async (p: PeriodoItem) => {
    if (
      !window.confirm(
        `¿Recuperar la consolidación de la versión vigente v${p.versionVigente} ` +
          `(semana del ${fFecha(p.inicioSemana)})? No se crea un nuevo cierre.`
      )
    )
      return;
    setExito(null);
    setErrorAccion(null);
    setRecuperandoId(p.id);
    try {
      const res = await fetch("/api/historial/cierres/recuperar-consolidacion", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ periodoId: p.id }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string; mensaje?: string };
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      setExito(j.mensaje ?? "Consolidación recuperada");
      consultar();
    } catch (e) {
      setErrorAccion((e as Error).message);
    } finally {
      setRecuperandoId(null);
    }
  };

  const conRevision = periodos?.filter((p) => p.revisionRequerida).length ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-[var(--color-text-secondary)]">Semanas más recientes</label>
          <select
            value={limite}
            onChange={(e) => setLimite(Number(e.target.value))}
            className="rounded border border-[var(--color-border)] bg-[var(--color-bg-main)] px-3 py-1.5 text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-amber)]"
          >
            {[4, 12, 26, 52].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
        <button
          onClick={consultar}
          disabled={loading}
          className="flex items-center gap-2 rounded bg-[var(--color-amber)] px-4 py-1.5 font-medium text-[var(--color-on-primary)] disabled:opacity-50"
        >
          <RefreshCcw className="h-4 w-4" /> Actualizar
        </button>
        {periodos && conRevision > 0 && (
          <span className="flex items-center gap-1 text-sm text-[var(--color-error)]">
            <AlertTriangle className="h-4 w-4" /> {conRevision} período(s) requieren revisión
          </span>
        )}
      </div>

      {exito && (
        <div className="flex items-center gap-2 rounded border border-[var(--color-success-border)] bg-[var(--color-success-bg)] p-4 text-[var(--color-success)]">
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          <span>{exito}</span>
        </div>
      )}
      {errorAccion && <ErrorCarga mensaje={errorAccion} />}
      {aReabrir && (
        <DialogoReabrir
          p={aReabrir}
          onCancelar={() => setAReabrir(null)}
          onExito={(m) => {
            setAReabrir(null);
            setExito(m);
            consultar();
          }}
        />
      )}
      {loading && <Cargando mensaje="Consultando cierres…" />}
      {error && <ErrorCarga mensaje={error} />}
      {!loading && !error && periodos?.length === 0 && (
        <SinConsolidado texto="No hay períodos semanales registrados." />
      )}
      {!loading && !error && periodos && periodos.length > 0 && (
        <div className="space-y-4">
          {periodos.map((p) => (
            <TarjetaPeriodo
              key={p.id}
              p={p}
              onReabrir={esAdmin ? (sel) => { setExito(null); setErrorAccion(null); setAReabrir(sel); } : undefined}
              onRecuperar={esAdmin ? recuperar : undefined}
              recuperando={recuperandoId === p.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}
