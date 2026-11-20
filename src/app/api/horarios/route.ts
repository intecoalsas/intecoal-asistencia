
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import {
  getNowUtc,
  getFechaLaboral,
} from "@/lib/date-utils";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function parseDateOnly(value: unknown): Date | null {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value)
  ) {
    return null;
  }

  const date = new Date(`${value}T00:00:00.000Z`);

  if (
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    return null;
  }

  return date;
}

function getPreviousDay(date: Date): Date {
  const previous = new Date(date);
  previous.setUTCDate(previous.getUTCDate() - 1);
  return previous;
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// -----------------------------------------------------------------------------
// GET /api/horarios
//
// ADMIN     -> consulta todas las asignaciones.
// EMPLEADO  -> consulta únicamente sus propias asignaciones.
//
// Incluye políticas, reglas diarias y vigencias reales.
// -----------------------------------------------------------------------------

export const GET = requireAuth(async (_req, user) => {
  try {
    const today = getFechaLaboral(getNowUtc());

    const assignments =
      await db.employeeScheduleAssignment.findMany({
        where:
          user.role === "ADMIN" || user.role === "SUPERVISOR"
            ? {}
            : { userId: user.id },

        include: {
          policy: {
            include: {
              dayRules: {
                orderBy: {
                  dia: "asc",
                },
              },
            },
          },
          user: {
            select: {
              id: true,
              nombre: true,
              apellido: true,
              documento: true,
              cargo: true,
              isActive: true,
            },
          },
        },

        orderBy: [
          { validFrom: "desc" },
          { createdAt: "desc" },
        ],
      });

    const horarios = assignments.map((assignment) => {
      const isCurrent =
        assignment.validFrom <= today &&
        (
          assignment.validUntil === null ||
          assignment.validUntil >= today
        );

      let estado: "Activa" | "Futura" | "Finalizada";

      if (isCurrent) {
        estado = "Activa";
      } else if (assignment.validFrom > today) {
        estado = "Futura";
      } else {
        estado = "Finalizada";
      }

      return {
        assignmentId: assignment.id,

        employeeId: assignment.user.id,
        name: `${assignment.user.nombre} ${assignment.user.apellido}`,
        id: assignment.user.documento,
        cargo: assignment.user.cargo ?? "",
        employeeActive: assignment.user.isActive,

        policy: {
          id: assignment.policy.id,
          nombre: assignment.policy.nombre,
          descripcion: assignment.policy.descripcion,
          isActive: assignment.policy.isActive,
          toleranciaEntradaMinutos:
            assignment.policy.toleranciaEntradaMinutos,
          toleranciaAlmuerzoMinutos:
            assignment.policy.toleranciaAlmuerzoMinutos,
          minimoMinutosAlmuerzo:
            assignment.policy.minimoMinutosAlmuerzo,
        },

        validFrom: formatDate(assignment.validFrom),
        validUntil: assignment.validUntil
          ? formatDate(assignment.validUntil)
          : null,

        toleranciaPersonalizadaMin:
          assignment.toleranciaPersonalizadaMin,

        estado,

        // Horarios reales configurados para cada día.
        reglas: assignment.policy.dayRules.map((rule) => ({
          id: rule.id,
          dia: rule.dia,
          horaEntradaManana: rule.horaEntradaManana,
          horaSalidaAlmuerzo: rule.horaSalidaAlmuerzo,
          horaEntradaAlmuerzo: rule.horaEntradaAlmuerzo,
          horaSalidaJornada: rule.horaSalidaJornada,
          esLaboral: rule.esLaboral,
        })),
      };
    });

    return NextResponse.json(
      { horarios },
      { status: 200 }
    );
  } catch (error) {
    console.error(
      "[GET /api/horarios] Error:",
      error
    );

    return NextResponse.json(
      { error: "No fue posible consultar los horarios" },
      { status: 500 }
    );
  }
}, ["ADMIN", "EMPLEADO", "SUPERVISOR"]);

// -----------------------------------------------------------------------------
// POST /api/horarios
//
// Solo ADMIN.
//
// Body:
// {
//   "employeeId": "UUID del empleado",
//   "policyId": "UUID de la política",
//   "validFrom": "YYYY-MM-DD"
// }
//
// Cierra la asignación anterior el día previo al inicio de la nueva.
// Conserva todas las asignaciones históricas.
// -----------------------------------------------------------------------------

export const POST = requireAuth(async (req) => {
  try {
    // ---------------------------------------------------------------------
    // 1. Validar cuerpo
    // ---------------------------------------------------------------------

    let body: unknown;

    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "El cuerpo de la solicitud no es JSON válido" },
        { status: 400 }
      );
    }

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

    const employeeId =
      typeof data.employeeId === "string"
        ? data.employeeId.trim()
        : "";

    const policyId =
      typeof data.policyId === "string"
        ? data.policyId.trim()
        : "";

    const validFrom = parseDateOnly(data.validFrom);

    if (!employeeId || !policyId || !validFrom) {
      return NextResponse.json(
        {
          error:
            "Se requiere employeeId, policyId y una fecha válida en formato YYYY-MM-DD",
        },
        { status: 400 }
      );
    }

    // ---------------------------------------------------------------------
    // 2. Transacción: validar y crear asignación
    // ---------------------------------------------------------------------

    const result = await db.$transaction(
      async (tx) => {
        // Verificar empleado.
        const employee = await tx.user.findUnique({
          where: {
            id: employeeId,
          },
          select: {
            id: true,
            documento: true,
            nombre: true,
            apellido: true,
            role: true,
            isActive: true,
          },
        });

        if (!employee || employee.role !== "EMPLEADO") {
          return {
            error: "Empleado no encontrado",
            status: 404,
          };
        }

        if (!employee.isActive) {
          return {
            error: "No se puede asignar un horario a un empleado inactivo",
            status: 409,
          };
        }

        // Verificar política.
        const policy = await tx.schedulePolicy.findUnique({
          where: {
            id: policyId,
          },
          include: {
            dayRules: true,
          },
        });

        if (!policy) {
          return {
            error: "Política de horario no encontrada",
            status: 404,
          };
        }

        if (!policy.isActive) {
          return {
            error: "No se puede asignar una política inactiva",
            status: 409,
          };
        }

        const hasWorkingDay = policy.dayRules.some(
          (rule) => rule.esLaboral
        );

        if (!hasWorkingDay) {
          return {
            error: "La política no tiene días laborales configurados",
            status: 409,
          };
        }

        // Buscar asignaciones que comiencen en la fecha nueva
        // o después. Una nueva asignación indefinida entraría
        // en conflicto con cualquiera de ellas.
        const futureAssignments =
          await tx.employeeScheduleAssignment.findMany({
            where: {
              userId: employeeId,
              validFrom: {
                gte: validFrom,
              },
            },
            select: {
              id: true,
              validFrom: true,
            },
          });

        if (futureAssignments.length > 0) {
          return {
            error:
              "El empleado ya tiene una asignación que comienza en esa fecha o después. Revisa las asignaciones futuras antes de continuar.",
            status: 409,
          };
        }

        // Buscar una asignación anterior que todavía cubra
        // la fecha de inicio de la nueva asignación.
        const overlappingAssignments =
          await tx.employeeScheduleAssignment.findMany({
            where: {
              userId: employeeId,
              validFrom: {
                lt: validFrom,
              },
              OR: [
                { validUntil: null },
                {
                  validUntil: {
                    gte: validFrom,
                  },
                },
              ],
            },
            select: {
              id: true,
              validFrom: true,
              validUntil: true,
            },
            orderBy: {
              validFrom: "desc",
            },
          });

        if (overlappingAssignments.length > 1) {
          return {
            error:
              "Se detectaron asignaciones históricas superpuestas. Es necesario revisar el historial antes de asignar otro horario.",
            status: 409,
          };
        }

        let previousAssignmentId: string | null = null;

        // Cerrar asignación anterior si existe.
        if (overlappingAssignments.length === 1) {
          const previous = overlappingAssignments[0];
          const previousDay = getPreviousDay(validFrom);

          if (previous.validFrom > previousDay) {
            return {
              error:
                "La fecha de inicio genera una vigencia anterior inválida.",
              status: 409,
            };
          }

          await tx.employeeScheduleAssignment.update({
            where: {
              id: previous.id,
            },
            data: {
              validUntil: previousDay,
            },
          });

          previousAssignmentId = previous.id;
        }

        // Crear nueva asignación.
        const assignment =
          await tx.employeeScheduleAssignment.create({
            data: {
              userId: employeeId,
              schedulePolicyId: policyId,
              validFrom,
              validUntil: null,
            },
            select: {
              id: true,
              userId: true,
              schedulePolicyId: true,
              validFrom: true,
              validUntil: true,
              createdAt: true,
            },
          });

        return {
          assignment,
          previousAssignmentId,
          employee: {
            id: employee.id,
            documento: employee.documento,
            nombre: employee.nombre,
            apellido: employee.apellido,
          },
          policy: {
            id: policy.id,
            nombre: policy.nombre,
          },
        };
      },
      {
        isolationLevel:
          Prisma.TransactionIsolationLevel.Serializable,
      }
    );

    if ("error" in result) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status }
      );
    }

    return NextResponse.json(
      {
        message: "Horario asignado correctamente",
        assignment: {
          ...result.assignment,
          validFrom: formatDate(result.assignment.validFrom),
          validUntil: result.assignment.validUntil
            ? formatDate(result.assignment.validUntil)
            : null,
        },
        previousAssignmentId: result.previousAssignmentId,
        employee: result.employee,
        policy: result.policy,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error(
      "[POST /api/horarios] Error:",
      error
    );

    if (
      error instanceof
      Prisma.PrismaClientKnownRequestError &&
      error.code === "P2034"
    ) {
      return NextResponse.json(
        {
          error:
            "La asignación entró en conflicto con otra operación. Vuelve a intentarlo.",
        },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: "No fue posible asignar el horario" },
      { status: 500 }
    );
  }
}, ["ADMIN", "SUPERVISOR"]);
