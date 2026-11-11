import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { loadEnvFiles } from './prisma/prisma.service.js';
import {DocumentBuilder, SwaggerModule} from "@nestjs/swagger";

loadEnvFiles();

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // Cho phép frontend Next.js (cổng 3000) gọi API
  app.enableCors({ origin: process.env.CORS_ORIGIN ?? 'http://localhost:3000' });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
    const config = new DocumentBuilder()
        .setTitle('Cats example')
        .setDescription('The cats API description')
        .setVersion('1.0')
        .addTag('cats')
        .build();
    const documentFactory = () => SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api', app, documentFactory);
    await app.listen(process.env.PORT ?? 3001);
  // đổi thành port 3001 nếu frontend lấy port 3000 trước,
  // mặc định khi chạy sẽ ra Hello wordl!
}
await bootstrap();
