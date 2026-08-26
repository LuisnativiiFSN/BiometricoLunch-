import type {
  MealTransferHistoryItem,
  MealTransferResult,
  TransferableReservationsResult,
} from '../types/transfer';
import { apiRequest } from './api';

export function getRecentMealTransfers(signal?: AbortSignal) {
  return apiRequest<MealTransferHistoryItem[]>('/transfers', { signal });
}

export function getTransferableMealReservations(
  employeeCode: string,
  signal?: AbortSignal,
) {
  return apiRequest<TransferableReservationsResult>(
    `/transfers/pending/${encodeURIComponent(employeeCode.trim())}`,
    { signal },
  );
}

export function createMealTransfer(
  fromEmployeeCode: string,
  toEmployeeCode: string,
  mealDate: string,
) {
  return apiRequest<MealTransferResult>('/transfers', {
    method: 'POST',
    body: JSON.stringify({
      fromEmployeeCode,
      toEmployeeCode,
      mealDate,
    }),
  });
}
