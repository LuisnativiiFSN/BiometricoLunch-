import 'dotenv/config';
import { PrismaService } from '../dist/prisma/prisma.service.js';

const command = process.argv[2] ?? 'status';
const TEST_MEAL_NAME = 'ALMUERZO PRUEBA FASE 4';
const prisma = new PrismaService();

function localMealDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/El_Salvador',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return new Date(`${value.year}-${value.month}-${value.day}T00:00:00.000Z`);
}

async function status(mealDate) {
  const employees = await prisma.employee.findMany({
    where: { employeeCode: { in: ['1', '2'] } },
    select: { employeeCode: true, name: true, active: true },
    orderBy: { employeeCode: 'asc' },
  });
  const reservations = await prisma.mealReservation.findMany({
    where: { employeeId: { in: ['1', '2'] }, mealDate, mealType: 'LUNCH' },
    select: { id: true, employeeId: true, mealName: true },
    orderBy: { employeeId: 'asc' },
  });
  const requests = await prisma.mealRequest.findMany({
    where: { employeeId: { in: ['1', '2'] }, mealDate, mealType: 'LUNCH' },
    select: { employeeId: true, status: true, requestedAt: true },
    orderBy: { requestedAt: 'asc' },
  });
  console.log(
    JSON.stringify(
      {
        mealDate: mealDate.toISOString().slice(0, 10),
        employees,
        reservations,
        requests,
      },
      null,
      2,
    ),
  );
}

try {
  await prisma.onModuleInit();
  const mealDate = localMealDate();

  if (command === 'prepare') {
    const employees = await prisma.employee.count({
      where: { employeeCode: { in: ['1', '2'] } },
    });
    if (employees !== 2) throw new Error('D1 y D2 deben existir antes de preparar la prueba');

    const d2Reservation = await prisma.mealReservation.findUnique({
      where: {
        employeeId_mealDate_mealType: {
          employeeId: '2',
          mealDate,
          mealType: 'LUNCH',
        },
      },
    });
    if (d2Reservation) {
      throw new Error('D2 ya tiene reserva hoy; no se modificó para evitar borrar datos');
    }

    await prisma.employee.update({ where: { employeeCode: '1' }, data: { active: true } });
    await prisma.employee.update({ where: { employeeCode: '2' }, data: { active: true } });
    await prisma.mealReservation.upsert({
      where: {
        employeeId_mealDate_mealType: {
          employeeId: '1',
          mealDate,
          mealType: 'LUNCH',
        },
      },
      create: {
        employeeId: '1',
        mealDate,
        mealType: 'LUNCH',
        mealName: TEST_MEAL_NAME,
      },
      update: {},
    });
  } else if (command === 'inactivate-d2') {
    await prisma.employee.update({ where: { employeeCode: '2' }, data: { active: false } });
  } else if (command === 'restore-d2') {
    await prisma.employee.update({ where: { employeeCode: '2' }, data: { active: true } });
  } else if (command !== 'status') {
    throw new Error('Comando válido: status, prepare, inactivate-d2 o restore-d2');
  }

  await status(mealDate);
} finally {
  await prisma.onModuleDestroy();
}
