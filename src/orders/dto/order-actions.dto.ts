import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ShipOrderDto {
  @ApiProperty({ example: 'DHL-123456789' })
  @IsString()
  @IsNotEmpty()
  trackingNumber: string;
}

export class CancelOrderDto {
  @ApiProperty({ example: 'Changed my mind' })
  @IsString()
  @IsNotEmpty()
  reason: string;
}