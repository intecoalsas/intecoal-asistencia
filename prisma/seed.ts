import { PrismaClient, Role, DiaSemana } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Script de sembrado inicial (SEED) — Datos simulados para pruebas
 * Cumplimiento estricto: Cero datos reales de empleados, contraseñas de prueba con hash.
 */
async function main() {
  console.log("🌱 Iniciando sembrado de datos de prueba para INTECOAL Asistencia...");

  // 1. Limpieza de datos previos (orden inverso por integridad referencial)
  await prisma.attendanceAuditLog.deleteMany();
  await prisma.attendanceIncident.deleteMany();
  await prisma.attendance.deleteMany();
  await prisma.employeeScheduleAssignment.deleteMany();
  await prisma.scheduleDayRule.deleteMany();
  await prisma.schedulePolicy.deleteMany();
  await prisma.kioskDevice.deleteMany();
  await prisma.user.deleteMany();

  // 2. Creación de Usuarios de Prueba (Contraseña simulada de prueba: 'Intecoal2026*')
  // Nota: En fase 3 se integrará hashing con bcryptjs al implementar autenticación funcional.
  const dummyHash = "$2a$10$vI8aWBnW3fID.ZQ4/zo1G.q1lR0eGqv8q4O1QW/6V4a5k7O5t1eK2";

  const admin = await prisma.user.create({
    data: {
      documento: "1000000001",
      nombre: "Administrador",
      apellido: "Principal",
      email: "admin@intecoal-simulado.com",
      passwordHash: dummyHash,
      role: Role.ADMIN,
      cargo: "Director de Operaciones",
      isActive: true,
    },
  });

  const supervisor = await prisma.user.create({
    data: {
      documento: "1000000002",
      nombre: "Laura",
      apellido: "Ramírez",
      email: "supervisor@intecoal-simulado.com",
      passwordHash: dummyHash,
      role: Role.SUPERVISOR,
      cargo: "Supervisora de Talento Humano",
      isActive: true,
    },
  });

  const empleado1 = await prisma.user.create({
    data: {
      documento: "1000000003",
      nombre: "Carlos",
      apellido: "Pérez",
      email: "carlos.perez@intecoal-simulado.com",
      passwordHash: dummyHash,
      role: Role.EMPLEADO,
      cargo: "Operador de Planta",
      isActive: true,
    },
  });

  const empleado2 = await prisma.user.create({
    data: {
      documento: "1000000004",
      nombre: "Ana",
      apellido: "Gómez",
      email: "ana.gomez@intecoal-simulado.com",
      passwordHash: dummyHash,
      role: Role.EMPLEADO,
      cargo: "Analista de Logística",
      isActive: true,
    },
  });

  console.log("✅ Usuarios de prueba creados (Admin, Supervisor, 2 Empleados).");

  // 3. Creación de Kiosco Físico Autorizado
  const kiosk = await prisma.kioskDevice.create({
    data: {
      codigo: "KIOSK-BOGOTA-PRINCIPAL-01",
      nombre: "Kiosco Recepción Entrada Principal",
      ubicacion: "Sede Bogotá - Torre A, Piso 1",
      secretKey: "kiosk_secret_ficticio_para_pruebas_locales",
      isActive: true,
      ipPermitida: "192.168.1.0/24",
    },
  });

  console.log(`✅ Terminal de kiosco registrada: ${kiosk.codigo}`);

  // 4. Creación de Política de Horario (Lunes a Viernes, con parámetros configurables)
  const politicaAdmin = await prisma.schedulePolicy.create({
    data: {
      nombre: "Jornada Administrativa Estándar (L-V 7am - 5pm)",
      descripcion: "Horario estándar de lunes a viernes: 07:00 a 12:00 y 13:00 a 17:00. Almuerzo de 1 hora.",
      toleranciaEntradaMinutos: 10,  // Configurable: 10 minutos de cortesía
      toleranciaAlmuerzoMinutos: 10, // Configurable: 10 minutos de retorno
      minimoMinutosAlmuerzo: 45,    // Configurable: Mínimo 45 minutos de descanso
      isActive: true,
    },
  });

  // Reglas por día de la semana
  const diasLaborales: DiaSemana[] = [
    DiaSemana.LUNES,
    DiaSemana.MARTES,
    DiaSemana.MIERCOLES,
    DiaSemana.JUEVES,
    DiaSemana.VIERNES,
  ];

  for (const dia of diasLaborales) {
    await prisma.scheduleDayRule.create({
      data: {
        schedulePolicyId: politicaAdmin.id,
        dia,
        horaEntradaManana: "07:00",
        horaSalidaAlmuerzo: "12:00",
        horaEntradaAlmuerzo: "13:00",
        horaSalidaJornada: "17:00",
        esLaboral: true,
      },
    });
  }

  // Fines de semana no laborales
  for (const dia of [DiaSemana.SABADO, DiaSemana.DOMINGO]) {
    await prisma.scheduleDayRule.create({
      data: {
        schedulePolicyId: politicaAdmin.id,
        dia,
        horaEntradaManana: "00:00",
        horaSalidaAlmuerzo: "00:00",
        horaEntradaAlmuerzo: "00:00",
        horaSalidaJornada: "00:00",
        esLaboral: false,
      },
    });
  }

  console.log("✅ Política de horario y 7 reglas diarias registradas.");

  // 5. Asignación Histórica a Empleados (Vigencia temporal)
  const fechaInicioVigencia = new Date("2026-01-01");

  await prisma.employeeScheduleAssignment.createMany({
    data: [
      {
        userId: empleado1.id,
        schedulePolicyId: politicaAdmin.id,
        validFrom: fechaInicioVigencia,
        validUntil: null, // Vigente indefinidamente
      },
      {
        userId: empleado2.id,
        schedulePolicyId: politicaAdmin.id,
        validFrom: fechaInicioVigencia,
        validUntil: null,
      },
    ],
  });

  console.log("✅ Asignaciones históricas vinculadas a empleados de prueba.");
  console.log("🎉 Sembrado inicial finalizado exitosamente.");
}

main()
  .catch((e) => {
    console.error("❌ Error en sembrado:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

