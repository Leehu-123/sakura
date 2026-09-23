import { Module } from '@nestjs/common';
import { CoreService } from './core.service';
import { CoreController } from './core.controller';
import { StorageController } from './storage.controller';
@Module({ controllers: [CoreController, StorageController], providers: [CoreService] })
export class CoreModule {}
