import { SetMetadata } from '@nestjs/common';
import {
  IS_PUBLIC_KEY,
  ROLES_KEY,
  type UserRoleValue,
} from './auth.constants.js';

export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
export const Roles = (...roles: UserRoleValue[]) => SetMetadata(ROLES_KEY, roles);
