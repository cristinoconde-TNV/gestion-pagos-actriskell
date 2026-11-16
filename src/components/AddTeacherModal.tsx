import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { MemberType, Teacher, TeacherPaymentScheme, PaymentMethod } from '../types';
import { createTranslator } from '../lib/i18n';
import { X, Check, AlertCircle, History, Plus, Trash2 } from 'lucide-react';

interface AddTeacherModalProps {
  isOpen: boolean;
  onClose: () => void;
  teacherToEdit?: Teacher | null;
}

export const AddTeacherModal: React.FC<AddTeacherModalProps> = ({ isOpen, onClose, teacherToEdit }) => {
  const {
    addTeacher,
    updateTeacher,
    memberStatusHistory,
    addStatusHistoryEntry,
    deleteStatusHistoryEntry,
    language
  } = useApp();
  const t = createTranslator(language);
  const todayDefault = new Date().toISOString().split('T')[0];

  const [name, setName] = useState(teacherToEdit?.name || '');
  const [email, setEmail] = useState(teacherToEdit?.email || '');
  const [phone, setPhone] = useState(teacherToEdit?.phone || '');
  const [paymentScheme, setPaymentScheme] = useState<TeacherPaymentScheme>(
    teacherToEdit?.paymentScheme || 'per_class'
  );
  const [ratePerClass, setRatePerClass] = useState<number>(teacherToEdit?.ratePerClass || 30);
  const [fixedMonthlyRate, setFixedMonthlyRate] = useState<number>(teacherToEdit?.fixedMonthlyRate || 400);
  const [revenueSharePercent, setRevenueSharePercent] = useState<number>(teacherToEdit?.revenueSharePercent || 60);
  const [preferredPaymentMethod, setPreferredPaymentMethod] = useState<PaymentMethod>(
    teacherToEdit?.preferredPaymentMethod || 'cash'
  );
  const [collectionType, setCollectionType] = useState<'personal' | 'association'>(
    teacherToEdit?.collectionType || 'personal'
  );
  const [bankAccount, setBankAccount] = useState(teacherToEdit?.bankAccount || '');
  const [active, setActive] = useState<boolean>(teacherToEdit?.active ?? true);
  const [memberNumber, setMemberNumber] = useState(teacherToEdit?.memberNumber || '');
  const [memberType, setMemberType] = useState<MemberType>(teacherToEdit?.memberType || 'socio');
  const [startDate, setStartDate] = useState(teacherToEdit?.startDate || todayDefault);
  const [endDate, setEndDate] = useState(teacherToEdit?.endDate || '');
  const [notes, setNotes] = useState(teacherToEdit?.notes || '');
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [showAddCycle, setShowAddCycle] = useState(false);
  const [cycleStatus, setCycleStatus] = useState<'active' | 'inactive'>('active');
  const [cycleMemberType, setCycleMemberType] = useState<MemberType>('socio');
  const [cycleStart, setCycleStart] = useState(todayDefault);
  const [cycleEnd, setCycleEnd] = useState('');
  const [cycleNotes, setCycleNotes] = useState('');
  const [isAddingCycle, setIsAddingCycle] = useState(false);

  const teacherHistory = useMemo(
    () =>
      teacherToEdit
        ? memberStatusHistory.filter(
            h => h.entityType === 'teacher' && h.entityId === teacherToEdit.id
          )
        : [],
    [memberStatusHistory, teacherToEdit]
  );

  useEffect(() => {
    if (!isOpen) return;
    const today = new Date().toISOString().split('T')[0];
    setName(teacherToEdit?.name || '');
    setEmail(teacherToEdit?.email || '');
    setPhone(teacherToEdit?.phone || '');
    setPaymentScheme(teacherToEdit?.paymentScheme || 'per_class');
    setRatePerClass(teacherToEdit?.ratePerClass ?? 30);
    setFixedMonthlyRate(teacherToEdit?.fixedMonthlyRate ?? 400);
    setRevenueSharePercent(teacherToEdit?.revenueSharePercent ?? 60);
    setPreferredPaymentMethod(teacherToEdit?.preferredPaymentMethod || 'cash');
    setCollectionType(teacherToEdit?.collectionType || 'personal');
    setBankAccount(teacherToEdit?.bankAccount || '');
    setActive(teacherToEdit?.active ?? true);
    setMemberNumber(teacherToEdit?.memberNumber || '');
    setMemberType(teacherToEdit?.memberType || 'socio');
    setStartDate(teacherToEdit?.startDate || today);
    setEndDate(teacherToEdit?.endDate || '');
    setNotes(teacherToEdit?.notes || '');
    setIsSaving(false);
    setErrorMsg(null);
    setShowAddCycle(false);
    setCycleStart(today);
    setCycleEnd('');
    setCycleNotes('');
  }, [isOpen, teacherToEdit]);

  if (!isOpen) return null;

  const handleAddCycle = async () => {
    if (!teacherToEdit || !cycleStart || isAddingCycle) return;
    setIsAddingCycle(true);
    setErrorMsg(null);
    try {
      const res = await addStatusHistoryEntry({
        entityType: 'teacher',
        entityId: teacherToEdit.id,
        status: cycleStatus,
        memberType: cycleMemberType,
        startDate: cycleStart,
        endDate: cycleEnd || undefined,
        notes: cycleNotes.trim() || undefined
      });
      if (!res.success) {
        setErrorMsg(res.error || t('addTeacherModal.cycleErrorFallback'));
        return;
      }
      setShowAddCycle(false);
      setCycleEnd('');
      setCycleNotes('');
    } finally {
      setIsAddingCycle(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || isSaving) return;

    setIsSaving(true);
    setErrorMsg(null);

    try {
      const payload = {
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        paymentScheme,
        ratePerClass: Number(ratePerClass),
        fixedMonthlyRate: Number(fixedMonthlyRate),
        revenueSharePercent: Number(revenueSharePercent),
        preferredPaymentMethod,
        collectionType,
        bankAccount: bankAccount.trim(),
        active,
        memberNumber: memberNumber.trim() || undefined,
        memberType,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        notes: notes.trim()
      };

      const res = teacherToEdit
        ? await updateTeacher(teacherToEdit.id, payload)
        : await addTeacher(payload);

      if (!res.success) {
        setErrorMsg(res.error || t('addTeacherModal.saveErrorFallback'));
        return;
      }

      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : t('addTeacherModal.unexpectedErrorFallback'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/70 p-0 sm:p-4 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl bg-white dark:bg-slate-900 shadow-2xl border border-slate-200 dark:border-slate-800 max-h-[92dvh] sm:max-h-[88vh] flex flex-col overflow-hidden">
        
        {/* Cabecera Fija con botón táctil de 44px */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md shrink-0">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white leading-tight">
              {teacherToEdit ? t('addTeacherModal.editTitle') : t('addTeacherModal.newTitle')}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t('addTeacherModal.subtitle')}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('addTeacherModal.closeAria')}
            className="flex h-11 w-11 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200 transition touch-manipulation active:scale-95"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Formulario con cuerpo escroleable independiente */}
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto overscroll-contain p-5 space-y-4">
            {errorMsg && (
              <div className="rounded-xl border border-rose-300 bg-rose-50 dark:border-rose-800 dark:bg-rose-950/40 px-3 py-2.5 text-xs text-rose-800 dark:text-rose-200 flex items-start gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span className="font-semibold">{errorMsg}</span>
              </div>
            )}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                {t('addTeacherModal.fullNameLabel')}
              </label>
              <input
                type="text"
                required
                placeholder={t('addTeacherModal.fullNamePlaceholder')}
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2.5 text-base sm:text-sm text-slate-800 dark:text-slate-200 focus:outline-emerald-500"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {t('addTeacherModal.phoneLabel')}
                </label>
                <input
                  type="tel"
                  placeholder={t('addTeacherModal.phonePlaceholder')}
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2.5 text-base sm:text-sm text-slate-800 dark:text-slate-200 focus:outline-emerald-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {t('addTeacherModal.emailLabel')}
                </label>
                <input
                  type="email"
                  placeholder={t('addTeacherModal.emailPlaceholder')}
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2.5 text-base sm:text-sm text-slate-800 dark:text-slate-200 focus:outline-emerald-500"
                />
              </div>
            </div>

            {/* Membresía y Fechas */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {t('addTeacherModal.memberTypeLabel')}
                </label>
                <select
                  value={memberType}
                  onChange={e => setMemberType(e.target.value as MemberType)}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2.5 text-base sm:text-sm text-slate-800 dark:text-slate-200 focus:outline-emerald-500 font-semibold"
                >
                  <option value="socio">{t('addTeacherModal.memberTypes.socio')}</option>
                  <option value="monitor_no_socio">{t('addTeacherModal.memberTypes.monitor_no_socio')}</option>
                  <option value="alumno_no_socio">{t('addTeacherModal.memberTypes.alumno_no_socio')}</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {t('addTeacherModal.memberNumberLabel')}
                </label>
                <input
                  type="text"
                  placeholder={t('addTeacherModal.memberNumberPlaceholder')}
                  value={memberNumber}
                  onChange={e => setMemberNumber(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2.5 text-sm font-mono text-slate-800 dark:text-slate-200 focus:outline-emerald-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {t('addTeacherModal.startDateLabel')}
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-emerald-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {t('addTeacherModal.endDateLabel')}
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-emerald-500"
                />
              </div>
            </div>

            {/* Esquema Salarial */}
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-50/40 dark:bg-emerald-950/20 p-4 space-y-3">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300 block">
                {t('addTeacherModal.remunerationTitle')}
              </span>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {t('addTeacherModal.contractTypeLabel')}
                </label>
                <select
                  value={paymentScheme}
                  onChange={e => setPaymentScheme(e.target.value as TeacherPaymentScheme)}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2.5 text-base sm:text-sm text-slate-800 dark:text-slate-200 focus:outline-emerald-500 font-semibold"
                >
                  <option value="per_class">{t('addTeacherModal.schemes.per_class')}</option>
                  <option value="monthly_fixed">{t('addTeacherModal.schemes.monthly_fixed')}</option>
                  <option value="revenue_share">{t('addTeacherModal.schemes.revenue_share')}</option>
                </select>
              </div>

              {paymentScheme === 'per_class' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    {t('addTeacherModal.ratePerClassLabel')}
                  </label>
                  <div className="relative max-w-[160px]">
                    <input
                      type="number"
                      step="1"
                      min="0"
                      value={ratePerClass}
                      onChange={e => setRatePerClass(Number(e.target.value))}
                      className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 pr-7 pl-3 py-2 text-base font-bold text-slate-900 dark:text-white focus:outline-emerald-500 text-right"
                    />
                    <span className="absolute right-2.5 top-2.5 text-xs font-bold text-slate-400 pointer-events-none">€</span>
                  </div>
                </div>
              )}

              {paymentScheme === 'monthly_fixed' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    {t('addTeacherModal.fixedMonthlyRateLabel')}
                  </label>
                  <div className="relative max-w-[160px]">
                    <input
                      type="number"
                      step="5"
                      min="0"
                      value={fixedMonthlyRate}
                      onChange={e => setFixedMonthlyRate(Number(e.target.value))}
                      className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 pr-7 pl-3 py-2 text-base font-bold text-slate-900 dark:text-white focus:outline-emerald-500 text-right"
                    />
                    <span className="absolute right-2.5 top-2.5 text-xs font-bold text-slate-400 pointer-events-none">€</span>
                  </div>
                </div>
              )}

              {paymentScheme === 'revenue_share' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    {t('addTeacherModal.revenueShareLabel')}
                  </label>
                  <div className="relative max-w-[160px]">
                    <input
                      type="number"
                      step="1"
                      min="1"
                      max="100"
                      value={revenueSharePercent}
                      onChange={e => setRevenueSharePercent(Number(e.target.value))}
                      className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 pr-7 pl-3 py-2 text-base font-bold text-slate-900 dark:text-white focus:outline-emerald-500 text-right"
                    />
                    <span className="absolute right-2.5 top-2.5 text-xs font-bold text-slate-400 pointer-events-none">%</span>
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {t('addTeacherModal.preferredMethodLabel')}
                </label>
                <select
                  value={preferredPaymentMethod}
                  onChange={e => setPreferredPaymentMethod(e.target.value as PaymentMethod)}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2.5 text-base sm:text-sm text-slate-800 dark:text-slate-200 focus:outline-emerald-500"
                >
                  <option value="cash">{t('common.paymentMethods.cash')}</option>
                  <option value="transfer">{t('common.paymentMethods.transfer')}</option>
                  <option value="bizum">{t('common.paymentMethods.bizum')}</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {t('addTeacherModal.ibanLabel')}
                </label>
                <input
                  type="text"
                  placeholder={t('addTeacherModal.ibanPlaceholder')}
                  value={bankAccount}
                  onChange={e => setBankAccount(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm font-mono text-slate-800 dark:text-slate-200 focus:outline-emerald-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {t('addTeacherModal.defaultCollectionLabel')}
                </label>
                <select
                  value={collectionType}
                  onChange={e => setCollectionType(e.target.value as 'personal' | 'association')}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2.5 text-base sm:text-sm text-slate-800 dark:text-slate-200 focus:outline-emerald-500"
                >
                  <option value="personal">{t('addTeacherModal.collectionPersonal')}</option>
                  <option value="association">{t('addTeacherModal.collectionAssociation')}</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {t('addTeacherModal.centerStatusLabel')}
                </label>
                <select
                  value={active ? 'active' : 'inactive'}
                  onChange={e => setActive(e.target.value === 'active')}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2.5 text-base sm:text-sm text-slate-800 dark:text-slate-200 focus:outline-emerald-500 font-semibold"
                >
                  <option value="active">{t('addTeacherModal.statusActiveExercise')}</option>
                  <option value="inactive">{t('addTeacherModal.statusInactive')}</option>
                </select>
              </div>
            </div>

            {/* Historial de Estados / Reincorporaciones (solo al editar) */}
            {teacherToEdit && (
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/30 p-3 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-200">
                    <History className="h-3.5 w-3.5 text-indigo-600" />
                    <span>{t('addTeacherModal.history.title', { count: teacherHistory.length })}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowAddCycle(v => !v)}
                    className="inline-flex items-center gap-1 rounded-lg bg-indigo-600/10 px-2 py-1 text-[11px] font-bold text-indigo-700 dark:text-indigo-300 hover:bg-indigo-600/20 transition"
                  >
                    <Plus className="h-3 w-3" />
                    <span>{showAddCycle ? t('addTeacherModal.history.close') : t('addTeacherModal.history.addCycle')}</span>
                  </button>
                </div>

                {showAddCycle && (
                  <div className="rounded-lg border border-indigo-500/30 bg-white dark:bg-slate-900 p-2.5 space-y-2 text-xs">
                    <div className="grid grid-cols-2 gap-2">
                      <select
                        value={cycleStatus}
                        onChange={e => setCycleStatus(e.target.value as 'active' | 'inactive')}
                        className="rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1.5 font-semibold"
                      >
                        <option value="active">{t('addTeacherModal.history.cycleActive')}</option>
                        <option value="inactive">{t('addTeacherModal.history.cycleInactive')}</option>
                      </select>
                      <select
                        value={cycleMemberType}
                        onChange={e => setCycleMemberType(e.target.value as MemberType)}
                        className="rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1.5 font-semibold"
                      >
                        <option value="socio">{t('addTeacherModal.memberTypes.socio')}</option>
                        <option value="monitor_no_socio">{t('addTeacherModal.memberTypes.monitor_no_socio')}</option>
                        <option value="alumno_no_socio">{t('addTeacherModal.memberTypes.alumno_no_socio')}</option>
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="date"
                        value={cycleStart}
                        onChange={e => setCycleStart(e.target.value)}
                        className="rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1.5"
                      />
                      <input
                        type="date"
                        value={cycleEnd}
                        onChange={e => setCycleEnd(e.target.value)}
                        className="rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1.5"
                      />
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder={t('addTeacherModal.history.notesPlaceholder')}
                        value={cycleNotes}
                        onChange={e => setCycleNotes(e.target.value)}
                        className="flex-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1.5"
                      />
                      <button
                        type="button"
                        disabled={isAddingCycle}
                        onClick={handleAddCycle}
                        className="rounded-lg bg-indigo-600 px-3 py-1.5 font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
                      >
                        {isAddingCycle ? t('addTeacherModal.history.saving') : t('addTeacherModal.history.save')}
                      </button>
                    </div>
                  </div>
                )}

                {teacherHistory.length === 0 ? (
                  <p className="text-[11px] text-slate-400 italic">
                    {t('addTeacherModal.history.empty')}
                  </p>
                ) : (
                  <div className="divide-y divide-slate-200/70 dark:divide-slate-700/60 max-h-36 overflow-y-auto text-[11px]">
                    {teacherHistory.map(h => (
                      <div key={h.id} className="py-1.5 flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <span
                            className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold mr-1.5 ${
                              h.status === 'active'
                                ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                                : 'bg-slate-500/15 text-slate-600 dark:text-slate-400'
                            }`}
                          >
                            {h.status === 'active' ? t('addTeacherModal.history.badgeActive') : t('addTeacherModal.history.badgeInactive')}
                          </span>
                          <span className="font-semibold text-slate-700 dark:text-slate-200 tabular-nums">
                            {h.startDate} {h.endDate ? `→ ${h.endDate}` : t('addTeacherModal.history.currentSuffix')}
                          </span>
                          {h.notes && (
                            <span className="block text-slate-500 dark:text-slate-400 truncate">
                              {h.notes}
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => deleteStatusHistoryEntry(h.id)}
                          title={t('addTeacherModal.history.deleteTooltip')}
                          className="p-1 text-slate-400 hover:text-rose-600 shrink-0"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                {t('addTeacherModal.notesLabel')}
              </label>
              <input
                type="text"
                placeholder={t('addTeacherModal.notesPlaceholder')}
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
              disabled={isSaving}
              onClick={onClose}
              className="flex-1 sm:flex-none rounded-xl border border-slate-300 dark:border-slate-700 px-4 py-2.5 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition min-h-[44px] flex items-center justify-center disabled:opacity-50"
            >
              {t('addTeacherModal.cancel')}
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-emerald-700 shadow-md shadow-emerald-600/20 transition min-h-[44px] disabled:opacity-60"
            >
              <Check className="h-4 w-4" />
              <span>
                {isSaving
                  ? t('addTeacherModal.saving')
                  : teacherToEdit
                  ? t('addTeacherModal.updateButton')
                  : t('addTeacherModal.createButton')}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
