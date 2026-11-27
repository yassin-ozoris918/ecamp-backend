import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { DevicesAdminService } from './devices-admin.service';
import { DeviceChangeRequestDto } from './dto/devices.dto';

/** Public: a student whose sign-in was blocked asks to move the account to this device. */
@Controller('devices')
export class DevicesController {
  constructor(private readonly devices: DevicesAdminService) {}

  @Post('change-request')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  requestChange(@Body() dto: DeviceChangeRequestDto) {
    return this.devices.requestChange(dto.changeToken, dto.note);
  }
}
