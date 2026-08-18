import { IsEmail, IsObject, IsOptional, IsString, Length, MinLength } from 'class-validator';

export class SignUpDto {
  @IsString()
  @Length(2, 120)
  name: string;

  @IsEmail()
  email: string;

  @IsString()
  @Length(3, 80)
  username: string;

  @IsString()
  @MinLength(8)
  password: string;
}

export class SignInDto {
  @IsString()
  identifier: string;

  @IsString()
  password: string;
}

export class UpdateUserProfileDto {
  @IsOptional()
  @IsString()
  @Length(2, 120)
  name?: string;

  @IsOptional()
  @IsObject()
  settings?: Record<string, unknown>;
}
