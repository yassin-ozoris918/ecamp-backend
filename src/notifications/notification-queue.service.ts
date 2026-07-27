import { Injectable, Logger, Inject } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OnEvent } from '@nestjs/event-emitter';
import type { NotificationProvider } from './providers/notification-provider.interface';
import { NotificationEventCategory, NotificationChannelType, NotificationDeliveryStatus } from '@prisma/client';

@Injectable()
export class NotificationQueueService {
  private readonly logger = new Logger(NotificationQueueService.name);

  constructor(
    private prisma: PrismaService,
    @Inject('NOTIFICATION_PROVIDER') private provider: NotificationProvider,
  ) {}

  @OnEvent('risk.alert', { async: true }) // Simulated detached asynchronous execution
  async handleRiskAlert(payload: {
    studentId: string;
    eventCategory: 'QUIZ_FAILED' | 'EXAM_FAILED';
    metrics: { consecutiveFailures: number; runningAverageScore: number };
  }) {
    this.logger.log(`Processing risk alert for student ${payload.studentId}`);

    const student = await this.prisma.user.findUnique({
      where: { id: payload.studentId },
      select: { fullName: true, parentPhoneNumber: true, educationLevel: true }
    });

    if (!student || !student.parentPhoneNumber) {
       this.logger.warn(`Cannot send risk alert to parent of ${payload.studentId} - missing parent phone number.`);
       return;
    }

    const messageContent = `⚠️ *E.Camp Academic Alert* ⚠️

Dear Parent,
This is an automated notification regarding ${student.fullName}. They have recently experienced consecutive academic challenges or a drop in their running average.

Metrics:
- Consecutive Failures: ${payload.metrics.consecutiveFailures}
- Running Average: ${payload.metrics.runningAverageScore.toFixed(1)}%

Please review their progress on the platform.`;

    // Create log in pending state
    const log = await this.prisma.parentNotificationLog.create({
      data: {
        studentId: payload.studentId,
        parentPhoneNumber: student.parentPhoneNumber,
        eventCategory: payload.eventCategory,
        channelType: NotificationChannelType.WHATSAPP,
        deliveryStatus: NotificationDeliveryStatus.PENDING,
        messageContent,
      }
    });

    try {
      await this.provider.sendWhatsApp({
        to: student.parentPhoneNumber,
        body: messageContent,
      });

      await this.prisma.parentNotificationLog.update({
        where: { id: log.id },
        data: { deliveryStatus: NotificationDeliveryStatus.DELIVERED }
      });
      this.logger.log(`Delivered risk alert WhatsApp for ${student.fullName} to ${student.parentPhoneNumber}`);
    } catch (error: any) {
      this.logger.error(`Failed to deliver risk alert to ${student.parentPhoneNumber}: ${error.message}`);
      await this.prisma.parentNotificationLog.update({
        where: { id: log.id },
        data: { 
          deliveryStatus: NotificationDeliveryStatus.FAILED,
          errorNote: error.message || 'Unknown provider error'
        }
      });
    }
  }
}
