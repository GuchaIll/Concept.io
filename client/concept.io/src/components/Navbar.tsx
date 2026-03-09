import { NavLink } from 'react-router-dom';

export const Navbar = () => {
  return (
    <nav className="
      fixed top-0 left-0 right-0 z-50 h-14 px-6
      flex items-center justify-between
      bg-background-dark/60 backdrop-blur-xl
      border-b border-white/5
    ">
      {/* Left — logo + wordmark */}
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center size-8 bg-primary rounded-lg text-white">
          <span className="material-symbols-outlined" style={{ fontSize: 20 }}>polyline</span>
        </div>
        <span className="text-sm font-semibold tracking-tight uppercase text-white">
          ConceptArt
        </span>
      </div>

      {/* Center — nav tabs */}
      <div className="flex items-center gap-8">
        <NavItem to="/about"    label="ABOUT" />
        <NavItem to="/projects" label="PROJECTS" />
        <NavItem to="/canvas"   label="CANVAS" />
        <NavItem to="/assets"   label="ASSET VAULT" />
      </div>

      {/* Right — actions */}
      <div className="flex items-center gap-6">
        <button className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-white/5 transition group">
          <span className="material-symbols-outlined text-slate-400 group-hover:text-primary" style={{ fontSize: 20 }}>
            ios_share
          </span>
          <span className="text-xs font-medium text-slate-400 group-hover:text-slate-100">
            Share
          </span>
        </button>

        <div className="w-px h-6 bg-white/10" />

        <button className="text-slate-400 hover:text-slate-100 transition">
          <span className="material-symbols-outlined" style={{ fontSize: 20 }}>settings</span>
        </button>
      </div>
    </nav>
  );
};

/** Single nav link with active underline indicator */
const NavItem = ({ to, label }: { to: string; label: string }) => (
  <NavLink
    to={to}
    className={({ isActive }) =>
      [
        'text-[11px] font-medium tracking-wide transition-colors duration-200 relative pb-[18px]',
        isActive ? 'text-white' : 'text-slate-400 hover:text-slate-200',
      ].join(' ')
    }
  >
    {({ isActive }) => (
      <>
        {label}
        {/* Underline — slides in when active */}
        <span
          className="absolute left-0 right-0 bottom-0 h-[2px] bg-white origin-left transition-transform duration-300"
          style={{ transform: isActive ? 'scaleX(1)' : 'scaleX(0)' }}
        />
      </>
    )}
  </NavLink>
);

// Keep default export for backwards-compat with current import in App.tsx
export default Navbar;
