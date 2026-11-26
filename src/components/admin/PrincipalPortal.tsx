/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Madrasa, MadrasaClass, StudentResult, KaifiyatRule, PassingSettings } from '../../types';
import {
  persistClass,
  persistMadrasa,
  syncMadrasaGoogleSheet,
  verifyAndApproveMadrasa,
  saveMadrasaCustomResultLogic,
  resetMadrasaToCentralResultLogic,
  getEffectiveMadrasaResultLogic,
  CENTRAL_SETTINGS_UPDATED_EVENT,
} from '../../utils/storage';
import { isAbsentCell } from '../../utils/sheetParser';
import { ensureUrduName } from '../../utils/transliterate';
import { isStudentEligibleForTopPerformers, getKaifiyatBadgeClass } from '../../utils/kaifiyatStyles';
import { translations, Language } from '../../utils/translations';
import { StudentFormModal } from './StudentFormModal';
import { KaifiyatSettingsModal } from './KaifiyatSettingsModal';
import { ResultCard } from '../public/ResultCard';
import { PWAInstallButton } from '../common/PWAInstallButton';
import { ManagerVerificationModal } from './ManagerVerificationModal';
import { GoogleSheetWorkspace } from './GoogleSheetWorkspace';
import {
  Building2,
  Users,
  Award,
  CheckCircle,
  XCircle,
  FileSpreadsheet,
  KeyRound,
  ExternalLink,
  Copy,
  BookOpen,
  TrendingUp,
  BarChart3,
  Phone,
  MapPin,
  Lock,
  Sparkles,
  RefreshCw,
  Plus,
  Eye,
  AlertCircle,
  Link2,
  Edit,
  Search,
  CheckCircle2,
  LogOut,
  FolderOpen,
  ArrowUpRight,
  ShieldCheck,
  UserPlus,
  X,
  Clock,
  LayoutDashboard,
  Layers,
  Settings,
  GraduationCap,
  Sliders,
  RotateCcw,
  Check,
  Languages,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Globe,
} from 'lucide-react';

interface PrincipalPortalProps {
  madrasa: Madrasa;
  classes: MadrasaClass[];
  onLogout: () => void;
  onViewPublic: () => void;
  onRefreshData?: () => void;
  onBack?: () => void;
  onBackToHome?: () => void;
}

type PrincipalTab = 'dashboard' | 'classes' | 'students' | 'results' | 'settings';

export const PrincipalPortal: React.FC<PrincipalPortalProps> = ({
  madrasa,
  classes,
  onLogout,
  onViewPublic,
  onRefreshData,
  onBack,
  onBackToHome,
}) => {
  const [lang, setLang] = useState<Language>(() => {
    return (localStorage.getItem('meyar_lang') as Language) || 'ur';
  });
  const isEn = lang === 'en';
  const t = translations[lang] || translations.ur;

  const toggleLanguage = () => {
    const nextLang: Language = lang === 'ur' ? 'en' : 'ur';
    setLang(nextLang);
    localStorage.setItem('meyar_lang', nextLang);
    document.documentElement.dir = nextLang === 'ur' ? 'rtl' : 'ltr';
    document.documentElement.lang = nextLang;
    window.dispatchEvent(new CustomEvent('meyar_lang_changed', { detail: { lang: nextLang } }));
  };

  const [activeTab, setActiveTab] = useState<PrincipalTab>('dashboard');
  const [selectedClassId, setSelectedClassId] = useState<string>('all');
  const [searchStudentQuery, setSearchStudentQuery] = useState('');
  const [resultsDarjaFilter, setResultsDarjaFilter] = useState<string>('all');
  const [resultsSearchQuery, setResultsSearchQuery] = useState<string>('');

  // Password change states
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [passwordMessage, setPasswordMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isSubmittingPassword, setIsSubmittingPassword] = useState(false);
  const [showPasswordText, setShowPasswordText] = useState(false);

  // Student Admission Modal state
  const [isStudentModalOpen, setIsStudentModalOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<{ student: StudentResult; classId: string } | null>(null);
  const [previewStudent, setPreviewStudent] = useState<{ student: StudentResult; cls: MadrasaClass } | null>(null);

  // Madrasa local state synced with prop
  const [currentMadrasa, setCurrentMadrasa] = useState<Madrasa>(madrasa);
  useEffect(() => {
    setCurrentMadrasa(madrasa);
  }, [madrasa]);

  useEffect(() => {
    const handleCentralSettings = () => {
      setCurrentMadrasa((prev) => ({ ...prev }));
    };
    window.addEventListener(CENTRAL_SETTINGS_UPDATED_EVENT, handleCentralSettings);
    return () => window.removeEventListener(CENTRAL_SETTINGS_UPDATED_EVENT, handleCentralSettings);
  }, []);

  const [isKaifiyatModalOpen, setIsKaifiyatModalOpen] = useState(false);
  const [isSheetWorkspaceOpen, setIsSheetWorkspaceOpen] = useState(false);
  const [toastNotification, setToastNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const madrasaLogo = (currentMadrasa?.logo && currentMadrasa.logo.trim()) || ((currentMadrasa as any)?.logoUrl && (currentMadrasa as any).logoUrl.trim()) || '';
  // Madrasa custom theme color applies strictly to Result Card, keeping dashboard in standard emerald theme
  const portalThemeColor = '#065f46';

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    const isError = type === 'error' ||
      msg.includes('خامی') ||
      msg.includes('مسئلہ') ||
      msg.includes('غلط') ||
      msg.includes('error') ||
      msg.includes('Error') ||
      msg.includes('failed') ||
      msg.includes('نہیں ہو سکا');
    setToastNotification({ message: msg, type: isError ? 'error' : 'success' });
    setTimeout(() => setToastNotification(null), 4000);
  };

  const handleSaveKaifiyat = async (rules: KaifiyatRule[], passing: PassingSettings) => {
    try {
      const res = await saveMadrasaCustomResultLogic(currentMadrasa.id, rules, passing);
      setCurrentMadrasa(res.madrasa);
      setIsKaifiyatModalOpen(false);
      showToast(isEn ? 'Result logic saved & results updated!' : 'مدرسہ کا رزلٹ لاجک محفوظ ہو گیا اور تمام نتائج اپ ڈیٹ ہو گئے');
      if (onRefreshData) await onRefreshData();
    } catch (e) {
      console.error(e);
      showToast(isEn ? 'Failed to save result logic' : 'رزلٹ لاجک محفوظ نہیں ہو سکی');
    }
  };

  const handleResetToCentralDefaults = async () => {
    try {
      const res = await resetMadrasaToCentralResultLogic(currentMadrasa.id);
      setCurrentMadrasa(res.madrasa);
      setIsKaifiyatModalOpen(false);
      showToast(isEn ? 'Reset to central default result logic!' : 'مرکزی ڈیفالٹ رزلٹ لاجک بحال ہو گئی');
      if (onRefreshData) await onRefreshData();
    } catch (e) {
      console.error(e);
      showToast(isEn ? 'Failed to reset result logic' : 'ڈیفالٹ بحال کرنے میں خرابی پیش آئی');
    }
  };

  // Google Sheet Sync state
  const [isSyncingSheet, setIsSyncingSheet] = useState(false);
  const [isSheetLinkModalOpen, setIsSheetLinkModalOpen] = useState(false);
  const [portalSheetUrlInput, setPortalSheetUrlInput] = useState(madrasa.googleSheetUrl || '');
  const [isSavingPortalSheet, setIsSavingPortalSheet] = useState(false);
  const [copiedOldPortalLink, setCopiedOldPortalLink] = useState(false);

  useEffect(() => {
    setPortalSheetUrlInput(madrasa.googleSheetUrl || '');
  }, [madrasa.googleSheetUrl]);

  const handleSavePortalSheetUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUrl = portalSheetUrlInput.trim();
    if (!cleanUrl) return;
    if (!cleanUrl.includes('docs.google.com/spreadsheets') && !cleanUrl.includes('drive.google.com') && !cleanUrl.includes('script.google.com')) {
      alert(isEn ? 'Please enter a valid online spreadsheet or drive link.' : 'برائے مہربانی درست آن لائن کلاؤڈ یا ڈرائیو لنک درج فرمائیں۔');
      return;
    }
    setIsSavingPortalSheet(true);
    try {
      const updatedM: Madrasa = {
        ...madrasa,
        googleSheetUrl: cleanUrl,
        isVerified: true,
        registrationStatus: 'approved',
      };
      await persistMadrasa(updatedM);
      const targetClasses = classes.filter((c) => c.madrasaId === madrasa.id);
      for (const cls of targetClasses) {
        await persistClass({
          ...cls,
          googleSheetUrl: cleanUrl,
          sheetTabName: cls.name,
          resultSourceType: 'google_sheet',
        });
      }
      const syncRes = await syncMadrasaGoogleSheet(madrasa.id);
      if (onRefreshData) await onRefreshData();
      setIsSheetLinkModalOpen(false);
      showToast(
        isEn
          ? `Records updated and synced (${syncRes.totalStudents || 0} students live)!`
          : `کلاؤڈ ریکارڈ کا لنک کامیابی سے تبدیل ہو گیا اور ڈیٹا لائیو سنک ہو گیا!`
      );
    } catch (err: any) {
      alert(err.message || 'Error updating sheet URL');
    } finally {
      setIsSavingPortalSheet(false);
    }
  };

  // Verification state & Admin actions
  const isMadrasaPending = Boolean(currentMadrasa.registrationStatus === 'pending' || !currentMadrasa.isVerified || !currentMadrasa.managerVerified);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isManagerReviewModalOpen, setIsManagerReviewModalOpen] = useState(false);

  const handleAdminVerify = () => {
    setIsManagerReviewModalOpen(true);
  };

  // Madrasa & Classes for this institution (exact code & prefix matching)
  const isClassForThisMadrasa = (c: MadrasaClass) => {
    if (!c) return false;
    if (c.madrasaId === madrasa.id) return true;
    if (madrasa.code && (c.madrasaId === madrasa.code || c.madrasaId.toUpperCase() === madrasa.code.toUpperCase())) return true;
    if (c.madrasaId && madrasa.id && c.madrasaId.toLowerCase() === madrasa.id.toLowerCase()) return true;
    if (madrasa.code) {
      const cMadLower = String(c.madrasaId || '').toLowerCase().trim();
      const mCodeLower = madrasa.code.toLowerCase().trim();
      const numericCode = madrasa.code.replace(/\D/g, '');
      if (cMadLower === mCodeLower || cMadLower === `mm${numericCode}` || cMadLower === `madrasa-mm${numericCode}`) return true;
      const cIdLower = String(c.id || '').toLowerCase().trim();
      if (cIdLower.startsWith(`class-mm${numericCode}-`) || cIdLower.startsWith(`class-${madrasa.id}-`)) return true;
    }
    return false;
  };

  const [portalClasses, setPortalClasses] = useState<MadrasaClass[]>(() => classes.filter(isClassForThisMadrasa));

  useEffect(() => {
    const matched = classes.filter(isClassForThisMadrasa);
    setPortalClasses(matched);
  }, [classes, madrasa.id, madrasa.code]);

  const madrasaClasses = portalClasses;

  // Auto-sync from Google Sheet in background if classes are missing or have 0 students
  useEffect(() => {
    if (madrasa.googleSheetUrl) {
      const currentMatched = classes.filter(isClassForThisMadrasa);
      const studentCount = currentMatched.reduce((acc, c) => acc + (c.students?.length || 0), 0);
      if (currentMatched.length === 0 || studentCount === 0) {
        syncMadrasaGoogleSheet(madrasa.id, madrasa).then((res) => {
          if (res && Array.isArray(res.classes)) {
            const matched = res.classes.filter(isClassForThisMadrasa);
            if (matched.length > 0) {
              setPortalClasses(matched);
            }
          }
          if (res && (res.totalStudents || res.syncedClasses) && onRefreshData) {
            onRefreshData();
          }
        }).catch(() => {});
      }
    }
  }, [madrasa.id, madrasa.googleSheetUrl]);

  // Listen for background data updates
  useEffect(() => {
    const handleDataUpdated = (e: any) => {
      if (e?.detail?.classes && Array.isArray(e.detail.classes)) {
        const matched = e.detail.classes.filter(isClassForThisMadrasa);
        if (matched.length > 0) {
          setPortalClasses(matched);
        }
      }
      if (onRefreshData) onRefreshData();
    };
    window.addEventListener('meyar_data_updated', handleDataUpdated);
    return () => window.removeEventListener('meyar_data_updated', handleDataUpdated);
  }, [onRefreshData, madrasa.id, madrasa.code]);

  // Permissions (Admin permissions control)
  const canPublish = madrasa.permissions ? madrasa.permissions.principalCanPublish : true;
  const canUnpublish = madrasa.permissions ? madrasa.permissions.principalCanUnpublish : true;
  const canAddStudents = madrasa.permissions ? madrasa.permissions.principalCanAddStudents : true;

  // Active classes for stats
  const activeClasses =
    selectedClassId === 'all'
      ? madrasaClasses
      : madrasaClasses.filter((c) => c.id === selectedClassId);

  // Calculate comprehensive stats from all classes
  const allStudents = activeClasses.flatMap((c) => (c.students || []).map((s) => ({ ...s, cls: c })));
  const totalStudents = allStudents.length;

  const passedStudents = allStudents.filter(isStudentEligibleForTopPerformers);
  const passCount = passedStudents.length;
  const passPercentage = totalStudents > 0 ? ((passCount / totalStudents) * 100).toFixed(1) : '0';

  // Kaifiyat Breakdown
  const mumtazCount = allStudents.filter((s) => s.kaifiyat?.includes('ممتاز')).length;
  const aalaCount = allStudents.filter((s) => s.kaifiyat?.includes('اعلیٰ') || s.kaifiyat?.includes('اعلی')).length;
  const jayyidCount = allStudents.filter((s) => s.kaifiyat?.includes('جید')).length;
  const maqboolCount = allStudents.filter((s) => s.kaifiyat?.includes('مقبول') || s.kaifiyat?.includes('مجاز')).length;
  const failCount = allStudents.filter((s) => s.kaifiyat?.includes('ناکام') || s.kaifiyat?.includes('راسب') || s.kaifiyat?.includes('فیل')).length;
  const absentCount = allStudents.filter((s) => s.isAbsent || s.kaifiyat?.includes('غیر حاضر') || s.kaifiyat?.includes('غائب')).length;

  // Top 10 Overall - Strictly passing performers with marks > 0%
  const top10Students = [...allStudents]
    .filter(isStudentEligibleForTopPerformers)
    .sort((a, b) => b.percentage - a.percentage)
    .slice(0, 10);

  // Filtered students for Directory
  const filteredStudents = allStudents.filter((s) => {
    if (selectedClassId !== 'all' && s.cls.id !== selectedClassId) return false;
    if (!searchStudentQuery.trim()) return true;
    const q = searchStudentQuery.toLowerCase().trim();
    return (
      s.studentId.toLowerCase().includes(q) ||
      s.studentName.toLowerCase().includes(q) ||
      (s.studentNameEn && s.studentNameEn.toLowerCase().includes(q)) ||
      s.fatherName.toLowerCase().includes(q) ||
      (s.fatherNameEn && s.fatherNameEn.toLowerCase().includes(q)) ||
      (s.rollNo && s.rollNo.includes(q))
    );
  });

  // Toggle Publish/Unpublish status for a class
  const handleToggleClassPublish = async (cls: MadrasaClass) => {
    const nextStatus = cls.status === 'published' ? 'unpublished' : 'published';
    if (nextStatus === 'published' && !canPublish) {
      alert('ایڈمن کی جانب سے نتیجہ شائع (Publish) کرنے کی اجازت غیر فعال ہے۔ برائے مہربانی ایڈمن سے رابطہ فرمائیں۔');
      return;
    }
    if (nextStatus === 'unpublished' && !canUnpublish) {
      alert('ایڈمن کی جانب سے نتیجہ غیر شائع (Unpublish) کرنے کی اجازت غیر فعال ہے۔');
      return;
    }

    try {
      const res = await fetch('/api/classes/set-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ classId: cls.id, status: nextStatus }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        if (onRefreshData) onRefreshData();
      }
    } catch {
      alert('اسٹیٹس تبدیل کرنے میں مسئلہ پیش آیا۔');
    }
  };

  // Manual Sync from Google Sheet - only when user clicks the sync button
  const handleSyncFromSheet = async () => {
    if (!madrasa.googleSheetUrl) {
      showToast(isEn ? 'Cloud record link is not attached.' : 'آن لائن کلاؤڈ ریکارڈ کا لنک منسلک نہیں ہے۔', 'error');
      return;
    }
    setIsSyncingSheet(true);
    try {
      const res = await syncMadrasaGoogleSheet(madrasa.id, madrasa);
      if (res && Array.isArray(res.classes)) {
        const matched = res.classes.filter(isClassForThisMadrasa);
        if (matched.length > 0) {
          setPortalClasses(matched);
        }
      }
      if (onRefreshData) await onRefreshData();
      if (res.success) {
        const count = res.totalStudents !== undefined ? res.totalStudents : 0;
        showToast(
          isEn
            ? `Successfully synced ${count} students live!`
            : `کلاؤڈ ڈیٹابیس سے ${count > 0 ? count + ' طلبہ کا ڈیٹا' : 'تمام درجات'} کامیابی سے سنک ہو گیا!`,
          'success'
        );
      } else {
        showToast(res.message || (isEn ? 'Sync failed' : 'ہم آہنگی نہیں ہو سکی'), 'error');
      }
    } catch {
      showToast(isEn ? 'Error refreshing records' : 'ریکارڈ ہم آہنگ کرنے میں خامی آئی۔', 'error');
    } finally {
      setIsSyncingSheet(false);
    }
  };

  // Save Student Record from Admission Form
  const handleSaveStudent = async (studentData: StudentResult, targetClassId: string) => {
    try {
      const targetClass = madrasaClasses.find((c) => c.id === targetClassId);
      if (!targetClass) return;

      const existingStudents = [...(targetClass.students || [])];
      const index = existingStudents.findIndex((s) => s.studentId === studentData.studentId);
      if (index !== -1) {
        existingStudents[index] = studentData;
      } else {
        existingStudents.push(studentData);
      }

      await persistClass({
        ...targetClass,
        students: existingStudents,
        updatedAt: new Date().toISOString(),
      });

      if (onRefreshData) onRefreshData();
    } catch (err) {
      console.error('Failed to save student admission:', err);
    }
  };

  // Change Password
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordMessage(null);

    const expectedCurrent = madrasa.principalPassword || `${madrasa.code}@1234`;
    if (oldPassword !== expectedCurrent) {
      setPasswordMessage({ type: 'error', text: 'موجودہ (پرانا) پاسورڈ درست نہیں ہے۔' });
      return;
    }
    if (newPassword.length < 4) {
      setPasswordMessage({ type: 'error', text: 'نیا پاسورڈ کم از کم 4 حروف یا ہندسوں پر مشتمل ہونا چاہیے۔' });
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setPasswordMessage({ type: 'error', text: 'نیا پاسورڈ اور تصدیقی پاسورڈ آپس میں مماثل نہیں ہیں۔' });
      return;
    }

    setIsSubmittingPassword(true);
    try {
      const updatedMadrasa: Madrasa = {
        ...madrasa,
        principalPassword: newPassword,
      };
      await persistMadrasa(updatedMadrasa);
      setPasswordMessage({ type: 'success', text: 'پاسورڈ کامیابی کے ساتھ تبدیل ہو گیا!' });
      setOldPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      if (onRefreshData) onRefreshData();
    } catch (err) {
      setPasswordMessage({ type: 'error', text: 'پاسورڈ تبدیل کرنے میں مسئلہ پیش آیا۔' });
    } finally {
      setIsSubmittingPassword(false);
    }
  };

  return (
    <div
      className={`min-h-screen bg-stone-100 font-sans text-stone-900 pb-24 lg:pb-8 select-none ${
        isEn ? 'lg:pl-64 xl:lg:pl-72' : 'lg:pr-64 xl:lg:pr-72'
      }`}
    >
      {/* Sleek Fixed Desktop Right Sidebar for Principal Dashboard */}
      <aside
        style={{ backgroundColor: portalThemeColor }}
        className={`hidden lg:flex lg:flex-col lg:fixed lg:top-0 lg:bottom-0 lg:w-64 xl:lg:w-72 text-white z-40 shadow-2xl border-white/10 ${
          isEn ? 'left-0 border-r font-sans' : 'right-0 border-l font-urdu'
        }`}
        dir={isEn ? 'ltr' : 'rtl'}
      >
        {/* Header & Madrasa Branding */}
        <div className="p-4 border-b border-white/10 flex items-center gap-3">
          {madrasaLogo ? (
            <div className="w-11 h-11 rounded-2xl bg-white p-1 border border-amber-400/50 shadow-xs shrink-0 flex items-center justify-center overflow-hidden">
              <img
                src={madrasaLogo}
                alt={currentMadrasa.urduName}
                className="w-full h-full object-contain"
                onError={(e) => {
                  const target = e.currentTarget;
                  const parent = target.parentElement;
                  if (parent) parent.style.display = 'none';
                }}
              />
            </div>
          ) : null}
          <div className="min-w-0 flex-1">
            <h2 className={`font-bold text-amber-300 text-sm leading-snug truncate ${!isEn ? 'font-aslam text-base' : ''}`} title={isEn ? (madrasa.englishName || madrasa.urduName) : madrasa.urduName}>
              {isEn ? (madrasa.englishName || madrasa.urduName) : madrasa.urduName}
            </h2>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="font-mono text-[10px] bg-black/40 px-1.5 py-0.5 rounded text-emerald-200 border border-emerald-700/60 font-bold">
                {madrasa.code}
              </span>
              <span className="text-[10px] text-emerald-300/80 truncate">
                {isEn ? 'Principal Portal' : 'پرنسپل ڈیش بورڈ'}
              </span>
            </div>
          </div>
        </div>

        {/* 5 Main Navigation Items */}
        <nav className="flex-1 p-3 space-y-1.5 overflow-y-auto">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'dashboard'
                ? 'bg-amber-400 text-emerald-950 shadow-md font-extrabold'
                : 'text-emerald-100/90 hover:bg-emerald-900/60 hover:text-white'
            }`}
          >
            <LayoutDashboard className="w-5 h-5 shrink-0" />
            <span>{isEn ? 'Overview (Dashboard)' : 'جائزہ (Dashboard)'}</span>
          </button>

          {/* Install Button placed strictly below Dashboard menu item */}
          <div className="pt-0.5 pb-1">
            <PWAInstallButton
              variant="sidebar"
              label={isEn ? '📱 Install App' : '📱 ایپ انسٹال کریں'}
            />
          </div>

          <button
            onClick={() => setActiveTab('classes')}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'classes'
                ? 'bg-amber-400 text-emerald-950 shadow-md font-extrabold'
                : 'text-emerald-100/90 hover:bg-emerald-900/60 hover:text-white'
            }`}
          >
            <BookOpen className="w-5 h-5 shrink-0" />
            <span>{isEn ? 'Classes & Subjects' : 'درجات و امتحانی شعبہ'}</span>
          </button>

          <button
            onClick={() => setActiveTab('students')}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'students'
                ? 'bg-amber-400 text-emerald-950 shadow-md font-extrabold'
                : 'text-emerald-100/90 hover:bg-emerald-900/60 hover:text-white'
            }`}
          >
            <Users className="w-5 h-5 shrink-0" />
            <span>{isEn ? 'Students & Admissions' : 'داخلہ و طلبہ سمری'}</span>
          </button>

          <button
            onClick={() => setActiveTab('results')}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'results'
                ? 'bg-amber-400 text-emerald-950 shadow-md font-extrabold'
                : 'text-emerald-100/90 hover:bg-emerald-900/60 hover:text-white'
            }`}
          >
            <Award className="w-5 h-5 shrink-0" />
            <span>{isEn ? 'Examination Results' : 'امتحانی نتائج'}</span>
          </button>

          <button
            type="button"
            onClick={() => setIsSheetWorkspaceOpen(true)}
            className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-xs font-bold transition-all cursor-pointer bg-amber-400/15 hover:bg-amber-400 hover:text-emerald-950 text-amber-200 border border-amber-400/35"
          >
            <FileSpreadsheet className="w-5 h-5 shrink-0" />
            <span>{isEn ? 'Result Entry & PDF' : 'آن لائن رزلٹ اندراج'}</span>
          </button>

          <button
            onClick={() => setActiveTab('settings')}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'settings'
                ? 'bg-amber-400 text-emerald-950 shadow-md font-extrabold'
                : 'text-emerald-100/90 hover:bg-emerald-900/60 hover:text-white'
            }`}
          >
            <Sliders className="w-5 h-5 shrink-0" />
            <span>{isEn ? 'Settings & Profile' : 'مدرسہ پروفائل و ترتیبات'}</span>
          </button>

          {/* Quick Classes Filter in Sidebar */}
          <div className="pt-3 mt-3 border-t border-emerald-900/80">
            <span className="text-[11px] font-bold text-amber-300 px-2 block mb-1.5">
              {isEn ? 'Filter by Class:' : 'درجات کا فوری انتخاب:'}
            </span>
            <div className="space-y-1">
              <button
                type="button"
                onClick={() => setSelectedClassId('all')}
                className={`w-full text-right px-2.5 py-1.5 rounded-xl text-xs flex items-center justify-between cursor-pointer transition-all ${
                  selectedClassId === 'all'
                    ? 'bg-emerald-800 text-white font-bold'
                    : 'text-emerald-200/80 hover:bg-emerald-900/40 hover:text-white'
                }`}
              >
                <span>{isEn ? 'All Classes' : 'تمام درجات'}</span>
                <span className="text-[10px] font-mono bg-black/30 px-1.5 py-0.5 rounded">
                  {madrasaClasses.length}
                </span>
              </button>
              {madrasaClasses.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelectedClassId(c.id)}
                  className={`w-full text-right px-2.5 py-1.5 rounded-xl text-xs flex items-center justify-between cursor-pointer transition-all ${
                    selectedClassId === c.id
                      ? 'bg-emerald-800 text-white font-bold'
                      : 'text-emerald-200/80 hover:bg-emerald-900/40 hover:text-white'
                  }`}
                >
                  <span className="truncate">{c.name}</span>
                  <span className="text-[10px] font-mono bg-black/30 px-1.5 py-0.5 rounded">
                    {c.students?.length || 0}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </nav>

        {/* Sidebar Footer Controls */}
        <div className="p-3 border-t border-emerald-900/80 space-y-2 bg-emerald-950/90">
          <button
            onClick={onViewPublic}
            className="w-full py-2 px-3 rounded-xl bg-amber-400 hover:bg-amber-300 text-emerald-950 text-xs font-bold flex items-center justify-center gap-2 shadow-xs cursor-pointer transition-all"
          >
            <Eye className="w-3.5 h-3.5" />
            <span>{isEn ? 'View Public Results Portal' : 'آن لائن رزلٹ پورٹل دیکھیں'}</span>
          </button>

          {onBackToHome && (
            <button
              onClick={onBackToHome}
              className="w-full py-1.5 px-3 rounded-xl bg-white/10 hover:bg-white/20 text-stone-200 text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition-all"
            >
              <Globe className="w-3.5 h-3.5 text-amber-300" />
              <span>{isEn ? 'Return to Home Page' : 'ہوم پیج پر جائیں'}</span>
            </button>
          )}

          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={toggleLanguage}
              className="flex-1 py-1.5 px-2.5 rounded-xl bg-emerald-900/60 hover:bg-emerald-800 text-amber-300 text-xs font-bold flex items-center justify-center gap-1 border border-emerald-700/50 cursor-pointer"
            >
              <Languages className="w-3.5 h-3.5" />
              <span>{isEn ? 'اردو' : 'English'}</span>
            </button>

            <button
              onClick={onBack ? onBack : onLogout}
              className="flex-1 py-1.5 px-2.5 rounded-xl bg-rose-950/60 hover:bg-rose-900 text-rose-300 text-xs font-bold flex items-center justify-center gap-1 border border-rose-800/50 cursor-pointer"
            >
              {onBack ? <X className="w-3.5 h-3.5" /> : <LogOut className="w-3.5 h-3.5" />}
              <span>{onBack ? (isEn ? 'Back' : 'واپس') : (isEn ? 'Logout' : 'لاگ آؤٹ')}</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Top Header Bar */}
      <header
        style={{ backgroundColor: portalThemeColor }}
        className="sticky top-0 z-30 text-white shadow-md border-b border-white/15 w-full"
        dir="ltr"
      >
        <div className="w-full px-4 sm:px-6 lg:px-8 py-2.5 flex items-center justify-between gap-3">
          {/* Left: Back Button + Logo + Madrasa Name + Code */}
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            {onBack && (
              <button
                onClick={onBack}
                className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-amber-400 hover:bg-amber-300 text-emerald-950 flex items-center justify-center shadow-md transition-all cursor-pointer shrink-0"
                title={isEn ? 'Back to All Madrasas' : 'تمام مدارس کی فہرست کی طرف واپس'}
              >
                <ArrowLeft className={`w-5 h-5 shrink-0 ${isEn ? '' : 'rotate-180'}`} />
              </button>
            )}

            {madrasaLogo ? (
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-white p-0.5 border border-amber-400/40 shadow-xs shrink-0 flex items-center justify-center overflow-hidden">
                <img
                  src={madrasaLogo}
                  alt={currentMadrasa.urduName}
                  className="w-full h-full object-contain"
                  onError={(e) => {
                    const target = e.currentTarget;
                    const parent = target.parentElement;
                    if (parent) parent.style.display = 'none';
                  }}
                />
              </div>
            ) : null}

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                <h1
                  className={`text-sm sm:text-base font-bold tracking-wide text-amber-300 truncate whitespace-nowrap leading-tight ${isEn ? 'font-sans' : 'font-aslam text-base sm:text-lg'}`}
                  title={isEn ? (madrasa.englishName || madrasa.urduName) : (madrasa.urduName || madrasa.englishName)}
                >
                  {isEn ? (madrasa.englishName || madrasa.urduName) : (madrasa.urduName || madrasa.englishName)}
                </h1>
                <span className="font-mono text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 rounded-lg bg-black/40 border border-emerald-500/40 text-white font-bold shrink-0">
                  {madrasa.code}
                </span>
              </div>
              <p className={`text-[10px] text-emerald-200/90 truncate whitespace-nowrap -mt-0.5 ${isEn ? 'font-sans' : 'font-urdu'}`}>
                {isEn ? 'Madrasa Personal Dashboard & Examination Portal' : 'مدرسہ پرسنل پینل و امتحانی پورٹل'}
              </p>
            </div>
          </div>

          {/* Right: Quick Action Buttons */}
          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            {/* Language Switcher */}
            <button
              onClick={toggleLanguage}
              className="px-2 sm:px-2.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-emerald-200 border border-emerald-500/40 text-xs font-bold transition-all flex items-center gap-1 cursor-pointer shrink-0"
              title="Switch Language / زبان تبدیل کریں"
            >
              <Languages className="w-3.5 h-3.5 text-amber-300" />
              <span className="font-sans">{isEn ? 'اردو' : 'English'}</span>
            </button>

            {/* Public View Button */}
            <button
              onClick={onViewPublic}
              className="px-2 sm:px-2.5 py-1.5 rounded-xl bg-amber-400/20 hover:bg-amber-400/30 text-amber-300 border border-amber-400/40 text-xs font-bold transition-all flex items-center gap-1 cursor-pointer shrink-0"
              title={isEn ? 'Online Results Portal' : 'آن لائن پورٹل دیکھیں'}
            >
              <Eye className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden md:inline font-sans">{isEn ? 'Portal' : 'رزلٹ پورٹل'}</span>
            </button>

            {/* Logout (Only shown if directly logged in as principal) */}
            {!onBack && (
              <button
                onClick={onLogout}
                className="p-1.5 rounded-xl bg-white/10 hover:bg-rose-950/80 text-stone-200 hover:text-rose-200 transition-all flex items-center justify-center cursor-pointer shrink-0"
                title={isEn ? 'Logout' : 'لاگ آؤٹ'}
              >
                <LogOut className="w-4 h-4 text-rose-300" />
              </button>
            )}
          </div>
        </div>

        {/* Classes Horizontal Selector Bar (Full width across header) */}
        <div className="w-full px-4 sm:px-6 lg:px-8 py-2 border-t border-emerald-800/50 flex items-center gap-2 overflow-x-auto no-scrollbar">
          <span className="text-[11px] font-bold text-emerald-300 shrink-0 font-urdu ml-1">
            درجہ:
          </span>
          <button
            type="button"
            onClick={() => setSelectedClassId('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer shrink-0 border ${
              selectedClassId === 'all'
                ? 'bg-amber-400 text-emerald-950 border-amber-300 font-bold shadow-xs'
                : 'bg-emerald-900/60 hover:bg-emerald-800/80 text-emerald-100 border-emerald-700/60'
            }`}
          >
            <span className="font-urdu text-sm font-bold">تمام درجات ({madrasaClasses.length})</span>
          </button>

          {madrasaClasses.map((c) => {
            const isSelected = c.id === selectedClassId;
            return (
              <button
                key={c.id}
                onClick={() => setSelectedClassId(c.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer shrink-0 border ${
                  isSelected
                    ? 'bg-amber-400 text-emerald-950 border-amber-300 font-bold shadow-xs'
                    : 'bg-emerald-900/60 hover:bg-emerald-800/80 text-emerald-100 border-emerald-700/60'
                }`}
              >
                <span className="font-urdu text-sm">{c.name}</span>
                <span className="text-[10px] font-mono opacity-80">({c.students?.length || 0})</span>
              </button>
            );
          })}
        </div>
      </header>

      {/* Floating Notification Toast: Fixed overlay that never shakes or shifts page layout */}
      {toastNotification && (
        <div
          dir="rtl"
          className={`fixed bottom-5 right-5 sm:bottom-6 sm:right-6 z-50 max-w-sm py-3 px-4 rounded-2xl shadow-2xl border text-xs sm:text-sm font-bold flex items-center justify-between gap-3 animate-fade-in ${
            toastNotification.type === 'error'
              ? 'bg-rose-900/95 text-white border-rose-700 backdrop-blur-md'
              : 'bg-emerald-950/95 text-white border-emerald-700 backdrop-blur-md'
          }`}
        >
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            {toastNotification.type === 'error' ? (
              <XCircle className="w-4 h-4 text-rose-300 shrink-0" />
            ) : (
              <CheckCircle className="w-4 h-4 text-emerald-300 shrink-0" />
            )}
            <span className="truncate leading-normal">{toastNotification.message}</span>
          </div>

          <button
            onClick={() => setToastNotification(null)}
            className="p-1 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors shrink-0 cursor-pointer"
            aria-label="بند کریں"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Main Viewport: Full screen responsive width (never squished into tablet size) */}
      <main className="w-full max-w-7xl 2xl:max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-5 space-y-5">
        {/* Pending Verification Notice for Principal Panel */}
        {isMadrasaPending && (
          <div className="p-4 sm:p-5 bg-gradient-to-r from-amber-500/10 via-amber-50 to-orange-50 border-2 border-amber-400 rounded-3xl shadow-xs space-y-3 font-urdu">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-xs mt-0.5">
                  <Clock className="w-5 h-5 animate-pulse" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-bold text-sm sm:text-base text-amber-950">
                      {isEn ? 'Status: Pending Verification' : 'حیثیت: زیر التوا تصدیق (Pending Verification)'}
                    </h3>
                    <span className="px-2.5 py-0.5 rounded-full bg-amber-200 text-amber-900 border border-amber-300 font-bold text-[11px]">
                      زیر جائزہ
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm text-amber-900/90 mt-1 leading-relaxed">
                    {isEn
                      ? 'Your registration details and academic records are under review by Central Admin. Once verified, all result features will be activated in your Principal Portal.'
                      : 'آپ کے تمام تر ریکارڈ اور رجسٹریشن کوائف کی مرکزی ایڈمنسٹریشن کی جانب سے جانچ و تصدیق کی جا رہی ہے۔ ایڈمن سے تصدیق (Verification) مکمل ہوتے ہی تمام تر سہولیات اور درجات کا مکمل ڈیٹا خودکار طور پر فعال ہو جائے گا۔'}
                  </p>
                </div>
              </div>

              {onBack && (
                <button
                  type="button"
                  onClick={handleAdminVerify}
                  disabled={isVerifying}
                  className="px-4 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs cursor-pointer shrink-0 disabled:opacity-50"
                >
                  <CheckCircle2 className="w-4 h-4 text-amber-300" />
                  <span>{isVerifying ? (isEn ? 'Verifying...' : 'تصدیق ہو رہی ہے...') : (isEn ? 'Verify & Approve Now' : 'ویریفائی کریں اور منظور کریں')}</span>
                </button>
              )}
            </div>
          </div>
        )}


        {/* ------------------------------------------------------------- */}
        {/* 1. DASHBOARD TAB (جائزہ) */}
        {/* ------------------------------------------------------------- */}
        {activeTab === 'dashboard' && (
          <div className="space-y-4 animate-fade-in font-urdu">
            {/* Top Stat Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {/* Card 1: Total Students */}
              <div
                onClick={() => setActiveTab('students')}
                className="bg-white p-3.5 rounded-2xl border border-stone-200/80 shadow-xs flex flex-col justify-between cursor-pointer hover:border-emerald-500 transition-all group"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-stone-500">
                    {selectedClassId === 'all' ? 'کل طلبہ (تمام درجات)' : 'اس درجے کے طلبہ'}
                  </span>
                  <div className="w-7 h-7 rounded-xl bg-emerald-50 text-emerald-800 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Users className="w-4 h-4" />
                  </div>
                </div>
                <div className="mt-2">
                  <span className="text-2xl font-bold font-mono text-emerald-950">{totalStudents}</span>
                  <span className="text-[10px] text-stone-500 block font-urdu truncate mt-0.5">
                    {selectedClassId === 'all'
                      ? `تمام ${madrasaClasses.length} درجات کا مجموعہ`
                      : 'منتخب کردہ درجہ'}
                  </span>
                </div>
              </div>

              {/* Card 2: Total Classes */}
              <div
                onClick={() => setActiveTab('classes')}
                className="bg-white p-3.5 rounded-2xl border border-stone-200/80 shadow-xs flex flex-col justify-between cursor-pointer hover:border-emerald-500 transition-all group"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-stone-500">کل درجات</span>
                  <div className="w-7 h-7 rounded-xl bg-amber-50 text-amber-800 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <BookOpen className="w-4 h-4" />
                  </div>
                </div>
                <div className="mt-2">
                  <span className="text-2xl font-bold font-mono text-stone-900">{madrasaClasses.length}</span>
                  <span className="text-[10px] text-stone-400 block font-urdu">فعال کلاسز</span>
                </div>
              </div>

              {/* Card 3: Pass % */}
              <div
                onClick={() => setActiveTab('results')}
                className="bg-white p-3.5 rounded-2xl border border-stone-200/80 shadow-xs flex flex-col justify-between cursor-pointer hover:border-emerald-500 transition-all group"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-stone-500">کامیابی فیصد</span>
                  <div className="w-7 h-7 rounded-xl bg-blue-50 text-blue-800 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <TrendingUp className="w-4 h-4" />
                  </div>
                </div>
                <div className="mt-2">
                  <span className="text-2xl font-bold font-mono text-blue-900">{passPercentage}%</span>
                  <span className="text-[10px] text-stone-400 block font-urdu">پاس طلبہ: {passCount}</span>
                </div>
              </div>

              {/* Card 4: Top Kaifiyat Mumtaz */}
              <div
                onClick={() => setActiveTab('results')}
                className="bg-white p-3.5 rounded-2xl border border-stone-200/80 shadow-xs flex flex-col justify-between cursor-pointer hover:border-emerald-500 transition-all group"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-stone-500">ممتاز درجہ</span>
                  <div className="w-7 h-7 rounded-xl bg-emerald-50 text-emerald-800 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Award className="w-4 h-4" />
                  </div>
                </div>
                <div className="mt-2">
                  <span className="text-2xl font-bold font-mono text-emerald-700">{mumtazCount}</span>
                  <span className="text-[10px] text-stone-400 block font-urdu">80% سے زائد</span>
                </div>
              </div>
            </div>

            {/* Quick Action Shortcuts */}
            <div className="bg-white rounded-3xl p-5 border border-stone-200/80 shadow-xs space-y-3">
              <span className="text-xs font-bold text-stone-800 font-urdu block">
                فوری کارروائیاں (Quick Actions)
              </span>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <button
                  onClick={() => {
                    setEditingStudent(null);
                    setIsStudentModalOpen(true);
                  }}
                  className="p-3 bg-emerald-50 hover:bg-emerald-100/80 border border-emerald-200 rounded-2xl flex flex-col items-center justify-center gap-1.5 transition-all cursor-pointer group text-emerald-950"
                >
                  <UserPlus className="w-5 h-5 text-emerald-700 group-hover:scale-110 transition-transform" />
                  <span className="text-xs font-bold">طالب علم کا نیا داخلہ</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsSheetWorkspaceOpen(true)}
                  className="p-3 bg-emerald-50 hover:bg-emerald-100/80 border border-emerald-200 rounded-2xl flex flex-col items-center justify-center gap-1.5 transition-all text-emerald-950 group cursor-pointer"
                >
                  <FileSpreadsheet className="w-5 h-5 text-emerald-700 group-hover:scale-110 transition-transform" />
                  <span className="text-xs font-bold">{isEn ? 'Result Entry & PDF' : 'آن لائن رزلٹ اندراج'}</span>
                </button>

                <button
                  onClick={() => setActiveTab('results')}
                  className="p-3 bg-stone-50 hover:bg-stone-100 border border-stone-200 rounded-2xl flex flex-col items-center justify-center gap-1.5 transition-all text-stone-800 group"
                >
                  <Award className="w-5 h-5 text-stone-700 group-hover:scale-110 transition-transform" />
                  <span className="text-xs font-bold">نتائج و رزلٹ کارڈز</span>
                </button>

                <button
                  onClick={() => setActiveTab('settings')}
                  className="p-3 bg-stone-50 hover:bg-stone-100 border border-stone-200 rounded-2xl flex flex-col items-center justify-center gap-1.5 transition-all text-stone-800 group"
                >
                  <Settings className="w-5 h-5 text-stone-700 group-hover:scale-110 transition-transform" />
                  <span className="text-xs font-bold">ترتیبات و پاسورڈ</span>
                </button>
              </div>
            </div>

            {/* Performance Kaifiyat Breakdown */}
            <div className="bg-white rounded-3xl p-5 border border-stone-200/80 shadow-xs space-y-3">
              <span className="text-xs font-bold text-stone-800 font-urdu block">
                نتائج کا خلاصہ بلحاظِ کیفیات (Grading Breakdown)
              </span>

              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-center text-xs">
                <div className="p-2.5 rounded-2xl bg-emerald-50 border border-emerald-200">
                  <div className="font-bold text-emerald-900">ممتاز</div>
                  <div className="text-base font-mono font-bold text-emerald-700 mt-0.5">{mumtazCount}</div>
                </div>
                <div className="p-2.5 rounded-2xl bg-blue-50 border border-blue-200">
                  <div className="font-bold text-blue-900">اعلیٰ</div>
                  <div className="text-base font-mono font-bold text-blue-700 mt-0.5">{aalaCount}</div>
                </div>
                <div className="p-2.5 rounded-2xl bg-amber-50 border border-amber-200">
                  <div className="font-bold text-amber-900">جید</div>
                  <div className="text-base font-mono font-bold text-amber-700 mt-0.5">{jayyidCount}</div>
                </div>
                <div className="p-2.5 rounded-2xl bg-stone-100 border border-stone-200">
                  <div className="font-bold text-stone-800">مقبول</div>
                  <div className="text-base font-mono font-bold text-stone-700 mt-0.5">{maqboolCount}</div>
                </div>
                <div className="p-2.5 rounded-2xl bg-rose-50 border border-rose-200">
                  <div className="font-bold text-rose-900">ناکام</div>
                  <div className="text-base font-mono font-bold text-rose-700 mt-0.5">{failCount}</div>
                </div>
                <div className="p-2.5 rounded-2xl bg-stone-50 border border-stone-200">
                  <div className="font-bold text-stone-600">غیر حاضر</div>
                  <div className="text-base font-mono font-bold text-stone-700 mt-0.5">{absentCount}</div>
                </div>
              </div>
            </div>

            {/* Top 10 Students */}
            {top10Students.length > 0 && (
              <div className="bg-white rounded-3xl p-5 border border-stone-200/80 shadow-xs space-y-3">
                <div className="flex items-center justify-between border-b border-stone-100 pb-2.5">
                  <span className="text-xs font-bold text-stone-800 flex items-center gap-1.5">
                    <Award className="w-4 h-4 text-amber-500" />
                    <span>مدرسے کے نمایاں 10 طلبہ (Top 10 Performers)</span>
                  </span>
                  <span className="text-[10px] text-stone-400 font-mono">Rank 1 to 10</span>
                </div>

                <div className="space-y-2">
                  {top10Students.map((s, idx) => (
                    <div
                      key={`top10-${s.cls.id}-${s.studentId || idx}-${idx}`}
                      className="flex items-center justify-between p-2.5 rounded-2xl bg-stone-50 border border-stone-100 text-xs"
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className={`w-6 h-6 rounded-full flex items-center justify-center font-bold font-mono text-xs ${
                            idx === 0
                              ? 'bg-amber-400 text-emerald-950 shadow-2xs'
                              : idx === 1
                              ? 'bg-stone-300 text-stone-800'
                              : idx === 2
                              ? 'bg-amber-700 text-white'
                              : 'bg-stone-200 text-stone-600'
                          }`}
                        >
                          {idx + 1}
                        </span>
                        <div>
                          <div className="font-bold text-stone-900">{ensureUrduName(s.studentName)}</div>
                          <div className="text-[10px] text-stone-500">
                            {s.cls.name} · ولدیت: {ensureUrduName(s.fatherName)}
                          </div>
                        </div>
                      </div>

                      <div className="text-left flex items-center gap-2">
                        <span className="font-mono font-bold text-emerald-800 text-sm">
                          {s.percentage}%
                        </span>
                        <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold border ${getKaifiyatBadgeClass(s.kaifiyat, madrasa.kaifiyatRules)}`}>
                          {s.kaifiyat}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* 2. CLASSES TAB (درجات) */}
        {/* ------------------------------------------------------------- */}
        {activeTab === 'classes' && (
          <div className="space-y-4 animate-fade-in font-urdu">
            <div className="bg-white p-4 rounded-3xl border border-stone-200/80 shadow-xs flex items-center justify-between">
              <div>
                <h3 className="font-bold text-base text-stone-900">
                  درجات و تعلیمی شعبہ جات (Classes &amp; Academic Sections)
                </h3>
                <p className="text-xs text-stone-500">
                  ہر درجے کا تعلیمی ریکارڈ اور رزلٹ مرکزی محفوظ نظام سے ہم آہنگ ہے
                </p>
              </div>
            </div>

            <div className="space-y-3">
              {madrasaClasses.map((cls) => {
                const studentCount = cls.students?.length || 0;
                const isPublished = cls.status === 'published';

                return (
                  <div
                    key={cls.id}
                    className="bg-white rounded-3xl p-4 sm:p-5 border border-stone-200/80 shadow-xs space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-800 flex items-center justify-center font-bold">
                          <BookOpen className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="font-bold text-base text-stone-900">{cls.name}</h4>
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                isPublished
                                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                  : 'bg-stone-100 text-stone-600 border border-stone-200'
                              }`}
                            >
                              {isPublished ? 'شائع شدہ (Published)' : 'غیر شائع (Draft)'}
                            </span>
                          </div>
                          <p className="text-xs text-stone-500 font-mono">
                            {cls.academicYear} · {studentCount} داخل شدہ طلبہ
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleToggleClassPublish(cls)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                            isPublished
                              ? 'bg-amber-100 hover:bg-amber-200 text-amber-900'
                              : 'bg-emerald-700 hover:bg-emerald-800 text-white'
                          }`}
                        >
                          {isPublished ? 'غیر شائع کریں' : 'رزلٹ شائع کریں'}
                        </button>
                      </div>
                    </div>

                    {/* Subjects in this class */}
                    {cls.testStatus?.subjects && cls.testStatus.subjects.length > 0 && (
                      <div className="pt-2 border-t border-stone-100">
                        <span className="text-[10px] text-stone-400 block mb-1">مضامین و کل نمبرات:</span>
                        <div className="flex flex-wrap gap-1.5">
                          {cls.testStatus.subjects.map((sub, sIdx) => (
                            <span
                              key={sIdx}
                              className="text-[11px] px-2 py-0.5 rounded-lg bg-stone-100 border border-stone-200 text-stone-700"
                            >
                              {sub.name} [{sub.maxMarks}]
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {madrasaClasses.length === 0 && (
                <div className="p-8 bg-white rounded-3xl text-center space-y-3 border border-stone-200/80">
                  <BookOpen className="w-10 h-10 text-stone-300 mx-auto" />
                  <p className="text-sm font-bold text-stone-600">اس مدرسے کے لیے ابھی کوئی درجہ تفویض نہیں ہے۔</p>
                  <p className="text-xs text-stone-400">مرکزی ایڈمن کی جانب سے درجات اور شیٹ تفویض کی جائے گی۔</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* 3. STUDENTS / ADMISSION TAB (داخلہ / طلبہ سمری) */}
        {/* ------------------------------------------------------------- */}
        {activeTab === 'students' && (
          <div className="space-y-4 animate-fade-in font-urdu">
            {/* Top Action Bar */}
            <div className="bg-white p-4 rounded-3xl border border-stone-200/80 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <h3 className="font-bold text-base text-stone-900">
                  طلبہ کا باضابطہ داخلہ و درجہ وار سمری (Student Admissions & Summary)
                </h3>
                <p className="text-xs text-stone-500">
                  داخلہ فارم کے ذریعے طالب علم کا اندراج باضابطہ محفوظ ہو جاتا ہے اور درجات کے اعداد و شمار یہاں ظاہر ہوتے ہیں
                </p>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => {
                    setEditingStudent(null);
                    setIsStudentModalOpen(true);
                  }}
                  disabled={!canAddStudents}
                  className="px-4 py-2.5 bg-emerald-800 hover:bg-emerald-900 text-white rounded-2xl text-xs font-bold shadow-xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <UserPlus className="w-4 h-4 text-amber-300" />
                  <span>+ طالب علم کا نیا داخلہ (New Admission)</span>
                </button>
              </div>
            </div>

            {/* Information Notice: Student Records strictly Central & Secure */}
            <div className="p-4 bg-emerald-50/70 border border-emerald-200 rounded-3xl flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-emerald-700 text-white flex items-center justify-center shrink-0">
                <ShieldCheck className="w-5 h-5 text-amber-300" />
              </div>
              <div className="text-xs text-emerald-950 leading-relaxed">
                <strong className="block text-sm font-urdu">
                  باضابطہ امتحانی و تعلیمی ریکارڈ
                </strong>
                <span>
                  طلبہ کا مکمل تفصیلی ریکارڈ، امتحانی کوائف اور تعلیمی نتائج مرکزی محفوظ کلاؤڈ سسٹم میں محفوظ رہتے ہیں۔ پورٹل انٹرفیس پر درجات کے حساب سے طلبہ کی کل تعداد اور خلاصہ پیش کیا جاتا ہے۔
                </span>
              </div>
            </div>

            {/* Class-wise Student Count Cards (e.g. حفظ: 12، سال اول: 25) */}
            <div className="bg-white rounded-3xl p-5 border border-stone-200/80 shadow-xs space-y-3">
              <div className="flex items-center justify-between border-b border-stone-100 pb-2.5">
                <span className="font-bold text-sm text-stone-900 flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-emerald-700" />
                  <span>درجہ وار داخل طلبہ کی سمری و تعداد ({madrasaClasses.length} درجات)</span>
                </span>
                <span className="text-xs font-mono font-bold text-emerald-900 bg-emerald-100 px-3 py-1 rounded-full">
                  کل طلبہ: {allStudents.length}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {madrasaClasses.map((cls) => {
                  const clsStudents = cls.students || [];
                  const passedCount = clsStudents.filter((s) => s.kaifiyat !== 'ناکام' && !s.isAbsent).length;
                  const mumtazCount = clsStudents.filter((s) => s.kaifiyat === 'ممتاز').length;
                  const passPct = clsStudents.length > 0 ? ((passedCount / clsStudents.length) * 100).toFixed(0) : '0';

                  return (
                    <div
                      key={cls.id}
                      className="p-4 rounded-2xl bg-stone-50 border border-stone-200/80 hover:border-emerald-300 transition-all space-y-3 flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2 border-b border-stone-200/60 pb-2">
                          <h4 className="font-bold text-sm text-stone-900">{cls.name}</h4>
                          <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-900 border border-emerald-300">
                            {clsStudents.length} طلبہ
                          </span>
                        </div>

                        <div className="grid grid-cols-3 gap-1.5 pt-2 text-center text-xs">
                          <div className="bg-white p-2 rounded-xl border border-stone-200">
                            <span className="text-[10px] text-stone-400 block font-urdu">کامیاب</span>
                            <span className="font-bold text-emerald-700 font-mono">{passedCount}</span>
                          </div>
                          <div className="bg-white p-2 rounded-xl border border-stone-200">
                            <span className="text-[10px] text-stone-400 block font-urdu">ممتاز</span>
                            <span className="font-bold text-amber-700 font-mono">{mumtazCount}</span>
                          </div>
                          <div className="bg-white p-2 rounded-xl border border-stone-200">
                            <span className="text-[10px] text-stone-400 block font-urdu">کامیابی %</span>
                            <span className="font-bold text-teal-800 font-mono">{passPct}%</span>
                          </div>
                        </div>
                      </div>

                      <div className="pt-1 flex items-center justify-between gap-2 border-t border-stone-200/60 text-xs">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedClassId(cls.id);
                            setEditingStudent(null);
                            setIsStudentModalOpen(true);
                          }}
                          disabled={!canAddStudents}
                          className="px-2.5 py-1 bg-emerald-800 hover:bg-emerald-900 text-white rounded-xl text-[11px] font-bold transition-all cursor-pointer disabled:opacity-50"
                        >
                          + اس میں داخلہ
                        </button>
                      </div>
                    </div>
                  );
                })}

                {madrasaClasses.length === 0 && (
                  <div className="col-span-full p-8 text-center text-stone-500 bg-stone-50 rounded-2xl border border-dashed border-stone-300">
                    <p className="text-xs font-semibold">اس ادارے میں ابھی کوئی درجہ رجسٹر نہیں ہے۔</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* 4. RESULTS TAB (نتائج) */}
        {/* ------------------------------------------------------------- */}
        {activeTab === 'results' && (() => {
          // Compute filtered list based on resultsDarjaFilter and resultsSearchQuery
          const targetClassesForResults = resultsDarjaFilter === 'all'
            ? madrasaClasses
            : madrasaClasses.filter((c) => c.id === resultsDarjaFilter);

          const resultsStudentsList = targetClassesForResults.flatMap((c) =>
            (c.students || []).map((s) => ({ ...s, cls: c }))
          ).filter((st) => {
            if (!resultsSearchQuery.trim()) return true;
            const q = resultsSearchQuery.toLowerCase().trim();
            return (
              (st.studentId || '').toLowerCase().includes(q) ||
              (st.studentName || '').toLowerCase().includes(q) ||
              (st.studentNameEn || '').toLowerCase().includes(q) ||
              (st.fatherName || '').toLowerCase().includes(q) ||
              (st.fatherNameEn || '').toLowerCase().includes(q)
            );
          });

          const totalMadrasaStudents = madrasaClasses.reduce((acc, c) => acc + (c.students?.length || 0), 0);

          return (
            <div className="space-y-4 animate-fade-in font-urdu">
              {/* Results Action & Filter Bar (Clean single bar, no redundant notes) */}
              <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-stone-200/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3 font-urdu">
                {/* Right: Result Logic Button + Darja Dropdown (No 'درجہ منتخب فرمائیں' label) */}
                <div className="flex items-center gap-2.5 flex-wrap sm:flex-nowrap flex-1">
                  {/* رزلٹ لاجک بٹن */}
                  <button
                    type="button"
                    onClick={() => setIsKaifiyatModalOpen(true)}
                    className="px-3.5 py-2 bg-purple-50 hover:bg-purple-100 text-purple-950 border border-purple-300 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-2xs transition-colors shrink-0"
                    title={isEn ? 'Configure Result Logic' : 'رزلٹ لاجک و گریڈنگ قواعد'}
                  >
                    <Sliders className="w-3.5 h-3.5 text-purple-700" />
                    <span>رزلٹ لاجک</span>
                    <span className={`text-[10px] px-1.5 py-0.2 rounded font-bold ${
                      currentMadrasa.hasCustomResultLogic
                        ? 'bg-amber-100 text-amber-800 border border-amber-300'
                        : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                    }`}>
                      {currentMadrasa.hasCustomResultLogic ? 'ذاتی' : 'مرکزی'}
                    </span>
                  </button>

                  {/* Darja (Class) Dropdown */}
                  <select
                    id="results-darja-select"
                    value={resultsDarjaFilter}
                    onChange={(e) => setResultsDarjaFilter(e.target.value)}
                    className="flex-1 min-w-[180px] max-w-sm px-3.5 py-2 bg-stone-50 border border-stone-300 rounded-xl text-xs font-bold text-stone-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600 transition-all cursor-pointer"
                  >
                    <option value="all">
                      تمام درجات ({totalMadrasaStudents} طلبہ)
                    </option>
                    {madrasaClasses.map((cls) => (
                      <option key={`res-opt-${cls.id}`} value={cls.id}>
                        {cls.name} ({cls.students?.length || 0} طلبہ)
                      </option>
                    ))}
                  </select>
                </div>

                {/* Left: Search Input + Live Refresh */}
                <div className="flex items-center gap-2.5">
                  <div className="w-full sm:w-56 relative">
                    <input
                      type="text"
                      placeholder="آئی ڈی یا نام سے تلاش..."
                      value={resultsSearchQuery}
                      onChange={(e) => setResultsSearchQuery(e.target.value)}
                      className="w-full px-3.5 py-2 pr-8 bg-stone-50 border border-stone-300 rounded-xl text-xs text-stone-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
                    />
                    <div className="absolute inset-y-0 right-0 pr-2.5 flex items-center pointer-events-none text-stone-400">
                      <Search className="w-3.5 h-3.5" />
                    </div>
                    {resultsSearchQuery && (
                      <button
                        onClick={() => setResultsSearchQuery('')}
                        className="absolute inset-y-0 left-0 pl-2.5 flex items-center text-stone-400 hover:text-stone-700 text-xs font-bold cursor-pointer"
                      >
                        ✕
                      </button>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsSheetWorkspaceOpen(true)}
                    className="px-3.5 py-2 bg-amber-400 hover:bg-amber-300 text-stone-950 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors shrink-0 border border-amber-500/40"
                    title={isEn ? 'Open Full-Screen Result Editor & PDF' : 'پوری اسکرین پر رزلٹ جدول کھولیں، نمبرات درج کریں اور پی ڈی ایف ڈاؤن لوڈ کریں'}
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-900" />
                    <span>{isEn ? 'Result Entry & PDF' : 'رزلٹ اندراج / Result PDF'}</span>
                  </button>

                  <button
                    onClick={handleSyncFromSheet}
                    disabled={isSyncingSheet}
                    className="px-3.5 py-2 bg-emerald-800 hover:bg-emerald-900 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors disabled:opacity-50 shrink-0"
                    title="کلاؤڈ ریکارڈ سے فوراً تازہ ترین ڈیٹا سنک کریں"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 text-amber-300 ${isSyncingSheet ? 'animate-spin' : ''}`} />
                    <span>{isSyncingSheet ? 'سنک ہو رہا ہے...' : 'لائیو ریفریش'}</span>
                  </button>
                </div>
              </div>

              {/* Line-by-Line Complete Student Results Directory - Strict 1 line RTL */}
              <div className="bg-white rounded-3xl border border-stone-200/80 shadow-xs overflow-hidden">
                <div
                  dir="rtl"
                  className="p-3.5 bg-stone-100/90 border-b border-stone-200/80 flex items-center justify-between text-xs text-stone-700 font-bold whitespace-nowrap"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <span className="w-24 shrink-0 text-center font-bold text-stone-600">اسٹوڈنٹ آئی ڈی</span>
                    <span className="truncate">طالب علم کا نام</span>
                  </div>
                  <div className="flex items-center gap-3 sm:gap-4 shrink-0 text-center">
                    <span className="w-14 shrink-0">فیصد</span>
                    <span className="w-16 shrink-0">کیفیت</span>
                    <span className="w-10 shrink-0">پریویو</span>
                  </div>
                </div>

                {resultsStudentsList.length === 0 ? (
                  <div className="p-10 text-center text-stone-400 space-y-2.5">
                    <FileSpreadsheet className="w-10 h-10 mx-auto text-stone-300" />
                    <p className="text-xs font-bold text-stone-600">
                      اس درجہ میں کوئی طالب علم کا ریکارڈ نہیں ملا۔
                    </p>
                    <p className="text-[11px] text-stone-400">
                      اگر آن لائن کلاؤڈ ریکارڈ میں نیا نام یا رزلٹ درج کیا ہے تو اوپر "لائیو ریفریش (Sync Data)" پر کلک فرمائیں۔
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-stone-100 max-h-[70vh] overflow-y-auto">
                    {resultsStudentsList.map((st, idx) => {
                      const stPercent = typeof st.percentage === 'number'
                        ? st.percentage
                        : parseFloat(String(st.percentage)) || 0;
                      const isStudentAbsent = Boolean(st.isAbsent) || (Array.isArray(st.subjects) && st.subjects.some((sub: any) => sub.isAbsent === true || sub.obtainedMarks === 'غ' || isAbsentCell(sub.obtainedMarks)));
                      const kaifiyat = isStudentAbsent
                        ? (madrasa.passingSettings?.absentFailLabel || 'ناکام')
                        : (st.kaifiyat || (stPercent >= 80 ? 'ممتاز' : stPercent >= 60 ? 'اعلیٰ' : stPercent >= 50 ? 'جید' : stPercent >= 33 ? 'مقبول' : 'ناکام'));

                      return (
                        <div
                          key={`st-res-row-${st.cls.id}-${st.studentId || idx}-${idx}`}
                          dir="rtl"
                          className="h-12 px-3 sm:px-4 hover:bg-emerald-50/50 transition-colors flex items-center justify-between gap-3 text-xs whitespace-nowrap"
                        >
                          {/* 1. اسٹوڈنٹ آئی ڈی + 2. طالب نام */}
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <span className="w-24 shrink-0 font-mono font-black text-xs px-2.5 py-1 rounded-lg bg-stone-100 text-stone-900 border border-stone-300 text-center tracking-wider">
                              {st.studentId}
                            </span>
                            <span className="font-bold text-sm text-stone-900 truncate" title={ensureUrduName(st.studentName)}>
                              {ensureUrduName(st.studentName)}
                            </span>
                          </div>

                          {/* 3. فیصد + 4. کیفیت + 5. پریویو آئکن */}
                          <div className="flex items-center gap-3 sm:gap-4 shrink-0">
                            {/* فیصد */}
                            <span className="w-14 text-center font-mono font-bold text-xs text-stone-800 px-1.5 py-0.5 bg-stone-100 rounded-md shrink-0">
                              {stPercent}%
                            </span>

                            {/* کیفیت */}
                            <span
                              className={`w-18 text-center text-xs px-2 py-0.5 rounded-lg font-bold border shrink-0 ${getKaifiyatBadgeClass(kaifiyat, madrasa.kaifiyatRules)}`}
                            >
                              {kaifiyat}
                            </span>

                            {/* پریویو آئکن */}
                            <button
                              type="button"
                              onClick={() =>
                                setPreviewStudent({
                                  student: isStudentAbsent
                                    ? {
                                        ...st,
                                        isAbsent: true,
                                        kaifiyat: madrasa.passingSettings?.absentFailLabel || 'ناکام',
                                      }
                                    : st,
                                  cls: st.cls,
                                })
                              }
                              className="w-10 h-8 flex items-center justify-center text-emerald-800 hover:text-white hover:bg-emerald-800 rounded-lg transition-colors cursor-pointer shrink-0 border border-emerald-300 bg-emerald-50/60"
                              title="پریویو رزلٹ کارڈ"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {/* ------------------------------------------------------------- */}
        {/* 5. SETTINGS TAB (ترتیبات) */}
        {/* ------------------------------------------------------------- */}
        {activeTab === 'settings' && (
          <div className="space-y-4 animate-fade-in font-urdu">
            {/* Madrasa Information Card */}
            <div className="bg-white rounded-3xl p-5 border border-stone-200/80 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-stone-100 pb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-800 flex items-center justify-center font-bold">
                    <Building2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-base text-stone-900">{madrasa.urduName}</h3>
                    <p className="text-xs text-stone-500 font-mono">
                      Code: {madrasa.code} · Serial: #{madrasa.serialNumber}
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="p-3 bg-stone-50 rounded-2xl border border-stone-100">
                  <span className="text-[10px] text-stone-400 block font-bold uppercase">انگریزی نام:</span>
                  <span className="font-semibold text-stone-800 mt-0.5 block">{madrasa.englishName}</span>
                </div>

                <div className="p-3 bg-stone-50 rounded-2xl border border-stone-100">
                  <span className="text-[10px] text-stone-400 block font-bold uppercase">پتہ و مقام:</span>
                  <span className="font-semibold text-stone-800 mt-0.5 block">{madrasa.address}</span>
                </div>

                <div className="p-3 bg-stone-50 rounded-2xl border border-stone-100">
                  <span className="text-[10px] text-stone-400 block font-bold uppercase">رابطہ و فون:</span>
                  <span className="font-mono text-stone-800 mt-0.5 block">{madrasa.principalPhone || 'نامعلوم'}</span>
                </div>

                <div className="p-3 bg-stone-50 rounded-2xl border border-stone-100">
                  <span className="text-[10px] text-stone-400 block font-bold uppercase">پرنسپل آئی ڈی:</span>
                  <span className="font-mono font-bold text-emerald-900 mt-0.5 block">{madrasa.principalId || madrasa.code}</span>
                </div>
              </div>
            </div>

            {/* 3. Madrasa Result Logic & Passing Rules Card */}
            {(() => {
              const effectiveLogic = getEffectiveMadrasaResultLogic(currentMadrasa);
              return (
                <div className="bg-white rounded-3xl p-5 border border-stone-200/80 shadow-xs space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-stone-100 pb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-purple-50 text-purple-800 border border-purple-200 flex items-center justify-center font-bold shrink-0">
                        <Sliders className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-base text-stone-900">
                            {isEn ? 'Result Logic & Passing Policy' : 'امتحانی رزلٹ لاجک و گریڈنگ ضوابط'}
                          </h3>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                            currentMadrasa.hasCustomResultLogic
                              ? 'bg-amber-100 text-amber-800 border-amber-300'
                              : 'bg-emerald-100 text-emerald-800 border-emerald-300'
                          }`}>
                            {currentMadrasa.hasCustomResultLogic
                              ? (isEn ? 'Custom Logic' : 'مخصوص ذاتی لاجک فعال ہے')
                              : (isEn ? 'Central Default' : 'مرکزی ڈیفالٹ لاگو ہے')}
                          </span>
                        </div>
                        <p className="text-xs text-stone-500 mt-0.5">
                          {isEn
                            ? 'Configure customized grading thresholds, passing percentages and fail statuses for your institution.'
                            : 'اپنے مدرسہ کے لیے مخصوص گریڈنگ حدود (ممتاز، اعلیٰ، جید، مقبول) اور پاسنگ ضوابط سیٹ فرمائیں۔'}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {currentMadrasa.hasCustomResultLogic && (
                        <button
                          type="button"
                          onClick={handleResetToCentralDefaults}
                          className="px-3.5 py-2 bg-stone-100 hover:bg-stone-200 text-stone-800 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
                          title="مرکزی عمومی ڈیفالٹ ضوابط پر واپس جائیں"
                        >
                          <RotateCcw className="w-3.5 h-3.5 text-stone-600" />
                          <span>مرکزی ڈیفالٹ بحال کریں</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setIsKaifiyatModalOpen(true)}
                        className="px-4 py-2 bg-purple-700 hover:bg-purple-800 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors"
                      >
                        <Sliders className="w-3.5 h-3.5 text-purple-200" />
                        <span>{isEn ? 'Edit Result Logic' : 'قواعد تبدیل / سیٹ کریں'}</span>
                      </button>
                    </div>
                  </div>

                  {/* Summary of active rules */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                    <div className="p-3 bg-purple-50/60 rounded-2xl border border-purple-100">
                      <span className="text-[10px] text-purple-600 block font-bold uppercase">کامیابی کی شرط (Passing %):</span>
                      <span className="text-sm font-bold text-purple-950 mt-0.5 block">{effectiveLogic.passing.passingPercentage}% یا زائد</span>
                    </div>

                    <div className="p-3 bg-stone-50 rounded-2xl border border-stone-100">
                      <span className="text-[10px] text-stone-500 block font-bold uppercase">ایک پرچے میں فیل:</span>
                      <span className="text-xs font-bold text-stone-800 mt-0.5 block">{effectiveLogic.passing.oneSubjectFailLabel || 'مجاز'}</span>
                    </div>

                    <div className="p-3 bg-stone-50 rounded-2xl border border-stone-100">
                      <span className="text-[10px] text-stone-500 block font-bold uppercase">دو یا زائد میں فیل:</span>
                      <span className="text-xs font-bold text-rose-700 mt-0.5 block">{effectiveLogic.passing.twoOrMoreFailLabel || 'ناکام'}</span>
                    </div>

                    <div className="p-3 bg-stone-50 rounded-2xl border border-stone-100">
                      <span className="text-[10px] text-stone-500 block font-bold uppercase">غیر حاضر (Absent):</span>
                      <span className="text-xs font-bold text-rose-700 mt-0.5 block">{effectiveLogic.passing.absentFailLabel || 'ناکام'}</span>
                    </div>
                  </div>

                  {/* Active Kaifiyat Brackets */}
                  <div className="p-3 bg-stone-50 rounded-2xl border border-stone-100">
                    <span className="text-[11px] font-bold text-stone-700 block mb-2">فعال درجاتِ کیفیت (Grading Brackets):</span>
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      {effectiveLogic.rules.map((r) => (
                        <div
                          key={r.id}
                          className="px-2.5 py-1 rounded-xl bg-white border border-stone-200 shadow-2xs flex items-center gap-1.5 font-bold"
                        >
                          <span className="text-emerald-800">{r.title}</span>
                          <span className="text-[10px] text-stone-500 font-mono">
                            ({r.minPercentage}% - {r.maxPercentage || 100}%)
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Change Password Card */}
            <div className="bg-white rounded-3xl p-5 border border-stone-200/80 shadow-xs space-y-4">
              <div className="flex items-center gap-3 border-b border-stone-100 pb-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-800 flex items-center justify-center font-bold">
                  <KeyRound className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-stone-900">پرنسپل لاگ ان پاسورڈ تبدیل کریں</h3>
                  <p className="text-xs text-stone-500">اپنے اکاؤنٹ کو محفوظ رکھنے کے لیے نیا پاسورڈ منتخب فرمائیں</p>
                </div>
              </div>

              <form onSubmit={handleChangePassword} className="space-y-3.5 max-w-md">
                {passwordMessage && (
                  <div
                    className={`p-3 rounded-xl text-xs font-semibold flex items-center gap-2 ${
                      passwordMessage.type === 'success'
                        ? 'bg-emerald-50 text-emerald-800 border border-emerald-300'
                        : 'bg-rose-50 text-rose-800 border border-rose-300'
                    }`}
                  >
                    {passwordMessage.type === 'success' ? (
                      <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                    ) : (
                      <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                    )}
                    <span>{passwordMessage.text}</span>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">
                    موجودہ (پرانا) پاسورڈ <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type={showPasswordText ? 'text' : 'password'}
                    dir="ltr"
                    value={oldPassword}
                    onChange={(e) => setOldPassword(e.target.value)}
                    placeholder="Enter current password"
                    className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-xl text-xs font-mono text-stone-900 focus:bg-white focus:ring-2 focus:ring-emerald-600 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">
                    نیا پاسورڈ (کم از کم 4 حروف) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type={showPasswordText ? 'text' : 'password'}
                    dir="ltr"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter new password"
                    className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-xl text-xs font-mono text-stone-900 focus:bg-white focus:ring-2 focus:ring-emerald-600 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">
                    نئے پاسورڈ کی تصدیق کریں <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type={showPasswordText ? 'text' : 'password'}
                    dir="ltr"
                    value={confirmNewPassword}
                    onChange={(e) => setConfirmNewPassword(e.target.value)}
                    placeholder="Confirm new password"
                    className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-xl text-xs font-mono text-stone-900 focus:bg-white focus:ring-2 focus:ring-emerald-600 focus:outline-none"
                  />
                </div>

                <div className="flex items-center justify-between pt-1">
                  <label className="flex items-center gap-2 text-xs text-stone-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showPasswordText}
                      onChange={(e) => setShowPasswordText(e.target.checked)}
                      className="rounded border-stone-300 text-emerald-700"
                    />
                    <span>پاسورڈ ظاہر کریں</span>
                  </label>

                  <button
                    type="submit"
                    disabled={isSubmittingPassword}
                    className="px-5 py-2 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-bold shadow-xs transition-colors disabled:opacity-60 cursor-pointer"
                  >
                    {isSubmittingPassword ? 'محفوظ ہو رہا ہے...' : 'پاسورڈ تبدیل کریں'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>

      {/* ------------------------------------------------------------- */}
      {/* Bottom Sticky Navigation Bar - Mobile/Tablet only (lg:hidden) */}
      {/* ------------------------------------------------------------- */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-stone-200/90 shadow-lg px-2 py-1.5 font-sans" dir="ltr">
        <div className="max-w-md mx-auto grid grid-cols-5 gap-1 text-center">
          {/* 1. Dashboard (جائزہ) */}
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`flex flex-col items-center justify-center py-1 rounded-2xl transition-all cursor-pointer ${
              activeTab === 'dashboard'
                ? 'text-emerald-800 font-bold scale-105'
                : 'text-stone-400 hover:text-stone-700'
            }`}
          >
            <div
              className={`p-1 rounded-xl transition-all ${
                activeTab === 'dashboard' ? 'bg-emerald-100 text-emerald-900' : ''
              }`}
            >
              <LayoutDashboard className="w-5 h-5" />
            </div>
            <span className={`text-[10px] tracking-tight mt-0.5 ${isEn ? 'font-sans' : 'font-urdu'}`}>
              {isEn ? 'Overview' : 'جائزہ'}
            </span>
          </button>

          {/* 2. Classes (درجات) */}
          <button
            onClick={() => setActiveTab('classes')}
            className={`flex flex-col items-center justify-center py-1 rounded-2xl transition-all cursor-pointer ${
              activeTab === 'classes'
                ? 'text-emerald-800 font-bold scale-105'
                : 'text-stone-400 hover:text-stone-700'
            }`}
          >
            <div
              className={`p-1 rounded-xl transition-all ${
                activeTab === 'classes' ? 'bg-emerald-100 text-emerald-900' : ''
              }`}
            >
              <BookOpen className="w-5 h-5" />
            </div>
            <span className={`text-[10px] tracking-tight mt-0.5 ${isEn ? 'font-sans' : 'font-urdu'}`}>
              {isEn ? 'Classes' : 'درجات'}
            </span>
          </button>

          {/* 3. Students / Admission (داخلہ و طلبہ) */}
          <button
            onClick={() => setActiveTab('students')}
            className={`flex flex-col items-center justify-center py-1 rounded-2xl transition-all cursor-pointer ${
              activeTab === 'students'
                ? 'text-emerald-800 font-bold scale-105'
                : 'text-stone-400 hover:text-stone-700'
            }`}
          >
            <div
              className={`p-1 rounded-xl transition-all ${
                activeTab === 'students' ? 'bg-emerald-100 text-emerald-900' : ''
              }`}
            >
              <Users className="w-5 h-5" />
            </div>
            <span className={`text-[10px] tracking-tight mt-0.5 ${isEn ? 'font-sans' : 'font-urdu'}`}>
              {isEn ? 'Students' : 'داخلہ و طلبہ'}
            </span>
          </button>

          {/* 4. Results (نتائج) */}
          <button
            onClick={() => setActiveTab('results')}
            className={`flex flex-col items-center justify-center py-1 rounded-2xl transition-all cursor-pointer ${
              activeTab === 'results'
                ? 'text-emerald-800 font-bold scale-105'
                : 'text-stone-400 hover:text-stone-700'
            }`}
          >
            <div
              className={`p-1 rounded-xl transition-all ${
                activeTab === 'results' ? 'bg-emerald-100 text-emerald-900' : ''
              }`}
            >
              <Award className="w-5 h-5" />
            </div>
            <span className={`text-[10px] tracking-tight mt-0.5 ${isEn ? 'font-sans' : 'font-urdu'}`}>
              {isEn ? 'Results' : 'نتائج'}
            </span>
          </button>

          {/* 5. Settings (ترتیبات) */}
          <button
            onClick={() => setActiveTab('settings')}
            className={`flex flex-col items-center justify-center py-1 rounded-2xl transition-all cursor-pointer ${
              activeTab === 'settings'
                ? 'text-emerald-800 font-bold scale-105'
                : 'text-stone-400 hover:text-stone-700'
            }`}
          >
            <div
              className={`p-1 rounded-xl transition-all ${
                activeTab === 'settings' ? 'bg-emerald-100 text-emerald-900' : ''
              }`}
            >
              <KeyRound className="w-5 h-5" />
            </div>
            <span className={`text-[10px] tracking-tight mt-0.5 ${isEn ? 'font-sans' : 'font-urdu'}`}>
              {isEn ? 'Settings' : 'ترتیبات'}
            </span>
          </button>
        </div>
      </nav>

      {/* ------------------------------------------------------------- */}
      {/* Student Form Modal (Only Student Info, Sequential ID, No Marks) */}
      {/* ------------------------------------------------------------- */}
      {isStudentModalOpen && (
        <StudentFormModal
          isOpen={isStudentModalOpen}
          onClose={() => {
            setIsStudentModalOpen(false);
            setEditingStudent(null);
          }}
          onSave={handleSaveStudent}
          madrasa={madrasa}
          classes={madrasaClasses}
          existingStudent={editingStudent}
        />
      )}

      {/* ------------------------------------------------------------- */}
      {/* Result Card Preview Modal - Ultra-compact header for max card space */}
      {/* ------------------------------------------------------------- */}
      {previewStudent && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-1.5 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl sm:rounded-3xl max-w-2xl w-full p-2 sm:p-4 shadow-2xl my-auto">
            <div className="flex items-center justify-between border-b border-stone-200 pb-1.5 mb-2 px-1 gap-2" dir="rtl">
              <div className="flex items-center gap-1.5 min-w-0 overflow-hidden whitespace-nowrap">
                <span className="font-urdu font-bold text-stone-900 text-xs sm:text-sm">
                  رزلٹ کارڈ پیش نظارہ
                </span>
                <span className="text-[10px] sm:text-xs font-sans text-stone-500 font-normal" dir="ltr">
                  (Preview)
                </span>
              </div>
              <button
                onClick={() => setPreviewStudent(null)}
                className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-stone-100 hover:bg-stone-200 text-stone-700 flex items-center justify-center cursor-pointer shrink-0 transition-colors"
                title="بند کریں"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="max-h-[88vh] overflow-y-auto">
              <ResultCard
                student={previewStudent.student}
                madrasa={madrasa}
                madrasaClass={previewStudent.cls}
                lang={lang}
              />
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* Kaifiyat & Result Logic Modal */}
      {/* ------------------------------------------------------------- */}
      {isKaifiyatModalOpen && (
        <KaifiyatSettingsModal
          isOpen={isKaifiyatModalOpen}
          onClose={() => setIsKaifiyatModalOpen(false)}
          onSave={handleSaveKaifiyat}
          madrasa={currentMadrasa}
        />
      )}

      {/* Manager Full Registration Form Review & Verification Modal */}
      {isManagerReviewModalOpen && (
        <ManagerVerificationModal
          madrasa={currentMadrasa}
          classes={classes}
          isOpen={isManagerReviewModalOpen}
          onClose={() => setIsManagerReviewModalOpen(false)}
          onVerified={async (updated) => {
            setCurrentMadrasa(updated);
            if (onRefreshData) await onRefreshData();
            showToast('مدرسہ کی تصدیق کامیابی سے مکمل ہو گئی!');
          }}
        />
      )}

      {/* Full-Screen Google Sheet Workspace Modal */}
      {isSheetWorkspaceOpen && (
        <GoogleSheetWorkspace
          madrasa={currentMadrasa}
          portalClasses={madrasaClasses}
          onClose={() => setIsSheetWorkspaceOpen(false)}
          onSaved={(updatedClasses) => {
            if (Array.isArray(updatedClasses) && updatedClasses.length > 0) {
              setPortalClasses((prev) => {
                const map = new Map(prev.map((c) => [c.id, c]));
                for (const u of updatedClasses) {
                  map.set(u.id, u);
                }
                return Array.from(map.values());
              });
            }
            if (onRefreshData) onRefreshData();
          }}
        />
      )}

      {/* ------------------------------------------------------------- */}
    </div>
  );
};
