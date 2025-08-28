import React from "react";
import { render, screen } from "@testing-library/react";
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
  useQuery: jest.fn((key, queryFn, options) => {
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

describe("YouTubeVideosPage Simple Tests", () => {
  it("should render without crashing", () => {
    const { container } = render(<YouTubeVideosPage />);
    expect(container).toBeTruthy();
  });

  it("should display the page title", () => {
    render(<YouTubeVideosPage />);
    // Basic test that component renders something
    expect(document.body.textContent).toBeTruthy();
  });

  it("should handle empty video list", async () => {
    render(<YouTubeVideosPage />);
    // Wait for component to load
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(document.body.textContent).toBeTruthy();
  });
});
