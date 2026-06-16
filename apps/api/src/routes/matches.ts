import { Router, Request, Response } from 'express';
import prisma from '../models/db';
import { computePrediction } from '../services/predictionEngine';
import { syncAll } from '../services/syncService';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const { league, status, date } = req.query as Record<string, string>;

    const where: Record<string, unknown> = {};
    if (league) where.leagueId = league;
    if (status) where.status = status;
    if (date) {
      const d = new Date(date);
      const next = new Date(d);
      next.setDate(next.getDate() + 1);
      where.utcDate = { gte: d, lt: next };
    }

    const matches = await prisma.match.findMany({
      where,
      include: {
        homeTeam: true,
        awayTeam: true,
        prediction: true,
      },
      orderBy: { utcDate: 'asc' },
      take: 100,
    });

    res.json(matches);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.get('/:id/prediction', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const prediction = await computePrediction(id);
    res.json(prediction);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.post('/sync', async (_req: Request, res: Response) => {
  try {
    syncAll().catch(console.error);
    res.json({ message: 'Sync started' });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
