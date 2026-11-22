import React, { useState } from 'react';
import axios from 'axios';
import { MathRenderer } from './MathRenderer';
import { getMssv } from '../utils/submissionStatus';

interface TeacherAppealsPanelProps {
  appeals: any[];
  questions: any[];
  onChanged: () => void;
  // Mở trang chấm chi tiết của bài bị phản ánh
  onOpenSubmission: (questionId: string, submissionId: string) => void;
}

export const TeacherAppealsPanel: React.FC<TeacherAppealsPanelProps> = ({ appeals, questions, onChanged, onOpenSubmission }) => {
  const [questionFilter, setQuestionFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'OPEN' | 'RESOLVED'>('OPEN');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const questionName = (questionId: string) => {
    const idx = questions.findIndex((q) => q.id === questionId);
    return idx >= 0 ? questions[idx].name || `Câu ${idx + 1}` : 'Câu hỏi đã xóa';
  };

  const visible = appeals.filter(
    (a) =>
      (questionFilter === 'all' || a.submission?.questionId === questionFilter) &&
      (statusFilter === 'all' || a.status === statusFilter),
  );
  const openCount = appeals.filter((a) => a.status === 'OPEN').length;

  const save = async (appeal: any, status: 'OPEN' | 'RESOLVED') => {
    const reply = drafts[appeal.id] ?? appeal.teacherReply ?? '';
    if (status === 'RESOLVED' && !reply.trim()) {
      alert('Vui lòng nhập câu trả lời cho học sinh trước khi đánh dấu đã giải quyết.');
      return;
    }
    setSavingId(appeal.id);
    try {
      await axios.put(`/appeals/${appeal.id}`, { teacherReply: reply, status });
      setDrafts((d) => {
        const next = { ...d };
        delete next[appeal.id];
        return next;
      });
      onChanged();
    } catch (err: any) {
      alert('Không thể cập nhật phản ánh: ' + (err.response?.data?.message || err.message));
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
        <h3>Giải đáp thắc mắc của học sinh ({openCount} chưa giải quyết)</h3>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <select className="form-input" style={{ width: 'auto' }} value={questionFilter} onChange={(e) => setQuestionFilter(e.target.value)}>
            <option value="all">Tất cả câu hỏi</option>
            {questions.map((q, idx) => (
              <option key={q.id} value={q.id}>{q.name || `Câu ${idx + 1}`}</option>
            ))}
          </select>
          <select className="form-input" style={{ width: 'auto' }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)}>
            <option value="OPEN">Chưa giải quyết</option>
            <option value="RESOLVED">Đã giải quyết</option>
            <option value="all">Tất cả</option>
          </select>
        </div>
      </div>

      {visible.length === 0 ? (
        <div style={{ padding: '24px', border: '1px dashed var(--border-color)', borderRadius: '8px', textAlign: 'center', color: 'var(--text-muted)' }}>
          Không có phản ánh nào.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {visible.map((a) => {
            const resolved = a.status === 'RESOLVED';
            const reply = drafts[a.id] ?? a.teacherReply ?? '';
            return (
              <div key={a.id} className="panel-card" style={{ borderLeft: `4px solid ${resolved ? 'var(--success-color)' : '#f59e0b'}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', marginBottom: '10px' }}>
                  <div>
                    <strong>{a.student?.name}</strong>
                    <span style={{ color: 'var(--text-muted)', fontFamily: 'monospace', marginLeft: '8px' }}>{getMssv(a.student?.email)}</span>
                    <span style={{ color: 'var(--text-muted)', marginLeft: '8px' }}>· {questionName(a.submission?.questionId)}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{new Date(a.createdAt).toLocaleString('vi-VN')}</span>
                    <span className={`badge ${resolved ? 'badge-success' : 'badge-warning'}`}>{resolved ? 'Đã giải quyết' : 'Chưa giải quyết'}</span>
                  </div>
                </div>

                <div style={{ fontSize: '13px', marginBottom: '8px' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Ý chấm bị phản ánh: </span>
                  {a.rubricStep ? (
                    <MathRenderer math={`Ý ${a.rubricStep.stepIndex}: ${a.rubricStep.latexContent}`} />
                  ) : a.stepLabel ? (
                    <MathRenderer math={`${a.stepLabel} (ý này đã bị xóa khỏi barem)`} />
                  ) : (
                    <em>Cả câu hỏi</em>
                  )}
                </div>
                <div style={{ whiteSpace: 'pre-wrap', padding: '10px 12px', borderRadius: '6px', backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-color)', marginBottom: '12px' }}>
                  {a.content}
                </div>

                <textarea
                  className="form-input"
                  rows={3}
                  placeholder="Trả lời học sinh..."
                  value={reply}
                  onChange={(e) => setDrafts((d) => ({ ...d, [a.id]: e.target.value }))}
                  style={{ width: '100%', resize: 'vertical' }}
                />
                <div style={{ display: 'flex', gap: '8px', marginTop: '10px', flexWrap: 'wrap' }}>
                  <button className="btn btn-primary" disabled={savingId === a.id} onClick={() => save(a, 'RESOLVED')}>
                    {resolved ? 'Cập nhật câu trả lời' : 'Trả lời & đánh dấu đã giải quyết'}
                  </button>
                  {resolved && (
                    <button className="btn btn-secondary" disabled={savingId === a.id} onClick={() => save(a, 'OPEN')}>
                      Mở lại
                    </button>
                  )}
                  <button className="btn btn-secondary" onClick={() => onOpenSubmission(a.submission?.questionId, a.submission?.id)}>
                    Xem bài & chấm lại
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
