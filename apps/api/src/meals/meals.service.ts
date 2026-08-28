import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { MealRequestStatus, MealType } from './meal.constants.js';

const MEAL_TIME_ZONE = 'America/Guatemala';

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
    const reservation = await this.prisma.mealReservation.findFirst({
      where: {
        mealDate,
        mealType: MealType.LUNCH,
        OR: [
          { transferEmployeeId: employeeId },
          { employeeId, transferEmployeeId: null },
        ],
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

  getApprovedToday() {
    return this.findMealRequests({
      mealDate: this.getLocalDate(new Date()),
      status: MealRequestStatus.APPROVED,
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

  async createAvailableMealToday(name: string, actorUserId: string) {
    const normalizedName = name.trim().replace(/\s+/g, ' ');

    if (!normalizedName) {
      throw new BadRequestException('Debes indicar el nombre del almuerzo');
    }

    const availableDate = this.getLocalDate(new Date());
    const uniqueMeal = {
      name: normalizedName,
      availableDate,
      mealType: MealType.LUNCH,
    };
    const existing = await this.prisma.meal.findUnique({
      where: { name_availableDate_mealType: uniqueMeal },
    });

    if (existing) {
      const meal = existing.active
        ? existing
        : await this.prisma.$transaction(async (transaction) => {
            const reactivated = await transaction.meal.update({
              where: { id: existing.id },
              data: { active: true },
            });

            await transaction.auditLog.create({
              data: {
                entityName: 'meals',
                entityId: existing.id,
                action: 'UPDATE',
                actorUserId,
                previousValues: JSON.stringify({ active: false }),
                newValues: JSON.stringify({ active: true }),
              },
            });

            return reactivated;
          });

      return {
        status: existing.active ? ('ALREADY_EXISTS' as const) : ('REACTIVATED' as const),
        meal: this.toAvailableMeal(meal),
      };
    }

    try {
      const meal = await this.prisma.$transaction(async (transaction) => {
        const created = await transaction.meal.create({
          data: uniqueMeal,
        });

        await transaction.auditLog.create({
          data: {
            entityName: 'meals',
            entityId: created.id,
            action: 'CREATE',
            actorUserId,
            newValues: JSON.stringify({
              name: created.name,
              availableDate: this.getDateOnly(created.availableDate),
              mealType: created.mealType,
              active: created.active,
            }),
          },
        });

        return created;
      });

      return {
        status: 'CREATED' as const,
        meal: this.toAvailableMeal(meal),
      };
    } catch (error) {
      if (!this.isUniqueConflict(error)) {
        throw error;
      }

      const meal = await this.prisma.meal.findUniqueOrThrow({
        where: { name_availableDate_mealType: uniqueMeal },
      });

      return {
        status: 'ALREADY_EXISTS' as const,
        meal: this.toAvailableMeal(meal),
      };
    }
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

    const existingReservation = await this.prisma.mealReservation.findFirst({
      where: {
        mealDate,
        mealType: MealType.LUNCH,
        OR: [
          { employeeId },
          { transferEmployeeId: employeeId },
        ],
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

  async getCurrentWeeklyMenu() {
    return this.getWeeklyMenu(this.getDateOnly(this.getCurrentWorkWeek().start));
  }

  async getWeeklyMenuForAdministration(weekStart: string) {
    const week = this.getWorkWeekFromStart(weekStart);
    this.assertCurrentOrFutureWeek(week.start);
    return this.getWeeklyMenu(weekStart);
  }

  private async getWeeklyMenu(weekStart: string) {
    const week = this.getWorkWeekFromStart(weekStart);
    const [meals, storedCutoffs] = await this.prisma.$transaction([
      this.prisma.meal.findMany({
        where: {
          availableDate: { gte: week.start, lte: week.end },
          mealType: MealType.LUNCH,
          active: true,
        },
        orderBy: [{ availableDate: 'asc' }, { name: 'asc' }],
      }),
      this.prisma.mealOrderCutoff.findMany({
        where: { mealDate: { gte: week.start, lte: week.end } },
        orderBy: { mealDate: 'asc' },
      }),
    ]);

    const mealsByDate = new Map<string, typeof meals>();
    for (const meal of meals) {
      const date = this.getDateOnly(meal.availableDate);
      mealsByDate.set(date, [...(mealsByDate.get(date) ?? []), meal]);
    }

    const cutoffByDate = new Map(
      storedCutoffs.map((cutoff) => [this.getDateOnly(cutoff.mealDate), cutoff.cutoffTime]),
    );
    const fallbackCutoff = this.getDefaultOrderCutoffTime();
    const days = week.dates.map((date, index) => {
      const cutoffTime = cutoffByDate.get(date) ?? fallbackCutoff;
      const lockReason = this.getReservationLockReason(date, new Date(), cutoffTime);
      return {
        date,
        dayName: ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'][index],
        cutoffTime,
        canModify: lockReason === null,
        lockReason,
        meals: (mealsByDate.get(date) ?? []).map((meal) => this.toAvailableMeal(meal)),
      };
    });

    const uniqueCutoffs = new Set(days.map((day) => day.cutoffTime));
    const isReady = days.every((day) => day.meals.length > 0);
    const currentWeekStart = this.getCurrentWorkWeek().start;
    const publicationStatus = !isReady
      ? ('PENDING' as const)
      : week.start > currentWeekStart
        ? ('SCHEDULED' as const)
        : ('PUBLISHED' as const);
    return {
      weekStart: this.getDateOnly(week.start),
      weekEnd: this.getDateOnly(week.end),
      cutoffMode: uniqueCutoffs.size === 1 ? ('GENERAL' as const) : ('DAILY' as const),
      orderingCutoffTime: uniqueCutoffs.size === 1 ? days[0].cutoffTime : null,
      isReady,
      isPublished: publicationStatus === 'PUBLISHED',
      publicationStatus,
      activationDate: this.getDateOnly(week.start),
      days,
    };
  }

  async getCurrentWeekEmployeeReservations(employeeCode: string, now = new Date()) {
    const employee = await this.findActiveEmployee(employeeCode);
    const week = this.getCurrentWorkWeek(now);
    const reservations = await this.prisma.mealReservation.findMany({
      where: {
        employeeId: employee.employeeCode,
        mealDate: { gte: week.start, lte: week.end },
        mealType: MealType.LUNCH,
      },
      include: { meal: true },
      orderBy: { mealDate: 'asc' },
    });

    return {
      employee: {
        code: employee.employeeCode,
        name: employee.name,
        department: employee.department,
      },
      selections: reservations.map((reservation) => ({
        date: this.getDateOnly(reservation.mealDate),
        mealId: reservation.mealId,
        mealName: reservation.meal.name,
      })),
    };
  }

  async saveCurrentWeekReservations(
    employeeCode: string,
    selections: Array<{ date: string; mealId: string }>,
    now = new Date(),
  ) {
    const employee = await this.findActiveEmployee(employeeCode);
    const week = this.getCurrentWorkWeek(now);
    const validDates = new Set(week.dates);
    const selectedDates = new Set(selections.map((selection) => selection.date));

    if (selectedDates.size !== selections.length) {
      throw new BadRequestException('Solo puedes elegir una comida por día');
    }

    if (selections.some((selection) => !validDates.has(selection.date))) {
      throw new BadRequestException('Todas las selecciones deben pertenecer a la semana actual');
    }

    const availableMeals = await this.prisma.meal.findMany({
      where: {
        availableDate: { gte: week.start, lte: week.end },
        mealType: MealType.LUNCH,
        active: true,
      },
    });
    const publishedDates = new Set(
      availableMeals.map((meal) => this.getDateOnly(meal.availableDate)),
    );

    if (week.dates.some((date) => !publishedDates.has(date))) {
      throw new BadRequestException(
        'El menú semanal todavía no ha sido publicado completamente',
      );
    }

    const mealsById = new Map(availableMeals.map((meal) => [meal.id, meal]));

    for (const selection of selections) {
      const meal = mealsById.get(selection.mealId);
      if (!meal || this.getDateOnly(meal.availableDate) !== selection.date) {
        throw new BadRequestException(
          `La comida seleccionada para ${selection.date} no está disponible`,
        );
      }
    }

    const existing = await this.prisma.mealReservation.findMany({
      where: {
        employeeId: employee.employeeCode,
        mealDate: { gte: week.start, lte: week.end },
        mealType: MealType.LUNCH,
      },
      include: {
        meal: true,
        mealRequests: { select: { id: true } },
      },
    });
    const requestedByDate = new Map(
      selections.map((selection) => [selection.date, selection.mealId]),
    );
    const changingProtectedReservation = existing.find((reservation) => {
      const requestedMealId = requestedByDate.get(this.getDateOnly(reservation.mealDate));
      const isChanging = requestedMealId !== reservation.mealId;
      return isChanging &&
        (reservation.transferEmployeeId !== null || reservation.mealRequests.length > 0);
    });

    if (changingProtectedReservation) {
      throw new BadRequestException(
        `La reservación del ${this.getDateOnly(changingProtectedReservation.mealDate)} ya fue transferida o entregada y no puede modificarse`,
      );
    }

    const existingByDate = new Map(
      existing.map((reservation) => [this.getDateOnly(reservation.mealDate), reservation]),
    );
    const changedDates = new Set<string>();
    for (const reservation of existing) {
      const date = this.getDateOnly(reservation.mealDate);
      if (requestedByDate.get(date) !== reservation.mealId) changedDates.add(date);
    }
    for (const selection of selections) {
      if (!existingByDate.has(selection.date)) changedDates.add(selection.date);
    }
    const storedCutoffs = await this.prisma.mealOrderCutoff.findMany({
      where: { mealDate: { gte: week.start, lte: week.end } },
    });
    const cutoffByDate = new Map(
      storedCutoffs.map((cutoff) => [this.getDateOnly(cutoff.mealDate), cutoff.cutoffTime]),
    );
    for (const date of changedDates) {
      const lockReason = this.getReservationLockReason(
        date,
        now,
        cutoffByDate.get(date) ?? this.getDefaultOrderCutoffTime(),
      );
      if (lockReason) throw new BadRequestException(lockReason);
    }

    let created = 0;
    let updated = 0;
    let deleted = 0;

    await this.prisma.$transaction(async (transaction) => {
      for (const reservation of existing) {
        const date = this.getDateOnly(reservation.mealDate);
        const requestedMealId = requestedByDate.get(date);

        if (!requestedMealId) {
          await transaction.mealReservation.delete({ where: { id: reservation.id } });
          await transaction.auditLog.create({
            data: {
              entityName: 'meal_reservations',
              entityId: reservation.id,
              action: 'DELETE',
              actorEmployeeId: employee.employeeCode,
              previousValues: JSON.stringify({ date, mealId: reservation.mealId }),
            },
          });
          deleted += 1;
        } else if (requestedMealId !== reservation.mealId) {
          await transaction.mealReservation.update({
            where: { id: reservation.id },
            data: { mealId: requestedMealId, quantity: 1 },
          });
          await transaction.auditLog.create({
            data: {
              entityName: 'meal_reservations',
              entityId: reservation.id,
              action: 'UPDATE',
              actorEmployeeId: employee.employeeCode,
              previousValues: JSON.stringify({ date, mealId: reservation.mealId }),
              newValues: JSON.stringify({ date, mealId: requestedMealId, quantity: 1 }),
            },
          });
          updated += 1;
        }
      }

      const existingDates = new Set(
        existing.map((reservation) => this.getDateOnly(reservation.mealDate)),
      );
      for (const selection of selections) {
        if (existingDates.has(selection.date)) continue;
        const reservation = await transaction.mealReservation.create({
          data: {
            employeeId: employee.employeeCode,
            mealId: selection.mealId,
            mealDate: new Date(`${selection.date}T00:00:00.000Z`),
            mealType: MealType.LUNCH,
            quantity: 1,
          },
        });
        await transaction.auditLog.create({
          data: {
            entityName: 'meal_reservations',
            entityId: reservation.id,
            action: 'CREATE',
            actorEmployeeId: employee.employeeCode,
            newValues: JSON.stringify({
              date: selection.date,
              mealId: selection.mealId,
              quantity: 1,
            }),
          },
        });
        created += 1;
      }
    });

    const saved = await this.getCurrentWeekEmployeeReservations(employee.employeeCode, now);
    return {
      status: 'SAVED' as const,
      ...saved,
      changes: { created, updated, deleted },
    };
  }

  async saveCurrentWeeklyMenu(
    days: Array<{ date: string; meals: string[] }>,
    actorUserId: string,
  ) {
    const weekStart = this.getDateOnly(this.getCurrentWorkWeek().start);
    return this.saveWeeklyMenu(weekStart, days, actorUserId);
  }

  async saveWeeklyMenu(
    weekStart: string,
    days: Array<{ date: string; meals: string[] }>,
    actorUserId: string,
  ) {
    const week = this.getWorkWeekFromStart(weekStart);
    this.assertCurrentOrFutureWeek(week.start);
    const validDates = new Set(week.dates);
    const receivedDates = new Set(days.map((day) => day.date));

    if (
      receivedDates.size !== 5 ||
      days.some((day) => !validDates.has(day.date)) ||
      week.dates.some((date) => !receivedDates.has(date))
    ) {
      throw new BadRequestException('Debes configurar exactamente los cinco días de la semana seleccionada');
    }

    const normalizedDays = days.map((day) => {
      const meals = day.meals.map((name) => name.trim().replace(/\s+/g, ' '));
      if (meals.some((name) => !name)) {
        throw new BadRequestException(`Hay un nombre de comida vacío para ${day.date}`);
      }
      if (new Set(meals.map((name) => name.toLocaleUpperCase('es'))).size !== meals.length) {
        throw new BadRequestException(`Hay comidas repetidas para ${day.date}`);
      }
      return { date: day.date, meals };
    });
    const requestedKeys = new Set(
      normalizedDays.flatMap((day) =>
        day.meals.map((name) => `${day.date}|${name.toLocaleUpperCase('es')}`),
      ),
    );
    const existingMeals = await this.prisma.meal.findMany({
      where: {
        availableDate: { gte: week.start, lte: week.end },
        mealType: MealType.LUNCH,
      },
      include: { _count: { select: { mealReservations: true } } },
    });
    const removedWithReservations = existingMeals.filter(
      (meal) =>
        meal.active &&
        !requestedKeys.has(
          `${this.getDateOnly(meal.availableDate)}|${meal.name.toLocaleUpperCase('es')}`,
        ) &&
        meal._count.mealReservations > 0,
    );

    if (removedWithReservations.length > 0) {
      const names = removedWithReservations.slice(0, 3).map((meal) => meal.name).join(', ');
      throw new BadRequestException(
        `No puedes quitar comidas que ya tienen reservaciones: ${names}`,
      );
    }

    await this.prisma.$transaction(async (transaction) => {
      for (const meal of existingMeals) {
        const key = `${this.getDateOnly(meal.availableDate)}|${meal.name.toLocaleUpperCase('es')}`;
        if (meal.active && !requestedKeys.has(key)) {
          await transaction.meal.update({
            where: { id: meal.id },
            data: { active: false },
          });
        }
      }

      for (const day of normalizedDays) {
        const availableDate = new Date(`${day.date}T00:00:00.000Z`);
        for (const name of day.meals) {
          await transaction.meal.upsert({
            where: {
              name_availableDate_mealType: {
                name,
                availableDate,
                mealType: MealType.LUNCH,
              },
            },
            update: { name, active: true },
            create: { name, availableDate, mealType: MealType.LUNCH },
          });
        }
      }

      await transaction.auditLog.create({
        data: {
          entityName: 'weekly_menus',
          entityId: this.getDateOnly(week.start),
          action: 'UPDATE',
          actorUserId,
          newValues: JSON.stringify(normalizedDays),
        },
      });
    });

    return this.getWeeklyMenu(weekStart);
  }

  async saveWeeklyCutoffs(
    weekStart: string,
    configuration: {
      mode: 'GENERAL' | 'DAILY';
      generalTime?: string;
      days?: Array<{ date: string; cutoffTime: string }>;
    },
    actorUserId: string,
  ) {
    const week = this.getWorkWeekFromStart(weekStart);
    this.assertCurrentOrFutureWeek(week.start);
    let cutoffs: Array<{ date: string; cutoffTime: string }>;

    if (configuration.mode === 'GENERAL') {
      if (!configuration.generalTime || !this.isValidTime(configuration.generalTime)) {
        throw new BadRequestException('Debes indicar un horario general válido');
      }
      cutoffs = week.dates.map((date) => ({
        date,
        cutoffTime: configuration.generalTime!,
      }));
    } else {
      const receivedDays = configuration.days ?? [];
      const receivedDates = new Set(receivedDays.map((day) => day.date));
      if (
        receivedDates.size !== 5 ||
        receivedDays.some(
          (day) => !week.dates.includes(day.date) || !this.isValidTime(day.cutoffTime),
        ) ||
        week.dates.some((date) => !receivedDates.has(date))
      ) {
        throw new BadRequestException(
          'Debes indicar un horario válido para cada día de la semana',
        );
      }
      cutoffs = week.dates.map((date) => receivedDays.find((day) => day.date === date)!);
    }

    await this.prisma.$transaction(async (transaction) => {
      for (const cutoff of cutoffs) {
        const mealDate = new Date(`${cutoff.date}T00:00:00.000Z`);
        await transaction.mealOrderCutoff.upsert({
          where: { mealDate },
          update: { cutoffTime: cutoff.cutoffTime },
          create: { mealDate, cutoffTime: cutoff.cutoffTime },
        });
      }
      await transaction.auditLog.create({
        data: {
          entityName: 'weekly_cutoffs',
          entityId: weekStart,
          action: 'UPDATE',
          actorUserId,
          newValues: JSON.stringify({ mode: configuration.mode, cutoffs }),
        },
      });
    });

    return this.getWeeklyMenu(weekStart);
  }

  async getWeeklyOrderSummary(weekStart: string) {
    const week = this.getWorkWeekFromStart(weekStart);
    const [meals, totals, storedCutoffs] = await this.prisma.$transaction([
      this.prisma.meal.findMany({
        where: {
          availableDate: { gte: week.start, lte: week.end },
          mealType: MealType.LUNCH,
          OR: [
            { active: true },
            { mealReservations: { some: {} } },
          ],
        },
        orderBy: [{ availableDate: 'asc' }, { name: 'asc' }],
      }),
      this.prisma.mealReservation.groupBy({
        by: ['mealId', 'mealDate'],
        where: {
          mealDate: { gte: week.start, lte: week.end },
          mealType: MealType.LUNCH,
        },
        _sum: { quantity: true },
      }),
      this.prisma.mealOrderCutoff.findMany({
        where: { mealDate: { gte: week.start, lte: week.end } },
      }),
    ]);
    const totalsByMeal = new Map(
      totals.map((total) => [total.mealId, total._sum.quantity ?? 0]),
    );
    const cutoffByDate = new Map(
      storedCutoffs.map((cutoff) => [this.getDateOnly(cutoff.mealDate), cutoff.cutoffTime]),
    );
    const fallbackCutoff = this.getDefaultOrderCutoffTime();
    const days = week.dates.map((date, index) => {
      const dayMeals = meals
        .filter((meal) => this.getDateOnly(meal.availableDate) === date)
        .map((meal) => ({
          mealId: meal.id,
          name: meal.name,
          total: totalsByMeal.get(meal.id) ?? 0,
        }));
      const cutoffTime = cutoffByDate.get(date) ?? fallbackCutoff;
      const total = dayMeals.reduce((sum, meal) => sum + meal.total, 0);
      const lockReason = this.getReservationLockReason(date, new Date(), cutoffTime);

      return {
        date,
        dayName: ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'][index],
        cutoffTime,
        isClosed: lockReason !== null,
        lockReason,
        total,
        meals: dayMeals,
      };
    });

    return {
      weekStart,
      weekEnd: this.getDateOnly(week.end),
      totalReservations: days.reduce((sum, day) => sum + day.total, 0),
      days,
    };
  }

  async getPendingToday(employeeCode?: string, now = new Date()) {
    const mealDate = this.getLocalDate(now);
    const normalizedEmployeeCode = employeeCode?.trim();
    const reservations = await this.prisma.mealReservation.findMany({
      where: {
        mealDate,
        ...(normalizedEmployeeCode
          ? {
              OR: [
                { transferEmployeeId: normalizedEmployeeCode },
                {
                  employeeId: normalizedEmployeeCode,
                  transferEmployeeId: null,
                },
              ],
            }
          : {}),
        mealRequests: {
          none: { status: MealRequestStatus.APPROVED },
        },
      },
      include: { employee: true, transferEmployee: true, meal: true },
      orderBy: [{ employee: { name: 'asc' } }, { mealType: 'asc' }],
    });

    return reservations.map((reservation) => {
      const beneficiary = reservation.transferEmployee ?? reservation.employee;

      return {
        employeeCode: beneficiary.employeeCode,
        name: beneficiary.name,
        department: beneficiary.department,
        meal: reservation.meal.name,
      };
    }).sort((left, right) =>
      left.department.localeCompare(right.department, 'es', { sensitivity: 'base' }) ||
      left.name.localeCompare(right.name, 'es', { sensitivity: 'base' }) ||
      left.employeeCode.localeCompare(right.employeeCode, 'es', { sensitivity: 'base' }),
    );
  }

  async getTodaySummary(now = new Date()) {
    const { mealDate, cutoffTime, isClosed } = await this.getTodayCutoffState(now);
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
      cutoffTime,
      exportAvailable: isClosed,
    };
  }

  async exportPendingToday(now = new Date()) {
    const { mealDate, date, cutoffTime, isClosed } = await this.getTodayCutoffState(now);
    if (!isClosed) {
      throw new BadRequestException(
        `La exportación estará disponible después del cierre de las ${cutoffTime}`,
      );
    }

    const [pending, availableMeals] = await Promise.all([
      this.getPendingToday(undefined, now),
      this.prisma.meal.findMany({
        where: {
          availableDate: mealDate,
          mealType: MealType.LUNCH,
          active: true,
        },
        select: { name: true },
        orderBy: { name: 'asc' },
      }),
    ]);
    const countsByMeal = new Map<string, number>();
    pending.forEach((item) => {
      countsByMeal.set(item.meal, (countsByMeal.get(item.meal) ?? 0) + 1);
    });
    const mealNames = Array.from(
      new Set([
        ...availableMeals.map((meal) => meal.name),
        ...countsByMeal.keys(),
      ]),
    );
    const mealTotals = mealNames
      .map((name) => ({ name, quantity: countsByMeal.get(name) ?? 0 }))
      .sort(
        (left, right) =>
          right.quantity - left.quantity ||
          left.name.localeCompare(right.name, 'es', { sensitivity: 'base' }),
      );
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Comedor Fasani';
    workbook.created = now;
    workbook.modified = now;

    const worksheet = workbook.addWorksheet('Pendientes', {
      views: [{ state: 'frozen', ySplit: 2, showGridLines: false }],
      pageSetup: {
        orientation: 'landscape',
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        margins: { left: 0.3, right: 0.3, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
      },
    });
    worksheet.columns = [
      { key: 'employeeCode', width: 18 },
      { key: 'name', width: 38 },
      { key: 'department', width: 28 },
      { key: 'meal', width: 42 },
    ];

    worksheet.mergeCells('A1:C1');
    const titleCell = worksheet.getCell('A1');
    titleCell.value = 'COMIDAS PENDIENTES DE ENTREGA';
    titleCell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 15 };
    titleCell.alignment = { horizontal: 'left', vertical: 'middle' };
    const titleDateCell = worksheet.getCell('D1');
    titleDateCell.value = mealDate;
    titleDateCell.numFmt = 'dddd d "de" mmmm "de" yyyy';
    titleDateCell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    titleDateCell.alignment = { horizontal: 'right', vertical: 'middle' };
    for (let column = 1; column <= 4; column += 1) {
      worksheet.getCell(1, column).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF073B3A' },
      };
    }
    worksheet.getRow(1).height = 32;

    const headerRow = worksheet.getRow(2);
    headerRow.values = ['Código', 'Nombre del empleado', 'Departamento', 'Comida solicitada'];
    headerRow.height = 24;
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.alignment = { horizontal: 'left', vertical: 'middle' };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF009C95' } };
      cell.border = {
        bottom: { style: 'medium', color: { argb: 'FF087F79' } },
      };
    });

    let previousDepartment = '';
    let departmentGroup = -1;
    pending.forEach((item, index) => {
      const department = item.department.trim() || 'Sin departamento';
      const isNewDepartment =
        index === 0 ||
        department.localeCompare(previousDepartment, 'es', {
          sensitivity: 'base',
        }) !== 0;
      if (isNewDepartment) {
        departmentGroup += 1;
        previousDepartment = department;
      }
      const row = worksheet.addRow({
        employeeCode: item.employeeCode,
        name: item.name,
        department,
        meal: item.meal,
      });
      row.height = 22;
      row.eachCell((cell, columnNumber) => {
        cell.alignment = {
          horizontal: 'left',
          vertical: 'middle',
          wrapText: columnNumber === 4,
        };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: {
            argb: departmentGroup % 2 === 0 ? 'FFF2FAF9' : 'FFFFFFFF',
          },
        };
        cell.border = {
          ...(isNewDepartment
            ? { top: { style: 'medium' as const, color: { argb: 'FF7CC8C3' } } }
            : {}),
          bottom: { style: 'hair', color: { argb: 'FFD5E8E6' } },
        };
      });
      row.getCell(3).font = { bold: isNewDepartment, color: { argb: 'FF075D59' } };
    });

    worksheet.autoFilter = { from: 'A2', to: 'D2' };
    const finalRow = Math.max(2, worksheet.rowCount);
    worksheet.getColumn(1).numFmt = '@';
    worksheet.getColumn(4).alignment = { wrapText: true };
    worksheet.pageSetup.printArea = `A1:D${finalRow}`;
    worksheet.headerFooter.oddFooter = `Pendientes del ${date} · Página &P de &N`;

    const summarySheet = workbook.addWorksheet('Resumen del día', {
      views: [{ state: 'frozen', ySplit: 6, showGridLines: false }],
      pageSetup: {
        orientation: 'portrait',
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 1,
        margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
      },
    });
    summarySheet.columns = [
      { width: 42 },
      { width: 14 },
      { width: 16 },
      { width: 30 },
    ];
    summarySheet.mergeCells('A1:C1');
    const summaryTitle = summarySheet.getCell('A1');
    summaryTitle.value = 'RESUMEN DE PRODUCCIÓN';
    summaryTitle.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 15 };
    summaryTitle.alignment = { horizontal: 'left', vertical: 'middle' };
    const summaryDate = summarySheet.getCell('D1');
    summaryDate.value = mealDate;
    summaryDate.numFmt = 'dddd d "de" mmmm "de" yyyy';
    summaryDate.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    summaryDate.alignment = { horizontal: 'right', vertical: 'middle' };
    for (let column = 1; column <= 4; column += 1) {
      summarySheet.getCell(1, column).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF073B3A' },
      };
    }
    summarySheet.getRow(1).height = 32;
    summarySheet.getRow(2).height = 8;

    summarySheet.mergeCells('A3:C3');
    const totalLabel = summarySheet.getCell('A3');
    totalLabel.value = 'TOTAL DE PLATOS PENDIENTES';
    totalLabel.font = { bold: true, color: { argb: 'FF075D59' }, size: 12 };
    totalLabel.alignment = { horizontal: 'left', vertical: 'middle' };
    totalLabel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDDF3F1' } };
    const totalValue = summarySheet.getCell('D3');
    totalValue.value = pending.length;
    totalValue.numFmt = '#,##0';
    totalValue.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 18 };
    totalValue.alignment = { horizontal: 'center', vertical: 'middle' };
    totalValue.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF009C95' } };
    summarySheet.getRow(3).height = 34;
    summarySheet.getRow(4).height = 8;

    summarySheet.mergeCells('A5:D5');
    const sectionTitle = summarySheet.getCell('A5');
    sectionTitle.value = 'CANTIDADES POR COMIDA';
    sectionTitle.font = { bold: true, color: { argb: 'FF075D59' }, size: 11 };
    sectionTitle.alignment = { horizontal: 'left', vertical: 'middle' };
    sectionTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAF7F6' } };
    summarySheet.getRow(5).height = 24;

    const summaryHeader = summarySheet.getRow(6);
    summaryHeader.values = ['Comida', 'Cantidad', '% del total', 'Distribución'];
    summaryHeader.height = 24;
    summaryHeader.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.alignment = { horizontal: 'left', vertical: 'middle' };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF009C95' } };
      cell.border = { bottom: { style: 'medium', color: { argb: 'FF087F79' } } };
    });

    const maxQuantity = Math.max(0, ...mealTotals.map((meal) => meal.quantity));
    const firstSummaryRow = 7;
    const lastSummaryRow = firstSummaryRow + mealTotals.length - 1;
    if (mealTotals.length === 0) {
      summarySheet.mergeCells('A7:D7');
      const emptyCell = summarySheet.getCell('A7');
      emptyCell.value = 'No hay opciones de comida disponibles para este día';
      emptyCell.font = { italic: true, color: { argb: 'FF64748B' } };
      emptyCell.alignment = { horizontal: 'center', vertical: 'middle' };
      emptyCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
      summarySheet.getRow(7).height = 28;
    } else {
      mealTotals.forEach((meal, index) => {
        const rowNumber = firstSummaryRow + index;
        const barLength =
          maxQuantity === 0 ? 0 : Math.round((meal.quantity / maxQuantity) * 20);
        const row = summarySheet.getRow(rowNumber);
        row.values = [meal.name, meal.quantity];
        row.getCell(3).value = {
          formula: `IF($D$3=0,0,B${rowNumber}/$D$3)`,
          result: pending.length === 0 ? 0 : meal.quantity / pending.length,
        };
        row.getCell(3).numFmt = '0%';
        row.getCell(4).value = {
          formula: `IF(MAX($B$${firstSummaryRow}:$B$${lastSummaryRow})=0,"",REPT("■",ROUND(B${rowNumber}/MAX($B$${firstSummaryRow}:$B$${lastSummaryRow})*20,0)))`,
          result: '■'.repeat(barLength),
        };
        row.height = 24;
        row.eachCell((cell, columnNumber) => {
          cell.alignment = {
            horizontal: columnNumber === 1 || columnNumber === 4 ? 'left' : 'center',
            vertical: 'middle',
            wrapText: columnNumber === 1,
          };
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: index % 2 === 0 ? 'FFF2FAF9' : 'FFFFFFFF' },
          };
          cell.border = { bottom: { style: 'hair', color: { argb: 'FFD5E8E6' } } };
        });
        row.getCell(2).font = { bold: true, color: { argb: 'FF075D59' }, size: 12 };
        row.getCell(4).font = { bold: true, color: { argb: 'FF009C95' } };
      });
    }

    const summaryFinalRow = Math.max(7, summarySheet.rowCount);
    summarySheet.autoFilter = { from: 'A6', to: 'D6' };
    summarySheet.pageSetup.printArea = `A1:D${summaryFinalRow}`;
    summarySheet.headerFooter.oddFooter = `Resumen del ${date} · Página &P de &N`;

    const content = await workbook.xlsx.writeBuffer();
    return {
      fileName: `pendientes-comida-${date}.xlsx`,
      buffer: Buffer.from(content),
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

  private toAvailableMeal(meal: {
    id: string;
    name: string;
    availableDate: Date;
    mealType: string;
  }) {
    return {
      id: meal.id,
      name: meal.name,
      date: this.getDateOnly(meal.availableDate),
      mealType: meal.mealType,
    };
  }

  private async findActiveEmployee(employeeCode: string) {
    const normalizedCode = employeeCode.trim();
    const employee = await this.prisma.employee.findUnique({
      where: { employeeCode: normalizedCode },
    });

    if (!employee) {
      throw new NotFoundException('No encontramos un empleado con ese código');
    }
    if (!employee.active) {
      throw new BadRequestException('El empleado está inactivo y no puede encargar comida');
    }
    return employee;
  }

  private getCurrentWorkWeek(date = new Date()) {
    const localDate = this.getLocalDate(date);
    const day = localDate.getUTCDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    const start = new Date(localDate);
    start.setUTCDate(start.getUTCDate() + mondayOffset);
    const end = new Date(start);
    end.setUTCDate(start.getUTCDate() + 4);
    const dates = Array.from({ length: 5 }, (_, index) => {
      const current = new Date(start);
      current.setUTCDate(start.getUTCDate() + index);
      return this.getDateOnly(current);
    });

    return { start, end, dates };
  }

  private getWorkWeekFromStart(value: string) {
    const start = new Date(`${value}T00:00:00.000Z`);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      Number.isNaN(start.getTime()) ||
      this.getDateOnly(start) !== value ||
      start.getUTCDay() !== 1
    ) {
      throw new BadRequestException('La semana debe comenzar en un lunes válido');
    }
    const end = new Date(start);
    end.setUTCDate(start.getUTCDate() + 4);
    const dates = Array.from({ length: 5 }, (_, index) => {
      const current = new Date(start);
      current.setUTCDate(start.getUTCDate() + index);
      return this.getDateOnly(current);
    });
    return { start, end, dates };
  }

  private assertCurrentOrFutureWeek(weekStart: Date) {
    const currentWeekStart = this.getCurrentWorkWeek().start;
    if (weekStart < currentWeekStart) {
      throw new BadRequestException('No se puede modificar el menú de una semana anterior');
    }
  }

  private async getTodayCutoffState(now: Date) {
    const mealDate = this.getLocalDate(now);
    const date = this.getDateOnly(mealDate);
    const storedCutoff = await this.prisma.mealOrderCutoff.findUnique({
      where: { mealDate },
      select: { cutoffTime: true },
    });
    const cutoffTime = storedCutoff?.cutoffTime ?? this.getDefaultOrderCutoffTime();

    return {
      mealDate,
      date,
      cutoffTime,
      isClosed: this.getReservationLockReason(date, now, cutoffTime) !== null,
    };
  }

  private getDefaultOrderCutoffTime() {
    const configured = process.env.MEAL_ORDER_CUTOFF_TIME?.trim() ?? '';
    return this.isValidTime(configured) ? configured : '08:00';
  }

  private isValidTime(value: string) {
    return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
  }

  private getReservationLockReason(
    date: string,
    now = new Date(),
    cutoffTime = this.getDefaultOrderCutoffTime(),
  ) {
    const today = this.getDateOnly(this.getLocalDate(now));
    if (date < today) {
      return `La reservación del ${date} pertenece a un día anterior y ya no puede modificarse`;
    }
    if (date > today) return null;

    const [cutoffHour, cutoffMinute] = cutoffTime.split(':').map(Number);
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: MEAL_TIME_ZONE,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(now);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    const currentMinutes = Number(values.hour) * 60 + Number(values.minute);
    const cutoffMinutes = cutoffHour * 60 + cutoffMinute;

    return currentMinutes >= cutoffMinutes
      ? `El horario para cambiar la comida de hoy cerró a las ${cutoffTime}`
      : null;
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
