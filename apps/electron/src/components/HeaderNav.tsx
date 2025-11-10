import React, { useMemo, Fragment } from "react";
import { Link, useMatches } from "@tanstack/react-router";
import { RightSidebarTrigger } from "@/components/ui/right-sidebar-trigger";

export function HeaderNav() {
  const matches = useMatches();
  const leaf = matches[matches.length - 1];
  const segments = useMemo(() => {
    const path = leaf?.pathname || "/";
    const parts = path.split("/").filter(Boolean);
    const acc: { name: string; to: string }[] = [];
    let built = "";
    for (const p of parts) {
      built += `/${p}`;
      acc.push({ name: p.charAt(0).toUpperCase() + p.slice(1), to: built });
    }
    return acc;
  }, [leaf]);

  return (
    <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white/70 px-4 py-2 backdrop-blur dark:bg-gray-900/70">
      <div className="flex items-center gap-2 text-sm">
        <nav className="flex items-center gap-1 text-muted-foreground">
          <Link to="/" className="hover:underline">
            Home
          </Link>
          {segments.map((s, i) => (
            <Fragment key={s.to}>
              <span>/</span>
              {i === segments.length - 1 ? (
                <span className="text-foreground">{s.name}</span>
              ) : (
                <Link to={s.to} className="hover:underline">
                  {s.name}
                </Link>
              )}
            </Fragment>
          ))}
        </nav>
      </div>
      <RightSidebarTrigger />
    </div>
  );
}
