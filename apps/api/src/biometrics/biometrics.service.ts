import {
  BadRequestException,
  ForbiddenException,
  InternalServerErrorException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes, randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  MAX_TEMPLATE_BYTES,
  MIN_TEMPLATE_BYTES,
} from './biometric.constants.js';
import { BiometricEncryptionService } from './biometric-encryption.service.js';
import { BiometricMatcherService } from './biometric-matcher.service.js';
import type { AuthorizeEnrollmentDto } from './dto/authorize-enrollment.dto.js';
import type { CreateEnrollmentDto } from './dto/create-enrollment.dto.js';
import type { IdentifyFingerprintDto } from './dto/identify-fingerprint.dto.js';

const ENROLLMENT_AUTHORIZED_DEPARTMENT = 'GESTION HUMANA-FSN';
const ENROLLMENT_AUTHORIZATION_TTL_MS = 2 * 60 * 1000;

type EnrollmentAuthorization = {
  operatorEmployeeCode: string;
  targetEmployeeCode: string;
  fingerPosition: string;
  expiresAt: number;
};

@Injectable()
export class BiometricsService {
  private readonly enrollmentAuthorizations = new Map<
    string,
    EnrollmentAuthorization
  >();

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: BiometricEncryptionService,
    private readonly matcher: BiometricMatcherService,
  ) {}

  async enroll(dto: CreateEnrollmentDto) {
    await this.consumeEnrollmentAuthorization(
      dto.authorizationToken,
      dto.employeeCode,
      dto.fingerPosition,
    );

    const employee = await this.prisma.employee.findUnique({
      where: { employeeCode: dto.employeeCode },
      select: { employeeCode: true, name: true, active: true },
    });

    if (!employee) {
      throw new NotFoundException('Empleado no encontrado');
    }
    if (!employee.active) {
      throw new BadRequestException('El empleado esta inactivo');
    }

    const plaintext = this.decodeTemplate(dto.templateData);
    const enrollmentId = randomUUID();
    const context = BiometricEncryptionService.createContext(
      enrollmentId,
      dto.fingerPosition,
      dto.templateFormat,
    );
    const encrypted = this.encryption.encrypt(plaintext, context);

    try {
      const enrollment = await this.prisma.$transaction(async (transaction) => {
        await transaction.fingerprint.updateMany({
          where: {
            employeeId: dto.employeeCode,
            fingerPosition: dto.fingerPosition,
            active: true,
          },
          data: { active: false },
        });

        return transaction.fingerprint.create({
          data: {
            id: enrollmentId,
            employeeId: dto.employeeCode,
            fingerPosition: dto.fingerPosition,
            templateData: Uint8Array.from(encrypted),
            templateFormat: dto.templateFormat,
            quality: dto.quality,
          },
          select: this.metadataSelection,
        });
      });

      return { enrollment, employee };
    } finally {
      plaintext.fill(0);
      encrypted.fill(0);
    }
  }

  async findByEmployee(employeeCode: string) {
    const employee = await this.prisma.employee.findUnique({
      where: { employeeCode },
      select: { employeeCode: true, name: true, active: true },
    });
    if (!employee) {
      throw new NotFoundException('Empleado no encontrado');
    }

    const enrollments = await this.prisma.fingerprint.findMany({
      where: { employeeId: employeeCode },
      orderBy: [{ active: 'desc' }, { createdAt: 'desc' }],
      select: this.metadataSelection,
    });

    return { employee, enrollments };
  }

  findEnrollmentCandidates() {
    return this.prisma.employee.findMany({
      where: {
        active: true,
        fingerprints: {
          none: {},
        },
      },
      orderBy: { name: 'asc' },
      select: {
        employeeCode: true,
        name: true,
        email: true,
        department: true,
        active: true,
      },
    });
  }

  async authorizeEnrollment(dto: AuthorizeEnrollmentDto) {
    const identification = await this.identify(dto);
    if (identification.status === 'NOT_IDENTIFIED') {
      return { status: 'NOT_IDENTIFIED' as const };
    }
    if (identification.status === 'AMBIGUOUS') {
      return { status: 'AMBIGUOUS' as const };
    }

    const operator = await this.prisma.employee.findUnique({
      where: { employeeCode: identification.employee.employeeCode },
      select: {
        employeeCode: true,
        name: true,
        department: true,
        active: true,
      },
    });
    if (
      !operator?.active ||
      this.normalizeDepartment(operator.department) !==
        ENROLLMENT_AUTHORIZED_DEPARTMENT
    ) {
      return { status: 'NOT_AUTHORIZED' as const };
    }

    this.removeExpiredAuthorizations();
    const authorizationToken = randomBytes(32).toString('base64url');
    const expiresAt = Date.now() + ENROLLMENT_AUTHORIZATION_TTL_MS;
    this.enrollmentAuthorizations.set(authorizationToken, {
      operatorEmployeeCode: operator.employeeCode,
      targetEmployeeCode: dto.targetEmployeeCode,
      fingerPosition: dto.fingerPosition,
      expiresAt,
    });

    return {
      status: 'AUTHORIZED' as const,
      authorizationToken,
      expiresAt: new Date(expiresAt).toISOString(),
      operator: {
        employeeCode: operator.employeeCode,
        name: operator.name,
      },
    };
  }

  async identify(dto: IdentifyFingerprintDto) {
    const candidate = this.decodeTemplate(dto.templateData);
    const decryptedGallery: Array<{
      enrollmentId: string;
      employeeCode: string;
      employeeName: string;
      templateData: Buffer;
    }> = [];

    try {
      const enrollments = await this.prisma.fingerprint.findMany({
        where: { active: true },
        select: {
          id: true,
          employeeId: true,
          fingerPosition: true,
          templateFormat: true,
          templateData: true,
          employee: { select: { name: true } },
        },
      });

      for (const enrollment of enrollments) {
        if (enrollment.templateFormat !== dto.templateFormat) continue;
        const context = BiometricEncryptionService.createContext(
          enrollment.id,
          enrollment.fingerPosition,
          enrollment.templateFormat,
        );
        try {
          decryptedGallery.push({
            enrollmentId: enrollment.id,
            employeeCode: enrollment.employeeId,
            employeeName: enrollment.employee.name,
            templateData: this.encryption.decrypt(
              enrollment.templateData,
              context,
            ),
          });
        } catch {
          throw new InternalServerErrorException(
            'No fue posible leer la galeria biometrica activa',
          );
        }
      }

      if (decryptedGallery.length === 0) {
        return { status: 'NOT_IDENTIFIED' as const };
      }

      const result = await this.matcher.match(candidate, decryptedGallery);
      if (result.status === 'NOT_IDENTIFIED') {
        return { status: 'NOT_IDENTIFIED' as const };
      }
      if (result.status === 'AMBIGUOUS') {
        return { status: 'AMBIGUOUS' as const };
      }
      if (
        result.status !== 'IDENTIFIED' ||
        !result.enrollmentId ||
        !result.employeeCode
      ) {
        throw new InternalServerErrorException(
          'El componente biometrico devolvio un resultado invalido',
        );
      }

      const matched = decryptedGallery.find(
        (item) =>
          item.enrollmentId === result.enrollmentId &&
          item.employeeCode === result.employeeCode,
      );
      if (!matched) {
        throw new InternalServerErrorException(
          'El resultado biometrico no pertenece a la galeria activa',
        );
      }

      return {
        status: 'IDENTIFIED' as const,
        employee: {
          employeeCode: matched.employeeCode,
          name: matched.employeeName,
        },
      };
    } finally {
      candidate.fill(0);
      for (const item of decryptedGallery) item.templateData.fill(0);
    }
  }

  async deactivate(id: string) {
    const enrollment = await this.prisma.fingerprint.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!enrollment) {
      throw new NotFoundException('Enrolamiento no encontrado');
    }

    return this.prisma.fingerprint.update({
      where: { id },
      data: { active: false },
      select: this.metadataSelection,
    });
  }

  private decodeTemplate(value: string): Buffer {
    const decoded = Buffer.from(value, 'base64');
    const normalizedInput = value.replace(/=+$/, '');
    const normalizedDecoded = decoded.toString('base64').replace(/=+$/, '');
    if (normalizedInput !== normalizedDecoded) {
      decoded.fill(0);
      throw new BadRequestException('La plantilla no contiene Base64 valido');
    }
    if (
      decoded.length < MIN_TEMPLATE_BYTES ||
      decoded.length > MAX_TEMPLATE_BYTES
    ) {
      decoded.fill(0);
      throw new BadRequestException('El tamano de la plantilla no es valido');
    }

    return decoded;
  }

  private async consumeEnrollmentAuthorization(
    token: string,
    targetEmployeeCode: string,
    fingerPosition: string,
  ) {
    this.removeExpiredAuthorizations();
    const authorization = this.enrollmentAuthorizations.get(token);
    this.enrollmentAuthorizations.delete(token);
    if (
      !authorization ||
      authorization.expiresAt <= Date.now() ||
      authorization.targetEmployeeCode !== targetEmployeeCode ||
      authorization.fingerPosition !== fingerPosition
    ) {
      throw new ForbiddenException(
        'Se requiere una autorizacion biometrica vigente de Gestion Humana',
      );
    }

    const operator = await this.prisma.employee.findUnique({
      where: { employeeCode: authorization.operatorEmployeeCode },
      select: { active: true, department: true },
    });
    if (
      !operator?.active ||
      this.normalizeDepartment(operator.department) !==
        ENROLLMENT_AUTHORIZED_DEPARTMENT
    ) {
      throw new ForbiddenException(
        'La persona que autorizo ya no pertenece a Gestion Humana',
      );
    }
  }

  private removeExpiredAuthorizations() {
    const now = Date.now();
    for (const [token, authorization] of this.enrollmentAuthorizations) {
      if (authorization.expiresAt <= now) {
        this.enrollmentAuthorizations.delete(token);
      }
    }
  }

  private normalizeDepartment(value: string | null) {
    return value?.trim().toUpperCase() ?? '';
  }

  private readonly metadataSelection = {
    id: true,
    employeeId: true,
    fingerPosition: true,
    templateFormat: true,
    quality: true,
    active: true,
    createdAt: true,
    updatedAt: true,
  } as const;
}
