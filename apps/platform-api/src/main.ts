import 'reflect-metadata';
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app';
import { configureApp } from './bootstrap';
import { configuration } from './config';
async function main() {
  const app = await NestFactory.create(AppModule);
  configureApp(app);
  await app.listen(configuration().port, process.env.HOST || '127.0.0.1');
}
main().catch(() => {
  console.error('Không khởi động được API. Kiểm tra cấu hình và kết nối cơ sở dữ liệu.');
  process.exit(1);
});
