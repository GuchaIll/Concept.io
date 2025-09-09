import { createContext, useContext, type ReactNode } from 'react';
import { useCanvas, type CanvasConfig } from '../hooks/Canvas';

const CanvasContext = createContext<ReturnType<typeof useCanvas> | null>(null);
CanvasContext.displayName = 'CanvasContext';

export const CanvasProvider = ({
  children,
  config,
}: {
  children: ReactNode;
  config?: CanvasConfig;
}) => {
  const value = useCanvas(config); // hook does all the heavy lifting
  return (
    <CanvasContext.Provider value={value}>{children}</CanvasContext.Provider>
  );
};

export const useCanvasContext = () => {
  const context = useContext(CanvasContext);
  if (!context) {
    throw new Error('useCanvasContext must be used within a CanvasProvider');
  }
  return context;
};
