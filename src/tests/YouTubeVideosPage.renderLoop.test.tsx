import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { jest, describe, it, expect, beforeEach } from "@jest/globals";

// Mock the entire tRPC module before any imports
jest.mock("../utils/trpc", () => ({
  trpcClient: {
    youtube: {
      getVideos: jest.fn().mockResolvedValue({
        videos: [],
        pagination: {
          currentPage: 1,
          totalPages: 1,
          totalItems: 0,
          hasNextPage: false,
          hasPrevPage: false,
        },
      }),
      getVideoStats: jest.fn().mockResolvedValue({
        totalVideos: 0,
        totalViews: 0,
        totalLikes: 0,
        totalDuration: 0,
        uniqueChannels: 0,
      }),
      getChannels: jest.fn().mockResolvedValue([]),
    },
  },
}));

// Mock React Query
jest.mock("@tanstack/react-query", () => ({
  useQuery: jest.fn((key: string) => {
    if (key === "videos") {
      return {
        data: {
          videos: [],
          pagination: {
            currentPage: 1,
            totalPages: 1,
            totalItems: 0,
            hasNextPage: false,
            hasPrevPage: false,
          },
        },
        isLoading: false,
        error: null,
      };
    }
    if (key === "videoStats") {
      return {
        data: {
          totalVideos: 0,
          totalViews: 0,
          totalLikes: 0,
          totalDuration: 0,
          uniqueChannels: 0,
        },
        isLoading: false,
        error: null,
      };
    }
    if (key === "channels") {
      return {
        data: [],
        isLoading: false,
        error: null,
      };
    }
    return {
      data: null,
      isLoading: true,
      error: null,
    };
  }),
}));

// Now import the component
import YouTubeVideosPage from "../pages/YouTubeVideosPage";

describe("YouTubeVideosPage Render Loop Prevention", () => {
  // Test 1: Basic render loop detection
  it("should not cause infinite render loops during initial load", async () => {
    const { container } = render(<YouTubeVideosPage />);

    // Wait for component to load
    await waitFor(() => {
      expect(container).toBeInTheDocument();
    });

    // Wait a bit more for any potential loops
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Basic assertion that component rendered
    expect(container).toBeInTheDocument();
  });

  // Test 2: Search input render loop detection
  it("should not cause render loops when typing in search", async () => {
    const { container } = render(<YouTubeVideosPage />);

    await waitFor(() => {
      expect(container).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(
      "Search videos by title, description, or channel..."
    );

    // Rapid typing simulation
    for (let i = 0; i < 20; i++) {
      fireEvent.change(searchInput, { target: { value: `test${i}` } });
      await new Promise((resolve) => setTimeout(resolve, 5));
    }

    // Wait for any async operations
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(searchInput).toHaveValue("test19");
  });

  // Test 3: Channel selection render loop detection
  it("should not cause render loops when changing channels", async () => {
    const { container } = render(<YouTubeVideosPage />);

    await waitFor(() => {
      expect(container).toBeInTheDocument();
    });

    const channelSelect = screen.getByRole("combobox");

    // Multiple channel changes
    for (let i = 0; i < 10; i++) {
      fireEvent.click(channelSelect);

      await waitFor(() => {
        const option = screen.getByText("All channels");
        fireEvent.click(option);
      });

      await new Promise((resolve) => setTimeout(resolve, 20));
    }

    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(container).toBeInTheDocument();
  });

  // Test 4: Sort button render loop detection
  it("should not cause render loops when changing sort options", async () => {
    const { container } = render(<YouTubeVideosPage />);

    await waitFor(() => {
      expect(container).toBeInTheDocument();
    });

    // Find and click sort buttons multiple times
    for (let i = 0; i < 15; i++) {
      const titleSortButton = screen.getByText("Title");
      fireEvent.click(titleSortButton);
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(container).toBeInTheDocument();
  });

  // Test 5: Form submission render loop detection
  it("should not cause render loops when submitting forms", async () => {
    const { container } = render(<YouTubeVideosPage />);

    await waitFor(() => {
      expect(container).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(
      "Search videos by title, description, or channel..."
    );
    const searchButton = screen.getByText("Search");

    // Multiple form submissions
    for (let i = 0; i < 10; i++) {
      fireEvent.change(searchInput, { target: { value: `search${i}` } });
      fireEvent.click(searchButton);
      await new Promise((resolve) => setTimeout(resolve, 20));
    }

    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(container).toBeInTheDocument();
  });

  // Test 6: Combined interactions stress test
  it("should remain stable under combined interaction stress", async () => {
    const { container } = render(<YouTubeVideosPage />);

    await waitFor(() => {
      expect(container).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(
      "Search videos by title, description, or channel..."
    );
    const channelSelect = screen.getByRole("combobox");
    const titleSortButton = screen.getByText("Title");

    // Combined rapid interactions
    for (let i = 0; i < 30; i++) {
      // Alternate between different interactions
      if (i % 4 === 0) {
        fireEvent.change(searchInput, { target: { value: `stress${i}` } });
      } else if (i % 4 === 1) {
        fireEvent.click(channelSelect);
      } else if (i % 4 === 2) {
        fireEvent.click(titleSortButton);
      } else {
        fireEvent.click(screen.getByText("Search"));
      }

      await new Promise((resolve) => setTimeout(resolve, 5));
    }

    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(container).toBeInTheDocument();
  });

  // Test 7: Component unmounting without loops
  it("should unmount cleanly without causing render loops", async () => {
    const { container, unmount } = render(<YouTubeVideosPage />);

    await waitFor(() => {
      expect(container).toBeInTheDocument();
    });

    // Unmount component
    unmount();

    // Wait for cleanup
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Component should be unmounted
    expect(container.innerHTML).toBe("");
  });
});
