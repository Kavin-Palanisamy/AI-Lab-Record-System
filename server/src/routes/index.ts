import { Router } from 'express';
import authRoutes from './authRoutes.js';
import studentRoutes from './studentRoutes.js';
import facultyRoutes from './facultyRoutes.js';
import recordRoutes from './recordRoutes.js';
import aiRoutes from './aiRoutes.js';

const apiRouter = Router();

apiRouter.use('/auth', authRoutes);
apiRouter.use('/student', studentRoutes);
apiRouter.use('/faculty', facultyRoutes);
apiRouter.use('/records', recordRoutes);
apiRouter.use('/ai', aiRoutes);

export default apiRouter;
