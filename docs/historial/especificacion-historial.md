# Especificación funcional y técnica — Módulo Historial
## Proyecto INTECOAL Asistencia

**Estado:** Diseño propuesto para revisión y aprobación  
**Alcance:** Nuevo módulo de historial, cierres semanales, consolidados y auditoría.  
**Zona horaria oficial:** America/Bogota  
**Regla principal:** Conservar la información histórica sin eliminar ni sobrescribir los registros originales.

---

## 1. Objetivo

Crear un módulo denominado **Historial** que permita conservar, organizar, consultar y consolidar la información de asistencia de INTECOAL Asistencia por semanas, meses y años.

El sistema deberá realizar cierres semanales automáticos, conservar los resultados de cada cierre y permitir consultas históricas sin eliminar las marcaciones, incidencias ni registros originales.

El módulo también deberá permitir corregir información histórica mediante un procedimiento controlado de reapertura exclusivo de ADMIN.

## 2. Organización de los períodos

### 2.1. Períodos semanales

- Cada semana comienza el lunes y termina el domingo.
- El período se identifica mediante sus fechas reales.
- El cierre automático se programa para el lunes a las 00:00, hora de Colombia.
- Cada semana tendrá un estado:
  - ABIERTA.
  - CERRADA.
  - REABIERTA.
  - PENDIENTE_DE_CIERRE, cuando el cierre todavía no se haya completado.
- Una semana reabierta no se cerrará automáticamente mientras permanezca en ese estado.
- Después de realizar las correcciones, ADMIN deberá ejecutar el cierre nuevamente.

### 2.2. Períodos mensuales

- Los meses corresponden a meses calendario reales.
- No se considerarán equivalentes a cuatro semanas.
- Los registros se agruparán según su fecha real.
- Las semanas que atraviesen dos meses conservarán su identidad semanal, pero sus resultados se distribuirán entre los meses correspondientes según las fechas de los registros.

### 2.3. Períodos anuales

- El año comprende del 1 de enero al 31 de diciembre.
- Los consolidados anuales se obtendrán a partir de los resultados mensuales y registros históricos.
- Los meses anteriores deberán permanecer consultables.

## 3. Cierre semanal automático

El sistema deberá ejecutar un proceso del lado del servidor, independiente de que existan usuarios conectados o navegadores abiertos.

El proceso deberá:

1. Detectar la semana que acaba de finalizar.
2. Comprobar si ya existe un cierre válido para ese período.
3. Identificar registros pendientes de procesamiento.
4. Consolidar las marcaciones y novedades.
5. Calcular los indicadores correspondientes.
6. Guardar una versión del cierre.
7. Registrar fecha, hora y resultado de la operación.
8. Marcar el período como cerrado.
9. Permitir que la nueva semana continúe recibiendo marcaciones normalmente.

### 3.1. Idempotencia

El proceso deberá ser idempotente.

Ejecutar varias veces el mismo cierre no podrá generar versiones duplicadas ni duplicar información histórica.

### 3.2. Recuperación ante fallos

Si el cierre falla:

- El sistema deberá identificar el período pendiente.
- Ejecutará nuevos intentos automáticamente.
- Los intentos deberán quedar registrados.
- Si no logra completar el proceso, notificará a las cuentas ADMIN.
- La información original deberá permanecer intacta.
- El sistema deberá poder recuperar cierres pendientes después de una interrupción del servidor.

No se deberá marcar un período como cerrado si el proceso no ha terminado correctamente.

## 4. Versiones de cierre

Cada cierre deberá generar una versión histórica independiente.

Ejemplo:

| Versión | Evento |
|---|---|
| 1 | Cierre semanal automático |
| 2 | Reapertura, corrección y nuevo cierre |
| 3 | Nueva reapertura y cierre posterior |

Reglas:

- Nunca sobrescribir una versión histórica anterior.
- Conservar los resultados de cada versión.
- Registrar fecha y hora.
- Identificar el actor responsable.
- Diferenciar los cierres automáticos de los manuales.
- Mantener trazabilidad de las modificaciones.

La versión vigente será la última versión cerrada correctamente.

## 5. Reapertura y correcciones

### 5.1. Autorización

Únicamente ADMIN podrá reabrir una semana cerrada.

SUPERVISOR podrá consultar los registros, pero no reabrir ni modificar períodos históricos.

### 5.2. Procedimiento

1. ADMIN selecciona una semana cerrada.
2. El sistema solicita obligatoriamente el motivo de reapertura.
3. Se registra quién realizó la operación y cuándo.
4. El período pasa al estado REABIERTA.
5. ADMIN realiza las correcciones necesarias.
6. Cada modificación queda registrada en auditoría.
7. ADMIN ejecuta el cierre nuevamente.
8. Se genera una nueva versión del consolidado.

### 5.3. Restricciones

- Mientras una semana esté reabierta, solo ADMIN podrá realizar correcciones históricas.
- SUPERVISOR tendrá acceso de consulta.
- El sistema no deberá cerrar automáticamente una semana reabierta.
- La versión anterior seguirá disponible.
- El nuevo cierre no podrá eliminar la trazabilidad del anterior.

## 6. Marcaciones tardías

Una marcación tardía es aquella que llega al servidor después del cierre de la semana a la que pertenece, según su fecha real de realización.

### 6.1. Procedimiento

1. El sistema identifica el período al que corresponde.
2. Conserva la información original.
3. Registra la fecha y hora de recepción.
4. Identifica la marcación como pendiente de incorporación.
5. La presenta en una bandeja de revisión exclusiva de ADMIN.
6. ADMIN revisa la información.
7. Si corresponde incorporarla, ADMIN reabre la semana.
8. Se realiza la incorporación y el cierre nuevamente.
9. Si no corresponde, ADMIN podrá rechazarla indicando el motivo.

### 6.2. Protección

Una marcación tardía nunca deberá modificar automáticamente un período cerrado.

El registro original, la decisión administrativa y cualquier incorporación posterior deberán conservar su trazabilidad.

El mecanismo deberá evitar que una misma marcación se incorpore más de una vez.

## 7. Incidencias

Las incidencias no se eliminarán ni cerrarán automáticamente por terminar una semana.

Reglas:

- Las incidencias pendientes podrán continuar abiertas durante varias semanas.
- Las justificadas, resueltas y rechazadas conservarán su estado histórico.
- La incidencia deberá permanecer relacionada con el empleado y los registros correspondientes.
- Los consolidados deberán distinguir incidencias abiertas de incidencias resueltas.
- Una incidencia pendiente no deberá desaparecer del historial cuando cambie el período semanal.

## 8. Conservación de información

La retención será indefinida.

Se conservarán:

- Marcaciones originales.
- Historial de correcciones.
- Versiones de cierre.
- Incidencias.
- Justificaciones y resoluciones.
- Registros de auditoría.
- Historial de empleados.
- Reaperturas.
- Marcaciones tardías y sus decisiones.

Desactivar o retirar un empleado no deberá eliminar sus registros históricos.

No se implementarán eliminaciones automáticas por antigüedad.

## 9. Consolidados

### 9.1. Consolidado semanal

Deberá contemplar:

- Empleados registrados.
- Marcaciones.
- Asistencias.
- Tardanzas.
- Ausencias.
- Jornadas incompletas.
- Incidencias.
- Resultados individuales.
- Resultado general del período.

### 9.2. Consolidado mensual

Deberá contemplar:

- Resultados agrupados por fechas calendario.
- Comparación entre semanas.
- Asistencia individual.
- Tardanzas.
- Ausencias.
- Jornadas incompletas.
- Incidencias pendientes y resueltas.

### 9.3. Consolidado anual

Deberá contemplar:

- Resultados por mes.
- Comparación mensual.
- Indicadores anuales.
- Historial individual.
- Resumen general de asistencia.

Los consolidados mensuales y anuales deberán poder actualizarse cuando una semana sea corregida y cerrada nuevamente.

No se duplicarán innecesariamente las marcaciones originales para generar los consolidados.

## 10. Historial individual

ADMIN y SUPERVISOR podrán seleccionar un empleado y consultar:

- Marcaciones por día.
- Horarios de entrada y salida.
- Tardanzas.
- Ausencias.
- Jornadas incompletas.
- Incidencias y justificaciones.
- Resumen semanal.
- Resumen mensual.
- Resumen anual.

Los empleados inactivos deberán permanecer disponibles para consultas históricas.

## 11. Notificaciones internas

Las notificaciones se mostrarán exclusivamente dentro de la aplicación.

No se contempla integración de correo electrónico para esta primera versión.

Las cuentas ADMIN recibirán notificaciones cuando:

- Una semana se cierre correctamente.
- Un cierre falle y requiera atención.
- Se acumulen intentos fallidos.
- Existan cierres pendientes.
- Lleguen marcaciones tardías.
- Se reabra una semana.
- Se cierre nuevamente una semana reabierta.

Cada notificación deberá conservar:

- Tipo de evento.
- Fecha y hora.
- Período relacionado.
- Descripción.
- Estado leído o no leído.
- Acceso al registro relacionado cuando corresponda.

SUPERVISOR podrá consultar los estados de cierre, pero no administrar el proceso.

## 12. Control de cierres

El módulo incluirá una sección administrativa para consultar:

- Semanas cerradas.
- Semanas pendientes.
- Cierres fallidos.
- Intentos realizados.
- Fecha del último intento.
- Motivo del error, cuando esté disponible.
- Versiones de cierre.
- Semanas reabiertas.

El control deberá permitir identificar procesos pendientes de recuperación.

La forma de ejecutar las tareas programadas y garantizar su recuperación deberá definirse durante el diseño técnico de implementación, considerando la infraestructura real del proyecto.

## 13. Exportaciones

El módulo deberá permitir exportar información a Excel:

- Reporte semanal.
- Reporte mensual.
- Reporte anual.
- Historial individual.

Los documentos deberán identificar:

- Período consultado.
- Fecha y hora de generación.
- Versión del cierre utilizada, cuando corresponda.
- Estado del período.
- Si los resultados corresponden a información corregida después de una reapertura.

Las exportaciones no deberán modificar los registros originales.

## 14. Estructura de pantallas

El módulo Historial tendrá las siguientes secciones:

1. Resumen general.
2. Consulta de semanas.
3. Consulta de meses.
4. Consulta de años.
5. Historial individual.
6. Bandeja de marcaciones tardías.
7. Control de cierres.
8. Auditoría histórica.

La interfaz deberá respetar el diseño visual y la estructura existentes en INTECOAL Asistencia.

## 15. Permisos

| Función | ADMIN | SUPERVISOR |
|---|---|---|
| Consultar historial | Sí | Sí |
| Consultar semanas | Sí | Sí |
| Consultar meses y años | Sí | Sí |
| Consultar historial individual | Sí | Sí |
| Exportar reportes | Sí | Sí |
| Consultar estado de cierres | Sí | Sí |
| Administrar cierres | Sí | No |
| Reabrir semanas | Sí | No |
| Corregir semanas reabiertas | Sí | No |
| Resolver marcaciones tardías | Sí | No |
| Consultar auditoría | Sí | Según permisos de consulta definidos para el módulo |

Los permisos de EMPLEADO y KIOSCO no forman parte del alcance inicial del módulo administrativo Historial.

## 16. Consideraciones técnicas obligatorias

Antes de implementar:

- Revisar los modelos actuales de Prisma.
- Revisar la lógica existente de marcaciones e incidencias.
- Identificar cómo se calculan actualmente los reportes.
- Revisar la auditoría existente.
- Revisar la configuración de zona horaria.
- Determinar cómo se ejecutarán las tareas programadas en el entorno de desarrollo y producción.
- Diseñar la protección contra ejecuciones concurrentes.
- Diseñar la recuperación ante fallos.
- Garantizar consistencia transaccional.
- Evitar duplicación de registros.
- Evitar modificar innecesariamente módulos ya validados.

No asumir que los modelos, endpoints o campos necesarios ya existen. Su disponibilidad deberá verificarse en el código y la base de datos actuales.

## 17. Criterios de aceptación

El módulo no se considerará terminado hasta comprobar:

1. La creación y consulta de períodos semanales.
2. El cierre automático el lunes a las 00:00 de Colombia.
3. La recuperación de cierres pendientes después de una interrupción.
4. La idempotencia del proceso.
5. La generación y consulta de versiones de cierre.
6. La protección de semanas cerradas.
7. La reapertura exclusiva de ADMIN.
8. La corrección exclusiva de ADMIN durante la reapertura.
9. El registro de auditoría de todas las operaciones.
10. El tratamiento correcto de marcaciones tardías.
11. La conservación de incidencias pendientes.
12. La consulta de empleados inactivos en el historial.
13. La generación correcta de consolidados semanales, mensuales y anuales.
14. La actualización de consolidados después de una corrección.
15. Las notificaciones internas.
16. La exportación de reportes históricos.
17. La correcta separación de permisos entre ADMIN y SUPERVISOR.
18. La conservación de los registros originales sin eliminación automática.

## 18. Alcance de implementación

El módulo se implementará por fases, previa autorización.

No se deberán modificar indiscriminadamente los módulos existentes ni alterar funciones previamente validadas.

Toda modificación del esquema de base de datos, migraciones, endpoints, procesos automáticos o infraestructura deberá estar identificada y autorizada antes de ejecutarse.

La implementación deberá priorizar integridad de datos, seguridad, trazabilidad y facilidad de mantenimiento.

---

**Fin de la especificación funcional y técnica del módulo Historial.**