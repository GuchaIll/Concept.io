import React, { useEffect, useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import logoImage from '../assets/logo-transparent.png';
import featureImage from '../assets/vectorArt.jpg'; 


const AboutPage: React.FC = () => {
  const { scrollYProgress } = useScroll();

  const scrollTransform = useTransform(scrollYProgress, [0, 1], ["0%", "-100%"]);
            
  return (
    <div className="bg-gray-50 text-gray-800 overflow-x-hidden snap-y snap-mandatory relative">
      {/* Gradient Overlays for Smooth Transitions */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute inset-0 bg-gradient-to-b from-[#3D365C] via-[#F8B55F] to-[#7C4585] opacity-50" 
             style={{ transform: `translateY(${scrollTransform.get()})` }} />
      </div>

      {/* Mission / Hero Section */}
      <motion.section 
        className="relative h-screen flex items-center justify-center overflow-hidden bg-[#3D365C]/90 snap-start backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1 }}
      >
        <div className="absolute inset-0 bg-gradient-to-r from-[#3D365C]/90 to-[#3D365C]/70 z-10" />
        <div className="w-32 h-32 absolute top-1/3 left-1/4 bg-[#F8B55F] rounded-full blur-3xl opacity-20 animate-pulse" />
        <div className="w-40 h-40 absolute bottom-1/4 right-1/3 bg-[#C95792] rounded-full blur-3xl opacity-20 animate-pulse delay-1000" />
        
        <div className="relative z-20 text-center px-6">
          <motion.h1 
            className="text-7xl font-extrabold mb-4 text-white bg-clip-text"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.8 }}
          >
            Concept.io
          </motion.h1>
          <motion.div
            className="w-32 h-32 mx-auto mb-6"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.6 }}
          >
            <div className="w-full h-full  rounded-2xl flex items-center justify-center">
              <img 
                src={logoImage}         
                alt="App Logo" 
                className="w-24 h-24 object-contain " 
              />
            </div>
          </motion.div>
          <motion.p 
            className="text-xl md:text-2xl max-w-3xl mx-auto leading-relaxed text-white/90"
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.8 }}
          >
            A one-stop platform built for game developers to create, plan, and
            collaborate. Concept.io brings concept art, design documents,
            meetings, progress logs, and task management into a single
            productivity hub.
          </motion.p>
        </div>
        
        <motion.div
          className="absolute bottom-10 left-1/2 transform -translate-x-1/2"
          animate={{ y: [0, 10, 0] }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          <div className="text-white/50 text-sm">Scroll to explore</div>
          <div className="w-6 h-10 border-2 border-white/50 rounded-full mx-auto mt-2 relative">
            <div className="w-1.5 h-1.5 bg-white/50 rounded-full absolute left-1/2 top-2 transform -translate-x-1/2 animate-bounce" />
          </div>
        </motion.div>
      </motion.section>

      {/* Features & Goals */}
      <motion.section 
        className="min-h-screen py-20 px-8 bg-[#F8B55F]/80 relative overflow-hidden snap-start backdrop-blur-sm"
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.8 }}
      >
        <div className="max-w-7xl mx-auto">
          <motion.h2 
            className="text-4xl md:text-5xl font-bold mb-16 text-center text-gray-900"
            initial={{ y: 20, opacity: 0 }}
            whileInView={{ y: 0, opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
          >
            Features & Goals
          </motion.h2>


          <div className="grid md:grid-cols-2 gap-12 mb-8">
            <motion.div
              className="bg-white rounded-2xl shadow-lg p-8 transform hover:scale-105 transition-transform"
              initial={{ x: -50, opacity: 0 }}
              whileInView={{ x: 0, opacity: 1 }}
              viewport={{ once: true }}
              transition={{ delay: 0.3 }}
              whileHover={{ y: -5 }}
            >
              <div className="w-16 h-16 bg-[#3D365C] rounded-xl mb-6 flex items-center justify-center">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              </div>
              <h3 className="text-2xl font-semibold mb-4">Collaboration First</h3>
              <p className="text-gray-600 leading-relaxed">
                Empower your team to collaborate seamlessly on game design, with
                shared concept art boards, real-time feedback, and task tracking.
              </p>
            </motion.div>

            <motion.div
              className="bg-white rounded-2xl shadow-lg p-8 transform hover:scale-105 transition-transform"
              initial={{ x: 50, opacity: 0 }}
              whileInView={{ x: 0, opacity: 1 }}
              viewport={{ once: true }}
              transition={{ delay: 0.4 }}
              whileHover={{ y: -5 }}
            >
              <div className="w-16 h-16 bg-[#C95792] rounded-xl mb-6 flex items-center justify-center">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
              </div>
              <h3 className="text-2xl font-semibold mb-4">Centralized Hub</h3>
              <p className="text-gray-600 leading-relaxed">
                Store and manage your ideas, art, and progress logs in one secure
                location — never lose track of your game development journey.
              </p>
            </motion.div>
          </div>
          <div className="flex items-center justify-center w-full">
          <motion.div
            className="w-128 h-72 mb-16 rounded-2xl overflow-hidden"
            initial={{ y: 20, opacity: 0 }}
            whileInView={{ y: 0, opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.3 }}
          >
            <div className="mt-12 w-full h-full bg-white/20 backdrop-blur-sm flex items-center justify-center border-2 border-white/10">
              <img
                src= {featureImage}
                alt="Feature Illustration"
                className="w-full object-cover"
              />
            </div>
          </motion.div>
          </div>
        </div>
      </motion.section>

      {/* Drawing Tools */}
      <motion.section 
        className="min-h-screen py-20 px-8 bg-[#7C4585]/90 relative overflow-hidden snap-start backdrop-blur-sm"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.8 }}
      >
        <div className="max-w-7xl mx-auto relative z-10">
          <motion.h2 
            className="text-4xl md:text-5xl font-bold mb-16 text-center text-white"
            initial={{ y: 20, opacity: 0 }}
            whileInView={{ y: 0, opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
          >
            Drawing Tools
          </motion.h2>

          <div className="grid md:grid-cols-3 gap-8">
            {/* Tool Cards */}
            {[
              {
                title: "Brush & Pen Tools",
                description: "Customizable brushes, pens, and textures for sketching and inking.",
                delay: 0.3
              },
              {
                title: "Layers & Blending",
                description: "Organize your artwork with unlimited layers and blending modes.",
                delay: 0.4
              },
              {
                title: "Export & Sharing",
                description: "Export high-resolution images or share snapshots instantly with your team.",
                delay: 0.5
              }
            ].map((tool) => (
              <motion.div
                key={tool.title}
                className="bg-white/10 backdrop-blur-lg rounded-xl p-6 text-white"
                initial={{ y: 50, opacity: 0 }}
                whileInView={{ y: 0, opacity: 1 }}
                viewport={{ once: true }}
                transition={{ delay: tool.delay }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <h3 className="text-xl font-semibold mb-4">{tool.title}</h3>
                <p className="text-white/80 mb-4">{tool.description}</p>
                <div className="w-full h-32 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center">
                  <div className="text-center">
                    <div className="w-8 h-8 mx-auto mb-2 rounded-full bg-white/10 flex items-center justify-center">
                      <svg className="w-4 h-4 text-white/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <span className="text-white/40 text-sm">Tool Demo</span>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Background Elements */}
        <div className="absolute top-0 right-0 w-1/3 h-1/3 bg-[#C95792] opacity-20 blur-3xl" />
        <div className="absolute bottom-0 left-0 w-1/2 h-1/2 bg-[#3D365C] opacity-20 blur-3xl" />
      </motion.section>

      {/* Project Management */}
      <motion.section 
        className="min-h-screen py-20 px-8 bg-white/95 relative overflow-hidden snap-start backdrop-blur-sm"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.8 }}
      >
        <motion.div 
          className="max-w-7xl mx-auto"
          initial={{ y: 20, opacity: 0 }}
          whileInView={{ y: 0, opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.2 }}
        >
          <h2 className="text-4xl md:text-5xl font-bold mb-16 text-center text-[#3D365C]">
            Project Management
          </h2>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                title: "Task Assignment",
                description: "Assign and track tasks across your team with deadlines and priorities.",
                delay: 0.3
              },
              {
                title: "Progress Logs",
                description: "Keep a running log of achievements, updates, and milestones.",
                delay: 0.4
              },
              {
                title: "Meeting Notes",
                description: "Plan upcoming meetings and store discussions for reference anytime.",
                delay: 0.5
              }
            ].map((feature) => (
              <motion.div
                key={feature.title}
                className="bg-gray-50 p-8 rounded-xl shadow-lg hover:shadow-xl transition-shadow"
                initial={{ y: 50, opacity: 0 }}
                whileInView={{ y: 0, opacity: 1 }}
                viewport={{ once: true }}
                transition={{ delay: feature.delay }}
                whileHover={{ y: -5 }}
              >
                <img
                    src="/images/redPin.png" 
                    alt="Pin"
                    className="absolute -top-8 -right-4 w-32 h-32 z-20 rotate-[-12deg] drop-shadow-md pointer-events-none"
                />
                <h3 className="text-xl font-semibold mb-4 text-[#3D365C]">{feature.title}</h3>
                <p className="text-gray-600 mb-4">{feature.description}</p>
                <ul className="list-disc list-inside text-gray-600 space-y-2">
                  {feature.title === "Task Assignment" && [
                    "Priority-based task organization",
                    "Drag-and-drop task management",
                    "Due date tracking and reminders"
                  ].map((item) => (
                    <li key={item} className="text-sm">{item}</li>
                  ))}
                  {feature.title === "Progress Logs" && [
                    "Visual progress tracking",
                    "Automated milestone updates",
                    "Team activity timeline"
                  ].map((item) => (
                    <li key={item} className="text-sm">{item}</li>
                  ))}
                  {feature.title === "Meeting Notes" && [
                    "Real-time collaborative note-taking",
                    "Action item assignment",
                    "Meeting history and search"
                  ].map((item) => (
                    <li key={item} className="text-sm">{item}</li>
                  ))}
                </ul>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Background Decoration */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-[#F8B55F] opacity-10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-[#7C4585] opacity-5 rounded-full blur-3xl" />
      </motion.section>
    </div>
  );
};

export default AboutPage;