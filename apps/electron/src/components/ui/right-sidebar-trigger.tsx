import * as React from "react";
import { PanelRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useRightSidebar } from "@/context/rightSidebar";

export const RightSidebarTrigger = React.forwardRef<
  React.ElementRef<typeof Button>,
  React.ComponentProps<typeof Button>
>(({ className, onClick, ...props }, ref) => {
  const { toggleRightSidebar } = useRightSidebar();

  return (
    <Button
      ref={ref}
      variant="ghost"
      size="icon"
      className={cn("h-7 w-7", className)}
      onClick={(event) => {
        onClick?.(event);
        toggleRightSidebar();
      }}
      {...props}
    >
      <PanelRight />
      <span className="sr-only">Toggle Right Sidebar</span>
    </Button>
  );
});

RightSidebarTrigger.displayName = "RightSidebarTrigger";

