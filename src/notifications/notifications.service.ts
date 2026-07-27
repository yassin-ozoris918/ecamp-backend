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



  async sendParentWhatsApp(
    parentPhone: string,
    studentName: string,
    examName: string,
    score: number,
  ) {
    if (!parentPhone) return;

    const enableWhatsApp = await this.settingsService.getSetting(
      'EnableWhatsApp',
      false,
    );
    if (!enableWhatsApp) return;

    try {
      const message = `🎓 *E.Camp Update*\n\nYour student, ${studentName}, has just completed the assessment: *${examName}*.\n\n📊 *Final Score:* ${score}%\n\nKeep up the great work!`;

      await this.provider.sendWhatsApp({
        to: parentPhone,
        body: message,
      });

      this.logger.log(
        `[WhatsApp Sent] To: ${parentPhone} | Message: ${message.replace(/\n/g, ' ')}`,
      );
    } catch (error) {
      // We don't want to crash the whole grading process just because a WhatsApp message failed to send
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Failed to send WhatsApp to ${parentPhone}:`,
        errorMessage,
      );
    }
  }
}
