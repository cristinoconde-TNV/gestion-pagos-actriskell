import React from 'react';
import { useAuth } from '../context/AuthContext';
import { createTranslator } from '../lib/i18n';
import { ArrowLeft, ShieldCheck, FileText } from 'lucide-react';

interface LegalPageProps {
  onNavigate: (path: string) => void;
  onSignIn: () => void;
}

const LegalLayout: React.FC<{
  title: string;
  subtitle: string;
  updatedAt: string;
  icon: React.ReactNode;
  onNavigate: (path: string) => void;
  onSignIn: () => void;
  children: React.ReactNode;
}> = ({ title, subtitle, updatedAt, icon, onNavigate, onSignIn, children }) => {
  const { language } = useAuth();
  const t = createTranslator(language);

  const handleLinkClick = (e: React.MouseEvent<HTMLAnchorElement>, path: string) => {
    e.preventDefault();
    onNavigate(path);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col">
      {/* Top Bar (3-zone contract) */}
      <header className="sticky top-0 z-30 border-b border-slate-200/80 dark:border-slate-800 bg-white/95 dark:bg-slate-950/95 backdrop-blur-md">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-8">
          <a
            href="/"
            onClick={(e) => handleLinkClick(e, '/')}
            className="flex items-center gap-2.5 text-base font-extrabold tracking-tight text-slate-900 dark:text-white whitespace-nowrap shrink-0"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-950 overflow-hidden p-1 shrink-0">
              <img
                src="/logo.png"
                alt={t('legal.brandName')}
                referrerPolicy="no-referrer"
                className="h-full w-full object-contain"
              />
            </span>
            <span>{t('legal.brandName')}</span>
          </a>

          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-300">
            <a
              href="/"
              onClick={(e) => handleLinkClick(e, '/')}
              className="hover:text-slate-900 dark:hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              {t('legal.navHome')}
            </a>
            <a
              href="/privacidad"
              onClick={(e) => handleLinkClick(e, '/privacidad')}
              className="hover:text-slate-900 dark:hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              {t('legal.navPrivacy')}
            </a>
            <a
              href="/condiciones"
              onClick={(e) => handleLinkClick(e, '/condiciones')}
              className="hover:text-slate-900 dark:hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              {t('legal.navTerms')}
            </a>
          </nav>

          <div className="shrink-0">
            <button
              type="button"
              onClick={onSignIn}
              className="inline-flex items-center justify-center rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white px-4 py-2 text-sm font-semibold transition-all whitespace-nowrap shrink-0 min-h-[40px]"
            >
              {t('legal.signIn')}
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 mx-auto max-w-4xl w-full px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
        <div className="mb-6">
          <a
            href="/"
            onClick={(e) => handleLinkClick(e, '/')}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:underline underline-offset-4"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>{t('legal.backHome')}</span>
          </a>
        </div>

        <article className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 sm:p-10">
          <div className="border-b border-slate-200 dark:border-slate-800 pb-6 mb-8">
            <div className="flex items-center gap-2.5 text-emerald-700 dark:text-emerald-400 mb-3">
              {icon}
              <span className="text-xs font-semibold">{t('legal.docTag')}</span>
            </div>
            <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white">
              {title}
            </h1>
            <p className="mt-2 text-sm sm:text-base text-slate-600 dark:text-slate-300">
              {subtitle}
            </p>
            <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
              {t('legal.lastUpdated', { date: updatedAt })}
            </p>
          </div>

          <div className="space-y-7 text-sm sm:text-base text-slate-700 dark:text-slate-300 leading-relaxed">
            {children}
          </div>
        </article>
      </main>

      <footer className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 py-8">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500 dark:text-slate-400">
          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
            <span className="font-bold text-slate-800 dark:text-slate-200">{t('legal.brandName')}</span>
            <span aria-hidden="true">·</span>
            <span>{t('legal.orgName')}</span>
            <span aria-hidden="true">·</span>
            <span>actriskell@actriskell.org</span>
          </div>

          <div className="flex items-center gap-5 font-medium">
            <a
              href="/"
              onClick={(e) => handleLinkClick(e, '/')}
              className="hover:text-slate-900 dark:hover:text-white underline underline-offset-4 transition-colors"
            >
              {t('legal.navHome')}
            </a>
            <a
              href="/privacidad"
              onClick={(e) => handleLinkClick(e, '/privacidad')}
              className="hover:text-slate-900 dark:hover:text-white underline underline-offset-4 transition-colors"
            >
              {t('legal.navPrivacy')}
            </a>
            <a
              href="/condiciones"
              onClick={(e) => handleLinkClick(e, '/condiciones')}
              className="hover:text-slate-900 dark:hover:text-white underline underline-offset-4 transition-colors"
            >
              {t('legal.navTerms')}
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
};

export const PrivacyPolicyPage: React.FC<LegalPageProps> = ({ onNavigate, onSignIn }) => {
  const { language } = useAuth();
  const t = createTranslator(language);

  return (
    <LegalLayout
      title={t('legal.privacy.title')}
      subtitle={t('legal.privacy.subtitle')}
      updatedAt={t('legal.updatedDate')}
      icon={<ShieldCheck className="h-5 w-5" />}
      onNavigate={onNavigate}
      onSignIn={onSignIn}
    >
      <section className="space-y-2.5">
        <h2 className="text-lg font-bold text-slate-900 dark:text-white">
          {t('legal.privacy.s1Title')}
        </h2>
        <p>
          {t('legal.privacy.s1Intro')}{' '}
          <a href="mailto:actriskell@actriskell.org" className="text-emerald-700 dark:text-emerald-400 underline underline-offset-2 font-medium">
            actriskell@actriskell.org
          </a>.
        </p>
      </section>

      <section className="space-y-2.5">
        <h2 className="text-lg font-bold text-slate-900 dark:text-white">
          {t('legal.privacy.s2Title')}
        </h2>
        <p>
          {t('legal.privacy.s2Intro')}
        </p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li><strong>{t('legal.privacy.s2Item1Label')}</strong> {t('legal.privacy.s2Item1Text')}</li>
          <li><strong>{t('legal.privacy.s2Item2Label')}</strong> {t('legal.privacy.s2Item2Text')}</li>
          <li><strong>{t('legal.privacy.s2Item3Label')}</strong> {t('legal.privacy.s2Item3Text')}</li>
        </ul>
        <p>
          {t('legal.privacy.s2Outro')}
        </p>
      </section>

      <section className="space-y-2.5">
        <h2 className="text-lg font-bold text-slate-900 dark:text-white">
          {t('legal.privacy.s3Title')}
        </h2>
        <p>
          {t('legal.privacy.s3Intro')}
        </p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li><strong>{t('legal.privacy.s3Item1Label')}</strong> {t('legal.privacy.s3Item1Text')}</li>
          <li><strong>{t('legal.privacy.s3Item2Label')}</strong> {t('legal.privacy.s3Item2Text')}</li>
          <li><strong>{t('legal.privacy.s3Item3Label')}</strong> {t('legal.privacy.s3Item3Text')}</li>
        </ul>
      </section>

      <section className="space-y-2.5">
        <h2 className="text-lg font-bold text-slate-900 dark:text-white">
          {t('legal.privacy.s4Title')}
        </h2>
        <p>
          {t('legal.privacy.s4P1')}
        </p>
        <p>
          {t('legal.privacy.s4P2')}
        </p>
      </section>

      <section className="space-y-2.5">
        <h2 className="text-lg font-bold text-slate-900 dark:text-white">
          {t('legal.privacy.s5Title')}
        </h2>
        <p>
          {t('legal.privacy.s5P1')}
        </p>
      </section>

      <section className="space-y-2.5">
        <h2 className="text-lg font-bold text-slate-900 dark:text-white">
          {t('legal.privacy.s6Title')}
        </h2>
        <p>
          {t('legal.privacy.s6Intro')}{' '}
          <a href="mailto:actriskell@actriskell.org" className="text-emerald-700 dark:text-emerald-400 underline underline-offset-2 font-medium">
            actriskell@actriskell.org
          </a>.
        </p>
      </section>
    </LegalLayout>
  );
};

export const TermsOfServicePage: React.FC<LegalPageProps> = ({ onNavigate, onSignIn }) => {
  const { language } = useAuth();
  const t = createTranslator(language);

  return (
    <LegalLayout
      title={t('legal.terms.title')}
      subtitle={t('legal.terms.subtitle')}
      updatedAt={t('legal.updatedDate')}
      icon={<FileText className="h-5 w-5" />}
      onNavigate={onNavigate}
      onSignIn={onSignIn}
    >
      <section className="space-y-2.5">
        <h2 className="text-lg font-bold text-slate-900 dark:text-white">
          {t('legal.terms.s1Title')}
        </h2>
        <p>
          {t('legal.terms.s1P1')}
        </p>
      </section>

      <section className="space-y-2.5">
        <h2 className="text-lg font-bold text-slate-900 dark:text-white">
          {t('legal.terms.s2Title')}
        </h2>
        <p>
          {t('legal.terms.s2P1')}
        </p>
        <p>
          {t('legal.terms.s2P2')}
        </p>
      </section>

      <section className="space-y-2.5">
        <h2 className="text-lg font-bold text-slate-900 dark:text-white">
          {t('legal.terms.s3Title')}
        </h2>
        <p>{t('legal.terms.s3Intro')}</p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>{t('legal.terms.s3Item1')}</li>
          <li>{t('legal.terms.s3Item2')}</li>
          <li>{t('legal.terms.s3Item3')}</li>
        </ul>
      </section>

      <section className="space-y-2.5">
        <h2 className="text-lg font-bold text-slate-900 dark:text-white">
          {t('legal.terms.s4Title')}
        </h2>
        <p>
          {t('legal.terms.s4P1')}
        </p>
      </section>

      <section className="space-y-2.5">
        <h2 className="text-lg font-bold text-slate-900 dark:text-white">
          {t('legal.terms.s5Title')}
        </h2>
        <p>
          {t('legal.terms.s5Prefix')}{' '}
          <a
            href="/privacidad"
            onClick={(e) => {
              e.preventDefault();
              onNavigate('/privacidad');
            }}
            className="text-emerald-700 dark:text-emerald-400 underline underline-offset-2 font-medium"
          >
            {t('legal.terms.s5Link')}
          </a>.
        </p>
      </section>

      <section className="space-y-2.5">
        <h2 className="text-lg font-bold text-slate-900 dark:text-white">
          {t('legal.terms.s6Title')}
        </h2>
        <p>
          {t('legal.terms.s6Prefix')}{' '}
          <a href="mailto:actriskell@actriskell.org" className="text-emerald-700 dark:text-emerald-400 underline underline-offset-2 font-medium">
            actriskell@actriskell.org
          </a>.
        </p>
      </section>
    </LegalLayout>
  );
};
