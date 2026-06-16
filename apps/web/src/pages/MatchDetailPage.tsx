import { useParams, useNavigate } from 'react-router-dom';
import {
  Container, Typography, Box, Avatar, Grid, Card, CardContent,
  CircularProgress, Alert, IconButton, AppBar, Toolbar, Divider,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useMatchPrediction } from '../api/hooks';
import PredictionChart from '../components/PredictionChart';
import BettingMarketsCard from '../components/BettingMarkets';

export default function MatchDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const matchId = id || null;

  const { data, isLoading } = useMatchPrediction(matchId);

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!data) {
    return (
      <Container sx={{ py: 4 }}>
        <Alert severity="error">경기 데이터를 찾을 수 없습니다.</Alert>
      </Container>
    );
  }

  const { match, prediction } = data;
  const isBaseball = match.sport === 'baseball';
  const winLabel = isBaseball ? '승' : '승';

  return (
    <>
      <AppBar position="sticky" elevation={0} sx={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <Toolbar>
          <IconButton onClick={() => navigate(-1)} edge="start" sx={{ mr: 1 }}>
            <ArrowBackIcon />
          </IconButton>
          <Typography variant="h6" fontWeight={700}>경기 분석</Typography>
        </Toolbar>
      </AppBar>

      <Container maxWidth="md" sx={{ py: 3 }}>
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="caption" color="text.secondary" display="block" textAlign="center" mb={2}>
              {match.leagueName} · {new Date(match.utcDate).toLocaleString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit' })}
            </Typography>

            <Grid container alignItems="center" spacing={2}>
              <Grid item xs={5}>
                <Box sx={{ textAlign: 'center' }}>
                  {match.homeTeam.crest && <Avatar src={match.homeTeam.crest} sx={{ width: 64, height: 64, mx: 'auto', mb: 1 }} />}
                  <Typography variant="h6" fontWeight={700}>{match.homeTeam.shortName}</Typography>
                  <Typography variant="caption" color="text.secondary">홈</Typography>
                </Box>
              </Grid>
              <Grid item xs={2}>
                <Typography variant="h4" textAlign="center" fontWeight={700}>
                  {match.status === 'FINISHED' ? `${match.homeScore ?? 0}-${match.awayScore ?? 0}` : 'vs'}
                </Typography>
              </Grid>
              <Grid item xs={5}>
                <Box sx={{ textAlign: 'center' }}>
                  {match.awayTeam.crest && <Avatar src={match.awayTeam.crest} sx={{ width: 64, height: 64, mx: 'auto', mb: 1 }} />}
                  <Typography variant="h6" fontWeight={700}>{match.awayTeam.shortName}</Typography>
                  <Typography variant="caption" color="text.secondary">원정</Typography>
                </Box>
              </Grid>
            </Grid>
          </CardContent>
        </Card>

        <Card sx={{ mb: 3 }}>
          <CardContent>
            <PredictionChart
              homeWin={prediction.homeWinProbability}
              draw={prediction.drawProbability}
              awayWin={prediction.awayWinProbability}
              homeTeamName={match.homeTeam.shortName}
              awayTeamName={match.awayTeam.shortName}
            />
            <Divider sx={{ my: 2 }} />
            <Box sx={{ display: 'flex', justifyContent: 'space-around', textAlign: 'center' }}>
              <Box>
                <Typography variant="h5" color="primary.main" fontWeight={700}>{(prediction.homeWinProbability * 100).toFixed(0)}%</Typography>
                <Typography variant="caption" color="text.secondary">홈{winLabel}</Typography>
              </Box>
              {!isBaseball && (
                <Box>
                  <Typography variant="h5" fontWeight={700}>{(prediction.drawProbability * 100).toFixed(0)}%</Typography>
                  <Typography variant="caption" color="text.secondary">무승부</Typography>
                </Box>
              )}
              <Box>
                <Typography variant="h5" color="secondary.main" fontWeight={700}>{(prediction.awayWinProbability * 100).toFixed(0)}%</Typography>
                <Typography variant="caption" color="text.secondary">원정{winLabel}</Typography>
              </Box>
            </Box>
          </CardContent>
        </Card>

        <BettingMarketsCard
          betting={prediction.betting}
          homeTeam={match.homeTeam.shortName}
          awayTeam={match.awayTeam.shortName}
          isBaseball={isBaseball}
        />

        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>예상 스코어 TOP 5</Typography>
            <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
              {prediction.topScores.map((s, i) => (
                <Box key={i} sx={{
                  textAlign: 'center', p: 1.5, flex: 1, minWidth: 70,
                  border: i === 0 ? '2px solid' : '1px solid',
                  borderColor: i === 0 ? 'primary.main' : 'rgba(255,255,255,0.12)',
                  borderRadius: 2,
                }}>
                  <Typography variant="h6" fontWeight={700}>{s.homeScore}-{s.awayScore}</Typography>
                  <Typography variant="caption" color="text.secondary">{(s.probability * 100).toFixed(1)}%</Typography>
                </Box>
              ))}
            </Box>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>예상 {isBaseball ? '득점' : '득점'}</Typography>
            <Box sx={{ display: 'flex', justifyContent: 'space-around', textAlign: 'center' }}>
              <Box>
                <Typography variant="h5" color="primary.main" fontWeight={700}>{prediction.expectedHomeGoals.toFixed(1)}</Typography>
                <Typography variant="caption" color="text.secondary">{match.homeTeam.shortName}</Typography>
              </Box>
              <Box>
                <Typography variant="h5" color="secondary.main" fontWeight={700}>{prediction.expectedAwayGoals.toFixed(1)}</Typography>
                <Typography variant="caption" color="text.secondary">{match.awayTeam.shortName}</Typography>
              </Box>
            </Box>
          </CardContent>
        </Card>
      </Container>
    </>
  );
}
