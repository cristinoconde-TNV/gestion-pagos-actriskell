import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { createTranslator } from '../lib/i18n';
import { Activity, PaymentMethod } from '../types';
import { ProfileView } from './ProfileView';
import { NewsCarouselSection } from './NewsCarouselSection';
import {
  Calendar,
  Users,
  CheckCircle2,
  Clock,
  Sparkles,
  Smartphone,
  Plus,
  UserPlus,
  UserCheck,
  UserMinus,
  Edit2,
  Check,
  X,
  CreditCard,
  Banknote,
  DollarSign,
  AlertCircle,
  AlertTriangle,
  MessageCircle,
  Camera,
  Layers,
  ChevronDown,
  RotateCcw,
  Trash2,
  Info
} from 'lucide-react';

const normalizeTextForSchedule = (raw: string) =>
  raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

const SPANISH_DAY_NAMES = [
  'domingo',
  'lunes',
  'martes',
  'miercoles',
  'jueves',
  'viernes',
  'sabado'
];

const SPANISH_DAY_ABBRS = ['dom', 'lun', 'mar', 'mie', 'jue', 'vie', 'sab'];

interface MatchedActivityResult {
  activity: Activity;
  matchType: 'live' | 'upcoming_today' | 'earlier_today' | 'fallback';
}

const findActiveActivityForNow = (
  activitiesList: Activity[],
  now: Date = new Date()
): MatchedActivityResult | null => {
  if (!activitiesList.length) return null;

  const dayIdx = now.getDay();
  const fullDay = SPANISH_DAY_NAMES[dayIdx];
  const abbrDay = SPANISH_DAY_ABBRS[dayIdx];
  const abbrRegex = new RegExp(`\\b${abbrDay}\\b`, 'i');
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  let bestLive: { activity: Activity; score: number } | null = null;
  let bestUpcoming: { activity: Activity; delta: number } | null = null;
  let bestEarlier: { activity: Activity; delta: number } | null = null;

  for (const act of activitiesList) {
    if (act.active === false) continue;
    for (const slot of act.schedule || []) {
      const normalized = normalizeTextForSchedule(slot);
      const matchesDay = normalized.includes(fullDay) || abbrRegex.test(normalized);
      if (!matchesDay) continue;

      const timeMatches = Array.from(normalized.matchAll(/(\d{1,2}):(\d{2})/g));
      if (timeMatches.length === 0) {
        if (!bestUpcoming) {
          bestUpcoming = { activity: act, delta: 24 * 60 };
        }
        continue;
      }

      const startMinutes =
        parseInt(timeMatches[0][1], 10) * 60 + parseInt(timeMatches[0][2], 10);
      const endMinutes =
        timeMatches.length >= 2
          ? parseInt(timeMatches[1][1], 10) * 60 + parseInt(timeMatches[1][2], 10)
          : startMinutes + 90;

      // En curso ahora (con margen de 15 min antes y 15 min después)
      if (nowMinutes >= startMinutes - 15 && nowMinutes <= endMinutes + 15) {
        const distanceFromStart = Math.abs(nowMinutes - startMinutes);
        if (!bestLive || distanceFromStart < bestLive.score) {
          bestLive = { activity: act, score: distanceFromStart };
        }
      } else if (startMinutes > nowMinutes) {
        const delta = startMinutes - nowMinutes;
        if (!bestUpcoming || delta < bestUpcoming.delta) {
          bestUpcoming = { activity: act, delta };
        }
      } else {
        const delta = nowMinutes - endMinutes;
        if (!bestEarlier || delta < bestEarlier.delta) {
          bestEarlier = { activity: act, delta };
        }
      }
    }
  }

  if (bestLive) return { activity: bestLive.activity, matchType: 'live' };
  if (bestUpcoming) return { activity: bestUpcoming.activity, matchType: 'upcoming_today' };
  if (bestEarlier) return { activity: bestEarlier.activity, matchType: 'earlier_today' };
  return { activity: activitiesList[0], matchType: 'fallback' };
};

interface TeacherPortalViewProps {
  onOpenAddSession: (teacherId?: string) => void;
  onOpenRecordPayment: () => void;
  onOpenAddActivity?: (activity?: Activity) => void;
  onOpenAddStudent?: () => void;
  onOpenEnrollStudent?: (activityId?: string) => void;
  onNavigateToProfile?: () => void;
}

interface TeacherWorkshopsSectionProps {
  onOpenAddActivity?: (activity?: Activity) => void;
  onOpenAddStudent?: () => void;
  onOpenEnrollStudent?: (activityId?: string) => void;
}

export const TeacherWorkshopsSection: React.FC<TeacherWorkshopsSectionProps> = ({
  onOpenAddActivity,
  onOpenEnrollStudent
}) => {
  const {
    currentTeacherId,
    teachers,
    activities,
    students,
    unenrollStudentFromActivity,
    confirmActivityEnrollment,
    rejectActivityEnrollment,
    language
  } = useApp();
  const t = createTranslator(language);
  const currentTeacher = teachers.find(teacherItem => teacherItem.id === currentTeacherId) || teachers[0];
  const myActivities = useMemo(() => {
    return activities.filter(a => a.teacherId === currentTeacher?.id);
  }, [activities, currentTeacher?.id]);

  const [pendingRemoval, setPendingRemoval] = useState<{
    studentId: string;
    studentName: string;
    activityId: string;
    activityName: string;
  } | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);
  const [busyRequestKey, setBusyRequestKey] = useState<string | null>(null);
  const [workshopFeedback, setWorkshopFeedback] = useState<string | null>(null);
  const [workshopError, setWorkshopError] = useState<string | null>(null);

  const handleConfirmPendingRequest = async (
    studentId: string,
    studentName: string,
    activityId: string,
    activityName: string
  ) => {
    setBusyRequestKey(`confirm:${studentId}:${activityId}`);
    setWorkshopError(null);
    setWorkshopFeedback(null);
    try {
      const res = await confirmActivityEnrollment(studentId, activityId);
      if (res.success) {
        setWorkshopFeedback(
          t('teacherPortal.workshopsSection.enrollmentConfirmed', {
            student: studentName,
            activity: activityName
          })
        );
        setTimeout(() => setWorkshopFeedback(null), 4000);
      } else {
        setWorkshopError(res.error || t('teacherPortal.workshopsSection.confirmEnrollmentError'));
      }
    } finally {
      setBusyRequestKey(null);
    }
  };

  const handleRejectPendingRequest = async (
    studentId: string,
    studentName: string,
    activityId: string,
    activityName: string
  ) => {
    setBusyRequestKey(`reject:${studentId}:${activityId}`);
    setWorkshopError(null);
    setWorkshopFeedback(null);
    try {
      const res = await rejectActivityEnrollment(studentId, activityId);
      if (res.success) {
        setWorkshopFeedback(
          t('teacherPortal.workshopsSection.requestRejected', {
            student: studentName,
            activity: activityName
          })
        );
        setTimeout(() => setWorkshopFeedback(null), 4000);
      } else {
        setWorkshopError(res.error || t('teacherPortal.workshopsSection.rejectRequestError'));
      }
    } finally {
      setBusyRequestKey(null);
    }
  };

  const handleConfirmRemove = async () => {
    if (!pendingRemoval) return;
    setIsRemoving(true);
    setWorkshopError(null);
    try {
      const res = await unenrollStudentFromActivity(
        pendingRemoval.studentId,
        pendingRemoval.activityId
      );
      if (res.success) {
        setWorkshopFeedback(
          t('teacherPortal.workshopsSection.studentRemoved', {
            student: pendingRemoval.studentName,
            activity: pendingRemoval.activityName
          })
        );
        setTimeout(() => setWorkshopFeedback(null), 3500);
      } else {
        setWorkshopError(res.error || t('teacherPortal.workshopsSection.removeStudentError'));
      }
      setPendingRemoval(null);
    } finally {
      setIsRemoving(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Barra de Acciones del Monitor (Crear taller, Inscribir, Nuevo alumno) */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
            {t('teacherPortal.workshopsSection.title', { count: myActivities.length })}
          </h3>
          <p className="text-xs text-slate-500">
            {t('teacherPortal.workshopsSection.subtitle')}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">

          {onOpenEnrollStudent && (
            <button
              type="button"
              onClick={() => onOpenEnrollStudent()}
              className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-50/60 dark:bg-emerald-950/20 px-3 py-2 text-xs font-bold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 transition min-h-[40px]"
            >
              <UserCheck className="h-4 w-4" />
              <span>{t('teacherPortal.workshopsSection.enrollStudent')}</span>
            </button>
          )}

          {onOpenAddActivity && (
            <button
              type="button"
              onClick={() => onOpenAddActivity()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700 shadow-xs transition min-h-[40px]"
            >
              <Plus className="h-4 w-4" />
              <span>{t('teacherPortal.workshopsSection.createNewWorkshop')}</span>
            </button>
          )}
        </div>
      </div>

      {workshopFeedback && (
        <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-500/30 p-3 text-xs font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
          <span>{workshopFeedback}</span>
        </div>
      )}

      {workshopError && (
        <div className="rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-500/30 p-3 text-xs font-bold text-rose-800 dark:text-rose-300 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
          <span>{workshopError}</span>
        </div>
      )}

      {/* Listado de Talleres */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {myActivities.length === 0 ? (
          <div className="col-span-2 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center text-xs text-slate-400">
            {t('teacherPortal.workshopsSection.emptyWorkshops')}
          </div>
        ) : (
          myActivities.map(act => {
            const actStudents = students.filter(s =>
              s.activities.some(enroll => enroll.activityId === act.id)
            );
            const actPendingRequests = students.filter(s =>
              (s.pendingEnrollments || []).some(enroll => enroll.activityId === act.id)
            );
            return (
              <div
                key={act.id}
                className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs space-y-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-md bg-indigo-500/10 px-2 py-0.5 text-[10px] font-bold text-indigo-700 dark:text-indigo-300">
                        {act.category}
                      </span>
                      <span className="rounded-md bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:text-slate-400">
                        {act.billingMode === 'per_class'
                          ? t('teacherPortal.workshopsSection.billingPerClass')
                          : t('teacherPortal.workshopsSection.billingMonthly')}
                      </span>
                    </div>
                    <h4 className="text-base font-bold text-slate-900 dark:text-white mt-1">
                      {act.name}
                    </h4>
                    <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">
                      {act.description}
                    </p>
                  </div>

                  <div className="flex items-start gap-2.5 shrink-0">
                    <div className="text-right">
                      <span className="text-lg font-black tabular-nums text-slate-900 dark:text-white block">
                        {act.billingMode === 'per_class'
                          ? t('teacherPortal.workshopsSection.priceUnitPerClass', { price: act.defaultPricePerClass })
                          : t('teacherPortal.workshopsSection.priceUnitPerMonth', { price: act.defaultPriceMonthly })}
                      </span>
                      <span className="text-[11px] text-slate-400">
                        {t('teacherPortal.workshopsSection.enrolledCount', { count: actStudents.length })}
                      </span>
                    </div>
                    {onOpenAddActivity && (
                      <button
                        type="button"
                        onClick={() => onOpenAddActivity(act)}
                        title={t('teacherPortal.workshopsSection.editWorkshopTooltip')}
                        className="inline-flex items-center gap-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 py-1.5 text-[11px] font-bold text-slate-700 dark:text-slate-200 hover:border-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-300 transition"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                        <span>{t('teacherPortal.workshopsSection.edit')}</span>
                      </button>
                    )}
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500">
                  <span>{t('teacherPortal.workshopsSection.roomLabel')} <strong>{act.room}</strong></span>
                  <span>{t('teacherPortal.workshopsSection.scheduleLabel')} {act.schedule.join(' · ')}</span>
                </div>

                {act.bizum_enabled && (
                  <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/30 p-2 text-xs text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5 border border-emerald-500/20">
                    <Smartphone className="h-3.5 w-3.5 text-emerald-600" />
                    <span>
                      {t('teacherPortal.workshopsSection.bizumLabel')} <strong>{act.bizum_phone}</strong>{' '}
                      {t('teacherPortal.workshopsSection.conceptInsideParens', { concept: act.bizum_concept || '' })}
                    </span>
                  </div>
                )}

                {/* Solicitudes de inscripción pendientes */}
                {actPendingRequests.length > 0 && (
                  <div className="rounded-xl border border-amber-500/35 bg-amber-50/70 dark:bg-amber-950/25 p-3 space-y-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5" />
                      {t('teacherPortal.workshopsSection.pendingRequests', { count: actPendingRequests.length })}
                    </span>
                    <div className="space-y-1.5">
                      {actPendingRequests.map(st => {
                        const cKey = `confirm:${st.id}:${act.id}`;
                        const rKey = `reject:${st.id}:${act.id}`;
                        const isBusy = busyRequestKey === cKey || busyRequestKey === rKey;
                        return (
                          <div
                            key={st.id}
                            className="flex items-center justify-between gap-2 rounded-lg bg-white/95 dark:bg-slate-900/95 px-2.5 py-2 text-xs border border-amber-500/20"
                          >
                            <div className="min-w-0 flex-1">
                              <span className="font-bold text-slate-900 dark:text-white truncate block">
                                {st.name}
                              </span>
                              {(st.phone || st.email) && (
                                <span className="text-[10px] text-slate-500 truncate block">
                                  {st.phone || st.email}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => handleConfirmPendingRequest(st.id, st.name, act.id, act.name)}
                                className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-emerald-700 transition disabled:opacity-50"
                              >
                                <Check className="h-3 w-3" />
                                <span>{busyRequestKey === cKey ? '...' : t('teacherPortal.workshopsSection.confirm')}</span>
                              </button>
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => handleRejectPendingRequest(st.id, st.name, act.id, act.name)}
                                title={t('teacherPortal.workshopsSection.rejectRequestTooltip')}
                                aria-label={t('teacherPortal.workshopsSection.rejectRequestAria', { student: st.name })}
                                className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition disabled:opacity-50"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Alumnos del taller */}
                <div className="space-y-1.5 pt-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase text-slate-400 block">
                      {t('teacherPortal.workshopsSection.studentsInWorkshop', { count: actStudents.length })}
                    </span>
                    {onOpenEnrollStudent && (
                      <button
                        type="button"
                        onClick={() => onOpenEnrollStudent(act.id)}
                        className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 hover:underline"
                      >
                        {t('teacherPortal.workshopsSection.enrollHere')}
                      </button>
                    )}
                  </div>
                  {actStudents.length === 0 ? (
                    <p className="text-xs text-slate-400 italic">{t('teacherPortal.workshopsSection.noStudentsInWorkshop')}</p>
                  ) : (
                    <div className="divide-y divide-slate-100 dark:divide-slate-800">
                      {actStudents.map(st => {
                        const isPending =
                          st.status === 'pending_validation' || st.validationStatus === 'pending';
                        return (
                          <div key={st.id} className="py-2 flex items-center justify-between gap-2 text-xs">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                                {st.name}
                              </span>
                              {isPending && (
                                <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-300 shrink-0">
                                  <Clock className="h-3 w-3" />
                                  {t('teacherPortal.workshopsSection.pendingValidation')}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-[11px] text-slate-400 hidden sm:inline">
                                {st.phone || st.email}
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  setPendingRemoval({
                                    studentId: st.id,
                                    studentName: st.name,
                                    activityId: act.id,
                                    activityName: act.name
                                  })
                                }
                                title={t('teacherPortal.workshopsSection.removeStudentTooltip', { student: st.name })}
                                className="inline-flex items-center gap-1 rounded-lg border border-rose-200 dark:border-rose-900/60 bg-rose-50/60 dark:bg-rose-950/20 px-2 py-1 text-[11px] font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-950/50 transition whitespace-nowrap"
                              >
                                <UserMinus className="h-3 w-3" />
                                <span>{t('teacherPortal.workshopsSection.remove')}</span>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Modal de confirmación para quitar alumno del taller */}
      {pendingRemoval && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-2xl space-y-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400 shrink-0">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                  {t('teacherPortal.workshopsSection.removeModalTitle')}
                </h4>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  {t('teacherPortal.workshopsSection.removeModalPrefix')}
                  <strong>{pendingRemoval.studentName}</strong>
                  {t('teacherPortal.workshopsSection.removeModalMiddle')}
                  <strong>{pendingRemoval.activityName}</strong>
                  {t('teacherPortal.workshopsSection.removeModalSuffix')}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                disabled={isRemoving}
                onClick={() => setPendingRemoval(null)}
                className="rounded-xl border border-slate-300 dark:border-slate-700 px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              >
                {t('teacherPortal.workshopsSection.cancel')}
              </button>
              <button
                type="button"
                disabled={isRemoving}
                onClick={handleConfirmRemove}
                className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-700 transition disabled:opacity-60"
              >
                {isRemoving
                  ? t('teacherPortal.workshopsSection.removing')
                  : t('teacherPortal.workshopsSection.confirmRemove')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export const TeacherPortalView: React.FC<TeacherPortalViewProps> = ({
  onOpenAddSession,
  onOpenRecordPayment,
  onOpenAddActivity,
  onOpenAddStudent,
  onOpenEnrollStudent,
  onNavigateToProfile
}) => {
  const {
    currentTeacherId,
    setCurrentTeacherId,
    teachers,
    activities,
    students,
    selectedPeriod,
    teacherSummaries,
    sessions,
    periodPayments,
    recordClassPayment,
    updatePayment,
    deletePayment,
    unenrollStudentFromActivity,
    confirmActivityEnrollment,
    rejectActivityEnrollment,
    addClassSession,
    upsertSessionAttendance,
    currentRole,
    language
  } = useApp();
  const t = createTranslator(language);

  const currentTeacher = teachers.find(teacherItem => teacherItem.id === currentTeacherId) || teachers[0];
  const teacherSummary = teacherSummaries.find(ts => ts.teacher.id === currentTeacher?.id);

  // Filtro estricto: Solo actividades y talleres de ESTE monitor
  const myActivities = useMemo(() => {
    return activities.filter(a => a.teacherId === currentTeacher?.id);
  }, [activities, currentTeacher?.id]);

  // Alumnos inscritos exclusivamente en las actividades de este monitor
  const myActivityIds = useMemo(() => myActivities.map(a => a.id), [myActivities]);
  const myStudents = useMemo(() => {
    return students.filter(st =>
      st.activities.some(a => myActivityIds.includes(a.activityId))
    );
  }, [students, myActivityIds]);

  const myPendingRequests = useMemo(() => {
    const items: Array<{ studentId: string; studentName: string; contact: string; activityId: string; activityName: string }> = [];
    for (const st of students) {
      for (const req of st.pendingEnrollments || []) {
        if (!myActivityIds.includes(req.activityId)) continue;
        const act = myActivities.find(a => a.id === req.activityId);
        if (!act) continue;
        items.push({
          studentId: st.id,
          studentName: st.name,
          contact: st.phone || st.email || '',
          activityId: act.id,
          activityName: act.name
        });
      }
    }
    return items;
  }, [students, myActivityIds, myActivities]);

  const [portalRequestBusyKey, setPortalRequestBusyKey] = useState<string | null>(null);
  const [portalRequestError, setPortalRequestError] = useState<string | null>(null);

  // Pestañas internas del Portal del Monitor
  const [activeTab, setActiveTab] = useState<'class_control' | 'workshops' | 'payout' | 'profile'>('class_control');

  // Auto-detección de clase activa según día y hora actual
  const autoDetectedMatch = useMemo(
    () => findActiveActivityForNow(myActivities),
    [myActivities]
  );

  // Estado del Módulo "Control de Clase & Cobros"
  const [selectedClassActivityId, setSelectedClassActivityId] = useState<string>(
    () => autoDetectedMatch?.activity.id || myActivities[0]?.id || ''
  );
  const manualClassChoiceRef = useRef(false);
  const lastTeacherForAutoSelectRef = useRef<string | undefined>(currentTeacher?.id);

  useEffect(() => {
    if (lastTeacherForAutoSelectRef.current !== currentTeacher?.id) {
      lastTeacherForAutoSelectRef.current = currentTeacher?.id;
      manualClassChoiceRef.current = false;
    }

    if (myActivities.length === 0) {
      setSelectedClassActivityId('');
      return;
    }

    const existsInMyActivities = myActivities.some(a => a.id === selectedClassActivityId);
    if (!manualClassChoiceRef.current || !existsInMyActivities) {
      const targetId = autoDetectedMatch?.activity.id || myActivities[0]?.id || '';
      if (targetId && targetId !== selectedClassActivityId) {
        setSelectedClassActivityId(targetId);
      }
    }
  }, [myActivities, currentTeacher?.id, autoDetectedMatch, selectedClassActivityId]);

  const [sessionDate, setSessionDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [sessionTopic, setSessionTopic] = useState<string>('');
  const [sessionDuration, setSessionDuration] = useState<number>(75);

  // Registro de asistencia en memoria para la sesión activa { [studentId]: 'present' | 'absent' | 'partial' }
  const [attendanceMap, setAttendanceMap] = useState<Record<string, 'present' | 'absent' | 'partial'>>({});

  // Control de cobro parcial desplegado por alumno { [studentId]: boolean }
  const [partialInputOpen, setPartialInputOpen] = useState<Record<string, boolean>>({});
  const [partialAmountMap, setPartialAmountMap] = useState<Record<string, number>>({});
  const [paymentMethodMap, setPaymentMethodMap] = useState<Record<string, PaymentMethod>>({});

  // Modal de confirmación para anular/desmarcar pago o quitar alumno de un taller
  const [confirmDialog, setConfirmDialog] = useState<
    | {
        type: 'delete_payment';
        paymentId: string;
        studentName: string;
        amount: number;
      }
    | {
        type: 'remove_student';
        studentId: string;
        studentName: string;
        activityId: string;
        activityName: string;
      }
    | null
  >(null);
  const [isConfirmBusy, setIsConfirmBusy] = useState(false);

  // Feedback de guardado / acciones y notas expandidas por defecto dentro del contenedor
  const [isSessionFormOpen, setIsSessionFormOpen] = useState(true);
  const [isWorkshopInfoOpen, setIsWorkshopInfoOpen] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);
  const [classActionError, setClassActionError] = useState<string | null>(null);

  // Actividad seleccionada en la sesión activa
  const activeClassActivity = myActivities.find(a => a.id === selectedClassActivityId) || myActivities[0];

  // Alumnos matriculados en la actividad de la sesión activa
  const enrolledStudentsInClass = useMemo(() => {
    if (!activeClassActivity) return [];
    return students.filter(s =>
      s.activities.some(act => act.activityId === activeClassActivity.id)
    );
  }, [students, activeClassActivity]);

  // Sesión ya guardada para la actividad/fecha/monitor seleccionados
  const matchingClassSession = useMemo(() => {
    if (!activeClassActivity || !currentTeacher?.id) return undefined;
    return sessions.find(
      s =>
        s.activityId === activeClassActivity.id &&
        s.teacherId === currentTeacher.id &&
        s.date === sessionDate
    );
  }, [sessions, activeClassActivity, currentTeacher?.id, sessionDate]);

  const normalizeSessionNotes = (rawTopic?: string | null, activityName?: string): string => {
    const trimmed = (rawTopic || '').trim();
    if (!trimmed) return '';
    if (activityName && trimmed === `Clase de ${activityName}`) return '';
    return rawTopic || '';
  };

  const sessionContextKey = `${activeClassActivity?.id || ''}::${currentTeacher?.id || ''}::${sessionDate}`;
  const lastSessionContextKeyRef = useRef<string>('');
  const lastLoadedSessionIdRef = useRef<string>('');
  const lastHydratedTopicRef = useRef<string>('');
  const isSessionTopicDirtyRef = useRef<boolean>(false);

  useEffect(() => {
    const sessionIdKey = matchingClassSession?.id || 'none';
    const contextChanged = lastSessionContextKeyRef.current !== sessionContextKey;
    const hydratedTopic = normalizeSessionNotes(matchingClassSession?.topic, activeClassActivity?.name);

    if (contextChanged) {
      lastSessionContextKeyRef.current = sessionContextKey;
      lastLoadedSessionIdRef.current = sessionIdKey;
      isSessionTopicDirtyRef.current = false;
      lastHydratedTopicRef.current = hydratedTopic;
      setSessionTopic(hydratedTopic);

      if (matchingClassSession?.attendanceRecords?.length) {
        const hydratedAttendance: Record<string, 'present' | 'absent' | 'partial'> = {};
        matchingClassSession.attendanceRecords.forEach(rec => {
          hydratedAttendance[rec.studentId] = rec.attendance;
        });
        setAttendanceMap(hydratedAttendance);
      } else {
        setAttendanceMap({});
      }
      return;
    }

    if (lastLoadedSessionIdRef.current !== sessionIdKey) {
      lastLoadedSessionIdRef.current = sessionIdKey;
      if (matchingClassSession?.attendanceRecords?.length) {
        setAttendanceMap(prev => {
          if (Object.keys(prev).length > 0) return prev;
          const hydratedAttendance: Record<string, 'present' | 'absent' | 'partial'> = {};
          matchingClassSession.attendanceRecords?.forEach(rec => {
            hydratedAttendance[rec.studentId] = rec.attendance;
          });
          return hydratedAttendance;
        });
      }
    }

    if (!isSessionTopicDirtyRef.current && hydratedTopic !== lastHydratedTopicRef.current) {
      lastHydratedTopicRef.current = hydratedTopic;
      setSessionTopic(hydratedTopic);
    }
  }, [sessionContextKey, activeClassActivity?.name, matchingClassSession]);

  // Estado optimista instantáneo y cola serializada por alumno para móvil
  const [optimisticMobilePayment, setOptimisticMobilePayment] = useState<
    Record<string, 'paid' | 'partial' | 'pending'>
  >({});
  const mobileDesiredStatusRef = useRef<Record<string, 'paid' | 'partial' | 'pending'>>({});
  const mobilePaymentQueueRef = useRef<Record<string, Promise<void>>>({});
  const mobileLatestPaymentRef = useRef<
    Record<string, { id: string; status: 'paid' | 'partial' | 'pending' } | null>
  >({});

  // Limpiar overrides al cambiar de clase o fecha
  useEffect(() => {
    setOptimisticMobilePayment({});
    mobileDesiredStatusRef.current = {};
    mobileLatestPaymentRef.current = {};
  }, [activeClassActivity?.id, sessionDate]);

  // Handlers de Asistencia (actualización instantánea local + Supabase)
  const setStudentAttendance = (studentId: string, status: 'present' | 'absent' | 'partial') => {
    setAttendanceMap(prev => ({ ...prev, [studentId]: status }));
    if (!activeClassActivity || !currentTeacher?.id) return;
    const targetStudent = enrolledStudentsInClass.find(s => s.id === studentId);
    const pay = getStudentPaymentStatus(studentId);
    void upsertSessionAttendance({
      activityId: activeClassActivity.id,
      teacherId: currentTeacher.id,
      date: sessionDate,
      studentId,
      studentName: targetStudent?.name || t('teacherPortal.messages.fallbackStudentName'),
      attendance: status,
      durationMinutes: sessionDuration,
      topic: sessionTopic.trim(),
      paid: pay?.status === 'paid' || pay?.status === 'partial',
      paidAmount: pay?.amount,
      paymentMethod: pay?.paymentMethod || 'cash',
      paymentId: pay?.id,
      enrolledStudents: enrolledStudentsInClass.map(s => ({ id: s.id, name: s.name }))
    });
  };

  const toggleMobileAttendance = (studentId: string) => {
    const current = attendanceMap[studentId] || 'present';
    const next: 'present' | 'absent' = current === 'absent' ? 'present' : 'absent';
    setStudentAttendance(studentId, next);
  };

  const markAllPresent = () => {
    const updated: Record<string, 'present' | 'absent' | 'partial'> = {};
    enrolledStudentsInClass.forEach(s => {
      updated[s.id] = 'present';
      if (attendanceMap[s.id] === 'absent' && activeClassActivity && currentTeacher?.id) {
        const pay = getStudentPaymentStatus(s.id);
        void upsertSessionAttendance({
          activityId: activeClassActivity.id,
          teacherId: currentTeacher.id,
          date: sessionDate,
          studentId: s.id,
          studentName: s.name,
          attendance: 'present',
          durationMinutes: sessionDuration,
          topic: sessionTopic.trim(),
          paid: pay?.status === 'paid' || pay?.status === 'partial',
          paidAmount: pay?.amount,
          paymentMethod: pay?.paymentMethod || 'cash',
          paymentId: pay?.id,
          enrolledStudents: enrolledStudentsInClass.map(st => ({ id: st.id, name: st.name }))
        });
      }
    });
    setAttendanceMap(updated);
  };

  // Helper para saber si un alumno ya pagó este mes o esta clase
  const getStudentPaymentStatus = (studentId: string) => {
    if (!activeClassActivity) return null;
    const isMonthly = activeClassActivity.billingMode === 'monthly';

    if (isMonthly) {
      return (
        periodPayments.find(
          p =>
            p.studentId === studentId &&
            p.activityId === activeClassActivity.id &&
            p.periodMonth === selectedPeriod &&
            p.status === 'paid'
        ) ||
        periodPayments.find(
          p =>
            p.studentId === studentId &&
            p.activityId === activeClassActivity.id &&
            p.periodMonth === selectedPeriod &&
            p.status === 'partial'
        ) ||
        periodPayments.find(
          p =>
            p.studentId === studentId &&
            p.activityId === activeClassActivity.id &&
            p.periodMonth === selectedPeriod
        )
      );
    } else {
      // Por clase: busca si se cobró en esta fecha
      return (
        periodPayments.find(
          p =>
            p.studentId === studentId &&
            p.activityId === activeClassActivity.id &&
            p.paymentDate?.slice(0, 10) === sessionDate &&
            p.status === 'paid'
        ) ||
        periodPayments.find(
          p =>
            p.studentId === studentId &&
            p.activityId === activeClassActivity.id &&
            p.paymentDate?.slice(0, 10) === sessionDate &&
            p.status === 'partial'
        ) ||
        periodPayments.find(
          p =>
            p.studentId === studentId &&
            p.activityId === activeClassActivity.id &&
            p.paymentDate?.slice(0, 10) === sessionDate
        )
      );
    }
  };

  const handleConfirmDialogAction = async () => {
    if (!confirmDialog) return;
    setIsConfirmBusy(true);
    setClassActionError(null);
    try {
      if (confirmDialog.type === 'delete_payment') {
        await deletePayment(confirmDialog.paymentId);
        setSaveSuccessMsg(
          t('teacherPortal.messages.paymentDeleted', {
            student: confirmDialog.studentName,
            amount: confirmDialog.amount.toFixed(2)
          })
        );
        setTimeout(() => setSaveSuccessMsg(null), 4000);
      } else if (confirmDialog.type === 'remove_student') {
        const res = await unenrollStudentFromActivity(
          confirmDialog.studentId,
          confirmDialog.activityId
        );
        if (res.success) {
          setSaveSuccessMsg(
            t('teacherPortal.messages.studentRemoved', {
              student: confirmDialog.studentName,
              activity: confirmDialog.activityName
            })
          );
          setTimeout(() => setSaveSuccessMsg(null), 4000);
        } else {
          setClassActionError(res.error || t('teacherPortal.messages.removeStudentError'));
        }
      }
      setConfirmDialog(null);
    } finally {
      setIsConfirmBusy(false);
    }
  };

  // Handler de Cobro Rápido (completo o parcial)
  const handleCollectPayment = async (
    studentId: string,
    fullAmount: number,
    isPartial: boolean = false
  ) => {
    if (!activeClassActivity) return;
    setClassActionError(null);

    const defaultPartialAmount =
      fullAmount > 1 ? Math.round((fullAmount / 2) * 100) / 100 : fullAmount;
    const chosenAmount = isPartial
      ? partialAmountMap[studentId] ?? defaultPartialAmount
      : fullAmount;

    if (!Number.isFinite(chosenAmount) || chosenAmount <= 0) {
      setClassActionError(t('teacherPortal.messages.invalidAmountError'));
      return;
    }

    const effectiveIsPartial = isPartial && (fullAmount <= 0 || chosenAmount < fullAmount);
    const chosenMethod = paymentMethodMap[studentId] || 'cash';

    const receipt = await recordClassPayment({
      studentId,
      activityId: activeClassActivity.id,
      amount: chosenAmount,
      isPartial: effectiveIsPartial,
      paymentMethod: chosenMethod,
      date: sessionDate,
      notes: effectiveIsPartial
        ? t('teacherPortal.messages.partialPaymentNote', {
            paid: chosenAmount,
            total: fullAmount,
            activity: activeClassActivity.name
          })
        : t('teacherPortal.messages.classPaymentNote', {
            activity: activeClassActivity.name
          })
    });

    if (!receipt) {
      setClassActionError(
        effectiveIsPartial
          ? t('teacherPortal.messages.partialSaveError')
          : t('teacherPortal.messages.paymentSaveError')
      );
      return;
    }

    // Cerrar input parcial si estaba abierto
    setPartialInputOpen(prev => ({ ...prev, [studentId]: false }));

    // Si no tenía asistencia marcada, marcar como presente
    if (!attendanceMap[studentId]) {
      setStudentAttendance(studentId, 'present');
    }
  };

  const handleCompletePartialPayment = async (paymentId: string, fullAmount: number) => {
    if (!activeClassActivity) return;
    await updatePayment(paymentId, {
      amount: fullAmount,
      status: 'paid',
      paymentDate: sessionDate,
      notes: t('teacherPortal.messages.completedPartialNote', {
        total: fullAmount,
        activity: activeClassActivity.name
      })
    });
  };

  const paymentActionsRef = useRef({
    recordClassPayment,
    updatePayment,
    deletePayment,
    getStudentPaymentStatus,
    t
  });
  paymentActionsRef.current = {
    recordClassPayment,
    updatePayment,
    deletePayment,
    getStudentPaymentStatus,
    t
  };

  // Ciclo táctil móvil de cobro: Pendiente (PEN) -> Pagado (P) -> Cobro Parcial (CP) -> Pendiente (PEN)
  const handleCycleMobilePayment = (studentId: string, studentFee: number) => {
    if (!activeClassActivity) return;
    setClassActionError(null);

    const existingPayment = getStudentPaymentStatus(studentId);
    const currentEffectiveStatus: 'paid' | 'partial' | 'pending' =
      mobileDesiredStatusRef.current[studentId] ||
      optimisticMobilePayment[studentId] ||
      (existingPayment?.status === 'paid'
        ? 'paid'
        : existingPayment?.status === 'partial'
        ? 'partial'
        : 'pending');

    const nextStatus: 'paid' | 'partial' | 'pending' =
      currentEffectiveStatus === 'pending'
        ? 'paid'
        : currentEffectiveStatus === 'paid'
        ? 'partial'
        : 'pending';

    // Respuesta visual e interna inmediata al tacto (evita lecturas obsoletas en toques rápidos)
    mobileDesiredStatusRef.current[studentId] = nextStatus;
    setOptimisticMobilePayment(prev => ({ ...prev, [studentId]: nextStatus }));

    const chosenMethod = paymentMethodMap[studentId] || 'cash';
    const fullFee = studentFee > 0 ? studentFee : 10;
    const partialAmount = fullFee > 1 ? Math.round((fullFee / 2) * 100) / 100 : fullFee;
    const activitySnapshot = activeClassActivity;
    const dateSnapshot = sessionDate;

    const prevTask = mobilePaymentQueueRef.current[studentId] || Promise.resolve();
    const nextTask = prevTask
      .catch(() => undefined)
      .then(async () => {
        const actions = paymentActionsRef.current;

        // Inicializar rastreador desde el estado real actual si aún no existe en la cola
        if (mobileLatestPaymentRef.current[studentId] === undefined) {
          const liveExisting = actions.getStudentPaymentStatus(studentId);
          mobileLatestPaymentRef.current[studentId] = liveExisting
            ? {
                id: liveExisting.id,
                status:
                  liveExisting.status === 'paid'
                    ? 'paid'
                    : liveExisting.status === 'partial'
                    ? 'partial'
                    : 'pending'
              }
            : null;
        }

        const tracked = mobileLatestPaymentRef.current[studentId];

        if (nextStatus === 'paid') {
          if (tracked?.id) {
            await actions.updatePayment(tracked.id, {
              amount: fullFee,
              status: 'paid',
              paymentDate: dateSnapshot,
              paymentMethod: chosenMethod,
              notes: actions.t('teacherPortal.messages.classPaymentNote', {
                activity: activitySnapshot.name
              })
            });
            mobileLatestPaymentRef.current[studentId] = { id: tracked.id, status: 'paid' };
          } else {
            const created = await actions.recordClassPayment({
              studentId,
              activityId: activitySnapshot.id,
              amount: fullFee,
              isPartial: false,
              paymentMethod: chosenMethod,
              date: dateSnapshot,
              notes: actions.t('teacherPortal.messages.classPaymentNote', {
                activity: activitySnapshot.name
              })
            });
            if (created) {
              mobileLatestPaymentRef.current[studentId] = { id: created.id, status: 'paid' };
            } else {
              delete mobileDesiredStatusRef.current[studentId];
              delete mobileLatestPaymentRef.current[studentId];
              setClassActionError(actions.t('teacherPortal.messages.paymentSaveError'));
            }
          }
        } else if (nextStatus === 'partial') {
          if (tracked?.id) {
            await actions.updatePayment(tracked.id, {
              amount: partialAmount,
              status: 'partial',
              paymentDate: dateSnapshot,
              paymentMethod: chosenMethod,
              notes: actions.t('teacherPortal.messages.partialPaymentNote', {
                paid: partialAmount,
                total: fullFee,
                activity: activitySnapshot.name
              })
            });
            mobileLatestPaymentRef.current[studentId] = { id: tracked.id, status: 'partial' };
          } else {
            const created = await actions.recordClassPayment({
              studentId,
              activityId: activitySnapshot.id,
              amount: partialAmount,
              isPartial: true,
              paymentMethod: chosenMethod,
              date: dateSnapshot,
              notes: actions.t('teacherPortal.messages.partialPaymentNote', {
                paid: partialAmount,
                total: fullFee,
                activity: activitySnapshot.name
              })
            });
            if (created) {
              mobileLatestPaymentRef.current[studentId] = { id: created.id, status: 'partial' };
            } else {
              delete mobileDesiredStatusRef.current[studentId];
              delete mobileLatestPaymentRef.current[studentId];
              setClassActionError(
                actions.t('teacherPortal.messages.mobilePartialSaveError')
              );
            }
          }
        } else {
          // PEN (Pendiente): eliminar el cobro registrado para dejarlo pendiente
          if (tracked?.id) {
            await actions.deletePayment(tracked.id);
          }
          mobileLatestPaymentRef.current[studentId] = null;
        }
      })
      .finally(() => {
        if (mobilePaymentQueueRef.current[studentId] === nextTask) {
          delete mobileDesiredStatusRef.current[studentId];
          delete mobileLatestPaymentRef.current[studentId];
          setOptimisticMobilePayment(prev => {
            const copy = { ...prev };
            delete copy[studentId];
            return copy;
          });
        }
      });

    mobilePaymentQueueRef.current[studentId] = nextTask;
  };

  // Cobro a todos los presentes que tengan pago pendiente (serializado en la cola por alumno)
  const handleCollectAllPresent = () => {
    if (!activeClassActivity) return;
    setClassActionError(null);
    const activitySnapshot = activeClassActivity;
    const dateSnapshot = sessionDate;

    enrolledStudentsInClass.forEach(student => {
      const effectiveAttendance = attendanceMap[student.id] || 'present';
      const isPresent = effectiveAttendance === 'present' || effectiveAttendance === 'partial';
      if (!isPresent) return;

      const enroll = student.activities.find(a => a.activityId === activitySnapshot.id);
      const fee =
        enroll?.customPrice ??
        (activitySnapshot.billingMode === 'per_class'
          ? activitySnapshot.defaultPricePerClass
          : activitySnapshot.defaultPriceMonthly);
      const fullFee = fee > 0 ? fee : 10;
      const chosenMethod = paymentMethodMap[student.id] || 'cash';

      // Respuesta visual inmediata al tacto y sincronización de estado deseado
      mobileDesiredStatusRef.current[student.id] = 'paid';
      setOptimisticMobilePayment(prev => ({ ...prev, [student.id]: 'paid' }));

      const prevTask = mobilePaymentQueueRef.current[student.id] || Promise.resolve();
      const nextTask = prevTask
        .catch(() => undefined)
        .then(async () => {
          const actions = paymentActionsRef.current;
          if (mobileLatestPaymentRef.current[student.id] === undefined) {
            const livePayment = actions.getStudentPaymentStatus(student.id);
            mobileLatestPaymentRef.current[student.id] = livePayment
              ? {
                  id: livePayment.id,
                  status:
                    livePayment.status === 'paid'
                      ? 'paid'
                      : livePayment.status === 'partial'
                      ? 'partial'
                      : 'pending'
                }
              : null;
          }
          const tracked = mobileLatestPaymentRef.current[student.id];
          const trackedId = tracked?.id;
          const currentStatus = tracked?.status;

          if (trackedId) {
            if (currentStatus !== 'paid') {
              await actions.updatePayment(trackedId, {
                amount: fullFee,
                status: 'paid',
                paymentDate: dateSnapshot,
                paymentMethod: chosenMethod,
                notes:
                  currentStatus === 'partial'
                    ? `Cuota completada (${fullFee}€) en clase de ${activitySnapshot.name}`
                    : `Cobro en clase de ${activitySnapshot.name}`
              });
            }
            mobileLatestPaymentRef.current[student.id] = { id: trackedId, status: 'paid' };
          } else {
            const created = await actions.recordClassPayment({
              studentId: student.id,
              activityId: activitySnapshot.id,
              amount: fullFee,
              isPartial: false,
              paymentMethod: chosenMethod,
              date: dateSnapshot,
              notes: `Cobro en clase de ${activitySnapshot.name}`
            });
            if (created) {
              mobileLatestPaymentRef.current[student.id] = { id: created.id, status: 'paid' };
            } else {
              delete mobileDesiredStatusRef.current[student.id];
              delete mobileLatestPaymentRef.current[student.id];
              setClassActionError('No se pudo registrar el cobro en Supabase.');
            }
          }
        })
        .finally(() => {
          if (mobilePaymentQueueRef.current[student.id] === nextTask) {
            delete mobileDesiredStatusRef.current[student.id];
            delete mobileLatestPaymentRef.current[student.id];
            setOptimisticMobilePayment(prev => {
              const copy = { ...prev };
              delete copy[student.id];
              return copy;
            });
          }
        });

      mobilePaymentQueueRef.current[student.id] = nextTask;
    });
  };

  // Guardar Sesión de Clase Completa y Notas
  const handleSaveClassSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeClassActivity || !currentTeacher?.id) return;

    const attendanceRecords = enrolledStudentsInClass.map(s => {
      const pay = getStudentPaymentStatus(s.id);
      return {
        studentId: s.id,
        studentName: s.name,
        attendance: attendanceMap[s.id] || 'present',
        paid: pay?.status === 'paid' || pay?.status === 'partial',
        paidAmount: pay?.amount,
        paymentMethod: pay?.paymentMethod,
        paymentId: pay?.id
      };
    });

    const attendees = attendanceRecords.filter(r => r.attendance !== 'absent').length;
    const trimmedNotes = sessionTopic.trim();

    isSessionTopicDirtyRef.current = false;
    lastHydratedTopicRef.current = trimmedNotes;
    setSessionTopic(trimmedNotes);

    await addClassSession({
      activityId: activeClassActivity.id,
      teacherId: currentTeacher.id,
      date: sessionDate,
      attendeesCount: attendees,
      durationMinutes: sessionDuration,
      topic: trimmedNotes,
      attendanceRecords
    });

    setSaveSuccessMsg(
      trimmedNotes
        ? t('teacherPortal.messages.sessionAndNotesSaved', { date: sessionDate, count: attendees })
        : t('teacherPortal.messages.sessionSaved', { date: sessionDate, count: attendees })
    );
    setTimeout(() => setSaveSuccessMsg(null), 4000);
  };

  return (
    <div className="space-y-6">
      {/* Banner Principal del Monitor */}
      <div className="rounded-2xl border border-indigo-500/20 bg-gradient-to-r from-indigo-950/30 via-slate-900/50 to-indigo-900/20 p-5 shadow-xs backdrop-blur-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="relative group">
              <img
                src={currentTeacher?.avatar || 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=150&q=80'}
                alt={currentTeacher?.name}
                className="h-14 w-14 rounded-2xl object-cover border-2 border-indigo-500/40 shadow-md group-hover:border-indigo-400 transition"
              />
              <button
                type="button"
                onClick={() => {
                  if (onNavigateToProfile) {
                    onNavigateToProfile();
                  } else {
                    setActiveTab('profile');
                  }
                }}
                title={t('teacherPortal.banner.changeAvatarTooltip')}
                className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full bg-indigo-600 text-white flex items-center justify-center shadow-xs hover:bg-indigo-700 transition"
              >
                <Camera className="h-3.5 w-3.5" />
              </button>
            </div>

            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase font-bold text-indigo-400 tracking-wider">
                  {t('teacherPortal.banner.portalTag')}
                </span>
                <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300 border border-emerald-500/20">
                  {currentTeacher?.collectionType === 'personal'
                    ? t('teacherPortal.banner.collectionPersonal')
                    : t('teacherPortal.banner.collectionAssociation')}
                </span>
              </div>
              <h2 className="text-lg font-black text-slate-900 dark:text-white">
                {t('teacherPortal.banner.greeting', { name: currentTeacher?.name || '' })}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t('teacherPortal.banner.summaryStats', {
                  activities: myActivities.length,
                  students: myStudents.length
                })}
              </p>
            </div>
          </div>

          {/* Selector de Monitor (solo Administrador para testing de perspectiva) */}
          {currentRole === 'admin' && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                {t('teacherPortal.banner.teacherSelectorLabel')}
              </span>
              <select
                value={currentTeacherId}
                onChange={e => setCurrentTeacherId(e.target.value)}
                className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-bold text-slate-800 dark:text-slate-200 focus:outline-indigo-500"
              >
                {teachers.map(teacherItem => (
                  <option key={teacherItem.id} value={teacherItem.id}>
                    {teacherItem.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Banner de solicitudes de inscripción pendientes en los talleres del monitor */}
      {myPendingRequests.length > 0 && (
        <div className="rounded-2xl border border-amber-500/35 bg-amber-50/80 dark:bg-amber-950/25 p-4 shadow-xs space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
              <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
              <span>{t('teacherPortal.pendingBanner.title', { count: myPendingRequests.length })}</span>
            </span>
          </div>
          {portalRequestError && (
            <p className="text-xs font-semibold text-rose-600 dark:text-rose-400">{portalRequestError}</p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {myPendingRequests.map(req => {
              const cKey = `c:${req.studentId}:${req.activityId}`;
              const rKey = `r:${req.studentId}:${req.activityId}`;
              const isBusy = portalRequestBusyKey === cKey || portalRequestBusyKey === rKey;
              return (
                <div
                  key={`${req.studentId}-${req.activityId}`}
                  className="flex items-center justify-between gap-2 rounded-xl bg-white dark:bg-slate-900 px-3 py-2 border border-amber-500/20 text-xs"
                >
                  <div className="min-w-0 flex-1">
                    <span className="font-bold text-slate-900 dark:text-white truncate block">
                      {req.studentName}
                    </span>
                    <span className="text-[11px] text-indigo-600 dark:text-indigo-400 font-semibold truncate block">
                      {req.activityName}
                      {req.contact ? ` · ${req.contact}` : ''}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={async () => {
                        setPortalRequestBusyKey(cKey);
                        setPortalRequestError(null);
                        try {
                          const res = await confirmActivityEnrollment(req.studentId, req.activityId);
                          if (!res.success && res.error) setPortalRequestError(res.error);
                        } finally {
                          setPortalRequestBusyKey(null);
                        }
                      }}
                      className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-emerald-700 transition disabled:opacity-50"
                    >
                      <Check className="h-3 w-3" />
                      <span>{portalRequestBusyKey === cKey ? '...' : t('teacherPortal.pendingBanner.confirm')}</span>
                    </button>
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={async () => {
                        setPortalRequestBusyKey(rKey);
                        setPortalRequestError(null);
                        try {
                          const res = await rejectActivityEnrollment(req.studentId, req.activityId);
                          if (!res.success && res.error) setPortalRequestError(res.error);
                        } finally {
                          setPortalRequestBusyKey(null);
                        }
                      }}
                      title={t('teacherPortal.pendingBanner.rejectTooltip')}
                      aria-label={t('teacherPortal.pendingBanner.rejectAria', { student: req.studentName })}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition disabled:opacity-50"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Pestañas de Navegación Interna del Portal (ocultas en rol Monitor puro porque usa barra principal) */}
      {currentRole !== 'teacher' && (
        <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2 overflow-x-auto no-scrollbar">
          <button
            onClick={() => setActiveTab('class_control')}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition min-h-[44px] shrink-0 ${
              activeTab === 'class_control'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
            }`}
          >
            <Calendar className="h-4 w-4" />
            <span>{t('teacherPortal.tabs.classControl')}</span>
            <span className="rounded-full bg-emerald-400 text-slate-950 px-1.5 py-0.2 text-[9px] font-black uppercase">
              {t('teacherPortal.tabs.liveBadge')}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('workshops')}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition min-h-[44px] shrink-0 ${
              activeTab === 'workshops'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
            }`}
          >
            <Sparkles className="h-4 w-4" />
            <span>{t('teacherPortal.tabs.workshops', { count: myActivities.length })}</span>
          </button>

          <button
            onClick={() => setActiveTab('payout')}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition min-h-[44px] shrink-0 ${
              activeTab === 'payout'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
            }`}
          >
            <DollarSign className="h-4 w-4" />
            <span>{t('teacherPortal.tabs.payout', { period: selectedPeriod })}</span>
          </button>

          <button
            onClick={() => {
              if (onNavigateToProfile) {
                onNavigateToProfile();
              } else {
                setActiveTab('profile');
              }
            }}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition min-h-[44px] shrink-0 ${
              activeTab === 'profile'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
            }`}
          >
            <Camera className="h-4 w-4" />
            <span>{t('teacherPortal.tabs.profile')}</span>
          </button>
        </div>
      )}

      {/* =========================================================================
          PESTAÑA 1: CONTROL DE ASISTENCIA Y COBROS EN CLASE (HERRAMIENTA CLAVE)
          ========================================================================= */}
      {(currentRole === 'teacher' || activeTab === 'class_control') && (
        <div className="space-y-5">
          {/* Barra de Selección de Clase */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs space-y-3">
            <div className="space-y-3">
              {/* Fila 1: Desplegable de Taller a ancho completo */}
              <div>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <label className="block text-[11px] font-bold uppercase text-slate-500 dark:text-slate-400 truncate">
                    {t('teacherPortal.classControl.selectWorkshopLabel')}
                  </label>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {autoDetectedMatch &&
                      autoDetectedMatch.matchType !== 'fallback' &&
                      activeClassActivity?.id === autoDetectedMatch.activity.id && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
                          <Clock className="h-3 w-3" />
                          {autoDetectedMatch.matchType === 'live'
                            ? t('teacherPortal.classControl.autoMatchLive')
                            : autoDetectedMatch.matchType === 'upcoming_today'
                            ? t('teacherPortal.classControl.autoMatchUpcomingToday')
                            : t('teacherPortal.classControl.autoMatchEarlierToday')}
                        </span>
                      )}

                    {activeClassActivity && (
                      <button
                        type="button"
                        onClick={() => setIsWorkshopInfoOpen(prev => !prev)}
                        aria-expanded={isWorkshopInfoOpen}
                        aria-label={
                          isWorkshopInfoOpen
                            ? t('teacherPortal.classControl.hideWorkshopInfoAria')
                            : t('teacherPortal.classControl.showWorkshopInfoAria')
                        }
                        title={
                          isWorkshopInfoOpen
                            ? t('teacherPortal.classControl.hideWorkshopInfoTooltip')
                            : t('teacherPortal.classControl.showWorkshopInfoTooltip')
                        }
                        className={`inline-flex items-center justify-center h-5 w-5 rounded-full transition touch-manipulation active:scale-95 ${
                          isWorkshopInfoOpen
                            ? 'bg-indigo-600 text-white shadow-xs'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-indigo-50 hover:text-indigo-600 dark:hover:bg-indigo-950/50 dark:hover:text-indigo-300'
                        }`}
                      >
                        <Info className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>              
                {/*<div className="flex items-center justify-between gap-2 mb-1">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <label className="block text-[11px] font-bold uppercase text-slate-500 dark:text-slate-400">
                      Seleccionar Taller / Clase *
                    </label>
                    {activeClassActivity && (
                      <button
                        type="button"
                        onClick={() => setIsWorkshopInfoOpen(prev => !prev)}
                        aria-expanded={isWorkshopInfoOpen}
                        aria-label={
                          isWorkshopInfoOpen
                            ? 'Ocultar información del taller'
                            : 'Ver información del taller'
                        }
                        title={
                          isWorkshopInfoOpen
                            ? 'Ocultar detalles del taller'
                            : 'Ver modalidad, tarifa, sala y Bizum'
                        }
                        className={`inline-flex items-center justify-center h-5 w-5 rounded-full transition touch-manipulation active:scale-95 ${
                          isWorkshopInfoOpen
                            ? 'bg-indigo-600 text-white shadow-xs'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-indigo-50 hover:text-indigo-600 dark:hover:bg-indigo-950/50 dark:hover:text-indigo-300'
                        }`}
                      >
                        <Info className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  {autoDetectedMatch &&
                    autoDetectedMatch.matchType !== 'fallback' &&
                    activeClassActivity?.id === autoDetectedMatch.activity.id && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-300 shrink-0">
                        <Clock className="h-3 w-3" />
                        {autoDetectedMatch.matchType === 'live'
                          ? 'En horario actual'
                          : autoDetectedMatch.matchType === 'upcoming_today'
                          ? 'Próxima clase hoy'
                          : 'Clase de hoy'}
                      </span>
                    )}
                </div>*/}
                {myActivities.length === 0 ? (
                  <p className="text-xs text-rose-500">{t('teacherPortal.classControl.noAssignedWorkshops')}</p>
                ) : (
                  <select
                    value={activeClassActivity?.id || ''}
                    onChange={e => {
                      manualClassChoiceRef.current = true;
                      setSelectedClassActivityId(e.target.value);
                    }}
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs font-bold text-slate-900 dark:text-white focus:outline-indigo-500 min-h-[40px]"
                  >
                    {myActivities.map(a => (
                      <option key={a.id} value={a.id}>
                        {a.billingMode === 'per_class'
                          ? t('teacherPortal.classControl.optionPerClass', { name: a.name, price: a.defaultPricePerClass })
                          : t('teacherPortal.classControl.optionMonthly', { name: a.name, price: a.defaultPriceMonthly })}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Fila 2: Fecha de la Clase y botón + Inscribir Alumno en paralelo */}
              <div className={`grid gap-2.5 sm:gap-3 items-end ${onOpenEnrollStudent ? 'grid-cols-2' : 'grid-cols-1'}`}>
                <div className="min-w-0">
                  <label className="block text-[11px] font-bold uppercase text-slate-500 dark:text-slate-400 mb-1 truncate">
                    {t('teacherPortal.classControl.classDateLabel')}
                  </label>
                  <input
                    type="date"
                    value={sessionDate}
                    onChange={e => setSessionDate(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 sm:px-3 py-2 text-xs font-semibold text-slate-900 dark:text-white focus:outline-indigo-500 min-h-[40px]"
                  />
                </div>

                {onOpenEnrollStudent && (
                  <button
                    type="button"
                    onClick={() => onOpenEnrollStudent(activeClassActivity?.id)}
                    title={t('teacherPortal.classControl.enrollInClassButton')}
                    className="w-full min-w-0 inline-flex items-center justify-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-50/50 dark:bg-emerald-950/20 px-2.5 sm:px-3.5 py-2 text-[11px] sm:text-xs font-bold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 transition min-h-[40px]"
                  >
                    <UserPlus className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
                    <span className="truncate">{t('teacherPortal.classControl.enrollInClassButton')}</span>
                  </button>
                )}
              </div>
            </div>

            {/* Ficha informativa del Taller seleccionado (desplegable con el icono Info) */}
            {activeClassActivity && isWorkshopInfoOpen && (
              <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-md bg-indigo-500/10 px-2.5 py-1 text-xs font-bold text-indigo-700 dark:text-indigo-300">
                    {activeClassActivity.billingMode === 'per_class'
                      ? t('teacherPortal.classControl.modalityPerClass')
                      : t('teacherPortal.classControl.modalityMonthly')}
                  </span>
                  <span className="font-semibold">
                    {t('teacherPortal.classControl.baseFeeLabel')}{' '}
                    <strong>
                      {activeClassActivity.billingMode === 'per_class'
                        ? t('teacherPortal.classControl.baseFeePerClass', { price: activeClassActivity.defaultPricePerClass })
                        : t('teacherPortal.classControl.baseFeeMonthly', { price: activeClassActivity.defaultPriceMonthly })}
                    </strong>
                  </span>
                  <span>·</span>
                  <span>{t('teacherPortal.classControl.roomValue', { room: activeClassActivity.room })}</span>
                </div>

                {activeClassActivity.bizum_enabled && activeClassActivity.bizum_phone && (
                  <div className="flex items-center gap-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-1 text-xs font-bold text-emerald-700 dark:text-emerald-300 border border-emerald-500/20">
                    <Smartphone className="h-3.5 w-3.5" />
                    <span>
                      {t('teacherPortal.classControl.bizumAvailable', {
                        phone: activeClassActivity.bizum_phone,
                        concept: activeClassActivity.bizum_concept || activeClassActivity.name
                      })}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Contenedor: Alumnos inscritos en este taller (lista de alumnos + notas expandidas por defecto) */}
          <div className="bg-slate-100/70 dark:bg-slate-800/50 p-3 sm:p-4 rounded-2xl border border-slate-200 dark:border-slate-700/60 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-300">
                <Users className="h-4 w-4 text-indigo-500 shrink-0" />
                <span>{t('teacherPortal.classControl.enrolledStudentsHeader', { count: enrolledStudentsInClass.length })}</span>
              </div>

              {/*<div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={markAllPresent}
                  className="w-full sm:w-auto rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-bold text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition min-h-[38px] active:scale-95 text-center"
                >
                  ✓ Marcar Todos Presentes
                </button>

                <button
                  type="button"
                  onClick={handleCollectAllPresent}
                  className="w-full sm:w-auto rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-emerald-700 transition shadow-xs min-h-[38px] active:scale-95 text-center"
                >
                  💰 Cobrar Cuota a Todos los Presentes
                </button>
              </div>*/}
            </div>

            {/* Mensaje de Confirmación o Error tras Guardar */}
            {saveSuccessMsg && (
              <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-500/30 p-3 text-xs font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                <span>{saveSuccessMsg}</span>
              </div>
            )}

            {classActionError && (
              <div className="rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-500/30 p-3 text-xs font-bold text-rose-800 dark:text-rose-300 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
                <span>{classActionError}</span>
              </div>
            )}

            {/* Lista de Alumnos para Asistencia & Cobro */}
            <div className="space-y-1.5 md:space-y-3">
              {enrolledStudentsInClass.length === 0 ? (
                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center text-xs text-slate-400">
                  <Users className="h-8 w-8 mx-auto mb-2 text-slate-300 dark:text-slate-600" />
                  <p className="font-bold text-slate-600 dark:text-slate-300">
                    {t('teacherPortal.classControl.noEnrolledTitle')}
                  </p>
                  <p className="mt-1">{t('teacherPortal.classControl.noEnrolledHint')}</p>
                </div>
              ) : (
              <>
                {/* Cabecera compacta solo para móvil con acciones rápidas colectivas */}
                <div className="md:hidden flex items-center justify-between px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  <span>{t('teacherPortal.classControl.mobileStudentHeader', { count: enrolledStudentsInClass.length })}</span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={markAllPresent}
                      title={t('teacherPortal.classControl.markAllPresentTitle')}
                      aria-label={t('teacherPortal.classControl.markAllPresentTitle')}
                      className="h-7 w-[42px] rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-[10px] font-extrabold uppercase tracking-tight text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 active:scale-95 transition flex items-center justify-center touch-manipulation"
                    >
                      {t('teacherPortal.classControl.markAllPresentShort')}
                    </button>
                    <button
                      type="button"
                      onClick={handleCollectAllPresent}
                      title={t('teacherPortal.classControl.collectAllPresentTitle')}
                      aria-label={t('teacherPortal.classControl.collectAllPresentTitle')}
                      className="h-7 w-[52px] rounded-lg bg-emerald-600 text-[10px] font-extrabold uppercase tracking-tight text-white hover:bg-emerald-700 active:scale-95 transition shadow-xs flex items-center justify-center touch-manipulation"
                    >
                      {t('teacherPortal.classControl.collectAllPresentShort')}
                    </button>
                  </div>
                </div>

                {enrolledStudentsInClass.map(student => {
                  const enrollment = student.activities.find(a => a.activityId === activeClassActivity.id);
                  const standardFee = activeClassActivity.billingMode === 'per_class'
                    ? activeClassActivity.defaultPricePerClass
                    : activeClassActivity.defaultPriceMonthly;
                  const studentFee = enrollment?.customPrice ?? standardFee;

                  const payment = getStudentPaymentStatus(student.id);
                  const isPaid = payment?.status === 'paid';
                  const isPartialPaid = payment?.status === 'partial';
                  const remainingFee = isPartialPaid && payment ? Math.max(0, studentFee - payment.amount) : studentFee;
                  const currentAttendance = attendanceMap[student.id] || 'present';
                  const isAbsent = currentAttendance === 'absent';

                  const mobilePaymentState: 'paid' | 'partial' | 'pending' =
                    optimisticMobilePayment[student.id] ||
                    (isPaid ? 'paid' : isPartialPaid ? 'partial' : 'pending');

                  const isPartialOpen = partialInputOpen[student.id] || false;
                  const partialAmt = partialAmountMap[student.id] ?? Math.round(studentFee / 2);
                  const selectedMethod = paymentMethodMap[student.id] || 'cash';

                  return (
                    <React.Fragment key={student.id}>
                      {/* MÓVIL (< md): Fila horizontal de 1 sola línea con nombre truncado y controles táctiles P/A + P/CP/PEN */}
                      <div
                        className={`md:hidden flex items-center justify-between gap-2 rounded-xl border px-2.5 py-1.5 shadow-xs transition-colors ${
                          isAbsent
                            ? 'border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 opacity-75'
                            : mobilePaymentState === 'paid'
                            ? 'border-emerald-500/35 bg-emerald-50/30 dark:bg-emerald-950/15'
                            : mobilePaymentState === 'partial'
                            ? 'border-amber-500/40 bg-amber-50/30 dark:bg-amber-950/15'
                            : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
                        }`}
                      >
                        <div className="min-w-0 flex-1 flex items-center gap-2">
                          {/*<span
                            className={`h-7 w-7 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 ${
                              isAbsent
                                ? 'bg-slate-200 dark:bg-slate-800 text-slate-500'
                                : 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400'
                            }`}
                          >
                            {student.name.charAt(0).toUpperCase()}
                          </span>*/}
                          <span
                            className={`text-xs font-bold truncate ${
                              isAbsent
                                ? 'line-through text-slate-400 dark:text-slate-500'
                                : 'text-slate-900 dark:text-white'
                            }`}
                          >
                            {student.name}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {/* Botón táctil Asistencia: P <-> A */}
                          <button
                            type="button"
                            onClick={() => toggleMobileAttendance(student.id)}
                            aria-label={t('teacherPortal.classControl.attendanceAria', {
                              student: student.name,
                              status: isAbsent
                                ? t('teacherPortal.classControl.attendanceAbsentFull')
                                : t('teacherPortal.classControl.attendancePresentFull')
                            })}
                            className={`h-8 w-[42px] rounded-lg text-xs font-black tracking-wide transition active:scale-90 touch-manipulation select-none flex items-center justify-center border ${
                              isAbsent
                                ? 'bg-rose-500 text-white border-rose-500 shadow-xs'
                                : 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                            }`}
                          >
                            {isAbsent
                              ? t('teacherPortal.classControl.shortAbsent')
                              : t('teacherPortal.classControl.shortPresent')}
                          </button>

                          {/* Botón táctil Pago cíclico: P -> CP -> PEN */}
                          <button
                            type="button"
                            onClick={() => handleCycleMobilePayment(student.id, studentFee)}
                            aria-label={t('teacherPortal.classControl.paymentAria', {
                              student: student.name,
                              status:
                                mobilePaymentState === 'paid'
                                  ? t('teacherPortal.classControl.paymentPaidFull')
                                  : mobilePaymentState === 'partial'
                                  ? t('teacherPortal.classControl.paymentPartialFull')
                                  : t('teacherPortal.classControl.paymentPendingFull')
                            })}
                            className={`h-8 w-[52px] rounded-lg text-xs font-black tracking-wide transition active:scale-90 touch-manipulation select-none flex items-center justify-center border ${
                              mobilePaymentState === 'paid'
                                ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/45'
                                : mobilePaymentState === 'partial'
                                ? 'bg-amber-500/20 text-amber-800 dark:text-amber-300 border-amber-500/50'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-700'
                            }`}
                          >
                            {mobilePaymentState === 'paid'
                              ? t('teacherPortal.classControl.shortPaid')
                              : mobilePaymentState === 'partial'
                              ? t('teacherPortal.classControl.shortPartial')
                              : t('teacherPortal.classControl.shortPending')}
                          </button>
                        </div>
                      </div>

                      {/* ESCRITORIO / TABLET (>= md): Tarjeta completa */}
                      <div
                        className={`hidden md:block rounded-2xl border p-4 shadow-xs transition-colors ${
                          isAbsent
                            ? 'border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40 opacity-75'
                            : isPaid
                            ? 'border-emerald-500/30 bg-emerald-50/20 dark:bg-emerald-950/10'
                            : isPartialPaid
                            ? 'border-amber-500/40 bg-amber-50/20 dark:bg-amber-950/10'
                            : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
                        }`}
                      >
                        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3.5">
                      {/* BOTONES DE ASISTENCIA Y PAGO A LA IZQUIERDA DE LOS ALUMNOS */}
                      <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                        {/* Control 1: Selector de Asistencia */}
                        <div className="inline-flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl shrink-0">
                          <button
                            type="button"
                            onClick={() => setStudentAttendance(student.id, 'present')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition min-h-[38px] active:scale-95 ${
                              currentAttendance === 'present'
                                ? 'bg-emerald-600 text-white shadow-xs'
                                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                            }`}
                          >
                            {t('teacherPortal.classControl.presentButton')}
                          </button>
                          <button
                            type="button"
                            onClick={() => setStudentAttendance(student.id, 'partial')}
                            className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition min-h-[38px] active:scale-95 ${
                              currentAttendance === 'partial'
                                ? 'bg-amber-500 text-white shadow-xs'
                                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                            }`}
                          >
                            {t('teacherPortal.classControl.partialButton')}
                          </button>
                          <button
                            type="button"
                            onClick={() => setStudentAttendance(student.id, 'absent')}
                            className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition min-h-[38px] active:scale-95 ${
                              currentAttendance === 'absent'
                                ? 'bg-rose-500 text-white shadow-xs'
                                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                            }`}
                          >
                            {t('teacherPortal.classControl.absentButton')}
                          </button>
                        </div>

                        {/* Control 2: Estado de Cobro y Botones de Pago */}
                        <div className="flex items-center gap-2 shrink-0">
                          {isPaid && payment ? (
                            <div className="flex flex-wrap items-center gap-1.5">
                              <div className="flex items-center gap-2 rounded-xl bg-emerald-500/10 px-3 py-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-300 border border-emerald-500/20 min-h-[38px]">
                                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                                <div className="text-left">
                                  <span>{t('teacherPortal.classControl.paidStatusLabel', { amount: payment.amount.toFixed(2) })}</span>
                                  <span className="block text-[10px] text-slate-500 dark:text-slate-400 font-normal">
                                    {payment.paymentMethod === 'cash'
                                      ? t('teacherPortal.classControl.cashMethodLabel')
                                      : payment.paymentMethod}{' '}
                                    · {payment.paymentDate}
                                  </span>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() =>
                                  setConfirmDialog({
                                    type: 'delete_payment',
                                    paymentId: payment.id,
                                    studentName: student.name,
                                    amount: payment.amount
                                  })
                                }
                                title={t('teacherPortal.classControl.unmarkPaymentTooltip')}
                                className="inline-flex items-center gap-1 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50/70 dark:bg-rose-950/20 px-2.5 py-2 text-[11px] font-bold text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-950/50 transition min-h-[38px] active:scale-95 touch-manipulation whitespace-nowrap"
                              >
                                <RotateCcw className="h-3.5 w-3.5 shrink-0" />
                                <span>{t('teacherPortal.classControl.unmark')}</span>
                              </button>
                            </div>
                          ) : isPartialPaid && payment ? (
                            <div className="flex flex-wrap items-center gap-1.5">
                              <div className="flex items-center gap-2 rounded-xl bg-amber-500/15 px-3 py-1.5 text-xs font-bold text-amber-800 dark:text-amber-300 border border-amber-500/30 min-h-[38px]">
                                <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
                                <div className="text-left">
                                  <span>
                                    {t('teacherPortal.classControl.partialPaidLabel', { amount: payment.amount.toFixed(2) })}
                                    {remainingFee > 0
                                      ? t('teacherPortal.classControl.partialRemainingSuffix', { amount: remainingFee.toFixed(2) })
                                      : ''}
                                  </span>
                                  <span className="block text-[10px] text-amber-700/80 dark:text-amber-300/80 font-normal">
                                    {payment.paymentMethod === 'cash'
                                      ? t('teacherPortal.classControl.cashMethodLabel')
                                      : payment.paymentMethod}{' '}
                                    · {payment.paymentDate}
                                  </span>
                                </div>
                              </div>
                              {remainingFee > 0 && (
                                <button
                                  type="button"
                                  onClick={() => handleCompletePartialPayment(payment.id, studentFee)}
                                  className="inline-flex items-center gap-1 rounded-xl bg-emerald-600 px-2.5 py-2 text-[11px] font-bold text-white hover:bg-emerald-700 transition min-h-[38px] active:scale-95 touch-manipulation whitespace-nowrap"
                                >
                                  <Banknote className="h-3.5 w-3.5 shrink-0" />
                                  <span>{t('teacherPortal.classControl.completePaymentButton', { amount: remainingFee.toFixed(2) })}</span>
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() =>
                                  setConfirmDialog({
                                    type: 'delete_payment',
                                    paymentId: payment.id,
                                    studentName: student.name,
                                    amount: payment.amount
                                  })
                                }
                                title={t('teacherPortal.classControl.unmarkPartialTooltip')}
                                className="inline-flex items-center gap-1 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50/70 dark:bg-rose-950/20 px-2.5 py-2 text-[11px] font-bold text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-950/50 transition min-h-[38px] active:scale-95 touch-manipulation whitespace-nowrap"
                              >
                                <RotateCcw className="h-3.5 w-3.5 shrink-0" />
                                <span>{t('teacherPortal.classControl.unmark')}</span>
                              </button>
                            </div>
                          ) : (
                            <div className="flex flex-wrap items-center gap-1.5">
                              {/* Botón Cobro Completo de 1 toque */}
                              <button
                                type="button"
                                onClick={() => handleCollectPayment(student.id, studentFee, false)}
                                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-emerald-700 transition shadow-xs min-h-[38px] active:scale-95 touch-manipulation"
                              >
                                <Banknote className="h-4 w-4 shrink-0" />
                                <span>{t('teacherPortal.classControl.collectAmountButton', { amount: studentFee })}</span>
                              </button>

                              {/* Botón Cobro Parcial */}
                              <button
                                type="button"
                                onClick={() =>
                                  setPartialInputOpen(prev => ({
                                    ...prev,
                                    [student.id]: !prev[student.id]
                                  }))
                                }
                                className="rounded-xl border border-slate-300 dark:border-slate-700 px-2.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition min-h-[38px] active:scale-95 touch-manipulation"
                              >
                                <span>{t('teacherPortal.classControl.partialEllipsis')}</span>
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* INFORMACIÓN DEL ALUMNO A LA DERECHA DE LOS BOTONES */}
                      <div className="flex items-center justify-between gap-3 min-w-0 lg:ml-auto">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="h-10 w-10 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold text-base shrink-0">
                            {student.name.charAt(0)}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="font-bold text-slate-900 dark:text-white text-sm truncate">
                                {student.name}
                              </h4>
                              {enrollment?.customPrice !== undefined && (
                                <span className="rounded-md bg-amber-500/10 text-amber-700 dark:text-amber-300 text-[10px] font-bold px-1.5 py-0.5 border border-amber-500/20 whitespace-nowrap">
                                  {t('teacherPortal.classControl.specialFeeBadge', { fee: studentFee })}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                              <span className="text-[11px] truncate">{student.phone}</span>
                              {student.phone && (
                                <a
                                  href={`https://wa.me/${student.phone.replace(/[^0-9]/g, '')}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 hover:underline shrink-0"
                                >
                                  <MessageCircle className="h-3 w-3" />
                                  <span>{t('teacherPortal.classControl.whatsapp')}</span>
                                </a>
                              )}
                            </div>
                          </div>
                        </div>

                        {activeClassActivity && (
                          <button
                            type="button"
                            onClick={() =>
                              setConfirmDialog({
                                type: 'remove_student',
                                studentId: student.id,
                                studentName: student.name,
                                activityId: activeClassActivity.id,
                                activityName: activeClassActivity.name
                              })
                            }
                            title={t('teacherPortal.classControl.removeFromWorkshopTooltip', { student: student.name })}
                            className="inline-flex items-center gap-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 py-1.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400 hover:border-rose-300 hover:text-rose-600 dark:hover:text-rose-400 transition shrink-0 whitespace-nowrap"
                          >
                            <UserMinus className="h-3.5 w-3.5" />
                            <span>{t('teacherPortal.classControl.remove')}</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Desplegable para Cobro Parcial / Método */}
                    {!isPaid && !isPartialPaid && isPartialOpen && (
                      <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 p-3 rounded-xl flex flex-wrap items-center gap-3">
                        <div className="flex items-center gap-2">
                          <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                            {t('teacherPortal.classControl.deliveredAmountLabel')}
                          </label>
                          <div className="relative">
                            <input
                              type="number"
                              step="0.5"
                              min="0.5"
                              max={studentFee > 0 ? studentFee : undefined}
                              value={partialAmt}
                              onChange={e =>
                                setPartialAmountMap(prev => ({
                                  ...prev,
                                  [student.id]: Number(e.target.value)
                                }))
                              }
                              className="w-24 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-xs font-black text-right pr-6 min-h-[36px]"
                            />
                            <span className="absolute right-2 top-2 text-xs font-bold text-slate-400">€</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                            {t('teacherPortal.classControl.viaLabel')}
                          </label>
                          <select
                            value={selectedMethod}
                            onChange={e =>
                              setPaymentMethodMap(prev => ({
                                ...prev,
                                [student.id]: e.target.value as PaymentMethod
                              }))
                            }
                            className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs font-semibold min-h-[36px]"
                          >
                            <option value="cash">{t('teacherPortal.classControl.methodCash')}</option>
                            <option value="bizum">{t('teacherPortal.classControl.methodBizum')}</option>
                            <option value="transfer">{t('teacherPortal.classControl.methodTransfer')}</option>
                          </select>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleCollectPayment(student.id, studentFee, true)}
                          className="rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 transition min-h-[36px] active:scale-95 touch-manipulation"
                        >
                          {t('teacherPortal.classControl.confirmPartialPayment', { amount: partialAmt })}
                        </button>
                      </div>
                    )}
                      </div>
                    </React.Fragment>
                  );
                })}
                </>
              )}
            </div>

            {/* Notas de la Clase/Taller + Botón Guardar con texto */}
            {enrolledStudentsInClass.length > 0 && (
              <form
                onSubmit={handleSaveClassSession}
                className="flex items-center gap-2 pt-1"
              >
                <input
                  type="text"
                  placeholder={t('teacherPortal.classControl.sessionNotesPlaceholder')}
                  value={sessionTopic}
                  onChange={e => {
                    isSessionTopicDirtyRef.current = true;
                    setSessionTopic(e.target.value);
                  }}
                  className="flex-1 min-w-0 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-indigo-500 min-h-[40px] shadow-xs"
                />
                <button
                  type="submit"
                  className="inline-flex items-center justify-center rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700 shadow-xs transition min-h-[40px] shrink-0 active:scale-95 touch-manipulation"
                >
                  {t('teacherPortal.classControl.save')}
                </button>
              </form>
            )}
          </div>

          <NewsCarouselSection compact />
        </div>
      )}

      {/* =========================================================================
          PESTAÑA 2: MIS TALLERES & GESTIÓN DE ALUMNOS (PERMISOS COMPLETOS)
          ========================================================================= */}
      {currentRole !== 'teacher' && activeTab === 'workshops' && (
        <TeacherWorkshopsSection
          onOpenAddActivity={onOpenAddActivity}
          onOpenAddStudent={onOpenAddStudent}
          onOpenEnrollStudent={onOpenEnrollStudent}
        />
      )}

      {/* =========================================================================
          PESTAÑA 3: LIQUIDACIÓN Y FINANZAS DEL MONITOR
          ========================================================================= */}
      {activeTab === 'payout' && (
        <div className="space-y-5">
          {/* Tarjetas KPI de Liquidación */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs">
              <span className="text-xs font-semibold uppercase text-slate-400 tracking-wider">
                {t('teacherPortal.payoutTab.totalDueTitle')}
              </span>
              <div className="mt-2">
                <span className="text-2xl font-black text-slate-900 dark:text-white">
                  {teacherSummary?.calculatedDue.toFixed(2)} €
                </span>
                <p className="text-xs text-indigo-500 font-medium mt-0.5">
                  {currentTeacher?.paymentScheme === 'per_class' &&
                    t('teacherPortal.payoutTab.schemePerClass', { rate: currentTeacher.ratePerClass ?? 0 })}
                  {currentTeacher?.paymentScheme === 'monthly_fixed' &&
                    t('teacherPortal.payoutTab.schemeMonthlyFixed', { rate: currentTeacher.fixedMonthlyRate ?? 0 })}
                  {currentTeacher?.paymentScheme === 'revenue_share' &&
                    t('teacherPortal.payoutTab.schemeRevenueShare', { percent: currentTeacher.revenueSharePercent ?? 0 })}
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs">
              <span className="text-xs font-semibold uppercase text-slate-400 tracking-wider">
                {t('teacherPortal.payoutTab.collectedInHandTitle')}
              </span>
              <div className="mt-2">
                <span className="text-2xl font-black text-amber-600 dark:text-amber-400">
                  {teacherSummary?.collectedInHand.toFixed(2)} €
                </span>
                <p className="text-xs text-slate-500 mt-0.5">
                  {t('teacherPortal.payoutTab.collectedInHandSubtitle')}
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs">
              <span className="text-xs font-semibold uppercase text-slate-400 tracking-wider">
                {t('teacherPortal.payoutTab.transferredTitle')}
              </span>
              <div className="mt-2">
                <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
                  {teacherSummary?.alreadySettled.toFixed(2)} €
                </span>
                <p className="text-xs text-emerald-500 mt-0.5">
                  {t('teacherPortal.payoutTab.transferredSubtitle')}
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-50/40 dark:bg-emerald-950/20 p-4 shadow-xs">
              <span className="text-xs font-semibold uppercase text-emerald-800 dark:text-emerald-300 tracking-wider">
                {t('teacherPortal.payoutTab.balanceToPayTitle')}
              </span>
              <div className="mt-2">
                <span className="text-2xl font-black text-emerald-700 dark:text-emerald-400">
                  {teacherSummary?.balanceToPay.toFixed(2)} €
                </span>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {teacherSummary?.balanceToPay === 0
                    ? t('teacherPortal.payoutTab.balanceSettled')
                    : t('teacherPortal.payoutTab.balancePending')}
                </p>
              </div>
            </div>
          </div>

          {/* Historial de Sesiones Registradas este mes */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-3">
              {t('teacherPortal.payoutTab.recordedClassesTitle', { period: selectedPeriod })}
            </h3>
            <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              {sessions
                .filter(s => s.teacherId === currentTeacher?.id && s.date.startsWith(selectedPeriod))
                .map(ses => {
                  const act = activities.find(a => a.id === ses.activityId);
                  return (
                    <div key={ses.id} className="py-2.5 flex items-center justify-between">
                      <div>
                        <span className="font-bold text-slate-900 dark:text-white block">
                          {act?.name || t('teacherPortal.payoutTab.defaultClassLabel')} · {ses.date}
                        </span>
                        <span className="text-slate-400 text-[11px]">
                          {ses.topic || t('teacherPortal.payoutTab.noTopic')} ·{' '}
                          {t('teacherPortal.payoutTab.durationUnit', { minutes: ses.durationMinutes })}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="font-bold text-emerald-600 dark:text-emerald-400">
                          {t('teacherPortal.payoutTab.attendeesCount', { count: ses.attendeesCount })}
                        </span>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          PESTAÑA 4: PERFIL UNIVERSAL (Datos Personales y Preferencias Personales y Seguridad)
          ========================================================================= */}
      {activeTab === 'profile' && <ProfileView />}

      {/* Modal de Confirmación para desmarcar pago o quitar alumno de un taller */}
      {confirmDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-2xl space-y-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400 shrink-0">
                {confirmDialog.type === 'delete_payment' ? (
                  <Trash2 className="h-5 w-5" />
                ) : (
                  <UserMinus className="h-5 w-5" />
                )}
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                  {confirmDialog.type === 'delete_payment'
                    ? t('teacherPortal.confirmDialog.deletePaymentTitle')
                    : t('teacherPortal.confirmDialog.removeStudentTitle')}
                </h4>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  {confirmDialog.type === 'delete_payment' ? (
                    <>
                      {t('teacherPortal.confirmDialog.deletePaymentPrefix')}
                      <strong>{confirmDialog.studentName}</strong>
                      {t('teacherPortal.confirmDialog.deletePaymentMiddle')}
                      <strong>{confirmDialog.amount.toFixed(2)} €</strong>
                      {t('teacherPortal.confirmDialog.deletePaymentSuffix')}
                    </>
                  ) : (
                    <>
                      {t('teacherPortal.confirmDialog.removeStudentPrefix')}
                      <strong>{confirmDialog.studentName}</strong>
                      {t('teacherPortal.confirmDialog.removeStudentMiddle')}
                      <strong>{confirmDialog.activityName}</strong>
                      {t('teacherPortal.confirmDialog.removeStudentSuffix')}
                    </>
                  )}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                disabled={isConfirmBusy}
                onClick={() => setConfirmDialog(null)}
                className="rounded-xl border border-slate-300 dark:border-slate-700 px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              >
                {t('teacherPortal.confirmDialog.cancel')}
              </button>
              <button
                type="button"
                disabled={isConfirmBusy}
                onClick={handleConfirmDialogAction}
                className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-700 transition disabled:opacity-60"
              >
                {isConfirmBusy
                  ? t('teacherPortal.confirmDialog.processing')
                  : confirmDialog.type === 'delete_payment'
                  ? t('teacherPortal.confirmDialog.confirmDeletePayment')
                  : t('teacherPortal.confirmDialog.confirmRemoveStudent')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
