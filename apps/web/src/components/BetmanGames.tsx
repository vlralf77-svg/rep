import {
  Box, Typography, Card, CardContent, Chip, CircularProgress, Alert,
} from '@mui/material';
import { useBetmanData } from '../api/hooks';
import { BetmanGame } from '../lib/api';

function OddsBox({ label, value, best }: { label: string; value: number; best: boolean }) {
  return (
    <Box sx={{
      flex: 1,
      textAlign: 'center',
      p: 1,
      borderRadius: 1.5,
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

function GameRow({ game }: { game: BetmanGame }) {
  const { homeWin, draw, awayWin } = game.odds;
  const vals = [homeWin, draw, awayWin].filter(v => v > 0);
  const max = vals.length > 0 ? Math.max(...vals) : 0;

  return (
    <Card sx={{ mb: 1.5 }}>
      <CardContent sx={{ pb: '12px !important' }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
          <Typography variant="caption" color="text.secondary">
            {game.league} · {game.gameDate ? new Date(game.gameDate).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
          </Typography>
          {game.status && <Chip label={game.status} size="small" sx={{ fontSize: 10, height: 18 }} />}
        </Box>

        <Typography variant="body2" fontWeight={600} textAlign="center" mb={1}>
          {game.homeTeam} vs {game.awayTeam}
        </Typography>

        {game.raw ? (
          <Typography variant="caption" color="text.secondary">{game.raw}</Typography>
        ) : (
          <Box sx={{ display: 'flex', gap: 1 }}>
            <OddsBox label="홈승" value={homeWin} best={homeWin === max} />
            {draw > 0 && <OddsBox label="무" value={draw} best={draw === max} />}
            <OddsBox label="원정승" value={awayWin} best={awayWin === max} />
          </Box>
        )}

        {game.handicap && (
          <Typography variant="caption" color="text.secondary" display="block" mt={0.5}>핸디캡: {game.handicap}</Typography>
        )}
        {game.overUnder && (
          <Typography variant="caption" color="text.secondary" display="block">오버언더: {game.overUnder}</Typography>
        )}
      </CardContent>
    </Card>
  );
}

export default function BetmanGames({ type }: { type: 'toto' | 'proto' }) {
  const { data, isLoading, error } = useBetmanData();

  if (isLoading) return <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>;
  if (error) return <Alert severity="warning">배트맨 데이터를 불러올 수 없습니다. (GitHub Actions 스케줄 수집 필요)</Alert>;
  if (!data) return null;

  const games = type === 'toto' ? data.toto : data.proto;
  const updatedAt = data.updatedAt ? new Date(data.updatedAt).toLocaleString('ko-KR') : '';

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

      {data.error && (
        <Alert severity="warning" sx={{ mb: 2 }}>스크래핑 오류: {data.error}</Alert>
      )}

      {games.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 4 }}>
          <Typography color="text.secondary">데이터가 없습니다.</Typography>
          <Typography variant="caption" color="text.secondary" display="block" mt={1}>
            GitHub Actions → Scrape Betman 워크플로우를 수동으로 실행해주세요.
          </Typography>
        </Box>
      ) : (
        games.map((g, i) => <GameRow key={g.gameId || i} game={g} />)
      )}
    </Box>
  );
}
