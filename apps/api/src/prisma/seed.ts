import 'dotenv/config';
import { MealType } from '../meals/meal.constants.js';
import { PrismaService } from './prisma.service.js';

const TIME_ZONE = 'America/El_Salvador';

function getLocalDate(date: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return new Date(
    Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day)),
  );
}

async function upsertSeedEmployee(
  prisma: PrismaService,
  data: {
    preferredCode: string;
    fallbackCode: string;
    name: string;
    email: string;
    department: string;
  },
) {
  const existingPreferred = await prisma.employee.findUnique({
    where: { employeeCode: data.preferredCode },
  });
  const employeeCode =
    existingPreferred && existingPreferred.email !== data.email
      ? data.fallbackCode
      : data.preferredCode;

  return prisma.employee.upsert({
    where: { employeeCode },
    update: {
      name: data.name,
      email: data.email,
      department: data.department,
      active: true,
    },
    create: {
      employeeCode,
      name: data.name,
      email: data.email,
      department: data.department,
      active: true,
    },
  });
}

async function seed() {
  const prisma = new PrismaService();
  await prisma.onModuleInit();

  try {
    const mealDate = getLocalDate(new Date());
    const employees = await Promise.all([
      upsertSeedEmployee(prisma, {
        preferredCode: '18358',
        fallbackCode: 'SEED-18358',
        name: 'Carlos Hernández',
        email: 'seed.carlos@empresa.com',
        department: 'Sin asignar',
      }),
      upsertSeedEmployee(prisma, {
        preferredCode: '18359',
        fallbackCode: 'SEED-18359',
        name: 'Andrea López',
        email: 'seed.andrea@empresa.com',
        department: 'Sin asignar',
      }),
      upsertSeedEmployee(prisma, {
        preferredCode: '18360',
        fallbackCode: 'SEED-18360',
        name: 'Pedro Martínez',
        email: 'seed.pedro@empresa.com',
        department: 'Sin asignar',
      }),
    ]);

    const [carlos, andrea, pedro] = employees;
    const employeeIds = employees.map((employee) => employee.employeeCode);

    const [carneEmpanizada, polloEnSalsa] = await prisma.$transaction([
      prisma.meal.upsert({
        where: {
          name_availableDate_mealType: {
            name: 'CARNE EMPANIZADA',
            availableDate: mealDate,
            mealType: MealType.LUNCH,
          },
        },
        update: { active: true },
        create: {
          name: 'CARNE EMPANIZADA',
          availableDate: mealDate,
          mealType: MealType.LUNCH,
        },
      }),
      prisma.meal.upsert({
        where: {
          name_availableDate_mealType: {
            name: 'POLLO EN SALSA',
            availableDate: mealDate,
            mealType: MealType.LUNCH,
          },
        },
        update: { active: true },
        create: {
          name: 'POLLO EN SALSA',
          availableDate: mealDate,
          mealType: MealType.LUNCH,
        },
      }),
    ]);

    await prisma.$transaction([
      prisma.mealRequest.deleteMany({
        where: {
          employeeId: { in: employeeIds },
          mealDate,
          mealType: MealType.LUNCH,
        },
      }),
      prisma.mealReservation.upsert({
        where: {
          employeeId_mealDate_mealType: {
            employeeId: carlos.employeeCode,
            mealDate,
            mealType: MealType.LUNCH,
          },
        },
        update: { mealId: carneEmpanizada.id },
        create: {
          employeeId: carlos.employeeCode,
          mealId: carneEmpanizada.id,
          mealDate,
          mealType: MealType.LUNCH,
        },
      }),
      prisma.mealReservation.upsert({
        where: {
          employeeId_mealDate_mealType: {
            employeeId: andrea.employeeCode,
            mealDate,
            mealType: MealType.LUNCH,
          },
        },
        update: { mealId: polloEnSalsa.id },
        create: {
          employeeId: andrea.employeeCode,
          mealId: polloEnSalsa.id,
          mealDate,
          mealType: MealType.LUNCH,
        },
      }),
      prisma.mealReservation.deleteMany({
        where: {
          employeeId: pedro.employeeCode,
          mealDate,
          mealType: MealType.LUNCH,
        },
      }),
    ]);

    console.log(`Seed listo para ${mealDate.toISOString().slice(0, 10)}:`);
    console.log(`- ${carlos.employeeCode} Carlos Hernández: CARNE EMPANIZADA`);
    console.log(`- ${andrea.employeeCode} Andrea López: POLLO EN SALSA`);
    console.log(`- ${pedro.employeeCode} Pedro Martínez: SIN RESERVA`);
  } finally {
    await prisma.onModuleDestroy();
  }
}

seed().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
