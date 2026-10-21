import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getAuth, GoogleAuthProvider, OAuthProvider, signInWithPopup, signOut, onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { getMessaging, getToken, onMessage, Messaging } from 'firebase/messaging';
import firebaseConfig from '../../firebase-applet-config.json';

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firestore with specific database ID
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId || "ai-studio-sistemaunificado-e92457df-f5f5-4dae-bf01-2d93c76dd572");

// Initialize Firebase Storage
export const storage = getStorage(app);

// Initialize Firebase Auth
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const appleProvider = new OAuthProvider('apple.com');

// Initialize Firebase Messaging (FCM) safely for browser
export let messaging: Messaging | null = null;
if (typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window) {
  try {
    messaging = getMessaging(app);
  } catch (err) {
    console.warn('FCM Messaging não é suportado neste ambiente:', err);
  }
}

// Persistent Unique Device ID (UUID)
export function getDeviceId(): string {
  if (typeof window === 'undefined') return 'server_device';
  let deviceId = localStorage.getItem('app_device_id');
  if (!deviceId) {
    deviceId = 'dev_' + crypto.randomUUID();
    localStorage.setItem('app_device_id', deviceId);
  }
  return deviceId;
}

// Extract client browser and platform metadata
export function getDeviceInfo() {
  if (typeof window === 'undefined') {
    return { deviceName: 'Navegador Web', platform: 'Desconhecido', browser: 'Navegador' };
  }

  const ua = navigator.userAgent;
  let browser = 'Chrome/Safari';
  if (ua.includes('Firefox')) browser = 'Firefox';
  else if (ua.includes('Edg')) browser = 'Edge';
  else if (ua.includes('Chrome')) browser = 'Chrome';
  else if (ua.includes('Safari')) browser = 'Safari';

  let platform = 'Windows';
  if (ua.includes('Macintosh') || ua.includes('Mac OS')) platform = 'macOS';
  else if (ua.includes('Linux')) platform = 'Linux';
  else if (ua.includes('Android')) platform = 'Android';
  else if (ua.includes('iPhone') || ua.includes('iPad')) platform = 'iOS';

  return {
    deviceName: `${browser} / ${platform}`,
    platform,
    browser,
    userAgent: ua
  };
}

// Request Push Notification Permission and Get FCM Token
export async function requestFCMToken(): Promise<string | null> {
  if (!messaging) return null;
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.warn('Permissão de notificação negada pelo usuário.');
      return null;
    }

    // Register Service Worker
    const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
    console.log('Service Worker do FCM registrado com sucesso:', registration.scope);

    // Get FCM Token (using VAPID key if configured or default)
    const token = await getToken(messaging, {
      serviceWorkerRegistration: registration,
      vapidKey: (import.meta as any).env?.VITE_FIREBASE_VAPID_KEY || undefined
    });

    console.log('FCM Token obtido com sucesso');
    return token;
  } catch (error) {
    console.error('Erro ao obter FCM token:', error);
    return null;
  }
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email
    },
    operationType,
    path
  };
  console.warn('Firestore Operation Notice:', errInfo);
}
