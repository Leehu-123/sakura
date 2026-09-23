import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
export class ConnectionVersionDto {
  @IsInt() @Min(0) version!: number;
}
export class AppConnectionDto extends ConnectionVersionDto {
  @IsOptional() @IsBoolean() facebookLoginEnabled?: boolean;
  @IsOptional() @IsString() @Matches(/^(\d{1,40})?$/) facebookLoginConfigId?: string;
  @IsString() @Matches(/^(\d{1,40})?$/) appId!: string;
  @IsString() @Matches(/^(v\d{1,3}\.0)?$/) graphVersion!: string;
  @IsString() @MaxLength(500) webhookUrl!: string;
  @IsOptional() @IsString() @MinLength(16) @MaxLength(500) appSecret?: string;
  @IsOptional() @IsString() @MinLength(24) @MaxLength(200) verifyToken?: string;
  @IsBoolean() enabled!: boolean;
  @IsBoolean() sendEnabled!: boolean;
}
export class PageConnectionDto extends ConnectionVersionDto {
  @IsString() @Matches(/^\d{1,40}$/) pageId!: string;
  @IsString() @MinLength(1) @MaxLength(100) @Matches(/\S/) name!: string;
  @IsOptional() @IsString() @MinLength(10) @MaxLength(4096) accessToken?: string;
  @IsBoolean() enabled!: boolean;
  @IsBoolean() sendEnabled!: boolean;
}
