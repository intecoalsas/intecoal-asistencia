# syntax=docker/dockerfile:1
#
# INTECOAL Asistencia — imagen de producción (AWS ECS Fargate).
#
# Construcción:   docker build -t intecoal-asistencia .
# Ejecución:      docker run -p 3000:3000 --env-file <archivo-env> intecoal-asistencia
#
# Notas:
#  - Las variables de entorno (DATABASE_URL, NEXTAUTH_SECRET, QR_HMAC_SECRET,
#    CRON_SECRET, etc.) NO se incluyen en la imagen: se inyectan al ejecutar
#    el contenedor (definición de tarea de ECS).
#  - El contenedor NO ejecuta migraciones al arrancar. Las migraciones de
#    Prisma deben aplicarse como un paso independiente y controlado.
#  - La arquitectura de la imagen es la de la máquina que la construye. Para
#    Fargate ARM64 usar: docker build --platform linux/arm64 ...

ARG NODE_VERSION=24

# ------------------------------------------------------------------------------
# Base común: Node.js LTS (Debian bookworm) + OpenSSL, requerido por el motor
# de consultas de Prisma. Se usa Debian (glibc) y no Alpine (musl) para evitar
# incompatibilidades con los binarios de Prisma.
# ------------------------------------------------------------------------------
FROM node:${NODE_VERSION}-bookworm-slim AS base
ENV NEXT_TELEMETRY_DISABLED=1
RUN apt-get update -y \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# ------------------------------------------------------------------------------
# Dependencias: instalación reproducible desde package-lock.json.
# Incluye devDependencies (prisma CLI, TypeScript, Tailwind) necesarias para
# construir; no pasan a la imagen final.
# ------------------------------------------------------------------------------
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ------------------------------------------------------------------------------
# Construcción: Prisma Client + Next.js en modo producción (standalone).
# ------------------------------------------------------------------------------
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

# ------------------------------------------------------------------------------
# Imagen final: solo la salida standalone, sin código fuente ni devDependencies.
# ------------------------------------------------------------------------------
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0

COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public

# Prisma Client generado y su motor de consultas (se copian de forma explícita
# para no depender del trazado automático de archivos de Next.js).
COPY --from=builder --chown=node:node /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=node:node /app/node_modules/@prisma/client ./node_modules/@prisma/client

# Usuario no privilegiado incluido en la imagen oficial de Node.js (uid 1000).
USER node

EXPOSE 3000

# Arranque directo del servidor standalone. No se ejecutan migraciones aquí.
CMD ["node", "server.js"]
