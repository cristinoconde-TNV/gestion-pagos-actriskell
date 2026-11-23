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
  CircleDollarSign
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { createTranslator } from '../lib/i18n';
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
    settleTeacherPayout,
    language
  } = useApp();

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
      return currentTeacherId || teachers[0]?.id || '';
    }
    return selectedTeacherFilter;
  }, [isTeacherRole, currentTeacherId, teachers, selectedTeacherFilter]);

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
          const studentName =
            rec.studentName || studentObj?.name || t('teacherPayouts.defaultStudent');
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

                                                                <div className="flex items-center gap-4 text-xs sm:text-sm">
                                                                  <span>
                                                                    <span className="text-slate-400">
                                                                      {t('teacherPayouts.paidField')}:{' '}
                                                                    </span>
                                                                    <strong className="text-emerald-600 dark:text-emerald-400">
                                                                      {formatCurrency(
                                                                        att.paidAmount,
                                                                        currentLocale
                                                                      )}
                                                                    </strong>
                                                                  </span>
                                                                  <span>
                                                                    <span className="text-slate-400">
                                                                      {t('teacherPayouts.owesField')}:{' '}
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

                                                                <div className="flex items-center gap-4 text-xs sm:text-sm">
                                                                  <span>
                                                                    <span className="text-slate-400">
                                                                      {t('teacherPayouts.paidField')}:{' '}
                                                                    </span>
                                                                    <strong className="text-emerald-600 dark:text-emerald-400">
                                                                      {formatCurrency(
                                                                        att.paidAmount,
                                                                        currentLocale
                                                                      )}
                                                                    </strong>
                                                                  </span>
                                                                  <span>
                                                                    <span className="text-slate-400">
                                                                      {t('teacherPayouts.owesField')}:{' '}
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
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedAttendeeNodes(prev => ({
                          ...prev,
                          [stGroup.studentKey]: !stOpen
                        }))
                      }
                      className="flex w-full items-center justify-between gap-4 bg-sky-50/60 px-5 py-3.5 text-left transition hover:bg-sky-50 dark:bg-sky-950/30 dark:hover:bg-sky-950/50"
                    >
                      <div className="flex items-center gap-2.5">
                        {stOpen ? (
                          <ChevronDown className="h-5 w-5 text-sky-600 dark:text-sky-400" />
                        ) : (
                          <ChevronRight className="h-5 w-5 text-slate-500" />
                        )}
                        <Users className="h-4 w-4 text-sky-600 dark:text-sky-400" />
                        <span className="text-base font-bold text-slate-900 dark:text-white">
                          {stGroup.studentName}
                        </span>
                        <span className="rounded-full bg-white px-2.5 py-0.5 text-xs font-medium text-slate-600 shadow-2xs dark:bg-slate-900 dark:text-slate-300">
                          {t('teacherPayouts.sessionsBadge', { count: stGroup.sessionsCount })}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-4 text-xs sm:text-sm">
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
                    </button>

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
                                                    <div className="divide-y divide-slate-200/80 border-t border-slate-100 bg-slate-50/70 dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-950/40">
                                                      {mGroup.days.map((dayRec, idx) => {
                                                        const isAbsent =
                                                          dayRec.attendance === 'absent';
                                                        return (
                                                          <div
                                                            key={`${dayRec.dayKey}-${idx}`}
                                                            className="flex flex-col gap-2 px-4 py-2.5 text-xs sm:flex-row sm:items-center sm:justify-between sm:text-sm"
                                                          >
                                                            <div className="flex flex-wrap items-center gap-2">
                                                              {isAbsent ? (
                                                                <UserX className="h-4 w-4 text-rose-500" />
                                                              ) : (
                                                                <UserCheck className="h-4 w-4 text-emerald-500" />
                                                              )}
                                                              <span className="font-semibold capitalize text-slate-800 dark:text-slate-100">
                                                                {dayRec.dayLabel}
                                                              </span>
                                                              <span className="text-xs text-slate-400">
                                                                ({dayRec.dayKey})
                                                              </span>
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

                                                            <div className="flex items-center gap-4 text-xs sm:text-sm">
                                                              <span>
                                                                <span className="text-slate-400">
                                                                  {t('teacherPayouts.paidField')}:{' '}
                                                                </span>
                                                                <strong className="text-emerald-600 dark:text-emerald-400">
                                                                  {formatCurrency(
                                                                    dayRec.paidAmount,
                                                                    currentLocale
                                                                  )}
                                                                </strong>
                                                              </span>
                                                              <span>
                                                                <span className="text-slate-400">
                                                                  {t('teacherPayouts.owesField')}:{' '}
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
                                                              </span>
                                                            </div>
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
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedPaymentAttendees(prev => ({
                                    ...prev,
                                    [stKey]: !stOpen
                                  }))
                                }
                                className="flex w-full items-center justify-between gap-4 px-6 py-3 text-left transition hover:bg-slate-50 dark:hover:bg-slate-800/40"
                              >
                                <div className="flex items-center gap-2.5">
                                  {stOpen ? (
                                    <ChevronDown className="h-4 w-4 text-sky-500" />
                                  ) : (
                                    <ChevronRight className="h-4 w-4 text-slate-400" />
                                  )}
                                  <Users className="h-4 w-4 text-sky-500" />
                                  <span className="font-semibold text-slate-800 dark:text-slate-100">
                                    {stGroup.studentName}
                                  </span>
                                  <span className="text-xs text-slate-500 dark:text-slate-400">
                                    (
                                    {t('teacherPayouts.sessionsBadge', {
                                      count: stGroup.sessionsCount
                                    })}
                                    )
                                  </span>
                                </div>

                                <div className="flex flex-wrap items-center gap-4 text-xs sm:text-sm">
                                  <span className="font-medium text-emerald-600 dark:text-emerald-400">
                                    {t('teacherPayouts.paidShort')}:{' '}
                                    {formatCurrency(stGroup.collectedAmount, currentLocale)}
                                  </span>
                                  <span className="font-medium text-amber-600 dark:text-amber-400">
                                    {t('teacherPayouts.debtShort')}:{' '}
                                    {formatCurrency(stGroup.pendingAmount, currentLocale)}
                                  </span>
                                </div>
                              </button>

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
                                                              <div className="mt-1.5 divide-y divide-slate-200/80 rounded-xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
                                                                {mGroup.days.map((dayRec, idx) => {
                                                                  const isAbsent =
                                                                    dayRec.attendance === 'absent';
                                                                  return (
                                                                    <div
                                                                      key={`${dayRec.dayKey}-${idx}`}
                                                                      className="flex flex-col gap-2 px-3.5 py-2.5 text-xs sm:flex-row sm:items-center sm:justify-between sm:text-sm"
                                                                    >
                                                                      <div className="flex flex-wrap items-center gap-2">
                                                                        {isAbsent ? (
                                                                          <UserX className="h-4 w-4 text-rose-500" />
                                                                        ) : (
                                                                          <UserCheck className="h-4 w-4 text-emerald-500" />
                                                                        )}
                                                                        <span className="font-semibold capitalize text-slate-800 dark:text-slate-100">
                                                                          {dayRec.dayLabel}
                                                                        </span>
                                                                        <span className="text-xs text-slate-400">
                                                                          ({dayRec.dayKey})
                                                                        </span>
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

                                                                      <div className="flex items-center gap-4 text-xs sm:text-sm">
                                                                        <span>
                                                                          <span className="text-slate-400">
                                                                            {t(
                                                                              'teacherPayouts.paidField'
                                                                            )}
                                                                            :{' '}
                                                                          </span>
                                                                          <strong className="text-emerald-600 dark:text-emerald-400">
                                                                            {formatCurrency(
                                                                              dayRec.paidAmount,
                                                                              currentLocale
                                                                            )}
                                                                          </strong>
                                                                        </span>
                                                                        <span>
                                                                          <span className="text-slate-400">
                                                                            {t(
                                                                              'teacherPayouts.owesField'
                                                                            )}
                                                                            :{' '}
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
                                                                        </span>
                                                                      </div>
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
          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {teacherPayoutHistory.map(payout => (
              <div
                key={payout.id}
                className="flex flex-col gap-2 px-5 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <span className="font-semibold text-slate-900 dark:text-white">
                    {activeTeacher?.name || t('teacherPayouts.defaultTeacher')}
                  </span>
                  <span className="ml-2 text-xs text-slate-500 dark:text-slate-400">
                    {t('teacherPayouts.periodLabel', { period: payout.periodMonth })}
                    {payout.settledDate
                      ? ` · ${t('teacherPayouts.dateLabel', { date: payout.settledDate })}`
                      : ''}
                    {payout.paymentMethod
                      ? ` · ${paymentMethodLabels[payout.paymentMethod]}`
                      : ''}
                  </span>
                  {payout.notes && (
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      {payout.notes}
                    </p>
                  )}
                </div>
                <span className="font-bold text-emerald-600 dark:text-emerald-400">
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
    </div>
  );
};

export default TeacherPayoutsView;