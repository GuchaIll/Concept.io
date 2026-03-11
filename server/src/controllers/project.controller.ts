// Project Management REST API Controller
// Provides CRUD endpoints for multi-session support

import { Request, Response } from 'express';
import Controller from './controller';
import DAC from '../db/dac';
import { randomUUID } from 'crypto';

const uuidv4 = () => randomUUID();

export class ProjectController extends Controller {

    constructor() {
        super('/api/projects');
        this.listProjects = this.listProjects.bind(this);
        this.getProject = this.getProject.bind(this);
        this.createProject = this.createProject.bind(this);
        this.updateProject = this.updateProject.bind(this);
        this.deleteProject = this.deleteProject.bind(this);
    }

    public initializeRoutes() {
        // List all projects (optionally filter by user)
        this.router.get('/', this.listProjects);
        
        // Get single project by ID
        this.router.get('/:projectId', this.getProject);
        
        // Create a new project
        this.router.post('/', this.createProject);
        
        // Update project metadata
        this.router.patch('/:projectId', this.updateProject);
        
        // Delete a project and all associated data
        this.router.delete('/:projectId', this.deleteProject);
    }

    private async listProjects(req: Request, res: Response) {
        try {
            const { userId } = req.query;
            const projects = userId
                ? await DAC.db.getProjectsByUser(userId as string)
                : await DAC.db.getAllProjects();
            
            res.json({
                success: true,
                data: projects,
            });
        } catch (error) {
            console.error('Error listing projects:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to list projects',
            });
        }
    }

    private async getProject(req: Request, res: Response) {
        try {
            const { projectId } = req.params;
            
            // Skip if this is a version/branches/snapshots sub-route
            // (those are handled by VersionController)
            if (['version', 'branches', 'snapshots'].includes(projectId)) {
                return res.status(404).json({ success: false, error: 'Not found' });
            }
            
            const project = await DAC.db.getProjectById(projectId);
            
            if (!project) {
                return res.status(404).json({
                    success: false,
                    error: 'Project not found',
                });
            }
            
            res.json({
                success: true,
                data: project,
            });
        } catch (error) {
            console.error('Error fetching project:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch project',
            });
        }
    }

    private async createProject(req: Request, res: Response) {
        try {
            const { name, description, userId, canvasWidth, canvasHeight, settings } = req.body;
            
            if (!name) {
                return res.status(400).json({
                    success: false,
                    error: 'Project name is required',
                });
            }
            
            const now = Date.now();
            const project = {
                id: uuidv4(),
                name,
                description: description || '',
                createdBy: userId || 'anonymous',
                createdAt: now,
                updatedAt: now,
                canvasWidth: canvasWidth || 1920,
                canvasHeight: canvasHeight || 1080,
                settings: settings || {},
            };
            
            const saved = await DAC.db.saveProject(project);
            
            // Auto-create a main branch for the project
            await DAC.db.saveBranch({
                id: uuidv4(),
                projectId: saved.id,
                name: 'main',
                headSnapshotId: '',
                createdBy: project.createdBy,
                createdAt: now,
                color: '#2b6cee',
            });
            
            res.status(201).json({
                success: true,
                data: saved,
            });
        } catch (error) {
            console.error('Error creating project:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to create project',
            });
        }
    }

    private async updateProject(req: Request, res: Response) {
        try {
            const { projectId } = req.params;
            const updates = req.body;
            
            const updated = await DAC.db.updateProject(projectId, updates);
            
            if (!updated) {
                return res.status(404).json({
                    success: false,
                    error: 'Project not found',
                });
            }
            
            res.json({
                success: true,
                data: updated,
            });
        } catch (error) {
            console.error('Error updating project:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to update project',
            });
        }
    }

    private async deleteProject(req: Request, res: Response) {
        try {
            const { projectId } = req.params;
            
            const project = await DAC.db.getProjectById(projectId);
            if (!project) {
                return res.status(404).json({
                    success: false,
                    error: 'Project not found',
                });
            }
            
            await DAC.db.deleteProject(projectId);
            
            res.json({
                success: true,
                message: 'Project deleted successfully',
            });
        } catch (error) {
            console.error('Error deleting project:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to delete project',
            });
        }
    }
}

export default ProjectController;
