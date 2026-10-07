import { Module } from '@nestjs/common';
import { SubmissionsService } from './submissions.service';
import { SubmissionsController } from './submissions.controller';
import { S3Service } from './s3.service';
import { ClientsModule, Transport } from '@nestjs/microservices';

@Module({
  imports: [],
  providers: [SubmissionsService, S3Service],
  controllers: [SubmissionsController],
  exports: [SubmissionsService, S3Service],
})
export class SubmissionsModule {}
