export type YoutubePlaylistReference = {
  playlistId: string;
  playlistUrl: string;
};

export const extractYoutubePlaylistReference = (url: string): YoutubePlaylistReference | null => {
  try {
    const parsedUrl = new URL(url);
    const listId = parsedUrl.searchParams.get("list");
    if (listId) {
      return {
        playlistId: listId,
        playlistUrl: `https://www.youtube.com/playlist?list=${listId}`,
      };
    }

    if (parsedUrl.hostname.includes("youtube.com")) {
      const showMatch = parsedUrl.pathname.match(/^\/show\/([^/]+)/);
      if (showMatch?.[1]) {
        return {
          playlistId: showMatch[1],
          playlistUrl: parsedUrl.toString(),
        };
      }
    }

    return null;
  } catch {
    return null;
  }
};
