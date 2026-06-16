import { Card, CardActionArea, CardContent, Box, Typography, Chip, Avatar } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { AppMatch, getPrediction } from '../lib/api';

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function statusLabel(s: string) {
  const map: Record<string, string> = { SCHEDULED: '예정', FINISHED: '종료', LIVE: 'LIVE', IN_PLAY: 'LIVE', POSTPONED: '연기', TIMED: '예정' };
  return map[s] || s;
}

export default function MatchCard({ match }: { match: AppMatch }) {
  const navigate = useNavigate();
  const pred = getPrediction(match.id)?.prediction;
  const isBaseball = match.sport === 'baseball';

  let badge: { label: string; prob: number } | null = null;
  if (pred) {
    const opts = isBaseball
      ? [{ l: '홈승', p: pred.homeWinProbability }, { l: '원정승', p: pred.awayWinProbability }]
      : [{ l: '홈승', p: pred.homeWinProbability }, { l: '무', p: pred.drawProbability }, { l: '원정승', p: pred.awayWinProbability }];
    const best = opts.reduce((a, b) => (b.p > a.p ? b : a));
    badge = { label: best.l, prob: best.p };
  }
  const conf = badge ? (badge.prob >= 0.55 ? 'success' : badge.prob >= 0.42 ? 'warning' : 'default') : 'default';

  return (
    <Card sx={{ mb: 1 }}>
      <CardActionArea onClick={() => navigate(`/match/${match.id}`)}>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
            <Typography variant="caption" color="text.secondary">{match.leagueName} · {formatDate(match.utcDate)}</Typography>
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              {badge && (
                <Chip label={`${badge.label} ${(badge.prob * 100).toFixed(0)}%`} size="small" color={conf as any} variant="outlined" />
              )}
              <Chip label={statusLabel(match.status)} size="small" sx={{ fontSize: 11 }} />
            </Box>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1 }}>
              {match.homeTeam.crest && <Avatar src={match.homeTeam.crest} sx={{ width: 28, height: 28 }} />}
              <Typography fontWeight={600} noWrap>{match.homeTeam.shortName}</Typography>
            </Box>
            <Box sx={{ textAlign: 'center', px: 2, minWidth: 56 }}>
              {match.status === 'FINISHED' && match.homeScore !== null ? (
                <Typography variant="h6" fontWeight={700}>{match.homeScore} - {match.awayScore}</Typography>
              ) : (
                <Typography variant="body2" color="text.secondary">vs</Typography>
              )}
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1, justifyContent: 'flex-end' }}>
              <Typography fontWeight={600} noWrap>{match.awayTeam.shortName}</Typography>
              {match.awayTeam.crest && <Avatar src={match.awayTeam.crest} sx={{ width: 28, height: 28 }} />}
            </Box>
          </Box>
        </CardContent>
      </CardActionArea>
    </Card>
  );
}
