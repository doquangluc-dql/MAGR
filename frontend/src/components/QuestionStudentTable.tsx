import React, { useMemo, useState } from 'react';
import { ImageModal } from './ImageModal';
import { getValidTranscript } from './TranscriptPanel';
import {
  formatScore,
  getMssv,
  isSubmitted,
  getGradingState,
  GradingState,
  GRADING_STATE_LABEL,
  renderGradingStatus,
  isEvaluationError,
  getEvaluationErrorMessage,
} from '../utils/submissionStatus';

interface QuestionStudentTableProps {
  // selectedExam.students: [{ studentId, student: { id, name, email } }]
  enrollments: any[];
  // Bài nộp của câu hỏi đang chọn (GET /submissions/question/:id)
  submissions: any[];
  // Số phản ánh chưa giải quyết theo submissionId
  openAppealsBySubmission?: Record<string, number>;
  onOpenGrading: (submission: any) => void;
  // Chọn bài để gửi AI chấm (bỏ trống = không hiện cột checkbox)
  selectedIds?: Set<string>;
  onSelectionChange?: (ids: Set<string>) => void;
}

// Bài có thể chọn để chấm: đã nộp, có ảnh, không đang trong lúc chờ AI chấm
export const isSelectableForGrading = (sub: any) =>
  isSubmitted(sub) && !!sub.imageUrl && getGradingState(sub) !== 'grading';

type SortKey = 'stt' | 'mssv' | 'name' | 'submitted' | 'grading' | 'published' | 'score';
type SubmitFilter = 'all' | 'submitted' | 'not_submitted';
type GradingFilter = 'all' | Exclude<GradingState, 'none'>;

const GRADING_ORDER: Record<GradingState, number> = { none: 0, ungraded: 1, grading: 2, error: 3, graded: 4 };

interface Row {
  stt: number;
  student: any;
  mssv: string;
  sub: any | null;
  submitted: boolean;
  grading: GradingState;
  score: number | null;
}

export const QuestionStudentTable: React.FC<QuestionStudentTableProps> = ({
  enrollments,
  submissions,
  openAppealsBySubmission = {},
  onOpenGrading,
  selectedIds,
  onSelectionChange,
}) => {
  const selectable = !!selectedIds && !!onSelectionChange;
  const [search, setSearch] = useState('');
  const [submitFilter, setSubmitFilter] = useState<SubmitFilter>('all');
  const [gradingFilter, setGradingFilter] = useState<GradingFilter>('all');
  const [sortKey, setSortKey] = useState<SortKey>('stt');
  const [sortAsc, setSortAsc] = useState(true);
  const [viewing, setViewing] = useState<{ url: string; title: string } | null>(null);

  // Ghép danh sách học sinh ghi danh với bài nộp của câu hỏi (học sinh chưa nộp vẫn hiện)
  const rows: Row[] = useMemo(() => {
    const subByStudent = new Map<string, any>();
    submissions.forEach((s) => subByStudent.set(s.studentId || s.student?.id, s));
    return (enrollments || []).map((en, idx) => {
      const student = en.student || {};
      const sub = subByStudent.get(student.id || en.studentId) || null;
      const grading = getGradingState(sub);
      return {
        stt: idx + 1,
        student,
        mssv: getMssv(student.email),
        sub,
        submitted: isSubmitted(sub),
        grading,
        score: sub?.evaluation && grading === 'graded' ? sub.evaluation.totalScore : null,
      };
    });
  }, [enrollments, submissions]);

  const visibleRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = rows.filter((r) => {
      if (q && !r.mssv.toLowerCase().includes(q) && !(r.student.name || '').toLowerCase().includes(q)) return false;
      if (submitFilter === 'submitted' && !r.submitted) return false;
      if (submitFilter === 'not_submitted' && r.submitted) return false;
      if (gradingFilter !== 'all' && r.grading !== gradingFilter) return false;
      return true;
    });
    const value = (r: Row): number | string => {
      switch (sortKey) {
        case 'mssv': return r.mssv;
        case 'name': return (r.student.name || '').toLowerCase();
        case 'submitted': return r.submitted ? 1 : 0;
        case 'grading': return GRADING_ORDER[r.grading];
        case 'published': return r.sub?.isPublished ? 1 : 0;
        case 'score': return r.score ?? -1;
        default: return r.stt;
      }
    };
    return [...filtered].sort((a, b) => {
      const va = value(a);
      const vb = value(b);
      const cmp = typeof va === 'string' ? va.localeCompare(vb as string, 'vi', { numeric: true }) : (va as number) - (vb as number);
      return (sortAsc ? cmp : -cmp) || a.stt - b.stt;
    });
  }, [rows, search, submitFilter, gradingFilter, sortKey, sortAsc]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  const SortHeader: React.FC<{ k: SortKey; label: string }> = ({ k, label }) => (
    <th onClick={() => toggleSort(k)} style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }} title="Bấm để sắp xếp">
      {label} <span style={{ opacity: sortKey === k ? 1 : 0.3 }}>{sortKey === k && !sortAsc ? '▼' : '▲'}</span>
    </th>
  );

  const submittedCount = rows.filter((r) => r.submitted).length;

  const selectableVisible = visibleRows.filter((r) => isSelectableForGrading(r.sub)).map((r) => r.sub.id as string);
  const allVisibleSelected = selectableVisible.length > 0 && selectableVisible.every((id) => selectedIds?.has(id));
  const toggleOne = (id: string) => {
    if (!selectedIds || !onSelectionChange) return;
    const next = new Set(selectedIds);
    next.has(id) ? next.delete(id) : next.add(id);
    onSelectionChange(next);
  };
  const toggleAllVisible = () => {
    if (!selectedIds || !onSelectionChange) return;
    const next = new Set(selectedIds);
    selectableVisible.forEach((id) => (allVisibleSelected ? next.delete(id) : next.add(id)));
    onSelectionChange(next);
  };

  return (
    <div>
      {/* Thanh filter */}
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center', margin: '16px 0 12px' }}>
        <input
          type="text"
          className="form-input"
          placeholder="Tìm theo MSSV hoặc họ tên..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: '1 1 220px', maxWidth: '320px' }}
        />
        <select className="form-input" style={{ width: 'auto' }} value={submitFilter} onChange={(e) => setSubmitFilter(e.target.value as SubmitFilter)}>
          <option value="all">Bài nộp: Tất cả</option>
          <option value="submitted">Đã nộp</option>
          <option value="not_submitted">Chưa nộp</option>
        </select>
        <select className="form-input" style={{ width: 'auto' }} value={gradingFilter} onChange={(e) => setGradingFilter(e.target.value as GradingFilter)}>
          <option value="all">Chấm bài: Tất cả</option>
          {(['ungraded', 'grading', 'graded', 'error'] as const).map((s) => (
            <option key={s} value={s}>{GRADING_STATE_LABEL[s]}</option>
          ))}
        </select>
        <span style={{ fontSize: '13px', color: 'var(--text-muted)', marginLeft: 'auto' }}>
          Đã nộp {submittedCount}/{rows.length} · Hiển thị {visibleRows.length}
        </span>
      </div>

      <div className="table-container">
        <table className="app-table">
          <thead>
            <tr>
              {selectable && (
                <th style={{ width: '40px' }}>
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    disabled={selectableVisible.length === 0}
                    onChange={toggleAllVisible}
                    title="Chọn / bỏ chọn tất cả bài đang hiển thị"
                  />
                </th>
              )}
              <SortHeader k="stt" label="STT" />
              <SortHeader k="mssv" label="MSSV" />
              <SortHeader k="name" label="Họ tên" />
              <SortHeader k="submitted" label="Bài nộp" />
              <SortHeader k="grading" label="Chấm bài" />
              <th>Chép bài</th>
              <SortHeader k="published" label="Công bố" />
              <SortHeader k="score" label="Điểm" />
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((r) => {
              const openAppeals = r.sub ? openAppealsBySubmission[r.sub.id] || 0 : 0;
              return (
                <tr
                  key={r.student.id || r.stt}
                  onClick={() => r.submitted && onOpenGrading(r.sub)}
                  style={{ cursor: r.submitted ? 'pointer' : 'default' }}
                  title={r.submitted ? 'Bấm để mở trang chấm chi tiết' : undefined}
                >
                  {selectable && (
                    <td onClick={(e) => e.stopPropagation()} style={{ cursor: 'default' }}>
                      {isSelectableForGrading(r.sub) && (
                        <input type="checkbox" checked={!!selectedIds?.has(r.sub.id)} onChange={() => toggleOne(r.sub.id)} />
                      )}
                    </td>
                  )}
                  <td style={{ width: '56px' }}>{r.stt}</td>
                  <td style={{ fontFamily: 'monospace' }}>{r.mssv}</td>
                  <td style={{ fontWeight: 600 }}>
                    {r.student.name}
                    {openAppeals > 0 && (
                      <span className="badge badge-warning" style={{ marginLeft: '8px', fontSize: '11px' }} title="Phản ánh chưa giải quyết">
                        {openAppeals} phản ánh
                      </span>
                    )}
                  </td>
                  <td>
                    {r.submitted ? (
                      r.sub.imageUrl ? (
                        <button
                          type="button"
                          className="badge badge-success"
                          style={{ cursor: 'pointer', border: 'none', textDecoration: 'underline' }}
                          title="Xem ảnh bài nộp"
                          onClick={(e) => {
                            e.stopPropagation();
                            setViewing({ url: r.sub.imageUrl, title: `${r.mssv} - ${r.student.name}` });
                          }}
                        >
                          Đã nộp
                        </button>
                      ) : (
                        <span className="badge badge-success">Đã nộp</span>
                      )
                    ) : (
                      <span className="badge badge-error">Chưa nộp</span>
                    )}
                  </td>
                  <td>{renderGradingStatus(r.sub)}</td>
                  <td>
                    {!r.submitted ? (
                      <span style={{ color: 'var(--text-muted)' }}>—</span>
                    ) : r.sub.transcriptStatus === 'PROCESSING' ? (
                      <span className="badge badge-warning" style={{ backgroundColor: 'rgba(56,189,248,0.2)', color: '#38bdf8' }}>Đang chép...</span>
                    ) : getValidTranscript(r.sub) ? (
                      <span className="badge badge-success" style={{ backgroundColor: 'rgba(52,211,153,0.2)', color: '#34d399' }}>Đã chép</span>
                    ) : r.sub.transcriptStatus === 'FAILED' && r.sub.transcript?.image_url === r.sub.imageUrl ? (
                      <span className="badge badge-error" title={r.sub.transcript?.error_message}>Lỗi chép bài</span>
                    ) : (
                      <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>Chưa chép</span>
                    )}
                  </td>
                  <td>
                    {!r.submitted ? (
                      <span style={{ color: 'var(--text-muted)' }}>—</span>
                    ) : r.sub.isPublished ? (
                      <span style={{ color: 'var(--success-color)' }}>Đã công bố</span>
                    ) : (
                      <span style={{ color: 'var(--text-muted)' }}>Chưa công bố</span>
                    )}
                  </td>
                  <td style={{ fontWeight: 'bold' }}>
                    {r.score !== null ? (
                      `${formatScore(r.score)}đ`
                    ) : r.sub?.evaluation && isEvaluationError(r.sub.evaluation) ? (
                      <span style={{ color: '#ef4444', fontSize: '13px' }} title={getEvaluationErrorMessage(r.sub.evaluation)}>Chấm lỗi</span>
                    ) : (
                      '---'
                    )}
                  </td>
                </tr>
              );
            })}
            {visibleRows.length === 0 && (
              <tr>
                <td colSpan={selectable ? 9 : 8} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                  {rows.length === 0 ? 'Kỳ thi chưa có học sinh nào ghi danh.' : 'Không có học sinh nào khớp bộ lọc.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {viewing && <ImageModal imageUrl={viewing.url} title={viewing.title} onClose={() => setViewing(null)} />}
    </div>
  );
};
