import { useState } from 'react';
import {
  Box, Typography, Card, CardActionArea, CardContent, Chip,
  CircularProgress, Alert, Dialog, DialogTitle, DialogContent,
  Divider, LinearProgress, Stack,
} from '@mui/material';
import { useBetmanData } from '../api/hooks';
import { BetmanGame } from '../lib/api';
import { predict } from '../lib/predict';

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

function ProbBar({ label, prob, color }: { label: string; prob: number; color: string }) {
  return (
    <Box mb={1.5}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
        <Typography variant="body2">{label}</Typography>
        <Typography variant="body2" fontWeight={700}>{(prob * 100).toFixed(1)}%</Typography>
      </Box>
      <LinearProgress variant="determinate" value={prob * 100}
        sx={{ height: 8, borderRadius: 4, bgcolor: 'rgba(255,255,255,0.08)',
          '& .MuiLinearProgress-bar': { bgcolor: color } }} />
    </Box>
  );
}

function impliedProbs(homeWin: number, draw: number, awayWin: number) {
  const rH = homeWin > 0 ? 1 / homeWin : 0;
  const rD = draw > 0 ? 1 / draw : 0;
  const rA = awayWin > 0 ? 1 / awayWin : 0;
  const total = rH + rD + rA || 1;
  return { pH: rH / total, pD: rD / total, pA: rA / total, margin: (total - 1) * 100 };
}

function eloProbs(homeWin: number, awayWin: number, hasDraw: boolean) {
  // Derive implied ELO difference from odds, then run predict()
  const isBaseball = !hasDraw;
  const leagueAvg = isBaseball ? 4.5 : 1.35;
  // Use neutral stats but bias ELO by odds ratio
  const oddsRatio = awayWin > 0 ? homeWin / awayWin : 1;
  const eloH = 1500 + Math.log(oddsRatio) * 150; // rough mapping
  const eloA = 1500;
  const homeStats = { avgScored: leagueAvg, avgConceded: leagueAvg, elo: eloH, form: [] };
  const awayStats = { avgScored: leagueAvg, avgConceded: leagueAvg, elo: eloA, form: [] };
  return predict(homeStats, awayStats, isBaseball);
}

function GameDetail({ game, open, onClose }: { game: BetmanGame; open: boolean; onClose: () => void }) {
  const { homeWin, draw, awayWin } = game.odds;
  const hasDraw = draw > 0;
  const vals = [homeWin, hasDraw ? draw : 0, awayWin].filter(v => v > 0);
  const max = vals.length ? Math.max(...vals) : 0;

  const { pH, pD, pA, margin } = impliedProbs(homeWin, draw, awayWin);
  const aiPred = eloProbs(homeWin, awayWin, hasDraw);

  const gameDateTime = game.gameDate
    ? new Date(game.gameDate).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', weekday: 'short' })
    : '';

  const marketWinner = pH > pA && pH > (hasDraw ? pD : 0) ? game.homeTeam
    : pA > pH && pA > (hasDraw ? pD : 0) ? game.awayTeam
    : '무승부';
  const aiWinner = aiPred.homeWinProbability > aiPred.awayWinProbability
    && aiPred.homeWinProbability > (hasDraw ? aiPred.drawProbability : 0)
    ? game.homeTeam
    : aiPred.awayWinProbability > aiPred.homeWinProbability
    && aiPred.awayWinProbability > (hasDraw ? aiPred.drawProbability : 0)
    ? game.awayTeam
    : '무승부';

  const agree = marketWinner === aiWinner;

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm"
      PaperProps={{ sx: { bgcolor: '#1a1a2e', borderRadius: 3 } }}>
      <DialogTitle sx={{ pb: 0.5 }}>
        <Box sx={{ display: 'flex', gap: 1, mb: 0.5, flexWrap: 'wrap' }}>
          <Chip label={game.betType || game.league} size="small" color="primary" variant="outlined" />
          {game.sport && <Chip label={game.sport} size="small" variant="outlined" />}
          {gameDateTime && <Chip label={gameDateTime} size="small" variant="outlined" />}
        </Box>
        <Typography variant="h6" fontWeight={700}>{game.homeTeam} vs {game.awayTeam}</Typography>
      </DialogTitle>
      <DialogContent>
        {/* 배당률 */}
        <Typography variant="subtitle2" color="text.secondary" mt={1} mb={1}>배당률</Typography>
        <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
          <OddsBox label="홈승" value={homeWin} best={homeWin === max} />
          {hasDraw && <OddsBox label="무" value={draw} best={draw === max} />}
          <OddsBox label="원정승" value={awayWin} best={awayWin === max} />
        </Box>
        <Typography variant="caption" color="text.secondary">
          북메이커 마진: {margin.toFixed(1)}%
        </Typography>

        <Divider sx={{ my: 2 }} />

        {/* 두 예측 비교 */}
        <Stack direction="row" spacing={1} mb={2}>
          <Box flex={1} sx={{ bgcolor: 'rgba(79,195,247,0.06)', borderRadius: 2, p: 1.5 }}>
            <Typography variant="caption" color="primary.main" fontWeight={700}>📊 시장 예측</Typography>
            <Typography variant="body2" mt={0.5}>(배당률 역산)</Typography>
            <Typography variant="h6" fontWeight={700} mt={0.5}>{marketWinner}</Typography>
            <Typography variant="caption">{(Math.max(pH, pA, hasDraw ? pD : 0) * 100).toFixed(1)}% 확률</Typography>
          </Box>
          <Box flex={1} sx={{ bgcolor: 'rgba(124,77,255,0.08)', borderRadius: 2, p: 1.5 }}>
            <Typography variant="caption" color="secondary.main" fontWeight={700}>🤖 AI 예측</Typography>
            <Typography variant="body2" mt={0.5}>(ELO 모델)</Typography>
            <Typography variant="h6" fontWeight={700} mt={0.5}>{aiWinner}</Typography>
            <Typography variant="caption">{(Math.max(aiPred.homeWinProbability, aiPred.awayWinProbability, hasDraw ? aiPred.drawProbability : 0) * 100).toFixed(1)}% 확률</Typography>
          </Box>
        </Stack>

        <Box sx={{ bgcolor: agree ? 'rgba(102,187,106,0.1)' : 'rgba(255,167,38,0.1)', borderRadius: 2, p: 1.5, mb: 2 }}>
          <Typography variant="body2" fontWeight={700}>
            {agree ? '✅ 시장·AI 일치 — ' + marketWinner + ' 우세' : '⚠️ 시장·AI 불일치 — 높은 불확실성'}
          </Typography>
        </Box>

        <Divider sx={{ mb: 2 }} />
        <Typography variant="subtitle2" color="text.secondary" mb={1.5}>확률 상세 비교</Typography>

        <Box mb={1}>
          <Typography variant="caption" color="primary.main">시장 예측</Typography>
        </Box>
        <ProbBar label={`${game.homeTeam} 승`} prob={pH} color="#4fc3f7" />
        {hasDraw && <ProbBar label="무승부" prob={pD} color="#78909c" />}
        <ProbBar label={`${game.awayTeam} 승`} prob={pA} color="#f48fb1" />

        <Box mt={1.5} mb={1}>
          <Typography variant="caption" color="secondary.main">AI 예측 (ELO 기반)</Typography>
        </Box>
        <ProbBar label={`${game.homeTeam} 승`} prob={aiPred.homeWinProbability} color="#ce93d8" />
        {hasDraw && <ProbBar label="무승부" prob={aiPred.drawProbability} color="#78909c" />}
        <ProbBar label={`${game.awayTeam} 승`} prob={aiPred.awayWinProbability} color="#ef9a9a" />
      </DialogContent>
    </Dialog>
  );
}

function GameRow({ game }: { game: BetmanGame }) {
  const [open, setOpen] = useState(false);
  const { homeWin, draw, awayWin } = game.odds;
  const vals = [homeWin, draw, awayWin].filter(v => v > 0);
  const max = vals.length > 0 ? Math.max(...vals) : 0;
  const gameDateTime = game.gameDate
    ? new Date(game.gameDate).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '';

  return (
    <>
      <Card sx={{ mb: 1.5 }}>
        <CardActionArea onClick={() => setOpen(true)}>
          <CardContent sx={{ pb: '12px !important' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5, alignItems: 'center' }}>
              <Typography variant="caption" color="text.secondary">
                {game.betType || game.league}{gameDateTime ? ' · ' + gameDateTime : ''}
              </Typography>
              <Chip label={game.sport || game.status} size="small" sx={{ fontSize: 10, height: 18 }} />
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
  if (error) return <Alert severity="warning">배트맨 데이터를 불러올 수 없습니다.</Alert>;
  if (!data) return null;

  const games = type === 'toto' ? data.toto : data.proto;
  const updatedAt = data.updatedAt ? new Date(data.updatedAt).toLocaleString('ko-KR') : '';

  // Deduplicate by homeTeam+awayTeam+betType
  const seen = new Set<string>();
  const unique = games.filter(g => {
    const key = `${g.homeTeam}|${g.awayTeam}|${g.betType || ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Sort by gameDate
  unique.sort((a, b) => (a.gameDate || '').localeCompare(b.gameDate || ''));

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="subtitle2" color="text.secondary">
          {type === 'toto' ? '스포츠토토 승무패' : '프로토 승부식'}
        </Typography>
        {updatedAt && <Typography variant="caption" color="text.secondary">갱신: {updatedAt}</Typography>}
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
