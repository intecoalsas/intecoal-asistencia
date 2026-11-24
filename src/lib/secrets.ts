// src/lib/secrets.ts
//
// Lectura y validación centralizada de los secretos de la aplicación.
//
//  - NEXTAUTH_SECRET: firma de las sesiones (JWT).
//  - CRON_SECRET:     token Bearer de las tareas programadas (/api/cron/*).
//
// Cada secreto es independiente y se inyecta SIEMPRE desde el entorno
// (en AWS, desde Secrets Manager). Aquí no existen valores por defecto ni se
// generan secretos automáticamente.
//
// Fuera de producción solo se exige que la variable exista cuando se usa.
// En producción, además, se rechazan secretos ausentes, cortos, de ejemplo o
// repetidos entre sí. Los mensajes de error nombran la variable, nunca su valor.

import { createHash, timingSafeEqual } from "node:crypto";

export type NombreSecreto = "NEXTAUTH_SECRET" | "CRON_SECRET";

const LONGITUD_MINIMA = 32;

/** Textos típicos de plantillas (p. ej. los de .env.example). */
const MARCADORES_EJEMPLO =
  /(^tu[-_])|cambia|ejemplo|example|changeme|placeholder|reemplaz|ficticio|token-de-seguridad|your[-_ ]/i;

export class ErrorConfiguracionSecreto extends Error {
  constructor(
    readonly variable: string,
    motivo: string
  ) {
    super(`Configuración de seguridad inválida: ${variable} ${motivo}.`);
    this.name = "ErrorConfiguracionSecreto";
  }
}

function esProduccion(): boolean {
  return process.env.NODE_ENV === "production";
}

function motivoInvalido(valor: string): string | null {
  if (valor.length < LONGITUD_MINIMA) {
    return `debe tener al menos ${LONGITUD_MINIMA} caracteres`;
  }
  if (MARCADORES_EJEMPLO.test(valor)) {
    return "contiene un valor de ejemplo; debe ser un secreto aleatorio propio";
  }
  if (new Set(valor).size < 10) {
    return "tiene muy poca variedad de caracteres";
  }
  return null;
}

/**
 * Devuelve el secreto o `undefined` si no está definido fuera de producción.
 * En producción lanza ErrorConfiguracionSecreto si falta o no es válido.
 */
export function leerSecreto(nombre: NombreSecreto): string | undefined {
  const valor = process.env[nombre];

  if (valor === undefined || valor.trim() === "") {
    if (esProduccion()) throw new ErrorConfiguracionSecreto(nombre, "no está definido");
    return undefined;
  }

  if (esProduccion()) {
    const motivo = motivoInvalido(valor);
    if (motivo) throw new ErrorConfiguracionSecreto(nombre, motivo);
  }

  return valor;
}

/** Igual que leerSecreto, pero lanza también fuera de producción si falta. */
export function leerSecretoRequerido(nombre: NombreSecreto): string {
  const valor = leerSecreto(nombre);
  if (!valor) throw new ErrorConfiguracionSecreto(nombre, "no está definido");
  return valor;
}

/**
 * Validación de arranque (producción): comprueba todos los secretos
 * obligatorios y que no se compartan valores entre ellos.
 */
export function validarSecretosProduccion(): void {
  const sesion = leerSecretoRequerido("NEXTAUTH_SECRET");
  const cron = leerSecretoRequerido("CRON_SECRET");

  if (sesion === cron) {
    throw new ErrorConfiguracionSecreto(
      "CRON_SECRET",
      "no puede ser igual a NEXTAUTH_SECRET: cada secreto debe ser independiente"
    );
  }
}

/**
 * Comprueba una cabecera `Authorization: Bearer <token>` contra el secreto en
 * tiempo constante (se comparan los hashes SHA-256 para igualar longitudes).
 */
export function bearerCoincide(cabecera: string | null, secreto: string): boolean {
  const [esquema, token] = (cabecera ?? "").split(" ");
  if (esquema !== "Bearer" || !token) return false;
  const hash = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(hash(token), hash(secreto));
}
