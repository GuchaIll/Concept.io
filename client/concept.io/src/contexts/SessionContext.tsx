import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export interface Project {
  id: string;
  name: string;
  description?: string;
  thumbnailUrl?: string;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  canvasWidth: number;
  canvasHeight: number;
  settings: Record<string, any>;
}

interface SessionContextType {
  // Current session
  projectId: string;
  userId: string;
  currentProject: Project | null;
  
  // Project list
  projects: Project[];
  isLoading: boolean;
  error: string | null;
  
  // Actions
  setProjectId: (id: string) => void;
  setUserId: (id: string) => void;
  createProject: (name: string, description?: string) => Promise<Project | null>;
  switchProject: (projectId: string) => void;
  updateProject: (updates: Partial<Project>) => Promise<void>;
  deleteProject: (projectId: string) => Promise<boolean>;
  refreshProjects: () => Promise<void>;
}

const SessionContext = createContext<SessionContextType | null>(null);

// Generate a stable anonymous user ID (persisted in localStorage)
function getOrCreateUserId(): string {
  const key = 'concept-io-user-id';
  let id = localStorage.getItem(key);
  if (!id) {
    id = `user-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    localStorage.setItem(key, id);
  }
  return id;
}

// Get last active project from localStorage
function getLastProjectId(): string | null {
  return localStorage.getItem('concept-io-last-project');
}

function setLastProjectId(id: string) {
  localStorage.setItem('concept-io-last-project', id);
}

interface SessionProviderProps {
  children: ReactNode;
}

export const SessionProvider = ({ children }: SessionProviderProps) => {
  const [userId] = useState<string>(() => getOrCreateUserId());
  const [projectId, setProjectIdState] = useState<string>(() => getLastProjectId() || '');
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setProjectId = useCallback((id: string) => {
    setProjectIdState(id);
    setLastProjectId(id);
  }, []);

  const setUserId = useCallback((_id: string) => {
    // userId is auto-generated and persisted, but allow override
    localStorage.setItem('concept-io-user-id', _id);
  }, []);

  // Fetch all projects
  const refreshProjects = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/projects`);
      const result = await response.json();
      if (result.success) {
        setProjects(result.data);
      }
    } catch (err) {
      console.error('Failed to fetch projects:', err);
      setError('Failed to load projects');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Create a new project
  const createProject = useCallback(async (name: string, description?: string): Promise<Project | null> => {
    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description, userId }),
      });
      const result = await response.json();
      if (result.success) {
        const project = result.data;
        setProjects(prev => [project, ...prev]);
        setProjectId(project.id);
        setCurrentProject(project);
        return project;
      }
      setError(result.error);
      return null;
    } catch (err) {
      console.error('Failed to create project:', err);
      setError('Failed to create project');
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [userId, setProjectId]);

  // Switch to a different project
  const switchProject = useCallback((newProjectId: string) => {
    const project = projects.find(p => p.id === newProjectId);
    setProjectId(newProjectId);
    setCurrentProject(project || null);
  }, [projects, setProjectId]);

  // Update current project
  const updateProject = useCallback(async (updates: Partial<Project>) => {
    if (!projectId) return;
    try {
      const response = await fetch(`${API_BASE_URL}/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      const result = await response.json();
      if (result.success) {
        setCurrentProject(result.data);
        setProjects(prev => prev.map(p => p.id === projectId ? result.data : p));
      }
    } catch (err) {
      console.error('Failed to update project:', err);
    }
  }, [projectId]);

  // Delete a project
  const deleteProject = useCallback(async (targetProjectId: string): Promise<boolean> => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/projects/${targetProjectId}`, {
        method: 'DELETE',
      });
      const result = await response.json();
      if (result.success) {
        setProjects(prev => prev.filter(p => p.id !== targetProjectId));
        if (projectId === targetProjectId) {
          // Switch to another project or clear
          const remaining = projects.filter(p => p.id !== targetProjectId);
          if (remaining.length > 0) {
            switchProject(remaining[0].id);
          } else {
            setProjectId('');
            setCurrentProject(null);
          }
        }
        return true;
      }
      return false;
    } catch (err) {
      console.error('Failed to delete project:', err);
      return false;
    }
  }, [projectId, projects, switchProject, setProjectId]);

  // Load projects on mount
  useEffect(() => {
    refreshProjects();
  }, [refreshProjects]);

  // Update current project when projectId changes
  useEffect(() => {
    if (projectId) {
      const project = projects.find(p => p.id === projectId);
      setCurrentProject(project || null);
    }
  }, [projectId, projects]);

  // Auto-create default project if none exist after initial load
  useEffect(() => {
    if (!isLoading && projects.length === 0 && !projectId) {
      createProject('Untitled Project', 'Auto-created project');
    }
  }, [isLoading, projects.length, projectId, createProject]);

  const value: SessionContextType = {
    projectId,
    userId,
    currentProject,
    projects,
    isLoading,
    error,
    setProjectId,
    setUserId,
    createProject,
    switchProject,
    updateProject,
    deleteProject,
    refreshProjects,
  };

  return (
    <SessionContext.Provider value={value}>
      {children}
    </SessionContext.Provider>
  );
};

export const useSession = () => {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error('useSession must be used within a SessionProvider');
  }
  return context;
};

export default SessionContext;
