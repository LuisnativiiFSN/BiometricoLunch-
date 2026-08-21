import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service.js';
import type { LoginDto } from './dto/login.dto.js';
import type { AuthenticatedUser, UserRoleValue } from './auth.constants.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async login(dto: LoginDto) {
    const username = dto.username.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { username } });
    const passwordMatches = user
      ? await bcrypt.compare(dto.password, user.passwordHash)
      : false;

    if (!user || !user.active || !passwordMatches) {
      throw new UnauthorizedException('Usuario o contraseña incorrectos');
    }

    const authenticatedUser = this.toAuthenticatedUser(user);
    const token = await this.jwtService.signAsync({
      sub: authenticatedUser.id,
      username: authenticatedUser.username,
      role: authenticatedUser.role,
    });

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return { token, user: authenticatedUser };
  }

  async findSessionUser(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!user || !user.active) {
      return null;
    }

    return this.toAuthenticatedUser(user);
  }

  private toAuthenticatedUser(user: {
    id: string;
    username: string;
    role: string;
  }): AuthenticatedUser {
    return {
      id: user.id,
      username: user.username,
      role: user.role as UserRoleValue,
    };
  }
}
