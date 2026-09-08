import { Injectable, UnauthorizedException } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  KIOSK_AUTH_ALWAYS_REQUIRED_KEY,
  KIOSK_AUTH_REQUIRED_ENV,
} from './kiosk-device.constants.js';
import type { KioskDeviceRequest } from './kiosk-device.types.js';
import { KioskDevicesService } from './kiosk-devices.service.js';

@Injectable()
export class KioskDeviceGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService,
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    private readonly kioskDevices: KioskDevicesService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<KioskDeviceRequest>();
    const authorization = request.headers.authorization;
    const alwaysRequired = this.reflector.getAllAndOverride<boolean>(
      KIOSK_AUTH_ALWAYS_REQUIRED_KEY,
      [context.getHandler(), context.getClass()],
    );
    const required = Boolean(alwaysRequired) ||
      this.config.get<string>(KIOSK_AUTH_REQUIRED_ENV)?.trim().toLowerCase() ===
      'true';

    if (!authorization) {
      if (required) {
        throw new UnauthorizedException('El kiosco debe autenticarse');
      }
      return true;
    }

    const match = /^Bearer\s+(\S+)$/i.exec(authorization);
    if (!match) {
      throw new UnauthorizedException('La credencial del kiosco no es válida');
    }

    const tokenHash = this.kioskDevices.hashToken(match[1]);
    const device = await this.prisma.kioskDevice.findUnique({
      where: { tokenHash },
      select: { id: true, name: true, active: true },
    });

    if (!device?.active) {
      throw new UnauthorizedException('La credencial del kiosco no es válida');
    }

    const accessUpdate = await this.prisma.kioskDevice.updateMany({
      where: { id: device.id, tokenHash, active: true },
      data: { lastAccessedAt: new Date() },
    });
    if (accessUpdate.count !== 1) {
      throw new UnauthorizedException('La credencial del kiosco no es válida');
    }
    request.kioskDevice = { id: device.id, name: device.name };
    return true;
  }
}
