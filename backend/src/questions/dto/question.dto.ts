import { IsNotEmpty, IsString, IsArray, ValidateNested, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

export class RubricStepDto {
  @IsNotEmpty()
  @IsNumber()
  stepIndex: number;

  @IsNotEmpty()
  @IsString()
  latexContent: string;

  @IsNotEmpty()
  @IsNumber()
  maxScore: number;
}

export class CreateQuestionDto {
  @IsNotEmpty()
  @IsString()
  examId: string;

  @IsNotEmpty()
  @IsString()
  name: string;

  @IsNotEmpty()
  @IsString()
  content: string; // Question in LaTeX

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RubricStepDto)
  rubricSteps: RubricStepDto[];
}
