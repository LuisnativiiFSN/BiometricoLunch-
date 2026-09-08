import type { AuthUser } from '../types/auth';
import { apiRequest } from './api';

interface AuthResponse {
  user: AuthUser;
}

interface LegacyCompatibleAuthResponse {
  user: Omit<AuthUser, 'role'> & { role: AuthUser['role'] | 'CHEF' };
}

function normalizeRole(response: LegacyCompatibleAuthResponse): AuthResponse {
  return {
    user: {
      ...response.user,
      role: response.user.role === 'CHEF' ? 'PROVEEDOR' : response.user.role,
    },
  };
}

export async function login(username: string, password: string) {
  const response = await apiRequest<LegacyCompatibleAuthResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
  return normalizeRole(response);
}

export async function getCurrentSession(signal?: AbortSignal) {
  const response = await apiRequest<LegacyCompatibleAuthResponse>('/auth/me', { signal });
  return normalizeRole(response);
}

export function logout() {
  return apiRequest<void>('/auth/logout', { method: 'POST' });
}
