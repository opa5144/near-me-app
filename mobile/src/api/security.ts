import { api, clearSession, withSessionRotation } from './client';

export interface SecurityStatus {
  mfaEnabled: boolean;
  recoveryCodesRemaining: number;
  mfaLockedUntil: string | null;
}

export type SecurityErrorField =
  | 'currentPassword' | 'newPassword' | 'confirmPassword'
  | 'code' | 'recoveryCode' | 'confirmation';

export interface SecurityErrorResponse {
  message?: string;
  errors?: Partial<Record<SecurityErrorField, string>>;
  retryAfterSeconds?: number;
  lockedUntil?: string;
}

export interface SecurityProof {
  currentPassword: string;
  code?: string;
  recoveryCode?: string;
}

export interface PasswordChangeRequest extends SecurityProof {
  newPassword: string;
  confirmPassword: string;
}

interface SessionResult {
  message: string;
  accessToken: string;
  expiresAt: string;
}

export interface MfaSetupResult {
  setupToken: string;
  secret: string;
  qrCodeDataUrl: string;
  expiresAt: string;
}

export interface RecoveryCodesResult extends SessionResult {
  recoveryCodes: string[];
}

export interface MfaConfirmationResult extends RecoveryCodesResult {
  mfaEnabled: true;
}

export interface MfaDisabledResult extends SessionResult {
  mfaEnabled: false;
}

const SECURITY_PATH = '/auth/security';

export async function fetchSecurityStatus(signal?: AbortSignal): Promise<SecurityStatus> {
  const response = await api.get<SecurityStatus>(SECURITY_PATH, { signal });
  return response.data;
}

// Coordinate token rotation with concurrent requests so their old-token failures
// cannot sign out the replacement session or a newer account's login.
export async function changePassword(form: PasswordChangeRequest): Promise<SessionResult> {
  return withSessionRotation(async () => {
    const { data } = await api.post<SessionResult>(`${SECURITY_PATH}/password`, form);
    return data;
  });
}

export async function beginMfaSetup(proof: SecurityProof): Promise<MfaSetupResult> {
  const { data } = await api.post<MfaSetupResult>(`${SECURITY_PATH}/mfa/setup`, proof);
  return data;
}

export async function confirmMfaSetup(setupToken: string, code: string): Promise<MfaConfirmationResult> {
  return withSessionRotation(async () => {
    const { data } = await api.post<MfaConfirmationResult>(`${SECURITY_PATH}/mfa/confirm`, { setupToken, code });
    return data;
  });
}

export async function disableMfa(proof: SecurityProof): Promise<MfaDisabledResult> {
  return withSessionRotation(async () => {
    const { data } = await api.post<MfaDisabledResult>(`${SECURITY_PATH}/mfa/disable`, proof);
    return data;
  });
}

export async function regenerateRecoveryCodes(proof: SecurityProof): Promise<RecoveryCodesResult> {
  return withSessionRotation(async () => {
    const { data } = await api.post<RecoveryCodesResult>(`${SECURITY_PATH}/mfa/recovery-codes`, proof);
    return data;
  });
}

// Only a successful deletion clears authentication and returns the app to Login.
export async function deleteOwnAccount(proof: SecurityProof & { confirmation: 'DELETE' }): Promise<void> {
  const originalSession = api.defaults.headers.common.Authorization;
  await api.delete(`${SECURITY_PATH}/account`, { data: proof });
  if (api.defaults.headers.common.Authorization === originalSession) clearSession();
}
