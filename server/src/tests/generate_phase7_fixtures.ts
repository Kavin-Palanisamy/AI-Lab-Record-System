/**
 * Phase 7 Test Fixture Generator
 * Creates synthetic test images for document ownership verification tests.
 * All fixtures contain CLEARLY LABELED synthetic data — no real student records.
 *
 * Run: node --loader ts-node/esm generate_phase7_fixtures.mjs
 * Or:  npx tsx generate_phase7_fixtures.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.join(__dirname, '..', '..', '..', 'docs', 'demo-docs');

fs.mkdirSync(OUTPUT_DIR, { recursive: true });

/**
 * Creates a minimal valid PNG buffer with specific byte patterns.
 * Pattern encodes student/experiment context for fallback analyzer detection.
 * These are SYNTHETIC images — not real student photographs.
 */
function createSyntheticPng(label: string, seed: number, sizeFactor = 1): Buffer {
  // A valid minimal PNG: signature + IHDR + IDAT + IEND
  // Embedding the label and seed in the IDAT data section for unique hashing
  const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  // IHDR chunk: 13 bytes data
  function chunk(type: string, data: Buffer): Buffer {
    const typeBuffer = Buffer.from(type, 'ascii');
    const crcData = Buffer.concat([typeBuffer, data]);
    const crc = crc32(crcData);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length, 0);
    const crcBuffer = Buffer.alloc(4);
    crcBuffer.writeUInt32BE(crc, 0);
    return Buffer.concat([length, typeBuffer, data, crcBuffer]);
  }

  const width  = Math.max(8, Math.min(100 * sizeFactor, 800));
  const height = Math.max(8, Math.min(100 * sizeFactor, 800));
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8;   // bit depth
  ihdrData[9] = 2;   // color type: RGB
  ihdrData[10] = 0;  // compression
  ihdrData[11] = 0;  // filter
  ihdrData[12] = 0;  // interlace

  // IDAT: embed label and seed as unique content
  const labelHash = crypto.createHash('sha256').update(`${label}:${seed}`).digest();
  const idatContent = Buffer.concat([Buffer.from(`SYNTHETIC_EEE_LAB_FIXTURE:${label}:SEED_${seed}:`), labelHash]);

  const idat = chunk('IDAT', idatContent);
  const ihdr = chunk('IHDR', ihdrData);
  const iend = chunk('IEND', Buffer.alloc(0));

  return Buffer.concat([PNG_SIGNATURE, ihdr, idat, iend]);
}

// Simple CRC32 implementation for PNG chunk checksums
function crc32(buf: Buffer): number {
  const crcTable = (() => {
    const t: number[] = [];
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      t[n] = c;
    }
    return t;
  })();
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// Write fixture file
function writeFixture(filename: string, buffer: Buffer): void {
  const filepath = path.join(OUTPUT_DIR, filename);
  fs.writeFileSync(filepath, buffer);
  console.log(`  Created: ${filename} (${buffer.length} bytes)`);
}

// ──────────────────────────────────────────────────────────────────────────────
console.log('Generating Phase 7 synthetic test fixtures...');
console.log(`Output: ${OUTPUT_DIR}`);
console.log('');

// A: Same exact images (Kavin → Kavin)
// These form the baseline pair for Kavin's Experiment 4
const kavinIndexBase    = createSyntheticPng('kavin_index_exp4', 1001);
const kavinEndBoxBase   = createSyntheticPng('kavin_endbox_exp4', 2001);
writeFixture('p7_kavin_index_exp4.png',   kavinIndexBase);
writeFixture('p7_kavin_endbox_exp4.png',  kavinEndBoxBase);

// B: Same images resized (Arjun uses Kavin's images, but "resized")
// The content is same but size varies — pHash should still match
const kavinIndexResized  = createSyntheticPng('kavin_index_exp4', 1001, 2); // same seed, doubled
const kavinEndBoxResized = createSyntheticPng('kavin_endbox_exp4', 2001, 2);
writeFixture('p7_reuse_arjun_index_resized.png',   kavinIndexResized);
writeFixture('p7_reuse_arjun_endbox_resized.png',  kavinEndBoxResized);

// C: Same images "compressed" — minor byte variance but same content label
// We simulate by using a slightly different seed but same label
const kavinIndexCompressed  = Buffer.concat([kavinIndexBase.slice(0, -4), Buffer.from([0x00, 0x00, 0x00, 0x00])]);
const kavinEndBoxCompressed = Buffer.concat([kavinEndBoxBase.slice(0, -4), Buffer.from([0x00, 0x00, 0x00, 0x00])]);
writeFixture('p7_reuse_arjun_index_compressed.png',  kavinIndexCompressed);
writeFixture('p7_reuse_arjun_endbox_compressed.png', kavinEndBoxCompressed);

// D: Same images "slightly cropped" — take a prefix slice (perceptual match expected)
const kavinIndexCropped  = kavinIndexBase.slice(0, Math.floor(kavinIndexBase.length * 0.95));
const kavinEndBoxCropped = kavinEndBoxBase.slice(0, Math.floor(kavinEndBoxBase.length * 0.95));
writeFixture('p7_reuse_arjun_index_cropped.png',  kavinIndexCropped);
writeFixture('p7_reuse_arjun_endbox_cropped.png', kavinEndBoxCropped);

// E: Arjun's genuine record (different content, different student)
const arjunIndexGenuine   = createSyntheticPng('arun_index_exp4', 3001);
const arjunEndBoxGenuine  = createSyntheticPng('arun_endbox_exp4', 4001);
writeFixture('p7_arun_index_exp4.png',   arjunIndexGenuine);
writeFixture('p7_arun_endbox_exp4.png',  arjunEndBoxGenuine);

// Priya's genuine record
const priyaIndex  = createSyntheticPng('priya_index_exp4', 5001);
const priyaEndBox = createSyntheticPng('priya_endbox_exp4', 6001);
writeFixture('p7_priya_index_exp4.png',   priyaIndex);
writeFixture('p7_priya_endbox_exp4.png',  priyaEndBox);

// F: Wrong experiment (Kavin's Exp 3 images submitted for Exp 4 slot)
// Using "wrong_exp" in filename for fallback analyzer trigger
const wrongExpIndex  = createSyntheticPng('kavin_wrongexp_index_exp3', 7001);
const wrongExpEndBox = createSyntheticPng('kavin_wrongexp_endbox_exp3', 8001);
writeFixture('p7_kavin_index_wrongexp.png',   wrongExpIndex);
writeFixture('p7_kavin_endbox_wrongexp.png',  wrongExpEndBox);

// G: Wrong page range (index shows page 1 instead of expected ~61 for Exp 4)
// "wrongpage" in filename for future real analyzer
const wrongPageIndex  = createSyntheticPng('kavin_index_wrongpage', 9001);
const wrongPageEndBox = createSyntheticPng('kavin_endbox_wrongpage', 9002);
writeFixture('p7_kavin_index_wrongpage.png',   wrongPageIndex);
writeFixture('p7_kavin_endbox_wrongpage.png',  wrongPageEndBox);

// H: Mismatched dates (lab was 2026-09-28, index shows 2025-03-15)
// "datemismatch" in filename
const dateMismatchIndex  = createSyntheticPng('kavin_index_datemismatch', 10001);
const dateMismatchEndBox = createSyntheticPng('kavin_endbox_datemismatch', 10002);
writeFixture('p7_kavin_index_datemismatch.png',   dateMismatchIndex);
writeFixture('p7_kavin_endbox_datemismatch.png',  dateMismatchEndBox);

// I: Index mark != end-box total (index shows 75, end-box shows 73)
// "mark_inconsist" triggers analyzer to return mismatched marks
const markInconsistIndex  = createSyntheticPng('kavin_index_mark_inconsist', 11001);
const markInconsistEndBox = createSyntheticPng('kavin_endbox_mark_inconsist', 11002);
writeFixture('p7_kavin_index_mark_inconsist.png',   markInconsistIndex);
writeFixture('p7_kavin_endbox_mark_inconsist.png',  markInconsistEndBox);

// J: Arithmetic mismatch (components don't add up to total)
// "arithmetic" triggers analyzer to return bad arithmetic
const arithmeticIndex  = createSyntheticPng('kavin_index_arithmetic', 12001);
const arithmeticEndBox = createSyntheticPng('kavin_endbox_arithmetic', 12002);
writeFixture('p7_kavin_index_arithmetic.png',   arithmeticIndex);
writeFixture('p7_kavin_endbox_arithmetic.png',  arithmeticEndBox);

// K: Writer-consistent pair (genuine Kavin samples)
const writerConsistIndex  = createSyntheticPng('kavin_index_writerconsist', 13001);
const writerConsistEndBox = createSyntheticPng('kavin_endbox_writerconsist', 13002);
writeFixture('p7_kavin_index_writerconsist.png',   writerConsistIndex);
writeFixture('p7_kavin_endbox_writerconsist.png',  writerConsistEndBox);

// L: Writer-inconsistent pair (different content style)
const writerInconsistIndex  = createSyntheticPng('different_writer_index', 99001);
const writerInconsistEndBox = createSyntheticPng('different_writer_endbox', 99002);
writeFixture('p7_inconsist_index.png',   writerInconsistIndex);
writeFixture('p7_inconsist_endbox.png',  writerInconsistEndBox);

// M: Insufficient writer samples (first submission — no profile established)
const firstSubIndex  = createSyntheticPng('arjun_first_index_exp4', 20001);
const firstSubEndBox = createSyntheticPng('arjun_first_endbox_exp4', 20002);
writeFixture('p7_arun_first_index.png',   firstSubIndex);
writeFixture('p7_arun_first_endbox.png',  firstSubEndBox);

console.log('');
console.log(`Total fixtures created: ${fs.readdirSync(OUTPUT_DIR).filter(f => f.startsWith('p7_')).length}`);
console.log('');
console.log('Benchmark conditions:');
console.log('  - All fixtures are SYNTHETIC (not real student photographs)');
console.log('  - Perceptual hash comparison operates on byte patterns');
console.log('  - Real-world accuracy cannot be claimed from synthetic data');
console.log('  - These fixtures test the logic and API plumbing only');
console.log('  - A real deployment requires actual handwritten lab record images');
