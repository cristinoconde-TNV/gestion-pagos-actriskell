import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useAcademyData } from '../context/AcademyDataContext';
import { useFinance } from '../context/FinanceContext';
import { useModeration } from '../context/ModerationContext';
import { isPendingDebtStatus, isUnpaidPaymentStatus } from '../lib/billing';
import { createTranslator } from '../lib/i18n';
import { getMadridDateIso } from '../lib/date';
import { parseOfficialBizumConfig } from '../lib/bizumConfig';
import { getPaymentMethodLabel } from '../lib/paymentMethods';
import {
  Clock,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  ChevronDown,
  ChevronUp,
  MapPin,
  Copy,
  Check,
  X,
  AlertTriangle,
  Loader2,
  CalendarX2,
  Calendar,
  Camera,
  Lock,
  ClipboardList,
  Filter,
  IdCard,
  MessageSquare,
  Send,
  Trash2
} from 'lucide-react';
import {
  Activity,
  PaymentMethod,
  PaymentPaidToType,
  PaymentRecord,
  StudentAbsence,
  StudentPaymentMessage,
  UserRole
} from '../types';
import { NewsCarouselSection } from './NewsCarouselSection';
import { ActivityDetailModal } from './ActivityDetailModal';
import { formatSocioNumberPadded } from '../lib/memberNumber';
import {
  canStudentCancelAbsence,
  getActivitySessionDates,
  isClassSessionClosed,
  isClassSessionClosedOrPast,
  SessionDateOption
} from '../lib/absences';

interface StudentPortalViewProps {
  onNavigateToProfile?: () => void;
}

export const StudentPortalView: React.FC<StudentPortalViewProps> = ({
  onNavigateToProfile
}) => {
  const {
    profiles,
    currentStudentId,
    setCurrentStudentId,
    currentRole,
    currentUser,
    appConfigs,
    language
  } = useAuth();
  const { students, activities, teachers, sessions, studentAbsences } = useAcademyData();
  const { payments, selectedPeriod } = useFinance();
  const {
    cancelActivityEnrollmentRequest,
    reportStudentAbsence,
    cancelStudentAbsence,
    studentPaymentMessages,
    sendStudentPaymentMessage,
    cancelStudentPaymentMessage
  } = useModeration();
  const t = createTranslator(language);
  const officialBizum = useMemo(() => parseOfficialBizumConfig(appConfigs), [appConfigs]);

  // Estado de los acordeones (replegados por defecto, incluido el historial dentro de Tus Actividades)
  const [isActivitiesOpen, setIsActivitiesOpen] = useState(false);
  const [isCuotasOpen, setIsCuotasOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [historyActivityFilter, setHistoryActivityFilter] = useState<string>('all');
  const [historyTypeFilter, setHistoryTypeFilter] = useState<'all' | 'attendance' | 'absence' | 'pending'>('all');
  const [cancellingActivityId, setCancellingActivityId] = useState<string | null>(null);
  const [absenceActivity, setAbsenceActivity] = useState<Activity | null>(null);
  const [absenceDate, setAbsenceDate] = useState<string>(() => getMadridDateIso());
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

  // Mensajes al profesor sobre cuotas
  const [paymentMessageTarget, setPaymentMessageTarget] = useState<{
    payment: PaymentRecord;
    teacherId?: string;
    teacherName?: string;
  } | null>(null);
  const [msgReportedPaid, setMsgReportedPaid] = useState(true);
  const [msgPaidToType, setMsgPaidToType] = useState<PaymentPaidToType>('teacher');
  const [msgPaidToCustomName, setMsgPaidToCustomName] = useState('');
  const [msgPaymentMethod, setMsgPaymentMethod] = useState<PaymentMethod>('cash');
  const [msgBody, setMsgBody] = useState('');
  const [isSendingPaymentMsg, setIsSendingPaymentMsg] = useState(false);
  const [cancellingPaymentMsgId, setCancellingPaymentMsgId] = useState<string | null>(null);
  const [paymentMessageModalError, setPaymentMessageModalError] = useState<string | null>(null);
  const [cuotasFeedback, setCuotasFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

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
    (currentRole === UserRole.Admin
      ? students.find(s => s.id === currentStudentId)
      : undefined);

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
  const globalPendingCount = myAllPayments.filter(p => isPendingDebtStatus(p.status)).length;
  const globalPartialCount = myAllPayments.filter(p => p.status === 'partial').length;

  const pendingCount = globalPendingCount;
  const partialCount = globalPartialCount;
  const otherPeriodUnsettled = myAllPayments.filter(
    p => p.periodMonth !== selectedPeriod && isUnpaidPaymentStatus(p.status)
  );

  // Historial completo de recibos liquidados
  const myAllPaidPayments = myAllPayments.filter(p => p.status === 'paid');

  // Mensajes de cuotas del alumno actual
  const myPaymentMessages = useMemo(
    () =>
      currentStudent
        ? studentPaymentMessages.filter(m => m.studentId === currentStudent.id)
        : [],
    [studentPaymentMessages, currentStudent?.id]
  );
  const pendingPaymentMessagesCount = myPaymentMessages.filter(m => m.status === 'pending').length;
  const evaluatedPaymentMessagesCount = myPaymentMessages.filter(m => m.status !== 'pending').length;
  const messagesByPaymentId = useMemo(() => {
    const map = new Map<string, StudentPaymentMessage[]>();
    for (const m of myPaymentMessages) {
      const arr = map.get(m.paymentId) || [];
      arr.push(m);
      map.set(m.paymentId, arr);
    }
    return map;
  }, [myPaymentMessages]);

  // Ausencias y solicitudes comunicadas por este alumno (no canceladas)
  const todayStr = getMadridDateIso();
  const myUpcomingAbsences = (studentAbsences || [])
    .filter(
      abs =>
        abs.studentId === currentStudent?.id &&
        abs.status !== 'cancelled'
    )
    .sort((a, b) => b.sessionDate.localeCompare(a.sessionDate));

  const myActiveAbsencesCount = myUpcomingAbsences.filter(abs => {
    if (abs.status !== 'reported' && abs.status !== 'pending') return false;
    const absDate = abs.sessionDate?.slice(0, 10) || '';
    const attendedInSession = sessions.some(
      ses =>
        ses.activityId === abs.activityId &&
        ses.date?.slice(0, 10) === absDate &&
        ses.attendanceRecords?.some(
          r =>
            r.studentId === currentStudent?.id &&
            (r.attendance === 'present' || r.attendance === 'partial')
        )
    );
    return !attendedInSession;
  }).length;

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
    if (historyTypeFilter === 'pending') {
      return historyByActivity.filter(
        item => item.status === 'absence_pending' || item.status === 'absence_reported'
      );
    }
    return historyByActivity.filter(item => item.kind === historyTypeFilter);
  }, [historyByActivity, historyTypeFilter]);

  const historySummaryStats = useMemo(() => {
    const attendancesCount = historyByActivity.filter(item => item.kind === 'attendance').length;
    const absencesCount = historyByActivity.filter(
      item => item.kind === 'absence' && item.status !== 'absence_pending' && item.status !== 'absence_rejected'
    ).length;
    const pendingCount = historyByActivity.filter(
      item => item.status === 'absence_pending' || item.status === 'absence_reported'
    ).length;
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

  const openPaymentMessageModal = (p: PaymentRecord) => {
    const act = activities.find(a => a.id === p.activityId);
    const resolvedTeacherId = act?.teacherId || p.collectedByTeacherId;
    const resolvedTeacher = teachers.find(tch => tch.id === resolvedTeacherId);
    setPaymentMessageTarget({
      payment: p,
      teacherId: resolvedTeacher?.id || resolvedTeacherId,
      teacherName: resolvedTeacher?.name
    });
    setMsgReportedPaid(p.status !== 'paid');
    setMsgPaidToType('teacher');
    setMsgPaidToCustomName('');
    setMsgPaymentMethod(p.paymentMethod || 'cash');
    setMsgBody('');
    setPaymentMessageModalError(null);
  };

  const handleSubmitPaymentMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentStudent || !paymentMessageTarget) return;
    setPaymentMessageModalError(null);

    if (msgReportedPaid && msgPaidToType === 'other' && !msgPaidToCustomName.trim()) {
      setPaymentMessageModalError(t('studentPortal.paymentMessageModal.otherRecipientRequired'));
      return;
    }

    if (!msgReportedPaid && !msgBody.trim()) {
      setPaymentMessageModalError(t('studentPortal.paymentMessageModal.messageRequired'));
      return;
    }

    const paidToName = msgReportedPaid
      ? msgPaidToType === 'teacher'
        ? paymentMessageTarget.teacherName || t('studentPortal.paymentMessageModal.paidToTeacherFallback')
        : msgPaidToType === 'association'
        ? t('studentPortal.paymentMessageModal.paidToAssociation')
        : msgPaidToCustomName.trim()
      : undefined;

    setIsSendingPaymentMsg(true);
    try {
      const res = await sendStudentPaymentMessage({
        paymentId: paymentMessageTarget.payment.id,
        studentId: currentStudent.id,
        studentName: currentStudent.name,
        activityId: paymentMessageTarget.payment.activityId,
        activityName: paymentMessageTarget.payment.activityName,
        teacherId: paymentMessageTarget.teacherId,
        teacherName: paymentMessageTarget.teacherName,
        periodMonth: paymentMessageTarget.payment.periodMonth,
        receiptNumber: paymentMessageTarget.payment.receiptNumber,
        amount: paymentMessageTarget.payment.amount,
        reportedPaid: msgReportedPaid,
        paidToType: msgReportedPaid ? msgPaidToType : undefined,
        paidToName,
        paymentMethod: msgReportedPaid ? msgPaymentMethod : undefined,
        message: msgBody.trim()
      });

      if (res.success) {
        setPaymentMessageTarget(null);
        setMsgBody('');
        setCuotasFeedback({
          type: 'success',
          message: t('studentPortal.paymentMessages.sendSuccess')
        });
        setTimeout(() => setCuotasFeedback(null), 5000);
      } else {
        setPaymentMessageModalError(res.error || t('studentPortal.paymentMessages.sendError'));
      }
    } finally {
      setIsSendingPaymentMsg(false);
    }
  };

  const handleCancelPaymentMsg = async (messageId: string) => {
    setCancellingPaymentMsgId(messageId);
    setCuotasFeedback(null);
    try {
      const res = await cancelStudentPaymentMessage(messageId);
      if (res.success) {
        setCuotasFeedback({
          type: 'success',
          message: t('studentPortal.paymentMessages.cancelSuccess')
        });
        setTimeout(() => setCuotasFeedback(null), 4000);
      } else {
        setCuotasFeedback({
          type: 'error',
          message: res.error || t('studentPortal.paymentMessages.cancelError')
        });
      }
    } finally {
      setCancellingPaymentMsgId(null);
    }
  };

  const renderPaymentMessagesThread = (paymentId: string) => {
    const msgs = messagesByPaymentId.get(paymentId) || [];
    if (msgs.length === 0) return null;

    return (
      <div className="mt-3 pt-2.5 border-t border-slate-200/70 dark:border-slate-700/60 space-y-2">
        {msgs.map(msg => {
          const isApproved = msg.status === 'approved';
          const isRejected = msg.status === 'rejected';
          const methodLabel = msg.paymentMethod
            ? getPaymentMethodLabel(msg.paymentMethod, t)
            : '';

          return (
            <div
              key={msg.id}
              className={`rounded-lg border p-2.5 text-[11px] space-y-1.5 ${
                isApproved
                  ? 'border-emerald-500/30 bg-emerald-50/70 dark:bg-emerald-950/25'
                  : isRejected
                  ? 'border-rose-500/30 bg-rose-50/70 dark:bg-rose-950/25'
                  : 'border-indigo-500/25 bg-indigo-50/60 dark:bg-indigo-950/20'
              }`}
            >
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                    isApproved
                      ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                      : isRejected
                      ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
                      : 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300'
                  }`}
                >
                  {isApproved
                    ? t('studentPortal.paymentMessages.statusApproved')
                    : isRejected
                    ? t('studentPortal.paymentMessages.statusRejected')
                    : t('studentPortal.paymentMessages.statusPending')}
                </span>

                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-slate-400">
                    {new Date(msg.createdAt).toLocaleDateString()}
                  </span>
                  {msg.status === 'pending' && (
                    <button
                      type="button"
                      disabled={cancellingPaymentMsgId === msg.id}
                      onClick={() => handleCancelPaymentMsg(msg.id)}
                      className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-rose-600 dark:text-rose-400 hover:underline disabled:opacity-50"
                      title={t('studentPortal.paymentMessages.cancelTooltip')}
                    >
                      <Trash2 className="h-3 w-3" />
                      <span>
                        {cancellingPaymentMsgId === msg.id
                          ? '...'
                          : t('studentPortal.paymentMessages.cancelButton')}
                      </span>
                    </button>
                  )}
                </div>
              </div>

              {msg.reportedPaid && (
                <div className="text-[11px] font-semibold text-slate-700 dark:text-slate-200 flex flex-wrap items-center gap-1.5">
                  <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-700 dark:text-emerald-300">
                    {t('studentPortal.paymentMessages.reportedPaidTag')}
                  </span>
                  {msg.paidToName && (
                    <span>
                      {t('studentPortal.paymentMessages.paidToPrefix')} <strong>{msg.paidToName}</strong>
                    </span>
                  )}
                  {methodLabel && <span className="text-slate-500 dark:text-slate-400">({methodLabel})</span>}
                </div>
              )}

              {msg.message && (
                <p className="text-slate-700 dark:text-slate-300 leading-snug">
                  "{msg.message}"
                </p>
              )}

              {msg.teacherEvaluation && (
                <div className="rounded-md bg-white/80 dark:bg-slate-900/70 border border-slate-200/80 dark:border-slate-700/70 px-2.5 py-1.5 text-[11px]">
                  <span className="font-bold text-slate-700 dark:text-slate-200 block text-[10px] uppercase tracking-wide">
                    {t('studentPortal.paymentMessages.teacherEvaluationLabel', {
                      teacher: msg.teacherName || t('studentPortal.paymentMessageModal.paidToTeacherFallback')
                    })}
                  </span>
                  <p className="text-slate-800 dark:text-slate-200 mt-0.5">
                    {msg.teacherEvaluation}
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
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
              {/* Fila superior: Título del portal a la izquierda + Número de socio a la derecha */}
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] uppercase font-bold text-emerald-600 dark:text-emerald-400 tracking-wider truncate">
                  {t('studentPortal.portalTitle')}
                </span>

                {formattedMemberNumber && (
                  <span className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/30 bg-white/85 dark:bg-slate-900/75 px-2 py-0.5 text-[10px] sm:text-[11px] font-mono font-bold text-emerald-800 dark:text-emerald-200 shadow-2xs whitespace-nowrap shrink-0">
                    <IdCard className="h-3 w-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span>{t('common.socioNumberBadge', { number: formattedMemberNumber })}</span>
                  </span>
                )}
              </div>

              <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white truncate mt-1">
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
            <div className="min-w-0 flex-1 space-y-1">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white leading-snug">
                <span>{t('studentPortal.yourActivitiesTitle')}</span>
                <span className="hidden sm:inline font-semibold text-slate-500 dark:text-slate-400">
                  {' '}{t('studentPortal.yourActivitiesSchedules')}
                </span>
              </h3>
              <div className="flex items-center gap-1.5 flex-wrap">
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
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
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
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5 sm:gap-4">
                {enrolledActivities.map(act => {
                  const paymentBadge = getActivityPaymentBadge(act.id);
                  const enrollment = currentStudent?.activities.find(e => e.activityId === act.id);
                  const isDropPending = enrollment?.status === 'pending_unenroll';

                  return (
                    <div
                      key={act.id}
                      className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs hover:border-emerald-500/40 transition flex flex-col justify-between"
                    >
                      <div className="min-w-0">
                        {/* Nombre interactivo del taller + categoría arriba a la derecha + badges flotantes debajo */}
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="min-w-0 flex-1">
                            <button
                              type="button"
                              onClick={() => setSelectedActivityForModal(act)}
                              title={t('studentPortal.activityDataAria', { name: act.name })}
                              aria-label={t('studentPortal.activityDataAria', { name: act.name })}
                              className="inline-flex items-start min-w-0 max-w-full text-left text-base font-bold text-slate-900 dark:text-white leading-tight break-words hover:text-indigo-600 dark:hover:text-indigo-400 hover:underline decoration-indigo-400/60 underline-offset-2 transition cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60 rounded-sm"
                            >
                              {act.name}
                            </button>
                          </h4>

                          <div className="relative flex flex-col items-end shrink-0">
                            <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                              {act.category}
                            </span>

                            <div className="absolute top-full right-0 mt-1 flex flex-col items-end gap-1 z-10 pointer-events-none">
                              <span
                                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold shrink-0 whitespace-nowrap ${paymentBadge.className}`}
                              >
                                {paymentBadge.icon === 'paid' && <CheckCircle2 className="h-3 w-3 shrink-0" />}
                                {paymentBadge.icon === 'partial' && <Clock className="h-3 w-3 shrink-0" />}
                                {paymentBadge.icon === 'alert' && <AlertCircle className="h-3 w-3 shrink-0" />}
                                {paymentBadge.icon === 'clock' && <Clock className="h-3 w-3 shrink-0" />}
                                <span>{paymentBadge.label}</span>
                              </span>

                              {isDropPending && (
                                <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/35 bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-800 dark:text-amber-200 whitespace-nowrap">
                                  <Clock className="h-3 w-3 shrink-0" />
                                  <span>{t('studentPortal.dropPendingBadge')}</span>
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Cuerpo simplificado: solo Espacio/Sala y Horarios en formato compacto */}
                        <div className="mt-2.5 space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <MapPin className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500 shrink-0" />
                            <span className="truncate font-medium">
                              {act.room || t('studentPortal.noRoom')}
                            </span>
                          </div>

                          <div className="flex items-start gap-1.5 min-w-0">
                            <Clock className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                            <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                              {act.schedule.length === 0 ? (
                                <span className="text-slate-400 dark:text-slate-500">
                                  {t('studentPortal.noSchedule')}
                                </span>
                              ) : (
                                act.schedule.map((sch, i) => (
                                  <span
                                    key={i}
                                    className="inline-flex items-center rounded-md bg-slate-100 dark:bg-slate-800/80 px-2 py-0.5 text-[11px] font-medium text-slate-700 dark:text-slate-300"
                                  >
                                    {sch}
                                  </span>
                                ))
                              )}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Pie de tarjeta: acción directa del día a día (Avisar ausencia) */}
                      {currentStudent && !isDropPending && (
                        <div className="mt-3.5 pt-3 border-t border-slate-100 dark:border-slate-800/80">
                          <button
                            type="button"
                            onClick={() => openReportAbsenceModal(act)}
                            title={t('studentPortal.reportAbsenceButton')}
                            aria-label={t('studentPortal.reportAbsenceAria', { name: act.name })}
                            className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl border border-sky-200 dark:border-sky-800/80 bg-sky-50/70 dark:bg-sky-950/25 px-3 py-2 text-xs font-bold text-sky-700 dark:text-sky-300 hover:bg-sky-600 hover:text-white dark:hover:bg-sky-600 dark:hover:text-white transition whitespace-nowrap active:scale-[0.99]"
                          >
                            <CalendarX2 className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate">{t('studentPortal.reportAbsenceButton')}</span>
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

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
                              className="min-h-[44px] md:min-h-0 inline-flex items-center justify-center gap-1.5 rounded-xl border border-rose-300 dark:border-rose-800 bg-rose-50/70 dark:bg-rose-950/30 px-3.5 py-2.5 text-xs font-bold text-rose-700 dark:text-rose-300 hover:bg-rose-600 hover:text-white transition shadow-xs whitespace-nowrap shrink-0 active:scale-[0.99] disabled:opacity-50"
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
                  <div className="hidden md:block rounded-xl border border-amber-500/25 bg-white/80 dark:bg-slate-900/60 overflow-hidden">
                    <div className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_104px_116px] items-center gap-3 px-3 py-2 bg-amber-100/50 dark:bg-amber-950/40 border-b border-amber-500/20 text-[10px] font-bold uppercase tracking-wider text-amber-800/80 dark:text-amber-300/80">
                      <span>{t('common.columns.workshop')}</span>
                      <span>{t('common.columns.teacher')}</span>
                      <span>{t('common.columns.requestedAt')}</span>
                      <span className="text-right">{t('common.columns.action')}</span>
                    </div>
                    <div className="divide-y divide-amber-500/20">
                      {pendingRequestedActivities.map(({ enrollment, activity }) => {
                        if (!activity) return null;
                        const teacherItem = teachers.find(tc => tc.id === activity.teacherId);
                        const isBusy = cancellingActivityId === activity.id;
                        return (
                          <div
                            key={activity.id}
                            className="px-3 py-2.5 grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_104px_116px] items-center gap-3 text-xs hover:bg-amber-50/40 dark:hover:bg-amber-950/20 transition"
                          >
                            <span className="font-bold text-slate-900 dark:text-white break-words min-w-0">
                              {activity.name}
                            </span>
                            <span className="text-[11px] text-slate-600 dark:text-slate-300 break-words min-w-0">
                              {teacherItem?.name || '—'}
                            </span>
                            <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400 tabular-nums whitespace-nowrap">
                              {enrollment.enrolledSince}
                            </span>
                            <div className="flex items-center justify-end">
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
                          </div>
                        );
                      })}
                    </div>
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
                      <div className="min-w-0 flex-1 space-y-1">
                        <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white leading-snug">
                          {t('studentPortal.historyPanel.title')}
                        </h4>
                        <div className="flex items-center gap-1.5 flex-wrap">
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
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
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

                        <div className="inline-flex flex-wrap items-center gap-1 rounded-xl bg-slate-100 dark:bg-slate-800 p-1 self-start sm:self-auto">
                          {(
                            [
                              { key: 'all', label: t('studentPortal.historyPanel.typeAll') },
                              { key: 'attendance', label: t('studentPortal.historyPanel.typeAttendances') },
                              { key: 'absence', label: t('studentPortal.historyPanel.typeAbsences') },
                              { key: 'pending', label: t('studentPortal.historyPanel.typePending') }
                            ] as const
                          ).map(tab => (
                            <button
                              key={tab.key}
                              type="button"
                              onClick={() => setHistoryTypeFilter(tab.key)}
                              className={`rounded-lg px-2.5 py-1.5 text-[11px] font-bold transition whitespace-nowrap ${
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

                      {/* Listado cronológico de asistencias y ausencias en columnas */}
                      {filteredHistoryEntries.length === 0 ? (
                        <div className="py-6 text-center text-xs text-slate-400 rounded-xl border border-dashed border-slate-200 dark:border-slate-800">
                          {t('studentPortal.historyPanel.empty')}
                        </div>
                      ) : (
                        <div className="@container rounded-xl border border-slate-200/80 dark:border-slate-800 overflow-hidden">
                          {/* Cabecera de columnas (escritorio/tablet) */}
                          <div className="hidden @[760px]:grid @[760px]:grid-cols-[92px_minmax(0,1fr)_140px_114px_minmax(0,1.4fr)_124px] items-center gap-3 px-3.5 py-2 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200/80 dark:border-slate-800 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                            <span>{t('studentPortal.historyPanel.colDate')}</span>
                            <span>{t('studentPortal.historyPanel.colWorkshop')}</span>
                            <span>{t('studentPortal.historyPanel.colStatus')}</span>
                            <span>{t('studentPortal.historyPanel.colSession')}</span>
                            <span>{t('studentPortal.historyPanel.colDetails')}</span>
                            <span className="text-right">{t('studentPortal.historyPanel.colAction')}</span>
                          </div>

                          <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs max-h-96 overflow-y-auto">
                            {filteredHistoryEntries.map(entry => {
                              const canCancel =
                                entry.kind === 'absence' &&
                                entry.absenceRecord &&
                                canStudentCancelAbsence(entry.absenceRecord, sessions);
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
                                  className="px-3.5 py-3 grid grid-cols-[minmax(0,1fr)_auto] @[760px]:grid-cols-[92px_minmax(0,1fr)_140px_114px_minmax(0,1.4fr)_124px] items-center gap-2.5 @[760px]:gap-3 hover:bg-slate-50/70 dark:hover:bg-slate-800/30 transition"
                                >
                                  <div className="min-w-0 space-y-1.5 @[760px]:contents">
                                    {/* Columna 1 y 2 en móvil en cabecera compacta; columnas separadas en @[760px]+ */}
                                    <div className="flex items-center justify-between gap-2 @[760px]:contents">
                                      <span className="font-mono text-[11px] font-bold text-slate-500 dark:text-slate-400 tabular-nums whitespace-nowrap">
                                        {entry.date}
                                      </span>
                                      <span className="font-bold text-slate-900 dark:text-white break-words min-w-0 flex-1 @[760px]:flex-none">
                                        {entry.activityName}
                                      </span>
                                    </div>

                                    {/* Columna 3 y 4: Estado y Clase cerrada/abierta */}
                                    <div className="flex flex-wrap items-center gap-1.5 @[760px]:contents">
                                      <div className="min-w-0">
                                        <span
                                          className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-bold whitespace-nowrap ${badgeConfig.cls}`}
                                        >
                                          {badgeConfig.icon}
                                          <span>{badgeConfig.label}</span>
                                        </span>
                                      </div>

                                      <div className="min-w-0">
                                        {entry.isClosed ? (
                                          <span className="inline-flex items-center gap-1 rounded-full border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 px-2.5 py-0.5 text-[10px] font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap">
                                            <Lock className="h-2.5 w-2.5 shrink-0" />
                                            <span>{t('studentPortal.absenceClassClosedBadge')}</span>
                                          </span>
                                        ) : (
                                          <span className="hidden @[760px]:inline-block text-[11px] text-slate-400 dark:text-slate-500">
                                            {t('studentPortal.historyPanel.sessionOpenLabel')}
                                          </span>
                                        )}
                                      </div>
                                    </div>

                                    {/* Columna 5: Tema / Motivo completo */}
                                    <div className="min-w-0 text-[11px] text-slate-500 dark:text-slate-400 space-y-0.5 break-words">
                                      {entry.topic || entry.reason ? (
                                        <>
                                          {entry.topic && (
                                            <span className="block break-words">
                                              <strong className="font-semibold text-slate-600 dark:text-slate-300">
                                                {t('studentPortal.historyPanel.topicPrefix')}
                                              </strong>{' '}
                                              {entry.topic}
                                            </span>
                                          )}
                                          {entry.reason && (
                                            <span className="block italic break-words">
                                              <strong className="not-italic font-semibold text-slate-600 dark:text-slate-300">
                                                {t('studentPortal.historyPanel.reasonPrefix')}
                                              </strong>{' '}
                                              "{entry.reason}"
                                            </span>
                                          )}
                                        </>
                                      ) : (
                                        <span className="hidden @[760px]:inline text-slate-300 dark:text-slate-700">
                                          —
                                        </span>
                                      )}
                                    </div>
                                  </div>

                                  {/* Columna 6: Acción */}
                                  <div
                                    className={
                                      canCancel && entry.absenceRecord
                                        ? 'flex items-center justify-end shrink-0'
                                        : 'hidden @[760px]:flex items-center justify-end'
                                    }
                                  >
                                    {canCancel && entry.absenceRecord ? (
                                      <button
                                        type="button"
                                        disabled={Boolean(isBusy)}
                                        onClick={() =>
                                          handleCancelAbsenceNotice(
                                            entry.absenceRecord!.id,
                                            entry.activityName
                                          )
                                        }
                                        className="min-h-[44px] md:min-h-0 inline-flex items-center gap-1 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 md:px-2.5 md:py-1.5 text-[11px] font-bold text-slate-700 dark:text-slate-200 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-300 transition shrink-0 whitespace-nowrap disabled:opacity-50"
                                      >
                                        {isBusy ? (
                                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                        ) : (
                                          <X className="h-3.5 w-3.5" />
                                        )}
                                        <span>{t('studentPortal.cancelAbsenceButton')}</span>
                                      </button>
                                    ) : (
                                      <span className="hidden @[760px]:inline text-[11px] text-slate-300 dark:text-slate-700">
                                        —
                                      </span>
                                    )}
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
            <div className="min-w-0 flex-1 space-y-1">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white leading-snug">
                {t('studentPortal.feesTitle')}
              </h3>
              <div className="flex items-center gap-1.5 flex-wrap">
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
                {pendingPaymentMessagesCount > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 px-2 py-0.5 text-[10px] font-bold whitespace-nowrap shrink-0">
                    <MessageSquare className="h-3 w-3" />
                    {t('studentPortal.paymentMessages.headerPendingBadge', {
                      count: pendingPaymentMessagesCount
                    })}
                  </span>
                )}
                {evaluatedPaymentMessagesCount > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/15 text-sky-700 dark:text-sky-300 px-2 py-0.5 text-[10px] font-bold whitespace-nowrap shrink-0">
                    <CheckCircle2 className="h-3 w-3" />
                    {t('studentPortal.paymentMessages.headerEvaluatedBadge', {
                      count: evaluatedPaymentMessagesCount
                    })}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
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
            {cuotasFeedback && (
              <div
                className={`rounded-xl border px-3.5 py-2.5 text-xs font-semibold flex items-center gap-2 ${
                  cuotasFeedback.type === 'success'
                    ? 'border-emerald-500/30 bg-emerald-50/80 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-200'
                    : 'border-rose-500/30 bg-rose-50/80 dark:bg-rose-950/30 text-rose-800 dark:text-rose-200'
                }`}
              >
                {cuotasFeedback.type === 'success' ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                ) : (
                  <AlertCircle className="h-4 w-4 shrink-0" />
                )}
                <span>{cuotasFeedback.message}</span>
              </div>
            )}
            {/* Bloque 1: Estado de tus cuotas */}
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-xs sm:text-sm font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-200">
                  {t('studentPortal.feesStatusHeading', { period: selectedPeriod })}
                </h4>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
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
                                method: getPaymentMethodLabel(p.paymentMethod, t),
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
                                  method: getPaymentMethodLabel(p.paymentMethod, t),
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
                              {(act?.bizum_enabled && act.bizum_phone) || officialBizum.isConfigured
                                ? t('studentPortal.paymentInstructions')
                                : t('studentPortal.paymentInstructionsNoBizum')}
                            </p>

                            {act?.bizum_enabled && act.bizum_phone ? (
                              <div className="rounded-lg bg-white/90 dark:bg-slate-900 p-2.5 font-mono text-[11px] text-slate-700 dark:text-slate-300 border border-amber-300 dark:border-amber-800 flex items-center justify-between gap-2">
                                <div className="min-w-0">
                                  <span className="block text-[10px] text-amber-600 dark:text-amber-400 font-sans font-bold">
                                    {t('studentPortal.directWorkshopBizum')}
                                  </span>
                                  <strong>{act.bizum_phone}</strong> ({act.bizum_concept || p.receiptNumber})
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleCopyBizum(act.bizum_phone!)}
                                  className="p-1 text-slate-500 hover:text-slate-900 dark:hover:text-white shrink-0"
                                  title={t('studentPortal.copyBizumTooltip')}
                                >
                                  {copiedBizum ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                                </button>
                              </div>
                            ) : officialBizum.isConfigured ? (
                              <div className="rounded-lg bg-white/80 dark:bg-slate-900/60 p-2.5 font-mono text-[11px] text-slate-700 dark:text-slate-300 border border-amber-200 dark:border-amber-800 flex items-center justify-between gap-2">
                                <div className="min-w-0">
                                  {t('studentPortal.associationBizumPrefix')} <strong>{officialBizum.phone}</strong> ({t('studentPortal.conceptPrefix')} {p.receiptNumber})
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleCopyBizum(officialBizum.phone)}
                                  className="p-1 text-slate-500 hover:text-slate-900 dark:hover:text-white shrink-0"
                                  title={t('studentPortal.copyBizumTooltip')}
                                >
                                  {copiedBizum ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                                </button>
                              </div>
                            ) : (
                              <div className="rounded-lg bg-white/80 dark:bg-slate-900/60 p-2.5 text-[11px] text-slate-600 dark:text-slate-300 border border-amber-200 dark:border-amber-800">
                                {t('studentPortal.associationBizumUnavailable')}
                              </div>
                            )}
                          </div>
                        )}

                        {renderPaymentMessagesThread(p.id)}

                        <div className="mt-3 pt-2.5 border-t border-slate-200/60 dark:border-slate-700/50 flex items-center justify-end">
                          {(() => {
                            const targetTeacher = teachers.find(
                              tch => tch.id === (act?.teacherId || p.collectedByTeacherId)
                            );
                            return (
                              <button
                                type="button"
                                onClick={() => openPaymentMessageModal(p)}
                                className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-500/30 bg-indigo-50/80 dark:bg-indigo-950/30 px-3 py-1.5 text-[11px] font-bold text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-950/50 transition active:scale-95"
                              >
                                <MessageSquare className="h-3.5 w-3.5 shrink-0" />
                                <span>
                                  {targetTeacher?.name
                                    ? t('studentPortal.paymentMessages.sendToTeacherNamed', {
                                        teacher: targetTeacher.name
                                      })
                                    : t('studentPortal.paymentMessages.sendToTeacher')}
                                </span>
                              </button>
                            );
                          })()}
                        </div>
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
                  <div className="@container rounded-xl border border-amber-500/30 bg-amber-50/40 dark:bg-amber-950/15 overflow-hidden text-xs">
                    <div className="hidden @[680px]:grid @[680px]:grid-cols-[minmax(0,1.3fr)_82px_108px_82px_96px_108px] items-center gap-3 px-3.5 py-2 bg-amber-100/50 dark:bg-amber-950/40 border-b border-amber-500/20 text-[10px] font-bold uppercase tracking-wider text-amber-800/80 dark:text-amber-300/80">
                      <span>{t('common.columns.workshop')}</span>
                      <span>{t('common.columns.period')}</span>
                      <span>{t('common.columns.receipt')}</span>
                      <span className="text-right">{t('common.columns.amount')}</span>
                      <span>{t('common.columns.status')}</span>
                      <span className="text-right">{t('common.columns.action')}</span>
                    </div>
                    <div className="divide-y divide-amber-500/20">
                      {otherPeriodUnsettled.map(p => (
                        <div key={p.id} className="px-3.5 py-2.5 space-y-2 hover:bg-amber-50/60 dark:hover:bg-amber-950/25 transition">
                          <div className="grid grid-cols-1 @[680px]:grid-cols-[minmax(0,1.3fr)_82px_108px_82px_96px_108px] items-start @[680px]:items-center gap-2 @[680px]:gap-3">
                            <div className="flex items-center justify-between gap-2 @[680px]:contents">
                              <span className="font-bold text-slate-900 dark:text-white break-words min-w-0">
                                {p.activityName}
                              </span>
                              <span className="font-mono text-[11px] font-semibold text-slate-600 dark:text-slate-300 tabular-nums whitespace-nowrap">
                                {p.periodMonth}
                              </span>
                            </div>

                            <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400 break-words min-w-0">
                              {p.receiptNumber}
                            </span>

                            <div className="flex items-center justify-between gap-2 @[680px]:contents">
                              <span className="font-extrabold text-slate-900 dark:text-white tabular-nums whitespace-nowrap @[680px]:text-right">
                                {p.amount.toFixed(2)} €
                              </span>
                              <div>
                                <span
                                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold whitespace-nowrap ${
                                    p.status === 'partial'
                                      ? 'bg-orange-500/15 text-orange-700 dark:text-orange-300'
                                      : p.status === 'overdue'
                                      ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
                                      : 'bg-amber-500/15 text-amber-800 dark:text-amber-300'
                                  }`}
                                >
                                  {p.status === 'partial'
                                    ? t('studentPortal.badges.partial')
                                    : p.status === 'overdue'
                                    ? t('studentPortal.badges.overdue')
                                    : t('studentPortal.badges.pending')}
                                </span>
                              </div>
                              <div className="flex items-center @[680px]:justify-end">
                                <button
                                  type="button"
                                  onClick={() => openPaymentMessageModal(p)}
                                  className="min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0 inline-flex items-center justify-center gap-1 rounded-lg border border-indigo-500/30 bg-white dark:bg-slate-900 px-3 py-2 md:px-2.5 md:py-1.5 text-[11px] font-bold text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition whitespace-nowrap"
                                  title={t('studentPortal.paymentMessages.sendToTeacher')}
                                >
                                  <MessageSquare className="h-3.5 w-3.5 shrink-0" />
                                  <span className="hidden @[680px]:inline">
                                    {t('studentPortal.paymentMessages.sendShort')}
                                  </span>
                                </button>
                              </div>
                            </div>
                          </div>
                          {renderPaymentMessagesThread(p.id)}
                        </div>
                      ))}
                    </div>
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
                <div className="@container rounded-xl border border-slate-200/80 dark:border-slate-800 overflow-hidden bg-white dark:bg-slate-900 text-xs">
                  <div className="hidden @[720px]:grid @[720px]:grid-cols-[108px_minmax(0,1.3fr)_minmax(0,1.2fr)_84px_96px_100px] items-center gap-3 px-3.5 py-2 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200/80 dark:border-slate-800 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                    <span>{t('common.columns.receipt')}</span>
                    <span>{t('common.columns.workshopAndPeriod')}</span>
                    <span>{t('common.columns.dateAndMethod')}</span>
                    <span className="text-right">{t('common.columns.amount')}</span>
                    <span>{t('common.columns.status')}</span>
                    <span className="text-right">{t('common.columns.action')}</span>
                  </div>
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {myAllPaidPayments.map(p => (
                      <div key={p.id} className="px-3.5 py-3 space-y-2 hover:bg-slate-50/70 dark:hover:bg-slate-800/30 transition">
                        <div className="grid grid-cols-1 @[720px]:grid-cols-[108px_minmax(0,1.3fr)_minmax(0,1.2fr)_84px_96px_100px] items-start @[720px]:items-center gap-2 @[720px]:gap-3">
                          <div className="flex items-center justify-between gap-2 @[720px]:contents">
                            <span className="font-mono text-emerald-600 dark:text-emerald-400 font-bold break-words min-w-0">
                              {p.receiptNumber}
                            </span>
                            <span className="font-semibold text-slate-900 dark:text-white break-words min-w-0">
                              {p.activityName} · {p.periodMonth}
                            </span>
                          </div>

                          <span className="text-[11px] text-slate-500 dark:text-slate-400 break-words min-w-0">
                            {t('studentPortal.historicalPaidOn', {
                              date: p.paymentDate || '',
                              method: getPaymentMethodLabel(p.paymentMethod, t),
                              teacherNote: p.collectedByTeacher ? t('studentPortal.collectedByTeacherNote') : ''
                            })}
                          </span>

                          <div className="flex items-center justify-between gap-2 @[720px]:contents">
                            <span className="font-extrabold text-sm text-slate-900 dark:text-white tabular-nums whitespace-nowrap @[720px]:text-right">
                              {p.amount.toFixed(2)} €
                            </span>
                            <div>
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 border border-emerald-500/25 px-2 py-0.5 text-[11px] font-bold text-emerald-700 dark:text-emerald-300 whitespace-nowrap">
                                <CheckCircle2 className="h-3 w-3 shrink-0" />
                                <span>{t('studentPortal.settledBadge')}</span>
                              </span>
                            </div>
                            <div className="flex items-center @[720px]:justify-end">
                              <button
                                type="button"
                                onClick={() => openPaymentMessageModal(p)}
                                className="min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0 inline-flex items-center justify-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 md:px-2 md:py-1 text-[11px] font-semibold text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 transition whitespace-nowrap"
                                title={t('studentPortal.paymentMessages.sendToTeacher')}
                              >
                                <MessageSquare className="h-3.5 w-3.5 shrink-0" />
                                <span className="hidden @[720px]:inline">
                                  {t('studentPortal.paymentMessages.sendShort')}
                                </span>
                              </button>
                            </div>
                          </div>
                        </div>
                        {renderPaymentMessagesThread(p.id)}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* SECCIÓN 3: Notas y comunicados en carrusel horizontal */}
      <NewsCarouselSection compact />

      {/* Modal / Ficha Informativa "Ficha de la Actividad" unificada */}
      <ActivityDetailModal
        activity={
          selectedActivityForModal
            ? activities.find(a => a.id === selectedActivityForModal.id) || selectedActivityForModal
            : null
        }
        studentOverride={currentStudent ?? null}
        onClose={() => setSelectedActivityForModal(null)}
      />

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

      {/* Modal para enviar mensaje al profesor sobre una cuota */}
      {paymentMessageTarget && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => !isSendingPaymentMsg && setPaymentMessageTarget(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-xs"
        >
          <form
            onClick={e => e.stopPropagation()}
            onSubmit={handleSubmitPaymentMessage}
            className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-2xl space-y-4"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 shrink-0">
                  <MessageSquare className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                    {t('studentPortal.paymentMessageModal.title')}
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {paymentMessageTarget.payment.activityName} · {paymentMessageTarget.payment.periodMonth} ·{' '}
                    <strong>{paymentMessageTarget.payment.amount.toFixed(2)} €</strong>
                  </p>
                  <p className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 mt-0.5">
                    {t('studentPortal.paymentMessageModal.recipientLabel', {
                      teacher:
                        paymentMessageTarget.teacherName ||
                        t('studentPortal.paymentMessageModal.paidToTeacherFallback')
                    })}
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={isSendingPaymentMsg}
                onClick={() => setPaymentMessageTarget(null)}
                className="rounded-lg p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-1.5">
              <span className="block text-[11px] font-bold text-slate-700 dark:text-slate-200">
                {t('studentPortal.paymentMessageModal.alreadyPaidQuestion')}
              </span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setMsgReportedPaid(true)}
                  className={`rounded-xl border px-3 py-2 text-xs font-bold transition ${
                    msgReportedPaid
                      ? 'border-emerald-500 bg-emerald-600 text-white shadow-xs'
                      : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  {t('studentPortal.paymentMessageModal.optionAlreadyPaid')}
                </button>
                <button
                  type="button"
                  onClick={() => setMsgReportedPaid(false)}
                  className={`rounded-xl border px-3 py-2 text-xs font-bold transition ${
                    !msgReportedPaid
                      ? 'border-indigo-500 bg-indigo-600 text-white shadow-xs'
                      : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  {t('studentPortal.paymentMessageModal.optionInquiry')}
                </button>
              </div>
            </div>

            {msgReportedPaid && (
              <div className="space-y-3 rounded-xl border border-emerald-500/25 bg-emerald-50/40 dark:bg-emerald-950/20 p-3">
                <div className="space-y-1.5">
                  <span className="block text-[11px] font-bold text-slate-700 dark:text-slate-200">
                    {t('studentPortal.paymentMessageModal.paidToQuestion')}
                  </span>
                  <div className="grid grid-cols-3 gap-1.5">
                    <button
                      type="button"
                      onClick={() => setMsgPaidToType('teacher')}
                      className={`rounded-lg border px-2 py-1.5 text-[11px] font-bold transition ${
                        msgPaidToType === 'teacher'
                          ? 'border-emerald-600 bg-emerald-600 text-white'
                          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {t('studentPortal.paymentMessageModal.paidToTeacher')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setMsgPaidToType('association')}
                      className={`rounded-lg border px-2 py-1.5 text-[11px] font-bold transition ${
                        msgPaidToType === 'association'
                          ? 'border-emerald-600 bg-emerald-600 text-white'
                          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {t('studentPortal.paymentMessageModal.paidToAssociation')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setMsgPaidToType('other')}
                      className={`rounded-lg border px-2 py-1.5 text-[11px] font-bold transition ${
                        msgPaidToType === 'other'
                          ? 'border-emerald-600 bg-emerald-600 text-white'
                          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {t('studentPortal.paymentMessageModal.paidToOther')}
                    </button>
                  </div>
                </div>

                {msgPaidToType === 'teacher' && paymentMessageTarget.teacherName && (
                  <p className="text-[11px] text-emerald-800 dark:text-emerald-300 font-medium">
                    {t('studentPortal.paymentMessageModal.paidToSelectedTeacher', {
                      teacher: paymentMessageTarget.teacherName
                    })}
                  </p>
                )}

                {msgPaidToType === 'other' && (
                  <div className="space-y-1">
                    <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                      {t('studentPortal.paymentMessageModal.otherRecipientLabel')}
                    </label>
                    <input
                      type="text"
                      required
                      value={msgPaidToCustomName}
                      onChange={e => setMsgPaidToCustomName(e.target.value)}
                      placeholder={t('studentPortal.paymentMessageModal.otherRecipientPlaceholder')}
                      className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-emerald-500"
                    />
                  </div>
                )}

                <div className="space-y-1">
                  <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                    {t('studentPortal.paymentMessageModal.methodLabel')}
                  </label>
                  <select
                    value={msgPaymentMethod}
                    onChange={e => setMsgPaymentMethod(e.target.value as PaymentMethod)}
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs font-semibold text-slate-900 dark:text-white focus:outline-emerald-500"
                  >
                    <option value="cash">{t('common.paymentMethods.cash')}</option>
                    <option value="bizum">{t('common.paymentMethods.bizum')}</option>
                    <option value="transfer">{t('common.paymentMethods.transfer')}</option>
                    <option value="card">{t('common.paymentMethods.cardDebitCredit')}</option>
                  </select>
                </div>
              </div>
            )}

            <div className="space-y-1">
              <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                {msgReportedPaid
                  ? t('studentPortal.paymentMessageModal.noteOptionalLabel')
                  : t('studentPortal.paymentMessageModal.noteRequiredLabel')}
              </label>
              <textarea
                rows={3}
                required={!msgReportedPaid}
                value={msgBody}
                onChange={e => {
                  setMsgBody(e.target.value);
                  if (paymentMessageModalError) setPaymentMessageModalError(null);
                }}
                placeholder={
                  msgReportedPaid
                    ? t('studentPortal.paymentMessageModal.notePaidPlaceholder')
                    : t('studentPortal.paymentMessageModal.noteInquiryPlaceholder')
                }
                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-indigo-500 resize-none"
              />
            </div>

            {paymentMessageModalError && (
              <p className="text-[11px] font-bold text-rose-600 dark:text-rose-400">
                {paymentMessageModalError}
              </p>
            )}

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                disabled={isSendingPaymentMsg}
                onClick={() => setPaymentMessageTarget(null)}
                className="rounded-xl border border-slate-300 dark:border-slate-700 px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition disabled:opacity-50"
              >
                {t('studentPortal.paymentMessageModal.cancel')}
              </button>
              <button
                type="submit"
                disabled={isSendingPaymentMsg}
                className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700 transition disabled:opacity-60"
              >
                {isSendingPaymentMsg ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Send className="h-3.5 w-3.5" />
                )}
                <span>
                  {isSendingPaymentMsg
                    ? t('studentPortal.paymentMessageModal.sending')
                    : t('studentPortal.paymentMessageModal.send')}
                </span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
