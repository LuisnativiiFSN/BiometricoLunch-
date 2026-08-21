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
const prisma = new PrismaService();
let app;
let baseUrl;

async function cleanup() {
  const users = await prisma.user.findMany({
    where: { username: { in: [...TEST_USERS, MANAGED_USER] } },
    select: { id: true },
  });
  const ids = users.map((user) => user.id);

  if (ids.length === 0) return;

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
    assert.equal((await api('/meals/pending-today', chefCookie)).status, 200);
    assert.equal((await api('/users', chefCookie)).status, 403);
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
