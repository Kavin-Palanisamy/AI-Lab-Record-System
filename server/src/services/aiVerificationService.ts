import { ILabRecordData, IStudentData } from '../prisma/db.js';
import { AiAnalysisResponse } from './aiService.js';
import { OwnershipMismatchError, ValidationError } from '../utils/errors.js';
import { RecordStatus } from '@prisma/client';

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

export interface VerificationResult {
  isOwnershipVerified: boolean;
  status: RecordStatus;
  detectedStudentMatch: boolean;
  detectedExperimentMatch: boolean;
  confidenceScore: number;
  extractedMark: number | null;
  signaturePresent: boolean;
  reviewReason?: string;
  inconsistencyFlags: string[];
  qualityDecision?: string;
  tamperStatus?: string;
  tamperScore?: number;
  markVerificationStatus?: 'MATCH' | 'MARK_MISMATCH' | 'NOT_EVALUATED' | 'MANUAL_REVIEW';
  serverFacultyMark?: number | null;
  verificationBreakdown?: VerificationBreakdown;
  reviewPriority?: ReviewPriorityCategory;
}

export class AiVerificationService {
  /**
   * Verify consistency across multi-factor dimensions:
   * 1. Authenticated Student (JWT) == QR Record Owner == Target Record Owner
   * 2. Session Binding: Target Session == QR Session
   * 3. OCR Register Number vs Authenticated Student Register Number
   * 4. Target Record Experiment vs QR Experiment vs OCR-detected Experiment Number
   * 5. Image Quality (Blur, Glare, Resolution)
   * 6. Tamper Signals & Mark Region Multi-Variant OCR Consistency
   * 7. Anti-Crop Document Completeness
   * 8. Faculty Signature Presence
   */
  verifyDocumentConsistency(params: {
    authenticatedStudent: IStudentData;
    targetRecord: ILabRecordData;
    qrRecord: ILabRecordData;
    aiResult?: AiAnalysisResponse;
  }): VerificationResult {
    const { authenticatedStudent, targetRecord, qrRecord, aiResult } = params;
    const inconsistencyFlags: string[] = [];

    // 1. FUNDAMENTAL INVARIANT CHECK:
    // LOGIN STUDENT ID == QR RECORD OWNER == TARGET RECORD OWNER
    if (qrRecord.studentId !== authenticatedStudent.id || targetRecord.studentId !== authenticatedStudent.id) {
      // The AI is strictly prohibited from overriding this security invariant
      throw new OwnershipMismatchError();
    }

    // 2. EXPERIMENT RECORD BINDING CHECK:
    if (qrRecord.id !== targetRecord.id) {
      throw new ValidationError('The submitted QR code belongs to your account, but is assigned to a different experiment record.');
    }

    // 3. SESSION BINDING CHECK:
    if (qrRecord.labSessionId !== targetRecord.labSessionId) {
      throw new ValidationError('Session mismatch: The submitted QR code is assigned to a different laboratory session.');
    }

    let detectedStudentMatch = true;
    let detectedExperimentMatch = true;
    let finalStatus: RecordStatus = RecordStatus.PENDING;
    let reviewReason: string | undefined;
    let markVerificationStatus: 'MATCH' | 'MARK_MISMATCH' | 'NOT_EVALUATED' | 'MANUAL_REVIEW' = 'NOT_EVALUATED';

    const doc = aiResult?.document;
    const conf = aiResult?.confidence;
    const quality = aiResult?.quality;
    const tamper = aiResult?.tamperAnalysis;
    const markRegion = aiResult?.markRegion;
    const signature = aiResult?.signatureAnalysis;
    const layout = aiResult?.layoutAnalysis;

    if (doc) {
      // 4. OCR Register Number vs Authenticated Student Register Number
      if (doc.registerNumber) {
        const cleanOcrReg = doc.registerNumber.replace(/^0+/, '');
        const cleanAuthReg = authenticatedStudent.registerNumber.replace(/^0+/, '');

        if (cleanOcrReg !== cleanAuthReg) {
          detectedStudentMatch = false;
          inconsistencyFlags.push(
            `OCR detected Register No '${doc.registerNumber}' does not match authenticated student '${authenticatedStudent.registerNumber}'`
          );
          finalStatus = RecordStatus.MANUAL_REVIEW;
          reviewReason = `Student identity mismatch: Document displays Reg No ${doc.registerNumber}, but submitted by Reg No ${authenticatedStudent.registerNumber}`;
        }
      } else {
        inconsistencyFlags.push('Student register number was not detectable on document page');
        finalStatus = RecordStatus.MANUAL_REVIEW;
        reviewReason = 'Register number could not be extracted from document with sufficient confidence';
      }

      // 5. OCR Experiment Number vs Target Experiment Number
      const targetExpNum = targetRecord.experiment?.experimentNumber ? String(targetRecord.experiment.experimentNumber) : null;
      if (doc.experimentNumber && targetExpNum) {
        const cleanDocExp = doc.experimentNumber.replace(/^0+/, '');
        const cleanTargetExp = targetExpNum.replace(/^0+/, '');
        if (cleanDocExp !== cleanTargetExp) {
          detectedExperimentMatch = false;
          inconsistencyFlags.push(
            `OCR detected Experiment No '${doc.experimentNumber}' does not match assigned Experiment '${targetExpNum}'`
          );
          finalStatus = RecordStatus.MANUAL_REVIEW;
          reviewReason = reviewReason || `Experiment number mismatch: Detected Exp ${doc.experimentNumber} vs assigned Exp ${targetExpNum}`;
        }
      }

      // 6. Mark Plausibility Checks & Server-Side Faculty Mark Comparison
      if (targetRecord.facultyAwardedMark !== null && targetRecord.facultyAwardedMark !== undefined) {
        if (doc.mark !== null && doc.mark !== undefined) {
          const delta = Math.abs(doc.mark - targetRecord.facultyAwardedMark);
          if (delta < 0.01) {
            markVerificationStatus = 'MATCH';
          } else {
            markVerificationStatus = 'MARK_MISMATCH';
            inconsistencyFlags.push(
              `OCR detected mark (${doc.mark}) does not match server faculty-awarded mark (${targetRecord.facultyAwardedMark})`
            );
            finalStatus = RecordStatus.MANUAL_REVIEW;
            reviewReason = reviewReason || `Mark mismatch: Server expected faculty mark ${targetRecord.facultyAwardedMark}, but document OCR detected ${doc.mark}`;
          }
        } else {
          markVerificationStatus = 'MANUAL_REVIEW';
          inconsistencyFlags.push('Mark could not be extracted to compare against faculty-awarded mark');
          finalStatus = RecordStatus.MANUAL_REVIEW;
          reviewReason = reviewReason || 'Mark region could not be verified against faculty evaluation';
        }
      }

      if (doc.mark !== null && doc.mark !== undefined) {
        if (doc.mark > targetRecord.maxMark) {
          inconsistencyFlags.push(`Detected mark (${doc.mark}) exceeds maximum mark (${targetRecord.maxMark})`);
          finalStatus = RecordStatus.MANUAL_REVIEW;
          reviewReason = reviewReason || `Suspicious mark: Extracted mark ${doc.mark} exceeds maximum mark ${targetRecord.maxMark}`;
        } else if (doc.mark < 0) {
          inconsistencyFlags.push(`Negative mark value detected (${doc.mark})`);
          finalStatus = RecordStatus.MANUAL_REVIEW;
          reviewReason = reviewReason || 'Suspicious negative mark detected';
        }
      }

      // 7. Mark Multi-Variant OCR Discrepancy Check
      if (markRegion && !markRegion.isConsistent && markRegion.discrepancyDelta >= 0.5) {
        inconsistencyFlags.push(`Conflicting readings detected across mark OCR variants (delta ${markRegion.discrepancyDelta})`);
        finalStatus = RecordStatus.MANUAL_REVIEW;
        reviewReason = reviewReason || `Mark region OCR inconsistency (delta: ${markRegion.discrepancyDelta}) requires manual faculty review`;
      }

      // 8. Low Mark OCR Confidence Threshold Check
      if (conf && conf.mark > 0 && conf.mark < 0.65) {
        inconsistencyFlags.push(`Low mark extraction confidence: ${(conf.mark * 100).toFixed(0)}%`);
        finalStatus = RecordStatus.MANUAL_REVIEW;
        reviewReason = reviewReason || `Low mark extraction confidence (${(conf.mark * 100).toFixed(0)}%) requires manual faculty verification`;
      }

      // 9. Tamper Analysis Signals Check
      if (tamper) {
        if (tamper.status === 'SUSPICIOUS') {
          inconsistencyFlags.push(...tamper.signals);
          finalStatus = RecordStatus.MANUAL_REVIEW;
          reviewReason = `Possible document alteration detected — faculty review required. (${tamper.signals[0] || 'High suspicion index'})`;
        } else if (tamper.status === 'MANUAL_REVIEW') {
          inconsistencyFlags.push(...tamper.signals);
          finalStatus = RecordStatus.MANUAL_REVIEW;
          reviewReason = reviewReason || `Document characteristics require manual review: ${tamper.signals[0] || 'Anomalous pixel statistics'}`;
        }
      }

      // 10. Anti-Crop and Document Completeness Check
      if (layout && !layout.isComplete) {
        inconsistencyFlags.push(layout.cropWarning || 'Document appears cropped; critical sections missing');
        finalStatus = RecordStatus.MANUAL_REVIEW;
        reviewReason = reviewReason || layout.cropWarning || 'Incomplete document upload requires manual faculty review';
      }

      // 11. Image Quality / Retake Analysis Check
      if (quality) {
        if (quality.decision === 'RETAKE_REQUIRED' || quality.imageQuality === 'LOW') {
          const retakeReason = quality.suspicionFlags[0] || 'Image quality insufficient (retake recommended)';
          inconsistencyFlags.push(retakeReason);
          finalStatus = RecordStatus.MANUAL_REVIEW;
          reviewReason = reviewReason || retakeReason;
        } else if (quality.requiresReview && (!quality.qrDetected || doc.registerNumber === null)) {
          finalStatus = RecordStatus.MANUAL_REVIEW;
          reviewReason = reviewReason || (quality.suspicionFlags?.[0] || 'Document image quality or readability issue');
        }
      }

      // 12. Faculty Signature Presence Check
      if (signature && signature.status === 'SIGNATURE_NOT_FOUND') {
        inconsistencyFlags.push('Faculty evaluation signature not detected in designated verification box');
        finalStatus = RecordStatus.MANUAL_REVIEW;
        reviewReason = reviewReason || 'Faculty evaluation signature is missing from the record sheet';
      }

      // 13. Low Overall Confidence Threshold Check
      if (conf && conf.overall < 0.65) {
        inconsistencyFlags.push(`Low AI document confidence score: ${(conf.overall * 100).toFixed(0)}%`);
        finalStatus = RecordStatus.MANUAL_REVIEW;
        reviewReason = reviewReason || `Low document confidence (${(conf.overall * 100).toFixed(0)}%) requires manual verification`;
      }
    }

    // 14. Phase 6 Transparent 8-Category Verification Breakdown
    const identityStatus: VerificationCategoryStatus = !detectedStudentMatch ? 'FAIL' : 'PASS';
    const qrSecurityStatus: VerificationCategoryStatus = 'PASS';
    const sessionStatus: VerificationCategoryStatus = 'PASS';
    const experimentStatus: VerificationCategoryStatus = !detectedExperimentMatch ? 'REVIEW' : 'PASS';
    const docQualityStatus: VerificationCategoryStatus =
      quality?.decision === 'RETAKE_REQUIRED' || quality?.imageQuality === 'LOW' ? 'REVIEW' : 'PASS';
    const ocrStatus: VerificationCategoryStatus = (conf && conf.overall < 0.65) ? 'REVIEW' : 'PASS';
    const markMatchStatus: VerificationCategoryStatus =
      markVerificationStatus === 'MARK_MISMATCH' ? 'REVIEW' :
      markVerificationStatus === 'MATCH' ? 'PASS' : 'REVIEW';
    const docIntegrityStatus: VerificationCategoryStatus =
      tamper?.status === 'SUSPICIOUS' || (layout && !layout.isComplete) ? 'REVIEW' : 'PASS';

    const overallScore =
      finalStatus === RecordStatus.PENDING ? 'READY_FOR_FACULTY_REVIEW' :
      (finalStatus as any) === RecordStatus.REJECTED ? 'REJECTED' : 'MANUAL_REVIEW_REQUIRED';

    const verificationBreakdown: VerificationBreakdown = {
      identity: identityStatus,
      qrSecurity: qrSecurityStatus,
      session: sessionStatus,
      experiment: experimentStatus,
      documentQuality: docQualityStatus,
      ocr: ocrStatus,
      markMatch: markMatchStatus,
      documentIntegrity: docIntegrityStatus,
      overallScore,
    };

    // Determine Review Priority Category for Faculty Dashboard
    let reviewPriority: ReviewPriorityCategory | undefined;
    if (finalStatus === RecordStatus.MANUAL_REVIEW) {
      if (!detectedStudentMatch) reviewPriority = 'OWNERSHIP_MISMATCH';
      else if (markVerificationStatus === 'MARK_MISMATCH') reviewPriority = 'MARK_MISMATCH';
      else if (tamper?.status === 'SUSPICIOUS') reviewPriority = 'SUSPICIOUS_INTEGRITY';
      else if (layout && !layout.isComplete) reviewPriority = 'DOCUMENT_INCOMPLETE';
      else if (quality?.decision === 'RETAKE_REQUIRED' || quality?.imageQuality === 'LOW') reviewPriority = 'LOW_IMAGE_QUALITY';
      else if (signature && signature.status === 'SIGNATURE_NOT_FOUND') reviewPriority = 'SIGNATURE_UNCERTAIN';
      else if (conf && conf.mark < 0.65) reviewPriority = 'OCR_LOW_CONFIDENCE';
      else reviewPriority = 'LOW_IMAGE_QUALITY';
    }

    return {
      isOwnershipVerified: true,
      status: finalStatus,
      detectedStudentMatch,
      detectedExperimentMatch,
      confidenceScore: conf?.overall ?? 0.85,
      extractedMark: doc?.mark ?? null,
      signaturePresent: doc?.facultySignaturePresent ?? (signature?.status === 'SIGNATURE_PRESENT'),
      reviewReason,
      inconsistencyFlags,
      qualityDecision: quality?.decision,
      tamperStatus: tamper?.status,
      tamperScore: tamper?.suspicionScore,
      markVerificationStatus,
      serverFacultyMark: targetRecord.facultyAwardedMark ?? null,
      verificationBreakdown,
      reviewPriority,
    };
  }
}

export const defaultAiVerificationService = new AiVerificationService();
