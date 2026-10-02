/**
 * Phase 8: Student Document Ownership & Writer Verification Types
 */

export interface DocumentPair {
  indexImage: Buffer;
  evaluationImage: Buffer;
  studentAccountId: string;
  experimentId: string;
  sessionId: string;
}

export interface ModelVersions {
  writerModelVersion: string;
  documentModelVersion: string;
  thresholdVersion: string;
}

export interface OwnershipThresholdConfig {
  version: string;
  exactDuplicateEnabled: boolean;
  perceptualHashThreshold: number;             // e.g. 0.85
  documentEmbeddingSimilarityThreshold: number; // e.g. 0.82
  writerConsistencyThreshold: number;          // e.g. 0.65
  writerMismatchThreshold: number;             // e.g. 0.75
  crossPageConsistencyThreshold: number;       // e.g. 0.68
  minSamplesProvisional: number;               // 2
  minSamplesEstablished: number;               // 5
}

export const DEFAULT_OWNERSHIP_THRESHOLDS: OwnershipThresholdConfig = {
  version: 'th-v1.8.0',
  exactDuplicateEnabled: true,
  perceptualHashThreshold: 0.85,
  documentEmbeddingSimilarityThreshold: 0.82,
  writerConsistencyThreshold: 0.65,
  writerMismatchThreshold: 0.75,
  crossPageConsistencyThreshold: 0.68,
  minSamplesProvisional: 2,
  minSamplesEstablished: 5,
};

export interface DocumentEmbeddingProvider {
  readonly modelVersion: string;
  embed(image: Buffer): Promise<number[]> | number[];
  compare(embeddingA: number[], embeddingB: number[]): number;
  searchNearest(
    embedding: number[],
    candidates: { id: string; studentId: string; embedding: number[] }[]
  ): { id: string; studentId: string; similarity: number } | null;
}

export type WritingRegionType =
  | 'INDEX_TITLE_DATE_ROW'
  | 'ENDBOX_OBSERVATIONS_SUMMARY'
  | 'ENDBOX_CALCULATION_TEXT'
  | 'INSUFFICIENT_COVERAGE';

export interface IsolatedWritingRegion {
  regionType: WritingRegionType;
  confidence: number;
  isStudentWriting: boolean;
  excludedFacultyMarkings: boolean;
  rawBufferSample: Buffer;
}

export interface WriterEmbeddingProvider {
  readonly modelVersion: string;
  extractWritingEmbedding(image: Buffer, regions?: IsolatedWritingRegion[]): Promise<number[]> | number[];
  compareWriters(embeddingA: number[], embeddingB: number[]): number;
  compareAgainstProfile(embedding: number[], profileCentroid: number[]): number;
}
