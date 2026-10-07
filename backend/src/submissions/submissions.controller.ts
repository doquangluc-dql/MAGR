import { Controller, Post, Get, Delete, Body, Param, UseGuards, Request } from '@nestjs/common';
import { SubmissionsService } from './submissions.service';
import { GetPresignedUrlDto, ConfirmSubmissionDto, TriggerGradingDto } from './dto/submission.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '@prisma/client';
import { EventPattern, Payload } from '@nestjs/microservices';

@Controller('submissions')
export class SubmissionsController {
  constructor(private submissionsService: SubmissionsService) {}

  // RabbitMQ consumer for OCR results
  @EventPattern('ocr_result_event')
  async handleOcrResult(@Payload() data: any) {
    console.log('Received OCR result from RabbitMQ:', data);
    const payload = data?.data || data;
    if (payload && payload.submission_id) {
      await this.submissionsService.saveOcrResult(payload);
    } else {
      console.error('Invalid RMQ OCR payload received:', data);
    }
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.STUDENT)
  @Post('presigned-url')
  async getPresignedUrl(@Body() dto: GetPresignedUrlDto, @Request() req) {
    const hostHeader = req.headers.host || 'localhost:3000';
    const clientHost = hostHeader.split(':')[0];
    return this.submissionsService.getPresignedUrl(req.user.id, dto.questionId, dto.contentType, clientHost);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.STUDENT)
  @Post()
  async confirmSubmission(@Body() dto: ConfirmSubmissionDto, @Request() req) {
    return this.submissionsService.confirmSubmission(req.user.id, dto.questionId, dto.imageUrl);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Post('trigger-grading')
  async triggerGrading(@Body() dto: TriggerGradingDto) {
    return this.submissionsService.triggerGrading(dto.submissionIds);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Get('question/:questionId')
  async getSubmissionsByQuestion(@Param('questionId') questionId: string) {
    return this.submissionsService.getSubmissionsByQuestion(questionId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.STUDENT)
  @Delete(':id')
  async deleteSubmission(@Param('id') id: string, @Request() req) {
    return this.submissionsService.deleteSubmission(req.user.id, id);
  }
}
