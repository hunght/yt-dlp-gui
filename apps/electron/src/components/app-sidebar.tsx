import * as React from "react";
import { Settings, Timer, ScrollText, Clapperboard } from "lucide-react";
import { Link, useMatches } from "@tanstack/react-router";
import { logger } from "@/helpers/logger";
import { cn } from "@/lib/utils";

import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";

// This is sample data.
const items = [
  {
    title: "Dashboard",
    icon: Timer,
    url: "/",
    isActive: true,
  },
  {
    title: "Subscriptions",
    icon: Clapperboard,
    url: "/subscriptions",
  },
  {
    title: "Settings",
    icon: Settings,
    url: "/settings",
  },
  {
    title: "Logs",
    icon: ScrollText,
    url: "/logs",
  },
];

export function AppSidebar({ className, ...props }: React.ComponentProps<typeof Sidebar>) {
  const [activeItem, setActiveItem] = React.useState<string | null>(null);
  const matches = useMatches();
  const currentPath = React.useMemo(() => matches[matches.length - 1]?.pathname ?? "/", [matches]);

  return (
    <Sidebar
      collapsible="icon"
      className={cn(
        "border-r border-tracksy-gold/20 bg-white/80 backdrop-blur-sm dark:border-tracksy-gold/10 dark:bg-gray-900/80",
        className
      )}
      {...props}
    >
      <SidebarHeader className="text-sm font-semibold text-tracksy-blue dark:text-white"></SidebarHeader>

      <SidebarContent className="pt-7">
        <SidebarMenu>
          {items.map((item) => (
            <SidebarMenuItem key={item.title}>
              <SidebarMenuButton
                asChild
                isActive={activeItem === item.title}
                tooltip={item.title}
                className={cn(
                  "gap-2 text-tracksy-blue/70 transition-colors dark:text-white/70",
                  "hover:bg-tracksy-gold/10 hover:text-tracksy-blue",
                  "dark:hover:bg-tracksy-gold/5 dark:hover:text-tracksy-gold",
                  activeItem === item.title &&
                    "bg-tracksy-gold/10 text-tracksy-blue dark:bg-tracksy-gold/5 dark:text-white"
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
      <SidebarRail className="border-tracksy-gold/20 dark:border-tracksy-gold/10" />
    </Sidebar>
  );
}
