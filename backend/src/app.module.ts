import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma.module';
import { AuthModule } from './auth/auth.module';
import { ExamsModule } from './exams/exams.module';
import { QuestionsModule } from './questions/questions.module';
import { SubmissionsModule } from './submissions/submissions.module';
import { EvaluationsModule } from './evaluations/evaluations.module';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    ExamsModule,
    QuestionsModule,
    SubmissionsModule,
    EvaluationsModule,
  ],
})
export class AppModule {}
