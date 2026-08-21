import { Injectable } from '@nestjs/common';
import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaMssql } from '@prisma/adapter-mssql';
import { PrismaClient } from '../generated/prisma/client.js';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    const server = process.env.DB_SERVER;
    const database = process.env.DB_DATABASE;
    const user = process.env.DB_USER;
    const password = process.env.DB_PASSWORD;
    const port = process.env.DB_PORT ? Number(process.env.DB_PORT) : undefined;
    const tlsServerName = process.env.DB_TLS_SERVER_NAME;

    if (!server || !database || !user || !password) {
      throw new Error(
        'DB_SERVER, DB_DATABASE, DB_USER y DB_PASSWORD deben estar configuradas',
      );
    }

    super({
      adapter: new PrismaMssql({
        server,
        database,
        user,
        password,
        ...(port === undefined ? {} : { port }),
        options: {
          encrypt: process.env.DB_ENCRYPT !== 'false',
          trustServerCertificate:
            process.env.DB_TRUST_SERVER_CERTIFICATE !== 'false',
          ...(tlsServerName ? { serverName: tlsServerName } : {}),
        },
      }),
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
