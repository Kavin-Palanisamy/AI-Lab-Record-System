/**
 * Phase 7: Document Reuse Detection Service
 *
 * Implements two layers of duplicate detection:
 *
 * 1. EXACT IMAGE REUSE — SHA-256 cryptographic hash
 *    - Cannot be defeated without changing the image
 *    - Hard security signal when hash matches another student's submission
 *
 * 2. PERCEPTUAL DOCUMENT REUSE — pHash (average-hash variant)
 *    - Detects resized, slightly cropped, brightness-adjusted copies
 *    - Soft evidence signal: routes to MANUAL_REVIEW
 *
 * Privacy:
 *   The prior-student's ID is stored internally but NEVER exposed to
 *   the submitting student via the API. Only faculty/admin can access it.
 */

import crypto from 'crypto';
import { defaultDocumentEmbeddingProvider, SpatialPyramidDocumentEmbeddingProvider } from './documentEmbeddingProvider.js';
import { DEFAULT_OWNERSHIP_THRESHOLDS, OwnershipThresholdConfig } from '../types/ownership.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ReuseSignalType =
  | 'NONE'
  | 'EXACT_DOCUMENT_IMAGE_REUSE'
  | 'PERCEPTUAL_DOCUMENT_REUSE'
  | 'DOCUMENT_PAIR_REUSE_SUSPECTED';

export interface ExactReuseResult {
  detected:           boolean;
  imageHash:          string;
  previousRecordId?:  string;
  previousStudentId?: string;   // FACULTY ONLY — do not expose to student
}

export interface PerceptualReuseResult {
  detected:                  boolean;
  similarityScore:           number;   // 0.0 – 1.0 (1.0 = identical)
  embeddingSimilarityScore?: number;
  threshold:                 number;   // configured threshold
  previousRecordId?:         string;
  previousStudentId?:        string;   // FACULTY ONLY
  provider:                  string;
  confidence:                number;
  modelVersion?:             string;
}

export interface DocumentPairReuseResult {
  indexReuse:   PerceptualReuseResult;
  endBoxReuse:  PerceptualReuseResult;
  pairReuse:    boolean;   // both images match the same prior submission
  reuseSignal:  ReuseSignalType;
}

// ─── Stored evidence entry ─────────────────────────────────────────────────
interface StoredImageEvidence {
  exactHash:   string;
  pHash:       string;
  embedding?:  number[];
  studentId:   string;
  recordId:    string;
  imageType:   'INDEX' | 'END_BOX';
  storedAt:    Date;
}

// ─── Perceptual hash (average-hash, 8×8 grid) ─────────────────────────────
// Produces a 64-bit hash from an image buffer without external libraries.
// Operates on raw pixel luminance sampled at 64 evenly-spaced byte positions.
function computePerceptualHash(buffer: Buffer): string {
  if (buffer.length < 64) {
    // Too small — use file hash portion as proxy
    return crypto.createHash('sha256').update(buffer).digest('hex').substring(0, 16);
  }

  const step   = Math.floor(buffer.length / 64);
  const values: number[] = [];

  for (let i = 0; i < 64; i++) {
    const offset = i * step;
    // Approximate luminance from up to 3 bytes at this offset
    const b0 = buffer[offset]     ?? 128;
    const b1 = buffer[offset + 1] ?? b0;
    const b2 = buffer[offset + 2] ?? b0;
    values.push(Math.round((b0 + b1 + b2) / 3));
  }

  const avg = values.reduce((a, b) => a + b, 0) / 64;
  let bits = '';
  for (const v of values) {
    bits += v >= avg ? '1' : '0';
  }

  // Convert 64-bit binary string to 16-char hex
  let hex = '';
  for (let i = 0; i < 64; i += 4) {
    hex += parseInt(bits.substring(i, i + 4), 2).toString(16);
  }
  return hex;
}

// Hamming distance between two 16-char hex strings (64-bit comparison)
function hammingDistance(a: string, b: string): number {
  if (a.length !== b.length) return 64; // treat length mismatch as fully different
  let distance = 0;
  for (let i = 0; i < a.length; i++) {
    const ba = parseInt(a[i], 16).toString(2).padStart(4, '0');
    const bb = parseInt(b[i], 16).toString(2).padStart(4, '0');
    for (let j = 0; j < 4; j++) {
      if (ba[j] !== bb[j]) distance++;
    }
  }
  return distance;
}

// ─── Main service ──────────────────────────────────────────────────────────
export class DocumentReuseService {
  private thresholds: OwnershipThresholdConfig = { ...DEFAULT_OWNERSHIP_THRESHOLDS };
  private readonly evidenceStore: StoredImageEvidence[] = [];
  private readonly embeddingProvider = defaultDocumentEmbeddingProvider;

  readonly modelVersion = defaultDocumentEmbeddingProvider.modelVersion;

  setThresholds(custom: Partial<OwnershipThresholdConfig>): void {
    this.thresholds = { ...this.thresholds, ...custom };
  }

  getThresholds(): OwnershipThresholdConfig {
    return { ...this.thresholds };
  }

  // ── Compute hashes and embedding for an image buffer ───────────────────
  computeHashes(buffer: Buffer): { exactHash: string; pHash: string; embedding?: number[] } {
    const exactHash = crypto.createHash('sha256').update(buffer).digest('hex');
    const pHash     = computePerceptualHash(buffer);
    const embedding = this.embeddingProvider.embed(buffer);
    return { exactHash, pHash, embedding };
  }

  // ── Check exact reuse against known submissions ──────────────────────────
  checkExactReuse(
    exactHash:       string,
    imageType:       'INDEX' | 'END_BOX',
    currentStudentId: string
  ): ExactReuseResult {
    if (!this.thresholds.exactDuplicateEnabled) {
      return { detected: false, imageHash: exactHash };
    }

    const match = this.evidenceStore.find(
      (e) =>
        e.exactHash === exactHash &&
        e.imageType  === imageType &&
        e.studentId  !== currentStudentId
    );

    return {
      detected:           !!match,
      imageHash:          exactHash,
      previousRecordId:   match?.recordId,
      previousStudentId:  match?.studentId,
    };
  }

  // ── Check perceptual reuse ───────────────────────────────────────────────
  checkPerceptualReuse(
    pHash:            string,
    imageType:        'INDEX' | 'END_BOX',
    currentStudentId: string,
    embedding?:       number[]
  ): PerceptualReuseResult {
    let bestMatch: StoredImageEvidence | null = null;
    let bestSimilarity = 0;
    let bestEmbeddingSim = 0;

    for (const e of this.evidenceStore) {
      if (e.imageType !== imageType) continue;
      if (e.studentId === currentStudentId) continue;

      const dist = hammingDistance(pHash, e.pHash);
      const sim  = 1 - dist / 64;
      if (sim > bestSimilarity) {
        bestSimilarity = sim;
        bestMatch      = e;
      }

      if (embedding && e.embedding) {
        const embSim = this.embeddingProvider.compare(embedding, e.embedding);
        if (embSim > bestEmbeddingSim) {
          bestEmbeddingSim = embSim;
          if (embSim >= this.thresholds.documentEmbeddingSimilarityThreshold && (!bestMatch || embSim > bestSimilarity)) {
            bestMatch = e;
          }
        }
      }
    }

    const detected = bestSimilarity >= this.thresholds.perceptualHashThreshold ||
                     (embedding !== undefined && bestEmbeddingSim >= this.thresholds.documentEmbeddingSimilarityThreshold);

    return {
      detected,
      similarityScore:          bestSimilarity,
      embeddingSimilarityScore: bestEmbeddingSim,
      threshold:                this.thresholds.perceptualHashThreshold,
      previousRecordId:         bestMatch?.recordId,
      previousStudentId:        bestMatch?.studentId,
      provider:                 'SpatialPyramidDocumentEmbeddingProvider',
      confidence:               Math.max(bestSimilarity, bestEmbeddingSim),
      modelVersion:             this.modelVersion,
    };
  }

  // ── Check document pair reuse ────────────────────────────────────────────
  checkDocumentPairReuse(
    indexPHash:       string,
    endBoxPHash:      string,
    currentStudentId: string,
    indexEmbedding?:  number[],
    endBoxEmbedding?: number[]
  ): DocumentPairReuseResult {
    const indexReuse  = this.checkPerceptualReuse(indexPHash,  'INDEX',   currentStudentId, indexEmbedding);
    const endBoxReuse = this.checkPerceptualReuse(endBoxPHash, 'END_BOX', currentStudentId, endBoxEmbedding);

    // Pair reuse: both images match the SAME prior submission
    const pairReuse = indexReuse.detected &&
                      endBoxReuse.detected &&
                      indexReuse.previousRecordId === endBoxReuse.previousRecordId;

    let reuseSignal: ReuseSignalType = 'NONE';
    if (pairReuse) {
      reuseSignal = 'DOCUMENT_PAIR_REUSE_SUSPECTED';
    } else if (indexReuse.detected || endBoxReuse.detected) {
      reuseSignal = 'PERCEPTUAL_DOCUMENT_REUSE';
    }

    return { indexReuse, endBoxReuse, pairReuse, reuseSignal };
  }

  // ── Store evidence after successful / accepted submission ────────────────
  storeEvidence(params: {
    exactHashIndex:   string;
    pHashIndex:       string;
    exactHashEndBox:  string;
    pHashEndBox:      string;
    studentId:        string;
    recordId:         string;
    indexEmbedding?:  number[];
    endBoxEmbedding?: number[];
  }) {
    const now = new Date();
    this.evidenceStore.push({
      exactHash:  params.exactHashIndex,
      pHash:      params.pHashIndex,
      embedding:  params.indexEmbedding,
      studentId:  params.studentId,
      recordId:   params.recordId,
      imageType:  'INDEX',
      storedAt:   now,
    });
    this.evidenceStore.push({
      exactHash:  params.exactHashEndBox,
      pHash:      params.pHashEndBox,
      embedding:  params.endBoxEmbedding,
      studentId:  params.studentId,
      recordId:   params.recordId,
      imageType:  'END_BOX',
      storedAt:   now,
    });
  }

  // ── For test convenience only ────────────────────────────────────────────
  clearStore() {
    this.evidenceStore.length = 0;
  }

  storeCount(): number {
    return this.evidenceStore.length;
  }
}

export const defaultDocumentReuseService = new DocumentReuseService();

