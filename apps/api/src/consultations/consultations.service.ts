import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

const CONSULTATION_TIME_ZONE = 'America/Guatemala';
const LUNCH = 'LUNCH';
const APPROVED = 'APPROVED';

@Injectable()
export class ConsultationsService {
  constructor(private readonly prisma: PrismaService) {}

  async getMonthlySummary(employeeCode: string, requestedMonth?: string) {
    const normalizedCode = employeeCode.trim();

    if (!normalizedCode || normalizedCode.length > 50) {
      throw new BadRequestException('Código de empleado inválido');
    }

    const currentMonth = this.getCurrentMonth();
    const month = requestedMonth ?? currentMonth;

    if (month > currentMonth) {
      throw new BadRequestException('No se pueden consultar meses futuros');
    }

    const employee = await this.prisma.employee.findUnique({
      where: { employeeCode: normalizedCode },
      select: { employeeCode: true, name: true },
    });

    if (!employee) {
      throw new NotFoundException('No se encontró información para ese código');
    }

    const { start, end } = this.getMonthRange(month);
    const reservations = await this.prisma.mealReservation.findMany({
      where: {
        employeeId: normalizedCode,
        mealType: LUNCH,
        mealDate: { gte: start, lt: end },
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

    const items = reservations.map((reservation) => {
      const delivery = reservation.mealRequests[0];

      return {
        id: reservation.id,
        date: this.toDateOnly(reservation.mealDate),
        mealName: reservation.meal.name,
        mealType: reservation.mealType,
        quantity: reservation.quantity,
        status: delivery ? ('DELIVERED' as const) : ('PENDING' as const),
        deliveredAt: delivery?.requestedAt.toISOString() ?? null,
      };
    });

    const totalLunches = items.reduce((total, item) => total + item.quantity, 0);
    const delivered = items
      .filter((item) => item.status === 'DELIVERED')
      .reduce((total, item) => total + item.quantity, 0);

    return {
      employee: {
        code: employee.employeeCode,
        name: employee.name,
      },
      month,
      currentMonth,
      summary: {
        totalLunches,
        delivered,
        pending: totalLunches - delivered,
      },
      weeks: this.buildWeeklySummary(start, end, items),
      items,
    };
  }

  private getCurrentMonth() {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: CONSULTATION_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
    }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

    return `${values.year}-${values.month}`;
  }

  private getMonthRange(month: string) {
    const [year, monthNumber] = month.split('-').map(Number);

    return {
      start: new Date(Date.UTC(year, monthNumber - 1, 1)),
      end: new Date(Date.UTC(year, monthNumber, 1)),
    };
  }

  private buildWeeklySummary(
    monthStart: Date,
    monthEnd: Date,
    items: Array<{ date: string; quantity: number }>,
  ) {
    const weeks: Array<{
      startDate: string;
      endDate: string;
      count: number;
    }> = [];
    let cursor = new Date(monthStart);

    while (cursor < monthEnd) {
      const day = cursor.getUTCDay();
      const daysSinceMonday = day === 0 ? 6 : day - 1;
      const calendarWeekStart = new Date(cursor);
      calendarWeekStart.setUTCDate(cursor.getUTCDate() - daysSinceMonday);
      const nextCalendarWeek = new Date(calendarWeekStart);
      nextCalendarWeek.setUTCDate(calendarWeekStart.getUTCDate() + 7);
      const displayStart = calendarWeekStart < monthStart
        ? new Date(monthStart)
        : calendarWeekStart;
      const displayEndExclusive = nextCalendarWeek > monthEnd
        ? new Date(monthEnd)
        : nextCalendarWeek;
      const displayEnd = new Date(displayEndExclusive);
      displayEnd.setUTCDate(displayEnd.getUTCDate() - 1);
      const startDate = this.toDateOnly(displayStart);
      const endDate = this.toDateOnly(displayEnd);
      const count = items
        .filter((item) => item.date >= startDate && item.date <= endDate)
        .reduce((total, item) => total + item.quantity, 0);

      weeks.push({ startDate, endDate, count });
      cursor = nextCalendarWeek;
    }

    return weeks;
  }

  private toDateOnly(date: Date) {
    return date.toISOString().slice(0, 10);
  }
}
