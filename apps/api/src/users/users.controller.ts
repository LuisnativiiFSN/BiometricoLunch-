import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { Roles } from '../auth/auth.decorators.js';
import {
  UserRole,
  type AuthenticatedUser,
} from '../auth/auth.constants.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateUserPasswordDto } from './dto/update-user-password.dto.js';
import { UpdateUserStatusDto } from './dto/update-user-status.dto.js';
import { UsersService } from './users.service.js';

type AuthenticatedRequest = Request & { user: AuthenticatedUser };

@Roles(UserRole.ADMIN)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  findAll() {
    return this.usersService.findAll();
  }

  @Post()
  create(@Body() dto: CreateUserDto, @Req() request: AuthenticatedRequest) {
    return this.usersService.create(dto, request.user.id);
  }

  @Patch(':id/password')
  updatePassword(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateUserPasswordDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.usersService.updatePassword(id, dto.password, request.user.id);
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateUserStatusDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.usersService.updateStatus(id, dto.active, request.user.id);
  }
}
