import { ArrayMaxSize, IsArray, IsBoolean, IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';
export class CreateCampaignDto {
  @IsString() @Length(2, 120) name: string;
  @IsString() @Length(1, 4000) message: string;
  @IsString() sessionId: string;
  @IsOptional() @IsInt() @Min(1500) @Max(60000) delayBetweenMessages?: number;
  @IsOptional() @IsBoolean() confirmHighRisk?: boolean;
  @IsOptional() @IsArray() @ArrayMaxSize(2000) @IsString({ each: true }) excludedRecipients?: string[];
}
