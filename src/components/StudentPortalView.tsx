import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { createTranslator } from '../lib/i18n';
import {
  Clock,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Info,
  Smartphone,
  Copy,
  Check,
  X,
  UserMinus,
  AlertTriangle,
  Loader2,
  CalendarX2,
  Calendar,
  Camera,
  Lock,
  ClipboardList,
  Filter,
  IdCard
} from 'lucide-react';
import { Activity, StudentAbsence, UserRole } from '../types';
import { NewsCarouselSection } from './NewsCarouselSection';
import { formatSocioNumberPadded } from '../lib/memberNumber';
import {
  canStudentCancelAbsence,
  formatIsoDateLocal,
  getActivitySessionDates,
  isClassSessionClosed,
  isClassSessionClosedOrPast,
  parseIsoDateLocal,
  SessionDateOption
} from '../lib/absences';

interface StudentPortalViewProps {
  onNavigateToProfile?: () => void;
}

export const StudentPortalView: React.FC<StudentPortalViewProps> = ({
  onNavigateToProfile
}) => {
  const {
    students,
    profiles,
    activities,
    teachers,
    payments,
    sessions,
    selectedPeriod,
    currentStudentId,
    setCurrentStudentId,
    currentRole,
    currentUser,
    cancelActivityEnrollmentRequest,
    requestActivityUnenrollment,
    cancelActivityUnenrollmentRequest,
    studentAbsences,
    reportStudentAbsence,
    cancelStudentAbsence,
    language
  } = useApp();
  const t = createTranslator(language);

  // Estado de los acordeones (replegados por defecto, incluido el historial dentro de Tus Actividades)
  const [isActivitiesOpen, setIsActivitiesOpen] = useState(false);
  const [isAbsencesOpen, setIsAbsencesOpen] = useState(false);
  const [isCuotasOpen, setIsCuotasOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [historyActivityFilter, setHistoryActivityFilter] = useState<string>('all');
  const [historyTypeFilter, setHistoryTypeFilter] = useState<'all' | 'attendance' | 'absence'>('all');
  const [cancellingActivityId, setCancellingActivityId] = useState<string | null>(null);
  const [cancellingDropActivityId, setCancellingDropActivityId] = useState<string | null>(null);
  const [pendingUnenrollActivity, setPendingUnenrollActivity] = useState<Activity | null>(null);
  const [dropReason, setDropReason] = useState('');
  const [isUnenrolling, setIsUnenrolling] = useState(false);
  const [absenceActivity, setAbsenceActivity] = useState<Activity | null>(null);
  const [absenceDate, setAbsenceDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [absenceReason, setAbsenceReason] = useState('');
  const [isReportingAbsence, setIsReportingAbsence] = useState(false);
  const [cancellingAbsenceId, setCancellingAbsenceId] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Modal / Detalle de "Datos actividad"
  const [selectedActivityForModal, setSelectedActivityForModal] = useState<Activity | null>(null);
  const [copiedBizum, setCopiedBizum] = useState(false);

  const currentStudent =
    (currentRole !== UserRole.Admin && currentUser
      ? students.find(
          s =>
            (currentUser.studentId && s.id === currentUser.studentId) ||
            s.profileId === currentUser.id ||
            (currentUser.email &&
              s.email.trim().toLowerCase() === currentUser.email.trim().toLowerCase())
        )
      : undefined) ||
    students.find(s => s.id === currentStudentId) ||
    students[0];

  const matchedStudentProfile = currentStudent
    ? profiles.find(
        p =>
          (currentStudent.profileId && p.id === currentStudent.profileId) ||
          (currentStudent.email &&
            p.email.trim().toLowerCase() === currentStudent.email.trim().toLowerCase())
      )
    : undefined;
  const matchedTeacherForStudent = currentStudent?.email
    ? teachers.find(
        tc => tc.email.trim().toLowerCase() === currentStudent.email.trim().toLowerCase()
      )
    : undefined;
  const isOwnStudentView =
    currentRole !== UserRole.Admin ||
    (Boolean(currentUser?.id) && matchedStudentProfile?.id === currentUser?.id);
  const studentAvatar =
    (isOwnStudentView ? currentUser?.photoURL : undefined) ||
    matchedStudentProfile?.photoURL ||
    matchedTeacherForStudent?.avatarUrl ||
    matchedTeacherForStudent?.avatar ||
    '';
  const formattedMemberNumber = formatSocioNumberPadded(
    currentStudent?.memberNumber ||
      matchedStudentProfile?.memberNumber ||
      matchedTeacherForStudent?.memberNumber ||
      (isOwnStudentView ? currentUser?.memberNumber : undefined)
  );

  // Actividades en las que está matriculado este alumno
  const enrolledActivities = activities.filter(act =>
    currentStudent?.activities.some(enroll => enroll.activityId === act.id)
  );

  // Solicitudes de inscripción pendientes enviadas por este alumno
  const pendingRequestedActivities = (currentStudent?.pendingEnrollments || [])
    .map(enr => ({
      enrollment: enr,
      activity: activities.find(a => a.id === enr.activityId)
    }))
    .filter(item => Boolean(item.activity));

  // Pagos del alumno en todos los períodos y en el período actual
  const myAllPayments = payments.filter(p => p.studentId === currentStudent?.id);
  const myPeriodPayments = myAllPayments.filter(p => p.periodMonth === selectedPeriod);
  const periodPendingCount = myPeriodPayments.filter(
    p => p.status === 'pending' || p.status === 'overdue'
  ).length;
  const periodPartialCount = myPeriodPayments.filter(p => p.status === 'partial').length;
  const globalPendingCount = myAllPayments.filter(
    p => p.status === 'pending' || p.status === 'overdue'
  ).length;
  const globalPartialCount = myAllPayments.filter(p => p.status === 'partial').length;

  const pendingCount = globalPendingCount;
  const partialCount = globalPartialCount;
  const otherPeriodUnsettled = myAllPayments.filter(
    p =>
      p.periodMonth !== selectedPeriod &&
      (p.status === 'pending' || p.status === 'overdue' || p.status === 'partial')
  );

  // Historial completo de recibos liquidados
  const myAllPaidPayments = myAllPayments.filter(p => p.status === 'paid');

  // Ausencias y solicitudes comunicadas por este alumno (no canceladas)
  const todayStr = formatIsoDateLocal(new Date());
  const myUpcomingAbsences = (studentAbsences || [])
    .filter(
      abs =>
        abs.studentId === currentStudent?.id &&
        abs.status !== 'cancelled'
    )
    .sort((a, b) => b.sessionDate.localeCompare(a.sessionDate));

  const myActiveAbsencesCount = myUpcomingAbsences.filter(
    abs => abs.status === 'reported' || abs.status === 'pending'
  ).length;

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
    [language]
  );

  // Cursos/Talleres disponibles para filtrar en el Historial de Asistencias y Ausencias
  const historyFilterActivities = useMemo(() => {
    const ids = new Set<string>();
    enrolledActivities.forEach(a => ids.add(a.id));
    if (currentStudent) {
      sessions.forEach(ses => {
        if (ses.attendanceRecords?.some(r => r.studentId === currentStudent.id)) {
          ids.add(ses.activityId);
        }
      });
      studentAbsences.forEach(abs => {
        if (abs.studentId === currentStudent.id && abs.status !== 'cancelled') {
          ids.add(abs.activityId);
        }
      });
    }
    return activities
      .filter(a => ids.has(a.id))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [activities, enrolledActivities, sessions, studentAbsences, currentStudent?.id]);

  // Historial unificado de Asistencias y Ausencias del alumno actual
  type HistoryEntryStatus =
    | 'present'
    | 'partial'
    | 'absent'
    | 'absence_reported'
    | 'absence_pending'
    | 'absence_approved'
    | 'absence_rejected';

  interface HistoryEntry {
    key: string;
    activityId: string;
    activityName: string;
    date: string;
    status: HistoryEntryStatus;
    kind: 'attendance' | 'absence';
    topic?: string;
    reason?: string;
    isClosed: boolean;
    absenceRecord?: StudentAbsence;
  }

  const allStudentHistoryEntries = useMemo<HistoryEntry[]>(() => {
    if (!currentStudent) return [];

    const absenceByKey = new Map<string, StudentAbsence>();
    for (const abs of studentAbsences) {
      if (abs.studentId !== currentStudent.id || abs.status === 'cancelled') continue;
      const absDateStr = abs.sessionDate?.slice(0, 10) || '';
      absenceByKey.set(`${abs.activityId}::${absDateStr}`, abs);
    }

    const entriesMap = new Map<string, HistoryEntry>();

    // 1. Entradas desde sesiones registradas (asistencias y faltas)
    for (const ses of sessions) {
      const rec = ses.attendanceRecords?.find(r => r.studentId === currentStudent.id);
      if (!rec) continue;
      const dateStr = ses.date?.slice(0, 10) || '';
      const key = `${ses.activityId}::${dateStr}`;
      const act = activities.find(a => a.id === ses.activityId);
      const matchedAbs = absenceByKey.get(key);

      let entryStatus: HistoryEntryStatus;
      let kind: 'attendance' | 'absence';

      if (matchedAbs?.status === 'pending') {
        entryStatus = 'absence_pending';
        kind = 'absence';
      } else if (rec.attendance === 'present') {
        entryStatus = 'present';
        kind = 'attendance';
      } else if (rec.attendance === 'partial') {
        entryStatus = 'partial';
        kind = 'attendance';
      } else if (matchedAbs?.status === 'approved') {
        entryStatus = 'absence_approved';
        kind = 'absence';
      } else if (matchedAbs?.status === 'reported') {
        entryStatus = 'absence_reported';
        kind = 'absence';
      } else if (matchedAbs?.status === 'rejected') {
        entryStatus = 'absence_rejected';
        kind = 'absence';
      } else {
        entryStatus = 'absent';
        kind = 'absence';
      }

      entriesMap.set(key, {
        key,
        activityId: ses.activityId,
        activityName: act?.name || t('studentPortal.absenceUnknownWorkshop'),
        date: dateStr,
        status: entryStatus,
        kind,
        topic: ses.topic?.trim() || undefined,
        reason: matchedAbs?.reason,
        isClosed: Boolean(ses.isClosed),
        absenceRecord: matchedAbs
      });
    }

    // 2. Avisos/solicitudes de ausencia sin registro todavía en session_attendances
    for (const abs of studentAbsences) {
      if (abs.studentId !== currentStudent.id || abs.status === 'cancelled') continue;
      const dateStr = abs.sessionDate?.slice(0, 10) || '';
      const key = `${abs.activityId}::${dateStr}`;
      if (entriesMap.has(key)) continue;
      const act = activities.find(a => a.id === abs.activityId);
      const entryStatus: HistoryEntryStatus =
        abs.status === 'pending'
          ? 'absence_pending'
          : abs.status === 'approved'
          ? 'absence_approved'
          : abs.status === 'rejected'
          ? 'absence_rejected'
          : 'absence_reported';

      entriesMap.set(key, {
        key,
        activityId: abs.activityId,
        activityName: act?.name || t('studentPortal.absenceUnknownWorkshop'),
        date: dateStr,
        status: entryStatus,
        kind: 'absence',
        reason: abs.reason,
        isClosed: isClassSessionClosed(sessions, abs.activityId, dateStr),
        absenceRecord: abs
      });
    }

    return Array.from(entriesMap.values()).sort((a, b) => b.date.localeCompare(a.date));
  }, [currentStudent, sessions, studentAbsences, activities, language]);

  const historyByActivity = useMemo(() => {
    if (historyActivityFilter === 'all') return allStudentHistoryEntries;
    return allStudentHistoryEntries.filter(item => item.activityId === historyActivityFilter);
  }, [allStudentHistoryEntries, historyActivityFilter]);

  const filteredHistoryEntries = useMemo(() => {
    if (historyTypeFilter === 'all') return historyByActivity;
    return historyByActivity.filter(item => item.kind === historyTypeFilter);
  }, [historyByActivity, historyTypeFilter]);

  const historySummaryStats = useMemo(() => {
    const attendancesCount = historyByActivity.filter(item => item.kind === 'attendance').length;
    const absencesCount = historyByActivity.filter(
      item => item.kind === 'absence' && item.status !== 'absence_pending' && item.status !== 'absence_rejected'
    ).length;
    const pendingCount = historyByActivity.filter(item => item.status === 'absence_pending').length;
    const totalRecorded = attendancesCount + absencesCount;
    const rate = totalRecorded > 0 ? Math.round((attendancesCount / totalRecorded) * 100) : null;
    return {
      attendancesCount,
      absencesCount,
      pendingCount,
      rate
    };
  }, [historyByActivity]);

  const buildSessionsForActivity = (act: Activity): SessionDateOption[] => {
    const actRecordedSessions = sessions.filter(s => s.activityId === act.id);
    const enrollmentDates = students
      .flatMap(st => st.activities)
      .filter(enr => enr.activityId === act.id)
      .map(enr => enr.enrolledSince?.split('T')[0]);
    const sessionDates = actRecordedSessions.map(s => s.date?.split('T')[0]);
    return getActivitySessionDates({
      activity: act,
      startDateCandidates: [
        act.startDate,
        act.createdAt,
        ...sessionDates,
        ...enrollmentDates
      ],
      recordedSessions: actRecordedSessions,
      dayNamesShort,
      todayStr
    });
  };

  const absenceModalSessions = useMemo(() => {
    if (!absenceActivity) return [];
    return buildSessionsForActivity(absenceActivity);
  }, [absenceActivity, sessions, students, dayNamesShort, todayStr]);

  const isTargetAbsenceClosedOrPast = useMemo(() => {
    if (!absenceActivity || !absenceDate) return false;
    return isClassSessionClosedOrPast({
      activity: absenceActivity,
      sessionDate: absenceDate,
      sessions
    });
  }, [absenceActivity, absenceDate, sessions]);

  const selectedSessionBtnRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (!absenceActivity) return;
    const raf = requestAnimationFrame(() => {
      selectedSessionBtnRef.current?.scrollIntoView({
        block: 'center',
        behavior: 'auto'
      });
    });
    return () => cancelAnimationFrame(raf);
  }, [absenceActivity?.id]);

  const openReportAbsenceModal = (act: Activity) => {
    const allSessions = buildSessionsForActivity(act);
    const nextUpcoming = allSessions.find(item => item.dateStr >= todayStr);
    const fallbackDate = nextUpcoming?.dateStr || allSessions[allSessions.length - 1]?.dateStr || todayStr;
    setAbsenceDate(fallbackDate);
    setAbsenceReason('');
    setAbsenceActivity(act);
  };

  const handleConfirmReportAbsence = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentStudent || !absenceActivity || !absenceDate) return;
    setIsReportingAbsence(true);
    setActionFeedback(null);
    const targetAct = absenceActivity;
    const chosenDate = absenceDate;
    const sendAsRequest = isClassSessionClosedOrPast({
      activity: targetAct,
      sessionDate: chosenDate,
      sessions
    });
    try {
      const res = await reportStudentAbsence({
        studentId: currentStudent.id,
        activityId: targetAct.id,
        sessionDate: chosenDate,
        reason: absenceReason.trim() || undefined,
        asRequest: sendAsRequest
      });
      setAbsenceActivity(null);
      setAbsenceReason('');
      if (res.success) {
        const isPendingRequest = res.status === 'pending' || sendAsRequest;
        setActionFeedback({
          type: 'success',
          message: isPendingRequest
            ? t('studentPortal.absenceRequestSubmittedSuccess', {
                activity: targetAct.name,
                date: chosenDate
              })
            : t('studentPortal.absenceReportedSuccess', {
                activity: targetAct.name,
                date: chosenDate
              })
        });
        setTimeout(() => setActionFeedback(null), 5500);
      } else {
        setActionFeedback({
          type: 'error',
          message: res.error || t('studentPortal.absenceReportError')
        });
      }
    } finally {
      setIsReportingAbsence(false);
    }
  };

  const handleCancelAbsenceNotice = async (absenceId: string, actName: string) => {
    setCancellingAbsenceId(absenceId);
    setActionFeedback(null);
    try {
      const res = await cancelStudentAbsence(absenceId);
      if (res.success) {
        setActionFeedback({
          type: 'success',
          message: t('studentPortal.absenceCancelledSuccess', { activity: actName })
        });
        setTimeout(() => setActionFeedback(null), 4500);
      } else {
        setActionFeedback({
          type: 'error',
          message: res.error || t('studentPortal.absenceReportError')
        });
      }
    } finally {
      setCancellingAbsenceId(null);
    }
  };

  const handleCopyBizum = (phone: string) => {
    navigator.clipboard?.writeText(phone);
    setCopiedBizum(true);
    setTimeout(() => setCopiedBizum(false), 2000);
  };

  const handleConfirmSelfUnenroll = async () => {
    if (!currentStudent || !pendingUnenrollActivity) return;
    setIsUnenrolling(true);
    setActionFeedback(null);
    const activityToDrop = pendingUnenrollActivity;
    const reasonToSend = dropReason.trim();
    try {
      const res = await requestActivityUnenrollment(
        currentStudent.id,
        activityToDrop.id,
        reasonToSend || undefined
      );
      setPendingUnenrollActivity(null);
      setDropReason('');
      if (res.success) {
        setActionFeedback({
          type: 'success',
          message: t('studentPortal.unenrollSuccess', { activity: activityToDrop.name })
        });
        setTimeout(() => setActionFeedback(null), 5500);
      } else {
        setActionFeedback({
          type: 'error',
          message: res.error || t('studentPortal.unenrollError', { activity: activityToDrop.name })
        });
      }
    } finally {
      setIsUnenrolling(false);
    }
  };

  const handleCancelPendingDrop = async (act: Activity) => {
    if (!currentStudent) return;
    setCancellingDropActivityId(act.id);
    setActionFeedback(null);
    try {
      const res = await cancelActivityUnenrollmentRequest(currentStudent.id, act.id);
      if (res.success) {
        setActionFeedback({
          type: 'success',
          message: t('studentPortal.cancelDropSuccess', { activity: act.name })
        });
        setTimeout(() => setActionFeedback(null), 5000);
      } else {
        setActionFeedback({
          type: 'error',
          message: res.error || t('studentPortal.unenrollError', { activity: act.name })
        });
      }
    } finally {
      setCancellingDropActivityId(null);
    }
  };

  const getActivityPaymentBadge = (activityId: string) => {
    const actPayments = myPeriodPayments.filter(p => p.activityId === activityId);
    if (actPayments.some(p => p.status === 'overdue')) {
      return {
        label: t('studentPortal.badges.overdue'),
        className: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30',
        icon: 'alert' as const
      };
    }
    if (actPayments.some(p => p.status === 'partial')) {
      return {
        label: t('studentPortal.badges.partial'),
        className: 'bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/30',
        icon: 'partial' as const
      };
    }
    if (actPayments.some(p => p.status === 'pending')) {
      return {
        label: t('studentPortal.badges.pending'),
        className: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
        icon: 'clock' as const
      };
    }
    if (actPayments.some(p => p.status === 'paid')) {
      return {
        label: t('studentPortal.badges.paid'),
        className: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
        icon: 'paid' as const
      };
    }
    return {
      label: t('studentPortal.badges.none'),
      className: 'bg-slate-200/70 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-300/60 dark:border-slate-700',
      icon: 'none' as const
    };
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Banner de Bienvenida del Alumno */}
      <div className="rounded-2xl border border-emerald-500/20 bg-gradient-to-r from-emerald-950/20 via-slate-900/40 to-emerald-900/10 p-3.5 sm:p-5 shadow-xs backdrop-blur-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
          <div className="flex items-center gap-3.5 min-w-0 flex-1">
            <div className="relative group shrink-0">
              {studentAvatar ? (
                <img
                  src={studentAvatar}
                  alt={currentStudent?.name || currentUser?.name || ''}
                  className="h-14 w-14 rounded-2xl object-cover border-2 border-emerald-500/40 shadow-md group-hover:border-emerald-400 transition bg-white dark:bg-slate-900"
                />
              ) : (
                <div className="h-14 w-14 rounded-2xl bg-emerald-600/20 border-2 border-emerald-500/40 flex items-center justify-center text-emerald-600 dark:text-emerald-400 font-extrabold text-xl shadow-md group-hover:border-emerald-400 transition">
                  {(currentStudent?.name || currentUser?.name || 'A').charAt(0).toUpperCase()}
                </div>
              )}
              {onNavigateToProfile && (
                <button
                  type="button"
                  onClick={onNavigateToProfile}
                  title={t('studentPortal.changeAvatarTooltip')}
                  className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full bg-emerald-600 text-white flex items-center justify-center shadow-xs hover:bg-emerald-700 transition"
                >
                  <Camera className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2 min-w-0">
                  <span className="text-[10px] uppercase font-bold text-emerald-600 dark:text-emerald-400 tracking-wider">
                    {t('studentPortal.portalTitle')}
                  </span>
                  <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
                    {enrolledActivities.length === 1
                      ? t('studentPortal.workshopSingular', { count: enrolledActivities.length })
                      : t('studentPortal.workshopPlural', { count: enrolledActivities.length })}
                  </span>
                </div>
                {formattedMemberNumber && (
                  <span className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/30 bg-white/85 dark:bg-slate-900/75 px-2.5 py-0.5 text-[11px] font-mono font-bold text-emerald-800 dark:text-emerald-200 shadow-2xs whitespace-nowrap shrink-0">
                    <IdCard className="h-3 w-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span>{t('common.socioNumberBadge', { number: formattedMemberNumber })}</span>
                  </span>
                )}
              </div>
              
              <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white truncate">
                {t('studentPortal.greeting', { name: currentStudent?.name || '' })}
              </h2>
              <p className="hidden sm:block text-xs text-slate-500 dark:text-slate-400">
                {t('studentPortal.greetingSubtitle')}
              </p>
            </div>
          </div>

          {/* Selector de alumno para simulación rápida (solo Administrador) */}
          {currentRole === UserRole.Admin && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">{t('studentPortal.viewAs')}</span>
              <select
                value={currentStudentId}
                onChange={e => setCurrentStudentId(e.target.value)}
                className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-bold text-slate-800 dark:text-slate-200 focus:outline-emerald-500"
              >
                {students.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* SECCIÓN 1: Acordeón "Tus Actividades" (replegado por defecto) */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs overflow-hidden">
        <button
          type="button"
          onClick={() => setIsActivitiesOpen(prev => !prev)}
          aria-expanded={isActivitiesOpen}
          aria-label={
            isActivitiesOpen
              ? t('studentPortal.activitiesAccordionCollapseAria')
              : t('studentPortal.activitiesAccordionExpandAria')
          }
          className="w-full p-3.5 sm:p-5 text-left flex items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition"
        >
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="h-9 w-9 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <Sparkles className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  <span>{t('studentPortal.yourActivitiesTitle')}</span>
                  <span className="hidden sm:inline font-semibold text-slate-500 dark:text-slate-400">
                    {' '}{t('studentPortal.yourActivitiesSchedules')}
                  </span>
                </h3>
                <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-300 whitespace-nowrap shrink-0">
                  {enrolledActivities.length === 1
                    ? t('studentPortal.workshopSingular', { count: enrolledActivities.length })
                    : t('studentPortal.workshopPlural', { count: enrolledActivities.length })}
                </span>
                {pendingRequestedActivities.length > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-300 whitespace-nowrap shrink-0">
                    <Clock className="h-3 w-3" />
                    <span className="sm:hidden">
                      {pendingRequestedActivities.length === 1
                        ? t('studentPortal.pendingCountMobileOne', { count: pendingRequestedActivities.length })
                        : t('studentPortal.pendingCountMobileMany', { count: pendingRequestedActivities.length })}
                    </span>
                    <span className="hidden sm:inline">
                      {pendingRequestedActivities.length === 1
                        ? t('studentPortal.pendingCountDesktopOne', { count: pendingRequestedActivities.length })
                        : t('studentPortal.pendingCountDesktopMany', { count: pendingRequestedActivities.length })}
                    </span>
                  </span>
                )}
                {myActiveAbsencesCount > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/15 px-2 py-0.5 text-[10px] font-bold text-sky-700 dark:text-sky-300 whitespace-nowrap shrink-0">
                    <CalendarX2 className="h-3 w-3" />
                    <span>
                      {myActiveAbsencesCount === 1
                        ? t('studentPortal.absencesBadgeOne', { count: myActiveAbsencesCount })
                        : t('studentPortal.absencesBadgeMany', { count: myActiveAbsencesCount })}
                    </span>
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                {t('studentPortal.yourActivitiesSubtitle')}
              </p>
            </div>
          </div>

          <span
            aria-hidden="true"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 shrink-0"
          >
            {isActivitiesOpen ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
          </span>
        </button>

        {actionFeedback && (
          <div className="px-3.5 sm:px-5 pb-3.5">
            <div
              className={`rounded-xl border px-3.5 py-2.5 text-xs font-semibold flex items-center gap-2 ${
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
          </div>
        )}

        {isActivitiesOpen && (
          <div className="p-3.5 sm:p-5 pt-3 border-t border-slate-100 dark:border-slate-800 space-y-4">
            {enrolledActivities.length === 0 && pendingRequestedActivities.length === 0 ? (
              <div className="py-6 sm:py-8 text-center text-xs text-slate-400">
                {t('studentPortal.noEnrolledActivities')}
              </div>
            ) : (
              <div className="space-y-4">
            {enrolledActivities.length > 0 && (
              <>
                {/* Vista Móvil Consistente (Distribución 2x2 + acciones inferiores) */}
                <div className="md:hidden space-y-3">
                  {enrolledActivities.map(act => {
                    const teacher = teachers.find(item => item.id === act.teacherId);
                    const paymentBadge = getActivityPaymentBadge(act.id);
                    const enrollment = currentStudent?.activities.find(e => e.activityId === act.id);
                    const isDropPending = enrollment?.status === 'pending_unenroll';
                    const isCancellingDrop = cancellingDropActivityId === act.id;

                    return (
                      <div
                        key={act.id}
                        className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs"
                      >
                        {/* Fila 1: Categoría + Nombre | Monitor responsable */}
                        <div className="grid grid-cols-2 gap-3 items-start">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-1">
                              <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                                {act.category}
                              </span>
                              <span
                                className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] font-bold shrink-0 whitespace-nowrap ${paymentBadge.className}`}
                              >
                                {paymentBadge.icon === 'paid' && <CheckCircle2 className="h-2.5 w-2.5" />}
                                {paymentBadge.icon === 'partial' && <Clock className="h-2.5 w-2.5" />}
                                {paymentBadge.icon === 'alert' && <AlertCircle className="h-2.5 w-2.5" />}
                                {paymentBadge.icon === 'clock' && <Clock className="h-2.5 w-2.5" />}
                                <span>{paymentBadge.label}</span>
                              </span>
                            </div>
                            <h4 className="mt-1.5 text-base font-bold text-slate-900 dark:text-white leading-tight break-words">
                              {act.name}
                            </h4>
                            {isDropPending && (
                              <span className="mt-1 inline-flex items-center gap-1 rounded-full border border-amber-500/35 bg-amber-500/15 px-2 py-0.5 text-[9px] font-bold text-amber-800 dark:text-amber-200">
                                <Clock className="h-2.5 w-2.5" />
                                <span>{t('studentPortal.dropPendingBadge')}</span>
                              </span>
                            )}
                          </div>

                          <div className="rounded-xl bg-slate-50 dark:bg-slate-800/40 p-2.5 border border-slate-200/60 dark:border-slate-800 min-w-0">
                            <span className="text-[10px] uppercase font-bold text-slate-400 block leading-tight">
                              {t('activitiesView.monitorLabel')}
                            </span>
                            <span className="font-semibold text-xs text-slate-900 dark:text-white mt-0.5 block truncate">
                              {teacher?.name || t('studentPortal.noTeacher')}
                            </span>
                          </div>
                        </div>

                        {/* Fila 2: Espacio / Sala | Horarios de clase */}
                        <div className="mt-3 grid grid-cols-2 gap-3 items-start">
                          <div className="rounded-xl bg-slate-50 dark:bg-slate-800/40 p-2.5 border border-slate-200/60 dark:border-slate-800 min-w-0">
                            <span className="text-[10px] uppercase font-bold text-slate-400 block leading-tight">
                              {t('activitiesView.roomLabel')}
                            </span>
                            <span className="font-semibold text-xs text-slate-900 dark:text-white mt-0.5 block truncate">
                              {act.room || t('studentPortal.noRoom')}
                            </span>
                          </div>

                          <div className="min-w-0">
                            <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1.5 leading-tight">
                              {t('activitiesView.scheduleLabel')}
                            </span>
                            <div className="flex flex-wrap gap-1.5">
                              {act.schedule.length === 0 ? (
                                <span className="text-[11px] text-slate-400">
                                  {t('studentPortal.noSchedule')}
                                </span>
                              ) : (
                                act.schedule.map((sch, i) => (
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

                        {act.description && (
                          <p className="mt-2.5 text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed line-clamp-2">
                            {act.description}
                          </p>
                        )}

                        {/* Fila inferior móvil: Tarifas a la izquierda + Botón Datos actividad a la derecha */}
                        <div className="mt-3.5 border-t border-slate-100 dark:border-slate-800/80 pt-3 space-y-2.5">
                          <div className="flex items-center justify-between gap-2.5">
                            <div className="min-w-0">
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

                            <button
                              type="button"
                              onClick={() => setSelectedActivityForModal(act)}
                              title={t('studentPortal.activityDataButton')}
                              aria-label={t('studentPortal.activityDataAria', { name: act.name })}
                              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600/10 hover:bg-emerald-600 hover:text-white text-emerald-700 dark:text-emerald-300 px-3.5 py-2.5 text-xs font-bold transition shadow-xs whitespace-nowrap shrink-0 active:scale-[0.99]"
                            >
                              <Info className="h-3.5 w-3.5 shrink-0" />
                              <span>{t('studentPortal.activityDataButton')}</span>
                            </button>
                          </div>

                          {currentStudent && (
                            <div className={`grid gap-2 ${!isDropPending ? 'grid-cols-2' : 'grid-cols-1'}`}>
                              {!isDropPending && (
                                <button
                                  type="button"
                                  onClick={() => openReportAbsenceModal(act)}
                                  title={t('studentPortal.reportAbsenceButton')}
                                  aria-label={t('studentPortal.reportAbsenceAria', { name: act.name })}
                                  className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-sky-200 dark:border-sky-800/80 bg-sky-50/70 dark:bg-sky-950/25 px-3 py-2 text-xs font-bold text-sky-700 dark:text-sky-300 hover:bg-sky-600 hover:text-white transition whitespace-nowrap active:scale-[0.99]"
                                >
                                  <CalendarX2 className="h-3.5 w-3.5 shrink-0" />
                                  <span className="truncate">{t('studentPortal.reportAbsenceButton')}</span>
                                </button>
                              )}
                              {isDropPending ? (
                                <button
                                  type="button"
                                  disabled={isCancellingDrop}
                                  onClick={() => handleCancelPendingDrop(act)}
                                  title={t('studentPortal.cancelDropButton')}
                                  aria-label={t('studentPortal.cancelDropAria', { name: act.name })}
                                  className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-500/15 px-3 py-2 text-xs font-bold text-amber-800 dark:text-amber-200 hover:bg-amber-500/25 transition whitespace-nowrap active:scale-[0.99] disabled:opacity-50"
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
                                    setPendingUnenrollActivity(act);
                                  }}
                                  title={t('studentPortal.unenrollButton')}
                                  aria-label={t('studentPortal.unenrollAria', { name: act.name })}
                                  className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-rose-200 dark:border-rose-800/70 bg-rose-500/10 px-3 py-2 text-xs font-bold text-rose-700 dark:text-rose-300 hover:bg-rose-600 hover:text-white transition whitespace-nowrap active:scale-[0.99]"
                                >
                                  <UserMinus className="h-3.5 w-3.5 shrink-0" />
                                  <span className="truncate">{t('studentPortal.unenrollButton')}</span>
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Vista Escritorio Completa */}
                <div className="hidden md:grid grid-cols-2 gap-4">
                  {enrolledActivities.map(act => {
                    const teacher = teachers.find(item => item.id === act.teacherId);
                    return (
                      <div
                        key={act.id}
                        className="rounded-xl border border-slate-200/90 dark:border-slate-800 p-4 bg-slate-50/60 dark:bg-slate-800/30 hover:border-emerald-500/40 transition space-y-3.5"
                      >
                        {/* Encabezado actividad */}
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h4 className="font-extrabold text-slate-900 dark:text-white text-base">
                              {act.name}
                            </h4>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wide">
                                {act.billingMode === 'per_class' ? t('studentPortal.billingPerClass') : t('studentPortal.billingMonthly')}
                              </span>
                              <span className="text-slate-300 dark:text-slate-700">•</span>
                              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                                {t('studentPortal.roomPrefix')} <strong className="text-slate-700 dark:text-slate-300">{act.room}</strong>
                              </span>
                            </div>
                          </div>
                        </div>

                        <p className="text-slate-500 dark:text-slate-400 text-xs leading-relaxed line-clamp-2">
                          {act.description}
                        </p>

                        {/* Monitor asignado con Foto/Avatar visible */}
                        <div className="rounded-xl bg-white dark:bg-slate-800/80 p-2.5 border border-slate-200/80 dark:border-slate-700/60 flex items-center justify-between">
                          <div className="flex items-center gap-2.5">
                            {(teacher?.avatarUrl || teacher?.avatar) ? (
                              <img
                                src={teacher.avatarUrl || teacher.avatar}
                                alt={teacher.name}
                                className="h-10 w-10 rounded-full object-cover border-2 border-emerald-500/50 shadow-xs"
                              />
                            ) : (
                              <div className="h-10 w-10 rounded-full bg-emerald-100 dark:bg-emerald-950/60 border border-emerald-500/40 flex items-center justify-center font-bold text-emerald-700 dark:text-emerald-300 text-sm">
                                {teacher?.name.charAt(0) || 'M'}
                              </div>
                            )}
                            <div>
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                                {t('studentPortal.responsibleTeacher')}
                              </span>
                              <span className="text-xs font-bold text-slate-900 dark:text-white">
                                {teacher?.name}
                              </span>
                              {teacher?.phone && (
                                <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
                                  {teacher.phone}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Botón "Datos actividad" */}
                          <button
                            onClick={() => setSelectedActivityForModal(act)}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600/10 hover:bg-emerald-600 hover:text-white text-emerald-700 dark:text-emerald-300 dark:hover:text-white px-3 py-1.5 text-xs font-bold transition min-h-[38px] active:scale-95"
                          >
                            <Info className="h-3.5 w-3.5" />
                            <span>{t('studentPortal.activityDataButton')}</span>
                          </button>
                        </div>

                        {/* Horarios de asistencia */}
                        <div className="flex flex-wrap items-center gap-1.5 pt-1">
                          <span className="text-[11px] text-slate-400 font-medium mr-1">{t('studentPortal.schedulePrefix')}</span>
                          {act.schedule.map((sch, i) => (
                            <span
                              key={i}
                              className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300"
                            >
                              <Clock className="h-3 w-3" />
                              {sch}
                            </span>
                          ))}
                        </div>

                        {/* Pie de tarjeta: estado cuota + solicitar/cancelar baja */}
                        {(() => {
                          const paymentBadge = getActivityPaymentBadge(act.id);
                          const enrollment = currentStudent?.activities.find(e => e.activityId === act.id);
                          const isDropPending = enrollment?.status === 'pending_unenroll';
                          const isCancellingDrop = cancellingDropActivityId === act.id;
                          return (
                            <div className="pt-2.5 border-t border-slate-200/70 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span
                                  className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-bold whitespace-nowrap ${paymentBadge.className}`}
                                >
                                  {paymentBadge.icon === 'paid' && <CheckCircle2 className="h-3 w-3" />}
                                  {paymentBadge.icon === 'partial' && <Clock className="h-3 w-3" />}
                                  {paymentBadge.icon === 'alert' && <AlertCircle className="h-3 w-3" />}
                                  {paymentBadge.icon === 'clock' && <Clock className="h-3 w-3" />}
                                  <span>{paymentBadge.label}</span>
                                </span>
                                {isDropPending && (
                                  <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/35 bg-amber-500/15 px-2.5 py-0.5 text-[10px] font-bold text-amber-800 dark:text-amber-200 whitespace-nowrap">
                                    <Clock className="h-3 w-3" />
                                    <span>{t('studentPortal.dropPendingBadge')}</span>
                                  </span>
                                )}
                              </div>

                              {currentStudent && (
                                <div className="flex items-center gap-1.5 shrink-0">
                                  {!isDropPending && (
                                    <button
                                      type="button"
                                      onClick={() => openReportAbsenceModal(act)}
                                      className="inline-flex items-center gap-1.5 rounded-lg border border-sky-200 dark:border-sky-800/80 bg-sky-50/70 dark:bg-sky-950/25 px-2.5 py-1 text-[11px] font-bold text-sky-700 dark:text-sky-300 hover:bg-sky-600 hover:text-white dark:hover:bg-sky-600 dark:hover:text-white transition active:scale-95"
                                    >
                                      <CalendarX2 className="h-3.5 w-3.5" />
                                      <span>{t('studentPortal.reportAbsenceButton')}</span>
                                    </button>
                                  )}
                                  {isDropPending ? (
                                    <button
                                      type="button"
                                      disabled={isCancellingDrop}
                                      onClick={() => handleCancelPendingDrop(act)}
                                      aria-label={t('studentPortal.cancelDropAria', { name: act.name })}
                                      className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-500/10 px-2.5 py-1 text-[11px] font-bold text-amber-800 dark:text-amber-200 hover:bg-amber-500/20 transition active:scale-95 disabled:opacity-50"
                                    >
                                      {isCancellingDrop ? (
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                      ) : (
                                        <X className="h-3.5 w-3.5" />
                                      )}
                                      <span>{t('studentPortal.cancelDropButton')}</span>
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setDropReason('');
                                        setPendingUnenrollActivity(act);
                                      }}
                                      className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 dark:border-rose-800/80 bg-rose-50/70 dark:bg-rose-950/25 px-2.5 py-1 text-[11px] font-bold text-rose-700 dark:text-rose-300 hover:bg-rose-600 hover:text-white dark:hover:bg-rose-600 dark:hover:text-white transition active:scale-95"
                                    >
                                      <UserMinus className="h-3.5 w-3.5" />
                                      <span>{t('studentPortal.unenrollButton')}</span>
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {/* Sub-bloque agrupado desplegable: Avisos de ausencia próximos */}
            {/*{myUpcomingAbsences.length > 0 && currentStudent && (
              <div
                className={`${
                  enrolledActivities.length > 0 ? 'pt-3 border-t border-slate-100 dark:border-slate-800' : ''
                }`}
              >
                <div className="rounded-xl border border-sky-500/35 bg-sky-50/70 dark:bg-sky-950/20 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setIsAbsencesOpen(prev => !prev)}
                    aria-expanded={isAbsencesOpen}
                    aria-label={
                      isAbsencesOpen
                        ? t('studentPortal.absencesAccordionCollapseAria')
                        : t('studentPortal.absencesAccordionExpandAria')
                    }
                    className="w-full p-3 sm:p-3.5 text-left flex items-center justify-between gap-2 hover:bg-sky-100/60 dark:hover:bg-sky-900/20 transition"
                  >
                    <h4 className="text-xs font-bold text-sky-900 dark:text-sky-200 flex items-center gap-1.5">
                      <CalendarX2 className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400 shrink-0" />
                      <span>{t('studentPortal.upcomingAbsencesTitle', { count: myUpcomingAbsences.length })}</span>
                    </h4>
                    <span aria-hidden="true" className="text-sky-600 dark:text-sky-400 shrink-0">
                      {isAbsencesOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </span>
                  </button>

                  {isAbsencesOpen && (
                    <div className="px-3 pb-3 sm:px-3.5 sm:pb-3.5 pt-2 border-t border-sky-500/20 divide-y divide-sky-500/20">
                      {myUpcomingAbsences.map(abs => {
                        const act = activities.find(a => a.id === abs.activityId);
                        const actName = act?.name || t('studentPortal.absenceUnknownWorkshop');
                        const isBusy = cancellingAbsenceId === abs.id;
                        const sessionClosed = isClassSessionClosed(sessions, abs.activityId, abs.sessionDate);
                        const canCancel = canStudentCancelAbsence(abs, sessions);
                        return (
                          <div
                            key={abs.id}
                            className="py-2.5 first:pt-1 last:pb-0 flex items-center justify-between gap-2 text-xs"
                          >
                            <div className="min-w-0 flex-1 space-y-0.5">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="font-bold text-slate-900 dark:text-white truncate">
                                  {actName} · {abs.sessionDate}
                                </span>
                                {abs.status === 'pending' && (
                                  <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/35 bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-800 dark:text-amber-200 whitespace-nowrap">
                                    <Clock className="h-2.5 w-2.5 shrink-0" />
                                    <span>{t('studentPortal.absenceStatus.pending')}</span>
                                  </span>
                                )}
                                {abs.status === 'approved' && (
                                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/35 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-300 whitespace-nowrap">
                                    <CheckCircle2 className="h-2.5 w-2.5 shrink-0" />
                                    <span>{t('studentPortal.absenceStatus.approved')}</span>
                                  </span>
                                )}
                                {abs.status === 'rejected' && (
                                  <span className="inline-flex items-center gap-1 rounded-full border border-rose-500/35 bg-rose-500/15 px-2 py-0.5 text-[10px] font-bold text-rose-700 dark:text-rose-300 whitespace-nowrap">
                                    <X className="h-2.5 w-2.5 shrink-0" />
                                    <span>{t('studentPortal.absenceStatus.rejected')}</span>
                                  </span>
                                )}
                                {abs.status === 'reported' && (
                                  <span className="inline-flex items-center gap-1 rounded-full border border-sky-500/35 bg-sky-500/15 px-2 py-0.5 text-[10px] font-bold text-sky-700 dark:text-sky-300 whitespace-nowrap">
                                    <CalendarX2 className="h-2.5 w-2.5 shrink-0" />
                                    <span>{t('studentPortal.absenceStatus.reported')}</span>
                                  </span>
                                )}
                                {sessionClosed && (
                                  <span className="inline-flex items-center gap-1 rounded-full border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap">
                                    <Lock className="h-2.5 w-2.5 shrink-0" />
                                    <span>{t('studentPortal.absenceClassClosedBadge')}</span>
                                  </span>
                                )}
                              </div>
                              {abs.reason && (
                                <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate block">
                                  {abs.reason}
                                </span>
                              )}
                            </div>
                            {canCancel && (
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => handleCancelAbsenceNotice(abs.id, actName)}
                                className="inline-flex items-center gap-1 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-[11px] font-bold text-slate-700 dark:text-slate-200 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-300 transition shrink-0 whitespace-nowrap disabled:opacity-50"
                              >
                                {isBusy ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <X className="h-3.5 w-3.5" />
                                )}
                                <span>{t('studentPortal.cancelAbsenceButton')}</span>
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}*/}

            {/* Sub-bloque agrupado: Solicitudes de inscripción pendientes */}
            {pendingRequestedActivities.length > 0 && currentStudent && (
              <div
                className={`${
                  enrolledActivities.length > 0 ? 'pt-3 border-t border-slate-100 dark:border-slate-800' : ''
                }`}
              >
                <div className="rounded-xl border border-amber-500/35 bg-amber-50/70 dark:bg-amber-950/20 p-3 sm:p-3.5 space-y-2.5">
                  <h4 className="text-xs font-bold text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                    <span>{t('studentPortal.pendingConfirmTitle', { count: pendingRequestedActivities.length })}</span>
                  </h4>

                  {/* Móvil: tarjetas uniformes 2x2 + Tarifas / Cancelar */}
                  <div className="md:hidden space-y-2.5">
                    {pendingRequestedActivities.map(({ enrollment, activity }) => {
                      if (!activity) return null;
                      const teacherItem = teachers.find(tc => tc.id === activity.teacherId);
                      const isBusy = cancellingActivityId === activity.id;
                      return (
                        <div
                          key={activity.id}
                          className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs"
                        >
                          <div className="grid grid-cols-2 gap-3 items-start">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-1">
                                <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                                  {activity.category}
                                </span>
                                <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-bold text-amber-800 dark:text-amber-200">
                                  <Clock className="h-2.5 w-2.5" />
                                  <span>{t('activitiesView.requestPending')}</span>
                                </span>
                              </div>
                              <h5 className="mt-1.5 text-base font-bold text-slate-900 dark:text-white leading-tight break-words">
                                {activity.name}
                              </h5>
                            </div>

                            <div className="rounded-xl bg-slate-50 dark:bg-slate-800/40 p-2.5 border border-slate-200/60 dark:border-slate-800 min-w-0">
                              <span className="text-[10px] uppercase font-bold text-slate-400 block leading-tight">
                                {t('activitiesView.monitorLabel')}
                              </span>
                              <span className="font-semibold text-xs text-slate-900 dark:text-white mt-0.5 block truncate">
                                {teacherItem?.name || t('studentPortal.noTeacher')}
                              </span>
                            </div>
                          </div>

                          <div className="mt-3 grid grid-cols-2 gap-3 items-start">
                            <div className="rounded-xl bg-slate-50 dark:bg-slate-800/40 p-2.5 border border-slate-200/60 dark:border-slate-800 min-w-0">
                              <span className="text-[10px] uppercase font-bold text-slate-400 block leading-tight">
                                {t('activitiesView.roomLabel')}
                              </span>
                              <span className="font-semibold text-xs text-slate-900 dark:text-white mt-0.5 block truncate">
                                {activity.room || t('studentPortal.noRoom')}
                              </span>
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

                          <div className="mt-3.5 border-t border-slate-100 dark:border-slate-800/80 pt-3 flex items-center justify-between gap-2.5">
                            <div className="min-w-0">
                              <span className="text-slate-400 text-[11px] block leading-tight">
                                {t('activitiesView.ratesLabel')}
                              </span>
                              <div className="text-xs font-bold tabular-nums text-slate-900 dark:text-white mt-0.5">
                                {t('activitiesView.rateSummary', {
                                  monthly: activity.defaultPriceMonthly,
                                  perClass: activity.defaultPricePerClass
                                })}
                              </div>
                            </div>

                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={async () => {
                                setCancellingActivityId(activity.id);
                                try {
                                  await cancelActivityEnrollmentRequest(currentStudent.id, activity.id);
                                } finally {
                                  setCancellingActivityId(null);
                                }
                              }}
                              className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-rose-300 dark:border-rose-800 bg-rose-50/70 dark:bg-rose-950/30 px-3.5 py-2.5 text-xs font-bold text-rose-700 dark:text-rose-300 hover:bg-rose-600 hover:text-white transition shadow-xs whitespace-nowrap shrink-0 active:scale-[0.99] disabled:opacity-50"
                            >
                              {isBusy ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                              ) : (
                                <X className="h-3.5 w-3.5 shrink-0" />
                              )}
                              <span>{isBusy ? t('studentPortal.cancelling') : t('studentPortal.cancel')}</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Escritorio */}
                  <div className="hidden md:block divide-y divide-amber-500/20">
                    {pendingRequestedActivities.map(({ enrollment, activity }) => {
                      if (!activity) return null;
                      const teacherItem = teachers.find(tc => tc.id === activity.teacherId);
                      const isBusy = cancellingActivityId === activity.id;
                      return (
                        <div
                          key={activity.id}
                          className="py-2 first:pt-1 last:pb-0 flex items-center justify-between gap-2 text-xs"
                        >
                          <div className="min-w-0 flex-1">
                            <span className="font-bold text-slate-900 dark:text-white truncate block">
                              {activity.name}
                            </span>
                            <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate block">
                              {teacherItem?.name ? `${teacherItem.name} · ` : ''}{t('studentPortal.requestedOn', { date: enrollment.enrolledSince })}
                            </span>
                          </div>
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={async () => {
                              setCancellingActivityId(activity.id);
                              try {
                                await cancelActivityEnrollmentRequest(currentStudent.id, activity.id);
                              } finally {
                                setCancellingActivityId(null);
                              }
                            }}
                            className="inline-flex items-center gap-1 rounded-xl border border-rose-300 dark:border-rose-800 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-[11px] font-bold text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition shrink-0 whitespace-nowrap disabled:opacity-50"
                          >
                            <X className="h-3.5 w-3.5" />
                            <span>{isBusy ? t('studentPortal.cancelling') : t('studentPortal.cancel')}</span>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
              </div>
            )}

            {/* Sub-bloque agrupado desplegable (replegado por defecto): Historial de Asistencias y Ausencias */}
            {currentStudent && (
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/30 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setIsHistoryOpen(prev => !prev)}
                    aria-expanded={isHistoryOpen}
                    aria-label={
                      isHistoryOpen
                        ? t('studentPortal.historyPanel.collapseAria')
                        : t('studentPortal.historyPanel.expandAria')
                    }
                    className="w-full p-3 sm:p-3.5 text-left flex items-center justify-between gap-2.5 hover:bg-slate-100/70 dark:hover:bg-slate-800/50 transition min-h-[44px]"
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <div className="h-8 w-8 rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400 flex items-center justify-center shrink-0">
                        <ClipboardList className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
                            {t('studentPortal.historyPanel.title')}
                          </h4>
                          <span className="inline-flex items-center rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-300 whitespace-nowrap tabular-nums">
                            {t('studentPortal.historyPanel.attendancesBadge', {
                              count: historySummaryStats.attendancesCount
                            })}
                          </span>
                          <span className="inline-flex items-center rounded-full bg-sky-500/15 px-2 py-0.5 text-[10px] font-bold text-sky-700 dark:text-sky-300 whitespace-nowrap tabular-nums">
                            {t('studentPortal.historyPanel.absencesBadge', {
                              count: historySummaryStats.absencesCount
                            })}
                          </span>
                          {historySummaryStats.pendingCount > 0 && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-800 dark:text-amber-200 whitespace-nowrap tabular-nums">
                              <Clock className="h-2.5 w-2.5 shrink-0" />
                              <span>
                                {t('studentPortal.historyPanel.pendingBadge', {
                                  count: historySummaryStats.pendingCount
                                })}
                              </span>
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                          {t('studentPortal.historyPanel.subtitle')}
                        </p>
                      </div>
                    </div>

                    <span aria-hidden="true" className="text-slate-400 shrink-0">
                      {isHistoryOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </span>
                  </button>

                  {isHistoryOpen && (
                    <div className="p-3 sm:p-4 pt-3 border-t border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900/70 space-y-4">
                      {/* Barra de Filtros: Curso / Taller + Tipo */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-2 min-w-0 sm:max-w-xs w-full">
                          <Filter className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                          <label className="sr-only" htmlFor="student-history-activity-filter">
                            {t('studentPortal.historyPanel.filterByWorkshopLabel')}
                          </label>
                          <select
                            id="student-history-activity-filter"
                            value={historyActivityFilter}
                            onChange={e => setHistoryActivityFilter(e.target.value)}
                            className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs font-bold text-slate-800 dark:text-slate-100 focus:outline-sky-500"
                          >
                            <option value="all">{t('studentPortal.historyPanel.allWorkshopsOption')}</option>
                            {historyFilterActivities.map(act => (
                              <option key={act.id} value={act.id}>
                                {act.name}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="inline-flex items-center gap-1 rounded-xl bg-slate-100 dark:bg-slate-800 p-1 self-start sm:self-auto">
                          {(
                            [
                              { key: 'all', label: t('studentPortal.historyPanel.typeAll') },
                              { key: 'attendance', label: t('studentPortal.historyPanel.typeAttendances') },
                              { key: 'absence', label: t('studentPortal.historyPanel.typeAbsences') }
                            ] as const
                          ).map(tab => (
                            <button
                              key={tab.key}
                              type="button"
                              onClick={() => setHistoryTypeFilter(tab.key)}
                              className={`rounded-lg px-2.5 py-1.5 text-[11px] font-bold transition ${
                                historyTypeFilter === tab.key
                                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                              }`}
                            >
                              {tab.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Tarjetas resumen según el curso/taller seleccionado */}
                      <div className="grid grid-cols-3 gap-2.5">
                        <div className="rounded-xl border border-emerald-500/20 bg-emerald-50/50 dark:bg-emerald-950/20 p-3">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300 block">
                            {t('studentPortal.historyPanel.kpiAttendances')}
                          </span>
                          <div className="flex items-baseline gap-1.5 mt-1">
                            <span className="text-lg sm:text-xl font-black text-slate-900 dark:text-white tabular-nums">
                              {historySummaryStats.attendancesCount}
                            </span>
                            {historySummaryStats.rate !== null && (
                              <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                                ({historySummaryStats.rate}%)
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="rounded-xl border border-sky-500/20 bg-sky-50/50 dark:bg-sky-950/20 p-3">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-sky-700 dark:text-sky-300 block">
                            {t('studentPortal.historyPanel.kpiAbsences')}
                          </span>
                          <span className="text-lg sm:text-xl font-black text-slate-900 dark:text-white mt-1 block tabular-nums">
                            {historySummaryStats.absencesCount}
                          </span>
                        </div>

                        <div className="rounded-xl border border-amber-500/20 bg-amber-50/50 dark:bg-amber-950/20 p-3">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300 block">
                            {t('studentPortal.historyPanel.kpiPending')}
                          </span>
                          <span className="text-lg sm:text-xl font-black text-slate-900 dark:text-white mt-1 block tabular-nums">
                            {historySummaryStats.pendingCount}
                          </span>
                        </div>
                      </div>

                      {/* Listado cronológico de asistencias y ausencias */}
                      {filteredHistoryEntries.length === 0 ? (
                        <div className="py-6 text-center text-xs text-slate-400 rounded-xl border border-dashed border-slate-200 dark:border-slate-800">
                          {t('studentPortal.historyPanel.empty')}
                        </div>
                      ) : (
                        <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs max-h-96 overflow-y-auto pr-1">
                          {filteredHistoryEntries.map(entry => {
                            const canCancel =
                              entry.absenceRecord && canStudentCancelAbsence(entry.absenceRecord, sessions);
                            const isBusy =
                              entry.absenceRecord && cancellingAbsenceId === entry.absenceRecord.id;

                            const badgeConfig =
                              entry.status === 'present'
                                ? {
                                    label: t('studentPortal.historyPanel.statusPresent'),
                                    cls: 'border-emerald-500/35 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
                                    icon: <CheckCircle2 className="h-2.5 w-2.5 shrink-0" />
                                  }
                                : entry.status === 'partial'
                                ? {
                                    label: t('studentPortal.historyPanel.statusPartial'),
                                    cls: 'border-teal-500/35 bg-teal-500/15 text-teal-700 dark:text-teal-300',
                                    icon: <Clock className="h-2.5 w-2.5 shrink-0" />
                                  }
                                : entry.status === 'absence_pending'
                                ? {
                                    label: t('studentPortal.absenceStatus.pending'),
                                    cls: 'border-amber-500/35 bg-amber-500/15 text-amber-800 dark:text-amber-200',
                                    icon: <Clock className="h-2.5 w-2.5 shrink-0" />
                                  }
                                : entry.status === 'absence_approved'
                                ? {
                                    label: t('studentPortal.absenceStatus.approved'),
                                    cls: 'border-emerald-500/35 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
                                    icon: <CheckCircle2 className="h-2.5 w-2.5 shrink-0" />
                                  }
                                : entry.status === 'absence_rejected'
                                ? {
                                    label: t('studentPortal.absenceStatus.rejected'),
                                    cls: 'border-rose-500/35 bg-rose-500/15 text-rose-700 dark:text-rose-300',
                                    icon: <X className="h-2.5 w-2.5 shrink-0" />
                                  }
                                : entry.status === 'absence_reported'
                                ? {
                                    label: t('studentPortal.absenceStatus.reported'),
                                    cls: 'border-sky-500/35 bg-sky-500/15 text-sky-700 dark:text-sky-300',
                                    icon: <CalendarX2 className="h-2.5 w-2.5 shrink-0" />
                                  }
                                : {
                                    label: t('studentPortal.historyPanel.statusAbsent'),
                                    cls: 'border-rose-500/35 bg-rose-500/15 text-rose-700 dark:text-rose-300',
                                    icon: <AlertCircle className="h-2.5 w-2.5 shrink-0" />
                                  };

                            return (
                              <div
                                key={entry.key}
                                className="py-3 first:pt-1 last:pb-1 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                              >
                                <div className="min-w-0 flex-1 space-y-1">
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <span className="font-mono text-[11px] font-bold text-slate-500 dark:text-slate-400 tabular-nums">
                                      {entry.date}
                                    </span>
                                    <span className="font-bold text-slate-900 dark:text-white truncate">
                                      {entry.activityName}
                                    </span>
                                    <span
                                      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold whitespace-nowrap ${badgeConfig.cls}`}
                                    >
                                      {badgeConfig.icon}
                                      <span>{badgeConfig.label}</span>
                                    </span>
                                    {entry.isClosed && (
                                      <span className="inline-flex items-center gap-1 rounded-full border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap">
                                        <Lock className="h-2.5 w-2.5 shrink-0" />
                                        <span>{t('studentPortal.absenceClassClosedBadge')}</span>
                                      </span>
                                    )}
                                  </div>
                                  {(entry.topic || entry.reason) && (
                                    <div className="text-[11px] text-slate-500 dark:text-slate-400 space-y-0.5">
                                      {entry.topic && (
                                        <span className="block truncate">
                                          {t('studentPortal.historyPanel.topicPrefix')} {entry.topic}
                                        </span>
                                      )}
                                      {entry.reason && (
                                        <span className="block italic truncate">
                                          {t('studentPortal.historyPanel.reasonPrefix')} "{entry.reason}"
                                        </span>
                                      )}
                                    </div>
                                  )}
                                </div>

                                {canCancel && entry.absenceRecord && (
                                  <button
                                    type="button"
                                    disabled={Boolean(isBusy)}
                                    onClick={() =>
                                      handleCancelAbsenceNotice(entry.absenceRecord!.id, entry.activityName)
                                    }
                                    className="self-start sm:self-center inline-flex items-center gap-1 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-[11px] font-bold text-slate-700 dark:text-slate-200 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-300 transition shrink-0 whitespace-nowrap disabled:opacity-50"
                                  >
                                    {isBusy ? (
                                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                      <X className="h-3.5 w-3.5" />
                                    )}
                                    <span>{t('studentPortal.cancelAbsenceButton')}</span>
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* SECCIÓN 2: Acordeón Único "Cuotas" (replegado por defecto con Estado de tus cuotas + Histórico de pagos) */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs overflow-hidden">
        <button
          type="button"
          onClick={() => setIsCuotasOpen(!isCuotasOpen)}
          aria-expanded={isCuotasOpen}
          aria-label={isCuotasOpen ? t('studentPortal.feesAccordionCollapseAria') : t('studentPortal.feesAccordionExpandAria')}
          className="w-full p-3.5 sm:p-5 text-left flex items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition"
        >
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="h-9 w-9 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold shrink-0">
              💳
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  {t('studentPortal.feesTitle')}
                </h3>
                {pendingCount > 0 && (
                  <span className="inline-flex items-center rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 px-2 py-0.5 text-[10px] font-bold whitespace-nowrap shrink-0">
                    {pendingCount === 1
                      ? t('studentPortal.pendingCountMobileOne', { count: pendingCount })
                      : t('studentPortal.pendingCountMobileMany', { count: pendingCount })}
                  </span>
                )}
                {partialCount > 0 && (
                  <span className="inline-flex items-center rounded-full bg-orange-500/15 text-orange-700 dark:text-orange-300 px-2 py-0.5 text-[10px] font-bold whitespace-nowrap shrink-0">
                    {partialCount === 1
                      ? t('studentPortal.partialCountOne', { count: partialCount })
                      : t('studentPortal.partialCountMany', { count: partialCount })}
                  </span>
                )}
                {pendingCount === 0 && partialCount === 0 && (
                  <span className="inline-flex items-center rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 text-[10px] font-bold whitespace-nowrap shrink-0">
                    {t('studentPortal.upToDate')}
                  </span>
                )}
                <span className="inline-flex items-center rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-2 py-0.5 text-[10px] font-bold whitespace-nowrap shrink-0">
                  {myAllPaidPayments.length === 1
                    ? t('studentPortal.receiptSingular', { count: myAllPaidPayments.length })
                    : t('studentPortal.receiptPlural', { count: myAllPaidPayments.length })}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                {isCuotasOpen
                  ? t('studentPortal.feesSubtitleOpen', { period: selectedPeriod })
                  : t('studentPortal.feesSubtitleClosed', { period: selectedPeriod })}
              </p>
            </div>
          </div>

          <span
            aria-hidden="true"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 shrink-0"
          >
            {isCuotasOpen ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
          </span>
        </button>

        {isCuotasOpen && (
          <div className="p-3.5 sm:p-5 pt-4 border-t border-slate-100 dark:border-slate-800 space-y-6">
            {/* Bloque 1: Estado de tus cuotas */}
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-xs sm:text-sm font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-200">
                  {t('studentPortal.feesStatusHeading', { period: selectedPeriod })}
                </h4>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {myPeriodPayments.length === 0 ? (
                  <div className="col-span-full py-5 text-center text-xs text-slate-400 rounded-xl border border-dashed border-slate-200 dark:border-slate-800">
                    {t('studentPortal.noFeesThisMonth')}
                  </div>
                ) : (
                  myPeriodPayments.map(p => {
                    const isPaid = p.status === 'paid';
                    const isPartial = p.status === 'partial';
                    const act = activities.find(a => a.id === p.activityId);

                    return (
                      <div
                        key={p.id}
                        className={`rounded-xl border p-4 transition ${
                          isPaid
                            ? 'border-emerald-500/30 bg-emerald-50/40 dark:bg-emerald-950/20'
                            : isPartial
                            ? 'border-orange-500/30 bg-orange-50/40 dark:bg-orange-950/20'
                            : 'border-amber-500/30 bg-amber-50/40 dark:bg-amber-950/20'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <span className="font-mono text-[10px] text-slate-400 font-semibold block">
                              {p.receiptNumber}
                            </span>
                            <h5 className="font-bold text-slate-900 dark:text-white text-sm mt-0.5">
                              {p.activityName}
                            </h5>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              {t('studentPortal.monthLabel', { month: p.periodMonth })}
                            </p>
                          </div>

                          <div className="text-right shrink-0">
                            <span className="text-xl font-black text-slate-900 dark:text-white block whitespace-nowrap">
                              {p.amount.toFixed(2)} €
                            </span>
                            {isPaid ? (
                              <span className="inline-flex items-center gap-1 font-bold text-emerald-600 dark:text-emerald-400 text-xs whitespace-nowrap">
                                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                                {t('studentPortal.statusPaid')}
                              </span>
                            ) : isPartial ? (
                              <span className="inline-flex items-center gap-1 font-bold text-orange-600 dark:text-orange-400 text-xs whitespace-nowrap">
                                <Clock className="h-3.5 w-3.5 shrink-0" />
                                {t('studentPortal.statusPartial')}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 font-bold text-amber-600 dark:text-amber-400 text-xs whitespace-nowrap">
                                <Clock className="h-3.5 w-3.5 shrink-0" />
                                {t('studentPortal.statusPending')}
                              </span>
                            )}
                          </div>
                        </div>

                        {isPaid ? (
                          <div className="mt-4 pt-3 border-t border-emerald-200/50 dark:border-emerald-800/40 flex items-center justify-between gap-2 text-xs">
                            <span className="text-slate-600 dark:text-slate-300 text-xs font-medium min-w-0">
                              {t('studentPortal.paidOnLabel', {
                                date: p.paymentDate || '',
                                method: p.paymentMethod === 'cash' ? t('common.paymentMethods.cash') : p.paymentMethod || '',
                                teacherNote: p.collectedByTeacher ? t('studentPortal.collectedByTeacherNote') : ''
                              })}
                            </span>
                            <span className="inline-flex items-center gap-1 font-bold text-emerald-600 dark:text-emerald-400 text-xs whitespace-nowrap shrink-0">
                              <CheckCircle2 className="h-4 w-4 shrink-0" />
                              {t('studentPortal.verifiedBadge')}
                            </span>
                          </div>
                        ) : isPartial ? (
                          <div className="mt-4 pt-3 border-t border-orange-200/60 dark:border-orange-800/40 text-xs space-y-1.5">
                            <div className="flex items-center justify-between gap-2 text-orange-800 dark:text-orange-300 font-medium">
                              <span className="min-w-0">
                                {t('studentPortal.partialOnLabel', {
                                  date: p.paymentDate || '—',
                                  method: p.paymentMethod === 'cash' ? t('common.paymentMethods.cash') : p.paymentMethod || '',
                                  teacherNote: p.collectedByTeacher ? t('studentPortal.collectedByTeacherNote') : ''
                                })}
                              </span>
                              <span className="font-bold whitespace-nowrap shrink-0">{t('studentPortal.remainderPending')}</span>
                            </div>
                            {p.notes && (
                              <p className="text-[11px] text-slate-500 dark:text-slate-400">{p.notes}</p>
                            )}
                          </div>
                        ) : (
                          <div className="mt-4 pt-3 border-t border-amber-200/60 dark:border-amber-800/40 text-xs space-y-2">
                            <p className="text-amber-800 dark:text-amber-300 font-medium">
                              {t('studentPortal.paymentInstructions')}
                            </p>

                            {act?.bizum_enabled && act.bizum_phone ? (
                              <div className="rounded-lg bg-white/90 dark:bg-slate-900 p-2.5 font-mono text-[11px] text-slate-700 dark:text-slate-300 border border-amber-300 dark:border-amber-800 flex items-center justify-between">
                                <div>
                                  <span className="block text-[10px] text-amber-600 dark:text-amber-400 font-sans font-bold">
                                    {t('studentPortal.directWorkshopBizum')}
                                  </span>
                                  <strong>{act.bizum_phone}</strong> ({act.bizum_concept || p.receiptNumber})
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleCopyBizum(act.bizum_phone!)}
                                  className="p-1 text-slate-500 hover:text-slate-900"
                                  title={t('studentPortal.copyBizumTooltip')}
                                >
                                  {copiedBizum ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                                </button>
                              </div>
                            ) : (
                              <div className="rounded-lg bg-white/80 dark:bg-slate-900/60 p-2.5 font-mono text-[11px] text-slate-700 dark:text-slate-300 border border-amber-200 dark:border-amber-800">
                                {t('studentPortal.associationBizumPrefix')} <strong>+34 600 123 456</strong> ({t('studentPortal.conceptPrefix')} {p.receiptNumber})
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {otherPeriodUnsettled.length > 0 && (
                <div className="pt-3 space-y-2">
                  <h5 className="text-[11px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300">
                    {t('studentPortal.otherPeriodsHeading', { count: otherPeriodUnsettled.length })}
                  </h5>
                  <div className="divide-y divide-amber-500/20 rounded-xl border border-amber-500/30 bg-amber-50/40 dark:bg-amber-950/15 px-3 text-xs">
                    {otherPeriodUnsettled.map(p => (
                      <div key={p.id} className="py-2.5 flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <span className="font-bold text-slate-900 dark:text-white block truncate">
                            {p.activityName} · {p.periodMonth}
                          </span>
                          <span className="font-mono text-[10px] text-slate-500 dark:text-slate-400">
                            {p.receiptNumber}
                          </span>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="font-extrabold text-slate-900 dark:text-white block whitespace-nowrap">
                            {p.amount.toFixed(2)} €
                          </span>
                          <span
                            className={`text-[10px] font-bold whitespace-nowrap ${
                              p.status === 'partial'
                                ? 'text-orange-600 dark:text-orange-400'
                                : p.status === 'overdue'
                                ? 'text-rose-600 dark:text-rose-400'
                                : 'text-amber-600 dark:text-amber-400'
                            }`}
                          >
                            {p.status === 'partial'
                              ? t('studentPortal.badges.partial')
                              : p.status === 'overdue'
                              ? t('studentPortal.badges.overdue')
                              : t('studentPortal.badges.pending')}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Bloque 2: Histórico de pagos */}
            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-xs sm:text-sm font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-200">
                  {t('studentPortal.paymentHistoryTitle')}
                </h4>
                <span className="rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-2.5 py-0.5 text-[10px] font-bold whitespace-nowrap">
                  {myAllPaidPayments.length === 1
                    ? t('studentPortal.receiptSingular', { count: myAllPaidPayments.length })
                    : t('studentPortal.receiptPlural', { count: myAllPaidPayments.length })}
                </span>
              </div>

              {myAllPaidPayments.length === 0 ? (
                <div className="py-5 text-center text-xs text-slate-400 rounded-xl border border-dashed border-slate-200 dark:border-slate-800">
                  {t('studentPortal.noHistoricalPayments')}
                </div>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                  {myAllPaidPayments.map(p => (
                    <div key={p.id} className="py-3 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <span className="font-mono text-emerald-600 dark:text-emerald-400 font-bold block">
                          {p.receiptNumber}
                        </span>
                        <span className="font-semibold text-slate-900 dark:text-white block truncate">
                          {p.activityName} · {p.periodMonth}
                        </span>
                        <span className="text-[11px] text-slate-400 block">
                          {t('studentPortal.historicalPaidOn', {
                            date: p.paymentDate || '',
                            method: p.paymentMethod === 'cash' ? t('common.paymentMethods.cash') : p.paymentMethod || '',
                            teacherNote: p.collectedByTeacher ? t('studentPortal.collectedByTeacherNote') : ''
                          })}
                        </span>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <span className="font-extrabold text-sm text-slate-900 dark:text-white whitespace-nowrap">
                          {p.amount.toFixed(2)} €
                        </span>
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                          {t('studentPortal.settledBadge')}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* SECCIÓN 3: Notas y comunicados en carrusel horizontal */}
      <NewsCarouselSection compact />

      {/* Modal / Ficha Informativa "Datos Actividad" (Revela Importe y Datos de Bizum) */}
      {selectedActivityForModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-5 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                  {t('studentPortal.modal.cardBadge')}
                </span>
                <h3 className="text-lg font-black text-slate-900 dark:text-white">
                  {selectedActivityForModal.name}
                </h3>
              </div>
              <button
                onClick={() => setSelectedActivityForModal(null)}
                className="rounded-lg p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                ✕
              </button>
            </div>

            {/* Importe desglosado */}
            <div className="rounded-xl bg-emerald-50/80 dark:bg-emerald-950/30 border border-emerald-500/20 p-4">
              <span className="text-xs font-semibold text-emerald-800 dark:text-emerald-300 block">
                {t('studentPortal.modal.officialFee')}
              </span>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-2xl font-black text-slate-900 dark:text-white">
                  {(selectedActivityForModal.billingMode === 'per_class'
                    ? selectedActivityForModal.defaultPricePerClass
                    : selectedActivityForModal.defaultPriceMonthly
                  ).toFixed(2)} €
                </span>
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                  {selectedActivityForModal.billingMode === 'per_class'
                    ? t('studentPortal.modal.unitPerClass')
                    : t('studentPortal.modal.unitPerMonth')}
                </span>
              </div>
              <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-1">
                {t('studentPortal.modal.modalityLabel')}{' '}
                <strong>
                  {selectedActivityForModal.billingMode === 'per_class'
                    ? t('studentPortal.modal.modalityPerClass')
                    : t('studentPortal.modal.modalityMonthly')}
                </strong>
              </p>
            </div>

            {/* Parámetros Bizum si están activos */}
            {selectedActivityForModal.bizum_enabled && (
              <div className="rounded-xl border border-sky-500/30 bg-sky-50/50 dark:bg-sky-950/20 p-4 space-y-2">
                <div className="flex items-center gap-1.5 text-sky-700 dark:text-sky-300 font-bold text-xs">
                  <Smartphone className="h-4 w-4" />
                  <span>{t('studentPortal.modal.directBizumTitle')}</span>
                </div>
                <div className="flex items-center justify-between bg-white dark:bg-slate-800 px-3 py-2 rounded-lg border border-sky-200 dark:border-sky-800 text-xs">
                  <div>
                    <span className="text-[10px] text-slate-400 block">{t('studentPortal.modal.bizumNumberLabel')}</span>
                    <strong className="text-slate-900 dark:text-white font-mono text-sm">
                      {selectedActivityForModal.bizum_phone || t('studentPortal.modal.askTeacher')}
                    </strong>
                  </div>
                  {selectedActivityForModal.bizum_phone && (
                    <button
                      onClick={() => handleCopyBizum(selectedActivityForModal.bizum_phone!)}
                      className="inline-flex items-center gap-1 rounded-md bg-sky-100 dark:bg-sky-900/60 px-2 py-1 text-[11px] font-bold text-sky-700 dark:text-sky-300"
                    >
                      {copiedBizum ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                      <span>{copiedBizum ? t('studentPortal.modal.copied') : t('studentPortal.modal.copy')}</span>
                    </button>
                  )}
                </div>
                {selectedActivityForModal.bizum_concept && (
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {t('studentPortal.modal.recommendedConcept')} <strong>{selectedActivityForModal.bizum_concept}</strong>
                  </p>
                )}
              </div>
            )}

            {/* Datos de la sala y monitor */}
            <div className="border-t border-slate-100 dark:border-slate-800 pt-3 space-y-2.5 text-xs">
              {(() => {
                const teacherItem = teachers.find(tch => tch.id === selectedActivityForModal.teacherId);
                return (
                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="rounded-xl bg-slate-50 dark:bg-slate-800/40 p-2.5 border border-slate-200/60 dark:border-slate-800 min-w-0">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block leading-tight">
                        {t('activitiesView.monitorLabel')}
                      </span>
                      <span className="font-semibold text-slate-900 dark:text-white mt-0.5 block truncate">
                        {teacherItem?.name || t('studentPortal.noTeacher')}
                      </span>
                    </div>
                    <div className="rounded-xl bg-slate-50 dark:bg-slate-800/40 p-2.5 border border-slate-200/60 dark:border-slate-800 min-w-0">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block leading-tight">
                        {t('activitiesView.roomLabel')}
                      </span>
                      <span className="font-semibold text-slate-900 dark:text-white mt-0.5 block truncate">
                        {selectedActivityForModal.room || t('studentPortal.noRoom')}
                      </span>
                    </div>
                  </div>
                );
              })()}
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1.5 leading-tight">
                  {t('activitiesView.scheduleLabel')}
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {selectedActivityForModal.schedule.map((sch, i) => (
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

            <button
              onClick={() => setSelectedActivityForModal(null)}
              className="w-full rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold py-2.5 text-xs transition"
            >
              {t('studentPortal.modal.closeCard')}
            </button>
          </div>
        </div>
      )}

      {/* Modal de confirmación de solicitud de baja de clase/taller */}
      {pendingUnenrollActivity && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-2xl space-y-4">
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
                  <strong>{pendingUnenrollActivity.name}</strong>
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
                disabled={isUnenrolling}
                onClick={() => {
                  setPendingUnenrollActivity(null);
                  setDropReason('');
                }}
                className="rounded-xl border border-slate-300 dark:border-slate-700 px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition disabled:opacity-50"
              >
                {t('studentPortal.unenrollModal.cancel')}
              </button>
              <button
                type="button"
                disabled={isUnenrolling}
                onClick={handleConfirmSelfUnenroll}
                className="inline-flex items-center gap-1.5 rounded-xl bg-amber-600 px-4 py-2 text-xs font-bold text-white hover:bg-amber-700 transition disabled:opacity-60"
              >
                {isUnenrolling && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                <span>
                  {isUnenrolling
                    ? t('studentPortal.unenrollModal.confirming')
                    : t('studentPortal.unenrollModal.confirm')}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal para avisar o solicitar ausencia a una clase */}
      {absenceActivity && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-xs">
          <form
            onSubmit={handleConfirmReportAbsence}
            className="w-full max-w-sm rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-2xl space-y-4"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-3">
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-xl shrink-0 ${
                    isTargetAbsenceClosedOrPast
                      ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                      : 'bg-sky-500/10 text-sky-600 dark:text-sky-400'
                  }`}
                >
                  <CalendarX2 className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                    {isTargetAbsenceClosedOrPast
                      ? t('studentPortal.absenceModal.requestTitle')
                      : t('studentPortal.absenceModal.title')}
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {absenceActivity.name}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAbsenceActivity(null)}
                className="rounded-lg p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {isTargetAbsenceClosedOrPast && (
              <div className="rounded-xl border border-amber-500/35 bg-amber-50/80 dark:bg-amber-950/30 p-3 text-[11px] font-medium text-amber-800 dark:text-amber-200 flex items-start gap-2 leading-relaxed">
                <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <span>{t('studentPortal.absenceModal.closedOrPastNotice')}</span>
              </div>
            )}

            {absenceModalSessions.length > 0 && (
              <div className="space-y-1.5">
                <span className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                  {t('studentPortal.absenceModal.suggestedDatesLabel')}
                </span>
                <div className="grid grid-cols-2 gap-1.5 max-h-48 overflow-y-auto pr-0.5">
                  {absenceModalSessions.map(item => {
                    const isSelected = absenceDate === item.dateStr;
                    const isSlotClosed = isClassSessionClosed(sessions, absenceActivity.id, item.dateStr);
                    const isSlotClosedOrPast =
                      isSlotClosed ||
                      isClassSessionClosedOrPast({
                        activity: absenceActivity,
                        sessionDate: item.dateStr,
                        sessions
                      });
                    return (
                      <button
                        key={item.dateStr}
                        ref={isSelected ? selectedSessionBtnRef : undefined}
                        type="button"
                        onClick={() => setAbsenceDate(item.dateStr)}
                        className={`h-12 w-full min-w-0 flex items-center gap-2 rounded-xl border px-2.5 text-left transition active:scale-[0.98] ${
                          isSelected
                            ? isSlotClosedOrPast
                              ? 'border-amber-500 bg-amber-600 text-white shadow-xs'
                              : 'border-sky-500 bg-sky-600 text-white shadow-xs'
                            : isSlotClosedOrPast
                            ? 'border-slate-200 dark:border-slate-700/80 bg-slate-50/70 dark:bg-slate-800/50 text-slate-600 dark:text-slate-300 hover:border-amber-400'
                            : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 hover:border-sky-400'
                        }`}
                      >
                        <Calendar className="h-3.5 w-3.5 shrink-0 opacity-85" />
                        <div className="min-w-0 flex-1">
                          <span className="block text-[11px] font-bold leading-tight truncate tabular-nums">
                            {item.dateLine}
                          </span>
                          <span
                            className={`block text-[10px] leading-tight truncate tabular-nums ${
                              isSelected
                                ? isSlotClosedOrPast
                                  ? 'text-amber-100'
                                  : 'text-sky-100'
                                : 'text-slate-500 dark:text-slate-400'
                            }`}
                          >
                            {item.timeLine}
                            {isSlotClosed
                              ? ` · ${t('studentPortal.absenceModal.slotClosedTag')}`
                              : isSlotClosedOrPast
                              ? ` · ${t('studentPortal.absenceModal.slotPastTag')}`
                              : ''}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="space-y-1">
              <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                {t('studentPortal.absenceModal.dateLabel')}
              </label>
              <input
                type="date"
                required
                value={absenceDate}
                onChange={e => setAbsenceDate(e.target.value)}
                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs font-semibold text-slate-900 dark:text-white focus:outline-sky-500"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                {t('studentPortal.absenceModal.reasonLabel')}
              </label>
              <textarea
                rows={2}
                value={absenceReason}
                onChange={e => setAbsenceReason(e.target.value)}
                placeholder={t('studentPortal.absenceModal.reasonPlaceholder')}
                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-sky-500 resize-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                disabled={isReportingAbsence}
                onClick={() => {
                  setAbsenceActivity(null);
                  setAbsenceReason('');
                }}
                className="rounded-xl border border-slate-300 dark:border-slate-700 px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition disabled:opacity-50"
              >
                {t('studentPortal.absenceModal.cancel')}
              </button>
              <button
                type="submit"
                disabled={isReportingAbsence || !absenceDate}
                className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold text-white transition disabled:opacity-60 ${
                  isTargetAbsenceClosedOrPast
                    ? 'bg-amber-600 hover:bg-amber-700'
                    : 'bg-sky-600 hover:bg-sky-700'
                }`}
              >
                {isReportingAbsence && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                <span>
                  {isReportingAbsence
                    ? t('studentPortal.absenceModal.submitting')
                    : isTargetAbsenceClosedOrPast
                    ? t('studentPortal.absenceModal.submitRequest')
                    : t('studentPortal.absenceModal.submit')}
                </span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
