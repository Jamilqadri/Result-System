import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  initializeFirestore,
  getFirestore,
  setLogLevel,
  doc,
  getDocFromServer,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

const databaseId = (firebaseConfig as any).firestoreDatabaseId;

try {
  setLogLevel('error');
} catch {}

let firestoreDb: ReturnType<typeof getFirestore>;
try {
  firestoreDb = initializeFirestore(
    app,
    {
      experimentalForceLongPolling: true,
    },
    databaseId
  );
} catch {
  firestoreDb = getFirestore(app, databaseId);
}

export const db = firestoreDb;
export const auth = getAuth(app);

export const FIRESTORE_QUOTA_EVENT = 'meyar_firestore_quota_exceeded';
export const FIRESTORE_UPGRADE_URL = `https://console.firebase.google.com/project/${firebaseConfig.projectId}/firestore/databases/${databaseId}/data?openUpgradeDialog=true`;

const QUOTA_PAUSE_KEY = 'meyar_fs_quota_paused_until';
let firestoreQuotaPausedUntil = 0;
let loggedQuotaWarning = false;

try {
  if (typeof window !== 'undefined' && window.sessionStorage) {
    const saved = Number(window.sessionStorage.getItem(QUOTA_PAUSE_KEY) || '0');
    if (Number.isFinite(saved) && saved > Date.now()) {
      firestoreQuotaPausedUntil = saved;
    }
  }
} catch {}

export function isFirestoreQuotaExceeded(): boolean {
  return Date.now() < firestoreQuotaPausedUntil;
}

export function isQuotaError(error: unknown): boolean {
  const msg =
    error instanceof Error
      ? `${(error as any).code || ''} ${error.message}`
      : String(error || '');
  const lower = msg.toLowerCase();
  return (
    lower.includes('resource-exhausted') ||
    lower.includes('resource_exhausted') ||
    lower.includes('quota exceeded') ||
    lower.includes('quota limit exceeded')
  );
}

export function isPermissionError(error: unknown): boolean {
  const msg =
    error instanceof Error
      ? `${(error as any).code || ''} ${error.message}`
      : String(error || '');
  const lower = msg.toLowerCase();
  return (
    lower.includes('permission-denied') ||
    lower.includes('missing or insufficient permissions')
  );
}

export function markFirestoreQuotaError(error: unknown): boolean {
  if (!isQuotaError(error)) return false;
  // Pause Firestore retries for 15 minutes once free daily quota is hit
  firestoreQuotaPausedUntil = Date.now() + 15 * 60 * 1000;
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.setItem(QUOTA_PAUSE_KEY, String(firestoreQuotaPausedUntil));
    }
  } catch {}
  if (!loggedQuotaWarning) {
    loggedQuotaWarning = true;
    console.warn(
      `Firestore daily free quota exceeded. Falling back to server/local cache. Upgrade or view database: ${FIRESTORE_UPGRADE_URL}`
    );
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent(FIRESTORE_QUOTA_EVENT, {
        detail: {
          exceeded: true,
          upgradeUrl: FIRESTORE_UPGRADE_URL,
          message:
            error instanceof Error ? error.message : String(error || 'Quota exceeded'),
        },
      })
    );
  }
  return true;
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
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null,
  rethrow: boolean = false
): void {
  if (markFirestoreQuotaError(error)) {
    return;
  }
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  if (isPermissionError(error)) {
    console.error('Firestore Error: ', JSON.stringify(errInfo));
    if (rethrow) {
      throw new Error(JSON.stringify(errInfo));
    }
  } else {
    console.warn('Firestore notice:', errInfo.path, errInfo.error);
  }
}

// Validate connection to Firestore when an admin/principal session activates (skipped on public routes to save daily reads)
let connectionValidated = false;
export async function testConnection() {
  if (connectionValidated || isFirestoreQuotaExceeded()) return;
  connectionValidated = true;
  try {
    await getDocFromServer(doc(db, 'system_configs', 'connection_test'));
  } catch (error) {
    markFirestoreQuotaError(error);
    if (
      error instanceof Error &&
      error.message.includes('the client is offline')
    ) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

export function ensureFirestoreConnectionTested() {
  void testConnection();
}

if (typeof window !== 'undefined') {
  try {
    const path = (window.location.pathname || '').toLowerCase();
    const hash = (window.location.hash || '').toLowerCase();
    const savedRole =
      window.sessionStorage?.getItem('meyar_auth_role') ||
      window.localStorage?.getItem('meyar_auth_role');
    const isPrivilegedRoute =
      Boolean(savedRole) ||
      path.includes('/admin') ||
      path.includes('/principal') ||
      path.includes('/login') ||
      hash.includes('admin') ||
      hash.includes('principal');
    if (isPrivilegedRoute) {
      testConnection();
    }
  } catch {}
}

export default app;

