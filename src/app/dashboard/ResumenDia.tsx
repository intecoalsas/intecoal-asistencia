// src/app/dashboard/ResumenDia.tsx
"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Users, CheckCircle, Clock, AlertTriangle, Inbox, CalendarOff, UserX, RefreshCcw } from "lucide-react";
import { formatMinutos } from "@/lib/utils";

interface Emp { userId: string; nombre: string; documento: string }
interface Resumen {
  fecha: string;
  festivo: string | null;
  debianAsistir: number;
  registraronAsistencia: number;
  sinMarca: Emp[];
  marcasPendientes: (Emp & { faltan: string[] })[];
  jornadasCompletas: number;
  conNovedad: (Emp & { tipo: string })[];
  tardanzas: (Emp & { tipo: string; minutos: number; horaProgramada: string })[];
  tardiasPendientes: number;
  tardiasPendientesHoy: number;
  incidenciasPorRevisar: number;
  incidenciasAutomaticas: number;
}

const MARCA: Record<string, string> = {
  ENTRADA_MANANA: "entrada mañana",
  SALIDA_ALMUERZO: "salida almuerzo",
  ENTRADA_ALMUERZO: "entrada almuerzo",
  SALIDA_JORNADA: "salida jornada",
};
const NOVEDAD: Record<string, string> = {
  VACACIONES: "Vacaciones", INCAPACIDAD: "Incapacidad", PERMISO: "Permiso", LICENCIA: "Licencia", OTRO: "Otro",
};
const ACTUALIZAR_MS = 60_000;

function Tarjeta({ icon: Icon, valor, etiqueta, detalle, href }: {
  icon: React.ComponentType<{ className?: string }>; valor: number; etiqueta: string; detalle?: string; href?: string;
}) {
  const contenido = (
    <div className="flex h-full items-center space-x-4 p-4 bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-lg">
      <Icon className="w-8 h-8 shrink-0 text-[var(--color-accent-text)]" />
      <div>
        <p className="text-2xl font-semibold text-[var(--color-text-primary)]">{valor}</p>
        <p className="text-sm text-[var(--color-text-secondary)]">{etiqueta}</p>
        {detalle && <p className="text-xs text-[var(--color-text-secondary)]">{detalle}</p>}
      </div>
    </div>
  );
  return href ? <Link href={href} className="block hover:opacity-90">{contenido}</Link> : contenido;
}

function Lista({ titulo, vacio, children }: { titulo: string; vacio: string; children: React.ReactNode[] }) {
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4">
      <h3 className="mb-2 font-medium text-[var(--color-text-primary)]">{titulo}</h3>
      {children.length === 0
        ? <p className="text-sm text-[var(--color-text-secondary)]">{vacio}</p>
        : <ul className="space-y-1 text-sm text-[var(--color-text-primary)]">{children}</ul>}
    </div>
  );
}

/** Indicadores operativos del día (solo lectura). */
export default function ResumenDia() {
  const [r, setR] = useState<Resumen | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  const consultar = useCallback(async () => {
    setCargando(true);
    try {
      const res = await fetch("/api/dashboard/resumen", { credentials: "include", cache: "no-store" });
      const j = (await res.json().catch(() => ({}))) as { data?: Resumen; error?: string };
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      setR(j.data ?? null);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void consultar();
    const id = setInterval(() => void consultar(), ACTUALIZAR_MS);
    return () => clearInterval(id);
  }, [consultar]);

  if (error && !r) return <p className="text-[var(--color-error)]">Error: {error}</p>;
  if (!r) return <p className="text-[var(--color-text-secondary)]">Cargando indicadores del día…</p>;

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-semibold text-[var(--color-text-primary)]">
          Hoy · {new Date(`${r.fecha}T12:00:00Z`).toLocaleDateString("es-CO", { timeZone: "America/Bogota", weekday: "long", day: "numeric", month: "long" })}
        </h2>
        <button onClick={() => void consultar()} disabled={cargando} className="flex items-center gap-1 text-sm text-[var(--color-accent-text)] hover:underline disabled:opacity-50">
          <RefreshCcw className={`h-4 w-4 ${cargando ? "animate-spin" : ""}`} /> Actualizar
        </button>
      </div>

      {r.festivo && (
        <p className="flex items-center gap-2 rounded border border-[var(--color-info-border)] bg-[var(--color-info-bg)] p-3 text-sm text-[var(--color-info)]">
          <CalendarOff className="h-4 w-4" /> Hoy es festivo: {r.festivo}. No se esperan marcaciones.
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Tarjeta icon={Users} valor={r.debianAsistir} etiqueta="Debían asistir hoy" detalle="Según horario, festivos y novedades" />
        <Tarjeta icon={CheckCircle} valor={r.registraronAsistencia} etiqueta="Ya registraron asistencia" detalle={`${r.jornadasCompletas} con las 4 marcas`} />
        <Tarjeta icon={UserX} valor={r.sinMarca.length} etiqueta="Sin ninguna marca todavía" detalle="La jornada puede estar en curso" />
        <Tarjeta icon={Clock} valor={r.marcasPendientes.length} etiqueta="Con marcas pendientes en el día" />
        <Tarjeta icon={AlertTriangle} valor={r.tardanzas.length} etiqueta="Tardanzas de hoy" />
        <Tarjeta icon={CalendarOff} valor={r.conNovedad.length} etiqueta="Con novedad autorizada hoy" detalle="No cuentan como ausencia" />
        <Tarjeta icon={Inbox} valor={r.tardiasPendientes} etiqueta="Tardías pendientes de decisión" detalle={`${r.tardiasPendientesHoy} de hoy · aún no son asistencia`} href="/historial" />
        <Tarjeta icon={AlertTriangle} valor={r.incidenciasPorRevisar} etiqueta="Incidencias por revisar" detalle={`${r.incidenciasAutomaticas} de la detección automática`} href="/incidencias" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Lista titulo="Tardanzas de hoy" vacio="Sin tardanzas registradas hoy.">
          {r.tardanzas.map((t) => (
            <li key={`${t.userId}-${t.tipo}`}>
              {t.nombre} · {MARCA[t.tipo]} · <span className="text-[var(--color-warning)]">+{formatMinutos(t.minutos)}</span>
              <span className="text-[var(--color-text-secondary)]"> (programada {t.horaProgramada})</span>
            </li>
          ))}
        </Lista>
        <Lista titulo="Sin ninguna marca todavía" vacio="Todos los que debían asistir ya marcaron.">
          {r.sinMarca.map((e) => <li key={e.userId}>{e.nombre} <span className="text-[var(--color-text-secondary)]">· {e.documento}</span></li>)}
        </Lista>
        <Lista titulo="Con marcas pendientes en el día" vacio="Nadie con marcas pendientes.">
          {r.marcasPendientes.map((e) => (
            <li key={e.userId}>{e.nombre} <span className="text-[var(--color-text-secondary)]">· falta: {e.faltan.map((f) => MARCA[f]).join(", ")}</span></li>
          ))}
        </Lista>
        <Lista titulo="Con novedad autorizada hoy" vacio="Nadie con novedad hoy.">
          {r.conNovedad.map((e) => <li key={e.userId}>{e.nombre} <span className="text-[var(--color-text-secondary)]">· {NOVEDAD[e.tipo] ?? e.tipo}</span></li>)}
        </Lista>
      </div>
      {error && <p className="text-xs text-[var(--color-error)]">No se pudo actualizar: {error}. Se muestran los últimos datos.</p>}
    </section>
  );
}
