import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CreateQuestionDto } from './dto/question.dto';

@Injectable()
export class QuestionsService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateQuestionDto) {
    // Check if exam exists
    const exam = await this.prisma.exam.findUnique({
      where: { id: dto.examId },
    });
    if (!exam) {
      throw new NotFoundException('Exam not found');
    }

    return this.prisma.$transaction(async (tx) => {
      const question = await tx.question.create({
        data: {
          examId: dto.examId,
          content: dto.content,
        },
      });

      const rubricSteps = await Promise.all(
        dto.rubricSteps.map((step) =>
          tx.rubricStep.create({
            data: {
              questionId: question.id,
              stepIndex: step.stepIndex,
              latexContent: step.latexContent,
              maxScore: step.maxScore,
            },
          }),
        ),
      );

      return {
        ...question,
        rubricSteps,
      };
    });
  }

  async findOne(id: string) {
    const question = await this.prisma.question.findUnique({
      where: { id },
      include: {
        rubricSteps: {
          orderBy: { stepIndex: 'asc' },
        },
      },
    });

    if (!question) {
      throw new NotFoundException('Question not found');
    }

    return question;
  }
}
