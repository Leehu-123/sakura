import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
export class PageDto {
  @ApiPropertyOptional({ default: 1 })
  @ValidateIf((_object, value) => value !== undefined)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100000)
  page = 1;
  @ApiPropertyOptional({ default: 20, maximum: 100 })
  @ValidateIf((_object, value) => value !== undefined)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 20;
  @ApiPropertyOptional()
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(100)
  search = '';
}
export class CreateUserDto {
  @ApiProperty()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  @MaxLength(254)
  email!: string;
  @ApiProperty() @IsString() @MinLength(2) @MaxLength(100) displayName!: string;
  @ApiProperty({ minLength: 12, format: 'password' })
  @IsString()
  @MinLength(12)
  @MaxLength(128)
  password!: string;
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMaxSize(20)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  roleIds!: string[];
}
export class UpdateUserDto {
  @ApiPropertyOptional()
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  displayName?: string;
  @ApiPropertyOptional({ enum: ['ACTIVE', 'DISABLED'] })
  @ValidateIf((_object, value) => value !== undefined)
  @IsEnum({ ACTIVE: 'ACTIVE', DISABLED: 'DISABLED' })
  status?: 'ACTIVE' | 'DISABLED';
  @ApiPropertyOptional({ type: [String] })
  @ValidateIf((_object, value) => value !== undefined)
  @IsArray()
  @ArrayMaxSize(20)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  roleIds?: string[];
  @ApiPropertyOptional()
  @ValidateIf((_object, value) => value !== undefined)
  @Transform(({ value }) => (value === '' || value === null ? undefined : value))
  @IsString()
  @MaxLength(50)
  telegramChatId?: string;
}
export class TelegramConfigDto {
  @ApiPropertyOptional() @ValidateIf((_o, v) => v !== undefined) @IsString() @MaxLength(200) botToken?: string;
  @ApiPropertyOptional() @ValidateIf((_o, v) => v !== undefined) @IsBoolean() enabled?: boolean;
}
export class ResetPasswordDto {
  @ApiProperty({ minLength: 12, format: 'password' })
  @IsString()
  @MinLength(12)
  @MaxLength(128)
  password!: string;
}
export class GrantDto {
  @ApiProperty() @IsUUID() permissionId!: string;
  @ApiProperty({ enum: ['GLOBAL', 'ASSIGNED', 'SELF'] })
  @IsEnum({ GLOBAL: 'GLOBAL', ASSIGNED: 'ASSIGNED', SELF: 'SELF' })
  scope!: 'GLOBAL' | 'ASSIGNED' | 'SELF';
}
export class RoleDto {
  @ApiProperty() @IsString() @Matches(/^[a-z][a-z0-9_]{2,49}$/) code!: string;
  @ApiProperty() @IsString() @MinLength(2) @MaxLength(100) name!: string;
  @ApiPropertyOptional()
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(500)
  description = '';
  @ApiProperty({ type: [GrantDto] })
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => GrantDto)
  grants!: GrantDto[];
}
export class CatalogDto {
  @ApiProperty() @IsString() @Matches(/^[A-Z0-9_-]{2,30}$/) code!: string;
  @ApiProperty() @IsString() @MinLength(2) @MaxLength(100) name!: string;
}
export class EmployeeDto {
  @ApiProperty() @IsString() @Matches(/^[A-Z0-9_-]{2,30}$/) code!: string;
  @ApiProperty() @IsString() @MinLength(2) @MaxLength(100) fullName!: string;
  @ApiPropertyOptional()
  @ValidateIf((_object, value) => value !== undefined)
  @IsUUID()
  userId?: string;
  @ApiPropertyOptional()
  @ValidateIf((_object, value) => value !== undefined)
  @IsUUID()
  departmentId?: string;
  @ApiPropertyOptional()
  @ValidateIf((_object, value) => value !== undefined)
  @IsUUID()
  branchId?: string;
  @ApiPropertyOptional()
  @ValidateIf((_object, value) => value !== undefined)
  @IsUUID()
  regionId?: string;
}
