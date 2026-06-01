import React, { createContext, useMemo, useState } from 'react';

// eslint-disable-next-line react-refresh/only-export-components
export const SearchUICtx = createContext(null);

export function SearchUIProvider({ children }) {
  const [isOpen, setOpen] = useState(false);

  const api = useMemo(() => ({
    isOpen,
    open: () => setOpen(true),
    close: () => setOpen(false),
    toggle: () => setOpen(v => !v)
  }), [isOpen]);

  return <SearchUICtx.Provider value={api}>{children}</SearchUICtx.Provider>;
}
