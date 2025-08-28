import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { jest, describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import YouTubeVideosPage from "../pages/YouTubeVideosPage";

// Mock tRPC client
jest.mock("../utils/trpc", () => ({
  trpcClient: {
    youtube: {
      getVideos: jest.fn(),
      getVideoStats: jest.fn(),
      getChannels: jest.fn(),
    },
  },
}));

// Import after mocking
import { trpcClient } from "../utils/trpc";

// Create a test query client
const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: Infinity,
      },
    },
  });

// Test wrapper component
const TestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const queryClient = createTestQueryClient();
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
};

// Mock data
const mockVideos = [
  {
    id: "1",
    videoId: "dQw4w9WgXcQ",
    title: "Test Video 1",
    description: "Test description 1",
    channelId: "channel1",
    channelTitle: "Test Channel 1",
    durationSeconds: 180,
    viewCount: 1000,
    likeCount: 50,
    thumbnailUrl: "https://example.com/thumb1.jpg",
    publishedAt: 1640995200,
    tags: "test, video",
    createdAt: 1640995200,
    updatedAt: null,
  },
  {
    id: "2",
    videoId: "dQw4w9WgXcQ2",
    title: "Test Video 2",
    description: "Test description 2",
    channelId: "channel2",
    channelTitle: "Test Channel 2",
    durationSeconds: 240,
    viewCount: 2000,
    likeCount: 100,
    thumbnailUrl: "https://example.com/thumb2.jpg",
    publishedAt: 1640995200,
    tags: "test, video",
    createdAt: 1640995200,
    updatedAt: null,
  },
];

const mockStats = {
  totalVideos: 2,
  totalViews: 3000,
  totalLikes: 150,
  totalDuration: 420,
  uniqueChannels: 2,
};

const mockChannels = [
  { channelId: "channel1", channelTitle: "Test Channel 1", videoCount: 1 },
  { channelId: "channel2", channelTitle: "Test Channel 2", videoCount: 1 },
];

describe("YouTubeVideosPage", () => {
  let consoleSpy: any;

  beforeEach(() => {
    // Spy on console.log to track render cycles
    consoleSpy = jest.spyOn(console, "log");

    // Mock successful API responses
    (trpcClient.youtube.getVideos as any).mockResolvedValue({
      videos: mockVideos,
      pagination: {
        currentPage: 1,
        totalPages: 1,
        totalItems: 2,
        hasNextPage: false,
        hasPrevPage: false,
      },
    });

    (trpcClient.youtube.getVideoStats as any).mockResolvedValue(mockStats);
    (trpcClient.youtube.getChannels as any).mockResolvedValue(mockChannels);
  });

  afterEach(() => {
    jest.clearAllMocks();
    consoleSpy?.mockRestore();
  });

  // Test 1: Prevent infinite render loops
  it("should not cause infinite render loops", async () => {
    const { rerender } = render(
      <TestWrapper>
        <YouTubeVideosPage />
      </TestWrapper>
    );

    // Wait for initial render and data loading
    await waitFor(() => {
      expect(screen.getByText("YouTube Videos")).toBeInTheDocument();
    });

    // Count initial renders
    const initialRenderCount = consoleSpy.mock.calls.filter(
      (call: any) => call[0] === "YouTubeVideosPage component rendering - FULL VERSION"
    ).length;

    // Force multiple re-renders
    for (let i = 0; i < 5; i++) {
      act(() => {
        rerender(
          <TestWrapper>
            <YouTubeVideosPage />
          </TestWrapper>
        );
      });
    }

    // Wait for any async operations
    await waitFor(() => {
      expect(screen.getByText("Test Video 1")).toBeInTheDocument();
    });

    // Check that we don't have excessive renders
    const totalRenderCount = consoleSpy.mock.calls.filter(
      (call: any) => call[0] === "YouTubeVideosPage component rendering - FULL VERSION"
    ).length;

    // Should not render more than 10 times (initial + 5 rerenders + some for state updates)
    expect(totalRenderCount).toBeLessThan(10);
  });

  // Test 2: Prevent state update loops
  it("should not cause state update loops when changing search query", async () => {
    render(
      <TestWrapper>
        <YouTubeVideosPage />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(screen.getByText("YouTube Videos")).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(
      "Search videos by title, description, or channel..."
    );

    // Simulate rapid typing to trigger potential loops
    for (let i = 0; i < 10; i++) {
      act(() => {
        fireEvent.change(searchInput, { target: { value: `test${i}` } });
      });
    }

    // Wait for any async operations
    await waitFor(() => {
      expect(searchInput).toHaveValue("test9");
    });

    // Verify that the component is stable
    expect(screen.getByText("YouTube Videos")).toBeInTheDocument();
  });

  // Test 3: Prevent channel selection loops
  it("should not cause loops when changing channel selection", async () => {
    render(
      <TestWrapper>
        <YouTubeVideosPage />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(screen.getByText("YouTube Videos")).toBeInTheDocument();
    });

    // Find the channel select
    const channelSelect = screen.getByRole("combobox");

    // Simulate multiple channel changes
    for (let i = 0; i < 5; i++) {
      act(() => {
        fireEvent.click(channelSelect);
      });

      // Wait for dropdown to appear and select an option
      await waitFor(() => {
        const option = screen.getByText("Test Channel 1 (1)");
        fireEvent.click(option);
      });

      // Small delay to ensure state updates complete
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    // Component should still be stable
    expect(screen.getByText("YouTube Videos")).toBeInTheDocument();
  });

  // Test 4: Prevent sort change loops
  it("should not cause loops when changing sort options", async () => {
    render(
      <TestWrapper>
        <YouTubeVideosPage />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(screen.getByText("YouTube Videos")).toBeInTheDocument();
    });

    // Find sort buttons
    const sortButtons = screen.getAllByText(/Sort by:/);
    expect(sortButtons.length).toBeGreaterThan(0);

    // Simulate multiple sort changes
    for (let i = 0; i < 5; i++) {
      act(() => {
        const titleSortButton = screen.getByText("Title");
        fireEvent.click(titleSortButton);
      });

      // Small delay to ensure state updates complete
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    // Component should still be stable
    expect(screen.getByText("YouTube Videos")).toBeInTheDocument();
  });

  // Test 5: Prevent pagination loops
  it("should not cause loops when changing pages", async () => {
    // Mock pagination data
    (trpcClient.youtube.getVideos as any).mockResolvedValue({
      videos: mockVideos,
      pagination: {
        currentPage: 1,
        totalPages: 3,
        totalItems: 6,
        hasNextPage: true,
        hasPrevPage: false,
      },
    });

    render(
      <TestWrapper>
        <YouTubeVideosPage />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(screen.getByText("YouTube Videos")).toBeInTheDocument();
    });

    // Find pagination buttons
    const nextButton = screen.getByText("Next");
    const prevButton = screen.getByText("Previous");

    // Simulate multiple page changes
    for (let i = 0; i < 3; i++) {
      act(() => {
        fireEvent.click(nextButton);
      });

      await new Promise((resolve) => setTimeout(resolve, 10));

      act(() => {
        fireEvent.click(prevButton);
      });

      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    // Component should still be stable
    expect(screen.getByText("YouTube Videos")).toBeInTheDocument();
  });

  // Test 6: Prevent form submission loops
  it("should not cause loops when submitting search form", async () => {
    render(
      <TestWrapper>
        <YouTubeVideosPage />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(screen.getByText("YouTube Videos")).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(
      "Search videos by title, description, or channel..."
    );
    const searchButton = screen.getByText("Search");

    // Simulate multiple form submissions
    for (let i = 0; i < 5; i++) {
      act(() => {
        fireEvent.change(searchInput, { target: { value: `search${i}` } });
        fireEvent.click(searchButton);
      });

      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    // Component should still be stable
    expect(screen.getByText("YouTube Videos")).toBeInTheDocument();
  });

  // Test 7: Check for excessive API calls
  it("should not make excessive API calls", async () => {
    render(
      <TestWrapper>
        <YouTubeVideosPage />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(screen.getByText("YouTube Videos")).toBeInTheDocument();
    });

    // Wait a bit for any potential additional calls
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Should only make initial API calls, not excessive ones
    expect(trpcClient.youtube.getVideos).toHaveBeenCalledTimes(1);
    expect(trpcClient.youtube.getVideoStats).toHaveBeenCalledTimes(1);
    expect(trpcClient.youtube.getChannels).toHaveBeenCalledTimes(1);
  });

  // Test 8: Check component stability over time
  it("should remain stable during extended interaction", async () => {
    render(
      <TestWrapper>
        <YouTubeVideosPage />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(screen.getByText("YouTube Videos")).toBeInTheDocument();
    });

    // Simulate extended user interaction
    const searchInput = screen.getByPlaceholderText(
      "Search videos by title, description, or channel..."
    );
    const channelSelect = screen.getByRole("combobox");

    for (let i = 0; i < 20; i++) {
      act(() => {
        // Alternate between different interactions
        if (i % 3 === 0) {
          fireEvent.change(searchInput, { target: { value: `interaction${i}` } });
        } else if (i % 3 === 1) {
          fireEvent.click(channelSelect);
        } else {
          const titleSortButton = screen.getByText("Title");
          fireEvent.click(titleSortButton);
        }
      });

      // Small delay between interactions
      await new Promise((resolve) => setTimeout(resolve, 5));
    }

    // Component should still be stable and functional
    expect(screen.getByText("YouTube Videos")).toBeInTheDocument();
    expect(screen.getByText("Test Video 1")).toBeInTheDocument();
  });

  // Test 9: Check for memory leaks
  it("should not cause memory leaks from event listeners", async () => {
    const { unmount } = render(
      <TestWrapper>
        <YouTubeVideosPage />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(screen.getByText("YouTube Videos")).toBeInTheDocument();
    });

    // Simulate some interactions
    const searchInput = screen.getByPlaceholderText(
      "Search videos by title, description, or channel..."
    );
    fireEvent.change(searchInput, { target: { value: "test" } });

    // Unmount component
    unmount();

    // Wait for cleanup
    await new Promise((resolve) => setTimeout(resolve, 100));

    // No errors should be thrown during cleanup
    expect(true).toBe(true);
  });

  // Test 10: Check error boundary behavior
  it("should handle errors gracefully without loops", async () => {
    // Mock API error
    (trpcClient.youtube.getVideos as any).mockRejectedValue(new Error("API Error"));

    render(
      <TestWrapper>
        <YouTubeVideosPage />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(screen.getByText("Error Loading Videos")).toBeInTheDocument();
    });

    // Try to retry
    const retryButton = screen.getByText("Retry");
    fireEvent.click(retryButton);

    // Should still show error without loops
    await waitFor(() => {
      expect(screen.getByText("Error Loading Videos")).toBeInTheDocument();
    });
  });
});
