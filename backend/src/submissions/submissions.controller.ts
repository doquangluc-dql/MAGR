import { Controller, Post, Get, Body, Param, UseGuards, Request } from '@nestjs/common';
import { SubmissionsService } from './submissions.service';
import { GetPresignedUrlDto, ConfirmSubmissionDto, TriggerGradingDto } from './dto/submission.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '@prisma/client';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('submissions')
export class SubmissionsController {
  constructor(private submissionsService: SubmissionsService) {}

  @Roles(Role.STUDENT)
  @Post('presigned-url')
  async getPresignedUrl(@Body() dto: GetPresignedUrlDto, @Request() req) {
    const hostHeader = req.headers.host || 'localhost:3000';
    const clientHost = hostHeader.split(':')[0];
    return this.submissionsService.getPresignedUrl(req.user.id, dto.questionId, dto.contentType, clientHost);
  }

  @Roles(Role.STUDENT)
  @Post()
  async confirmSubmission(@Body() dto: ConfirmSubmissionDto, @Request() req) {
    return this.submissionsService.confirmSubmission(req.user.id, dto.questionId, dto.imageUrl);
  }

  @Roles(Role.TEACHER)
  @Post('trigger-grading')
  async triggerGrading(@Body() dto: TriggerGradingDto) {
    return this.submissionsService.triggerGrading(dto.submissionIds);
  }

  @Roles(Role.TEACHER)
  @Get('question/:questionId')
  async getSubmissionsByQuestion(@Param('questionId') questionId: string) {
    return this.submissionsService.getSubmissionsByQuestion(questionId);
  }
}
