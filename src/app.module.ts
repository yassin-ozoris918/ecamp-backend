import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CacheModule } from '@nestjs/cache-manager';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { redisInsStore } from 'cache-manager-redis-yet';
import { createClient } from 'redis';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import Redis from 'ioredis';

// Existing Imports
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AttachmentsModule } from './attachments/attachments.module';
import { AuthModule } from './auth/auth.module';
import { PrismaModule } from './prisma/prisma.module';
import { CoursesModule } from './courses/courses.module';
import { ChaptersModule } from './chapters/chapters.module';
import { LecturesModule } from './lectures/lectures.module';
import { SessionsModule } from './sessions/sessions.module';
import { ActivationCodesModule } from './activation-codes/activation-codes.module';
import { QuizzesModule } from './quizzes/quizzes.module';
import { ProgressModule } from './progress/progress.module';
import { ExamsModule } from './exams/exams.module';
import { AiModule } from './ai/ai.module';
import { StorageModule } from './storage/storage.module';
import { NotificationsModule } from './notifications/notifications.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { SystemAuditInterceptor } from './common/interceptors/audit.interceptor';
import { SettingsModule } from './settings/settings.module';

import { EventEmitterModule } from '@nestjs/event-emitter';
import { UsersModule } from './users/users.module';
import { AdminModule } from './admin/admin.module';
import { InstructorDashboardModule } from './instructor-dashboard/instructor-dashboard.module';
import { GamificationModule } from './gamification/gamification.module';
import { CertificatesModule } from './certificates/certificates.module';
import { CourseAttachmentsModule } from './course-attachments/course-attachments.module';
import { ChapterAttachmentsModule } from './chapter-attachments/chapter-attachments.module';
import { MediaModule } from './media/media.module';
import { ReorderModule } from './reorder/reorder.module';
import { ExportModule } from './export/export.module';

@Module({
  imports: [
    // 1. Global Config Setup (Required to read REDIS env variables)
    ConfigModule.forRoot({ isGlobal: true }),

    // Global Event Emitter
    EventEmitterModule.forRoot(),

    // 2. Global Redis Cache Setup
    CacheModule.registerAsync({
      isGlobal: true,
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => {
        try {
          const useTls = configService.get<string>('REDIS_TLS') === 'true';
          const host = configService.get<string>('REDIS_HOST') || 'localhost';
          const port = configService.get<string>('REDIS_PORT') || '6379';
          const password = configService.get<string>('REDIS_PASSWORD');
          
          const protocol = useTls ? 'rediss' : 'redis';
          const url = password ? `${protocol}://default:${encodeURIComponent(password)}@${host}:${port}` : `${protocol}://${host}:${port}`;

          const client = createClient({ url });

          client.on('error', (err) => {
            console.warn('Redis Cache Error:', err.message);
          });

          await client.connect();

          const store = redisInsStore(client as any, { ttl: 60 * 1000 });
          return { store };
        } catch (e) {
          console.warn('Redis not running, falling back to in-memory cache');
          return { ttl: 60 * 1000 };
        }
      },
    }),

    // 3. Global Rate Limiter Setup (Security Layer)
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        let storage;
        try {
          const useTls = configService.get<string>('REDIS_TLS') === 'true';
          const host = configService.get<string>('REDIS_HOST') || 'localhost';
          const port = configService.get<string>('REDIS_PORT') || '6379';
          const password = configService.get<string>('REDIS_PASSWORD');
          
          const protocol = useTls ? 'rediss' : 'redis';
          const url = password ? `${protocol}://default:${encodeURIComponent(password)}@${host}:${port}` : `${protocol}://${host}:${port}`;

          storage = new ThrottlerStorageRedisService(new Redis(url, { maxRetriesPerRequest: 3 }));
        } catch {
          console.warn('Redis not running, rate limiter falling back to in-memory storage');
        }
        return {
          throttlers: [
            {
              ttl: 60000,
              limit: 100,
            },
          ],
          storage,
        };
      },
    }),

    // 4. Your Application Modules
    AuthModule,
    AttachmentsModule,
    PrismaModule,
    CoursesModule,
    ChaptersModule,
    LecturesModule,
    SessionsModule,
    ActivationCodesModule,
    QuizzesModule,
    ProgressModule,
    ExamsModule,
    AiModule,
    StorageModule,
    NotificationsModule,
    AnalyticsModule,
    UsersModule,
    AdminModule,
    InstructorDashboardModule,
    GamificationModule,
    CertificatesModule,
    CourseAttachmentsModule,
    ChapterAttachmentsModule,
    MediaModule,
    ReorderModule,
    ExportModule,
  ],
  controllers: [AppController],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: SystemAuditInterceptor,
    },
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },

  ],
})
export class AppModule {}
