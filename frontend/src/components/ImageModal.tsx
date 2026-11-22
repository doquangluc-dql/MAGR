import React, { useEffect } from 'react';

interface ImageModalProps {
  imageUrl: string;
  title?: string;
  onClose: () => void;
}

// Xem nhanh ảnh bài nộp; đóng bằng nút ×, phím Esc hoặc bấm ra ngoài ảnh
export const ImageModal: React.FC<ImageModalProps> = ({ imageUrl, title, onClose }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000, backgroundColor: 'rgba(0,0,0,0.75)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: 'var(--bg-secondary, #1e293b)', borderRadius: '10px', padding: '12px',
          maxWidth: 'min(1000px, 100%)', maxHeight: '100%', display: 'flex', flexDirection: 'column', gap: '8px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
          <strong style={{ fontSize: '14px' }}>{title}</strong>
          <div style={{ display: 'flex', gap: '8px' }}>
            <a href={imageUrl} target="_blank" rel="noreferrer" className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '12px' }}>
              Mở tab mới
            </a>
            <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '12px' }} onClick={onClose}>
              Đóng ✕
            </button>
          </div>
        </div>
        <img src={imageUrl} alt={title || 'Bài nộp'} style={{ maxWidth: '100%', maxHeight: 'calc(100vh - 120px)', objectFit: 'contain', borderRadius: '6px' }} />
      </div>
    </div>
  );
};
