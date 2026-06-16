import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.sportstoto.predict',
  appName: '스포츠 예측',
  webDir: 'dist',
  android: {
    minWebViewVersion: 60,
  },
};

export default config;
