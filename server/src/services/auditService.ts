export interface CreateAuditLogParams {
  actorType: 'STUDENT' | 'FACULTY' | 'SYSTEM';
  actorId: string;
  action:
    | 'SUBMISSION_CREATED'
    | 'SUBMISSION_REJECTED_OWNERSHIP_MISMATCH'
    | 'SUBMISSION_REJECTED_INVALID_QR'
    | 'SUBMISSION_REJECTED_DUPLICATE'
    | 'DOCUMENT_ANALYSIS_COMPLETED'
    | 'DOCUMENT_SUSPICIOUS'
    | 'LOW_IMAGE_QUALITY'
    | 'MARK_LOW_CONFIDENCE'
    | 'MARK_MISMATCH'
    | 'FACULTY_MANUAL_REVIEW'
    | 'FACULTY_APPROVED'
    | 'FACULTY_REJECTED'
    | 'FACULTY_CORRECTED_MARK'
    | 'FACULTY_AWARDED_MARK'
    | 'RECORDS_GENERATED'
    | 'SESSION_CREATED'
    | 'SESSION_STATUS_CHANGED'
    | 'EXCEL_EXPORTED'
    | 'STUDENT_LOGIN'
    | 'FACULTY_LOGIN'
    | 'RECORD_ACCESSED'
    | string;
  entityType: 'LabRecord' | 'Student' | 'Faculty' | 'Auth' | 'LabSession' | string;
  entityId: string;
  metadata?: Record<string, any>;
}

export interface IAuditRepository {
  createAuditLog(params: CreateAuditLogParams): Promise<any>;
  getAuditLogs(limit?: number): Promise<any[]>;
  getLogsByEntity(entityType: string, entityId: string): Promise<any[]>;
}

export class AuditService {
  constructor(private repo: IAuditRepository) {}

  async log(params: CreateAuditLogParams) {
    try {
      return await this.repo.createAuditLog(params);
    } catch (err) {
      console.error('Failed to create audit log:', err);
    }
  }

  async getRecentLogs(limit = 100) {
    return this.repo.getAuditLogs(limit);
  }

  async getLogsForRecord(recordId: string) {
    return this.repo.getLogsByEntity('LabRecord', recordId);
  }
}
