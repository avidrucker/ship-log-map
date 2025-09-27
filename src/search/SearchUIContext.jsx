import React, { createContext, useContext, useMemo, useState, useCallback } from 'react';

const Ctx = createContext(null);

export function SearchUIProvider({ children }) {
  const [isOpen, setOpen] = useState(false);

  const api = useMemo(() => ({
    isOpen,
    open: () => setOpen(true),
    close: () => setOpen(false),
    toggle: () => setOpen(v => !v)
  }), [isOpen]);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useSearchUI() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useSearchUI must be used within <SearchUIProvider>');
  return ctx;
}
