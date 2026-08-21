import { Controller, Get } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service.js';
import { Public } from './auth/auth.decorators.js';

@Public()
@Controller()
export class AppController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  getApiStatus() {
    return {
      service: 'comedor-api',
      status: 'ok',
    };
  }

  @Get('health')
  async getHealth() {
    await this.prisma.$queryRaw`SELECT 1`;

    return {
      api: 'ok',
      database: 'ok',
    };
  }
}
