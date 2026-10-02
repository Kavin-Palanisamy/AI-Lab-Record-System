/**
 * Phase 9: Production & Real EEE Pilot Configuration
 * ===================================================
 * Centralized, validated environment configuration with support for:
 *  - PILOT_MODE=true production-style physical notebook workflow
 *  - Configurable data retention policies
 *  - Structured observability settings
 *  - Zero hardcoded production secrets
 */

import dotenv from 'dotenv';
dotenv.config();

export interface DataRetentionPolicy {
  recordImagesDays: number;
  aiAnalysisDays: number;
  auditLogsDays: number;
  writerProfilesDays: number;
}

export interface PilotConfiguration {
  pilotMode: boolean;
  institutionName: string;
  department: string;
  academicYear: string;
  allowSyntheticFixtures: boolean;
  maxUploadSizeBytes: number;
  allowedMimeTypes: string[];
}

export interface AppConfig {
  port: number;
  nodeEnv: string;
  jwtSecret: string;
  jwtExpiresIn: string;
  uploadDir: string;
  clientUrl: string;
  aiServiceUrl: string;
  pilot: PilotConfiguration;
  retention: DataRetentionPolicy;
  observability: {
    logLevel: 'debug' | 'info' | 'warn' | 'error';
    enableRequestTracing: boolean;
  };
}

const isPilot = process.env.PILOT_MODE === 'true';

export const config: AppConfig = {
  port: parseInt(process.env.PORT || '5000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  jwtSecret: process.env.JWT_SECRET || 'secure-ai-lab-record-system-jwt-token-secret-key-2026',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '24h',
  uploadDir: process.env.UPLOAD_DIR || './storage/uploads',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  aiServiceUrl: process.env.AI_SERVICE_URL || 'http://localhost:8000',
  pilot: {
    pilotMode: isPilot,
    institutionName: process.env.INSTITUTION_NAME || 'Department of Electrical & Electronics Engineering',
    department: 'EEE',
    academicYear: '2026-2027',
    // In pilot mode, strictly disallow synthetic demo bypasses and fixtures
    allowSyntheticFixtures: !isPilot,
    maxUploadSizeBytes: 15 * 1024 * 1024, // 15MB
    allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
  },
  retention: {
    recordImagesDays: parseInt(process.env.RETENTION_RECORD_IMAGES_DAYS || '365', 10),
    aiAnalysisDays: parseInt(process.env.RETENTION_AI_ANALYSIS_DAYS || '730', 10),
    auditLogsDays: parseInt(process.env.RETENTION_AUDIT_LOGS_DAYS || '1825', 10), // 5 years
    writerProfilesDays: parseInt(process.env.RETENTION_WRITER_PROFILES_DAYS || '1095', 10), // 3 years
  },
  observability: {
    logLevel: (process.env.LOG_LEVEL as any) || 'info',
    enableRequestTracing: true,
  },
};

export function isPilotMode(): boolean {
  return config.pilot.pilotMode || process.env.PILOT_MODE === 'true';
}

export function setPilotMode(enabled: boolean): void {
  config.pilot.pilotMode = enabled;
  config.pilot.allowSyntheticFixtures = !enabled;
  process.env.PILOT_MODE = enabled ? 'true' : 'false';
}

export function getRetentionPolicy(): DataRetentionPolicy {
  return { ...config.retention };
}
