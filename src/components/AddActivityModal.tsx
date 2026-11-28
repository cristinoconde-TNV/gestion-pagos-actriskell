import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useAcademyData } from '../context/AcademyDataContext';
import { Activity } from '../types';
import { createTranslator } from '../lib/i18n';
import { X, Check, Smartphone } from 'lucide-react';

interface AddActivityModalProps {
  isOpen: boolean;
  onClose: () => void;
  activityToEdit?: Activity | null;
  defaultTeacherId?: string;
  lockTeacherSelection?: boolean;
}

const buildDefaultBizumConcept = (activityName: string): string => {
  const trimmed = activityName.trim();
  return trimmed ? `${trimmed} YY-MM-DD` : '';
};

export const AddActivityModal: React.FC<AddActivityModalProps> = ({
  isOpen,
  onClose,
  activityToEdit,
  defaultTeacherId,
  lockTeacherSelection = false
}) => {
  const { language } = useAuth();
  const { teachers, addActivity, updateActivity } = useAcademyData();
  const t = createTranslator(language);

  const [name, setName] = useState(activityToEdit?.name || '');
  const [description, setDescription] = useState(activityToEdit?.description || '');
  const [teacherId, setTeacherId] = useState(
    activityToEdit?.teacherId || defaultTeacherId || ''
  );
  const [category, setCategory] = useState(activityToEdit?.category || 'Música');
  const [billingMode, setBillingMode] = useState<'monthly' | 'per_class'>(
    activityToEdit?.billingMode || 'monthly'
  );
  const [defaultPriceMonthly, setDefaultPriceMonthly] = useState<number>(
    activityToEdit?.defaultPriceMonthly || 50
  );
  const [defaultPricePerClass, setDefaultPricePerClass] = useState<number>(
    activityToEdit?.defaultPricePerClass || 10
  );
  const [bizumEnabled, setBizumEnabled] = useState<boolean>(
    activityToEdit?.bizum_enabled ?? true
  );
  const selectedTeacher = teachers.find(t => t.id === teacherId);
  const [bizumPhone, setBizumPhone] = useState<string>(
    activityToEdit?.bizum_phone || selectedTeacher?.phone || ''
  );
  const [bizumConcept, setBizumConcept] = useState<string>(
    activityToEdit?.bizum_concept?.trim() || buildDefaultBizumConcept(activityToEdit?.name || '')
  );
  const [isBizumConceptCustom, setIsBizumConceptCustom] = useState<boolean>(
    Boolean(
      activityToEdit?.bizum_concept?.trim() &&
        activityToEdit.bizum_concept.trim() !==
          buildDefaultBizumConcept(activityToEdit?.name || '')
    )
  );
  const [room, setRoom] = useState(activityToEdit?.room || 'Sala Principal');
  const [scheduleText, setScheduleText] = useState(
    activityToEdit?.schedule.join(', ') || 'Martes 18:30 - 19:45, Jueves 18:30 - 19:45'
  );
  const [isActiveWorkshop, setIsActiveWorkshop] = useState<boolean>(
    activityToEdit ? activityToEdit.active !== false && activityToEdit.status !== 'inactive' : true
  );

  useEffect(() => {
    if (!isOpen) return;
    const resolvedTeacherId = activityToEdit?.teacherId || defaultTeacherId || '';
    const resolvedTeacher = teachers.find(t => t.id === resolvedTeacherId);
    const initialName = activityToEdit?.name || '';
    const defaultConcept = buildDefaultBizumConcept(initialName);
    const savedConcept = activityToEdit?.bizum_concept?.trim() || '';

    setName(initialName);
    setDescription(activityToEdit?.description || '');
    setTeacherId(resolvedTeacherId);
    setCategory(activityToEdit?.category || 'Música');
    setBillingMode(activityToEdit?.billingMode || 'monthly');
    setDefaultPriceMonthly(activityToEdit?.defaultPriceMonthly ?? 50);
    setDefaultPricePerClass(activityToEdit?.defaultPricePerClass ?? 10);
    setBizumEnabled(activityToEdit?.bizum_enabled ?? true);
    setBizumPhone(activityToEdit?.bizum_phone || resolvedTeacher?.phone || '');
    setBizumConcept(savedConcept || defaultConcept);
    setIsBizumConceptCustom(Boolean(savedConcept && savedConcept !== defaultConcept));
    setRoom(activityToEdit?.room || 'Sala Principal');
    setScheduleText(
      activityToEdit?.schedule.join(', ') || 'Martes 18:30 - 19:45, Jueves 18:30 - 19:45'
    );
    setIsActiveWorkshop(
      activityToEdit ? activityToEdit.active !== false && activityToEdit.status !== 'inactive' : true
    );
  }, [isOpen, activityToEdit, defaultTeacherId, teachers]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !teacherId) return;

    const schedules = scheduleText.split(',').map(s => s.trim()).filter(Boolean);

    const payload = {
      name,
      description,
      teacherId,
      category,
      billingMode,
      defaultPriceMonthly: Number(defaultPriceMonthly),
      defaultPricePerClass: Number(defaultPricePerClass),
      bizum_enabled: bizumEnabled,
      bizum_phone: bizumEnabled ? bizumPhone.trim() : undefined,
      bizum_concept: bizumEnabled
        ? bizumConcept.trim() || buildDefaultBizumConcept(name)
        : undefined,
      room,
      schedule: schedules
    };

    if (activityToEdit) {
      updateActivity(activityToEdit.id, {
        ...payload,
        active: isActiveWorkshop,
        status: isActiveWorkshop ? 'active' : 'inactive'
      });
    } else {
      addActivity({
        ...payload,
        color: 'emerald',
        active: true,
        status: 'active'
      });
    }

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/70 p-0 sm:p-4 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl bg-white dark:bg-slate-900 shadow-2xl border border-slate-200 dark:border-slate-800 max-h-[92dvh] sm:max-h-[88vh] flex flex-col overflow-hidden">
        
        {/* Cabecera Fija con botón táctil de 44px */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md shrink-0">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white leading-tight">
              {activityToEdit ? t('addActivityModal.editTitle') : t('addActivityModal.newTitle')}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t('addActivityModal.subtitle')}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('addActivityModal.closeAria')}
            className="flex h-11 w-11 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200 transition touch-manipulation active:scale-95"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Formulario con cuerpo escroleable independiente */}
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto overscroll-contain p-5 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                {t('addActivityModal.nameLabel')}
              </label>
              <input
                type="text"
                required
                placeholder={t('addActivityModal.namePlaceholder')}
                value={name}
                onChange={e => {
                  const nextName = e.target.value;
                  setName(nextName);
                  if (!isBizumConceptCustom) {
                    setBizumConcept(buildDefaultBizumConcept(nextName));
                  }
                }}
                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2.5 text-base sm:text-sm text-slate-800 dark:text-slate-200 focus:outline-emerald-500"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div className="sm:col-span-3">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {t('addActivityModal.teacherLabel')}
                </label>
                <select
                  value={teacherId}
                  disabled={lockTeacherSelection}
                  onChange={e => {
                    const nextTeacherId = e.target.value;
                    const prevTeacher = teachers.find(item => item.id === teacherId);
                    const selected = teachers.find(item => item.id === nextTeacherId);
                    setTeacherId(nextTeacherId);
                    if (!bizumPhone.trim() || (prevTeacher?.phone && bizumPhone === prevTeacher.phone)) {
                      setBizumPhone(selected?.phone || '');
                    }
                  }}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2.5 text-base sm:text-sm text-slate-800 dark:text-slate-200 focus:outline-emerald-500 font-semibold disabled:opacity-75 disabled:cursor-not-allowed"
                >
                  {!teacherId && <option value="">—</option>}
                  {teachers.map(teacherItem => (
                    <option key={teacherItem.id} value={teacherItem.id}>
                      {teacherItem.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-1">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {t('addActivityModal.categoryLabel')}
                </label>
                <select
                  value={category}
                  onChange={e => setCategory(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2.5 text-base sm:text-sm text-slate-800 dark:text-slate-200 focus:outline-emerald-500"
                >
                  <option value="Música">{t('addActivityModal.categories.Música')}</option>
                  <option value="Idiomas">{t('addActivityModal.categories.Idiomas')}</option>
                  <option value="Danza">{t('addActivityModal.categories.Danza')}</option>
                  <option value="Arte">{t('addActivityModal.categories.Arte')}</option>
                  <option value="Yoga">{t('addActivityModal.categories.Yoga')}</option>
                  <option value="Pilates">{t('addActivityModal.categories.Pilates')}</option>
                  <option value="Otro">{t('addActivityModal.categories.Otro')}</option>
                </select>
              </div>
            </div>

            {/* Modalidad de cobro (excluyente: interruptor + precio en la misma línea) */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3.5 bg-slate-50/50 dark:bg-slate-800/40 space-y-2.5">
              <label className="block text-xs font-bold text-slate-900 dark:text-white">
                {t('addActivityModal.billingModeLabel')}
              </label>

              {/* Línea 1: [Cobro Cuota Mensual] (Interruptor) + [Precio Mensual] (Input) */}
              <div
                className={`flex items-center justify-between gap-2.5 rounded-xl border px-3 py-2 transition ${
                  billingMode === 'monthly'
                    ? 'border-emerald-500/60 bg-emerald-50/70 dark:bg-emerald-950/25 shadow-xs'
                    : 'border-slate-200 dark:border-slate-700/80 bg-white/70 dark:bg-slate-900/50 opacity-75'
                }`}
              >
                <button
                  type="button"
                  role="switch"
                  aria-checked={billingMode === 'monthly'}
                  onClick={() => setBillingMode('monthly')}
                  className="flex items-center gap-2.5 min-w-0 flex-1 text-left cursor-pointer"
                >
                  <span
                    className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                      billingMode === 'monthly'
                        ? 'bg-emerald-600'
                        : 'bg-slate-300 dark:bg-slate-700'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-xs transition-transform ${
                        billingMode === 'monthly' ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </span>
                  <span
                    className={`text-xs font-bold truncate ${
                      billingMode === 'monthly'
                        ? 'text-slate-900 dark:text-white'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {t('addActivityModal.billingMonthlyToggle')}
                  </span>
                </button>

                <div className="flex items-center gap-1.5 shrink-0">
                  <label
                    htmlFor="activity-monthly-price"
                    className="hidden sm:inline text-[11px] font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap"
                  >
                    {t('addActivityModal.priceMonthlyShortLabel')}
                  </label>
                  <div className="relative w-24 sm:w-28">
                    <input
                      id="activity-monthly-price"
                      type="number"
                      step="1"
                      min="0"
                      disabled={billingMode !== 'monthly'}
                      aria-label={t('addActivityModal.priceMonthlyLabel')}
                      value={defaultPriceMonthly}
                      onChange={e => setDefaultPriceMonthly(Number(e.target.value))}
                      className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 pr-8 pl-2.5 py-1.5 text-sm font-bold text-slate-900 dark:text-white focus:outline-emerald-500 text-right disabled:bg-slate-100 dark:disabled:bg-slate-800 disabled:text-slate-400 disabled:cursor-not-allowed"
                    />
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] font-bold text-slate-400 pointer-events-none">
                      {t('addActivityModal.priceMonthlyUnit')}
                    </span>
                  </div>
                </div>
              </div>

              {/* Línea 2: [Pago por Clase] (Interruptor) + [Precio por Clase] (Input) */}
              <div
                className={`flex items-center justify-between gap-2.5 rounded-xl border px-3 py-2 transition ${
                  billingMode === 'per_class'
                    ? 'border-emerald-500/60 bg-emerald-50/70 dark:bg-emerald-950/25 shadow-xs'
                    : 'border-slate-200 dark:border-slate-700/80 bg-white/70 dark:bg-slate-900/50 opacity-75'
                }`}
              >
                <button
                  type="button"
                  role="switch"
                  aria-checked={billingMode === 'per_class'}
                  onClick={() => setBillingMode('per_class')}
                  className="flex items-center gap-2.5 min-w-0 flex-1 text-left cursor-pointer"
                >
                  <span
                    className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                      billingMode === 'per_class'
                        ? 'bg-emerald-600'
                        : 'bg-slate-300 dark:bg-slate-700'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-xs transition-transform ${
                        billingMode === 'per_class' ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </span>
                  <span
                    className={`text-xs font-bold truncate ${
                      billingMode === 'per_class'
                        ? 'text-slate-900 dark:text-white'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {t('addActivityModal.billingPerClassToggle')}
                  </span>
                </button>

                <div className="flex items-center gap-1.5 shrink-0">
                  <label
                    htmlFor="activity-perclass-price"
                    className="hidden sm:inline text-[11px] font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap"
                  >
                    {t('addActivityModal.pricePerClassShortLabel')}
                  </label>
                  <div className="relative w-24 sm:w-28">
                    <input
                      id="activity-perclass-price"
                      type="number"
                      step="0.5"
                      min="0"
                      disabled={billingMode !== 'per_class'}
                      aria-label={t('addActivityModal.pricePerClassLabel')}
                      value={defaultPricePerClass}
                      onChange={e => setDefaultPricePerClass(Number(e.target.value))}
                      className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 pr-8 pl-2.5 py-1.5 text-sm font-bold text-slate-900 dark:text-white focus:outline-emerald-500 text-right disabled:bg-slate-100 dark:disabled:bg-slate-800 disabled:text-slate-400 disabled:cursor-not-allowed"
                    />
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] font-bold text-slate-400 pointer-events-none">
                      {t('addActivityModal.pricePerClassUnit')}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Configuración de Bizum para este taller */}
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-50/40 dark:bg-emerald-950/20 p-3.5 space-y-3">
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={bizumEnabled}
                  onChange={e => {
                    const checked = e.target.checked;
                    setBizumEnabled(checked);
                    if (checked && !bizumConcept.trim() && name.trim()) {
                      setBizumConcept(buildDefaultBizumConcept(name));
                      setIsBizumConceptCustom(false);
                    }
                  }}
                  className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
                <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Smartphone className="h-3.5 w-3.5 text-emerald-600" />
                  {t('addActivityModal.bizumEnableCheckbox')}
                </span>
              </label>

              {bizumEnabled && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pl-6 pt-1">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      {t('addActivityModal.bizumPhoneLabel')}
                    </label>
                    <input
                      type="tel"
                      required={bizumEnabled}
                      placeholder={t('addActivityModal.bizumPhonePlaceholder')}
                      value={bizumPhone}
                      onChange={e => setBizumPhone(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-800 dark:text-slate-200"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      {t('addActivityModal.bizumConceptLabel')}
                    </label>
                    <input
                      type="text"
                      placeholder={t('addActivityModal.bizumConceptPlaceholder')}
                      value={bizumConcept}
                      onChange={e => {
                        const val = e.target.value;
                        setBizumConcept(val);
                        setIsBizumConceptCustom(val.trim() !== '' && val !== buildDefaultBizumConcept(name));
                      }}
                      className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs text-slate-800 dark:text-slate-200"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {t('addActivityModal.roomLabel')}
                </label>
                <input
                  type="text"
                  placeholder={t('addActivityModal.roomPlaceholder')}
                  value={room}
                  onChange={e => setRoom(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-emerald-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {t('addActivityModal.scheduleLabel')}
                </label>
                <input
                  type="text"
                  placeholder={t('addActivityModal.schedulePlaceholder')}
                  value={scheduleText}
                  onChange={e => setScheduleText(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-emerald-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                {t('addActivityModal.descriptionLabel')}
              </label>
              <textarea
                rows={2}
                placeholder={t('addActivityModal.descriptionPlaceholder')}
                value={description}
                onChange={e => setDescription(e.target.value)}
                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-emerald-500"
              />
            </div>

            {activityToEdit && (
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/40 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div>
                  <span className="block text-xs font-bold text-slate-800 dark:text-slate-200">
                    {t('addActivityModal.workshopStatusLabel')}
                  </span>
                  <span className="block text-[11px] text-slate-500 dark:text-slate-400">
                    {isActiveWorkshop
                      ? t('addActivityModal.workshopStatusOngoingHint')
                      : t('addActivityModal.workshopStatusFinishedHint')}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => setIsActiveWorkshop(true)}
                    className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                      isActiveWorkshop
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {t('addActivityModal.workshopStatusOngoing')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsActiveWorkshop(false)}
                    className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                      !isActiveWorkshop
                        ? 'bg-amber-600 text-white shadow-xs'
                        : 'border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {t('addActivityModal.workshopStatusFinished')}
                  </button>
                </div>
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
              {t('addActivityModal.cancel')}
            </button>
            <button
              type="submit"
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-emerald-700 shadow-md shadow-emerald-600/20 transition min-h-[44px]"
            >
              <Check className="h-4 w-4" />
              <span>{activityToEdit ? t('addActivityModal.updateButton') : t('addActivityModal.createButton')}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
