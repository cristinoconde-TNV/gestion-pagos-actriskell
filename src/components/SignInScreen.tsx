import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { createTranslator } from '../lib/i18n';
import {
  Fingerprint,
  Lock,
  Mail,
  Eye,
  EyeOff,
  ShieldCheck,
  AlertCircle,
  ArrowLeft,
  KeyRound,
  CheckCircle2,
  Clock,
  ChevronDown
} from 'lucide-react';

interface SignInScreenProps {
  onSuccess?: () => void;
  onNavigate?: (path: string) => void;
}

export const SignInScreen: React.FC<SignInScreenProps> = ({ onSuccess, onNavigate }) => {
  const {
    loginWithGoogle,
    loginWithEmail,
    requestPasswordReset,
    unlockWithBiometrics,
    hasBiometricsEnabled,
    biometricUser,
    isBiometricsSupported,
    enableBiometrics,
    dbError,
    authDenialKind,
    clearDbError,
    language
  } = useApp();
  const t = createTranslator(language);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberBiometrics, setRememberBiometrics] = useState(false);
  const [loading, setLoading] = useState(false);
  const [biometricLoading, setBiometricLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const [showPasswordPanel, setShowPasswordPanel] = useState(false);
  const [isResetMode, setIsResetMode] = useState(false);

  useEffect(() => {
    if (biometricUser?.email) {
      setEmail(biometricUser.email);
    }
  }, [biometricUser]);

  const handlePasswordSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setErrorMessage(t('signIn.errors.missingCredentials'));
      return;
    }

    setLoading(true);
    setErrorMessage(null);
    clearDbError();

    try {
      const res = await loginWithEmail(email, password);
      if (res.success) {
        if (rememberBiometrics && isBiometricsSupported && !hasBiometricsEnabled) {
          try {
            await enableBiometrics();
          } catch (bioErr) {
            console.log('Biometrics optional activation ignored:', bioErr);
          }
        }
        onSuccess?.();
      } else {
        setErrorMessage(res.error || t('signIn.errors.invalidCredentials'));
      }
    } catch (err: any) {
      setErrorMessage(err.message || t('signIn.errors.signInFailed'));
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordResetRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    clearDbError();
    setResetMessage(null);

    if (!email.trim()) {
      setErrorMessage(t('signIn.errors.missingEmailForReset'));
      return;
    }

    setLoading(true);
    try {
      const res = await requestPasswordReset(email);
      if (res.success) {
        setResetMessage(t('signIn.resetSuccess', { email: email.trim() }));
        setIsResetMode(false);
      } else {
        setErrorMessage(res.error || t('signIn.errors.resetEmailFailed'));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      await loginWithGoogle();
      onSuccess?.();
    } catch (err: any) {
      setErrorMessage(err.message || t('signIn.errors.googleFailed'));
    } finally {
      setLoading(false);
    }
  };

  const handleBiometricUnlock = async () => {
    setBiometricLoading(true);
    setErrorMessage(null);
    try {
      const ok = await unlockWithBiometrics();
      if (ok) {
        onSuccess?.();
      }
    } catch (err: any) {
      setErrorMessage(err.message || t('signIn.errors.biometricsFailed'));
    } finally {
      setBiometricLoading(false);
    }
  };

  const isPendingNotice =
    authDenialKind === 'pending' && (!errorMessage || errorMessage === dbError);
  const activeNotice = errorMessage || dbError;

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col justify-center items-center px-4 py-8 relative overflow-hidden">
      {/* Círculos ambientales de fondo */}
      <div className="absolute top-0 -left-20 w-80 h-80 rounded-full bg-emerald-600/10 blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 -right-20 w-80 h-80 rounded-full bg-teal-600/10 blur-3xl pointer-events-none" />

      <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl p-6 sm:p-8 relative z-10">
        {onNavigate && (
          <div className="mb-4">
            <a
              href="/"
              onClick={(e) => {
                e.preventDefault();
                onNavigate('/');
              }}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>{t('signIn.backHome')}</span>
            </a>
          </div>
        )}

        {/* Cabecera / Logo */}
        <div className="flex flex-col items-center text-center mb-6">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-700 text-white shadow-lg shadow-emerald-600/30 mb-3 border border-emerald-400/30">
            <img
              src="/logo.png"
              alt={t('signIn.logoAlt')}
              className="h-full w-full object-contain animate-[spin_12s_linear_infinite]"
            />
          </div>
          <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            A.C.TRISKELL
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {t('signIn.subtitle')}
          </p>
        </div>

        {/* Mensaje de confirmación de recuperación */}
        {resetMessage && (
          <div className="mb-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 p-3 text-xs text-emerald-800 dark:text-emerald-200 flex items-start gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-emerald-600" />
            <span className="flex-1">{resetMessage}</span>
          </div>
        )}

        {/* Mensaje de estado pendiente o error */}
        {activeNotice && (
          <div
            className={`mb-4 rounded-xl border p-3 text-xs flex items-start gap-2 ${
              isPendingNotice
                ? 'bg-amber-50 dark:bg-amber-950/60 border-amber-200 dark:border-amber-800/80 text-amber-800 dark:text-amber-200'
                : 'bg-rose-50 dark:bg-rose-950/60 border-rose-200 dark:border-rose-800/80 text-rose-700 dark:text-rose-300'
            }`}
          >
            {isPendingNotice ? (
              <Clock className="h-4 w-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            )}
            <span className="flex-1">{activeNotice}</span>
            <button
              type="button"
              onClick={() => {
                setErrorMessage(null);
                clearDbError();
              }}
              className={
                isPendingNotice
                  ? 'text-amber-600 hover:text-amber-800 font-bold'
                  : 'text-rose-500 hover:text-rose-700 font-bold'
              }
            >
              ✕
            </button>
          </div>
        )}

        {/* Desbloqueo biométrico */}
        {hasBiometricsEnabled && biometricUser && (
          <div className="mb-6 p-4 rounded-2xl bg-gradient-to-r from-emerald-500/10 via-teal-500/10 to-indigo-500/10 border border-emerald-500/30 text-center">
            <div className="flex items-center justify-center gap-2 mb-1.5">
              <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <span className="text-xs font-bold text-slate-900 dark:text-white">
                {t('signIn.biometricWelcome', { user: biometricUser.name || biometricUser.email })}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-3">
              {t('signIn.biometricActiveHint')}
            </p>
            <button
              type="button"
              onClick={handleBiometricUnlock}
              disabled={biometricLoading}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white py-3 px-4 text-xs font-bold transition shadow-lg shadow-emerald-600/25 min-h-[46px]"
            >
              <Fingerprint className="h-5 w-5" />
              <span>
                {biometricLoading ? t('signIn.biometricVerifying') : t('signIn.biometricUnlockButton')}
              </span>
            </button>
          </div>
        )}

        {/* 1. Acceso principal con Google */}
        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={loading}
          className="w-full flex items-center justify-center gap-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 py-2.5 px-4 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-750 transition shadow-xs active:scale-95 min-h-[44px]"
        >
          <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
            />
          </svg>
          <span>{t('signIn.continueWithGoogle')}</span>
        </button>

        <div className="relative my-5 text-center">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-slate-200 dark:border-slate-800" />
          </div>
          <span className="relative bg-white dark:bg-slate-900 px-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            {t('signIn.dividerOrEmail')}
          </span>
        </div>

        {/* 2. Botón para desplegar usuario y contraseña (desaparece al abrir el panel) */}
        {!showPasswordPanel && (
          <button
            type="button"
            onClick={() => {
              setShowPasswordPanel(true);
              setIsResetMode(false);
              setErrorMessage(null);
            }}
            aria-expanded={false}
            aria-controls="password-auth-panel"
            className="w-full flex items-center justify-center gap-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-750 py-2.5 px-4 text-xs font-bold transition shadow-xs active:scale-[0.99] min-h-[44px]"
          >
            <KeyRound className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span>{t('signIn.signInWithCredentials')}</span>
            <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
          </button>
        )}

        {/* Panel desplegable de usuario y contraseña */}
        {showPasswordPanel && (
          <div
            id="password-auth-panel"
            className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 p-4"
          >
            {isResetMode ? (
              <form onSubmit={handlePasswordResetRequest} className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <KeyRound className="h-4 w-4 text-emerald-600" />
                    <span>{t('signIn.resetTitle')}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setIsResetMode(false);
                      setErrorMessage(null);
                    }}
                    className="text-xs font-semibold text-slate-500 hover:underline"
                  >
                    {t('signIn.back')}
                  </button>
                </div>

                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {t('signIn.resetDescription')}
                </p>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    {t('signIn.usernameOrEmailLabel')}
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                    <input
                      type="email"
                      required
                      autoComplete="username"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder={t('signIn.emailPlaceholder')}
                      className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 pl-9 pr-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-emerald-500 min-h-[40px]"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 px-4 text-xs font-bold transition shadow-md shadow-emerald-600/20 min-h-[44px]"
                >
                  {loading ? t('signIn.sendingResetLink') : t('signIn.sendResetLink')}
                </button>
              </form>
            ) : (
              <form onSubmit={handlePasswordSignIn} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    {t('signIn.usernameOrEmailLabel')}
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                    <input
                      type="email"
                      required
                      autoComplete="username"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder={t('signIn.emailPlaceholder')}
                      className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 pl-9 pr-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-emerald-500 min-h-[40px]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    {t('signIn.passwordLabel')}
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={t('signIn.passwordPlaceholder')}
                      className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 pl-9 pr-10 py-2 text-xs text-slate-900 dark:text-white focus:outline-emerald-500 min-h-[40px]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <div className="flex mt-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setIsResetMode(true);
                        setErrorMessage(null);
                        setResetMessage(null);
                      }}
                      className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 hover:underline ml-auto"
                    >
                      {t('signIn.forgotPassword')}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white py-2.5 px-4 text-xs font-bold transition shadow-md shadow-emerald-600/20 min-h-[44px]"
                >
                  {loading ? t('signIn.verifyingAccess') : t('signIn.signInButton')}
                </button>
              </form>
            )}
          </div>
        )}

        {/* Opción de habilitar desbloqueo biométrico fuera del desplegable */}
        {isBiometricsSupported && (
          <div className="mt-4 flex justify-center">
            <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-slate-600 dark:text-slate-400">
              <input
                type="checkbox"
                checked={rememberBiometrics}
                onChange={(e) => setRememberBiometrics(e.target.checked)}
                className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 h-4 w-4"
              />
              <span className="flex items-center gap-1">
                <Fingerprint className="h-3.5 w-3.5 text-emerald-600" />
                {t('signIn.enableBiometrics')}
              </span>
            </label>
          </div>
        )}

        {/* Enlaces legales */}
        <footer className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-center gap-4 text-[11px] text-slate-500 dark:text-slate-400">
          <a
            href="/privacidad"
            onClick={(e) => {
              if (onNavigate) {
                e.preventDefault();
                onNavigate('/privacidad');
              }
            }}
            className="hover:text-slate-900 dark:hover:text-white underline underline-offset-4 transition-colors"
          >
            {t('signIn.privacyPolicy')}
          </a>
          <span aria-hidden="true">·</span>
          <a
            href="/condiciones"
            onClick={(e) => {
              if (onNavigate) {
                e.preventDefault();
                onNavigate('/condiciones');
              }
            }}
            className="hover:text-slate-900 dark:hover:text-white underline underline-offset-4 transition-colors"
          >
            {t('signIn.termsOfService')}
          </a>
        </footer>
      </div>
    </div>
  );
};
