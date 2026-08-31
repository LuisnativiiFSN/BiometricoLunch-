import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

const CONSULTATION_TIME_ZONE = 'America/Guatemala';
const LUNCH = 'LUNCH';
const APPROVED = 'APPROVED';
const RECENT_WEEK_COUNT = 4;
const MAX_RANGE_DAYS = 366;

type ConsultationItem = {
  id: string;
  date: string;
  mealName: string;
  mealType: 'LUNCH';
  quantity: number;
  status: 'DELIVERED' | 'PENDING';
  deliveredAt: string | null;
};

@Injectable()
export class ConsultationsService {
  constructor(private readonly prisma: PrismaService) {}

  async getRecentWeeks(employeeCode: string, now = new Date()) {
    const employee = await this.findEmployee(employeeCode);
    const currentDate = this.parseDateOnly(this.getCurrentDate(now));
    const currentMonday = this.addDays(
      currentDate,
      -((currentDate.getUTCDay() + 6) % 7),
    );
    const start = this.addDays(currentMonday, -(RECENT_WEEK_COUNT - 1) * 7);
    const end = this.addDays(currentMonday, 4);
    const items = await this.findItems(employee.employeeCode, start, end);

    return {
      mode: 'RECENT_WEEKS' as const,
      employee: this.toEmployeeResponse(employee),
      period: {
        startDate: this.toDateOnly(start),
        endDate: this.toDateOnly(end),
      },
      summary: this.summarize(items),
      weeks: this.buildWeeklySummary(start, end, items),
      items,
    };
  }

  async getRangeSummary(
    employeeCode: string,
    startDate: string,
    endDate: string,
  ) {
    const employee = await this.findEmployee(employeeCode);
    const start = this.parseDateOnly(startDate);
    const end = this.parseDateOnly(endDate);

    if (end < start) {
      throw new BadRequestException(
        'La fecha final debe ser igual o posterior a la fecha inicial',
      );
    }

    const rangeDays = Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1;
    if (rangeDays > MAX_RANGE_DAYS) {
      throw new BadRequestException(
        `El período máximo de consulta es de ${MAX_RANGE_DAYS} días`,
      );
    }

    const items = await this.findItems(employee.employeeCode, start, end);

    return {
      mode: 'DATE_RANGE' as const,
      employee: this.toEmployeeResponse(employee),
      period: { startDate, endDate },
      summary: this.summarize(items),
      items,
    };
  }

  /**
   * Se conserva por compatibilidad. Un mes contiene las semanas cuyo lunes cae
   * dentro de ese mes; cada una siempre se consulta completa hasta el viernes.
   */
  async getMonthlySummary(employeeCode: string, requestedMonth?: string) {
    const currentMonth = this.getCurrentMonth();
    const month = requestedMonth ?? currentMonth;

    if (month > currentMonth) {
      throw new BadRequestException('No se pueden consultar meses futuros');
    }

    const employee = await this.findEmployee(employeeCode);
    const { start, end } = this.getMonthWorkWeekRange(month);
    const items = await this.findItems(employee.employeeCode, start, end);

    return {
      employee: this.toEmployeeResponse(employee),
      month,
      currentMonth,
      summary: this.summarize(items),
      weeks: this.buildWeeklySummary(start, end, items),
      items,
    };
  }

  private async findEmployee(employeeCode: string) {
    const normalizedCode = employeeCode.trim();

    if (!normalizedCode || normalizedCode.length > 50) {
      throw new BadRequestException('Código de empleado inválido');
    }

    const employee = await this.prisma.employee.findUnique({
      where: { employeeCode: normalizedCode },
      select: { employeeCode: true, name: true },
    });

    if (!employee) {
      throw new NotFoundException('No se encontró información para ese código');
    }

    return employee;
  }

  private async findItems(employeeCode: string, start: Date, end: Date) {
    const reservations = await this.prisma.mealReservation.findMany({
      where: {
        mealType: LUNCH,
        mealDate: { gte: start, lt: this.addDays(end, 1) },
        OR: [
          { transferEmployeeId: employeeCode },
          { employeeId: employeeCode, transferEmployeeId: null },
        ],
      },
      include: {
        meal: true,
        mealRequests: {
          where: { status: APPROVED },
          select: { requestedAt: true },
          orderBy: { requestedAt: 'asc' },
          take: 1,
        },
      },
      orderBy: { mealDate: 'desc' },
    });

    return reservations.map<ConsultationItem>((reservation) => {
      const delivery = reservation.mealRequests[0];

      return {
        id: reservation.id,
        date: this.toDateOnly(reservation.mealDate),
        mealName: reservation.meal.name,
        mealType: LUNCH,
        quantity: reservation.quantity,
        status: delivery ? 'DELIVERED' : 'PENDING',
        deliveredAt: delivery?.requestedAt.toISOString() ?? null,
      };
    });
  }

  private summarize(items: ConsultationItem[]) {
    const totalLunches = items.reduce((total, item) => total + item.quantity, 0);
    const delivered = items
      .filter((item) => item.status === 'DELIVERED')
      .reduce((total, item) => total + item.quantity, 0);

    return {
      totalLunches,
      delivered,
      pending: totalLunches - delivered,
    };
  }

  private toEmployeeResponse(employee: { employeeCode: string; name: string }) {
    return { code: employee.employeeCode, name: employee.name };
  }

  private getCurrentDate(now: Date) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: CONSULTATION_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

    return `${values.year}-${values.month}-${values.day}`;
  }

  private getCurrentMonth() {
    return this.getCurrentDate(new Date()).slice(0, 7);
  }

  private getMonthWorkWeekRange(month: string) {
    const [year, monthNumber] = month.split('-').map(Number);
    const monthStart = new Date(Date.UTC(year, monthNumber - 1, 1));
    const monthEnd = new Date(Date.UTC(year, monthNumber, 1));
    const start = this.addDays(monthStart, (8 - monthStart.getUTCDay()) % 7);
    const lastDay = this.addDays(monthEnd, -1);
    const lastMonday = this.addDays(
      lastDay,
      -((lastDay.getUTCDay() + 6) % 7),
    );
    const end = this.addDays(lastMonday, 4);

    return { start, end };
  }

  private buildWeeklySummary(
    firstMonday: Date,
    finalFriday: Date,
    items: Array<{ date: string; quantity: number }>,
  ) {
    const weeks: Array<{ startDate: string; endDate: string; count: number }> = [];

    for (
      let cursor = new Date(firstMonday);
      cursor <= finalFriday;
      cursor = this.addDays(cursor, 7)
    ) {
      const weekEnd = this.addDays(cursor, 4);
      const startDate = this.toDateOnly(cursor);
      const endDate = this.toDateOnly(weekEnd);
      const count = items
        .filter((item) => item.date >= startDate && item.date <= endDate)
        .reduce((total, item) => total + item.quantity, 0);

      weeks.push({ startDate, endDate, count });
    }

    return weeks;
  }

  private parseDateOnly(value: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new BadRequestException('La fecha debe tener el formato YYYY-MM-DD');
    }

    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));

    if (this.toDateOnly(date) !== value) {
      throw new BadRequestException('La fecha indicada no es válida');
    }

    return date;
  }

  private addDays(date: Date, days: number) {
    const result = new Date(date);
    result.setUTCDate(result.getUTCDate() + days);
    return result;
  }

  private toDateOnly(date: Date) {
    return date.toISOString().slice(0, 10);
  }
}
