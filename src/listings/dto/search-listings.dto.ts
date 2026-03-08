import { IsEnum, IsNumber, IsOptional, IsPositive, IsString, IsUUID, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import type { ListingCondition } from '../entities/listing.entity';

export class SearchListingsDto {
  @ApiPropertyOptional({ example: 'nike shoes' })
  @IsString()
  @IsOptional()
  q?: string;

  @ApiPropertyOptional({ example: 'uuid-of-category' })
  @IsUUID()
  @IsOptional()
  categoryId?: string;

  @ApiPropertyOptional({ enum: ['new', 'like_new', 'good', 'fair', 'poor'] })
  @IsEnum(['new', 'like_new', 'good', 'fair', 'poor'])
  @IsOptional()
  condition?: ListingCondition;

  @ApiPropertyOptional({ example: 10 })
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  @IsOptional()
  minPrice?: number;

  @ApiPropertyOptional({ example: 500 })
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  @IsOptional()
  maxPrice?: number;

  @ApiPropertyOptional({ example: 'Lagos' })
  @IsString()
  @IsOptional()
  location?: string;

  @ApiPropertyOptional({ example: 1, default: 1 })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @IsOptional()
  page?: number = 1;

  @ApiPropertyOptional({ example: 20, default: 20 })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @IsOptional()
  limit?: number = 20;

  @ApiPropertyOptional({ enum: ['created_at', 'price', 'view_count'], default: 'created_at' })
  @IsEnum(['created_at', 'price', 'view_count'])
  @IsOptional()
  sortBy?: string = 'created_at';

  @ApiPropertyOptional({ enum: ['ASC', 'DESC'], default: 'DESC' })
  @IsEnum(['ASC', 'DESC'])
  @IsOptional()
  sortOrder?: 'ASC' | 'DESC' = 'DESC';
}