import React, { createContext, useContext, useState, useCallback, useMemo } from "react";

type RightSidebarContent = "queue" | "annotations" | null;

type RightSidebarContext = {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggleRightSidebar: () => void;
  content: RightSidebarContent;
  setContent: (content: RightSidebarContent) => void;
  annotationsData?: any; // Will hold annotations-specific data
  setAnnotationsData: (data: any) => void;
};

const RightSidebarContext = createContext<RightSidebarContext | null>(null);

export function useRightSidebar() {
  const context = useContext(RightSidebarContext);
  if (!context) {
    throw new Error("useRightSidebar must be used within a RightSidebarProvider.");
  }
  return context;
}

export function RightSidebarProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  const [content, setContent] = useState<RightSidebarContent>("queue");
  const [annotationsData, setAnnotationsData] = useState<any>(null);

  const toggleRightSidebar = useCallback(() => {
    setOpen((prev) => !prev);
  }, []);

  const value = useMemo(
    () => ({
      open,
      setOpen,
      toggleRightSidebar,
      content,
      setContent,
      annotationsData,
      setAnnotationsData,
    }),
    [open, toggleRightSidebar, content, annotationsData]
  );

  return <RightSidebarContext.Provider value={value}>{children}</RightSidebarContext.Provider>;
}

