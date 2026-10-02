import express, { Express } from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import apiRouter from './routes/index.js';
import { errorHandler } from './middleware/errorHandler.js';
import { observabilityMiddleware, getSystemMetrics } from './middleware/observability.js';
import { config, isPilotMode } from './config.js';
import { db } from './prisma/db.js';

export function createApp(): Express {
  const app = express();

  // CORS configuration
  app.use(
    cors({
      origin: true,
      credentials: true,
    })
  );

  // Observability & Request Tracing Middleware
  app.use(observabilityMiddleware);

  app.use(express.json({ limit: '15mb' }));
  app.use(express.urlencoded({ extended: true, limit: '15mb' }));

  // Static storage path for uploaded lab record images
  const uploadDir = path.resolve(process.cwd(), '../storage/uploads');
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
  app.use('/uploads', express.static(uploadDir));

  // Health check endpoint
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'healthy',
      service: 'AI-Powered Secure Laboratory Record & Mark Management System',
      version: '1.0.0',
      pilotMode: isPilotMode(),
      timestamp: new Date().toISOString(),
    });
  });

  // Detailed Health Check for Production / Pilot Observability
  app.get('/api/health/detailed', async (_req, res) => {
    let dbStatus = 'healthy';
    try {
      const studentCount = db.students.length;
      if (studentCount === 0) dbStatus = 'initializing';
    } catch {
      dbStatus = 'degraded';
    }

    const storageStatus = fs.existsSync(uploadDir) ? 'healthy' : 'unavailable';

    res.json({
      status: dbStatus === 'healthy' && storageStatus === 'healthy' ? 'healthy' : 'degraded',
      service: 'SecureLab',
      pilotMode: isPilotMode(),
      environment: config.nodeEnv,
      components: {
        database: dbStatus,
        storage: storageStatus,
      },
      metrics: getSystemMetrics(),
      retentionPolicy: config.retention,
      timestamp: new Date().toISOString(),
    });
  });

  // Mount API router
  app.use('/api', apiRouter);

  // Centralized Error Handling Middleware
  app.use(errorHandler);

  return app;
}
