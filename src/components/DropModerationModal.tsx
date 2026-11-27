import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Loader2, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { createTranslator } from '../lib/i18n';

export interface DropModerationTarget {
  studentId: string;
  studentName: string;
  activityId: string;
  activityName: string;
  dropRequestedAt?: string;
  dropReason?: string;
}

interface DropModerationModalProps {
  target: DropModerationTarget | null;
  isProcessing?: boolean;
  onClose: () => void;
  onReject: (target: DropModerationTarget, notes?: string) => void | Promise<void>;
  onApprove: (
    target: DropModerationTarget,
    checklist: {
      debtsChecked: boolean;
      materialsChecked: boolean;
      notes?: string;
    }
  ) => void | Promise<void>;
}

export const DropModerationModal: React.FC<DropModerationModalProps> = ({
  target,
  isProcessing = false,
  onClose,
  onReject,
  onApprove
}) => {
  const { payments, language } = useApp();
  const t = createTranslator(language);

  const [debtsChecked, setDebtsChecked] = useState(false);
  const [materialsChecked, setMaterialsChecked] = useState(false);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    setDebtsChecked(false);
    setMaterialsChecked(false);
    setNotes('');
  }, [target?.studentId, target?.activityId]);

  useEffect(() => {
    if (!target) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isProcessing) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [target, isProcessing, onClose]);

  if (!target || typeof document === 'undefined') return null;

  const unpaidPayments = payments.filter(
    p =>
      p.studentId === target.studentId &&
      p.activityId === target.activityId &&
      (p.status === 'pending' || p.status === 'overdue' || p.status === 'partial')
  );
  const unpaidTotal = unpaidPayments.reduce((sum, p) => sum + p.amount, 0);
  const canApprove = debtsChecked && materialsChecked && !isProcessing;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('teacherPortal.dropModerationModal.title')}
      onClick={() => {
        if (!isProcessing) onClose();
      }}
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-xs"
    >
      <div
        onClick={e => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 shrink-0">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                {t('teacherPortal.dropModerationModal.title')}
              </h4>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                {t('teacherPortal.dropModerationModal.subtitle')}
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={isProcessing}
            onClick={onClose}
            aria-label={t('teacherPortal.dropModerationModal.cancel')}
            className="inline-flex h-11 w-11 md:h-8 md:w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200 transition shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 p-3 text-xs space-y-1">
          <div className="flex justify-between gap-2">
            <span className="text-slate-500">{t('teacherPortal.dropModerationModal.studentLabel')}</span>
            <strong className="text-slate-900 dark:text-white text-right break-words">{target.studentName}</strong>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-slate-500">{t('teacherPortal.dropModerationModal.workshopLabel')}</span>
            <strong className="text-slate-900 dark:text-white text-right break-words">{target.activityName}</strong>
          </div>
          {target.dropRequestedAt && (
            <p className="text-[11px] text-slate-400">
              {t('teacherPortal.dropModerationModal.requestedAtLabel', {
                date: target.dropRequestedAt.split('T')[0]
              })}
            </p>
          )}
          {target.dropReason && (
            <div className="pt-1 border-t border-slate-200/70 dark:border-slate-700/60">
              <span className="block text-[10px] font-bold uppercase text-slate-400">
                {t('teacherPortal.dropModerationModal.reasonLabel')}
              </span>
              <p className="italic text-slate-700 dark:text-slate-200 break-words">
                "{target.dropReason}"
              </p>
            </div>
          )}
        </div>

        <div
          className={`rounded-xl border p-3 text-xs space-y-1.5 ${
            unpaidPayments.length > 0
              ? 'border-amber-500/35 bg-amber-50/70 dark:bg-amber-950/20 text-amber-900 dark:text-amber-200'
              : 'border-emerald-500/30 bg-emerald-50/70 dark:bg-emerald-950/20 text-emerald-800 dark:text-emerald-200'
          }`}
        >
          <span className="block text-[10px] font-bold uppercase tracking-wider opacity-80">
            {t('teacherPortal.dropModerationModal.debtsSectionTitle')}
          </span>
          <p className="font-bold">
            {unpaidPayments.length > 0
              ? t('teacherPortal.dropModerationModal.debtsAlert', {
                  count: unpaidPayments.length,
                  amount: unpaidTotal.toFixed(2)
                })
              : t('teacherPortal.dropModerationModal.debtsClear')}
          </p>
          {unpaidPayments.length > 0 && (
            <ul className="space-y-0.5 text-[11px] font-mono">
              {unpaidPayments.map(p => (
                <li key={p.id}>
                  {t('teacherPortal.dropModerationModal.debtLine', {
                    period: p.periodMonth,
                    receipt: p.receiptNumber,
                    amount: p.amount.toFixed(2),
                    status: p.status
                  })}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-2.5">
          <label className="flex items-start gap-2.5 min-h-[44px] md:min-h-0 py-1 md:py-0 text-xs text-slate-700 dark:text-slate-200 cursor-pointer">
            <input
              type="checkbox"
              checked={debtsChecked}
              onChange={e => setDebtsChecked(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 shrink-0"
            />
            <span>{t('teacherPortal.dropModerationModal.checkDebts')}</span>
          </label>

          <label className="flex items-start gap-2.5 min-h-[44px] md:min-h-0 py-1 md:py-0 text-xs text-slate-700 dark:text-slate-200 cursor-pointer">
            <input
              type="checkbox"
              checked={materialsChecked}
              onChange={e => setMaterialsChecked(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 shrink-0"
            />
            <span>{t('teacherPortal.dropModerationModal.checkMaterials')}</span>
          </label>
        </div>

        <div className="space-y-1">
          <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300">
            {t('teacherPortal.dropModerationModal.notesLabel')}
          </label>
          <input
            type="text"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder={t('teacherPortal.dropModerationModal.notesPlaceholder')}
            className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-indigo-500"
          />
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
          <button
            type="button"
            disabled={isProcessing}
            onClick={onClose}
            className="min-h-[44px] md:min-h-0 rounded-xl border border-slate-300 dark:border-slate-700 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            {t('teacherPortal.dropModerationModal.cancel')}
          </button>
          <button
            type="button"
            disabled={isProcessing}
            onClick={() => onReject(target, notes.trim() || undefined)}
            className="min-h-[44px] md:min-h-0 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 px-3 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition disabled:opacity-50"
          >
            {t('teacherPortal.dropModerationModal.rejectButton')}
          </button>
          <button
            type="button"
            disabled={!canApprove}
            onClick={() =>
              onApprove(target, {
                debtsChecked,
                materialsChecked,
                notes: notes.trim() || undefined
              })
            }
            className="min-h-[44px] md:min-h-0 inline-flex items-center justify-center gap-1.5 rounded-xl bg-rose-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-rose-700 transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isProcessing && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            <span>
              {isProcessing
                ? t('teacherPortal.dropModerationModal.processing')
                : t('teacherPortal.dropModerationModal.approveButton')}
            </span>
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
