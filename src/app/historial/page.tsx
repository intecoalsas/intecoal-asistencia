// src/app/historial/page.tsx
"use client";

import React, { useState, useCallback } from "react";
import { History } from "lucide-react";
import { useAuth } from "@/app/_components/AuthProvider";
import HistorialSemanal from "./components/HistorialSemanal";
import HistorialMensual from "./components/HistorialMensual";
import HistorialAnual from "./components/HistorialAnual";
import HistorialEmpleado from "./components/HistorialEmpleado";
import GestionCierres from "./components/GestionCierres";
import BandejaMarcacionesTardias from "./components/BandejaMarcacionesTardias";

type Tab = "semanal" | "mensual" | "anual" | "empleado" | "cierres" | "tardias";

const TABS: { id: Tab; label: string; soloAdmin?: boolean }[] = [
  { id: "semanal",  label: "Semanal"   },
  { id: "mensual",  label: "Mensual"   },
  { id: "anual",    label: "Anual"     },
  { id: "empleado", label: "Empleado"  },
  { id: "cierres",  label: "Cierres"   },
  { id: "tardias",  label: "Marcaciones tardías", soloAdmin: true },
];

export default function HistorialPage() {
  const { user, loading: authLoading } = useAuth();
  const [tab, setTab] = useState<Tab>("semanal");

  const isAllowed = !authLoading && (user?.role === "ADMIN" || user?.role === "SUPERVISOR");

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <p className="text-[var(--color-text-secondary)]">Verificando sesión…</p>
      </div>
    );
  }

  if (!isAllowed) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <p className="text-[var(--color-error)]">No tienes permiso para acceder a esta sección.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Encabezado */}
      <header className="space-y-1">
        <div className="flex items-center gap-3">
          <History className="h-7 w-7 text-[var(--color-accent-text)]" />
          <h1 className="text-3xl font-bold text-[var(--color-text-primary)]">
            Historial
          </h1>
        </div>
        <p className="text-[var(--color-text-secondary)]">
          Consulta consolidada de asistencia por semana, mes, año y empleado.
        </p>
      </header>

      {/* Tabs */}
      <nav className="flex gap-1 border-b border-[var(--color-border)]">
        {TABS.filter((t) => !t.soloAdmin || user?.role === "ADMIN").map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium transition-colors rounded-t
              ${tab === t.id
                ? "bg-[var(--color-bg-card)] text-[var(--color-accent-text)] border-b-2 border-[var(--color-amber)]"
                : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
              }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {/* Contenido del tab activo */}
      <div>
        {tab === "semanal"  && <HistorialSemanal  />}
        {tab === "mensual"  && <HistorialMensual  />}
        {tab === "anual"    && <HistorialAnual    />}
        {tab === "empleado" && <HistorialEmpleado />}
        {tab === "cierres"  && <GestionCierres    />}
        {tab === "tardias"  && user?.role === "ADMIN" && <BandejaMarcacionesTardias />}
      </div>
    </div>
  );
}
