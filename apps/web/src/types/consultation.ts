export interface EmployeeMonthlyConsultation {
  employee: {
    code: string;
    name: string;
  };
  month: string;
  currentMonth: string;
  summary: {
    totalLunches: number;
    delivered: number;
    pending: number;
  };
  weeks: Array<{
    startDate: string;
    endDate: string;
    count: number;
  }>;
  items: Array<{
    id: string;
    date: string;
    mealName: string;
    mealType: 'LUNCH';
    quantity: number;
    status: 'DELIVERED' | 'PENDING';
    deliveredAt: string | null;
  }>;
}
