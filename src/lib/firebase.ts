import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { initializeFirestore, collection, doc, setDoc, getDoc, updateDoc, onSnapshot, query, where, orderBy, addDoc, serverTimestamp, getDocFromServer, enableIndexedDbPersistence } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

// We'll try to import the config, but fallback to empty if it doesn't exist yet
// The AIS environment will provide this file.
import configFromFile from '../../firebase-applet-config.json';

// Helper to determine if a value is a placeholder
const isPlaceholder = (val: string | undefined): boolean => {
  return !val || val.includes('YOUR_') || val.includes('MY_');
};

// Define configuration using environment variables if available, otherwise fallback to the JSON config
const firebaseConfig = {
  apiKey: !isPlaceholder(import.meta.env.VITE_FIREBASE_API_KEY) ? import.meta.env.VITE_FIREBASE_API_KEY : configFromFile.apiKey,
  authDomain: !isPlaceholder(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN) ? import.meta.env.VITE_FIREBASE_AUTH_DOMAIN : configFromFile.authDomain,
  projectId: !isPlaceholder(import.meta.env.VITE_FIREBASE_PROJECT_ID) ? import.meta.env.VITE_FIREBASE_PROJECT_ID : configFromFile.projectId,
  storageBucket: !isPlaceholder(import.meta.env.VITE_FIREBASE_STORAGE_BUCKET) ? import.meta.env.VITE_FIREBASE_STORAGE_BUCKET : configFromFile.storageBucket,
  messagingSenderId: !isPlaceholder(import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID) ? import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID : configFromFile.messagingSenderId,
  appId: !isPlaceholder(import.meta.env.VITE_FIREBASE_APP_ID) ? import.meta.env.VITE_FIREBASE_APP_ID : configFromFile.appId,
  firestoreDatabaseId: !isPlaceholder(import.meta.env.VITE_FIREBASE_FIRESTORE_DATABASE_ID) ? import.meta.env.VITE_FIREBASE_FIRESTORE_DATABASE_ID : configFromFile.firestoreDatabaseId,
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Initialize Firestore. We'll use default settings but keep experimental ignoreUndefined for clean payloads.
// experimentalForceLongPolling is often required in proxied or restricted environments (like Cloud Run/AIS)
export const db = initializeFirestore(app, {
  ignoreUndefinedProperties: true,
  experimentalForceLongPolling: true,
  experimentalAutoDetectLongPolling: false,
}, firebaseConfig.firestoreDatabaseId || '(default)');

// Persistence disabled to resolve internal assertion errors in restricted environments
export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();

// Error handler as per guidelines
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
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Connection test with a small delay to ensure network readiness
async function testConnection() {
  await new Promise(resolve => setTimeout(resolve, 2000));
  try {
    console.log("Firebase Config Status:", {
      hasProjectId: !!firebaseConfig.projectId,
      projectId: firebaseConfig.projectId,
      databaseId: firebaseConfig.firestoreDatabaseId
    });
    console.log("Testing Firestore connection...");
    const testDoc = await getDocFromServer(doc(db, 'test', 'connection'));
    console.log("Firestore connection successful. Data exists:", testDoc.exists());
  } catch (error: any) {
    console.error("Firestore connection test failed:", {
      code: error.code,
      message: error.message,
      name: error.name,
      stack: error.stack
    });
    if(error.code === 'unavailable') {
      console.error("The Firestore backend is unavailable. Switching to default database fallback is not possible at runtime for individual exports, but please verify service status.");
    }
  }
}
testConnection();
