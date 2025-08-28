import React from "react";
import { render } from "@testing-library/react";

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

test("YouTubeVideosPage should render without crashing", () => {
  const { container } = render(<YouTubeVideosPage />);
  expect(container).toBeTruthy();
});

test("YouTubeVideosPage should display content", () => {
  render(<YouTubeVideosPage />);
  expect(document.body.textContent).toBeTruthy();
});

test("YouTubeVideosPage should handle empty state", async () => {
  render(<YouTubeVideosPage />);
  // Wait for component to load
  await new Promise((resolve) => setTimeout(resolve, 100));
  expect(document.body.textContent).toBeTruthy();
});
