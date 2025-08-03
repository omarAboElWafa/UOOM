import { Injectable, CanActivate, ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { Observable } from 'rxjs';

@Injectable()
export class RateLimitGuard implements CanActivate {
  private requestCounts = new Map<string, { count: number; resetTime: number }>();

  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const request = context.switchToHttp().getRequest();
    const clientId = this.getClientId(request);
    const now = Date.now();

    // Get or create rate limit data for this client
    const rateLimitData = this.requestCounts.get(clientId);
    
    if (!rateLimitData || now > rateLimitData.resetTime) {
      // First request or reset time passed
      this.requestCounts.set(clientId, {
        count: 1,
        resetTime: now + 60000, // 1 minute window
      });
      return true;
    }

    // Check if within rate limit
    if (rateLimitData.count >= 1000) { // 1000 requests per minute
      throw new HttpException('Rate limit exceeded', HttpStatus.TOO_MANY_REQUESTS);
    }

    // Increment count
    rateLimitData.count++;
    return true;
  }

  private getClientId(request: any): string {
    // Use IP address as client identifier
    // In production, you might use user ID or API key
    return request.ip || request.connection?.remoteAddress || 'unknown';
  }
} 