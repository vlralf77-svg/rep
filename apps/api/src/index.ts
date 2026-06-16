import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cron from 'node-cron';
import matchesRouter from './routes/matches';
import { syncAll } from './services/syncService';
import prisma from './models/db';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));

app.use(express.json());

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API routes
app.use('/api/matches', matchesRouter);

// Schedule sync every 6 hours
cron.schedule('0 */6 * * *', async () => {
  console.log('Running scheduled sync...');
  await syncAll();
});

async function bootstrap() {
  try {
    await prisma.$connect();
    console.log('Database connected');

    app.listen(PORT, () => {
      console.log(`API server running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

bootstrap();
