import { VersionDto } from '../common/version';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type, Transform } from 'class-transformer';
import {
  IsString,
  IsUUID,
  IsEnum,
  MaxLength,
  MinLength,
  ValidateIf,
  IsDateString,
  IsBoolean,
} from 'class-validator';
import { TaskStatus, TaskPriority } from '@sakura/database';
import { PageDto } from '../core/dto';

const optional = () =>
  ValidateIf((_o, value) => value !== undefined && value !== null && value !== '');

export class CreateTaskDto {
  @ApiProperty()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional()
  @optional()
  @Transform(({ value }) => (value === '' || value === null ? undefined : value))
  @IsUUID()
  customerId?: string;

  @ApiPropertyOptional() @optional() @IsString() @MaxLength(4000) note?: string;
  @ApiPropertyOptional() @optional() @IsDateString() dueDate?: string;
  @ApiPropertyOptional({ enum: TaskPriority }) @optional() @IsEnum(TaskPriority) priority?: TaskPriority;
  @ApiPropertyOptional() @optional() @IsString() @MaxLength(50) contactChannel?: string;
  @ApiPropertyOptional() @optional() @IsBoolean() isRecurring?: boolean;
}

export class UpdateTaskDto extends VersionDto {
  @ApiPropertyOptional() @optional() @IsString() @MinLength(2) @MaxLength(200) title?: string;

  @ApiPropertyOptional()
  @optional()
  @Transform(({ value }) => (value === '' || value === null ? undefined : value))
  @IsUUID()
  customerId?: string;

  @ApiPropertyOptional() @optional() @IsString() @MaxLength(4000) note?: string;
  @ApiPropertyOptional() @optional() @IsDateString() dueDate?: string;
  @ApiPropertyOptional({ enum: TaskPriority }) @optional() @IsEnum(TaskPriority) priority?: TaskPriority;
  @ApiPropertyOptional() @optional() @IsString() @MaxLength(50) contactChannel?: string;
  @ApiPropertyOptional({ enum: TaskStatus }) @optional() @IsEnum(TaskStatus) status?: TaskStatus;
  @ApiPropertyOptional() @optional() @IsBoolean() isRecurring?: boolean;
}

export class TaskQuery extends PageDto {
  @ApiPropertyOptional({ enum: TaskStatus }) @optional() @IsEnum(TaskStatus) status?: TaskStatus;
  @ApiPropertyOptional() @optional() @IsUUID() customerId?: string;
  @ApiPropertyOptional({ description: 'YYYY-MM-DD' }) @optional() @IsString() dueDate?: string;
  @ApiPropertyOptional({ enum: ['today', 'week', 'month', 'overdue', 'all'] })
  @optional()
  @IsEnum(['today', 'week', 'month', 'overdue', 'all'])
  timeRange?: 'today' | 'week' | 'month' | 'overdue' | 'all';
  @ApiPropertyOptional()
  @optional()
  @Transform(({ value }) => (value === 'true' ? true : value === 'false' ? false : value))
  @IsBoolean()
  isRecurring?: boolean;
}
