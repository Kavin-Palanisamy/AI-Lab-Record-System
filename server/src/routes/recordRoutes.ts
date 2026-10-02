import { Router } from 'express';
import { verifyQr } from '../controllers/recordController.js';
import { authenticate } from '../middleware/authMiddleware.js';

const router = Router();

router.use(authenticate);
router.post('/verify-qr', verifyQr);

export default router;
