import React, { useState, useMemo } from "react";
import { Timer, Clapperboard, History, Users, List, Languages, HardDrive } from "lucide-react";
import { Link, useMatches } from "@tanstack/react-router";
import { logger } from "@/helpers/logger";
import { cn } from "@/lib/utils";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { SidebarThemeToggle } from "@/components/SidebarThemeToggle";
import { MinimizedPlayer } from "@/components/MinimizedPlayer";

// This is sample data.
const items = [
  {
    title: "Dashboard",
    icon: Timer,
    url: "/",
    isActive: true,
  },
  {
    title: "Channels",
    icon: Users,
    url: "/channels",
  },
  {
    title: "Playlists",
    icon: List,
    url: "/playlists",
  },
  {
    title: "Subscriptions",
    icon: Clapperboard,
    url: "/subscriptions",
  },
  {
    title: "History",
    icon: History,
    url: "/history",
  },
  {
    title: "My Words",
    icon: Languages,
    url: "/my-words",
  },
  {
    title: "Storage",
    icon: HardDrive,
    url: "/storage",
  },
];

export function AppSidebar({
  className,
  ...props
}: React.ComponentProps<typeof Sidebar>): React.JSX.Element {
  const [activeItem, setActiveItem] = useState<string | null>(null);
  const matches = useMatches();
  const currentPath = useMemo(() => matches[matches.length - 1]?.pathname ?? "/", [matches]);

  return (
    <Sidebar
      collapsible="icon"
      className={cn(
        "border-r border-primary/20 bg-white/80 backdrop-blur-sm dark:border-primary/10 dark:bg-gray-900/80",
        className
      )}
      {...props}
    >
      <SidebarHeader className="px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold text-primary dark:text-white">LearnifyTube</span>

          <SidebarThemeToggle variant="icon" />
        </div>
      </SidebarHeader>

      <SidebarContent className="pt-7">
        <SidebarMenu>
          {items.map((item) => (
            <SidebarMenuItem key={item.title}>
              <SidebarMenuButton
                asChild
                isActive={activeItem === item.title}
                tooltip={item.title}
                className={cn(
                  "gap-2 text-primary/70 transition-colors dark:text-white/70",
                  "hover:bg-accent/10 hover:text-primary",
                  "dark:hover:bg-accent/5 dark:hover:text-accent",
                  activeItem === item.title &&
                    "bg-accent/10 text-primary dark:bg-accent/5 dark:text-white"
                )}
              >
                <Link
                  to={item.url}
                  onClick={() => {
                    logger.debug("Sidebar navigation", {
                      from: currentPath,
                      to: item.url,
                      title: item.title,
                      source: "AppSidebar",
                    });
                    setActiveItem(item.title);
                  }}
                >
                  <item.icon className="size-4" />
                  <span>{item.title}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarContent>

      <SidebarFooter>
        {/* Minimized player - always rendered to keep video element mounted, but only shows UI when not on player page */}
        <MinimizedPlayer />
      </SidebarFooter>

      <SidebarRail className="border-primary/20 dark:border-primary/10" />
    </Sidebar>
  );
}
