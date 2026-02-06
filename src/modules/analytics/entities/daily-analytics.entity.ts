import { Entity, Column, PrimaryGeneratedColumn, Index, Unique } from 'typeorm';

@Entity('daily_analytics')
@Unique(['date', 'utmSource', 'utmMedium', 'utmCampaign']) // Prevents duplicate days
export class DailyAnalytics {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column({ type: 'date' })
  date: string; // YYYY-MM-DD

  @Column({ default: '(direct)' })
  utmSource: string;

  @Column({ default: '(none)' })
  utmMedium: string;

  @Column({ default: '(not set)' })
  utmCampaign: string;

  // Metrics
  @Column({ type: 'int', default: 0 })
  sessions: number;

  @Column({ type: 'int', default: 0 })
  pageviews: number;

  @Column({ type: 'int', default: 0 })
  users: number;

  @Column({ type: 'int', default: 0 })
  newUsers: number;

  @Column({ type: 'int', default: 0 })
  eventCount: number;

  @Column({ type: 'decimal', precision: 5, scale: 4, default: 0 })
  engagementRate: number; // Stored as 0.5543
}