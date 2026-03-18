import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ReviewsService } from './reviews.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../auth/entities/user.entity';

@ApiTags('Reviews')
@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  // ── Public endpoints ────────────────────────────────────

  @Get('seller/:sellerId')
  @ApiOperation({ summary: 'Get all reviews for a seller' })
  findBySeller(
    @Param('sellerId', ParseUUIDPipe) sellerId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.reviewsService.findBySeller(sellerId, page, limit);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single review' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.reviewsService.findOne(id);
  }

  // ── Buyer endpoints ─────────────────────────────────────

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('buyer', 'admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Leave a review for a completed order' })
  create(@Body() dto: CreateReviewDto, @CurrentUser() user: User) {
    return this.reviewsService.create(dto, user);
  }

  // ── Admin endpoints ─────────────────────────────────────

  @Patch(':id/hide')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] Hide a review without deleting it' })
  hide(@Param('id', ParseUUIDPipe) id: string) {
    return this.reviewsService.hide(id);
  }
}