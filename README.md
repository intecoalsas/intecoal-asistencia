# INTECOAL Asistencia

Sistema web progresivo (PWA) moderno, seguro y escalable para el registro y control de asistencia diaria mediante códigos QR dinámicos para **INTECOAL S.A.S.**

---

## 📌 Documentación de Continuidad

El proyecto cuenta con un conjunto de documentación fundamental para garantizar la trazabilidad técnica y operativa:

1. **[CONTEXTO_EMPRESA.md](./CONTEXTO_EMPRESA.md):** Antecedentes, justificación, objetivos corporativos y límites del sistema.
2. **[REQUISITOS.md](./REQUISITOS.md):** Requisitos funcionales y no funcionales detallados.
3. **[ARQUITECTURA.md](./ARQUITECTURA.md):** Diagramas de arquitectura, componentes, esquema de datos, seguridad de QR dinámico y preparación para AWS.
4. **[REGLAS_ASISTENCIA.md](./REGLAS_ASISTENCIA.md):** Flujo de las 4 marcaciones, cálculo de puntualidad, tolerancias, incidencias y auditoría.
5. **[ESTADO_PROYECTO.md](./ESTADO_PROYECTO.md):** Bitácora de fases, estado actual, decisiones adoptadas y hoja de ruta.

---

## 🚀 Tecnologías Principales

- **Framework Web:** [Next.js](https://nextjs.org/) (App Router, React 19)
- **Lenguaje:** [TypeScript](https://www.typescriptlang.org/)
- **Estilos:** [Tailwind CSS v4](https://tailwindcss.com/)
- **Iconografía:** [Lucide React](https://lucide.dev/)
- **Base de Datos & ORM:** [PostgreSQL](https://www.postgresql.org/) con [Prisma ORM v6](https://www.prisma.io/)
- **Zona Horaria:** `America/Bogota` (UTC-5) gestionada estrictamente mediante `date-fns` y `date-fns-tz`
- **Generación de Reportes:** `exceljs`
- **Autenticación & Criptografía:** Tokens firmados HMAC-SHA256 y hashing seguro

---

## 🛠️ Puesta en Marcha en Desarrollo

### 1. Prerrequisitos
- Node.js `v20.x` o superior (Recomendado: `v24.x`)
- npm `v10.x` o superior
- Instancia accesible de PostgreSQL (local o en la nube)

### 2. Configurar Variables de Entorno
Copia la plantilla de variables de entorno:
```bash
cp .env.example .env
```
Edita `.env` con las credenciales de tu base de datos PostgreSQL y las claves de seguridad requeridas.

### 3. Instalar Dependencias
```bash
npm install
```

### 4. Inicializar Base de Datos (Prisma)
Una vez configurado `DATABASE_URL` en `.env`:
```bash
npx prisma validate
npx prisma generate
```

### 5. Iniciar Servidor de Desarrollo
```bash
npm run dev
```
La aplicación estará disponible en [http://localhost:3000](http://localhost:3000).

---

## 📂 Estructura General del Código

```
intecoal-asistencia/
├── prisma/               # Esquema de Prisma y migraciones de base de datos
├── public/               # Archivos estáticos, iconos y manifiesto PWA
├── src/
│   ├── app/              # Rutas, layouts y endpoints de Next.js App Router
│   ├── components/       # Componentes React reutilizables (UI, layouts)
│   ├── lib/              # Clientes de BD (db.ts), utilidades de fecha (date-utils.ts)
│   ├── modules/          # Lógica de dominio y servicios del negocio
│   │   ├── attendance/   # Reglas de las 4 marcas y validaciones
│   │   ├── schedules/    # Asignación y vigencia histórica de horarios
│   │   ├── kiosk/        # Generación y rotación de QR dinámico
│   │   ├── audit/        # Registro inmutable de correcciones
│   │   └── reports/      # Generación de reportes Excel y cron de envío
│   └── types/            # Tipos e interfaces globales de TypeScript
├── .env.example          # Plantilla de variables de entorno seguras
└── next.config.ts        # Configuración de Next.js
```

---

## 🔒 Reglas de Seguridad y Buenas Prácticas

- **Cero secretos en Git:** Nunca agregues archivos `.env` o llaves privadas al repositorio. El archivo `.gitignore` ya está configurado para protegerlos.
- **Hora del Servidor:** Toda marcación utiliza exclusivamente la estampa de tiempo del servidor en `America/Bogota`. Las horas locales enviadas por navegadores de clientes no son tomadas como válidas.
- **Inmutabilidad:** Las correcciones administrativas no eliminan ni sobreescriben marcaciones existentes en crudo; siempre generan registros en la tabla de auditoría con su respectivo motivo.
