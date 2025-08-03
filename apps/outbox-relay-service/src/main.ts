import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard } from '@nestjs/throttler';
import helmet from 'helmet';
import * as compression from 'compression';

import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  
  try {
    const app = await NestFactory.create(AppModule, {
      logger: ['error', 'warn', 'log', 'debug', 'verbose'],
    });

    const configService = app.get(ConfigService);

    // Global configuration
    app.setGlobalPrefix('api/v1');
    
    // Security
    app.use(helmet({
      crossOriginEmbedderPolicy: false,
    }));
    
    // Compression
    app.use(compression());

    // CORS
    app.enableCors({
      origin: configService.get('CORS_ORIGIN', 'http://localhost:3000'),
      credentials: true,
    });

    // Validation
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        disableErrorMessages: configService.get('NODE_ENV') === 'production',
      }),
    );

    // Rate limiting will be handled by APP_GUARD provider in app.module.ts

    // Swagger documentation
    if (configService.get('NODE_ENV') !== 'production') {
      const config = new DocumentBuilder()
        .setTitle('UOOM Outbox Relay Service')
        .setDescription('Event delivery service for UOOP platform - processes outbox events and publishes them to Kafka')
        .setVersion('1.0')
        .addTag('health', 'Health check endpoints')
        .addTag('metrics', 'Monitoring and metrics endpoints')
        .build();

      const document = SwaggerModule.createDocument(app, config);
      SwaggerModule.setup('api/docs', app, document, {
        swaggerOptions: {
          persistAuthorization: true,
        },
      });
      
      logger.log('Swagger documentation available at /api/docs');
    }

    // Graceful shutdown
    process.on('SIGTERM', async () => {
      logger.log('SIGTERM received, shutting down gracefully');
      await app.close();
      process.exit(0);
    });

    process.on('SIGINT', async () => {
      logger.log('SIGINT received, shutting down gracefully');
      await app.close();
      process.exit(0);
    });

    // Start listening
    const port = configService.get('PORT', 3003);
    const host = configService.get('HOST', '0.0.0.0');
    
    await app.listen(port, host);
    
    logger.log(`🚀 Outbox Relay Service is running on: http://${host}:${port}/api/v1`);
    logger.log(`📊 Health checks: http://${host}:${port}/api/v1/health`);
    logger.log(`📈 Metrics: http://${host}:${port}/api/v1/metrics`);
    
    if (configService.get('NODE_ENV') !== 'production') {
      logger.log(`📚 Documentation: http://${host}:${port}/api/docs`);
    }
    
  } catch (error) {
    logger.error('❌ Failed to start application', error);
    process.exit(1);
  }
}

bootstrap(); 