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
          questions: {
            include: {
              submissions: {
                where: { studentId: userId }
              }
            }
          },
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

  async importStudents(examId: string, students: { mssv: string; name: string }[]) {
    const exam = await this.prisma.exam.findUnique({ where: { id: examId } });
    if (!exam) {
      throw new NotFoundException('Exam not found');
    }

    let addedCount = 0;
    
    // Lưu ý: Dùng bcrypt.hash để băm mật khẩu, nhưng để đơn giản ta import nó
    const bcrypt = require('bcrypt');
    const saltRounds = 10;

    for (const stu of students) {
      const email = `${stu.mssv}@gm.uit.edu.vn`;
      
      // 1. Kiểm tra tài khoản đã tồn tại chưa
      let user = await this.prisma.user.findFirst({
        where: { email }
      });

      // 2. Nếu chưa tồn tại, tạo mới
      if (!user) {
        const hashedPassword = await bcrypt.hash(stu.mssv, saltRounds);
        user = await this.prisma.user.create({
          data: {
            name: stu.name,
            email: email,
            password: hashedPassword,
            role: Role.STUDENT
          }
        });
      }

      // 3. Đưa sinh viên vào kỳ thi
      const existingEnroll = await this.prisma.examStudent.findUnique({
        where: { examId_studentId: { examId, studentId: user.id } }
      });

      if (!existingEnroll) {
        await this.prisma.examStudent.create({
          data: { examId, studentId: user.id }
        });
        addedCount++;
      }
    }

    return { addedCount, totalProcessed: students.length };
  }

  async removeStudent(examId: string, studentId: string) {
    const enroll = await this.prisma.examStudent.findUnique({
      where: { examId_studentId: { examId, studentId } }
    });
    if (!enroll) {
      throw new NotFoundException('Student is not enrolled in this exam');
    }
    
    await this.prisma.examStudent.delete({
      where: { examId_studentId: { examId, studentId } }
    });
    
    return { success: true };
  }

  async update(id: string, title: string, teacherId: string) {
    const exam = await this.prisma.exam.findUnique({ where: { id } });
    if (!exam) {
      throw new NotFoundException('Exam not found');
    }
    if (exam.teacherId !== teacherId) {
      throw new BadRequestException('Forbidden: You do not own this exam');
    }
    return this.prisma.exam.update({
      where: { id },
      data: { title },
    });
  }

  async remove(id: string, teacherId: string) {
    const exam = await this.prisma.exam.findUnique({
      where: { id },
      include: { questions: true },
    });
    if (!exam) {
      throw new NotFoundException('Exam not found');
    }
    if (exam.teacherId !== teacherId) {
      throw new BadRequestException('Forbidden: You do not own this exam');
    }

    const questionIds = exam.questions.map((q) => q.id);

    return this.prisma.$transaction(async (tx) => {
      // Find all submissions for these questions
      const submissions = await tx.submission.findMany({
        where: { questionId: { in: questionIds } },
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
        where: { questionId: { in: questionIds } },
      });

      // Delete Rubric Steps
      await tx.rubricStep.deleteMany({
        where: { questionId: { in: questionIds } },
      });

      // Delete Questions
      await tx.question.deleteMany({
        where: { examId: id },
      });

      // Delete ExamStudent enrollments
      await tx.examStudent.deleteMany({
        where: { examId: id },
      });

      // Delete Exam itself
      return tx.exam.delete({
        where: { id },
      });
    });
  }
}
