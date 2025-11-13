import React from "react";
import { useRouter } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { RightSidebarTrigger } from "@/components/ui/right-sidebar-trigger";

export function HeaderNav(): React.JSX.Element {
  const router = useRouter();
  const canGoBack = router.history.length > 1;

  const handleBack = (): void => {
    router.history.back();
  };

  return (
    <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white/70 px-4 py-2 backdrop-blur dark:bg-gray-900/70">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleBack}
          disabled={!canGoBack}
          className="flex items-center gap-1"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
      </div>
      <RightSidebarTrigger />
    </div>
  );
}
