import { Body, Controller, Post } from '@nestjs/common';
import { RequestMealDto } from './dto/request-meal.dto.js';
import { MealsService } from './meals.service.js';
import { Public } from '../auth/auth.decorators.js';

@Public()
@Controller('kiosk')
export class MealsController {
  constructor(private readonly mealsService: MealsService) {}

  @Post('request-meal')
  requestMeal(@Body() requestMealDto: RequestMealDto) {
    return this.mealsService.requestLunch(requestMealDto.employeeId);
  }
}
