import 'dotenv/config';
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import bcrypt from 'bcryptjs';
import cookieParser from 'cookie-parser';
import { AppModule } from '../dist/app.module.js';
import { PrismaService } from '../dist/prisma/prisma.service.js';

const TEST_USERS = ['auto-role-admin', 'auto-role-rh', 'auto-role-chef'];
const MANAGED_USER = 'auto-managed-rh';
const TEST_PASSWORD = 'AutomaticTest!2026';
const MANAGED_PASSWORD = 'ManagedInitial!2026';
const MANAGED_NEW_PASSWORD = 'ManagedUpdated!2026';
const TEST_MEAL_NAME = 'AUTO-MEAL-ALMUERZO ADMINISTRATIVO';
const prisma = new PrismaService();
let app;
let baseUrl;

async function cleanup() {
  const users = await prisma.user.findMany({
    where: { username: { in: [...TEST_USERS, MANAGED_USER] } },
    select: { id: true },
  });
  const ids = users.map((user) => user.id);

  if (ids.length > 0) {
    await prisma.$transaction([
      prisma.auditLog.deleteMany({
        where: {
          OR: [
            { actorUserId: { in: ids } },
            { entityName: 'users', entityId: { in: ids } },
          ],
        },
      }),
      prisma.user.deleteMany({ where: { id: { in: ids } } }),
    ]);
  }

  await prisma.meal.deleteMany({ where: { name: TEST_MEAL_NAME } });
}

async function login(username) {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password: TEST_PASSWORD }),
  });
  assert.equal(response.status, 200);
  const cookie = response.headers.get('set-cookie');
  assert.ok(cookie);
  return cookie.split(';', 1)[0];
}

function api(path, cookie, options = {}) {
  return fetch(`${baseUrl}/api${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(cookie ? { Cookie: cookie } : {}),
      ...options.headers,
    },
  });
}

function getToday() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Guatemala',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function getCurrentMonday() {
  const date = new Date(`${getToday()}T00:00:00.000Z`);
  const day = date.getUTCDay();
  date.setUTCDate(date.getUTCDate() + (day === 0 ? -6 : 1 - day));
  return date.toISOString().slice(0, 10);
}

function addDays(date, days) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

before(async () => {
  await prisma.onModuleInit();
  await cleanup();
  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 4);
  await prisma.user.createMany({
    data: [
      { username: TEST_USERS[0], passwordHash, role: 'ADMIN' },
      { username: TEST_USERS[1], passwordHash, role: 'RH' },
      { username: TEST_USERS[2], passwordHash, role: 'CHEF' },
    ],
  });

  app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix('api');
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  await app.listen(0, '127.0.0.1');
  const address = app.getHttpServer().address();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await app?.close();
  await cleanup();
  await prisma.onModuleDestroy();
});

describe('autenticación y permisos por rol', () => {
  test('bloquea las rutas internas sin sesión y mantiene salud/kiosco públicos', async () => {
    assert.equal((await api('/meals/pending-today')).status, 401);
    assert.equal((await api('/meals/pending-today/export')).status, 401);
    assert.equal((await api('/meal-planning/adjustments')).status, 401);
    assert.equal((await api('/employees')).status, 401);
    assert.equal((await api('/health')).status, 200);
    assert.equal(
      (
        await api('/kiosk/request-meal', undefined, {
          method: 'POST',
          body: JSON.stringify({ employeeId: 'NO-EXISTE' }),
        })
      ).status,
      201,
    );
  });

  test('aplica las páginas y acciones permitidas para Admin, RH y Chef', async () => {
    const [adminCookie, rhCookie, chefCookie] = await Promise.all([
      login(TEST_USERS[0]),
      login(TEST_USERS[1]),
      login(TEST_USERS[2]),
    ]);

    assert.equal((await api('/users', adminCookie)).status, 200);
    assert.equal((await api('/employees', adminCookie)).status, 200);
    assert.equal((await api('/employees', rhCookie)).status, 200);
    assert.equal((await api('/employees/departments', adminCookie)).status, 200);
    assert.equal((await api('/employees/departments', rhCookie)).status, 200);
    assert.equal(
      (
        await api('/meals/reservations/manual', rhCookie, {
          method: 'POST',
          body: JSON.stringify({
            employeeId: 'NO-EXISTE',
            mealId: '00000000-0000-4000-8000-000000000000',
          }),
        })
      ).status,
      403,
    );
    assert.equal((await api('/employees', chefCookie)).status, 403);
    assert.equal((await api('/employees/departments', chefCookie)).status, 403);
    assert.equal((await api('/employees/CUALQUIERA', chefCookie)).status, 403);
    assert.equal(
      (
        await api('/employees', chefCookie, {
          method: 'POST',
          body: JSON.stringify({
            employeeCode: 'CHEF-NO-AUTORIZADO',
            name: 'Sin acceso',
          }),
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await api('/meals/pending-today?employeeCode=18358', chefCookie)
      ).status,
      200,
    );
    assert.equal(
      (await api('/meals/pending-today/export', chefCookie)).status,
      403,
    );
    assert.equal((await api('/users', chefCookie)).status, 403);
    assert.equal((await api('/meal-planning/adjustments', rhCookie)).status, 200);
    assert.equal((await api('/meal-planning/adjustments', adminCookie)).status, 403);
    assert.equal((await api('/meal-planning/adjustments', chefCookie)).status, 403);
    assert.equal(
      (
        await api(
          '/meal-planning/adjustments/employees/NO-EXISTE',
          rhCookie,
        )
      ).status,
      404,
    );
  });

  test('impide modificar la contraseña de la cuenta administradora protegida', async () => {
    const adminCookie = await login(TEST_USERS[0]);
    const protectedAdmin = await prisma.user.findFirstOrThrow({
      where: { passwordLocked: true },
      select: { id: true, passwordHash: true },
    });
    const response = await api(`/users/${protectedAdmin.id}/password`, adminCookie, {
      method: 'PATCH',
      body: JSON.stringify({ password: 'NoDebeCambiar!2026' }),
    });
    const unchanged = await prisma.user.findUniqueOrThrow({
      where: { id: protectedAdmin.id },
      select: { passwordHash: true },
    });

    assert.equal(response.status, 400);
    assert.equal(unchanged.passwordHash, protectedAdmin.passwordHash);

    const testAdmin = await prisma.user.findUniqueOrThrow({
      where: { username: TEST_USERS[0] },
      select: { id: true },
    });
    assert.equal(
      (
        await api(`/users/${testAdmin.id}/password`, adminCookie, {
          method: 'PATCH',
          body: JSON.stringify({ password: 'TampocoDebeCambiar!2026' }),
        })
      ).status,
      400,
    );
  });

  test('solo el administrador agrega el almuerzo disponible de hoy', async () => {
    const [adminCookie, rhCookie, chefCookie] = await Promise.all([
      login(TEST_USERS[0]),
      login(TEST_USERS[1]),
      login(TEST_USERS[2]),
    ]);
    const body = JSON.stringify({ name: TEST_MEAL_NAME });

    assert.equal(
      (
        await api('/meals/available-today', rhCookie, {
          method: 'POST',
          body,
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await api('/meals/available-today', chefCookie, {
          method: 'POST',
          body,
        })
      ).status,
      403,
    );

    const createdResponse = await api('/meals/available-today', adminCookie, {
      method: 'POST',
      body,
    });
    assert.equal(createdResponse.status, 201);
    const created = await createdResponse.json();
    assert.equal(created.status, 'CREATED');
    assert.equal(created.meal.name, TEST_MEAL_NAME);
    assert.equal(created.meal.mealType, 'LUNCH');

    const repeatedResponse = await api('/meals/available-today', adminCookie, {
      method: 'POST',
      body,
    });
    assert.equal(repeatedResponse.status, 201);
    const repeated = await repeatedResponse.json();
    assert.equal(repeated.status, 'ALREADY_EXISTS');
    assert.equal(repeated.meal.id, created.meal.id);
    assert.equal(
      await prisma.meal.count({ where: { name: TEST_MEAL_NAME } }),
      1,
    );
  });

  test('la transferencia es exclusiva de Administrador y Recursos Humanos', async () => {
    const [adminCookie, rhCookie, chefCookie] = await Promise.all([
      login(TEST_USERS[0]),
      login(TEST_USERS[1]),
      login(TEST_USERS[2]),
    ]);
    const body = JSON.stringify({
      fromEmployeeCode: 'D1-NO-EXISTE',
      toEmployeeCode: 'D2-NO-EXISTE',
      mealDate: getToday(),
    });

    assert.equal(
      (await api('/transfers', adminCookie, { method: 'POST', body })).status,
      404,
    );
    assert.equal(
      (await api('/transfers', chefCookie, { method: 'POST', body })).status,
      403,
    );
    assert.equal(
      (await api('/transfers', rhCookie, { method: 'POST', body })).status,
      404,
    );
    assert.equal((await api('/transfers', adminCookie)).status, 200);
    assert.equal((await api('/transfers', rhCookie)).status, 200);
    assert.equal(
      (await api('/transfers/pending/D1-NO-EXISTE', adminCookie)).status,
      404,
    );
    assert.equal(
      (await api('/transfers/pending/D1-NO-EXISTE', chefCookie)).status,
      403,
    );
  });

  test('la exportación individual es privada para Administrador y Recursos Humanos', async () => {
    const [adminCookie, rhCookie, chefCookie] = await Promise.all([
      login(TEST_USERS[0]),
      login(TEST_USERS[1]),
      login(TEST_USERS[2]),
    ]);
    const path =
      '/meal-audits/employees/NO-EXISTE/export?startDate=2026-02-10&endDate=2026-08-28';

    assert.equal((await api(path)).status, 401);
    assert.equal((await api(path, chefCookie)).status, 403);
    assert.equal((await api(path, adminCookie)).status, 404);
    assert.equal((await api(path, rhCookie)).status, 404);
  });

  test('el reporte de nómina es privado para Administrador y Recursos Humanos', async () => {
    const [adminCookie, rhCookie, chefCookie] = await Promise.all([
      login(TEST_USERS[0]),
      login(TEST_USERS[1]),
      login(TEST_USERS[2]),
    ]);
    const path =
      '/meal-audits/payroll/export?startDate=2099-02-01&endDate=2099-02-05';

    assert.equal((await api(path)).status, 401);
    assert.equal((await api(path, chefCookie)).status, 403);
    assert.equal((await api(path, adminCookie)).status, 200);
    assert.equal((await api(path, rhCookie)).status, 200);
  });

  test('los pedidos diarios y semanales solo se exportan por Administrador y RH', async () => {
    const [adminCookie, rhCookie, chefCookie] = await Promise.all([
      login(TEST_USERS[0]),
      login(TEST_USERS[1]),
      login(TEST_USERS[2]),
    ]);
    const currentMonday = getCurrentMonday();
    const weeklyPath = `/meal-audits/orders/weeks/${currentMonday}/export`;
    const dailyPath = `/meal-audits/orders/days/${addDays(currentMonday, 1)}/export`;

    assert.equal((await api(weeklyPath)).status, 401);
    assert.equal((await api(weeklyPath, chefCookie)).status, 403);
    assert.equal((await api(dailyPath, chefCookie)).status, 403);
    assert.equal((await api(weeklyPath, adminCookie)).status, 200);
    assert.equal((await api(dailyPath, rhCookie)).status, 200);
  });

  test('el administrador crea cuentas RH y restablece su contraseña de forma segura', async () => {
    const [adminCookie, rhCookie] = await Promise.all([
      login(TEST_USERS[0]),
      login(TEST_USERS[1]),
    ]);

    const forbiddenCreate = await api('/users', rhCookie, {
      method: 'POST',
      body: JSON.stringify({
        username: MANAGED_USER,
        password: MANAGED_PASSWORD,
        role: 'RH',
      }),
    });
    assert.equal(forbiddenCreate.status, 403);

    const createResponse = await api('/users', adminCookie, {
      method: 'POST',
      body: JSON.stringify({
        username: MANAGED_USER,
        password: MANAGED_PASSWORD,
        role: 'RH',
      }),
    });
    assert.equal(createResponse.status, 201);
    const created = await createResponse.json();
    assert.equal(created.username, MANAGED_USER);
    assert.equal(created.role, 'RH');
    assert.equal('password' in created, false);
    assert.equal('passwordHash' in created, false);

    const stored = await prisma.user.findUniqueOrThrow({
      where: { username: MANAGED_USER },
      select: { id: true, passwordHash: true },
    });
    assert.notEqual(stored.passwordHash, MANAGED_PASSWORD);
    assert.equal(await bcrypt.compare(MANAGED_PASSWORD, stored.passwordHash), true);

    assert.equal(
      (
        await api(`/users/${stored.id}/password`, rhCookie, {
          method: 'PATCH',
          body: JSON.stringify({ password: MANAGED_NEW_PASSWORD }),
        })
      ).status,
      403,
    );

    const resetResponse = await api(`/users/${stored.id}/password`, adminCookie, {
      method: 'PATCH',
      body: JSON.stringify({ password: MANAGED_NEW_PASSWORD }),
    });
    assert.equal(resetResponse.status, 200);

    const oldLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: MANAGED_USER, password: MANAGED_PASSWORD }),
    });
    assert.equal(oldLogin.status, 401);

    const newLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: MANAGED_USER, password: MANAGED_NEW_PASSWORD }),
    });
    assert.equal(newLogin.status, 200);
  });
});
