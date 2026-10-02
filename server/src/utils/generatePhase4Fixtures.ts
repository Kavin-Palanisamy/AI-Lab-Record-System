import Jimp from 'jimp';
import QRCode from 'qrcode';
import path from 'path';
import fs from 'fs';

async function generateFixture(options: {
  filename: string;
  regNo: string;
  studentName: string;
  expNum: number;
  expTitle: string;
  subject: string;
  sessionCode: string;
  mark: string;
  qrToken: string;
}) {
  const docsDir = path.resolve(process.cwd(), '../docs/demo-docs');
  if (!fs.existsSync(docsDir)) {
    fs.mkdirSync(docsDir, { recursive: true });
  }

  const width = 800;
  const height = 1100;
  const image = new Jimp(width, height, 0xffffffff); // white background

  // Draw border (outer double border)
  const borderMargin = 20;
  for (let x = borderMargin; x < width - borderMargin; x++) {
    image.setPixelColor(0x0f172aff, x, borderMargin);
    image.setPixelColor(0x0f172aff, x, borderMargin + 2);
    image.setPixelColor(0x0f172aff, x, height - borderMargin);
    image.setPixelColor(0x0f172aff, x, height - borderMargin - 2);
  }
  for (let y = borderMargin; y < height - borderMargin; y++) {
    image.setPixelColor(0x0f172aff, borderMargin, y);
    image.setPixelColor(0x0f172aff, borderMargin + 2, y);
    image.setPixelColor(0x0f172aff, width - borderMargin, y);
    image.setPixelColor(0x0f172aff, width - borderMargin - 2, y);
  }

  // Load standard Jimp font
  const font16 = await Jimp.loadFont(Jimp.FONT_SANS_16_BLACK);
  const font32 = await Jimp.loadFont(Jimp.FONT_SANS_32_BLACK);

  // Title
  image.print(font16, 40, 50, {
    text: 'COLLEGE OF ENGINEERING & TECHNOLOGY',
    alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER,
  }, 720);

  image.print(font16, 40, 80, {
    text: 'DEPARTMENT OF ELECTRICAL AND ELECTRONICS ENGINEERING',
    alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER,
  }, 720);

  image.print(font16, 40, 110, {
    text: 'OFFICIAL LABORATORY RECORD & CONTINUOUS EVALUATION',
    alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER,
  }, 720);

  // Experiment Box
  image.print(font16, 50, 170, `Subject: ${options.subject}`);
  image.print(font16, 50, 200, `Experiment ${options.expNum}: ${options.expTitle}`);

  // Student Details
  image.print(font16, 50, 260, `Student Name:    ${options.studentName}`);
  image.print(font16, 50, 290, `Register Number: ${options.regNo}`);
  image.print(font16, 50, 320, `Class & Section: III EEE - A`);
  image.print(font16, 50, 350, `Lab Session:     ${options.sessionCode}`);

  // QR Code generation
  const qrBuffer = await QRCode.toBuffer(`LAB_RECORD:${options.qrToken}`, {
    width: 200,
    margin: 1,
  });
  const qrImage = await Jimp.read(qrBuffer);
  image.composite(qrImage, 500, 240);

  // Mark & Faculty Evaluation Section
  image.print(font16, 50, 480, 'FACULTY CONTINUOUS EVALUATION:');
  image.print(font32, 50, 520, `Awarded Mark: ${options.mark} / 10`);

  // Faculty Signature representation (stroke simulation)
  image.print(font16, 500, 520, 'Faculty Signature:');
  // Draw signature strokes
  for (let sx = 520; sx < 680; sx++) {
    const sy = 560 + Math.sin((sx - 520) / 10) * 12 + ((sx * 3) % 7);
    image.setPixelColor(0x1e3a8aff, sx, Math.round(sy));
    image.setPixelColor(0x1e3a8aff, sx, Math.round(sy) + 1);
  }

  // Footer
  image.print(font16, 40, 980, {
    text: `SECURE LAB RECORD • ID: ${options.qrToken.substring(0, 16)}`,
    alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER,
  }, 720);

  const outputPath = path.join(docsDir, options.filename);
  await image.writeAsync(outputPath);
  console.log(`✓ Generated fixture: ${outputPath}`);
}

async function main() {
  // 1. Kavin Exp 1 Genuine Document with Mark 8.5
  await generateFixture({
    filename: 'kavin_exp1_match_mark8_5.png',
    regNo: '048',
    studentName: 'Kavin',
    expNum: 1,
    expTitle: 'Transformer Open Circuit Test',
    subject: 'Electrical Machines Laboratory',
    sessionCode: 'SESSION-EEE-TRANSFORMER-01',
    mark: '8.5',
    qrToken: 'kavin-qr-token-eee-exp01-mark85',
  });

  // 2. Kavin Exp 1 Altered/Mismatched Document with Mark 10.0
  await generateFixture({
    filename: 'kavin_exp1_mismatch_mark10.png',
    regNo: '048',
    studentName: 'Kavin',
    expNum: 1,
    expTitle: 'Transformer Open Circuit Test',
    subject: 'Electrical Machines Laboratory',
    sessionCode: 'SESSION-EEE-TRANSFORMER-01',
    mark: '10.0',
    qrToken: 'kavin-qr-token-eee-exp01-mark85',
  });

  console.log('✅ Phase 4 synthetic fixtures created successfully!');
}

main().catch(console.error);
