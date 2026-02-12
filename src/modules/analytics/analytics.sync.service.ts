import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { BigQueryService } from '../../common/bigquery/bigquery.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DailyAnalytics } from './entities/daily-analytics.entity';

@Injectable()
export class AnalyticsSyncService {
  private readonly logger = new Logger(AnalyticsSyncService.name);

  constructor(
    private readonly bq: BigQueryService,
    @InjectRepository(DailyAnalytics)
    private readonly metricRepo: Repository<DailyAnalytics>,
  ) {}

  @Cron('30 12 * * *', { timeZone: 'Asia/Kolkata' })
  async syncYesterdayData() {
    this.logger.log('Starting Daily Analytics Sync...');

    const query = `
      SELECT
        event_day as date,
        utm_source, utm_medium, utm_campaign,
        COUNT(DISTINCT CONCAT(user_pseudo_id, CAST(ga_session_id AS STRING))) as sessions,
        COUNTIF(event_name = 'page_view') as pageviews,
        COUNT(DISTINCT user_pseudo_id) as users,
        COUNT(DISTINCT CASE WHEN event_name = 'first_visit' THEN user_pseudo_id END) as new_users,
        COUNT(*) as event_count,
        SAFE_DIVIDE(COUNT(DISTINCT CASE WHEN session_engaged = '1' THEN CONCAT(user_pseudo_id, CAST(ga_session_id AS STRING)) END), COUNT(DISTINCT CONCAT(user_pseudo_id, CAST(ga_session_id AS STRING)))) as engagement_rate
      FROM \`bigquerytest-486307.analytics_266571177.events_utm_base\`
      WHERE event_day = DATE_SUB(CURRENT_DATE('Asia/Kolkata'), INTERVAL 1 DAY)
      GROUP BY 1, 2, 3, 4
    `;

    const rows = await this.bq.query(query);

    if (rows.length === 0) {
      this.logger.warn('No data found for yesterday.');
      return;
    }

    this.logger.log(`Found ${rows.length} rows. Upserting to Database...`);

    await this.metricRepo.upsert(
      rows.map((row) => ({
        date: row.date.value,
        utmSource: row.utm_source,
        utmMedium: row.utm_medium,
        utmCampaign: row.utm_campaign,
        sessions: Number(row.sessions),
        pageviews: Number(row.pageviews),
        users: Number(row.users),
        newUsers: Number(row.new_users),
        eventCount: Number(row.event_count),
        engagementRate: Number(row.engagement_rate),
      })),
      ['date', 'utmSource', 'utmMedium', 'utmCampaign'],
    );

    this.logger.log('Sync Complete.');
  }
}
