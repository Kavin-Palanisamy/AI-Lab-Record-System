import { Router } from 'express';
import {
  getFacultyDashboard,
  getAllRecords,
  getRecordById,
  approveRecord,
  rejectRecord,
  correctRecord,
  getAuditLogs,
  createSession,
  getFacultySessions,
  getFacultySessionById,
  updateSessionStatus,
  generateSessionRecords,
  awardFacultyMark,
  exportSessionExcel,
  getRecordSheet,
  downloadSessionSheetsZip,
  getFacultyStudents,
  getSessionStats,
  getEvaluationMetrics,
  bulkApproveRecords,
  reopenRecord,
  getFacultyExperiments,
  createExperiment,
  updateExperiment,
  importStudentsExcel,
  downloadStudentTemplateExcel,
} from '../controllers/facultyController.js';
import {
  getFacultyOwnershipDetails,
  facultyApproveOwnership,
  facultyRejectOwnership,
  facultyRequestRetake,
  addWriterSample,
  getOwnershipStatistics,
} from '../controllers/ownershipController.js';
import { authenticate, requireRole } from '../middleware/authMiddleware.js';
import { uploadRecordImage, uploadSpreadsheet } from '../middleware/uploadMiddleware.js';

const router = Router();

// Protect all faculty routes: strictly require FACULTY role
router.use(authenticate, requireRole(['FACULTY']));

// Phase 9 Real-World Redesign: Experiment Master & Student Roster
router.get('/experiments', getFacultyExperiments);
router.post('/experiments', createExperiment);
router.put('/experiments/:id', updateExperiment);
router.post('/students/import-excel', uploadSpreadsheet.single('file'), importStudentsExcel);
router.get('/students/template-excel', downloadStudentTemplateExcel);

// Dashboard and Students
router.get('/dashboard', getFacultyDashboard);
router.get('/students', getFacultyStudents);
router.get('/audit-logs', getAuditLogs);
router.get('/evaluation-metrics', getEvaluationMetrics);

// Sessions
router.post('/sessions', createSession);
router.get('/sessions', getFacultySessions);
router.get('/sessions/:id', getFacultySessionById);
router.get('/sessions/:id/stats', getSessionStats);
router.patch('/sessions/:id/status', updateSessionStatus);
router.post('/sessions/:id/generate-records', generateSessionRecords);
router.get('/sessions/:id/export-excel', exportSessionExcel);
router.get('/sessions/:id/download-sheets', downloadSessionSheetsZip);

// Records
router.get('/records', getAllRecords);
router.post('/records/bulk-approve', bulkApproveRecords);
router.get('/records/:id', getRecordById);
router.post('/records/:id/award-mark', awardFacultyMark);
router.post('/records/:id/approve', approveRecord);
router.post('/records/:id/reject', rejectRecord);
router.post('/records/:id/correct', correctRecord);
router.post('/records/:id/reopen', reopenRecord);
router.get('/records/:id/sheet', getRecordSheet);

// Phase 7: Document Ownership Verification (Faculty)
router.get('/records/:id/ownership-details', getFacultyOwnershipDetails);
router.post('/records/:id/ownership-approve', facultyApproveOwnership);
router.post('/records/:id/ownership-reject', facultyRejectOwnership);
router.post('/records/:id/ownership-retake', facultyRequestRetake);
router.post('/records/:id/writer-sample', uploadRecordImage.single('image'), addWriterSample);
router.get('/ownership-statistics', getOwnershipStatistics);

export default router;
