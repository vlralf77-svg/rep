import { Box, Typography, Stack, LinearProgress, Divider, Chip } from '@mui/material';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import BarChartIcon from '@mui/icons-material/BarChart';
import ScaleIcon from '@mui/icons-material/Scale';
import type { Match } from '../types';
import { useStore } from '../store';
import { DEFAULT_RATING, expectedScore } from '../utils/elo';

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

function getLabels(marketType?: string): { home: string; draw: string; away: string } {
  const t = marketType || '승무패';
  if (t.includes('언더오버')) return { home: '언더', draw: '', away: '오버' };
  if (t === 'SUM') return { home: '홀', draw: '', away: '짝' };
  if (t.includes('핸디캡') || t === '승패' || t === '승1패') return { home: '승', draw: t === '승1패' ? '1' : '무', away: '패' };
  return { home: '홈승', draw: '무', away: '원정승' };
}

function lineTag(m: Match): string {
  const t = m.marketType || '';
  if (m.line == null) return '';
  if (t.includes('핸디캡')) return ` (${m.line > 0 ? '+' + m.line : m.line})`;
  return ` (${m.line})`;
}

function MarketPrediction({ match }: { match: Match }) {
  const prob = impliedProb(match.oddsHome, match.oddsDraw, match.oddsAway);
  const labels = getLabels(match.marketType);
  const hasDraw = match.oddsDraw > 0 && labels.draw;
  const t = match.marketType || '승무패';

  return (
    <Box>
      <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mb: 0.5 }}>
        <Typography variant="caption" sx={{ fontWeight: 700, fontSize: '0.6rem', color: 'text.secondary' }}>
          {t}{lineTag(match)}
        </Typography>
      </Stack>
      <ProbBar label={labels.home} value={prob.home} color="#42a5f5" />
      {hasDraw && <ProbBar label={labels.draw} value={prob.draw} color="#ffa726" />}
      <ProbBar label={labels.away} value={prob.away} color="#ef5350" />
    </Box>
  );
}

export default function MatchPrediction({ matches }: Props) {
  const eloRatings = useStore((s) => s.eloRatings);
  const main = matches.find((m) => m.marketType === '승무패' || m.marketType === '승패') || matches[0];
  if (!main) return null;

  const prob = impliedProb(main.oddsHome, main.oddsDraw, main.oddsAway);

  const homeRating = eloRatings[main.homeTeam]?.rating ?? DEFAULT_RATING;
  const awayRating = eloRatings[main.awayTeam]?.rating ?? DEFAULT_RATING;
  const homeMatches = eloRatings[main.homeTeam]?.matches ?? 0;
  const awayMatches = eloRatings[main.awayTeam]?.matches ?? 0;
  const hasEloData = homeMatches > 0 || awayMatches > 0;
  const eloDiffVal = homeRating - awayRating;
  const eloHomeWin = expectedScore(homeRating, awayRating);
  const eloAwayWin = 1 - eloHomeWin;

  const otherMarkets = matches.filter((m) => m.id !== main.id);

  let weightedHome = prob.home * 0.35;
  let weightedAway = prob.away * 0.35;
  let weightedDraw = prob.draw * 0.35;
  let totalWeight = 0.35;
  const usedMarkets: string[] = [main.marketType || '승무패'];

  for (const m of otherMarkets) {
    const mp = impliedProb(m.oddsHome, m.oddsDraw, m.oddsAway);
    const t = m.marketType || '';
    let w = 0.15;
    if (t.includes('핸디캡')) w = 0.2;
    else if (t.includes('언더오버')) w = 0.15;
    else if (t === 'SUM') w = 0.1;

    weightedHome += mp.home * w;
    weightedAway += mp.away * w;
    weightedDraw += mp.draw * w;
    totalWeight += w;
    usedMarkets.push(t);
  }

  if (hasEloData) {
    const eloW = 0.25;
    const drawFactor = Math.max(0, 0.28 - Math.abs(eloDiffVal) / 2000);
    weightedHome += (eloHomeWin - drawFactor / 2) * eloW;
    weightedAway += (eloAwayWin - drawFactor / 2) * eloW;
    weightedDraw += drawFactor * eloW;
    totalWeight += eloW;
    usedMarkets.push('엘로');
  }

  const wHome = Math.max(0, weightedHome / totalWeight);
  const wAway = Math.max(0, weightedAway / totalWeight);
  const wDraw = Math.max(0, weightedDraw / totalWeight);
  const wTotal = wHome + wDraw + wAway || 1;

  const mainLabels = getLabels(main.marketType);
  const hasDraw = main.oddsDraw > 0 && mainLabels.draw;

  return (
    <Box sx={{ mt: 1.5, p: 1.5, bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 2, border: '1px solid rgba(255,255,255,0.06)' }}>
      <Typography variant="caption" sx={{ fontWeight: 700, fontSize: '0.7rem', mb: 1.5, display: 'block', color: 'primary.light' }}>
        승부 예측
      </Typography>

      <Stack spacing={1.5}>
        {/* AI 예측 — 마켓별 */}
        <Box>
          <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mb: 0.8 }}>
            <SmartToyIcon sx={{ fontSize: 14, color: '#ab47bc' }} />
            <Typography variant="caption" sx={{ fontWeight: 700, fontSize: '0.65rem' }}>
              AI 마켓별 예측
            </Typography>
            <Chip label={`${matches.length}마켓`} size="small" sx={{ height: 16, fontSize: '0.55rem', bgcolor: 'rgba(171,71,188,0.15)', color: '#ce93d8' }} />
          </Stack>
          <Stack spacing={1}>
            {matches.map((m) => (
              <MarketPrediction key={m.id} match={m} />
            ))}
          </Stack>
        </Box>

        <Divider sx={{ borderColor: 'rgba(255,255,255,0.06)' }} />

        {/* 실제 엘로 레이팅 */}
        <Box>
          <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mb: 0.8 }}>
            <BarChartIcon sx={{ fontSize: 14, color: '#66bb6a' }} />
            <Typography variant="caption" sx={{ fontWeight: 700, fontSize: '0.65rem' }}>
              엘로 레이팅
            </Typography>
            {hasEloData ? (
              <Chip label="실전 데이터" size="small" sx={{ height: 16, fontSize: '0.5rem', bgcolor: 'rgba(102,187,106,0.15)', color: '#81c784' }} />
            ) : (
              <Chip label="기본값" size="small" sx={{ height: 16, fontSize: '0.5rem', bgcolor: 'rgba(255,255,255,0.08)', color: 'text.secondary' }} />
            )}
          </Stack>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Box sx={{ textAlign: 'center', flex: 1 }}>
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.6rem', display: 'block' }}>
                {main.homeTeam}
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 700, color: homeRating > awayRating ? '#42a5f5' : 'text.secondary' }}>
                {homeRating}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.5rem' }}>
                {homeMatches}전
              </Typography>
            </Box>
            <Box sx={{ textAlign: 'center', px: 1 }}>
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.55rem', display: 'block' }}>
                레이팅 차
              </Typography>
              <Chip
                label={`${eloDiffVal > 0 ? '+' : ''}${eloDiffVal}`}
                size="small"
                color={eloDiffVal > 50 ? 'primary' : eloDiffVal < -50 ? 'error' : 'default'}
                sx={{ height: 20, fontSize: '0.7rem', fontWeight: 700 }}
              />
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.5rem', display: 'block', mt: 0.3 }}>
                승률 {Math.round(eloHomeWin * 100)}:{Math.round(eloAwayWin * 100)}
              </Typography>
            </Box>
            <Box sx={{ textAlign: 'center', flex: 1 }}>
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.6rem', display: 'block' }}>
                {main.awayTeam}
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 700, color: awayRating > homeRating ? '#ef5350' : 'text.secondary' }}>
                {awayRating}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.5rem' }}>
                {awayMatches}전
              </Typography>
            </Box>
          </Stack>
        </Box>

        <Divider sx={{ borderColor: 'rgba(255,255,255,0.06)' }} />

        {/* 가중치 스코어링 */}
        <Box>
          <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mb: 0.8 }}>
            <ScaleIcon sx={{ fontSize: 14, color: '#ffa726' }} />
            <Typography variant="caption" sx={{ fontWeight: 700, fontSize: '0.65rem' }}>
              가중치 스코어링
            </Typography>
          </Stack>
          <ProbBar label={mainLabels.home} value={wHome / wTotal} color="#42a5f5" />
          {hasDraw && <ProbBar label={mainLabels.draw} value={wDraw / wTotal} color="#ffa726" />}
          <ProbBar label={mainLabels.away} value={wAway / wTotal} color="#ef5350" />
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.5rem', mt: 0.5, display: 'block' }}>
            {usedMarkets.join(' + ')} 종합 분석
          </Typography>
        </Box>
      </Stack>
    </Box>
  );
}
