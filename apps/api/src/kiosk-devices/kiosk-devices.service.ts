import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateKioskDeviceDto } from './dto/create-kiosk-device.dto.js';
import { KIOSK_DEVICE_TOKEN_PREFIX } from './kiosk-device.constants.js';

const safeKioskDeviceSelect = {
  id: true,
  name: true,
  active: true,
  createdAt: true,
  rotatedAt: true,
  lastAccessedAt: true,
} satisfies Prisma.KioskDeviceSelect;

@Injectable()
export class KioskDevicesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.kioskDevice.findMany({
      select: safeKioskDeviceSelect,
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
    });
  }

  async create(dto: CreateKioskDeviceDto, actorUserId: string) {
    const name = dto.name.trim();
    const token = this.generateToken();
    const tokenHash = this.hashToken(token);

    try {
      const device = await this.prisma.$transaction(async (transaction) => {
        const created = await transaction.kioskDevice.create({
          data: { name, tokenHash },
          select: safeKioskDeviceSelect,
        });

        await transaction.auditLog.create({
          data: {
            entityName: 'kiosk_devices',
            entityId: created.id,
            action: 'CREATE',
            actorUserId,
            newValues: JSON.stringify({ name: created.name, active: true }),
          },
        });

        return created;
      });

      return { ...device, token };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('No fue posible generar un token único');
      }
      throw error;
    }
  }

  async rotate(id: string, actorUserId: string) {
    const current = await this.findActiveDevice(id);
    const token = this.generateToken();
    const tokenHash = this.hashToken(token);
    const rotatedAt = new Date();

    const device = await this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.kioskDevice.update({
        where: { id },
        data: { tokenHash, rotatedAt },
        select: safeKioskDeviceSelect,
      });

      await transaction.auditLog.create({
        data: {
          entityName: 'kiosk_devices',
          entityId: id,
          action: 'UPDATE',
          actorUserId,
          previousValues: JSON.stringify({ rotatedAt: current.rotatedAt }),
          newValues: JSON.stringify({ rotatedAt }),
        },
      });

      return updated;
    });

    return { ...device, token };
  }

  async revoke(id: string, actorUserId: string) {
    const current = await this.findDevice(id);

    if (!current.active) {
      return this.prisma.kioskDevice.findUniqueOrThrow({
        where: { id },
        select: safeKioskDeviceSelect,
      });
    }

    return this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.kioskDevice.update({
        where: { id },
        data: { active: false },
        select: safeKioskDeviceSelect,
      });

      await transaction.auditLog.create({
        data: {
          entityName: 'kiosk_devices',
          entityId: id,
          action: 'UPDATE',
          actorUserId,
          previousValues: JSON.stringify({ active: true }),
          newValues: JSON.stringify({ active: false }),
        },
      });

      return updated;
    });
  }

  hashToken(token: string) {
    return createHash('sha256').update(token, 'utf8').digest('hex');
  }

  private generateToken() {
    return `${KIOSK_DEVICE_TOKEN_PREFIX}${randomBytes(32).toString('base64url')}`;
  }

  private async findDevice(id: string) {
    const device = await this.prisma.kioskDevice.findUnique({ where: { id } });
    if (!device) {
      throw new NotFoundException('Dispositivo kiosco no encontrado');
    }
    return device;
  }

  private async findActiveDevice(id: string) {
    const device = await this.findDevice(id);
    if (!device.active) {
      throw new ConflictException('No se puede rotar un dispositivo revocado');
    }
    return device;
  }
}
