export interface MealHistoryItem {
  id: string;
  employeeCode: string;
  employeeName: string;
  mealName: string | null;
  date: string;
  time: string;
  status: 'APPROVED' | 'DUPLICATE' | 'REJECTED';
}

export interface PendingMealItem {
  employeeCode: string;
  name: string;
  meal: string;
}

export interface TodayMealSummary {
  reserved: number;
  collected: number;
  pending: number;
  duplicateAttempts: number;
}

export interface AvailableMeal {
  id: string;
  name: string;
  date: string;
  mealType: 'LUNCH';
}

export interface TodayMealCreationResult {
  status: 'CREATED' | 'ALREADY_EXISTS' | 'REACTIVATED';
  meal: AvailableMeal;
}

export interface ManualMealReservationResult {
  status: 'CREATED' | 'ALREADY_EXISTS';
  employee: {
    code: string;
    name: string;
  };
  reservation: {
    date: string;
    mealId: string;
    mealName: string;
    quantity: number;
  };
}
