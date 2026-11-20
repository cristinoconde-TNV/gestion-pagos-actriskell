import React from 'react';
import { useApp } from '../context/AppContext';
import {
  LayoutDashboard,
  CreditCard,
  GraduationCap,
  Sparkles,
  User,
  Plus,
  BookOpen,
  Calendar,
  DollarSign,
  Users,
  IdCard
} from 'lucide-react';
import { getNavTexts, createTranslator } from '../lib/i18n';
import { UserRole } from '../types';

interface MobileBottomNavProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
  onOpenRecordPayment: () => void;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  currentTab,
  setCurrentTab,
  onOpenRecordPayment
}) => {
  const {
    periodPayments,
    currentRole,
    currentUser,
    students,
    activities,
    membershipWithdrawalRequests,
    currentTeacherId,
    language
  } = useApp();
  const navT = getNavTexts(language);
  const t = createTranslator(language);

  const pendingCount = periodPayments.filter(p => p.status === 'pending' || p.status === 'overdue').length;
  const pendingEnrollmentRequestsCount = students.reduce(
    (sum, s) => sum + (s.pendingEnrollments?.length || 0),
    0
  );
  const pendingWithdrawalRequestsCount = membershipWithdrawalRequests.filter(
    r => r.status === 'pending'
  ).length;
  const pendingValidationCount =
    students.filter(
      s => s.status === 'pending_validation' || s.validationStatus === 'pending'
    ).length +
    pendingEnrollmentRequestsCount +
    pendingWithdrawalRequestsCount;

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

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 md:hidden border-t border-slate-200/90 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-lg pb-[env(safe-area-inset-bottom)] shadow-lg no-print">
      <div className="flex h-16 items-center justify-around px-1">
        {/* ROL: ADMINISTRADOR */}
        {currentRole === UserRole.Admin && (
          <>
            <button
              onClick={() => setCurrentTab('dashboard')}
              title={navT.adminPortal}
              className={`flex flex-col items-center justify-center flex-1 py-1 transition-colors min-h-[44px] ${
                currentTab === 'dashboard'
                  ? 'text-emerald-600 dark:text-emerald-400 font-bold'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              <LayoutDashboard className="h-5 w-5" />
              <span className="text-[10px] mt-1 tracking-tight whitespace-nowrap">{navT.adminPortalShort}</span>
            </button>

            <button
              onClick={() => setCurrentTab('calendar')}
              className={`flex flex-col items-center justify-center flex-1 py-1 transition-colors min-h-[44px] ${
                currentTab === 'calendar'
                  ? 'text-emerald-600 dark:text-emerald-400 font-bold'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              <Calendar className="h-5 w-5" />
              <span className="text-[10px] mt-1 tracking-tight whitespace-nowrap">{navT.calendar}</span>
            </button>

            <button
              onClick={() => setCurrentTab('payments')}
              className={`relative flex flex-col items-center justify-center flex-1 py-1 transition-colors min-h-[44px] ${
                currentTab === 'payments'
                  ? 'text-emerald-600 dark:text-emerald-400 font-bold'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              <CreditCard className="h-5 w-5" />
              <span className="text-[9.5px] mt-1 tracking-tight whitespace-nowrap">{navT.paymentsShort}</span>
              {pendingCount > 0 && (
                <span className="absolute top-1 right-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-amber-500 px-1 text-[9px] font-black text-white shadow-xs">
                  {pendingCount}
                </span>
              )}
            </button>
            
            {/* Botón Central Rápido "+" */}
            {/*<div className="flex items-center justify-center px-1">
              <button
                onClick={onOpenRecordPayment}
                title={t('header.mobileRecordPaymentTooltip')}
                className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-600 text-white shadow-lg shadow-emerald-600/30 active:scale-95 transition min-h-[48px] min-w-[48px]"
              >
                <Plus className="h-6 w-6" />
              </button>
            </div>*/}

            <button
              onClick={() => setCurrentTab('admin-users')}
              title={navT.usersAndMembers}
              className={`relative flex flex-col items-center justify-center flex-1 py-1 transition-colors min-h-[44px] ${
                currentTab === 'admin-users'
                  ? 'text-emerald-600 dark:text-emerald-400 font-bold'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              <Users className="h-5 w-5" />
              <span className="text-[9.5px] mt-1 tracking-tight whitespace-nowrap">{navT.usersShort}</span>
              {pendingValidationCount > 0 && (
                <span className="absolute top-1 right-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-amber-500 px-1 text-[9px] font-black text-white shadow-xs">
                  {pendingValidationCount}
                </span>
              )}
            </button>
          </>
        )}

        {/* ROL: MONITOR (Portal, Alumnos, Calendario, Talleres, Liquidaciones, Perfil) */}
        {currentRole === UserRole.Monitor && (
          <>
            <button
              onClick={() => setCurrentTab('teacher-portal')}
              className={`flex flex-col items-center justify-center flex-1 py-1 transition-colors min-h-[44px] ${
                currentTab === 'teacher-portal'
                  ? 'text-indigo-600 dark:text-indigo-400 font-bold'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              <GraduationCap className="h-5 w-5" />
              <span className="text-[9px] mt-1 tracking-tight whitespace-nowrap">{navT.portal}</span>
            </button>

            <button
              onClick={() => setCurrentTab('calendar')}
              className={`flex flex-col items-center justify-center flex-1 py-1 transition-colors min-h-[44px] ${
                currentTab === 'calendar'
                  ? 'text-emerald-600 dark:text-emerald-400 font-bold'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              <Calendar className="h-5 w-5" />
              <span className="text-[9px] mt-1 tracking-tight whitespace-nowrap">{navT.calendarShort}</span>
            </button>

            <button
              onClick={() => setCurrentTab('activities')}
              className={`flex flex-col items-center justify-center flex-1 py-1 transition-colors min-h-[44px] ${
                currentTab === 'activities'
                  ? 'text-indigo-600 dark:text-indigo-400 font-bold'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              <Sparkles className="h-5 w-5" />
              <span className="text-[9px] mt-1 tracking-tight whitespace-nowrap">{navT.activitiesShort}</span>
            </button>
            
            <button
              onClick={() => setCurrentTab('teacher-students')}
              className={`relative flex flex-col items-center justify-center flex-1 py-1 transition-colors min-h-[44px] ${
                currentTab === 'teacher-students'
                  ? 'text-indigo-600 dark:text-indigo-400 font-bold'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              <Users className="h-5 w-5" />
              <span className="text-[9px] mt-1 tracking-tight whitespace-nowrap">{navT.students}</span>
              {teacherPendingRequestsCount > 0 && (
                <span className="absolute top-1 right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-amber-500 px-1 text-[9px] font-black text-white shadow-xs">
                  {teacherPendingRequestsCount}
                </span>
              )}
            </button>

            <button
              onClick={() => setCurrentTab('teacher-payouts')}
              className={`flex flex-col items-center justify-center flex-1 py-1 transition-colors min-h-[44px] ${
                currentTab === 'teacher-payouts'
                  ? 'text-indigo-600 dark:text-indigo-400 font-bold'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              <DollarSign className="h-5 w-5" />
              <span className="text-[8.5px] mt-1 tracking-tighter whitespace-nowrap">{navT.payoutsShort}</span>
            </button>
          </>
        )}

        {/* ROL: ALUMNO */}
        {currentRole === UserRole.Alumno && (
          <>
            <button
              onClick={() => setCurrentTab('student-portal')}
              className={`flex flex-col items-center justify-center flex-1 py-1 transition-colors min-h-[44px] ${
                currentTab === 'student-portal'
                  ? 'text-emerald-600 dark:text-emerald-400 font-bold'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              <BookOpen className="h-5 w-5" />
              <span className="text-[10px] mt-1 tracking-tight whitespace-nowrap">{navT.portal}</span>
            </button>

            <button
              onClick={() => setCurrentTab('calendar')}
              className={`flex flex-col items-center justify-center flex-1 py-1 transition-colors min-h-[44px] ${
                currentTab === 'calendar'
                  ? 'text-emerald-600 dark:text-emerald-400 font-bold'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              <Calendar className="h-5 w-5" />
              <span className="text-[10px] mt-1 tracking-tight whitespace-nowrap">{navT.calendar}</span>
            </button>

            <button
              onClick={() => setCurrentTab('activities')}
              className={`flex flex-col items-center justify-center flex-1 py-1 transition-colors min-h-[44px] ${
                currentTab === 'activities'
                  ? 'text-emerald-600 dark:text-emerald-400 font-bold'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              <Sparkles className="h-5 w-5" />
              <span className="text-[10px] mt-1 tracking-tight whitespace-nowrap">{navT.activities}</span>
            </button>
          </>
        )}

        {/* ROL: SOCIO */}
        {currentRole === UserRole.Socio && currentUser?.role === UserRole.Socio && (
          <>
            <button
              onClick={() => setCurrentTab('socio-portal')}
              className={`flex flex-col items-center justify-center flex-1 py-1 transition-colors min-h-[44px] ${
                currentTab === 'socio-portal'
                  ? 'text-teal-600 dark:text-teal-400 font-bold'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              <IdCard className="h-5 w-5" />
              <span className="text-[10px] mt-1 tracking-tight whitespace-nowrap">{navT.portal}</span>
            </button>

            <button
              onClick={() => setCurrentTab('calendar')}
              className={`flex flex-col items-center justify-center flex-1 py-1 transition-colors min-h-[44px] ${
                currentTab === 'calendar'
                  ? 'text-emerald-600 dark:text-emerald-400 font-bold'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              <Calendar className="h-5 w-5" />
              <span className="text-[10px] mt-1 tracking-tight whitespace-nowrap">{navT.calendar}</span>
            </button>

            <button
              onClick={() => setCurrentTab('activities')}
              className={`flex flex-col items-center justify-center flex-1 py-1 transition-colors min-h-[44px] ${
                currentTab === 'activities'
                  ? 'text-emerald-600 dark:text-emerald-400 font-bold'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              <Sparkles className="h-5 w-5" />
              <span className="text-[10px] mt-1 tracking-tight whitespace-nowrap">{navT.activities}</span>
            </button>
          </>
        )}

        {/* ROL: MONITOR-ALUMNO (Unión de alumno y monitor) */}
        {currentRole === UserRole.Hibrido && (
          <>
            <button
              onClick={() => setCurrentTab('teacher-portal')}
              className={`flex flex-col items-center justify-center flex-1 py-1 transition-colors min-h-[44px] ${
                currentTab === 'teacher-portal'
                  ? 'text-indigo-600 dark:text-indigo-400 font-bold'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              <GraduationCap className="h-5 w-5" />
              <span className="text-[9px] mt-1 tracking-tight whitespace-nowrap">{navT.teacherShort}</span>
            </button>

            <button
              onClick={() => setCurrentTab('teacher-students')}
              className={`relative flex flex-col items-center justify-center flex-1 py-1 transition-colors min-h-[44px] ${
                currentTab === 'teacher-students'
                  ? 'text-indigo-600 dark:text-indigo-400 font-bold'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              <Users className="h-5 w-5" />
              <span className="text-[9px] mt-1 tracking-tight whitespace-nowrap">{navT.students}</span>
              {teacherPendingRequestsCount > 0 && (
                <span className="absolute top-1 right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-amber-500 px-1 text-[9px] font-black text-white shadow-xs">
                  {teacherPendingRequestsCount}
                </span>
              )}
            </button>

            <button
              onClick={() => setCurrentTab('student-portal')}
              className={`flex flex-col items-center justify-center flex-1 py-1 transition-colors min-h-[44px] ${
                currentTab === 'student-portal'
                  ? 'text-emerald-600 dark:text-emerald-400 font-bold'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              <BookOpen className="h-5 w-5" />
              <span className="text-[9px] mt-1 tracking-tight whitespace-nowrap">{navT.studentShort}</span>
            </button>

            <button
              onClick={() => setCurrentTab('calendar')}
              className={`flex flex-col items-center justify-center flex-1 py-1 transition-colors min-h-[44px] ${
                currentTab === 'calendar'
                  ? 'text-emerald-600 dark:text-emerald-400 font-bold'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              <Calendar className="h-5 w-5" />
              <span className="text-[9px] mt-1 tracking-tight whitespace-nowrap">{navT.calendarShort}</span>
            </button>

            <button
              onClick={() => setCurrentTab('activities')}
              className={`flex flex-col items-center justify-center flex-1 py-1 transition-colors min-h-[44px] ${
                currentTab === 'activities'
                  ? 'text-emerald-600 dark:text-emerald-400 font-bold'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              <Sparkles className="h-5 w-5" />
              <span className="text-[9px] mt-1 tracking-tight whitespace-nowrap">{navT.activitiesShort}</span>
            </button>
          </>
        )}

        {/* Perfil (Componente Global Universal accesible por todos los roles) */}
        <button
          onClick={() => setCurrentTab('profile')}
          className={`flex flex-col items-center justify-center flex-1 py-1 transition-colors min-h-[44px] ${
            currentTab === 'profile'
              ? 'text-emerald-600 dark:text-emerald-400 font-bold'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          {currentUser?.photoURL ? (
            <img
              src={currentUser.photoURL}
              alt={currentUser.name}
              className={`h-5 w-5 rounded-full object-cover border ${
                currentTab === 'profile' ? 'border-emerald-500 ring-1 ring-emerald-500' : 'border-emerald-500/60'
              }`}
            />
          ) : (
            <User className="h-5 w-5" />
          )}
          <span className="text-[9.5px] mt-1 tracking-tight whitespace-nowrap">
            {navT.profile}
          </span>
        </button>
      </div>
    </div>
  );
};
