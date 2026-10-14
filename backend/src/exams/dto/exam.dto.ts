import { IsString, IsArray, IsOptional, IsBoolean } from 'class-validator';

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

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsBoolean()
  isNewAccount?: boolean;
}
export class ImportStudentsDto {
  @IsArray()
  students: { mssv: string; name: string }[];
}
