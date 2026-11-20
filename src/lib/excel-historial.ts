/**
 * src/lib/excel-historial.ts
 *
 * Generadores de archivos Excel (.xlsx) para el módulo Historial.
 * Utiliza exceljs. Cada función devuelve un Buffer listo para enviar como respuesta HTTP.
 *
 * Convenciones de estilo:
 *  - Fila 1: título del reporte (amarillo INTECOAL, negrita)
 *  - Fila 2: metadatos (período, versión, fecha de generación)
 *  - Fila 3: vacía (separador)
 *  - Fila 4+: encabezados de columnas + datos
 *
 * Los colores siguen la identidad visual del proyecto:
 *  - Encabezados: fondo #0d1117, texto #f1c40f (amber)
 *  - Filas pares: fondo #1a2634
 *  - Filas impares: fondo #0d1117
 *  - Texto normal: #e5e7eb
 */

import ExcelJS from "exceljs";
import type {
  ResumenSemanal,
  ResumenMensual,
  ResumenAnual,
  ResumenEmpleado,
  MetricasConsolidado,
  DiaConsolidado,
} from "@/modules/historial";

// ─── Colores corporativos ───────────────────────────────────────────────────
const COLOR_AMBER   = "FFF1C40F";
const COLOR_HEADER  = "FF0D1117";
const COLOR_ROW_ODD = "FF0D1117";
const COLOR_ROW_EVN = "FF1A2634";
const COLOR_TEXT    = "FFE5E7EB";
const COLOR_TEXT_SEC= "FFCBD5E1";
const COLOR_OK      = "FF10B981"; // emerald
const COLOR_WARN    = "FFF59E0B"; // amber
const COLOR_ERR     = "FFEF4444"; // red

const MESES_ES = [
  "Enero","Febrero","Marzo","Abril","Mayo","Junio",
  "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre",
];

// ─── Helpers ────────────────────────────────────────────────────────────────

function fecha(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return `${d.getUTCDate().toString().padStart(2,"0")}/${(d.getUTCMonth()+1).toString().padStart(2,"0")}/${d.getUTCFullYear()}`;
}

function ahora(): string {
  return new Date().toLocaleString("es-CO", { timeZone: "America/Bogota" });
}

function solidFill(argb: string): ExcelJS.Fill {
  return { type: "pattern", pattern: "solid", fgColor: { argb } };
}

function headerFont(): Partial<ExcelJS.Font> {
  return { bold: true, color: { argb: COLOR_AMBER }, size: 10 };
}

function bodyFont(secondary = false): Partial<ExcelJS.Font> {
  return { color: { argb: secondary ? COLOR_TEXT_SEC : COLOR_TEXT }, size: 10 };
}

function rowFill(rowIdx: number): ExcelJS.Fill {
  return solidFill(rowIdx % 2 === 0 ? COLOR_ROW_EVN : COLOR_ROW_ODD);
}

/** Aplica estilo de título a las primeras filas de metadatos. */
function addMetaRows(
  ws: ExcelJS.Worksheet,
  titulo: string,
  lineas: string[]
) {
  const titleRow = ws.addRow([titulo]);
  titleRow.font = { bold: true, size: 14, color: { argb: COLOR_AMBER } };
  titleRow.fill = solidFill(COLOR_HEADER);

  for (const linea of lineas) {
    const r = ws.addRow([linea]);
    r.font = { size: 10, color: { argb: COLOR_TEXT_SEC } };
    r.fill = solidFill(COLOR_HEADER);
  }

  ws.addRow([]); // separador
}

/** Aplica estilo de encabezado a una fila. */
function styleHeaderRow(row: ExcelJS.Row) {
  row.eachCell(cell => {
    cell.font  = headerFont();
    cell.fill  = solidFill(COLOR_HEADER);
    cell.border = {
      bottom: { style: "thin", color: { argb: COLOR_AMBER } },
    };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  });
  row.height = 24;
}

/** Estiliza una fila de datos. */
function styleDataRow(row: ExcelJS.Row, rowIdx: number) {
  row.fill = rowFill(rowIdx);
  row.eachCell(cell => {
    cell.font = bodyFont();
    cell.alignment = { vertical: "middle", horizontal: "center" };
  });
  row.height = 18;
}

/** Columna de texto a izquierda. */
function leftAlign(cell: ExcelJS.Cell) {
  cell.alignment = { ...cell.alignment, horizontal: "left" };
}

/** Agrega una hoja de Resumen de métricas. */
function addHojaMetricas(
  wb: ExcelJS.Workbook,
  titulo: string,
  meta: string[],
  m: MetricasConsolidado
) {
  const ws = wb.addWorksheet("Resumen");
  ws.properties.defaultColWidth = 28;
  addMetaRows(ws, titulo, meta);

  const hdr = ws.addRow(["Indicador", "Valor"]);
  styleHeaderRow(hdr);
  ws.getColumn(1).width = 36;
  ws.getColumn(2).width = 14;

  const filas: [string, number][] = [
    ["Empleados registrados", m.totalEmpleados],
    ["Días laborales",        m.diasLaborales],
    ["Asistencias",           m.asistencias],
    ["Ausencias",             m.ausencias],
    ["Jornadas completas",    m.jornadasCompletas],
    ["Jornadas incompletas",  m.jornadasIncompletas],
    ["Tardanzas",             m.tardanzas],
    ["Min. tardanza entrada", m.minutosTardanzaEntrada],
    ["Min. tardanza almuerzo",m.minutosTardanzaAlmuerzo],
    ["Incidencias pendientes",m.incidenciasPendientes],
    ["Incidencias resueltas", m.incidenciasResueltas],
  ];

  filas.forEach(([label, valor], i) => {
    const r = ws.addRow([label, valor]);
    styleDataRow(r, i);
    leftAlign(r.getCell(1));
  });
}

/** Agrega una hoja de detalle diario por empleado. */
function addHojaDetalle(
  wb: ExcelJS.Workbook,
  dias: DiaConsolidado[],
  nombreHoja = "Detalle diario"
) {
  const ws = wb.addWorksheet(nombreHoja.slice(0, 31));
  const cols = [
    { header: "Empleado (ID)", key: "userId",             width: 36 },
    { header: "Fecha",         key: "fecha",              width: 12 },
    { header: "Es laboral",    key: "esLaboral",          width: 12 },
    { header: "Entrada M.",    key: "tieneEntradaManana", width: 12 },
    { header: "Salida alm.",   key: "tieneSalidaAlmuerzo",width: 13 },
    { header: "Entrada alm.",  key: "tieneEntradaAlmuerzo",width: 13 },
    { header: "Salida jorn.",  key: "tieneSalidaJornada", width: 13 },
    { header: "Jornada comp.", key: "jornadaCompleta",    width: 13 },
    { header: "Ausente",       key: "ausente",            width: 10 },
    { header: "Impuntual",     key: "esImpuntual",        width: 10 },
    { header: "Tard. entrada", key: "tardanzaEntrada",    width: 13 },
    { header: "Tard. alm.",    key: "tardanzaAlmuerzo",   width: 12 },
    { header: "Incid. pend.",  key: "incidPend",          width: 12 },
    { header: "Incid. res.",   key: "incidRes",           width: 12 },
  ];

  ws.columns = cols;
  styleHeaderRow(ws.getRow(1));

  const sorted = [...dias].sort(
    (a, b) => a.userId.localeCompare(b.userId) || a.fechaLaboral.toString().localeCompare(b.fechaLaboral.toString())
  );

  sorted.forEach((d, i) => {
    const si = (v: boolean) => (v ? "Sí" : "No");
    const r = ws.addRow({
      userId:              d.userId,
      fecha:               fecha(d.fechaLaboral),
      esLaboral:           si(d.esLaboral),
      tieneEntradaManana:  si(d.tieneEntradaManana),
      tieneSalidaAlmuerzo: si(d.tieneSalidaAlmuerzo),
      tieneEntradaAlmuerzo:si(d.tieneEntradaAlmuerzo),
      tieneSalidaJornada:  si(d.tieneSalidaJornada),
      jornadaCompleta:     si(d.jornadaCompleta),
      ausente:             si(d.ausente),
      esImpuntual:         si(d.esImpuntual),
      tardanzaEntrada:     d.tardanzaEntradaMin,
      tardanzaAlmuerzo:    d.tardanzaAlmuerzoMin,
      incidPend:           d.incidenciasPendientes,
      incidRes:            d.incidenciasResueltas,
    });
    styleDataRow(r, i);
    leftAlign(r.getCell(1));

    // Colorear celdas de estado
    if (d.ausente)         r.getCell(9).font  = { color: { argb: COLOR_ERR  }, size: 10 };
    if (d.esImpuntual)     r.getCell(10).font = { color: { argb: COLOR_WARN }, size: 10 };
    if (d.jornadaCompleta) r.getCell(8).font  = { color: { argb: COLOR_OK   }, size: 10 };
  });
}

// ─── Función auxiliar: crear workbook con estilo INTECOAL ───────────────────

function crearWorkbook(): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator  = "INTECOAL Asistencia";
  wb.created  = new Date();
  wb.modified = new Date();
  return wb;
}

async function toBuffer(wb: ExcelJS.Workbook): Promise<Uint8Array> {
  const buf = await wb.xlsx.writeBuffer();
  return new Uint8Array(buf);
}

// ─── Exportadores públicos ───────────────────────────────────────────────────

export async function generarExcelSemanal(
  resumen: ResumenSemanal
): Promise<Uint8Array> {
  const wb  = crearWorkbook();
  const ini = fecha(resumen.inicioSemana);
  const fin = fecha(resumen.finSemana);

  addHojaMetricas(wb,
    `Historial Semanal — ${ini} al ${fin}`,
    [
      `Período: ${ini} al ${fin}`,
      `Versión de cierre: ${resumen.version}`,
      `ID cierre: ${resumen.weeklyClosureId}`,
      `Generado: ${ahora()}`,
    ],
    resumen.metricas
  );

  if (resumen.detalle && resumen.detalle.length > 0) {
    addHojaDetalle(wb, resumen.detalle, "Detalle diario");
  }

  return toBuffer(wb);
}

export async function generarExcelMensual(
  resumen: ResumenMensual
): Promise<Uint8Array> {
  const wb    = crearWorkbook();
  const label = `${MESES_ES[resumen.mes - 1]} ${resumen.anio}`;

  addHojaMetricas(wb,
    `Historial Mensual — ${label}`,
    [
      `Mes: ${label}`,
      `Semanas consolidadas: ${resumen.semanas.length}`,
      `Generado: ${ahora()}`,
    ],
    resumen.metricas
  );

  // Hoja de semanas
  const wsSem = wb.addWorksheet("Semanas");
  wsSem.columns = [
    { header: "Semana",             key: "semana",    width: 20 },
    { header: "Versión",            key: "version",   width: 10 },
    { header: "Empleados",          key: "emp",       width: 12 },
    { header: "Días laborales",     key: "dlab",      width: 14 },
    { header: "Asistencias",        key: "asist",     width: 13 },
    { header: "Ausencias",          key: "aus",       width: 12 },
    { header: "Jorn. completas",    key: "jcomp",     width: 15 },
    { header: "Jorn. incompletas",  key: "jinc",      width: 16 },
    { header: "Tardanzas",          key: "tard",      width: 12 },
    { header: "Incid. pendientes",  key: "ipend",     width: 16 },
    { header: "Incid. resueltas",   key: "ires",      width: 15 },
  ];
  styleHeaderRow(wsSem.getRow(1));

  resumen.semanas.forEach((s, i) => {
    const r = wsSem.addRow({
      semana:  `${fecha(s.inicioSemana)} – ${fecha(s.finSemana)}`,
      version: s.version,
      emp:     s.metricas.totalEmpleados,
      dlab:    s.metricas.diasLaborales,
      asist:   s.metricas.asistencias,
      aus:     s.metricas.ausencias,
      jcomp:   s.metricas.jornadasCompletas,
      jinc:    s.metricas.jornadasIncompletas,
      tard:    s.metricas.tardanzas,
      ipend:   s.metricas.incidenciasPendientes,
      ires:    s.metricas.incidenciasResueltas,
    });
    styleDataRow(r, i);
    leftAlign(r.getCell(1));
  });

  return toBuffer(wb);
}

export async function generarExcelAnual(
  resumen: ResumenAnual
): Promise<Uint8Array> {
  const wb = crearWorkbook();

  // Calcular métricas anuales acumuladas
  const metricasAnuales: MetricasConsolidado = resumen.meses.reduce(
    (acc, m) => ({
      totalEmpleados:          Math.max(acc.totalEmpleados, m.metricas.totalEmpleados),
      diasLaborales:           acc.diasLaborales           + m.metricas.diasLaborales,
      asistencias:             acc.asistencias             + m.metricas.asistencias,
      ausencias:               acc.ausencias               + m.metricas.ausencias,
      jornadasCompletas:       acc.jornadasCompletas       + m.metricas.jornadasCompletas,
      jornadasIncompletas:     acc.jornadasIncompletas     + m.metricas.jornadasIncompletas,
      tardanzas:               acc.tardanzas               + m.metricas.tardanzas,
      minutosTardanzaEntrada:  acc.minutosTardanzaEntrada  + m.metricas.minutosTardanzaEntrada,
      minutosTardanzaAlmuerzo: acc.minutosTardanzaAlmuerzo + m.metricas.minutosTardanzaAlmuerzo,
      incidenciasPendientes:   acc.incidenciasPendientes   + m.metricas.incidenciasPendientes,
      incidenciasResueltas:    acc.incidenciasResueltas    + m.metricas.incidenciasResueltas,
    }),
    {
      totalEmpleados: 0, diasLaborales: 0, asistencias: 0, ausencias: 0,
      jornadasCompletas: 0, jornadasIncompletas: 0, tardanzas: 0,
      minutosTardanzaEntrada: 0, minutosTardanzaAlmuerzo: 0,
      incidenciasPendientes: 0, incidenciasResueltas: 0,
    }
  );

  addHojaMetricas(wb,
    `Historial Anual — ${resumen.anio}`,
    [
      `Año: ${resumen.anio}`,
      `Meses con datos: ${resumen.meses.filter(m => m.semanas.length > 0).length} / 12`,
      `Generado: ${ahora()}`,
    ],
    metricasAnuales
  );

  // Hoja por meses
  const wsMeses = wb.addWorksheet("Por mes");
  wsMeses.columns = [
    { header: "Mes",                key: "mes",   width: 14 },
    { header: "Semanas",            key: "sem",   width: 10 },
    { header: "Empleados",          key: "emp",   width: 12 },
    { header: "Días laborales",     key: "dlab",  width: 14 },
    { header: "Asistencias",        key: "asist", width: 13 },
    { header: "Ausencias",          key: "aus",   width: 12 },
    { header: "Jorn. completas",    key: "jcomp", width: 15 },
    { header: "Jorn. incompletas",  key: "jinc",  width: 16 },
    { header: "Tardanzas",          key: "tard",  width: 12 },
    { header: "Incid. pendientes",  key: "ipend", width: 16 },
    { header: "Incid. resueltas",   key: "ires",  width: 15 },
  ];
  styleHeaderRow(wsMeses.getRow(1));

  resumen.meses.forEach((m, i) => {
    const r = wsMeses.addRow({
      mes:   MESES_ES[m.mes - 1],
      sem:   m.semanas.length,
      emp:   m.metricas.totalEmpleados,
      dlab:  m.metricas.diasLaborales,
      asist: m.metricas.asistencias,
      aus:   m.metricas.ausencias,
      jcomp: m.metricas.jornadasCompletas,
      jinc:  m.metricas.jornadasIncompletas,
      tard:  m.metricas.tardanzas,
      ipend: m.metricas.incidenciasPendientes,
      ires:  m.metricas.incidenciasResueltas,
    });
    styleDataRow(r, i);
    leftAlign(r.getCell(1));
    if (m.semanas.length === 0) {
      r.eachCell(c => { c.font = { color: { argb: COLOR_TEXT_SEC }, italic: true, size: 10 }; });
    }
  });

  return toBuffer(wb);
}

export async function generarExcelEmpleado(
  resumen: ResumenEmpleado,
  nombreEmpleado: string,
  documento: string
): Promise<Uint8Array> {
  const wb = crearWorkbook();

  addHojaMetricas(wb,
    `Historial Individual — ${nombreEmpleado}`,
    [
      `Empleado: ${nombreEmpleado}`,
      `Documento: ${documento}`,
      `Semanas consolidadas: ${resumen.semanas.length}`,
      `Generado: ${ahora()}`,
    ],
    resumen.metricasGlobales
  );

  // Hoja de semanas del empleado
  const wsSem = wb.addWorksheet("Semanas");
  wsSem.columns = [
    { header: "Semana",            key: "semana",  width: 22 },
    { header: "Versión",           key: "version", width: 10 },
    { header: "Días laborales",    key: "dlab",    width: 14 },
    { header: "Asistencias",       key: "asist",   width: 13 },
    { header: "Ausencias",         key: "aus",     width: 12 },
    { header: "Jorn. completas",   key: "jcomp",   width: 15 },
    { header: "Jorn. incompletas", key: "jinc",    width: 16 },
    { header: "Tardanzas",         key: "tard",    width: 12 },
    { header: "Min. tard. entrada",key: "mte",     width: 16 },
    { header: "Min. tard. alm.",   key: "mta",     width: 15 },
    { header: "Incid. pendientes", key: "ipend",   width: 16 },
    { header: "Incid. resueltas",  key: "ires",    width: 15 },
  ];
  styleHeaderRow(wsSem.getRow(1));

  resumen.semanas.forEach((s, i) => {
    const r = wsSem.addRow({
      semana:  `${fecha(s.inicioSemana)} – ${fecha(s.finSemana)}`,
      version: s.version,
      dlab:    s.metricas.diasLaborales,
      asist:   s.metricas.asistencias,
      aus:     s.metricas.ausencias,
      jcomp:   s.metricas.jornadasCompletas,
      jinc:    s.metricas.jornadasIncompletas,
      tard:    s.metricas.tardanzas,
      mte:     s.metricas.minutosTardanzaEntrada,
      mta:     s.metricas.minutosTardanzaAlmuerzo,
      ipend:   s.metricas.incidenciasPendientes,
      ires:    s.metricas.incidenciasResueltas,
    });
    styleDataRow(r, i);
    leftAlign(r.getCell(1));
  });

  // Hoja de detalle diario de todos los días del empleado
  const todosDias: DiaConsolidado[] = resumen.semanas.flatMap(s => s.dias);
  if (todosDias.length > 0) {
    addHojaDetalle(wb, todosDias, "Detalle diario");
  }

  return toBuffer(wb);
}
