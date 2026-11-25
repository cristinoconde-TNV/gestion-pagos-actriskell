import React, { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { createTranslator } from '../lib/i18n';
import {
  Activity,
  PaymentMethod,
  PaymentRecord,
  PaymentStatus,
  StudentAbsence
} from '../types';
import {
  History,
  ChevronDown,
  ChevronRight,
  Calendar,
  Lock,
  Banknote,
  UserCheck,
  UserX,
  CalendarCheck2,
  CalendarX2,
  Check,
  X,
  RotateCcw,
  Loader2,
  Clock
} from 'lucide-react';

interface ActivityHistoryDropdownProps {
  activity: Activity;
  isReadOnly?: boolean;
}

const PAYMENT_STATUS_ORDER: PaymentStatus[] = [
  'paid',
  'partial',
  'exempt',
  'overdue',
  'pending',
  'cancelled'
];

export const ActivityHistoryDropdown: React.FC<ActivityHistoryDropdownProps> = ({
  activity,
  isReadOnly = false
}) => {
  const {
    students,
    payments,
    sessions,
    studentAbsences,
    upsertSessionAttendance,
    recordClassPayment,
    updatePayment,
    deletePayment,
    respondToStudentAbsenceRequest,
    language
  } = useApp();
  const t = createTranslator(language);

  // Desplegable principal colapsado por defecto y cada fecha colapsada por defecto
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [expandedDates, setExpandedDates] = useState<Record<string, boolean>>({});
  const [activePaymentEditorKey, setActivePaymentEditorKey] = useState<string | null>(null);
  const [partialAmountInput, setPartialAmountInput] = useState<string>('');
  const [showPartialInputKey, setShowPartialInputKey] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const localeTag = language === 'en' ? 'en-GB' : language === 'gl' ? 'gl-ES' : 'es-ES';

  const formatDisplayDate = (isoDate: string) => {
    const clean = isoDate.slice(0, 10);
    const [y, m, d] = clean.split('-').map(Number);
    if (!y || !m || !d) return isoDate;
    const dt = new Date(y, m - 1, d);
    if (Number.isNaN(dt.getTime())) return isoDate;
    return new Intl.DateTimeFormat(localeTag, {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    }).format(dt);
  };

  const enrolledStudents = useMemo(
    () => students.filter(s => s.activities.some(e => e.activityId === activity.id)),
    [students, activity.id]
  );

  // Agrupar historial por fecha (sesiones + ausencias reportadas + pagos por clase)
  const dateGroups = useMemo(() => {
    const activitySessions = sessions.filter(s => s.activityId === activity.id);
    const activityAbsences = studentAbsences.filter(
      a => a.activityId === activity.id && a.status !== 'cancelled'
    );
    const activityPerClassPayments =
      activity.billingMode === 'per_class'
        ? payments.filter(p => p.activityId === activity.id && Boolean(p.paymentDate))
        : [];

    const dateSet = new Set<string>();
    activitySessions.forEach(s => {
      if (s.date) dateSet.add(s.date.slice(0, 10));
    });
    activityAbsences.forEach(a => {
      if (a.sessionDate) dateSet.add(a.sessionDate.slice(0, 10));
    });
    activityPerClassPayments.forEach(p => {
      if (p.paymentDate) dateSet.add(p.paymentDate.slice(0, 10));
    });

    const sortedDates = Array.from(dateSet).sort((a, b) => b.localeCompare(a));

    return sortedDates.map(dateStr => {
      const session = activitySessions.find(s => s.date?.slice(0, 10) === dateStr);
      const isClosed = Boolean(session?.isClosed);
      const absencesOnDate = activityAbsences.filter(
        a => a.sessionDate?.slice(0, 10) === dateStr
      );

      // Unir alumnos inscritos + alumnos con historial en esa fecha
      const studentMap = new Map<
        string,
        { id: string; name: string; customPrice?: number; billingMode?: 'monthly' | 'per_class' }
      >();

      enrolledStudents.forEach(st => {
        const enr = st.activities.find(e => e.activityId === activity.id);
        studentMap.set(st.id, {
          id: st.id,
          name: st.name,
          customPrice: enr?.customPrice,
          billingMode: enr?.billingMode
        });
      });

      (session?.attendanceRecords || []).forEach(rec => {
        if (!studentMap.has(rec.studentId)) {
          const stObj = students.find(s => s.id === rec.studentId);
          studentMap.set(rec.studentId, {
            id: rec.studentId,
            name: stObj?.name || rec.studentName || t('activityHistory.fallbackStudent')
          });
        }
      });

      absencesOnDate.forEach(abs => {
        if (!studentMap.has(abs.studentId)) {
          const stObj = students.find(s => s.id === abs.studentId);
          studentMap.set(abs.studentId, {
            id: abs.studentId,
            name: stObj?.name || t('activityHistory.fallbackStudent')
          });
        }
      });

      if (activity.billingMode === 'per_class') {
        activityPerClassPayments
          .filter(p => p.paymentDate?.slice(0, 10) === dateStr)
          .forEach(p => {
            if (!studentMap.has(p.studentId)) {
              const stObj = students.find(s => s.id === p.studentId);
              studentMap.set(p.studentId, {
                id: p.studentId,
                name: stObj?.name || p.studentName || t('activityHistory.fallbackStudent')
              });
            }
          });
      }

      const periodMonth = dateStr.slice(0, 7);
      const studentItems = Array.from(studentMap.values())
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(st => {
          const attRec = session?.attendanceRecords?.find(r => r.studentId === st.id);
          const absence: StudentAbsence | undefined = absencesOnDate.find(
            a => a.studentId === st.id
          );

          const attendanceState: 'present' | 'absent' | 'partial' | 'unrecorded' =
            attRec?.attendance ||
            (absence?.status === 'approved' || absence?.status === 'reported'
              ? 'absent'
              : 'unrecorded');

          const matchesPayment = (p: PaymentRecord) =>
            p.studentId === st.id &&
            p.activityId === activity.id &&
            (activity.billingMode === 'monthly'
              ? p.periodMonth === periodMonth
              : p.paymentDate?.slice(0, 10) === dateStr);

          let matchedPayment: PaymentRecord | null = null;
          for (const status of PAYMENT_STATUS_ORDER) {
            const hit = payments.find(p => matchesPayment(p) && p.status === status);
            if (hit) {
              matchedPayment = hit;
              break;
            }
          }
          if (!matchedPayment) {
            matchedPayment = payments.find(matchesPayment) || null;
          }

          const effectiveMode = st.billingMode || activity.billingMode;
          const expectedFee =
            st.customPrice ??
            (effectiveMode === 'per_class'
              ? activity.defaultPricePerClass
              : activity.defaultPriceMonthly);

          return {
            studentId: st.id,
            studentName: st.name,
            attendanceState,
            absence,
            payment: matchedPayment,
            expectedFee
          };
        });

      const presentCount = studentItems.filter(
        i => i.attendanceState === 'present' || i.attendanceState === 'partial'
      ).length;
      const absentCount = studentItems.filter(i => i.attendanceState === 'absent').length;
      const paidCount = studentItems.filter(i => i.payment?.status === 'paid').length;
      const pendingAbsencesCount = studentItems.filter(
        i => i.absence?.status === 'reported' || i.absence?.status === 'pending'
      ).length;

      return {
        date: dateStr,
        session,
        isClosed,
        studentItems,
        presentCount,
        absentCount,
        paidCount,
        pendingAbsencesCount
      };
    });
  }, [activity, sessions, studentAbsences, payments, enrolledStudents, students, t]);

  const totalPendingAbsences = useMemo(
    () => dateGroups.reduce((acc, g) => acc + g.pendingAbsencesCount, 0),
    [dateGroups]
  );

  const toggleDate = (dateStr: string) => {
    setExpandedDates(prev => ({ ...prev, [dateStr]: !prev[dateStr] }));
  };

  const getPaymentMeta = (status?: PaymentStatus | null) => {
    switch (status) {
      case 'paid':
        return {
          code: t('activityHistory.paymentCodes.paid'),
          label: t('activityHistory.paymentLabels.paid'),
          buttonClass:
            'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/35 hover:bg-emerald-500/25'
        };
      case 'partial':
        return {
          code: t('activityHistory.paymentCodes.partial'),
          label: t('activityHistory.paymentLabels.partial'),
          buttonClass:
            'bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/35 hover:bg-orange-500/25'
        };
      case 'overdue':
        return {
          code: t('activityHistory.paymentCodes.overdue'),
          label: t('activityHistory.paymentLabels.overdue'),
          buttonClass:
            'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/35 hover:bg-rose-500/25'
        };
      case 'exempt':
        return {
          code: t('activityHistory.paymentCodes.exempt'),
          label: t('activityHistory.paymentLabels.exempt'),
          buttonClass:
            'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/35 hover:bg-sky-500/25'
        };
      case 'cancelled':
        return {
          code: t('activityHistory.paymentCodes.cancelled'),
          label: t('activityHistory.paymentLabels.cancelled'),
          buttonClass:
            'bg-zinc-200/80 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border-zinc-300 dark:border-zinc-700 line-through'
        };
      case 'pending':
        return {
          code: t('activityHistory.paymentCodes.pending'),
          label: t('activityHistory.paymentLabels.pending'),
          buttonClass:
            'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/35 hover:bg-amber-500/25'
        };
      default:
        return {
          code: t('activityHistory.paymentCodes.none'),
          label: t('activityHistory.paymentLabels.none'),
          buttonClass:
            'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-200/80 dark:hover:bg-slate-700'
        };
    }
  };

  const handleSetAttendance = async (
    dateStr: string,
    studentId: string,
    studentName: string,
    nextAttendance: 'present' | 'absent',
    payment: PaymentRecord | null,
    isClosed: boolean,
    session?: ReturnType<typeof useApp>['sessions'][number]
  ) => {
    if (isReadOnly || isClosed) return;
    const key = `att:${dateStr}:${studentId}:${nextAttendance}`;
    setBusyKey(key);
    setLocalError(null);
    try {
      const res = await upsertSessionAttendance({
        activityId: activity.id,
        teacherId: session?.teacherId || activity.teacherId,
        date: dateStr,
        studentId,
        studentName,
        attendance: nextAttendance,
        durationMinutes: session?.durationMinutes || 75,
        topic: session?.topic || '',
        paid: payment?.status === 'paid' || payment?.status === 'partial',
        paidAmount: payment?.amount,
        paymentMethod: payment?.paymentMethod || 'cash',
        paymentId: payment?.id,
        enrolledStudents: enrolledStudents.map(s => ({ id: s.id, name: s.name }))
      });
      if (!res.success && res.error) {
        setLocalError(res.error);
      }
    } finally {
      setBusyKey(null);
    }
  };

  const handleAbsenceResponse = async (
    dateStr: string,
    absence: StudentAbsence,
    approve: boolean
  ) => {
    if (isReadOnly) return;
    const key = `abs:${dateStr}:${absence.id}:${approve ? 'yes' : 'no'}`;
    setBusyKey(key);
    setLocalError(null);
    try {
      const res = await respondToStudentAbsenceRequest(absence.id, approve);
      if (!res.success && res.error) {
        setLocalError(res.error);
      }
    } finally {
      setBusyKey(null);
    }
  };

  const handleApplyPaymentStatus = async (params: {
    dateStr: string;
    studentId: string;
    studentName: string;
    expectedFee: number;
    existingPayment: PaymentRecord | null;
    nextStatus: PaymentStatus;
    customAmount?: number;
    isClosed: boolean;
  }) => {
    if (isReadOnly || params.isClosed) return;
    const key = `pay:${params.dateStr}:${params.studentId}`;
    setBusyKey(key);
    setLocalError(null);
    try {
      const targetAmount =
        params.customAmount !== undefined
          ? params.customAmount
          : params.nextStatus === 'paid'
          ? params.expectedFee
          : params.nextStatus === 'exempt' || params.nextStatus === 'cancelled'
          ? 0
          : params.existingPayment?.amount ?? params.expectedFee;

      const method: PaymentMethod = params.existingPayment?.paymentMethod || 'cash';

      if (params.existingPayment) {
        await updatePayment(params.existingPayment.id, {
          status: params.nextStatus,
          amount: targetAmount,
          paymentDate: params.dateStr,
          paymentMethod: method
        });
      } else {
        await recordClassPayment({
          studentId: params.studentId,
          activityId: activity.id,
          amount: targetAmount,
          isPartial: params.nextStatus === 'partial',
          status: params.nextStatus,
          paymentMethod: method,
          date: params.dateStr,
          notes:
            params.nextStatus === 'partial'
              ? t('activityHistory.partialPaymentNote', {
                  paid: targetAmount.toFixed(2),
                  total: params.expectedFee.toFixed(2)
                })
              : undefined
        });
      }
      setActivePaymentEditorKey(null);
      setShowPartialInputKey(null);
    } finally {
      setBusyKey(null);
    }
  };

  const handleRemovePayment = async (
    dateStr: string,
    studentId: string,
    payment: PaymentRecord,
    isClosed: boolean
  ) => {
    if (isReadOnly || isClosed) return;
    const key = `paydel:${dateStr}:${studentId}`;
    setBusyKey(key);
    setLocalError(null);
    try {
      await deletePayment(payment.id);
      setActivePaymentEditorKey(null);
      setShowPartialInputKey(null);
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 space-y-2">
      {/* Desplegable principal de Historial (colapsado por defecto) */}
      <button
        type="button"
        onClick={() => setIsHistoryOpen(prev => !prev)}
        aria-expanded={isHistoryOpen}
        className="w-full flex items-center justify-between gap-2 rounded-xl border border-slate-200/80 dark:border-slate-700/80 bg-slate-50/80 dark:bg-slate-800/50 px-3 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition touch-manipulation"
      >
        <div className="flex items-center gap-2 min-w-0">
          <History className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
          <span className="truncate">{t('activityHistory.toggleTitle')}</span>
          <span className="rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-slate-600 dark:text-slate-300 shrink-0">
            {dateGroups.length}
          </span>
          {totalPendingAbsences > 0 && (
            <span className="rounded-md bg-amber-500/15 border border-amber-500/30 px-1.5 py-0.5 text-[10px] font-bold text-amber-800 dark:text-amber-300 shrink-0">
              {t('activityHistory.pendingAbsencesShort', { count: totalPendingAbsences })}
            </span>
          )}
        </div>
        <ChevronDown
          className={`h-4 w-4 text-slate-400 transition-transform duration-200 shrink-0 ${
            isHistoryOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {/* Contenido del historial agrupado por fecha */}
      {isHistoryOpen && (
        <div className="space-y-2">
          {localError && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-50 dark:bg-rose-950/30 px-2.5 py-1.5 text-[11px] font-semibold text-rose-700 dark:text-rose-300">
              {localError}
            </div>
          )}

          {dateGroups.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-900/40 px-3 py-4 text-center text-[11px] text-slate-400">
              {t('activityHistory.emptyHistory')}
            </div>
          ) : (
            <div className="space-y-1.5">
              {dateGroups.map(group => {
                const isDateExpanded = Boolean(expandedDates[group.date]);
                return (
                  <div
                    key={group.date}
                    className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/30 overflow-hidden"
                  >
                    {/* Cabecera colapsable de la fecha (colapsada por defecto) */}
                    <button
                      type="button"
                      onClick={() => toggleDate(group.date)}
                      aria-expanded={isDateExpanded}
                      className="w-full px-3 py-2 flex items-center justify-between gap-2 text-left hover:bg-slate-100/80 dark:hover:bg-slate-800/70 transition touch-manipulation"
                    >
                      <div className="min-w-0 flex-1 flex items-center gap-2 flex-wrap">
                        {isDateExpanded ? (
                          <ChevronDown className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                        )}
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-slate-800 dark:text-slate-100">
                          <Calendar className="h-3 w-3 text-indigo-500 shrink-0" />
                          <span className="capitalize">{formatDisplayDate(group.date)}</span>
                        </span>
                        {group.isClosed && (
                          <span
                            title={t('activityHistory.sessionClosedTooltip')}
                            className="inline-flex items-center gap-0.5 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-800 dark:text-amber-300"
                          >
                            <Lock className="h-2.5 w-2.5 shrink-0" />
                            <span>{t('activityHistory.closedBadge')}</span>
                          </span>
                        )}
                        {group.pendingAbsencesCount > 0 && (
                          <span className="rounded bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-bold text-sky-700 dark:text-sky-300">
                            {t('activityHistory.pendingAbsencesShort', {
                              count: group.pendingAbsencesCount
                            })}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0 text-[10px] font-bold tabular-nums">
                        <span
                          title={t('activityHistory.presentCountTooltip')}
                          className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-emerald-700 dark:text-emerald-300"
                        >
                          {group.presentCount}P
                        </span>
                        <span
                          title={t('activityHistory.absentCountTooltip')}
                          className="rounded bg-rose-500/10 px-1.5 py-0.5 text-rose-700 dark:text-rose-300"
                        >
                          {group.absentCount}A
                        </span>
                        <span
                          title={t('activityHistory.paidCountTooltip')}
                          className="rounded bg-indigo-500/10 px-1.5 py-0.5 text-indigo-700 dark:text-indigo-300"
                        >
                          {group.paidCount}/{group.studentItems.length}€
                        </span>
                      </div>
                    </button>

                    {/* Lista de alumnos dentro de la fecha */}
                    {isDateExpanded && (
                      <div className="border-t border-slate-200/80 dark:border-slate-800 p-2 space-y-1.5 bg-white/70 dark:bg-slate-900/50">
                        {group.session?.topic && (
                          <p className="px-1 text-[11px] text-slate-500 dark:text-slate-400 truncate">
                            {t('activityHistory.topicPrefix')} <strong>{group.session.topic}</strong>
                          </p>
                        )}

                        {group.studentItems.length === 0 ? (
                          <p className="px-2 py-2 text-[11px] text-slate-400 italic">
                            {t('activityHistory.noStudentsForDate')}
                          </p>
                        ) : (
                          group.studentItems.map(item => {
                            const paymentMeta = getPaymentMeta(item.payment?.status);
                            const rowKey = `${group.date}::${item.studentId}`;
                            const isPaymentEditorOpen = activePaymentEditorKey === rowKey;
                            const isPartialBoxOpen = showPartialInputKey === rowKey;
                            const abs = item.absence;
                            const isAbsencePending =
                              abs?.status === 'reported' || abs?.status === 'pending';
                            const isAbsenceApproved = abs?.status === 'approved';
                            const isAbsenceRejected = abs?.status === 'rejected';
                            const isRowBusy =
                              busyKey?.includes(`:${group.date}:${item.studentId}`) ||
                              (abs && busyKey?.includes(`:${group.date}:${abs.id}:`));

                            return (
                              <div
                                key={rowKey}
                                className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 px-2.5 py-2 space-y-2"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  {/* Nombre del alumno + detalle opcional de ausencia */}
                                  <div className="min-w-0 flex-1">
                                    <span
                                      className={`text-xs font-bold block truncate ${
                                        item.attendanceState === 'absent'
                                          ? 'line-through text-slate-400 dark:text-slate-500'
                                          : 'text-slate-900 dark:text-white'
                                      }`}
                                    >
                                      {item.studentName}
                                    </span>
                                    {abs?.reason && (
                                      <span
                                        title={abs.reason}
                                        className="text-[10px] text-slate-500 dark:text-slate-400 italic block truncate"
                                      >
                                        "{abs.reason}"
                                      </span>
                                    )}
                                  </div>

                                  {/* Botones de icono: Estado de pago + Asistencia + Ausencia + Confirmación de ausencia */}
                                  <div className="flex items-center gap-1 shrink-0">
                                    {/* 1. Estado de Pago */}
                                    <button
                                      type="button"
                                      disabled={isReadOnly || group.isClosed || Boolean(isRowBusy)}
                                      onClick={() => {
                                        setActivePaymentEditorKey(prev =>
                                          prev === rowKey ? null : rowKey
                                        );
                                        setShowPartialInputKey(null);
                                        setPartialAmountInput(
                                          String(
                                            item.payment?.status === 'partial'
                                              ? item.payment.amount
                                              : Math.round((item.expectedFee / 2) * 100) / 100
                                          )
                                        );
                                      }}
                                      title={`${t('activityHistory.paymentButtonTitle')}: ${paymentMeta.label}${
                                        item.payment ? ` (${item.payment.amount.toFixed(2)}€)` : ''
                                      }`}
                                      aria-label={`${item.studentName} - ${paymentMeta.label}`}
                                      className={`inline-flex h-8 min-w-[44px] items-center justify-center gap-1 rounded-lg border px-1.5 text-[10px] font-black transition active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${paymentMeta.buttonClass}`}
                                    >
                                      <Banknote className="h-3.5 w-3.5 shrink-0" />
                                      <span>{paymentMeta.code}</span>
                                    </button>

                                    {/* 2. Asistencia (Presente) */}
                                    <button
                                      type="button"
                                      disabled={isReadOnly || group.isClosed || Boolean(isRowBusy)}
                                      onClick={() =>
                                        handleSetAttendance(
                                          group.date,
                                          item.studentId,
                                          item.studentName,
                                          'present',
                                          item.payment,
                                          group.isClosed,
                                          group.session
                                        )
                                      }
                                      title={t('activityHistory.markPresentTooltip')}
                                      aria-label={`${item.studentName} - ${t(
                                        'activityHistory.markPresentTooltip'
                                      )}`}
                                      className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border transition active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${
                                        item.attendanceState === 'present'
                                          ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                                          : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-400 hover:text-emerald-600 hover:border-emerald-400'
                                      }`}
                                    >
                                      <UserCheck className="h-3.5 w-3.5" />
                                    </button>

                                    {/* 3. Ausencia (Ausente) */}
                                    <button
                                      type="button"
                                      disabled={isReadOnly || group.isClosed || Boolean(isRowBusy)}
                                      onClick={() =>
                                        handleSetAttendance(
                                          group.date,
                                          item.studentId,
                                          item.studentName,
                                          'absent',
                                          item.payment,
                                          group.isClosed,
                                          group.session
                                        )
                                      }
                                      title={t('activityHistory.markAbsentTooltip')}
                                      aria-label={`${item.studentName} - ${t(
                                        'activityHistory.markAbsentTooltip'
                                      )}`}
                                      className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border transition active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${
                                        item.attendanceState === 'absent'
                                          ? 'bg-rose-500 text-white border-rose-500 shadow-xs'
                                          : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-400 hover:text-rose-600 hover:border-rose-400'
                                      }`}
                                    >
                                      <UserX className="h-3.5 w-3.5" />
                                    </button>

                                    {/* 4. Confirmación de ausencia */}
                                    {isAbsencePending && abs ? (
                                      <div className="inline-flex items-center gap-0.5">
                                        <button
                                          type="button"
                                          disabled={isReadOnly || Boolean(isRowBusy)}
                                          onClick={() =>
                                            handleAbsenceResponse(group.date, abs, true)
                                          }
                                          title={t('activityHistory.confirmAbsenceTooltip')}
                                          aria-label={`${item.studentName} - ${t(
                                            'activityHistory.confirmAbsenceTooltip'
                                          )}`}
                                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-amber-500/50 bg-amber-500 text-white hover:bg-amber-600 shadow-xs transition active:scale-95 disabled:opacity-50"
                                        >
                                          {busyKey === `abs:${group.date}:${abs.id}:yes` ? (
                                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                          ) : (
                                            <CalendarCheck2 className="h-3.5 w-3.5" />
                                          )}
                                        </button>
                                        <button
                                          type="button"
                                          disabled={isReadOnly || Boolean(isRowBusy)}
                                          onClick={() =>
                                            handleAbsenceResponse(group.date, abs, false)
                                          }
                                          title={t('activityHistory.rejectAbsenceTooltip')}
                                          aria-label={`${item.studentName} - ${t(
                                            'activityHistory.rejectAbsenceTooltip'
                                          )}`}
                                          className="inline-flex h-8 w-7 items-center justify-center rounded-lg border border-rose-200 dark:border-rose-800 bg-rose-50/70 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 hover:bg-rose-100 transition active:scale-95 disabled:opacity-50"
                                        >
                                          {busyKey === `abs:${group.date}:${abs.id}:no` ? (
                                            <Loader2 className="h-3 w-3 animate-spin" />
                                          ) : (
                                            <X className="h-3.5 w-3.5" />
                                          )}
                                        </button>
                                      </div>
                                    ) : isAbsenceApproved ? (
                                      <span
                                        title={t('activityHistory.absenceConfirmedTooltip')}
                                        aria-label={`${item.studentName} - ${t(
                                          'activityHistory.absenceConfirmedTooltip'
                                        )}`}
                                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-sky-500/35 bg-sky-500/15 text-sky-700 dark:text-sky-300"
                                      >
                                        <CalendarCheck2 className="h-3.5 w-3.5" />
                                      </span>
                                    ) : isAbsenceRejected ? (
                                      <span
                                        title={t('activityHistory.absenceRejectedTooltip')}
                                        aria-label={`${item.studentName} - ${t(
                                          'activityHistory.absenceRejectedTooltip'
                                        )}`}
                                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-rose-500/25 bg-rose-500/10 text-rose-600 dark:text-rose-400"
                                      >
                                        <CalendarX2 className="h-3.5 w-3.5" />
                                      </span>
                                    ) : (
                                      <span
                                        title={t('activityHistory.noAbsenceRequestTooltip')}
                                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200/70 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 text-slate-300 dark:text-slate-600"
                                      >
                                        <Clock className="h-3.5 w-3.5" />
                                      </span>
                                    )}
                                  </div>
                                </div>

                                {/* Selector rápido inline de estado de pago al pulsar el icono de pago */}
                                {isPaymentEditorOpen && !group.isClosed && (
                                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2">
                                    <div className="flex flex-wrap items-center gap-1">
                                      {(
                                        [
                                          'paid',
                                          'partial',
                                          'pending',
                                          'overdue',
                                          'exempt',
                                          'cancelled'
                                        ] as PaymentStatus[]
                                      ).map(stKey => {
                                        const meta = getPaymentMeta(stKey);
                                        const isCurrent = item.payment?.status === stKey;
                                        return (
                                          <button
                                            key={stKey}
                                            type="button"
                                            disabled={Boolean(isRowBusy)}
                                            onClick={() => {
                                              if (stKey === 'partial') {
                                                setShowPartialInputKey(rowKey);
                                                return;
                                              }
                                              void handleApplyPaymentStatus({
                                                dateStr: group.date,
                                                studentId: item.studentId,
                                                studentName: item.studentName,
                                                expectedFee: item.expectedFee,
                                                existingPayment: item.payment,
                                                nextStatus: stKey,
                                                isClosed: group.isClosed
                                              });
                                            }}
                                            title={meta.label}
                                            className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[10px] font-bold transition ${
                                              isCurrent ? 'ring-2 ring-indigo-500/60' : ''
                                            } ${meta.buttonClass}`}
                                          >
                                            <span>{meta.code}</span>
                                            <span className="hidden sm:inline">· {meta.label}</span>
                                          </button>
                                        );
                                      })}

                                      {item.payment && (
                                        <button
                                          type="button"
                                          disabled={Boolean(isRowBusy)}
                                          onClick={() =>
                                            handleRemovePayment(
                                              group.date,
                                              item.studentId,
                                              item.payment!,
                                              group.isClosed
                                            )
                                          }
                                          title={t('activityHistory.removeReceiptTooltip')}
                                          className="inline-flex items-center gap-1 rounded-lg border border-rose-200 dark:border-rose-900/60 bg-rose-50/70 dark:bg-rose-950/30 px-2 py-1 text-[10px] font-bold text-rose-700 dark:text-rose-300 hover:bg-rose-100 transition ml-auto"
                                        >
                                          <RotateCcw className="h-3 w-3" />
                                          <span>{t('activityHistory.unmarkShort')}</span>
                                        </button>
                                      )}
                                    </div>

                                    {isPartialBoxOpen && (
                                      <div className="flex items-center gap-1.5">
                                        <input
                                          type="number"
                                          step="0.01"
                                          min="0.01"
                                          value={partialAmountInput}
                                          onChange={e => setPartialAmountInput(e.target.value)}
                                          className="w-24 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1 text-xs font-bold text-slate-900 dark:text-white text-right"
                                          aria-label={t('activityHistory.partialAmountAria')}
                                        />
                                        <span className="text-[11px] font-bold text-slate-400">
                                          € / {item.expectedFee.toFixed(2)}€
                                        </span>
                                        <button
                                          type="button"
                                          disabled={Boolean(isRowBusy)}
                                          onClick={() => {
                                            const amt = Number(partialAmountInput);
                                            if (!Number.isFinite(amt) || amt <= 0) {
                                              setLocalError(
                                                t('activityHistory.invalidPartialAmount')
                                              );
                                              return;
                                            }
                                            const resolvedStatus: PaymentStatus =
                                              item.expectedFee > 0 && amt >= item.expectedFee
                                                ? 'paid'
                                                : 'partial';
                                            void handleApplyPaymentStatus({
                                              dateStr: group.date,
                                              studentId: item.studentId,
                                              studentName: item.studentName,
                                              expectedFee: item.expectedFee,
                                              existingPayment: item.payment,
                                              nextStatus: resolvedStatus,
                                              customAmount: amt,
                                              isClosed: group.isClosed
                                            });
                                          }}
                                          className="inline-flex h-7 items-center gap-1 rounded-lg bg-emerald-600 px-2.5 text-[11px] font-bold text-white hover:bg-emerald-700 transition ml-auto"
                                        >
                                          <Check className="h-3 w-3" />
                                          <span>{t('activityHistory.saveShort')}</span>
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
