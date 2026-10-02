/**
 * Phase 7: Document Ownership Verification Service
 *
 * ORCHESTRATOR for all Phase 7 ownership verification signals.
 *
 * Aggregates:
 *  1. Account identity (JWT student == target record)
 *  2. Experiment verification (extracted exp == expected exp)
 *  3. Page range verification
 *  4. Date / session consistency
 *  5. Index ↔ end-box content consistency
 *  6. Mark consistency (index mark == end-box total)
 *  7. Arithmetic consistency (components sum == total)
 *  8. Exact image reuse detection
 *  9. Perceptual document reuse detection
 * 10. Document pair reuse detection
 * 11. Writer verification (cross-profile)
 * 12. Cross-page writer consistency (index vs end-box)
 * 13. Image quality (both images)
 * 14. Faculty signature presence
 *
 * Hard signals → REJECT
 * Soft evidence → MANUAL_REVIEW
 * All clear     → PASS (pending faculty confirmation)
 */

import { IndexImageAnalysis } from './indexImageAnalyzer.js';
import { EndBoxAnalysis } from './endBoxAnalyzer.js';
import { DocumentReuseService, ExactReuseResult, DocumentPairReuseResult, ReuseSignalType, defaultDocumentReuseService } from './documentReuseService.js';
import { WriterVerificationService, WriterVerificationResult, CrossPageResult, defaultWriterVerificationService } from './writerVerificationService.js';
import { DocumentPair, ModelVersions } from '../types/ownership.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export type OwnershipStatus = 'PASS' | 'MANUAL_REVIEW' | 'REJECTED';
export type RiskLevel       = 'LOW' | 'MEDIUM' | 'HIGH';

export type OwnershipSignal =
  | 'IDENTITY_VERIFIED'
  | 'EXPERIMENT_MATCH'
  | 'EXPERIMENT_MISMATCH'
  | 'PAGE_RANGE_MATCH'
  | 'PAGE_RANGE_MISMATCH'
  | 'DATE_MATCH'
  | 'DATE_MISMATCH'
  | 'DATE_UNCERTAIN'
  | 'MARK_CONSISTENT'
  | 'MARK_INCONSISTENCY'
  | 'MARK_ARITHMETIC_INCONSISTENCY'
  | 'CONTENT_CONSISTENT'
  | 'CONTENT_INCONSISTENCY'
  | 'EXACT_DOCUMENT_IMAGE_REUSE'
  | 'PERCEPTUAL_DOCUMENT_REUSE'
  | 'DOCUMENT_PAIR_REUSE_SUSPECTED'
  | 'WRITER_CONSISTENT'
  | 'WRITER_INCONSISTENCY'
  | 'WRITER_NO_PROFILE'
  | 'CROSS_PAGE_CONSISTENT'
  | 'CROSS_PAGE_INCONSISTENCY'
  | 'IMAGE_QUALITY_PASS'
  | 'IMAGE_QUALITY_FAIL'
  | 'FACULTY_SIGNATURE_PRESENT'
  | 'FACULTY_SIGNATURE_ABSENT';

export interface SignalClassification {
  signal:   OwnershipSignal;
  isHard:   boolean;          // Hard → can REJECT; Soft → routes to MANUAL_REVIEW
  detected: boolean;
  detail?:  string;
}

export interface OwnershipVerificationResult {
  ownershipStatus:   OwnershipStatus;
  riskLevel:         RiskLevel;
  signals:           SignalClassification[];
  modelVersions?:    ModelVersions;
  summary: {
    exactReuse:              boolean;
    visualReuse:             boolean;
    writerConsistent:        boolean | null;
    crossPageConsistent:     boolean | null;
    experimentMatch:         boolean;
    pageRangeMatch:          boolean;
    dateMatch:               boolean | null;
    markConsistent:          boolean;
    arithmeticConsistent:    boolean;
    facultySignaturePresent: boolean;
    qualityPass:             boolean;
  };
  reviewReason?:           string;
  reuseDetails?: {
    indexExactReuse:     ExactReuseResult;
    endBoxExactReuse:    ExactReuseResult;
    pairReuseResult:     DocumentPairReuseResult;
    reuseSignal:         ReuseSignalType;
  };
  writerDetails?: {
    result:       WriterVerificationResult;
    crossPage:    CrossPageResult;
  };
  markDetails?: {
    indexMark:       number | null;
    endBoxTotal:     number | null;
    computedTotal:   number | null;
    indexEndBoxDelta: number | null;
  };
  experimentDetails?: {
    expectedExperimentNumber: number;
    detectedIndexExp:         number | null;
    detectedEndBoxPage:       number | null;
    expectedPageStart:        number | null;
    expectedPageEnd:          number | null;
    sessionDate:              string | null;
    detectedDate:             string | null;
  };
}

// ─── Main Service ──────────────────────────────────────────────────────────────
export class DocumentOwnershipVerificationService {
  constructor(
    private reuseService:  DocumentReuseService,
    private writerService: WriterVerificationService
  ) {}

  verify(params: {
    currentStudentId:         string;
    recordId:                 string;
    expectedExperimentNumber: number;
    expectedPageStart?:       number | null;
    expectedPageEnd?:         number | null;
    sessionDate?:             string | null;
    indexAnalysis:            IndexImageAnalysis;
    endBoxAnalysis:           EndBoxAnalysis;
    indexBuffer:              Buffer;
    endBoxBuffer:             Buffer;
  }): OwnershipVerificationResult {
    const {
      currentStudentId,
      recordId,
      expectedExperimentNumber,
      expectedPageStart,
      expectedPageEnd,
      sessionDate,
      indexAnalysis,
      endBoxAnalysis,
      indexBuffer,
      endBoxBuffer,
    } = params;

    const signals: SignalClassification[] = [];
    const reviewReasons: string[] = [];
    let hasHardRejection = false;

    // ── 1. EXPERIMENT VERIFICATION ──────────────────────────────────────────
    const detectedExpNum = indexAnalysis.indexRow.experimentNumber;
    const experimentMatch = detectedExpNum !== null &&
                            detectedExpNum === expectedExperimentNumber;

    signals.push({
      signal:   experimentMatch ? 'EXPERIMENT_MATCH' : 'EXPERIMENT_MISMATCH',
      isHard:   !experimentMatch,
      detected: !experimentMatch,
      detail:   `Expected experiment ${expectedExperimentNumber}, detected ${detectedExpNum ?? 'unknown'}`,
    });
    if (!experimentMatch && detectedExpNum !== null) {
      hasHardRejection = true;
      reviewReasons.push(`Experiment mismatch: expected ${expectedExperimentNumber}, detected ${detectedExpNum}.`);
    } else if (!experimentMatch && detectedExpNum === null) {
      reviewReasons.push(`Could not determine experiment number from index image.`);
    }

    // ── 2. PAGE RANGE VERIFICATION ─────────────────────────────────────────
    const detectedEndPage  = endBoxAnalysis.endBox.pageNumber;
    const detectedIdxPage  = indexAnalysis.indexRow.pageNumber;
    let pageRangeMatch = true;
    if (expectedPageEnd && detectedEndPage !== null) {
      pageRangeMatch = Math.abs(detectedEndPage - expectedPageEnd) <= 2; // ±2 page tolerance
    } else if (expectedPageStart && detectedIdxPage !== null) {
      pageRangeMatch = Math.abs(detectedIdxPage - expectedPageStart) <= 2;
    }

    signals.push({
      signal:   pageRangeMatch ? 'PAGE_RANGE_MATCH' : 'PAGE_RANGE_MISMATCH',
      isHard:   false,
      detected: !pageRangeMatch,
      detail:   `Expected pages ${expectedPageStart ?? '?'}–${expectedPageEnd ?? '?'}, detected idx:${detectedIdxPage ?? '?'} end:${detectedEndPage ?? '?'}`,
    });
    if (!pageRangeMatch) {
      reviewReasons.push(`Page range mismatch: expected ${expectedPageStart}–${expectedPageEnd}, detected index page ${detectedIdxPage}, end page ${detectedEndPage}.`);
    }

    // ── 3. DATE / SESSION CONSISTENCY ────────────────────────────────────────
    const detectedDate = indexAnalysis.indexRow.date;
    let dateSignal: OwnershipSignal = 'DATE_UNCERTAIN';
    if (sessionDate && detectedDate) {
      // Flexible: allow within ±7 days (student may submit later)
      dateSignal = detectedDate.includes(sessionDate.substring(0, 7)) ? 'DATE_MATCH' : 'DATE_MISMATCH';
    }

    signals.push({
      signal:   dateSignal,
      isHard:   false,
      detected: dateSignal === 'DATE_MISMATCH',
      detail:   `Session date: ${sessionDate ?? 'unknown'}, detected: ${detectedDate ?? 'unknown'}`,
    });
    if (dateSignal === 'DATE_MISMATCH') {
      reviewReasons.push(`Date inconsistency: session date ${sessionDate}, detected date in index ${detectedDate}.`);
    }

    // ── 4. MARK CONSISTENCY (index mark == end-box total) ────────────────────
    const indexMark     = indexAnalysis.indexRow.mark;
    const endBoxTotal   = endBoxAnalysis.endBox.total;
    const computedTotal = endBoxAnalysis.endBox.computedTotal;

    let markConsistent = true;
    if (indexMark !== null && endBoxTotal !== null) {
      markConsistent = Math.abs(indexMark - endBoxTotal) <= 1; // ±1 rounding
    }

    signals.push({
      signal:   markConsistent ? 'MARK_CONSISTENT' : 'MARK_INCONSISTENCY',
      isHard:   false,
      detected: !markConsistent,
      detail:   `Index mark: ${indexMark ?? '?'}, end-box total: ${endBoxTotal ?? '?'}`,
    });
    if (!markConsistent) {
      reviewReasons.push(`Mark inconsistency: index shows ${indexMark}, end-box total shows ${endBoxTotal}.`);
    }

    // ── 5. ARITHMETIC CONSISTENCY (components sum == total) ──────────────────
    const arithmeticConsistent = endBoxAnalysis.endBox.arithmeticConsistent;

    signals.push({
      signal:   arithmeticConsistent ? 'MARK_CONSISTENT' : 'MARK_ARITHMETIC_INCONSISTENCY',
      isHard:   false,
      detected: !arithmeticConsistent,
      detail:   `Components sum: ${computedTotal ?? '?'}, total: ${endBoxTotal ?? '?'}`,
    });
    if (!arithmeticConsistent) {
      reviewReasons.push(`Mark arithmetic inconsistency: component marks sum to ${computedTotal}, but total shows ${endBoxTotal}.`);
    }

    // ── 6. EXACT IMAGE REUSE DETECTION ───────────────────────────────────────
    const { exactHash: exactHashIndex, pHash: pHashIndex, embedding: embeddingIndex } =
      this.reuseService.computeHashes(indexBuffer);
    const { exactHash: exactHashEndBox, pHash: pHashEndBox, embedding: embeddingEndBox } =
      this.reuseService.computeHashes(endBoxBuffer);

    const indexExactReuse  = this.reuseService.checkExactReuse(exactHashIndex,  'INDEX',   currentStudentId);
    const endBoxExactReuse = this.reuseService.checkExactReuse(exactHashEndBox, 'END_BOX', currentStudentId);

    if (indexExactReuse.detected || endBoxExactReuse.detected) {
      signals.push({
        signal:   'EXACT_DOCUMENT_IMAGE_REUSE',
        isHard:   true,
        detected: true,
        detail:   'Submitted image is an exact cryptographic match to a previously submitted document associated with another student account.',
      });
      hasHardRejection = true;
      reviewReasons.push('Exact document image reuse detected: submitted evidence matches a previously verified record from another student account.');
    }

    // ── 7. PERCEPTUAL / PAIR DOCUMENT REUSE DETECTION ────────────────────────
    const pairReuseResult = this.reuseService.checkDocumentPairReuse(
      pHashIndex, pHashEndBox, currentStudentId, embeddingIndex, embeddingEndBox
    );

    if (pairReuseResult.reuseSignal !== 'NONE') {
      const signalType: OwnershipSignal =
        pairReuseResult.reuseSignal === 'DOCUMENT_PAIR_REUSE_SUSPECTED'
          ? 'DOCUMENT_PAIR_REUSE_SUSPECTED'
          : 'PERCEPTUAL_DOCUMENT_REUSE';

      signals.push({
        signal:   signalType,
        isHard:   false,
        detected: true,
        detail: `Visual similarity score: index=${pairReuseResult.indexReuse.similarityScore.toFixed(2)}, end-box=${pairReuseResult.endBoxReuse.similarityScore.toFixed(2)}`,
      });
      reviewReasons.push('Submitted evidence is visually similar to previously verified laboratory record evidence from another student account.');
    }

    // ── 8. WRITER VERIFICATION ─────────────────────────────────────────────
    const writerResult    = this.writerService.verifyWriter(indexBuffer, currentStudentId);
    const crossPageResult = this.writerService.crossPageConsistency(indexBuffer, endBoxBuffer);

    let writerConsistent: boolean | null = null;
    let crossPageConsistent: boolean | null = null;

    if (writerResult.consistency === 'CONSISTENT') {
      signals.push({ signal: 'WRITER_CONSISTENT', isHard: false, detected: false });
      writerConsistent = true;
    } else if (writerResult.consistency === 'INCONSISTENT') {
      signals.push({
        signal:   'WRITER_INCONSISTENCY',
        isHard:   false,
        detected: true,
        detail:   'Handwriting characteristics are more similar to previously submitted evidence associated with another account.',
      });
      reviewReasons.push('Handwriting characteristics are more similar to previously submitted evidence associated with another student account.');
      writerConsistent = false;
    } else {
      signals.push({
        signal:   'WRITER_NO_PROFILE',
        isHard:   false,
        detected: false,
        detail:   writerResult.insufficientReason,
      });
    }

    if (crossPageResult.consistency === 'CONSISTENT') {
      signals.push({ signal: 'CROSS_PAGE_CONSISTENT', isHard: false, detected: false });
      crossPageConsistent = true;
    } else if (crossPageResult.consistency === 'INCONSISTENT') {
      signals.push({
        signal:   'CROSS_PAGE_INCONSISTENCY',
        isHard:   false,
        detected: true,
        detail:   'Writing style differs significantly between contents page and end-of-experiment page.',
      });
      reviewReasons.push('Writing characteristics differ between the contents page and the evaluation page.');
      crossPageConsistent = false;
    }

    // Requirement 12 & 21: Combined high-priority explainable reason
    if (pairReuseResult.reuseSignal !== 'NONE' && writerResult.consistency === 'INCONSISTENT') {
      reviewReasons.unshift('Submitted page images show visual similarity to previously submitted evidence and writing characteristics are inconsistent with the current student profile.');
    }

    // ── 9. IMAGE QUALITY ────────────────────────────────────────────────────
    const qualityPass =
      indexAnalysis.qualityDecision !== 'RETAKE_REQUIRED' &&
      endBoxAnalysis.qualityDecision !== 'RETAKE_REQUIRED';

    signals.push({
      signal:   qualityPass ? 'IMAGE_QUALITY_PASS' : 'IMAGE_QUALITY_FAIL',
      isHard:   false,
      detected: !qualityPass,
      detail:   qualityPass
        ? 'Both images meet minimum quality threshold'
        : `Quality issues: index=${indexAnalysis.qualityDecision}, end-box=${endBoxAnalysis.qualityDecision}`,
    });
    if (!qualityPass) {
      reviewReasons.push(`Image quality insufficient — index: ${indexAnalysis.qualityDecision}, evaluation box: ${endBoxAnalysis.qualityDecision}.`);
    }

    // ── 10. FACULTY SIGNATURE ───────────────────────────────────────────────
    const facultySignaturePresent =
      indexAnalysis.indexRow.facultySignaturePresent ||
      endBoxAnalysis.endBox.facultySignaturePresent;

    signals.push({
      signal:   facultySignaturePresent ? 'FACULTY_SIGNATURE_PRESENT' : 'FACULTY_SIGNATURE_ABSENT',
      isHard:   false,
      detected: !facultySignaturePresent,
      detail:   `Index signature: ${indexAnalysis.indexRow.facultySignaturePresent}, end-box: ${endBoxAnalysis.endBox.facultySignaturePresent}`,
    });
    if (!facultySignaturePresent) {
      reviewReasons.push('Faculty signature not detected on either page.');
    }

    // ── FINAL DECISION ──────────────────────────────────────────────────────
    const softIssues = reviewReasons.length;
    let ownershipStatus: OwnershipStatus;
    let riskLevel: RiskLevel;

    if (hasHardRejection) {
      ownershipStatus = 'REJECTED';
      riskLevel       = 'HIGH';
    } else if (softIssues > 0) {
      ownershipStatus = 'MANUAL_REVIEW';
      riskLevel       = softIssues >= 3 ? 'HIGH' : 'MEDIUM';
    } else {
      ownershipStatus = 'PASS';
      riskLevel       = 'LOW';
    }

    // ── Store evidence for future reuse detection ───────────────────────────
    // Only store on PASS to avoid poisoning the store with attacked submissions
    if (ownershipStatus === 'PASS') {
      this.reuseService.storeEvidence({
        exactHashIndex,
        pHashIndex,
        exactHashEndBox,
        pHashEndBox,
        indexEmbedding: embeddingIndex,
        endBoxEmbedding: embeddingEndBox,
        studentId: currentStudentId,
        recordId,
      });
    }

    return {
      ownershipStatus,
      riskLevel,
      signals,
      modelVersions: {
        writerModelVersion: this.writerService.modelVersion,
        documentModelVersion: this.reuseService.modelVersion,
        thresholdVersion: this.reuseService.getThresholds().version,
      },
      summary: {
        exactReuse:              indexExactReuse.detected || endBoxExactReuse.detected,
        visualReuse:             pairReuseResult.reuseSignal !== 'NONE',
        writerConsistent,
        crossPageConsistent,
        experimentMatch,
        pageRangeMatch,
        dateMatch:               dateSignal === 'DATE_MATCH' ? true
                                 : dateSignal === 'DATE_MISMATCH' ? false : null,
        markConsistent,
        arithmeticConsistent,
        facultySignaturePresent,
        qualityPass,
      },
      reviewReason: reviewReasons.length > 0 ? Array.from(new Set(reviewReasons)).join(' ') : undefined,
      reuseDetails: {
        indexExactReuse,
        endBoxExactReuse,
        pairReuseResult,
        reuseSignal: pairReuseResult.reuseSignal,
      },
      writerDetails: {
        result:    writerResult,
        crossPage: crossPageResult,
      },
      markDetails: {
        indexMark,
        endBoxTotal,
        computedTotal,
        indexEndBoxDelta: indexMark !== null && endBoxTotal !== null
          ? Math.abs(indexMark - endBoxTotal)
          : null,
      },
      experimentDetails: {
        expectedExperimentNumber,
        detectedIndexExp:    detectedExpNum,
        detectedEndBoxPage:  detectedEndPage,
        expectedPageStart:   expectedPageStart ?? null,
        expectedPageEnd:     expectedPageEnd   ?? null,
        sessionDate:         sessionDate        ?? null,
        detectedDate:        detectedDate       ?? null,
      },
    };
  }

  /**
   * Evaluates a two-image DocumentPair unit.
   */
  verifyDocumentPair(
    pair: DocumentPair,
    context: {
      expectedExperimentNumber: number;
      expectedPageStart?: number | null;
      expectedPageEnd?: number | null;
      sessionDate?: string | null;
      recordId: string;
      indexAnalysis: IndexImageAnalysis;
      endBoxAnalysis: EndBoxAnalysis;
    }
  ): OwnershipVerificationResult {
    return this.verify({
      currentStudentId: pair.studentAccountId,
      recordId: context.recordId,
      expectedExperimentNumber: context.expectedExperimentNumber,
      expectedPageStart: context.expectedPageStart,
      expectedPageEnd: context.expectedPageEnd,
      sessionDate: context.sessionDate,
      indexAnalysis: context.indexAnalysis,
      endBoxAnalysis: context.endBoxAnalysis,
      indexBuffer: pair.indexImage,
      endBoxBuffer: pair.evaluationImage,
    });
  }
}

export const defaultDocumentOwnershipVerificationService = new DocumentOwnershipVerificationService(
  defaultDocumentReuseService,
  defaultWriterVerificationService
);
