import React, { type ReactNode } from "react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { RightSidebarTrigger } from "@/components/ui/right-sidebar-trigger";
import { Settings } from "lucide-react";
import { Link } from "@tanstack/react-router";

interface DragWindowRegionProps {
  title?: ReactNode;
}

export default function DragWindowRegion({ title }: DragWindowRegionProps): React.JSX.Element {
  return (
    <div className="flex w-screen items-stretch justify-between">
      <div className="draglayer w-full">
        {title && (
          <div className="flex flex-1 select-none whitespace-nowrap p-2 text-xs text-gray-400">
            {title}
          </div>
        )}
      </div>
      <WindowButtons />
    </div>
  );
}

function WindowButtons(): React.JSX.Element {
  return (
    <div className="flex">
      <SidebarTrigger className="h-auto w-auto rounded-none p-2 hover:bg-slate-300" />
      <RightSidebarTrigger className="h-auto w-auto rounded-none p-2 hover:bg-slate-300" />
      <Link
        to="/settings"
        className="flex h-auto w-auto items-center justify-center rounded-none p-2 hover:bg-slate-300"
        title="Settings"
      >
        <Settings className="h-4 w-4" />
      </Link>
    </div>
  );
}
