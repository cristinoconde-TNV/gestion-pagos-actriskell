import React, { useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Calendar,
  Euro,
  CheckCircle2,
  Clock,
  Wallet,
  Users,
  BookOpen,
  CreditCard,
  Banknote,
  Building2,
  X,
  FileCheck2,
  UserCheck,
  UserX
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { ClassSession, PaymentMethod, PaymentRecord, UserRole } from '../types';

interface AttendeePaymentRow {
  studentId: string;
  studentName: string;
  attendance: 'present' | 'absent' | 'late' | string;
  paidAmount: number;
  debtAmount: number;
  isPaid: boolean;
  paymentMethod?: PaymentMethod;
}

interface SessionBreakdown {
  session: ClassSession;
  activityName: string;
  teacherName: string;
  collectedAmount: number;
  collectedInHandAmount: number;
  pendingAmount: number;
  paidCount: number;
  totalTrackedStudents: number;
  estimatedTeacherShare: number;
  attendees: AttendeePaymentRow[];
}

interface DayGroup {
  dayKey: string; // YYYY-MM-DD
  dayLabel: string;
  sessions: SessionBreakdown[];
  collectedAmount: number;
  pendingAmount: number;
  teacherShareAmount: number;
}

interface MonthGroup {
  monthKey: string; // YYYY-MM
  monthLabel: string;
  days: DayGroup[];
  sessionsCount: number;
  collectedAmount: number;
  pendingAmount: number;
  teacherShareAmount: number;
}

interface YearGroup {
  yearKey: string; // YYYY
  months: MonthGroup[];
  sessionsCount: number;
  collectedAmount: number;
  pendingAmount: number;
  teacherShareAmount: number;
}

interface ClassDayGroup {
  dayKey: string; // YYYY-MM-DD
  dayLabel: string;
  sessions: SessionBreakdown[];
  attendees: AttendeePaymentRow[];
  collectedAmount: number;
  pendingAmount: number;
}

interface ClassMonthGroup {
  monthKey: string; // YYYY-MM
  monthLabel: string;
  days: ClassDayGroup[];
  sessionsCount: number;
  collectedAmount: number;
  pendingAmount: number;
}

interface ClassYearGroup {
  yearKey: string; // YYYY
  months: ClassMonthGroup[];
  sessionsCount: number;
  collectedAmount: number;
  pendingAmount: number;
}

interface ClassTreeGroup {
  classKey: string;
  activityName: string;
  years: ClassYearGroup[];
  sessionsCount: number;
  collectedAmount: number;
  pendingAmount: number;
}

const MONTH_NAMES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre'
];

const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Efectivo',
  bizum: 'Bizum',
  transfer: 'Transferencia',
  card: 'Tarjeta',
  other: 'Otro'
};

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2
  }).format(Number.isFinite(amount) ? amount : 0);
}

function getPaymentRecordAmount(payment: PaymentRecord, fallbackPrice = 0): number {
  const rec = payment as PaymentRecord & {
    paidAmount?: number;
    paid_amount?: number;
    totalAmount?: number;
  };
  if (typeof rec.paidAmount === 'number' && payment.status === 'partial') {
    return rec.paidAmount;
  }
  if (typeof rec.paid_amount === 'number' && payment.status === 'partial') {
    return rec.paid_amount;
  }
  if (typeof payment.amount === 'number' && payment.amount > 0) {
    return payment.amount;
  }
  if (typeof rec.totalAmount === 'number' && rec.totalAmount > 0) {
    return rec.totalAmount;
  }
  return fallbackPrice;
}

export const TeacherPayoutsView: React.FC = () => {
  const {
    selectedPeriod,
    teachers,
    activities,
    students,
    sessions,
    payments,
    payouts,
    teacherSummaries,
    currentRole,
    currentTeacherId,
    settleTeacherPayout
  } = useApp();

  const roleStr = String(currentRole).toLowerCase();
  const isAdminRole = currentRole === UserRole.Admin || roleStr === 'admin';
  const isTeacherRole =
    currentRole === UserRole.Monitor ||
    currentRole === UserRole.Hibrido ||
    roleStr === 'monitor' ||
    roleStr === 'hibrido' ||
    roleStr === 'híbrido';

  const [selectedTeacherFilter, setSelectedTeacherFilter] = useState<string>('ALL');

  // Contenedores principales colapsados por defecto
  const [isByYearsSectionOpen, setIsByYearsSectionOpen] = useState<boolean>(false);
  const [isByActivitySectionOpen, setIsByActivitySectionOpen] = useState<boolean>(false);

  // Estado colapsable Año -> Mes -> Día -> Clase -> Asistentes
  const [expandedYears, setExpandedYears] = useState<Record<string, boolean>>({});
  const [expandedMonths, setExpandedMonths] = useState<Record<string, boolean>>({});
  const [expandedDays, setExpandedDays] = useState<Record<string, boolean>>({});
  const [expandedSessions, setExpandedSessions] = useState<Record<string, boolean>>({});

  // Estado colapsable Actividad -> Año -> Mes -> Día -> Asistentes
  const [expandedClassNodes, setExpandedClassNodes] = useState<Record<string, boolean>>({});
  const [expandedClassYears, setExpandedClassYears] = useState<Record<string, boolean>>({});
  const [expandedClassMonths, setExpandedClassMonths] = useState<Record<string, boolean>>({});
  const [expandedClassDays, setExpandedClassDays] = useState<Record<string, boolean>>({});

  // Modal de liquidación
  const [settlingTeacherId, setSettlingTeacherId] = useState<string | null>(null);
  const [settleAmount, setSettleAmount] = useState<string>('0');
  const [settleMethod, setSettleMethod] = useState<PaymentMethod>('cash');
  const [settleNotes, setSettleNotes] = useState<string>('');
  const [isSubmittingPayout, setIsSubmittingPayout] = useState<boolean>(false);

  // Filtrado por el profesor activo o selector administrador
  const effectiveTeacherId = useMemo(() => {
    if (isTeacherRole) {
      return currentTeacherId || teachers[0]?.id || '';
    }
    return selectedTeacherFilter;
  }, [isTeacherRole, currentTeacherId, teachers, selectedTeacherFilter]);

  const activeTeacher = useMemo(
    () => teachers.find(t => t.id === effectiveTeacherId) || null,
    [teachers, effectiveTeacherId]
  );

  // Solo el profesor/monitor tiene liquidaciones en su portal
  const canViewPayouts = isTeacherRole && Boolean(effectiveTeacherId);

  const activeSummary = useMemo(() => {
    if (!canViewPayouts || !effectiveTeacherId) return null;
    return teacherSummaries.find(s => s.teacher.id === effectiveTeacherId) || null;
  }, [canViewPayouts, teacherSummaries, effectiveTeacherId]);

  const filteredSessions = useMemo(() => {
    return sessions
      .filter(s => {
        if (effectiveTeacherId && effectiveTeacherId !== 'ALL' && s.teacherId !== effectiveTeacherId) {
          return false;
        }
        return true;
      })
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  }, [sessions, effectiveTeacherId]);

  const sessionBreakdowns = useMemo<SessionBreakdown[]>(() => {
    return filteredSessions.map(session => {
      const activity = activities.find(a => a.id === session.activityId);
      const teacher = teachers.find(t => t.id === session.teacherId);
      const defaultRate =
        activity?.billingMode === 'per_class'
          ? activity.defaultPricePerClass || activity.defaultPriceMonthly || 0
          : activity?.defaultPricePerClass ||
            (activity?.defaultPriceMonthly ? activity.defaultPriceMonthly / 4 : 0);

      const sessionMonth = session.date?.slice(0, 7) || selectedPeriod;
      const relatedPayments = payments.filter(
        p =>
          p.activityId === session.activityId &&
          (p.periodMonth === sessionMonth || p.paymentDate === session.date)
      );

      let collectedAmount = 0;
      let collectedInHandAmount = 0;
      let pendingAmount = 0;
      let paidCount = 0;
      const attendees: AttendeePaymentRow[] = [];

      const records = session.attendanceRecords || [];
      const activeStudentsForActivity = students.filter(st =>
        st.activities.some(enr => enr.activityId === session.activityId && enr.active !== false)
      );

      if (records.length > 0) {
        for (const rec of records) {
          const studentObj = students.find(st => st.id === rec.studentId);
          const studentName = rec.studentName || studentObj?.name || 'Alumno';
          const enrollment = studentObj?.activities.find(
            enr => enr.activityId === session.activityId
          );

          const expectedStudentPrice =
            enrollment?.customPrice ??
            (activity?.billingMode === 'per_class'
              ? activity.defaultPricePerClass
              : defaultRate) ??
            0;

          const matchedPayment =
            (rec.paymentId
              ? relatedPayments.find(p => p.id === rec.paymentId)
              : undefined) ||
            relatedPayments.find(p => p.studentId === rec.studentId);

          let rowPaid = 0;
          let rowDebt = 0;
          let rowIsPaid = false;

          if (rec.paid || matchedPayment?.status === 'paid') {
            rowPaid =
              typeof rec.paidAmount === 'number' && rec.paidAmount > 0
                ? rec.paidAmount
                : matchedPayment
                ? getPaymentRecordAmount(matchedPayment, expectedStudentPrice)
                : expectedStudentPrice;
            rowDebt = 0;
            rowIsPaid = true;

            if (rec.attendance !== 'absent') {
              collectedAmount += rowPaid;
              if (matchedPayment?.collectedByTeacher !== false) {
                collectedInHandAmount += rowPaid;
              }
              paidCount += 1;
            }
          } else if (matchedPayment?.status === 'partial') {
            rowPaid =
              typeof rec.paidAmount === 'number' && rec.paidAmount > 0
                ? rec.paidAmount
                : getPaymentRecordAmount(matchedPayment, expectedStudentPrice * 0.5);
            rowDebt = Math.max(0, expectedStudentPrice - rowPaid);
            rowIsPaid = false;

            if (rec.attendance !== 'absent') {
              collectedAmount += rowPaid;
              if (matchedPayment.collectedByTeacher !== false) {
                collectedInHandAmount += rowPaid;
              }
              pendingAmount += rowDebt;
            }
          } else if (
            matchedPayment?.status === 'pending' ||
            matchedPayment?.status === 'overdue'
          ) {
            rowPaid = 0;
            rowDebt = getPaymentRecordAmount(matchedPayment, expectedStudentPrice);
            rowIsPaid = false;

            if (rec.attendance !== 'absent') {
              pendingAmount += rowDebt;
            }
          } else if (activity?.billingMode === 'per_class' && rec.attendance !== 'absent') {
            rowPaid = 0;
            rowDebt = expectedStudentPrice;
            rowIsPaid = false;
            pendingAmount += rowDebt;
          }

          attendees.push({
            studentId: rec.studentId,
            studentName,
            attendance: rec.attendance,
            paidAmount: rowPaid,
            debtAmount: rowDebt,
            isPaid: rowIsPaid,
            paymentMethod: rec.paymentMethod || matchedPayment?.paymentMethod
          });
        }
      } else {
        for (const st of activeStudentsForActivity) {
          const enrollment = st.activities.find(enr => enr.activityId === session.activityId);
          const expectedStudentPrice =
            enrollment?.customPrice ??
            (activity?.billingMode === 'per_class'
              ? activity.defaultPricePerClass
              : defaultRate) ??
            0;
          const matchedPayment = relatedPayments.find(p => p.studentId === st.id);

          let rowPaid = 0;
          let rowDebt = 0;
          let rowIsPaid = false;

          if (matchedPayment?.status === 'paid') {
            rowPaid = getPaymentRecordAmount(matchedPayment, expectedStudentPrice);
            rowDebt = 0;
            rowIsPaid = true;
            collectedAmount += rowPaid;
            if (matchedPayment.collectedByTeacher !== false) {
              collectedInHandAmount += rowPaid;
            }
            paidCount += 1;
          } else if (matchedPayment?.status === 'partial') {
            rowPaid = getPaymentRecordAmount(matchedPayment, expectedStudentPrice * 0.5);
            rowDebt = Math.max(0, expectedStudentPrice - rowPaid);
            rowIsPaid = false;
            collectedAmount += rowPaid;
            if (matchedPayment.collectedByTeacher !== false) {
              collectedInHandAmount += rowPaid;
            }
            pendingAmount += rowDebt;
          } else if (
            matchedPayment?.status === 'pending' ||
            matchedPayment?.status === 'overdue'
          ) {
            rowPaid = 0;
            rowDebt = getPaymentRecordAmount(matchedPayment, expectedStudentPrice);
            rowIsPaid = false;
            pendingAmount += rowDebt;
          }

          attendees.push({
            studentId: st.id,
            studentName: st.name,
            attendance: 'present',
            paidAmount: rowPaid,
            debtAmount: rowDebt,
            isPaid: rowIsPaid,
            paymentMethod: matchedPayment?.paymentMethod
          });
        }
      }

      let estimatedTeacherShare = 0;
      if (teacher) {
        if (teacher.paymentScheme === 'per_class') {
          estimatedTeacherShare = teacher.ratePerClass || 0;
        } else if (teacher.paymentScheme === 'revenue_share') {
          estimatedTeacherShare = collectedAmount * ((teacher.revenueSharePercent || 0) / 100);
        }
      }

      const trackedCount =
        records.filter(r => r.attendance !== 'absent').length ||
        session.attendeesCount ||
        activeStudentsForActivity.length;

      return {
        session,
        activityName: activity?.name || 'Actividad',
        teacherName: teacher?.name || 'Profesor',
        collectedAmount,
        collectedInHandAmount,
        pendingAmount,
        paidCount,
        totalTrackedStudents: trackedCount,
        estimatedTeacherShare,
        attendees
      };
    });
  }, [filteredSessions, activities, teachers, payments, students, selectedPeriod]);

  // Agrupación colapsable Año -> Mes -> Día
  const yearGroups = useMemo<YearGroup[]>(() => {
    const byYear = new Map<string, Map<string, Map<string, SessionBreakdown[]>>>();

    for (const item of sessionBreakdowns) {
      const cleanDate = item.session.date || `${selectedPeriod}-01`;
      const [year = '2026', month = '01', day = '01'] = cleanDate.split('-');
      const monthKey = `${year}-${month}`;
      const dayKey = `${year}-${month}-${day}`;

      if (!byYear.has(year)) byYear.set(year, new Map());
      const yearMap = byYear.get(year)!;

      if (!yearMap.has(monthKey)) yearMap.set(monthKey, new Map());
      const monthMap = yearMap.get(monthKey)!;

      if (!monthMap.has(dayKey)) monthMap.set(dayKey, []);
      monthMap.get(dayKey)!.push(item);
    }

    return Array.from(byYear.entries())
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([yearKey, monthMap]) => {
        const months: MonthGroup[] = Array.from(monthMap.entries())
          .sort((a, b) => (a[0] < b[0] ? 1 : -1))
          .map(([monthKey, dayMap]) => {
            const monthIndex = Math.max(
              0,
              Math.min(11, Number(monthKey.split('-')[1] || '1') - 1)
            );
            const days: DayGroup[] = Array.from(dayMap.entries())
              .sort((a, b) => (a[0] < b[0] ? 1 : -1))
              .map(([dayKey, items]) => {
                const dateObj = new Date(`${dayKey}T12:00:00`);
                const dayLabel = Number.isNaN(dateObj.getTime())
                  ? dayKey
                  : dateObj.toLocaleDateString('es-ES', {
                      weekday: 'short',
                      day: '2-digit',
                      month: 'short'
                    });

                return {
                  dayKey,
                  dayLabel,
                  sessions: items,
                  collectedAmount: items.reduce((acc, i) => acc + i.collectedAmount, 0),
                  pendingAmount: items.reduce((acc, i) => acc + i.pendingAmount, 0),
                  teacherShareAmount: items.reduce((acc, i) => acc + i.estimatedTeacherShare, 0)
                };
              });

            return {
              monthKey,
              monthLabel: `${MONTH_NAMES[monthIndex]} ${yearKey}`,
              days,
              sessionsCount: days.reduce((acc, d) => acc + d.sessions.length, 0),
              collectedAmount: days.reduce((acc, d) => acc + d.collectedAmount, 0),
              pendingAmount: days.reduce((acc, d) => acc + d.pendingAmount, 0),
              teacherShareAmount: days.reduce((acc, d) => acc + d.teacherShareAmount, 0)
            };
          });

        return {
          yearKey,
          months,
          sessionsCount: months.reduce((acc, m) => acc + m.sessionsCount, 0),
          collectedAmount: months.reduce((acc, m) => acc + m.collectedAmount, 0),
          pendingAmount: months.reduce((acc, m) => acc + m.pendingAmount, 0),
          teacherShareAmount: months.reduce((acc, m) => acc + m.teacherShareAmount, 0)
        };
      });
  }, [sessionBreakdowns, selectedPeriod]);

  // Agrupación colapsable Actividad -> Año -> Mes -> Día -> Asistentes
  const classGroups = useMemo<ClassTreeGroup[]>(() => {
    type DayBucket = SessionBreakdown[];
    type MonthBucket = Map<string, DayBucket>;
    type YearBucket = Map<string, MonthBucket>;
    type ClassBucket = { activityName: string; years: YearBucket };

    const byClass = new Map<string, ClassBucket>();

    for (const item of sessionBreakdowns) {
      const classKey = item.session.activityId || item.activityName;
      const cleanDate = item.session.date || `${selectedPeriod}-01`;
      const [year = '2026', month = '01', day = '01'] = cleanDate.split('-');
      const monthKey = `${year}-${month}`;
      const dayKey = `${year}-${month}-${day}`;

      if (!byClass.has(classKey)) {
        byClass.set(classKey, {
          activityName: item.activityName,
          years: new Map()
        });
      }
      const cls = byClass.get(classKey)!;

      if (!cls.years.has(year)) cls.years.set(year, new Map());
      const yearMap = cls.years.get(year)!;

      if (!yearMap.has(monthKey)) yearMap.set(monthKey, new Map());
      const monthMap = yearMap.get(monthKey)!;

      if (!monthMap.has(dayKey)) monthMap.set(dayKey, []);
      monthMap.get(dayKey)!.push(item);
    }

    return Array.from(byClass.entries())
      .map(([classKey, cls]) => {
        const years: ClassYearGroup[] = Array.from(cls.years.entries())
          .sort((a, b) => (a[0] < b[0] ? 1 : -1))
          .map(([yearKey, monthMap]) => {
            const months: ClassMonthGroup[] = Array.from(monthMap.entries())
              .sort((a, b) => (a[0] < b[0] ? 1 : -1))
              .map(([monthKey, dayMap]) => {
                const monthIndex = Math.max(
                  0,
                  Math.min(11, Number(monthKey.split('-')[1] || '1') - 1)
                );
                const days: ClassDayGroup[] = Array.from(dayMap.entries())
                  .sort((a, b) => (a[0] < b[0] ? 1 : -1))
                  .map(([dayKey, items]) => {
                    const dateObj = new Date(`${dayKey}T12:00:00`);
                    const dayLabel = Number.isNaN(dateObj.getTime())
                      ? dayKey
                      : dateObj.toLocaleDateString('es-ES', {
                          weekday: 'short',
                          day: '2-digit',
                          month: 'short'
                        });

                    const attendees = items.flatMap(i => i.attendees);

                    return {
                      dayKey,
                      dayLabel,
                      sessions: items,
                      attendees,
                      collectedAmount: items.reduce((acc, i) => acc + i.collectedAmount, 0),
                      pendingAmount: items.reduce((acc, i) => acc + i.pendingAmount, 0)
                    };
                  });

                return {
                  monthKey,
                  monthLabel: `${MONTH_NAMES[monthIndex]} ${yearKey}`,
                  days,
                  sessionsCount: days.reduce((acc, d) => acc + d.sessions.length, 0),
                  collectedAmount: days.reduce((acc, d) => acc + d.collectedAmount, 0),
                  pendingAmount: days.reduce((acc, d) => acc + d.pendingAmount, 0)
                };
              });

            return {
              yearKey,
              months,
              sessionsCount: months.reduce((acc, m) => acc + m.sessionsCount, 0),
              collectedAmount: months.reduce((acc, m) => acc + m.collectedAmount, 0),
              pendingAmount: months.reduce((acc, m) => acc + m.pendingAmount, 0)
            };
          });

        return {
          classKey,
          activityName: cls.activityName,
          years,
          sessionsCount: years.reduce((acc, y) => acc + y.sessionsCount, 0),
          collectedAmount: years.reduce((acc, y) => acc + y.collectedAmount, 0),
          pendingAmount: years.reduce((acc, y) => acc + y.pendingAmount, 0)
        };
      })
      .sort((a, b) => a.activityName.localeCompare(b.activityName, 'es'));
  }, [sessionBreakdowns, selectedPeriod]);

  const totals = useMemo(() => {
    const totalCollected = sessionBreakdowns.reduce((acc, s) => acc + s.collectedAmount, 0);
    const totalPending = sessionBreakdowns.reduce((acc, s) => acc + s.pendingAmount, 0);
    return {
      totalCollected,
      totalPending,
      sessionsCount: sessionBreakdowns.length
    };
  }, [sessionBreakdowns]);

  const isYearExpanded = (yearKey: string) => Boolean(expandedYears[yearKey]);
  const isMonthExpanded = (monthKey: string) => Boolean(expandedMonths[monthKey]);
  const isDayExpanded = (dayKey: string) => Boolean(expandedDays[dayKey]);
  const isSessionExpanded = (sessionId: string) => Boolean(expandedSessions[sessionId]);

  const openSettleModal = (teacherId: string, suggestedAmount: number) => {
    if (!canViewPayouts) return;
    setSettlingTeacherId(teacherId);
    setSettleAmount(suggestedAmount > 0 ? suggestedAmount.toFixed(2) : '0.00');
    setSettleMethod('cash');
    setSettleNotes('');
  };

  const handleConfirmSettlement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canViewPayouts || !settlingTeacherId) return;
    const numericAmount = parseFloat(settleAmount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) return;

    setIsSubmittingPayout(true);
    try {
      await settleTeacherPayout(
        settlingTeacherId,
        selectedPeriod,
        numericAmount,
        settleMethod,
        settleNotes.trim() || undefined
      );
      setSettlingTeacherId(null);
    } finally {
      setIsSubmittingPayout(false);
    }
  };

  const teacherPayoutHistory = useMemo(() => {
    if (!canViewPayouts) return [];
    return payouts.filter(p => {
      if (effectiveTeacherId && effectiveTeacherId !== 'ALL' && p.teacherId !== effectiveTeacherId) {
        return false;
      }
      return true;
    });
  }, [canViewPayouts, payouts, effectiveTeacherId]);

  return (
    <div className="space-y-6">
      {/* Cabecera filtrada por el profesor */}
      <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">
              {canViewPayouts
                ? 'Mis sesiones y liquidaciones'
                : 'Sesiones y cobros por fecha'}
            </h2>
            {activeTeacher && (
              <span className="rounded-full bg-indigo-50 px-3 py-0.5 text-xs font-semibold text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300">
                {activeTeacher.name}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {canViewPayouts
              ? 'Desglose por Años o por Actividad con asistentes, pagos/deudas por alumno y liquidación del profesor.'
              : 'Desglose por Años o por Actividad con asistentes, importes recaudados y deudas pendientes por clase.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {isAdminRole && (
            <select
              value={selectedTeacherFilter}
              onChange={e => setSelectedTeacherFilter(e.target.value)}
              aria-label="Filtrar por profesor"
              className="rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 shadow-sm focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <option value="ALL">Todos los profesores</option>
              {teachers.map(t => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          )}

          {canViewPayouts && activeSummary && activeSummary.balanceToPay > 0 && (
            <button
              type="button"
              onClick={() =>
                openSettleModal(activeSummary.teacher.id, activeSummary.balanceToPay)
              }
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
            >
              <Wallet className="h-4 w-4" />
              Liquidar ({formatCurrency(activeSummary.balanceToPay)})
            </button>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div
        className={`grid grid-cols-2 gap-4 ${
          canViewPayouts ? 'xl:grid-cols-4' : 'sm:grid-cols-2'
        }`}
      >
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            <span>Recaudado en sesiones</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </div>
          <p className="mt-2 text-2xl font-bold text-emerald-600 dark:text-emerald-400">
            {formatCurrency(totals.totalCollected)}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            En {totals.sessionsCount} {totals.sessionsCount === 1 ? 'sesión' : 'sesiones'}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            <span>Deuda / pendiente de cobro</span>
            <Clock className="h-4 w-4 text-amber-500" />
          </div>
          <p className="mt-2 text-2xl font-bold text-amber-600 dark:text-amber-400">
            {formatCurrency(totals.totalPending)}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Importe pendiente por alumnos
          </p>
        </div>

        {canViewPayouts && activeSummary && (
          <>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <span>Devengado profesor</span>
                <Euro className="h-4 w-4 text-indigo-500" />
              </div>
              <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">
                {formatCurrency(activeSummary.calculatedDue)}
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Cobrado en mano: {formatCurrency(activeSummary.collectedInHand)}
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <span>Saldo de liquidación</span>
                <Wallet className="h-4 w-4 text-sky-500" />
              </div>
              <p className="mt-2 text-2xl font-bold text-sky-600 dark:text-sky-400">
                {formatCurrency(activeSummary.balanceToPay)}
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Ya liquidado: {formatCurrency(activeSummary.alreadySettled)}
              </p>
            </div>
          </>
        )}
      </div>

      {/* Cuadro principal 1: Por Años (Año -> Mes -> Día -> Clase -> Asistentes) */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <button
          type="button"
          onClick={() => setIsByYearsSectionOpen(prev => !prev)}
          className="flex w-full items-center gap-2.5 bg-slate-50 px-5 py-4 text-left transition hover:bg-slate-100/80 dark:bg-slate-800/60 dark:hover:bg-slate-800"
        >
          {isByYearsSectionOpen ? (
            <ChevronDown className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
          ) : (
            <ChevronRight className="h-5 w-5 text-slate-500" />
          )}
          <Calendar className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
          <span className="text-base font-bold text-slate-900 dark:text-white">
            Por Años
          </span>
        </button>

        {isByYearsSectionOpen && (
          <div className="space-y-4 border-t border-slate-200 p-4 dark:border-slate-800">
            {yearGroups.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/50 p-8 text-center dark:border-slate-700 dark:bg-slate-950/30">
                <Calendar className="mx-auto h-9 w-9 text-slate-400" />
                <p className="mt-2.5 text-sm font-semibold text-slate-700 dark:text-slate-200">
                  No hay sesiones registradas para este período
                </p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  No hay sesiones en el historial para los filtros seleccionados.
                </p>
              </div>
            ) : (
              yearGroups.map(yearGroup => {
                const yearOpen = isYearExpanded(yearGroup.yearKey);
                return (
                  <div
                    key={yearGroup.yearKey}
                    className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900"
                  >
                    {/* Nivel 1: Año */}
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedYears(prev => ({
                          ...prev,
                          [yearGroup.yearKey]: !yearOpen
                        }))
                      }
                      className="flex w-full items-center justify-between gap-4 bg-slate-100/80 px-5 py-3.5 text-left transition hover:bg-slate-100 dark:bg-slate-800/80 dark:hover:bg-slate-800"
                    >
                      <div className="flex items-center gap-2.5">
                        {yearOpen ? (
                          <ChevronDown className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                        ) : (
                          <ChevronRight className="h-5 w-5 text-slate-500" />
                        )}
                        <span className="text-base font-bold text-slate-900 dark:text-white">
                          Año {yearGroup.yearKey}
                        </span>
                        <span className="rounded-full bg-white px-2.5 py-0.5 text-xs font-medium text-slate-600 shadow-2xs dark:bg-slate-900 dark:text-slate-300">
                          {yearGroup.sessionsCount} sesiones
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-4 text-xs sm:text-sm">
                        <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                          Recaudado: {formatCurrency(yearGroup.collectedAmount)}
                        </span>
                        <span className="font-semibold text-amber-600 dark:text-amber-400">
                          Deuda: {formatCurrency(yearGroup.pendingAmount)}
                        </span>
                      </div>
                    </button>

                    {/* Nivel 2: Meses */}
                    {yearOpen && (
                      <div className="divide-y divide-slate-200 dark:divide-slate-800">
                        {yearGroup.months.map(monthGroup => {
                          const monthOpen = isMonthExpanded(monthGroup.monthKey);
                          return (
                            <div key={monthGroup.monthKey} className="bg-white dark:bg-slate-900">
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedMonths(prev => ({
                                    ...prev,
                                    [monthGroup.monthKey]: !monthOpen
                                  }))
                                }
                                className="flex w-full items-center justify-between gap-4 px-6 py-3 text-left transition hover:bg-slate-50 dark:hover:bg-slate-800/40"
                              >
                                <div className="flex items-center gap-2.5">
                                  {monthOpen ? (
                                    <ChevronDown className="h-4 w-4 text-indigo-500" />
                                  ) : (
                                    <ChevronRight className="h-4 w-4 text-slate-400" />
                                  )}
                                  <span className="font-semibold text-slate-800 dark:text-slate-100">
                                    {monthGroup.monthLabel}
                                  </span>
                                  <span className="text-xs text-slate-500 dark:text-slate-400">
                                    ({monthGroup.sessionsCount}{' '}
                                    {monthGroup.sessionsCount === 1 ? 'sesión' : 'sesiones'})
                                  </span>
                                </div>

                                <div className="flex flex-wrap items-center gap-4 text-xs sm:text-sm">
                                  <span className="font-medium text-emerald-600 dark:text-emerald-400">
                                    Cobrado: {formatCurrency(monthGroup.collectedAmount)}
                                  </span>
                                  <span className="font-medium text-amber-600 dark:text-amber-400">
                                    Deuda: {formatCurrency(monthGroup.pendingAmount)}
                                  </span>
                                </div>
                              </button>

                              {/* Nivel 3: Días */}
                              {monthOpen && (
                                <div className="space-y-2.5 bg-slate-50/50 px-6 pb-4 pt-1 dark:bg-slate-950/30">
                                  {monthGroup.days.map(dayGroup => {
                                    const dayOpen = isDayExpanded(dayGroup.dayKey);
                                    return (
                                      <div
                                        key={dayGroup.dayKey}
                                        className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
                                      >
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setExpandedDays(prev => ({
                                              ...prev,
                                              [dayGroup.dayKey]: !dayOpen
                                            }))
                                          }
                                          className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm transition hover:bg-slate-50 dark:hover:bg-slate-800/50"
                                        >
                                          <div className="flex items-center gap-2">
                                            {dayOpen ? (
                                              <ChevronDown className="h-4 w-4 text-slate-500" />
                                            ) : (
                                              <ChevronRight className="h-4 w-4 text-slate-400" />
                                            )}
                                            <span className="font-semibold capitalize text-slate-800 dark:text-slate-200">
                                              {dayGroup.dayLabel}
                                            </span>
                                            <span className="text-xs text-slate-400">
                                              ({dayGroup.dayKey}) · {dayGroup.sessions.length}{' '}
                                              {dayGroup.sessions.length === 1 ? 'clase' : 'clases'}
                                            </span>
                                          </div>

                                          <div className="flex items-center gap-3 text-xs">
                                            <span className="rounded-md bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                                              +{formatCurrency(dayGroup.collectedAmount)}
                                            </span>
                                            {dayGroup.pendingAmount > 0 && (
                                              <span className="rounded-md bg-amber-50 px-2 py-0.5 font-semibold text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
                                                Deuda {formatCurrency(dayGroup.pendingAmount)}
                                              </span>
                                            )}
                                          </div>
                                        </button>

                                        {/* Nivel 4: Sesiones del día */}
                                        {dayOpen && (
                                          <div className="divide-y divide-slate-100 border-t border-slate-100 dark:divide-slate-800 dark:border-slate-800">
                                            {dayGroup.sessions.map(item => {
                                              const sessionOpen = isSessionExpanded(item.session.id);
                                              return (
                                                <div
                                                  key={item.session.id}
                                                  className="bg-white dark:bg-slate-900"
                                                >
                                                  <button
                                                    type="button"
                                                    onClick={() =>
                                                      setExpandedSessions(prev => ({
                                                        ...prev,
                                                        [item.session.id]: !sessionOpen
                                                      }))
                                                    }
                                                    className="flex w-full flex-col gap-3 px-4 py-3 text-left transition hover:bg-slate-50/80 dark:hover:bg-slate-800/40 sm:flex-row sm:items-center sm:justify-between"
                                                  >
                                                    <div className="space-y-1">
                                                      <div className="flex flex-wrap items-center gap-2">
                                                        {sessionOpen ? (
                                                          <ChevronDown className="h-4 w-4 text-indigo-500" />
                                                        ) : (
                                                          <ChevronRight className="h-4 w-4 text-slate-400" />
                                                        )}
                                                        <BookOpen className="h-4 w-4 text-indigo-500" />
                                                        <span className="font-semibold text-slate-900 dark:text-white">
                                                          {item.activityName}
                                                        </span>
                                                        {item.session.isClosed && (
                                                          <span className="rounded-md bg-slate-200/80 px-2 py-0.5 text-[11px] font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                                                            Cerrada
                                                          </span>
                                                        )}
                                                      </div>

                                                      <div className="flex flex-wrap items-center gap-3 pl-6 text-xs text-slate-500 dark:text-slate-400">
                                                        <span className="inline-flex items-center gap-1">
                                                          <Users className="h-3.5 w-3.5" />
                                                          {item.attendees.length > 0
                                                            ? `${item.attendees.length} alumnos`
                                                            : `${item.session.attendeesCount} asistentes`}
                                                        </span>
                                                        <span>· {item.session.durationMinutes} min</span>
                                                        {item.session.topic && (
                                                          <span>· Tema: {item.session.topic}</span>
                                                        )}
                                                      </div>
                                                    </div>

                                                    <div className="flex flex-wrap items-center gap-4 pl-6 text-xs sm:pl-0 sm:text-sm">
                                                      <div className="text-right">
                                                        <span className="block text-[11px] text-slate-400">
                                                          Pagado
                                                        </span>
                                                        <span className="font-bold text-emerald-600 dark:text-emerald-400">
                                                          {formatCurrency(item.collectedAmount)}
                                                        </span>
                                                      </div>

                                                      <div className="text-right">
                                                        <span className="block text-[11px] text-slate-400">
                                                          Deuda
                                                        </span>
                                                        <span className="font-bold text-amber-600 dark:text-amber-400">
                                                          {formatCurrency(item.pendingAmount)}
                                                        </span>
                                                      </div>
                                                    </div>
                                                  </button>

                                                  {/* Nivel 5: Asistentes de la clase con su pago y deuda */}
                                                  {sessionOpen && (
                                                    <div className="border-t border-slate-100 bg-slate-50/70 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/40">
                                                      {item.attendees.length === 0 ? (
                                                        <p className="text-xs text-slate-500 dark:text-slate-400">
                                                          No hay registros de asistentes asociados a esta clase.
                                                        </p>
                                                      ) : (
                                                        <div className="divide-y divide-slate-200/80 rounded-xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
                                                          {item.attendees.map(att => {
                                                            const isAbsent =
                                                              att.attendance === 'absent';
                                                            return (
                                                              <div
                                                                key={att.studentId}
                                                                className="flex flex-col gap-2 px-3.5 py-2 text-xs sm:flex-row sm:items-center sm:justify-between sm:text-sm"
                                                              >
                                                                <div className="flex items-center gap-2">
                                                                  {isAbsent ? (
                                                                    <UserX className="h-4 w-4 text-rose-500" />
                                                                  ) : (
                                                                    <UserCheck className="h-4 w-4 text-emerald-500" />
                                                                  )}
                                                                  <span className="font-medium text-slate-800 dark:text-slate-100">
                                                                    {att.studentName}
                                                                  </span>
                                                                  <span
                                                                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                                                                      isAbsent
                                                                        ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300'
                                                                        : att.attendance === 'late'
                                                                        ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300'
                                                                        : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
                                                                    }`}
                                                                  >
                                                                    {isAbsent
                                                                      ? 'Falta'
                                                                      : att.attendance === 'late'
                                                                      ? 'Retraso'
                                                                      : 'Asiste'}
                                                                  </span>
                                                                  {att.paymentMethod &&
                                                                    att.paidAmount > 0 && (
                                                                      <span className="text-xs text-slate-400">
                                                                        (
                                                                        {
                                                                          PAYMENT_METHOD_LABELS[
                                                                            att.paymentMethod
                                                                          ]
                                                                        }
                                                                        )
                                                                      </span>
                                                                    )}
                                                                </div>

                                                                <div className="flex items-center gap-4 text-xs sm:text-sm">
                                                                  <span>
                                                                    <span className="text-slate-400">
                                                                      Pagado:{' '}
                                                                    </span>
                                                                    <strong className="text-emerald-600 dark:text-emerald-400">
                                                                      {formatCurrency(
                                                                        att.paidAmount
                                                                      )}
                                                                    </strong>
                                                                  </span>
                                                                  <span>
                                                                    <span className="text-slate-400">
                                                                      Debe:{' '}
                                                                    </span>
                                                                    <strong
                                                                      className={
                                                                        att.debtAmount > 0
                                                                          ? 'text-amber-600 dark:text-amber-400'
                                                                          : 'text-slate-500 dark:text-slate-400'
                                                                      }
                                                                    >
                                                                      {formatCurrency(
                                                                        att.debtAmount
                                                                      )}
                                                                    </strong>
                                                                  </span>
                                                                </div>
                                                              </div>
                                                            );
                                                          })}
                                                        </div>
                                                      )}
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
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* Cuadro principal 2: Por Actividad (Actividad -> Año -> Mes -> Día -> Asistentes) */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <button
          type="button"
          onClick={() => setIsByActivitySectionOpen(prev => !prev)}
          className="flex w-full items-center gap-2.5 bg-slate-50 px-5 py-4 text-left transition hover:bg-slate-100/80 dark:bg-slate-800/60 dark:hover:bg-slate-800"
        >
          {isByActivitySectionOpen ? (
            <ChevronDown className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
          ) : (
            <ChevronRight className="h-5 w-5 text-slate-500" />
          )}
          <BookOpen className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
          <span className="text-base font-bold text-slate-900 dark:text-white">
            Por Actividad
          </span>
        </button>

        {isByActivitySectionOpen && (
          <div className="space-y-4 border-t border-slate-200 p-4 dark:border-slate-800">
            {classGroups.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/50 p-8 text-center dark:border-slate-700 dark:bg-slate-950/30">
                <BookOpen className="mx-auto h-9 w-9 text-slate-400" />
                <p className="mt-2.5 text-sm font-semibold text-slate-700 dark:text-slate-200">
                  No hay actividades registradas
                </p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  No hay sesiones en el historial para los filtros seleccionados.
                </p>
              </div>
            ) : (
              classGroups.map(clsGroup => {
                const clsOpen = Boolean(expandedClassNodes[clsGroup.classKey]);
                return (
                  <div
                    key={clsGroup.classKey}
                    className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900"
                  >
                    {/* Nivel 1: Actividad */}
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedClassNodes(prev => ({
                          ...prev,
                          [clsGroup.classKey]: !clsOpen
                        }))
                      }
                      className="flex w-full items-center justify-between gap-4 bg-indigo-50/60 px-5 py-3.5 text-left transition hover:bg-indigo-50 dark:bg-indigo-950/30 dark:hover:bg-indigo-950/50"
                    >
                      <div className="flex items-center gap-2.5">
                        {clsOpen ? (
                          <ChevronDown className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                        ) : (
                          <ChevronRight className="h-5 w-5 text-slate-500" />
                        )}
                        <BookOpen className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                        <span className="text-base font-bold text-slate-900 dark:text-white">
                          {clsGroup.activityName}
                        </span>
                        <span className="rounded-full bg-white px-2.5 py-0.5 text-xs font-medium text-slate-600 shadow-2xs dark:bg-slate-900 dark:text-slate-300">
                          {clsGroup.sessionsCount}{' '}
                          {clsGroup.sessionsCount === 1 ? 'sesión' : 'sesiones'}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-4 text-xs sm:text-sm">
                        <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                          Recaudado: {formatCurrency(clsGroup.collectedAmount)}
                        </span>
                        <span className="font-semibold text-amber-600 dark:text-amber-400">
                          Deuda: {formatCurrency(clsGroup.pendingAmount)}
                        </span>
                      </div>
                    </button>

                    {/* Nivel 2: Año */}
                    {clsOpen && (
                      <div className="divide-y divide-slate-200 dark:divide-slate-800">
                        {clsGroup.years.map(yGroup => {
                          const yKey = `${clsGroup.classKey}__${yGroup.yearKey}`;
                          const yOpen = Boolean(expandedClassYears[yKey]);
                          return (
                            <div key={yKey} className="bg-white dark:bg-slate-900">
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedClassYears(prev => ({
                                    ...prev,
                                    [yKey]: !yOpen
                                  }))
                                }
                                className="flex w-full items-center justify-between gap-4 px-6 py-3 text-left transition hover:bg-slate-50 dark:hover:bg-slate-800/40"
                              >
                                <div className="flex items-center gap-2.5">
                                  {yOpen ? (
                                    <ChevronDown className="h-4 w-4 text-indigo-500" />
                                  ) : (
                                    <ChevronRight className="h-4 w-4 text-slate-400" />
                                  )}
                                  <span className="font-semibold text-slate-800 dark:text-slate-100">
                                    Año {yGroup.yearKey}
                                  </span>
                                  <span className="text-xs text-slate-500 dark:text-slate-400">
                                    ({yGroup.sessionsCount}{' '}
                                    {yGroup.sessionsCount === 1 ? 'sesión' : 'sesiones'})
                                  </span>
                                </div>

                                <div className="flex flex-wrap items-center gap-4 text-xs sm:text-sm">
                                  <span className="font-medium text-emerald-600 dark:text-emerald-400">
                                    Cobrado: {formatCurrency(yGroup.collectedAmount)}
                                  </span>
                                  <span className="font-medium text-amber-600 dark:text-amber-400">
                                    Deuda: {formatCurrency(yGroup.pendingAmount)}
                                  </span>
                                </div>
                              </button>

                              {/* Nivel 3: Mes */}
                              {yOpen && (
                                <div className="divide-y divide-slate-100 border-t border-slate-100 bg-slate-50/40 px-6 py-2 dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-950/30">
                                  {yGroup.months.map(mGroup => {
                                    const mKey = `${yKey}__${mGroup.monthKey}`;
                                    const mOpen = Boolean(expandedClassMonths[mKey]);
                                    return (
                                      <div key={mKey} className="py-1.5">
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setExpandedClassMonths(prev => ({
                                              ...prev,
                                              [mKey]: !mOpen
                                            }))
                                          }
                                          className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-left text-sm transition hover:bg-slate-100/70 dark:hover:bg-slate-800/50"
                                        >
                                          <div className="flex items-center gap-2">
                                            {mOpen ? (
                                              <ChevronDown className="h-4 w-4 text-indigo-500" />
                                            ) : (
                                              <ChevronRight className="h-4 w-4 text-slate-400" />
                                            )}
                                            <span className="font-medium text-slate-800 dark:text-slate-200">
                                              {mGroup.monthLabel}
                                            </span>
                                            <span className="text-xs text-slate-400">
                                              ({mGroup.sessionsCount})
                                            </span>
                                          </div>

                                          <div className="flex items-center gap-3 text-xs">
                                            <span className="font-medium text-emerald-600 dark:text-emerald-400">
                                              Cobrado: {formatCurrency(mGroup.collectedAmount)}
                                            </span>
                                            <span className="font-medium text-amber-600 dark:text-amber-400">
                                              Deuda: {formatCurrency(mGroup.pendingAmount)}
                                            </span>
                                          </div>
                                        </button>

                                        {/* Nivel 4: Día -> Nivel 5: Asistentes */}
                                        {mOpen && (
                                          <div className="mt-2 space-y-2 pl-4">
                                            {mGroup.days.map(dGroup => {
                                              const dKey = `${mKey}__${dGroup.dayKey}`;
                                              const dOpen = Boolean(expandedClassDays[dKey]);
                                              return (
                                                <div
                                                  key={dKey}
                                                  className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
                                                >
                                                  <button
                                                    type="button"
                                                    onClick={() =>
                                                      setExpandedClassDays(prev => ({
                                                        ...prev,
                                                        [dKey]: !dOpen
                                                      }))
                                                    }
                                                    className="flex w-full items-center justify-between gap-3 px-3.5 py-2 text-left text-xs transition hover:bg-slate-50 dark:hover:bg-slate-800/50 sm:text-sm"
                                                  >
                                                    <div className="flex items-center gap-2">
                                                      {dOpen ? (
                                                        <ChevronDown className="h-4 w-4 text-slate-500" />
                                                      ) : (
                                                        <ChevronRight className="h-4 w-4 text-slate-400" />
                                                      )}
                                                      <span className="font-semibold capitalize text-slate-800 dark:text-slate-200">
                                                        {dGroup.dayLabel}
                                                      </span>
                                                      <span className="text-xs text-slate-400">
                                                        ({dGroup.dayKey} · {dGroup.attendees.length}{' '}
                                                        {dGroup.attendees.length === 1
                                                          ? 'asistente'
                                                          : 'asistentes'})
                                                      </span>
                                                    </div>

                                                    <div className="flex items-center gap-2 text-xs">
                                                      <span className="rounded-md bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                                                        +{formatCurrency(dGroup.collectedAmount)}
                                                      </span>
                                                      {dGroup.pendingAmount > 0 && (
                                                        <span className="rounded-md bg-amber-50 px-2 py-0.5 font-semibold text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
                                                          Deuda {formatCurrency(dGroup.pendingAmount)}
                                                        </span>
                                                      )}
                                                    </div>
                                                  </button>

                                                  {dOpen && (
                                                    <div className="border-t border-slate-100 bg-slate-50/70 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/40">
                                                      {dGroup.attendees.length === 0 ? (
                                                        <p className="text-xs text-slate-500 dark:text-slate-400">
                                                          No hay registros de asistentes para este día.
                                                        </p>
                                                      ) : (
                                                        <div className="divide-y divide-slate-200/80 rounded-xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
                                                          {dGroup.attendees.map((att, idx) => {
                                                            const isAbsent =
                                                              att.attendance === 'absent';
                                                            return (
                                                              <div
                                                                key={`${att.studentId}-${idx}`}
                                                                className="flex flex-col gap-2 px-3.5 py-2 text-xs sm:flex-row sm:items-center sm:justify-between sm:text-sm"
                                                              >
                                                                <div className="flex items-center gap-2">
                                                                  {isAbsent ? (
                                                                    <UserX className="h-4 w-4 text-rose-500" />
                                                                  ) : (
                                                                    <UserCheck className="h-4 w-4 text-emerald-500" />
                                                                  )}
                                                                  <span className="font-medium text-slate-800 dark:text-slate-100">
                                                                    {att.studentName}
                                                                  </span>
                                                                  <span
                                                                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                                                                      isAbsent
                                                                        ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300'
                                                                        : att.attendance === 'late'
                                                                        ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300'
                                                                        : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
                                                                    }`}
                                                                  >
                                                                    {isAbsent
                                                                      ? 'Falta'
                                                                      : att.attendance === 'late'
                                                                      ? 'Retraso'
                                                                      : 'Asiste'}
                                                                  </span>
                                                                  {att.paymentMethod &&
                                                                    att.paidAmount > 0 && (
                                                                      <span className="text-xs text-slate-400">
                                                                        (
                                                                        {
                                                                          PAYMENT_METHOD_LABELS[
                                                                            att.paymentMethod
                                                                          ]
                                                                        }
                                                                        )
                                                                      </span>
                                                                    )}
                                                                </div>

                                                                <div className="flex items-center gap-4 text-xs sm:text-sm">
                                                                  <span>
                                                                    <span className="text-slate-400">
                                                                      Pagado:{' '}
                                                                    </span>
                                                                    <strong className="text-emerald-600 dark:text-emerald-400">
                                                                      {formatCurrency(
                                                                        att.paidAmount
                                                                      )}
                                                                    </strong>
                                                                  </span>
                                                                  <span>
                                                                    <span className="text-slate-400">
                                                                      Debe:{' '}
                                                                    </span>
                                                                    <strong
                                                                      className={
                                                                        att.debtAmount > 0
                                                                          ? 'text-amber-600 dark:text-amber-400'
                                                                          : 'text-slate-500 dark:text-slate-400'
                                                                      }
                                                                    >
                                                                      {formatCurrency(
                                                                        att.debtAmount
                                                                      )}
                                                                    </strong>
                                                                  </span>
                                                                </div>
                                                              </div>
                                                            );
                                                          })}
                                                        </div>
                                                      )}
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
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* Historial de liquidaciones registradas: exclusivo para el profesor */}
      {canViewPayouts && teacherPayoutHistory.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-2 border-b border-slate-200 px-5 py-3.5 dark:border-slate-800">
            <FileCheck2 className="h-4 w-4 text-emerald-500" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
              Mis liquidaciones registradas
            </h3>
          </div>
          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {teacherPayoutHistory.map(payout => (
              <div
                key={payout.id}
                className="flex flex-col gap-2 px-5 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <span className="font-semibold text-slate-900 dark:text-white">
                    {activeTeacher?.name || 'Profesor'}
                  </span>
                  <span className="ml-2 text-xs text-slate-500 dark:text-slate-400">
                    Período {payout.periodMonth}
                    {payout.settledDate ? ` · Fecha ${payout.settledDate}` : ''}
                    {payout.paymentMethod
                      ? ` · ${PAYMENT_METHOD_LABELS[payout.paymentMethod]}`
                      : ''}
                  </span>
                  {payout.notes && (
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      {payout.notes}
                    </p>
                  )}
                </div>
                <span className="font-bold text-emerald-600 dark:text-emerald-400">
                  {formatCurrency(payout.totalSettled)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal de liquidación: solo accesible si canViewPayouts es true */}
      {canViewPayouts && settlingTeacherId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                Registrar liquidación
              </h3>
              <button
                type="button"
                onClick={() => setSettlingTeacherId(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmSettlement} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">
                  Importe a liquidar (€)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={settleAmount}
                  onChange={e => setSettleAmount(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">
                  Método de pago
                </label>
                <div className="mt-1.5 grid grid-cols-3 gap-2">
                  {(
                    [
                      { id: 'cash', label: 'Efectivo', icon: Banknote },
                      { id: 'transfer', label: 'Transferencia', icon: Building2 },
                      { id: 'bizum', label: 'Bizum', icon: CreditCard }
                    ] as const
                  ).map(({ id, label, icon: Icon }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setSettleMethod(id)}
                      className={`flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                        settleMethod === id
                          ? 'border-indigo-600 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300'
                          : 'border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">
                  Notas (opcional)
                </label>
                <input
                  type="text"
                  value={settleNotes}
                  onChange={e => setSettleNotes(e.target.value)}
                  placeholder="Ej. Liquidación mensual"
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSettlingTeacherId(null)}
                  className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingPayout}
                  className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {isSubmittingPayout ? 'Guardando...' : 'Confirmar liquidación'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default TeacherPayoutsView;