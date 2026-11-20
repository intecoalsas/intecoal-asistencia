// src/app/historial/components/HistorialMensual.tsx
"use client";

import React, { useState, useCallback, useEffect } from "react";
import { Search, ChevronDown, ChevronUp } from "lucide-react";
import { Cargando, ErrorCarga, SinConsolidado } from "./EstadoCarga";
import BtnExportar from "./BtnExportar";
import MetricasGrid from "./MetricasGrid";
import type { ResumenMensual } from "./types";
import { useAnioInicial } from "./useAnioInicial";

const MESES_ES = [
  "Enero","Febrero","Marzo","Abril","Mayo","Junio",
  "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre",
];

function formatRango(inicio: string, fin: string) {
  const ini = new Date(inicio);
  const fn  = new Date(fin);
  return `${ini.getUTCDate()}/${ini.getUTCMonth()+1} – ${fn.getUTCDate()}/${fn.getUTCMonth()+1}`;
}

const currentYear = new Date().getFullYear();
const years = Array.from({ length: 6 }, (_, i) => currentYear - 2 + i);

export default function HistorialMensual() {
  const [anio, setAnio] = useState(currentYear);
  const [mes, setMes] = useState(new Date().getMonth() + 1);
  const [resumen, setResumen] = useState<ResumenMensual | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [semanaAbierta, setSemanaAbierta] = useState<string | null>(null);

  // Ajustar año/mes al último período con datos al montar
  const { anio: anioInicial, ultimaFechaSemana, buscando } = useAnioInicial();
  useEffect(() => {
    if (!buscando && anioInicial !== currentYear) {
      setAnio(anioInicial);
      // Derivar mes del inicioSemana de la última semana con datos
      if (ultimaFechaSemana) {
        const mesDetectado = parseInt(ultimaFechaSemana.slice(5, 7), 10);
        setMes(mesDetectado);
      }
    }
  }, [buscando, anioInicial, ultimaFechaSemana]);

  const consultar = useCallback(async () => {
    setLoading(true);
    setError(null);
    setResumen(undefined);
    setSemanaAbierta(null);
    try {
      const res = await fetch(`/api/historial/mes?anio=${anio}&mes=${mes}`, {
        credentials: "include",
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      const j = await res.json() as { data: ResumenMensual };
      setResumen(j.data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [anio, mes]);

  const sinDatos = resumen && resumen.semanas.length === 0;

  return (
    <div className="space-y-6">
      {/* Selector */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-[var(--color-text-secondary)]">Año</label>
          <select
            value={anio}
            onChange={e => setAnio(Number(e.target.value))}
            className="rounded border border-[var(--color-border)] bg-[var(--color-bg-main)] px-3 py-1.5 text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-amber)]"
          >
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-[var(--color-text-secondary)]">Mes</label>
          <select
            value={mes}
            onChange={e => setMes(Number(e.target.value))}
            className="rounded border border-[var(--color-border)] bg-[var(--color-bg-main)] px-3 py-1.5 text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-amber)]"
          >
            {MESES_ES.map((m, i) => (
              <option key={i+1} value={i+1}>{m}</option>
            ))}
          </select>
        </div>
        <button
          onClick={consultar}
          disabled={loading}
          className="flex items-center gap-2 rounded bg-[var(--color-amber)] px-4 py-1.5 font-medium text-[var(--color-on-primary)] disabled:opacity-50"
        >
          <Search className="h-4 w-4" />
          Consultar
        </button>
      </div>

      {loading && <Cargando mensaje="Consultando mes…" />}
      {error   && <ErrorCarga mensaje={error} />}

      {!loading && !error && resumen === undefined && (
        <p className="text-sm text-[var(--color-text-secondary)]">
          Selecciona un mes y pulsa Consultar.
        </p>
      )}

      {!loading && !error && sinDatos && (
        <SinConsolidado texto={`${MESES_ES[mes-1]} ${anio} no tiene semanas consolidadas.`} />
      )}

      {!loading && !error && resumen && !sinDatos && (
        <div className="space-y-5">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
              {MESES_ES[resumen.mes - 1]} {resumen.anio}
            </h2>
            <BtnExportar
              url={`/api/historial/exportar/mes?anio=${resumen.anio}&mes=${resumen.mes}`}
              filename={`historial-mensual-${resumen.anio}${String(resumen.mes).padStart(2,"0")}.xlsx`}
            />
          </div>

          {/* Métricas globales del mes */}
          <MetricasGrid m={resumen.metricas} />

          {/* Semanas del mes */}
          <div>
            <h3 className="text-sm font-medium text-[var(--color-text-secondary)] mb-3">
              Semanas incluidas
            </h3>
            <div className="space-y-2">
              {resumen.semanas.map(s => {
                const isOpen = semanaAbierta === s.weeklyPeriodId;
                return (
                  <div
                    key={s.weeklyPeriodId}
                    className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] overflow-hidden"
                  >
                    <button
                      onClick={() => setSemanaAbierta(isOpen ? null : s.weeklyPeriodId)}
                      className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-[var(--color-bg-sidebar-hover)] transition-colors"
                    >
                      <span className="text-sm font-medium text-[var(--color-text-primary)]">
                        {formatRango(s.inicioSemana, s.finSemana)}
                        <span className="ml-2 text-xs text-[var(--color-text-secondary)]">v{s.version}</span>
                      </span>
                      <span className="flex items-center gap-4 text-xs text-[var(--color-text-secondary)]">
                        <span className="text-[var(--color-success)]">{s.metricas.asistencias} asist.</span>
                        <span className="text-[var(--color-error)]">{s.metricas.ausencias} aus.</span>
                        <span className="text-[var(--color-warning)]">{s.metricas.tardanzas} tard.</span>
                        {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </span>
                    </button>

                    {isOpen && (
                      <div className="px-4 pb-4">
                        <MetricasGrid m={s.metricas} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
