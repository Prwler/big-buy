import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { ListingCondition } from '../entities/listing.entity';

export class CreateListingDto {
  @ApiProperty({ example: 'Nike Air Max 90 - Size 10' })
  @IsString()
  @IsNotEmpty()
  @MinLength(5)
  title: string;

  @ApiProperty({ example: 'Worn twice, in great condition. No box included.' })
  @IsString()
  @IsNotEmpty()
  @MinLength(10)
  description: string;

  @ApiProperty({ example: 79.99 })
  @IsNumber()
  @IsPositive()
  price: number;

  @ApiProperty({ enum: ['new', 'like_new', 'good', 'fair', 'poor'] })
  @IsEnum(['new', 'like_new', 'good', 'fair', 'poor'])
  condition: ListingCondition;

  @ApiProperty({ example: 'uuid-of-category' })
  @IsUUID()
  categoryId: string;

  @ApiPropertyOptional({ example: 'Lagos, Nigeria' })
  @IsString()
  @IsOptional()
  location?: string;

  @ApiPropertyOptional({ example: { brand: 'Nike', size: '10', color: 'white' } })
  @IsObject()
  @IsOptional()
  attributes?: Record<string, any>;
}