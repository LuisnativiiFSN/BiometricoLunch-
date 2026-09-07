import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { Roles } from '../auth/auth.decorators.js';
import { UserRole, type AuthenticatedUser } from '../auth/auth.constants.js';
import { CreateKioskDeviceDto } from './dto/create-kiosk-device.dto.js';
import { KioskDevicesService } from './kiosk-devices.service.js';

type AuthenticatedRequest = Request & { user: AuthenticatedUser };

@Roles(UserRole.ADMIN)
@Controller('kiosk-devices')
export class KioskDevicesController {
  constructor(private readonly kioskDevices: KioskDevicesService) {}

  @Get()
  findAll() {
    return this.kioskDevices.findAll();
  }

  @Post()
  create(@Body() dto: CreateKioskDeviceDto, @Req() request: AuthenticatedRequest) {
    return this.kioskDevices.create(dto, request.user.id);
  }

  @Post(':id/rotate')
  rotate(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.kioskDevices.rotate(id, request.user.id);
  }

  @Patch(':id/revoke')
  revoke(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.kioskDevices.revoke(id, request.user.id);
  }
}
