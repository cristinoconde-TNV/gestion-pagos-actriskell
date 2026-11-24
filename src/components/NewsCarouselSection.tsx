import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { NewsNote, UserRole } from '../types';
import { createTranslator } from '../lib/i18n';
import {
  evaluateWorkshopNoteGraceStatus,
  getStoredActivityEndedAtMap,
  isNewsNoteExpiredByDate,
  parseNewsFinishedWorkshopGraceConfig
} from '../lib/newsConfig';
import {
  Calendar,
  Check,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Clock,
  Edit2,
  GraduationCap,
  Newspaper,
  Pin,
  Plus,
  RotateCcw,
  Trash2,
  X
} from 'lucide-react';

const MADRID_TIMEZONE = 'Europe/Madrid';

function toMadridIsoDate(dateObj: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: MADRID_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(dateObj);
}

type ReadStatusFilter = 'all' | 'unread' | 'read' | 'deleted';

interface NewsCarouselSectionProps {
  compact?: boolean;
}

export const NewsCarouselSection: React.FC<NewsCarouselSectionProps> = ({ compact = false }) => {
  const {
    newsNotes,
    readNewsNoteIds,
    addNewsNote,
    updateNewsNote,
    deleteNewsNote,
    restoreNewsNote,
    permanentlyDeleteNewsNote,
    markNewsNoteRead,
    activities,
    appConfigs,
    currentRole,
    currentUser,
    language
  } = useApp();
  const t = createTranslator(language);

  const isStrictAdmin = currentRole === UserRole.Admin && currentUser?.role === UserRole.Admin;

  const carouselRef = useRef<HTMLDivElement | null>(null);
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('todos');
  const [readStatusFilter, setReadStatusFilter] = useState<ReadStatusFilter>('all');
  const [isAddNoteOpen, setIsAddNoteOpen] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [noteTitle, setNoteTitle] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [noteCategory, setNoteCategory] = useState<'aviso' | 'taller' | 'noticia' | 'general'>('aviso');
  const [notePinned, setNotePinned] = useState(false);
  const [noteActivityId, setNoteActivityId] = useState<string>('');
  const [noteExpiresAt, setNoteExpiresAt] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [noteSubmitError, setNoteSubmitError] = useState<string | null>(null);
  const [pendingPurgeId, setPendingPurgeId] = useState<string | null>(null);

  useEffect(() => {
    if (!isStrictAdmin && readStatusFilter === 'deleted') {
      setReadStatusFilter('all');
    }
  }, [isStrictAdmin, readStatusFilter]);

  const graceConfig = useMemo(
    () => parseNewsFinishedWorkshopGraceConfig(appConfigs),
    [appConfigs]
  );

  const ongoingWorkshops = useMemo(
    () =>
      activities
        .filter(a => a.active !== false && a.status !== 'inactive')
        .sort((a, b) => a.name.localeCompare(b.name)),
    [activities]
  );

  const readSet = useMemo(() => new Set(readNewsNoteIds), [readNewsNoteIds]);

  const enrichedNotes = useMemo(() => {
    const now = new Date();
    const endedAtMap = getStoredActivityEndedAtMap();

    return newsNotes.map(note => {
      const linkedActivity = note.activityId
        ? activities.find(a => a.id === note.activityId)
        : undefined;
      const graceEval = evaluateWorkshopNoteGraceStatus({
        note,
        activity: linkedActivity,
        config: graceConfig,
        endedAtFallbackMap: endedAtMap,
        now
      });
      const isDateExpired = isNewsNoteExpiredByDate(note.expiresAt, now);
      const isSoftDeleted =
        Boolean(note.isDeleted || note.deletedAt) ||
        isDateExpired ||
        (graceConfig.enabled && graceConfig.action === 'delete' && graceEval.isExpired);
      const isRead =
        readSet.has(note.id) ||
        (graceConfig.enabled && graceConfig.action === 'mark_read' && graceEval.isExpired);

      return {
        note,
        linkedActivity,
        graceEval,
        isDateExpired,
        isSoftDeleted,
        isRead
      };
    });
  }, [newsNotes, activities, graceConfig, readSet]);

  const statusCounts = useMemo(() => {
    let all = 0;
    let unread = 0;
    let read = 0;
    let deleted = 0;

    for (const item of enrichedNotes) {
      if (item.isSoftDeleted) {
        if (isStrictAdmin) deleted += 1;
        continue;
      }
      all += 1;
      if (item.isRead) {
        read += 1;
      } else {
        unread += 1;
      }
    }
    return { all, unread, read, deleted };
  }, [enrichedNotes, isStrictAdmin]);

  const filteredNotes = useMemo(() => {
    const byStatus = enrichedNotes.filter(item => {
      if (readStatusFilter === 'deleted') {
        return isStrictAdmin && item.isSoftDeleted;
      }
      if (item.isSoftDeleted) return false;
      if (readStatusFilter === 'unread') return !item.isRead;
      if (readStatusFilter === 'read') return item.isRead;
      return true;
    });

    const byCategory =
      selectedCategoryFilter === 'todos'
        ? byStatus
        : byStatus.filter(item => item.note.category === selectedCategoryFilter);

    return [...byCategory].sort((a, b) => {
      if (Boolean(a.note.pinned) !== Boolean(b.note.pinned)) {
        return a.note.pinned ? -1 : 1;
      }
      return (b.note.date || '').localeCompare(a.note.date || '');
    });
  }, [enrichedNotes, readStatusFilter, selectedCategoryFilter, isStrictAdmin]);

  const scrollCarousel = (direction: 'left' | 'right') => {
    const container = carouselRef.current;
    if (!container) return;
    const step = Math.max(280, Math.round(container.clientWidth * 0.8));
    container.scrollBy({
      left: direction === 'left' ? -step : step,
      behavior: 'smooth'
    });
  };

  const resetNoteForm = () => {
    setEditingNoteId(null);
    setNoteTitle('');
    setNoteContent('');
    setNoteCategory('aviso');
    setNotePinned(false);
    setNoteActivityId('');
    setNoteExpiresAt('');
    setNoteSubmitError(null);
  };

  const openCreateModal = () => {
    resetNoteForm();
    setIsAddNoteOpen(true);
  };

  const openEditModal = (note: NewsNote) => {
    const validCategory = ['aviso', 'taller', 'noticia', 'general'].includes(note.category)
      ? (note.category as 'aviso' | 'taller' | 'noticia' | 'general')
      : 'general';
    setEditingNoteId(note.id);
    setNoteTitle(note.title || '');
    setNoteContent(note.content || '');
    setNoteCategory(validCategory);
    setNotePinned(Boolean(note.pinned));
    setNoteActivityId(validCategory === 'taller' ? note.activityId || '' : '');
    setNoteExpiresAt(note.expiresAt ? note.expiresAt.slice(0, 10) : '');
    setNoteSubmitError(null);
    setIsAddNoteOpen(true);
  };

  const closeNoteModal = () => {
    setIsAddNoteOpen(false);
    resetNoteForm();
  };

  const handleSaveNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteTitle.trim() || !noteContent.trim() || isSubmitting) return;

    const isWorkshopCategory = noteCategory === 'taller';
    const selectedActivity =
      isWorkshopCategory && noteActivityId
        ? activities.find(a => a.id === noteActivityId)
        : undefined;
    const cleanedExpiresAt = noteExpiresAt.trim()
      ? noteExpiresAt.trim().slice(0, 10)
      : undefined;

    setIsSubmitting(true);
    setNoteSubmitError(null);
    try {
      const res = editingNoteId
        ? await updateNewsNote(editingNoteId, {
            title: noteTitle.trim(),
            content: noteContent.trim(),
            category: noteCategory,
            pinned: notePinned,
            activityId: selectedActivity?.id,
            activityName: selectedActivity?.name,
            expiresAt: cleanedExpiresAt
          })
        : await addNewsNote({
            title: noteTitle.trim(),
            content: noteContent.trim(),
            date: toMadridIsoDate(new Date()),
            category: noteCategory,
            author: isStrictAdmin
              ? t('news.defaultAuthors.admin')
              : t('news.defaultAuthors.teacher'),
            pinned: notePinned,
            activityId: selectedActivity?.id,
            activityName: selectedActivity?.name,
            expiresAt: cleanedExpiresAt
          });

      if (!res.success) {
        setNoteSubmitError(res.error || t('news.modal.saveError'));
        return;
      }

      closeNoteModal();
    } finally {
      setIsSubmitting(false);
    }
  };

  const categoryColors: Record<string, string> = {
    aviso: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20',
    taller: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20',
    noticia: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/20',
    general: 'bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-500/20'
  };

  const formatRemainingMargin = (remainingMs: number | null) => {
    if (remainingMs === null || remainingMs <= 0) return null;
    const hours = Math.ceil(remainingMs / (3600 * 1000));
    if (hours >= 24) {
      const days = Math.ceil(hours / 24);
      return t('news.graceDaysLeft', { days });
    }
    return t('news.graceHoursLeft', { hours });
  };

  return (
    <div
      className={`bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl border border-slate-200 dark:border-slate-800 ${
        compact ? 'p-3.5 sm:p-5' : 'p-4 sm:p-5'
      } shadow-xs space-y-3.5`}
    >
      {/* Cabecera */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="h-8 w-8 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
            <Newspaper className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white truncate">
                {t('news.title')}
              </h3>
              {statusCounts.unread > 0 && (
                <span className="inline-flex items-center rounded-full bg-indigo-600 px-2 py-0.5 text-[10px] font-bold text-white tabular-nums">
                  {t('news.unreadBadgeCount', { count: statusCounts.unread })}
                </span>
              )}
            </div>
            <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 truncate">
              {t('news.subtitle')}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0">
          {filteredNotes.length > 1 && (
            <div className="hidden sm:flex items-center gap-1">
              <button
                type="button"
                onClick={() => scrollCarousel('left')}
                aria-label={t('news.scrollLeftAria')}
                className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => scrollCarousel('right')}
                aria-label={t('news.scrollRightAria')}
                className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}

          {isStrictAdmin && (
            <button
              type="button"
              onClick={openCreateModal}
              className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 sm:px-3.5 sm:py-2 text-xs font-bold transition shadow-xs active:scale-95 whitespace-nowrap"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>{t('news.publishButton')}</span>
            </button>
          )}
        </div>
      </div>

      {/* Filtro por estado de lectura (todos) + Eliminadas (solo Administrador) */}
      <div
        className={`grid gap-1.5 w-full ${
          isStrictAdmin ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3'
        }`}
      >
        <button
          type="button"
          onClick={() => setReadStatusFilter('all')}
          className={`rounded-xl px-2.5 py-2 text-[11px] sm:text-xs font-bold transition flex items-center justify-center gap-1.5 ${
            readStatusFilter === 'all'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
          }`}
        >
          <span>{t('news.statusFilters.all')}</span>
          <span className="opacity-80 tabular-nums">({statusCounts.all})</span>
        </button>

        <button
          type="button"
          onClick={() => setReadStatusFilter('unread')}
          className={`rounded-xl px-2.5 py-2 text-[11px] sm:text-xs font-bold transition flex items-center justify-center gap-1.5 ${
            readStatusFilter === 'unread'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
          }`}
        >
          <span>{t('news.statusFilters.unread')}</span>
          <span className="opacity-80 tabular-nums">({statusCounts.unread})</span>
        </button>

        <button
          type="button"
          onClick={() => setReadStatusFilter('read')}
          className={`rounded-xl px-2.5 py-2 text-[11px] sm:text-xs font-bold transition flex items-center justify-center gap-1.5 ${
            readStatusFilter === 'read'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
          }`}
        >
          <span>{t('news.statusFilters.read')}</span>
          <span className="opacity-80 tabular-nums">({statusCounts.read})</span>
        </button>

        {isStrictAdmin && (
          <button
            type="button"
            onClick={() => setReadStatusFilter('deleted')}
            className={`rounded-xl px-2.5 py-2 text-[11px] sm:text-xs font-bold transition flex items-center justify-center gap-1.5 ${
              readStatusFilter === 'deleted'
                ? 'bg-rose-600 text-white shadow-xs'
                : 'bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 border border-rose-200/70 dark:border-rose-900/50 hover:bg-rose-100 dark:hover:bg-rose-950/50'
            }`}
          >
            <Trash2 className="h-3 w-3 shrink-0" />
            <span>{t('news.statusFilters.deleted')}</span>
            <span className="opacity-80 tabular-nums">({statusCounts.deleted})</span>
          </button>
        )}
      </div>

      {/* Carrusel horizontal deslizable */}
      {filteredNotes.length === 0 ? (
        <div className="py-6 text-center text-xs text-slate-400">
          {readStatusFilter === 'deleted'
            ? t('news.emptyDeleted')
            : readStatusFilter === 'unread'
            ? t('news.emptyUnread')
            : readStatusFilter === 'read'
            ? t('news.emptyRead')
            : t('news.emptyCategory')}
        </div>
      ) : (
        <div
          ref={carouselRef}
          className="flex gap-3 sm:gap-4 overflow-x-auto snap-x snap-mandatory scroll-smooth no-scrollbar pb-1"
        >
          {filteredNotes.map(
            ({ note, linkedActivity, graceEval, isDateExpired, isSoftDeleted, isRead }) => {
            const workshopLabel = linkedActivity?.name || note.activityName;
            const remainingText =
              graceEval.isWorkshopFinished && graceConfig.enabled
                ? formatRemainingMargin(graceEval.remainingMs)
                : null;
            const isPurgeConfirmOpen = pendingPurgeId === note.id;

            return (
              <article
                key={note.id}
                className={`snap-start shrink-0 w-[85%] sm:w-[320px] md:w-[340px] rounded-2xl border p-4 flex flex-col justify-between gap-3 transition hover:shadow-xs ${
                  isSoftDeleted
                    ? 'border-dashed border-rose-300 dark:border-rose-900/60 bg-rose-50/40 dark:bg-rose-950/15'
                    : note.pinned && !isRead
                    ? 'border-indigo-500/40 dark:border-indigo-500/45 bg-indigo-50/35 dark:bg-indigo-950/20'
                    : isRead
                    ? 'border-slate-200/80 dark:border-slate-800/80 bg-slate-50/40 dark:bg-slate-800/20 opacity-85'
                    : 'border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/45'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                      {!isSoftDeleted && !isRead && (
                        <span
                          className="h-2 w-2 rounded-full bg-indigo-600 dark:bg-indigo-400 shrink-0"
                          title={t('news.unreadDotTitle')}
                        />
                      )}
                      {note.pinned && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-600 dark:text-indigo-400 whitespace-nowrap">
                          <Pin className="h-3 w-3 shrink-0" />
                          <span>{t('news.pinned')}</span>
                        </span>
                      )}
                      <span
                        className={`rounded-md px-2 py-0.5 text-[10px] font-bold border uppercase tracking-wider whitespace-nowrap ${
                          categoryColors[note.category] || categoryColors.general
                        }`}
                      >
                        {['aviso', 'taller', 'noticia', 'general'].includes(note.category)
                          ? t(
                              `news.categories.${
                                note.category as 'aviso' | 'taller' | 'noticia' | 'general'
                              }`
                            )
                          : note.category}
                      </span>
                      {isSoftDeleted && (
                        <span className="rounded-md bg-rose-500/15 border border-rose-500/25 px-1.5 py-0.5 text-[10px] font-bold text-rose-700 dark:text-rose-300 whitespace-nowrap">
                          {t('news.deletedBadge')}
                        </span>
                      )}
                    </div>

                    <span className="text-[11px] text-slate-400 font-medium whitespace-nowrap shrink-0">
                      {note.date}
                    </span>
                  </div>

                  {(workshopLabel || note.expiresAt) && (
                    <div className="mb-2 flex flex-wrap items-center gap-1.5">
                      {workshopLabel && (
                        <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-300 max-w-full">
                          <GraduationCap className="h-3 w-3 shrink-0" />
                          <span className="truncate">{workshopLabel}</span>
                        </span>
                      )}
                      {graceEval.isWorkshopFinished && (
                        <span className="inline-flex items-center gap-1 rounded-lg bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-300 whitespace-nowrap">
                          <Clock className="h-3 w-3 shrink-0" />
                          <span>
                            {remainingText
                              ? `${t('news.workshopFinished')} · ${remainingText}`
                              : t('news.workshopFinished')}
                          </span>
                        </span>
                      )}
                      {note.expiresAt && (
                        <span
                          className={`inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[10px] font-bold border whitespace-nowrap ${
                            isDateExpired
                              ? 'bg-rose-500/10 border-rose-500/25 text-rose-700 dark:text-rose-300'
                              : 'bg-slate-500/10 border-slate-500/20 text-slate-600 dark:text-slate-300'
                          }`}
                        >
                          <Calendar className="h-3 w-3 shrink-0" />
                          <span>
                            {isDateExpired
                              ? t('news.expiredBadge', { date: note.expiresAt })
                              : t('news.expiresBadge', { date: note.expiresAt })}
                          </span>
                        </span>
                      )}
                    </div>
                  )}

                  <h4 className="text-sm font-bold text-slate-900 dark:text-white leading-snug line-clamp-2">
                    {note.title}
                  </h4>

                  <p className="text-xs text-slate-600 dark:text-slate-300 mt-2 leading-relaxed line-clamp-4">
                    {note.content}
                  </p>
                </div>

                <div className="pt-2.5 border-t border-slate-200/70 dark:border-slate-800 flex items-center justify-between gap-2 text-[11px] text-slate-400">
                  <span className="truncate">
                    {note.author || t('news.defaultAuthors.association')}
                  </span>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {!isSoftDeleted ? (
                      <>
                        {currentUser && (
                          <button
                            type="button"
                            onClick={() => void markNewsNoteRead(note.id, !isRead)}
                            className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold transition min-h-[28px] active:scale-95 ${
                              isRead
                                ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/25 hover:bg-emerald-500/25'
                                : 'bg-indigo-600/10 text-indigo-700 dark:text-indigo-300 border border-indigo-500/25 hover:bg-indigo-600/20'
                            }`}
                            title={isRead ? t('news.markUnreadTooltip') : t('news.markReadTooltip')}
                          >
                            {isRead ? (
                              <>
                                <CheckCheck className="h-3.5 w-3.5 shrink-0" />
                                <span>{t('news.readBadge')}</span>
                              </>
                            ) : (
                              <>
                                <Check className="h-3.5 w-3.5 shrink-0" />
                                <span>{t('news.markReadButton')}</span>
                              </>
                            )}
                          </button>
                        )}

                        {isStrictAdmin && (
                          <>
                            <button
                              type="button"
                              onClick={() => openEditModal(note)}
                              className="text-slate-400 hover:text-indigo-600 transition shrink-0 p-1.5 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-950/30"
                              title={t('news.editTooltip')}
                              aria-label={t('news.editAria', { title: note.title })}
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => void deleteNewsNote(note.id)}
                              className="text-slate-400 hover:text-rose-600 transition shrink-0 p-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/30"
                              title={t('news.deleteTooltip')}
                              aria-label={t('news.deleteAria', { title: note.title })}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </>
                        )}
                      </>
                    ) : (
                      isStrictAdmin && (
                        <>
                          {!isPurgeConfirmOpen ? (
                            <>
                              <button
                                type="button"
                                onClick={() => void restoreNewsNote(note.id)}
                                className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1 text-[11px] font-bold transition min-h-[28px]"
                              >
                                <RotateCcw className="h-3 w-3 shrink-0" />
                                <span>{t('news.restoreButton')}</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => setPendingPurgeId(note.id)}
                                className="inline-flex items-center gap-1 rounded-lg border border-rose-300 dark:border-rose-800 text-rose-600 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-950/40 px-2 py-1 text-[11px] font-bold transition min-h-[28px]"
                                title={t('news.purgeTooltip')}
                              >
                                <Trash2 className="h-3 w-3 shrink-0" />
                              </button>
                            </>
                          ) : (
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => {
                                  setPendingPurgeId(null);
                                  void permanentlyDeleteNewsNote(note.id);
                                }}
                                className="rounded-lg bg-rose-600 hover:bg-rose-700 text-white px-2 py-1 text-[10px] font-bold transition"
                              >
                                {t('news.confirmPurgeYes')}
                              </button>
                              <button
                                type="button"
                                onClick={() => setPendingPurgeId(null)}
                                className="rounded-lg border border-slate-300 dark:border-slate-700 px-2 py-1 text-[10px] font-semibold text-slate-600 dark:text-slate-300"
                              >
                                {t('news.confirmPurgeNo')}
                              </button>
                            </div>
                          )}
                        </>
                      )
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Filtro por categorías ubicado debajo del carrusel */}
      <div className="flex flex-col gap-1.5 pt-1 w-full">
        <button
          type="button"
          onClick={() => setSelectedCategoryFilter('todos')}
          className={`w-full rounded-xl px-3 py-2 text-xs font-bold transition capitalize text-center ${
            selectedCategoryFilter === 'todos'
              ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-xs'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
          }`}
        >
          {t('news.categories.all')}
        </button>

        <div className="grid grid-cols-4 gap-1.5 w-full">
          {['aviso', 'taller', 'noticia', 'general'].map(cat => (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategoryFilter(cat)}
              className={`rounded-xl px-1.5 py-2 text-[11px] sm:text-xs font-bold transition capitalize text-center truncate ${
                selectedCategoryFilter === cat
                  ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              {t(`news.categories.${cat as 'aviso' | 'taller' | 'noticia' | 'general'}`)}
            </button>
          ))}
        </div>
      </div>

      {/* Modal para Publicar / Editar Nota (solo Admin) */}
      {isAddNoteOpen && isStrictAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3 mb-1">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {editingNoteId ? t('news.modal.editTitle') : t('news.modal.title')}
              </h3>
              <button
                type="button"
                onClick={closeNoteModal}
                className="rounded-lg p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
              {editingNoteId ? t('news.modal.editSubtitle') : t('news.modal.subtitle')}
            </p>

            {noteSubmitError && (
              <div className="mb-4 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/30 px-3 py-2.5 text-xs text-rose-700 dark:text-rose-300">
                {noteSubmitError}
              </div>
            )}

            <form onSubmit={handleSaveNote} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {t('news.modal.titleLabel')}
                </label>
                <input
                  type="text"
                  required
                  placeholder={t('news.modal.titlePlaceholder')}
                  value={noteTitle}
                  onChange={e => setNoteTitle(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-900 dark:text-white focus:outline-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    {t('news.modal.categoryLabel')}
                  </label>
                  <select
                    value={noteCategory}
                    onChange={e => {
                      const nextCategory = e.target.value as
                        | 'aviso'
                        | 'taller'
                        | 'noticia'
                        | 'general';
                      setNoteCategory(nextCategory);
                      if (nextCategory !== 'taller') {
                        setNoteActivityId('');
                      }
                    }}
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-900 dark:text-white"
                  >
                    <option value="aviso">{t('news.categories.aviso')}</option>
                    <option value="taller">{t('news.categories.taller')}</option>
                    <option value="noticia">{t('news.categories.noticia')}</option>
                    <option value="general">{t('news.categories.general')}</option>
                  </select>
                </div>

                <div className="flex items-center pt-5">
                  <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-700 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={notePinned}
                      onChange={e => setNotePinned(e.target.checked)}
                      className="rounded border-slate-300 text-indigo-600 h-4 w-4"
                    />
                    <span className="font-semibold">{t('news.modal.pinLabel')}</span>
                  </label>
                </div>
              </div>

              {noteCategory === 'taller' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    {t('news.modal.workshopLabel')}
                  </label>
                  <select
                    value={noteActivityId}
                    onChange={e => setNoteActivityId(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-900 dark:text-white"
                  >
                    <option value="">{t('news.modal.workshopNone')}</option>
                    {ongoingWorkshops.map(act => (
                      <option key={act.id} value={act.id}>
                        {act.name} ({act.category})
                      </option>
                    ))}
                  </select>
                  {noteActivityId && graceConfig.enabled && (
                    <p className="mt-1.5 text-[11px] text-indigo-700 dark:text-indigo-300 bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-900/50 rounded-lg px-2.5 py-1.5">
                      {t('news.modal.workshopGraceHint', {
                        hours: graceConfig.graceHours,
                        action:
                          graceConfig.action === 'delete'
                            ? t('adminConfig.newsGraceSettings.actionDeleteVerb')
                            : t('adminConfig.newsGraceSettings.actionMarkReadVerb')
                      })}
                    </p>
                  )}
                </div>
              )}

              <div>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    {t('news.modal.expiresAtLabel')}
                  </label>
                  {noteExpiresAt && (
                    <button
                      type="button"
                      onClick={() => setNoteExpiresAt('')}
                      className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
                    >
                      {t('news.modal.clearExpiresAt')}
                    </button>
                  )}
                </div>
                <input
                  type="date"
                  value={noteExpiresAt}
                  onChange={e => setNoteExpiresAt(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-900 dark:text-white focus:outline-emerald-500"
                />
                {noteExpiresAt && (
                  <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                    {t('news.modal.expiresAtHint')}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {t('news.modal.contentLabel')}
                </label>
                <textarea
                  required
                  rows={4}
                  placeholder={t('news.modal.contentPlaceholder')}
                  value={noteContent}
                  onChange={e => setNoteContent(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-2.5 text-xs text-slate-900 dark:text-white focus:outline-emerald-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={closeNoteModal}
                  className="rounded-xl px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  {t('news.modal.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 text-xs font-bold transition shadow-xs disabled:opacity-60"
                >
                  {isSubmitting
                    ? editingNoteId
                      ? t('news.modal.savingEdit')
                      : t('news.modal.submitting')
                    : editingNoteId
                    ? t('news.modal.submitEdit')
                    : t('news.modal.submit')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
