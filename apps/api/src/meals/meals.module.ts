import { Module } from '@nestjs/common';
import { MealsHistoryController } from './meals-history.controller.js';
import { MealsController } from './meals.controller.js';
import { MealsService } from './meals.service.js';
import { WeeklyMealsController } from './weekly-meals.controller.js';

@Module({
  controllers: [MealsController, MealsHistoryController, WeeklyMealsController],
  providers: [MealsService],
})
export class MealsModule {}
