import {
  Body,
  Controller,
  Get,
  Module,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ExcelImports } from './excel.service';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequirePermission } from '../auth/access';
import { Principal } from '../auth/policy';
import { CommitDto, ImportQuery, InspectDto, PreviewDto } from './dto';
import { fields, parseCsv } from './format';
import { ImportsService } from './imports.service';
@Controller('imports/sapo')
@ApiTags('Nhập Sapo')
@ApiBearerAuth()
@RequirePermission('core.imports.manage')
export class ImportsController {
  constructor(
    private readonly imports: ImportsService,
    private readonly excel: ExcelImports,
  ) {}
  @Post('excel/preview')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 0, parts: 2 },
    }),
  )
  excelPreview(
    @CurrentUser() a: Principal,
    @UploadedFile() file: { buffer: Buffer; originalname: string },
  ) {
    return this.excel.preview(a, file);
  }
  @Get('excel/batches/:id') excelDetail(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() q: ImportQuery,
  ) {
    return this.excel.detail(id, q.page);
  }
  @Post('excel/batches/:id/commit') excelCommit(
    @CurrentUser() a: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: CommitDto,
  ) {
    return this.excel.commit(a, id, d.digest);
  }
  @Get('excel/batches/:id/images') excelImages(
    @CurrentUser() a: Principal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.excel.images(a, id);
  }
  @Post('excel/batches/:id/images') excelDownloadImages(
    @CurrentUser() a: Principal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.excel.images(a, id, true);
  }
  @Get('fields') fields() {
    return fields;
  }
  @Post('inspect') inspect(@Body() dto: InspectDto) {
    const { headers, rows } = parseCsv(dto.content);
    return { headers, sample: rows.slice(0, 3), rowCount: rows.length };
  }
  @Post('preview') preview(@CurrentUser() actor: Principal, @Body() dto: PreviewDto) {
    return this.imports.preview(actor, dto);
  }
  @Get('batches') list(@Query() query: ImportQuery) {
    return this.imports.list(query);
  }
  @Get('batches/:id') detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.imports.detail(id);
  }
  @Post('batches/:id/commit') commit(
    @CurrentUser() actor: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CommitDto,
  ) {
    return this.imports.commit(actor, id, dto.digest);
  }
}
@Controller('sales/historical-orders')
@ApiTags('Đơn Sapo chỉ đọc')
@ApiBearerAuth()
@RequirePermission('sales.orders.read', 'ASSIGNED')
export class HistoricalOrdersController {
  constructor(private readonly imports: ImportsService) {}
  @Get() list(@CurrentUser() actor: Principal, @Query() query: ImportQuery) {
    return this.imports.historical(actor, query);
  }
  @Get(':id') detail(@CurrentUser() actor: Principal, @Param('id', ParseUUIDPipe) id: string) {
    return this.imports.historicalDetail(actor, id);
  }
}
@Module({
  controllers: [ImportsController, HistoricalOrdersController],
  providers: [ImportsService, ExcelImports],
})
export class ImportsModule {}
