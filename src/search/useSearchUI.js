import { useContext } from 'react';
import { SearchUICtx } from './SearchUIContext';

export function useSearchUI() {
  const ctx = useContext(SearchUICtx);
  if (!ctx) throw new Error('useSearchUI must be used within <SearchUIProvider>');
  return ctx;
}
