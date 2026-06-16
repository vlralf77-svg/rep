import { useState } from 'react';
import {
  Box, Typography, Card, CardActionArea, CardContent, Chip,
  CircularProgress, Alert, Dialog, DialogTitle, DialogContent,
  Divider, LinearProgress,
} from '@mui/material';
import { useBetmanData } from '../api/hooks';
import { BetmanGame, BetmanMarket } from '../lib/api';

function OddsBox({ label, value, best }: { label: string; value: number; best: boolean }) {
  return (
    <Box sx={{
      flex: 1, textAlign: 'center', p: 1, borderRadius: 1.5, minWidth: 0,
      border: best ? '2px solid' : '1px solid',
      borderColor: best ? 'primary.main' : 'rgba(255,255,255,0.1)',
      bgcolor: best ? 'rgba(79,195,247,0.1)' : 'rgba(255,255,255,0.03)',
    }}>
      <Typography variant="caption" color="text.secondary" display="block" noWrap>{label}</Typography>
      <Typography variant="h6" fontWeight={700} color={best ? 'primary.main' : 'text.primary'} fontSize={15}>
        {value > 0 ? value.toFixed(2) : '-'}
      </Typography>
    </Box>
  );
}

function ProbBar({ label, prob, color }: { label: string; prob: number; color: string }) {
  return (
    <Box mb={1}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
        <Typography variant="caption">{label}</Typography>
        <Typography variant="caption" fontWeight={700}>{(prob * 100).toFixed(1)}%</Typography>
      </Box>
      <LinearProgress variant="determinate" value={prob * 100}
        sx={{ height: 6, borderRadius: 3, bgcolor: 'rgba(255,255,255,0.08)',
          '& .MuiLinearProgress-bar': { bgcolor: color } }} />
    </Box>
  );
}

const PALETTE = ['#4fc3f7', '#78909c', '#f48fb1', '#ce93d8', '#ffb74d'];

// 마켓 한 개를 배당 박스 + 확률 분석으로 표시
function MarketBlock({ market }: { market: BetmanMarket }) {
  const oddsVals = market.selections.map(s => s.odds).filter(v => v > 0);
  const max = oddsVals.length ? Math.max(...oddsVals) : 0;

  // 배당률 역산 확률 (마진 제거)
  const raw = market.selections.map(s => (s.odds > 0 ? 1 / s.odds : 0));
  const total = raw.reduce((a, b) => a + b, 0) || 1;
  const probs = raw.map(r => r / total);
  const margin = (total - 1) * 100;

  const bestIdx = probs.indexOf(Math.max(...probs));

  return (
    <Box sx={{ mb: 2, bgcolor: 'rgba(255,255,255,0.02)', borderRadius: 2, p: 1.5 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
        <Chip label={market.type} size="small" color="primary" variant="outlined" />
        <Typography variant="caption" color="text.secondary">마진 {margin.toFixed(1)}%</Typography>
      </Box>

      <Box sx={{ display: 'flex', gap: 1, mb: 1.5 }}>
        {market.selections.map((s, i) => (
          <OddsBox key={i} label={s.label} value={s.odds} best={s.odds === max} />
        ))}
      </Box>

      {market.selections.map((s, i) => (
        <ProbBar key={i} label={`${s.label} ${i === bestIdx ? '⭐' : ''}`} prob={probs[i]} color={PALETTE[i % PALETTE.length]} />
      ))}
    </Box>
  );
}

function GameDetail({ game, open, onClose }: { game: BetmanGame; open: boolean; onClose: () => void }) {
  const gameDateTime = game.gameDate
    ? new Date(game.gameDate).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', weekday: 'short' })
    : '';

  // 원하는 순서로 마켓 정렬
  const order = ['승무패', '승1패', '승패', '전반 승무패', '언더오버', '전반 언더오버', '핸디캡', '전반 핸디캡', 'SUM'];
  const sorted = [...game.markets].sort((a, b) => {
    const ia = order.indexOf(a.type); const ib = order.indexOf(b.type);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm"
      PaperProps={{ sx: { bgcolor: '#1a1a2e', borderRadius: 3 } }}>
      <DialogTitle sx={{ pb: 0.5 }}>
        <Box sx={{ display: 'flex', gap: 1, mb: 0.5, flexWrap: 'wrap' }}>
          {game.sport && <Chip label={game.sport} size="small" variant="outlined" />}
          {gameDateTime && <Chip label={gameDateTime} size="small" variant="outlined" />}
        </Box>
        <Typography variant="h6" fontWeight={700}>{game.homeTeam} vs {game.awayTeam}</Typography>
        <Typography variant="caption" color="text.secondary">{sorted.length}개 베팅 마켓</Typography>
      </DialogTitle>
      <DialogContent>
        <Divider sx={{ mb: 2 }} />
        {sorted.map((m, i) => <MarketBlock key={i} market={m} />)}
      </DialogContent>
    </Dialog>
  );
}

function GameRow({ game }: { game: BetmanGame }) {
  const [open, setOpen] = useState(false);
  const gameDateTime = game.gameDate
    ? new Date(game.gameDate).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '';

  // 카드에는 대표 마켓(승무패/승1패 우선) 배당만 미리보기
  const primary = game.markets.find(m => m.type === '승무패' || m.type === '승1패' || m.type === '승패')
    || game.markets[0];
  const oddsVals = primary ? primary.selections.map(s => s.odds).filter(v => v > 0) : [];
  const max = oddsVals.length ? Math.max(...oddsVals) : 0;

  return (
    <>
      <Card sx={{ mb: 1.5 }}>
        <CardActionArea onClick={() => setOpen(true)}>
          <CardContent sx={{ pb: '12px !important' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5, alignItems: 'center' }}>
              <Typography variant="caption" color="text.secondary">
                {game.sport}{gameDateTime ? ' · ' + gameDateTime : ''}
              </Typography>
              <Chip label={`마켓 ${game.markets.length}`} size="small" sx={{ fontSize: 10, height: 18 }} />
            </Box>
            <Typography variant="body2" fontWeight={600} textAlign="center" mb={1}>
              {game.homeTeam} vs {game.awayTeam}
            </Typography>
            {primary && (
              <Box sx={{ display: 'flex', gap: 1 }}>
                {primary.selections.map((s, i) => (
                  <OddsBox key={i} label={s.label} value={s.odds} best={s.odds === max} />
                ))}
              </Box>
            )}
            <Typography variant="caption" color="text.secondary" display="block" textAlign="center" mt={0.5}>
              탭하여 전체 베팅({game.markets.map(m => m.type).slice(0, 4).join('/')}…) 보기
            </Typography>
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

  const games = (type === 'toto' ? data.toto : data.proto) || [];
  const updatedAt = data.updatedAt ? new Date(data.updatedAt).toLocaleString('ko-KR') : '';

  const sorted = [...games].sort((a, b) => (a.gameDate || '').localeCompare(b.gameDate || ''));

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="subtitle2" color="text.secondary">
          {type === 'toto' ? '스포츠토토' : '프로토 승부식'}
        </Typography>
        {updatedAt && <Typography variant="caption" color="text.secondary">갱신: {updatedAt}</Typography>}
      </Box>

      {data.error && <Alert severity="warning" sx={{ mb: 2 }}>스크래핑 오류: {data.error}</Alert>}

      {sorted.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 4 }}>
          <Typography color="text.secondary">데이터가 없습니다.</Typography>
          <Typography variant="caption" color="text.secondary" display="block" mt={1}>
            GitHub Actions → Scrape Betman 워크플로우를 수동으로 실행해주세요.
          </Typography>
        </Box>
      ) : (
        sorted.map((g) => <GameRow key={g.matchId} game={g} />)
      )}
    </Box>
  );
}
