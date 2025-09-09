import React from 'react'
import Navbar from "./components/Navbar"
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom'
import './App.css'


import Home from './pages/index'
import About from './pages/about'
import Canvas from './pages/canvas'
import User from './pages/user'
import Team from './pages/team'
import Projects from './pages/projects'

function App() {
  return (
    <Router>
        
          <Navbar />
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/about" element={<About />} />
            <Route path="/canvas" element={<Canvas />} />
            <Route path="/user" element={<User />} />
            <Route path="/team" element={<Team />} />
            <Route path="/projects" element={<Projects />} />
          </Routes>
       
    </Router>
  )
}

export default App
