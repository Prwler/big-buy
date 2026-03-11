import {
  IsNumber,
  IsObject,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

class ShippingAddressDto {
  @ApiProperty({ example: '12 Broad Street' })
  @IsString()
  line1: string;

  @ApiProperty({ example: 'Lagos' })
  @IsString()
  city: string;

  @ApiProperty({ example: 'Lagos' })
  @IsString()
  state: string;

  @ApiProperty({ example: '100001' })
  @IsString()
  zip: string;

  @ApiProperty({ example: 'Nigeria' })
  @IsString()
  country: string;
}

export class CreateOrderDto {
  @ApiProperty({ example: 'uuid-of-listing' })
  @IsUUID()
  listingId: string;

  @ApiPropertyOptional({ example: 5.00 })
  @IsNumber()
  @IsPositive()
  @IsOptional()
  shippingFee?: number;

  @ApiProperty()
  @ValidateNested()
  @Type(() => ShippingAddressDto)
  shippingAddress: ShippingAddressDto;
}