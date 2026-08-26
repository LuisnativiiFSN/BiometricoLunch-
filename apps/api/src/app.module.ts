import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller.js';
import { AuthModule } from './auth/auth.module.js';
import { BiometricsModule } from './biometrics/biometrics.module.js';
import { ConsultationsModule } from './consultations/consultations.module.js';
import { EmployeesModule } from './employees/employees.module.js';
import { KioskMockModule } from './kiosk-mock/kiosk-mock.module.js';
import { MealsModule } from './meals/meals.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { UsersModule } from './users/users.module.js';
import { TransfersModule } from './transfers/transfers.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    AuthModule,
    BiometricsModule,
    ConsultationsModule,
    EmployeesModule,
    KioskMockModule,
    MealsModule,
    TransfersModule,
    UsersModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
