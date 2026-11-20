// src/app/historial/components/HistorialEmpleado.tsx
"use client";

import React, { useState, useCallback, useEffect } from "react";
import { Search, ChevronDown, ChevronUp, User } from "lucide-react";
import { Cargando, ErrorCarga, SinConsolidado } from "./EstadoCarga";
import BtnExportar from "./BtnExportar";
import MetricasGrid from "./MetricasGrid";
import type { ResumenEmpleado } from "./types";
import { formatMinutos } from "@/lib/utils";
import { useAnioInicial } from "./useAnioInicial";

const MESES_ES = [
  "Enero","Febrero","Marzo","Abril","Mayo","Junio",
  "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre",
];

const currentYear = new Date().getFullYear();
const years = Array.from({ length: 8 }, (_, i) => currentYear - 4 + i);

interface EmpleadoBasic {
  id: string;
  nombre: string;
  apellido: string;
  documento: string;
  role: string;
  isActive: boolean;
}

interface ApiEmpleadoResponse {
  data: {
    usuario: {
      id: string;
      nombre: string;
      apellido: string;
      documento: string;
      isActive: boolean;
    };
    userId: string;
    semanas: ResumenEmpleado["semanas"];
    metricasGlobales: ResumenEmpleado["metricasGlobales"];
  };
}

function formatRango(inicio: string, fin: string) {
  const ini = new Date(inicio);
  const fn  = new Date(fin);
  return `${ini.getUTCDate()}/${ini.getUTCMonth()+1} – ${fn.getUTCDate()}/${fn.getUTCMonth()+1}`;
}

export default function HistorialEmpleado() {
  // Lista de empleados
  const [empleados, setEmpleados]       = useState<EmpleadoBasic[]>([]);
  const [empLoading, setEmpLoading]     = useState(true);
  const [empError, setEmpError]         = useState<string | null>(null);

  // Filtros
  const [search, setSearch]             = useState("");
  const [userId, setUserId]             = useState("");

  // Rango temporal
  const [modo, setModo]                 = useState<"todo" | "anio" | "mes">("todo");
  const [anio, setAnio]                 = useState(currentYear);
  const [mes, setMes]                   = useState(new Date().getMonth() + 1);

  // Resultado
  const [resumen, setResumen]           = useState<ApiEmpleadoResponse["data"] | undefined>(undefined);
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [semanaAbierta, setSemanaAbierta] = useState<string | null>(null);

  // Ajustar año inicial al más reciente con datos
  const { anio: anioInicial, ultimaFechaSemana, buscando } = useAnioInicial();
  useEffect(() => {
    if (!buscando && anioInicial !== currentYear) {
      setAnio(anioInicial);
      if (ultimaFechaSemana) {
        const mesDetectado = parseInt(ultimaFechaSemana.slice(5, 7), 10);
        setMes(mesDetectado);
      }
    }
  }, [buscando, anioInicial, ultimaFechaSemana]);

  // Cargar lista de empleados
  useEffect(() => {
    const ctrl = new AbortController();
    (async () => {
      try {
        const res = await fetch("/api/empleados", { credentials: "include", signal: ctrl.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const j = await res.json() as { employees: EmpleadoBasic[] };
        setEmpleados(j.employees.filter(e => e.role !== "KIOSCO"));
      } catch (e) {
        if ((e as Error).name !== "AbortError") setEmpError((e as Error).message);
      } finally {
        setEmpLoading(false);
      }
    })();
    return () => ctrl.abort();
  }, []);

  const empFiltrados = empleados.filter(e => {
    const q = search.toLowerCase();
    return (
      e.nombre.toLowerCase().includes(q) ||
      e.apellido.toLowerCase().includes(q) ||
      e.documento.toLowerCase().includes(q)
    );
  });

  const consultar = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    setResumen(undefined);
    setSemanaAbierta(null);

    let url = `/api/historial/empleado/${userId}`;
    if (modo === "anio") url += `?anio=${anio}`;
    else if (modo === "mes") url += `?anio=${anio}&mes=${mes}`;

    try {
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      const j = await res.json() as ApiEmpleadoResponse;
      setResumen(j.data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [userId, modo, anio, mes]);

  const empSeleccionado = empleados.find(e => e.id === userId);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[300px_1fr]">

        {/* Panel izquierdo: selección de empleado */}
        <aside className="space-y-3">
          <h2 className="text-sm font-semibold text-[var(--color-text-secondary)] uppercase tracking-wide">
            Seleccionar empleado
          </h2>

          {/* Búsqueda */}
          <div className="flex items-center gap-2 rounded border border-[var(--color-border)] bg-[var(--color-bg-main)] px-2">
            <Search className="h-4 w-4 text-[var(--color-text-secondary)]" />
            <input
              type="text"
              placeholder="Nombre o documento…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="flex-1 bg-transparent py-1.5 text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-secondary)] focus:outline-none"
            />
          </div>

          {/* Lista */}
          {empLoading && <Cargando mensaje="Cargando empleados…" />}
          {empError   && <ErrorCarga mensaje={empError} />}

          {!empLoading && !empError && (
            <ul className="max-h-80 overflow-y-auto space-y-1 rounded border border-[var(--color-border)]">
              {empFiltrados.length === 0 ? (
                <li className="px-3 py-2 text-xs text-[var(--color-text-secondary)]">Sin resultados</li>
              ) : empFiltrados.map(e => (
                <li key={e.id}>
                  <button
                    onClick={() => { setUserId(e.id); setResumen(undefined); setError(null); }}
                    className={`w-full text-left px-3 py-2 text-sm transition-colors
                      ${userId === e.id
                        ? "bg-[var(--color-amber)] text-[var(--color-on-primary)] font-semibold"
                        : "hover:bg-[var(--color-bg-sidebar-hover)] text-[var(--color-text-primary)]"
                      }`}
                  >
                    <span className="block font-medium">{e.nombre} {e.apellido}</span>
                    <span className="block text-xs opacity-70">{e.documento} · {e.role}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        {/* Panel derecho: filtros + resultado */}
        <div className="space-y-5">
          {/* Rango temporal + botón consultar */}
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-[var(--color-text-secondary)]">Período</label>
              <select
                value={modo}
                onChange={e => setModo(e.target.value as typeof modo)}
                className="rounded border border-[var(--color-border)] bg-[var(--color-bg-main)] px-3 py-1.5 text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-amber)]"
              >
                <option value="todo">Todo el historial</option>
                <option value="anio">Por año</option>
                <option value="mes">Por mes y año</option>
              </select>
            </div>

            {(modo === "anio" || modo === "mes") && (
              <div className="flex flex-col gap-1">
                <label className="text-xs text-[var(--color-text-secondary)]">Año</label>
                <select
                  value={anio}
                  onChange={e => setAnio(Number(e.target.value))}
                  className="rounded border border-[var(--color-border)] bg-[var(--color-bg-main)] px-3 py-1.5 text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-amber)]"
                >
                  {years.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            )}

            {modo === "mes" && (
              <div className="flex flex-col gap-1">
                <label className="text-xs text-[var(--color-text-secondary)]">Mes</label>
                <select
                  value={mes}
                  onChange={e => setMes(Number(e.target.value))}
                  className="rounded border border-[var(--color-border)] bg-[var(--color-bg-main)] px-3 py-1.5 text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-amber)]"
                >
                  {MESES_ES.map((m, i) => (
                    <option key={i+1} value={i+1}>{m}</option>
                  ))}
                </select>
              </div>
            )}

            <button
              onClick={consultar}
              disabled={!userId || loading}
              className="flex items-center gap-2 rounded bg-[var(--color-amber)] px-4 py-1.5 font-medium text-[var(--color-on-primary)] disabled:opacity-50"
            >
              <Search className="h-4 w-4" />
              Consultar
            </button>
          </div>

          {/* Sin empleado seleccionado */}
          {!userId && (
            <div className="flex flex-col items-center gap-3 py-16 text-[var(--color-text-secondary)]">
              <User className="h-10 w-10 opacity-30" />
              <p className="text-sm">Selecciona un empleado en el panel izquierdo.</p>
            </div>
          )}

          {/* Estados */}
          {userId && loading && <Cargando mensaje="Consultando historial del empleado…" />}
          {userId && error   && <ErrorCarga mensaje={error} />}

          {/* Empleado seleccionado, sin semanas */}
          {userId && !loading && !error && resumen && resumen.semanas.length === 0 && (
            <SinConsolidado texto="Este empleado no tiene semanas consolidadas en el período seleccionado." />
          )}

          {/* Resultado */}
          {userId && !loading && !error && resumen && resumen.semanas.length > 0 && (
            <div className="space-y-5">
              {/* Cabecera del empleado */}
              {empSeleccionado && (
                <div className="flex items-center gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] px-4 py-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--color-amber)] text-[var(--color-on-primary)] font-bold text-sm">
                    {empSeleccionado.nombre[0]}{empSeleccionado.apellido[0]}
                  </div>
                  <div>
                    <p className="font-semibold text-[var(--color-text-primary)]">
                      {empSeleccionado.nombre} {empSeleccionado.apellido}
                    </p>
                    <p className="text-xs text-[var(--color-text-secondary)]">
                      {empSeleccionado.documento} · {empSeleccionado.role}
                      {!empSeleccionado.isActive && (
                        <span className="ml-2 rounded bg-[var(--color-error-bg)] px-1.5 py-0.5 text-[var(--color-error)]">Inactivo</span>
                      )}
                    </p>
                  </div>
                </div>
              )}

              {/* Métricas globales */}
              <div>
                <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
                  <h3 className="text-sm font-medium text-[var(--color-text-secondary)]">
                    Resumen global del período
                  </h3>
                  <BtnExportar
                    url={`/api/historial/exportar/empleado?userId=${userId}${modo === "anio" ? `&anio=${anio}` : modo === "mes" ? `&anio=${anio}&mes=${mes}` : ""}`}
                    filename={`historial-empleado-${empSeleccionado ? `${empSeleccionado.nombre}-${empSeleccionado.apellido}` : userId}.xlsx`}
                    label="Exportar Excel"
                  />
                </div>
                <MetricasGrid m={resumen.metricasGlobales} />
              </div>

              {/* Semanas */}
              <div>
                <h3 className="text-sm font-medium text-[var(--color-text-secondary)] mb-3">
                  Detalle por semana ({resumen.semanas.length})
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
                          <span className="flex items-center gap-4 text-xs">
                            <span className="text-[var(--color-success)]">{s.metricas.asistencias} asist.</span>
                            <span className="text-[var(--color-error)]">{s.metricas.ausencias} aus.</span>
                            <span className="text-[var(--color-warning)]">{s.metricas.tardanzas} tard.</span>
                            {isOpen ? <ChevronUp className="h-4 w-4 text-[var(--color-text-secondary)]" /> : <ChevronDown className="h-4 w-4 text-[var(--color-text-secondary)]" />}
                          </span>
                        </button>

                        {isOpen && (
                          <div className="px-4 pb-4 space-y-3">
                            <MetricasGrid m={s.metricas} />
                            {/* Tabla de días */}
                            <div className="overflow-x-auto">
                              <table className="min-w-full text-xs border border-[var(--color-border)] rounded overflow-hidden">
                                <thead>
                                  <tr className="bg-[var(--color-bg-sidebar)] text-[var(--color-text-primary)]">
                                    <th className="px-3 py-2 text-left">Fecha</th>
                                    <th className="px-3 py-2 text-center">Laboral</th>
                                    <th className="px-3 py-2 text-center">Entrada</th>
                                    <th className="px-3 py-2 text-center">S. Almuerzo</th>
                                    <th className="px-3 py-2 text-center">E. Almuerzo</th>
                                    <th className="px-3 py-2 text-center">S. Jornada</th>
                                    <th className="px-3 py-2 text-center">Estado</th>
                                    <th className="px-3 py-2 text-center">Tardanza</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {s.dias
                                    .slice()
                                    .sort((a, b) => a.fechaLaboral.localeCompare(b.fechaLaboral))
                                    .map((d, i) => {
                                      const fecha = new Date(d.fechaLaboral);
                                      const fechaStr = `${fecha.getUTCDate()}/${fecha.getUTCMonth()+1}`;
                                      let estado = "—";
                                      let estadoClass = "text-[var(--color-text-secondary)]";
                                      if (d.esLaboral) {
                                        if (d.ausente)         { estado = "Ausente";    estadoClass = "text-[var(--color-error)]"; }
                                        else if (d.jornadaCompleta) { estado = d.esImpuntual ? "Completa/Tarde" : "Completa"; estadoClass = d.esImpuntual ? "text-[var(--color-warning)]" : "text-[var(--color-success)]"; }
                                        else                   { estado = "Incompleta"; estadoClass = "text-[var(--color-warning)]"; }
                                      }
                                      return (
                                        <tr
                                          key={d.fechaLaboral}
                                          className={`${i % 2 === 0 ? "bg-[var(--color-bg-main)]" : "bg-[var(--color-bg-card)]"}`}
                                        >
                                          <td className="px-3 py-1.5 text-[var(--color-text-primary)]">{fechaStr}</td>
                                          <td className="px-3 py-1.5 text-center">{d.esLaboral ? "✓" : "·"}</td>
                                          <td className="px-3 py-1.5 text-center">{d.tieneEntradaManana  ? "✓" : "—"}</td>
                                          <td className="px-3 py-1.5 text-center">{d.tieneSalidaAlmuerzo ? "✓" : "—"}</td>
                                          <td className="px-3 py-1.5 text-center">{d.tieneEntradaAlmuerzo? "✓" : "—"}</td>
                                          <td className="px-3 py-1.5 text-center">{d.tieneSalidaJornada  ? "✓" : "—"}</td>
                                          <td className={`px-3 py-1.5 text-center ${estadoClass}`}>{estado}</td>
                                          <td className="px-3 py-1.5 text-center text-[var(--color-warning)]">
                                            {d.tardanzaEntradaMin + d.tardanzaAlmuerzoMin > 0
                                              ? formatMinutos(d.tardanzaEntradaMin + d.tardanzaAlmuerzoMin)
                                              : "—"}
                                          </td>
                                        </tr>
                                      );
                                  })}
                                </tbody>
                              </table>
                            </div>
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
      </div>
    </div>
  );
}
