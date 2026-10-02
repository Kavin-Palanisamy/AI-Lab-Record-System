import { PrismaClient, RecordStatus, SessionStatus } from '@prisma/client';
import crypto from 'crypto';
import { CreateAuditLogParams } from '../services/auditService.js';
import { generateUniqueRecordCode, generateSecureQrToken } from '../utils/idGenerator.js';

// Prisma client instance
export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});

export { SessionStatus };

export interface IStudentData {
  id: string;
  registerNumber: string;
  name: string;
  email: string;
  passwordHash: string;
  className: string;
  section: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IFacultyData {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  department: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IExperimentData {
  id: string;
  experimentNumber: number;
  title: string;
  subject: string;
  description: string;
  endBoxPageNumber?: number; // End-of-experiment evaluation box page number configured by faculty
  maxMark?: number;          // Maximum mark configured by faculty
  isActive?: boolean;        // Active status
  department?: string;
  academicYear?: string;
  semester?: string;
  section?: string;
  createdAt: Date;
}

export interface ILabSessionData {
  id: string;
  experimentId: string;
  facultyId: string;
  sessionDate: Date;
  sessionCode: string;
  subject: string;
  className: string;
  section: string;
  maxMark: number;
  startTime?: string | null;
  endTime?: string | null;
  status: SessionStatus;
  templateVersion?: string;
  submissionWindowMinutes?: number | null;
  windowStartTime?: Date | null;
  windowEndTime?: Date | null;
  allowLateSubmission?: boolean;
  lockedAt?: Date | null;
  createdAt: Date;

  experiment?: IExperimentData;
  faculty?: IFacultyData;
  records?: ILabRecordData[];
}

export type RecordLifecycleState = 'GENERATED' | 'SUBMITTABLE' | 'SUBMITTED' | 'VERIFIED' | 'REJECTED' | 'LOCKED';

export interface ILabRecordData {
  id: string;
  studentId: string;
  experimentId: string;
  labSessionId: string;
  uniqueRecordCode: string;
  qrToken: string;
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
  submissionTimestamp?: Date | null;
  isLocked?: boolean;
  templateVersion?: string;
  reviewDurationSeconds?: number | null;
  firstSubmittedAt?: Date | null;
  lastSubmittedAt?: Date | null;
  submissionCount?: number;
  lifecycleState?: RecordLifecycleState;
  createdAt: Date;
  updatedAt: Date;

  student?: IStudentData;
  experiment?: IExperimentData;
  labSession?: ILabSessionData;
}

export interface ICaptureChallenge {
  id: string;
  challengeId: string;
  recordId: string;
  studentId: string;
  nonce: string;
  expiresAt: Date;
  isUsed: boolean;
  createdAt: Date;
}

export interface IAuditLogData {
  id: string;
  actorType: string;
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  metadata: string;
  createdAt: Date;
}

/**
 * Robust Database Store that supports PostgreSQL via Prisma ORM
 * and maintains an in-memory transactional cache for testing & offline mode.
 */
class DatabaseManager {
  private usePrisma = false;
  private isInitialized = false;

  // In-memory repositories initialized with standard seed data
  public students: IStudentData[] = [];
  public faculties: IFacultyData[] = [];
  public experiments: IExperimentData[] = [];
  public sessions: ILabSessionData[] = [];
  public records: ILabRecordData[] = [];
  public auditLogs: IAuditLogData[] = [];
  public captureChallenges: ICaptureChallenge[] = [];

  constructor() {
    this.seedDefaultData();
  }

  public async init() {
    if (this.isInitialized) return;
    try {
      // Test Prisma PostgreSQL connection
      await prisma.$connect();
      // Test a quick query
      await prisma.$queryRaw`SELECT 1`;
      this.usePrisma = true;
      console.log('✓ Successfully connected to PostgreSQL via Prisma ORM');
    } catch {
      this.usePrisma = false;
      console.log('ℹ PostgreSQL not connected; active in standalone in-memory seed mode');
    }
    this.isInitialized = true;
  }

  public resetMemoryStore() {
    this.seedDefaultData();
  }

  private seedDefaultData() {
    // Valid BCrypt hash for standard demo password: "Password123!"
    const DEFAULT_HASH = '$2a$10$6UB3AQyEvAh8VV3s86D1I.Uo1QS17/MCE.shGWs28PnafKpGaqXba';

    this.students = [
      {
        id: 'student-kavin-048',
        registerNumber: '048',
        name: 'Kavin',
        email: 'kavin@college.edu',
        passwordHash: DEFAULT_HASH,
        className: 'III EEE',
        section: 'A',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'student-arun-052',
        registerNumber: '052',
        name: 'Arun',
        email: 'arun@college.edu',
        passwordHash: DEFAULT_HASH,
        className: 'III EEE',
        section: 'A',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'student-priya-053',
        registerNumber: '053',
        name: 'Priya',
        email: 'priya@college.edu',
        passwordHash: DEFAULT_HASH,
        className: 'III EEE',
        section: 'A',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    this.faculties = [
      {
        id: 'faculty-ramanathan-001',
        name: 'Dr. Raman (Faculty Evaluator)',
        email: 'faculty@college.edu',
        passwordHash: DEFAULT_HASH,
        department: 'Department of Electrical and Electronics Engineering',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    this.experiments = [
      {
        id: 'exp-1',
        experimentNumber: 1,
        title: 'Transformer Open Circuit Test',
        subject: 'Electrical Machines Laboratory',
        description: 'Determination of equivalent circuit parameters, iron loss, and core characteristics of single-phase transformer.',
        endBoxPageNumber: 12,
        maxMark: 10.0,
        isActive: true,
        createdAt: new Date(),
      },
      {
        id: 'exp-2',
        experimentNumber: 2,
        title: 'Transformer Short Circuit Test',
        subject: 'Electrical Machines Laboratory',
        description: 'Determination of equivalent impedance, copper loss, and efficiency of single-phase transformer under rated current.',
        endBoxPageNumber: 18,
        maxMark: 10.0,
        isActive: true,
        createdAt: new Date(),
      },
      {
        id: 'exp-3',
        experimentNumber: 3,
        title: 'Digital Logic Verification',
        subject: 'Digital Electronics Laboratory',
        description: 'Design and implementation of Combinational Logic Circuits and verification of Truth Tables.',
        endBoxPageNumber: 25,
        maxMark: 10.0,
        isActive: true,
        createdAt: new Date(),
      },
      {
        id: 'exp-4',
        experimentNumber: 4,
        title: 'RLC Series and Parallel Resonance',
        subject: 'Electrical Circuits & Instrumentation Laboratory',
        description: 'Frequency response characteristics, bandwidth, and quality factor determination in RLC circuits.',
        endBoxPageNumber: 32,
        maxMark: 10.0,
        isActive: true,
        createdAt: new Date(),
      },
      {
        id: 'exp-5',
        experimentNumber: 5,
        title: 'SCR Controlled Rectifier',
        subject: 'Power Electronics Laboratory',
        description: 'Single-phase half-wave and full-wave controlled rectifier with resistive and inductive loads.',
        endBoxPageNumber: 38,
        maxMark: 10.0,
        isActive: true,
        createdAt: new Date(),
      },
      {
        id: 'exp-6',
        experimentNumber: 6,
        title: '8051 Microcontroller Timer & Port Interfacing',
        subject: 'Microcontroller Laboratory',
        description: 'Programming 8051 timers for square wave generation and 8-bit LED / 7-segment display interfacing.',
        endBoxPageNumber: 44,
        maxMark: 10.0,
        isActive: true,
        createdAt: new Date(),
      },
    ];

    this.sessions = [
      {
        id: 'session-12',
        experimentId: 'exp-3',
        facultyId: 'faculty-ramanathan-001',
        sessionDate: new Date('2026-09-28T09:00:00Z'),
        sessionCode: 'SESSION12',
        subject: 'Digital Electronics Laboratory',
        className: 'III EEE',
        section: 'A',
        maxMark: 10.0,
        startTime: '09:00 AM',
        endTime: '12:00 PM',
        status: 'ACTIVE',
        lockedAt: null,
        createdAt: new Date(),
      },
      {
        id: 'session-11',
        experimentId: 'exp-1',
        facultyId: 'faculty-ramanathan-001',
        sessionDate: new Date('2026-09-21T09:00:00Z'),
        sessionCode: 'SESSION11',
        subject: 'Electrical Machines Laboratory',
        className: 'III EEE',
        section: 'A',
        maxMark: 10.0,
        startTime: '09:00 AM',
        endTime: '12:00 PM',
        status: 'ACTIVE',
        lockedAt: null,
        createdAt: new Date(),
      },
      {
        id: 'session-10',
        experimentId: 'exp-2',
        facultyId: 'faculty-ramanathan-001',
        sessionDate: new Date('2026-09-25T09:00:00Z'),
        sessionCode: 'SESSION10',
        subject: 'Electrical Machines Laboratory',
        className: 'III EEE',
        section: 'A',
        maxMark: 10.0,
        startTime: '09:00 AM',
        endTime: '12:00 PM',
        status: 'ACTIVE',
        lockedAt: null,
        createdAt: new Date(),
      },
    ];

    // Seed deterministic QR tokens and records
    // Kavin's records:
    // Exp 1: Verified (8/10)
    // Exp 2: Pending
    // Exp 3: Pending ready for submission demo!
    const kavinExp3Token = 'kavin-qr-token-secure-exp03-2026';
    const arunExp3Token = 'arun-qr-token-secure-exp03-2026';
    const priyaExp3Token = 'priya-qr-token-secure-exp03-2026';

    this.records = [
      // Kavin - Exp 1 (Verified 8/10)
      {
        id: 'record-kavin-exp1',
        studentId: 'student-kavin-048',
        experimentId: 'exp-1',
        labSessionId: 'session-11',
        uniqueRecordCode: generateUniqueRecordCode('048', 1, 'SESSION11'),
        qrToken: 'kavin-qr-token-exp01-verified',
        imagePath: null,
        detectedStudentRegisterNumber: '048',
        detectedMark: 8.0,
        maxMark: 10.0,
        status: RecordStatus.VERIFIED,
        createdAt: new Date('2026-09-21T11:30:00Z'),
        updatedAt: new Date('2026-09-21T12:00:00Z'),
      },
      // Kavin - Exp 2 (Pending)
      {
        id: 'record-kavin-exp2',
        studentId: 'student-kavin-048',
        experimentId: 'exp-2',
        labSessionId: 'session-10',
        uniqueRecordCode: generateUniqueRecordCode('048', 2, 'SESSION10'),
        qrToken: 'kavin-qr-token-exp02-pending',
        imagePath: null,
        detectedStudentRegisterNumber: '048',
        detectedMark: null,
        maxMark: 10.0,
        status: RecordStatus.PENDING,
        createdAt: new Date('2026-09-25T11:30:00Z'),
        updatedAt: new Date('2026-09-25T11:30:00Z'),
      },
      // Kavin - Exp 3 (Active target for demo!)
      {
        id: 'record-kavin-exp3',
        studentId: 'student-kavin-048',
        experimentId: 'exp-3',
        labSessionId: 'session-12',
        uniqueRecordCode: generateUniqueRecordCode('048', 3, 'SESSION12'),
        qrToken: kavinExp3Token,
        imagePath: null,
        detectedStudentRegisterNumber: null,
        detectedMark: null,
        maxMark: 10.0,
        status: RecordStatus.PENDING,
        createdAt: new Date('2026-09-28T09:30:00Z'),
        updatedAt: new Date('2026-09-28T09:30:00Z'),
      },

      // Arun - Exp 3 (Arun's record used to test security rejection!)
      {
        id: 'record-arun-exp3',
        studentId: 'student-arun-052',
        experimentId: 'exp-3',
        labSessionId: 'session-12',
        uniqueRecordCode: generateUniqueRecordCode('052', 3, 'SESSION12'),
        qrToken: arunExp3Token,
        imagePath: null,
        detectedStudentRegisterNumber: null,
        detectedMark: null,
        maxMark: 10.0,
        status: RecordStatus.PENDING,
        createdAt: new Date('2026-09-28T09:30:00Z'),
        updatedAt: new Date('2026-09-28T09:30:00Z'),
      },

      // Priya - Exp 3
      {
        id: 'record-priya-exp3',
        studentId: 'student-priya-053',
        experimentId: 'exp-3',
        labSessionId: 'session-12',
        uniqueRecordCode: generateUniqueRecordCode('053', 3, 'SESSION12'),
        qrToken: priyaExp3Token,
        imagePath: null,
        detectedStudentRegisterNumber: null,
        detectedMark: null,
        maxMark: 10.0,
        status: RecordStatus.PENDING,
        createdAt: new Date('2026-09-28T09:30:00Z'),
        updatedAt: new Date('2026-09-28T09:30:00Z'),
      },
    ];

    this.auditLogs = [];
  }

  // --- Student Methods ---
  async getAllStudents(className?: string, section?: string): Promise<IStudentData[]> {
    if (this.usePrisma) {
      try {
        const where: any = {};
        if (className) where.className = className;
        if (section) where.section = section;
        const students = await prisma.student.findMany({ where, orderBy: { registerNumber: 'asc' } });
        if (students.length > 0) return students as IStudentData[];
      } catch {}
    }
    return this.students.filter((s) => {
      if (className && s.className !== className) return false;
      if (section && s.section !== section) return false;
      return true;
    });
  }

  async findStudentByRegisterNumber(registerNumber: string): Promise<IStudentData | null> {
    if (this.usePrisma) {
      try {
        const student = await prisma.student.findUnique({ where: { registerNumber } });
        if (student) return student as IStudentData;
      } catch {}
    }
    return this.students.find((s) => s.registerNumber === registerNumber) || null;
  }

  async findStudentById(id: string): Promise<IStudentData | null> {
    if (this.usePrisma) {
      try {
        const student = await prisma.student.findUnique({ where: { id } });
        if (student) return student as IStudentData;
      } catch {}
    }
    return this.students.find((s) => s.id === id) || null;
  }

  async upsertStudent(data: {
    registerNumber: string;
    name: string;
    email: string;
    className?: string;
    section?: string;
    passwordHash?: string;
  }): Promise<{ student: IStudentData; isNew: boolean }> {
    const existing = this.students.find(
      (s) => s.registerNumber.toLowerCase() === data.registerNumber.toLowerCase() ||
             s.email.toLowerCase() === data.email.toLowerCase()
    );

    if (existing) {
      existing.name = data.name || existing.name;
      existing.className = data.className || existing.className;
      existing.section = data.section || existing.section;
      if (data.passwordHash) existing.passwordHash = data.passwordHash;
      existing.updatedAt = new Date();

      if (this.usePrisma) {
        try {
          await prisma.student.update({
            where: { id: existing.id },
            data: {
              name: existing.name,
              className: existing.className,
              section: existing.section,
            },
          });
        } catch {}
      }
      return { student: existing, isNew: false };
    }

    const defaultHash = '$2a$10$6UB3AQyEvAh8VV3s86D1I.Uo1QS17/MCE.shGWs28PnafKpGaqXba'; // "Password123!"
    const newStudent: IStudentData = {
      id: `student-${data.registerNumber.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
      registerNumber: data.registerNumber,
      name: data.name,
      email: data.email,
      passwordHash: data.passwordHash || defaultHash,
      className: data.className || 'III EEE',
      section: data.section || 'A',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    if (this.usePrisma) {
      try {
        await prisma.student.create({ data: newStudent });
      } catch {}
    }

    this.students.push(newStudent);
    return { student: newStudent, isNew: true };
  }

  // --- Faculty Methods ---
  async findFacultyByEmail(email: string): Promise<IFacultyData | null> {
    if (this.usePrisma) {
      try {
        const fac = await prisma.faculty.findUnique({ where: { email } });
        if (fac) return fac as IFacultyData;
      } catch {}
    }
    return this.faculties.find((f) => f.email.toLowerCase() === email.toLowerCase()) || null;
  }

  async findFacultyById(id: string): Promise<IFacultyData | null> {
    if (this.usePrisma) {
      try {
        const fac = await prisma.faculty.findUnique({ where: { id } });
        if (fac) return fac as IFacultyData;
      } catch {}
    }
    return this.faculties.find((f) => f.id === id) || null;
  }

  // --- Experiments & Sessions ---
  async getExperiments(): Promise<IExperimentData[]> {
    if (this.usePrisma) {
      try {
        return (await prisma.experiment.findMany({ orderBy: { experimentNumber: 'asc' } })) as IExperimentData[];
      } catch {}
    }
    return [...this.experiments].sort((a, b) => a.experimentNumber - b.experimentNumber);
  }

  async getExperimentById(id: string): Promise<IExperimentData | null> {
    if (this.usePrisma) {
      try {
        const exp = await prisma.experiment.findUnique({ where: { id } });
        if (exp) return exp as IExperimentData;
      } catch {}
    }
    return this.experiments.find((e) => e.id === id) || null;
  }

  async createExperiment(data: {
    experimentNumber: number;
    title: string;
    subject?: string;
    description?: string;
    endBoxPageNumber: number;
    maxMark?: number;
    isActive?: boolean;
    department?: string;
    academicYear?: string;
    semester?: string;
    section?: string;
  }): Promise<IExperimentData> {
    const exp: IExperimentData = {
      id: `exp-${data.experimentNumber}-${Date.now()}`,
      experimentNumber: data.experimentNumber,
      title: data.title,
      subject: data.subject || 'Electrical Machines Laboratory',
      description: data.description || '',
      endBoxPageNumber: data.endBoxPageNumber,
      maxMark: data.maxMark ?? 10.0,
      isActive: data.isActive ?? true,
      department: data.department || 'Electrical and Electronics Engineering',
      academicYear: data.academicYear || '2026-2027',
      semester: data.semester || 'Semester VI',
      section: data.section || 'A',
      createdAt: new Date(),
    };

    if (this.usePrisma) {
      try {
        await prisma.experiment.create({
          data: {
            id: exp.id,
            experimentNumber: exp.experimentNumber,
            title: exp.title,
            subject: exp.subject,
            description: exp.description,
          },
        });
      } catch {}
    }

    this.experiments.push(exp);
    return exp;
  }

  async updateExperiment(id: string, data: Partial<IExperimentData>): Promise<IExperimentData> {
    const idx = this.experiments.findIndex((e) => e.id === id);
    if (idx === -1) {
      throw new Error(`Experiment not found: ${id}`);
    }
    this.experiments[idx] = {
      ...this.experiments[idx],
      ...data,
    };
    return this.experiments[idx];
  }

  async createLabSession(data: {
    experimentId: string;
    facultyId: string;
    sessionDate: Date;
    sessionCode: string;
    subject: string;
    className: string;
    section: string;
    maxMark?: number;
    startTime?: string | null;
    endTime?: string | null;
    status?: SessionStatus;
    lockedAt?: Date | null;
  }): Promise<ILabSessionData> {
    const session: ILabSessionData = {
      id: `session-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      experimentId: data.experimentId,
      facultyId: data.facultyId,
      sessionDate: data.sessionDate,
      sessionCode: data.sessionCode,
      subject: data.subject || 'Electrical Machines Laboratory',
      className: data.className || 'III EEE',
      section: data.section || 'A',
      maxMark: data.maxMark ?? 10.0,
      startTime: data.startTime || null,
      endTime: data.endTime || null,
      status: data.status || 'ACTIVE',
      lockedAt: data.lockedAt || null,
      createdAt: new Date(),
    };

    if (this.usePrisma) {
      try {
        const created = await prisma.labSession.create({
          data: {
            id: session.id,
            experimentId: session.experimentId,
            facultyId: session.facultyId,
            sessionDate: session.sessionDate,
            sessionCode: session.sessionCode,
            subject: session.subject,
            className: session.className,
            section: session.section,
            maxMark: session.maxMark,
            startTime: session.startTime,
            endTime: session.endTime,
            status: session.status,
            lockedAt: session.lockedAt,
          },
          include: { experiment: true, faculty: true },
        });
        return created as any;
      } catch {}
    }

    this.sessions.push(session);
    return this.populateSession(session);
  }

  async getLabSessions(facultyId?: string): Promise<ILabSessionData[]> {
    if (this.usePrisma) {
      try {
        const where = facultyId ? { facultyId } : {};
        const sessions = await prisma.labSession.findMany({
          where,
          include: { experiment: true, faculty: true, records: { include: { student: true } } },
          orderBy: { createdAt: 'desc' },
        });
        if (sessions.length > 0) return sessions as any;
      } catch {}
    }
    const filtered = facultyId ? this.sessions.filter((s) => s.facultyId === facultyId) : this.sessions;
    return filtered.map((s) => this.populateSession(s));
  }

  async getLabSessionById(id: string): Promise<ILabSessionData | null> {
    if (this.usePrisma) {
      try {
        const session = await prisma.labSession.findUnique({
          where: { id },
          include: { experiment: true, faculty: true, records: { include: { student: true, experiment: true } } },
        });
        if (session) return session as any;
      } catch {}
    }
    const found = this.sessions.find((s) => s.id === id || s.sessionCode === id);
    return found ? this.populateSession(found) : null;
  }

  async updateLabSession(id: string, data: Partial<ILabSessionData>): Promise<ILabSessionData> {
    const { experiment, faculty, records, ...scalarData } = data;
    if (this.usePrisma) {
      try {
        const updated = await prisma.labSession.update({
          where: { id },
          data: scalarData as any,
          include: { experiment: true, faculty: true, records: true },
        });
        return updated as any;
      } catch {}
    }
    const idx = this.sessions.findIndex((s) => s.id === id);
    if (idx === -1) {
      throw new Error(`Session not found: ${id}`);
    }
    this.sessions[idx] = {
      ...this.sessions[idx],
      ...data,
    };
    return this.populateSession(this.sessions[idx]);
  }

  populateSession(session: ILabSessionData): ILabSessionData {
    return {
      ...session,
      experiment: this.experiments.find((e) => e.id === session.experimentId),
      faculty: this.faculties.find((f) => f.id === session.facultyId),
      records: this.records.filter((r) => r.labSessionId === session.id).map((r) => this.populateRecord(r)),
    };
  }

  // --- Lab Record Methods ---
  async getStudentRecords(studentId: string): Promise<ILabRecordData[]> {
    if (this.usePrisma) {
      try {
        const records = await prisma.labRecord.findMany({
          where: { studentId },
          include: { experiment: true, labSession: true },
          orderBy: { createdAt: 'desc' },
        });
        if (records.length > 0) return records as any;
      } catch {}
    }
    return this.records
      .filter((r) => r.studentId === studentId)
      .map((r) => this.populateRecord(r));
  }

  async getRecordById(id: string): Promise<ILabRecordData | null> {
    if (this.usePrisma) {
      try {
        const record = await prisma.labRecord.findUnique({
          where: { id },
          include: { student: true, experiment: true, labSession: true },
        });
        if (record) return record as any;
      } catch {}
    }
    const found = this.records.find((r) => r.id === id);
    return found ? this.populateRecord(found) : null;
  }

  async getOrCreateStudentRecord(studentId: string, experimentId: string): Promise<ILabRecordData> {
    const existing = this.records.find((r) => r.studentId === studentId && r.experimentId === experimentId);
    if (existing) {
      return this.populateRecord(existing);
    }

    const student = await this.findStudentById(studentId);
    const experiment = await this.getExperimentById(experimentId);
    const session = this.sessions[0];
    const sessionCode = session?.sessionCode || 'EEE-LAB';

    const newRecord: ILabRecordData = {
      id: `record-${studentId}-${experimentId}`,
      studentId,
      experimentId,
      labSessionId: session?.id || 'session-default',
      uniqueRecordCode: generateUniqueRecordCode(student?.registerNumber || '000', experiment?.experimentNumber || 1, sessionCode),
      qrToken: `legacy-token-${Date.now()}`,
      imagePath: null,
      detectedStudentRegisterNumber: null,
      detectedMark: null,
      maxMark: experiment?.maxMark ?? 10.0,
      status: RecordStatus.PENDING,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.records.push(newRecord);
    return this.populateRecord(newRecord);
  }

  async getRecordByToken(qrToken: string): Promise<ILabRecordData | null> {
    if (this.usePrisma) {
      try {
        const record = await prisma.labRecord.findUnique({
          where: { qrToken },
          include: { student: true, experiment: true, labSession: true },
        });
        if (record) return record as any;
      } catch {}
    }
    let found = this.records.find((r) => r.qrToken === qrToken);
    if (found) return this.populateRecord(found);

    // If not found directly and token is in signed format (v1.payload.sig), decode recordId from payload
    if (qrToken && typeof qrToken === 'string' && qrToken.startsWith('v1.')) {
      try {
        const parts = qrToken.split('.');
        if (parts.length === 3 && parts[1]) {
          const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
          if (payload && payload.recordId) {
            found = this.records.find((r) => r.id === payload.recordId);
            if (found) return this.populateRecord(found);
          }
        }
      } catch {}
    }

    return null;
  }

  async getRecordByCode(uniqueRecordCode: string): Promise<ILabRecordData | null> {
    if (this.usePrisma) {
      try {
        const record = await prisma.labRecord.findUnique({
          where: { uniqueRecordCode },
          include: { student: true, experiment: true, labSession: true },
        });
        if (record) return record as any;
      } catch {}
    }
    const found = this.records.find((r) => r.uniqueRecordCode === uniqueRecordCode);
    return found ? this.populateRecord(found) : null;
  }

  async getAllRecords(): Promise<ILabRecordData[]> {
    if (this.usePrisma) {
      try {
        const records = await prisma.labRecord.findMany({
          include: { student: true, experiment: true, labSession: true },
          orderBy: { updatedAt: 'desc' },
        });
        if (records.length > 0) return records as any;
      } catch {}
    }
    return this.records.map((r) => this.populateRecord(r));
  }

  async createLabRecord(data: {
    studentId: string;
    experimentId: string;
    labSessionId: string;
    uniqueRecordCode: string;
    qrToken: string;
    maxMark?: number;
    facultyAwardedMark?: number | null;
    status?: RecordStatus;
    templateVersion?: string;
    id?: string;
  }): Promise<ILabRecordData> {
    const record: ILabRecordData = {
      id: data.id || `record-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      studentId: data.studentId,
      experimentId: data.experimentId,
      labSessionId: data.labSessionId,
      uniqueRecordCode: data.uniqueRecordCode,
      qrToken: data.qrToken,
      imagePath: null,
      detectedStudentRegisterNumber: null,
      detectedMark: null,
      facultyAwardedMark: data.facultyAwardedMark ?? null,
      markVerificationStatus: null,
      maxMark: data.maxMark ?? 10.0,
      status: data.status || RecordStatus.PENDING,
      submissionTimestamp: null,
      isLocked: false,
      templateVersion: data.templateVersion || 'EEE-LAB-TEMPLATE-V1',
      reviewDurationSeconds: null,
      firstSubmittedAt: null,
      lastSubmittedAt: null,
      submissionCount: 0,
      lifecycleState: 'SUBMITTABLE',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    if (this.usePrisma) {
      try {
        const created = await prisma.labRecord.create({
          data: {
            id: record.id,
            studentId: record.studentId,
            experimentId: record.experimentId,
            labSessionId: record.labSessionId,
            uniqueRecordCode: record.uniqueRecordCode,
            qrToken: record.qrToken,
            maxMark: record.maxMark,
            facultyAwardedMark: record.facultyAwardedMark,
            status: record.status,
          },
          include: { student: true, experiment: true, labSession: true },
        });
        return created as any;
      } catch {}
    }

    this.records.push(record);
    return this.populateRecord(record);
  }

  async findRecordByStudentExpSession(
    studentId: string,
    experimentId: string,
    labSessionId: string
  ): Promise<ILabRecordData | null> {
    if (this.usePrisma) {
      try {
        const record = await prisma.labRecord.findFirst({
          where: { studentId, experimentId, labSessionId },
          include: { student: true, experiment: true, labSession: true },
        });
        if (record) return record as any;
      } catch {}
    }
    const found = this.records.find(
      (r) => r.studentId === studentId && r.experimentId === experimentId && r.labSessionId === labSessionId
    );
    return found ? this.populateRecord(found) : null;
  }

  async getRecordsBySession(sessionId: string): Promise<ILabRecordData[]> {
    if (this.usePrisma) {
      try {
        const records = await prisma.labRecord.findMany({
          where: { labSessionId: sessionId },
          include: { student: true, experiment: true, labSession: true },
          orderBy: { createdAt: 'asc' },
        });
        if (records.length > 0) return records as any;
      } catch {}
    }
    return this.records.filter((r) => r.labSessionId === sessionId).map((r) => this.populateRecord(r));
  }

  async updateRecord(id: string, data: Partial<ILabRecordData>): Promise<ILabRecordData> {
    const { student, experiment, labSession, ...scalarData } = data;
    if (this.usePrisma) {
      try {
        const updated = await prisma.labRecord.update({
          where: { id },
          data: {
            ...scalarData,
            updatedAt: new Date(),
          },
          include: { student: true, experiment: true, labSession: true },
        });
        return updated as any;
      } catch {}
    }
    const idx = this.records.findIndex((r) => r.id === id);
    if (idx === -1) {
      throw new Error(`Record not found: ${id}`);
    }
    this.records[idx] = {
      ...this.records[idx],
      ...data,
      updatedAt: new Date(),
    };
    return this.populateRecord(this.records[idx]);
  }

  private populateRecord(record: ILabRecordData): ILabRecordData {
    return {
      ...record,
      student: this.students.find((s) => s.id === record.studentId),
      experiment: this.experiments.find((e) => e.id === record.experimentId),
      labSession: this.sessions.find((s) => s.id === record.labSessionId),
    };
  }

  // --- Audit Log Methods ---
  async createAuditLog(params: CreateAuditLogParams): Promise<IAuditLogData> {
    const log: IAuditLogData = {
      id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      actorType: params.actorType,
      actorId: params.actorId,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      metadata: JSON.stringify(params.metadata || {}),
      createdAt: new Date(),
    };

    if (this.usePrisma) {
      try {
        const created = await prisma.auditLog.create({
          data: {
            actorType: log.actorType,
            actorId: log.actorId,
            action: log.action,
            entityType: log.entityType,
            entityId: log.entityId,
            metadata: log.metadata,
          },
        });
        return created as IAuditLogData;
      } catch {}
    }

    this.auditLogs.unshift(log);
    return log;
  }

  async getAuditLogs(limit = 100): Promise<IAuditLogData[]> {
    if (this.usePrisma) {
      try {
        return (await prisma.auditLog.findMany({
          orderBy: { createdAt: 'desc' },
          take: limit,
        })) as IAuditLogData[];
      } catch {}
    }
    return this.auditLogs.slice(0, limit);
  }

  async getLogsByEntity(entityType: string, entityId: string): Promise<IAuditLogData[]> {
    if (this.usePrisma) {
      try {
        return (await prisma.auditLog.findMany({
          where: { entityType, entityId },
          orderBy: { createdAt: 'desc' },
        })) as IAuditLogData[];
      } catch {}
    }
    return this.auditLogs.filter((l) => l.entityType === entityType && l.entityId === entityId);
  }

  // --- Capture Challenge Nonce Methods ---
  createCaptureChallenge(recordId: string, studentId: string, ttlSeconds = 300): ICaptureChallenge {
    const id = `chal-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const challenge: ICaptureChallenge = {
      id,
      challengeId: id,
      recordId,
      studentId,
      nonce: crypto.randomBytes(16).toString('hex'),
      expiresAt: new Date(Date.now() + ttlSeconds * 1000),
      isUsed: false,
      createdAt: new Date(),
    };
    this.captureChallenges.push(challenge);
    return challenge;
  }

  getCaptureChallenge(challengeId: string): ICaptureChallenge | null {
    return this.captureChallenges.find((c) => c.challengeId === challengeId || c.id === challengeId) || null;
  }

  consumeCaptureChallenge(challengeId: string): boolean {
    const chal = this.getCaptureChallenge(challengeId);
    if (!chal) return false;
    chal.isUsed = true;
    return true;
  }

  async reopenRecord(recordId: string, reason?: string): Promise<ILabRecordData> {
    const updated = await this.updateRecord(recordId, {
      status: RecordStatus.PENDING,
      isLocked: false,
      lifecycleState: 'SUBMITTABLE',
      manualReviewReason: reason ? `Reopened by faculty: ${reason}` : null,
    });
    return updated;
  }
}

export const db = new DatabaseManager();
