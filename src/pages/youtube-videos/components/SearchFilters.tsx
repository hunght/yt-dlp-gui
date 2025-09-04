import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, Calendar, Eye, Heart, Filter, SortAsc, SortDesc } from "lucide-react";
import { Channel, SortBy, SortOrder } from "../types";

interface SearchFiltersProps {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  selectedChannel: string;
  handleChannelChange: (value: string) => void;
  channelsData?: { channels: Channel[] };
  handleSearch: (e: React.FormEvent) => void;
  sortBy: SortBy;
  sortOrder: SortOrder;
  handleSortChange: (newSortBy: SortBy) => void;
}

export const SearchFilters: React.FC<SearchFiltersProps> = ({
  searchQuery,
  setSearchQuery,
  selectedChannel,
  handleChannelChange,
  channelsData,
  handleSearch,
  sortBy,
  sortOrder,
  handleSortChange,
}) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Filter className="h-5 w-5" />
          Search & Filters
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={handleSearch} className="flex flex-col gap-4 sm:flex-row">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 transform text-gray-400" />
              <Input
                placeholder="Search videos by title, description, or channel..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          <Select value={selectedChannel} onValueChange={handleChannelChange}>
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue placeholder="All channels" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All channels</SelectItem>
              {channelsData?.channels?.map((channel: Channel) => (
                <SelectItem key={channel.channelId} value={channel.channelId || "unknown"}>
                  {channel.channelTitle || "Unknown Channel"} ({channel.videoCount})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button type="submit" className="w-full sm:w-auto">
            Search
          </Button>
        </form>

        {/* Sort Options */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-gray-700">Sort by:</span>

          {[
            { key: "createdAt", label: "Date Added", icon: Calendar },
            { key: "publishedAt", label: "Published Date", icon: Calendar },
            { key: "title", label: "Title", icon: null },
            { key: "viewCount", label: "Views", icon: Eye },
            { key: "likeCount", label: "Likes", icon: Heart },
          ].map(({ key, label, icon: Icon }) => (
            <Button
              key={key}
              variant={sortBy === key ? "default" : "outline"}
              size="sm"
              onClick={() => handleSortChange(key as SortBy)}
              className="flex items-center gap-1"
            >
              {Icon && <Icon className="h-4 w-4" />}
              {label}
              {sortBy === key &&
                (sortOrder === "asc" ? (
                  <SortAsc className="h-4 w-4" />
                ) : (
                  <SortDesc className="h-4 w-4" />
                ))}
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
