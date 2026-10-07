import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enable Cross-Origin Resource Sharing
  app.enableCors();

  // Validate incoming JSON body models
  app.useGlobalPipes(new ValidationPipe({ transform: true }));

  await app.listen(3000, '0.0.0.0');
  console.log(`Application is running on: ${await app.getUrl()}`);
}
bootstrap();
