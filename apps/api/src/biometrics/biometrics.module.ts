import { Module } from '@nestjs/common';
import { BiometricEncryptionService } from './biometric-encryption.service.js';
import { BiometricMatcherService } from './biometric-matcher.service.js';
import { BiometricsController } from './biometrics.controller.js';
import { BiometricsService } from './biometrics.service.js';

@Module({
  controllers: [BiometricsController],
  providers: [
    BiometricEncryptionService,
    BiometricMatcherService,
    BiometricsService,
  ],
  exports: [BiometricsService],
})
export class BiometricsModule {}
