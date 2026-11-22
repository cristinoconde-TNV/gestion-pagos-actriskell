import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import {
  ChevronLeft,
  ChevronRight,
  Sun,
  Moon,
  Plus,
  Download,
  RotateCcw,
  UserCheck,
  Building,
  GraduationCap,
  Calendar,
  Database,
  MoreVertical,
  LayoutDashboard,
  CreditCard,
  Sparkles,
  Receipt,
  Settings,
  BookOpen,
  DollarSign,
  User,
  Users,
  IdCard,
  MessageSquareWarning
} from 'lucide-react';
import { getNavTexts, createTranslator, TranslationKey } from '../lib/i18n';
import { isPendingApprovalProfile } from '../lib/authRole';
import { UserRole } from '../types';

interface HeaderProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
  onOpenRecordPayment: () => void;
  onOpenAddStudent: () => void;
  onOpenAddTeacher: () => void;
  onOpenAddExpense: () => void;
  onOpenAddSession: () => void;
  onOpenSupabaseModal: () => void;
  onOpenUserManagement: (openCreateForm?: boolean) => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentTab,
  setCurrentTab,
  onOpenRecordPayment,
  onOpenAddStudent,
  onOpenAddTeacher,
  onOpenAddExpense,
  onOpenAddSession,
  onOpenSupabaseModal,
  onOpenUserManagement
}) => {
  const {
    selectedPeriod,
    goToPrevPeriod,
    goToNextPeriod,
    goToCurrentPeriod,
    currentRole,
    setCurrentRole,
    teachers,
    currentTeacherId,
    setCurrentTeacherId,
    currentUser,
    profiles,
    students,
    activities,
    membershipWithdrawalRequests,
    setIsAuthModalOpen,
    isDarkMode,
    toggleDarkMode,
    language,
    exportToCSV,
    resetToInitialData,
    isLoadingDb
  } = useApp();

  const navT = getNavTexts(language);
  const t = createTranslator(language);

  const pendingEnrollmentRequestsCount = students.reduce(
    (sum, s) => sum + (s.pendingEnrollments?.length || 0),
    0
  );
  const pendingWithdrawalRequestsCount = membershipWithdrawalRequests.filter(
    r => r.status === 'pending'
  ).length;

  const pendingAccountsCount = profiles.filter(p => isPendingApprovalProfile(p)).length;

  const pendingValidationCount =
    students.filter(
      s => s.status === 'pending_validation' || s.validationStatus === 'pending'
    ).length +
    pendingEnrollmentRequestsCount +
    pendingWithdrawalRequestsCount +
    pendingAccountsCount;

  const teacherActivityIds = new Set(
    activities.filter(a => a.teacherId === currentTeacherId).map(a => a.id)
  );
  const teacherPendingRequestsCount = students.reduce(
    (sum, s) =>
      sum +
      (s.pendingEnrollments || []).filter(p => teacherActivityIds.has(p.activityId)).length +
      s.activities.filter(a => a.status === 'pending_unenroll' && teacherActivityIds.has(a.activityId)).length,
    0
  );

  const [showNewMenu, setShowNewMenu] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false); // Estado para el menú desplegable móvil

  const formatPeriodName = (periodStr: string) => {
    const [y, m] = periodStr.split('-');
    const monthKeys: TranslationKey[] = [
      'common.monthsShort.m01', 'common.monthsShort.m02', 'common.monthsShort.m03',
      'common.monthsShort.m04', 'common.monthsShort.m05', 'common.monthsShort.m06',
      'common.monthsShort.m07', 'common.monthsShort.m08', 'common.monthsShort.m09',
      'common.monthsShort.m10', 'common.monthsShort.m11', 'common.monthsShort.m12'
    ];
    return `${t(monthKeys[parseInt(m, 10) - 1])} ${y}`;
  };

  const currentTeacher = teachers.find(t => t.id === currentTeacherId);

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/80 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md">
      <div className="mx-auto max-w-7xl px-3 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between gap-2 sm:gap-4">
          
          {/* 1. Logo & Marca Triskell */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <div className="flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-xl bg-black text-white shadow-md overflow-hidden p-1">
              <img 
                src="/logo.png" 
                alt={t('header.logoAlt')} 
                className="h-full w-full object-contain"
              />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm sm:text-base font-extrabold tracking-tight text-slate-900 dark:text-white">
                  {t('header.title')}
                </span>
                {/*<span className="hidden md:inline-block rounded-md bg-emerald-100 dark:bg-emerald-950 px-2 py-0.5 text-[10px] font-bold text-emerald-800 dark:text-emerald-300 border border-emerald-300/40 dark:border-emerald-700/50">
                  {t('header.badge')}
                </span>*/}
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 hidden xl:block">
                {t('header.subtitle')}
              </p>
            </div>
          </div>

          {/* 2. Navegador de Mes / Período (Optimizado) */}
          <div className="flex items-center rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 p-0.5 sm:p-1 shadow-xs shrink-0">
            <button
              onClick={goToPrevPeriod}
              title={t('header.prevMonth')}
              className="rounded-lg p-1 text-slate-500 hover:bg-white dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white transition"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>

            <div className="flex items-center gap-1 px-1.5 sm:px-2">
              <Calendar className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200 whitespace-nowrap text-center">
                {formatPeriodName(selectedPeriod)}
              </span>
            </div>

            <button
              onClick={goToNextPeriod}
              title={t('header.nextMonth')}
              className="rounded-lg p-1 text-slate-500 hover:bg-white dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white transition"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
{/* 3. Acciones de la derecha */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            
            {/* Botón Nuevo Registro (Escritorio - oculto para alumnos y socios) */}
            {currentRole !== UserRole.Alumno && currentRole !== UserRole.Socio && (
              <div className="relative hidden md:block">
                <button
                  onClick={() => setShowNewMenu(!showNewMenu)}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-sm shadow-emerald-700/20 hover:bg-emerald-700 transition whitespace-nowrap"
                >
                  <Plus className="h-4 w-4" />
                  <span>{navT.newButton}</span>
                </button>

                {showNewMenu && (
                  <div
                    onMouseLeave={() => setShowNewMenu(false)}
                    className="absolute right-0 mt-2 w-52 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-1.5 shadow-xl z-50 text-xs"
                  >
                    <button
                      onClick={() => { setShowNewMenu(false); onOpenRecordPayment(); }}
                      className="w-full text-left rounded-lg px-3 py-2 text-slate-700 dark:text-slate-200 hover:bg-emerald-50 dark:hover:bg-slate-800 hover:text-emerald-700 flex items-center gap-2"
                    >
                      <span>💳</span>
                      <span className="font-medium">{t('header.menuRecordPayment')}</span>
                    </button>
                    <button
                      onClick={() => { setShowNewMenu(false); onOpenAddStudent(); }}
                      className="w-full text-left rounded-lg px-3 py-2 text-slate-700 dark:text-slate-200 hover:bg-emerald-50 dark:hover:bg-slate-800 hover:text-emerald-700 flex items-center gap-2"
                    >
                      <span>👤</span>
                      <span className="font-medium">{t('header.menuEnrollStudent')}</span>
                    </button>
                    <button
                      onClick={() => { setShowNewMenu(false); onOpenAddSession(); }}
                      className="w-full text-left rounded-lg px-3 py-2 text-slate-700 dark:text-slate-200 hover:bg-emerald-50 dark:hover:bg-slate-800 hover:text-emerald-700 flex items-center gap-2"
                    >
                      <span>📅</span>
                      <span className="font-medium">{t('header.menuAddSession')}</span>
                    </button>
                    {currentRole === UserRole.Admin && (
                      <>
                        <button
                          onClick={() => { setShowNewMenu(false); onOpenAddExpense(); }}
                          className="w-full text-left rounded-lg px-3 py-2 text-slate-700 dark:text-slate-200 hover:bg-emerald-50 dark:hover:bg-slate-800 hover:text-emerald-700 flex items-center gap-2"
                        >
                          <span>🧾</span>
                          <span className="font-medium">{t('header.menuAddExpense')}</span>
                        </button>
                        <button
                          onClick={() => { setShowNewMenu(false); onOpenAddTeacher(); }}
                          className="w-full text-left rounded-lg px-3 py-2 text-slate-700 dark:text-slate-200 hover:bg-emerald-50 dark:hover:bg-slate-800 hover:text-emerald-700 flex items-center gap-2 border-t border-slate-100 dark:border-slate-800"
                        >
                          <span>🎓</span>
                          <span className="font-medium">{t('header.menuAddTeacher')}</span>
                        </button>
                        <button
                          onClick={() => { setShowNewMenu(false); onOpenUserManagement(true); }}
                          className="w-full text-left rounded-lg px-3 py-2 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 flex items-center gap-2 border-t border-indigo-100 dark:border-indigo-900/60 font-semibold"
                        >
                          <span>🛡️</span>
                          <span>{t('header.menuAddUser')}</span>
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Elementos de Escritorio (Exportar, Supabase, Permisos, Usuario) */}
            <div className="hidden md:flex items-center gap-2">
              {currentRole === UserRole.Admin && (
                <>
                  <div className="relative">
                    <button
                      onClick={() => setShowExportMenu(!showExportMenu)}
                      title={t('header.exportTooltip')}
                      className="rounded-xl border border-slate-200 dark:border-slate-800 p-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                    >
                      <Download className="h-4 w-4" />
                    </button>
                    {showExportMenu && (
                      <div
                        onMouseLeave={() => setShowExportMenu(false)}
                        className="absolute right-0 mt-2 w-48 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-1.5 shadow-xl z-50 text-xs"
                      >
                        <div className="px-3 py-1 font-semibold text-slate-400 uppercase text-[10px]">
                          {t('header.exportTitle')}
                        </div>
                        <button onClick={() => { exportToCSV('payments'); setShowExportMenu(false); }} className="w-full text-left rounded-lg px-3 py-1.5 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800">
                          {t('header.exportPayments', { period: selectedPeriod })}
                        </button>
                        <button onClick={() => { exportToCSV('students'); setShowExportMenu(false); }} className="w-full text-left rounded-lg px-3 py-1.5 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800">
                          {t('header.exportStudents')}
                        </button>
                        <button onClick={() => { exportToCSV('expenses'); setShowExportMenu(false); }} className="w-full text-left rounded-lg px-3 py-1.5 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800">
                          {t('header.exportExpenses')}
                        </button>
                        <button onClick={() => { exportToCSV('teachers'); setShowExportMenu(false); }} className="w-full text-left rounded-lg px-3 py-1.5 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800">
                          {t('header.exportTeachers')}
                        </button>
                      </div>
                    )}
                  </div>

                  <button
                    onClick={onOpenSupabaseModal}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-950/20 px-2.5 py-1.5 text-xs font-semibold text-emerald-800 dark:text-emerald-300 whitespace-nowrap"
                  >
                    <Database className="h-3.5 w-3.5 text-emerald-600" />
                    <span>{t('header.supabase')}</span>
                  </button>

                  <button
                    onClick={() => onOpenUserManagement(false)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 dark:border-indigo-800/60 bg-indigo-50/50 dark:bg-indigo-950/20 px-2.5 py-1.5 text-xs font-semibold text-indigo-700 dark:text-indigo-300 whitespace-nowrap"
                  >
                    <UserCheck className="h-3.5 w-3.5 text-indigo-600" />
                    <span>{t('header.permissions')}</span>
                    {pendingAccountsCount > 0 && (
                      <span className="rounded-full bg-amber-500 px-1.5 py-0.2 text-[10px] font-black text-white">
                        {pendingAccountsCount}
                      </span>
                    )}
                  </button>
                </>
              )}

              <button
                onClick={() => setCurrentTab('profile')}
                title={t('header.profileTooltip')}
                className={`inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-semibold whitespace-nowrap transition ${
                  currentTab === 'profile'
                    ? 'border-emerald-500 bg-emerald-50/70 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/80 text-slate-800 dark:text-slate-200'
                }`}
              >
                {currentUser?.photoURL ? (
                  <img
                    src={currentUser.photoURL}
                    alt={currentUser.name}
                    className="h-4 w-4 rounded-full object-cover border border-emerald-500/50 shrink-0"
                  />
                ) : (
                  <User className="h-3.5 w-3.5 shrink-0" />
                )}
                <span className="text-[11px] font-bold">
                  {currentUser ? currentUser.name.split(' ')[0] : navT.profile}
                </span>
              </button>
            </div>

            {/* Toggle Modo Oscuro (Solo visible en escritorio: hidden md:block) */}
            <button
              onClick={toggleDarkMode}
              title={t('header.toggleDarkModeTooltip')}
              className="hidden md:block rounded-xl border border-slate-200 dark:border-slate-800 p-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            >
              {isDarkMode ? <Sun className="h-4 w-4 text-amber-400" /> : <Moon className="h-4 w-4" />}
            </button>

            {/* --- BOTÓN MENÚ MÓVIL (Tres puntos) - Incluye Modo Oscuro, + Nuevo y demás --- */}
            <div className="relative md:hidden">
              <button
                onClick={() => setShowMobileMenu(!showMobileMenu)}
                title={t('header.moreOptions')}
                className="rounded-xl border border-slate-200 dark:border-slate-800 p-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              >
                <MoreVertical className="h-4 w-4" />
              </button>

              {showMobileMenu && (
                <div
                  onMouseLeave={() => setShowMobileMenu(false)}
                  className="absolute right-0 mt-2 w-60 max-h-[80vh] overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-1.5 shadow-xl z-50 text-xs flex flex-col gap-0.5"
                >
                  {/* Cambiar Modo Oscuro en Móvil */}
                  <button
                    onClick={() => { toggleDarkMode(); setShowMobileMenu(false); }}
                    className="w-full text-left rounded-lg px-3 py-2 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2 font-semibold"
                  >
                    {isDarkMode ? <Sun className="h-4 w-4 text-amber-400" /> : <Moon className="h-4 w-4 text-slate-600" />}
                    <span>{isDarkMode ? navT.lightMode : navT.darkMode}</span>
                  </button>

                  {currentRole !== UserRole.Alumno && currentRole !== UserRole.Socio && (
                    <>
                      <div className="border-t border-slate-100 dark:border-slate-800 my-1" />

                      {/* Sección: Nuevo Registro */}
                      <div className="px-3 py-1 font-semibold text-emerald-600 dark:text-emerald-400 uppercase text-[10px]">
                        {t('header.menuNewRecordSection')}
                      </div>
                      <button
                        onClick={() => { setShowMobileMenu(false); onOpenRecordPayment(); }}
                        className="w-full text-left rounded-lg px-3 py-2 text-slate-700 dark:text-slate-200 hover:bg-emerald-50 dark:hover:bg-slate-800 flex items-center gap-2"
                      >
                        <span>💳</span>
                        <span className="font-medium">{t('header.menuRecordPayment')}</span>
                      </button>
                      <button
                        onClick={() => { setShowMobileMenu(false); onOpenAddStudent(); }}
                        className="w-full text-left rounded-lg px-3 py-2 text-slate-700 dark:text-slate-200 hover:bg-emerald-50 dark:hover:bg-slate-800 flex items-center gap-2"
                      >
                        <span>👤</span>
                        <span className="font-medium">{t('header.menuEnrollStudent')}</span>
                      </button>
                      <button
                        onClick={() => { setShowMobileMenu(false); onOpenAddSession(); }}
                        className="w-full text-left rounded-lg px-3 py-2 text-slate-700 dark:text-slate-200 hover:bg-emerald-50 dark:hover:bg-slate-800 flex items-center gap-2"
                      >
                        <span>📅</span>
                        <span className="font-medium">{t('header.menuAddSession')}</span>
                      </button>
                    </>
                  )}

                  {currentRole === UserRole.Admin && (
                    <>
                      <button
                        onClick={() => { setShowMobileMenu(false); onOpenAddExpense(); }}
                        className="w-full text-left rounded-lg px-3 py-2 text-slate-700 dark:text-slate-200 hover:bg-emerald-50 dark:hover:bg-slate-800 flex items-center gap-2"
                      >
                        <span>🧾</span>
                        <span className="font-medium">{t('header.menuAddExpense')}</span>
                      </button>
                      <button
                        onClick={() => { setShowMobileMenu(false); onOpenAddTeacher(); }}
                        className="w-full text-left rounded-lg px-3 py-2 text-slate-700 dark:text-slate-200 hover:bg-emerald-50 dark:hover:bg-slate-800 flex items-center gap-2"
                      >
                        <span>🎓</span>
                        <span className="font-medium">{t('header.menuAddTeacher')}</span>
                      </button>
                      <button
                        onClick={() => { setShowMobileMenu(false); onOpenUserManagement(true); }}
                        className="w-full text-left rounded-lg px-3 py-2 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 flex items-center gap-2 font-semibold"
                      >
                        <span>🛡️</span>
                        <span>{t('header.menuAddUser')}</span>
                      </button>
                    </>
                  )}

                  <div className="border-t border-slate-100 dark:border-slate-800 my-1" />

                  {/* Sección: Acciones y Accesos */}
                  <div className="px-3 py-1 font-semibold text-slate-400 uppercase text-[10px]">
                    {t('header.actionsSection')}
                  </div>
                  <button
                    onClick={() => { setIsAuthModalOpen(true); setShowMobileMenu(false); }}
                    className="w-full text-left rounded-lg px-3 py-2 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2"
                  >
                    <span>👤</span>
                    <span>
                      {currentUser
                        ? t('header.connectedAs', { name: currentUser.name.split(' ')[0] })
                        : t('header.signInWithGoogle')}
                    </span>
                  </button>
                  {currentRole === UserRole.Admin && (
                    <>
                      <button
                        onClick={() => { onOpenSupabaseModal(); setShowMobileMenu(false); }}
                        className="w-full text-left rounded-lg px-3 py-2 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-slate-800 flex items-center gap-2"
                      >
                        <Database className="h-3.5 w-3.5" />
                        <span>{t('header.supabaseCloud')}</span>
                      </button>
                      <button
                        onClick={() => { onOpenUserManagement(false); setShowMobileMenu(false); }}
                        className="w-full text-left rounded-lg px-3 py-2 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-slate-800 flex items-center justify-between gap-2"
                      >
                        <span className="flex items-center gap-2">
                          <UserCheck className="h-3.5 w-3.5" />
                          <span>{t('header.usersPermissions')}</span>
                        </span>
                        {pendingAccountsCount > 0 && (
                          <span className="rounded-full bg-amber-500 px-1.5 py-0.2 text-[10px] font-black text-white">
                            {pendingAccountsCount}
                          </span>
                        )}
                      </button>
                      <button
                        onClick={() => { setCurrentTab('admin-feedback'); setShowMobileMenu(false); }}
                        className="w-full text-left rounded-lg px-3 py-2 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-slate-800 flex items-center gap-2 font-semibold"
                      >
                        <MessageSquareWarning className="h-3.5 w-3.5" />
                        <span>{navT.feedbackReports}</span>
                      </button>
                      <button
                        onClick={() => { setCurrentTab('admin-config'); setShowMobileMenu(false); }}
                        className="w-full text-left rounded-lg px-3 py-2 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2"
                      >
                        <Settings className="h-3.5 w-3.5" />
                        <span>{navT.config}</span>
                      </button>

                      <div className="border-t border-slate-100 dark:border-slate-800 my-1" />

                      {/* Sección: Exportar Datos */}
                      <div className="px-3 py-1 font-semibold text-slate-400 uppercase text-[10px]">
                        {t('header.exportSection')}
                      </div>
                      <button onClick={() => { exportToCSV('payments'); setShowMobileMenu(false); }} className="w-full text-left rounded-lg px-3 py-1.5 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800">
                        {t('header.exportPayments', { period: selectedPeriod })}
                      </button>
                      <button onClick={() => { exportToCSV('students'); setShowMobileMenu(false); }} className="w-full text-left rounded-lg px-3 py-1.5 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800">
                        {t('header.exportStudents')}
                      </button>
                      <button onClick={() => { exportToCSV('expenses'); setShowMobileMenu(false); }} className="w-full text-left rounded-lg px-3 py-1.5 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800">
                        {t('header.exportExpenses')}
                      </button>
                      <button onClick={() => { exportToCSV('teachers'); setShowMobileMenu(false); }} className="w-full text-left rounded-lg px-3 py-1.5 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800">
                        {t('header.exportTeachers')}
                      </button>

                      <div className="border-t border-slate-100 dark:border-slate-800 my-1" />

                      {/* Restablecer datos */}
                      <button
                        onClick={() => {
                          setShowMobileMenu(false);
                          if (window.confirm(t('header.resetConfirm'))) {
                            resetToInitialData();
                          }
                        }}
                        className="w-full text-left rounded-lg px-3 py-2 text-rose-500 hover:bg-rose-50 dark:hover:bg-slate-800 flex items-center gap-2"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        <span>{t('header.resetLabel')}</span>
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Reset data (Solo escritorio xl y admin) */}
            {currentRole === UserRole.Admin && (
              <button
                onClick={() => {
                  if (window.confirm(t('header.resetConfirm'))) {
                    resetToInitialData();
                  }
                }}
                title={t('header.resetTooltip')}
                className="hidden xl:block rounded-xl border border-slate-200 dark:border-slate-800 p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <RotateCcw className="h-4 w-4" />
              </button>
            )}

          </div>
          
        </div>

        {/* Pestañas de Navegación Dinámicas según Rol (Ocultas en móvil, usa el menú inferior) */}
        <nav className="hidden md:flex items-center gap-1.5 border-t border-slate-200/60 dark:border-slate-800/60 py-2 overflow-x-auto no-scrollbar text-xs font-semibold">
          {currentRole === UserRole.Admin && (
            <>
              {[
                { id: 'dashboard', label: navT.adminPortal, icon: LayoutDashboard, badge: 0 },
                { id: 'calendar', label: navT.calendar, icon: Calendar, badge: 0 },
                { id: 'admin-users', label: navT.usersAndMembers, icon: Users, badge: pendingValidationCount },
                { id: 'payments', label: navT.payments, icon: CreditCard, badge: 0 },
                { id: 'teachers', label: navT.teachers, icon: GraduationCap, badge: 0 },
                { id: 'activities', label: navT.activities, icon: Sparkles, badge: 0 },
                { id: 'expenses', label: navT.expenses, icon: Receipt, badge: 0 },
                { id: 'admin-config', label: navT.config, icon: Settings, badge: 0 },
                { id: 'admin-feedback', label: navT.feedbackReports, icon: MessageSquareWarning, badge: 0 },
                { id: 'teacher-portal', label: navT.teacherPortal, icon: Building, badge: 0 },
                { id: 'student-portal', label: navT.studentPortal, icon: BookOpen, badge: 0 },
                { id: 'profile', label: navT.profile, icon: User, badge: 0 }
              ].map(tab => {
                const Icon = tab.icon;
                const isActive = currentTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setCurrentTab(tab.id)}
                    className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 whitespace-nowrap shrink-0 transition ${
                      isActive
                        ? 'bg-emerald-600 text-white shadow-xs font-bold'
                        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    <span>{tab.label}</span>
                    {tab.badge > 0 && (
                      <span
                        className={`rounded-full px-1.5 py-0.2 text-[10px] font-black ${
                          isActive ? 'bg-white text-emerald-700' : 'bg-amber-500 text-white'
                        }`}
                      >
                        {tab.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </>
          )}

          {currentRole === UserRole.Monitor && (
            <>
              {[
                { id: 'teacher-portal', label: navT.portal, icon: GraduationCap, badge: 0 },
                { id: 'teacher-students', label: navT.students, icon: Users, badge: teacherPendingRequestsCount },
                { id: 'calendar', label: navT.calendar, icon: Calendar, badge: 0 },
                { id: 'activities', label: navT.activities, icon: Sparkles, badge: 0 },
                { id: 'teacher-payouts', label: navT.myPayouts, icon: DollarSign, badge: 0 },
                { id: 'profile', label: navT.profile, icon: User, badge: 0 }
              ].map(tab => {
                const Icon = tab.icon;
                const isActive = currentTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setCurrentTab(tab.id)}
                    className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 whitespace-nowrap shrink-0 transition ${
                      isActive
                        ? 'bg-indigo-600 text-white shadow-xs font-bold'
                        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    <span>{tab.label}</span>
                    {tab.badge > 0 && (
                      <span
                        className={`rounded-full px-1.5 py-0.2 text-[10px] font-black ${
                          isActive ? 'bg-white text-indigo-700' : 'bg-amber-500 text-white'
                        }`}
                      >
                        {tab.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </>
          )}

          {currentRole === UserRole.Alumno && (
            <>
              {[
                { id: 'student-portal', label: navT.portal, icon: BookOpen },
                { id: 'calendar', label: navT.calendar, icon: Calendar },
                { id: 'activities', label: navT.activities, icon: Sparkles },
                { id: 'profile', label: navT.profile, icon: User }
              ].map(tab => {
                const Icon = tab.icon;
                const isActive = currentTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setCurrentTab(tab.id)}
                    className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 whitespace-nowrap shrink-0 transition ${
                      isActive
                        ? 'bg-emerald-600 text-white shadow-xs font-bold'
                        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </>
          )}

          {currentRole === UserRole.Socio && currentUser?.role === UserRole.Socio && (
            <>
              {[
                { id: 'socio-portal', label: navT.socioPortal, icon: IdCard },
                { id: 'calendar', label: navT.calendar, icon: Calendar },
                { id: 'activities', label: navT.activities, icon: Sparkles },
                { id: 'profile', label: navT.profile, icon: User }
              ].map(tab => {
                const Icon = tab.icon;
                const isActive = currentTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setCurrentTab(tab.id)}
                    className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 whitespace-nowrap shrink-0 transition ${
                      isActive
                        ? 'bg-emerald-600 text-white shadow-xs font-bold'
                        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </>
          )}

          {currentRole === UserRole.Hibrido && (
            <>
              {[
                { id: 'teacher-portal', label: navT.teacherPortal, icon: GraduationCap, badge: 0 },
                { id: 'teacher-students', label: navT.students, icon: Users, badge: teacherPendingRequestsCount },
                { id: 'student-portal', label: navT.studentPortal, icon: BookOpen, badge: 0 },
                { id: 'calendar', label: navT.calendar, icon: Calendar, badge: 0 },
                { id: 'activities', label: navT.activities, icon: Sparkles, badge: 0 },
                { id: 'profile', label: navT.profile, icon: User, badge: 0 }
              ].map(tab => {
                const Icon = tab.icon;
                const isActive = currentTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setCurrentTab(tab.id)}
                    className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 whitespace-nowrap shrink-0 transition ${
                      isActive
                        ? 'bg-emerald-600 text-white shadow-xs font-bold'
                        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    <span>{tab.label}</span>
                    {tab.badge > 0 && (
                      <span
                        className={`rounded-full px-1.5 py-0.2 text-[10px] font-black ${
                          isActive ? 'bg-white text-emerald-700' : 'bg-amber-500 text-white'
                        }`}
                      >
                        {tab.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </>
          )}
        </nav>
      </div>
    </header>
  );
};