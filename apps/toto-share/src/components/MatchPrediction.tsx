import { Box, Typography, Stack, LinearProgress, Divider, Chip } from '@mui/material';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import BarChartIcon from '@mui/icons-material/BarChart';
import ScaleIcon from '@mui/icons-material/Scale';
import type { Match } from '../types';

interface Props {
  matches: Match[];
}

function impliedProb(oddsH: number, oddsD: number, oddsA: number) {
  const rawH = 1 / oddsH;
  const rawD = oddsD > 0 ? 1 / oddsD : 0;
  const rawA = 1 / oddsA;
  const total = rawH + rawD + rawA;
  return {
    home: rawH / total,
    draw: rawD / total,
    away: rawA / total,
  };
}

function eloDiff(prob: number): number {
  if (prob <= 0 || prob >= 1) return 0;
  return -400 * Math.log10(1 / prob - 1);
}

function ProbBar({ label, value, color }: { label: string; value: number; color: string }) {
  const pct = Math.round(value * 100);
  return (
    <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
      <Typography variant="caption" sx={{ minWidth: 36, fontWeight: 600, fontSize: '0.65rem' }}>
        {label}
      </Typography>
      <Box sx={{ flex: 1 }}>
        <LinearProgress
          variant="determinate"
          value={pct}
          sx={{
            height: 8,
            borderRadius: 4,
            bgcolor: 'rgba(255,255,255,0.08)',
            '& .MuiLinearProgress-bar': { bgcolor: color, borderRadius: 4 },
          }}
        />
      </Box>
      <Typography variant="caption" sx={{ minWidth: 32, textAlign: 'right', fontWeight: 700, fontSize: '0.7rem', color }}>
        {pct}%
      </Typography>
    </Stack>
  );
}

export default function MatchPrediction({ matches }: Props) {
  const main = matches.find((m) => m.marketType === '승무패' || m.marketType === '승패') || matches[0];
  if (!main) return null;

  const hasDraw = main.oddsDraw > 0;
  const prob = impliedProb(main.oddsHome, main.oddsDraw, main.oddsAway);

  const hdcpMatch = matches.find((m) => m.marketType?.includes('핸디캡'));
  const uoMatch = matches.find((m) => m.marketType?.includes('언더오버'));

  const homeElo = eloDiff(prob.home);
  const awayElo = eloDiff(prob.away);
  const eloDiffVal = Math.round(homeElo - awayElo);

  let weightedHome = prob.home * 0.5;
  let weightedAway = prob.away * 0.5;
  let weightedDraw = prob.draw * 0.5;
  let totalWeight = 0.5;

  if (hdcpMatch) {
    const hp = impliedProb(hdcpMatch.oddsHome, hdcpMatch.oddsDraw, hdcpMatch.oddsAway);
    weightedHome += hp.home * 0.3;
    weightedAway += hp.away * 0.3;
    weightedDraw += hp.draw * 0.3;
    totalWeight += 0.3;
  }
  if (uoMatch) {
    const up = impliedProb(uoMatch.oddsHome, 0, uoMatch.oddsAway);
    const attackBonus = up.away > 0.55 ? 0.03 : up.home > 0.55 ? -0.02 : 0;
    weightedHome += attackBonus;
    totalWeight += 0.2;
  }
  const wHome = Math.max(0, weightedHome / totalWeight);
  const wAway = Math.max(0, weightedAway / totalWeight);
  const wDraw = Math.max(0, weightedDraw / totalWeight);
  const wTotal = wHome + wDraw + wAway || 1;

  const homeLabel = '홈승';
  const awayLabel = '원정승';

  return (
    <Box sx={{ mt: 1.5, p: 1.5, bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 2, border: '1px solid rgba(255,255,255,0.06)' }}>
      <Typography variant="caption" sx={{ fontWeight: 700, fontSize: '0.7rem', mb: 1.5, display: 'block', color: 'primary.light' }}>
        승부 예측
      </Typography>

      <Stack spacing={1.5}>
        <Box>
          <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mb: 0.8 }}>
            <SmartToyIcon sx={{ fontSize: 14, color: '#ab47bc' }} />
            <Typography variant="caption" sx={{ fontWeight: 700, fontSize: '0.65rem' }}>
              AI 예측
            </Typography>
            <Chip label="배당 역산" size="small" sx={{ height: 16, fontSize: '0.55rem', bgcolor: 'rgba(171,71,188,0.15)', color: '#ce93d8' }} />
          </Stack>
          <ProbBar label={homeLabel} value={prob.home} color="#42a5f5" />
          {hasDraw && <ProbBar label="무승부" value={prob.draw} color="#ffa726" />}
          <ProbBar label={awayLabel} value={prob.away} color="#ef5350" />
        </Box>

        <Divider sx={{ borderColor: 'rgba(255,255,255,0.06)' }} />

        <Box>
          <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mb: 0.8 }}>
            <BarChartIcon sx={{ fontSize: 14, color: '#66bb6a' }} />
            <Typography variant="caption" sx={{ fontWeight: 700, fontSize: '0.65rem' }}>
              엘로 레이팅
            </Typography>
          </Stack>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Box sx={{ textAlign: 'center', flex: 1 }}>
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.6rem', display: 'block' }}>
                {main.homeTeam}
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 700, color: homeElo > 0 ? '#42a5f5' : 'text.secondary' }}>
                {homeElo > 0 ? '+' : ''}{Math.round(homeElo)}
              </Typography>
            </Box>
            <Box sx={{ textAlign: 'center', px: 1 }}>
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.55rem', display: 'block' }}>
                레이팅 차
              </Typography>
              <Chip
                label={`${eloDiffVal > 0 ? '+' : ''}${eloDiffVal}`}
                size="small"
                color={eloDiffVal > 30 ? 'primary' : eloDiffVal < -30 ? 'error' : 'default'}
                sx={{ height: 20, fontSize: '0.7rem', fontWeight: 700 }}
              />
            </Box>
            <Box sx={{ textAlign: 'center', flex: 1 }}>
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.6rem', display: 'block' }}>
                {main.awayTeam}
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 700, color: awayElo > 0 ? '#ef5350' : 'text.secondary' }}>
                {awayElo > 0 ? '+' : ''}{Math.round(awayElo)}
              </Typography>
            </Box>
          </Stack>
        </Box>

        <Divider sx={{ borderColor: 'rgba(255,255,255,0.06)' }} />

        <Box>
          <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mb: 0.8 }}>
            <ScaleIcon sx={{ fontSize: 14, color: '#ffa726' }} />
            <Typography variant="caption" sx={{ fontWeight: 700, fontSize: '0.65rem' }}>
              가중치 스코어링
            </Typography>
            {hdcpMatch && <Chip label="핸디" size="small" sx={{ height: 14, fontSize: '0.5rem', bgcolor: 'rgba(255,167,38,0.15)', color: '#ffb74d' }} />}
            {uoMatch && <Chip label="언오" size="small" sx={{ height: 14, fontSize: '0.5rem', bgcolor: 'rgba(255,167,38,0.15)', color: '#ffb74d' }} />}
          </Stack>
          <ProbBar label={homeLabel} value={wHome / wTotal} color="#42a5f5" />
          {hasDraw && <ProbBar label="무승부" value={wDraw / wTotal} color="#ffa726" />}
          <ProbBar label={awayLabel} value={wAway / wTotal} color="#ef5350" />
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.5rem', mt: 0.5, display: 'block' }}>
            정배당{hdcpMatch ? ' + 핸디캡' : ''}{uoMatch ? ' + 언더오버' : ''} 종합 분석
          </Typography>
        </Box>
      </Stack>
    </Box>
  );
}
