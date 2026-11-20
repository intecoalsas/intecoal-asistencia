
"use client";

import React, { useEffect, useState } from "react";
import ResumenDia from "./ResumenDia";

type RegistroDashboard = {
  id: string;
  name: string;
  fechaLaboral: string;
  entradaManana: string;
  salidaAlmuerzo: string;
  entradaAlmuerzo: string;
  salidaJornada: string;
  estado: "Completo" | "Incompleto";
};

type DashboardData = {
  registros: RegistroDashboard[];
  role: string;
};

type ActividadReciente = {
  empleado: string;
  id: string;
  hora: string;
  tipo: string;
  fecha: string;
};

export default function DashboardPage() {
  const [today, setToday] = useState("");

  // Fecha actual
  useEffect(() => {
    const timeout = setTimeout(() => {
      setToday(
        new Date().toLocaleDateString("es-CO", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
        })
      );
    }, 0);

    return () => clearTimeout(timeout);
  }, []);

  // Datos reales de la API
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    const fetchData = async () => {
      try {
        const res = await fetch("/api/marcaciones", {
          method: "GET",
          credentials: "include",
          signal: controller.signal,
        });

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const json = (await res.json()) as DashboardData;
        setData(json);
      } catch (err: unknown) {
        if (err instanceof Error && err.name !== "AbortError") {
          setError(err.message);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    void fetchData();

    return () => controller.abort();
  }, []);

  // Actividad reciente: últimas cinco marcaciones individuales.
  // Se ordenan por fecha laboral + hora; se excluyen fechas laborales
  // posteriores a hoy (Bogotá), que no pueden ser actividad reciente.
  const hoyBogota = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  const recent: ActividadReciente[] = data
    ? data.registros
      .filter((r) => (r.fechaLaboral || "") <= hoyBogota)
      .flatMap((r): ActividadReciente[] => {
        const entries: ActividadReciente[] = [];

        const empleado = r.name || "Empleado sin nombre";
        const id = r.id || "Sin identificación";
        const fecha = r.fechaLaboral || "";

        if (r.entradaManana) {
          entries.push({
            empleado,
            id,
            hora: r.entradaManana,
            tipo: "Entrada mañana",
            fecha,
          });
        }

        if (r.salidaAlmuerzo) {
          entries.push({
            empleado,
            id,
            hora: r.salidaAlmuerzo,
            tipo: "Salida almuerzo",
            fecha,
          });
        }

        if (r.entradaAlmuerzo) {
          entries.push({
            empleado,
            id,
            hora: r.entradaAlmuerzo,
            tipo: "Entrada almuerzo",
            fecha,
          });
        }

        if (r.salidaJornada) {
          entries.push({
            empleado,
            id,
            hora: r.salidaJornada,
            tipo: "Salida jornada",
            fecha,
          });
        }

        return entries;
      })
      .sort((a, b) => {
        const fechaHoraA = `${a.fecha}T${a.hora}`;
        const fechaHoraB = `${b.fecha}T${b.hora}`;

        return fechaHoraB.localeCompare(fechaHoraA);
      })
      .slice(0, 5)
    : [];

  return (
    <div className="p-6 space-y-8">
      {/* Encabezado */}
      <header className="space-y-1">
        <h1 className="text-3xl font-bold text-[var(--color-text-primary)]">
          Dashboard
        </h1>

        <p className="text-lg text-[var(--color-text-secondary)]">
          Resumen general de asistencia
        </p>

        <p className="text-sm text-[var(--color-text-secondary)]">
          {today}
        </p>

        {loading && <p>Cargando datos del dashboard…</p>}

        {error && <p className="text-[var(--color-error)]">Error: {error}</p>}

        {!loading && !error && (!data || data.registros.length === 0) && (
          <p>No hay marcaciones disponibles.</p>
        )}
      </header>

      {/* Indicadores operativos del día (F8) */}
      <ResumenDia />

      {/* Actividad reciente */}
      <section>
        <h2 className="text-xl font-semibold mb-4 text-[var(--color-text-primary)]">
          Actividad reciente
        </h2>

        {loading ? (
          <p>Cargando actividad…</p>
        ) : error ? (
          <p className="text-[var(--color-text-secondary)]">
            No se pudo cargar la actividad.
          </p>
        ) : recent.length === 0 ? (
          <p className="text-[var(--color-text-secondary)]">
            No hay marcaciones recientes.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded">
              <thead>
                <tr className="bg-[var(--color-bg-sidebar)] text-[var(--color-text-primary)]">
                  <th className="px-4 py-2 text-left">Empleado</th>
                  <th className="px-4 py-2 text-left">ID</th>
                  <th className="px-4 py-2 text-left">Fecha</th>
                  <th className="px-4 py-2 text-left">Hora</th>
                  <th className="px-4 py-2 text-left">Tipo</th>
                </tr>
              </thead>

              <tbody>
                {recent.map((r) => (
                  <tr
                    key={`${r.id}-${r.fecha}-${r.hora}-${r.tipo}`}
                    className="border-t border-[var(--color-border)]"
                  >
                    <td className="px-4 py-2 text-[var(--color-text-primary)]">
                      {r.empleado}
                    </td>

                    <td className="px-4 py-2 text-[var(--color-text-secondary)]">
                      {r.id}
                    </td>

                    <td className="px-4 py-2 text-[var(--color-text-secondary)]">
                      {r.fecha}
                    </td>

                    <td className="px-4 py-2 text-[var(--color-text-secondary)]">
                      {r.hora}
                    </td>

                    <td className="px-4 py-2 text-[var(--color-text-secondary)]">
                      {r.tipo}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
