// src/app/historial/components/MetricasGrid.tsx
"use client";

import React from "react";
import {
  Users,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  CalendarCheck,
  CalendarX,
  AlertCircle,
  CheckSquare,
} from "lucide-react";
import type { MetricasConsolidado } from "./types";

interface CardProps {
  icon: React.ReactNode;
  valor: number;
  label: string;
  color?: string;
}

function Card({ icon, valor, label, color = "text-[var(--color-accent-text)]" }: CardProps) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4">
      <div className={color}>{icon}</div>
      <div>
        <p className="text-2xl font-semibold text-[var(--color-text-primary)]">{valor}</p>
        <p className="text-xs text-[var(--color-text-secondary)]">{label}</p>
      </div>
    </div>
  );
}

export default function MetricasGrid({ m }: { m: MetricasConsolidado }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
      <Card icon={<Users className="h-6 w-6" />}        valor={m.totalEmpleados}      label="Empleados"            />
      <Card icon={<CalendarCheck className="h-6 w-6" />} valor={m.diasLaborales}       label="Días laborales"       color="text-[var(--color-info)]" />
      <Card icon={<CheckCircle className="h-6 w-6" />}   valor={m.asistencias}         label="Asistencias"          color="text-[var(--color-success)]" />
      <Card icon={<XCircle className="h-6 w-6" />}       valor={m.ausencias}           label="Ausencias"            color="text-[var(--color-error)]" />
      <Card icon={<CheckSquare className="h-6 w-6" />}   valor={m.jornadasCompletas}   label="Jornadas completas"   color="text-[var(--color-success)]" />
      <Card icon={<CalendarX className="h-6 w-6" />}     valor={m.jornadasIncompletas} label="Jornadas incompletas" color="text-[var(--color-warning)]" />
      <Card icon={<Clock className="h-6 w-6" />}         valor={m.tardanzas}           label="Tardanzas"            color="text-[var(--color-warning)]" />
      <Card icon={<AlertTriangle className="h-6 w-6" />} valor={m.incidenciasPendientes} label="Incidencias pendientes" color="text-[var(--color-warning)]" />
      <Card icon={<AlertCircle className="h-6 w-6" />}   valor={m.incidenciasResueltas}  label="Incidencias resueltas"  color="text-[var(--color-success)]" />
    </div>
  );
}
