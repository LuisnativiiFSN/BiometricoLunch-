import type { AuthUser } from '../types/auth';
import { apiRequest } from './api';

interface AuthResponse {
  user: AuthUser;
}

export function login(username: string, password: string) {
  return apiRequest<AuthResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
}

export function getCurrentSession(signal?: AbortSignal) {
  return apiRequest<AuthResponse>('/auth/me', { signal });
}

export function logout() {
  return apiRequest<void>('/auth/logout', { method: 'POST' });
}
