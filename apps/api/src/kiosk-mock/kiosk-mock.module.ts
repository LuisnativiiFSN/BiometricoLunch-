import { Module } from '@nestjs/common';
import { KioskMockController } from './kiosk-mock.controller.js';
import { KioskMockService } from './kiosk-mock.service.js';

@Module({
  controllers: [KioskMockController],
  providers: [KioskMockService],
})
export class KioskMockModule {}
