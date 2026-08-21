import { Body, Controller, Get, Post } from '@nestjs/common';
import { CreateManualReservationDto } from './dto/create-manual-reservation.dto.js';
import { MealsService } from './meals.service.js';
import { Roles } from '../auth/auth.decorators.js';
import { UserRole } from '../auth/auth.constants.js';

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
  getPendingToday() {
    return this.mealsService.getPendingToday();
  }

  @Get('summary/today')
  getTodaySummary() {
    return this.mealsService.getTodaySummary();
  }

  @Get('available-today')
  getAvailableToday() {
    return this.mealsService.getAvailableMealsToday();
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
