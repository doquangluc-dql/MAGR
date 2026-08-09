import { Injectable, NotFoundException, BadRequestException, Inject } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { S3Service } from './s3.service';
import { ClientProxy } from '@nestjs/microservices';
import { SubmissionStatus } from '@prisma/client';

@Injectable()
export class SubmissionsService {
  constructor(
    private prisma: PrismaService,
    private s3Service: S3Service,
    @Inject('GRADING_TASKS_CLIENT') private client: ClientProxy,
  ) {}

  async getPresignedUrl(studentId: string, questionId: string, contentType: string, clientHost?: string) {
    const question = await this.prisma.question.findUnique({
      where: { id: questionId },
    });
    if (!question) {
      throw new NotFoundException('Question not found');
    }

    const fileExtension = contentType.split('/')[1] || 'png';
    const key = `submissions/${studentId}/${questionId}_${Date.now()}.${fileExtension}`;
    const presignedUrl = await this.s3Service.getPresignedUploadUrl(key, contentType, clientHost);
    const imageUrl = this.s3Service.getPublicUrl(key, clientHost);

    const existing = await this.prisma.submission.findFirst({
      where: { studentId, questionId },
    });

    if (existing) {
      await this.prisma.submission.update({
        where: { id: existing.id },
        data: { imageUrl, status: SubmissionStatus.NOT_SUBMITTED },
      });
    } else {
      await this.prisma.submission.create({
        data: {
          studentId,
          questionId,
          imageUrl,
          status: SubmissionStatus.NOT_SUBMITTED,
        },
      });
    }
    
    return { presignedUrl, imageUrl };
  }

  async confirmSubmission(studentId: string, questionId: string, imageUrl: string) {
    const existing = await this.prisma.submission.findFirst({
      where: { studentId, questionId },
    });

    if (!existing) {
      return this.prisma.submission.create({
        data: {
          studentId,
          questionId,
          imageUrl,
          status: SubmissionStatus.SUBMITTED,
          submittedAt: new Date(),
        },
      });
    }

    return this.prisma.submission.update({
      where: { id: existing.id },
      data: {
        imageUrl,
        status: SubmissionStatus.SUBMITTED,
        submittedAt: new Date(),
      },
    });
  }

  async triggerGrading(submissionIds: string[]) {
    const submissions = await this.prisma.submission.findMany({
      where: {
        id: { in: submissionIds },
      },
      include: {
        question: {
          include: {
            rubricSteps: {
              orderBy: { stepIndex: 'asc' },
            },
          },
        },
      },
    });

    const triggered = [];

    for (const sub of submissions) {
      if (!sub.imageUrl) {
        continue;
      }

      const payload = {
        submission_id: sub.id,
        s3_image_url: sub.imageUrl,
        rubric_steps: sub.question.rubricSteps.map((step) => ({
          id: step.id,
          step_index: step.stepIndex,
          latex_content: step.latexContent,
          max_score: step.maxScore,
        })),
      };

      this.client.emit('grading_task_event', payload);
      triggered.push(sub.id);
    }

    return { triggeredCount: triggered.length, triggeredIds: triggered };
  }

  async getSubmissionsByQuestion(questionId: string) {
    return this.prisma.submission.findMany({
      where: { questionId },
      include: {
        student: {
          select: { id: true, name: true, email: true },
        },
        evaluation: {
          include: {
            stepEvaluations: true,
          },
        },
      },
    });
  }

  async deleteSubmission(studentId: string, submissionId: string) {
    const submission = await this.prisma.submission.findUnique({
      where: { id: submissionId },
      include: { evaluation: true }
    });

    if (!submission) {
      throw new NotFoundException('Submission not found');
    }

    if (submission.studentId !== studentId) {
      throw new BadRequestException('You are not authorized to delete this submission');
    }

    // Cascade delete evaluation and stepEvaluations first to satisfy DB constraints
    if (submission.evaluation) {
      await this.prisma.stepEvaluation.deleteMany({
        where: { evaluationId: submission.evaluation.id }
      });
      await this.prisma.evaluation.delete({
        where: { id: submission.evaluation.id }
      });
    }

    return this.prisma.submission.delete({
      where: { id: submissionId }
    });
  }
}
