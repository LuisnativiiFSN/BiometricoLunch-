import { Body, Controller, Get, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { CreateManualReservationDto } from './dto/create-manual-reservation.dto.js';
import { CreateTodayMealDto } from './dto/create-today-meal.dto.js';
import { PendingMealQueryDto } from './dto/pending-meal-query.dto.js';
import { MealsService } from './meals.service.js';
import { Roles } from '../auth/auth.decorators.js';
import {
  UserRole,
  type AuthenticatedUser,
} from '../auth/auth.constants.js';

type AuthenticatedRequest = Request & { user: AuthenticatedUser };

@Roles(UserRole.ADMIN, UserRole.RH, UserRole.CHEF)
@Controller('meals')
export class MealsHistoryController {
  constructor(private readonly mealsService: MealsService) {}

  @Get('today')
  getToday() {
    return this.mealsService.getToday();
  }

  @Get('history')
  getHistory() {
    return this.mealsService.getHistory();
  }

  @Get('delivered')
  getDelivered() {
    return this.mealsService.getDelivered();
  }

  @Get('pending-today')
  getPendingToday(@Query() query: PendingMealQueryDto) {
    return this.mealsService.getPendingToday(query.employeeCode);
  }

  @Get('summary/today')
  getTodaySummary() {
    return this.mealsService.getTodaySummary();
  }

  @Get('available-today')
  getAvailableToday() {
    return this.mealsService.getAvailableMealsToday();
  }

  @Post('available-today')
  @Roles(UserRole.ADMIN)
  createAvailableToday(
    @Body() body: CreateTodayMealDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.mealsService.createAvailableMealToday(
      body.name,
      request.user.id,
    );
  }

  @Post('reservations/manual')
  @Roles(UserRole.ADMIN)
  createManualReservation(@Body() body: CreateManualReservationDto) {
    return this.mealsService.createManualReservation(
      body.employeeId,
      body.mealId,
    );
  }
}
