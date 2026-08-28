import 'dotenv/config';
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import ExcelJS from 'exceljs';
import {
  MealRequestStatus,
  MealType,
} from '../dist/meals/meal.constants.js';
import { EmployeesService } from '../dist/employees/employees.service.js';
import { ConsultationsService } from '../dist/consultations/consultations.service.js';
import { MealsService } from '../dist/meals/meals.service.js';
import { PrismaService } from '../dist/prisma/prisma.service.js';
import { TransfersService } from '../dist/transfers/transfers.service.js';

const TEST_PREFIX = 'AUTO-MEAL-';
const TRANSFER_USERNAME = 'auto-meal-transfer-rh';
const TIME_ZONE = 'America/El_Salvador';
const prisma = new PrismaService();
const mealsService = new MealsService(prisma);
const employeesService = new EmployeesService(prisma);
const consultationsService = new ConsultationsService(prisma);
const transfersService = new TransfersService(prisma);

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
  const reservations = employeeIds.length > 0
    ? await prisma.mealReservation.findMany({
        where: { employeeId: { in: employeeIds } },
        select: { id: true },
      })
    : [];
  const reservationIds = reservations.map((reservation) => reservation.id);
  const transferUser = await prisma.user.findUnique({
    where: { username: TRANSFER_USERNAME },
    select: { id: true },
  });

  if (employeeIds.length > 0 || transferUser) {
    await prisma.$transaction([
      prisma.auditLog.deleteMany({
        where: {
          OR: [
            ...(transferUser ? [{ actorUserId: transferUser.id }] : []),
            ...(reservationIds.length > 0
              ? [{ entityName: 'meal_reservations', entityId: { in: reservationIds } }]
              : []),
            ...(employeeIds.length > 0
              ? [{ actorEmployeeId: { in: employeeIds } }]
              : []),
          ],
        },
      }),
      prisma.mealRequest.deleteMany({
        where: { employeeId: { in: employeeIds } },
      }),
      prisma.mealReservation.deleteMany({
        where: { employeeId: { in: employeeIds } },
      }),
      prisma.employee.deleteMany({
        where: { employeeCode: { in: employeeIds } },
      }),
      prisma.user.deleteMany({ where: { username: TRANSFER_USERNAME } }),
    ]);
  }

  await prisma.meal.deleteMany({
    where: {
      name: { startsWith: TEST_PREFIX },
      mealReservations: { none: {} },
    },
  });
  await prisma.mealOrderCutoff.deleteMany({
    where: {
      mealDate: {
        gte: new Date('2099-01-01T00:00:00.000Z'),
        lte: new Date('2099-01-31T00:00:00.000Z'),
      },
    },
  });
}

function createEmployee(suffix, active = true, department = 'Pruebas') {
  return prisma.employee.create({
    data: {
      employeeCode: `${TEST_PREFIX}${suffix}`,
      name: `Empleado automatico ${suffix}`,
      email: `${suffix.toLowerCase()}@pruebas.local`,
      department,
      active,
    },
  });
}

async function createReservation(
  employeeId,
  mealName = 'CARNE EMPANIZADA',
  mealDate = getToday(),
) {
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
  await prisma.user.create({
    data: {
      username: TRANSFER_USERNAME,
      passwordHash: 'hash-de-prueba-no-utilizado',
      role: 'RH',
    },
  });
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
    const pendingByCode = await mealsService.getPendingToday(
      pendingEmployee.employeeCode,
    );
    const collectedByCode = await mealsService.getPendingToday(
      collectedEmployee.employeeCode,
    );
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
    assert.equal(pendingByCode.length, 1);
    assert.equal(pendingByCode[0].employeeCode, pendingEmployee.employeeCode);
    assert.deepEqual(collectedByCode, []);
    assert.equal(summary.reserved, reserved);
    assert.equal(summary.collected, collected);
    assert.equal(summary.pending, reserved - collected);
    assert.equal(summary.duplicateAttempts, duplicateAttempts);
    assert.match(summary.cutoffTime, /^\d{2}:\d{2}$/);
    assert.equal(typeof summary.exportAvailable, 'boolean');
  });

  test('exporta pendientes a Excel después del cierre y los ordena por departamento', async () => {
    const futureMonday = new Date('2099-01-08T00:00:00.000Z');
    while (futureMonday.getUTCDay() !== 1) {
      futureMonday.setUTCDate(futureMonday.getUTCDate() + 1);
    }
    const beforeCutoff = new Date(futureMonday);
    beforeCutoff.setUTCHours(13, 59, 0, 0);
    const atCutoff = new Date(futureMonday);
    atCutoff.setUTCHours(14, 0, 0, 0);

    await prisma.mealOrderCutoff.upsert({
      where: { mealDate: futureMonday },
      update: { cutoffTime: '08:00' },
      create: { mealDate: futureMonday, cutoffTime: '08:00' },
    });
    const ventas = await createEmployee('EXPORT-VENTAS', true, 'Ventas');
    const administracion = await createEmployee('EXPORT-ADMIN', true, 'Administración');
    await createReservation(ventas.employeeCode, 'POLLO EXPORTADO', futureMonday);
    await createReservation(administracion.employeeCode, 'PASTA EXPORTADA', futureMonday);
    await prisma.meal.create({
      data: {
        name: `${TEST_PREFIX}SOPA SIN PEDIDOS`,
        availableDate: futureMonday,
        mealType: MealType.LUNCH,
      },
    });

    await assert.rejects(
      mealsService.exportPendingToday(beforeCutoff),
      /disponible después del cierre de las 08:00/,
    );

    const exported = await mealsService.exportPendingToday(atCutoff);
    assert.match(exported.fileName, /^pendientes-comida-\d{4}-\d{2}-\d{2}\.xlsx$/);
    assert.ok(exported.buffer.length > 0);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(exported.buffer);
    const worksheet = workbook.getWorksheet('Pendientes');
    assert.ok(worksheet);
    assert.equal(workbook.worksheets.length, 2);
    assert.equal(worksheet.getCell('A1').value, 'COMIDAS PENDIENTES DE ENTREGA');
    assert.ok(worksheet.getCell('D1').value instanceof Date);
    assert.deepEqual(worksheet.getRow(2).values.slice(1), [
      'Código',
      'Nombre del empleado',
      'Departamento',
      'Comida solicitada',
    ]);
    assert.deepEqual(
      [worksheet.getCell('C3').value, worksheet.getCell('C4').value],
      ['Administración', 'Ventas'],
    );
    assert.deepEqual(
      [worksheet.getCell('A3').value, worksheet.getCell('A4').value],
      [administracion.employeeCode, ventas.employeeCode],
    );
    assert.deepEqual(
      [worksheet.getCell('D3').value, worksheet.getCell('D4').value],
      [`${TEST_PREFIX}PASTA EXPORTADA`, `${TEST_PREFIX}POLLO EXPORTADO`],
    );
    assert.equal(worksheet.autoFilter, 'A2:D2');

    const summarySheet = workbook.getWorksheet('Resumen del día');
    assert.ok(summarySheet);
    assert.equal(summarySheet.getCell('A1').value, 'RESUMEN DE PRODUCCIÓN');
    assert.equal(summarySheet.getCell('D3').value, 2);
    assert.deepEqual(summarySheet.getRow(6).values.slice(1), [
      'Comida',
      'Cantidad',
      '% del total',
      'Distribución',
    ]);
    assert.deepEqual(
      [7, 8, 9].map((row) => [
        summarySheet.getCell(`A${row}`).value,
        summarySheet.getCell(`B${row}`).value,
      ]),
      [
        [`${TEST_PREFIX}PASTA EXPORTADA`, 1],
        [`${TEST_PREFIX}POLLO EXPORTADO`, 1],
        [`${TEST_PREFIX}SOPA SIN PEDIDOS`, 0],
      ],
    );
    assert.equal(summarySheet.autoFilter, 'A6:D6');
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

describe('reservaciones semanales desde el portal', () => {
  test('crea, cambia y cancela selecciones sin duplicar días', async () => {
    const employee = await createEmployee('WEEKLY-ORDER');
    const today = getToday();
    const weekday = today.getUTCDay();
    const monday = new Date(today);
    monday.setUTCDate(today.getUTCDate() + (weekday === 0 ? -6 : 1 - weekday));
    const dates = Array.from({ length: 5 }, (_, index) => {
      const date = new Date(monday);
      date.setUTCDate(monday.getUTCDate() + index);
      return date;
    });
    const beforeCutoff = new Date(monday);
    beforeCutoff.setUTCHours(13, 0, 0, 0);
    const meals = [];

    for (const [index, availableDate] of dates.entries()) {
      meals.push(await prisma.meal.create({
        data: {
          name: `${TEST_PREFIX}PORTAL-DIA-${index + 1}`,
          availableDate,
          mealType: MealType.LUNCH,
        },
      }));
    }
    const alternative = await prisma.meal.create({
      data: {
        name: `${TEST_PREFIX}PORTAL-ALTERNATIVA`,
        availableDate: dates[0],
        mealType: MealType.LUNCH,
      },
    });

    const firstSave = await mealsService.saveCurrentWeekReservations(
      employee.employeeCode,
      [
        { date: dates[0].toISOString().slice(0, 10), mealId: meals[0].id },
        { date: dates[1].toISOString().slice(0, 10), mealId: meals[1].id },
      ],
      beforeCutoff,
    );
    assert.deepEqual(firstSave.changes, { created: 2, updated: 0, deleted: 0 });

    const secondSave = await mealsService.saveCurrentWeekReservations(
      employee.employeeCode,
      [{ date: dates[0].toISOString().slice(0, 10), mealId: alternative.id }],
      beforeCutoff,
    );
    assert.deepEqual(secondSave.changes, { created: 0, updated: 1, deleted: 1 });
    assert.equal(secondSave.selections.length, 1);
    assert.equal(secondSave.selections[0].mealId, alternative.id);
    assert.equal(
      await prisma.mealReservation.count({
        where: {
          employeeId: employee.employeeCode,
          mealDate: { gte: dates[0], lte: dates[4] },
        },
      }),
      1,
    );

    const unchangedSave = await mealsService.saveCurrentWeekReservations(
      employee.employeeCode,
      [{ date: dates[0].toISOString().slice(0, 10), mealId: alternative.id }],
      beforeCutoff,
    );
    assert.deepEqual(unchangedSave.changes, { created: 0, updated: 0, deleted: 0 });
  });

  test('bloquea días anteriores y el día actual desde la hora de cierre', async () => {
    const previousEmployee = await createEmployee('WEEKLY-LOCK-PREVIOUS');
    const cutoffEmployee = await createEmployee('WEEKLY-LOCK-CUTOFF');
    const today = getToday();
    const weekday = today.getUTCDay();
    const monday = new Date(today);
    monday.setUTCDate(today.getUTCDate() + (weekday === 0 ? -6 : 1 - weekday));
    const dates = Array.from({ length: 5 }, (_, index) => {
      const date = new Date(monday);
      date.setUTCDate(monday.getUTCDate() + index);
      return date;
    });
    const meals = [];
    for (const [index, availableDate] of dates.entries()) {
      meals.push(await prisma.meal.create({
        data: {
          name: `${TEST_PREFIX}LOCK-DIA-${index + 1}`,
          availableDate,
          mealType: MealType.LUNCH,
        },
      }));
    }
    const mondayAlternative = await prisma.meal.create({
      data: {
        name: `${TEST_PREFIX}LOCK-LUNES-ALT`,
        availableDate: dates[0],
        mealType: MealType.LUNCH,
      },
    });
    const tuesdayAlternative = await prisma.meal.create({
      data: {
        name: `${TEST_PREFIX}LOCK-MARTES-ALT`,
        availableDate: dates[1],
        mealType: MealType.LUNCH,
      },
    });
    const mondayBeforeCutoff = new Date(monday);
    mondayBeforeCutoff.setUTCHours(13, 0, 0, 0);
    const tuesdayBeforeCutoff = new Date(dates[1]);
    tuesdayBeforeCutoff.setUTCHours(13, 0, 0, 0);
    const tuesdayAtCutoff = new Date(dates[1]);
    tuesdayAtCutoff.setUTCHours(14, 0, 0, 0);

    await mealsService.saveCurrentWeekReservations(
      previousEmployee.employeeCode,
      [{ date: dates[0].toISOString().slice(0, 10), mealId: meals[0].id }],
      mondayBeforeCutoff,
    );
    await assert.rejects(
      mealsService.saveCurrentWeekReservations(
        previousEmployee.employeeCode,
        [{ date: dates[0].toISOString().slice(0, 10), mealId: mondayAlternative.id }],
        tuesdayBeforeCutoff,
      ),
      /día anterior/,
    );

    await mealsService.saveCurrentWeekReservations(
      cutoffEmployee.employeeCode,
      [{ date: dates[1].toISOString().slice(0, 10), mealId: meals[1].id }],
      tuesdayBeforeCutoff,
    );
    await assert.rejects(
      mealsService.saveCurrentWeekReservations(
        cutoffEmployee.employeeCode,
        [{ date: dates[1].toISOString().slice(0, 10), mealId: tuesdayAlternative.id }],
        tuesdayAtCutoff,
      ),
      /cerró a las 08:00/,
    );
  });

  test('programa un menú futuro completo para activarlo el lunes', async () => {
    const actor = await prisma.user.findUniqueOrThrow({
      where: { username: TRANSFER_USERNAME },
      select: { id: true },
    });
    const futureMonday = new Date('2099-01-01T00:00:00.000Z');
    while (futureMonday.getUTCDay() !== 1) {
      futureMonday.setUTCDate(futureMonday.getUTCDate() + 1);
    }
    const weekStart = futureMonday.toISOString().slice(0, 10);
    const days = Array.from({ length: 5 }, (_, index) => {
      const date = new Date(futureMonday);
      date.setUTCDate(futureMonday.getUTCDate() + index);
      return {
        date: date.toISOString().slice(0, 10),
        meals: [`${TEST_PREFIX}FUTURO-${index + 1}`],
      };
    });

    const saved = await mealsService.saveWeeklyMenu(weekStart, days, actor.id);

    assert.equal(saved.weekStart, weekStart);
    assert.equal(saved.isReady, true);
    assert.equal(saved.isPublished, false);
    assert.equal(saved.publicationStatus, 'SCHEDULED');
    assert.equal(saved.activationDate, weekStart);
    assert.equal(saved.days.length, 5);
    assert.ok(saved.days.every((day) => day.meals.length === 1));
  });

  test('mantiene el tablero de lunes a viernes cuando la semana cruza de mes', async () => {
    const summary = await mealsService.getWeeklyOrderSummary('2099-08-31');

    assert.equal(summary.weekStart, '2099-08-31');
    assert.equal(summary.weekEnd, '2099-09-04');
    assert.deepEqual(
      summary.days.map((day) => day.date),
      ['2099-08-31', '2099-09-01', '2099-09-02', '2099-09-03', '2099-09-04'],
    );
  });

  test('guarda horarios por día, aplica el cierre y calcula totales para el Chef', async () => {
    const actor = await prisma.user.findUniqueOrThrow({
      where: { username: TRANSFER_USERNAME },
      select: { id: true },
    });
    const futureMonday = new Date('2099-01-01T00:00:00.000Z');
    while (futureMonday.getUTCDay() !== 1) {
      futureMonday.setUTCDate(futureMonday.getUTCDate() + 1);
    }
    const weekStart = futureMonday.toISOString().slice(0, 10);
    const dates = Array.from({ length: 5 }, (_, index) => {
      const date = new Date(futureMonday);
      date.setUTCDate(futureMonday.getUTCDate() + index);
      return date;
    });
    const dailyTimes = ['07:30', '08:15', '09:00', '08:45', '07:45'];
    const configured = await mealsService.saveWeeklyCutoffs(
      weekStart,
      {
        mode: 'DAILY',
        days: dates.map((date, index) => ({
          date: date.toISOString().slice(0, 10),
          cutoffTime: dailyTimes[index],
        })),
      },
      actor.id,
    );
    assert.equal(configured.cutoffMode, 'DAILY');
    assert.deepEqual(configured.days.map((day) => day.cutoffTime), dailyTimes);

    const mondayMeal = configured.days[0].meals[0];
    const tuesdayMeal = configured.days[1].meals[0];
    const alternative = await prisma.meal.create({
      data: {
        name: `${TEST_PREFIX}FUTURO-ALTERNATIVA`,
        availableDate: dates[0],
        mealType: MealType.LUNCH,
      },
    });
    const first = await createEmployee('CHEF-TOTAL-1');
    const second = await createEmployee('CHEF-TOTAL-2');
    const third = await createEmployee('CHEF-TOTAL-3');
    const mondayBeforeCutoff = new Date(futureMonday);
    mondayBeforeCutoff.setUTCHours(13, 0, 0, 0);

    await mealsService.saveCurrentWeekReservations(
      first.employeeCode,
      [{ date: configured.days[0].date, mealId: mondayMeal.id }],
      mondayBeforeCutoff,
    );
    await mealsService.saveCurrentWeekReservations(
      second.employeeCode,
      [{ date: configured.days[0].date, mealId: mondayMeal.id }],
      mondayBeforeCutoff,
    );
    await mealsService.saveCurrentWeekReservations(
      third.employeeCode,
      [{ date: configured.days[1].date, mealId: tuesdayMeal.id }],
      mondayBeforeCutoff,
    );

    const mondayAtCutoff = new Date(futureMonday);
    mondayAtCutoff.setUTCHours(13, 30, 0, 0);
    await assert.rejects(
      mealsService.saveCurrentWeekReservations(
        first.employeeCode,
        [{ date: configured.days[0].date, mealId: alternative.id }],
        mondayAtCutoff,
      ),
      /cerró a las 07:30/,
    );

    const summary = await mealsService.getWeeklyOrderSummary(weekStart);
    assert.equal(summary.totalReservations, 3);
    assert.equal(summary.days[0].total, 2);
    assert.equal(summary.days[1].total, 1);
    assert.equal(
      summary.days[0].meals.find((meal) => meal.mealId === mondayMeal.id)?.total,
      2,
    );

    const generalConfiguration = await mealsService.saveWeeklyCutoffs(
      weekStart,
      { mode: 'GENERAL', generalTime: '09:10' },
      actor.id,
    );
    assert.equal(generalConfiguration.cutoffMode, 'GENERAL');
    assert.equal(generalConfiguration.orderingCutoffTime, '09:10');
    assert.ok(
      generalConfiguration.days.every((day) => day.cutoffTime === '09:10'),
    );
  });
});

describe('transferencias de almuerzo', () => {
  test('D2 recibe la entrega, el cobro mensual y el log de RH mientras D1 queda excluido', async () => {
    const source = await createEmployee('TRANSFER-D1');
    const beneficiary = await createEmployee('TRANSFER-D2');
    const reservation = await createReservation(
      source.employeeCode,
      'ALMUERZO TRANSFERIBLE',
    );
    const futureDate = new Date(getToday());
    futureDate.setUTCDate(futureDate.getUTCDate() + 2);
    const futureReservation = await createReservation(
      source.employeeCode,
      'ALMUERZO FUTURO TRANSFERIBLE',
      futureDate,
    );
    const actor = await prisma.user.findUniqueOrThrow({
      where: { username: TRANSFER_USERNAME },
      select: { id: true, username: true },
    });
    const mealDate = getToday().toISOString().slice(0, 10);

    const pendingBefore = await transfersService.getTransferableReservations(
      source.employeeCode,
    );
    const transferred = await transfersService.transferLunch(
      source.employeeCode,
      beneficiary.employeeCode,
      mealDate,
      actor,
    );
    const stored = await prisma.mealReservation.findUniqueOrThrow({
      where: { id: reservation.id },
    });
    const [sourcePending, beneficiaryPending] = await Promise.all([
      mealsService.getPendingToday(source.employeeCode),
      mealsService.getPendingToday(beneficiary.employeeCode),
    ]);

    assert.equal(transferred.originalEmployee.code, source.employeeCode);
    assert.equal(transferred.beneficiary.code, beneficiary.employeeCode);
    assert.equal(stored.employeeId, source.employeeCode);
    assert.equal(stored.transferEmployeeId, beneficiary.employeeCode);
    assert.equal(pendingBefore.reservations.length, 2);
    assert.ok(
      pendingBefore.reservations.some(
        (item) => item.id === futureReservation.id,
      ),
    );
    assert.deepEqual(sourcePending, []);
    assert.equal(beneficiaryPending.length, 1);
    assert.equal(beneficiaryPending[0].employeeCode, beneficiary.employeeCode);

    const sourceAttempt = await mealsService.requestLunch(source.employeeCode);
    const beneficiaryAttempt = await mealsService.requestLunch(
      beneficiary.employeeCode,
    );
    const approvedRequest = await prisma.mealRequest.findFirstOrThrow({
      where: {
        mealReservationId: reservation.id,
        status: MealRequestStatus.APPROVED,
      },
    });
    const [sourceSummary, beneficiarySummary, auditLog, recentTransfers] =
      await Promise.all([
        consultationsService.getMonthlySummary(source.employeeCode),
        consultationsService.getMonthlySummary(beneficiary.employeeCode),
        prisma.auditLog.findFirstOrThrow({
          where: {
            entityName: 'meal_reservations',
            entityId: reservation.id,
            action: 'TRANSFER',
          },
        }),
        transfersService.getRecentTransfers(),
      ]);

    assert.equal(sourceAttempt.status, 'NO_MEAL_RESERVED');
    assert.equal(beneficiaryAttempt.status, MealRequestStatus.APPROVED);
    assert.equal(approvedRequest.employeeId, beneficiary.employeeCode);
    const futureIsCurrentMonth = futureDate.toISOString().slice(0, 7) ===
      getToday().toISOString().slice(0, 7);
    assert.equal(sourceSummary.summary.totalLunches, futureIsCurrentMonth ? 1 : 0);
    if (futureIsCurrentMonth) {
      assert.equal(sourceSummary.items[0].id, futureReservation.id);
    }
    assert.equal(beneficiarySummary.summary.totalLunches, 1);
    assert.equal(beneficiarySummary.summary.delivered, 1);
    assert.equal(auditLog.actorUserId, actor.id);
    assert.match(auditLog.newValues ?? '', new RegExp(beneficiary.employeeCode));
    assert.ok(
      recentTransfers.some(
        (item) =>
          item.reservationId === reservation.id &&
          item.transferredBy === TRANSFER_USERNAME,
      ),
    );

    const pendingAfter = await transfersService.getTransferableReservations(
      source.employeeCode,
    );
    assert.deepEqual(
      pendingAfter.reservations.map((item) => item.id),
      [futureReservation.id],
    );

    await assert.rejects(
      transfersService.transferLunch(
        source.employeeCode,
        `${TEST_PREFIX}OTRO`,
        mealDate,
        actor,
      ),
      /ya fue transferida/,
    );
  });

  test('bloquea transferir una comida entregada o dar una segunda comida a D2', async () => {
    const deliveredSource = await createEmployee('TRANSFER-DELIVERED');
    const occupiedSource = await createEmployee('TRANSFER-OCCUPIED-SOURCE');
    const occupiedBeneficiary = await createEmployee('TRANSFER-OCCUPIED-D2');
    const actor = await prisma.user.findUniqueOrThrow({
      where: { username: TRANSFER_USERNAME },
      select: { id: true, username: true },
    });
    const mealDate = getToday().toISOString().slice(0, 10);

    await createReservation(deliveredSource.employeeCode, 'YA ENTREGADO');
    await createReservation(occupiedSource.employeeCode, 'PARA TRANSFERIR');
    await createReservation(occupiedBeneficiary.employeeCode, 'YA RESERVADO');
    await mealsService.requestLunch(deliveredSource.employeeCode);

    await assert.rejects(
      transfersService.transferLunch(
        deliveredSource.employeeCode,
        occupiedSource.employeeCode,
        mealDate,
        actor,
      ),
      /ya fue entregada/,
    );
    await assert.rejects(
      transfersService.transferLunch(
        occupiedSource.employeeCode,
        occupiedBeneficiary.employeeCode,
        mealDate,
        actor,
      ),
      /ya tiene una comida/,
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
    while ([0, 6].includes(firstDate.getUTCDay())) {
      firstDate.setUTCDate(firstDate.getUTCDate() + 1);
    }
    const secondDate = new Date(firstDate);
    secondDate.setUTCDate(firstDate.getUTCDate() + 7);
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

  test('agrupa agosto de 2026 solo en semanas laborales de lunes a viernes', () => {
    const weeks = consultationsService.buildWeeklySummary(
      new Date('2026-08-01T00:00:00.000Z'),
      new Date('2026-09-01T00:00:00.000Z'),
      [
        { date: '2026-08-01', quantity: 8 },
        { date: '2026-08-03', quantity: 1 },
        { date: '2026-08-21', quantity: 2 },
        { date: '2026-08-31', quantity: 1 },
      ],
    );

    assert.deepEqual(
      weeks.map(({ startDate, endDate }) => [startDate, endDate]),
      [
        ['2026-08-03', '2026-08-07'],
        ['2026-08-10', '2026-08-14'],
        ['2026-08-17', '2026-08-21'],
        ['2026-08-24', '2026-08-28'],
        ['2026-08-31', '2026-08-31'],
      ],
    );
    assert.deepEqual(weeks.map((week) => week.count), [1, 0, 2, 0, 1]);
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
