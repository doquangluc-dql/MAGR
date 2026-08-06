import { IsNotEmpty, IsString, IsArray } from 'class-validator';

export class GetPresignedUrlDto {
  @IsNotEmpty()
  @IsString()
  questionId: string;

  @IsNotEmpty()
  @IsString()
  contentType: string;
}

export class ConfirmSubmissionDto {
  @IsNotEmpty()
  @IsString()
  questionId: string;

  @IsNotEmpty()
  @IsString()
  imageUrl: string;
}

export class TriggerGradingDto {
  @IsNotEmpty()
  @IsArray()
  submissionIds: string[];
}
