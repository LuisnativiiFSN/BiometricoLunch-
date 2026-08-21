import 'dotenv/config';
import assert from 'node:assert/strict';

const { BiometricEncryptionService } = await import(
  '../dist/biometrics/biometric-encryption.service.js'
);
const { BiometricMatcherService } = await import(
  '../dist/biometrics/biometric-matcher.service.js'
);
const { PrismaService } = await import('../dist/prisma/prisma.service.js');

const EXPECTED_EMPLOYEES = ['1', '2'];
const prisma = new PrismaService();
const encryption = new BiometricEncryptionService();
const matcher = new BiometricMatcherService();
const gallery = [];

try {
  await prisma.onModuleInit();
  const enrollments = await prisma.fingerprint.findMany({
    where: {
      active: true,
      employeeId: { in: EXPECTED_EMPLOYEES },
      templateFormat: 'ANSI_378_2004',
    },
    select: {
      id: true,
      employeeId: true,
      fingerPosition: true,
      templateFormat: true,
      templateData: true,
    },
  });

  for (const enrollment of enrollments) {
    const context = BiometricEncryptionService.createContext(
      enrollment.id,
      enrollment.fingerPosition,
      enrollment.templateFormat,
    );
    gallery.push({
      enrollmentId: enrollment.id,
      employeeCode: enrollment.employeeId,
      templateData: encryption.decrypt(enrollment.templateData, context),
    });
  }

  for (const employeeCode of EXPECTED_EMPLOYEES) {
    const enrolled = gallery.find((item) => item.employeeCode === employeeCode);
    assert.ok(enrolled, `No existe enrolamiento activo para ${employeeCode}`);
    const result = await matcher.match(enrolled.templateData, gallery);
    assert.equal(result.status, 'IDENTIFIED');
    assert.equal(result.employeeCode, employeeCode);
    console.log(
      `Empleado ${employeeCode}: IDENTIFIED (score ${result.score}, umbral ${result.thresholdScore})`,
    );

    const response = await fetch(
      `http://localhost:${process.env.PORT ?? 3000}/api/biometrics/identify`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          templateFormat: 'ANSI_378_2004',
          templateData: enrolled.templateData.toString('base64'),
        }),
      },
    );
    assert.equal(response.ok, true, `La API respondió HTTP ${response.status}`);
    const apiResult = await response.json();
    assert.equal(apiResult.status, 'IDENTIFIED');
    assert.equal(apiResult.employee.employeeCode, employeeCode);
    assert.equal('templateData' in apiResult, false);
    console.log(`Empleado ${employeeCode}: endpoint /identify correcto`);
  }
} finally {
  for (const item of gallery) item.templateData.fill(0);
  await prisma.onModuleDestroy();
}
