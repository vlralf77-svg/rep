import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.sportstoto.predict',
  appName: '스포츠 예측',
  webDir: 'dist',
  plugins: {
    // 네이티브 HTTP로 외부 API 직접 호출 (CORS 우회)
    CapacitorHttp: {
      enabled: true,
    },
  },
  android: {
    minWebViewVersion: 60,
  },
};

export default config;
