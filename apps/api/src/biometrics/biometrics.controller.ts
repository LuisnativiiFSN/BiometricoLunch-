import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { BiometricsService } from './biometrics.service.js';
import { AuthorizeEnrollmentDto } from './dto/authorize-enrollment.dto.js';
import { CreateEnrollmentDto } from './dto/create-enrollment.dto.js';
import { IdentifyFingerprintDto } from './dto/identify-fingerprint.dto.js';
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

  @Post('identify')
  identify(@Body() dto: IdentifyFingerprintDto) {
    return this.biometricsService.identify(dto);
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
