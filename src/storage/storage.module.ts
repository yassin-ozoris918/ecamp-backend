import { Module, Global } from '@nestjs/common';
import { StorageService } from './storage.service';

@Global() // Making it global allows any module to inject it without explicitly re-importing StorageModule
@Module({
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
