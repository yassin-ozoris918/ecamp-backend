import { Module } from '@nestjs/common';
import { ProfileUpdateRequestsService } from './profile-update-requests.service';
import { ProfileUpdateRequestsController } from './profile-update-requests.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ProfileUpdateRequestsController],
  providers: [ProfileUpdateRequestsService],
})
export class ProfileUpdateRequestsModule {}
