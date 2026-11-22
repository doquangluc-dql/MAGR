import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { S3Service } from './s3.service';
import { Prisma, Submission, SubmissionStatus, OcrStatus, TranscriptStatus } from '@prisma/client';
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
          // Ảnh mới: bỏ box / text / bài chép của ảnh cũ
          ocrContent: null,
          ocrBboxes: Prisma.DbNull,
          transcript: Prisma.DbNull,
          transcriptStatus: TranscriptStatus.PENDING,
        },
      });
    }

    // Tự động phát event OCR ngầm sang Webhook Modal (gọi trực tiếp)
    const ocrUrl = process.env.MODAL_OCR_URL;
    if (ocrUrl) {
      // Chạy ngầm (không await) để web phản hồi ngay cho sinh viên
      fetch(ocrUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_url: submission.imageUrl,
          custom_id: submission.id,
          max_length: 1024,
          image_size: 1024,
          base_size: 1024
        }),
        // Tính cả thời gian chờ GPU + cold start; tránh để bài nộp kẹt ở PROCESSING mãi
        signal: AbortSignal.timeout(10 * 60 * 1000),
      })
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`OCR HTTP ${res.status}: ${await res.text()}`);
        }
        return res.json();
      })
      .then(async (ocrRes: any) => {
        // Dịch vụ OCR trả HTTP 200 kèm {"status": "error", "message": ...} khi xử lý ảnh lỗi
        if (!ocrRes || ocrRes.status === 'error' || !Array.isArray(ocrRes.ocr)) {
          throw new Error(ocrRes?.message || 'Dịch vụ OCR trả về dữ liệu không hợp lệ');
        }
        const fullText = ocrRes.ocr.map((item: any) => item.context).join("\n");
        await this.saveOcrResult({
          submission_id: submission.id,
          ocr_content: fullText,
          ocr_bboxes: ocrRes.ocr,
          status: 'success'
        });
      }).catch(async (err) => {
        console.error(`[Error] Gọi OCR thất bại cho submission ${submission.id}:`, err.message);
        await this.saveOcrResult({ submission_id: submission.id, status: 'error' })
          .catch((e) => console.error(`[Error] Không lưu được trạng thái OCR lỗi cho ${submission.id}:`, e.message));
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

  // Gọi dịch vụ Modal; thử lại 1 lần nếu lỗi mạng trước khi có phản hồi ("fetch failed", DNS...).
  // Không thử lại khi đã có phản hồi HTTP (kể cả lỗi), vì request có thể đã được xử lý.
  private async postJson(url: string, body: unknown, timeoutMs = 10 * 60 * 1000): Promise<Response> {
    const send = () =>
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    try {
      return await send();
    } catch (err: any) {
      if (err?.name === 'TimeoutError' || err?.name === 'AbortError') throw err;
      console.warn(`[Warn] Lỗi kết nối tới ${new URL(url).hostname} (${err.message}), thử lại sau 2s...`);
      await new Promise((r) => setTimeout(r, 2000));
      return send();
    }
  }

  // Bài chép đã lưu có dùng lại được không (đúng ảnh hiện tại và đã chép xong)
  private hasValidTranscript(sub: Submission): boolean {
    const t = sub.transcript as any;
    return sub.transcriptStatus === TranscriptStatus.COMPLETED && !!t?.regions && t.image_url === sub.imageUrl;
  }

  // Bài làm có nhãn vùng "[B1] ...", là input cho bước chấm điểm
  private buildLabeledTranscript(transcript: any): string {
    const lines = (transcript?.regions || [])
      .filter((r: any) => r.latex)
      .map((r: any) => `[${r.box_id}] ${r.latex}`);
    if (transcript?.unboxed) lines.push(`[Ngoài vùng] ${transcript.unboxed}`);
    return lines.join('\n');
  }

  /**
   * Đảm bảo bài nộp có bài chép theo vùng (Gemini) cho ảnh hiện tại.
   * Có sẵn và đúng ảnh thì dùng lại, không gọi Gemini lần nữa; force=true để chép lại.
   */
  async ensureTranscript(submissionId: string, force = false): Promise<any> {
    const sub = await this.prisma.submission.findUnique({ where: { id: submissionId } });
    if (!sub) throw new NotFoundException('Submission not found');
    if (!sub.imageUrl) throw new BadRequestException('Bài nộp chưa có ảnh');
    if (!force && this.hasValidTranscript(sub)) return sub.transcript;

    const transcribeUrl = process.env.MODAL_TRANSCRIBE_URL;
    if (!transcribeUrl) throw new Error('Chưa cấu hình MODAL_TRANSCRIBE_URL');

    await this.prisma.submission.update({
      where: { id: sub.id },
      data: { transcriptStatus: TranscriptStatus.PROCESSING },
    });

    try {
      // Timeout dài: có thể phải chờ GPU OCR khởi động nếu bài chưa có box
      const res = await this.postJson(transcribeUrl, {
        submission_id: sub.id,
        image_url: sub.imageUrl,
        bboxes: Array.isArray(sub.ocrBboxes) ? sub.ocrBboxes : null,
      });
      if (!res.ok) throw new Error(`Transcriber HTTP ${res.status}: ${await res.text()}`);
      const out: any = await res.json();
      if (out?.status !== 'success' || !Array.isArray(out.regions)) {
        throw new Error(out?.error_message || 'Dịch vụ chép bài trả về dữ liệu không hợp lệ');
      }

      const transcript = {
        image_url: sub.imageUrl,
        regions: out.regions,
        unboxed: out.unboxed || '',
        model: out.model,
        usage: out.usage,
        createdAt: new Date().toISOString(),
      };
      // Worker tự gọi OCR khi bài chưa có box: lưu luôn box để lần sau khỏi chạy GPU
      const savedBoxes = !Array.isArray(sub.ocrBboxes) && Array.isArray(out.ocr_bboxes) ? out.ocr_bboxes : undefined;
      await this.prisma.submission.update({
        where: { id: sub.id },
        data: {
          transcript: transcript as Prisma.InputJsonValue,
          transcriptStatus: TranscriptStatus.COMPLETED,
          ...(savedBoxes && { ocrBboxes: savedBoxes, ocrStatus: OcrStatus.COMPLETED }),
        },
      });
      return transcript;
    } catch (err: any) {
      await this.prisma.submission.update({
        where: { id: sub.id },
        data: {
          transcriptStatus: TranscriptStatus.FAILED,
          transcript: { image_url: sub.imageUrl, error_message: err.message, createdAt: new Date().toISOString() },
        },
      });
      throw err;
    }
  }

  // Giáo viên bấm "Chép lại": chạy nền, giao diện tự làm mới để thấy kết quả
  async retranscribe(submissionId: string) {
    const sub = await this.prisma.submission.findUnique({ where: { id: submissionId } });
    if (!sub) throw new NotFoundException('Submission not found');
    if (!sub.imageUrl) throw new BadRequestException('Bài nộp chưa có ảnh');
    if (sub.transcriptStatus === TranscriptStatus.PROCESSING) {
      throw new BadRequestException('Bài này đang được chép');
    }
    // Ghi PROCESSING trước khi trả về, để giao diện hỏi lại ngay cũng thấy đúng trạng thái
    await this.prisma.submission.update({
      where: { id: submissionId },
      data: { transcriptStatus: TranscriptStatus.PROCESSING },
    });
    this.ensureTranscript(submissionId, true).catch((err) =>
      console.error(`[Error] Chép lại thất bại cho submission ${submissionId}:`, err.message),
    );
    return { submissionId, transcriptStatus: TranscriptStatus.PROCESSING };
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

    const workerUrl = process.env.MODAL_WORKER_URL;
    const useTranscriber = !!process.env.MODAL_TRANSCRIBE_URL;
    const triggered = [];

    for (const sub of submissions) {
      if (!sub.imageUrl) {
        continue;
      }
      if (!workerUrl) {
        console.log(`[Placeholder] Chờ AI chấm bài cho submission: ${sub.id}`);
        continue;
      }

      // Đánh dấu "Đang chờ chấm"; saveAiEvaluation / saveAiEvaluationError sẽ trả lại trạng thái cũ
      await this.prisma.submission.update({
        where: { id: sub.id },
        data: { status: SubmissionStatus.GRADING },
      });

      // Chạy nền: chép bài (hoặc dùng bài chép đã lưu) -> gửi Gemma chấm
      this.runGradingPipeline(sub, workerUrl, useTranscriber).catch(async (err) => {
        console.error(`[Error] Chấm bài thất bại cho submission ${sub.id}:`, err.message);
        await this.evaluationsService.saveAiEvaluationError(sub.id, err.message);
      });
      triggered.push(sub.id);
    }

    return { triggeredCount: triggered.length, triggeredIds: triggered };
  }

  private async runGradingPipeline(
    sub: Submission & { question: { content: string; rubricSteps: any[] } },
    workerUrl: string,
    useTranscriber: boolean,
  ) {
    // 1. Bài làm dạng text: bài chép theo vùng (Gemini); chưa cấu hình transcriber thì dùng OCR cũ
    let ocrContent = sub.ocrContent;
    if (useTranscriber) {
      try {
        const transcript = await this.ensureTranscript(sub.id);
        ocrContent = this.buildLabeledTranscript(transcript);
      } catch (err: any) {
        throw new Error(`Chép bài thất bại: ${err.message}`);
      }
      if (!ocrContent.trim()) {
        throw new Error('Không đọc được nội dung nào trong ảnh bài làm.');
      }
    }

    // 2. Gửi Gemma chấm theo barem
    const res = await this.postJson(workerUrl, {
      submission_id: sub.id,
      s3_image_url: sub.imageUrl,
      ocr_content: ocrContent,
      problem_description: sub.question.content,
      rubric_steps: sub.question.rubricSteps.map((step) => ({
        id: step.id,
        step_index: step.stepIndex,
        latex_content: step.latexContent,
        max_score: step.maxScore,
      })),
    }).catch((err) => {
      throw new Error(`Lỗi kết nối AI Worker: ${err.message}`);
    });
    if (!res.ok) {
      throw new Error(`Worker HTTP ${res.status}: ${await res.text()}`);
    }
    const gradingResult: any = await res.json();
    if (gradingResult?.status !== 'success') {
      throw new Error(gradingResult?.error_message || 'Mô hình AI chấm bài trả về lỗi không xác định.');
    }

    await this.evaluationsService.saveAiEvaluation({
      submission_id: gradingResult.submission_id,
      total_score: gradingResult.total_score,
      steps: gradingResult.steps.map((s: any) => ({
        rubric_step_id: s.rubric_step_id,
        is_marked_incorrect: s.is_marked_incorrect,
        ai_reasoning: s.ai_reasoning,
      })),
    });
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
