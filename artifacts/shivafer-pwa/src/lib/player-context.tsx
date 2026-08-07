import { createContext, useContext, useState, useCallback } from "react";

interface PlayerContextType {
  isPlayerOpen: boolean;
  openPlayer: () => void;
  closePlayer: () => void;
}

const PlayerContext = createContext<PlayerContextType>({
  isPlayerOpen: false,
  openPlayer: () => {},
  closePlayer: () => {},
});

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const [isPlayerOpen, setIsPlayerOpen] = useState(false);
  const openPlayer = useCallback(() => setIsPlayerOpen(true), []);
  const closePlayer = useCallback(() => setIsPlayerOpen(false), []);
  return (
    <PlayerContext.Provider value={{ isPlayerOpen, openPlayer, closePlayer }}>
      {children}
    </PlayerContext.Provider>
  );
}

export function usePlayer() {
  return useContext(PlayerContext);
}
