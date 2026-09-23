import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'node:crypto';
import { Database } from '../db';
import { hashPassword, verifyPassword } from './password';
const digest = (token: string) => createHash('sha256').update(token).digest('hex');
const tokenValue = () => randomBytes(48).toString('base64url');
@Injectable()
export class AuthService {
  private readonly dummy = hashPassword(randomBytes(32).toString('hex'));
  constructor(
    private readonly db: Database,
    private readonly jwt: JwtService,
  ) {}
  private access(userId: string, sessionId: string) {
    return this.jwt.signAsync(
      { sub: userId, sid: sessionId },
      { expiresIn: '15m', issuer: 'sakura-platform', audience: 'sakura', algorithm: 'HS256' },
    );
  }
  async login(email: string, password: string) {
    const user = await this.db.user.findUnique({ where: { email: email.trim().toLowerCase() } });
    const valid = await verifyPassword(password, user?.passwordHash || (await this.dummy));
    if (!user || !valid || user.status !== 'ACTIVE')
      throw new UnauthorizedException('Email hoặc mật khẩu không đúng.');
    const refreshToken = tokenValue();
    const expiresAt = new Date(Date.now() + 7 * 86400000);
    const session = await this.db.$transaction(
      async (tx) => {
        const current = await tx.user.findUniqueOrThrow({ where: { id: user.id } });
        if (current.status !== 'ACTIVE' || current.passwordHash !== user.passwordHash)
          throw new UnauthorizedException('Vui lòng đăng nhập lại.');
        const created = await tx.session.create({
          data: {
            userId: user.id,
            expiresAt,
            tokens: { create: { tokenHash: digest(refreshToken), expiresAt } },
          },
        });
        await tx.auditLog.create({
          data: { actorId: user.id, action: 'auth.login', entity: 'Session', entityId: created.id },
        });
        return created;
      },
      { isolationLevel: 'Serializable' },
    );
    return { accessToken: await this.access(user.id, session.id), refreshToken, expiresAt };
  }
  async refresh(raw: string | undefined) {
    if (!raw || raw.length > 256) throw new UnauthorizedException('Vui lòng đăng nhập lại.');
    const token = await this.db.refreshToken.findUnique({
      where: { tokenHash: digest(raw) },
      include: { session: { include: { user: true } } },
    });
    if (!token) throw new UnauthorizedException('Vui lòng đăng nhập lại.');
    const now = new Date();
    if (token.usedAt) {
      await this.db.$transaction([
        this.db.session.update({ where: { id: token.sessionId }, data: { revokedAt: now } }),
        this.db.auditLog.create({
          data: {
            actorId: token.session.userId,
            action: 'auth.refresh_reuse',
            entity: 'Session',
            entityId: token.sessionId,
          },
        }),
      ]);
      throw new UnauthorizedException('Phiên đã được thu hồi. Vui lòng đăng nhập lại.');
    }
    if (
      token.expiresAt <= now ||
      token.session.expiresAt <= now ||
      token.session.revokedAt ||
      token.session.user.status !== 'ACTIVE'
    )
      throw new UnauthorizedException('Phiên đã hết hạn.');
    const refreshToken = tokenValue();
    const rotated = await this.db.$transaction(async (tx) => {
      const claimed = await tx.refreshToken.updateMany({
        where: { id: token.id, usedAt: null },
        data: { usedAt: now },
      });
      if (claimed.count !== 1) return false;
      await tx.refreshToken.create({
        data: {
          sessionId: token.sessionId,
          tokenHash: digest(refreshToken),
          expiresAt: token.session.expiresAt,
        },
      });
      return true;
    });
    if (!rotated) {
      await this.db.session.update({
        where: { id: token.sessionId },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException('Phiên đã được sử dụng. Vui lòng đăng nhập lại.');
    }
    return {
      accessToken: await this.access(token.session.userId, token.sessionId),
      refreshToken,
      expiresAt: token.session.expiresAt,
    };
  }
  async logout(raw: string | undefined) {
    if (!raw || raw.length > 256) return;
    const token = await this.db.refreshToken.findUnique({ where: { tokenHash: digest(raw) } });
    if (token)
      await this.db.session.updateMany({
        where: { id: token.sessionId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
  }
  async changePassword(userId: string, currentPassword: string, password: string) {
    const user = await this.db.user.findUniqueOrThrow({ where: { id: userId } });
    if (!(await verifyPassword(currentPassword, user.passwordHash)))
      throw new BadRequestException('Mật khẩu hiện tại không đúng.');
    if (currentPassword === password)
      throw new BadRequestException('Mật khẩu mới phải khác mật khẩu hiện tại.');
    const passwordHash = await hashPassword(password);
    await this.db.$transaction(async (tx) => {
      const changed = await tx.user.updateMany({
        where: { id: userId, passwordHash: user.passwordHash },
        data: { passwordHash, mustChangePassword: false },
      });
      if (!changed.count)
        throw new BadRequestException('Mật khẩu vừa thay đổi. Vui lòng đăng nhập lại.');
      await tx.session.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          actorId: userId,
          action: 'auth.password_changed',
          entity: 'User',
          entityId: userId,
        },
      });
    });
  }
}
