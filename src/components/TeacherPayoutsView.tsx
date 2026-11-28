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
  UserX,
  CircleDollarSign,
  Lock,
  Pencil,
  RotateCcw,
  Check,
  Loader2,
  Trash2,
  AlertTriangle
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useAcademyData } from '../context/AcademyDataContext';
import { useFinance } from '../context/FinanceContext';
import {
  calculatePartialDefaultAmount,
  isPendingDebtStatus,
  resolveEnrollmentFee
} from '../lib/billing';
import { createTranslator } from '../lib/i18n';
import { getMadridDateIso } from '../lib/date';
import {
  ClassSession,
  PaymentMethod,
  PaymentRecord,
  PaymentStatus,
  Student,
  UserRole
} from '../types';
import { StudentNameButton } from './ContactQuickActions';

const PAYMENT_STATUS_ORDER: PaymentStatus[] = [
  'paid',
  'partial',
  'exempt',
  'overdue',
  'pending',
  'cancelled'
];

interface AttendeePaymentRow {
  studentId: string;
  studentName: string;
  attendance: 'present' | 'absent' | 'late' | string;
  paidAmount: number;
  debtAmount: number;
  isPaid: boolean;
  paymentMethod?: PaymentMethod;
  paymentStatus?: PaymentStatus;
  paymentId?: string;
  matchedPayment?: PaymentRecord;
  expectedPrice: number;
  hasSessionRecordPaidFlag?: boolean;
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
  dayKey: string;
  dayLabel: string;
  sessions: SessionBreakdown[];
  collectedAmount: number;
  pendingAmount: number;
  teacherShareAmount: number;
}

interface MonthGroup {
  monthKey: string;
  monthLabel: string;
  days: DayGroup[];
  sessionsCount: number;
  collectedAmount: number;
  pendingAmount: number;
  teacherShareAmount: number;
}

interface YearGroup {
  yearKey: string;
  months: MonthGroup[];
  sessionsCount: number;
  collectedAmount: number;
  pendingAmount: number;
  teacherShareAmount: number;
}

interface ClassDayGroup {
  dayKey: string;
  dayLabel: string;
  sessions: SessionBreakdown[];
  attendees: AttendeePaymentRow[];
  collectedAmount: number;
  pendingAmount: number;
}

interface ClassMonthGroup {
  monthKey: string;
  monthLabel: string;
  days: ClassDayGroup[];
  sessionsCount: number;
  collectedAmount: number;
  pendingAmount: number;
}

interface ClassYearGroup {
  yearKey: string;
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

interface AttendeeDayRecord {
  dayKey: string;
  dayLabel: string;
  activityName: string;
  attendance: 'present' | 'absent' | 'late' | string;
  paidAmount: number;
  debtAmount: number;
  paymentMethod?: PaymentMethod;
  topic?: string;
}

interface AttendeeMonthGroup {
  monthKey: string;
  monthLabel: string;
  days: AttendeeDayRecord[];
  sessionsCount: number;
  collectedAmount: number;
  pendingAmount: number;
}

interface AttendeeYearGroup {
  yearKey: string;
  months: AttendeeMonthGroup[];
  sessionsCount: number;
  collectedAmount: number;
  pendingAmount: number;
}

interface AttendeeActivityGroup {
  activityKey: string;
  activityName: string;
  years: AttendeeYearGroup[];
  sessionsCount: number;
  collectedAmount: number;
  pendingAmount: number;
}

interface AttendeeTreeGroup {
  studentKey: string;
  studentName: string;
  activities: AttendeeActivityGroup[];
  sessionsCount: number;
  collectedAmount: number;
  pendingAmount: number;
}

type PaymentBucketKey = 'paid' | 'pending';

interface PaymentDayRecord {
  dayKey: string;
  dayLabel: string;
  activityName: string;
  attendance: 'present' | 'absent' | 'late' | string;
  paidAmount: number;
  debtAmount: number;
  paymentMethod?: PaymentMethod;
  topic?: string;
}

interface PaymentMonthGroup {
  monthKey: string;
  monthLabel: string;
  days: PaymentDayRecord[];
  sessionsCount: number;
  collectedAmount: number;
  pendingAmount: number;
}

interface PaymentYearGroup {
  yearKey: string;
  months: PaymentMonthGroup[];
  sessionsCount: number;
  collectedAmount: number;
  pendingAmount: number;
}

interface PaymentActivityGroup {
  activityKey: string;
  activityName: string;
  years: PaymentYearGroup[];
  sessionsCount: number;
  collectedAmount: number;
  pendingAmount: number;
}

interface PaymentAttendeeGroup {
  studentKey: string;
  studentName: string;
  activities: PaymentActivityGroup[];
  sessionsCount: number;
  collectedAmount: number;
  pendingAmount: number;
}

interface PaymentStatusGroup {
  statusKey: PaymentBucketKey;
  label: string;
  attendees: PaymentAttendeeGroup[];
  sessionsCount: number;
  collectedAmount: number;
  pendingAmount: number;
}

function formatCurrency(amount: number, locale = 'es-ES'): string {
  return new Intl.NumberFormat(locale, {
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
  const { currentRole, currentUser, currentTeacherId, language } = useAuth();
  const { teachers, activities, students, sessions, upsertSessionAttendance } = useAcademyData();
  const {
    selectedPeriod,
    payments,
    payouts,
    teacherSummaries,
    settleTeacherPayout,
    recordClassPayment,
    updatePayment,
    deletePayment
  } = useFinance();

  const t = createTranslator(language);
  const currentLocale =
    language === 'en' ? 'en-GB' : language === 'gl' ? 'gl-ES' : 'es-ES';

  const paymentMethodLabels: Record<PaymentMethod, string> = useMemo(
    () => ({
      cash: t('teacherPayouts.paymentCash'),
      bizum: t('teacherPayouts.paymentBizum'),
      transfer: t('teacherPayouts.paymentTransfer'),
      card: t('teacherPayouts.paymentCard'),
      other: t('teacherPayouts.paymentOther')
    }),
    [t]
  );

  const roleStr = String(currentRole).toLowerCase();
  const isAdminRole = currentRole === UserRole.Admin || roleStr === 'admin';
  const isTeacherRole =
    currentRole === UserRole.Monitor ||
    currentRole === UserRole.Hibrido ||
    roleStr === 'monitor' ||
    roleStr === 'hibrido' ||
    roleStr === 'híbrido';

  const [selectedTeacherFilter, setSelectedTeacherFilter] = useState<string>('ALL');

  const studentLookup = useMemo(() => {
    const byId = new Map<string, Student>();
    const byName = new Map<string, Student>();
    for (const st of students) {
      byId.set(st.id, st);
      const normName = (st.name || '').trim().toLowerCase();
      if (normName && !byName.has(normName)) {
        byName.set(normName, st);
      }
    }
    return { byId, byName };
  }, [students]);

  const getStudentContact = (studentIdOrKey?: string, studentName?: string) => {
    if (studentIdOrKey) {
      const byId = studentLookup.byId.get(studentIdOrKey);
      if (byId) return byId;
    }
    const normName = (studentName || '').trim().toLowerCase();
    if (normName) {
      return studentLookup.byName.get(normName);
    }
    return undefined;
  };

  const [isByYearsSectionOpen, setIsByYearsSectionOpen] = useState<boolean>(false);
  const [isByActivitySectionOpen, setIsByActivitySectionOpen] = useState<boolean>(false);
  const [isByAttendeeSectionOpen, setIsByAttendeeSectionOpen] = useState<boolean>(false);
  const [isByPaymentsSectionOpen, setIsByPaymentsSectionOpen] = useState<boolean>(false);

  const [expandedYears, setExpandedYears] = useState<Record<string, boolean>>({});
  const [expandedMonths, setExpandedMonths] = useState<Record<string, boolean>>({});
  const [expandedDays, setExpandedDays] = useState<Record<string, boolean>>({});
  const [expandedSessions, setExpandedSessions] = useState<Record<string, boolean>>({});

  const [expandedClassNodes, setExpandedClassNodes] = useState<Record<string, boolean>>({});
  const [expandedClassYears, setExpandedClassYears] = useState<Record<string, boolean>>({});
  const [expandedClassMonths, setExpandedClassMonths] = useState<Record<string, boolean>>({});
  const [expandedClassDays, setExpandedClassDays] = useState<Record<string, boolean>>({});

  const [expandedAttendeeNodes, setExpandedAttendeeNodes] = useState<Record<string, boolean>>({});
  const [expandedAttendeeActivities, setExpandedAttendeeActivities] = useState<
    Record<string, boolean>
  >({});
  const [expandedAttendeeYears, setExpandedAttendeeYears] = useState<Record<string, boolean>>({});
  const [expandedAttendeeMonths, setExpandedAttendeeMonths] = useState<Record<string, boolean>>(
    {}
  );

  const [expandedPaymentStatuses, setExpandedPaymentStatuses] = useState<Record<string, boolean>>(
    {}
  );
  const [expandedPaymentAttendees, setExpandedPaymentAttendees] = useState<Record<string, boolean>>(
    {}
  );
  const [expandedPaymentActivities, setExpandedPaymentActivities] = useState<
    Record<string, boolean>
  >({});
  const [expandedPaymentYears, setExpandedPaymentYears] = useState<Record<string, boolean>>({});
  const [expandedPaymentMonths, setExpandedPaymentMonths] = useState<Record<string, boolean>>({});

  const [settlingTeacherId, setSettlingTeacherId] = useState<string | null>(null);
  const [settleAmount, setSettleAmount] = useState<string>('0');
  const [settleMethod, setSettleMethod] = useState<PaymentMethod>('cash');
  const [settleNotes, setSettleNotes] = useState<string>('');
  const [isSubmittingPayout, setIsSubmittingPayout] = useState<boolean>(false);

  const [editingPaymentKey, setEditingPaymentKey] = useState<string | null>(null);
  const [editStatus, setEditStatus] = useState<PaymentStatus>('paid');
  const [editMethod, setEditMethod] = useState<PaymentMethod>('cash');
  const [editAmount, setEditAmount] = useState<string>('0.00');
  const [editNotes, setEditNotes] = useState<string>('');
  const [editCollectedByTeacher, setEditCollectedByTeacher] = useState<boolean>(true);
  const [paymentBusyKey, setPaymentBusyKey] = useState<string | null>(null);
  const [paymentError, setPaymentError] = useState<{ key: string; message: string } | null>(null);
  const [confirmDeleteTarget, setConfirmDeleteTarget] = useState<{
    session: ClassSession;
    activityName: string;
    attendee: AttendeePaymentRow;
  } | null>(null);
  const [isDeletingPayment, setIsDeletingPayment] = useState<boolean>(false);

  const formatMonthLabel = (yearKey: string, monthStr: string) => {
    const monthIndex = Math.max(0, Math.min(11, Number(monthStr || '1') - 1));
    const dateObj = new Date(Number(yearKey) || 2026, monthIndex, 15);
    const monthName = dateObj.toLocaleDateString(currentLocale, { month: 'long' });
    const capitalized = monthName.charAt(0).toUpperCase() + monthName.slice(1);
    return `${capitalized} ${yearKey}`;
  };

  const formatDayLabel = (dayKey: string) => {
    const dateObj = new Date(`${dayKey}T12:00:00`);
    return Number.isNaN(dateObj.getTime())
      ? dayKey
      : dateObj.toLocaleDateString(currentLocale, {
          weekday: 'short',
          day: '2-digit',
          month: 'short'
        });
  };

  const effectiveTeacherId = useMemo(() => {
    if (isTeacherRole) {
      const matched = currentUser
        ? teachers.find(
            tc =>
              (currentUser.teacherId && tc.id === currentUser.teacherId) ||
              (currentUser.email &&
                tc.email.trim().toLowerCase() === currentUser.email.trim().toLowerCase())
          )?.id
        : undefined;
      return matched || currentTeacherId || '';
    }
    return selectedTeacherFilter;
  }, [isTeacherRole, currentUser, currentTeacherId, teachers, selectedTeacherFilter]);

  const activeTeacher = useMemo(
    () => teachers.find(tc => tc.id === effectiveTeacherId) || null,
    [teachers, effectiveTeacherId]
  );

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
      const teacher = teachers.find(tc => tc.id === session.teacherId);
      const defaultRate =
        activity?.billingMode === 'per_class'
          ? activity.defaultPricePerClass || activity.defaultPriceMonthly || 0
          : activity?.defaultPricePerClass ||
            (activity?.defaultPriceMonthly ? activity.defaultPriceMonthly / 4 : 0);

      const sessionMonth = session.date?.slice(0, 7) || selectedPeriod;
      const sessionDateClean = session.date?.slice(0, 10) || '';
      const isMonthlyActivity = activity?.billingMode === 'monthly';

      const findMatchedPayment = (studentId: string, recPaymentId?: string): PaymentRecord | undefined => {
        if (recPaymentId) {
          const directMatch = payments.find(
            p => p.id === recPaymentId && p.activityId === session.activityId
          );
          if (directMatch) return directMatch;
        }
        const matchesScope = (p: PaymentRecord) =>
          p.studentId === studentId &&
          p.activityId === session.activityId &&
          (isMonthlyActivity
            ? p.periodMonth === sessionMonth ||
              (!p.periodMonth && p.paymentDate?.slice(0, 10) === sessionDateClean)
            : p.paymentDate?.slice(0, 10) === sessionDateClean);

        for (const status of PAYMENT_STATUS_ORDER) {
          const hit = payments.find(p => matchesScope(p) && p.status === status);
          if (hit) return hit;
        }
        return payments.find(matchesScope);
      };

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
          const studentName =
            rec.studentName || studentObj?.name || t('teacherPayouts.defaultStudent');
          const enrollment = studentObj?.activities.find(
            enr => enr.activityId === session.activityId
          );

          const expectedStudentPrice = resolveEnrollmentFee(enrollment, activity, defaultRate);

          const matchedPayment = findMatchedPayment(rec.studentId, rec.paymentId);

          let rowPaid = 0;
          let rowDebt = 0;
          let rowIsPaid = false;
          let rowPaymentStatus: PaymentStatus | undefined = matchedPayment?.status;

          if (matchedPayment) {
            if (matchedPayment.status === 'paid') {
              rowPaid = getPaymentRecordAmount(matchedPayment, expectedStudentPrice);
              rowDebt = 0;
              rowIsPaid = true;

              if (rec.attendance !== 'absent') {
                collectedAmount += rowPaid;
                if (matchedPayment.collectedByTeacher !== false) {
                  collectedInHandAmount += rowPaid;
                }
                paidCount += 1;
              }
            } else if (matchedPayment.status === 'partial') {
              rowPaid = getPaymentRecordAmount(matchedPayment, expectedStudentPrice * 0.5);
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
              matchedPayment.status === 'pending' ||
              matchedPayment.status === 'overdue'
            ) {
              rowPaid = 0;
              rowDebt = getPaymentRecordAmount(matchedPayment, expectedStudentPrice);
              rowIsPaid = false;

              if (rec.attendance !== 'absent') {
                pendingAmount += rowDebt;
              }
            } else if (
              matchedPayment.status === 'exempt' ||
              matchedPayment.status === 'cancelled'
            ) {
              rowPaid = 0;
              rowDebt = 0;
              rowIsPaid = false;
            }
          } else if (rec.paid) {
            rowPaid =
              typeof rec.paidAmount === 'number' && rec.paidAmount > 0
                ? rec.paidAmount
                : expectedStudentPrice;
            rowDebt = 0;
            rowIsPaid = true;
            rowPaymentStatus = 'paid';

            if (rec.attendance !== 'absent') {
              collectedAmount += rowPaid;
              collectedInHandAmount += rowPaid;
              paidCount += 1;
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
            paymentMethod: matchedPayment?.paymentMethod || rec.paymentMethod,
            paymentStatus: rowPaymentStatus,
            paymentId: matchedPayment?.id || rec.paymentId,
            matchedPayment,
            expectedPrice: expectedStudentPrice,
            hasSessionRecordPaidFlag: Boolean(rec.paid && !matchedPayment)
          });
        }
      } else {
        for (const st of activeStudentsForActivity) {
          const enrollment = st.activities.find(enr => enr.activityId === session.activityId);
          const expectedStudentPrice = resolveEnrollmentFee(enrollment, activity, defaultRate);
          const matchedPayment = findMatchedPayment(st.id);

          let rowPaid = 0;
          let rowDebt = 0;
          let rowIsPaid = false;
          const rowPaymentStatus: PaymentStatus | undefined = matchedPayment?.status;

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
          } else if (
            !matchedPayment &&
            activity?.billingMode === 'per_class'
          ) {
            rowPaid = 0;
            rowDebt = expectedStudentPrice;
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
            paymentMethod: matchedPayment?.paymentMethod,
            paymentStatus: rowPaymentStatus,
            paymentId: matchedPayment?.id,
            matchedPayment,
            expectedPrice: expectedStudentPrice,
            hasSessionRecordPaidFlag: false
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
        activityName: activity?.name || t('teacherPayouts.defaultActivity'),
        teacherName: teacher?.name || t('teacherPayouts.defaultTeacher'),
        collectedAmount,
        collectedInHandAmount,
        pendingAmount,
        paidCount,
        totalTrackedStudents: trackedCount,
        estimatedTeacherShare,
        attendees
      };
    });
  }, [filteredSessions, activities, teachers, payments, students, selectedPeriod, t]);

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
            const monthStr = monthKey.split('-')[1] || '01';
            const days: DayGroup[] = Array.from(dayMap.entries())
              .sort((a, b) => (a[0] < b[0] ? 1 : -1))
              .map(([dayKey, items]) => ({
                dayKey,
                dayLabel: formatDayLabel(dayKey),
                sessions: items,
                collectedAmount: items.reduce((acc, i) => acc + i.collectedAmount, 0),
                pendingAmount: items.reduce((acc, i) => acc + i.pendingAmount, 0),
                teacherShareAmount: items.reduce((acc, i) => acc + i.estimatedTeacherShare, 0)
              }));

            return {
              monthKey,
              monthLabel: formatMonthLabel(yearKey, monthStr),
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
  }, [sessionBreakdowns, selectedPeriod, currentLocale]);

  const classGroups = useMemo<ClassTreeGroup[]>(() => {
    type DayBucket = SessionBreakdown[];
    type MonthBucket = Map<string, DayBucket>;
    type YearBucket = Map<string, Map<string, MonthBucket>>;
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
                const monthStr = monthKey.split('-')[1] || '01';
                const days: ClassDayGroup[] = Array.from(dayMap.entries())
                  .sort((a, b) => (a[0] < b[0] ? 1 : -1))
                  .map(([dayKey, items]) => ({
                    dayKey,
                    dayLabel: formatDayLabel(dayKey),
                    sessions: items,
                    attendees: items.flatMap(i => i.attendees),
                    collectedAmount: items.reduce((acc, i) => acc + i.collectedAmount, 0),
                    pendingAmount: items.reduce((acc, i) => acc + i.pendingAmount, 0)
                  }));

                return {
                  monthKey,
                  monthLabel: formatMonthLabel(yearKey, monthStr),
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
      .sort((a, b) => a.activityName.localeCompare(b.activityName, currentLocale));
  }, [sessionBreakdowns, selectedPeriod, currentLocale]);

  const attendeeGroups = useMemo<AttendeeTreeGroup[]>(() => {
    type MonthMap = Map<string, AttendeeDayRecord[]>;
    type YearMap = Map<string, MonthMap>;
    type ActivityBucket = { activityName: string; years: YearMap };
    type StudentBucket = { studentName: string; activities: Map<string, ActivityBucket> };

    const byStudent = new Map<string, StudentBucket>();

    for (const item of sessionBreakdowns) {
      const cleanDate = item.session.date || `${selectedPeriod}-01`;
      const [year = '2026', month = '01', day = '01'] = cleanDate.split('-');
      const monthKey = `${year}-${month}`;
      const dayKey = `${year}-${month}-${day}`;
      const dayLabel = formatDayLabel(dayKey);
      const activityKey = item.session.activityId || item.activityName;

      for (const att of item.attendees) {
        const studentKey = att.studentId || att.studentName;

        if (!byStudent.has(studentKey)) {
          byStudent.set(studentKey, {
            studentName: att.studentName,
            activities: new Map()
          });
        }
        const stBucket = byStudent.get(studentKey)!;

        if (!stBucket.activities.has(activityKey)) {
          stBucket.activities.set(activityKey, {
            activityName: item.activityName,
            years: new Map()
          });
        }
        const actBucket = stBucket.activities.get(activityKey)!;

        if (!actBucket.years.has(year)) {
          actBucket.years.set(year, new Map());
        }
        const yearMap = actBucket.years.get(year)!;

        if (!yearMap.has(monthKey)) {
          yearMap.set(monthKey, []);
        }
        yearMap.get(monthKey)!.push({
          dayKey,
          dayLabel,
          activityName: item.activityName,
          attendance: att.attendance,
          paidAmount: att.paidAmount,
          debtAmount: att.debtAmount,
          paymentMethod: att.paymentMethod,
          topic: item.session.topic
        });
      }
    }

    return Array.from(byStudent.entries())
      .map(([studentKey, stBucket]) => {
        const activitiesList: AttendeeActivityGroup[] = Array.from(stBucket.activities.entries())
          .map(([activityKey, actBucket]) => {
            const yearsList: AttendeeYearGroup[] = Array.from(actBucket.years.entries())
              .sort((a, b) => (a[0] < b[0] ? 1 : -1))
              .map(([yearKey, monthMap]) => {
                const monthsList: AttendeeMonthGroup[] = Array.from(monthMap.entries())
                  .sort((a, b) => (a[0] < b[0] ? 1 : -1))
                  .map(([monthKey, daysList]) => {
                    const monthStr = monthKey.split('-')[1] || '01';
                    const sortedDays = [...daysList].sort((a, b) =>
                      a.dayKey < b.dayKey ? 1 : a.dayKey > b.dayKey ? -1 : 0
                    );

                    return {
                      monthKey,
                      monthLabel: formatMonthLabel(yearKey, monthStr),
                      days: sortedDays,
                      sessionsCount: sortedDays.length,
                      collectedAmount: sortedDays.reduce((acc, d) => acc + d.paidAmount, 0),
                      pendingAmount: sortedDays.reduce((acc, d) => acc + d.debtAmount, 0)
                    };
                  });

                return {
                  yearKey,
                  months: monthsList,
                  sessionsCount: monthsList.reduce((acc, m) => acc + m.sessionsCount, 0),
                  collectedAmount: monthsList.reduce((acc, m) => acc + m.collectedAmount, 0),
                  pendingAmount: monthsList.reduce((acc, m) => acc + m.pendingAmount, 0)
                };
              });

            return {
              activityKey,
              activityName: actBucket.activityName,
              years: yearsList,
              sessionsCount: yearsList.reduce((acc, y) => acc + y.sessionsCount, 0),
              collectedAmount: yearsList.reduce((acc, y) => acc + y.collectedAmount, 0),
              pendingAmount: yearsList.reduce((acc, y) => acc + y.pendingAmount, 0)
            };
          })
          .sort((a, b) => a.activityName.localeCompare(b.activityName, currentLocale));

        return {
          studentKey,
          studentName: stBucket.studentName,
          activities: activitiesList,
          sessionsCount: activitiesList.reduce((acc, a) => acc + a.sessionsCount, 0),
          collectedAmount: activitiesList.reduce((acc, a) => acc + a.collectedAmount, 0),
          pendingAmount: activitiesList.reduce((acc, a) => acc + a.pendingAmount, 0)
        };
      })
      .sort((a, b) => a.studentName.localeCompare(b.studentName, currentLocale));
  }, [sessionBreakdowns, selectedPeriod, currentLocale]);

  const paymentGroups = useMemo<PaymentStatusGroup[]>(() => {
    type MonthMap = Map<string, PaymentDayRecord[]>;
    type YearMap = Map<string, MonthMap>;
    type ActivityBucket = { activityName: string; years: YearMap };
    type StudentBucket = { studentName: string; activities: Map<string, ActivityBucket> };
    type StatusBucket = Map<string, StudentBucket>;

    const buckets: Record<PaymentBucketKey, StatusBucket> = {
      paid: new Map(),
      pending: new Map()
    };

    for (const item of sessionBreakdowns) {
      const cleanDate = item.session.date || `${selectedPeriod}-01`;
      const [year = '2026', month = '01', day = '01'] = cleanDate.split('-');
      const monthKey = `${year}-${month}`;
      const dayKey = `${year}-${month}-${day}`;
      const dayLabel = formatDayLabel(dayKey);
      const activityKey = item.session.activityId || item.activityName;

      for (const att of item.attendees) {
        const studentKey = att.studentId || att.studentName;
        const targetBuckets: PaymentBucketKey[] = [];

        if (att.paidAmount > 0 || att.isPaid) {
          targetBuckets.push('paid');
        }
        if (att.debtAmount > 0) {
          targetBuckets.push('pending');
        }

        for (const bucketKey of targetBuckets) {
          const stMap = buckets[bucketKey];
          if (!stMap.has(studentKey)) {
            stMap.set(studentKey, {
              studentName: att.studentName,
              activities: new Map()
            });
          }
          const stBucket = stMap.get(studentKey)!;

          if (!stBucket.activities.has(activityKey)) {
            stBucket.activities.set(activityKey, {
              activityName: item.activityName,
              years: new Map()
            });
          }
          const actBucket = stBucket.activities.get(activityKey)!;

          if (!actBucket.years.has(year)) {
            actBucket.years.set(year, new Map());
          }
          const yearMap = actBucket.years.get(year)!;

          if (!yearMap.has(monthKey)) {
            yearMap.set(monthKey, []);
          }
          yearMap.get(monthKey)!.push({
            dayKey,
            dayLabel,
            activityName: item.activityName,
            attendance: att.attendance,
            paidAmount: att.paidAmount,
            debtAmount: att.debtAmount,
            paymentMethod: att.paymentMethod,
            topic: item.session.topic
          });
        }
      }
    }

    const buildStatusGroup = (statusKey: PaymentBucketKey, label: string): PaymentStatusGroup => {
      const stMap = buckets[statusKey];
      const attendeesList: PaymentAttendeeGroup[] = Array.from(stMap.entries())
        .map(([studentKey, stBucket]) => {
          const activitiesList: PaymentActivityGroup[] = Array.from(stBucket.activities.entries())
            .map(([activityKey, actBucket]) => {
              const yearsList: PaymentYearGroup[] = Array.from(actBucket.years.entries())
                .sort((a, b) => (a[0] < b[0] ? 1 : -1))
                .map(([yearKey, monthMap]) => {
                  const monthsList: PaymentMonthGroup[] = Array.from(monthMap.entries())
                    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
                    .map(([monthKey, daysList]) => {
                      const monthStr = monthKey.split('-')[1] || '01';
                      const sortedDays = [...daysList].sort((a, b) =>
                        a.dayKey < b.dayKey ? 1 : a.dayKey > b.dayKey ? -1 : 0
                      );

                      return {
                        monthKey,
                        monthLabel: formatMonthLabel(yearKey, monthStr),
                        days: sortedDays,
                        sessionsCount: sortedDays.length,
                        collectedAmount: sortedDays.reduce((acc, d) => acc + d.paidAmount, 0),
                        pendingAmount: sortedDays.reduce((acc, d) => acc + d.debtAmount, 0)
                      };
                    });

                  return {
                    yearKey,
                    months: monthsList,
                    sessionsCount: monthsList.reduce((acc, m) => acc + m.sessionsCount, 0),
                    collectedAmount: monthsList.reduce((acc, m) => acc + m.collectedAmount, 0),
                    pendingAmount: monthsList.reduce((acc, m) => acc + m.pendingAmount, 0)
                  };
                });

              return {
                activityKey,
                activityName: actBucket.activityName,
                years: yearsList,
                sessionsCount: yearsList.reduce((acc, y) => acc + y.sessionsCount, 0),
                collectedAmount: yearsList.reduce((acc, y) => acc + y.collectedAmount, 0),
                pendingAmount: yearsList.reduce((acc, y) => acc + y.pendingAmount, 0)
              };
            })
            .sort((a, b) => a.activityName.localeCompare(b.activityName, currentLocale));

          return {
            studentKey,
            studentName: stBucket.studentName,
            activities: activitiesList,
            sessionsCount: activitiesList.reduce((acc, a) => acc + a.sessionsCount, 0),
            collectedAmount: activitiesList.reduce((acc, a) => acc + a.collectedAmount, 0),
            pendingAmount: activitiesList.reduce((acc, a) => acc + a.pendingAmount, 0)
          };
        })
        .sort((a, b) => a.studentName.localeCompare(b.studentName, currentLocale));

      return {
        statusKey,
        label,
        attendees: attendeesList,
        sessionsCount: attendeesList.reduce((acc, a) => acc + a.sessionsCount, 0),
        collectedAmount: attendeesList.reduce((acc, a) => acc + a.collectedAmount, 0),
        pendingAmount: attendeesList.reduce((acc, a) => acc + a.pendingAmount, 0)
      };
    };

    return [
      buildStatusGroup('paid', t('teacherPayouts.paymentStatusPaidGroup')),
      buildStatusGroup('pending', t('teacherPayouts.paymentStatusPendingGroup'))
    ];
  }, [sessionBreakdowns, selectedPeriod, currentLocale, t]);

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

  const canManageSessionPayments = isAdminRole || isTeacherRole;

  const getPaymentStatusBadgeMeta = (status?: PaymentStatus) => {
    switch (status) {
      case 'paid':
        return {
          label: t('activityHistory.paymentLabels.paid'),
          badgeClass:
            'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 border-emerald-200/80 dark:border-emerald-800/60',
          buttonClass:
            'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/35 hover:bg-emerald-500/25'
        };
      case 'partial':
        return {
          label: t('activityHistory.paymentLabels.partial'),
          badgeClass:
            'bg-orange-50 text-orange-700 dark:bg-orange-950/50 dark:text-orange-300 border-orange-200/80 dark:border-orange-800/60',
          buttonClass:
            'bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/35 hover:bg-orange-500/25'
        };
      case 'pending':
        return {
          label: t('activityHistory.paymentLabels.pending'),
          badgeClass:
            'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300 border-amber-200/80 dark:border-amber-800/60',
          buttonClass:
            'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/35 hover:bg-amber-500/25'
        };
      case 'overdue':
        return {
          label: t('activityHistory.paymentLabels.overdue'),
          badgeClass:
            'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300 border-rose-200/80 dark:border-rose-800/60',
          buttonClass:
            'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/35 hover:bg-rose-500/25'
        };
      case 'exempt':
        return {
          label: t('activityHistory.paymentLabels.exempt'),
          badgeClass:
            'bg-sky-50 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300 border-sky-200/80 dark:border-sky-800/60',
          buttonClass:
            'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/35 hover:bg-sky-500/25'
        };
      case 'cancelled':
        return {
          label: t('activityHistory.paymentLabels.cancelled'),
          badgeClass:
            'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700 line-through',
          buttonClass:
            'bg-zinc-200/80 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border-zinc-300 dark:border-zinc-700 line-through'
        };
      default:
        return {
          label: t('teacherPayouts.paymentStatusNone'),
          badgeClass:
            'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700',
          buttonClass:
            'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-200/80 dark:hover:bg-slate-700'
        };
    }
  };

  const openPaymentEditor = (session: ClassSession, att: AttendeePaymentRow) => {
    if (!canManageSessionPayments || session.isClosed) return;
    const rowKey = `${session.id}::${att.studentId}`;
    setPaymentError(null);
    if (editingPaymentKey === rowKey) {
      setEditingPaymentKey(null);
      return;
    }

    const initialStatus: PaymentStatus =
      att.paymentStatus && !isPendingDebtStatus(att.paymentStatus)
        ? att.paymentStatus
        : 'paid';

    const defaultAmount =
      initialStatus === 'exempt' || initialStatus === 'cancelled'
        ? 0
        : initialStatus === 'partial' && att.paidAmount > 0
        ? att.paidAmount
        : att.paymentStatus === 'paid' && att.paidAmount > 0
        ? att.paidAmount
        : att.expectedPrice > 0
        ? att.expectedPrice
        : att.debtAmount > 0
        ? att.debtAmount
        : 0;

    setEditingPaymentKey(rowKey);
    setEditStatus(initialStatus);
    setEditMethod(att.paymentMethod || att.matchedPayment?.paymentMethod || 'cash');
    setEditAmount(defaultAmount.toFixed(2));
    setEditNotes(att.matchedPayment?.notes || '');
    setEditCollectedByTeacher(att.matchedPayment?.collectedByTeacher ?? true);
  };

  const handleSelectEditStatus = (nextStatus: PaymentStatus, att: AttendeePaymentRow) => {
    setEditStatus(nextStatus);
    setPaymentError(null);
    const currentNum = parseFloat(editAmount);

    if (nextStatus === 'exempt' || nextStatus === 'cancelled') {
      setEditAmount('0.00');
    } else if (nextStatus === 'paid' || isPendingDebtStatus(nextStatus)) {
      const target =
        att.expectedPrice > 0
          ? att.expectedPrice
          : att.debtAmount > 0
          ? att.debtAmount
          : Number.isFinite(currentNum) && currentNum > 0
          ? currentNum
          : 0;
      setEditAmount(target.toFixed(2));
    } else if (nextStatus === 'partial') {
      if (
        !Number.isFinite(currentNum) ||
        currentNum <= 0 ||
        (att.expectedPrice > 0 && currentNum >= att.expectedPrice)
      ) {
        const suggestedPartial = calculatePartialDefaultAmount(att.expectedPrice);
        setEditAmount(suggestedPartial.toFixed(2));
      }
    }
  };

  const syncAttendancePaymentLink = async (
    item: SessionBreakdown,
    att: AttendeePaymentRow,
    params: {
      paid: boolean;
      paidAmount: number;
      paymentMethod: PaymentMethod;
      paymentId: string;
    }
  ) => {
    if (item.session.isClosed) return;
    const hasRecords = (item.session.attendanceRecords || []).length > 0;
    if (!hasRecords && !att.matchedPayment && !params.paid) return;

    const activityObj = activities.find(a => a.id === item.session.activityId);
    const enrolledForActivity = students
      .filter(s => s.activities.some(e => e.activityId === item.session.activityId && e.active !== false))
      .map(s => ({ id: s.id, name: s.name }));

    const mappedAttendance: 'present' | 'absent' | 'partial' =
      att.attendance === 'absent' ? 'absent' : att.attendance === 'late' ? 'partial' : 'present';

    await upsertSessionAttendance({
      activityId: item.session.activityId,
      teacherId: item.session.teacherId || activityObj?.teacherId || '',
      date: item.session.date,
      studentId: att.studentId,
      studentName: att.studentName,
      attendance: mappedAttendance,
      durationMinutes: item.session.durationMinutes,
      topic: item.session.topic,
      paid: params.paid,
      paidAmount: params.paidAmount,
      paymentMethod: params.paymentMethod,
      paymentId: params.paymentId,
      enrolledStudents: enrolledForActivity
    });
  };

  const handleSaveAttendeePayment = async (
    e: React.FormEvent,
    item: SessionBreakdown,
    att: AttendeePaymentRow
  ) => {
    e.preventDefault();
    if (!canManageSessionPayments || item.session.isClosed) return;

    const rowKey = `${item.session.id}::${att.studentId}`;
    const parsedAmount = parseFloat(editAmount.replace(',', '.'));
    const isZeroAllowedStatus = editStatus === 'exempt' || editStatus === 'cancelled';

    if (!isZeroAllowedStatus && (!Number.isFinite(parsedAmount) || parsedAmount <= 0)) {
      setPaymentError({ key: rowKey, message: t('teacherPayouts.invalidPaymentAmount') });
      return;
    }

    let finalStatus: PaymentStatus = editStatus;
    let targetAmount = isZeroAllowedStatus ? 0 : Math.round(parsedAmount * 100) / 100;
    if (
      finalStatus === 'partial' &&
      att.expectedPrice > 0 &&
      targetAmount >= att.expectedPrice
    ) {
      finalStatus = 'paid';
      targetAmount = Math.round(targetAmount * 100) / 100;
    }

    const sessionDate = item.session.date?.slice(0, 10) || getMadridDateIso();
    const sessionPeriod = sessionDate.slice(0, 7);
    const activityObj = activities.find(a => a.id === item.session.activityId);
    const resolvedTeacherId = item.session.teacherId || activityObj?.teacherId;
    const isPaidOrPartial = finalStatus === 'paid' || finalStatus === 'partial';

    setPaymentBusyKey(rowKey);
    setPaymentError(null);
    try {
      let savedPaymentId = att.matchedPayment?.id || '';

      if (att.matchedPayment) {
        await updatePayment(att.matchedPayment.id, {
          status: finalStatus,
          amount: targetAmount,
          paymentMethod: editMethod,
          paymentDate: isPaidOrPartial
            ? att.matchedPayment.paymentDate || sessionDate
            : undefined,
          periodMonth: att.matchedPayment.periodMonth || sessionPeriod,
          collectedByTeacher: editCollectedByTeacher,
          collectedByTeacherId: editCollectedByTeacher ? resolvedTeacherId : undefined,
          notes: editNotes.trim()
        });
      } else {
        const created = await recordClassPayment({
          studentId: att.studentId,
          activityId: item.session.activityId,
          amount: targetAmount,
          isPartial: finalStatus === 'partial',
          status: finalStatus,
          paymentMethod: editMethod,
          date: sessionDate,
          periodMonth: sessionPeriod,
          collectedByTeacher: editCollectedByTeacher,
          notes:
            editNotes.trim() ||
            (finalStatus === 'partial'
              ? t('activityHistory.partialPaymentNote', {
                  paid: targetAmount.toFixed(2),
                  total: att.expectedPrice.toFixed(2)
                })
              : undefined)
        });
        if (!created) {
          setPaymentError({ key: rowKey, message: t('teacherPayouts.savePaymentError') });
          return;
        }
        savedPaymentId = created.id;
      }

      await syncAttendancePaymentLink(item, att, {
        paid: isPaidOrPartial,
        paidAmount: isPaidOrPartial ? targetAmount : 0,
        paymentMethod: editMethod,
        paymentId: savedPaymentId
      });

      setEditingPaymentKey(null);
    } finally {
      setPaymentBusyKey(null);
    }
  };

  const handleConfirmRemoveAttendeePayment = async () => {
    if (!confirmDeleteTarget || !canManageSessionPayments || confirmDeleteTarget.session.isClosed) {
      return;
    }
    const { session, activityName, attendee } = confirmDeleteTarget;
    const rowKey = `${session.id}::${attendee.studentId}`;
    setIsDeletingPayment(true);
    setPaymentBusyKey(rowKey);
    setPaymentError(null);
    try {
      if (attendee.matchedPayment) {
        await deletePayment(attendee.matchedPayment.id);
      }

      const targetBreakdown: SessionBreakdown = {
        session,
        activityName,
        teacherName: '',
        collectedAmount: 0,
        collectedInHandAmount: 0,
        pendingAmount: 0,
        paidCount: 0,
        totalTrackedStudents: 0,
        estimatedTeacherShare: 0,
        attendees: []
      };

      await syncAttendancePaymentLink(targetBreakdown, attendee, {
        paid: false,
        paidAmount: 0,
        paymentMethod: attendee.paymentMethod || 'cash',
        paymentId: ''
      });

      setConfirmDeleteTarget(null);
      if (editingPaymentKey === rowKey) {
        setEditingPaymentKey(null);
      }
    } finally {
      setIsDeletingPayment(false);
      setPaymentBusyKey(null);
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
      <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">
              {canViewPayouts
                ? t('teacherPayouts.titleMonitor')
                : t('teacherPayouts.titleAdmin')}
            </h2>
            {activeTeacher && (
              <span className="rounded-full bg-indigo-50 px-3 py-0.5 text-xs font-semibold text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300">
                {activeTeacher.name}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {canViewPayouts
              ? t('teacherPayouts.subtitleMonitor')
              : t('teacherPayouts.subtitleAdmin')}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {isAdminRole && (
            <select
              value={selectedTeacherFilter}
              onChange={e => setSelectedTeacherFilter(e.target.value)}
              aria-label={t('teacherPayouts.filterByTeacher')}
              className="rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 shadow-sm focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <option value="ALL">{t('teacherPayouts.allTeachers')}</option>
              {teachers.map(tc => (
                <option key={tc.id} value={tc.id}>
                  {tc.name}
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
              {t('teacherPayouts.settleButton', {
                amount: formatCurrency(activeSummary.balanceToPay, currentLocale)
              })}
            </button>
          )}
        </div>
      </div>

      {/* KPIs: 2x2 en móviles y tablets, 4 columnas en escritorio */}
      <div
        className={`grid grid-cols-2 gap-4 ${
          canViewPayouts ? 'xl:grid-cols-4' : 'sm:grid-cols-2'
        }`}
      >
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            <span>{t('teacherPayouts.kpiCollectedTitle')}</span>
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
          </div>
          <p className="mt-2 text-xl font-bold text-emerald-600 dark:text-emerald-400 sm:text-2xl">
            {formatCurrency(totals.totalCollected, currentLocale)}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {t('teacherPayouts.kpiSessionsCount', { count: totals.sessionsCount })}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            <span>{t('teacherPayouts.kpiPendingTitle')}</span>
            <Clock className="h-4 w-4 shrink-0 text-amber-500" />
          </div>
          <p className="mt-2 text-xl font-bold text-amber-600 dark:text-amber-400 sm:text-2xl">
            {formatCurrency(totals.totalPending, currentLocale)}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {t('teacherPayouts.kpiPendingSubtitle')}
          </p>
        </div>

        {canViewPayouts && activeSummary && (
          <>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <span>{t('teacherPayouts.kpiEarnedTitle')}</span>
                <Euro className="h-4 w-4 shrink-0 text-indigo-500" />
              </div>
              <p className="mt-2 text-xl font-bold text-slate-900 dark:text-white sm:text-2xl">
                {formatCurrency(activeSummary.calculatedDue, currentLocale)}
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {t('teacherPayouts.kpiCollectedInHand', {
                  amount: formatCurrency(activeSummary.collectedInHand, currentLocale)
                })}
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <span>{t('teacherPayouts.kpiBalanceTitle')}</span>
                <Wallet className="h-4 w-4 shrink-0 text-sky-500" />
              </div>
              <p className="mt-2 text-xl font-bold text-sky-600 dark:text-sky-400 sm:text-2xl">
                {formatCurrency(activeSummary.balanceToPay, currentLocale)}
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {t('teacherPayouts.kpiAlreadySettled', {
                  amount: formatCurrency(activeSummary.alreadySettled, currentLocale)
                })}
              </p>
            </div>
          </>
        )}
      </div>

      {/* Cuadro principal 1: Por Años */}
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
            {t('teacherPayouts.byYears')}
          </span>
        </button>

        {isByYearsSectionOpen && (
          <div className="space-y-4 border-t border-slate-200 p-4 dark:border-slate-800">
            {yearGroups.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/50 p-8 text-center dark:border-slate-700 dark:bg-slate-950/30">
                <Calendar className="mx-auto h-9 w-9 text-slate-400" />
                <p className="mt-2.5 text-sm font-semibold text-slate-700 dark:text-slate-200">
                  {t('teacherPayouts.noSessionsTitle')}
                </p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {t('teacherPayouts.noHistorySubtitle')}
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
                          {t('paymentsView.annualFees.yearOption', { year: yearGroup.yearKey })}
                        </span>
                        <span className="rounded-full bg-white px-2.5 py-0.5 text-xs font-medium text-slate-600 shadow-2xs dark:bg-slate-900 dark:text-slate-300">
                          {t('teacherPayouts.sessionsBadge', { count: yearGroup.sessionsCount })}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-4 text-xs sm:text-sm">
                        <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                          {t('teacherPayouts.collectedAmountLabel', {
                            amount: formatCurrency(yearGroup.collectedAmount, currentLocale)
                          })}
                        </span>
                        <span className="font-semibold text-amber-600 dark:text-amber-400">
                          {t('teacherPayouts.debtLabel', {
                            amount: formatCurrency(yearGroup.pendingAmount, currentLocale)
                          })}
                        </span>
                      </div>
                    </button>

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
                                    (
                                    {t('teacherPayouts.sessionsBadge', {
                                      count: monthGroup.sessionsCount
                                    })}
                                    )
                                  </span>
                                </div>

                                <div className="flex flex-wrap items-center gap-4 text-xs sm:text-sm">
                                  <span className="font-medium text-emerald-600 dark:text-emerald-400">
                                    {t('teacherPayouts.paidShort')}:{' '}
                                    {formatCurrency(monthGroup.collectedAmount, currentLocale)}
                                  </span>
                                  <span className="font-medium text-amber-600 dark:text-amber-400">
                                    {t('teacherPayouts.debtShort')}:{' '}
                                    {formatCurrency(monthGroup.pendingAmount, currentLocale)}
                                  </span>
                                </div>
                              </button>

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
                                              ({dayGroup.dayKey}) ·{' '}
                                              {t('teacherPayouts.classesBadge', {
                                                count: dayGroup.sessions.length
                                              })}
                                            </span>
                                          </div>

                                          <div className="flex items-center gap-3 text-xs">
                                            <span className="rounded-md bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                                              +{formatCurrency(dayGroup.collectedAmount, currentLocale)}
                                            </span>
                                            {dayGroup.pendingAmount > 0 && (
                                              <span className="rounded-md bg-amber-50 px-2 py-0.5 font-semibold text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
                                                {t('teacherPayouts.debtBadge', {
                                                  amount: formatCurrency(
                                                    dayGroup.pendingAmount,
                                                    currentLocale
                                                  )
                                                })}
                                              </span>
                                            )}
                                          </div>
                                        </button>

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
                                                            {t('teacherPayouts.closed')}
                                                          </span>
                                                        )}
                                                      </div>

                                                      <div className="flex flex-wrap items-center gap-3 pl-6 text-xs text-slate-500 dark:text-slate-400">
                                                        <span className="inline-flex items-center gap-1">
                                                          <Users className="h-3.5 w-3.5" />
                                                          {item.attendees.length > 0
                                                            ? t('teacherPayouts.studentsCount', {
                                                                count: item.attendees.length
                                                              })
                                                            : t('teacherPayouts.attendeesBadge', {
                                                                count: item.session.attendeesCount
                                                              })}
                                                        </span>
                                                        <span>
                                                          ·{' '}
                                                          {t('teacherPayouts.durationMinutes', {
                                                            minutes: item.session.durationMinutes
                                                          })}
                                                        </span>
                                                        {item.session.topic && (
                                                          <span>
                                                            ·{' '}
                                                            {t('teacherPayouts.topic', {
                                                              topic: item.session.topic
                                                            })}
                                                          </span>
                                                        )}
                                                      </div>
                                                    </div>

                                                    <div className="flex flex-wrap items-center gap-4 pl-6 text-xs sm:pl-0 sm:text-sm">
                                                      <div className="text-right">
                                                        <span className="block text-[11px] text-slate-400">
                                                          {t('teacherPayouts.paidField')}
                                                        </span>
                                                        <span className="font-bold text-emerald-600 dark:text-emerald-400">
                                                          {formatCurrency(
                                                            item.collectedAmount,
                                                            currentLocale
                                                          )}
                                                        </span>
                                                      </div>

                                                      <div className="text-right">
                                                        <span className="block text-[11px] text-slate-400">
                                                          {t('teacherPayouts.debtShort')}
                                                        </span>
                                                        <span className="font-bold text-amber-600 dark:text-amber-400">
                                                          {formatCurrency(
                                                            item.pendingAmount,
                                                            currentLocale
                                                          )}
                                                        </span>
                                                      </div>
                                                    </div>
                                                  </button>

                                                  {sessionOpen && (
                                                    <div className="border-t border-slate-100 bg-slate-50/70 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/40">
                                                      {item.attendees.length === 0 ? (
                                                        <p className="text-xs text-slate-500 dark:text-slate-400">
                                                          {t('teacherPayouts.noAttendeesForClass')}
                                                        </p>
                                                      ) : (
                                                        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                                                          <div className="hidden sm:grid sm:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)_88px_88px_124px] gap-2 items-center px-3.5 py-2 border-b border-slate-200/80 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/40 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                                            <span>{t('common.columns.student')}</span>
                                                            <span>{t('common.columns.status')}</span>
                                                            <span className="text-right">{t('common.columns.paid')}</span>
                                                            <span className="text-right">{t('common.columns.owes')}</span>
                                                            <span className="text-right">{t('common.columns.actions')}</span>
                                                          </div>
                                                          <div className="divide-y divide-slate-200/80 dark:divide-slate-800">
                                                          {item.attendees.map(att => {
                                                            const isAbsent =
                                                              att.attendance === 'absent';
                                                            const rowKey = `${item.session.id}::${att.studentId}`;
                                                            const isEditorOpen = editingPaymentKey === rowKey;
                                                            const isRowBusy = paymentBusyKey === rowKey;
                                                            const rowError =
                                                              paymentError?.key === rowKey
                                                                ? paymentError.message
                                                                : null;
                                                            const statusMeta = getPaymentStatusBadgeMeta(
                                                              att.paymentStatus
                                                            );
                                                            const canRemovePayment = Boolean(
                                                              att.matchedPayment ||
                                                                att.hasSessionRecordPaidFlag
                                                            );
                                                            const actionButtonLabel =
                                                              att.paymentStatus === 'partial'
                                                                ? t('teacherPayouts.completePaymentButton')
                                                                : !att.isPaid &&
                                                                  (!att.paymentStatus ||
                                                                    att.paymentStatus === 'pending' ||
                                                                    att.paymentStatus === 'overdue')
                                                                ? t('teacherPayouts.collectPaymentButton')
                                                                : t('teacherPayouts.managePaymentButton');

                                                            return (
                                                              <div key={att.studentId} className="bg-white dark:bg-slate-900">
                                                                <div className="grid grid-cols-1 gap-2 px-3.5 py-2.5 text-xs sm:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)_88px_88px_124px] sm:items-center sm:text-sm">
                                                                  <div className="flex items-center gap-2 min-w-0">
                                                                    {isAbsent ? (
                                                                      <UserX className="h-4 w-4 text-rose-500 shrink-0" />
                                                                    ) : (
                                                                      <UserCheck className="h-4 w-4 text-emerald-500 shrink-0" />
                                                                    )}
                                                                    {(() => {
                                                                      const stContact = getStudentContact(
                                                                        att.studentId,
                                                                        att.studentName
                                                                      );
                                                                      return (
                                                                        <StudentNameButton
                                                                          name={att.studentName}
                                                                          phone={stContact?.phone}
                                                                          email={stContact?.email}
                                                                          subtitle={item.activityName}
                                                                          className="font-medium text-slate-800 dark:text-slate-100 truncate"
                                                                        />
                                                                      );
                                                                    })()}
                                                                  </div>

                                                                  <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                                                                    {(isAbsent || att.attendance === 'late') && (
                                                                      <span
                                                                        className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                                                                          isAbsent
                                                                            ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300'
                                                                            : 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300'
                                                                        }`}
                                                                      >
                                                                        {isAbsent
                                                                          ? t('teacherPayouts.attendanceAbsent')
                                                                          : t('teacherPayouts.attendanceLate')}
                                                                      </span>
                                                                    )}
                                                                    <span
                                                                      className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${statusMeta.badgeClass}`}
                                                                    >
                                                                      {statusMeta.label}
                                                                    </span>
                                                                    {att.paymentMethod &&
                                                                      att.paidAmount > 0 && (
                                                                        <span className="text-xs text-slate-400">
                                                                          (
                                                                          {
                                                                            paymentMethodLabels[
                                                                              att.paymentMethod
                                                                            ]
                                                                          }
                                                                          )
                                                                        </span>
                                                                      )}
                                                                  </div>

                                                                  <div className="flex items-center justify-between sm:justify-end text-xs sm:text-sm">
                                                                    <span className="sm:hidden text-slate-400">
                                                                      {t('teacherPayouts.paidField')}:
                                                                    </span>
                                                                    <strong className="text-emerald-600 dark:text-emerald-400">
                                                                      {formatCurrency(
                                                                        att.paidAmount,
                                                                        currentLocale
                                                                      )}
                                                                    </strong>
                                                                  </div>

                                                                  <div className="flex items-center justify-between sm:justify-end text-xs sm:text-sm">
                                                                    <span className="sm:hidden text-slate-400">
                                                                      {t('teacherPayouts.owesField')}:
                                                                    </span>
                                                                    <strong
                                                                      className={
                                                                        att.debtAmount > 0
                                                                          ? 'text-amber-600 dark:text-amber-400'
                                                                          : 'text-slate-500 dark:text-slate-400'
                                                                      }
                                                                    >
                                                                      {formatCurrency(
                                                                        att.debtAmount,
                                                                        currentLocale
                                                                      )}
                                                                    </strong>
                                                                  </div>

                                                                  <div className="flex items-center justify-end">
                                                                    {item.session.isClosed ? (
                                                                      <span
                                                                        title={t(
                                                                          'teacherPayouts.sessionClosedPaymentLocked'
                                                                        )}
                                                                        className="inline-flex min-h-[44px] sm:min-h-[32px] items-center justify-center gap-1 rounded-lg border border-slate-200 bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400"
                                                                      >
                                                                        <Lock className="h-3.5 w-3.5 shrink-0" />
                                                                        <span>{t('teacherPayouts.closed')}</span>
                                                                      </span>
                                                                    ) : canManageSessionPayments ? (
                                                                      <button
                                                                        type="button"
                                                                        disabled={isRowBusy}
                                                                        onClick={() =>
                                                                          openPaymentEditor(item.session, att)
                                                                        }
                                                                        aria-expanded={isEditorOpen}
                                                                        className={`inline-flex min-h-[44px] sm:min-h-[34px] w-full sm:w-auto items-center justify-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition touch-manipulation active:scale-95 disabled:opacity-50 ${
                                                                          isEditorOpen
                                                                            ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:border-indigo-500/60 dark:bg-indigo-950/60 dark:text-indigo-300'
                                                                            : !att.isPaid &&
                                                                              (!att.paymentStatus ||
                                                                                att.paymentStatus === 'partial' ||
                                                                                att.paymentStatus === 'pending' ||
                                                                                att.paymentStatus === 'overdue')
                                                                            ? 'border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700 shadow-2xs'
                                                                            : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
                                                                        }`}
                                                                      >
                                                                        {isRowBusy ? (
                                                                          <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                                                                        ) : !att.isPaid &&
                                                                          (!att.paymentStatus ||
                                                                            att.paymentStatus === 'partial' ||
                                                                            att.paymentStatus === 'pending' ||
                                                                            att.paymentStatus === 'overdue') ? (
                                                                          <CircleDollarSign className="h-3.5 w-3.5 shrink-0" />
                                                                        ) : (
                                                                          <Pencil className="h-3.5 w-3.5 shrink-0" />
                                                                        )}
                                                                        <span>{actionButtonLabel}</span>
                                                                      </button>
                                                                    ) : null}
                                                                  </div>
                                                                </div>

                                                                {isEditorOpen &&
                                                                  !item.session.isClosed &&
                                                                  canManageSessionPayments && (
                                                                    <form
                                                                      onSubmit={e =>
                                                                        handleSaveAttendeePayment(
                                                                          e,
                                                                          item,
                                                                          att
                                                                        )
                                                                      }
                                                                      className="mx-3 mb-3 rounded-xl border border-indigo-200/80 bg-slate-50/90 p-3.5 space-y-3 dark:border-indigo-900/60 dark:bg-slate-800/60"
                                                                    >
                                                                      <div className="flex items-center justify-between gap-2">
                                                                        <span className="text-xs font-bold text-slate-800 dark:text-slate-100">
                                                                          {t('teacherPayouts.paymentEditorTitle', {
                                                                            student: att.studentName
                                                                          })}
                                                                        </span>
                                                                        <button
                                                                          type="button"
                                                                          onClick={() => {
                                                                            setEditingPaymentKey(null);
                                                                            setPaymentError(null);
                                                                          }}
                                                                          aria-label={t('teacherPayouts.cancelEdit')}
                                                                          className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-200/70 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-slate-200"
                                                                        >
                                                                          <X className="h-4 w-4" />
                                                                        </button>
                                                                      </div>

                                                                      <div>
                                                                        <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1.5">
                                                                          {t('teacherPayouts.paymentStatusLabel')}
                                                                        </span>
                                                                        <div className="flex flex-wrap gap-1.5">
                                                                          {PAYMENT_STATUS_ORDER.map(stKey => {
                                                                            const stMeta =
                                                                              getPaymentStatusBadgeMeta(
                                                                                stKey
                                                                              );
                                                                            const isSelected =
                                                                              editStatus === stKey;
                                                                            return (
                                                                              <button
                                                                                key={stKey}
                                                                                type="button"
                                                                                disabled={isRowBusy}
                                                                                onClick={() =>
                                                                                  handleSelectEditStatus(
                                                                                    stKey,
                                                                                    att
                                                                                  )
                                                                                }
                                                                                className={`min-h-[38px] sm:min-h-[32px] rounded-lg border px-2.5 py-1 text-xs font-semibold transition touch-manipulation ${
                                                                                  isSelected
                                                                                    ? 'ring-2 ring-indigo-500/70'
                                                                                    : ''
                                                                                } ${stMeta.buttonClass}`}
                                                                              >
                                                                                {stMeta.label}
                                                                              </button>
                                                                            );
                                                                          })}
                                                                        </div>
                                                                      </div>

                                                                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
                                                                        <div className="sm:col-span-5">
                                                                          <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">
                                                                            {t('teacherPayouts.paymentAmountLabel')}
                                                                          </label>
                                                                          <div className="flex items-center gap-1.5">
                                                                            <input
                                                                              type="number"
                                                                              step="0.01"
                                                                              min={
                                                                                editStatus === 'exempt' ||
                                                                                editStatus === 'cancelled'
                                                                                  ? '0'
                                                                                  : '0.01'
                                                                              }
                                                                              disabled={
                                                                                isRowBusy ||
                                                                                editStatus === 'exempt' ||
                                                                                editStatus === 'cancelled'
                                                                              }
                                                                              value={editAmount}
                                                                              onChange={e =>
                                                                                setEditAmount(
                                                                                  e.target.value
                                                                                )
                                                                              }
                                                                              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-900 focus:border-indigo-500 focus:outline-none disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                                                                            />
                                                                            {att.expectedPrice > 0 &&
                                                                              editStatus !== 'exempt' &&
                                                                              editStatus !==
                                                                                'cancelled' && (
                                                                                <button
                                                                                  type="button"
                                                                                  onClick={() => {
                                                                                    setEditAmount(
                                                                                      att.expectedPrice.toFixed(
                                                                                        2
                                                                                      )
                                                                                    );
                                                                                    if (
                                                                                      editStatus ===
                                                                                      'partial'
                                                                                    ) {
                                                                                      setEditStatus(
                                                                                        'paid'
                                                                                      );
                                                                                    }
                                                                                  }}
                                                                                  className="shrink-0 min-h-[38px] rounded-xl border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-700"
                                                                                >
                                                                                  {t(
                                                                                    'teacherPayouts.fillFullAmount',
                                                                                    {
                                                                                      amount:
                                                                                        formatCurrency(
                                                                                          att.expectedPrice,
                                                                                          currentLocale
                                                                                        )
                                                                                    }
                                                                                  )}
                                                                                </button>
                                                                              )}
                                                                          </div>
                                                                        </div>

                                                                        <div className="sm:col-span-7">
                                                                          <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">
                                                                            {t('teacherPayouts.paymentMethod')}
                                                                          </span>
                                                                          <div className="flex flex-wrap gap-1.5">
                                                                            {(
                                                                              [
                                                                                'cash',
                                                                                'bizum',
                                                                                'transfer',
                                                                                'card',
                                                                                'other'
                                                                              ] as PaymentMethod[]
                                                                            ).map(methodKey => (
                                                                              <button
                                                                                key={methodKey}
                                                                                type="button"
                                                                                disabled={isRowBusy}
                                                                                onClick={() =>
                                                                                  setEditMethod(
                                                                                    methodKey
                                                                                  )
                                                                                }
                                                                                className={`min-h-[38px] sm:min-h-[34px] rounded-xl border px-2.5 py-1 text-xs font-semibold transition touch-manipulation ${
                                                                                  editMethod ===
                                                                                  methodKey
                                                                                    ? 'border-indigo-600 bg-indigo-600 text-white'
                                                                                    : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-700'
                                                                                }`}
                                                                              >
                                                                                {
                                                                                  paymentMethodLabels[
                                                                                    methodKey
                                                                                  ]
                                                                                }
                                                                              </button>
                                                                            ))}
                                                                          </div>
                                                                        </div>
                                                                      </div>

                                                                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-12 sm:items-center">
                                                                        <div className="sm:col-span-7">
                                                                          <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">
                                                                            {t('teacherPayouts.notesOptional')}
                                                                          </label>
                                                                          <input
                                                                            type="text"
                                                                            value={editNotes}
                                                                            onChange={e =>
                                                                              setEditNotes(e.target.value)
                                                                            }
                                                                            placeholder={t(
                                                                              'teacherPayouts.notesPlaceholder'
                                                                            )}
                                                                            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs sm:text-sm text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                                                                          />
                                                                        </div>

                                                                        {(editStatus === 'paid' ||
                                                                          editStatus === 'partial') && (
                                                                          <label className="sm:col-span-5 flex items-center gap-2 pt-1 sm:pt-5 text-xs font-medium text-slate-700 dark:text-slate-200 cursor-pointer select-none">
                                                                            <input
                                                                              type="checkbox"
                                                                              checked={
                                                                                editCollectedByTeacher
                                                                              }
                                                                              onChange={e =>
                                                                                setEditCollectedByTeacher(
                                                                                  e.target.checked
                                                                                )
                                                                              }
                                                                              className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                                                            />
                                                                            <span>
                                                                              {t(
                                                                                'teacherPayouts.collectedByTeacherLabel'
                                                                              )}
                                                                            </span>
                                                                          </label>
                                                                        )}
                                                                      </div>

                                                                      {rowError && (
                                                                        <div className="rounded-lg border border-rose-500/30 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
                                                                          {rowError}
                                                                        </div>
                                                                      )}

                                                                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                                                                        <div>
                                                                          {canRemovePayment && (
                                                                            <button
                                                                              type="button"
                                                                              disabled={isRowBusy}
                                                                              onClick={() =>
                                                                                setConfirmDeleteTarget({
                                                                                  session: item.session,
                                                                                  activityName:
                                                                                    item.activityName,
                                                                                  attendee: att
                                                                                })
                                                                              }
                                                                              className="inline-flex min-h-[44px] sm:min-h-[36px] items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50/80 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 transition disabled:opacity-50 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300 dark:hover:bg-rose-950/70"
                                                                            >
                                                                              <RotateCcw className="h-3.5 w-3.5 shrink-0" />
                                                                              <span>
                                                                                {t(
                                                                                  'teacherPayouts.unmarkPayment'
                                                                                )}
                                                                              </span>
                                                                            </button>
                                                                          )}
                                                                        </div>

                                                                        <div className="flex flex-wrap items-center gap-2 ml-auto">
                                                                          <button
                                                                            type="button"
                                                                            disabled={isRowBusy}
                                                                            onClick={() => {
                                                                              setEditingPaymentKey(null);
                                                                              setPaymentError(null);
                                                                            }}
                                                                            className="min-h-[44px] sm:min-h-[36px] rounded-xl border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-700"
                                                                          >
                                                                            {t('teacherPayouts.cancelEdit')}
                                                                          </button>
                                                                          <button
                                                                            type="submit"
                                                                            disabled={isRowBusy}
                                                                            className="inline-flex min-h-[44px] sm:min-h-[36px] items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 transition disabled:opacity-50"
                                                                          >
                                                                            {isRowBusy ? (
                                                                              <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                                                                            ) : (
                                                                              <Check className="h-3.5 w-3.5 shrink-0" />
                                                                            )}
                                                                            <span>
                                                                              {isRowBusy
                                                                                ? t(
                                                                                    'teacherPayouts.savingPayment'
                                                                                  )
                                                                                : t(
                                                                                    'teacherPayouts.savePayment'
                                                                                  )}
                                                                            </span>
                                                                          </button>
                                                                        </div>
                                                                      </div>
                                                                    </form>
                                                                  )}
                                                              </div>
                                                            );
                                                          })}
                                                          </div>
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

      {/* Cuadro principal 2: Por Actividad */}
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
            {t('teacherPayouts.byActivity')}
          </span>
        </button>

        {isByActivitySectionOpen && (
          <div className="space-y-4 border-t border-slate-200 p-4 dark:border-slate-800">
            {classGroups.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/50 p-8 text-center dark:border-slate-700 dark:bg-slate-950/30">
                <BookOpen className="mx-auto h-9 w-9 text-slate-400" />
                <p className="mt-2.5 text-sm font-semibold text-slate-700 dark:text-slate-200">
                  {t('teacherPayouts.noActivitiesTitle')}
                </p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {t('teacherPayouts.noHistorySubtitle')}
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
                          {t('teacherPayouts.sessionsBadge', { count: clsGroup.sessionsCount })}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-4 text-xs sm:text-sm">
                        <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                          {t('teacherPayouts.collectedAmountLabel', {
                            amount: formatCurrency(clsGroup.collectedAmount, currentLocale)
                          })}
                        </span>
                        <span className="font-semibold text-amber-600 dark:text-amber-400">
                          {t('teacherPayouts.debtLabel', {
                            amount: formatCurrency(clsGroup.pendingAmount, currentLocale)
                          })}
                        </span>
                      </div>
                    </button>

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
                                    {t('paymentsView.annualFees.yearOption', { year: yGroup.yearKey })}
                                  </span>
                                  <span className="text-xs text-slate-500 dark:text-slate-400">
                                    (
                                    {t('teacherPayouts.sessionsBadge', {
                                      count: yGroup.sessionsCount
                                    })}
                                    )
                                  </span>
                                </div>

                                <div className="flex flex-wrap items-center gap-4 text-xs sm:text-sm">
                                  <span className="font-medium text-emerald-600 dark:text-emerald-400">
                                    {t('teacherPayouts.paidShort')}:{' '}
                                    {formatCurrency(yGroup.collectedAmount, currentLocale)}
                                  </span>
                                  <span className="font-medium text-amber-600 dark:text-amber-400">
                                    {t('teacherPayouts.debtShort')}:{' '}
                                    {formatCurrency(yGroup.pendingAmount, currentLocale)}
                                  </span>
                                </div>
                              </button>

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
                                              {t('teacherPayouts.paidShort')}:{' '}
                                              {formatCurrency(
                                                mGroup.collectedAmount,
                                                currentLocale
                                              )}
                                            </span>
                                            <span className="font-medium text-amber-600 dark:text-amber-400">
                                              {t('teacherPayouts.debtShort')}:{' '}
                                              {formatCurrency(mGroup.pendingAmount, currentLocale)}
                                            </span>
                                          </div>
                                        </button>

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
                                                        ({dGroup.dayKey} ·{' '}
                                                        {t('teacherPayouts.attendeesBadge', {
                                                          count: dGroup.attendees.length
                                                        })}
                                                        )
                                                      </span>
                                                    </div>

                                                    <div className="flex items-center gap-2 text-xs">
                                                      <span className="rounded-md bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                                                        +
                                                        {formatCurrency(
                                                          dGroup.collectedAmount,
                                                          currentLocale
                                                        )}
                                                      </span>
                                                      {dGroup.pendingAmount > 0 && (
                                                        <span className="rounded-md bg-amber-50 px-2 py-0.5 font-semibold text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
                                                          {t('teacherPayouts.debtBadge', {
                                                            amount: formatCurrency(
                                                              dGroup.pendingAmount,
                                                              currentLocale
                                                            )
                                                          })}
                                                        </span>
                                                      )}
                                                    </div>
                                                  </button>

                                                  {dOpen && (
                                                    <div className="border-t border-slate-100 bg-slate-50/70 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/40">
                                                      {dGroup.attendees.length === 0 ? (
                                                        <p className="text-xs text-slate-500 dark:text-slate-400">
                                                          {t('teacherPayouts.noAttendeesForDay')}
                                                        </p>
                                                      ) : (
                                                        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                                                          <div className="hidden sm:grid sm:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)_95px_95px] gap-2 items-center px-3.5 py-2 border-b border-slate-200/80 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/40 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                                            <span>{t('common.columns.student')}</span>
                                                            <span>{t('common.columns.status')}</span>
                                                            <span className="text-right">{t('common.columns.paid')}</span>
                                                            <span className="text-right">{t('common.columns.owes')}</span>
                                                          </div>
                                                          <div className="divide-y divide-slate-200/80 dark:divide-slate-800">
                                                          {dGroup.attendees.map((att, idx) => {
                                                            const isAbsent =
                                                              att.attendance === 'absent';
                                                            return (
                                                              <div
                                                                key={`${att.studentId}-${idx}`}
                                                                className="grid grid-cols-1 gap-2 px-3.5 py-2 text-xs sm:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)_95px_95px] sm:items-center sm:text-sm"
                                                              >
                                                                <div className="flex items-center gap-2 min-w-0">
                                                                  {isAbsent ? (
                                                                    <UserX className="h-4 w-4 text-rose-500 shrink-0" />
                                                                  ) : (
                                                                    <UserCheck className="h-4 w-4 text-emerald-500 shrink-0" />
                                                                  )}
                                                                {(() => {
                                                                  const stContact = getStudentContact(
                                                                    att.studentId,
                                                                    att.studentName
                                                                  );
                                                                  return (
                                                                    <StudentNameButton
                                                                      name={att.studentName}
                                                                      phone={stContact?.phone}
                                                                      email={stContact?.email}
                                                                      subtitle={clsGroup.activityName}
                                                                      className="font-medium text-slate-800 dark:text-slate-100 truncate"
                                                                    />
                                                                  );
                                                                })()}
                                                                </div>

                                                                <div className="flex flex-wrap items-center gap-1.5 min-w-0">
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
                                                                      ? t('teacherPayouts.attendanceAbsent')
                                                                      : att.attendance === 'late'
                                                                      ? t('teacherPayouts.attendanceLate')
                                                                      : t('paymentsView.statusPaid')}
                                                                  </span>
                                                                  {att.paymentMethod &&
                                                                    att.paidAmount > 0 && (
                                                                      <span className="text-xs text-slate-400">
                                                                        (
                                                                        {
                                                                          paymentMethodLabels[
                                                                            att.paymentMethod
                                                                          ]
                                                                        }
                                                                        )
                                                                      </span>
                                                                    )}
                                                                </div>

                                                                <div className="flex items-center justify-between sm:justify-end text-xs sm:text-sm">
                                                                  <span className="sm:hidden text-slate-400">
                                                                    {t('teacherPayouts.paidField')}:
                                                                  </span>
                                                                  <strong className="text-emerald-600 dark:text-emerald-400">
                                                                    {formatCurrency(
                                                                      att.paidAmount,
                                                                      currentLocale
                                                                    )}
                                                                  </strong>
                                                                </div>

                                                                <div className="flex items-center justify-between sm:justify-end text-xs sm:text-sm">
                                                                  <span className="sm:hidden text-slate-400">
                                                                    {t('teacherPayouts.owesField')}:
                                                                  </span>
                                                                  <strong
                                                                    className={
                                                                      att.debtAmount > 0
                                                                        ? 'text-amber-600 dark:text-amber-400'
                                                                        : 'text-slate-500 dark:text-slate-400'
                                                                    }
                                                                  >
                                                                    {formatCurrency(
                                                                      att.debtAmount,
                                                                      currentLocale
                                                                    )}
                                                                  </strong>
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

      {/* Cuadro principal 3: Por Asistente (Asistente -> Taller -> Año -> Mes -> Día) */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <button
          type="button"
          onClick={() => setIsByAttendeeSectionOpen(prev => !prev)}
          className="flex w-full items-center gap-2.5 bg-slate-50 px-5 py-4 text-left transition hover:bg-slate-100/80 dark:bg-slate-800/60 dark:hover:bg-slate-800"
        >
          {isByAttendeeSectionOpen ? (
            <ChevronDown className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
          ) : (
            <ChevronRight className="h-5 w-5 text-slate-500" />
          )}
          <Users className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
          <span className="text-base font-bold text-slate-900 dark:text-white">
            {t('teacherPayouts.byAttendee')}
          </span>
        </button>

        {isByAttendeeSectionOpen && (
          <div className="space-y-4 border-t border-slate-200 p-4 dark:border-slate-800">
            {attendeeGroups.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/50 p-8 text-center dark:border-slate-700 dark:bg-slate-950/30">
                <Users className="mx-auto h-9 w-9 text-slate-400" />
                <p className="mt-2.5 text-sm font-semibold text-slate-700 dark:text-slate-200">
                  {t('teacherPayouts.noAttendeesTitle')}
                </p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {t('teacherPayouts.noHistorySubtitle')}
                </p>
              </div>
            ) : (
              attendeeGroups.map(stGroup => {
                const stOpen = Boolean(expandedAttendeeNodes[stGroup.studentKey]);
                return (
                  <div
                    key={stGroup.studentKey}
                    className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900"
                  >
                    <div
                      role="button"
                      tabIndex={0}
                      aria-expanded={stOpen}
                      onClick={() =>
                        setExpandedAttendeeNodes(prev => ({
                          ...prev,
                          [stGroup.studentKey]: !stOpen
                        }))
                      }
                      onKeyDown={e => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setExpandedAttendeeNodes(prev => ({
                            ...prev,
                            [stGroup.studentKey]: !stOpen
                          }));
                        }
                      }}
                      className="flex w-full items-center justify-between gap-4 bg-sky-50/60 px-5 py-3.5 text-left transition hover:bg-sky-50 dark:bg-sky-950/30 dark:hover:bg-sky-950/50 cursor-pointer"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        {stOpen ? (
                          <ChevronDown className="h-5 w-5 text-sky-600 dark:text-sky-400 shrink-0" />
                        ) : (
                          <ChevronRight className="h-5 w-5 text-slate-500 shrink-0" />
                        )}
                        <Users className="h-4 w-4 text-sky-600 dark:text-sky-400 shrink-0" />
                        {(() => {
                          const stContact = getStudentContact(
                            stGroup.studentKey,
                            stGroup.studentName
                          );
                          return (
                            <StudentNameButton
                              name={stGroup.studentName}
                              phone={stContact?.phone}
                              email={stContact?.email}
                              className="text-base font-bold text-slate-900 dark:text-white truncate"
                            />
                          );
                        })()}
                        <span className="rounded-full bg-white px-2.5 py-0.5 text-xs font-medium text-slate-600 shadow-2xs dark:bg-slate-900 dark:text-slate-300 shrink-0">
                          {t('teacherPayouts.sessionsBadge', { count: stGroup.sessionsCount })}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-4 text-xs sm:text-sm shrink-0">
                        <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                          {t('teacherPayouts.collectedAmountLabel', {
                            amount: formatCurrency(stGroup.collectedAmount, currentLocale)
                          })}
                        </span>
                        <span className="font-semibold text-amber-600 dark:text-amber-400">
                          {t('teacherPayouts.debtLabel', {
                            amount: formatCurrency(stGroup.pendingAmount, currentLocale)
                          })}
                        </span>
                      </div>
                    </div>

                    {stOpen && (
                      <div className="divide-y divide-slate-200 dark:divide-slate-800">
                        {stGroup.activities.map(actGroup => {
                          const actKey = `${stGroup.studentKey}__${actGroup.activityKey}`;
                          const actOpen = Boolean(expandedAttendeeActivities[actKey]);
                          return (
                            <div key={actKey} className="bg-white dark:bg-slate-900">
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedAttendeeActivities(prev => ({
                                    ...prev,
                                    [actKey]: !actOpen
                                  }))
                                }
                                className="flex w-full items-center justify-between gap-4 px-6 py-3 text-left transition hover:bg-slate-50 dark:hover:bg-slate-800/40"
                              >
                                <div className="flex items-center gap-2.5">
                                  {actOpen ? (
                                    <ChevronDown className="h-4 w-4 text-indigo-500" />
                                  ) : (
                                    <ChevronRight className="h-4 w-4 text-slate-400" />
                                  )}
                                  <BookOpen className="h-4 w-4 text-indigo-500" />
                                  <span className="font-semibold text-slate-800 dark:text-slate-100">
                                    {actGroup.activityName}
                                  </span>
                                  <span className="text-xs text-slate-500 dark:text-slate-400">
                                    (
                                    {t('teacherPayouts.sessionsBadge', {
                                      count: actGroup.sessionsCount
                                    })}
                                    )
                                  </span>
                                </div>

                                <div className="flex flex-wrap items-center gap-4 text-xs sm:text-sm">
                                  <span className="font-medium text-emerald-600 dark:text-emerald-400">
                                    {t('teacherPayouts.paidShort')}:{' '}
                                    {formatCurrency(actGroup.collectedAmount, currentLocale)}
                                  </span>
                                  <span className="font-medium text-amber-600 dark:text-amber-400">
                                    {t('teacherPayouts.debtShort')}:{' '}
                                    {formatCurrency(actGroup.pendingAmount, currentLocale)}
                                  </span>
                                </div>
                              </button>

                              {actOpen && (
                                <div className="divide-y divide-slate-100 border-t border-slate-100 bg-slate-50/40 px-6 py-2 dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-950/30">
                                  {actGroup.years.map(yGroup => {
                                    const yKey = `${actKey}__${yGroup.yearKey}`;
                                    const yOpen = Boolean(expandedAttendeeYears[yKey]);
                                    return (
                                      <div key={yKey} className="py-1.5">
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setExpandedAttendeeYears(prev => ({
                                              ...prev,
                                              [yKey]: !yOpen
                                            }))
                                          }
                                          className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-left text-sm transition hover:bg-slate-100/70 dark:hover:bg-slate-800/50"
                                        >
                                          <div className="flex items-center gap-2">
                                            {yOpen ? (
                                              <ChevronDown className="h-4 w-4 text-indigo-500" />
                                            ) : (
                                              <ChevronRight className="h-4 w-4 text-slate-400" />
                                            )}
                                            <span className="font-medium text-slate-800 dark:text-slate-200">
                                              {t('paymentsView.annualFees.yearOption', {
                                                year: yGroup.yearKey
                                              })}
                                            </span>
                                            <span className="text-xs text-slate-400">
                                              ({yGroup.sessionsCount})
                                            </span>
                                          </div>

                                          <div className="flex items-center gap-3 text-xs">
                                            <span className="font-medium text-emerald-600 dark:text-emerald-400">
                                              {t('teacherPayouts.paidShort')}:{' '}
                                              {formatCurrency(yGroup.collectedAmount, currentLocale)}
                                            </span>
                                            <span className="font-medium text-amber-600 dark:text-amber-400">
                                              {t('teacherPayouts.debtShort')}:{' '}
                                              {formatCurrency(yGroup.pendingAmount, currentLocale)}
                                            </span>
                                          </div>
                                        </button>

                                        {yOpen && (
                                          <div className="mt-2 space-y-2 pl-4">
                                            {yGroup.months.map(mGroup => {
                                              const mKey = `${yKey}__${mGroup.monthKey}`;
                                              const mOpen = Boolean(expandedAttendeeMonths[mKey]);
                                              return (
                                                <div
                                                  key={mKey}
                                                  className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
                                                >
                                                  <button
                                                    type="button"
                                                    onClick={() =>
                                                      setExpandedAttendeeMonths(prev => ({
                                                        ...prev,
                                                        [mKey]: !mOpen
                                                      }))
                                                    }
                                                    className="flex w-full items-center justify-between gap-3 px-3.5 py-2 text-left text-xs transition hover:bg-slate-50 dark:hover:bg-slate-800/50 sm:text-sm"
                                                  >
                                                    <div className="flex items-center gap-2">
                                                      {mOpen ? (
                                                        <ChevronDown className="h-4 w-4 text-slate-500" />
                                                      ) : (
                                                        <ChevronRight className="h-4 w-4 text-slate-400" />
                                                      )}
                                                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                                                        {mGroup.monthLabel}
                                                      </span>
                                                      <span className="text-xs text-slate-400">
                                                        (
                                                        {t('teacherPayouts.sessionsBadge', {
                                                          count: mGroup.sessionsCount
                                                        })}
                                                        )
                                                      </span>
                                                    </div>

                                                    <div className="flex items-center gap-2 text-xs">
                                                      <span className="rounded-md bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                                                        +
                                                        {formatCurrency(
                                                          mGroup.collectedAmount,
                                                          currentLocale
                                                        )}
                                                      </span>
                                                      {mGroup.pendingAmount > 0 && (
                                                        <span className="rounded-md bg-amber-50 px-2 py-0.5 font-semibold text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
                                                          {t('teacherPayouts.debtBadge', {
                                                            amount: formatCurrency(
                                                              mGroup.pendingAmount,
                                                              currentLocale
                                                            )
                                                          })}
                                                        </span>
                                                      )}
                                                    </div>
                                                  </button>

                                                  {mOpen && (
                                                    <div className="border-t border-slate-100 bg-slate-50/70 dark:border-slate-800 dark:bg-slate-950/40">
                                                      <div className="hidden sm:grid sm:grid-cols-[minmax(0,1.25fr)_minmax(0,1.25fr)_95px_95px] gap-2 items-center px-4 py-2 border-b border-slate-200/80 dark:border-slate-800 bg-slate-100/70 dark:bg-slate-900/60 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                                        <span>{t('common.columns.date')}</span>
                                                        <span>{t('common.columns.status')}</span>
                                                        <span className="text-right">{t('common.columns.paid')}</span>
                                                        <span className="text-right">{t('common.columns.owes')}</span>
                                                      </div>
                                                      <div className="divide-y divide-slate-200/80 dark:divide-slate-800">
                                                      {mGroup.days.map((dayRec, idx) => {
                                                        const isAbsent =
                                                          dayRec.attendance === 'absent';
                                                        return (
                                                          <div
                                                            key={`${dayRec.dayKey}-${idx}`}
                                                            className="grid grid-cols-1 gap-2 px-4 py-2.5 text-xs sm:grid-cols-[minmax(0,1.25fr)_minmax(0,1.25fr)_95px_95px] sm:items-center sm:text-sm"
                                                          >
                                                            <div className="flex flex-wrap items-center gap-2 min-w-0">
                                                              {isAbsent ? (
                                                                <UserX className="h-4 w-4 text-rose-500 shrink-0" />
                                                              ) : (
                                                                <UserCheck className="h-4 w-4 text-emerald-500 shrink-0" />
                                                              )}
                                                              <span className="font-semibold capitalize text-slate-800 dark:text-slate-100">
                                                                {dayRec.dayLabel}
                                                              </span>
                                                              <span className="text-xs text-slate-400">
                                                                ({dayRec.dayKey})
                                                              </span>
                                                            </div>

                                                            <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                                                              <span
                                                                className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                                                                  isAbsent
                                                                    ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300'
                                                                    : dayRec.attendance === 'late'
                                                                    ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300'
                                                                    : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
                                                                }`}
                                                              >
                                                                {isAbsent
                                                                  ? t('teacherPayouts.attendanceAbsent')
                                                                  : dayRec.attendance === 'late'
                                                                  ? t('teacherPayouts.attendanceLate')
                                                                  : t('paymentsView.statusPaid')}
                                                              </span>
                                                              {dayRec.paymentMethod &&
                                                                dayRec.paidAmount > 0 && (
                                                                  <span className="text-xs text-slate-400">
                                                                    (
                                                                    {
                                                                      paymentMethodLabels[
                                                                        dayRec.paymentMethod
                                                                      ]
                                                                    }
                                                                    )
                                                                  </span>
                                                                )}
                                                              {dayRec.topic && (
                                                                <span className="text-xs text-slate-500 dark:text-slate-400">
                                                                  ·{' '}
                                                                  {t('teacherPayouts.topic', {
                                                                    topic: dayRec.topic
                                                                  })}
                                                                </span>
                                                              )}
                                                            </div>

                                                            <div className="flex items-center justify-between sm:justify-end text-xs sm:text-sm">
                                                              <span className="sm:hidden text-slate-400">
                                                                {t('teacherPayouts.paidField')}:
                                                              </span>
                                                              <strong className="text-emerald-600 dark:text-emerald-400">
                                                                {formatCurrency(
                                                                  dayRec.paidAmount,
                                                                  currentLocale
                                                                )}
                                                              </strong>
                                                            </div>

                                                            <div className="flex items-center justify-between sm:justify-end text-xs sm:text-sm">
                                                              <span className="sm:hidden text-slate-400">
                                                                {t('teacherPayouts.owesField')}:
                                                              </span>
                                                              <strong
                                                                className={
                                                                  dayRec.debtAmount > 0
                                                                    ? 'text-amber-600 dark:text-amber-400'
                                                                    : 'text-slate-500 dark:text-slate-400'
                                                                }
                                                              >
                                                                {formatCurrency(
                                                                  dayRec.debtAmount,
                                                                  currentLocale
                                                                )}
                                                              </strong>
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

      {/* Cuadro principal 4: Por Pagos (Pagado/Pendiente -> Asistente -> Taller -> Año -> Mes -> Día) */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <button
          type="button"
          onClick={() => setIsByPaymentsSectionOpen(prev => !prev)}
          className="flex w-full items-center gap-2.5 bg-slate-50 px-5 py-4 text-left transition hover:bg-slate-100/80 dark:bg-slate-800/60 dark:hover:bg-slate-800"
        >
          {isByPaymentsSectionOpen ? (
            <ChevronDown className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
          ) : (
            <ChevronRight className="h-5 w-5 text-slate-500" />
          )}
          <CircleDollarSign className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
          <span className="text-base font-bold text-slate-900 dark:text-white">
            {t('teacherPayouts.byPayments')}
          </span>
        </button>

        {isByPaymentsSectionOpen && (
          <div className="space-y-4 border-t border-slate-200 p-4 dark:border-slate-800">
            {paymentGroups.map(statusGroup => {
              const isPaidBucket = statusGroup.statusKey === 'paid';
              const statusOpen = Boolean(expandedPaymentStatuses[statusGroup.statusKey]);

              return (
                <div
                  key={statusGroup.statusKey}
                  className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900"
                >
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedPaymentStatuses(prev => ({
                        ...prev,
                        [statusGroup.statusKey]: !statusOpen
                      }))
                    }
                    className={`flex w-full items-center justify-between gap-4 px-5 py-3.5 text-left transition ${
                      isPaidBucket
                        ? 'bg-emerald-50/70 hover:bg-emerald-50 dark:bg-emerald-950/30 dark:hover:bg-emerald-950/50'
                        : 'bg-amber-50/70 hover:bg-amber-50 dark:bg-amber-950/30 dark:hover:bg-amber-950/50'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      {statusOpen ? (
                        <ChevronDown
                          className={`h-5 w-5 ${
                            isPaidBucket
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-amber-600 dark:text-amber-400'
                          }`}
                        />
                      ) : (
                        <ChevronRight className="h-5 w-5 text-slate-500" />
                      )}
                      {isPaidBucket ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                      ) : (
                        <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                      )}
                      <span className="text-base font-bold text-slate-900 dark:text-white">
                        {statusGroup.label}
                      </span>
                      <span className="rounded-full bg-white px-2.5 py-0.5 text-xs font-medium text-slate-600 shadow-2xs dark:bg-slate-900 dark:text-slate-300">
                        {t('teacherPayouts.sessionsBadge', { count: statusGroup.sessionsCount })}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-4 text-xs sm:text-sm">
                      <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                        {t('teacherPayouts.collectedAmountLabel', {
                          amount: formatCurrency(statusGroup.collectedAmount, currentLocale)
                        })}
                      </span>
                      <span className="font-semibold text-amber-600 dark:text-amber-400">
                        {t('teacherPayouts.debtLabel', {
                          amount: formatCurrency(statusGroup.pendingAmount, currentLocale)
                        })}
                      </span>
                    </div>
                  </button>

                  {statusOpen && (
                    <div className="divide-y divide-slate-200 dark:divide-slate-800">
                      {statusGroup.attendees.length === 0 ? (
                        <div className="p-6 text-center text-xs text-slate-500 dark:text-slate-400">
                          {isPaidBucket
                            ? t('teacherPayouts.noPaidPaymentsTitle')
                            : t('teacherPayouts.noPendingPaymentsTitle')}
                        </div>
                      ) : (
                        statusGroup.attendees.map(stGroup => {
                          const stKey = `${statusGroup.statusKey}__${stGroup.studentKey}`;
                          const stOpen = Boolean(expandedPaymentAttendees[stKey]);

                          return (
                            <div key={stKey} className="bg-white dark:bg-slate-900">
                              <div
                                role="button"
                                tabIndex={0}
                                aria-expanded={stOpen}
                                onClick={() =>
                                  setExpandedPaymentAttendees(prev => ({
                                    ...prev,
                                    [stKey]: !stOpen
                                  }))
                                }
                                onKeyDown={e => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    setExpandedPaymentAttendees(prev => ({
                                      ...prev,
                                      [stKey]: !stOpen
                                    }));
                                  }
                                }}
                                className="flex w-full items-center justify-between gap-4 px-6 py-3 text-left transition hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer"
                              >
                                <div className="flex items-center gap-2.5 min-w-0">
                                  {stOpen ? (
                                    <ChevronDown className="h-4 w-4 text-sky-500 shrink-0" />
                                  ) : (
                                    <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />
                                  )}
                                  <Users className="h-4 w-4 text-sky-500 shrink-0" />
                                  {(() => {
                                    const stContact = getStudentContact(
                                      stGroup.studentKey,
                                      stGroup.studentName
                                    );
                                    return (
                                      <StudentNameButton
                                        name={stGroup.studentName}
                                        phone={stContact?.phone}
                                        email={stContact?.email}
                                        className="font-semibold text-slate-800 dark:text-slate-100 truncate"
                                      />
                                    );
                                  })()}
                                  <span className="text-xs text-slate-500 dark:text-slate-400 shrink-0">
                                    (
                                    {t('teacherPayouts.sessionsBadge', {
                                      count: stGroup.sessionsCount
                                    })}
                                    )
                                  </span>
                                </div>

                                <div className="flex flex-wrap items-center gap-4 text-xs sm:text-sm shrink-0">
                                  <span className="font-medium text-emerald-600 dark:text-emerald-400">
                                    {t('teacherPayouts.paidShort')}:{' '}
                                    {formatCurrency(stGroup.collectedAmount, currentLocale)}
                                  </span>
                                  <span className="font-medium text-amber-600 dark:text-amber-400">
                                    {t('teacherPayouts.debtShort')}:{' '}
                                    {formatCurrency(stGroup.pendingAmount, currentLocale)}
                                  </span>
                                </div>
                              </div>

                              {stOpen && (
                                <div className="divide-y divide-slate-100 border-t border-slate-100 bg-slate-50/40 px-6 py-2 dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-950/30">
                                  {stGroup.activities.map(actGroup => {
                                    const actKey = `${stKey}__${actGroup.activityKey}`;
                                    const actOpen = Boolean(expandedPaymentActivities[actKey]);

                                    return (
                                      <div key={actKey} className="py-1.5">
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setExpandedPaymentActivities(prev => ({
                                              ...prev,
                                              [actKey]: !actOpen
                                            }))
                                          }
                                          className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-left text-sm transition hover:bg-slate-100/70 dark:hover:bg-slate-800/50"
                                        >
                                          <div className="flex items-center gap-2">
                                            {actOpen ? (
                                              <ChevronDown className="h-4 w-4 text-indigo-500" />
                                            ) : (
                                              <ChevronRight className="h-4 w-4 text-slate-400" />
                                            )}
                                            <BookOpen className="h-4 w-4 text-indigo-500" />
                                            <span className="font-medium text-slate-800 dark:text-slate-200">
                                              {actGroup.activityName}
                                            </span>
                                            <span className="text-xs text-slate-400">
                                              ({actGroup.sessionsCount})
                                            </span>
                                          </div>

                                          <div className="flex items-center gap-3 text-xs">
                                            <span className="font-medium text-emerald-600 dark:text-emerald-400">
                                              {t('teacherPayouts.paidShort')}:{' '}
                                              {formatCurrency(
                                                actGroup.collectedAmount,
                                                currentLocale
                                              )}
                                            </span>
                                            <span className="font-medium text-amber-600 dark:text-amber-400">
                                              {t('teacherPayouts.debtShort')}:{' '}
                                              {formatCurrency(actGroup.pendingAmount, currentLocale)}
                                            </span>
                                          </div>
                                        </button>

                                        {actOpen && (
                                          <div className="mt-2 space-y-2 pl-4">
                                            {actGroup.years.map(yGroup => {
                                              const yKey = `${actKey}__${yGroup.yearKey}`;
                                              const yOpen = Boolean(expandedPaymentYears[yKey]);

                                              return (
                                                <div
                                                  key={yKey}
                                                  className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
                                                >
                                                  <button
                                                    type="button"
                                                    onClick={() =>
                                                      setExpandedPaymentYears(prev => ({
                                                        ...prev,
                                                        [yKey]: !yOpen
                                                      }))
                                                    }
                                                    className="flex w-full items-center justify-between gap-3 px-3.5 py-2 text-left text-xs transition hover:bg-slate-50 dark:hover:bg-slate-800/50 sm:text-sm"
                                                  >
                                                    <div className="flex items-center gap-2">
                                                      {yOpen ? (
                                                        <ChevronDown className="h-4 w-4 text-indigo-500" />
                                                      ) : (
                                                        <ChevronRight className="h-4 w-4 text-slate-400" />
                                                      )}
                                                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                                                        {t('paymentsView.annualFees.yearOption', {
                                                          year: yGroup.yearKey
                                                        })}
                                                      </span>
                                                      <span className="text-xs text-slate-400">
                                                        (
                                                        {t('teacherPayouts.sessionsBadge', {
                                                          count: yGroup.sessionsCount
                                                        })}
                                                        )
                                                      </span>
                                                    </div>

                                                    <div className="flex items-center gap-2 text-xs">
                                                      <span className="rounded-md bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                                                        +
                                                        {formatCurrency(
                                                          yGroup.collectedAmount,
                                                          currentLocale
                                                        )}
                                                      </span>
                                                      {yGroup.pendingAmount > 0 && (
                                                        <span className="rounded-md bg-amber-50 px-2 py-0.5 font-semibold text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
                                                          {t('teacherPayouts.debtBadge', {
                                                            amount: formatCurrency(
                                                              yGroup.pendingAmount,
                                                              currentLocale
                                                            )
                                                          })}
                                                        </span>
                                                      )}
                                                    </div>
                                                  </button>

                                                  {yOpen && (
                                                    <div className="divide-y divide-slate-100 border-t border-slate-100 bg-slate-50/50 px-3.5 py-2 dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-950/30">
                                                      {yGroup.months.map(mGroup => {
                                                        const mKey = `${yKey}__${mGroup.monthKey}`;
                                                        const mOpen = Boolean(
                                                          expandedPaymentMonths[mKey]
                                                        );

                                                        return (
                                                          <div key={mKey} className="py-1">
                                                            <button
                                                              type="button"
                                                              onClick={() =>
                                                                setExpandedPaymentMonths(prev => ({
                                                                  ...prev,
                                                                  [mKey]: !mOpen
                                                                }))
                                                              }
                                                              className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-left text-xs transition hover:bg-slate-100/70 dark:hover:bg-slate-800/50 sm:text-sm"
                                                            >
                                                              <div className="flex items-center gap-2">
                                                                {mOpen ? (
                                                                  <ChevronDown className="h-4 w-4 text-slate-500" />
                                                                ) : (
                                                                  <ChevronRight className="h-4 w-4 text-slate-400" />
                                                                )}
                                                                <span className="font-semibold text-slate-800 dark:text-slate-200">
                                                                  {mGroup.monthLabel}
                                                                </span>
                                                                <span className="text-xs text-slate-400">
                                                                  (
                                                                  {t(
                                                                    'teacherPayouts.sessionsBadge',
                                                                    {
                                                                      count: mGroup.sessionsCount
                                                                    }
                                                                  )}
                                                                  )
                                                                </span>
                                                              </div>

                                                              <div className="flex items-center gap-2 text-xs">
                                                                <span className="rounded-md bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                                                                  +
                                                                  {formatCurrency(
                                                                    mGroup.collectedAmount,
                                                                    currentLocale
                                                                  )}
                                                                </span>
                                                                {mGroup.pendingAmount > 0 && (
                                                                  <span className="rounded-md bg-amber-50 px-2 py-0.5 font-semibold text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
                                                                    {t(
                                                                      'teacherPayouts.debtBadge',
                                                                      {
                                                                        amount: formatCurrency(
                                                                          mGroup.pendingAmount,
                                                                          currentLocale
                                                                        )
                                                                      }
                                                                    )}
                                                                  </span>
                                                                )}
                                                              </div>
                                                            </button>

                                                            {mOpen && (
                                                              <div className="mt-1.5 overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                                                                <div className="hidden sm:grid sm:grid-cols-[minmax(0,1.25fr)_minmax(0,1.25fr)_95px_95px] gap-2 items-center px-3.5 py-2 border-b border-slate-200/80 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/40 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                                                  <span>{t('common.columns.date')}</span>
                                                                  <span>{t('common.columns.status')}</span>
                                                                  <span className="text-right">{t('common.columns.paid')}</span>
                                                                  <span className="text-right">{t('common.columns.owes')}</span>
                                                                </div>
                                                                <div className="divide-y divide-slate-200/80 dark:divide-slate-800">
                                                                {mGroup.days.map((dayRec, idx) => {
                                                                  const isAbsent =
                                                                    dayRec.attendance === 'absent';
                                                                  return (
                                                                    <div
                                                                      key={`${dayRec.dayKey}-${idx}`}
                                                                      className="grid grid-cols-1 gap-2 px-3.5 py-2.5 text-xs sm:grid-cols-[minmax(0,1.25fr)_minmax(0,1.25fr)_95px_95px] sm:items-center sm:text-sm"
                                                                    >
                                                                      <div className="flex flex-wrap items-center gap-2 min-w-0">
                                                                        {isAbsent ? (
                                                                          <UserX className="h-4 w-4 text-rose-500 shrink-0" />
                                                                        ) : (
                                                                          <UserCheck className="h-4 w-4 text-emerald-500 shrink-0" />
                                                                        )}
                                                                        <span className="font-semibold capitalize text-slate-800 dark:text-slate-100">
                                                                          {dayRec.dayLabel}
                                                                        </span>
                                                                        <span className="text-xs text-slate-400">
                                                                          ({dayRec.dayKey})
                                                                        </span>
                                                                      </div>

                                                                      <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                                                                        <span
                                                                          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                                                                            isAbsent
                                                                              ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300'
                                                                              : dayRec.attendance ===
                                                                                'late'
                                                                              ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300'
                                                                              : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
                                                                          }`}
                                                                        >
                                                                          {isAbsent
                                                                            ? t(
                                                                                'teacherPayouts.attendanceAbsent'
                                                                              )
                                                                            : dayRec.attendance ===
                                                                              'late'
                                                                            ? t(
                                                                                'teacherPayouts.attendanceLate'
                                                                              )
                                                                            : t(
                                                                                'paymentsView.statusPaid'
                                                                              )}
                                                                        </span>
                                                                        {dayRec.paymentMethod &&
                                                                          dayRec.paidAmount >
                                                                            0 && (
                                                                            <span className="text-xs text-slate-400">
                                                                              (
                                                                              {
                                                                                paymentMethodLabels[
                                                                                  dayRec
                                                                                    .paymentMethod
                                                                                ]
                                                                              }
                                                                              )
                                                                            </span>
                                                                          )}
                                                                        {dayRec.topic && (
                                                                          <span className="text-xs text-slate-500 dark:text-slate-400">
                                                                            ·{' '}
                                                                            {t(
                                                                              'teacherPayouts.topic',
                                                                              {
                                                                                topic: dayRec.topic
                                                                              }
                                                                            )}
                                                                          </span>
                                                                        )}
                                                                      </div>

                                                                      <div className="flex items-center justify-between sm:justify-end text-xs sm:text-sm">
                                                                        <span className="sm:hidden text-slate-400">
                                                                          {t(
                                                                            'teacherPayouts.paidField'
                                                                          )}
                                                                          :
                                                                        </span>
                                                                        <strong className="text-emerald-600 dark:text-emerald-400">
                                                                          {formatCurrency(
                                                                            dayRec.paidAmount,
                                                                            currentLocale
                                                                          )}
                                                                        </strong>
                                                                      </div>

                                                                      <div className="flex items-center justify-between sm:justify-end text-xs sm:text-sm">
                                                                        <span className="sm:hidden text-slate-400">
                                                                          {t(
                                                                            'teacherPayouts.owesField'
                                                                          )}
                                                                          :
                                                                        </span>
                                                                        <strong
                                                                          className={
                                                                            dayRec.debtAmount >
                                                                            0
                                                                              ? 'text-amber-600 dark:text-amber-400'
                                                                              : 'text-slate-500 dark:text-slate-400'
                                                                          }
                                                                        >
                                                                          {formatCurrency(
                                                                            dayRec.debtAmount,
                                                                            currentLocale
                                                                          )}
                                                                        </strong>
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
              );
            })}
          </div>
        )}
      </div>

      {canViewPayouts && teacherPayoutHistory.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-2 border-b border-slate-200 px-5 py-3.5 dark:border-slate-800">
            <FileCheck2 className="h-4 w-4 text-emerald-500" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
              {t('teacherPayouts.myPayoutsTitle')}
            </h3>
          </div>
          <div className="hidden sm:grid sm:grid-cols-[minmax(0,1.1fr)_110px_minmax(0,1.2fr)_minmax(0,1.2fr)_110px] gap-3 items-center px-5 py-2 border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/40 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            <span>{t('common.columns.teacher')}</span>
            <span>{t('common.columns.period')}</span>
            <span>{t('common.columns.dateAndMethod')}</span>
            <span>{t('common.columns.notes')}</span>
            <span className="text-right">{t('common.columns.amount')}</span>
          </div>
          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {teacherPayoutHistory.map(payout => (
              <div
                key={payout.id}
                className="grid grid-cols-1 gap-2 sm:gap-3 px-5 py-3 text-sm sm:grid-cols-[minmax(0,1.1fr)_110px_minmax(0,1.2fr)_minmax(0,1.2fr)_110px] sm:items-center"
              >
                <div className="min-w-0">
                  {activeTeacher ? (
                    <StudentNameButton
                      name={activeTeacher.name}
                      phone={activeTeacher.phone}
                      email={activeTeacher.email}
                      className="font-semibold text-slate-900 dark:text-white truncate"
                    />
                  ) : (
                    <span className="font-semibold text-slate-900 dark:text-white truncate">
                      {t('teacherPayouts.defaultTeacher')}
                    </span>
                  )}
                </div>
                <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                  <span className="sm:hidden text-slate-400">{t('common.columns.period')}: </span>
                  {payout.periodMonth}
                </span>
                <span className="min-w-0 break-words text-xs text-slate-500 dark:text-slate-400">
                  {[
                    payout.settledDate || '',
                    payout.paymentMethod ? paymentMethodLabels[payout.paymentMethod] : ''
                  ]
                    .filter(Boolean)
                    .join(' · ') || '—'}
                </span>
                <span className="min-w-0 break-words text-xs text-slate-500 dark:text-slate-400">
                  {payout.notes || '—'}
                </span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400 sm:text-right">
                  {formatCurrency(payout.totalSettled, currentLocale)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {canViewPayouts && settlingTeacherId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                {t('teacherPayouts.modalTitle')}
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
                  {t('teacherPayouts.amountToSettle')}
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
                  {t('teacherPayouts.paymentMethod')}
                </label>
                <div className="mt-1.5 grid grid-cols-3 gap-2">
                  {(
                    [
                      { id: 'cash', label: t('teacherPayouts.paymentCash'), icon: Banknote },
                      {
                        id: 'transfer',
                        label: t('teacherPayouts.paymentTransfer'),
                        icon: Building2
                      },
                      { id: 'bizum', label: t('teacherPayouts.paymentBizum'), icon: CreditCard }
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
                  {t('teacherPayouts.notesOptional')}
                </label>
                <input
                  type="text"
                  value={settleNotes}
                  onChange={e => setSettleNotes(e.target.value)}
                  placeholder={t('teacherPayouts.notesPlaceholder')}
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSettlingTeacherId(null)}
                  className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
                >
                  {t('paymentsView.deleteModal.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingPayout}
                  className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {isSubmittingPayout
                    ? t('paymentsView.annualFees.modal.savingButton')
                    : t('teacherPayouts.confirmSettlement')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {confirmDeleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  {t('teacherPayouts.deletePaymentModalTitle')}
                </h3>
                <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-300">
                  {t('teacherPayouts.deletePaymentModalMessage', {
                    student: confirmDeleteTarget.attendee.studentName,
                    amount: formatCurrency(
                      confirmDeleteTarget.attendee.paidAmount > 0
                        ? confirmDeleteTarget.attendee.paidAmount
                        : confirmDeleteTarget.attendee.expectedPrice,
                      currentLocale
                    ),
                    activity: confirmDeleteTarget.activityName
                  })}
                </p>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                disabled={isDeletingPayment}
                onClick={() => setConfirmDeleteTarget(null)}
                className="min-h-[44px] sm:min-h-[38px] rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                {t('teacherPayouts.cancelEdit')}
              </button>
              <button
                type="button"
                disabled={isDeletingPayment}
                onClick={() => void handleConfirmRemoveAttendeePayment()}
                className="inline-flex min-h-[44px] sm:min-h-[38px] items-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
              >
                {isDeletingPayment ? (
                  <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                ) : (
                  <Trash2 className="h-4 w-4 shrink-0" />
                )}
                <span>{t('teacherPayouts.confirmDeletePayment')}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TeacherPayoutsView;