import React, { useState, useMemo, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import { CalendarEventItem } from '../types';
import {
  Calendar as CalendarIcon,
  Clock,
  MapPin,
  User,
  Plus,
  ChevronLeft,
  ChevronRight,
  Info
} from 'lucide-react';

interface CalendarViewProps {
  onOpenAddSession?: () => void;
  onNavigateToActivities?: () => void;
}

const MADRID_TIMEZONE = 'Europe/Madrid';

function toMadridIsoDate(dateObj: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: MADRID_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(dateObj);
}

export const CalendarView: React.FC<CalendarViewProps> = ({
  onOpenAddSession,
  onNavigateToActivities
}) => {
  const {
    activities,
    teachers,
    sessions,
    currentRole
  } = useApp();

  // Navegación de ventana semanal (0 = [Ayer, Hoy, +1..+5])
  const [weekOffset, setWeekOffset] = useState<number>(0);
  const [selectedDayIndex, setSelectedDayIndex] = useState<number>(1);

  // Generar la tira de 7 días: [Ayer, Hoy, +1..+5] desplazada por weekOffset * 7
  const sevenDays = useMemo(() => {
    const today = new Date();
    const todayIso = toMadridIsoDate(today);
    const days = [];

    const dayNamesShort = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    const monthNamesShort = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

    for (let i = 0; i < 7; i++) {
      const offset = -1 + i + weekOffset * 7;
      const d = new Date(today);
      d.setDate(today.getDate() + offset);

      const dayOfWeekNum = d.getDay();
      const dayOfMonth = d.getDate();
      const monthNum = d.getMonth();
      const isoDate = toMadridIsoDate(d);

      const yesterdayDate = new Date(today);
      yesterdayDate.setDate(today.getDate() - 1);
      const yesterdayIso = toMadridIsoDate(yesterdayDate);

      let tag = '';
      if (isoDate === yesterdayIso) {
        tag = 'Ayer';
      } else if (isoDate === todayIso) {
        tag = 'HOY';
      }

      days.push({
        index: i,
        offset,
        dateObj: d,
        isoDate,
        dayOfWeekNum,
        dayName: dayNamesShort[dayOfWeekNum],
        sublabel: `${dayOfMonth} ${monthNamesShort[monthNum]}`,
        tag,
        isToday: isoDate === todayIso
      });
    }

    return days;
  }, [weekOffset]);

  const selectedDay = sevenDays[selectedDayIndex] || sevenDays[1];

  // Mapear actividades locales y sesiones registradas para una fecha concreta
  const getEventsForDay = useCallback(
    (dayInfo: (typeof sevenDays)[number]) => {
      const dayOfWeek = dayInfo.dayOfWeekNum;
      const dayNamesSpanish = [
        'domingo',
        'lunes',
        'martes',
        'miércoles',
        'jueves',
        'viernes',
        'sábado'
      ];
      const targetDayName = dayNamesSpanish[dayOfWeek];

      const result: CalendarEventItem[] = [];

      // 1. Actividades locales configuradas en el centro
      activities.forEach(act => {
        if (!act.active) return;
        const teacher = teachers.find(t => t.id === act.teacherId);

        const matchesSchedule = act.schedule.some(s => {
          const sLower = s.toLowerCase();
          if (targetDayName === 'miércoles') {
            return sLower.includes('miercoles') || sLower.includes('miércoles');
          }
          if (targetDayName === 'sábado') {
            return sLower.includes('sabado') || sLower.includes('sábado');
          }
          return sLower.includes(targetDayName);
        });

        if (matchesSchedule) {
          let startTime = '18:00';
          let endTime = '19:30';

          const scheduleStr = act.schedule[0] || '';
          const timeMatch = scheduleStr.match(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/);
          if (timeMatch) {
            startTime = timeMatch[1].padStart(5, '0');
            endTime = timeMatch[2].padStart(5, '0');
          }

          result.push({
            id: `act-${act.id}-${dayInfo.isoDate}`,
            title: act.name,
            startTime,
            endTime,
            date: dayInfo.isoDate,
            teacherName: teacher?.name || 'Monitor Triskell',
            room: act.room,
            activityName: act.name,
            category: act.category,
            billingMode: act.billingMode,
            price:
              act.billingMode === 'per_class'
                ? act.defaultPricePerClass
                : act.defaultPriceMonthly,
            description: act.description
          });
        }
      });

      // 2. Sesiones registradas en el centro para esa fecha exacta
      sessions
        .filter(s => s.date === dayInfo.isoDate)
        .forEach(sess => {
          const act = activities.find(a => a.id === sess.activityId);
          const teacher = teachers.find(t => t.id === sess.teacherId);
          if (!result.some(r => r.id === `sess-${sess.id}`)) {
            result.push({
              id: `sess-${sess.id}`,
              title: sess.topic || act?.name || 'Sesión de Clase',
              startTime: '19:00',
              endTime: '20:15',
              date: sess.date,
              teacherName: teacher?.name || 'Monitor',
              room: act?.room || 'Sala Principal',
              category: act?.category || 'Clase',
              description: `Sesión de ${sess.durationMinutes} min con ${sess.attendeesCount} alumnos asistentes.`
            });
          }
        });

      return result.sort((a, b) => a.startTime.localeCompare(b.startTime));
    },
    [activities, teachers, sessions]
  );

  const eventsForSelectedDay = useMemo(
    () => getEventsForDay(selectedDay),
    [getEventsForDay, selectedDay]
  );

  return (
    <div className="space-y-6">
      {/* =========================================================================
          SECCIÓN SUPERIOR: CALENDARIO LOCAL + TIRA DE 7 DÍAS
          ========================================================================= */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
              <CalendarIcon className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>Calendario de Actividades & Horarios</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Agenda semanal de talleres y sesiones registradas en A.C. Triskell ({MADRID_TIMEZONE})
            </p>
          </div>

          {onOpenAddSession && (currentRole === 'admin' || currentRole === 'teacher') && (
            <button
              type="button"
              onClick={onOpenAddSession}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-2 text-xs font-bold transition shadow-xs active:scale-95 whitespace-nowrap self-start sm:self-auto"
            >
              <Plus className="h-4 w-4" />
              <span>Registrar Clase Impartida</span>
            </button>
          )}
        </div>

        {/* Controles de navegación semanal para la tira de 7 días */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1">
          <div className="flex items-center justify-between sm:justify-start gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => {
                setWeekOffset(prev => prev - 1);
                setSelectedDayIndex(1);
              }}
              className="inline-flex items-center justify-center gap-1 rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition whitespace-nowrap flex-1 sm:flex-initial"
            >
              <ChevronLeft className="h-3.5 w-3.5 shrink-0" />
              <span>Semana anterior</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setWeekOffset(prev => prev + 1);
                setSelectedDayIndex(1);
              }}
              className="inline-flex items-center justify-center gap-1 rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition whitespace-nowrap flex-1 sm:flex-initial sm:order-3"
            >
              <span>Semana siguiente</span>
              <ChevronRight className="h-3.5 w-3.5 shrink-0" />
            </button>
          </div>

          {weekOffset !== 0 && (
            <button
              type="button"
              onClick={() => {
                setWeekOffset(0);
                setSelectedDayIndex(1);
              }}
              className="rounded-xl bg-emerald-500/10 px-3 py-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20 transition whitespace-nowrap self-center"
            >
              Volver a Hoy
            </button>
          )}
        </div>

        {/* LA TIRA DE 7 DÍAS */}
        <div
          onTouchStart={e => e.stopPropagation()}
          onTouchEnd={e => e.stopPropagation()}
          className="flex items-stretch gap-2 overflow-x-auto pt-3 pb-1.5 no-scrollbar sm:grid sm:grid-cols-7 sm:gap-2.5 sm:overflow-visible"
        >
          {sevenDays.map((day, idx) => {
            const isSelected = selectedDayIndex === idx;
            const dayTotalEvents = getEventsForDay(day).length;

            return (
              <button
                key={day.isoDate}
                type="button"
                onClick={() => setSelectedDayIndex(idx)}
                className={`relative flex flex-col items-center justify-center shrink-0 min-w-[60px] flex-1 p-2 sm:p-3 rounded-2xl transition-all active:scale-95 text-center min-h-[82px] sm:min-h-[92px] whitespace-nowrap ${
                  isSelected
                    ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/30 ring-2 ring-emerald-500 ring-offset-2 dark:ring-offset-slate-900'
                    : day.isToday
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200 border-2 border-emerald-500/40 hover:bg-emerald-100/60'
                    : 'bg-slate-50 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                {day.tag && (
                  <span
                    className={`absolute -top-2 rounded-full px-1.5 py-0.5 text-[8px] sm:text-[9px] font-black uppercase tracking-wider whitespace-nowrap ${
                      isSelected
                        ? 'bg-white text-emerald-700 shadow-xs'
                        : day.isToday
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'bg-slate-300 dark:bg-slate-700 text-slate-800 dark:text-slate-200'
                    }`}
                  >
                    {day.tag}
                  </span>
                )}

                <span
                  className={`text-[10px] sm:text-xs font-bold uppercase tracking-wider whitespace-nowrap ${
                    isSelected ? 'text-emerald-100' : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {day.dayName}
                </span>

                <span className="text-base sm:text-2xl font-black mt-0.5 leading-none whitespace-nowrap">
                  {day.dateObj.getDate()}
                </span>

                <span
                  className={`text-[9px] sm:text-[10px] font-medium mt-1 whitespace-nowrap ${
                    isSelected ? 'text-emerald-100' : 'text-slate-400'
                  }`}
                >
                  {day.sublabel.split(' ')[1]}
                </span>

                {dayTotalEvents > 0 && (
                  <span
                    className={`mt-1 inline-flex items-center justify-center rounded-full px-1.5 text-[9px] font-black whitespace-nowrap ${
                      isSelected
                        ? 'bg-white/20 text-white'
                        : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                    }`}
                  >
                    {dayTotalEvents}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* =========================================================================
          SECCIÓN CENTRAL: VISTA DIARIA PARA EL DÍA SELECCIONADO
          ========================================================================= */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                Horario & Actividades para:
              </span>
              <span className="rounded-lg bg-emerald-500/10 px-2.5 py-0.5 text-xs font-black text-emerald-800 dark:text-emerald-300 capitalize">
                {selectedDay.dateObj.toLocaleDateString('es-ES', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric'
                })}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {eventsForSelectedDay.length} actividades o sesiones programadas
            </p>
          </div>
        </div>

        {eventsForSelectedDay.length === 0 ? (
          <div className="py-12 text-center text-xs text-slate-400 space-y-2">
            <Info className="h-8 w-8 mx-auto text-slate-300 dark:text-slate-600" />
            <p className="font-bold text-slate-600 dark:text-slate-300 text-sm">
              No hay actividades ni sesiones programadas para este día
            </p>
            <p>Selecciona otro día de la tira superior para consultar los horarios del centro.</p>
            {onNavigateToActivities && (
              <button
                type="button"
                onClick={onNavigateToActivities}
                className="mt-3 inline-flex items-center gap-1 rounded-xl bg-slate-100 dark:bg-slate-800 px-3 py-1.5 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-200"
              >
                Ver Todas las Actividades
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {eventsForSelectedDay.map(event => (
              <div
                key={event.id}
                className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 hover:border-emerald-500/40 p-4 flex flex-col justify-between gap-3 shadow-xs transition-all"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 text-white px-2.5 py-1 text-xs font-black shadow-xs">
                      <Clock className="h-3.5 w-3.5" />
                      <span>
                        {event.startTime} - {event.endTime}
                      </span>
                    </span>

                    {event.category && (
                      <span className="rounded-md bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold px-2 py-0.5 border border-emerald-500/20 uppercase tracking-wide">
                        {event.category}
                      </span>
                    )}
                  </div>

                  <h4 className="text-sm font-extrabold text-slate-900 dark:text-white leading-tight">
                    {event.title}
                  </h4>

                  {event.description && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-3 whitespace-pre-line">
                      {event.description}
                    </p>
                  )}
                </div>

                <div className="pt-2 border-t border-slate-200/70 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex flex-wrap items-center gap-3 text-slate-600 dark:text-slate-300">
                    {event.teacherName && (
                      <div className="flex items-center gap-1">
                        <User className="h-3.5 w-3.5 text-indigo-500" />
                        <span className="font-semibold">{event.teacherName}</span>
                      </div>
                    )}
                    {event.room && (
                      <div className="flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5 text-slate-400" />
                        <span>{event.room}</span>
                      </div>
                    )}
                  </div>

                  {event.price !== undefined && (
                    <span className="rounded-md bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 text-xs font-black px-2 py-0.5 border border-emerald-500/20">
                      {event.price} € {event.billingMode === 'per_class' ? '/ clase' : '/ mes'}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
