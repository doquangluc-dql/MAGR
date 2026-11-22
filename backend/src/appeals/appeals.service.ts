import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { AppealStatus } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { CreateAppealDto, UpdateAppealDto } from './dto/appeal.dto';

const appealInclude = {
  student: { select: { id: true, name: true, email: true } },
  rubricStep: { select: { id: true, stepIndex: true, latexContent: true, maxScore: true } },
  submission: { select: { id: true, questionId: true } },
};

@Injectable()
export class AppealsService {
  constructor(private prisma: PrismaService) {}

  // Học sinh gửi phản ánh cho bài đã được công bố điểm
  async create(studentId: string, dto: CreateAppealDto) {
    const submission = await this.prisma.submission.findUnique({
      where: { id: dto.submissionId },
      include: { question: { include: { rubricSteps: true } } },
    });
    if (!submission || submission.studentId !== studentId) {
      throw new NotFoundException('Không tìm thấy bài nộp');
    }
    if (!submission.isPublished) {
      throw new BadRequestException('Chỉ có thể phản ánh khi giáo viên đã công bố điểm');
    }

    let stepLabel: string | null = null;
    if (dto.rubricStepId) {
      const step = submission.question.rubricSteps.find((s) => s.id === dto.rubricStepId);
      if (!step) {
        throw new BadRequestException('Ý chấm không thuộc câu hỏi này');
      }
      stepLabel = `Ý ${step.stepIndex}: ${step.latexContent}`;
    }

    return this.prisma.appeal.create({
      data: {
        submissionId: submission.id,
        studentId,
        rubricStepId: dto.rubricStepId || null,
        stepLabel,
        content: dto.content.trim(),
      },
      include: appealInclude,
    });
  }

  // Học sinh xem các phản ánh của mình trong một kỳ thi
  async findMine(studentId: string, examId: string) {
    return this.prisma.appeal.findMany({
      where: { studentId, submission: { question: { examId } } },
      include: appealInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  // Giáo viên xem toàn bộ phản ánh của một kỳ thi mình phụ trách
  async findByExam(teacherId: string, examId: string) {
    const exam = await this.prisma.exam.findUnique({ where: { id: examId } });
    if (!exam) {
      throw new NotFoundException('Không tìm thấy kỳ thi');
    }
    if (exam.teacherId !== teacherId) {
      throw new ForbiddenException('Bạn không phụ trách kỳ thi này');
    }
    return this.prisma.appeal.findMany({
      where: { submission: { question: { examId } } },
      include: appealInclude,
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    });
  }

  // Giáo viên trả lời và/hoặc đổi trạng thái phản ánh
  async update(teacherId: string, appealId: string, dto: UpdateAppealDto) {
    const appeal = await this.prisma.appeal.findUnique({
      where: { id: appealId },
      include: { submission: { include: { question: { include: { exam: true } } } } },
    });
    if (!appeal) {
      throw new NotFoundException('Không tìm thấy phản ánh');
    }
    if (appeal.submission.question.exam.teacherId !== teacherId) {
      throw new ForbiddenException('Bạn không phụ trách kỳ thi này');
    }

    const status = dto.status as AppealStatus | undefined;
    return this.prisma.appeal.update({
      where: { id: appealId },
      data: {
        ...(dto.teacherReply !== undefined && { teacherReply: dto.teacherReply.trim() || null }),
        ...(status && {
          status,
          resolvedAt: status === AppealStatus.RESOLVED ? new Date() : null,
        }),
      },
      include: appealInclude,
    });
  }
}
