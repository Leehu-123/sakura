import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Min } from 'class-validator';
import { ConflictException } from '@nestjs/common';
export class VersionDto {
  @ApiProperty() @IsInt() @Min(1) version!: number;
}
export function checkVersion(actual: number, expected: number) {
  if (actual !== expected)
    throw new ConflictException(
      'Dữ liệu vừa thay đổi hoặc khách đã được bàn giao. Hãy tải lại trước khi lưu.',
    );
}
