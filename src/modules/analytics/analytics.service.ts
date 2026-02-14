import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { BigQueryService } from '../../common/bigquery/bigquery.service';
import { DailyAnalytics } from './entities/daily-analytics.entity';
import { subDays, format } from 'date-fns';
import * as fs from 'fs';
import * as path from 'path';

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
   * 1. READ LAYER (Serves Dashboard)
   * -------------------------------------------------------
   */
  async getMetrics(
    rollup: Rollup,
    startDate: string,
    endDate: string,
    filters: any,
  ) {
    const qb = this.analyticsRepo.createQueryBuilder('a');
    qb.where('a.date BETWEEN :startDate AND :endDate', { startDate, endDate });

    this.applyFilter(qb, 'utmSource', filters.utmSource);
    this.applyFilter(qb, 'utmMedium', filters.utmMedium);
    this.applyFilter(qb, 'utmCampaign', filters.utmCampaign);

    if (rollup === 'daily') {
      qb.select([
        "TO_CHAR(a.date, 'YYYY-MM-DD') as event_day",
        'a.utmSource as utm_source',
        'a.utmMedium as utm_medium',
        'a.utmCampaign as utm_campaign',
        'a.country as country',
        'a.city as city',
        'a.userGender as user_gender',
        'a.userAge as user_age',
        'a.sessions as sessions',
        'a.pageviews as pageviews',
        'a.users as users',
        'a.newUsers as new_users',
        'a.recurringUsers as recurring_users',
        'a.identifiedUsers as identified_users',
        'a.eventCount as event_count',
        'a.engagementRate as engagement_rate',
      ]);
      qb.orderBy('a.date', 'ASC');
    } else {
      const timeBucket =
        rollup === 'weekly'
          ? "DATE_TRUNC('week', a.date::date)"
          : "DATE_TRUNC('month', a.date::date)";

      qb.select([
        `${timeBucket} as period`,
        'SUM(a.sessions) as sessions',
        'SUM(a.users) as users',
        'SUM(a.recurringUsers) as recurring_users',
        'SUM(a.identifiedUsers) as identified_users',
      ]);
      qb.groupBy('period');
      qb.orderBy('period', 'ASC');
    }

    return await qb.getRawMany();
  }

  async getHeadlines(filters: { utmSource?: string | string[] } = {}) {
    const today = new Date();
    const yesterday = subDays(today, 1);
    const dayBeforeYesterday = subDays(today, 2);

    const last7Start = format(subDays(today, 7), 'yyyy-MM-dd');
    const last7End = format(yesterday, 'yyyy-MM-dd');
    const prev7Start = format(subDays(today, 14), 'yyyy-MM-dd');
    const prev7End = format(subDays(today, 8), 'yyyy-MM-dd');

    const [todayStats] = await this.getDateRangeStats(
      format(yesterday, 'yyyy-MM-dd'),
      format(yesterday, 'yyyy-MM-dd'),
      filters,
    );
    const [yesterdayStats] = await this.getDateRangeStats(
      format(dayBeforeYesterday, 'yyyy-MM-dd'),
      format(dayBeforeYesterday, 'yyyy-MM-dd'),
      filters,
    );
    const [thisWeekStats] = await this.getDateRangeStats(
      last7Start,
      last7End,
      filters,
    );
    const [lastWeekStats] = await this.getDateRangeStats(
      prev7Start,
      prev7End,
      filters,
    );

    return {
      daily: {
        date: format(yesterday, 'yyyy-MM-dd'),
        sessions: Number(todayStats?.sessions || 0),
        prevSessions: Number(yesterdayStats?.sessions || 0),
        diff: this.calculatePercentDiff(
          todayStats?.sessions,
          yesterdayStats?.sessions,
        ),
      },
      weekly: {
        range: `${last7Start} to ${last7End}`,
        sessions: Number(thisWeekStats?.sessions || 0),
        prevSessions: Number(lastWeekStats?.sessions || 0),
        diff: this.calculatePercentDiff(
          thisWeekStats?.sessions,
          lastWeekStats?.sessions,
        ),
      },
    };
  }

  /**
   * -------------------------------------------------------
   * 2. SYNC & IMPORT LAYER
   * -------------------------------------------------------
   */

  async importLegacyData() {
    this.logger.log('Starting Legacy Data Import...');
    const filePath = path.join(process.cwd(), 'legacy_data.csv');

    if (!fs.existsSync(filePath)) {
      throw new Error('legacy_data.csv not found in project root');
    }

    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const lines = fileContent.split(/\r?\n/);

    if (lines.length < 3)
      throw new Error('CSV file is empty or invalid format');

    const dateRow = this.parseCSVLine(lines[1]);
    const dateMap: Record<number, string> = {};
    const startDate = new Date('2025-11-04');
    const endDate = new Date('2026-02-08');

    dateRow.forEach((val, index) => {
      if (!val) return;

      const d = new Date(val);

      if (!isNaN(d.getTime())) {
        if (d >= startDate && d <= endDate) {
          dateMap[index] = format(d, 'yyyy-MM-dd');
        }
      }
    });

    this.logger.log(
      `Found ${Object.keys(dateMap).length} relevant date columns.`,
    );

    const batch: any[] = [];
    const dataLines = lines.slice(2);

    for (const line of dataLines) {
      if (!line.trim()) continue;
      const values = this.parseCSVLine(line);

      const newUtmLink = values[2];
      const oldUtmLink = values[3];
      const link =
        newUtmLink && newUtmLink.includes('utm_medium')
          ? newUtmLink
          : oldUtmLink;

      if (!link || !link.includes('utm_source')) continue;

      const utmMedium = this.extractParam(link, 'utm_medium');
      const utmSource = 'fb';

      if (!utmMedium) continue;

      for (const [colIndex, dateStr] of Object.entries(dateMap)) {
        const rawVal = values[Number(colIndex)];
        const clicks = rawVal ? Number(rawVal.replace(/,/g, '')) : 0;

        if (!isNaN(clicks) && clicks > 0) {
          batch.push({
            date: dateStr,
            utmSource: utmSource,
            utmMedium: utmMedium,
            utmCampaign: '(not set)',
            country: 'Unknown',
            city: 'Unknown',
            deviceCategory: 'Unknown',
            userGender: 'Unknown',
            userAge: 'Unknown',
            sessions: clicks,
            pageviews: clicks,
            users: clicks,
            newUsers: 0,
            recurringUsers: 0,
            identifiedUsers: 0,
            eventCount: clicks,
            engagementRate: 0,
          });
        }
      }
    }

    this.logger.log(`Inserting ${batch.length} legacy records...`);

    const BATCH_SIZE = 2000;
    for (let i = 0; i < batch.length; i += BATCH_SIZE) {
      const chunk = batch.slice(i, i + BATCH_SIZE);
      await this.analyticsRepo.upsert(chunk, [
        'date',
        'utmSource',
        'utmMedium',
        'utmCampaign',
        'country',
        'city',
        'deviceCategory',
        'userGender',
        'userAge',
      ]);
    }

    this.logger.log('Legacy Import Complete.');
    return batch.length;
  }

  @Cron('10 12 * * *', { timeZone: 'Asia/Kolkata' })
  async syncYesterdayData() {
    this.logger.log('Starting Daily Analytics Sync from BigQuery...');
    const query = `
      SELECT
        date, utm_source, utm_medium, utm_campaign,
        country, city, device_category, user_gender, user_age,
        sessions, pageviews, users, new_users, recurring_users, identified_users, event_count, engagement_rate
      FROM \`bigquerytest-486307.analytics_266571177.utm_daily_metrics\`
      WHERE date = DATE_SUB(CURRENT_DATE('Asia/Kolkata'), INTERVAL 1 DAY)
    `;

    try {
      const rows = await this.bq.query(query);
      if (!rows || rows.length === 0) {
        this.logger.warn('No data found in BigQuery.');
        return;
      }

      this.logger.log(`Found ${rows.length} rows. Processing...`);

      const entities = rows.map((row: any) => ({
        date: row.date.value || row.date,
        utmSource: row.utm_source,
        utmMedium: row.utm_medium,
        utmCampaign: row.utm_campaign,
        country: row.country,
        city: row.city,
        deviceCategory: row.device_category,
        userGender: row.user_gender,
        userAge: row.user_age,
        sessions: Number(row.sessions),
        pageviews: Number(row.pageviews),
        users: Number(row.users),
        newUsers: Number(row.new_users),
        recurringUsers: Number(row.recurring_users),
        identifiedUsers: Number(row.identified_users),
        eventCount: Number(row.event_count),
        engagementRate: Number(row.engagement_rate),
      }));

      const BATCH_SIZE = 2500;
      for (let i = 0; i < entities.length; i += BATCH_SIZE) {
        const batch = entities.slice(i, i + BATCH_SIZE);
        await this.analyticsRepo.upsert(batch, [
          'date',
          'utmSource',
          'utmMedium',
          'utmCampaign',
          'country',
          'city',
          'deviceCategory',
          'userGender',
          'userAge',
        ]);
      }
      this.logger.log('Daily Sync Complete.');
    } catch (error) {
      this.logger.error('Sync Failed:', error);
    }
  }

  /**
   * -------------------------------------------------------
   * 3. HELPER METHODS
   * -------------------------------------------------------
   */

  private extractParam(url: string, param: string): string | null {
    try {
      const match = url.match(new RegExp(`[?&]${param}=([^&]+)`));
      return match ? match[1] : null;
    } catch {
      return null;
    }
  }

  private parseCSVLine(text: string): string[] {
    const result: string[] = [];
    let start = 0;
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      if (text[i] === '"') {
        inQuotes = !inQuotes;
      } else if (text[i] === ',' && !inQuotes) {
        let field = text.substring(start, i).trim();
        if (field.startsWith('"') && field.endsWith('"'))
          field = field.slice(1, -1);
        result.push(field);
        start = i + 1;
      }
    }
    let lastField = text.substring(start).trim();
    if (lastField.startsWith('"') && lastField.endsWith('"'))
      lastField = lastField.slice(1, -1);
    result.push(lastField);
    return result;
  }

  private async getDateRangeStats(
    startDate: string,
    endDate: string,
    filters: { utmSource?: string | string[] },
  ) {
    const qb = this.analyticsRepo
      .createQueryBuilder('a')
      .select('SUM(a.sessions)', 'sessions')
      .addSelect('SUM(a.users)', 'users')
      .where('a.date BETWEEN :startDate AND :endDate', { startDate, endDate });
    this.applyFilter(qb, 'utmSource', filters.utmSource);
    return qb.getRawMany();
  }

  private calculatePercentDiff(current: number, previous: number) {
    if (!previous) return current > 0 ? 100 : 0;
    return Number((((current - previous) / previous) * 100).toFixed(2));
  }

  private applyFilter(qb: any, column: string, value?: string | string[]) {
    if (!value) return;
    if (Array.isArray(value)) {
      qb.andWhere(`a.${column} IN (:...${column})`, { [column]: value });
    } else {
      qb.andWhere(`a.${column} = :${column}`, { [column]: value });
    }
  }
}
