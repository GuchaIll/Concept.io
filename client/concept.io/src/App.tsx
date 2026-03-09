import Navbar from "./components/Navbar"
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom'
import './App.css'

import Home from './pages/index'
import About from './pages/about'
import Canvas from './pages/canvas'
import User from './pages/user'
import TeamPage from './pages/team'
import Projects from './pages/projects'
import AuthPage from './pages/auth'
import LoginButton from './pages/login'
import LogoutButton from './pages/logout'
import Profile from './pages/profile'
import TimelinePage from './pages/timeline'
import AssetVaultPage from './pages/assets'
import { VersionProvider } from './contexts/VersionContext'
import { AssetProvider } from './contexts/AssetContext'
import { SessionProvider, useSession } from './contexts/SessionContext'

/** Inner shell that reads session context and passes IDs to providers */
const AppShell = () => {
  const { projectId, userId, isLoading } = useSession();

  // Wait until we have a valid project before rendering providers
  if (isLoading || !projectId) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-900 text-white">
        <p>Loading project…</p>
      </div>
    );
  }

  return (
    <VersionProvider projectId={projectId} userId={userId}>
      <AssetProvider projectId={projectId} userId={userId}>
        <div className="h-screen overflow-hidden relative "> 
          <Navbar />
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/auth" element={<AuthPage />} />
            <Route path="/about" element={<About />} />
            <Route path="/canvas" element={<Canvas />} />
            <Route path="/timeline" element={<TimelinePage />} />
            <Route path="/assets" element={<AssetVaultPage />} />
            <Route path="/user" element={<User />} />
            <Route path="/team" element={<TeamPage />} />
            <Route path="/projects" element={<Projects />} />
            <Route path="/login" element={<LoginButton />} />
            <Route path="/logout" element={<LogoutButton />} />
            <Route path="/profile" element={<Profile />} />
          </Routes>
        </div>
      </AssetProvider>
    </VersionProvider>
  );
};

function App() {
  return (
    <Router>
      <SessionProvider>
        <AppShell />
      </SessionProvider>
    </Router>
  )
}

export default App
