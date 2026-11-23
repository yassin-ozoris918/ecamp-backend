import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { PrismaModule } from '../prisma/prisma.module';
import { SettingsModule } from '../settings/settings.module';
import { MockNotificationProvider } from './providers/mock-notification.provider';
import { NotificationRecipientsService } from './notification-recipients';
import { NotificationWorkerService } from './notification-worker.service';
import { StudentNotificationsService } from './student-notifications.service';
import { StudentNotificationsController } from './student-notifications.controller';

@Module({
  imports: [PrismaModule, SettingsModule],
  controllers: [StudentNotificationsController],
  providers: [
    NotificationsService,
    NotificationRecipientsService,
    NotificationWorkerService,
    StudentNotificationsService,
    {
      provide: 'NOTIFICATION_PROVIDER',
      useClass: MockNotificationProvider,
    },
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
