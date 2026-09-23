import {
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { Kind, kinds } from './format';
export class InspectDto {
  @IsString() @MaxLength(512000) content!: string;
}
export class PreviewDto extends InspectDto {
  @IsIn(kinds) kind!: Kind;
  @IsString() @MaxLength(150) fileName!: string;
  @IsObject() mapping!: Record<string, unknown>;
}
export class ImportQuery {
  @IsOptional() @IsIn(['ALL', 'LINKED', 'UNLINKED']) link?: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(100000) page = 1;
  @IsOptional() @IsString() @MaxLength(100) search?: string;
  @IsOptional() @IsUUID() customerId?: string;
}
export class CommitDto {
  @IsString() @MaxLength(64) digest!: string;
}
