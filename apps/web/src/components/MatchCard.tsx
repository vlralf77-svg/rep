import { Card, CardActionArea, Box, Typography, Chip, Avatar } from '@mui/material';
import StarIcon from '@mui/icons-material/Star';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import IconButton from '@mui/material/IconButton';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../store';

interface Props {
  match: any;
}

function ProbBadge({ prob, label, color }: { prob?: number; label: string; color: string }) {
  if (prob === undefined) return null;
  return (
    <Box textAlign="center" minWidth={52}>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Box sx={{ fontWeight: 700, fontSize: 13, color }}>{prob}%</Box>
    </Box>
  );
}

function statusLabel(status: string) {
  const map: Record<string, string> = {
    SCHEDULED: '예정', FINISHED: '종료', LIVE: 'LIVE', IN_PLAY: 'LIVE',
    POSTPONED: '연기', CANCELLED: '취소',
  };
  return map[status] || status;
}

export default function MatchCard({ match }: Props) {
  const navigate = useNavigate();
  const { favorites, toggleFavorite } = useAppStore();
  const isFav = favorites.includes(match.id);
  const pred = match.prediction;
  const maxProb = pred ? Math.max(pred.homeWinProbability, pred.drawProbability, pred.awayWinProbability) : 0;
  const confidence = maxProb >= 55 ? '#00C896' : maxProb >= 45 ? '#FFD700' : '#8B95A8';

  const date = new Date(match.utcDate);
  const timeStr = date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });

  return (
    <Card sx={{ mb: 1.5 }}>
      <CardActionArea onClick={() => navigate(`/match/${match.id}`)}>
        <Box sx={{ p: 2 }}>
          <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
            <Typography variant="caption" color="text.secondary">{timeStr}</Typography>
            <Chip
              label={statusLabel(match.status)}
              size="small"
              sx={{
                fontSize: 11,
                backgroundColor: match.status === 'LIVE' || match.status === 'IN_PLAY' ? 'error.main' : 'rgba(255,255,255,0.08)',
              }}
            />
          </Box>

          <Box display="flex" alignItems="center" justifyContent="space-between">
            <Box display="flex" alignItems="center" gap={1} flex={1}>
              {match.homeTeam.crest && (
                <Avatar src={match.homeTeam.crest} sx={{ width: 28, height: 28 }} variant="square" />
              )}
              <Typography fontWeight={600} noWrap>{match.homeTeam.shortName}</Typography>
            </Box>

            <Box textAlign="center" mx={2} minWidth={60}>
              {match.status === 'FINISHED' ? (
                <Typography fontWeight={700} fontSize={18}>
                  {match.homeScore} – {match.awayScore}
                </Typography>
              ) : (
                <Typography color="text.secondary" fontSize={14}>VS</Typography>
              )}
            </Box>

            <Box display="flex" alignItems="center" gap={1} flex={1} justifyContent="flex-end">
              <Typography fontWeight={600} noWrap>{match.awayTeam.shortName}</Typography>
              {match.awayTeam.crest && (
                <Avatar src={match.awayTeam.crest} sx={{ width: 28, height: 28 }} variant="square" />
              )}
            </Box>
          </Box>

          {pred && (
            <Box display="flex" justifyContent="center" gap={3} mt={1.5} pt={1.5} borderTop="1px solid rgba(255,255,255,0.06)">
              <ProbBadge prob={pred.homeWinProbability} label="홈승" color={confidence} />
              <ProbBadge prob={pred.drawProbability} label="무승부" color={confidence} />
              <ProbBadge prob={pred.awayWinProbability} label="원정승" color={confidence} />
            </Box>
          )}
        </Box>
      </CardActionArea>
      <IconButton
        size="small"
        onClick={() => toggleFavorite(match.id)}
        sx={{ position: 'absolute', top: 8, right: 8 }}
      >
        {isFav ? <StarIcon sx={{ color: 'secondary.main', fontSize: 18 }} /> : <StarBorderIcon sx={{ fontSize: 18 }} />}
      </IconButton>
    </Card>
  );
}
