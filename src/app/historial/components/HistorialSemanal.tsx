// src/app/historial/components/HistorialSemanal.tsx
"use client";

import React, { useState, useCallback, useEffect } from "react";
import { Search } from "lucide-react";
import { useAnioInicial } from "./useAnioInicial";
import { Cargando, ErrorCarga, SinConsolidado } from "./EstadoCarga";
import BtnExportar from "./BtnExportar";
import MetricasGrid from "./MetricasGrid";
import type { ResumenSemanal, DiaConsolidado } from "./types";
import { formatMinutos } from "@/lib/utils";

const DIAS_ES = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const MESES_ES = [
  "enero","febrero","marzo","abril","mayo","junio",
  "julio","agosto","septiembre","octubre","noviembre","diciembre",
];

function formatFecha(iso: string) {
  const d = new Date(iso);
  return `${d.getUTCDate()} de ${MESES_ES[d.getUTCMonth()]} de ${d.getUTCFullYear()}`;
}

function DiaBadge({ dia }: { dia: DiaConsolidado }) {
  const fecha = new Date(dia.fechaLaboral);
  const diaSemana = DIAS_ES[(fecha.getUTCDay() + 6) % 7]; // lun=0
  const diaNum = fecha.getUTCDate();

  let bgColor = "bg-[var(--color-bg-main)] border border-[var(--color-border)]";
  let textoEstado = "No laboral";
  if (dia.esLaboral) {
    if (dia.ausente) {
      bgColor = "bg-[var(--color-error-bg)] border border-[var(--color-error-border)]";
      textoEstado = "Ausente";
    } else if (dia.jornadaCompleta) {
      bgColor = "bg-[var(--color-success-bg)] border border-[var(--color-success-border)]";
      textoEstado = dia.esImpuntual ? "Completa · Tarde" : "Completa";
    } else {
      bgColor = "bg-[var(--color-warning-bg)] border border-[var(--color-warning-border)]";
      textoEstado = "Incompleta";
    }
  }

  return (
    <div className={`rounded-lg p-3 text-sm ${bgColor}`}>
      <p className="font-semibold text-[var(--color-text-primary)]">
        {diaSemana} {diaNum}
      </p>
      <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">{textoEstado}</p>
      {dia.esLaboral && dia.esImpuntual && (
        <p className="text-xs text-[var(--color-warning)] mt-1">
          +{formatMinutos(dia.tardanzaEntradaMin + dia.tardanzaAlmuerzoMin)} de retraso
        </p>
      )}
      {(dia.incidenciasPendientes > 0) && (
        <p className="text-xs text-[var(--color-warning)] mt-1">
          {dia.incidenciasPendientes} incid. pendiente{dia.incidenciasPendientes > 1 ? "s" : ""}
        </p>
      )}
    </div>
  );
}

function TablaDetalle({ dias }: { dias: DiaConsolidado[] }) {
  // Agrupar por usuario
  const porUsuario = new Map<string, DiaConsolidado[]>();
  for (const d of dias) {
    if (!porUsuario.has(d.userId)) porUsuario.set(d.userId, []);
    porUsuario.get(d.userId)!.push(d);
  }

  return (
    <div className="overflow-x-auto mt-4">
      <table className="min-w-full text-sm border border-[var(--color-border)] rounded-lg overflow-hidden">
        <thead>
          <tr className="bg-[var(--color-bg-sidebar)] text-[var(--color-text-primary)]">
            <th className="px-3 py-2 text-left">Empleado</th>
            {DIAS_ES.map(d => (
              <th key={d} className="px-3 py-2 text-center">{d}</th>
            ))}
            <th className="px-3 py-2 text-center">Asist.</th>
            <th className="px-3 py-2 text-center">Tard.</th>
          </tr>
        </thead>
        <tbody>
          {Array.from(porUsuario.entries()).map(([userId, userDias], idx) => {
            // ordenar lun→dom
            const sorted = [...userDias].sort(
              (a, b) => new Date(a.fechaLaboral).getTime() - new Date(b.fechaLaboral).getTime()
            );
            const asistencias = sorted.filter(d => d.esLaboral && d.tieneEntradaManana).length;
            const tardanzas   = sorted.filter(d => d.esImpuntual).length;

            return (
              <tr
                key={userId}
                className={`${idx % 2 === 0 ? "bg-[var(--color-bg-main)]" : "bg-[var(--color-bg-card)]"} hover:bg-[var(--color-bg-sidebar-hover)]`}
              >
                <td className="px-3 py-2 text-[var(--color-text-secondary)] font-mono text-xs max-w-[120px] truncate">
                  {userId.slice(0, 8)}…
                </td>
                {sorted.map((dia) => {
                  let cell = "—";
                  let cellClass = "text-[var(--color-text-secondary)]";
                  if (!dia.esLaboral) { cell = "·"; }
                  else if (dia.ausente) { cell = "✗"; cellClass = "text-[var(--color-error)]"; }
                  else if (dia.jornadaCompleta) { cell = dia.esImpuntual ? "⚠" : "✓"; cellClass = dia.esImpuntual ? "text-[var(--color-warning)]" : "text-[var(--color-success)]"; }
                  else { cell = "▲"; cellClass = "text-[var(--color-warning)]"; }
                  return (
                    <td key={dia.fechaLaboral} className={`px-3 py-2 text-center ${cellClass}`}>{cell}</td>
                  );
                })}
                <td className="px-3 py-2 text-center text-[var(--color-success)]">{asistencias}</td>
                <td className="px-3 py-2 text-center text-[var(--color-warning)]">{tardanzas}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="text-xs text-[var(--color-text-secondary)] mt-2">
        ✓ Completa · ⚠ Tarde · ▲ Incompleta · ✗ Ausente · · No laboral
      </p>
    </div>
  );
}

export default function HistorialSemanal() {
  const [fecha, setFecha] = useState("");
  const [resumen, setResumen] = useState<ResumenSemanal | null | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verDetalle, setVerDetalle] = useState(false);

  // Pre-seleccionar la fecha de la última semana con datos al montar
  const { ultimaFechaSemana } = useAnioInicial();
  useEffect(() => {
    if (ultimaFechaSemana && !fecha) {
      setFecha(ultimaFechaSemana);
    }
  }, [ultimaFechaSemana]); // eslint-disable-line react-hooks/exhaustive-deps

  // Disparar consulta automática cuando se establece la fecha inicial
  useEffect(() => {
    if (ultimaFechaSemana && fecha === ultimaFechaSemana && resumen === undefined && !loading) {
      consultar();
    }
  }, [fecha]); // eslint-disable-line react-hooks/exhaustive-deps

  const consultar = useCallback(async () => {
    if (!fecha) return;
    setLoading(true);
    setError(null);
    setResumen(undefined);
    setVerDetalle(false);
    try {
      const url = `/api/historial/semana/por-fecha?fecha=${fecha}&detalle=true`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      const j = await res.json() as { data: ResumenSemanal | null };
      setResumen(j.data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [fecha]);

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") consultar();
  };

  return (
    <div className="space-y-6">
      {/* Selector */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-[var(--color-text-secondary)]">
            Selecciona cualquier día de la semana
          </label>
          <input
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            onKeyDown={handleKey}
            className="rounded border border-[var(--color-border)] bg-[var(--color-bg-main)] px-3 py-1.5 text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-amber)]"
          />
        </div>
        <button
          onClick={consultar}
          disabled={!fecha || loading}
          className="flex items-center gap-2 rounded bg-[var(--color-amber)] px-4 py-1.5 font-medium text-[var(--color-on-primary)] disabled:opacity-50"
        >
          <Search className="h-4 w-4" />
          Consultar
        </button>
      </div>

      {/* Estado */}
      {loading && <Cargando mensaje="Consultando semana…" />}
      {error   && <ErrorCarga mensaje={error} />}

      {/* Sin datos iniciales */}
      {!loading && !error && resumen === undefined && (
        <p className="text-sm text-[var(--color-text-secondary)]">
          Selecciona una fecha para consultar la semana correspondiente.
        </p>
      )}

      {/* Sin consolidado */}
      {!loading && !error && resumen === null && <SinConsolidado />}

      {/* Resultado */}
      {!loading && !error && resumen && (
        <div className="space-y-5">
          {/* Encabezado del período */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
                Semana del {formatFecha(resumen.inicioSemana)} al {formatFecha(resumen.finSemana)}
              </h2>
              <p className="text-xs text-[var(--color-text-secondary)]">
                Versión {resumen.version} · Cierre {resumen.weeklyClosureId.slice(0, 8)}…
              </p>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <BtnExportar
                url={`/api/historial/exportar/semana?weeklyPeriodId=${resumen.weeklyPeriodId}`}
                filename={`historial-semanal-${resumen.inicioSemana.toString().slice(0,10)}.xlsx`}
                label="Exportar Excel"
              />
              <button
                onClick={() => setVerDetalle(v => !v)}
                className="text-xs text-[var(--color-accent-text)] hover:underline"
              >
                {verDetalle ? "Ocultar detalle" : "Ver detalle por empleado"}
              </button>
            </div>
          </div>

          {/* Métricas */}
          <MetricasGrid m={resumen.metricas} />

          {/* Resumen visual de días */}
          {resumen.detalle && (
            <div>
              <h3 className="text-sm font-medium text-[var(--color-text-secondary)] mb-3">
                Vista por día (todos los empleados)
              </h3>
              <div className="grid grid-cols-7 gap-2">
                {/* Encabezados días */}
                {DIAS_ES.map(d => (
                  <p key={d} className="text-center text-xs font-medium text-[var(--color-text-secondary)]">
                    {d}
                  </p>
                ))}
                {/* Una fila de días (primer empleado como referencia visual de la semana) */}
                {Array.from({ length: 7 }, (_, i) => {
                  const dias = resumen.detalle!;
                  // Buscar un día que sea el lunes+i de la semana
                  const inicio = new Date(resumen.inicioSemana);
                  const target = new Date(Date.UTC(
                    inicio.getUTCFullYear(),
                    inicio.getUTCMonth(),
                    inicio.getUTCDate() + i
                  ));
                  const targetStr = target.toISOString().split("T")[0];
                  // Buscar cualquier fila de ese día
                  const dia = dias.find(d => d.fechaLaboral.startsWith(targetStr));
                  if (!dia) return (
                    <div key={i} className="rounded-lg border border-[var(--color-border)] p-3 text-xs text-center text-[var(--color-text-secondary)]">
                      {DIAS_ES[i]}<br />{target.getUTCDate()}
                    </div>
                  );
                  return <DiaBadge key={i} dia={dia} />;
                })}
              </div>
            </div>
          )}

          {/* Tabla de detalle por empleado */}
          {verDetalle && resumen.detalle && (
            <div>
              <h3 className="text-sm font-medium text-[var(--color-text-secondary)] mb-2">
                Detalle por empleado
              </h3>
              <TablaDetalle dias={resumen.detalle} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
