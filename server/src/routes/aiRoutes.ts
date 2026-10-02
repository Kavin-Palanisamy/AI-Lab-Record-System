import { Router } from 'express';
import { analyzeRecord } from '../controllers/aiController.js';
import { authenticate } from '../middleware/authMiddleware.js';
import { uploadRecordImage } from '../middleware/uploadMiddleware.js';

const router = Router();

// Endpoint must require authentication
router.use(authenticate);

router.post('/analyze-record', uploadRecordImage.single('image'), analyzeRecord);

export default router;
