import { Controller, Get, Param, Query, Req, StreamableFile } from '@nestjs/common';
import type { Request } from 'express';
import { Roles } from '../auth/auth.decorators.js';
import {
  UserRole,
  type AuthenticatedUser,
} from '../auth/auth.constants.js';
import { MealAuditExportQueryDto } from './dto/meal-audit-export-query.dto.js';
import { MealAuditsService } from './meal-audits.service.js';

type AuthenticatedRequest = Request & { user: AuthenticatedUser };

@Roles(UserRole.ADMIN, UserRole.RH)
@Controller('meal-audits')
export class MealAuditsController {
  constructor(private readonly mealAuditsService: MealAuditsService) {}

  @Get('employees/:employeeCode/export')
  async exportEmployeeMeals(
    @Param('employeeCode') employeeCode: string,
    @Query() query: MealAuditExportQueryDto,
    @Req() request: AuthenticatedRequest,
  ) {
    const exported = await this.mealAuditsService.exportEmployeeMeals(
      employeeCode,
      query.startDate,
      query.endDate,
      request.user,
    );

    return new StreamableFile(exported.buffer, {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      disposition: `attachment; filename="${exported.fileName}"`,
      length: exported.buffer.length,
    });
  }

  @Get('payroll/export')
  async exportPayrollReport(
    @Query() query: MealAuditExportQueryDto,
    @Req() request: AuthenticatedRequest,
  ) {
    const exported = await this.mealAuditsService.exportPayrollReport(
      query.startDate,
      query.endDate,
      request.user,
    );

    return new StreamableFile(exported.buffer, {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      disposition: `attachment; filename="${exported.fileName}"`,
      length: exported.buffer.length,
    });
  }

  @Get('orders/weeks/:weekStart/export')
  async exportWeeklyOrders(
    @Param('weekStart') weekStart: string,
    @Req() request: AuthenticatedRequest,
  ) {
    const exported = await this.mealAuditsService.exportWeeklyOrders(
      weekStart,
      request.user,
    );

    return new StreamableFile(exported.buffer, {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      disposition: `attachment; filename="${exported.fileName}"`,
      length: exported.buffer.length,
    });
  }

  @Get('orders/days/:date/export')
  async exportDailyOrders(
    @Param('date') date: string,
    @Req() request: AuthenticatedRequest,
  ) {
    const exported = await this.mealAuditsService.exportDailyOrders(
      date,
      request.user,
    );

    return new StreamableFile(exported.buffer, {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      disposition: `attachment; filename="${exported.fileName}"`,
      length: exported.buffer.length,
    });
  }
}
