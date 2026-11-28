import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useAcademyData } from '../context/AcademyDataContext';
import { createTranslator } from '../lib/i18n';
import { getMadridDateIso } from '../lib/date';
import { X, Check, Lock } from 'lucide-react';

interface AddSessionModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultTeacherId?: string;
}

export const AddSessionModal: React.FC<AddSessionModalProps> = ({ isOpen, onClose, defaultTeacherId }) => {
  const { language } = useAuth();
  const { activities, teachers, sessions, addClassSession } = useAcademyData();
  const t = createTranslator(language);

  const [teacherId, setTeacherId] = useState(defaultTeacherId || '');
  const availableActivities = activities.filter(a => a.teacherId === teacherId);

  const [activityId, setActivityId] = useState(availableActivities[0]?.id || '');
  const [date, setDate] = useState(() => getMadridDateIso());
  const [attendeesCount, setAttendeesCount] = useState<number>(3);
  const [durationMinutes, setDurationMinutes] = useState<number>(75);
  const [topic, setTopic] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    const nextTeacherId = defaultTeacherId || '';
    const nextActs = activities.filter(a => a.teacherId === nextTeacherId);
    setTeacherId(nextTeacherId);
    setActivityId(nextActs[0]?.id || '');
    setDate(getMadridDateIso());
    setAttendeesCount(3);
    setDurationMinutes(75);
    setTopic('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, defaultTeacherId]);

  if (!isOpen) return null;

  const matchingClosedSession = sessions.find(
    s =>
      s.activityId === activityId &&
      s.teacherId === teacherId &&
      s.date === date &&
      s.isClosed
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activityId || !teacherId || matchingClosedSession) return;

    addClassSession({
      activityId,
      teacherId,
      date,
      attendeesCount: Number(attendeesCount),
      durationMinutes: Number(durationMinutes),
      topic: topic.trim() || undefined
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/70 p-0 sm:p-4 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl bg-white dark:bg-slate-900 shadow-2xl border border-slate-200 dark:border-slate-800 max-h-[92dvh] sm:max-h-[88vh] flex flex-col overflow-hidden">
        
        {/* Cabecera Fija con botón táctil de 44px */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md shrink-0">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white leading-tight">
              {t('addSessionModal.title')}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t('addSessionModal.subtitle')}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('addSessionModal.closeAria')}
            className="flex h-11 w-11 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200 transition touch-manipulation active:scale-95"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Formulario con cuerpo escroleable independiente */}
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto overscroll-contain p-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {t('addSessionModal.teacherLabel')}
                </label>
                <select
                  value={teacherId}
                  onChange={e => {
                    const nextTeacherId = e.target.value;
                    setTeacherId(nextTeacherId);
                    const acts = activities.filter(a => a.teacherId === nextTeacherId);
                    setActivityId(acts[0]?.id || '');
                  }}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2.5 text-base sm:text-sm text-slate-800 dark:text-slate-200 focus:outline-emerald-500 font-semibold"
                >
                  {!teacherId && <option value="">—</option>}
                  {teachers.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {t('addSessionModal.activityLabel')}
                </label>
                <select
                  value={activityId}
                  onChange={e => setActivityId(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2.5 text-base sm:text-sm text-slate-800 dark:text-slate-200 focus:outline-emerald-500"
                >
                  {!activityId && <option value="">—</option>}
                  {availableActivities.map(a => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Fecha amplia y asistentes */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-1">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {t('addSessionModal.dateLabel')}
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2.5 text-base sm:text-sm font-medium text-slate-800 dark:text-slate-200 focus:outline-emerald-500"
                  required
                />
              </div>

              <div className="sm:col-span-1">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {t('addSessionModal.attendeesLabel')}
                </label>
                <input
                  type="number"
                  min="0"
                  value={attendeesCount}
                  onChange={e => setAttendeesCount(Number(e.target.value))}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2.5 text-base sm:text-sm font-bold text-slate-900 dark:text-white focus:outline-emerald-500 text-right"
                />
              </div>

              <div className="sm:col-span-1">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {t('addSessionModal.durationLabel')}
                </label>
                <input
                  type="number"
                  step="5"
                  min="15"
                  value={durationMinutes}
                  onChange={e => setDurationMinutes(Number(e.target.value))}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2.5 text-base sm:text-sm text-slate-800 dark:text-slate-200 focus:outline-emerald-500 text-right"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                {t('addSessionModal.topicLabel')}
              </label>
              <input
                type="text"
                placeholder={t('addSessionModal.topicPlaceholder')}
                value={topic}
                onChange={e => setTopic(e.target.value)}
                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-emerald-500"
              />
            </div>
            {matchingClosedSession && (
              <div className="rounded-xl border border-amber-500/35 bg-amber-50/80 dark:bg-amber-950/30 p-3 text-xs font-semibold text-amber-900 dark:text-amber-200 flex items-start gap-2">
                <Lock className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <span>{t('addSessionModal.closedReadOnlyWarning')}</span>
              </div>
            )}
          </div>

          {/* Barra Inferior Fija: Siempre a la vista */}
          <div className="sticky bottom-0 z-10 px-5 py-3 border-t border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md flex items-center justify-end gap-3 shrink-0 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 sm:flex-none rounded-xl border border-slate-300 dark:border-slate-700 px-4 py-2.5 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition min-h-[44px] flex items-center justify-center"
            >
              {t('addSessionModal.cancel')}
            </button>
            <button
              type="submit"
              disabled={Boolean(matchingClosedSession)}
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-emerald-700 shadow-md shadow-emerald-600/20 transition min-h-[44px] disabled:opacity-45 disabled:cursor-not-allowed"
            >
              <Check className="h-4 w-4" />
              <span>{t('addSessionModal.save')}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
