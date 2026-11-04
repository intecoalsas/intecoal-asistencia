# Contexto Empresarial — INTECOAL S.A.S.

## 1. Identificación y Antecedentes

**INTECOAL S.A.S.** es una organización comprometida con la excelencia operativa, la disciplina laboral y el bienestar de su equipo humano. Para respaldar su crecimiento y asegurar la transparencia en las relaciones laborales, la empresa requiere un sistema moderno, ágil y confiable de control de asistencia de sus empleados.

Históricamente, los mecanismos de registro manual o las dependencias de hojas de cálculo (Google Sheets) y sistemas cerrados presentaban desventajas operativas:
- Vulnerabilidad ante registros extemporáneos o manipulaciones de hora.
- Complejidad para consolidar reportes semanales fidedignos.
- Ausencia de trazabilidad y justificación estricta cuando se realizaban correcciones administrativas.
- Dependencia de computadores locales o software heredado de Recursos Humanos difícil de mantener o ampliar.

---

## 2. Propósito del Proyecto "INTECOAL Asistencia"

El objetivo primordial es construir una **plataforma web independiente, segura, centralizada y automatizada** que permita:
1. Registrar de forma fidedigna y en tiempo real las cuatro marcaciones diarias del personal.
2. Utilizar tecnología de **códigos QR dinámicos** proyectados en pantallas físicas autorizadas (kioscos), eliminando el uso de papel, carnés físicos o huelleros biométricos propensos a fallas mecánicas.
3. Empoderar al colaborador con una **Aplicación Web Progresiva (PWA)** instalable en su teléfono móvil para escanear el QR y consultar su historial personal.
4. Proveer al equipo de Talento Humano y Administración una herramienta de monitoreo, resolución de incidencias con auditoría estricta y consolidación automática de reportes en Excel enviados cada viernes.

---

## 3. Delimitación Estricta del Alcance (Límites del Proyecto)

Para garantizar el éxito de la implementación y cumplir los principios de modularidad, se establecen fronteras claras:

### ✅ Dentro del Alcance
- Gestión de usuarios y perfiles de acceso (Administrador, Supervisor, Empleado, Kiosco).
- Administración de terminales de proyección (Kioscos autorizados).
- Asignación de horarios con **vigencia histórica** y tolerancias de puntualidad configurables.
- Registro de las **4 marcaciones oficiales diarias**:
  1. Entrada de la mañana.
  2. Salida al descanso / almuerzo.
  3. Entrada después del descanso / almuerzo.
  4. Salida al finalizar la jornada.
- Detección automática y gestión de **incidencias** (marcas fuera de secuencia o registros faltantes).
- Módulo de **auditoría inmutable** para cualquier ajuste o corrección administrativa.
- Generación de reportes semanales en formato **Excel (.xlsx)**.
- Despacho automático por correo electrónico cada viernes mediante tareas programadas de infraestructura.

### 🚫 Fuera del Alcance (Exclusiones Expresas)
- **Nómina y Liquidaciones:** El sistema NO calculará pagos, nómina electrónica, prestaciones sociales ni valores monetarios de recargos.
- **Módulos Generales de Recursos Humanos:** No incluye gestión de selección, hojas de vida, contratos laborales, evaluaciones de desempeño o gestión de vacaciones.
- **Contratistas y Terceros:** En esta primera versión, el sistema está enfocado exclusivamente en empleados directos de la empresa.
- **Sistemas Anteriores:** No se migran bases de datos obsoletas ni se crean dependencias con el software anterior de RR. HH. ni con Google Sheets.

---

## 4. Principios Rectores

1. **Exactitud Temporal:** Toda marcación se rige por la hora del servidor en la zona horaria oficial `America/Bogota` (UTC-5).
2. **Inmutabilidad y Honestidad del Dato:** Ningún registro se sobreescribe o elimina físicamente. Si ocurre una corrección, el historial conserva el dato original, el dato nuevo y la justificación.
3. **No Dependencia de Hardware Local:** Los procesos críticos (como el reporte semanal de los viernes) corren en infraestructura alojada en la nube, operando sin interrupción aún si todos los computadores de la sede física están apagados.

