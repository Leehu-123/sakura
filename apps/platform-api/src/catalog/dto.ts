import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type, Transform } from 'class-transformer';
import {
  IsString,
  IsUUID,
  IsInt,
  IsEnum,
  IsArray,
  IsBoolean,
  Matches,
  Max,
  Min,
  MaxLength,
  MinLength,
  ValidateIf,
  ValidateNested,
  ArrayMinSize,
  ArrayMaxSize,
} from 'class-validator';
import { CustomerStatus, OrderStatus } from '@sakura/database';
import { PageDto } from '../core/dto';
const optional = () => ValidateIf((_o, value) => value !== undefined);

import { VersionDto } from '../common/version';
export class VariantDto {
  @ApiProperty()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @IsString()
  @Matches(/^[A-Z0-9_-]{2,50}$/)
  sku!: string;
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(100) name!: string;
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(30) unit!: string;
  @ApiProperty({ type: String, example: '25000' })
  @IsString()
  @Matches(/^\d{1,12}$/)
  price!: string;
}
export class VariantUpdateDto extends VersionDto {
  @ApiProperty({ type: String }) @IsString() @Matches(/^\d{1,12}$/) price!: string;
  @ApiProperty() @IsBoolean() isActive!: boolean;
}
export class ProductDto {
  @ApiProperty() @IsString() @MinLength(2) @MaxLength(150) name!: string;
  @ApiPropertyOptional() @optional() @IsString() @MaxLength(100) category: string = '';
  @ApiPropertyOptional() @optional() @IsString() @MaxLength(2000) description: string = '';
  @ApiProperty({ type: [VariantDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => VariantDto)
  variants!: VariantDto[];
}
export class ProductUpdateDto extends VersionDto {
  @ApiProperty() @IsString() @MinLength(2) @MaxLength(150) name!: string;
  @ApiProperty() @IsString() @MaxLength(100) category!: string;
  @ApiProperty() @IsString() @MaxLength(2000) description!: string;
  @ApiProperty() @IsBoolean() isActive!: boolean;
}
