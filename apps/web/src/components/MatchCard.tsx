import { Card, CardContent, CardActionArea, Box, Typography, Chip, Avatar } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import StarIcon from '@mui/icons-material/Star';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import IconButton from '@mui/material/IconButton';
import { useAppStore } from '../store';

interface MatchCardProps {
  match: {
    id: number;
    homeTeam: { id: number; name: string; shortName: string; crest: string };
    awayTeam: { id: number; name: string; shortName: string; crest: string };
    utcDate: string;
    status: string;
    homeScore?: number | null;
    awayScore?: number | null;
    competitionCode: string;
    competitionName: string;
  };
  prediction?: {
    homeWinProbability: number;
    drawProbability: number;
    awayWinProbability: number;
    confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  };
}

function getConfidenceColor(confidence: string) {
  switch (confidence) {
    case 'HIGH': return 'success';
    case 'MEDIUM': return 'warning';
    case 'LOW': return 'error';
    default: return 'default';
  }
}

function formatDate(dateStr: string) {
  const date = new Date(dateStr);
  return date.toLocaleString('ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function MatchCard({ match, prediction }: MatchCardProps) {
  const navigate = useNavigate();
  const { toggleFavorite, isFavorite } = useAppStore();
  const favorite = isFavorite(match.id);

  const dominantOutcome = prediction
    ? (['home', 'draw', 'away'] as const).reduce((best, current) => {
        const probs = {
          home: prediction.homeWinProbability,
          draw: prediction.drawProbability,
          away: prediction.awayWinProbability,
        };
        return probs[current] > probs[best] ? current : best;
      }, 'home' as 'home' | 'draw' | 'away')
    : null;

  const dominantProb = dominantOutcome && prediction
    ? {
        home: prediction.homeWinProbability,
        draw: prediction.drawProbability,
        away: prediction.awayWinProbability,
      }[dominantOutcome]
    : null;

  return (
    <Card sx={{ mb: 1 }}>
      <CardActionArea onClick={() => navigate(`/match/${match.id}`)}>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
            <Typography variant="caption" color="text.secondary">
              {match.competitionName} · {formatDate(match.utcDate)}
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              {prediction && dominantOutcome && dominantProb && (
                <Chip
                  label={`${dominantOutcome === 'home' ? '홈승' : dominantOutcome === 'draw' ? '무승부' : '원정승'} ${(dominantProb * 100).toFixed(0)}%`}
                  size="small"
                  color={getConfidenceColor(prediction.confidence) as 'success' | 'warning' | 'error' | 'default'}
                  variant="outlined"
                />
              )}
              <IconButton
                size="small"
                onClick={(e) => { e.stopPropagation(); toggleFavorite(match.id); }}
                sx={{ color: favorite ? 'warning.main' : 'text.secondary' }}
              >
                {favorite ? <StarIcon fontSize="small" /> : <StarBorderIcon fontSize="small" />}
              </IconButton>
            </Box>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1 }}>
              <Avatar src={match.homeTeam.crest} sx={{ width: 32, height: 32 }} />
              <Typography variant="body1" fontWeight={600}>
                {match.homeTeam.shortName}
              </Typography>
            </Box>

            <Box sx={{ textAlign: 'center', px: 2 }}>
              {match.status === 'FINISHED' && match.homeScore !== null && match.awayScore !== null ? (
                <Typography variant="h6" fontWeight={700}>
                  {match.homeScore} - {match.awayScore}
                </Typography>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  vs
                </Typography>
              )}
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1, justifyContent: 'flex-end' }}>
              <Typography variant="body1" fontWeight={600}>
                {match.awayTeam.shortName}
              </Typography>
              <Avatar src={match.awayTeam.crest} sx={{ width: 32, height: 32 }} />
            </Box>
          </Box>

          {prediction && (
            <Box sx={{ mt: 1.5, display: 'flex', gap: 0.5 }}>
              <Box sx={{
                flex: prediction.homeWinProbability,
                bgcolor: 'primary.dark',
                height: 4,
                borderRadius: '2px 0 0 2px',
              }} />
              <Box sx={{
                flex: prediction.drawProbability,
                bgcolor: 'grey.600',
                height: 4,
              }} />
              <Box sx={{
                flex: prediction.awayWinProbability,
                bgcolor: 'secondary.dark',
                height: 4,
                borderRadius: '0 2px 2px 0',
              }} />
            </Box>
          )}
        </CardContent>
      </CardActionArea>
    </Card>
  );
}
