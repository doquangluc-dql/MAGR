import { IsNotEmpty, IsNumber, IsBoolean, IsArray, ValidateNested, IsString, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

export class OverrideStepDto {
  @IsNotEmpty()
  @IsString()
  stepEvaluationId: string;

  @IsNotEmpty()
  @IsBoolean()
  isMarkedIncorrect: boolean;

  @IsNotEmpty()
  @IsString()
  teacherFeedback: string;
}

export class OverrideEvaluationDto {
  @IsNotEmpty()
  @IsNumber()
  totalScore: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OverrideStepDto)
  steps: OverrideStepDto[];
}
