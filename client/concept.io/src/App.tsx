
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

function App() {
  return (
    <Router>
        <div className="min-h-screen pt-16"> {/* Added pt-16 to account for fixed navbar */}
          <Navbar />
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/auth" element={<AuthPage />} />
            <Route path="/about" element={<About />} />
            <Route path="/canvas" element={<Canvas />} />
            <Route path="/user" element={<User />} />
            <Route path="/team" element={<TeamPage />} />
            <Route path="/projects" element={<Projects />} />
          </Routes>
        </div>
    </Router>
  )
}

export default App
