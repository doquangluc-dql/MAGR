import { IsString, IsOptional, IsNotEmpty, IsIn, MaxLength } from 'class-validator';

export class CreateAppealDto {
  @IsString()
  @IsNotEmpty()
  submissionId: string;

  // Bỏ trống = phản ánh chung cho cả câu hỏi
  @IsOptional()
  @IsString()
  rubricStepId?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  content: string;
}

export class UpdateAppealDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  teacherReply?: string;

  @IsOptional()
  @IsIn(['OPEN', 'RESOLVED'])
  status?: 'OPEN' | 'RESOLVED';
}
