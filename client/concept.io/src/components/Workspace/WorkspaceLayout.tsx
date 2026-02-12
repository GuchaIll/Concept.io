import type { ReactNode } from 'react';

interface WorkspaceLayoutProps {
  children: ReactNode;
}

export const WorkspaceLayout = ({ children }: WorkspaceLayoutProps) => {
  return (
    <main 
      className="relative h-screen w-full flex overflow-hidden font-display text-white"
      style={{ backgroundColor: '#101622' }}
    >
      {children}
    </main>
  );
};
