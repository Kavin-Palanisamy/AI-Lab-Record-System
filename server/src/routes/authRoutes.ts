import { Router } from 'express';
import { studentLogin, facultyLogin, studentLoginSchema, facultyLoginSchema } from '../controllers/authController.js';
import { validateRequest } from '../middleware/validateRequest.js';
import { loginRateLimiter } from '../middleware/rateLimiter.js';

const router = Router();

router.post('/student/login', loginRateLimiter, validateRequest(studentLoginSchema), studentLogin);
router.post('/faculty/login', loginRateLimiter, validateRequest(facultyLoginSchema), facultyLogin);

export default router;
