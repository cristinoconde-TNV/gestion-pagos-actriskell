import {
  Activity,
  CenterExpense,
  ClassSession,
  PaymentRecord,
  PaymentStatus,
  Student,
  StudentActivityEnrollment,
  Teacher
} from '../types';

export interface TeacherFinancialSummary {
  teacher: Teacher;
  classesCount: number;
  studentsCount: number;
  grossActivityRevenue: number;
  calculatedDue: number;
  collectedInHand: number;
  alreadySettled: number;
  balanceToPay: number;
  status: 'settled' | 'pending' | 'surplus';
}

export const PAYMENT_STATUS_ORDER: PaymentStatus[] = [
  'paid',
  'partial',
  'pending',
  'overdue',
  'exempt',
  'cancelled'
];

export const isUnpaidPaymentStatus = (status: PaymentStatus): boolean =>
  status === 'pending' || status === 'overdue' || status === 'partial';

export const isPendingDebtStatus = (status: PaymentStatus): boolean =>
  status === 'pending' || status === 'overdue';

export const isSettledOrPartialIncomeStatus = (status: PaymentStatus): boolean =>
  status === 'paid' || status === 'partial';

/**
 * Resuelve la tarifa por defecto de una actividad según su modalidad de cobro.
 */
export const resolveActivityDefaultFee = (
  activity?: Pick<Activity, 'billingMode' | 'defaultPricePerClass' | 'defaultPriceMonthly'> | null,
  billingModeOverride?: 'monthly' | 'per_class',
  fallback = 0
): number => {
  if (!activity) return fallback;
  const mode = billingModeOverride || activity.billingMode;
  return mode === 'per_class' ? activity.defaultPricePerClass : activity.defaultPriceMonthly;
};

/**
 * Resuelve la tarifa efectiva de una matrícula concreta (tarifa personalizada o tarifa por defecto de la actividad).
 */
export const resolveEnrollmentFee = (
  enrollment?: Partial<Pick<StudentActivityEnrollment, 'customPrice' | 'billingMode'>> | null,
  activity?: Pick<Activity, 'billingMode' | 'defaultPricePerClass' | 'defaultPriceMonthly'> | null,
  fallback = 0
): number => {
  if (enrollment?.customPrice !== undefined) return enrollment.customPrice;
  if (!activity) return fallback;
  return resolveActivityDefaultFee(activity, enrollment?.billingMode, fallback);
};

/**
 * Resuelve la tarifa esperada de un alumno en una actividad.
 */
export const resolveStudentActivityFee = (
  student?: Pick<Student, 'activities'> | null,
  activity?: Pick<
    Activity,
    'id' | 'billingMode' | 'defaultPricePerClass' | 'defaultPriceMonthly'
  > | null,
  fallback = 45
): number => {
  if (!activity) return fallback;
  const enrollment = student?.activities.find(a => a.activityId === activity.id);
  return resolveEnrollmentFee(enrollment, activity, fallback);
};

/**
 * Resuelve la tarifa esperada asociada a un recibo o pago concreto.
 */
export const getExpectedPaymentFee = (
  payment: Pick<PaymentRecord, 'studentId' | 'activityId' | 'amount'>,
  students: Student[],
  activities: Activity[]
): number => {
  const activity = activities.find(a => a.id === payment.activityId);
  if (!activity) return payment.amount;
  const student = students.find(s => s.id === payment.studentId);
  const enrollment = student?.activities.find(a => a.activityId === payment.activityId);
  if (enrollment?.customPrice !== undefined) return enrollment.customPrice;
  return resolveActivityDefaultFee(activity, undefined, payment.amount);
};

/**
 * Importe parcial por defecto (50% de la tarifa completa si supera 1 €).
 */
export const calculatePartialDefaultAmount = (fullAmount: number): number => {
  return fullAmount > 1 ? Math.round((fullAmount / 2) * 100) / 100 : fullAmount;
};

/**
 * Importe pendiente tras un pago parcial respecto a la tarifa esperada.
 */
export const calculatePartialBalanceRemaining = (
  expectedFee: number,
  paidAmount: number
): number => {
  return Math.max(0, expectedFee - paidAmount);
};

/**
 * Filtra los pagos impagados (pendientes, vencidos o parciales) de un alumno, opcionalmente por taller.
 */
export const getStudentUnpaidPayments = (
  payments: PaymentRecord[],
  studentId: string,
  activityId?: string
): PaymentRecord[] => {
  return payments.filter(
    p =>
      p.studentId === studentId &&
      (activityId === undefined || p.activityId === activityId) &&
      isUnpaidPaymentStatus(p.status)
  );
};

/**
 * Suma los importes de una lista de registros de pago.
 */
export const sumPaymentAmounts = (payments: Pick<PaymentRecord, 'amount'>[]): number => {
  return payments.reduce((sum, p) => sum + p.amount, 0);
};

/**
 * Calcula los resúmenes financieros por monitor para el período indicado.
 */
export const calculateTeacherFinancialSummaries = (params: {
  teachers: Teacher[];
  activities: Activity[];
  students: Student[];
  sessions: ClassSession[];
  periodPayments: PaymentRecord[];
  payouts: { teacherId: string; periodMonth: string; status: string; totalSettled: number }[];
  selectedPeriod: string;
}): TeacherFinancialSummary[] => {
  const { teachers, activities, students, sessions, periodPayments, payouts, selectedPeriod } = params;

  return teachers.map(teacher => {
    const teacherActivities = activities.filter(a => a.teacherId === teacher.id);
    const activityIds = teacherActivities.map(a => a.id);

    const teacherSessions = sessions.filter(
      s =>
        s.teacherId === teacher.id &&
        s.date.startsWith(selectedPeriod) &&
        !(
          s.closedBy === 'automatica' &&
          s.attendeesCount === 0 &&
          (!s.attendanceRecords || s.attendanceRecords.length === 0)
        )
    );
    const classesCount = teacherSessions.length;

    const enrolledStudentIds = new Set<string>();
    students.forEach(s => {
      if (s.activities.some(act => activityIds.includes(act.activityId))) {
        enrolledStudentIds.add(s.id);
      }
    });
    const studentsCount = enrolledStudentIds.size;

    const teacherPeriodPayments = periodPayments.filter(p => activityIds.includes(p.activityId));
    const grossActivityRevenue = sumPaymentAmounts(
      teacherPeriodPayments.filter(p => isSettledOrPartialIncomeStatus(p.status))
    );

    let calculatedDue = 0;
    switch (teacher.paymentScheme) {
      case 'per_class':
        calculatedDue = classesCount * teacher.ratePerClass;
        break;
      case 'monthly_fixed':
        calculatedDue = teacher.fixedMonthlyRate;
        break;
      case 'revenue_share':
        calculatedDue = grossActivityRevenue * (teacher.revenueSharePercent / 100);
        break;
    }

    const collectedInHand = sumPaymentAmounts(
      teacherPeriodPayments.filter(
        p => isSettledOrPartialIncomeStatus(p.status) && p.collectedByTeacher
      )
    );

    const teacherPeriodPayouts = payouts.filter(
      p => p.teacherId === teacher.id && p.periodMonth === selectedPeriod && p.status === 'settled'
    );
    const alreadySettled = teacherPeriodPayouts.reduce((sum, p) => sum + p.totalSettled, 0);

    const balanceToPay = Math.max(0, calculatedDue - collectedInHand - alreadySettled);

    let status: 'settled' | 'pending' | 'surplus' = 'pending';
    if (balanceToPay === 0) {
      status = 'settled';
    } else if (collectedInHand > calculatedDue) {
      status = 'surplus';
    }

    return {
      teacher,
      classesCount,
      studentsCount,
      grossActivityRevenue,
      calculatedDue,
      collectedInHand,
      alreadySettled,
      balanceToPay,
      status
    };
  });
};

/**
 * Calcula los totales financieros agregados del período activo.
 */
export const calculatePeriodFinancialTotals = (params: {
  periodPayments: PaymentRecord[];
  expenses: CenterExpense[];
  selectedPeriod: string;
  teacherSummaries: TeacherFinancialSummary[];
}) => {
  const { periodPayments, expenses, selectedPeriod, teacherSummaries } = params;

  const totalIncomeCollected = sumPaymentAmounts(
    periodPayments.filter(p => isSettledOrPartialIncomeStatus(p.status))
  );

  const totalIncomePending = sumPaymentAmounts(
    periodPayments.filter(p => isPendingDebtStatus(p.status))
  );

  const totalExpenses = expenses
    .filter(e => e.periodMonth === selectedPeriod && e.status === 'paid')
    .reduce((sum, e) => sum + e.amount, 0);

  const totalTeacherCosts = teacherSummaries.reduce((acc, s) => acc + s.calculatedDue, 0);
  const netMonthlyBalance = totalIncomeCollected - totalExpenses - totalTeacherCosts;

  return {
    totalIncomeCollected,
    totalIncomePending,
    totalExpenses,
    totalTeacherCosts,
    netMonthlyBalance
  };
};
