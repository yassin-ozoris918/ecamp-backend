import { Injectable, Logger } from '@nestjs/common';
import {
  NotificationProvider,
  NotificationPayload,
} from './notification-provider.interface';

@Injectable()
export class MockNotificationProvider implements NotificationProvider {
  private readonly logger = new Logger(MockNotificationProvider.name);

  async sendEmail(payload: NotificationPayload): Promise<boolean> {
    this.logger.log(
      `[MOCK EMAIL] To: ${payload.to} | Subject: ${payload.subject} | Body: ${payload.body}`,
    );
    return true;
  }

  async sendSMS(payload: NotificationPayload): Promise<boolean> {
    this.logger.log(`[MOCK SMS] To: ${payload.to} | Body: ${payload.body}`);
    return true;
  }

  async sendWhatsApp(payload: NotificationPayload): Promise<boolean> {
    this.logger.log(
      `[MOCK WHATSAPP] To: ${payload.to} | Body: ${payload.body}`,
    );
    return true;
  }
}
