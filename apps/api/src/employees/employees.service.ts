import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateEmployeeDto } from './dto/create-employee.dto.js';
import type { UpdateEmployeeDto } from './dto/update-employee.dto.js';

@Injectable()
export class EmployeesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(search?: string, active?: boolean) {
    const normalizedSearch = search?.trim();
    const where: Prisma.EmployeeWhereInput = {
      ...(active === undefined ? {} : { active }),
      ...(normalizedSearch
        ? {
            OR: [
              {
                employeeCode: {
                  contains: normalizedSearch,
                },
              },
              {
                name: {
                  contains: normalizedSearch,
                },
              },
              {
                email: {
                  contains: normalizedSearch,
                },
              },
              {
                department: {
                  contains: normalizedSearch,
                },
              },
            ],
          }
        : {}),
    };

    return this.prisma.employee.findMany({
      where,
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
    });
  }

  async findOne(employeeCode: string) {
    const employee = await this.prisma.employee.findUnique({
      where: { employeeCode },
    });

    if (!employee) {
      throw new NotFoundException('Empleado no encontrado');
    }

    return employee;
  }

  async create(createEmployeeDto: CreateEmployeeDto) {
    try {
      return await this.prisma.employee.create({
        data: {
          employeeCode: createEmployeeDto.employeeCode,
          name: createEmployeeDto.name,
          email: createEmployeeDto.email,
          department: createEmployeeDto.department,
          ...(createEmployeeDto.active === undefined
            ? {}
            : { active: createEmployeeDto.active }),
        },
      });
    } catch (error) {
      this.handleUniqueEmployeeCode(error);
    }
  }

  async update(employeeCode: string, updateEmployeeDto: UpdateEmployeeDto) {
    const data: Prisma.EmployeeUpdateInput = {
      ...(updateEmployeeDto.employeeCode === undefined
        ? {}
        : { employeeCode: updateEmployeeDto.employeeCode }),
      ...(updateEmployeeDto.name === undefined
        ? {}
        : { name: updateEmployeeDto.name }),
      ...(updateEmployeeDto.email === undefined
        ? {}
        : { email: updateEmployeeDto.email }),
      ...(updateEmployeeDto.department === undefined
        ? {}
        : { department: updateEmployeeDto.department }),
      ...(updateEmployeeDto.active === undefined
        ? {}
        : { active: updateEmployeeDto.active }),
    };

    if (Object.keys(data).length === 0) {
      throw new BadRequestException(
        'Debe proporcionar al menos un campo para actualizar',
      );
    }

    await this.findOne(employeeCode);

    try {
      return await this.prisma.employee.update({
        where: { employeeCode },
        data,
      });
    } catch (error) {
      this.handleUniqueEmployeeCode(error);
    }
  }

  private handleUniqueEmployeeCode(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException('El codigo de empleado ya existe');
    }

    throw error;
  }
}
