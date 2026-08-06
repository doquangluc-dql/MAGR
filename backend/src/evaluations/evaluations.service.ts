import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { OverrideEvaluationDto } from './dto/evaluation.dto';
import { Role, SubmissionStatus } from '@prisma/client';

@Injectable()
export class EvaluationsService {
  constructor(private prisma: PrismaService) {}

  async saveAiEvaluation(data: {
    submission_id: string;
    total_score: number;
    steps: Array<{
      rubric_step_id: string;
      is_marked_incorrect: boolean;
      ai_reasoning: string;
    }>;
  }) {
    const submission = await this.prisma.submission.findUnique({
      where: { id: data.submission_id },
    });
    if (!submission) {
      console.error(`Submission not found for AI evaluation: ${data.submission_id}`);
      return;
    }

    return this.prisma.$transaction(async (tx) => {
      // Delete old evaluation if exists
      const existing = await tx.evaluation.findFirst({
        where: { submissionId: data.submission_id },
      });
      if (existing) {
        await tx.stepEvaluation.deleteMany({
          where: { evaluationId: existing.id },
        });
        await tx.evaluation.delete({
          where: { id: existing.id },
        });
      }

      // Create new evaluation
      const evaluation = await tx.evaluation.create({
        data: {
          submissionId: data.submission_id,
          totalScore: data.total_score,
          isTeacherOverridden: false,
        },
      });

      // Create step evaluations
      await Promise.all(
        data.steps.map((step) =>
          tx.stepEvaluation.create({
            data: {
              evaluationId: evaluation.id,
              rubricStepId: step.rubric_step_id,
              isMarkedIncorrect: step.is_marked_incorrect,
              aiReasoning: step.ai_reasoning,
            },
          }),
        ),
      );

      console.log(`Saved AI evaluation for submission ${data.submission_id}`);
      return evaluation;
    });
  }

  async getEvaluationBySubmission(submissionId: string, userId: string, role: Role) {
    const submission = await this.prisma.submission.findUnique({
      where: { id: submissionId },
      include: {
        evaluation: {
          include: {
            stepEvaluations: {
              include: {
                rubricStep: true,
              },
            },
          },
        },
      },
    });

    if (!submission) {
      throw new NotFoundException('Submission not found');
    }

    if (role === Role.STUDENT) {
      if (submission.studentId !== userId) {
        throw new BadRequestException('Forbidden');
      }
      if (!submission.isPublished) {
        throw new BadRequestException('Results not published yet');
      }
    }

    return submission.evaluation;
  }

  async overrideEvaluation(evaluationId: string, dto: OverrideEvaluationDto) {
    const evaluation = await this.prisma.evaluation.findUnique({
      where: { id: evaluationId },
    });
    if (!evaluation) {
      throw new NotFoundException('Evaluation not found');
    }

    return this.prisma.$transaction(async (tx) => {
      // Update overall score
      await tx.evaluation.update({
        where: { id: evaluationId },
        data: {
          totalScore: dto.totalScore,
          isTeacherOverridden: true,
        },
      });

      // Update step evaluations
      await Promise.all(
        dto.steps.map((step) =>
          tx.stepEvaluation.update({
            where: { id: step.stepEvaluationId },
            data: {
              isMarkedIncorrect: step.isMarkedIncorrect,
              teacherFeedback: step.teacherFeedback,
            },
          }),
        ),
      );

      return tx.evaluation.findUnique({
        where: { id: evaluationId },
        include: {
          stepEvaluations: true,
        },
      });
    });
  }

  async publishEvaluation(submissionId: string) {
    const submission = await this.prisma.submission.findUnique({
      where: { id: submissionId },
      include: { evaluation: true },
    });

    if (!submission) {
      throw new NotFoundException('Submission not found');
    }

    if (!submission.evaluation) {
      throw new BadRequestException('Cannot publish submission without AI/Teacher evaluation');
    }

    return this.prisma.submission.update({
      where: { id: submissionId },
      data: {
        isPublished: true,
        status: SubmissionStatus.GRADED,
      },
    });
  }
}
