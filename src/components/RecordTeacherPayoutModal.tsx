import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useFinance, TeacherFinancialSummary } from '../context/FinanceContext';
import { createTranslator } from '../lib/i18n';
import { PaymentMethod } from '../types';
import { X, Check } from 'lucide-react';

interface RecordTeacherPayoutModalProps {
  summary: TeacherFinancialSummary | null;
  onClose: () => void;
}

export const RecordTeacherPayoutModal: React.FC<RecordTeacherPayoutModalProps> = ({ summary, onClose }) => {
  const { language } = useAuth();
  const { selectedPeriod, settleTeacherPayout } = useFinance();
  const t = createTranslator(language);

  const [payoutAmount, setPayoutAmount] = useState<number>(summary?.balanceToPay ?? 0);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(summary?.teacher.preferredPaymentMethod || 'cash');
  const [notes, setNotes] = useState<string>('');

  useEffect(() => {
    if (summary) {
      setPayoutAmount(summary.balanceToPay);
      setPaymentMethod(summary.teacher.preferredPaymentMethod || 'cash');
      setNotes('');
    }
  }, [summary]);

  if (!summary) return null;

  const { teacher, calculatedDue, collectedInHand, alreadySettled, balanceToPay, classesCount, grossActivityRevenue } = summary;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    settleTeacherPayout(teacher.id, selectedPeriod, Number(payoutAmount), paymentMethod, notes);
    onClose();
  };

  const schemeLabels = {
    per_class: t('recordTeacherPayoutModal.schemePerClass', { rate: teacher.ratePerClass }),
    monthly_fixed: t('recordTeacherPayoutModal.schemeMonthlyFixed', { rate: teacher.fixedMonthlyRate }),
    revenue_share: t('recordTeacherPayoutModal.schemeRevenueShare', { percent: teacher.revenueSharePercent })
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/70 p-0 sm:p-4 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl bg-white dark:bg-slate-900 shadow-2xl border border-slate-200 dark:border-slate-800 max-h-[92dvh] sm:max-h-[88vh] flex flex-col overflow-hidden">
        
        {/* Cabecera Fija con botón táctil de 44px */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md shrink-0">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white leading-tight">
              {t('recordTeacherPayoutModal.title', { name: teacher.name })}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t('recordTeacherPayoutModal.subtitle', { period: selectedPeriod })}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('recordTeacherPayoutModal.closeAria')}
            className="flex h-11 w-11 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200 transition touch-manipulation active:scale-95"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Formulario con cuerpo escroleable independiente */}
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto overscroll-contain p-5 space-y-4">
            {/* Desglose de Cálculo */}
            <div className="rounded-xl bg-slate-50 dark:bg-slate-800/40 p-4 border border-slate-200/60 dark:border-slate-800 text-xs space-y-2.5">
              <div className="flex justify-between items-center text-slate-600 dark:text-slate-400">
                <span>{t('recordTeacherPayoutModal.remunerationModel')}</span>
                <span className="font-semibold text-slate-900 dark:text-white">
                  {schemeLabels[teacher.paymentScheme]}
                </span>
              </div>

              {teacher.paymentScheme === 'per_class' && (
                <div className="flex justify-between items-center text-slate-600 dark:text-slate-400">
                  <span>{t('recordTeacherPayoutModal.classesRegisteredMonth')}</span>
                  <span className="font-medium text-slate-800 dark:text-slate-200">
                    {t('recordTeacherPayoutModal.classesCountFormula', { count: classesCount, rate: teacher.ratePerClass })}
                  </span>
                </div>
              )}

              {teacher.paymentScheme === 'revenue_share' && (
                <div className="flex justify-between items-center text-slate-600 dark:text-slate-400">
                  <span>{t('recordTeacherPayoutModal.groupRevenueTotal')}</span>
                  <span className="font-medium text-slate-800 dark:text-slate-200">
                    {grossActivityRevenue.toFixed(2)}€ ({teacher.revenueSharePercent}%)
                  </span>
                </div>
              )}

              <div className="flex justify-between items-center pt-2 border-t border-slate-200/60 dark:border-slate-700 font-medium">
                <span>{t('recordTeacherPayoutModal.calculatedTotal')}</span>
                <span className="font-bold text-slate-900 dark:text-white">{calculatedDue.toFixed(2)} €</span>
              </div>

              {collectedInHand > 0 && (
                <div className="flex justify-between items-center text-amber-600 dark:text-amber-400 font-medium">
                  <span>{t('recordTeacherPayoutModal.collectedInHand')}</span>
                  <span>−{collectedInHand.toFixed(2)} €</span>
                </div>
              )}

              {alreadySettled > 0 && (
                <div className="flex justify-between items-center text-emerald-600 dark:text-emerald-400 font-medium">
                  <span>{t('recordTeacherPayoutModal.alreadyTransferred')}</span>
                  <span>−{alreadySettled.toFixed(2)} €</span>
                </div>
              )}

              <div className="flex justify-between items-center pt-2 border-t border-slate-200/80 dark:border-slate-700 text-sm font-bold">
                <span className="text-slate-900 dark:text-white">{t('recordTeacherPayoutModal.balanceToPay')}</span>
                <span className="text-emerald-600 dark:text-emerald-400 text-base">{balanceToPay.toFixed(2)} €</span>
              </div>
            </div>

            {balanceToPay === 0 && (
              <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/30 p-3 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
                <Check className="h-4 w-4 shrink-0 text-emerald-600" />
                <span>{t('recordTeacherPayoutModal.upToDateMessage')}</span>
              </div>
            )}

            {/* Importe compacto y método de abono */}
            <div className="grid grid-cols-12 gap-3">
              <div className="col-span-5 sm:col-span-4">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {t('recordTeacherPayoutModal.amountLabel')}
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.5"
                    min="1"
                    value={payoutAmount}
                    onChange={e => setPayoutAmount(Number(e.target.value))}
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 pr-7 pl-3 py-2.5 text-base font-black text-slate-900 dark:text-white focus:outline-emerald-500 text-right"
                    required
                  />
                  <span className="absolute right-2.5 top-3 text-xs font-bold text-slate-400 pointer-events-none">€</span>
                </div>
              </div>

              <div className="col-span-7 sm:col-span-8">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {t('recordTeacherPayoutModal.methodLabel')}
                </label>
                <select
                  value={paymentMethod}
                  onChange={e => setPaymentMethod(e.target.value as PaymentMethod)}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2.5 text-base sm:text-sm text-slate-800 dark:text-slate-200 focus:outline-emerald-500 font-semibold"
                >
                  <option value="cash">{t('common.paymentMethods.cash')}</option>
                  <option value="transfer">{t('common.paymentMethods.transfer')}</option>
                  <option value="bizum">{t('common.paymentMethods.bizum')}</option>
                </select>
              </div>
            </div>

            {paymentMethod === 'transfer' && teacher.bankAccount && (
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3 bg-slate-50 dark:bg-slate-800/40 text-xs">
                <span className="text-slate-500 dark:text-slate-400 block font-medium">{t('recordTeacherPayoutModal.bankAccountLabel')}</span>
                <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">{teacher.bankAccount}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                {t('recordTeacherPayoutModal.notesLabel')}
              </label>
              <input
                type="text"
                placeholder={t('recordTeacherPayoutModal.notesPlaceholder')}
                value={notes}
                onChange={e => setNotes(e.target.value)}
                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-emerald-500"
              />
            </div>
          </div>

          {/* Barra Inferior Fija: Siempre a la vista */}
          <div className="sticky bottom-0 z-10 px-5 py-3 border-t border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md flex items-center justify-end gap-3 shrink-0 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 sm:flex-none rounded-xl border border-slate-300 dark:border-slate-700 px-4 py-2.5 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition min-h-[44px] flex items-center justify-center"
            >
              {t('recordTeacherPayoutModal.cancel')}
            </button>
            <button
              type="submit"
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-emerald-700 shadow-md shadow-emerald-600/20 transition min-h-[44px]"
            >
              <Check className="h-4 w-4" />
              <span>{t('recordTeacherPayoutModal.confirm')}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
