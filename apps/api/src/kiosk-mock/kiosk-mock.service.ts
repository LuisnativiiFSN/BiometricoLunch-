import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class KioskMockService {
  constructor(private readonly prisma: PrismaService) {}

  async identify(employeeId: string) {
    const employee = await this.prisma.employee.findUnique({
      where: { employeeCode: employeeId },
    });

    if (!employee) {
      throw new NotFoundException('Empleado no encontrado');
    }

    if (!employee.active) {
      throw new BadRequestException('El empleado esta inactivo');
    }

    return {
      identified: true,
      employee,
      identifiedAt: new Date().toISOString(),
    };
  }
}
