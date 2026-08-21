export type UserRole = 'ADMIN' | 'RH' | 'CHEF';

export interface AuthUser {
  id: string;
  username: string;
  role: UserRole;
}

export interface ManagedUser extends AuthUser {
  active: boolean;
  passwordLocked: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}
