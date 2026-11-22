import React, { useState } from 'react';
import { Loader2, AlertCircle, RefreshCw, Code, FileText } from 'lucide-react';
import { MathRenderer } from './MathRenderer';
import type { TranscriptRegion } from './ImageViewerWithBbox';

interface TranscriptPanelProps {
  submission: any;
  readOnly?: boolean;
  hoveredBoxId?: string | null;
  onHoverBox?: (boxId: string | null) => void;
  // Giáo viên: chép lại bằng Gemini (bỏ qua bài chép đã lưu)
  onRetranscribe?: () => Promise<void> | void;
}

// Bài chép chỉ hợp lệ khi thuộc đúng ảnh đang nộp (học sinh nộp lại ảnh mới thì phải chép lại)
export const getValidTranscript = (submission: any) => {
  const t = submission?.transcript;
  return submission?.transcriptStatus === 'COMPLETED' && t?.regions && t.image_url === submission.imageUrl ? t : null;
};

const modelLabel = (model?: string) =>
  (model || '').replace(/^google\//, '').replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export const TranscriptPanel: React.FC<TranscriptPanelProps> = ({
  submission,
  readOnly = false,
  hoveredBoxId,
  onHoverBox,
  onRetranscribe,
}) => {
  const [showRaw, setShowRaw] = useState(false);
  const [busy, setBusy] = useState(false);

  const transcript = getValidTranscript(submission);
  const status: string = submission?.transcriptStatus || 'PENDING';
  const regions: TranscriptRegion[] = transcript?.regions || [];
  const unclearCount = regions.filter((r) => r.unclear).length;

  const retranscribe = async () => {
    if (!onRetranscribe) return;
    setBusy(true);
    try {
      await onRetranscribe();
    } finally {
      setBusy(false);
    }
  };

  const actionButton = (label: string) =>
    !readOnly && onRetranscribe ? (
      <button
        type="button"
        className="btn btn-secondary"
        style={{ padding: '4px 10px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
        disabled={busy || status === 'PROCESSING'}
        onClick={retranscribe}
      >
        <RefreshCw size={13} /> {label}
      </button>
    ) : null;

  const box: React.CSSProperties = {
    border: '1px solid var(--border-color, #334155)',
    borderRadius: '8px',
    padding: '14px',
    marginTop: '12px',
  };

  // Đang chép
  if (status === 'PROCESSING') {
    return (
      <div style={{ ...box, display: 'flex', alignItems: 'center', gap: '8px', color: '#38bdf8', fontSize: '14px' }}>
        <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Đang chép bài bằng Gemini…
      </div>
    );
  }

  // Lỗi (chỉ tính lỗi của ảnh hiện tại)
  if (status === 'FAILED' && submission?.transcript?.image_url === submission?.imageUrl) {
    return (
      <div style={{ ...box, borderColor: '#ef4444' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#ef4444', fontWeight: 600, marginBottom: '6px' }}>
          <AlertCircle size={16} /> Chép bài thất bại
        </div>
        <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '10px' }}>
          {submission?.transcript?.error_message || 'Lỗi không xác định'}
        </div>
        {actionButton('Thử lại')}
      </div>
    );
  }

  // Chưa có bài chép cho ảnh hiện tại
  if (!transcript) {
    if (readOnly) return null;
    return (
      <div style={{ ...box, fontSize: '13px', color: 'var(--text-muted)' }}>
        <div style={{ marginBottom: '10px' }}>
          Chưa chép bài. Bài sẽ được chép tự động bằng Gemini khi bấm chấm, hoặc bạn có thể chép ngay để xem trước.
        </div>
        {actionButton('Chép bài ngay')}
      </div>
    );
  }

  return (
    <div style={box}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
        <div>
          <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
            <FileText size={16} /> Bài làm của học sinh ({regions.length} vùng)
          </div>
          {!readOnly && (
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
              {modelLabel(transcript.model)}
              {transcript.createdAt && ` · ${new Date(transcript.createdAt).toLocaleString('vi-VN')}`}
              {typeof transcript.usage?.cost === 'number' && ` · $${transcript.usage.cost.toFixed(4)}`}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ padding: '4px 10px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
            onClick={() => setShowRaw(!showRaw)}
            title="Bật/tắt xem mã LaTeX thô"
          >
            <Code size={13} /> {showRaw ? 'Xem công thức' : 'Xem LaTeX'}
          </button>
          {actionButton('Chép lại')}
        </div>
      </div>

      {unclearCount > 0 && (
        <div style={{ fontSize: '12px', color: '#d97706', marginBottom: '10px' }}>
          ⚠ {unclearCount} vùng có chỗ không đọc được (đánh dấu [?]) hoặc trống — nên đối chiếu với ảnh.
        </div>
      )}

      {/* Danh sách vùng theo thứ tự đọc; hover hai chiều với khung trên ảnh */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {regions.map((r) => {
          const active = hoveredBoxId === r.box_id;
          const color = r.unclear ? '#d97706' : '#059669';
          return (
            <div
              key={r.box_id}
              onMouseEnter={() => onHoverBox?.(r.box_id)}
              onMouseLeave={() => onHoverBox?.(null)}
              style={{
                display: 'flex',
                gap: '10px',
                alignItems: 'flex-start',
                padding: '8px 10px',
                borderRadius: '6px',
                border: `1px solid ${active ? color : 'transparent'}`,
                backgroundColor: active ? 'rgba(52, 211, 153, 0.08)' : 'rgba(255,255,255,0.02)',
                transition: 'background-color 0.15s, border-color 0.15s',
              }}
            >
              <span
                style={{
                  flexShrink: 0,
                  fontSize: '11px',
                  fontWeight: 700,
                  color: '#fff',
                  backgroundColor: color,
                  borderRadius: '3px',
                  padding: '1px 6px',
                  marginTop: '2px',
                }}
              >
                {r.box_id}
              </span>
              <div style={{ flex: 1, minWidth: 0, fontSize: '14px', lineHeight: 1.6 }}>
                {!r.latex ? (
                  <em style={{ color: 'var(--text-muted)' }}>(trống)</em>
                ) : showRaw ? (
                  <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: '12px' }}>{r.latex}</pre>
                ) : (
                  <MathRenderer math={r.latex} />
                )}
              </div>
            </div>
          );
        })}
      </div>

      {transcript.unboxed && (
        <div style={{ marginTop: '12px', padding: '8px 10px', borderRadius: '6px', border: '1px dashed #d97706' }}>
          <div style={{ fontSize: '12px', color: '#d97706', marginBottom: '4px' }}>Nội dung ngoài các vùng đã khoanh:</div>
          <div style={{ fontSize: '14px' }}>
            {showRaw ? <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: '12px' }}>{transcript.unboxed}</pre> : <MathRenderer math={transcript.unboxed} />}
          </div>
        </div>
      )}
    </div>
  );
};
