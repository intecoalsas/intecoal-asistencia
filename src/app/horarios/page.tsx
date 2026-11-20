
"use client";

import React, { useEffect, useState, Fragment } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/app/_components/AuthProvider";
import {
  User,
  Search,
  RefreshCcw,
  Calendar,
  Clock,
  CheckCircle,
  AlertCircle,
  XCircle,
  Plus,
  ChevronDown,
  Eye,
  Pencil,
  Trash2,
  Power,
} from "lucide-react";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

type EstadoAsignacion = "Activa" | "Futura" | "Finalizada";

type ReglaHorario = {
  id?: string;
  dia: string;
  horaEntradaManana: string;
  horaSalidaAlmuerzo: string;
  horaEntradaAlmuerzo: string;
  horaSalidaJornada: string;
  esLaboral: boolean;
};

type Politica = {
  id: string;
  nombre: string;
  descripcion: string | null;
  toleranciaEntradaMinutos: number;
  toleranciaAlmuerzoMinutos: number;
  minimoMinutosAlmuerzo: number;
  isActive: boolean;
  dayRules: ReglaHorario[];
  _count?: { assignments: number };
  activeOrFutureAssignments?: number;
};

type Horario = {
  assignmentId: string;
  employeeId: string;
  name: string;
  id: string;
  cargo: string;
  employeeActive: boolean;
  policy: {
    id: string;
    nombre: string;
    descripcion: string | null;
    isActive: boolean;
    toleranciaEntradaMinutos: number;
    toleranciaAlmuerzoMinutos: number;
    minimoMinutosAlmuerzo: number;
  };
  validFrom: string;
  validUntil: string | null;
  toleranciaPersonalizadaMin: number | null;
  estado: EstadoAsignacion;
  reglas: ReglaHorario[];
};

type Empleado = {
  id: string;
  documento: string;
  nombre: string;
  apellido: string;
  cargo: string | null;
  isActive: boolean;
};

type DiaSemana =
  | "LUNES"
  | "MARTES"
  | "MIERCOLES"
  | "JUEVES"
  | "VIERNES"
  | "SABADO"
  | "DOMINGO";

const DIAS: { value: DiaSemana; label: string }[] = [
  { value: "LUNES", label: "Lunes" },
  { value: "MARTES", label: "Martes" },
  { value: "MIERCOLES", label: "Miércoles" },
  { value: "JUEVES", label: "Jueves" },
  { value: "VIERNES", label: "Viernes" },
  { value: "SABADO", label: "Sábado" },
  { value: "DOMINGO", label: "Domingo" },
];

const ORDEN_DIAS = DIAS.map((dia) => dia.value);

const REGLA_VACIA = {
  horaEntradaManana: "07:00",
  horaSalidaAlmuerzo: "12:00",
  horaEntradaAlmuerzo: "13:00",
  horaSalidaJornada: "17:00",
};

function crearReglasIniciales(): ReglaHorario[] {
  return DIAS.map((dia) => ({
    dia: dia.value,
    ...REGLA_VACIA,
    esLaboral: !["SABADO", "DOMINGO"].includes(dia.value),
  }));
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function fechaLocalActual(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function formatearFecha(value: string | null): string {
  if (!value) return "Sin fecha de finalización";

  return new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString(
    "es-CO",
    { year: "numeric", month: "short", day: "numeric" }
  );
}

function obtenerError(data: unknown, fallback: string): string {
  if (
    typeof data === "object" &&
    data !== null &&
    "error" in data &&
    typeof data.error === "string"
  ) {
    return data.error;
  }
  return fallback;
}

function normalizarReglas(reglas?: ReglaHorario[]): ReglaHorario[] {
  if (!Array.isArray(reglas) || reglas.length === 0) {
    return crearReglasIniciales();
  }

  return [...reglas]
    .sort(
      (a, b) =>
        ORDEN_DIAS.indexOf(a.dia as DiaSemana) -
        ORDEN_DIAS.indexOf(b.dia as DiaSemana)
    )
    .map((regla) => ({
      ...regla,
      horaEntradaManana: regla.horaEntradaManana?.slice(0, 5) ?? "07:00",
      horaSalidaAlmuerzo: regla.horaSalidaAlmuerzo?.slice(0, 5) ?? "12:00",
      horaEntradaAlmuerzo: regla.horaEntradaAlmuerzo?.slice(0, 5) ?? "13:00",
      horaSalidaJornada: regla.horaSalidaJornada?.slice(0, 5) ?? "17:00",
    }));
}

function Avatar({ name }: { name: string }) {
  const initials = name
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-amber)] text-sm font-semibold text-[var(--color-on-primary)]">
      {initials || "?"}
    </div>
  );
}

function EstadoBadge({ estado }: { estado: EstadoAsignacion }) {
  const styles: Record<EstadoAsignacion, string> = {
    Activa: "bg-[var(--color-success)] text-white",
    Futura: "bg-[var(--color-info)] text-white",
    Finalizada: "bg-gray-600 text-white",
  };

  return (
    <span className={`rounded px-2 py-1 text-xs font-medium ${styles[estado]}`}>
      {estado}
    </span>
  );
}

// -----------------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------------

export default function HorariosPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [horarios, setHorarios] = useState<Horario[]>([]);
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [politicas, setPoliticas] = useState<Politica[]>([]);

  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [search, setSearch] = useState("");
  const [filterEstado, setFilterEstado] = useState("todos");
  const [filterPolitica, setFilterPolitica] = useState("todos");

  const [showAssignmentForm, setShowAssignmentForm] = useState(false);
  const [showPolicyManagement, setShowPolicyManagement] = useState(false);
  const [showPolicyForm, setShowPolicyForm] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState<Politica | null>(null);
  const [viewingPolicy, setViewingPolicy] = useState<Politica | null>(null);

  // Controla la fila de reglas desplegada.
  const [expandedAssignmentId, setExpandedAssignmentId] = useState<string | null>(null);

  const [employeeId, setEmployeeId] = useState("");
  const [policyId, setPolicyId] = useState("");
  const [validFrom, setValidFrom] = useState("");

  const [policyName, setPolicyName] = useState("");
  const [policyDescription, setPolicyDescription] = useState("");
  const [toleranciaEntrada, setToleranciaEntrada] = useState("5");
  const [toleranciaAlmuerzo, setToleranciaAlmuerzo] = useState("5");
  const [minimoAlmuerzo, setMinimoAlmuerzo] = useState("60");
  const [reglas, setReglas] = useState<ReglaHorario[]>(crearReglasIniciales());

  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  const [savingPolicy, setSavingPolicy] = useState(false);
  const [policyError, setPolicyError] = useState<string | null>(null);
  const [policySuccess, setPolicySuccess] = useState<string | null>(null);
  const [policyActionId, setPolicyActionId] = useState<string | null>(null);

  const [today, setToday] = useState("");

  const isAdmin = user?.role === "ADMIN" || user?.role === "SUPERVISOR";

  useEffect(() => {
    const timer = setTimeout(() => {
      setToday(
        new Date().toLocaleDateString("es-CO", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
        })
      );
    }, 0);

    return () => clearTimeout(timer);
  }, []);

  // ---------------------------------------------------------------------------
  // Authorization and data loading
  // ---------------------------------------------------------------------------

  useEffect(() => {
    // Esperar a que AuthProvider termine de verificar la sesión.
    if (authLoading) return;

    // Si no hay sesión, enviar al inicio de sesión.
    if (!user) {
      router.replace("/login");
      return;
    }

    // El módulo de horarios es exclusivo para administradores.
    // No ejecutar ninguna consulta administrativa para otros roles.
    if (!isAdmin) {
      router.replace("/marcaciones");
      return;
    }

    const controller = new AbortController();

    async function loadData() {
      try {
        setFetchError(null);

        const [horariosResponse, empleadosResponse, politicasResponse] =
          await Promise.all([
            fetch("/api/horarios", {
              credentials: "include",
              signal: controller.signal,
            }),
            fetch("/api/empleados", {
              credentials: "include",
              signal: controller.signal,
            }),
            fetch("/api/horarios/politicas", {
              credentials: "include",
              signal: controller.signal,
            }),
          ]);

        const [horariosData, empleadosData, politicasData] =
          await Promise.all([
            horariosResponse.json(),
            empleadosResponse.json(),
            politicasResponse.json(),
          ]);

        if (!horariosResponse.ok) {
          throw new Error(
            obtenerError(
              horariosData,
              `Error al consultar horarios (HTTP ${horariosResponse.status})`
            )
          );
        }

        if (!empleadosResponse.ok) {
          throw new Error(
            obtenerError(
              empleadosData,
              `Error al consultar empleados (HTTP ${empleadosResponse.status})`
            )
          );
        }

        if (!politicasResponse.ok) {
          throw new Error(
            obtenerError(
              politicasData,
              `Error al consultar políticas (HTTP ${politicasResponse.status})`
            )
          );
        }

        if (controller.signal.aborted) return;

        setHorarios(
          Array.isArray(horariosData.horarios)
            ? horariosData.horarios
            : []
        );

        const listaEmpleados =
          empleadosData.empleados ??
          empleadosData.employees ??
          empleadosData.users ??
          [];

        setEmpleados(
          Array.isArray(listaEmpleados) ? listaEmpleados : []
        );

        setPoliticas(
          Array.isArray(politicasData.politicas)
            ? politicasData.politicas
            : []
        );
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return;

        console.error("Error cargando módulo de horarios:", error);

        if (!controller.signal.aborted) {
          setFetchError(
            error instanceof Error
              ? error.message
              : "No fue posible cargar la información"
          );
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    loadData();

    return () => controller.abort();
  }, [reloadKey, authLoading, user, isAdmin, router]);

  // ---------------------------------------------------------------------------
  // Filters and metrics
  // ---------------------------------------------------------------------------

  const filtered = horarios.filter((horario) => {
    const searchValue = search.toLowerCase();

    const matchesSearch =
      horario.name.toLowerCase().includes(searchValue) ||
      horario.id.toLowerCase().includes(searchValue) ||
      horario.policy.nombre.toLowerCase().includes(searchValue);

    const matchesEstado =
      filterEstado === "todos" || horario.estado === filterEstado;

    const matchesPolitica =
      filterPolitica === "todos" || horario.policy.id === filterPolitica;

    return matchesSearch && matchesEstado && matchesPolitica;
  });

  const asignacionesActivas = horarios.filter(
    (horario) => horario.estado === "Activa"
  ).length;

  const asignacionesFuturas = horarios.filter(
    (horario) => horario.estado === "Futura"
  ).length;

  const asignacionesFinalizadas = horarios.filter(
    (horario) => horario.estado === "Finalizada"
  ).length;

  const empleadosConHorario = new Set(
    horarios
      .filter((horario) => horario.estado === "Activa")
      .map((horario) => horario.employeeId)
  ).size;

  // ---------------------------------------------------------------------------
  // Assignment form
  // ---------------------------------------------------------------------------

  function abrirFormularioAsignacion() {
    setFormError(null);
    setFormSuccess(null);
    setEmployeeId("");
    setPolicyId("");
    setValidFrom(fechaLocalActual());
    setShowAssignmentForm(true);
    setShowPolicyForm(false);
    setEditingPolicy(null);
  }

  function cerrarFormularioAsignacion() {
    if (saving) return;
    setShowAssignmentForm(false);
    setFormError(null);
    setFormSuccess(null);
  }

  async function asignarHorario(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setFormSuccess(null);

    if (!employeeId || !policyId || !validFrom) {
      setFormError("Completa todos los campos.");
      return;
    }

    setSaving(true);

    try {
      const response = await fetch("/api/horarios", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId, policyId, validFrom }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          obtenerError(
            data,
            `No fue posible asignar el horario (HTTP ${response.status})`
          )
        );
      }

      setFormSuccess(data.message ?? "Horario asignado correctamente.");
      setReloadKey((current) => current + 1);
      setEmployeeId("");
      setPolicyId("");
      setValidFrom(fechaLocalActual());
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : "Ocurrió un error al asignar el horario."
      );
    } finally {
      setSaving(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Policy form
  // ---------------------------------------------------------------------------

  function abrirFormularioPolitica() {
    setPolicyError(null);
    setPolicySuccess(null);
    setEditingPolicy(null);
    setPolicyName("");
    setPolicyDescription("");
    setToleranciaEntrada("5");
    setToleranciaAlmuerzo("5");
    setMinimoAlmuerzo("60");
    setReglas(crearReglasIniciales());
    setShowPolicyManagement(true);
    setShowPolicyForm(true);
    setShowAssignmentForm(false);
    setViewingPolicy(null);
  }

  function abrirEdicionPolitica(politica: Politica) {
    if ((politica.activeOrFutureAssignments ?? 0) > 0) return;

    setEditingPolicy(politica);
    setPolicyError(null);
    setPolicySuccess(null);
    setPolicyName(politica.nombre);
    setPolicyDescription(politica.descripcion ?? "");
    setToleranciaEntrada(String(politica.toleranciaEntradaMinutos));
    setToleranciaAlmuerzo(String(politica.toleranciaAlmuerzoMinutos));
    setMinimoAlmuerzo(String(politica.minimoMinutosAlmuerzo));
    setReglas(normalizarReglas(politica.dayRules));
    setShowPolicyManagement(true);
    setShowPolicyForm(true);
    setShowAssignmentForm(false);
    setViewingPolicy(null);
  }

  function cerrarFormularioPolitica() {
    if (savingPolicy) return;
    setShowPolicyForm(false);
    setEditingPolicy(null);
    setPolicyError(null);
    setPolicySuccess(null);
  }

  function actualizarRegla(
    dia: DiaSemana,
    campo: keyof ReglaHorario,
    valor: string | boolean
  ) {
    setReglas((actuales) =>
      actuales.map((regla) =>
        regla.dia === dia ? { ...regla, [campo]: valor } : regla
      )
    );
  }

  async function guardarPolitica(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPolicyError(null);
    setPolicySuccess(null);

    if (!policyName.trim()) {
      setPolicyError("Escribe el nombre de la política.");
      return;
    }

    if (reglas.filter((regla) => regla.esLaboral).length === 0) {
      setPolicyError("Selecciona al menos un día laboral.");
      return;
    }

    setSavingPolicy(true);

    try {
      const editing = Boolean(editingPolicy);

      const response = await fetch("/api/horarios/politicas", {
        method: editing ? "PATCH" : "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          editing
            ? {
              id: editingPolicy!.id,
              action: "edit",
              nombre: policyName.trim(),
              descripcion: policyDescription.trim() || null,
              toleranciaEntradaMinutos: Number(toleranciaEntrada),
              toleranciaAlmuerzoMinutos: Number(toleranciaAlmuerzo),
              minimoMinutosAlmuerzo: Number(minimoAlmuerzo),
              dayRules: reglas,
            }
            : {
              nombre: policyName.trim(),
              descripcion: policyDescription.trim() || null,
              toleranciaEntradaMinutos: Number(toleranciaEntrada),
              toleranciaAlmuerzoMinutos: Number(toleranciaAlmuerzo),
              minimoMinutosAlmuerzo: Number(minimoAlmuerzo),
              dayRules: reglas,
            }
        ),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          obtenerError(
            data,
            `No fue posible ${editing ? "actualizar" : "crear"} la política (HTTP ${response.status})`
          )
        );
      }

      setPolicySuccess(
        data.message ??
        (editing
          ? "Política actualizada correctamente."
          : "Política creada correctamente.")
      );

      setShowPolicyForm(false);
      setEditingPolicy(null);
      setReloadKey((current) => current + 1);
    } catch (error) {
      setPolicyError(
        error instanceof Error
          ? error.message
          : "Ocurrió un error al guardar la política."
      );
    } finally {
      setSavingPolicy(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Policy management actions
  // ---------------------------------------------------------------------------

  async function cambiarEstadoPolitica(politica: Politica) {
    const nuevoEstado = !politica.isActive;

    const confirmacion = window.confirm(
      `¿Deseas ${nuevoEstado ? "activar" : "desactivar"} la política "${politica.nombre}"?`
    );

    if (!confirmacion) return;

    setPolicyActionId(politica.id);
    setPolicyError(null);
    setPolicySuccess(null);

    try {
      const response = await fetch("/api/horarios/politicas", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: politica.id,
          action: "toggle",
          isActive: nuevoEstado,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          obtenerError(
            data,
            `No fue posible cambiar el estado (HTTP ${response.status})`
          )
        );
      }

      setPolicySuccess(
        data.message ??
        `Política ${nuevoEstado ? "activada" : "desactivada"} correctamente.`
      );
      setReloadKey((current) => current + 1);
    } catch (error) {
      setPolicyError(
        error instanceof Error
          ? error.message
          : "No fue posible cambiar el estado."
      );
    } finally {
      setPolicyActionId(null);
    }
  }

  async function eliminarPolitica(politica: Politica) {
    if ((politica.activeOrFutureAssignments ?? 0) > 0) {
      setPolicyError(
        "No se puede eliminar una política que tiene asignaciones activas o futuras."
      );
      return;
    }

    const confirmacion = window.confirm(
      `¿Estás seguro de eliminar la política "${politica.nombre}"? Esta acción no se puede deshacer.`
    );

    if (!confirmacion) return;

    setPolicyActionId(politica.id);
    setPolicyError(null);
    setPolicySuccess(null);

    try {
      const response = await fetch("/api/horarios/politicas", {
        method: "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: politica.id }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          obtenerError(
            data,
            `No fue posible eliminar la política (HTTP ${response.status})`
          )
        );
      }

      setPolicySuccess(data.message ?? "Política eliminada correctamente.");
      setViewingPolicy(null);
      setReloadKey((current) => current + 1);
    } catch (error) {
      setPolicyError(
        error instanceof Error
          ? error.message
          : "No fue posible eliminar la política."
      );
    } finally {
      setPolicyActionId(null);
    }
  }

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------

  function renderReglas(reglasPolitica: ReglaHorario[]) {
    return (
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-[var(--color-text-secondary)]">
              <th className="px-3 py-2">Día</th>
              <th className="px-3 py-2">Entrada mañana</th>
              <th className="px-3 py-2">Salida almuerzo</th>
              <th className="px-3 py-2">Entrada almuerzo</th>
              <th className="px-3 py-2">Salida jornada</th>
              <th className="px-3 py-2">Tipo</th>
            </tr>
          </thead>
          <tbody>
            {normalizarReglas(reglasPolitica).map((regla) => (
              <tr
                key={regla.id ?? regla.dia}
                className="border-t border-[var(--color-border)]"
              >
                <td className="px-3 py-2 text-[var(--color-text-primary)]">
                  {DIAS.find((dia) => dia.value === regla.dia)?.label ??
                    regla.dia}
                </td>
                <td className="px-3 py-2 text-[var(--color-text-secondary)]">
                  {regla.esLaboral ? regla.horaEntradaManana : "—"}
                </td>
                <td className="px-3 py-2 text-[var(--color-text-secondary)]">
                  {regla.esLaboral ? regla.horaSalidaAlmuerzo : "—"}
                </td>
                <td className="px-3 py-2 text-[var(--color-text-secondary)]">
                  {regla.esLaboral ? regla.horaEntradaAlmuerzo : "—"}
                </td>
                <td className="px-3 py-2 text-[var(--color-text-secondary)]">
                  {regla.esLaboral ? regla.horaSalidaJornada : "—"}
                </td>
                <td className="px-3 py-2">
                  {regla.esLaboral ? (
                    <span className="text-[var(--color-success)]">Laboral</span>
                  ) : (
                    <span className="text-[var(--color-text-secondary)]">
                      Descanso
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Authorization guard
  // ---------------------------------------------------------------------------

  if (authLoading || !user || !isAdmin) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-4 border-[var(--color-border)] border-t-[var(--color-amber)]" />
          <p className="text-sm text-[var(--color-text-secondary)]">
            Verificando permisos...
          </p>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-8 p-6">
      <header className="space-y-1">
        <h1 className="text-3xl font-bold text-[var(--color-text-primary)]">
          Horarios
        </h1>
        <p className="text-lg text-[var(--color-text-secondary)]">
          Administración de jornadas y horarios del personal
        </p>
        <p className="text-sm capitalize text-[var(--color-text-secondary)]">
          {today}
        </p>
      </header>

      {/* Metrics */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          {
            icon: User,
            value: empleadosConHorario,
            label: "Empleados con horario activo",
            color: "text-[var(--color-accent-text)]",
          },
          {
            icon: CheckCircle,
            value: asignacionesActivas,
            label: "Asignaciones activas",
            color: "text-[var(--color-success)]",
          },
          {
            icon: Calendar,
            value: asignacionesFuturas,
            label: "Asignaciones futuras",
            color: "text-[var(--color-info)]",
          },
          {
            icon: Clock,
            value: asignacionesFinalizadas,
            label: "Asignaciones finalizadas",
            color: "text-[var(--color-text-secondary)]",
          },
        ].map((metric) => (
          <div
            key={metric.label}
            className="flex items-center gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4"
          >
            <metric.icon className={`h-6 w-6 ${metric.color}`} />
            <div>
              <p className="text-2xl font-semibold text-[var(--color-text-primary)]">
                {metric.value}
              </p>
              <p className="text-sm text-[var(--color-text-secondary)]">
                {metric.label}
              </p>
            </div>
          </div>
        ))}
      </section>

      {/* Toolbar */}
      <section className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded border border-[var(--color-border)] bg-[var(--color-bg-main)] px-3 py-2">
          <Search className="h-5 w-5 shrink-0 text-[var(--color-text-secondary)]" />
          <input
            type="text"
            placeholder="Buscar empleado, identificación o política"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="w-full bg-transparent text-[var(--color-text-primary)] outline-none placeholder:text-[var(--color-text-secondary)]"
          />
        </div>

        <select
          value={filterPolitica}
          onChange={(event) => setFilterPolitica(event.target.value)}
          className="rounded border border-[var(--color-border)] bg-[var(--color-bg-main)] px-3 py-2 text-[var(--color-text-primary)]"
        >
          <option value="todos">Todas las políticas</option>
          {politicas.map((politica) => (
            <option key={politica.id} value={politica.id}>
              {politica.nombre}
            </option>
          ))}
        </select>

        <select
          value={filterEstado}
          onChange={(event) => setFilterEstado(event.target.value)}
          className="rounded border border-[var(--color-border)] bg-[var(--color-bg-main)] px-3 py-2 text-[var(--color-text-primary)]"
        >
          <option value="todos">Todos los estados</option>
          <option value="Activa">Activas</option>
          <option value="Futura">Futuras</option>
          <option value="Finalizada">Finalizadas</option>
        </select>

        <button
          type="button"
          onClick={() => setShowPolicyManagement((current) => !current)}
          aria-expanded={showPolicyManagement}
          className="flex items-center justify-center gap-2 rounded border border-[var(--color-amber)] px-4 py-2 font-medium text-[var(--color-accent-text)] hover:bg-[var(--color-amber)]/10"
        >
          <Pencil className="h-4 w-4" />
          {showPolicyManagement ? "Cerrar gestión" : "Gestionar políticas"}
          <ChevronDown
            className={`h-4 w-4 transition-transform ${showPolicyManagement ? "rotate-180" : ""}`}
          />
        </button>

        <button
          type="button"
          onClick={abrirFormularioAsignacion}
          className="flex items-center justify-center gap-2 rounded bg-[var(--color-amber)] px-4 py-2 font-medium text-[var(--color-on-primary)] hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> Asignar horario
        </button>

        <button
          type="button"
          onClick={() => {
            setSearch("");
            setFilterPolitica("todos");
            setFilterEstado("todos");
            setLoading(true);
            setReloadKey((current) => current + 1);
          }}
          className="flex items-center justify-center gap-2 rounded border border-[var(--color-border)] px-4 py-2 text-[var(--color-text-primary)] hover:bg-[var(--color-bg-sidebar)]"
        >
          <RefreshCcw className="h-4 w-4" /> Actualizar
        </button>
      </section>

      {/* Policy messages */}
      {(policyError || policySuccess) && (
        <div
          className={`flex items-start gap-2 rounded border p-3 text-sm ${policyError
            ? "border-[var(--color-error-border)] bg-[var(--color-error-bg)] text-[var(--color-error)]"
            : "border-[var(--color-success-border)] bg-[var(--color-success-bg)] text-[var(--color-success)]"
            }`}
        >
          {policyError ? (
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          ) : (
            <CheckCircle className="mt-0.5 h-4 w-4 shrink-0" />
          )}
          <span>{policyError ?? policySuccess}</span>
          <button
            type="button"
            className="ml-auto"
            onClick={() => {
              setPolicyError(null);
              setPolicySuccess(null);
            }}
          >
            <XCircle className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Policy management */}
      {showPolicyManagement && (
        <section className="space-y-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-[var(--color-text-primary)]">
                Políticas de horario
              </h2>
              <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                Administra las reglas semanales. Las asignaciones históricas
                se conservan; solo las políticas con asignaciones activas o
                futuras tienen bloqueada su edición y eliminación.
              </p>
            </div>

            <button
              type="button"
              onClick={abrirFormularioPolitica}
              className="flex items-center justify-center gap-2 rounded bg-[var(--color-amber)] px-4 py-2 font-medium text-[var(--color-on-primary)] hover:opacity-90"
            >
              <Plus className="h-4 w-4" />
              Crear política
            </button>
          </div>

          {loading ? (
            <p className="py-5 text-center text-sm text-[var(--color-text-secondary)]">
              Cargando políticas...
            </p>
          ) : politicas.length === 0 ? (
            <p className="py-5 text-center text-sm text-[var(--color-text-secondary)]">
              Todavía no hay políticas creadas.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr className="bg-[var(--color-bg-sidebar)] text-left text-sm text-[var(--color-text-primary)]">
                    <th className="px-3 py-3">Política</th>
                    <th className="px-3 py-3">Asignaciones</th>
                    <th className="px-3 py-3">Estado</th>
                    <th className="px-3 py-3">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {politicas.map((politica) => {
                    const tieneAsignacionesBloqueantes =
                      (politica.activeOrFutureAssignments ?? 0) > 0;
                    const procesando = policyActionId === politica.id;

                    return (
                      <tr
                        key={politica.id}
                        className="border-t border-[var(--color-border)]"
                      >
                        <td className="px-3 py-3">
                          <p className="font-medium text-[var(--color-text-primary)]">
                            {politica.nombre}
                          </p>
                          <p className="text-xs text-[var(--color-text-secondary)]">
                            {politica.descripcion || "Sin descripción"}
                          </p>
                        </td>
                        <td className="px-3 py-3 text-sm text-[var(--color-text-secondary)]">
                          {politica._count?.assignments ?? 0}
                        </td>
                        <td className="px-3 py-3">
                          <span
                            className={`rounded px-2 py-1 text-xs font-medium ${politica.isActive
                              ? "bg-[var(--color-success)] text-white"
                              : "bg-gray-600 text-white"
                              }`}
                          >
                            {politica.isActive ? "Activa" : "Inactiva"}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              title="Ver política"
                              onClick={() =>
                                setViewingPolicy(
                                  viewingPolicy?.id === politica.id
                                    ? null
                                    : politica
                                )
                              }
                              className="rounded border border-[var(--color-border)] p-2 text-[var(--color-text-primary)] hover:bg-[var(--color-bg-sidebar)]"
                            >
                              <Eye className="h-4 w-4" />
                            </button>

                            <button
                              type="button"
                              title={
                                tieneAsignacionesBloqueantes
                                  ? "No se puede editar: tiene asignaciones activas o futuras"
                                  : "Editar política"
                              }
                              disabled={
                                tieneAsignacionesBloqueantes || procesando
                              }
                              onClick={() => abrirEdicionPolitica(politica)}
                              className="rounded border border-[var(--color-border)] p-2 text-[var(--color-info)] hover:bg-[var(--color-info-bg)] disabled:cursor-not-allowed disabled:opacity-30"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>

                            <button
                              type="button"
                              title={
                                politica.isActive
                                  ? "Desactivar política"
                                  : "Activar política"
                              }
                              disabled={procesando}
                              onClick={() => cambiarEstadoPolitica(politica)}
                              className="rounded border border-[var(--color-border)] p-2 text-[var(--color-warning)] hover:bg-[var(--color-warning-bg)] disabled:opacity-40"
                            >
                              <Power className="h-4 w-4" />
                            </button>

                            <button
                              type="button"
                              title={
                                tieneAsignacionesBloqueantes
                                  ? "No se puede eliminar: tiene asignaciones activas o futuras"
                                  : "Eliminar política"
                              }
                              disabled={
                                tieneAsignacionesBloqueantes || procesando
                              }
                              onClick={() => eliminarPolitica(politica)}
                              className="rounded border border-[var(--color-border)] p-2 text-[var(--color-error)] hover:bg-[var(--color-error-bg)] disabled:cursor-not-allowed disabled:opacity-30"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {viewingPolicy && (
            <div className="space-y-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-main)] p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-[var(--color-text-primary)]">
                    {viewingPolicy.nombre}
                  </h3>
                  <p className="text-sm text-[var(--color-text-secondary)]">
                    {viewingPolicy.descripcion || "Sin descripción"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setViewingPolicy(null)}
                  className="text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
                >
                  <XCircle className="h-5 w-5" />
                </button>
              </div>

              <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
                <p className="text-[var(--color-text-secondary)]">
                  Tolerancia entrada:{" "}
                  <strong className="text-[var(--color-text-primary)]">
                    {viewingPolicy.toleranciaEntradaMinutos} min
                  </strong>
                </p>
                <p className="text-[var(--color-text-secondary)]">
                  Tolerancia almuerzo:{" "}
                  <strong className="text-[var(--color-text-primary)]">
                    {viewingPolicy.toleranciaAlmuerzoMinutos} min
                  </strong>
                </p>
                <p className="text-[var(--color-text-secondary)]">
                  Almuerzo mínimo:{" "}
                  <strong className="text-[var(--color-text-primary)]">
                    {viewingPolicy.minimoMinutosAlmuerzo} min
                  </strong>
                </p>
              </div>

              {renderReglas(viewingPolicy.dayRules)}
            </div>
          )}
        </section>
      )}

      {/* Policy create/edit form */}
      {showPolicyForm && (
        <section className="space-y-5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-[var(--color-text-primary)]">
                {editingPolicy
                  ? "Editar política de horario"
                  : "Crear política de horario"}
              </h2>
              <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                {editingPolicy
                  ? "Modifica la configuración de esta política."
                  : "Define las reglas semanales que después podrás asignar a los empleados."}
              </p>
            </div>
            <button
              type="button"
              onClick={cerrarFormularioPolitica}
              disabled={savingPolicy}
              aria-label="Cerrar formulario"
              className="rounded p-2 text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-sidebar)]"
            >
              <XCircle className="h-5 w-5" />
            </button>
          </div>

          <form onSubmit={guardarPolitica} className="space-y-6">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label
                  htmlFor="policyName"
                  className="mb-2 block text-sm font-medium text-[var(--color-text-primary)]"
                >
                  Nombre de la política *
                </label>
                <input
                  id="policyName"
                  value={policyName}
                  onChange={(event) => setPolicyName(event.target.value)}
                  maxLength={100}
                  required
                  disabled={savingPolicy}
                  placeholder="Ej. Jornada diurna INTECOAL"
                  className="w-full rounded border border-[var(--color-border)] bg-[var(--color-bg-main)] px-3 py-2 text-[var(--color-text-primary)]"
                />
              </div>
              <div>
                <label
                  htmlFor="policyDescription"
                  className="mb-2 block text-sm font-medium text-[var(--color-text-primary)]"
                >
                  Descripción
                </label>
                <input
                  id="policyDescription"
                  value={policyDescription}
                  onChange={(event) =>
                    setPolicyDescription(event.target.value)
                  }
                  maxLength={500}
                  disabled={savingPolicy}
                  placeholder="Descripción opcional"
                  className="w-full rounded border border-[var(--color-border)] bg-[var(--color-bg-main)] px-3 py-2 text-[var(--color-text-primary)]"
                />
              </div>
            </div>

            <div>
              <h3 className="mb-3 font-semibold text-[var(--color-text-primary)]">
                Tolerancias y pausa de almuerzo
              </h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                {[
                  {
                    id: "toleranciaEntrada",
                    label: "Tolerancia de entrada (minutos)",
                    value: toleranciaEntrada,
                    set: setToleranciaEntrada,
                  },
                  {
                    id: "toleranciaAlmuerzo",
                    label: "Tolerancia de almuerzo (minutos)",
                    value: toleranciaAlmuerzo,
                    set: setToleranciaAlmuerzo,
                  },
                  {
                    id: "minimoAlmuerzo",
                    label: "Almuerzo mínimo (minutos)",
                    value: minimoAlmuerzo,
                    set: setMinimoAlmuerzo,
                  },
                ].map((item) => (
                  <div key={item.id}>
                    <label
                      htmlFor={item.id}
                      className="mb-2 block text-sm text-[var(--color-text-secondary)]"
                    >
                      {item.label}
                    </label>
                    <input
                      id={item.id}
                      type="number"
                      min="0"
                      max="600"
                      value={item.value}
                      onChange={(event) => item.set(event.target.value)}
                      required
                      disabled={savingPolicy}
                      className="w-full rounded border border-[var(--color-border)] bg-[var(--color-bg-main)] px-3 py-2 text-[var(--color-text-primary)]"
                    />
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="mb-3">
                <h3 className="font-semibold text-[var(--color-text-primary)]">
                  Reglas por día
                </h3>
                <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                  Marca los días laborales y configura sus cuatro horas. Los
                  días de descanso no requieren horarios.
                </p>
              </div>

              <div className="space-y-3">
                {reglas.map((regla) => {
                  const dia = DIAS.find(
                    (item) => item.value === regla.dia
                  );

                  return (
                    <div
                      key={regla.dia}
                      className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-main)] p-4"
                    >
                      <div className="mb-4 flex items-center justify-between">
                        <label className="flex cursor-pointer items-center gap-3 font-medium text-[var(--color-text-primary)]">
                          <input
                            type="checkbox"
                            checked={regla.esLaboral}
                            disabled={savingPolicy}
                            onChange={(event) =>
                              actualizarRegla(
                                regla.dia as DiaSemana,
                                "esLaboral",
                                event.target.checked
                              )
                            }
                            className="h-4 w-4 accent-[var(--color-amber)]"
                          />
                          {dia?.label ?? regla.dia}
                        </label>
                        <span
                          className={`text-xs font-medium ${regla.esLaboral
                            ? "text-[var(--color-success)]"
                            : "text-[var(--color-text-secondary)]"
                            }`}
                        >
                          {regla.esLaboral
                            ? "Día laboral"
                            : "Día de descanso"}
                        </span>
                      </div>

                      {regla.esLaboral && (
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                          {[
                            {
                              key: "horaEntradaManana",
                              label: "Entrada mañana",
                            },
                            {
                              key: "horaSalidaAlmuerzo",
                              label: "Salida almuerzo",
                            },
                            {
                              key: "horaEntradaAlmuerzo",
                              label: "Entrada almuerzo",
                            },
                            {
                              key: "horaSalidaJornada",
                              label: "Salida jornada",
                            },
                          ].map((campo) => (
                            <div key={campo.key}>
                              <label className="mb-1 block text-xs text-[var(--color-text-secondary)]">
                                {campo.label}
                              </label>
                              <input
                                type="time"
                                value={
                                  regla[
                                  campo.key as keyof ReglaHorario
                                  ] as string
                                }
                                disabled={savingPolicy}
                                onChange={(event) =>
                                  actualizarRegla(
                                    regla.dia as DiaSemana,
                                    campo.key as keyof ReglaHorario,
                                    event.target.value
                                  )
                                }
                                required
                                className="w-full rounded border border-[var(--color-border)] bg-[var(--color-bg-card)] px-3 py-2 text-[var(--color-text-primary)]"
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {policyError && (
              <div className="flex items-start gap-2 rounded border border-[var(--color-error-border)] bg-[var(--color-error-bg)] p-3 text-sm text-[var(--color-error)]">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{policyError}</span>
              </div>
            )}

            <div className="flex flex-wrap gap-3">
              <button
                type="submit"
                disabled={savingPolicy}
                className="rounded bg-[var(--color-amber)] px-5 py-2 font-medium text-[var(--color-on-primary)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {savingPolicy
                  ? "Guardando..."
                  : editingPolicy
                    ? "Guardar cambios"
                    : "Guardar política"}
              </button>
              <button
                type="button"
                onClick={cerrarFormularioPolitica}
                disabled={savingPolicy}
                className="rounded border border-[var(--color-border)] px-5 py-2 text-[var(--color-text-primary)] disabled:opacity-50"
              >
                Cancelar
              </button>
            </div>
          </form>
        </section>
      )}

      {/* Assignment form */}
      {showAssignmentForm && (
        <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] p-5">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-[var(--color-text-primary)]">
                Nueva asignación
              </h2>
              <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                Selecciona el empleado, la política y la fecha de inicio.
              </p>
            </div>
            <button
              type="button"
              onClick={cerrarFormularioAsignacion}
              disabled={saving}
              aria-label="Cerrar formulario"
              className="rounded p-2 text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-sidebar)]"
            >
              <XCircle className="h-5 w-5" />
            </button>
          </div>

          <form
            onSubmit={asignarHorario}
            className="grid grid-cols-1 gap-4 md:grid-cols-3"
          >
            <div>
              <label
                htmlFor="employeeId"
                className="mb-2 block text-sm font-medium text-[var(--color-text-primary)]"
              >
                Empleado
              </label>
              <select
                id="employeeId"
                value={employeeId}
                onChange={(event) => setEmployeeId(event.target.value)}
                required
                disabled={saving}
                className="w-full rounded border border-[var(--color-border)] bg-[var(--color-bg-main)] px-3 py-2 text-[var(--color-text-primary)]"
              >
                <option value="">Seleccionar empleado</option>
                {empleados
                  .filter((empleado) => empleado.isActive)
                  .map((empleado) => (
                    <option key={empleado.id} value={empleado.id}>
                      {empleado.nombre} {empleado.apellido} —{" "}
                      {empleado.documento}
                    </option>
                  ))}
              </select>
              {empleados.filter((empleado) => empleado.isActive).length ===
                0 && (
                  <p className="mt-1 text-xs text-[var(--color-warning)]">
                    No hay empleados activos disponibles.
                  </p>
                )}
            </div>

            <div>
              <label
                htmlFor="policyId"
                className="mb-2 block text-sm font-medium text-[var(--color-text-primary)]"
              >
                Política de horario
              </label>
              <select
                id="policyId"
                value={policyId}
                onChange={(event) => setPolicyId(event.target.value)}
                required
                disabled={saving}
                className="w-full rounded border border-[var(--color-border)] bg-[var(--color-bg-main)] px-3 py-2 text-[var(--color-text-primary)]"
              >
                <option value="">Seleccionar política</option>
                {politicas
                  .filter((politica) => politica.isActive)
                  .map((politica) => (
                    <option key={politica.id} value={politica.id}>
                      {politica.nombre}
                    </option>
                  ))}
              </select>
              {politicas.filter((politica) => politica.isActive).length ===
                0 && (
                  <p className="mt-1 text-xs text-[var(--color-warning)]">
                    No hay políticas activas disponibles.
                  </p>
                )}
            </div>

            <div>
              <label
                htmlFor="validFrom"
                className="mb-2 block text-sm font-medium text-[var(--color-text-primary)]"
              >
                Fecha de inicio
              </label>
              <input
                id="validFrom"
                type="date"
                value={validFrom}
                min={fechaLocalActual()}
                onChange={(event) => setValidFrom(event.target.value)}
                required
                disabled={saving}
                className="w-full rounded border border-[var(--color-border)] bg-[var(--color-bg-main)] px-3 py-2 text-[var(--color-text-primary)]"
              />
            </div>

            {formError && (
              <div className="flex items-start gap-2 rounded border border-[var(--color-error-border)] bg-[var(--color-error-bg)] p-3 text-sm text-[var(--color-error)] md:col-span-3">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}
            {formSuccess && (
              <div className="flex items-start gap-2 rounded border border-[var(--color-success-border)] bg-[var(--color-success-bg)] p-3 text-sm text-[var(--color-success)] md:col-span-3">
                <CheckCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{formSuccess}</span>
              </div>
            )}

            <div className="flex flex-wrap gap-3 md:col-span-3">
              <button
                type="submit"
                disabled={
                  saving ||
                  empleados.filter((e) => e.isActive).length === 0 ||
                  politicas.filter((p) => p.isActive).length === 0
                }
                className="rounded bg-[var(--color-amber)] px-5 py-2 font-medium text-[var(--color-on-primary)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? "Guardando..." : "Guardar asignación"}
              </button>
              <button
                type="button"
                onClick={cerrarFormularioAsignacion}
                disabled={saving}
                className="rounded border border-[var(--color-border)] px-5 py-2 text-[var(--color-text-primary)] disabled:opacity-50"
              >
                Cerrar
              </button>
            </div>
          </form>

          <p className="mt-4 text-xs text-[var(--color-text-secondary)]">
            Si el empleado tiene una asignación vigente, esta finalizará
            automáticamente el día anterior al inicio de la nueva. Las
            asignaciones históricas se conservan.
          </p>
        </section>
      )}

      {/* Loading and errors */}
      {loading && (
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] p-8 text-center text-[var(--color-text-secondary)]">
          Cargando horarios...
        </div>
      )}

      {!loading && fetchError && (
        <div className="flex items-start gap-3 rounded-lg border border-[var(--color-error-border)] bg-[var(--color-error-bg)] p-4 text-[var(--color-error)]">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-medium">No fue posible cargar el módulo.</p>
            <p className="mt-1 text-sm">{fetchError}</p>
            <button
              type="button"
              onClick={() => {
                setLoading(true);
                setReloadKey((current) => current + 1);
              }}
              className="mt-3 underline"
            >
              Intentar nuevamente
            </button>
          </div>
        </div>
      )}

      {/* Assignments table */}
      {!loading && !fetchError && (
        <section className="overflow-x-auto rounded-lg border border-[var(--color-border)]">
          <table className="min-w-full bg-[var(--color-bg-card)]">
            <thead>
              <tr className="bg-[var(--color-bg-sidebar)] text-left text-[var(--color-text-primary)]">
                <th className="px-4 py-3">Empleado</th>
                <th className="px-4 py-3">Identificación</th>
                <th className="px-4 py-3">Política</th>
                <th className="px-4 py-3">Inicio</th>
                <th className="px-4 py-3">Finalización</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3">Detalle</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((horario, index) => {
                const isExpanded =
                  expandedAssignmentId === horario.assignmentId;

                return (
                  <Fragment key={horario.assignmentId}>
                    <tr
                      className={`border-t border-[var(--color-border)] ${index % 2 === 0
                        ? "bg-[var(--color-bg-main)]"
                        : "bg-[var(--color-bg-card)]"
                        }`}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <Avatar name={horario.name} />
                          <div>
                            <p className="font-medium text-[var(--color-text-primary)]">
                              {horario.name}
                            </p>
                            <p className="text-xs text-[var(--color-text-secondary)]">
                              {horario.cargo || "Sin cargo"}
                              {!horario.employeeActive &&
                                " · Empleado inactivo"}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-[var(--color-text-secondary)]">
                        {horario.id}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-[var(--color-text-primary)]">
                          {horario.policy.nombre}
                        </p>
                        {!horario.policy.isActive && (
                          <p className="text-xs text-[var(--color-warning)]">
                            Política inactiva
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-[var(--color-text-secondary)]">
                        {formatearFecha(horario.validFrom)}
                      </td>
                      <td className="px-4 py-3 text-sm text-[var(--color-text-secondary)]">
                        {formatearFecha(horario.validUntil)}
                      </td>
                      <td className="px-4 py-3">
                        <EstadoBadge estado={horario.estado} />
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          aria-expanded={isExpanded}
                          onClick={() =>
                            setExpandedAssignmentId(
                              isExpanded ? null : horario.assignmentId
                            )
                          }
                          className="flex items-center gap-2 whitespace-nowrap text-sm text-[var(--color-accent-text)]"
                        >
                          {isExpanded ? "Ocultar reglas" : "Ver reglas"}
                          <ChevronDown
                            className={`h-4 w-4 transition-transform ${isExpanded ? "rotate-180" : ""
                              }`}
                          />
                        </button>
                      </td>
                    </tr>

                    {isExpanded && (
                      <tr className="border-t border-[var(--color-border)] bg-[var(--color-bg-main)]">
                        <td colSpan={7} className="p-4">
                          <div className="space-y-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <h3 className="font-semibold text-[var(--color-text-primary)]">
                                Reglas de {horario.policy.nombre}
                              </h3>
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedAssignmentId(null)
                                }
                                className="text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
                              >
                                Cerrar
                              </button>
                            </div>

                            <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
                              <p className="text-[var(--color-text-secondary)]">
                                Tolerancia de entrada:{" "}
                                <strong className="text-[var(--color-text-primary)]">
                                  {horario.toleranciaPersonalizadaMin ??
                                    horario.policy.toleranciaEntradaMinutos}{" "}
                                  min
                                </strong>
                              </p>
                              <p className="text-[var(--color-text-secondary)]">
                                Tolerancia de almuerzo:{" "}
                                <strong className="text-[var(--color-text-primary)]">
                                  {horario.policy.toleranciaAlmuerzoMinutos} min
                                </strong>
                              </p>
                              <p className="text-[var(--color-text-secondary)]">
                                Almuerzo mínimo:{" "}
                                <strong className="text-[var(--color-text-primary)]">
                                  {horario.policy.minimoMinutosAlmuerzo} min
                                </strong>
                              </p>
                            </div>

                            {renderReglas(horario.reglas)}

                            {horario.policy.descripcion && (
                              <p className="text-sm text-[var(--color-text-secondary)]">
                                {horario.policy.descripcion}
                              </p>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}

              {filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-10 text-center text-[var(--color-text-secondary)]"
                  >
                    {horarios.length === 0
                      ? "Todavía no existen asignaciones de horario."
                      : "No hay asignaciones que coincidan con los filtros."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      )}

      {/* Information */}
      <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4">
          <h2 className="mb-2 font-semibold text-[var(--color-text-primary)]">
            Momentos de marcación
          </h2>
          <ul className="list-inside list-disc space-y-1 text-sm text-[var(--color-text-secondary)]">
            <li>ENTRADA_MANANA — inicio de la jornada.</li>
            <li>SALIDA_ALMUERZO — inicio de la pausa.</li>
            <li>ENTRADA_ALMUERZO — regreso de la pausa.</li>
            <li>SALIDA_JORNADA — finalización de la jornada.</li>
          </ul>
        </div>
        <div className="rounded border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4">
          <h2 className="mb-2 font-semibold text-[var(--color-text-primary)]">
            Historial de asignaciones
          </h2>
          <p className="text-sm text-[var(--color-text-secondary)]">
            Las asignaciones anteriores se conservan con sus fechas de
            vigencia. Al crear una nueva asignación, el sistema cierra la
            anterior el día previo a su inicio, cuando corresponde.
          </p>
        </div>
      </section>
    </div>
  );
}
