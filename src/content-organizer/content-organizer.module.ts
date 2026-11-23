import { Module } from '@nestjs/common';
import { ContentOrganizerController } from './content-organizer.controller';
import { ContentOrganizerService } from './content-organizer.service';

@Module({
  controllers: [ContentOrganizerController],
  providers: [ContentOrganizerService],
})
export class ContentOrganizerModule {}
