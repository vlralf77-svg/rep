import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cron from 'node-cron';
import matchesRouter from './routes/matches';
import { syncAll } from './services/syncService';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => res.json({ ok: true }));
app.use('/api/matches', matchesRouter);
app.post('/api/sync', async (_req, res) => {
  syncAll().catch(console.error);
  res.json({ message: 'Sync started' });
});

cron.schedule('0 6 * * *', () => {
  console.log('Running daily sync...');
  syncAll().catch(console.error);
});

app.listen(PORT, () => {
  console.log(`API server running on http://localhost:${PORT}`);
});
