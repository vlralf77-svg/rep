import { useState } from 'react';
import {
  Box, Typography, Card, CardActionArea, CardContent, Chip,
  CircularProgress, Alert, Dialog, DialogTitle, DialogContent,
  Divider, LinearProgress,
} from '@mui/material';
import { useBetmanData } from '../api/hooks';
import { BetmanGame } from '../lib/api';

function OddsBox({ label, value, best }: { label: string; value: number; best: boolean }) {
  return (
    <Box sx={{
      flex: 1, textAlign: 'center', p: 1, borderRadius: 1.5,
      border: best ? '2px solid' : '1px solid',
      borderColor: best ? 'primary.main' : 'rgba(255,255,255,0.1)',
      bgcolor: best ? 'rgba(79,195,247,0.1)' : 'rgba(255,255,255,0.03)',
    }}>
      <Typography variant="caption" color="text.secondary" display="block">{label}</Typography>
      <Typography variant="h6" fontWeight={700} color={best ? 'primary.main' : 'text.primary'} fontSize={15}>
        {value > 0 ? value.toFixed(2) : '-'}
      </Typography>
    </Box>
  );
}

function oddsToProb(odds: number) {
  return odds > 0 ? 1 / odds : 0;
}

function GameDetail({ game, open, onClose }: { game: BetmanGame; open: boolean; onClose: () => void }) {
  const { homeWin, draw, awayWin } = game.odds;
  const rawProbs = [oddsToProb(homeWin), oddsToProb(draw), oddsToProb(awayWin)];
  const total = rawProbs.reduce((a, b) => a + b, 0) || 1;
  const [pH, pD, pA] = rawProbs.map(p => p / total);

  const hasDraw = draw > 0;
  const vals = [homeWin, hasDraw ? draw : 0, awayWin].filter(v => v > 0);
  const max = vals.length ? Math.max(...vals) : 0;

  const winnerLabel = pH > pA && pH > (hasDraw ? pD : 0) ? game.homeTeam
    : pA > pH && pA > (hasDraw ? pD : 0) ? game.awayTeam
    : '무승부';
  const winnerProb = Math.max(pH, pA, hasDraw ? pD : 0);

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm"
      PaperProps={{ sx: { bgcolor: '#1a1a2e', borderRadius: 3 } }}>
      <DialogTitle sx={{ pb: 1 }}>
        <Typography variant="subtitle2" color="text.secondary">{game.league}</Typography>
        <Typography variant="h6" fontWeight={700}>{game.homeTeam} vs {game.awayTeam}</Typography>
      </DialogTitle>
      <DialogContent>
        <Typography variant="subtitle2" color="text.secondary" mb={1}>배당률</Typography>
        <Box sx={{ display: 'flex', gap: 1, mb: 3 }}>
          <OddsBox label="홈승" value={homeWin} best={homeWin === max} />
          {hasDraw && <OddsBox label="무" value={draw} best={draw === max} />}
          <OddsBox label="원정승" value={awayWin} best={awayWin === max} />
        </Box>

        <Divider sx={{ mb: 2 }} />
        <Typography variant="subtitle2" color="text.secondary" mb={1.5}>배당률 기반 확률 분석</Typography>

        {([
          { label: `${game.homeTeam} 승`, prob: pH },
          ...(hasDraw ? [{ label: '무승부', prob: pD }] : []),
          { label: `${game.awayTeam} 승`, prob: pA },
        ] as { label: string; prob: number }[]).map(({ label, prob }) => (
          <Box key={label} mb={1.5}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
              <Typography variant="body2">{label}</Typography>
              <Typography variant="body2" fontWeight={700}>{(prob * 100).toFixed(1)}%</Typography>
            </Box>
            <LinearProgress variant="determinate" value={prob * 100}
              sx={{ height: 8, borderRadius: 4,
                '& .MuiLinearProgress-bar': { bgcolor: label.includes(game.homeTeam) ? 'primary.main' : label === '무승부' ? 'grey.500' : 'error.main' }
              }} />
          </Box>
        ))}

        <Divider sx={{ mt: 2, mb: 2 }} />
        <Box sx={{ bgcolor: 'rgba(79,195,247,0.08)', borderRadius: 2, p: 1.5 }}>
          <Typography variant="caption" color="text.secondary">예상 결과</Typography>
          <Typography variant="body1" fontWeight={700}>
            {winnerLabel} — {(winnerProb * 100).toFixed(1)}% 확률
          </Typography>
          <Typography variant="caption" color="text.secondary">
            * 배당률 기반 시장 내재 확률 (마진 제거 후)
          </Typography>
        </Box>
      </DialogContent>
    </Dialog>
  );
}

function GameRow({ game }: { game: BetmanGame }) {
  const [open, setOpen] = useState(false);
  const { homeWin, draw, awayWin } = game.odds;
  const vals = [homeWin, draw, awayWin].filter(v => v > 0);
  const max = vals.length > 0 ? Math.max(...vals) : 0;

  return (
    <>
      <Card sx={{ mb: 1.5 }}>
        <CardActionArea onClick={() => setOpen(true)}>
          <CardContent sx={{ pb: '12px !important' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
              <Typography variant="caption" color="text.secondary">{game.league}</Typography>
              {game.status && <Chip label={game.status} size="small" sx={{ fontSize: 10, height: 18 }} />}
            </Box>
            <Typography variant="body2" fontWeight={600} textAlign="center" mb={1}>
              {game.homeTeam} vs {game.awayTeam}
            </Typography>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <OddsBox label="홈승" value={homeWin} best={homeWin === max} />
              {draw > 0 && <OddsBox label="무" value={draw} best={draw === max} />}
              <OddsBox label="원정승" value={awayWin} best={awayWin === max} />
            </Box>
          </CardContent>
        </CardActionArea>
      </Card>
      <GameDetail game={game} open={open} onClose={() => setOpen(false)} />
    </>
  );
}

export default function BetmanGames({ type }: { type: 'toto' | 'proto' }) {
  const { data, isLoading, error } = useBetmanData();

  if (isLoading) return <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>;
  if (error) return <Alert severity="warning">배트맨 데이터를 불러올 수 없습니다. (GitHub Actions 스케줄 수집 필요)</Alert>;
  if (!data) return null;

  const games = type === 'toto' ? data.toto : data.proto;
  const updatedAt = data.updatedAt ? new Date(data.updatedAt).toLocaleString('ko-KR') : '';

  // Deduplicate: keep only the first entry per homeTeam+awayTeam pair
  const seen = new Set<string>();
  const unique = games.filter(g => {
    const key = `${g.homeTeam}|${g.awayTeam}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="subtitle2" color="text.secondary">
          {type === 'toto' ? '스포츠토토 승무패' : '프로토 승부식'}
        </Typography>
        {updatedAt && (
          <Typography variant="caption" color="text.secondary">갱신: {updatedAt}</Typography>
        )}
      </Box>

      {data.error && <Alert severity="warning" sx={{ mb: 2 }}>스크래핑 오류: {data.error}</Alert>}

      {unique.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 4 }}>
          <Typography color="text.secondary">데이터가 없습니다.</Typography>
          <Typography variant="caption" color="text.secondary" display="block" mt={1}>
            GitHub Actions → Scrape Betman 워크플로우를 수동으로 실행해주세요.
          </Typography>
        </Box>
      ) : (
        unique.map((g, i) => <GameRow key={g.gameId || i} game={g} />)
      )}
    </Box>
  );
}
