import { Controller, Get, Param, Query } from '@nestjs/common';
import { Public } from '../auth/auth.decorators.js';
import { ConsultationsService } from './consultations.service.js';
import { EmployeeConsultationQueryDto } from './dto/employee-consultation-query.dto.js';

@Public()
@Controller('consultations')
export class ConsultationsController {
  constructor(private readonly consultationsService: ConsultationsService) {}

  @Get('employees/:employeeCode/monthly')
  getMonthlySummary(
    @Param('employeeCode') employeeCode: string,
    @Query() query: EmployeeConsultationQueryDto,
  ) {
    return this.consultationsService.getMonthlySummary(employeeCode, query.month);
  }
}
