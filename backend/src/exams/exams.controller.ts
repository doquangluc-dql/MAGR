import { Controller, Post, Get, Put, Delete, Body, Param, UseGuards, Request } from '@nestjs/common';
import { ExamsService } from './exams.service';
import { CreateExamDto, EnrollStudentsDto, ImportStudentsDto } from './dto/exam.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '@prisma/client';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('exams')
export class ExamsController {
  constructor(private examsService: ExamsService) {}

  @Roles(Role.TEACHER)
  @Post()
  async create(@Body() dto: CreateExamDto, @Request() req) {
    return this.examsService.create(dto.title, req.user.id);
  }

  @Get()
  async findAll(@Request() req) {
    return this.examsService.findAll(req.user.id, req.user.role);
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @Request() req) {
    return this.examsService.findOne(id, req.user.id, req.user.role);
  }

  @Roles(Role.TEACHER)
  @Post(':id/students')
  async enrollStudents(@Param('id') id: string, @Body() dto: EnrollStudentsDto) {
    return this.examsService.enrollStudents(id, dto.studentIds, dto.email);
  }

  @Roles(Role.TEACHER)
  @Post(':id/students/import')
  async importStudents(@Param('id') id: string, @Body() dto: ImportStudentsDto) {
    return this.examsService.importStudents(id, dto.students);
  }

  @Roles(Role.TEACHER)
  @Delete(':id/students/:studentId')
  async removeStudent(@Param('id') id: string, @Param('studentId') studentId: string) {
    return this.examsService.removeStudent(id, studentId);
  }

  @Roles(Role.TEACHER)
  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: CreateExamDto, @Request() req) {
    return this.examsService.update(id, dto.title, req.user.id);
  }

  @Roles(Role.TEACHER)
  @Delete(':id')
  async remove(@Param('id') id: string, @Request() req) {
    return this.examsService.remove(id, req.user.id);
  }
}
