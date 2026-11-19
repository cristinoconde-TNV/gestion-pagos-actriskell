import React, { useMemo, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { UserRole } from '../types';
import { createTranslator } from '../lib/i18n';
import {
  ChevronLeft,
  ChevronRight,
  Newspaper,
  Pin,
  Plus,
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

interface NewsCarouselSectionProps {
  compact?: boolean;
}

export const NewsCarouselSection: React.FC<NewsCarouselSectionProps> = ({ compact = false }) => {
  const { newsNotes, addNewsNote, deleteNewsNote, currentRole, language } = useApp();
  const t = createTranslator(language);

  const carouselRef = useRef<HTMLDivElement | null>(null);
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('todos');
  const [isAddNoteOpen, setIsAddNoteOpen] = useState(false);
  const [noteTitle, setNoteTitle] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [noteCategory, setNoteCategory] = useState<'aviso' | 'taller' | 'noticia' | 'general'>('aviso');
  const [notePinned, setNotePinned] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const filteredNotes = useMemo(() => {
    const base =
      selectedCategoryFilter === 'todos'
        ? newsNotes
        : newsNotes.filter(n => n.category === selectedCategoryFilter);
    return [...base].sort((a, b) => {
      if (Boolean(a.pinned) !== Boolean(b.pinned)) {
        return a.pinned ? -1 : 1;
      }
      return (b.date || '').localeCompare(a.date || '');
    });
  }, [newsNotes, selectedCategoryFilter]);

  const scrollCarousel = (direction: 'left' | 'right') => {
    const container = carouselRef.current;
    if (!container) return;
    const step = Math.max(280, Math.round(container.clientWidth * 0.8));
    container.scrollBy({
      left: direction === 'left' ? -step : step,
      behavior: 'smooth'
    });
  };

  const handleCreateNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteTitle.trim() || !noteContent.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await addNewsNote({
        title: noteTitle.trim(),
        content: noteContent.trim(),
        date: toMadridIsoDate(new Date()),
        category: noteCategory,
        author: currentRole === UserRole.Admin ? t('news.defaultAuthors.admin') : t('news.defaultAuthors.teacher'),
        pinned: notePinned
      });

      setNoteTitle('');
      setNoteContent('');
      setNoteCategory('aviso');
      setNotePinned(false);
      setIsAddNoteOpen(false);
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
            <h3 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white truncate">
              {t('news.title')}
            </h3>
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

          {currentRole === UserRole.Admin && (
            <button
              type="button"
              onClick={() => setIsAddNoteOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 sm:px-3.5 sm:py-2 text-xs font-bold transition shadow-xs active:scale-95 whitespace-nowrap"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>{t('news.publishButton')}</span>
            </button>
          )}
        </div>
      </div>

      {/* Carrusel horizontal deslizable (ahora colocado arriba) */}
      {filteredNotes.length === 0 ? (
        <div className="py-6 text-center text-xs text-slate-400">
          {t('news.emptyCategory')}
        </div>
      ) : (
        <div
          ref={carouselRef}
          onTouchStart={e => e.stopPropagation()}
          onTouchEnd={e => e.stopPropagation()}
          className="flex gap-3 sm:gap-4 overflow-x-auto snap-x snap-mandatory scroll-smooth no-scrollbar pb-1"
        >
          {filteredNotes.map(note => (
            <article
              key={note.id}
              className={`snap-start shrink-0 w-[85%] sm:w-[320px] md:w-[340px] rounded-2xl border p-4 bg-slate-50/70 dark:bg-slate-800/35 flex flex-col justify-between gap-3 transition hover:shadow-xs ${
                note.pinned
                  ? 'border-indigo-500/35 dark:border-indigo-500/40 bg-indigo-50/30 dark:bg-indigo-950/20'
                  : 'border-slate-200 dark:border-slate-800'
              }`}
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-1.5 min-w-0">
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
                        ? t(`news.categories.${note.category as 'aviso' | 'taller' | 'noticia' | 'general'}`)
                        : note.category}
                    </span>
                  </div>

                  <span className="text-[11px] text-slate-400 font-medium whitespace-nowrap shrink-0">
                    {note.date}
                  </span>
                </div>

                <h4 className="text-sm font-bold text-slate-900 dark:text-white leading-snug line-clamp-2">
                  {note.title}
                </h4>

                <p className="text-xs text-slate-600 dark:text-slate-300 mt-2 leading-relaxed line-clamp-4">
                  {note.content}
                </p>
              </div>

              <div className="pt-2 border-t border-slate-200/70 dark:border-slate-800 flex items-center justify-between gap-2 text-[11px] text-slate-400">
                <span className="truncate">{note.author || t('news.defaultAuthors.association')}</span>
                {currentRole === UserRole.Admin && (
                  <button
                    type="button"
                    onClick={() => deleteNewsNote(note.id)}
                    className="text-slate-400 hover:text-rose-600 transition shrink-0 p-1 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/30"
                    title={t('news.deleteTooltip')}
                    aria-label={t('news.deleteAria', { title: note.title })}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      {/* Filtro por categorías ubicado debajo del carrusel */}
      <div className="flex flex-col gap-1.5 pt-1 w-full">
        {/* Botón "Todas" ocupando todo el ancho */}
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

        {/* Resto de categorías: cuadrícula con el mismo número de columnas que botones para que compartan el espacio equitativamente en móvil */}
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

      {/* Modal para Publicar Nueva Nota (solo Admin) */}
      {isAddNoteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-6">
            <div className="flex items-start justify-between gap-3 mb-1">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {t('news.modal.title')}
              </h3>
              <button
                type="button"
                onClick={() => setIsAddNoteOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
              {t('news.modal.subtitle')}
            </p>

            <form onSubmit={handleCreateNote} className="space-y-4">
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
                    onChange={e => setNoteCategory(e.target.value as 'aviso' | 'taller' | 'noticia' | 'general')}
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
                  onClick={() => setIsAddNoteOpen(false)}
                  className="rounded-xl px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  {t('news.modal.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 text-xs font-bold transition shadow-xs disabled:opacity-60"
                >
                  {isSubmitting ? t('news.modal.submitting') : t('news.modal.submit')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
