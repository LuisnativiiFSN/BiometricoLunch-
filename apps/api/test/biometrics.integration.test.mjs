import 'dotenv/config';
import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';

const { BiometricEncryptionService } = await import(
  '../dist/biometrics/biometric-encryption.service.js'
);
const { BiometricsController } = await import(
  '../dist/biometrics/biometrics.controller.js'
);
const { BiometricsService } = await import(
  '../dist/biometrics/biometrics.service.js'
);
const { PrismaService } = await import('../dist/prisma/prisma.service.js');

const TEST_EMPLOYEE = 'AUTO-BIO-ENROLL';
const TEST_HR_EMPLOYEE = 'AUTO-BIO-HR';
const TEST_NON_HR_EMPLOYEE = 'AUTO-BIO-NON-HR';
const TEST_GALLERY_EMPLOYEE = 'AUTO-BIO-GALLERY';
const TEST_GALLERY_DEVICE = 'auto-biometric-gallery-test-device';
const prisma = new PrismaService();
const encryption = new BiometricEncryptionService();
const service = new BiometricsService(prisma, encryption);
const controller = new BiometricsController(service);
let hrEnrollmentId;
let nonHrEnrollmentId;

function context(enrollmentId = 'test-enrollment-id') {
  return BiometricEncryptionService.createContext(
    enrollmentId,
    'RIGHT_INDEX',
    'ANSI_378_2004',
  );
}

async function cleanup() {
  const employeeCodes = [
    TEST_EMPLOYEE,
    TEST_HR_EMPLOYEE,
    TEST_NON_HR_EMPLOYEE,
    TEST_GALLERY_EMPLOYEE,
  ];
  const authorizations = await prisma.enrollmentAuthorization.findMany({
    where: {
      OR: [
        { operatorEmployeeCode: { in: employeeCodes } },
        { targetEmployeeCode: { in: employeeCodes } },
      ],
    },
    select: { id: true },
  });
  await prisma.auditLog.deleteMany({
    where: {
      OR: [
        { entityName: 'kiosk_devices', entityId: TEST_GALLERY_DEVICE },
        {
          entityName: 'enrollment_authorizations',
          entityId: { in: authorizations.map((item) => item.id) },
        },
        { actorEmployeeId: { in: employeeCodes } },
      ],
    },
  });
  await prisma.enrollmentAuthorization.deleteMany({
    where: { id: { in: authorizations.map((item) => item.id) } },
  });
  await prisma.fingerprint.deleteMany({
    where: { employeeId: { in: employeeCodes } },
  });
  await prisma.employee.deleteMany({
    where: { employeeCode: { in: employeeCodes } },
  });
}

async function createStoredFingerprint(employeeCode) {
  const id = randomUUID();
  const plaintext = randomBytes(512);
  const encrypted = encryption.encrypt(plaintext, context(id));
  try {
    await prisma.fingerprint.create({
      data: {
        id,
        employeeId: employeeCode,
        fingerPosition: 'RIGHT_INDEX',
        templateFormat: 'ANSI_378_2004',
        templateData: encrypted,
        quality: 90,
        active: true,
      },
    });
  } finally {
    plaintext.fill(0);
    encrypted.fill(0);
  }
  return id;
}

async function authorizeEnrollment(
  targetEmployeeCode = TEST_EMPLOYEE,
  fingerPosition = 'RIGHT_INDEX',
  operator = 'hr',
) {
  const isHr = operator === 'hr';
  return controller.authorizeEnrollment({
    operatorEmployeeCode: isHr ? TEST_HR_EMPLOYEE : TEST_NON_HR_EMPLOYEE,
    operatorEnrollmentId: isHr ? hrEnrollmentId : nonHrEnrollmentId,
    targetEmployeeCode,
    fingerPosition,
  });
}

before(async () => {
  await prisma.onModuleInit();
  await cleanup();
  await prisma.employee.createMany({
    data: [
      {
        employeeCode: TEST_EMPLOYEE,
        name: 'Empleado biometrico automatico',
        email: 'biometria@pruebas.local',
        department: 'Pruebas',
        active: true,
      },
      {
        employeeCode: TEST_HR_EMPLOYEE,
        name: 'Operador Gestion Humana',
        email: 'rrhh@pruebas.local',
        department: 'GESTION HUMANA-FSN',
        active: true,
      },
      {
        employeeCode: TEST_NON_HR_EMPLOYEE,
        name: 'Operador no autorizado',
        email: 'otro@pruebas.local',
        department: 'INFORMATICA',
        active: true,
      },
    ],
  });
  hrEnrollmentId = await createStoredFingerprint(TEST_HR_EMPLOYEE);
  nonHrEnrollmentId = await createStoredFingerprint(TEST_NON_HR_EMPLOYEE);
});

after(async () => {
  await cleanup();
  await prisma.onModuleDestroy();
});

describe('cifrado biometrico AES-256-GCM', () => {
  test('cifra y descifra internamente con sobre versionado', () => {
    const plaintext = Buffer.from('plantilla-fmd-de-prueba-no-biometrica');
    const encrypted = encryption.encrypt(plaintext, context());
    const decrypted = encryption.decrypt(encrypted, context());

    assert.notDeepEqual(encrypted, plaintext);
    assert.equal(encrypted.subarray(0, 5).toString('hex'), '4d43423101');
    assert.deepEqual(decrypted, plaintext);

    plaintext.fill(0);
    encrypted.fill(0);
    decrypted.fill(0);
  });
});

describe('POST /api/biometrics/enrollment-authorizations', () => {
  test('autoriza una huella activa de GESTION HUMANA-FSN', async () => {
    const response = await authorizeEnrollment();

    assert.equal(response.status, 'AUTHORIZED');
    assert.equal(response.operator.employeeCode, TEST_HR_EMPLOYEE);
    assert.ok(response.authorizationToken);
    assert.ok(response.expiresAt);
    assert.equal('templateData' in response, false);
    const tokenHash = createHash('sha256')
      .update(response.authorizationToken, 'utf8')
      .digest('hex');
    const stored = await prisma.enrollmentAuthorization.findUniqueOrThrow({
      where: { tokenHash },
    });
    assert.notEqual(stored.tokenHash, response.authorizationToken);
  });

  test('rechaza una huella de otro departamento', async () => {
    const response = await authorizeEnrollment(
      TEST_EMPLOYEE,
      'RIGHT_INDEX',
      'non-hr',
    );

    assert.deepEqual(response, { status: 'NOT_AUTHORIZED' });
  });
});

describe('POST /api/biometrics/enrollments', () => {
  test('una autorización se consume una sola vez', async () => {
    const authorization = await authorizeEnrollment();
    const template = randomBytes(512).toString('base64');
    const dto = {
      authorizationToken: authorization.authorizationToken,
      employeeCode: TEST_EMPLOYEE,
      fingerPosition: 'RIGHT_INDEX',
      templateFormat: 'ANSI_378_2004',
      templateData: template,
      quality: 80,
    };

    await controller.enroll(dto);
    await assert.rejects(
      controller.enroll(dto),
      /autorizacion biometrica vigente/i,
    );
    await prisma.fingerprint.deleteMany({
      where: { employeeId: TEST_EMPLOYEE },
    });
  });

  test('rechaza una autorización expirada almacenada en SQL Server', async () => {
    const authorization = await authorizeEnrollment();
    const tokenHash = createHash('sha256')
      .update(authorization.authorizationToken, 'utf8')
      .digest('hex');
    await prisma.enrollmentAuthorization.update({
      where: { tokenHash },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    await assert.rejects(
      controller.enroll({
        authorizationToken: authorization.authorizationToken,
        employeeCode: TEST_EMPLOYEE,
        fingerPosition: 'RIGHT_INDEX',
        templateFormat: 'ANSI_378_2004',
        templateData: randomBytes(512).toString('base64'),
        quality: 80,
      }),
      /autorizacion biometrica vigente/i,
    );
  });

  test('dos réplicas concurrentes solo pueden consumir una autorización', async () => {
    const secondReplica = new BiometricsService(prisma, encryption);
    const secondController = new BiometricsController(secondReplica);
    const authorization = await authorizeEnrollment();
    const dto = {
      authorizationToken: authorization.authorizationToken,
      employeeCode: TEST_EMPLOYEE,
      fingerPosition: 'RIGHT_INDEX',
      templateFormat: 'ANSI_378_2004',
      templateData: randomBytes(512).toString('base64'),
      quality: 80,
    };

    const results = await Promise.allSettled([
      controller.enroll(dto),
      secondController.enroll(dto),
    ]);
    assert.equal(results.filter((item) => item.status === 'fulfilled').length, 1);
    assert.equal(results.filter((item) => item.status === 'rejected').length, 1);
    await prisma.fingerprint.deleteMany({
      where: { employeeId: TEST_EMPLOYEE },
    });
  });

  test('rechaza guardar sin autorizacion biometrica previa', async () => {
    const template = randomBytes(512);
    await assert.rejects(
      controller.enroll({
        authorizationToken: 'sin-autorizacion-valida',
        employeeCode: TEST_EMPLOYEE,
        fingerPosition: 'RIGHT_INDEX',
        templateFormat: 'ANSI_378_2004',
        templateData: template.toString('base64'),
        quality: 80,
      }),
      /autorizacion biometrica vigente/i,
    );
    template.fill(0);
  });

  test('valida empleado, guarda cifrado y nunca responde la plantilla', async () => {
    const candidatesBeforeEnrollment =
      await controller.findEnrollmentCandidates();
    assert.equal(
      candidatesBeforeEnrollment.some(
        (employee) => employee.employeeCode === TEST_EMPLOYEE,
      ),
      true,
    );

    const template = randomBytes(512);
    const authorization = await authorizeEnrollment();
    const dto = {
      authorizationToken: authorization.authorizationToken,
      employeeCode: TEST_EMPLOYEE,
      fingerPosition: 'RIGHT_INDEX',
      templateFormat: 'ANSI_378_2004',
      templateData: template.toString('base64'),
      quality: 82,
    };

    const response = await controller.enroll(dto);
    const stored = await prisma.fingerprint.findUniqueOrThrow({
      where: { id: response.enrollment.id },
    });
    const decrypted = encryption.decrypt(stored.templateData, context(stored.id));

    assert.equal(response.employee.employeeCode, TEST_EMPLOYEE);
    assert.equal(response.enrollment.active, true);
    assert.equal('templateData' in response.enrollment, false);
    assert.notDeepEqual(Buffer.from(stored.templateData), template);
    assert.deepEqual(decrypted, template);

    const candidatesAfterEnrollment =
      await controller.findEnrollmentCandidates();
    assert.equal(
      candidatesAfterEnrollment.some(
        (employee) => employee.employeeCode === TEST_EMPLOYEE,
      ),
      false,
    );

    template.fill(0);
    decrypted.fill(0);
  });

  test('reemplaza el mismo dedo desactivando el registro anterior', async () => {
    const firstActive = await prisma.fingerprint.findFirstOrThrow({
      where: {
        employeeId: TEST_EMPLOYEE,
        fingerPosition: 'RIGHT_INDEX',
        active: true,
      },
    });
    const replacement = randomBytes(512);
    const authorization = await authorizeEnrollment();

    const response = await controller.enroll({
      authorizationToken: authorization.authorizationToken,
      employeeCode: TEST_EMPLOYEE,
      fingerPosition: 'RIGHT_INDEX',
      templateFormat: 'ANSI_378_2004',
      templateData: replacement.toString('base64'),
      quality: 90,
    });
    const previous = await prisma.fingerprint.findUniqueOrThrow({
      where: { id: firstActive.id },
    });

    assert.equal(previous.active, false);
    assert.equal(response.enrollment.active, true);
    replacement.fill(0);
  });

  test('consulta solo metadatos y permite desactivar sin eliminar', async () => {
    const metadata = await controller.findByEmployee(TEST_EMPLOYEE);
    const active = metadata.enrollments.find((item) => item.active);

    assert.ok(active);
    assert.equal('templateData' in active, false);

    const deactivated = await controller.deactivate(active.id);
    const stored = await prisma.fingerprint.findUniqueOrThrow({
      where: { id: active.id },
    });

    assert.equal(deactivated.active, false);
    assert.equal(stored.active, false);
    assert.ok(stored.templateData.length > 0);

    const candidates = await controller.findEnrollmentCandidates();
    assert.equal(
      candidates.some(
        (employee) => employee.employeeCode === TEST_EMPLOYEE,
      ),
      false,
      'Un empleado con huellas historicas inactivas no debe aparecer como no enrolado',
    );
  });

  test('rechaza un empleado inexistente antes de guardar', async () => {
    await assert.rejects(
      authorizeEnrollment('NO-EXISTE-BIOMETRIA'),
      /Empleado objetivo no encontrado/,
    );
  });
});

describe('GET /api/biometrics/gallery', () => {
  test('versiona la galeria, excluye registros inactivos y no expone secretos', async () => {
    await prisma.employee.create({
      data: {
        employeeCode: TEST_GALLERY_EMPLOYEE,
        name: 'Empleado de galeria automatica',
        email: 'galeria@pruebas.local',
        department: 'Pruebas',
        active: true,
      },
    });
    const enrollmentId = await createStoredFingerprint(TEST_GALLERY_EMPLOYEE);

    const first = await service.prepareGallery(undefined, TEST_GALLERY_DEVICE);
    assert.equal(first.notModified, false);
    assert.ok(first.payload);
    assert.match(first.etag, /^"gallery-[A-Za-z0-9_-]{43}"$/);
    assert.ok(first.expiresAt.getTime() > Date.now());
    const payloadText = first.payload.toString('utf8');
    const payload = JSON.parse(payloadText);
    const item = payload.enrollments.find(
      (candidate) => candidate.enrollmentId === enrollmentId,
    );
    assert.ok(item);
    assert.equal(item.employeeCode, TEST_GALLERY_EMPLOYEE);
    assert.equal(item.employeeName, 'Empleado de galeria automatica');
    assert.equal(item.templateFormat, 'ANSI_378_2004');
    assert.ok(item.templateData);
    assert.equal(
      payloadText.includes(process.env.BIOMETRIC_ENCRYPTION_KEY),
      false,
    );
    first.payload.fill(0);

    const unchanged = await service.prepareGallery(
      first.etag,
      TEST_GALLERY_DEVICE,
    );
    assert.equal(unchanged.notModified, true);
    assert.equal(unchanged.payload, undefined);

    await prisma.fingerprint.update({
      where: { id: enrollmentId },
      data: { active: false },
    });
    const inactiveEnrollment = await service.prepareGallery(
      undefined,
      TEST_GALLERY_DEVICE,
    );
    const inactiveEnrollmentPayload = JSON.parse(
      inactiveEnrollment.payload.toString('utf8'),
    );
    assert.equal(
      inactiveEnrollmentPayload.enrollments.some(
        (candidate) => candidate.enrollmentId === enrollmentId,
      ),
      false,
    );
    inactiveEnrollment.payload.fill(0);

    await prisma.fingerprint.update({
      where: { id: enrollmentId },
      data: { active: true },
    });
    await prisma.employee.update({
      where: { employeeCode: TEST_GALLERY_EMPLOYEE },
      data: { active: false },
    });
    const inactiveEmployee = await service.prepareGallery(
      undefined,
      TEST_GALLERY_DEVICE,
    );
    const inactiveEmployeePayload = JSON.parse(
      inactiveEmployee.payload.toString('utf8'),
    );
    assert.equal(
      inactiveEmployeePayload.enrollments.some(
        (candidate) => candidate.enrollmentId === enrollmentId,
      ),
      false,
    );
    inactiveEmployee.payload.fill(0);

    const audits = await prisma.auditLog.findMany({
      where: { entityName: 'kiosk_devices', entityId: TEST_GALLERY_DEVICE },
    });
    assert.equal(audits.length, 4);
    assert.ok(
      audits.every(
        (audit) =>
          !audit.newValues?.includes('templateData') &&
          !audit.newValues?.includes(process.env.BIOMETRIC_ENCRYPTION_KEY),
      ),
    );
  });
});
