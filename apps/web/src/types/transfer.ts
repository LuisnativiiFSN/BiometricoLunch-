export interface MealTransferResult {
  id: string;
  date: string;
  meal: string;
  originalEmployee: {
    code: string;
    name: string;
  };
  beneficiary: {
    code: string;
    name: string;
  };
  transferredBy: string;
}

export interface MealTransferHistoryItem extends MealTransferResult {
  reservationId: string;
  transferredAt: string;
}

export interface TransferableMealReservation {
  id: string;
  date: string;
  meal: string;
  mealType: 'LUNCH';
  quantity: number;
}

export interface TransferableReservationsResult {
  employee: {
    employeeCode: string;
    name: string;
    active: boolean;
  };
  reservations: TransferableMealReservation[];
}
