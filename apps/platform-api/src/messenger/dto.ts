import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  Max,
  Matches,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { VersionDto } from '../common/version';
import { PageDto } from '../core/dto';
export class InboxQuery extends PageDto {
  @IsOptional()
  @IsIn([
    'ALL',
    'UNLINKED',
    'UNREAD',
    'UNANSWERED',
    'MINE',
    'UNASSIGNED',
    'BLOCKED',
    'HAS_ORDER',
    'WAITING',
  ])
  filter: string = 'ALL';
  @IsOptional() @IsString() @MaxLength(40) pageId?: string;
  @IsOptional() @IsString() @MaxLength(30) tag?: string;
}
export class LinkDto extends VersionDto {
  @IsUUID() customerId!: string;
}
export class TagsDto extends VersionDto {
  @IsArray()
  @ArrayMaxSize(10)
  @ArrayUnique()
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(30, { each: true })
  tags!: string[];
}
export class ReplyDto {
  @IsOptional() @IsIn(['INVOICE']) orderDocument?: 'INVOICE';
  @IsUUID() requestKey!: string;
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  text?: string;
  @IsOptional() @IsUUID() imageId?: string;
  @IsOptional() @IsUUID() attachmentId?: string;
  @IsOptional() @IsUUID() orderId?: string;
  @IsOptional() @IsInt() @Min(1) orderVersion?: number;
}
export class TemplateDto {
  @IsString() @MinLength(2) @MaxLength(80) title!: string;
  @IsString() @MinLength(1) @MaxLength(2000) text!: string;
}
export class TemplateUpdateDto extends TemplateDto {
  @IsInt() @Min(1) version!: number;
  @IsBoolean() isActive!: boolean;
}
export class ResolveDto {
  @IsIn(['SENT', 'FAILED']) state!: 'SENT' | 'FAILED';
  @IsString() @MinLength(5) @MaxLength(500) reason!: string;
}

export class InteractionQuery extends PageDto {
  @IsOptional() @IsUUID() messageId?: string;
  @IsOptional() @IsIn(['ALL', 'INBOUND', 'OUTBOUND', 'IMAGE', 'ORDER']) interaction: string = 'ALL';
}
export class SupportDto extends VersionDto {
  @IsOptional() @IsUUID() userId?: string | null;
}
export class BlockDto extends VersionDto {
  @IsBoolean() blocked!: boolean;
  @IsString() @MinLength(3) @MaxLength(500) reason!: string;
}
export class ReadDto {
  @IsInt() @Min(0) inboundSeq!: number;
  @IsBoolean() unread!: boolean;
}
export class ImageDto {
  @IsUUID() productId!: string;
  @IsOptional() @IsUUID() variantId?: string;
  @IsString() @MinLength(2) @MaxLength(120) title!: string;
  @IsIn(['image/png', 'image/jpeg']) mime!: string;
  @IsString() @MinLength(16) @MaxLength(700000) data!: string;
}

export class ChatLabelDto {
  @IsString() @MinLength(1) @MaxLength(30) name!: string;
  @Matches(/^#[a-fA-F0-9]{6}$/) color!: string;
}
export class ToolbarDto {
  @IsInt() @Min(0) version!: number;
  @IsInt() @Min(1) @Max(14) days!: number;
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => ChatLabelDto)
  labels!: ChatLabelDto[];
}
export class TaggedDateDto extends VersionDto {
  @IsString() @Matches(/^(|\d{4}-\d{2}-\d{2})$/) date!: string;
}
