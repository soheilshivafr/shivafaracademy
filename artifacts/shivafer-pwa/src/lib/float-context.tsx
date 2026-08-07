import { createContext, useContext, useState } from "react";

const FloatContext = createContext<{ extraBottom: number; setExtraBottom: (v: number) => void }>({
  extraBottom: 0,
  setExtraBottom: () => {},
});

export function FloatProvider({ children }: { children: React.ReactNode }) {
  const [extraBottom, setExtraBottom] = useState(0);
  return <FloatContext.Provider value={{ extraBottom, setExtraBottom }}>{children}</FloatContext.Provider>;
}

export function useFloatOffset() {
  return useContext(FloatContext);
}
