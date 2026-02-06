import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AnalyticsService } from './analytics.service';
import { AnalyticsController } from './analytics.controller';
import { DailyAnalytics } from './entities/daily-analytics.entity';
import { BigQueryModule } from 'src/common/bigquery/bigquery.module';

@Module({
  imports: [
    // 👇 Register the Entity here
    TypeOrmModule.forFeature([DailyAnalytics]), 
    BigQueryModule,
  ],
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}