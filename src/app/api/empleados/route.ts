
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { Prisma, Role } from "@prisma/client";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

// Roles que pueden ser asignados desde este módulo (KIOSCO no se asigna aquí)
const ASSIGNABLE_ROLES: Role[] = ["ADMIN", "SUPERVISOR", "EMPLEADO"];

/**
 * Devuelve qué roles puede asignar el usuario autenticado.
 * ADMIN → ADMIN, SUPERVISOR, EMPLEADO
 * SUPERVISOR → SUPERVISOR, EMPLEADO
 */
function getAllowedAssignableRoles(callerRole: Role): Role[] {
  if (callerRole === "ADMIN") return ["ADMIN", "SUPERVISOR", "EMPLEADO"];
  if (callerRole === "SUPERVISOR") return ["SUPERVISOR", "EMPLEADO"];
  return [];
}

// ---------------------------------------------------------------------------
// GET: consultar empleados (ADMIN y SUPERVISOR)
// ---------------------------------------------------------------------------
export const GET = requireAuth(async () => {
  const employees = await db.user.findMany({
    where: {
      role: { in: ["EMPLEADO", "SUPERVISOR", "ADMIN"] },
    },
    select: {
      id: true,
      documento: true,
      nombre: true,
      apellido: true,
      email: true,
      cargo: true,
      role: true,
      isActive: true,
      createdAt: true,
    },
    orderBy: {
      nombre: "asc",
    },
  });

  return NextResponse.json({ employees });
}, ["ADMIN", "SUPERVISOR"]);

// ---------------------------------------------------------------------------
// POST: crear empleado (ADMIN y SUPERVISOR)
// ---------------------------------------------------------------------------
export const POST = requireAuth(async (req, caller) => {
  try {
    const body: unknown = await req.json();

    if (
      typeof body !== "object" ||
      body === null ||
      Array.isArray(body)
    ) {
      return NextResponse.json(
        { error: "Datos inválidos" },
        { status: 400 }
      );
    }

    const data = body as Record<string, unknown>;

    const documento =
      typeof data.documento === "string"
        ? data.documento.trim()
        : "";

    const nombre =
      typeof data.nombre === "string"
        ? data.nombre.trim()
        : "";

    const apellido =
      typeof data.apellido === "string"
        ? data.apellido.trim()
        : "";

    const email =
      typeof data.email === "string"
        ? data.email.trim().toLowerCase()
        : "";

    const cargo =
      typeof data.cargo === "string"
        ? data.cargo.trim()
        : "";

    const password =
      typeof data.password === "string"
        ? data.password
        : "";

    // Determinar el rol a asignar
    const rawRole =
      typeof data.role === "string" ? data.role.trim().toUpperCase() : "";

    const allowedRoles = getAllowedAssignableRoles(caller.role);

    if (allowedRoles.length === 0) {
      return NextResponse.json(
        { error: "Sin permisos para crear empleados" },
        { status: 403 }
      );
    }

    // Si no se envía rol, usar EMPLEADO por defecto
    let targetRole: Role = "EMPLEADO";

    if (rawRole !== "") {
      if (!ASSIGNABLE_ROLES.includes(rawRole as Role)) {
        return NextResponse.json(
          { error: "Rol no válido" },
          { status: 400 }
        );
      }

      if (!allowedRoles.includes(rawRole as Role)) {
        return NextResponse.json(
          { error: "No tienes permiso para asignar ese rol" },
          { status: 403 }
        );
      }

      targetRole = rawRole as Role;
    }

    // Validaciones de campos obligatorios
    if (!documento || !nombre || !apellido || !email || !password) {
      return NextResponse.json(
        { error: "Completa todos los campos obligatorios" },
        { status: 400 }
      );
    }

    if (documento.length > 50) {
      return NextResponse.json(
        { error: "La identificación es demasiado larga" },
        { status: 400 }
      );
    }

    if (
      nombre.length > 100 ||
      apellido.length > 100 ||
      email.length > 254 ||
      cargo.length > 150
    ) {
      return NextResponse.json(
        { error: "Uno de los campos supera la longitud permitida" },
        { status: 400 }
      );
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { error: "El correo electrónico no es válido" },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: "La contraseña debe tener al menos 8 caracteres" },
        { status: 400 }
      );
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const employee = await db.user.create({
      data: {
        documento,
        nombre,
        apellido,
        email,
        passwordHash,
        cargo: cargo || null,
        role: targetRole,
        isActive: true,
      },
      select: {
        id: true,
        documento: true,
        nombre: true,
        apellido: true,
        email: true,
        cargo: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });

    return NextResponse.json(
      {
        message: "Empleado creado correctamente",
        employee,
      },
      { status: 201 }
    );
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "El documento o correo electrónico ya está registrado" },
        { status: 409 }
      );
    }

    console.error("Error al crear empleado:", error);

    return NextResponse.json(
      { error: "No fue posible registrar el empleado" },
      { status: 500 }
    );
  }
}, ["ADMIN", "SUPERVISOR"]);

// ---------------------------------------------------------------------------
// PATCH: activar/desactivar empleado o cambiar su rol (ADMIN y SUPERVISOR)
// ---------------------------------------------------------------------------
export const PATCH = requireAuth(async (req, caller) => {
  try {
    const body: unknown = await req.json();

    if (
      typeof body !== "object" ||
      body === null ||
      Array.isArray(body)
    ) {
      return NextResponse.json(
        { error: "Datos inválidos" },
        { status: 400 }
      );
    }

    const data = body as {
      id?: string;
      isActive?: boolean;
      role?: string;
      newPassword?: unknown;
    };

    const { id } = data;

    if (typeof id !== "string" || !id.trim()) {
      return NextResponse.json(
        { error: "Faltan campos obligatorios" },
        { status: 400 }
      );
    }

    // Al menos una operación debe enviarse
    const hasIsActive = typeof data.isActive === "boolean";
    const hasRole = typeof data.role === "string" && data.role.trim() !== "";

    // newPassword: solo ADMIN puede usarlo; se valida más adelante
    const rawNewPassword =
      typeof data.newPassword === "string" ? data.newPassword : "";
    const hasNewPassword = rawNewPassword.length > 0;

    if (!hasIsActive && !hasRole && !hasNewPassword) {
      return NextResponse.json(
        { error: "Debe indicar al menos un campo a actualizar (isActive, role o newPassword)" },
        { status: 400 }
      );
    }

    // Solo ADMIN puede restablecer contraseñas
    if (hasNewPassword && caller.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Solo un administrador puede restablecer contraseñas" },
        { status: 403 }
      );
    }

    // Validar política de contraseña
    if (hasNewPassword && rawNewPassword.length < 8) {
      return NextResponse.json(
        { error: "La nueva contraseña debe tener al menos 8 caracteres" },
        { status: 400 }
      );
    }

    // Impedir que el usuario modifique su propio registro
    if (id === caller.id) {
      return NextResponse.json(
        { error: "No puedes modificar tu propio usuario" },
        { status: 403 }
      );
    }

    const target = await db.user.findUnique({
      where: { id },
    });

    if (!target) {
      return NextResponse.json(
        { error: "Empleado no encontrado" },
        { status: 404 }
      );
    }

    // KIOSCO no es gestionable desde este módulo
    if (target.role === "KIOSCO") {
      return NextResponse.json(
        { error: "Los usuarios de tipo KIOSCO no se gestionan desde aquí" },
        { status: 403 }
      );
    }

    // SUPERVISOR no puede modificar a un ADMIN
    if (caller.role === "SUPERVISOR" && target.role === "ADMIN") {
      return NextResponse.json(
        { error: "No tienes permiso para modificar a un administrador" },
        { status: 403 }
      );
    }

    const updateData: Partial<{ isActive: boolean; role: Role; passwordHash: string }> = {};

    // Variable para conservar el rawRole fuera del bloque hasRole
    // y poder evaluar needsAdminProtection después de ambos bloques.
    let pendingRawRole = "";

    // Cambio de estado activo/inactivo
    if (hasIsActive) {
      updateData.isActive = data.isActive as boolean;
    }

    // Cambio de rol — validaciones de permiso; sin count aquí
    if (hasRole) {
      pendingRawRole = (data.role as string).trim().toUpperCase();

      if (!ASSIGNABLE_ROLES.includes(pendingRawRole as Role)) {
        return NextResponse.json(
          { error: "Rol no válido" },
          { status: 400 }
        );
      }

      const allowedRoles = getAllowedAssignableRoles(caller.role);

      if (!allowedRoles.includes(pendingRawRole as Role)) {
        return NextResponse.json(
          { error: "No tienes permiso para asignar ese rol" },
          { status: 403 }
        );
      }

      updateData.role = pendingRawRole as Role;
    }

    // Restablecimiento de contraseña — solo ADMIN, ya validado arriba
    if (hasNewPassword) {
      // bcrypt.hash nunca devuelve la contraseña en texto plano;
      // no se registra rawNewPassword en ningún log.
      updateData.passwordHash = await bcrypt.hash(rawNewPassword, 10);
    }

    // -----------------------------------------------------------------------
    // Protección del último ADMIN activo — corrección M-1 (revisada)
    //
    // Situaciones que requieren la guardia:
    //   a) Desactivar a un ADMIN (isActive: false sobre target ADMIN)
    //   b) Degradar a un ADMIN activo a otro rol
    //
    // ESTRATEGIA:
    //   Se usa $queryRaw con SELECT … FOR UPDATE para adquirir X-locks
    //   exclusivos sobre TODAS las filas de ADMIN activos dentro de la
    //   transacción. Los X-locks son incompatibles entre sí: una segunda
    //   transacción concurrente que intente el mismo SELECT FOR UPDATE
    //   quedará bloqueada hasta que la primera confirme o revierta,
    //   garantizando que lea el estado real post-primera-transacción.
    //   Esto protege también el caso de dos solicitudes que apuntan a
    //   dos ADMINs distintos: ambas compiten por el mismo lock set,
    //   por lo que se serializan estrictamente.
    //
    //   El aislamiento es RepeatableRead (default de MySQL InnoDB) porque
    //   FOR UPDATE ya proporciona la serialización necesaria sin introducir
    //   el riesgo de deadlock por shared-lock upgrade que tiene SERIALIZABLE.
    //
    //   MANEJO DE ERRORES:
    //   Si InnoDB aborta la transacción por deadlock o timeout de lock
    //   (error Prisma P2034), se reintenta hasta MAX_RETRIES veces con
    //   backoff exponencial. Si los reintentos se agotan, se devuelve 409.
    // -----------------------------------------------------------------------
    const deactivatingAdmin =
      hasIsActive &&
      (data.isActive as boolean) === false &&
      target.role === "ADMIN";

    const degradingAdmin =
      hasRole &&
      target.role === "ADMIN" &&
      pendingRawRole !== "ADMIN" &&
      target.isActive;

    const needsAdminProtection = deactivatingAdmin || degradingAdmin;

    // Tipo de retorno tipado para el select final
    type UpdatedEmployee = {
      id: string;
      documento: string;
      nombre: string;
      apellido: string;
      email: string;
      cargo: string | null;
      role: Role;
      isActive: boolean;
      createdAt: Date;
    };

    // Sentinel distinguible de cualquier error de Prisma/runtime
    class LastAdminGuardError extends Error {
      constructor() {
        super("LAST_ADMIN_GUARD");
        this.name = "LastAdminGuardError";
      }
    }

    // Tipo raw del resultado de $queryRaw para el FOR UPDATE
    type AdminIdRow = { id: string };

    // Número máximo de reintentos ante P2034 (deadlock / write conflict)
    const MAX_RETRIES = 3;

    /**
     * Ejecuta la transacción protegida con SELECT … FOR UPDATE.
     * Lanza LastAdminGuardError si quedarían 0 ADMINs activos.
     * Lanza PrismaClientKnownRequestError con code P2034 en caso de
     * deadlock o conflicto de escritura (el llamador debe reintentar).
     */
    async function runProtectedUpdate(): Promise<UpdatedEmployee> {
      return db.$transaction(async (tx) => {
        // SELECT FOR UPDATE: adquiere X-locks sobre todas las filas
        // de ADMINs activos. Dos transacciones concurrentes no pueden
        // mantener X-locks sobre el mismo conjunto simultáneamente;
        // la segunda espera hasta que la primera libere los locks.
        const rows = await tx.$queryRaw<AdminIdRow[]>`
          SELECT id
          FROM   users
          WHERE  role     = 'ADMIN'
            AND  isActive = TRUE
          FOR UPDATE
        `;

        if (rows.length <= 1) {
          throw new LastAdminGuardError();
        }

        return tx.user.update({
          where: { id },
          data: updateData,
          select: {
            id: true,
            documento: true,
            nombre: true,
            apellido: true,
            email: true,
            cargo: true,
            role: true,
            isActive: true,
            createdAt: true,
          },
        });
      });
      // Sin isolationLevel explícito → usa el default de MySQL InnoDB
      // (REPEATABLE READ). FOR UPDATE ya garantiza la serialización
      // necesaria sin el riesgo extra de SERIALIZABLE.
    }

    let updated: UpdatedEmployee;

    if (needsAdminProtection) {
      let lastError: unknown;
      let succeeded = false;

      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
          updated = await runProtectedUpdate();
          succeeded = true;
          break;
        } catch (err) {
          // Error de guardia propia: no reintentar, responder 409 de inmediato
          if (err instanceof LastAdminGuardError) {
            const msg = deactivatingAdmin
              ? "No puedes desactivar al único administrador activo"
              : "No puedes cambiar el rol del único administrador activo";

            return NextResponse.json({ error: msg }, { status: 409 });
          }

          // P2034: deadlock o write conflict de MySQL (1213 / 1205) — reintentable
          // P2028 + "expired transaction": timeout del ITX de Prisma — reintentable.
          //   Prisma garantiza ROLLBACK antes de lanzar este subtipo, por lo que no
          //   hay cambios parciales pendientes. Otros subtipos de P2028 (transaction
          //   not found, already closed, invalid isolation level) NO son transitorios
          //   y no se reintentan.
          const isRetryable =
            err instanceof Prisma.PrismaClientKnownRequestError &&
            (err.code === "P2034" ||
              (err.code === "P2028" &&
                err.message.includes("expired transaction")));

          if (isRetryable) {
            lastError = err;
            // Backoff exponencial: 50 ms, 100 ms, 200 ms …
            await new Promise<void>((resolve) =>
              setTimeout(resolve, 50 * Math.pow(2, attempt))
            );
            continue;
          }

          // Cualquier otro error no es reintentable
          throw err;
        }
      }

      // Si llegamos aquí sin éxito, los reintentos se agotaron (P2034)
      if (!succeeded) {
        console.error(
          "Reintentos de transacción agotados (P2034):",
          lastError
        );

        return NextResponse.json(
          {
            error:
              "La operación no pudo completarse por conflicto de concurrencia. Inténtalo de nuevo.",
          },
          { status: 409 }
        );
      }
    } else {
      updated = await db.user.update({
        where: { id },
        data: updateData,
        select: {
          id: true,
          documento: true,
          nombre: true,
          apellido: true,
          email: true,
          cargo: true,
          role: true,
          isActive: true,
          createdAt: true,
        },
      });
    }

    return NextResponse.json(
      { employee: updated! },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error al actualizar empleado:", error);

    return NextResponse.json(
      { error: "No fue posible actualizar el empleado" },
      { status: 500 }
    );
  }
}, ["ADMIN", "SUPERVISOR"]);
