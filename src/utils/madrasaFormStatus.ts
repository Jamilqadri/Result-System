/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Madrasa Form Status Manager (On/Off System)
 * رزلٹ ایڈمن: مدرسہ رجسٹریشن فارم آن / آف کنٹرول سسٹم
 */

import { MadrasaFormStatus } from '../types';

export const DEFAULT_MADRASA_FORM_STATUS: MadrasaFormStatus = {
  enabled: false,
  greeting: 'السلام علیکم ورحمۃ اللہ وبرکاتہ',
  message: 'ابھی اس پر کام ہو رہا ہے\nکچھ دن بعد دوبارہ کوشش کریں',
};

const STORAGE_KEY = 'meyar_madrasa_form_status_v1';
export const MADRASA_FORM_STATUS_EVENT = 'madrasa_form_status_changed';

/**
 * Get cached/local status immediately
 */
export function getMadrasaFormStatusLocal(): MadrasaFormStatus {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        enabled: Boolean(parsed.enabled),
        greeting: parsed.greeting || DEFAULT_MADRASA_FORM_STATUS.greeting,
        message: parsed.message || DEFAULT_MADRASA_FORM_STATUS.message,
        updatedAt: parsed.updatedAt,
      };
    }
  } catch (e) {
    console.error('Error reading local madrasa form status:', e);
  }
  return { ...DEFAULT_MADRASA_FORM_STATUS };
}

/**
 * Fetch latest status from server and update local storage
 */
export async function fetchMadrasaFormStatus(): Promise<MadrasaFormStatus> {
  try {
    const res = await fetch('/api/madrasa-form-status');
    const contentType = res.headers.get('content-type') || '';
    if (res.ok && contentType.includes('application/json')) {
      const data = await res.json();
      const status: MadrasaFormStatus = {
        enabled: Boolean(data.enabled),
        greeting: data.greeting || DEFAULT_MADRASA_FORM_STATUS.greeting,
        message: data.message || DEFAULT_MADRASA_FORM_STATUS.message,
        updatedAt: data.updatedAt,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(status));
      window.dispatchEvent(new CustomEvent(MADRASA_FORM_STATUS_EVENT, { detail: status }));
      return status;
    }
  } catch (e) {
    console.warn('Could not fetch madrasa form status from server, using local fallback:', e);
  }
  return getMadrasaFormStatusLocal();
}

/**
 * Update and save status to server and localStorage
 */
export async function saveMadrasaFormStatus(
  updates: Partial<MadrasaFormStatus>
): Promise<MadrasaFormStatus> {
  const current = getMadrasaFormStatusLocal();
  const nextStatus: MadrasaFormStatus = {
    ...current,
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  // Update local storage immediately
  localStorage.setItem(STORAGE_KEY, JSON.stringify(nextStatus));
  window.dispatchEvent(new CustomEvent(MADRASA_FORM_STATUS_EVENT, { detail: nextStatus }));

  // Persist to server
  try {
    const res = await fetch('/api/madrasa-form-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(nextStatus),
    });
    if (res.ok) {
      const result = await res.json();
      if (result.status) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(result.status));
        return result.status;
      }
    }
  } catch (e) {
    console.error('Failed to save madrasa form status to server:', e);
  }

  return nextStatus;
}
