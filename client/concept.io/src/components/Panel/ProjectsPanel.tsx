

interface ProjectProps {
  id: string;
  name: string;
  description: string;
  image?: string; //last snapshot of opened project
}

const ProjectsPanel: React.FC<ProjectProps> = ({
    id
    }) => {


  return (
    <div>{id}</div>
  )
}

export default ProjectsPanel