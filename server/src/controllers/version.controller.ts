// Version Control REST API Controller
// Provides endpoints for initial version data loading

import { Request, Response } from 'express';
import Controller from './controller';
import DAC from '../db/dac';
import { randomUUID } from 'crypto';

const uuidv4 = () => randomUUID();

export class VersionController extends Controller {

    constructor() {
        super('/api/projects');
        // Bind methods to preserve 'this' context
        this.getVersionData = this.getVersionData.bind(this);
        this.getBranches = this.getBranches.bind(this);
        this.getSnapshots = this.getSnapshots.bind(this);
        this.getSnapshotById = this.getSnapshotById.bind(this);
        this.getResolvedSnapshot = this.getResolvedSnapshot.bind(this);
        this.createBranch = this.createBranch.bind(this);
        this.createSnapshot = this.createSnapshot.bind(this);
    }

    public initializeRoutes() {
        // Get all version data for a project (branches + snapshots)
        this.router.get('/:projectId/version', this.getVersionData);
        
        // Get all branches for a project
        this.router.get('/:projectId/branches', this.getBranches);
        
        // Get all snapshots for a project
        this.router.get('/:projectId/snapshots', this.getSnapshots);
        
        // Get a single snapshot by ID
        this.router.get('/:projectId/snapshots/:snapshotId', this.getSnapshotById);
        
        // Get a fully resolved snapshot (delta references resolved to full data)
        this.router.get('/:projectId/snapshots/:snapshotId/resolved', this.getResolvedSnapshot);
        
        // Create a new branch
        this.router.post('/:projectId/branches', this.createBranch);
        
        // Create a new snapshot
        this.router.post('/:projectId/snapshots', this.createSnapshot);
    }

    private async getVersionData(req: Request, res: Response) {
        try {
            const { projectId } = req.params;
            const versionData = await DAC.db.getVersionData(projectId);
            
            // If no branches exist, create default main branch
            if (versionData.branches.length === 0) {
                const mainBranch = {
                    id: uuidv4(),
                    projectId,
                    name: 'main',
                    headSnapshotId: '',
                    createdBy: 'system',
                    createdAt: Date.now(),
                    color: '#2b6cee',
                };
                await DAC.db.saveBranch(mainBranch);
                versionData.branches.push(mainBranch);
            }
            
            res.json({
                success: true,
                data: versionData,
            });
        } catch (error) {
            console.error('Error fetching version data:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch version data',
            });
        }
    }

    private async getBranches(req: Request, res: Response) {
        try {
            const { projectId } = req.params;
            const branches = await DAC.db.getBranchesByProject(projectId);
            
            res.json({
                success: true,
                data: branches,
            });
        } catch (error) {
            console.error('Error fetching branches:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch branches',
            });
        }
    }

    private async getSnapshots(req: Request, res: Response) {
        try {
            const { projectId } = req.params;
            const snapshots = await DAC.db.getSnapshotsByProject(projectId);
            
            res.json({
                success: true,
                data: snapshots,
            });
        } catch (error) {
            console.error('Error fetching snapshots:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch snapshots',
            });
        }
    }

    private async getSnapshotById(req: Request, res: Response) {
        try {
            const { snapshotId } = req.params;
            const snapshot = await DAC.db.getSnapshotById(snapshotId);
            
            if (!snapshot) {
                return res.status(404).json({
                    success: false,
                    error: 'Snapshot not found',
                });
            }
            
            res.json({
                success: true,
                data: snapshot,
            });
        } catch (error) {
            console.error('Error fetching snapshot:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch snapshot',
            });
        }
    }

    private async getResolvedSnapshot(req: Request, res: Response) {
        try {
            const { snapshotId } = req.params;
            const resolved = await DAC.db.resolveSnapshot(snapshotId);
            
            if (!resolved) {
                return res.status(404).json({
                    success: false,
                    error: 'Snapshot not found',
                });
            }
            
            res.json({
                success: true,
                data: resolved,
            });
        } catch (error) {
            console.error('Error resolving snapshot:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to resolve snapshot',
            });
        }
    }

    private async createBranch(req: Request, res: Response) {
        try {
            const { projectId } = req.params;
            const { name, fromSnapshotId, color, userId } = req.body;
            
            if (!name) {
                return res.status(400).json({
                    success: false,
                    error: 'Branch name is required',
                });
            }
            
            const branchColors = ['#2b6cee', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#ec4899'];
            const existingBranches = await DAC.db.getBranchesByProject(projectId);
            const colorIndex = existingBranches.length % branchColors.length;
            
            const branch = {
                id: uuidv4(),
                projectId,
                name,
                headSnapshotId: fromSnapshotId || '',
                createdBy: userId || 'anonymous',
                createdAt: Date.now(),
                color: color || branchColors[colorIndex],
            };
            
            const savedBranch = await DAC.db.saveBranch(branch);
            
            res.status(201).json({
                success: true,
                data: savedBranch,
            });
        } catch (error) {
            console.error('Error creating branch:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to create branch',
            });
        }
    }

    private async createSnapshot(req: Request, res: Response) {
        try {
            const { projectId } = req.params;
            const { name, description, branchId, layers, thumbnail, userId } = req.body;
            
            if (!name || !branchId) {
                return res.status(400).json({
                    success: false,
                    error: 'Snapshot name and branchId are required',
                });
            }
            
            // Get branch to find parent snapshot
            const branch = await DAC.db.getBranchById(branchId);
            
            const snapshot = {
                id: uuidv4(),
                projectId,
                branchId,
                name,
                description: description || '',
                layers: layers || [],
                thumbnail: thumbnail || '',
                createdBy: userId || 'anonymous',
                createdAt: Date.now(),
                parentSnapshotId: branch?.headSnapshotId || undefined,
            };
            
            const savedSnapshot = await DAC.db.saveSnapshot(snapshot);
            
            res.status(201).json({
                success: true,
                data: savedSnapshot,
            });
        } catch (error) {
            console.error('Error creating snapshot:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to create snapshot',
            });
        }
    }
}

export default VersionController;
