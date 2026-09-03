import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { gzipSync } from 'node:zlib';
import { BiometricsService } from './biometrics.service.js';
import { AuthorizeEnrollmentDto } from './dto/authorize-enrollment.dto.js';
import { CreateEnrollmentDto } from './dto/create-enrollment.dto.js';
import { Public } from '../auth/auth.decorators.js';
import { KioskDeviceGuard } from '../kiosk-devices/kiosk-device.guard.js';
import { RequireKioskAuthentication } from '../kiosk-devices/kiosk-device.decorators.js';
import type { KioskDeviceRequest } from '../kiosk-devices/kiosk-device.types.js';

@Public()
@UseGuards(KioskDeviceGuard)
@Controller('biometrics')
export class BiometricsController {
  constructor(private readonly biometricsService: BiometricsService) {}

  @Post('enrollments')
  @RequireKioskAuthentication()
  enroll(@Body() dto: CreateEnrollmentDto) {
    return this.biometricsService.enroll(dto);
  }

  @Post('enrollment-authorizations')
  @RequireKioskAuthentication()
  authorizeEnrollment(@Body() dto: AuthorizeEnrollmentDto) {
    return this.biometricsService.authorizeEnrollment(dto);
  }

  @Get('gallery')
  @RequireKioskAuthentication()
  async downloadGallery(
    @Headers('if-none-match') ifNoneMatch: string | undefined,
    @Headers('accept-encoding') acceptEncoding: string | undefined,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const kioskDevice = (request as KioskDeviceRequest).kioskDevice;
    if (!kioskDevice) {
      throw new Error('KIOSK_DEVICE_CONTEXT_REQUIRED');
    }

    const gallery = await this.biometricsService.prepareGallery(
      ifNoneMatch,
      kioskDevice.id,
    );
    response.setHeader('ETag', gallery.etag);
    response.setHeader('Expires', gallery.expiresAt.toUTCString());
    response.setHeader('Cache-Control', 'private, no-cache, must-revalidate');
    response.setHeader('Vary', 'Authorization, Accept-Encoding');

    if (gallery.notModified) {
      response.status(304).end();
      return;
    }

    const payload = gallery.payload ?? Buffer.from('{}', 'utf8');
    response.type('application/json');
    if (/\bgzip\b/i.test(acceptEncoding ?? '')) {
      response.setHeader('Content-Encoding', 'gzip');
      response.send(gzipSync(payload));
      payload.fill(0);
      return;
    }

    response.send(payload);
    payload.fill(0);
  }

  @Get('enrollment-candidates')
  @RequireKioskAuthentication()
  findEnrollmentCandidates() {
    return this.biometricsService.findEnrollmentCandidates();
  }

  @Get('employees/:employeeCode')
  findByEmployee(@Param('employeeCode') employeeCode: string) {
    return this.biometricsService.findByEmployee(employeeCode);
  }

  @Patch('enrollments/:id/deactivate')
  deactivate(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.biometricsService.deactivate(id);
  }
}
