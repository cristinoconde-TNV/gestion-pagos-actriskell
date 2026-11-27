import React, { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { createTranslator } from '../lib/i18n';
import { isClassSessionClosed } from '../lib/absences';
import {
  Activity,
  PaymentMethod,
  PaymentRecord,
  PaymentStatus,
  Student,
  StudentAbsence,
  UserRole
} from '../types';
import {
  Users,
  Search,
  Sparkles,
  Clock,
  Check,
  X,
  MessageCircle,
  UserPlus,
  UserMinus,
  AlertTriangle,
  CheckCircle2,
  Filter,
  Calendar,
  CalendarX2,
  CreditCard,
  Plus,
  Edit2,
  Trash2,
  Lock,
  ChevronDown,
  Loader2
} from 'lucide-react';

import { StudentNameButton } from './ContactQuickActions';

interface TeacherStudentsViewProps {
  onOpenEnrollStudent?: (activityId?: string) => void;
}

export const TeacherStudentsView: React.FC<TeacherStudentsViewProps> = ({
  onOpenEnrollStudent
}) => {
  const {
    students,
    activities,
    teachers,
    payments,
    periodPayments,
    sessions,
    studentAbsences,
    selectedPeriod,
    currentTeacherId,
    currentRole,
    currentUser,
    confirmActivityEnrollment,
    rejectActivityEnrollment,
    respondToStudentAbsenceRequest,
    unenrollStudentFromActivity,
    recordPayment,
    updatePayment,
    deletePayment,
    markPaymentPaid,
    language
  } = useApp();
  const t = createTranslator(language);

  const matchedUserTeacher =
    currentRole !== UserRole.Admin && currentUser
      ? teachers.find(
          item =>
            (currentUser.teacherId && item.id === currentUser.teacherId) ||
            (currentUser.email &&
              item.email.trim().toLowerCase() === currentUser.email.trim().toLowerCase())
        )
      : undefined;
  const currentTeacher =
    matchedUserTeacher ||
    (currentRole === UserRole.Admin
      ? teachers.find(item => item.id === currentTeacherId)
      : undefined);

  // 1. Filtrar estrictamente las actividades del profesor actual
  const myActivities = useMemo(
    () => activities.filter(a => a.teacherId === currentTeacher?.id),
    [activities, currentTeacher?.id]
  );
  const myActivityIds = useMemo(() => new Set(myActivities.map(a => a.id)), [myActivities]);

  // Forzamos el alcance a 'my_activities' de forma fija
  const scopeFilter = 'my_activities' as const;
  const [activityFilter, setActivityFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending_requests' | 'paid' | 'unpaid'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isPendingRequestsOpen, setIsPendingRequestsOpen] = useState<boolean>(false);
  const [isPendingAbsencesOpen, setIsPendingAbsencesOpen] = useState<boolean>(true);

  const [pendingRemoval, setPendingRemoval] = useState<{
    studentId: string;
    studentName: string;
    activityId: string;
    activityName: string;
  } | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);

  // Gestor de cuotas/cobros simplificado y limitado al monitor activo
  const [paymentManagerContext, setPaymentManagerContext] = useState<{
    studentId: string;
    initialActivityId?: string;
  } | null>(null);

  const canManageScopedPayments =
    Boolean(currentTeacher?.id) &&
    (currentRole === UserRole.Admin ||
      currentRole === UserRole.Monitor ||
      currentRole === UserRole.Hibrido);

  const localeTag = language === 'en' ? 'en-GB' : language === 'gl' ? 'gl-ES' : 'es-ES';

  const formatPeriodMonth = (period: string) => {
    if (!/^\d{4}-\d{2}$/.test(period)) return period;
    const [year, month] = period.split('-').map(Number);
    const date = new Date(year, month - 1, 1);
    if (Number.isNaN(date.getTime())) return period;
    return new Intl.DateTimeFormat(localeTag, { month: 'short', year: 'numeric' }).format(date);
  };

  const formatShortDate = (dateStr?: string) => {
    if (!dateStr) return '—';
    const clean = dateStr.slice(0, 10);
    const [y, m, d] = clean.split('-');
    if (!y || !m || !d) return dateStr;
    return `${d}/${m}/${y}`;
  };

  const formatCompactDayMonth = (dateStr?: string) => {
    if (!dateStr) return '—';
    const clean = dateStr.slice(0, 10);
    const [, m, d] = clean.split('-');
    if (!m || !d) return dateStr;
    return `${d}/${m}`;
  };

  // Solicitudes pendientes limitadas exclusivamente a las actividades del profesor
  const myPendingRequests = useMemo(() => {
    const items: Array<{
      student: Student;
      activity: Activity;
      enrolledSince: string;
    }> = [];
    for (const st of students) {
      for (const req of st.pendingEnrollments || []) {
        if (!myActivityIds.has(req.activityId)) continue;
        const act = activities.find(a => a.id === req.activityId);
        if (!act) continue;
        items.push({
          student: st,
          activity: act,
          enrolledSince: req.enrolledSince
        });
      }
    }
    return items;
  }, [students, activities, myActivityIds]);

  const myPendingAbsences = useMemo(() => {
    const scopedIds =
      activityFilter !== 'all' ? new Set([activityFilter]) : myActivityIds;
    return studentAbsences
      .filter(
        abs =>
          scopedIds.has(abs.activityId) &&
          (abs.status === 'pending' || abs.status === 'reported')
      )
      .map(abs => {
        const student = students.find(s => s.id === abs.studentId);
        const activity = activities.find(a => a.id === abs.activityId);
        if (!student || !activity) return null;
        return { absence: abs, student, activity };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .sort((a, b) => {
        if (a.absence.status !== b.absence.status) {
          return a.absence.status === 'pending' ? -1 : 1;
        }
        return b.absence.sessionDate.localeCompare(a.absence.sessionDate);
      });
  }, [studentAbsences, myActivityIds, activityFilter, students, activities]);

  // Actividades disponibles restringidas solo a las del profesor
  const activitiesAvailableInScope = useMemo(() => {
    return myActivities.filter(a => a.active !== false);
  }, [myActivities]);

  const normalizedQuery = searchQuery.trim().toLowerCase();

  const getStudentActivityPaymentSummary = (
    studentId: string,
    activityId: string
  ) => {
    const matches = periodPayments
      .filter(p => p.studentId === studentId && p.activityId === activityId)
      .sort((a, b) => (b.paymentDate || '').localeCompare(a.paymentDate || ''));

    let paymentStatus: PaymentStatus | 'none' = 'none';
    if (matches.some(p => p.status === 'paid')) paymentStatus = 'paid';
    else if (matches.some(p => p.status === 'partial')) paymentStatus = 'partial';
    else if (matches.some(p => p.status === 'overdue')) paymentStatus = 'overdue';
    else if (matches.some(p => p.status === 'pending')) paymentStatus = 'pending';
    else if (matches.some(p => p.status === 'exempt')) paymentStatus = 'exempt';
    else if (matches.some(p => p.status === 'cancelled')) paymentStatus = 'cancelled';

    // Fechas de clase de este alumno en el mes activo (desde recibos o sesiones de clase)
    const receiptDates = matches
      .map(p => p.paymentDate?.slice(0, 10))
      .filter((d): d is string => Boolean(d));

    const attendedSessionDates = sessions
      .filter(
        ses =>
          ses.activityId === activityId &&
          ses.date?.startsWith(selectedPeriod) &&
          ses.attendanceRecords?.some(
            rec => rec.studentId === studentId && rec.attendance !== 'absent'
          )
      )
      .map(ses => ses.date.slice(0, 10))
      .sort((a, b) => b.localeCompare(a));

    const latestActivitySessionDate = sessions
      .filter(ses => ses.activityId === activityId && ses.date?.startsWith(selectedPeriod))
      .map(ses => ses.date.slice(0, 10))
      .sort((a, b) => b.localeCompare(a))[0];

    const uniqueClassDates = Array.from(
      new Set([...receiptDates, ...attendedSessionDates])
    ).sort((a, b) => b.localeCompare(a));

    const totalPaidInPeriod = matches
      .filter(p => p.status === 'paid' || p.status === 'partial')
      .reduce((acc, p) => acc + p.amount, 0);

    return {
      paymentStatus,
      receipts: matches,
      latestPaymentDate: receiptDates[0],
      uniqueClassDates,
      latestActivitySessionDate,
      totalPaidInPeriod
    };
  };

  // Mapeo de alumnos limitado estrictamente a los matriculados en las actividades del profesor
  const studentRows = useMemo(() => {
    const scopedActivityIds = new Set(
      activityFilter !== 'all'
        ? [activityFilter]
        : activitiesAvailableInScope.map(a => a.id)
    );

    return students
      .filter(st => st.status !== 'inactive')
      .map(st => {
        const matchedActiveEnrollments = (st.activities || [])
          .filter(enr => scopedActivityIds.has(enr.activityId))
          .map(enr => {
            const act = activities.find(a => a.id === enr.activityId);
            if (!act || !myActivityIds.has(act.id)) return null; // Asegurar que sea suya
            const teacher = teachers.find(item => item.id === act.teacherId);
            const billingMode = enr.billingMode || act.billingMode;
            const price =
              enr.customPrice ??
              (billingMode === 'per_class' ? act.defaultPricePerClass : act.defaultPriceMonthly);
            const summary = getStudentActivityPaymentSummary(st.id, act.id);
            return {
              activity: act,
              teacherName: teacher?.name || t('teacherStudents.noTeacher'),
              isMine: true,
              billingMode,
              price,
              enrolledSince: enr.enrolledSince,
              ...summary
            };
          })
          .filter((item): item is NonNullable<typeof item> => Boolean(item));

        const matchedPendingEnrollments = (st.pendingEnrollments || [])
          .filter(enr => scopedActivityIds.has(enr.activityId))
          .map(enr => {
            const act = activities.find(a => a.id === enr.activityId);
            if (!act || !myActivityIds.has(act.id)) return null; // Asegurar que sea suya
            const teacher = teachers.find(item => item.id === act.teacherId);
            return {
              activity: act,
              teacherName: teacher?.name || t('teacherStudents.noTeacher'),
              isMine: true,
              enrolledSince: enr.enrolledSince
            };
          })
          .filter((item): item is NonNullable<typeof item> => Boolean(item));

        return {
          student: st,
          enrollments: matchedActiveEnrollments,
          pendingRequests: matchedPendingEnrollments
        };
      })
      .filter(row => row.enrollments.length > 0 || row.pendingRequests.length > 0)
      .filter(row => {
        if (statusFilter === 'pending_requests' && row.pendingRequests.length === 0) {
          return false;
        }
        if (
          statusFilter === 'paid' &&
          !row.enrollments.some(e => e.paymentStatus === 'paid')
        ) {
          return false;
        }
        if (
          statusFilter === 'unpaid' &&
          !row.enrollments.some(
            e =>
              e.paymentStatus === 'pending' ||
              e.paymentStatus === 'overdue' ||
              e.paymentStatus === 'partial' ||
              e.paymentStatus === 'none'
          )
        ) {
          return false;
        }
        if (normalizedQuery) {
          const haystack = [
            row.student.name,
            row.student.email,
            row.student.phone,
            ...row.enrollments.map(e => `${e.activity.name} ${e.teacherName}`),
            ...row.pendingRequests.map(p => `${p.activity.name} ${p.teacherName}`)
          ]
            .join(' ')
            .toLowerCase();
          if (!haystack.includes(normalizedQuery)) return false;
        }
        return true;
      });
  }, [
    students,
    activities,
    teachers,
    periodPayments,
    sessions,
    selectedPeriod,
    activitiesAvailableInScope,
    activityFilter,
    statusFilter,
    normalizedQuery,
    myActivityIds
  ]);

  const totalEnrollmentsInList = useMemo(
    () => studentRows.reduce((acc, r) => acc + r.enrollments.length, 0),
    [studentRows]
  );

  const handleConfirmEnrollment = async (student: Student, activity: Activity) => {
    const key = `confirm:${student.id}:${activity.id}`;
    setBusyKey(key);
    setErrorMsg(null);
    setFeedbackMsg(null);
    try {
      const res = await confirmActivityEnrollment(student.id, activity.id);
      if (res.success) {
        setFeedbackMsg(
          t('teacherStudents.confirmSuccess', { name: student.name, activity: activity.name })
        );
        setTimeout(() => setFeedbackMsg(null), 4000);
      } else {
        setErrorMsg(res.error || t('teacherStudents.confirmErrorFallback'));
      }
    } finally {
      setBusyKey(null);
    }
  };

  const handleRejectEnrollment = async (student: Student, activity: Activity) => {
    const key = `reject:${student.id}:${activity.id}`;
    setBusyKey(key);
    setErrorMsg(null);
    setFeedbackMsg(null);
    try {
      const res = await rejectActivityEnrollment(student.id, activity.id);
      if (res.success) {
        setFeedbackMsg(
          t('teacherStudents.rejectSuccess', { name: student.name, activity: activity.name })
        );
        setTimeout(() => setFeedbackMsg(null), 4000);
      } else {
        setErrorMsg(res.error || t('teacherStudents.rejectErrorFallback'));
      }
    } finally {
      setBusyKey(null);
    }
  };

  const handleConfirmAbsence = async (
    absence: StudentAbsence,
    student: Student,
    activity: Activity
  ) => {
    const key = `confirmAbsence:${absence.id}`;
    setBusyKey(key);
    setErrorMsg(null);
    setFeedbackMsg(null);
    try {
      const res = await respondToStudentAbsenceRequest(absence.id, true);
      if (res.success) {
        setFeedbackMsg(
          t('teacherStudents.absenceConfirmed', { name: student.name, activity: activity.name })
        );
        setTimeout(() => setFeedbackMsg(null), 4000);
      } else {
        setErrorMsg(res.error || t('teacherStudents.absenceActionErrorFallback'));
      }
    } finally {
      setBusyKey(null);
    }
  };

  const handleRejectAbsence = async (
    absence: StudentAbsence,
    student: Student,
    activity: Activity
  ) => {
    const key = `rejectAbsence:${absence.id}`;
    setBusyKey(key);
    setErrorMsg(null);
    setFeedbackMsg(null);
    try {
      const res = await respondToStudentAbsenceRequest(absence.id, false);
      if (res.success) {
        setFeedbackMsg(
          t('teacherStudents.absenceRejected', { name: student.name, activity: activity.name })
        );
        setTimeout(() => setFeedbackMsg(null), 4000);
      } else {
        setErrorMsg(res.error || t('teacherStudents.absenceActionErrorFallback'));
      }
    } finally {
      setBusyKey(null);
    }
  };

  const handleConfirmRemoval = async () => {
    if (!pendingRemoval) return;
    setIsRemoving(true);
    setErrorMsg(null);
    try {
      const res = await unenrollStudentFromActivity(
        pendingRemoval.studentId,
        pendingRemoval.activityId
      );
      if (res.success) {
        setFeedbackMsg(
          t('teacherStudents.removeSuccess', {
            name: pendingRemoval.studentName,
            activity: pendingRemoval.activityName
          })
        );
        setTimeout(() => setFeedbackMsg(null), 3500);
      } else {
        setErrorMsg(res.error || t('teacherStudents.removeErrorFallback'));
      }
      setPendingRemoval(null);
    } finally {
      setIsRemoving(false);
    }
  };

  const getPaymentBadge = (status: PaymentStatus | 'none') => {
    switch (status) {
      case 'paid':
        return {
          label: t('teacherStudents.paymentBadges.paid'),
          className:
            'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
        };
      case 'partial':
        return {
          label: t('teacherStudents.paymentBadges.partial'),
          className:
            'bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/30'
        };
      case 'overdue':
        return {
          label: t('teacherStudents.paymentBadges.overdue'),
          className: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30'
        };
      case 'exempt':
        return {
          label: t('teacherStudents.paymentBadges.exempt'),
          className: 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30'
        };
      case 'cancelled':
        return {
          label: t('teacherStudents.paymentBadges.cancelled'),
          className: 'bg-zinc-200/70 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border-zinc-300 dark:border-zinc-700 line-through'
        };
      case 'pending':
        return {
          label: t('teacherStudents.paymentBadges.pending'),
          className:
            'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30'
        };
      default:
        return {
          label: t('teacherStudents.paymentBadges.none'),
          className:
            'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700'
        };
    }
  };

  return (
    <div className="space-y-5">
      {/* Cabecera */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs">
        <div>
          <h1 className="text-lg sm:text-xl font-black tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <Users className="h-5 w-5 text-indigo-600 dark:text-indigo-400 shrink-0" />
            <span>{t('teacherStudents.title')}</span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {t('teacherStudents.subtitle', { period: selectedPeriod })}
          </p>
        </div>

        {onOpenEnrollStudent && (
          <button
            type="button"
            onClick={() =>
              onOpenEnrollStudent(activityFilter !== 'all' ? activityFilter : myActivities[0]?.id)
            }
            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-indigo-700 transition shadow-xs whitespace-nowrap"
          >
            <UserPlus className="h-4 w-4" />
            <span>{t('teacherStudents.enrollButton')}</span>
          </button>
        )}
      </div>

      {/* Resumen numérico rápido */}
      <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 sm:p-4 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
            {t('teacherStudents.statsStudents')}
          </span>
          <span className="text-lg sm:text-xl font-black tabular-nums text-slate-900 dark:text-white">
            {studentRows.length}
          </span>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 sm:p-4 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
            {t('teacherStudents.statsEnrollments')}
          </span>
          <span className="text-lg sm:text-xl font-black tabular-nums text-indigo-600 dark:text-indigo-400">
            {totalEnrollmentsInList}
          </span>
        </div>

        <button
          type="button"
          onClick={() => setIsPendingRequestsOpen(prev => !prev)}
          className={`text-left rounded-2xl border p-3 sm:p-4 shadow-xs transition ${
            isPendingRequestsOpen
              ? 'border-indigo-500 ring-2 ring-indigo-500/25 bg-indigo-50/70 dark:bg-indigo-950/30'
              : myPendingRequests.length > 0
              ? 'border-indigo-400/70 bg-indigo-50/50 dark:bg-indigo-950/20 hover:border-indigo-500'
              : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-indigo-400/60'
          }`}
        >
          <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-300 block">
            {t('teacherStudents.statsRequests')}
          </span>
          <span className="text-lg sm:text-xl font-black tabular-nums text-indigo-700 dark:text-indigo-300">
            {myPendingRequests.length}
          </span>
        </button>
      </div>

      {/* Feedback */}
      {feedbackMsg && (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-50/80 dark:bg-emerald-950/30 p-3 text-xs font-semibold text-emerald-800 dark:text-emerald-200 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
          <span>{feedbackMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-50/80 dark:bg-rose-950/30 p-3 text-xs font-semibold text-rose-800 dark:text-rose-200 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Acordeón colapsable de Solicitudes de Inscripción (alineado con Admin) */}
      <div className="rounded-2xl border border-indigo-500/35 bg-indigo-50/60 dark:bg-indigo-950/20 overflow-hidden transition shadow-xs">
        <button
          type="button"
          aria-expanded={isPendingRequestsOpen}
          onClick={() => setIsPendingRequestsOpen(prev => !prev)}
          className="w-full px-4 py-3.5 flex items-center justify-between gap-3 text-left hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <Sparkles className="h-5 w-5 text-indigo-600 dark:text-indigo-400 shrink-0" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-bold text-indigo-950 dark:text-indigo-100">
                  {t('teacherStudents.accordionRequestsTitle')}
                </span>
                <span
                  className={`inline-flex items-center justify-center rounded-full px-2 py-0.5 text-[10px] font-extrabold ${
                    myPendingRequests.length > 0
                      ? 'bg-indigo-600 text-white'
                      : 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300'
                  }`}
                >
                  {myPendingRequests.length}
                </span>
              </div>
              <p className="text-[11px] mt-0.5 truncate sm:whitespace-normal text-indigo-800/80 dark:text-indigo-300/80">
                {t('teacherStudents.pendingSectionSubtitle')}
              </p>
            </div>
          </div>
          <ChevronDown
            className={`h-4 w-4 shrink-0 transition-transform duration-200 text-indigo-700 dark:text-indigo-300 ${
              isPendingRequestsOpen ? 'rotate-180' : ''
            }`}
          />
        </button>

        {isPendingRequestsOpen && (
          <div className="px-4 pb-4 pt-3 border-t border-indigo-500/20">
            {myPendingRequests.length === 0 ? (
              <div className="rounded-xl border border-indigo-500/20 bg-white/80 dark:bg-slate-900/60 p-4 text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
                <Check className="h-4 w-4 text-emerald-600 shrink-0" />
                <span>{t('teacherStudents.emptyPendingRequests')}</span>
              </div>
            ) : (
              <div className="@container rounded-xl border border-indigo-500/25 bg-white dark:bg-slate-900 overflow-hidden shadow-xs">
                <div className="hidden @[700px]:grid @[700px]:grid-cols-[minmax(0,1.3fr)_minmax(0,1.1fr)_104px_220px] items-center gap-3 px-3.5 py-2 bg-indigo-100/50 dark:bg-indigo-950/40 border-b border-indigo-500/20 text-[10px] font-bold uppercase tracking-wider text-indigo-800/80 dark:text-indigo-300/80">
                  <span>{t('common.columns.student')}</span>
                  <span>{t('common.columns.workshop')}</span>
                  <span>{t('common.columns.requestedAt')}</span>
                  <span className="text-right">{t('common.columns.actions')}</span>
                </div>
                <div className="divide-y divide-indigo-500/15">
                  {myPendingRequests.map(({ student, activity, enrolledSince }) => {
                    const cKey = `confirm:${student.id}:${activity.id}`;
                    const rKey = `reject:${student.id}:${activity.id}`;
                    const isBusy = busyKey === cKey || busyKey === rKey;

                    return (
                      <div
                        key={`${student.id}-${activity.id}`}
                        className="px-3 py-2.5 @[700px]:px-3.5 hover:bg-indigo-50/30 dark:hover:bg-indigo-950/20 transition"
                      >
                        {/* Vista móvil */}
                        <div className="flex @[700px]:hidden items-center justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="h-2 w-2 rounded-full bg-indigo-500 shrink-0" />
                              <StudentNameButton
                                name={student.name}
                                phone={student.phone}
                                email={student.email}
                                subtitle={activity.name}
                                className="truncate text-xs font-bold text-slate-900 dark:text-white"
                              />
                            </div>
                            <span className="truncate block text-[11px] font-semibold text-indigo-700 dark:text-indigo-300 mt-0.5">
                              {activity.name} · {enrolledSince}
                            </span>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => handleConfirmEnrollment(student, activity)}
                              title={t('teacherStudents.confirmButton')}
                              aria-label={t('teacherStudents.confirmButton')}
                              className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition disabled:opacity-50"
                            >
                              {busyKey === cKey ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Check className="h-3.5 w-3.5" />
                              )}
                            </button>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => handleRejectEnrollment(student, activity)}
                              title={t('teacherStudents.rejectTooltip')}
                              aria-label={t('teacherStudents.rejectAria', { name: student.name })}
                              className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition disabled:opacity-50"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Vista escritorio en columnas */}
                        <div className="hidden @[700px]:grid @[700px]:grid-cols-[minmax(0,1.3fr)_minmax(0,1.1fr)_104px_220px] items-center gap-3 text-xs">
                          <div className="min-w-0">
                            <StudentNameButton
                              name={student.name}
                              phone={student.phone}
                              email={student.email}
                              subtitle={activity.name}
                              className="font-bold text-sm text-slate-900 dark:text-white text-left break-words"
                            />
                          </div>
                          <div className="min-w-0">
                            <span className="inline-flex rounded-lg bg-indigo-500/10 px-2 py-0.5 text-[11px] font-bold text-indigo-700 dark:text-indigo-300 break-words">
                              {activity.name}
                            </span>
                          </div>
                          <span className="font-mono text-[11px] font-semibold text-slate-500 dark:text-slate-400 tabular-nums whitespace-nowrap">
                            {enrolledSince}
                          </span>
                          <div className="flex items-center justify-end gap-2 shrink-0">
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => handleRejectEnrollment(student, activity)}
                              className="inline-flex items-center gap-1 rounded-xl border border-rose-300 dark:border-rose-800 px-3 py-1.5 text-xs font-semibold text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition disabled:opacity-50 whitespace-nowrap"
                            >
                              <X className="h-3.5 w-3.5" />
                              <span>{t('teacherStudents.rejectButton')}</span>
                            </button>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => handleConfirmEnrollment(student, activity)}
                              className="inline-flex items-center gap-1 rounded-xl bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 transition shadow-xs disabled:opacity-50 whitespace-nowrap"
                            >
                              <Check className="h-3.5 w-3.5" />
                              <span>
                                {busyKey === cKey
                                  ? t('teacherStudents.confirmingButton')
                                  : t('teacherStudents.confirmSpotButton')}
                              </span>
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Acordeón colapsable de Ausencias Comunicadas / Pendientes */}
      {myPendingAbsences.length > 0 && (
        <div className="rounded-2xl border border-sky-500/35 bg-sky-50/60 dark:bg-sky-950/20 overflow-hidden transition shadow-xs">
          <button
            type="button"
            aria-expanded={isPendingAbsencesOpen}
            onClick={() => setIsPendingAbsencesOpen(prev => !prev)}
            className="w-full px-4 py-3.5 flex items-center justify-between gap-3 text-left hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <CalendarX2 className="h-5 w-5 text-sky-600 dark:text-sky-400 shrink-0" />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-bold text-sky-950 dark:text-sky-100">
                    {t('teacherStudents.pendingAbsencesTitle', { count: myPendingAbsences.length })}
                  </span>
                  <span className="inline-flex items-center justify-center rounded-full bg-sky-600 px-2 py-0.5 text-[10px] font-extrabold text-white">
                    {myPendingAbsences.length}
                  </span>
                </div>
                <p className="text-[11px] mt-0.5 truncate sm:whitespace-normal text-sky-800/80 dark:text-sky-300/80">
                  {t('teacherStudents.pendingAbsencesSubtitle')}
                </p>
              </div>
            </div>
            <ChevronDown
              className={`h-4 w-4 shrink-0 transition-transform duration-200 text-sky-700 dark:text-sky-300 ${
                isPendingAbsencesOpen ? 'rotate-180' : ''
              }`}
            />
          </button>

          {isPendingAbsencesOpen && (
            <div className="px-4 pb-4 pt-3 border-t border-sky-500/20">
              <div className="@container rounded-xl border border-sky-500/25 bg-white dark:bg-slate-900 overflow-hidden shadow-xs">
                <div className="hidden @[740px]:grid @[740px]:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_92px_96px_minmax(0,1.15fr)_165px] items-center gap-3 px-3.5 py-2 bg-sky-100/50 dark:bg-sky-950/40 border-b border-sky-500/20 text-[10px] font-bold uppercase tracking-wider text-sky-800/80 dark:text-sky-300/80">
                  <span>{t('common.columns.student')}</span>
                  <span>{t('common.columns.workshop')}</span>
                  <span>{t('common.columns.date')}</span>
                  <span>{t('common.columns.status')}</span>
                  <span>{t('common.columns.reason')}</span>
                  <span className="text-right">{t('common.columns.actions')}</span>
                </div>
                <div className="divide-y divide-sky-500/15">
                  {myPendingAbsences.map(({ absence, student, activity }) => {
                    const cKey = `confirmAbsence:${absence.id}`;
                    const rKey = `rejectAbsence:${absence.id}`;
                    const isBusy = busyKey === cKey || busyKey === rKey;

                    return (
                      <div
                        key={absence.id}
                        className="px-3 py-2.5 @[740px]:px-3.5 hover:bg-sky-50/40 dark:hover:bg-sky-950/20 transition"
                      >
                        {/* Vista móvil */}
                        <div className="flex @[740px]:hidden items-center justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="h-2 w-2 rounded-full bg-sky-500 shrink-0" />
                              <StudentNameButton
                                name={student.name}
                                phone={student.phone}
                                email={student.email}
                                subtitle={`${activity.name} · ${formatShortDate(absence.sessionDate)}`}
                                className="truncate text-xs font-bold text-slate-900 dark:text-white"
                              />
                              <span
                                className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                                  absence.status === 'pending'
                                    ? 'bg-amber-500/15 text-amber-800 dark:text-amber-300'
                                    : 'bg-sky-500/15 text-sky-700 dark:text-sky-300'
                                }`}
                              >
                                {absence.status === 'pending'
                                  ? t('studentPortal.absenceStatus.pending')
                                  : t('studentPortal.absenceStatus.reported')}
                              </span>
                            </div>
                            <span className="truncate block text-[11px] font-semibold text-sky-700 dark:text-sky-300 mt-0.5">
                              {activity.name} · {formatShortDate(absence.sessionDate)}
                            </span>
                            {absence.reason && (
                              <span className="block text-[11px] italic text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                                "{absence.reason}"
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => handleConfirmAbsence(absence, student, activity)}
                              title={t('teacherPortal.pendingBanner.confirmAbsence')}
                              aria-label={t('teacherPortal.pendingBanner.confirmAbsence')}
                              className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition disabled:opacity-50"
                            >
                              {busyKey === cKey ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Check className="h-3.5 w-3.5" />
                              )}
                            </button>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => handleRejectAbsence(absence, student, activity)}
                              title={t('teacherPortal.pendingBanner.rejectAbsenceTooltip')}
                              aria-label={t('teacherPortal.pendingBanner.rejectAbsenceAria', {
                                student: student.name
                              })}
                              className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition disabled:opacity-50"
                            >
                              {busyKey === rKey ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <X className="h-3.5 w-3.5" />
                              )}
                            </button>
                          </div>
                        </div>

                        {/* Vista escritorio en columnas */}
                        <div className="hidden @[740px]:grid @[740px]:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_92px_96px_minmax(0,1.15fr)_165px] items-center gap-3 text-xs">
                          <div className="min-w-0">
                            <StudentNameButton
                              name={student.name}
                              phone={student.phone}
                              email={student.email}
                              subtitle={`${activity.name} · ${formatShortDate(absence.sessionDate)}`}
                              className="font-bold text-sm text-slate-900 dark:text-white text-left break-words"
                            />
                          </div>
                          <div className="min-w-0">
                            <span className="inline-flex rounded-lg bg-sky-500/10 px-2 py-0.5 text-[11px] font-bold text-sky-700 dark:text-sky-300 break-words">
                              {activity.name}
                            </span>
                          </div>
                          <span className="font-mono text-[11px] font-semibold text-sky-700 dark:text-sky-300 tabular-nums whitespace-nowrap">
                            {formatShortDate(absence.sessionDate)}
                          </span>
                          <div>
                            <span
                              className={`inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-bold whitespace-nowrap ${
                                absence.status === 'pending'
                                  ? 'bg-amber-500/15 text-amber-800 dark:text-amber-300'
                                  : 'bg-sky-500/15 text-sky-700 dark:text-sky-300'
                              }`}
                            >
                              {absence.status === 'pending'
                                ? t('studentPortal.absenceStatus.pending')
                                : t('studentPortal.absenceStatus.reported')}
                            </span>
                          </div>
                          <div className="min-w-0">
                            {absence.reason ? (
                              <span className="text-[11px] italic text-slate-500 dark:text-slate-400 break-words block">
                                "{absence.reason}"
                              </span>
                            ) : (
                              <span className="text-[11px] text-slate-300 dark:text-slate-700">—</span>
                            )}
                          </div>
                          <div className="flex items-center justify-end gap-2 shrink-0">
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => handleConfirmAbsence(absence, student, activity)}
                              className="inline-flex items-center gap-1 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 transition shadow-xs disabled:opacity-50 whitespace-nowrap"
                            >
                              {busyKey === cKey ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Check className="h-3.5 w-3.5" />
                              )}
                              <span>{t('teacherPortal.pendingBanner.confirmAbsence')}</span>
                            </button>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => handleRejectAbsence(absence, student, activity)}
                              title={t('teacherPortal.pendingBanner.rejectAbsenceTooltip')}
                              aria-label={t('teacherPortal.pendingBanner.rejectAbsenceAria', {
                                student: student.name
                              })}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition disabled:opacity-50"
                            >
                              {busyKey === rKey ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <X className="h-3.5 w-3.5" />
                              )}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Filtros y Buscador (Restringido únicamente a los talleres del profesor) */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5 sm:p-4 shadow-xs space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5">
              <Filter className="h-3.5 w-3.5 text-slate-400 shrink-0" />
              <select
                value={activityFilter}
                onChange={e => setActivityFilter(e.target.value)}
                className="rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-indigo-500"
              >
                <option value="all">{t('teacherStudents.allMyWorkshops')}</option>
                {activitiesAvailableInScope.map(act => (
                  <option key={act.id} value={act.id}>
                    {act.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Buscador */}
          <div className="relative w-full lg:w-72">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder={t('teacherStudents.searchPlaceholder')}
              className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 pl-9 pr-8 py-2 text-xs text-slate-900 dark:text-white focus:outline-indigo-500"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* Chips de estado en 2 filas (2 columnas) */}
        <div className="grid grid-cols-2 gap-2">
          {[
            { id: 'all' as const, label: t('teacherStudents.statusChips.all') },
            { id: 'pending_requests' as const, label: t('teacherStudents.statusChips.pending_requests') },
            { id: 'paid' as const, label: t('teacherStudents.statusChips.paid') },
            { id: 'unpaid' as const, label: t('teacherStudents.statusChips.unpaid') }
          ].map(chip => (
            <button
              key={chip.id}
              type="button"
              onClick={() => setStatusFilter(chip.id)}
              className={`w-full rounded-xl px-3 py-1.5 text-xs font-bold transition text-center truncate ${
                statusFilter === chip.id
                  ? 'bg-slate-900 dark:bg-indigo-600 text-white shadow-xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              {chip.label}
            </button>
          ))}
        </div>
      </div>

      {/* Lista de Alumnos */}
      {studentRows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-10 text-center text-xs text-slate-400">
          {t('teacherStudents.emptyList')}
        </div>
      ) : (
        <div className="space-y-3">
          {studentRows.map(({ student, enrollments, pendingRequests }) => {
            const isPendingSocio =
              student.status === 'pending_validation' || student.validationStatus === 'pending';

            const openStudentPaymentManager = (targetActivityId?: string) => {
              if (!canManageScopedPayments) return;
              setPaymentManagerContext({
                studentId: student.id,
                initialActivityId:
                  targetActivityId || (activityFilter !== 'all' ? activityFilter : undefined)
              });
            };

            return (
              <div
                key={student.id}
                className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs space-y-3"
              >
                {/* Cabecera del alumno */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0 flex-1 text-left">
                    <button
                      type="button"
                      onClick={() => openStudentPaymentManager()}
                      title={t('teacherStudents.openPaymentManagerAria', { name: student.name })}
                      aria-label={t('teacherStudents.openPaymentManagerAria', { name: student.name })}
                      className="h-10 w-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center font-extrabold text-indigo-700 dark:text-indigo-300 text-sm shrink-0 hover:bg-indigo-600 hover:text-white transition cursor-pointer"
                    >
                      {student.name.charAt(0).toUpperCase()}
                    </button>
                    <div className="min-w-0 flex-1 space-y-1">
                      <div>
                        <StudentNameButton
                          name={student.name}
                          phone={student.phone}
                          email={student.email}
                          className="font-bold text-sm text-slate-900 dark:text-white truncate"
                        />
                      </div>
                      {(isPendingSocio || student.status === 'trial') && (
                        <div className="flex flex-wrap items-center gap-1.5">
                          {isPendingSocio && (
                            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-300">
                              {t('teacherStudents.badgePendingSocio')}
                            </span>
                          )}
                          {student.status === 'trial' && (
                            <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-[10px] font-bold text-sky-700 dark:text-sky-300">
                              {t('teacherStudents.badgeTrial')}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Acciones rápidas: Cobros */}
                  {canManageScopedPayments && (
                    <div className="flex items-center justify-end gap-2 pt-2 sm:pt-0 border-t border-slate-100 dark:border-slate-800/70 sm:border-t-0 shrink-0">
                      <button
                        type="button"
                        onClick={() => openStudentPaymentManager()}
                        className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-emerald-500/35 bg-emerald-50/80 dark:bg-emerald-950/30 px-2.5 sm:px-3 text-[11px] font-bold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-950/50 transition active:scale-95 whitespace-nowrap"
                        title={t('teacherStudents.openPaymentManagerAria', { name: student.name })}
                      >
                        <CreditCard className="h-3.5 w-3.5 shrink-0" />
                        <span>{t('teacherStudents.managePaymentsButton')}</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Actividades confirmadas del alumno con mes / fecha de clase */}
                {enrollments.length > 0 && (
                  <div className="@container rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/30 overflow-hidden">
                    <div className="hidden @[720px]:grid @[720px]:grid-cols-[minmax(0,1.3fr)_100px_86px_minmax(0,1.2fr)_160px_36px] items-center gap-2.5 px-3 py-1.5 bg-slate-100/80 dark:bg-slate-800/70 border-b border-slate-200/80 dark:border-slate-800 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                      <span>{t('common.columns.workshop')}</span>
                      <span>{t('common.columns.teacher')}</span>
                      <span>{t('common.columns.modality')}</span>
                      <span>{t('common.columns.dateOrPeriod')}</span>
                      <span className="text-right">{t('common.columns.feeAndPayment')}</span>
                      <span className="text-right">{t('common.columns.action')}</span>
                    </div>
                    <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
                      {enrollments.map(enr => {
                        const badge = getPaymentBadge(enr.paymentStatus);
                        const monthLabel = formatPeriodMonth(selectedPeriod);
                        const primaryClassDate =
                          enr.uniqueClassDates[0] || enr.latestActivitySessionDate;

                        const enrAbsences = myPendingAbsences.filter(
                          item =>
                            item.student.id === student.id && item.activity.id === enr.activity.id
                        );

                        return (
                          <div key={enr.activity.id} className="px-3 py-2.5 space-y-2 text-xs hover:bg-white/60 dark:hover:bg-slate-800/30 transition">
                            <div className="grid grid-cols-1 @[720px]:grid-cols-[minmax(0,1.3fr)_100px_86px_minmax(0,1.2fr)_160px_36px] items-start @[720px]:items-center gap-2 @[720px]:gap-2.5">
                              {/* Col 1: Taller */}
                              <span className="inline-flex items-center gap-1 font-bold text-slate-800 dark:text-slate-200 break-words min-w-0">
                                <Sparkles
                                  className={`h-3.5 w-3.5 shrink-0 ${
                                    enr.isMine
                                      ? 'text-indigo-600 dark:text-indigo-400'
                                      : 'text-emerald-600'
                                  }`}
                                />
                                <span>{enr.activity.name}</span>
                              </span>

                              {/* Col 2 & 3 en móvil compactas, columnas propias en @[720px]+ */}
                              <div className="flex flex-wrap items-center gap-1.5 @[720px]:contents">
                                <div className="min-w-0">
                                  {enr.isMine ? (
                                    <span className="rounded-md bg-indigo-500/15 px-1.5 py-0.5 text-[10px] font-bold text-indigo-700 dark:text-indigo-300 whitespace-nowrap">
                                      {t('teacherStudents.yourClassBadge')}
                                    </span>
                                  ) : (
                                    <span className="text-[11px] text-slate-600 dark:text-slate-300 break-words">
                                      {enr.teacherName}
                                    </span>
                                  )}
                                </div>

                                <div>
                                  <span className="rounded-md bg-slate-200/70 dark:bg-slate-700/70 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap">
                                    {enr.billingMode === 'per_class'
                                      ? t('teacherStudents.billingPerClassShort')
                                      : t('teacherStudents.billingMonthlyShort')}
                                  </span>
                                </div>
                              </div>

                              {/* Col 4: Mes / Fecha(s) de clase */}
                              <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-400 min-w-0">
                                <span className="inline-flex items-center gap-1 rounded-md bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-700 px-2 py-0.5 font-semibold text-slate-700 dark:text-slate-200">
                                  <Calendar className="h-3 w-3 text-indigo-500 shrink-0" />
                                  {enr.billingMode === 'monthly' ? (
                                    <span>{t('teacherStudents.monthTag', { month: monthLabel })}</span>
                                  ) : primaryClassDate ? (
                                    <span>
                                      {enr.uniqueClassDates.length > 1
                                        ? `${t('teacherStudents.latestClassTag', {
                                            date: formatShortDate(primaryClassDate)
                                          })} · ${t('teacherStudents.classesCount', {
                                            count: enr.uniqueClassDates.length
                                          })}`
                                        : t('teacherStudents.classDateTag', {
                                            date: formatShortDate(primaryClassDate)
                                          })}
                                    </span>
                                  ) : (
                                    <span>
                                      {t('teacherStudents.noClassRecorded', { month: monthLabel })}
                                    </span>
                                  )}
                                </span>

                                {enr.billingMode === 'monthly' && enr.latestPaymentDate && (
                                  <span className="text-[10px] text-slate-500 dark:text-slate-400">
                                    {t('teacherStudents.paidDateTag', {
                                      date: formatShortDate(enr.latestPaymentDate)
                                    })}
                                  </span>
                                )}

                                {enr.billingMode === 'per_class' && enr.receipts.length > 0 && (
                                  <div className="inline-flex flex-wrap items-center gap-1">
                                    {enr.receipts.slice(0, 3).map(rec => (
                                      <span
                                        key={rec.id}
                                        className="rounded-md bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 dark:text-slate-300"
                                      >
                                        {formatCompactDayMonth(rec.paymentDate)} · {rec.amount.toFixed(0)}€
                                      </span>
                                    ))}
                                    {enr.receipts.length > 3 && (
                                      <span className="text-[10px] font-semibold text-slate-400">
                                        +{enr.receipts.length - 3}
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>

                              {/* Col 5 & 6: Cuota/Estado + Acción quitar */}
                              <div className="flex items-center justify-between @[720px]:contents gap-2">
                                <div className="flex items-center @[720px]:justify-end gap-1.5 shrink-0">
                                  <span className="text-[11px] font-bold tabular-nums text-slate-700 dark:text-slate-300 whitespace-nowrap">
                                    {enr.price}€/
                                    {enr.billingMode === 'per_class'
                                      ? t('teacherStudents.unitPerClassShort')
                                      : t('teacherStudents.unitPerMonthShort')}
                                  </span>
                                  {canManageScopedPayments ? (
                                    <button
                                      type="button"
                                      onClick={() => openStudentPaymentManager(enr.activity.id)}
                                      title={t('teacherStudents.manageWorkshopPaymentsTooltip', {
                                        name: student.name,
                                        activity: enr.activity.name
                                      })}
                                      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-bold whitespace-nowrap transition hover:opacity-85 active:scale-95 ${badge.className}`}
                                    >
                                      <span>{badge.label}</span>
                                      <CreditCard className="h-2.5 w-2.5 opacity-75" />
                                    </button>
                                  ) : (
                                    <span
                                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold whitespace-nowrap ${badge.className}`}
                                    >
                                      {badge.label}
                                    </span>
                                  )}
                                </div>

                                <div className="flex items-center justify-end shrink-0">
                                  {enr.isMine ? (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setPendingRemoval({
                                          studentId: student.id,
                                          studentName: student.name,
                                          activityId: enr.activity.id,
                                          activityName: enr.activity.name
                                        })
                                      }
                                      title={t('teacherStudents.removeStudentTooltip', {
                                        name: student.name,
                                        activity: enr.activity.name
                                      })}
                                      aria-label={t('teacherStudents.removeStudentTooltip', {
                                        name: student.name,
                                        activity: enr.activity.name
                                      })}
                                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-rose-200 dark:border-rose-900/60 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition"
                                    >
                                      <UserMinus className="h-3.5 w-3.5" />
                                    </button>
                                  ) : (
                                    <span className="hidden @[720px]:inline text-[11px] text-slate-300 dark:text-slate-700">—</span>
                                  )}
                                </div>
                              </div>
                            </div>

                          {enrAbsences.length > 0 && (
                            <div className="@container rounded-lg border border-sky-500/25 bg-sky-50/60 dark:bg-sky-950/20 overflow-hidden">
                              <div className="hidden @[540px]:grid @[540px]:grid-cols-[124px_92px_minmax(0,1fr)_136px] items-center gap-2 px-2.5 py-1 bg-sky-100/50 dark:bg-sky-950/40 border-b border-sky-500/20 text-[10px] font-bold uppercase tracking-wider text-sky-800/80 dark:text-sky-300/80">
                                <span>{t('common.columns.absence')}</span>
                                <span>{t('common.columns.status')}</span>
                                <span>{t('common.columns.reason')}</span>
                                <span className="text-right">{t('common.columns.actions')}</span>
                              </div>
                              <div className="divide-y divide-sky-500/15">
                                {enrAbsences.map(({ absence }) => {
                                  const cKey = `confirmAbsence:${absence.id}`;
                                  const rKey = `rejectAbsence:${absence.id}`;
                                  const isAbsBusy = busyKey === cKey || busyKey === rKey;
                                  return (
                                    <div
                                      key={absence.id}
                                      className="px-2.5 py-1.5 grid grid-cols-[minmax(0,1fr)_auto] @[540px]:grid-cols-[124px_92px_minmax(0,1fr)_136px] items-center gap-2 text-[11px]"
                                    >
                                      <div className="min-w-0 space-y-0.5 @[540px]:contents">
                                        <div className="flex flex-wrap items-center gap-1.5 @[540px]:contents">
                                          <div className="flex items-center gap-1.5 min-w-0">
                                            <CalendarX2 className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400 shrink-0" />
                                            <span className="font-bold text-sky-800 dark:text-sky-200 whitespace-nowrap">
                                              {t('teacherStudents.absenceDateLabel', {
                                                date: formatShortDate(absence.sessionDate)
                                              })}
                                            </span>
                                          </div>
                                          <div>
                                            <span
                                              className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-bold whitespace-nowrap ${
                                                absence.status === 'pending'
                                                  ? 'bg-amber-500/15 text-amber-800 dark:text-amber-300'
                                                  : 'bg-sky-500/15 text-sky-700 dark:text-sky-300'
                                              }`}
                                            >
                                              {absence.status === 'pending'
                                                ? t('studentPortal.absenceStatus.pending')
                                                : t('studentPortal.absenceStatus.reported')}
                                            </span>
                                          </div>
                                        </div>
                                        <div className="min-w-0">
                                          {absence.reason ? (
                                            <span className="text-[10px] italic text-slate-500 dark:text-slate-400 break-words block">
                                              "{absence.reason}"
                                            </span>
                                          ) : (
                                            <span className="hidden @[540px]:inline text-[10px] text-slate-300 dark:text-slate-700">—</span>
                                          )}
                                        </div>
                                      </div>
                                      <div className="flex items-center justify-end gap-1 shrink-0">
                                        <button
                                          type="button"
                                          disabled={isAbsBusy}
                                          onClick={() =>
                                            handleConfirmAbsence(absence, student, enr.activity)
                                          }
                                          title={t('teacherPortal.pendingBanner.confirmAbsence')}
                                          aria-label={t('teacherPortal.pendingBanner.confirmAbsence')}
                                          className="inline-flex h-7 w-7 @[540px]:h-auto @[540px]:w-auto items-center justify-center @[540px]:gap-1 rounded-lg bg-emerald-600 @[540px]:px-2.5 @[540px]:py-1 text-[11px] font-bold text-white hover:bg-emerald-700 transition disabled:opacity-50 whitespace-nowrap"
                                        >
                                          {busyKey === cKey ? (
                                            <Loader2 className="h-3.5 w-3.5 @[540px]:h-3 @[540px]:w-3 animate-spin" />
                                          ) : (
                                            <Check className="h-3.5 w-3.5 @[540px]:h-3 @[540px]:w-3" />
                                          )}
                                          <span className="hidden @[540px]:inline">{t('teacherPortal.pendingBanner.confirmAbsence')}</span>
                                        </button>
                                        <button
                                          type="button"
                                          disabled={isAbsBusy}
                                          onClick={() =>
                                            handleRejectAbsence(absence, student, enr.activity)
                                          }
                                          title={t('teacherPortal.pendingBanner.rejectAbsenceTooltip')}
                                          aria-label={t(
                                            'teacherPortal.pendingBanner.rejectAbsenceAria',
                                            { student: student.name }
                                          )}
                                          className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition disabled:opacity-50"
                                        >
                                          {busyKey === rKey ? (
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
                          )}
                        </div>
                      );
                    })}
                    </div>
                  </div>
                )}

                {/* Solicitudes pendientes del alumno */}
                {pendingRequests.length > 0 && (
                  <div className="space-y-1.5">
                    {pendingRequests.map(req => {
                      const cKey = `confirm:${student.id}:${req.activity.id}`;
                      const rKey = `reject:${student.id}:${req.activity.id}`;
                      const isBusy = busyKey === cKey || busyKey === rKey;
                      return (
                        <div
                          key={`pending-${req.activity.id}`}
                          className="rounded-xl border border-indigo-500/25 bg-indigo-50/50 dark:bg-indigo-950/20 px-3 py-2 flex items-center justify-between gap-2 text-xs"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Clock className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                              <span className="font-bold text-indigo-950 dark:text-indigo-100">
                                {t('teacherStudents.pendingRequestInline', { activity: req.activity.name })}
                              </span>
                              <span className="text-[11px] text-indigo-800/80 dark:text-indigo-300/80">
                                ({req.teacherName})
                              </span>
                            </div>
                          </div>
                          {req.isMine && (
                            <div className="flex items-center gap-1 shrink-0">
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() => handleConfirmEnrollment(student, req.activity)}
                                  title={t('teacherStudents.confirmButton')}
                                  aria-label={t('teacherStudents.confirmButton')}
                                  className="inline-flex h-7 w-7 sm:h-auto sm:w-auto items-center justify-center sm:gap-1 rounded-lg bg-emerald-600 sm:px-2.5 sm:py-1 text-[11px] font-bold text-white hover:bg-emerald-700 transition disabled:opacity-50"
                                >
                                  {busyKey === cKey ? (
                                    <Loader2 className="h-3.5 w-3.5 sm:h-3 sm:w-3 animate-spin" />
                                  ) : (
                                    <Check className="h-3.5 w-3.5 sm:h-3 sm:w-3" />
                                  )}
                                  <span className="hidden sm:inline">{busyKey === cKey ? '...' : t('teacherStudents.confirmButton')}</span>
                                </button>
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() => handleRejectEnrollment(student, req.activity)}
                                  title={t('teacherStudents.rejectTooltip')}
                                  aria-label={t('teacherStudents.rejectAria', { name: student.name })}
                                  className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 hover:bg-rose-50 transition disabled:opacity-50"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

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
                  {t('teacherStudents.removalModal.title')}
                </h4>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  {t('teacherStudents.removalModal.bodyBefore')} <strong>{pendingRemoval.studentName}</strong> {t('teacherStudents.removalModal.bodyMiddle')}{' '}
                  <strong>{pendingRemoval.activityName}</strong>{t('teacherStudents.removalModal.bodyAfter')}
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
                {t('teacherStudents.removalModal.cancel')}
              </button>
              <button
                type="button"
                disabled={isRemoving}
                onClick={handleConfirmRemoval}
                className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-700 transition disabled:opacity-60"
              >
                {isRemoving ? t('teacherStudents.removalModal.removing') : t('teacherStudents.removalModal.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Gestor simplificado de cuotas y cobros limitado al alumno y talleres del monitor */}
      {paymentManagerContext && currentTeacher && canManageScopedPayments && (
        <ScopedStudentPaymentModal
          student={students.find(s => s.id === paymentManagerContext.studentId)}
          initialActivityId={paymentManagerContext.initialActivityId}
          myActivities={myActivities}
          myActivityIds={myActivityIds}
          currentTeacherId={currentTeacher.id}
          isAdmin={currentRole === UserRole.Admin}
          payments={payments}
          sessions={sessions}
          selectedPeriod={selectedPeriod}
          language={language}
          formatPeriodMonth={formatPeriodMonth}
          formatShortDate={formatShortDate}
          getPaymentBadge={getPaymentBadge}
          onRecordPayment={recordPayment}
          onUpdatePayment={updatePayment}
          onDeletePayment={deletePayment}
          onMarkPaymentPaid={markPaymentPaid}
          onClose={() => setPaymentManagerContext(null)}
        />
      )}
    </div>
  );
};

interface ScopedStudentPaymentModalProps {
  student?: Student;
  initialActivityId?: string;
  myActivities: Activity[];
  myActivityIds: Set<string>;
  currentTeacherId: string;
  isAdmin: boolean;
  payments: PaymentRecord[];
  sessions: ReturnType<typeof useApp>['sessions'];
  selectedPeriod: string;
  language: ReturnType<typeof useApp>['language'];
  formatPeriodMonth: (period: string) => string;
  formatShortDate: (dateStr?: string) => string;
  getPaymentBadge: (status: PaymentStatus | 'none') => { label: string; className: string };
  onRecordPayment: ReturnType<typeof useApp>['recordPayment'];
  onUpdatePayment: ReturnType<typeof useApp>['updatePayment'];
  onDeletePayment: ReturnType<typeof useApp>['deletePayment'];
  onMarkPaymentPaid: ReturnType<typeof useApp>['markPaymentPaid'];
  onClose: () => void;
}

const ScopedStudentPaymentModal: React.FC<ScopedStudentPaymentModalProps> = ({
  student,
  initialActivityId,
  myActivities,
  myActivityIds,
  currentTeacherId,
  isAdmin,
  payments,
  sessions,
  selectedPeriod,
  language,
  formatPeriodMonth,
  formatShortDate,
  getPaymentBadge,
  onRecordPayment,
  onUpdatePayment,
  onDeletePayment,
  onMarkPaymentPaid,
  onClose
}) => {
  const t = createTranslator(language);
  const todayIso = new Date().toISOString().split('T')[0];

  const scopedStudentPayments = useMemo(() => {
    if (!student) return [];
    return payments
      .filter(p => p.studentId === student.id && myActivityIds.has(p.activityId))
      .sort((a, b) => {
        const periodCmp = (b.periodMonth || '').localeCompare(a.periodMonth || '');
        if (periodCmp !== 0) return periodCmp;
        return (b.paymentDate || '').localeCompare(a.paymentDate || '');
      });
  }, [payments, student, myActivityIds]);

  const studentScopedActivities = useMemo(() => {
    if (!student) return [];
    const enrolledIds = new Set(
      (student.activities || [])
        .map(a => a.activityId)
        .filter(id => myActivityIds.has(id))
    );
    const receiptActIds = new Set(scopedStudentPayments.map(p => p.activityId));
    const combined = myActivities.filter(a => enrolledIds.has(a.id) || receiptActIds.has(a.id));
    return combined.length > 0 ? combined : myActivities.filter(a => a.active !== false);
  }, [student, myActivities, myActivityIds, scopedStudentPayments]);

  const availablePeriods = useMemo(() => {
    const set = new Set<string>([selectedPeriod]);
    scopedStudentPayments.forEach(p => {
      if (p.periodMonth) set.add(p.periodMonth);
    });
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [scopedStudentPayments, selectedPeriod]);

  const [modalActivityFilter, setModalActivityFilter] = useState<string>(
    initialActivityId && myActivityIds.has(initialActivityId) ? initialActivityId : 'all'
  );
  const [modalPeriodFilter, setModalPeriodFilter] = useState<string>(selectedPeriod);
  const [modalStatusFilter, setModalStatusFilter] = useState<string>('all');

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingPayment, setEditingPayment] = useState<PaymentRecord | null>(null);
  const [formActivityId, setFormActivityId] = useState<string>(
    (initialActivityId && myActivityIds.has(initialActivityId)
      ? initialActivityId
      : studentScopedActivities[0]?.id) || ''
  );
  const [formAmount, setFormAmount] = useState<number>(0);
  const [formPeriodMonth, setFormPeriodMonth] = useState<string>(selectedPeriod);
  const [formPaymentDate, setFormPaymentDate] = useState<string>(todayIso);
  const [formStatus, setFormStatus] = useState<PaymentStatus>('paid');
  const [formMethod, setFormMethod] = useState<PaymentMethod>('cash');
  const [formCollectedByTeacher, setFormCollectedByTeacher] = useState<boolean>(true);
  const [formNotes, setFormNotes] = useState<string>('');

  const [isSaving, setIsSaving] = useState(false);
  const [busyPaymentId, setBusyPaymentId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [modalFeedback, setModalFeedback] = useState<string | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);

  const getExpectedFee = (activityId: string, fallbackAmount = 0) => {
    const act = myActivities.find(a => a.id === activityId);
    const enr = student?.activities.find(a => a.activityId === activityId);
    if (enr?.customPrice !== undefined) return enr.customPrice;
    if (!act) return fallbackAmount;
    const mode = enr?.billingMode || act.billingMode;
    return mode === 'per_class' ? act.defaultPricePerClass : act.defaultPriceMonthly;
  };

  const getActivityBillingMode = (activityId: string) => {
    const act = myActivities.find(a => a.id === activityId);
    const enr = student?.activities.find(a => a.activityId === activityId);
    return enr?.billingMode || act?.billingMode || 'monthly';
  };

  const isPaymentLockedByClosedSession = (payment: PaymentRecord) => {
    if (isAdmin) return false;
    const mode = getActivityBillingMode(payment.activityId);
    if (mode !== 'per_class' || !payment.paymentDate) return false;
    return isClassSessionClosed(sessions, payment.activityId, payment.paymentDate);
  };

  const filteredPayments = useMemo(() => {
    return scopedStudentPayments.filter(p => {
      if (modalActivityFilter !== 'all' && p.activityId !== modalActivityFilter) return false;
      if (modalPeriodFilter !== 'all' && p.periodMonth !== modalPeriodFilter) return false;
      if (modalStatusFilter === 'paid' && p.status !== 'paid') return false;
      if (modalStatusFilter === 'partial' && p.status !== 'partial') return false;
      if (
        modalStatusFilter === 'pending' &&
        p.status !== 'pending' &&
        p.status !== 'overdue'
      ) {
        return false;
      }
      if (
        modalStatusFilter === 'exempt_cancelled' &&
        p.status !== 'exempt' &&
        p.status !== 'cancelled'
      ) {
        return false;
      }
      return true;
    });
  }, [scopedStudentPayments, modalActivityFilter, modalPeriodFilter, modalStatusFilter]);

  if (!student) return null;

  const paidFilteredAmount = filteredPayments
    .filter(p => p.status === 'paid' || p.status === 'partial')
    .reduce((acc, p) => acc + p.amount, 0);

  const pendingFilteredAmount = filteredPayments.reduce((acc, p) => {
    if (p.status === 'pending' || p.status === 'overdue') return acc + p.amount;
    if (p.status === 'partial') {
      const rem = Math.max(0, getExpectedFee(p.activityId, p.amount) - p.amount);
      return acc + rem;
    }
    return acc;
  }, 0);

  const showTempFeedback = (msg: string) => {
    setModalError(null);
    setModalFeedback(msg);
    setTimeout(() => setModalFeedback(null), 3500);
  };

  const openCreateForm = () => {
    const defaultActId =
      (modalActivityFilter !== 'all' && myActivityIds.has(modalActivityFilter)
        ? modalActivityFilter
        : studentScopedActivities[0]?.id) || '';
    const defaultPeriod = modalPeriodFilter !== 'all' ? modalPeriodFilter : selectedPeriod;
    const expected = defaultActId ? getExpectedFee(defaultActId, 0) : 0;

    setEditingPayment(null);
    setFormActivityId(defaultActId);
    setFormAmount(expected);
    setFormPeriodMonth(defaultPeriod);
    setFormPaymentDate(
      defaultPeriod === todayIso.slice(0, 7) ? todayIso : `${defaultPeriod}-01`
    );
    setFormStatus('paid');
    setFormMethod('cash');
    setFormCollectedByTeacher(true);
    setFormNotes('');
    setModalError(null);
    setIsFormOpen(true);
  };

  const openEditForm = (payment: PaymentRecord) => {
    setEditingPayment(payment);
    setFormActivityId(payment.activityId);
    setFormAmount(payment.amount);
    setFormPeriodMonth(payment.periodMonth || selectedPeriod);
    setFormPaymentDate(payment.paymentDate?.slice(0, 10) || todayIso);
    setFormStatus(payment.status);
    setFormMethod(payment.paymentMethod || 'cash');
    setFormCollectedByTeacher(payment.collectedByTeacher ?? true);
    setFormNotes(payment.notes || '');
    setModalError(null);
    setIsFormOpen(true);
  };

  const handleActivityChangeInForm = (newActivityId: string) => {
    setFormActivityId(newActivityId);
    if (!editingPayment) {
      setFormAmount(getExpectedFee(newActivityId, formAmount));
    }
  };

  const selectedFormActivity = myActivities.find(a => a.id === formActivityId);
  const selectedFormBillingMode = formActivityId
    ? getActivityBillingMode(formActivityId)
    : 'monthly';
  const expectedFormFee = formActivityId ? getExpectedFee(formActivityId, formAmount) : formAmount;
  const isFormClosedSessionLocked =
    !isAdmin &&
    Boolean(formActivityId) &&
    selectedFormBillingMode === 'per_class' &&
    Boolean(formPaymentDate) &&
    isClassSessionClosed(sessions, formActivityId, formPaymentDate);

  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);

    if (!formActivityId || !myActivityIds.has(formActivityId)) {
      setModalError(t('teacherStudents.paymentManager.noPermissionError'));
      return;
    }
    if (Number.isNaN(Number(formAmount)) || Number(formAmount) < 0) {
      setModalError(t('teacherStudents.paymentManager.invalidAmountError'));
      return;
    }
    if (isFormClosedSessionLocked) {
      setModalError(
        t('teacherStudents.paymentManager.closedSessionLock', {
          date: formatShortDate(formPaymentDate)
        })
      );
      return;
    }

    const effectiveDate =
      selectedFormBillingMode === 'per_class' ||
      formStatus === 'paid' ||
      formStatus === 'partial'
        ? formPaymentDate || todayIso
        : formPaymentDate || undefined;

    setIsSaving(true);
    try {
      if (editingPayment) {
        if (!myActivityIds.has(editingPayment.activityId)) {
          setModalError(t('teacherStudents.paymentManager.noPermissionError'));
          return;
        }
        await onUpdatePayment(editingPayment.id, {
          studentId: student.id,
          studentName: student.name,
          activityId: formActivityId,
          activityName: selectedFormActivity?.name || editingPayment.activityName,
          amount: Number(formAmount),
          periodMonth: formPeriodMonth,
          paymentDate: effectiveDate,
          paymentMethod: formMethod,
          status: formStatus,
          collectedByTeacher: formCollectedByTeacher,
          collectedByTeacherId: formCollectedByTeacher ? currentTeacherId : undefined,
          notes: formNotes.trim()
        });
        setIsFormOpen(false);
        setEditingPayment(null);
        showTempFeedback(t('teacherStudents.paymentManager.updateSuccess'));
      } else {
        const created = await onRecordPayment({
          studentId: student.id,
          studentName: student.name,
          activityId: formActivityId,
          activityName: selectedFormActivity?.name || '',
          amount: Number(formAmount),
          periodMonth: formPeriodMonth,
          paymentDate: effectiveDate,
          paymentMethod: formMethod,
          status: formStatus,
          collectedByTeacher: formCollectedByTeacher,
          collectedByTeacherId: formCollectedByTeacher ? currentTeacherId : undefined,
          notes: formNotes.trim()
        });
        if (created) {
          setIsFormOpen(false);
          showTempFeedback(
            t('teacherStudents.paymentManager.createSuccess', { student: student.name })
          );
        }
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleCompletePayment = async (payment: PaymentRecord) => {
    if (!myActivityIds.has(payment.activityId) || isPaymentLockedByClosedSession(payment)) return;
    setBusyPaymentId(payment.id);
    setModalError(null);
    try {
      const mode = getActivityBillingMode(payment.activityId);
      const preservedDate =
        mode === 'per_class' && payment.paymentDate ? payment.paymentDate : todayIso;

      if (payment.status === 'partial') {
        const expected = getExpectedFee(payment.activityId, payment.amount);
        const targetAmount = expected > payment.amount ? expected : payment.amount;
        await onUpdatePayment(payment.id, {
          status: 'paid',
          amount: targetAmount,
          paymentDate: preservedDate,
          notes:
            expected > payment.amount
              ? t('paymentsView.completeNote', { amount: targetAmount.toFixed(2) })
              : payment.notes
        });
      } else if (mode === 'per_class' && payment.paymentDate) {
        await onUpdatePayment(payment.id, {
          status: 'paid',
          paymentDate: payment.paymentDate
        });
      } else {
        await onMarkPaymentPaid(payment.id);
      }
      showTempFeedback(t('teacherStudents.paymentManager.completeSuccess'));
    } finally {
      setBusyPaymentId(null);
    }
  };

  const handleConfirmDelete = async (payment: PaymentRecord) => {
    if (!myActivityIds.has(payment.activityId) || isPaymentLockedByClosedSession(payment)) return;
    setBusyPaymentId(payment.id);
    try {
      await onDeletePayment(payment.id);
      setDeleteConfirmId(null);
      if (editingPayment?.id === payment.id) {
        setIsFormOpen(false);
        setEditingPayment(null);
      }
      showTempFeedback(t('teacherStudents.paymentManager.deleteSuccess'));
    } finally {
      setBusyPaymentId(null);
    }
  };

  const buildWhatsAppUrlAndText = (payment: PaymentRecord) => {
    const phone = student.phone?.replace(/[^0-9]/g, '');
    const mode = getActivityBillingMode(payment.activityId);
    const periodLabel =
      mode === 'per_class' && payment.paymentDate
        ? `${formatPeriodMonth(payment.periodMonth)} · ${formatShortDate(payment.paymentDate)}`
        : formatPeriodMonth(payment.periodMonth);

    const rawMessage = t('teacherStudents.paymentManager.whatsappMessage', {
      studentName: student.name,
      activityName: payment.activityName,
      period: periodLabel,
      amount: payment.amount.toFixed(2)
    });

    return {
      url: phone ? `https://wa.me/${phone}?text=${encodeURIComponent(rawMessage)}` : null,
      rawMessage
    };
  };

  const handleCopyWhatsAppReminder = async (rawMessage: string) => {
    try {
      await navigator.clipboard.writeText(rawMessage);
    } catch {
      // Ignorar si clipboard no está disponible
    }
    showTempFeedback(t('teacherStudents.paymentManager.whatsappCopied'));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/70 p-0 sm:p-4 backdrop-blur-xs">
      <div className="relative w-full sm:max-w-2xl rounded-t-3xl sm:rounded-2xl bg-white dark:bg-slate-900 shadow-2xl border border-slate-200 dark:border-slate-800 max-h-[92dvh] sm:max-h-[88vh] flex flex-col overflow-hidden">
        {/* Cabecera fija */}
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-10 w-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center font-extrabold text-emerald-700 dark:text-emerald-300 text-sm shrink-0">
              {student.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-black text-slate-900 dark:text-white truncate">
                {student.name} · {t('teacherStudents.paymentManager.title')}
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                {t('teacherStudents.paymentManager.subtitle')}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label={t('teacherStudents.paymentManager.closeAria')}
            className="flex h-11 w-11 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200 transition touch-manipulation active:scale-95 shrink-0"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Cuerpo con scroll */}
        <div className="flex-1 overflow-y-auto overscroll-contain p-4 sm:p-5 space-y-4">
          {/* Mensajes de feedback/error */}
          {modalFeedback && (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-50/80 dark:bg-emerald-950/30 px-3 py-2 text-xs font-semibold text-emerald-800 dark:text-emerald-200 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              <span>{modalFeedback}</span>
            </div>
          )}
          {modalError && (
            <div className="rounded-xl border border-rose-500/30 bg-rose-50/80 dark:bg-rose-950/30 px-3 py-2 text-xs font-semibold text-rose-800 dark:text-rose-200 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
              <span>{modalError}</span>
            </div>
          )}

          {/* Barra de filtros + botón Registrar Cobro (inspirado en Cuotas y Cobros) */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 p-3">
            <div className="grid grid-cols-1 sm:flex sm:flex-wrap items-center gap-2 flex-1">
              <select
                value={modalActivityFilter}
                onChange={e => setModalActivityFilter(e.target.value)}
                className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-800 dark:text-slate-200"
              >
                <option value="all">
                  {t('teacherStudents.paymentManager.allMyWorkshops', {
                    count: studentScopedActivities.length
                  })}
                </option>
                {studentScopedActivities.map(act => (
                  <option key={act.id} value={act.id}>
                    {act.name}
                  </option>
                ))}
              </select>

              <select
                value={modalPeriodFilter}
                onChange={e => setModalPeriodFilter(e.target.value)}
                className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-800 dark:text-slate-200"
              >
                <option value="all">{t('teacherStudents.paymentManager.allPeriods')}</option>
                {availablePeriods.map(per => (
                  <option key={per} value={per}>
                    {formatPeriodMonth(per)} ({per})
                  </option>
                ))}
              </select>

              <select
                value={modalStatusFilter}
                onChange={e => setModalStatusFilter(e.target.value)}
                className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-800 dark:text-slate-200"
              >
                <option value="all">{t('teacherStudents.paymentManager.allStatuses')}</option>
                <option value="paid">{t('teacherStudents.paymentManager.statusPaid')}</option>
                <option value="partial">{t('teacherStudents.paymentManager.statusPartial')}</option>
                <option value="pending">{t('teacherStudents.paymentManager.statusPending')}</option>
                <option value="exempt_cancelled">
                  {t('teacherStudents.paymentManager.statusExemptCancelled')}
                </option>
              </select>
            </div>

            <button
              type="button"
              disabled={studentScopedActivities.length === 0}
              onClick={openCreateForm}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-emerald-700 transition shadow-xs min-h-[40px] whitespace-nowrap disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              <span>{t('teacherStudents.paymentManager.newPaymentButton')}</span>
            </button>
          </div>

          {/* Resumen rápido de cobros del alumno en los talleres del monitor */}
          <div className="grid grid-cols-3 gap-2.5">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2.5 sm:p-3">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                {t('teacherStudents.paymentManager.statsReceipts')}
              </span>
              <span className="text-base sm:text-lg font-black tabular-nums text-slate-900 dark:text-white">
                {filteredPayments.length}
              </span>
            </div>
            <div className="rounded-xl border border-emerald-500/25 bg-emerald-50/40 dark:bg-emerald-950/20 p-2.5 sm:p-3">
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300 block">
                {t('teacherStudents.paymentManager.statsCollected')}
              </span>
              <span className="text-base sm:text-lg font-black tabular-nums text-emerald-700 dark:text-emerald-300">
                {paidFilteredAmount.toFixed(2)} €
              </span>
            </div>
            <div className="rounded-xl border border-amber-500/25 bg-amber-50/40 dark:bg-amber-950/20 p-2.5 sm:p-3">
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300 block">
                {t('teacherStudents.paymentManager.statsPending')}
              </span>
              <span className="text-base sm:text-lg font-black tabular-nums text-amber-700 dark:text-amber-300">
                {pendingFilteredAmount.toFixed(2)} €
              </span>
            </div>
          </div>

          {/* Formulario rápido de alta / edición de recibo */}
          {isFormOpen && (
            <form
              onSubmit={handleSubmitForm}
              className="rounded-2xl border border-emerald-500/35 bg-emerald-50/30 dark:bg-emerald-950/15 p-4 space-y-3"
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-xs sm:text-sm font-black text-slate-900 dark:text-white">
                  {editingPayment
                    ? t('teacherStudents.paymentManager.formEditTitle', {
                        receipt: editingPayment.receiptNumber
                      })
                    : t('teacherStudents.paymentManager.formNewTitle')}
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    setIsFormOpen(false);
                    setEditingPayment(null);
                  }}
                  className="text-xs font-semibold text-slate-500 hover:text-slate-700 dark:hover:text-slate-200"
                >
                  {t('teacherStudents.paymentManager.cancel')}
                </button>
              </div>

              {studentScopedActivities.length === 0 ? (
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  {t('teacherStudents.paymentManager.noWorkshopAvailable')}
                </p>
              ) : (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        {t('teacherStudents.paymentManager.workshopLabel')}
                      </label>
                      <select
                        value={formActivityId}
                        onChange={e => handleActivityChangeInForm(e.target.value)}
                        className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-900 dark:text-white"
                        required
                      >
                        {studentScopedActivities.map(act => (
                          <option key={act.id} value={act.id}>
                            {act.name} (
                            {getActivityBillingMode(act.id) === 'per_class'
                              ? t('teacherStudents.billingPerClassShort')
                              : t('teacherStudents.billingMonthlyShort')}
                            )
                          </option>
                        ))}
                      </select>
                      <span className="mt-1 block text-[10px] text-slate-500 dark:text-slate-400">
                        {t('teacherStudents.paymentManager.expectedFeeHint', {
                          amount: expectedFormFee.toFixed(2)
                        })}
                      </span>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        {t('teacherStudents.paymentManager.amountLabel')}
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={formAmount}
                        onChange={e => setFormAmount(Number(e.target.value))}
                        className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm font-black text-slate-900 dark:text-white text-right"
                        required
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        {t('teacherStudents.paymentManager.periodLabel')}
                      </label>
                      <input
                        type="month"
                        value={formPeriodMonth}
                        onChange={e => setFormPeriodMonth(e.target.value)}
                        className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-2 text-xs font-semibold text-slate-900 dark:text-white"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        {selectedFormBillingMode === 'per_class'
                          ? t('teacherStudents.paymentManager.classDateLabel')
                          : t('teacherStudents.paymentManager.paymentDateLabel')}
                      </label>
                      <input
                        type="date"
                        value={formPaymentDate}
                        onChange={e => setFormPaymentDate(e.target.value)}
                        className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-2 text-xs font-semibold text-slate-900 dark:text-white"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        {t('teacherStudents.paymentManager.statusLabel')}
                      </label>
                      <select
                        value={formStatus}
                        onChange={e => setFormStatus(e.target.value as PaymentStatus)}
                        className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-2 text-xs font-bold text-slate-900 dark:text-white"
                      >
                        <option value="paid">{t('recordPaymentModal.statuses.paid')}</option>
                        <option value="partial">{t('recordPaymentModal.statuses.partial')}</option>
                        <option value="pending">{t('recordPaymentModal.statuses.pending')}</option>
                        <option value="overdue">{t('recordPaymentModal.statuses.overdue')}</option>
                        <option value="exempt">{t('recordPaymentModal.statuses.exempt')}</option>
                        <option value="cancelled">{t('recordPaymentModal.statuses.cancelled')}</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        {t('teacherStudents.paymentManager.methodLabel')}
                      </label>
                      <select
                        value={formMethod}
                        onChange={e => setFormMethod(e.target.value as PaymentMethod)}
                        className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-2 text-xs font-semibold text-slate-900 dark:text-white"
                      >
                        <option value="cash">{t('common.paymentMethods.cash')}</option>
                        <option value="bizum">{t('common.paymentMethods.bizum')}</option>
                        <option value="transfer">{t('common.paymentMethods.transfer')}</option>
                        <option value="card">{t('common.paymentMethods.card')}</option>
                      </select>
                    </div>
                  </div>

                  {formStatus === 'paid' &&
                    expectedFormFee > 0 &&
                    Number(formAmount) > 0 &&
                    Number(formAmount) < expectedFormFee && (
                      <div className="flex items-center justify-between gap-2 rounded-xl border border-amber-500/35 bg-amber-50/80 dark:bg-amber-950/30 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
                        <span>
                          {t('teacherStudents.paymentManager.partialWarning', {
                            amount: Number(formAmount).toFixed(2),
                            expected: expectedFormFee.toFixed(2)
                          })}
                        </span>
                        <button
                          type="button"
                          onClick={() => setFormStatus('partial')}
                          className="shrink-0 rounded-lg bg-amber-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-amber-700 transition whitespace-nowrap"
                        >
                          {t('teacherStudents.paymentManager.markPartialButton')}
                        </button>
                      </div>
                    )}

                  {isFormClosedSessionLocked && (
                    <div className="rounded-xl border border-rose-500/35 bg-rose-50/80 dark:bg-rose-950/30 px-3 py-2 text-xs font-semibold text-rose-700 dark:text-rose-200 flex items-center gap-2">
                      <Lock className="h-4 w-4 shrink-0" />
                      <span>
                        {t('teacherStudents.paymentManager.closedSessionLock', {
                          date: formatShortDate(formPaymentDate)
                        })}
                      </span>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
                    <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formCollectedByTeacher}
                        onChange={e => setFormCollectedByTeacher(e.target.checked)}
                        className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                      />
                      <span>{t('teacherStudents.paymentManager.collectedInHandLabel')}</span>
                    </label>

                    <input
                      type="text"
                      value={formNotes}
                      onChange={e => setFormNotes(e.target.value)}
                      placeholder={t('teacherStudents.paymentManager.notesPlaceholder')}
                      aria-label={t('teacherStudents.paymentManager.notesLabel')}
                      className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs text-slate-900 dark:text-white"
                    />
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setIsFormOpen(false);
                        setEditingPayment(null);
                      }}
                      className="rounded-xl border border-slate-300 dark:border-slate-700 px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition min-h-[40px]"
                    >
                      {t('teacherStudents.paymentManager.cancel')}
                    </button>
                    <button
                      type="submit"
                      disabled={isSaving || isFormClosedSessionLocked}
                      className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 transition min-h-[40px] disabled:opacity-50"
                    >
                      {isSaving
                        ? t('teacherStudents.paymentManager.saving')
                        : editingPayment
                          ? t('teacherStudents.paymentManager.saveUpdate')
                          : t('teacherStudents.paymentManager.saveCreate')}
                    </button>
                  </div>
                </>
              )}
            </form>
          )}

          {/* Listado de recibos del alumno en los talleres del monitor */}
          {filteredPayments.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-800/20 p-8 text-center space-y-1">
              <p className="text-xs font-bold text-slate-600 dark:text-slate-300">
                {t('teacherStudents.paymentManager.emptyTitle')}
              </p>
              <p className="text-[11px] text-slate-400">
                {t('teacherStudents.paymentManager.emptyHint')}
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {filteredPayments.map(p => {
                const badge = getPaymentBadge(p.status);
                const mode = getActivityBillingMode(p.activityId);
                const expectedFee = getExpectedFee(p.activityId, p.amount);
                const isClosedLocked = isPaymentLockedByClosedSession(p);
                const isRowBusy = busyPaymentId === p.id;
                const canComplete =
                  p.status === 'pending' || p.status === 'overdue' || p.status === 'partial';

                return (
                  <div
                    key={p.id}
                    className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5 shadow-xs space-y-2.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-mono text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                            {p.receiptNumber}
                          </span>
                          <span className="rounded-md bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 dark:text-slate-300">
                            {mode === 'per_class'
                              ? t('teacherStudents.billingPerClassShort')
                              : t('teacherStudents.billingMonthlyShort')}
                          </span>
                          {p.collectedByTeacher && (
                            <span className="rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-300">
                              {t('teacherStudents.paymentManager.inHandBadge')}
                            </span>
                          )}
                          {isClosedLocked && (
                            <span className="inline-flex items-center gap-1 rounded-md bg-rose-500/15 px-1.5 py-0.5 text-[10px] font-bold text-rose-700 dark:text-rose-300">
                              <Lock className="h-2.5 w-2.5" />
                              {t('teacherStudents.paymentManager.closedSessionBadge')}
                            </span>
                          )}
                        </div>

                        <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate">
                          {p.activityName}
                        </h4>

                        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                          <span className="inline-flex items-center gap-1 font-semibold text-slate-700 dark:text-slate-300">
                            <Calendar className="h-3 w-3 text-indigo-500" />
                            {t('teacherStudents.monthTag', {
                              month: formatPeriodMonth(p.periodMonth)
                            })}
                          </span>
                          {p.paymentDate && (
                            <span>
                              ·{' '}
                              {mode === 'per_class'
                                ? t('teacherStudents.classDateTag', {
                                    date: formatShortDate(p.paymentDate)
                                  })
                                : t('teacherStudents.paidDateTag', {
                                    date: formatShortDate(p.paymentDate)
                                  })}
                            </span>
                          )}
                          <span>
                            ·{' '}
                            {p.paymentMethod === 'cash'
                              ? t('common.paymentMethods.cash')
                              : p.paymentMethod === 'bizum'
                                ? t('common.paymentMethods.bizum')
                                : p.paymentMethod === 'transfer'
                                  ? t('common.paymentMethods.transfer')
                                  : t('common.paymentMethods.card')}
                          </span>
                        </div>

                        {p.notes && (
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 italic">
                            {p.notes}
                          </p>
                        )}
                      </div>

                      <div className="text-right shrink-0 space-y-1">
                        <span className="text-base font-black tabular-nums text-slate-900 dark:text-white block">
                          {p.amount.toFixed(2)} €
                        </span>
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold whitespace-nowrap ${badge.className}`}
                        >
                          {badge.label}
                        </span>
                        {p.status === 'partial' && expectedFee > p.amount && (
                          <span className="block text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                            {t('teacherStudents.paymentManager.missingAmount', {
                              amount: (expectedFee - p.amount).toFixed(2),
                              total: expectedFee.toFixed(2)
                            })}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Acciones del recibo */}
                    {deleteConfirmId === p.id ? (
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-rose-200 dark:border-rose-900/50 bg-rose-50/50 dark:bg-rose-950/20 rounded-xl px-3 py-2">
                        <span className="text-xs font-semibold text-rose-700 dark:text-rose-300">
                          {t('teacherStudents.paymentManager.deleteConfirmPrompt')}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            disabled={isRowBusy}
                            onClick={() => setDeleteConfirmId(null)}
                            className="rounded-lg border border-slate-300 dark:border-slate-700 px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800"
                          >
                            {t('teacherStudents.paymentManager.cancel')}
                          </button>
                          <button
                            type="button"
                            disabled={isRowBusy}
                            onClick={() => handleConfirmDelete(p)}
                            className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-rose-700 disabled:opacity-50"
                          >
                            {t('teacherStudents.paymentManager.deleteConfirmYes')}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800/80">
                        {(() => {
                          const wa = buildWhatsAppUrlAndText(p);
                          return wa.url ? (
                            <a
                              href={wa.url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-slate-800 min-h-[38px]"
                            >
                              <MessageCircle className="h-3.5 w-3.5 text-emerald-600" />
                              <span>{t('teacherStudents.paymentManager.whatsappAction')}</span>
                            </a>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleCopyWhatsAppReminder(wa.rawMessage)}
                              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-slate-800 min-h-[38px]"
                            >
                              <MessageCircle className="h-3.5 w-3.5 text-emerald-600" />
                              <span>{t('teacherStudents.paymentManager.whatsappAction')}</span>
                            </button>
                          );
                        })()}

                        <div className="flex items-center gap-1.5">
                          {canComplete && (
                            <button
                              type="button"
                              disabled={isRowBusy || isClosedLocked}
                              onClick={() => handleCompletePayment(p)}
                              className="rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 min-h-[38px] transition disabled:opacity-45"
                            >
                              {p.status === 'partial'
                                ? t('teacherStudents.paymentManager.completeAction')
                                : t('teacherStudents.paymentManager.collectAction')}
                            </button>
                          )}

                          <button
                            type="button"
                            disabled={isRowBusy || isClosedLocked}
                            onClick={() => openEditForm(p)}
                            title={t('teacherStudents.paymentManager.editAction')}
                            aria-label={t('teacherStudents.paymentManager.editAction')}
                            className="inline-flex h-[38px] w-[38px] items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-slate-800 transition disabled:opacity-40"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </button>

                          <button
                            type="button"
                            disabled={isRowBusy || isClosedLocked}
                            onClick={() => setDeleteConfirmId(p.id)}
                            title={t('teacherStudents.paymentManager.deleteAction')}
                            aria-label={t('teacherStudents.paymentManager.deleteAction')}
                            className="inline-flex h-[38px] w-[38px] items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-slate-800 transition disabled:opacity-40"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
