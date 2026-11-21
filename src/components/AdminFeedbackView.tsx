import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Bug,
  CheckCircle2,
  Clock,
  Eye,
  HelpCircle,
  Inbox,
  Lightbulb,
  Loader2,
  MessageSquareText,
  RefreshCw,
  Search,
  ShieldAlert,
  Sparkles,
  Trash2,
  User
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { supabase } from '../lib/supabase';
import { normalizeUserRole, ROLE_I18N_KEY_MAP } from '../lib/authRole';
import { createTranslator, translate, TranslationKey } from '../lib/i18n';
import {
  FeedbackReport,
  FeedbackReportPriority,
  FeedbackReportStatus,
  FeedbackReportType,
  UserRole
} from '../types';

const PRIORITY_RANK: Record<FeedbackReportPriority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3
};

const STATUS_RANK: Record<FeedbackReportStatus, number> = {
  pending: 0,
  in_review: 1,
  resolved: 2,
  deleted: 3
};

export const AdminFeedbackView: React.FC = () => {
  const { currentRole, currentUser, language } = useApp();
  const t = useMemo(() => createTranslator(language), [language]);

  const [reports, setReports] = useState<FeedbackReport[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const fetchSeqRef = useRef(0);

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | FeedbackReportStatus>('all');
  const [priorityFilter, setPriorityFilter] = useState<'all' | FeedbackReportPriority>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | FeedbackReportType>('all');

  const isAdmin = currentRole === UserRole.Admin && currentUser?.role === UserRole.Admin;

  const loadReports = useCallback(async () => {
    const seq = ++fetchSeqRef.current;

    if (!isAdmin) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);
    try {
      const { data, error } = await supabase
        .from('feedback_reports')
        .select('*')
        .order('created_at', { ascending: false });

      if (seq !== fetchSeqRef.current) return;

      if (error) {
        if (error.code === '42P01' || error.message?.includes('feedback_reports')) {
          setErrorMsg(translate(language, 'adminFeedback.tableMissingNotice'));
        } else {
          setErrorMsg(`${error.message} (${error.code || 'RLS'})`);
        }
        setReports([]);
      } else {
        setReports((data || []) as FeedbackReport[]);
      }
    } catch (err: any) {
      if (seq !== fetchSeqRef.current) return;
      setErrorMsg(err?.message || 'Error al cargar reportes.');
    } finally {
      if (seq === fetchSeqRef.current) {
        setIsLoading(false);
      }
    }
  }, [isAdmin, language]);

  useEffect(() => {
    void loadReports();
  }, [loadReports]);

  const handleStatusChange = async (reportId: string, nextStatus: FeedbackReportStatus) => {
    setUpdatingId(reportId);
    setErrorMsg(null);

    const previous = reports;
    setReports(prev =>
      prev.map(r =>
        r.id === reportId
          ? { ...r, status: nextStatus, updated_at: new Date().toISOString() }
          : r
      )
    );

    try {
      const { error } = await supabase
        .from('feedback_reports')
        .update({
          status: nextStatus,
          updated_at: new Date().toISOString()
        })
        .eq('id', reportId);

      if (error) {
        setReports(previous);
        setErrorMsg(`${error.message} (${error.code || 'RLS'})`);
      }
    } catch (err: any) {
      setReports(previous);
      setErrorMsg(err?.message || 'Error al actualizar el estado.');
    } finally {
      setUpdatingId(null);
    }
  };

  const sortedAndFilteredReports = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();

    return reports
      .filter(r => {
        if (statusFilter === 'deleted') {
          if (r.status !== 'deleted') return false;
        } else {
          if (r.status === 'deleted') return false;
          if (statusFilter !== 'all' && r.status !== statusFilter) return false;
        }
        if (priorityFilter !== 'all' && r.priority !== priorityFilter) return false;
        if (typeFilter !== 'all' && r.type !== typeFilter) return false;
        if (!q) return true;
        return (
          r.technical_summary.toLowerCase().includes(q) ||
          r.raw_text.toLowerCase().includes(q) ||
          (r.user_name || '').toLowerCase().includes(q) ||
          (r.user_email || '').toLowerCase().includes(q) ||
          (r.affected_module || '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        const pDiff = (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9);
        if (pDiff !== 0) return pDiff;
        const sDiff = (STATUS_RANK[a.status] ?? 9) - (STATUS_RANK[b.status] ?? 9);
        if (sDiff !== 0) return sDiff;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
  }, [reports, searchTerm, statusFilter, priorityFilter, typeFilter]);

  const stats = useMemo(() => {
    const activeReports = reports.filter(r => r.status !== 'deleted');
    return {
      total: activeReports.length,
      highPriority: activeReports.filter(
        r => (r.priority === 'critical' || r.priority === 'high') && r.status !== 'resolved'
      ).length,
      pending: activeReports.filter(r => r.status === 'pending').length,
      inReview: activeReports.filter(r => r.status === 'in_review').length,
      resolved: activeReports.filter(r => r.status === 'resolved').length
    };
  }, [reports]);

  if (!isAdmin) {
    return (
      <div className="rounded-3xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 p-8 text-center">
        <ShieldAlert className="h-10 w-10 text-rose-600 dark:text-rose-400 mx-auto mb-3" />
        <h2 className="text-base font-black text-rose-900 dark:text-rose-100">
          {t('adminFeedback.restrictedTitle')}
        </h2>
        <p className="text-xs text-rose-700 dark:text-rose-300 mt-1">
          {t('adminFeedback.restrictedDescription')}
        </p>
      </div>
    );
  }

  const getPriorityBadgeStyle = (priority: FeedbackReportPriority) => {
    switch (priority) {
      case 'critical':
        return 'bg-rose-600 text-white border-rose-700';
      case 'high':
        return 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30';
      case 'medium':
        return 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30';
      case 'low':
        return 'bg-slate-500/10 text-slate-600 dark:text-slate-300 border-slate-500/20';
    }
  };

  const getTypeIcon = (type: FeedbackReportType) => {
    switch (type) {
      case 'bug':
        return <Bug className="h-3.5 w-3.5 text-rose-500" />;
      case 'feature_request':
        return <Lightbulb className="h-3.5 w-3.5 text-amber-500" />;
      case 'ux_improvement':
        return <Sparkles className="h-3.5 w-3.5 text-indigo-500" />;
      case 'question':
        return <HelpCircle className="h-3.5 w-3.5 text-sky-500" />;
      default:
        return <MessageSquareText className="h-3.5 w-3.5 text-slate-500" />;
    }
  };

  const getModuleLabel = (moduleKey: string) => {
    const key = `adminFeedback.modules.${moduleKey}` as TranslationKey;
    const translated = t(key);
    return translated === key ? moduleKey : translated;
  };

  const formatTimestamp = (iso: string) => {
    try {
      return new Intl.DateTimeFormat(language === 'en' ? 'en-GB' : 'es-ES', {
        dateStyle: 'medium',
        timeStyle: 'short'
      }).format(new Date(iso));
    } catch {
      return iso;
    }
  };

  return (
    <div className="space-y-6">
      {/* Cabecera */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <Inbox className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-900 dark:text-white">
                {t('adminFeedback.title')}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t('adminFeedback.subtitle')}
              </p>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => void loadReports()}
          disabled={isLoading}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 px-4 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 transition disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          <span>{t('adminFeedback.refresh')}</span>
        </button>
      </div>

      {/* Tarjetas de Estadísticas */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3.5">
          <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
            {t('adminFeedback.stats.total')}
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white mt-1">{stats.total}</div>
        </div>
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-rose-200/80 dark:border-rose-900/50 p-3.5">
          <div className="text-[11px] font-bold text-rose-600 dark:text-rose-400">
            {t('adminFeedback.stats.highPriority')}
          </div>
          <div className="text-2xl font-black text-rose-600 dark:text-rose-400 mt-1">
            {stats.highPriority}
          </div>
        </div>
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-amber-200/80 dark:border-amber-900/50 p-3.5">
          <div className="text-[11px] font-bold text-amber-600 dark:text-amber-400">
            {t('adminFeedback.stats.pending')}
          </div>
          <div className="text-2xl font-black text-amber-600 dark:text-amber-400 mt-1">
            {stats.pending}
          </div>
        </div>
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-indigo-200/80 dark:border-indigo-900/50 p-3.5">
          <div className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400">
            {t('adminFeedback.stats.inReview')}
          </div>
          <div className="text-2xl font-black text-indigo-600 dark:text-indigo-400 mt-1">
            {stats.inReview}
          </div>
        </div>
        <div className="col-span-2 sm:col-span-1 rounded-2xl bg-white dark:bg-slate-900 border border-emerald-200/80 dark:border-emerald-900/50 p-3.5">
          <div className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
            {t('adminFeedback.stats.resolved')}
          </div>
          <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
            {stats.resolved}
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="relative">
          <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder={t('adminFeedback.filters.searchPlaceholder')}
            className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 pl-9 pr-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-emerald-500"
          />
        </div>

        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value as 'all' | FeedbackReportStatus)}
          className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-800 dark:text-slate-100 focus:outline-emerald-500"
        >
          <option value="all">{t('adminFeedback.filters.allStatuses')}</option>
          <option value="pending">{t('adminFeedback.statuses.pending')}</option>
          <option value="in_review">{t('adminFeedback.statuses.in_review')}</option>
          <option value="resolved">{t('adminFeedback.statuses.resolved')}</option>
          <option value="deleted">{t('adminFeedback.filters.deletedStatus')}</option>
        </select>

        <select
          value={priorityFilter}
          onChange={e => setPriorityFilter(e.target.value as 'all' | FeedbackReportPriority)}
          className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-800 dark:text-slate-100 focus:outline-emerald-500"
        >
          <option value="all">{t('adminFeedback.filters.allPriorities')}</option>
          <option value="critical">{t('adminFeedback.priorities.critical')}</option>
          <option value="high">{t('adminFeedback.priorities.high')}</option>
          <option value="medium">{t('adminFeedback.priorities.medium')}</option>
          <option value="low">{t('adminFeedback.priorities.low')}</option>
        </select>

        <select
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value as 'all' | FeedbackReportType)}
          className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-800 dark:text-slate-100 focus:outline-emerald-500"
        >
          <option value="all">{t('adminFeedback.filters.allTypes')}</option>
          <option value="bug">{t('adminFeedback.types.bug')}</option>
          <option value="feature_request">{t('adminFeedback.types.feature_request')}</option>
          <option value="ux_improvement">{t('adminFeedback.types.ux_improvement')}</option>
          <option value="question">{t('adminFeedback.types.question')}</option>
          <option value="other">{t('adminFeedback.types.other')}</option>
        </select>
      </div>

      {/* Banner de error si falta la tabla o falla RLS */}
      {errorMsg && (
        <div className="rounded-2xl border border-rose-300 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/50 p-4 flex items-start gap-3 text-xs text-rose-800 dark:text-rose-200">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-rose-600" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Listado de reportes ordenados por prioridad */}
      {isLoading ? (
        <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-12 text-center">
          <Loader2 className="h-6 w-6 animate-spin text-emerald-600 mx-auto mb-2" />
          <p className="text-xs font-semibold text-slate-500">{t('adminFeedback.loading')}</p>
        </div>
      ) : sortedAndFilteredReports.length === 0 ? (
        <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-10 text-center">
          <Inbox className="h-10 w-10 text-slate-300 dark:text-slate-700 mx-auto mb-3" />
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">
            {t('adminFeedback.labels.emptyTitle')}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto">
            {t('adminFeedback.labels.emptyDescription')}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {sortedAndFilteredReports.map(report => {
            const isUpdating = updatingId === report.id;
            return (
              <div
                key={report.id}
                className={`rounded-2xl border bg-white dark:bg-slate-900 p-4 sm:p-5 shadow-xs transition ${
                  report.status === 'resolved'
                    ? 'border-slate-200/70 dark:border-slate-800/70 opacity-85'
                    : report.priority === 'critical'
                    ? 'border-rose-300 dark:border-rose-900/70'
                    : 'border-slate-200 dark:border-slate-800'
                }`}
              >
                <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                  <div className="flex-1 space-y-3">
                    {/* Badges superiores */}
                    <div className="flex flex-wrap items-center gap-2 text-[11px]">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-lg font-extrabold border ${getPriorityBadgeStyle(
                          report.priority
                        )}`}
                      >
                        {t(`adminFeedback.priorities.${report.priority}` as TranslationKey)}
                      </span>

                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold border border-slate-200 dark:border-slate-700">
                        {getTypeIcon(report.type)}
                        <span>{t(`adminFeedback.types.${report.type}` as TranslationKey)}</span>
                      </span>

                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 font-mono font-semibold border border-indigo-200/60 dark:border-indigo-900/50">
                        {getModuleLabel(report.affected_module)}
                      </span>

                      <span className="text-slate-400 font-medium ml-auto sm:ml-0">
                        {formatTimestamp(report.created_at)}
                      </span>
                    </div>

                    {/* Resumen técnico extraído */}
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">
                        {t('adminFeedback.labels.technicalSummary')}
                      </div>
                      <p className="text-sm font-bold text-slate-900 dark:text-white leading-snug">
                        {report.technical_summary}
                      </p>
                    </div>

                    {/* Texto original del usuario */}
                    <div className="rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/70 dark:border-slate-800 p-3">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                        {t('adminFeedback.labels.rawMessage')}
                      </div>
                      <p className="text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
                        {report.raw_text}
                      </p>
                    </div>

                    {/* Metadatos del usuario */}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400">
                      <span className="inline-flex items-center gap-1.5">
                        <User className="h-3.5 w-3.5 text-slate-400" />
                        <span>
                          {t('adminFeedback.labels.reportedBy')}{' '}
                          <strong className="text-slate-700 dark:text-slate-200">
                            {report.user_name}
                          </strong>{' '}
                          ({report.user_email || '—'})
                        </span>
                      </span>
                      <span className="rounded-md bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:text-slate-300">
                        {t(`common.roles.${ROLE_I18N_KEY_MAP[normalizeUserRole(report.user_role)]}` as TranslationKey)}
                      </span>
                      {report.current_tab && (
                        <span>
                          {t('adminFeedback.labels.screenContext')}{' '}
                          <span className="font-mono text-slate-600 dark:text-slate-300">
                            {report.current_tab}
                          </span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Selector de estado */}
                  <div className="lg:w-52 shrink-0 flex flex-col gap-1.5 pt-3 lg:pt-0 border-t lg:border-t-0 lg:border-l border-slate-100 dark:border-slate-800 lg:pl-4">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                      {isUpdating
                        ? t('adminFeedback.labels.updating')
                        : t('adminFeedback.labels.updateStatus')}
                    </div>

                    <button
                      type="button"
                      disabled={isUpdating || report.status === 'pending'}
                      onClick={() => void handleStatusChange(report.id, 'pending')}
                      className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold transition ${
                        report.status === 'pending'
                          ? 'bg-amber-500 text-white shadow-xs'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-amber-50 dark:hover:bg-amber-950/30'
                      }`}
                    >
                      <Clock className="h-3.5 w-3.5 shrink-0" />
                      <span>{t('adminFeedback.statuses.pending')}</span>
                    </button>

                    <button
                      type="button"
                      disabled={isUpdating || report.status === 'in_review'}
                      onClick={() => void handleStatusChange(report.id, 'in_review')}
                      className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold transition ${
                        report.status === 'in_review'
                          ? 'bg-indigo-600 text-white shadow-xs'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/30'
                      }`}
                    >
                      <Eye className="h-3.5 w-3.5 shrink-0" />
                      <span>{t('adminFeedback.statuses.in_review')}</span>
                    </button>

                    <button
                      type="button"
                      disabled={isUpdating || report.status === 'resolved'}
                      onClick={() => void handleStatusChange(report.id, 'resolved')}
                      className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold transition ${
                        report.status === 'resolved'
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/30'
                      }`}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                      <span>{t('adminFeedback.statuses.resolved')}</span>
                    </button>

                    <button
                      type="button"
                      disabled={isUpdating || report.status === 'deleted'}
                      onClick={() => void handleStatusChange(report.id, 'deleted')}
                      className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold transition ${
                        report.status === 'deleted'
                          ? 'bg-rose-600 text-white shadow-xs'
                          : 'bg-slate-100 dark:bg-slate-800 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30'
                      }`}
                    >
                      <Trash2 className="h-3.5 w-3.5 shrink-0" />
                      <span>
                        {report.status === 'deleted'
                          ? t('adminFeedback.statuses.deleted')
                          : t('adminFeedback.labels.deleteAction')}
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
