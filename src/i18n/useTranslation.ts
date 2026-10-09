import { useLanguage } from '../documents/editor/EditorContext';

import { t as tBase } from './index';

/**
 * React hook for translations
 * Reads the current language from the zustand store and re-renders when it changes
 */
export function useTranslation() {
  const language = useLanguage();

  const t = (key: string, params?: Record<string, string | number>): string => {
    return tBase(key, params, language);
  };

  return { t, language };
}

