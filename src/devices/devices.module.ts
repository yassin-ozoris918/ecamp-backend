import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { DeviceTrustService } from './device-trust.service';
import { DevicesAdminService } from './devices-admin.service';
import { DevicesController } from './devices.controller';
import { DevicesAdminController } from './devices.admin.controller';

@Module({
  imports: [JwtModule.register({})],
  controllers: [DevicesController, DevicesAdminController],
  providers: [DeviceTrustService, DevicesAdminService],
  exports: [DeviceTrustService, DevicesAdminService],
})
export class DevicesModule {}
