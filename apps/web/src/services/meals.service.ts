import type {
  AvailableMeal,
  ManualMealReservationResult,
  MealHistoryItem,
  PendingMealItem,
  TodayMealSummary,
} from '../types/meal-history';
import { apiRequest } from './api';

export function getTodayMeals(signal?: AbortSignal) {
  return apiRequest<MealHistoryItem[]>('/meals/today', { signal });
}

export function getMealHistory(signal?: AbortSignal) {
  return apiRequest<MealHistoryItem[]>('/meals/history', { signal });
}

export function getDeliveredMeals(signal?: AbortSignal) {
  return apiRequest<MealHistoryItem[]>('/meals/delivered', { signal });
}

export function getPendingToday(signal?: AbortSignal) {
  return apiRequest<PendingMealItem[]>('/meals/pending-today', { signal });
}

export function getTodayMealSummary(signal?: AbortSignal) {
  return apiRequest<TodayMealSummary>('/meals/summary/today', { signal });
}

export function getAvailableMealsToday(signal?: AbortSignal) {
  return apiRequest<AvailableMeal[]>('/meals/available-today', { signal });
}

export function createManualMealReservation(employeeId: string, mealId: string) {
  return apiRequest<ManualMealReservationResult>('/meals/reservations/manual', {
    method: 'POST',
    body: JSON.stringify({ employeeId, mealId }),
  });
}
