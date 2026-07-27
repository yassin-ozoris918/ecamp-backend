export interface NotificationPayload {
  to: string;
  subject?: string;
  body: string;
  data?: any;
}

export interface NotificationProvider {
  sendEmail(payload: NotificationPayload): Promise<boolean>;
  sendSMS(payload: NotificationPayload): Promise<boolean>;
  sendWhatsApp(payload: NotificationPayload): Promise<boolean>;
}
