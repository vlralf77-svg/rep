import { Box, Typography, Container } from '@mui/material';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';

export default function Disclaimer() {
  return (
    <Box
      component="footer"
      sx={{
        borderTop: '1px solid rgba(255, 255, 255, 0.08)',
        py: 2,
        mt: 4,
        backgroundColor: 'background.paper',
      }}
    >
      <Container maxWidth="lg">
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <WarningAmberIcon sx={{ color: 'warning.main', fontSize: 20 }} />
          <Typography variant="caption" color="text.secondary">
            이 예측은 통계적 분석 기반 참고 정보입니다. 베팅 결과를 보장하지 않으며, 모든 책임은 이용자 본인에게 있습니다.
          </Typography>
        </Box>
      </Container>
    </Box>
  );
}
