// src/app/calendario/page.tsx
"use client";

import React, { useState } from "react";
import { CalendarCheck } from "lucide-react";
import { useAuth } from "@/app/_components/AuthProvider";
import GestionFestivos from "./components/GestionFestivos";
import GestionNovedades from "./components/GestionNovedades";

type Tab = "novedades" | "festivos";

export default function CalendarioPage() {
  const { user, loading: authLoading } = useAuth();
  const esAdmin = user?.role === "ADMIN";
  const [tab, setTab] = useState<Tab>("novedades");

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <p className="text-[var(--color-text-secondary)]">Verificando sesión…</p>
      </div>
    );
  }

  if (user?.role !== "ADMIN" && user?.role !== "SUPERVISOR") {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <p className="text-[var(--color-error)]">No tienes permiso para acceder a esta sección.</p>
      </div>
    );
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "novedades", label: "Novedades" },
    ...(esAdmin ? [{ id: "festivos" as Tab, label: "Festivos" }] : []),
  ];

  return (
    <div className="space-y-6 p-6">
      <header className="space-y-1">
        <div className="flex items-center gap-3">
          <CalendarCheck className="h-7 w-7 text-[var(--color-accent-text)]" />
          <h1 className="text-3xl font-bold text-[var(--color-text-primary)]">Calendario laboral</h1>
        </div>
        <p className="text-[var(--color-text-secondary)]">
          Novedades justificadas de los empleados y días no laborables de la empresa.
        </p>
      </header>

      <nav className="flex gap-1 border-b border-[var(--color-border)]">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium transition-colors rounded-t ${
              tab === t.id
                ? "bg-[var(--color-bg-card)] text-[var(--color-accent-text)] border-b-2 border-[var(--color-amber)]"
                : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div>
        {tab === "novedades" && <GestionNovedades esAdmin={esAdmin} />}
        {tab === "festivos" && esAdmin && <GestionFestivos />}
      </div>
    </div>
  );
}
