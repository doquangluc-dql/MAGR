import { Controller, Post, Get, Put, Body, Param, Query, UseGuards, Request, BadRequestException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AppealsService } from './appeals.service';
import { CreateAppealDto, UpdateAppealDto } from './dto/appeal.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('appeals')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AppealsController {
  constructor(private appealsService: AppealsService) {}

  @Roles(Role.STUDENT)
  @Post()
  async create(@Request() req, @Body() dto: CreateAppealDto) {
    return this.appealsService.create(req.user.id, dto);
  }

  @Roles(Role.STUDENT)
  @Get('mine')
  async findMine(@Request() req, @Query('examId') examId: string) {
    if (!examId) {
      throw new BadRequestException('Thiếu examId');
    }
    return this.appealsService.findMine(req.user.id, examId);
  }

  @Roles(Role.TEACHER)
  @Get('exam/:examId')
  async findByExam(@Request() req, @Param('examId') examId: string) {
    return this.appealsService.findByExam(req.user.id, examId);
  }

  @Roles(Role.TEACHER)
  @Put(':id')
  async update(@Request() req, @Param('id') id: string, @Body() dto: UpdateAppealDto) {
    return this.appealsService.update(req.user.id, id, dto);
  }
}
