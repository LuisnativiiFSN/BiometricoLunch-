import type {
  EmployeeRangeConsultation,
  EmployeeRecentWeeksConsultation,
} from '../types/consultation';
import { apiRequest } from './api';

export function getEmployeeRecentWeeksConsultation(
  employeeCode: string,
  signal?: AbortSignal,
) {
  const encodedCode = encodeURIComponent(employeeCode.trim());

  return apiRequest<EmployeeRecentWeeksConsultation>(
    `/consultations/employees/${encodedCode}/recent-weeks`,
    { signal },
  );
}

export function getEmployeeRangeConsultation(
  employeeCode: string,
  startDate: string,
  endDate: string,
  signal?: AbortSignal,
) {
  const encodedCode = encodeURIComponent(employeeCode.trim());
  const query = new URLSearchParams({ startDate, endDate });

  return apiRequest<EmployeeRangeConsultation>(
    `/consultations/employees/${encodedCode}/range?${query.toString()}`,
    { signal },
  );
}
