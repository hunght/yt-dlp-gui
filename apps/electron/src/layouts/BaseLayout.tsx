import React from "react";
import { Toaster } from "@/components/ui/toaster";

import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { AppRightSidebar } from "@/components/app-right-sidebar";
import DragWindowRegion from "@/components/DragWindowRegion";
import { HeaderNav } from "@/components/HeaderNav";

export default function BaseLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <div className="flex h-screen flex-col">
        {/* Drag region for frameless window */}
        <DragWindowRegion title="YT-DLP GUI" />

        <div className="flex flex-1 overflow-hidden">
          <AppSidebar />

          <main className="flex-1 overflow-auto bg-gradient-to-br from-tracksy-blue/5 to-tracksy-gold/5 dark:from-tracksy-blue/10 dark:to-tracksy-gold/10">
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
