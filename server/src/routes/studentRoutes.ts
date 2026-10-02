import { Router } from 'express';
import {
  getStudentProfile,
  getExperiments,
  getStudentRecords,
  getRecordQrDetails,
  submitStudentRecord,
  createCaptureChallenge,
} from '../controllers/studentController.js';
import {
  analyzeDocumentOwnership,
  analyzeExperimentSubmission,
  finalizeExperimentSubmission,
} from '../controllers/ownershipController.js';
import { authenticate, requireRole } from '../middleware/authMiddleware.js';
import { uploadRecordImage } from '../middleware/uploadMiddleware.js';
import { submissionRateLimiter } from '../middleware/rateLimiter.js';

const router = Router();

// Protect all student routes with authentication and STUDENT role
router.use(authenticate, requireRole(['STUDENT']));

router.get('/me', getStudentProfile);
router.get('/experiments', getExperiments);
router.get('/records', getStudentRecords);

// Phase 9 Real-World Redesign: Direct 2-image submission by experimentId (NO QR required)
router.post('/experiments/:experimentId/analyze', submissionRateLimiter, uploadRecordImage.fields([{ name: 'image1', maxCount: 1 }, { name: 'image2', maxCount: 1 }]), analyzeExperimentSubmission);
router.post('/experiments/:experimentId/submit', submissionRateLimiter, finalizeExperimentSubmission);

// Legacy record-level two-image ownership analysis route (maintained for backward compatibility)
router.post('/records/:recordId/ownership-analysis', submissionRateLimiter, uploadRecordImage.fields([{ name: 'image1', maxCount: 1 }, { name: 'image2', maxCount: 1 }]), analyzeDocumentOwnership);

// Legacy single-image QR routes (deprecated in active workflow)
router.get('/records/:recordId/qr', getRecordQrDetails);
router.post('/records/:recordId/challenge', submissionRateLimiter, createCaptureChallenge);
router.post('/records/:recordId/submit', submissionRateLimiter, uploadRecordImage.single('image'), submitStudentRecord);

export default router;
