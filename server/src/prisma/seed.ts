import { PrismaClient, RecordStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { generateUniqueRecordCode } from '../utils/idGenerator.js';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seeding...');

  // Hash standard password "Password123!"
  const passwordHash = await bcrypt.hash('Password123!', 10);

  // 1. Seed Students
  const kavin = await prisma.student.upsert({
    where: { registerNumber: '048' },
    update: {},
    create: {
      id: 'student-kavin-048',
      registerNumber: '048',
      name: 'Kavin',
      email: 'kavin@college.edu',
      passwordHash,
      className: 'B.Tech IT - III Year',
      section: 'A',
    },
  });

  const arun = await prisma.student.upsert({
    where: { registerNumber: '052' },
    update: {},
    create: {
      id: 'student-arun-052',
      registerNumber: '052',
      name: 'Arun',
      email: 'arun@college.edu',
      passwordHash,
      className: 'B.Tech IT - III Year',
      section: 'A',
    },
  });

  const priya = await prisma.student.upsert({
    where: { registerNumber: '053' },
    update: {},
    create: {
      id: 'student-priya-053',
      registerNumber: '053',
      name: 'Priya',
      email: 'priya@college.edu',
      passwordHash,
      className: 'B.Tech IT - III Year',
      section: 'A',
    },
  });

  console.log(`✓ Seeded students: ${kavin.name} (048), ${arun.name} (052), ${priya.name} (053)`);

  // 2. Seed Faculty
  const faculty = await prisma.faculty.upsert({
    where: { email: 'faculty@college.edu' },
    update: {},
    create: {
      id: 'faculty-ramanathan-001',
      name: 'Dr. Ramanathan (Demo Faculty)',
      email: 'faculty@college.edu',
      passwordHash,
      department: 'Information Technology',
    },
  });

  console.log(`✓ Seeded faculty: ${faculty.name}`);

  // 3. Seed Experiments
  const exp1 = await prisma.experiment.upsert({
    where: { id: 'exp-1' },
    update: {},
    create: {
      id: 'exp-1',
      experimentNumber: 1,
      title: 'Basic Electrical Measurements',
      subject: 'Circuits & Instrumentation Lab',
      description: 'Measurement of voltage, current, and power using digital multimeter and verification of Ohm’s law.',
    },
  });

  const exp2 = await prisma.experiment.upsert({
    where: { id: 'exp-2' },
    update: {},
    create: {
      id: 'exp-2',
      experimentNumber: 2,
      title: 'DC Machine Test',
      subject: 'Electrical Machines Lab',
      description: 'Load test on DC shunt motor and plotting electrical efficiency curve.',
    },
  });

  const exp3 = await prisma.experiment.upsert({
    where: { id: 'exp-3' },
    update: {},
    create: {
      id: 'exp-3',
      experimentNumber: 3,
      title: 'Digital Electronics',
      subject: 'Digital Systems Lab',
      description: 'Design and implementation of Combinational Logic Circuits and verification of Truth Tables.',
    },
  });

  console.log(`✓ Seeded experiments: Exp 1, Exp 2, Exp 3`);

  // 4. Seed Lab Sessions
  const session11 = await prisma.labSession.upsert({
    where: { sessionCode: 'SESSION11' },
    update: {},
    create: {
      id: 'session-11',
      experimentId: exp1.id,
      facultyId: faculty.id,
      sessionDate: new Date('2026-09-21T09:00:00Z'),
      sessionCode: 'SESSION11',
    },
  });

  const session10 = await prisma.labSession.upsert({
    where: { sessionCode: 'SESSION10' },
    update: {},
    create: {
      id: 'session-10',
      experimentId: exp2.id,
      facultyId: faculty.id,
      sessionDate: new Date('2026-09-25T09:00:00Z'),
      sessionCode: 'SESSION10',
    },
  });

  const session12 = await prisma.labSession.upsert({
    where: { sessionCode: 'SESSION12' },
    update: {},
    create: {
      id: 'session-12',
      experimentId: exp3.id,
      facultyId: faculty.id,
      sessionDate: new Date('2026-09-28T09:00:00Z'),
      sessionCode: 'SESSION12',
    },
  });

  console.log(`✓ Seeded lab sessions: SESSION10, SESSION11, SESSION12`);

  // 5. Seed Lab Records
  // Kavin Exp 1 (Verified 8/10)
  await prisma.labRecord.upsert({
    where: { uniqueRecordCode: generateUniqueRecordCode('048', 1, 'SESSION11') },
    update: {},
    create: {
      id: 'record-kavin-exp1',
      studentId: kavin.id,
      experimentId: exp1.id,
      labSessionId: session11.id,
      uniqueRecordCode: generateUniqueRecordCode('048', 1, 'SESSION11'),
      qrToken: 'kavin-qr-token-exp01-verified',
      detectedStudentRegisterNumber: '048',
      detectedMark: 8.0,
      maxMark: 10.0,
      status: RecordStatus.VERIFIED,
    },
  });

  // Kavin Exp 2 (Pending)
  await prisma.labRecord.upsert({
    where: { uniqueRecordCode: generateUniqueRecordCode('048', 2, 'SESSION10') },
    update: {},
    create: {
      id: 'record-kavin-exp2',
      studentId: kavin.id,
      experimentId: exp2.id,
      labSessionId: session10.id,
      uniqueRecordCode: generateUniqueRecordCode('048', 2, 'SESSION10'),
      qrToken: 'kavin-qr-token-exp02-pending',
      detectedStudentRegisterNumber: '048',
      maxMark: 10.0,
      status: RecordStatus.PENDING,
    },
  });

  // Kavin Exp 3 (Ready for submission demo)
  await prisma.labRecord.upsert({
    where: { uniqueRecordCode: generateUniqueRecordCode('048', 3, 'SESSION12') },
    update: {},
    create: {
      id: 'record-kavin-exp3',
      studentId: kavin.id,
      experimentId: exp3.id,
      labSessionId: session12.id,
      uniqueRecordCode: generateUniqueRecordCode('048', 3, 'SESSION12'),
      qrToken: 'kavin-qr-token-secure-exp03-2026',
      maxMark: 10.0,
      status: RecordStatus.PENDING,
    },
  });

  // Arun Exp 3 (Arun's record to test ownership mismatch)
  await prisma.labRecord.upsert({
    where: { uniqueRecordCode: generateUniqueRecordCode('052', 3, 'SESSION12') },
    update: {},
    create: {
      id: 'record-arun-exp3',
      studentId: arun.id,
      experimentId: exp3.id,
      labSessionId: session12.id,
      uniqueRecordCode: generateUniqueRecordCode('052', 3, 'SESSION12'),
      qrToken: 'arun-qr-token-secure-exp03-2026',
      maxMark: 10.0,
      status: RecordStatus.PENDING,
    },
  });

  // Priya Exp 3
  await prisma.labRecord.upsert({
    where: { uniqueRecordCode: generateUniqueRecordCode('053', 3, 'SESSION12') },
    update: {},
    create: {
      id: 'record-priya-exp3',
      studentId: priya.id,
      experimentId: exp3.id,
      labSessionId: session12.id,
      uniqueRecordCode: generateUniqueRecordCode('053', 3, 'SESSION12'),
      qrToken: 'priya-qr-token-secure-exp03-2026',
      maxMark: 10.0,
      status: RecordStatus.PENDING,
    },
  });

  console.log(`✓ Seeded initial lab records with deterministic QR tokens`);
  console.log('✅ Seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error('Seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
