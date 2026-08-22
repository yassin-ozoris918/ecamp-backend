import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { SettingsService } from '../../settings/settings.service';
import { Role } from '@prisma/client';

@Injectable()
export class MaintenancePolicy {
  constructor(private readonly settingsService: SettingsService) {}

  /**
   * Checks if maintenance mode is active. Throws 503 if so.
   * Admins are exempt from this restriction to allow them to turn off maintenance mode.
   */
  async validateLogin(role: Role): Promise<void> {
    if (role === Role.ADMIN) {
      return;
    }

    const isMaintenance = await this.settingsService.get('maintenance_mode');
    if (isMaintenance) {
      throw new ServiceUnavailableException({
        code: 'MAINTENANCE_MODE',
        message: 'Platform is currently under maintenance.',
      });
    }
  }

  /**
   * Registration is completely blocked during maintenance mode.
   */
  async validateRegistration(): Promise<void> {
    const isMaintenance = await this.settingsService.get('maintenance_mode');
    if (isMaintenance) {
      throw new ServiceUnavailableException({
        code: 'MAINTENANCE_MODE',
        message: 'Platform is currently under maintenance.',
      });
    }
  }
}
