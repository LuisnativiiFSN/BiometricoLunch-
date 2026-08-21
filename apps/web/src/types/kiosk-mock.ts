export interface MealEmployee {
  code: string;
  name: string;
}

export type KioskState =
  | 'IDLE'
  | 'PROCESSING'
  | 'APPROVED'
  | 'DUPLICATE'
  | 'NO_MEAL_RESERVED'
  | 'EMPLOYEE_INACTIVE'
  | 'ERROR';

interface ApprovedMealResult {
  status: 'APPROVED';
  employee: MealEmployee;
  meal: {
    date: string;
    type: 'BREAKFAST' | 'LUNCH' | 'DINNER';
    name: string;
  };
  requestedAt: string;
}

interface DuplicateMealResult {
  status: 'DUPLICATE';
  employee: MealEmployee;
  meal: {
    name: string;
  };
  previousRequest: {
    time: string;
  };
}

interface NoMealReservedResult {
  status: 'NO_MEAL_RESERVED';
  employee: MealEmployee;
}

interface EmployeeInactiveResult {
  status: 'EMPLOYEE_INACTIVE';
  employee: MealEmployee;
}

interface EmployeeNotFoundResult {
  status: 'EMPLOYEE_NOT_FOUND';
}

export type MealRequestResult =
  | ApprovedMealResult
  | DuplicateMealResult
  | NoMealReservedResult
  | EmployeeInactiveResult
  | EmployeeNotFoundResult;
