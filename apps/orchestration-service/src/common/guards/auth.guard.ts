import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Observable } from 'rxjs';

@Injectable()
export class AuthGuard implements CanActivate {
  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    // Simple API key validation for now
    // In production, this would validate JWT tokens or API keys
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or invalid authorization header');
    }

    const token = authHeader.substring(7);
    
    // For development, accept any non-empty token
    // In production, validate against your auth service
    if (!token || token.length < 10) {
      throw new UnauthorizedException('Invalid token');
    }

    // Add user info to request for downstream use
    request.user = {
      id: 'user-' + token.substring(0, 8),
      token: token,
    };

    return true;
  }
} 