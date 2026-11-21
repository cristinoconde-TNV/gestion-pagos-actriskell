import React, { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import {
  AuthUser,
  MemberAnnualFee,
  PaymentMethod,
  PaymentStatus,
  UserRole
} from '../types';
import { createTranslator, TranslationKey } from '../lib/i18n';
import {
  ANNUAL_FEE_CONFIG_KEY,
  isProfileEligibleForSocioAnnualFee,
  parseSocioAnnualFeeConfig
} from '../lib/annualFee';
import { ROLE_I18N_KEY_MAP } from '../lib/authRole';
import {
  AlertCircle,
  Award,
  CheckCircle2,
  Clock,
  CreditCard,
  Database,
  Edit2,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserCheck,
  Users,
  X
} from 'lucide-react';

interface AnnualFeeRowItem {
  profile: AuthUser;
  fee: MemberAnnualFee | null;
  effectiveStatus: PaymentStatus | 'unregistered';
  expectedAmount: number;
  paidAmount: number;
  pendingAmount: number;
}

export const MemberAnnualFeesSection: React.FC = () => {
  const {
    currentUser,
    currentRole,
    profiles,
    appConfigs,
    updateAppConfig,
    memberAnnualFees,
    memberAnnualFeesTableMissing,
    upsertMemberAnnualFee,
    generateAnnualFeesForYear,
    deleteMemberAnnualFee,
    language
  } = useApp();
  const t = createTranslator(language);

  const isStrictAdmin =
    currentUser?.role === UserRole.Admin && currentRole === UserRole.Admin;

  const currentYear = new Date().getFullYear();
  const annualFeeConfig = parseSocioAnnualFeeConfig(appConfigs);

  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [strictSocioRoleOnly, setStrictSocioRoleOnly] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [bannerMessage, setBannerMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Quick edit default fee amount inline modal/popover state
  const [isEditingDefaultAmount, setIsEditingDefaultAmount] = useState<boolean>(false);
  const [defaultAmountDraft, setDefaultAmountDraft] = useState<string>(
    String(annualFeeConfig.defaultAmount)
  );

  // Edit / Collect modal state
  const [editingItem, setEditingItem] = useState<AnnualFeeRowItem | null>(null);
  const [formAmount, setFormAmount] = useState<string>(String(annualFeeConfig.defaultAmount));
  const [formPaidAmount, setFormPaidAmount] = useState<string>(
    String(annualFeeConfig.defaultAmount)
  );
  const [formStatus, setFormStatus] = useState<PaymentStatus>('paid');
  const [formMethod, setFormMethod] = useState<PaymentMethod>('cash');
  const [formDate, setFormDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [formReceipt, setFormReceipt] = useState<string>('');
  const [formNotes, setFormNotes] = useState<string>('');
  const [formError, setFormError] = useState<string | null>(null);
  const [isSavingForm, setIsSavingForm] = useState<boolean>(false);

  // Delete confirmation modal
  const [feeToDelete, setFeeToDelete] = useState<MemberAnnualFee | null>(null);

  const availableYears = useMemo(() => {
    const yearSet = new Set<number>([currentYear - 1, currentYear, currentYear + 1]);
    memberAnnualFees.forEach(f => {
      if (Number.isFinite(f.feeYear)) yearSet.add(f.feeYear);
    });
    return Array.from(yearSet).sort((a, b) => b - a);
  }, [currentYear, memberAnnualFees]);

  const rows = useMemo<AnnualFeeRowItem[]>(() => {
    if (!isStrictAdmin) return [];
    const feesForYear = memberAnnualFees.filter(f => f.feeYear === selectedYear);
    const feeByProfileId = new Map<string, MemberAnnualFee>();
    for (const fee of feesForYear) {
      feeByProfileId.set(fee.profileId, fee);
    }

    const eligibleProfiles = profiles.filter(p =>
      isProfileEligibleForSocioAnnualFee(p, strictSocioRoleOnly)
    );
    const eligibleProfileIds = new Set(eligibleProfiles.map(p => p.id));

    const combinedRows: AnnualFeeRowItem[] = eligibleProfiles.map(profile => {
      const fee = feeByProfileId.get(profile.id) || null;
      const expectedAmount = fee ? fee.amount : annualFeeConfig.defaultAmount;
      const paidAmount = fee
        ? fee.status === 'paid'
          ? fee.paidAmount > 0
            ? fee.paidAmount
            : fee.amount
          : fee.status === 'partial'
          ? fee.paidAmount
          : 0
        : 0;
      const effectiveStatus: PaymentStatus | 'unregistered' = fee ? fee.status : 'unregistered';
      const pendingAmount =
        effectiveStatus === 'paid' ||
        effectiveStatus === 'exempt' ||
        effectiveStatus === 'cancelled'
          ? 0
          : Math.max(0, expectedAmount - paidAmount);

      return {
        profile,
        fee,
        effectiveStatus,
        expectedAmount,
        paidAmount,
        pendingAmount
      };
    });

    // Include historical annual fee records for the selected year if a Socio later left/changed role
    for (const fee of feesForYear) {
      if (eligibleProfileIds.has(fee.profileId)) continue;
      const linkedProfile = profiles.find(p => p.id === fee.profileId);
      if (strictSocioRoleOnly && linkedProfile && linkedProfile.role !== UserRole.Socio) {
        continue;
      }
      const fallbackProfile: AuthUser = linkedProfile || {
        id: fee.profileId,
        name: fee.memberName,
        email: fee.memberEmail,
        role: UserRole.Socio,
        access: false,
        isSocio: true,
        memberNumber: fee.memberNumber
      };
      const paidAmount =
        fee.status === 'paid'
          ? fee.paidAmount > 0
            ? fee.paidAmount
            : fee.amount
          : fee.status === 'partial'
          ? fee.paidAmount
          : 0;
      const pendingAmount =
        fee.status === 'paid' || fee.status === 'exempt' || fee.status === 'cancelled'
          ? 0
          : Math.max(0, fee.amount - paidAmount);

      combinedRows.push({
        profile: fallbackProfile,
        fee,
        effectiveStatus: fee.status,
        expectedAmount: fee.amount,
        paidAmount,
        pendingAmount
      });
    }

    return combinedRows.sort((a, b) => a.profile.name.localeCompare(b.profile.name));
  }, [
    isStrictAdmin,
    memberAnnualFees,
    selectedYear,
    profiles,
    strictSocioRoleOnly,
    annualFeeConfig.defaultAmount
  ]);

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return rows.filter(item => {
      const matchesQuery =
        !q ||
        item.profile.name.toLowerCase().includes(q) ||
        item.profile.email.toLowerCase().includes(q) ||
        (item.profile.memberNumber || '').toLowerCase().includes(q) ||
        (item.fee?.receiptNumber || '').toLowerCase().includes(q);

      let matchesStatus = true;
      if (statusFilter === 'paid') matchesStatus = item.effectiveStatus === 'paid';
      else if (statusFilter === 'partial') matchesStatus = item.effectiveStatus === 'partial';
      else if (statusFilter === 'pending') {
        matchesStatus =
          item.effectiveStatus === 'pending' ||
          item.effectiveStatus === 'overdue' ||
          item.effectiveStatus === 'unregistered';
      } else if (statusFilter === 'overdue') matchesStatus = item.effectiveStatus === 'overdue';
      else if (statusFilter === 'exempt') {
        matchesStatus =
          item.effectiveStatus === 'exempt' || item.effectiveStatus === 'cancelled';
      } else if (statusFilter === 'unregistered') {
        matchesStatus = item.effectiveStatus === 'unregistered';
      }

      return matchesQuery && matchesStatus;
    });
  }, [rows, searchQuery, statusFilter]);

  const summary = useMemo(() => {
    const eligibleCount = rows.length;
    const paidCount = rows.filter(r => r.effectiveStatus === 'paid').length;
    const partialCount = rows.filter(r => r.effectiveStatus === 'partial').length;
    const pendingCount = rows.filter(
      r =>
        r.effectiveStatus === 'pending' ||
        r.effectiveStatus === 'overdue' ||
        r.effectiveStatus === 'unregistered'
    ).length;
    const exemptCount = rows.filter(
      r => r.effectiveStatus === 'exempt' || r.effectiveStatus === 'cancelled'
    ).length;
    const unregisteredCount = rows.filter(
      r => r.effectiveStatus === 'unregistered' && r.profile.access !== false && r.profile.active !== false
    ).length;

    const totalCollected = rows.reduce((sum, r) => sum + r.paidAmount, 0);
    const totalPending = rows.reduce((sum, r) => sum + r.pendingAmount, 0);

    return {
      eligibleCount,
      paidCount,
      partialCount,
      pendingCount,
      exemptCount,
      unregisteredCount,
      totalCollected,
      totalPending
    };
  }, [rows]);

  if (!isStrictAdmin) {
    return null;
  }

  const getMethodLabel = (method: PaymentMethod) => {
    const map: Record<PaymentMethod, TranslationKey> = {
      cash: 'common.paymentMethods.cash',
      transfer: 'common.paymentMethods.transferShort',
      bizum: 'common.paymentMethods.bizum',
      card: 'common.paymentMethods.card'
    };
    return t(map[method] || 'common.paymentMethods.cash');
  };

  const getRoleLabel = (role: UserRole) => {
    const key = ROLE_I18N_KEY_MAP[role];
    return key ? t(`common.roles.${key}` as TranslationKey) : role;
  };

  const handleSaveDefaultAmount = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = Number(defaultAmountDraft);
    if (!Number.isFinite(parsed) || parsed < 0) return;
    await updateAppConfig(
      ANNUAL_FEE_CONFIG_KEY,
      String(parsed),
      true,
      'Importe anual estándar (€) aplicable exclusivamente a socios activos'
    );
    setIsEditingDefaultAmount(false);
    setBannerMessage({
      type: 'success',
      text: t('paymentsView.annualFees.defaultAmountSaved', { amount: parsed.toFixed(2) })
    });
  };

  const handleGeneratePending = async () => {
    setIsGenerating(true);
    setBannerMessage(null);
    const res = await generateAnnualFeesForYear({
      feeYear: selectedYear,
      amount: annualFeeConfig.defaultAmount,
      strictSocioRoleOnly
    });
    setIsGenerating(false);

    if (!res.success) {
      setBannerMessage({
        type: 'error',
        text: res.error || t('paymentsView.annualFees.generateError')
      });
      return;
    }

    setBannerMessage({
      type: 'success',
      text:
        res.createdCount > 0
          ? t('paymentsView.annualFees.generateSuccess', {
              count: res.createdCount,
              year: selectedYear
            })
          : t('paymentsView.annualFees.generateNothingNew', { year: selectedYear })
    });
  };

  const handleQuickCollect = async (item: AnnualFeeRowItem) => {
    setBannerMessage(null);
    const targetAmount = item.fee ? item.fee.amount : annualFeeConfig.defaultAmount;
    const res = await upsertMemberAnnualFee({
      id: item.fee?.id,
      profileId: item.profile.id,
      memberName: item.profile.name,
      memberEmail: item.profile.email,
      memberNumber: item.profile.memberNumber,
      feeYear: selectedYear,
      amount: targetAmount,
      paidAmount: targetAmount,
      status: 'paid',
      paymentMethod: item.fee?.paymentMethod || 'cash',
      paymentDate: new Date().toISOString().split('T')[0],
      receiptNumber: item.fee?.receiptNumber,
      notes: item.fee?.notes
    });

    if (!res.success) {
      setBannerMessage({
        type: 'error',
        text: res.error || t('paymentsView.annualFees.saveError')
      });
    } else {
      setBannerMessage({
        type: 'success',
        text: t('paymentsView.annualFees.collectedToast', {
          name: item.profile.name,
          year: selectedYear
        })
      });
    }
  };

  const openEditModal = (item: AnnualFeeRowItem) => {
    const baseAmount = item.fee ? item.fee.amount : annualFeeConfig.defaultAmount;
    const initialStatus: PaymentStatus = item.fee ? item.fee.status : 'paid';
    const initialPaid = item.fee
      ? item.fee.status === 'paid'
        ? item.fee.paidAmount > 0
          ? item.fee.paidAmount
          : baseAmount
        : item.fee.paidAmount
      : baseAmount;

    setEditingItem(item);
    setFormAmount(String(baseAmount));
    setFormPaidAmount(String(initialPaid));
    setFormStatus(initialStatus);
    setFormMethod(item.fee?.paymentMethod || 'cash');
    setFormDate(item.fee?.paymentDate || new Date().toISOString().split('T')[0]);
    setFormReceipt(item.fee?.receiptNumber || '');
    setFormNotes(item.fee?.notes || '');
    setFormError(null);
  };

  const handleStatusChangeInModal = (nextStatus: PaymentStatus) => {
    setFormStatus(nextStatus);
    const parsedTotal = Number(formAmount);
    const total = Number.isFinite(parsedTotal) && parsedTotal >= 0 ? parsedTotal : 0;
    if (nextStatus === 'paid') {
      setFormPaidAmount(String(total));
    } else if (nextStatus === 'partial') {
      const currentPaid = Number(formPaidAmount);
      if (!Number.isFinite(currentPaid) || currentPaid <= 0 || currentPaid >= total) {
        setFormPaidAmount(String(Math.max(1, Number((total / 2).toFixed(2)))));
      }
    } else {
      setFormPaidAmount('0');
    }
  };

  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;

    const total = Number(formAmount);
    const paid = Number(formPaidAmount);

    if (!Number.isFinite(total) || total < 0) {
      setFormError(t('paymentsView.annualFees.invalidAmountError'));
      return;
    }

    if (formStatus === 'partial') {
      if (!Number.isFinite(paid) || paid <= 0) {
        setFormError(t('paymentsView.annualFees.invalidPartialError'));
        return;
      }
    }

    setIsSavingForm(true);
    setFormError(null);

    const res = await upsertMemberAnnualFee({
      id: editingItem.fee?.id,
      profileId: editingItem.profile.id,
      memberName: editingItem.profile.name,
      memberEmail: editingItem.profile.email,
      memberNumber: editingItem.profile.memberNumber,
      feeYear: selectedYear,
      amount: total,
      paidAmount: formStatus === 'paid' ? total : formStatus === 'partial' ? paid : 0,
      status: formStatus,
      paymentMethod: formMethod,
      paymentDate:
        formStatus === 'paid' || formStatus === 'partial' ? formDate : undefined,
      receiptNumber: formReceipt.trim() || undefined,
      notes: formNotes.trim() || undefined
    });

    setIsSavingForm(false);
    if (!res.success) {
      setFormError(res.error || t('paymentsView.annualFees.saveError'));
      return;
    }

    setEditingItem(null);
    setBannerMessage({
      type: 'success',
      text: t('paymentsView.annualFees.savedToast', {
        name: editingItem.profile.name,
        year: selectedYear
      })
    });
  };

  const renderStatusBadge = (item: AnnualFeeRowItem) => {
    switch (item.effectiveStatus) {
      case 'paid':
        return (
          <span className="inline-flex items-center gap-1 font-bold text-emerald-600 dark:text-emerald-400 text-xs">
            <CheckCircle2 className="h-3.5 w-3.5" />
            {t('paymentsView.statusPaid')}
          </span>
        );
      case 'partial':
        return (
          <div className="flex flex-col">
            <span className="inline-flex items-center gap-1 font-bold text-orange-600 dark:text-orange-400 text-xs">
              <Clock className="h-3.5 w-3.5" />
              {t('paymentsView.statusPartial')}
            </span>
            <span className="text-[10px] font-medium text-orange-500">
              {t('paymentsView.missingAmount', { amount: item.pendingAmount.toFixed(2) })}
            </span>
          </div>
        );
      case 'overdue':
        return (
          <span className="inline-flex items-center gap-1 font-bold text-rose-600 dark:text-rose-400 text-xs">
            <AlertCircle className="h-3.5 w-3.5" />
            {t('paymentsView.statusOverdue')}
          </span>
        );
      case 'exempt':
        return (
          <span className="inline-flex items-center gap-1 font-bold text-indigo-600 dark:text-indigo-400 text-xs">
            <CheckCircle2 className="h-3.5 w-3.5" />
            {t('paymentsView.statusExempt')}
          </span>
        );
      case 'cancelled':
        return (
          <span className="inline-flex items-center gap-1 font-bold text-zinc-500 dark:text-zinc-400 text-xs line-through">
            {t('paymentsView.statusCancelled')}
          </span>
        );
      case 'unregistered':
        return (
          <span className="inline-flex items-center gap-1 font-bold text-slate-500 dark:text-slate-400 text-xs">
            <Clock className="h-3.5 w-3.5" />
            {t('paymentsView.annualFees.statusUnregistered')}
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 font-bold text-amber-600 dark:text-amber-400 text-xs">
            <Clock className="h-3.5 w-3.5" />
            {t('paymentsView.statusPending')}
          </span>
        );
    }
  };

  return (
    <div className="space-y-5">
      {/* Cabecera Exclusiva Administrador */}
      <div className="rounded-2xl border border-indigo-200/80 dark:border-indigo-900/50 bg-gradient-to-br from-indigo-50/80 via-white to-emerald-50/40 dark:from-indigo-950/30 dark:via-slate-900 dark:to-slate-900 p-4 sm:p-5 shadow-xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <div className="h-8 w-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-xs">
                <Award className="h-4 w-4" />
              </div>
              <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white">
                {t('paymentsView.annualFees.title', { year: selectedYear })}
              </h2>
              <span className="inline-flex items-center gap-1 rounded-full bg-indigo-500/15 border border-indigo-500/25 px-2.5 py-0.5 text-[10px] font-extrabold text-indigo-700 dark:text-indigo-300">
                <ShieldCheck className="h-3 w-3" />
                {t('paymentsView.annualFees.adminExclusiveBadge')}
              </span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300">
              {t('paymentsView.annualFees.subtitle')}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Selector de Año */}
            <select
              value={selectedYear}
              onChange={e => setSelectedYear(Number(e.target.value))}
              aria-label={t('paymentsView.annualFees.yearLabel')}
              className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-extrabold text-slate-800 dark:text-white min-h-[40px]"
            >
              {availableYears.map(year => (
                <option key={year} value={year}>
                  {t('paymentsView.annualFees.yearOption', { year })}
                </option>
              ))}
            </select>

            {/* Importe estándar con edición rápida */}
            {isEditingDefaultAmount ? (
              <form onSubmit={handleSaveDefaultAmount} className="flex items-center gap-1.5">
                <input
                  type="number"
                  min={0}
                  step="0.5"
                  value={defaultAmountDraft}
                  onChange={e => setDefaultAmountDraft(e.target.value)}
                  className="w-20 rounded-xl border border-indigo-400 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs font-bold text-slate-900 dark:text-white min-h-[40px] tabular-nums"
                />
                <button
                  type="submit"
                  className="rounded-xl bg-indigo-600 px-3 py-2 text-xs font-bold text-white hover:bg-indigo-700 min-h-[40px]"
                >
                  {t('paymentsView.annualFees.saveFeeConfig')}
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditingDefaultAmount(false)}
                  className="rounded-xl border border-slate-300 dark:border-slate-700 px-2.5 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 min-h-[40px]"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setDefaultAmountDraft(String(annualFeeConfig.defaultAmount));
                  setIsEditingDefaultAmount(true);
                }}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition min-h-[40px]"
              >
                <span>
                  {t('paymentsView.annualFees.defaultFeeBadge', {
                    amount: annualFeeConfig.defaultAmount.toFixed(2)
                  })}
                </span>
                <Edit2 className="h-3 w-3 text-slate-400" />
              </button>
            )}

            {/* Generar cuotas pendientes para socios sin registro */}
            <button
              type="button"
              disabled={isGenerating || summary.unregisteredCount === 0 || memberAnnualFeesTableMissing}
              onClick={() => void handleGeneratePending()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-45 px-3.5 py-2 text-xs font-bold text-white transition shadow-xs min-h-[40px] active:scale-95"
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>
                {isGenerating
                  ? t('paymentsView.annualFees.generatingButton')
                  : t('paymentsView.annualFees.generateButton', {
                      count: summary.unregisteredCount
                    })}
              </span>
            </button>
          </div>
        </div>

        {/* Selector de ámbito (Todos los Socios vs Solo rol Socio) */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200/70 dark:border-slate-800">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
              {t('paymentsView.annualFees.scopeLabel')}
            </span>
            <div className="inline-flex rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-0.5">
              <button
                type="button"
                onClick={() => setStrictSocioRoleOnly(false)}
                className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition ${
                  !strictSocioRoleOnly
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {t('paymentsView.annualFees.scopeAllSocios')}
              </button>
              <button
                type="button"
                onClick={() => setStrictSocioRoleOnly(true)}
                className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition ${
                  strictSocioRoleOnly
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {t('paymentsView.annualFees.scopeRoleSocioOnly')}
              </button>
            </div>
          </div>

          {!annualFeeConfig.enabled && (
            <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-lg px-2.5 py-1">
              {t('paymentsView.annualFees.configInactiveNotice')}
            </span>
          )}
        </div>
      </div>

      {/* Aviso si falta la tabla en Supabase */}
      {memberAnnualFeesTableMissing && (
        <div className="rounded-2xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-4 flex items-start gap-3">
          <Database className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-900 dark:text-amber-200 space-y-1">
            <div className="font-extrabold">
              {t('paymentsView.annualFees.tableMissingTitle')}
            </div>
            <p className="leading-relaxed">
              {t('paymentsView.annualFees.tableMissingDesc')}
            </p>
          </div>
        </div>
      )}

      {/* Mensaje de feedback */}
      {bannerMessage && (
        <div
          className={`rounded-xl border px-3.5 py-2.5 text-xs font-semibold flex items-center justify-between gap-2 ${
            bannerMessage.type === 'success'
              ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300'
              : 'border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300'
          }`}
        >
          <span>{bannerMessage.text}</span>
          <button
            type="button"
            onClick={() => setBannerMessage(null)}
            className="p-1 opacity-70 hover:opacity-100"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Tarjetas KPI */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-[11px] font-bold uppercase tracking-wider">
              {t('paymentsView.annualFees.kpiEligible')}
            </span>
            <Users className="h-4 w-4 text-indigo-500" />
          </div>
          <div className="mt-1.5 text-xl font-black tabular-nums text-slate-900 dark:text-white">
            {summary.eligibleCount}
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            {t('paymentsView.annualFees.kpiPaidVsPending', {
              paid: summary.paidCount,
              pending: summary.pendingCount + summary.partialCount
            })}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-[11px] font-bold uppercase tracking-wider">
              {t('paymentsView.annualFees.kpiCollected')}
            </span>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </div>
          <div className="mt-1.5 text-xl font-black tabular-nums text-emerald-600 dark:text-emerald-400">
            {summary.totalCollected.toFixed(2)} €
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            {t('paymentsView.annualFees.kpiPaidCount', {
              count: summary.paidCount,
              partial: summary.partialCount
            })}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-[11px] font-bold uppercase tracking-wider">
              {t('paymentsView.annualFees.kpiPending')}
            </span>
            <Clock className="h-4 w-4 text-amber-500" />
          </div>
          <div className="mt-1.5 text-xl font-black tabular-nums text-amber-600 dark:text-amber-400">
            {summary.totalPending.toFixed(2)} €
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            {t('paymentsView.annualFees.kpiPendingCount', { count: summary.pendingCount })}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-[11px] font-bold uppercase tracking-wider">
              {t('paymentsView.annualFees.kpiExempt')}
            </span>
            <UserCheck className="h-4 w-4 text-slate-500" />
          </div>
          <div className="mt-1.5 text-xl font-black tabular-nums text-slate-900 dark:text-white">
            {summary.exemptCount}
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            {t('paymentsView.annualFees.kpiYearLabel', { year: selectedYear })}
          </p>
        </div>
      </div>

      {/* Barra de Búsqueda y Filtros */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder={t('paymentsView.annualFees.searchPlaceholder')}
            className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 pl-9 pr-3 py-1.5 text-xs text-slate-900 dark:text-white focus:outline-indigo-500 min-h-[38px]"
          />
        </div>

        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 min-h-[38px]"
        >
          <option value="all">{t('paymentsView.allStatuses')}</option>
          <option value="paid">{t('paymentsView.statusPaidOnly')}</option>
          <option value="partial">{t('paymentsView.statusPartialOnly')}</option>
          <option value="pending">{t('paymentsView.statusPendingOnly')}</option>
          <option value="overdue">{t('paymentsView.statusOverdue')}</option>
          <option value="unregistered">{t('paymentsView.annualFees.statusUnregistered')}</option>
          <option value="exempt">{t('paymentsView.annualFees.statusExemptOrCancelled')}</option>
        </select>
      </div>

      {/* Listado Responsive de Cuotas Anuales */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs overflow-hidden">
        {/* Vista Móvil (Tarjetas) */}
        <div className="sm:hidden divide-y divide-slate-100 dark:divide-slate-800">
          {filteredRows.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400">
              {t('paymentsView.annualFees.empty')}
            </div>
          ) : (
            filteredRows.map(item => (
              <div key={item.profile.id} className="p-4 space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-sm font-extrabold text-slate-900 dark:text-white truncate">
                        {item.profile.name}
                      </span>
                      {item.profile.memberNumber && (
                        <span className="rounded-md bg-indigo-500/10 px-1.5 py-0.5 text-[10px] font-bold text-indigo-700 dark:text-indigo-300 font-mono">
                          #{item.profile.memberNumber}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      {item.profile.email} · {getRoleLabel(item.profile.role)}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-black tabular-nums text-slate-900 dark:text-white">
                      {item.effectiveStatus === 'partial'
                        ? `${item.paidAmount.toFixed(2)} / ${item.expectedAmount.toFixed(2)} €`
                        : `${item.expectedAmount.toFixed(2)} €`}
                    </div>
                    {item.fee?.receiptNumber && (
                      <div className="text-[10px] font-mono text-slate-400">
                        {item.fee.receiptNumber}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 text-xs">
                  {renderStatusBadge(item)}
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    {item.fee
                      ? `${getMethodLabel(item.fee.paymentMethod)}${
                          item.fee.paymentDate ? ` · ${item.fee.paymentDate}` : ''
                        }`
                      : t('paymentsView.annualFees.noRecordYet')}
                  </span>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800/80">
                  {item.effectiveStatus !== 'paid' &&
                    item.effectiveStatus !== 'exempt' &&
                    item.effectiveStatus !== 'cancelled' && (
                      <button
                        type="button"
                        disabled={memberAnnualFeesTableMissing}
                        onClick={() => void handleQuickCollect(item)}
                        className="rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-45 px-3 py-2 text-xs font-bold text-white transition min-h-[38px]"
                      >
                        {t('paymentsView.collectNowButton')}
                      </button>
                    )}
                  <button
                    type="button"
                    disabled={memberAnnualFeesTableMissing}
                    onClick={() => openEditModal(item)}
                    className="inline-flex items-center gap-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 min-h-[38px]"
                  >
                    {item.fee ? <Edit2 className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                    <span>
                      {item.fee
                        ? t('paymentsView.annualFees.editButton')
                        : t('paymentsView.annualFees.registerButton')}
                    </span>
                  </button>
                  {item.fee && (
                    <button
                      type="button"
                      onClick={() => setFeeToDelete(item.fee)}
                      className="rounded-xl border border-rose-200 dark:border-rose-900/50 p-2 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 min-h-[38px]"
                      title={t('paymentsView.deleteTooltip')}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Vista Escritorio (Tabla) */}
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                <th className="py-3 px-4">{t('paymentsView.annualFees.table.member')}</th>
                <th className="py-3 px-4">{t('paymentsView.annualFees.table.role')}</th>
                <th className="py-3 px-4">{t('paymentsView.annualFees.table.amount')}</th>
                <th className="py-3 px-4">{t('paymentsView.table.method')}</th>
                <th className="py-3 px-4">{t('paymentsView.table.paymentDate')}</th>
                <th className="py-3 px-4">{t('paymentsView.table.receipt')}</th>
                <th className="py-3 px-4">{t('paymentsView.table.status')}</th>
                <th className="py-3 px-4 text-right">{t('paymentsView.table.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    {t('paymentsView.annualFees.empty')}
                  </td>
                </tr>
              ) : (
                filteredRows.map(item => (
                  <tr
                    key={item.profile.id}
                    className="hover:bg-slate-50/80 dark:hover:bg-slate-800/30 transition"
                  >
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 dark:text-white">
                          {item.profile.name}
                        </span>
                        {item.profile.memberNumber && (
                          <span className="rounded bg-indigo-500/10 px-1.5 py-0.5 text-[10px] font-mono font-bold text-indigo-700 dark:text-indigo-300">
                            #{item.profile.memberNumber}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-400">{item.profile.email}</div>
                    </td>
                    <td className="py-3 px-4">
                      <span className="inline-flex items-center rounded-lg bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                        {getRoleLabel(item.profile.role)}
                      </span>
                    </td>
                    <td className="py-3 px-4 tabular-nums">
                      <div className="font-black text-slate-900 dark:text-white">
                        {item.expectedAmount.toFixed(2)} €
                      </div>
                      {item.effectiveStatus === 'partial' && (
                        <div className="text-[10px] font-semibold text-orange-600 dark:text-orange-400">
                          {t('paymentsView.annualFees.paidPartialSub', {
                            paid: item.paidAmount.toFixed(2)
                          })}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-600 dark:text-slate-300">
                      {item.fee ? (
                        <span className="inline-flex items-center gap-1">
                          <CreditCard className="h-3.5 w-3.5 text-slate-400" />
                          {getMethodLabel(item.fee.paymentMethod)}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-500 dark:text-slate-400 tabular-nums">
                      {item.fee?.paymentDate || '—'}
                    </td>
                    <td className="py-3 px-4 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                      {item.fee?.receiptNumber || '—'}
                    </td>
                    <td className="py-3 px-4">{renderStatusBadge(item)}</td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {item.effectiveStatus !== 'paid' &&
                          item.effectiveStatus !== 'exempt' &&
                          item.effectiveStatus !== 'cancelled' && (
                            <button
                              type="button"
                              disabled={memberAnnualFeesTableMissing}
                              onClick={() => void handleQuickCollect(item)}
                              className="rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-45 px-2.5 py-1 text-[11px] font-bold text-white transition"
                            >
                              {t('paymentsView.collectedButton')}
                            </button>
                          )}
                        <button
                          type="button"
                          disabled={memberAnnualFeesTableMissing}
                          onClick={() => openEditModal(item)}
                          title={t('paymentsView.editTooltip')}
                          className="rounded-lg p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-slate-800 transition"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                        {item.fee && (
                          <button
                            type="button"
                            onClick={() => setFeeToDelete(item.fee)}
                            title={t('paymentsView.deleteTooltip')}
                            className="rounded-lg p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-slate-800 transition"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de Registro / Edición de Cuota Anual */}
      {editingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6 shadow-2xl space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-black text-slate-900 dark:text-white">
                  {t('paymentsView.annualFees.modal.title', { year: selectedYear })}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {editingItem.profile.name} ({editingItem.profile.email})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingItem(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitForm} className="space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    {t('paymentsView.annualFees.modal.totalAmountLabel')}
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="0.5"
                    required
                    value={formAmount}
                    onChange={e => {
                      setFormAmount(e.target.value);
                      if (formStatus === 'paid') {
                        setFormPaidAmount(e.target.value);
                      }
                    }}
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs font-bold text-slate-900 dark:text-white tabular-nums"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    {t('recordPaymentModal.statusLabel')}
                  </label>
                  <select
                    value={formStatus}
                    onChange={e => handleStatusChangeInModal(e.target.value as PaymentStatus)}
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs font-bold text-slate-900 dark:text-white"
                  >
                    <option value="paid">{t('recordPaymentModal.statuses.paid')}</option>
                    <option value="partial">{t('recordPaymentModal.statuses.partial')}</option>
                    <option value="pending">{t('recordPaymentModal.statuses.pending')}</option>
                    <option value="overdue">{t('recordPaymentModal.statuses.overdue')}</option>
                    <option value="exempt">{t('recordPaymentModal.statuses.exempt')}</option>
                    <option value="cancelled">{t('recordPaymentModal.statuses.cancelled')}</option>
                  </select>
                </div>
              </div>

              {formStatus === 'partial' && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    {t('paymentsView.annualFees.modal.paidAmountLabel')}
                  </label>
                  <input
                    type="number"
                    min={0.5}
                    step="0.5"
                    required
                    value={formPaidAmount}
                    onChange={e => setFormPaidAmount(e.target.value)}
                    className="w-full rounded-xl border border-orange-300 dark:border-orange-700 bg-orange-50/40 dark:bg-slate-800 px-3 py-2 text-xs font-bold text-slate-900 dark:text-white tabular-nums"
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    {t('recordPaymentModal.paymentMethodLabel')}
                  </label>
                  <select
                    value={formMethod}
                    onChange={e => setFormMethod(e.target.value as PaymentMethod)}
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs font-medium text-slate-900 dark:text-white"
                  >
                    <option value="cash">{t('common.paymentMethods.cash')}</option>
                    <option value="bizum">{t('common.paymentMethods.bizum')}</option>
                    <option value="transfer">{t('common.paymentMethods.transfer')}</option>
                    <option value="card">{t('common.paymentMethods.card')}</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    {t('recordPaymentModal.paymentDateLabel')}
                  </label>
                  <input
                    type="date"
                    value={formDate}
                    onChange={e => setFormDate(e.target.value)}
                    disabled={formStatus !== 'paid' && formStatus !== 'partial'}
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs font-medium text-slate-900 dark:text-white disabled:opacity-50"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {t('paymentsView.annualFees.modal.receiptLabel')}
                </label>
                <input
                  type="text"
                  value={formReceipt}
                  onChange={e => setFormReceipt(e.target.value)}
                  placeholder={`CA-${selectedYear}-...`}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs font-mono text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {t('recordPaymentModal.notesLabel')}
                </label>
                <textarea
                  rows={2}
                  value={formNotes}
                  onChange={e => setFormNotes(e.target.value)}
                  placeholder={t('paymentsView.annualFees.modal.notesPlaceholder')}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-2.5 text-xs text-slate-900 dark:text-white"
                />
              </div>

              {formError && (
                <div className="rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30 px-3 py-2 text-xs font-semibold text-rose-700 dark:text-rose-300">
                  {formError}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingItem(null)}
                  className="rounded-xl border border-slate-300 dark:border-slate-700 px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  {t('recordPaymentModal.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={isSavingForm}
                  className="rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 px-4 py-2 text-xs font-bold text-white transition"
                >
                  {isSavingForm
                    ? t('paymentsView.annualFees.modal.savingButton')
                    : t('recordPaymentModal.saveButton')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Confirmación de Eliminación */}
      {feeToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-2xl space-y-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-500/15 text-rose-600">
                <AlertCircle className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  {t('paymentsView.annualFees.deleteModal.title')}
                </h3>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  {t('paymentsView.annualFees.deleteModal.confirm', {
                    name: feeToDelete.memberName,
                    year: feeToDelete.feeYear,
                    amount: feeToDelete.amount.toFixed(2)
                  })}
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setFeeToDelete(null)}
                className="rounded-xl border border-slate-300 dark:border-slate-700 px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                {t('paymentsView.deleteModal.cancel')}
              </button>
              <button
                type="button"
                onClick={async () => {
                  await deleteMemberAnnualFee(feeToDelete.id);
                  setFeeToDelete(null);
                }}
                className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-700 transition"
              >
                {t('paymentsView.deleteModal.confirmButton')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
