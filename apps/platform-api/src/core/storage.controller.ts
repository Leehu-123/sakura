import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../auth/access';
import { Database } from '../db';
import { storageStatus } from '../common/storage-status';
@Controller('core/storage')
@ApiTags('Lưu trữ và sao lưu')
@ApiBearerAuth()
export class StorageController {
  constructor(private readonly db: Database) {}
  @Get()
  @RequirePermission('core.audit.read', 'GLOBAL')
  status() {
    return storageStatus(this.db);
  }
}
