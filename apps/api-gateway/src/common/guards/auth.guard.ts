import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Observable } from 'rxjs';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    // Get authentication configuration
    const authEnabled = this.configService.get<boolean>('AUTH_ENABLED', true);
    
    if (!authEnabled && this.configService.get<string>('NODE_ENV') === 'development') {
      // Skip auth in development if disabled
      request.user = {
        id: 'dev-user',
        roles: ['user'],
        source: 'development',
      };
      return true;
    }

    // Validate authorization header
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException({
        code: 'MISSING_AUTH_HEADER',
        message: 'Missing or invalid authorization header',
        details: 'Request must include "Authorization: Bearer <token>" header',
      });
    }

    const token = authHeader.substring(7);
    
    // Validate token format
    if (!token || token.length < 10) {
      throw new UnauthorizedException({
        code: 'INVALID_TOKEN',
        message: 'Invalid authentication token',
        details: 'Token must be at least 10 characters long',
      });
    }

    try {
      // In production, this would validate JWT tokens with:
      // - JWT signature verification
      // - Token expiration check
      // - User permissions validation
      // - Rate limiting per user
      
      const user = this.validateToken(token);
      
      // Add user info to request for downstream use
      request.user = user;
      
      return true;
    } catch (error) {
      throw new UnauthorizedException({
        code: 'TOKEN_VALIDATION_FAILED',
        message: 'Token validation failed',
        details: error.message,
      });
    }
  }

  private validateToken(token: string): any {
    // Simplified token validation for demo
    // In production, use proper JWT validation with:
    // - jsonwebtoken library
    // - Public key verification
    // - Claims validation
    
    if (token.startsWith('test-')) {
      return {
        id: 'test-user-' + token.substring(5, 13),
        email: 'test@example.com',
        roles: ['user'],
        permissions: ['order:create', 'order:read', 'order:update'],
        source: 'test-token',
        issuedAt: new Date().toISOString(),
      };
    }
    
    if (token.startsWith('admin-')) {
      return {
        id: 'admin-user-' + token.substring(6, 14),
        email: 'admin@example.com',
        roles: ['admin', 'user'],
        permissions: ['*'],
        source: 'admin-token',
        issuedAt: new Date().toISOString(),
      };
    }
    
    // For demo purposes, extract user info from token prefix
    const userIdMatch = token.match(/^user-([a-zA-Z0-9]+)/);
    if (userIdMatch) {
      return {
        id: userIdMatch[1],
        email: `${userIdMatch[1]}@example.com`,
        roles: ['user'],
        permissions: ['order:create', 'order:read', 'order:update'],
        source: 'api-token',
        issuedAt: new Date().toISOString(),
      };
    }
    
    throw new Error('Invalid token format');
  }
} 