import { useEffect } from 'react';

/**
 * Custom hook to set document title dynamically.
 * Automatically appends " | SmartConfirm" suffix.
 */
export function useDocumentTitle(title: string) {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = `${title} | SmartConfirm`;

    return () => {
      document.title = previousTitle;
    };
  }, [title]);
}
