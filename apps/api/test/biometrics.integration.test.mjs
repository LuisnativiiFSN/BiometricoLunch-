import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
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
const prisma = new PrismaService();
const encryption = new BiometricEncryptionService();
const matcher = {
  calls: [],
  result: { status: 'NOT_IDENTIFIED', thresholdScore: 21474 },
  async match(candidate, candidates) {
    this.calls.push({ candidateLength: candidate.length, candidates });
    return this.result;
  },
};
const service = new BiometricsService(prisma, encryption, matcher);
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
  ];
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
  const candidate = randomBytes(480);
  const isHr = operator === 'hr';
  matcher.result = {
    status: 'IDENTIFIED',
    enrollmentId: isHr ? hrEnrollmentId : nonHrEnrollmentId,
    employeeCode: isHr ? TEST_HR_EMPLOYEE : TEST_NON_HR_EMPLOYEE,
    score: 100,
    thresholdScore: 21474,
  };
  try {
    return await controller.authorizeEnrollment({
      targetEmployeeCode,
      fingerPosition,
      templateFormat: 'ANSI_378_2004',
      templateData: candidate.toString('base64'),
    });
  } finally {
    candidate.fill(0);
  }
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
    const fakeTemplate = randomBytes(512);
    const authorization = await authorizeEnrollment('NO-EXISTE-BIOMETRIA');
    await assert.rejects(
      controller.enroll({
        authorizationToken: authorization.authorizationToken,
        employeeCode: 'NO-EXISTE-BIOMETRIA',
        fingerPosition: 'RIGHT_INDEX',
        templateFormat: 'ANSI_378_2004',
        templateData: fakeTemplate.toString('base64'),
        quality: 80,
      }),
      /Empleado no encontrado/,
    );
    fakeTemplate.fill(0);
  });
});

describe('POST /api/biometrics/identify', () => {
  test('identifica mediante matcher interno y responde solo metadatos', async () => {
    const enrolledTemplate = randomBytes(512);
    const authorization = await authorizeEnrollment();
    const enrollment = await controller.enroll({
      authorizationToken: authorization.authorizationToken,
      employeeCode: TEST_EMPLOYEE,
      fingerPosition: 'RIGHT_INDEX',
      templateFormat: 'ANSI_378_2004',
      templateData: enrolledTemplate.toString('base64'),
      quality: 88,
    });
    const candidate = randomBytes(480);
    matcher.calls.length = 0;
    matcher.result = {
      status: 'IDENTIFIED',
      enrollmentId: enrollment.enrollment.id,
      employeeCode: TEST_EMPLOYEE,
      score: 100,
      thresholdScore: 21474,
    };

    const response = await controller.identify({
      templateFormat: 'ANSI_378_2004',
      templateData: candidate.toString('base64'),
    });

    assert.equal(response.status, 'IDENTIFIED');
    assert.equal(response.employee.employeeCode, TEST_EMPLOYEE);
    assert.equal('templateData' in response, false);
    assert.equal(matcher.calls.length, 1);
    assert.equal(matcher.calls[0].candidateLength, candidate.length);
    const testCandidate = matcher.calls[0].candidates.find(
      (item) => item.employeeCode === TEST_EMPLOYEE,
    );
    assert.ok(testCandidate);

    enrolledTemplate.fill(0);
    candidate.fill(0);
  });

  test('sin coincidencia no devuelve empleado', async () => {
    const candidate = randomBytes(480);
    matcher.result = { status: 'NOT_IDENTIFIED', thresholdScore: 21474 };

    const response = await controller.identify({
      templateFormat: 'ANSI_378_2004',
      templateData: candidate.toString('base64'),
    });

    assert.deepEqual(response, { status: 'NOT_IDENTIFIED' });
    candidate.fill(0);
  });

  test('excluye enrolamientos inactivos de la galeria', async () => {
    await prisma.fingerprint.updateMany({
      where: { employeeId: TEST_EMPLOYEE },
      data: { active: false },
    });
    const candidate = randomBytes(480);

    const response = await controller.identify({
      templateFormat: 'ANSI_378_2004',
      templateData: candidate.toString('base64'),
    });

    assert.deepEqual(response, { status: 'NOT_IDENTIFIED' });
    const latestCall = matcher.calls.at(-1);
    assert.ok(latestCall);
    assert.equal(
      latestCall.candidates.some(
        (item) => item.employeeCode === TEST_EMPLOYEE,
      ),
      false,
    );
    candidate.fill(0);
  });

  test('controla un sobre cifrado corrupto sin enviarlo al matcher', async () => {
    await prisma.fingerprint.create({
      data: {
        employeeId: TEST_EMPLOYEE,
        fingerPosition: 'RIGHT_INDEX',
        templateFormat: 'ANSI_378_2004',
        templateData: randomBytes(128),
        quality: 50,
        active: true,
      },
    });
    const candidate = randomBytes(480);

    await assert.rejects(
      controller.identify({
        templateFormat: 'ANSI_378_2004',
        templateData: candidate.toString('base64'),
      }),
      /galeria biometrica activa/,
    );
    candidate.fill(0);
  });
});
