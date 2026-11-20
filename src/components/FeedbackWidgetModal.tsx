import React, { useState } from 'react';
import {
  MessageSquarePlus,
  X,
  Send,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Loader2
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { supabase } from '../lib/supabase';
import { createTranslator, TranslationKey } from '../lib/i18n';
import { isFeedbackEnabledForRole } from '../lib/feedbackConfig';
import { FeedbackReport } from '../types';

interface FeedbackWidgetModalProps {
  currentTab: string;
}

export const FeedbackWidgetModal: React.FC<FeedbackWidgetModalProps> = ({ currentTab }) => {
  const { appConfigs, currentRole, currentUser, language } = useApp();
  const t = createTranslator(language);

  const [isOpen, setIsOpen] = useState(false);
  const [rawText, setRawText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submittedReport, setSubmittedReport] = useState<FeedbackReport | null>(null);

  // Check Master Toggle + Role Sub-Toggle + User Access
  const isEnabled = isFeedbackEnabledForRole(appConfigs, currentRole || currentUser?.role);
  if (!currentUser || !currentUser.access || !isEnabled) {
    return null;
  }

  const handleOpen = () => {
    setErrorMsg(null);
    setSubmittedReport(null);
    setIsOpen(true);
  };

  const handleClose = () => {
    if (isSubmitting) return;
    setIsOpen(false);
    setErrorMsg(null);
  };

  const handleResetForAnother = () => {
    setRawText('');
    setSubmittedReport(null);
    setErrorMsg(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = rawText.trim();
    if (trimmed.length < 4) {
      setErrorMsg(t('feedbackWidget.minLengthError'));
      return;
    }

    setErrorMsg(null);
    setIsSubmitting(true);

    try {
      let { data: sessionData } = await supabase.auth.getSession();
      let accessToken = sessionData.session?.access_token;

      if (!accessToken) {
        const refreshed = await supabase.auth.refreshSession().catch(() => ({ data: { session: null } }));
        accessToken = refreshed?.data?.session?.access_token;
      }

      if (!accessToken) {
        setErrorMsg(t('feedbackWidget.sessionRequired'));
        setIsSubmitting(false);
        return;
      }

      const feedbackEndpoint =
        (import.meta.env.VITE_FEEDBACK_API_URL || '').trim() || '/api/feedback';

      const response = await fetch(feedbackEndpoint, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          rawText: trimmed,
          currentTab,
          language,
          userRole: currentRole || currentUser.role,
          userName: currentUser.name,
          userEmail: currentUser.email
        })
      });

      const contentType = (response.headers.get('content-type') || '').toLowerCase();
      const payload = contentType.includes('application/json')
        ? await response.json().catch(() => ({}))
        : {};

      if (!response.ok) {
        if (response.status === 405) {
          setErrorMsg(payload?.error || t('feedbackWidget.methodNotAllowedError'));
        } else {
          setErrorMsg(payload?.error || `Error (${response.status})`);
        }
        setIsSubmitting(false);
        return;
      }

      setSubmittedReport(payload.report as FeedbackReport);
      setRawText('');
    } catch (err: any) {
      setErrorMsg(err?.message || 'Error de red al enviar feedback.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const typeLabel = submittedReport
    ? t(`adminFeedback.types.${submittedReport.type}` as TranslationKey)
    : '';
  const priorityLabel = submittedReport
    ? t(`adminFeedback.priorities.${submittedReport.priority}` as TranslationKey)
    : '';

  return (
    <>
      {/* Botón flotante accesible */}
      <button
        type="button"
        onClick={handleOpen}
        aria-label={t('feedbackWidget.floatingAria')}
        title={t('feedbackWidget.floatingAria')}
        className="fixed bottom-20 right-4 md:bottom-6 md:right-6 z-40 no-print inline-flex items-center gap-2 rounded-2xl bg-slate-900 dark:bg-emerald-600 hover:bg-slate-800 dark:hover:bg-emerald-500 text-white px-3.5 py-2.5 text-xs font-bold shadow-lg shadow-slate-900/20 dark:shadow-emerald-900/30 border border-white/10 transition active:scale-95"
      >
        <MessageSquarePlus className="h-4 w-4 text-emerald-400 dark:text-white shrink-0" />
        <span>{t('feedbackWidget.floatingButton')}</span>
      </button>

      {/* Modal de reporte */}
      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/65 p-0 sm:p-4 backdrop-blur-xs no-print"
          role="dialog"
          aria-modal="true"
          aria-labelledby="feedback-modal-title"
        >
          <div className="w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden animate-in fade-in">
            {/* Header */}
            <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-4 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div>
                  <h3
                    id="feedback-modal-title"
                    className="text-base font-black text-slate-900 dark:text-white leading-snug"
                  >
                    {t('feedbackWidget.title')}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {t('feedbackWidget.subtitle')}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleClose}
                disabled={isSubmitting}
                aria-label={t('feedbackWidget.closeAria')}
                className="rounded-xl p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition disabled:opacity-50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {submittedReport ? (
              /* Pantalla de agradecimiento amigable */
              <div className="p-6 text-center space-y-4">
                <div className="mx-auto h-14 w-14 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                  <CheckCircle2 className="h-8 w-8" />
                </div>

                <div>
                  <h4 className="text-lg font-black text-slate-900 dark:text-white">
                    {t('feedbackWidget.thankYouTitle')}
                  </h4>
                  <p className="text-xs text-slate-600 dark:text-slate-300 mt-1.5 leading-relaxed max-w-sm mx-auto">
                    {t('feedbackWidget.thankYouMessage')}
                  </p>
                </div>

                <div className="rounded-2xl border border-emerald-200/80 dark:border-emerald-900/60 bg-emerald-50/70 dark:bg-emerald-950/30 p-3.5 text-left space-y-1.5">
                  <div className="text-[11px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                    {t('feedbackWidget.thankYouClassifiedLabel')}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="rounded-lg bg-white dark:bg-slate-900 px-2.5 py-1 font-bold text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700">
                      {typeLabel}
                    </span>
                    <span className="rounded-lg bg-white dark:bg-slate-900 px-2.5 py-1 font-bold text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700">
                      {priorityLabel}
                    </span>
                  </div>
                </div>

                <div className="flex flex-col-reverse sm:flex-row items-center justify-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={handleResetForAnother}
                    className="w-full sm:w-auto rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-2.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
                  >
                    {t('feedbackWidget.sendAnother')}
                  </button>
                  <button
                    type="button"
                    onClick={handleClose}
                    className="w-full sm:w-auto rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 text-xs font-bold transition shadow-xs"
                  >
                    {t('feedbackWidget.done')}
                  </button>
                </div>
              </div>
            ) : (
              /* Formulario informal */
              <form onSubmit={handleSubmit} className="p-5 space-y-4">
                <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/60 px-3 py-2 rounded-xl border border-slate-200/70 dark:border-slate-800">
                  <span>
                    {t('feedbackWidget.currentSectionLabel')}{' '}
                    <strong className="font-mono text-slate-700 dark:text-slate-200">{currentTab}</strong>
                  </span>
                  <span className="truncate max-w-[180px] font-semibold text-slate-600 dark:text-slate-300">
                    {currentUser.name}
                  </span>
                </div>

                <div>
                  <label
                    htmlFor="feedback-raw-text"
                    className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5"
                  >
                    {t('feedbackWidget.messageLabel')}
                  </label>
                  <textarea
                    id="feedback-raw-text"
                    rows={4}
                    maxLength={3000}
                    required
                    autoFocus
                    disabled={isSubmitting}
                    value={rawText}
                    onChange={e => setRawText(e.target.value)}
                    placeholder={t('feedbackWidget.messagePlaceholder')}
                    className="w-full rounded-2xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-3 text-xs sm:text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-emerald-500 resize-y min-h-[110px]"
                  />
                  <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-400">
                    <span>{t('feedbackWidget.privacyNote')}</span>
                    <span className="shrink-0 ml-2 font-mono">
                      {t('feedbackWidget.charCount', { count: rawText.length })}
                    </span>
                  </div>
                </div>

                {errorMsg && (
                  <div className="flex items-start gap-2 rounded-xl border border-rose-200 dark:border-rose-900/70 bg-rose-50 dark:bg-rose-950/40 p-3 text-xs text-rose-700 dark:text-rose-200">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>{errorMsg}</span>
                  </div>
                )}

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={handleClose}
                    disabled={isSubmitting}
                    className="rounded-xl px-4 py-2.5 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition disabled:opacity-50"
                  >
                    {t('feedbackWidget.cancel')}
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting || rawText.trim().length < 4}
                    className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2.5 text-xs font-bold transition shadow-md shadow-emerald-600/20"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>{t('feedbackWidget.submitting')}</span>
                      </>
                    ) : (
                      <>
                        <Send className="h-3.5 w-3.5" />
                        <span>{t('feedbackWidget.submit')}</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
};
