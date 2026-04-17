import { create } from 'zustand';

// 1. Define what a Match looks like
interface MatchData {
  name: string;
  vibe_breakdown?: {
    artists?: number;
    genres?: number;
    artist_match?: number; // Add these to the type
    genre_match?: number;
    vibe_score?: number;
    [key: string]: any; // 👈 This allows any other name without errors!
  };
  common_artists?: string[];
  top_tracks?: string[];
}

// 2. Define the Store structure
interface MatchStore {
  selectedMatch: MatchData | null;
  setSelectedMatch: (match: MatchData) => void;
}

// 3. Create the store with explicit types
export const useMatchStore = create<MatchStore>((set) => ({
  selectedMatch: null,
  setSelectedMatch: (match: MatchData) => set({ selectedMatch: match }),
}));