import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(process.env.PORT ?? 3001); 
  // đổi thành port 3001 nếu frontend lấy port 3000 trước, 
  // mặc định khi chạy sẽ ra Hello wordl!
}
await bootstrap();
