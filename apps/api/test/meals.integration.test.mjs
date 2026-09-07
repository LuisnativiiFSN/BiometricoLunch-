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
import { MealAuditsService } from '../dist/consultations/meal-audits.service.js';
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
const mealAuditsService = new MealAuditsService(prisma);
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

function createEnrollment(employeeId, active = true) {
  return prisma.fingerprint.create({
    data: {
      employeeId,
      fingerPosition: 'RIGHT_INDEX',
      templateData: Buffer.alloc(64, 7),
      templateFormat: 'ANSI_378_2004',
      quality: 80,
      active,
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
  test('acepta employeeCode y un enrolamiento activo relacionado', async () => {
    const employee = await createEmployee('VALID-ENROLLMENT');
    const enrollment = await createEnrollment(employee.employeeCode);
    await createReservation(employee.employeeCode, 'POLLO VALIDADO');

    const result = await mealsService.requestLunch(
      employee.employeeCode,
      enrollment.id,
    );

    assert.equal(result.status, MealRequestStatus.APPROVED);
  });

  test('rechaza un enrolamiento desactivado', async () => {
    const employee = await createEmployee('INACTIVE-ENROLLMENT');
    const enrollment = await createEnrollment(employee.employeeCode, false);

    await assert.rejects(
      () => mealsService.requestLunch(employee.employeeCode, enrollment.id),
      (error) => error.getStatus?.() === 403,
    );
  });

  test('rechaza un enrolamiento que pertenece a otro empleado', async () => {
    const owner = await createEmployee('ENROLLMENT-OWNER');
    const claimed = await createEmployee('ENROLLMENT-CLAIMED');
    const enrollment = await createEnrollment(owner.employeeCode);

    await assert.rejects(
      () => mealsService.requestLunch(claimed.employeeCode, enrollment.id),
      (error) => error.getStatus?.() === 403,
    );
  });

  test('el contrato anterior depende de la bandera de compatibilidad', async () => {
    const previous = process.env.KIOSK_MEAL_LEGACY_COMPATIBILITY;
    process.env.KIOSK_MEAL_LEGACY_COMPATIBILITY = 'false';
    try {
      await assert.rejects(
        () => mealsService.requestLunch('EMPLOYEE-WITHOUT-ENROLLMENT'),
        (error) => error.getStatus?.() === 400,
      );
    } finally {
      if (previous === undefined) {
        delete process.env.KIOSK_MEAL_LEGACY_COMPATIBILITY;
      } else {
        process.env.KIOSK_MEAL_LEGACY_COMPATIBILITY = previous;
      }
    }
  });

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
    assert.match(exported.fileName, /^pedidos-pendientes-\d{4}-\d{2}-\d{2}\.xlsx$/);
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

  test('solo permite reservar el lunes antes de las 09:30', async () => {
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
    const mondayAtCutoff = new Date(monday);
    mondayAtCutoff.setUTCHours(15, 30, 0, 0);
    const tuesdayMorning = new Date(dates[1]);
    tuesdayMorning.setUTCHours(13, 0, 0, 0);

    await mealsService.saveCurrentWeekReservations(
      previousEmployee.employeeCode,
      [{ date: dates[0].toISOString().slice(0, 10), mealId: meals[0].id }],
      mondayBeforeCutoff,
    );
    await assert.rejects(
      mealsService.saveCurrentWeekReservations(
        previousEmployee.employeeCode,
        [{ date: dates[0].toISOString().slice(0, 10), mealId: mondayAlternative.id }],
        mondayAtCutoff,
      ),
      /cerraron el lunes a las 09:30/,
    );

    await mealsService.saveCurrentWeekReservations(
      cutoffEmployee.employeeCode,
      [{ date: dates[1].toISOString().slice(0, 10), mealId: meals[1].id }],
      mondayBeforeCutoff,
    );
    await assert.rejects(
      mealsService.saveCurrentWeekReservations(
        cutoffEmployee.employeeCode,
        [{ date: dates[1].toISOString().slice(0, 10), mealId: tuesdayAlternative.id }],
        tuesdayMorning,
      ),
      /solo están disponibles los lunes/,
    );

    const openMenu = await mealsService.getCurrentWeeklyMenu(mondayBeforeCutoff);
    const closedMenu = await mealsService.getCurrentWeeklyMenu(mondayAtCutoff);
    assert.equal(openMenu.publicOrderingCutoffTime, '09:30');
    assert.equal(openMenu.publicOrderingOpen, true);
    assert.ok(openMenu.days.every((day) => day.canModify));
    assert.equal(closedMenu.publicOrderingOpen, false);
    assert.ok(closedMenu.days.every((day) => !day.canModify));
  });

  test('RH agrega, cambia y cancela reservaciones cerradas dejando quién y por qué', async () => {
    const employee = await createEmployee('RH-ADJUSTMENT', true, 'Operaciones');
    const employeeWithoutReservation = await createEmployee(
      'RH-ADJUSTMENT-ADD',
      true,
      'Operaciones',
    );
    const monday = new Date('2098-02-01T00:00:00.000Z');
    while (monday.getUTCDay() !== 1) {
      monday.setUTCDate(monday.getUTCDate() + 1);
    }
    const mealDate = new Date(monday);
    mealDate.setUTCDate(monday.getUTCDate() + 2);
    const afterPublicClosure = new Date(monday);
    afterPublicClosure.setUTCHours(17, 0, 0, 0);
    const originalReservation = await createReservation(
      employee.employeeCode,
      'RH ORIGINAL',
      mealDate,
    );
    const alternative = await prisma.meal.create({
      data: {
        name: `${TEST_PREFIX}RH ALTERNATIVA`,
        availableDate: mealDate,
        mealType: MealType.LUNCH,
      },
    });
    const actor = await prisma.user.findUniqueOrThrow({
      where: { username: TRANSFER_USERNAME },
      select: { id: true, username: true },
    });
    const date = mealDate.toISOString().slice(0, 10);

    const emptyContext = await mealsService.getCurrentWeekMealAdjustment(
      employeeWithoutReservation.employeeCode,
      afterPublicClosure,
    );
    const emptyDay = emptyContext.days.find((day) => day.date === date);
    assert.ok(emptyDay);
    assert.equal(emptyDay.reservation, null);
    assert.equal(emptyDay.canModify, true);

    const added = await mealsService.adjustCurrentWeekReservation(
      employeeWithoutReservation.employeeCode,
      {
        date,
        action: 'ADD',
        mealId: alternative.id,
        reason: 'Empleado solicitó agregar el almuerzo en Recursos Humanos',
      },
      actor,
      afterPublicClosure,
    );
    assert.equal(added.status, 'ADDED');
    assert.equal(added.previousMeal, null);
    assert.equal(added.newMeal, alternative.name);
    assert.ok(
      await prisma.mealReservation.findUnique({
        where: {
          employeeId_mealDate_mealType: {
            employeeId: employeeWithoutReservation.employeeCode,
            mealDate,
            mealType: MealType.LUNCH,
          },
        },
      }),
    );

    const changed = await mealsService.adjustCurrentWeekReservation(
      employee.employeeCode,
      {
        date,
        action: 'CHANGE',
        mealId: alternative.id,
        reason: 'Empleado solicitó el cambio personalmente en Recursos Humanos',
      },
      actor,
      afterPublicClosure,
    );
    assert.equal(changed.status, 'CHANGED');
    assert.equal(changed.modifiedBy, actor.username);
    assert.equal(
      (await prisma.mealReservation.findUniqueOrThrow({
        where: { id: originalReservation.id },
      })).mealId,
      alternative.id,
    );

    const cancelled = await mealsService.adjustCurrentWeekReservation(
      employee.employeeCode,
      {
        date,
        action: 'CANCEL',
        reason: 'Empleado canceló el almuerzo personalmente por ausencia',
      },
      actor,
      afterPublicClosure,
    );
    assert.equal(cancelled.status, 'CANCELLED');
    assert.equal(
      await prisma.mealReservation.findUnique({
        where: { id: originalReservation.id },
      }),
      null,
    );

    const history = await mealsService.getRecentMealAdjustments();
    const employeeHistory = history.filter(
      (item) => item.employee.code === employee.employeeCode,
    );
    assert.deepEqual(
      employeeHistory.map((item) => item.action),
      ['CANCEL', 'CHANGE'],
    );
    assert.ok(employeeHistory.every((item) => item.modifiedBy === actor.username));
    assert.match(employeeHistory[0].reason, /personalmente/);
    const addedHistory = history.find(
      (item) => item.employee.code === employeeWithoutReservation.employeeCode,
    );
    assert.equal(addedHistory?.action, 'ADD');
    assert.equal(addedHistory?.previousMeal, null);
    assert.equal(addedHistory?.newMeal, alternative.name);
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

  test('guarda únicamente el cierre del lunes y calcula los totales semanales', async () => {
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
    const configured = await mealsService.saveWeeklyCutoffs(
      weekStart,
      { cutoffTime: '09:10' },
      actor.id,
    );
    assert.equal(configured.cutoffMode, 'GENERAL');
    assert.equal(configured.publicOrderingCutoffTime, '09:10');
    assert.ok(configured.days.every((day) => day.cutoffTime === '09:10'));
    assert.equal(
      await prisma.mealOrderCutoff.count({
        where: { mealDate: { gte: dates[0], lte: dates[4] } },
      }),
      1,
    );

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
    mondayAtCutoff.setUTCHours(15, 10, 0, 0);
    await assert.rejects(
      mealsService.saveCurrentWeekReservations(
        first.employeeCode,
        [{ date: configured.days[0].date, mealId: alternative.id }],
        mondayAtCutoff,
      ),
      /cerraron el lunes a las 09:10/,
    );

    const summary = await mealsService.getWeeklyOrderSummary(weekStart);
    assert.equal(summary.totalReservations, 3);
    assert.equal(summary.days[0].total, 2);
    assert.equal(summary.days[1].total, 1);
    assert.equal(
      summary.days[0].meals.find((meal) => meal.mealId === mondayMeal.id)?.total,
      2,
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
    const futureWeekMonday = new Date(futureDate);
    futureWeekMonday.setUTCDate(
      futureWeekMonday.getUTCDate() - ((futureWeekMonday.getUTCDay() + 6) % 7),
    );
    const futureBelongsToCurrentMonth =
      futureWeekMonday.toISOString().slice(0, 7) ===
      getToday().toISOString().slice(0, 7);
    assert.equal(
      sourceSummary.summary.totalLunches,
      futureBelongsToCurrentMonth ? 1 : 0,
    );
    if (futureBelongsToCurrentMonth) {
      assert.equal(sourceSummary.items[0].id, futureReservation.id);
    }
    const currentWeekMonday = new Date(getToday());
    currentWeekMonday.setUTCDate(
      currentWeekMonday.getUTCDate() -
        ((currentWeekMonday.getUTCDay() + 6) % 7),
    );
    const currentWeekBelongsToCurrentMonth =
      currentWeekMonday.toISOString().slice(0, 7) ===
      getToday().toISOString().slice(0, 7);
    assert.equal(
      beneficiarySummary.summary.totalLunches,
      currentWeekBelongsToCurrentMonth ? 1 : 0,
    );
    assert.equal(
      beneficiarySummary.summary.delivered,
      currentWeekBelongsToCurrentMonth ? 1 : 0,
    );
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

describe('consulta pública de almuerzos', () => {
  test('resume almuerzos, entregas y semanas completas de un mes anterior', async () => {
    const employee = await createEmployee('CONSULTATION');
    const today = getToday();
    const firstDayPreviousMonth = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1),
    );
    const firstDate = new Date(firstDayPreviousMonth);
    while (firstDate.getUTCDay() !== 1) {
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

  test('agrupa agosto de 2026 por lunes y conserva completo el viernes de septiembre', () => {
    const weeks = consultationsService.buildWeeklySummary(
      new Date('2026-08-03T00:00:00.000Z'),
      new Date('2026-09-04T00:00:00.000Z'),
      [
        { date: '2026-08-01', quantity: 8 },
        { date: '2026-08-03', quantity: 1 },
        { date: '2026-08-21', quantity: 2 },
        { date: '2026-08-31', quantity: 1 },
        { date: '2026-09-04', quantity: 4 },
      ],
    );

    assert.deepEqual(
      weeks.map(({ startDate, endDate }) => [startDate, endDate]),
      [
        ['2026-08-03', '2026-08-07'],
        ['2026-08-10', '2026-08-14'],
        ['2026-08-17', '2026-08-21'],
        ['2026-08-24', '2026-08-28'],
        ['2026-08-31', '2026-09-04'],
      ],
    );
    assert.deepEqual(weeks.map((week) => week.count), [1, 0, 2, 0, 5]);
  });

  test('cuenta diez platos en las últimas cuatro semanas aunque crucen de mes y estén pendientes', async () => {
    const employee = await createEmployee('CONSULTATION-FOUR-WEEKS');
    const dates = [
      '2026-08-24',
      '2026-08-25',
      '2026-08-26',
      '2026-08-27',
      '2026-08-28',
      '2026-08-31',
      '2026-09-01',
      '2026-09-02',
      '2026-09-03',
      '2026-09-04',
    ];

    for (const [index, date] of dates.entries()) {
      const availableDate = new Date(`${date}T00:00:00.000Z`);
      const meal = await prisma.meal.create({
        data: {
          name: `${TEST_PREFIX}CUATRO-SEMANAS-${index + 1}`,
          availableDate,
          mealType: MealType.LUNCH,
        },
      });
      await prisma.mealReservation.create({
        data: {
          employeeId: employee.employeeCode,
          mealId: meal.id,
          mealDate: availableDate,
          mealType: MealType.LUNCH,
        },
      });
    }

    const recent = await consultationsService.getRecentWeeks(
      employee.employeeCode,
      new Date('2026-08-31T13:00:00.000Z'),
    );
    const range = await consultationsService.getRangeSummary(
      employee.employeeCode,
      '2026-08-26',
      '2026-09-02',
    );

    assert.deepEqual(recent.period, {
      startDate: '2026-08-10',
      endDate: '2026-09-04',
    });
    assert.deepEqual(recent.weeks.map((week) => week.count), [0, 0, 5, 5]);
    assert.deepEqual(recent.summary, {
      totalLunches: 10,
      delivered: 0,
      pending: 10,
    });
    assert.equal(range.summary.totalLunches, 6);
    assert.equal(range.items.length, 6);
  });

  test('rechaza rangos invertidos o mayores de un año', async () => {
    const employee = await createEmployee('CONSULTATION-RANGE-VALIDATION');

    await assert.rejects(
      consultationsService.getRangeSummary(
        employee.employeeCode,
        '2026-09-05',
        '2026-09-01',
      ),
      /fecha final/,
    );
    await assert.rejects(
      consultationsService.getRangeSummary(
        employee.employeeCode,
        '2025-01-01',
        '2026-01-02',
      ),
      /máximo de consulta/,
    );
  });

  test('exporta un registro individual auditable con totales y detalle del período', async () => {
    const employee = await createEmployee(
      'AUDIT-EXPORT',
      true,
      'Auditoría Interna',
    );
    const actor = await prisma.user.findUniqueOrThrow({
      where: { username: TRANSFER_USERNAME },
      select: { id: true, username: true, role: true },
    });
    const firstDate = new Date('2026-02-10T00:00:00.000Z');
    const secondDate = new Date('2026-08-28T00:00:00.000Z');
    const firstReservation = await createReservation(
      employee.employeeCode,
      'AUDITORÍA PRIMERO',
      firstDate,
    );
    await createReservation(
      employee.employeeCode,
      'AUDITORÍA SEGUNDO',
      secondDate,
    );
    await prisma.mealRequest.create({
      data: {
        employeeId: employee.employeeCode,
        mealReservationId: firstReservation.id,
        mealDate: firstDate,
        mealType: MealType.LUNCH,
        status: MealRequestStatus.APPROVED,
      },
    });

    const exported = await mealAuditsService.exportEmployeeMeals(
      employee.employeeCode,
      '2026-02-10',
      '2026-08-28',
      actor,
      new Date('2026-08-31T14:30:00.000Z'),
    );
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(exported.buffer);
    const sheet = workbook.getWorksheet('Auditoría de almuerzos');

    assert.ok(sheet);
    assert.equal(
      exported.fileName,
      `historial-almuerzos-empleado-${employee.employeeCode}-2026-02-10-a-2026-08-28.xlsx`,
    );
    assert.equal(sheet.getCell('B4').value, employee.employeeCode);
    assert.equal(sheet.getCell('E4').value, employee.name);
    assert.equal(sheet.getCell('H4').value, 'Auditoría Interna');
    assert.equal(sheet.getCell('C7').value.result, 2);
    assert.equal(sheet.getCell('F7').value.result, 1);
    assert.equal(sheet.getCell('I7').value.result, 1);
    assert.deepEqual(
      [sheet.getCell('F10').value, sheet.getCell('F11').value],
      [`${TEST_PREFIX}AUDITORÍA PRIMERO`, `${TEST_PREFIX}AUDITORÍA SEGUNDO`],
    );
    assert.deepEqual(
      [sheet.getCell('H10').value, sheet.getCell('H11').value],
      ['Entregado', 'Pendiente'],
    );
    assert.deepEqual(
      sheet.getRow(9).values.slice(1),
      [
        'Código',
        'Nombre del empleado',
        'Departamento',
        'Fecha',
        'Día',
        'Comida solicitada',
        'Cantidad',
        'Estado',
        'Entregado el',
      ],
    );
    assert.equal(sheet.getCell('A5').value, 'Fecha de generación');
    assert.equal(sheet.columnCount, 9);
    assert.ok(
      await prisma.auditLog.findFirst({
        where: {
          entityName: 'meal_audit_export',
          entityId: employee.employeeCode,
          action: 'CREATE',
          actorUserId: actor.id,
        },
      }),
    );
  });

  test('exporta nómina general y cobra las transferencias solamente al beneficiario', async () => {
    const original = await createEmployee('PAYROLL-A', true, 'Administración');
    const beneficiary = await createEmployee('PAYROLL-B', true, 'Logística');
    const actor = await prisma.user.findUniqueOrThrow({
      where: { username: TRANSFER_USERNAME },
      select: { id: true, username: true, role: true },
    });
    await createReservation(
      original.employeeCode,
      'NÓMINA PROPIA',
      new Date('2099-01-06T00:00:00.000Z'),
    );
    const transferred = await createReservation(
      original.employeeCode,
      'NÓMINA TRANSFERIDA',
      new Date('2099-01-07T00:00:00.000Z'),
    );
    await prisma.mealReservation.update({
      where: { id: transferred.id },
      data: { transferEmployeeId: beneficiary.employeeCode },
    });
    await createReservation(
      beneficiary.employeeCode,
      'NÓMINA BENEFICIARIO',
      new Date('2099-01-08T00:00:00.000Z'),
    );

    const exported = await mealAuditsService.exportPayrollReport(
      '2099-01-06',
      '2099-01-10',
      actor,
      new Date('2099-01-11T14:30:00.000Z'),
    );
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(exported.buffer);
    const sheet = workbook.getWorksheet('REGISTROS');

    assert.ok(sheet);
    assert.equal(
      exported.fileName,
      'reporte-nomina-almuerzos-2099-01-06-a-2099-01-10.xlsx',
    );
    assert.deepEqual(
      sheet.getRow(1).values.slice(1),
      [
        'Codigo Colaborador',
        'Nombres',
        'Centro de trabajo',
        'Platos Consumidos',
        'Rango De Fechas',
      ],
    );
    const reportRows = new Map();
    for (let rowNumber = 2; rowNumber < sheet.rowCount; rowNumber += 1) {
      reportRows.set(sheet.getCell(`A${rowNumber}`).value, {
        consumedMeals: sheet.getCell(`D${rowNumber}`).value,
        range: sheet.getCell(`E${rowNumber}`).value,
      });
    }
    assert.deepEqual(reportRows.get(original.employeeCode), {
      consumedMeals: 1,
      range: '06/01/2099 al 10/01/2099',
    });
    assert.deepEqual(reportRows.get(beneficiary.employeeCode), {
      consumedMeals: 2,
      range: '06/01/2099 al 10/01/2099',
    });
    assert.match(
      sheet.getCell(`D${sheet.rowCount}`).value.formula,
      /^SUBTOTAL\(109,/,
    );
    assert.equal(sheet.getCell(`A${sheet.rowCount}`).value ?? '', '');
    assert.equal(sheet.model.tables[0].style.theme, null);
    assert.ok(
      await prisma.auditLog.findFirst({
        where: {
          entityName: 'payroll_meal_report',
          entityId: '2099-01-06:2099-01-10',
          action: 'CREATE',
          actorUserId: actor.id,
        },
      }),
    );
  });

  test('exporta pedidos semanales agrupados por empleado y totales por plato y día', async () => {
    const employee = await createEmployee(
      'CHEF-REPORT-A',
      true,
      'A-INFORMATICA',
    );
    const secondEmployee = await createEmployee(
      'CHEF-REPORT-B',
      true,
      'Z-VENTAS',
    );
    const actor = await prisma.user.findUniqueOrThrow({
      where: { username: TRANSFER_USERNAME },
      select: { id: true, username: true, role: true },
    });
    const monday = new Date('2099-03-02T00:00:00.000Z');
    const tuesday = new Date('2099-03-03T00:00:00.000Z');
    const thursday = new Date('2099-03-05T00:00:00.000Z');
    const friday = new Date('2099-03-06T00:00:00.000Z');
    const firstReservation = await createReservation(
      employee.employeeCode,
      'REPORTE POLLO',
      monday,
    );
    await createReservation(employee.employeeCode, 'REPORTE SOPA', tuesday);
    await createReservation(employee.employeeCode, 'REPORTE TACOS', thursday);
    await createReservation(employee.employeeCode, 'REPORTE PASTA', friday);
    await createReservation(
      secondEmployee.employeeCode,
      'REPORTE SOPA',
      monday,
    );
    await prisma.meal.create({
      data: {
        name: `${TEST_PREFIX}REPORTE OPCIÓN CERO`,
        availableDate: monday,
        mealType: MealType.LUNCH,
      },
    });
    await prisma.mealRequest.create({
      data: {
        employeeId: employee.employeeCode,
        mealReservationId: firstReservation.id,
        mealDate: monday,
        mealType: MealType.LUNCH,
        status: MealRequestStatus.APPROVED,
      },
    });

    const exported = await mealAuditsService.exportWeeklyOrders(
      '2099-03-02',
      actor,
      new Date('2099-03-02T15:00:00.000Z'),
    );
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(exported.buffer);
    const details = workbook.getWorksheet('Pedidos');
    const totals = workbook.getWorksheet('Totales por día');

    assert.ok(details);
    assert.ok(totals);
    assert.equal(
      exported.fileName,
      'pedidos-semanales-2099-03-02-al-2099-03-06.xlsx',
    );
    assert.deepEqual(
      details.getRow(4).values.slice(1, 6),
      [
        'Código',
        'Nombre del empleado',
        'Departamento',
        'Comida solicitada',
        'Día de la solicitud',
      ],
    );
    const employeeRows = [];
    for (let rowNumber = 5; rowNumber <= details.rowCount; rowNumber += 1) {
      if (details.getCell(`A${rowNumber}`).value === employee.employeeCode) {
        employeeRows.push(rowNumber);
      }
    }
    assert.deepEqual(employeeRows, [5, 6, 7, 8]);
    assert.deepEqual(
      employeeRows.map((rowNumber) => details.getCell(`E${rowNumber}`).value),
      [
        'Lunes 02/03/2099',
        'Martes 03/03/2099',
        'Jueves 05/03/2099',
        'Viernes 06/03/2099',
      ],
    );
    const summaryByMeal = new Map();
    for (let rowNumber = 5; rowNumber <= totals.rowCount; rowNumber += 1) {
      const mealName = totals.getCell(`C${rowNumber}`).value;
      const total = totals.getCell(`D${rowNumber}`).value;
      if (
        typeof mealName === 'string' &&
        total &&
        typeof total === 'object' &&
        'formula' in total
      ) {
        summaryByMeal.set(mealName, total.result ?? 0);
      }
    }
    assert.equal(summaryByMeal.get(`${TEST_PREFIX}REPORTE POLLO`), 1);
    assert.equal(summaryByMeal.get(`${TEST_PREFIX}REPORTE SOPA`), 1);
    assert.equal(summaryByMeal.get(`${TEST_PREFIX}REPORTE OPCIÓN CERO`), 0);
    assert.ok(
      await prisma.auditLog.findFirst({
        where: {
          entityName: 'weekly_meal_orders_export',
          entityId: '2099-03-02:2099-03-06',
          actorUserId: actor.id,
        },
      }),
    );
    await assert.rejects(
      mealAuditsService.exportWeeklyOrders(
        '2099-03-09',
        actor,
        new Date('2099-03-02T15:00:00.000Z'),
      ),
      /semana actual o semanas anteriores/,
    );
  });
});

describe('employees - codigo como llave primaria', () => {
  test('lista departamentos únicos y reutiliza su escritura oficial', async () => {
    const canonicalDepartment = `${TEST_PREFIX}Gestión Humana`;
    await createEmployee('DEPARTMENT-SOURCE', true, canonicalDepartment);

    const created = await employeesService.create({
      employeeCode: `${TEST_PREFIX}DEPARTMENT-NEW`,
      name: 'Empleado departamento normalizado',
      email: 'departamento.normalizado@pruebas.local',
      department: `${TEST_PREFIX.toLowerCase()}gestion   humana`,
      active: true,
    });
    const departments = await employeesService.findDepartments();

    assert.equal(created.department, canonicalDepartment);
    assert.equal(
      departments.filter((department) => department === canonicalDepartment).length,
      1,
    );
  });

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
