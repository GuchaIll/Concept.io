


export interface Project {
  id: string;
  name: string;
  snapshotUrl: string;
}

export interface GalleryProps {
  projects: Project[];
}


const colors = ['#3D365C', '#7C4585', '#C95792', '#F8B55F'];

export const ProjectGallery: React.FC<GalleryProps> = ({ projects }) => {
  return (
    <div className="p-8 bg-gray-50">
      <div className="grid gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 auto-rows-fr">
        {projects.map((project, index) => (
          <div
            key={project.id}
            className="bg-white rounded-xl shadow-md overflow-hidden flex flex-col cursor-pointer transform transition-transform duration-200 hover:-translate-y-1 hover:shadow-lg"
            style={{ borderTop: `4px solid ${colors[index % colors.length]}` }}
          >
            <img
              src={project.snapshotUrl}
              alt={project.name}
              className="w-full h-48 object-cover"
            />
            <div className="p-4 text-center font-semibold text-[#3D365C]">
              {project.name}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};