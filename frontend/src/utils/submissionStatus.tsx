import React from 'react';

export const formatScore = (num: number) => {
  const str = num.toString();
  return str.includes('.') ? str : num.toFixed(1);
};

// MSSV = phần trước @ của email (học sinh import từ CSV có email dạng <mssv>@gm.uit.edu.vn)
export const getMssv = (email?: string) => (email ? email.split('@')[0] : '');

const ERROR_PREFIX = '[LỖI CHẤM BÀI]';

export const isEvaluationError = (evaluation: any): boolean =>
  !!evaluation?.stepEvaluations?.some((s: any) => s.aiReasoning?.startsWith(ERROR_PREFIX));

export const getEvaluationErrorMessage = (evaluation: any): string => {
  const errStep = evaluation?.stepEvaluations?.find((s: any) => s.aiReasoning?.startsWith(ERROR_PREFIX));
  return errStep ? errStep.aiReasoning.replace(`${ERROR_PREFIX} `, '') : 'Mô hình AI chấm bài gặp lỗi.';
};

export const isSubmitted = (sub: any): boolean => !!sub && sub.status !== 'NOT_SUBMITTED';

export type GradingState = 'none' | 'ungraded' | 'grading' | 'error' | 'graded';

// Trạng thái chấm của một bài nộp, góc nhìn giáo viên
export const getGradingState = (sub: any): GradingState => {
  if (!isSubmitted(sub)) return 'none';
  if (sub.status === 'GRADING') return 'grading';
  if (isEvaluationError(sub.evaluation)) return 'error';
  if (sub.status === 'GRADED' || sub.evaluation) return 'graded';
  return 'ungraded';
};

export const GRADING_STATE_LABEL: Record<GradingState, string> = {
  none: '—',
  ungraded: 'Chưa chấm',
  grading: 'Đang chờ chấm',
  error: 'Lỗi AI chấm',
  graded: 'Đã chấm điểm',
};

export const renderGradingStatus = (sub: any) => {
  const state = getGradingState(sub);
  switch (state) {
    case 'none':
      return <span style={{ color: 'var(--text-muted)' }}>—</span>;
    case 'grading':
      return <span className="badge badge-warning">{GRADING_STATE_LABEL.grading}</span>;
    case 'error':
      return (
        <span
          className="badge badge-error"
          style={{ backgroundColor: 'rgba(239, 68, 68, 0.2)', color: '#ef4444', border: '1px solid #ef4444' }}
          title={getEvaluationErrorMessage(sub.evaluation)}
        >
          {GRADING_STATE_LABEL.error}
        </span>
      );
    case 'graded':
      return <span className="badge badge-success">{GRADING_STATE_LABEL.graded}</span>;
    default:
      return <span className="badge badge-info">{GRADING_STATE_LABEL.ungraded}</span>;
  }
};

// Bài cần gửi AI chấm: đã nộp, có ảnh, chưa có kết quả hoặc lần trước chấm lỗi
export const needsGrading = (sub: any): boolean => {
  const state = getGradingState(sub);
  return !!sub?.imageUrl && (state === 'ungraded' || state === 'error');
};
