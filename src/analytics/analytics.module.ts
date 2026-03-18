import { Module } from '@nestjs/common';
import { AggregationJob } from './jobs/aggregation.job';
import { ReportingService } from './reporting/reporting.service';
import { ReportingController } from './reporting/reporting.controller';

@Module({
  controllers: [ReportingController],
  providers: [AggregationJob, ReportingService],
  exports: [ReportingService, AggregationJob],
})
export class AnalyticsModule {}