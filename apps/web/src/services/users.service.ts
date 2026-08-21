import type { ManagedUser, UserRole } from '../types/auth';
import { apiRequest } from './api';

export function getUsers(signal?: AbortSignal) {
  return apiRequest<ManagedUser[]>('/users', { signal });
}

export function createUser(username: string, password: string, role: Exclude<UserRole, 'ADMIN'>) {
  return apiRequest<ManagedUser>('/users', {
    method: 'POST',
    body: JSON.stringify({ username, password, role }),
  });
}

export function changeUserPassword(id: string, password: string) {
  return apiRequest<ManagedUser>(`/users/${encodeURIComponent(id)}/password`, {
    method: 'PATCH',
    body: JSON.stringify({ password }),
  });
}

export function changeUserStatus(id: string, active: boolean) {
  return apiRequest<ManagedUser>(`/users/${encodeURIComponent(id)}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ active }),
  });
}
