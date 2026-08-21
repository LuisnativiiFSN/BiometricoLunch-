import type { MealRequestResult } from '../types/kiosk-mock';
import { apiRequest } from './api';

export function requestMeal(employeeId: string) {
  return apiRequest<MealRequestResult>('/kiosk/request-meal', {
    method: 'POST',
    body: JSON.stringify({ employeeId }),
  });
}
