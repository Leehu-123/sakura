import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { AccessGuard } from './access';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { configuration } from '../config';
@Module({
  imports: [JwtModule.registerAsync({ useFactory: () => ({ secret: configuration().jwtSecret }) })],
  controllers: [AuthController],
  providers: [AuthService, { provide: APP_GUARD, useClass: AccessGuard }],
})
export class AuthModule {}
