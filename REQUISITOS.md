# Requisitos del Sistema — INTECOAL Asistencia

---

## 1. Requisitos Funcionales (RF)

### RF-01: Autenticación y Control de Acceso (RBAC)
- El sistema debe admitir autenticación segura para usuarios mediante documento de identidad/correo y contraseña encriptada (bcrypt).
- Se deben soportar cuatro roles:
  1. **ADMIN:** Acceso completo a configuración, horarios, usuarios, auditoría y reportes.
  2. **SUPERVISOR:** Monitoreo de asistencia, revisión y resolución de incidencias.
  3. **EMPLEADO:** Acceso móvil vía PWA para escanear QR, consultar su horario asignado e historial personal de marcaciones.
  4. **KIOSCO:** Perfil de terminal dedicada exclusivamente a proyectar el código QR dinámico.

### RF-02: Kioscos Autorizados y Enrolamiento
- Las pantallas que proyectan el código QR deben estar registradas como terminales autorizadas en el sistema (`KioskDevice`).
- Cada kiosco dispondrá de un identificador único y un secreto criptográfico para emitir tokens válidos.
- Si una terminal es deshabilitada por el administrador, sus tokens dejarán de ser aceptados de inmediato.

### RF-03: Generación y Validación de QR Dinámico
- El kiosco debe generar y refrescar periódicamente un código QR (intervalo configurable entre 15 y 30 segundos).
- El contenido del QR debe ser un token firmado criptográficamente (HMAC-SHA256) con fecha/hora de emisión, identificador de kiosco y caducidad.
- El servidor debe rechazar tokens vencidos o con firmas alteradas.

### RF-04: Multiusuario con Anti-Duplicidad por Empleado
- Durante la vigencia de un mismo token de QR, múltiples empleados distintos deben poder escanearlo exitosamente.
- El sistema debe impedir que un mismo empleado registre dos veces el mismo evento el mismo día (restricción unívoca: `empleado + fecha + tipo_marcacion`).
- Se debe aplicar un periodo de enfriamiento (cooldown / rate-limit) para evitar lecturas consecutivas accidentales.

### RF-05: Ciclo de Cuatro Marcaciones Diarias
- El sistema debe contemplar y registrar los cuatro eventos laborales del día:
  1. **Entrada de la mañana:** Inicio de jornada laboral.
  2. **Salida al descanso:** Inicio del almuerzo o descanso intermedio.
  3. **Entrada del descanso:** Retorno a actividades laborales.
  4. **Salida de la jornada:** Finalización oficial de labores.
- Toda marcación debe estampar la fecha y hora oficial del servidor en `America/Bogota`.

### RF-06: Horarios con Vigencia Histórica y Tolerancia Configurable
- Los horarios laborales deben admitir rangos de fechas de vigencia (`validFrom` y `validUntil`), evitando que cambios futuros modifiquen el cálculo de asistencias pasadas.
- La tolerancia para la hora de entrada debe ser configurable por política de horario o por empleado (no fija en 5 minutos).
- Se debe parametrizar el tiempo mínimo de almuerzo para asegurar el cumplimiento de pausas legales.

### RF-07: Gestión de Incidencias Operativas
- Si un empleado registra una marcación fuera del orden secuencial lógico (ej. registrar entrada de tarde sin salida de almuerzo), la marcación se almacena y se crea automáticamente una incidencia `FUERA_DE_SECUENCIA`.
- Al finalizar el día, si un empleado tiene marcas incompletas, se genera una incidencia de tipo `MARCACION_FALTANTE`.
- El sistema **nunca debe inventar registros ni marcar ausencias automáticamente** sin evaluación administrativa.
- Los supervisores o administradores deben poder revisar y justificar o resolver las incidencias.

### RF-08: Auditoría e Inmutabilidad de Correcciones
- Las marcaciones originales registradas por escaneo son inmutables.
- Si un administrador corrige una marcación o inserta una marca justificada:
  - El sistema conserva el valor original (`originalTime`) y el corregido (`correctedTime`).
  - Se exige obligatoriamente un motivo de justificación.
  - Se genera un registro inmutable en `AttendanceAuditLog` con el usuario responsable, fecha/hora, snapshot previo y snapshot nuevo en formato JSON.

### RF-09: Generación de Reportes en Excel (.xlsx)
- El sistema debe generar libros de Excel corporativos con el resumen semanal de asistencia.
- El reporte debe incluir:
  - Datos del colaborador (cédula, nombre, cargo).
  - Matriz diaria de las 4 marcaciones con horas exactas.
  - Indicadores de puntualidad (a tiempo, retardo con minutos exactos, salida anticipada).
  - Relación de incidencias y correcciones administrativas con su justificación.

### RF-10: Envío Automático Programado (Viernes)
- El reporte semanal consolidado debe generarse y despacharse automáticamente por correo electrónico cada viernes a la hora configurada.
- El proceso debe ejecutarse de forma desatendida mediante tareas programadas de infraestructura (Serverless Cron / Hosted Task).

---

## 2. Requisitos No Funcionales (RNF)

### RNF-01: Rendimiento y Concurrencia
- El tiempo de validación y respuesta de una marcación debe ser inferior a 1.5 segundos en condiciones normales de red.
- El kiosco y el endpoint de marcación deben soportar ráfagas concurrentes de escaneo en los horarios pico de entrada y salida sin bloqueos de base de datos.

### RNF-02: Seguridad Criptográfica y Anti-Suplantación
- Contraseñas almacenadas mediante algoritmos de derivación de claves robustos (bcrypt).
- Tokens QR dinámicos no reutilizables fuera de su ventana temporal de vida, mitigando el uso de capturas de pantalla o fotografías compartidas.
- Canales de comunicación asegurados sobre HTTPS.

### RNF-03: Zona Horaria Estricta (`America/Bogota`)
- Toda consulta, filtro de fecha, validación de turno y reporte debe basarse de manera forzosa en la zona horaria `America/Bogota` (UTC-5), sin verse afectada por la hora local del dispositivo del usuario ni la zona horaria por defecto del servidor en la nube.

### RNF-04: Usabilidad y Compatibilidad PWA
- La interfaz para empleados debe funcionar como Aplicación Web Progresiva (PWA), instalable en dispositivos Android e iOS.
- Retroalimentación visual inmediata (éxito, advertencia, error) y soporte amigable para permisos de cámara.

### RNF-05: Independencia de Infraestructura Local
- La aplicación no debe depender de servidores o equipos físicos encendidos en las oficinas de la empresa.
- Arquitectura preparada para despliegue en infraestructura administrada de nube (AWS / PostgreSQL gestionado).

