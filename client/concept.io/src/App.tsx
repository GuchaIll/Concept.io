
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

function App() {
  return (
    <Router>
        <div className="h-screen overflow-hidden relative "> 
          <Navbar />
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/auth" element={<AuthPage />} />
            <Route path="/about" element={<About />} />
            <Route path="/canvas" element={<Canvas />} />
            <Route path="/user" element={<User />} />
            <Route path="/team" element={<TeamPage />} />
            <Route path="/projects" element={<Projects />} />
            <Route path="/login" element={<LoginButton />} />
            <Route path="/logout" element={<LogoutButton />} />
            <Route path="/profile" element={<Profile />} />
          </Routes>
        </div>
    </Router>
  )
}

export default App
