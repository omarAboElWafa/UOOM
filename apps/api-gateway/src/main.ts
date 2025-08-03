import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import * as compression from 'compression';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { TimeoutInterceptor } from './common/interceptors/timeout.interceptor';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { MetricsInterceptor } from './common/interceptors/metrics.interceptor';

async function bootstrap() {
  const logger = new Logger('ApiGateway');
  
  try {
    const app = await NestFactory.create(AppModule, {
      logger: ['error', 'warn', 'log', 'debug', 'verbose'],
    });

    const configService = app.get(ConfigService);
    const port = configService.get<number>('PORT', 8080);
    const environment = configService.get<string>('NODE_ENV', 'development');

    // Security middleware
    app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
        },
      },
      crossOriginEmbedderPolicy: false,
    }));

    // Compression middleware
    app.use(compression());

    // Global validation pipe
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: {
          enableImplicitConversion: true,
        },
        validationError: {
          target: false,
          value: false,
        },
      }),
    );

    // Global filters and interceptors
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalInterceptors(
      new TimeoutInterceptor(30000), // 30 second timeout
      new LoggingInterceptor(),
      new MetricsInterceptor()
    );

    // CORS configuration
    app.enableCors({
      origin: configService.get<string>('CORS_ORIGIN', '*'),
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Correlation-ID', 'X-Request-ID'],
      credentials: true,
    });

    // Global prefix
    app.setGlobalPrefix('api/v1');

    // Swagger documentation
    if (environment !== 'production') {
      const config = new DocumentBuilder()
        .setTitle('UOOP API Gateway')
        .setDescription('Unified Order Orchestration Platform API Gateway - High-performance reverse proxy for microservices')
        .setVersion('1.0.0')
        .addTag('orders', 'Order management endpoints')
        .addTag('gateway', 'Gateway health and metrics')
        .addBearerAuth()
        .addServer(`http://localhost:${port}`, 'Local development')
        .build();

      const document = SwaggerModule.createDocument(app, config);
      SwaggerModule.setup('api/docs', app, document, {
        swaggerOptions: {
          persistAuthorization: true,
          docExpansion: 'none',
          filter: true,
        },
      });
    }

    // Graceful shutdown
    const signals = ['SIGTERM', 'SIGINT'];
    signals.forEach((signal) => {
      process.on(signal, async () => {
        logger.log(`Received ${signal}, starting graceful shutdown`);
        await app.close();
        process.exit(0);
      });
    });

    await app.listen(port, '0.0.0.0');
    logger.log(`🚀 API Gateway is running on: http://localhost:${port}`);
    logger.log(`📚 API Documentation: http://localhost:${port}/api/docs`);
    logger.log(`🏥 Health Check: http://localhost:${port}/api/v1/health`);

  } catch (error) {
    logger.error('Failed to start API Gateway:', error);
    process.exit(1);
  }
}

bootstrap(); 