
"use client";

import React, { useEffect, useState } from "react";
import {
  User,
  Search,
  Plus,
  CheckCircle,
  XCircle,
  X,
  Loader2,
  AlertCircle,
} from "lucide-react";

type Role = "ADMIN" | "SUPERVISOR" | "EMPLEADO" | "KIOSCO";

type Employee = {
  id: string;
  documento: string;
  nombre: string;
  apellido: string;
  email: string;
  cargo: string | null;
  role: Role;
  isActive: boolean;
  createdAt: string;
};

const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Administrador",
  SUPERVISOR: "Supervisor",
  EMPLEADO: "Empleado",
  KIOSCO: "Kiosco",
};

type EmployeesResponse = {
  employees: Employee[];
};

type CreateResponse = {
  employee?: Employee;
  error?: string;
  message?: string;
};

type UpdateResponse = {
  employee?: Employee;
  error?: string;
};

type MeResponse = {
  id?: string;
  role?: Role;
};

const Avatar = ({ name }: { name: string }) => {
  const initials = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-amber)] text-sm font-medium text-[var(--color-on-primary)]">
      {initials || "?"}
    </div>
  );
};

export default function EmpleadosPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("todos");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [today, setToday] = useState("");
  const [callerRole, setCallerRole] = useState<Role | null>(null);
  const [callerId, setCallerId] = useState<string | null>(null);

  // Estado para el modal de restablecimiento de contraseña
  const [resetTarget, setResetTarget] = useState<{ id: string; nombre: string } | null>(null);
  const [resetPwd, setResetPwd] = useState("");
  const [resetPwdConfirm, setResetPwdConfirm] = useState("");
  const [resetSubmitting, setResetSubmitting] = useState(false);
  const [resetError, setResetError] = useState("");

  const [form, setForm] = useState({
    documento: "",
    nombre: "",
    apellido: "",
    email: "",
    cargo: "",
    password: "",
    role: "EMPLEADO" as Role,
  });

  // Fecha local
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

  // Sesión del usuario autenticado
  useEffect(() => {
    async function loadSession() {
      try {
        const res = await fetch("/api/auth/me", {
          credentials: "include",
          cache: "no-store",
        });

        if (!res.ok) return;

        const data: unknown = await res.json();

        if (typeof data === "object" && data !== null) {
          const me = data as MeResponse;
          if (typeof me.role === "string") setCallerRole(me.role);
          if (typeof me.id === "string") setCallerId(me.id);
        }
      } catch {
        // callerRole queda null; los controles de rol no se muestran
      }
    }

    void loadSession();
  }, []);

  // Lista de empleados
  useEffect(() => {
    const controller = new AbortController();

    async function loadEmployees() {
      try {
        const response = await fetch("/api/empleados", {
          method: "GET",
          credentials: "include",
          cache: "no-store",
          signal: controller.signal,
        });

        const data: unknown = await response.json();

        if (!response.ok) {
          const message =
            typeof data === "object" &&
              data !== null &&
              "error" in data &&
              typeof (data as { error: string }).error === "string"
              ? (data as { error: string }).error
              : "No fue posible cargar los empleados";

          throw new Error(message);
        }

        const result = data as EmployeesResponse;
        setEmployees(result.employees);
        setError("");
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          return;
        }

        setError(
          err instanceof Error
            ? err.message
            : "Error al consultar los empleados"
        );
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void loadEmployees();

    return () => controller.abort();
  }, []);

  const filtered = employees.filter((employee) => {
    const fullName =
      `${employee.nombre} ${employee.apellido}`.toLowerCase();

    const query = search.toLowerCase();

    const matchesSearch =
      fullName.includes(query) ||
      employee.documento.toLowerCase().includes(query) ||
      employee.email.toLowerCase().includes(query);

    const matchesFilter =
      filter === "todos" ||
      (filter === "activos" && employee.isActive) ||
      (filter === "inactivos" && !employee.isActive);

    return matchesSearch && matchesFilter;
  });

  const total = employees.length;
  const activos = employees.filter((employee) => employee.isActive).length;
  const inactivos = total - activos;

  function updateField(field: keyof typeof form, value: string) {
    setForm((previous) => ({
      ...previous,
      [field]: value,
    }));
  }

  function closeForm() {
    if (submitting) return;

    setShowForm(false);
    setForm({
      documento: "",
      nombre: "",
      apellido: "",
      email: "",
      cargo: "",
      password: "",
      role: "EMPLEADO",
    });
  }

  async function toggleEmployee(id: string, current: boolean) {
    const newState = !current;
    const action = newState ? "reactivar" : "desactivar";
    const confirmation = newState
      ? "¿Estás seguro de que deseas reactivar este empleado?"
      : "¿Estás seguro de que deseas desactivar este empleado?";

    if (!window.confirm(confirmation)) return;

    setError("");
    setSuccess("");

    try {
      const response = await fetch("/api/empleados", {
        method: "PATCH",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id,
          isActive: newState,
        }),
      });

      const data: UpdateResponse = await response.json();

      if (!response.ok || !data.employee) {
        throw new Error(
          data.error || "No fue posible actualizar el estado del empleado"
        );
      }

      setEmployees((previous) =>
        previous.map((employee) =>
          employee.id === id ? data.employee! : employee
        )
      );

      setSuccess(
        newState
          ? "Empleado reactivado correctamente."
          : "Empleado desactivado correctamente."
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : `No fue posible ${action} el empleado`
      );
    }
  }

  async function changeRole(id: string, newRole: Role) {
    if (!window.confirm(`¿Cambiar el rol a ${ROLE_LABELS[newRole]}?`)) return;

    setError("");
    setSuccess("");

    try {
      const response = await fetch("/api/empleados", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, role: newRole }),
      });

      const data: UpdateResponse = await response.json();

      if (!response.ok || !data.employee) {
        throw new Error(data.error || "No fue posible cambiar el rol");
      }

      setEmployees((previous) =>
        previous.map((emp) => (emp.id === id ? data.employee! : emp))
      );

      setSuccess(`Rol actualizado a ${ROLE_LABELS[newRole]}.`);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Error al cambiar el rol"
      );
    }
  }

  async function handleCreateEmployee(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setError("");
    setSuccess("");
    setSubmitting(true);

    try {
      const response = await fetch("/api/empleados", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(form),
      });

      const data: CreateResponse = await response.json();

      if (!response.ok || !data.employee) {
        throw new Error(
          data.error || "No fue posible registrar el empleado"
        );
      }

      const createdEmployee = data.employee;

      setEmployees((previous) =>
        [...previous, createdEmployee].sort((a, b) =>
          a.nombre.localeCompare(b.nombre, "es")
        )
      );

      setSuccess("Empleado registrado correctamente.");

      setForm({
        documento: "",
        nombre: "",
        apellido: "",
        email: "",
        cargo: "",
        password: "",
        role: "EMPLEADO",
      });

      setShowForm(false);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Ocurrió un error al registrar el empleado"
      );
    } finally {
      setSubmitting(false);
    }
  }

  function openResetModal(id: string, nombre: string) {
    setResetTarget({ id, nombre });
    setResetPwd("");
    setResetPwdConfirm("");
    setResetError("");
  }

  function closeResetModal() {
    if (resetSubmitting) return;
    setResetTarget(null);
    setResetPwd("");
    setResetPwdConfirm("");
    setResetError("");
  }

  async function handleResetPassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!resetTarget) return;

    setResetError("");

    if (resetPwd.length < 8) {
      setResetError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }

    if (resetPwd !== resetPwdConfirm) {
      setResetError("Las contraseñas no coinciden.");
      return;
    }

    setResetSubmitting(true);

    try {
      const response = await fetch("/api/empleados", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: resetTarget.id, newPassword: resetPwd }),
      });

      const data: UpdateResponse = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "No fue posible restablecer la contraseña");
      }

      setSuccess(`Contraseña restablecida para ${resetTarget.nombre}.`);
      setError("");
      closeResetModal();
    } catch (err) {
      setResetError(
        err instanceof Error ? err.message : "Error al restablecer la contraseña"
      );
    } finally {
      setResetSubmitting(false);
    }
  }

  // Roles que el caller puede asignar
  const assignableRoles: Role[] =
    callerRole === "ADMIN"
      ? ["ADMIN", "SUPERVISOR", "EMPLEADO"]
      : callerRole === "SUPERVISOR"
        ? ["SUPERVISOR", "EMPLEADO"]
        : [];

  return (
    <div className="space-y-8 p-6">
      <header className="space-y-1">
        <h1 className="text-3xl font-bold text-[var(--color-text-primary)]">
          Empleados
        </h1>

        <p className="text-lg text-[var(--color-text-secondary)]">
          Consulta y gestión del personal
        </p>

        <p className="text-sm capitalize text-[var(--color-text-secondary)]">
          {today}
        </p>
      </header>

      {error && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-lg border border-[var(--color-error-border)] bg-[var(--color-error-bg)] p-3 text-sm text-[var(--color-error)]"
        >
          <AlertCircle className="h-5 w-5 shrink-0" />
          {error}
        </div>
      )}

      {success && (
        <div
          role="status"
          className="rounded-lg border border-[var(--color-success-border)] bg-[var(--color-success-bg)] p-3 text-sm text-[var(--color-success)]"
        >
          {success}
        </div>
      )}

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="flex items-center space-x-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4">
          <User className="h-6 w-6 text-[var(--color-accent-text)]" />
          <div>
            <p className="text-2xl font-semibold text-[var(--color-text-primary)]">
              {total}
            </p>
            <p className="text-sm text-[var(--color-text-secondary)]">
              Total de empleados
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4">
          <CheckCircle className="h-6 w-6 text-[var(--color-success)]" />
          <div>
            <p className="text-2xl font-semibold text-[var(--color-text-primary)]">
              {activos}
            </p>
            <p className="text-sm text-[var(--color-text-secondary)]">
              Empleados activos
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4">
          <XCircle className="h-6 w-6 text-[var(--color-error)]" />
          <div>
            <p className="text-2xl font-semibold text-[var(--color-text-primary)]">
              {inactivos}
            </p>
            <p className="text-sm text-[var(--color-text-secondary)]">
              Empleados inactivos
            </p>
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex w-full items-center space-x-2 rounded border border-[var(--color-border)] bg-[var(--color-bg-main)] px-3 py-2 sm:max-w-md">
          <Search className="h-5 w-5 shrink-0 text-[var(--color-text-secondary)]" />

          <input
            type="text"
            placeholder="Buscar por nombre, identificación o correo"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="w-full bg-transparent text-[var(--color-text-primary)] outline-none placeholder:text-[var(--color-text-secondary)]"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <select
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            className="rounded border border-[var(--color-border)] bg-[var(--color-bg-main)] px-3 py-2 text-[var(--color-text-primary)]"
          >
            <option value="todos">Todos</option>
            <option value="activos">Activos</option>
            <option value="inactivos">Inactivos</option>
          </select>

          <button
            type="button"
            onClick={() => {
              setError("");
              setSuccess("");
              setShowForm(true);
            }}
            className="flex items-center gap-2 rounded bg-[var(--color-amber)] px-4 py-2 font-medium text-[var(--color-on-primary)] transition-opacity hover:opacity-90"
          >
            <Plus className="h-4 w-4" />
            Nuevo empleado
          </button>
        </div>
      </section>

      {showForm && (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-5">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-xl font-semibold text-[var(--color-text-primary)]">
              Registrar empleado
            </h2>

            <button
              type="button"
              onClick={closeForm}
              disabled={submitting}
              className="rounded p-2 text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-sidebar)]"
              aria-label="Cerrar formulario"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <form
            onSubmit={handleCreateEmployee}
            className="grid grid-cols-1 gap-4 sm:grid-cols-2"
          >
            <div>
              <label className="mb-1 block text-sm text-[var(--color-text-secondary)]">
                Identificación *
              </label>

              <input
                required
                maxLength={50}
                value={form.documento}
                onChange={(event) =>
                  updateField("documento", event.target.value)
                }
                className="w-full rounded border border-[var(--color-border)] bg-[var(--color-bg-main)] px-3 py-2 text-[var(--color-text-primary)]"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm text-[var(--color-text-secondary)]">
                Correo electrónico *
              </label>

              <input
                required
                type="email"
                maxLength={254}
                value={form.email}
                onChange={(event) =>
                  updateField("email", event.target.value)
                }
                className="w-full rounded border border-[var(--color-border)] bg-[var(--color-bg-main)] px-3 py-2 text-[var(--color-text-primary)]"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm text-[var(--color-text-secondary)]">
                Nombre *
              </label>

              <input
                required
                maxLength={100}
                value={form.nombre}
                onChange={(event) =>
                  updateField("nombre", event.target.value)
                }
                className="w-full rounded border border-[var(--color-border)] bg-[var(--color-bg-main)] px-3 py-2 text-[var(--color-text-primary)]"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm text-[var(--color-text-secondary)]">
                Apellido *
              </label>

              <input
                required
                maxLength={100}
                value={form.apellido}
                onChange={(event) =>
                  updateField("apellido", event.target.value)
                }
                className="w-full rounded border border-[var(--color-border)] bg-[var(--color-bg-main)] px-3 py-2 text-[var(--color-text-primary)]"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm text-[var(--color-text-secondary)]">
                Cargo
              </label>

              <input
                maxLength={150}
                value={form.cargo}
                onChange={(event) =>
                  updateField("cargo", event.target.value)
                }
                className="w-full rounded border border-[var(--color-border)] bg-[var(--color-bg-main)] px-3 py-2 text-[var(--color-text-primary)]"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm text-[var(--color-text-secondary)]">
                Contraseña inicial *
              </label>

              <input
                required
                type="password"
                minLength={8}
                autoComplete="new-password"
                value={form.password}
                onChange={(event) =>
                  updateField("password", event.target.value)
                }
                className="w-full rounded border border-[var(--color-border)] bg-[var(--color-bg-main)] px-3 py-2 text-[var(--color-text-primary)]"
              />

              <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
                Mínimo 8 caracteres.
              </p>
            </div>

            {assignableRoles.length > 0 && (
              <div>
                <label className="mb-1 block text-sm text-[var(--color-text-secondary)]">
                  Rol en el sistema *
                </label>

                <select
                  value={form.role}
                  onChange={(event) =>
                    updateField("role", event.target.value)
                  }
                  className="w-full rounded border border-[var(--color-border)] bg-[var(--color-bg-main)] px-3 py-2 text-[var(--color-text-primary)]"
                >
                  {assignableRoles.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3 pt-3 sm:col-span-2">
              <button
                type="submit"
                disabled={submitting}
                className="flex items-center gap-2 rounded bg-[var(--color-amber)] px-4 py-2 font-medium text-[var(--color-on-primary)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting && (
                  <Loader2 className="h-4 w-4 animate-spin" />
                )}

                {submitting ? "Registrando..." : "Registrar empleado"}
              </button>

              <button
                type="button"
                onClick={closeForm}
                disabled={submitting}
                className="rounded border border-[var(--color-border)] px-4 py-2 text-[var(--color-text-secondary)] disabled:opacity-50"
              >
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      <section className="overflow-x-auto rounded-lg border border-[var(--color-border)]">
        <table className="min-w-full bg-[var(--color-bg-card)]">
          <thead>
            <tr className="bg-[var(--color-bg-sidebar)] text-[var(--color-text-primary)]">
              <th className="px-4 py-3 text-left">Empleado</th>
              <th className="px-4 py-3 text-left">Identificación</th>
              <th className="px-4 py-3 text-left">Correo</th>
              <th className="px-4 py-3 text-left">Cargo</th>
              <th className="px-4 py-3 text-left">Rol</th>
              <th className="px-4 py-3 text-left">Horario</th>
              <th className="px-4 py-3 text-left">Estado / Acciones</th>
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-10 text-center text-[var(--color-text-secondary)]"
                >
                  <Loader2 className="mx-auto mb-2 h-6 w-6 animate-spin" />
                  Cargando empleados...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-10 text-center text-[var(--color-text-secondary)]"
                >
                  {employees.length === 0
                    ? "No hay empleados registrados."
                    : "No se encontraron empleados con esos criterios."}
                </td>
              </tr>
            ) : (
              filtered.map((employee, index) => (
                <tr
                  key={employee.id}
                  className={`${index % 2 === 0
                    ? "bg-[var(--color-bg-main)]"
                    : "bg-[var(--color-bg-card)]"
                    } border-t border-[var(--color-border)] transition-colors hover:bg-[var(--color-bg-sidebar-hover)]`}
                >
                  <td className="px-4 py-3 text-[var(--color-text-primary)]">
                    <div className="flex items-center gap-3">
                      <Avatar
                        name={`${employee.nombre} ${employee.apellido}`}
                      />

                      <span className="font-medium">
                        {employee.nombre} {employee.apellido}
                      </span>
                    </div>
                  </td>

                  <td className="px-4 py-3 text-[var(--color-text-secondary)]">
                    {employee.documento}
                  </td>

                  <td className="px-4 py-3 text-[var(--color-text-secondary)]">
                    {employee.email}
                  </td>

                  <td className="px-4 py-3 text-[var(--color-text-secondary)]">
                    {employee.cargo || "No definido"}
                  </td>

                  <td className="px-4 py-3 text-[var(--color-text-secondary)]">
                    {assignableRoles.length > 0 &&
                    employee.id !== callerId ? (
                      <select
                        value={employee.role}
                        onChange={(event) =>
                          void changeRole(
                            employee.id,
                            event.target.value as Role
                          )
                        }
                        className="rounded border border-[var(--color-border)] bg-[var(--color-bg-main)] px-2 py-1 text-sm text-[var(--color-text-primary)]"
                      >
                        {assignableRoles.map((r) => (
                          <option key={r} value={r}>
                            {ROLE_LABELS[r]}
                          </option>
                        ))}
                        {/* Si el rol actual no está en las opciones asignables, mostrarlo de solo lectura */}
                        {!assignableRoles.includes(employee.role) && (
                          <option value={employee.role} disabled>
                            {ROLE_LABELS[employee.role] ?? employee.role}
                          </option>
                        )}
                      </select>
                    ) : (
                      <span>
                        {ROLE_LABELS[employee.role] ?? employee.role}
                      </span>
                    )}
                  </td>

                  <td className="px-4 py-3 text-[var(--color-text-secondary)]">
                    Sin asignar
                  </td>

                  <td className="px-4 py-3">
                    <div className="flex flex-col items-start gap-2">
                      {employee.isActive ? (
                        <span className="rounded bg-[var(--color-success)] px-2 py-1 text-xs text-white">
                          Activo
                        </span>
                      ) : (
                        <span className="rounded bg-[var(--color-error)] px-2 py-1 text-xs text-white">
                          Inactivo
                        </span>
                      )}

                      {employee.id !== callerId && (
                        <button
                          type="button"
                          onClick={() =>
                            void toggleEmployee(
                              employee.id,
                              employee.isActive
                            )
                          }
                          className={`rounded px-3 py-1.5 text-xs font-medium transition-opacity hover:opacity-80 ${employee.isActive
                            ? "bg-[var(--color-error-bg)] text-[var(--color-error)]"
                            : "bg-[var(--color-success-bg)] text-[var(--color-success)]"
                            }`}
                        >
                          {employee.isActive ? "Desactivar" : "Reactivar"}
                        </button>
                      )}

                      {/* Restablecer contraseña — solo visible para ADMIN, no sobre sí mismo */}
                      {callerRole === "ADMIN" && employee.id !== callerId && (
                        <button
                          type="button"
                          onClick={() =>
                            openResetModal(
                              employee.id,
                              `${employee.nombre} ${employee.apellido}`
                            )
                          }
                          className="rounded px-3 py-1.5 text-xs font-medium bg-[var(--color-info-bg)] text-[var(--color-info)] transition-opacity hover:opacity-80"
                        >
                          Restablecer contraseña
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      {/* Modal de restablecimiento de contraseña — solo ADMIN */}
      {resetTarget && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="reset-pwd-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
        >
          <div className="w-full max-w-sm rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2
                id="reset-pwd-title"
                className="text-lg font-semibold text-[var(--color-text-primary)]"
              >
                Restablecer contraseña
              </h2>

              <button
                type="button"
                onClick={closeResetModal}
                disabled={resetSubmitting}
                aria-label="Cerrar"
                className="rounded p-1 text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-sidebar)]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="mb-4 text-sm text-[var(--color-text-secondary)]">
              Nueva contraseña para{" "}
              <span className="font-medium text-[var(--color-text-primary)]">
                {resetTarget.nombre}
              </span>
              .
            </p>

            {resetError && (
              <div
                role="alert"
                className="mb-3 flex items-center gap-2 rounded border border-[var(--color-error-border)] bg-[var(--color-error-bg)] p-2 text-sm text-[var(--color-error)]"
              >
                <AlertCircle className="h-4 w-4 shrink-0" />
                {resetError}
              </div>
            )}

            <form onSubmit={(e) => void handleResetPassword(e)} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm text-[var(--color-text-secondary)]">
                  Nueva contraseña *
                </label>

                <input
                  required
                  type="password"
                  minLength={8}
                  autoComplete="new-password"
                  value={resetPwd}
                  onChange={(e) => setResetPwd(e.target.value)}
                  disabled={resetSubmitting}
                  className="w-full rounded border border-[var(--color-border)] bg-[var(--color-bg-main)] px-3 py-2 text-[var(--color-text-primary)] disabled:opacity-50"
                />

                <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
                  Mínimo 8 caracteres.
                </p>
              </div>

              <div>
                <label className="mb-1 block text-sm text-[var(--color-text-secondary)]">
                  Confirmar contraseña *
                </label>

                <input
                  required
                  type="password"
                  minLength={8}
                  autoComplete="new-password"
                  value={resetPwdConfirm}
                  onChange={(e) => setResetPwdConfirm(e.target.value)}
                  disabled={resetSubmitting}
                  className="w-full rounded border border-[var(--color-border)] bg-[var(--color-bg-main)] px-3 py-2 text-[var(--color-text-primary)] disabled:opacity-50"
                />
              </div>

              <div className="flex items-center gap-3 pt-1">
                <button
                  type="submit"
                  disabled={resetSubmitting}
                  className="flex items-center gap-2 rounded bg-[var(--color-amber)] px-4 py-2 text-sm font-medium text-[var(--color-on-primary)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {resetSubmitting && (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  )}
                  {resetSubmitting ? "Guardando..." : "Guardar contraseña"}
                </button>

                <button
                  type="button"
                  onClick={closeResetModal}
                  disabled={resetSubmitting}
                  className="rounded border border-[var(--color-border)] px-4 py-2 text-sm text-[var(--color-text-secondary)] disabled:opacity-50"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
