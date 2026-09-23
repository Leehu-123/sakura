import {
  CanActivate,
  ExecutionContext,
  Injectable,
  SetMetadata,
  UnauthorizedException,
  ForbiddenException,
  createParamDecorator,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Database } from '../db';
import { hasPermission, Principal, Scope } from './policy';
export const Public = () => SetMetadata('public', true);
export const AllowPasswordChange = () => SetMetadata('allowPasswordChange', true);
export const RequirePermission = (permission: string, scope: Scope = 'GLOBAL') =>
  SetMetadata('permission', { permission, scope });
export const CurrentUser = createParamDecorator(
  (_: unknown, context: ExecutionContext) => context.switchToHttp().getRequest().user as Principal,
);
@Injectable()
export class AccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly db: Database,
  ) {}
  async canActivate(context: ExecutionContext) {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride('public', targets)) return true;
    const request = context.switchToHttp().getRequest();
    const authorization: string = request.headers.authorization || '';
    if (!authorization.startsWith('Bearer '))
      throw new UnauthorizedException('Vui lòng đăng nhập.');
    let claims: { sub: string; sid: string };
    try {
      claims = await this.jwt.verifyAsync(authorization.slice(7), {
        audience: 'sakura',
        issuer: 'sakura-platform',
        algorithms: ['HS256'],
      });
    } catch {
      throw new UnauthorizedException('Phiên đăng nhập đã hết hạn.');
    }
    if (typeof claims.sub !== 'string' || typeof claims.sid !== 'string')
      throw new UnauthorizedException();
    const session = await this.db.session.findUnique({
      where: { id: claims.sid },
      include: {
        user: {
          include: {
            roleAssignments: {
              include: { role: { include: { permissions: { include: { permission: true } } } } },
            },
          },
        },
      },
    });
    if (
      !session ||
      session.userId !== claims.sub ||
      session.revokedAt ||
      session.expiresAt <= new Date() ||
      session.user.status !== 'ACTIVE'
    ) {
      throw new UnauthorizedException('Phiên đăng nhập không còn hiệu lực.');
    }
    const user = session.user;
    const principal: Principal = {
      id: user.id,
      sessionId: session.id,
      email: user.email,
      displayName: user.displayName,
      mustChangePassword: user.mustChangePassword,
      grants: user.roleAssignments.flatMap((a) =>
        a.role.permissions.map((p) => ({ permission: p.permission.code, scope: p.scope })),
      ),
    };
    request.user = principal;
    if (
      user.mustChangePassword &&
      !this.reflector.getAllAndOverride('allowPasswordChange', targets)
    ) {
      throw new ForbiddenException('Bạn cần đổi mật khẩu trước khi tiếp tục.');
    }
    const required = this.reflector.getAllAndOverride<{ permission: string; scope: Scope }>(
      'permission',
      targets,
    );
    if (required && !hasPermission(principal.grants, required.permission, required.scope))
      throw new ForbiddenException('Bạn không có quyền thực hiện thao tác này.');
    // Authenticated endpoints must explicitly declare a policy.
    if (!required && !this.reflector.getAllAndOverride('allowPasswordChange', targets))
      throw new ForbiddenException();
    return true;
  }
}
