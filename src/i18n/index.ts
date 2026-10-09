import en from './locales/en.json';

export type Language = 'en';

const translations: Record<Language, Record<string, any>> = {
  en,
};

/**
 * Translation function
 * @param key Translation key, supports nested paths such as 'common.emailBuilder'
 * @param params Replacement params, e.g. { id: '123' } replaces {{id}}
 * @param language Optional language; read from the store if omitted
 * @returns The translated text
 */
export function t(key: string, params?: Record<string, string | number>, language?: Language): string {
  // Fall back to getLanguage() when no language is passed (non-React callers)
  const lang = language ?? getLanguage();
  const keys = key.split('.');
  let value: any = translations[lang];

  for (const k of keys) {
    if (value && typeof value === 'object' && k in value) {
      value = value[k];
    } else {
      // Return the key itself when no translation exists
      return key;
    }
  }

  if (typeof value !== 'string') {
    return key;
  }

  // Substitute params
  if (params) {
    return value.replace(/\{\{(\w+)\}\}/g, (match, paramKey) => {
      return params[paramKey]?.toString() ?? match;
    });
  }

  return value;
}

/**
 * Get the current language
 */
export function getLanguage(): Language {
  return 'en';
}

/**
 * Set the language (updates localStorage only)
 */
export function setLanguage(lang: Language) {
  if (typeof window !== 'undefined') {
    localStorage.setItem('app-language', lang);
  }
}

