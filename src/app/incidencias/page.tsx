"use client";

import React, { useEffect, useState } from "react";
import {
  Search,
  RefreshCcw,
  AlertCircle,
  CheckCircle,
  XCircle,
  Clock,
  Eye,
  X,
} from "lucide-react";
import DeteccionFaltantes from "./DeteccionFaltantes";

// ─── Types ───────────────────────────────────────────────────────────────────

type EstadoIncidencia =
  | "PENDIENTE"
  | "EN_REVISION"
  | "JUSTIFICADA"
  | "RESUELTA"
  | "RECHAZADA";

type Prioridad = "Alta" | "Media" | "Baja";

type Incidencia = {
  id: string;
  name: string;
  documento: string;
  tipo: string;
  fecha: string;
  descripcion: string;
  prioridad: Prioridad | null;
  estado: EstadoIncidencia;
  resolvedBy?: string | null;
};

type Employee = {
  id: string;
  nombre: string;
  apellido: string;
  documento: string;
  isActive: boolean;
};

// ─── Constants ───────────────────────────────────────────────────────────────

const TIPO_LABELS: Record<string, string> = {
  MARCACION_FALTANTE: "Marcación faltante",
  FUERA_DE_SECUENCIA: "Fuera de secuencia",
  HORA_ATIPICA: "Hora atípica",
  DUPLICADO_INTENTADO: "Duplicado intentado",
};

const ESTADO_LABELS: Record<EstadoIncidencia, string> = {
  PENDIENTE: "Pendiente",
  EN_REVISION: "En revisión",
  JUSTIFICADA: "Justificada",
  RESUELTA: "Resuelta",
  RECHAZADA: "Rechazada",
};

const ESTADOS: EstadoIncidencia[] = [
  "PENDIENTE",
  "EN_REVISION",
  "JUSTIFICADA",
  "RESUELTA",
  "RECHAZADA",
];

const PRIORIDADES: Prioridad[] = ["Alta", "Media", "Baja"];

const TIPOS_ENUM = Object.keys(TIPO_LABELS) as string[];

// ─── Helpers ─────────────────────────────────────────────────────────────────

const Avatar = ({ name }: { name: string }) => {
  const initials = name
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-amber)] text-sm font-bold text-[var(--color-on-primary)]">
      {initials || "?"}
    </div>
  );
};

const getPrioridadClass = (prioridad: Prioridad | null): string => {
  switch (prioridad) {
    case "Alta":
      return "bg-[var(--color-error)] text-white";
    case "Media":
      return "bg-[var(--color-warning)] text-white";
    case "Baja":
      return "bg-gray-600 text-white";
    default:
      return "bg-gray-400 text-white";
  }
};

const getEstadoClass = (estado: EstadoIncidencia): string => {
  switch (estado) {
    case "PENDIENTE":
      return "bg-[var(--color-error)] text-white";
    case "EN_REVISION":
      return "bg-[var(--color-primary)] text-white";
    case "JUSTIFICADA":
      return "bg-[var(--color-info)] text-white";
    case "RESUELTA":
      return "bg-[var(--color-success)] text-white";
    case "RECHAZADA":
      return "bg-gray-600 text-white";
    default:
      return "bg-gray-500 text-white";
  }
};

// ─── Component ───────────────────────────────────────────────────────────────

export default function IncidenciasPage() {
  // ── Date ──
  const [today, setToday] = useState("");

  // ── Data ──
  const [incidencias, setIncidencias] = useState<Incidencia[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [recargaInc, setRecargaInc] = useState(0);

  // ── Employees (ADMIN only) ──
  const [employees, setEmployees] = useState<Employee[]>([]);

  // ── Create form ──
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [newTipo, setNewTipo] = useState("");
  const [newDescripcion, setNewDescripcion] = useState("");
  const [newPrioridad, setNewPrioridad] = useState<Prioridad>("Media");
  const [newFecha, setNewFecha] = useState("");
  const [newEmployeeId, setNewEmployeeId] = useState("");

  // ── Filters ──
  const [search, setSearch] = useState("");
  const [filterTipo, setFilterTipo] = useState("todos");
  const [filterEstado, setFilterEstado] = useState("todos");
  const [filterPrioridad, setFilterPrioridad] = useState("todos");

  // ── Modal ──
  const [selectedIncidencia, setSelectedIncidencia] =
    useState<Incidencia | null>(null);

  // ── Effects ──

  useEffect(() => {
    setToday(
      new Date().toLocaleDateString("es-ES", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    );
  }, []);

  useEffect(() => {
    const fetchIncidencias = async () => {
      try {
        setLoading(true);
        setError(null);

        const res = await fetch("/api/incidencias", {
          method: "GET",
          credentials: "include",
        });

        if (!res.ok) throw new Error(`Error ${res.status}`);

        const data = await res.json();
        setIncidencias(data.incidents ?? []);
        setUserRole(data.role ?? null);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "No fue posible cargar las incidencias."
        );
      } finally {
        setLoading(false);
      }
    };

    fetchIncidencias();
  }, [recargaInc]);

  // Load active employees for ADMIN and SUPERVISOR employee selector
  useEffect(() => {
    if (userRole !== "ADMIN" && userRole !== "SUPERVISOR") return;

    fetch("/api/empleados", { method: "GET", credentials: "include" })
      .then((res) => res.json())
      .then((data) => {
        const active: Employee[] = (data.employees ?? []).filter(
          (e: Employee) => e.isActive
        );
        setEmployees(active);
      })
      .catch((err) =>
        console.error("Error al cargar la lista de empleados:", err)
      );
  }, [userRole]);

  // ── Handlers ──

  const handleCreate = async () => {
    if (!newTipo) {
      alert("Debes seleccionar el tipo de incidencia.");
      return;
    }
    if (!newDescripcion.trim()) {
      alert("Debes ingresar una descripción.");
      return;
    }
    if ((userRole === "ADMIN" || userRole === "SUPERVISOR") && !newEmployeeId) {
      alert("Debes seleccionar un empleado.");
      return;
    }

    try {
      const payload: Record<string, unknown> = {
        tipo: newTipo,
        descripcion: newDescripcion.trim(),
        prioridad: newPrioridad,
      };

      if (newFecha) payload.fechaLaboral = newFecha;
      if ((userRole === "ADMIN" || userRole === "SUPERVISOR") && newEmployeeId) {
        payload.userId = newEmployeeId;
      }

      const res = await fetch("/api/incidencias", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Error ${res.status}`);
      }

      const created = await res.json();
      setIncidencias((prev) => [created, ...prev]);

      // Reset form and close panel on success
      setNewTipo("");
      setNewDescripcion("");
      setNewPrioridad("Media");
      setNewFecha("");
      setNewEmployeeId("");
      setIsFormOpen(false);
    } catch (err) {
      // Keep panel open and preserve data so the user can correct the error
      alert(
        "Error al crear incidencia: " +
          (err instanceof Error ? err.message : "Error desconocido")
      );
    }
  };

  const handleChangeState = async (
    incId: string,
    newEstado: EstadoIncidencia
  ) => {
    try {
      const res = await fetch(`/api/incidencias/${incId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ estado: newEstado }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Error ${res.status}`);
      }

      const updated: Incidencia = await res.json();
      setIncidencias((prev) =>
        prev.map((inc) => (inc.id === incId ? updated : inc))
      );
      setSelectedIncidencia((prev) => (prev?.id === incId ? updated : prev));
    } catch (err) {
      alert(
        "Error al cambiar el estado: " +
          (err instanceof Error ? err.message : "Error desconocido")
      );
    }
  };

  // ── Derived state ──

  const tiposEnUso = Array.from(new Set(incidencias.map((inc) => inc.tipo)));

  const filtered = incidencias.filter((inc) => {
    const term = search.toLowerCase();
    const matchesSearch =
      inc.name.toLowerCase().includes(term) ||
      inc.id.toLowerCase().includes(term);
    const matchesTipo = filterTipo === "todos" || inc.tipo === filterTipo;
    const matchesEstado =
      filterEstado === "todos" || inc.estado === filterEstado;
    const matchesPrioridad =
      filterPrioridad === "todos" || inc.prioridad === filterPrioridad;

    return matchesSearch && matchesTipo && matchesEstado && matchesPrioridad;
  });

  const total = incidencias.length;
  const pendientes = incidencias.filter(
    (inc) => inc.estado === "PENDIENTE"
  ).length;
  const enRevision = incidencias.filter(
    (inc) => inc.estado === "EN_REVISION"
  ).length;
  const resueltas = incidencias.filter(
    (inc) => inc.estado === "RESUELTA"
  ).length;

  // ── Render ──

  return (
    <div className="p-6 space-y-8">
      {/* Encabezado */}
      <header className="space-y-1">
        <h1 className="text-3xl font-bold text-[var(--color-text-primary)]">
          Incidencias
        </h1>
        <p className="text-lg text-[var(--color-text-secondary)]">
          Seguimiento y revisión de novedades de asistencia
        </p>
        <p className="text-sm text-[var(--color-text-secondary)]">{today}</p>
      </header>

      {userRole === "ADMIN" && (
        <DeteccionFaltantes onCompletada={() => setRecargaInc((n) => n + 1)} />
      )}

      {/* Formulario de creación — panel desplegable */}
      <section className="border border-[var(--color-border)] rounded-lg bg-[var(--color-bg-card)]">
        {/* Encabezado toggle */}
        <button
          type="button"
          onClick={() => setIsFormOpen((prev) => !prev)}
          className="flex w-full items-center justify-between px-4 py-3 text-left"
          aria-expanded={isFormOpen}
        >
          <span className="text-xl font-semibold text-[var(--color-text-primary)]">
            Crear incidencia
          </span>
          <span
            className={`text-[var(--color-text-secondary)] transition-transform duration-200 ${
              isFormOpen ? "rotate-180" : "rotate-0"
            }`}
            aria-hidden="true"
          >
            ▼
          </span>
        </button>

        {/* Contenido desplegable */}
        {isFormOpen && (
          <div className="border-t border-[var(--color-border)] p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Selector de empleado — ADMIN y SUPERVISOR */}
              {(userRole === "ADMIN" || userRole === "SUPERVISOR") && (
                <div>
                  <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">
                    Empleado <span className="text-[var(--color-error)]">*</span>
                  </label>
                  <select
                    value={newEmployeeId}
                    onChange={(e) => setNewEmployeeId(e.target.value)}
                    className="w-full rounded border border-[var(--color-border)] bg-[var(--color-bg-main)] px-3 py-2 text-[var(--color-text-primary)] focus:outline-none"
                  >
                    <option value="">Seleccionar empleado activo</option>
                    {employees.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.nombre} {emp.apellido} — {emp.documento}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Tipo de incidencia */}
              <div>
                <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">
                  Tipo de incidencia <span className="text-[var(--color-error)]">*</span>
                </label>
                <select
                  value={newTipo}
                  onChange={(e) => setNewTipo(e.target.value)}
                  className="w-full rounded border border-[var(--color-border)] bg-[var(--color-bg-main)] px-3 py-2 text-[var(--color-text-primary)] focus:outline-none"
                >
                  <option value="">Seleccionar tipo</option>
                  {TIPOS_ENUM.map((tipo) => (
                    <option key={tipo} value={tipo}>
                      {TIPO_LABELS[tipo]}
                    </option>
                  ))}
                </select>
              </div>

              {/* Prioridad */}
              <div>
                <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">
                  Prioridad
                </label>
                <select
                  value={newPrioridad}
                  onChange={(e) => setNewPrioridad(e.target.value as Prioridad)}
                  className="w-full rounded border border-[var(--color-border)] bg-[var(--color-bg-main)] px-3 py-2 text-[var(--color-text-primary)] focus:outline-none"
                >
                  {PRIORIDADES.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>

              {/* Descripción */}
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">
                  Descripción <span className="text-[var(--color-error)]">*</span>
                </label>
                <textarea
                  value={newDescripcion}
                  onChange={(e) => setNewDescripcion(e.target.value)}
                  rows={3}
                  placeholder="Describe lo sucedido..."
                  className="w-full rounded border border-[var(--color-border)] bg-[var(--color-bg-main)] px-3 py-2 text-[var(--color-text-primary)] focus:outline-none"
                />
              </div>

              {/* Fecha laboral */}
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">
                  Fecha laboral (opcional)
                </label>
                <input
                  type="date"
                  value={newFecha}
                  onChange={(e) => setNewFecha(e.target.value)}
                  className="w-full rounded border border-[var(--color-border)] bg-[var(--color-bg-main)] px-3 py-2 text-[var(--color-text-primary)] focus:outline-none"
                />
              </div>

              {/* Botones */}
              <div className="sm:col-span-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="rounded border border-[var(--color-border)] px-4 py-2 text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-sidebar-hover)]"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleCreate}
                  className="rounded bg-[var(--color-amber)] px-4 py-2 font-medium text-[var(--color-on-primary)] hover:opacity-90"
                >
                  Crear incidencia
                </button>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Métricas */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="flex items-center space-x-3 p-4 bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-lg">
          <AlertCircle className="w-6 h-6 text-[var(--color-accent-text)]" />
          <div>
            <p className="text-2xl font-semibold text-[var(--color-text-primary)]">
              {total}
            </p>
            <p className="text-sm text-[var(--color-text-secondary)]">
              Total de incidencias
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-3 p-4 bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-lg">
          <XCircle className="w-6 h-6 text-[var(--color-error)]" />
          <div>
            <p className="text-2xl font-semibold text-[var(--color-text-primary)]">
              {pendientes}
            </p>
            <p className="text-sm text-[var(--color-text-secondary)]">
              Pendientes
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-3 p-4 bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-lg">
          <Clock className="w-6 h-6 text-[var(--color-warning)]" />
          <div>
            <p className="text-2xl font-semibold text-[var(--color-text-primary)]">
              {enRevision}
            </p>
            <p className="text-sm text-[var(--color-text-secondary)]">
              En revisión
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-3 p-4 bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-lg">
          <CheckCircle className="w-6 h-6 text-[var(--color-success)]" />
          <div>
            <p className="text-2xl font-semibold text-[var(--color-text-primary)]">
              {resueltas}
            </p>
            <p className="text-sm text-[var(--color-text-secondary)]">
              Resueltas
            </p>
          </div>
        </div>
      </section>

      {/* Barra de herramientas */}
      <section className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center space-x-2 w-full sm:w-auto">
          <Search className="w-5 h-5 text-[var(--color-text-secondary)]" />
          <input
            type="text"
            placeholder="Buscar por nombre o ID"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 rounded border border-[var(--color-border)] bg-[var(--color-bg-main)] px-2 py-2 text-[var(--color-text-primary)] placeholder-[var(--color-text-secondary)] focus:outline-none"
          />
        </div>

        {/* Filtro por tipo */}
        <select
          value={filterTipo}
          onChange={(e) => setFilterTipo(e.target.value)}
          className="rounded border border-[var(--color-border)] bg-[var(--color-bg-main)] px-2 py-2 text-[var(--color-text-primary)] focus:outline-none"
        >
          <option value="todos">Todos los tipos</option>
          {tiposEnUso.map((tipo) => (
            <option key={tipo} value={tipo}>
              {TIPO_LABELS[tipo] ?? tipo}
            </option>
          ))}
        </select>

        {/* Filtro por estado */}
        <select
          value={filterEstado}
          onChange={(e) => setFilterEstado(e.target.value)}
          className="rounded border border-[var(--color-border)] bg-[var(--color-bg-main)] px-2 py-2 text-[var(--color-text-primary)] focus:outline-none"
        >
          <option value="todos">Todos los estados</option>
          {ESTADOS.map((estado) => (
            <option key={estado} value={estado}>
              {ESTADO_LABELS[estado]}
            </option>
          ))}
        </select>

        {/* Filtro por prioridad */}
        <select
          value={filterPrioridad}
          onChange={(e) => setFilterPrioridad(e.target.value)}
          className="rounded border border-[var(--color-border)] bg-[var(--color-bg-main)] px-2 py-2 text-[var(--color-text-primary)] focus:outline-none"
        >
          <option value="todos">Todas las prioridades</option>
          {PRIORIDADES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={() => {
            setSearch("");
            setFilterTipo("todos");
            setFilterEstado("todos");
            setFilterPrioridad("todos");
          }}
          className="flex items-center justify-center gap-1 rounded bg-[var(--color-amber)] px-3 py-2 text-[var(--color-on-primary)]"
        >
          <RefreshCcw className="w-4 h-4" />
          Limpiar
        </button>
      </section>

      {/* Error */}
      {error && (
        <div className="rounded border border-[var(--color-error-border)] bg-[var(--color-error-bg)] p-4 text-[var(--color-error)]">
          No fue posible cargar las incidencias: {error}
        </div>
      )}

      {/* Tabla */}
      <section className="overflow-x-auto">
        <table className="min-w-full bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded">
          <thead>
            <tr className="bg-[var(--color-bg-sidebar)] text-[var(--color-text-primary)]">
              <th className="px-4 py-2 text-left">Empleado</th>
              <th className="px-4 py-2 text-left">Documento</th>
              <th className="px-4 py-2 text-left">Tipo</th>
              <th className="px-4 py-2 text-left">Fecha</th>
              <th className="px-4 py-2 text-left">Descripción</th>
              <th className="px-4 py-2 text-left">Prioridad</th>
              <th className="px-4 py-2 text-left">Estado</th>
              <th className="px-4 py-2 text-left">Acción</th>
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td
                  colSpan={8}
                  className="px-4 py-8 text-center text-[var(--color-text-secondary)]"
                >
                  Cargando incidencias...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
                  className="px-4 py-8 text-center text-[var(--color-text-secondary)]"
                >
                  No se encontraron incidencias con los filtros seleccionados.
                </td>
              </tr>
            ) : (
              filtered.map((inc, idx) => (
                <tr
                  key={inc.id}
                  className={`${
                    idx % 2 === 0
                      ? "bg-[var(--color-bg-main)]"
                      : "bg-[var(--color-bg-card)]"
                  } hover:bg-[var(--color-bg-sidebar-hover)] transition-colors`}
                >
                  <td className="px-4 py-2">
                    <div className="flex items-center space-x-2 text-[var(--color-text-primary)]">
                      <Avatar name={inc.name} />
                      <span>{inc.name}</span>
                    </div>
                  </td>

                  <td className="px-4 py-2 text-[var(--color-text-secondary)]">
                    {inc.documento}
                  </td>

                  <td className="px-4 py-2 text-[var(--color-text-secondary)]">
                    {TIPO_LABELS[inc.tipo] ?? inc.tipo}
                  </td>

                  <td className="px-4 py-2 text-[var(--color-text-secondary)]">
                    {inc.fecha}
                  </td>

                  <td className="px-4 py-2 text-[var(--color-text-secondary)]">
                    {inc.descripcion}
                  </td>

                  <td className="px-4 py-2">
                    <span
                      className={`rounded px-2 py-0.5 text-xs ${getPrioridadClass(inc.prioridad)}`}
                    >
                      {inc.prioridad ?? "—"}
                    </span>
                  </td>

                  <td className="px-4 py-2">
                    <span
                      className={`rounded px-2 py-0.5 text-xs ${getEstadoClass(inc.estado)}`}
                    >
                      {ESTADO_LABELS[inc.estado]}
                    </span>
                  </td>

                  <td className="px-4 py-2 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => setSelectedIncidencia(inc)}
                      className="inline-flex items-center gap-1 text-[var(--color-accent-text)] hover:underline"
                      title="Ver detalle"
                    >
                      <Eye className="w-4 h-4" />
                      Ver
                    </button>

                    {(userRole === "ADMIN" || userRole === "SUPERVISOR") && (
                      <select
                        value={inc.estado}
                        onChange={(e) =>
                          handleChangeState(
                            inc.id,
                            e.target.value as EstadoIncidencia
                          )
                        }
                        className="ml-2 rounded border border-[var(--color-border)] bg-[var(--color-bg-main)] px-1 py-1 text-[var(--color-text-primary)] text-sm"
                      >
                        {ESTADOS.map((estado) => (
                          <option key={estado} value={estado}>
                            {ESTADO_LABELS[estado]}
                          </option>
                        ))}
                      </select>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      {/* Info */}
      <section className="mt-8">
        <h2 className="text-xl font-semibold mb-4 text-[var(--color-text-primary)]">
          Información sobre incidencias
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded">
            <p className="text-sm text-[var(--color-text-secondary)]">
              Las incidencias requieren revisión administrativa antes de
              marcarse como resueltas.
            </p>
          </div>
          <div className="p-4 bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded">
            <p className="text-sm text-[var(--color-text-secondary)]">
              Una marcación faltante no implica automáticamente ausencia; puede
              tratarse como incidencia.
            </p>
          </div>
          <div className="p-4 bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded">
            <p className="text-sm text-[var(--color-text-secondary)]">
              Los datos originales de asistencia se mantienen intactos; las
              correcciones conservarán trazabilidad.
            </p>
          </div>
          <div className="p-4 bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded">
            <p className="text-sm text-[var(--color-text-secondary)]">
              Futuras correcciones deberán registrar auditorías y versiones de
              los registros.
            </p>
          </div>
        </div>
      </section>

      {/* Modal de detalle */}
      {selectedIncidencia && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setSelectedIncidencia(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="incidencia-modal-title"
            className="w-full max-w-lg rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="flex items-center justify-between border-b border-[var(--color-border)] p-5">
              <div>
                <h2
                  id="incidencia-modal-title"
                  className="text-xl font-semibold text-[var(--color-text-primary)]"
                >
                  Detalle de incidencia
                </h2>
                <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                  Información del registro seleccionado
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedIncidencia(null)}
                className="rounded-lg p-2 text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-sidebar-hover)]"
                aria-label="Cerrar detalle"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal body */}
            <div className="space-y-5 p-5">
              <div className="flex items-center gap-3">
                <Avatar name={selectedIncidencia.name} />
                <div>
                  <p className="font-semibold text-[var(--color-text-primary)]">
                    {selectedIncidencia.name}
                  </p>
                  <p className="text-sm text-[var(--color-text-secondary)]">
                    Documento: {selectedIncidencia.documento}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-[var(--color-text-secondary)]">
                    Tipo de incidencia
                  </p>
                  <p className="mt-1 font-medium text-[var(--color-text-primary)]">
                    {TIPO_LABELS[selectedIncidencia.tipo] ??
                      selectedIncidencia.tipo}
                  </p>
                </div>

                <div>
                  <p className="text-xs text-[var(--color-text-secondary)]">
                    Fecha
                  </p>
                  <p className="mt-1 font-medium text-[var(--color-text-primary)]">
                    {selectedIncidencia.fecha}
                  </p>
                </div>

                <div>
                  <p className="text-xs text-[var(--color-text-secondary)]">
                    Prioridad
                  </p>
                  <span
                    className={`mt-1 inline-block rounded px-2 py-1 text-xs ${getPrioridadClass(selectedIncidencia.prioridad)}`}
                  >
                    {selectedIncidencia.prioridad ?? "—"}
                  </span>
                </div>

                <div>
                  <p className="text-xs text-[var(--color-text-secondary)]">
                    Estado
                  </p>
                  <span
                    className={`mt-1 inline-block rounded px-2 py-1 text-xs ${getEstadoClass(selectedIncidencia.estado)}`}
                  >
                    {ESTADO_LABELS[selectedIncidencia.estado]}
                  </span>
                </div>
              </div>

              <div>
                <p className="text-xs text-[var(--color-text-secondary)]">
                  Descripción
                </p>
                <div className="mt-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-main)] p-4">
                  <p className="text-sm leading-relaxed text-[var(--color-text-primary)]">
                    {selectedIncidencia.descripcion}
                  </p>
                </div>
              </div>
            </div>

            {/* Modal footer */}
            <div className="flex justify-end border-t border-[var(--color-border)] p-5">
              <button
                type="button"
                onClick={() => setSelectedIncidencia(null)}
                className="rounded-lg bg-[var(--color-amber)] px-5 py-2 font-medium text-[var(--color-on-primary)] hover:opacity-90"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
