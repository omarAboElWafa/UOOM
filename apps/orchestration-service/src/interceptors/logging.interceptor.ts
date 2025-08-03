import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LoggingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();
    const { method, url, body, headers } = request;
    const userAgent = headers['user-agent'] || '';
    const correlationId = headers['correlation-id'] || 'unknown';
    const startTime = Date.now();

    this.logger.log(`Incoming ${method} ${url}`, {
      correlationId,
      userAgent,
      body: method === 'POST' || method === 'PUT' ? body : undefined,
    });

    return next.handle().pipe(
      tap((data) => {
        const processingTime = Date.now() - startTime;
        this.logger.log(`Completed ${method} ${url} in ${processingTime}ms`, {
          correlationId,
          statusCode: response.statusCode,
          processingTime,
        });
      }),
      catchError((error) => {
        const processingTime = Date.now() - startTime;
        this.logger.error(`Failed ${method} ${url} in ${processingTime}ms`, {
          correlationId,
          error: error.message,
          statusCode: error.status || 500,
          processingTime,
        });
        throw error;
      }),
    );
  }
} 