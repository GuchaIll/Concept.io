/**
 * Unit tests for the Generation Controller and Diffusion Service
 * 
 * Run with: npx jest src/__tests__/generation.controller.test.ts
 */

import request from 'supertest';
import express from 'express';

// Mock BullMQ before importing anything that uses it
jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({
    add: jest.fn().mockResolvedValue({ id: 'mock-job-id' }),
    getWaiting: jest.fn().mockResolvedValue([]),
    getWaitingCount: jest.fn().mockResolvedValue(0),
    getActiveCount: jest.fn().mockResolvedValue(0),
    getCompletedCount: jest.fn().mockResolvedValue(0),
    getFailedCount: jest.fn().mockResolvedValue(0),
    getJob: jest.fn().mockResolvedValue(null),
    close: jest.fn().mockResolvedValue(undefined),
  })),
  Worker: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    close: jest.fn().mockResolvedValue(undefined),
  })),
  QueueEvents: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    close: jest.fn().mockResolvedValue(undefined),
  })),
}));

// Mock uuid
jest.mock('uuid', () => ({
  v4: jest.fn().mockImplementation(() => `mock-uuid-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`),
}));

// Import after mocking
import generateRouter from '../api/generate.controller';

describe('Generation Controller', () => {
  let app: express.Express;

  beforeEach(() => {
    // Create fresh app for each test
    app = express();
    app.use(express.json());
    app.use('/api/generate', generateRouter);
  });

  describe('POST /api/generate', () => {
    it('should return 400 if prompt is missing', async () => {
      const response = await request(app)
        .post('/api/generate')
        .send({ 
          userId: 'test-user',
          projectId: 'test-project',
          width: 512, 
          height: 512 
        });
      
      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Prompt');
    });

    it('should return 400 if userId is missing', async () => {
      const response = await request(app)
        .post('/api/generate')
        .send({ 
          prompt: 'test prompt',
          projectId: 'test-project'
        });
      
      expect(response.status).toBe(400);
      expect(response.body.error).toContain('userId');
    });

    it('should return 400 if projectId is missing', async () => {
      const response = await request(app)
        .post('/api/generate')
        .send({ 
          prompt: 'test prompt',
          userId: 'test-user'
        });
      
      expect(response.status).toBe(400);
      expect(response.body.error).toContain('projectId');
    });

    it('should return 202 with job ID for valid request', async () => {
      const response = await request(app)
        .post('/api/generate')
        .send({
          prompt: 'test prompt',
          userId: 'test-user',
          projectId: 'test-project',
          width: 512,
          height: 512,
          model: 'sd15'
        });
      
      expect(response.status).toBe(202);
      expect(response.body).toHaveProperty('jobId');
      expect(response.body.success).toBe(true);
    });

    it('should accept all optional parameters', async () => {
      const response = await request(app)
        .post('/api/generate')
        .send({
          prompt: 'detailed prompt',
          negativePrompt: 'ugly, blurry',
          width: 768,
          height: 512,
          steps: 25,
          guidanceScale: 8.0,
          model: 'sdxl',
          seed: 42,
          userId: 'test-user',
          projectId: 'test-project'
        });
      
      expect(response.status).toBe(202);
      expect(response.body).toHaveProperty('jobId');
    });

    it('should use default values for missing optional params', async () => {
      const response = await request(app)
        .post('/api/generate')
        .send({ 
          prompt: 'minimal request',
          userId: 'test-user',
          projectId: 'test-project'
        });
      
      expect(response.status).toBe(202);
      expect(response.body.success).toBe(true);
    });

    it('should create unique job IDs', async () => {
      const response1 = await request(app)
        .post('/api/generate')
        .send({ 
          prompt: 'test 1',
          userId: 'test-user',
          projectId: 'test-project'
        });
      
      const response2 = await request(app)
        .post('/api/generate')
        .send({ 
          prompt: 'test 2',
          userId: 'test-user',
          projectId: 'test-project'
        });
      
      expect(response1.body.jobId).not.toBe(response2.body.jobId);
    });

    it('should include estimated time in response', async () => {
      const response = await request(app)
        .post('/api/generate')
        .send({
          prompt: 'test',
          userId: 'test-user',
          projectId: 'test-project',
          model: 'sd15'
        });
      
      expect(response.body).toHaveProperty('estimatedTime');
      expect(response.body.estimatedTime).toBeGreaterThan(0);
    });

    it('should include queue position in response', async () => {
      const response = await request(app)
        .post('/api/generate')
        .send({
          prompt: 'test',
          userId: 'test-user',
          projectId: 'test-project'
        });
      
      expect(response.body).toHaveProperty('queuePosition');
      expect(response.body.queuePosition).toBeGreaterThanOrEqual(1);
    });

    it('should accept selection bounds parameter', async () => {
      const response = await request(app)
        .post('/api/generate')
        .send({
          prompt: 'test with bounds',
          userId: 'test-user',
          projectId: 'test-project',
          selectionBounds: {
            left: 100,
            top: 100,
            width: 512,
            height: 512
          }
        });
      
      expect(response.status).toBe(202);
      expect(response.body.success).toBe(true);
    });
  });

  describe('GET /api/generate/status/:jobId', () => {
    it('should return 404 for unknown job ID', async () => {
      const response = await request(app)
        .get('/api/generate/status/unknown-job-id');
      
      expect(response.status).toBe(404);
    });

    it('should return job status for existing job', async () => {
      // Create a job first
      const createResponse = await request(app)
        .post('/api/generate')
        .send({ 
          prompt: 'test prompt',
          userId: 'test-user',
          projectId: 'test-project'
        });
      
      const jobId = createResponse.body.jobId;
      
      // Get its status
      const statusResponse = await request(app)
        .get(`/api/generate/status/${jobId}`);
      
      expect(statusResponse.status).toBe(200);
      expect(statusResponse.body).toHaveProperty('status');
      expect(statusResponse.body).toHaveProperty('progress');
    });

    it('should include progress percentage', async () => {
      const createResponse = await request(app)
        .post('/api/generate')
        .send({ 
          prompt: 'test',
          userId: 'test-user',
          projectId: 'test-project'
        });
      
      const statusResponse = await request(app)
        .get(`/api/generate/status/${createResponse.body.jobId}`);
      
      expect(typeof statusResponse.body.progress).toBe('number');
      expect(statusResponse.body.progress).toBeGreaterThanOrEqual(0);
      expect(statusResponse.body.progress).toBeLessThanOrEqual(100);
    });
  });

  describe('DELETE /api/generate/:jobId', () => {
    it('should return 404 for unknown job', async () => {
      const response = await request(app)
        .delete('/api/generate/unknown-id');
      
      expect(response.status).toBe(404);
    });
  });

  describe('GET /api/generate/jobs/:userId', () => {
    it('should return jobs list for user', async () => {
      const response = await request(app)
        .get('/api/generate/jobs/test-user');
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('jobs');
      expect(Array.isArray(response.body.jobs)).toBe(true);
    });
  });

  describe('GET /api/generate/queue/stats', () => {
    it('should return queue statistics', async () => {
      const response = await request(app)
        .get('/api/generate/queue/stats');
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('waiting');
      expect(response.body).toHaveProperty('active');
      expect(response.body).toHaveProperty('completed');
      expect(response.body).toHaveProperty('failed');
    });
  });

  describe('Concurrent Requests', () => {
    it('should handle multiple simultaneous requests', async () => {
      const promises = Array(5).fill(null).map((_, i) =>
        request(app)
          .post('/api/generate')
          .send({ 
            prompt: `concurrent test ${i}`,
            userId: 'test-user',
            projectId: 'test-project'
          })
      );
      
      const responses = await Promise.all(promises);
      
      responses.forEach(response => {
        expect(response.status).toBe(202);
        expect(response.body).toHaveProperty('jobId');
      });
      
      // All job IDs should be unique
      const jobIds = responses.map(r => r.body.jobId);
      const uniqueIds = new Set(jobIds);
      expect(uniqueIds.size).toBe(5);
    });
  });
});

describe('Input Validation', () => {
  let app: express.Express;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/generate', generateRouter);
  });

  it('should handle empty prompt gracefully', async () => {
    const response = await request(app)
      .post('/api/generate')
      .send({ 
        prompt: '',
        userId: 'test-user',
        projectId: 'test-project'
      });
    
    // Empty string is falsy, should be rejected
    expect(response.status).toBe(400);
  });

  it('should handle very long prompts', async () => {
    const longPrompt = 'a '.repeat(1000);
    const response = await request(app)
      .post('/api/generate')
      .send({ 
        prompt: longPrompt,
        userId: 'test-user',
        projectId: 'test-project'
      });
    
    // Should accept long prompts (or gracefully handle)
    expect([202, 400]).toContain(response.status);
  });

  it('should handle special characters in prompt', async () => {
    const response = await request(app)
      .post('/api/generate')
      .send({ 
        prompt: 'test with <script>alert("xss")</script> and "quotes"',
        userId: 'test-user',
        projectId: 'test-project'
      });
    
    expect(response.status).toBe(202);
  });

  it('should handle unicode in prompt', async () => {
    const response = await request(app)
      .post('/api/generate')
      .send({ 
        prompt: 'test with unicode: 🎨 🖼️ 日本語',
        userId: 'test-user',
        projectId: 'test-project'
      });
    
    expect(response.status).toBe(202);
  });
});
