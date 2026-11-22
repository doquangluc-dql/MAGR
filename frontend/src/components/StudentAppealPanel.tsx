import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { MathRenderer } from './MathRenderer';

interface StudentAppealPanelProps {
  examId: string;
  // selectedExam.questions (phía học sinh: submissions[0] là bài của chính học sinh)
  questions: any[];
  defaultQuestionId?: string;
}

// Học sinh phản ánh kết quả chấm: chọn câu hỏi, chọn ý chấm, mô tả vấn đề
export const StudentAppealPanel: React.FC<StudentAppealPanelProps> = ({ examId, questions, defaultQuestionId }) => {
  const [myAppeals, setMyAppeals] = useState<any[]>([]);
  const [questionId, setQuestionId] = useState('');
  const [stepId, setStepId] = useState('');
  const [content, setContent] = useState('');
  const [sending, setSending] = useState(false);

  // Chỉ được phản ánh những câu đã công bố điểm
  const publishedQuestions = useMemo(
    () => questions.filter((q) => q.submissions?.[0]?.isPublished && q.submissions[0].evaluation),
    [questions],
  );
  const questionLabel = (q: any) => q.name || `Câu ${questions.findIndex((x) => x.id === q.id) + 1}`;
  const selectedQuestion = publishedQuestions.find((q) => q.id === questionId);

  const loadMine = async () => {
    try {
      const res = await axios.get('/appeals/mine', { params: { examId } });
      setMyAppeals(res.data);
    } catch (err) {
      console.error('Không tải được danh sách phản ánh', err);
    }
  };

  useEffect(() => {
    loadMine();
  }, [examId]);

  // Mặc định chọn câu đang xem (nếu đã công bố), không thì câu đầu tiên đã công bố
  useEffect(() => {
    const preferred = publishedQuestions.find((q) => q.id === defaultQuestionId) || publishedQuestions[0];
    setQuestionId(preferred?.id || '');
    setStepId('');
  }, [defaultQuestionId, publishedQuestions]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedQuestion || !content.trim()) return;
    setSending(true);
    try {
      await axios.post('/appeals', {
        submissionId: selectedQuestion.submissions[0].id,
        rubricStepId: stepId || undefined,
        content,
      });
      setContent('');
      setStepId('');
      await loadMine();
      alert('Đã gửi phản ánh tới giáo viên.');
    } catch (err: any) {
      alert('Không thể gửi phản ánh: ' + (err.response?.data?.message || err.message));
    } finally {
      setSending(false);
    }
  };

  const questionNameById = (id: string) => {
    const q = questions.find((x) => x.id === id);
    return q ? questionLabel(q) : 'Câu hỏi';
  };

  return (
    <div className="panel-card" style={{ marginTop: '24px', borderLeft: '4px solid #f59e0b' }}>
      <h3 style={{ marginBottom: '6px' }}>Phản ánh kết quả chấm</h3>
      <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>
        Nếu bạn cho rằng một ý chấm chưa chính xác, hãy chọn câu hỏi, ý chấm và mô tả lại để giáo viên kiểm tra.
      </p>

      {publishedQuestions.length === 0 ? (
        <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Chưa có câu hỏi nào được công bố điểm.</div>
      ) : (
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <div className="form-group" style={{ flex: '1 1 200px', margin: 0 }}>
              <label className="form-label">Câu hỏi</label>
              <select className="form-input" value={questionId} onChange={(e) => { setQuestionId(e.target.value); setStepId(''); }}>
                {publishedQuestions.map((q) => (
                  <option key={q.id} value={q.id}>{questionLabel(q)}</option>
                ))}
              </select>
            </div>
            <div className="form-group" style={{ flex: '2 1 280px', margin: 0 }}>
              <label className="form-label">Ý chấm cần phản ánh</label>
              <select className="form-input" value={stepId} onChange={(e) => setStepId(e.target.value)}>
                <option value="">Cả câu hỏi</option>
                {[...(selectedQuestion?.rubricSteps || [])]
                  .sort((a: any, b: any) => a.stepIndex - b.stepIndex)
                  .map((s: any) => {
                    const ev = selectedQuestion?.submissions?.[0]?.evaluation?.stepEvaluations?.find((x: any) => x.rubricStepId === s.id);
                    const verdict = ev ? (ev.isMarkedIncorrect ? ' — bị chấm sai' : ' — được chấm đúng') : '';
                    return (
                      <option key={s.id} value={s.id}>
                        Ý {s.stepIndex} ({s.maxScore}đ): {s.latexContent.slice(0, 60)}{s.latexContent.length > 60 ? '…' : ''}{verdict}
                      </option>
                    );
                  })}
              </select>
            </div>
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Mô tả vấn đề</label>
            <textarea
              className="form-input"
              rows={4}
              maxLength={2000}
              placeholder="Ví dụ: Ở ý 2 em đã biến đổi đúng, chỉ khác cách trình bày so với barem..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
              required
              style={{ width: '100%', resize: 'vertical' }}
            />
          </div>
          <div>
            <button type="submit" className="btn btn-primary" disabled={sending || !content.trim()}>
              {sending ? 'Đang gửi...' : 'Gửi phản ánh'}
            </button>
          </div>
        </form>
      )}

      {myAppeals.length > 0 && (
        <div style={{ marginTop: '24px' }}>
          <h4 style={{ marginBottom: '10px' }}>Phản ánh đã gửi</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {myAppeals.map((a) => {
              const resolved = a.status === 'RESOLVED';
              return (
                <div key={a.id} style={{ padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', fontSize: '13px', marginBottom: '6px' }}>
                    <span>
                      <strong>{questionNameById(a.submission?.questionId)}</strong>
                      <span style={{ color: 'var(--text-muted)' }}> · {a.rubricStep ? `Ý ${a.rubricStep.stepIndex}` : a.stepLabel ? a.stepLabel.split(':')[0] : 'Cả câu hỏi'}</span>
                      <span style={{ color: 'var(--text-muted)' }}> · {new Date(a.createdAt).toLocaleString('vi-VN')}</span>
                    </span>
                    <span className={`badge ${resolved ? 'badge-success' : 'badge-warning'}`}>{resolved ? 'Đã giải quyết' : 'Đang chờ giáo viên'}</span>
                  </div>
                  <div style={{ whiteSpace: 'pre-wrap', fontSize: '14px' }}>{a.content}</div>
                  {a.teacherReply && (
                    <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid var(--border-color)', color: 'var(--primary-color)', fontSize: '14px' }}>
                      <strong>Giáo viên trả lời:</strong> <MathRenderer math={a.teacherReply} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
