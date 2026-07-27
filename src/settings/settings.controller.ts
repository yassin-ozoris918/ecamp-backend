import { Controller, Get, Put, Body, Param, UseGuards } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';

@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  async getAllSettings() {
    return this.settingsService.getAll();
  }

  @Get(':key')
  async getSetting(@Param('key') key: string) {
    return this.settingsService.get(key);
  }

  @Put()
  async updateSettings(@Body() body: Record<string, any>) {
    const results: Record<string, any> = {};
    for (const [key, value] of Object.entries(body)) {
      await this.settingsService.set(key, value);
      results[key] = { success: true };
    }
    return results;
  }

  @Put(':key')
  async updateSetting(@Param('key') key: string, @Body('value') value: any) {
    await this.settingsService.set(key, value);
    return { success: true };
  }
}
