import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateUserDto } from './dto/create-user.dto.js';

const safeUserSelect = {
  id: true,
  username: true,
  role: true,
  active: true,
  passwordLocked: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.user.findMany({
      select: safeUserSelect,
      orderBy: [{ passwordLocked: 'desc' }, { username: 'asc' }],
    });
  }

  async create(dto: CreateUserDto, actorUserId: string) {
    const username = dto.username.trim().toLowerCase();
    const passwordHash = await bcrypt.hash(dto.password, 12);

    try {
      return await this.prisma.$transaction(async (transaction) => {
        const user = await transaction.user.create({
          data: {
            username,
            passwordHash,
            role: dto.role,
          },
          select: safeUserSelect,
        });

        await transaction.auditLog.create({
          data: {
            entityName: 'users',
            entityId: user.id,
            action: 'CREATE',
            actorUserId,
            newValues: JSON.stringify({
              username: user.username,
              role: user.role,
              active: user.active,
            }),
          },
        });

        return user;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Ese nombre de usuario ya existe');
      }

      throw error;
    }
  }

  async updatePassword(id: string, password: string, actorUserId: string) {
    const user = await this.findMutableUser(id);
    const passwordHash = await bcrypt.hash(password, 12);

    const updated = await this.prisma.$transaction(async (transaction) => {
      const result = await transaction.user.update({
        where: { id },
        data: { passwordHash },
        select: safeUserSelect,
      });

      await transaction.auditLog.create({
        data: {
          entityName: 'users',
          entityId: id,
          action: 'UPDATE',
          actorUserId,
          previousValues: JSON.stringify({ passwordChanged: false }),
          newValues: JSON.stringify({ passwordChanged: true }),
        },
      });

      return result;
    });

    return updated;
  }

  async updateStatus(id: string, active: boolean, actorUserId: string) {
    const user = await this.findMutableUser(id);

    if (user.active === active) {
      return this.prisma.user.findUniqueOrThrow({
        where: { id },
        select: safeUserSelect,
      });
    }

    return this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.user.update({
        where: { id },
        data: { active },
        select: safeUserSelect,
      });

      await transaction.auditLog.create({
        data: {
          entityName: 'users',
          entityId: id,
          action: 'UPDATE',
          actorUserId,
          previousValues: JSON.stringify({ active: user.active }),
          newValues: JSON.stringify({ active }),
        },
      });

      return updated;
    });
  }

  private async findMutableUser(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    if (user.passwordLocked || user.role === 'ADMIN') {
      throw new BadRequestException(
        'Las cuentas administradoras están protegidas y no pueden modificarse',
      );
    }

    return user;
  }
}
