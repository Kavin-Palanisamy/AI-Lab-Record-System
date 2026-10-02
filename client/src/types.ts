export type UserRole = 'STUDENT' | 'FACULTY';

export type RecordStatus = 'PENDING' | 'VERIFIED' | 'REJECTED' | 'MANUAL_REVIEW';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  registerNumber?: string;
  className?: string;
  section?: string;
  department?: string;
}

export interface Experiment {
  id: string;
  experimentNumber: number;
  title: string;
  subject: string;
  description: string;
  endBoxPageNumber?: number;
  maxMark?: number;
  isActive?: boolean;
  department?: string;
  academicYear?: string;
  semester?: string;
  section?: string;
  createdAt: string;
}

export interface StudentRosterImportResult {
  totalRows: number;
  imported: number;
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
  students: Array<{
    registerNumber: string;
    name: string;
    email: string;
    section: string;
    className: string;
    isNew: boolean;
  }>;
}

export type SessionStatus = 'DRAFT' | 'ACTIVE' | 'ENDED' | 'LOCKED';

export interface LabSession {
  id: string;
  experimentId: string;
  facultyId: string;
  sessionDate: string;
  sessionCode: string;
  subject?: string;
  className?: string;
  section?: string;
  maxMark?: number;
  startTime?: string;
  endTime?: string;
  status?: SessionStatus;
  templateVersion?: string;
  lockedAt?: string | null;
  createdAt: string;
  experiment?: Experiment;
}

export interface FacultyCorrection {
  originalMark: number | null;
  correctedMark: number;
  facultyId: string;
  timestamp: string;
  reason: string;
}

export interface LabRecord {
  id: string;
  studentId: string;
  experimentId: string;
  labSessionId: string;
  uniqueRecordCode: string;
  qrToken: string;
  templateVersion?: string;
  reviewDurationSeconds?: number;
  imagePath: string | null;
  detectedStudentRegisterNumber: string | null;
  detectedMark: number | null;
  facultyAwardedMark?: number | null;
  markVerificationStatus?: string | null;
  maxMark: number;
  status: RecordStatus;
  aiConfidence?: number | null;
  aiExtractedData?: string | null;
  facultySignaturePresent?: boolean | null;
  manualReviewReason?: string | null;
  facultyCorrectionHistory?: string | null;
  submissionTimestamp?: string | null;
  firstSubmittedAt?: string | null;
  lastSubmittedAt?: string | null;
  submissionCount?: number;
  lifecycleState?: string;
  isLocked?: boolean;
  verificationBreakdown?: VerificationBreakdown | null;
  reviewPriority?: ReviewPriorityCategory | null;
  createdAt: string;
  updatedAt: string;
  student?: {
    id: string;
    name: string;
    registerNumber: string;
    className: string;
    section: string;
  };
  experiment?: Experiment;
  labSession?: LabSession;
}

export interface AuditLog {
  id: string;
  actorType: 'STUDENT' | 'FACULTY' | 'SYSTEM';
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  metadata: string;
  createdAt: string;
}

export interface FacultyDashboardStats {
  totalSubmissions: number;
  verifiedCount: number;
  pendingReviewCount: number;
  rejectedCount: number;
  totalRecords: number;
}

export interface AiBoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TemplateRegions {
  studentNameRegion?: AiBoundingBox;
  registerNumberRegion?: AiBoundingBox;
  experimentNumberRegion?: AiBoundingBox;
  experimentTitleRegion?: AiBoundingBox;
  markRegion?: AiBoundingBox;
  signatureRegion?: AiBoundingBox;
  qrRegion?: AiBoundingBox;
}

export interface AiMarkRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  extractedMarks: number[];
  variantLabels: string[];
  isConsistent: boolean;
  discrepancyDelta: number;
  mark: number | null;
  confidence: number;
}

export interface AiTamperAnalysis {
  suspicionScore: number;
  signals: string[];
  status: 'PASS' | 'SUSPICIOUS' | 'MANUAL_REVIEW';
  details?: Record<string, any>;
}

export interface AiSignatureAnalysis {
  status: 'SIGNATURE_PRESENT' | 'SIGNATURE_NOT_FOUND' | 'SIGNATURE_UNCERTAIN';
  confidence: number;
  strokeDensity: number;
  providerName: string;
}

export interface AiLayoutAnalysis {
  isComplete: boolean;
  detectedRegions: string[];
  missingRegions: string[];
  cropWarning?: string | null;
}

export interface AiAnalysisResult {
  success: boolean;
  templateVersion?: string;
  templateRegions?: TemplateRegions;
  document: {
    studentName: string | null;
    registerNumber: string | null;
    experimentNumber: string | null;
    experimentTitle: string | null;
    date: string | null;
    mark: number | null;
    maxMark: number | null;
    facultySignaturePresent: boolean;
    qrPayload?: string | null;
    qrToken?: string | null;
    rawText?: string | null;
  };
  confidence: {
    studentName: number;
    registerNumber: number;
    experimentNumber: number;
    mark: number;
    facultySignaturePresent: number;
    overall: number;
  };
  quality?: {
    imageQuality: string;
    documentBoundaryDetected: boolean;
    perspectiveCorrected: boolean;
    qrDetected: boolean;
    markRegionFound: boolean;
    suspicionFlags: string[];
    requiresReview: boolean;
    blurScore?: number;
    brightness?: number;
    contrast?: number;
    documentCoverage?: number;
    perspectiveSeverity?: number;
    glareEstimate?: number;
    resolution?: { width: number; height: number };
    decision?: 'GOOD' | 'RETAKE_REQUIRED' | 'MANUAL_REVIEW';
  };
  markRegion?: AiMarkRegion;
  tamperAnalysis?: AiTamperAnalysis;
  signatureAnalysis?: AiSignatureAnalysis;
  layoutAnalysis?: AiLayoutAnalysis;
  retakeGuidance?: {
    decision: 'GOOD' | 'RETAKE_REQUIRED' | 'MANUAL_REVIEW';
    reason: string;
    tips: string[];
  };
  retakeReason?: string;
  guidanceTips?: string[];
  handwritingScore?: number;
  consensusMethod?: string;
  message?: string;
}

export interface SessionStats {
  sessionId: string;
  sessionCode: string;
  totalStudents: number;
  submitted: number;
  submittedCount: number;
  pending: number;
  pendingCount: number;
  verified: number;
  verifiedCount: number;
  manualReview: number;
  manualReviewCount: number;
  rejected: number;
  rejectedCount: number;
  avgReviewTimeSeconds: number;
}

export interface EvaluationReport {
  timestamp: string;
  department: string;
  markRecognition: {
    totalEvaluated: number;
    exactMatchAccuracy: number;
    withinHalfMarkAccuracy: number;
    confusionPairs: Record<string, {
      confusedForward: number;
      confusedReverse: number;
      cleanDiscriminationRate: number;
    }>;
  };
  fieldAccuracy: {
    totalEvaluated: number;
    registerNumberAccuracy: number;
  };
  securityPerformance: {
    totalUnauthorizedAttempts: number;
    unauthorizedAccepted: number;
    unauthorizedAcceptanceRate: number;
    securityInvariantMaintained: boolean;
  };
}

export type VerificationCategoryStatus = 'PASS' | 'FAIL' | 'REVIEW';

export interface VerificationBreakdown {
  identity: VerificationCategoryStatus;
  qrSecurity: VerificationCategoryStatus;
  session: VerificationCategoryStatus;
  experiment: VerificationCategoryStatus;
  documentQuality: VerificationCategoryStatus;
  ocr: VerificationCategoryStatus;
  markMatch: VerificationCategoryStatus;
  documentIntegrity: VerificationCategoryStatus;
  overallScore: 'READY_FOR_FACULTY_REVIEW' | 'MANUAL_REVIEW_REQUIRED' | 'REJECTED';
}

export type ReviewPriorityCategory =
  | 'OWNERSHIP_MISMATCH'
  | 'QR_INVALID'
  | 'QR_EXPIRED'
  | 'MARK_MISMATCH'
  | 'OCR_LOW_CONFIDENCE'
  | 'LOW_IMAGE_QUALITY'
  | 'DOCUMENT_INCOMPLETE'
  | 'SUSPICIOUS_INTEGRITY'
  | 'SIGNATURE_UNCERTAIN';

export interface CaptureChallenge {
  challengeId: string;
  recordId: string;
  nonce: string;
  expiresAt: string;
  expiresInSeconds: number;
}

export interface BulkApproveResult {
  approvedCount: number;
  skippedCount: number;
  approved: LabRecord[];
  skipped: string[];
}

