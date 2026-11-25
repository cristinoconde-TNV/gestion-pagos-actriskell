import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Clock, Copy, Smartphone, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { createTranslator } from '../lib/i18n';
import { Activity } from '../types';

interface ActivityDetailModalProps {
  activity: Activity | null;
  onClose: () => void;
}

export const ActivityDetailModal: React.FC<ActivityDetailModalProps> = ({
  activity,
  onClose
}) => {
  const { teachers, language } = useApp();
  const t = createTranslator(language);
  const [copiedBizum, setCopiedBizum] = useState(false);

  useEffect(() => {
    setCopiedBizum(false);
  }, [activity?.id]);

  useEffect(() => {
    if (!activity) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activity, onClose]);

  if (!activity || typeof document === 'undefined') return null;

  const teacherItem = teachers.find(tch => tch.id === activity.teacherId);

  const handleCopyBizum = (phone: string) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(phone).catch(() => {});
    }
    setCopiedBizum(true);
    setTimeout(() => setCopiedBizum(false), 2000);
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={activity.name}
      onClick={onClose}
      className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs"
    >
      <div
        onClick={e => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-5 space-y-4 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                {t('studentPortal.modal.cardBadge')}
              </span>
              <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                {activity.category}
              </span>
            </div>
            <h3 className="text-lg font-black text-slate-900 dark:text-white mt-0.5 break-words">
              {activity.name}
            </h3>
            {activity.description && (
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                {activity.description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('studentPortal.modal.closeCard')}
            className="h-8 w-8 rounded-xl flex items-center justify-center text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600 dark:hover:text-slate-200 transition shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Importe y desglose de tarifas */}
        <div className="rounded-xl bg-emerald-50/80 dark:bg-emerald-950/30 border border-emerald-500/20 p-4">
          <span className="text-xs font-semibold text-emerald-800 dark:text-emerald-300 block">
            {t('studentPortal.modal.officialFee')}
          </span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-black text-slate-900 dark:text-white tabular-nums">
              {(activity.billingMode === 'per_class'
                ? activity.defaultPricePerClass
                : activity.defaultPriceMonthly
              ).toFixed(2)}{' '}
              €
            </span>
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
              {activity.billingMode === 'per_class'
                ? t('studentPortal.modal.unitPerClass')
                : t('studentPortal.modal.unitPerMonth')}
            </span>
          </div>
          <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-1">
            {t('studentPortal.modal.modalityLabel')}{' '}
            <strong>
              {activity.billingMode === 'per_class'
                ? t('studentPortal.modal.modalityPerClass')
                : t('studentPortal.modal.modalityMonthly')}
            </strong>
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 tabular-nums">
            {t('activitiesView.ratesLabel')}:{' '}
            <strong className="text-slate-700 dark:text-slate-300">
              {t('activitiesView.rateSummary', {
                monthly: activity.defaultPriceMonthly,
                perClass: activity.defaultPricePerClass
              })}
            </strong>
          </p>
        </div>

        {/* Parámetros Bizum si están activos */}
        {activity.bizum_enabled && (
          <div className="rounded-xl border border-sky-500/30 bg-sky-50/50 dark:bg-sky-950/20 p-4 space-y-2">
            <div className="flex items-center gap-1.5 text-sky-700 dark:text-sky-300 font-bold text-xs">
              <Smartphone className="h-4 w-4" />
              <span>{t('studentPortal.modal.directBizumTitle')}</span>
            </div>
            <div className="flex items-center justify-between bg-white dark:bg-slate-800 px-3 py-2 rounded-lg border border-sky-200 dark:border-sky-800 text-xs">
              <div>
                <span className="text-[10px] text-slate-400 block">
                  {t('studentPortal.modal.bizumNumberLabel')}
                </span>
                <strong className="text-slate-900 dark:text-white font-mono text-sm">
                  {activity.bizum_phone || t('studentPortal.modal.askTeacher')}
                </strong>
              </div>
              {activity.bizum_phone && (
                <button
                  type="button"
                  onClick={() => handleCopyBizum(activity.bizum_phone!)}
                  className="inline-flex items-center gap-1 rounded-md bg-sky-100 dark:bg-sky-900/60 px-2 py-1 text-[11px] font-bold text-sky-700 dark:text-sky-300"
                >
                  {copiedBizum ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  <span>
                    {copiedBizum ? t('studentPortal.modal.copied') : t('studentPortal.modal.copy')}
                  </span>
                </button>
              )}
            </div>
            {activity.bizum_concept && (
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {t('studentPortal.modal.recommendedConcept')}{' '}
                <strong>{activity.bizum_concept}</strong>
              </p>
            )}
          </div>
        )}

        {/* Datos de la sala y monitor */}
        <div className="border-t border-slate-100 dark:border-slate-800 pt-3 space-y-2.5 text-xs">
          <div className="grid grid-cols-2 gap-2.5">
            <div className="rounded-xl bg-slate-50 dark:bg-slate-800/40 p-2.5 border border-slate-200/60 dark:border-slate-800 min-w-0">
              <span className="text-[10px] uppercase font-bold text-slate-400 block leading-tight">
                {t('studentPortal.responsibleTeacher')}
              </span>
              <span className="font-semibold text-slate-900 dark:text-white mt-0.5 block truncate">
                {teacherItem?.name || t('activitiesView.noTeacher')}
              </span>
              {teacherItem?.phone && (
                <a
                  href={`tel:${teacherItem.phone.replace(/[^\d+]/g, '')}`}
                  className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline mt-0.5 block truncate"
                >
                  {teacherItem.phone}
                </a>
              )}
            </div>
            <div className="rounded-xl bg-slate-50 dark:bg-slate-800/40 p-2.5 border border-slate-200/60 dark:border-slate-800 min-w-0">
              <span className="text-[10px] uppercase font-bold text-slate-400 block leading-tight">
                {t('activitiesView.roomLabel')}
              </span>
              <span className="font-semibold text-slate-900 dark:text-white mt-0.5 block truncate">
                {activity.room || t('studentPortal.noRoom')}
              </span>
            </div>
          </div>

          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1.5 leading-tight">
              {t('activitiesView.scheduleLabel')}
            </span>
            <div className="flex flex-wrap gap-1.5">
              {activity.schedule.length === 0 ? (
                <span className="text-[11px] text-slate-400">{t('studentPortal.noSchedule')}</span>
              ) : (
                activity.schedule.map((sch, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1 rounded-xl bg-slate-100 dark:bg-slate-800/80 px-2.5 py-1.5 text-[11px] font-medium text-slate-700 dark:text-slate-300"
                  >
                    <Clock className="h-3 w-3 text-emerald-600 shrink-0" />
                    <span>{sch}</span>
                  </span>
                ))
              )}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="w-full rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold py-2.5 text-xs transition cursor-pointer"
        >
          {t('studentPortal.modal.closeCard')}
        </button>
      </div>
    </div>,
    document.body
  );
};
