import { IsString, MinLength } from 'class-validator';

export class ResetDatabaseDto {
  @IsString()
  @MinLength(1)
  password: string;

  @IsString()
  confirmation: string;
}
