import React, { useState, useEffect } from 'react';
import { SearchResultMatch, Madrasa, PortalLaunchTimer } from '../../types';
import {
  searchStudentOnServer,
  syncWithServer,
  checkServerStatus,
  getPortalLogo,
  getStoredMadaris,
  getStoredLaunchTimer,
  fetchLaunchTimer,
  saveStoredLaunchTimer,
  LAUNCH_TIMER_UPDATED_EVENT,
} from '../../utils/storage';
import { ResultCard } from './ResultCard';
import { FeedbackModal } from './FeedbackModal';
import { LaunchCountdownModal } from '../common/LaunchCountdownModal';
import { CalendarDatePicker } from '../common/CalendarDatePicker';
import { Language, translations } from '../../utils/translations';
import {
  Search,
  UserCheck,
  ShieldAlert,
  BookOpen,
  School,
  Sparkles,
  ArrowRight,
  Download,
  Languages,
  Building2,
  Shield,
  ShieldCheck,
  LogOut,
  GraduationCap,
  Menu,
  X,
  Info,
  PhoneCall,
  UserPlus,
  HelpCircle,
  FileText,
  ChevronRight,
  ChevronLeft,
  Globe,
  Mail,
  MapPin,
  MessageSquareQuote,
} from 'lucide-react';

export type AuthRole = 'result_admin' | 'principal' | 'state_manager' | null;

interface PublicResultPortalProps {
  onOpenAdmin: () => void;
  onOpenPrincipal: (code?: string) => void;
  onOpenRegister?: () => void;
  onOpenAbout?: () => void;
  onOpenLegal?: () => void;
  authRole?: AuthRole;
  currentPrincipalMadrasa?: Madrasa | null;
  onLogout?: () => void;
  onBackToHome?: () => void;
}

export const PublicResultPortal: React.FC<PublicResultPortalProps> = ({
  onOpenAdmin,
  onOpenPrincipal,
  onOpenRegister,
  onOpenAbout,
  onOpenLegal,
  authRole = null,
  currentPrincipalMadrasa = null,
  onLogout,
}) => {
  const [lang, setLang] = useState<Language>(() => {
    return (localStorage.getItem('meyar_lang') as Language) || 'ur';
  });
  const t = translations[lang];
  const isEn = lang === 'en';

  // Toggle Menu and Modal States
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isContactModalOpen, setIsContactModalOpen] = useState(false);
  const [isFeedbackModalOpen, setIsFeedbackModalOpen] = useState(false);

  const toggleLanguage = () => {
    const nextLang = lang === 'ur' ? 'en' : 'ur';
    setLang(nextLang);
    localStorage.setItem('meyar_lang', nextLang);
    document.documentElement.dir = nextLang === 'ur' ? 'rtl' : 'ltr';
    document.documentElement.lang = nextLang;
    window.dispatchEvent(new CustomEvent('meyar_lang_changed', { detail: { lang: nextLang } }));
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

  const [studentId, setStudentId] = useState('');
  const [dob, setDob] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<SearchResultMatch | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [serverOnline, setServerOnline] = useState<boolean>(true);
  const [portalLogo, setPortalLogo] = useState<string>(getPortalLogo());
  const [launchTimer, setLaunchTimer] = useState<PortalLaunchTimer>(() => getStoredLaunchTimer());
  const [isLaunchModalDismissed, setIsLaunchModalDismissed] = useState(false);

  useEffect(() => {
    // Initial sync with central cloud server (0 Firestore reads for public visitors)
    const isPrivileged =
      authRole === 'result_admin' ||
      authRole === 'state_manager' ||
      authRole === 'principal';
    syncWithServer(false, { skipFirestore: !isPrivileged });
    checkServerStatus().then((s) => setServerOnline(s.online));
    fetchLaunchTimer().then((lt) => {
      if (lt) setLaunchTimer(lt);
    });

    const handleUpdate = () => {
      checkServerStatus().then((s) => setServerOnline(s.online));
      setPortalLogo(getPortalLogo());
    };

    const handleLogoUpdate = (e: any) => {
      if (e.detail?.logo) {
        setPortalLogo(e.detail.logo);
      }
    };

    const handleTimerUpdate = (e: any) => {
      if (e.detail?.timer) {
        setLaunchTimer(e.detail.timer);
      } else {
        setLaunchTimer(getStoredLaunchTimer());
      }
    };

    window.addEventListener('meyar_data_updated', handleUpdate);
    window.addEventListener('portal_logo_updated', handleLogoUpdate);
    window.addEventListener(LAUNCH_TIMER_UPDATED_EVENT, handleTimerUpdate);
    return () => {
      window.removeEventListener('meyar_data_updated', handleUpdate);
      window.removeEventListener('portal_logo_updated', handleLogoUpdate);
      window.removeEventListener(LAUNCH_TIMER_UPDATED_EVENT, handleTimerUpdate);
    };
  }, []);

  const shouldShowCountdown =
    launchTimer.enabled &&
    !launchTimer.isLaunched &&
    !isLaunchModalDismissed &&
    new Date(launchTimer.targetDate).getTime() > Date.now();

  const handleLaunchCompleted = () => {
    setIsLaunchModalDismissed(true);
    saveStoredLaunchTimer({ isLaunched: true });
  };

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setErrorMessage(null);

    if (!studentId.trim() || !dob.trim()) {
      setErrorMessage(t.enterBothFields);
      return;
    }

    setIsSearching(true);
    try {
      const res = await searchStudentOnServer(studentId, dob);
      if ('error' in res) {
        setSearchResult(null);
        setErrorMessage(res.error || t.resultNotFound);
      } else {
        // Reconcile madrasa with stored profile to ensure user-entered form address is respected
        try {
          const localMadaris = getStoredMadaris();
          const localMatch = localMadaris.find(
            (m) =>
              (res.madrasa?.id && m.id === res.madrasa.id) ||
              (res.madrasa?.code && m.code && m.code.toUpperCase() === res.madrasa.code.toUpperCase()) ||
              (res.madrasa?.urduName && m.urduName && m.urduName.trim() === res.madrasa.urduName.trim())
          );
          if (localMatch) {
            if (localMatch.address && localMatch.address.trim() && localMatch.address !== 'جھارکھنڈ، بھارت') {
              res.madrasa.address = localMatch.address.trim();
              if (localMatch.state) res.madrasa.state = localMatch.state;
              if (localMatch.district) res.madrasa.district = localMatch.district;
            }
            if (
              localMatch.themeColor &&
              localMatch.themeColor.trim() &&
              (!res.madrasa.themeColor ||
                res.madrasa.themeColor === '#065f46' && localMatch.themeColor.toLowerCase() !== '#065f46')
            ) {
              res.madrasa.themeColor = localMatch.themeColor;
            }
            if (!res.madrasa.logo && localMatch.logo) {
              res.madrasa.logo = localMatch.logo;
            }
          }
        } catch {}

        setSearchResult(res);
        setErrorMessage(null);
      }
    } catch {
      setSearchResult(null);
      setErrorMessage(t.resultNotFound);
    } finally {
      setIsSearching(false);
    }
  };

  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownloadCard = async () => {
    const cardElem = document.getElementById('madrasa-result-card');
    if (!cardElem || isDownloading) return;
    setIsDownloading(true);
    try {
      const { toPng } = await import('html-to-image');
      let dataUrl: string;
      try {
        dataUrl = await toPng(cardElem, {
          pixelRatio: 2,
          backgroundColor: '#ffffff',
          cacheBust: true,
        });
      } catch {
        // Fallback with skipFonts if external font loading triggered security restrictions
        dataUrl = await toPng(cardElem, {
          pixelRatio: 2,
          backgroundColor: '#ffffff',
          skipFonts: true,
        });
      }

      const link = document.createElement('a');
      const studentIdStr = searchResult?.student?.studentId || 'result';
      const studentNameStr = searchResult?.student?.studentNameEn || searchResult?.student?.studentName || 'student';
      link.download = `ResultCard_${studentIdStr}_${studentNameStr.replace(/\s+/g, '_')}.png`;
      link.href = dataUrl;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error('Failed to download card image:', err);
      window.print();
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className={`min-h-screen flex flex-col justify-between bg-stone-100/60 text-stone-900 ${isEn ? 'font-sans' : 'font-arabic'}`} dir={isEn ? 'ltr' : 'rtl'}>
      {/* Top Header: Clean Branding on Left, Admin Icon on Right */}
      <header className="bg-white border-b border-stone-200 shadow-xs sticky top-0 z-40" dir="ltr">
        <div className="max-w-5xl mx-auto px-4 py-3 sm:py-3.5 flex items-center justify-between gap-3">
          {/* Brand with single clean official Logo */}
          <div className="flex items-center gap-3 min-w-0">
            <img
              src={portalLogo}
              alt="Meyar-e-Madaris Logo"
              className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl object-contain p-0.5 bg-white border border-stone-200 shadow-2xs shrink-0"
              onError={(e) => {
                (e.target as HTMLImageElement).src = '/logo.jpg';
              }}
            />
            <div className="min-w-0">
              <h1
                style={{ fontFamily: isEn ? undefined : "'Aslam Aslam', 'Aslam', serif" }}
                className={`text-2xl sm:text-3xl font-bold text-emerald-950 leading-tight truncate whitespace-nowrap ${isEn ? 'font-sans' : 'font-aslam'}`}
              >
                {isEn ? 'Mayaar-e-Madaris' : 'معیار مدارس'}
              </h1>
              <p className={`text-[11px] sm:text-xs text-stone-500 -mt-0.5 truncate whitespace-nowrap ${isEn ? 'font-sans' : 'font-urdu'}`}>
                {isEn ? 'Madrasa Digital Portal' : 'مدرسہ ڈیجیٹل پورٹل'}
              </p>
            </div>
          </div>

          {/* Right Side: Toggle Menu Button */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setIsMenuOpen(true)}
              className="w-10 h-10 rounded-xl bg-stone-100 hover:bg-emerald-50 text-stone-700 hover:text-emerald-800 border border-stone-200/90 flex items-center justify-center transition-all cursor-pointer shadow-2xs group"
              title={isEn ? "Menu" : "مینو"}
              aria-label="Toggle Navigation Menu"
            >
              <Menu className="w-5 h-5 group-hover:scale-105 transition-transform text-stone-700" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className={`flex-1 max-w-5xl w-full mx-auto px-4 ${searchResult ? 'py-4 sm:py-6' : 'py-8 sm:py-12'}`}>
        {searchResult ? (
          <div className="w-full flex flex-col items-center">
            {/* External toolbar outside result card */}
            <div
              dir={isEn ? 'ltr' : 'rtl'}
              className="no-print w-full max-w-[420px] mb-3 flex items-center justify-between gap-3 bg-white p-2.5 rounded-2xl border border-stone-200 shadow-2xs"
            >
              <button
                onClick={() => setSearchResult(null)}
                dir={isEn ? 'ltr' : 'rtl'}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-stone-700 bg-stone-100 hover:bg-stone-200 rounded-xl transition-colors cursor-pointer ${
                  isEn ? 'font-sans' : 'font-alvi'
                }`}
              >
                <ArrowRight className={`w-4 h-4 ${isEn ? 'rotate-180' : ''}`} />
                <span>{t.newSearch}</span>
              </button>

              <button
                onClick={handleDownloadCard}
                disabled={isDownloading}
                dir={isEn ? 'ltr' : 'rtl'}
                className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-[#15345d] hover:bg-[#102949] rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-60 ${
                  isEn ? 'font-sans' : 'font-alvi'
                }`}
              >
                <Download className="w-4 h-4" />
                <span>{t.printPdf}</span>
              </button>
            </div>

            {/* Exact Madrasa Result Card */}
            <ResultCard
              student={searchResult.student}
              madrasa={searchResult.madrasa}
              madrasaClass={searchResult.madrasaClass}
              lang={lang}
            />
          </div>
        ) : (
          <div className="max-w-2xl mx-auto space-y-7">
            {/* Hero Card */}
            <div className="text-center">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 mb-3 shadow-2xs">
                <Sparkles className="w-3.5 h-3.5 text-emerald-700" />
                {t.searchHeroTag}
              </span>
              <h2 className={`text-2xl sm:text-3xl md:text-4xl font-bold text-stone-900 leading-normal ${isEn ? 'font-sans' : 'font-urdu'}`}>
                {t.searchHeroTitle}
              </h2>
              <p className="text-stone-600 text-xs sm:text-sm mt-1 max-w-lg mx-auto leading-relaxed">
                {t.searchHeroDesc}
              </p>
            </div>

            {/* Search Box */}
            <div className="bg-white rounded-3xl p-6 sm:p-8 border border-stone-200 shadow-md">
              <form onSubmit={handleSearch} className="space-y-5">
                <div>
                  <label htmlFor="student-id" className="block text-sm font-semibold text-stone-800 mb-1.5">
                    {t.studentIdLabel}
                  </label>
                  <div className="relative">
                    <input
                      id="student-id"
                      type="text"
                      dir="ltr"
                      placeholder="e.g. 110001"
                      value={studentId}
                      onChange={(e) => setStudentId(e.target.value)}
                      className="w-full px-4 py-3 bg-stone-50 border border-stone-300 rounded-xl text-stone-900 font-mono text-base focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-transparent transition-all tracking-wider text-left pl-11"
                    />
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-stone-400">
                      <UserCheck className="w-5 h-5" />
                    </div>
                  </div>
                  <p className="text-[11px] text-stone-500 mt-1">
                    {t.studentIdHint}
                  </p>
                </div>

                <div>
                  <label htmlFor="student-dob" className="block text-sm font-semibold text-stone-800 mb-1.5">
                    {t.dobLabel}
                  </label>
                  <CalendarDatePicker
                    id="student-dob"
                    value={dob}
                    onChange={setDob}
                    placeholder="DD/MM/YYYY"
                  />
                </div>

                {errorMessage && (
                  <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2.5 text-rose-800 text-xs sm:text-sm">
                    <ShieldAlert className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-semibold block">{errorMessage}</span>
                    </div>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isSearching}
                  className="w-full py-3.5 px-6 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-semibold text-base shadow-sm hover:shadow transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-70"
                >
                  <Search className="w-5 h-5" />
                  <span>{isSearching ? t.searchingButton : t.searchButton}</span>
                </button>
              </form>
            </div>
          </div>
        )}
      </main>

      {/* Bottom Footer Area: Suggestion & Feedback Button */}
      <footer className="w-full py-4 px-4 text-center border-t border-stone-200/90 bg-white/80 backdrop-blur-xs mt-auto no-print">
        <div className="max-w-md mx-auto flex flex-col items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => setIsFeedbackModalOpen(true)}
            className="inline-flex items-center gap-2 py-2.5 px-6 rounded-2xl bg-gradient-to-r from-emerald-800 via-emerald-900 to-teal-900 hover:from-emerald-700 hover:to-teal-800 text-white text-xs sm:text-sm font-bold shadow-md hover:shadow-lg transition-all cursor-pointer active:scale-[0.98] group"
          >
            <MessageSquareQuote className="w-4 h-4 text-amber-300 group-hover:scale-110 transition-transform" />
            <span>{isEn ? 'Suggestions / Feedback' : 'سجیشن / فیڈ بیک'}</span>
          </button>
          <p className="text-[11px] text-stone-500 font-urdu">
            {isEn
              ? 'Meyar-e-Madaris — Central Digital Examination & Madrasa Portal'
              : 'معیارِ مدارس — مرکزی ڈیجیٹل امتحانی رزلٹ و پورٹل سسٹم'}
          </p>
        </div>
      </footer>

      {/* Slide-over Toggle Menu Drawer */}
      {isMenuOpen && (
        <div className="fixed inset-0 z-50 flex justify-end" dir={isEn ? 'ltr' : 'rtl'}>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity animate-fade-in"
            onClick={() => setIsMenuOpen(false)}
          />

          {/* Drawer Content */}
          <div className="relative w-80 max-w-[85vw] h-full bg-white shadow-2xl flex flex-col justify-between z-10 border-s border-stone-200 animate-slide-in">
            {/* Drawer Header */}
            <div className="p-4 sm:p-5 border-b border-stone-100 flex items-center justify-between bg-stone-50/70">
              <div className="flex items-center gap-2.5">
                <img
                  src={portalLogo}
                  alt="Meyar-e-Madaris Logo"
                  className="w-9 h-9 rounded-xl object-contain p-0.5 bg-white border border-stone-200 shadow-2xs"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = '/logo.jpg';
                  }}
                />
                <div>
                  <h3
                    style={{ fontFamily: isEn ? undefined : "'Aslam Aslam', 'Aslam', serif" }}
                    className={`text-base font-bold text-emerald-950 leading-tight ${isEn ? 'font-sans' : 'font-aslam text-xl'}`}
                  >
                    {isEn ? 'Mayaar-e-Madaris' : 'معیار مدارس'}
                  </h3>
                  <span className="text-[10px] text-stone-500 font-urdu block">
                    {isEn ? 'Navigation Menu' : 'مرکزی مینو'}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsMenuOpen(false)}
                className="w-8 h-8 rounded-full bg-stone-100 hover:bg-stone-200 text-stone-600 flex items-center justify-center transition-colors cursor-pointer"
                aria-label="Close menu"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Drawer Navigation Links */}
            <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-1.5 font-urdu">
              {/* 1. Results / Search */}
              <button
                type="button"
                onClick={() => {
                  setIsMenuOpen(false);
                  if (searchResult) setSearchResult(null);
                }}
                className="w-full p-3 rounded-xl hover:bg-emerald-50 text-stone-800 hover:text-emerald-900 transition-all text-start flex items-center gap-3 cursor-pointer group"
              >
                <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  <Search className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="font-bold text-sm block">
                    {isEn ? 'Exam Results' : 'امتحانی نتائج (Search)'}
                  </span>
                  <span className="text-[11px] text-stone-500 block truncate">
                    {isEn ? 'Search student result by ID & DOB' : 'طالب علم کا نتیجہ معلوم کریں'}
                  </span>
                </div>
              </button>

              {/* 2. Registration (نئے مدرسے کی رجسٹریشن) */}
              <button
                type="button"
                onClick={() => {
                  setIsMenuOpen(false);
                  if (onOpenRegister) onOpenRegister();
                }}
                className="w-full p-3 rounded-xl hover:bg-blue-50 text-stone-800 hover:text-blue-900 transition-all text-start flex items-center gap-3 cursor-pointer group"
              >
                <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-800 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  <UserPlus className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="font-bold text-sm block">
                    {isEn ? 'Madrasa Registration' : 'مدرسہ رجسٹریشن (Registration)'}
                  </span>
                  <span className="text-[11px] text-stone-500 block truncate">
                    {isEn ? 'Online affiliation form for new madaris' : 'نئے ادارے کا آن لائن الحاق فارم'}
                  </span>
                </div>
              </button>

              {/* 3. About Us (ہمارے بارے میں - مستقل پیج) */}
              <button
                type="button"
                onClick={() => {
                  setIsMenuOpen(false);
                  if (onOpenAbout) {
                    onOpenAbout();
                  }
                }}
                className="w-full p-3 rounded-xl hover:bg-purple-50 text-stone-800 hover:text-purple-900 transition-all text-start flex items-center gap-3 cursor-pointer group"
              >
                <div className="w-8 h-8 rounded-lg bg-purple-100 text-purple-800 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  <Info className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="font-bold text-sm block">
                    {isEn ? 'About Us' : 'ہمارے بارے میں (About Us)'}
                  </span>
                  <span className="text-[11px] text-stone-500 block truncate">
                    {isEn ? 'Introduction, mission and vision' : 'تعارف، اغراض و مقاصد اور عزم'}
                  </span>
                </div>
              </button>

              {/* 4. Contact Us (رابطہ و ہیلپ لائن) */}
              <button
                type="button"
                onClick={() => {
                  setIsMenuOpen(false);
                  setIsContactModalOpen(true);
                }}
                className="w-full p-3 rounded-xl hover:bg-teal-50 text-stone-800 hover:text-teal-900 transition-all text-start flex items-center gap-3 cursor-pointer group"
              >
                <div className="w-8 h-8 rounded-lg bg-teal-100 text-teal-800 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  <PhoneCall className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="font-bold text-sm block">
                    {isEn ? 'Contact & Help' : 'رابطہ و ہیلپ لائن (Contact)'}
                  </span>
                  <span className="text-[11px] text-stone-500 block truncate">
                    {isEn ? 'Support and inquiries' : 'امتحانی شعبے اور سپورٹ سے رابطہ'}
                  </span>
                </div>
              </button>

              {/* 5. Legal & Privacy (قانونی و پرائیویسی) */}
              <button
                type="button"
                onClick={() => {
                  setIsMenuOpen(false);
                  if (onOpenLegal) {
                    onOpenLegal();
                  }
                }}
                className="w-full p-3 rounded-xl hover:bg-emerald-50 text-stone-800 hover:text-emerald-900 transition-all text-start flex items-center gap-3 cursor-pointer group"
              >
                <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="font-bold text-sm block">
                    {isEn ? 'Legal & Privacy' : 'قانونی و پرائیویسی (Legal & Privacy)'}
                  </span>
                  <span className="text-[11px] text-stone-500 block truncate">
                    {isEn ? 'Privacy policy, terms & disclaimer' : 'پرائیویسی پالیسی، شرائط و ڈس کلیمر'}
                  </span>
                </div>
              </button>

              {/* 6. Suggestion & Feedback (سجیشن و فیڈ بیک) */}
              <button
                type="button"
                onClick={() => {
                  setIsMenuOpen(false);
                  setIsFeedbackModalOpen(true);
                }}
                className="w-full p-3 rounded-xl hover:bg-teal-50 text-stone-800 hover:text-teal-900 transition-all text-start flex items-center gap-3 cursor-pointer group"
              >
                <div className="w-8 h-8 rounded-lg bg-teal-100 text-teal-800 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  <MessageSquareQuote className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="font-bold text-sm block">
                    {isEn ? 'Suggestion / Feedback' : 'سجیشن و فیڈ بیک (Feedback)'}
                  </span>
                  <span className="text-[11px] text-stone-500 block truncate">
                    {isEn ? 'Send feedback or suggestions' : 'معیارِ مدارس کو اپنی مفید تجویز یا فیڈ بیک بھیجیں'}
                  </span>
                </div>
              </button>

              {/* 5. Switch Language */}
              <button
                type="button"
                onClick={toggleLanguage}
                className="w-full p-3 rounded-xl hover:bg-amber-50 text-stone-800 hover:text-amber-900 transition-all text-start flex items-center gap-3 cursor-pointer group"
              >
                <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  <Globe className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="font-bold text-sm block">
                    {isEn ? 'Language (زبان)' : 'زبان تبدیل کریں (Language)'}
                  </span>
                  <span className="text-[11px] text-emerald-700 font-semibold block truncate">
                    {isEn ? 'Switch to اردو' : 'انگریزی (English) میں دیکھیں'}
                  </span>
                </div>
              </button>
            </div>

            {/* Drawer Footer: Strictly ONE Admin Button with Icon at the very bottom */}
            <div className="p-4 border-t border-stone-200 bg-stone-50/80 space-y-2">
              <button
                type="button"
                onClick={() => {
                  setIsMenuOpen(false);
                  onOpenAdmin();
                }}
                className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-800 via-emerald-900 to-teal-900 hover:from-emerald-700 hover:to-teal-800 text-white font-bold text-xs sm:text-sm shadow-md flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-[0.98]"
              >
                <Shield className="w-4 h-4 text-amber-300" />
                <span>
                  {authRole === 'result_admin'
                    ? (isEn ? 'Admin Dashboard' : 'ایڈمن ڈیش بورڈ')
                    : authRole === 'principal'
                    ? (isEn ? 'Principal Dashboard' : 'پرنسپل پورٹل')
                    : (isEn ? 'Admin Login' : 'ایڈمن لاگ ان (Admin)')}
                </span>
              </button>

              {authRole && onLogout && (
                <button
                  type="button"
                  onClick={() => {
                    setIsMenuOpen(false);
                    onLogout();
                  }}
                  className="w-full py-1.5 text-rose-600 hover:text-rose-700 text-xs font-bold flex items-center justify-center gap-1 cursor-pointer transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>{isEn ? 'Sign Out' : 'لاگ آؤٹ'}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Contact Us Modal */}
      {isContactModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs font-sans" dir={isEn ? 'ltr' : 'rtl'}>
          <div className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-7 shadow-2xl border border-stone-200 animate-fade-in space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-stone-100">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-teal-100 text-teal-800 flex items-center justify-center shadow-2xs">
                  <PhoneCall className="w-5 h-5" />
                </div>
                <div>
                  <h3 className={`text-lg sm:text-xl font-bold text-stone-900 leading-tight ${isEn ? 'font-sans' : 'font-aslam text-xl'}`}>
                    {isEn ? 'Contact & Helpline' : 'رابطہ و امتحانی ہیلپ لائن'}
                  </h3>
                  <span className="text-[11px] text-stone-500 font-urdu block">
                    {isEn ? 'Support and inquiries' : 'معیارِ مدارس امتحانی شعبہ'}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsContactModalOpen(false)}
                className="w-8 h-8 rounded-full bg-stone-100 hover:bg-stone-200 text-stone-600 flex items-center justify-center transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs sm:text-sm text-stone-700 font-urdu">
              <div className="p-3.5 rounded-2xl bg-stone-50 border border-stone-200/80 flex items-start gap-3">
                <Mail className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                <div>
                  <span className="text-[11px] text-stone-500 block font-sans">Official Email</span>
                  <strong className="text-stone-900 font-mono text-xs">info@meyarmadaris.com</strong>
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-stone-50 border border-stone-200/80 flex items-start gap-3">
                <PhoneCall className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                <div>
                  <span className="text-[11px] text-stone-500 block font-sans">Helpline / WhatsApp</span>
                  <strong className="text-stone-900 font-mono text-xs">+91 98765 43210</strong>
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-stone-50 border border-stone-200/80 flex items-start gap-3">
                <MapPin className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                <div>
                  <span className="text-[11px] text-stone-500 block font-sans">Office Address</span>
                  <span className="text-stone-800 text-xs">مرکزی امتحانی دفتر، بگوڈر، گرڈیھ، جھارکھنڈ، انڈیا</span>
                </div>
              </div>
            </div>

            <div className="pt-2 border-t border-stone-100">
              <button
                type="button"
                onClick={() => setIsContactModalOpen(false)}
                className="w-full py-2.5 px-4 bg-stone-900 hover:bg-stone-800 text-white rounded-xl text-xs sm:text-sm font-semibold transition-colors cursor-pointer"
              >
                {isEn ? 'Close' : 'بند کریں'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Suggestion / Feedback Modal */}
      <FeedbackModal
        isOpen={isFeedbackModalOpen}
        onClose={() => setIsFeedbackModalOpen(false)}
        isEn={isEn}
      />

      {/* Portal Launch Countdown & Celebration Modal */}
      {shouldShowCountdown && (
        <LaunchCountdownModal
          timer={launchTimer}
          onLaunchComplete={handleLaunchCompleted}
          onOpenLogin={onOpenAdmin}
        />
      )}
    </div>
  );
};
