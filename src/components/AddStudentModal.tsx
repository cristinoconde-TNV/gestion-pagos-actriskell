import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { MemberType, Student, StudentStatus } from '../types';
import { X, Check, AlertCircle, History, Plus, Trash2 } from 'lucide-react';

interface AddStudentModalProps {
  isOpen: boolean;
  onClose: () => void;
  studentToEdit?: Student | null;
}

export const AddStudentModal: React.FC<AddStudentModalProps> = ({ isOpen, onClose, studentToEdit }) => {
  const {
    activities,
    addStudent,
    updateStudent,
    currentRole,
    memberStatusHistory,
    addStatusHistoryEntry,
    deleteStatusHistoryEntry
  } = useApp();
  const isTeacherRole = currentRole === 'teacher' || currentRole === 'teacher_student';
  const defaultNewStatus: StudentStatus = isTeacherRole ? 'pending_validation' : 'active';
  const todayDefault = new Date().toISOString().split('T')[0];

  const [name, setName] = useState(studentToEdit?.name || '');
  const [email, setEmail] = useState(studentToEdit?.email || '');
  const [phone, setPhone] = useState(studentToEdit?.phone || '');
  const [status, setStatus] = useState<StudentStatus>(studentToEdit?.status || defaultNewStatus);
  const [memberNumber, setMemberNumber] = useState(studentToEdit?.memberNumber || '');
  const [memberType, setMemberType] = useState<MemberType>(studentToEdit?.memberType || 'socio');
  const [startDate, setStartDate] = useState(
    studentToEdit?.startDate || studentToEdit?.registeredAt || todayDefault
  );
  const [endDate, setEndDate] = useState(studentToEdit?.endDate || '');
  const [notes, setNotes] = useState(studentToEdit?.notes || '');
  const [selectedActivityIds, setSelectedActivityIds] = useState<string[]>(
    studentToEdit?.activities.map(a => a.activityId) || []
  );
  const [customPrices, setCustomPrices] = useState<Record<string, number>>(
    studentToEdit?.activities?.reduce((acc, a) => {
      if (a.customPrice !== undefined) acc[a.activityId] = a.customPrice;
      return acc;
    }, {} as Record<string, number>) || {}
  );
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Nuevo ciclo manual en historial de estados
  const [showAddCycle, setShowAddCycle] = useState(false);
  const [cycleStatus, setCycleStatus] = useState<'active' | 'inactive' | 'pending_validation' | 'trial'>('active');
  const [cycleMemberType, setCycleMemberType] = useState<MemberType>('socio');
  const [cycleStart, setCycleStart] = useState(todayDefault);
  const [cycleEnd, setCycleEnd] = useState('');
  const [cycleNotes, setCycleNotes] = useState('');
  const [isAddingCycle, setIsAddingCycle] = useState(false);

  const studentHistory = useMemo(
    () =>
      studentToEdit
        ? memberStatusHistory.filter(
            h => h.entityType === 'student' && h.entityId === studentToEdit.id
          )
        : [],
    [memberStatusHistory, studentToEdit]
  );

  useEffect(() => {
    if (!isOpen) return;
    const today = new Date().toISOString().split('T')[0];
    setName(studentToEdit?.name || '');
    setEmail(studentToEdit?.email || '');
    setPhone(studentToEdit?.phone || '');
    setStatus(studentToEdit?.status || defaultNewStatus);
    setMemberNumber(studentToEdit?.memberNumber || '');
    setMemberType(studentToEdit?.memberType || 'socio');
    setStartDate(studentToEdit?.startDate || studentToEdit?.registeredAt || today);
    setEndDate(studentToEdit?.endDate || '');
    setNotes(studentToEdit?.notes || '');
    setSelectedActivityIds(studentToEdit?.activities.map(a => a.activityId) || []);
    setCustomPrices(
      studentToEdit?.activities?.reduce((acc, a) => {
        if (a.customPrice !== undefined) acc[a.activityId] = a.customPrice;
        return acc;
      }, {} as Record<string, number>) || {}
    );
    setIsSaving(false);
    setErrorMsg(null);
    setShowAddCycle(false);
    setCycleStart(today);
    setCycleEnd('');
    setCycleNotes('');
  }, [isOpen, studentToEdit, defaultNewStatus]);

  if (!isOpen) return null;

  const toggleActivity = (actId: string) => {
    setSelectedActivityIds(prev =>
      prev.includes(actId) ? prev.filter(id => id !== actId) : [...prev, actId]
    );
  };

  const handleAddCycle = async () => {
    if (!studentToEdit || !cycleStart || isAddingCycle) return;
    setIsAddingCycle(true);
    setErrorMsg(null);
    try {
      const res = await addStatusHistoryEntry({
        entityType: 'student',
        entityId: studentToEdit.id,
        status: cycleStatus,
        memberType: cycleMemberType,
        startDate: cycleStart,
        endDate: cycleEnd || undefined,
        notes: cycleNotes.trim() || undefined
      });
      if (!res.success) {
        setErrorMsg(res.error || 'No se pudo registrar el ciclo en el historial.');
        return;
      }
      setShowAddCycle(false);
      setCycleEnd('');
      setCycleNotes('');
    } finally {
      setIsAddingCycle(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || isSaving) return;

    setIsSaving(true);
    setErrorMsg(null);

    const todayStr = new Date().toISOString().split('T')[0];
    const enrolledList = selectedActivityIds.map(actId => {
      const existing = studentToEdit?.activities.find(a => a.activityId === actId);
      const activityInfo = activities.find(a => a.id === actId);
      return {
        activityId: actId,
        customPrice: customPrices[actId] !== undefined ? Number(customPrices[actId]) : undefined,
        enrolledSince: existing?.enrolledSince || todayStr,
        billingMode: existing?.billingMode || activityInfo?.billingMode || ('monthly' as const)
      };
    });

    const cleanedNotes =
      status === 'pending_validation'
        ? notes.trim()
        : notes.replace(/\[Pendiente validación\]/gi, '').trim();

    try {
      const res = studentToEdit
        ? await updateStudent(studentToEdit.id, {
            name: name.trim(),
            email: email.trim(),
            phone: phone.trim(),
            status,
            memberNumber: memberNumber.trim() || undefined,
            memberType,
            startDate: startDate || undefined,
            endDate: endDate || undefined,
            notes: cleanedNotes,
            activities: enrolledList
          })
        : await addStudent({
            name: name.trim(),
            email: email.trim(),
            phone: phone.trim(),
            status,
            memberNumber: memberNumber.trim() || undefined,
            memberType,
            startDate: startDate || todayStr,
            endDate: endDate || undefined,
            activities: enrolledList,
            notes: cleanedNotes
          });

      if (!res.success) {
        setErrorMsg(res.error || 'No se pudieron guardar los cambios en la base de datos.');
        return;
      }

      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Error inesperado al guardar la ficha.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/70 p-0 sm:p-4 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl bg-white dark:bg-slate-900 shadow-2xl border border-slate-200 dark:border-slate-800 max-h-[92dvh] sm:max-h-[88vh] flex flex-col overflow-hidden">
        
        {/* Cabecera Fija con botón táctil de 44px */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md shrink-0">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white leading-tight">
              {studentToEdit ? 'Editar Ficha de Alumno / Socio' : 'Nuevo Alumno / Socio'}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Datos de contacto, alta/baja, historial y talleres
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar ventana"
            className="flex h-11 w-11 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200 transition touch-manipulation active:scale-95"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Formulario con cuerpo escroleable */}
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto overscroll-contain p-5 space-y-4">
            {errorMsg && (
              <div className="rounded-xl border border-rose-300 bg-rose-50 dark:border-rose-800 dark:bg-rose-950/40 px-3 py-2.5 text-xs text-rose-800 dark:text-rose-200 flex items-start gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span className="font-semibold">{errorMsg}</span>
              </div>
            )}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Nombre Completo *
              </label>
              <input
                type="text"
                required
                placeholder="Ej. Lucía Fernández Ramos"
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2.5 text-base sm:text-sm text-slate-800 dark:text-slate-200 focus:outline-emerald-500"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Teléfono móvil (WhatsApp)
                </label>
                <input
                  type="tel"
                  placeholder="+34 600 000 000"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2.5 text-base sm:text-sm text-slate-800 dark:text-slate-200 focus:outline-emerald-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Correo Electrónico
                </label>
                <input
                  type="email"
                  placeholder="ejemplo@correo.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2.5 text-base sm:text-sm text-slate-800 dark:text-slate-200 focus:outline-emerald-500"
                />
              </div>
            </div>

            {/* Datos de socio, estado y fechas */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Estado
                </label>
                <select
                  value={status}
                  onChange={e => setStatus(e.target.value as StudentStatus)}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2.5 text-base sm:text-sm text-slate-800 dark:text-slate-200 focus:outline-emerald-500 font-semibold"
                >
                  <option value="active">Activo / Confirmado</option>
                  <option value="trial">En prueba</option>
                  <option value="pending_validation">Pendiente de validación</option>
                  <option value="inactive">Baja / Inactivo</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Tipo de Miembro
                </label>
                <select
                  value={memberType}
                  onChange={e => setMemberType(e.target.value as MemberType)}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2.5 text-base sm:text-sm text-slate-800 dark:text-slate-200 focus:outline-emerald-500 font-semibold"
                >
                  <option value="socio">Socio</option>
                  <option value="alumno_no_socio">Alumno no socio</option>
                  <option value="monitor_no_socio">Monitor no socio</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Nº de Socio
                </label>
                <input
                  type="text"
                  placeholder="Ej. S-0142"
                  value={memberNumber}
                  onChange={e => setMemberNumber(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm font-mono text-slate-800 dark:text-slate-200 focus:outline-emerald-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Fecha de Alta
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-emerald-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Fecha de Baja
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-emerald-500"
                />
              </div>
            </div>

            {/* Historial de Estados / Reincorporaciones (solo al editar) */}
            {studentToEdit && (
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/30 p-3 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-200">
                    <History className="h-3.5 w-3.5 text-emerald-600" />
                    <span>Historial de Estados / Ciclos ({studentHistory.length})</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowAddCycle(v => !v)}
                    className="inline-flex items-center gap-1 rounded-lg bg-emerald-600/10 px-2 py-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-600/20 transition"
                  >
                    <Plus className="h-3 w-3" />
                    <span>{showAddCycle ? 'Cerrar' : 'Añadir ciclo'}</span>
                  </button>
                </div>

                {showAddCycle && (
                  <div className="rounded-lg border border-emerald-500/30 bg-white dark:bg-slate-900 p-2.5 space-y-2 text-xs">
                    <div className="grid grid-cols-2 gap-2">
                      <select
                        value={cycleStatus}
                        onChange={e =>
                          setCycleStatus(
                            e.target.value as 'active' | 'inactive' | 'pending_validation' | 'trial'
                          )
                        }
                        className="rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1.5 font-semibold"
                      >
                        <option value="active">Alta / Activo</option>
                        <option value="inactive">Baja / Inactivo</option>
                        <option value="trial">En prueba</option>
                        <option value="pending_validation">Pendiente validar</option>
                      </select>
                      <select
                        value={cycleMemberType}
                        onChange={e => setCycleMemberType(e.target.value as MemberType)}
                        className="rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1.5 font-semibold"
                      >
                        <option value="socio">Socio</option>
                        <option value="alumno_no_socio">Alumno no socio</option>
                        <option value="monitor_no_socio">Monitor no socio</option>
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="date"
                        value={cycleStart}
                        onChange={e => setCycleStart(e.target.value)}
                        className="rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1.5"
                      />
                      <input
                        type="date"
                        value={cycleEnd}
                        onChange={e => setCycleEnd(e.target.value)}
                        placeholder="Fecha fin"
                        className="rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1.5"
                      />
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Motivo o notas del ciclo (opcional)"
                        value={cycleNotes}
                        onChange={e => setCycleNotes(e.target.value)}
                        className="flex-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1.5"
                      />
                      <button
                        type="button"
                        disabled={isAddingCycle}
                        onClick={handleAddCycle}
                        className="rounded-lg bg-emerald-600 px-3 py-1.5 font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                      >
                        {isAddingCycle ? '...' : 'Guardar'}
                      </button>
                    </div>
                  </div>
                )}

                {studentHistory.length === 0 ? (
                  <p className="text-[11px] text-slate-400 italic">
                    Sin ciclos históricos registrados todavía. Se registrarán automáticamente al cambiar entre activo y baja.
                  </p>
                ) : (
                  <div className="divide-y divide-slate-200/70 dark:divide-slate-700/60 max-h-36 overflow-y-auto text-[11px]">
                    {studentHistory.map(h => (
                      <div key={h.id} className="py-1.5 flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <span
                            className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold mr-1.5 ${
                              h.status === 'active'
                                ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                                : h.status === 'inactive'
                                ? 'bg-slate-500/15 text-slate-600 dark:text-slate-400'
                                : 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                            }`}
                          >
                            {h.status === 'active'
                              ? 'Activo'
                              : h.status === 'inactive'
                              ? 'Baja'
                              : h.status === 'trial'
                              ? 'Prueba'
                              : 'Pendiente'}
                          </span>
                          <span className="font-semibold text-slate-700 dark:text-slate-200 tabular-nums">
                            {h.startDate} {h.endDate ? `→ ${h.endDate}` : '(vigente)'}
                          </span>
                          {h.notes && (
                            <span className="block text-slate-500 dark:text-slate-400 truncate">
                              {h.notes}
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => deleteStatusHistoryEntry(h.id)}
                          title="Eliminar registro histórico"
                          className="p-1 text-slate-400 hover:text-rose-600 shrink-0"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Actividades inscritas */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Actividades en las que se inscribe
              </label>
              <div className="space-y-2 border border-slate-200 dark:border-slate-800 rounded-xl p-3 bg-slate-50/50 dark:bg-slate-800/30">
                {activities.map(act => {
                  const isSelected = selectedActivityIds.includes(act.id);
                  return (
                    <div
                      key={act.id}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 rounded-xl bg-white dark:bg-slate-800/80 border border-slate-200/60 dark:border-slate-700/60"
                    >
                      <label className="flex items-center gap-2.5 cursor-pointer text-xs font-medium text-slate-800 dark:text-slate-200 min-h-[32px]">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleActivity(act.id)}
                          className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                        />
                        <span className="font-semibold">{act.name}</span>
                        <span className="text-slate-400">({act.defaultPriceMonthly}€/mes)</span>
                      </label>

                      {isSelected && (
                        <div className="flex items-center gap-1.5 text-xs pl-6 sm:pl-0">
                          <span className="text-slate-400 text-[11px]">Tarifa:</span>
                          <div className="relative">
                            <input
                              type="number"
                              placeholder={String(act.defaultPriceMonthly)}
                              value={customPrices[act.id] !== undefined ? customPrices[act.id] : ''}
                              onChange={e => {
                                const val = e.target.value ? Number(e.target.value) : undefined;
                                setCustomPrices(prev => {
                                  const copy = { ...prev };
                                  if (val !== undefined) copy[act.id] = val;
                                  else delete copy[act.id];
                                  return copy;
                                });
                              }}
                              className="w-20 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 pr-5 pl-2 py-1 text-xs text-right font-bold text-slate-900 dark:text-white"
                            />
                            <span className="absolute right-1.5 top-1 text-[11px] font-bold text-slate-400 pointer-events-none">€</span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Observaciones o notas
              </label>
              <textarea
                rows={2}
                placeholder="Ej. Lesión leve en hombro, avisó que los jueves se incorpora 10 min tarde..."
                value={notes}
                onChange={e => setNotes(e.target.value)}
                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-emerald-500"
              />
            </div>
          </div>

          {/* Barra Inferior Fija: Siempre a la vista */}
          <div className="sticky bottom-0 z-10 px-5 py-3 border-t border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md flex items-center justify-end gap-3 shrink-0 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <button
              type="button"
              disabled={isSaving}
              onClick={onClose}
              className="flex-1 sm:flex-none rounded-xl border border-slate-300 dark:border-slate-700 px-4 py-2.5 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition min-h-[44px] flex items-center justify-center disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-emerald-700 shadow-md shadow-emerald-600/20 transition min-h-[44px] disabled:opacity-60"
            >
              <Check className="h-4 w-4" />
              <span>
                {isSaving
                  ? 'Guardando...'
                  : studentToEdit
                  ? 'Actualizar Ficha'
                  : 'Registrar Alumno / Socio'}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
