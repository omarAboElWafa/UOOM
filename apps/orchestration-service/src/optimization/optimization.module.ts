import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { OptimizationService } from './optimization.service';
import { OptimizationController } from './optimization.controller';

@Module({
  imports: [
    HttpModule.registerAsync({
      imports: [ConfigModule],
      useFactory: () => ({
        timeout: 5000,
        maxRedirects: 5,
        headers: {
          'User-Agent': 'UOOM-Orchestration-Service',
        },
      }),
    }),
  ],
  providers: [OptimizationService],
  controllers: [OptimizationController],
  exports: [OptimizationService],
})
export class OptimizationModule {} 