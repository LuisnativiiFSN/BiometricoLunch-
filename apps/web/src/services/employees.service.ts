import type {
  CreateEmployeeInput,
  Employee,
  UpdateEmployeeInput,
} from '../types/employee';
import { apiRequest } from './api';

interface GetEmployeesOptions {
  search?: string;
  active?: boolean;
  signal?: AbortSignal;
}

export function getEmployees(options: GetEmployeesOptions = {}) {
  const { search = '', active, signal } = options;
  const query = new URLSearchParams();

  if (search.trim()) {
    query.set('search', search.trim());
  }

  if (active !== undefined) {
    query.set('active', String(active));
  }

  const suffix = query.size > 0 ? `?${query.toString()}` : '';
  return apiRequest<Employee[]>(`/employees${suffix}`, { signal });
}

export function createEmployee(input: CreateEmployeeInput) {
  return apiRequest<Employee>('/employees', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateEmployee(employeeCode: string, input: UpdateEmployeeInput) {
  return apiRequest<Employee>(`/employees/${encodeURIComponent(employeeCode)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}
