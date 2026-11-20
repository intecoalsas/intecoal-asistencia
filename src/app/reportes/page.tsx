
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatMinutos } from "@/lib/utils";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Download,
  FileSpreadsheet,
  RefreshCw,
  Search,
  Users,
  XCircle,
} from "lucide-react";

type EstadoPuntualidad =
  | "Puntual"
  | "Tarde"
  | "Sin registro"
  | "Sin horario";

type Puntualidad = {
  estado: EstadoPuntualidad;
  horaProgramada: string | null;
  minutosRetraso: number;
};

type Registro = {
  name: string;
  id: string;
  fechaLaboral: string;
  entradaManana: string | null;
  salidaAlmuerzo: string | null;
  entradaAlmuerzo: string | null;
  salidaJornada: string | null;
  estado: "Completo" | "Incompleto";
  puntualidadEntradaManana: Puntualidad;
  puntualidadEntradaAlmuerzo: Puntualidad;
  esImpuntual: boolean;
  esNoLaborableCalendario?: boolean;
  novedad?: { id: string; tipo: string } | null;
};

const TIPO_NOVEDAD_LABEL: Record<string, string> = {
  VACACIONES: "Vacaciones",
  INCAPACIDAD: "Incapacidad",
  PERMISO: "Permiso",
  LICENCIA: "Licencia",
  OTRO: "Otro",
};

/** Etiqueta de calendario del día: festivo o novedad autorizada. */
function obtenerEtiquetaCalendario(registro: Registro): string | null {
  if (registro.esNoLaborableCalendario) return "Festivo";
  if (registro.novedad) {
    return `Novedad: ${TIPO_NOVEDAD_LABEL[registro.novedad.tipo] ?? registro.novedad.tipo}`;
  }
  return null;
}

type ApiResponse = {
  registros: Registro[];
  role: "ADMIN" | "EMPLEADO" | "SUPERVISOR";
  error?: string;
};

type Periodo = "hoy" | "semana" | "mes" | "personalizado";

const MARCAS = [
  { key: "entradaManana", label: "Entrada mañana" },
  { key: "salidaAlmuerzo", label: "Salida almuerzo" },
  { key: "entradaAlmuerzo", label: "Entrada almuerzo" },
  { key: "salidaJornada", label: "Salida jornada" },
] as const;

function obtenerFechaBogota(): string {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const obtener = (tipo: string) =>
    partes.find((parte) => parte.type === tipo)?.value ?? "";

  return `${obtener("year")}-${obtener("month")}-${obtener("day")}`;
}

function sumarDias(fecha: string, dias: number): string {
  const [year, month, day] = fecha.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + dias));

  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function obtenerInicioSemana(fecha: string): string {
  const [year, month, day] = fecha.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const diaSemana = date.getUTCDay();
  const diferencia = diaSemana === 0 ? -6 : 1 - diaSemana;

  return sumarDias(fecha, diferencia);
}

function formatearFecha(fecha: string): string {
  if (!fecha) return "—";

  const [year, month, day] = fecha.split("-");

  if (!year || !month || !day) return fecha;

  return `${day}/${month}/${year}`;
}

function obtenerMarcasRegistradas(registro: Registro): number {
  return MARCAS.filter(({ key }) => Boolean(registro[key])).length;
}

function obtenerIncidencias(registro: Registro): string[] {
  const incidencias: string[] = [];

  if (registro.puntualidadEntradaManana.estado === "Tarde") {
    incidencias.push(
      `Llegada tarde en la mañana (${formatMinutos(registro.puntualidadEntradaManana.minutosRetraso)})`
    );
  }

  if (registro.puntualidadEntradaAlmuerzo.estado === "Tarde") {
    incidencias.push(
      `Regreso tarde del almuerzo (${formatMinutos(registro.puntualidadEntradaAlmuerzo.minutosRetraso)})`
    );
  }

  MARCAS.forEach(({ key, label }) => {
    if (!registro[key]) {
      incidencias.push(`Falta: ${label}`);
    }
  });

  return incidencias;
}

function obtenerEstadoGeneral(registro: Registro): string {
  if (registro.estado === "Incompleto" && registro.esImpuntual) {
    return "Tarde / Incompleto";
  }

  if (registro.estado === "Incompleto") {
    return "Incompleto";
  }

  if (registro.esImpuntual) {
    return "Tarde";
  }

  const evaluaciones = [
    registro.puntualidadEntradaManana.estado,
    registro.puntualidadEntradaAlmuerzo.estado,
  ];

  if (evaluaciones.includes("Puntual")) {
    return "Puntual";
  }

  if (evaluaciones.includes("Sin horario")) {
    return "Sin horario";
  }

  return "Sin evaluación";
}

function obtenerColorEstado(estado: string): string {
  if (estado.includes("Incompleto")) {
    return "border-[var(--color-error-border)] bg-[var(--color-error-bg)] text-[var(--color-error)]";
  }

  if (estado === "Tarde") {
    return "border-[var(--color-primary)] bg-[var(--color-warning-bg)] text-[var(--color-warning)]";
  }

  if (estado === "Puntual") {
    return "border-[var(--color-success-border)] bg-[var(--color-success-bg)] text-[var(--color-success)]";
  }

  return "border-[var(--color-border)] bg-[var(--color-bg-muted)] text-[var(--color-text-secondary)]";
}

function escaparCSV(valor: string | number | null | undefined): string {
  const texto = String(valor ?? "");
  return `"${texto.replace(/"/g, '""')}"`;
}

export default function ReportesPage() {
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [periodo, setPeriodo] = useState<Periodo>("mes");

  // Se inicializan vacíos para evitar calcular la fecha durante el prerender.
  const [fechaActual, setFechaActual] = useState("");
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");

  const [ultimaActualizacion, setUltimaActualizacion] = useState("");

  useEffect(() => {
    const hoy = obtenerFechaBogota();

    setFechaActual(hoy);
    setFechaDesde(hoy);
    setFechaHasta(hoy);
  }, []);

  useEffect(() => {
    let activo = true;

    async function cargarDatos() {
      try {
        const response = await fetch("/api/marcaciones", {
          method: "GET",
          credentials: "include",
          cache: "no-store",
        });

        const data = (await response.json()) as ApiResponse;

        if (!response.ok) {
          throw new Error(
            data.error || "No se pudieron cargar los reportes."
          );
        }

        if (!Array.isArray(data.registros)) {
          throw new Error("La respuesta del servidor no es válida.");
        }

        if (activo) {
          setRegistros(data.registros);
          setError("");
          setUltimaActualizacion(
            new Intl.DateTimeFormat("es-CO", {
              timeZone: "America/Bogota",
              hour: "2-digit",
              minute: "2-digit",
            }).format(new Date())
          );
        }
      } catch (err) {
        if (activo) {
          setError(
            err instanceof Error
              ? err.message
              : "Ocurrió un error al cargar los reportes."
          );
        }
      } finally {
        if (activo) {
          setCargando(false);
        }
      }
    }

    void cargarDatos();

    return () => {
      activo = false;
    };
  }, []);

  const actualizarReportes = useCallback(async () => {
    setCargando(true);
    setError("");

    try {
      const response = await fetch("/api/marcaciones", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });

      const data = (await response.json()) as ApiResponse;

      if (!response.ok) {
        throw new Error(
          data.error || "No se pudieron actualizar los reportes."
        );
      }

      if (!Array.isArray(data.registros)) {
        throw new Error("La respuesta del servidor no es válida.");
      }

      setRegistros(data.registros);
      setUltimaActualizacion(
        new Intl.DateTimeFormat("es-CO", {
          timeZone: "America/Bogota",
          hour: "2-digit",
          minute: "2-digit",
        }).format(new Date())
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Ocurrió un error al actualizar los reportes."
      );
    } finally {
      setCargando(false);
    }
  }, []);

  const registrosFiltrados = useMemo(() => {
    // Mientras se inicializa la fecha en el cliente, no se calculan filtros.
    if (!fechaActual) return [];

    const hoy = fechaActual;

    let desde = "";
    let hasta = "";

    if (periodo === "hoy") {
      desde = hoy;
      hasta = hoy;
    } else if (periodo === "semana") {
      desde = obtenerInicioSemana(hoy);
      hasta = sumarDias(desde, 6);
    } else if (periodo === "mes") {
      desde = `${hoy.slice(0, 7)}-01`;

      const [year, month] = hoy.split("-").map(Number);
      const ultimoDia = new Date(
        Date.UTC(year, month, 0)
      ).getUTCDate();

      hasta = `${hoy.slice(0, 7)}-${String(ultimoDia).padStart(2, "0")}`;
    } else {
      desde = fechaDesde;
      hasta = fechaHasta;
    }

    const termino = busqueda.trim().toLowerCase();

    return registros.filter((registro) => {
      if (desde && registro.fechaLaboral < desde) return false;
      if (hasta && registro.fechaLaboral > hasta) return false;

      if (termino) {
        const nombre = (registro.name || "").toLowerCase();
        const documento = (registro.id || "").toLowerCase();

        if (!nombre.includes(termino) && !documento.includes(termino)) {
          return false;
        }
      }

      return true;
    });
  }, [
    registros,
    periodo,
    fechaActual,
    fechaDesde,
    fechaHasta,
    busqueda,
  ]);

  const metricas = useMemo(() => {
    const totalJornadas = registrosFiltrados.length;

    const totalMarcas = registrosFiltrados.reduce(
      (total, registro) => total + obtenerMarcasRegistradas(registro),
      0
    );

    const empleados = new Set(
      registrosFiltrados.map((registro) => registro.id)
    );

    const evaluaciones = registrosFiltrados.flatMap((registro) => [
      registro.puntualidadEntradaManana.estado,
      registro.puntualidadEntradaAlmuerzo.estado,
    ]);

    const evaluacionesValidas = evaluaciones.filter(
      (estado) => estado === "Puntual" || estado === "Tarde"
    );

    const evaluacionesPuntuales = evaluacionesValidas.filter(
      (estado) => estado === "Puntual"
    ).length;

    const porcentajePuntualidad =
      evaluacionesValidas.length > 0
        ? Math.round(
          (evaluacionesPuntuales / evaluacionesValidas.length) * 100
        )
        : 0;

    const tardanzas = registrosFiltrados.reduce((total, registro) => {
      return (
        total +
        (registro.puntualidadEntradaManana.estado === "Tarde" ? 1 : 0) +
        (registro.puntualidadEntradaAlmuerzo.estado === "Tarde" ? 1 : 0)
      );
    }, 0);

    const marcasFaltantes = registrosFiltrados.reduce((total, registro) => {
      return total + (4 - obtenerMarcasRegistradas(registro));
    }, 0);

    const jornadasPuntuales = registrosFiltrados.filter(
      (registro) => obtenerEstadoGeneral(registro) === "Puntual"
    ).length;

    const jornadasTarde = registrosFiltrados.filter((registro) =>
      obtenerEstadoGeneral(registro).includes("Tarde")
    ).length;

    const jornadasIncompletas = registrosFiltrados.filter(
      (registro) => registro.estado === "Incompleto"
    ).length;

    const sinHorario = registrosFiltrados.filter((registro) => {
      return (
        registro.puntualidadEntradaManana.estado === "Sin horario" &&
        registro.puntualidadEntradaAlmuerzo.estado === "Sin horario"
      );
    }).length;

    return {
      totalJornadas,
      totalMarcas,
      empleados: empleados.size,
      porcentajePuntualidad,
      tardanzas,
      marcasFaltantes,
      jornadasPuntuales,
      jornadasTarde,
      jornadasIncompletas,
      sinHorario,
    };
  }, [registrosFiltrados]);

  // Exportación CSV con separador regional de Excel (;).
  const exportarCSV = useCallback(() => {
    const separador = ";";

    const encabezados = [
      "Empleado",
      "Documento",
      "Fecha",
      "Entrada mañana programada",
      "Entrada mañana registrada",
      "Puntualidad mañana",
      "Retraso mañana (min)",
      "Salida almuerzo",
      "Entrada almuerzo programada",
      "Entrada almuerzo registrada",
      "Puntualidad almuerzo",
      "Retraso almuerzo (min)",
      "Salida jornada",
      "Estado jornada",
      "Incidencias",
    ];

    const filas = registrosFiltrados.map((registro) => {
      return [
        registro.name,
        registro.id,
        registro.fechaLaboral,
        registro.puntualidadEntradaManana.horaProgramada,
        registro.entradaManana,
        registro.puntualidadEntradaManana.estado,
        registro.puntualidadEntradaManana.minutosRetraso,
        registro.salidaAlmuerzo,
        registro.puntualidadEntradaAlmuerzo.horaProgramada,
        registro.entradaAlmuerzo,
        registro.puntualidadEntradaAlmuerzo.estado,
        registro.puntualidadEntradaAlmuerzo.minutosRetraso,
        registro.salidaJornada,
        obtenerEstadoGeneral(registro),
        obtenerIncidencias(registro).join(" | "),
      ].map(escaparCSV);
    });

    const contenido = [
      "sep=;",
      encabezados.map(escaparCSV).join(separador),
      ...filas.map((fila) => fila.join(separador)),
    ].join("\r\n");

    const blob = new Blob(["\uFEFF", contenido], {
      type: "text/csv;charset=utf-8;",
    });

    const url = URL.createObjectURL(blob);
    const enlace = document.createElement("a");

    enlace.href = url;
    enlace.download = `reporte_asistencia_${obtenerFechaBogota()}.csv`;

    document.body.appendChild(enlace);
    enlace.click();
    enlace.remove();

    URL.revokeObjectURL(url);
  }, [registrosFiltrados]);

  const tarjetas = [
    {
      titulo: "Jornadas",
      valor: metricas.totalJornadas,
      detalle: "Registros encontrados",
      icono: CalendarDays,
      color: "text-[var(--color-info)]",
      fondo: "bg-[var(--color-info-bg)]",
    },
    {
      titulo: "Marcas registradas",
      valor: metricas.totalMarcas,
      detalle: "De las jornadas filtradas",
      icono: Clock3,
      color: "text-[var(--color-info)]",
      fondo: "bg-[var(--color-info-bg)]",
    },
    {
      titulo: "Puntualidad",
      valor: `${metricas.porcentajePuntualidad}%`,
      detalle: "Sobre entradas evaluables",
      icono: CheckCircle2,
      color: "text-[var(--color-success)]",
      fondo: "bg-[var(--color-success-bg)]",
    },
    {
      titulo: "Incidencias",
      valor: metricas.tardanzas + metricas.marcasFaltantes,
      detalle: `${metricas.tardanzas} tardanzas · ${metricas.marcasFaltantes} marcas faltantes`,
      icono: AlertTriangle,
      color: "text-[var(--color-warning)]",
      fondo: "bg-[var(--color-warning-bg)]",
    },
  ];

  return (
    <div className="min-h-screen bg-[var(--color-bg-main)] p-4 text-[var(--color-text-primary)] md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
              Reportes de asistencia
            </h1>
            <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
              Consulta y analiza las jornadas y marcaciones de los empleados.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void actualizarReportes()}
              disabled={cargando}
              className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] px-4 py-2.5 text-sm font-medium text-[var(--color-text-primary)] transition hover:border-[var(--color-border)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw
                size={16}
                className={cargando ? "animate-spin" : ""}
              />
              Actualizar
            </button>

            <button
              type="button"
              onClick={exportarCSV}
              disabled={registrosFiltrados.length === 0}
              className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-4 py-2.5 text-sm font-bold text-[#111827] transition hover:bg-[var(--color-primary)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Download size={16} />
              Exportar CSV para Excel
            </button>
          </div>
        </header>

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--color-text-secondary)]">
          <span>
            Fecha actual: {formatearFecha(fechaActual)}
          </span>
          <span>
            {ultimaActualizacion
              ? `Última actualización: ${ultimaActualizacion}`
              : "Pendiente de actualización"}
          </span>
        </div>

        {error && (
          <div className="flex items-start gap-3 rounded-xl border border-[var(--color-error-border)] bg-[var(--color-error-bg)] p-4 text-sm text-[var(--color-error)]">
            <XCircle size={20} className="mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold">
                No se pudieron cargar los reportes
              </p>
              <p className="mt-1">{error}</p>
            </div>
          </div>
        )}

        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {tarjetas.map((tarjeta) => {
            const Icono = tarjeta.icono;

            return (
              <div
                key={tarjeta.titulo}
                className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-5"
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm text-[var(--color-text-secondary)]">
                    {tarjeta.titulo}
                  </p>
                  <div className={`rounded-lg p-2 ${tarjeta.fondo}`}>
                    <Icono size={19} className={tarjeta.color} />
                  </div>
                </div>

                <p className="mt-3 text-3xl font-bold tabular-nums">
                  {tarjeta.valor}
                </p>
                <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
                  {tarjeta.detalle}
                </p>
              </div>
            );
          })}
        </section>

        <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-5">
          <div className="mb-4 flex items-center gap-2">
            <CalendarDays size={19} className="text-[var(--color-accent-text)]" />
            <h2 className="font-semibold">Filtros del reporte</h2>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div>
              <label className="mb-2 block text-xs font-medium text-[var(--color-text-secondary)]">
                Periodo
              </label>
              <select
                value={periodo}
                onChange={(event) =>
                  setPeriodo(event.target.value as Periodo)
                }
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-main)] px-3 py-2.5 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-primary)]"
              >
                <option value="hoy">Hoy</option>
                <option value="semana">Esta semana</option>
                <option value="mes">Este mes</option>
                <option value="personalizado">Personalizado</option>
              </select>
            </div>

            {periodo === "personalizado" && (
              <>
                <div>
                  <label className="mb-2 block text-xs font-medium text-[var(--color-text-secondary)]">
                    Desde
                  </label>
                  <input
                    type="date"
                    value={fechaDesde}
                    onChange={(event) => setFechaDesde(event.target.value)}
                    className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-main)] px-3 py-2.5 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-primary)]"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-xs font-medium text-[var(--color-text-secondary)]">
                    Hasta
                  </label>
                  <input
                    type="date"
                    min={fechaDesde}
                    value={fechaHasta}
                    onChange={(event) => setFechaHasta(event.target.value)}
                    className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-main)] px-3 py-2.5 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-primary)]"
                  />
                </div>
              </>
            )}

            <div>
              <label className="mb-2 block text-xs font-medium text-[var(--color-text-secondary)]">
                Buscar empleado
              </label>
              <div className="relative">
                <Search
                  size={16}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-secondary)]"
                />
                <input
                  type="text"
                  value={busqueda}
                  onChange={(event) => setBusqueda(event.target.value)}
                  placeholder="Nombre o documento..."
                  className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-main)] py-2.5 pl-9 pr-3 text-sm text-[var(--color-text-primary)] outline-none placeholder:text-[var(--color-text-secondary)] focus:border-[var(--color-primary)]"
                />
              </div>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-5 lg:col-span-2">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="font-semibold">Distribución de jornadas</h2>
              <span className="text-xs text-[var(--color-text-secondary)]">
                Según los filtros aplicados
              </span>
            </div>

            {metricas.totalJornadas === 0 ? (
              <p className="py-8 text-center text-sm text-[var(--color-text-secondary)]">
                No hay jornadas para mostrar.
              </p>
            ) : (
              <div className="space-y-5">
                {[
                  {
                    label: "Puntuales",
                    value: metricas.jornadasPuntuales,
                    color: "bg-[var(--color-success)]",
                  },
                  {
                    label: "Con tardanza",
                    value: metricas.jornadasTarde,
                    color: "bg-[var(--color-primary)]",
                  },
                  {
                    label: "Incompletas",
                    value: metricas.jornadasIncompletas,
                    color: "bg-[var(--color-error)]",
                  },
                  {
                    label: "Sin horario evaluable",
                    value: metricas.sinHorario,
                    color: "bg-[var(--color-bg-muted)]",
                  },
                ].map((item) => {
                  const porcentaje = Math.round(
                    (item.value / metricas.totalJornadas) * 100
                  );

                  return (
                    <div key={item.label}>
                      <div className="mb-2 flex justify-between text-sm">
                        <span className="text-[var(--color-text-secondary)]">
                          {item.label}
                        </span>
                        <span className="tabular-nums text-[var(--color-text-secondary)]">
                          {item.value} ({porcentaje}%)
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-[var(--color-bg-card)]">
                        <div
                          className={`h-full rounded-full ${item.color}`}
                          style={{ width: `${porcentaje}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-5">
            <div className="mb-4 flex items-center gap-2">
              <Users size={19} className="text-[var(--color-accent-text)]" />
              <h2 className="font-semibold">Resumen de empleados</h2>
            </div>

            <p className="text-4xl font-bold tabular-nums">
              {metricas.empleados}
            </p>
            <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
              Empleados con registros en el periodo
            </p>

            <div className="my-5 border-t border-[var(--color-border)]" />

            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-[var(--color-text-secondary)]">Jornadas consultadas</span>
                <span className="font-semibold">
                  {metricas.totalJornadas}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--color-text-secondary)]">Marcas registradas</span>
                <span className="font-semibold">
                  {metricas.totalMarcas}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--color-text-secondary)]">Marcas faltantes</span>
                <span className="font-semibold text-[var(--color-warning)]">
                  {metricas.marcasFaltantes}
                </span>
              </div>
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)]">
          <div className="flex flex-col justify-between gap-2 border-b border-[var(--color-border)] p-5 sm:flex-row sm:items-center">
            <div>
              <h2 className="font-semibold">Detalle de jornadas</h2>
              <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
                {registrosFiltrados.length} registros encontrados
              </p>
            </div>

            <div className="flex items-center gap-2 text-xs text-[var(--color-text-secondary)]">
              <FileSpreadsheet size={15} />
              Datos obtenidos del módulo de marcaciones
            </div>
          </div>

          {cargando ? (
            <div className="flex items-center justify-center gap-3 py-16 text-sm text-[var(--color-text-secondary)]">
              <RefreshCw size={18} className="animate-spin" />
              Cargando reportes...
            </div>
          ) : registrosFiltrados.length === 0 ? (
            <div className="py-16 text-center">
              <CalendarDays
                size={32}
                className="mx-auto mb-3 text-[var(--color-text-secondary)]"
              />
              <p className="font-medium text-[var(--color-text-secondary)]">
                No se encontraron jornadas
              </p>
              <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                Prueba con otro periodo o modifica la búsqueda.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1050px] text-left text-sm">
                <thead className="bg-[var(--color-bg-main)] text-xs uppercase text-[var(--color-text-secondary)]">
                  <tr>
                    <th className="px-5 py-4 font-medium">Empleado</th>
                    <th className="px-4 py-4 font-medium">Fecha</th>
                    <th className="px-4 py-4 font-medium">Entrada mañana</th>
                    <th className="px-4 py-4 font-medium">Salida almuerzo</th>
                    <th className="px-4 py-4 font-medium">Entrada almuerzo</th>
                    <th className="px-4 py-4 font-medium">Salida jornada</th>
                    <th className="px-5 py-4 font-medium">Estado</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-[var(--color-border)]">
                  {registrosFiltrados.map((registro, index) => {
                    const estado = obtenerEstadoGeneral(registro);
                    const incidencias = obtenerIncidencias(registro);

                    return (
                      <tr
                        key={`${registro.id}-${registro.fechaLaboral}-${index}`}
                        className="transition hover:bg-[var(--color-bg-hover)]"
                      >
                        <td className="px-5 py-4">
                          <p className="font-medium text-[var(--color-text-primary)]">
                            {registro.name || "Empleado"}
                          </p>
                          <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
                            {registro.id}
                          </p>
                        </td>

                        <td className="whitespace-nowrap px-4 py-4 text-[var(--color-text-secondary)]">
                          {formatearFecha(registro.fechaLaboral)}
                        </td>

                        <td className="px-4 py-4">
                          <p className="font-medium text-[var(--color-text-primary)]">
                            {registro.entradaManana || "—"}
                          </p>
                          <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
                            Programada:{" "}
                            {registro.puntualidadEntradaManana.horaProgramada ||
                              "—"}
                          </p>
                        </td>

                        <td className="px-4 py-4 text-[var(--color-text-secondary)]">
                          {registro.salidaAlmuerzo || "—"}
                        </td>

                        <td className="px-4 py-4">
                          <p className="font-medium text-[var(--color-text-primary)]">
                            {registro.entradaAlmuerzo || "—"}
                          </p>
                          <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
                            Programada:{" "}
                            {registro.puntualidadEntradaAlmuerzo
                              .horaProgramada || "—"}
                          </p>
                        </td>

                        <td className="px-4 py-4 text-[var(--color-text-secondary)]">
                          {registro.salidaJornada || "—"}
                        </td>

                        <td className="px-5 py-4">
                          <span
                            className={`inline-flex whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium ${obtenerColorEstado(
                              estado
                            )}`}
                          >
                            {estado}
                          </span>

                          {obtenerEtiquetaCalendario(registro) && (
                            <span className="ml-2 inline-flex whitespace-nowrap rounded-full border border-[var(--color-info-border)] bg-[var(--color-info-bg)] px-2.5 py-1 text-xs font-medium text-[var(--color-info)]">
                              {obtenerEtiquetaCalendario(registro)}
                            </span>
                          )}

                          {incidencias.length > 0 && (
                            <p
                              className="mt-2 max-w-[220px] text-xs leading-relaxed text-[var(--color-warning)]"
                              title={incidencias.join(" · ")}
                            >
                              {incidencias.join(" · ")}
                            </p>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <footer className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle
              size={18}
              className="mt-0.5 shrink-0 text-[var(--color-warning)]"
            />
            <div>
              <p className="text-sm font-medium text-[var(--color-text-secondary)]">
                Consideración sobre los datos
              </p>
              <p className="mt-1 text-xs leading-relaxed text-[var(--color-text-secondary)]">
                Los reportes se construyen con las jornadas que devuelve el
                módulo de marcaciones. Actualmente, un empleado que no tenga
                ninguna marca en una fecha no genera un registro en esa
                consulta; por tanto, estos reportes no representan ausencias
                completas sin marcación. Las incidencias mostradas se derivan
                de las tardanzas y marcas faltantes de las jornadas recibidas.
              </p>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
