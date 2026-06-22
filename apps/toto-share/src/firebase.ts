import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// Firebase 웹 설정값은 클라이언트에 노출되는 공개 값입니다 (보안은 Firestore 규칙이 담당).
// .env 파일이 있으면 그 값을 우선 사용하고, 없으면 아래 기본값을 사용합니다.
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyA2CIaxkWfKEFoYWKYHwplg1ZJysw3DQbA',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'betman-841e3.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'betman-841e3',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'betman-841e3.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '986235572041',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:986235572041:web:cf7931f586dc087c4f1498',
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
