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

  async findDepartments() {
    const employees = await this.prisma.employee.findMany({
      select: { department: true },
      orderBy: { department: 'asc' },
    });
    const departments = new Map<string, string>();
    for (const employee of employees) {
      const department = employee.department.trim().replace(/\s+/g, ' ');
      if (!department) continue;
      const key = this.getDepartmentKey(department);
      if (!departments.has(key)) departments.set(key, department);
    }
    return [...departments.values()].sort((left, right) =>
      left.localeCompare(right, 'es', { sensitivity: 'base' }),
    );
  }

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
    const department = await this.resolveDepartment(
      createEmployeeDto.department,
    );
    try {
      return await this.prisma.employee.create({
        data: {
          employeeCode: createEmployeeDto.employeeCode,
          name: createEmployeeDto.name,
          email: createEmployeeDto.email,
          department,
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
    const department = updateEmployeeDto.department === undefined
      ? undefined
      : await this.resolveDepartment(updateEmployeeDto.department);
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
      ...(department === undefined
        ? {}
        : { department }),
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

  private async resolveDepartment(value: string) {
    const normalized = value.trim().replace(/\s+/g, ' ');
    const departments = await this.findDepartments();
    return departments.find(
      (department) =>
        this.getDepartmentKey(department) === this.getDepartmentKey(normalized),
    ) ?? normalized;
  }

  private getDepartmentKey(value: string) {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLocaleUpperCase('es');
  }
}
