import { Module } from '@nestjs/common';
import { BigQueryService } from './bigquery.service';

@Module({
  providers: [BigQueryService],
  exports: [BigQueryService], // 👈 Critical: This allows AnalyticsModule to use the service
})
export class BigQueryModule {}