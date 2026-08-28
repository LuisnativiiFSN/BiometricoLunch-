import type {
  AvailableMeal,
  ManualMealReservationResult,
  MealHistoryItem,
  PendingMealItem,
  TodayMealCreationResult,
  TodayMealSummary,
} from '../types/meal-history';
import { apiDownload, apiRequest } from './api';
import type {
  EmployeeWeeklySelections,
  SavedWeeklySelections,
  WeeklyMenu,
  WeeklyOrderSummary,
} from '../types/weekly-meal';

export function getTodayMeals(signal?: AbortSignal) {
  return apiRequest<MealHistoryItem[]>('/meals/today', { signal });
}

export function getMealHistory(signal?: AbortSignal) {
  return apiRequest<MealHistoryItem[]>('/meals/history', { signal });
}

export function getDeliveredMeals(signal?: AbortSignal) {
  return apiRequest<MealHistoryItem[]>('/meals/delivered', { signal });
}

export function getPendingToday(employeeCode = '', signal?: AbortSignal) {
  const query = new URLSearchParams();

  if (employeeCode.trim()) {
    query.set('employeeCode', employeeCode.trim());
  }

  const suffix = query.size > 0 ? `?${query.toString()}` : '';
  return apiRequest<PendingMealItem[]>(`/meals/pending-today${suffix}`, { signal });
}

export function getTodayMealSummary(signal?: AbortSignal) {
  return apiRequest<TodayMealSummary>('/meals/summary/today', { signal });
}

export function downloadPendingTodayExport() {
  return apiDownload('/meals/pending-today/export');
}

export function getAvailableMealsToday(signal?: AbortSignal) {
  return apiRequest<AvailableMeal[]>('/meals/available-today', { signal });
}

export function createTodayMeal(name: string) {
  return apiRequest<TodayMealCreationResult>('/meals/available-today', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

export function createManualMealReservation(employeeId: string, mealId: string) {
  return apiRequest<ManualMealReservationResult>('/meals/reservations/manual', {
    method: 'POST',
    body: JSON.stringify({ employeeId, mealId }),
  });
}

export function getCurrentWeeklyMenu(signal?: AbortSignal) {
  return apiRequest<WeeklyMenu>('/meal-planning/current-week', { signal });
}

export function getWeeklyMenuForAdministration(weekStart: string, signal?: AbortSignal) {
  return apiRequest<WeeklyMenu>(
    `/meal-planning/weeks/${encodeURIComponent(weekStart)}`,
    { signal },
  );
}

export function getEmployeeWeeklySelections(employeeCode: string) {
  return apiRequest<EmployeeWeeklySelections>(
    `/meal-planning/current-week/employees/${encodeURIComponent(employeeCode.trim())}`,
  );
}

export function saveEmployeeWeeklySelections(
  employeeCode: string,
  selections: Array<{ date: string; mealId: string }>,
) {
  return apiRequest<SavedWeeklySelections>('/meal-planning/current-week/reservations', {
    method: 'PUT',
    body: JSON.stringify({ employeeCode, selections }),
  });
}

export function saveCurrentWeeklyMenu(
  weekStart: string,
  days: Array<{ date: string; meals: string[] }>,
) {
  return apiRequest<WeeklyMenu>(`/meal-planning/weeks/${encodeURIComponent(weekStart)}/menu`, {
    method: 'PUT',
    body: JSON.stringify({ days }),
  });
}

export function saveWeeklyCutoffs(
  weekStart: string,
  configuration: {
    mode: 'GENERAL' | 'DAILY';
    generalTime?: string;
    days?: Array<{ date: string; cutoffTime: string }>;
  },
) {
  return apiRequest<WeeklyMenu>(`/meal-planning/weeks/${encodeURIComponent(weekStart)}/cutoffs`, {
    method: 'PUT',
    body: JSON.stringify(configuration),
  });
}

export function getWeeklyOrderSummary(weekStart: string, signal?: AbortSignal) {
  return apiRequest<WeeklyOrderSummary>(
    `/meal-planning/weeks/${encodeURIComponent(weekStart)}/summary`,
    { signal },
  );
}
