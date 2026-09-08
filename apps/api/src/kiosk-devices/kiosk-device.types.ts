import type { Request } from 'express';

export interface AuthenticatedKioskDevice {
  id: string;
  name: string;
}

export type KioskDeviceRequest = Request & {
  kioskDevice?: AuthenticatedKioskDevice;
};
