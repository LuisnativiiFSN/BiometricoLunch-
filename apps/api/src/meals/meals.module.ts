import { Module } from '@nestjs/common';
import { MealsHistoryController } from './meals-history.controller.js';
import { MealsController } from './meals.controller.js';
import { MealsService } from './meals.service.js';

@Module({
  controllers: [MealsController, MealsHistoryController],
  providers: [MealsService],
})
export class MealsModule {}
