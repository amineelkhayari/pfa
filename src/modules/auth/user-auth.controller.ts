import { Body, Controller, Get, Headers, Patch, Post, Req, UnauthorizedException } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Public } from './decorators/auth.decorators';
import { SignInDto, SignUpDto, UpdateUserProfileDto } from './dto/user-auth.dto';
import { UserAccount } from './entities/user-account.entity';
import { UserAuthService } from './user-auth.service';
import { PlanUsageService } from './plan-usage.service';
import { ACCOUNT_JWT_SECURITY_SCHEME } from '../../config/swagger.config';

@ApiTags('auth')
@Controller('auth')
export class UserAuthController {
  constructor(private readonly auth: UserAuthService, private readonly planUsage: PlanUsageService) {}

  @Post('signup')
  @Public()
  @ApiOperation({ summary: 'Create an account and return a JWT access token' })
  signUp(@Body() dto: SignUpDto) {
    return this.auth.signUp(dto);
  }

  @Post('signin')
  @Public()
  @ApiOperation({ summary: 'Sign in and return a JWT access token' })
  signIn(@Body() dto: SignInDto) {
    return this.auth.signIn(dto);
  }

  @Get('me')
  @ApiBearerAuth(ACCOUNT_JWT_SECURITY_SCHEME)
  me(@Req() request: Request & { user?: UserAccount }) {
    if (!request.user) throw new UnauthorizedException('A user login token is required');
    return this.auth.publicView(request.user);
  }

  @Get('usage')
  @ApiBearerAuth(ACCOUNT_JWT_SECURITY_SCHEME)
  usage(@Req() request: Request & { user?: UserAccount }) {
    if (!request.user) throw new UnauthorizedException('A user login token is required');
    return this.planUsage.getUserUsage(request.user.id);
  }

  @Patch('me')
  @ApiBearerAuth(ACCOUNT_JWT_SECURITY_SCHEME)
  update(@Req() request: Request & { user?: UserAccount }, @Body() dto: UpdateUserProfileDto) {
    if (!request.user) throw new UnauthorizedException('A user login token is required');
    return this.auth.updateProfile(request.user.id, dto).then(user => this.auth.publicView(user));
  }

  @Post('logout')
  @ApiBearerAuth(ACCOUNT_JWT_SECURITY_SCHEME)
  async logout(@Headers('authorization') authorization?: string) {
    if (authorization?.startsWith('Bearer ')) await this.auth.logout(authorization.slice(7));
    return { success: true };
  }
}
