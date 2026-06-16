import { Router, Request, Response } from 'express';
import prisma from '../models/db';
import { generatePrediction } from '../services/predictionEngine';
import { syncAll } from '../services/syncService';
import { syncKBO } from '../services/kboSyncService';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const { league, status, dateFrom, dateTo, sport, limit = '20', offset = '0' } = req.query;

    const where: Record<string, unknown> = {};

    if (sport) where.sport = sport as string;
    if (league) where.competitionCode = league as string;
    if (status) where.status = status as string;

    if (dateFrom || dateTo) {
      where.utcDate = {};
      if (dateFrom) (where.utcDate as Record<string, unknown>).gte = new Date(dateFrom as string);
      if (dateTo) (where.utcDate as Record<string, unknown>).lte = new Date(dateTo as string);
    }

    const matches = await prisma.match.findMany({
      where,
      include: { homeTeam: true, awayTeam: true },
      orderBy: { utcDate: 'asc' },
      take: parseInt(limit as string),
      skip: parseInt(offset as string),
    });

    const total = await prisma.match.count({ where });

    res.json({ matches, total, limit: parseInt(limit as string), offset: parseInt(offset as string) });
  } catch (error) {
    console.error('Error fetching matches:', error);
    res.status(500).json({ error: 'Failed to fetch matches' });
  }
});

router.get('/:id/prediction', async (req: Request, res: Response) => {
  try {
    const matchId = parseInt(req.params.id);
    if (isNaN(matchId)) return res.status(400).json({ error: 'Invalid match ID' });

    const match = await prisma.match.findUnique({
      where: { id: matchId },
      include: { homeTeam: true, awayTeam: true },
    });
    if (!match) return res.status(404).json({ error: 'Match not found' });

    const prediction = await generatePrediction(matchId);

    const h2h = await prisma.h2H.findFirst({
      where: {
        OR: [
          { homeTeamId: match.homeTeamId, awayTeamId: match.awayTeamId },
          { homeTeamId: match.awayTeamId, awayTeamId: match.homeTeamId },
        ],
      },
    });

    const getForm = async (teamId: number) => {
      const recent = await prisma.match.findMany({
        where: { OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }], status: 'FINISHED' },
        orderBy: { utcDate: 'desc' },
        take: 5,
      });
      return recent.map(m => {
        if (!m.winner) return 'D';
        if (m.winner === 'HOME_TEAM') return m.homeTeamId === teamId ? 'W' : 'L';
        if (m.winner === 'AWAY_TEAM') return m.awayTeamId === teamId ? 'W' : 'L';
        return 'D';
      });
    };

    const [homeForm, awayForm] = await Promise.all([getForm(match.homeTeamId), getForm(match.awayTeamId)]);

    res.json({
      match,
      prediction,
      h2h: h2h || { homeTeamId: match.homeTeamId, awayTeamId: match.awayTeamId, homeWins: 0, draws: 0, awayWins: 0, homeGoals: 0, awayGoals: 0, totalMatches: 0 },
      homeTeamForm: homeForm,
      awayTeamForm: awayForm,
    });
  } catch (error) {
    console.error('Error fetching prediction:', error);
    res.status(500).json({ error: 'Failed to generate prediction' });
  }
});

router.post('/sync', async (req: Request, res: Response) => {
  try {
    const { sport } = req.query;

    if (sport === 'baseball') {
      // baseball은 응답을 기다림 (빠른 편)
      const result = await syncKBO();
      res.json({ message: 'KBO sync completed', ...result });
    } else if (sport === 'football') {
      res.json({ message: 'Football sync started', status: 'running' });
      syncAll().then(r => console.log('Football sync done:', r)).catch(console.error);
    } else {
      res.json({ message: 'Full sync started', status: 'running' });
      Promise.all([syncAll(), syncKBO()])
        .then(([f, k]) => console.log('All sync done:', f, k))
        .catch(console.error);
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to start sync' });
  }
});

export default router;
