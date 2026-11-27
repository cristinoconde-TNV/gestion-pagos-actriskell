import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Loader2 } from 'lucide-react';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  processingLabel?: string;
  tone?: 'danger' | 'warning' | 'emerald';
  isProcessing?: boolean;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancelar',
  processingLabel,
  tone = 'danger',
  isProcessing = false,
  onCancel,
  onConfirm
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isProcessing) {
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isProcessing, onCancel]);

  if (!isOpen || typeof document === 'undefined') return null;

  const iconToneClass =
    tone === 'emerald'
      ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
      : tone === 'warning'
      ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
      : 'bg-rose-500/15 text-rose-600 dark:text-rose-400';

  const confirmButtonClass =
    tone === 'emerald'
      ? 'bg-emerald-600 hover:bg-emerald-700'
      : tone === 'warning'
      ? 'bg-amber-600 hover:bg-amber-700'
      : 'bg-rose-600 hover:bg-rose-700';

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={() => {
        if (!isProcessing) onCancel();
      }}
      className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-xs"
    >
      <div
        onClick={e => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-2xl space-y-4"
      >
        <div className="flex items-start gap-3">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${iconToneClass}`}
          >
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              {title}
            </h3>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-300 leading-relaxed break-words">
              {description}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            disabled={isProcessing}
            onClick={onCancel}
            className="min-h-[44px] md:min-h-0 rounded-xl border border-slate-300 dark:border-slate-700 px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={isProcessing}
            onClick={onConfirm}
            className={`min-h-[44px] md:min-h-0 inline-flex items-center justify-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold text-white transition disabled:opacity-60 ${confirmButtonClass}`}
          >
            {isProcessing && <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />}
            <span>{isProcessing && processingLabel ? processingLabel : confirmLabel}</span>
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
