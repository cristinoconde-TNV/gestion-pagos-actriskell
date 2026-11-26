import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { PaymentRecord, PaymentMethod, PaymentStatus, UserRole } from '../types';
import { createTranslator } from '../lib/i18n';
import { isProfileEligibleForSocioAnnualFee } from '../lib/annualFee';
import { MemberAnnualFeesSection } from './MemberAnnualFeesSection';
import { StudentNameButton } from './ContactQuickActions';
import {
  Search,
  Filter,
  Plus,
  CheckCircle2,
  Clock,
  MessageCircle,
  MoreVertical,
  Edit2,
  Trash2,
  AlertCircle,
  CreditCard,
  Award
} from 'lucide-react';

interface PaymentsViewProps {
  onOpenRecordPayment: (initialPayment?: PaymentRecord) => void;
  onOpenAddStudent: () => void;
}

export const PaymentsView: React.FC<PaymentsViewProps> = ({
  onOpenRecordPayment,
  onOpenAddStudent
}) => {
  const {
    currentUser,
    currentRole,
    profiles,
    memberAnnualFees,
    selectedPeriod,
    periodPayments,
    activities,
    students,
    markPaymentPaid,
    updatePayment,
    deletePayment,
    language
  } = useApp();
  const t = createTranslator(language);

  const isStrictAdmin =
    currentUser?.role === UserRole.Admin && currentRole === UserRole.Admin;

  const [activeSubTab, setActiveSubTab] = useState<'workshops' | 'annual_fees'>('workshops');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedActivityId, setSelectedActivityId] = useState<string>('all');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>('all');
  const [paymentToDelete, setPaymentToDelete] = useState<PaymentRecord | null>(null);

  const currentYear = new Date().getFullYear();
  const unsettledAnnualCount = useMemo(() => {
    if (!isStrictAdmin) return 0;
    const feeByProfile = new Map(
      memberAnnualFees.filter(f => f.feeYear === currentYear).map(f => [f.profileId, f])
    );
    return profiles.filter(p => {
      if (!isProfileEligibleForSocioAnnualFee(p, false)) return false;
      const fee = feeByProfile.get(p.id);
      if (!fee) return true;
      return fee.status !== 'paid' && fee.status !== 'exempt' && fee.status !== 'cancelled';
    }).length;
  }, [isStrictAdmin, memberAnnualFees, currentYear, profiles]);

  const getExpectedFee = (payment: PaymentRecord) => {
    const act = activities.find(a => a.id === payment.activityId);
    const stu = students.find(s => s.id === payment.studentId);
    const enr = stu?.activities.find(a => a.activityId === payment.activityId);
    if (enr?.customPrice !== undefined) return enr.customPrice;
    if (!act) return payment.amount;
    return act.billingMode === 'per_class' ? act.defaultPricePerClass : act.defaultPriceMonthly;
  };

  const handleCompletePayment = async (payment: PaymentRecord) => {
    if (payment.status === 'partial') {
      const expectedFee = getExpectedFee(payment);
      const targetAmount = expectedFee > payment.amount ? expectedFee : payment.amount;
      await updatePayment(payment.id, {
        status: 'paid',
        amount: targetAmount,
        paymentDate: new Date().toISOString().split('T')[0],
        notes:
          expectedFee > payment.amount
            ? t('paymentsView.completeNote', { amount: targetAmount.toFixed(2) })
            : payment.notes
      });
    } else {
      await markPaymentPaid(payment.id);
    }
  };

  const filteredPayments = useMemo(() => {
    return periodPayments.filter(p => {
      // Search
      const matchesSearch =
        p.studentName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.receiptNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.activityName.toLowerCase().includes(searchQuery.toLowerCase());

      // Activity filter
      const matchesActivity = selectedActivityId === 'all' || p.activityId === selectedActivityId;

      // Status filter
      let matchesStatus = true;
      if (selectedStatusFilter === 'paid') matchesStatus = p.status === 'paid';
      else if (selectedStatusFilter === 'partial') matchesStatus = p.status === 'partial';
      else if (selectedStatusFilter === 'pending') matchesStatus = p.status === 'pending' || p.status === 'overdue';
      else if (selectedStatusFilter === 'teacher_collected') matchesStatus = p.collectedByTeacher;

      return matchesSearch && matchesActivity && matchesStatus;
    });
  }, [periodPayments, searchQuery, selectedActivityId, selectedStatusFilter]);

  const totalFilteredAmount = filteredPayments.reduce((acc, p) => acc + p.amount, 0);
  const paidFilteredAmount = filteredPayments
    .filter(p => p.status === 'paid' || p.status === 'partial')
    .reduce((acc, p) => acc + p.amount, 0);
  const pendingFilteredAmount = filteredPayments.reduce((acc, p) => {
    if (p.status === 'pending' || p.status === 'overdue') return acc + p.amount;
    if (p.status === 'partial') {
      const rem = Math.max(0, getExpectedFee(p) - p.amount);
      return acc + rem;
    }
    return acc;
  }, 0);

  const handleWhatsAppReminder = (payment: PaymentRecord) => {
    const student = students.find(s => s.id === payment.studentId);
    const phone = student?.phone?.replace(/[^0-9]/g, '');
    const message = encodeURIComponent(
      t('paymentsView.whatsappMessage', {
        studentName: payment.studentName,
        activityName: payment.activityName,
        period: payment.periodMonth,
        amount: payment.amount
      })
    );
    if (phone) {
      window.open(`https://wa.me/${phone}?text=${message}`, '_blank');
    } else {
      navigator.clipboard.writeText(decodeURIComponent(message));
      alert(t('paymentsView.whatsappClipboardAlert', { message: decodeURIComponent(message) }));
    }
  };

  return (
    <div className="space-y-5">
      {/* Sub-pestañas Exclusivas del Administrador: Cuotas de Talleres vs Cuota Anual de Socios */}
      {isStrictAdmin && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2 shadow-xs">
          <button
            type="button"
            onClick={() => setActiveSubTab('workshops')}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-extrabold transition min-h-[40px] ${
              activeSubTab === 'workshops'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <CreditCard className="h-4 w-4" />
            <span>{t('paymentsView.subTabs.workshops')}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('annual_fees')}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-extrabold transition min-h-[40px] ${
              activeSubTab === 'annual_fees'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Award className="h-4 w-4" />
            <span>{t('paymentsView.subTabs.annualFees')}</span>
            {unsettledAnnualCount > 0 && (
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-black tabular-nums ${
                  activeSubTab === 'annual_fees'
                    ? 'bg-white/20 text-white'
                    : 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                }`}
              >
                {unsettledAnnualCount}
              </span>
            )}
          </button>
        </div>
      )}

      {isStrictAdmin && activeSubTab === 'annual_fees' ? (
        <MemberAnnualFeesSection />
      ) : (
        <>
      {/* Barra de Controles y Filtros */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs">
        <div className="flex flex-wrap items-center gap-3 flex-1">
          {/* Buscador en vivo */}
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder={t('paymentsView.searchPlaceholder')}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 pl-9 pr-3 py-1.5 text-xs text-slate-900 dark:text-white focus:outline-emerald-500"
            />
          </div>

          {/* Filtro por Actividad */}
          <select
            value={selectedActivityId}
            onChange={e => setSelectedActivityId(e.target.value)}
            className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300"
          >
            <option value="all">{t('paymentsView.allActivities')}</option>
            {activities.map(a => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>

          {/* Filtro por Estado */}
          <select
            value={selectedStatusFilter}
            onChange={e => setSelectedStatusFilter(e.target.value)}
            className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300"
          >
            <option value="all">{t('paymentsView.allStatuses')}</option>
            <option value="paid">{t('paymentsView.statusPaidOnly')}</option>
            <option value="partial">{t('paymentsView.statusPartialOnly')}</option>
            <option value="pending">{t('paymentsView.statusPendingOnly')}</option>
            <option value="teacher_collected">{t('paymentsView.statusTeacherCollected')}</option>
          </select>
        </div>

        {/* Acciones principales */}
        <div className="flex items-center gap-2">
          <button
            onClick={onOpenAddStudent}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <span>{t('paymentsView.enrollStudentButton')}</span>
          </button>
          <button
            onClick={() => onOpenRecordPayment()}
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 transition shadow-xs"
          >
            <Plus className="h-4 w-4" />
            <span>{t('paymentsView.recordPaymentButton')}</span>
          </button>
        </div>
      </div>

      {/* Resumen numérico rápido */}
      <div className="flex flex-wrap items-center gap-4 text-xs font-medium text-slate-500 dark:text-slate-400 px-1">
        <span>{t('paymentsView.showingPrefix')} <strong>{filteredPayments.length}</strong> {t('paymentsView.recordsSuffix')}</span>
        <span>•</span>
        <span className="text-emerald-600 dark:text-emerald-400 font-bold">
          {t('paymentsView.collectedLabel', { amount: paidFilteredAmount.toFixed(2) })}
        </span>
        <span>•</span>
        <span className="text-amber-600 dark:text-amber-400 font-bold">
          {t('paymentsView.pendingLabel', { amount: pendingFilteredAmount.toFixed(2) })}
        </span>
      </div>

      {/* Vista Móvil: Lista de Tarjetas táctiles (sm:hidden) */}
      <div className="space-y-3 sm:hidden">
        {filteredPayments.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center text-xs text-slate-400">
            {t('paymentsView.emptyMobile')}
          </div>
        ) : (
          filteredPayments.map(p => {
            const student = students.find(s => s.id === p.studentId);
            return (
            <div
              key={p.id}
              className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs space-y-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <span className="font-mono text-[10px] text-emerald-600 dark:text-emerald-400 font-bold block">
                    {p.receiptNumber}
                  </span>
                  <StudentNameButton
                    name={p.studentName}
                    phone={student?.phone}
                    email={student?.email}
                    subtitle={p.activityName}
                    className="font-bold text-slate-900 dark:text-white text-sm"
                  />
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {p.activityName}
                  </p>
                </div>

                <div className="text-right">
                  <span className="text-lg font-black text-slate-900 dark:text-white block">
                    {p.amount.toFixed(2)} €
                  </span>
                  {p.status === 'paid' ? (
                    <span className="inline-flex items-center gap-1 font-bold text-emerald-600 dark:text-emerald-400 text-[11px]">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {t('paymentsView.statusPaid')}
                    </span>
                  ) : p.status === 'partial' ? (
                    <div className="inline-flex flex-col items-end">
                      <span className="inline-flex items-center gap-1 font-bold text-orange-600 dark:text-orange-400 text-[11px]">
                        <Clock className="h-3.5 w-3.5" />
                        {t('paymentsView.statusPartial')}
                      </span>
                      {getExpectedFee(p) > p.amount && (
                        <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                          {t('paymentsView.missingAmount', { amount: (getExpectedFee(p) - p.amount).toFixed(2) })}
                        </span>
                      )}
                    </div>
                  ) : p.status === 'overdue' ? (
                    <span className="inline-flex items-center gap-1 font-bold text-rose-600 dark:text-rose-400 text-[11px]">
                      <Clock className="h-3.5 w-3.5" />
                      {t('paymentsView.statusOverdue')}
                    </span>
                  ) : p.status === 'exempt' ? (
                    <span className="inline-flex items-center gap-1 font-bold text-sky-600 dark:text-sky-400 text-[11px]">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {t('paymentsView.statusExempt')}
                    </span>
                  ) : p.status === 'cancelled' ? (
                    <span className="inline-flex items-center gap-1 font-bold text-zinc-500 dark:text-zinc-400 text-[11px] line-through">
                      {t('paymentsView.statusCancelled')}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 font-bold text-amber-600 dark:text-amber-400 text-[11px]">
                      <Clock className="h-3.5 w-3.5" />
                      {t('paymentsView.statusPending')}
                    </span>
                  )}
                </div>
              </div>

              {p.collectedByTeacher && (
                <div className="rounded-lg bg-amber-50 dark:bg-amber-950/40 px-2.5 py-1 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
                  {t('paymentsView.collectedByTeacherBadge')}
                </div>
              )}

              {/* Botones de acción táctiles en móvil (min-h 40px) */}
              <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800/80">
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => handleWhatsAppReminder(p)}
                    title={t('paymentsView.whatsappTooltip')}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-slate-800 min-h-[40px]"
                  >
                    <MessageCircle className="h-4 w-4 text-emerald-600" />
                    <span>{t('paymentsView.whatsappShort')}</span>
                  </button>
                </div>

                <div className="flex items-center gap-1.5">
                  {p.status !== 'paid' && p.status !== 'exempt' && p.status !== 'cancelled' && (
                    <button
                      onClick={() => handleCompletePayment(p)}
                      className="rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-emerald-700 min-h-[40px] shadow-xs"
                    >
                      {p.status === 'partial' ? t('paymentsView.completeButton') : t('paymentsView.collectNowButton')}
                    </button>
                  )}
                  <button
                    onClick={() => onOpenRecordPayment(p)}
                    className="rounded-xl p-2 text-slate-400 hover:text-indigo-600 min-h-[40px] min-w-[40px] flex items-center justify-center"
                  >
                    <Edit2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
            );
          })
        )}
      </div>

      {/* Tabla Principal de Pagos para Pantallas medianas y grandes (hidden sm:block) */}
      <div className="hidden sm:block rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 border-b border-slate-200/80 dark:border-slate-800">
              <tr>
                <th className="py-3 px-4">{t('paymentsView.table.receipt')}</th>
                <th className="py-3 px-4">{t('paymentsView.table.student')}</th>
                <th className="py-3 px-4">{t('paymentsView.table.activity')}</th>
                <th className="py-3 px-4">{t('paymentsView.table.fee')}</th>
                <th className="py-3 px-4">{t('paymentsView.table.method')}</th>
                <th className="py-3 px-4">{t('paymentsView.table.paymentDate')}</th>
                <th className="py-3 px-4">{t('paymentsView.table.status')}</th>
                <th className="py-3 px-4 text-right">{t('paymentsView.table.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-slate-700 dark:text-slate-300">
              {filteredPayments.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    {t('paymentsView.table.empty')}
                  </td>
                </tr>
              ) : (
                filteredPayments.map(p => {
                  const student = students.find(s => s.id === p.studentId);
                  return (
                  <tr key={p.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition">
                    <td className="py-3 px-4 font-mono font-medium text-emerald-600 dark:text-emerald-400">
                      {p.receiptNumber}
                    </td>
                    <td className="py-3 px-4">
                      <div>
                        <StudentNameButton
                          name={p.studentName}
                          phone={student?.phone}
                          email={student?.email}
                          subtitle={p.activityName}
                          className="font-bold text-slate-900 dark:text-white"
                        />
                      </div>
                      {p.notes && (
                        <div className="text-[10px] text-slate-400 truncate max-w-xs">
                          {p.notes}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 font-medium text-slate-800 dark:text-slate-200">
                      {p.activityName}
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-extrabold text-sm text-slate-900 dark:text-white">
                        {p.amount.toFixed(2)} €
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="capitalize font-medium">
                        {p.paymentMethod === 'cash' ? t('common.paymentMethods.cash') : p.paymentMethod}
                      </div>
                      {p.collectedByTeacher && (
                        <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                          {t('paymentsView.collectedByTeacherShort')}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-500 dark:text-slate-400">
                      {p.paymentDate || '—'}
                    </td>
                    <td className="py-3 px-4">
                      {p.status === 'paid' ? (
                        <span className="inline-flex items-center gap-1 font-bold text-emerald-600 dark:text-emerald-400 text-xs">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          {t('paymentsView.statusPaid')}
                        </span>
                      ) : p.status === 'partial' ? (
                        <div className="inline-flex flex-col">
                          <span className="inline-flex items-center gap-1 font-bold text-orange-600 dark:text-orange-400 text-xs">
                            <Clock className="h-3.5 w-3.5" />
                            {t('paymentsView.statusPartial')}
                          </span>
                          {getExpectedFee(p) > p.amount && (
                            <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                              {t('paymentsView.missingAmountWithFee', {
                                amount: (getExpectedFee(p) - p.amount).toFixed(2),
                                fee: getExpectedFee(p).toFixed(2)
                              })}
                            </span>
                          )}
                        </div>
                      ) : p.status === 'overdue' ? (
                        <span className="inline-flex items-center gap-1 font-bold text-rose-600 dark:text-rose-400 text-xs">
                          <Clock className="h-3.5 w-3.5" />
                          {t('paymentsView.statusOverdue')}
                        </span>
                      ) : p.status === 'exempt' ? (
                        <span className="inline-flex items-center gap-1 font-bold text-sky-600 dark:text-sky-400 text-xs">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          {t('paymentsView.statusExempt')}
                        </span>
                      ) : p.status === 'cancelled' ? (
                        <span className="inline-flex items-center gap-1 font-bold text-zinc-500 dark:text-zinc-400 text-xs line-through">
                          {t('paymentsView.statusCancelled')}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 font-bold text-amber-600 dark:text-amber-400 text-xs">
                          <Clock className="h-3.5 w-3.5" />
                          {t('paymentsView.statusPending')}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {p.status !== 'paid' && p.status !== 'exempt' && p.status !== 'cancelled' && (
                          <>
                            <button
                              onClick={() => handleWhatsAppReminder(p)}
                              title={t('paymentsView.whatsappTableTooltip')}
                              className="rounded-lg p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-slate-800 transition"
                            >
                              <MessageCircle className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleCompletePayment(p)}
                              className="rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-emerald-700 transition"
                            >
                              {p.status === 'partial' ? t('paymentsView.completeButton') : t('paymentsView.collectedButton')}
                            </button>
                          </>
                        )}

                        <button
                          onClick={() => onOpenRecordPayment(p)}
                          title={t('paymentsView.editTooltip')}
                          className="rounded-lg p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-slate-800 transition"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>

                        <button
                          onClick={() => setPaymentToDelete(p)}
                          title={t('paymentsView.deleteTooltip')}
                          className="rounded-lg p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-slate-800 transition"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de confirmación in-app para eliminar pago */}
      {paymentToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-2xl space-y-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-500/15 text-rose-600">
                <AlertCircle className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  {t('paymentsView.deleteModal.title')}
                </h3>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  {t('paymentsView.deleteModal.confirmPart1')} <strong>{paymentToDelete.receiptNumber}</strong>{' '}
                  {t('paymentsView.deleteModal.confirmPart2', {
                    student: paymentToDelete.studentName,
                    amount: paymentToDelete.amount.toFixed(2)
                  })}
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setPaymentToDelete(null)}
                className="rounded-xl border border-slate-300 dark:border-slate-700 px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                {t('paymentsView.deleteModal.cancel')}
              </button>
              <button
                type="button"
                onClick={async () => {
                  await deletePayment(paymentToDelete.id);
                  setPaymentToDelete(null);
                }}
                className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-700 transition"
              >
                {t('paymentsView.deleteModal.confirmButton')}
              </button>
            </div>
          </div>
        </div>
      )}
        </>
      )}
    </div>
  );
};
