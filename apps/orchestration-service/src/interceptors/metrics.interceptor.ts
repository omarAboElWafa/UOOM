import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const { method, url } = request;
    const startTime = Date.now();

    return next.handle().pipe(
      tap(() => {
        const processingTime = Date.now() - startTime;
        
        // In production, this would send metrics to Prometheus/Grafana
        // For now, just log the metrics
        console.log(`METRIC: ${method} ${url} - ${processingTime}ms`);
        
        // Track response times for performance monitoring
        if (processingTime > 2000) {
          console.warn(`SLOW_REQUEST: ${method} ${url} took ${processingTime}ms`);
        }
      }),
    );
  }
} 