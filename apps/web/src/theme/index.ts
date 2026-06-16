import { createTheme } from '@mui/material/styles';

const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: '#00C896' },
    secondary: { main: '#FF6B35' },
    background: { default: '#0A0E1A', paper: '#131929' },
    text: { primary: '#E8EAF0', secondary: '#8B95A8' },
  },
  typography: {
    fontFamily: '"Noto Sans KR", sans-serif',
    h4: { fontWeight: 700 },
    h6: { fontWeight: 600 },
  },
  components: {
    MuiCard: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 12,
        },
      },
    },
    MuiChip: {
      styleOverrides: { root: { fontWeight: 600 } },
    },
  },
});

export default theme;
