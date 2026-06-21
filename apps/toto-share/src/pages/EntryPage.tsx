import { useState } from 'react';
import {
  Box,
  Button,
  TextField,
  Typography,
  Paper,
  Avatar,
  CircularProgress,
} from '@mui/material';
import SportsSoccerIcon from '@mui/icons-material/SportsSoccer';
import { useAuth } from '../hooks/useAuth';

export default function EntryPage() {
  const [nickname, setNickname] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { login } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = nickname.trim();
    if (!trimmed) {
      setError('닉네임을 입력하세요');
      return;
    }
    if (trimmed.length > 10) {
      setError('닉네임은 10자 이하로 입력하세요');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await login(trimmed);
    } catch (err: any) {
      setError('입장에 실패했습니다. 다시 시도해주세요.');
      setLoading(false);
    }
  };

  return (
    <Box
      sx={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        px: 2,
        background: 'linear-gradient(135deg, #0d1117 0%, #1a237e 100%)',
      }}
    >
      <Paper
        elevation={8}
        sx={{
          p: 4,
          width: '100%',
          maxWidth: 400,
          textAlign: 'center',
          borderRadius: 3,
        }}
      >
        <Avatar
          sx={{
            width: 64,
            height: 64,
            mx: 'auto',
            mb: 2,
            bgcolor: 'primary.main',
          }}
        >
          <SportsSoccerIcon sx={{ fontSize: 36 }} />
        </Avatar>

        <Typography variant="h5" gutterBottom>
          TotoShare
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          오늘의 경기 픽을 공유하세요
        </Typography>

        <Box component="form" onSubmit={handleSubmit}>
          <TextField
            fullWidth
            label="닉네임"
            placeholder="닉네임을 입력하세요"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            error={!!error}
            helperText={error}
            autoFocus
            sx={{ mb: 2 }}
            inputProps={{ maxLength: 10 }}
          />
          <Button
            fullWidth
            variant="contained"
            size="large"
            type="submit"
            disabled={loading || !nickname.trim()}
            sx={{ py: 1.5 }}
          >
            {loading ? <CircularProgress size={24} /> : '입장하기'}
          </Button>
        </Box>
      </Paper>

      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ mt: 3, opacity: 0.6 }}
      >
        소규모 비공개 그룹 픽 공유 서비스
      </Typography>
    </Box>
  );
}
