import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { S3Service } from './s3.service';
import { SubmissionStatus, OcrStatus } from '@prisma/client';
import axios from 'axios';
import { EvaluationsService } from '../evaluations/evaluations.service';

@Injectable()
export class SubmissionsService {
  constructor(
    private prisma: PrismaService,
    private s3Service: S3Service,
    private evaluationsService: EvaluationsService,
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

    let submission;
    if (!existing) {
      submission = await this.prisma.submission.create({
        data: {
          studentId,
          questionId,
          imageUrl,
          status: SubmissionStatus.SUBMITTED,
          ocrStatus: OcrStatus.PROCESSING,
          submittedAt: new Date(),
        },
      });
    } else {
      submission = await this.prisma.submission.update({
        where: { id: existing.id },
        data: {
          imageUrl,
          status: SubmissionStatus.SUBMITTED,
          ocrStatus: OcrStatus.PROCESSING,
          submittedAt: new Date(),
        },
      });
    }

    // Tự động phát event OCR ngầm sang Webhook Modal (gọi trực tiếp)
    const ocrUrl = process.env.MODAL_OCR_URL;
    if (ocrUrl) {
      // Chạy ngầm (không await) để web phản hồi ngay cho sinh viên
      axios.post(ocrUrl, {
        image_url: submission.imageUrl,
        custom_id: submission.id,
        max_length: 1024,
        image_size: 1024,
        base_size: 1024
      }).then(res => {
        const ocrRes = res.data;
        let fullText = "";
        if (ocrRes && ocrRes.ocr) {
            fullText = ocrRes.ocr.map((item: any) => item.context).join("\n");
        }
        this.saveOcrResult({
          submission_id: submission.id,
          ocr_content: fullText,
          ocr_bboxes: ocrRes.ocr,
          status: 'success'
        });
      }).catch(err => {
        console.error(`[Error] Gọi OCR thất bại cho submission ${submission.id}:`, err.message);
        this.saveOcrResult({ submission_id: submission.id, status: 'error' });
      });
    } else {
      console.log(`[Placeholder] Bỏ qua gọi OCR tự động vì chưa có biến MODAL_OCR_URL`);
    }

    return submission;
  }

  async saveOcrResult(payload: {
    submission_id: string;
    ocr_content?: string;
    ocr_bboxes?: any;
    status: 'success' | 'error';
    error_message?: string;
  }) {
    const { submission_id, ocr_content, ocr_bboxes, status } = payload;
    const isSuccess = status === 'success';

    return this.prisma.submission.update({
      where: { id: submission_id },
      data: {
        ocrStatus: isSuccess ? OcrStatus.COMPLETED : OcrStatus.FAILED,
        ocrContent: ocr_content || null,
        ocrBboxes: ocr_bboxes || null,
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
        ocr_content: sub.ocrContent,
        ocr_bboxes: sub.ocrBboxes,
        rubric_steps: sub.question.rubricSteps.map((step) => ({
          id: step.id,
          step_index: step.stepIndex,
          latex_content: step.latexContent,
          max_score: step.maxScore,
        })),
      };

      const workerUrl = process.env.MODAL_WORKER_URL;
      if (workerUrl) {
        // Gọi Webhook Modal bất đồng bộ
        axios.post(workerUrl, payload).then(res => {
          const gradingResult = res.data;
          if (gradingResult && gradingResult.status === 'success') {
            this.evaluationsService.saveAiEvaluation({
              submission_id: gradingResult.submission_id,
              total_score: gradingResult.total_score,
              steps: gradingResult.steps.map((s: any) => ({
                rubric_step_id: s.rubric_step_id,
                is_marked_incorrect: s.is_marked_incorrect,
                ai_reasoning: s.ai_reasoning
              }))
            });
          }
        }).catch(err => {
          console.error(`[Error] Không thể gọi AI Worker cho submission ${sub.id}:`, err.message);
        });
      } else {
        console.log(`[Placeholder] Chờ AI chấm bài cho submission: ${sub.id}`);
      }
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
