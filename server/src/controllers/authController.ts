import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { db } from '../prisma/db.js';
import { comparePassword, generateToken } from '../utils/token.js';
import { UnauthorizedError } from '../utils/errors.js';
import { defaultRecordService } from '../services/recordService.js';
import { AuditService } from '../services/auditService.js';

const auditService = new AuditService(db);

export const studentLoginSchema = z.object({
  body: z.object({
    registerNumber: z.string().min(1, 'Register number is required'),
    password: z.string().min(1, 'Password is required'),
  }),
});

export const facultyLoginSchema = z.object({
  body: z.object({
    email: z.string().email('Valid email is required'),
    password: z.string().min(1, 'Password is required'),
  }),
});

export async function studentLogin(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { registerNumber, password } = req.body;

    const student = await db.findStudentByRegisterNumber(registerNumber);
    if (!student) {
      throw new UnauthorizedError('Invalid register number or password');
    }

    const isMatch = await comparePassword(password, student.passwordHash);
    if (!isMatch) {
      throw new UnauthorizedError('Invalid register number or password');
    }

    const token = generateToken({
      id: student.id,
      role: 'STUDENT',
      email: student.email,
      name: student.name,
      registerNumber: student.registerNumber,
    });

    await auditService.log({
      actorType: 'STUDENT',
      actorId: student.id,
      action: 'STUDENT_LOGIN',
      entityType: 'Auth',
      entityId: student.id,
      metadata: { registerNumber: student.registerNumber },
    });

    res.json({
      success: true,
      message: 'Student authenticated successfully',
      data: {
        token,
        user: {
          id: student.id,
          registerNumber: student.registerNumber,
          name: student.name,
          email: student.email,
          className: student.className,
          section: student.section,
          role: 'STUDENT',
        },
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function facultyLogin(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { email, password } = req.body;

    const faculty = await db.findFacultyByEmail(email);
    if (!faculty) {
      throw new UnauthorizedError('Invalid email or password');
    }

    const isMatch = await comparePassword(password, faculty.passwordHash);
    if (!isMatch) {
      throw new UnauthorizedError('Invalid email or password');
    }

    const token = generateToken({
      id: faculty.id,
      role: 'FACULTY',
      email: faculty.email,
      name: faculty.name,
      department: faculty.department,
    });

    await auditService.log({
      actorType: 'FACULTY',
      actorId: faculty.id,
      action: 'FACULTY_LOGIN',
      entityType: 'Auth',
      entityId: faculty.id,
      metadata: { email: faculty.email, department: faculty.department },
    });

    res.json({
      success: true,
      message: 'Faculty authenticated successfully',
      data: {
        token,
        user: {
          id: faculty.id,
          name: faculty.name,
          email: faculty.email,
          department: faculty.department,
          role: 'FACULTY',
        },
      },
    });
  } catch (error) {
    next(error);
  }
}
