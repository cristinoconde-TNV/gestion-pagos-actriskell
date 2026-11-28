import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Phone, Mail, MessageCircle, Send, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { createTranslator } from '../lib/i18n';
import { buildTelHref, buildWhatsappHref } from '../lib/phone';
import { UserRole } from '../types';

interface StudentNameButtonProps {
  name: string;
  phone?: string;
  email?: string;
  subtitle?: string;
  className?: string;
  canViewContact?: boolean;
}

export const StudentNameButton: React.FC<StudentNameButtonProps> = ({
  name,
  phone,
  email,
  subtitle,
  className = '',
  canViewContact
}) => {
  const { currentRole, language } = useAuth();
  const t = createTranslator(language);
  const [open, setOpen] = useState(false);

  const isAuthorized =
    canViewContact ??
    (currentRole === UserRole.Admin ||
      currentRole === UserRole.Monitor ||
      currentRole === UserRole.Hibrido);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  if (!isAuthorized) {
    return <span className={className}>{name}</span>;
  }

  const trimmedPhone = (phone || '').trim();
  const trimmedEmail = (email || '').trim();
  const telHref = buildTelHref(phone);
  const whatsappHref = buildWhatsappHref(phone);
  const hasAny = Boolean(trimmedPhone || trimmedEmail);

  const hasTruncate = /\btruncate\b/.test(className);
  const hasLineThrough = /\bline-through\b/.test(className);
  const cleanedClassName = className.replace(/\btruncate\b/g, '').trim();

  return (
    <>
      <button
        type="button"
        onClick={e => {
          e.stopPropagation();
          setOpen(true);
        }}
        title={t('contactModal.openTooltip', { name })}
        aria-label={t('contactModal.openAria', { name })}
        className={`inline-flex items-center min-w-0 max-w-full text-left hover:text-indigo-600 dark:hover:text-indigo-400 hover:underline decoration-indigo-400/60 underline-offset-2 transition cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60 rounded-sm ${cleanedClassName}`.trim()}
      >
        <span
          className={`${hasTruncate ? 'truncate' : ''} ${hasLineThrough ? 'line-through' : ''}`.trim()}
        >
          {name}
        </span>
      </button>

      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t('contactModal.title')}
            onClick={e => {
              e.stopPropagation();
              setOpen(false);
            }}
            className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/65 backdrop-blur-xs p-4"
          >
            <div
              onClick={e => e.stopPropagation()}
              className="w-full max-w-sm rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-2xl space-y-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-10 w-10 rounded-xl bg-indigo-500/15 border border-indigo-500/25 text-indigo-700 dark:text-indigo-300 flex items-center justify-center font-extrabold text-base shrink-0">
                    {(name || '?').trim().charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                      {t('contactModal.title')}
                    </p>
                    <h3 className="text-base font-bold text-slate-900 dark:text-white leading-snug break-words">
                      {name}
                    </h3>
                    {subtitle && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                        {subtitle}
                      </p>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label={t('contactModal.closeAria')}
                  className="h-8 w-8 rounded-xl flex items-center justify-center text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200 transition shrink-0"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/40 p-3.5 space-y-2.5 text-xs">
                {hasAny ? (
                  <>
                    <div className="flex items-start gap-2.5">
                      <Phone className="h-4 w-4 text-indigo-500 shrink-0 mt-0.5" />
                      <div className="min-w-0 flex-1">
                        <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                          {t('contactModal.phoneLabel')}
                        </span>
                        {telHref ? (
                          <a
                            href={telHref}
                            className="font-semibold text-slate-900 dark:text-white hover:text-indigo-600 dark:hover:text-indigo-400 break-all"
                          >
                            {trimmedPhone}
                          </a>
                        ) : (
                          <span className="italic text-slate-400 dark:text-slate-500">
                            {t('contactModal.unavailable')}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-start gap-2.5 pt-2 border-t border-slate-200/70 dark:border-slate-700/60">
                      <Mail className="h-4 w-4 text-sky-500 shrink-0 mt-0.5" />
                      <div className="min-w-0 flex-1">
                        <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                          {t('contactModal.emailLabel')}
                        </span>
                        {trimmedEmail ? (
                          <a
                            href={`mailto:${trimmedEmail}`}
                            className="font-semibold text-slate-900 dark:text-white hover:text-sky-600 dark:hover:text-sky-400 break-all"
                          >
                            {trimmedEmail}
                          </a>
                        ) : (
                          <span className="italic text-slate-400 dark:text-slate-500">
                            {t('contactModal.unavailable')}
                          </span>
                        )}
                      </div>
                    </div>
                  </>
                ) : (
                  <p className="text-xs italic text-slate-500 dark:text-slate-400 text-center py-1">
                    {t('contactModal.noContactInfo')}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-3 gap-2">
                {telHref ? (
                  <a
                    href={telHref}
                    className="inline-flex flex-col items-center justify-center gap-1 rounded-xl border border-indigo-500/30 bg-indigo-50/80 dark:bg-indigo-950/35 px-2 py-2.5 text-xs font-bold text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-950/60 transition active:scale-95"
                  >
                    <Phone className="h-4 w-4" />
                    <span>{t('contactModal.callButton')}</span>
                  </a>
                ) : (
                  <span className="inline-flex flex-col items-center justify-center gap-1 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100/70 dark:bg-slate-800/40 px-2 py-2.5 text-xs font-semibold text-slate-400 dark:text-slate-600 cursor-not-allowed">
                    <Phone className="h-4 w-4" />
                    <span>{t('contactModal.callButton')}</span>
                  </span>
                )}

                {trimmedEmail ? (
                  <a
                    href={`mailto:${trimmedEmail}`}
                    className="inline-flex flex-col items-center justify-center gap-1 rounded-xl border border-sky-500/30 bg-sky-50/80 dark:bg-sky-950/35 px-2 py-2.5 text-xs font-bold text-sky-700 dark:text-sky-300 hover:bg-sky-100 dark:hover:bg-sky-950/60 transition active:scale-95"
                  >
                    <Mail className="h-4 w-4" />
                    <span>{t('contactModal.emailButton')}</span>
                  </a>
                ) : (
                  <span className="inline-flex flex-col items-center justify-center gap-1 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100/70 dark:bg-slate-800/40 px-2 py-2.5 text-xs font-semibold text-slate-400 dark:text-slate-600 cursor-not-allowed">
                    <Mail className="h-4 w-4" />
                    <span>{t('contactModal.emailButton')}</span>
                  </span>
                )}

                {whatsappHref ? (
                  <a
                    href={whatsappHref}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex flex-col items-center justify-center gap-1 rounded-xl border border-emerald-500/30 bg-emerald-50/80 dark:bg-emerald-950/35 px-2 py-2.5 text-xs font-bold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-950/60 transition active:scale-95"
                  >
                    <MessageCircle className="h-4 w-4" />
                    <span>{t('contactModal.whatsappButton')}</span>
                  </a>
                ) : (
                  <span className="inline-flex flex-col items-center justify-center gap-1 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100/70 dark:bg-slate-800/40 px-2 py-2.5 text-xs font-semibold text-slate-400 dark:text-slate-600 cursor-not-allowed">
                    <MessageCircle className="h-4 w-4" />
                    <span>{t('contactModal.whatsappButton')}</span>
                  </span>
                )}
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
};

interface CompactCommunicationButtonProps {
  phone?: string;
  email?: string;
  studentName: string;
  size?: 'sm' | 'md';
  className?: string;
  callLabel?: string;
  emailLabel?: string;
  whatsappLabel?: string;
}

export const CompactCommunicationButton: React.FC<CompactCommunicationButtonProps> = ({
  phone,
  email,
  studentName,
  size = 'md',
  className = '',
  callLabel,
  emailLabel,
  whatsappLabel
}) => {
  const { language } = useAuth();
  const t = createTranslator(language);
  const [open, setOpen] = useState(false);

  const trimmedEmail = (email || '').trim();
  const telHref = buildTelHref(phone);
  const whatsappHref = buildWhatsappHref(phone);
  const hasAny = Boolean(telHref || trimmedEmail || whatsappHref);

  if (!hasAny) return null;

  const buttonClass = size === 'sm' ? 'h-8 w-8 rounded-lg' : 'h-9 w-9 rounded-xl';
  const iconClass = size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4';
  const triggerText = t('contactModal.contactTrigger', { name: studentName });
  const resolvedCallLabel = callLabel || t('contactModal.callAction', { name: studentName });
  const resolvedEmailLabel = emailLabel || t('contactModal.emailAction', { name: studentName });
  const resolvedWhatsappLabel = whatsappLabel || t('contactModal.whatsappAction', { name: studentName });

  return (
    <div className={`relative shrink-0 ${className}`.trim()}>
      <button
        type="button"
        onClick={() => setOpen(prev => !prev)}
        aria-expanded={open}
        aria-label={triggerText}
        title={triggerText}
        className={`${buttonClass} border border-indigo-500/35 bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 hover:bg-indigo-500/20 transition active:scale-90 touch-manipulation flex items-center justify-center`}
      >
        <Send className={iconClass} />
      </button>

      {open && (
        <div
          onMouseLeave={() => setOpen(false)}
          className="absolute right-0 bottom-full mb-1.5 z-30 flex items-center gap-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-1 shadow-lg"
        >
          {telHref && (
            <a
              href={telHref}
              onClick={() => setOpen(false)}
              title={resolvedCallLabel}
              aria-label={resolvedCallLabel}
              className="h-8 w-8 rounded-lg flex items-center justify-center text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40"
            >
              <Phone className="h-4 w-4" />
            </a>
          )}
          {trimmedEmail && (
            <a
              href={`mailto:${trimmedEmail}`}
              onClick={() => setOpen(false)}
              title={resolvedEmailLabel}
              aria-label={resolvedEmailLabel}
              className="h-8 w-8 rounded-lg flex items-center justify-center text-sky-600 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-950/40"
            >
              <Mail className="h-4 w-4" />
            </a>
          )}
          {whatsappHref && (
            <a
              href={whatsappHref}
              target="_blank"
              rel="noreferrer"
              onClick={() => setOpen(false)}
              title={resolvedWhatsappLabel}
              aria-label={resolvedWhatsappLabel}
              className="h-8 w-8 rounded-lg flex items-center justify-center text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
            >
              <MessageCircle className="h-4 w-4" />
            </a>
          )}
        </div>
      )}
    </div>
  );
};

interface ContactQuickActionsProps {
  phone?: string;
  email?: string;
  callLabel: string;
  emailLabel: string;
  whatsappLabel: string;
  size?: 'sm' | 'md';
  className?: string;
}

export const ContactQuickActions: React.FC<ContactQuickActionsProps> = ({
  phone,
  email,
  callLabel,
  emailLabel,
  whatsappLabel,
  size = 'sm',
  className = ''
}) => {
  const trimmedEmail = (email || '').trim();
  const telHref = buildTelHref(phone);
  const whatsappHref = buildWhatsappHref(phone);

  const boxClass = size === 'md' ? 'h-9 w-9 rounded-xl' : 'h-8 w-8 rounded-lg';
  const iconClass = size === 'md' ? 'h-4 w-4' : 'h-3.5 w-3.5';

  return (
    <div className={`inline-flex items-center gap-1 shrink-0 ${className}`.trim()}>
      {telHref ? (
        <a
          href={telHref}
          title={callLabel}
          aria-label={callLabel}
          className={`inline-flex ${boxClass} items-center justify-center border border-indigo-500/30 bg-indigo-50/70 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-950/60 transition active:scale-95`}
        >
          <Phone className={iconClass} />
        </a>
      ) : (
        <span
          aria-hidden="true"
          title={callLabel}
          className={`inline-flex ${boxClass} items-center justify-center border border-slate-200 dark:border-slate-800 bg-slate-100/60 dark:bg-slate-800/40 text-slate-300 dark:text-slate-600 cursor-not-allowed`}
        >
          <Phone className={iconClass} />
        </span>
      )}

      {trimmedEmail ? (
        <a
          href={`mailto:${trimmedEmail}`}
          title={emailLabel}
          aria-label={emailLabel}
          className={`inline-flex ${boxClass} items-center justify-center border border-sky-500/30 bg-sky-50/70 dark:bg-sky-950/30 text-sky-700 dark:text-sky-300 hover:bg-sky-100 dark:hover:bg-sky-950/60 transition active:scale-95`}
        >
          <Mail className={iconClass} />
        </a>
      ) : (
        <span
          aria-hidden="true"
          title={emailLabel}
          className={`inline-flex ${boxClass} items-center justify-center border border-slate-200 dark:border-slate-800 bg-slate-100/60 dark:bg-slate-800/40 text-slate-300 dark:text-slate-600 cursor-not-allowed`}
        >
          <Mail className={iconClass} />
        </span>
      )}

      {whatsappHref ? (
        <a
          href={whatsappHref}
          target="_blank"
          rel="noreferrer"
          title={whatsappLabel}
          aria-label={whatsappLabel}
          className={`inline-flex ${boxClass} items-center justify-center border border-emerald-500/30 bg-emerald-50/70 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-950/60 transition active:scale-95`}
        >
          <MessageCircle className={iconClass} />
        </a>
      ) : (
        <span
          aria-hidden="true"
          title={whatsappLabel}
          className={`inline-flex ${boxClass} items-center justify-center border border-slate-200 dark:border-slate-800 bg-slate-100/60 dark:bg-slate-800/40 text-slate-300 dark:text-slate-600 cursor-not-allowed`}
        >
          <MessageCircle className={iconClass} />
        </span>
      )}
    </div>
  );
};

interface StudentContactDetailsProps {
  phone?: string;
  email?: string;
  fallbackText?: string;
  className?: string;
}

export const StudentContactDetails: React.FC<StudentContactDetailsProps> = ({
  phone,
  email,
  fallbackText,
  className = ''
}) => {
  const trimmedPhone = (phone || '').trim();
  const trimmedEmail = (email || '').trim();

  if (!trimmedPhone && !trimmedEmail) {
    if (!fallbackText) return null;
    return (
      <span className={`text-[11px] italic text-slate-400 dark:text-slate-500 block ${className}`.trim()}>
        {fallbackText}
      </span>
    );
  }

  const isColumn = /\bflex-col\b/.test(className);

  return (
    <div
      className={`flex flex-wrap ${isColumn ? 'items-start text-left' : 'items-center'} gap-x-2.5 gap-y-0.5 text-[11px] text-slate-500 dark:text-slate-400 ${className}`.trim()}
    >
      {trimmedPhone && (
        <span className="inline-flex items-center gap-1 whitespace-nowrap">
          <Phone className="h-3 w-3 shrink-0 text-indigo-500/80 dark:text-indigo-400/80" />
          <span>{trimmedPhone}</span>
        </span>
      )}
      {trimmedEmail && (
        <span className="inline-flex items-center gap-1 min-w-0 max-w-full">
          <Mail className="h-3 w-3 shrink-0 text-sky-500/80 dark:text-sky-400/80" />
          <span className="break-all">{trimmedEmail}</span>
        </span>
      )}
    </div>
  );
};

