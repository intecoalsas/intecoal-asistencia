// src/app/historial/components/BandejaMarcacionesTardias.tsx
"use client";

import React, { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Inbox, RefreshCcw } from "lucide-react";
import { useAuth } from "@/app/_components/AuthProvider";
import { Cargando, ErrorCarga } from "./EstadoCarga";

interface MarcacionTardiaItem {
  id: string;
  tipo: "ENTRADA_MANANA" | "SALIDA_ALMUERZO" | "ENTRADA_ALMUERZO" | "SALIDA_JORNADA";
  estado: "PENDIENTE" | "INCORPORADA" | "RECHAZADA";
  fechaLaboral: string;
  timestampRealizacionUTC: string;
  timestampRecepcionUTC: string;
  empleado: { id: string; nombre: string | null; apellido: string | null; documento: string | null };
  semana: { id: string; inicioSemana: string | null; finSemana: string | null; estado: string | null };
  kiosco: { id: string; codigo: string | null; nombre: string | null } | null;
}

const TIPO_LABEL: Record<MarcacionTardiaItem["tipo"], string> = {
  ENTRADA_MANANA: "Entrada mañana",
  SALIDA_ALMUERZO: "Salida almuerzo",
  ENTRADA_ALMUERZO: "Entrada almuerzo",
  SALIDA_JORNADA: "Salida jornada",
};

const MESES_ES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function fFecha(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${d.getUTCDate()} ${MESES_ES[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

function fFechaHora(iso: string) {
  return new Date(iso).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "medium" });
}

type Accion = "incorporar" | "rechazar";

const ACCION_TEXTO: Record<Accion, { titulo: string; boton: string; enCurso: string; aviso: string; confirmacion: string }> = {
  incorporar: {
    titulo: "Incorporar marcación tardía",
    boton: "Incorporar",
    enCurso: "Incorporando…",
    aviso:
      "La semana se reabrirá, se registrará la marcación y se cerrará de nuevo generando una nueva versión de cierre. Los cierres anteriores se conservan.",
    confirmacion: "Confirmo que deseo incorporar esta marcación",
  },
  rechazar: {
    titulo: "Rechazar marcación tardía",
    boton: "Rechazar",
    enCurso: "Rechazando…",
    aviso:
      "La marcación quedará como RECHAZADA con el motivo indicado. No se modifica la asistencia ni la semana.",
    confirmacion: "Confirmo que deseo rechazar esta marcación",
  },
};

function DialogoAccion({
  accion,
  m,
  onCancelar,
  onExito,
}: {
  accion: Accion;
  m: MarcacionTardiaItem;
  onCancelar: () => void;
  onExito: (mensaje: string) => void;
}) {
  const t = ACCION_TEXTO[accion];
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
      const res = await fetch(`/api/historial/marcaciones-tardias/${accion}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ marcacionId: m.id, motivo: motivo.trim() }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string; mensaje?: string };
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      onExito(j.mensaje ?? "Operación realizada");
    } catch (e) {
      setError((e as Error).message);
      setEnviando(false);
    }
  };

  const nombre = m.empleado.nombre ? `${m.empleado.nombre} ${m.empleado.apellido ?? ""}` : m.empleado.id;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md space-y-4 rounded border border-[var(--color-border)] bg-[var(--color-bg-card)] p-5">
        <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">{t.titulo}</h3>
        <div className="text-sm text-[var(--color-text-secondary)] space-y-1">
          <p>{nombre} · {TIPO_LABEL[m.tipo] ?? m.tipo} · {fFecha(m.fechaLaboral)}</p>
          <p>Realizada: {fFechaHora(m.timestampRealizacionUTC)}</p>
          <p>{t.aviso}</p>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="motivo-accion" className="text-xs text-[var(--color-text-secondary)]">Motivo (obligatorio)</label>
          <textarea
            id="motivo-accion"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={3}
            disabled={enviando}
            className="rounded border border-[var(--color-border)] bg-[var(--color-bg-main)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-amber)]"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-[var(--color-text-primary)]">
          <input type="checkbox" checked={confirmado} onChange={(e) => setConfirmado(e.target.checked)} disabled={enviando} />
          {t.confirmacion}
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
            className={`rounded px-4 py-1.5 text-sm font-medium disabled:opacity-50 ${
              accion === "rechazar" ? "bg-[var(--color-error)] text-white" : "bg-[var(--color-amber)] text-[var(--color-on-primary)]"
            }`}
          >
            {enviando ? t.enCurso : t.boton}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function BandejaMarcacionesTardias() {
  const [items, setItems] = useState<MarcacionTardiaItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();
  const esAdmin = user?.role === "ADMIN";
  const [dialogo, setDialogo] = useState<{ accion: Accion; m: MarcacionTardiaItem } | null>(null);
  const [exito, setExito] = useState<string | null>(null);

  const consultar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/historial/marcaciones-tardias", { credentials: "include" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      const j = (await res.json()) as { data: MarcacionTardiaItem[] };
      setItems(j.data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { consultar(); }, [consultar]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={consultar}
          disabled={loading}
          className="flex items-center gap-2 rounded bg-[var(--color-amber)] px-4 py-1.5 font-medium text-[var(--color-on-primary)] disabled:opacity-50"
        >
          <RefreshCcw className="h-4 w-4" /> Actualizar
        </button>
        {items && items.length > 0 && (
          <span className="text-sm text-[var(--color-text-secondary)]">
            {items.length} marcación(es) pendiente(s) de decisión
          </span>
        )}
      </div>

      {exito && (
        <div className="flex items-center gap-2 rounded border border-[var(--color-success-border)] bg-[var(--color-success-bg)] p-4 text-[var(--color-success)]">
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          <span>{exito}</span>
        </div>
      )}
      {dialogo && (
        <DialogoAccion
          accion={dialogo.accion}
          m={dialogo.m}
          onCancelar={() => setDialogo(null)}
          onExito={(msg) => {
            setDialogo(null);
            setExito(msg);
            consultar();
          }}
        />
      )}
      {loading && <Cargando mensaje="Consultando marcaciones tardías…" />}
      {error && <ErrorCarga mensaje={error} />}

      {!loading && !error && items?.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-16 text-[var(--color-text-secondary)]">
          <Inbox className="h-10 w-10 opacity-40" />
          <p className="text-sm">No hay marcaciones tardías pendientes.</p>
        </div>
      )}

      {!loading && !error && items && items.length > 0 && (
        <div className="overflow-x-auto rounded border border-[var(--color-border)] bg-[var(--color-bg-card)]">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-[var(--color-text-secondary)]">
              <tr>
                <th className="px-3 py-2">Empleado</th>
                <th className="px-3 py-2">Tipo</th>
                <th className="px-3 py-2">Fecha laboral</th>
                <th className="px-3 py-2">Realización</th>
                <th className="px-3 py-2">Recepción</th>
                <th className="px-3 py-2">Semana</th>
                <th className="px-3 py-2">Estado</th>
                <th className="px-3 py-2">Registro</th>
                {esAdmin && <th className="px-3 py-2">Acciones</th>}
              </tr>
            </thead>
            <tbody className="text-[var(--color-text-primary)]">
              {items.map((m) => (
                <tr key={m.id} className="border-t border-[var(--color-border)] align-top">
                  <td className="px-3 py-2">
                    <div>{m.empleado.nombre ? `${m.empleado.nombre} ${m.empleado.apellido ?? ""}` : "Empleado no encontrado"}</div>
                    <div className="text-xs text-[var(--color-text-secondary)]">{m.empleado.documento ?? m.empleado.id}</div>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">{TIPO_LABEL[m.tipo] ?? m.tipo}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{fFecha(m.fechaLaboral)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{fFechaHora(m.timestampRealizacionUTC)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{fFechaHora(m.timestampRecepcionUTC)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <div>{fFecha(m.semana.inicioSemana)} – {fFecha(m.semana.finSemana)}</div>
                    {m.semana.estado && (
                      <div className="text-xs text-[var(--color-text-secondary)]">{m.semana.estado.replace("_", " ")}</div>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <span className="rounded border border-[var(--color-warning-border)] px-2 py-0.5 text-xs font-medium text-[var(--color-warning)]">{m.estado}</span>
                  </td>
                  <td className="px-3 py-2 text-xs text-[var(--color-text-secondary)]">
                    <div title={m.id}>ID {m.id.slice(0, 8)}…</div>
                    {m.kiosco && <div>{m.kiosco.codigo ?? m.kiosco.id.slice(0, 8)}</div>}
                  </td>
                  {esAdmin && (
                    <td className="px-3 py-2">
                      {m.estado === "PENDIENTE" && (
                        <div className="flex gap-2">
                          <button
                            onClick={() => { setExito(null); setDialogo({ accion: "incorporar", m }); }}
                            className="rounded border border-[var(--color-amber)] px-3 py-1 text-xs font-medium text-[var(--color-accent-text)] hover:bg-[var(--color-amber)] hover:text-[var(--color-on-primary)]"
                          >
                            Incorporar
                          </button>
                          <button
                            onClick={() => { setExito(null); setDialogo({ accion: "rechazar", m }); }}
                            className="rounded border border-[var(--color-error-border)] px-3 py-1 text-xs font-medium text-[var(--color-error)] hover:bg-[var(--color-error)] hover:text-white"
                          >
                            Rechazar
                          </button>
                        </div>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
