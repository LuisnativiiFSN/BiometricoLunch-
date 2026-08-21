import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { MealRequestStatus, MealType } from './meal.constants.js';

const MEAL_TIME_ZONE = 'America/El_Salvador';

@Injectable()
export class MealsService {
  constructor(private readonly prisma: PrismaService) {}

  async requestLunch(employeeId: string) {
    const employee = await this.prisma.employee.findUnique({
      where: { employeeCode: employeeId },
    });

    if (!employee) {
      return {
        status: 'EMPLOYEE_NOT_FOUND' as const,
      };
    }

    const employeePayload = {
      code: employee.employeeCode,
      name: employee.name,
    };

    if (!employee.active) {
      return {
        status: 'EMPLOYEE_INACTIVE' as const,
        employee: employeePayload,
      };
    }

    const now = new Date();
    const mealDate = this.getLocalDate(now);
    const reservation = await this.prisma.mealReservation.findUnique({
      where: {
        employeeId_mealDate_mealType: {
          employeeId,
          mealDate,
          mealType: MealType.LUNCH,
        },
      },
      include: { meal: true },
    });

    if (!reservation) {
      return {
        status: 'NO_MEAL_RESERVED' as const,
        employee: employeePayload,
      };
    }

    try {
      const approvedRequest = await this.prisma.mealRequest.create({
        data: {
          employeeId,
          mealReservationId: reservation.id,
          mealDate,
          mealType: MealType.LUNCH,
          requestedAt: now,
          status: MealRequestStatus.APPROVED,
        },
      });

      return {
        status: MealRequestStatus.APPROVED,
        employee: employeePayload,
        meal: {
          date: this.getDateOnly(reservation.mealDate),
          type: reservation.mealType,
          name: reservation.meal.name,
        },
        requestedAt: this.getLocalDateTime(approvedRequest.requestedAt),
      };
    } catch (error) {
      if (!this.isApprovedMealConflict(error)) {
        throw error;
      }
    }

    const previousRequest = await this.prisma.mealRequest.findFirstOrThrow({
      where: {
        employeeId,
        mealDate,
        mealType: MealType.LUNCH,
        status: MealRequestStatus.APPROVED,
      },
      include: { mealReservation: { include: { meal: true } } },
      orderBy: { requestedAt: 'asc' },
    });

    await this.prisma.mealRequest.create({
      data: {
        employeeId,
        mealReservationId: reservation.id,
        mealDate,
        mealType: MealType.LUNCH,
        requestedAt: now,
        status: MealRequestStatus.DUPLICATE,
      },
    });

    return {
      status: MealRequestStatus.DUPLICATE,
      employee: employeePayload,
      meal: {
        name:
          previousRequest.mealReservation?.meal.name ?? reservation.meal.name,
      },
      previousRequest: {
        time: this.getLocalTime(previousRequest.requestedAt),
      },
    };
  }

  getToday() {
    return this.findMealRequests({
      mealDate: this.getLocalDate(new Date()),
    });
  }

  getHistory() {
    return this.findMealRequests();
  }

  getDelivered() {
    return this.findMealRequests({ status: MealRequestStatus.APPROVED });
  }

  async getAvailableMealsToday() {
    const mealDate = this.getLocalDate(new Date());
    const meals = await this.prisma.meal.findMany({
      where: {
        availableDate: mealDate,
        mealType: MealType.LUNCH,
        active: true,
      },
      orderBy: { name: 'asc' },
    });

    return meals.map((meal) => ({
      id: meal.id,
      name: meal.name,
      date: this.getDateOnly(meal.availableDate),
      mealType: meal.mealType,
    }));
  }

  async createManualReservation(employeeId: string, mealId: string) {
    const employee = await this.prisma.employee.findUnique({
      where: { employeeCode: employeeId },
    });

    if (!employee) {
      throw new NotFoundException('Empleado no encontrado');
    }

    if (!employee.active) {
      throw new BadRequestException(
        'No se puede solicitar comida para un empleado inactivo',
      );
    }

    const mealDate = this.getLocalDate(new Date());
    const meal = await this.prisma.meal.findFirst({
      where: {
        id: mealId,
        availableDate: mealDate,
        mealType: MealType.LUNCH,
        active: true,
      },
    });

    if (!meal) {
      throw new BadRequestException(
        'La comida seleccionada no está disponible para el almuerzo de hoy',
      );
    }

    const existingReservation = await this.prisma.mealReservation.findUnique({
      where: {
        employeeId_mealDate_mealType: {
          employeeId,
          mealDate,
          mealType: MealType.LUNCH,
        },
      },
      include: { meal: true },
    });

    if (existingReservation) {
      return {
        status: 'ALREADY_EXISTS' as const,
        employee: {
          code: employee.employeeCode,
          name: employee.name,
        },
        reservation: {
          date: this.getDateOnly(existingReservation.mealDate),
          mealId: existingReservation.mealId,
          mealName: existingReservation.meal.name,
          quantity: existingReservation.quantity,
        },
      };
    }

    let reservation;

    try {
      reservation = await this.prisma.mealReservation.create({
        data: {
          employeeId,
          mealId: meal.id,
          mealDate,
          mealType: MealType.LUNCH,
        },
        include: { meal: true },
      });
    } catch (error) {
      if (!this.isUniqueConflict(error)) {
        throw error;
      }

      reservation = await this.prisma.mealReservation.findUniqueOrThrow({
        where: {
          employeeId_mealDate_mealType: {
            employeeId,
            mealDate,
            mealType: MealType.LUNCH,
          },
        },
        include: { meal: true },
      });

      return {
        status: 'ALREADY_EXISTS' as const,
        employee: {
          code: employee.employeeCode,
          name: employee.name,
        },
        reservation: {
          date: this.getDateOnly(reservation.mealDate),
          mealId: reservation.mealId,
          mealName: reservation.meal.name,
          quantity: reservation.quantity,
        },
      };
    }

    return {
      status: 'CREATED' as const,
      employee: {
        code: employee.employeeCode,
        name: employee.name,
      },
      reservation: {
        date: this.getDateOnly(reservation.mealDate),
        mealId: reservation.mealId,
        mealName: reservation.meal.name,
        quantity: reservation.quantity,
      },
    };
  }

  async getPendingToday() {
    const mealDate = this.getLocalDate(new Date());
    const reservations = await this.prisma.mealReservation.findMany({
      where: {
        mealDate,
        mealRequests: {
          none: { status: MealRequestStatus.APPROVED },
        },
      },
      include: { employee: true, meal: true },
      orderBy: [{ employee: { name: 'asc' } }, { mealType: 'asc' }],
    });

    return reservations.map((reservation) => ({
      employeeCode: reservation.employee.employeeCode,
      name: reservation.employee.name,
      meal: reservation.meal.name,
    }));
  }

  async getTodaySummary() {
    const mealDate = this.getLocalDate(new Date());
    const [reserved, collected, duplicateAttempts] =
      await this.prisma.$transaction([
        this.prisma.mealReservation.count({ where: { mealDate } }),
        this.prisma.mealReservation.count({
          where: {
            mealDate,
            mealRequests: {
              some: { status: MealRequestStatus.APPROVED },
            },
          },
        }),
        this.prisma.mealRequest.count({
          where: {
            mealDate,
            status: MealRequestStatus.DUPLICATE,
          },
        }),
      ]);

    return {
      reserved,
      collected,
      pending: reserved - collected,
      duplicateAttempts,
    };
  }

  private async findMealRequests(where: Prisma.MealRequestWhereInput = {}) {
    const requests = await this.prisma.mealRequest.findMany({
      where,
      include: {
        employee: true,
        mealReservation: { include: { meal: true } },
      },
      orderBy: { requestedAt: 'desc' },
      take: 200,
    });

    return requests.map((request) => ({
      id: request.id,
      employeeCode: request.employee.employeeCode,
      employeeName: request.employee.name,
      mealName: request.mealReservation?.meal.name ?? null,
      date: this.getDateOnly(request.mealDate),
      time: this.getLocalTime(request.requestedAt),
      status: request.status,
    }));
  }

  private getLocalDate(date: Date) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: MEAL_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

    return new Date(
      Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day)),
    );
  }

  private getLocalTime(date: Date) {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: MEAL_TIME_ZONE,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).format(date);
  }

  private getDateOnly(date: Date) {
    return date.toISOString().slice(0, 10);
  }

  private getLocalDateTime(date: Date) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: MEAL_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

    return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}:${values.second}`;
  }

  private isApprovedMealConflict(error: unknown) {
    return (
      this.isUniqueConflict(error)
    );
  }

  private isUniqueConflict(error: unknown) {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }
}
