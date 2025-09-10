
import { ProjectGalleryMasonry } from '../components/ProjectGalleryMasonry';

const projects = [
  { 
    id: '1', 
    name: 'Character Design', 
    snapshotUrl: "/projects/Character.png" 
  },
  { 
    id: '2', 
    name: 'Environment Concepts', 
    snapshotUrl: "/projects/Environment.png" 
  },
  { 
    id: '3', 
    name: 'Weapon Designs', 
    snapshotUrl: "/projects/Weapon.jpg" 
  },
  { 
    id: '4', 
    name: 'UI Elements', 
    snapshotUrl: "/projects/UI.png" 
  },
  { 
    id: '5', 
    name: 'Game Assets', 
    snapshotUrl: "/projects/3DAssets.png" 
  },
  { 
    id: '6', 
    name: 'Animation Storyboards', 
    snapshotUrl: "/projects/Storyboard.png" 
  },
  { 
    id: '7', 
    name: 'Level Design', 
    snapshotUrl: "/projects/Level.png" 
  },
  { 
    id: '8', 
    name: 'Character Poses', 
    snapshotUrl: "/projects/Pose.png" 
  }
];

export default function ProjectsPage() {
  return <ProjectGalleryMasonry projects={projects} />;
}