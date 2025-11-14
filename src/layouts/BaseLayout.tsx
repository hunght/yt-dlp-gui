import React from "react";
import { Toaster } from "@/components/ui/toaster";

import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { AppRightSidebar } from "@/components/app-right-sidebar";
import DragWindowRegion from "@/components/DragWindowRegion";
import { HeaderNav } from "@/components/HeaderNav";

export default function BaseLayout({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <SidebarProvider>
      <div className="flex h-screen flex-col">
        {/* Drag region for frameless window */}
        <DragWindowRegion title="YT-DLP GUI" />

        <div className="flex flex-1 overflow-hidden">
          <AppSidebar />

          <main className="flex-1 overflow-auto bg-gradient-to-br from-primary/5 to-accent/5 dark:from-primary/10 dark:to-accent/10">
            <HeaderNav />
            {children}
          </main>

          <AppRightSidebar />
          <Toaster />
        </div>
      </div>
    </SidebarProvider>
  );
}
