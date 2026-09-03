import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  UseGuards,
} from '@nestjs/common';
import { RequestMealDto } from './dto/request-meal.dto.js';
import { MealsService } from './meals.service.js';
import { Public } from '../auth/auth.decorators.js';
import { KioskDeviceGuard } from '../kiosk-devices/kiosk-device.guard.js';
import { RequireKioskAuthentication } from '../kiosk-devices/kiosk-device.decorators.js';

@Public()
@UseGuards(KioskDeviceGuard)
@Controller('kiosk')
export class MealsController {
  constructor(private readonly mealsService: MealsService) {}

  @Get('deliveries/today')
  getApprovedDeliveriesToday() {
    return this.mealsService.getApprovedToday();
  }

  @Post('request-meal')
  @RequireKioskAuthentication()
  requestMeal(@Body() requestMealDto: RequestMealDto) {
    const employeeCode =
      requestMealDto.employeeCode ?? requestMealDto.employeeId ?? '';
    if (
      requestMealDto.employeeCode &&
      requestMealDto.employeeId &&
      requestMealDto.employeeCode !== requestMealDto.employeeId
    ) {
      throw new BadRequestException(
        'employeeCode y employeeId no pueden identificar personas distintas',
      );
    }
    return this.mealsService.requestLunch(
      employeeCode,
      requestMealDto.enrollmentId,
    );
  }
}
