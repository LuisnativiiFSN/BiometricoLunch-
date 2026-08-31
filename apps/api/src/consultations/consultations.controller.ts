import { Controller, Get, Param, Query } from '@nestjs/common';
import { Public } from '../auth/auth.decorators.js';
import { ConsultationsService } from './consultations.service.js';
import { EmployeeConsultationQueryDto } from './dto/employee-consultation-query.dto.js';
import { EmployeeConsultationRangeQueryDto } from './dto/employee-consultation-range-query.dto.js';

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

  @Get('employees/:employeeCode/recent-weeks')
  getRecentWeeks(@Param('employeeCode') employeeCode: string) {
    return this.consultationsService.getRecentWeeks(employeeCode);
  }

  @Get('employees/:employeeCode/range')
  getRangeSummary(
    @Param('employeeCode') employeeCode: string,
    @Query() query: EmployeeConsultationRangeQueryDto,
  ) {
    return this.consultationsService.getRangeSummary(
      employeeCode,
      query.startDate,
      query.endDate,
    );
  }
}
