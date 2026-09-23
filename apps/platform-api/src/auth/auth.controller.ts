import { Body, Controller, Get, Post, Req, Res, ForbiddenException } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength, MaxLength } from 'class-validator';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { AllowPasswordChange, CurrentUser, Public } from './access';
import type { Principal } from './policy';
import { configuration } from '../config';
class LoginDto {
  @ApiProperty() @IsEmail() @MaxLength(254) email!: string;
  @ApiProperty({ format: 'password' }) @IsString() @MinLength(1) @MaxLength(128) password!: string;
}
class PasswordDto {
  @ApiProperty({ format: 'password' }) @IsString() @MaxLength(128) currentPassword!: string;
  @ApiProperty({ minLength: 12, format: 'password' })
  @IsString()
  @MinLength(12)
  @MaxLength(128)
  password!: string;
}
@ApiTags('Đăng nhập')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}
  private checkOrigin(req: Request) {
    if (req.headers.origin !== configuration().origin)
      throw new ForbiddenException('Nguồn yêu cầu không hợp lệ.');
  }
  private cookie(res: Response, value: string, expiresAt: Date) {
    res.cookie('sakura_refresh', value, {
      httpOnly: true,
      secure: configuration().secureCookie,
      sameSite: 'strict',
      path: '/api/v1/auth',
      expires: expiresAt,
    });
    res.setHeader('Cache-Control', 'no-store');
  }
  private clear(res: Response) {
    res.clearCookie('sakura_refresh', {
      httpOnly: true,
      secure: configuration().secureCookie,
      sameSite: 'strict',
      path: '/api/v1/auth',
    });
  }
  @Public()
  @Post('login')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Đăng nhập; yêu cầu header Origin trùng WEB_ORIGIN' })
  async login(
    @Body() body: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.checkOrigin(req);
    const result = await this.auth.login(body.email, body.password);
    this.cookie(res, result.refreshToken, result.expiresAt);
    return { accessToken: result.accessToken, expiresIn: 900 };
  }
  @Public()
  @Post('refresh')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOperation({ summary: 'Đổi refresh token trong cookie, phát access token mới' })
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    this.checkOrigin(req);
    try {
      const result = await this.auth.refresh(req.cookies?.sakura_refresh);
      this.cookie(res, result.refreshToken, result.expiresAt);
      return { accessToken: result.accessToken, expiresIn: 900 };
    } catch (error) {
      this.clear(res);
      throw error;
    }
  }
  @Public()
  @Post('logout')
  @ApiOperation({ summary: 'Thu hồi phiên hiện tại' })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    this.checkOrigin(req);
    await this.auth.logout(req.cookies?.sakura_refresh);
    this.clear(res);
    return { message: 'Đã đăng xuất.' };
  }
  @ApiBearerAuth()
  @AllowPasswordChange()
  @Get('me')
  @ApiOperation({ summary: 'Tài khoản và quyền hiện tại' })
  me(@CurrentUser() user: Principal) {
    return user;
  }
  @ApiBearerAuth()
  @AllowPasswordChange()
  @Post('change-password')
  @ApiOperation({ summary: 'Đổi mật khẩu và thu hồi tất cả phiên' })
  async password(
    @Body() body: PasswordDto,
    @CurrentUser() user: Principal,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.auth.changePassword(user.id, body.currentPassword, body.password);
    this.clear(res);
    return { message: 'Đã đổi mật khẩu. Vui lòng đăng nhập lại.' };
  }
}
