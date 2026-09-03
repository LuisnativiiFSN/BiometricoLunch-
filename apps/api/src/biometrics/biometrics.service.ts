import {
  BadRequestException,
  ForbiddenException,
  InternalServerErrorException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  MAX_TEMPLATE_BYTES,
  MIN_TEMPLATE_BYTES,
} from './biometric.constants.js';
import { BiometricEncryptionService } from './biometric-encryption.service.js';
import type { AuthorizeEnrollmentDto } from './dto/authorize-enrollment.dto.js';
import type { CreateEnrollmentDto } from './dto/create-enrollment.dto.js';

const ENROLLMENT_AUTHORIZED_DEPARTMENT = 'GESTION HUMANA-FSN';
const ENROLLMENT_AUTHORIZATION_TTL_MS = 2 * 60 * 1000;
const DEFAULT_GALLERY_TTL_SECONDS = 15 * 60;
const MIN_GALLERY_TTL_SECONDS = 5 * 60;
const MAX_GALLERY_TTL_SECONDS = 24 * 60 * 60;

type GalleryEnrollment = {
  id: string;
  employeeId: string;
  fingerPosition: string;
  templateFormat: string;
  templateData: Uint8Array;
  updatedAt: Date;
  employee: {
    name: string;
    updatedAt: Date;
  };
};

export type BiometricGalleryPreparation = {
  etag: string;
  version: string;
  expiresAt: Date;
  enrollmentCount: number;
  notModified: boolean;
  payload?: Buffer;
};

@Injectable()
export class BiometricsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: BiometricEncryptionService,
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
    const operatorEnrollment = await this.prisma.fingerprint.findUnique({
      where: { id: dto.operatorEnrollmentId },
      select: {
        active: true,
        employeeId: true,
        employee: {
          select: {
            employeeCode: true,
            name: true,
            department: true,
            active: true,
          },
        },
      },
    });
    const operator = operatorEnrollment?.employee;
    if (
      !operatorEnrollment?.active ||
      operatorEnrollment.employeeId !== dto.operatorEmployeeCode ||
      operator?.employeeCode !== dto.operatorEmployeeCode ||
      !operator?.active ||
      this.normalizeDepartment(operator.department) !==
        ENROLLMENT_AUTHORIZED_DEPARTMENT
    ) {
      return { status: 'NOT_AUTHORIZED' as const };
    }

    const target = await this.prisma.employee.findUnique({
      where: { employeeCode: dto.targetEmployeeCode },
      select: { active: true },
    });
    if (!target) {
      throw new NotFoundException('Empleado objetivo no encontrado');
    }
    if (!target.active) {
      throw new BadRequestException('El empleado objetivo está inactivo');
    }

    const authorizationToken = randomBytes(32).toString('base64url');
    const tokenHash = this.hashAuthorizationToken(authorizationToken);
    const expiresAt = new Date(Date.now() + ENROLLMENT_AUTHORIZATION_TTL_MS);
    await this.prisma.$transaction(async (transaction) => {
      const authorization = await transaction.enrollmentAuthorization.create({
        data: {
          tokenHash,
          operatorEmployeeCode: operator.employeeCode,
          operatorEnrollmentId: dto.operatorEnrollmentId,
          targetEmployeeCode: dto.targetEmployeeCode,
          fingerPosition: dto.fingerPosition,
          expiresAt,
        },
        select: { id: true },
      });
      await transaction.auditLog.create({
        data: {
          entityName: 'enrollment_authorizations',
          entityId: authorization.id,
          action: 'CREATE',
          actorEmployeeId: operator.employeeCode,
          newValues: JSON.stringify({
            targetEmployeeCode: dto.targetEmployeeCode,
            fingerPosition: dto.fingerPosition,
            expiresAt: expiresAt.toISOString(),
          }),
        },
      });
    });

    return {
      status: 'AUTHORIZED' as const,
      authorizationToken,
      expiresAt: expiresAt.toISOString(),
      operator: {
        employeeCode: operator.employeeCode,
        name: operator.name,
      },
    };
  }

  async prepareGallery(
    ifNoneMatch: string | undefined,
    kioskDeviceId: string,
  ): Promise<BiometricGalleryPreparation> {
    const enrollments = await this.prisma.fingerprint.findMany({
      where: {
        active: true,
        employee: { active: true },
      },
      orderBy: { id: 'asc' },
      select: {
        id: true,
        employeeId: true,
        fingerPosition: true,
        templateFormat: true,
        templateData: true,
        updatedAt: true,
        employee: {
          select: { name: true, updatedAt: true },
        },
      },
    });
    const version = this.createGalleryVersion(enrollments);
    const etag = `"gallery-${version}"`;
    const expiresAt = new Date(Date.now() + this.getGalleryTtlMilliseconds());

    if (this.etagMatches(ifNoneMatch, etag)) {
      await this.auditGallerySynchronization(
        kioskDeviceId,
        version,
        enrollments.length,
        'NOT_MODIFIED',
        expiresAt,
      );
      return {
        etag,
        version,
        expiresAt,
        enrollmentCount: enrollments.length,
        notModified: true,
      };
    }

    const plaintextTemplates: Buffer[] = [];
    try {
      const items = enrollments.map((enrollment) => {
        const context = BiometricEncryptionService.createContext(
          enrollment.id,
          enrollment.fingerPosition,
          enrollment.templateFormat,
        );
        let plaintext: Buffer;
        try {
          plaintext = this.encryption.decrypt(enrollment.templateData, context);
        } catch {
          throw new InternalServerErrorException(
            'No fue posible construir la galeria biometrica activa',
          );
        }
        plaintextTemplates.push(plaintext);
        return {
          enrollmentId: enrollment.id,
          employeeCode: enrollment.employeeId,
          employeeName: enrollment.employee.name,
          templateFormat: enrollment.templateFormat,
          templateData: plaintext.toString('base64'),
        };
      });
      const payload = Buffer.from(
        JSON.stringify({
          version,
          generatedAt: new Date().toISOString(),
          expiresAt: expiresAt.toISOString(),
          enrollments: items,
        }),
        'utf8',
      );

      await this.auditGallerySynchronization(
        kioskDeviceId,
        version,
        enrollments.length,
        'DOWNLOADED',
        expiresAt,
      );
      return {
        etag,
        version,
        expiresAt,
        enrollmentCount: enrollments.length,
        notModified: false,
        payload,
      };
    } catch (error) {
      await this.auditGallerySynchronization(
        kioskDeviceId,
        version,
        enrollments.length,
        'FAILED',
        expiresAt,
      );
      throw error;
    } finally {
      for (const plaintext of plaintextTemplates) plaintext.fill(0);
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
    const tokenHash = this.hashAuthorizationToken(token);
    const now = new Date();
    await this.prisma.$transaction(async (transaction) => {
      const authorization = await transaction.enrollmentAuthorization.findUnique({
        where: { tokenHash },
        select: {
          id: true,
          operatorEmployeeCode: true,
          operatorEnrollmentId: true,
          targetEmployeeCode: true,
          fingerPosition: true,
          expiresAt: true,
          consumedAt: true,
        },
      });
      if (
        !authorization ||
        authorization.consumedAt ||
        authorization.expiresAt <= now ||
        authorization.targetEmployeeCode !== targetEmployeeCode ||
        authorization.fingerPosition !== fingerPosition
      ) {
        throw new ForbiddenException(
          'Se requiere una autorizacion biometrica vigente de Gestion Humana',
        );
      }

      const operatorEnrollment = await transaction.fingerprint.findUnique({
        where: { id: authorization.operatorEnrollmentId },
        select: {
          active: true,
          employeeId: true,
          employee: { select: { active: true, department: true } },
        },
      });
      if (
        !operatorEnrollment?.active ||
        operatorEnrollment.employeeId !== authorization.operatorEmployeeCode ||
        !operatorEnrollment.employee.active ||
        this.normalizeDepartment(operatorEnrollment.employee.department) !==
          ENROLLMENT_AUTHORIZED_DEPARTMENT
      ) {
        throw new ForbiddenException(
          'La persona que autorizo ya no pertenece a Gestion Humana',
        );
      }

      const consumed = await transaction.enrollmentAuthorization.updateMany({
        where: {
          id: authorization.id,
          consumedAt: null,
          expiresAt: { gt: now },
        },
        data: { consumedAt: now },
      });
      if (consumed.count !== 1) {
        throw new ForbiddenException(
          'La autorizacion biometrica ya fue utilizada',
        );
      }
    });
  }

  private hashAuthorizationToken(token: string) {
    return createHash('sha256').update(token, 'utf8').digest('hex');
  }

  private normalizeDepartment(value: string | null) {
    return value?.trim().toUpperCase() ?? '';
  }

  private createGalleryVersion(enrollments: GalleryEnrollment[]) {
    const hash = createHash('sha256');
    hash.update('MCG1\n', 'utf8');
    for (const enrollment of enrollments) {
      hash.update(enrollment.id, 'utf8');
      hash.update('\0', 'utf8');
      hash.update(enrollment.employeeId, 'utf8');
      hash.update('\0', 'utf8');
      hash.update(enrollment.employee.name, 'utf8');
      hash.update('\0', 'utf8');
      hash.update(enrollment.fingerPosition, 'utf8');
      hash.update('\0', 'utf8');
      hash.update(enrollment.templateFormat, 'utf8');
      hash.update('\0', 'utf8');
      hash.update(enrollment.updatedAt.toISOString(), 'utf8');
      hash.update('\0', 'utf8');
      hash.update(enrollment.employee.updatedAt.toISOString(), 'utf8');
      hash.update('\n', 'utf8');
    }
    return hash.digest('base64url');
  }

  private etagMatches(ifNoneMatch: string | undefined, etag: string) {
    if (!ifNoneMatch) return false;
    return ifNoneMatch
      .split(',')
      .map((value) => value.trim())
      .some((value) => value === '*' || value === etag || value === `W/${etag}`);
  }

  private getGalleryTtlMilliseconds() {
    const configured = Number(
      process.env.BIOMETRIC_GALLERY_TTL_SECONDS ?? DEFAULT_GALLERY_TTL_SECONDS,
    );
    const seconds = Number.isSafeInteger(configured)
      ? Math.min(
          MAX_GALLERY_TTL_SECONDS,
          Math.max(MIN_GALLERY_TTL_SECONDS, configured),
        )
      : DEFAULT_GALLERY_TTL_SECONDS;
    return seconds * 1000;
  }

  private async auditGallerySynchronization(
    kioskDeviceId: string,
    version: string,
    enrollmentCount: number,
    result: 'DOWNLOADED' | 'NOT_MODIFIED' | 'FAILED',
    expiresAt: Date,
  ) {
    await this.prisma.auditLog.create({
      data: {
        entityName: 'kiosk_devices',
        entityId: kioskDeviceId,
        // UPDATE pertenece al contrato histórico de auditoría. El detalle
        // identifica que se trata de una sincronización de galería.
        action: 'UPDATE',
        newValues: JSON.stringify({
          operation: 'BIOMETRIC_GALLERY_SYNC',
          version,
          enrollmentCount,
          result,
          expiresAt: expiresAt.toISOString(),
        }),
      },
    });
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
