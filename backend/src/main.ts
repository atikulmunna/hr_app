import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api/v1');
  const port = parseInt(process.env.PORT ?? '3000', 10);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`HRIS backend listening on http://localhost:${port}/api/v1`);
}

void bootstrap();
