import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { BigQueryService } from '../../common/bigquery/bigquery.service';
import { DailyAnalytics } from './entities/daily-analytics.entity';

type Rollup = 'daily' | 'weekly' | 'monthly';

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(
    @InjectRepository(DailyAnalytics)
    private readonly analyticsRepo: Repository<DailyAnalytics>,
    private readonly bq: BigQueryService,
  ) {}

  /**
   * -------------------------------------------------------
   * 1. READ LAYER (Serves Dashboard from Postgres)
   * -------------------------------------------------------
   */
  async getMetrics(
    rollup: Rollup,
    startDate: string,
    endDate: string,
    filters: {
      utmSource?: string | string[];
      utmMedium?: string | string[];
      utmCampaign?: string | string[];
    },
  ) {
    const qb = this.analyticsRepo.createQueryBuilder('a');

    // 1. Base Date Filter
    qb.where('a.date BETWEEN :startDate AND :endDate', { startDate, endDate });

    // 2. Apply Dynamic Filters
    this.applyFilter(qb, 'utmSource', filters.utmSource);
    this.applyFilter(qb, 'utmMedium', filters.utmMedium);
    this.applyFilter(qb, 'utmCampaign', filters.utmCampaign);

    // 3. Dynamic Selection based on Rollup
    if (rollup === 'daily') {
      // Return raw daily rows
      qb.select([
        "TO_CHAR(a.date, 'YYYY-MM-DD') as event_day", // ✅ FIXED: Renamed 'period' back to 'date'
        'a.utmSource as utm_source',
        'a.utmMedium as utm_medium',
        'a.utmCampaign as utm_campaign',
        'a.sessions as sessions',
        'a.pageviews as pageviews',
        'a.users as users',
        'a.newUsers as new_users',
        'a.eventCount as event_count',
        'a.engagementRate as engagement_rate',
      ]);
      qb.orderBy('a.date', 'ASC');
    } else {
      // Keep 'period' for Weekly/Monthly as those represent ranges
      // ... (rest of the else block)else {
      // Aggregation for Weekly/Monthly
      // Note: In Postgres, we define the time bucket (week/month)
      const timeBucket =
        rollup === 'weekly'
          ? "DATE_TRUNC('week', a.date::date)"
          : "DATE_TRUNC('month', a.date::date)";

      qb.select([
        `${timeBucket} as period`, // Groups by Week Start or Month Start
        'a.utmSource as utm_source',
        'a.utmMedium as utm_medium',
        'a.utmCampaign as utm_campaign',
        'SUM(a.sessions) as sessions',
        'SUM(a.pageviews) as pageviews',
        'SUM(a.users) as users', // Note: This sums DAU. True Unique Users across a month requires raw data.
        'SUM(a.newUsers) as new_users',
        'SUM(a.eventCount) as event_count',
        'AVG(a.engagementRate) as engagement_rate', // Average the rate
      ]);

      qb.groupBy('period, a.utmSource, a.utmMedium, a.utmCampaign');
      qb.orderBy('period', 'ASC');
    }

    return await qb.getRawMany();
  }

  /**
   * -------------------------------------------------------
   * 2. SYNC LAYER (Moves Data BQ -> Postgres)
   * Runs automatically every day at 09:30 AM
   * -------------------------------------------------------
   */
  @Cron('30 09 * * *', { timeZone: 'Asia/Kolkata' })
  async syncYesterdayData() {
    this.logger.log('🔄 Starting Daily Analytics Sync from BigQuery...');

    // Query BigQuery for Yesterday's Data
    // Matches the schema of 'events_utm_base'
    const query = `
      SELECT
        event_day as date,
        utm_source, 
        utm_medium, 
        utm_campaign,
        COUNT(DISTINCT CONCAT(user_pseudo_id, CAST(ga_session_id AS STRING))) as sessions,
        COUNTIF(event_name = 'page_view') as pageviews,
        COUNT(DISTINCT user_pseudo_id) as users,
        COUNT(DISTINCT CASE WHEN event_name = 'first_visit' THEN user_pseudo_id END) as new_users,
        COUNT(*) as event_count,
        SAFE_DIVIDE(
          COUNT(DISTINCT CASE WHEN session_engaged = '1' THEN CONCAT(user_pseudo_id, CAST(ga_session_id AS STRING)) END),
          COUNT(DISTINCT CONCAT(user_pseudo_id, CAST(ga_session_id AS STRING)))
        ) as engagement_rate
      FROM \`bigquerytest-486307.analytics_266571177.events_utm_base\`
      -- Dynamic Date: Always fetches 'Yesterday'
      WHERE event_day = DATE_SUB(CURRENT_DATE('Asia/Kolkata'), INTERVAL 1 DAY)
      GROUP BY 1, 2, 3, 4
    `;

    try {
      const rows = await this.bq.query(query);

      if (!rows || rows.length === 0) {
        this.logger.warn('⚠️ No data found in BigQuery for yesterday.');
        return;
      }

      this.logger.log(`📥 Found ${rows.length} rows. Syncing to Database...`);

      // Prepare Data for Upsert (Insert or Update if exists)
      const entities = rows.map((row) => ({
        date: row.date.value, // BigQuery date object comes as { value: '2026-...' }
        utmSource: row.utm_source,
        utmMedium: row.utm_medium,
        utmCampaign: row.utm_campaign,
        sessions: Number(row.sessions),
        pageviews: Number(row.pageviews),
        users: Number(row.users),
        newUsers: Number(row.new_users),
        eventCount: Number(row.event_count),
        engagementRate: Number(row.engagement_rate),
      }));

      // Bulk Upsert
      // Requires constraint on [date, utmSource, utmMedium, utmCampaign] in Entity
      await this.analyticsRepo.upsert(entities, [
        'date',
        'utmSource',
        'utmMedium',
        'utmCampaign',
      ]);

      this.logger.log('✅ Daily Sync Complete.');
    } catch (error) {
      this.logger.error('❌ Sync Failed:', error);
    }
  }

  // --- Helper for Filters ---
  private applyFilter(
    qb: any,
    column: string,
    value: string | string[] | undefined,
  ) {
    if (!value) return;

    if (Array.isArray(value)) {
      qb.andWhere(`a.${column} IN (:...${column})`, { [column]: value });
    } else {
      qb.andWhere(`a.${column} = :${column}`, { [column]: value });
    }
  }
}
