import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { createTranslator } from '../lib/i18n';
import heroImage from '../assets/images/hero_actriskell_center_1794560767905.jpg';
import { ArrowRight, CalendarCheck2, Users, WalletCards, ShieldCheck, Building2 } from 'lucide-react';

interface LandingPageProps {
  onNavigate: (path: string) => void;
  onSignIn: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onNavigate, onSignIn }) => {
  const { language } = useApp();
  const t = createTranslator(language);
  const [imgError, setImgError] = useState(false);

  const handleLinkClick = (e: React.MouseEvent<HTMLAnchorElement>, path: string) => {
    e.preventDefault();
    onNavigate(path);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col">
      {/* Top Bar (3-zone contract) */}
      <header className="sticky top-0 z-30 border-b border-slate-200/80 dark:border-slate-800 bg-white/95 dark:bg-slate-950/95 backdrop-blur-md">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Single-line Brand wordmark */}
          <a
            href="/"
            onClick={(e) => handleLinkClick(e, '/')}
            className="flex items-center gap-2.5 text-base font-extrabold tracking-tight text-slate-900 dark:text-white whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-emerald-600 rounded-md"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-950 overflow-hidden p-1 shrink-0">
              <img
                src="/logo.png"
                alt={t('landing.brandName')}
                referrerPolicy="no-referrer"
                className="h-full w-full object-contain"
              />
            </span>
            <span>{t('landing.brandName')}</span>
          </a>

          {/* Zone 2: Concise single-line navigation links */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-300">
            <a
              href="#funcionalidades"
              className="hover:text-slate-900 dark:hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              {t('landing.nav.features')}
            </a>
            <a
              href="#portales"
              className="hover:text-slate-900 dark:hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              {t('landing.nav.portals')}
            </a>
            <a
              href="/privacidad"
              onClick={(e) => handleLinkClick(e, '/privacidad')}
              className="hover:text-slate-900 dark:hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              {t('landing.nav.privacy')}
            </a>
            <a
              href="/condiciones"
              onClick={(e) => handleLinkClick(e, '/condiciones')}
              className="hover:text-slate-900 dark:hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              {t('landing.nav.terms')}
            </a>
          </nav>

          {/* Zone 3: Single primary CTA */}
          <div className="shrink-0">
            <button
              type="button"
              onClick={onSignIn}
              className="inline-flex items-center justify-center rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white px-4 py-2 text-sm font-semibold transition-all shadow-sm shadow-emerald-600/20 whitespace-nowrap shrink-0 min-h-[40px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
            >
              {t('landing.nav.signIn')}
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero Section */}
        <section className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 pt-12 pb-16 sm:pt-16 sm:pb-24">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-stretch">
            {/* Left Copy */}
            <div className="lg:col-span-6 flex flex-col justify-center">
              <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 tracking-wide mb-3">
                {t('landing.hero.eyebrow')}
              </p>

              <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-slate-900 dark:text-white leading-[1.1] text-balance">
                {t('landing.hero.title')}
              </h1>

              <p className="mt-5 text-base sm:text-lg text-slate-600 dark:text-slate-300 leading-relaxed max-w-xl">
                {t('landing.hero.description')}
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-5">
                <button
                  type="button"
                  onClick={onSignIn}
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white px-6 py-3 text-sm font-bold transition-all shadow-md shadow-emerald-600/20 min-h-[44px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
                >
                  <span>{t('landing.hero.primaryCta')}</span>
                  <ArrowRight className="h-4 w-4" />
                </button>

                <a
                  href="#funcionalidades"
                  className="text-sm font-semibold text-slate-700 dark:text-slate-300 hover:text-emerald-700 dark:hover:text-emerald-400 hover:underline underline-offset-4 transition-colors py-2"
                >
                  {t('landing.hero.secondaryCta')}
                </a>
              </div>

              <div className="mt-8 pt-6 border-t border-slate-200/80 dark:border-slate-800 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-500 dark:text-slate-400">
                <span>{t('landing.hero.trust1')}</span>
                <span aria-hidden="true">·</span>
                <span>{t('landing.hero.trust2')}</span>
                <span aria-hidden="true">·</span>
                <span>{t('landing.hero.trust3')}</span>
              </div>
            </div>

            {/* Right Visual Anchor */}
            <div className="lg:col-span-6">
              <div className="h-full min-h-[260px] sm:min-h-[340px] rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900">
                {!imgError ? (
                  <img
                    src={heroImage}
                    alt={t('landing.hero.imageAlt')}
                    referrerPolicy="no-referrer"
                    onError={() => setImgError(true)}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="h-full w-full flex flex-col items-center justify-center p-8 text-center bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-900 dark:to-slate-800">
                    <Building2 className="h-10 w-10 text-emerald-600 dark:text-emerald-400 mb-3" />
                    <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
                      {t('landing.hero.imageFallback')}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Section 1: Capabilities (Asymmetric Bento Grid) */}
        <section
          id="funcionalidades"
          className="border-t border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-900/50 py-16 sm:py-20"
        >
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="max-w-2xl mb-10">
              <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white text-balance">
                {t('landing.features.title')}
              </h2>
              <p className="mt-3 text-base text-slate-600 dark:text-slate-300 leading-relaxed">
                {t('landing.features.subtitle')}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {/* Featured Wide Card */}
              <div className="md:col-span-2 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900 p-6 sm:p-8 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between gap-4 mb-4">
                    <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums">
                      {t('landing.features.card1.eyebrow')}
                    </span>
                    <CalendarCheck2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                    {t('landing.features.card1.title')}
                  </h3>
                  <p className="mt-3 text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed max-w-2xl">
                    {t('landing.features.card1.description')}
                  </p>
                </div>
                <div className="mt-6 pt-5 border-t border-slate-200/80 dark:border-slate-800 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                  <span>{t('landing.features.card1.tag1')}</span>
                  <span aria-hidden="true">·</span>
                  <span>{t('landing.features.card1.tag2')}</span>
                  <span aria-hidden="true">·</span>
                  <span>{t('landing.features.card1.tag3')}</span>
                </div>
              </div>

              {/* Narrow Card */}
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900 p-6 sm:p-8 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between gap-4 mb-4">
                    <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums">
                      {t('landing.features.card2.eyebrow')}
                    </span>
                    <Users className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                    {t('landing.features.card2.title')}
                  </h3>
                  <p className="mt-3 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                    {t('landing.features.card2.description')}
                  </p>
                </div>
              </div>

              {/* Narrow Card */}
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900 p-6 sm:p-8 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between gap-4 mb-4">
                    <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums">
                      {t('landing.features.card3.eyebrow')}
                    </span>
                    <WalletCards className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                    {t('landing.features.card3.title')}
                  </h3>
                  <p className="mt-3 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                    {t('landing.features.card3.description')}
                  </p>
                </div>
              </div>

              {/* Wide Card */}
              <div className="md:col-span-2 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900 p-6 sm:p-8 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between gap-4 mb-4">
                    <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums">
                      {t('landing.features.card4.eyebrow')}
                    </span>
                    <ShieldCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                    {t('landing.features.card4.title')}
                  </h3>
                  <p className="mt-3 text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed max-w-2xl">
                    {t('landing.features.card4.description')}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Section 2: Role Portals */}
        <section id="portales" className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-16 sm:py-20">
          <div className="max-w-2xl mb-10">
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white text-balance">
              {t('landing.portals.title')}
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900">
            <div className="p-6 sm:p-8">
              <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 mb-2">
                {t('landing.portals.admin.eyebrow')}
              </p>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                {t('landing.portals.admin.title')}
              </h3>
              <p className="mt-2.5 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                {t('landing.portals.admin.description')}
              </p>
            </div>

            <div className="p-6 sm:p-8">
              <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 mb-2">
                {t('landing.portals.teacher.eyebrow')}
              </p>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                {t('landing.portals.teacher.title')}
              </h3>
              <p className="mt-2.5 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                {t('landing.portals.teacher.description')}
              </p>
            </div>

            <div className="p-6 sm:p-8">
              <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 mb-2">
                {t('landing.portals.student.eyebrow')}
              </p>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                {t('landing.portals.student.title')}
              </h3>
              <p className="mt-2.5 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                {t('landing.portals.student.description')}
              </p>
            </div>
          </div>
        </section>

        {/* Section 3: Data Transparency & CTA */}
        <section className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 pb-20">
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 sm:p-10 flex flex-col lg:flex-row lg:items-center justify-between gap-8">
            <div className="max-w-2xl">
              <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
                {t('landing.transparency.title')}
              </h2>
              <p className="mt-3 text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed">
                {t('landing.transparency.description')}
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-4 text-xs font-semibold">
                <a
                  href="/privacidad"
                  onClick={(e) => handleLinkClick(e, '/privacidad')}
                  className="text-emerald-700 dark:text-emerald-400 hover:underline underline-offset-4"
                >
                  {t('landing.transparency.readPrivacy')}
                </a>
                <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">/</span>
                <a
                  href="/condiciones"
                  onClick={(e) => handleLinkClick(e, '/condiciones')}
                  className="text-emerald-700 dark:text-emerald-400 hover:underline underline-offset-4"
                >
                  {t('landing.transparency.readTerms')}
                </a>
              </div>
            </div>

            <div className="shrink-0">
              <button
                type="button"
                onClick={onSignIn}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white px-6 py-3 text-sm font-bold transition-all shadow-md shadow-emerald-600/20 min-h-[44px] whitespace-nowrap"
              >
                <span>{t('landing.transparency.cta')}</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </section>
      </main>

      {/* Quiet Footer with mandatory OAuth verification links */}
      <footer className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 py-8">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500 dark:text-slate-400">
          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
            <span className="font-bold text-slate-800 dark:text-slate-200">{t('landing.brandName')}</span>
            <span aria-hidden="true">·</span>
            <span>{t('landing.footer.org')}</span>
            <span aria-hidden="true">·</span>
            <span>actriskell@actriskell.org</span>
          </div>

          <div className="flex items-center gap-5 font-medium">
            <a
              href="/privacidad"
              onClick={(e) => handleLinkClick(e, '/privacidad')}
              className="hover:text-slate-900 dark:hover:text-white underline underline-offset-4 transition-colors"
            >
              {t('landing.footer.privacy')}
            </a>
            <a
              href="/condiciones"
              onClick={(e) => handleLinkClick(e, '/condiciones')}
              className="hover:text-slate-900 dark:hover:text-white underline underline-offset-4 transition-colors"
            >
              {t('landing.footer.terms')}
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
};
