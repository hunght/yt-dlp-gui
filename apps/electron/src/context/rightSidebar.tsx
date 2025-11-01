import * as React from "react";

type RightSidebarContext = {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggleRightSidebar: () => void;
};

const RightSidebarContext = React.createContext<RightSidebarContext | null>(null);

export function useRightSidebar() {
  const context = React.useContext(RightSidebarContext);
  if (!context) {
    throw new Error("useRightSidebar must be used within a RightSidebarProvider.");
  }
  return context;
}

export function RightSidebarProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(true);

  const toggleRightSidebar = React.useCallback(() => {
    setOpen((prev) => !prev);
  }, []);

  const value = React.useMemo(
    () => ({
      open,
      setOpen,
      toggleRightSidebar,
    }),
    [open, toggleRightSidebar]
  );

  return <RightSidebarContext.Provider value={value}>{children}</RightSidebarContext.Provider>;
}

