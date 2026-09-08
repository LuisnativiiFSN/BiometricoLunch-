import { Module } from '@nestjs/common';
import { BiometricEncryptionService } from './biometric-encryption.service.js';
import { BiometricsController } from './biometrics.controller.js';
import { BiometricsService } from './biometrics.service.js';
import { KioskDevicesModule } from '../kiosk-devices/kiosk-devices.module.js';

@Module({
  imports: [KioskDevicesModule],
  controllers: [BiometricsController],
  providers: [BiometricEncryptionService, BiometricsService],
  exports: [BiometricsService],
})
export class BiometricsModule {}
