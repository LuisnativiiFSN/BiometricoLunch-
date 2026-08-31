import { apiDownload } from './api';

export function downloadEmployeeMealAudit(
  employeeCode: string,
  startDate: string,
  endDate: string,
) {
  const encodedCode = encodeURIComponent(employeeCode.trim());
  const query = new URLSearchParams({ startDate, endDate });
  return apiDownload(
    `/meal-audits/employees/${encodedCode}/export?${query.toString()}`,
    `historial-almuerzos-empleado-${employeeCode.trim()}-${startDate}-a-${endDate}.xlsx`,
  );
}

export function downloadPayrollMealReport(startDate: string, endDate: string) {
  const query = new URLSearchParams({ startDate, endDate });
  return apiDownload(
    `/meal-audits/payroll/export?${query.toString()}`,
    `reporte-nomina-almuerzos-${startDate}-a-${endDate}.xlsx`,
  );
}

export function downloadWeeklyMealOrders(weekStart: string) {
  return apiDownload(
    `/meal-audits/orders/weeks/${encodeURIComponent(weekStart)}/export`,
    `pedidos-semanales-${weekStart}-al-${moveDate(weekStart, 4)}.xlsx`,
  );
}

export function downloadDailyMealOrders(date: string) {
  return apiDownload(
    `/meal-audits/orders/days/${encodeURIComponent(date)}/export`,
    `pedidos-diarios-${date}.xlsx`,
  );
}

function moveDate(date: string, days: number) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
