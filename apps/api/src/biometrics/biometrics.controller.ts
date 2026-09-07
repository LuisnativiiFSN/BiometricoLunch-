import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { gzipSync } from 'node:zlib';
import { BiometricsService } from './biometrics.service.js';
import { AuthorizeEnrollmentDto } from './dto/authorize-enrollment.dto.js';
import { CreateEnrollmentDto } from './dto/create-enrollment.dto.js';
import { Public } from '../auth/auth.decorators.js';

@Public()
@Controller('biometrics')
export class BiometricsController {
  constructor(private readonly biometricsService: BiometricsService) {}

  @Post('enrollments')
  enroll(@Body() dto: CreateEnrollmentDto) {
    return this.biometricsService.enroll(dto);
  }

  @Post('enrollment-authorizations')
  authorizeEnrollment(@Body() dto: AuthorizeEnrollmentDto) {
    return this.biometricsService.authorizeEnrollment(dto);
  }

  @Get('gallery')
  async downloadGallery(
    @Headers('if-none-match') ifNoneMatch: string | undefined,
    @Headers('accept-encoding') acceptEncoding: string | undefined,
    @Res() response: Response,
  ) {
    const gallery = await this.biometricsService.prepareGallery(ifNoneMatch);
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
