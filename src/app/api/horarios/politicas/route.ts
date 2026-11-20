
import { NextResponse } from "next/server";
import { DiaSemana, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

const DIAS = [
    "LUNES",
    "MARTES",
    "MIERCOLES",
    "JUEVES",
    "VIERNES",
    "SABADO",
    "DOMINGO",
] as const;

type ReglaEntrada = {
    dia: string;
    horaEntradaManana: string;
    horaSalidaAlmuerzo: string;
    horaEntradaAlmuerzo: string;
    horaSalidaJornada: string;
    esLaboral: boolean;
};

type Body = Record<string, unknown>;

function obtenerFechaActualBogota(): Date {
    const partes = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Bogota",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).formatToParts(new Date());

    const obtener = (tipo: string) =>
        partes.find((parte) => parte.type === tipo)?.value ?? "";

    const fecha = `${obtener("year")}-${obtener("month")}-${obtener("day")}`;

    return new Date(`${fecha}T00:00:00.000Z`);
}

async function contarAsignacionesActivasOFuturas(
    tx: Prisma.TransactionClient,
    schedulePolicyId: string
): Promise<number> {
    const fechaHoy = obtenerFechaActualBogota();

    return tx.employeeScheduleAssignment.count({
        where: {
            schedulePolicyId,
            OR: [
                { validUntil: null },
                { validUntil: { gte: fechaHoy } },
            ],
        },
    });
}

function esHoraValida(value: unknown): value is string {
    return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function minutosDesdeMedianoche(hora: string): number {
    const [horas, minutos] = hora.split(":").map(Number);
    return horas * 60 + minutos;
}

function esMinutosValidos(value: unknown): value is number {
    return (
        typeof value === "number" &&
        Number.isInteger(value) &&
        value >= 0 &&
        value <= 600
    );
}

async function leerBody(request: Request): Promise<Body | null> {
    try {
        const body: unknown = await request.json();

        if (
            typeof body !== "object" ||
            body === null ||
            Array.isArray(body)
        ) {
            return null;
        }

        return body as Body;
    } catch {
        return null;
    }
}

function validarReglas(
    value: unknown,
    minimoAlmuerzo: number
): { reglas: ReglaEntrada[] } | { error: string } {
    if (!Array.isArray(value) || value.length !== 7) {
        return {
            error: "Debes enviar exactamente una regla para cada día de la semana.",
        };
    }

    const reglas = value as ReglaEntrada[];

    if (
        reglas.some(
            (regla) =>
                !regla ||
                typeof regla !== "object" ||
                typeof regla.dia !== "string" ||
                !DIAS.includes(regla.dia as (typeof DIAS)[number])
        )
    ) {
        return {
            error: "Las reglas contienen días no válidos.",
        };
    }

    const diasRecibidos = reglas.map((regla) => regla.dia);

    if (
        new Set(diasRecibidos).size !== 7 ||
        DIAS.some((dia) => !diasRecibidos.includes(dia))
    ) {
        return {
            error: "Las reglas deben incluir cada día de la semana una sola vez.",
        };
    }

    if (!reglas.some((regla) => regla.esLaboral === true)) {
        return {
            error: "La política debe tener al menos un día laboral.",
        };
    }

    for (const regla of reglas) {
        if (typeof regla.esLaboral !== "boolean") {
            return {
                error: `La configuración laboral de ${regla.dia} no es válida.`,
            };
        }

        const horas = [
            regla.horaEntradaManana,
            regla.horaSalidaAlmuerzo,
            regla.horaEntradaAlmuerzo,
            regla.horaSalidaJornada,
        ];

        if (!horas.every(esHoraValida)) {
            return {
                error: `Las horas de ${regla.dia} deben tener el formato HH:mm.`,
            };
        }

        if (regla.esLaboral) {
            const [entrada, salidaAlmuerzo, regreso, salida] =
                horas.map(minutosDesdeMedianoche);

            if (
                entrada >= salidaAlmuerzo ||
                salidaAlmuerzo >= regreso ||
                regreso >= salida
            ) {
                return {
                    error: `Las horas de ${regla.dia} deben seguir este orden: entrada, salida a almuerzo, regreso y salida de jornada.`,
                };
            }

            if (regreso - salidaAlmuerzo < minimoAlmuerzo) {
                return {
                    error: `El almuerzo de ${regla.dia} es inferior al mínimo configurado.`,
                };
            }
        }
    }

    return { reglas };
}

function validarDatosPolitica(body: Body):
    | {
        nombre: string;
        descripcion: string | null;
        toleranciaEntradaMinutos: number;
        toleranciaAlmuerzoMinutos: number;
        minimoMinutosAlmuerzo: number;
        reglas: ReglaEntrada[];
    }
    | { error: string } {
    const nombre =
        typeof body.nombre === "string" ? body.nombre.trim() : "";

    const descripcion =
        typeof body.descripcion === "string"
            ? body.descripcion.trim()
            : null;

    if (!nombre || nombre.length > 100) {
        return {
            error: "El nombre es obligatorio y no puede superar 100 caracteres.",
        };
    }

    if (descripcion && descripcion.length > 500) {
        return {
            error: "La descripción no puede superar 500 caracteres.",
        };
    }

    const toleranciaEntradaMinutos = body.toleranciaEntradaMinutos;
    const toleranciaAlmuerzoMinutos = body.toleranciaAlmuerzoMinutos;
    const minimoMinutosAlmuerzo = body.minimoMinutosAlmuerzo;

    if (
        !esMinutosValidos(toleranciaEntradaMinutos) ||
        !esMinutosValidos(toleranciaAlmuerzoMinutos) ||
        !esMinutosValidos(minimoMinutosAlmuerzo)
    ) {
        return {
            error:
                "Las tolerancias y el mínimo de almuerzo deben ser números enteros entre 0 y 600.",
        };
    }

    const resultadoReglas = validarReglas(
        body.dayRules,
        minimoMinutosAlmuerzo
    );

    if ("error" in resultadoReglas) {
        return resultadoReglas;
    }

    return {
        nombre,
        descripcion: descripcion || null,
        toleranciaEntradaMinutos,
        toleranciaAlmuerzoMinutos,
        minimoMinutosAlmuerzo,
        reglas: resultadoReglas.reglas,
    };
}

// GET: consultar todas las políticas, activas e inactivas.
export const GET = requireAuth(async () => {
    try {
        const fechaHoy = obtenerFechaActualBogota();

        const [politicas, conteosActivosFuturos] = await Promise.all([
            db.schedulePolicy.findMany({
                select: {
                    id: true,
                    nombre: true,
                    descripcion: true,
                    toleranciaEntradaMinutos: true,
                    toleranciaAlmuerzoMinutos: true,
                    minimoMinutosAlmuerzo: true,
                    isActive: true,
                    dayRules: {
                        select: {
                            id: true,
                            dia: true,
                            horaEntradaManana: true,
                            horaSalidaAlmuerzo: true,
                            horaEntradaAlmuerzo: true,
                            horaSalidaJornada: true,
                            esLaboral: true,
                        },
                        orderBy: { dia: "asc" },
                    },
                    _count: {
                        select: {
                            assignments: true,
                        },
                    },
                },
                orderBy: { nombre: "asc" },
            }),

            db.employeeScheduleAssignment.groupBy({
                by: ["schedulePolicyId"],
                where: {
                    OR: [
                        { validUntil: null },
                        { validUntil: { gte: fechaHoy } },
                    ],
                },
                _count: {
                    _all: true,
                },
            }),
        ]);

        const politicasConConteos = politicas.map((politica) => {
            const conteo = conteosActivosFuturos.find(
                (item) => item.schedulePolicyId === politica.id
            );

            return {
                ...politica,
                activeOrFutureAssignments: conteo?._count._all ?? 0,
            };
        });

        return NextResponse.json(
            { politicas: politicasConConteos },
            { status: 200 }
        );
    } catch (error) {
        console.error("Error al consultar políticas de horario:", error);

        return NextResponse.json(
            { error: "No fue posible consultar las políticas de horario." },
            { status: 500 }
        );
    }
}, ["ADMIN", "SUPERVISOR"]);

// POST: crear una política con sus siete reglas semanales.
export const POST = requireAuth(async (request: Request) => {
    try {
        const body = await leerBody(request);

        if (!body) {
            return NextResponse.json(
                { error: "El cuerpo de la solicitud no contiene JSON válido." },
                { status: 400 }
            );
        }

        const resultado = validarDatosPolitica(body);

        if ("error" in resultado) {
            return NextResponse.json(
                { error: resultado.error },
                { status: 400 }
            );
        }

        const politica = await db.schedulePolicy.create({
            data: {
                nombre: resultado.nombre,
                descripcion: resultado.descripcion,
                toleranciaEntradaMinutos:
                    resultado.toleranciaEntradaMinutos,
                toleranciaAlmuerzoMinutos:
                    resultado.toleranciaAlmuerzoMinutos,
                minimoMinutosAlmuerzo: resultado.minimoMinutosAlmuerzo,
                isActive: true,
                dayRules: {
                    create: resultado.reglas.map((regla) => ({
                        dia: regla.dia as DiaSemana,
                        horaEntradaManana: regla.horaEntradaManana,
                        horaSalidaAlmuerzo: regla.horaSalidaAlmuerzo,
                        horaEntradaAlmuerzo: regla.horaEntradaAlmuerzo,
                        horaSalidaJornada: regla.horaSalidaJornada,
                        esLaboral: regla.esLaboral,
                    })),
                },
            },
            select: {
                id: true,
                nombre: true,
                descripcion: true,
                toleranciaEntradaMinutos: true,
                toleranciaAlmuerzoMinutos: true,
                minimoMinutosAlmuerzo: true,
                isActive: true,
                dayRules: true,
                _count: {
                    select: {
                        assignments: true,
                    },
                },
            },
        });

        return NextResponse.json(
            {
                message: "Política de horario creada correctamente.",
                politica,
            },
            { status: 201 }
        );
    } catch (error) {
        if (
            typeof error === "object" &&
            error !== null &&
            "code" in error &&
            error.code === "P2002"
        ) {
            return NextResponse.json(
                { error: "Ya existe una política con ese nombre." },
                { status: 409 }
            );
        }

        console.error("Error al crear política de horario:", error);

        return NextResponse.json(
            { error: "No fue posible crear la política de horario." },
            { status: 500 }
        );
    }
}, ["ADMIN", "SUPERVISOR"]);

// PATCH:
// - action: "toggle" permite activar o desactivar.
// - action: "edit" permite editar si no hay asignaciones activas o futuras.
export const PATCH = requireAuth(async (request: Request) => {
    try {
        const body = await leerBody(request);

        if (!body) {
            return NextResponse.json(
                { error: "El cuerpo de la solicitud no contiene JSON válido." },
                { status: 400 }
            );
        }

        const id = typeof body.id === "string" ? body.id.trim() : "";
        const action = body.action;

        if (!id) {
            return NextResponse.json(
                { error: "Debes indicar la política que deseas modificar." },
                { status: 400 }
            );
        }

        if (action === "toggle") {
            if (typeof body.isActive !== "boolean") {
                return NextResponse.json(
                    { error: "El estado de la política no es válido." },
                    { status: 400 }
                );
            }

            const resultado = await db.schedulePolicy.updateMany({
                where: { id },
                data: { isActive: body.isActive },
            });

            if (resultado.count === 0) {
                return NextResponse.json(
                    { error: "La política indicada no existe." },
                    { status: 404 }
                );
            }

            return NextResponse.json(
                {
                    message: body.isActive
                        ? "Política activada correctamente."
                        : "Política desactivada correctamente.",
                },
                { status: 200 }
            );
        }

        if (action !== "edit") {
            return NextResponse.json(
                { error: "La operación solicitada no es válida." },
                { status: 400 }
            );
        }

        const resultado = validarDatosPolitica(body);

        if ("error" in resultado) {
            return NextResponse.json(
                { error: resultado.error },
                { status: 400 }
            );
        }

        const actualizado = await db.$transaction(
            async (tx) => {
                const existente = await tx.schedulePolicy.findUnique({
                    where: { id },
                    select: { id: true },
                });

                if (!existente) {
                    return { estado: "no-encontrada" as const };
                }

                const asignacionesBloqueantes =
                    await contarAsignacionesActivasOFuturas(tx, id);

                if (asignacionesBloqueantes > 0) {
                    return { estado: "tiene-asignaciones" as const };
                }

                await tx.schedulePolicy.update({
                    where: { id },
                    data: {
                        nombre: resultado.nombre,
                        descripcion: resultado.descripcion,
                        toleranciaEntradaMinutos:
                            resultado.toleranciaEntradaMinutos,
                        toleranciaAlmuerzoMinutos:
                            resultado.toleranciaAlmuerzoMinutos,
                        minimoMinutosAlmuerzo:
                            resultado.minimoMinutosAlmuerzo,
                    },
                });

                await tx.scheduleDayRule.deleteMany({
                    where: { schedulePolicyId: id },
                });

                await tx.scheduleDayRule.createMany({
                    data: resultado.reglas.map((regla) => ({
                        schedulePolicyId: id,
                        dia: regla.dia as DiaSemana,
                        horaEntradaManana: regla.horaEntradaManana,
                        horaSalidaAlmuerzo: regla.horaSalidaAlmuerzo,
                        horaEntradaAlmuerzo: regla.horaEntradaAlmuerzo,
                        horaSalidaJornada: regla.horaSalidaJornada,
                        esLaboral: regla.esLaboral,
                    })),
                });

                return { estado: "actualizada" as const };
            },
            {
                isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
            }
        );

        if (actualizado.estado === "no-encontrada") {
            return NextResponse.json(
                { error: "La política indicada no existe." },
                { status: 404 }
            );
        }

        if (actualizado.estado === "tiene-asignaciones") {
            return NextResponse.json(
                {
                    error:
                        "Esta política tiene asignaciones activas o futuras y no puede editarse. Las asignaciones históricas finalizadas se conservan.",
                },
                { status: 409 }
            );
        }

        return NextResponse.json(
            { message: "Política actualizada correctamente." },
            { status: 200 }
        );
    } catch (error) {
        if (
            typeof error === "object" &&
            error !== null &&
            "code" in error
        ) {
            if (error.code === "P2002") {
                return NextResponse.json(
                    { error: "Ya existe otra política con ese nombre." },
                    { status: 409 }
                );
            }

            if (error.code === "P2034") {
                return NextResponse.json(
                    {
                        error:
                            "La política cambió durante la operación. Actualiza la información e inténtalo nuevamente.",
                    },
                    { status: 409 }
                );
            }
        }

        console.error("Error al modificar política de horario:", error);

        return NextResponse.json(
            { error: "No fue posible modificar la política de horario." },
            { status: 500 }
        );
    }
}, ["ADMIN", "SUPERVISOR"]);

// DELETE: eliminar solamente políticas sin asignaciones activas o futuras.
export const DELETE = requireAuth(async (request: Request) => {
    try {
        const body = await leerBody(request);

        if (!body) {
            return NextResponse.json(
                { error: "El cuerpo de la solicitud no contiene JSON válido." },
                { status: 400 }
            );
        }

        const id = typeof body.id === "string" ? body.id.trim() : "";

        if (!id) {
            return NextResponse.json(
                { error: "Debes indicar la política que deseas eliminar." },
                { status: 400 }
            );
        }

        const resultado = await db.$transaction(
            async (tx) => {
                const existente = await tx.schedulePolicy.findUnique({
                    where: { id },
                    select: { id: true },
                });

                if (!existente) {
                    return { estado: "no-encontrada" as const };
                }

                const asignacionesBloqueantes =
                    await contarAsignacionesActivasOFuturas(tx, id);

                if (asignacionesBloqueantes > 0) {
                    return { estado: "tiene-asignaciones" as const };
                }

                await tx.scheduleDayRule.deleteMany({
                    where: { schedulePolicyId: id },
                });

                await tx.schedulePolicy.delete({
                    where: { id },
                });

                return { estado: "eliminada" as const };
            },
            {
                isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
            }
        );

        if (resultado.estado === "no-encontrada") {
            return NextResponse.json(
                { error: "La política indicada no existe." },
                { status: 404 }
            );
        }

        if (resultado.estado === "tiene-asignaciones") {
            return NextResponse.json(
                {
                    error:
                        "No se puede eliminar esta política porque tiene asignaciones activas o futuras. Puedes desactivarla.",
                },
                { status: 409 }
            );
        }

        return NextResponse.json(
            { message: "Política eliminada correctamente." },
            { status: 200 }
        );
    } catch (error) {
        if (
            typeof error === "object" &&
            error !== null &&
            "code" in error &&
            error.code === "P2034"
        ) {
            return NextResponse.json(
                {
                    error:
                        "La política cambió durante la operación. Actualiza la información e inténtalo nuevamente.",
                },
                { status: 409 }
            );
        }

        console.error("Error al eliminar política de horario:", error);

        return NextResponse.json(
            { error: "No fue posible eliminar la política de horario." },
            { status: 500 }
        );
    }
}, ["ADMIN", "SUPERVISOR"]);
