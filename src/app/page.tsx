import { 
  QrCode, 
  Clock, 
  ShieldCheck, 
  FileSpreadsheet, 
  CheckCircle2, 
  Building2, 
  CalendarClock,
  Sparkles
} from "lucide-react";

export default function HomePage() {
  const caracteristicas = [
    {
      icon: <QrCode className="w-6 h-6 text-amber-400" />,
      titulo: "QR Dinámico en Kiosco",
      descripcion:
        "Tokens criptográficos rotativos con expiración estricta y soporte multi-empleado.",
    },
    {
      icon: <Clock className="w-6 h-6 text-emerald-400" />,
      titulo: "4 Marcaciones Diarias",
      descripcion:
        "Entrada mañana, salida/entrada a descanso y salida de jornada con estampa de servidor.",
    },
    {
      icon: <CalendarClock className="w-6 h-6 text-blue-400" />,
      titulo: "Horarios con Vigencia Histórica",
      descripcion:
        "Tolerancias parametrizables y trazabilidad de turnos según la fecha de aplicación.",
    },
    {
      icon: <ShieldCheck className="w-6 h-6 text-indigo-400" />,
      titulo: "Auditoría e Incidencias",
      descripcion:
        "Marcas inmutables, detección de inconsistencias y registro de correcciones con justificación.",
    },
    {
      icon: <FileSpreadsheet className="w-6 h-6 text-teal-400" />,
      titulo: "Reportes Excel Programados",
      descripcion:
        "Consolidado semanal automatizado y despachado de forma autónoma cada viernes.",
    },
    {
      icon: <Building2 className="w-6 h-6 text-amber-500" />,
      titulo: "Independencia Total",
      descripcion:
        "Base de datos PostgreSQL propia, desacoplada de sistemas de RRHH o nómina.",
    },
  ];

  return (
    <main className="flex-1 flex flex-col justify-between p-6 md:p-12 max-w-6xl mx-auto w-full">
      {/* Header Corporativo */}
      <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-slate-800 pb-6 gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-tr from-amber-500 to-amber-600 flex items-center justify-center shadow-lg shadow-amber-500/20 text-slate-950 font-bold text-xl tracking-tight">
            IA
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
              INTECOAL Asistencia
              <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium">
                v0.1.0 • Fase 1
              </span>
            </h1>
            <p className="text-xs text-slate-400">
              INTECOAL S.A.S. — Sistema de Control y Registro de Asistencia
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700/80 text-xs text-slate-300">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>Zona Horaria: <strong className="text-white">America/Bogota (UTC-5)</strong></span>
        </div>
      </header>

      {/* Hero Section */}
      <section className="my-10 text-center sm:text-left">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-800/90 border border-slate-700 text-slate-300 text-xs mb-4">
          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
          <span>Estructura inicial modular y base de datos configuradas con éxito</span>
        </div>
        <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-white max-w-3xl leading-tight">
          Control de asistencia seguro, moderno y automatizado.
        </h2>
        <p className="text-slate-400 text-base sm:text-lg max-w-2xl mt-4 leading-relaxed">
          Plataforma web y PWA dedicada exclusivamente al registro del personal mediante códigos QR dinámicos, garantizando inmutabilidad, trazabilidad y puntualidad operativa.
        </p>
      </section>

      {/* Grid de Características Principales */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 my-4">
        {caracteristicas.map((item, index) => (
          <div
            key={index}
            className="p-5 rounded-xl bg-slate-800/40 border border-slate-800/80 hover:border-slate-700 transition-colors flex flex-col justify-between"
          >
            <div>
              <div className="p-2.5 w-fit rounded-lg bg-slate-800/90 border border-slate-700/50 mb-4">
                {item.icon}
              </div>
              <h3 className="text-sm font-semibold text-white mb-1.5">
                {item.titulo}
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                {item.descripcion}
              </p>
            </div>
          </div>
        ))}
      </section>

      {/* Estado del Proyecto - Fase 1 */}
      <section className="mt-8 p-6 rounded-2xl bg-gradient-to-r from-slate-800/70 via-slate-800/40 to-slate-800/70 border border-slate-700/70">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              Fase 1: Configuración Inicial & Arquitectura Base
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Entorno verificado, dependencias sincronizadas y documentación de continuidad lista.
            </p>
          </div>
          <div className="text-right">
            <span className="text-xs uppercase tracking-wider font-semibold text-slate-400">Estado</span>
            <p className="text-sm font-bold text-emerald-400">Listo para Fase 2</p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4 border-t border-slate-700/60 text-xs">
          <div>
            <span className="text-slate-500 block">Framework</span>
            <span className="font-medium text-slate-200">Next.js 16 + React 19</span>
          </div>
          <div>
            <span className="text-slate-500 block">Base de Datos</span>
            <span className="font-medium text-slate-200">PostgreSQL + Prisma</span>
          </div>
          <div>
            <span className="text-slate-500 block">Estilos & UI</span>
            <span className="font-medium text-slate-200">Tailwind CSS 4</span>
          </div>
          <div>
            <span className="text-slate-500 block">Documentación</span>
            <span className="font-medium text-slate-200">6 Archivos Fundamentales</span>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-12 pt-6 border-t border-slate-800/80 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-2">
        <p>© 2026 INTECOAL S.A.S. — Todos los derechos reservados.</p>
        <p>Sistema confidencial de uso interno corporativo.</p>
      </footer>
    </main>
  );
}
