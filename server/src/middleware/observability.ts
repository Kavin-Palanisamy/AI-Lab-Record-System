/**
 * Phase 9: Production Observability & Telemetry Middleware
 * ========================================================
 * Implements:
 *  - Unique Request IDs (X-Request-Id)
 *  - Structured access and processing logs
 *  - Submission processing time tracking
 *  - AI microservice latency monitoring
 *  - Faculty review latency tracking
 *  - Error count metrics
 */

import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

export interface PerformanceMetrics {
  totalRequests: number;
  totalSubmissions: number;
  totalErrors: number;
  submissionLatenciesMs: number[];
  aiProcessingLatenciesMs: number[];
  facultyReviewLatenciesSeconds: number[];
}

const metrics: PerformanceMetrics = {
  totalRequests: 0,
  totalSubmissions: 0,
  totalErrors: 0,
  submissionLatenciesMs: [],
  aiProcessingLatenciesMs: [],
  facultyReviewLatenciesSeconds: [],
};

export function observabilityMiddleware(req: Request, res: Response, next: NextFunction): void {
  const startTime = Date.now();
  const requestId = (req.headers['x-request-id'] as string) || crypto.randomUUID();

  // Attach request ID to response header
  res.setHeader('X-Request-Id', requestId);
  (req as any).requestId = requestId;
  (req as any).startTime = startTime;

  metrics.totalRequests++;

  res.on('finish', () => {
    const duration = Date.now() - startTime;
    if (res.statusCode >= 400) {
      metrics.totalErrors++;
    }

    // Track submission routes
    if (req.originalUrl?.includes('/ownership-analysis') || req.originalUrl?.includes('/submit')) {
      metrics.totalSubmissions++;
      metrics.submissionLatenciesMs.push(duration);
      if (metrics.submissionLatenciesMs.length > 500) {
        metrics.submissionLatenciesMs.shift();
      }
    }
  });

  next();
}

export function recordAiProcessingTime(durationMs: number): void {
  metrics.aiProcessingLatenciesMs.push(durationMs);
  if (metrics.aiProcessingLatenciesMs.length > 500) {
    metrics.aiProcessingLatenciesMs.shift();
  }
}

export function recordFacultyReviewTime(durationSeconds: number): void {
  metrics.facultyReviewLatenciesSeconds.push(durationSeconds);
  if (metrics.facultyReviewLatenciesSeconds.length > 500) {
    metrics.facultyReviewLatenciesSeconds.shift();
  }
}

export function getSystemMetrics(): {
  totalRequests: number;
  totalSubmissions: number;
  totalErrors: number;
  avgSubmissionLatencyMs: number;
  avgAiProcessingLatencyMs: number;
  avgFacultyReviewDurationSeconds: number;
} {
  const avg = (arr: number[]) => (arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);

  return {
    totalRequests: metrics.totalRequests,
    totalSubmissions: metrics.totalSubmissions,
    totalErrors: metrics.totalErrors,
    avgSubmissionLatencyMs: Math.round(avg(metrics.submissionLatenciesMs)),
    avgAiProcessingLatencyMs: Math.round(avg(metrics.aiProcessingLatenciesMs)),
    avgFacultyReviewDurationSeconds: Math.round(avg(metrics.facultyReviewLatenciesSeconds)),
  };
}

export function resetSystemMetrics(): void {
  metrics.totalRequests = 0;
  metrics.totalSubmissions = 0;
  metrics.totalErrors = 0;
  metrics.submissionLatenciesMs = [];
  metrics.aiProcessingLatenciesMs = [];
  metrics.facultyReviewLatenciesSeconds = [];
}
