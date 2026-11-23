import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { AppProvider, useApp, TeacherFinancialSummary } from './context/AppContext';
import { Header } from './components/Header';
import { DashboardView } from './components/DashboardView';
import { PaymentsView } from './components/PaymentsView';
import { TeachersView } from './components/TeachersView';
import { ActivitiesView } from './components/ActivitiesView';
import { ExpensesView } from './components/ExpensesView';
import { TeacherPortalView } from './components/TeacherPortalView';
import { TeacherPayoutsView } from './components/TeacherPayoutsView';
import { TeacherStudentsView } from './components/TeacherStudentsView';
import { StudentPortalView } from './components/StudentPortalView';
import { SocioPortalView } from './components/SocioPortalView';
import { ProfileView } from './components/ProfileView';
import { CalendarView } from './components/CalendarView';
import { AdminConfigView } from './components/AdminConfigView';
import { AdminUsersView } from './components/AdminUsersView';
import { AdminFeedbackView } from './components/AdminFeedbackView';
import { FeedbackWidgetModal } from './components/FeedbackWidgetModal';
import { SplashScreen } from './components/SplashScreen';
import { SignInScreen } from './components/SignInScreen';
import { LandingPage } from './components/LandingPage';
import { PrivacyPolicyPage, TermsOfServicePage } from './components/LegalPages';
import { ConditionalNotificationModal } from './components/ConditionalNotificationModal';
import { RecordPaymentModal } from './components/RecordPaymentModal';
import { RecordTeacherPayoutModal } from './components/RecordTeacherPayoutModal';
import { AddStudentModal } from './components/AddStudentModal';
import { AddTeacherModal } from './components/AddTeacherModal';
import { AddActivityModal } from './components/AddActivityModal';
import { AddExpenseModal } from './components/AddExpenseModal';
import { AddSessionModal } from './components/AddSessionModal';
import { EnrollStudentModal } from './components/EnrollStudentModal';
import { SupabaseConfigModal } from './components/SupabaseConfigModal';
import { GoogleAuthModal } from './components/GoogleAuthModal';
import { MobileBottomNav } from './components/MobileBottomNav';
import { PaymentRecord, Student, Teacher, Activity, UserRole } from './types';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { createTranslator } from './lib/i18n';

const MainAppContent: React.FC = () => {
  const {
    currentRole,
    currentTeacherId,
    teachers,
    isAuthModalOpen,
    setIsAuthModalOpen,
    dbError,
    clearDbError,
    isAuthLoading,
    currentUser,
    appConfigs,
    refreshFromSupabase,
    language
  } = useApp();

  const t = createTranslator(language);

  const [currentTab, setCurrentTab] = useState<string>('dashboard');

  const [isSupabaseConfigOpen, setIsSupabaseConfigOpen] = useState(false);
  const [adminUsersOpenAccountsSignal, setAdminUsersOpenAccountsSignal] = useState<{
    nonce: number;
    openCreateForm?: boolean;
    openBajasAccordion?: boolean;
    openAltasAccordion?: boolean;
  } | null>(null);

  // Estados de modales
  const [isRecordPaymentOpen, setIsRecordPaymentOpen] = useState(false);
  const [editingPayment, setEditingPayment] = useState<PaymentRecord | null>(null);

  const [isTeacherPayoutOpen, setIsTeacherPayoutOpen] = useState(false);
  const [payoutSummary, setPayoutSummary] = useState<TeacherFinancialSummary | null>(null);

  const [isAddStudentOpen, setIsAddStudentOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);

  const [isAddTeacherOpen, setIsAddTeacherOpen] = useState(false);
  const [editingTeacher, setEditingTeacher] = useState<Teacher | null>(null);

  const [isAddActivityOpen, setIsAddActivityOpen] = useState(false);
  const [editingActivity, setEditingActivity] = useState<Activity | null>(null);

  const [isAddExpenseOpen, setIsAddExpenseOpen] = useState(false);

  const [isAddSessionOpen, setIsAddSessionOpen] = useState(false);
  const [sessionTeacherId, setSessionTeacherId] = useState<string | undefined>(undefined);

  const [isEnrollStudentOpen, setIsEnrollStudentOpen] = useState(false);
  const [enrollActivityId, setEnrollActivityId] = useState<string | undefined>(undefined);

  // Enrutamiento público por pathname (/ , /privacidad , /condiciones , /login)
  const normalizePath = (raw: string) => {
    if (!raw || raw === '/') return '/';
    return raw.endsWith('/') ? raw.slice(0, -1) : raw;
  };

  const [currentPath, setCurrentPath] = useState<string>(() =>
    normalizePath(window.location.pathname)
  );

  useEffect(() => {
    const onPopState = () => {
      setCurrentPath(normalizePath(window.location.pathname));
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigateTo = useCallback((path: string) => {
    const normalized = normalizePath(path);
    if (normalizePath(window.location.pathname) !== normalized) {
      window.history.pushState({}, '', normalized);
    }
    setCurrentPath(normalized);
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [currentTab, currentPath]);

  // Refrescar datos desde Supabase al cambiar de pestaña o ruta
  const lastRouteRefreshKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (isAuthLoading || !currentUser) {
      lastRouteRefreshKeyRef.current = null;
      return;
    }
    if (currentPath === '/privacidad' || currentPath === '/condiciones') {
      return;
    }
    const refreshKey = `${currentUser.id}:${currentTab}:${currentPath}`;
    if (lastRouteRefreshKeyRef.current === refreshKey) {
      return;
    }
    lastRouteRefreshKeyRef.current = refreshKey;
    void refreshFromSupabase();
  }, [currentTab, currentPath, isAuthLoading, currentUser, refreshFromSupabase]);

  // Estado para la Splash Screen (solo cuando hay sesión activa)
  const [showSplash, setShowSplash] = useState(true);

  // Estado para el Comunicado Emergente condicional (app_config.popup_notification)
  const [isConditionalPopupOpen, setIsConditionalPopupOpen] = useState(false);
  const [popupMessage, setPopupMessage] = useState('');

  // Finalizar splash screen y comprobar pop-up (memoizado para no reiniciar el temporizador de SplashScreen)
  const handleSplashFinish = useCallback(() => {
    setShowSplash(false);
    // Verificar si hay comunicado activo en app_config
    const popupCfg = appConfigs.find(c => c.config_key === 'popup_notification');
    if (popupCfg && popupCfg.is_active && popupCfg.config_value) {
      try {
        const isDismissed = sessionStorage.getItem('triskell_popup_dismissed');
        if (!isDismissed) {
          setPopupMessage(popupCfg.config_value);
          setIsConditionalPopupOpen(true);
        }
      } catch {
        setPopupMessage(popupCfg.config_value);
        setIsConditionalPopupOpen(true);
      }
    }
  }, [appConfigs]);

  const isStrictSocio = Boolean(
    currentUser && currentUser.role === UserRole.Socio && currentRole === UserRole.Socio
  );

  const handleTabChange = useCallback(
    (nextTab: string) => {
      if (nextTab !== 'admin-users') {
        setAdminUsersOpenAccountsSignal(null);
      }
      setCurrentTab(nextTab);
      if (nextTab === 'socio-portal' && isStrictSocio) {
        navigateTo('/portal-socio');
      } else if (currentPath === '/portal-socio') {
        navigateTo('/');
      }
    },
    [isStrictSocio, currentPath, navigateTo]
  );

  const handleOpenAccessAccounts = useCallback(
    (openCreateForm = false) => {
      handleTabChange('admin-users');
      setAdminUsersOpenAccountsSignal(prev => ({
        nonce: (prev?.nonce || 0) + 1,
        openCreateForm
      }));
    },
    [handleTabChange]
  );

  const handleReviewAssociationWithdrawals = useCallback(() => {
    handleTabChange('admin-users');
    setAdminUsersOpenAccountsSignal(prev => ({
      nonce: (prev?.nonce || 0) + 1,
      openCreateForm: false,
      openBajasAccordion: true
    }));
  }, [handleTabChange]);

  const availableTabsForRole = useMemo(() => {
    switch (currentRole) {
      case UserRole.Admin:
        return ['dashboard', 'admin-users', 'calendar', 'payments', 'teachers', 'activities', 'expenses', 'admin-config', 'admin-feedback', 'teacher-portal', 'student-portal', 'profile'];
      case UserRole.Monitor:
        return ['teacher-portal', 'teacher-students', 'calendar', 'activities', 'teacher-payouts', 'profile'];
      case UserRole.Alumno:
        return ['student-portal', 'calendar', 'activities', 'profile'];
      case UserRole.Socio:
        return isStrictSocio
          ? ['socio-portal', 'calendar', 'activities', 'profile']
          : ['calendar', 'activities', 'profile'];
      case UserRole.Hibrido:
        return ['teacher-portal', 'teacher-students', 'student-portal', 'calendar', 'activities', 'profile'];
      default:
        return ['dashboard', 'calendar', 'profile'];
    }
  }, [currentRole, isStrictSocio]);

  useEffect(() => {
    if (!availableTabsForRole.includes(currentTab)) {
      setCurrentTab(availableTabsForRole[0]);
    }
  }, [availableTabsForRole, currentTab]);

  // Redirigir automáticamente al Portal correspondiente al iniciar sesión
  const lastAuthUserIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!currentUser || !currentUser.access) {
      lastAuthUserIdRef.current = null;
      return;
    }

    if (lastAuthUserIdRef.current !== currentUser.id) {
      lastAuthUserIdRef.current = currentUser.id;
      const defaultPortalTab =
        currentUser.role === UserRole.Admin
          ? 'dashboard'
          : currentUser.role === UserRole.Alumno
          ? 'student-portal'
          : currentUser.role === UserRole.Socio
          ? 'socio-portal'
          : 'teacher-portal';
      setCurrentTab(defaultPortalTab);
      if (currentUser.role === UserRole.Socio) {
        navigateTo('/portal-socio');
      } else if (currentPath === '/login' || currentPath === '/portal-socio') {
        navigateTo('/');
      }
    }
  }, [currentUser, currentPath, navigateTo]);

  useEffect(() => {
    if (isAuthLoading || !currentUser) return;
    if (currentPath === '/portal-socio' && isStrictSocio && currentTab !== 'socio-portal') {
      setCurrentTab('socio-portal');
    }
  }, [isAuthLoading, currentUser, currentPath, isStrictSocio, currentTab]);

  // Handlers para abrir modales
  const handleOpenRecordPayment = (payment?: PaymentRecord) => {
    setEditingPayment(payment || null);
    setIsRecordPaymentOpen(true);
  };

  const handleOpenTeacherPayout = (summary: TeacherFinancialSummary) => {
    setPayoutSummary(summary);
    setIsTeacherPayoutOpen(true);
  };

  const handleOpenAddStudent = (student?: Student) => {
    setEditingStudent(student || null);
    setIsAddStudentOpen(true);
  };

  const handleOpenAddTeacher = (teacher?: Teacher) => {
    setEditingTeacher(teacher || null);
    setIsAddTeacherOpen(true);
  };

  const handleOpenAddActivity = (activity?: Activity) => {
    setEditingActivity(activity || null);
    setIsAddActivityOpen(true);
  };

  const handleOpenAddSession = (teacherId?: string) => {
    setSessionTeacherId(teacherId || (currentRole === UserRole.Monitor ? currentTeacherId : undefined));
    setIsAddSessionOpen(true);
  };

  // Rutas legales públicas accesibles siempre sin autenticación ni splash screen
  if (currentPath === '/privacidad') {
    return (
      <PrivacyPolicyPage
        onNavigate={navigateTo}
        onSignIn={() => navigateTo(currentUser ? '/' : '/login')}
      />
    );
  }

  if (currentPath === '/condiciones') {
    return (
      <TermsOfServicePage
        onNavigate={navigateTo}
        onSignIn={() => navigateTo(currentUser ? '/' : '/login')}
      />
    );
  }

  // Esperar verificación inicial de credenciales antes de decidir Landing / Portal
  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-white px-4">
        <div className="h-10 w-10 rounded-full border-2 border-emerald-500/30 border-t-emerald-400 animate-spin mb-3" />
        <span className="text-xs font-semibold text-slate-300">
          {t('app.verifyingSession')}
        </span>
      </div>
    );
  }

  // Si no hay usuario autenticado o tiene access=false: servir Landing Pública o SignInScreen
  if (!currentUser || !currentUser.access) {
    if (currentPath === '/login' || currentPath === '/portal-socio' || Boolean(dbError)) {
      return (
        <SignInScreen
          onNavigate={navigateTo}
          onSuccess={() => navigateTo('/')}
        />
      );
    }

    return (
      <LandingPage
        onNavigate={navigateTo}
        onSignIn={() => navigateTo('/login')}
      />
    );
  }

  // Renderizar Splash Screen al iniciar sesión autenticada
  if (showSplash) {
    return <SplashScreen onFinish={handleSplashFinish} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col font-sans transition-colors duration-200">
      <Header
        currentTab={currentTab}
        setCurrentTab={handleTabChange}
        onOpenRecordPayment={() => handleOpenRecordPayment()}
        onOpenAddStudent={() => handleOpenAddStudent()}
        onOpenAddTeacher={() => handleOpenAddTeacher()}
        onOpenAddExpense={() => setIsAddExpenseOpen(true)}
        onOpenAddSession={() => handleOpenAddSession()}
        onOpenSupabaseModal={() => setIsSupabaseConfigOpen(true)}
        onOpenUserManagement={(openCreateForm?: boolean) =>
          handleOpenAccessAccounts(Boolean(openCreateForm))
        }
      />

      <main className="flex-1 mx-auto max-w-7xl w-full px-3 sm:px-6 lg:px-8 pt-3 sm:pt-5 pb-4 md:pb-6">
        {/* Banner de Errores de Base de Datos y Permisos RLS */}
        {dbError && (
          <div className="mb-4 rounded-2xl border border-rose-300 dark:border-rose-900 bg-rose-50/95 dark:bg-rose-950/80 p-4 text-xs shadow-lg backdrop-blur-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in">
            <div className="flex items-start gap-3 text-rose-800 dark:text-rose-200">
              <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5 text-rose-600 dark:text-rose-400" />
              <div>
                <p className="font-bold text-sm">{t('app.dbErrorTitle')}</p>
                <p className="mt-0.5 leading-relaxed">{dbError}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setIsAuthModalOpen(true)}
                className="rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold px-3 py-1.5 transition text-xs shadow-xs"
              >
                {t('app.authenticateSupabase')}
              </button>
              <button
                type="button"
                onClick={clearDbError}
                className="rounded-xl border border-rose-300 dark:border-rose-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 font-semibold px-3 py-1.5 transition text-xs hover:bg-rose-50"
              >
                {t('app.close')}
              </button>
            </div>
          </div>
        )}
        {currentPath === '/portal-socio' && !isStrictSocio ? (
          <SocioPortalView
            onNavigateToTab={handleTabChange}
            onNavigateHome={() => navigateTo('/')}
          />
        ) : (
          <>
            {currentTab === 'dashboard' && availableTabsForRole.includes('dashboard') && (
              <DashboardView
                onOpenRecordPayment={handleOpenRecordPayment}
                onOpenAddSession={handleOpenAddSession}
                onOpenAddExpense={() => setIsAddExpenseOpen(true)}
                onNavigateToTab={handleTabChange}
                onReviewWithdrawalRequests={handleReviewAssociationWithdrawals}
              />
            )}

            {currentTab === 'payments' && availableTabsForRole.includes('payments') && (
              <PaymentsView
                onOpenRecordPayment={handleOpenRecordPayment}
                onOpenAddStudent={() => handleOpenAddStudent()}
              />
            )}

            {currentTab === 'teachers' && availableTabsForRole.includes('teachers') && (
              <TeachersView
                onOpenTeacherPayout={handleOpenTeacherPayout}
                onOpenAddTeacher={handleOpenAddTeacher}
                onOpenAddSession={handleOpenAddSession}
              />
            )}

            {currentTab === 'activities' && availableTabsForRole.includes('activities') && (
              <ActivitiesView
                onOpenAddActivity={handleOpenAddActivity}
                onOpenAddStudent={() => handleOpenAddStudent()}
                onOpenEnrollStudent={(activityId?: string) => {
                  setEnrollActivityId(activityId);
                  setIsEnrollStudentOpen(true);
                }}
              />
            )}

            {currentTab === 'expenses' && availableTabsForRole.includes('expenses') && (
              <ExpensesView
                onOpenAddExpense={() => setIsAddExpenseOpen(true)}
              />
            )}

            {currentTab === 'teacher-portal' && availableTabsForRole.includes('teacher-portal') && (
              <TeacherPortalView
                onOpenAddSession={handleOpenAddSession}
                onOpenRecordPayment={() => handleOpenRecordPayment()}
                onOpenAddActivity={(activity?: Activity) => handleOpenAddActivity(activity)}
                onOpenAddStudent={() => handleOpenAddStudent()}
                onOpenEnrollStudent={(activityId?: string) => {
                  setEnrollActivityId(activityId);
                  setIsEnrollStudentOpen(true);
                }}
                onNavigateToProfile={() => handleTabChange('profile')}
              />
            )}

            {currentTab === 'teacher-payouts' && availableTabsForRole.includes('teacher-payouts') && (
              <TeacherPayoutsView />
            )}

            {currentTab === 'teacher-students' && availableTabsForRole.includes('teacher-students') && (
              <TeacherStudentsView
                onOpenEnrollStudent={(activityId?: string) => {
                  setEnrollActivityId(activityId);
                  setIsEnrollStudentOpen(true);
                }}
              />
            )}

            {currentTab === 'student-portal' && availableTabsForRole.includes('student-portal') && (
              <StudentPortalView
                onNavigateToProfile={() => handleTabChange('profile')}
              />
            )}

            {currentTab === 'socio-portal' && isStrictSocio && availableTabsForRole.includes('socio-portal') && (
              <SocioPortalView
                onNavigateToTab={handleTabChange}
                onNavigateHome={() => navigateTo('/')}
              />
            )}

            {currentTab === 'calendar' && availableTabsForRole.includes('calendar') && (
              <CalendarView
                onOpenAddSession={handleOpenAddSession}
                onNavigateToActivities={() => handleTabChange('activities')}
              />
            )}

            {currentTab === 'admin-config' && availableTabsForRole.includes('admin-config') && (
              <AdminConfigView onOpenSupabaseModal={() => setIsSupabaseConfigOpen(true)} />
            )}
            {currentTab === 'admin-feedback' && availableTabsForRole.includes('admin-feedback') && (
              <AdminFeedbackView />
            )}

            {currentTab === 'admin-users' && availableTabsForRole.includes('admin-users') && (
              <AdminUsersView
                onOpenAddStudent={handleOpenAddStudent}
                onOpenAddTeacher={handleOpenAddTeacher}
                onOpenEnrollStudent={(activityId?: string) => {
                  setEnrollActivityId(activityId);
                  setIsEnrollStudentOpen(true);
                }}
                openAccountsSignal={adminUsersOpenAccountsSignal}
              />
            )}

            {currentTab === 'profile' && availableTabsForRole.includes('profile') && (
              <ProfileView
                onNavigate={navigateTo}
                onNavigateToTab={handleTabChange}
              />
            )}
          </>
        )}
      </main>

      {/* Pie de página sutil */}
      <footer className="border-t border-slate-200/80 dark:border-slate-800 pt-3 pb-[calc(4.25rem+env(safe-area-inset-bottom))] md:py-4 px-3 text-center text-xs text-slate-500 dark:text-slate-400 no-print">
        <div className="flex items-center justify-center gap-2 mb-1">
          <span className="font-extrabold tracking-tight text-slate-800 dark:text-slate-200">
            A.C.TRISKELL
          </span>
          <span>·</span>
          <span>{t('app.footerTitle')}</span>
        </div>
        <p className="text-[11px] text-slate-400">
          {t('app.footerDescription')}
        </p>
        <div className="mt-2 flex items-center justify-center gap-4 text-[11px] text-slate-500 dark:text-slate-400">
          <a
            href="/privacidad"
            onClick={(e) => {
              e.preventDefault();
              navigateTo('/privacidad');
            }}
            className="hover:text-slate-900 dark:hover:text-white underline underline-offset-4"
          >
            {t('app.privacyPolicy')}
          </a>
          <span aria-hidden="true">·</span>
          <a
            href="/condiciones"
            onClick={(e) => {
              e.preventDefault();
              navigateTo('/condiciones');
            }}
            className="hover:text-slate-900 dark:hover:text-white underline underline-offset-4"
          >
            {t('app.termsOfService')}
          </a>
        </div>
      </footer>

      {/* Modales */}

      {isRecordPaymentOpen && (
        <RecordPaymentModal
          isOpen={isRecordPaymentOpen}
          onClose={() => {
            setIsRecordPaymentOpen(false);
            setEditingPayment(null);
          }}
          initialPayment={editingPayment}
        />
      )}

      {isTeacherPayoutOpen && (
        <RecordTeacherPayoutModal
          summary={payoutSummary}
          onClose={() => {
            setIsTeacherPayoutOpen(false);
            setPayoutSummary(null);
          }}
        />
      )}

      {isAddStudentOpen && (
        <AddStudentModal
          isOpen={isAddStudentOpen}
          onClose={() => {
            setIsAddStudentOpen(false);
            setEditingStudent(null);
          }}
          studentToEdit={editingStudent}
        />
      )}

      {isAddTeacherOpen && (
        <AddTeacherModal
          isOpen={isAddTeacherOpen}
          onClose={() => {
            setIsAddTeacherOpen(false);
            setEditingTeacher(null);
          }}
          teacherToEdit={editingTeacher}
        />
      )}

      {isAddActivityOpen && (
        <AddActivityModal
          isOpen={isAddActivityOpen}
          onClose={() => {
            setIsAddActivityOpen(false);
            setEditingActivity(null);
          }}
          activityToEdit={editingActivity}
          defaultTeacherId={currentRole !== UserRole.Admin ? currentTeacherId : undefined}
          lockTeacherSelection={currentRole !== UserRole.Admin}
        />
      )}

      {isAddExpenseOpen && (
        <AddExpenseModal
          isOpen={isAddExpenseOpen}
          onClose={() => setIsAddExpenseOpen(false)}
        />
      )}

      {isAddSessionOpen && (
        <AddSessionModal
          isOpen={isAddSessionOpen}
          onClose={() => {
            setIsAddSessionOpen(false);
            setSessionTeacherId(undefined);
          }}
          defaultTeacherId={sessionTeacherId}
        />
      )}

      {isEnrollStudentOpen && (
        <EnrollStudentModal
          isOpen={isEnrollStudentOpen}
          onClose={() => {
            setIsEnrollStudentOpen(false);
            setEnrollActivityId(undefined);
          }}
          initialActivityId={enrollActivityId}
          allowedTeacherId={currentRole === UserRole.Monitor ? currentTeacherId : undefined}
        />
      )}

      {isSupabaseConfigOpen && (
        <SupabaseConfigModal
          isOpen={isSupabaseConfigOpen}
          onClose={() => setIsSupabaseConfigOpen(false)}
        />
      )}

      {/* Modal de Autenticación con Google */}
      <GoogleAuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
      />

      {/* Pop-up de Comunicado Condicional tras Splash Screen */}
      <ConditionalNotificationModal
        isOpen={isConditionalPopupOpen}
        onClose={() => setIsConditionalPopupOpen(false)}
        message={popupMessage}
      />

      {/* Widget Flotante de Feedback e Incidencias (controlado desde app_config) */}
      <FeedbackWidgetModal currentTab={currentTab} />

      {/* Barra de Navegación Inferior Nativa en Móviles */}
      <MobileBottomNav
        currentTab={currentTab}
        setCurrentTab={handleTabChange}
        onOpenRecordPayment={() => handleOpenRecordPayment()}
      />
    </div>
  );
};

export default function App() {
  return (
    <AppProvider>
      <MainAppContent />
    </AppProvider>
  );
}
