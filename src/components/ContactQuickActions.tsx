import React from 'react';
import { Phone, Mail, MessageCircle } from 'lucide-react';

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
  const trimmedPhone = (phone || '').trim();
  const trimmedEmail = (email || '').trim();
  const cleanPhone = trimmedPhone.replace(/[^0-9]/g, '');

  const boxClass = size === 'md' ? 'h-9 w-9 rounded-xl' : 'h-8 w-8 rounded-lg';
  const iconClass = size === 'md' ? 'h-4 w-4' : 'h-3.5 w-3.5';

  return (
    <div className={`inline-flex items-center gap-1 shrink-0 ${className}`.trim()}>
      {trimmedPhone ? (
        <a
          href={`tel:${trimmedPhone}`}
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

      {cleanPhone ? (
        <a
          href={`https://wa.me/${cleanPhone}`}
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

  return (
    <div
      className={`flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] text-slate-500 dark:text-slate-400 ${className}`.trim()}
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

