# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

MAGR is a graduation thesis project: an AI-assisted handwritten math exam grading system. Teachers create exams, questions (LaTeX), and step-by-step rubrics. Students upload photos of their handwritten solutions. Those photos go through OCR, then an LLM grades them against the rubric, and the teacher can override the result and publish it. Code comments, UI strings, log messages and docs (`SYSTEM_DESIGN.md`, `modal-ocr/README.md`) are mostly in Vietnamese.

## Commands

There are no test suites in this repo. CI (`.github/workflows/ci.yml`) only checks that each part builds or compiles.

Backend (`backend/`, NestJS 10 + Prisma):
```bash
npm run start:dev                     # watch mode, port 3000
npm run build                         # nest build (what CI runs)
npx prisma validate && npx prisma generate
npx prisma db push                    # schema sync; there is no migrations dir, and the prod container runs db push on start
```

Frontend (`frontend/`, React 18 + Vite):
```bash
npm run dev                           # port 5173
npm run build                         # tsc && vite build (what CI runs)
```
`npm run lint` exists, but there is no ESLint config in the repo.

AI worker / OCR (Python 3.10, deployed to Modal):
```bash
cd ai-worker && modal deploy modal_worker.py   # app "magr-ai-worker"; run from ai-worker/ so ocr_client is importable
modal deploy modal-ocr/modal_ocr.py      # GPU OCR service (baidu/Unlimited-OCR on L4)
python modal-ocr/client_test.py          # manual smoke test against the deployed OCR URL
modal app logs <app> --timestamps --since 30m  # old crash lines persist in plain `logs`; compare against `modal app history <app>`
```
The Modal CLI lives in `modal-ocr/.venv` (`source modal-ocr/.venv/bin/activate`); it is not installed system-wide. Local Python modules imported by a Modal function must be added to its image with `.add_local_python_source(...)` (Modal ≥ 1.0 doesn't auto-mount them).

Full stack locally: `docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build` (Postgres, RabbitMQ, backend, frontend; OCR and grading always run on Modal). Copy `.env.example` to `.env` first.

Bulk student registration: `python scripts/import_students.py <csv>` (local only: `scripts/` and `*.csv` are gitignored, so this script is not in the repo). It posts to `localhost:3000/auth/register`, using email `<mssv>@gm.uit.edu.vn` and the MSSV as the password.

## Architecture

**Request flow (current, Modal-based):**
1. A student calls `POST /submissions/presigned-url`. The backend creates or updates a `Submission` (`NOT_SUBMITTED`) and returns an S3 pre-signed PUT URL. The browser uploads the image straight to S3.
2. `POST /submissions` confirms the upload: status becomes `SUBMITTED` and `ocrStatus` becomes `PROCESSING`. The backend then makes a **fire-and-forget `fetch` to `MODAL_OCR_URL`** and stores the result through `saveOcrResult` (`ocrContent` plus `ocrBboxes` JSON, which the frontend draws in `ImageViewerWithBbox`).
3. A teacher picks submissions on the per-question grading page and calls `POST /submissions/trigger-grading`. Each submission is set to `GRADING`, then `SubmissionsService.runGradingPipeline` runs in the background:
   - **Transcription (`ensureTranscript`):** the backend POSTs to `MODAL_TRANSCRIBE_URL` (`transcribe_submission` in `modal_worker.py`, logic in `ai-worker/transcriber.py`). The worker draws the Unlimited-OCR boxes on the image as labeled regions B1…Bn and asks Gemini (`OPENROUTER_TRANSCRIBE_MODEL`, default `google/gemini-3.7-flash`) to transcribe each region. The JSON schema uses a `box_id` enum. The result is stored in `Submission.transcript` and is **cached per `imageUrl`**, so regrading does not call Gemini again. `POST /submissions/:id/transcribe` forces a re-run. Unlimited-OCR's own text is no longer used for grading. Only its boxes are.
   - **Grading:** the backend POSTs the region-labeled transcript (`[B1] …`) to `MODAL_WORKER_URL` (`grade_submission`, Gemma via `OPENROUTER_MODEL`). **The backend**, not the worker, saves the response through `EvaluationsService.saveAiEvaluation` or `saveAiEvaluationError`. Both clear `GRADING`.
   - If `MODAL_TRANSCRIBE_URL` is unset, the pipeline falls back to grading the raw `ocrContent`.
4. Students can file appeals (`Appeal` model, `backend/src/appeals/`) on published results, either per rubric step or for the whole question. Teachers answer them in the exam's "Giải đáp thắc mắc" tab. A teacher can override step evaluations (`PUT /evaluations/:id/override`) and publish (`POST /evaluations/submission/:id/publish`, which sets `isPublished`). Students only see published results.

All Modal calls are synchronous HTTP calls that the backend runs in the background without awaiting them. The API returns before grading finishes, and the frontend polls by re-fetching.

**Legacy RabbitMQ leftovers:** the `rabbitmq` service in `docker-compose.yml` and the `@EventPattern` handlers in `evaluations.controller.ts` come from the earlier queue-based design. `SYSTEM_DESIGN.md` plans to remove RabbitMQ in favour of Modal webhooks. The target deployment there is Vercel, Render, Neon, S3 and Modal, with Terraform planned. Put new work on the Modal path.

**Backend:** there is one Nest module per domain (`auth`, `exams`, `questions`, `submissions`, `evaluations`, `appeals`) plus a global `PrismaModule`. Auth is JWT via `JwtAuthGuard`, with role checks through `@Roles(Role.TEACHER|STUDENT)` and `RolesGuard`. `S3Service` supports both AWS S3 and custom endpoints (R2/MinIO) through `S3_ENDPOINT` and `S3_EXTERNAL_ENDPOINT`, and rewrites URLs for the client host. Deletes cascade by hand: StepEvaluation, then Evaluation, then Submission, because the schema has no `onDelete` cascades. The exception is `Appeal`, which cascades with its submission and student, and is set to null when its rubric step is deleted.

**Data model** (`backend/prisma/schema.prisma`): User (TEACHER/STUDENT) → Exam (teacher-owned, with students enrolled through `ExamStudent`) → Question (LaTeX `content`) → ordered `RubricStep`s (`stepIndex`, `latexContent`, `maxScore`). A Submission is one per student per question. It has an optional `Evaluation`, which holds `StepEvaluation`s linked to rubric steps, each with `isMarkedIncorrect`, `aiReasoning` and `teacherFeedback`. `SubmissionStatus` is `NOT_SUBMITTED → SUBMITTED → GRADING (AI in flight) → SUBMITTED/GRADED`, where `GRADED` means published. `transcriptStatus` tracks the Gemini transcription separately. Students only receive `transcript` once a result is published (stripped in `ExamsService.findOne`).

**Frontend:** most UI lives in one large file, `frontend/src/App.tsx`, covering both the teacher and student views. Newer features live in `components/`: `QuestionStudentTable` (per-question grading page), `TranscriptPanel` (region list with two-way hover against `ImageViewerWithBbox`), and `TeacherAppealsPanel` / `StudentAppealPanel`. Shared status helpers are in `utils/submissionStatus.tsx`. It uses axios with a global `baseURL` (`VITE_API_URL`, falling back to `http://<host>:3000`) and a bearer token set in `context/AuthContext.tsx`. Math is rendered by `components/MathRenderer.tsx`. In production, nginx serves it as an SPA.

**Config:** `ai-worker/modal_worker.py` loads Modal secrets from `../.env.production` through `modal.Secret.from_dotenv`. Deploy from a checkout where that file exists. `.github/workflows/cd.yml` builds the backend and frontend images and pushes them to GHCR on every push to `main`.
