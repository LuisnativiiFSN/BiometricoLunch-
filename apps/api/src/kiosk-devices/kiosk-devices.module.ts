import { Module } from '@nestjs/common';
import { KioskDeviceGuard } from './kiosk-device.guard.js';
import { KioskDevicesController } from './kiosk-devices.controller.js';
import { KioskDevicesService } from './kiosk-devices.service.js';

@Module({
  controllers: [KioskDevicesController],
  providers: [KioskDevicesService, KioskDeviceGuard],
  exports: [KioskDevicesService, KioskDeviceGuard],
})
export class KioskDevicesModule {}
