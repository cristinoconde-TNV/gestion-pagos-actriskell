import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import {
  CenterExpense,
  MemberAnnualFee,
  PaymentMethod,
  PaymentRecord,
  PaymentStatus,
  TeacherPayout,
  UserRole
} from '../types';
import {
  DEFAULT_ANNUAL_FEE_AMOUNT,
  isProfileEligibleForSocioAnnualFee,
  parseSocioAnnualFeeConfig
} from '../lib/annualFee';
import { getPaymentMethodLabel } from '../lib/paymentMethods';
import {
  generateCryptographicRandomDigits,
  generateCryptographicToken
} from '../lib/authRole';
import { getMadridDateIso } from '../lib/date';
import { formatCsvRow } from '../lib/csv';
import {
  calculatePeriodFinancialTotals,
  calculateTeacherFinancialSummaries,
  TeacherFinancialSummary
} from '../lib/billing';
import {
  mapDbExpenseToExpense,
  mapDbMemberAnnualFeeToFee,
  mapDbPaymentToPayment,
  mapExpenseToDb,
  mapPaymentToDb,
  mapPayoutToDb,
  supabase
} from '../lib/supabase';
import { useAuth } from './AuthContext';
import { useAcademyData } from './AcademyDataContext';

export type { TeacherFinancialSummary };

export interface FinanceContextType {
  selectedPeriod: string;
  setSelectedPeriod: React.Dispatch<React.SetStateAction<string>>;
  goToPrevPeriod: () => void;
  goToNextPeriod: () => void;
  goToCurrentPeriod: () => void;

  payments: PaymentRecord[];
  setPayments: React.Dispatch<React.SetStateAction<PaymentRecord[]>>;
  paymentsRef: React.MutableRefObject<PaymentRecord[]>;
  commitPayments: (updater: (prev: PaymentRecord[]) => PaymentRecord[]) => void;

  expenses: CenterExpense[];
  setExpenses: React.Dispatch<React.SetStateAction<CenterExpense[]>>;
  payouts: TeacherPayout[];
  setPayouts: React.Dispatch<React.SetStateAction<TeacherPayout[]>>;

  memberAnnualFees: MemberAnnualFee[];
  setMemberAnnualFees: React.Dispatch<React.SetStateAction<MemberAnnualFee[]>>;
  memberAnnualFeesTableMissing: boolean;
  setMemberAnnualFeesTableMissing: React.Dispatch<React.SetStateAction<boolean>>;

  recordPayment: (
    payment: Omit<PaymentRecord, 'id' | 'receiptNumber'> & { id?: string }
  ) => Promise<PaymentRecord | null>;
  updatePayment: (id: string, updates: Partial<PaymentRecord>) => Promise<void>;
  deletePayment: (id: string) => Promise<void>;
  markPaymentPaid: (id: string, method?: PaymentMethod) => Promise<void>;
  recordClassPayment: (params: {
    studentId: string;
    activityId: string;
    amount: number;
    isPartial?: boolean;
    status?: PaymentStatus;
    paymentMethod?: PaymentMethod;
    date?: string;
    periodMonth?: string;
    collectedByTeacher?: boolean;
    notes?: string;
  }) => Promise<PaymentRecord | null>;

  upsertMemberAnnualFee: (params: {
    id?: string;
    profileId: string;
    memberName: string;
    memberEmail: string;
    memberNumber?: string;
    feeYear: number;
    amount: number;
    paidAmount: number;
    status: PaymentStatus;
    paymentMethod: PaymentMethod;
    paymentDate?: string;
    receiptNumber?: string;
    notes?: string;
  }) => Promise<{ success: boolean; error?: string; fee?: MemberAnnualFee }>;
  generateAnnualFeesForYear: (params: {
    feeYear: number;
    amount?: number;
    strictSocioRoleOnly?: boolean;
  }) => Promise<{ success: boolean; createdCount: number; error?: string }>;
  deleteMemberAnnualFee: (id: string) => Promise<{ success: boolean; error?: string }>;

  addExpense: (expense: Omit<CenterExpense, 'id'>) => Promise<void>;
  deleteExpense: (id: string) => Promise<void>;
  settleTeacherPayout: (
    teacherId: string,
    periodMonth: string,
    amountToPay: number,
    method: PaymentMethod,
    notes?: string
  ) => Promise<void>;

  exportToCSV: (type: 'payments' | 'students' | 'expenses' | 'teachers') => void;

  periodPayments: PaymentRecord[];
  totalIncomeCollected: number;
  totalIncomePending: number;
  totalExpenses: number;
  teacherSummaries: TeacherFinancialSummary[];
  totalTeacherCosts: number;
  netMonthlyBalance: number;
}

const FinanceContext = createContext<FinanceContextType | undefined>(undefined);

export const FinanceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const {
    currentUserRef,
    currentRole,
    currentTeacherId,
    isStrictAdminSession,
    profiles,
    appConfigs,
    clearDbError,
    handleSupabaseError,
    refreshFromSupabase,
    t
  } = useAuth();

  const {
    teachers,
    activities,
    students,
    sessions,
    setSessions
  } = useAcademyData();

  const [selectedPeriod, setSelectedPeriod] = useState<string>('2026-11');
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const paymentsRef = useRef<PaymentRecord[]>([]);
  paymentsRef.current = payments;
  const tempPaymentIdMapRef = useRef<Record<string, string>>({});
  const pendingPaymentInsertMapRef = useRef<Record<string, Promise<PaymentRecord | null>>>({});

  const [expenses, setExpenses] = useState<CenterExpense[]>([]);
  const [payouts, setPayouts] = useState<TeacherPayout[]>([]);
  const [memberAnnualFees, setMemberAnnualFees] = useState<MemberAnnualFee[]>([]);
  const [memberAnnualFeesTableMissing, setMemberAnnualFeesTableMissing] = useState(false);

  useEffect(() => {
    if (!isStrictAdminSession) {
      setMemberAnnualFees([]);
      setMemberAnnualFeesTableMissing(false);
    }
  }, [isStrictAdminSession]);

  // Navegación de Períodos Mensuales
  const goToPrevPeriod = () => {
    const [year, month] = selectedPeriod.split('-').map(Number);
    const prevDate = new Date(year, month - 2, 1);
    const newY = prevDate.getFullYear();
    const newM = String(prevDate.getMonth() + 1).padStart(2, '0');
    setSelectedPeriod(`${newY}-${newM}`);
  };

  const goToNextPeriod = () => {
    const [year, month] = selectedPeriod.split('-').map(Number);
    const nextDate = new Date(year, month, 1);
    const newY = nextDate.getFullYear();
    const newM = String(nextDate.getMonth() + 1).padStart(2, '0');
    setSelectedPeriod(`${newY}-${newM}`);
  };

  const goToCurrentPeriod = () => {
    setSelectedPeriod('2026-11');
  };

  // Pagos y Recibos
  const commitPayments = useCallback(
    (updater: (prev: PaymentRecord[]) => PaymentRecord[]) => {
      const next = updater(paymentsRef.current);
      paymentsRef.current = next;
      setPayments(next);
    },
    []
  );

  const resolveRealPaymentId = async (id: string): Promise<string> => {
    if (!id.startsWith('temp-pay-')) return id;
    if (tempPaymentIdMapRef.current[id]) return tempPaymentIdMapRef.current[id];
    const pendingInsert = pendingPaymentInsertMapRef.current[id];
    if (pendingInsert) {
      try {
        const created = await pendingInsert;
        if (created?.id) return created.id;
      } catch {
        // Ignorar
      }
    }
    return tempPaymentIdMapRef.current[id] || id;
  };

  const recordPayment: FinanceContextType['recordPayment'] = async payment => {
    clearDbError();
    const receiptNumber = `REC-${selectedPeriod.replace('-', '')}-${generateCryptographicRandomDigits(6)}`;
    const student = students.find(s => s.id === payment.studentId);
    const activity = activities.find(a => a.id === payment.activityId);
    const effectiveDate =
      payment.paymentDate ||
      (payment.status === 'paid' || payment.status === 'partial'
        ? getMadridDateIso()
        : undefined);
    const tempId = `temp-pay-${Date.now()}-${generateCryptographicToken(8)}`;

    const optimisticPayment: PaymentRecord = {
      id: tempId,
      receiptNumber,
      studentId: payment.studentId,
      studentName: student?.name || payment.studentName || t('appContext.fallbackStudent'),
      activityId: payment.activityId,
      activityName: activity?.name || payment.activityName || t('appContext.fallbackActivity'),
      periodMonth: payment.periodMonth || selectedPeriod,
      amount: payment.amount,
      paymentDate: effectiveDate,
      paymentMethod: payment.paymentMethod || 'cash',
      status: payment.status || 'paid',
      collectedByTeacher: payment.collectedByTeacher ?? true,
      collectedByTeacherId: payment.collectedByTeacherId || activity?.teacherId,
      notes: payment.notes || ''
    };

    commitPayments(prev => [optimisticPayment, ...prev]);

    const dbPayload = mapPaymentToDb(optimisticPayment);
    const insertPromise = (async (): Promise<PaymentRecord | null> => {
      const { data, error } = await supabase.from('payments').insert([dbPayload]).select().single();
      if (error) {
        commitPayments(prev => prev.filter(p => p.id !== tempId));
        const enhancedError = error.message?.includes('payments_status_check')
          ? new Error(t('appContext.paymentsStatusCheck'))
          : error;
        handleSupabaseError(t('appContext.actions.recordPayment'), enhancedError);
        return null;
      }

      if (data) {
        const createdPayment = mapDbPaymentToPayment(data, student?.name, activity?.name);
        tempPaymentIdMapRef.current[tempId] = createdPayment.id;
        commitPayments(prev =>
          prev.map(p => (p.id === tempId ? createdPayment : p))
        );
        return createdPayment;
      }
      return null;
    })();

    pendingPaymentInsertMapRef.current[tempId] = insertPromise;
    try {
      return await insertPromise;
    } finally {
      delete pendingPaymentInsertMapRef.current[tempId];
    }
  };

  const updatePayment: FinanceContextType['updatePayment'] = async (id, updates) => {
    clearDbError();
    const optimisticMatch = paymentsRef.current.find(p => p.id === id);
    if (optimisticMatch) {
      const optimisticMerged = { ...optimisticMatch, ...updates };
      commitPayments(prev => prev.map(p => (p.id === id ? optimisticMerged : p)));
    }

    const realId = await resolveRealPaymentId(id);
    if (realId.startsWith('temp-pay-')) {
      return;
    }

    let current =
      paymentsRef.current.find(p => p.id === realId) ||
      paymentsRef.current.find(p => p.id === id) ||
      optimisticMatch;

    if (!current) {
      const { data: row } = await supabase
        .from('payments')
        .select('*, students(name), activities(name)')
        .eq('id', realId)
        .maybeSingle();
      if (row) {
        current = mapDbPaymentToPayment(row);
      }
    }

    if (!current) return;

    const merged: PaymentRecord = { ...current, ...updates, id: realId };
    commitPayments(prev => {
      const exists = prev.some(p => p.id === realId || p.id === id);
      return exists
        ? prev.map(p => (p.id === realId || p.id === id ? merged : p))
        : [merged, ...prev];
    });

    const dbPayload = mapPaymentToDb(merged);
    const { error } = await supabase.from('payments').update(dbPayload).eq('id', realId);
    if (error) {
      commitPayments(prev => prev.map(p => (p.id === realId ? current! : p)));
      const enhancedError = error.message?.includes('payments_status_check')
        ? new Error(t('appContext.paymentsStatusCheck'))
        : error;
      handleSupabaseError(t('appContext.actions.updatePayment'), enhancedError);
      return;
    }
  };

  const deletePayment: FinanceContextType['deletePayment'] = async id => {
    clearDbError();
    const mappedId = tempPaymentIdMapRef.current[id];
    const previous =
      paymentsRef.current.find(p => p.id === id) ||
      (mappedId ? paymentsRef.current.find(p => p.id === mappedId) : undefined);

    commitPayments(prev => prev.filter(p => p.id !== id && p.id !== mappedId));

    const realId = await resolveRealPaymentId(id);
    if (realId.startsWith('temp-pay-')) {
      return;
    }

    commitPayments(prev => prev.filter(p => p.id !== realId));
    setSessions(prev =>
      prev.map(s => {
        const hasLinkedRecord = s.attendanceRecords?.some(
          r =>
            r.paymentId === id ||
            r.paymentId === realId ||
            (mappedId ? r.paymentId === mappedId : false)
        );
        if (!hasLinkedRecord) return s;
        return {
          ...s,
          attendanceRecords: s.attendanceRecords?.map(r =>
            r.paymentId === id ||
            r.paymentId === realId ||
            (mappedId ? r.paymentId === mappedId : false)
              ? { ...r, paid: false, paidAmount: 0, paymentId: undefined }
              : r
          )
        };
      })
    );

    try {
      await supabase
        .from('session_attendances')
        .update({ payment_id: null, paid: false, paid_amount: 0 })
        .eq('payment_id', realId);
    } catch {
      // Ignorar si no existe vínculo o la política aplica solo a pagos
    }
    const { error } = await supabase.from('payments').delete().eq('id', realId);
    if (error) {
      if (previous) {
        const restored = { ...previous, id: realId };
        commitPayments(prev => (prev.some(p => p.id === realId) ? prev : [restored, ...prev]));
      }
      handleSupabaseError(t('appContext.actions.deletePayment'), error);
      return;
    }
  };

  const markPaymentPaid: FinanceContextType['markPaymentPaid'] = async (id, method) => {
    await updatePayment(id, {
      status: 'paid',
      paymentDate: getMadridDateIso(),
      ...(method ? { paymentMethod: method } : {})
    });
  };

  const recordClassPayment: FinanceContextType['recordClassPayment'] = async params => {
    clearDbError();
    const activity = activities.find(a => a.id === params.activityId);
    const student = students.find(s => s.id === params.studentId);
    const paymentDate = params.date || getMadridDateIso();
    const resolvedPeriodMonth =
      params.periodMonth || (paymentDate ? paymentDate.slice(0, 7) : selectedPeriod);
    const resolvedStatus: PaymentStatus =
      params.status || (params.isPartial ? 'partial' : 'paid');

    const receipt = await recordPayment({
      studentId: params.studentId,
      studentName: student?.name || t('appContext.fallbackStudent'),
      activityId: params.activityId,
      activityName: activity?.name || t('appContext.fallbackWorkshop'),
      periodMonth: resolvedPeriodMonth,
      amount: params.amount,
      paymentDate: paymentDate,
      paymentMethod: params.paymentMethod || 'cash',
      status: resolvedStatus,
      collectedByTeacher: params.collectedByTeacher ?? true,
      collectedByTeacherId: activity?.teacherId || currentTeacherId,
      notes:
        params.notes ||
        (resolvedStatus === 'partial'
          ? t('appContext.notes.partialClassPayment')
          : t('appContext.notes.fullClassPayment'))
    });

    return receipt;
  };

  // Cuota Anual de Socios (Exclusivo Administrador)
  const upsertMemberAnnualFee: FinanceContextType['upsertMemberAnnualFee'] = async params => {
    clearDbError();
    if (currentUserRef.current?.role !== UserRole.Admin || currentRole !== UserRole.Admin) {
      return { success: false, error: t('appContext.annualFees.adminOnly') };
    }

    const safeAmount = Math.max(0, Number(params.amount) || 0);
    let safePaidAmount = Math.max(0, Number(params.paidAmount) || 0);
    let resolvedStatus: PaymentStatus = params.status;

    if (resolvedStatus === 'paid') {
      safePaidAmount = safeAmount;
    } else if (resolvedStatus === 'exempt' || resolvedStatus === 'cancelled') {
      safePaidAmount = 0;
    } else if (resolvedStatus === 'pending' || resolvedStatus === 'overdue') {
      safePaidAmount = 0;
    } else if (resolvedStatus === 'partial') {
      if (safeAmount > 0 && safePaidAmount >= safeAmount) {
        resolvedStatus = 'paid';
        safePaidAmount = safeAmount;
      } else if (safePaidAmount <= 0) {
        resolvedStatus = 'pending';
        safePaidAmount = 0;
      }
    }

    const resolvedReceipt =
      (params.receiptNumber || '').trim() ||
      (resolvedStatus === 'paid' || resolvedStatus === 'partial'
        ? `CA-${params.feeYear}-${generateCryptographicRandomDigits(6)}`
        : undefined);
    const resolvedPaymentDate =
      params.paymentDate ||
      (resolvedStatus === 'paid' || resolvedStatus === 'partial'
        ? getMadridDateIso()
        : undefined);

    const payload: Record<string, unknown> = {
      profile_id: params.profileId,
      member_name: params.memberName,
      member_email: params.memberEmail,
      member_number: params.memberNumber || null,
      fee_year: params.feeYear,
      amount: safeAmount,
      paid_amount: safePaidAmount,
      status: resolvedStatus,
      payment_method: params.paymentMethod || 'cash',
      payment_date: resolvedPaymentDate || null,
      receipt_number: resolvedReceipt || null,
      notes: params.notes?.trim() || null,
      recorded_by: currentUserRef.current?.id || null,
      updated_at: new Date().toISOString()
    };

    try {
      const { data, error } = await supabase
        .from('member_annual_fees')
        .upsert(payload, { onConflict: 'profile_id,fee_year' })
        .select('*')
        .single();

      if (error) {
        if (
          error.code === '42P01' ||
          error.code === 'PGRST205' ||
          error.message?.toLowerCase().includes('member_annual_fees')
        ) {
          setMemberAnnualFeesTableMissing(true);
        }
        handleSupabaseError(t('appContext.annualFees.saveAction'), error);
        return { success: false, error: error.message };
      }

      setMemberAnnualFeesTableMissing(false);
      const savedFee = mapDbMemberAnnualFeeToFee(data);
      setMemberAnnualFees(prev => {
        const filtered = prev.filter(
          item =>
            item.id !== savedFee.id &&
            !(item.profileId === savedFee.profileId && item.feeYear === savedFee.feeYear)
        );
        return [savedFee, ...filtered].sort((a, b) =>
          b.feeYear !== a.feeYear
            ? b.feeYear - a.feeYear
            : a.memberName.localeCompare(b.memberName)
        );
      });

      return { success: true, fee: savedFee };
    } catch (err: any) {
      const msg = err?.message || t('appContext.annualFees.saveError');
      handleSupabaseError(t('appContext.annualFees.saveAction'), err);
      return { success: false, error: msg };
    }
  };

  const generateAnnualFeesForYear: FinanceContextType['generateAnnualFeesForYear'] = async params => {
    clearDbError();
    if (currentUserRef.current?.role !== UserRole.Admin || currentRole !== UserRole.Admin) {
      return { success: false, createdCount: 0, error: t('appContext.annualFees.adminOnly') };
    }

    const parsedConfig = parseSocioAnnualFeeConfig(appConfigs);
    const feeAmount =
      params.amount !== undefined && Number.isFinite(params.amount) && params.amount >= 0
        ? params.amount
        : parsedConfig.defaultAmount || DEFAULT_ANNUAL_FEE_AMOUNT;

    const existingProfileIds = new Set(
      memberAnnualFees.filter(f => f.feeYear === params.feeYear).map(f => f.profileId)
    );

    const eligibleProfiles = profiles.filter(
      p =>
        isProfileEligibleForSocioAnnualFee(p, Boolean(params.strictSocioRoleOnly)) &&
        !existingProfileIds.has(p.id)
    );

    if (eligibleProfiles.length === 0) {
      return { success: true, createdCount: 0 };
    }

    const nowIso = new Date().toISOString();
    const rowsToInsert = eligibleProfiles.map(p => ({
      profile_id: p.id,
      member_name: p.name,
      member_email: p.email,
      member_number: p.memberNumber || null,
      fee_year: params.feeYear,
      amount: feeAmount,
      paid_amount: 0,
      status: 'pending',
      payment_method: 'cash',
      payment_date: null,
      receipt_number: null,
      notes: null,
      recorded_by: currentUserRef.current?.id || null,
      updated_at: nowIso
    }));

    try {
      const { data, error } = await supabase
        .from('member_annual_fees')
        .upsert(rowsToInsert, { onConflict: 'profile_id,fee_year', ignoreDuplicates: true })
        .select('*');

      if (error) {
        if (
          error.code === '42P01' ||
          error.code === 'PGRST205' ||
          error.message?.toLowerCase().includes('member_annual_fees')
        ) {
          setMemberAnnualFeesTableMissing(true);
        }
        handleSupabaseError(t('appContext.annualFees.generateAction'), error);
        return { success: false, createdCount: 0, error: error.message };
      }

      setMemberAnnualFeesTableMissing(false);
      const insertedFees = (data || []).map(mapDbMemberAnnualFeeToFee);
      setMemberAnnualFees(prev => {
        const merged = [...prev];
        for (const fee of insertedFees) {
          const idx = merged.findIndex(
            item => item.profileId === fee.profileId && item.feeYear === fee.feeYear
          );
          if (idx >= 0) merged[idx] = fee;
          else merged.push(fee);
        }
        return merged.sort((a, b) =>
          b.feeYear !== a.feeYear
            ? b.feeYear - a.feeYear
            : a.memberName.localeCompare(b.memberName)
        );
      });

      return { success: true, createdCount: insertedFees.length };
    } catch (err: any) {
      const msg = err?.message || t('appContext.annualFees.generateError');
      handleSupabaseError(t('appContext.annualFees.generateAction'), err);
      return { success: false, createdCount: 0, error: msg };
    }
  };

  const deleteMemberAnnualFee: FinanceContextType['deleteMemberAnnualFee'] = async id => {
    clearDbError();
    if (currentUserRef.current?.role !== UserRole.Admin || currentRole !== UserRole.Admin) {
      return { success: false, error: t('appContext.annualFees.adminOnly') };
    }

    const previous = memberAnnualFees.find(f => f.id === id);
    setMemberAnnualFees(prev => prev.filter(f => f.id !== id));

    try {
      const { error } = await supabase.from('member_annual_fees').delete().eq('id', id);
      if (error) {
        if (previous) {
          setMemberAnnualFees(prev => [previous, ...prev]);
        }
        handleSupabaseError(t('appContext.annualFees.deleteAction'), error);
        return { success: false, error: error.message };
      }
      return { success: true };
    } catch (err: any) {
      if (previous) {
        setMemberAnnualFees(prev => [previous, ...prev]);
      }
      const msg = err?.message || t('appContext.annualFees.deleteError');
      handleSupabaseError(t('appContext.annualFees.deleteAction'), err);
      return { success: false, error: msg };
    }
  };

  // Gastos
  const addExpense: FinanceContextType['addExpense'] = async expense => {
    clearDbError();
    const dbPayload = mapExpenseToDb(expense);
    const { data, error } = await supabase.from('center_expenses').insert([dbPayload]).select().single();
    if (error) {
      handleSupabaseError(t('appContext.actions.recordExpense'), error);
      return;
    }
    if (data) {
      setExpenses(prev => [mapDbExpenseToExpense(data), ...prev]);
    }
    await refreshFromSupabase();
  };

  const deleteExpense: FinanceContextType['deleteExpense'] = async id => {
    clearDbError();
    const { error } = await supabase.from('center_expenses').delete().eq('id', id);
    if (error) {
      handleSupabaseError(t('appContext.actions.deleteExpense'), error);
      return;
    }
    setExpenses(prev => prev.filter(e => e.id !== id));
    await refreshFromSupabase();
  };

  // Liquidaciones
  const settleTeacherPayout: FinanceContextType['settleTeacherPayout'] = async (
    teacherId,
    periodMonth,
    amountToPay,
    method,
    notes
  ) => {
    clearDbError();
    const summary = teacherSummaries.find(s => s.teacher.id === teacherId);
    const dbPayload = mapPayoutToDb({
      id: '',
      teacherId,
      periodMonth,
      calculatedAmount: summary?.calculatedDue || amountToPay,
      classesCount: summary?.classesCount || 0,
      studentsCount: summary?.studentsCount || 0,
      collectedInHandByTeacher: summary?.collectedInHand || 0,
      balancePending: 0,
      totalSettled: amountToPay,
      status: 'settled',
      settledDate: getMadridDateIso(),
      paymentMethod: method,
      notes: notes || t('appContext.notes.monthlyPayoutSettled')
    });

    const { error } = await supabase.from('teacher_payouts').insert([dbPayload]);
    if (error) {
      handleSupabaseError(t('appContext.actions.recordPayout'), error);
      return;
    }
    await refreshFromSupabase();
  };

  // Cálculos automáticos del período
  const periodPayments = useMemo(() => {
    return payments.filter(p => p.periodMonth === selectedPeriod);
  }, [payments, selectedPeriod]);

  const teacherSummaries = useMemo<TeacherFinancialSummary[]>(() => {
    return calculateTeacherFinancialSummaries({
      teachers,
      activities,
      students,
      sessions,
      periodPayments,
      payouts,
      selectedPeriod
    });
  }, [teachers, activities, students, sessions, periodPayments, selectedPeriod, payouts]);

  const {
    totalIncomeCollected,
    totalIncomePending,
    totalExpenses,
    totalTeacherCosts,
    netMonthlyBalance
  } = useMemo(() => {
    return calculatePeriodFinancialTotals({
      periodPayments,
      expenses,
      selectedPeriod,
      teacherSummaries
    });
  }, [periodPayments, expenses, selectedPeriod, teacherSummaries]);

  // Exportar a CSV (protegido contra inyección de fórmulas y restringido a Administrador)
  const exportToCSV: FinanceContextType['exportToCSV'] = type => {
    if (!isStrictAdminSession) return;
    let csvBody = '';
    const safePeriod = String(selectedPeriod || '').replace(/[^0-9A-Za-z_-]/g, '_');
    const filename = `triskell_${type}_${safePeriod}.csv`;

    if (type === 'payments') {
      csvBody += t('appContext.csv.paymentsHeader');
      periodPayments.forEach(p => {
        csvBody += formatCsvRow([
          p.receiptNumber,
          p.studentName,
          p.activityName,
          p.periodMonth,
          p.amount,
          p.status,
          p.paymentDate || '',
          getPaymentMethodLabel(p.paymentMethod, t),
          p.collectedByTeacher ? t('appContext.csv.yes') : t('appContext.csv.no')
        ]);
      });
    } else if (type === 'students') {
      csvBody += t('appContext.csv.studentsHeader');
      students.forEach(s => {
        csvBody += formatCsvRow([
          s.name,
          s.email,
          s.phone,
          s.status,
          s.registeredAt
        ]);
      });
    } else if (type === 'expenses') {
      csvBody += t('appContext.csv.expensesHeader');
      expenses
        .filter(e => e.periodMonth === selectedPeriod)
        .forEach(e => {
          csvBody += formatCsvRow([
            e.title,
            e.category,
            e.amount,
            e.date,
            e.periodMonth,
            getPaymentMethodLabel(e.paymentMethod, t),
            e.invoiceNumber || ''
          ]);
        });
    } else if (type === 'teachers') {
      csvBody += t('appContext.csv.teachersHeader');
      teachers.forEach(teacherItem => {
        csvBody += formatCsvRow([
          teacherItem.name,
          teacherItem.email,
          teacherItem.phone,
          teacherItem.paymentScheme,
          teacherItem.ratePerClass,
          teacherItem.fixedMonthlyRate,
          teacherItem.revenueSharePercent
        ]);
      });
    }

    const blob = new Blob(['\uFEFF' + csvBody], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <FinanceContext.Provider
      value={{
        selectedPeriod,
        setSelectedPeriod,
        goToPrevPeriod,
        goToNextPeriod,
        goToCurrentPeriod,
        payments,
        setPayments,
        paymentsRef,
        commitPayments,
        expenses,
        setExpenses,
        payouts,
        setPayouts,
        memberAnnualFees,
        setMemberAnnualFees,
        memberAnnualFeesTableMissing,
        setMemberAnnualFeesTableMissing,
        recordPayment,
        updatePayment,
        deletePayment,
        markPaymentPaid,
        recordClassPayment,
        upsertMemberAnnualFee,
        generateAnnualFeesForYear,
        deleteMemberAnnualFee,
        addExpense,
        deleteExpense,
        settleTeacherPayout,
        exportToCSV,
        periodPayments,
        totalIncomeCollected,
        totalIncomePending,
        totalExpenses,
        teacherSummaries,
        totalTeacherCosts,
        netMonthlyBalance
      }}
    >
      {children}
    </FinanceContext.Provider>
  );
};

export const useFinance = () => {
  const context = useContext(FinanceContext);
  if (!context) {
    throw new Error('useFinance must be used within a FinanceProvider');
  }
  return context;
};
