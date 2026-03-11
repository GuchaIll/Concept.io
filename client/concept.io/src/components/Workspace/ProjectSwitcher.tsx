import { useState, useRef, useEffect } from 'react';
import { useSession } from '../../contexts/SessionContext';
import { FolderOpen, Plus, ChevronDown, Trash2, Check, X } from 'lucide-react';

/**
 * ProjectSwitcher — dropdown for creating and switching between projects.
 * Designed to sit in the TopUtilityBar or Navbar.
 */
export const ProjectSwitcher = () => {
  const {
    projectId,
    currentProject,
    projects,
    isLoading,
    createProject,
    switchProject,
    deleteProject,
  } = useSession();

  const [isOpen, setIsOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setIsCreating(false);
        setConfirmDeleteId(null);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleCreate = async () => {
    const name = newName.trim() || `Project ${projects.length + 1}`;
    await createProject(name);
    setNewName('');
    setIsCreating(false);
  };

  const handleSwitch = (id: string) => {
    if (id !== projectId) {
      switchProject(id);
    }
    setIsOpen(false);
  };

  const handleDelete = async (id: string) => {
    await deleteProject(id);
    setConfirmDeleteId(null);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm font-medium transition-colors"
      >
        <FolderOpen size={16} />
        <span className="max-w-[160px] truncate">
          {isLoading ? 'Loading…' : currentProject?.name || 'No Project'}
        </span>
        <ChevronDown size={14} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-64 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50 overflow-hidden">
          {/* Project list */}
          <div className="max-h-60 overflow-y-auto">
            {projects.length === 0 && (
              <div className="px-3 py-4 text-gray-400 text-sm text-center">No projects yet</div>
            )}
            {projects.map((p) => (
              <div
                key={p.id}
                className={`flex items-center justify-between px-3 py-2 text-sm cursor-pointer transition-colors ${
                  p.id === projectId
                    ? 'bg-indigo-600/30 text-white'
                    : 'text-gray-300 hover:bg-gray-700'
                }`}
              >
                <button
                  className="flex-1 text-left truncate"
                  onClick={() => handleSwitch(p.id)}
                >
                  {p.name}
                </button>

                {confirmDeleteId === p.id ? (
                  <div className="flex items-center gap-1 ml-2">
                    <button
                      onClick={() => handleDelete(p.id)}
                      className="p-1 rounded hover:bg-red-600 text-red-400 hover:text-white"
                      title="Confirm delete"
                    >
                      <Check size={14} />
                    </button>
                    <button
                      onClick={() => setConfirmDeleteId(null)}
                      className="p-1 rounded hover:bg-gray-600 text-gray-400 hover:text-white"
                      title="Cancel"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmDeleteId(p.id);
                    }}
                    className="p-1 rounded hover:bg-gray-600 text-gray-500 hover:text-red-400 ml-2 opacity-0 group-hover:opacity-100"
                    style={{ opacity: p.id === projectId ? 0.4 : undefined }}
                    title="Delete project"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Divider + New project input */}
          <div className="border-t border-gray-700 p-2">
            {isCreating ? (
              <div className="flex items-center gap-1">
                <input
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreate();
                    if (e.key === 'Escape') setIsCreating(false);
                  }}
                  placeholder="Project name…"
                  className="flex-1 px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm text-white placeholder-gray-400 focus:outline-none focus:border-indigo-500"
                />
                <button
                  onClick={handleCreate}
                  className="p-1 rounded hover:bg-indigo-600 text-indigo-400 hover:text-white"
                >
                  <Check size={16} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setIsCreating(true)}
                className="flex items-center gap-2 w-full px-2 py-1.5 text-sm text-gray-300 hover:bg-gray-700 rounded transition-colors"
              >
                <Plus size={16} />
                New Project
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
