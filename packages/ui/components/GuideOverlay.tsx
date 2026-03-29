import React from 'react';

interface GuideOverlayProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

export function GuideOverlay({ title, onClose, children }: GuideOverlayProps) {
  return (
    <div className="guide-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="guide-panel">
        <div className="guide-header">
          <h2>{title}</h2>
          <button className="btn-icon" onClick={onClose}>X</button>
        </div>
        <div className="guide-body">
          {children}
        </div>
      </div>
    </div>
  );
}
