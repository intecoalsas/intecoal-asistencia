// src/instrumentation.ts
//
// Se ejecuta una vez al iniciar el servidor, antes de atender solicitudes.
// En producción valida los secretos obligatorios: si falta alguno o tiene un
// valor de ejemplo, el servidor NO arranca y el motivo queda en los logs
// (en ECS, la tarea falla de forma visible en lugar de operar con secretos débiles).
// No se ejecuta durante `next build`.

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NODE_ENV !== "production") return;

  const { validarSecretosProduccion } = await import("./lib/secrets");
  validarSecretosProduccion();
}
