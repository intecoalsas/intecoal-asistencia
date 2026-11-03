# Reglas de Negocio — INTECOAL Asistencia

---

## 1. El Ciclo de Cuatro Marcaciones Diarias

Cada jornada laboral ordinaria comprende cuatro eventos obligatorios que deben ser registrados mediante el escaneo del código QR dinámico desde la PWA del empleado:

| Orden | Tipo de Marcación | Código | Descripción |
| :---: | :--- | :--- | :--- |
| **1** | Entrada de la mañana | `ENTRADA_MANANA` | Inicio de actividades laborales en la sede. |
| **2** | Salida al descanso | `SALIDA_ALMUERZO` | Pausa para alimentación y descanso del mediodía. |
| **3** | Entrada del descanso | `ENTRADA_ALMUERZO` | Retorno y reanudación de las labores. |
| **4** | Salida de la jornada | `SALIDA_JORNADA` | Cierre y finalización oficial de la jornada de trabajo. |

---

## 2. Horarios y Tolerancias Configurables

### 2.1. Definición de Políticas de Horario (`SchedulePolicy`)
- Los turnos de trabajo se parametrizan en políticas asignables a uno o varios colaboradores.
- Cada política especifica por cada día de la semana (Lunes a Viernes / Sábado):
  - Hora programada de Entrada Mañana (ej. 07:00).
  - Hora sugerida de Salida Descanso (ej. 12:00).
  - Hora sugerida de Entrada Descanso (ej. 13:00).
  - Hora programada de Salida Jornada (ej. 17:00).

### 2.2. Parámetros de Tolerancia
- **Tolerancia de Entrada (`toleranciaEntradaMin`):**
  - Margen de cortesía configurable (ej. 0, 5, 10 o 15 minutos).
  - Si la hora de entrada es $\le \text{HoraProgramada} + \text{Tolerancia}$, se clasifica como `A_TIEMPO`.
  - Si la hora de entrada es $> \text{HoraProgramada} + \text{Tolerancia}$, se marca como `RETARDO`, calculando con exactitud los minutos transcurridos desde la hora programada.
- **Tolerancia de Almuerzo (`toleranciaAlmuerzoMin`):**
  - Margen de gracia para el regreso del almuerzo.
- **Tiempo Mínimo de Almuerzo (`minimoMinutosAlmuerzo`):**
  - Período mínimo obligatorio de pausa (ej. 45 o 60 minutos). Impide que el colaborador registre inmediatamente la entrada de almuerzo tras la salida.

---

## 3. Manejo de Incidencias Operativas

### 3.1. Principio de No Invención de Datos
- **Regla Estricta:** El sistema **bajo ninguna circunstancia inventará marcas ni inferirá horas ficticias**.
- Si un colaborador olvida marcar, el registro quedará vacío hasta que se realice una corrección administrativa auditada o se justifique formalmente.
- El sistema **no declarará automáticamente una ausencia total** si existen marcaciones parciales en el día; en su lugar, emitirá una **incidencia** para análisis de la jefatura o talento humano.

### 3.2. Tipos de Incidencia

1. **`FUERA_DE_SECUENCIA`:**
   - Ocurre cuando un empleado registra una marcación que no corresponde al estado inmediato siguiente esperado (por ejemplo, registrar `ENTRADA_ALMUERZO` sin haber marcado previamente `SALIDA_ALMUERZO`).
   - El sistema almacena la marcación para no perjudicar la prueba física de presencia del trabajador, pero genera automáticamente una alerta de incidencia en estado `PENDIENTE`.

2. **`MARCACION_FALTANTE`:**
   - Evaluada al cierre del día calendario (23:59:59 en `America/Bogota`).
   - Si el empleado debía laborar y tiene entre 1 y 3 marcaciones registradas, se genera una incidencia de marcas faltantes para revisión del supervisor.

3. **`HORA_ATIPICA`:**
   - Marcaciones efectuadas en rangos horarios excesivamente distantes de la jornada programada (ej. intentar marcar entrada a la medianoche sin autorización de turno).

---

## 4. Correcciones Administrativas y Trazabilidad de Auditoría

1. **Inmutabilidad:**
   - Los registros capturados en el Kiosco conservan el valor original y el campo `isOriginal: true`.
2. **Procedimiento de Corrección:**
   - Cuando un Administrador o Supervisor autorizado deba ajustar una hora o añadir una marcación omitida:
     - Debe ingresar obligatoriamente un **Motivo Justificado** (mínimo 10 caracteres).
     - El registro original pasa a estado `CORREGIDO`.
     - Se guarda en `AttendanceAuditLog` el detalle completo:
       - Administrador responsable.
       - Fecha y hora exacta de la intervención.
       - Snapshot previo de la fila (JSON).
       - Snapshot nuevo de la fila (JSON).
       - Dirección IP de origen.
3. **Prohibición de Eliminación Física:**
   - No se permite la ejecución de sentencias `DELETE` sobre registros de asistencia. Las anulaciones de registros erróneos se efectúan mediante cambio de estado a `ANULADO_ADMIN`, preservando la auditoría completa.

---

## 5. Reportes Semanales y Entrega los Viernes

1. **Corte Semanal:**
   - El ciclo de reporte comprende desde el Lunes a las 00:00:00 hasta el Viernes a la hora de corte de la jornada (o Sábado si aplica para el turno).
2. **Estructura del Libro Excel (.xlsx):**
   - **Pestaña 1 - Resumen Ejecutivo:** Total de horas laboradas, índice de puntualidad global y conteo de incidencias.
   - **Pestaña 2 - Matriz de Marcaciones:** Desglose empleado por empleado con sus cuatro marcas diarias, indicación de retardos y minutos exactos.
   - **Pestaña 3 - Bitácora de Incidencias y Auditoría:** Listado de todas las correcciones administrativas realizadas en la semana, con usuario responsable y motivo.
3. **Automatización:**
   - El envío se realiza de forma automática cada viernes mediante una tarea programada en la nube, entregando el archivo adjunto a los correos configurados de Gerencia y Recursos Humanos.
