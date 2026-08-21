import 'dotenv/config';
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import {
  MealRequestStatus,
  MealType,
} from '../dist/meals/meal.constants.js';
import { EmployeesService } from '../dist/employees/employees.service.js';
import { ConsultationsService } from '../dist/consultations/consultations.service.js';
import { MealsService } from '../dist/meals/meals.service.js';
import { PrismaService } from '../dist/prisma/prisma.service.js';

const TEST_PREFIX = 'AUTO-MEAL-';
const TIME_ZONE = 'America/El_Salvador';
const prisma = new PrismaService();
const mealsService = new MealsService(prisma);
const employeesService = new EmployeesService(prisma);
const consultationsService = new ConsultationsService(prisma);

function getToday() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return new Date(
    Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day)),
  );
}

async function cleanup() {
  const employees = await prisma.employee.findMany({
    where: { employeeCode: { startsWith: TEST_PREFIX } },
    select: { employeeCode: true },
  });
  const employeeIds = employees.map((employee) => employee.employeeCode);

  if (employeeIds.length > 0) {
    await prisma.$transaction([
      prisma.mealRequest.deleteMany({
        where: { employeeId: { in: employeeIds } },
      }),
      prisma.mealReservation.deleteMany({
        where: { employeeId: { in: employeeIds } },
      }),
      prisma.employee.deleteMany({
        where: { employeeCode: { in: employeeIds } },
      }),
    ]);
  }

  await prisma.meal.deleteMany({
    where: {
      name: { startsWith: TEST_PREFIX },
      mealReservations: { none: {} },
    },
  });
}

function createEmployee(suffix, active = true) {
  return prisma.employee.create({
    data: {
      employeeCode: `${TEST_PREFIX}${suffix}`,
      name: `Empleado automatico ${suffix}`,
      email: `${suffix.toLowerCase()}@pruebas.local`,
      department: 'Pruebas',
      active,
    },
  });
}

async function createReservation(employeeId, mealName = 'CARNE EMPANIZADA') {
  const mealDate = getToday();
  const storedMealName = `${TEST_PREFIX}${mealName}`;
  const meal = await prisma.meal.upsert({
    where: {
      name_availableDate_mealType: {
        name: storedMealName,
        availableDate: mealDate,
        mealType: MealType.LUNCH,
      },
    },
    update: { active: true },
    create: {
      name: storedMealName,
      availableDate: mealDate,
      mealType: MealType.LUNCH,
    },
  });

  return prisma.mealReservation.create({
    data: {
      employeeId,
      mealId: meal.id,
      mealDate,
      mealType: MealType.LUNCH,
    },
  });
}

before(async () => {
  await prisma.onModuleInit();
  await cleanup();
});

after(async () => {
  await cleanup();
  await prisma.onModuleDestroy();
});

describe('POST /kiosk/request-meal - reglas de entrega', () => {
  test('aprueba y guarda la entrega cuando existe reserva', async () => {
    const employee = await createEmployee('APPROVED');
    const reservation = await createReservation(employee.employeeCode);

    const result = await mealsService.requestLunch(employee.employeeCode);
    const approved = await prisma.mealRequest.findMany({
      where: {
        employeeId: employee.employeeCode,
        status: MealRequestStatus.APPROVED,
      },
    });

    assert.equal(result.status, 'APPROVED');
    assert.equal(result.meal.name, `${TEST_PREFIX}CARNE EMPANIZADA`);
    assert.equal(approved.length, 1);
    assert.equal(approved[0].mealReservationId, reservation.id);
  });

  test('registra DUPLICATE sin crear una segunda aprobacion', async () => {
    const employee = await createEmployee('DUPLICATE');
    await createReservation(employee.employeeCode, 'POLLO EN SALSA');
    await mealsService.requestLunch(employee.employeeCode);

    const result = await mealsService.requestLunch(employee.employeeCode);
    const approvedCount = await prisma.mealRequest.count({
      where: {
        employeeId: employee.employeeCode,
        status: MealRequestStatus.APPROVED,
      },
    });
    const duplicateCount = await prisma.mealRequest.count({
      where: {
        employeeId: employee.employeeCode,
        status: MealRequestStatus.DUPLICATE,
      },
    });

    assert.equal(result.status, 'DUPLICATE');
    assert.equal(result.meal.name, `${TEST_PREFIX}POLLO EN SALSA`);
    assert.equal(approvedCount, 1);
    assert.equal(duplicateCount, 1);
  });

  test('retorna NO_MEAL_RESERVED y no crea aprobacion', async () => {
    const employee = await createEmployee('NO-RESERVATION');

    const result = await mealsService.requestLunch(employee.employeeCode);
    const requestCount = await prisma.mealRequest.count({
      where: { employeeId: employee.employeeCode },
    });

    assert.equal(result.status, 'NO_MEAL_RESERVED');
    assert.equal(requestCount, 0);
  });

  test('retorna EMPLOYEE_INACTIVE aunque exista reserva', async () => {
    const employee = await createEmployee('INACTIVE', false);
    await createReservation(employee.employeeCode);

    const result = await mealsService.requestLunch(employee.employeeCode);
    const requestCount = await prisma.mealRequest.count({
      where: { employeeId: employee.employeeCode },
    });

    assert.equal(result.status, 'EMPLOYEE_INACTIVE');
    assert.equal(requestCount, 0);
  });

  test('dos solicitudes simultaneas producen una aprobacion y un duplicado', async () => {
    const employee = await createEmployee('CONCURRENT');
    const reservation = await createReservation(employee.employeeCode);

    const results = await Promise.all([
      mealsService.requestLunch(employee.employeeCode),
      mealsService.requestLunch(employee.employeeCode),
    ]);
    const storedRequests = await prisma.mealRequest.findMany({
      where: { employeeId: employee.employeeCode },
    });
    const statuses = results.map((result) => result.status).sort();

    assert.deepEqual(statuses, ['APPROVED', 'DUPLICATE']);
    assert.equal(
      storedRequests.filter(
        (request) => request.status === MealRequestStatus.APPROVED,
      ).length,
      1,
    );
    assert.equal(
      storedRequests.filter(
        (request) => request.status === MealRequestStatus.DUPLICATE,
      ).length,
      1,
    );
    assert.ok(
      storedRequests.every(
        (request) => request.mealReservationId === reservation.id,
      ),
    );
  });

  test('consulta pendientes y calcula el resumen diario desde SQL Server', async () => {
    const pendingEmployee = await createEmployee('SUMMARY-PENDING');
    const collectedEmployee = await createEmployee('SUMMARY-COLLECTED');
    await createReservation(pendingEmployee.employeeCode, 'PASTA CON POLLO');
    await createReservation(collectedEmployee.employeeCode, 'CARNE GUISADA');
    await mealsService.requestLunch(collectedEmployee.employeeCode);
    await mealsService.requestLunch(collectedEmployee.employeeCode);

    const pending = await mealsService.getPendingToday();
    const summary = await mealsService.getTodaySummary();
    const mealDate = getToday();
    const [reserved, collected, duplicateAttempts] =
      await prisma.$transaction([
        prisma.mealReservation.count({ where: { mealDate } }),
        prisma.mealReservation.count({
          where: {
            mealDate,
            mealRequests: {
              some: { status: MealRequestStatus.APPROVED },
            },
          },
        }),
        prisma.mealRequest.count({
          where: {
            mealDate,
            status: MealRequestStatus.DUPLICATE,
          },
        }),
      ]);

    assert.ok(
      pending.some(
        (item) => item.employeeCode === pendingEmployee.employeeCode,
      ),
    );
    assert.ok(
      !pending.some(
        (item) => item.employeeCode === collectedEmployee.employeeCode,
      ),
    );
    assert.deepEqual(summary, {
      reserved,
      collected,
      pending: reserved - collected,
      duplicateAttempts,
    });
  });
});

describe('reservaciones normalizadas', () => {
  test('guarda meal_id, inicia quantity en 1 y bloquea un segundo almuerzo diario', async () => {
    const employee = await createEmployee('ONE-LUNCH');
    const mealDate = getToday();
    const [firstMeal, secondMeal] = await Promise.all([
      prisma.meal.upsert({
        where: {
          name_availableDate_mealType: {
            name: `${TEST_PREFIX}ENSALADA DE PRUEBA`,
            availableDate: mealDate,
            mealType: MealType.LUNCH,
          },
        },
        update: { active: true },
        create: {
          name: `${TEST_PREFIX}ENSALADA DE PRUEBA`,
          availableDate: mealDate,
          mealType: MealType.LUNCH,
        },
      }),
      prisma.meal.upsert({
        where: {
          name_availableDate_mealType: {
            name: `${TEST_PREFIX}POLLO DE PRUEBA`,
            availableDate: mealDate,
            mealType: MealType.LUNCH,
          },
        },
        update: { active: true },
        create: {
          name: `${TEST_PREFIX}POLLO DE PRUEBA`,
          availableDate: mealDate,
          mealType: MealType.LUNCH,
        },
      }),
    ]);

    const created = await mealsService.createManualReservation(
      employee.employeeCode,
      firstMeal.id,
    );
    const duplicate = await mealsService.createManualReservation(
      employee.employeeCode,
      secondMeal.id,
    );
    const stored = await prisma.mealReservation.findFirstOrThrow({
      where: { employeeId: employee.employeeCode },
    });

    assert.equal(created.status, 'CREATED');
    assert.equal(duplicate.status, 'ALREADY_EXISTS');
    assert.equal(stored.mealId, firstMeal.id);
    assert.equal(stored.quantity, 1);
    assert.equal(stored.transferEmployeeId, null);
    assert.equal(
      await prisma.mealReservation.count({
        where: {
          employeeId: employee.employeeCode,
          mealDate,
          mealType: MealType.LUNCH,
        },
      }),
      1,
    );
  });
});

describe('consulta pública mensual', () => {
  test('resume almuerzos, entregas y semanas de un mes anterior', async () => {
    const employee = await createEmployee('CONSULTATION');
    const today = getToday();
    const firstDayPreviousMonth = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1),
    );
    const firstDate = new Date(firstDayPreviousMonth);
    firstDate.setUTCDate(5);
    const secondDate = new Date(firstDayPreviousMonth);
    secondDate.setUTCDate(12);
    const month = firstDayPreviousMonth.toISOString().slice(0, 7);
    const meals = await Promise.all(
      [firstDate, secondDate].map((availableDate, index) =>
        prisma.meal.create({
          data: {
            name: `${TEST_PREFIX}CONSULTA-${index + 1}`,
            availableDate,
            mealType: MealType.LUNCH,
          },
        }),
      ),
    );
    const reservations = await Promise.all(
      meals.map((meal, index) =>
        prisma.mealReservation.create({
          data: {
            employeeId: employee.employeeCode,
            mealId: meal.id,
            mealDate: index === 0 ? firstDate : secondDate,
            mealType: MealType.LUNCH,
          },
        }),
      ),
    );
    await prisma.mealRequest.create({
      data: {
        employeeId: employee.employeeCode,
        mealReservationId: reservations[0].id,
        mealDate: firstDate,
        mealType: MealType.LUNCH,
        status: MealRequestStatus.APPROVED,
      },
    });

    const result = await consultationsService.getMonthlySummary(
      employee.employeeCode,
      month,
    );

    assert.equal(result.month, month);
    assert.deepEqual(result.summary, {
      totalLunches: 2,
      delivered: 1,
      pending: 1,
    });
    assert.equal(
      result.weeks.reduce((total, week) => total + week.count, 0),
      2,
    );
    assert.equal(result.items.length, 2);
    assert.deepEqual(
      result.items.map((item) => item.status).sort(),
      ['DELIVERED', 'PENDING'],
    );
  });

  test('rechaza meses posteriores al mes actual', async () => {
    const employee = await createEmployee('CONSULTATION-FUTURE');
    const today = getToday();
    const future = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 1),
    ).toISOString().slice(0, 7);

    await assert.rejects(
      consultationsService.getMonthlySummary(employee.employeeCode, future),
      /No se pueden consultar meses futuros/,
    );
  });
});

describe('employees - codigo como llave primaria', () => {
  test('actualiza el codigo y propaga el cambio a las reservas', async () => {
    const employee = await createEmployee('RENAME');
    await createReservation(employee.employeeCode);
    const newEmployeeCode = `${TEST_PREFIX}RENAMED`;

    const updated = await employeesService.update(employee.employeeCode, {
      employeeCode: newEmployeeCode,
      department: 'Operaciones',
    });
    const reservation = await prisma.mealReservation.findFirstOrThrow({
      where: { employeeId: newEmployeeCode },
    });

    assert.equal(updated.employeeCode, newEmployeeCode);
    assert.equal(updated.department, 'Operaciones');
    assert.equal(reservation.employeeId, newEmployeeCode);
    assert.equal(
      await prisma.employee.findUnique({
        where: { employeeCode: employee.employeeCode },
      }),
      null,
    );
  });
});
