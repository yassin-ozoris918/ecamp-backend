import { Injectable, Inject, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OnEvent } from '@nestjs/event-emitter';
import { SettingsService } from '../settings/settings.service';
import type { NotificationProvider } from './providers/notification-provider.interface';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private prisma: PrismaService,
    private settingsService: SettingsService,
    @Inject('NOTIFICATION_PROVIDER') private provider: NotificationProvider,
  ) {}

  @OnEvent('user.registered')
  async handleUserRegistered(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) return;

    // Send Welcome Email
    await this.provider.sendEmail({
      to: user.email,
      subject: 'Welcome to the Platform!',
      body: `Hello ${user.fullName}, welcome!`,
    });

    // Check if WhatsApp feature is enabled
    const enableWhatsApp = await this.settingsService.getSetting(
      'EnableWhatsApp',
      false,
    );
    if (enableWhatsApp && user.phoneNumber) {
      await this.provider.sendWhatsApp({
        to: user.phoneNumber,
        body: `Welcome ${user.fullName} to the LMS platform!`,
      });
    }
  }
}
