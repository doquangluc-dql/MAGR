import { Module } from '@nestjs/common';
import { SubmissionsService } from './submissions.service';
import { SubmissionsController } from './submissions.controller';
import { S3Service } from './s3.service';
import { EvaluationsModule } from '../evaluations/evaluations.module';

@Module({
  imports: [EvaluationsModule],
  providers: [SubmissionsService, S3Service],
  controllers: [SubmissionsController],
  exports: [SubmissionsService, S3Service],
})
export class SubmissionsModule {}
