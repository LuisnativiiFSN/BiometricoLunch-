import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { Roles } from '../auth/auth.decorators.js';
import {
  UserRole,
  type AuthenticatedUser,
} from '../auth/auth.constants.js';
import { CreateMealTransferDto } from './dto/create-meal-transfer.dto.js';
import { TransfersService } from './transfers.service.js';

type AuthenticatedRequest = Request & { user: AuthenticatedUser };

@Roles(UserRole.ADMIN, UserRole.RH)
@Controller('transfers')
export class TransfersController {
  constructor(private readonly transfersService: TransfersService) {}

  @Get()
  findRecent() {
    return this.transfersService.getRecentTransfers();
  }

  @Get('pending/:employeeCode')
  findPending(@Param('employeeCode') employeeCode: string) {
    return this.transfersService.getTransferableReservations(employeeCode);
  }

  @Post()
  create(
    @Body() body: CreateMealTransferDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.transfersService.transferLunch(
      body.fromEmployeeCode,
      body.toEmployeeCode,
      body.mealDate,
      request.user,
    );
  }
}
