import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import compression from 'compression';
import * as express from 'express';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import * as path from 'path';
import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';
import { SentryFilter } from './common/filters/sentry.filter';
import { correlationIdMiddleware } from './common/middleware/correlation-id.middleware';

async function bootstrap() {

  const app = await NestFactory.create(AppModule);

  // Trust proxy for correct IP detection behind reverse proxies
  app.getHttpAdapter().getInstance().set('trust proxy', 1);

  // Initialize Sentry
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.SENTRY_ENVIRONMENT || 'development',
    integrations: [
      nodeProfilingIntegration(),
    ],
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    profilesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  });

  const allowedOrigins = process.env.FRONTEND_URL ? process.env.FRONTEND_URL.split(',') : ['http://localhost:5173'];
  
  // Enable CORS
  app.enableCors({
    origin: [
      ...allowedOrigins, 
      'http://192.168.1.3:5173', 
      'https://ecamp-lms.com', 
      'https://www.ecamp-lms.com'
    ],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'x-device-id', 'x-request-id'],
  });

  // HTTP Security Headers
  app.use(helmet({ 
    hsts: true,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }));

  // Response compression
  app.use(compression());

  // Correlation ID middleware (runs before all routes)
  app.use(correlationIdMiddleware);

  // Global Validation Pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Global Exception Filter for Sentry
  app.useGlobalFilters(new SentryFilter());

  // Swagger Documentation
  const config = new DocumentBuilder()
    .setTitle('E.Camp LMS API')
    .setDescription('The E.Camp Learning Management System API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  // Graceful shutdown
  app.enableShutdownHooks();

  // Serve uploaded files in development mode
  const uploadsPath = path.join(process.cwd(), 'uploads');
  app.use('/uploads', express.static(uploadsPath));

  // Validate production configuration before accepting requests
  if (process.env.NODE_ENV === 'production') {
    const requiredR2Vars = [
      'R2_ENDPOINT',
      'R2_ACCESS_KEY_ID',
      'R2_SECRET_ACCESS_KEY',
      'R2_BUCKET_NAME',
      'R2_PUBLIC_URL',
    ] as const;
    const missing = requiredR2Vars.filter((key) => !process.env[key]);
    if (missing.length > 0) {
      throw new Error(
        `Production mode requires R2 configuration. Missing variables: ${missing.join(', ')}`,
      );
    }
  }

  await app.listen(process.env.PORT ?? 3000, '0.0.0.0');
}
bootstrap().catch((err) => {
  console.error('Error during bootstrap', err);
});
