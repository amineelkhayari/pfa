import { IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, Matches, Min } from 'class-validator';

export class AdminExtendTrialDto {
  @IsOptional()
  @IsIn(['extend', 'set_date', 'reset'])
  action?: 'extend' | 'set_date' | 'reset';

  @IsOptional()
  @IsString()
  trialEndsAt?: string | null;

  @IsOptional()
  @IsNumber()
  extendDays?: number;

  @IsOptional()
  @IsNumber()
  extendHours?: number;

  @IsOptional()
  @IsNumber()
  extendWeeks?: number;

  @IsOptional()
  @IsNumber()
  extendMonths?: number;

  @IsOptional()
  @IsNumber()
  extendYears?: number;

  @IsOptional()
  @IsBoolean()
  resetUsage?: boolean;
}

export class AdminSetExtraQuotaDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  sessions?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  stores?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  sentMessages?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  receivedMessages?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  aiTokens?: number;
}

export class AdminUpdateUserDto {
  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9][a-z0-9-]{0,49}$/)
  plan?: string;

  @IsOptional()
  @IsIn(['active', 'suspended'])
  status?: 'active' | 'suspended';

  @IsOptional()
  trial?: AdminExtendTrialDto;

  @IsOptional()
  extraQuota?: AdminSetExtraQuotaDto;
}

