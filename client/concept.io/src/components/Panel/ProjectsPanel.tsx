import React from 'react'

interface ProjectProps {
  id: string;
  name: string;
  description: string;
  image?: string; //last snapshot of opened project
}

const ProjectsPanel: React.FC<ProjectProps> = ({
    id,
    name,
    description,
    image
    }) => {


  return (
    <div>{id}</div>
  )
}

export default ProjectsPanel