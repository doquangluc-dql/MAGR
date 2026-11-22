import { Module } from '@nestjs/common';
import { AppealsService } from './appeals.service';
import { AppealsController } from './appeals.controller';

@Module({
  providers: [AppealsService],
  controllers: [AppealsController],
})
export class AppealsModule {}
