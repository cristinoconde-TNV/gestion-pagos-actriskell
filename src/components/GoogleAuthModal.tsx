import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { createTranslator } from '../lib/i18n';
import { UserRole } from '../types';
import {
  X,
  ShieldCheck,
  LogOut,
  LogIn,
  AlertCircle,
  Lock,
  KeyRound,
  Eye,
  EyeOff,
  CheckCircle2,
  Mail
} from 'lucide-react';

interface GoogleAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const GoogleAuthModal: React.FC<GoogleAuthModalProps> = ({ isOpen, onClose }) => {
  const {
    currentUser,
    loginWithGoogle,
    loginWithEmail,
    changePassword,
    requestPasswordReset,
    isPasswordRecoveryMode,
    setIsPasswordRecoveryMode,
    logout,
    currentRole,
    setCurrentRole,
    language
  } = useApp();
  const t = createTranslator(language);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Estado de cambio de contraseña (usuario autenticado o flujo recovery)
  const [showChangePasswordForm, setShowChangePasswordForm] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  // Estado de restablecimiento de contraseña por email (cuando no hay sesión)
  const [showResetRequest, setShowResetRequest] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setErrorMessage(null);
    setSuccessMessage(null);
    if (isPasswordRecoveryMode) {
      setShowChangePasswordForm(true);
    }
  }, [isOpen, isPasswordRecoveryMode]);

  if (!isOpen) return null;

  const handleGoogleSignIn = async () => {
    setIsSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await loginWithGoogle();
    } catch (err: any) {
      setErrorMessage(err.message || t('googleAuth.errors.googleSignIn'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEmailAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setErrorMessage(t('googleAuth.errors.missingCredentials'));
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const res = await loginWithEmail(email, password);
      if (!res.success) {
        setErrorMessage(res.error || t('googleAuth.errors.invalidCredentials'));
      } else {
        onClose();
      }
    } catch (err: any) {
      setErrorMessage(err.message || t('googleAuth.errors.authFailed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChangePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (newPassword.trim().length < 6) {
      setErrorMessage(t('googleAuth.errors.minPasswordLength'));
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setErrorMessage(t('googleAuth.errors.passwordMismatch'));
      return;
    }

    setIsChangingPassword(true);
    try {
      const res = await changePassword(newPassword);
      if (!res.success) {
        setErrorMessage(res.error || t('googleAuth.errors.changePasswordFailed'));
      } else {
        setSuccessMessage(t('googleAuth.messages.passwordUpdated'));
        setNewPassword('');
        setConfirmNewPassword('');
        setShowChangePasswordForm(false);
        setIsPasswordRecoveryMode(false);
      }
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleSendResetEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const targetEmail = email || currentUser?.email || '';
    if (!targetEmail.trim()) {
      setErrorMessage(t('googleAuth.errors.missingResetEmail'));
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await requestPasswordReset(targetEmail);
      if (!res.success) {
        setErrorMessage(res.error || t('googleAuth.errors.resetSendFailed'));
      } else {
        setSuccessMessage(
          t('googleAuth.messages.resetSent', { email: targetEmail })
        );
        setShowResetRequest(false);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/70 p-0 sm:p-4 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl bg-white dark:bg-slate-900 shadow-2xl border border-slate-200 dark:border-slate-800 max-h-[92dvh] sm:max-h-[88vh] flex flex-col overflow-hidden">
        
        {/* Cabecera del Modal */}
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-5 py-4 bg-slate-50/70 dark:bg-slate-800/40 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-600/10 text-emerald-600 dark:text-emerald-400">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                {t('googleAuth.title')}
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {t('googleAuth.subtitle')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Contenido del Modal */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs">
          {/* Avisos de éxito o error */}
          {successMessage && (
            <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-500/30 p-3 text-emerald-800 dark:text-emerald-200 flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400" />
              <p className="leading-relaxed font-semibold">{successMessage}</p>
            </div>
          )}

          {errorMessage && (
            <div className="rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 p-3 text-rose-700 dark:text-rose-300 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <p className="leading-relaxed">{errorMessage}</p>
            </div>
          )}

          {/* Si ya hay usuario conectado */}
          {currentUser && (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-950/20 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">
                  {t('googleAuth.activeSession')}
                </span>
                <span className="rounded-full bg-emerald-600/20 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
                  {currentUser.role}
                </span>
              </div>

              <div className="flex items-center gap-3">
                {currentUser.photoURL ? (
                  <img
                    src={currentUser.photoURL}
                    alt={currentUser.name}
                    className="h-11 w-11 rounded-full object-cover border-2 border-emerald-500"
                  />
                ) : (
                  <div className="h-11 w-11 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-base">
                    {currentUser.name.charAt(0)}
                  </div>
                )}
                <div>
                  <h4 className="font-extrabold text-slate-900 dark:text-white text-sm">
                    {currentUser.name}
                  </h4>
                  <p className="text-slate-500 dark:text-slate-400 text-xs">
                    {currentUser.email}
                  </p>
                </div>
              </div>

              {/* Si es administrador o híbrido, permitir alternar vista */}
              {(currentUser.role === UserRole.Admin || currentUser.role === UserRole.Hibrido) && (
                <div className="pt-2 border-t border-emerald-200 dark:border-emerald-900/60">
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                    {t('googleAuth.switchViewLabel')}
                  </label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {currentUser.role === UserRole.Admin && (
                      <button
                        type="button"
                        onClick={() => setCurrentRole(UserRole.Admin)}
                        className={`rounded-lg px-2.5 py-1.5 text-left border transition ${
                          currentRole === UserRole.Admin
                            ? 'bg-emerald-600 text-white font-bold border-emerald-600 shadow-xs'
                            : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                        }`}
                      >
                        {t('googleAuth.roleButtonAdmin')}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setCurrentRole(UserRole.Monitor)}
                      className={`rounded-lg px-2.5 py-1.5 text-left border transition ${
                        currentRole === UserRole.Monitor
                          ? 'bg-indigo-600 text-white font-bold border-indigo-600 shadow-xs'
                          : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      {t('googleAuth.roleButtonTeacher')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setCurrentRole(UserRole.Alumno)}
                      className={`rounded-lg px-2.5 py-1.5 text-left border transition ${
                        currentRole === UserRole.Alumno
                          ? 'bg-emerald-600 text-white font-bold border-emerald-600 shadow-xs'
                          : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      {t('googleAuth.roleButtonStudent')}
                    </button>
                  </div>
                </div>
              )}

              {/* Cambio de contraseña directo para el usuario conectado */}
              <div className="pt-2 border-t border-emerald-200 dark:border-emerald-900/60 space-y-2.5">
                <button
                  type="button"
                  onClick={() => {
                    setShowChangePasswordForm(prev => !prev);
                    setErrorMessage(null);
                  }}
                  className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-emerald-500/40 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-bold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-slate-800 transition"
                >
                  <KeyRound className="h-3.5 w-3.5" />
                  <span>
                    {showChangePasswordForm ? t('googleAuth.hideChangePassword') : t('googleAuth.changeMyPassword')}
                  </span>
                </button>

                {showChangePasswordForm && (
                  <form
                    onSubmit={handleChangePasswordSubmit}
                    className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 space-y-2.5"
                  >
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                        {t('googleAuth.newPasswordLabel')}
                      </label>
                      <div className="relative">
                        <input
                          type={showNewPassword ? 'text' : 'password'}
                          required
                          minLength={6}
                          value={newPassword}
                          onChange={e => setNewPassword(e.target.value)}
                          placeholder={t('googleAuth.newPasswordPlaceholder')}
                          className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 pl-3 pr-9 py-2 text-xs text-slate-900 dark:text-white focus:outline-emerald-500"
                        />
                        <button
                          type="button"
                          onClick={() => setShowNewPassword(v => !v)}
                          className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600"
                        >
                          {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                        {t('googleAuth.confirmPasswordLabel')}
                      </label>
                      <input
                        type={showNewPassword ? 'text' : 'password'}
                        required
                        minLength={6}
                        value={confirmNewPassword}
                        onChange={e => setConfirmNewPassword(e.target.value)}
                        placeholder={t('googleAuth.confirmPasswordPlaceholder')}
                        className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-emerald-500"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={isChangingPassword}
                      className="w-full rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700 transition disabled:opacity-60"
                    >
                      {isChangingPassword ? t('googleAuth.updatingPassword') : t('googleAuth.saveNewPassword')}
                    </button>
                  </form>
                )}
              </div>

              <button
                type="button"
                onClick={async () => {
                  await logout();
                  onClose();
                }}
                className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 py-2 font-bold hover:bg-rose-100 transition"
              >
                <LogOut className="h-4 w-4" />
                <span>{t('googleAuth.logout')}</span>
              </button>
            </div>
          )}

          <div className="relative flex items-center justify-center py-1">
            <div className="border-t border-slate-200 dark:border-slate-800 w-full" />
          </div>
         
          {/* Aviso de Registro Restringido */}
          
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3 flex items-start gap-2.5 text-slate-600 dark:text-slate-400">
            <Lock className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
            <p className="text-[11px] leading-relaxed">
              {t('googleAuth.restrictedNoticePart1')}<br />
              {t('googleAuth.restrictedNoticePart2')}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
