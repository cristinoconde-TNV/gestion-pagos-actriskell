import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Loader2,
  Smartphone,
  UserMinus,
  X
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { createTranslator } from '../lib/i18n';
import { parseOfficialBizumConfig } from '../lib/bizumConfig';
import { Activity, Student, UserRole } from '../types';

interface ActivityDetailModalProps {
  activity: Activity | null;
  onClose: () => void;
  studentOverride?: Student | null;
}

export const ActivityDetailModal: React.FC<ActivityDetailModalProps> = ({
  activity,
  onClose,
  studentOverride
}) => {
  const {
    teachers,
    students,
    currentStudentId,
    currentTeacherId,
    currentRole,
    currentUser,
    requestActivityUnenrollment,
    cancelActivityUnenrollmentRequest,
    appConfigs,
    language
  } = useApp();
  const t = createTranslator(language);
  const officialBizum = useMemo(() => parseOfficialBizumConfig(appConfigs), [appConfigs]);
  const [copiedBizum, setCopiedBizum] = useState(false);
  const [isDropConfirmOpen, setIsDropConfirmOpen] = useState(false);
  const [dropReason, setDropReason] = useState('');
  const [isSubmittingDrop, setIsSubmittingDrop] = useState(false);
  const [isCancellingDrop, setIsCancellingDrop] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const currentTeacher = useMemo(
    () => teachers.find(item => item.id === currentTeacherId),
    [teachers, currentTeacherId]
  );

  const currentStudent = useMemo(() => {
    const emailNorm = (currentUser?.email || '').trim().toLowerCase();
    return (
      students.find(
        s =>
          (currentUser?.studentId && s.id === currentUser.studentId) ||
          (currentUser?.id && s.profileId === currentUser.id) ||
          (emailNorm && s.email.trim().toLowerCase() === emailNorm)
      ) ||
      students.find(s => s.id === currentStudentId) ||
      undefined
    );
  }, [students, currentUser, currentStudentId]);

  useEffect(() => {
    setCopiedBizum(false);
    setIsDropConfirmOpen(false);
    setDropReason('');
    setIsSubmittingDrop(false);
    setIsCancellingDrop(false);
    setActionFeedback(null);
  }, [activity?.id]);

  useEffect(() => {
    if (!activity) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isDropConfirmOpen) {
          if (!isSubmittingDrop) {
            setIsDropConfirmOpen(false);
            setDropReason('');
          }
          return;
        }
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activity, isDropConfirmOpen, isSubmittingDrop, onClose]);

  if (!activity || typeof document === 'undefined') return null;

  const resolvedStudent =
    studentOverride !== undefined ? studentOverride ?? undefined : currentStudent;

  const teacherItem = teachers.find(tch => tch.id === activity.teacherId);
  const canRequestDrop =
    studentOverride !== undefined
      ? Boolean(studentOverride) &&
        (currentRole === UserRole.Admin ||
          currentRole === UserRole.Alumno ||
          currentRole === UserRole.Socio ||
          (currentRole === UserRole.Hibrido && activity.teacherId !== currentTeacher?.id))
      : currentRole === UserRole.Alumno ||
        currentRole === UserRole.Socio ||
        (currentRole === UserRole.Hibrido && activity.teacherId !== currentTeacher?.id);
  const modalEnrollment = resolvedStudent?.activities.find(e => e.activityId === activity.id);
  const isModalEnrolled = Boolean(modalEnrollment);
  const isModalDropPending =
    modalEnrollment?.status === 'pending_unenroll' ||
    modalEnrollment?.status === 'pending_withdrawal';

  const handleCopyBizum = (phone: string) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(phone).catch(() => {});
    }
    setCopiedBizum(true);
    setTimeout(() => setCopiedBizum(false), 2000);
  };

  const handleConfirmDrop = async () => {
    if (!resolvedStudent) return;
    setIsSubmittingDrop(true);
    setActionFeedback(null);
    try {
      const res = await requestActivityUnenrollment(
        resolvedStudent.id,
        activity.id,
        dropReason.trim() || undefined
      );
      setIsDropConfirmOpen(false);
      setDropReason('');
      if (res.success) {
        setActionFeedback({
          type: 'success',
          message: t('studentPortal.unenrollSuccess', { activity: activity.name })
        });
      } else {
        setActionFeedback({
          type: 'error',
          message: res.error || t('studentPortal.unenrollError')
        });
      }
    } finally {
      setIsSubmittingDrop(false);
    }
  };

  const handleCancelDrop = async () => {
    if (!resolvedStudent) return;
    setIsCancellingDrop(true);
    setActionFeedback(null);
    try {
      const res = await cancelActivityUnenrollmentRequest(resolvedStudent.id, activity.id);
      if (res.success) {
        setActionFeedback({
          type: 'success',
          message: t('studentPortal.cancelDropSuccess', { activity: activity.name })
        });
      } else {
        setActionFeedback({
          type: 'error',
          message: res.error || t('studentPortal.unenrollError')
        });
      }
    } finally {
      setIsCancellingDrop(false);
    }
  };

  return createPortal(
    <>
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
                {canRequestDrop && isModalDropPending && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/35 bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-800 dark:text-amber-200 whitespace-nowrap">
                    <Clock className="h-3 w-3 shrink-0" />
                    <span>{t('studentPortal.dropPendingBadge')}</span>
                  </span>
                )}
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
              className="h-11 w-11 md:h-8 md:w-8 rounded-xl flex items-center justify-center text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600 dark:hover:text-slate-200 transition shrink-0"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {actionFeedback && (
            <div
              className={`rounded-xl border px-3 py-2.5 text-xs font-semibold flex items-center gap-2 ${
                actionFeedback.type === 'success'
                  ? 'border-emerald-500/30 bg-emerald-50/80 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-200'
                  : 'border-rose-500/30 bg-rose-50/80 dark:bg-rose-950/30 text-rose-800 dark:text-rose-200'
              }`}
            >
              {actionFeedback.type === 'success' ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
              )}
              <span>{actionFeedback.message}</span>
            </div>
          )}

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

          {/* Parámetros Bizum (directo del taller u oficial de la asociación) */}
          {activity.bizum_enabled ? (
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
          ) : officialBizum.isConfigured ? (
            <div className="rounded-xl border border-sky-500/30 bg-sky-50/50 dark:bg-sky-950/20 p-4 space-y-2">
              <div className="flex items-center gap-1.5 text-sky-700 dark:text-sky-300 font-bold text-xs">
                <Smartphone className="h-4 w-4" />
                <span>{t('studentPortal.associationBizumPrefix')}</span>
              </div>
              <div className="flex items-center justify-between bg-white dark:bg-slate-800 px-3 py-2 rounded-lg border border-sky-200 dark:border-sky-800 text-xs">
                <div>
                  <span className="text-[10px] text-slate-400 block">
                    {t('studentPortal.modal.bizumNumberLabel')}
                  </span>
                  <strong className="text-slate-900 dark:text-white font-mono text-sm">
                    {officialBizum.phone}
                  </strong>
                </div>
                <button
                  type="button"
                  onClick={() => handleCopyBizum(officialBizum.phone)}
                  className="inline-flex items-center gap-1 rounded-md bg-sky-100 dark:bg-sky-900/60 px-2 py-1 text-[11px] font-bold text-sky-700 dark:text-sky-300"
                >
                  {copiedBizum ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  <span>
                    {copiedBizum ? t('studentPortal.modal.copied') : t('studentPortal.modal.copy')}
                  </span>
                </button>
              </div>
            </div>
          ) : null}

          {/* Datos de la sala, monitor y horarios */}
          <div className="border-t border-slate-100 dark:border-slate-800 pt-3 text-xs">
            <div className="grid grid-cols-2 gap-2.5 items-start">
              <div className="flex flex-col gap-2.5 min-w-0">
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

                <div className="min-w-0">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1.5 leading-tight">
                    {t('activitiesView.scheduleLabel')}
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {activity.schedule.length === 0 ? (
                      <span className="text-[11px] text-slate-400">
                        {t('studentPortal.noSchedule')}
                      </span>
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

              <div className="flex flex-col gap-2.5 min-w-0">
                <div className="rounded-xl bg-slate-50 dark:bg-slate-800/40 p-2.5 border border-slate-200/60 dark:border-slate-800 min-w-0">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block leading-tight">
                    {t('activitiesView.roomLabel')}
                  </span>
                  <span className="font-semibold text-slate-900 dark:text-white mt-0.5 block truncate">
                    {activity.room || t('studentPortal.noRoom')}
                  </span>
                </div>

                {resolvedStudent && canRequestDrop && isModalEnrolled && (
                  isModalDropPending ? (
                    <button
                      type="button"
                      disabled={isCancellingDrop}
                      onClick={handleCancelDrop}
                      title={t('studentPortal.cancelDropButton')}
                      aria-label={t('studentPortal.cancelDropAria', { name: activity.name })}
                      className="w-full min-h-[44px] md:min-h-0 inline-flex items-center justify-center gap-1.5 rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-500/15 px-2.5 py-2 text-xs font-bold text-amber-800 dark:text-amber-200 hover:bg-amber-500/25 transition whitespace-nowrap active:scale-[0.99] disabled:opacity-50 cursor-pointer"
                    >
                      {isCancellingDrop ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                      ) : (
                        <X className="h-3.5 w-3.5 shrink-0" />
                      )}
                      <span className="truncate">{t('studentPortal.cancelDropButton')}</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setDropReason('');
                        setIsDropConfirmOpen(true);
                      }}
                      title={t('studentPortal.unenrollButton')}
                      aria-label={t('studentPortal.unenrollAria', { name: activity.name })}
                      className="w-full min-h-[44px] md:min-h-0 inline-flex items-center justify-center gap-1.5 rounded-xl border border-rose-200 dark:border-rose-800/70 bg-rose-500/10 px-2.5 py-2 text-xs font-bold text-rose-700 dark:text-rose-300 hover:bg-rose-600 hover:text-white dark:hover:bg-rose-600 dark:hover:text-white transition whitespace-nowrap active:scale-[0.99] cursor-pointer"
                    >
                      <UserMinus className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{t('studentPortal.unenrollButton')}</span>
                    </button>
                  )
                )}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-full min-h-[44px] md:min-h-0 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold py-2.5 text-xs transition cursor-pointer"
          >
            {t('studentPortal.modal.closeCard')}
          </button>
        </div>
      </div>

      {isDropConfirmOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t('studentPortal.unenrollModal.title')}
          onClick={() => {
            if (!isSubmittingDrop) {
              setIsDropConfirmOpen(false);
              setDropReason('');
            }
          }}
          className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-xs"
        >
          <div
            onClick={e => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-2xl space-y-4"
          >
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 shrink-0">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div className="space-y-1.5">
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                  {t('studentPortal.unenrollModal.title')}
                </h4>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  {t('studentPortal.unenrollModal.bodyBefore')}{' '}
                  <strong>{activity.name}</strong>
                  {t('studentPortal.unenrollModal.bodyAfter')}
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                  {t('studentPortal.unenrollModal.warningNote')}
                </p>
              </div>
            </div>

            <div className="space-y-1">
              <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                {t('studentPortal.unenrollModal.reasonLabel')}
              </label>
              <textarea
                rows={2}
                value={dropReason}
                onChange={e => setDropReason(e.target.value)}
                placeholder={t('studentPortal.unenrollModal.reasonPlaceholder')}
                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-amber-500 resize-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                disabled={isSubmittingDrop}
                onClick={() => {
                  setIsDropConfirmOpen(false);
                  setDropReason('');
                }}
                className="min-h-[44px] md:min-h-0 rounded-xl border border-slate-300 dark:border-slate-700 px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition disabled:opacity-50"
              >
                {t('studentPortal.unenrollModal.cancel')}
              </button>
              <button
                type="button"
                disabled={isSubmittingDrop}
                onClick={handleConfirmDrop}
                className="min-h-[44px] md:min-h-0 inline-flex items-center gap-1.5 rounded-xl bg-amber-600 px-4 py-2 text-xs font-bold text-white hover:bg-amber-700 transition disabled:opacity-60"
              >
                {isSubmittingDrop && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                <span>
                  {isSubmittingDrop
                    ? t('studentPortal.unenrollModal.confirming')
                    : t('studentPortal.unenrollModal.confirm')}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>,
    document.body
  );
};
