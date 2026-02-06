import { Controller, Get, Post, Query, HttpException, HttpStatus } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';

@Controller('v1/analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  /**
   * -------------------------------------------------------
   * GET /v1/analytics/utm/metrics
   * -------------------------------------------------------
   * Fetches dashboard data from the local PostgreSQL database.
   * fast, cheap, and supports Daily/Weekly/Monthly rollups.
   */
  @Get('utm/metrics')
  async getUtmMetrics(
    @Query('rollup') rollup: 'daily' | 'weekly' | 'monthly',
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('utmSource') utmSource?: string,
    @Query('utmMedium') utmMedium?: string,
    @Query('utmCampaign') utmCampaign?: string,
  ) {
    if (!rollup || !startDate || !endDate) {
      throw new HttpException(
        'Missing required parameters: rollup, startDate, endDate',
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      // Handles both single string and array filters (e.g. ?utmMedium=a&utmMedium=b)
      const filters = {
        utmSource: utmSource ? (Array.isArray(utmSource) ? utmSource : [utmSource]) : undefined,
        utmMedium: utmMedium ? (Array.isArray(utmMedium) ? utmMedium : [utmMedium]) : undefined,
        utmCampaign: utmCampaign ? (Array.isArray(utmCampaign) ? utmCampaign : [utmCampaign]) : undefined,
      };

      return await this.analyticsService.getMetrics(rollup, startDate, endDate, filters);
    } catch (error) {
      console.error('Error fetching metrics:', error);
      throw new HttpException('Internal Server Error', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * -------------------------------------------------------
   * POST /v1/analytics/sync/manual
   * -------------------------------------------------------
   * Manually triggers the BigQuery -> Postgres sync.
   * Useful for:
   * 1. Initial Backfill (loading history).
   * 2. Force updating today's data if something was missed.
   */
  @Post('sync/manual')
  async triggerManualSync() {
    try {
      console.log('⚡ Manual Sync Triggered via API...');
      
      // Calls the same logic that runs at 9:30 AM automatically
      // NOTE: Check your 'analytics.service.ts' SQL query before running this!
      // If you want history, change the SQL to "WHERE event_day >= '2026-01-01'" temporarily.
      await this.analyticsService.syncYesterdayData();

      return {
        status: 'success',
        message: 'Sync job started. Check server logs for progress.',
      };
    } catch (error) {
      throw new HttpException(
        `Sync failed: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}