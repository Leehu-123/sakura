import { Global, Module } from '@nestjs/common';
import { Database } from './db';
@Global()
@Module({ providers: [Database], exports: [Database] })
export class DatabaseModule {}
