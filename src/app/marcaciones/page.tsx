
"use client";

import React, { useEffect, useState } from "react";
import { formatMinutos } from "@/lib/utils";
import { useAuth } from "@/app/_components/AuthProvider";
import MisMarcacionesTardias from "./MisMarcacionesTardias";
import CorreccionMarcacion from "./CorreccionMarcacion";
import {
  User,
  Search,
  CheckCircle,
  XCircle,
  RefreshCcw,
  Clock,
  AlertTriangle,
} from "lucide-react";

type EvaluacionPuntualidad = {
  estado: "Puntual" | "Tarde" | "Sin registro" | "Sin horario";
  horaProgramada: string | null;
  minutosRetraso: number;
};

type Registro = {
  id: string;
  name: string;
  fechaLaboral: string;
  entradaManana: string;
  salidaAlmuerzo: string;
  entradaAlmuerzo: string;
  salidaJornada: string;
  estado: "Completo" | "Incompleto";
  puntualidadEntradaManana: EvaluacionPuntualidad;
  puntualidadEntradaAlmuerzo: EvaluacionPuntualidad;
  esImpuntual: boolean;
  marcas?: Record<string, { id: string; version: number; corregida: boolean }>;
};

type MarcacionesResponse = {
  registros: Registro[];
  role: "ADMIN" | "EMPLEADO" | "SUPERVISOR";
};

const Avatar = ({ name }: { name: string }) => {
  const initials = name
    .trim()
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--color-amber)] text-sm font-medium text-[var(--color-on-primary)]">
      {initials || "?"}
    </div>
  );
};

function PuntualidadBadge({
  evaluacion,
}: {
  evaluacion: EvaluacionPuntualidad;
}) {
  if (evaluacion.estado === "Tarde") {
    return (
      <span className="inline-flex items-center gap-1 rounded bg-[var(--color-error)] px-2 py-1 text-xs text-white">
        <AlertTriangle className="h-3 w-3" />
        Tarde: {formatMinutos(evaluacion.minutosRetraso)}
      </span>
    );
  }

  if (evaluacion.estado === "Puntual") {
    return (
      <span className="inline-flex items-center gap-1 rounded bg-[var(--color-success)] px-2 py-1 text-xs text-white">
        <CheckCircle className="h-3 w-3" />
        Puntual
      </span>
    );
  }

  if (evaluacion.estado === "Sin horario") {
    return (
      <span className="rounded bg-gray-600 px-2 py-1 text-xs text-white">
        Sin horario
      </span>
    );
  }

  return (
    <span className="rounded bg-[var(--color-warning)] px-2 py-1 text-xs text-white">
      Sin registro
    </span>
  );
}

function DetallePuntualidad({
  evaluacion,
}: {
  evaluacion: EvaluacionPuntualidad;
}) {
  return (
    <div className="space-y-1">
      <PuntualidadBadge evaluacion={evaluacion} />

      {evaluacion.horaProgramada && (
        <p className="text-xs text-[var(--color-text-secondary)]">
          Programada: {evaluacion.horaProgramada}
        </p>
      )}
    </div>
  );
}

export default function MarcacionesPage() {
  const { user } = useAuth();
  const puedeVerHistorial = user?.role === "ADMIN" || user?.role === "SUPERVISOR";
  const [recarga, setRecarga] = useState(0);
  const [seleccion, setSeleccion] = useState<Registro | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [today, setToday] = useState("");
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("todos");
  const [date, setDate] = useState("");

  useEffect(() => {
    const timeout = setTimeout(() => {
      setToday(
        new Date().toLocaleDateString("es-CO", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
          timeZone: "America/Bogota",
        })
      );
    }, 0);

    return () => clearTimeout(timeout);
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    const fetchMarcaciones = async () => {
      try {
        setLoading(true);
        setFetchError(null);

        const res = await fetch("/api/marcaciones", {
          method: "GET",
          credentials: "include",
          signal: controller.signal,
        });

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const data =
          (await res.json()) as MarcacionesResponse;

        setRegistros(data.registros ?? []);
      } catch (error: unknown) {
        if (
          error instanceof Error &&
          error.name !== "AbortError"
        ) {
          console.error(
            "Error al cargar marcaciones:",
            error
          );
          setFetchError(error.message);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    void fetchMarcaciones();

    return () => controller.abort();
  }, [recarga]);

  const filtered = registros.filter((r) => {
    const searchText = search.toLowerCase();

    const matchesSearch =
      r.name.toLowerCase().includes(searchText) ||
      r.id.toLowerCase().includes(searchText);

    const matchesFilter =
      filter === "todos" ||
      (filter === "completo" &&
        r.estado === "Completo") ||
      (filter === "incompleto" &&
        r.estado === "Incompleto") ||
      (filter === "impuntual" && r.esImpuntual) ||
      (filter === "puntual" &&
        !r.esImpuntual &&
        r.puntualidadEntradaManana.estado === "Puntual" &&
        r.puntualidadEntradaAlmuerzo.estado !== "Tarde");

    const matchesDate =
      !date || r.fechaLaboral === date;

    return matchesSearch && matchesFilter && matchesDate;
  });

  const totalJornadas = registros.length;

  const totalCompletas = registros.filter(
    (r) => r.estado === "Completo"
  ).length;

  const totalIncompletas = registros.filter(
    (r) => r.estado === "Incompleto"
  ).length;

  const totalImpuntuales = registros.filter(
    (r) => r.esImpuntual
  ).length;

  const totalPuntuales = registros.filter(
    (r) =>
      r.puntualidadEntradaManana.estado === "Puntual" &&
      r.puntualidadEntradaAlmuerzo.estado !== "Tarde"
  ).length;

  return (
    <div className="space-y-8 p-6">
      <header className="space-y-1">
        <h1 className="text-3xl font-bold text-[var(--color-text-primary)]">
          Marcaciones
        </h1>

        <p className="text-lg text-[var(--color-text-secondary)]">
          Consulta y seguimiento de registros de asistencia
        </p>

        <p className="text-sm text-[var(--color-text-secondary)]">
          {today}
        </p>
      </header>

      {/* Métricas */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <div className="flex items-center space-x-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4">
          <User className="h-6 w-6 text-[var(--color-accent-text)]" />
          <div>
            <p className="text-2xl font-semibold text-[var(--color-text-primary)]">
              {totalJornadas}
            </p>
            <p className="text-sm text-[var(--color-text-secondary)]">
              Jornadas registradas
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4">
          <CheckCircle className="h-6 w-6 text-[var(--color-success)]" />
          <div>
            <p className="text-2xl font-semibold text-[var(--color-text-primary)]">
              {totalCompletas}
            </p>
            <p className="text-sm text-[var(--color-text-secondary)]">
              Jornadas completas
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4">
          <XCircle className="h-6 w-6 text-[var(--color-error)]" />
          <div>
            <p className="text-2xl font-semibold text-[var(--color-text-primary)]">
              {totalIncompletas}
            </p>
            <p className="text-sm text-[var(--color-text-secondary)]">
              Jornadas incompletas
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4">
          <AlertTriangle className="h-6 w-6 text-[var(--color-error)]" />
          <div>
            <p className="text-2xl font-semibold text-[var(--color-text-primary)]">
              {totalImpuntuales}
            </p>
            <p className="text-sm text-[var(--color-text-secondary)]">
              Jornadas con retraso
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4">
          <Clock className="h-6 w-6 text-[var(--color-success)]" />
          <div>
            <p className="text-2xl font-semibold text-[var(--color-text-primary)]">
              {totalPuntuales}
            </p>
            <p className="text-sm text-[var(--color-text-secondary)]">
              Jornadas puntuales
            </p>
          </div>
        </div>
      </section>

      {/* Filtros */}
      <section className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="rounded border border-[var(--color-border)] bg-[var(--color-bg-main)] px-2 py-1 text-[var(--color-text-primary)] focus:outline-none"
        />

        <div className="flex w-full items-center space-x-2 sm:w-auto">
          <Search className="h-5 w-5 text-[var(--color-text-secondary)]" />
          <input
            type="text"
            placeholder="Buscar por nombre o ID"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 rounded border border-[var(--color-border)] bg-[var(--color-bg-main)] px-2 py-1 text-[var(--color-text-primary)] placeholder-[var(--color-text-secondary)] focus:outline-none"
          />
        </div>

        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="rounded border border-[var(--color-border)] bg-[var(--color-bg-main)] px-2 py-1 text-[var(--color-text-primary)] focus:outline-none"
        >
          <option value="todos">Todas las jornadas</option>
          <option value="completo">Completo</option>
          <option value="incompleto">Incompleto</option>
          <option value="impuntual">Con retraso</option>
          <option value="puntual">Puntual</option>
        </select>

        <button
          onClick={() => {
            setSearch("");
            setFilter("todos");
            setDate("");
          }}
          className="flex items-center gap-1 rounded bg-[var(--color-amber)] px-3 py-1 text-[var(--color-on-primary)]"
        >
          <RefreshCcw className="h-4 w-4" />
          Limpiar
        </button>
      </section>

      {/* Tabla */}
      <section className="overflow-x-auto">
        {loading ? (
          <p className="p-4 text-[var(--color-text-secondary)]">
            Cargando marcaciones…
          </p>
        ) : fetchError ? (
          <p className="p-4 text-[var(--color-error)]">
            No se pudieron cargar las marcaciones: {fetchError}
          </p>
        ) : filtered.length === 0 ? (
          <p className="p-4 text-[var(--color-text-secondary)]">
            No hay marcaciones que coincidan con los filtros seleccionados.
          </p>
        ) : (
          <table className="min-w-full rounded border border-[var(--color-border)] bg-[var(--color-bg-card)]">
            <thead>
              <tr className="bg-[var(--color-bg-sidebar)] text-[var(--color-text-primary)]">
                <th className="px-4 py-2 text-left">Empleado</th>
                <th className="px-4 py-2 text-left">Identificación</th>
                <th className="px-4 py-2 text-left">Fecha</th>
                <th className="px-4 py-2 text-left">Entrada mañana</th>
                <th className="px-4 py-2 text-left">Puntualidad mañana</th>
                <th className="px-4 py-2 text-left">Salida almuerzo</th>
                <th className="px-4 py-2 text-left">Entrada almuerzo</th>
                <th className="px-4 py-2 text-left">Puntualidad almuerzo</th>
                <th className="px-4 py-2 text-left">Salida jornada</th>
                <th className="px-4 py-2 text-left">Estado</th>
                {puedeVerHistorial && <th className="px-4 py-2 text-left">Acciones</th>}
              </tr>
            </thead>

            <tbody>
              {filtered.map((r, idx) => (
                <tr
                  key={`${r.id}-${r.fechaLaboral}`}
                  className={`${idx % 2 === 0
                    ? "bg-[var(--color-bg-main)]"
                    : "bg-[var(--color-bg-card)]"
                    } transition-colors hover:bg-[var(--color-bg-sidebar-hover)]`}
                >
                  <td className="px-4 py-2 text-[var(--color-text-primary)]">
                    <div className="flex items-center space-x-2">
                      <Avatar name={r.name} />
                      <span>{r.name}</span>
                    </div>
                  </td>

                  <td className="px-4 py-2 text-[var(--color-text-secondary)]">
                    {r.id}
                  </td>

                  <td className="px-4 py-2 text-[var(--color-text-secondary)]">
                    {r.fechaLaboral}
                  </td>

                  <td className="px-4 py-2 text-[var(--color-text-secondary)]">
                    {r.entradaManana || "—"}
                  </td>

                  <td className="px-4 py-2">
                    <DetallePuntualidad
                      evaluacion={r.puntualidadEntradaManana}
                    />
                  </td>

                  <td className="px-4 py-2 text-[var(--color-text-secondary)]">
                    {r.salidaAlmuerzo || "—"}
                  </td>

                  <td className="px-4 py-2 text-[var(--color-text-secondary)]">
                    {r.entradaAlmuerzo || "—"}
                  </td>

                  <td className="px-4 py-2">
                    <DetallePuntualidad
                      evaluacion={r.puntualidadEntradaAlmuerzo}
                    />
                  </td>

                  <td className="px-4 py-2 text-[var(--color-text-secondary)]">
                    {r.salidaJornada || "—"}
                  </td>

                  <td className="px-4 py-2">
                    {r.estado === "Completo" ? (
                      <span className="rounded bg-[var(--color-success)] px-2 py-0.5 text-xs text-white">
                        Completo
                      </span>
                    ) : (
                      <span className="rounded bg-[var(--color-warning)] px-2 py-0.5 text-xs text-white">
                        Incompleto
                      </span>
                    )}
                  </td>
                  {puedeVerHistorial && (
                    <td className="px-4 py-2">
                      {r.marcas && Object.keys(r.marcas).length > 0 && (
                        <button
                          onClick={() => { setAviso(null); setSeleccion(r); }}
                          className="whitespace-nowrap rounded border border-[var(--color-amber)] px-2 py-0.5 text-xs text-[var(--color-accent-text)] hover:bg-[var(--color-amber)] hover:text-[var(--color-on-primary)]"
                        >
                          {user?.role === "ADMIN" ? "Historial / Corregir" : "Historial"}
                        </button>
                      )}
                      {r.marcas && Object.values(r.marcas).some((m) => m.corregida) && (
                        <span className="ml-1 text-xs text-[var(--color-warning)]">corregida</span>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {aviso && (
        <p className="rounded border border-[var(--color-success-border)] bg-[var(--color-success-bg)] p-3 text-sm text-[var(--color-success)]">{aviso}</p>
      )}

      {seleccion?.marcas && (
        <CorreccionMarcacion
          nombre={seleccion.name}
          documento={seleccion.id}
          fecha={seleccion.fechaLaboral}
          marcas={seleccion.marcas}
          esAdmin={user?.role === "ADMIN"}
          onCerrar={() => setSeleccion(null)}
          onCorregida={(m) => { setSeleccion(null); setAviso(m); setRecarga((n) => n + 1); }}
        />
      )}

      {/* Marcaciones tardías propias (solo EMPLEADO) */}
      {user?.role === "EMPLEADO" && <MisMarcacionesTardias />}

      {/* Momentos de marcación */}
      <section className="mt-8">
        <h2 className="mb-4 text-xl font-semibold text-[var(--color-text-primary)]">
          Momentos de marcación
        </h2>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4">
            <h3 className="mb-2 font-medium text-[var(--color-text-primary)]">
              ENTRADA_MANANA
            </h3>
            <p className="text-sm text-[var(--color-text-secondary)]">
              Hora de inicio de la jornada. Se evalúa con la tolerancia de entrada.
            </p>
          </div>

          <div className="rounded border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4">
            <h3 className="mb-2 font-medium text-[var(--color-text-primary)]">
              SALIDA_ALMUERZO
            </h3>
            <p className="text-sm text-[var(--color-text-secondary)]">
              Fin de la mañana antes del almuerzo.
            </p>
          </div>

          <div className="rounded border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4">
            <h3 className="mb-2 font-medium text-[var(--color-text-primary)]">
              ENTRADA_ALMUERZO
            </h3>
            <p className="text-sm text-[var(--color-text-secondary)]">
              Reincorporación después del almuerzo. Se evalúa con la tolerancia de almuerzo.
            </p>
          </div>

          <div className="rounded border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4">
            <h3 className="mb-2 font-medium text-[var(--color-text-primary)]">
              SALIDA_JORNADA
            </h3>
            <p className="text-sm text-[var(--color-text-secondary)]">
              Fin de la jornada laboral.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
