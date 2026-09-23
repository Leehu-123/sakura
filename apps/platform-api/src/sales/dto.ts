import { VersionDto } from '../common/version';
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
import { CustomerStatus, OrderStatus, ShippingStatus } from '@sakura/database';
import { PageDto } from '../core/dto';
const optional = () => ValidateIf((_o, value) => value !== undefined);
export class CustomerDto {
  @ApiProperty()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  name!: string;
  @ApiProperty() @IsString() @MaxLength(30) @MinLength(9) phone!: string;
  @ApiPropertyOptional() @optional() @IsString() @MaxLength(1000) address: string = '';
  @ApiPropertyOptional({ enum: CustomerStatus })
  @optional()
  @IsEnum(CustomerStatus)
  status: CustomerStatus = 'NEW';
  @ApiPropertyOptional() @ValidateIf((_o, v) => v !== undefined && v !== null) @IsUUID() regionId?:
    string | null;
}
export class CustomerUpdateDto extends CustomerDto {
  @ApiProperty() @IsInt() @Min(1) version!: number;
}
export class CustomerQuery extends PageDto {
  @ApiPropertyOptional({ enum: CustomerStatus })
  @optional()
  @IsEnum(CustomerStatus)
  status?: CustomerStatus;
}
export class HandoffDto extends VersionDto {
  @ApiProperty() @IsUUID() userId!: string;
  @ApiProperty()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  reason!: string;
}
export class CareDto extends VersionDto {
  @ApiProperty()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  note!: string;
}
export class OrderLineDto {
  @ApiProperty() @IsUUID() variantId!: string;
  @ApiProperty() @IsInt() @Min(1) @Max(10000) quantity!: number;
  @ApiProperty({ type: String, description: 'Giá Sale đã xem, để phát hiện giá vừa thay đổi' })
  @IsString()
  @Matches(/^\d{1,12}$/)
  expectedPrice!: string;
}
export class CreateOrderDto {
  @optional() @IsUUID() conversationId?: string;
  @optional() @IsBoolean() confirm?: boolean;
  @ApiProperty() @IsUUID() requestKey!: string;
  @ApiProperty() @IsUUID() customerId!: string;
  @ApiProperty() @IsInt() @Min(1) customerVersion!: number;
  @ApiProperty({ type: [OrderLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => OrderLineDto)
  items!: OrderLineDto[];
  @ApiPropertyOptional({ type: String })
  @optional()
  @IsString()
  @Matches(/^\d{1,12}$/)
  discount: string = '0';
  @ApiPropertyOptional({ type: String })
  @optional()
  @IsString()
  @Matches(/^\d{1,12}$/)
  shippingFee: string = '0';
  @ApiPropertyOptional() @optional() @IsString() @MaxLength(2000) note: string = '';
}
export class OrderQuery extends PageDto {
  @ApiPropertyOptional() @optional() @IsUUID() customerId?: string;
  @ApiPropertyOptional({ enum: OrderStatus }) @optional() @IsEnum(OrderStatus) status?: OrderStatus;
}
export class OrderStatusDto extends VersionDto {
  @ApiProperty({ enum: OrderStatus }) @IsEnum(OrderStatus) status!: OrderStatus;
  @ApiPropertyOptional() @optional() @IsString() @MaxLength(1000) reason: string = '';
}
export class PaymentDto extends VersionDto {
  @ApiProperty({ type: String, description: 'Tổng số tiền đã nhận của đơn' })
  @IsString()
  @Matches(/^\d{1,15}$/)
  paidAmount!: string;
  @ApiProperty()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  note!: string;
}

export class ShippingDto extends VersionDto {
  @IsString() @MaxLength(120) carrierName!: string;
  @IsString() @MaxLength(100) trackingCode!: string;
  @IsEnum(ShippingStatus) shippingStatus!: ShippingStatus;
}
