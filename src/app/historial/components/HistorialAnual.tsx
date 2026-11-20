// src/app/historial/components/HistorialAnual.tsx
"use client";

import React, { useState, useCallback, useEffect } from "react";
import { Search, ChevronDown, ChevronUp } from "lucide-react";
import { Cargando, ErrorCarga } from "./EstadoCarga";
import BtnExportar from "./BtnExportar";
import MetricasGrid from "./MetricasGrid";
import type { ResumenAnual, ResumenMensual } from "./types";
import { useAnioInicial } from "./useAnioInicial";

const MESES_ES = [
  "Enero","Febrero","Marzo","Abril","Mayo","Junio",
  "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre",
];

const currentYear = new Date().getFullYear();
const years = Array.from({ length: 8 }, (_, i) => currentYear - 4 + i);

function MesCard({ mes, abierto, onToggle }: {
  mes: ResumenMensual;
  abierto: boolean;
  onToggle: () => void;
}) {
  const tieneDatos = mes.semanas.length > 0;
  const m = mes.metricas;

  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-[var(--color-bg-sidebar-hover)] transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-[var(--color-text-primary)] w-24">
            {MESES_ES[mes.mes - 1]}
          </span>
          {tieneDatos ? (
            <span className="flex gap-3 text-xs">
              <span className="text-[var(--color-success)]">{m.asistencias} asist.</span>
              <span className="text-[var(--color-error)]">{m.ausencias} aus.</span>
              <span className="text-[var(--color-warning)]">{m.tardanzas} tard.</span>
              <span className="text-[var(--color-text-secondary)]">{m.totalEmpleados} emp.</span>
            </span>
          ) : (
            <span className="text-xs text-[var(--color-text-secondary)] italic">Sin datos</span>
          )}
        </div>
        {tieneDatos && (
          abierto
            ? <ChevronUp className="h-4 w-4 text-[var(--color-text-secondary)]" />
            : <ChevronDown className="h-4 w-4 text-[var(--color-text-secondary)]" />
        )}
      </button>

      {abierto && tieneDatos && (
        <div className="px-4 pb-4 space-y-4">
          <MetricasGrid m={m} />
          <div>
            <p className="text-xs font-medium text-[var(--color-text-secondary)] mb-2">
              Semanas ({mes.semanas.length})
            </p>
            <div className="grid grid-cols-1 gap-1 sm:grid-cols-2 xl:grid-cols-4">
              {mes.semanas.map(s => {
                const ini = new Date(s.inicioSemana);
                const fin = new Date(s.finSemana);
                return (
                  <div
                    key={s.weeklyPeriodId}
                    className="rounded border border-[var(--color-border)] bg-[var(--color-bg-main)] px-3 py-2 text-xs"
                  >
                    <p className="font-medium text-[var(--color-text-primary)]">
                      {ini.getUTCDate()}/{ini.getUTCMonth()+1} – {fin.getUTCDate()}/{fin.getUTCMonth()+1}
                    </p>
                    <p className="text-[var(--color-text-secondary)] mt-0.5">
                      v{s.version} · {s.metricas.asistencias} asist. · {s.metricas.ausencias} aus.
                    </p>
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

export default function HistorialAnual() {
  const [anio, setAnio] = useState(currentYear);
  const [resumen, setResumen] = useState<ResumenAnual | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mesAbierto, setMesAbierto] = useState<number | null>(null);

  // Ajustar año inicial al más reciente con datos
  const { anio: anioInicial, buscando } = useAnioInicial();
  useEffect(() => {
    if (!buscando && anioInicial !== currentYear) {
      setAnio(anioInicial);
    }
  }, [buscando, anioInicial]);

  const consultar = useCallback(async () => {
    setLoading(true);
    setError(null);
    setResumen(undefined);
    setMesAbierto(null);
    try {
      const res = await fetch(`/api/historial/anio?anio=${anio}`, {
        credentials: "include",
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      const j = await res.json() as { data: ResumenAnual };
      setResumen(j.data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [anio]);

  // Métricas globales anuales (suma de todos los meses)
  const metricasAnuales = resumen
    ? resumen.meses.reduce(
        (acc, m) => ({
          totalEmpleados: Math.max(acc.totalEmpleados, m.metricas.totalEmpleados),
          diasLaborales:  acc.diasLaborales  + m.metricas.diasLaborales,
          asistencias:    acc.asistencias    + m.metricas.asistencias,
          ausencias:      acc.ausencias      + m.metricas.ausencias,
          jornadasCompletas:   acc.jornadasCompletas   + m.metricas.jornadasCompletas,
          jornadasIncompletas: acc.jornadasIncompletas + m.metricas.jornadasIncompletas,
          tardanzas:      acc.tardanzas      + m.metricas.tardanzas,
          minutosTardanzaEntrada:  acc.minutosTardanzaEntrada  + m.metricas.minutosTardanzaEntrada,
          minutosTardanzaAlmuerzo: acc.minutosTardanzaAlmuerzo + m.metricas.minutosTardanzaAlmuerzo,
          incidenciasPendientes:  acc.incidenciasPendientes  + m.metricas.incidenciasPendientes,
          incidenciasResueltas:   acc.incidenciasResueltas   + m.metricas.incidenciasResueltas,
        }),
        {
          totalEmpleados: 0, diasLaborales: 0, asistencias: 0, ausencias: 0,
          jornadasCompletas: 0, jornadasIncompletas: 0, tardanzas: 0,
          minutosTardanzaEntrada: 0, minutosTardanzaAlmuerzo: 0,
          incidenciasPendientes: 0, incidenciasResueltas: 0,
        }
      )
    : null;

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
        <button
          onClick={consultar}
          disabled={loading}
          className="flex items-center gap-2 rounded bg-[var(--color-amber)] px-4 py-1.5 font-medium text-[var(--color-on-primary)] disabled:opacity-50"
        >
          <Search className="h-4 w-4" />
          Consultar
        </button>
      </div>

      {loading && <Cargando mensaje="Consultando año…" />}
      {error   && <ErrorCarga mensaje={error} />}

      {!loading && !error && resumen === undefined && (
        <p className="text-sm text-[var(--color-text-secondary)]">
          Selecciona un año y pulsa Consultar.
        </p>
      )}

      {!loading && !error && resumen && metricasAnuales && (
        <div className="space-y-5">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
              Resumen {resumen.anio}
            </h2>
            <BtnExportar
              url={`/api/historial/exportar/anio?anio=${resumen.anio}`}
              filename={`historial-anual-${resumen.anio}.xlsx`}
            />
          </div>

          {/* Métricas anuales acumuladas */}
          <MetricasGrid m={metricasAnuales} />

          {/* Lista de meses */}
          <div>
            <h3 className="text-sm font-medium text-[var(--color-text-secondary)] mb-3">
              Por mes
            </h3>
            <div className="space-y-2">
              {resumen.meses.map(m => (
                <MesCard
                  key={m.mes}
                  mes={m}
                  abierto={mesAbierto === m.mes}
                  onToggle={() => setMesAbierto(mesAbierto === m.mes ? null : m.mes)}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
