import { Entity, Column, PrimaryGeneratedColumn, Index, Unique } from 'typeorm';

@Entity('daily_analytics')
@Unique([
  'date',
  'utmSource',
  'utmMedium',
  'utmCampaign',
  'country',
  'city',
  'deviceCategory',
  'userGender',
  'userAge',
])
export class DailyAnalytics {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column({ type: 'date' })
  date: string;

  @Column({ default: '(direct)' })
  utmSource: string;

  @Column({ default: '(none)' })
  utmMedium: string;

  @Column({ default: '(not set)' })
  utmCampaign: string;

  @Column({ nullable: true })
  country: string;

  @Column({ nullable: true })
  city: string;

  @Column({ nullable: true })
  deviceCategory: string;

  @Column({ nullable: true })
  userGender: string;

  @Column({ nullable: true })
  userAge: string;

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
  recurringUsers: number;

  @Column({ type: 'int', default: 0 })
  identifiedUsers: number;

  @Column({ type: 'int', default: 0 })
  eventCount: number;

  @Column({ type: 'decimal', precision: 5, scale: 4, default: 0 })
  engagementRate: number;
}
