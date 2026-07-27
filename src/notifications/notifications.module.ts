import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { PrismaModule } from '../prisma/prisma.module';
import { SettingsModule } from '../settings/settings.module';
import { MockNotificationProvider } from './providers/mock-notification.provider';
import { NotificationQueueService } from './notification-queue.service';
import { NotificationsController } from './notifications.controller';

@Module({
  imports: [PrismaModule, SettingsModule],
  controllers: [NotificationsController],
  providers: [
    NotificationQueueService,
    NotificationsService,
    {
      provide: 'NOTIFICATION_PROVIDER',
      useClass: MockNotificationProvider,
    },
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
