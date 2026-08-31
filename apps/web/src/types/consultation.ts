export interface ConsultationEmployee {
  code: string;
  name: string;
}

export interface ConsultationSummary {
  totalLunches: number;
  delivered: number;
  pending: number;
}

export interface ConsultationItem {
  id: string;
  date: string;
  mealName: string;
  mealType: 'LUNCH';
  quantity: number;
  status: 'DELIVERED' | 'PENDING';
  deliveredAt: string | null;
}

export interface EmployeeRecentWeeksConsultation {
  mode: 'RECENT_WEEKS';
  employee: ConsultationEmployee;
  period: {
    startDate: string;
    endDate: string;
  };
  summary: ConsultationSummary;
  weeks: Array<{
    startDate: string;
    endDate: string;
    count: number;
  }>;
  items: ConsultationItem[];
}

export interface EmployeeRangeConsultation {
  mode: 'DATE_RANGE';
  employee: ConsultationEmployee;
  period: {
    startDate: string;
    endDate: string;
  };
  summary: ConsultationSummary;
  items: ConsultationItem[];
}

export interface EmployeeMonthlyConsultation {
  employee: ConsultationEmployee;
  month: string;
  currentMonth: string;
  summary: ConsultationSummary;
  weeks: EmployeeRecentWeeksConsultation['weeks'];
  items: ConsultationItem[];
}
