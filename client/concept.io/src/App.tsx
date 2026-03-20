import Navbar from "./components/Navbar"
import ServiceStatusBanner from "./components/ServiceStatusBanner"
import { BrowserRouter as Router, Route, Routes, useLocation } from 'react-router-dom'
import './App.css'

import Canvas from './pages/canvas'
import User from './pages/user'
import AuthPage from './pages/auth'
import LoginButton from './pages/login'
import LogoutButton from './pages/logout'
import Profile from './pages/profile'
import TimelinePage from './pages/timeline'
import { VersionProvider } from './contexts/VersionContext'
import { SessionProvider } from './contexts/SessionContext'

function App() {
  return (
    <Router>
      <SessionProvider>
        <VersionProvider>
          <AppShell />
        </VersionProvider>
      </SessionProvider>
    </Router>
  )
}

/** Inner shell — needs Router context for useLocation */
function AppShell() {
  const { pathname } = useLocation();
  const hideNavbar = pathname === '/' || pathname === '/canvas' || pathname === '/timeline';
  return (
          <div className="h-screen overflow-hidden relative ">
            <ServiceStatusBanner />
            {!hideNavbar && <Navbar />}
            <Routes>
              <Route path="/" element={<Canvas />} />
              <Route path="/canvas" element={<Canvas />} />
              <Route path="/auth" element={<AuthPage />} />
              <Route path="/timeline" element={<TimelinePage />} />
              <Route path="/user" element={<User />} />
              <Route path="/login" element={<LoginButton />} />
              <Route path="/logout" element={<LogoutButton />} />
              <Route path="/profile" element={<Profile />} />
            </Routes>
          </div>
  )
}

export default App
