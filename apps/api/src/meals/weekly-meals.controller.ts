import { Body, Controller, Get, Param, Put, Req } from '@nestjs/common';
import type { Request } from 'express';
import { Public, Roles } from '../auth/auth.decorators.js';
import {
  UserRole,
  type AuthenticatedUser,
} from '../auth/auth.constants.js';
import { SaveWeeklyMenuDto } from './dto/save-weekly-menu.dto.js';
import { SaveWeeklyReservationsDto } from './dto/save-weekly-reservations.dto.js';
import { SaveWeeklyCutoffsDto } from './dto/save-weekly-cutoffs.dto.js';
import { MealsService } from './meals.service.js';

type AuthenticatedRequest = Request & { user: AuthenticatedUser };

@Controller('meal-planning')
export class WeeklyMealsController {
  constructor(private readonly mealsService: MealsService) {}

  @Get('current-week')
  @Public()
  getCurrentWeek() {
    return this.mealsService.getCurrentWeeklyMenu();
  }

  @Get('weeks/:weekStart')
  @Roles(UserRole.ADMIN, UserRole.RH)
  getWeekForAdministration(@Param('weekStart') weekStart: string) {
    return this.mealsService.getWeeklyMenuForAdministration(weekStart);
  }

  @Get('weeks/:weekStart/summary')
  @Roles(UserRole.ADMIN, UserRole.RH, UserRole.CHEF)
  getWeeklySummary(@Param('weekStart') weekStart: string) {
    return this.mealsService.getWeeklyOrderSummary(weekStart);
  }

  @Get('current-week/employees/:employeeCode')
  @Public()
  getEmployeeSelections(@Param('employeeCode') employeeCode: string) {
    return this.mealsService.getCurrentWeekEmployeeReservations(employeeCode);
  }

  @Put('current-week/reservations')
  @Public()
  saveEmployeeSelections(@Body() body: SaveWeeklyReservationsDto) {
    return this.mealsService.saveCurrentWeekReservations(
      body.employeeCode,
      body.selections,
    );
  }

  @Put('current-week/menu')
  @Roles(UserRole.ADMIN, UserRole.RH)
  saveWeeklyMenu(
    @Body() body: SaveWeeklyMenuDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.mealsService.saveCurrentWeeklyMenu(
      body.days,
      request.user.id,
    );
  }

  @Put('weeks/:weekStart/menu')
  @Roles(UserRole.ADMIN, UserRole.RH)
  saveFutureWeeklyMenu(
    @Param('weekStart') weekStart: string,
    @Body() body: SaveWeeklyMenuDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.mealsService.saveWeeklyMenu(
      weekStart,
      body.days,
      request.user.id,
    );
  }


  @Put('weeks/:weekStart/cutoffs')
  @Roles(UserRole.ADMIN, UserRole.RH)
  saveWeeklyCutoffs(
    @Param('weekStart') weekStart: string,
    @Body() body: SaveWeeklyCutoffsDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.mealsService.saveWeeklyCutoffs(
      weekStart,
      body,
      request.user.id,
    );
  }
}
