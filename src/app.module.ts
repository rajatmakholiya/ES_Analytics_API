import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { ConfigModule } from '@nestjs/config';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { DailyAnalytics } from './modules/analytics/entities/daily-analytics.entity';

@Module({
  imports: [
    ConfigModule.forRoot(),
    ScheduleModule.forRoot(), // 👈 Required for the Cron Job to work
    
    // 👇 Database Connection
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT) || 5432,
      username: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'password',
      database: process.env.DB_NAME || 'analytics_db',
      entities: [DailyAnalytics],
      synchronize: true, // Auto-creates table (Set to false in Production)
    }),

    AnalyticsModule,
  ],
})
export class AppModule {}