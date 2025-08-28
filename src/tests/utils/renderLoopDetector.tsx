import { render, RenderOptions } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React, { useEffect, useRef } from "react";
import { vi } from "vitest";

/**
 * Component wrapper that tracks render cycles to detect infinite loops
 */
const RenderLoopDetector: React.FC<{
  children: React.ReactNode;
  maxRenders?: number;
  onExcessiveRenders?: (renderCount: number) => void;
}> = ({ children, maxRenders = 50, onExcessiveRenders }) => {
  const renderCount = useRef(0);
  const lastRenderTime = useRef(Date.now());

  useEffect(() => {
    renderCount.current += 1;
    const now = Date.now();
    const timeSinceLastRender = now - lastRenderTime.current;
    lastRenderTime.current = now;

    // Check for excessive renders
    if (renderCount.current > maxRenders) {
      onExcessiveRenders?.(renderCount.current);
      console.error(
        `🚨 RENDER LOOP DETECTED: Component rendered ${renderCount.current} times!`
      );
    }

    // Check for rapid successive renders (potential loop)
    if (timeSinceLastRender < 10 && renderCount.current > 10) {
      console.warn(
        `⚠️  Rapid renders detected: ${renderCount.current} renders in ${timeSinceLastRender}ms`
      );
    }

    // Log render info
    console.log(
      `Render #${renderCount.current} at ${new Date().toISOString()} (${timeSinceLastRender}ms since last)`
    );
  });

  return <>{children}</>;
};

/**
 * Custom render function that includes render loop detection
 */
export function renderWithLoopDetection(
  ui: React.ReactElement,
  options?: RenderOptions & {
    maxRenders?: number;
    onExcessiveRenders?: (renderCount: number) => void;
  }
) {
  const {
    maxRenders = 50,
    onExcessiveRenders,
    ...renderOptions
  } = options || {};

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: Infinity,
      },
    },
  });

  const WrappedComponent = (
    <QueryClientProvider client={queryClient}>
      <RenderLoopDetector
        maxRenders={maxRenders}
        onExcessiveRenders={onExcessiveRenders}
      >
        {ui}
      </RenderLoopDetector>
    </QueryClientProvider>
  );

  return render(WrappedComponent, renderOptions);
}

/**
 * Hook to track render cycles in components
 */
export function useRenderTracker(componentName: string) {
  const renderCount = useRef(0);
  const lastRenderTime = useRef(Date.now());

  useEffect(() => {
    renderCount.current += 1;
    const now = Date.now();
    const timeSinceLastRender = now - lastRenderTime.current;
    lastRenderTime.current = now;

    console.log(
      `${componentName} render #${renderCount.current} (${timeSinceLastRender}ms since last)`
    );

    // Return cleanup function to track unmounts
    return () => {
      console.log(`${componentName} unmounted after ${renderCount.current} renders`);
    };
  });

  return {
    renderCount: renderCount.current,
    timeSinceLastRender: Date.now() - lastRenderTime.current,
  };
}

/**
 * Utility to create a test that specifically checks for render loops
 */
export function createRenderLoopTest(
  componentName: string,
  renderComponent: () => React.ReactElement,
  interactions: Array<() => void> = []
) {
  return it(`should not cause render loops in ${componentName}`, async () => {
    let excessiveRendersDetected = false;
    let renderCount = 0;

    const { rerender } = renderWithLoopDetection(renderComponent(), {
      maxRenders: 30,
      onExcessiveRenders: (count) => {
        excessiveRendersDetected = true;
        renderCount = count;
      },
    });

    // Wait for initial render
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Perform interactions that might trigger loops
    for (const interaction of interactions) {
      interaction();
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    // Force some re-renders
    for (let i = 0; i < 5; i++) {
      rerender(renderComponent());
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    // Wait for any async operations
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Assert no excessive renders
    expect(excessiveRendersDetected).toBe(false);
    expect(renderCount).toBeLessThan(30);
  });
}

/**
 * Utility to create a stress test for components
 */
export function createStressTest(
  componentName: string,
  renderComponent: () => React.ReactElement,
  stressInteractions: Array<() => void> = []
) {
  return it(`should remain stable under stress in ${componentName}`, async () => {
    let excessiveRendersDetected = false;

    renderWithLoopDetection(renderComponent(), {
      maxRenders: 100,
      onExcessiveRenders: () => {
        excessiveRendersDetected = true;
      },
    });

    // Wait for initial render
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Perform rapid interactions
    for (let i = 0; i < 50; i++) {
      for (const interaction of stressInteractions) {
        interaction();
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    // Wait for any async operations
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Assert no excessive renders
    expect(excessiveRendersDetected).toBe(false);
  });
}

/**
 * Performance monitoring utility
 */
export function createPerformanceMonitor(componentName: string) {
  const startTime = Date.now();
  const renderTimes: number[] = [];

  return {
    recordRender: () => {
      renderTimes.push(Date.now() - startTime);
    },
    getStats: () => {
      const totalRenders = renderTimes.length;
      const avgRenderTime = renderTimes.reduce((a, b) => a + b, 0) / totalRenders;
      const maxRenderTime = Math.max(...renderTimes);
      const minRenderTime = Math.min(...renderTimes);

      return {
        componentName,
        totalRenders,
        avgRenderTime,
        maxRenderTime,
        minRenderTime,
        totalTime: Date.now() - startTime,
      };
    },
    logStats: () => {
      const stats = this.getStats();
      console.log(`📊 Performance Stats for ${stats.componentName}:`, stats);
    },
  };
}
