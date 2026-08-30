import { IsIn, IsOptional, IsString, Matches } from 'class-validator';

export class AdminUpdateUserDto {
  @IsOptional()
  @IsString() @Matches(/^[a-z0-9][a-z0-9-]{0,49}$/)
  plan?: string;

  @IsOptional()
  @IsIn(['active', 'suspended'])
  status?: 'active' | 'suspended';
}
