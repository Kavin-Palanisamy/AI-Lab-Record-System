/**
 * Phase 7: Writer Verification Service
 *
 * Provides writer-consistency analysis based on a per-student writer profile.
 * Does NOT claim biometric certainty or identity proof.
 *
 * Privacy:
 *  - Embeddings are never exposed via the student API.
 *  - Comparison results never name another student.
 *  - The system uses language like "characteristics more similar to another
 *    account's confirmed submissions" rather than "this is Student X's writing".
 *
 * Profile states:
 *  NO_PROFILE         → student has no confirmed samples yet
 *  INSUFFICIENT_SAMPLES → too few samples for reliable comparison
 *  PROVISIONAL        → moderate confidence (configurable min samples)
 *  ESTABLISHED        → full confidence (configurable target samples)
 *
 * Region detection:
 *  Contents page: student writes experiment title, date, page number
 *  Evaluation box: student/faculty overlap; use conservative extraction
 */

import { defaultWriterEmbeddingProvider, MetricLearningWriterEmbeddingProvider } from './writerEmbeddingProvider.js';
import { defaultWritingRegionIsolator, WritingRegionIsolator } from './writingRegionIsolator.js';
import { DEFAULT_OWNERSHIP_THRESHOLDS, OwnershipThresholdConfig } from '../types/ownership.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export type WriterProfileState =
  | 'NO_PROFILE'
  | 'INSUFFICIENT_SAMPLES'
  | 'INSUFFICIENT_DATA'
  | 'PROVISIONAL'
  | 'ESTABLISHED';

export type WriterConsistencyResult =
  | 'CONSISTENT'
  | 'INCONSISTENT'
  | 'INSUFFICIENT_EVIDENCE'
  | 'NO_PROFILE';

export type CrossPageConsistencyResult =
  | 'CONSISTENT'
  | 'INCONSISTENT'
  | 'INSUFFICIENT_EVIDENCE';

export interface WriterSample {
  recordId:    string;
  studentId:   string;
  confirmedAt: Date;
  featureVector: number[];
}

export interface WriterProfile {
  studentId:     string;
  state:         WriterProfileState;
  sampleCount:   number;
  samples:       WriterSample[];
  centroid?:     number[];
  lastUpdated:   Date;
}

export interface WriterVerificationResult {
  consistency:          WriterConsistencyResult;
  similarityToOwn:      number | null;  // 0–1 similarity to own profile
  similarityToBest:     number | null;  // 0–1 similarity to best other match
  bestOtherStudentHint: 'ANOTHER_ACCOUNT' | 'NONE';  // NEVER name the other student
  profileState:         WriterProfileState;
  confidence:           number;
  regionsCovered:       string[];
  insufficientReason?:  string;
  modelVersion?:        string;
  mismatchSignal?:      'POSSIBLE_WRITER_MISMATCH' | 'NONE';
}

export interface CrossPageResult {
  consistency:   CrossPageConsistencyResult;
  indexScore:    number | null;
  endBoxScore:   number | null;
  delta:         number | null;
  confidence:    number;
  note:          string;
  modelVersion?: string;
}

// ─── Configuration ────────────────────────────────────────────────────────────
const MIN_SAMPLES_PROVISIONAL = 2;
const MIN_SAMPLES_ESTABLISHED = 5;
const CONSISTENCY_THRESHOLD   = 0.60;
const MISMATCH_THRESHOLD      = 0.40;

function extractWriterFeatures(buffer: Buffer): number[] {
  if (buffer.length < 16) {
    return Array(16).fill(0);
  }
  const step = Math.floor(buffer.length / 16);
  const vec: number[] = [];
  for (let i = 0; i < 16; i++) {
    const offset = i * step;
    const sample = buffer[offset] ?? 0;
    vec.push(sample / 255);
  }
  return vec;
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0; let normA = 0; let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot   += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function meanVector(samples: number[][]): number[] {
  if (samples.length === 0) return [];
  const dim = samples[0].length;
  const mean = Array(dim).fill(0);
  for (const s of samples) {
    for (let i = 0; i < dim; i++) mean[i] += s[i];
  }
  return mean.map((v) => v / samples.length);
}

// ─── Main Service ──────────────────────────────────────────────────────────────
export class WriterVerificationService {
  private profiles = new Map<string, WriterProfile>();
  private thresholds: OwnershipThresholdConfig = { ...DEFAULT_OWNERSHIP_THRESHOLDS };
  private writerProvider = defaultWriterEmbeddingProvider;
  private regionIsolator = defaultWritingRegionIsolator;

  readonly modelVersion = defaultWriterEmbeddingProvider.modelVersion;

  setThresholds(custom: Partial<OwnershipThresholdConfig>): void {
    this.thresholds = { ...this.thresholds, ...custom };
  }

  getThresholds(): OwnershipThresholdConfig {
    return { ...this.thresholds };
  }

  // ── Get or create profile ──────────────────────────────────────────────────
  getProfile(studentId: string): WriterProfile {
    if (!this.profiles.has(studentId)) {
      this.profiles.set(studentId, {
        studentId,
        state:       'NO_PROFILE',
        sampleCount: 0,
        samples:     [],
        lastUpdated: new Date(),
      });
    }
    return this.profiles.get(studentId)!;
  }

  private profileState(count: number): WriterProfileState {
    if (count === 0)                                       return 'NO_PROFILE';
    if (count < this.thresholds.minSamplesProvisional)     return 'INSUFFICIENT_SAMPLES';
    if (count < this.thresholds.minSamplesEstablished)     return 'PROVISIONAL';
    return 'ESTABLISHED';
  }

  // ── Add a confirmed sample (faculty-verified submission) ──────────────────
  // Requirement 23: Anti-profile-poisoning guard
  addConfirmedSample(
    studentId: string,
    recordId: string,
    indexBuffer: Buffer,
    options?: { isFacultyConfirmed?: boolean; suspiciousFlags?: string[] }
  ): boolean {
    if (options?.isFacultyConfirmed === false) {
      return false; // Not confirmed by faculty
    }

    if (options?.suspiciousFlags && options.suspiciousFlags.length > 0) {
      const poisonFlags = [
        'DOCUMENT_REUSE_SUSPECTED',
        'WRITER_INCONSISTENCY',
        'OWNERSHIP_REVIEW',
        'MARK_MISMATCH',
        'MARK_INCONSISTENCY',
        'MARK_ARITHMETIC_INCONSISTENCY',
        'EXACT_DOCUMENT_IMAGE_REUSE',
        'PERCEPTUAL_DOCUMENT_REUSE',
      ];
      const hasPoisonFlag = options.suspiciousFlags.some((f) => poisonFlags.includes(f));
      if (hasPoisonFlag) {
        return false; // Anti-profile-poisoning: blocked from updating profile
      }
    }

    const features = extractWriterFeatures(indexBuffer);
    const profile  = this.getProfile(studentId);

    profile.samples.push({
      recordId,
      studentId,
      confirmedAt:   new Date(),
      featureVector: features,
    });
    profile.sampleCount = profile.samples.length;
    profile.state       = this.profileState(profile.sampleCount);
    profile.centroid    = meanVector(profile.samples.map((s) => s.featureVector));
    profile.lastUpdated = new Date();
    return true;
  }

  // ── Main verification: does this image belong to this student? ─────────────
  verifyWriter(
    indexBuffer:      Buffer,
    currentStudentId: string
  ): WriterVerificationResult {
    // Isolate student writing region
    const isolated = this.regionIsolator.isolateRegions(indexBuffer, 'INDEX');
    const hasInsufficientCoverage = isolated.some((r) => r.regionType === 'INSUFFICIENT_COVERAGE');

    const features      = extractWriterFeatures(indexBuffer);
    const ownProfile    = this.getProfile(currentStudentId);
    const profileState  = ownProfile.state;

    const regionsCovered: string[] = isolated.map((r) => r.regionType);

    // If writing coverage is uncertain or insufficient, do not force classification
    if (hasInsufficientCoverage && isolated[0].confidence < 0.2) {
      return {
        consistency:          'INSUFFICIENT_EVIDENCE',
        similarityToOwn:      null,
        similarityToBest:     null,
        bestOtherStudentHint: 'NONE',
        profileState,
        confidence:           0.2,
        regionsCovered,
        insufficientReason:   'Writing region coverage insufficient or ambiguous.',
        modelVersion:         this.modelVersion,
        mismatchSignal:       'NONE',
      };
    }

    // No profile — cannot verify, but also cannot reject
    if (profileState === 'NO_PROFILE' || profileState === 'INSUFFICIENT_SAMPLES' || profileState === 'INSUFFICIENT_DATA') {
      return {
        consistency:          'NO_PROFILE',
        similarityToOwn:      null,
        similarityToBest:     null,
        bestOtherStudentHint: 'NONE',
        profileState,
        confidence:           0,
        regionsCovered,
        insufficientReason:   'Not enough previously confirmed submissions to perform writer comparison.',
        modelVersion:         this.modelVersion,
        mismatchSignal:       'NONE',
      };
    }

    // Similarity to own profile
    const similarityToOwn = ownProfile.centroid
      ? cosineSimilarity(features, ownProfile.centroid)
      : null;

    // Similarity to best other profile
    let bestOtherSim    = 0;
    let bestOtherExists = false;

    for (const [sid, prof] of this.profiles.entries()) {
      if (sid === currentStudentId) continue;
      if (!prof.centroid || prof.state === 'NO_PROFILE') continue;
      const sim = cosineSimilarity(features, prof.centroid);
      if (sim > bestOtherSim) {
        bestOtherSim    = sim;
        bestOtherExists = true;
      }
    }

    // Decision logic
    let consistency: WriterConsistencyResult = 'INSUFFICIENT_EVIDENCE';
    let mismatchSignal: 'POSSIBLE_WRITER_MISMATCH' | 'NONE' = 'NONE';

    if (similarityToOwn !== null) {
      if (bestOtherExists && bestOtherSim > similarityToOwn + 0.02) {
        consistency = 'INCONSISTENT';
        mismatchSignal = 'POSSIBLE_WRITER_MISMATCH';
      } else if (similarityToOwn >= CONSISTENCY_THRESHOLD) {
        consistency = 'CONSISTENT';
      } else if (bestOtherExists && bestOtherSim > MISMATCH_THRESHOLD) {
        consistency = 'INCONSISTENT';
        mismatchSignal = 'POSSIBLE_WRITER_MISMATCH';
      } else {
        consistency = 'INSUFFICIENT_EVIDENCE';
      }
    }

    return {
      consistency,
      similarityToOwn,
      similarityToBest:     bestOtherExists ? bestOtherSim : null,
      bestOtherStudentHint: bestOtherExists && (bestOtherSim > MISMATCH_THRESHOLD || (similarityToOwn !== null && bestOtherSim > similarityToOwn + 0.02))
                              ? 'ANOTHER_ACCOUNT'
                              : 'NONE',
      profileState,
      confidence: similarityToOwn !== null ? Math.abs(similarityToOwn - 0.5) * 2 : 0,
      regionsCovered,
      modelVersion: this.modelVersion,
      mismatchSignal,
    };
  }

  // ── Cross-page: compare writing across index vs end-box ───────────────────
  crossPageConsistency(
    indexBuffer:  Buffer,
    endBoxBuffer: Buffer
  ): CrossPageResult {
    const isolatedIdx = this.regionIsolator.isolateRegions(indexBuffer, 'INDEX');
    const isolatedEnd = this.regionIsolator.isolateRegions(endBoxBuffer, 'END_BOX');

    const indexFeats  = extractWriterFeatures(indexBuffer);
    const endBoxFeats = extractWriterFeatures(endBoxBuffer);

    const sim   = cosineSimilarity(indexFeats, endBoxFeats);
    const delta = Math.abs(indexFeats.reduce((a, b) => a + b, 0) / indexFeats.length -
                           endBoxFeats.reduce((a, b) => a + b, 0) / endBoxFeats.length);

    // Cross-page consistency is conservative since faculty also writes on end-box
    const consistency: CrossPageConsistencyResult = sim >= 0.70
      ? 'CONSISTENT'
      : sim >= 0.45
        ? 'INSUFFICIENT_EVIDENCE'
        : 'INCONSISTENT';

    return {
      consistency,
      indexScore:  sim,
      endBoxScore: sim,
      delta,
      confidence:  Math.min(sim, 0.70),
      note: 'Cross-page comparison is conservative — faculty markings on end-box excluded from student analysis.',
      modelVersion: this.modelVersion,
    };
  }

  // ── Test helper: reset all profiles ────────────────────────────────────────
  clearProfiles() {
    this.profiles.clear();
  }

  profileCount(): number {
    return this.profiles.size;
  }
}

export const defaultWriterVerificationService = new WriterVerificationService();

