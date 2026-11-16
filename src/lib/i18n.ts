import { AppLanguage } from '../types';
import esLocale from '../locales/es.json';
import glLocale from '../locales/gl.json';
import enLocale from '../locales/en.json';

export const LANGUAGE_OPTIONS: ReadonlyArray<{
  code: AppLanguage;
  label: string;
  nativeName: string;
}> = [
  { code: 'es', label: 'Castellano', nativeName: 'Castellano' },
  { code: 'gl', label: 'Galego', nativeName: 'Galego' },
  { code: 'en', label: 'Inglés', nativeName: 'Inglés' }
];

export const normalizeAppLanguage = (raw?: string | null): AppLanguage => {
  const val = (raw || '').trim().toLowerCase();
  if (val === 'gl' || val.startsWith('gl-')) return 'gl';
  if (val === 'en' || val.startsWith('en-')) return 'en';
  return 'es';
};

export type LocaleDictionary = typeof esLocale;

type NestedKeyOf<ObjectType extends Record<string, unknown>> = {
  [Key in keyof ObjectType & string]: ObjectType[Key] extends Record<string, unknown>
    ? `${Key}.${NestedKeyOf<ObjectType[Key]>}`
    : `${Key}`;
}[keyof ObjectType & string];

export type TranslationKey = NestedKeyOf<LocaleDictionary>;

const LOCALES: Partial<Record<AppLanguage, LocaleDictionary>> = {
  es: esLocale,
  gl: glLocale
};

const getByPath = (obj: unknown, path: string): string | undefined => {
  if (!obj || typeof obj !== 'object') return undefined;
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (!current || typeof current !== 'object' || !(part in current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === 'string' ? current : undefined;
};

const interpolate = (
  template: string,
  vars?: Record<string, string | number>
): string => {
  if (!vars) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (_, token: string) =>
    vars[token] !== undefined ? String(vars[token]) : `{{${token}}}`
  );
};

export const translate = (
  lang: AppLanguage | undefined,
  key: TranslationKey,
  vars?: Record<string, string | number>
): string => {
  const resolvedLang = normalizeAppLanguage(lang);
  const candidate = LOCALES[resolvedLang];
  const localizedValue = candidate ? getByPath(candidate, key) : undefined;
  const fallbackValue = getByPath(esLocale, key);

  const template =
    localizedValue && localizedValue.length > 0
      ? localizedValue
      : fallbackValue ?? key;

  return interpolate(template, vars);
};

export const createTranslator =
  (lang?: AppLanguage) =>
  (key: TranslationKey, vars?: Record<string, string | number>): string =>
    translate(lang, key, vars);

export type NavTranslations = LocaleDictionary['nav'];

export const getNavTexts = (lang?: AppLanguage): NavTranslations => {
  const keys = Object.keys(esLocale.nav) as Array<keyof NavTranslations>;
  const result = {} as NavTranslations;
  for (const k of keys) {
    result[k] = translate(lang, `nav.${k}` as TranslationKey);
  }
  return result;
};
