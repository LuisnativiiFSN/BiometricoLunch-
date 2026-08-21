import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AuthService } from './auth.service.js';
import {
  AUTH_COOKIE_NAME,
  IS_PUBLIC_KEY,
  ROLES_KEY,
  type AuthenticatedUser,
  type UserRoleValue,
} from './auth.constants.js';

type AuthenticatedRequest = Request & { user?: AuthenticatedUser };

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
    private readonly authService: AuthService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = request.cookies?.[AUTH_COOKIE_NAME] as string | undefined;

    if (!token) {
      throw new UnauthorizedException('Debes iniciar sesión');
    }

    let payload: { sub?: string };

    try {
      payload = await this.jwtService.verifyAsync<{ sub?: string }>(token);
    } catch {
      throw new UnauthorizedException('La sesión venció o no es válida');
    }

    if (!payload.sub) {
      throw new UnauthorizedException('La sesión no es válida');
    }

    const user = await this.authService.findSessionUser(payload.sub);

    if (!user) {
      throw new UnauthorizedException('El usuario está inactivo o ya no existe');
    }

    request.user = user;
    const requiredRoles = this.reflector.getAllAndOverride<UserRoleValue[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (requiredRoles?.length && !requiredRoles.includes(user.role)) {
      throw new ForbiddenException('No tienes permiso para realizar esta acción');
    }

    return true;
  }
}
