import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.sportstoto.predict',
  appName: '1억프젝',
  webDir: 'dist',
  plugins: {
    // 네이티브 HTTP로 외부 API 직접 호출 (CORS 우회)
    CapacitorHttp: {
      enabled: true,
    },
  },
  server: {
    androidScheme: 'https',
  },
  android: {
    minWebViewVersion: 60,
  },
};

export default config;
