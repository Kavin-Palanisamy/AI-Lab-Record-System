import dotenv from 'dotenv';
dotenv.config();

import { createApp } from './app.js';
import { db } from './prisma/db.js';

const PORT = process.env.PORT || 5000;

async function bootstrap() {
  await db.init();
  const app = createApp();

  app.listen(PORT, () => {
    console.log(`========================================================`);
    console.log(`🚀 AI Lab Record Security Server running on port ${PORT}`);
    console.log(`   Health: http://localhost:${PORT}/api/health`);
    console.log(`   API Base: http://localhost:${PORT}/api`);
    console.log(`========================================================`);
  });
}

bootstrap().catch((err) => {
  console.error('Fatal bootstrap error:', err);
  process.exit(1);
});
