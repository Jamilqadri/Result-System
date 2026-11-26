/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { PublicResultPortal } from './components/public/PublicResultPortal';
import { AdminDashboard } from './components/admin/AdminDashboard';
import { PrincipalPortal } from './components/admin/PrincipalPortal';
import { CreateMadrasaPage } from './components/admin/CreateMadrasaPage';
import { AboutUsPage } from './components/public/AboutUsPage';
import { LegalPrivacyPage } from './components/public/LegalPrivacyPage';
import { AdminLoginModal } from './components/admin/AdminLoginModal';
import { Madrasa, MadrasaClass, StateManager } from './types';
import { getStoredMadaris, getStoredClasses, syncWithServer, initFirestoreRealtimeSync } from './utils/storage';
import { updateDynamicManifest } from './utils/pwaManifest';
import { Building2, LogIn, ArrowRight, ShieldCheck, Search } from 'lucide-react';

export type AuthRole = 'result_admin' | 'principal' | 'state_manager' | null;

export type AppView = 'results' | 'principal' | 'admin' | 'register' | 'about' | 'legal';

interface ParsedRoute {
  view: AppView;
  adminModalTab: 'admin' | 'madrasa' | null;
  principalCode?: string;
}

function parseRouteFromLocation(): ParsedRoute {
  const hash = (window.location.hash || '').replace(/^#/, '').trim();
  const path = (window.location.pathname || '').replace(/^\/+|\/+$/g, '').trim();
  const searchParams = new URLSearchParams(window.location.search);
  const codeParam = searchParams.get('code') || searchParams.get('madrasa') || '';

  const pathParts = path.split('/').filter(Boolean);
  const hashParts = hash.split('/').filter(Boolean);
  const effectiveParts = hashParts.length > 0 ? hashParts : pathParts;
  const firstSegment = (effectiveParts[0] || '').toLowerCase();
  const secondSegment = (effectiveParts[1] || '').toUpperCase();

  // 1. Principal Route: /principal/:code or /principal?code=MM11 or #principal/:code or /login
  if (
    firstSegment === 'principal' ||
    path.startsWith('principal') ||
    hash.startsWith('principal') ||
    firstSegment === 'login' ||
    firstSegment === 'principal-login' ||
    firstSegment === 'madrasa'
  ) {
    const code = secondSegment || codeParam || localStorage.getItem('meyar_last_principal_code') || '';
    return {
      view: 'principal',
      adminModalTab: 'madrasa',
      principalCode: code ? code.toUpperCase() : undefined,
    };
  }

  // 2. Admin Route: /admin or #admin
  if (firstSegment === 'admin' || path === 'admin' || hash === 'admin') {
    return {
      view: 'admin',
      adminModalTab: 'admin',
    };
  }

  // 3. Register Madrasa Route
  if (['register-madrasa', 'register', 'registration'].includes(firstSegment)) {
    return {
      view: 'register',
      adminModalTab: null,
    };
  }

  // 4. About Us Route
  if (['about', 'about-us', 'aboutus'].includes(firstSegment) || hash === 'about' || hash === 'about-us') {
    return {
      view: 'about',
      adminModalTab: null,
    };
  }

  // 5. Legal & Privacy Route
  if (['legal', 'privacy', 'legal-privacy', 'privacy-policy', 'terms'].includes(firstSegment) || hash === 'legal' || hash === 'privacy' || hash === 'legal-privacy') {
    return {
      view: 'legal',
      adminModalTab: null,
    };
  }

  // Default: Results Portal (Main Public Search Page)
  return {
    view: 'results',
    adminModalTab: null,
  };
}

function navigateToPath(slug: string) {
  const cleanPath = slug ? `/${slug.replace(/^#/, '').replace(/^\/+/, '')}` : '/';
  try {
    if (window.location.pathname !== cleanPath || window.location.hash) {
      window.history.pushState(null, '', cleanPath);
    }
  } catch {
    try {
      window.location.pathname = cleanPath;
    } catch {}
  }
}

export default function App() {
  const [authRole, setAuthRole] = useState<AuthRole>(() => {
    const raw = sessionStorage.getItem('meyar_auth_role') || localStorage.getItem('meyar_auth_role');
    if (raw === 'result_admin' || raw === 'super_admin' || raw === 'manager_admin') {
      return 'result_admin';
    }
    if (raw === 'state_manager') {
      return 'state_manager';
    }
    if (raw === 'principal') {
      return 'principal';
    }
    return null;
  });

  const [stateManager, setStateManager] = useState<StateManager | null>(() => {
    try {
      const raw = sessionStorage.getItem('meyar_state_manager') || localStorage.getItem('meyar_state_manager');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });

  const [principalMadrasa, setPrincipalMadrasa] = useState<Madrasa | null>(() => {
    try {
      const raw = sessionStorage.getItem('meyar_principal_madrasa') || localStorage.getItem('meyar_principal_madrasa');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });

  const initialRoute = parseRouteFromLocation();

  // Current main view: defaults to 'results' (Public Result Portal)
  const [currentView, setCurrentView] = useState<AppView>(initialRoute.view);

  const [targetPrincipalCode, setTargetPrincipalCode] = useState<string>(
    initialRoute.principalCode || principalMadrasa?.code || ''
  );

  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [loginModalInitialTab, setLoginModalInitialTab] = useState<'admin' | 'madrasa'>(
    initialRoute.adminModalTab || 'admin'
  );
  const [prefilledMadrasaCode, setPrefilledMadrasaCode] = useState(
    initialRoute.principalCode || principalMadrasa?.code || ''
  );

  const [allClasses, setAllClasses] = useState<MadrasaClass[]>(() => getStoredClasses());
  const [allMadaris, setAllMadaris] = useState<Madrasa[]>(() => getStoredMadaris());


  const isPrivilegedSession =
    currentView === 'admin' ||
    currentView === 'principal' ||
    authRole === 'result_admin' ||
    authRole === 'state_manager' ||
    authRole === 'principal';

  // Listen to shared data updates across all views and perform zero-Firestore initial fetch on public pages
  useEffect(() => {
    if (!isPrivilegedSession) {
      syncWithServer(false, { skipFirestore: true }).then(({ madaris, classes }) => {
        setAllMadaris(madaris);
        setAllClasses(classes);
      });
    }

    const handleUpdate = (e: any) => {
      setTimeout(() => {
        try {
          if (Array.isArray(e.detail?.classes)) {
            setAllClasses(e.detail.classes);
          }
          if (Array.isArray(e.detail?.madaris)) {
            setAllMadaris(e.detail.madaris);
          }
        } catch (_) {}
      }, 0);
    };

    window.addEventListener('meyar_data_updated', handleUpdate);

    return () => {
      window.removeEventListener('meyar_data_updated', handleUpdate);
    };
  }, []);

  // Attach realtime Firestore listeners ONLY for Admin / Principal views & authenticated sessions
  useEffect(() => {
    if (!isPrivilegedSession) return;
    const cleanupRealtime = initFirestoreRealtimeSync();
    syncWithServer(false, { skipFirestore: false }).then(({ madaris, classes }) => {
      setAllMadaris(madaris);
      setAllClasses(classes);
    });
    return () => {
      cleanupRealtime();
    };
  }, [isPrivilegedSession]);

  // Sync Language & RTL/LTR
  useEffect(() => {
    const currentLang = (localStorage.getItem('meyar_lang') as string) || 'ur';
    document.documentElement.dir = currentLang === 'ur' ? 'rtl' : 'ltr';
    document.documentElement.lang = currentLang;

    const handleLangChange = (e: any) => {
      const newLang = e.detail?.lang || (localStorage.getItem('meyar_lang') as string) || 'ur';
      document.documentElement.dir = newLang === 'ur' ? 'rtl' : 'ltr';
      document.documentElement.lang = newLang;
    };

    window.addEventListener('meyar_lang_changed', handleLangChange);
    return () => window.removeEventListener('meyar_lang_changed', handleLangChange);
  }, []);

  // Sync Dynamic PWA Manifest
  useEffect(() => {
    if (currentView === 'principal') {
      const code = targetPrincipalCode || principalMadrasa?.code || '';
      const matched = allMadaris.find((m) => m.code.toUpperCase() === code.toUpperCase()) || principalMadrasa;
      const title = matched ? `معیارِ مدارس — پرنسپل پورٹل (${matched.urduName})` : 'معیارِ مدارس — پرنسپل پورٹل';
      const shortTitle = code ? `${code} پورٹل` : 'پرنسپل پورٹل';
      updateDynamicManifest({
        name: title,
        short_name: shortTitle,
        start_url: code ? `/principal/${code}` : '/principal',
      });
    } else if (currentView === 'admin') {
      updateDynamicManifest({
        name: 'معیارِ مدارس — ایڈمن پینل',
        short_name: 'ایڈمن پینل',
        start_url: '/admin',
      });
    } else if (currentView === 'about') {
      updateDynamicManifest({
        name: 'معیارِ مدارس — ہمارے بارے میں',
        short_name: 'ہمارے بارے میں',
        start_url: '/about',
      });
    } else {
      updateDynamicManifest({
        name: 'معیارِ مدارس — آن لائن رزلٹس',
        short_name: 'رزلٹ پورٹل',
        start_url: '/',
      });
    }
  }, [currentView, targetPrincipalCode, principalMadrasa, allMadaris]);

  // Sync URL routing & browser navigation (back/forward)
  useEffect(() => {
    const handleRouteChange = () => {
      const route = parseRouteFromLocation();

      if (route.view === 'principal') {
        setCurrentView('principal');
        const code = route.principalCode || principalMadrasa?.code || '';
        if (code) {
          setTargetPrincipalCode(code);
          setPrefilledMadrasaCode(code);
        }
        if (authRole !== 'principal' || (code && principalMadrasa?.code.toUpperCase() !== code.toUpperCase())) {
          setLoginModalInitialTab('madrasa');
          setIsLoginModalOpen(true);
        }
      } else if (route.view === 'admin') {
        setCurrentView('admin');
        if (authRole !== 'result_admin') {
          setLoginModalInitialTab('admin');
          setIsLoginModalOpen(true);
        }
      } else if (route.view === 'register') {
        setCurrentView('register');
      } else if (route.view === 'about') {
        setCurrentView('about');
      } else {
        setCurrentView('results');
      }
    };

    window.addEventListener('hashchange', handleRouteChange);
    window.addEventListener('popstate', handleRouteChange);

    return () => {
      window.removeEventListener('hashchange', handleRouteChange);
      window.removeEventListener('popstate', handleRouteChange);
    };
  }, [authRole, principalMadrasa]);

  const handleOpenResults = () => {
    setCurrentView('results');
    navigateToPath('');
  };

  const handleOpenAbout = () => {
    setCurrentView('about');
    navigateToPath('about');
  };

  const handleOpenLegal = () => {
    setCurrentView('legal');
    navigateToPath('legal');
  };

  const handleOpenRegister = () => {
    setCurrentView('register');
    navigateToPath('register');
  };

  const handleOpenPrincipal = (code?: string) => {
    const target = code || targetPrincipalCode || principalMadrasa?.code || '';
    if (target) {
      setTargetPrincipalCode(target);
      setPrefilledMadrasaCode(target);
    }
    setCurrentView('principal');
    navigateToPath(target ? `principal/${target}` : 'principal');

    if (authRole !== 'principal') {
      setLoginModalInitialTab('madrasa');
      setIsLoginModalOpen(true);
    }
  };

  const handleOpenAdmin = () => {
    setCurrentView('admin');
    navigateToPath('admin');

    if (authRole !== 'result_admin') {
      setLoginModalInitialTab('admin');
      setIsLoginModalOpen(true);
    }
  };

  const handleResultAdminSuccess = () => {
    sessionStorage.setItem('meyar_auth_role', 'result_admin');
    localStorage.setItem('meyar_auth_role', 'result_admin');
    sessionStorage.removeItem('meyar_principal_madrasa');
    localStorage.removeItem('meyar_principal_madrasa');
    setAuthRole('result_admin');
    setPrincipalMadrasa(null);
    setIsLoginModalOpen(false);
    setCurrentView('admin');
    navigateToPath('admin');
  };

  const handlePrincipalSuccess = (madrasa: Madrasa) => {
    sessionStorage.setItem('meyar_auth_role', 'principal');
    localStorage.setItem('meyar_auth_role', 'principal');
    sessionStorage.setItem('meyar_principal_madrasa', JSON.stringify(madrasa));
    localStorage.setItem('meyar_principal_madrasa', JSON.stringify(madrasa));
    localStorage.setItem('meyar_last_principal_code', madrasa.code);
    setAuthRole('principal');
    setPrincipalMadrasa(madrasa);
    setTargetPrincipalCode(madrasa.code);
    setIsLoginModalOpen(false);
    setCurrentView('principal');
    navigateToPath(`principal/${madrasa.code}`);
  };

  const handleStateManagerSuccess = (manager: StateManager) => {
    sessionStorage.setItem('meyar_auth_role', 'state_manager');
    localStorage.setItem('meyar_auth_role', 'state_manager');
    sessionStorage.setItem('meyar_state_manager', JSON.stringify(manager));
    localStorage.setItem('meyar_state_manager', JSON.stringify(manager));
    setAuthRole('state_manager');
    setStateManager(manager);
    setIsLoginModalOpen(false);
    setCurrentView('admin');
    navigateToPath('admin');
  };

  const handleLogout = () => {
    sessionStorage.removeItem('meyar_auth_role');
    localStorage.removeItem('meyar_auth_role');
    sessionStorage.removeItem('meyar_principal_madrasa');
    localStorage.removeItem('meyar_principal_madrasa');
    sessionStorage.removeItem('meyar_state_manager');
    localStorage.removeItem('meyar_state_manager');
    setAuthRole(null);
    setPrincipalMadrasa(null);
    setStateManager(null);
    setCurrentView('results');
    navigateToPath('');
  };

  // Resolve current active principal madrasa
  const currentPrincipalMadrasa = (() => {
    if (targetPrincipalCode) {
      const foundByCode = allMadaris.find((m) => m.code.toUpperCase() === targetPrincipalCode.toUpperCase());
      if (foundByCode) return foundByCode;
    }
    if (principalMadrasa) {
      return allMadaris.find((m) => m.id === principalMadrasa.id) || principalMadrasa;
    }
    return null;
  })();

  return (
    <div className="min-h-screen bg-stone-100 text-stone-900 font-sans selection:bg-emerald-100 selection:text-emerald-900">

      {/* 0. Legal & Privacy Page */}
      {currentView === 'legal' ? (
        <LegalPrivacyPage
          onBack={handleOpenResults}
          onOpenResults={handleOpenResults}
          onOpenRegister={handleOpenRegister}
          onOpenAdmin={handleOpenAdmin}
        />
      ) : currentView === 'about' ? (
        <AboutUsPage
          onBack={handleOpenResults}
          onOpenResults={handleOpenResults}
          onOpenRegister={handleOpenRegister}
          onOpenAdmin={handleOpenAdmin}
        />
      ) : currentView === 'register' ? (
        /* 1. Registration Page */
        <CreateMadrasaPage
          onBack={handleOpenResults}
          onSuccess={handleOpenResults}
          onGoToLogin={(code) => {
            handleOpenPrincipal(code);
          }}
        />
      ) : currentView === 'admin' && (authRole === 'result_admin' || authRole === 'state_manager') ? (
        /* 2. Admin Result Dashboard */
        <AdminDashboard
          onLogout={handleLogout}
          onViewPublic={handleOpenResults}
          currentManager={stateManager}
          isManagerView={authRole === 'state_manager'}
        />
      ) : currentView === 'admin' ? (
        /* Direct /admin entry while not logged in */
        <div className="min-h-screen bg-gradient-to-br from-emerald-950 via-stone-950 to-teal-950 text-white flex flex-col items-center justify-center p-4 font-urdu text-center select-none">
          <div className="bg-white/10 backdrop-blur-md border border-emerald-500/30 p-7 sm:p-8 rounded-3xl max-w-md w-full shadow-2xl space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-amber-400 text-emerald-950 flex items-center justify-center mx-auto shadow-md font-bold">
              <ShieldCheck className="w-8 h-8" />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-amber-300">
                معیارِ مدارس — مرکزی ایڈمن پینل
              </h2>
              <p className="text-xs text-stone-300 mt-1">
                مرکزی امتحانی کنٹرول و رجسٹریشن ڈیش بورڈ میں داخل ہونے کے لیے ایڈمن پن درج فرمائیں۔
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setLoginModalInitialTab('admin');
                setIsLoginModalOpen(true);
              }}
              className="w-full py-3 px-4 bg-amber-400 hover:bg-amber-300 text-emerald-950 font-bold rounded-2xl text-xs sm:text-sm shadow-md transition-colors cursor-pointer flex items-center justify-center gap-2"
            >
              <LogIn className="w-4 h-4" />
              <span>ایڈمن لاگ ان پن درج کریں (Sign In)</span>
            </button>
            <button
              type="button"
              onClick={handleOpenResults}
              className="text-stone-400 hover:text-stone-200 text-xs block mx-auto underline pt-2 cursor-pointer flex items-center justify-center gap-1.5"
            >
              <ArrowRight className="w-3.5 h-3.5" />
              <span>← واپس پبلک امتحانی نتائج (Results)</span>
            </button>
          </div>
        </div>
      ) : /* 3. Madrasa / Principal Portal */
      currentView === 'principal' && currentPrincipalMadrasa && authRole === 'principal' ? (
        <PrincipalPortal
          madrasa={currentPrincipalMadrasa}
          classes={allClasses}
          onLogout={handleLogout}
          onViewPublic={handleOpenResults}
          onBackToHome={handleOpenResults}
          onRefreshData={async () => {
            const { madaris, classes } = await syncWithServer();
            setAllMadaris(madaris);
            setAllClasses(classes);
          }}
        />
      ) : currentView === 'principal' ? (
        /* Principal Portal landing when entering via /principal/:code or not authenticated */
        <div className="min-h-screen bg-gradient-to-br from-emerald-950 via-stone-950 to-teal-950 text-white flex flex-col items-center justify-center p-4 font-urdu text-center select-none">
          <div className="bg-white/10 backdrop-blur-md border border-emerald-500/30 p-7 sm:p-8 rounded-3xl max-w-md w-full shadow-2xl space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-blue-700 text-white flex items-center justify-center mx-auto shadow-md">
              <Building2 className="w-8 h-8" />
            </div>
            <div>
              {targetPrincipalCode && (
                <div className="inline-block px-3 py-1 rounded-full bg-blue-500/20 text-blue-300 font-mono text-xs font-bold border border-blue-500/30 mb-2">
                  {targetPrincipalCode}
                </div>
              )}
              <h2 className="text-xl sm:text-2xl font-bold text-amber-300">
                {currentPrincipalMadrasa?.urduName || `مدرسہ پرنسپل پورٹل (${targetPrincipalCode || 'لاگ ان'})`}
              </h2>
              <p className="text-xs text-stone-300 mt-1 leading-relaxed">
                ادارے کے پرسنل ڈیش بورڈ، طلبہ کے داخلہ جات اور امتحانی نتائج کے لیے پاسورڈ درج فرما کر لاگ ان کریں۔
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setPrefilledMadrasaCode(targetPrincipalCode);
                setLoginModalInitialTab('madrasa');
                setIsLoginModalOpen(true);
              }}
              className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-2xl text-xs sm:text-sm shadow-md transition-colors cursor-pointer flex items-center justify-center gap-2"
            >
              <LogIn className="w-4 h-4 text-amber-300" />
              <span>پرنسپل لاگ ان کریں (Sign In)</span>
            </button>
            <button
              type="button"
              onClick={handleOpenResults}
              className="text-stone-400 hover:text-stone-200 text-xs block mx-auto underline pt-2 cursor-pointer flex items-center justify-center gap-1.5"
            >
              <ArrowRight className="w-3.5 h-3.5" />
              <span>← واپس پبلک امتحانی نتائج (Results)</span>
            </button>
          </div>
        </div>
      ) : (
        /* 4. Main Public Page: Public Result Portal with Search */
        <PublicResultPortal
          onOpenAdmin={handleOpenAdmin}
          onOpenPrincipal={handleOpenPrincipal}
          onOpenRegister={handleOpenRegister}
          onOpenAbout={handleOpenAbout}
          onOpenLegal={handleOpenLegal}
          authRole={authRole}
          currentPrincipalMadrasa={currentPrincipalMadrasa}
          onLogout={handleLogout}
          onBackToHome={handleOpenResults}
        />
      )}

      {/* Admin / Principal Authentication Modal */}
      <AdminLoginModal
        isOpen={isLoginModalOpen}
        initialTab={loginModalInitialTab}
        prefilledMadrasaCode={prefilledMadrasaCode || targetPrincipalCode}
        onClose={() => {
          setIsLoginModalOpen(false);
        }}
        onResultAdminSuccess={handleResultAdminSuccess}
        onStateManagerSuccess={handleStateManagerSuccess}
        onPrincipalSuccess={handlePrincipalSuccess}
      />
    </div>
  );
}
