import * as React from "react";

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
  const [content, setContent] = React.useState<RightSidebarContent>("queue");
  const [annotationsData, setAnnotationsData] = React.useState<any>(null);

  const toggleRightSidebar = React.useCallback(() => {
    setOpen((prev) => !prev);
  }, []);

  const value = React.useMemo(
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

