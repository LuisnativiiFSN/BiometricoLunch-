export interface WeeklyMealOption {
  id: string;
  name: string;
  date: string;
  mealType: 'LUNCH';
}

export interface WeeklyMenuDay {
  date: string;
  dayName: string;
  cutoffTime: string;
  canModify: boolean;
  lockReason: string | null;
  meals: WeeklyMealOption[];
}

export interface WeeklyMenu {
  weekStart: string;
  weekEnd: string;
  cutoffMode: 'GENERAL';
  orderingCutoffTime: string;
  publicOrderingCutoffTime: string;
  publicOrderingOpen: boolean;
  publicOrderingLockReason: string | null;
  isReady: boolean;
  isPublished: boolean;
  publicationStatus: 'PENDING' | 'SCHEDULED' | 'PUBLISHED';
  activationDate: string;
  days: WeeklyMenuDay[];
}

export interface WeeklyOrderSummaryMeal {
  mealId: string;
  name: string;
  total: number;
}

export interface WeeklyOrderSummaryDay {
  date: string;
  dayName: string;
  cutoffTime: string;
  isClosed: boolean;
  lockReason: string | null;
  total: number;
  meals: WeeklyOrderSummaryMeal[];
}

export interface WeeklyOrderSummary {
  weekStart: string;
  weekEnd: string;
  totalReservations: number;
  days: WeeklyOrderSummaryDay[];
}

export interface EmployeeWeeklySelections {
  employee: {
    code: string;
    name: string;
    department: string;
  };
  selections: Array<{
    date: string;
    mealId: string;
    mealName: string;
  }>;
}

export interface SavedWeeklySelections extends EmployeeWeeklySelections {
  status: 'SAVED';
  changes: {
    created: number;
    updated: number;
    deleted: number;
  };
}

export interface MealAdjustmentContext {
  employee: {
    code: string;
    name: string;
    department: string;
  };
  weekStart: string;
  weekEnd: string;
  days: Array<{
    date: string;
    dayName: string;
    canModify: boolean;
    lockReason: string | null;
    meals: WeeklyMealOption[];
    reservation: {
      id: string;
      mealId: string;
      mealName: string;
      canModify: boolean;
      lockReason: string | null;
    } | null;
  }>;
}

export interface MealAdjustmentResult {
  status: 'ADDED' | 'CHANGED' | 'CANCELLED';
  employee: {
    employeeCode: string;
    employeeName: string;
    department: string;
    date: string;
  };
  previousMeal: string | null;
  newMeal: string | null;
  reason: string;
  modifiedBy: string;
}

export interface MealAdjustmentHistoryItem {
  id: string;
  reservationId: string | null;
  employee: {
    code: string;
    name: string;
    department: string;
  };
  date: string;
  action: 'ADD' | 'CHANGE' | 'CANCEL';
  previousMeal: string | null;
  newMeal: string | null;
  reason: string;
  modifiedBy: string;
  modifiedAt: string;
}
