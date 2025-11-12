import React, { useMemo, Fragment } from "react";
import { Link, useMatches } from "@tanstack/react-router";
import { RightSidebarTrigger } from "@/components/ui/right-sidebar-trigger";

interface Segment {
  name: string;
  to: string;
  search?: Record<string, unknown>;
}

export function HeaderNav(): React.JSX.Element {
  const matches = useMatches();
  const leaf = matches[matches.length - 1];

  const segments = useMemo(() => {
    const path = leaf?.pathname || "/";
    const parts = path.split("/").filter(Boolean);
    const acc: Segment[] = [];

    // Get search params from leaf
    const leafSearch = leaf?.search;
    const searchParams: Record<string, unknown> | undefined =
      leafSearch && typeof leafSearch === "object" && leafSearch !== null
        ? { ...leafSearch }
        : undefined;
    const title =
      searchParams && "title" in searchParams && typeof searchParams.title === "string"
        ? searchParams.title
        : undefined;

    // Build segments
    let built = "";
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      built += `/${p}`;

      // Special handling for detail pages with title
      if (p === "playlist" && title) {
        // Add "Playlists" parent link
        acc.push({ name: "Playlists", to: "/playlists" });
        // Add current playlist title
        acc.push({
          name: title,
          to: built,
          search: searchParams,
        });
      } else if (p === "channel" && title) {
        // Add "Channels" parent link
        acc.push({ name: "Channels", to: "/channels" });
        // Add current channel name
        acc.push({
          name: title,
          to: built,
          search: searchParams,
        });
      } else if (p === "player" && title) {
        // Add "History" parent link
        acc.push({ name: "History", to: "/history" });
        // Add current video title
        acc.push({
          name: title,
          to: built,
          search: searchParams,
        });
      } else {
        acc.push({ name: p.charAt(0).toUpperCase() + p.slice(1), to: built });
      }
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
            <Fragment key={`${s.to}-${i}`}>
              <span>/</span>
              {i === segments.length - 1 ? (
                <span className="text-foreground">{s.name}</span>
              ) : (
                <Link to={s.to} search={s.search} className="hover:underline">
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
