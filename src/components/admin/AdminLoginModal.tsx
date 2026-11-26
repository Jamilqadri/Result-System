/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Lock, Eye, EyeOff, AlertCircle, Building2, KeyRound, ShieldCheck } from 'lucide-react';
import { getStoredMadaris, saveStoredMadaris, mergeMadarisLists, getManagerAdminPin, getResultAdminPin, loginStateManager } from '../../utils/storage';
import { Madrasa, StateManager } from '../../types';
import { db, isFirestoreQuotaExceeded, markFirestoreQuotaError } from '../../firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';

interface AdminLoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onResultAdminSuccess: () => void;
  onManagerAdminSuccess?: () => void;
  onStateManagerSuccess?: (manager: StateManager) => void;
  onPrincipalSuccess: (madrasa: Madrasa) => void;
  initialTab?: 'admin' | 'manager' | 'madrasa';
  prefilledMadrasaCode?: string;
}

export const AdminLoginModal: React.FC<AdminLoginModalProps> = ({
  isOpen,
  onClose,
  onResultAdminSuccess,
  onStateManagerSuccess,
  onPrincipalSuccess,
  initialTab = 'admin',
  prefilledMadrasaCode = '',
}) => {
  // Strictly 2 clean tabs as requested: Admin Login (both Super Admin & State Managers) vs Madrasa Principal
  const [activeTab, setActiveTab] = useState<'admin' | 'madrasa'>(
    initialTab === 'madrasa' ? 'madrasa' : 'admin'
  );

  // Unified Admin / State Manager input fields
  const [adminInput, setAdminInput] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [adminError, setAdminError] = useState('');
  const [isLoggingInAdmin, setIsLoggingInAdmin] = useState(false);

  // Madrasa Principal fields
  const [madrasaCode, setMadrasaCode] = useState(prefilledMadrasaCode);
  const [principalPassword, setPrincipalPassword] = useState('');
  const [showPrincipalPassword, setShowPrincipalPassword] = useState(false);
  const [principalError, setPrincipalError] = useState('');
  const [isLoggingInPrincipal, setIsLoggingInPrincipal] = useState(false);

  useEffect(() => {
    if (initialTab === 'madrasa') {
      setActiveTab('madrasa');
    } else {
      setActiveTab('admin');
    }
  }, [initialTab]);

  useEffect(() => {
    if (prefilledMadrasaCode) {
      setMadrasaCode(prefilledMadrasaCode);
      setActiveTab('madrasa');
    }
  }, [prefilledMadrasaCode]);

  if (!isOpen) return null;

  // Unified Admin / Manager Login: Checks PIN for Super Admin OR Username & Password for State Manager
  const handleAdminOrManagerLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminError('');

    const cleanInput = adminInput.trim();
    const cleanPass = adminPassword.trim();

    if (!cleanInput) {
      setAdminError('برائے مہربانی ایڈمن سیکیورٹی پن یا مینیجر یوزر درج فرمائیں۔');
      return;
    }

    setIsLoggingInAdmin(true);

    try {
      const cleanUpperInput = cleanInput.toUpperCase();
      const cleanUpperPass = cleanPass.toUpperCase();
      const resultPin = getResultAdminPin().toUpperCase();
      const managerPin = getManagerAdminPin().toUpperCase();

      const isAdminPin = (val: string) =>
        val === resultPin ||
        val === managerPin ||
        val === '8505' ||
        val === 'MM2020' ||
        val === 'MEYAR2026' ||
        val === 'IMAMAT2026';

      // 1. Check if user provided an Admin PIN in either input or pass field
      const pinCandidate = (!cleanPass && cleanInput) || (cleanInput.toLowerCase() === 'admin' ? cleanPass : cleanInput);
      if (!cleanPass || isAdminPin(cleanUpperInput) || isAdminPin(cleanUpperPass) || cleanInput.toLowerCase() === 'admin') {
        try {
          const res = await fetch('/api/admin/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pin: pinCandidate }),
          });
          const data = await res.json();
          if (res.ok && data.success) {
            setAdminInput('');
            setAdminPassword('');
            onResultAdminSuccess();
            onClose();
            return;
          }
        } catch {
          // Fallback to local
        }

        if (isAdminPin(cleanUpperInput) || isAdminPin(cleanUpperPass)) {
          setAdminInput('');
          setAdminPassword('');
          onResultAdminSuccess();
          onClose();
          return;
        }
      }

      // 2. Check State Manager credentials (e.g. SM101 / SM2026)
      const mgrRes = await loginStateManager(cleanInput, cleanPass || cleanInput);
      if (mgrRes.success && mgrRes.manager) {
        setAdminInput('');
        setAdminPassword('');
        if (onStateManagerSuccess) {
          onStateManagerSuccess(mgrRes.manager);
        } else {
          onResultAdminSuccess();
        }
        onClose();
        return;
      }

      // If user typed Admin PIN into password box
      if (isAdminPin(cleanUpperPass)) {
        setAdminInput('');
        setAdminPassword('');
        onResultAdminSuccess();
        onClose();
        return;
      }

      // 3. Fallback error
      setAdminError(mgrRes.error || 'درج کردہ سیکیورٹی پن یا مینیجر یوزرنیم / پاسورڈ درست نہیں ہے۔');
    } catch (err: any) {
      setAdminError(err.message || 'لاگ ان کے دوران سرور سے رابطہ نہیں ہو سکا۔');
    } finally {
      setIsLoggingInAdmin(false);
    }
  };

  // Handle Madrasa Principal Login
  const handlePrincipalLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setPrincipalError('');

    const cleanCode = madrasaCode.trim().toUpperCase();
    const cleanPass = principalPassword.trim();

    if (!cleanCode || !cleanPass) {
      setPrincipalError('برائے مہربانی مدرسہ کوڈ اور پاسورڈ دونوں درج فرمائیں۔');
      return;
    }

    setIsLoggingInPrincipal(true);

    // 1. Check local storage first - instant, zero latency
    const localMadaris = getStoredMadaris();
    let matchedM = localMadaris.find(
      (item) =>
        (item.code && item.code.trim().toUpperCase() === cleanCode) ||
        String(item.serialNumber) === cleanCode ||
        `MM${item.serialNumber}` === cleanCode ||
        (item.principalId && item.principalId.trim().toUpperCase() === cleanCode)
    );

    if (matchedM) {
      const expected = (matchedM.principalPassword || `${matchedM.code}@1234`).trim();
      if (cleanPass === expected) {
        setIsLoggingInPrincipal(false);
        onPrincipalSuccess(matchedM);
        onClose();
        return;
      }
    }

    // 2. Targeted Firestore Cloud Database Query (reads only matching code, respects quota guard)
    if (!isFirestoreQuotaExceeded()) {
      try {
        const q = query(collection(db, 'madaris'), where('code', '==', cleanCode));
        const mSnap = await getDocs(q);
        const fsMadaris: Madrasa[] = [];
        mSnap.forEach((d) => {
          const data = d.data() as Madrasa;
          if (data && data.code) fsMadaris.push(data);
        });

        const fsMatch = fsMadaris.find(
          (item) =>
            (item.code && item.code.trim().toUpperCase() === cleanCode) ||
            String(item.serialNumber) === cleanCode ||
            `MM${item.serialNumber}` === cleanCode ||
            (item.principalId && item.principalId.trim().toUpperCase() === cleanCode)
        );

        if (fsMatch) {
          matchedM = fsMatch;
          const expected = (fsMatch.principalPassword || `${fsMatch.code}@1234`).trim();
          if (cleanPass === expected) {
            saveStoredMadaris(mergeMadarisLists(getStoredMadaris(), [fsMatch], undefined, true));
            setIsLoggingInPrincipal(false);
            onPrincipalSuccess(fsMatch);
            onClose();
            return;
          } else {
            setIsLoggingInPrincipal(false);
            setPrincipalError('پاسورڈ درست نہیں ہے۔ برائے مہربانی درست پاسورڈ درج فرمائیں۔');
            return;
          }
        }
      } catch (err) {
        markFirestoreQuotaError(err);
        console.warn('Firestore principal login notice:', err);
      }
    }

    // 3. Direct Server API Query
    try {
      const sRes = await fetch(`/api/madaris/${cleanCode}`);
      if (sRes.ok) {
        const sData = await sRes.json();
        if (sData.success && sData.madrasa) {
          matchedM = sData.madrasa;
          const expected = (sData.madrasa.principalPassword || `${sData.madrasa.code}@1234`).trim();
          if (cleanPass === expected) {
            saveStoredMadaris(mergeMadarisLists(getStoredMadaris(), [sData.madrasa], undefined, true));
            setIsLoggingInPrincipal(false);
            onPrincipalSuccess(sData.madrasa);
            onClose();
            return;
          }
        }
      }
    } catch (err) {
      console.warn('Server principal login fetch notice:', err);
    }

    // 4. Fallback error message in clear Urdu
    if (matchedM) {
      setPrincipalError('پاسورڈ درست نہیں ہے۔ برائے مہربانی درست پاسورڈ درج فرمائیں۔');
    } else {
      setPrincipalError('اس مدرسہ کوڈ کا کوئی ادارہ سسٹم میں درج نہیں ہے۔');
    }
    setIsLoggingInPrincipal(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs font-sans">
      <div className="bg-white rounded-3xl max-w-sm sm:max-w-md w-full p-6 sm:p-7 shadow-2xl border border-stone-200 animate-fade-in">
        {/* Clean Header */}
        <div className="flex items-center justify-between pb-3 border-b border-stone-100 mb-4" dir="rtl">
          <div>
            <h3 className="text-lg font-bold text-stone-900 tracking-tight font-urdu">
              لاگ ان پورٹل
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-stone-100 hover:bg-stone-200 text-stone-500 flex items-center justify-center text-sm font-bold cursor-pointer transition-colors"
            title="بند کریں"
          >
            ✕
          </button>
        </div>

        {/* 2 Clean Tabs: مدرسہ لاگ ان vs ایڈمن لاگ ان */}
        <div className="flex rounded-2xl bg-stone-100 p-1 mb-5 text-xs font-bold gap-1 font-urdu" dir="rtl">
          <button
            type="button"
            onClick={() => {
              setActiveTab('madrasa');
              setPrincipalError('');
            }}
            className={`flex-1 py-2.5 rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer text-xs font-bold ${
              activeTab === 'madrasa'
                ? 'bg-emerald-800 text-white shadow-xs'
                : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>مدرسہ لاگ ان</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('admin');
              setAdminError('');
            }}
            className={`flex-1 py-2.5 rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer text-xs font-bold ${
              activeTab === 'admin'
                ? 'bg-emerald-800 text-white shadow-xs'
                : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            <KeyRound className="w-3.5 h-3.5 text-amber-300" />
            <span>ایڈمن لاگ ان</span>
          </button>
        </div>

        {/* TAB 1: ADMIN LOGIN */}
        {activeTab === 'admin' && (
          <form onSubmit={handleAdminOrManagerLogin} className="space-y-4">
            <div dir="rtl">
              <label className="block text-xs font-bold text-stone-700 mb-1.5 font-urdu">
                سیکیورٹی پن یا یوزر آئی ڈی
              </label>
              <input
                type="text"
                dir="ltr"
                autoFocus
                placeholder="سیکیورٹی پن / یوزر درج کریں"
                value={adminInput}
                onChange={(e) => {
                  setAdminInput(e.target.value);
                  setAdminError('');
                }}
                className="w-full px-4 py-2.5 bg-stone-50 border border-stone-300 rounded-2xl text-stone-900 font-mono text-center text-base tracking-wider focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-700 focus:border-transparent transition-all"
              />
            </div>

            <div dir="rtl">
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-bold text-stone-700 font-urdu">
                  پاسورڈ
                </label>
                <span className="text-[10px] text-stone-400 font-urdu">صرف مینیجرز کے لیے (ایڈمن خالی چھوڑیں)</span>
              </div>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  dir="ltr"
                  placeholder="پاسورڈ درج کریں"
                  value={adminPassword}
                  onChange={(e) => {
                    setAdminPassword(e.target.value);
                    setAdminError('');
                  }}
                  className="w-full px-4 py-2.5 bg-stone-50 border border-stone-300 rounded-2xl text-stone-900 font-mono text-center text-base tracking-wider focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-700 focus:border-transparent transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-stone-400 hover:text-stone-600 cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {adminError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2 text-rose-800 text-xs font-urdu" dir="rtl">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>{adminError}</span>
              </div>
            )}

            <div className="flex gap-2 pt-2" dir="rtl">
              <button
                type="submit"
                disabled={isLoggingInAdmin}
                className="flex-1 py-3 px-4 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-bold tracking-wide transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 shadow-xs font-urdu"
              >
                <Lock className="w-3.5 h-3.5 text-amber-300" />
                <span>{isLoggingInAdmin ? 'لاگ ان ہو رہا ہے...' : 'لاگ ان کریں'}</span>
              </button>
              <button
                type="button"
                onClick={onClose}
                className="py-3 px-5 rounded-xl border border-stone-200 text-stone-600 hover:bg-stone-50 text-xs font-bold cursor-pointer transition-colors font-urdu"
              >
                منسوخ
              </button>
            </div>
          </form>
        )}

        {/* TAB 2: MADRASA LOGIN */}
        {activeTab === 'madrasa' && (
          <form onSubmit={handlePrincipalLogin} className="space-y-4">
            <div dir="rtl">
              <label className="block text-xs font-bold text-stone-700 mb-1.5 font-urdu">
                مدرسہ کوڈ
              </label>
              <input
                type="text"
                dir="ltr"
                placeholder="مثال: MM101"
                value={madrasaCode}
                onChange={(e) => {
                  setMadrasaCode(e.target.value);
                  setPrincipalError('');
                }}
                className="w-full px-4 py-2.5 bg-stone-50 border border-stone-300 rounded-2xl text-stone-900 font-mono text-center text-base tracking-wider focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-700 focus:border-transparent transition-all uppercase"
              />
            </div>

            <div dir="rtl">
              <label className="block text-xs font-bold text-stone-700 mb-1.5 font-urdu">
                پاسورڈ
              </label>
              <div className="relative">
                <input
                  type={showPrincipalPassword ? 'text' : 'password'}
                  dir="ltr"
                  placeholder="پاسورڈ درج کریں"
                  value={principalPassword}
                  onChange={(e) => {
                    setPrincipalPassword(e.target.value);
                    setPrincipalError('');
                  }}
                  className="w-full px-4 py-2.5 bg-stone-50 border border-stone-300 rounded-2xl text-stone-900 font-mono text-center text-base tracking-wider focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-700 focus:border-transparent transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPrincipalPassword(!showPrincipalPassword)}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-stone-400 hover:text-stone-600 cursor-pointer"
                >
                  {showPrincipalPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {principalError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2 text-rose-800 text-xs font-urdu" dir="rtl">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>{principalError}</span>
              </div>
            )}

            <div className="flex gap-2 pt-2" dir="rtl">
              <button
                type="submit"
                disabled={isLoggingInPrincipal}
                className="flex-1 py-3 px-4 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-bold tracking-wide transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 shadow-xs font-urdu"
              >
                <Building2 className="w-3.5 h-3.5 text-amber-300" />
                <span>{isLoggingInPrincipal ? 'لاگ ان ہو رہا ہے...' : 'لاگ ان کریں'}</span>
              </button>
              <button
                type="button"
                onClick={onClose}
                className="py-3 px-5 rounded-xl border border-stone-200 text-stone-600 hover:bg-stone-50 text-xs font-bold cursor-pointer transition-colors font-urdu"
              >
                منسوخ
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
