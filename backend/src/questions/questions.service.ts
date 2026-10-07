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
          name: dto.name,
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

  async update(id: string, dto: CreateQuestionDto) {
    const question = await this.prisma.question.findUnique({
      where: { id },
      include: { rubricSteps: true }
    });
    if (!question) {
      throw new NotFoundException('Question not found');
    }

    return this.prisma.$transaction(async (tx) => {
      const existingSteps = question.rubricSteps;
      const newSteps = dto.rubricSteps;
      const newStepIndexes = newSteps.map(s => s.stepIndex);

      // 1. Delete steps that are no longer in the new list (and their evaluations)
      const stepsToDelete = existingSteps.filter(s => !newStepIndexes.includes(s.stepIndex));
      if (stepsToDelete.length > 0) {
        const idsToDelete = stepsToDelete.map(s => s.id);
        await tx.stepEvaluation.deleteMany({
          where: { rubricStepId: { in: idsToDelete } }
        });
        await tx.rubricStep.deleteMany({
          where: { id: { in: idsToDelete } }
        });
      }

      // 2. Update existing steps or Create new ones
      const rubricSteps = await Promise.all(
        newSteps.map(async (step) => {
          const existing = existingSteps.find(s => s.stepIndex === step.stepIndex);
          if (existing) {
            return tx.rubricStep.update({
              where: { id: existing.id },
              data: {
                latexContent: step.latexContent,
                maxScore: step.maxScore
              }
            });
          } else {
            return tx.rubricStep.create({
              data: {
                questionId: id,
                stepIndex: step.stepIndex,
                latexContent: step.latexContent,
                maxScore: step.maxScore
              }
            });
          }
        })
      );

      // 3. Update question basic info
      const updatedQuestion = await tx.question.update({
        where: { id },
        data: {
          name: dto.name,
          content: dto.content,
        },
      });

      rubricSteps.sort((a, b) => a.stepIndex - b.stepIndex);

      return {
        ...updatedQuestion,
        rubricSteps,
      };
    });
  }

  async remove(id: string) {
    const question = await this.prisma.question.findUnique({
      where: { id },
    });
    if (!question) {
      throw new NotFoundException('Question not found');
    }

    return this.prisma.$transaction(async (tx) => {
      // Find all submissions for this question
      const submissions = await tx.submission.findMany({
        where: { questionId: id },
        include: { evaluation: true },
      });
      const submissionIds = submissions.map((s) => s.id);
      const evaluationIds = submissions
        .map((s) => s.evaluation?.id)
        .filter(Boolean) as string[];

      // Delete Step Evaluations
      await tx.stepEvaluation.deleteMany({
        where: { evaluationId: { in: evaluationIds } },
      });

      // Delete Evaluations
      await tx.evaluation.deleteMany({
        where: { submissionId: { in: submissionIds } },
      });

      // Delete Submissions
      await tx.submission.deleteMany({
        where: { questionId: id },
      });

      // Delete Rubric Steps
      await tx.rubricStep.deleteMany({
        where: { questionId: id },
      });

      // Delete Question
      return tx.question.delete({
        where: { id },
      });
    });
  }
}
