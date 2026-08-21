export const UserRole = {
  ADMIN: 'ADMIN',
  RH: 'RH',
  CHEF: 'CHEF',
} as const;

export type UserRoleValue = (typeof UserRole)[keyof typeof UserRole];

export const AUTH_COOKIE_NAME = 'comedor_session';
export const IS_PUBLIC_KEY = 'auth:is-public';
export const ROLES_KEY = 'auth:roles';

export interface AuthenticatedUser {
  id: string;
  username: string;
  role: UserRoleValue;
}
