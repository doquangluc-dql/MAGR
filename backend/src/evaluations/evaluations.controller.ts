import { Controller, Post, Get, Put, Body, Param, UseGuards, Request } from '@nestjs/common';
import { EvaluationsService } from './evaluations.service';
import { OverrideEvaluationDto } from './dto/evaluation.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '@prisma/client';
import { EventPattern, Payload } from '@nestjs/microservices';

@Controller('evaluations')
export class EvaluationsController {
  constructor(private evaluationsService: EvaluationsService) {}

  // RabbitMQ consumer for AI grading results
  @EventPattern('grading_result_event')
  async handleGradingResult(@Payload() data: any) {
    console.log('Received grading result from RabbitMQ:', data);
    
    // In case the message comes through NestJS ClientProxy, it is automatically parsed.
    // If it's a raw AMQP message with a different structure, we extract the inner data.
    const payload = data?.data || data;
    if (payload && payload.submission_id) {
      await this.evaluationsService.saveAiEvaluation(payload);
    } else {
      console.error('Invalid RMQ payload format received:', data);
    }
  }

  // HTTP endpoints with Guards
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Get('submission/:submissionId')
  async getEvaluationBySubmission(@Param('submissionId') submissionId: string, @Request() req) {
    return this.evaluationsService.getEvaluationBySubmission(submissionId, req.user.id, req.user.role);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Put(':id/override')
  async overrideEvaluation(@Param('id') id: string, @Body() dto: OverrideEvaluationDto) {
    return this.evaluationsService.overrideEvaluation(id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Post('submission/:submissionId/publish')
  async publishEvaluation(@Param('submissionId') submissionId: string) {
    return this.evaluationsService.publishEvaluation(submissionId);
  }
}
