import { SetMetadata } from '@nestjs/common';
import { KIOSK_AUTH_ALWAYS_REQUIRED_KEY } from './kiosk-device.constants.js';

export const RequireKioskAuthentication = () =>
  SetMetadata(KIOSK_AUTH_ALWAYS_REQUIRED_KEY, true);
