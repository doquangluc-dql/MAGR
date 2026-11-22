import React, { useState } from 'react';
import { Eye, EyeOff, Layers, FileText, CheckCircle2, Loader2, AlertCircle, ExternalLink, Code } from 'lucide-react';
import { MathRenderer } from './MathRenderer';

export interface BboxItem {
  bbox: [number, number, number, number]; // [xmin, ymin, xmax, ymax] on scale 0-999
  type?: 'equation' | 'text' | string;
  context?: string;
  [key: string]: any;
}

// Vùng của bài chép (Gemini) — xem ai-worker/transcriber.py
export interface TranscriptRegion {
  box_id: string;
  bbox: [number, number, number, number];
  type?: string;
  latex: string;
  unclear?: boolean;
}

interface ImageViewerWithBboxProps {
  imageUrl: string;
  bboxes?: BboxItem[] | null;
  // Có bài chép thì vẽ theo vùng B1, B2... thay cho box OCR thô
  regions?: TranscriptRegion[] | null;
  // Hover hai chiều với TranscriptPanel (tùy chọn)
  hoveredBoxId?: string | null;
  onHoverBox?: (boxId: string | null) => void;
  ocrStatus?: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | string;
  ocrContent?: string | null;
  altText?: string;
}

export const ImageViewerWithBbox: React.FC<ImageViewerWithBboxProps> = ({
  imageUrl,
  bboxes = [],
  regions,
  hoveredBoxId,
  onHoverBox,
  ocrStatus,
  ocrContent,
  altText = 'Bài làm học sinh'
}) => {
  const [showBoxes, setShowBoxes] = useState<boolean>(true);
  const [showLatexDrawer, setShowLatexDrawer] = useState<boolean>(false);
  const [localHovered, setLocalHovered] = useState<string | null>(null);
  const hovered = onHoverBox ? hoveredBoxId ?? null : localHovered;
  const setHovered = (key: string | null) => (onHoverBox ? onHoverBox(key) : setLocalHovered(key));

  const hasRegions = Array.isArray(regions) && regions.length > 0;
  const validBboxes = Array.isArray(bboxes) ? bboxes : [];
  // Danh sách khung cần vẽ: ưu tiên vùng bài chép, không có thì dùng box OCR thô
  const items = hasRegions
    ? regions!.map((r) => ({ key: r.box_id, label: r.box_id, bbox: r.bbox, context: r.latex, type: r.type, unclear: !!r.unclear }))
    : validBboxes.map((b, idx) => {
        const isEq = b.type === 'equation' || (b.context && b.context.includes('$'));
        return { key: String(idx), label: `#${idx + 1} ${isEq ? 'Eq' : 'Txt'}`, bbox: b.bbox, context: b.context, type: b.type, unclear: false };
      });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', gap: '10px' }}>
      {/* Control Bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '8px',
        padding: '8px 12px',
        backgroundColor: 'var(--bg-secondary, #1e293b)',
        borderRadius: '8px',
        border: '1px solid var(--border-color, #334155)',
        fontSize: '13px'
      }}>
        {/* Status Indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {ocrStatus === 'PROCESSING' && (
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#38bdf8' }}>
              <Loader2 size={16} className="animate-spin" style={{ animation: 'spin 1s linear infinite' }} />
              <span>Đang OCR (Modal GPU)...</span>
            </span>
          )}
          {ocrStatus === 'COMPLETED' && (
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#34d399' }}>
              <CheckCircle2 size={16} />
              <span>{hasRegions ? `Đã chép bài (${regions!.length} vùng)` : `Đã OCR (${validBboxes.length} vùng)`}</span>
            </span>
          )}
          {ocrStatus === 'FAILED' && (
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#f87171' }}>
              <AlertCircle size={16} />
              <span>OCR lỗi</span>
            </span>
          )}
          {(!ocrStatus || ocrStatus === 'PENDING') && (
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted, #94a3b8)' }}>
              <Layers size={16} />
              <span>Chờ xử lý OCR</span>
            </span>
          )}
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {items.length > 0 && (
            <button
              type="button"
              onClick={() => setShowBoxes(!showBoxes)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '4px 10px',
                fontSize: '12px',
                fontWeight: 500,
                borderRadius: '6px',
                cursor: 'pointer',
                border: '1px solid var(--border-color, #475569)',
                backgroundColor: showBoxes ? 'rgba(56, 189, 248, 0.15)' : 'transparent',
                color: showBoxes ? '#38bdf8' : 'var(--text-secondary, #94a3b8)',
                transition: 'all 0.2s'
              }}
              title="Bật/Tắt hiển thị các khung nhận diện"
            >
              {showBoxes ? <Eye size={14} /> : <EyeOff size={14} />}
              {showBoxes ? 'Ẩn BBox' : 'Hiện BBox'}
            </button>
          )}

          {ocrContent && !hasRegions && (
            <button
              type="button"
              onClick={() => setShowLatexDrawer(!showLatexDrawer)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '4px 10px',
                fontSize: '12px',
                fontWeight: 500,
                borderRadius: '6px',
                cursor: 'pointer',
                border: '1px solid var(--border-color, #475569)',
                backgroundColor: showLatexDrawer ? 'rgba(168, 85, 247, 0.15)' : 'transparent',
                color: showLatexDrawer ? '#c084fc' : 'var(--text-secondary, #94a3b8)',
                transition: 'all 0.2s'
              }}
              title="Xem văn bản / công thức LaTeX trích xuất từ ảnh"
            >
              <FileText size={14} />
              {showLatexDrawer ? 'Đóng LaTeX' : 'Xem LaTeX OCR'}
            </button>
          )}

          <a
            href={imageUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '4px 8px',
              fontSize: '12px',
              borderRadius: '6px',
              color: 'var(--text-secondary, #94a3b8)',
              textDecoration: 'none',
              border: '1px solid transparent'
            }}
            title="Mở ảnh gốc trong tab mới"
          >
            <ExternalLink size={14} />
          </a>
        </div>
      </div>

      {/* Optional LaTeX Drawer */}
      {showLatexDrawer && ocrContent && !hasRegions && (
        <div style={{
          backgroundColor: '#0f172a',
          border: '1px solid #334155',
          borderRadius: '8px',
          padding: '14px',
          fontSize: '13px',
          maxHeight: '220px',
          overflowY: 'auto'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#c084fc', marginBottom: '8px', fontWeight: 600 }}>
            <Code size={16} />
            <span>Nội dung nhận diện (LaTeX/Text):</span>
          </div>
          <div style={{
            backgroundColor: '#020617',
            padding: '10px',
            borderRadius: '6px',
            fontFamily: 'monospace',
            whiteSpace: 'pre-wrap',
            color: '#e2e8f0',
            lineHeight: 1.6
          }}>
            <MathRenderer math={ocrContent} />
          </div>
        </div>
      )}

      {/* Main Image Container with Relative Positioning for BBoxes */}
      <div style={{
        position: 'relative',
        width: '100%',
        backgroundColor: '#090d16',
        borderRadius: '8px',
        overflow: 'hidden',
        border: '1px solid var(--border-color, #334155)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center'
      }}>
        <div style={{ position: 'relative', display: 'inline-block', maxWidth: '100%' }}>
          <img
            src={imageUrl}
            alt={altText}
            style={{
              display: 'block',
              maxWidth: '100%',
              maxHeight: '75vh',
              objectFit: 'contain'
            }}
          />

          {/* Render Bounding Boxes */}
          {showBoxes && items.map((item) => {
            const bbox = item.bbox;
            if (!Array.isArray(bbox) || bbox.length !== 4) return null;

            const [xmin, ymin, xmax, ymax] = bbox;
            // Coordinates normalized on 0-999 scale
            const left = `${(Math.max(0, xmin) / 999.0) * 100}%`;
            const top = `${(Math.max(0, ymin) / 999.0) * 100}%`;
            const width = `${(Math.max(0, xmax - xmin) / 999.0) * 100}%`;
            const height = `${(Math.max(0, ymax - ymin) / 999.0) * 100}%`;

            const isHovered = hovered === item.key;
            // Vùng chép bài: xanh lá; vùng có chỗ không đọc được ([?] hoặc rỗng): vàng
            // Box OCR thô: xanh dương cho công thức, xanh lá cho chữ
            const isEquation = !hasRegions && (item.type === 'equation' || (item.context && item.context.includes('$')));
            const base = item.unclear ? '#d97706' : isEquation ? '#0284c7' : '#059669';
            const tint = item.unclear ? '217, 119, 6' : isEquation ? '56, 189, 248' : '52, 211, 153';

            return (
              <div
                key={item.key}
                onMouseEnter={() => setHovered(item.key)}
                onMouseLeave={() => setHovered(null)}
                style={{
                  position: 'absolute',
                  left,
                  top,
                  width,
                  height,
                  border: `${isHovered ? 3 : 2}px solid ${isHovered ? base : `rgba(${tint}, 0.85)`}`,
                  backgroundColor: isHovered ? `rgba(${tint}, 0.22)` : `rgba(${tint}, 0.04)`,
                  borderRadius: '3px',
                  boxSizing: 'border-box',
                  cursor: 'pointer',
                  zIndex: isHovered ? 20 : 10,
                  transition: 'background-color 0.15s, border-color 0.15s'
                }}
              >
                {/* Nhãn vùng */}
                <span
                  style={{
                    position: 'absolute',
                    top: '-18px',
                    left: '-2px',
                    fontSize: '10px',
                    fontWeight: 700,
                    padding: '1px 5px',
                    borderRadius: '3px',
                    backgroundColor: base,
                    color: '#ffffff',
                    whiteSpace: 'nowrap',
                    pointerEvents: 'none',
                    lineHeight: '13px',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.5)'
                  }}
                >
                  {item.label}{item.unclear ? ' ?' : ''}
                </span>

                {/* Hover Tooltip with LaTeX / Context preview */}
                {isHovered && item.context && (
                  <div
                    style={{
                      position: 'absolute',
                      bottom: 'calc(100% + 22px)',
                      left: '50%',
                      transform: 'translateX(-50%)',
                      minWidth: '160px',
                      maxWidth: '320px',
                      padding: '8px 12px',
                      backgroundColor: 'rgba(15, 23, 42, 0.95)',
                      backdropFilter: 'blur(8px)',
                      border: '1px solid #475569',
                      borderRadius: '6px',
                      color: '#f8fafc',
                      fontSize: '12px',
                      boxShadow: '0 10px 25px -5px rgba(0,0,0,0.5)',
                      pointerEvents: 'none',
                      zIndex: 30,
                      textAlign: 'left'
                    }}
                  >
                    <div style={{ color: '#94a3b8', fontSize: '10px', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      Vùng {item.label}:
                    </div>
                    <div style={{ color: '#38bdf8', fontWeight: 500 }}>
                      <MathRenderer math={item.context} />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
