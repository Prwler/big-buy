import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ReportingService } from './reporting.service';
import { AggregationJob } from '../jobs/aggregation.job';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { User } from '../../auth/entities/user.entity';

@ApiTags('Analytics')
@Controller('analytics')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class ReportingController {
  constructor(
    private readonly reportingService: ReportingService,
    private readonly aggregationJob: AggregationJob,
  ) {}

  // ── Admin endpoints ──────────────────────────────────────

  @Get('sales/daily')
  @Roles('admin')
  @ApiOperation({ summary: '[Admin] Daily marketplace sales with 7-day rolling avg GMV' })
  @ApiQuery({ name: 'days', required: false, type: Number })
  getDailySales(@Query('days') days?: number) {
    return this.reportingService.getDailySalesSummary(days);
  }

  @Get('sellers/top')
  @Roles('admin')
  @ApiOperation({ summary: '[Admin] Top sellers ranked by revenue' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'days', required: false, type: Number })
  getTopSellers(
    @Query('limit') limit?: number,
    @Query('days') days?: number,
  ) {
    return this.reportingService.getTopSellers(limit, days);
  }

  @Get('categories/trends')
  @Roles('admin')
  @ApiOperation({ summary: '[Admin] Category trends with week-over-week GMV growth' })
  @ApiQuery({ name: 'weeks', required: false, type: Number })
  getCategoryTrends(@Query('weeks') weeks?: number) {
    return this.reportingService.getCategoryTrends(weeks);
  }

  // ── Seller self-service — must be above /:id ────────────

  @Get('sellers/me')
  @Roles('seller', 'admin')
  @ApiOperation({ summary: '[Seller] My own performance dashboard' })
  @ApiQuery({ name: 'days', required: false, type: Number })
  myPerformance(@CurrentUser() user: User, @Query('days') days?: number) {
    return this.reportingService.getSellerPerformance(user.id, days);
  }

  @Get('sellers/:id')
  @Roles('admin')
  @ApiOperation({ summary: '[Admin] Performance dashboard for any seller' })
  @ApiQuery({ name: 'days', required: false, type: Number })
  sellerPerformance(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('days') days?: number,
  ) {
    return this.reportingService.getSellerPerformance(id, days);
  }

  // ── Manual job trigger ───────────────────────────────────

  @Post('run-jobs')
  @Roles('admin')
  @ApiOperation({ summary: '[Admin] Manually trigger all aggregation jobs' })
  runJobs() {
    return this.aggregationJob.runAll();
  }
}