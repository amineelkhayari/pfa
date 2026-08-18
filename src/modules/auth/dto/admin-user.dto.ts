import { IsIn, IsOptional } from 'class-validator';
import { UserPlan } from '../entities/user-account.entity';

export class AdminUpdateUserDto {
  @IsOptional()
  @IsIn([UserPlan.FREE, UserPlan.PRO])
  plan?: UserPlan;

  @IsOptional()
  @IsIn(['active', 'suspended'])
  status?: 'active' | 'suspended';
}
