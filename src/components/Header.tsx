import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Sun,
  Moon,
  Plus,
  Download,
  Building,
  GraduationCap,
  Calendar,
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
  UserPlus,
  IdCard,
  Shield,
  Crown,
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
    isDarkMode,
    toggleDarkMode,
    language,
    exportToCSV
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

  type MobileSubmenuKey = 'sections' | 'portals' | 'new' | 'export' | 'perspective';
  const [showNewMenu, setShowNewMenu] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false); // Estado para el menú desplegable móvil
  const [expandedMobileSubmenu, setExpandedMobileSubmenu] = useState<MobileSubmenuKey | null>(null);

  const canSwitchPerspective =
    currentUser?.role === UserRole.Admin || currentUser?.role === UserRole.Hibrido;

  const isAdminMobileExtraTabActive =
    currentRole === UserRole.Admin &&
    [
      'activities',
      'teachers',
      'expenses',
      'admin-config',
      'admin-feedback',
      'teacher-portal',
      'student-portal'
    ].includes(currentTab);

  const closeMobileMenu = () => {
    setShowMobileMenu(false);
    setExpandedMobileSubmenu(null);
  };

  const toggleMobileMenu = () => {
    if (showMobileMenu) {
      closeMobileMenu();
    } else {
      setExpandedMobileSubmenu(
        currentRole === UserRole.Monitor || currentRole === UserRole.Hibrido ? 'new' : null
      );
      setShowMobileMenu(true);
    }
  };

  const toggleMobileSubmenu = (key: MobileSubmenuKey) => {
    setExpandedMobileSubmenu(prev => (prev === key ? null : key));
  };

  const navigateFromMobileMenu = (tabId: string) => {
    setCurrentTab(tabId);
    closeMobileMenu();
  };

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

                  {/*<button
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
                  </button>*/}
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

            {/* --- BOTÓN MENÚ MÓVIL (Tres puntos) - Adaptado a cada rol y sus privilegios --- */}
            <div className="relative md:hidden">
              <button
                type="button"
                onClick={toggleMobileMenu}
                title={t('header.moreOptions')}
                aria-expanded={showMobileMenu}
                className={`relative rounded-xl border p-2 transition ${
                  isAdminMobileExtraTabActive
                    ? 'border-emerald-500/60 bg-emerald-50/70 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300'
                    : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <MoreVertical className="h-4 w-4" />
                {isAdminMobileExtraTabActive && (
                  <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-slate-900" />
                )}
              </button>

              {showMobileMenu && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={closeMobileMenu}
                    aria-hidden="true"
                  />
                  <div className="absolute right-0 mt-2 w-64 max-h-[82vh] overflow-y-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-1.5 shadow-xl z-50 text-xs flex flex-col gap-0.5">
                    {/* ===================================================== */}
                    {/* 1. ROL: ADMINISTRADOR                                 */}
                    {/* ===================================================== */}
                    {currentRole === UserRole.Admin && (
                      <>
                        <div className="px-3 pt-1 pb-0.5 font-bold text-slate-400 uppercase tracking-wider text-[10px]">
                          {t('header.sectionsTitle')}
                        </div>
                        {[
                          { id: 'activities', label: navT.activities, icon: Sparkles },
                          { id: 'teachers', label: navT.teachers, icon: GraduationCap },
                          { id: 'expenses', label: navT.expenses, icon: Receipt },
                          { id: 'admin-config', label: navT.config, icon: Settings },
                          { id: 'admin-feedback', label: navT.feedbackReports, icon: MessageSquareWarning }
                        ].map(item => {
                          const Icon = item.icon;
                          const isActive = currentTab === item.id;
                          return (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => navigateFromMobileMenu(item.id)}
                              className={`w-full text-left rounded-lg px-3 py-2 flex items-center gap-2.5 transition ${
                                isActive
                                  ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-bold'
                                  : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 font-medium'
                              }`}
                            >
                              <Icon className={`h-4 w-4 shrink-0 ${isActive ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'}`} />
                              <span className="truncate">{item.label}</span>
                            </button>
                          );
                        })}

                        <div className="border-t border-slate-100 dark:border-slate-800 my-1" />

                        {/* Submenú: Portales */}
                        <button
                          type="button"
                          onClick={() => toggleMobileSubmenu('portals')}
                          className="w-full rounded-lg px-3 py-2 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-between gap-2 font-semibold"
                        >
                          <span className="flex items-center gap-2.5">
                            <Building className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                            <span>{t('header.portalsSubmenu')}</span>
                          </span>
                          <ChevronDown
                            className={`h-3.5 w-3.5 text-slate-400 transition-transform ${
                              expandedMobileSubmenu === 'portals' ? 'rotate-180' : ''
                            }`}
                          />
                        </button>
                        {expandedMobileSubmenu === 'portals' && (
                          <div className="pl-3 pr-1 pb-1 flex flex-col gap-0.5">
                            {[
                              { id: 'teacher-portal', label: navT.teacherPortal, icon: Building },
                              { id: 'student-portal', label: navT.studentPortal, icon: BookOpen }
                            ].map(item => {
                              const Icon = item.icon;
                              const isActive = currentTab === item.id;
                              return (
                                <button
                                  key={item.id}
                                  type="button"
                                  onClick={() => navigateFromMobileMenu(item.id)}
                                  className={`w-full text-left rounded-lg px-3 py-1.5 flex items-center gap-2 transition ${
                                    isActive
                                      ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-bold'
                                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-medium'
                                  }`}
                                >
                                  <Icon className="h-3.5 w-3.5 shrink-0" />
                                  <span className="truncate">{item.label}</span>
                                </button>
                              );
                            })}
                          </div>
                        )}

                        {/* Submenú: Nuevo registro (Admin completo) */}
                        <button
                          type="button"
                          onClick={() => toggleMobileSubmenu('new')}
                          className="w-full rounded-lg px-3 py-2 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 flex items-center justify-between gap-2 font-semibold"
                        >
                          <span className="flex items-center gap-2.5">
                            <Plus className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                            <span>{t('header.newRecordSubmenu')}</span>
                          </span>
                          <ChevronDown
                            className={`h-3.5 w-3.5 text-emerald-500 transition-transform ${
                              expandedMobileSubmenu === 'new' ? 'rotate-180' : ''
                            }`}
                          />
                        </button>
                        {expandedMobileSubmenu === 'new' && (
                          <div className="pl-3 pr-1 pb-1 flex flex-col gap-0.5">
                            <button
                              type="button"
                              onClick={() => { closeMobileMenu(); onOpenRecordPayment(); }}
                              className="w-full text-left rounded-lg px-3 py-1.5 text-slate-700 dark:text-slate-200 hover:bg-emerald-50 dark:hover:bg-slate-800 flex items-center gap-2 font-medium"
                            >
                              <CreditCard className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                              <span>{t('header.menuRecordPayment')}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => { closeMobileMenu(); onOpenAddStudent(); }}
                              className="w-full text-left rounded-lg px-3 py-1.5 text-slate-700 dark:text-slate-200 hover:bg-emerald-50 dark:hover:bg-slate-800 flex items-center gap-2 font-medium"
                            >
                              <UserPlus className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                              <span>{t('header.menuEnrollStudent')}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => { closeMobileMenu(); onOpenAddSession(); }}
                              className="w-full text-left rounded-lg px-3 py-1.5 text-slate-700 dark:text-slate-200 hover:bg-emerald-50 dark:hover:bg-slate-800 flex items-center gap-2 font-medium"
                            >
                              <Calendar className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                              <span>{t('header.menuAddSession')}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => { closeMobileMenu(); onOpenAddExpense(); }}
                              className="w-full text-left rounded-lg px-3 py-1.5 text-slate-700 dark:text-slate-200 hover:bg-emerald-50 dark:hover:bg-slate-800 flex items-center gap-2 font-medium"
                            >
                              <Receipt className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                              <span>{t('header.menuAddExpense')}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => { closeMobileMenu(); onOpenAddTeacher(); }}
                              className="w-full text-left rounded-lg px-3 py-1.5 text-slate-700 dark:text-slate-200 hover:bg-emerald-50 dark:hover:bg-slate-800 flex items-center gap-2 font-medium"
                            >
                              <GraduationCap className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                              <span>{t('header.menuAddTeacher')}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => { closeMobileMenu(); onOpenUserManagement(true); }}
                              className="w-full text-left rounded-lg px-3 py-1.5 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 flex items-center gap-2 font-semibold"
                            >
                              <Shield className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                              <span>{t('header.menuAddUser')}</span>
                            </button>
                          </div>
                        )}

                        {/* Submenú: Exportar CSV */}
                        <button
                          type="button"
                          onClick={() => toggleMobileSubmenu('export')}
                          className="w-full rounded-lg px-3 py-2 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-between gap-2 font-semibold"
                        >
                          <span className="flex items-center gap-2.5">
                            <Download className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                            <span>{t('header.exportSubmenu')}</span>
                          </span>
                          <ChevronDown
                            className={`h-3.5 w-3.5 text-slate-400 transition-transform ${
                              expandedMobileSubmenu === 'export' ? 'rotate-180' : ''
                            }`}
                          />
                        </button>
                        {expandedMobileSubmenu === 'export' && (
                          <div className="pl-3 pr-1 pb-1 flex flex-col gap-0.5">
                            <button
                              type="button"
                              onClick={() => { exportToCSV('payments'); closeMobileMenu(); }}
                              className="w-full text-left rounded-lg px-3 py-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-medium"
                            >
                              {t('header.exportPayments', { period: selectedPeriod })}
                            </button>
                            <button
                              type="button"
                              onClick={() => { exportToCSV('students'); closeMobileMenu(); }}
                              className="w-full text-left rounded-lg px-3 py-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-medium"
                            >
                              {t('header.exportStudents')}
                            </button>
                            <button
                              type="button"
                              onClick={() => { exportToCSV('expenses'); closeMobileMenu(); }}
                              className="w-full text-left rounded-lg px-3 py-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-medium"
                            >
                              {t('header.exportExpenses')}
                            </button>
                            <button
                              type="button"
                              onClick={() => { exportToCSV('teachers'); closeMobileMenu(); }}
                              className="w-full text-left rounded-lg px-3 py-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-medium"
                            >
                              {t('header.exportTeachers')}
                            </button>
                          </div>
                        )}
                      </>
                    )}

                    {/* ===================================================== */}
                    {/* 2. ROL: MONITOR                                       */}
                    {/* ===================================================== */}
                    {currentRole === UserRole.Monitor && (
                      <>
                        {/* Submenú: Secciones del Monitor */}
                        <button
                          type="button"
                          onClick={() => toggleMobileSubmenu('sections')}
                          className="w-full rounded-lg px-3 py-2 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-between gap-2 font-semibold"
                        >
                          <span className="flex items-center gap-2.5">
                            <LayoutDashboard className="h-4 w-4 text-indigo-500 dark:text-indigo-400" />
                            <span>{t('header.sectionsTitle')}</span>
                          </span>
                          <ChevronDown
                            className={`h-3.5 w-3.5 text-slate-400 transition-transform ${
                              expandedMobileSubmenu === 'sections' ? 'rotate-180' : ''
                            }`}
                          />
                        </button>
                        {expandedMobileSubmenu === 'sections' && (
                          <div className="pl-3 pr-1 pb-1 flex flex-col gap-0.5">
                            {[
                              { id: 'teacher-portal', label: navT.portal, icon: GraduationCap, badge: 0 },
                              { id: 'teacher-students', label: navT.students, icon: Users, badge: teacherPendingRequestsCount },
                              { id: 'calendar', label: navT.calendar, icon: Calendar, badge: 0 },
                              { id: 'activities', label: navT.activities, icon: Sparkles, badge: 0 },
                              { id: 'teacher-payouts', label: navT.myPayouts, icon: DollarSign, badge: 0 },
                              { id: 'profile', label: navT.profile, icon: User, badge: 0 }
                            ].map(item => {
                              const Icon = item.icon;
                              const isActive = currentTab === item.id;
                              return (
                                <button
                                  key={item.id}
                                  type="button"
                                  onClick={() => navigateFromMobileMenu(item.id)}
                                  className={`w-full text-left rounded-lg px-3 py-1.5 flex items-center justify-between gap-2 transition ${
                                    isActive
                                      ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 font-bold'
                                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-medium'
                                  }`}
                                >
                                  <span className="flex items-center gap-2 min-w-0">
                                    <Icon className="h-3.5 w-3.5 shrink-0" />
                                    <span className="truncate">{item.label}</span>
                                  </span>
                                  {item.badge > 0 && (
                                    <span className="rounded-full bg-amber-500 px-1.5 py-0.2 text-[10px] font-black text-white shrink-0">
                                      {item.badge}
                                    </span>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        )}

                        {/* Submenú: Nuevo registro (solo acciones permitidas a Monitor) */}
                        <button
                          type="button"
                          onClick={() => toggleMobileSubmenu('new')}
                          className="w-full rounded-lg px-3 py-2 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 flex items-center justify-between gap-2 font-semibold"
                        >
                          <span className="flex items-center gap-2.5">
                            <Plus className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                            <span>{t('header.newRecordSubmenu')}</span>
                          </span>
                          <ChevronDown
                            className={`h-3.5 w-3.5 text-emerald-500 transition-transform ${
                              expandedMobileSubmenu === 'new' ? 'rotate-180' : ''
                            }`}
                          />
                        </button>
                        {expandedMobileSubmenu === 'new' && (
                          <div className="pl-3 pr-1 pb-1 flex flex-col gap-0.5">
                            <button
                              type="button"
                              onClick={() => { closeMobileMenu(); onOpenRecordPayment(); }}
                              className="w-full text-left rounded-lg px-3 py-1.5 text-slate-700 dark:text-slate-200 hover:bg-emerald-50 dark:hover:bg-slate-800 flex items-center gap-2 font-medium"
                            >
                              <CreditCard className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                              <span>{t('header.menuRecordPayment')}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => { closeMobileMenu(); onOpenAddStudent(); }}
                              className="w-full text-left rounded-lg px-3 py-1.5 text-slate-700 dark:text-slate-200 hover:bg-emerald-50 dark:hover:bg-slate-800 flex items-center gap-2 font-medium"
                            >
                              <UserPlus className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                              <span>{t('header.menuEnrollStudent')}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => { closeMobileMenu(); onOpenAddSession(); }}
                              className="w-full text-left rounded-lg px-3 py-1.5 text-slate-700 dark:text-slate-200 hover:bg-emerald-50 dark:hover:bg-slate-800 flex items-center gap-2 font-medium"
                            >
                              <Calendar className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                              <span>{t('header.menuAddSession')}</span>
                            </button>
                          </div>
                        )}
                      </>
                    )}

                    {/* ===================================================== */}
                    {/* 3. ROL: HÍBRIDO (Monitor + Alumno)                    */}
                    {/* ===================================================== */}
                    {currentRole === UserRole.Hibrido && (
                      <>
                        {/* Submenú: Secciones de Híbrido */}
                        <button
                          type="button"
                          onClick={() => toggleMobileSubmenu('sections')}
                          className="w-full rounded-lg px-3 py-2 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-between gap-2 font-semibold"
                        >
                          <span className="flex items-center gap-2.5">
                            <Sparkles className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                            <span>{t('header.sectionsTitle')}</span>
                          </span>
                          <ChevronDown
                            className={`h-3.5 w-3.5 text-slate-400 transition-transform ${
                              expandedMobileSubmenu === 'sections' ? 'rotate-180' : ''
                            }`}
                          />
                        </button>
                        {expandedMobileSubmenu === 'sections' && (
                          <div className="pl-3 pr-1 pb-1 flex flex-col gap-0.5">
                            {[
                              { id: 'teacher-portal', label: navT.teacherPortal, icon: GraduationCap, badge: 0 },
                              { id: 'teacher-students', label: navT.students, icon: Users, badge: teacherPendingRequestsCount },
                              { id: 'student-portal', label: navT.studentPortal, icon: BookOpen, badge: 0 },
                              { id: 'calendar', label: navT.calendar, icon: Calendar, badge: 0 },
                              { id: 'activities', label: navT.activities, icon: Sparkles, badge: 0 },
                              { id: 'profile', label: navT.profile, icon: User, badge: 0 }
                            ].map(item => {
                              const Icon = item.icon;
                              const isActive = currentTab === item.id;
                              return (
                                <button
                                  key={item.id}
                                  type="button"
                                  onClick={() => navigateFromMobileMenu(item.id)}
                                  className={`w-full text-left rounded-lg px-3 py-1.5 flex items-center justify-between gap-2 transition ${
                                    isActive
                                      ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-bold'
                                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-medium'
                                  }`}
                                >
                                  <span className="flex items-center gap-2 min-w-0">
                                    <Icon className="h-3.5 w-3.5 shrink-0" />
                                    <span className="truncate">{item.label}</span>
                                  </span>
                                  {item.badge > 0 && (
                                    <span className="rounded-full bg-amber-500 px-1.5 py-0.2 text-[10px] font-black text-white shrink-0">
                                      {item.badge}
                                    </span>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        )}

                        {/* Submenú: Nuevo registro (solo acciones permitidas a Híbrido) */}
                        <button
                          type="button"
                          onClick={() => toggleMobileSubmenu('new')}
                          className="w-full rounded-lg px-3 py-2 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 flex items-center justify-between gap-2 font-semibold"
                        >
                          <span className="flex items-center gap-2.5">
                            <Plus className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                            <span>{t('header.newRecordSubmenu')}</span>
                          </span>
                          <ChevronDown
                            className={`h-3.5 w-3.5 text-emerald-500 transition-transform ${
                              expandedMobileSubmenu === 'new' ? 'rotate-180' : ''
                            }`}
                          />
                        </button>
                        {expandedMobileSubmenu === 'new' && (
                          <div className="pl-3 pr-1 pb-1 flex flex-col gap-0.5">
                            <button
                              type="button"
                              onClick={() => { closeMobileMenu(); onOpenRecordPayment(); }}
                              className="w-full text-left rounded-lg px-3 py-1.5 text-slate-700 dark:text-slate-200 hover:bg-emerald-50 dark:hover:bg-slate-800 flex items-center gap-2 font-medium"
                            >
                              <CreditCard className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                              <span>{t('header.menuRecordPayment')}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => { closeMobileMenu(); onOpenAddStudent(); }}
                              className="w-full text-left rounded-lg px-3 py-1.5 text-slate-700 dark:text-slate-200 hover:bg-emerald-50 dark:hover:bg-slate-800 flex items-center gap-2 font-medium"
                            >
                              <UserPlus className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                              <span>{t('header.menuEnrollStudent')}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => { closeMobileMenu(); onOpenAddSession(); }}
                              className="w-full text-left rounded-lg px-3 py-1.5 text-slate-700 dark:text-slate-200 hover:bg-emerald-50 dark:hover:bg-slate-800 flex items-center gap-2 font-medium"
                            >
                              <Calendar className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                              <span>{t('header.menuAddSession')}</span>
                            </button>
                          </div>
                        )}
                      </>
                    )}

                    {/* ===================================================== */}
                    {/* 4. ROL: ALUMNO (sin permisos de alta ni exportación)  */}
                    {/* ===================================================== */}
                    {currentRole === UserRole.Alumno && (
                      <>
                        <div className="px-3 pt-1 pb-0.5 font-bold text-slate-400 uppercase tracking-wider text-[10px]">
                          {t('header.sectionsTitle')}
                        </div>
                        {[
                          { id: 'student-portal', label: navT.portal, icon: BookOpen },
                          { id: 'calendar', label: navT.calendar, icon: Calendar },
                          { id: 'activities', label: navT.activities, icon: Sparkles },
                          { id: 'profile', label: navT.profile, icon: User }
                        ].map(item => {
                          const Icon = item.icon;
                          const isActive = currentTab === item.id;
                          return (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => navigateFromMobileMenu(item.id)}
                              className={`w-full text-left rounded-lg px-3 py-2 flex items-center gap-2.5 transition ${
                                isActive
                                  ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-bold'
                                  : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 font-medium'
                              }`}
                            >
                              <Icon className={`h-4 w-4 shrink-0 ${isActive ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'}`} />
                              <span className="truncate">{item.label}</span>
                            </button>
                          );
                        })}
                      </>
                    )}

                    {/* ===================================================== */}
                    {/* 5. ROL: SOCIO (sin permisos de alta ni exportación)   */}
                    {/* ===================================================== */}
                    {currentRole === UserRole.Socio && (
                      <>
                        <div className="px-3 pt-1 pb-0.5 font-bold text-slate-400 uppercase tracking-wider text-[10px]">
                          {t('header.sectionsTitle')}
                        </div>
                        {[
                          ...(currentUser?.role === UserRole.Socio
                            ? [{ id: 'socio-portal', label: navT.socioPortal, icon: IdCard }]
                            : []),
                          { id: 'calendar', label: navT.calendar, icon: Calendar },
                          { id: 'activities', label: navT.activities, icon: Sparkles },
                          { id: 'profile', label: navT.profile, icon: User }
                        ].map(item => {
                          const Icon = item.icon;
                          const isActive = currentTab === item.id;
                          return (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => navigateFromMobileMenu(item.id)}
                              className={`w-full text-left rounded-lg px-3 py-2 flex items-center gap-2.5 transition ${
                                isActive
                                  ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-bold'
                                  : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 font-medium'
                              }`}
                            >
                              <Icon className={`h-4 w-4 shrink-0 ${isActive ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'}`} />
                              <span className="truncate">{item.label}</span>
                            </button>
                          );
                        })}
                      </>
                    )}

                    {/* ===================================================== */}
                    {/* CAMBIAR VISTA (Solo si el rol real es Admin / Híbrido) */}
                    {/* ===================================================== */}
                    {canSwitchPerspective && (
                      <>
                        <div className="border-t border-slate-100 dark:border-slate-800 my-1" />
                        <button
                          type="button"
                          onClick={() => toggleMobileSubmenu('perspective')}
                          className="w-full rounded-lg px-3 py-2 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-between gap-2 font-semibold"
                        >
                          <span className="flex items-center gap-2.5">
                            <Crown className="h-4 w-4 text-amber-500" />
                            <span>{t('header.perspectiveSubmenu')}</span>
                          </span>
                          <ChevronDown
                            className={`h-3.5 w-3.5 text-slate-400 transition-transform ${
                              expandedMobileSubmenu === 'perspective' ? 'rotate-180' : ''
                            }`}
                          />
                        </button>
                        {expandedMobileSubmenu === 'perspective' && (
                          <div className="pl-3 pr-1 pb-1 flex flex-col gap-0.5">
                            {currentUser?.role === UserRole.Admin && (
                              <button
                                type="button"
                                onClick={() => { setCurrentRole(UserRole.Admin); closeMobileMenu(); }}
                                className={`w-full text-left rounded-lg px-3 py-1.5 flex items-center gap-2 transition ${
                                  currentRole === UserRole.Admin
                                    ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-bold'
                                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-medium'
                                }`}
                              >
                                <Crown className="h-3.5 w-3.5 shrink-0" />
                                <span>{t('profile.perspectiveLabels.admin')}</span>
                              </button>
                            )}
                            {currentUser?.role === UserRole.Hibrido && (
                              <button
                                type="button"
                                onClick={() => { setCurrentRole(UserRole.Hibrido); closeMobileMenu(); }}
                                className={`w-full text-left rounded-lg px-3 py-1.5 flex items-center gap-2 transition ${
                                  currentRole === UserRole.Hibrido
                                    ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-bold'
                                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-medium'
                                }`}
                              >
                                <Sparkles className="h-3.5 w-3.5 shrink-0" />
                                <span>{t('profile.perspectiveLabels.teacher_student')}</span>
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => { setCurrentRole(UserRole.Monitor); closeMobileMenu(); }}
                              className={`w-full text-left rounded-lg px-3 py-1.5 flex items-center gap-2 transition ${
                                currentRole === UserRole.Monitor
                                  ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 font-bold'
                                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-medium'
                              }`}
                            >
                              <GraduationCap className="h-3.5 w-3.5 shrink-0" />
                              <span>{t('profile.perspectiveLabels.teacher')}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => { setCurrentRole(UserRole.Alumno); closeMobileMenu(); }}
                              className={`w-full text-left rounded-lg px-3 py-1.5 flex items-center gap-2 transition ${
                                currentRole === UserRole.Alumno
                                  ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-bold'
                                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-medium'
                              }`}
                            >
                              <BookOpen className="h-3.5 w-3.5 shrink-0" />
                              <span>{t('profile.perspectiveLabels.student')}</span>
                            </button>
                          </div>
                        )}
                      </>
                    )}

                    {/* ===================================================== */}
                    {/* PIE: MODO CLARO / OSCURO (Todos los roles)            */}
                    {/* ===================================================== */}
                    <div className="border-t border-slate-100 dark:border-slate-800 my-1" />
                    <button
                      type="button"
                      onClick={() => { toggleDarkMode(); closeMobileMenu(); }}
                      className="w-full text-left rounded-lg px-3 py-2 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2.5 font-semibold"
                    >
                      {isDarkMode ? (
                        <Sun className="h-4 w-4 text-amber-400 shrink-0" />
                      ) : (
                        <Moon className="h-4 w-4 text-slate-500 dark:text-slate-400 shrink-0" />
                      )}
                      <span>{isDarkMode ? navT.lightMode : navT.darkMode}</span>
                    </button>
                  </div>
                </>
              )}
            </div>

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