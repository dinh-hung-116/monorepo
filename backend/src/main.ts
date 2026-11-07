import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // Cho phép frontend Next.js (cổng 3000) gọi API
  app.enableCors({ origin: process.env.CORS_ORIGIN ?? 'http://localhost:3000' });
  // Bật validation toàn cục cho DTO (Task 6.1)
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );
  await app.listen(process.env.PORT ?? 3001);
}
await bootstrap();
