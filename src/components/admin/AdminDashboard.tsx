/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Madrasa, MadrasaClass, StudentResult, KaifiyatRule, PassingSettings, StateManager, PortalLaunchTimer } from '../../types';
import {
  getStoredMadaris,
  saveStoredMadaris,
  getStoredClasses,
  saveStoredClasses,
  resetToDefaults,
  syncWithServer,
  syncMadrasaGoogleSheet,
  syncAllMadarisGoogleSheets,
  persistMadrasa,
  deleteMadrasaFromServer,
  persistClass,
  deleteClassFromServer,
  checkServerStatus,
  getResultAdminPin,
  setResultAdminPin,
  getStoredDefaultClasses,
  saveStoredDefaultClasses,
  fetchStoredDefaultClasses,
  DEFAULT_CLASSES_UPDATED_EVENT,
  DEFAULT_REGISTRATION_CLASSES,
  verifyAndApproveMadrasa,
  saveCentralResultLogic,
  getCentralKaifiyatRules,
  getCentralPassingSettings,
  saveMadrasaCustomResultLogic,
  resetMadrasaToCentralResultLogic,
  toggleMadrasaResultsVisibility,
  fetchStateManagers,
  getDeletedMadrasaIds,
  addDeletedMadrasaId,
  fetchFeedbacks,
  clearAllMadarisFromServer,
  fetchCentralSheetUrl,
  saveCentralSheetUrl,
  fetchCentralExamTitle,
  saveCentralExamTitle,
  DEFAULT_EXAM_TITLE_UPDATED_EVENT,
  getPortalLogo,
  getStoredLaunchTimer,
  fetchLaunchTimer,
  saveStoredLaunchTimer,
  LAUNCH_TIMER_UPDATED_EVENT,
  CENTRAL_SETTINGS_UPDATED_EVENT,
  fetchSheetEditorScriptUrl,
  saveSheetEditorScriptUrl,
} from '../../utils/storage';
import { parseSheetData, isAbsentCell } from '../../utils/sheetParser';
import { buildMastersCsv, buildClassTabCsv, DEFAULT_CLASS_SUBJECTS } from '../../utils/sheetGenerator';
import { createLiveGoogleSheetInDrive, createAndAttachSheetForMadrasa, MAYAAR_DRIVE_FOLDER_URL } from '../../services/googleSheetsService';
import { DEFAULT_APPS_SCRIPT_URL, registerMadrasaWorkflow, getUnifiedAppsScriptCode, getCentralSheetAppsScriptCode, getStandaloneSheetEditorAppsScriptCode, sanitizeAppsScriptUrl } from '../../services/appsScriptService';
import { MadrasaFormModal } from './MadrasaFormModal';
import { ClassFormModal } from './ClassFormModal';
import { KaifiyatSettingsModal } from './KaifiyatSettingsModal';
import { PortalLogoModal } from './PortalLogoModal';
import { LaunchCountdownModal } from '../common/LaunchCountdownModal';
import { StudentFormModal } from './StudentFormModal';
import { PrincipalPortal } from './PrincipalPortal';
import { ResultCard } from '../public/ResultCard';
import { ManagerVerificationModal } from './ManagerVerificationModal';
import { StateManagersTab } from './StateManagersTab';
import { FeedbackTab } from './tabs/FeedbackTab';
import { Language, translations } from '../../utils/translations';
import { cleanInstitutionName, ensureUrduName } from '../../utils/transliterate';
import { isStudentEligibleForTopPerformers, getKaifiyatBadgeClass } from '../../utils/kaifiyatStyles';
import { isFirestoreQuotaExceeded } from '../../firebase';
import {
  LayoutDashboard,
  Building2,
  Users,
  Award,
  MoreHorizontal,
  Plus,
  Search,
  Filter,
  Sliders,
  CheckCircle2,
  XCircle,
  Clock,
  FileSpreadsheet,
  RefreshCw,
  ExternalLink,
  Edit,
  Trash2,
  Download,
  Lock,
  Unlock,
  ShieldAlert,
  ChevronRight,
  ChevronLeft,
  X,
  Sparkles,
  ArrowUpRight,
  TrendingUp,
  FileText,
  UserCheck,
  GraduationCap,
  Globe,
  Settings,
  Shield,
  Layers,
  Check,
  Activity,
  UserPlus,
  BookOpen,
  KeyRound,
  FolderOpen,
  Copy,
  Eye,
  Link2,
  FileCode,
  CheckCheck,
  HelpCircle,
  ChevronDown,
  Share2,
  ArrowLeft,
  ArrowRight,
  Power,
  ToggleLeft,
  ToggleRight,
  MessageSquare,
  MessageSquareQuote,
  ShieldCheck,
  MapPin,
} from 'lucide-react';
import { MadrasaFormNoticeModal } from '../common/MadrasaFormNoticeModal';
import { PWAInstallButton } from '../common/PWAInstallButton';
import {
  getMadrasaFormStatusLocal,
  fetchMadrasaFormStatus,
  saveMadrasaFormStatus,
  MADRASA_FORM_STATUS_EVENT,
} from '../../utils/madrasaFormStatus';
import { MadrasaFormStatus } from '../../types';

interface AdminDashboardProps {
  onLogout: () => void;
  onViewPublic: () => void;
  onOpenManageServices?: () => void;
  currentManager?: StateManager | null;
  isManagerView?: boolean;
}

type TabType = 'dashboard' | 'madrasas' | 'students' | 'results' | 'state_managers' | 'feedbacks' | 'settings' | 'more';

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  onLogout,
  onViewPublic,
  onOpenManageServices,
  currentManager,
  isManagerView = false,
}) => {
  // Language State
  const [lang, setLang] = useState<Language>(() => {
    return (localStorage.getItem('meyar_lang') as Language) || 'ur';
  });
  const t = translations[lang];
  const isEn = lang === 'en';

  const toggleLanguage = () => {
    const nextLang = lang === 'ur' ? 'en' : 'ur';
    setLang(nextLang);
    localStorage.setItem('meyar_lang', nextLang);
    document.documentElement.dir = nextLang === 'ur' ? 'rtl' : 'ltr';
    document.documentElement.lang = nextLang;
    window.dispatchEvent(new CustomEvent('meyar_lang_changed', { detail: { lang: nextLang } }));
  };

  // Launch Timer State (Admin Settings)
  const [launchTimer, setLaunchTimer] = useState<PortalLaunchTimer>(() => getStoredLaunchTimer());
  const toDateTimeLocal = (iso: string) => {
    try {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return '';
      const pad = (n: number) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    } catch {
      return '';
    }
  };
  const [timerTargetDateInput, setTimerTargetDateInput] = useState<string>(() => toDateTimeLocal(getStoredLaunchTimer().targetDate));
  const [timerTitleInput, setTimerTitleInput] = useState<string>(() => getStoredLaunchTimer().title);
  const [timerMessageInput, setTimerMessageInput] = useState<string>(() => getStoredLaunchTimer().message);
  const [isSavingTimer, setIsSavingTimer] = useState(false);
  const [isPreviewCountdownOpen, setIsPreviewCountdownOpen] = useState(false);

  useEffect(() => {
    fetchLaunchTimer().then((lt) => {
      if (lt) {
        setLaunchTimer(lt);
        setTimerTargetDateInput(toDateTimeLocal(lt.targetDate));
        setTimerTitleInput(lt.title);
        setTimerMessageInput(lt.message);
      }
    });

    const handleTimerEv = (e: any) => {
      if (e.detail?.timer) {
        const lt = e.detail.timer;
        setLaunchTimer(lt);
        setTimerTargetDateInput(toDateTimeLocal(lt.targetDate));
        setTimerTitleInput(lt.title);
        setTimerMessageInput(lt.message);
      }
    };
    window.addEventListener(LAUNCH_TIMER_UPDATED_EVENT, handleTimerEv);
    return () => window.removeEventListener(LAUNCH_TIMER_UPDATED_EVENT, handleTimerEv);
  }, []);

  const handleToggleLaunchTimer = async () => {
    const nextEnabled = !launchTimer.enabled;
    try {
      const res = await saveStoredLaunchTimer({ enabled: nextEnabled, isLaunched: false });
      if (res && res.launchTimer) setLaunchTimer(res.launchTimer);
      showToast(
        nextEnabled
          ? (isEn ? 'Portal launch timer is now ON!' : 'پورٹل لانچ ٹائمر فعال (آن) کر دیا گیا! مین اسکرین پر کاؤنٹ ڈاؤن شروع ہو گیا۔')
          : (isEn ? 'Portal launch timer is now OFF' : 'پورٹل لانچ ٹائمر غیر فعال (آف) کر دیا گیا۔'),
        'success'
      );
    } catch (e) {
      showToast(isEn ? 'Failed to update timer' : 'ٹائمر اسٹیٹس محفوظ کرنے میں خرابی', 'error');
    }
  };

  const handleSaveLaunchTimerDetails = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!timerTargetDateInput) {
      showToast(isEn ? 'Please choose target launch date and time' : 'برائے مہربانی لانچ کی تاریخ اور وقت منتخب فرمائیں', 'error');
      return;
    }
    setIsSavingTimer(true);
    try {
      const isoDate = new Date(timerTargetDateInput).toISOString();
      const res = await saveStoredLaunchTimer({
        targetDate: isoDate,
        title: timerTitleInput.trim() || 'معیارِ مدارس نتائج پورٹل کا باضابطہ افتتاح',
        message: timerMessageInput.trim() || 'تمام الحاق شدہ مدارس اور طلبہ کے سالانہ امتحانی نتائج جلد ہی لائیو پیش کیے جا رہے ہیں۔',
        isLaunched: false,
      });
      if (res && res.launchTimer) setLaunchTimer(res.launchTimer);
      showToast(isEn ? 'Launch timer details saved successfully!' : 'پورٹل لانچ ٹائمر کی تفصیلات کامیابی سے محفوظ ہو گئیں!', 'success');
    } catch {
      showToast(isEn ? 'Failed to save timer settings' : 'محفوظ کرنے میں مسئلہ پیش آیا', 'error');
    } finally {
      setIsSavingTimer(false);
    }
  };

  useEffect(() => {
    document.documentElement.dir = isEn ? 'ltr' : 'rtl';
    document.documentElement.lang = lang;

    const handleLangChange = (e: any) => {
      if (e.detail?.lang && e.detail.lang !== lang) {
        setLang(e.detail.lang);
      }
    };
    window.addEventListener('meyar_lang_changed', handleLangChange);
    return () => window.removeEventListener('meyar_lang_changed', handleLangChange);
  }, [isEn, lang]);

  // Navigation
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');

  // Core Data
  const [madaris, setMadaris] = useState<Madrasa[]>(() => getStoredMadaris());
  const [classes, setClasses] = useState<MadrasaClass[]>(() => getStoredClasses());
  const [selectedMadrasaId, setSelectedMadrasaId] = useState<string>('all');

  const [isServerSyncing, setIsServerSyncing] = useState(false);
  const [serverOnline, setServerOnline] = useState<boolean>(true);

  // Search & Filter States
  const [searchStudentQuery, setSearchStudentQuery] = useState('');
  const [madrasaSearchQuery, setMadrasaSearchQuery] = useState('');
  const [drawerMadrasaId, setDrawerMadrasaId] = useState<string | null>(null);
  const [resultsMadrasaScope, setResultsMadrasaScope] = useState<string>('all');
  const [lastSyncTimestamp, setLastSyncTimestamp] = useState<string>(() =>
    new Date().toLocaleTimeString('ur-PK', { hour: '2-digit', minute: '2-digit' })
  );
  const [defaultClassesList, setDefaultClassesList] = useState<string[]>(() =>
    getStoredDefaultClasses()
  );
  const [newDefaultClassInput, setNewDefaultClassInput] = useState('');

  // Central Exam Title & Academic Session states
  const [centralExamTitle, setCentralExamTitle] = useState('سالانہ امتحان 1447-1448ھ / 2026ء');
  const [centralExamTitleEn, setCentralExamTitleEn] = useState('Annual Examination Result 1447-1448H / 2026');
  const [centralAcademicYear, setCentralAcademicYear] = useState('1447-1448ھ / 2025-2026ء');
  const [isSavingExamTitle, setIsSavingExamTitle] = useState(false);
  const [filterStudentClass, setFilterStudentClass] = useState('all');
  const [selectedResultClassId, setSelectedResultClassId] = useState('all');

  // Madrasa Opening & Deep Hierarchy
  const [openedMadrasaId, setOpenedMadrasaId] = useState<string | null>(null);
  const [reviewingMadrasa, setReviewingMadrasa] = useState<Madrasa | null>(null);
  const [verifyingMadrasa, setVerifyingMadrasa] = useState<Madrasa | null>(null);
  const [verifyingSheetUrl, setVerifyingSheetUrl] = useState('');
  const [isVerifyingAction, setIsVerifyingAction] = useState(false);
  const [madrasaFilter, setMadrasaFilter] = useState<'all' | 'pending' | 'linked' | 'unlinked'>('all');
  const [openAddManagerDirectly, setOpenAddManagerDirectly] = useState(false);
  const [managersList, setManagersList] = useState<StateManager[]>([]);

  useEffect(() => {
    fetchStateManagers().then((list) => {
      if (Array.isArray(list)) {
        setManagersList(list);
      }
    }).catch(() => {});
  }, [activeTab]);

  const [togglingResultIds, setTogglingResultIds] = useState<Record<string, boolean>>({});

  const handleToggleResults = async (targetMadrasa: Madrasa) => {
    if (togglingResultIds[targetMadrasa.id]) return;
    const nextVal = targetMadrasa.showPublicResults === false ? true : false;
    setTogglingResultIds((prev) => ({ ...prev, [targetMadrasa.id]: true }));
    setMadaris((prev) =>
      prev.map((item) => (item.id === targetMadrasa.id ? { ...item, showPublicResults: nextVal } : item))
    );
    try {
      const res = await toggleMadrasaResultsVisibility(targetMadrasa.id, nextVal, targetMadrasa);
      if (res.success) {
        showToast(nextVal ? 'مدرسے کا رزلٹ پبلک پورٹل میں آن کر دیا گیا' : 'مدرسے کا رزلٹ پبلک پورٹل میں آف کر دیا گیا');
      } else {
        setMadaris((prev) =>
          prev.map((item) => (item.id === targetMadrasa.id ? { ...item, showPublicResults: !nextVal } : item))
        );
        showToast(res.error || 'اسٹیٹس تبدیل کرنے میں مسئلہ پیش آیا', 'error');
      }
    } finally {
      setTogglingResultIds((prev) => {
        const next = { ...prev };
        delete next[targetMadrasa.id];
        return next;
      });
    }
  };

  // Students Tab Search & Filter States
  const [studentSearchId, setStudentSearchId] = useState('');
  const [studentSearchName, setStudentSearchName] = useState('');
  const [studentFilterMadrasa, setStudentFilterMadrasa] = useState('all');
  const [studentFilterClassSelect, setStudentFilterClassSelect] = useState('all');
  const [selectedStudentDetail, setSelectedStudentDetail] = useState<{
    student: StudentResult;
    madrasa: Madrasa;
    cls: MadrasaClass;
  } | null>(null);

  // Results Tab Filter States
  const [resultStatusFilter, setResultStatusFilter] = useState<'all' | 'published' | 'draft' | 'unpublished'>('all');
  const [resultSearchId, setResultSearchId] = useState('');
  const [isResultSearching, setIsResultSearching] = useState(false);

  const handleQuickResultSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanId = resultSearchId.trim();
    if (!cleanId) {
      showToast(isEn ? 'Please enter Student ID' : 'برائے مہربانی اسٹوڈنٹ آئی ڈی درج فرمائیں', 'error');
      return;
    }

    setIsResultSearching(true);
    try {
      // 1. First check local memory / published classes
      let foundStudentMatch: { student: StudentResult; madrasa: Madrasa; cls: MadrasaClass } | null = null;
      for (const cls of classes) {
        if (!Array.isArray(cls.students)) continue;
        const st = cls.students.find(
          (s) => (s.studentId || '').trim().toLowerCase() === cleanId.toLowerCase()
        );
        if (st) {
          const m = madaris.find((item) => item.id === cls.madrasaId);
          if (m) {
            foundStudentMatch = { student: st, madrasa: m, cls };
            break;
          }
        }
      }

      if (foundStudentMatch) {
        setPreviewStudent(foundStudentMatch);
        showToast(
          isEn
            ? `Result found for (${cleanId})!`
            : `طالب علم (${cleanId}) کا رزلٹ کارڈ کھل گیا!`,
          'success'
        );
        setIsResultSearching(false);
        return;
      }

      // 2. Query central server / google sheet sync
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId: cleanId }),
      });
      const text = await res.text();
      let data: any = {};
      try {
        data = JSON.parse(text);
      } catch {
        data = { error: isEn ? 'Server response error. Please try again.' : 'سرور سے رابطہ کے دوران خامی پیش آئی۔ برائے مہربانی دوبارہ کوشش فرمائیں۔' };
      }

      if (res.ok && data.success && data.result) {
        setPreviewStudent(data.result);
        showToast(
          isEn
            ? `Result found for (${cleanId})!`
            : `طالب علم (${cleanId}) کا رزلٹ کارڈ کامیابی سے مل گیا!`,
          'success'
        );
      } else {
        showToast(
          data.error ||
            (isEn
              ? `No result found for Student ID: ${cleanId}`
              : `اسٹوڈنٹ آئی ڈی "${cleanId}" کا کوئی رزلٹ نہیں ملا`),
          'error'
        );
      }
    } catch (err: any) {
      showToast(
        isEn
          ? `Search failed: ${err.message}`
          : `تلاش میں مسئلہ پیش آیا: ${err.message}`,
        'error'
      );
    } finally {
      setIsResultSearching(false);
    }
  };

  // Modals
  const [isMadrasaModalOpen, setIsMadrasaModalOpen] = useState(false);
  const [editingMadrasa, setEditingMadrasa] = useState<Madrasa | null>(null);

  const [isClassModalOpen, setIsClassModalOpen] = useState(false);
  const [editingClass, setEditingClass] = useState<MadrasaClass | null>(null);

  const [isStudentModalOpen, setIsStudentModalOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<{ student: StudentResult; classId: string } | null>(null);

  const [isKaifiyatModalOpen, setIsKaifiyatModalOpen] = useState(false);
  const [selectedMadrasaForKaifiyat, setSelectedMadrasaForKaifiyat] = useState<Madrasa | null>(null);
  const [isPortalLogoModalOpen, setIsPortalLogoModalOpen] = useState(false);
  const [portalLogo, setPortalLogo] = useState<string>(() => getPortalLogo());
  const [previewStudent, setPreviewStudent] = useState<{
    student: StudentResult;
    madrasa: Madrasa;
    cls: MadrasaClass;
  } | null>(null);

  const [confirmDialog, setConfirmDialog] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);

  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Google Apps Script & Sheet Link Modals
  const [isScriptModalOpen, setIsScriptModalOpen] = useState(false);
  const [isAttachSheetModalOpen, setIsAttachSheetModalOpen] = useState(false);
  const [targetAttachMadrasa, setTargetAttachMadrasa] = useState<Madrasa | null>(null);
  const [sheetUrlInput, setSheetUrlInput] = useState('');
  const [searchMadrasaQuery, setSearchMadrasaQuery] = useState('');
  const [copiedScript, setCopiedScript] = useState(false);
  const [appsScriptWebAppUrl, setAppsScriptWebAppUrl] = useState(DEFAULT_APPS_SCRIPT_URL);
  const [tempWebAppUrl, setTempWebAppUrl] = useState(DEFAULT_APPS_SCRIPT_URL);
  const [isSavingWebAppUrl, setIsSavingWebAppUrl] = useState(false);
  const [isGeneratingSheetForId, setIsGeneratingSheetForId] = useState<string | null>(null);

  // Central Sheet (Madaris & Feedback) States
  const [centralSheetUrl, setCentralSheetUrl] = useState('');
  const [tempCentralSheetUrl, setTempCentralSheetUrl] = useState('');
  const [isSavingCentralSheetUrl, setIsSavingCentralSheetUrl] = useState(false);
  const [copiedCentralScript, setCopiedCentralScript] = useState(false);

  // Standalone Sheet Editor Script States (completely independent from old Code.gs)
  const [sheetEditorUrl, setSheetEditorUrl] = useState('');
  const [tempSheetEditorUrl, setTempSheetEditorUrl] = useState('');
  const [isSavingSheetEditorUrl, setIsSavingSheetEditorUrl] = useState(false);
  const [copiedSheetEditorScript, setCopiedSheetEditorScript] = useState(false);

  const [scriptModalTab, setScriptModalTab] = useState<'central' | 'generator' | 'sheet_editor'>('central');
  const [isClearingAllMadaris, setIsClearingAllMadaris] = useState(false);

  // Madrasa Registration Form On/Off Status (Result Admin Control)
  const [formStatus, setFormStatus] = useState<MadrasaFormStatus>(() => getMadrasaFormStatusLocal());
  const [isFormNoticePreviewOpen, setIsFormNoticePreviewOpen] = useState(false);
  const [isEditingFormStatus, setIsEditingFormStatus] = useState(false);
  const [formStatusEditGreeting, setFormStatusEditGreeting] = useState('');
  const [formStatusEditMessage, setFormStatusEditMessage] = useState('');
  const [isSavingFormStatus, setIsSavingFormStatus] = useState(false);

  useEffect(() => {
    fetchMadrasaFormStatus().then((s) => {
      if (s) {
        setFormStatus(s);
        setFormStatusEditGreeting(s.greeting);
        setFormStatusEditMessage(s.message);
      }
    });
    const handleStatusChanged = (e: any) => {
      if (e.detail) {
        setFormStatus(e.detail);
        setFormStatusEditGreeting(e.detail.greeting);
        setFormStatusEditMessage(e.detail.message);
      }
    };
    window.addEventListener(MADRASA_FORM_STATUS_EVENT, handleStatusChanged);
    return () => window.removeEventListener(MADRASA_FORM_STATUS_EVENT, handleStatusChanged);
  }, []);

  const handleToggleFormStatus = async () => {
    const nextEnabled = !formStatus.enabled;
    try {
      const updated = await saveMadrasaFormStatus({ enabled: nextEnabled });
      setFormStatus(updated);
      showToast(
        nextEnabled
          ? (isEn ? 'Madrasa form is now ON (Active)!' : 'مدرسہ رجسٹریشن فارم آن (فعال) کر دیا گیا۔ اب نئے مدارس رجسٹر ہو سکتے ہیں۔')
          : (isEn ? 'Madrasa form is now OFF (Notice active)!' : 'مدرسہ فارم آف (غیر فعال) کر دیا گیا۔ کلک کرنے پر نوٹس ظاہر ہوگا۔')
      );
    } catch (err) {
      showToast(isEn ? 'Failed to update status' : 'اسٹیٹس اپ ڈیٹ نہیں ہو سکا');
    }
  };

  const handleSaveFormStatusCustomText = async () => {
    setIsSavingFormStatus(true);
    try {
      const updated = await saveMadrasaFormStatus({
        greeting: formStatusEditGreeting.trim() || 'السلام علیکم ورحمۃ اللہ وبرکاتہ',
        message: formStatusEditMessage.trim() || 'ابھی اس پر کام ہو رہا ہے\nکچھ دن بعد دوبارہ کوشش کریں',
      });
      setFormStatus(updated);
      setIsEditingFormStatus(false);
      showToast(isEn ? 'Notice text saved!' : 'اطلاعیہ کا متن محفوظ ہو گیا!');
    } catch (e) {
      showToast(isEn ? 'Failed to save' : 'محفوظ کرنے میں خامی آئی');
    } finally {
      setIsSavingFormStatus(false);
    }
  };

  const handleResetFormStatusDefaultText = async () => {
    const defaultGreeting = 'السلام علیکم ورحمۃ اللہ وبرکاتہ';
    const defaultMessage = 'ابھی اس پر کام ہو رہا ہے\nکچھ دن بعد دوبارہ کوشش کریں';
    setFormStatusEditGreeting(defaultGreeting);
    setFormStatusEditMessage(defaultMessage);
    const updated = await saveMadrasaFormStatus({
      greeting: defaultGreeting,
      message: defaultMessage,
    });
    setFormStatus(updated);
    showToast(isEn ? 'Reset to default message' : 'طے شدہ متن پر بحال کر دیا گیا');
  };

  useEffect(() => {
    fetch('/api/apps-script-url')
      .then((r) => r.json())
      .then((data) => {
        if (data && data.url) {
          const clean = sanitizeAppsScriptUrl(data.url) || DEFAULT_APPS_SCRIPT_URL;
          setAppsScriptWebAppUrl(clean);
          setTempWebAppUrl(clean);
        }
      })
      .catch(() => {});

    fetch('/api/central-sheet-url')
      .then((r) => r.json())
      .then((data) => {
        if (data && data.url) {
          const clean = sanitizeAppsScriptUrl(data.url);
          if (clean) {
            setCentralSheetUrl(clean);
            setTempCentralSheetUrl(clean);
          }
        }
      })
      .catch(() => {});
  }, []);

  // Change Result Admin PIN states
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [pinSuccess, setPinSuccess] = useState('');
  const [isSavingPin, setIsSavingPin] = useState(false);
  const [toastNotification, setToastNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Feedback unread counter
  const [unreadFeedbacksCount, setUnreadFeedbacksCount] = useState<number>(0);

  useEffect(() => {
    let isMounted = true;
    const loadFeedbackCount = async () => {
      try {
        const list = await fetchFeedbacks(
          isManagerView ? currentManager?.assignedStates : undefined
        );
        if (isMounted) {
          const unread = list.filter((f) => f.status === 'unread').length;
          setUnreadFeedbacksCount(unread);
        }
      } catch (e) {
        // silently ignore
      }
    };
    loadFeedbackCount();
    const interval = setInterval(loadFeedbackCount, 25000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [isManagerView, currentManager, activeTab]);

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    // Determine type automatically if not specified
    const isError = type === 'error' ||
      msg.includes('خامی') ||
      msg.includes('مسئلہ') ||
      msg.includes('غلط') ||
      msg.includes('error') ||
      msg.includes('Error') ||
      msg.includes('failed') ||
      msg.includes('نہیں ہو سکا');
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    setToastNotification({ message: msg, type: isError ? 'error' : 'success' });
    toastTimerRef.current = setTimeout(() => {
      setToastNotification(null);
      toastTimerRef.current = null;
    }, 4000);
  };

  const handleChangeResultPin = async (e: React.FormEvent) => {
    e.preventDefault();
    setPinError('');
    setPinSuccess('');

    if (!currentPin.trim() || !newPin.trim()) {
      setPinError('موجودہ اور نیا پن دونوں درج فرمائیں۔');
      return;
    }

    if (newPin.trim().length < 4) {
      setPinError('نیا سیکیورٹی پن کم از کم 4 حروف یا ہندسوں پر مشتمل ہونا چاہیے۔');
      return;
    }

    if (newPin.trim() !== confirmPin.trim()) {
      setPinError('نیا پن اور تصدیقی پن ایک دوسرے سے مماثل نہیں ہیں۔');
      return;
    }

    setIsSavingPin(true);
    try {
      const res = await fetch('/api/admin/change-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          oldPin: currentPin.trim(),
          newPin: newPin.trim(),
          portal: 'result',
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setResultAdminPin(newPin.trim());
        setPinSuccess('امتحانی رزلٹ ایڈمن پن کامیابی سے تبدیل ہو گیا!');
        setTimeout(() => {
          setIsPinModalOpen(false);
          setCurrentPin('');
          setNewPin('');
          setConfirmPin('');
          setPinSuccess('');
        }, 1500);
        return;
      }
      if (data.error) {
        setPinError(data.error);
        return;
      }
    } catch {
      // Local fallback
      const stored = getResultAdminPin();
      if (currentPin.trim() === stored || currentPin.trim() === 'meyar2026') {
        setResultAdminPin(newPin.trim());
        setPinSuccess('امتحانی رزلٹ ایڈمن پن کامیابی سے تبدیل ہو گیا!');
        setTimeout(() => {
          setIsPinModalOpen(false);
          setCurrentPin('');
          setNewPin('');
          setConfirmPin('');
          setPinSuccess('');
        }, 1500);
        return;
      }
      setPinError('موجودہ سیکیورٹی پن غلط ہے۔');
    } finally {
      setIsSavingPin(false);
    }
  };

  // Sync with cloud server
  useEffect(() => {
    fetchCentralSheetUrl().then((url) => {
      if (url) {
        setCentralSheetUrl(url);
        setTempCentralSheetUrl(url);
      }
    });

    fetchSheetEditorScriptUrl().then((url) => {
      if (url) {
        setSheetEditorUrl(url);
        setTempSheetEditorUrl(url);
      }
    });

    syncWithServer().then(({ madaris: m, classes: c }) => {
      setMadaris(m);
      setClasses(c);
    });

    checkServerStatus().then((s) => setServerOnline(s.online));

    const handleDataUpdate = (e: any) => {
      if (e.detail?.madaris) setMadaris(e.detail.madaris);
      if (e.detail?.classes) setClasses(e.detail.classes);
    };

    const handleDefaultClassesUpdated = (e: any) => {
      if (Array.isArray(e.detail?.classes) && e.detail.classes.length > 0) {
        setDefaultClassesList(e.detail.classes);
      }
    };

    fetchStoredDefaultClasses().then((list) => {
      if (Array.isArray(list) && list.length > 0) {
        setDefaultClassesList(list);
      }
    });

    const handleExamTitleUpdated = (e: any) => {
      if (e.detail?.examTitle) {
        setCentralExamTitle(e.detail.examTitle);
        if (e.detail.examTitleEn) setCentralExamTitleEn(e.detail.examTitleEn);
        if (e.detail.academicYear) setCentralAcademicYear(e.detail.academicYear);
      }
    };

    fetchCentralExamTitle().then((info) => {
      if (info?.examTitle) {
        setCentralExamTitle(info.examTitle);
        if (info.examTitleEn) setCentralExamTitleEn(info.examTitleEn);
        if (info.academicYear) setCentralAcademicYear(info.academicYear);
      }
    });

    // Real-time live synchronization across devices every 25 seconds (uses server/onSnapshot without full Firestore re-scan)
    const intervalId = setInterval(() => {
      syncWithServer(false).then(({ madaris: m, classes: c }) => {
        if (m) setMadaris(m);
        if (c) setClasses(c);
      });
    }, 25000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        syncWithServer(false).then(({ madaris: m, classes: c }) => {
          if (m) setMadaris(m);
          if (c) setClasses(c);
        });
        fetchStoredDefaultClasses().then((list) => {
          if (Array.isArray(list) && list.length > 0) setDefaultClassesList(list);
        });
        fetchCentralExamTitle().then((info) => {
          if (info?.examTitle) {
            setCentralExamTitle(info.examTitle);
            if (info.examTitleEn) setCentralExamTitleEn(info.examTitleEn);
            if (info.academicYear) setCentralAcademicYear(info.academicYear);
          }
        });
      }
    };
    const handlePortalLogoUpdated = (e: any) => {
      if (e.detail?.logo) {
        setPortalLogo(e.detail.logo);
      }
    };
    const handleLaunchTimerUpdated = (e: any) => {
      if (e.detail) {
        setLaunchTimer(e.detail);
      }
    };
    const handleCentralSettingsUpdated = (e: any) => {
      if (e?.detail?.fromSyncWithServer) return;
      handleManualSync(true);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('meyar_data_updated', handleDataUpdate);
    window.addEventListener(DEFAULT_CLASSES_UPDATED_EVENT, handleDefaultClassesUpdated);
    window.addEventListener(DEFAULT_EXAM_TITLE_UPDATED_EVENT, handleExamTitleUpdated);
    window.addEventListener('portal_logo_updated', handlePortalLogoUpdated);
    window.addEventListener(LAUNCH_TIMER_UPDATED_EVENT, handleLaunchTimerUpdated);
    window.addEventListener(CENTRAL_SETTINGS_UPDATED_EVENT, handleCentralSettingsUpdated);

    return () => {
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('meyar_data_updated', handleDataUpdate);
      window.removeEventListener(DEFAULT_CLASSES_UPDATED_EVENT, handleDefaultClassesUpdated);
      window.removeEventListener(DEFAULT_EXAM_TITLE_UPDATED_EVENT, handleExamTitleUpdated);
      window.removeEventListener('portal_logo_updated', handlePortalLogoUpdated);
      window.removeEventListener(LAUNCH_TIMER_UPDATED_EVENT, handleLaunchTimerUpdated);
      window.removeEventListener(CENTRAL_SETTINGS_UPDATED_EVENT, handleCentralSettingsUpdated);
    };
  }, []);

  const [isSyncingSingleMadrasa, setIsSyncingSingleMadrasa] = useState<string | null>(null);

  const handleSyncSingleMadrasa = async (madrasaId: string) => {
    setIsSyncingSingleMadrasa(madrasaId);
    showToast(isEn ? 'Syncing latest records from cloud...' : 'کلاؤڈ ریکارڈ سے طلبہ و نمبرات لائیو سنک ہو رہے ہیں...');
    try {
      const res = await syncMadrasaGoogleSheet(madrasaId);
      if (res.success) {
        if (res.madaris) setMadaris(res.madaris);
        if (res.classes) setClasses(res.classes);
        showToast(
          isEn
            ? `Successfully synced: ${res.syncedClasses || 0} classes and ${res.totalStudents || 0} students updated!`
            : (res.message || 'کلاؤڈ ریکارڈ ڈیٹا کامیابی سے سنک ہو گیا!')
        );
      } else {
        showToast(res.message || (isEn ? 'Cloud sync failed' : 'کلاؤڈ ریکارڈ سے سنک نہیں ہو سکا'));
      }
    } catch (e: any) {
      showToast(isEn ? 'Sync error: ' + e.message : 'سنک خامی: ' + e.message);
    } finally {
      setIsSyncingSingleMadrasa(null);
    }
  };

  const handleManualSync = async (silent = false) => {
    setIsServerSyncing(true);
    try {
      const res = await syncWithServer(!silent);
      setMadaris(res.madaris);
      setClasses(res.classes);
      const st = await checkServerStatus();
      setServerOnline(st.online);
      if (!silent) {
        if (isFirestoreQuotaExceeded()) {
          showToast(
            isEn
              ? 'Daily cloud read quota is currently reached; local server synced.'
              : 'کلاؤڈ ڈیٹابیس کا یومیہ مفت ریڈ کوٹہ مکمل ہو چکا ہے؛ مقامی سرور اپ ڈیٹ کر دیا گیا ہے'
          );
        } else {
          showToast(isEn ? 'All records updated with live cloud server' : 'تمام ریکارڈز کلاؤڈ سرور کے ساتھ اپ ڈیٹ ہو گئے');
        }
      }
    } catch {
      if (!silent) {
        showToast(isEn ? 'Server sync failed' : 'سرور سنک کرنے میں مسئلہ پیش آیا');
      }
    } finally {
      setIsServerSyncing(false);
    }
  };

  // Auto-sync Google Sheet when opening Results tab to keep results live from sheet
  useEffect(() => {
    if (activeTab === 'results') {
      if (resultsMadrasaScope !== 'all') {
        handleSyncSingleMadrasa(resultsMadrasaScope).catch(() => {});
      } else {
        const linked = madaris.filter((m) => m.googleSheetUrl || m.spreadsheetId);
        if (linked.length > 0) {
          handleSyncSingleMadrasa(linked[0].id).catch(() => {});
        }
      }
    }
  }, [activeTab, resultsMadrasaScope]);

  const handleCreateSheetForMadrasa = async (targetMadrasa: Madrasa) => {
    try {
      showToast(`'معیار مدارس' کلاؤڈ ریکارڈ تیار کیا جا رہا ہے...`);
      let targetClasses = classes.filter((c) => c.madrasaId === targetMadrasa.id);
      if (targetClasses.length === 0) {
        const defaultNames = ['حفظ', 'سال اول', 'سال دوم'];
        const createdClasses: MadrasaClass[] = [];
        for (let i = 0; i < defaultNames.length; i++) {
          const cName = defaultNames[i];
          const newCls: MadrasaClass = {
            id: `class-${targetMadrasa.code}-${i + 1}-${Date.now()}`,
            madrasaId: targetMadrasa.id,
            name: cName,
            academicYear: '1447-1448ھ / 2025-2026ء',
            status: 'draft',
            resultSourceType: 'google_sheet',
            googleSheetUrl: '',
            sheetTabName: cName,
            students: [],
            rawSourceData: '',
            lastTestedAt: new Date().toISOString(),
            testStatus: {
              success: true,
              message: 'کلاس تیار ہے',
              studentCount: 0,
              subjectCount: 0,
              subjects: [],
              missingFields: [],
            },
            updatedAt: new Date().toISOString(),
          };
          await persistClass(newCls);
          createdClasses.push(newCls);
        }
        targetClasses = createdClasses;
      }

      const classNames = targetClasses.map((c) => c.name);
      const classConfigs: { [cName: string]: { name: string; maxMarks: number }[] } = {};
      classNames.forEach((cn) => {
        classConfigs[cn] = DEFAULT_CLASS_SUBJECTS[cn] || [
          { name: 'دینیات', maxMarks: 100 },
          { name: 'اردو', maxMarks: 50 },
          { name: 'عربی / فارسی', maxMarks: 100 },
        ];
      });

      const { spreadsheetUrl } = await createLiveGoogleSheetInDrive(
        cleanInstitutionName(targetMadrasa.urduName),
        targetMadrasa.code,
        classNames,
        classConfigs
      );

      const updated = { ...targetMadrasa, googleSheetUrl: spreadsheetUrl };
      await persistMadrasa(updated);

      for (const cls of targetClasses) {
        await persistClass({
          ...cls,
          googleSheetUrl: spreadsheetUrl,
          sheetTabName: cls.name,
          resultSourceType: 'google_sheet',
        });
      }

      await handleManualSync();
      showToast(`کلاؤڈ ریکارڈ کامیابی کے ساتھ تیار ہو کر منسلک ہو گیا!`);
    } catch (err: any) {
      if (
        err?.code === 'auth/popup-closed-by-user' ||
        err?.code === 'auth/cancelled-popup-request' ||
        (typeof err?.message === 'string' && err.message.includes('popup-closed-by-user'))
      ) {
        showToast('لاگ ان پاپ اپ بند ہو گیا۔');
      } else {
        showToast(err.message || 'ریکارڈ تیار کرنے میں مسئلہ پیش آیا۔');
      }
    }
  };

  const [isBatchCreatingSheets, setIsBatchCreatingSheets] = useState(false);
  const [isSyncingAllSheets, setIsSyncingAllSheets] = useState(false);
  const [copiedCodeId, setCopiedCodeId] = useState<string | null>(null);

  const handleCopyCredentials = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCodeId(id);
    showToast(`پرنسپل لاگ ان کاپی ہو گیا: ${text}`);
    setTimeout(() => setCopiedCodeId(null), 2500);
  };

  const handleBatchCreateSheets = async () => {
    const unlinkedMadaris = madaris.filter((m) => !m.googleSheetUrl);
    if (unlinkedMadaris.length === 0) {
      showToast('تمام مدارس کے کلاؤڈ ریکارڈز پہلے سے تیار و منسلک ہیں!');
      return;
    }
    setIsBatchCreatingSheets(true);
    showToast(`${unlinkedMadaris.length} غیر منسلک مدارس کے کلاؤڈ ریکارڈز تیار کیے جا رہے ہیں...`);
    try {
      for (const m of unlinkedMadaris) {
        await handleCreateSheetForMadrasa(m);
      }
      showToast('تمام غیر منسلک مدارس کے کلاؤڈ ریکارڈز کامیابی سے تیار و منسلک ہو گئے!');
    } catch (e: any) {
      showToast('خودکار ریکارڈ بنانے کے عمل میں مسئلہ پیش آیا: ' + (e.message || ''));
    } finally {
      setIsBatchCreatingSheets(false);
    }
  };

  const handleSyncAllSheets = async () => {
    setIsSyncingAllSheets(true);
    showToast(isEn ? 'Syncing live results from cloud records...' : 'کلاؤڈ ریکارڈز سے لائیو رزلٹس سنک ہو رہے ہیں...');
    try {
      const res = await syncAllMadarisGoogleSheets();
      if (res.success) {
        if (res.madaris) setMadaris(res.madaris);
        if (res.classes) setClasses(res.classes);
        showToast(
          isEn
            ? `Successfully synced: ${res.syncedMadaris || 0} madaris, ${res.totalClasses || 0} classes, and ${res.totalStudents || 0} students!`
            : (res.message || 'تمام منسلک کلاؤڈ ریکارڈز مکمل ہم آہنگ (Synced) ہو گئے!')
        );
      } else {
        await handleManualSync();
        showToast(res.message || (isEn ? 'Synced with cloud' : 'کلاؤڈ سے سنک مکمل ہوا'));
      }
    } catch (e: any) {
      showToast(isEn ? 'Sync error: ' + e.message : 'سنک کرنے میں خامی: ' + e.message);
    } finally {
      setIsSyncingAllSheets(false);
    }
  };

  const handleSaveAttachedSheetUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetAttachMadrasa || !sheetUrlInput.trim()) return;
    const cleanUrl = sheetUrlInput.trim();
    if (!cleanUrl.includes('docs.google.com/spreadsheets') && !cleanUrl.includes('drive.google.com') && !cleanUrl.includes('script.google.com')) {
      showToast(isEn ? 'Please enter a valid cloud record or Drive link.' : 'برائے مہربانی درست کلاؤڈ ریکارڈ یا ڈرائیو لنک درج فرمائیں۔');
      return;
    }
    const updated = { ...targetAttachMadrasa, googleSheetUrl: cleanUrl };
    await persistMadrasa(updated);
    const targetClasses = classes.filter((c) => c.madrasaId === targetAttachMadrasa.id);
    for (const cls of targetClasses) {
      await persistClass({
        ...cls,
        googleSheetUrl: cleanUrl,
        sheetTabName: cls.name,
        resultSourceType: 'google_sheet',
      });
    }
    // Auto-sync students from the newly attached sheet immediately
    try {
      const syncRes = await syncMadrasaGoogleSheet(targetAttachMadrasa.id);
      if (syncRes.success) {
        if (syncRes.madaris) setMadaris(syncRes.madaris);
        if (syncRes.classes) setClasses(syncRes.classes);
      }
    } catch {}
    await handleManualSync();
    setIsAttachSheetModalOpen(false);
    setSheetUrlInput('');
    setTargetAttachMadrasa(null);
    showToast(isEn ? `Cloud records attached and synced for (${targetAttachMadrasa.code})!` : `کلاؤڈ ریکارڈ کامیابی سے مدرسہ (${targetAttachMadrasa.code}) کے ساتھ منسلک اور سنک ہو گیا!`);
  };

  // Google Apps Script Web App Handlers
  const handleSaveWebAppUrl = async (url: string) => {
    const clean = sanitizeAppsScriptUrl(url) || DEFAULT_APPS_SCRIPT_URL;
    try {
      setIsSavingWebAppUrl(true);
      const res = await fetch('/api/apps-script-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: clean }),
      });
      if (res.ok) {
        setAppsScriptWebAppUrl(clean);
        setTempWebAppUrl(clean);
        showToast('گوگل اسکرپٹ ویب ایپ لنک کامیابی سے محفوظ ہو گیا!');
      } else {
        showToast('ویب ایپ لنک محفوظ نہیں ہو سکا');
      }
    } catch {
      showToast('سرور سے رابطہ کرنے میں مسئلہ آیا');
    } finally {
      setIsSavingWebAppUrl(false);
    }
  };

  const handleSaveCentralSheetUrl = async (url: string) => {
    const clean = sanitizeAppsScriptUrl(url);
    if (!clean && url.trim()) {
      showToast('برائے مہربانی درست Google Apps Script Web App لنک درج فرمائیں');
      return;
    }
    try {
      setIsSavingCentralSheetUrl(true);
      const success = await saveCentralSheetUrl(clean);
      if (success) {
        setCentralSheetUrl(clean);
        setTempCentralSheetUrl(clean);
        showToast('مرکزی شیٹ (Madaris & Feedback) کا ویب ایپ لنک محفوظ ہو گیا!');
      } else {
        showToast('ویب ایپ لنک محفوظ نہیں ہو سکا');
      }
    } catch {
      showToast('سرور سے رابطہ کرنے میں مسئلہ آیا');
    } finally {
      setIsSavingCentralSheetUrl(false);
    }
  };

  const handleSaveSheetEditorUrl = async (url: string) => {
    const clean = sanitizeAppsScriptUrl(url);
    if (!clean && url.trim()) {
      showToast('برائے مہربانی درست Google Apps Script Web App لنک درج فرمائیں');
      return;
    }
    try {
      setIsSavingSheetEditorUrl(true);
      const success = await saveSheetEditorScriptUrl(clean);
      if (success) {
        setSheetEditorUrl(clean);
        setTempSheetEditorUrl(clean);
        showToast('نیا شیٹ ایڈیٹر اسکرپٹ ویب ایپ لنک محفوظ ہو گیا!');
      } else {
        showToast('ویب ایپ لنک محفوظ نہیں ہو سکا');
      }
    } catch {
      showToast('سرور سے رابطہ کرنے میں مسئلہ آیا');
    } finally {
      setIsSavingSheetEditorUrl(false);
    }
  };

  const handleClearAllMadaris = () => {
    setConfirmDialog({
      title: isEn ? 'Reset / Delete All Madaris' : 'تمام مدارس حذف و ری سیٹ کریں',
      message: isEn
        ? 'Are you sure you want to delete all madaris? This will completely clear all madrasa records so you can start fresh with the new Google Sheet.'
        : 'کیا آپ واقعی تمام مدارس اور ان کے تمام ریکارڈز حذف کرنا چاہتے ہیں؟ اس سے تمام موجودہ مدارس اور کلاسز صاف ہو جائیں گی تاکہ آپ نئی شیٹ کے ساتھ نئے مدارس کا صاف ستھرا اندراج کر سکیں۔',
      onConfirm: async () => {
        setIsClearingAllMadaris(true);
        try {
          await clearAllMadarisFromServer();
          setMadaris([]);
          setClasses([]);
          setConfirmDialog(null);
          showToast(isEn ? 'All madaris cleared successfully!' : 'تمام مدارس کامیابی کے ساتھ صاف کر دیے گئے!');
        } catch {
          showToast('حذف کرنے میں خامی پیش آئی');
        } finally {
          setIsClearingAllMadaris(false);
        }
      },
    });
  };

  const handleAutoGenerateSheetViaAppsScript = async (madrasa: Madrasa) => {
    const url = appsScriptWebAppUrl.trim();
    if (!url) {
      setIsScriptModalOpen(true);
      showToast('پہلے اپنا گوگل اسکرپٹ ویب ایپ URL درج فرما کر محفوظ کریں');
      return;
    }
    setIsGeneratingSheetForId(madrasa.id);
    showToast(`'معیار مدارس' میں ${madrasa.urduName} کی خودکار شیٹ تیار کی جا رہی ہے...`);
    try {
      const res = await fetch('/api/apps-script/create-sheet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          madrasaId: madrasa.id,
          webAppUrl: url,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success && data.sheetUrl) {
        showToast(`کلاؤڈ ریکارڈ کامیابی سے تیار ہو گیا: ${madrasa.code}`);
        await handleManualSync();
      } else {
        showToast(data.error || 'ریکارڈ بنانے میں مسئلہ پیش آیا');
      }
    } catch (e: any) {
      showToast('کلاؤڈ سروس میں مسئلہ: ' + e.message);
    } finally {
      setIsGeneratingSheetForId(null);
    }
  };

  const handleBatchGenerateViaAppsScript = async () => {
    const url = appsScriptWebAppUrl.trim();
    if (!url) {
      setIsScriptModalOpen(true);
      showToast('پہلے اپنا کلاؤڈ کنکشن URL درج فرما کر محفوظ کریں');
      return;
    }
    setIsBatchCreatingSheets(true);
    showToast('تمام غیر منسلک مدارس کے کلاؤڈ ریکارڈز خودکار تیار کیے جا رہے ہیں...');
    try {
      const res = await fetch('/api/apps-script/batch-create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ webAppUrl: url }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast(`ماشاءاللہ! ${data.count || 0} مدارس کے کلاؤڈ ریکارڈز خودکار تیار ہو گئے!`);
        await handleManualSync();
      } else {
        showToast(data.error || 'بیچ جنریشن میں مسئلہ آیا');
      }
    } catch (e: any) {
      showToast('بیچ جنریشن میں مسئلہ: ' + e.message);
    } finally {
      setIsBatchCreatingSheets(false);
    }
  };

  // Default Registration Classes Handlers
  const handleAddDefaultClass = async () => {
    const trimmed = newDefaultClassInput.trim();
    if (!trimmed) return;
    if (defaultClassesList.includes(trimmed)) {
      showToast('یہ درجہ پہلے سے موجود ہے');
      return;
    }
    const updated = [...defaultClassesList, trimmed];
    setDefaultClassesList(updated);
    setNewDefaultClassInput('');
    await saveStoredDefaultClasses(updated);
    showToast(`نیا بنیادی درجہ "${trimmed}" شامل کر دیا گیا`);
  };

  const handleRemoveDefaultClass = async (classNameToRemove: string) => {
    if (defaultClassesList.length <= 1) {
      showToast('کم از کم ایک بنیادی درجہ ہونا ضروری ہے');
      return;
    }
    const updated = defaultClassesList.filter((c) => c !== classNameToRemove);
    setDefaultClassesList(updated);
    await saveStoredDefaultClasses(updated);
    showToast(`درجہ "${classNameToRemove}" ہٹا دیا گیا`);
  };

  const handleResetDefaultClasses = async () => {
    setDefaultClassesList(DEFAULT_REGISTRATION_CLASSES);
    await saveStoredDefaultClasses(DEFAULT_REGISTRATION_CLASSES);
    showToast('بنیادی درجات معیاری لسٹ پر بحال کر دیے گئے');
  };

  // Central Exam Title & Session Handler
  const handleSaveExamTitle = async (applyToAll: boolean) => {
    if (!centralExamTitle.trim()) {
      showToast('امتحانی عنوان درج کرنا ضروری ہے', 'error');
      return;
    }
    setIsSavingExamTitle(true);
    try {
      const res = await saveCentralExamTitle({
        examTitle: centralExamTitle.trim(),
        examTitleEn: centralExamTitleEn.trim(),
        academicYear: centralAcademicYear.trim(),
        applyToAllMadaris: applyToAll,
      });
      if (res.success) {
        showToast(
          res.message ||
            (applyToAll
              ? 'امتحانی عنوان تمام مدارس اور رزلٹ کارڈز پر لاگو ہو گیا!'
              : 'مرکزی امتحانی عنوان محفوظ ہو گیا!')
        );
        if (applyToAll) {
          await handleManualSync();
        }
      } else {
        showToast(res.message || 'محفوظ کرنے میں مسئلہ آیا', 'error');
      }
    } catch (e: any) {
      showToast('خرابی: ' + e.message, 'error');
    } finally {
      setIsSavingExamTitle(false);
    }
  };

  const GOOGLE_APPS_SCRIPT_CODE = useMemo(() => {
    return getUnifiedAppsScriptCode();
  }, []);

  const CENTRAL_SHEET_APPS_SCRIPT_CODE = useMemo(() => {
    return getCentralSheetAppsScriptCode();
  }, []);

  const STANDALONE_SHEET_EDITOR_SCRIPT_CODE = useMemo(() => {
    return getStandaloneSheetEditorAppsScriptCode();
  }, []);

  const isAllMadaris = selectedMadrasaId === 'all';
  const selectedMadrasa = isAllMadaris
    ? null
    : madaris.find((m) => m.id === selectedMadrasaId) || null;
  const madrasaClasses = isAllMadaris
    ? classes
    : classes.filter((c) => c.madrasaId === selectedMadrasa?.id);

  const isStateMatchingAssigned = (assignedState: string, madrasaState?: string, madrasaAddress?: string): boolean => {
    const as = (assignedState || '').toLowerCase().trim();
    const ms = (madrasaState || '').toLowerCase().trim();
    const addr = (madrasaAddress || '').toLowerCase().trim();
    if (!as) return false;

    if (ms && (ms === as || ms.includes(as) || as.includes(ms))) return true;
    if (addr && (addr.includes(as) || as.includes(addr))) return true;

    const stateAliases: Record<string, string[]> = {
      jharkhand: ['jharkhand', 'جھارکھنڈ', 'جھار کھنڈ', 'jh'],
      bihar: ['bihar', 'بہار', 'br'],
      'uttar pradesh': ['uttar pradesh', 'اتر پردیش', 'اترپردیش', 'یو پی', 'up'],
      'west bengal': ['west bengal', 'مغربی بنگال', 'بنگال', 'wb'],
      delhi: ['delhi', 'دہلی', 'نئی دہلی', 'dl'],
      maharashtra: ['maharashtra', 'مہاراشٹر', 'mh'],
      'madhya pradesh': ['madhya pradesh', 'مدھیہ پردیش', 'mp'],
      rajasthan: ['rajasthan', 'راجستھان', 'rj'],
      gujarat: ['gujarat', 'گجرات', 'gj'],
      assam: ['assam', 'آسام', 'اسام', 'as'],
      kashmir: ['kashmir', 'کشمیر', 'جموں و کشمیر', 'jk'],
      odisha: ['odisha', 'اڈیشہ', 'اڑیسہ', 'or'],
      telangana: ['telangana', 'تلنگانہ', 'ts'],
      karnataka: ['karnataka', 'کرناٹک', 'ka'],
    };

    for (const [key, aliases] of Object.entries(stateAliases)) {
      const isAssignedTarget = key === as || aliases.some((a) => as.includes(a));
      if (isAssignedTarget) {
        if (aliases.some((a) => ms.includes(a) || addr.includes(a))) return true;
        if (ms.includes(key) || addr.includes(key)) return true;
      }
    }

    return false;
  };

  // Verification status customized by current role:
  // For Manager: Verified as soon as Manager verifies (m.managerVerified)
  // For Super Admin: Verified once Super Admin approves (m.registrationStatus === 'approved' || m.isVerified)
  const isMadrasaLinkedAndVerified = (m: Madrasa) => {
    if (isManagerView) {
      return Boolean(m.managerVerified);
    }
    return Boolean(m.registrationStatus === 'approved');
  };

  // State Manager Assigned States Filter (strict state isolation)
  const managerAssignedStates = useMemo(() => {
    return (currentManager?.assignedStates || []).map((s) => s.trim().toLowerCase()).filter(Boolean);
  }, [currentManager]);

  const viewableMadaris = useMemo(() => {
    const seen = new Set<string>();
    const deleted = new Set(getDeletedMadrasaIds().map((s) => s.toLowerCase().trim()));
    let list = madaris.filter((m) => {
      if (!m || !m.id || seen.has(m.id)) return false;
      if (
        deleted.has(String(m.id).toLowerCase().trim()) ||
        deleted.has(String(m.code || '').toLowerCase().trim())
      ) {
        return false;
      }
      seen.add(m.id);
      return true;
    });

    if (isManagerView) {
      if (managerAssignedStates.length === 0) return [];
      list = list.filter((m) =>
        managerAssignedStates.some((as) => isStateMatchingAssigned(as, m.state, m.address))
      );
    }
    return list;
  }, [madaris, isManagerView, managerAssignedStates]);

  // Aggregated Statistics (strict to viewableMadaris for manager, platform-wide for super admin)
  const totalMadarisCount = viewableMadaris.length;
  const madarisWithSheetsCount = viewableMadaris.filter((m) => isMadrasaLinkedAndVerified(m)).length;
  const pendingRegistrationsCount = viewableMadaris.filter((m) => !isMadrasaLinkedAndVerified(m)).length;
  const madarisWithoutSheetsCount = pendingRegistrationsCount;
  
  const allStudentsList = useMemo(() => {
    const list: { student: StudentResult; madrasa: Madrasa; cls: MadrasaClass }[] = [];
    classes.forEach((cls) => {
      const parentM = viewableMadaris.find((m) => m.id === cls.madrasaId);
      if (parentM && Array.isArray(cls.students)) {
        cls.students.forEach((st) => {
          list.push({ student: st, madrasa: parentM, cls });
        });
      }
    });
    return list;
  }, [classes, viewableMadaris]);

  const totalStudentsCount = allStudentsList.length;
  const publishedClassesCount = classes.filter((c) => c.status === 'published').length;
  const unpublishedClassesCount = classes.filter((c) => c.status !== 'published').length;

  // Selected Madrasa Students
  const selectedMadrasaStudents = useMemo(() => {
    if (isAllMadaris || !selectedMadrasa) {
      return allStudentsList;
    }
    return allStudentsList.filter((item) => item.madrasa.id === selectedMadrasa.id);
  }, [allStudentsList, selectedMadrasa, isAllMadaris]);

  // Filtered Students for Tab 3
  const displayedStudents = useMemo(() => {
    return selectedMadrasaStudents.filter((item) => {
      const matchClass = filterStudentClass === 'all' || item.cls.id === filterStudentClass;
      const q = searchStudentQuery.trim().toLowerCase();
      const matchSearch =
        !q ||
        item.student.studentId.toLowerCase().includes(q) ||
        item.student.studentName.toLowerCase().includes(q) ||
        item.student.fatherName.toLowerCase().includes(q) ||
        (item.student.studentNameEn && item.student.studentNameEn.toLowerCase().includes(q));
      return matchClass && matchSearch;
    });
  }, [selectedMadrasaStudents, filterStudentClass, searchStudentQuery]);

  // Opened Madrasa Object
  const openedMadrasa = useMemo(() => {
    if (!openedMadrasaId) return null;
    return viewableMadaris.find((m) => m.id === openedMadrasaId) || null;
  }, [openedMadrasaId, viewableMadaris]);

  const openedMadrasaClasses = useMemo(() => {
    if (!openedMadrasa) return [];
    return classes.filter((c) => c.madrasaId === openedMadrasa.id);
  }, [openedMadrasa, classes]);

  const openedMadrasaStudents = useMemo(() => {
    if (!openedMadrasa) return [];
    return allStudentsList.filter((item) => item.madrasa.id === openedMadrasa.id);
  }, [openedMadrasa, allStudentsList]);

  const filteredMadaris = useMemo(() => {
    let list = [...viewableMadaris];

    if (madrasaFilter === 'pending' || madrasaFilter === 'unlinked') {
      list = list.filter((m) => !isMadrasaLinkedAndVerified(m));
    } else if (madrasaFilter === 'linked') {
      list = list.filter((m) => isMadrasaLinkedAndVerified(m));
    }

    // Always prioritize pending / unverified registrations so they appear FIRST at the top!
    list.sort((a, b) => {
      const aPending = !isMadrasaLinkedAndVerified(a);
      const bPending = !isMadrasaLinkedAndVerified(b);
      if (aPending && !bPending) return -1;
      if (!aPending && bPending) return 1;
      return (Number(b.serialNumber) || 0) - (Number(a.serialNumber) || 0);
    });

    const q = madrasaSearchQuery.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (m) =>
        (m.urduName && m.urduName.toLowerCase().includes(q)) ||
        (m.englishName && m.englishName.toLowerCase().includes(q)) ||
        (m.code && m.code.toLowerCase().includes(q)) ||
        (m.state && m.state.toLowerCase().includes(q)) ||
        (m.district && m.district.toLowerCase().includes(q))
    );
  }, [viewableMadaris, madrasaSearchQuery, madrasaFilter]);

  const managerPendingMadarisCount = useMemo(() => {
    return viewableMadaris.filter((m) => !isMadrasaLinkedAndVerified(m)).length;
  }, [viewableMadaris]);

  // Priority sorted classes for Students tab (highest student count first)
  const sortedClassesByStudents = useMemo(() => {
    return [...madrasaClasses].sort((a, b) => {
      const countA = a.students?.length || 0;
      const countB = b.students?.length || 0;
      return countB - countA;
    });
  }, [madrasaClasses]);

  // Recent Activity Feed for Dashboard Tab 1 (Summary only)
  const recentActivities = useMemo(() => {
    const list: {
      id: string;
      title: string;
      desc: string;
      time: string;
      type: 'madrasa' | 'result' | 'admission' | 'sheet';
    }[] = [];

    // Latest madaris
    madaris.slice(-3).reverse().forEach((m) => {
      list.push({
        id: `act-m-${m.id}`,
        title: `${m.urduName} (${m.code})`,
        desc: m.googleSheetUrl ? 'کلاؤڈ ریکارڈ منسلک اور لائیو سروس فعال' : 'نیا ادارہ کامیابی کے ساتھ رجسٹر ہوا',
        time: m.approvedAt ? new Date(m.approvedAt).toLocaleDateString('ur-PK') : 'حال ہی میں',
        type: 'madrasa',
      });
    });

    // Published classes
    classes
      .filter((c) => c.status === 'published')
      .slice(-3)
      .reverse()
      .forEach((c) => {
        const parent = madaris.find((m) => m.id === c.madrasaId);
        list.push({
          id: `act-c-${c.id}`,
          title: `شائع شدہ نتیجہ: درجہ ${c.name}`,
          desc: `${parent?.urduName || 'ادارہ'} کے نتائج پبلک رزلٹ پورٹل پر لائیو ہیں (${c.students?.length || 0} طلبہ)`,
          time: 'لائیو رزلٹ',
          type: 'result',
        });
      });

    // Recent students
    allStudentsList.slice(0, 3).forEach((item) => {
      list.push({
        id: `act-st-${item.student.studentId}`,
        title: `نیا داخلہ: ${item.student.studentName}`,
        desc: `اسٹوڈنٹ آئی ڈی ${item.student.studentId} · ${item.madrasa.urduName} (${item.cls.name})`,
        time: 'کامیاب داخلہ',
        type: 'admission',
      });
    });

    return list.slice(0, 5);
  }, [madaris, classes, allStudentsList]);

  // Filtered Students for Tab 3 (Students)
  const filteredStudentsTab3 = useMemo(() => {
    return allStudentsList.filter((item) => {
      // Madrasa filter
      if (studentFilterMadrasa !== 'all' && item.madrasa.id !== studentFilterMadrasa) {
        return false;
      }
      // Class filter
      if (
        studentFilterClassSelect !== 'all' &&
        item.cls.id !== studentFilterClassSelect &&
        item.cls.name !== studentFilterClassSelect
      ) {
        return false;
      }
      // Student ID search
      const idQuery = studentSearchId.trim().toLowerCase();
      if (idQuery && !item.student.studentId.toLowerCase().includes(idQuery)) {
        return false;
      }
      // Name search
      const nameQuery = studentSearchName.trim().toLowerCase();
      if (nameQuery) {
        const urduN = (item.student.studentName || '').toLowerCase();
        const enN = (item.student.studentNameEn || '').toLowerCase();
        const fUrdu = (item.student.fatherName || '').toLowerCase();
        const fEn = (item.student.fatherNameEn || '').toLowerCase();
        if (
          !urduN.includes(nameQuery) &&
          !enN.includes(nameQuery) &&
          !fUrdu.includes(nameQuery) &&
          !fEn.includes(nameQuery)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [allStudentsList, studentFilterMadrasa, studentFilterClassSelect, studentSearchId, studentSearchName]);

  // Save Madrasa
  const handleSaveMadrasa = async (
    data: Partial<Madrasa> & Omit<Madrasa, 'id' | 'createdAt'>,
    selectedClasses?: string[]
  ) => {
    setIsMadrasaModalOpen(false);
    if (editingMadrasa) {
      const incomingUrl = data.googleSheetUrl?.trim();
      const finalSheetUrl = incomingUrl || editingMadrasa.googleSheetUrl || '';
      const updatedMadrasa = {
        ...editingMadrasa,
        ...data,
        googleSheetUrl: finalSheetUrl,
      };
      const updatedList = await persistMadrasa(updatedMadrasa);
      setMadaris(updatedList);

      // If sheet URL is set or changed, propagate to all classes of this madrasa and sync immediately
      if (finalSheetUrl) {
        const targetClasses = classes.filter((c) => c.madrasaId === editingMadrasa.id);
        for (const cls of targetClasses) {
          await persistClass({
            ...cls,
            googleSheetUrl: finalSheetUrl,
            sheetTabName: cls.name,
            resultSourceType: 'google_sheet',
          });
        }
        try {
          const syncRes = await syncMadrasaGoogleSheet(editingMadrasa.id);
          if (syncRes.success) {
            if (syncRes.madaris) setMadaris(syncRes.madaris);
            if (syncRes.classes) setClasses(syncRes.classes);
          }
        } catch {}
      }

      await handleManualSync(true);
      showToast('مدرسہ کی تفصیلات اور شیٹ ریکارڈ کامیابی سے محفوظ ہو گئے');
    } else {
      const newMadrasa = {
        ...data,
        id: `madrasa-${Date.now()}`,
        createdAt: new Date().toISOString(),
      };
      const updatedList = await persistMadrasa(newMadrasa);
      setMadaris(updatedList);
      setSelectedMadrasaId(newMadrasa.id);
      showToast('نیا مدرسہ کامیابی سے شامل ہو گیا');

      // Create initial class records based on selected classes
      const classNames =
        selectedClasses && selectedClasses.length > 0
          ? selectedClasses
          : (defaultClassesList.length > 0 ? defaultClassesList.slice(0, 4) : DEFAULT_REGISTRATION_CLASSES.slice(0, 4));

      for (let i = 0; i < classNames.length; i++) {
        const cName = classNames[i];
        const newCls: MadrasaClass = {
          id: `class-${newMadrasa.code}-${i + 1}-${Date.now()}`,
          madrasaId: newMadrasa.id,
          name: cName,
          academicYear: '1447-1448ھ / 2025-2026ء',
          status: 'published',
          resultSourceType: 'google_sheet',
          googleSheetUrl: newMadrasa.googleSheetUrl || '',
          sheetTabName: cName,
          students: [],
          rawSourceData: '',
          lastTestedAt: new Date().toISOString(),
          testStatus: {
            success: true,
            message: 'کلاس تیار ہے',
            studentCount: 0,
            subjectCount: 0,
            subjects: [],
            missingFields: [],
          },
          updatedAt: new Date().toISOString(),
        };
        await persistClass(newCls);
      }

      if (!newMadrasa.googleSheetUrl) {
        // Asynchronously trigger sheet creation and linking
        const pureMadrasaName = cleanInstitutionName(newMadrasa.urduName);
        registerMadrasaWorkflow({
          code: newMadrasa.code,
          name: pureMadrasaName,
          classes: classNames,
          madrasaId: newMadrasa.id,
          webAppUrl: appsScriptWebAppUrl,
        })
          .then(async (res) => {
            const finalSheetUrl =
              (res && res.success && (res.sheetUrl || res.spreadsheetId))
                ? (res.sheetUrl || `https://docs.google.com/spreadsheets/d/${res.spreadsheetId}/edit`)
                : `https://docs.google.com/spreadsheets/create?title=${encodeURIComponent(newMadrasa.code + ' - ' + pureMadrasaName)}&folder=1HUVOzvuhbRrAO5qsw645dM4QZz75LSG9`;
            const sId = (res && res.spreadsheetId) ? res.spreadsheetId : '1HUVOzvuhbRrAO5qsw645dM4QZz75LSG9';

            const syncedMadrasa = {
              ...newMadrasa,
              googleSheetUrl: finalSheetUrl,
              spreadsheetId: sId,
            };
            await persistMadrasa(syncedMadrasa);

            // Propagate linked sheet to all classes of this madrasa
            const madrasaClsList = getStoredClasses().filter((c) => c.madrasaId === newMadrasa.id);
            for (const cls of madrasaClsList) {
              await persistClass({
                ...cls,
                googleSheetUrl: finalSheetUrl,
                sheetTabName: cls.name,
                resultSourceType: 'google_sheet',
              });
            }

            await handleManualSync();
            showToast(`کلاؤڈ ریکارڈ خودکار تیار و منسلک ہو گیا: ${newMadrasa.code}`);
          })
          .catch((e) => console.warn('Background registerMadrasaWorkflow notice:', e));
      } else {
        await handleManualSync();
      }
    }
    setEditingMadrasa(null);
  };

  // Delete Madrasa
  const handleDeleteMadrasa = (id: string) => {
    const target = madaris.find((m) => m.id === id || m.code === id);
    const targetId = target?.id || id;
    const targetCode = target?.code;

    setConfirmDialog({
      title: 'مدرسہ حذف کریں',
      message: `کیا آپ واقعی مدرسہ "${target?.urduName || ''}" اور اس کے تمام امتحانی ریکارڈز حذف کرنا چاہتے ہیں؟`,
      onConfirm: async () => {
        if (targetId) addDeletedMadrasaId(targetId);
        if (targetCode) addDeletedMadrasaId(targetCode);
        if (id) addDeletedMadrasaId(id);

        const { madaris: nextM, classes: nextC } = await deleteMadrasaFromServer(targetId || id);
        const filteredNextM = nextM.filter(
          (m) =>
            m.id !== targetId &&
            m.id !== id &&
            (!targetCode || (m.code && m.code.toUpperCase() !== targetCode.toUpperCase()))
        );
        const filteredNextC = nextC.filter(
          (c) =>
            c.madrasaId !== targetId &&
            c.madrasaId !== id &&
            (!targetCode || (c.madrasaId && c.madrasaId.toUpperCase() !== targetCode.toUpperCase()))
        );

        setMadaris(filteredNextM);
        setClasses(filteredNextC);
        if (selectedMadrasaId === id || selectedMadrasaId === targetId || selectedMadrasaId === targetCode) {
          setSelectedMadrasaId(filteredNextM[0]?.id || 'all');
        }
        if (openedMadrasaId === id || openedMadrasaId === targetId || openedMadrasaId === targetCode) {
          setOpenedMadrasaId(null);
        }
        if (resultsMadrasaScope === id || resultsMadrasaScope === targetId || resultsMadrasaScope === targetCode) {
          setResultsMadrasaScope('all');
        }
        setConfirmDialog(null);
        showToast('مدرسہ اور تمام درجات مکمل طور پر حذف کر دیے گئے');
      },
    });
  };

  // Save Class
  const handleSaveClass = async (data: Omit<MadrasaClass, 'id' | 'updatedAt'>) => {
    setIsClassModalOpen(false);
    if (editingClass) {
      const updatedClass = { ...editingClass, ...data, updatedAt: new Date().toISOString() };
      const updatedList = await persistClass(updatedClass);
      setClasses(updatedList);
      showToast('درجہ اور رزلٹ اپ ڈیٹ ہو گئے');
    } else {
      const newClass: MadrasaClass = {
        ...data,
        id: `class-${Date.now()}`,
        updatedAt: new Date().toISOString(),
      };
      const updatedList = await persistClass(newClass);
      setClasses(updatedList);
      showToast('نیا درجہ کامیابی سے شامل ہو گیا');
    }
    setEditingClass(null);
  };

  // Delete Class
  const handleDeleteClass = (id: string) => {
    const target = classes.find((c) => c.id === id);
    setConfirmDialog({
      title: 'درجہ حذف کریں',
      message: `کیا آپ درجہ "${target?.name || ''}" کا تمام ریکارڈ حذف کرنا چاہتے ہیں؟`,
      onConfirm: async () => {
        const updatedList = await deleteClassFromServer(id);
        setClasses(updatedList);
        setConfirmDialog(null);
        showToast('درجہ حذف کر دیا گیا');
      },
    });
  };

  // Toggle Class Publish
  const handleTogglePublish = async (cls: MadrasaClass) => {
    const nextStatus: MadrasaClass['status'] =
      cls.status === 'published' ? 'unpublished' : 'published';
    const updatedClass = { ...cls, status: nextStatus };
    const updatedList = await persistClass(updatedClass);
    setClasses(updatedList);
    showToast(
      nextStatus === 'published'
        ? '✅ نتیجہ لائیو شائع ہو گیا (طلباء رزلٹ پورٹل پر دیکھ سکتے ہیں)'
        : 'نتیجہ غیر شائع (Unpublished) ہو گیا'
    );
  };

  // Student Save (Add / Edit) with Auto Sync to Class & Master
  const handleSaveStudent = async (student: StudentResult, targetClassId: string) => {
    const targetCls = classes.find((c) => c.id === targetClassId);
    if (!targetCls) return;

    let updatedStudents = [...(targetCls.students || [])];
    const existingIndex = updatedStudents.findIndex((s) => s.studentId === student.studentId);

    if (existingIndex >= 0) {
      updatedStudents[existingIndex] = student;
    } else {
      updatedStudents.push(student);
    }

    // Regenerate Class CSV
    const subjects = targetCls.testStatus?.subjects || [
      { name: 'دینیات', maxMarks: 100 },
      { name: 'اردو', maxMarks: 50 },
      { name: 'عربی', maxMarks: 100 },
    ];
    const newCsv = buildClassTabCsv(targetCls.name, subjects, updatedStudents);

    const updatedCls: MadrasaClass = {
      ...targetCls,
      students: updatedStudents,
      rawSourceData: newCsv,
      updatedAt: new Date().toISOString(),
    };

    const nextClasses = await persistClass(updatedCls);
    setClasses(nextClasses);
    showToast(`طالب علم (${student.studentId} - ${student.studentName}) محفوظ اور سنک ہو گیا!`);
  };

  // Delete Student
  const handleDeleteStudent = async (studentId: string, classId: string) => {
    const cls = classes.find((c) => c.id === classId);
    if (!cls) return;

    setConfirmDialog({
      title: 'طالب علم حذف کریں',
      message: `کیا آپ واقعی اس طالب علم (ID: ${studentId}) کا ریکارڈ حذف کرنا چاہتے ہیں؟`,
      onConfirm: async () => {
        const nextStudents = cls.students.filter((s) => s.studentId !== studentId);
        const subjects = cls.testStatus?.subjects || [{ name: 'دینیات', maxMarks: 100 }];
        const newCsv = buildClassTabCsv(cls.name, subjects, nextStudents);
        const updatedCls: MadrasaClass = {
          ...cls,
          students: nextStudents,
          rawSourceData: newCsv,
          updatedAt: new Date().toISOString(),
        };
        const nextClasses = await persistClass(updatedCls);
        setClasses(nextClasses);
        setConfirmDialog(null);
        showToast('طالب علم کا ریکارڈ حذف ہو گیا');
      },
    });
  };

  // Save Kaifiyat (Central Default or Madrasa-specific)
  const handleSaveKaifiyat = async (rules: KaifiyatRule[], passing: PassingSettings, applyToAll?: boolean) => {
    try {
      if (selectedMadrasaForKaifiyat) {
        // Madrasa-specific custom result logic
        await saveMadrasaCustomResultLogic(selectedMadrasaForKaifiyat.id, rules, passing);
        const { madaris: mList, classes: cList } = await syncWithServer();
        setMadaris(mList);
        setClasses(cList);
        setIsKaifiyatModalOpen(false);
        setSelectedMadrasaForKaifiyat(null);
        showToast(`${selectedMadrasaForKaifiyat.urduName} کا رزلٹ لاجک محفوظ اور تمام نتائج اپ ڈیٹ ہو گئے`);
      } else {
        // Central default result logic for all madaris
        const res = await saveCentralResultLogic(rules, passing, Boolean(applyToAll));
        setMadaris(res.madaris);
        setClasses(res.classes);
        setIsKaifiyatModalOpen(false);
        setSelectedMadrasaForKaifiyat(null);
        showToast(applyToAll ? 'مرکزی رزلٹ لاجک تمام مدارس پر نافذ ہو گئی' : 'مرکزی ڈیفالٹ رزلٹ لاجک محفوظ ہو گئی');
      }
    } catch (e) {
      console.error('Failed to save kaifiyat rules:', e);
      showToast('رزلٹ لاجک محفوظ کرنے میں مسئلہ پیش آیا');
    }
  };

  // Download Report
  const handleDownloadReport = () => {
    if (!selectedMadrasa) return;
    const activeClasses = selectedResultClassId === 'all'
      ? madrasaClasses
      : madrasaClasses.filter((c) => c.id === selectedResultClassId);

    const header = 'Student ID,Candidate Name,Father Name,Class,Total Marks,Obtained Marks,Percentage,Kaifiyat\n';
    let rows = '';

    activeClasses.forEach((cls) => {
      (cls.students || []).forEach((s) => {
        rows += `"${s.studentId}","${s.studentName}","${s.fatherName}","${cls.name}","${s.totalMarks}","${s.obtainedMarks}","${s.percentage}%","${s.kaifiyat}"\n`;
      });
    });

    const blob = new Blob(['\uFEFF' + header + rows], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${selectedMadrasa.code}_Results_Report_${Date.now()}.csv`;
    link.click();
    showToast('امتحانی رپورٹ کامیابی سے ڈاؤن لوڈ ہو گئی');
  };

  // Result Rankings & Scopes
  const resultScopeStudents = useMemo(() => {
    const list: { student: StudentResult; madrasa: Madrasa; cls: MadrasaClass }[] = [];
    const targetMadaris = resultsMadrasaScope === 'all'
      ? madaris
      : madaris.filter((m) => m.id === resultsMadrasaScope);

    targetMadaris.forEach((m) => {
      const mClasses = classes.filter((c) => c.madrasaId === m.id);
      mClasses.forEach((cls) => {
        (cls.students || []).forEach((st) => {
          list.push({ student: st, madrasa: m, cls });
        });
      });
    });
    return list;
  }, [madaris, classes, resultsMadrasaScope]);

  const top10Institution = useMemo(() => {
    return [...resultScopeStudents]
      .filter((s) => isStudentEligibleForTopPerformers(s.student))
      .sort((a, b) => b.student.percentage - a.student.percentage)
      .slice(0, 10);
  }, [resultScopeStudents]);

  const top3ByClass = useMemo(() => {
    const map: Record<string, { student: any; cls: any; madrasa: any }[]> = {};
    for (const item of resultScopeStudents) {
      if (!map[item.cls.id]) {
        map[item.cls.id] = [];
      }
      map[item.cls.id].push(item);
    }
    const res: Record<string, { student: any; cls: any; madrasa: any }[]> = {};
    for (const [clsId, list] of Object.entries(map)) {
      res[clsId] = [...list]
        .filter((s) => isStudentEligibleForTopPerformers(s.student))
        .sort((a, b) => (b.student.percentage || 0) - (a.student.percentage || 0))
        .slice(0, 3);
    }
    return res;
  }, [resultScopeStudents]);

  const resultScopeClasses = useMemo(() => {
    if (resultsMadrasaScope === 'all') {
      return classes;
    }
    return classes.filter((c) => c.madrasaId === resultsMadrasaScope);
  }, [classes, resultsMadrasaScope]);

  const filteredResultStudents = useMemo(() => {
    let list = resultScopeStudents;
    if (selectedResultClassId !== 'all') {
      list = list.filter((item) => item.cls.id === selectedResultClassId);
    }
    return list;
  }, [resultScopeStudents, selectedResultClassId]);

  const sortedClassesByEnrolment = useMemo(() => {
    return [...classes].sort((a, b) => (b.students?.length || 0) - (a.students?.length || 0));
  }, [classes]);

  const drawerMadrasa = useMemo(() => {
    if (!drawerMadrasaId) return null;
    return madaris.find((m) => m.id === drawerMadrasaId) || null;
  }, [drawerMadrasaId, madaris]);

  // If a specific madrasa is clicked, render its dedicated portal full-screen
  // (Never nested inside AdminDashboard layout to avoid double sidebars and squished margins)
  if (openedMadrasa) {
    return (
      <PrincipalPortal
        madrasa={openedMadrasa}
        classes={classes}
        onLogout={onLogout}
        onViewPublic={onViewPublic}
        onBack={() => setOpenedMadrasaId(null)}
        onRefreshData={async () => {
          const { madaris: mList, classes: cList } = await syncWithServer();
          setMadaris(mList);
          setClasses(cList);
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-stone-100 font-sans text-stone-900 pb-24 lg:pb-8 select-none lg:pl-64">
      <style>{`@media (min-width: 1024px) { .bottom-nav-dock { display: none !important; } }`}</style>

      {/* Sleek Fixed Desktop Sidebar (min-width: 1024px) - Fixed Left-to-Right */}
      <aside
        className="hidden lg:flex lg:flex-col lg:fixed lg:top-0 lg:bottom-0 lg:w-64 bg-emerald-950 text-white z-40 shadow-xl border-r border-emerald-900/60 left-0 font-urdu"
        dir="rtl"
      >
        {/* Institutional Header & Logo */}
        <div className="p-5 border-b border-emerald-900/80 flex items-center gap-3">
          <img
            src={portalLogo || '/logo.jpg'}
            alt="Logo"
            className="w-10 h-10 rounded-2xl object-contain bg-white p-1 border border-amber-400/40 shadow-xs shrink-0"
            onError={(e) => {
              (e.target as HTMLImageElement).src = '/logo.jpg';
            }}
          />
          <div>
            <h2 className={`font-bold text-amber-300 text-base leading-tight tracking-wide ${isEn ? 'font-sans' : 'font-aslam text-lg'}`}>
              {t.portalTitle}
            </h2>
            <p className="text-[11px] text-emerald-300/80 -mt-0.5">
              مرکزی امتحانی پورٹل
            </p>
          </div>
        </div>

        {/* 5 Clean Navigation Tabs */}
        <nav className="flex-1 p-3 space-y-1.5 overflow-y-auto">
          {/* 1. Dashboard */}
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-2xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'dashboard'
                ? 'bg-amber-400 text-emerald-950 shadow-md font-extrabold'
                : 'text-emerald-100/90 hover:bg-emerald-900/60 hover:text-white'
            }`}
          >
            <LayoutDashboard className="w-5 h-5 shrink-0" />
            <span>{t.dashboard}</span>
          </button>

          {/* Install Button placed strictly below Dashboard menu item */}
          <div className="pt-0.5 pb-1">
            <PWAInstallButton
              variant="sidebar"
              label={isEn ? '📱 Install App' : '📱 ایپ انسٹال کریں'}
            />
          </div>

          {/* 2. Madaris */}
          <button
            onClick={() => setActiveTab('madrasas')}
            className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-2xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'madrasas'
                ? 'bg-amber-400 text-emerald-950 shadow-md font-extrabold'
                : 'text-emerald-100/90 hover:bg-emerald-900/60 hover:text-white'
            }`}
          >
            <Building2 className="w-5 h-5 shrink-0" />
            <span>{t.madrasas}</span>
          </button>

          {/* 2.2. State Managers (Super Admin only - placed prominently) */}
          {!isManagerView && (
            <button
              onClick={() => setActiveTab('state_managers')}
              className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-2xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'state_managers'
                  ? 'bg-amber-400 text-emerald-950 shadow-md font-extrabold'
                  : 'text-emerald-100/90 hover:bg-emerald-900/60 hover:text-white'
              }`}
            >
              <ShieldCheck className="w-5 h-5 shrink-0" />
              <span>صوبائی مینیجرز</span>
            </button>
          )}

          {/* 3. Students */}
          <button
            onClick={() => setActiveTab('students')}
            className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-2xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'students'
                ? 'bg-amber-400 text-emerald-950 shadow-md font-extrabold'
                : 'text-emerald-100/90 hover:bg-emerald-900/60 hover:text-white'
            }`}
          >
            <Users className="w-5 h-5 shrink-0" />
            <span>{t.students}</span>
          </button>

          {/* 4. Results */}
          <button
            onClick={() => setActiveTab('results')}
            className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-2xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'results'
                ? 'bg-amber-400 text-emerald-950 shadow-md font-extrabold'
                : 'text-emerald-100/90 hover:bg-emerald-900/60 hover:text-white'
            }`}
          >
            <Award className="w-5 h-5 shrink-0" />
            <span>{t.results}</span>
          </button>

          {/* 4.5. Feedbacks & Suggestions */}
          <button
            onClick={() => setActiveTab('feedbacks')}
            className={`w-full flex items-center justify-between px-3.5 py-3 rounded-2xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'feedbacks'
                ? 'bg-amber-400 text-emerald-950 shadow-md font-extrabold'
                : 'text-emerald-100/90 hover:bg-emerald-900/60 hover:text-white'
            }`}
          >
            <div className="flex items-center gap-3">
              <MessageSquareQuote className="w-5 h-5 shrink-0" />
              <span>{isEn ? 'Feedback & Suggestions' : 'تجاویز و فیڈ بیک'}</span>
            </div>
            {unreadFeedbacksCount > 0 && (
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                activeTab === 'feedbacks'
                  ? 'bg-rose-600 text-white'
                  : 'bg-amber-400 text-emerald-950'
              }`}>
                {unreadFeedbacksCount}
              </span>
            )}
          </button>

          {/* 5. Settings */}
          <button
            onClick={() => setActiveTab('settings')}
            className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-2xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'settings' || activeTab === 'more'
                ? 'bg-amber-400 text-emerald-950 shadow-md font-extrabold'
                : 'text-emerald-100/90 hover:bg-emerald-900/60 hover:text-white'
            }`}
          >
            <Settings className="w-5 h-5 shrink-0" />
            <span>{t.settings}</span>
          </button>
        </nav>

        {/* Sidebar Footer Controls */}
        <div className="p-4 border-t border-emerald-900/80 space-y-2 bg-emerald-950/80">
          <div className="flex items-center justify-between gap-2">
            <button
              onClick={toggleLanguage}
              className="flex-1 py-2 px-3 rounded-xl bg-emerald-900/80 hover:bg-emerald-800 text-amber-300 text-xs font-bold flex items-center justify-center gap-1.5 border border-emerald-700/60 cursor-pointer transition-all"
              title="زبان تبدیل کریں"
            >
              <Globe className="w-3.5 h-3.5 text-amber-400" />
              <span>{t.switchLang}</span>
            </button>

            <button
              onClick={onLogout}
              className="py-2 px-3 rounded-xl bg-rose-950/80 hover:bg-rose-900 text-rose-300 text-xs font-bold flex items-center justify-center gap-1 border border-rose-800/60 cursor-pointer transition-all"
              title={t.logout}
            >
              <Lock className="w-3.5 h-3.5" />
            </button>
          </div>

          <button
            onClick={onViewPublic}
            className="w-full py-2.5 px-3 rounded-xl bg-amber-400 hover:bg-amber-300 text-emerald-950 text-xs font-bold flex items-center justify-center gap-2 shadow-xs cursor-pointer transition-all"
          >
            <Eye className="w-4 h-4" />
            <span>آن لائن رزلٹ پورٹل</span>
          </button>
        </div>
      </aside>

      {/* Mobile Top Bar (Hidden on Desktop) */}
      <header className="lg:hidden sticky top-0 z-40 bg-gradient-to-r from-emerald-950 via-emerald-900 to-teal-950 text-white shadow-md border-b border-emerald-800/40" dir="ltr">
        <div className="w-full px-4 py-2.5 flex items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <img
              src={portalLogo || '/logo.jpg'}
              alt="Meyar-e-Madaris Logo"
              className="w-8 h-8 rounded-xl object-contain bg-white p-0.5 border border-amber-400/40 shadow-xs shrink-0"
              onError={(e) => {
                (e.target as HTMLImageElement).src = '/logo.jpg';
              }}
            />
            <div className="min-w-0 flex-1">
              <h1 className={`text-base sm:text-lg font-bold tracking-wide text-amber-300 truncate whitespace-nowrap ${isEn ? 'font-sans' : 'font-aslam text-lg sm:text-xl'}`}>
                {t.portalTitle}
              </h1>
              <p className={`text-[10px] text-emerald-200/90 -mt-0.5 truncate whitespace-nowrap ${isEn ? 'font-sans' : 'font-urdu'}`}>
                {t.portalSubtitle}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={toggleLanguage}
              className="px-2.5 py-1.5 rounded-xl bg-amber-400/20 hover:bg-amber-400/30 text-amber-300 border border-amber-400/40 text-xs font-bold transition-all flex items-center gap-1 cursor-pointer shrink-0"
              title="Switch Language / زبان تبدیل کریں"
            >
              <Globe className="w-3.5 h-3.5 text-amber-400" />
              <span>{t.switchLang}</span>
            </button>

            <button
              onClick={onLogout}
              className="p-1.5 rounded-xl bg-rose-950/60 hover:bg-rose-900/80 text-rose-300 border border-rose-800/40 transition-all cursor-pointer shrink-0"
              title={t.logout}
            >
              <Lock className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Floating One-Line Notification Overlay at bottom: prevents covering top toolbar buttons or causing layout shift */}
      {toastNotification && (
        <div
          dir="rtl"
          className="fixed bottom-20 lg:bottom-5 left-4 right-4 z-40 pointer-events-none flex justify-center"
        >
          <div
            className={`pointer-events-auto max-w-md w-full py-2.5 px-4 sm:px-5 rounded-2xl border text-xs sm:text-sm font-bold flex items-center justify-between gap-3 shadow-xl transition-colors ${
              toastNotification.type === 'error'
                ? 'bg-rose-600 text-white border-rose-700'
                : 'bg-emerald-700 text-white border-emerald-800'
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              {toastNotification.type === 'error' ? (
                <XCircle className="w-4 h-4 text-white shrink-0" />
              ) : (
                <CheckCircle2 className="w-4 h-4 text-emerald-200 shrink-0" />
              )}
              <span className="truncate leading-normal">{toastNotification.message}</span>
            </div>

            <button
              type="button"
              onClick={() => {
                if (toastTimerRef.current) {
                  clearTimeout(toastTimerRef.current);
                  toastTimerRef.current = null;
                }
                setToastNotification(null);
              }}
              className="p-1 rounded-md text-white/80 hover:text-white hover:bg-black/10 transition-colors shrink-0 cursor-pointer"
              aria-label="بند کریں"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Main App Content Viewport - Full-Screen Desktop Experience */}
      <main className="w-full px-4 sm:px-6 lg:px-8 xl:px-12 2xl:px-16 py-6 pb-28 lg:pb-8 space-y-6">

        {/* State Manager Role Banner */}
        {isManagerView && currentManager && (
          <div className="bg-gradient-to-r from-emerald-950 via-teal-900 to-emerald-900 text-white p-4 sm:p-5 rounded-3xl shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border border-emerald-600/50 font-urdu animate-fade-in">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-amber-400 text-emerald-950 flex items-center justify-center font-bold shrink-0 shadow-md">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-base sm:text-lg text-amber-300 font-aslam leading-snug">
                    صوبائی مینیجر پورٹل: {currentManager.name}
                  </h3>
                  <span className="font-mono text-xs bg-white/20 px-2 py-0.5 rounded-md font-bold text-emerald-100">
                    @{currentManager.username}
                  </span>
                </div>
                <p className="text-xs text-emerald-200 mt-0.5">
                  تفویض کردہ ریاستیں: <strong className="text-white">{currentManager.assignedStates?.join('، ') || 'کوئی ریاست تفویض نہیں'}</strong>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setActiveTab('madrasas');
                  setMadrasaFilter('unlinked');
                }}
                className="px-3.5 py-2 rounded-2xl bg-amber-400 hover:bg-amber-300 text-emerald-950 text-xs font-bold flex items-center gap-2 cursor-pointer shadow-md transition-all hover:scale-105"
              >
                <Clock className="w-4 h-4 text-emerald-950" />
                <span>زیر التوا مدارس کی تصدیق ({managerPendingMadarisCount})</span>
              </button>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* 1. DASHBOARD TAB (مرکزی آئکن والا ایپ ڈیش بورڈ) */}
        {/* ------------------------------------------------------------- */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6 animate-fade-in font-urdu">
            {/* Top Header: Clean greeting with an immediate primary button: "مدرسہ شامل کریں" */}
            <div className="bg-white rounded-3xl p-5 sm:p-6 border border-stone-200/80 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-center justify-center shrink-0 shadow-2xs">
                  <LayoutDashboard className="w-6 h-6 text-emerald-800" />
                </div>
                <div>
                  <h2 className="text-xl sm:text-2xl font-bold text-stone-900 leading-snug">
                    خوش آمدید، امتحانی منتظم
                  </h2>
                  <p className="text-xs text-stone-500 mt-0.5">
                    مرکزی امتحانی پورٹل معیارِ مدارس — تمام الحاق شدہ مدارس اور نتائج کا خلاصہ
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 sm:gap-2 flex-nowrap shrink-0 overflow-x-auto no-scrollbar py-1">
                <button
                  onClick={() => {
                    const shareUrl = window.location.origin + window.location.pathname + '#register-madrasa';
                    navigator.clipboard.writeText(shareUrl).then(() => {
                      showToast(isEn ? 'Registration link copied to clipboard!' : 'رجسٹریشن فارم کا لنک کاپی ہو گیا! پرنسپل کے ساتھ شیئر کریں۔');
                    });
                  }}
                  className="px-3 sm:px-4 py-2 sm:py-2.5 rounded-2xl bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-300 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-2xs whitespace-nowrap shrink-0"
                  title="پرنسپل کو شیئر کرنے کے لیے لنک کاپی کریں"
                >
                  <Share2 className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                  <span>{isEn ? 'Share Link' : 'شیئر لنک'}</span>
                </button>

                <button
                  onClick={() => {
                    window.location.hash = '#register-madrasa';
                  }}
                  className="px-3.5 sm:px-4 py-2 sm:py-2.5 bg-emerald-800 hover:bg-emerald-900 text-white rounded-2xl text-xs font-bold shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Plus className="w-4 h-4 text-amber-300 shrink-0" />
                  <span>{isEn ? 'Registration' : 'رجسٹریشن'}</span>
                </button>

                <button
                  onClick={() => handleManualSync(false)}
                  disabled={isServerSyncing}
                  className="px-3 sm:px-4 py-2 sm:py-2.5 rounded-2xl bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer border border-stone-200 whitespace-nowrap shrink-0"
                >
                  <RefreshCw className={`w-3.5 h-3.5 text-emerald-700 shrink-0 ${isServerSyncing ? 'animate-spin' : ''}`} />
                  <span>{isEn ? 'Sync' : 'سنک'}</span>
                </button>
              </div>
            </div>

            {/* Urgent Review Alert Banner on Dashboard */}
            {pendingRegistrationsCount > 0 && (
              <div
                onClick={() => {
                  setActiveTab('madrasas');
                  setMadrasaFilter('unlinked');
                }}
                className="p-4 bg-gradient-to-r from-amber-500 via-amber-600 to-amber-700 text-white rounded-3xl flex items-center justify-between gap-3 shadow-md cursor-pointer hover:brightness-105 transition-all"
              >
                <div className="flex items-center gap-3">
                  <span className="p-2.5 bg-white/20 rounded-2xl shrink-0 animate-pulse">
                    <ShieldAlert className="w-6 h-6 text-white" />
                  </span>
                  <div>
                    <h3 className="font-bold text-sm sm:text-base">
                      {isEn
                        ? `⚠️ ${pendingRegistrationsCount} New Madrasa Registration(s) Awaiting Verification!`
                        : `⚠️ ${pendingRegistrationsCount} نئی مدرسہ رجسٹریشن زیر جائزہ و تصدیق!`}
                    </h3>
                    <p className="text-xs text-amber-100 mt-0.5">
                      {isEn
                        ? 'New institutions have registered and are waiting for your approval. Click to verify and activate.'
                        : 'نئے ادارے نے رجسٹریشن مکمل کر لی ہے اور آپ کی تصدیق و منظوری کا منتظر ہے۔ کلک کر کے جائزہ و منظوری فرمائیں۔'}
                    </p>
                  </div>
                </div>
                <span className="px-3.5 py-2 bg-white text-amber-900 rounded-xl text-xs font-bold shrink-0 shadow-xs">
                  {isEn ? 'Review Now' : 'ابھی جائزہ لیں'}
                </span>
              </div>
            )}

            {/* Executive Analytics: High-level summary metrics (Total Madaris, Total Students, Results Published, Synced Sheets) */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {/* 1. Total Madaris */}
              <div
                onClick={() => setActiveTab('madrasas')}
                className="p-4 rounded-3xl bg-white border border-stone-200/80 shadow-xs hover:border-emerald-500 cursor-pointer transition-all group"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-stone-600">{t.allMadaris}</span>
                  <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-800 flex items-center justify-center">
                    <Building2 className="w-4 h-4" />
                  </div>
                </div>
                <div className="mt-3 flex items-baseline justify-between">
                  <span className="text-3xl font-bold font-mono text-stone-900">{totalMadarisCount}</span>
                  <span className="text-[11px] text-emerald-700 font-semibold">{t.affiliated}</span>
                </div>
              </div>

              {/* 2. Total Students */}
              <div
                onClick={() => setActiveTab('students')}
                className="p-4 rounded-3xl bg-white border border-stone-200/80 shadow-xs hover:border-teal-500 cursor-pointer transition-all group"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-stone-600">{t.totalStudents}</span>
                  <div className="w-8 h-8 rounded-xl bg-teal-50 text-teal-800 flex items-center justify-center">
                    <Users className="w-4 h-4" />
                  </div>
                </div>
                <div className="mt-3 flex items-baseline justify-between">
                  <span className="text-3xl font-bold font-mono text-stone-900">{totalStudentsCount}</span>
                  <span className="text-[11px] text-teal-700 font-semibold">{t.enrolled}</span>
                </div>
              </div>

              {/* 3. Results Published */}
              <div
                onClick={() => setActiveTab('results')}
                className="p-4 rounded-3xl bg-white border border-stone-200/80 shadow-xs hover:border-purple-500 cursor-pointer transition-all group"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-stone-600">{t.publishedResultsCount}</span>
                  <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-800 flex items-center justify-center">
                    <Award className="w-4 h-4" />
                  </div>
                </div>
                <div className="mt-3 flex items-baseline justify-between">
                  <span className="text-3xl font-bold font-mono text-stone-900">{publishedClassesCount}</span>
                  <span className="text-[11px] text-purple-700 font-semibold">{t.classesLive}</span>
                </div>
              </div>

              {/* 4. Synced Sheets */}
              <div
                onClick={() => setActiveTab('madrasas')}
                className="p-4 rounded-3xl bg-white border border-stone-200/80 shadow-xs hover:border-emerald-500 cursor-pointer transition-all group"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-stone-600">{t.syncedSheets}</span>
                  <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-800 flex items-center justify-center">
                    <FileSpreadsheet className="w-4 h-4" />
                  </div>
                </div>
                <div className="mt-3 flex items-baseline justify-between">
                  <span className="text-3xl font-bold font-mono text-stone-900">{madarisWithSheetsCount}</span>
                  <span className="text-[11px] text-emerald-700 font-semibold">{t.googleSheets}</span>
                </div>
              </div>
            </div>

            {/* ------------------------------------------------------------- */}
            {/* CLEAN SUMMARY OVERVIEW & RECENT ACTIVITY (صرف Summary — کوئی تفصیلی Data نہیں) */}
            {/* ------------------------------------------------------------- */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Left 2 Cols: Summary Status */}
              <div className="lg:col-span-2 space-y-4">
                <div className={`bg-white rounded-3xl p-5 border border-stone-200/80 shadow-xs space-y-4 ${isEn ? 'font-sans' : 'font-urdu'}`}>
                  <div className="flex items-center justify-between border-b border-stone-100 pb-3">
                    <div className="flex items-center gap-2">
                      <LayoutDashboard className="w-5 h-5 text-emerald-800" />
                      <h3 className="font-bold text-base text-stone-900">
                        {t.systemSummaryTitle}
                      </h3>
                    </div>
                    <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
                      {isEn ? 'Meyar-e-Madaris' : 'معیارِ مدارس'}
                    </span>
                  </div>

                  <p className="text-xs text-stone-600 leading-relaxed">
                    {t.systemSummaryDesc}
                  </p>

                  {/* Summary Metric Cards: 3 boxes on ONE Single Horizontal Line */}
                  <div className="grid grid-cols-3 gap-1.5 sm:gap-3 pt-1">
                    <div
                      onClick={() => setActiveTab('madrasas')}
                      className="p-2 sm:p-3.5 rounded-2xl bg-stone-50 hover:bg-emerald-50/50 border border-stone-200/80 hover:border-emerald-300 transition-all cursor-pointer group"
                    >
                      <span className="text-[10px] sm:text-[11px] font-bold text-stone-600 block truncate">{t.affiliated} {t.allMadaris}</span>
                      <div className="mt-1 flex items-baseline justify-between">
                        <span className="text-xl sm:text-2xl font-bold font-mono text-emerald-950">{totalMadarisCount}</span>
                        <Building2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-700 group-hover:scale-110 transition-transform hidden xs:block" />
                      </div>
                      <span className="text-[9px] sm:text-[10px] text-stone-400 block mt-1 truncate">
                        {isEn ? `${madarisWithSheetsCount} Sheets Linked` : `${madarisWithSheetsCount} کی شیٹ منسلک`}
                      </span>
                    </div>

                    <div
                      onClick={() => setActiveTab('students')}
                      className="p-2 sm:p-3.5 rounded-2xl bg-stone-50 hover:bg-teal-50/50 border border-stone-200/80 hover:border-teal-300 transition-all cursor-pointer group"
                    >
                      <span className="text-[10px] sm:text-[11px] font-bold text-stone-600 block truncate">{isEn ? 'Enrolled Students' : 'داخل شدہ طلبہ'}</span>
                      <div className="mt-1 flex items-baseline justify-between">
                        <span className="text-xl sm:text-2xl font-bold font-mono text-teal-950">{totalStudentsCount}</span>
                        <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-teal-700 group-hover:scale-110 transition-transform hidden xs:block" />
                      </div>
                      <span className="text-[9px] sm:text-[10px] text-stone-400 block mt-1 truncate">
                        {t.totalEnrollments}
                      </span>
                    </div>

                    <div
                      onClick={() => setActiveTab('results')}
                      className="p-2 sm:p-3.5 rounded-2xl bg-stone-50 hover:bg-purple-50/50 border border-stone-200/80 hover:border-purple-300 transition-all cursor-pointer group"
                    >
                      <span className="text-[10px] sm:text-[11px] font-bold text-stone-600 block truncate">{t.publishingStatus}</span>
                      <div className="mt-1 flex items-baseline justify-between">
                        <span className="text-xl sm:text-2xl font-bold font-mono text-purple-950">
                          {publishedClassesCount}
                          <span className="text-stone-400 text-xs sm:text-sm font-normal"> / {classes.length}</span>
                        </span>
                        <Award className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-purple-700 group-hover:scale-110 transition-transform hidden xs:block" />
                      </div>
                      <span className="text-[9px] sm:text-[10px] text-stone-400 block mt-1 truncate">
                        {publishedClassesCount} {isEn ? 'Live' : 'لائیو'}
                      </span>
                    </div>
                  </div>

                  {/* Direct Module Links */}
                  <div className="pt-3 border-t border-stone-100 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-bold text-stone-600">{t.quickAccess}</span>
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        onClick={() => setActiveTab('madrasas')}
                        className="px-3 py-1.5 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer"
                      >
                        <Building2 className="w-3.5 h-3.5 text-stone-600" />
                        <span>{t.madarisPortal}</span>
                      </button>
                      <button
                        onClick={() => setActiveTab('students')}
                        className="px-3 py-1.5 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer"
                      >
                        <Search className="w-3.5 h-3.5 text-stone-600" />
                        <span>{t.searchStudents}</span>
                      </button>
                      <button
                        onClick={() => setActiveTab('results')}
                        className="px-3 py-1.5 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer"
                      >
                        <Award className="w-3.5 h-3.5 text-stone-600" />
                        <span>{t.resultsAndRanking}</span>
                      </button>
                      {!isManagerView && (
                        <button
                          onClick={() => setActiveTab('state_managers')}
                          className="px-3 py-1.5 rounded-xl bg-amber-100 hover:bg-amber-200 text-emerald-950 text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer border border-amber-300"
                        >
                          <ShieldCheck className="w-3.5 h-3.5 text-emerald-900" />
                          <span>صوبائی مینیجرز</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Right 1 Col: Recent Activity Feed (صرف Recent Activity) */}
              <div className={`bg-white rounded-3xl p-5 border border-stone-200/80 shadow-xs space-y-3 ${isEn ? 'font-sans' : 'font-urdu'}`}>
                <div className="flex items-center justify-between border-b border-stone-100 pb-2.5">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-emerald-700" />
                    <h3 className="font-bold text-sm text-stone-900">
                      {t.recentActivitiesTitle}
                    </h3>
                  </div>
                  <span className="text-[10px] text-stone-400 font-mono">{t.realTime}</span>
                </div>

                <div className="space-y-2.5">
                  {recentActivities.length === 0 ? (
                    <p className="text-xs text-stone-400 text-center py-6">
                      {t.noRecentActivity}
                    </p>
                  ) : (
                    recentActivities.map((act) => (
                      <div
                        key={act.id}
                        className="p-3 rounded-2xl bg-stone-50 border border-stone-200/70 space-y-1 hover:bg-emerald-50/40 transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-xs text-stone-900">
                            {act.title}
                          </span>
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-white border border-stone-200 text-stone-600">
                            {act.time}
                          </span>
                        </div>
                        <p className="text-[11px] text-stone-500 leading-tight">
                          {act.desc}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Feedback & Suggestions Quick Access Card (at bottom of Dashboard) */}
            <div
              onClick={() => setActiveTab('feedbacks')}
              className="bg-gradient-to-r from-emerald-900 via-teal-900 to-emerald-950 text-white rounded-3xl p-4 sm:p-5 border border-emerald-700/60 shadow-md hover:shadow-lg transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-4 group"
            >
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-2xl bg-amber-400 text-emerald-950 flex items-center justify-center shrink-0 shadow-sm group-hover:scale-105 transition-transform">
                  <MessageSquareQuote className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="font-bold text-base sm:text-lg text-amber-300">
                      {isEn ? 'Notifications & Feedback / Suggestions' : 'نوٹیفکیشنز و تجاویز / فیڈ بیک'}
                    </h4>
                    {unreadFeedbacksCount > 0 && (
                      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-500 text-white animate-pulse">
                        {unreadFeedbacksCount} {isEn ? 'New' : 'نئے'}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-emerald-200/90 mt-0.5">
                    {isEn
                      ? 'View all user suggestions, feedback, and state-wise notifications received from the portal.'
                      : 'پورٹل سے موصول ہونے والی تمام عوامی تجاویز، آراء اور صوبائی نوٹیفکیشنز کی باضابطہ فہرست دیکھیں۔'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                <span className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold border border-white/20 transition-all flex items-center gap-1.5">
                  <span>{isEn ? 'Open Feedbacks' : 'تجاویز کھولیں'}</span>
                  <ChevronLeft className="w-4 h-4 text-amber-300 rtl:rotate-0 ltr:rotate-180" />
                </span>
              </div>
            </div>

          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* 2. MADRASAS TAB */}
        {/* ------------------------------------------------------------- */}
        {activeTab === 'madrasas' && (
          <div className="space-y-4 animate-fade-in font-urdu">
            {/* Global Alert Banner when there are pending registrations */}
            {pendingRegistrationsCount > 0 && (
              <div
                onClick={() => setMadrasaFilter(madrasaFilter === 'unlinked' ? 'all' : 'unlinked')}
                className="p-3.5 sm:p-4 bg-gradient-to-r from-amber-500 via-amber-600 to-amber-700 text-white rounded-3xl flex items-center justify-between gap-3 shadow-md cursor-pointer hover:brightness-105 transition-all"
              >
                <div className="flex items-center gap-2.5 sm:gap-3">
                  <span className="p-2 bg-white/20 rounded-2xl shrink-0 animate-pulse">
                    <ShieldAlert className="w-5 h-5 text-white" />
                  </span>
                  <div>
                    <span className="font-bold text-sm sm:text-base block">
                      {isEn
                        ? `⚠️ ${pendingRegistrationsCount} New Madrasa Registration(s) Pending Review!`
                        : `⚠️ ${pendingRegistrationsCount} نئی مدرسہ رجسٹریشن موصول — جائزہ و تصدیق فرمائیں!`}
                    </span>
                    <span className="text-[11px] sm:text-xs text-amber-100 block mt-0.5">
                      {isEn
                        ? 'Click here to inspect and verify. Examination records will activate only after approval.'
                        : 'رجسٹرڈ مدرسے کی تصدیق و منظوری کے لیے یہاں کلک کریں۔ قواعد کے مطابق منظوری کے بعد ہی امتحانی پورٹل و کلاؤڈ ریکارڈ فعال ہوگا۔'}
                    </span>
                  </div>
                </div>
                <span className="px-3 py-1.5 bg-white text-amber-900 rounded-xl text-xs font-bold shrink-0 shadow-xs">
                  {isEn ? 'Review Now' : 'ابھی جائزہ لیں'}
                </span>
              </div>
            )}

            {/* Banner when viewing Unlinked / Pending Filter */}
            {madrasaFilter === 'unlinked' && pendingRegistrationsCount === 0 && (
              <div className="p-4 bg-amber-50 border border-amber-300 rounded-3xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-amber-950 text-xs shadow-2xs">
                <div className="flex items-center gap-2.5">
                  <span className="p-2 bg-amber-200 text-amber-900 rounded-xl">
                    <ShieldAlert className="w-5 h-5 text-amber-800 shrink-0" />
                  </span>
                  <div>
                    <span className="font-bold text-sm block">
                      تمام ادارے تصدیق شدہ ہیں (0 زیر جائزہ)
                    </span>
                    <span className="text-[11px] text-amber-900/80 block mt-0.5">
                      اس وقت کوئی بھی غیر تصدیق شدہ یا زیر التواء مدرسہ موجود نہیں ہے۔
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setMadrasaFilter('all')}
                  className="px-3.5 py-1.5 bg-white border border-amber-300 hover:bg-amber-100 text-amber-900 font-bold rounded-xl text-xs transition-colors shrink-0 cursor-pointer shadow-2xs"
                >
                  تمام مدارس دکھائیں
                </button>
              </div>
            )}

            {/* Top Metrics Row: 3 Compact KPI Tiles on ONE Single Horizontal Line */}
                <div className="grid grid-cols-3 gap-1.5 sm:gap-3">
                  {/* 1. تمام مدارس */}
                  <div
                    onClick={() => setMadrasaFilter('all')}
                    className={`p-2.5 sm:p-4 rounded-2xl bg-white border shadow-2xs cursor-pointer transition-all ${
                      madrasaFilter === 'all'
                        ? 'border-emerald-500 ring-2 ring-emerald-200 bg-emerald-50/20'
                        : 'border-stone-200/80 hover:border-emerald-300'
                    }`}
                    title="تمام مدارس کی فہرست دکھائیں"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] sm:text-xs font-bold text-stone-600 block truncate">تمام مدارس</span>
                      <Building2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-700 shrink-0 hidden xs:block" />
                    </div>
                    <div className="mt-1 sm:mt-2 flex items-baseline justify-between">
                      <span className="text-lg sm:text-3xl font-bold font-mono text-stone-900">{totalMadarisCount}</span>
                      <span className="text-[9px] sm:text-[11px] text-stone-400 truncate">کل ادارے</span>
                    </div>
                  </div>

                  {/* 2. منظور و فعال */}
                  <div
                    onClick={() => setMadrasaFilter('linked')}
                    className={`p-2.5 sm:p-4 rounded-2xl bg-white border shadow-2xs cursor-pointer transition-all group ${
                      madrasaFilter === 'linked'
                        ? 'border-emerald-500 ring-2 ring-emerald-200 bg-emerald-50/40'
                        : 'border-stone-200/80 hover:border-emerald-300'
                    }`}
                    title="صرف تصدیق شدہ و منظور شدہ مدارس دیکھنے کے لیے کلک کریں"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] sm:text-xs font-bold text-emerald-900 flex items-center gap-1 truncate">
                        <CheckCircle2 className="w-3 h-3 sm:w-4 sm:h-4 text-emerald-600 shrink-0" />
                        <span className="truncate">منظور و فعال</span>
                      </span>
                      <FileSpreadsheet className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-700 shrink-0 hidden xs:block" />
                    </div>
                    <div className="mt-1 sm:mt-2 flex items-baseline justify-between">
                      <span className="text-lg sm:text-3xl font-bold font-mono text-emerald-700">{madarisWithSheetsCount}</span>
                      <span className="text-[9px] sm:text-[11px] text-emerald-600 font-semibold truncate">تصدیق شدہ</span>
                    </div>
                  </div>

                  {/* 3. غیر منسلک (زیر تصدیق مینیجر — پتہ چلے گا کس کو ویریفائی نہیں کیا گیا) */}
                  <div
                    onClick={() => setMadrasaFilter(madrasaFilter === 'unlinked' || madrasaFilter === 'pending' ? 'all' : 'unlinked')}
                    className={`p-2.5 sm:p-4 rounded-2xl bg-white border shadow-2xs cursor-pointer transition-all group ${
                      madrasaFilter === 'unlinked' || madrasaFilter === 'pending'
                        ? 'border-rose-500 ring-2 ring-rose-200 bg-rose-50/40'
                        : 'border-stone-200/80 hover:border-rose-300'
                    }`}
                    title="جن مدارس کی مینیجر نے تصدیق نہیں کی یا شیٹ منسلک نہیں ہے، وہ دیکھنے کے لیے کلک کریں"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] sm:text-xs font-bold text-rose-900 flex items-center gap-1 truncate">
                        <ShieldAlert className="w-3 h-3 sm:w-4 sm:h-4 text-rose-600 shrink-0" />
                        <span className="truncate">غیر منسلک</span>
                      </span>
                      <span className="text-[8px] sm:text-[10px] px-1 sm:px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 font-bold shrink-0 hidden xs:inline-block">
                        زیر جائزہ
                      </span>
                    </div>
                    <div className="mt-1 sm:mt-2 flex items-baseline justify-between">
                      <span className="text-lg sm:text-3xl font-bold font-mono text-rose-600">{madarisWithoutSheetsCount}</span>
                      <span className="text-[9px] sm:text-[11px] text-rose-600 font-bold truncate">تصدیق باقی</span>
                    </div>
                  </div>
                </div>

                {/* Search & Action Bar */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-3.5 rounded-3xl border border-stone-200/80 shadow-xs">
                  <div className="relative flex-1">
                    <Search className={`w-4 h-4 text-stone-400 absolute ${isEn ? 'left-3.5' : 'right-3.5'} top-3 pointer-events-none`} />
                    <input
                      type="text"
                      value={madrasaSearchQuery}
                      onChange={(e) => setMadrasaSearchQuery(e.target.value)}
                      placeholder={t.searchMadrasaPlaceholder}
                      className={`w-full ${isEn ? 'pl-10 pr-4' : 'pr-10 pl-4'} py-2 bg-stone-50 border border-stone-200 rounded-2xl text-xs font-semibold text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-700 transition-all`}
                    />
                    {madrasaSearchQuery && (
                      <button
                        onClick={() => setMadrasaSearchQuery('')}
                        className={`absolute ${isEn ? 'right-3' : 'left-3'} top-2.5 text-stone-400 hover:text-stone-700 cursor-pointer`}
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                    {!isManagerView && (
                      <button
                        type="button"
                        onClick={() => {
                          setScriptModalTab('central');
                          setIsScriptModalOpen(true);
                        }}
                        className="px-3 py-2 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-2xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
                        title="اسکرپٹ کوڈ اور ویب ایپ لنکس سیٹ اپ"
                      >
                        <FileSpreadsheet className="w-3.5 h-3.5 text-amber-700" />
                        <span className="hidden sm:inline">{isEn ? 'Script Code' : 'اسکرپٹ کوڈ'}</span>
                      </button>
                    )}

                    <button
                      onClick={() => {
                        const shareUrl = window.location.origin + window.location.pathname + '#register-madrasa';
                        navigator.clipboard.writeText(shareUrl).then(() => {
                          showToast(isEn ? 'Registration link copied!' : 'رجسٹریشن لنک کاپی ہو گیا!');
                        });
                      }}
                      className="px-3 py-2 bg-stone-100 hover:bg-emerald-50 text-stone-700 hover:text-emerald-900 border border-stone-200 rounded-2xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
                      title="پرنسپل وغیرہ کو فارم بھیجنے کے لیے لنک کاپی کریں"
                    >
                      <Share2 className="w-3.5 h-3.5 text-emerald-700" />
                      <span className="hidden sm:inline">{isEn ? 'Share Link' : 'فارم لنک کاپی'}</span>
                    </button>

                    <button
                      onClick={() => {
                        window.location.hash = '#register-madrasa';
                      }}
                      className="px-4 py-2 bg-emerald-800 hover:bg-emerald-900 text-white rounded-2xl text-xs font-bold shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
                    >
                      <Plus className="w-4 h-4 text-amber-300" />
                      <span>{isEn ? 'Register Madrasa' : 'نیا مدرسہ رجسٹر کریں'}</span>
                    </button>
                  </div>

                {/* Master List of All Madrasas - Clean Full Width */}
                <div className="bg-white rounded-3xl border border-stone-200/80 shadow-xs overflow-hidden">
                  <div className="p-3.5 border-b border-stone-100 flex items-center justify-between text-xs text-stone-500 font-bold">
                    <span>{t.madarisDirectory} ({filteredMadaris.length})</span>
                    <span className="text-[11px] text-stone-400">
                      {isEn ? 'Tap any madrasa to open its dedicated dashboard' : 'کسی مدرسے پر ٹیپ کر کے اس کا مکمل پرسنل پینل کھولیں'}
                    </span>
                  </div>

                  <div className="p-3 sm:p-4 space-y-2.5 max-h-[650px] overflow-y-auto">
                    {filteredMadaris.length === 0 ? (
                      <div className="p-8 text-center text-xs text-stone-400 bg-stone-50 rounded-2xl border border-stone-200">
                        {t.noMadrasaFound}
                      </div>
                    ) : (
                      filteredMadaris.map((m, idx) => {
                        const isViewerVerified = isMadrasaLinkedAndVerified(m);

                        return (
                          <div
                            key={`madrasa-card-${m.id}-${idx}`}
                            onClick={() => {
                              if (!isViewerVerified) {
                                setReviewingMadrasa(m);
                              } else {
                                setOpenedMadrasaId(m.id);
                              }
                            }}
                            className={`p-3 sm:p-3.5 rounded-2xl transition-all cursor-pointer border ${
                              isViewerVerified
                                ? 'bg-emerald-50/20 hover:bg-emerald-50/50 border-emerald-200/90 hover:border-emerald-300 shadow-2xs'
                                : 'bg-rose-50/20 hover:bg-rose-50/50 border-rose-200/90 hover:border-rose-300 shadow-2xs'
                            }`}
                            title={
                              isViewerVerified
                                ? (isEn ? 'Tap to open personal dashboard' : 'ٹیپ کر کے پرسنل پینل کھولیں')
                                : (isEn ? 'Pending: Tap to review & verify' : 'زیر التوا: کوائف کا جائزہ لیں اور تصدیق فرمائیں')
                            }
                          >
                            {/* Line 1: Madrasa Code & Full Madrasa Name (Strictly 1 Line) */}
                            <div className="flex items-center gap-2 min-w-0">
                              <span
                                className={`font-mono text-xs font-bold px-2 py-0.5 rounded-lg shrink-0 border ${
                                  isViewerVerified
                                    ? 'bg-emerald-100 text-emerald-950 border-emerald-300'
                                    : 'bg-rose-100 text-rose-950 border-rose-300'
                                }`}
                              >
                                {m.code}
                              </span>
                              <h3 className={`font-bold text-stone-900 group-hover:text-emerald-900 transition-colors text-sm sm:text-base leading-normal truncate min-w-0 flex-1 ${!isEn ? 'font-aslam text-base sm:text-lg' : ''}`}>
                                {isEn ? (m.englishName || m.urduName) : m.urduName}
                              </h3>
                            </div>

                            {/* Line 2: State & District (Strictly 1 Line) */}
                            <div className="mt-1 flex items-center gap-1.5 text-xs text-stone-600 font-medium min-w-0">
                              <MapPin className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                              <span className="font-semibold text-stone-700 truncate min-w-0 flex-1">
                                {m.state || m.district
                                  ? `${m.state || ''}${m.state && m.district ? ' · ' : ''}${m.district || ''}`
                                  : (m.address || (isEn ? 'Location not specified' : 'مقام درج نہیں'))}
                              </span>
                            </div>

                            {/* Line 3: Approval Status & All Action Buttons (Strictly 1 Line - No Wrapping) */}
                            <div
                              className="mt-2 pt-1.5 border-t border-stone-200/60 flex items-center justify-between gap-1 sm:gap-2 flex-nowrap overflow-hidden"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {/* Status Badges: Approval status & Google Sheet badge */}
                              <div className="flex items-center gap-1 sm:gap-1.5 flex-nowrap shrink-0">
                                {isViewerVerified ? (
                                  <span className="text-[10px] sm:text-[11px] bg-emerald-100 text-emerald-900 border border-emerald-300 px-1.5 sm:px-2 py-0.5 rounded-md font-bold flex items-center gap-1 shrink-0 whitespace-nowrap shadow-2xs">
                                    <ShieldCheck className="w-3 h-3 text-emerald-700 shrink-0" />
                                    <span>{isManagerView ? 'تصدیق شدہ' : 'منظور شدہ'}</span>
                                  </span>
                                ) : (
                                  <span
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setReviewingMadrasa(m);
                                    }}
                                    className="text-[10px] sm:text-[11px] bg-rose-100 text-rose-900 border border-rose-300 px-1.5 sm:px-2 py-0.5 rounded-md font-bold flex items-center gap-1 shrink-0 whitespace-nowrap shadow-2xs cursor-pointer hover:bg-rose-200 transition-colors"
                                    title="کلک کر کے تصدیق و منظوری فرمائیں"
                                  >
                                    <Clock className="w-3 h-3 text-rose-700 shrink-0" />
                                    <span>
                                      {isManagerView
                                        ? 'تصدیق باقی'
                                        : (m.managerVerified ? 'مینیجر تصدیق شدہ — منظوری باقی' : 'تصدیق باقی')}
                                    </span>
                                  </span>
                                )}

                                {m.googleSheetUrl && (
                                  <span title="کلاؤڈ امتحانی ریکارڈ منسلک ہے" className="text-[10px] sm:text-[11px] bg-emerald-50 text-emerald-800 border border-emerald-200 px-1 sm:px-1.5 py-0.5 rounded-md font-bold flex items-center gap-1 shrink-0 whitespace-nowrap shadow-2xs">
                                    <FileSpreadsheet className="w-3 h-3 text-emerald-600 shrink-0" />
                                    <span>کلاؤڈ ریکارڈ منسلک</span>
                                  </span>
                                )}
                              </div>

                              {/* All Action Buttons */}
                              <div className="flex items-center gap-1 sm:gap-1.5 shrink-0 flex-nowrap">
                                {/* Result On/Off Toggle Button */}
                                <button
                                  type="button"
                                  disabled={Boolean(togglingResultIds[m.id])}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleToggleResults(m);
                                  }}
                                  className={`w-6.5 h-6.5 sm:w-7 sm:h-7 rounded-lg flex items-center justify-center transition-colors shadow-2xs cursor-pointer border disabled:opacity-70 ${
                                    m.showPublicResults !== false
                                      ? 'bg-emerald-600 hover:bg-emerald-700 text-amber-300 border-emerald-500'
                                      : 'bg-rose-100 hover:bg-rose-200 text-rose-700 border-rose-300'
                                  }`}
                                  title={m.showPublicResults !== false ? 'رزلٹ آن ہے (کلک کر کے آف کریں)' : 'رزلٹ آف ہے (کلک کر کے آن کریں)'}
                                >
                                  <Power className={`w-3.5 h-3.5 ${m.showPublicResults !== false ? 'text-amber-300' : 'text-rose-600'}`} />
                                </button>

                                {/* Edit Button */}
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingMadrasa(m);
                                    setIsMadrasaModalOpen(true);
                                  }}
                                  className="w-6.5 h-6.5 sm:w-7 sm:h-7 rounded-lg text-stone-600 hover:text-emerald-900 bg-stone-100 hover:bg-emerald-50 border border-stone-200 hover:border-emerald-300 flex items-center justify-center cursor-pointer transition-colors shadow-2xs"
                                  title={isEn ? 'Edit Madrasa Details' : 'ایڈٹ تفصیلات ادارہ'}
                                >
                                  <Edit className="w-3.5 h-3.5" />
                                </button>

                                {/* Delete Button (Super Admin) */}
                                {!isManagerView && (
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteMadrasa(m.id)}
                                    className="w-6.5 h-6.5 sm:w-7 sm:h-7 rounded-lg text-rose-600 hover:text-rose-800 bg-rose-50 hover:bg-rose-100 border border-rose-200 hover:border-rose-300 flex items-center justify-center cursor-pointer transition-colors shadow-2xs"
                                    title={isEn ? 'Delete Madrasa' : 'مدرسہ حذف کریں'}
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}

                                {/* Action Arrow Button (Open Madrasa / Review) */}
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (!isViewerVerified) {
                                      setReviewingMadrasa(m);
                                    } else {
                                      setOpenedMadrasaId(m.id);
                                    }
                                  }}
                                  className={`w-6.5 h-6.5 sm:w-7 sm:h-7 rounded-full text-white flex items-center justify-center transition-all shadow-xs shrink-0 cursor-pointer ${
                                    isViewerVerified
                                      ? 'bg-emerald-600 hover:bg-emerald-700 hover:scale-105'
                                      : 'bg-rose-600 hover:bg-rose-700 hover:scale-105 animate-pulse'
                                  }`}
                                  title={
                                    isViewerVerified
                                      ? (isEn ? 'Verified & Active (Open Dashboard)' : 'فعال و تصدیق شدہ (پرسنل پینل کھولیں)')
                                      : (isEn ? 'Pending: Click to Verify' : 'زیر التوا: کلک کر کے جائزہ لیں اور تصدیق فرمائیں')
                                  }
                                >
                                  <ArrowRight className="w-3.5 h-3.5 rtl:rotate-180 transition-transform" />
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* 3. STUDENTS TAB */}
        {/* ------------------------------------------------------------- */}
        {activeTab === 'students' && (
          <div className={`space-y-4 animate-fade-in ${isEn ? 'font-sans' : 'font-urdu'}`}>
            {/* Top Metrics Bar: کل طلبہ | شائع شدہ نتائج | غیر شائع شدہ نتائج (ایک ہی لائن میں) */}
            <div className="bg-white p-2.5 sm:p-4 rounded-3xl border border-stone-200/80 shadow-xs grid grid-cols-3 gap-1.5 sm:gap-3">
              <div className="p-2 sm:p-3.5 rounded-2xl bg-stone-50 border border-stone-200/80 flex flex-col sm:flex-row items-center sm:justify-between text-center sm:text-right gap-1 sm:gap-2">
                <div className="min-w-0">
                  <span className="text-[10px] sm:text-[11px] font-bold text-stone-500 block truncate">{t.totalStudents}</span>
                  <span className="text-lg sm:text-2xl font-bold font-mono text-stone-900 mt-0.5 block">{totalStudentsCount}</span>
                </div>
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-teal-50 text-teal-800 flex items-center justify-center shrink-0">
                  <Users className="w-4 h-4 sm:w-5 sm:h-5" />
                </div>
              </div>

              <div className="p-2 sm:p-3.5 rounded-2xl bg-stone-50 border border-stone-200/80 flex flex-col sm:flex-row items-center sm:justify-between text-center sm:text-right gap-1 sm:gap-2">
                <div className="min-w-0">
                  <span className="text-[10px] sm:text-[11px] font-bold text-stone-500 block truncate">{isEn ? 'Published' : 'شائع شدہ'}</span>
                  <span className="text-lg sm:text-2xl font-bold font-mono text-emerald-800 mt-0.5 block">{publishedClassesCount}</span>
                </div>
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-emerald-50 text-emerald-800 flex items-center justify-center shrink-0">
                  <Award className="w-4 h-4 sm:w-5 sm:h-5" />
                </div>
              </div>

              <div className="p-2 sm:p-3.5 rounded-2xl bg-stone-50 border border-stone-200/80 flex flex-col sm:flex-row items-center sm:justify-between text-center sm:text-right gap-1 sm:gap-2">
                <div className="min-w-0">
                  <span className="text-[10px] sm:text-[11px] font-bold text-stone-500 block truncate">{isEn ? 'Unpublished' : 'غیر شائع'}</span>
                  <span className="text-lg sm:text-2xl font-bold font-mono text-stone-700 mt-0.5 block">{unpublishedClassesCount}</span>
                </div>
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-stone-100 text-stone-600 flex items-center justify-center shrink-0">
                  <Layers className="w-4 h-4 sm:w-5 sm:h-5" />
                </div>
              </div>
            </div>

            {/* Class-wise Enrolment Grid */}
            <div className="bg-white rounded-3xl p-5 border border-stone-200/80 shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-stone-100 pb-3">
                <div className="flex items-center gap-2">
                  <BookOpen className="w-5 h-5 text-emerald-800" />
                  <h3 className="font-bold text-base text-stone-900">
                    {t.classwiseEnrolmentSummary}
                  </h3>
                </div>
                <span className="text-xs text-stone-500 font-bold">
                  {t.priorityOrderClasses}
                </span>
              </div>

              {/* Responsive compact grid showing 3 to 4 classes per row (up to 12 classes across 3 neat rows) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {sortedClassesByEnrolment.slice(0, 12).map((cls) => {
                  const m = madaris.find((item) => item.id === cls.madrasaId);
                  const stList = cls.students || [];
                  const passedCount = stList.filter((s) => s.kaifiyat !== 'ناکام' && !s.isAbsent).length;
                  const mumtazCount = stList.filter((s) => s.kaifiyat === 'ممتاز').length;
                  const passPct = stList.length > 0 ? ((passedCount / stList.length) * 100).toFixed(0) : '0';

                  return (
                    <div
                      key={cls.id}
                      className="p-3.5 rounded-2xl bg-stone-50 border border-stone-200/80 hover:border-emerald-300 transition-all flex flex-col justify-between space-y-2.5"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-1.5">
                          <h4 className="font-bold text-sm text-stone-900 truncate">{cls.name}</h4>
                          <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-white text-stone-600 border border-stone-200 shrink-0">
                            {m?.code || 'MM'}
                          </span>
                        </div>
                        <p className="text-[11px] text-stone-500 truncate mt-0.5">
                          {isEn ? (m?.englishName || m?.urduName) : m?.urduName}
                        </p>
                      </div>

                      <div className="flex items-baseline justify-between pt-1 border-t border-stone-200/60">
                        <span className="text-[11px] text-stone-500">{isEn ? 'Enrolled Students:' : 'داخل شدہ طلبہ:'}</span>
                        <span className="text-xl font-bold font-mono text-emerald-950">{stList.length}</span>
                      </div>

                      <div className="grid grid-cols-3 gap-1 text-center font-mono text-xs">
                        <div className="bg-white p-1 rounded-lg border border-stone-200">
                          <span className="text-[9px] text-stone-400 block">{t.passed}</span>
                          <span className="font-bold text-emerald-800">{passedCount}</span>
                        </div>
                        <div className="bg-white p-1 rounded-lg border border-stone-200">
                          <span className="text-[9px] text-stone-400 block">{t.mumtazCount}</span>
                          <span className="font-bold text-amber-700">{mumtazCount}</span>
                        </div>
                        <div className="bg-white p-1 rounded-lg border border-stone-200">
                          <span className="text-[9px] text-stone-400 block">%</span>
                          <span className="font-bold text-stone-800">{passPct}%</span>
                        </div>
                      </div>

                      <div className="pt-1 flex items-center justify-between">
                        <span
                          className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                            cls.status === 'published'
                              ? 'bg-emerald-100 text-emerald-900 border border-emerald-200'
                              : 'bg-stone-200 text-stone-700 border border-stone-300'
                          }`}
                        >
                          {cls.status === 'published' ? (isEn ? 'Published' : 'شائع شدہ') : (isEn ? 'Draft' : 'ڈرافٹ')}
                        </span>

                        <button
                          onClick={() => {
                            if (m) setSelectedMadrasaId(m.id);
                            setEditingStudent(null);
                            setIsStudentModalOpen(true);
                          }}
                          className="px-2.5 py-1 bg-emerald-800 hover:bg-emerald-900 text-white rounded-xl text-[11px] font-bold transition-all cursor-pointer shadow-2xs"
                        >
                          {t.admitStudentBtn}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* 4. RESULTS TAB */}
        {/* ------------------------------------------------------------- */}
        {activeTab === 'results' && (
          <div className={`space-y-4 animate-fade-in ${isEn ? 'font-sans' : 'font-urdu'}`}>
            {/* Header & Controls */}
            <div className="bg-white p-4 rounded-3xl border border-stone-200/80 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-stone-900">
                  {t.resultsMeritShowcase}
                </h3>
                <p className="text-xs text-stone-500">
                  {t.resultsMeritSub}
                </p>
              </div>

              <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap w-full sm:w-auto">
                {/* Compact inline Student ID search */}
                <form
                  onSubmit={handleQuickResultSearch}
                  className="flex items-center gap-1.5 bg-stone-50 border border-stone-200/90 rounded-2xl p-1 shadow-2xs w-full sm:w-auto"
                >
                  <div className="relative flex-1 sm:w-44">
                    <input
                      type="text"
                      dir="ltr"
                      placeholder={isEn ? "Student ID (e.g. 117101)..." : "اسٹوڈنٹ آئی ڈی (مثلاً 117101)..."}
                      value={resultSearchId}
                      onChange={(e) => setResultSearchId(e.target.value)}
                      className="w-full pl-7 pr-2.5 py-1.5 bg-white border border-stone-200 rounded-xl text-xs font-mono font-bold text-stone-900 placeholder:text-stone-400 placeholder:font-sans focus:ring-2 focus:ring-emerald-600 focus:outline-none"
                    />
                    <Search className="w-3.5 h-3.5 text-stone-400 absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                  <button
                    type="submit"
                    disabled={isResultSearching}
                    className="px-3 py-1.5 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-bold transition-all cursor-pointer shadow-2xs flex items-center gap-1 shrink-0 disabled:opacity-50"
                  >
                    {isResultSearching ? (
                      <RefreshCw className="w-3 h-3 animate-spin" />
                    ) : (
                      <Eye className="w-3.5 h-3.5 text-amber-300" />
                    )}
                    <span>{isEn ? 'Search' : 'تلاش'}</span>
                  </button>
                </form>

                {/* Central Result Logic Button in the same line */}
                <button
                  type="button"
                  onClick={() => {
                    const target = resultsMadrasaScope !== 'all' ? madaris.find((m) => m.id === resultsMadrasaScope) || null : null;
                    setSelectedMadrasaForKaifiyat(target);
                    setIsKaifiyatModalOpen(true);
                  }}
                  className="px-3.5 py-2 rounded-2xl bg-purple-50 hover:bg-purple-100 text-purple-900 border border-purple-300 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs shrink-0 whitespace-nowrap"
                  title={resultsMadrasaScope !== 'all' ? 'منتخب مدرسہ کی رزلٹ لاجک ترتیب دیں' : 'مرکزی عمومی ڈیفالٹ رزلٹ لاجک ترتیب دیں'}
                >
                  <Sliders className="w-3.5 h-3.5 text-purple-700" />
                  <span>
                    {resultsMadrasaScope !== 'all'
                      ? (isEn ? 'Madrasa Result Logic' : 'مدرسہ رزلٹ لاجک')
                      : (isEn ? 'Central Result Logic' : 'مرکزی رزلٹ لاجک')}
                  </span>
                </button>
              </div>
            </div>

            {/* Madrasa & Darja (Class) Selector Bar */}
            <div className="bg-white p-4 rounded-3xl border border-stone-200/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-800 flex items-center justify-center shrink-0">
                  <Building2 className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-xs font-bold text-stone-900 block">{t.selectMadrasaLabel}</span>
                  <span className="text-[11px] text-stone-500 block">
                    {isEn ? 'Filter by madrasa and specific class to view live student marks' : 'مدرسہ اور مخصوص درجہ منتخب کر کے شیٹ کے تمام طلبہ کے نتائج دیکھیں'}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2.5 flex-wrap w-full md:w-auto">
                {/* Madrasa Selector */}
                <select
                  value={resultsMadrasaScope}
                  onChange={(e) => {
                    setResultsMadrasaScope(e.target.value);
                    setSelectedResultClassId('all');
                  }}
                  className="w-full sm:w-64 px-3.5 py-2.5 bg-stone-50 border border-stone-200 rounded-2xl text-xs font-bold text-stone-800 focus:ring-2 focus:ring-emerald-600 focus:outline-none"
                >
                  <option value="all">{t.allMadarisOption}</option>
                  {madaris.map((m, idx) => (
                    <option key={`scope-${m.id}-${idx}`} value={m.id}>
                      {m.code} - {isEn ? (m.englishName || m.urduName) : m.urduName}
                    </option>
                  ))}
                </select>

                {/* Darja / Class Dropdown */}
                <select
                  value={selectedResultClassId}
                  onChange={(e) => setSelectedResultClassId(e.target.value)}
                  className="w-full sm:w-48 px-3.5 py-2.5 bg-stone-50 border border-stone-200 rounded-2xl text-xs font-bold text-stone-800 focus:ring-2 focus:ring-emerald-600 focus:outline-none"
                >
                  <option value="all">{isEn ? 'All Classes (تمام درجات)' : 'تمام درجات (All Classes)'}</option>
                  {resultScopeClasses.map((cls, idx) => (
                    <option key={`res-cls-${cls.id}-${idx}`} value={cls.id}>
                      {cls.name} ({cls.students?.length || 0})
                    </option>
                  ))}
                </select>

                {/* Live Sync / Refresh Button */}
                <button
                  type="button"
                  onClick={async () => {
                    if (resultsMadrasaScope !== 'all') {
                      await handleSyncSingleMadrasa(resultsMadrasaScope);
                    } else {
                      await handleManualSync();
                    }
                  }}
                  disabled={isServerSyncing || isSyncingSingleMadrasa !== null}
                  className="px-3.5 py-2.5 rounded-2xl bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-bold transition-all cursor-pointer shadow-2xs flex items-center gap-1.5 shrink-0 disabled:opacity-50"
                  title="کلاؤڈ ریکارڈ سے فوری لائیو سنک کریں"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isServerSyncing || isSyncingSingleMadrasa !== null ? 'animate-spin' : ''}`} />
                  <span>{isServerSyncing || isSyncingSingleMadrasa !== null ? 'سنک ہو رہا ہے...' : 'لائیو ریفریش'}</span>
                </button>
              </div>
            </div>

            {/* Line-by-Line Complete Student Results Section */}
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

              {filteredResultStudents.length === 0 ? (
                <div className="p-10 text-center text-stone-400 space-y-2">
                  <FileSpreadsheet className="w-10 h-10 mx-auto text-stone-300" />
                  <p className="text-xs font-bold text-stone-600">
                    {isEn ? 'No student records found in this class or madrasa.' : 'اس درجہ یا مدرسہ میں تاحال کوئی طالب علم کا ریکارڈ نہیں ملا۔'}
                  </p>
                  <p className="text-[11px] text-stone-400">
                    {isEn
                      ? 'Ensure cloud records are connected and click "Live Refresh" above.'
                      : 'یقینی بنائیں کہ کلاؤڈ ریکارڈ کا درست لنک منسلک ہے اور اوپر "لائیو ریفریش" کا بٹن دبائیں۔'}
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-stone-100 max-h-[70vh] overflow-y-auto">
                  {filteredResultStudents.map(({ student, cls, madrasa }, idx) => {
                    const stPercent = typeof student.percentage === 'number' ? student.percentage : parseFloat(String(student.percentage)) || 0;
                    const isStudentAbsent = Boolean(student.isAbsent) || (Array.isArray(student.subjects) && student.subjects.some((sub: any) => sub.isAbsent === true || sub.obtainedMarks === 'غ' || isAbsentCell(sub.obtainedMarks)));
                    const kaifiyat = isStudentAbsent
                      ? (madrasa?.passingSettings?.absentFailLabel || 'ناکام')
                      : (student.kaifiyat || (stPercent >= 80 ? 'ممتاز' : stPercent >= 60 ? 'اعلیٰ' : stPercent >= 50 ? 'جید' : stPercent >= 33 ? 'مقبول' : 'ناکام'));

                    return (
                      <div
                        key={`res-st-row-${madrasa.id}-${cls.id}-${student.studentId || idx}-${idx}`}
                        dir="rtl"
                        className="h-12 px-3 sm:px-4 hover:bg-emerald-50/50 transition-colors flex items-center justify-between gap-3 text-xs whitespace-nowrap"
                      >
                        {/* 1. اسٹوڈنٹ آئی ڈی + 2. طالب نام */}
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <span className="w-24 shrink-0 font-mono font-black text-xs px-2.5 py-1 rounded-lg bg-stone-100 text-stone-900 border border-stone-300 text-center tracking-wider">
                            {student.studentId}
                          </span>
                          <span className="font-bold text-sm text-stone-900 truncate" title={student.studentName}>
                            {student.studentName}
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
                            className={`w-16 text-center text-xs px-2 py-0.5 rounded-lg font-bold border shrink-0 ${
                              kaifiyat === 'ممتاز'
                                ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                                : kaifiyat === 'اعلیٰ' || kaifiyat === 'اعلی'
                                ? 'bg-blue-100 text-blue-900 border-blue-300'
                                : kaifiyat === 'جید'
                                ? 'bg-amber-100 text-amber-900 border-amber-300'
                                : kaifiyat === 'ناکام'
                                ? 'bg-rose-100 text-rose-900 border-rose-300'
                                : kaifiyat === 'غیر حاضر' || kaifiyat === 'غائب' || student.isAbsent
                                ? 'bg-stone-200 text-stone-700 border-stone-400'
                                : 'bg-stone-100 text-stone-800 border-stone-300'
                            }`}
                          >
                            {student.isAbsent && kaifiyat !== 'ناکام' ? (kaifiyat === 'غیر حاضر' ? 'غیر حاضر' : kaifiyat) : kaifiyat}
                          </span>

                          {/* پریویو آئکن */}
                          <button
                            type="button"
                            onClick={() =>
                              setPreviewStudent({
                                student: isStudentAbsent
                                  ? {
                                      ...student,
                                      isAbsent: true,
                                      kaifiyat: madrasa?.passingSettings?.absentFailLabel || 'ناکام',
                                    }
                                  : student,
                                madrasa,
                                cls,
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

            {/* Overall Top 10 Position Holders */}
            <div className="bg-white rounded-3xl p-5 border border-stone-200/80 shadow-xs space-y-3">
              <div className="flex items-center justify-between border-b border-stone-100 pb-2.5">
                <span className="text-sm font-bold text-stone-900 flex items-center gap-2">
                  <Award className="w-4 h-4 text-amber-500" />
                  <span>{t.top10Inst}</span>
                </span>
                <span className="text-[11px] text-amber-800 font-bold bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                  {t.distinction}
                </span>
              </div>

              {top10Institution.length === 0 ? (
                <p className="text-xs text-stone-400 py-6 text-center">
                  {isEn ? 'No results found for this selection.' : 'اس انتخاب میں تاحال کوئی طالب علم یا رزلٹ شامل نہیں ہے۔'}
                </p>
              ) : (
                <div className="space-y-2">
                  {top10Institution.map(({ student, cls, madrasa }, idx) => (
                    <div
                      key={`top10-${madrasa.id}-${cls.id}-${student.studentId || idx}-${idx}`}
                      className="p-3.5 rounded-2xl bg-stone-50 hover:bg-emerald-50/50 border border-stone-200/80 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <span
                          className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 shadow-2xs ${
                            idx === 0
                              ? 'bg-amber-400 text-stone-950 font-black'
                              : idx === 1
                              ? 'bg-stone-300 text-stone-900 font-bold'
                              : idx === 2
                              ? 'bg-amber-700 text-white font-bold'
                              : 'bg-stone-200 text-stone-700 font-semibold'
                          }`}
                        >
                          #{idx + 1}
                        </span>

                        <div className="min-w-0 flex-1">
                          {/* Student Full Name on a single line */}
                          <div className="font-bold text-stone-950 text-sm sm:text-base leading-tight break-normal whitespace-normal sm:whitespace-nowrap sm:truncate">
                            {isEn ? (student.studentNameEn || student.studentName) : student.studentName}
                          </div>

                          {/* Madrasa, Class, and ID neatly below name */}
                          <div className="text-[11px] text-stone-600 flex items-center gap-1.5 flex-wrap mt-0.5 leading-normal">
                            <span className="font-mono text-emerald-800 font-bold bg-emerald-50 px-1 py-0.2 rounded border border-emerald-200/80">
                              {madrasa?.code}
                            </span>
                            <span className="font-medium text-stone-700">
                              {isEn ? (madrasa?.englishName || madrasa?.urduName) : madrasa?.urduName}
                            </span>
                            <span className="text-stone-300">·</span>
                            <span className="text-stone-500">
                              {isEn ? 'Class:' : 'درجہ:'} <strong className="text-stone-800 font-semibold">{cls.name}</strong>
                            </span>
                            <span className="text-stone-300">·</span>
                            <span className="text-stone-500">
                              ID: <strong className="font-mono text-stone-800 font-semibold">{student.studentId}</strong>
                            </span>
                            <span className="text-stone-300">·</span>
                            <span className="text-stone-500">
                              {isEn ? 'Father:' : 'ولدیت:'} <strong className="text-stone-800 font-semibold">{ensureUrduName(student.fatherName)}</strong>
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-stone-200/60 shrink-0">
                        <div className="text-left font-mono flex flex-col items-end">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-emerald-800 text-sm sm:text-base leading-none">{student.percentage}%</span>
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border font-urdu ${getKaifiyatBadgeClass(student.kaifiyat, madrasa?.kaifiyatRules)}`}>
                              {student.kaifiyat}
                            </span>
                          </div>
                          <div className="text-[10px] text-stone-500 mt-0.5">{student.obtainedMarks}/{student.totalMarks}</div>
                        </div>
                        <button
                          onClick={() => setPreviewStudent({ student, madrasa, cls })}
                          className="px-3 py-1.5 bg-white hover:bg-emerald-50 text-emerald-950 border border-stone-200 hover:border-emerald-300 rounded-xl text-xs font-bold cursor-pointer shadow-2xs transition-all flex items-center gap-1"
                        >
                          <Eye className="w-3 h-3 text-emerald-700" />
                          <span>{isEn ? 'Card' : 'کارڈ'}</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Class-wise Top 3 Toppers per Enrolled Grade */}
            <div className="bg-white rounded-3xl p-5 border border-stone-200/80 shadow-xs space-y-4">
              <div className="border-b border-stone-100 pb-2.5 flex items-center justify-between">
                <span className="text-sm font-bold text-stone-900 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-emerald-700" />
                  <span>{t.top3Class}</span>
                </span>
                <span className="text-xs text-stone-500">
                  {isEn ? `Total Classes: ${resultScopeClasses.length}` : `کل درجات: ${resultScopeClasses.length}`}
                </span>
              </div>

              {resultScopeClasses.length === 0 ? (
                <p className="text-xs text-stone-400 py-6 text-center">
                  {isEn ? 'No class records found.' : 'کوئی درجہ موجود نہیں ہے۔'}
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                  {resultScopeClasses.map((cls) => {
                    const top3 = top3ByClass[cls.id] || [];
                    const clsMadrasa = madaris.find((m) => m.id === cls.madrasaId);

                    return (
                      <div key={cls.id} className="p-4 rounded-3xl bg-stone-50 border border-stone-200/80 space-y-2.5 flex flex-col justify-between">
                        <div>
                          <div className="flex items-center justify-between border-b border-stone-200/80 pb-2">
                            <div>
                              <span className="font-bold text-sm text-stone-900 block">
                                {cls.name}
                              </span>
                              <span className="text-[10px] text-stone-500 font-mono">
                                {clsMadrasa?.code} - {isEn ? (clsMadrasa?.englishName || clsMadrasa?.urduName) : clsMadrasa?.urduName}
                              </span>
                            </div>

                            <button
                              onClick={() => handleTogglePublish(cls)}
                              className={`text-[10px] px-2 py-0.5 rounded-full font-bold transition-all cursor-pointer border ${
                                cls.status === 'published'
                                  ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                                  : 'bg-stone-200 text-stone-700 border-stone-300'
                              }`}
                            >
                              {cls.status === 'published' ? (isEn ? '✓ Published' : '✓ شائع شدہ') : (isEn ? 'Draft' : 'ڈرافٹ')}
                            </button>
                          </div>

                          {top3.length === 0 ? (
                            <p className="text-[11px] text-stone-400 py-3 text-center">{isEn ? 'No results entered for this class yet.' : 'اس درجہ میں کوئی رزلٹ درج نہیں ہے۔'}</p>
                          ) : (
                            <div className="space-y-1.5 text-xs mt-2.5">
                              {top3.map((item: any, posIdx: number) => (
                                <div key={`top3-${cls.id}-${item.student.studentId || posIdx}-${posIdx}`} className="flex items-center justify-between bg-white p-2 rounded-xl border border-stone-200">
                                  <div className="flex items-center gap-2">
                                    <span className="font-bold text-amber-700 text-[11px] font-mono">#{posIdx + 1}</span>
                                    <span className="font-bold text-stone-800">
                                      {isEn ? (item.student.studentNameEn || item.student.studentName) : item.student.studentName}
                                    </span>
                                  </div>
                                  <span className="font-mono font-bold text-emerald-800 text-xs">
                                    {item.student.percentage}%
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* 4.5. STATE MANAGERS TAB (برائے مرکزی ایڈمن) */}
        {/* ------------------------------------------------------------- */}
        {activeTab === 'state_managers' && !isManagerView && (
          <div className="space-y-4 animate-fade-in font-urdu">
            <StateManagersTab madaris={madaris} isEn={isEn} />
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* 4.8. FEEDBACKS & SUGGESTIONS TAB (نوٹیفکیشنز و تجاویز / فیڈ بیک) */}
        {/* ------------------------------------------------------------- */}
        {activeTab === 'feedbacks' && (
          <div className="space-y-4 animate-fade-in font-urdu">
            <FeedbackTab
              isManagerView={isManagerView}
              assignedState={currentManager?.assignedStates}
              isEn={isEn}
            />
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* 5. SETTINGS TAB */}
        {/* ------------------------------------------------------------- */}
        {(activeTab === 'settings' || activeTab === 'more') && (
          <div className={`space-y-4 animate-fade-in ${isEn ? 'font-sans' : 'font-urdu'}`}>
            {/* Header */}
            <div className="bg-white p-4 rounded-3xl border border-stone-200/80 shadow-xs">
              <h3 className="text-lg font-bold text-stone-900">
                {isEn ? 'Portal Settings & Administrative Controls' : 'پورٹل ترتیبات و انتظامی کنٹرولز'}
              </h3>
              <p className="text-xs text-stone-500">
                {isEn ? 'Registration classes, branding, grading rules & security PIN' : 'رجسٹریشن درجات، برانڈنگ، گریڈنگ رولز اور سیکیورٹی کریڈینشلز'}
              </p>
            </div>

            {/* Madrasa Registration Form On/Off & Notice Settings */}
            <div className="bg-white p-5 rounded-3xl border border-stone-200/80 shadow-xs space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-stone-100 pb-4">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 border ${
                      formStatus.enabled
                        ? 'bg-emerald-600 text-white border-emerald-700'
                        : 'bg-amber-600 text-white border-amber-700'
                    }`}
                  >
                    <Power className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-bold text-stone-900 text-base">
                        مدرسہ رجسٹریشن فارم آن / آف سسٹم
                      </h4>
                      <span
                        className={`px-3 py-0.5 rounded-full text-xs font-bold border ${
                          formStatus.enabled
                            ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                            : 'bg-amber-100 text-amber-900 border-amber-300'
                        }`}
                      >
                        {formStatus.enabled ? '🟢 آن (فعال / کھلا ہے)' : '🟠 آف (غیر فعال / کام جاری ہے)'}
                      </span>
                    </div>
                    <p className="text-xs text-stone-500 mt-0.5">
                      یہاں سے آپ مدرسہ الحاق فارم کو کسی بھی وقت آن یا آف کر سکتے ہیں، اور بند ہونے پر ظاہر ہونے والا پیغام مقرر کر سکتے ہیں۔
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-start sm:self-auto">
                  <button
                    type="button"
                    onClick={handleToggleFormStatus}
                    className={`px-4 py-2 rounded-2xl text-xs font-bold transition-all shadow-xs cursor-pointer flex items-center gap-1.5 ${
                      formStatus.enabled
                        ? 'bg-amber-600 hover:bg-amber-700 text-white'
                        : 'bg-emerald-700 hover:bg-emerald-800 text-white'
                    }`}
                  >
                    <Power className="w-4 h-4" />
                    <span>{formStatus.enabled ? 'فارم آف کریں (بند کریں)' : 'فارم آن کریں (کھولیں)'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsFormNoticePreviewOpen(true)}
                    className="px-3.5 py-2 rounded-2xl bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5"
                  >
                    <Eye className="w-3.5 h-3.5 text-stone-500" />
                    <span>پیش منظر</span>
                  </button>
                </div>
              </div>

              {/* Notice Message Configuration */}
              <div className="bg-stone-50/70 border border-stone-200/80 rounded-2xl p-4 sm:p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-stone-700 block">
                    فارم آف ہونے پر ظاہر ہونے والا پیغام (اطلاعیہ متن):
                  </span>
                  <button
                    type="button"
                    onClick={handleResetFormStatusDefaultText}
                    className="text-[11px] font-bold text-stone-500 hover:text-amber-800 underline cursor-pointer"
                  >
                    طے شدہ متن پر بحال کریں
                  </button>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-[11px] font-bold text-stone-600 mb-1">
                      سلام / استقبالیہ جملہ:
                    </label>
                    <input
                      type="text"
                      value={formStatusEditGreeting}
                      onChange={(e) => setFormStatusEditGreeting(e.target.value)}
                      placeholder="السلام علیکم ورحمۃ اللہ وبرکاتہ"
                      className="w-full px-3.5 py-2.5 bg-white border border-stone-300 rounded-xl text-xs font-bold text-stone-900 focus:outline-none focus:ring-2 focus:ring-emerald-700 font-nastaliq"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-stone-600 mb-1">
                      پیغام (ہر سطر الگ لائن میں درج کریں):
                    </label>
                    <textarea
                      rows={3}
                      value={formStatusEditMessage}
                      onChange={(e) => setFormStatusEditMessage(e.target.value)}
                      placeholder={"ابھی اس پر کام ہو رہا ہے\nکچھ دن بعد دوبارہ کوشش کریں"}
                      className="w-full px-3.5 py-2.5 bg-white border border-stone-300 rounded-xl text-xs font-bold text-stone-900 focus:outline-none focus:ring-2 focus:ring-emerald-700 font-nastaliq leading-relaxed"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    disabled={isSavingFormStatus}
                    onClick={handleSaveFormStatusCustomText}
                    className="px-5 py-2.5 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-bold shadow-xs transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-60"
                  >
                    <Check className="w-4 h-4" />
                    <span>{isSavingFormStatus ? 'محفوظ ہو رہا ہے...' : 'پیغام محفوظ کریں'}</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Portal Launch Countdown & Celebration Settings */}
            <div className="bg-white p-5 rounded-3xl border border-stone-200/80 shadow-xs space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-stone-100 pb-4">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 border ${
                      launchTimer.enabled
                        ? 'bg-amber-500 text-stone-950 border-amber-600 shadow-xs'
                        : 'bg-stone-100 text-stone-600 border-stone-200'
                    }`}
                  >
                    <Clock className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-bold text-stone-900 text-base">
                        پورٹل لانچ ٹائمر و لائیو کاؤنٹ ڈاؤن (Portal Launch Timer)
                      </h4>
                      <span
                        className={`px-3 py-0.5 rounded-full text-xs font-bold border ${
                          launchTimer.enabled
                            ? 'bg-amber-100 text-amber-950 border-amber-300'
                            : 'bg-stone-100 text-stone-600 border-stone-300'
                        }`}
                      >
                        {launchTimer.enabled ? '⏱️ آن (کاؤنٹ ڈاؤن فعال ہے)' : '⚪ آف (عام رزلٹ سرچ کھلا ہے)'}
                      </span>
                    </div>
                    <p className="text-xs text-stone-500 mt-0.5">
                      اسے آن کرنے پر مین رزلٹ اسکرین پر الٹی گنتی (Countdown) اور مقررہ وقت پر باضابطہ افتتاح و جشن (Confetti Launch) شروع ہوگا۔
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-start sm:self-auto">
                  <button
                    type="button"
                    onClick={handleToggleLaunchTimer}
                    className={`px-4 py-2 rounded-2xl text-xs font-bold transition-all shadow-xs cursor-pointer flex items-center gap-1.5 ${
                      launchTimer.enabled
                        ? 'bg-stone-800 hover:bg-stone-900 text-white'
                        : 'bg-amber-500 hover:bg-amber-600 text-stone-950'
                    }`}
                  >
                    <Power className="w-4 h-4" />
                    <span>{launchTimer.enabled ? 'ٹائمر آف کریں' : 'ٹائمر آن کریں (فعال)'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsPreviewCountdownOpen(true)}
                    className="px-3.5 py-2 rounded-2xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5"
                  >
                    <Eye className="w-3.5 h-3.5 text-amber-700" />
                    <span>پیش منظر و لانچ ٹیسٹ</span>
                  </button>
                </div>
              </div>

              {/* Form inputs for Timer */}
              <form onSubmit={handleSaveLaunchTimerDetails} className="bg-stone-50/70 border border-stone-200/80 rounded-2xl p-4 sm:p-5 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Target Date & Time */}
                  <div className="space-y-1">
                    <label className="block text-xs font-bold text-stone-700">
                      مقررہ تاریخ و وقت (Target Launch Date & Time):
                    </label>
                    <input
                      type="datetime-local"
                      value={timerTargetDateInput}
                      onChange={(e) => setTimerTargetDateInput(e.target.value)}
                      className="w-full text-xs font-mono p-2.5 rounded-xl border border-stone-200 bg-white focus:outline-emerald-600"
                      required
                    />
                    <span className="text-[10px] text-stone-400 block font-urdu">
                      اس تاریخ اور وقت کے مکمل ہوتے ہی خود بخود جشن و پورٹل کا افتتاح ہو جائے گا۔
                    </span>
                  </div>

                  {/* Urdu Title */}
                  <div className="space-y-1">
                    <label className="block text-xs font-bold text-stone-700">
                      افتتاحی عنوان (Launch Title):
                    </label>
                    <input
                      type="text"
                      value={timerTitleInput}
                      onChange={(e) => setTimerTitleInput(e.target.value)}
                      placeholder="مثلاً: معیارِ مدارس — امتحانی نتائج کا باضابطہ افتتاح"
                      className="w-full text-xs p-2.5 rounded-xl border border-stone-200 bg-white focus:outline-emerald-600 font-urdu"
                    />
                    <span className="text-[10px] text-stone-400 block font-urdu">
                      کاؤنٹ ڈاؤن اسکرین کے ہیڈر میں ظاہر ہوگا۔
                    </span>
                  </div>
                </div>

                {/* Urdu Message */}
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-stone-700">
                    افتتاحی پیغام / تفصیل (Announcement Message):
                  </label>
                  <textarea
                    rows={2}
                    value={timerMessageInput}
                    onChange={(e) => setTimerMessageInput(e.target.value)}
                    placeholder="مثلاً: ان شاء اللہ جلد ہی سالانہ امتحانی نتائج اور تعلیمی ریکارڈز کا لائیو اجرا ہوگا۔"
                    className="w-full text-xs p-2.5 rounded-xl border border-stone-200 bg-white focus:outline-emerald-600 font-urdu resize-none"
                  />
                </div>

                <div className="flex items-center justify-between pt-1">
                  <span className="text-[11px] text-stone-500 font-urdu">
                    اسٹیٹس:{' '}
                    <strong className={launchTimer.enabled ? 'text-emerald-700' : 'text-stone-600'}>
                      {launchTimer.enabled ? 'کاؤنٹ ڈاؤن فعال ہے' : 'کاؤنٹ ڈاؤن بند ہے'}
                    </strong>
                    {launchTimer.isLaunched && ' (افتتاح مکمل ہو چکا ہے)'}
                  </span>

                  <button
                    type="submit"
                    disabled={isSavingTimer}
                    className="px-5 py-2.5 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-bold shadow-xs transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-60"
                  >
                    <Check className="w-4 h-4" />
                    <span>{isSavingTimer ? 'محفوظ ہو رہا ہے...' : 'ٹائمر کی ترتیبات محفوظ کریں'}</span>
                  </button>
                </div>
              </form>
            </div>

            {/* Central Exam Title & Academic Session Management */}
            <div className="bg-white p-5 rounded-3xl border border-stone-200/80 shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-stone-100 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-800 border border-amber-200 flex items-center justify-center shrink-0">
                    <GraduationCap className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-bold text-stone-900 text-sm sm:text-base">
                        {isEn ? 'Central Exam Title & Academic Session' : 'مرکزی امتحانی عنوان و سالانہ سیشن کا انتظام'}
                      </h4>
                      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                        {isEn ? 'Marksheet Header' : 'رزلٹ کارڈ ہیڈر'}
                      </span>
                    </div>
                    <p className="text-xs text-stone-500 mt-0.5">
                      {isEn
                        ? 'Update examination title and academic year across all student marksheets in one click'
                        : 'یہاں سے آپ تمام رزلٹ کارڈز کا امتحانی عنوان، سال اور سیشن ایک کلک میں تبدیل کر سکتے ہیں۔'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-start sm:self-auto">
                  <span className="text-[11px] font-bold px-3 py-1 rounded-xl bg-emerald-50 text-emerald-900 border border-emerald-200 font-urdu">
                    فعال عنوان: {centralExamTitle}
                  </span>
                </div>
              </div>

              {/* Quick Presets */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-bold text-stone-600 block">
                  {isEn ? 'Quick Presets (Click to select):' : 'تیار شدہ امتحانی عنوانات (فوری انتخاب کے لیے کلک کریں):'}
                </span>
                <div className="flex flex-wrap gap-2">
                  {[
                    'سالانہ امتحان 1447-1448ھ / 2026ء',
                    'ششماہی امتحان 1448ھ / 2026ء',
                    'سہ ماہی امتحان 1447-1448ھ',
                    'سالانہ امتحان 1448-1449ھ / 2027ء',
                  ].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setCentralExamTitle(preset)}
                      className={`text-xs px-3 py-1.5 rounded-xl border transition-all cursor-pointer font-bold ${
                        centralExamTitle === preset
                          ? 'bg-amber-600 text-white border-amber-700 shadow-2xs'
                          : 'bg-stone-50 hover:bg-stone-100 text-stone-700 border-stone-200'
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              {/* Input Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                <div className="sm:col-span-2 space-y-1">
                  <label className="block text-xs font-bold text-stone-700">
                    {isEn ? 'Primary Exam Title (Urdu - Displays on Marksheets):' : 'امتحان کا بنیادی عنوان (اردو - رزلٹ کارڈ پر ظاہر ہوگا):'}
                  </label>
                  <input
                    type="text"
                    value={centralExamTitle}
                    onChange={(e) => setCentralExamTitle(e.target.value)}
                    placeholder="مثلاً: سالانہ امتحان 1447-1448ھ / 2026ء"
                    className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-300 rounded-xl text-xs font-bold text-stone-900 focus:bg-white focus:ring-2 focus:ring-emerald-700 focus:outline-none font-urdu"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-bold text-stone-700">
                    {isEn ? 'Academic Session / Year:' : 'تعلیمی سال (Academic Session):'}
                  </label>
                  <input
                    type="text"
                    value={centralAcademicYear}
                    onChange={(e) => setCentralAcademicYear(e.target.value)}
                    placeholder="1447-1448ھ / 2025-2026ء"
                    className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-300 rounded-xl text-xs font-bold text-stone-900 focus:bg-white focus:ring-2 focus:ring-emerald-700 focus:outline-none font-mono"
                  />
                </div>

                <div className="sm:col-span-3 space-y-1">
                  <label className="block text-xs font-bold text-stone-700">
                    {isEn ? 'English Exam Title (For English Mode):' : 'انگریزی عنوان (English Exam Title - انگریزی موڈ کے لیے):'}
                  </label>
                  <input
                    type="text"
                    dir="ltr"
                    value={centralExamTitleEn}
                    onChange={(e) => setCentralExamTitleEn(e.target.value)}
                    placeholder="Annual Examination Result 1447-1448H / 2026"
                    className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-300 rounded-xl text-xs font-sans text-stone-900 focus:bg-white focus:ring-2 focus:ring-emerald-700 focus:outline-none"
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 pt-2 border-t border-stone-100">
                <span className="text-[11px] text-stone-500 font-urdu">
                  {isEn
                    ? 'Clicking "Apply to All" will update every registered madrasa and marksheets immediately.'
                    : '"تمام پر لاگو کریں" دبانے سے تمام رجسٹرڈ مدارس اور رزلٹ کارڈز کا ہیڈر فوری بدل جائے گا۔'}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={isSavingExamTitle}
                    onClick={() => handleSaveExamTitle(false)}
                    className="flex-1 sm:flex-none px-4 py-2 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {isEn ? 'Save Setting Only' : 'صرف مرکزی ترتیبات محفوظ کریں'}
                  </button>

                  <button
                    type="button"
                    disabled={isSavingExamTitle}
                    onClick={() => handleSaveExamTitle(true)}
                    className="flex-1 sm:flex-none px-5 py-2 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-bold shadow-xs transition-colors cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
                  >
                    <Check className="w-4 h-4 text-amber-300" />
                    <span>{isSavingExamTitle ? (isEn ? 'Applying...' : 'لاگو ہو رہا ہے...') : (isEn ? 'Apply to All Madaris & Cards' : 'تمام مدارس کے رزلٹ کارڈز پر لاگو کریں')}</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Default Registration Classes Manager */}
            <div className="bg-white p-5 rounded-3xl border border-stone-200/80 shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-stone-100 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-2xl bg-emerald-50 text-emerald-800 flex items-center justify-center">
                    <Layers className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-stone-900 text-sm">
                      {isEn ? 'Default Registration Classes Management' : 'رجسٹریشن کے بنیادی درجات کا انتظام'}
                    </h4>
                    <p className="text-xs text-stone-500">
                      {isEn ? 'Classes displayed as selection chips when registering a new madrasa' : 'یہ وہ درجات ہیں جو نیا مدرسہ رجسٹر کرتے وقت سلیکشن چپس کے طور پر ظاہر ہوتے ہیں'}
                    </p>
                  </div>
                </div>

                <button
                  onClick={handleResetDefaultClasses}
                  className="px-3 py-1.5 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-bold transition-colors cursor-pointer self-start sm:self-auto flex items-center gap-1"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>{isEn ? 'Reset to Defaults' : 'معیاری درجات پر بحال کریں'}</span>
                </button>
              </div>

              {/* Class Chips List */}
              <div className="space-y-2">
                <span className="text-xs font-bold text-stone-700 block">
                  {isEn ? `Active Classes (${defaultClassesList.length}):` : `فعال درجات (${defaultClassesList.length}):`}
                </span>
                <div className="flex flex-wrap gap-2">
                  {defaultClassesList.map((clsName) => (
                    <span
                      key={clsName}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-stone-100 hover:bg-stone-200/80 border border-stone-200 text-stone-800 text-xs font-bold transition-all"
                    >
                      <span>{clsName}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveDefaultClass(clsName)}
                        className="text-stone-400 hover:text-rose-600 transition-colors cursor-pointer"
                        title="ہٹائیں"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>

              {/* Add New Default Class */}
              <div className="pt-2 flex flex-col sm:flex-row items-center gap-2">
                <input
                  type="text"
                  value={newDefaultClassInput}
                  onChange={(e) => setNewDefaultClassInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddDefaultClass();
                    }
                  }}
                  placeholder="نیا بنیادی درجہ لکھیں (مثلاً: سال ہفتم یا تجوید)..."
                  className="w-full sm:flex-1 px-4 py-2 bg-stone-50 border border-stone-200 rounded-2xl text-xs font-bold text-stone-800 focus:ring-2 focus:ring-emerald-600 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleAddDefaultClass}
                  className="w-full sm:w-auto px-4 py-2 bg-emerald-800 hover:bg-emerald-900 text-white rounded-2xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>درجہ شامل کریں</span>
                </button>
              </div>
            </div>

            {/* Menu Grid Cards: Branding, Grading, Credentials */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Option: Branding / Monogram */}
              <div className="bg-white p-4 rounded-3xl border border-stone-200/80 shadow-xs space-y-2 flex flex-col justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-white border border-stone-200 p-1 flex items-center justify-center shrink-0 shadow-xs overflow-hidden">
                    <img
                      src={portalLogo || '/logo.jpg'}
                      alt="Portal Logo"
                      className="w-full h-full object-contain"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = '/logo.jpg';
                      }}
                    />
                  </div>
                  <div>
                    <h4 className="font-bold text-stone-900 text-sm">
                      پورٹل برانڈنگ و مونوگرام
                    </h4>
                    <p className="text-xs text-stone-500">
                      معیارِ مدارس کا بنیادی لوگو تبدیل کریں
                    </p>
                  </div>
                </div>
                <div className="pt-2 flex items-center justify-end">
                  <button
                    onClick={() => setIsPortalLogoModalOpen(true)}
                    className="px-3.5 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-800 rounded-xl text-xs font-bold cursor-pointer transition-colors"
                  >
                    لوگو تبدیل کریں
                  </button>
                </div>
              </div>

              {/* Option: Kaifiyat & Grading Rules */}
              <div className="bg-white p-4 rounded-3xl border border-stone-200/80 shadow-xs space-y-2 flex flex-col justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-purple-50 text-purple-800 border border-purple-200 flex items-center justify-center shrink-0">
                    <Sliders className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-stone-900 text-sm">گریڈنگ و کیفیت قواعد</h4>
                    <p className="text-xs text-stone-500">ممتاز، اعلیٰ، جید، مقبول اور فیل کی پرسنٹیج حدود</p>
                  </div>
                </div>
                <div className="pt-2 flex items-center justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedMadrasaForKaifiyat(null);
                      setIsKaifiyatModalOpen(true);
                    }}
                    className="px-3.5 py-1.5 bg-purple-100 hover:bg-purple-200 text-purple-900 rounded-xl text-xs font-bold cursor-pointer transition-colors"
                  >
                    مرکزی قواعد ترتیب دیں
                  </button>
                </div>
              </div>

              {/* Option: Result Admin PIN */}
              <div className="bg-white p-4 rounded-3xl border border-stone-200/80 shadow-xs space-y-2 flex flex-col justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-800 border border-emerald-200 flex items-center justify-center shrink-0">
                    <KeyRound className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-stone-900 text-sm">
                      ایڈمن سیکیورٹی پن
                    </h4>
                    <p className="text-xs text-stone-500">
                      پورٹل لاگ ان اور سیٹنگز کا خفیہ سیکیورٹی پن تبدیل کریں
                    </p>
                  </div>
                </div>
                <div className="pt-2 flex items-center justify-end">
                  <button
                    onClick={() => {
                      setPinError('');
                      setPinSuccess('');
                      setCurrentPin('');
                      setNewPin('');
                      setConfirmPin('');
                      setIsPinModalOpen(true);
                    }}
                    className="px-3.5 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-800 rounded-xl text-xs font-bold cursor-pointer transition-colors"
                  >
                    پن تبدیل کریں
                  </button>
                </div>
              </div>

              {/* Option: Central Google Sheet (Madaris & Feedback) */}
              <div className="bg-white p-4 rounded-3xl border border-emerald-200/90 bg-emerald-50/20 shadow-xs space-y-2 flex flex-col justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center justify-center shrink-0">
                    <FileSpreadsheet className="w-5 h-5 text-emerald-700" />
                  </div>
                  <div>
                    <h4 className="font-bold text-stone-900 text-sm">
                      مرکزی گوگل شیٹ (Madaris & Feedback)
                    </h4>
                    <p className="text-xs text-stone-500">
                      نئی شیٹ کا ویب ایپ لنک و خودکار اندراج کوڈ ترتیب دیں
                    </p>
                  </div>
                </div>
                <div className="pt-2 flex items-center justify-between gap-2">
                  <span className="text-[11px] text-emerald-800 font-semibold truncate max-w-xs" dir="ltr">
                    {centralSheetUrl ? '✓ شیٹ منسلک ہے' : 'غیر منسلک'}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setScriptModalTab('central');
                      setIsScriptModalOpen(true);
                    }}
                    className="px-3.5 py-1.5 bg-emerald-800 hover:bg-emerald-900 text-white rounded-xl text-xs font-bold cursor-pointer transition-colors shadow-2xs"
                  >
                    سیٹ اپ کھولیں
                  </button>
                </div>
              </div>

              {/* Option: Factory Reset */}
              <div className="bg-white p-4 rounded-3xl border border-stone-200/80 shadow-xs space-y-2 flex flex-col justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-rose-50 text-rose-800 border border-rose-200 flex items-center justify-center shrink-0">
                    <ShieldAlert className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-stone-900 text-sm">فیکٹری ری سیٹ</h4>
                    <p className="text-xs text-stone-500">ڈیٹا کو ابتدائی نمونہ سیٹنگز پر بحال کریں</p>
                  </div>
                </div>
                <div className="pt-2 flex items-center justify-end">
                  <button
                    onClick={() => {
                      setConfirmDialog({
                        title: 'فیکٹری ری سیٹ کی تصدیق',
                        message: 'کیا آپ تمام ڈیٹا کو ابتدائی فیکٹری سیٹنگز پر ری سیٹ کرنا چاہتے ہیں؟',
                        onConfirm: async () => {
                          try {
                            await fetch('/api/admin/reset', { method: 'POST' });
                          } catch (e) {
                            console.warn(e);
                          }
                          resetToDefaults();
                          setMadaris(getStoredMadaris());
                          setClasses(getStoredClasses());
                          setSelectedMadrasaId(getStoredMadaris()[0].id);
                          setConfirmDialog(null);
                          showToast('تمام ڈیٹا فیکٹری سیٹنگز پر ری سیٹ ہو گیا');
                        },
                      });
                    }}
                    className="px-3.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200 rounded-xl text-xs font-bold cursor-pointer transition-colors"
                  >
                    ری سیٹ کریں
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ------------------------------------------------------------- */}
      {/* FIXED MOBILE-FIRST BOTTOM NAVIGATION - Fixed Left-to-Right (dir="ltr") */}
      {/* ------------------------------------------------------------- */}
      <nav className="bottom-nav-dock lg:!hidden fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-md border-t border-stone-200/90 shadow-2xl py-1.5 px-2 select-none" dir="ltr">
        <div className={`max-w-md mx-auto grid ${!isManagerView ? 'grid-cols-7' : 'grid-cols-6'} gap-0.5`}>
          {/* 1. Dashboard */}
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
            <span className="text-[9px] sm:text-[10px] tracking-tight mt-0.5">{t.dashboard}</span>
          </button>

          {/* 2. Madrasas */}
          <button
            onClick={() => setActiveTab('madrasas')}
            className={`flex flex-col items-center justify-center py-1 rounded-2xl transition-all cursor-pointer relative ${
              activeTab === 'madrasas'
                ? 'text-emerald-800 font-bold scale-105'
                : 'text-stone-400 hover:text-stone-700'
            }`}
          >
            <div
              className={`p-1 rounded-xl transition-all relative ${
                activeTab === 'madrasas' ? 'bg-emerald-100 text-emerald-900' : ''
              }`}
            >
              <Building2 className="w-5 h-5" />
              {isManagerView && managerPendingMadarisCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-rose-600 text-white rounded-full text-[9px] font-bold flex items-center justify-center animate-pulse">
                  {managerPendingMadarisCount}
                </span>
              )}
            </div>
            <span className="text-[9px] sm:text-[10px] tracking-tight mt-0.5">{t.madrasas}</span>
          </button>

          {/* 2.5. Managers (for Super Admin) */}
          {!isManagerView && (
            <button
              onClick={() => setActiveTab('state_managers')}
              className={`flex flex-col items-center justify-center py-1 rounded-2xl transition-all cursor-pointer ${
                activeTab === 'state_managers'
                  ? 'text-emerald-800 font-bold scale-105'
                  : 'text-stone-400 hover:text-stone-700'
              }`}
            >
              <div
                className={`p-1 rounded-xl transition-all ${
                  activeTab === 'state_managers' ? 'bg-amber-100 text-amber-950 font-bold' : ''
                }`}
              >
                <ShieldCheck className="w-5 h-5 text-amber-700" />
              </div>
              <span className="text-[9px] sm:text-[10px] tracking-tight mt-0.5 font-bold text-amber-900">مینیجرز</span>
            </button>
          )}

          {/* 3. Students */}
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
            <span className="text-[9px] sm:text-[10px] tracking-tight mt-0.5">{t.students}</span>
          </button>

          {/* 4. Results */}
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
            <span className="text-[9px] sm:text-[10px] tracking-tight mt-0.5">{t.results}</span>
          </button>

          {/* 4.5. Feedbacks & Suggestions */}
          <button
            onClick={() => setActiveTab('feedbacks')}
            className={`flex flex-col items-center justify-center py-1 rounded-2xl transition-all cursor-pointer relative ${
              activeTab === 'feedbacks'
                ? 'text-emerald-800 font-bold scale-105'
                : 'text-stone-400 hover:text-stone-700'
            }`}
          >
            <div
              className={`p-1 rounded-xl transition-all relative ${
                activeTab === 'feedbacks' ? 'bg-emerald-100 text-emerald-900' : ''
              }`}
            >
              <MessageSquareQuote className="w-5 h-5" />
              {unreadFeedbacksCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-rose-600 text-white rounded-full text-[9px] font-bold flex items-center justify-center animate-pulse">
                  {unreadFeedbacksCount > 9 ? '9+' : unreadFeedbacksCount}
                </span>
              )}
            </div>
            <span className="text-[9px] sm:text-[10px] tracking-tight mt-0.5 font-urdu">
              {isEn ? 'Feedback' : 'فیڈ بیک'}
            </span>
          </button>

          {/* 5. Settings */}
          <button
            onClick={() => setActiveTab('settings')}
            className={`flex flex-col items-center justify-center py-1 rounded-2xl transition-all cursor-pointer ${
              activeTab === 'settings' || activeTab === 'more'
                ? 'text-emerald-800 font-bold scale-105'
                : 'text-stone-400 hover:text-stone-700'
            }`}
          >
            <div
              className={`p-1 rounded-xl transition-all ${
                activeTab === 'settings' || activeTab === 'more' ? 'bg-emerald-100 text-emerald-900' : ''
              }`}
            >
              <Settings className="w-5 h-5" />
            </div>
            <span className="text-[9px] sm:text-[10px] tracking-tight mt-0.5">{t.settings}</span>
          </button>
        </div>
      </nav>

      {/* ------------------------------------------------------------- */}
      {/* MODALS */}
      {/* ------------------------------------------------------------- */}

      {/* Madrasa Modal */}
      {isMadrasaModalOpen && (
        <MadrasaFormModal
          isOpen={isMadrasaModalOpen}
          onClose={() => {
            setIsMadrasaModalOpen(false);
            setEditingMadrasa(null);
          }}
          onSave={handleSaveMadrasa}
          onDelete={handleDeleteMadrasa}
          existingMadrasa={editingMadrasa}
          allMadaris={madaris}
        />
      )}

      {/* Class Modal */}
      {isClassModalOpen && selectedMadrasa && (
        <ClassFormModal
          isOpen={isClassModalOpen}
          onClose={() => {
            setIsClassModalOpen(false);
            setEditingClass(null);
          }}
          onSave={handleSaveClass}
          madrasa={selectedMadrasa}
          existingClass={editingClass}
        />
      )}

      {/* Student Form Modal */}
      {isStudentModalOpen && selectedMadrasa && (
        <StudentFormModal
          isOpen={isStudentModalOpen}
          onClose={() => {
            setIsStudentModalOpen(false);
            setEditingStudent(null);
          }}
          onSave={handleSaveStudent}
          madrasa={selectedMadrasa}
          classes={madrasaClasses}
          existingStudent={editingStudent}
        />
      )}

      {/* Kaifiyat Modal */}
      {isKaifiyatModalOpen && (
        <KaifiyatSettingsModal
          isOpen={isKaifiyatModalOpen}
          onClose={() => {
            setIsKaifiyatModalOpen(false);
            setSelectedMadrasaForKaifiyat(null);
          }}
          onSave={handleSaveKaifiyat}
          madrasa={selectedMadrasaForKaifiyat}
        />
      )}

      {/* Portal Logo Modal */}
      {isPortalLogoModalOpen && (
        <PortalLogoModal
          isOpen={isPortalLogoModalOpen}
          onClose={() => setIsPortalLogoModalOpen(false)}
          onSaved={() => {
            setPortalLogo(getPortalLogo());
            showToast('پورٹل کا مرکزی لوگو تبدیل ہو گیا');
            handleManualSync();
          }}
        />
      )}

      {/* Student Result Card Preview Modal - Ultra-compact header for max card space */}
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
                madrasa={previewStudent.madrasa}
                madrasaClass={previewStudent.cls}
                lang={lang}
              />
            </div>
          </div>
        </div>
      )}

      {/* Google Apps Script Modal */}
      {isScriptModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 bg-black/60 backdrop-blur-xs font-sans">
          <div className="bg-white rounded-3xl max-w-3xl w-full shadow-2xl border border-stone-200 max-h-[92vh] flex flex-col overflow-hidden">
            {/* Fixed Modal Header */}
            <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 border-b border-stone-200 bg-stone-50/70 shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
                  <FileCode className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm sm:text-base font-bold text-stone-900 font-urdu truncate">
                    گوگل اسکرپٹ کوڈ و سیٹ اپ (Apps Script)
                  </h3>
                  <p className="text-[11px] text-stone-500 font-urdu truncate">
                    کوڈ کاپی کر کے گوگل اسکرپٹ میں لگائیں — موبائل اور کمپیوٹر دونوں پر آسان
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsScriptModalOpen(false)}
                className="w-8 h-8 rounded-full bg-white border border-stone-200 hover:bg-stone-100 text-stone-600 flex items-center justify-center cursor-pointer font-bold shrink-0"
              >
                ✕
              </button>
            </div>

            {/* Clean 3-Tab Switcher */}
            <div className="px-4 sm:px-6 pt-3 pb-2.5 border-b border-stone-200 bg-white font-urdu shrink-0">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setScriptModalTab('central')}
                  className={`py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 border ${
                    scriptModalTab === 'central'
                      ? 'bg-emerald-800 text-white border-emerald-900 shadow-xs'
                      : 'bg-stone-50 hover:bg-stone-100 text-stone-700 border-stone-200'
                  }`}
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">۱. مرکزی شیٹ (Madaris)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setScriptModalTab('generator')}
                  className={`py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 border ${
                    scriptModalTab === 'generator'
                      ? 'bg-emerald-800 text-white border-emerald-900 shadow-xs'
                      : 'bg-stone-50 hover:bg-stone-100 text-stone-700 border-stone-200'
                  }`}
                >
                  <FileCode className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">۲. ڈرائیو فولڈر جنریٹر</span>
                </button>

                <button
                  type="button"
                  onClick={() => setScriptModalTab('sheet_editor')}
                  className={`py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 border ${
                    scriptModalTab === 'sheet_editor'
                      ? 'bg-emerald-800 text-white border-emerald-900 shadow-xs'
                      : 'bg-amber-50 hover:bg-amber-100 text-amber-950 border-amber-300'
                  }`}
                >
                  <FileCode className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">۳. نیا شیٹ ایڈیٹر (GS کوڈ)</span>
                </button>
              </div>
            </div>

            {/* Scrollable Modal Body */}
            <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-4 space-y-4">
              {scriptModalTab === 'central' ? (
                /* TAB 1: CENTRAL SHEET (Madaris & Feedback) */
                <>
                  {/* Code Box First — Immediately Visible & Easy to Copy */}
                  <div className="rounded-2xl border border-stone-800 bg-stone-950 overflow-hidden shadow-xs">
                    <div className="flex items-center justify-between gap-2 px-3.5 py-2.5 bg-stone-900 border-b border-stone-800">
                      <span className="text-xs font-bold text-stone-200 font-urdu">
                        مکمل کوڈ: مرکزی شیٹ (Madaris &amp; Feedback)
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(CENTRAL_SHEET_APPS_SCRIPT_CODE);
                          setCopiedCentralScript(true);
                          showToast('نئی شیٹ کا اسکرپٹ کوڈ کاپی ہو گیا!');
                          setTimeout(() => setCopiedCentralScript(false), 3000);
                        }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer font-urdu shrink-0 ${
                          copiedCentralScript
                            ? 'bg-emerald-600 text-white'
                            : 'bg-amber-400 hover:bg-amber-300 text-stone-950'
                        }`}
                      >
                        {copiedCentralScript ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedCentralScript ? 'کاپی ہو گیا ✓' : 'کوڈ کاپی کریں'}</span>
                      </button>
                    </div>
                    <textarea
                      readOnly
                      dir="ltr"
                      value={CENTRAL_SHEET_APPS_SCRIPT_CODE}
                      className="w-full h-56 sm:h-64 p-3 bg-stone-950 text-emerald-300 font-mono text-[11px] sm:text-xs focus:outline-none resize-y leading-relaxed"
                    />
                  </div>

                  {/* Web App URL Configuration Box */}
                  <div className="p-3.5 sm:p-4 bg-emerald-50/80 border border-emerald-200 rounded-2xl space-y-2.5 font-urdu">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <h4 className="font-bold text-xs sm:text-sm text-emerald-950">
                        مرکزی شیٹ ویب ایپ لنک (Web App URL)
                      </h4>
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded border ${
                        centralSheetUrl
                          ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                          : 'bg-amber-100 text-amber-900 border-amber-300'
                      }`}>
                        {centralSheetUrl ? '✓ منسلک ہے' : 'لنک درج کریں'}
                      </span>
                    </div>

                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                      <input
                        type="url"
                        dir="ltr"
                        placeholder="https://script.google.com/macros/s/AKfycb.../exec"
                        value={tempCentralSheetUrl}
                        onChange={(e) => {
                          const val = e.target.value;
                          const cleaned = sanitizeAppsScriptUrl(val);
                          setTempCentralSheetUrl(cleaned || val);
                        }}
                        onPaste={(e) => {
                          const pasted = e.clipboardData.getData('text');
                          const cleaned = sanitizeAppsScriptUrl(pasted);
                          if (cleaned) {
                            e.preventDefault();
                            setTempCentralSheetUrl(cleaned);
                          }
                        }}
                        className="flex-1 bg-white border border-emerald-300 rounded-xl px-3 py-2 text-xs font-mono text-stone-900 placeholder:text-stone-400 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                      />
                      <button
                        type="button"
                        onClick={() => handleSaveCentralSheetUrl(tempCentralSheetUrl)}
                        disabled={isSavingCentralSheetUrl || !tempCentralSheetUrl.trim()}
                        className="px-4 py-2 bg-emerald-800 hover:bg-emerald-900 text-white rounded-xl text-xs font-bold transition-all cursor-pointer disabled:opacity-50 shrink-0"
                      >
                        {isSavingCentralSheetUrl ? 'محفوظ ہو رہا ہے...' : 'لنک محفوظ کریں'}
                      </button>
                    </div>

                    {centralSheetUrl && (
                      <div className="text-[11px] font-mono text-emerald-800 truncate" dir="ltr">
                        فعال لنک: {centralSheetUrl}
                      </div>
                    )}
                  </div>

                  {/* Simple Guide */}
                  <div className="p-3.5 bg-amber-50/80 border border-amber-200 rounded-2xl text-xs space-y-1 font-urdu text-amber-950">
                    <strong className="block font-bold text-amber-900">طریقہ کار:</strong>
                    <ol className="list-decimal list-inside space-y-1 text-stone-700 leading-relaxed pr-1">
                      <li>اپنی نئی شیٹ (Madaris و Feedback) میں <strong>Extensions &gt; Apps Script</strong> کھولیں۔</li>
                      <li>اوپر والا کوڈ کاپی کر کے پیسٹ کریں اور Save کریں۔</li>
                      <li><strong>Deploy &gt; New deployment &gt; Web app (Anyone)</strong> کر کے ملنے والا لنک محفوظ کریں۔</li>
                    </ol>
                  </div>
                </>
              ) : scriptModalTab === 'generator' ? (
                /* TAB 2: DRIVE FOLDER GENERATOR */
                <>
                  {/* Code Box First */}
                  <div className="rounded-2xl border border-stone-800 bg-stone-950 overflow-hidden shadow-xs">
                    <div className="flex items-center justify-between gap-2 px-3.5 py-2.5 bg-stone-900 border-b border-stone-800">
                      <span className="text-xs font-bold text-stone-200 font-urdu">
                        مکمل کوڈ: ڈرائیو فولڈر جنریٹر (Drive Generator Code.gs)
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(GOOGLE_APPS_SCRIPT_CODE);
                          setCopiedScript(true);
                          showToast('گوگل اسکرپٹ کوڈ کامیابی سے کاپی ہو گیا!');
                          setTimeout(() => setCopiedScript(false), 3000);
                        }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer font-urdu shrink-0 ${
                          copiedScript
                            ? 'bg-emerald-600 text-white'
                            : 'bg-amber-400 hover:bg-amber-300 text-stone-950'
                        }`}
                      >
                        {copiedScript ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedScript ? 'کاپی ہو گیا ✓' : 'کوڈ کاپی کریں'}</span>
                      </button>
                    </div>
                    <textarea
                      readOnly
                      dir="ltr"
                      value={GOOGLE_APPS_SCRIPT_CODE}
                      className="w-full h-56 sm:h-64 p-3 bg-stone-950 text-emerald-300 font-mono text-[11px] sm:text-xs focus:outline-none resize-y leading-relaxed"
                    />
                  </div>

                  {/* Web App URL Configuration Box */}
                  <div className="p-3.5 sm:p-4 bg-emerald-50/80 border border-emerald-200 rounded-2xl space-y-2.5 font-urdu">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <h4 className="font-bold text-xs sm:text-sm text-emerald-950">
                        ڈرائیو جنریٹر ویب ایپ لنک (Web App URL)
                      </h4>
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded border ${
                        appsScriptWebAppUrl
                          ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                          : 'bg-amber-100 text-amber-900 border-amber-300'
                      }`}>
                        {appsScriptWebAppUrl ? '✓ ویب ایپ فعال ہے' : 'لنک درج نہیں'}
                      </span>
                    </div>

                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                      <input
                        type="url"
                        dir="ltr"
                        placeholder="https://script.google.com/macros/s/AKfycb.../exec"
                        value={tempWebAppUrl}
                        onChange={(e) => {
                          const val = e.target.value;
                          const cleaned = sanitizeAppsScriptUrl(val);
                          setTempWebAppUrl(cleaned || val);
                        }}
                        onPaste={(e) => {
                          const pasted = e.clipboardData.getData('text');
                          const cleaned = sanitizeAppsScriptUrl(pasted);
                          if (cleaned) {
                            e.preventDefault();
                            setTempWebAppUrl(cleaned);
                          }
                        }}
                        className="flex-1 bg-white border border-emerald-300 rounded-xl px-3 py-2 text-xs font-mono text-stone-900 placeholder:text-stone-400 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                      />
                      <button
                        type="button"
                        onClick={() => handleSaveWebAppUrl(tempWebAppUrl)}
                        disabled={isSavingWebAppUrl || !tempWebAppUrl.trim()}
                        className="px-4 py-2 bg-emerald-800 hover:bg-emerald-900 text-white rounded-xl text-xs font-bold transition-all cursor-pointer disabled:opacity-50 shrink-0"
                      >
                        {isSavingWebAppUrl ? 'محفوظ ہو رہا ہے...' : 'لنک محفوظ کریں'}
                      </button>
                    </div>

                    {appsScriptWebAppUrl && (
                      <div className="flex items-center justify-between gap-2 pt-1 flex-wrap text-xs">
                        <span className="text-emerald-800 text-[11px] truncate max-w-xs font-mono" dir="ltr">
                          فعال: {appsScriptWebAppUrl}
                        </span>
                        <button
                          type="button"
                          onClick={handleBatchGenerateViaAppsScript}
                          disabled={isBatchCreatingSheets}
                          className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-xs rounded-lg transition-all cursor-pointer disabled:opacity-50"
                        >
                          {isBatchCreatingSheets ? 'بن رہا ہے...' : '⚡ تمام غیر منسلک شیٹس تیار کریں'}
                        </button>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                /* TAB 3: SHEET EDITOR (TWO-WAY PORTAL <-> GOOGLE SHEET SYNC) */
                <>
                  {/* Code Box First — Clearly Visible */}
                  <div className="rounded-2xl border border-stone-800 bg-stone-950 overflow-hidden shadow-xs">
                    <div className="flex items-center justify-between gap-2 px-3.5 py-2.5 bg-stone-900 border-b border-stone-800">
                      <span className="text-xs font-bold text-amber-300 font-urdu">
                        نیا دوطرفہ شیٹ ایڈیٹر کوڈ (SheetEditor.gs)
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(STANDALONE_SHEET_EDITOR_SCRIPT_CODE);
                          setCopiedSheetEditorScript(true);
                          showToast('نیا شیٹ ایڈیٹر اسکرپٹ کوڈ کاپی ہو گیا!');
                          setTimeout(() => setCopiedSheetEditorScript(false), 3000);
                        }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer font-urdu shrink-0 ${
                          copiedSheetEditorScript
                            ? 'bg-emerald-600 text-white'
                            : 'bg-amber-400 hover:bg-amber-300 text-stone-950'
                        }`}
                      >
                        {copiedSheetEditorScript ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedSheetEditorScript ? 'کاپی ہو گیا ✓' : 'کوڈ کاپی کریں'}</span>
                      </button>
                    </div>
                    <textarea
                      readOnly
                      dir="ltr"
                      value={STANDALONE_SHEET_EDITOR_SCRIPT_CODE}
                      className="w-full h-56 sm:h-64 p-3 bg-stone-950 text-emerald-300 font-mono text-[11px] sm:text-xs focus:outline-none resize-y leading-relaxed"
                    />
                  </div>

                  {/* Two Simple Ways Card */}
                  <div className="p-3.5 bg-amber-50/90 border border-amber-200 rounded-2xl text-xs space-y-2 font-urdu text-amber-950">
                    <strong className="block font-bold text-amber-900 text-sm">
                      اسکرپٹ لگانے کا آسان طریقہ (دونوں طریقوں سے پورا پرانا فلو 100% محفوظ رہے گا):
                    </strong>
                    <div className="space-y-1.5 text-stone-800 leading-relaxed">
                      <p>
                        <strong className="text-emerald-900">آسان طریقہ ۱ (اسی پرانے Drive Generator پروجیکٹ میں + سے فائل بنائیں — نیا لنک نہیں بنانا پڑے گا):</strong>
                      </p>
                      <ol className="list-decimal list-inside space-y-1 pr-2 text-stone-700">
                        <li>اپنا پرانا <strong>Drive Generator</strong> والا Apps Script پروجیکٹ کھولیں (اس میں پرانے Code.gs کو مت چھیڑیں)۔</li>
                        <li>بائیں جانب <strong>Files</strong> کے پاس <strong>+ (Add a file &gt; Script)</strong> دبا کر نئی فائل بنائیں (نام: <strong>SheetEditor</strong>)۔</li>
                        <li>اوپر والا پورا کوڈ پیسٹ کر کے <strong>Save</strong> کریں (پرانے فلو کو خودکار محفوظ رکھنے کا بیک اپ کوڈ اندر شامل ہے)۔</li>
                        <li>اوپر <strong>Deploy &gt; Manage deployments &gt; پنسل (Edit)</strong> دبائیں، <strong>Version</strong> میں <strong>New version</strong> منتخب کر کے <strong>Deploy</strong> کر دیں۔</li>
                        <li>پرانا لنک ہی اپڈیٹ ہو کر کام شروع کر دے گا (الگ سے نیا لنک ڈالنے کی ضرورت نہیں)!</li>
                      </ol>
                      <p className="pt-1 text-[11px] text-stone-600">
                        <strong>طریقہ ۲ (اختیاری):</strong> اگر آپ بالکل الگ <strong>+ New project</strong> بنا کر نیا لنک لینا چاہیں، تو Deploy کر کے ملنے والا نیا لنک نیچے باکس میں محفوظ کر سکتے ہیں۔
                      </p>
                    </div>
                  </div>

                  {/* Optional Separate URL Override Card */}
                  <div className="p-3.5 sm:p-4 bg-emerald-50/80 border border-emerald-200 rounded-2xl space-y-2.5 font-urdu">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <h4 className="font-bold text-xs sm:text-sm text-emerald-950">
                        ایڈیٹر اسکرپٹ ویب ایپ لنک (اختیاری اگر طریقہ ۱ اپنایا ہو)
                      </h4>
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded border ${
                        sheetEditorUrl
                          ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                          : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      }`}>
                        {sheetEditorUrl ? '✓ مخصوص لنک منسلک ہے' : 'خودکار پرانا لنک فعال ہے'}
                      </span>
                    </div>

                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                      <input
                        type="url"
                        dir="ltr"
                        placeholder={appsScriptWebAppUrl || 'https://script.google.com/macros/s/AKfycb.../exec'}
                        value={tempSheetEditorUrl}
                        onChange={(e) => {
                          const val = e.target.value;
                          const cleaned = sanitizeAppsScriptUrl(val);
                          setTempSheetEditorUrl(cleaned || val);
                        }}
                        onPaste={(e) => {
                          const pasted = e.clipboardData.getData('text');
                          const cleaned = sanitizeAppsScriptUrl(pasted);
                          if (cleaned) {
                            e.preventDefault();
                            setTempSheetEditorUrl(cleaned);
                          }
                        }}
                        className="flex-1 bg-white border border-emerald-300 rounded-xl px-3 py-2 text-xs font-mono text-stone-900 placeholder:text-stone-400 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                      />
                      <button
                        type="button"
                        onClick={() => handleSaveSheetEditorUrl(tempSheetEditorUrl)}
                        disabled={isSavingSheetEditorUrl || !tempSheetEditorUrl.trim()}
                        className="px-4 py-2 bg-emerald-800 hover:bg-emerald-900 text-white rounded-xl text-xs font-bold transition-all cursor-pointer disabled:opacity-50 shrink-0"
                      >
                        {isSavingSheetEditorUrl ? 'محفوظ ہو رہا ہے...' : 'لنک محفوظ کریں'}
                      </button>
                    </div>

                    {sheetEditorUrl && (
                      <div className="text-[11px] font-mono text-emerald-800 truncate" dir="ltr">
                        مخصوص لنک: {sheetEditorUrl}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Fixed Clean Footer — Never overlaps body */}
            <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-3 border-t border-stone-200 bg-stone-50/90 shrink-0 font-urdu">
              <a
                href="https://script.google.com"
                target="_blank"
                rel="noreferrer"
                className="px-3.5 py-2 rounded-xl bg-white border border-stone-300 hover:bg-stone-100 text-stone-800 text-xs font-bold flex items-center gap-1.5 transition-all"
              >
                <span>script.google.com کھولیں ↗</span>
              </a>
              <button
                type="button"
                onClick={() => setIsScriptModalOpen(false)}
                className="px-5 py-2 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-bold cursor-pointer transition-all shadow-xs"
              >
                بند کریں
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Result Admin PIN Change Modal */}
      {isPinModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs font-sans">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-stone-200 animate-fade-in">
            <div className="flex items-center justify-between pb-3 border-b border-stone-100 mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center">
                  <KeyRound className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-stone-900 leading-tight">
                    {isEn ? 'Change Result Admin PIN' : 'امتحانی رزلٹ ایڈمن پن تبدیل کریں'}
                  </h3>
                  <p className="text-[11px] text-stone-500">
                    {isEn ? 'Update security PIN for Mayaar-e-Madaris admin' : 'معیارِ مدارس امتحانی رزلٹ ایڈمن کا خفیہ پن تبدیل کریں'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsPinModalOpen(false)}
                className="w-7 h-7 rounded-full bg-stone-100 hover:bg-stone-200 text-stone-500 flex items-center justify-center text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleChangeResultPin} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  {isEn ? 'Current PIN' : 'موجودہ (پرانا) سیکیورٹی پن'}
                </label>
                <input
                  type="password"
                  dir="ltr"
                  placeholder={isEn ? 'Enter current PIN' : 'موجودہ پن درج کریں'}
                  value={currentPin}
                  onChange={(e) => setCurrentPin(e.target.value)}
                  className="w-full px-4 py-2.5 bg-stone-50 border border-stone-300 rounded-2xl text-stone-900 font-mono text-center tracking-widest focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  {isEn ? 'New PIN (at least 4 characters)' : 'نیا سیکیورٹی پن (کم از کم 4 حروف/ہندسے)'}
                </label>
                <input
                  type="password"
                  dir="ltr"
                  placeholder={isEn ? 'Enter new PIN' : 'نیا پن درج کریں'}
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value)}
                  className="w-full px-4 py-2.5 bg-stone-50 border border-stone-300 rounded-2xl text-stone-900 font-mono text-center tracking-widest focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  {isEn ? 'Confirm New PIN' : 'نئے پن کی تصدیق فرمائیں'}
                </label>
                <input
                  type="password"
                  dir="ltr"
                  placeholder={isEn ? 'Re-enter new PIN' : 'نیا پن دوبارہ درج کریں'}
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value)}
                  className="w-full px-4 py-2.5 bg-stone-50 border border-stone-300 rounded-2xl text-stone-900 font-mono text-center tracking-widest focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-600"
                />
              </div>

              {pinError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2 text-rose-800 text-xs">
                  <ShieldAlert className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{pinError}</span>
                </div>
              )}

              {pinSuccess && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2 text-emerald-800 text-xs">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                  <span>{pinSuccess}</span>
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsPinModalOpen(false)}
                  className="flex-1 py-2.5 px-4 rounded-xl border border-stone-200 text-stone-600 hover:bg-stone-50 text-xs font-medium cursor-pointer"
                >
                  {isEn ? 'Cancel' : 'منسوخ'}
                </button>
                <button
                  type="submit"
                  disabled={isSavingPin}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>{isSavingPin ? (isEn ? 'Saving...' : 'محفوظ ہو رہا ہے...') : (isEn ? 'Save PIN' : 'نیا پن محفوظ کریں')}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Madrasa Form Notice Preview Modal */}
      <MadrasaFormNoticeModal
        isOpen={isFormNoticePreviewOpen}
        onClose={() => setIsFormNoticePreviewOpen(false)}
        status={formStatus}
        isAdmin={true}
        onTurnOnForm={handleToggleFormStatus}
        onGoToHome={() => setIsFormNoticePreviewOpen(false)}
      />

      {/* Edit Form Status Message Modal */}
      {isEditingFormStatus && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4" dir="rtl">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4 font-sans animate-scale-up border border-stone-200">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-800 flex items-center justify-center">
                  <Edit className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-base text-stone-900">
                  مدرسہ فارم نوٹس و اطلاعیہ میں ترمیم
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsEditingFormStatus(false)}
                className="text-stone-400 hover:text-stone-700 p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">
                  سلام / استقبالیہ جملہ:
                </label>
                <input
                  type="text"
                  value={formStatusEditGreeting}
                  onChange={(e) => setFormStatusEditGreeting(e.target.value)}
                  placeholder="السلام علیکم ورحمۃ اللہ وبرکاتہ"
                  className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-xs font-bold text-stone-900 focus:outline-none focus:ring-2 focus:ring-emerald-700 font-nastaliq"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">
                  کام جاری ہے کا پیغام (ہر سطر الگ لائن میں):
                </label>
                <textarea
                  rows={4}
                  value={formStatusEditMessage}
                  onChange={(e) => setFormStatusEditMessage(e.target.value)}
                  placeholder={"ابھی اس پر کام ہو رہا ہے\nکچھ دن بعد دوبارہ کوشش کریں"}
                  className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-xs font-medium text-stone-900 focus:outline-none focus:ring-2 focus:ring-emerald-700 leading-relaxed font-nastaliq"
                />
              </div>

              <div className="flex items-center justify-between gap-2 pt-2 border-t border-stone-100">
                <button
                  type="button"
                  onClick={handleResetFormStatusDefaultText}
                  className="text-[11px] font-bold text-stone-600 hover:text-amber-800 underline cursor-pointer"
                >
                  طے شدہ متن پر ری سیٹ
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsEditingFormStatus(false)}
                    className="px-3.5 py-2 rounded-xl border border-stone-200 text-stone-600 hover:bg-stone-50 text-xs font-medium cursor-pointer"
                  >
                    منسوخ
                  </button>
                  <button
                    type="button"
                    disabled={isSavingFormStatus}
                    onClick={handleSaveFormStatusCustomText}
                    className="px-4 py-2 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-bold transition-colors cursor-pointer shadow-xs disabled:opacity-60"
                  >
                    {isSavingFormStatus ? 'محفوظ ہو رہا ہے...' : 'محفوظ کریں'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Verify & Link Madrasa Modal */}
      {verifyingMadrasa && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 font-urdu">
          <div className="bg-white rounded-3xl max-w-lg w-full p-5 sm:p-6 shadow-2xl border border-stone-200 animate-fade-in space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-stone-100">
              <div className="flex items-center gap-2.5">
                <div
                  className={`w-10 h-10 rounded-2xl flex items-center justify-center text-white ${
                    isMadrasaLinkedAndVerified(verifyingMadrasa) ? 'bg-emerald-600' : 'bg-rose-600 animate-pulse'
                  }`}
                >
                  <Building2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-stone-900 leading-tight">
                    {verifyingMadrasa.urduName}
                  </h3>
                  <span className="text-xs text-stone-400 font-sans">
                    {verifyingMadrasa.code} · {verifyingMadrasa.englishName}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setVerifyingMadrasa(null)}
                className="p-1.5 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-600 cursor-pointer"
                title="بند کریں"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Status Badge */}
            <div className="flex items-center justify-between p-3 rounded-2xl bg-stone-50 border border-stone-200 text-xs">
              <span className="font-bold text-stone-600">حیثیت (Status):</span>
              {isMadrasaLinkedAndVerified(verifyingMadrasa) ? (
                <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 font-bold border border-emerald-200 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                  <span>منسلک و تصدیق شدہ (Verified & Linked)</span>
                </span>
              ) : (
                <span className="px-2.5 py-1 rounded-full bg-rose-100 text-rose-700 font-bold border border-rose-200 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-rose-600" />
                  <span>زیر التوا تصدیق (Pending Verification)</span>
                </span>
              )}
            </div>

            {/* Credentials Card */}
            <div className="p-3 bg-stone-50 rounded-2xl border border-stone-200 text-xs space-y-2">
              <span className="font-bold text-stone-700 block">پرنسپل لاگ ان کریڈینشلز:</span>
              <div className="grid grid-cols-2 gap-2 text-center font-mono">
                <div className="bg-white p-2 rounded-xl border border-stone-200">
                  <span className="text-[10px] text-stone-400 block font-sans">یوزر ID</span>
                  <span className="font-bold text-stone-900">{verifyingMadrasa.code}</span>
                </div>
                <div className="bg-white p-2 rounded-xl border border-stone-200">
                  <span className="text-[10px] text-stone-400 block font-sans">پاسورڈ</span>
                  <span className="font-bold text-emerald-800">
                    {verifyingMadrasa.principalPassword || `${verifyingMadrasa.code}@1234`}
                  </span>
                </div>
              </div>
            </div>

            {/* Automatic Activation Note */}
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 leading-relaxed font-urdu">
              ✓ اس ادارے کے کوائف، پرنسپل پینل اور امتحانی نتائج خودکار مرکزی سسٹم سے مربوط ہیں۔ تصدیق کرتے ہی یہ ادارہ فوری فعال ہو جائے گا۔
            </div>

            {/* Actions */}
            <div className="pt-2 flex flex-col gap-2">
              <div className="flex flex-col sm:flex-row gap-2">
                <button
                  type="button"
                  disabled={isVerifyingAction}
                  onClick={async () => {
                    setIsVerifyingAction(true);
                    try {
                      // Optimistically update local state immediately so arrow turns GREEN instantly
                      const targetId = verifyingMadrasa.id;
                      const targetCode = verifyingMadrasa.code;
                      const updatedMadarisList = madaris.map((item) =>
                        item.id === targetId || (targetCode && item.code === targetCode)
                          ? {
                              ...item,
                              registrationStatus: 'approved' as const,
                              isVerified: true,
                              approvedAt: new Date().toISOString(),
                              googleSheetUrl: verifyingSheetUrl || item.googleSheetUrl,
                            }
                          : item
                      );
                      setMadaris(updatedMadarisList);
                      saveStoredMadaris(updatedMadarisList);

                      const res = await verifyAndApproveMadrasa(verifyingMadrasa, true, verifyingSheetUrl);
                      if (res?.madaris) setMadaris(res.madaris);
                      if (res?.classes) setClasses(res.classes);

                      showToast(isEn ? 'Madrasa verified and approved!' : 'مدرسہ کامیابی سے ویریفائی اور منظور کر دیا گیا!');
                      setVerifyingMadrasa(null);
                    } catch (err) {
                      console.error('Failed to verify madrasa:', err);
                      showToast('تصدیق میں خامی پیش آئی');
                    } finally {
                      setIsVerifyingAction(false);
                    }
                  }}
                  className="flex-1 py-2.5 px-4 bg-emerald-800 hover:bg-emerald-900 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-xs cursor-pointer disabled:opacity-50"
                >
                  <CheckCircle2 className="w-4 h-4 text-amber-300" />
                  <span>{isVerifyingAction ? 'تصدیق ہو رہی ہے...' : 'ویریفائی کریں اور منظور کریں'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const mId = verifyingMadrasa.id;
                    setVerifyingMadrasa(null);
                    setOpenedMadrasaId(mId);
                  }}
                  className="py-2.5 px-4 bg-stone-100 hover:bg-stone-200 text-stone-800 rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Eye className="w-4 h-4 text-stone-600" />
                  <span>پرسنل پورٹل کھولیں</span>
                </button>
              </div>

              {/* Delete Madrasa Option in Verification Modal */}
              <button
                type="button"
                onClick={() => {
                  const idToDelete = verifyingMadrasa.id;
                  setVerifyingMadrasa(null);
                  handleDeleteMadrasa(idToDelete);
                }}
                className="w-full py-2 px-3 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                <span>{isEn ? 'Delete this Madrasa' : 'مدرسہ حذف کریں'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* State Manager & Super Admin Verification/Approval Modal */}
      {reviewingMadrasa && (
        <ManagerVerificationModal
          madrasa={reviewingMadrasa}
          classes={classes}
          isOpen={Boolean(reviewingMadrasa)}
          onClose={() => setReviewingMadrasa(null)}
          onVerified={(updated) => {
            const approvedMadrasa: Madrasa = {
              ...updated,
              registrationStatus: 'approved',
              isVerified: true,
              managerVerified: true,
              approvedAt: updated.approvedAt || new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            };
            setMadaris((prev) =>
              prev.map((item) =>
                item.id === approvedMadrasa.id || item.code === approvedMadrasa.code
                  ? { ...item, ...approvedMadrasa }
                  : item
              )
            );
            persistMadrasa(approvedMadrasa).catch((err) =>
              console.warn('Persist approved madrasa error:', err)
            );
            setTimeout(() => {
              const current = getStoredMadaris();
              const next = current.map((item) =>
                item.id === approvedMadrasa.id || item.code === approvedMadrasa.code
                  ? { ...item, ...approvedMadrasa }
                  : item
              );
              saveStoredMadaris(next);
            }, 0);
            showToast(isManagerView ? 'مدرسہ کی تصدیق مکمل ہو گئی' : 'مدرسہ منظور اور فعال کر دیا گیا');
          }}
          managerName={currentManager?.name || (isManagerView ? 'صوبائی مینیجر' : 'مرکزی ایڈمنسٹریٹر')}
          managerId={currentManager?.id || (isManagerView ? 'manager' : 'super-admin')}
          isSuperAdmin={!isManagerView}
        />
      )}

      {/* Confirmation Dialog */}
      {confirmDialog && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4 font-sans animate-scale-up">
            <h3 className="font-urdu text-lg font-bold text-stone-900">{confirmDialog.title}</h3>
            <p className="text-xs text-stone-600 font-urdu leading-relaxed">{confirmDialog.message}</p>
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                onClick={() => setConfirmDialog(null)}
                className="px-4 py-2 rounded-xl border border-stone-300 text-stone-700 text-xs font-bold hover:bg-stone-50 cursor-pointer"
              >
                منسوخ
              </button>
              <button
                onClick={confirmDialog.onConfirm}
                className="px-4 py-2 rounded-xl bg-rose-700 hover:bg-rose-800 text-white text-xs font-bold shadow-xs cursor-pointer"
              >
                تصدیق کریں
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Launch Countdown Preview & Simulation Modal */}
      {isPreviewCountdownOpen && (
        <LaunchCountdownModal
          timer={{
            ...launchTimer,
            targetDate: timerTargetDateInput ? new Date(timerTargetDateInput).toISOString() : launchTimer.targetDate,
            title: timerTitleInput || launchTimer.title,
            message: timerMessageInput || launchTimer.message,
          }}
          isPreview={true}
          onClosePreview={() => setIsPreviewCountdownOpen(false)}
          onLaunchComplete={() => {
            showToast('کاؤنٹ ڈاؤن کا وقت مکمل! جشن اور افتتاحی اینیمیشن کامیابی سے دکھائی گئی', 'success');
          }}
        />
      )}
    </div>
  );
};
