import { Module } from '@nestjs/common';
import { ConsultationsController } from './consultations.controller.js';
import { ConsultationsService } from './consultations.service.js';
import { MealAuditsController } from './meal-audits.controller.js';
import { MealAuditsService } from './meal-audits.service.js';

@Module({
  controllers: [ConsultationsController, MealAuditsController],
  providers: [ConsultationsService, MealAuditsService],
})
export class ConsultationsModule {}
