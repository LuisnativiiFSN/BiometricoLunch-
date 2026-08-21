import type { EmployeeMonthlyConsultation } from '../types/consultation';
import { apiRequest } from './api';

export function getEmployeeMonthlyConsultation(
  employeeCode: string,
  month: string,
  signal?: AbortSignal,
) {
  const encodedCode = encodeURIComponent(employeeCode.trim());
  const query = new URLSearchParams({ month });

  return apiRequest<EmployeeMonthlyConsultation>(
    `/consultations/employees/${encodedCode}/monthly?${query.toString()}`,
    { signal },
  );
}
