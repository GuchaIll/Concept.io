import React from 'react';
import { motion } from 'framer-motion';

interface Project {
  id: string;
  name: string;
  snapshotUrl: string;
}

interface GalleryProps {
  projects: Project[];
}

const colors = ['#3D365C', '#7C4585', '#C95792', '#F8B55F'];

export const ProjectGalleryMasonry: React.FC<GalleryProps> = ({ projects }) => {
  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 p-8">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6 }}
        className="max-w-[2000px] mx-auto"
      >
        <motion.h1 
          className="text-4xl md:text-5xl font-bold text-center mb-8 text-[#3D365C]"
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.6 }}
        >
          Your Projects
        </motion.h1>
        
        <div className="columns-1 sm:columns-2 md:columns-3 lg:columns-4 gap-6 space-y-6">
          {projects.map((project, index) => (
            <motion.div
              key={project.id}
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: index * 0.1, duration: 0.6 }}
              className="break-inside-avoid group"
            >
              <div 
                className="bg-white/80 backdrop-blur-sm rounded-xl shadow-md overflow-hidden flex flex-col cursor-pointer transform transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-[#3D365C]/10"
                style={{ borderTop: `4px solid ${colors[index % colors.length]}` }}
              >
                <div className="relative overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end p-4">
                    <span className="text-white text-sm font-medium">Click to open</span>
                  </div>
                  <img
                    src={project.snapshotUrl}
                    alt={project.name}
                    loading="lazy"
                    className="w-full h-48 object-cover transform transition-transform duration-300 group-hover:scale-105"
                  />
                </div>
                <div className="p-4">
                  <h3 className="text-lg font-semibold text-[#3D365C] mb-2">
                    {project.name}
                  </h3>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <div className="size-8 rounded-lg bg-gradient-to-br from-[#F8B55F] to-[#C95792] p-0.5">
                        <div className="h-full w-full rounded-[7px] bg-white flex items-center justify-center">
                          <span className="text-[#3D365C]/70 text-xs font-medium">23%</span>
                        </div>
                      </div>
                      <span className="text-sm text-gray-600">In Progress</span>
                    </div>
                    <button className="text-sm text-[#7C4585] hover:text-[#C95792] transition-colors duration-200">
                      View Details →
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </div>
  );
};
