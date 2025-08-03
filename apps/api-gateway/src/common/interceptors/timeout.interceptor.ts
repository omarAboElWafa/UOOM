import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  RequestTimeoutException,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { timeout, catchError } from 'rxjs/operators';
import { throwError } from 'rxjs';

@Injectable()
export class TimeoutInterceptor implements NestInterceptor {
  constructor(private readonly timeoutMs: number = 30000) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      timeout(this.timeoutMs),
      catchError((error) => {
        if (error.name === 'TimeoutError') {
          return throwError(() => new RequestTimeoutException({
            code: 'REQUEST_TIMEOUT',
            message: `Request timed out after ${this.timeoutMs}ms`,
            timeout: this.timeoutMs,
            timestamp: new Date().toISOString(),
          }));
        }
        return throwError(() => error);
      }),
    );
  }
} 