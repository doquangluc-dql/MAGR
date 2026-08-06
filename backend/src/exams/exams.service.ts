import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { Role } from '@prisma/client';

@Injectable()
export class ExamsService {
  constructor(private prisma: PrismaService) {}

  async create(title: string, teacherId: string) {
    return this.prisma.exam.create({
      data: {
        title,
        teacherId,
      },
    });
  }

  async findAll(userId: string, role: Role) {
    if (role === Role.TEACHER) {
      return this.prisma.exam.findMany({
        where: { teacherId: userId },
        include: {
          questions: true,
          students: {
            include: {
              student: {
                select: { id: true, name: true, email: true }
              }
            }
          }
        },
      });
    } else {
      return this.prisma.exam.findMany({
        where: {
          students: {
            some: { studentId: userId },
          },
        },
        include: {
          questions: true,
        },
      });
    }
  }

  async findOne(id: string, userId: string, role: Role) {
    const exam = await this.prisma.exam.findUnique({
      where: { id },
      include: {
        questions: {
          include: {
            rubricSteps: true,
            submissions: {
              where: role === Role.STUDENT ? { studentId: userId } : undefined,
              include: {
                evaluation: {
                  include: {
                    stepEvaluations: true,
                  },
                },
              },
            },
          },
        },
        students: {
          include: {
            student: {
              select: { id: true, name: true, email: true },
            },
          },
        },
      },
    });

    if (!exam) {
      throw new NotFoundException('Exam not found');
    }

    // Verify student is enrolled or user is the teacher
    if (role === Role.TEACHER && exam.teacherId !== userId) {
      throw new BadRequestException('Forbidden');
    }
    if (role === Role.STUDENT) {
      const isEnrolled = exam.students.some((s) => s.studentId === userId);
      if (!isEnrolled) {
        throw new BadRequestException('Not enrolled in this exam');
      }
    }

    return exam;
  }

  async enrollStudents(examId: string, studentIds?: string[], email?: string) {
    // Verify exam exists
    const exam = await this.prisma.exam.findUnique({ where: { id: examId } });
    if (!exam) {
      throw new NotFoundException('Exam not found');
    }

    let targetStudentIds: string[] = [];

    if (email) {
      const student = await this.prisma.user.findFirst({
        where: { email, role: Role.STUDENT },
      });
      if (!student) {
        throw new NotFoundException('Student not found with this email');
      }
      targetStudentIds = [student.id];
    } else if (studentIds && studentIds.length > 0) {
      const users = await this.prisma.user.findMany({
        where: {
          id: { in: studentIds },
          role: Role.STUDENT,
        },
      });
      targetStudentIds = users.map((u) => u.id);
    } else {
      throw new BadRequestException('Either studentIds or email must be provided');
    }

    // Create associations using transactions
    const operations = targetStudentIds.map((studentId) =>
      this.prisma.examStudent.upsert({
        where: {
          examId_studentId: { examId, studentId },
        },
        create: { examId, studentId },
        update: {},
      }),
    );

    await this.prisma.$transaction(operations);

    return { enrolledCount: targetStudentIds.length };
  }
}
