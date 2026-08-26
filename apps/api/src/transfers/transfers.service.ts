import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

const LUNCH = 'LUNCH';
const APPROVED = 'APPROVED';
const TIME_ZONE = 'America/Guatemala';

@Injectable()
export class TransfersService {
  constructor(private readonly prisma: PrismaService) {}

  async getTransferableReservations(employeeCode: string) {
    const normalizedCode = employeeCode.trim();

    if (!normalizedCode || normalizedCode.length > 50) {
      throw new BadRequestException('Código de empleado inválido');
    }

    const employee = await this.prisma.employee.findUnique({
      where: { employeeCode: normalizedCode },
      select: { employeeCode: true, name: true, active: true },
    });

    if (!employee) {
      throw new NotFoundException('El empleado de origen no existe');
    }

    const reservations = await this.prisma.mealReservation.findMany({
      where: {
        employeeId: normalizedCode,
        transferEmployeeId: null,
        mealDate: { gte: this.getLocalDate(new Date()) },
        mealRequests: {
          none: { status: APPROVED },
        },
      },
      include: { meal: true },
      orderBy: [{ mealDate: 'asc' }, { meal: { name: 'asc' } }],
    });

    return {
      employee,
      reservations: reservations.map((reservation) => ({
        id: reservation.id,
        date: this.toDateOnly(reservation.mealDate),
        meal: reservation.meal.name,
        mealType: reservation.mealType,
        quantity: reservation.quantity,
      })),
    };
  }

  async transferLunch(
    fromEmployeeCode: string,
    toEmployeeCode: string,
    mealDateValue: string,
    actor: { id: string; username: string },
  ) {
    const sourceCode = fromEmployeeCode.trim();
    const beneficiaryCode = toEmployeeCode.trim();
    const mealDate = this.parseDate(mealDateValue);

    if (!sourceCode || !beneficiaryCode) {
      throw new BadRequestException('Debes indicar ambos códigos de empleado');
    }

    if (sourceCode === beneficiaryCode) {
      throw new BadRequestException(
        'El beneficiario debe ser diferente de quien hizo la reservación',
      );
    }

    if (mealDate < this.getLocalDate(new Date())) {
      throw new BadRequestException('No se pueden transferir comidas de fechas pasadas');
    }

    return this.prisma.$transaction(
      async (transaction) => {
        const reservation = await transaction.mealReservation.findUnique({
          where: {
            employeeId_mealDate_mealType: {
              employeeId: sourceCode,
              mealDate,
              mealType: LUNCH,
            },
          },
          include: {
            employee: true,
            transferEmployee: true,
            meal: true,
            mealRequests: {
              where: { status: APPROVED },
              select: { id: true },
              take: 1,
            },
          },
        });

        if (!reservation) {
          throw new NotFoundException(
            'El empleado de origen no tiene una reservación de almuerzo para esa fecha',
          );
        }

        if (reservation.transferEmployeeId) {
          throw new ConflictException(
            `La reservación ya fue transferida a ${reservation.transferEmployeeId}`,
          );
        }

        if (reservation.mealRequests.length > 0) {
          throw new ConflictException(
            'La comida ya fue entregada y no puede transferirse',
          );
        }

        const beneficiary = await transaction.employee.findUnique({
          where: { employeeCode: beneficiaryCode },
        });

        if (!beneficiary) {
          throw new NotFoundException('El empleado beneficiario no existe');
        }

        if (!beneficiary.active) {
          throw new BadRequestException(
            'No se puede transferir la comida a un empleado inactivo',
          );
        }

        const beneficiaryMeal = await transaction.mealReservation.findFirst({
          where: {
            id: { not: reservation.id },
            mealDate,
            mealType: LUNCH,
            OR: [
              { employeeId: beneficiaryCode },
              { transferEmployeeId: beneficiaryCode },
            ],
          },
          select: { id: true },
        });

        if (beneficiaryMeal) {
          throw new ConflictException(
            'El empleado beneficiario ya tiene una comida para esa fecha',
          );
        }

        const updated = await transaction.mealReservation.update({
          where: { id: reservation.id },
          data: { transferEmployeeId: beneficiaryCode },
          include: {
            employee: true,
            transferEmployee: true,
            meal: true,
          },
        });

        await transaction.auditLog.create({
          data: {
            entityName: 'meal_reservations',
            entityId: reservation.id,
            action: 'TRANSFER',
            actorUserId: actor.id,
            previousValues: JSON.stringify({
              employeeId: sourceCode,
              transferEmployeeId: null,
            }),
            newValues: JSON.stringify({
              employeeId: sourceCode,
              transferEmployeeId: beneficiaryCode,
              mealDate: mealDateValue,
              mealType: LUNCH,
              mealId: reservation.mealId,
            }),
          },
        });

        return {
          id: updated.id,
          date: this.toDateOnly(updated.mealDate),
          meal: updated.meal.name,
          originalEmployee: {
            code: updated.employee.employeeCode,
            name: updated.employee.name,
          },
          beneficiary: {
            code: updated.transferEmployee!.employeeCode,
            name: updated.transferEmployee!.name,
          },
          transferredBy: actor.username,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async getRecentTransfers() {
    const logs = await this.prisma.auditLog.findMany({
      where: {
        entityName: 'meal_reservations',
        action: 'TRANSFER',
        entityId: { not: null },
      },
      include: {
        actorUser: {
          select: { username: true, role: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    const reservationIds = logs
      .map((log) => log.entityId)
      .filter((id): id is string => Boolean(id));
    const reservations = await this.prisma.mealReservation.findMany({
      where: { id: { in: reservationIds } },
      include: {
        employee: true,
        transferEmployee: true,
        meal: true,
      },
    });
    const reservationsById = new Map(
      reservations.map((reservation) => [reservation.id, reservation]),
    );

    return logs.flatMap((log) => {
      const reservation = log.entityId
        ? reservationsById.get(log.entityId)
        : undefined;

      if (!reservation?.transferEmployee) return [];

      return [{
        id: log.id,
        reservationId: reservation.id,
        date: this.toDateOnly(reservation.mealDate),
        meal: reservation.meal.name,
        originalEmployee: {
          code: reservation.employee.employeeCode,
          name: reservation.employee.name,
        },
        beneficiary: {
          code: reservation.transferEmployee.employeeCode,
          name: reservation.transferEmployee.name,
        },
        transferredBy: log.actorUser?.username ?? 'Usuario no disponible',
        transferredAt: log.createdAt.toISOString(),
      }];
    });
  }

  private parseDate(value: string) {
    const date = new Date(`${value}T00:00:00.000Z`);

    if (Number.isNaN(date.getTime()) || this.toDateOnly(date) !== value) {
      throw new BadRequestException('La fecha de la transferencia no es válida');
    }

    return date;
  }

  private getLocalDate(date: Date) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

    return new Date(
      Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day)),
    );
  }

  private toDateOnly(date: Date) {
    return date.toISOString().slice(0, 10);
  }
}
