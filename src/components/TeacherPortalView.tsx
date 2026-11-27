import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { createTranslator } from '../lib/i18n';
import { ProfileView } from './ProfileView';
import { NewsCarouselSection } from './NewsCarouselSection';
import { ActivityHistoryDropdown } from './ActivityHistoryDropdown';
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
  Camera,
  Layers,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Trash2,
  Info,
  Loader2,
  CalendarX2,
  CalendarPlus,
  Lock,
  Unlock,
  Bot,
  ShieldCheck,
  SlidersHorizontal,
  IdCard,
  MessageSquare,
  ClipboardCheck
} from 'lucide-react';

import { StudentNameButton } from './ContactQuickActions';
import {
  Activity,
  PaymentMethod,
  PaymentStatus,
  StudentAbsence,
  StudentPaymentMessage,
  UserRole
} from '../types';
import { formatSocioNumberPadded } from '../lib/memberNumber';
import {
  findNearestUpcomingClassDate,
  formatIsoDateLocal,
  getActivitySessionDates,
  isDateInActivitySchedule,
  parseIsoDateLocal
} from '../lib/absences';

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

interface DropModerationTarget {
  studentId: string;
  studentName: string;
  activityId: string;
  activityName: string;
  dropRequestedAt?: string;
  dropReason?: string;
}

export const TeacherWorkshopsSection: React.FC<TeacherWorkshopsSectionProps> = ({
  onOpenAddActivity,
  onOpenEnrollStudent
}) => {
  const {
    currentTeacherId,
    currentUser,
    currentRole,
    teachers,
    activities,
    students,
    payments,
    studentAbsences,
    unenrollStudentFromActivity,
    confirmActivityEnrollment,
    rejectActivityEnrollment,
    approveActivityUnenrollment,
    rejectActivityUnenrollment,
    respondToStudentAbsenceRequest,
    language
  } = useApp();
  const t = createTranslator(language);
  const matchedUserTeacher =
    currentRole !== UserRole.Admin && currentUser
      ? teachers.find(
          teacherItem =>
            (currentUser.teacherId && teacherItem.id === currentUser.teacherId) ||
            (currentUser.email &&
              teacherItem.email.trim().toLowerCase() === currentUser.email.trim().toLowerCase())
        )
      : undefined;
  const currentTeacher =
    matchedUserTeacher ||
    (currentRole === UserRole.Admin
      ? teachers.find(teacherItem => teacherItem.id === currentTeacherId)
      : undefined);
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

  const [dropModerationTarget, setDropModerationTarget] = useState<DropModerationTarget | null>(null);
  const [dropDebtsChecked, setDropDebtsChecked] = useState(false);
  const [dropMaterialsChecked, setDropMaterialsChecked] = useState(false);
  const [dropResolutionNotes, setDropResolutionNotes] = useState('');
  const [isModeratingDrop, setIsModeratingDrop] = useState(false);

  const openDropModeration = (target: DropModerationTarget) => {
    setDropDebtsChecked(false);
    setDropMaterialsChecked(false);
    setDropResolutionNotes('');
    setDropModerationTarget(target);
  };

  const handleApproveDrop = async () => {
    if (!dropModerationTarget || !dropDebtsChecked || !dropMaterialsChecked) return;
    setIsModeratingDrop(true);
    setWorkshopError(null);
    setWorkshopFeedback(null);
    const snapshot = dropModerationTarget;
    try {
      const res = await approveActivityUnenrollment(snapshot.studentId, snapshot.activityId, {
        debtsChecked: dropDebtsChecked,
        materialsChecked: dropMaterialsChecked,
        notes: dropResolutionNotes.trim() || undefined
      });
      if (res.success) {
        setDropModerationTarget(null);
        setWorkshopFeedback(
          t('teacherPortal.workshopsSection.dropApproved', {
            student: snapshot.studentName,
            activity: snapshot.activityName
          })
        );
        setTimeout(() => setWorkshopFeedback(null), 4500);
      } else {
        setWorkshopError(res.error || t('teacherPortal.workshopsSection.dropApproveError'));
      }
    } finally {
      setIsModeratingDrop(false);
    }
  };

  const handleRejectDrop = async (
    studentId: string,
    studentName: string,
    activityId: string,
    activityName: string,
    notes?: string
  ) => {
    setBusyRequestKey(`rejectDrop:${studentId}:${activityId}`);
    setIsModeratingDrop(true);
    setWorkshopError(null);
    setWorkshopFeedback(null);
    try {
      const res = await rejectActivityUnenrollment(studentId, activityId, notes?.trim() || undefined);
      if (res.success) {
        if (
          dropModerationTarget?.studentId === studentId &&
          dropModerationTarget?.activityId === activityId
        ) {
          setDropModerationTarget(null);
        }
        setWorkshopFeedback(
          t('teacherPortal.workshopsSection.dropRejected', {
            student: studentName,
            activity: activityName
          })
        );
        setTimeout(() => setWorkshopFeedback(null), 4500);
      } else {
        setWorkshopError(res.error || t('teacherPortal.workshopsSection.dropRejectError'));
      }
    } finally {
      setBusyRequestKey(null);
      setIsModeratingDrop(false);
    }
  };

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

  const handleConfirmAbsenceRequest = async (
    absenceId: string,
    studentName: string,
    activityName: string
  ) => {
    setBusyRequestKey(`confirmAbsence:${absenceId}`);
    setWorkshopError(null);
    setWorkshopFeedback(null);
    try {
      const res = await respondToStudentAbsenceRequest(absenceId, true);
      if (res.success) {
        setWorkshopFeedback(
          t('teacherPortal.workshopsSection.absenceConfirmed', {
            student: studentName,
            activity: activityName
          })
        );
        setTimeout(() => setWorkshopFeedback(null), 4000);
      } else {
        setWorkshopError(res.error || t('teacherPortal.workshopsSection.absenceConfirmError'));
      }
    } finally {
      setBusyRequestKey(null);
    }
  };

  const handleRejectAbsenceRequest = async (
    absenceId: string,
    studentName: string,
    activityName: string
  ) => {
    setBusyRequestKey(`rejectAbsence:${absenceId}`);
    setWorkshopError(null);
    setWorkshopFeedback(null);
    try {
      const res = await respondToStudentAbsenceRequest(absenceId, false);
      if (res.success) {
        setWorkshopFeedback(
          t('teacherPortal.workshopsSection.absenceRejected', {
            student: studentName,
            activity: activityName
          })
        );
        setTimeout(() => setWorkshopFeedback(null), 4000);
      } else {
        setWorkshopError(res.error || t('teacherPortal.workshopsSection.absenceRejectError'));
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
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,440px),1fr))] gap-4">
        {myActivities.length === 0 ? (
          <div className="col-span-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center text-xs text-slate-400">
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
            const actPendingDrops = students.filter(s =>
              s.activities.some(
                enroll =>
                  enroll.activityId === act.id &&
                  (enroll.status === 'pending_unenroll' || enroll.status === 'pending_withdrawal')
              )
            );
            const actPendingAbsences = studentAbsences
              .filter(
                abs =>
                  abs.activityId === act.id &&
                  (abs.status === 'pending' || abs.status === 'reported')
              )
              .sort((a, b) => {
                if (a.status !== b.status) return a.status === 'pending' ? -1 : 1;
                return b.sessionDate.localeCompare(a.sessionDate);
              });
            return (
              <div
                key={act.id}
                className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 shadow-xs space-y-3 sm:space-y-4"
              >
                {/* Distribución unificada móvil y escritorio (2x2 + barra inferior Tarifas / Editar) */}
                <div>
                  {/* Fila 1: Badges + Título | Alumnado inscrito */}
                  <div className="grid grid-cols-2 gap-3 items-start">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="rounded-md bg-indigo-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-300">
                          {act.category}
                        </span>
                        <span className="rounded-md bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:text-slate-400">
                          {act.billingMode === 'per_class'
                            ? t('teacherPortal.workshopsSection.billingPerClass')
                            : t('teacherPortal.workshopsSection.billingMonthly')}
                        </span>
                      </div>
                      <h4 className="mt-1.5 text-base font-bold text-slate-900 dark:text-white leading-tight break-words">
                        {act.name}
                      </h4>
                    </div>

                    <div className="rounded-xl bg-slate-50 dark:bg-slate-800/40 p-2.5 border border-slate-200/60 dark:border-slate-800 min-w-0">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block leading-tight">
                        {t('teacherPortal.workshopsSection.studentsLabel')}
                      </span>
                      <span className="font-semibold text-xs text-slate-900 dark:text-white mt-0.5 block truncate">
                        {t('teacherPortal.workshopsSection.enrolledCount', { count: actStudents.length })}
                      </span>
                    </div>
                  </div>

                  {/* Fila 2: Espacio / Sala | Horarios */}
                  <div className="mt-3 grid grid-cols-2 gap-3 items-start">
                    <div className="rounded-xl bg-slate-50 dark:bg-slate-800/40 p-2.5 border border-slate-200/60 dark:border-slate-800 min-w-0">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block leading-tight">
                        {t('activitiesView.roomLabel')}
                      </span>
                      <span className="font-semibold text-xs text-slate-900 dark:text-white mt-0.5 block truncate">
                        {act.room}
                      </span>
                    </div>

                    <div className="min-w-0">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1.5 leading-tight">
                        {t('activitiesView.scheduleLabel')}
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {act.schedule.map((sch, i) => (
                          <span
                            key={i}
                            className="inline-flex items-center gap-1 rounded-xl bg-slate-100 dark:bg-slate-800/80 px-2.5 py-1.5 text-[11px] font-medium text-slate-700 dark:text-slate-300"
                          >
                            <Clock className="h-3 w-3 text-emerald-600 shrink-0" />
                            <span>{sch}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  {act.description && (
                    <p className="mt-2.5 text-[11px] sm:text-xs text-slate-600 dark:text-slate-300 leading-relaxed line-clamp-2">
                      {act.description}
                    </p>
                  )}

                  {act.bizum_enabled && (
                    <div className="mt-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 p-2 text-xs text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5 border border-emerald-500/20">
                      <Smartphone className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                      <span className="truncate">
                        {t('teacherPortal.workshopsSection.bizumLabel')} <strong>{act.bizum_phone}</strong>{' '}
                        {t('teacherPortal.workshopsSection.conceptInsideParens', { concept: act.bizum_concept || '' })}
                      </span>
                    </div>
                  )}

                  {/* Fila inferior: Tarifas a la izquierda + Botón editar a la derecha */}
                  <div className="mt-3.5 border-t border-slate-100 dark:border-slate-800/80 pt-3 flex flex-wrap items-center justify-between gap-2.5">
                    <div className="min-w-0 shrink-0">
                      <span className="text-slate-400 text-[11px] block leading-tight">
                        {t('activitiesView.ratesLabel')}
                      </span>
                      <div className="text-xs font-bold tabular-nums text-slate-900 dark:text-white mt-0.5">
                        {t('activitiesView.rateSummary', {
                          monthly: act.defaultPriceMonthly,
                          perClass: act.defaultPricePerClass
                        })}
                      </div>
                    </div>

                    {onOpenAddActivity && (
                      <button
                        type="button"
                        onClick={() => onOpenAddActivity(act)}
                        title={t('teacherPortal.workshopsSection.editWorkshopTooltip')}
                        className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-2.5 sm:px-5 text-xs font-bold text-slate-700 dark:text-slate-200 hover:border-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-300 transition shadow-xs whitespace-nowrap shrink-0 active:scale-[0.99]"
                      >
                        <Edit2 className="h-3.5 w-3.5 shrink-0" />
                        <span>{t('teacherPortal.workshopsSection.edit')}</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Solicitudes de inscripción pendientes */}
                {actPendingRequests.length > 0 && (
                  <div className="rounded-xl border border-amber-500/35 bg-amber-50/70 dark:bg-amber-950/25 p-3 space-y-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5" />
                      {t('teacherPortal.workshopsSection.pendingRequests', { count: actPendingRequests.length })}
                    </span>
                    <div className="@container rounded-xl border border-amber-500/20 bg-white/95 dark:bg-slate-900/95 overflow-hidden">
                      <div className="hidden @[400px]:grid @[400px]:grid-cols-[minmax(0,1.5fr)_84px_142px] items-center gap-2.5 px-3 py-1.5 bg-amber-100/50 dark:bg-amber-950/40 border-b border-amber-500/20 text-[10px] font-bold uppercase tracking-wider text-amber-800/80 dark:text-amber-300/80">
                        <span>{t('common.columns.student')}</span>
                        <span>{t('common.columns.status')}</span>
                        <span className="text-right">{t('common.columns.actions')}</span>
                      </div>
                      <div className="divide-y divide-amber-500/15">
                        {actPendingRequests.map(st => {
                          const cKey = `confirm:${st.id}:${act.id}`;
                          const rKey = `reject:${st.id}:${act.id}`;
                          const isBusy = busyRequestKey === cKey || busyRequestKey === rKey;
                          return (
                            <div
                              key={st.id}
                              className="px-3 py-2 grid grid-cols-[minmax(0,1fr)_auto] @[400px]:grid-cols-[minmax(0,1.5fr)_84px_142px] items-center gap-2.5 text-xs hover:bg-amber-50/40 dark:hover:bg-amber-950/20 transition"
                            >
                              <div className="min-w-0">
                                <StudentNameButton
                                  name={st.name}
                                  phone={st.phone}
                                  email={st.email}
                                  subtitle={act.name}
                                  className="font-bold text-slate-900 dark:text-white break-words text-left"
                                />
                              </div>

                              <div className="hidden @[400px]:block">
                                <span className="inline-flex items-center rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-800 dark:text-amber-300 whitespace-nowrap">
                                  {t('teacherPortal.workshopsSection.pendingBadge')}
                                </span>
                              </div>

                              <div className="flex items-center justify-end gap-1.5 shrink-0">
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() => handleConfirmPendingRequest(st.id, st.name, act.id, act.name)}
                                  title={t('teacherPortal.workshopsSection.confirm')}
                                  aria-label={t('teacherPortal.workshopsSection.confirm')}
                                  className="inline-flex h-7 w-7 @[400px]:h-auto @[400px]:w-auto items-center justify-center @[400px]:gap-1 rounded-lg bg-emerald-600 @[400px]:px-2.5 @[400px]:py-1 text-[11px] font-bold text-white hover:bg-emerald-700 transition disabled:opacity-50 whitespace-nowrap"
                                >
                                  {busyRequestKey === cKey ? (
                                    <Loader2 className="h-3.5 w-3.5 @[400px]:h-3 @[400px]:w-3 animate-spin" />
                                  ) : (
                                    <Check className="h-3.5 w-3.5 @[400px]:h-3 @[400px]:w-3" />
                                  )}
                                  <span className="hidden @[400px]:inline">{busyRequestKey === cKey ? '...' : t('teacherPortal.workshopsSection.confirm')}</span>
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
                  </div>
                )}

                {/* Solicitudes de baja pendientes de revisión */}
                {actPendingDrops.length > 0 && (
                  <div className="rounded-xl border border-rose-500/35 bg-rose-50/70 dark:bg-rose-950/25 p-3 space-y-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-rose-800 dark:text-rose-300 flex items-center gap-1.5">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      {t('teacherPortal.workshopsSection.pendingDrops', { count: actPendingDrops.length })}
                    </span>
                    <div className="@container rounded-xl border border-rose-500/20 bg-white/95 dark:bg-slate-900/95 overflow-hidden">
                      <div className="hidden @[500px]:grid @[500px]:grid-cols-[minmax(0,1.2fr)_104px_minmax(0,1.1fr)_150px] items-center gap-2.5 px-3 py-1.5 bg-rose-100/50 dark:bg-rose-950/40 border-b border-rose-500/20 text-[10px] font-bold uppercase tracking-wider text-rose-800/80 dark:text-rose-300/80">
                        <span>{t('common.columns.student')}</span>
                        <span>{t('common.columns.status')}</span>
                        <span>{t('common.columns.reason')}</span>
                        <span className="text-right">{t('common.columns.actions')}</span>
                      </div>
                      <div className="divide-y divide-rose-500/15">
                        {actPendingDrops.map(st => {
                          const dropEnr = st.activities.find(e => e.activityId === act.id);
                          const unpaid = payments.filter(
                            p =>
                              p.studentId === st.id &&
                              p.activityId === act.id &&
                              (p.status === 'pending' || p.status === 'overdue' || p.status === 'partial')
                          );
                          const unpaidSum = unpaid.reduce((acc, p) => acc + p.amount, 0);
                          const rejKey = `rejectDrop:${st.id}:${act.id}`;
                          const isBusy = busyRequestKey === rejKey || isModeratingDrop;
                          return (
                            <div
                              key={st.id}
                              className="px-3 py-2.5 grid grid-cols-1 @[340px]:grid-cols-[minmax(0,1fr)_auto] @[500px]:grid-cols-[minmax(0,1.2fr)_104px_minmax(0,1.1fr)_150px] items-center gap-2.5 text-xs hover:bg-rose-50/40 dark:hover:bg-rose-950/20 transition"
                            >
                              <div className="min-w-0 space-y-1 @[500px]:contents">
                                <StudentNameButton
                                  name={st.name}
                                  phone={st.phone}
                                  email={st.email}
                                  subtitle={act.name}
                                  className="font-bold text-slate-900 dark:text-white text-left break-words"
                                />
                                <div>
                                  {unpaid.length > 0 ? (
                                    <span className="inline-flex rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-800 dark:text-amber-300 whitespace-nowrap">
                                      {t('teacherPortal.workshopsSection.debtWarningCount', {
                                        count: unpaid.length,
                                        amount: unpaidSum.toFixed(2)
                                      })}
                                    </span>
                                  ) : (
                                    <span className="inline-flex rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-300 whitespace-nowrap">
                                      {t('teacherPortal.workshopsSection.noDebtsShort')}
                                    </span>
                                  )}
                                </div>
                                <div className="min-w-0">
                                  {dropEnr?.dropReason ? (
                                    <span className="text-[11px] text-slate-500 dark:text-slate-400 italic break-words block">
                                      "{dropEnr.dropReason}"
                                    </span>
                                  ) : (
                                    <span className="hidden @[500px]:inline text-[11px] text-slate-300 dark:text-slate-700">—</span>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center justify-end gap-1.5 shrink-0">
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() =>
                                    openDropModeration({
                                      studentId: st.id,
                                      studentName: st.name,
                                      activityId: act.id,
                                      activityName: act.name,
                                      dropRequestedAt: dropEnr?.dropRequestedAt,
                                      dropReason: dropEnr?.dropReason
                                    })
                                  }
                                  className="inline-flex items-center gap-1 rounded-lg bg-amber-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-amber-700 transition disabled:opacity-50 whitespace-nowrap"
                                >
                                  <AlertTriangle className="h-3 w-3" />
                                  <span>{t('teacherPortal.workshopsSection.reviewDrop')}</span>
                                </button>
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() => handleRejectDrop(st.id, st.name, act.id, act.name)}
                                  title={t('teacherPortal.workshopsSection.rejectDropTooltip')}
                                  className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition disabled:opacity-50"
                                >
                                  {busyRequestKey === rejKey ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <X className="h-3.5 w-3.5" />
                                  )}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {/* Ausencias comunicadas o pendientes de confirmación */}
                {actPendingAbsences.length > 0 && (
                  <div className="rounded-xl border border-sky-500/35 bg-sky-50/75 dark:bg-sky-950/25 p-3 space-y-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-sky-800 dark:text-sky-300 flex items-center gap-1.5">
                      <CalendarX2 className="h-3.5 w-3.5" />
                      {t('teacherPortal.workshopsSection.pendingAbsences', {
                        count: actPendingAbsences.length
                      })}
                    </span>
                    <div className="@container rounded-xl border border-sky-500/20 bg-white/95 dark:bg-slate-900/95 overflow-hidden">
                      <div className="hidden @[520px]:grid @[520px]:grid-cols-[minmax(0,1.2fr)_84px_84px_minmax(0,1.1fr)_130px] items-center gap-2 px-3 py-1.5 bg-sky-100/50 dark:bg-sky-950/40 border-b border-sky-500/20 text-[10px] font-bold uppercase tracking-wider text-sky-800/80 dark:text-sky-300/80">
                        <span>{t('common.columns.student')}</span>
                        <span>{t('common.columns.date')}</span>
                        <span>{t('common.columns.status')}</span>
                        <span>{t('common.columns.reason')}</span>
                        <span className="text-right">{t('common.columns.actions')}</span>
                      </div>
                      <div className="divide-y divide-sky-500/15">
                        {actPendingAbsences.map(abs => {
                          const st = students.find(s => s.id === abs.studentId);
                          const studentName =
                            st?.name || t('teacherPortal.messages.fallbackStudentName');
                          const cKey = `confirmAbsence:${abs.id}`;
                          const rKey = `rejectAbsence:${abs.id}`;
                          const isBusy = busyRequestKey === cKey || busyRequestKey === rKey;
                          return (
                            <div
                              key={abs.id}
                              className="px-3 py-2 grid grid-cols-[minmax(0,1fr)_auto] @[520px]:grid-cols-[minmax(0,1.2fr)_84px_84px_minmax(0,1.1fr)_130px] items-center gap-2 text-xs hover:bg-sky-50/40 dark:hover:bg-sky-950/20 transition"
                            >
                              <div className="min-w-0 space-y-0.5 @[520px]:contents">
                                <StudentNameButton
                                  name={studentName}
                                  phone={st?.phone}
                                  email={st?.email}
                                  subtitle={`${act.name} · ${abs.sessionDate}`}
                                  className="font-bold text-slate-900 dark:text-white text-left break-words"
                                />
                                <div className="flex flex-wrap items-center gap-1.5 @[520px]:contents">
                                  <span className="font-mono text-[11px] font-semibold text-sky-700 dark:text-sky-300 tabular-nums whitespace-nowrap">
                                    {abs.sessionDate}
                                  </span>
                                  <div>
                                    <span
                                      className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-bold whitespace-nowrap ${
                                        abs.status === 'pending'
                                          ? 'bg-amber-500/15 text-amber-800 dark:text-amber-300'
                                          : 'bg-sky-500/15 text-sky-700 dark:text-sky-300'
                                      }`}
                                    >
                                      {abs.status === 'pending'
                                        ? t('studentPortal.absenceStatus.pending')
                                        : t('studentPortal.absenceStatus.reported')}
                                    </span>
                                  </div>
                                </div>
                                <div className="min-w-0">
                                  {abs.reason ? (
                                    <span className="text-[11px] text-slate-500 dark:text-slate-400 italic break-words block">
                                      "{abs.reason}"
                                    </span>
                                  ) : (
                                    <span className="hidden @[520px]:inline text-[11px] text-slate-300 dark:text-slate-700">—</span>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center justify-end gap-1.5 shrink-0">
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() =>
                                    handleConfirmAbsenceRequest(abs.id, studentName, act.name)
                                  }
                                  title={t('teacherPortal.pendingBanner.confirmAbsence')}
                                  aria-label={t('teacherPortal.pendingBanner.confirmAbsence')}
                                  className="inline-flex h-7 w-7 @[520px]:h-auto @[520px]:w-auto items-center justify-center @[520px]:gap-1 rounded-lg bg-emerald-600 @[520px]:px-2.5 @[520px]:py-1 text-[11px] font-bold text-white hover:bg-emerald-700 transition disabled:opacity-50 whitespace-nowrap"
                                >
                                  {busyRequestKey === cKey ? (
                                    <Loader2 className="h-3.5 w-3.5 @[520px]:h-3 @[520px]:w-3 animate-spin" />
                                  ) : (
                                    <Check className="h-3.5 w-3.5 @[520px]:h-3 @[520px]:w-3" />
                                  )}
                                  <span className="hidden @[520px]:inline">
                                    {busyRequestKey === cKey
                                      ? '...'
                                      : t('teacherPortal.pendingBanner.confirmAbsence')}
                                  </span>
                                </button>
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() =>
                                    handleRejectAbsenceRequest(abs.id, studentName, act.name)
                                  }
                                  title={t('teacherPortal.pendingBanner.rejectAbsenceTooltip')}
                                  aria-label={t('teacherPortal.pendingBanner.rejectAbsenceAria', {
                                    student: studentName
                                  })}
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
                    <div className="@container rounded-xl border border-slate-200/80 dark:border-slate-800 overflow-hidden bg-white dark:bg-slate-900">
                      <div className="hidden @[380px]:grid @[380px]:grid-cols-[minmax(0,1.4fr)_minmax(0,1.1fr)_88px] items-center gap-3 px-3 py-1.5 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200/80 dark:border-slate-800 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                        <span>{t('common.columns.student')}</span>
                        <span>{t('common.columns.notices')}</span>
                        <span className="text-right">{t('common.columns.action')}</span>
                      </div>
                      <div className="divide-y divide-slate-100 dark:divide-slate-800">
                        {actStudents.map(st => {
                          const isPending =
                            st.status === 'pending_validation' || st.validationStatus === 'pending';
                          const enrItem = st.activities.find(e => e.activityId === act.id);
                          const isDropPending =
                            enrItem?.status === 'pending_unenroll' ||
                            enrItem?.status === 'pending_withdrawal';
                          const studentAbsenceItem = actPendingAbsences.find(
                            a => a.studentId === st.id
                          );
                          return (
                            <div
                              key={st.id}
                              className="px-3 py-2 grid grid-cols-[minmax(0,1fr)_auto] @[380px]:grid-cols-[minmax(0,1.4fr)_minmax(0,1.1fr)_88px] items-center gap-2 @[380px]:gap-3 text-xs hover:bg-slate-50/70 dark:hover:bg-slate-800/30 transition"
                            >
                              <div className="min-w-0">
                                <StudentNameButton
                                  name={st.name}
                                  phone={st.phone}
                                  email={st.email}
                                  subtitle={act.name}
                                  className="font-bold text-slate-900 dark:text-white text-left break-words"
                                />
                                {(isPending || isDropPending || studentAbsenceItem) && (
                                  <div className="flex items-center gap-1.5 flex-wrap mt-0.5 @[380px]:hidden">
                                    {isPending && (
                                      <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-300">
                                        {t('teacherPortal.workshopsSection.pendingBadge')}
                                      </span>
                                    )}
                                    {isDropPending && (
                                      <span className="rounded bg-rose-500/15 px-1.5 py-0.5 text-[10px] font-bold text-rose-700 dark:text-rose-300">
                                        {t('teacherPortal.workshopsSection.dropPendingBadge')}
                                      </span>
                                    )}
                                    {studentAbsenceItem && (
                                      <span className="inline-flex items-center gap-1 rounded bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-bold text-sky-700 dark:text-sky-300">
                                        <CalendarX2 className="h-3 w-3 shrink-0" />
                                        <span>
                                          {t('teacherPortal.workshopsSection.absenceBadgeShort', {
                                            date: studentAbsenceItem.sessionDate
                                          })}
                                        </span>
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>

                              <div className="hidden @[380px]:flex items-center gap-1.5 flex-wrap min-w-0">
                                {isPending && (
                                  <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-300 whitespace-nowrap">
                                    {t('teacherPortal.workshopsSection.pendingBadge')}
                                  </span>
                                )}
                                {isDropPending && (
                                  <span className="rounded bg-rose-500/15 px-1.5 py-0.5 text-[10px] font-bold text-rose-700 dark:text-rose-300 whitespace-nowrap">
                                    {t('teacherPortal.workshopsSection.dropPendingBadge')}
                                  </span>
                                )}
                                {studentAbsenceItem && (
                                  <span className="inline-flex items-center gap-1 rounded bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-bold text-sky-700 dark:text-sky-300 whitespace-nowrap">
                                    <CalendarX2 className="h-3 w-3 shrink-0" />
                                    <span>
                                      {t('teacherPortal.workshopsSection.absenceBadgeShort', {
                                        date: studentAbsenceItem.sessionDate
                                      })}
                                    </span>
                                  </span>
                                )}
                                {!isPending && !isDropPending && !studentAbsenceItem && (
                                  <span className="text-[11px] text-slate-300 dark:text-slate-700">—</span>
                                )}
                              </div>

                              <div className="flex items-center justify-end gap-2 shrink-0">
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
                    </div>
                  )}
                </div>

                {/* Desplegable de historial de sesiones agrupado por fecha */}
                <ActivityHistoryDropdown activity={act} />
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

      {/* Modal de moderación de baja (verificación de deudas y materiales) */}
      {dropModerationTarget && (() => {
        const unpaidPayments = payments.filter(
          p =>
            p.studentId === dropModerationTarget.studentId &&
            p.activityId === dropModerationTarget.activityId &&
            (p.status === 'pending' || p.status === 'overdue' || p.status === 'partial')
        );
        const unpaidTotal = unpaidPayments.reduce((sum, p) => sum + p.amount, 0);
        const canApprove = dropDebtsChecked && dropMaterialsChecked && !isModeratingDrop;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-xs">
            <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-2xl space-y-4">
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
                  disabled={isModeratingDrop}
                  onClick={() => setDropModerationTarget(null)}
                  className="rounded-lg p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 p-3 text-xs space-y-1">
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500">{t('teacherPortal.dropModerationModal.studentLabel')}</span>
                  <strong className="text-slate-900 dark:text-white">{dropModerationTarget.studentName}</strong>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500">{t('teacherPortal.dropModerationModal.workshopLabel')}</span>
                  <strong className="text-slate-900 dark:text-white">{dropModerationTarget.activityName}</strong>
                </div>
                {dropModerationTarget.dropRequestedAt && (
                  <p className="text-[11px] text-slate-400">
                    {t('teacherPortal.dropModerationModal.requestedAtLabel', {
                      date: dropModerationTarget.dropRequestedAt.split('T')[0]
                    })}
                  </p>
                )}
                {dropModerationTarget.dropReason && (
                  <div className="pt-1 border-t border-slate-200/70 dark:border-slate-700/60">
                    <span className="block text-[10px] font-bold uppercase text-slate-400">
                      {t('teacherPortal.dropModerationModal.reasonLabel')}
                    </span>
                    <p className="italic text-slate-700 dark:text-slate-200">
                      "{dropModerationTarget.dropReason}"
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
                <label className="flex items-start gap-2.5 text-xs text-slate-700 dark:text-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={dropDebtsChecked}
                    onChange={e => setDropDebtsChecked(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  <span>{t('teacherPortal.dropModerationModal.checkDebts')}</span>
                </label>

                <label className="flex items-start gap-2.5 text-xs text-slate-700 dark:text-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={dropMaterialsChecked}
                    onChange={e => setDropMaterialsChecked(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
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
                  value={dropResolutionNotes}
                  onChange={e => setDropResolutionNotes(e.target.value)}
                  placeholder={t('teacherPortal.dropModerationModal.notesPlaceholder')}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-indigo-500"
                />
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  disabled={isModeratingDrop}
                  onClick={() => setDropModerationTarget(null)}
                  className="rounded-xl border border-slate-300 dark:border-slate-700 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                >
                  {t('teacherPortal.dropModerationModal.cancel')}
                </button>
                <button
                  type="button"
                  disabled={isModeratingDrop}
                  onClick={() =>
                    handleRejectDrop(
                      dropModerationTarget.studentId,
                      dropModerationTarget.studentName,
                      dropModerationTarget.activityId,
                      dropModerationTarget.activityName,
                      dropResolutionNotes
                    )
                  }
                  className="rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 px-3 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition disabled:opacity-50"
                >
                  {t('teacherPortal.dropModerationModal.rejectButton')}
                </button>
                <button
                  type="button"
                  disabled={!canApprove}
                  onClick={handleApproveDrop}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-rose-700 transition disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {isModeratingDrop && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  <span>
                    {isModeratingDrop
                      ? t('teacherPortal.dropModerationModal.processing')
                      : t('teacherPortal.dropModerationModal.approveButton')}
                  </span>
                </button>
              </div>
            </div>
          </div>
        );
      })()}
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
    payments,
    recordClassPayment,
    updatePayment,
    deletePayment,
    unenrollStudentFromActivity,
    confirmActivityEnrollment,
    rejectActivityEnrollment,
    approveActivityUnenrollment,
    rejectActivityUnenrollment,
    addClassSession,
    closeClassSession,
    reopenClassSession,
    upsertSessionAttendance,
    studentAbsences,
    respondToStudentAbsenceRequest,
    studentPaymentMessages,
    evaluateStudentPaymentMessage,
    currentRole,
    currentUser,
    profiles,
    language
  } = useApp();
  const t = createTranslator(language);

  const matchedUserTeacher =
    currentRole !== UserRole.Admin && currentUser
      ? teachers.find(
          teacherItem =>
            (currentUser.teacherId && teacherItem.id === currentUser.teacherId) ||
            (currentUser.email &&
              teacherItem.email.trim().toLowerCase() === currentUser.email.trim().toLowerCase())
        )
      : undefined;
  const currentTeacher =
    matchedUserTeacher ||
    (currentRole === UserRole.Admin
      ? teachers.find(teacherItem => teacherItem.id === currentTeacherId)
      : undefined);
  const matchedTeacherProfile = currentTeacher
    ? profiles.find(
        p =>
          p.teacherId === currentTeacher.id ||
          (currentTeacher.email &&
            p.email.trim().toLowerCase() === currentTeacher.email.trim().toLowerCase())
      )
    : undefined;
  const matchedStudentForTeacher = currentTeacher?.email
    ? students.find(
        st => st.email.trim().toLowerCase() === currentTeacher.email.trim().toLowerCase()
      )
    : undefined;
  const isOwnTeacherView =
    currentRole !== UserRole.Admin ||
    (Boolean(currentUser?.id) &&
      (matchedTeacherProfile?.id === currentUser?.id ||
        (Boolean(currentUser?.teacherId) && currentUser?.teacherId === currentTeacher?.id)));
  const formattedMemberNumber = formatSocioNumberPadded(
    currentTeacher?.memberNumber ||
      matchedTeacherProfile?.memberNumber ||
      matchedStudentForTeacher?.memberNumber ||
      (isOwnTeacherView ? currentUser?.memberNumber : undefined)
  );
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
    const items: Array<{
      studentId: string;
      studentName: string;
      studentPhone: string;
      studentEmail: string;
      contact: string;
      activityId: string;
      activityName: string;
    }> = [];
    for (const st of students) {
      for (const req of st.pendingEnrollments || []) {
        if (!myActivityIds.includes(req.activityId)) continue;
        const act = myActivities.find(a => a.id === req.activityId);
        if (!act) continue;
        items.push({
          studentId: st.id,
          studentName: st.name,
          studentPhone: st.phone || '',
          studentEmail: st.email || '',
          contact: st.phone || st.email || '',
          activityId: act.id,
          activityName: act.name
        });
      }
    }
    return items;
  }, [students, myActivityIds, myActivities]);

  const myPendingDropRequests = useMemo(() => {
    const items: Array<{
      studentId: string;
      studentName: string;
      studentPhone: string;
      studentEmail: string;
      contact: string;
      activityId: string;
      activityName: string;
      dropRequestedAt?: string;
      dropReason?: string;
      unpaidCount: number;
      unpaidAmount: number;
    }> = [];
    for (const st of students) {
      for (const enr of st.activities) {
        if (
          (enr.status !== 'pending_unenroll' && enr.status !== 'pending_withdrawal') ||
          !myActivityIds.includes(enr.activityId)
        )
          continue;
        const act = myActivities.find(a => a.id === enr.activityId);
        if (!act) continue;
        const unpaid = payments.filter(
          p =>
            p.studentId === st.id &&
            p.activityId === act.id &&
            (p.status === 'pending' || p.status === 'overdue' || p.status === 'partial')
        );
        items.push({
          studentId: st.id,
          studentName: st.name,
          studentPhone: st.phone || '',
          studentEmail: st.email || '',
          contact: st.phone || st.email || '',
          activityId: act.id,
          activityName: act.name,
          dropRequestedAt: enr.dropRequestedAt,
          dropReason: enr.dropReason,
          unpaidCount: unpaid.length,
          unpaidAmount: unpaid.reduce((s, p) => s + p.amount, 0)
        });
      }
    }
    return items;
  }, [students, myActivityIds, myActivities, payments]);

  const myPendingAbsenceRequests = useMemo(() => {
    const items: Array<{
      id: string;
      studentId: string;
      studentName: string;
      studentPhone: string;
      studentEmail: string;
      activityId: string;
      activityName: string;
      sessionDate: string;
      reason?: string;
    }> = [];
    for (const abs of studentAbsences) {
      if (abs.status !== 'pending' || !myActivityIds.includes(abs.activityId)) continue;
      const st = students.find(s => s.id === abs.studentId);
      const act = myActivities.find(a => a.id === abs.activityId);
      if (!st || !act) continue;
      items.push({
        id: abs.id,
        studentId: st.id,
        studentName: st.name,
        studentPhone: st.phone || '',
        studentEmail: st.email || '',
        activityId: act.id,
        activityName: act.name,
        sessionDate: abs.sessionDate,
        reason: abs.reason
      });
    }
    return items.sort((a, b) => b.sessionDate.localeCompare(a.sessionDate));
  }, [studentAbsences, myActivityIds, students, myActivities]);

  const myPaymentMessages = useMemo(() => {
    return studentPaymentMessages
      .filter(
        m =>
          myActivityIds.includes(m.activityId) ||
          (Boolean(currentTeacher?.id) && m.teacherId === currentTeacher?.id)
      )
      .map(m => {
        const st = students.find(s => s.id === m.studentId);
        const act = activities.find(a => a.id === m.activityId);
        return {
          ...m,
          studentName: m.studentName || st?.name || t('appContext.fallbackStudent'),
          studentPhone: st?.phone || '',
          studentEmail: st?.email || '',
          activityName: m.activityName || act?.name || t('appContext.fallbackActivity')
        };
      });
  }, [studentPaymentMessages, myActivityIds, currentTeacher?.id, students, activities, t]);

  const myPendingPaymentMessages = useMemo(
    () => myPaymentMessages.filter(m => m.status === 'pending'),
    [myPaymentMessages]
  );

  const myEvaluatedPaymentMessages = useMemo(
    () => myPaymentMessages.filter(m => m.status !== 'pending'),
    [myPaymentMessages]
  );

  const pendingPaymentMessagesByStudentActivity = useMemo(() => {
    const map = new Map<string, StudentPaymentMessage>();
    for (const m of myPendingPaymentMessages) {
      const key = `${m.studentId}::${m.activityId}`;
      if (!map.has(key)) {
        map.set(key, m);
      }
    }
    return map;
  }, [myPendingPaymentMessages]);

  const [portalRequestBusyKey, setPortalRequestBusyKey] = useState<string | null>(null);
  const [portalRequestError, setPortalRequestError] = useState<string | null>(null);
  const [portalDropTarget, setPortalDropTarget] = useState<DropModerationTarget | null>(null);
  const [portalDropDebtsChecked, setPortalDropDebtsChecked] = useState(false);
  const [portalDropMaterialsChecked, setPortalDropMaterialsChecked] = useState(false);
  const [portalDropNotes, setPortalDropNotes] = useState('');
  const [isPortalDropModerating, setIsPortalDropModerating] = useState(false);

  // Valoración de mensajes de cuotas de alumnos
  const [showEvaluatedPaymentMessages, setShowEvaluatedPaymentMessages] = useState(false);
  const [evaluatingPaymentMessage, setEvaluatingPaymentMessage] =
    useState<StudentPaymentMessage | null>(null);
  const [evalTeacherNote, setEvalTeacherNote] = useState('');
  const [evalMarkAsPaid, setEvalMarkAsPaid] = useState(true);
  const [evalPaymentMethod, setEvalPaymentMethod] = useState<PaymentMethod>('cash');
  const [evalCollectedByTeacher, setEvalCollectedByTeacher] = useState(true);
  const [isEvaluatingPaymentMsg, setIsEvaluatingPaymentMsg] = useState(false);
  const [evalPaymentMsgError, setEvalPaymentMsgError] = useState<string | null>(null);

  const openEvaluatePaymentMessageModal = (msg: StudentPaymentMessage) => {
    const linkedPay = payments.find(p => p.id === msg.paymentId);
    setEvaluatingPaymentMessage(msg);
    setEvalTeacherNote(msg.teacherEvaluation || '');
    setEvalMarkAsPaid(Boolean(msg.reportedPaid && (!linkedPay || linkedPay.status !== 'paid')));
    setEvalPaymentMethod(msg.paymentMethod || linkedPay?.paymentMethod || 'cash');
    setEvalCollectedByTeacher(msg.paidToType ? msg.paidToType !== 'association' : true);
    setEvalPaymentMsgError(null);
  };

  const handleEvaluatePaymentMessage = async (decision: 'approved' | 'rejected') => {
    if (!evaluatingPaymentMessage) return;
    setEvalPaymentMsgError(null);
    setIsEvaluatingPaymentMsg(true);
    try {
      const res = await evaluateStudentPaymentMessage({
        messageId: evaluatingPaymentMessage.id,
        status: decision,
        teacherEvaluation: evalTeacherNote.trim(),
        markPaymentAsPaid: decision === 'approved' && evalMarkAsPaid,
        paymentMethod: evalPaymentMethod,
        collectedByTeacher: evalCollectedByTeacher
      });
      if (res.success) {
        setEvaluatingPaymentMessage(null);
        setEvalTeacherNote('');
      } else {
        setEvalPaymentMsgError(
          res.error || t('teacherPortal.paymentMessageEvalModal.submitError')
        );
      }
    } finally {
      setIsEvaluatingPaymentMsg(false);
    }
  };

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

  const todayStr = formatIsoDateLocal(new Date());
  const dayNamesShort = useMemo(
    () => [
      t('common.daysShort.d0'),
      t('common.daysShort.d1'),
      t('common.daysShort.d2'),
      t('common.daysShort.d3'),
      t('common.daysShort.d4'),
      t('common.daysShort.d5'),
      t('common.daysShort.d6')
    ],
    [t]
  );

  const [sessionDate, setSessionDate] = useState<string>(todayStr);
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

  // Acordeón del selector de taller/clase (incluye la lista de alumnos inscritos), calendario y registro fuera de horario
  const [isWorkshopAccordionOpen, setIsWorkshopAccordionOpen] = useState(true);
  const [isWorkshopInfoOpen, setIsWorkshopInfoOpen] = useState(false);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [calendarViewMonth, setCalendarViewMonth] = useState<{ year: number; month: number }>(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const calendarContainerRef = useRef<HTMLDivElement | null>(null);
  const [unscheduledTopic, setUnscheduledTopic] = useState('');
  const [unscheduledDuration, setUnscheduledDuration] = useState<number>(75);
  const [unscheduledPrefillPresent, setUnscheduledPrefillPresent] = useState(true);
  const [isRegisteringUnscheduled, setIsRegisteringUnscheduled] = useState(false);

  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);
  const [classActionError, setClassActionError] = useState<string | null>(null);
  const [confirmingAbsenceId, setConfirmingAbsenceId] = useState<string | null>(null);
  const [isReopenModalOpen, setIsReopenModalOpen] = useState(false);
  const [reopenReasonInput, setReopenReasonInput] = useState('');
  const [reopenReasonError, setReopenReasonError] = useState<string | null>(null);
  const [isReopeningClass, setIsReopeningClass] = useState(false);
  const [isClosingClass, setIsClosingClass] = useState(false);

  // Actividad seleccionada en la sesión activa
  const activeClassActivity = myActivities.find(a => a.id === selectedClassActivityId) || myActivities[0];

  const activeActivitySessions = useMemo(() => {
    if (!activeClassActivity) return [];
    return sessions.filter(s => s.activityId === activeClassActivity.id);
  }, [sessions, activeClassActivity]);

  const classDateOptions = useMemo(() => {
    if (!activeClassActivity) return [];
    const enrollmentDates = students
      .flatMap(st => st.activities)
      .filter(enr => enr.activityId === activeClassActivity.id)
      .map(enr => enr.enrolledSince?.split('T')[0]);
    const recordedDates = activeActivitySessions.map(s => s.date?.slice(0, 10));
    return getActivitySessionDates({
      activity: activeClassActivity,
      startDateCandidates: [
        activeClassActivity.startDate,
        activeClassActivity.createdAt,
        ...recordedDates,
        ...enrollmentDates
      ],
      recordedSessions: activeActivitySessions,
      dayNamesShort,
      todayStr,
      pastDays: 60,
      futureDays: 60
    });
  }, [activeClassActivity, activeActivitySessions, students, dayNamesShort, todayStr]);

  const nearestUpcomingClassDate = useMemo(
    () => findNearestUpcomingClassDate(classDateOptions, todayStr),
    [classDateOptions, todayStr]
  );

  const lastDateAutoActivityRef = useRef<string>('');
  useEffect(() => {
    if (!activeClassActivity?.id) return;
    if (lastDateAutoActivityRef.current !== activeClassActivity.id) {
      lastDateAutoActivityRef.current = activeClassActivity.id;
      setSessionDate(nearestUpcomingClassDate);
      setIsCalendarOpen(false);
    }
  }, [activeClassActivity?.id, nearestUpcomingClassDate]);

  useEffect(() => {
    setUnscheduledTopic('');
    setUnscheduledDuration(75);
    setUnscheduledPrefillPresent(true);
  }, [sessionDate, activeClassActivity?.id]);

  useEffect(() => {
    if (!isCalendarOpen) return;
    const handlePointerDown = (e: MouseEvent) => {
      if (
        calendarContainerRef.current &&
        !calendarContainerRef.current.contains(e.target as Node)
      ) {
        setIsCalendarOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsCalendarOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isCalendarOpen]);

  const recordedSessionDatesSet = useMemo(() => {
    return new Set(
      activeActivitySessions.map(s => (s.date || '').slice(0, 10)).filter(Boolean)
    );
  }, [activeActivitySessions]);

  const closedSessionDatesSet = useMemo(() => {
    return new Set(
      activeActivitySessions
        .filter(s => Boolean(s.isClosed))
        .map(s => (s.date || '').slice(0, 10))
        .filter(Boolean)
    );
  }, [activeActivitySessions]);

  const isSelectedDateInClassDropdown = useMemo(
    () => classDateOptions.some(opt => opt.dateStr === sessionDate),
    [classDateOptions, sessionDate]
  );

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
    return (
      sessions.find(
        s =>
          s.activityId === activeClassActivity.id &&
          s.teacherId === currentTeacher.id &&
          s.date?.slice(0, 10) === sessionDate
      ) ||
      sessions.find(
        s =>
          s.activityId === activeClassActivity.id &&
          s.date?.slice(0, 10) === sessionDate
      )
    );
  }, [sessions, activeClassActivity, currentTeacher?.id, sessionDate]);

  const isCurrentClassClosed = Boolean(matchingClassSession?.isClosed);
  const actorClassRole: 'profesor' | 'administrador' =
    currentRole === UserRole.Admin ? 'administrador' : 'profesor';

  const formatClosedTimestamp = (iso?: string) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const localeCode = language === 'gl' ? 'gl-ES' : language === 'en' ? 'en-US' : 'es-ES';
    return d.toLocaleString(localeCode, {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const isUnscheduledSelectedDate = useMemo(() => {
    if (!activeClassActivity || !sessionDate) return false;
    if (matchingClassSession) return false;
    if (recordedSessionDatesSet.has(sessionDate)) return false;
    return !isDateInActivitySchedule(activeClassActivity, sessionDate);
  }, [activeClassActivity, sessionDate, matchingClassSession, recordedSessionDatesSet]);

  const calendarMonthLabel = useMemo(() => {
    const localeCode = language === 'gl' ? 'gl-ES' : language === 'en' ? 'en-US' : 'es-ES';
    const d = new Date(calendarViewMonth.year, calendarViewMonth.month, 1);
    return d.toLocaleDateString(localeCode, { month: 'long', year: 'numeric' });
  }, [calendarViewMonth, language]);

  const calendarWeekdayHeaders = useMemo(
    () => [
      dayNamesShort[1],
      dayNamesShort[2],
      dayNamesShort[3],
      dayNamesShort[4],
      dayNamesShort[5],
      dayNamesShort[6],
      dayNamesShort[0]
    ],
    [dayNamesShort]
  );

  const calendarGridCells = useMemo(() => {
    const { year, month } = calendarViewMonth;
    const firstOfMonth = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const startOffset = (firstOfMonth.getDay() + 6) % 7;
    const cells: Array<
      | {
          key: string;
          day: number;
          dateStr: string;
          isToday: boolean;
          isSelected: boolean;
          isPast: boolean;
          hasRecorded: boolean;
          isClosed: boolean;
          isScheduled: boolean;
        }
      | null
    > = [];

    for (let i = 0; i < startOffset; i++) {
      cells.push(null);
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const cellDate = new Date(year, month, day);
      const dateStr = formatIsoDateLocal(cellDate);
      cells.push({
        key: dateStr,
        day,
        dateStr,
        isToday: dateStr === todayStr,
        isSelected: dateStr === sessionDate,
        isPast: dateStr < todayStr,
        hasRecorded: recordedSessionDatesSet.has(dateStr),
        isClosed: closedSessionDatesSet.has(dateStr),
        isScheduled: isDateInActivitySchedule(activeClassActivity, dateStr)
      });
    }

    return cells;
  }, [
    calendarViewMonth,
    todayStr,
    sessionDate,
    recordedSessionDatesSet,
    closedSessionDatesSet,
    activeClassActivity
  ]);

  const handleToggleCalendar = () => {
    setIsCalendarOpen(prev => {
      const next = !prev;
      if (next) {
        const parsed = parseIsoDateLocal(sessionDate) || new Date();
        setCalendarViewMonth({ year: parsed.getFullYear(), month: parsed.getMonth() });
      }
      return next;
    });
  };

  const shiftCalendarMonth = (delta: number) => {
    setCalendarViewMonth(prev => {
      const d = new Date(prev.year, prev.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  };

  // Ausencias avisadas, pendientes o aprobadas por alumnos para la actividad y fecha seleccionadas
  const reportedAbsencesByStudentId = useMemo(() => {
    const map = new Map<string, { id: string; status: StudentAbsence['status']; reason?: string }>();
    if (!activeClassActivity) return map;
    const cleanSessionDate = sessionDate.slice(0, 10);
    for (const a of studentAbsences) {
      if (
        a.activityId === activeClassActivity.id &&
        a.sessionDate?.slice(0, 10) === cleanSessionDate &&
        (a.status === 'reported' || a.status === 'pending' || a.status === 'approved')
      ) {
        map.set(a.studentId, { id: a.id, status: a.status, reason: a.reason });
      }
    }
    return map;
  }, [studentAbsences, activeClassActivity, sessionDate]);

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
  const prefilledAbsenceKeysRef = useRef<Set<string>>(new Set());
  const manualAttendanceOverridesRef = useRef<Set<string>>(new Set());
  const prevReportedAbsenceIdsRef = useRef<Set<string>>(new Set());

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
      prevReportedAbsenceIdsRef.current = new Set(reportedAbsencesByStudentId.keys());

      if (matchingClassSession?.attendanceRecords?.length) {
        const hydratedAttendance: Record<string, 'present' | 'absent' | 'partial'> = {};
        matchingClassSession.attendanceRecords.forEach(rec => {
          hydratedAttendance[rec.studentId] = rec.attendance;
        });
        if (!matchingClassSession.isClosed) {
          reportedAbsencesByStudentId.forEach((_, stId) => {
            const overrideKey = `${sessionContextKey}::${stId}`;
            if (!manualAttendanceOverridesRef.current.has(overrideKey)) {
              hydratedAttendance[stId] = 'absent';
              prefilledAbsenceKeysRef.current.add(overrideKey);
            }
          });
        }
        setAttendanceMap(hydratedAttendance);
      } else {
        const prefilledAttendance: Record<string, 'present' | 'absent' | 'partial'> = {};
        reportedAbsencesByStudentId.forEach((_, stId) => {
          prefilledAttendance[stId] = 'absent';
          prefilledAbsenceKeysRef.current.add(`${sessionContextKey}::${stId}`);
        });
        setAttendanceMap(prefilledAttendance);
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
          if (!matchingClassSession.isClosed) {
            reportedAbsencesByStudentId.forEach((_, stId) => {
              const overrideKey = `${sessionContextKey}::${stId}`;
              if (!manualAttendanceOverridesRef.current.has(overrideKey)) {
                hydratedAttendance[stId] = 'absent';
                prefilledAbsenceKeysRef.current.add(overrideKey);
              }
            });
          }
          return hydratedAttendance;
        });
      }
    }

    if (!isSessionTopicDirtyRef.current && hydratedTopic !== lastHydratedTopicRef.current) {
      lastHydratedTopicRef.current = hydratedTopic;
      setSessionTopic(hydratedTopic);
    }
  }, [sessionContextKey, activeClassActivity?.name, matchingClassSession, reportedAbsencesByStudentId]);

  useEffect(() => {
    if (isCurrentClassClosed) {
      prevReportedAbsenceIdsRef.current = new Set(reportedAbsencesByStudentId.keys());
      return;
    }
    const prevIds = prevReportedAbsenceIdsRef.current;
    const currentIds = new Set(reportedAbsencesByStudentId.keys());

    setAttendanceMap(prev => {
      let changed = false;
      const next = { ...prev };

      currentIds.forEach(stId => {
        const trackKey = `${sessionContextKey}::${stId}`;
        const isNewlyReported = !prevIds.has(stId);
        if (
          !manualAttendanceOverridesRef.current.has(trackKey) &&
          (isNewlyReported || (!prefilledAbsenceKeysRef.current.has(trackKey) && next[stId] !== 'absent'))
        ) {
          if (next[stId] !== 'absent') {
            next[stId] = 'absent';
            changed = true;
          }
          prefilledAbsenceKeysRef.current.add(trackKey);
        }
      });

      prevIds.forEach(stId => {
        if (!currentIds.has(stId)) {
          const trackKey = `${sessionContextKey}::${stId}`;
          if (!manualAttendanceOverridesRef.current.has(trackKey) && next[stId] === 'absent') {
            next[stId] = 'present';
            prefilledAbsenceKeysRef.current.delete(trackKey);
            changed = true;
          }
        }
      });

      return changed ? next : prev;
    });

    prevReportedAbsenceIdsRef.current = currentIds;
  }, [isCurrentClassClosed, reportedAbsencesByStudentId, sessionContextKey]);

  const [optimisticMobilePayment, setOptimisticMobilePayment] = useState<
    Record<string, PaymentStatus>
  >({});
  const [optimisticMobilePartialAmount, setOptimisticMobilePartialAmount] = useState<
    Record<string, number>
  >({});
  const mobileDesiredStatusRef = useRef<Record<string, PaymentStatus>>({});
  const mobilePaymentQueueRef = useRef<Record<string, Promise<void>>>({});
  const mobileLatestPaymentRef = useRef<
    Record<string, { id: string; status: PaymentStatus } | null>
  >({});

  const [mobilePartialModal, setMobilePartialModal] = useState<{
    studentId: string;
    studentName: string;
    fullFee: number;
    alreadyPaid: number;
    defaultAmount: number;
    currentStatus: PaymentStatus;
  } | null>(null);
  const [mobilePartialAmountInput, setMobilePartialAmountInput] = useState<string>('');
  const [mobilePartialMethodInput, setMobilePartialMethodInput] = useState<PaymentMethod>('cash');
  const [mobilePartialError, setMobilePartialError] = useState<string | null>(null);

  useEffect(() => {
    setOptimisticMobilePayment({});
    setOptimisticMobilePartialAmount({});
    mobileDesiredStatusRef.current = {};
    mobileLatestPaymentRef.current = {};
    setMobilePartialModal(null);
    setMobilePartialError(null);
  }, [activeClassActivity?.id, sessionDate]);

  useEffect(() => {
    if (isCurrentClassClosed && mobilePartialModal) {
      setMobilePartialModal(null);
      setMobilePartialError(null);
    }
  }, [isCurrentClassClosed, mobilePartialModal]);

  const setStudentAttendance = (studentId: string, status: 'present' | 'absent' | 'partial') => {
    if (isCurrentClassClosed) return;
    manualAttendanceOverridesRef.current.add(`${sessionContextKey}::${studentId}`);
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
    if (isCurrentClassClosed) return;
    const current = attendanceMap[studentId] || 'present';
    const next: 'present' | 'absent' = current === 'absent' ? 'present' : 'absent';
    setStudentAttendance(studentId, next);
  };

  const handleConfirmClassAbsence = async (
    studentId: string,
    studentName: string,
    absenceId: string
  ) => {
    if (confirmingAbsenceId === absenceId) return;
    setConfirmingAbsenceId(absenceId);
    setClassActionError(null);
    setSaveSuccessMsg(null);
    try {
      const res = await respondToStudentAbsenceRequest(absenceId, true);
      if (!res.success) {
        setClassActionError(res.error || t('teacherPortal.workshopsSection.absenceConfirmError'));
        return;
      }
      if (!isCurrentClassClosed) {
        manualAttendanceOverridesRef.current.delete(`${sessionContextKey}::${studentId}`);
        setAttendanceMap(prev => ({ ...prev, [studentId]: 'absent' }));
      }
      setSaveSuccessMsg(
        t('teacherPortal.classControl.absenceConfirmedSaved', { student: studentName })
      );
      setTimeout(() => setSaveSuccessMsg(null), 3500);
    } finally {
      setConfirmingAbsenceId(prev => (prev === absenceId ? null : prev));
    }
  };

  const markAllPresent = () => {
    if (isCurrentClassClosed) return;
    const updated: Record<string, 'present' | 'absent' | 'partial'> = {};
    enrolledStudentsInClass.forEach(s => {
      manualAttendanceOverridesRef.current.add(`${sessionContextKey}::${s.id}`);
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

  const getStudentPaymentStatus = (studentId: string) => {
    if (!activeClassActivity) return null;
    const isMonthly = activeClassActivity.billingMode === 'monthly';
    const matchesPeriodOrDate = (p: (typeof periodPayments)[number]) =>
      p.studentId === studentId &&
      p.activityId === activeClassActivity.id &&
      (isMonthly ? p.periodMonth === selectedPeriod : p.paymentDate?.slice(0, 10) === sessionDate);

    const priority: PaymentStatus[] = ['paid', 'partial', 'exempt', 'overdue', 'pending', 'cancelled'];
    for (const status of priority) {
      const hit = periodPayments.find(p => matchesPeriodOrDate(p) && p.status === status);
      if (hit) return hit;
    }
    return periodPayments.find(matchesPeriodOrDate) || null;
  };

  const handleConfirmDialogAction = async () => {
    if (!confirmDialog || isCurrentClassClosed) return;
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

  const handleCollectPayment = async (
    studentId: string,
    fullAmount: number,
    isPartial: boolean = false
  ) => {
    if (!activeClassActivity || isCurrentClassClosed) return;
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

    setPartialInputOpen(prev => ({ ...prev, [studentId]: false }));

    if (!attendanceMap[studentId]) {
      setStudentAttendance(studentId, 'present');
    }
  };

  const handleCompletePartialPayment = async (paymentId: string, fullAmount: number) => {
    if (!activeClassActivity || isCurrentClassClosed) return;
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

  const getMobilePaymentMeta = (status: PaymentStatus) => {
    switch (status) {
      case 'paid':
        return {
          code: t('teacherPortal.classControl.shortPaid'),
          fullLabel: t('teacherPortal.classControl.paymentPaidFull'),
          buttonClass:
            'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/45',
          rowClass: 'border-emerald-500/35 bg-emerald-50/30 dark:bg-emerald-950/15'
        };
      case 'partial':
        return {
          code: t('teacherPortal.classControl.shortPartial'),
          fullLabel: t('teacherPortal.classControl.paymentPartialFull'),
          buttonClass:
            'bg-amber-500/20 text-amber-800 dark:text-amber-300 border-amber-500/50',
          rowClass: 'border-amber-500/40 bg-amber-50/30 dark:bg-amber-950/15'
        };
      case 'overdue':
        return {
          code: t('teacherPortal.classControl.shortOverdue'),
          fullLabel: t('teacherPortal.classControl.paymentOverdueFull'),
          buttonClass:
            'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/45',
          rowClass: 'border-rose-500/35 bg-rose-50/25 dark:bg-rose-950/15'
        };
      case 'exempt':
        return {
          code: t('teacherPortal.classControl.shortExempt'),
          fullLabel: t('teacherPortal.classControl.paymentExemptFull'),
          buttonClass:
            'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/45',
          rowClass: 'border-sky-500/35 bg-sky-50/25 dark:bg-sky-950/15'
        };
      case 'cancelled':
        return {
          code: t('teacherPortal.classControl.shortCancelled'),
          fullLabel: t('teacherPortal.classControl.paymentCancelledFull'),
          buttonClass:
            'bg-zinc-200/80 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border-zinc-300 dark:border-zinc-700 line-through',
          rowClass: 'border-zinc-300/70 dark:border-zinc-700/70 bg-zinc-50/60 dark:bg-zinc-900/40'
        };
      case 'pending':
      default:
        return {
          code: t('teacherPortal.classControl.shortPending'),
          fullLabel: t('teacherPortal.classControl.paymentPendingFull'),
          buttonClass:
            'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-700',
          rowClass: 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
        };
    }
  };

  const applyMobilePaymentStatus = (
    studentId: string,
    studentFee: number,
    nextStatus: PaymentStatus,
    overridePartialAmount?: number,
    overrideMethod?: PaymentMethod
  ) => {
    if (!activeClassActivity || isCurrentClassClosed) return;
    setClassActionError(null);

    mobileDesiredStatusRef.current[studentId] = nextStatus;
    setOptimisticMobilePayment(prev => ({ ...prev, [studentId]: nextStatus }));
    if (nextStatus === 'partial') {
      const previewAmount =
        overridePartialAmount !== undefined
          ? overridePartialAmount
          : studentFee > 1
          ? Math.round((studentFee / 2) * 100) / 100
          : studentFee > 0
          ? studentFee
          : 10;
      setOptimisticMobilePartialAmount(prev => ({ ...prev, [studentId]: previewAmount }));
    } else {
      setOptimisticMobilePartialAmount(prev => {
        if (!(studentId in prev)) return prev;
        const copy = { ...prev };
        delete copy[studentId];
        return copy;
      });
    }

    const chosenMethod = overrideMethod || paymentMethodMap[studentId] || 'cash';
    if (overrideMethod) {
      setPaymentMethodMap(prev => ({ ...prev, [studentId]: overrideMethod }));
    }
    const fullFee = studentFee > 0 ? studentFee : 10;
    const partialAmount =
      overridePartialAmount !== undefined
        ? overridePartialAmount
        : fullFee > 1
        ? Math.round((fullFee / 2) * 100) / 100
        : fullFee;
    const activitySnapshot = activeClassActivity;
    const dateSnapshot = sessionDate;

    const prevTask = mobilePaymentQueueRef.current[studentId] || Promise.resolve();
    const nextTask = prevTask
      .catch(() => undefined)
      .then(async () => {
        const actions = paymentActionsRef.current;

        if (mobileLatestPaymentRef.current[studentId] === undefined) {
          const liveExisting = actions.getStudentPaymentStatus(studentId);
          mobileLatestPaymentRef.current[studentId] = liveExisting
            ? {
                id: liveExisting.id,
                status: liveExisting.status
              }
            : null;
        }

        const tracked = mobileLatestPaymentRef.current[studentId];

        if (nextStatus === 'pending') {
          if (tracked?.id) {
            await actions.deletePayment(tracked.id);
          }
          mobileLatestPaymentRef.current[studentId] = null;
          return;
        }

        const targetAmount =
          nextStatus === 'paid'
            ? overridePartialAmount ?? fullFee
            : nextStatus === 'overdue'
            ? fullFee
            : nextStatus === 'partial'
            ? partialAmount
            : 0;

        const targetNotes =
          nextStatus === 'paid'
            ? actions.t('teacherPortal.messages.classPaymentNote', {
                activity: activitySnapshot.name
              })
            : nextStatus === 'partial'
            ? actions.t('teacherPortal.messages.partialPaymentNote', {
                paid: partialAmount,
                total: fullFee,
                activity: activitySnapshot.name
              })
            : nextStatus === 'overdue'
            ? actions.t('teacherPortal.messages.overduePaymentNote', {
                activity: activitySnapshot.name
              })
            : nextStatus === 'exempt'
            ? actions.t('teacherPortal.messages.exemptPaymentNote', {
                activity: activitySnapshot.name
              })
            : actions.t('teacherPortal.messages.cancelledPaymentNote', {
                activity: activitySnapshot.name
              });

        if (tracked?.id) {
          await actions.updatePayment(tracked.id, {
            amount: targetAmount,
            status: nextStatus,
            paymentDate: dateSnapshot,
            paymentMethod: chosenMethod,
            notes: targetNotes
          });
          mobileLatestPaymentRef.current[studentId] = { id: tracked.id, status: nextStatus };
        } else {
          const created = await actions.recordClassPayment({
            studentId,
            activityId: activitySnapshot.id,
            amount: targetAmount,
            isPartial: nextStatus === 'partial',
            status: nextStatus,
            paymentMethod: chosenMethod,
            date: dateSnapshot,
            notes: targetNotes
          });
          if (created) {
            mobileLatestPaymentRef.current[studentId] = { id: created.id, status: nextStatus };
          } else {
            delete mobileDesiredStatusRef.current[studentId];
            delete mobileLatestPaymentRef.current[studentId];
            setClassActionError(
              nextStatus === 'partial'
                ? actions.t('teacherPortal.messages.mobilePartialSaveError')
                : actions.t('teacherPortal.messages.paymentSaveError')
            );
          }
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
          setOptimisticMobilePartialAmount(prev => {
            if (!(studentId in prev)) return prev;
            const copy = { ...prev };
            delete copy[studentId];
            return copy;
          });
        }
      });

    mobilePaymentQueueRef.current[studentId] = nextTask;
  };

  const openMobilePartialModal = (studentId: string, studentName: string, studentFee: number) => {
    if (!activeClassActivity || isCurrentClassClosed) return;
    const existingPayment = getStudentPaymentStatus(studentId);
    const currentStatus: PaymentStatus =
      mobileDesiredStatusRef.current[studentId] ||
      optimisticMobilePayment[studentId] ||
      existingPayment?.status ||
      'pending';
    const fullFee = studentFee > 0 ? studentFee : 10;
    const halfDefault = fullFee > 1 ? Math.round((fullFee / 2) * 100) / 100 : fullFee;
    const hasExistingPartial =
      existingPayment?.status === 'partial' &&
      existingPayment.amount > 0 &&
      existingPayment.amount < fullFee;
    const alreadyPaid = hasExistingPartial ? existingPayment.amount : 0;
    const remainingBalance = hasExistingPartial
      ? Math.round((fullFee - existingPayment.amount) * 100) / 100
      : 0;
    const defaultAmount = remainingBalance > 0 ? remainingBalance : halfDefault;

    setMobilePartialAmountInput(String(defaultAmount));
    setMobilePartialMethodInput(
      paymentMethodMap[studentId] || existingPayment?.paymentMethod || 'cash'
    );
    setMobilePartialError(null);
    setMobilePartialModal({
      studentId,
      studentName,
      fullFee,
      alreadyPaid,
      defaultAmount,
      currentStatus
    });
  };

  const handleToggleMobilePaid = (studentId: string, studentFee: number) => {
    if (!activeClassActivity || isCurrentClassClosed) return;
    setClassActionError(null);

    const existingPayment = getStudentPaymentStatus(studentId);
    const currentEffectiveStatus: PaymentStatus =
      mobileDesiredStatusRef.current[studentId] ||
      optimisticMobilePayment[studentId] ||
      existingPayment?.status ||
      'pending';

    const nextStatus: PaymentStatus = currentEffectiveStatus === 'paid' ? 'pending' : 'paid';
    applyMobilePaymentStatus(studentId, studentFee, nextStatus);
  };

  const handleConfirmMobilePartialModal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!mobilePartialModal || isCurrentClassClosed) return;

    const normalized = mobilePartialAmountInput.replace(',', '.').trim();
    const parsedAmount = Number(normalized);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setMobilePartialError(t('teacherPortal.classControl.mobilePartialModal.invalidAmountError'));
      return;
    }

    const roundedAmount = Math.round(parsedAmount * 100) / 100;
    const isFullSettled = mobilePartialModal.fullFee > 0 && roundedAmount >= mobilePartialModal.fullFee;
    const targetStatus: PaymentStatus = isFullSettled ? 'paid' : 'partial';

    applyMobilePaymentStatus(
      mobilePartialModal.studentId,
      mobilePartialModal.fullFee,
      targetStatus,
      roundedAmount,
      mobilePartialMethodInput
    );
    setMobilePartialModal(null);
    setMobilePartialError(null);
  };

  const handleCollectAllPresent = () => {
    if (!activeClassActivity || isCurrentClassClosed) return;
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
                  status: livePayment.status
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

  const handleSaveClassSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeClassActivity || !currentTeacher?.id || isCurrentClassClosed) return;

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

  const handleCloseClass = async () => {
    if (!activeClassActivity || !currentTeacher?.id || isCurrentClassClosed || isClosingClass) return;
    setIsClosingClass(true);
    setClassActionError(null);
    try {
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

      const res = await closeClassSession({
        sessionId: matchingClassSession?.id,
        activityId: activeClassActivity.id,
        teacherId: currentTeacher.id,
        date: sessionDate,
        closedBy: actorClassRole,
        attendeesCount: attendees,
        durationMinutes: sessionDuration,
        topic: trimmedNotes,
        attendanceRecords
      });

      if (!res.success && res.error) {
        setClassActionError(res.error);
        return;
      }

      setSaveSuccessMsg(
        t('teacherPortal.messages.classClosedSaved', { date: sessionDate, count: attendees })
      );
      setTimeout(() => setSaveSuccessMsg(null), 4000);
    } finally {
      setIsClosingClass(false);
    }
  };

  const openReopenClassModal = () => {
    setReopenReasonInput('');
    setReopenReasonError(null);
    setIsReopenModalOpen(true);
  };

  const handleConfirmReopenClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeClassActivity || !currentTeacher?.id || isReopeningClass) return;
    const trimmedReason = reopenReasonInput.trim();
    if (!trimmedReason) {
      setReopenReasonError(t('teacherPortal.classControl.reopenModal.reasonRequired'));
      return;
    }

    setIsReopeningClass(true);
    setReopenReasonError(null);
    setClassActionError(null);
    try {
      const res = await reopenClassSession({
        sessionId: matchingClassSession?.id,
        activityId: activeClassActivity.id,
        teacherId: currentTeacher.id,
        date: sessionDate,
        reason: trimmedReason,
        reopenedBy: actorClassRole
      });

      if (!res.success) {
        setReopenReasonError(
          res.error || t('teacherPortal.classControl.reopenModal.reasonRequired')
        );
        return;
      }

      setIsReopenModalOpen(false);
      setReopenReasonInput('');
      setSaveSuccessMsg(t('teacherPortal.messages.classReopenedSaved', { date: sessionDate }));
      setTimeout(() => setSaveSuccessMsg(null), 4000);
    } finally {
      setIsReopeningClass(false);
    }
  };

  const handleRegisterUnscheduledClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeClassActivity || !currentTeacher?.id || !sessionDate) return;
    setIsRegisteringUnscheduled(true);
    setClassActionError(null);
    try {
      const trimmedTopic = unscheduledTopic.trim();
      const durationVal = Math.max(15, Number(unscheduledDuration) || 75);
      const initialRecords = enrolledStudentsInClass.map(s => {
        const hasAbsence = reportedAbsencesByStudentId.has(s.id);
        const attendance: 'present' | 'absent' =
          !unscheduledPrefillPresent || hasAbsence ? 'absent' : 'present';
        const pay = getStudentPaymentStatus(s.id);
        return {
          studentId: s.id,
          studentName: s.name,
          attendance,
          paid: pay?.status === 'paid' || pay?.status === 'partial',
          paidAmount: pay?.amount,
          paymentMethod: pay?.paymentMethod,
          paymentId: pay?.id
        };
      });
      const attendeesCount = initialRecords.filter(r => r.attendance !== 'absent').length;

      setSessionDuration(durationVal);
      isSessionTopicDirtyRef.current = false;
      lastHydratedTopicRef.current = trimmedTopic;
      setSessionTopic(trimmedTopic);

      await addClassSession({
        activityId: activeClassActivity.id,
        teacherId: currentTeacher.id,
        date: sessionDate,
        attendeesCount,
        durationMinutes: durationVal,
        topic: trimmedTopic,
        attendanceRecords: initialRecords
      });

      setUnscheduledTopic('');
      setSaveSuccessMsg(
        t('teacherPortal.messages.unscheduledClassRegistered', {
          date: sessionDate,
          count: attendeesCount
        })
      );
      setTimeout(() => setSaveSuccessMsg(null), 4000);
    } finally {
      setIsRegisteringUnscheduled(false);
    }
  };
  
  const [expandedMobileStudents, setExpandedMobileStudents] = useState<Record<string, boolean>>({});

  const toggleMobileStudentDetails = (studentId: string) => {
    setExpandedMobileStudents(prev => ({
      ...prev,
      [studentId]: !prev[studentId]
    }));
  }; 

  return (
    <div className="space-y-6">
      {/* Banner Principal del Monitor */}
      <div className="rounded-2xl border border-indigo-500/20 bg-gradient-to-r from-indigo-950/30 via-slate-900/50 to-indigo-900/20 p-5 shadow-xs backdrop-blur-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5 min-w-0 flex-1">
            <div className="relative group shrink-0">
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

            <div className="min-w-0 flex-1">
            {/* Fila superior: Título del portal a la izquierda + Número de socio a la derecha */}
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] uppercase font-bold text-indigo-400 tracking-wider truncate">
                {t('teacherPortal.banner.portalTag')}
              </span>

              {formattedMemberNumber && (
                <span className="inline-flex items-center gap-1 rounded-lg border border-indigo-500/30 bg-white/85 dark:bg-slate-900/75 px-2 py-0.5 text-[10px] sm:text-[11px] font-mono font-bold text-indigo-800 dark:text-indigo-200 shadow-2xs whitespace-nowrap shrink-0">
                  <IdCard className="h-3 w-3 text-indigo-600 dark:text-indigo-400 shrink-0" />
                  <span>{t('common.socioNumberBadge', { number: formattedMemberNumber })}</span>
                </span>
              )}
            </div>

            {/* Debajo del título del portal: textos/insignias secundarias */}
            {/*<div className="mt-1 flex items-center gap-2 flex-wrap">
              <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300 border border-emerald-500/20 whitespace-nowrap shrink-0">
                {currentTeacher?.collectionType === 'personal'
                  ? t('teacherPortal.banner.collectionPersonal')
                  : t('teacherPortal.banner.collectionAssociation')}
              </span>
            </div>*/}

            <h2 className="text-lg font-black text-slate-900 dark:text-white truncate mt-1">
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

          {currentRole === UserRole.Admin && (
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
          <div className="@container rounded-xl border border-amber-500/25 bg-white dark:bg-slate-900 overflow-hidden">
            <div className="hidden @[560px]:grid @[560px]:grid-cols-[minmax(0,1.3fr)_minmax(0,1.2fr)_150px] items-center gap-3 px-3.5 py-2 bg-amber-100/50 dark:bg-amber-950/40 border-b border-amber-500/20 text-[10px] font-bold uppercase tracking-wider text-amber-800/80 dark:text-amber-300/80">
              <span>{t('common.columns.student')}</span>
              <span>{t('common.columns.workshop')}</span>
              <span className="text-right">{t('common.columns.actions')}</span>
            </div>
            <div className="divide-y divide-amber-500/15">
              {myPendingRequests.map(req => {
                const cKey = `c:${req.studentId}:${req.activityId}`;
                const rKey = `r:${req.studentId}:${req.activityId}`;
                const isBusy = portalRequestBusyKey === cKey || portalRequestBusyKey === rKey;
                return (
                  <div
                    key={`${req.studentId}-${req.activityId}`}
                    className="px-3.5 py-2.5 grid grid-cols-[minmax(0,1fr)_auto] @[560px]:grid-cols-[minmax(0,1.3fr)_minmax(0,1.2fr)_150px] items-center gap-2.5 @[560px]:gap-3 text-xs hover:bg-amber-50/40 dark:hover:bg-amber-950/20 transition"
                  >
                    <div className="min-w-0 flex flex-col gap-0.5 @[560px]:contents">
                      <StudentNameButton
                        name={req.studentName}
                        phone={req.studentPhone}
                        email={req.studentEmail}
                        subtitle={req.activityName}
                        className="font-bold text-slate-900 dark:text-white text-left break-words"
                      />
                      <span className="text-[11px] text-indigo-600 dark:text-indigo-400 font-semibold break-words min-w-0">
                        {req.activityName}
                      </span>
                    </div>
                    <div className="flex items-center justify-end gap-1.5 shrink-0">
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
                        title={t('teacherPortal.pendingBanner.confirm')}
                        aria-label={t('teacherPortal.pendingBanner.confirm')}
                        className="inline-flex h-7 w-7 @[560px]:h-auto @[560px]:w-auto items-center justify-center @[560px]:gap-1 rounded-lg bg-emerald-600 @[560px]:px-2.5 @[560px]:py-1 text-[11px] font-bold text-white hover:bg-emerald-700 transition disabled:opacity-50 whitespace-nowrap"
                      >
                        {portalRequestBusyKey === cKey ? (
                          <Loader2 className="h-3.5 w-3.5 @[560px]:h-3 @[560px]:w-3 animate-spin" />
                        ) : (
                          <Check className="h-3.5 w-3.5 @[560px]:h-3 @[560px]:w-3" />
                        )}
                        <span className="hidden @[560px]:inline">{portalRequestBusyKey === cKey ? '...' : t('teacherPortal.pendingBanner.confirm')}</span>
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
        </div>
      )}

      {/* Banner de solicitudes de baja pendientes de revisión por el monitor */}
      {myPendingDropRequests.length > 0 && (
        <div className="rounded-2xl border border-rose-500/35 bg-rose-50/80 dark:bg-rose-950/25 p-4 shadow-xs space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-rose-900 dark:text-rose-200 flex items-center gap-1.5">
              <AlertTriangle className="h-4 w-4 text-rose-600 dark:text-rose-400 shrink-0" />
              <span>{t('teacherPortal.pendingBanner.dropsTitle', { count: myPendingDropRequests.length })}</span>
            </span>
          </div>
          {portalRequestError && myPendingRequests.length === 0 && (
            <p className="text-xs font-semibold text-rose-600 dark:text-rose-400">{portalRequestError}</p>
          )}
          <div className="@container rounded-xl border border-rose-500/25 bg-white dark:bg-slate-900 overflow-hidden">
            <div className="hidden @[680px]:grid @[680px]:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_110px_minmax(0,1.1fr)_156px] items-center gap-3 px-3.5 py-2 bg-rose-100/50 dark:bg-rose-950/40 border-b border-rose-500/20 text-[10px] font-bold uppercase tracking-wider text-rose-800/80 dark:text-rose-300/80">
              <span>{t('common.columns.student')}</span>
              <span>{t('common.columns.workshop')}</span>
              <span>{t('common.columns.status')}</span>
              <span>{t('common.columns.reason')}</span>
              <span className="text-right">{t('common.columns.actions')}</span>
            </div>
            <div className="divide-y divide-rose-500/15">
              {myPendingDropRequests.map(req => {
                const rKey = `rd:${req.studentId}:${req.activityId}`;
                const isBusy = portalRequestBusyKey === rKey || isPortalDropModerating;
                return (
                  <div
                    key={`${req.studentId}-${req.activityId}`}
                    className="px-3.5 py-2.5 grid grid-cols-[minmax(0,1fr)_auto] @[680px]:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_110px_minmax(0,1.1fr)_156px] items-center gap-2.5 @[680px]:gap-3 text-xs hover:bg-rose-50/40 dark:hover:bg-rose-950/20 transition"
                  >
                    <div className="min-w-0 space-y-1 @[680px]:contents">
                      <StudentNameButton
                        name={req.studentName}
                        phone={req.studentPhone}
                        email={req.studentEmail}
                        subtitle={req.activityName}
                        className="font-bold text-slate-900 dark:text-white text-left break-words"
                      />
                      <span className="text-[11px] text-rose-700 dark:text-rose-300 font-semibold break-words block @[680px]:inline min-w-0">
                        {req.activityName}
                      </span>
                      <div>
                        {req.unpaidCount > 0 ? (
                          <span className="inline-flex rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-800 dark:text-amber-300 whitespace-nowrap">
                            {t('teacherPortal.workshopsSection.debtWarningCount', {
                              count: req.unpaidCount,
                              amount: req.unpaidAmount.toFixed(2)
                            })}
                          </span>
                        ) : (
                          <span className="inline-flex rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-300 whitespace-nowrap">
                            {t('teacherPortal.workshopsSection.noDebtsShort')}
                          </span>
                        )}
                      </div>
                      <div className="min-w-0">
                        {req.dropReason ? (
                          <span className="text-[11px] text-slate-500 dark:text-slate-400 italic break-words block">
                            "{req.dropReason}"
                          </span>
                        ) : (
                          <span className="hidden @[680px]:inline text-[11px] text-slate-300 dark:text-slate-700">—</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center justify-end gap-1.5 shrink-0">
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => {
                          setPortalDropDebtsChecked(false);
                          setPortalDropMaterialsChecked(false);
                          setPortalDropNotes('');
                          setPortalDropTarget({
                            studentId: req.studentId,
                            studentName: req.studentName,
                            activityId: req.activityId,
                            activityName: req.activityName,
                            dropRequestedAt: req.dropRequestedAt,
                            dropReason: req.dropReason
                          });
                        }}
                        className="inline-flex items-center gap-1 rounded-lg bg-amber-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-amber-700 transition disabled:opacity-50 whitespace-nowrap"
                      >
                        <AlertTriangle className="h-3 w-3" />
                        <span>{t('teacherPortal.pendingBanner.reviewDrop')}</span>
                      </button>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={async () => {
                          setPortalRequestBusyKey(rKey);
                          setPortalRequestError(null);
                          try {
                            const res = await rejectActivityUnenrollment(req.studentId, req.activityId);
                            if (!res.success && res.error) setPortalRequestError(res.error);
                          } finally {
                            setPortalRequestBusyKey(null);
                          }
                        }}
                        title={t('teacherPortal.workshopsSection.rejectDropTooltip')}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition disabled:opacity-50"
                      >
                        {portalRequestBusyKey === rKey ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <X className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Banner de solicitudes de ausencia pendientes de confirmación (clases cerradas o pasadas) */}
      {myPendingAbsenceRequests.length > 0 && (
        <div className="rounded-2xl border border-sky-500/35 bg-sky-50/80 dark:bg-sky-950/25 p-4 shadow-xs space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-sky-900 dark:text-sky-200 flex items-center gap-1.5">
              <CalendarX2 className="h-4 w-4 text-sky-600 dark:text-sky-400 shrink-0" />
              <span>
                {t('teacherPortal.pendingBanner.absencesTitle', {
                  count: myPendingAbsenceRequests.length
                })}
              </span>
            </span>
          </div>
          {portalRequestError && myPendingRequests.length === 0 && myPendingDropRequests.length === 0 && (
            <p className="text-xs font-semibold text-rose-600 dark:text-rose-400">{portalRequestError}</p>
          )}
          <div className="@container rounded-xl border border-sky-500/25 bg-white dark:bg-slate-900 overflow-hidden">
            <div className="hidden @[660px]:grid @[660px]:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_96px_minmax(0,1.1fr)_144px] items-center gap-3 px-3.5 py-2 bg-sky-100/50 dark:bg-sky-950/40 border-b border-sky-500/20 text-[10px] font-bold uppercase tracking-wider text-sky-800/80 dark:text-sky-300/80">
              <span>{t('common.columns.student')}</span>
              <span>{t('common.columns.workshop')}</span>
              <span>{t('common.columns.date')}</span>
              <span>{t('common.columns.reason')}</span>
              <span className="text-right">{t('common.columns.actions')}</span>
            </div>
            <div className="divide-y divide-sky-500/15">
              {myPendingAbsenceRequests.map(req => {
                const aKey = `aa:${req.id}`;
                const rKey = `ar:${req.id}`;
                const isBusy = portalRequestBusyKey === aKey || portalRequestBusyKey === rKey;
                return (
                  <div
                    key={req.id}
                    className="px-3.5 py-2.5 grid grid-cols-[minmax(0,1fr)_auto] @[660px]:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_96px_minmax(0,1.1fr)_144px] items-center gap-2.5 @[660px]:gap-3 text-xs hover:bg-sky-50/40 dark:hover:bg-sky-950/20 transition"
                  >
                    <div className="min-w-0 space-y-0.5 @[660px]:contents">
                      <StudentNameButton
                        name={req.studentName}
                        phone={req.studentPhone}
                        email={req.studentEmail}
                        subtitle={`${req.activityName} · ${req.sessionDate}`}
                        className="font-bold text-slate-900 dark:text-white text-left break-words"
                      />
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 @[660px]:contents">
                        <span className="text-[11px] text-sky-700 dark:text-sky-300 font-semibold break-words min-w-0">
                          {req.activityName}
                        </span>
                        <span className="font-mono text-[11px] font-semibold text-slate-600 dark:text-slate-300 tabular-nums whitespace-nowrap">
                          {req.sessionDate}
                        </span>
                      </div>
                      <div className="min-w-0">
                        {req.reason ? (
                          <span className="text-[11px] text-slate-500 dark:text-slate-400 italic break-words block">
                            "{req.reason}"
                          </span>
                        ) : (
                          <span className="hidden @[660px]:inline text-[11px] text-slate-300 dark:text-slate-700">—</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center justify-end gap-1.5 shrink-0">
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={async () => {
                          setPortalRequestBusyKey(aKey);
                          setPortalRequestError(null);
                          try {
                            const res = await respondToStudentAbsenceRequest(req.id, true);
                            if (!res.success && res.error) setPortalRequestError(res.error);
                          } finally {
                            setPortalRequestBusyKey(null);
                          }
                        }}
                        title={t('teacherPortal.pendingBanner.confirmAbsence')}
                        aria-label={t('teacherPortal.pendingBanner.confirmAbsence')}
                        className="inline-flex h-7 w-7 @[660px]:h-auto @[660px]:w-auto items-center justify-center @[660px]:gap-1 rounded-lg bg-emerald-600 @[660px]:px-2.5 @[660px]:py-1 text-[11px] font-bold text-white hover:bg-emerald-700 transition disabled:opacity-50 whitespace-nowrap"
                      >
                        {portalRequestBusyKey === aKey ? (
                          <Loader2 className="h-3.5 w-3.5 @[660px]:h-3 @[660px]:w-3 animate-spin" />
                        ) : (
                          <Check className="h-3.5 w-3.5 @[660px]:h-3 @[660px]:w-3" />
                        )}
                        <span className="hidden @[660px]:inline">
                          {portalRequestBusyKey === aKey
                            ? '...'
                            : t('teacherPortal.pendingBanner.confirmAbsence')}
                        </span>
                      </button>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={async () => {
                          setPortalRequestBusyKey(rKey);
                          setPortalRequestError(null);
                          try {
                            const res = await respondToStudentAbsenceRequest(req.id, false);
                            if (!res.success && res.error) setPortalRequestError(res.error);
                          } finally {
                            setPortalRequestBusyKey(null);
                          }
                        }}
                        title={t('teacherPortal.pendingBanner.rejectAbsenceTooltip')}
                        aria-label={t('teacherPortal.pendingBanner.rejectAbsenceAria', {
                          student: req.studentName
                        })}
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
        </div>
      )}

      {/* Banner de mensajes sobre cuotas enviados por alumnos */}
      {myPaymentMessages.length > 0 && (
        <div className="rounded-2xl border border-indigo-500/35 bg-indigo-50/80 dark:bg-indigo-950/25 p-4 shadow-xs space-y-2.5">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-xs font-bold text-indigo-900 dark:text-indigo-200 flex items-center gap-1.5">
              <MessageSquare className="h-4 w-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
              <span>
                {myPendingPaymentMessages.length > 0
                  ? t('teacherPortal.paymentMessagesBanner.pendingTitle', {
                      count: myPendingPaymentMessages.length
                    })
                  : t('teacherPortal.paymentMessagesBanner.historyOnlyTitle', {
                      count: myEvaluatedPaymentMessages.length
                    })}
              </span>
            </span>

            {myEvaluatedPaymentMessages.length > 0 && (
              <button
                type="button"
                onClick={() => setShowEvaluatedPaymentMessages(prev => !prev)}
                className="text-[11px] font-bold text-indigo-700 dark:text-indigo-300 hover:underline"
              >
                {showEvaluatedPaymentMessages
                  ? t('teacherPortal.paymentMessagesBanner.hideEvaluated')
                  : t('teacherPortal.paymentMessagesBanner.showEvaluated', {
                      count: myEvaluatedPaymentMessages.length
                    })}
              </button>
            )}
          </div>

          {myPendingPaymentMessages.length > 0 && (
            <div className="@container rounded-xl border border-indigo-500/25 bg-white dark:bg-slate-900 overflow-hidden">
              <div className="hidden @[660px]:grid @[660px]:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_110px_minmax(0,1.2fr)_104px] items-center gap-3 px-3.5 py-2 bg-indigo-100/50 dark:bg-indigo-950/40 border-b border-indigo-500/20 text-[10px] font-bold uppercase tracking-wider text-indigo-800/80 dark:text-indigo-300/80">
                <span>{t('common.columns.student')}</span>
                <span>{t('common.columns.workshopAndPeriod')}</span>
                <span>{t('common.columns.status')}</span>
                <span>{t('common.columns.reason')}</span>
                <span className="text-right">{t('common.columns.action')}</span>
              </div>
              <div className="divide-y divide-indigo-500/15">
                {myPendingPaymentMessages.map(msg => {
                  const methodLabel = msg.paymentMethod
                    ? msg.paymentMethod === 'cash'
                      ? t('common.paymentMethods.cash')
                      : msg.paymentMethod === 'bizum'
                      ? t('common.paymentMethods.bizum')
                      : msg.paymentMethod === 'transfer'
                      ? t('common.paymentMethods.transfer')
                      : t('common.paymentMethods.card')
                    : '';
                  return (
                    <div
                      key={msg.id}
                      className="px-3.5 py-2.5 grid grid-cols-[minmax(0,1fr)_auto] @[660px]:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_110px_minmax(0,1.2fr)_104px] items-center gap-2.5 @[660px]:gap-3 text-xs hover:bg-indigo-50/40 dark:hover:bg-indigo-950/20 transition"
                    >
                      <div className="min-w-0 space-y-1 @[660px]:contents">
                        <StudentNameButton
                          name={msg.studentName}
                          phone={msg.studentPhone}
                          email={msg.studentEmail}
                          subtitle={`${msg.activityName} · ${msg.periodMonth}`}
                          className="font-bold text-slate-900 dark:text-white text-left break-words"
                        />

                        <div className="min-w-0 space-y-0.5">
                          <span className="text-[11px] text-indigo-700 dark:text-indigo-300 font-semibold break-words block">
                            {msg.activityName} · {msg.periodMonth}
                            {msg.amount !== undefined ? ` · ${msg.amount.toFixed(2)} €` : ''}
                            {msg.receiptNumber ? ` (${msg.receiptNumber})` : ''}
                          </span>
                          {msg.reportedPaid && msg.paidToName && (
                            <span className="text-[11px] text-emerald-800 dark:text-emerald-300 font-semibold block">
                              {t('teacherPortal.paymentMessagesBanner.paidToLine', {
                                recipient: msg.paidToName,
                                method: methodLabel ? ` (${methodLabel})` : ''
                              })}
                            </span>
                          )}
                        </div>

                        <div>
                          <span
                            className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-bold whitespace-nowrap ${
                              msg.reportedPaid
                                ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                                : 'bg-sky-500/15 text-sky-700 dark:text-sky-300'
                            }`}
                          >
                            {msg.reportedPaid
                              ? t('teacherPortal.paymentMessagesBanner.reportedPaidBadge')
                              : t('teacherPortal.paymentMessagesBanner.inquiryBadge')}
                          </span>
                        </div>

                        <div className="min-w-0">
                          {msg.message ? (
                            <span className="text-[11px] text-slate-600 dark:text-slate-300 italic break-words block">
                              "{msg.message}"
                            </span>
                          ) : (
                            <span className="hidden @[660px]:inline text-[11px] text-slate-300 dark:text-slate-700">—</span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center justify-end shrink-0">
                        <button
                          type="button"
                          onClick={() => openEvaluatePaymentMessageModal(msg)}
                          className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-indigo-700 transition shrink-0 whitespace-nowrap"
                        >
                          <ClipboardCheck className="h-3.5 w-3.5" />
                          <span>{t('teacherPortal.paymentMessagesBanner.evaluateButton')}</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {showEvaluatedPaymentMessages && myEvaluatedPaymentMessages.length > 0 && (
            <div className="@container rounded-xl border border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-slate-900/80 overflow-hidden">
              <div className="hidden @[660px]:grid @[660px]:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_100px_minmax(0,1.2fr)_110px] items-center gap-3 px-3.5 py-2 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                <span>{t('common.columns.student')}</span>
                <span>{t('common.columns.workshopAndPeriod')}</span>
                <span>{t('common.columns.status')}</span>
                <span>{t('common.columns.notes')}</span>
                <span className="text-right">{t('common.columns.action')}</span>
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {myEvaluatedPaymentMessages.map(msg => {
                  const isApproved = msg.status === 'approved';
                  return (
                    <div
                      key={msg.id}
                      className="px-3.5 py-2 grid grid-cols-[minmax(0,1fr)_auto] @[660px]:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_100px_minmax(0,1.2fr)_110px] items-center gap-2.5 @[660px]:gap-3 text-xs hover:bg-slate-50/70 dark:hover:bg-slate-800/30 transition"
                    >
                      <div className="min-w-0 space-y-0.5 @[660px]:contents">
                        <StudentNameButton
                          name={msg.studentName}
                          phone={msg.studentPhone}
                          email={msg.studentEmail}
                          subtitle={`${msg.activityName} · ${msg.periodMonth}`}
                          className="font-bold text-slate-900 dark:text-white text-left break-words"
                        />
                        <span className="text-[11px] text-slate-500 dark:text-slate-400 break-words block @[660px]:inline min-w-0">
                          {msg.activityName} · {msg.periodMonth}
                          {msg.paidToName ? ` · ${msg.paidToName}` : ''}
                        </span>
                        <div>
                          <span
                            className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-bold whitespace-nowrap ${
                              isApproved
                                ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                                : 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
                            }`}
                          >
                            {isApproved
                              ? t('teacherPortal.paymentMessagesBanner.statusApproved')
                              : t('teacherPortal.paymentMessagesBanner.statusRejected')}
                          </span>
                        </div>
                        <div className="min-w-0">
                          {msg.teacherEvaluation ? (
                            <span className="text-[11px] text-slate-700 dark:text-slate-300 break-words block">
                              {t('teacherPortal.paymentMessagesBanner.evaluationPrefix')}{' '}
                              {msg.teacherEvaluation}
                            </span>
                          ) : (
                            <span className="hidden @[660px]:inline text-[11px] text-slate-300 dark:text-slate-700">—</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center justify-end shrink-0">
                        <button
                          type="button"
                          onClick={() => openEvaluatePaymentMessageModal(msg)}
                          className="rounded-lg border border-slate-200 dark:border-slate-700 px-2 py-1 text-[10px] font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0 whitespace-nowrap"
                        >
                          {t('teacherPortal.paymentMessagesBanner.reEvaluateButton')}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Pestañas de Navegación Interna del Portal (ocultas en rol Monitor puro porque usa barra principal) */}
      {currentRole !== UserRole.Monitor && (
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
      {(currentRole === UserRole.Monitor || activeTab === 'class_control') && (
        <div className="space-y-5">
          {/* Acordeón único de Selección de Taller/Clase, Fecha y Alumnos Inscritos */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
            {/* Cabecera clicable del Acordeón */}
            <button
              type="button"
              onClick={() => setIsWorkshopAccordionOpen(prev => !prev)}
              aria-expanded={isWorkshopAccordionOpen}
              aria-label={
                isWorkshopAccordionOpen
                  ? t('teacherPortal.classControl.accordionToggleCollapse')
                  : t('teacherPortal.classControl.accordionToggleExpand')
              }
              className="w-full px-4 py-3.5 text-left flex items-center justify-between gap-3 rounded-2xl hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition touch-manipulation"
            >
              <div className="min-w-0 flex-1 space-y-0.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    {t('teacherPortal.classControl.selectWorkshopLabel')}
                  </span>
                  {autoDetectedMatch &&
                    autoDetectedMatch.matchType !== 'fallback' &&
                    activeClassActivity?.id === autoDetectedMatch.activity.id && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
                        <span aria-hidden="true">·</span>
                        <Clock className="h-3 w-3 shrink-0" />
                        <span>
                          {autoDetectedMatch.matchType === 'live'
                            ? t('teacherPortal.classControl.autoMatchLive')
                            : autoDetectedMatch.matchType === 'upcoming_today'
                            ? t('teacherPortal.classControl.autoMatchUpcomingToday')
                            : t('teacherPortal.classControl.autoMatchEarlierToday')}
                        </span>
                      </span>
                    )}
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white truncate">
                    {activeClassActivity?.name || t('teacherPortal.classControl.noWorkshopSelected')}
                  </span>
                  {activeClassActivity && (
                    <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                      · {t('teacherPortal.classControl.enrolledStudentsHeader', {
                        count: enrolledStudentsInClass.length
                      })}{' '}
                      · {sessionDate}
                    </span>
                  )}
                  {matchingClassSession?.isClosed && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
                      <span aria-hidden="true">·</span>
                      <Lock className="h-3 w-3 shrink-0" />
                      <span>{t('teacherPortal.classControl.classClosedBadge')}</span>
                    </span>
                  )}
                </div>
              </div>

              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 shrink-0">
                {isWorkshopAccordionOpen ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </span>
            </button>

            {/* Contenido del Acordeón: Selectores + Información + Lista de Alumnos */}
            {isWorkshopAccordionOpen && (
              <div className="border-t border-slate-200 dark:border-slate-800 p-4 space-y-4">
                <div className="space-y-3">
                  {/* Fila 1: Desplegable de Taller + botón Info */}
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <label className="block text-[11px] font-bold uppercase text-slate-500 dark:text-slate-400 truncate">
                        {t('teacherPortal.classControl.selectWorkshopLabel')}
                      </label>

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
                          className={`inline-flex items-center justify-center h-6 w-6 rounded-full transition touch-manipulation active:scale-95 ${
                            isWorkshopInfoOpen
                              ? 'bg-indigo-600 text-white shadow-xs'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-indigo-50 hover:text-indigo-600 dark:hover:bg-indigo-950/50 dark:hover:text-indigo-300'
                          }`}
                        >
                          <Info className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>

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

                  {/* Fila 2: Selector de Fecha (solo fechas de clase + botón Calendario) y + Inscribir Alumno */}
                  <div className={`grid gap-2.5 sm:gap-3 items-end ${onOpenEnrollStudent ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}>
                    <div className="min-w-0 relative" ref={calendarContainerRef}>
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <label className="block text-[11px] font-bold uppercase text-slate-500 dark:text-slate-400 truncate">
                          {t('teacherPortal.classControl.classDateLabel')}
                        </label>
                        {isCurrentClassClosed && (
                          <span
                            title={t('teacherPortal.classControl.classClosedBadge')}
                            className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 dark:text-amber-300 shrink-0"
                          >
                            <Lock className="h-3 w-3 shrink-0" />
                            <span>{t('teacherPortal.classControl.classClosedBadge')}</span>
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <select
                          value={isSelectedDateInClassDropdown ? sessionDate : '__unscheduled__'}
                          onChange={e => {
                            if (e.target.value && e.target.value !== '__unscheduled__') {
                              setSessionDate(e.target.value);
                              setIsCalendarOpen(false);
                            }
                          }}
                          className="flex-1 min-w-0 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-900 dark:text-white focus:outline-indigo-500 min-h-[40px] tabular-nums"
                        >
                          {!isSelectedDateInClassDropdown && (
                            <option value="__unscheduled__" disabled>
                              {t('teacherPortal.classControl.unscheduledDateOption', { date: sessionDate })}
                            </option>
                          )}
                          {classDateOptions.length === 0 ? (
                            <option value="" disabled>
                              {t('teacherPortal.classControl.classDatesDropdownEmpty')}
                            </option>
                          ) : (
                            classDateOptions.map(opt => (
                              <option key={opt.dateStr} value={opt.dateStr}>
                                {opt.dateLine}
                                {opt.timeLine ? ` · ${opt.timeLine}` : ''}
                                {opt.isToday ? ` · ${t('calendarView.backToToday')}` : ''}
                                {opt.isClosed ? ' · 🔒' : ''}
                              </option>
                            ))
                          )}
                        </select>

                        <button
                          type="button"
                          onClick={handleToggleCalendar}
                          aria-expanded={isCalendarOpen}
                          aria-label={t('teacherPortal.classControl.openCalendarAria')}
                          title={t('teacherPortal.classControl.openCalendarTooltip')}
                          className={`inline-flex h-[40px] w-[42px] shrink-0 items-center justify-center rounded-xl border transition touch-manipulation active:scale-95 ${
                            isCalendarOpen
                              ? 'border-indigo-600 bg-indigo-600 text-white shadow-xs'
                              : 'border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700'
                          }`}
                        >
                          <Calendar className="h-4 w-4" />
                        </button>
                      </div>

                      {/* Popover de Calendario con indicadores de clases programadas o pasadas */}
                      {isCalendarOpen && (
                        <div className="absolute left-0 right-0 sm:right-auto sm:w-80 top-full mt-2 z-40 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3.5 shadow-xl space-y-3">
                          <div className="flex items-center justify-between gap-2">
                            <button
                              type="button"
                              onClick={() => shiftCalendarMonth(-1)}
                              aria-label={t('teacherPortal.classControl.calendarPrevMonthAria')}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                            >
                              <ChevronLeft className="h-4 w-4" />
                            </button>

                            <span className="text-xs font-extrabold capitalize text-slate-900 dark:text-white">
                              {calendarMonthLabel}
                            </span>

                            <button
                              type="button"
                              onClick={() => shiftCalendarMonth(1)}
                              aria-label={t('teacherPortal.classControl.calendarNextMonthAria')}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                            >
                              <ChevronRight className="h-4 w-4" />
                            </button>
                          </div>

                          <div className="grid grid-cols-7 gap-1 text-center">
                            {calendarWeekdayHeaders.map((wd, idx) => (
                              <span
                                key={`${wd}-${idx}`}
                                className="text-[10px] font-bold uppercase text-slate-400 py-1"
                              >
                                {wd}
                              </span>
                            ))}

                            {calendarGridCells.map((cell, idx) => {
                              if (!cell) {
                                return <div key={`empty-${idx}`} className="h-9" />;
                              }
                              const hasDot = cell.hasRecorded || cell.isScheduled || cell.isClosed;
                              const dotTitle = cell.isClosed
                                ? `${t('teacherPortal.classControl.classClosedBadge')} (${cell.dateStr})`
                                : cell.hasRecorded
                                ? t('teacherPortal.classControl.calendarDayRecordedTitle', { date: cell.dateStr })
                                : cell.isScheduled
                                ? t('teacherPortal.classControl.calendarDayScheduledTitle', { date: cell.dateStr })
                                : cell.dateStr;

                              return (
                                <button
                                  key={cell.key}
                                  type="button"
                                  title={dotTitle}
                                  onClick={() => {
                                    setSessionDate(cell.dateStr);
                                    setIsCalendarOpen(false);
                                  }}
                                  className={`relative h-9 rounded-lg text-xs tabular-nums flex flex-col items-center justify-center transition touch-manipulation ${
                                    cell.isSelected
                                      ? 'bg-indigo-600 text-white font-bold shadow-xs'
                                      : cell.isToday
                                      ? 'ring-1 ring-indigo-500/60 bg-indigo-50/60 dark:bg-indigo-950/30 font-bold text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-950/50'
                                      : cell.isPast
                                      ? 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 font-medium'
                                      : 'text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold'
                                  }`}
                                >
                                  <span className="leading-none">{cell.day}</span>
                                  {cell.isClosed ? (
                                    <Lock
                                      aria-hidden="true"
                                      className={`mt-0.5 h-2.5 w-2.5 ${
                                        cell.isSelected
                                          ? 'text-white'
                                          : 'text-amber-600 dark:text-amber-400'
                                      }`}
                                    />
                                  ) : (
                                    hasDot && (
                                      <span
                                        aria-hidden="true"
                                        className={`mt-1 h-1.5 w-1.5 rounded-full ${
                                          cell.isSelected
                                            ? 'bg-white'
                                            : cell.hasRecorded
                                            ? 'bg-emerald-500'
                                            : cell.isPast
                                            ? 'bg-amber-500'
                                            : 'bg-indigo-500'
                                        }`}
                                      />
                                    )
                                  )}
                                </button>
                              );
                            })}
                          </div>

                          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2 text-[10px] text-slate-500 dark:text-slate-400">
                            <div className="flex items-center gap-2.5 flex-wrap">
                              <span className="inline-flex items-center gap-1">
                                <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
                                <span>{t('teacherPortal.classControl.calendarLegendScheduled')}</span>
                              </span>
                              <span className="inline-flex items-center gap-1">
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                <span>{t('teacherPortal.classControl.calendarLegendRecordedOrPast')}</span>
                              </span>
                            </div>

                            <button
                              type="button"
                              onClick={() => {
                                setSessionDate(nearestUpcomingClassDate);
                                setIsCalendarOpen(false);
                              }}
                              className="font-bold text-indigo-600 dark:text-indigo-400 hover:underline whitespace-nowrap shrink-0"
                            >
                              {t('teacherPortal.classControl.calendarGoToNextClass')}
                            </button>
                          </div>
                        </div>
                      )}
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
                  <div className="pt-3 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300">
                    {/* Móvil: Cajas 2 columnas consistentes */}
                    <div className="sm:hidden space-y-2.5">
                      <div className="grid grid-cols-2 gap-2.5 items-start">
                        <div className="rounded-xl bg-slate-50 dark:bg-slate-800/40 p-2.5 border border-slate-200/60 dark:border-slate-800 min-w-0">
                          <span className="text-[10px] uppercase font-bold text-slate-400 block leading-tight">
                            {activeClassActivity.billingMode === 'per_class'
                              ? t('teacherPortal.classControl.modalityPerClass')
                              : t('teacherPortal.classControl.modalityMonthly')}
                          </span>
                          <span className="font-bold text-xs tabular-nums text-slate-900 dark:text-white mt-0.5 block truncate">
                            {activeClassActivity.billingMode === 'per_class'
                              ? t('teacherPortal.classControl.baseFeePerClass', { price: activeClassActivity.defaultPricePerClass })
                              : t('teacherPortal.classControl.baseFeeMonthly', { price: activeClassActivity.defaultPriceMonthly })}
                          </span>
                        </div>

                        <div className="rounded-xl bg-slate-50 dark:bg-slate-800/40 p-2.5 border border-slate-200/60 dark:border-slate-800 min-w-0">
                          <span className="text-[10px] uppercase font-bold text-slate-400 block leading-tight">
                            {t('activitiesView.roomLabel')}
                          </span>
                          <span className="font-semibold text-xs text-slate-900 dark:text-white mt-0.5 block truncate">
                            {activeClassActivity.room}
                          </span>
                        </div>
                      </div>

                      {activeClassActivity.schedule.length > 0 && (
                        <div className="min-w-0">
                          <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1.5 leading-tight">
                            {t('activitiesView.scheduleLabel')}
                          </span>
                          <div className="flex flex-wrap gap-1.5">
                            {activeClassActivity.schedule.map((sch, i) => (
                              <span
                                key={i}
                                className="inline-flex items-center gap-1 rounded-xl bg-slate-100 dark:bg-slate-800/80 px-2.5 py-1.5 text-[11px] font-medium text-slate-700 dark:text-slate-300"
                              >
                                <Clock className="h-3 w-3 text-emerald-600 shrink-0" />
                                <span>{sch}</span>
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {activeClassActivity.bizum_enabled && activeClassActivity.bizum_phone && (
                        <div className="flex items-center gap-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-300 border border-emerald-500/20">
                          <Smartphone className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">
                            {t('teacherPortal.classControl.bizumAvailable', {
                              phone: activeClassActivity.bizum_phone,
                              concept: activeClassActivity.bizum_concept || activeClassActivity.name
                            })}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Escritorio (sm+) */}
                    <div className="hidden sm:flex flex-wrap items-center justify-between gap-3">
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
                  </div>
                )}

                {/* Divisor entre selectores y lista de alumnos / registro de clase no programada */}
                <div className="border-t border-slate-200 dark:border-slate-800 pt-4 space-y-3">
                  {isUnscheduledSelectedDate && activeClassActivity ? (
                    <form
                      onSubmit={handleRegisterUnscheduledClass}
                      className="rounded-xl border border-amber-500/35 bg-amber-50/70 dark:bg-amber-950/20 p-4 space-y-3.5"
                    >
                      <div className="flex items-start gap-2.5">
                        <CalendarPlus className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                        <div className="min-w-0 flex-1">
                          <h4 className="text-sm font-extrabold text-amber-900 dark:text-amber-200">
                            {t('teacherPortal.classControl.unscheduledPromptTitle', { date: sessionDate })}
                          </h4>
                          <p className="text-xs text-amber-800/90 dark:text-amber-300/90 mt-0.5">
                            {t('teacherPortal.classControl.unscheduledPromptSubtitle', {
                              activity: activeClassActivity.name
                            })}
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                        <div className="sm:col-span-1">
                          <label className="block text-[11px] font-bold uppercase text-slate-600 dark:text-slate-300 mb-1">
                            {t('teacherPortal.classControl.unscheduledDurationLabel')}
                          </label>
                          <input
                            type="number"
                            min={15}
                            step={5}
                            value={unscheduledDuration}
                            onChange={e => setUnscheduledDuration(Number(e.target.value))}
                            className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-bold text-slate-900 dark:text-white focus:outline-indigo-500 min-h-[40px] tabular-nums"
                            required
                          />
                        </div>

                        <div className="sm:col-span-3">
                          <label className="block text-[11px] font-bold uppercase text-slate-600 dark:text-slate-300 mb-1">
                            {t('teacherPortal.classControl.unscheduledTopicLabel')}
                          </label>
                          <input
                            type="text"
                            value={unscheduledTopic}
                            onChange={e => setUnscheduledTopic(e.target.value)}
                            placeholder={t('teacherPortal.classControl.unscheduledTopicPlaceholder')}
                            className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-indigo-500 min-h-[40px]"
                            required
                          />
                        </div>
                      </div>

                      {enrolledStudentsInClass.length > 0 && (
                        <label className="flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={unscheduledPrefillPresent}
                            onChange={e => setUnscheduledPrefillPresent(e.target.checked)}
                            className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                          />
                          <span>{t('teacherPortal.classControl.unscheduledPrefillPresentLabel')}</span>
                        </label>
                      )}

                      <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => setSessionDate(nearestUpcomingClassDate)}
                          className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition min-h-[40px]"
                        >
                          {t('teacherPortal.classControl.unscheduledBackToNextClass')}
                        </button>
                        <button
                          type="submit"
                          disabled={isRegisteringUnscheduled || !unscheduledTopic.trim()}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 shadow-xs transition min-h-[40px] disabled:opacity-50"
                        >
                          {isRegisteringUnscheduled ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <CalendarPlus className="h-3.5 w-3.5" />
                          )}
                          <span>
                            {isRegisteringUnscheduled
                              ? t('teacherPortal.classControl.unscheduledSubmitting')
                              : t('teacherPortal.classControl.unscheduledSubmitButton')}
                          </span>
                        </button>
                      </div>
                    </form>
                  ) : (
                    <>
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                        <div className="flex items-center gap-2 flex-wrap text-xs font-bold text-slate-700 dark:text-slate-300">
                          <Users className="h-4 w-4 text-indigo-500 shrink-0" />
                          <span>{t('teacherPortal.classControl.enrolledStudentsHeader', { count: enrolledStudentsInClass.length })}</span>
                          {matchingClassSession?.isClosed && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 dark:text-amber-300">
                              <span aria-hidden="true">·</span>
                              <Lock className="h-3 w-3 shrink-0" />
                              <span>{t('teacherPortal.classControl.classClosedBadge')}</span>
                            </span>
                          )}
                        </div>
                      </div>

                      {isCurrentClassClosed && matchingClassSession && (() => {
                        const closedByVal = matchingClassSession.closedBy || 'profesor';
                        const closedByLabel = t(
                          `teacherPortal.classControl.closedBy.${closedByVal}` as
                            | 'teacherPortal.classControl.closedBy.profesor'
                            | 'teacherPortal.classControl.closedBy.automatica'
                            | 'teacherPortal.classControl.closedBy.administrador'
                        );
                        const closedAtFormatted = formatClosedTimestamp(matchingClassSession.closedAt);
                        const CloserIcon =
                          closedByVal === 'automatica'
                            ? Bot
                            : closedByVal === 'administrador'
                            ? ShieldCheck
                            : UserCheck;
                        return (
                          <div className="rounded-xl border border-amber-500/35 bg-amber-50/80 dark:bg-amber-950/25 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="flex items-start gap-2.5 min-w-0">
                              <Lock className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                              <div className="min-w-0 space-y-0.5">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-xs font-extrabold text-amber-950 dark:text-amber-200">
                                    {t('teacherPortal.classControl.closedReadOnlyBannerTitle')}
                                  </span>
                                  <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-800 dark:text-amber-300">
                                    <CloserIcon className="h-3 w-3 shrink-0" />
                                    <span>{closedByLabel}</span>
                                  </span>
                                  {closedAtFormatted && (
                                    <span className="text-[11px] font-medium text-amber-800/80 dark:text-amber-300/80 tabular-nums">
                                      · {closedAtFormatted}
                                    </span>
                                  )}
                                </div>
                                <p className="text-[11px] text-amber-900/90 dark:text-amber-200/85">
                                  {t('teacherPortal.classControl.closedReadOnlyBannerBody')}
                                </p>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={openReopenClassModal}
                              className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-amber-500/40 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-bold text-amber-800 dark:text-amber-200 hover:bg-amber-100/70 dark:hover:bg-amber-950/60 transition shrink-0 min-h-[38px]"
                            >
                              <Unlock className="h-3.5 w-3.5 shrink-0" />
                              <span>{t('teacherPortal.classControl.reopenClassButton')}</span>
                            </button>
                          </div>
                        );
                      })()}

                      {!isCurrentClassClosed && matchingClassSession?.reopenReason && (
                        <div className="rounded-xl border border-indigo-500/25 bg-indigo-50/70 dark:bg-indigo-950/25 px-3 py-2 text-[11px] font-medium text-indigo-800 dark:text-indigo-200 flex items-center gap-2">
                          <Unlock className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                          <span>
                            {t('teacherPortal.classControl.reopenHistoryBanner', {
                              by: t(
                                `teacherPortal.classControl.closedBy.${
                                  matchingClassSession.reopenedBy || 'profesor'
                                }` as
                                  | 'teacherPortal.classControl.closedBy.profesor'
                                  | 'teacherPortal.classControl.closedBy.administrador'
                              ),
                              reason: matchingClassSession.reopenReason
                            })}
                          </span>
                        </div>
                      )}

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

                      {reportedAbsencesByStudentId.size > 0 && (
                        <div className="rounded-xl bg-amber-50/90 dark:bg-amber-950/30 border border-amber-500/35 px-3 py-2 text-xs font-semibold text-amber-800 dark:text-amber-300 flex items-center gap-2">
                          <CalendarX2 className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
                          <span>
                            {t('teacherPortal.classControl.reportedAbsencesSummary', {
                              count: reportedAbsencesByStudentId.size
                            })}
                          </span>
                        </div>
                      )}

                      {/* Lista de Alumnos para Asistencia & Cobro */}
                      <div className="@container space-y-1.5 @[760px]:space-y-0 @[760px]:rounded-2xl @[760px]:border @[760px]:border-slate-200 @[760px]:dark:border-slate-800 @[760px]:bg-white @[760px]:dark:bg-slate-900 @[760px]:overflow-hidden @[760px]:shadow-xs">
                        {enrolledStudentsInClass.length === 0 ? (
                          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 @[760px]:border-0 bg-white dark:bg-slate-900 p-8 text-center text-xs text-slate-400">
                            <Users className="h-8 w-8 mx-auto mb-2 text-slate-300 dark:text-slate-600" />
                            <p className="font-bold text-slate-600 dark:text-slate-300">
                              {t('teacherPortal.classControl.noEnrolledTitle')}
                            </p>
                            <p className="mt-1">{t('teacherPortal.classControl.noEnrolledHint')}</p>
                          </div>
                        ) : (
                          <>
                            {/* Cabecera compacta solo para móvil con acciones rápidas colectivas */}
                            <div className="@[760px]:hidden flex items-center justify-between pl-2.5 pr-[35px] py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                              <span className="truncate">
                                {t('teacherPortal.classControl.mobileStudentHeader', { count: enrolledStudentsInClass.length })}
                              </span>
                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  type="button"
                                  disabled={isCurrentClassClosed}
                                  onClick={markAllPresent}
                                  title={t('teacherPortal.classControl.markAllPresentTitle')}
                                  aria-label={t('teacherPortal.classControl.markAllPresentTitle')}
                                  className="h-7 w-[40px] rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-0.5 text-[9px] font-extrabold uppercase tracking-tighter leading-none text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 active:scale-95 transition flex items-center justify-center touch-manipulation disabled:opacity-45 disabled:cursor-not-allowed"
                                >
                                  {t('teacherPortal.classControl.markAllPresentShort')}
                                </button>
                                <button
                                  type="button"
                                  disabled={isCurrentClassClosed}
                                  onClick={handleCollectAllPresent}
                                  title={t('teacherPortal.classControl.collectAllPresentTitle')}
                                  aria-label={t('teacherPortal.classControl.collectAllPresentTitle')}
                                  className="h-7 w-[44px] rounded-lg border border-emerald-600 bg-emerald-600 px-0.5 text-[9px] font-extrabold uppercase tracking-tighter leading-none text-white hover:bg-emerald-700 active:scale-95 transition shadow-xs flex items-center justify-center touch-manipulation disabled:opacity-45 disabled:cursor-not-allowed"
                                >
                                  {t('teacherPortal.classControl.collectAllPresentShort')}
                                </button>
                              </div>
                            </div>

                            {/* Cabecera de columnas para escritorio/tablet */}
                            <div className="hidden @[760px]:grid @[760px]:grid-cols-[minmax(0,1.25fr)_minmax(0,0.9fr)_148px_minmax(0,1.4fr)_86px] items-center gap-3 px-4 py-2.5 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200/80 dark:border-slate-800 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                              <span>{t('common.columns.student')}</span>
                              <span>{t('common.columns.notices')}</span>
                              <span>{t('common.columns.attendance')}</span>
                              <span>{t('common.columns.collection')}</span>
                              <span className="text-right">{t('common.columns.action')}</span>
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

                              const mobilePaymentState: PaymentStatus =
                                optimisticMobilePayment[student.id] ||
                                payment?.status ||
                                'pending';
                              const mobilePaymentMeta = getMobilePaymentMeta(mobilePaymentState);

                              const reportedAbsence = reportedAbsencesByStudentId.get(student.id);
                              const pendingFeeMessage = pendingPaymentMessagesByStudentActivity.get(
                                `${student.id}::${activeClassActivity.id}`
                              );
                              const isPartialOpen = partialInputOpen[student.id] || false;
                              const partialAmt = partialAmountMap[student.id] ?? Math.round(studentFee / 2);
                              const selectedMethod = paymentMethodMap[student.id] || 'cash';

                              const mobilePartialPreviewAmt =
                                optimisticMobilePartialAmount[student.id] ?? payment?.amount;

                              return (
                                <React.Fragment key={student.id}>
                                  {/* MÓVIL / ESTRECHO (< 760px): Versión compacta con chevron ajustado */}
                                  {(() => {
                                    const isDetailsExpanded = Boolean(expandedMobileStudents[student.id]);
                                    return (
                                      <div
                                        className={`@[760px]:hidden rounded-xl border px-2.5 py-2 shadow-xs transition-colors ${
                                          isAbsent
                                            ? 'border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 opacity-75'
                                            : mobilePaymentMeta.rowClass
                                        }`}
                                      >
                                        {/* Fila superior: Nombre + iconos a la izquierda | P + PE + chevron compacto a la derecha */}
                                        <div className="flex items-center justify-between gap-1.5">
                                          <div className="min-w-0 flex-1 flex items-center gap-1">
                                            <StudentNameButton
                                              name={student.name}
                                              phone={student.phone}
                                              email={student.email}
                                              subtitle={activeClassActivity?.name}
                                              className={`text-sm font-extrabold truncate ${
                                                isAbsent
                                                  ? 'line-through text-slate-400 dark:text-slate-500'
                                                  : 'text-slate-900 dark:text-white'
                                              }`}
                                            />

                                            {mobilePaymentState === 'partial' &&
                                            mobilePartialPreviewAmt !== undefined &&
                                            mobilePartialPreviewAmt > 0 ? (
                                              <button
                                                type="button"
                                                disabled={isCurrentClassClosed}
                                                onClick={() => openMobilePartialModal(student.id, student.name, studentFee)}
                                                title={t('teacherPortal.classControl.mobilePartialModal.title')}
                                                className="rounded-md bg-amber-500/15 hover:bg-amber-500/25 px-1.5 py-0.5 text-[10px] font-extrabold text-amber-800 dark:text-amber-300 shrink-0 touch-manipulation active:scale-95 transition disabled:opacity-55 disabled:cursor-not-allowed"
                                              >
                                                {Number.isInteger(mobilePartialPreviewAmt)
                                                  ? `${mobilePartialPreviewAmt.toFixed(0)}€`
                                                  : `${mobilePartialPreviewAmt.toFixed(2)}€`}
                                              </button>
                                            ) : null}

                                            {reportedAbsence &&
                                              (reportedAbsence.status === 'approved' ? (
                                                <span
                                                  title={
                                                    reportedAbsence.reason
                                                      ? `${t('teacherPortal.classControl.confirmedAbsenceTooltip')} · ${t(
                                                          'teacherPortal.classControl.reportedAbsenceReason',
                                                          { reason: reportedAbsence.reason }
                                                        )}`
                                                      : t('teacherPortal.classControl.confirmedAbsenceTooltip')
                                                  }
                                                  aria-label={t('teacherPortal.classControl.confirmedAbsenceBadge')}
                                                  className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-500/15 border border-emerald-500/35 text-emerald-600 dark:text-emerald-400 shrink-0"
                                                >
                                                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                                                </span>
                                              ) : (
                                                <button
                                                  type="button"
                                                  disabled={confirmingAbsenceId === reportedAbsence.id}
                                                  onClick={() =>
                                                    handleConfirmClassAbsence(
                                                      student.id,
                                                      student.name,
                                                      reportedAbsence.id
                                                    )
                                                  }
                                                  title={
                                                    reportedAbsence.reason
                                                      ? `${t('teacherPortal.classControl.confirmReportedAbsenceTooltip')} · ${t(
                                                          'teacherPortal.classControl.reportedAbsenceReason',
                                                          { reason: reportedAbsence.reason }
                                                        )}`
                                                      : t('teacherPortal.classControl.confirmReportedAbsenceTooltip')
                                                  }
                                                  aria-label={t('teacherPortal.classControl.confirmReportedAbsenceAria', {
                                                    student: student.name
                                                  })}
                                                  className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-amber-500/15 border border-amber-500/35 text-amber-600 dark:text-amber-400 hover:bg-amber-500/25 hover:border-amber-500/55 active:scale-95 transition cursor-pointer shrink-0 disabled:opacity-60 disabled:cursor-wait"
                                                >
                                                  {confirmingAbsenceId === reportedAbsence.id ? (
                                                    <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                                                  ) : (
                                                    <CalendarX2 className="h-3.5 w-3.5 shrink-0" />
                                                  )}
                                                </button>
                                              ))}

                                            {pendingFeeMessage && (
                                              <button
                                                type="button"
                                                onClick={() => openEvaluatePaymentMessageModal(pendingFeeMessage)}
                                                title={t('teacherPortal.paymentMessagesBanner.evaluateButton')}
                                                className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-500/25 shrink-0"
                                              >
                                                <MessageSquare className="h-3.5 w-3.5 shrink-0" />
                                              </button>
                                            )}
                                          </div>

                                          <div className="flex items-center gap-1 shrink-0">
                                            <button
                                              type="button"
                                              disabled={isCurrentClassClosed}
                                              onClick={() => toggleMobileAttendance(student.id)}
                                              aria-label={t('teacherPortal.classControl.attendanceAria', {
                                                student: student.name,
                                                status: isAbsent
                                                  ? t('teacherPortal.classControl.attendanceAbsentFull')
                                                  : t('teacherPortal.classControl.attendancePresentFull')
                                              })}
                                              className={`h-9 min-w-[40px] rounded-xl text-xs font-black tracking-wide transition active:scale-90 touch-manipulation select-none flex items-center justify-center border disabled:opacity-55 disabled:cursor-not-allowed ${
                                                isAbsent
                                                  ? 'bg-rose-500 text-white border-rose-500 shadow-xs'
                                                  : 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                                              }`}
                                            >
                                              {isAbsent
                                                ? t('teacherPortal.classControl.shortAbsent')
                                                : t('teacherPortal.classControl.shortPresent')}
                                            </button>

                                            <button
                                              type="button"
                                              disabled={isCurrentClassClosed}
                                              onClick={() => handleToggleMobilePaid(student.id, studentFee)}
                                              title={t('teacherPortal.classControl.mobileTogglePaidTitle')}
                                              aria-label={t('teacherPortal.classControl.paymentAria', {
                                                student: student.name,
                                                status: mobilePaymentMeta.fullLabel
                                              })}
                                              className={`h-9 min-w-[44px] rounded-xl text-xs font-black tracking-wide transition active:scale-90 touch-manipulation select-none flex items-center justify-center border disabled:opacity-55 disabled:cursor-not-allowed ${mobilePaymentMeta.buttonClass}`}
                                            >
                                              {mobilePaymentMeta.code}
                                            </button>

                                            <button
                                              type="button"
                                              onClick={() => toggleMobileStudentDetails(student.id)}
                                              aria-expanded={isDetailsExpanded}
                                              aria-label={
                                                isDetailsExpanded
                                                  ? t('teacherPortal.classControl.accordionToggleCollapse')
                                                  : t('teacherPortal.classControl.accordionToggleExpand')
                                              }
                                              className="h-9 w-6 -mr-1 rounded-lg text-slate-400 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100/80 dark:hover:bg-slate-800/70 transition active:scale-90 touch-manipulation select-none flex items-center justify-center"
                                            >
                                              {isDetailsExpanded ? (
                                                <ChevronUp className="h-3.5 w-3.5" />
                                              ) : (
                                                <ChevronDown className="h-3.5 w-3.5" />
                                              )}
                                            </button>
                                          </div>
                                        </div>

                                        {/* Fila inferior colapsable: Motivo de ausencia y ajustes de cobro */}
                                        {isDetailsExpanded && (
                                          <div className="mt-2 pt-2 border-t border-slate-200/70 dark:border-slate-800/80 flex items-center justify-between gap-1.5">
                                            <div className="min-w-0 flex-1 text-left">
                                              {reportedAbsence?.reason ? (
                                                <p className="text-[10px] font-medium text-amber-700 dark:text-amber-300 italic truncate">
                                                  {t('teacherPortal.classControl.reportedAbsenceReason', {
                                                    reason: reportedAbsence.reason
                                                  })}
                                                </p>
                                              ) : (
                                                <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                                                  {t('teacherPortal.classControl.mobileMoreOptionsTitle')}
                                                </span>
                                              )}
                                            </div>

                                            <button
                                              type="button"
                                              disabled={isCurrentClassClosed}
                                              onClick={() => openMobilePartialModal(student.id, student.name, studentFee)}
                                              title={t('teacherPortal.classControl.mobileMoreOptionsTitle')}
                                              aria-label={t('teacherPortal.classControl.mobileMoreOptionsAria', {
                                                student: student.name
                                              })}
                                              className="h-9 w-9 shrink-0 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition active:scale-90 touch-manipulation select-none flex items-center justify-center disabled:opacity-55 disabled:cursor-not-allowed"
                                            >
                                              <SlidersHorizontal className="h-4 w-4" />
                                            </button>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })()}



                                  {/* ESCRITORIO / TABLET (>= 760px): Fila en columnas alineadas */}
                                  <div
                                    className={`hidden @[760px]:block px-4 py-3 border-b border-slate-100 dark:border-slate-800 last:border-b-0 transition-colors ${
                                      isAbsent
                                        ? 'bg-slate-50/70 dark:bg-slate-900/40 opacity-75'
                                        : isPaid
                                        ? 'bg-emerald-50/20 dark:bg-emerald-950/10'
                                        : isPartialPaid
                                        ? 'bg-amber-50/20 dark:bg-amber-950/10'
                                        : 'hover:bg-slate-50/60 dark:hover:bg-slate-800/25'
                                    }`}
                                  >
                                    <div className="grid grid-cols-[minmax(0,1.25fr)_minmax(0,0.9fr)_148px_minmax(0,1.4fr)_86px] items-center gap-3">
                                      {/* COL 1: Avatar + Nombre */}
                                      <div className="flex items-center gap-2.5 min-w-0">
                                        <div className="h-9 w-9 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold text-sm shrink-0">
                                          {student.name.charAt(0)}
                                        </div>
                                        <h4 className="min-w-0 flex-1 flex items-center">
                                          <StudentNameButton
                                            name={student.name}
                                            phone={student.phone}
                                            email={student.email}
                                            subtitle={activeClassActivity?.name}
                                            className={`font-bold text-sm text-left break-words ${
                                              isAbsent
                                                ? 'line-through text-slate-400 dark:text-slate-500'
                                                : 'text-slate-900 dark:text-white'
                                            }`}
                                          />
                                        </h4>
                                      </div>

                                      {/* COL 2: Avisos de ausencia / mensajes de cuota */}
                                      <div className="min-w-0 space-y-1">
                                        {reportedAbsence ? (
                                          <>
                                            {reportedAbsence.status === 'approved' ? (
                                              <span
                                                title={
                                                  reportedAbsence.reason
                                                    ? `${t('teacherPortal.classControl.confirmedAbsenceTooltip')} · ${t(
                                                        'teacherPortal.classControl.reportedAbsenceReason',
                                                        { reason: reportedAbsence.reason }
                                                      )}`
                                                    : t('teacherPortal.classControl.confirmedAbsenceTooltip')
                                                }
                                                className="inline-flex items-center gap-1 rounded-md bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-300"
                                              >
                                                <CheckCircle2 className="h-3 w-3 shrink-0" />
                                                <span>{t('teacherPortal.classControl.confirmedAbsenceBadge')}</span>
                                              </span>
                                            ) : (
                                              <button
                                                type="button"
                                                disabled={confirmingAbsenceId === reportedAbsence.id}
                                                onClick={() =>
                                                  handleConfirmClassAbsence(
                                                    student.id,
                                                    student.name,
                                                    reportedAbsence.id
                                                  )
                                                }
                                                title={
                                                  reportedAbsence.reason
                                                    ? `${t('teacherPortal.classControl.confirmReportedAbsenceTooltip')} · ${t(
                                                        'teacherPortal.classControl.reportedAbsenceReason',
                                                        { reason: reportedAbsence.reason }
                                                      )}`
                                                    : t('teacherPortal.classControl.confirmReportedAbsenceTooltip')
                                                }
                                                aria-label={t('teacherPortal.classControl.confirmReportedAbsenceAria', {
                                                  student: student.name
                                                })}
                                                className="inline-flex items-center gap-1 rounded-md bg-amber-500/15 border border-amber-500/35 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-300 hover:bg-amber-500/25 hover:border-amber-500/60 hover:text-amber-800 dark:hover:text-amber-200 active:scale-95 transition cursor-pointer disabled:opacity-60 disabled:cursor-wait"
                                              >
                                                {confirmingAbsenceId === reportedAbsence.id ? (
                                                  <Loader2 className="h-3 w-3 animate-spin shrink-0" />
                                                ) : (
                                                  <CalendarX2 className="h-3 w-3 shrink-0" />
                                                )}
                                                <span>{t('teacherPortal.classControl.reportedAbsenceBadge')}</span>
                                                <Check className="h-2.5 w-2.5 shrink-0 opacity-75" />
                                              </button>
                                            )}
                                            {reportedAbsence.reason && (
                                              <p className="text-[10px] font-medium text-amber-700 dark:text-amber-300 italic break-words">
                                                {t('teacherPortal.classControl.reportedAbsenceReason', {
                                                  reason: reportedAbsence.reason
                                                })}
                                              </p>
                                            )}
                                          </>
                                        ) : null}
                                        {pendingFeeMessage && (
                                          <button
                                            type="button"
                                            onClick={() => openEvaluatePaymentMessageModal(pendingFeeMessage)}
                                            title={t('teacherPortal.paymentMessagesBanner.evaluateButton')}
                                            className="inline-flex items-center gap-1 rounded-md bg-indigo-500/15 px-2 py-0.5 text-[10px] font-bold text-indigo-700 dark:text-indigo-300 hover:bg-indigo-500/25"
                                          >
                                            <MessageSquare className="h-3 w-3 shrink-0" />
                                            <span>{t('teacherPortal.paymentMessagesBanner.evaluateButton')}</span>
                                          </button>
                                        )}
                                        {!reportedAbsence && !pendingFeeMessage && (
                                          <span className="text-[11px] text-slate-300 dark:text-slate-700">—</span>
                                        )}
                                      </div>

                                      {/* COL 3: Selector de Asistencia */}
                                      <div>
                                        <div className="inline-flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl shrink-0">
                                          <button
                                            type="button"
                                            disabled={isCurrentClassClosed}
                                            onClick={() => setStudentAttendance(student.id, 'present')}
                                            className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition min-h-[36px] active:scale-95 disabled:opacity-55 disabled:cursor-not-allowed ${
                                              currentAttendance === 'present'
                                                ? 'bg-emerald-600 text-white shadow-xs'
                                                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                                            }`}
                                          >
                                            {t('teacherPortal.classControl.presentButton')}
                                          </button>
                                          <button
                                            type="button"
                                            disabled={isCurrentClassClosed}
                                            onClick={() => setStudentAttendance(student.id, 'absent')}
                                            className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition min-h-[36px] active:scale-95 disabled:opacity-55 disabled:cursor-not-allowed ${
                                              currentAttendance === 'absent'
                                                ? 'bg-rose-500 text-white shadow-xs'
                                                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                                            }`}
                                          >
                                            {t('teacherPortal.classControl.absentButton')}
                                          </button>
                                        </div>
                                      </div>

                                      {/* COL 4: Estado de Cobro y Botones de Pago */}
                                      <div className="flex items-center gap-2 min-w-0">
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
                                              disabled={isCurrentClassClosed}
                                              onClick={() =>
                                                setConfirmDialog({
                                                  type: 'delete_payment',
                                                  paymentId: payment.id,
                                                  studentName: student.name,
                                                  amount: payment.amount
                                                })
                                              }
                                              title={t('teacherPortal.classControl.unmarkPaymentTooltip')}
                                              className="inline-flex items-center gap-1 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50/70 dark:bg-rose-950/20 px-2.5 py-2 text-[11px] font-bold text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-950/50 transition min-h-[38px] active:scale-95 touch-manipulation whitespace-nowrap disabled:opacity-45 disabled:cursor-not-allowed"
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
                                                disabled={isCurrentClassClosed}
                                                onClick={() => handleCompletePartialPayment(payment.id, studentFee)}
                                                className="inline-flex items-center gap-1 rounded-xl bg-emerald-600 px-2.5 py-2 text-[11px] font-bold text-white hover:bg-emerald-700 transition min-h-[38px] active:scale-95 touch-manipulation whitespace-nowrap disabled:opacity-45 disabled:cursor-not-allowed"
                                              >
                                                <Banknote className="h-3.5 w-3.5 shrink-0" />
                                                <span>{t('teacherPortal.classControl.completePaymentButton', { amount: remainingFee.toFixed(2) })}</span>
                                              </button>
                                            )}
                                            <button
                                              type="button"
                                              disabled={isCurrentClassClosed}
                                              onClick={() =>
                                                setConfirmDialog({
                                                  type: 'delete_payment',
                                                  paymentId: payment.id,
                                                  studentName: student.name,
                                                  amount: payment.amount
                                                })
                                              }
                                              title={t('teacherPortal.classControl.unmarkPartialTooltip')}
                                              className="inline-flex items-center gap-1 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50/70 dark:bg-rose-950/20 px-2.5 py-2 text-[11px] font-bold text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-950/50 transition min-h-[38px] active:scale-95 touch-manipulation whitespace-nowrap disabled:opacity-45 disabled:cursor-not-allowed"
                                            >
                                              <RotateCcw className="h-3.5 w-3.5 shrink-0" />
                                              <span>{t('teacherPortal.classControl.unmark')}</span>
                                            </button>
                                          </div>
                                        ) : (
                                          <div className="flex flex-wrap items-center gap-1.5">
                                            {payment && (payment.status === 'overdue' || payment.status === 'exempt' || payment.status === 'cancelled') && (
                                              <span
                                                className={`rounded-xl border px-2.5 py-2 text-[11px] font-bold min-h-[38px] inline-flex items-center ${mobilePaymentMeta.buttonClass}`}
                                                title={mobilePaymentMeta.fullLabel}
                                              >
                                                {mobilePaymentMeta.fullLabel}
                                              </span>
                                            )}
                                            <button
                                              type="button"
                                              disabled={isCurrentClassClosed}
                                              onClick={() => handleCollectPayment(student.id, studentFee, false)}
                                              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700 transition shadow-xs min-h-[38px] active:scale-95 touch-manipulation disabled:opacity-45 disabled:cursor-not-allowed whitespace-nowrap"
                                            >
                                              <Banknote className="h-4 w-4 shrink-0" />
                                              <span>{t('teacherPortal.classControl.collectAmountButton', { amount: studentFee })}</span>
                                            </button>

                                            <button
                                              type="button"
                                              disabled={isCurrentClassClosed}
                                              onClick={() =>
                                                setPartialInputOpen(prev => ({
                                                  ...prev,
                                                  [student.id]: !prev[student.id]
                                                }))
                                              }
                                              className="rounded-xl border border-slate-300 dark:border-slate-700 px-2.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition min-h-[38px] active:scale-95 touch-manipulation disabled:opacity-45 disabled:cursor-not-allowed whitespace-nowrap"
                                            >
                                              <span>{t('teacherPortal.classControl.partialEllipsis')}</span>
                                            </button>
                                          </div>
                                        )}
                                      </div>

                                      {/* COL 5: Botón Quitar */}
                                      <div className="flex items-center justify-end shrink-0">
                                        {activeClassActivity && (
                                          <button
                                            type="button"
                                            disabled={isCurrentClassClosed}
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
                                            className="inline-flex items-center gap-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 py-1.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400 hover:border-rose-300 hover:text-rose-600 dark:hover:text-rose-400 transition shrink-0 whitespace-nowrap disabled:opacity-45 disabled:cursor-not-allowed"
                                          >
                                            <UserMinus className="h-3.5 w-3.5" />
                                            <span>{t('teacherPortal.classControl.remove')}</span>
                                          </button>
                                        )}
                                      </div>
                                    </div>

                                    {/* Desplegable para Cobro Parcial / Método */}
                                    {!isCurrentClassClosed && !isPaid && !isPartialPaid && isPartialOpen && (
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

                      {/* Notas de la Clase/Taller + Botón Guardar y Cerrar/Reabrir clase */}
                      {enrolledStudentsInClass.length > 0 && (
                        <form
                          onSubmit={handleSaveClassSession}
                          className="flex flex-wrap sm:flex-nowrap items-center gap-2 pt-1"
                        >
                          <input
                            type="text"
                            disabled={isCurrentClassClosed}
                            placeholder={t('teacherPortal.classControl.sessionNotesPlaceholder')}
                            value={sessionTopic}
                            onChange={e => {
                              isSessionTopicDirtyRef.current = true;
                              setSessionTopic(e.target.value);
                            }}
                            className="flex-1 min-w-[180px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-indigo-500 min-h-[40px] shadow-xs disabled:opacity-65 disabled:cursor-not-allowed"
                          />
                          <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto justify-end">
                            {!isCurrentClassClosed && (
                              <button
                                type="submit"
                                className="inline-flex items-center justify-center rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700 shadow-xs transition min-h-[40px] shrink-0 active:scale-95 touch-manipulation"
                              >
                                {t('teacherPortal.classControl.save')}
                              </button>
                            )}
                            {isCurrentClassClosed ? (
                              <button
                                type="button"
                                onClick={openReopenClassModal}
                                className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-amber-500/40 bg-amber-50/70 dark:bg-amber-950/30 px-3.5 py-2 text-xs font-bold text-amber-800 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-950/50 shadow-xs transition min-h-[40px] shrink-0 active:scale-95 touch-manipulation"
                              >
                                <Unlock className="h-3.5 w-3.5 shrink-0" />
                                <span>{t('teacherPortal.classControl.reopenClassButton')}</span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                disabled={isClosingClass}
                                onClick={() => void handleCloseClass()}
                                className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-emerald-700 shadow-xs transition min-h-[40px] shrink-0 active:scale-95 touch-manipulation disabled:opacity-50"
                              >
                                {isClosingClass ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                                ) : (
                                  <Lock className="h-3.5 w-3.5 shrink-0" />
                                )}
                                <span>{t('teacherPortal.classControl.closeClassButton')}</span>
                              </button>
                            )}
                          </div>
                        </form>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

          <NewsCarouselSection compact />
        </div>
      )}

      {/* =========================================================================
          PESTAÑA 2: MIS TALLERES & GESTIÓN DE ALUMNOS (PERMISOS COMPLETOS)
          ========================================================================= */}
      {currentRole !== UserRole.Monitor && activeTab === 'workshops' && (
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
            <div className="@container rounded-xl border border-slate-200/80 dark:border-slate-800 overflow-hidden bg-white dark:bg-slate-900">
              <div className="hidden @[720px]:grid @[720px]:grid-cols-[96px_minmax(0,1.2fr)_minmax(0,1.3fr)_82px_96px_165px] items-center gap-3 px-3.5 py-2 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200/80 dark:border-slate-800 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                <span>{t('common.columns.date')}</span>
                <span>{t('common.columns.workshop')}</span>
                <span>{t('common.columns.topic')}</span>
                <span>{t('common.columns.duration')}</span>
                <span className="text-right">{t('common.columns.attendees')}</span>
                <span className="text-right">{t('common.columns.status')}</span>
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {sessions
                  .filter(s => s.teacherId === currentTeacher?.id && s.date.startsWith(selectedPeriod))
                  .map(ses => {
                    const act = activities.find(a => a.id === ses.activityId);
                    const closedByRole = ses.closedBy || 'profesor';
                    const closerLabel = t(
                      `teacherPortal.classControl.closedBy.${closedByRole}` as
                        | 'teacherPortal.classControl.closedBy.profesor'
                        | 'teacherPortal.classControl.closedBy.automatica'
                        | 'teacherPortal.classControl.closedBy.administrador'
                    );
                    return (
                      <div
                        key={ses.id}
                        className="px-3.5 py-2.5 grid grid-cols-1 @[720px]:grid-cols-[96px_minmax(0,1.2fr)_minmax(0,1.3fr)_82px_96px_165px] items-start @[720px]:items-center gap-1.5 @[720px]:gap-3 hover:bg-slate-50/70 dark:hover:bg-slate-800/30 transition"
                      >
                        <div className="flex items-center justify-between gap-2 @[720px]:contents">
                          <span className="font-mono text-[11px] font-bold text-slate-500 dark:text-slate-400 tabular-nums whitespace-nowrap">
                            {ses.date}
                          </span>
                          <span className="font-bold text-slate-900 dark:text-white break-words min-w-0 flex-1 @[720px]:flex-none">
                            {act?.name || t('teacherPortal.payoutTab.defaultClassLabel')}
                          </span>
                        </div>
                        <span className="text-slate-500 dark:text-slate-400 text-[11px] break-words min-w-0">
                          {ses.topic || t('teacherPortal.payoutTab.noTopic')}
                        </span>
                        <span className="text-slate-500 dark:text-slate-400 text-[11px] tabular-nums whitespace-nowrap">
                          {t('teacherPortal.payoutTab.durationUnit', { minutes: ses.durationMinutes })}
                        </span>
                        <div className="@[720px]:text-right">
                          <span className="font-bold text-emerald-600 dark:text-emerald-400 tabular-nums whitespace-nowrap">
                            {t('teacherPortal.payoutTab.attendeesCount', { count: ses.attendeesCount })}
                          </span>
                        </div>
                        <div className="flex items-center @[720px]:justify-end">
                          {ses.isClosed ? (
                            <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/15 border border-amber-500/25 px-1.5 py-0.5 text-[10px] font-bold text-amber-800 dark:text-amber-300 whitespace-nowrap">
                              <Lock className="h-2.5 w-2.5 shrink-0" />
                              <span>{t('teacherPortal.payoutTab.closedTag', { by: closerLabel })}</span>
                            </span>
                          ) : (
                            <span className="hidden @[720px]:inline-block text-[11px] text-slate-400 dark:text-slate-500">
                              {t('studentPortal.historyPanel.sessionOpenLabel')}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>
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

      {/* Modal de moderación de baja desde el banner del monitor */}
      {portalDropTarget && (() => {
        const unpaidPayments = payments.filter(
          p =>
            p.studentId === portalDropTarget.studentId &&
            p.activityId === portalDropTarget.activityId &&
            (p.status === 'pending' || p.status === 'overdue' || p.status === 'partial')
        );
        const unpaidTotal = unpaidPayments.reduce((sum, p) => sum + p.amount, 0);
        const canApprove =
          portalDropDebtsChecked && portalDropMaterialsChecked && !isPortalDropModerating;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-xs">
            <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-2xl space-y-4">
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
                  disabled={isPortalDropModerating}
                  onClick={() => setPortalDropTarget(null)}
                  className="rounded-lg p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 p-3 text-xs space-y-1">
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500">{t('teacherPortal.dropModerationModal.studentLabel')}</span>
                  <strong className="text-slate-900 dark:text-white">{portalDropTarget.studentName}</strong>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500">{t('teacherPortal.dropModerationModal.workshopLabel')}</span>
                  <strong className="text-slate-900 dark:text-white">{portalDropTarget.activityName}</strong>
                </div>
                {portalDropTarget.dropRequestedAt && (
                  <p className="text-[11px] text-slate-400">
                    {t('teacherPortal.dropModerationModal.requestedAtLabel', {
                      date: portalDropTarget.dropRequestedAt.split('T')[0]
                    })}
                  </p>
                )}
                {portalDropTarget.dropReason && (
                  <div className="pt-1 border-t border-slate-200/70 dark:border-slate-700/60">
                    <span className="block text-[10px] font-bold uppercase text-slate-400">
                      {t('teacherPortal.dropModerationModal.reasonLabel')}
                    </span>
                    <p className="italic text-slate-700 dark:text-slate-200">
                      "{portalDropTarget.dropReason}"
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
                <label className="flex items-start gap-2.5 text-xs text-slate-700 dark:text-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={portalDropDebtsChecked}
                    onChange={e => setPortalDropDebtsChecked(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  <span>{t('teacherPortal.dropModerationModal.checkDebts')}</span>
                </label>

                <label className="flex items-start gap-2.5 text-xs text-slate-700 dark:text-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={portalDropMaterialsChecked}
                    onChange={e => setPortalDropMaterialsChecked(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
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
                  value={portalDropNotes}
                  onChange={e => setPortalDropNotes(e.target.value)}
                  placeholder={t('teacherPortal.dropModerationModal.notesPlaceholder')}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-indigo-500"
                />
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  disabled={isPortalDropModerating}
                  onClick={() => setPortalDropTarget(null)}
                  className="rounded-xl border border-slate-300 dark:border-slate-700 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                >
                  {t('teacherPortal.dropModerationModal.cancel')}
                </button>
                <button
                  type="button"
                  disabled={isPortalDropModerating}
                  onClick={async () => {
                    setIsPortalDropModerating(true);
                    setPortalRequestError(null);
                    try {
                      const res = await rejectActivityUnenrollment(
                        portalDropTarget.studentId,
                        portalDropTarget.activityId,
                        portalDropNotes.trim() || undefined
                      );
                      if (res.success) {
                        setPortalDropTarget(null);
                      } else if (res.error) {
                        setPortalRequestError(res.error);
                      }
                    } finally {
                      setIsPortalDropModerating(false);
                    }
                  }}
                  className="rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 px-3 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition disabled:opacity-50"
                >
                  {t('teacherPortal.dropModerationModal.rejectButton')}
                </button>
                <button
                  type="button"
                  disabled={!canApprove}
                  onClick={async () => {
                    setIsPortalDropModerating(true);
                    setPortalRequestError(null);
                    try {
                      const res = await approveActivityUnenrollment(
                        portalDropTarget.studentId,
                        portalDropTarget.activityId,
                        {
                          debtsChecked: portalDropDebtsChecked,
                          materialsChecked: portalDropMaterialsChecked,
                          notes: portalDropNotes.trim() || undefined
                        }
                      );
                      if (res.success) {
                        setPortalDropTarget(null);
                      } else if (res.error) {
                        setPortalRequestError(res.error);
                      }
                    } finally {
                      setIsPortalDropModerating(false);
                    }
                  }}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-rose-700 transition disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {isPortalDropModerating && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  <span>
                    {isPortalDropModerating
                      ? t('teacherPortal.dropModerationModal.processing')
                      : t('teacherPortal.dropModerationModal.approveButton')}
                  </span>
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Modal para Reabrir Clase Cerrada (motivo/explicación obligatorio) */}
      {isReopenModalOpen && matchingClassSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-xs">
          <form
            onSubmit={handleConfirmReopenClass}
            className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-2xl space-y-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 shrink-0">
                  <Unlock className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                    {t('teacherPortal.classControl.reopenModal.title')}
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {t('teacherPortal.classControl.reopenModal.subtitle', {
                      activity: activeClassActivity?.name || '',
                      date: sessionDate
                    })}
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={isReopeningClass}
                onClick={() => setIsReopenModalOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {matchingClassSession.closedBy && (
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 px-3 py-2 text-xs text-slate-600 dark:text-slate-300">
                {t('teacherPortal.classControl.reopenModal.closedByLabel', {
                  by: t(
                    `teacherPortal.classControl.closedBy.${matchingClassSession.closedBy}` as
                      | 'teacherPortal.classControl.closedBy.profesor'
                      | 'teacherPortal.classControl.closedBy.automatica'
                      | 'teacherPortal.classControl.closedBy.administrador'
                  )
                })}
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5">
                {t('teacherPortal.classControl.reopenModal.reasonLabel')}
              </label>
              <textarea
                rows={3}
                required
                value={reopenReasonInput}
                onChange={e => {
                  setReopenReasonInput(e.target.value);
                  if (reopenReasonError) setReopenReasonError(null);
                }}
                placeholder={t('teacherPortal.classControl.reopenModal.reasonPlaceholder')}
                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 p-3 text-xs text-slate-900 dark:text-white focus:outline-indigo-500"
              />
              {reopenReasonError && (
                <p className="mt-1.5 text-[11px] font-bold text-rose-600 dark:text-rose-400">
                  {reopenReasonError}
                </p>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                disabled={isReopeningClass}
                onClick={() => setIsReopenModalOpen(false)}
                className="rounded-xl border border-slate-300 dark:border-slate-700 px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              >
                {t('teacherPortal.classControl.reopenModal.cancel')}
              </button>
              <button
                type="submit"
                disabled={isReopeningClass || !reopenReasonInput.trim()}
                className="inline-flex items-center gap-1.5 rounded-xl bg-amber-600 px-4 py-2 text-xs font-bold text-white hover:bg-amber-700 transition disabled:opacity-50"
              >
                {isReopeningClass && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                <span>
                  {isReopeningClass
                    ? t('teacherPortal.classControl.reopenModal.confirming')
                    : t('teacherPortal.classControl.reopenModal.confirm')}
                </span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal / Bottom-sheet móvil de Cobro Parcial (PC) */}
      {mobilePartialModal && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => {
            setMobilePartialModal(null);
            setMobilePartialError(null);
          }}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/70 p-0 sm:p-4 backdrop-blur-xs"
        >
          <form
            onClick={e => e.stopPropagation()}
            onSubmit={handleConfirmMobilePartialModal}
            className="w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-2xl space-y-4"
          >
            <div className="mx-auto h-1 w-10 rounded-full bg-slate-300 dark:bg-slate-700 sm:hidden" />

            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                {(() => {
                  const activeMeta = getMobilePaymentMeta(mobilePartialModal.currentStatus);
                  return (
                    <div
                      className={`flex h-10 w-10 items-center justify-center rounded-xl border shrink-0 font-black text-xs ${activeMeta.buttonClass}`}
                    >
                      {activeMeta.code}
                    </div>
                  );
                })()}
                <div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                    {t('teacherPortal.classControl.mobilePartialModal.title')}
                  </h4>
                  {(() => {
                    const modalStudent = students.find(s => s.id === mobilePartialModal.studentId);
                    return (
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                        <StudentNameButton
                          name={modalStudent?.name || mobilePartialModal.studentName}
                          phone={modalStudent?.phone}
                          email={modalStudent?.email}
                          subtitle={activeClassActivity?.name}
                          className="font-bold text-slate-800 dark:text-slate-200"
                        />
                        {activeClassActivity?.name && (
                          <span className="truncate">· {activeClassActivity.name}</span>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setMobilePartialModal(null);
                  setMobilePartialError(null);
                }}
                aria-label={t('teacherPortal.classControl.mobilePartialModal.cancel')}
                className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200 touch-manipulation active:scale-95 transition"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-1.5">
              <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {t('teacherPortal.classControl.mobilePartialModal.quickSwitchLabel')}
              </span>
              <div className="grid grid-cols-5 gap-1.5">
                {(['pending', 'paid', 'overdue', 'exempt', 'cancelled'] as PaymentStatus[]).map(st => {
                  const meta = getMobilePaymentMeta(st);
                  const isActive = mobilePartialModal.currentStatus === st;
                  return (
                    <button
                      key={st}
                      type="button"
                      disabled={isCurrentClassClosed}
                      onClick={() => {
                        applyMobilePaymentStatus(
                          mobilePartialModal.studentId,
                          mobilePartialModal.fullFee,
                          st,
                          undefined,
                          mobilePartialMethodInput
                        );
                        setMobilePartialModal(null);
                        setMobilePartialError(null);
                      }}
                      title={meta.fullLabel}
                      className={`min-h-[40px] px-2 rounded-xl text-xs font-black border transition touch-manipulation active:scale-95 disabled:opacity-50 ${
                        meta.buttonClass
                      } ${
                        isActive
                          ? 'ring-2 ring-indigo-500 ring-offset-1 dark:ring-offset-slate-900'
                          : ''
                      }`}
                    >
                      {meta.code}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 p-2.5 text-center">
              <div>
                <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {t('teacherPortal.classControl.mobilePartialModal.feeLabel')}
                </span>
                <span className="text-xs font-extrabold text-slate-900 dark:text-white">
                  {mobilePartialModal.fullFee.toFixed(2)} €
                </span>
              </div>
              <div>
                <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {t('teacherPortal.classControl.mobilePartialModal.alreadyPaidLabel')}
                </span>
                <span className="text-xs font-extrabold text-amber-700 dark:text-amber-300">
                  {mobilePartialModal.alreadyPaid.toFixed(2)} €
                </span>
              </div>
              <div>
                <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {t('teacherPortal.classControl.mobilePartialModal.remainingLabel')}
                </span>
                <span className="text-xs font-extrabold text-slate-900 dark:text-white">
                  {Math.max(0, mobilePartialModal.fullFee - mobilePartialModal.alreadyPaid).toFixed(2)} €
                </span>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-200">
                    {t('teacherPortal.classControl.mobilePartialModal.amountLabel')}
                  </label>
                  <div className="flex items-center gap-1.5">
                    {(() => {
                      const halfVal =
                        mobilePartialModal.fullFee > 1
                          ? Math.round((mobilePartialModal.fullFee / 2) * 100) / 100
                          : mobilePartialModal.fullFee;
                      const remVal =
                        mobilePartialModal.alreadyPaid > 0
                          ? Math.max(
                              0,
                              Math.round(
                                (mobilePartialModal.fullFee - mobilePartialModal.alreadyPaid) * 100
                              ) / 100
                            )
                          : 0;
                      return (
                        <>
                          <button
                            type="button"
                            disabled={isCurrentClassClosed}
                            onClick={() => {
                              setMobilePartialAmountInput(String(halfVal));
                              setMobilePartialError(null);
                            }}
                            className="min-h-[36px] rounded-lg border border-amber-500/35 bg-amber-500/10 px-3 py-1 text-[11px] font-bold text-amber-800 dark:text-amber-300 hover:bg-amber-500/20 touch-manipulation active:scale-95 transition disabled:opacity-50"
                          >
                            {t('teacherPortal.classControl.mobilePartialModal.useHalfButton', {
                              amount: halfVal.toFixed(2)
                            })}
                          </button>
                          {remVal > 0 && Math.abs(remVal - halfVal) > 0.01 && (
                            <button
                              type="button"
                              disabled={isCurrentClassClosed}
                              onClick={() => {
                                setMobilePartialAmountInput(String(remVal));
                                setMobilePartialError(null);
                              }}
                              className="min-h-[36px] rounded-lg border border-emerald-500/35 bg-emerald-500/10 px-3 py-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20 touch-manipulation active:scale-95 transition disabled:opacity-50"
                            >
                              {t('teacherPortal.classControl.mobilePartialModal.useRemainingButton', {
                                amount: remVal.toFixed(2)
                              })}
                            </button>
                          )}
                        </>
                      );
                    })()}
                  </div>
                </div>
                <div className="relative">
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0.01"
                    disabled={isCurrentClassClosed}
                    required
                    value={mobilePartialAmountInput}
                    onChange={e => {
                      setMobilePartialAmountInput(e.target.value);
                      if (mobilePartialError) setMobilePartialError(null);
                    }}
                    className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 pl-4 pr-9 py-2.5 text-base font-black text-right text-slate-900 dark:text-white focus:outline-amber-500 disabled:opacity-60"
                  />
                  <span className="absolute right-3.5 top-3 text-sm font-bold text-slate-400 pointer-events-none">
                    €
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                  {t('teacherPortal.classControl.mobilePartialModal.fullAmountHint', {
                    fee: mobilePartialModal.fullFee.toFixed(2)
                  })}
                </p>
                {mobilePartialError && (
                  <p className="mt-1 text-[11px] font-bold text-rose-600 dark:text-rose-400">
                    {mobilePartialError}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5">
                  {t('teacherPortal.classControl.mobilePartialModal.methodLabel')}
                </label>
                <select
                  disabled={isCurrentClassClosed}
                  value={mobilePartialMethodInput}
                  onChange={e => setMobilePartialMethodInput(e.target.value as PaymentMethod)}
                  className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2.5 text-base sm:text-sm font-semibold text-slate-900 dark:text-white focus:outline-amber-500 disabled:opacity-60"
                >
                  <option value="cash">{t('teacherPortal.classControl.methodCash')}</option>
                  <option value="bizum">{t('teacherPortal.classControl.methodBizum')}</option>
                  <option value="transfer">{t('teacherPortal.classControl.methodTransfer')}</option>
                  <option value="card">{t('common.paymentMethods.cardDebitCredit')}</option>
                </select>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setMobilePartialModal(null);
                  setMobilePartialError(null);
                }}
                className="min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 px-4 py-2.5 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition touch-manipulation active:scale-95"
              >
                {t('teacherPortal.classControl.mobilePartialModal.cancel')}
              </button>
              <button
                type="submit"
                disabled={isCurrentClassClosed}
                className="min-h-[44px] rounded-xl bg-amber-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-amber-700 transition shadow-xs touch-manipulation active:scale-95 disabled:opacity-50"
              >
                {t('teacherPortal.classControl.mobilePartialModal.confirm')}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal de valoración de mensaje de cuota del alumno */}
      {evaluatingPaymentMessage && (() => {
        const linkedPayment = payments.find(p => p.id === evaluatingPaymentMessage.paymentId);
        const isAlreadyPaid = linkedPayment?.status === 'paid';
        const methodLabel = evaluatingPaymentMessage.paymentMethod
          ? evaluatingPaymentMessage.paymentMethod === 'cash'
            ? t('common.paymentMethods.cash')
            : evaluatingPaymentMessage.paymentMethod === 'bizum'
            ? t('common.paymentMethods.bizum')
            : evaluatingPaymentMessage.paymentMethod === 'transfer'
            ? t('common.paymentMethods.transfer')
            : t('common.paymentMethods.card')
          : '';

        return (
          <div
            role="dialog"
            aria-modal="true"
            onClick={() => !isEvaluatingPaymentMsg && setEvaluatingPaymentMessage(null)}
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-xs"
          >
            <div
              onClick={e => e.stopPropagation()}
              className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-2xl space-y-4"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 shrink-0">
                    <ClipboardCheck className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                      {t('teacherPortal.paymentMessageEvalModal.title')}
                    </h4>
                    <p className="text-xs text-slate-600 dark:text-slate-300 font-semibold mt-0.5">
                      {evaluatingPaymentMessage.studentName}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      {evaluatingPaymentMessage.activityName} · {evaluatingPaymentMessage.periodMonth}
                      {evaluatingPaymentMessage.amount !== undefined
                        ? ` · ${evaluatingPaymentMessage.amount.toFixed(2)} €`
                        : ''}
                      {evaluatingPaymentMessage.receiptNumber
                        ? ` (${evaluatingPaymentMessage.receiptNumber})`
                        : ''}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={isEvaluatingPaymentMsg}
                  onClick={() => setEvaluatingPaymentMessage(null)}
                  className="rounded-lg p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 p-3 space-y-1.5 text-xs">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${
                      evaluatingPaymentMessage.reportedPaid
                        ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                        : 'bg-sky-500/15 text-sky-700 dark:text-sky-300'
                    }`}
                  >
                    {evaluatingPaymentMessage.reportedPaid
                      ? t('teacherPortal.paymentMessagesBanner.reportedPaidBadge')
                      : t('teacherPortal.paymentMessagesBanner.inquiryBadge')}
                  </span>
                  {linkedPayment && (
                    <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">
                      {t('teacherPortal.paymentMessageEvalModal.currentFeeStatusLabel', {
                        status:
                          linkedPayment.status === 'paid'
                            ? t('studentPortal.statusPaid')
                            : linkedPayment.status === 'partial'
                            ? t('studentPortal.statusPartial')
                            : t('studentPortal.statusPending')
                      })}
                    </span>
                  )}
                </div>

                {evaluatingPaymentMessage.reportedPaid && evaluatingPaymentMessage.paidToName && (
                  <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                    {t('teacherPortal.paymentMessagesBanner.paidToLine', {
                      recipient: evaluatingPaymentMessage.paidToName,
                      method: methodLabel ? ` (${methodLabel})` : ''
                    })}
                  </p>
                )}

                {evaluatingPaymentMessage.message && (
                  <p className="text-xs text-slate-700 dark:text-slate-200 italic">
                    "{evaluatingPaymentMessage.message}"
                  </p>
                )}
              </div>

              <div className="space-y-1">
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-200">
                  {t('teacherPortal.paymentMessageEvalModal.evaluationLabel')}
                </label>
                <textarea
                  rows={3}
                  value={evalTeacherNote}
                  onChange={e => setEvalTeacherNote(e.target.value)}
                  placeholder={t('teacherPortal.paymentMessageEvalModal.evaluationPlaceholder')}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-indigo-500 resize-none"
                />
              </div>

              {!isAlreadyPaid && (
                <div className="rounded-xl border border-emerald-500/25 bg-emerald-50/40 dark:bg-emerald-950/20 p-3 space-y-2.5 text-xs">
                  <label className="flex items-start gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={evalMarkAsPaid}
                      onChange={e => setEvalMarkAsPaid(e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                    />
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      {t('teacherPortal.paymentMessageEvalModal.markAsPaidCheckbox')}
                    </span>
                  </label>

                  {evalMarkAsPaid && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                          {t('teacherPortal.classControl.mobilePartialModal.methodLabel')}
                        </label>
                        <select
                          value={evalPaymentMethod}
                          onChange={e => setEvalPaymentMethod(e.target.value as PaymentMethod)}
                          className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-xs font-semibold text-slate-900 dark:text-white"
                        >
                          <option value="cash">{t('common.paymentMethods.cash')}</option>
                          <option value="bizum">{t('common.paymentMethods.bizum')}</option>
                          <option value="transfer">{t('common.paymentMethods.transfer')}</option>
                          <option value="card">{t('common.paymentMethods.cardDebitCredit')}</option>
                        </select>
                      </div>
                      <label className="flex items-center gap-2 text-[11px] font-semibold text-slate-700 dark:text-slate-300 pt-4 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={evalCollectedByTeacher}
                          onChange={e => setEvalCollectedByTeacher(e.target.checked)}
                          className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600"
                        />
                        <span>{t('teacherPortal.paymentMessageEvalModal.collectedByTeacherLabel')}</span>
                      </label>
                    </div>
                  )}
                </div>
              )}

              {evalPaymentMsgError && (
                <p className="text-xs font-semibold text-rose-600 dark:text-rose-400">
                  {evalPaymentMsgError}
                </p>
              )}

              <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  disabled={isEvaluatingPaymentMsg}
                  onClick={() => setEvaluatingPaymentMessage(null)}
                  className="rounded-xl border border-slate-300 dark:border-slate-700 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  {t('teacherPortal.paymentMessageEvalModal.cancel')}
                </button>
                <button
                  type="button"
                  disabled={isEvaluatingPaymentMsg}
                  onClick={() => void handleEvaluatePaymentMessage('rejected')}
                  className="inline-flex items-center gap-1 rounded-xl border border-rose-500/40 bg-rose-50 dark:bg-rose-950/30 px-3 py-2 text-xs font-bold text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-950/60 disabled:opacity-50"
                >
                  {isEvaluatingPaymentMsg && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  <span>{t('teacherPortal.paymentMessageEvalModal.rejectButton')}</span>
                </button>
                <button
                  type="button"
                  disabled={isEvaluatingPaymentMsg}
                  onClick={() => void handleEvaluatePaymentMessage('approved')}
                  className="inline-flex items-center gap-1 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {isEvaluatingPaymentMsg && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  <span>{t('teacherPortal.paymentMessageEvalModal.approveButton')}</span>
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};