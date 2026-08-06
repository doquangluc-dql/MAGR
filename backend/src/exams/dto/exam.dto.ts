import { IsString, IsArray, IsOptional } from 'class-validator';

export class CreateExamDto {
  @IsString()
  title: string;
}

export class EnrollStudentsDto {
  @IsOptional()
  @IsArray()
  studentIds?: string[];

  @IsOptional()
  @IsString()
  email?: string;
}

