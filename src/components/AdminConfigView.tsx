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
import {
  BIZUM_GENERAL_CONFIG_KEY,
  parseOfficialBizumConfig
} from '../lib/bizumConfig';
import {
  LOGIN_INACTIVITY_CONFIG_KEY,
  LOGIN_INACTIVITY_MONTH_PRESETS,
  SESSION_INACTIVITY_CONFIG_KEY,
  SESSION_INACTIVITY_MINUTE_PRESETS,
  parseLoginInactivityConfig,
  parseSessionInactivityConfig
} from '../lib/inactivityConfig';
import {
  FinishedWorkshopNoteAction,
  NEWS_GRACE_HOUR_PRESETS,
  NEWS_WORKSHOP_GRACE_CONFIG_KEY,
  parseNewsFinishedWorkshopGraceConfig,
  serializeNewsFinishedWorkshopGraceConfig
} from '../lib/newsConfig';
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
  Database,
  Award,
  RefreshCw,
  ShieldAlert,
  Smartphone,
  Timer,
  UserX
} from 'lucide-react';

import {
  getStoredSupabaseConfig,
  saveSupabaseConfig,
  testSupabaseConnection,
  SupabaseConfig
} from '../lib/supabase';
import { ConfirmModal } from './ConfirmModal';

interface AdminConfigViewProps {
  onOpenSupabaseModal?: () => void;
}

export const AdminConfigView: React.FC<AdminConfigViewProps> = ({ onOpenSupabaseModal }) => {
  const {
  appConfigs,
  updateAppConfig,
  addAppConfig,
  deleteAppConfig,
  language,
  refreshFromSupabase,
  seedInitialDataToSupabase,
  teachers,
  activities,
  students,
  payments,
  isLoadingDb
} = useApp();
  const t = createTranslator(language);

  const [editingValues, setEditingValues] = useState<Record<string, string>>({});
  const [saveStatus, setSaveStatus] = useState<Record<string, boolean>>({});
  const [supabaseConfigDraft, setSupabaseConfigDraft] = useState<SupabaseConfig>(() => ({
    ...getStoredSupabaseConfig(),
    isEnabled: true
  }));
  const [testingSupabase, setTestingSupabase] = useState(false);
  const [seedingSupabase, setSeedingSupabase] = useState(false);
  const [isSeedConfirmOpen, setIsSeedConfirmOpen] = useState(false);
  const [seedSupabaseSuccess, setSeedSupabaseSuccess] = useState(false);
  const [supabaseTestResult, setSupabaseTestResult] = useState<{
    success: boolean;
    status: 'connected' | 'auth_required' | 'error';
    message: string;
  } | null>(null);

  const handleTestSupabase = async () => {
    setTestingSupabase(true);
    setSupabaseTestResult(null);
    try {
      const res = await testSupabaseConnection(
        supabaseConfigDraft.url,
        supabaseConfigDraft.anonKey,
        language
      );
      setSupabaseTestResult(res);
    } catch (err: any) {
      setSupabaseTestResult({
        success: false,
        status: 'error',
        message: err?.message || t('supabaseConfig.unknownConnectionError')
      });
    } finally {
      setTestingSupabase(false);
    }
  };

  const handleSaveSupabasePanel = async () => {
    saveSupabaseConfig({ ...supabaseConfigDraft, isEnabled: true });
    await refreshFromSupabase();
    triggerSuccessBadge('supabase_connection');
  };

  const handleSeedSupabaseData = () => {
    if (import.meta.env.PROD) return;
    setIsSeedConfirmOpen(true);
  };

  const handleConfirmSeedSupabaseData = async () => {
    if (import.meta.env.PROD) return;
    setSeedingSupabase(true);
    try {
      await seedInitialDataToSupabase();
      setSeedSupabaseSuccess(true);
      setIsSeedConfirmOpen(false);
    } finally {
      setSeedingSupabase(false);
    }
  };
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
  // 4. Estado del acordeón de Bizum Oficial (empieza colapsado)
  const [isBizumExpanded, setIsBizumExpanded] = useState(false);
  // 5. Estado del acordeón de Control de Inactividad (empieza colapsado)
  const [isInactivityExpanded, setIsInactivityExpanded] = useState(false);
  // 6. Estado del acordeón de Gestión de Notas de Talleres Finalizados (empieza colapsado)
  const [isNewsGraceExpanded, setIsNewsGraceExpanded] = useState(false);
  // 7. Estado del acordeón de Supabase (empieza colapsado)
  const [isSupabaseExpanded, setIsSupabaseExpanded] = useState(false);

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
    if (key.includes('bizum')) {
      return <Smartphone className="h-4 w-4 text-sky-500" />;
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

  // Bizum Oficial de la Asociación (app_config.bizum_general)
  const officialBizumConfig = parseOfficialBizumConfig(appConfigs);
  const officialBizumSaved = Boolean(saveStatus[BIZUM_GENERAL_CONFIG_KEY]);
  const [officialBizumPhoneDraft, setOfficialBizumPhoneDraft] = useState<string>(
    () => officialBizumConfig.phone
  );

  useEffect(() => {
    setOfficialBizumPhoneDraft(officialBizumConfig.phone);
  }, [officialBizumConfig.phone]);

  const trimmedOfficialBizumDraft = officialBizumPhoneDraft.trim();
  const isOfficialBizumDraftValid = /[0-9]{6,}/.test(trimmedOfficialBizumDraft);
  const hasOfficialBizumChanged =
    isOfficialBizumDraftValid && trimmedOfficialBizumDraft !== officialBizumConfig.phone;

  const handleToggleOfficialBizum = async () => {
    const safePhone = isOfficialBizumDraftValid
      ? trimmedOfficialBizumDraft
      : officialBizumConfig.phone;
    await updateAppConfig(
      BIZUM_GENERAL_CONFIG_KEY,
      safePhone,
      !officialBizumConfig.enabled,
      t('adminConfig.bizumSettings.configDescription')
    );
    triggerSuccessBadge(BIZUM_GENERAL_CONFIG_KEY);
  };

  const handleSaveOfficialBizum = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!isOfficialBizumDraftValid) return;
    await updateAppConfig(
      BIZUM_GENERAL_CONFIG_KEY,
      trimmedOfficialBizumDraft,
      officialBizumConfig.enabled,
      t('adminConfig.bizumSettings.configDescription')
    );
    triggerSuccessBadge(BIZUM_GENERAL_CONFIG_KEY);
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

  // Control de Inactividad (Sesión en minutos & Inicio de sesión en meses)
  const sessionInactivityConfig = parseSessionInactivityConfig(appConfigs);
  const loginInactivityConfig = parseLoginInactivityConfig(appConfigs);
  const inactivitySaved =
    Boolean(saveStatus[SESSION_INACTIVITY_CONFIG_KEY]) ||
    Boolean(saveStatus[LOGIN_INACTIVITY_CONFIG_KEY]);

  const [sessionMinutesDraft, setSessionMinutesDraft] = useState<string>(() =>
    String(sessionInactivityConfig.minutes)
  );
  const [loginMonthsDraft, setLoginMonthsDraft] = useState<string>(() =>
    String(loginInactivityConfig.months)
  );

  useEffect(() => {
    setSessionMinutesDraft(String(sessionInactivityConfig.minutes));
  }, [sessionInactivityConfig.minutes]);

  useEffect(() => {
    setLoginMonthsDraft(String(loginInactivityConfig.months));
  }, [loginInactivityConfig.months]);

  const parsedSessionMinutes = Math.round(Number(sessionMinutesDraft));
  const isSessionMinutesValid =
    sessionMinutesDraft.trim() !== '' &&
    Number.isFinite(parsedSessionMinutes) &&
    parsedSessionMinutes >= 1;
  const hasSessionMinutesChanged =
    isSessionMinutesValid && parsedSessionMinutes !== sessionInactivityConfig.minutes;

  const parsedLoginMonths = Math.round(Number(loginMonthsDraft));
  const isLoginMonthsValid =
    loginMonthsDraft.trim() !== '' &&
    Number.isFinite(parsedLoginMonths) &&
    parsedLoginMonths >= 1;
  const hasLoginMonthsChanged =
    isLoginMonthsValid && parsedLoginMonths !== loginInactivityConfig.months;

  const handleToggleSessionInactivity = async () => {
    const safeMinutes = isSessionMinutesValid
      ? parsedSessionMinutes
      : sessionInactivityConfig.minutes;
    await updateAppConfig(
      SESSION_INACTIVITY_CONFIG_KEY,
      String(safeMinutes),
      !sessionInactivityConfig.enabled,
      'Minutos de inactividad máxima antes de cerrar automáticamente la sesión actual'
    );
    triggerSuccessBadge(SESSION_INACTIVITY_CONFIG_KEY);
  };

  const handleSaveSessionMinutes = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!isSessionMinutesValid) return;
    await updateAppConfig(
      SESSION_INACTIVITY_CONFIG_KEY,
      String(parsedSessionMinutes),
      sessionInactivityConfig.enabled,
      'Minutos de inactividad máxima antes de cerrar automáticamente la sesión actual'
    );
    triggerSuccessBadge(SESSION_INACTIVITY_CONFIG_KEY);
  };

  const handleToggleLoginInactivity = async () => {
    const safeMonths = isLoginMonthsValid
      ? parsedLoginMonths
      : loginInactivityConfig.months;
    await updateAppConfig(
      LOGIN_INACTIVITY_CONFIG_KEY,
      String(safeMonths),
      !loginInactivityConfig.enabled,
      'Meses sin iniciar sesión para proponer en Usuarios/Socios la baja del acceso a la app (no baja de la asociación)'
    );
    triggerSuccessBadge(LOGIN_INACTIVITY_CONFIG_KEY);
  };

  const handleSaveLoginMonths = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!isLoginMonthsValid) return;
    await updateAppConfig(
      LOGIN_INACTIVITY_CONFIG_KEY,
      String(parsedLoginMonths),
      loginInactivityConfig.enabled,
      'Meses sin iniciar sesión para proponer en Usuarios/Socios la baja del acceso a la app (no baja de la asociación)'
    );
    triggerSuccessBadge(LOGIN_INACTIVITY_CONFIG_KEY);
  };

  // Gestión automática de Notas asociadas a Talleres Finalizados
  const newsGraceConfig = parseNewsFinishedWorkshopGraceConfig(appConfigs);
  const newsGraceSaved = Boolean(saveStatus[NEWS_WORKSHOP_GRACE_CONFIG_KEY]);
  const [newsGraceHoursDraft, setNewsGraceHoursDraft] = useState<string>(() =>
    String(newsGraceConfig.graceHours)
  );
  const [newsGraceActionDraft, setNewsGraceActionDraft] = useState<FinishedWorkshopNoteAction>(
    () => newsGraceConfig.action
  );

  useEffect(() => {
    setNewsGraceHoursDraft(String(newsGraceConfig.graceHours));
  }, [newsGraceConfig.graceHours]);

  useEffect(() => {
    setNewsGraceActionDraft(newsGraceConfig.action);
  }, [newsGraceConfig.action]);

  const parsedNewsGraceHours = Math.round(Number(newsGraceHoursDraft));
  const isNewsGraceHoursValid =
    newsGraceHoursDraft.trim() !== '' &&
    Number.isFinite(parsedNewsGraceHours) &&
    parsedNewsGraceHours >= 0;
  const hasNewsGraceChanged =
    (isNewsGraceHoursValid && parsedNewsGraceHours !== newsGraceConfig.graceHours) ||
    newsGraceActionDraft !== newsGraceConfig.action;

  const handleToggleNewsGrace = async () => {
    const safeHours = isNewsGraceHoursValid
      ? parsedNewsGraceHours
      : newsGraceConfig.graceHours;
    await updateAppConfig(
      NEWS_WORKSHOP_GRACE_CONFIG_KEY,
      serializeNewsFinishedWorkshopGraceConfig(safeHours, newsGraceActionDraft),
      !newsGraceConfig.enabled,
      'Margen de horas tras finalizar un taller en curso para eliminar o marcar como leídas sus notas asignadas'
    );
    triggerSuccessBadge(NEWS_WORKSHOP_GRACE_CONFIG_KEY);
  };

  const handleSaveNewsGrace = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!isNewsGraceHoursValid) return;
    await updateAppConfig(
      NEWS_WORKSHOP_GRACE_CONFIG_KEY,
      serializeNewsFinishedWorkshopGraceConfig(parsedNewsGraceHours, newsGraceActionDraft),
      newsGraceConfig.enabled,
      'Margen de horas tras finalizar un taller en curso para eliminar o marcar como leídas sus notas asignadas'
    );
    triggerSuccessBadge(NEWS_WORKSHOP_GRACE_CONFIG_KEY);
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
                ? t('adminConfig.feedbackSettings.collapseAria')
                : t('adminConfig.feedbackSettings.expandAria')
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
                    {feedbackConfig.masterEnabled
                      ? t('adminConfig.feedbackSettings.masterOn')
                      : t('adminConfig.feedbackSettings.masterOff')}
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
                ? t('adminConfig.autoCloseSettings.collapseAria')
                : t('adminConfig.autoCloseSettings.expandAria')
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
                ? t('adminConfig.annualFeeSettings.collapseAria')
                : t('adminConfig.annualFeeSettings.expandAria')
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

      {/* Acordeón Bizum Oficial de la Asociación (replegado por defecto) */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs overflow-hidden">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setIsBizumExpanded(prev => !prev)}
            aria-expanded={isBizumExpanded}
            aria-label={
              isBizumExpanded
                ? t('adminConfig.bizumSettings.collapseAria')
                : t('adminConfig.bizumSettings.expandAria')
            }
            className="w-full p-3.5 sm:p-5 text-left flex items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition"
          >
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="h-9 w-9 rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400 flex items-center justify-center shrink-0">
                <Smartphone className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    {t('adminConfig.bizumSettings.title')}
                  </h3>
                  <span className="rounded-md bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[10px] font-mono font-bold text-slate-600 dark:text-slate-300">
                    {BIZUM_GENERAL_CONFIG_KEY}
                  </span>
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                    {officialBizumConfig.isConfigured
                      ? officialBizumConfig.phone
                      : t('adminConfig.feedbackSettings.masterOff')}
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                  {t('adminConfig.bizumSettings.subtitle')}
                </p>
              </div>
            </div>

            <span
              aria-hidden="true"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 shrink-0"
            >
              {isBizumExpanded ? (
                <ChevronUp className="h-5 w-5" />
              ) : (
                <ChevronDown className="h-5 w-5" />
              )}
            </span>
          </button>

          {officialBizumSaved && (
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400 shrink-0 pr-4">
              <CheckCircle2 className="h-4 w-4" />
              <span>{t('adminConfig.savedSupabase')}</span>
            </span>
          )}
        </div>

        {isBizumExpanded && (
          <div className="p-3.5 sm:p-5 pt-3 border-t border-slate-100 dark:border-slate-800 space-y-4">
            <div
              className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border p-4 transition ${
                officialBizumConfig.enabled
                  ? 'border-sky-200 dark:border-sky-900/60 bg-sky-50/50 dark:bg-sky-950/20'
                  : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40'
              }`}
            >
              <div>
                <div className="text-sm font-extrabold text-slate-900 dark:text-white">
                  {t('adminConfig.bizumSettings.toggleLabel')}
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                  {officialBizumConfig.enabled && officialBizumConfig.phone
                    ? t('adminConfig.bizumSettings.toggleDescriptionEnabled', {
                        phone: officialBizumConfig.phone
                      })
                    : t('adminConfig.bizumSettings.toggleDescriptionDisabled')}
                </p>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={officialBizumConfig.enabled}
                onClick={() => void handleToggleOfficialBizum()}
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition min-h-[40px] shrink-0 active:scale-95 ${
                  officialBizumConfig.enabled
                    ? 'bg-sky-600 text-white shadow-xs'
                    : 'bg-slate-300 dark:bg-slate-700 text-slate-700 dark:text-slate-200'
                }`}
              >
                {officialBizumConfig.enabled ? (
                  <ToggleRight className="h-4 w-4" />
                ) : (
                  <ToggleLeft className="h-4 w-4" />
                )}
                <span>
                  {officialBizumConfig.enabled
                    ? t('adminConfig.feedbackSettings.masterOn')
                    : t('adminConfig.feedbackSettings.masterOff')}
                </span>
              </button>
            </div>

            <form
              onSubmit={handleSaveOfficialBizum}
              className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/30 p-4"
            >
              <div className="flex-1 space-y-2">
                <label
                  htmlFor="official-bizum-phone-input"
                  className="block text-xs font-bold text-slate-700 dark:text-slate-200"
                >
                  {t('adminConfig.bizumSettings.phoneLabel')}
                </label>
                <div className="relative max-w-xs">
                  <Smartphone className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="official-bizum-phone-input"
                    type="tel"
                    placeholder={t('adminConfig.bizumSettings.phonePlaceholder')}
                    value={officialBizumPhoneDraft}
                    onChange={e => setOfficialBizumPhoneDraft(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 pl-9 pr-3 py-2 text-xs font-mono font-bold text-slate-900 dark:text-white focus:outline-sky-500 min-h-[40px]"
                  />
                </div>
                {!isOfficialBizumDraftValid && (
                  <p className="text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                    {t('adminConfig.bizumSettings.invalidPhoneHint')}
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={!isOfficialBizumDraftValid}
                className={`inline-flex items-center justify-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition min-h-[40px] shrink-0 active:scale-95 disabled:opacity-40 ${
                  hasOfficialBizumChanged
                    ? 'bg-sky-600 hover:bg-sky-700 text-white shadow-xs'
                    : 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:opacity-90'
                }`}
              >
                <Save className="h-3.5 w-3.5" />
                <span>
                  {hasOfficialBizumChanged
                    ? t('adminConfig.saveChanges')
                    : t('adminConfig.update')}
                </span>
              </button>
            </form>
          </div>
        )}
      </div>

      {/* Acordeón Control de Inactividad: Sesión Actual (Minutos) & Inicio de Sesión (Meses) */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs overflow-hidden">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setIsInactivityExpanded(prev => !prev)}
            aria-expanded={isInactivityExpanded}
            className="w-full p-3.5 sm:p-5 text-left flex items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition"
          >
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="h-9 w-9 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                <ShieldAlert className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    {t('adminConfig.inactivitySettings.title')}
                  </h3>
                  <span
                    className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                      sessionInactivityConfig.enabled
                        ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {sessionInactivityConfig.enabled
                      ? t('adminConfig.inactivitySettings.sessionSummaryOn', {
                          minutes: sessionInactivityConfig.minutes
                        })
                      : t('adminConfig.inactivitySettings.sessionSummaryOff')}
                  </span>
                  <span
                    className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                      loginInactivityConfig.enabled
                        ? 'bg-amber-500/15 text-amber-800 dark:text-amber-300'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {loginInactivityConfig.enabled
                      ? t('adminConfig.inactivitySettings.loginSummaryOn', {
                          months: loginInactivityConfig.months,
                          unit:
                            loginInactivityConfig.months === 1
                              ? t('adminConfig.inactivitySettings.monthUnitSingular')
                              : t('adminConfig.inactivitySettings.monthUnitPlural')
                        })
                      : t('adminConfig.inactivitySettings.loginSummaryOff')}
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                  {t('adminConfig.inactivitySettings.subtitle')}
                </p>
              </div>
            </div>

            <span
              aria-hidden="true"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 shrink-0"
            >
              {isInactivityExpanded ? (
                <ChevronUp className="h-5 w-5" />
              ) : (
                <ChevronDown className="h-5 w-5" />
              )}
            </span>
          </button>

          {inactivitySaved && (
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400 shrink-0 pr-4">
              <CheckCircle2 className="h-4 w-4" />
              <span>{t('adminConfig.savedSupabase')}</span>
            </span>
          )}
        </div>

        {isInactivityExpanded && (
          <div className="p-3.5 sm:p-5 pt-3 border-t border-slate-100 dark:border-slate-800 space-y-5">
            {/* Bloque 1: Inactividad de Sesión Actual (Minutos) */}
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-4">
              <div className="flex items-center gap-2 flex-wrap">
                <Timer className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-200">
                  {t('adminConfig.inactivitySettings.sessionTitle')}
                </h4>
                <span className="rounded-md bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[10px] font-mono font-bold text-slate-600 dark:text-slate-300">
                  {SESSION_INACTIVITY_CONFIG_KEY}
                </span>
              </div>

              <div
                className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border p-4 transition ${
                  sessionInactivityConfig.enabled
                    ? 'border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/50 dark:bg-emerald-950/20'
                    : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40'
                }`}
              >
                <div>
                  <div className="text-sm font-extrabold text-slate-900 dark:text-white">
                    {t('adminConfig.inactivitySettings.sessionToggleLabel')}
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                    {sessionInactivityConfig.enabled
                      ? t('adminConfig.inactivitySettings.sessionDescriptionEnabled', {
                          minutes: sessionInactivityConfig.minutes
                        })
                      : t('adminConfig.inactivitySettings.sessionDescriptionDisabled')}
                  </p>
                </div>

                <button
                  type="button"
                  role="switch"
                  aria-checked={sessionInactivityConfig.enabled}
                  onClick={() => void handleToggleSessionInactivity()}
                  className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition min-h-[40px] shrink-0 active:scale-95 ${
                    sessionInactivityConfig.enabled
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'bg-slate-300 dark:bg-slate-700 text-slate-700 dark:text-slate-200'
                  }`}
                >
                  {sessionInactivityConfig.enabled ? (
                    <ToggleRight className="h-4 w-4" />
                  ) : (
                    <ToggleLeft className="h-4 w-4" />
                  )}
                  <span>
                    {sessionInactivityConfig.enabled
                      ? t('adminConfig.feedbackSettings.masterOn')
                      : t('adminConfig.feedbackSettings.masterOff')}
                  </span>
                </button>
              </div>

              <form
                onSubmit={handleSaveSessionMinutes}
                className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/30 p-4"
              >
                <div className="flex-1 space-y-2">
                  <label
                    htmlFor="session-inactivity-minutes-input"
                    className="block text-xs font-bold text-slate-700 dark:text-slate-200"
                  >
                    {t('adminConfig.inactivitySettings.sessionMinutesLabel')}
                  </label>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative w-32">
                      <Clock className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        id="session-inactivity-minutes-input"
                        type="number"
                        min={1}
                        step={1}
                        value={sessionMinutesDraft}
                        onChange={e => setSessionMinutesDraft(e.target.value)}
                        className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 pl-9 pr-3 py-2 text-xs font-bold text-slate-900 dark:text-white focus:outline-emerald-500 min-h-[40px] tabular-nums"
                      />
                    </div>
                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                      {t('adminConfig.inactivitySettings.minutesUnit')}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mr-1">
                      {t('adminConfig.autoCloseSettings.presetsLabel')}
                    </span>
                    {SESSION_INACTIVITY_MINUTE_PRESETS.map(mins => (
                      <button
                        key={mins}
                        type="button"
                        onClick={() => setSessionMinutesDraft(String(mins))}
                        className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition tabular-nums ${
                          isSessionMinutesValid && parsedSessionMinutes === mins
                            ? 'bg-emerald-600 text-white shadow-xs'
                            : 'border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                      >
                        {mins} min
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={!isSessionMinutesValid}
                  className={`inline-flex items-center justify-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition min-h-[40px] shrink-0 active:scale-95 disabled:opacity-40 ${
                    hasSessionMinutesChanged
                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs'
                      : 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:opacity-90'
                  }`}
                >
                  <Save className="h-3.5 w-3.5" />
                  <span>
                    {hasSessionMinutesChanged
                      ? t('adminConfig.saveChanges')
                      : t('adminConfig.update')}
                  </span>
                </button>
              </form>
            </div>

            {/* Bloque 2: Inactividad de Inicio de Sesión (Meses -> Propuesta baja acceso a app) */}
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-4">
              <div className="flex items-center gap-2 flex-wrap">
                <UserX className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-200">
                  {t('adminConfig.inactivitySettings.loginTitle')}
                </h4>
                <span className="rounded-md bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[10px] font-mono font-bold text-slate-600 dark:text-slate-300">
                  {LOGIN_INACTIVITY_CONFIG_KEY}
                </span>
              </div>

              <div
                className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border p-4 transition ${
                  loginInactivityConfig.enabled
                    ? 'border-amber-200 dark:border-amber-900/60 bg-amber-50/50 dark:bg-amber-950/20'
                    : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40'
                }`}
              >
                <div>
                  <div className="text-sm font-extrabold text-slate-900 dark:text-white">
                    {t('adminConfig.inactivitySettings.loginToggleLabel')}
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                    {loginInactivityConfig.enabled
                      ? t('adminConfig.inactivitySettings.loginDescriptionEnabled', {
                          months: loginInactivityConfig.months,
                          unit:
                            loginInactivityConfig.months === 1
                              ? t('adminConfig.inactivitySettings.monthUnitSingular')
                              : t('adminConfig.inactivitySettings.monthUnitPlural')
                        })
                      : t('adminConfig.inactivitySettings.loginDescriptionDisabled')}
                  </p>
                </div>

                <button
                  type="button"
                  role="switch"
                  aria-checked={loginInactivityConfig.enabled}
                  onClick={() => void handleToggleLoginInactivity()}
                  className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition min-h-[40px] shrink-0 active:scale-95 ${
                    loginInactivityConfig.enabled
                      ? 'bg-amber-600 text-white shadow-xs'
                      : 'bg-slate-300 dark:bg-slate-700 text-slate-700 dark:text-slate-200'
                  }`}
                >
                  {loginInactivityConfig.enabled ? (
                    <ToggleRight className="h-4 w-4" />
                  ) : (
                    <ToggleLeft className="h-4 w-4" />
                  )}
                  <span>
                    {loginInactivityConfig.enabled
                      ? t('adminConfig.feedbackSettings.masterOn')
                      : t('adminConfig.feedbackSettings.masterOff')}
                  </span>
                </button>
              </div>

              <form
                onSubmit={handleSaveLoginMonths}
                className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/30 p-4"
              >
                <div className="flex-1 space-y-2">
                  <label
                    htmlFor="login-inactivity-months-input"
                    className="block text-xs font-bold text-slate-700 dark:text-slate-200"
                  >
                    {t('adminConfig.inactivitySettings.loginMonthsLabel')}
                  </label>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative w-32">
                      <Calendar className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        id="login-inactivity-months-input"
                        type="number"
                        min={1}
                        step={1}
                        value={loginMonthsDraft}
                        onChange={e => setLoginMonthsDraft(e.target.value)}
                        className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 pl-9 pr-3 py-2 text-xs font-bold text-slate-900 dark:text-white focus:outline-amber-500 min-h-[40px] tabular-nums"
                      />
                    </div>
                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                      {isLoginMonthsValid && parsedLoginMonths === 1
                        ? t('adminConfig.inactivitySettings.monthUnitSingular')
                        : t('adminConfig.inactivitySettings.monthUnitPlural')}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mr-1">
                      {t('adminConfig.autoCloseSettings.presetsLabel')}
                    </span>
                    {LOGIN_INACTIVITY_MONTH_PRESETS.map(months => {
                      const unit =
                        months === 1
                          ? t('adminConfig.inactivitySettings.monthUnitSingular')
                          : t('adminConfig.inactivitySettings.monthUnitPlural');
                      return (
                        <button
                          key={months}
                          type="button"
                          onClick={() => setLoginMonthsDraft(String(months))}
                          className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition tabular-nums ${
                            isLoginMonthsValid && parsedLoginMonths === months
                              ? 'bg-amber-600 text-white shadow-xs'
                              : 'border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                          }`}
                        >
                          {months} {unit}
                        </button>
                      );
                    })}
                  </div>

                  <p className="text-[11px] text-slate-500 dark:text-slate-400 pt-1">
                    {t('adminConfig.inactivitySettings.loginNotice')}
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={!isLoginMonthsValid}
                  className={`inline-flex items-center justify-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition min-h-[40px] shrink-0 active:scale-95 disabled:opacity-40 ${
                    hasLoginMonthsChanged
                      ? 'bg-amber-600 hover:bg-amber-700 text-white shadow-xs'
                      : 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:opacity-90'
                  }`}
                >
                  <Save className="h-3.5 w-3.5" />
                  <span>
                    {hasLoginMonthsChanged
                      ? t('adminConfig.saveChanges')
                      : t('adminConfig.update')}
                  </span>
                </button>
              </form>
            </div>
          </div>
        )}
      </div>

      {/* Acordeón Notas y Comunicados vinculados a Talleres Finalizados (replegado por defecto) */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs overflow-hidden">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setIsNewsGraceExpanded(prev => !prev)}
            aria-expanded={isNewsGraceExpanded}
            className="w-full p-3.5 sm:p-5 text-left flex items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition"
          >
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="h-9 w-9 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                <Newspaper className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    {t('adminConfig.newsGraceSettings.title')}
                  </h3>
                  <span className="rounded-md bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[10px] font-mono font-bold text-slate-600 dark:text-slate-300">
                    {NEWS_WORKSHOP_GRACE_CONFIG_KEY}
                  </span>
                  <span
                    className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                      newsGraceConfig.enabled
                        ? 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {newsGraceConfig.enabled
                      ? `${newsGraceConfig.graceHours}h · ${
                          newsGraceConfig.action === 'delete'
                            ? t('adminConfig.newsGraceSettings.actionDeleteShort')
                            : t('adminConfig.newsGraceSettings.actionMarkReadShort')
                        }`
                      : t('adminConfig.feedbackSettings.masterOff')}
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                  {t('adminConfig.newsGraceSettings.subtitle')}
                </p>
              </div>
            </div>

            <span
              aria-hidden="true"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 shrink-0"
            >
              {isNewsGraceExpanded ? (
                <ChevronUp className="h-5 w-5" />
              ) : (
                <ChevronDown className="h-5 w-5" />
              )}
            </span>
          </button>

          {newsGraceSaved && (
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400 shrink-0 pr-4">
              <CheckCircle2 className="h-4 w-4" />
              <span>{t('adminConfig.savedSupabase')}</span>
            </span>
          )}
        </div>

        {isNewsGraceExpanded && (
          <div className="p-3.5 sm:p-5 pt-3 border-t border-slate-100 dark:border-slate-800 space-y-4">
            <div
              className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border p-4 transition ${
                newsGraceConfig.enabled
                  ? 'border-indigo-200 dark:border-indigo-900/60 bg-indigo-50/50 dark:bg-indigo-950/20'
                  : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40'
              }`}
            >
              <div>
                <div className="text-sm font-extrabold text-slate-900 dark:text-white">
                  {t('adminConfig.newsGraceSettings.toggleLabel')}
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                  {newsGraceConfig.enabled
                    ? t('adminConfig.newsGraceSettings.toggleDescriptionEnabled', {
                        hours: newsGraceConfig.graceHours,
                        action:
                          newsGraceConfig.action === 'delete'
                            ? t('adminConfig.newsGraceSettings.actionDeleteVerb')
                            : t('adminConfig.newsGraceSettings.actionMarkReadVerb')
                      })
                    : t('adminConfig.newsGraceSettings.toggleDescriptionDisabled')}
                </p>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={newsGraceConfig.enabled}
                onClick={() => void handleToggleNewsGrace()}
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition min-h-[40px] shrink-0 active:scale-95 ${
                  newsGraceConfig.enabled
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-slate-300 dark:bg-slate-700 text-slate-700 dark:text-slate-200'
                }`}
              >
                {newsGraceConfig.enabled ? (
                  <ToggleRight className="h-4 w-4" />
                ) : (
                  <ToggleLeft className="h-4 w-4" />
                )}
                <span>
                  {newsGraceConfig.enabled
                    ? t('adminConfig.feedbackSettings.masterOn')
                    : t('adminConfig.feedbackSettings.masterOff')}
                </span>
              </button>
            </div>

            <form
              onSubmit={handleSaveNewsGrace}
              className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/30 p-4"
            >
              <div className="flex-1 space-y-3">
                <div className="space-y-2">
                  <label
                    htmlFor="news-grace-hours-input"
                    className="block text-xs font-bold text-slate-700 dark:text-slate-200"
                  >
                    {t('adminConfig.newsGraceSettings.graceHoursLabel')}
                  </label>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative w-32">
                      <Clock className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        id="news-grace-hours-input"
                        type="number"
                        min={0}
                        step={1}
                        value={newsGraceHoursDraft}
                        onChange={e => setNewsGraceHoursDraft(e.target.value)}
                        className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 pl-9 pr-3 py-2 text-xs font-bold text-slate-900 dark:text-white focus:outline-indigo-500 min-h-[40px] tabular-nums"
                      />
                    </div>
                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                      {t('adminConfig.autoCloseSettings.hoursUnit')}
                    </span>
                    {isNewsGraceHoursValid && parsedNewsGraceHours >= 24 && (
                      <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 tabular-nums">
                        ({t('adminConfig.autoCloseSettings.daysEquivalent', {
                          days: (parsedNewsGraceHours / 24).toFixed(
                            parsedNewsGraceHours % 24 === 0 ? 0 : 1
                          )
                        })})
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mr-1">
                      {t('adminConfig.autoCloseSettings.presetsLabel')}
                    </span>
                    {NEWS_GRACE_HOUR_PRESETS.map(hours => (
                      <button
                        key={hours}
                        type="button"
                        onClick={() => setNewsGraceHoursDraft(String(hours))}
                        className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition tabular-nums ${
                          isNewsGraceHoursValid && parsedNewsGraceHours === hours
                            ? 'bg-indigo-600 text-white shadow-xs'
                            : 'border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                      >
                        {hours >= 24 && hours % 24 === 0 ? `${hours / 24}d (${hours}h)` : `${hours}h`}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5 pt-1">
                  <span className="block text-xs font-bold text-slate-700 dark:text-slate-200">
                    {t('adminConfig.newsGraceSettings.actionLabel')}
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setNewsGraceActionDraft('delete')}
                      className={`rounded-xl border px-3 py-2.5 text-left transition ${
                        newsGraceActionDraft === 'delete'
                          ? 'border-rose-500 bg-rose-50/70 dark:bg-rose-950/25 text-rose-800 dark:text-rose-200 shadow-xs'
                          : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <span className="block text-xs font-bold">
                        {t('adminConfig.newsGraceSettings.actionDeleteTitle')}
                      </span>
                      <span className="block text-[11px] opacity-80 mt-0.5">
                        {t('adminConfig.newsGraceSettings.actionDeleteDesc')}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setNewsGraceActionDraft('mark_read')}
                      className={`rounded-xl border px-3 py-2.5 text-left transition ${
                        newsGraceActionDraft === 'mark_read'
                          ? 'border-indigo-500 bg-indigo-50/70 dark:bg-indigo-950/25 text-indigo-800 dark:text-indigo-200 shadow-xs'
                          : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <span className="block text-xs font-bold">
                        {t('adminConfig.newsGraceSettings.actionMarkReadTitle')}
                      </span>
                      <span className="block text-[11px] opacity-80 mt-0.5">
                        {t('adminConfig.newsGraceSettings.actionMarkReadDesc')}
                      </span>
                    </button>
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={!isNewsGraceHoursValid}
                className={`inline-flex items-center justify-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition min-h-[40px] shrink-0 active:scale-95 disabled:opacity-40 ${
                  hasNewsGraceChanged
                    ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs'
                    : 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:opacity-90'
                }`}
              >
                <Save className="h-3.5 w-3.5" />
                <span>
                  {hasNewsGraceChanged
                    ? t('adminConfig.saveChanges')
                    : t('adminConfig.update')}
                </span>
              </button>
            </form>
          </div>
        )}
      </div>

      {/* Acordeón Panel de Configuración de Supabase */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs overflow-hidden">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setIsSupabaseExpanded(prev => !prev)}
            aria-expanded={isSupabaseExpanded}
            className="w-full p-3.5 sm:p-5 text-left flex items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition"
          >
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="h-9 w-9 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                <Database className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    {t('supabaseConfig.title')}
                  </h3>
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    {t('supabaseConfig.connectedRealtime')}
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                  {t('supabaseConfig.subtitle')}
                </p>
              </div>
            </div>

            <span
              aria-hidden="true"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 shrink-0"
            >
              {isSupabaseExpanded ? (
                <ChevronUp className="h-5 w-5" />
              ) : (
                <ChevronDown className="h-5 w-5" />
              )}
            </span>
          </button>

          {saveStatus['supabase_connection'] && (
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400 shrink-0 pr-4">
              <CheckCircle2 className="h-4 w-4" />
              <span>{t('adminConfig.savedSupabase')}</span>
            </span>
          )}
        </div>

        {isSupabaseExpanded && (
          <div className="p-3.5 sm:p-5 pt-4 border-t border-slate-100 dark:border-slate-800 space-y-4 text-xs">
            {/* Estado de tablas y contadores */}
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-50/40 dark:bg-emerald-950/20 p-4 space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="font-bold text-slate-800 dark:text-slate-200">
                  {t('supabaseConfig.activeTablesTitle')}
                </span>
                <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                  {t('supabaseConfig.rlsActive')}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-center font-mono">
                <div className="rounded-lg bg-white dark:bg-slate-800 p-2 border border-slate-200 dark:border-slate-700">
                  <span className="text-lg font-black text-slate-900 dark:text-white block">
                    {teachers.length}
                  </span>
                  <span className="text-[10px] text-slate-400 font-sans">
                    {t('supabaseConfig.counters.teachers')}
                  </span>
                </div>
                <div className="rounded-lg bg-white dark:bg-slate-800 p-2 border border-slate-200 dark:border-slate-700">
                  <span className="text-lg font-black text-slate-900 dark:text-white block">
                    {activities.length}
                  </span>
                  <span className="text-[10px] text-slate-400 font-sans">
                    {t('supabaseConfig.counters.activities')}
                  </span>
                </div>
                <div className="rounded-lg bg-white dark:bg-slate-800 p-2 border border-slate-200 dark:border-slate-700">
                  <span className="text-lg font-black text-slate-900 dark:text-white block">
                    {students.length}
                  </span>
                  <span className="text-[10px] text-slate-400 font-sans">
                    {t('supabaseConfig.counters.students')}
                  </span>
                </div>
                <div className="rounded-lg bg-white dark:bg-slate-800 p-2 border border-slate-200 dark:border-slate-700">
                  <span className="text-lg font-black text-slate-900 dark:text-white block">
                    {payments.length}
                  </span>
                  <span className="text-[10px] text-slate-400 font-sans">
                    {t('supabaseConfig.counters.payments')}
                  </span>
                </div>
              </div>

              {import.meta.env.DEV && teachers.length === 0 && activities.length === 0 && (
                <div className="mt-3 pt-3 border-t border-emerald-200 dark:border-emerald-900/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <p className="text-[11px] text-slate-600 dark:text-slate-400">
                    {t('supabaseConfig.emptyDbPrompt')}
                  </p>
                  <button
                    type="button"
                    disabled={seedingSupabase}
                    onClick={() => void handleSeedSupabaseData()}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 transition shrink-0"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${seedingSupabase ? 'animate-spin' : ''}`} />
                    <span>
                      {seedingSupabase ? t('supabaseConfig.seeding') : t('supabaseConfig.seedButton')}
                    </span>
                  </button>
                </div>
              )}

              {seedSupabaseSuccess && (
                <p className="text-emerald-700 dark:text-emerald-300 font-bold text-xs mt-2">
                  {t('supabaseConfig.seedSuccess')}
                </p>
              )}
            </div>

            {/* Campos URL y Anon Key */}
            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {t('supabaseConfig.urlLabel')}
                </label>
                <input
                  type="text"
                  value={supabaseConfigDraft.url}
                  onChange={e =>
                    setSupabaseConfigDraft({ ...supabaseConfigDraft, url: e.target.value.trim() })
                  }
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white font-mono text-xs focus:outline-emerald-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {t('supabaseConfig.anonKeyLabel')}
                </label>
                <textarea
                  rows={2}
                  value={supabaseConfigDraft.anonKey}
                  onChange={e =>
                    setSupabaseConfigDraft({
                      ...supabaseConfigDraft,
                      anonKey: e.target.value.trim()
                    })
                  }
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white font-mono text-xs focus:outline-emerald-500"
                />
              </div>
            </div>

            {/* Acciones de prueba, sincronización, modal y guardado */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleTestSupabase()}
                  disabled={testingSupabase}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2 text-xs font-semibold text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${testingSupabase ? 'animate-spin' : ''}`} />
                  <span>
                    {testingSupabase ? t('supabaseConfig.testing') : t('supabaseConfig.testButton')}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => void refreshFromSupabase()}
                  disabled={isLoadingDb}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2 text-xs font-semibold text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${isLoadingDb ? 'animate-spin' : ''}`} />
                  <span>{t('supabaseConfig.syncButton')}</span>
                </button>

                {onOpenSupabaseModal && (
                  <button
                    type="button"
                    onClick={onOpenSupabaseModal}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-950/20 px-3.5 py-2 text-xs font-semibold text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100/70 transition"
                  >
                    <Database className="h-3.5 w-3.5 text-emerald-600" />
                    <span>{t('header.supabase')}</span>
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => void handleSaveSupabasePanel()}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 text-xs font-bold transition shadow-xs"
              >
                <Save className="h-3.5 w-3.5" />
                <span>{t('supabaseConfig.saveButton')}</span>
              </button>
            </div>

            {/* Resultado de prueba */}
            {supabaseTestResult && (
              <div
                className={`rounded-xl p-3 border text-xs ${
                  supabaseTestResult.status === 'connected'
                    ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 text-emerald-800 dark:text-emerald-300'
                    : supabaseTestResult.status === 'auth_required'
                    ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 text-amber-800 dark:text-amber-300'
                    : 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 text-rose-800 dark:text-rose-300'
                }`}
              >
                <p className="font-bold">
                  {supabaseTestResult.status === 'connected'
                    ? t('supabaseConfig.statusConnected')
                    : supabaseTestResult.status === 'auth_required'
                    ? t('supabaseConfig.statusAuthRequired')
                    : t('supabaseConfig.statusError')}
                </p>
                <p className="mt-0.5 leading-relaxed">{supabaseTestResult.message}</p>
              </div>
            )}
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
              c.config_key !== ANNUAL_FEE_CONFIG_KEY &&
              c.config_key !== BIZUM_GENERAL_CONFIG_KEY &&
              c.config_key !== SESSION_INACTIVITY_CONFIG_KEY &&
              c.config_key !== LOGIN_INACTIVITY_CONFIG_KEY &&
              c.config_key !== NEWS_WORKSHOP_GRACE_CONFIG_KEY
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

      <ConfirmModal
        isOpen={isSeedConfirmOpen}
        title={t('supabaseConfig.seedConfirmTitle')}
        description={t('supabaseConfig.seedConfirm')}
        confirmLabel={t('supabaseConfig.seedConfirmButton')}
        cancelLabel={t('supabaseConfig.seedCancelButton')}
        processingLabel={t('supabaseConfig.seeding')}
        tone="emerald"
        isProcessing={seedingSupabase}
        onCancel={() => setIsSeedConfirmOpen(false)}
        onConfirm={handleConfirmSeedSupabaseData}
      />
    </div>
  );
};
