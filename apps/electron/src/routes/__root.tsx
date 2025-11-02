import React, { useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import BaseLayout from "@/layouts/BaseLayout";
import { Outlet, createRootRoute, useMatches } from "@tanstack/react-router";
import { ConfirmationDialogProvider } from "@/components/providers/ConfirmationDialog";
import { analytics } from "@/helpers/analytics";
import { logger } from "@/helpers/logger";
import { Toaster } from "sonner";

export const RootRoute = createRootRoute({
  component: Root,
  beforeLoad: ({ location }) => {
    // Track page view using the safer analytics helper
    analytics.pageView(location.pathname, {
      params: location.search ? Object.fromEntries(new URLSearchParams(location.search)) : {},
    });

    // Debug log navigation with params to help diagnose routing issues
    try {
      const searchParams = location.search
        ? Object.fromEntries(new URLSearchParams(location.search))
        : {};
      logger.debug("Route beforeLoad", {
        path: location.pathname,
        search: searchParams,
        source: "RootRoute.beforeLoad",
      });
    } catch (e) {
      // Ensure logging never breaks navigation
      logger.error("Failed to log beforeLoad navigation params", e as Error);
    }
  },
  errorComponent: ({ error }) => {
    const { toast } = useToast();
    const err = error as Error;
    console.error("[errorComponent]", err);

    // Track error events using the safer analytics helper
    analytics.track("navigation_error", {
      error_message: err.message,
      path: window.location.pathname,
    });

    toast({
      variant: "destructive",
      title: "Error",
      description: err.message,
    });
    return <Root />;
  },
});

function Root() {
  const matches = useMatches();
  const isFullScreenRoute = matches.some((match) => match.pathname === "/raining-letters");

  // Log resolved route with extracted params and search when route changes
  useEffect(() => {
    const leaf = matches[matches.length - 1];
    const pathname = leaf?.pathname ?? window.location.pathname;
    const search = Object.fromEntries(new URLSearchParams(window.location.search));

    // Attempt to read params from the leaf match if present
    const params: Record<string, unknown> = (leaf && (leaf as unknown as { params?: Record<string, unknown> }).params) ?? {};

    logger.debug("Route navigated", {
      path: pathname,
      params,
      search,
      source: "Root",
    });
  }, [matches]);


  return (
    <ConfirmationDialogProvider>
      {isFullScreenRoute ? (
        <Outlet />
      ) : (
        <BaseLayout>
          <Outlet />
        </BaseLayout>
      )}
      <Toaster />
    </ConfirmationDialogProvider>
  );
}
