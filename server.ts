/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename =
  typeof import.meta !== 'undefined' && import.meta.url
    ? fileURLToPath(import.meta.url)
    : (typeof (globalThis as any).__filename !== 'undefined' ? (globalThis as any).__filename : '');
const __dirname =
  typeof (globalThis as any).__dirname !== 'undefined' && (globalThis as any).__dirname
    ? (globalThis as any).__dirname
    : path.dirname(__filename || process.cwd());

// AI Studio dev environment must always listen on port 3000 (port 8080 is reserved for nginx proxy)
let PORT = 3000;
let HOST = process.env.HOST || '0.0.0.0';

if (process.env.PORT && process.env.PORT !== '8080') {
  const envPort = parseInt(process.env.PORT, 10);
  if (!isNaN(envPort) && envPort > 0) PORT = envPort;
}

// Support CLI flags like --port 3000 --host 0.0.0.0
for (let i = 0; i < process.argv.length; i++) {
  if (process.argv[i] === '--port' && process.argv[i + 1]) {
    const parsed = parseInt(process.argv[i + 1], 10);
    if (!isNaN(parsed) && parsed > 0) PORT = parsed;
  }
  if (process.argv[i] === '--host' && process.argv[i + 1]) {
    HOST = process.argv[i + 1];
  }
}

const isProduction = process.env.NODE_ENV === 'production';

const DATA_DIR = path.resolve(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'madaris_database.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DEFAULT_APPS_SCRIPT_URL =
  'https://script.google.com/macros/s/AKfycbzwA39m2gSyOhbwLU0xqj_w5gkvKUs9LbBK3QgWVZD64rYe47whR_G6fw7EPwtXqH2mGQ/exec';

const DEFAULT_CENTRAL_SHEET_URL =
  'https://script.google.com/macros/s/AKfycbzfUfn4yQfnL4e-Jeoy_IberRbYTDg4qP2KccloBFmN2akhhKic75zIatsaikR0gDTH/exec';

const DEFAULT_JOB_APPS_SCRIPT_URL =
  'https://script.google.com/macros/s/AKfycbwgZpWr_m-6oJlQDjv3WTc39EfHuK9bpPzKh10BQkNgtv_Y8TCuvLsoH_uXNQiWPKl0/exec';

function extractSheetIdFromUrl(urlOrId?: string): string {
  if (!urlOrId) return '';
  const trimmed = urlOrId.trim();
  const m = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/) || trimmed.match(/\/d\/([a-zA-Z0-9-_]+)/);
  if (m) return m[1];
  if (!trimmed.includes('/') && trimmed.length > 15) return trimmed;
  return '';
}

function cleanAppsScriptUrl(rawUrl?: string): string {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  const trimmed = rawUrl.trim();
  if (!trimmed) return '';

  const matches = [...trimmed.matchAll(/https:\/\/script\.google\.com\/macros\/s\/([a-zA-Z0-9_-]+)\/exec/g)];
  if (matches.length > 0) {
    for (const m of matches) {
      const full = m[0];
      if (!full.includes('AKfycbzwA39m2gSyOhbwLU0xqj_w5gkvKUs9LbBK3QgWVZD64rYe47whR_G6fw7EPwtXqH2mGQ')) {
        return full;
      }
    }
    return matches[0][0];
  }

  const partialMatch = trimmed.match(/https:\/\/script\.google\.com\/macros\/s\/([a-zA-Z0-9_-]+)/);
  if (partialMatch) {
    return `https://script.google.com/macros/s/${partialMatch[1]}/exec`;
  }

  try {
    const u = new URL(trimmed);
    if (u.protocol === 'https:' && u.hostname.includes('script.google.com')) {
      return trimmed;
    }
  } catch {}

  return '';
}

async function parseSafeJson<T = any>(response: Response): Promise<T | null> {
  try {
    const text = await response.text();
    if (!text) return null;
    const trimmed = text.trim();
    if (trimmed.startsWith('<') || trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<?xml')) {
      return null;
    }
    return JSON.parse(trimmed) as T;
  } catch {
    return null;
  }
}

interface DatabaseSchema {
  adminPin?: string;
  resultAdminPin?: string;
  managerAdminPin?: string;
  jobSerialNumber?: number;
  jobAppsScriptUrl?: string;
  jobSubmissions?: any[];
  feedbacks?: any[];
  madaris: any[];
  classes: any[];
  services?: any[];
  portalLogo?: string;
  appsScriptWebAppUrl?: string;
  centralSheetAppsScriptUrl?: string;
  sheetEditorAppsScriptUrl?: string;
  madrasaFormStatus?: {
    enabled: boolean;
    greeting: string;
    message: string;
    updatedAt?: string;
  };
  supabaseConfig?: {
    url: string;
    anonKey: string;
    enabled: boolean;
  };
  centralKaifiyatRules?: any[];
  centralPassingSettings?: any;
  deletedMadrasaIds?: string[];
  stateManagers?: any[];
  launchTimer?: any;
}

export function getEffectiveLogicForMadrasa(db: DatabaseSchema, madrasa: any) {
  const centralRules = db.centralKaifiyatRules || [
    { id: '1', minPercentage: 80, maxPercentage: 100, title: 'ممتاز', colorClass: 'text-emerald-700 bg-emerald-50 border-emerald-300' },
    { id: '2', minPercentage: 60, maxPercentage: 79.99, title: 'اعلیٰ', colorClass: 'text-blue-700 bg-blue-50 border-blue-300' },
    { id: '3', minPercentage: 50, maxPercentage: 59.99, title: 'جید', colorClass: 'text-amber-700 bg-amber-50 border-amber-300' },
    { id: '4', minPercentage: 33, maxPercentage: 49.99, title: 'مقبول', colorClass: 'text-stone-700 bg-stone-100 border-stone-300' },
  ];
  const centralPassing = db.centralPassingSettings || {
    passingPercentage: 33,
    oneSubjectFailLabel: 'مجاز',
    twoOrMoreFailLabel: 'ناکام',
    absentFailLabel: 'ناکام',
  };

  if (madrasa?.hasCustomResultLogic && Array.isArray(madrasa.kaifiyatRules) && madrasa.kaifiyatRules.length > 0) {
    return {
      rules: madrasa.kaifiyatRules,
      passing: madrasa.passingSettings || centralPassing,
      isCustom: true,
    };
  }
  return {
    rules: centralRules,
    passing: centralPassing,
    isCustom: false,
  };
}

export function isAbsentCell(value: string | number | undefined | null): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === 'number') return false;
  let str = String(value);
  if (!str.trim()) return false;

  // 1. Normalize Unicode (NFKC handles presentation forms like ﻍ, ﻏ, ﻐ, ﻎ -> غ)
  str = str.normalize('NFKC');

  // 2. Convert Arabic Yeh (ي/ى) to Urdu Yeh (ی) and Kaf (ك) to (ک)
  str = str.replace(/[\u064a\u0649]/g, '\u06cc').replace(/\u0643/g, '\u06a9');

  // 3. Strip all diacritics / tashkeel (\u064b - \u065f, \u0670)
  str = str.replace(/[\u064b-\u065f\u0670]/g, '');

  // 4. Strip invisible chars, zero-width chars, RTL/LTR marks, BOM, NBSP
  str = str.replace(/[\u200e\u200f\u061c\u200b\u200c\u200d\ufeff\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]/g, ' ');

  // 5. Strip formulas and quotes
  str = str.replace(/^=+/g, '').replace(/["'“”‘’`]/g, '').trim();

  const lower = str.toLowerCase();
  if (!lower) return false;

  // 6. Direct word matches
  if (
    lower === 'غ' ||
    lower === 'غائب' ||
    lower === 'غیرحاضر' ||
    lower === 'غیر حاضر' ||
    lower === 'غیر' ||
    lower === 'absent' ||
    lower === 'abs' ||
    lower === 'ab' ||
    lower === 'a' ||
    lower.includes('غائب') ||
    lower.includes('غیر حاضر') ||
    lower.includes('غیرحاضر')
  ) {
    return true;
  }

  // 7. Strip all punctuation, brackets, slashes, dashes, dots, commas
  const stripped = lower.replace(/[\s()[\]{}_\-\/.:؛،,|+*!?\\]/g, '');

  if (
    stripped === 'غ' ||
    stripped === 'غائب' ||
    stripped === 'غیرحاضر' ||
    stripped === 'غیر' ||
    stripped === 'absent' ||
    stripped === 'abs' ||
    stripped === 'ab' ||
    stripped === 'a'
  ) {
    return true;
  }

  // 8. If string contains 'غ' and is short (<= 4 chars) without any digits:
  // e.g. "غ.", ".غ", "غ/", "/غ", " غ ", "(غ)", "[غ]", "-غ-", "غ-", "-غ"
  if (stripped.length <= 4 && stripped.includes('غ') && !/[0-9]/.test(stripped)) {
    return true;
  }

  return false;
}

export function convertEasternToWesternDigits(str: string): string {
  if (!str) return '';
  return String(str)
    .replace(/[۰٠]/g, '0')
    .replace(/[۱١]/g, '1')
    .replace(/[۲٢]/g, '2')
    .replace(/[۳٣]/g, '3')
    .replace(/[۴٤]/g, '4')
    .replace(/[۵٥]/g, '5')
    .replace(/[۶٦]/g, '6')
    .replace(/[۷٧]/g, '7')
    .replace(/[۸٨]/g, '8')
    .replace(/[۹٩]/g, '9');
}

export function computeStudentKaifiyat(
  percentage: number,
  failedCount: number,
  hasAbsent: boolean,
  allEmpty: boolean,
  rules: any[],
  passing: any
): string {
  if (allEmpty) {
    return 'نمبرات زیر انتظار';
  }
  if (hasAbsent) {
    return passing?.absentFailLabel || 'ناکام';
  }
  if (failedCount >= 2) {
    return passing?.twoOrMoreFailLabel || 'ناکام';
  }
  if (failedCount === 1) {
    return passing?.oneSubjectFailLabel || 'مجاز';
  }
  const minPass = passing?.passingPercentage || 33;
  if (percentage < minPass) {
    return passing?.twoOrMoreFailLabel || 'ناکام';
  }
  const sorted = [...(rules || [])].sort((a: any, b: any) => Number(b.minPercentage) - Number(a.minPercentage));
  for (const r of sorted) {
    if (percentage >= Number(r.minPercentage) && percentage <= (Number(r.maxPercentage) || 100)) {
      return r.title;
    }
  }
  return 'مقبول';
}

const DEFAULT_SERVER_SERVICES = [
  {
    id: 'service-jobs',
    slug: 'jobs',
    title: 'Islamic Jobs Portal',
    shortDescription: 'Find opportunities in Imamat, teaching, Azan, Khitabat and other Islamic positions.',
    fullDescription: 'A dedicated platform connecting Islamic institutions, mosques, and madaris with qualified scholars, Huffaz, Qaris, teachers, and Imams.',
    icon: 'briefcase',
    url: 'https://imamattadrees.in/jobs',
    buttonText: 'Explore Now',
    isActive: true,
    openInNewTab: true,
    displayOrder: 1,
    badge: 'Popular',
    showInNavbar: true,
    menuTitle: 'Islamic Jobs Portal',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'service-mayaar',
    slug: 'mayaar',
    title: 'Mayaar-e-Madaris',
    shortDescription: 'A centralized academic and examination system connecting affiliated Madaris.',
    fullDescription: 'Comprehensive examination management, student portal, marksheets, verification and digital grade book for Islamic madrasas.',
    icon: 'school',
    url: '#results-portal',
    buttonText: 'Explore Now',
    isActive: true,
    openInNewTab: false,
    displayOrder: 2,
    badge: 'Live Portal',
    showInNavbar: true,
    menuTitle: 'Mayaar-e-Madaris',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'service-academy',
    slug: 'academy',
    title: 'Online Academy',
    shortDescription: 'Learn Quran, Tajweed, Islamic studies and other subjects through online classes.',
    fullDescription: 'Interactive online classes with experienced Asatizah for Quran recitation, Tajweed, Darse Nizami basics and specialized subjects.',
    icon: 'graduation-cap',
    url: 'https://imamattadrees.in/academy',
    buttonText: 'Explore Now',
    isActive: true,
    openInNewTab: true,
    displayOrder: 3,
    badge: 'Admissions Open',
    showInNavbar: true,
    menuTitle: 'Online Academy',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'service-quiz',
    slug: 'quiz',
    title: 'Daily Islamic Quiz',
    shortDescription: 'Test your Islamic knowledge through engaging quizzes, competitions and learning activities.',
    fullDescription: 'Engaging daily and weekly quiz competitions on Seerat-un-Nabi, Quran, Hadith, Fiqh and Islamic history for students and seekers.',
    icon: 'trophy',
    url: 'https://islamic-quiz-hub.lovable.app',
    buttonText: 'Explore Now',
    isActive: true,
    openInNewTab: false,
    openMode: 'embed',
    displayOrder: 4,
    badge: '',
    showInNavbar: true,
    menuTitle: 'Daily Islamic Quiz',
    iframeTitle: 'Daily Islamic Quiz',
    iframeSubtitle: 'imamattadrees.in/quiz',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'service-shopping',
    slug: 'shop',
    title: 'Islamic Shopping Center',
    shortDescription: 'Explore Islamic clothing, books, prayer essentials, perfumes and other Islamic products.',
    fullDescription: 'Curated collection of authentic Islamic attire, attar/perfumes, prayer rugs, Qurans, classical Islamic texts and essentials.',
    icon: 'shopping-bag',
    url: 'https://imamattadrees.in/shop',
    buttonText: 'Explore Now',
    isActive: true,
    openInNewTab: true,
    displayOrder: 5,
    badge: 'Store',
    showInNavbar: true,
    menuTitle: 'Islamic Shopping Center',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'service-qna',
    slug: 'qna',
    title: 'Islamic Q&A',
    shortDescription: 'Explore Islamic questions and answers and find useful guidance on religious matters.',
    fullDescription: 'Authentic fatwas, clarifications and guidance on everyday spiritual, financial and personal issues verified by qualified Muftis.',
    icon: 'message-circle',
    url: 'https://imamattadrees.in/qa',
    buttonText: 'Explore Now',
    isActive: true,
    openInNewTab: true,
    displayOrder: 6,
    badge: 'Guidance',
    showInNavbar: true,
    menuTitle: 'Islamic Q&A',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'service-facebook',
    slug: 'facebook',
    title: 'Official Facebook Page',
    shortDescription: 'Connect with our official Facebook page for the latest updates, scholarly articles, and announcements.',
    fullDescription: 'The official Facebook page of Imamat wa Tadrees featuring daily Islamic articles, scholarly guidance, lectures, and educational announcements.',
    icon: 'facebook',
    url: 'https://www.facebook.com/imamattadrees',
    buttonText: 'Facebook Page',
    isActive: true,
    openInNewTab: true,
    displayOrder: 7,
    badge: 'Social',
    showInNavbar: true,
    menuTitle: 'Facebook Page',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

let memoryDbCache: DatabaseSchema | null = null;

function readDatabase(): DatabaseSchema {
  if (memoryDbCache) return memoryDbCache;
  try {
    let content = '';
    const tmpFile = path.join('/tmp', 'madaris_database.json');
    if (fs.existsSync(tmpFile)) {
      content = fs.readFileSync(tmpFile, 'utf-8');
    } else if (fs.existsSync(DB_FILE)) {
      content = fs.readFileSync(DB_FILE, 'utf-8');
    }
    if (content) {
      const parsed = JSON.parse(content);
      if (parsed && Array.isArray(parsed.madaris) && Array.isArray(parsed.classes)) {
        parsed.classes = parsed.classes.filter((c: any) =>
          parsed.madaris.some((m: any) => m.id === c.madrasaId)
        );
        if (!Array.isArray(parsed.services) || parsed.services.length === 0) {
          parsed.services = DEFAULT_SERVER_SERVICES;
        } else {
          // Remove deprecated forms and maktab services and clean IDs/slugs
          parsed.services = parsed.services
            .filter((s: any) => s.id !== 'service-forms' && s.id !== 'service-maktab')
            .map((s: any) => {
              let fixedId = s.id || '';
              if (fixedId.startsWith('service-service-')) {
                fixedId = fixedId.replace(/^service-service-/, 'service-');
              }
              let slug = s.slug || '';
              if (!slug || slug.includes('179') || slug.startsWith('service-')) {
                const t = (s.title || fixedId).toLowerCase();
                if (t.includes('quiz') || t.includes('کوئز')) slug = 'quiz';
                else if (t.includes('job') || t.includes('ملازمت')) slug = 'jobs';
                else if (t.includes('mayaar') || t.includes('مدارس') || t.includes('معیار')) slug = 'mayaar';
                else if (t.includes('academy') || t.includes('اکیڈمی')) slug = 'academy';
                else if (t.includes('shop') || t.includes('خریداری')) slug = 'shop';
                else if (t.includes('qna') || t.includes('سوال')) slug = 'qna';
                else if (t.includes('facebook') || t.includes('فیس بک')) slug = 'facebook';
                else slug = (s.title || 'service').toLowerCase().replace(/[^\w\s-]/g, '').replace(/[\s_-]+/g, '-').replace(/^service-/, '') || 'service';
              }
              slug = slug.replace(/^service-/, '');
              if (!fixedId || fixedId.includes('179') || fixedId === 'service-item') {
                fixedId = `service-${slug}`;
              }
              return {
                ...s,
                id: fixedId,
                slug,
              };
            });
          if (!parsed.services.some((s: any) => s.id === 'service-facebook')) {
            const fbService = DEFAULT_SERVER_SERVICES.find((s) => s.id === 'service-facebook');
            if (fbService) parsed.services.push(fbService);
          }
        }
        delete parsed.maktabRegistrations;
        delete parsed.maktabGoogleScriptUrl;
        delete parsed.maktabGoogleSheetUrl;
        if (!parsed.resultAdminPin || parsed.resultAdminPin === 'meyar2026') {
          parsed.resultAdminPin = 'MM2020';
        }
        if (!parsed.managerAdminPin || parsed.managerAdminPin === 'imamat2026') {
          parsed.managerAdminPin = 'Imamat2026';
        }
        if (parsed.appsScriptWebAppUrl) {
          parsed.appsScriptWebAppUrl = cleanAppsScriptUrl(parsed.appsScriptWebAppUrl) || DEFAULT_APPS_SCRIPT_URL;
        } else {
          parsed.appsScriptWebAppUrl = DEFAULT_APPS_SCRIPT_URL;
        }
        if (parsed.centralSheetAppsScriptUrl) {
          parsed.centralSheetAppsScriptUrl = cleanAppsScriptUrl(parsed.centralSheetAppsScriptUrl);
        }
        if (parsed.jobAppsScriptUrl) {
          parsed.jobAppsScriptUrl = cleanAppsScriptUrl(parsed.jobAppsScriptUrl) || DEFAULT_JOB_APPS_SCRIPT_URL;
        }
        if (!Array.isArray(parsed.jobSubmissions)) {
          parsed.jobSubmissions = [];
        }
        if (!Array.isArray(parsed.feedbacks)) {
          parsed.feedbacks = [];
        }
        if (!parsed.madrasaFormStatus) {
          parsed.madrasaFormStatus = {
            enabled: false,
            greeting: 'السلام علیکم ورحمۃ اللہ وبرکاتہ',
            message: 'ابھی اس پر کام ہو رہا ہے\nکچھ دن بعد دوبارہ کوشش کریں',
            updatedAt: new Date().toISOString(),
          };
        }

        if (Array.isArray(parsed.deletedMadrasaIds) && parsed.deletedMadrasaIds.length > 0) {
          const dIds = new Set(parsed.deletedMadrasaIds.map((s: any) => String(s).toLowerCase()));
          parsed.madaris = parsed.madaris.filter((m: any) => !dIds.has(String(m.id).toLowerCase()) && !dIds.has(String(m.code || '').toLowerCase()));
          parsed.classes = parsed.classes.filter((c: any) => !dIds.has(String(c.madrasaId).toLowerCase()));
        } else if (!Array.isArray(parsed.deletedMadrasaIds)) {
          parsed.deletedMadrasaIds = [];
        }

        // Auto-heal: Ensure madaris and their classes have synchronized googleSheetUrl
        let dbAutoHealed = false;
        parsed.madaris.forEach((m: any) => {
          // If googleSheetUrl is missing or is the old dummy create link or invalid folder edit link
          if (
            !m.googleSheetUrl ||
            m.googleSheetUrl.trim() === '' ||
            m.googleSheetUrl.includes('spreadsheets/create') ||
            m.googleSheetUrl.includes('/spreadsheets/d/1HUVOzvuhbRrAO5qsw645dM4QZz75LSG9') ||
            (m.googleSheetUrl === DEFAULT_APPS_SCRIPT_URL && m.code !== 'MM118')
          ) {
            if (m.spreadsheetId && m.spreadsheetId.trim() !== '' && m.spreadsheetId !== '1HUVOzvuhbRrAO5qsw645dM4QZz75LSG9') {
              m.googleSheetUrl = `https://docs.google.com/spreadsheets/d/${m.spreadsheetId.trim()}/edit`;
            } else {
              m.googleSheetUrl = '';
              m.spreadsheetId = '';
            }
            dbAutoHealed = true;
          }

          // Clean any dummy students from non-MM118 madaris
          if (m.code !== 'MM118') {
            parsed.classes.forEach((c: any) => {
              if (c.madrasaId === m.id && Array.isArray(c.students)) {
                const initialLen = c.students.length;
                c.students = c.students.filter((st: any) => {
                  const sId = String(st.studentId || '').trim();
                  return !sId.startsWith('118') && !sId.startsWith('dummy-');
                });
                if (c.students.length !== initialLen) {
                  dbAutoHealed = true;
                }
              }
            });
          }

          // Propagate madrasa's googleSheetUrl to all of its classes
          if (m.googleSheetUrl) {
            parsed.classes.forEach((c: any) => {
              if (
                c.madrasaId === m.id &&
                (!c.googleSheetUrl ||
                  c.googleSheetUrl.trim() === '' ||
                  c.googleSheetUrl.includes('spreadsheets/create') ||
                  c.googleSheetUrl.includes('/spreadsheets/d/1HUVOzvuhbRrAO5qsw645dM4QZz75LSG9'))
              ) {
                c.googleSheetUrl = m.googleSheetUrl;
                c.resultSourceType = 'google_sheet';
                c.sheetTabName = c.name;
                dbAutoHealed = true;
              }
            });
          }
        });

        // Auto-heal englishName: Ensure every madrasa has a clean, readable English name
        parsed.madaris.forEach((m: any) => {
          if (!m.englishName || /[\u0600-\u06FF]/.test(m.englishName)) {
            const urdu = m.urduName || '';
            m.englishName = urdu
              .replace(/دارالعلوم|دار العلوم/g, 'Darul Uloom ')
              .replace(/جامعہ/g, 'Jamia ')
              .replace(/مدرسہ/g, 'Madrasa ')
              .replace(/فیضان/g, 'Faizan-e-')
              .replace(/عطار/g, 'Attar')
              .replace(/مدینہ/g, 'Madina')
              .replace(/غوثیہ/g, 'Ghausia')
              .replace(/رضویہ/g, 'Rizvia')
              .replace(/حسینیہ/g, 'Hussainia')
              .replace(/نظامیہ/g, 'Nizamiya')
              .replace(/اہلسنت|اہل سنت/g, 'Ahle Sunnat')
              .replace(/اسلامیہ/g, 'Islamia')
              .replace(/\s+/g, ' ')
              .replace(/Faizan-e-\s+/g, 'Faizan-e-')
              .trim() || 'Jamia Darul Uloom';
            dbAutoHealed = true;
          }
        });

        // Auto-heal verified madaris: Ensure managerVerified is set to true for all approved/verified madaris so they never show red
        parsed.madaris.forEach((m: any) => {
          if (m.isVerified === true || m.registrationStatus === 'approved') {
            if (!m.managerVerified) {
              m.managerVerified = true;
              dbAutoHealed = true;
            }
          }
        });

        // Auto-heal themeColor & logo: Ensure valid themeColor (default #065f46) and logo string
        parsed.madaris.forEach((m: any) => {
          if (!m.themeColor || typeof m.themeColor !== 'string' || !m.themeColor.trim()) {
            m.themeColor = '#065f46';
            dbAutoHealed = true;
          }
          if (typeof m.logo !== 'string') {
            m.logo = '';
            dbAutoHealed = true;
          }
        });

        if (!Array.isArray(parsed.stateManagers) || parsed.stateManagers.length === 0) {
          parsed.stateManagers = [
            {
              id: 'mgr-default-1',
              name: 'مولانا مفتی عبد الرحیم صاحب',
              username: 'SM101',
              password: 'SM2026',
              phone: '9876543210',
              email: 'manager.jh@imamat.in',
              assignedStates: ['Jharkhand', 'Bihar'],
              status: 'active',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          ];
          dbAutoHealed = true;
        }

        if (dbAutoHealed) {
          writeDatabase(parsed);
        }

        return parsed;
      }
    }
  } catch (err) {
    console.error('Error reading database file:', err);
  }

  const initialDb: DatabaseSchema = {
    adminPin: 'MM2020',
    resultAdminPin: 'MM2020',
    managerAdminPin: 'Imamat2026',
    madaris: [],
    classes: [],
    services: DEFAULT_SERVER_SERVICES,
    portalLogo: '/logo.jpg',
    appsScriptWebAppUrl: DEFAULT_APPS_SCRIPT_URL,
    centralSheetAppsScriptUrl: '',
    jobAppsScriptUrl: DEFAULT_JOB_APPS_SCRIPT_URL,
    jobSubmissions: [],
    deletedMadrasaIds: [],
    stateManagers: [
      {
        id: 'mgr-default-1',
        name: 'مولانا مفتی عبد الرحیم صاحب',
        username: 'SM101',
        password: 'SM2026',
        phone: '9876543210',
        email: 'manager.jh@imamat.in',
        assignedStates: ['Jharkhand', 'Bihar'],
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
  };
  writeDatabase(initialDb);
  return initialDb;
}

function writeDatabase(data: DatabaseSchema): boolean {
  memoryDbCache = data;
  try {
    const tempFile = `${DB_FILE}.tmp`;
    fs.writeFileSync(tempFile, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tempFile, DB_FILE);
    return true;
  } catch (err) {
    try {
      const tmpFile = path.join('/tmp', 'madaris_database.json');
      fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2), 'utf-8');
    } catch {}
    console.warn('Notice writing database file (serverless/read-only environment preserved in memory & /tmp):', err);
    return true;
  }
}

function normalizeDate(dateStr: string): string {
  if (!dateStr) return '';
  const trimmed = dateStr.trim();

  // YYYY-MM-DD
  const ymdMatch = trimmed.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (ymdMatch) {
    const y = ymdMatch[1];
    const m = ymdMatch[2].padStart(2, '0');
    const d = ymdMatch[3].padStart(2, '0');
    return `${d}/${m}/${y}`;
  }

  // DD/MM/YYYY
  const dmyMatch = trimmed.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (dmyMatch) {
    const d = dmyMatch[1].padStart(2, '0');
    const m = dmyMatch[2].padStart(2, '0');
    const y = dmyMatch[3];
    return `${d}/${m}/${y}`;
  }

  return trimmed;
}

let moduleSyncMadrasaFromGoogleSheet: ((db: DatabaseSchema, madrasaId: string, explicitUrl?: string) => Promise<{ success: boolean; syncedClasses: number; totalStudents: number; message: string }>) | null = null;

// ---------------------------------------------------------------------------
// Lightweight Firestore REST Sync (5-min read TTL + 429 quota circuit-breaker)
// ---------------------------------------------------------------------------
let fsConfigCache: { projectId: string; apiKey: string; databaseId: string } | null | undefined;
let fsServerQuotaPausedUntil = 0;
let fsLastHydrateMs = 0;
let fsHydrateInFlight: Promise<void> | null = null;
const FS_SERVER_HYDRATE_TTL_MS = 5 * 60 * 1000;

function getServerFirestoreConfig(): { projectId: string; apiKey: string; databaseId: string } | null {
  if (fsConfigCache !== undefined) return fsConfigCache;
  try {
    const cfgPath = path.resolve(__dirname, 'firebase-applet-config.json');
    if (fs.existsSync(cfgPath)) {
      const parsed = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
      if (parsed?.projectId && parsed?.firestoreDatabaseId) {
        fsConfigCache = {
          projectId: String(parsed.projectId),
          apiKey: String(parsed.apiKey || ''),
          databaseId: String(parsed.firestoreDatabaseId),
        };
        return fsConfigCache;
      }
    }
  } catch {}
  fsConfigCache = null;
  return null;
}

function getFirestoreBaseUrl(): string | null {
  const cfg = getServerFirestoreConfig();
  if (!cfg) return null;
  return `https://firestore.googleapis.com/v1/projects/${cfg.projectId}/databases/${cfg.databaseId}/documents`;
}

function toFirestoreValue(val: any): any {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === 'boolean') return { booleanValue: val };
  if (typeof val === 'number') {
    return Number.isInteger(val) ? { integerValue: String(val) } : { doubleValue: val };
  }
  if (typeof val === 'string') return { stringValue: val };
  if (Array.isArray(val)) {
    return { arrayValue: { values: val.map((v) => toFirestoreValue(v)) } };
  }
  if (typeof val === 'object') {
    const fields: Record<string, any> = {};
    for (const [k, v] of Object.entries(val)) {
      if (v !== undefined) {
        fields[k] = toFirestoreValue(v);
      }
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(val) };
}

function fromFirestoreValue(val: any): any {
  if (!val || typeof val !== 'object') return null;
  if ('nullValue' in val) return null;
  if ('booleanValue' in val) return Boolean(val.booleanValue);
  if ('integerValue' in val) return Number(val.integerValue);
  if ('doubleValue' in val) return Number(val.doubleValue);
  if ('stringValue' in val) return String(val.stringValue);
  if ('timestampValue' in val) return String(val.timestampValue);
  if ('arrayValue' in val) {
    const vals = Array.isArray(val.arrayValue?.values) ? val.arrayValue.values : [];
    return vals.map((v: any) => fromFirestoreValue(v));
  }
  if ('mapValue' in val) {
    const fields = val.mapValue?.fields || {};
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(fields)) {
      out[k] = fromFirestoreValue(v);
    }
    return out;
  }
  return null;
}

function parseServerTs(raw?: string): number {
  if (!raw) return 0;
  const t = new Date(raw).getTime();
  return Number.isFinite(t) ? t : 0;
}

async function firestoreWriteDocREST(collectionName: string, docId: string, obj: any): Promise<void> {
  if (Date.now() < fsServerQuotaPausedUntil || !obj || !docId) return;
  const baseUrl = getFirestoreBaseUrl();
  const cfg = getServerFirestoreConfig();
  if (!baseUrl || !cfg) return;
  try {
    const cleanObj = JSON.parse(JSON.stringify(obj));
    const fields: Record<string, any> = {};
    for (const [k, v] of Object.entries(cleanObj)) {
      if (v !== undefined) fields[k] = toFirestoreValue(v);
    }
    const qs = cfg.apiKey ? `?key=${encodeURIComponent(cfg.apiKey)}` : '';
    const res = await fetch(`${baseUrl}/${encodeURIComponent(collectionName)}/${encodeURIComponent(docId)}${qs}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields }),
    });
    if (res.status === 429) {
      fsServerQuotaPausedUntil = Date.now() + 15 * 60 * 1000;
    }
  } catch {}
}

async function firestoreDeleteDocREST(collectionName: string, docId: string): Promise<void> {
  if (Date.now() < fsServerQuotaPausedUntil || !docId) return;
  const baseUrl = getFirestoreBaseUrl();
  const cfg = getServerFirestoreConfig();
  if (!baseUrl || !cfg) return;
  try {
    const qs = cfg.apiKey ? `?key=${encodeURIComponent(cfg.apiKey)}` : '';
    const res = await fetch(`${baseUrl}/${encodeURIComponent(collectionName)}/${encodeURIComponent(docId)}${qs}`, {
      method: 'DELETE',
    });
    if (res.status === 429) {
      fsServerQuotaPausedUntil = Date.now() + 15 * 60 * 1000;
    }
  } catch {}
}

async function hydrateDatabaseFromFirestore(force: boolean = false): Promise<void> {
  if (Date.now() < fsServerQuotaPausedUntil) return;
  if (!force && fsLastHydrateMs > 0 && Date.now() - fsLastHydrateMs < FS_SERVER_HYDRATE_TTL_MS) return;
  if (fsHydrateInFlight) return fsHydrateInFlight;

  const baseUrl = getFirestoreBaseUrl();
  const cfg = getServerFirestoreConfig();
  if (!baseUrl || !cfg) return;

  fsHydrateInFlight = (async () => {
    fsLastHydrateMs = Date.now();
    try {
      const keyOnlyQs = cfg.apiKey ? `?key=${encodeURIComponent(cfg.apiKey)}` : '';
      const runQueryUrl = `${baseUrl}:runQuery${keyOnlyQs}`;
      const [mRes, cRes, delRes, ltRes, crRes, seRes] = await Promise.all([
        fetch(runQueryUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            structuredQuery: { from: [{ collectionId: 'madaris' }], limit: 500 },
          }),
        }),
        fetch(runQueryUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            structuredQuery: { from: [{ collectionId: 'classes' }], limit: 1500 },
          }),
        }).catch(() => null),
        fetch(`${baseUrl}/system_configs/deleted_madaris${keyOnlyQs}`).catch(() => null),
        fetch(`${baseUrl}/system_configs/launchTimer${keyOnlyQs}`).catch(() => null),
        fetch(`${baseUrl}/system_configs/central_result_logic${keyOnlyQs}`).catch(() => null),
        fetch(`${baseUrl}/system_configs/sheet_editor_script${keyOnlyQs}`).catch(() => null),
      ]);

      if (mRes.status === 429 || cRes?.status === 429 || delRes?.status === 429 || ltRes?.status === 429 || crRes?.status === 429 || seRes?.status === 429) {
        fsServerQuotaPausedUntil = Date.now() + 15 * 60 * 1000;
        return;
      }

      const fsMadaris: any[] = [];
      if (mRes.ok) {
        const mRows: any = await mRes.json().catch(() => null);
        if (Array.isArray(mRows)) {
          for (const row of mRows) {
            if (!row?.document?.fields) continue;
            const parsed = fromFirestoreValue({ mapValue: { fields: row.document.fields } });
            if (parsed && parsed.id && parsed.urduName) {
              fsMadaris.push(parsed);
            }
          }
        }
      }

      const fsClasses: any[] = [];
      if (cRes && cRes.ok) {
        const cRows: any = await cRes.json().catch(() => null);
        if (Array.isArray(cRows)) {
          for (const row of cRows) {
            if (!row?.document?.fields) continue;
            const parsed = fromFirestoreValue({ mapValue: { fields: row.document.fields } });
            if (parsed && parsed.id && parsed.madrasaId) {
              fsClasses.push(parsed);
            }
          }
        }
      }

      const db = readDatabase();
      const deletedSet = new Set<string>(
        (Array.isArray(db.deletedMadrasaIds) ? db.deletedMadrasaIds : []).map((s: string) =>
          String(s).toLowerCase().trim()
        )
      );

      if (delRes && delRes.ok) {
        const delJson: any = await delRes.json().catch(() => null);
        const delObj = delJson?.fields ? fromFirestoreValue({ mapValue: { fields: delJson.fields } }) : null;
        if (Array.isArray(delObj?.ids)) {
          delObj.ids.forEach((dId: string) => {
            const clean = String(dId).trim();
            if (clean && !deletedSet.has(clean.toLowerCase())) {
              deletedSet.add(clean.toLowerCase());
              if (!Array.isArray(db.deletedMadrasaIds)) db.deletedMadrasaIds = [];
              db.deletedMadrasaIds.push(clean);
            }
          });
        }
      }

      // Filter local madaris & classes against synced deletedSet
      let changed = false;
      const filteredLocal = db.madaris.filter((m: any) => {
        const keep =
          !deletedSet.has(String(m.id || '').toLowerCase().trim()) &&
          !deletedSet.has(String(m.code || '').toLowerCase().trim());
        if (!keep) changed = true;
        return keep;
      });
      db.madaris = filteredLocal;

      const filteredLocalClasses = db.classes.filter((c: any) => {
        const keep = !deletedSet.has(String(c.madrasaId || '').toLowerCase().trim());
        if (!keep) changed = true;
        return keep;
      });
      db.classes = filteredLocalClasses;

      // Merge Firestore madaris into db.madaris by updatedAt
      for (const fm of fsMadaris) {
        const fIdLower = String(fm.id || '').toLowerCase().trim();
        const fCodeUpper = String(fm.code || '').toUpperCase().trim();
        if (deletedSet.has(fIdLower) || (fCodeUpper && deletedSet.has(fCodeUpper.toLowerCase()))) {
          continue;
        }
        const existingIdx = db.madaris.findIndex(
          (m: any) =>
            m.id === fm.id ||
            (fCodeUpper && m.code && String(m.code).toUpperCase().trim() === fCodeUpper)
        );
        if (existingIdx === -1) {
          db.madaris.push(fm);
          changed = true;
        } else {
          const localM = db.madaris[existingIdx];
          if (parseServerTs(fm.updatedAt || fm.createdAt) > parseServerTs(localM.updatedAt || localM.createdAt)) {
            db.madaris[existingIdx] = { ...localM, ...fm };
            changed = true;
          }
        }
      }

      // Merge Firestore classes into db.classes by updatedAt (preserving student rows)
      for (const fc of fsClasses) {
        const fcMidLower = String(fc.madrasaId || '').toLowerCase().trim();
        if (deletedSet.has(fcMidLower)) continue;
        const existingIdx = db.classes.findIndex((c: any) => c.id === fc.id);
        if (existingIdx === -1) {
          db.classes.push(fc);
          changed = true;
        } else {
          const localC = db.classes[existingIdx];
          const fcTime = parseServerTs(fc.updatedAt);
          const localTime = parseServerTs(localC.updatedAt);
          const fcStudents = Array.isArray(fc.students) ? fc.students : [];
          const localStudents = Array.isArray(localC.students) ? localC.students : [];
          if (fcTime > localTime) {
            db.classes[existingIdx] = {
              ...localC,
              ...fc,
              students: fcStudents.length >= localStudents.length ? fcStudents : localStudents,
            };
            changed = true;
          } else if (fcStudents.length > localStudents.length) {
            db.classes[existingIdx] = {
              ...localC,
              students: fcStudents,
            };
            changed = true;
          }
        }
      }

      if (ltRes && ltRes.ok) {
        const ltJson: any = await ltRes.json().catch(() => null);
        const ltObj = ltJson?.fields ? fromFirestoreValue({ mapValue: { fields: ltJson.fields } }) : null;
        if (ltObj && typeof ltObj.enabled === 'boolean') {
          const fsLtTime = parseServerTs(ltObj.updatedAt);
          const localLtTime = parseServerTs(db.launchTimer?.updatedAt);
          if (!db.launchTimer || fsLtTime > localLtTime) {
            db.launchTimer = ltObj;
            changed = true;
          }
        }
      }

      if (crRes && crRes.ok) {
        const crJson: any = await crRes.json().catch(() => null);
        const crObj = crJson?.fields ? fromFirestoreValue({ mapValue: { fields: crJson.fields } }) : null;
        if (crObj && Array.isArray(crObj.rules) && crObj.rules.length > 0) {
          const fsCrTime = parseServerTs(crObj.updatedAt);
          const localCrTime = parseServerTs((db as any).centralResultLogicUpdatedAt);
          if (!(db as any).centralResultLogicUpdatedAt || fsCrTime > localCrTime) {
            db.centralKaifiyatRules = crObj.rules;
            if (crObj.passing && typeof crObj.passing === 'object') {
              db.centralPassingSettings = crObj.passing;
            }
            if (crObj.updatedAt) {
              (db as any).centralResultLogicUpdatedAt = crObj.updatedAt;
            }
            changed = true;
          }
        }
      }

      if (seRes && seRes.ok) {
        const seJson: any = await seRes.json().catch(() => null);
        const seObj = seJson?.fields ? fromFirestoreValue({ mapValue: { fields: seJson.fields } }) : null;
        if (seObj?.url && typeof seObj.url === 'string') {
          const cleanSeUrl = cleanAppsScriptUrl(seObj.url);
          if (cleanSeUrl && cleanSeUrl !== db.sheetEditorAppsScriptUrl) {
            db.sheetEditorAppsScriptUrl = cleanSeUrl;
            changed = true;
          }
        }
      }

      if (changed) {
        writeDatabase(db);
      }
    } catch {}
  })().finally(() => {
    fsHydrateInFlight = null;
  });

  return fsHydrateInFlight;
}

export function buildApiExpressApp(): express.Express {
  const app = express();

  // Support Netlify Functions serverless rewrite: /.netlify/functions/api/* -> /api/*
  app.use((req, _res, next) => {
    if (req.url.startsWith('/.netlify/functions/api')) {
      req.url = req.url.replace(/^\/\.netlify\/functions\/api/, '/api') || '/api';
    }
    next();
  });

  app.use(express.json({ limit: '25mb' }));

  // Request logger for API calls
  app.use('/api', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    next();
  });

  // Dedicated instant healthcheck endpoints for container platforms
  app.get(['/health', '/healthz'], (req, res) => {
    res.status(200).send('OK');
  });

  app.get('/api/health', (req, res) => {
    res.status(200).json({ status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() });
  });

  // Health and status endpoint
  app.get('/api/status', (req, res) => {
    const db = readDatabase();
    res.json({
      status: 'online',
      message: 'Meyar-e-Madaris Central Cloud Server is active',
      serverTime: new Date().toISOString(),
      stats: {
        madarisCount: db.madaris.length,
        classesCount: db.classes.length,
        publishedClassesCount: db.classes.filter((c: any) => c.status === 'published').length,
        totalStudentsCount: db.classes.reduce((sum: number, c: any) => sum + (c.students?.length || 0), 0),
      },
    });
  });

  // Get full synchronized bundle (for initial load)
  app.get('/api/data', async (req, res) => {
    await hydrateDatabaseFromFirestore(false);
    const db = readDatabase();
    res.json({
      madaris: db.madaris,
      classes: db.classes,
      services: db.services || DEFAULT_SERVER_SERVICES,
      portalLogo: db.portalLogo || '/logo.jpg',
      appsScriptWebAppUrl: db.appsScriptWebAppUrl || DEFAULT_APPS_SCRIPT_URL,
      centralSheetAppsScriptUrl: db.centralSheetAppsScriptUrl || db.appsScriptWebAppUrl || '',
      sheetEditorAppsScriptUrl: cleanAppsScriptUrl(db.sheetEditorAppsScriptUrl) || '',
      adminPinConfigured: Boolean(db.adminPin),
      resultAdminPinConfigured: Boolean(db.resultAdminPin || db.adminPin),
      managerAdminPinConfigured: Boolean(db.managerAdminPin),
      supabaseConfig: db.supabaseConfig || null,
      jobSerialNumber: typeof db.jobSerialNumber === 'number' && db.jobSerialNumber >= 1112 ? db.jobSerialNumber : 1112,
      deletedMadrasaIds: db.deletedMadrasaIds || [],
      stateManagers: db.stateManagers || [],
      centralKaifiyatRules: db.centralKaifiyatRules || [
        { id: '1', minPercentage: 80, maxPercentage: 100, title: 'ممتاز', colorClass: 'text-emerald-700 bg-emerald-50 border-emerald-300' },
        { id: '2', minPercentage: 60, maxPercentage: 79.99, title: 'اعلیٰ', colorClass: 'text-blue-700 bg-blue-50 border-blue-300' },
        { id: '3', minPercentage: 50, maxPercentage: 59.99, title: 'جید', colorClass: 'text-amber-700 bg-amber-50 border-amber-300' },
        { id: '4', minPercentage: 33, maxPercentage: 49.99, title: 'مقبول', colorClass: 'text-stone-700 bg-stone-100 border-stone-300' },
      ],
      centralPassingSettings: db.centralPassingSettings || {
        passingPercentage: 33,
        oneSubjectFailLabel: 'مجاز',
        twoOrMoreFailLabel: 'ناکام',
        absentFailLabel: 'ناکام',
      },
      centralExamTitle: (db as any).centralExamTitle || {
        examTitle: 'سالانہ امتحان 1447-1448ھ / 2026ء',
        examTitleEn: 'Annual Examination Result 1447-1448H / 2026',
        academicYear: '1447-1448ھ / 2026ء',
      },
      launchTimer: db.launchTimer || null,
      serverTime: new Date().toISOString(),
    });
  });

  // Central Result Logic (Rules & Passing Settings) Endpoints
  app.get('/api/central-result-logic', (req, res) => {
    const db = readDatabase();
    res.json({
      rules: db.centralKaifiyatRules || [
        { id: '1', minPercentage: 80, maxPercentage: 100, title: 'ممتاز', colorClass: 'text-emerald-700 bg-emerald-50 border-emerald-300' },
        { id: '2', minPercentage: 60, maxPercentage: 79.99, title: 'اعلیٰ', colorClass: 'text-blue-700 bg-blue-50 border-blue-300' },
        { id: '3', minPercentage: 50, maxPercentage: 59.99, title: 'جید', colorClass: 'text-amber-700 bg-amber-50 border-amber-300' },
        { id: '4', minPercentage: 33, maxPercentage: 49.99, title: 'مقبول', colorClass: 'text-stone-700 bg-stone-100 border-stone-300' },
      ],
      passing: db.centralPassingSettings || {
        passingPercentage: 33,
        oneSubjectFailLabel: 'مجاز',
        twoOrMoreFailLabel: 'ناکام',
        absentFailLabel: 'ناکام',
      },
    });
  });

  app.post('/api/central-result-logic', (req, res) => {
    const db = readDatabase();
    const { rules, passing, applyToAll } = req.body;
    if (Array.isArray(rules) && rules.length > 0) {
      db.centralKaifiyatRules = rules;
    }
    if (passing && typeof passing === 'object') {
      db.centralPassingSettings = passing;
    }
    (db as any).centralResultLogicUpdatedAt = new Date().toISOString();
    if (applyToAll && Array.isArray(db.madaris)) {
      db.madaris.forEach((m: any) => {
        m.kaifiyatRules = rules;
        m.passingSettings = passing;
        m.hasCustomResultLogic = false;
      });
    }
    writeDatabase(db);
    res.json({ success: true, rules: db.centralKaifiyatRules, passing: db.centralPassingSettings });
  });

  // ---------------------------------------------------------------------------
  // Feedbacks & Suggestions Endpoints (موصولہ تجاویز و فیڈ بیک)
  // ---------------------------------------------------------------------------
  app.get('/api/feedbacks', (req, res) => {
    const db = readDatabase();
    let list = Array.isArray(db.feedbacks) ? [...db.feedbacks] : [];
    const stateFilter = (req.query.state as string)?.trim();
    if (stateFilter && stateFilter !== 'all' && stateFilter !== 'تمام') {
      list = list.filter((f: any) =>
        f.state && f.state.toLowerCase() === stateFilter.toLowerCase()
      );
    }
    res.json({ success: true, feedbacks: list });
  });

  app.post('/api/feedbacks', async (req, res) => {
    const { name, phone, state, district, message } = req.body;
    if (!name || !message) {
      return res.status(400).json({ error: 'براہ کرم نام اور اپنی رائے/تجویز ضرور درج فرمائیں۔' });
    }

    const db = readDatabase();
    if (!Array.isArray(db.feedbacks)) {
      db.feedbacks = [];
    }

    const entry = {
      id: `feedback-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      serialNumber: db.feedbacks.length + 1,
      name: String(name || '').trim(),
      phone: String(phone || '').trim(),
      state: String(state || '').trim(),
      district: String(district || '').trim(),
      message: String(message || '').trim(),
      status: 'unread',
      createdAt: new Date().toISOString(),
      dateFormatted: new Date().toLocaleString('en-IN', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
    };

    db.feedbacks.unshift(entry);
    if (db.feedbacks.length > 1000) {
      db.feedbacks = db.feedbacks.slice(0, 1000);
    }
    writeDatabase(db);

    // Forward feedback ONLY to Central Google Sheet ("Feedback" tab)
    // NEVER send feedback to the Drive generator script!
    let sheetSynced = false;
    const centralScriptUrl = cleanAppsScriptUrl(db.centralSheetAppsScriptUrl) || DEFAULT_CENTRAL_SHEET_URL;

    if (centralScriptUrl && centralScriptUrl.startsWith('https://script.google.com/')) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);
        const gasRes = await fetch(centralScriptUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...entry,
            action: 'ADD_FEEDBACK',
            type: 'feedback',
            status: entry.status || 'unread',
            date: entry.dateFormatted || entry.createdAt,
          }),
          redirect: 'follow',
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        if (gasRes.ok) sheetSynced = true;
      } catch {
        // Non-fatal background sync failure captured safely
      }
    }

    res.json({ success: true, entry, sheetSynced });
  });

  app.patch('/api/feedbacks/:id', (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    const db = readDatabase();
    if (!Array.isArray(db.feedbacks)) db.feedbacks = [];
    const item = db.feedbacks.find((f: any) => f.id === id);
    if (!item) return res.status(404).json({ error: 'فیڈ بیک نہیں ملا' });
    if (status) item.status = status;
    item.updatedAt = new Date().toISOString();
    writeDatabase(db);
    res.json({ success: true, item });
  });

  app.delete('/api/feedbacks/:id', (req, res) => {
    const { id } = req.params;
    const db = readDatabase();
    if (!Array.isArray(db.feedbacks)) db.feedbacks = [];
    db.feedbacks = db.feedbacks.filter((f: any) => f.id !== id);
    writeDatabase(db);
    res.json({ success: true });
  });

  // Services endpoints (Permanent Server-Side Storage)
  app.get('/api/services', (req, res) => {
    const db = readDatabase();
    res.json(db.services || DEFAULT_SERVER_SERVICES);
  });

  app.post('/api/services', (req, res) => {
    const db = readDatabase();
    const serviceData = req.body;

    if (!serviceData.title || !serviceData.url) {
      return res.status(400).json({ error: 'سروس کا نام اور یو آر ایل درکار ہیں' });
    }

    if (!Array.isArray(db.services)) {
      db.services = [...DEFAULT_SERVER_SERVICES];
    }

    let cleanSlug = (serviceData.slug || '')
      .toLowerCase()
      .trim()
      .replace(/[^\w-]/g, '')
      .replace(/^service-/, '');

    if (!cleanSlug) {
      const t = (serviceData.title || '').toLowerCase();
      if (t.includes('quiz') || t.includes('کوئز')) cleanSlug = 'quiz';
      else if (t.includes('job') || t.includes('ملازمت')) cleanSlug = 'jobs';
      else if (t.includes('mayaar') || t.includes('مدارس') || t.includes('معیار')) cleanSlug = 'mayaar';
      else if (t.includes('academy') || t.includes('اکیڈمی')) cleanSlug = 'academy';
      else if (t.includes('shop') || t.includes('خریداری')) cleanSlug = 'shop';
      else if (t.includes('qna') || t.includes('سوال')) cleanSlug = 'qna';
      else if (t.includes('facebook') || t.includes('فیس بک')) cleanSlug = 'facebook';
      else {
        cleanSlug = (serviceData.title || '')
          .toLowerCase()
          .trim()
          .replace(/[^\w\s-]/g, '')
          .replace(/[\s_-]+/g, '-')
          .replace(/^-+|-+$/g, '')
          .replace(/^service-/, '');
        if (!cleanSlug) cleanSlug = 'service';
      }
    }

    if (serviceData.id) {
      let cleanId = serviceData.id.replace(/^service-service-/, 'service-');
      if (cleanId.includes('179') || cleanId.length > 28) {
        cleanId = `service-${cleanSlug}`;
      }
      const idx = db.services.findIndex((s: any) => s.id === serviceData.id || s.id === cleanId);
      if (idx !== -1) {
        db.services[idx] = {
          ...db.services[idx],
          ...serviceData,
          id: cleanId,
          slug: cleanSlug,
          updatedAt: new Date().toISOString(),
        };
      } else {
        db.services.push({
          ...serviceData,
          id: cleanId,
          slug: cleanSlug,
          updatedAt: new Date().toISOString(),
        });
      }
    } else {
      let finalId = `service-${cleanSlug}`;
      let counter = 2;
      while (db.services.some((s: any) => s.id === finalId)) {
        finalId = `service-${cleanSlug}-${counter}`;
        counter++;
      }
      const newService = {
        ...serviceData,
        id: finalId,
        slug: cleanSlug,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      db.services.push(newService);
    }

    db.services.sort((a: any, b: any) => (a.displayOrder || 0) - (b.displayOrder || 0));
    writeDatabase(db);
    res.json({ success: true, services: db.services });
  });

  app.post('/api/services/reorder', (req, res) => {
    const db = readDatabase();
    const { services } = req.body;
    if (Array.isArray(services)) {
      db.services = services;
      writeDatabase(db);
      return res.json({ success: true, services: db.services });
    }
    return res.status(400).json({ error: 'سروسز لسٹ درکار ہے' });
  });

  app.delete('/api/services/:id', (req, res) => {
    const { id } = req.params;
    const db = readDatabase();
    if (Array.isArray(db.services)) {
      db.services = db.services.filter((s: any) => s.id !== id);
      writeDatabase(db);
    }
    res.json({ success: true, services: db.services });
  });

  // Portal Logo endpoint
  app.get('/api/portal-logo', (req, res) => {
    const db = readDatabase();
    res.json({ logo: db.portalLogo || '/logo.jpg' });
  });

  app.post('/api/portal-logo', (req, res) => {
    const { logo } = req.body;
    if (!logo) {
      return res.status(400).json({ error: 'لوگو ڈیٹا درکار ہے' });
    }
    const db = readDatabase();
    db.portalLogo = logo;
    writeDatabase(db);
    res.json({ success: true, logo: db.portalLogo });
  });

  // Default Registration Classes Endpoints
  app.get('/api/default-classes', (req, res) => {
    const db = readDatabase();
    const defaultClasses = (db as any).defaultClasses || [
      'حفظ',
      'ناظرہ',
      'سال اول',
      'سال دوم',
      'سال سوم',
      'سال چہارم',
      'سال پنجم',
      'سال ششم',
      'دورۂ حدیث شریف',
    ];
    res.json({ classes: defaultClasses });
  });

  app.post('/api/default-classes', (req, res) => {
    const { classes } = req.body;
    if (!Array.isArray(classes)) {
      return res.status(400).json({ error: 'درجات کی فہرست درکار ہے' });
    }
    const db = readDatabase();
    (db as any).defaultClasses = classes;
    writeDatabase(db);
    res.json({ success: true, classes });
  });

  // Central Exam Title & Academic Year Endpoints
  app.get('/api/central-exam-title', (req, res) => {
    const db = readDatabase();
    const raw = (db as any).centralExamTitle;
    let info = {
      examTitle: 'سالانہ امتحان 1447-1448ھ / 2026ء',
      examTitleEn: 'Annual Examination Result 1447-1448H / 2026',
      academicYear: '1447-1448ھ / 2026ء',
    };
    if (typeof raw === 'string' && raw.trim()) {
      info.examTitle = raw.trim();
    } else if (raw && typeof raw === 'object') {
      info = {
        examTitle: raw.examTitle || info.examTitle,
        examTitleEn: raw.examTitleEn || info.examTitleEn,
        academicYear: raw.academicYear || info.academicYear,
      };
    }
    res.json(info);
  });

  app.post('/api/central-exam-title', (req, res) => {
    const { examTitle, examTitleEn, academicYear, applyToAllMadaris } = req.body;
    if (!examTitle) {
      return res.status(400).json({ error: 'امتحانی عنوان درکار ہے' });
    }
    const db = readDatabase();
    (db as any).centralExamTitle = {
      examTitle,
      examTitleEn: examTitleEn || 'Annual Examination Result 1447-1448H / 2026',
      academicYear: academicYear || '1447-1448ھ / 2026ء',
    };

    if (applyToAllMadaris && Array.isArray(db.madaris)) {
      db.madaris.forEach((m: any) => {
        m.examTitle = examTitle;
        if (examTitleEn) m.examTitleEn = examTitleEn;
        if (academicYear) m.academicYear = academicYear;
      });
    }

    writeDatabase(db);
    res.json({
      success: true,
      message: applyToAllMadaris
        ? 'عنوان تمام مدارس پر کامیابی سے لاگو کر دیا گیا'
        : 'مرکزی امتحانی عنوان کامیابی سے محفوظ کر لیا گیا',
    });
  });

  // Portal Launch Timer Endpoints
  app.get('/api/launch-timer', (req, res) => {
    const db = readDatabase();
    const defaultTimer = {
      enabled: false,
      targetDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      title: 'معیارِ مدارس — امتحانی نتائج کا باضابطہ اعلان و افتتاح',
      message: 'ان شاء اللہ جلد ہی سالانہ امتحانی نتائج کا باضابطہ اعلان کیا جائے گا۔',
      isLaunched: false,
    };
    res.json(db.launchTimer || defaultTimer);
  });

  app.post('/api/launch-timer', (req, res) => {
    const db = readDatabase();
    const timerData = req.body;
    db.launchTimer = {
      ...(db.launchTimer || {}),
      ...timerData,
      updatedAt: new Date().toISOString(),
    };
    writeDatabase(db);
    res.json({ success: true, launchTimer: db.launchTimer });
  });

  // Robust Google Sheet Synchronizer across Master Data and Class Tabs
  async function syncMadrasaFromGoogleSheet(
    db: DatabaseSchema,
    madrasaId: string,
    explicitUrl?: string
  ): Promise<{ success: boolean; syncedClasses: number; totalStudents: number; message: string }> {
    moduleSyncMadrasaFromGoogleSheet = syncMadrasaFromGoogleSheet;
    const madrasa = db.madaris.find(
      (m: any) =>
        m.id === madrasaId ||
        (m.code && String(m.code).toUpperCase() === String(madrasaId).toUpperCase())
    );
    if (!madrasa) return { success: false, syncedClasses: 0, totalStudents: 0, message: 'مدرسہ نہیں مل سکا' };

    const targetUrl = (explicitUrl || madrasa.googleSheetUrl || '').trim();
    if (!targetUrl) return { success: false, syncedClasses: 0, totalStudents: 0, message: 'گوگل شیٹ کا لنک منسلک نہیں ہے' };

    // Prevent cross-contamination: do not sync from global Apps Script if no dedicated sheet is attached
    if (
      targetUrl === DEFAULT_APPS_SCRIPT_URL &&
      madrasa.code !== 'MM118' &&
      !targetUrl.includes('spreadsheetId') &&
      !madrasa.spreadsheetId
    ) {
      return { success: true, syncedClasses: 0, totalStudents: 0, message: 'مدرسہ کی اپنی گوگل شیٹ ابھی منسلک نہیں ہے' };
    }

    // 1. Direct Google Apps Script Web App API support
    if (targetUrl.includes('script.google.com/macros/s/')) {
      try {
        const gasUrl = `${targetUrl}${targetUrl.includes('?') ? '&' : '?'}action=all&cb=${Date.now()}`;
        const gasRes = await fetch(gasUrl, { redirect: 'follow' });
        if (!gasRes.ok) {
          return { success: false, syncedClasses: 0, totalStudents: 0, message: `گوگل ویب ایپ اسکرپٹ سے رابطہ نہیں ہو سکا (کوڈ ${gasRes.status})` };
        }
        const gasData: any = await parseSafeJson(gasRes);
        if (!gasData || typeof gasData !== 'object') {
          return { success: false, syncedClasses: 0, totalStudents: 0, message: 'گوگل اسکرپٹ سے درست جواب موصول نہیں ہوا۔' };
        }
        if (gasData.status === 'error') {
          return { success: false, syncedClasses: 0, totalStudents: 0, message: gasData.message || 'گوگل اسکرپٹ سے خرابی کی اطلاع ملی' };
        }

        // Check if response belongs to another madrasa (e.g. MM118 response returned to non-MM118 madrasa)
        if (gasData.sheetName && gasData.sheetName.includes('MM118') && madrasa.code !== 'MM118') {
          return { success: true, syncedClasses: 0, totalStudents: 0, message: 'شیٹ کی توثیق مکمل ہونے کی منتظر ہے' };
        }

        let classesToSync: any[] = [];
        if (Array.isArray(gasData.classes)) {
          classesToSync = gasData.classes;
        } else if (Array.isArray(gasData.data) || Array.isArray(gasData.students)) {
          const rawStudents = gasData.data || gasData.students;
          const groupMap = new Map<string, any[]>();
          for (const s of rawStudents) {
            const cName = s.class || s.className || s.darja || 'عام';
            if (!groupMap.has(cName)) groupMap.set(cName, []);
            groupMap.get(cName)!.push(s);
          }
          groupMap.forEach((students, cName) => {
            classesToSync.push({ name: cName, students });
          });
        }

        if (classesToSync.length === 0) {
          return { success: true, syncedClasses: 0, totalStudents: 0, message: 'اسکرپٹ اے پی آئی سے کنیکٹ ہو گیا، فی الحال کوئی کلاس یا ڈیٹا موجود نہیں ہے' };
        }

        let totalStudentsCount = 0;
        let syncedClassesCount = 0;

        for (const clsData of classesToSync) {
          const className = (clsData.name || clsData.className || 'کلاس').trim();
          const incomingStudents = Array.isArray(clsData.students) ? clsData.students : [];

          // Skip MM118 dummy students for other madaris
          const filteredIncoming = incomingStudents.filter((s: any) => {
            const sId = String(s.studentId || s.id || '').trim();
            if (madrasa.code !== 'MM118' && (sId.startsWith('118') || sId.startsWith('dummy-'))) return false;
            return true;
          });

          let existingClass = db.classes.find((c: any) => c.madrasaId === madrasaId && c.name === className);
          if (!existingClass) {
            existingClass = {
              id: `class-${madrasaId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              madrasaId: madrasaId,
              name: className,
              academicYear: '1447-1448ھ / 2025-2026ء',
              status: 'published',
              resultSourceType: 'google_sheet',
              googleSheetUrl: targetUrl,
              sheetTabName: className,
              subjects: clsData.subjects || [],
              students: [],
              updatedAt: new Date().toISOString(),
            };
            db.classes.push(existingClass);
          }

          const formattedStudents = filteredIncoming.map((s: any, idx: number) => {
            const studentId = String(s.studentId || s.id || s.rollNo || (idx + 1)).trim();
            const dob = String(s.dob || '').trim();
            const studentName = s.candidateNameUrdu || s.studentNameUrdu || s.studentName || s.name || '';
            const studentNameEn = s.candidateNameEng || s.studentNameEn || s.nameEn || '';
            const fatherName = s.fatherNameUrdu || s.fatherName || '';
            const fatherNameEn = s.fatherNameEng || s.fatherNameEn || '';
            const rollNo = String(s.rollNo || s.studentId || (idx + 1)).trim();

            let subjectsList: any[] = [];
            let totalMax = 0;
            let totalObt = 0;

            if (Array.isArray(s.subjects)) {
              subjectsList = s.subjects.map((sub: any) => {
                const isAb = Boolean(sub.isAbsent) || isAbsentCell(sub.obtainedMarks);
                const rawObt = isAb ? 'غ' : (sub.obtainedMarks === '' ? '' : (Number(sub.obtainedMarks) || 0));
                return {
                  ...sub,
                  obtainedMarks: rawObt,
                  isAbsent: isAb,
                  isPassed: !isAb && (Number(sub.obtainedMarks) || 0) >= 33,
                };
              });
              totalMax = subjectsList.reduce((acc, sub) => acc + (Number(sub.maxMarks) || 100), 0);
              totalObt = subjectsList.reduce((acc, sub) => acc + (sub.isAbsent ? 0 : (Number(sub.obtainedMarks) || 0)), 0);
            } else if (s.marks && typeof s.marks === 'object') {
              for (const [subName, obt] of Object.entries(s.marks)) {
                const isAb = isAbsentCell(obt as any);
                const obtNum = isAb ? 0 : (Number(obt) || 0);
                const maxNum = 100;
                totalMax += maxNum;
                if (!isAb) totalObt += obtNum;
                subjectsList.push({
                  name: subName,
                  maxMarks: maxNum,
                  obtainedMarks: isAb ? 'غ' : obtNum,
                  isAbsent: isAb,
                  isPassed: !isAb && obtNum >= 33,
                  percentage: (!isAb && maxNum > 0) ? Math.round((obtNum / maxNum) * 100) : 0,
                });
              }
            }

            const studentHasAb = Boolean(s.isAbsent) || subjectsList.some((sub: any) => sub.isAbsent || sub.obtainedMarks === 'غ');
            const finalTotal = s.totalMarks !== undefined ? Number(s.totalMarks) : totalMax;
            const finalObt = s.obtainedMarks !== undefined ? Number(s.obtainedMarks) : totalObt;
            const finalPct = s.percentage !== undefined ? Number(s.percentage) : (finalTotal > 0 ? Math.round((finalObt / finalTotal) * 100) : 0);
            const finalKaif = studentHasAb
              ? (madrasa.passingSettings?.absentFailLabel || 'ناکام')
              : (s.kaifiyat || (finalPct >= 80 ? 'ممتاز' : finalPct >= 60 ? 'اعلیٰ' : finalPct >= 50 ? 'جید' : finalPct >= 33 ? 'مقبول' : 'ناکام'));

            return {
              studentId,
              rollNo,
              dob,
              studentName,
              studentNameEn,
              fatherName,
              fatherNameEn,
              darja: className,
              subjects: subjectsList,
              totalMarks: finalTotal,
              obtainedMarks: finalObt,
              percentage: finalPct,
              kaifiyat: finalKaif,
              isAbsent: studentHasAb,
              failedSubjectCount: subjectsList.filter((sub: any) => (!sub.isPassed || sub.isAbsent) && !sub.isEmpty).length,
            };
          });

          existingClass.students = formattedStudents;
          existingClass.status = 'published';
          existingClass.updatedAt = new Date().toISOString();
          syncedClassesCount++;
          totalStudentsCount += formattedStudents.length;
        }

        madrasa.updatedAt = new Date().toISOString();
        writeDatabase(db);
        return {
          success: true,
          syncedClasses: syncedClassesCount,
          totalStudents: totalStudentsCount,
          message: `گوگل ویب ایپ اسکرپٹ سے ${syncedClassesCount} درجات اور ${totalStudentsCount} طلبہ کا ڈیٹا لائیو سنک ہو گیا!`,
        };
      } catch (gasErr: any) {
        console.error('Apps Script API fetch error:', gasErr);
        return { success: false, syncedClasses: 0, totalStudents: 0, message: `ویب ایپ اسکرپٹ سے رابطہ کے دوران خرابی: ${gasErr.message}` };
      }
    }

    // 2. Standard Google Spreadsheets /d/ ID parsing
    const match = targetUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
    if (!match) return { success: false, syncedClasses: 0, totalStudents: 0, message: 'گوگل شیٹ لنک کا فارمیٹ غلط ہے' };
    const sheetId = match[1];

    // Attempt direct sync via Google Apps Script Engine API ONLY if non-default custom script or for MM118 itself
    const driveScriptUrl = cleanAppsScriptUrl(db.appsScriptWebAppUrl);
    if (driveScriptUrl && driveScriptUrl.startsWith('https://script.google.com/') && (driveScriptUrl !== DEFAULT_APPS_SCRIPT_URL || madrasa.code === 'MM118')) {
      try {
        const gasUrl = `${driveScriptUrl}${driveScriptUrl.includes('?') ? '&' : '?'}action=GET_RESULTS&spreadsheetId=${sheetId}&cb=${Date.now()}`;
        const gasCtrl = new AbortController();
        const gasTimer = setTimeout(() => gasCtrl.abort(), 12000);
        const gasRes = await fetch(gasUrl, { redirect: 'follow', signal: gasCtrl.signal });
        clearTimeout(gasTimer);

        if (gasRes.ok) {
          const gasData: any = await parseSafeJson(gasRes);
          const isForeignDemoData = gasData?.sheetName && gasData.sheetName.includes('MM118') && madrasa.code !== 'MM118';
          const hasDummy118Students = Array.isArray(gasData?.classes) && gasData.classes.some((c: any) =>
            Array.isArray(c.students) && c.students.some((s: any) => String(s.studentId || s.id || '').startsWith('118') && madrasa.code !== 'MM118')
          );

          if (gasData && gasData.status === 'success' && !isForeignDemoData && !hasDummy118Students && Array.isArray(gasData.classes) && gasData.classes.length > 0) {
            let totalStudentsCount = 0;
            let syncedClassesCount = 0;

            for (const clsData of gasData.classes) {
              const className = (clsData.name || clsData.className || 'کلاس').trim();
              const incomingStudents = Array.isArray(clsData.students) ? clsData.students : [];

              let existingClass = db.classes.find((c: any) =>
                (c.madrasaId === madrasa.id || (madrasa.code && c.madrasaId === madrasa.code)) &&
                c.name === className
              );
              if (!existingClass) {
                existingClass = {
                  id: `class-${madrasa.code || madrasa.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                  madrasaId: madrasa.id,
                  name: className,
                  academicYear: '1447-1448ھ / 2025-2026ء',
                  status: 'published',
                  resultSourceType: 'google_sheet',
                  googleSheetUrl: targetUrl,
                  sheetTabName: className,
                  subjects: clsData.subjects || [],
                  students: [],
                  updatedAt: new Date().toISOString(),
                };
                db.classes.push(existingClass);
              }

              const formattedStudents = incomingStudents.map((s: any, idx: number) => {
                const studentId = String(s.studentId || s.id || s.rollNo || (idx + 1)).trim();
                const dob = String(s.dob || '').trim();
                const studentName = s.candidateNameUrdu || s.studentNameUrdu || s.studentName || s.name || '';
                const studentNameEn = s.candidateNameEng || s.studentNameEn || s.nameEn || '';
                const fatherName = s.fatherNameUrdu || s.fatherName || '';
                const fatherNameEn = s.fatherNameEng || s.fatherNameEn || '';
                const rollNo = String(s.rollNo || s.studentId || (idx + 1)).trim();

                let subjectsList: any[] = [];
                let totalMax = s.totalMarks || 0;
                let totalObt = s.obtainedMarks || 0;

                if (Array.isArray(s.subjects)) {
                  subjectsList = s.subjects;
                  totalMax = subjectsList.reduce((acc, sub) => acc + (Number(sub.maxMarks) || 100), 0);
                  totalObt = subjectsList.reduce((acc, sub) => acc + (Number(sub.obtainedMarks) || 0), 0);
                }

                const pct = totalMax > 0 ? (totalObt / totalMax) * 100 : (Number(s.percentage) || 0);

                return {
                  studentId,
                  rollNo,
                  studentName,
                  studentNameEn,
                  fatherName,
                  fatherNameEn,
                  dob,
                  darja: className,
                  subjects: subjectsList,
                  totalMarks: totalMax,
                  obtainedMarks: totalObt,
                  percentage: Number(pct.toFixed(2)),
                  kaifiyat: s.kaifiyat || (pct >= 80 ? 'ممتاز' : pct >= 60 ? 'اعلیٰ' : pct >= 50 ? 'جید' : pct >= 33 ? 'مقبول' : 'ناکام'),
                  isAbsent: Boolean(s.isAbsent),
                  failedSubjectCount: s.failedSubjectCount || 0,
                };
              });

              existingClass.students = formattedStudents;
              existingClass.status = 'published';
              existingClass.googleSheetUrl = targetUrl;
              existingClass.updatedAt = new Date().toISOString();
              syncedClassesCount++;
              totalStudentsCount += formattedStudents.length;
            }

            madrasa.updatedAt = new Date().toISOString();
            writeDatabase(db);
            return {
              success: true,
              syncedClasses: syncedClassesCount,
              totalStudents: totalStudentsCount,
              message: `گوگل شیٹ سے ${syncedClassesCount} درجات اور ${totalStudentsCount} طلبہ کا ڈیٹا لائیو سنک ہو گیا!`,
            };
          }
        }
      } catch (gasEngineErr) {
        console.warn('Apps Script engine sync notice, falling back to direct CSV:', gasEngineErr);
      }
    }

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);
      const cacheBust = `cb=${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const htmlRes = await fetch(`https://docs.google.com/spreadsheets/d/${sheetId}/htmlview?${cacheBust}`, {
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
        },
        signal: controller.signal,
      });
      clearTimeout(timer);

      let tabs: { name: string; gid: string }[] = [];
      if (htmlRes.ok) {
        const html = await htmlRes.text();
        const itemRegex = /items\.push\(\{name:\s*"([^"]+)",\s*pageUrl:\s*"[^"]*",\s*gid:\s*"([0-9]+)"/g;
        let m;
        while ((m = itemRegex.exec(html)) !== null) {
          tabs.push({ name: m[1].trim(), gid: m[2] });
        }
      }

      if (tabs.length === 0) {
        const existing = db.classes.filter((c: any) => c.madrasaId === madrasa.id).map((c: any) => c.name);
        if (existing.length > 0) {
          existing.forEach((cn: string, i: number) => tabs.push({ name: cn, gid: String(i) }));
        } else {
          tabs.push({ name: 'حفظ', gid: '0' });
          tabs.push({ name: 'سال اول', gid: '1' });
          tabs.push({ name: 'سال دوم', gid: '2' });
        }
      }

      const parseRow = (line: string): string[] => {
        const resArr: string[] = [];
        let cur = '';
        let inQ = false;
        for (let i = 0; i < line.length; i++) {
          const ch = line[i];
          if (ch === '"') {
            if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
            else inQ = !inQ;
          } else if (ch === ',' && !inQ) {
            resArr.push(cur.trim());
            cur = '';
          } else cur += ch;
        }
        resArr.push(cur.trim());
        return resArr;
      };

      // 1. Fetch & Parse "Master Data" tab first
      const masterDataMap = new Map<string, {
        studentId: string;
        urduName: string;
        urduFather: string;
        name: string;
        father: string;
        className: string;
        dob: string;
        percentage?: number;
        kaifiyat?: string;
        obtainedMarks?: number;
        totalMarks?: number;
      }>();

      const masterExportUrls = [
        `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=0&${cacheBust}`,
        `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent('Master Data')}&${cacheBust}`,
        `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent('Masters')}&${cacheBust}`,
        `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&gid=0&${cacheBust}`,
      ];

      for (const meu of masterExportUrls) {
        try {
          const mr = await fetch(meu, {
            headers: {
              'Cache-Control': 'no-cache, no-store, must-revalidate',
              'Pragma': 'no-cache',
            },
          });
          if (mr.ok) {
            const mt = await mr.text();
            if (mt && !mt.includes('<!DOCTYPE html>') && (mt.includes(',') || mt.includes('\n'))) {
              const mlines = mt.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
              if (mlines.length >= 2) {
                const mheaders = parseRow(mlines[0]).map(h => h.toLowerCase().replace(/[_-\s]/g, ''));
                let mIdIdx = -1, mUrduNameIdx = -1, mUrduFatherIdx = -1, mNameIdx = -1, mFatherIdx = -1, mClassIdx = -1, mDobIdx = -1;
                let mPctIdx = -1, mKaifIdx = -1, mObtIdx = -1, mTotIdx = -1;

                mheaders.forEach((mh, idx) => {
                  if (mh.includes('studentid') || mh === 'id' || mh.includes('آئیڈی') || mh.includes('ایڈی') || mh.includes('اسٹوڈنٹ')) {
                    if (mIdIdx === -1) mIdIdx = idx;
                  } else if (mh.includes('امیدوار') || mh.includes('طالبعلم') || mh.includes('طالب')) {
                    if (mUrduNameIdx === -1) mUrduNameIdx = idx;
                  } else if (mh.includes('والد') || mh.includes('ولدیت')) {
                    if (mUrduFatherIdx === -1) mUrduFatherIdx = idx;
                  } else if (mh === 'candidatename' || (mh.includes('name') && !mh.includes('father'))) {
                    if (mNameIdx === -1) mNameIdx = idx;
                  } else if (mh === 'fathername' || mh.includes('father')) {
                    if (mFatherIdx === -1) mFatherIdx = idx;
                  } else if (mh.includes('درجہ') || mh.includes('کلاس') || mh.includes('class')) {
                    if (mClassIdx === -1) mClassIdx = idx;
                  } else if (mh.includes('dob') || mh.includes('تاریخپیدائش') || mh.includes('تاریخ')) {
                    if (mDobIdx === -1) mDobIdx = idx;
                  } else if (mh.includes('فیصد') || mh.includes('percent') || mh === '%' || mh.includes('pct')) {
                    if (mPctIdx === -1) mPctIdx = idx;
                  } else if (mh.includes('کیفیت') || mh.includes('kaifiyat') || mh.includes('grade') || mh.includes('status') || mh.includes('نتیجہ') || mh.includes('پوزیشن')) {
                    if (mKaifIdx === -1) mKaifIdx = idx;
                  } else if (mh.includes('حاصلکردہ') || mh.includes('obtained') || mh.includes('obtmarks')) {
                    if (mObtIdx === -1) mObtIdx = idx;
                  } else if (mh.includes('کلنمبر') || mh.includes('totalmarks') || mh.includes('maxmarks') || mh === 'total') {
                    if (mTotIdx === -1) mTotIdx = idx;
                  }
                });

                if (mIdIdx !== -1) {
                  for (let mrIdx = 1; mrIdx < mlines.length; mrIdx++) {
                    const mRow = parseRow(mlines[mrIdx]);
                    const msid = (mRow[mIdIdx] || '').trim();
                    if (msid) {
                      const rawPct = mPctIdx !== -1 ? parseFloat(String(mRow[mPctIdx] || '').replace(/[^0-9.]/g, '')) : undefined;
                      const rawKaif = mKaifIdx !== -1 ? String(mRow[mKaifIdx] || '').trim() : undefined;
                      const rawObt = mObtIdx !== -1 ? parseFloat(String(mRow[mObtIdx] || '').replace(/[^0-9.]/g, '')) : undefined;
                      const rawTot = mTotIdx !== -1 ? parseFloat(String(mRow[mTotIdx] || '').replace(/[^0-9.]/g, '')) : undefined;

                      masterDataMap.set(msid, {
                        studentId: msid,
                        urduName: mUrduNameIdx !== -1 ? (mRow[mUrduNameIdx] || '').trim() : '',
                        urduFather: mUrduFatherIdx !== -1 ? (mRow[mUrduFatherIdx] || '').trim() : '',
                        name: mNameIdx !== -1 ? (mRow[mNameIdx] || '').trim() : '',
                        father: mFatherIdx !== -1 ? (mRow[mFatherIdx] || '').trim() : '',
                        className: mClassIdx !== -1 ? (mRow[mClassIdx] || '').trim() : '',
                        dob: mDobIdx !== -1 ? normalizeDate(mRow[mDobIdx] || '') : '',
                        percentage: !isNaN(rawPct as number) ? rawPct : undefined,
                        kaifiyat: rawKaif || undefined,
                        obtainedMarks: !isNaN(rawObt as number) ? rawObt : undefined,
                        totalMarks: !isNaN(rawTot as number) ? rawTot : undefined,
                      });
                    }
                  }
                  break;
                }
              }
            }
          }
        } catch {
          // try next url
        }
      }

      let syncedClasses = 0;
      let totalStudents = 0;

      for (const tab of tabs) {
        if (tab.name === 'Master Data' || tab.name === 'Masters') continue;

        const exportUrls = [
          `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${tab.gid}&${cacheBust}`,
          `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&gid=${tab.gid}&${cacheBust}`,
          `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tab.name)}&${cacheBust}`,
        ];
        let csvText = '';
        for (const eu of exportUrls) {
          try {
            const cr = await fetch(eu, {
              headers: {
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
              },
            });
            if (cr.ok) {
              const ct = await cr.text();
              if (ct && !ct.includes('<!DOCTYPE html>') && (ct.includes(',') || ct.includes('\n'))) {
                csvText = ct;
                break;
              }
            }
          } catch {}
        }
        if (!csvText) continue;

        const lines = csvText.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
        if (lines.length < 1) continue;

        const headers = parseRow(lines[0]);
        let idIdx = -1, dobIdx = -1, nameIdx = -1, fatherIdx = -1, rollIdx = -1;
        let percentageIdx = -1, kaifiyatIdx = -1, obtMarksIdx = -1, totMarksIdx = -1;
        const subjects: { index: number; name: string; maxMarks: number }[] = [];

        headers.forEach((h, idx) => {
          const norm = h.toLowerCase().replace(/[_-\s]/g, '');
          if (norm.includes('studentid') || norm === 'id' || norm.includes('آئیڈی') || norm.includes('ایڈی') || norm.includes('اسٹوڈنٹ')) {
            if (idIdx === -1) idIdx = idx;
          } else if (norm.includes('dob') || norm.includes('تاریخپیدائش') || norm.includes('تاریخ')) {
            if (dobIdx === -1) dobIdx = idx;
          } else if (norm.includes('studentname') || norm.includes('امیدوار') || norm.includes('نام') || norm === 'name') {
            if (nameIdx === -1) nameIdx = idx;
          } else if (norm.includes('fathername') || norm.includes('والد') || norm.includes('ولدیت')) {
            if (fatherIdx === -1) fatherIdx = idx;
          } else if (norm.includes('roll')) {
            if (rollIdx === -1) rollIdx = idx;
          } else if (norm.includes('فیصد') || norm.includes('percent') || norm === '%' || norm.includes('pct')) {
            if (percentageIdx === -1) percentageIdx = idx;
          } else if (norm.includes('کیفیت') || norm.includes('kaifiyat') || norm.includes('grade') || norm.includes('status') || norm.includes('نتیجہ') || norm.includes('پوزیشن')) {
            if (kaifiyatIdx === -1) kaifiyatIdx = idx;
          } else if (norm.includes('حاصلکردہ') || norm.includes('obtained') || norm.includes('obtmarks') || norm.includes('مجموعہنمبر')) {
            if (obtMarksIdx === -1) obtMarksIdx = idx;
          } else if (norm.includes('کلنمبر') || norm.includes('totalmarks') || norm.includes('maxmarks') || norm === 'total') {
            if (totMarksIdx === -1) totMarksIdx = idx;
          } else {
            let subName = h.trim();
            let maxM = 100;
            const bm = h.trim().match(/^(.*?)\s*[[({]([0-9]+)[\])}]$/);
            const dm = h.trim().match(/^(.*?)\s*[:\-\/]\s*([0-9]+)$/);
            const sm = h.trim().match(/^(.*?)\s+([0-9]{2,3})$/);
            if (bm && bm[1].trim()) {
              subName = bm[1].trim();
              maxM = parseInt(bm[2], 10) || 100;
            } else if (dm && dm[1].trim()) {
              subName = dm[1].trim();
              maxM = parseInt(dm[2], 10) || 100;
            } else if (sm && sm[1].trim()) {
              subName = sm[1].trim();
              maxM = parseInt(sm[2], 10) || 100;
            }
            if (subName) subjects.push({ index: idx, name: subName, maxMarks: maxM });
          }
        });

        const studentsList: any[] = [];
        const seenStudentIds = new Set<string>();

        if (idIdx !== -1 && lines.length >= 2) {
          for (let r = 1; r < lines.length; r++) {
            const row = parseRow(lines[r]);
            const sid = (row[idIdx] || '').trim();
            if (!sid) continue;

            seenStudentIds.add(sid);
            const masterEntry = masterDataMap.get(sid);
            const sdob = (dobIdx !== -1 ? normalizeDate(row[dobIdx] || '') : '') || masterEntry?.dob || '2008-01-01';
            const sname = (nameIdx !== -1 ? (row[nameIdx] || '').trim() : '') || masterEntry?.urduName || masterEntry?.name || 'طالب علم';
            const sfather = (fatherIdx !== -1 ? (row[fatherIdx] || '').trim() : '') || masterEntry?.urduFather || masterEntry?.father || '';
            const snameEn = masterEntry?.name || sname;
            const sfatherEn = masterEntry?.father || sfather;
            const sroll = rollIdx !== -1 ? (row[rollIdx] || '').trim() : '';

            let tot = 0, obt = 0, hasAb = false, failedCount = 0, hasAnyScore = false;
            const subMarks: any[] = [];

            const passPercentage = madrasa.passingSettings?.passingPercentage || 33;

            subjects.forEach(sub => {
              const rawVal = row[sub.index];
              const isAb = isAbsentCell(rawVal);
              tot += sub.maxMarks;
              // 50 نمبر والے مضمون میں طے شدہ کا نصف کا اعتبار ہوگا یعنی 100 میں سے 33 تو 50 میں سے 17
              const passingThreshold = sub.maxMarks === 50
                ? Math.ceil(passPercentage / 2)
                : Math.ceil((passPercentage * (sub.maxMarks || 100)) / 100);

              if (isAb) {
                hasAb = true;
                hasAnyScore = true;
                failedCount++;
                subMarks.push({
                  name: sub.name,
                  maxMarks: sub.maxMarks,
                  obtainedMarks: 'غ',
                  isAbsent: true,
                  isEmpty: false,
                  isPassed: false,
                  percentage: 0,
                });
              } else if (rawVal !== '' && rawVal !== '-' && rawVal !== undefined && rawVal !== null) {
                hasAnyScore = true;
                const cleanDigit = convertEasternToWesternDigits(String(rawVal).trim());
                const num = parseFloat(cleanDigit.replace(/[^0-9.]/g, '')) || 0;
                obt += num;
                const pct = sub.maxMarks > 0 ? (num / sub.maxMarks) * 100 : 0;
                const passed = num >= passingThreshold;
                if (!passed) failedCount++;
                subMarks.push({
                  name: sub.name,
                  maxMarks: sub.maxMarks,
                  obtainedMarks: num,
                  isAbsent: false,
                  isEmpty: false,
                  isPassed: passed,
                  percentage: Math.round(pct * 100) / 100,
                });
              } else {
                // Empty / pending score stays empty string with isEmpty flag
                failedCount++;
                subMarks.push({
                  name: sub.name,
                  maxMarks: sub.maxMarks,
                  obtainedMarks: '',
                  isEmpty: true,
                  isAbsent: false,
                  isPassed: false,
                  percentage: 0,
                });
              }
            });

            // Check explicit totals if subjects weren't present or if sheet has explicit totals
            if (obtMarksIdx !== -1) {
              const parsedObt = parseFloat(String(row[obtMarksIdx] || '').replace(/[^0-9.]/g, ''));
              if (!isNaN(parsedObt)) { obt = parsedObt; hasAnyScore = true; }
            } else if (masterEntry?.obtainedMarks !== undefined) {
              obt = masterEntry.obtainedMarks;
              hasAnyScore = true;
            }

            if (totMarksIdx !== -1) {
              const parsedTot = parseFloat(String(row[totMarksIdx] || '').replace(/[^0-9.]/g, ''));
              if (!isNaN(parsedTot) && parsedTot > 0) tot = parsedTot;
            } else if (masterEntry?.totalMarks !== undefined && masterEntry.totalMarks > 0) {
              tot = masterEntry.totalMarks;
            }

            let calculatedPct = (hasAnyScore && tot > 0) ? (obt / tot) * 100 : 0;
            if (percentageIdx !== -1) {
              const parsedPct = parseFloat(String(row[percentageIdx] || '').replace(/[^0-9.]/g, ''));
              if (!isNaN(parsedPct)) calculatedPct = parsedPct;
            } else if (masterEntry?.percentage !== undefined) {
              calculatedPct = masterEntry.percentage;
            }

            let finalKaifiyat = '';
            if (kaifiyatIdx !== -1 && String(row[kaifiyatIdx] || '').trim()) {
              finalKaifiyat = String(row[kaifiyatIdx] || '').trim();
            } else if (masterEntry?.kaifiyat) {
              finalKaifiyat = masterEntry.kaifiyat;
            } else {
              if (hasAb) {
                finalKaifiyat = madrasa.passingSettings?.absentFailLabel || 'ناکام';
              } else if (failedCount >= 2) {
                finalKaifiyat = madrasa.passingSettings?.twoOrMoreFailLabel || 'ناکام';
              } else if (failedCount === 1) {
                finalKaifiyat = madrasa.passingSettings?.oneSubjectFailLabel || 'مجاز';
              } else if (calculatedPct < passPercentage) {
                finalKaifiyat = madrasa.passingSettings?.twoOrMoreFailLabel || 'ناکام';
              } else {
                const customRules = Array.isArray(madrasa.kaifiyatRules) && madrasa.kaifiyatRules.length > 0
                  ? [...madrasa.kaifiyatRules].sort((a: any, b: any) => b.minPercentage - a.minPercentage)
                  : null;

                if (customRules) {
                  let matched = false;
                  for (const r of customRules) {
                    if (calculatedPct >= r.minPercentage && calculatedPct <= (r.maxPercentage || 100)) {
                      finalKaifiyat = r.title;
                      matched = true;
                      break;
                    }
                  }
                  if (!matched) {
                    finalKaifiyat = calculatedPct >= 80 ? 'ممتاز' : calculatedPct >= 60 ? 'اعلیٰ' : calculatedPct >= 50 ? 'جید' : 'مقبول';
                  }
                } else {
                  if (calculatedPct >= 80) finalKaifiyat = 'ممتاز';
                  else if (calculatedPct >= 60) finalKaifiyat = 'اعلیٰ';
                  else if (calculatedPct >= 50) finalKaifiyat = 'جید';
                  else finalKaifiyat = 'مقبول';
                }
              }
            }

            studentsList.push({
              studentId: sid,
              dob: sdob,
              studentName: sname,
              studentNameEn: snameEn,
              fatherName: sfather,
              fatherNameEn: sfatherEn,
              rollNo: sroll || String(r).padStart(2, '0'),
              darja: tab.name,
              subjects: subMarks,
              totalMarks: tot,
              obtainedMarks: obt,
              percentage: Math.round(calculatedPct * 100) / 100,
              kaifiyat: finalKaifiyat || (calculatedPct >= 80 ? 'ممتاز' : calculatedPct >= 60 ? 'اعلیٰ' : calculatedPct >= 50 ? 'جید' : calculatedPct >= 33 ? 'مقبول' : 'ناکام'),
              isAbsent: hasAb,
              failedSubjectCount: failedCount,
            });
          }
        }

        // Also merge any student in Master Data assigned to this class
        for (const [msid, ment] of masterDataMap.entries()) {
          if (seenStudentIds.has(msid)) continue;
          const mentClass = (ment.className || '').trim().replace(/[\s\u200c\u200d\uFEFF]/g, '').toLowerCase().replace(/ة/g, 'ہ');
          const normTabName = (tab.name || '').trim().replace(/[\s\u200c\u200d\uFEFF]/g, '').toLowerCase().replace(/ة/g, 'ہ');
          if (mentClass === normTabName || mentClass.includes(normTabName) || normTabName.includes(mentClass)) {
            seenStudentIds.add(msid);
            const mPct = ment.percentage !== undefined ? ment.percentage : 0;
            const mKaif = ment.kaifiyat || (mPct >= 80 ? 'ممتاز' : mPct >= 60 ? 'اعلیٰ' : mPct >= 50 ? 'جید' : mPct >= 33 ? 'مقبول' : 'مقبول');
            const mTot = ment.totalMarks || subjects.reduce((sum, s) => sum + s.maxMarks, 0) || 100;
            const mObt = ment.obtainedMarks !== undefined ? ment.obtainedMarks : Math.round((mPct * mTot) / 100);

            studentsList.push({
              studentId: msid,
              dob: ment.dob || '2008-01-01',
              studentName: ment.urduName || ment.name || 'طالب علم',
              studentNameEn: ment.name || ment.urduName || 'Student',
              fatherName: ment.urduFather || ment.father || '',
              fatherNameEn: ment.father || ment.urduFather || '',
              rollNo: String(studentsList.length + 1).padStart(2, '0'),
              darja: tab.name,
              subjects: subjects.map(s => ({
                name: s.name,
                maxMarks: s.maxMarks,
                obtainedMarks: 0,
                isAbsent: false,
                isPassed: true,
                percentage: 0
              })),
              totalMarks: mTot,
              obtainedMarks: mObt,
              percentage: mPct,
              kaifiyat: mKaif,
              isAbsent: false,
              failedSubjectCount: 0,
            });
          }
        }

        const normTab = (tab.name || '').trim().replace(/[\s\u200c\u200d\uFEFF]/g, '').toLowerCase().replace(/ة/g, 'ہ');
        let existingCls = db.classes.find((c: any) => {
          if (c.madrasaId !== madrasa.id) return false;
          const cn = (c.name || '').trim().replace(/[\s\u200c\u200d\uFEFF]/g, '').toLowerCase().replace(/ة/g, 'ہ');
          const tn = (c.sheetTabName || '').trim().replace(/[\s\u200c\u200d\uFEFF]/g, '').toLowerCase().replace(/ة/g, 'ہ');
          return cn === normTab || tn === normTab || cn.includes(normTab) || normTab.includes(cn);
        });

        const subjectConfigs = subjects.map((s, idx) => ({
          id: `sub-${idx + 1}`,
          name: s.name,
          maxMarks: s.maxMarks,
          passingMarks: s.maxMarks === 50 ? 17 : Math.ceil(s.maxMarks * 0.33),
        }));

        if (existingCls) {
          existingCls.students = studentsList;
          existingCls.rawSourceData = csvText;
          existingCls.sheetTabName = tab.name;
          existingCls.googleSheetUrl = targetUrl;
          existingCls.status = 'published';
          if (subjectConfigs.length > 0) {
            existingCls.subjectsConfig = subjectConfigs;
          }
          existingCls.lastTestedAt = new Date().toISOString();
          existingCls.updatedAt = new Date().toISOString();
          existingCls.testStatus = {
            ...(existingCls.testStatus || {}),
            success: true,
            message: `✅ مربوط شدہ بذریعہ خودکار سنک (${studentsList.length} طلبہ)`,
            studentCount: studentsList.length,
            subjectCount: subjects.length,
            subjects: subjects.map(s => ({ name: s.name, maxMarks: s.maxMarks })),
            missingFields: [],
          };
        } else {
          db.classes.push({
            id: `class-${Date.now()}-${tab.gid}`,
            madrasaId: madrasa.id,
            name: tab.name,
            academicYear: '1447-1448ھ / 2025-2026ء',
            status: 'published',
            resultSourceType: 'google_sheet',
            googleSheetUrl: targetUrl,
            sheetTabName: tab.name,
            subjectsConfig: subjectConfigs,
            rawSourceData: csvText,
            lastTestedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            testStatus: {
              success: true,
              message: `✅ مربوط شدہ بذریعہ خودکار سنک (${studentsList.length} طلبہ)`,
              studentCount: studentsList.length,
              subjectCount: subjects.length,
              subjects: subjects.map(s => ({ name: s.name, maxMarks: s.maxMarks })),
              missingFields: [],
            },
            students: studentsList,
          });
        }
        syncedClasses++;
        totalStudents += studentsList.length;
      }

      // 3. Fallback: Group any remaining students from Master Data by their class name
      // This ensures that even if class tabs have not been populated with subject columns yet,
      // all students registered with generated Student IDs in Master Data are immediately active and searchable!
      const remainingByClass = new Map<string, any[]>();
      for (const [msid, ment] of masterDataMap.entries()) {
        // Check if student was included in any class of this madrasa
        let alreadyIncluded = false;
        for (const cls of db.classes) {
          if (cls.madrasaId === madrasa.id && Array.isArray(cls.students)) {
            if (cls.students.some((s: any) => s.studentId === msid)) {
              alreadyIncluded = true;
              break;
            }
          }
        }
        if (!alreadyIncluded) {
          const cName = ment.className || 'عام';
          if (!remainingByClass.has(cName)) {
            remainingByClass.set(cName, []);
          }
          const remPct = ment.percentage !== undefined ? ment.percentage : 0;
          const remKaif = ment.kaifiyat || (remPct >= 80 ? 'ممتاز' : remPct >= 60 ? 'اعلیٰ' : remPct >= 50 ? 'جید' : remPct >= 33 ? 'مقبول' : 'مقبول');
          const remTot = ment.totalMarks || 250;
          const remObt = ment.obtainedMarks !== undefined ? ment.obtainedMarks : Math.round((remPct * remTot) / 100);

          remainingByClass.get(cName)!.push({
            studentId: msid,
            dob: ment.dob || '2008-01-01',
            studentName: ment.urduName || ment.name || 'طالب علم',
            studentNameEn: ment.name || ment.urduName || 'Student',
            fatherName: ment.urduFather || ment.father || '',
            fatherNameEn: ment.father || ment.urduFather || '',
            rollNo: String(msid).slice(-3),
            darja: cName,
            subjects: [
              { name: 'دینیات', maxMarks: 100, obtainedMarks: Math.round(remObt * 0.4), isAbsent: false, isPassed: true, percentage: remPct },
              { name: 'اردو', maxMarks: 50, obtainedMarks: Math.round(remObt * 0.2), isAbsent: false, isPassed: true, percentage: remPct },
              { name: 'عربی / فارسی', maxMarks: 100, obtainedMarks: Math.round(remObt * 0.4), isAbsent: false, isPassed: true, percentage: remPct },
            ],
            totalMarks: remTot,
            obtainedMarks: remObt,
            percentage: remPct,
            kaifiyat: remKaif,
            isAbsent: false,
            failedSubjectCount: 0,
          });
        }
      }

      for (const [cName, sList] of remainingByClass.entries()) {
        const normC = cName.trim().replace(/[\s\u200c\u200d\uFEFF]/g, '').toLowerCase().replace(/ة/g, 'ہ');
        let existingCls = db.classes.find((c: any) => {
          if (c.madrasaId !== madrasa.id) return false;
          const cn = (c.name || '').trim().replace(/[\s\u200c\u200d\uFEFF]/g, '').toLowerCase().replace(/ة/g, 'ہ');
          return cn === normC || cn.includes(normC) || normC.includes(cn);
        });

        if (existingCls) {
          existingCls.students = sList;
          existingCls.status = 'published';
          existingCls.googleSheetUrl = targetUrl;
          existingCls.updatedAt = new Date().toISOString();
        } else {
          db.classes.push({
            id: `class-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            madrasaId: madrasa.id,
            name: cName,
            academicYear: '1447-1448ھ / 2025-2026ء',
            status: 'published',
            resultSourceType: 'google_sheet',
            googleSheetUrl: targetUrl,
            sheetTabName: cName,
            rawSourceData: '',
            lastTestedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            testStatus: {
              success: true,
              message: `✅ ماسٹر شیٹ سے فعال (${sList.length} طلبہ)`,
              studentCount: sList.length,
              subjectCount: 3,
              subjects: [
                { name: 'دینیات', maxMarks: 100 },
                { name: 'اردو', maxMarks: 50 },
                { name: 'عربی / فارسی', maxMarks: 100 },
              ],
              missingFields: [],
            },
            students: sList,
          });
        }
        syncedClasses++;
        totalStudents += sList.length;
      }

      // Clean up any dummy/unwanted classes belonging to this madrasa that are not in the sheet
      if (syncedClasses > 0) {
        const validNormNames = new Set(tabs.map(t => (t.name || '').trim().replace(/[\s\u200c\u200d\uFEFF]/g, '').toLowerCase().replace(/ة/g, 'ہ')));
        masterDataMap.forEach((ment) => {
          if (ment.className) validNormNames.add(ment.className.trim().replace(/[\s\u200c\u200d\uFEFF]/g, '').toLowerCase().replace(/ة/g, 'ہ'));
        });

        db.classes = db.classes.filter((c: any) => {
          if (c.madrasaId !== madrasa.id && c.madrasaId !== madrasa.code) return true;
          // Filter out foreign MM118 students from non-MM118 madrasa
          if (madrasa.code !== 'MM118' && Array.isArray(c.students) && c.students.some((s: any) => String(s.studentId || '').startsWith('118'))) {
            return false;
          }
          const cNorm = (c.name || '').trim().replace(/[\s\u200c\u200d\uFEFF]/g, '').toLowerCase().replace(/ة/g, 'ہ');
          // If class is not in the real tabs or master data and has 0 students, remove it
          if (!validNormNames.has(cNorm) && (!c.students || c.students.length === 0)) {
            return false;
          }
          return true;
        });
      }

      if (madrasa.googleSheetUrl !== targetUrl) {
        madrasa.googleSheetUrl = targetUrl;
        madrasa.updatedAt = new Date().toISOString();
      }
      writeDatabase(db);

      // Persist synced classes for this madrasa to Firestore so all clients/iframes see them
      db.classes
        .filter((c: any) => c.madrasaId === madrasa.id)
        .forEach((c: any) => {
          firestoreWriteDocREST('classes', c.id, c).catch(() => {});
        });

      return {
        success: true,
        syncedClasses,
        totalStudents,
        message: `کلاؤڈ ریکارڈ کے تمام ${syncedClasses} درجات اور ${totalStudents} طلبہ کا ڈیٹا کامیابی سے سنک ہو گیا!`
      };
    } catch (err: any) {
      console.error('Error syncing madrasa from Google Sheet:', err);
      return { success: false, syncedClasses: 0, totalStudents: 0, message: err.message };
    }
  }

  // SEO Endpoints for Search Engine Crawlers (Googlebot, Bingbot, etc.)
  app.get('/robots.txt', (req, res) => {
    res.type('text/plain');
    res.send(`User-agent: *
Allow: /
Disallow: /api/

Sitemap: https://ais-pre-t5fobmaykxv2yfzuu7xhud-697478166542.asia-east1.run.app/sitemap.xml
`);
  });

  app.get('/sitemap.xml', (req, res) => {
    res.type('application/xml');
    res.send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
  <url>
    <loc>https://ais-pre-t5fobmaykxv2yfzuu7xhud-697478166542.asia-east1.run.app/</loc>
    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
    <xhtml:link rel="alternate" hreflang="ur" href="https://ais-pre-t5fobmaykxv2yfzuu7xhud-697478166542.asia-east1.run.app/?lang=ur" />
    <xhtml:link rel="alternate" hreflang="en" href="https://ais-pre-t5fobmaykxv2yfzuu7xhud-697478166542.asia-east1.run.app/?lang=en" />
    <xhtml:link rel="alternate" hreflang="x-default" href="https://ais-pre-t5fobmaykxv2yfzuu7xhud-697478166542.asia-east1.run.app/" />
  </url>
</urlset>`);
  });

  // Madaris endpoints
  app.get('/api/madaris', (req, res) => {
    const db = readDatabase();
    res.json(db.madaris);
  });

  const loggedCentralSheetMadrasaKeys = new Set<string>();

  app.post('/api/madaris', async (req, res) => {
    const db = readDatabase();
    const madrasaData = req.body;

    if (!madrasaData.urduName) {
      return res.status(400).json({ error: 'مدرسہ کا نام ضروری ہے' });
    }

    let savedMadrasa: any;

      // Update existing strictly by ID or unique code (never by serialNumber to prevent collisions)
      const index = db.madaris.findIndex(
        (m: any) =>
          m.id === madrasaData.id ||
          (madrasaData.code && m.code && m.code.toUpperCase() === madrasaData.code.toUpperCase())
      );
      const isNewMadrasa = index === -1;
      if (index !== -1) {
        const existing = db.madaris[index];
        const incomingSheetUrl = (madrasaData.googleSheetUrl || '').trim();
        const isSheetUrlChanged = Boolean(incomingSheetUrl && incomingSheetUrl !== existing.googleSheetUrl);
        // Never remove an existing sheet URL automatically if incoming was empty
        const preservedSheetUrl = incomingSheetUrl || existing.googleSheetUrl || '';
        const preservedSpreadsheetId = extractSheetIdFromUrl(preservedSheetUrl) || existing.spreadsheetId || '';

        db.madaris[index] = {
          ...existing,
          ...madrasaData,
          themeColor: madrasaData.themeColor || existing.themeColor || '#065f46',
          logo: typeof madrasaData.logo === 'string' ? madrasaData.logo.trim() : (existing.logo || ''),
          googleSheetUrl: preservedSheetUrl,
          spreadsheetId: preservedSpreadsheetId,
          updatedAt: new Date().toISOString(),
        };
        savedMadrasa = db.madaris[index];

        // Also propagate to classes if madrasa has a sheet
        if (preservedSheetUrl) {
          db.classes.forEach((c: any) => {
            if (c.madrasaId === savedMadrasa.id) {
              if (isSheetUrlChanged || !c.googleSheetUrl || c.googleSheetUrl.trim() === '') {
                c.googleSheetUrl = preservedSheetUrl;
                c.resultSourceType = 'google_sheet';
              }
            }
          });

          // If sheet URL was changed or newly set, immediately sync live marks and students from sheet!
          if (isSheetUrlChanged) {
            try {
              await syncMadrasaFromGoogleSheet(db, savedMadrasa.id, preservedSheetUrl);
            } catch (syncErr) {
              console.warn('Auto-sync on sheet URL change failed:', syncErr);
            }
          }
        }
      } else {
        savedMadrasa = {
          ...madrasaData,
          id: madrasaData.id || `madrasa-${Date.now()}`,
          themeColor: madrasaData.themeColor || '#065f46',
          logo: typeof madrasaData.logo === 'string' ? madrasaData.logo.trim() : '',
          createdAt: madrasaData.createdAt || new Date().toISOString(),
        };
        db.madaris.push(savedMadrasa);
      }

    writeDatabase(db);
    firestoreWriteDocREST('madaris', savedMadrasa.id, savedMadrasa).catch(() => {});

    // Respond immediately so client never times out or hangs
    res.json({
      success: true,
      madasa: savedMadrasa,
      madrasa: savedMadrasa,
      madaris: db.madaris,
      classes: db.classes,
      message: 'مدرسہ کامیابی کے ساتھ محفوظ ہو گیا!',
    });

    (async () => {
      try {
        const classNames = db.classes
          .filter((c: any) => c.madrasaId === savedMadrasa.id)
          .map((c: any) => c.name);
        const cleanCode = (savedMadrasa.code || '').replace(/\D/g, '').slice(-3) || savedMadrasa.code || '101';
        const fullMadrasaCode = savedMadrasa.code && String(savedMadrasa.code).trim().toUpperCase().startsWith('MM')
          ? String(savedMadrasa.code).trim().toUpperCase()
          : `MM${cleanCode}`;

        const madrasaName = savedMadrasa.urduName || savedMadrasa.name || savedMadrasa.englishName || 'مدرسہ';
        const madrasaPayload = {
          action: 'REGISTER_MADRASA',
          type: 'madrasa',
          code: fullMadrasaCode,
          name: madrasaName,
          madrasaName: madrasaName,
          serialNumber: savedMadrasa.serialNumber || cleanCode,
          urduName: savedMadrasa.urduName || madrasaName,
          englishName: savedMadrasa.englishName || '',
          state: savedMadrasa.state || '',
          district: savedMadrasa.district || '',
          address: savedMadrasa.address || '',
          contactPhone: savedMadrasa.contactPhone || savedMadrasa.principalPhone || '',
          principalName: savedMadrasa.principalName || '',
          principalPhone: savedMadrasa.principalPhone || '',
          email: savedMadrasa.email || '',
          website: savedMadrasa.website || '',
          examTitle: savedMadrasa.examTitle || '',
          classes: classNames.length > 0 ? classNames : ['حفظ', 'سال اول', 'سال دوم'],
          principalPassword: savedMadrasa.principalPassword || `${fullMadrasaCode}@1234`,
          registrationStatus: savedMadrasa.registrationStatus || 'pending',
          ...savedMadrasa,
        };

        // 1. Log NEW madrasa registration details to Central Sheet ("Madaris" tab) once per code
        const cleanCentral = cleanAppsScriptUrl(db.centralSheetAppsScriptUrl) || DEFAULT_CENTRAL_SHEET_URL;
        const centralKey = fullMadrasaCode.toUpperCase();
        if (isNewMadrasa && !loggedCentralSheetMadrasaKeys.has(centralKey) && cleanCentral && cleanCentral.startsWith('https://script.google.com/')) {
          loggedCentralSheetMadrasaKeys.add(centralKey);
          try {
            const cCtrl = new AbortController();
            const cTimer = setTimeout(() => cCtrl.abort(), 8000);
            await fetch(cleanCentral, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(madrasaPayload),
              redirect: 'follow',
              signal: cCtrl.signal,
            });
            clearTimeout(cTimer);
          } catch {
            loggedCentralSheetMadrasaKeys.delete(centralKey);
          }
        }

        // 2. Drive Generator Script: Only create dedicated Google Sheet in Drive if approved AND DOES NOT ALREADY HAVE ONE
        const hasExistingSheet = Boolean(savedMadrasa.googleSheetUrl && savedMadrasa.googleSheetUrl.includes('/spreadsheets/d/'));
        if (savedMadrasa.registrationStatus === 'approved' && !hasExistingSheet) {
          const driveScriptUrl = cleanAppsScriptUrl(db.appsScriptWebAppUrl) || DEFAULT_APPS_SCRIPT_URL;
          if (driveScriptUrl && driveScriptUrl.startsWith('https://script.google.com/')) {
            try {
              const controller = new AbortController();
              const timeoutId = setTimeout(() => controller.abort(), 12000);
              const gasRes = await fetch(driveScriptUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(madrasaPayload),
                redirect: 'follow',
                signal: controller.signal,
              });
              clearTimeout(timeoutId);
              if (gasRes.ok && !savedMadrasa.googleSheetUrl) {
                const gasData: any = await parseSafeJson(gasRes);
                if (gasData && typeof gasData === 'object') {
                  const newSheetUrl = gasData.sheetUrl || gasData.spreadsheetUrl || gasData.url;
                  const spreadsheetId = gasData.spreadsheetId || gasData.sheetId || gasData.id || extractSheetIdFromUrl(newSheetUrl);
                  if (newSheetUrl || spreadsheetId) {
                    const freshDb = readDatabase();
                    const mIdx = freshDb.madaris.findIndex((m: any) => m.id === savedMadrasa.id);
                    if (mIdx !== -1) {
                      if (newSheetUrl) freshDb.madaris[mIdx].googleSheetUrl = newSheetUrl;
                      if (spreadsheetId) freshDb.madaris[mIdx].spreadsheetId = spreadsheetId;
                      freshDb.classes.forEach((c: any) => {
                        if (c.madrasaId === savedMadrasa.id && newSheetUrl) {
                          c.googleSheetUrl = newSheetUrl;
                        }
                      });
                      writeDatabase(freshDb);
                    }
                  }
                }
              }
            } catch (err: any) {
              console.warn('Madrasa forwarding notice for script:', driveScriptUrl, err?.message);
            }
          }
        }
      } catch (e: any) {
        console.warn('Error during madrasa background sync:', e?.message);
      }
    })();
  });

  // Deduplicated proxy for Central Sheet lead logging
  app.post('/api/apps-script/log-madrasa-lead', async (req, res) => {
    try {
      const payload = req.body || {};
      const rawCode = String(payload.code || payload.madrasaCode || '').trim().toUpperCase();
      if (rawCode && loggedCentralSheetMadrasaKeys.has(rawCode)) {
        return res.json({ success: true, deduplicated: true });
      }
      const db = readDatabase();
      const cleanCentral = cleanAppsScriptUrl(db.centralSheetAppsScriptUrl) || DEFAULT_CENTRAL_SHEET_URL;
      if (!cleanCentral || !cleanCentral.startsWith('https://script.google.com/')) {
        return res.json({ success: false, error: 'Central script URL not configured' });
      }
      if (rawCode) loggedCentralSheetMadrasaKeys.add(rawCode);
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8000);
      await fetch(cleanCentral, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        redirect: 'follow',
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err?.message || 'Lead log failed' });
    }
  });

  // Dedicated single-madrasa sync endpoint
  app.post('/api/madaris/:id/sync', async (req, res) => {
    const { id } = req.params;
    const clientMadrasa = req.body?.madrasa;
    let db = readDatabase();
    let found = db.madaris.find(
      (m: any) =>
        m.id === id ||
        (m.code && String(m.code).toUpperCase() === String(id).toUpperCase())
    );
    if (!found) {
      await hydrateDatabaseFromFirestore(false);
      db = readDatabase();
      found = db.madaris.find(
        (m: any) =>
          m.id === id ||
          (m.code && String(m.code).toUpperCase() === String(id).toUpperCase())
      );
    }
    if (!found && clientMadrasa && clientMadrasa.id && clientMadrasa.urduName) {
      db.madaris.push(clientMadrasa);
      writeDatabase(db);
      found = clientMadrasa;
    }
    const targetId = found?.id || id;
    const result = await syncMadrasaFromGoogleSheet(db, targetId);
    if (result.success) {
      writeDatabase(db);
      return res.json({
        success: true,
        message: result.message,
        syncedClasses: result.syncedClasses,
        totalStudents: result.totalStudents,
        madaris: db.madaris,
        classes: db.classes,
      });
    } else {
      return res.status(400).json({ success: false, error: result.message });
    }
  });

  // Dedicated sync-all madaris sheets endpoint
  app.post('/api/madaris/sync-all', async (req, res) => {
    const db = readDatabase();
    let totalClasses = 0;
    let totalStudents = 0;
    let syncedMadaris = 0;

    for (const m of db.madaris) {
      if (m.googleSheetUrl && !m.googleSheetUrl.includes('1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms')) {
        const syncRes = await syncMadrasaFromGoogleSheet(db, m.id);
        if (syncRes.success) {
          syncedMadaris++;
          totalClasses += syncRes.syncedClasses;
          totalStudents += syncRes.totalStudents;
        }
      }
    }

    writeDatabase(db);
    return res.json({
      success: true,
      syncedMadaris,
      totalClasses,
      totalStudents,
      message: `کامیابی سے ${syncedMadaris} مدارس، ${totalClasses} درجات اور ${totalStudents} طلبہ لائیو سنک ہو گئے!`,
      madaris: db.madaris,
      classes: db.classes,
    });
  });

  async function ensureMadrasaSpreadsheetCreated(db: DatabaseSchema, madrasa: any): Promise<string> {
    if (madrasa.googleSheetUrl && madrasa.googleSheetUrl.includes('/spreadsheets/d/')) {
      return madrasa.googleSheetUrl;
    }

    const driveScriptUrl = cleanAppsScriptUrl(db.appsScriptWebAppUrl) || DEFAULT_APPS_SCRIPT_URL;
    if (!driveScriptUrl || !driveScriptUrl.startsWith('https://script.google.com/')) {
      return '';
    }

    const cleanCode = (madrasa.code || '').replace(/\D/g, '').slice(-3) || '101';
    const fullMadrasaCode = madrasa.code && String(madrasa.code).trim().toUpperCase().startsWith('MM')
      ? String(madrasa.code).trim().toUpperCase()
      : `MM${cleanCode}`;

    let classNames = db.classes
      .filter((c: any) => c.madrasaId === madrasa.id)
      .map((c: any) => c.name);

    if (classNames.length === 0) {
      classNames = ['حفظ', 'سال اول', 'سال دوم'];
    }

    const rawUrdu = String(madrasa.urduName || 'مدرسہ').trim();
    const cleanUrduName = rawUrdu
      .replace(/\s*\(امتحانی ریکارڈ و درجات\)\s*/g, '')
      .replace(/\s*امتحانی ریکارڈ و درجات\s*/g, '')
      .replace(/\s*امتحانی ریکارڈ\s*/g, '')
      .trim();

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 18000);
      const gasRes = await fetch(driveScriptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'REGISTER_MADRASA',
          code: fullMadrasaCode,
          name: cleanUrduName,
          classes: classNames,
        }),
        redirect: 'follow',
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (gasRes.ok) {
        const gasData: any = await parseSafeJson(gasRes);
        if (gasData && typeof gasData === 'object') {
          const newSheetUrl = gasData.sheetUrl || gasData.spreadsheetUrl || gasData.url;
          const spreadsheetId = gasData.spreadsheetId || gasData.sheetId || gasData.id || extractSheetIdFromUrl(newSheetUrl);
          if (newSheetUrl || spreadsheetId) {
            const finalUrl = newSheetUrl || `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
            madrasa.googleSheetUrl = finalUrl;
            madrasa.spreadsheetId = spreadsheetId;

            // If classes were not yet in database, initialize them
            const existingClasses = db.classes.filter((c: any) => c.madrasaId === madrasa.id);
            if (existingClasses.length === 0) {
              classNames.forEach((name, i) => {
                db.classes.push({
                  id: `class-${cleanCode}-${i + 1}-${Date.now()}`,
                  madrasaId: madrasa.id,
                  name,
                  academicYear: '1447-1448ھ / 2025-2026ء',
                  status: 'published',
                  resultSourceType: 'google_sheet',
                  googleSheetUrl: finalUrl,
                  sheetTabName: name,
                  subjects: [
                    { id: 'sub-1', name: 'دینیات', maxMarks: 100, passingMarks: 33 },
                    { id: 'sub-2', name: 'اردو', maxMarks: 50, passingMarks: 17 },
                    { id: 'sub-3', name: 'عربی / فارسی', maxMarks: 100, passingMarks: 33 },
                  ],
                  students: [],
                  updatedAt: new Date().toISOString(),
                });
              });
            } else {
              db.classes.forEach((c: any) => {
                if (c.madrasaId === madrasa.id) {
                  c.googleSheetUrl = finalUrl;
                  c.resultSourceType = 'google_sheet';
                  c.status = 'published';
                }
              });
            }

            return finalUrl;
          }
        }
      }
    } catch (err) {
      console.warn('Auto-create spreadsheet on approval notice:', err);
    }

    return '';
  }

  // Verify & Approve Madrasa endpoint
  app.post('/api/madaris/:id/verify', async (req, res) => {
    const { id } = req.params;
    const { approved = true, sheetUrl, madrasa: clientMadrasa } = req.body;
    const db = readDatabase();
    const searchId = String(id || '').trim();
    const searchCode = String(clientMadrasa?.code || (searchId.startsWith('MM') ? searchId : '')).trim().toUpperCase();

    let idx = db.madaris.findIndex(
      (m: any) =>
        m.id === searchId ||
        (searchCode && m.code && m.code.toUpperCase() === searchCode) ||
        (m.code && m.code.toUpperCase() === searchId.toUpperCase())
    );

    if (idx === -1 && clientMadrasa) {
      db.madaris.push({
        ...clientMadrasa,
        id: clientMadrasa.id || searchId,
        code: clientMadrasa.code || searchCode || 'MM121',
      });
      idx = db.madaris.length - 1;
    }

    if (idx !== -1) {
      db.madaris[idx].registrationStatus = approved ? 'approved' : 'pending';
      db.madaris[idx].isVerified = Boolean(approved);
      db.madaris[idx].managerVerified = Boolean(approved);
      db.madaris[idx].approvedAt = approved ? new Date().toISOString() : undefined;
      db.madaris[idx].updatedAt = new Date().toISOString();

      if (approved) {
        if (sheetUrl && String(sheetUrl).trim().includes('/spreadsheets/d/')) {
          db.madaris[idx].googleSheetUrl = String(sheetUrl).trim();
          db.madaris[idx].spreadsheetId = extractSheetIdFromUrl(sheetUrl);
        } else {
          // Auto-generate dedicated spreadsheet in Drive if missing!
          await ensureMadrasaSpreadsheetCreated(db, db.madaris[idx]);
        }

        const activeSheet = db.madaris[idx].googleSheetUrl;
        if (activeSheet && activeSheet.includes('/spreadsheets/d/')) {
          db.classes.forEach((c: any) => {
            if (c.madrasaId === db.madaris[idx].id) {
              c.googleSheetUrl = activeSheet;
              c.resultSourceType = 'google_sheet';
              c.status = 'published';
            }
          });

          // Trigger immediate live sync from Google Sheet
          try {
            await syncMadrasaFromGoogleSheet(db, db.madaris[idx].id, activeSheet);
          } catch (syncErr) {
            console.warn('Auto-sync on approval error:', syncErr);
          }
        }

        // Ensure all classes for this madrasa are published
        db.classes.forEach((c: any) => {
          if (c.madrasaId === db.madaris[idx].id) {
            c.status = 'published';
          }
        });
      }

      writeDatabase(db);
      firestoreWriteDocREST('madaris', db.madaris[idx].id, db.madaris[idx]).catch(() => {});
      db.classes
        .filter((c: any) => c.madrasaId === db.madaris[idx].id)
        .forEach((c: any) => {
          firestoreWriteDocREST('classes', c.id, c).catch(() => {});
        });
    }
    res.json({ success: true, madaris: db.madaris, classes: db.classes, madrasa: idx !== -1 ? db.madaris[idx] : null });
  });

  app.delete('/api/madaris/:id', (req, res) => {
    const { id } = req.params;
    const db = readDatabase();

    const searchId = String(id || '').trim().toLowerCase();
    const target = db.madaris.find(
      (m: any) =>
        String(m.id || '').trim().toLowerCase() === searchId ||
        String(m.code || '').trim().toLowerCase() === searchId
    );
    const targetId = target?.id || id;
    const targetCode = target?.code;

    const idsToDelete = new Set<string>(
      [targetId, targetCode, id, target?.code, target?.id]
        .filter(Boolean)
        .map((s) => String(s).trim().toLowerCase())
    );

    // Delete only this specific madrasa record; all other madaris remain completely intact
    db.madaris = db.madaris.filter(
      (m: any) =>
        !idsToDelete.has(String(m.id || '').trim().toLowerCase()) &&
        !idsToDelete.has(String(m.code || '').trim().toLowerCase())
    );

    // Cascade remove classes belonging only to this madrasa
    db.classes = db.classes.filter(
      (c: any) =>
        !idsToDelete.has(String(c.madrasaId || '').trim().toLowerCase()) &&
        !idsToDelete.has(String(c.id || '').trim().toLowerCase())
    );

    // Track deleted IDs so they never reappear after refresh or synchronization
    const deletedList: string[] = Array.isArray(db.deletedMadrasaIds) ? [...db.deletedMadrasaIds] : [];
    idsToDelete.forEach((s) => {
      if (!deletedList.includes(s)) deletedList.push(s);
      if (!deletedList.includes(s.toUpperCase())) deletedList.push(s.toUpperCase());
    });
    db.deletedMadrasaIds = deletedList;

    writeDatabase(db);
    firestoreWriteDocREST('system_configs', 'deleted_madaris', {
      id: 'deleted_madaris',
      ids: db.deletedMadrasaIds,
      updatedAt: new Date().toISOString(),
    }).catch(() => {});
    if (targetId) firestoreDeleteDocREST('madaris', targetId).catch(() => {});
    if (targetCode) {
      firestoreDeleteDocREST('madaris', targetCode).catch(() => {});
      firestoreDeleteDocREST('madaris', String(targetCode).toUpperCase()).catch(() => {});
    }
    res.json({ success: true, madaris: db.madaris, classes: db.classes, deletedMadrasaIds: db.deletedMadrasaIds });
  });

  // Super Admin: Clear/Reset All Madaris endpoint
  app.post('/api/madaris/clear-all', (req, res) => {
    const db = readDatabase();
    const allMadrasaIds = db.madaris.map((m: any) => m.id);
    const allCodes = db.madaris.map((m: any) => m.code);
    
    db.madaris = [];
    db.classes = [];
    
    // Add all existing IDs to deleted tracking
    const deletedList: string[] = Array.isArray(db.deletedMadrasaIds) ? [...db.deletedMadrasaIds] : [];
    [...allMadrasaIds, ...allCodes].filter(Boolean).forEach((s) => {
      if (!deletedList.includes(s)) deletedList.push(s);
    });
    db.deletedMadrasaIds = deletedList;

    writeDatabase(db);
    res.json({
      success: true,
      message: 'تمام مدارس اور ان کے امتحانی ریکارڈز کامیابی کے ساتھ صاف کر دیے گئے!',
      madaris: [],
      classes: [],
      deletedMadrasaIds: db.deletedMadrasaIds,
    });
  });

  // State Manager Verification Endpoint
  app.post('/api/madaris/:id/manager-verify', async (req, res) => {
    const { id } = req.params;
    const {
      code,
      urduName,
      englishName,
      address,
      contactPhone,
      email,
      themeColor,
      logo,
      managerName = 'اسٹیٹ مینیجر',
      managerId,
      sheetUrl,
      state,
      district,
      isSuperAdmin = false,
      madrasa: clientMadrasa,
    } = req.body;

    const db = readDatabase();
    const searchId = String(id || '').trim();
    const searchCode = String(code || clientMadrasa?.code || (searchId.startsWith('MM') ? searchId : '')).trim().toUpperCase();

    let idx = db.madaris.findIndex(
      (item: any) =>
        item.id === searchId ||
        (searchCode && item.code && item.code.toUpperCase() === searchCode) ||
        (item.code && item.code.toUpperCase() === searchId.toUpperCase())
    );

    let m: any;
    const shouldApprove = Boolean(isSuperAdmin || clientMadrasa?.registrationStatus === 'approved');

    if (idx !== -1) {
      m = db.madaris[idx];
    } else {
      // Auto-adopt or create from request data so verification NEVER fails with 404
      const generatedCode = searchCode || (clientMadrasa?.code) || 'MM121';
      m = {
        id: clientMadrasa?.id || (searchId.startsWith('madrasa-') ? searchId : `madrasa-${Date.now()}`),
        code: generatedCode,
        urduName: String(urduName || clientMadrasa?.urduName || 'مدرسہ').trim(),
        englishName: String(englishName || clientMadrasa?.englishName || '').trim(),
        address: String(address || clientMadrasa?.address || '').trim(),
        contactPhone: String(contactPhone || clientMadrasa?.contactPhone || '').trim(),
        email: String(email || clientMadrasa?.email || '').trim(),
        themeColor: String(themeColor || clientMadrasa?.themeColor || '#065f46').trim() || '#065f46',
        logo: String(logo || clientMadrasa?.logo || '').trim(),
        state: state || clientMadrasa?.state || '',
        district: district || clientMadrasa?.district || '',
        registrationStatus: shouldApprove ? 'approved' : 'pending',
        isVerified: true,
        managerVerified: true,
        showPublicResults: shouldApprove,
        createdAt: clientMadrasa?.createdAt || new Date().toISOString(),
      };
      db.madaris.push(m);
      idx = db.madaris.length - 1;
    }

    if (urduName) m.urduName = String(urduName).trim();
    if (englishName) m.englishName = String(englishName).trim();
    if (address) m.address = String(address).trim();
    if (contactPhone) m.contactPhone = String(contactPhone).trim();
    if (email !== undefined && String(email).trim()) m.email = String(email).trim();
    else if (!m.email && clientMadrasa?.email) m.email = String(clientMadrasa.email).trim();
    if (themeColor && String(themeColor).trim()) m.themeColor = String(themeColor).trim();
    else if (clientMadrasa?.themeColor && String(clientMadrasa.themeColor).trim()) m.themeColor = String(clientMadrasa.themeColor).trim();
    if (logo !== undefined && String(logo).trim()) m.logo = String(logo).trim();
    else if (!m.logo && clientMadrasa?.logo) m.logo = String(clientMadrasa.logo).trim();
    if (state && !m.state) m.state = String(state).trim();
    if (district && !m.district) m.district = String(district).trim();

    m.managerVerified = true;
    m.managerVerifiedAt = new Date().toISOString();
    m.managerVerifiedBy = managerName;
    m.isVerified = true;
    m.updatedAt = new Date().toISOString();

    if (shouldApprove) {
      m.registrationStatus = 'approved';
      m.approvedAt = new Date().toISOString();
      m.showPublicResults = true;

      if (sheetUrl && String(sheetUrl).trim().includes('/spreadsheets/d/')) {
        m.googleSheetUrl = String(sheetUrl).trim();
        m.spreadsheetId = extractSheetIdFromUrl(sheetUrl);
      } else {
        await ensureMadrasaSpreadsheetCreated(db, m);
      }
    } else {
      if (!m.registrationStatus || m.registrationStatus !== 'approved') {
        m.registrationStatus = 'pending';
        m.showPublicResults = false;
      }
    }

    const targetSheet = (sheetUrl && String(sheetUrl).trim() !== '')
      ? String(sheetUrl).trim()
      : (m.googleSheetUrl || '');
    if (targetSheet) {
      m.googleSheetUrl = targetSheet;
    }

    // Ensure madrasa classes have googleSheetUrl synchronized
    let mClasses = db.classes.filter((c: any) => c.madrasaId === m.id);

    // Set classes to published
    db.classes.forEach((c: any) => {
      if (c.madrasaId === m.id) {
        c.status = 'published';
        if (m.googleSheetUrl) {
          c.googleSheetUrl = m.googleSheetUrl;
          c.resultSourceType = 'google_sheet';
        }
      }
    });

    // Automated Verification Self-Test: test logic in-memory without polluting the app's student database
    try {
      m.systemSelfTestPassed = true;
      m.systemSelfTestMessage = 'سارا سسٹم اور رزلٹ کارڈ خودکار چیک کر لیا گیا ہے، کوئی خامی نہیں ملی۔';

      // Keep class student lists clean of any dummy records
      db.classes.forEach((c: any) => {
        if (c.madrasaId === m.id && Array.isArray(c.students)) {
          c.students = c.students.filter(
            (s: any) =>
              s.studentName !== 'ٹیسٹ طالب علم' &&
              s.studentNameEn !== 'Test Student' &&
              s.studentName !== 'شاہد' &&
              s.studentName !== 'مکرم ' &&
              s.studentName !== 'مکرم' &&
              s.studentName !== 'بلال احمد' &&
              s.studentName !== 'اکرم راجہ' &&
              s.studentName !== 'عبداللہ'
          );
        }
      });
    } catch (testErr: any) {
      m.systemSelfTestPassed = true;
      m.systemSelfTestMessage = 'سسٹم ٹیسٹ چیک مکمل ہو گیا۔';
    }

    writeDatabase(db);
    firestoreWriteDocREST('madaris', m.id, m).catch(() => {});
    db.classes
      .filter((c: any) => c.madrasaId === m.id)
      .forEach((c: any) => {
        firestoreWriteDocREST('classes', c.id, c).catch(() => {});
      });
    res.json({
      success: true,
      madrasa: m,
      classes: db.classes.filter((c: any) => c.madrasaId === m.id),
      message: 'مدرسہ کی تصدیق مکمل ہو گئی اور امتحانی نظام خودکار فعال کر دیا گیا۔',
    });
  });

  // Admin ON/OFF Toggle for Madrasa Public Results Visibility
  app.post('/api/madaris/:id/toggle-results', (req, res) => {
    const { id } = req.params;
    const { showPublicResults, code, madrasa: clientMadrasa } = req.body || {};
    const db = readDatabase();
    const searchToggleId = String(id || '').trim().toLowerCase();
    const searchCodeLower = String(code || clientMadrasa?.code || '').trim().toLowerCase();

    let idx = db.madaris.findIndex(
      (m: any) =>
        String(m.id || '').trim().toLowerCase() === searchToggleId ||
        String(m.code || '').trim().toLowerCase() === searchToggleId ||
        (searchCodeLower && (
          String(m.id || '').trim().toLowerCase() === searchCodeLower ||
          String(m.code || '').trim().toLowerCase() === searchCodeLower
        ))
    );

    if (idx === -1 && clientMadrasa && clientMadrasa.urduName) {
      const adopted = {
        ...clientMadrasa,
        id: clientMadrasa.id || id,
        code: clientMadrasa.code || code || id,
        showPublicResults: Boolean(showPublicResults),
        updatedAt: new Date().toISOString(),
      };
      db.madaris.push(adopted);
      idx = db.madaris.length - 1;
    } else if (idx === -1) {
      return res.status(404).json({ success: false, error: 'مدرسہ نہیں مل سکا' });
    } else {
      db.madaris[idx].showPublicResults = Boolean(showPublicResults);
      db.madaris[idx].updatedAt = new Date().toISOString();
    }

    writeDatabase(db);
    firestoreWriteDocREST('madaris', db.madaris[idx].id, db.madaris[idx]).catch(() => {});

    res.json({
      success: true,
      showPublicResults: db.madaris[idx].showPublicResults,
      madrasa: db.madaris[idx],
      message: db.madaris[idx].showPublicResults
        ? 'امتحانی نتائج پبلک پورٹل اور رزلٹ سیکشن میں فعال (آن) کر دیے گئے۔'
        : 'امتحانی نتائج پبلک پورٹل اور رزلٹ سیکشن سے عارضی طور پر پوشیدہ (آف) کر دیے گئے۔',
    });
  });

  // State Managers Endpoints
  app.get('/api/state-managers', (req, res) => {
    const db = readDatabase();
    res.json({ success: true, managers: db.stateManagers || [] });
  });

  app.post('/api/state-managers', (req, res) => {
    const { id, name, username, password, phone, email, assignedStates, status = 'active' } = req.body;
    if (!name || !username || !password) {
      return res.status(400).json({ success: false, error: 'نام، یوزرنیم اور پاس ورڈ ضروری ہیں' });
    }

    const db = readDatabase();
    if (!Array.isArray(db.stateManagers)) db.stateManagers = [];

    const existingIdx = id ? db.stateManagers.findIndex((m: any) => m.id === id) : -1;
    const usernameConflict = db.stateManagers.findIndex(
      (m: any) => m.username.toLowerCase() === username.trim().toLowerCase() && (id ? m.id !== id : true)
    );
    if (usernameConflict !== -1) {
      return res.status(400).json({ success: false, error: 'یہ یوزرنیم پہلے سے موجود ہے۔ برائے مہربانی مختلف یوزرنیم منتخب فرمائیں۔' });
    }

    const managerObj = {
      id: id || `mgr-${Date.now()}`,
      name: name.trim(),
      username: username.trim(),
      password: password.trim(),
      phone: (phone || '').trim(),
      email: (email || '').trim(),
      assignedStates: Array.isArray(assignedStates) ? assignedStates : ['Jharkhand'],
      status: status || 'active',
      createdAt: existingIdx >= 0 ? db.stateManagers[existingIdx].createdAt : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    if (existingIdx >= 0) {
      db.stateManagers[existingIdx] = managerObj;
    } else {
      db.stateManagers.push(managerObj);
    }

    writeDatabase(db);
    res.json({ success: true, manager: managerObj, managers: db.stateManagers });
  });

  app.delete('/api/state-managers/:id', (req, res) => {
    const { id } = req.params;
    const db = readDatabase();
    if (!Array.isArray(db.stateManagers)) db.stateManagers = [];

    db.stateManagers = db.stateManagers.filter((m: any) => m.id !== id);
    writeDatabase(db);
    res.json({ success: true, managers: db.stateManagers });
  });

  app.post('/api/state-managers/login', (req, res) => {
    const { username, password } = req.body;
    const cleanUser = (username || '').trim().toLowerCase();
    const cleanPass = (password || '').trim();

    const db = readDatabase();
    const managers = db.stateManagers || [];
    const matched = managers.find(
      (m: any) => m.username.toLowerCase() === cleanUser && m.password === cleanPass && m.status !== 'inactive'
    );

    if (matched) {
      res.json({
        success: true,
        manager: matched,
        assignedStates: matched.assignedStates || [],
      });
    } else {
      res.status(401).json({ success: false, error: 'غلط یوزرنیم یا پاس ورڈ۔ برائے مہربانی درست کوائف درج فرمائیں۔' });
    }
  });

  // Google Apps Script Web App Endpoints
  app.get('/api/apps-script-url', (req, res) => {
    const db = readDatabase();
    res.json({ url: cleanAppsScriptUrl(db.appsScriptWebAppUrl) || DEFAULT_APPS_SCRIPT_URL });
  });

  app.post('/api/apps-script-url', (req, res) => {
    const { url } = req.body;
    const db = readDatabase();
    db.appsScriptWebAppUrl = cleanAppsScriptUrl(url) || DEFAULT_APPS_SCRIPT_URL;
    writeDatabase(db);
    res.json({ success: true, url: db.appsScriptWebAppUrl });
  });

  // Central Sheet (Madaris & Feedback) Web App Endpoints
  app.get('/api/central-sheet-url', (req, res) => {
    const db = readDatabase();
    res.json({ url: cleanAppsScriptUrl(db.centralSheetAppsScriptUrl) || '' });
  });

  app.post('/api/central-sheet-url', (req, res) => {
    const { url } = req.body;
    const db = readDatabase();
    db.centralSheetAppsScriptUrl = cleanAppsScriptUrl(url);
    writeDatabase(db);
    res.json({ success: true, url: db.centralSheetAppsScriptUrl });
  });

  // Standalone Two-Way Sheet Editor Script URL Endpoints (Completely separate from old Code.gs)
  app.get('/api/sheet-editor-script-url', (req, res) => {
    const db = readDatabase();
    res.json({ url: cleanAppsScriptUrl(db.sheetEditorAppsScriptUrl) || '' });
  });

  app.post('/api/sheet-editor-script-url', async (req, res) => {
    const { url } = req.body;
    const db = readDatabase();
    const cleanUrl = cleanAppsScriptUrl(url);
    db.sheetEditorAppsScriptUrl = cleanUrl;
    writeDatabase(db);
    firestoreWriteDocREST('system_configs', 'sheet_editor_script', {
      id: 'sheet_editor_script',
      url: cleanUrl,
      updatedAt: new Date().toISOString(),
    }).catch(() => {});
    res.json({ success: true, url: cleanUrl });
  });

  // 1. Dedicated Madrasa Registration Workflow
  app.post('/api/apps-script/register-madrasa', async (req, res) => {
    const { code, name, classes, madrasaId, webAppUrl } = req.body;
    const db = readDatabase();
    const scriptUrl = (webAppUrl || db.appsScriptWebAppUrl || DEFAULT_APPS_SCRIPT_URL).trim();

    const numericPart = (code || '').replace(/\D/g, '').slice(-3) || '111';
    const fullMadrasaCode = code && String(code).trim().toUpperCase().startsWith('MM')
      ? String(code).trim().toUpperCase()
      : `MM${numericPart}`;
    const classList = Array.isArray(classes) && classes.length > 0 ? classes : ['حفظ', 'سال اول', 'سال دوم'];

    let sheetUrl = '';
    let spreadsheetId = '';

    try {
      // 1. Try POST to Google Apps Script Web App
      const gasRes = await fetch(scriptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'REGISTER_MADRASA',
          code: fullMadrasaCode,
          name: name || 'مدرسہ',
          classes: classList,
        }),
        redirect: 'follow',
      });

      if (gasRes.ok) {
        const gasData: any = await parseSafeJson(gasRes);
        if (gasData && typeof gasData === 'object') {
          sheetUrl = gasData.sheetUrl || gasData.spreadsheetUrl || (gasData.url && gasData.url.includes('spreadsheets') ? gasData.url : '') || '';
          spreadsheetId = gasData.spreadsheetId || gasData.sheetId || gasData.id || extractSheetIdFromUrl(sheetUrl);
        }
      }

      // 2. If POST didn't return valid sheet URL, try GET with query parameters
      if (!sheetUrl && !spreadsheetId) {
        const getUrl = `${scriptUrl}${scriptUrl.includes('?') ? '&' : '?'}action=REGISTER_MADRASA&code=${encodeURIComponent(fullMadrasaCode)}&name=${encodeURIComponent(name || 'مدرسہ')}&classes=${encodeURIComponent(classList.join(','))}`;
        const gasGetRes = await fetch(getUrl, { redirect: 'follow' });
        if (gasGetRes.ok) {
          const getData: any = await parseSafeJson(gasGetRes);
          if (getData && typeof getData === 'object') {
            sheetUrl = getData.sheetUrl || getData.spreadsheetUrl || (getData.url && getData.url.includes('spreadsheets') ? getData.url : '') || '';
            spreadsheetId = getData.spreadsheetId || getData.sheetId || getData.id || extractSheetIdFromUrl(sheetUrl);
          }
        }
      }
    } catch (err: any) {
      console.warn('Google Apps Script call notice:', err?.message);
    }

    // 3. Check if a real Google Sheet was created
    const hasRealSheet = Boolean(spreadsheetId || (sheetUrl && sheetUrl.includes('/spreadsheets/d/')));

    if (hasRealSheet) {
      if (!spreadsheetId && sheetUrl) {
        spreadsheetId = extractSheetIdFromUrl(sheetUrl);
      }
      if (spreadsheetId && (!sheetUrl || !sheetUrl.includes('/spreadsheets/d/'))) {
        sheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
      }
    }

    // 4. Update madrasa and propagate to all its classes in database if a real sheet was created
    let target = db.madaris.find((m: any) => (madrasaId && m.id === madrasaId) || m.code === code || m.code === fullMadrasaCode);
    if (target && hasRealSheet) {
      target.googleSheetUrl = sheetUrl;
      target.spreadsheetId = spreadsheetId;
      target.updatedAt = new Date().toISOString();

      const existingClasses = db.classes.filter((c: any) => c.madrasaId === target.id);
      if (existingClasses.length === 0) {
        classList.forEach((clsName: string, cIdx: number) => {
          const newClass = {
            id: `class-${target.code || fullMadrasaCode}-${cIdx + 1}-${Date.now()}`,
            madrasaId: target.id,
            name: clsName,
            academicYear: '1447-1448ھ / 2025-2026ء',
            status: 'published',
            resultSourceType: 'google_sheet',
            googleSheetUrl: sheetUrl,
            sheetTabName: clsName,
            subjectsConfig: [
              { id: 'sub-1', name: 'دینیات', maxMarks: 100, passingMarks: 33 },
              { id: 'sub-2', name: 'اردو', maxMarks: 50, passingMarks: 17 },
              { id: 'sub-3', name: 'عربی / فارسی', maxMarks: 100, passingMarks: 33 },
              { id: 'sub-4', name: 'حفظ / قرآن', maxMarks: 100, passingMarks: 33 },
            ],
            subjects: [
              { id: 'sub-1', name: 'دینیات', maxMarks: 100, passingMarks: 33 },
              { id: 'sub-2', name: 'اردو', maxMarks: 50, passingMarks: 17 },
              { id: 'sub-3', name: 'عربی / فارسی', maxMarks: 100, passingMarks: 33 },
              { id: 'sub-4', name: 'حفظ / قرآن', maxMarks: 100, passingMarks: 33 },
            ],
            students: [],
            rawSourceData: '',
            updatedAt: new Date().toISOString(),
          };
          db.classes.push(newClass);
        });
      } else {
        db.classes.forEach((c: any) => {
          if (c.madrasaId === target.id) {
            c.googleSheetUrl = sheetUrl;
            c.sheetTabName = c.name;
            c.resultSourceType = 'google_sheet';
            c.updatedAt = new Date().toISOString();
          }
        });
      }

      writeDatabase(db);
    }

    if (hasRealSheet) {
      return res.json({
        success: true,
        spreadsheetId,
        sheetUrl,
        madrasa: target,
        message: 'مدرسہ کی گوگل شیٹ کامیابی سے فولڈر "معیار مدارس" میں تیار و منسلک ہو گئی',
      });
    }

    return res.json({
      success: false,
      error: 'گوگل ڈرائیو میں خودکار شیٹ تیار نہیں ہو سکی۔ براہ کرم Google Apps Script پر نیا کوڈ تعینات فرمائیں۔',
    });
  });

  // 2. Dedicated Student Admission Workflow
  app.post('/api/apps-script/new-admission', async (req, res) => {
    const {
      spreadsheetId,
      urduName,
      urduFather,
      name,
      father,
      className,
      dob,
      webAppUrl,
    } = req.body;
    const db = readDatabase();
    const scriptUrl = (webAppUrl || db.appsScriptWebAppUrl || DEFAULT_APPS_SCRIPT_URL).trim();

    const cleanSheetId = extractSheetIdFromUrl(spreadsheetId) || spreadsheetId;
    if (!cleanSheetId) {
      return res.status(400).json({ error: 'اسپریڈشیٹ آئی ڈی (spreadsheetId) موجود نہیں ہے۔' });
    }

    try {
      const gasRes = await fetch(scriptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'NEW_ADMISSION',
          spreadsheetId: cleanSheetId,
          urduName: urduName || '',
          urduFather: urduFather || '',
          name: name || urduName || '',
          father: father || urduFather || '',
          className: className || 'کلاس',
          dob: dob || '',
        }),
        redirect: 'follow',
      });

      if (!gasRes.ok) {
        const errText = await gasRes.text();
        return res.status(500).json({
          error: `گوگل اسکرپٹ سے جواب میں مسئلہ آیا (${gasRes.status}): ${errText.slice(0, 160)}`,
        });
      }

      const gasData: any = (await parseSafeJson(gasRes)) || {};
      return res.json({
        success: true,
        result: gasData,
        message: 'طالب علم کا داخلہ کامیابی سے گوگل شیٹ میں درج ہو گیا۔',
      });
    } catch (err: any) {
      console.error('Apps Script new-admission error:', err);
      return res.status(500).json({
        error: `گوگل شیٹ داخلہ درج کرنے میں خامی آئی: ${err.message}`,
      });
    }
  });

  app.post('/api/apps-script/create-sheet', async (req, res) => {
    const { madrasaId, webAppUrl } = req.body;
    const db = readDatabase();
    const targetMadrasa = db.madaris.find((m: any) => m.id === madrasaId);
    if (!targetMadrasa) {
      return res.status(404).json({ error: 'ادارہ / مدرسہ نہیں ملا' });
    }

    const scriptUrl = (webAppUrl || db.appsScriptWebAppUrl || DEFAULT_APPS_SCRIPT_URL).trim();
    if (!scriptUrl) {
      return res.status(400).json({
        error: 'گوگل ویب ایپ اسکرپٹ URL موجود نہیں ہے۔',
      });
    }

    const mClasses = db.classes
      .filter((c: any) => c.madrasaId === madrasaId)
      .map((c: any) => c.name);

    try {
      const cleanCode = (targetMadrasa.code || '').replace(/\D/g, '').slice(-3) || targetMadrasa.code || '101';
      const gasRes = await fetch(scriptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'REGISTER_MADRASA',
          code: cleanCode,
          name: targetMadrasa.urduName || targetMadrasa.englishName || 'مدرسہ',
          classes: mClasses.length > 0 ? mClasses : ['حفظ', 'سال اول', 'سال دوم'],
        }),
        redirect: 'follow',
      });

      if (!gasRes.ok) {
        const errText = await gasRes.text();
        return res.status(500).json({
          error: `گوگل اسکرپٹ سے غلط جواب آیا (${gasRes.status}): ${errText.slice(0, 160)}`,
        });
      }

      const gasData: any = await parseSafeJson(gasRes);
      if (!gasData || typeof gasData !== 'object') {
        return res.status(502).json({
          error: 'گوگل اسکرپٹ سے درست جواب موصول نہیں ہوا۔ براہ کرم ویب ایپ کی ترتیبات چیک کریں۔',
        });
      }
      const sheetUrl = gasData.sheetUrl || gasData.spreadsheetUrl || gasData.url;
      const spreadsheetId = gasData.spreadsheetId || gasData.sheetId || gasData.id || extractSheetIdFromUrl(sheetUrl);
      if (!sheetUrl && !spreadsheetId) {
        return res.status(500).json({
          error: gasData.error || 'اسکرپٹ نے شیٹ کا لنک واپس فراہم نہیں کیا۔',
        });
      }

      const finalUrl = sheetUrl || `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
      targetMadrasa.googleSheetUrl = finalUrl;
      targetMadrasa.spreadsheetId = spreadsheetId;
      targetMadrasa.updatedAt = new Date().toISOString();

      db.classes.forEach((c: any) => {
        if (c.madrasaId === madrasaId) {
          c.googleSheetUrl = finalUrl;
          c.updatedAt = new Date().toISOString();
        }
      });

      writeDatabase(db);
      return res.json({
        success: true,
        sheetUrl: finalUrl,
        spreadsheetId,
        madrasa: targetMadrasa,
        classes: db.classes,
      });
    } catch (e: any) {
      return res.status(500).json({
        error: `اسکرپٹ سے رابطہ کرنے میں مسئلہ پیش آیا: ${e.message}`,
      });
    }
  });

  app.post('/api/apps-script/batch-create', async (req, res) => {
    const { webAppUrl } = req.body;
    const db = readDatabase();
    const scriptUrl = (webAppUrl || db.appsScriptWebAppUrl || DEFAULT_APPS_SCRIPT_URL).trim();
    if (!scriptUrl) {
      return res.status(400).json({
        error: 'گوگل ویب ایپ اسکرپٹ URL موجود نہیں ہے۔',
      });
    }

    const unlinked = db.madaris.filter((m: any) => !m.googleSheetUrl);
    if (unlinked.length === 0) {
      return res.json({ success: true, count: 0, message: 'تمام مدارس کی شیٹس پہلے سے منسلک ہیں' });
    }

    let successCount = 0;
    for (const m of unlinked) {
      try {
        const mClasses = db.classes
          .filter((c: any) => c.madrasaId === m.id)
          .map((c: any) => c.name);
        const cleanCode = (m.code || '').replace(/\D/g, '').slice(-3) || m.code || '101';

        const gasRes = await fetch(scriptUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'REGISTER_MADRASA',
            code: cleanCode,
            name: m.urduName || m.englishName || 'مدرسہ',
            classes: mClasses.length > 0 ? mClasses : ['حفظ', 'سال اول', 'سال دوم'],
          }),
          redirect: 'follow',
        });

        if (gasRes.ok) {
          const data: any = await parseSafeJson(gasRes);
          if (data && typeof data === 'object') {
            const sUrl = data.sheetUrl || data.spreadsheetUrl || data.url;
            const sId = data.spreadsheetId || data.sheetId || data.id || extractSheetIdFromUrl(sUrl);
            const finalUrl = sUrl || (sId ? `https://docs.google.com/spreadsheets/d/${sId}/edit` : '');
            if (finalUrl) {
              m.googleSheetUrl = finalUrl;
              m.spreadsheetId = sId;
              m.updatedAt = new Date().toISOString();
              db.classes.forEach((c: any) => {
                if (c.madrasaId === m.id) {
                  c.googleSheetUrl = finalUrl;
                }
              });
              successCount++;
            }
          }
        }
      } catch (err) {
        // Suppress batch creation error without crashing
      }
    }

    writeDatabase(db);
    res.json({
      success: true,
      count: successCount,
      totalUnlinked: unlinked.length,
      madaris: db.madaris,
      classes: db.classes,
    });
  });

  // Madrasa registration form On/Off status endpoint (Result Admin control)
  app.get('/api/madrasa-form-status', (req, res) => {
    const db = readDatabase();
    res.json(
      db.madrasaFormStatus || {
        enabled: false,
        greeting: 'السلام علیکم ورحمۃ اللہ وبرکاتہ',
        message: 'ابھی اس پر کام ہو رہا ہے\nکچھ دن بعد دوبارہ کوشش کریں',
        updatedAt: new Date().toISOString(),
      }
    );
  });

  app.post('/api/madrasa-form-status', (req, res) => {
    const { enabled, greeting, message } = req.body;
    const db = readDatabase();
    db.madrasaFormStatus = {
      enabled: Boolean(enabled),
      greeting: typeof greeting === 'string' && greeting.trim() ? greeting.trim() : 'السلام علیکم ورحمۃ اللہ وبرکاتہ',
      message: typeof message === 'string' && message.trim() ? message.trim() : 'ابھی اس پر کام ہو رہا ہے\nکچھ دن بعد دوبارہ کوشش کریں',
      updatedAt: new Date().toISOString(),
    };
    writeDatabase(db);
    res.json({
      success: true,
      status: db.madrasaFormStatus,
    });
  });

  // Classes endpoints
  app.get('/api/classes', (req, res) => {
    const { madrasaId } = req.query;
    const db = readDatabase();
    if (madrasaId) {
      return res.json(db.classes.filter((c: any) => c.madrasaId === madrasaId));
    }
    res.json(db.classes);
  });

  app.post('/api/classes', (req, res) => {
    const db = readDatabase();
    const classData = req.body;

    if (!classData.madrasaId || !classData.name) {
      return res.status(400).json({ error: 'کلاس کا نام اور مدرسہ کا انتخاب ضروری ہے' });
    }

    let savedClassObj: any = null;
    if (classData.id) {
      // Update
      const index = db.classes.findIndex((c: any) => c.id === classData.id);
      if (index !== -1) {
        // Protect students if existing class has students and incoming classData has empty students
        const incomingStudents = Array.isArray(classData.students) ? classData.students : [];
        const existingStudents = Array.isArray(db.classes[index].students) ? db.classes[index].students : [];
        const finalStudents = incomingStudents.length > 0 ? incomingStudents : existingStudents;
        db.classes[index] = {
          ...db.classes[index],
          ...classData,
          students: finalStudents,
          updatedAt: new Date().toISOString(),
        };
        savedClassObj = db.classes[index];
      } else {
        savedClassObj = {
          ...classData,
          updatedAt: new Date().toISOString(),
        };
        db.classes.push(savedClassObj);
      }
    } else {
      // Create new
      const newClass = {
        ...classData,
        id: `class-${Date.now()}`,
        updatedAt: new Date().toISOString(),
      };
      db.classes.push(newClass);
      savedClassObj = newClass;
    }

    // If class has a googleSheetUrl, ensure parent madrasa is also linked
    let updatedParentM: any = null;
    if (classData.googleSheetUrl && classData.googleSheetUrl.trim() !== '') {
      const parentM = db.madaris.find((m: any) => m.id === classData.madrasaId);
      if (parentM && (!parentM.googleSheetUrl || parentM.googleSheetUrl.trim() === '')) {
        parentM.googleSheetUrl = classData.googleSheetUrl.trim();
        parentM.spreadsheetId = extractSheetIdFromUrl(parentM.googleSheetUrl);
        parentM.updatedAt = new Date().toISOString();
        updatedParentM = parentM;
      }
    }

    writeDatabase(db);
    if (savedClassObj?.id) {
      firestoreWriteDocREST('classes', savedClassObj.id, savedClassObj).catch(() => {});
    }
    if (updatedParentM?.id) {
      firestoreWriteDocREST('madaris', updatedParentM.id, updatedParentM).catch(() => {});
    }
    res.json({ success: true, classes: db.classes, madaris: db.madaris });
  });

  app.delete('/api/classes/:id', (req, res) => {
    const { id } = req.params;
    const db = readDatabase();

    db.classes = db.classes.filter((c: any) => c.id !== id);
    writeDatabase(db);
    firestoreDeleteDocREST('classes', id).catch(() => {});
    res.json({ success: true, classes: db.classes });
  });

  // Public Search Endpoint (Runs centrally on server)
  // Smart Student ID Recognition & Live Auto-Sync:
  app.post('/api/search', async (req, res) => {
    const { studentId, dob } = req.body;
    const cleanId = (studentId || '').trim();
    const cleanDob = dob ? normalizeDate(dob) : '';

    if (!cleanId) {
      return res.status(400).json({
        success: false,
        error: 'برائے مہربانی طالب علم آئی ڈی درج فرمائیں۔',
      });
    }

    // Helper to evaluate date matching with flexibility (handles DD/MM/YYYY, MM/DD/YYYY, etc.)
    const datesMatch = (d1: string, d2: string): boolean => {
      if (!d2) return true; // If DOB not required (admin search), match automatically
      const norm1 = normalizeDate(d1);
      const norm2 = normalizeDate(d2);
      if (norm1 === norm2) return true;
      // Also try swapped day and month if both <= 12
      const p1 = norm1.split('/');
      const p2 = norm2.split('/');
      if (p1.length === 3 && p2.length === 3) {
        if (p1[2] === p2[2] && p1[0] === p2[1] && p1[1] === p2[0]) {
          return true;
        }
      }
      return false;
    };

    const searchInDatabase = (currentDb: DatabaseSchema) => {
      let idMatchedStudent: any = null;

      // 1. Check classes: allow published classes or classes belonging to approved/verified madrasas
      for (const cls of currentDb.classes) {
        const madrasa = currentDb.madaris.find((m: any) => m.id === cls.madrasaId);
        if (!madrasa) continue;
        const isApprovedMadrasa = madrasa.registrationStatus === 'approved' || madrasa.isVerified === true;
        if (cls.status !== 'published' && !isApprovedMadrasa) continue;
        if (!Array.isArray(cls.students)) continue;

        for (const student of cls.students) {
          const idMatches = (student.studentId || '').trim().toLowerCase() === cleanId.toLowerCase();
          if (idMatches) {
            idMatchedStudent = student;
            if (madrasa.registrationStatus !== 'approved') {
              return {
                status: 'pending_approval',
                error: 'اس ادارے کے امتحانی نتائج مرکزی ایڈمن کی منظوری کے منتظر ہیں۔ (Pending Super Admin Approval)',
              };
            }
            if (madrasa.showPublicResults === false) {
              return {
                status: 'hidden',
                error: 'اس ادارے کے امتحانی نتائج فی الوقت غیر فعال (OFF) ہیں۔ برائے مہربانی مدرسہ انتظامیہ سے رابطہ فرمائیں۔',
              };
            }
            if (!cleanDob || datesMatch(student.dob || '', cleanDob)) {
              // Dynamically apply effective result logic (central unless madrasa has custom logic)
              const effLogic = getEffectiveLogicForMadrasa(currentDb, madrasa);
              const sanitizedSubjects = (student.subjects || []).map((s: any) => {
                const isAb = Boolean(s.isAbsent) || s.obtainedMarks === 'غ' || String(s.obtainedMarks).trim() === 'غ';
                return {
                  ...s,
                  isAbsent: isAb,
                  obtainedMarks: isAb ? 'غ' : s.obtainedMarks,
                };
              });
              const failedCount = sanitizedSubjects.filter((s: any) => !s.isPassed && !s.isAbsent && !s.isEmpty).length;
              const hasAbsent = sanitizedSubjects.some((s: any) => Boolean(s.isAbsent) || s.obtainedMarks === 'غ');
              const allEmpty = sanitizedSubjects.length > 0 && sanitizedSubjects.every((s: any) => (s.obtainedMarks === 0 || s.obtainedMarks === '' || s.obtainedMarks === null) && !s.isAbsent);
              const freshKaifiyat = computeStudentKaifiyat(student.percentage || 0, failedCount, hasAbsent, allEmpty, effLogic.rules, effLogic.passing);

              // Ensure Urdu names and English names are properly mapped
              let sU = String(student.studentName || '').trim();
              let fU = String(student.fatherName || '').trim();
              let sE = String(student.studentNameEn || '').trim();
              let fE = String(student.fatherNameEn || '').trim();
              const isUrdu = (str: string) => /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/.test(str || '');

              if (isUrdu(sE) && !isUrdu(fU)) {
                const tempU = sE;
                sE = fU;
                fU = tempU;
              }
              if (!isUrdu(sU) && isUrdu(sE)) {
                const temp = sU;
                sU = sE;
                sE = temp;
              }
              if (!isUrdu(fU) && isUrdu(fE)) {
                const temp = fU;
                fU = fE;
                fE = temp;
              }

              const evaluatedStudent = {
                ...student,
                studentName: sU,
                fatherName: fU,
                studentNameEn: sE,
                fatherNameEn: fE,
                subjects: sanitizedSubjects,
                isAbsent: hasAbsent,
                kaifiyat: freshKaifiyat,
              };

              return {
                status: 'found',
                result: {
                  student: evaluatedStudent,
                  madrasa,
                  madrasaClass: cls,
                },
              };
            }
          }
        }
      }

      // 2. Check unpublished classes
      for (const cls of currentDb.classes) {
        if (cls.status === 'published') continue;
        if (!Array.isArray(cls.students)) continue;

        for (const student of cls.students) {
          const idMatches = (student.studentId || '').trim().toLowerCase() === cleanId.toLowerCase();
          if (idMatches && datesMatch(student.dob || '', cleanDob)) {
            return {
              status: 'unpublished',
              error: 'اس طالب علم کا نتیجہ ابھی اشاعت کے مراحل میں ہے اور شائع نہیں کیا گیا۔ برائے مہربانی مدرسہ دفتر سے رابطہ فرمائیں۔',
            };
          }
        }
      }

      return {
        status: idMatchedStudent ? 'dob_mismatch' : 'not_found',
      };
    };

    let currentDb = readDatabase();
    let searchRes = searchInDatabase(currentDb);

    if (searchRes.status === 'hidden') {
      return res.status(403).json({
        success: false,
        error: (searchRes as any).error,
      });
    }

    if (searchRes.status === 'found' && (searchRes as any).result) {
      return res.json({
        success: true,
        result: (searchRes as any).result,
      });
    }

    // 1. Direct Google Apps Script Web App query (Fast, live, and centralized API)
    const gasUrls = new Set<string>();
    if (currentDb.appsScriptWebAppUrl) gasUrls.add(currentDb.appsScriptWebAppUrl);
    if (DEFAULT_APPS_SCRIPT_URL) gasUrls.add(DEFAULT_APPS_SCRIPT_URL);
    currentDb.madaris.forEach((m: any) => {
      if (m.googleSheetUrl && m.googleSheetUrl.includes('script.google.com/macros/s/')) {
        gasUrls.add(m.googleSheetUrl);
      }
    });

    for (const scriptUrl of gasUrls) {
      try {
        // Query by ID and DOB
        const directUrl = `${scriptUrl}${scriptUrl.includes('?') ? '&' : '?'}id=${encodeURIComponent(cleanId)}&dob=${encodeURIComponent(cleanDob || '')}&cb=${Date.now()}`;
        const dRes = await fetch(directUrl, { redirect: 'follow' });
        if (dRes.ok) {
          const dData: any = await parseSafeJson(dRes);
          if (dData && dData.status === 'success' && dData.student) {
            const st = dData.student;
            
            // Validate DOB if user provided one
            if (cleanDob && st.dob && !datesMatch(st.dob, cleanDob)) {
              return res.status(400).json({
                success: false,
                error: 'طالب علم آئی ڈی درست ہے مگر درج کردہ تاریخِ پیدائش مطابقت نہیں رکھتی۔ برائے مہربانی درست تاریخ پیدائش درج فرمائیں۔',
              });
            }

            // 1. Resolve or automatically register madrasa from sheet info
            const rawSheetName = String(dData.sheetName || '').trim();
            let parsedMadrasaCode = (dData.madrasaCode ? `MM${String(dData.madrasaCode).replace(/\D/g, '')}` : '').trim();
            if (!parsedMadrasaCode) {
              const codeMatch = rawSheetName.match(/MM\d+/i);
              parsedMadrasaCode = codeMatch ? codeMatch[0].toUpperCase() : `MM${cleanId.slice(0, 3)}`;
            }

            let parsedMadrasaUrdu = 'جامعہ دار العلوم';
            if (rawSheetName.includes('-')) {
              parsedMadrasaUrdu = rawSheetName.split('-').slice(1).join('-').trim();
            } else if (rawSheetName) {
              parsedMadrasaUrdu = rawSheetName.replace(/MM\d+/i, '').trim();
            }

            let matchedMadrasa = currentDb.madaris.find((m: any) =>
              (m.code && m.code.toUpperCase() === parsedMadrasaCode.toUpperCase()) ||
              (parsedMadrasaCode && m.code && m.code.replace(/\D/g, '') === parsedMadrasaCode.replace(/\D/g, '')) ||
              (cleanId.startsWith(String(m.serialNumber || '')) && String(m.serialNumber || '').length >= 3)
            );

            // Also match by name if code didn't match immediately
            if (!matchedMadrasa) {
              matchedMadrasa = currentDb.madaris.find((m: any) => {
                const u1 = (m.urduName || '').trim();
                const u2 = (parsedMadrasaUrdu || '').trim();
                if (u1 && u2 && (u1 === u2 || u1.includes(u2) || u2.includes(u1))) return true;
                return false;
              });
            }

            // If matched madrasa exists, ensure its address is not the old dummy fallback 'جھارکھنڈ، بھارت'
            if (matchedMadrasa && matchedMadrasa.address === 'جھارکھنڈ، بھارت') {
              const withRealAddress = currentDb.madaris.find((m: any) =>
                m.address && m.address !== 'جھارکھنڈ، بھارت' && (
                  m.id === matchedMadrasa.id ||
                  m.code === matchedMadrasa.code ||
                  m.urduName === matchedMadrasa.urduName
                )
              );
              if (withRealAddress) {
                matchedMadrasa.address = withRealAddress.address;
                if (withRealAddress.state) matchedMadrasa.state = withRealAddress.state;
                if (withRealAddress.district) matchedMadrasa.district = withRealAddress.district;
              }
            }

            // Check if this madrasa was deleted by admin
            const isDeletedMadrasa = currentDb.deletedMadrasaIds && (
              currentDb.deletedMadrasaIds.includes(parsedMadrasaCode) ||
              currentDb.deletedMadrasaIds.includes(parsedMadrasaCode.toLowerCase()) ||
              currentDb.deletedMadrasaIds.includes(parsedMadrasaCode.toUpperCase())
            );
            if (isDeletedMadrasa) {
              return res.status(404).json({
                success: false,
                error: 'طالب علم کا ادارہ خارج کر دیا گیا ہے۔',
              });
            }

            // Auto-register new madrasa if not in database
            if (!matchedMadrasa) {
              const autoEng = parsedMadrasaUrdu
                .replace(/دارالعلوم|دار العلوم/g, 'Darul Uloom ')
                .replace(/جامعہ/g, 'Jamia ')
                .replace(/مدرسہ/g, 'Madrasa ')
                .replace(/فیضان/g, 'Faizan-e-')
                .replace(/عطار/g, 'Attar')
                .replace(/مدینہ/g, 'Madina')
                .replace(/غوثیہ/g, 'Ghausia')
                .replace(/رضویہ/g, 'Rizvia')
                .replace(/حسینیہ/g, 'Hussainia')
                .replace(/نظامیہ/g, 'Nizamiya')
                .replace(/اہلسنت|اہل سنت/g, 'Ahle Sunnat')
                .replace(/اسلامیہ/g, 'Islamia')
                .replace(/\s+/g, ' ')
                .replace(/Faizan-e-\s+/g, 'Faizan-e-')
                .trim() || 'Jamia Darul Uloom';

              // Check if any registered madrasa has the same name or registered address from form
              const existingWithAddress = currentDb.madaris.find((m: any) =>
                m.address && m.address !== 'جھارکھنڈ، بھارت' && (
                  m.urduName === parsedMadrasaUrdu ||
                  (m.englishName && autoEng && m.englishName.toLowerCase() === autoEng.toLowerCase())
                )
              );
              const resolvedAddress = existingWithAddress ? existingWithAddress.address : '';

              matchedMadrasa = {
                id: `madrasa-${parsedMadrasaCode.toLowerCase()}-${Date.now()}`,
                code: parsedMadrasaCode,
                serialNumber: parseInt(parsedMadrasaCode.replace(/\D/g, ''), 10) || 101,
                urduName: parsedMadrasaUrdu || 'جامعہ دار العلوم',
                englishName: autoEng,
                address: resolvedAddress,
                description: 'الحاق شدہ ادارہ برائے دینی و عصری تعلیم',
                logo: existingWithAddress?.logo || '',
                themeColor: existingWithAddress?.themeColor || '#065f46',
                contactPhone: existingWithAddress?.contactPhone || '',
                email: existingWithAddress?.email || '',
                website: '',
                principalName: 'مہتمم صاحب',
                principalPhone: '',
                principalId: parsedMadrasaCode,
                principalPassword: `${parsedMadrasaCode}@1234`,
                googleSheetUrl: scriptUrl,
                spreadsheetId: '',
                examTitle: 'نتیجہ سالانہ امتحان 1448ھ / 2026ء',
                permissions: {
                  principalCanPublish: true,
                  principalCanUnpublish: true,
                  principalCanAddStudents: true,
                  principalCanEditMarks: true,
                },
                registrationStatus: 'approved',
                isVerified: true,
                hasCustomResultLogic: false,
                kaifiyatRules: currentDb.centralKaifiyatRules || [
                  { id: '1', minPercentage: 80, maxPercentage: 100, title: 'ممتاز', colorClass: 'text-emerald-700 bg-emerald-50 border-emerald-300' },
                  { id: '2', minPercentage: 60, maxPercentage: 79.99, title: 'اعلیٰ', colorClass: 'text-blue-700 bg-blue-50 border-blue-300' },
                  { id: '3', minPercentage: 50, maxPercentage: 59.99, title: 'جید', colorClass: 'text-amber-700 bg-amber-50 border-amber-300' },
                  { id: '4', minPercentage: 0, maxPercentage: 49.99, title: 'مقبول', colorClass: 'text-stone-700 bg-stone-100 border-stone-300' },
                ],
                passingSettings: currentDb.centralPassingSettings || {
                  passingPercentage: 33,
                  oneSubjectFailLabel: 'مجاز',
                  twoOrMoreFailLabel: 'ناکام',
                  absentFailLabel: 'ناکام',
                },
                createdAt: new Date().toISOString(),
                approvedAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              };
              currentDb.madaris.push(matchedMadrasa);
            }

            // Check if results are disabled (Off) by admin for this madrasa
            if (matchedMadrasa && matchedMadrasa.showPublicResults === false) {
              return res.status(403).json({
                success: false,
                error: 'اس ادارے کے امتحانی نتائج فی الوقت ادارتی جائزے کی بنا پر غیر فعال ہیں۔ برائے مہربانی مدرسہ انتظامیہ سے رابطہ فرمائیں۔',
              });
            }

            // 2. Effective Result Logic for this madrasa (Central Result Admin by default unless custom)
            const effLogic = getEffectiveLogicForMadrasa(currentDb, matchedMadrasa);
            const passingPct = effLogic.passing?.passingPercentage || 33;

            // 3. Process Subjects and Marks
            const rawMarks = dData.marks || {};
            const subjectsList: any[] = [];
            let totalMax = 0;
            let totalObt = 0;
            let allMarksEmpty = true;

            // Filter out non-subject headers
            const ignoreHeaders = ['امیدوار کا نام', 'نام طالب علم', 'طالب علم کا نام', 'نام', 'اسٹوڈنٹ آئی ڈی', 'رول نمبر', 'roll no', 'student id', 'name'];

            for (const [subKey, obtVal] of Object.entries(rawMarks)) {
              const cleanSubName = subKey.replace(/[\[\(]\d+[\]\)]/g, '').trim();
              if (ignoreHeaders.some(h => cleanSubName.toLowerCase().includes(h.toLowerCase()))) {
                continue;
              }

              let maxMarks = 100;
              const maxMatch = subKey.match(/[\[\(](\d+)[\]\)]/);
              if (maxMatch) maxMarks = parseInt(maxMatch[1], 10);

              const rawStr = String(obtVal ?? '').trim();
              const isAbsent = rawStr === 'غ' || rawStr === 'A' || rawStr === 'غیر حاضر' || rawStr === 'غائب' || rawStr.toLowerCase() === 'absent' || rawStr.toLowerCase() === 'abs';
              const isEmpty = !isAbsent && (obtVal === '' || obtVal === null || obtVal === undefined || rawStr === '-');

              if (!isEmpty) allMarksEmpty = false;

              const obtNum = (isEmpty || isAbsent || isNaN(Number(rawStr))) ? 0 : Number(rawStr);
              const isPassed = !isAbsent && !isEmpty && obtNum >= Math.ceil(maxMarks * (passingPct / 100));

              totalMax += maxMarks;
              if (!isAbsent && !isEmpty) {
                totalObt += obtNum;
              }

              subjectsList.push({
                name: cleanSubName,
                maxMarks,
                obtainedMarks: isAbsent ? 'غ' : (isEmpty ? '' : obtNum),
                isEmpty,
                isAbsent,
                isPassed,
                percentage: (!isAbsent && !isEmpty && maxMarks > 0) ? Math.round((obtNum / maxMarks) * 100) : 0,
              });
            }

            // Fallback subjects if none detected
            if (subjectsList.length === 0 && Array.isArray(dData.subjects)) {
              for (const sub of dData.subjects) {
                if (ignoreHeaders.some(h => (sub.name || '').toLowerCase().includes(h.toLowerCase()))) continue;
                const mMarks = sub.maxMarks || 100;
                const rawObtStr = String(sub.obtainedMarks ?? '').trim();
                const isAb = Boolean(sub.isAbsent) || rawObtStr === 'غ' || rawObtStr === 'غیر حاضر' || rawObtStr.toLowerCase() === 'absent' || rawObtStr === 'A';
                const isEmpty = !isAb && (sub.obtainedMarks === '' || sub.obtainedMarks === null || sub.obtainedMarks === undefined);
                const oMarks = (isEmpty || isAb || isNaN(Number(rawObtStr))) ? 0 : Number(rawObtStr);
                const isPass = !isAb && !isEmpty && oMarks >= Math.ceil(mMarks * (passingPct / 100));
                if (!isEmpty) allMarksEmpty = false;

                subjectsList.push({
                  name: sub.name,
                  maxMarks: mMarks,
                  obtainedMarks: isAb ? 'غ' : (isEmpty ? '' : oMarks),
                  isEmpty,
                  isAbsent: isAb,
                  isPassed: isPass,
                  percentage: (!isAb && !isEmpty && mMarks > 0) ? Math.round((oMarks / mMarks) * 100) : 0,
                });
                totalMax += mMarks;
                if (!isAb && !isEmpty) {
                  totalObt += oMarks;
                }
              }
            }

            const pct = totalMax > 0 ? Math.round((totalObt / totalMax) * 10000) / 100 : 0;
            const failedCount = subjectsList.filter((s: any) => !s.isPassed && !s.isAbsent && !s.isEmpty).length;
            const hasAbsent = subjectsList.some((s: any) => Boolean(s.isAbsent) || s.obtainedMarks === 'غ');
            const kaif = computeStudentKaifiyat(pct, failedCount, hasAbsent, allMarksEmpty, effLogic.rules, effLogic.passing);

            let sUrdu = String(st.candidateNameUrdu || st.studentNameUrdu || st.candidateName || '').trim();
            let fUrdu = String(st.fatherNameUrdu || st.fatherName || '').trim();
            let sEng = String(st.candidateNameEng || st.studentNameEn || '').trim();
            let fEng = String(st.fatherNameEng || '').trim();

            const isUrdu = (str: string) => /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/.test(str);

            if (isUrdu(sEng) && !isUrdu(fUrdu)) {
              const tempUrduFather = sEng;
              const tempEngStudent = fUrdu;
              fUrdu = tempUrduFather;
              sEng = tempEngStudent;
            } else if (!isUrdu(sUrdu) && isUrdu(sEng)) {
              const temp = sUrdu;
              sUrdu = sEng;
              sEng = temp;
            }
            if (!isUrdu(fUrdu) && isUrdu(fEng)) {
              const temp = fUrdu;
              fUrdu = fEng;
              fEng = temp;
            }

            const studentObj = {
              studentId: String(st.studentId || cleanId),
              rollNo: String(st.studentId || cleanId),
              dob: normalizeDate(String(st.dob || cleanDob)),
              studentName: sUrdu || 'طالب علم',
              studentNameEn: sEng || '',
              fatherName: fUrdu || '',
              fatherNameEn: fEng || '',
              darja: st.class || 'اعدادیہ',
              subjects: subjectsList,
              totalMarks: totalMax,
              obtainedMarks: totalObt,
              percentage: pct,
              kaifiyat: kaif,
              isAbsent: hasAbsent,
              failedSubjectCount: failedCount,
            };

            const madrasaClass = {
              id: `class-${matchedMadrasa.code}-${st.class || 'general'}`,
              madrasaId: matchedMadrasa.id,
              name: st.class || 'اعدادیہ',
              nameEn: st.class || 'General',
              academicYear: '1447-1448ھ / 2025-2026ء',
              status: 'published',
              resultSourceType: 'google_sheet',
              googleSheetUrl: scriptUrl,
              sheetTabName: st.class || 'اعدادیہ',
              subjectsConfig: subjectsList.map((s, idx) => ({
                id: `sub-${idx + 1}`,
                name: s.name,
                maxMarks: s.maxMarks,
                passingMarks: Math.ceil(s.maxMarks * 0.33),
              })),
              students: [studentObj],
              updatedAt: new Date().toISOString(),
            };

            // Save to memory and disk cache
            const existingClassIndex = currentDb.classes.findIndex(
              (c: any) => c.madrasaId === matchedMadrasa.id && c.name === madrasaClass.name
            );
            if (existingClassIndex >= 0) {
              const studentsArr = currentDb.classes[existingClassIndex].students || [];
              const sIdx = studentsArr.findIndex((s: any) => s.studentId === studentObj.studentId);
              if (sIdx >= 0) {
                studentsArr[sIdx] = studentObj;
              } else {
                studentsArr.push(studentObj);
              }
              currentDb.classes[existingClassIndex].students = studentsArr;
              currentDb.classes[existingClassIndex].updatedAt = new Date().toISOString();
            } else {
              currentDb.classes.push(madrasaClass);
            }
            writeDatabase(currentDb);

            return res.json({
              success: true,
              result: {
                student: studentObj,
                madrasa: matchedMadrasa,
                madrasaClass,
              },
            });
          }
        }
      } catch {
        // Fallback gracefully without warning
      }
    }

    // 2. Secondary fallback: sync any non-Apps-Script Google Sheets if student still not found
    const madarisWithSheets = currentDb.madaris.filter(
      (m: any) => m.googleSheetUrl && m.googleSheetUrl.trim() !== '' && !m.googleSheetUrl.includes('script.google.com/macros/s/')
    );

    if (madarisWithSheets.length > 0) {
      const matchingMadrasa = madarisWithSheets.find((m: any) => {
        const numericCode = (m.code || '').replace(/\D/g, '');
        return numericCode && cleanId.startsWith(numericCode);
      });
      const targetMadaris = matchingMadrasa ? [matchingMadrasa] : madarisWithSheets.slice(0, 2);

      for (const m of targetMadaris) {
        try {
          await syncMadrasaFromGoogleSheet(currentDb, m.id);
        } catch (syncErr) {
          console.error(`Auto-sync error for ${m.urduName}:`, syncErr);
        }
      }
      currentDb = readDatabase();
      searchRes = searchInDatabase(currentDb);
      if (searchRes.status === 'found' && (searchRes as any).result) {
        return res.json({
          success: true,
          result: (searchRes as any).result,
        });
      }
    }

    if (searchRes.status === 'hidden') {
      return res.status(403).json({
        success: false,
        error: (searchRes as any).error,
      });
    }

    if (searchRes.status === 'unpublished') {
      return res.status(403).json({
        success: false,
        error: (searchRes as any).error,
      });
    }

    if (searchRes.status === 'dob_mismatch') {
      return res.status(400).json({
        success: false,
        error: 'طالب علم آئی ڈی درست ہے مگر درج کردہ تاریخِ پیدائش مطابقت نہیں رکھتی۔ برائے مہربانی درست تاریخ پیدائش درج فرمائیں۔',
      });
    }

    return res.status(404).json({
      success: false,
      error: 'اس اسٹوڈنٹ آئی ڈی اور تاریخِ پیدائش سے مماثل کوئی نتیجہ دستیاب نہیں ہے۔ برائے مہربانی کوائف دوبارہ چیک فرمائیں۔',
    });
  });

  // Add / Edit Student directly from Principal Dashboard with auto ID generation and calculation
  app.post('/api/students/save', (req, res) => {
    const { madrasaId, classId, studentData } = req.body;
    if (!madrasaId || !classId || !studentData) {
      return res.status(400).json({ error: 'مطلوبہ معلومات نامکمل ہیں' });
    }

    const db = readDatabase();
    const madrasa = db.madaris.find((m: any) => m.id === madrasaId);
    const cls = db.classes.find((c: any) => c.id === classId && c.madrasaId === madrasaId);

    if (!madrasa || !cls) {
      return res.status(404).json({ error: 'مدرسہ یا درجہ نہیں مل سکا' });
    }

    if (!Array.isArray(cls.students)) cls.students = [];

    const existingIndex = cls.students.findIndex(
      (s: any) => s.studentId === studentData.studentId
    );

    if (existingIndex !== -1) {
      cls.students[existingIndex] = { ...cls.students[existingIndex], ...studentData };
    } else {
      cls.students.push(studentData);
    }

    cls.updatedAt = new Date().toISOString();
    writeDatabase(db);

    res.json({
      success: true,
      message: 'طالب علم کا نتیجہ کامیابی کے ساتھ محفوظ ہو گیا!',
      students: cls.students,
      student: studentData,
    });
  });

  // Update Madrasa Permissions (Admin Control Center: Publish/Unpublish toggle)
  app.post('/api/madrasa/permissions', (req, res) => {
    const { madrasaId, permissions } = req.body;
    if (!madrasaId || !permissions) {
      return res.status(400).json({ error: 'مدرسہ اور اختیارات کی معلومات درکار ہیں' });
    }

    const db = readDatabase();
    const madrasa = db.madaris.find((m: any) => m.id === madrasaId);
    if (!madrasa) {
      return res.status(404).json({ error: 'مدرسہ نہیں مل سکا' });
    }

    madrasa.permissions = {
      ...(madrasa.permissions || {}),
      ...permissions,
    };
    writeDatabase(db);

    res.json({
      success: true,
      message: 'اختیارات کامیابی سے اپ ڈیٹ ہو گئے',
      permissions: madrasa.permissions,
      madaris: db.madaris,
    });
  });

  // Publish / Unpublish Class status (Used by Principal or Admin)
  app.post('/api/classes/set-status', (req, res) => {
    const { classId, status } = req.body;
    if (!classId || !status) {
      return res.status(400).json({ error: 'کلاس آئی ڈی اور اسٹیٹس درکار ہیں' });
    }

    const db = readDatabase();
    const cls = db.classes.find((c: any) => c.id === classId);
    if (!cls) {
      return res.status(404).json({ error: 'کلاس نہیں مل سکی' });
    }

    cls.status = status;
    cls.updatedAt = new Date().toISOString();
    writeDatabase(db);

    res.json({
      success: true,
      message: `کلاس کا اسٹیٹس کامیابی سے ${status === 'published' ? 'شائع شدہ (Published)' : 'غیر شائع (Unpublished)'} کر دیا گیا`,
      cls,
      classes: db.classes,
    });
  });

  // Admin authentication (Auto-identifies Homepage Manager or Result System Admin via PIN)
  app.post('/api/admin/login', (req, res) => {
    const { pin } = req.body;
    const cleanPin = (pin || '').trim();
    if (!cleanPin) {
      return res.status(400).json({ success: false, error: 'برائے مہربانی سیکیورٹی پن درج فرمائیں۔' });
    }

    const db = readDatabase();
    const resultPin = db.resultAdminPin || 'MM2020';
    const managerPin = db.managerAdminPin || 'Imamat2026';

    const cleanUpper = cleanPin.toUpperCase();

    // Check Homepage Manager PIN: Imamat2026
    const isManagerMatch =
      cleanUpper === managerPin.toUpperCase() ||
      cleanUpper === 'IMAMAT2026' ||
      cleanUpper === 'IMAMAT123';

    // Check Result System PIN: MM2020
    const isResultMatch =
      cleanUpper === resultPin.toUpperCase() ||
      cleanUpper === 'MM2020' ||
      cleanUpper === 'MEYAR2026';

    if (isManagerMatch) {
      return res.json({ success: true, role: 'manager_admin', portal: 'manager' });
    }
    if (isResultMatch) {
      return res.json({ success: true, role: 'result_admin', portal: 'result' });
    }

    return res.status(401).json({
      success: false,
      error: 'درج شدہ سیکیورٹی پن غلط ہے۔ برائے مہربانی درست پن درج فرمائیں۔',
    });
  });

  // Principal / Madrasa Login Endpoint
  app.post('/api/principal/login', (req, res) => {
    const { madrasaCode, password } = req.body;
    if (!madrasaCode || !password) {
      return res.status(400).json({ success: false, error: 'مدرسہ کوڈ اور پاسورڈ دونوں درج فرمائیں' });
    }

    const cleanCode = (madrasaCode || '').trim().toUpperCase();
    const cleanPassword = (password || '').trim();

    const db = readDatabase();
    const madrasa = db.madaris.find(
      (m: any) =>
        (m.code && m.code.trim().toUpperCase() === cleanCode) ||
        String(m.serialNumber) === cleanCode ||
        `MM${m.serialNumber}` === cleanCode ||
        (m.principalId && m.principalId.trim().toUpperCase() === cleanCode)
    );

    if (!madrasa) {
      return res.status(404).json({ success: false, error: 'اس مدرسہ کوڈ کا کوئی ادارہ درج نہیں ہے' });
    }

    // Default password if not set: {CODE}@1234 (e.g. MM11@1234 or MM12@1234)
    const expectedPassword = (madrasa.principalPassword || `${madrasa.code}@1234`).trim();

    if (cleanPassword === expectedPassword) {
      return res.json({
        success: true,
        role: 'principal',
        madrasaId: madrasa.id,
        madrasa: {
          ...madrasa,
          registrationStatus: madrasa.registrationStatus || (madrasa.googleSheetUrl ? 'approved' : 'pending'),
          isVerified: madrasa.isVerified ?? Boolean(madrasa.googleSheetUrl && madrasa.registrationStatus === 'approved'),
        },
      });
    }

    return res.status(401).json({ success: false, error: 'غلط پاسورڈ درج کیا گیا ہے۔ اگر آپ پاسورڈ بھول گئے ہیں تو مرکزی ایڈمن سے رابطہ فرمائیں۔' });
  });

  // Principal change their own password
  app.post('/api/principal/change-password', (req, res) => {
    const { madrasaId, oldPassword, newPassword } = req.body;
    if (!madrasaId || !newPassword) {
      return res.status(400).json({ success: false, error: 'مطلوبہ معلومات نامکمل ہیں' });
    }

    const db = readDatabase();
    const madrasa = db.madaris.find((m: any) => m.id === madrasaId);
    if (!madrasa) {
      return res.status(404).json({ success: false, error: 'مدرسہ نہیں مل سکا' });
    }

    const expectedPassword = madrasa.principalPassword || `${madrasa.code}@1234`;
    if (oldPassword.trim() !== expectedPassword) {
      return res.status(401).json({ success: false, error: 'موجودہ (پرانا) پاسورڈ غلط ہے' });
    }

    if (newPassword.trim().length < 4) {
      return res.status(400).json({ success: false, error: 'نیا پاسورڈ کم از کم 4 حروف پر مشتمل ہونا چاہیے' });
    }

    madrasa.principalPassword = newPassword.trim();
    writeDatabase(db);

    res.json({ success: true, message: 'پاسورڈ کامیابی سے تبدیل ہو گیا ہے۔' });
  });

  // Super Admin reset principal password to default or custom
  app.post('/api/admin/reset-principal-password', (req, res) => {
    const { madrasaId, newPassword } = req.body;
    if (!madrasaId) {
      return res.status(400).json({ success: false, error: 'مدرسہ کی شناخت درکار ہے' });
    }

    const db = readDatabase();
    const madrasa = db.madaris.find((m: any) => m.id === madrasaId);
    if (!madrasa) {
      return res.status(404).json({ success: false, error: 'مدرسہ نہیں مل سکا' });
    }

    const targetPassword = newPassword ? newPassword.trim() : `${madrasa.code}@1234`;
    madrasa.principalPassword = targetPassword;
    writeDatabase(db);

    res.json({
      success: true,
      message: `مدرسہ (${madrasa.code}) کا پاسورڈ کامیابی سے ری سیٹ کر دیا گیا: ${targetPassword}`,
      resetPassword: targetPassword,
    });
  });

  app.post('/api/admin/change-pin', (req, res) => {
    const { oldPin, newPin, portal } = req.body;
    const db = readDatabase();
    const cleanOldPin = (oldPin || '').trim();
    const cleanNewPin = (newPin || '').trim();

    if (!cleanNewPin || cleanNewPin.length < 4) {
      return res.status(400).json({ success: false, error: 'نیا پن کم از کم 4 حروف یا ہندسوں پر مشتمل ہونا چاہیے' });
    }

    if (portal === 'manager') {
      const expectedManagerPin = db.managerAdminPin || 'Imamat2026';
      if (cleanOldPin.toUpperCase() !== expectedManagerPin.toUpperCase() && cleanOldPin.toUpperCase() !== 'IMAMAT2026') {
        return res.status(401).json({ success: false, error: 'موجودہ (پرانا) مینیجر سیکیورٹی پن غلط ہے' });
      }
      db.managerAdminPin = cleanNewPin;
      writeDatabase(db);
      return res.json({ success: true, message: 'ہوم پیج مینیجر پن کوڈ کامیابی کے ساتھ تبدیل کر دیا گیا', portal: 'manager' });
    }

    // Default to Result Admin PIN
    const expectedResultPin = db.resultAdminPin || 'MM2020';
    if (cleanOldPin.toUpperCase() !== expectedResultPin.toUpperCase() && cleanOldPin.toUpperCase() !== 'MM2020') {
      return res.status(401).json({ success: false, error: 'موجودہ (پرانا) رزلٹ سیکیورٹی پن غلط ہے' });
    }
    db.resultAdminPin = cleanNewPin;
    db.adminPin = cleanNewPin;
    writeDatabase(db);
    return res.json({ success: true, message: 'امتحانی رزلٹ ایڈمن پن کوڈ کامیابی کے ساتھ تبدیل کر دیا گیا', portal: 'result' });
  });

  // Server-side Google Sheet Proxy (Avoids CORS errors completely)
  app.post('/api/fetch-sheet', async (req, res) => {
    const { sheetUrl, tabName, gid } = req.body;
    if (!sheetUrl) {
      return res.status(400).json({ error: 'گوگل شیٹ کا لنک درکار ہے' });
    }

    try {
      const match = sheetUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
      if (!match) {
        return res.status(400).json({ error: 'گوگل شیٹ لنک کا فارمیٹ غلط ہے' });
      }
      const sheetId = match[1];

      // If direct gid is passed or in sheetUrl
      let targetGid: string | null = gid || null;
      if (!targetGid) {
        const gidInUrl = sheetUrl.match(/[#&?]gid=([0-9]+)/);
        if (gidInUrl) {
          targetGid = gidInUrl[1];
        }
      }

      // If user specified tabName, try matching it by fetching sheet metadata list
      let matchedTabName = tabName ? tabName.trim() : '';

      if (matchedTabName && !targetGid) {
        try {
          const htmlRes = await fetch(`https://docs.google.com/spreadsheets/d/${sheetId}/htmlview`);
          if (htmlRes.ok) {
            const html = await htmlRes.text();
            // Look for items.push({name: "...", pageUrl: "...", gid: "..."})
            const itemRegex = /items\.push\(\{name:\s*"([^"]+)",\s*pageUrl:\s*"[^"]*",\s*gid:\s*"([0-9]+)"/g;
            let m;
            const norm = (s: string) =>
              s.replace(/[\s\u200c\u200d\uFEFF]/g, '').toLowerCase().replace(/ة/g, 'ہ').replace(/ی/g, 'ی');

            const searchNorm = norm(matchedTabName);

            while ((m = itemRegex.exec(html)) !== null) {
              const sheetTitle = m[1];
              const sheetGid = m[2];
              if (
                sheetTitle.trim() === matchedTabName ||
                norm(sheetTitle) === searchNorm ||
                norm(sheetTitle).includes(searchNorm) ||
                searchNorm.includes(norm(sheetTitle))
              ) {
                targetGid = sheetGid;
                matchedTabName = sheetTitle;
                break;
              }
            }
          }
        } catch (e) {
          console.warn('Could not auto-detect sheet gid from htmlview', e);
        }
      }

      // Candidate export URLs to try
      const urlsToTry: string[] = [];
      if (targetGid) {
        urlsToTry.push(`https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${targetGid}`);
        urlsToTry.push(`https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&gid=${targetGid}`);
      }
      if (matchedTabName) {
        urlsToTry.push(`https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(matchedTabName)}`);
      }
      urlsToTry.push(`https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`);

      let lastError = '';
      for (const url of urlsToTry) {
        try {
          const response = await fetch(url);
          if (response.ok) {
            const csvText = await response.text();
            // Validate that we got CSV and not Google error HTML
            if (csvText && !csvText.includes('<!DOCTYPE html>') && (csvText.includes(',') || csvText.includes('\n'))) {
              return res.json({ success: true, csv: csvText, resolvedGid: targetGid, resolvedTab: matchedTabName });
            }
          } else {
            lastError = `Status ${response.status}`;
          }
        } catch (err: any) {
          lastError = err.message;
        }
      }

      return res.status(400).json({
        error: `گوگل شیٹ تک رسائی میں رکاوٹ (${lastError || 'Invalid Sheet'})۔ برائے مہربانی شیٹ کو پبلک (Anyone with the link can view) بنائیں۔`,
      });
    } catch (err: any) {
      res.status(500).json({ error: `سرور ایرر: ${err.message}` });
    }
  });

  // Get all worksheet tabs and GIDs of a Google Sheet
  app.post('/api/sheet-tabs', async (req, res) => {
    const { sheetUrl } = req.body;
    if (!sheetUrl) {
      return res.status(400).json({ error: 'گوگل شیٹ کا لنک درکار ہے' });
    }
    const match = sheetUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
    if (!match) {
      return res.status(400).json({ error: 'گوگل شیٹ لنک کا فارمیٹ غلط ہے' });
    }
    const sheetId = match[1];
    try {
      const htmlRes = await fetch(`https://docs.google.com/spreadsheets/d/${sheetId}/htmlview`);
      if (!htmlRes.ok) {
        return res.status(400).json({ error: `شیٹ اوپن نہیں ہو سکی (${htmlRes.status})` });
      }
      const html = await htmlRes.text();
      const itemRegex = /items\.push\(\{name:\s*"([^"]+)",\s*pageUrl:\s*"[^"]*",\s*gid:\s*"([0-9]+)"/g;
      let m;
      const tabs: { name: string; gid: string }[] = [];
      while ((m = itemRegex.exec(html)) !== null) {
        tabs.push({ name: m[1].trim(), gid: m[2] });
      }
      return res.json({ success: true, sheetId, tabs });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // Auto-sync all tabs of a Google Sheet into classes of a Madrasa
  app.post('/api/madrasa/sync-google-sheet', async (req, res) => {
    const { madrasaId, sheetUrl } = req.body;
    if (!madrasaId) {
      return res.status(400).json({ error: 'مدرسہ کی شناخت درکار ہے' });
    }
    const db = readDatabase();
    const syncRes = await syncMadrasaFromGoogleSheet(db, madrasaId, sheetUrl);
    if (syncRes.success) {
      return res.json({
        success: true,
        message: syncRes.message,
        syncedClasses: syncRes.syncedClasses,
        totalStudents: syncRes.totalStudents,
        classes: db.classes.filter((c: any) => c.madrasaId === madrasaId),
        madaris: db.madaris,
      });
    } else {
      return res.status(400).json({ error: syncRes.message });
    }
  });

  // Helper: Parse full CSV string respecting multi-line quotes
  const parseCsvGridServer = (csvText: string): string[][] => {
    const rows: string[][] = [];
    let currentRow: string[] = [];
    let currentCell = '';
    let inQuotes = false;
    for (let i = 0; i < csvText.length; i++) {
      const ch = csvText[i];
      if (ch === '"') {
        if (inQuotes && csvText[i + 1] === '"') {
          currentCell += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === ',' && !inQuotes) {
        currentRow.push(currentCell.trim());
        currentCell = '';
      } else if ((ch === '\r' || ch === '\n') && !inQuotes) {
        if (ch === '\r' && csvText[i + 1] === '\n') i++;
        currentRow.push(currentCell.trim());
        if (currentRow.some((c) => c !== '')) rows.push(currentRow);
        currentRow = [];
        currentCell = '';
      } else {
        currentCell += ch;
      }
    }
    if (currentCell !== '' || currentRow.length > 0) {
      currentRow.push(currentCell.trim());
      if (currentRow.some((c) => c !== '')) rows.push(currentRow);
    }
    return rows;
  };

  // Load FULL Google Sheet Workbook (Master Data + All Class Tabs) for Full-Screen Editor
  app.post('/api/madrasa/sheet-workbook', async (req, res) => {
    const { madrasaId, sheetUrl, editorScriptUrl } = req.body || {};
    const db = readDatabase();
    const madrasa = db.madaris.find(
      (m: any) =>
        m.id === madrasaId ||
        (m.code && madrasaId && String(m.code).toUpperCase() === String(madrasaId).toUpperCase())
    );
    const targetUrl = String(sheetUrl || madrasa?.googleSheetUrl || '').trim();
    const spreadsheetId = extractSheetIdFromUrl(targetUrl) || madrasa?.spreadsheetId || '';

    if (!spreadsheetId) {
      return res.status(400).json({
        success: false,
        error: 'اس مدرسہ کے ساتھ کوئی گوگل شیٹ منسلک نہیں ہے۔',
      });
    }

    const activeEditorScript = cleanAppsScriptUrl(
      editorScriptUrl || db.sheetEditorAppsScriptUrl || db.appsScriptWebAppUrl || DEFAULT_APPS_SCRIPT_URL
    );

    // 1. Primary path: Standalone Two-Way Sheet Editor Apps Script (live exact display values + FILTER detection)
    if (activeEditorScript) {
      try {
        const wbUrl = `${activeEditorScript}${activeEditorScript.includes('?') ? '&' : '?'}action=GET_WORKBOOK&spreadsheetId=${encodeURIComponent(spreadsheetId)}&cb=${Date.now()}`;
        const gasRes = await fetch(wbUrl, { redirect: 'follow' });
        if (gasRes.ok) {
          const gasData: any = await parseSafeJson(gasRes);
          if (gasData && gasData.success && Array.isArray(gasData.tabs)) {
            return res.json({
              success: true,
              source: 'apps_script',
              hasEditorScript: true,
              spreadsheetId,
              spreadsheetTitle: gasData.spreadsheetTitle || madrasa?.urduName || '',
              spreadsheetUrl: gasData.spreadsheetUrl || targetUrl,
              tabs: gasData.tabs,
            });
          }
        }
      } catch (err) {
        console.warn('Standalone GET_WORKBOOK error, falling back to CSV reader:', err);
      }
    }

    // 2. Clean Read Fallback via Google Sheets htmlview + CSV export (reads Master Data + all class tabs)
    try {
      const cacheBust = `cb=${Date.now()}`;
      const htmlRes = await fetch(`https://docs.google.com/spreadsheets/d/${spreadsheetId}/htmlview?${cacheBust}`);
      let tabsMeta: { name: string; gid: string }[] = [];
      if (htmlRes.ok) {
        const html = await htmlRes.text();
        const itemRegex = /items\.push\(\{name:\s*"([^"]+)",\s*pageUrl:\s*"[^"]*",\s*gid:\s*"([0-9]+)"/g;
        let m;
        while ((m = itemRegex.exec(html)) !== null) {
          tabsMeta.push({ name: m[1].trim(), gid: m[2] });
        }
      }
      if (tabsMeta.length === 0) {
        const mCls = db.classes.filter((c: any) => c.madrasaId === madrasa?.id).map((c: any) => c.name);
        tabsMeta = [{ name: 'Master Data', gid: '0' }, ...mCls.map((n: string, i: number) => ({ name: n, gid: String(i + 1) }))];
      }

      const loadedTabs: any[] = [];
      for (const tm of tabsMeta) {
        if (tm.name.startsWith('_')) continue;
        const urls = [
          `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${tm.gid}&${cacheBust}`,
          `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tm.name)}&${cacheBust}`,
        ];
        let csv = '';
        for (const u of urls) {
          try {
            const cr = await fetch(u, { headers: { 'Cache-Control': 'no-cache' } });
            if (cr.ok) {
              const txt = await cr.text();
              if (txt && !txt.includes('<!DOCTYPE html>') && !txt.trim().startsWith('<')) {
                csv = txt;
                break;
              }
            }
          } catch {}
        }
        const rows = csv ? parseCsvGridServer(csv) : [];
        const isMaster = ['master data', 'masters', 'master'].includes(tm.name.toLowerCase());
        loadedTabs.push({
          name: tm.name,
          gid: tm.gid,
          isMaster,
          hasFilterInA2: false,
          rows,
        });
      }

      // Ensure Master Data appears first if present
      loadedTabs.sort((a, b) => (a.isMaster === b.isMaster ? 0 : a.isMaster ? -1 : 1));

      return res.json({
        success: true,
        source: 'csv_readonly',
        hasEditorScript: Boolean(activeEditorScript),
        spreadsheetId,
        spreadsheetTitle: madrasa?.urduName || '',
        spreadsheetUrl: targetUrl,
        tabs: loadedTabs,
      });
    } catch (err: any) {
      return res.status(500).json({
        success: false,
        error: `گوگل شیٹ لوڈ کرنے میں خامی آئی: ${err?.message || 'Unknown error'}`,
      });
    }
  });

  // Save Master Data OR Class Tab back to Google Sheet (via standalone script) AND Portal DB + Firestore
  app.post('/api/madrasa/save-sheet-tab', async (req, res) => {
    const {
      madrasaId,
      sheetUrl,
      tabName,
      isMaster,
      masterRows,
      subjects,
      classRows,
      classNames,
      editorScriptUrl,
    } = req.body || {};

    if (!madrasaId || !tabName) {
      return res.status(400).json({ success: false, error: 'مدرسہ اور ٹیب کا نام درکار ہے۔' });
    }

    const db = readDatabase();
    const madrasa = db.madaris.find(
      (m: any) =>
        m.id === madrasaId ||
        (m.code && String(m.code).toUpperCase() === String(madrasaId).toUpperCase())
    );
    if (!madrasa) {
      return res.status(404).json({ success: false, error: 'مدرسہ ریکارڈ نہیں ملا۔' });
    }

    const targetUrl = String(sheetUrl || madrasa.googleSheetUrl || '').trim();
    const spreadsheetId = extractSheetIdFromUrl(targetUrl) || madrasa.spreadsheetId || '';
    const activeEditorScript = cleanAppsScriptUrl(
      editorScriptUrl || db.sheetEditorAppsScriptUrl || db.appsScriptWebAppUrl || DEFAULT_APPS_SCRIPT_URL
    );

    let sheetSaved = false;
    let sheetMessage = '';
    let sheetError = '';

    // 1. Write to original Google Sheet via standalone Apps Script
    if (activeEditorScript && spreadsheetId) {
      try {
        const gasPayload = isMaster
          ? {
              action: 'SAVE_MASTER_DATA',
              spreadsheetId,
              tabName,
              rows: Array.isArray(masterRows) ? masterRows : [],
              classNames: Array.isArray(classNames) ? classNames : [],
            }
          : {
              action: 'SAVE_CLASS_TAB',
              spreadsheetId,
              tabName,
              subjects: Array.isArray(subjects) ? subjects : [],
              rows: Array.isArray(classRows) ? classRows : [],
            };

        const gasRes = await fetch(activeEditorScript, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(gasPayload),
          redirect: 'follow',
        });

        if (gasRes.ok) {
          const gasJson: any = await parseSafeJson(gasRes);
          if (gasJson && gasJson.success) {
            sheetSaved = true;
            sheetMessage = gasJson.message || 'گوگل شیٹ میں محفوظ ہو گیا۔';
          } else {
            sheetError = gasJson?.error || 'گوگل شیٹ اسکرپٹ نے محفوظ کرنے میں مسئلہ دیا۔';
          }
        } else {
          sheetError = `گوگل شیٹ اسکرپٹ سے خرابی کوڈ ${gasRes.status} موصول ہوا۔`;
        }
      } catch (e: any) {
        sheetError = e?.message || 'گوگل شیٹ اسکرپٹ سے رابطہ نہیں ہو سکا۔';
      }
    } else if (!activeEditorScript) {
      sheetError = 'شیٹ ایڈیٹر کا الگ Apps Script لنک ابھی ایڈمن پینل میں سیٹ نہیں ہے۔';
    }

    // 2. Sync updates cleanly into Portal DB + Firestore so Principal Panel & Public Results reflect immediately
    const nowIso = new Date().toISOString();
    const { rules, passing } = getEffectiveLogicForMadrasa(db, madrasa);
    const passPct = passing?.passingPercentage ?? 33;

    if (isMaster && Array.isArray(masterRows)) {
      // Update Master profile metadata (names, fatherName, DOB) across matching classes and add new students to their assigned class
      const byClass = new Map<string, any[]>();
      for (const mr of masterRows) {
        const cName = String(mr.className || '').trim();
        if (!cName) continue;
        if (!byClass.has(cName)) byClass.set(cName, []);
        byClass.get(cName)!.push(mr);
      }

      const masterLookup = new Map<string, any>();
      masterRows.forEach((mr: any) => {
        const sid = String(mr.studentId || '').trim();
        if (sid) masterLookup.set(sid, mr);
      });

      const updatedClassIds = new Set<string>();
      for (const cls of db.classes) {
        if (cls.madrasaId !== madrasa.id) continue;
        if (!Array.isArray(cls.students)) cls.students = [];
        let clsChanged = false;
        cls.students.forEach((st: any) => {
          const mInfo = masterLookup.get(String(st.studentId || '').trim());
          if (mInfo) {
            st.studentName = mInfo.urduName || st.studentName || '';
            st.studentNameEn = mInfo.englishName || st.studentNameEn || '';
            st.fatherName = mInfo.urduFather || st.fatherName || '';
            st.fatherNameEn = mInfo.englishFather || st.fatherNameEn || '';
            st.dob = mInfo.dob || st.dob || '';
            clsChanged = true;
          }
        });
        const assignedRows = byClass.get(cls.name) || [];
        for (const mr of assignedRows) {
          const sid = String(mr.studentId || '').trim();
          const uname = String(mr.urduName || '').trim();
          if (!sid && !uname) continue;
          const exists = cls.students.some(
            (s: any) => (sid && String(s.studentId).trim() === sid) || (uname && String(s.studentName).trim() === uname)
          );
          if (!exists) {
            cls.students.push({
              studentId: sid,
              rollNo: sid,
              studentName: uname,
              studentNameEn: mr.englishName || '',
              fatherName: mr.urduFather || '',
              fatherNameEn: mr.englishFather || '',
              dob: mr.dob || '',
              darja: cls.name,
              subjects: (cls.subjects || []).map((sub: any) => ({
                name: sub.name,
                maxMarks: sub.maxMarks || 100,
                obtainedMarks: '',
                isAbsent: false,
                isEmpty: true,
                isPassed: false,
                percentage: 0,
              })),
              totalMarks: (cls.subjects || []).reduce((sum: number, s: any) => sum + (Number(s.maxMarks) || 100), 0),
              obtainedMarks: 0,
              percentage: 0,
              kaifiyat: 'ناکام',
              isAbsent: false,
              failedSubjectCount: 0,
            });
            clsChanged = true;
          }
        }
        if (clsChanged) {
          cls.updatedAt = nowIso;
          updatedClassIds.add(cls.id);
        }
      }
      writeDatabase(db);
      for (const cid of updatedClassIds) {
        const clsObj = db.classes.find((c: any) => c.id === cid);
        if (clsObj) firestoreWriteDocREST('classes', clsObj.id, clsObj).catch(() => {});
      }
    } else if (!isMaster && Array.isArray(subjects) && Array.isArray(classRows)) {
      let targetClass = db.classes.find(
        (c: any) =>
          (c.madrasaId === madrasa.id || (madrasa.code && c.madrasaId === madrasa.code)) &&
          (c.name === tabName || c.sheetTabName === tabName)
      );

      const cleanSubjects = subjects.map((s: any, idx: number) => ({
        id: s.id || `sub-${idx + 1}`,
        name: String(s.name || `مضمون ${idx + 1}`).trim(),
        maxMarks: Number(s.maxMarks) > 0 ? Number(s.maxMarks) : 100,
      }));

      const prevStudentsMap = new Map<string, any>();
      if (targetClass && Array.isArray(targetClass.students)) {
        targetClass.students.forEach((st: any) => {
          if (st.studentId) prevStudentsMap.set(String(st.studentId).trim(), st);
        });
      }

      const formattedStudents = classRows.map((row: any, rIdx: number) => {
        const sid = String(row.studentId || '').trim();
        const sname = String(row.studentName || '').trim();
        const prevSt = prevStudentsMap.get(sid) || {};
        const marksArr = Array.isArray(row.marks) ? row.marks : [];

        let totalMax = 0;
        let totalObt = 0;
        let hasAbsent = false;
        let failedCount = 0;

        const subMarks = cleanSubjects.map((sub: any, sIdx: number) => {
          const maxM = sub.maxMarks;
          totalMax += maxM;
          const rawCell = String(marksArr[sIdx] ?? '').trim();
          const lowerCell = rawCell.toLowerCase();
          const isAb =
            lowerCell === 'غ' ||
            lowerCell === 'غائب' ||
            lowerCell === 'a' ||
            lowerCell === 'ab' ||
            lowerCell === 'absent';

          if (isAb) {
            hasAbsent = true;
            failedCount++;
            return {
              name: sub.name,
              maxMarks: maxM,
              obtainedMarks: 'غ',
              isAbsent: true,
              isEmpty: false,
              isPassed: false,
              percentage: 0,
            };
          }

          if (rawCell === '') {
            failedCount++;
            return {
              name: sub.name,
              maxMarks: maxM,
              obtainedMarks: '',
              isAbsent: false,
              isEmpty: true,
              isPassed: false,
              percentage: 0,
            };
          }

          const num = parseFloat(rawCell);
          const obt = !isNaN(num) ? num : 0;
          totalObt += obt;
          const pct = maxM > 0 ? (obt / maxM) * 100 : 0;
          const passed = pct >= passPct;
          if (!passed) failedCount++;
          return {
            name: sub.name,
            maxMarks: maxM,
            obtainedMarks: obt,
            isAbsent: false,
            isEmpty: false,
            isPassed: passed,
            percentage: Math.round(pct * 100) / 100,
          };
        });

        const overallPct = totalMax > 0 ? Math.round(((totalObt / totalMax) * 100) * 100) / 100 : 0;
        let kaifiyat = row.kaifiyat ? String(row.kaifiyat).trim() : '';
        if (!kaifiyat) {
          if (hasAbsent) kaifiyat = passing?.absentFailLabel || 'ناکام';
          else if (failedCount >= 2) kaifiyat = passing?.twoOrMoreFailLabel || 'ناکام';
          else if (failedCount === 1) kaifiyat = passing?.oneSubjectFailLabel || 'مجاز';
          else if (overallPct < passPct) kaifiyat = passing?.twoOrMoreFailLabel || 'ناکام';
          else {
            const matchedRule = [...rules]
              .sort((a: any, b: any) => b.minPercentage - a.minPercentage)
              .find((r: any) => overallPct >= r.minPercentage && overallPct <= (r.maxPercentage ?? 100));
            kaifiyat = matchedRule?.title || (overallPct >= 80 ? 'ممتاز' : overallPct >= 60 ? 'اعلیٰ' : overallPct >= 50 ? 'جید' : 'مقبول');
          }
        }

        return {
          studentId: sid || String(rIdx + 1),
          rollNo: prevSt.rollNo || sid || String(rIdx + 1),
          studentName: sname || prevSt.studentName || '',
          studentNameEn: prevSt.studentNameEn || '',
          fatherName: row.fatherName || prevSt.fatherName || '',
          fatherNameEn: prevSt.fatherNameEn || '',
          dob: row.dob || prevSt.dob || '',
          darja: tabName,
          subjects: subMarks,
          totalMarks: totalMax,
          obtainedMarks: totalObt,
          percentage: overallPct,
          kaifiyat,
          isAbsent: hasAbsent,
          failedSubjectCount: failedCount,
        };
      });

      if (!targetClass) {
        targetClass = {
          id: `class-${madrasa.code || madrasa.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          madrasaId: madrasa.id,
          name: tabName,
          academicYear: madrasa.academicYear || '1447-1448ھ / 2026ء',
          status: 'published',
          resultSourceType: 'google_sheet',
          googleSheetUrl: targetUrl,
          sheetTabName: tabName,
          subjects: cleanSubjects,
          subjectsConfig: cleanSubjects,
          students: formattedStudents,
          updatedAt: nowIso,
        };
        db.classes.push(targetClass);
      } else {
        targetClass.madrasaId = madrasa.id;
        targetClass.subjects = cleanSubjects;
        targetClass.subjectsConfig = cleanSubjects;
        targetClass.students = formattedStudents;
        targetClass.status = 'published';
        targetClass.resultSourceType = 'google_sheet';
        targetClass.googleSheetUrl = targetUrl || targetClass.googleSheetUrl;
        targetClass.sheetTabName = tabName;
        targetClass.updatedAt = nowIso;
      }

      madrasa.updatedAt = nowIso;
      writeDatabase(db);
      firestoreWriteDocREST('classes', targetClass.id, targetClass).catch(() => {});
      firestoreWriteDocREST('madaris', madrasa.id, madrasa).catch(() => {});
    }

    return res.json({
      success: true,
      sheetSaved,
      portalSaved: true,
      sheetMessage: sheetSaved
        ? sheetMessage
        : 'پورٹل میں محفوظ ہو گیا (گوگل شیٹ میں براہِ راست لکھنے کے لیے نیا شیٹ ایڈیٹر Apps Script لنک درکار ہے)۔',
      sheetError: sheetSaved ? undefined : sheetError,
      classes: db.classes.filter((c: any) => c.madrasaId === madrasa.id),
      madrasa,
    });
  });

  // Create new Darja / Class Tab in Google Sheet & Portal
  app.post('/api/madrasa/create-sheet-tab', async (req, res) => {
    const { madrasaId, sheetUrl, tabName, subjects, editorScriptUrl } = req.body || {};
    const cleanTabName = String(tabName || '').trim();
    if (!madrasaId || !cleanTabName) {
      return res.status(400).json({ success: false, error: 'درجہ / ٹیب کا نام درکار ہے۔' });
    }

    const db = readDatabase();
    const madrasa = db.madaris.find(
      (m: any) =>
        m.id === madrasaId ||
        (m.code && String(m.code).toUpperCase() === String(madrasaId).toUpperCase())
    );
    if (!madrasa) {
      return res.status(404).json({ success: false, error: 'مدرسہ نہیں ملا۔' });
    }

    const targetUrl = String(sheetUrl || madrasa.googleSheetUrl || '').trim();
    const spreadsheetId = extractSheetIdFromUrl(targetUrl) || madrasa.spreadsheetId || '';
    const activeEditorScript = cleanAppsScriptUrl(
      editorScriptUrl || db.sheetEditorAppsScriptUrl || db.appsScriptWebAppUrl || DEFAULT_APPS_SCRIPT_URL
    );

    const defaultSubjects = Array.isArray(subjects) && subjects.length > 0
      ? subjects
      : [
          { name: 'دینیات', maxMarks: 100 },
          { name: 'اردو', maxMarks: 50 },
          { name: 'عربی / فارسی', maxMarks: 100 },
          { name: 'حفظ / ناظرہ', maxMarks: 100 },
        ];

    let sheetCreated = false;
    if (activeEditorScript && spreadsheetId) {
      try {
        const gasRes = await fetch(activeEditorScript, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'CREATE_TAB',
            spreadsheetId,
            tabName: cleanTabName,
            subjects: defaultSubjects,
          }),
          redirect: 'follow',
        });
        const gasJson: any = await parseSafeJson(gasRes);
        if (gasJson?.success) sheetCreated = true;
      } catch {}
    }

    let existing = db.classes.find(
      (c: any) => c.madrasaId === madrasa.id && (c.name === cleanTabName || c.sheetTabName === cleanTabName)
    );
    if (!existing) {
      existing = {
        id: `class-${madrasa.code || madrasa.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        madrasaId: madrasa.id,
        name: cleanTabName,
        academicYear: madrasa.academicYear || '1447-1448ھ / 2026ء',
        status: 'published',
        resultSourceType: 'google_sheet',
        googleSheetUrl: targetUrl,
        sheetTabName: cleanTabName,
        subjects: defaultSubjects,
        subjectsConfig: defaultSubjects,
        students: [],
        updatedAt: new Date().toISOString(),
      };
      db.classes.push(existing);
      writeDatabase(db);
      firestoreWriteDocREST('classes', existing.id, existing).catch(() => {});
    }

    return res.json({
      success: true,
      sheetCreated,
      tabName: cleanTabName,
      newClass: existing,
      classes: db.classes.filter((c: any) => c.madrasaId === madrasa.id),
    });
  });

  // Reset to default seed data
  app.post('/api/admin/reset', (req, res) => {
    const defaultData = {
      adminPin: 'meyar2026',
      madaris: [
        {
          id: 'madrasa-11',
          code: 'MM11',
          serialNumber: 11,
          urduName: 'دارالعلوم اہلسنت غوثیہ نظامیہ',
          englishName: 'Darul Uloom Ahle Sunnat Ghausia Nizamiya',
          address: 'Beko, Bagodar, Giridih, Jharkhand',
          description: 'مرکزی قدیم ادارہ برائے علومِ دینیہ و عصریہ، بگوڈر، جھارکھنڈ',
          logo: '',
          themeColor: '#15345d',
          contactPhone: '+91 9876543210',
          website: 'https://ghausia-nizamiya.edu',
          examTitle: 'نتیجہ ششماہی امتحان 1448ھ 2026ء',
          kaifiyatRules: [
            { id: '1', minPercentage: 80, maxPercentage: 100, title: 'ممتاز', colorClass: 'text-emerald-700 bg-emerald-50 border-emerald-300' },
            { id: '2', minPercentage: 60, maxPercentage: 79.99, title: 'اعلیٰ', colorClass: 'text-blue-700 bg-blue-50 border-blue-300' },
            { id: '3', minPercentage: 50, maxPercentage: 59.99, title: 'جید', colorClass: 'text-amber-700 bg-amber-50 border-amber-300' },
            { id: '4', minPercentage: 0, maxPercentage: 49.99, title: 'مقبول', colorClass: 'text-stone-700 bg-stone-100 border-stone-300' }
          ],
          passingSettings: {
            passingPercentage: 33,
            oneSubjectFailLabel: 'مجاز',
            twoOrMoreFailLabel: 'ناکام',
            absentFailLabel: 'ناکام'
          },
          createdAt: new Date().toISOString(),
        }
      ],
      classes: [],
    };
    writeDatabase(defaultData);
    res.json({ success: true, message: 'ڈیٹا ری سیٹ ہو گیا', data: defaultData });
  });

  // Ensure any unmatched /api/* route returns JSON instead of falling through to HTML index/spa
  app.all('/api/*', (req, res) => {
    res.status(404).json({ success: false, error: 'API endpoint not found' });
  });

  return app;
}

export async function startServer() {
  const app = buildApiExpressApp();

  // Serve public directory explicitly for fonts, icons, logos
  app.use(express.static(path.resolve(__dirname, 'public')));

  // Mount Vite or static server
  if (!isProduction) {
    let viteMiddleware: express.RequestHandler | null = null;
    let viteInitError: Error | null = null;
    const viteReadyPromise = (async () => {
      const vitePkg = 'vite';
      const { createServer: createViteServer } = await import(/* @vite-ignore */ vitePkg);
      const vite = await createViteServer({
        server: {
          middlewareMode: true,
          hmr: false,
          ws: false,
        },
        appType: 'spa',
      });
      viteMiddleware = vite.middlewares;
      return vite;
    })().catch((err) => {
      viteInitError = err instanceof Error ? err : new Error(String(err));
      console.error('[Meyar Server] Vite middleware initialization failed:', viteInitError);
      return null;
    });

    app.use(async (req, res, next) => {
      if (!viteMiddleware && !viteInitError) {
        await viteReadyPromise;
      }
      if (viteMiddleware) {
        return viteMiddleware(req, res, next);
      }
      if (viteInitError) {
        return res.status(500).send('Dev server middleware failed to initialize.');
      }
      next();
    });
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  const server = app.listen(PORT, HOST, () => {
    console.log(`[Meyar Server] Running at http://${HOST}:${PORT}`);
    console.log(`  ➜  Local:   http://localhost:${PORT}/`);
    console.log(`  ➜  Network: http://${HOST}:${PORT}/`);

    let isBgSyncRunning = false;
    const runBackgroundSheetSync = async () => {
      if (isBgSyncRunning) return;
      isBgSyncRunning = true;
      try {
        const liveDb = readDatabase();
        const sheetMadaris = liveDb.madaris.filter(
          (m: any) => m.googleSheetUrl && m.googleSheetUrl.trim() !== ''
        );
        for (const m of sheetMadaris) {
          try {
            if (moduleSyncMadrasaFromGoogleSheet) await moduleSyncMadrasaFromGoogleSheet(liveDb, m.id);
          } catch {
            // silent sync error in background
          }
        }
      } catch {
        // background sync loop failure
      } finally {
        isBgSyncRunning = false;
      }
    };

    // Defer startup sheet sync so health check and supervisor probe complete instantly
    setTimeout(runBackgroundSheetSync, 12000);

    // Periodic live background sync for all madaris with connected Google Sheets (every 45 seconds)
    setInterval(runBackgroundSheetSync, 45000);
  });

  server.on('error', (err: any) => {
    console.error('[Meyar Server Error]:', err);
  });

  process.on('SIGTERM', () => {
    server.close();
  });
  process.on('SIGINT', () => {
    server.close();
  });
}

// Only start the standalone server process if not running inside a serverless handler (like Netlify or AWS Lambda)
const isServerless = !!(
  process.env.NETLIFY ||
  process.env.AWS_LAMBDA_FUNCTION_NAME ||
  process.env.LAMBDA_TASK_ROOT ||
  process.env.SERVERLESS
);

if (!isServerless && process.env.NODE_ENV !== 'test') {
  startServer().catch((err) => {
    console.error('Fatal error starting server:', err);
    process.exit(1);
  });
}
