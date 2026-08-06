import { Module } from '@nestjs/common';
import { SubmissionsService } from './submissions.service';
import { SubmissionsController } from './submissions.controller';
import { S3Service } from './s3.service';
import { ClientsModule, Transport } from '@nestjs/microservices';

@Module({
  imports: [
    ClientsModule.register([
      {
        name: 'GRADING_TASKS_CLIENT',
        transport: Transport.RMQ,
        options: {
          urls: [process.env.RABBITMQ_URL || 'amqp://admin:adminpassword@rabbitmq:5672'],
          queue: 'grading_tasks',
          queueOptions: {
            durable: true,
          },
        },
      },
    ]),
  ],
  providers: [SubmissionsService, S3Service],
  controllers: [SubmissionsController],
  exports: [SubmissionsService, S3Service],
})
export class SubmissionsModule {}
