import { Injectable, CanActivate, ExecutionContext, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { AuthService } from '../auth.service';
import { ApiKeyRole } from '../entities/api-key.entity';
import { REQUIRED_ROLE_KEY, PUBLIC_KEY, SESSION_SCOPED_KEY } from '../decorators/auth.decorators';
import { resolveClientIp } from '../../../common/utils/ip';
import { setRequestActor } from '../../../common/services/request-context';
import { AuditService } from '../../audit/audit.service';
import { AuditAction } from '../../audit/entities/audit-log.entity';
import { UserAuthService } from '../user-auth.service';
import { UserAccount } from '../entities/user-account.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Session } from '../../session/entities/session.entity';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    _authService: AuthService,
    private readonly reflector: Reflector,
    private readonly configService: ConfigService,
    private readonly auditService: AuditService,
    private readonly userAuthService: UserAuthService,
    @InjectRepository(Session, 'data') private readonly sessionRepository: Repository<Session>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Check if route is marked as public
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [context.getHandler(), context.getClass()]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    try {
      return await this.authorize(request, context);
    } catch (err) {
      // Record rejected/denied authentication attempts so the audit log has a forensic trail for
      // credential probing. Fire-and-forget: audit logging is best-effort and must never turn a
      // 401/403 into a failure of the guard itself.
      if (err instanceof UnauthorizedException || err instanceof ForbiddenException) {
        // Stamp at least the IP so the failed-auth audit row below is attributable even though the
        // key was never resolved. setRequestActor is a no-op outside a request scope.
        setRequestActor({ ipAddress: this.getClientIp(request) });
        void this.auditService.logWarn(AuditAction.API_KEY_AUTH_FAILED, {
          ipAddress: this.getClientIp(request),
          method: request.method,
          path: request.path,
          errorMessage: err.message,
        });
      }
      throw err;
    }
  }

  private async authorize(request: Request, context: ExecutionContext): Promise<boolean> {
    const token = this.extractBearerToken(request);

    if (!token) {
      throw new UnauthorizedException('Bearer JWT access token is required');
    }

    const requiredRole = this.reflector.getAllAndOverride<ApiKeyRole>(REQUIRED_ROLE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    {
      const user = await this.userAuthService.validateToken(token);
      if (user.role === ApiKeyRole.ADMIN && !this.isAdminManagementPath(request.path)) {
        throw new ForbiddenException('Administrator accounts can only access administration resources');
      }
      if (requiredRole && !this.hasUserPermission(user, requiredRole)) {
        throw new ForbiddenException(`Insufficient permissions. Required: ${requiredRole}`);
      }
      const userSessionScoped = this.reflector.getAllAndOverride<boolean>(SESSION_SCOPED_KEY, [
        context.getHandler(),
        context.getClass(),
      ]);
      const requestedSessionId = (request.params['sessionId'] ||
        (userSessionScoped ? request.params['id'] : undefined)) as string | undefined;
      if (
        requestedSessionId &&
        user.role !== ApiKeyRole.ADMIN &&
        !(await this.sessionRepository.existsBy({ id: requestedSessionId, userId: user.id }))
      ) {
        throw new ForbiddenException('This WhatsApp session does not belong to your account.');
      }
      (request as Request & { user?: UserAccount }).user = user;
      setRequestActor({ userId: user.id, userRole: user.role, ipAddress: this.getClientIp(request) });
      return true;
    }
  }

  private hasUserPermission(user: UserAccount, required: ApiKeyRole): boolean {
    const rank: Record<ApiKeyRole, number> = {
      [ApiKeyRole.VIEWER]: 1,
      [ApiKeyRole.OPERATOR]: 2,
      [ApiKeyRole.ADMIN]: 3,
    };
    return rank[user.role] >= rank[required];
  }

  private isAdminManagementPath(path: string): boolean {
    const normalized = path.replace(/^\/api(?=\/|$)/, '');
    const managementPrefixes = [
      '/admin',
      '/audit',
      '/stats',
      '/settings',
      '/health',
      '/metrics',
      '/infra',
      '/plugins',
      '/auth/api-keys',
    ];
    return (
      managementPrefixes.some(prefix => normalized === prefix || normalized.startsWith(`${prefix}/`)) ||
      ['/auth/me', '/auth/logout', '/auth/validate'].includes(normalized)
    );
  }

  private extractBearerToken(request: Request): string | undefined {
    const authHeader = request.headers['authorization'];
    if (authHeader?.startsWith('Bearer ')) {
      const value = authHeader.substring(7).trim();
      if (value) return value;
    }
    return undefined;
  }

  /**
   * Resolve the real client IP used for the API key's allowedIps whitelist.
   *
   * X-Forwarded-For is client-controllable, so it is only honored when the
   * request actually arrives from a configured trusted proxy (TRUSTED_PROXIES).
   * With no trusted proxies configured, the header is ignored entirely and the
   * direct socket address is used — preventing IP-whitelist spoofing.
   */
  private getClientIp(request: Request): string {
    const trustedProxies = this.configService.get<string[]>('security.trustedProxies') ?? [];
    return resolveClientIp(request, trustedProxies);
  }
}
