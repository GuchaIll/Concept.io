import {  useState } from "react";


export interface Project {
    id: string;
    name: string;
    description: string;
    image: string;
}

export const useProject = () => {
    const [projectList, setProjectList] = useState<Project[]>([]);

    const addNewProject = (project: Project) => {
        setProjectList([...projectList, project]);
    };

    const deleteProject = (project : Project) => 
    {
        setProjectList(projectList.filter(p => p.id !== project.id));
    }

    const saveProject = () =>
    {

    }

    return { projectList, 
        setProjectList,
        addNewProject,
        deleteProject,
        saveProject
    };
}