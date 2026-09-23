import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api/v1');
  // The web console is a separate origin (Vite dev server) that calls the API
  // with a bearer token, so allow it cross-origin.
  app.enableCors({
    origin: (process.env.WEB_ORIGIN ?? 'http://localhost:5173').split(','),
  });
  const port = parseInt(process.env.PORT ?? '3000', 10);
  await app.listen(port);

  console.log(`HRIS backend listening on http://localhost:${port}/api/v1`);
}

void bootstrap();
