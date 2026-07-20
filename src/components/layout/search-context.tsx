"use client";

import { createContext, useCallback, useContext, useMemo, useState, ReactNode } from "react";

interface SearchContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  openSearch: () => void;
}

const SearchContext = createContext<SearchContextValue>({
  open: false,
  setOpen: () => {},
  openSearch: () => {},
});

export function SearchProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const openSearch = useCallback(() => setOpen(true), []);
  const value = useMemo(() => ({ open, setOpen, openSearch }), [open, openSearch]);
  return <SearchContext.Provider value={value}>{children}</SearchContext.Provider>;
}

export function useSearch() {
  return useContext(SearchContext);
}
