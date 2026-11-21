import React, { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { AppConfigSetting, UserRole } from '../types';
import { createTranslator, TranslationKey } from '../lib/i18n';
import {
  FEEDBACK_CONFIG_KEY,
  FEEDBACK_ROLE_ORDER,
  parseFeedbackSystemConfig,
  serializeFeedbackRolesValue
} from '../lib/feedbackConfig';
import {
  AUTO_CLOSE_DAY_PRESETS,
  CLASS_AUTO_CLOSE_CONFIG_KEY,
  parseClassAutoCloseConfig
} from '../lib/classClosure';
import {
  ANNUAL_FEE_CONFIG_KEY,
  parseSocioAnnualFeeConfig
} from '../lib/annualFee';
import { ROLE_I18N_KEY_MAP } from '../lib/authRole';
import {
  Settings,
  Plus,
  Save,
  CheckCircle2,
  ToggleLeft,
  ToggleRight,
  Bell,
  Calendar,
  Newspaper,
  ChevronDown,
  ChevronUp,
  MessageSquarePlus,
  Clock,
  Lock,
  Award
} from 'lucide-react';

export const AdminConfigView: React.FC = () => {
  const { appConfigs, updateAppConfig, addAppConfig, deleteAppConfig, language } = useApp();
  const t = createTranslator(language);

  const [editingValues, setEditingValues] = useState<Record<string, string>>({});
  const [saveStatus, setSaveStatus] = useState<Record<string, boolean>>({});
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newActive, setNewActive] = useState(true);
  
  // 1. Estado del cuadro selector de Feedback (empieza colapsado)
  const [isFeedbackExpanded, setIsFeedbackExpanded] = useState(false);
  // 2. Estado del acordeón de Cierre Automático de Clases (empieza colapsado)
  const [isAutoCloseExpanded, setIsAutoCloseExpanded] = useState(false);
  // 3. Estado del acordeón de Cuota Anual de Socios (empieza colapsado)
  const [isAnnualFeeExpanded, setIsAnnualFeeExpanded] = useState(false);

  const getEditedValue = (config: AppConfigSetting) => {
    return editingValues[config.config_key] !== undefined
      ? editingValues[config.config_key]
      : config.config_value;
  };

  const handleValueChange = (key: string, val: string) => {
    setEditingValues(prev => ({ ...prev, [key]: val }));
  };

  const handleToggleActive = async (config: AppConfigSetting) => {
    const val = getEditedValue(config);
    await updateAppConfig(config.config_key, val, !config.is_active);
    triggerSuccessBadge(config.config_key);
  };

  const handleSaveConfig = async (config: AppConfigSetting) => {
    const val = getEditedValue(config);
    await updateAppConfig(config.config_key, val, config.is_active);
    triggerSuccessBadge(config.config_key);
  };

  const triggerSuccessBadge = (key: string) => {
    setSaveStatus(prev => ({ ...prev, [key]: true }));
    setTimeout(() => {
      setSaveStatus(prev => ({ ...prev, [key]: false }));
    }, 2500);
  };

  const handleCreateNew = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKey.trim()) return;

    await addAppConfig({
      config_key: newKey.trim().toLowerCase().replace(/\s+/g, '_'),
      config_value: newValue,
      is_active: newActive,
      description: newDesc
    });

    setNewKey('');
    setNewValue('');
    setNewDesc('');
    setNewActive(true);
    setIsAddModalOpen(false);
  };

  // Helper para mostrar iconos temáticos
  const getKeyIcon = (key: string) => {
    if (key.includes('popup') || key.includes('notification')) {
      return <Bell className="h-4 w-4 text-amber-500" />;
    }
    if (key.includes('calendar')) {
      return <Calendar className="h-4 w-4 text-indigo-500" />;
    }
    if (key.includes('news') || key.includes('nota')) {
      return <Newspaper className="h-4 w-4 text-emerald-500" />;
    }
    return <Settings className="h-4 w-4 text-slate-500" />;
  };

  const feedbackConfig = parseFeedbackSystemConfig(appConfigs);
  const feedbackSaved = Boolean(saveStatus[FEEDBACK_CONFIG_KEY]);

  const autoCloseConfig = parseClassAutoCloseConfig(appConfigs);
  const autoCloseSaved = Boolean(saveStatus[CLASS_AUTO_CLOSE_CONFIG_KEY]);
  const [autoCloseHoursDraft, setAutoCloseHoursDraft] = useState<string>(() =>
    String(autoCloseConfig.delayHours)
  );

  useEffect(() => {
    setAutoCloseHoursDraft(String(autoCloseConfig.delayHours));
  }, [autoCloseConfig.delayHours]);

  const parsedAutoCloseDraft = Number(autoCloseHoursDraft);
  const isAutoCloseDraftValid =
    autoCloseHoursDraft.trim() !== '' &&
    Number.isFinite(parsedAutoCloseDraft) &&
    parsedAutoCloseDraft >= 0;
  const hasAutoCloseChanged =
    isAutoCloseDraftValid && parsedAutoCloseDraft !== autoCloseConfig.delayHours;

  const handleToggleAutoClose = async () => {
    const safeHours = isAutoCloseDraftValid ? parsedAutoCloseDraft : autoCloseConfig.delayHours;
    await updateAppConfig(
      CLASS_AUTO_CLOSE_CONFIG_KEY,
      String(safeHours),
      !autoCloseConfig.enabled,
      'Horas de espera tras finalizar una clase para su cierre automático (solo lectura)'
    );
    triggerSuccessBadge(CLASS_AUTO_CLOSE_CONFIG_KEY);
  };

  const handleSaveAutoCloseHours = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!isAutoCloseDraftValid) return;
    await updateAppConfig(
      CLASS_AUTO_CLOSE_CONFIG_KEY,
      String(parsedAutoCloseDraft),
      autoCloseConfig.enabled,
      'Horas de espera tras finalizar una clase para su cierre automático (solo lectura)'
    );
    triggerSuccessBadge(CLASS_AUTO_CLOSE_CONFIG_KEY);
  };

  const annualFeeConfig = parseSocioAnnualFeeConfig(appConfigs);
  const annualFeeSaved = Boolean(saveStatus[ANNUAL_FEE_CONFIG_KEY]);
  const [annualFeeAmountDraft, setAnnualFeeAmountDraft] = useState<string>(() =>
    String(annualFeeConfig.defaultAmount)
  );

  useEffect(() => {
    setAnnualFeeAmountDraft(String(annualFeeConfig.defaultAmount));
  }, [annualFeeConfig.defaultAmount]);

  const parsedAnnualFeeDraft = Number(annualFeeAmountDraft);
  const isAnnualFeeDraftValid =
    annualFeeAmountDraft.trim() !== '' &&
    Number.isFinite(parsedAnnualFeeDraft) &&
    parsedAnnualFeeDraft >= 0;
  const hasAnnualFeeChanged =
    isAnnualFeeDraftValid && parsedAnnualFeeDraft !== annualFeeConfig.defaultAmount;

  const handleToggleAnnualFee = async () => {
    const safeAmount = isAnnualFeeDraftValid
      ? parsedAnnualFeeDraft
      : annualFeeConfig.defaultAmount;
    await updateAppConfig(
      ANNUAL_FEE_CONFIG_KEY,
      String(safeAmount),
      !annualFeeConfig.enabled,
      'Importe anual estándar (€) aplicable exclusivamente a socios activos (solo Administrador)'
    );
    triggerSuccessBadge(ANNUAL_FEE_CONFIG_KEY);
  };

  const handleSaveAnnualFeeAmount = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!isAnnualFeeDraftValid) return;
    await updateAppConfig(
      ANNUAL_FEE_CONFIG_KEY,
      String(parsedAnnualFeeDraft),
      annualFeeConfig.enabled,
      'Importe anual estándar (€) aplicable exclusivamente a socios activos (solo Administrador)'
    );
    triggerSuccessBadge(ANNUAL_FEE_CONFIG_KEY);
  };

  const handleToggleFeedbackMaster = async () => {
    await updateAppConfig(
      FEEDBACK_CONFIG_KEY,
      serializeFeedbackRolesValue(feedbackConfig.roles),
      !feedbackConfig.masterEnabled,
      'Control maestro y por tipo de acceso para el botón flotante de feedback e incidencias'
    );
    triggerSuccessBadge(FEEDBACK_CONFIG_KEY);
  };

  const handleToggleFeedbackRole = async (role: UserRole) => {
    const nextRoles = {
      ...feedbackConfig.roles,
      [role]: !feedbackConfig.roles[role]
    };
    await updateAppConfig(
      FEEDBACK_CONFIG_KEY,
      serializeFeedbackRolesValue(nextRoles),
      feedbackConfig.masterEnabled,
      'Control maestro y por tipo de acceso para el botón flotante de feedback e incidencias'
    );
    triggerSuccessBadge(FEEDBACK_CONFIG_KEY);
  };

  return (
    <div className="space-y-6">
      {/* Cabecera */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold">
              <Settings className="h-5 w-5" />
            </div>
            <h2 className="text-lg font-black text-slate-900 dark:text-white">
              {t('adminConfig.title')}
            </h2>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {t('adminConfig.subtitle')}
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsAddModalOpen(true)}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 text-xs font-bold transition shadow-md shadow-emerald-600/20 active:scale-95 shrink-0 min-h-[42px]"
        >
          <Plus className="h-4 w-4" />
          <span>{t('adminConfig.newParamButton')}</span>
        </button>
      </div>

      {/* Acordeón Control Maestro y por Rol del Sistema de Feedback (replegado por defecto) */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs overflow-hidden">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setIsFeedbackExpanded(prev => !prev)}
            aria-expanded={isFeedbackExpanded}
            aria-label={
              isFeedbackExpanded
                ? 'Contraer configuración de feedback'
                : 'Expandir configuración de feedback'
            }
            className="w-full p-3.5 sm:p-5 text-left flex items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition"
          >
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="h-9 w-9 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                <MessageSquarePlus className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    {t('adminConfig.feedbackSettings.title')}
                  </h3>
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                    {feedbackConfig.masterEnabled ? 'Activo' : 'Desactivado'}
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                  {t('adminConfig.feedbackSettings.subtitle')}
                </p>
              </div>
            </div>

            <span
              aria-hidden="true"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 shrink-0"
            >
              {isFeedbackExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
            </span>
          </button>

          {feedbackSaved && (
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400 shrink-0 pr-4">
              <CheckCircle2 className="h-4 w-4" />
              <span>{t('adminConfig.savedSupabase')}</span>
            </span>
          )}
        </div>

        {isFeedbackExpanded && (
          <div className="p-3.5 sm:p-5 pt-3 border-t border-slate-100 dark:border-slate-800 space-y-5">
            {/* Interruptor Maestro */}
            <div
              className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border p-4 transition ${
                feedbackConfig.masterEnabled
                  ? 'border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/50 dark:bg-emerald-950/20'
                  : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40'
              }`}
            >
              <div>
                <div className="text-sm font-extrabold text-slate-900 dark:text-white">
                  {t('adminConfig.feedbackSettings.masterLabel')}
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                  {feedbackConfig.masterEnabled
                    ? t('adminConfig.feedbackSettings.masterDescriptionEnabled')
                    : t('adminConfig.feedbackSettings.masterDescriptionDisabled')}
                </p>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={feedbackConfig.masterEnabled}
                onClick={() => void handleToggleFeedbackMaster()}
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition min-h-[40px] shrink-0 active:scale-95 ${
                  feedbackConfig.masterEnabled
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-slate-300 dark:bg-slate-700 text-slate-700 dark:text-slate-200'
                }`}
              >
                {feedbackConfig.masterEnabled ? (
                  <ToggleRight className="h-4 w-4" />
                ) : (
                  <ToggleLeft className="h-4 w-4" />
                )}
                <span>
                  {feedbackConfig.masterEnabled
                    ? t('adminConfig.feedbackSettings.masterOn')
                    : t('adminConfig.feedbackSettings.masterOff')}
                </span>
              </button>
            </div>

            {/* Sub-interruptores por tipo de acceso / rol */}
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  {t('adminConfig.feedbackSettings.rolesSectionTitle')}
                </h4>
                {!feedbackConfig.masterEnabled && (
                  <span className="text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                    {t('adminConfig.feedbackSettings.rolesDisabledNotice')}
                  </span>
                )}
              </div>

              <div
                className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 transition ${
                  !feedbackConfig.masterEnabled ? 'opacity-60' : ''
                }`}
              >
                {FEEDBACK_ROLE_ORDER.map(role => {
                  const roleEnabled = feedbackConfig.roles[role];
                  const roleI18nKey = ROLE_I18N_KEY_MAP[role];
                  return (
                    <button
                      key={role}
                      type="button"
                      role="switch"
                      aria-checked={roleEnabled}
                      onClick={() => void handleToggleFeedbackRole(role)}
                      className={`flex items-center justify-between gap-3 rounded-2xl border p-3.5 text-left transition active:scale-[0.99] ${
                        roleEnabled
                          ? 'border-emerald-200 dark:border-emerald-900/50 bg-white dark:bg-slate-900 hover:border-emerald-400'
                          : 'border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/30 hover:border-slate-300'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-extrabold text-slate-900 dark:text-white">
                          {t(`common.roles.${roleI18nKey}` as TranslationKey)}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
                          {t(`adminConfig.feedbackSettings.roleDescriptions.${roleI18nKey}` as TranslationKey)}
                        </div>
                      </div>
                      <span
                        className={`shrink-0 inline-flex items-center justify-center rounded-lg px-2 py-1 text-[11px] font-bold ${
                          roleEnabled
                            ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                            : 'bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        {roleEnabled ? (
                          <ToggleRight className="h-4 w-4" />
                        ) : (
                          <ToggleLeft className="h-4 w-4" />
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Acordeón Cierre Automático de Clases (replegado por defecto) */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs overflow-hidden">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setIsAutoCloseExpanded(prev => !prev)}
            aria-expanded={isAutoCloseExpanded}
            aria-label={
              isAutoCloseExpanded
                ? 'Contraer configuración de cierre automático de clases'
                : 'Expandir configuración de cierre automático de clases'
            }
            className="w-full p-3.5 sm:p-5 text-left flex items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition"
          >
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="h-9 w-9 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                <Lock className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    {t('adminConfig.autoCloseSettings.title')}
                  </h3>
                  <span className="rounded-md bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[10px] font-mono font-bold text-slate-600 dark:text-slate-300">
                    {CLASS_AUTO_CLOSE_CONFIG_KEY}
                  </span>
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                    {autoCloseConfig.enabled
                      ? autoCloseConfig.delayHours >= 24 && autoCloseConfig.delayHours % 24 === 0
                        ? `${autoCloseConfig.delayHours / 24} ${
                            autoCloseConfig.delayHours / 24 === 1
                              ? t('adminConfig.autoCloseSettings.dayUnitSingular')
                              : t('adminConfig.autoCloseSettings.dayUnitPlural')
                          }`
                        : `${autoCloseConfig.delayHours}h`
                      : t('adminConfig.feedbackSettings.masterOff')}
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                  {t('adminConfig.autoCloseSettings.subtitle')}
                </p>
              </div>
            </div>

            <span
              aria-hidden="true"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 shrink-0"
            >
              {isAutoCloseExpanded ? (
                <ChevronUp className="h-5 w-5" />
              ) : (
                <ChevronDown className="h-5 w-5" />
              )}
            </span>
          </button>

          {autoCloseSaved && (
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400 shrink-0 pr-4">
              <CheckCircle2 className="h-4 w-4" />
              <span>{t('adminConfig.savedSupabase')}</span>
            </span>
          )}
        </div>

        {isAutoCloseExpanded && (
          <div className="p-3.5 sm:p-5 pt-3 border-t border-slate-100 dark:border-slate-800 space-y-4">
            <div
              className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border p-4 transition ${
                autoCloseConfig.enabled
                  ? 'border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/50 dark:bg-emerald-950/20'
                  : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40'
              }`}
            >
              <div>
                <div className="text-sm font-extrabold text-slate-900 dark:text-white">
                  {t('adminConfig.autoCloseSettings.toggleLabel')}
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                  {autoCloseConfig.enabled
                    ? autoCloseConfig.delayHours >= 24 && autoCloseConfig.delayHours % 24 === 0
                      ? t('adminConfig.autoCloseSettings.toggleDescriptionEnabledDays', {
                          days: autoCloseConfig.delayHours / 24,
                          unit:
                            autoCloseConfig.delayHours / 24 === 1
                              ? t('adminConfig.autoCloseSettings.dayUnitSingular')
                              : t('adminConfig.autoCloseSettings.dayUnitPlural'),
                          hours: autoCloseConfig.delayHours
                        })
                      : t('adminConfig.autoCloseSettings.toggleDescriptionEnabled', {
                          hours: autoCloseConfig.delayHours
                        })
                    : t('adminConfig.autoCloseSettings.toggleDescriptionDisabled')}
                </p>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={autoCloseConfig.enabled}
                onClick={() => void handleToggleAutoClose()}
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition min-h-[40px] shrink-0 active:scale-95 ${
                  autoCloseConfig.enabled
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-slate-300 dark:bg-slate-700 text-slate-700 dark:text-slate-200'
                }`}
              >
                {autoCloseConfig.enabled ? (
                  <ToggleRight className="h-4 w-4" />
                ) : (
                  <ToggleLeft className="h-4 w-4" />
                )}
                <span>
                  {autoCloseConfig.enabled
                    ? t('adminConfig.feedbackSettings.masterOn')
                    : t('adminConfig.feedbackSettings.masterOff')}
                </span>
              </button>
            </div>

            <form
              onSubmit={handleSaveAutoCloseHours}
              className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/30 p-4"
            >
              <div className="flex-1 space-y-2">
                <label
                  htmlFor="auto-close-hours-input"
                  className="block text-xs font-bold text-slate-700 dark:text-slate-200"
                >
                  {t('adminConfig.autoCloseSettings.delayLabel')}
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative w-32">
                    <Clock className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      id="auto-close-hours-input"
                      type="number"
                      min={0}
                      step={0.5}
                      value={autoCloseHoursDraft}
                      onChange={e => setAutoCloseHoursDraft(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 pl-9 pr-3 py-2 text-xs font-bold text-slate-900 dark:text-white focus:outline-emerald-500 min-h-[40px] tabular-nums"
                    />
                  </div>
                  <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                    {t('adminConfig.autoCloseSettings.hoursUnit')}
                  </span>
                  {isAutoCloseDraftValid && parsedAutoCloseDraft >= 24 && (
                    <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 tabular-nums">
                      ({t('adminConfig.autoCloseSettings.daysEquivalent', {
                        days: (parsedAutoCloseDraft / 24).toFixed(
                          parsedAutoCloseDraft % 24 === 0 ? 0 : 1
                        )
                      })})
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mr-1">
                    {t('adminConfig.autoCloseSettings.presetsLabel')}
                  </span>
                  {AUTO_CLOSE_DAY_PRESETS.map(days => {
                    const presetHours = days * 24;
                    const unit =
                      days === 1
                        ? t('adminConfig.autoCloseSettings.dayUnitSingular')
                        : t('adminConfig.autoCloseSettings.dayUnitPlural');
                    return (
                      <button
                        key={days}
                        type="button"
                        onClick={() => setAutoCloseHoursDraft(String(presetHours))}
                        className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition tabular-nums ${
                          isAutoCloseDraftValid && parsedAutoCloseDraft === presetHours
                            ? 'bg-indigo-600 text-white shadow-xs'
                            : 'border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                      >
                        {days} {unit}
                      </button>
                    );
                  })}
                </div>
              </div>

              <button
                type="submit"
                disabled={!isAutoCloseDraftValid}
                className={`inline-flex items-center justify-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition min-h-[40px] shrink-0 active:scale-95 disabled:opacity-40 ${
                  hasAutoCloseChanged
                    ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs'
                    : 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:opacity-90'
                }`}
              >
                <Save className="h-3.5 w-3.5" />
                <span>
                  {hasAutoCloseChanged
                    ? t('adminConfig.saveChanges')
                    : t('adminConfig.update')}
                </span>
              </button>
            </form>
          </div>
        )}
      </div>

      {/* Acordeón Cuota Anual de Socios (replegado por defecto) */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs overflow-hidden">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setIsAnnualFeeExpanded(prev => !prev)}
            aria-expanded={isAnnualFeeExpanded}
            aria-label={
              isAnnualFeeExpanded
                ? 'Contraer configuración de cuota anual de socios'
                : 'Expandir configuración de cuota anual de socios'
            }
            className="w-full p-3.5 sm:p-5 text-left flex items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition"
          >
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="h-9 w-9 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                <Award className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    {t('adminConfig.annualFeeSettings.title')}
                  </h3>
                  <span className="rounded-md bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[10px] font-mono font-bold text-slate-600 dark:text-slate-300">
                    {ANNUAL_FEE_CONFIG_KEY}
                  </span>
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                    {annualFeeConfig.enabled
                      ? `${annualFeeConfig.defaultAmount.toFixed(2)} €`
                      : t('adminConfig.feedbackSettings.masterOff')}
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                  {t('adminConfig.annualFeeSettings.subtitle')}
                </p>
              </div>
            </div>

            <span
              aria-hidden="true"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 shrink-0"
            >
              {isAnnualFeeExpanded ? (
                <ChevronUp className="h-5 w-5" />
              ) : (
                <ChevronDown className="h-5 w-5" />
              )}
            </span>
          </button>

          {annualFeeSaved && (
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400 shrink-0 pr-4">
              <CheckCircle2 className="h-4 w-4" />
              <span>{t('adminConfig.savedSupabase')}</span>
            </span>
          )}
        </div>

        {isAnnualFeeExpanded && (
          <div className="p-3.5 sm:p-5 pt-3 border-t border-slate-100 dark:border-slate-800 space-y-4">
            <div
              className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border p-4 transition ${
                annualFeeConfig.enabled
                  ? 'border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/50 dark:bg-emerald-950/20'
                  : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40'
              }`}
            >
              <div>
                <div className="text-sm font-extrabold text-slate-900 dark:text-white">
                  {t('adminConfig.annualFeeSettings.toggleLabel')}
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                  {annualFeeConfig.enabled
                    ? t('adminConfig.annualFeeSettings.toggleDescriptionEnabled', {
                        amount: annualFeeConfig.defaultAmount.toFixed(2)
                      })
                    : t('adminConfig.annualFeeSettings.toggleDescriptionDisabled')}
                </p>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={annualFeeConfig.enabled}
                onClick={() => void handleToggleAnnualFee()}
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition min-h-[40px] shrink-0 active:scale-95 ${
                  annualFeeConfig.enabled
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-slate-300 dark:bg-slate-700 text-slate-700 dark:text-slate-200'
                }`}
              >
                {annualFeeConfig.enabled ? (
                  <ToggleRight className="h-4 w-4" />
                ) : (
                  <ToggleLeft className="h-4 w-4" />
                )}
                <span>
                  {annualFeeConfig.enabled
                    ? t('adminConfig.feedbackSettings.masterOn')
                    : t('adminConfig.feedbackSettings.masterOff')}
                </span>
              </button>
            </div>

            <form
              onSubmit={handleSaveAnnualFeeAmount}
              className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/30 p-4"
            >
              <div className="flex-1 space-y-2">
                <label
                  htmlFor="socio-annual-fee-input"
                  className="block text-xs font-bold text-slate-700 dark:text-slate-200"
                >
                  {t('adminConfig.annualFeeSettings.amountLabel')}
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative w-32">
                    <input
                      id="socio-annual-fee-input"
                      type="number"
                      min={0}
                      step="0.5"
                      value={annualFeeAmountDraft}
                      onChange={e => setAnnualFeeAmountDraft(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-bold text-slate-900 dark:text-white focus:outline-indigo-500 min-h-[40px] tabular-nums"
                    />
                  </div>
                  <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                    € / {t('adminConfig.annualFeeSettings.yearUnit')}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mr-1">
                    {t('adminConfig.autoCloseSettings.presetsLabel')}
                  </span>
                  {[10, 15, 20, 25, 30, 50].map(preset => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setAnnualFeeAmountDraft(String(preset))}
                      className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition tabular-nums ${
                        isAnnualFeeDraftValid && parsedAnnualFeeDraft === preset
                          ? 'bg-indigo-600 text-white shadow-xs'
                          : 'border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      {preset}€
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="submit"
                disabled={!isAnnualFeeDraftValid}
                className={`inline-flex items-center justify-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition min-h-[40px] shrink-0 active:scale-95 disabled:opacity-40 ${
                  hasAnnualFeeChanged
                    ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs'
                    : 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:opacity-90'
                }`}
              >
                <Save className="h-3.5 w-3.5" />
                <span>
                  {hasAnnualFeeChanged
                    ? t('adminConfig.saveChanges')
                    : t('adminConfig.update')}
                </span>
              </button>
            </form>
          </div>
        )}
      </div>

      {/* Tarjetas de Parámetros de Configuración */}
      <div className="grid grid-cols-1 gap-4">
        {appConfigs
          .filter(
            c =>
              c.config_key !== 'google_calendar' &&
              c.config_key !== FEEDBACK_CONFIG_KEY &&
              c.config_key !== CLASS_AUTO_CLOSE_CONFIG_KEY &&
              c.config_key !== ANNUAL_FEE_CONFIG_KEY
          )
          .map(config => {
          const isSaved = saveStatus[config.config_key];
          const currentValue = getEditedValue(config);
          const hasChanged = currentValue !== config.config_value;

          return (
            <div
              key={config.config_key}
              className={`rounded-2xl border p-4 sm:p-5 transition bg-white dark:bg-slate-900 shadow-xs ${
                config.is_active
                  ? 'border-slate-200 dark:border-slate-800'
                  : 'border-slate-200/60 dark:border-slate-800/60 opacity-80 bg-slate-50/50 dark:bg-slate-900/50'
              }`}
            >
              <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                {/* Lado Izquierdo: Clave, Descripción y Estado */}
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800">
                      {getKeyIcon(config.config_key)}
                    </span>
                    <h3 className="font-extrabold text-sm text-slate-900 dark:text-white font-mono">
                      {config.config_key}
                    </h3>
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                        config.is_active
                          ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20'
                          : 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border border-slate-500/20'
                      }`}
                    >
                      {config.is_active ? t('adminConfig.statusActive') : t('adminConfig.statusInactive')}
                    </span>
                  </div>

                  {config.description && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      {config.description}
                    </p>
                  )}

                  {/* Campo de Edición del Valor */}
                  <div className="mt-3">
                    <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">
                      {t('adminConfig.valueLabel')}
                    </label>
                    {config.config_value.length > 80 || config.config_key.includes('popup') ? (
                      <textarea
                        rows={2}
                        value={currentValue}
                        onChange={e => handleValueChange(config.config_key, e.target.value)}
                        className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-2.5 text-xs text-slate-900 dark:text-white focus:outline-emerald-500 font-sans"
                      />
                    ) : (
                      <input
                        type="text"
                        value={currentValue}
                        onChange={e => handleValueChange(config.config_key, e.target.value)}
                        className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-emerald-500 font-sans"
                      />
                    )}
                  </div>
                </div>

                {/* Lado Derecho: Acciones (Toggle Active, Guardar, Borrar) */}
                <div className="flex flex-wrap lg:flex-col items-center lg:items-end gap-2 shrink-0 pt-2 lg:pt-0 border-t lg:border-t-0 border-slate-100 dark:border-slate-800">
                  {/* Interruptor de Activar / Desactivar */}
                  <button
                    type="button"
                    onClick={() => handleToggleActive(config)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition min-h-[38px] active:scale-95 ${
                      config.is_active
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {config.is_active ? <ToggleRight className="h-4 w-4" /> : <ToggleLeft className="h-4 w-4" />}
                    <span>{config.is_active ? t('adminConfig.deactivate') : t('adminConfig.activate')}</span>
                  </button>

                  {/* Guardar cambios de valor */}
                  <button
                    type="button"
                    onClick={() => handleSaveConfig(config)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition min-h-[38px] active:scale-95 ${
                      hasChanged
                        ? 'bg-indigo-600 text-white shadow-xs animate-pulse'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    <Save className="h-3.5 w-3.5" />
                    <span>{hasChanged ? t('adminConfig.saveChanges') : t('adminConfig.update')}</span>
                  </button>

                  {/* Feedback de guardado */}
                  {isSaved && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      <span>{t('adminConfig.savedSupabase')}</span>
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal para Crear Nuevo Parámetro */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-6">
            <h3 className="text-base font-bold text-slate-900 dark:text-white mb-1">
              {t('adminConfig.modal.title')}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
              {t('adminConfig.modal.subtitle')}
            </p>

            <form onSubmit={handleCreateNew} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {t('adminConfig.modal.keyLabel')}
                </label>
                <input
                  type="text"
                  required
                  placeholder={t('adminConfig.modal.keyPlaceholder')}
                  value={newKey}
                  onChange={e => setNewKey(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs font-mono text-slate-900 dark:text-white focus:outline-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {t('adminConfig.modal.valueLabel')}
                </label>
                <textarea
                  required
                  rows={3}
                  placeholder={t('adminConfig.modal.valuePlaceholder')}
                  value={newValue}
                  onChange={e => setNewValue(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-2.5 text-xs text-slate-900 dark:text-white focus:outline-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {t('adminConfig.modal.descLabel')}
                </label>
                <input
                  type="text"
                  placeholder={t('adminConfig.modal.descPlaceholder')}
                  value={newDesc}
                  onChange={e => setNewDesc(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-emerald-500"
                />
              </div>

              <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={newActive}
                  onChange={e => setNewActive(e.target.checked)}
                  className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 h-4 w-4"
                />
                <span className="font-semibold">{t('adminConfig.modal.activeCheckbox')}</span>
              </label>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="rounded-xl px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  {t('adminConfig.modal.cancel')}
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 text-xs font-bold transition shadow-xs"
                >
                  {t('adminConfig.modal.save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
