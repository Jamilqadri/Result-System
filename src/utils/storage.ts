/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Madrasa, MadrasaClass, SearchResultMatch, KaifiyatRule, PassingSettings, StateManager, FeedbackSubmission, StudentResult, PortalLaunchTimer } from '../types';
import {
  normalizeDate,
  calculateStudentKaifiyat,
  parseSheetData,
  recalculateStudentResult,
  getSubjectPassingMarks,
  isNonSubjectHeader,
  isAbsentCell,
} from './sheetParser';
import {
  db,
  isFirestoreQuotaExceeded,
  markFirestoreQuotaError,
  handleFirestoreError,
  OperationType,
  ensureFirestoreConnectionTested,
} from '../firebase';
import { collection, doc, setDoc, getDoc, getDocs, deleteDoc, query, where, onSnapshot } from 'firebase/firestore';
import { DEFAULT_APPS_SCRIPT_URL, DEFAULT_CENTRAL_SHEET_URL, STORAGE_KEY_SHEET_EDITOR_SCRIPT_URL, extractSpreadsheetId, sanitizeAppsScriptUrl, registerMadrasaWorkflow } from '../services/appsScriptService';
import { cleanInstitutionName, ensureUrduName } from './transliterate';

/**
 * Safely fetches and parses JSON, preventing 'Unexpected token <' errors when
 * deployed on static hosts like Netlify that return HTML on 404 or missing serverless routes.
 */
export async function fetchSafeJson<T = any>(url: string, init?: RequestInit): Promise<{ ok: boolean; data: T | null; status: number }> {
  try {
    const res = await fetch(url, init);
    const contentType = res.headers.get('content-type') || '';
    if (!res.ok || !contentType.includes('application/json')) {
      return { ok: false, data: null, status: res.status };
    }
    const data = await res.json();
    return { ok: true, data, status: res.status };
  } catch {
    return { ok: false, data: null, status: 0 };
  }
}

const STORAGE_KEY_MADARIS = 'meyar_madaris_list_v2';
const STORAGE_KEY_CLASSES = 'meyar_classes_list_v2';
const STORAGE_KEY_ADMIN_PIN = 'meyar_admin_pin_v1';

export const DEFAULT_ADMIN_PIN = 'MM2020';
export const DEFAULT_RESULT_ADMIN_PIN = 'MM2020';
export const DEFAULT_MANAGER_ADMIN_PIN = 'Imamat2026';
export const STORAGE_KEY_RESULT_ADMIN_PIN = 'meyar_result_admin_pin_v2';
export const STORAGE_KEY_MANAGER_ADMIN_PIN = 'imamat_manager_admin_pin_v2';

export const DEFAULT_KAIFIYAT_RULES: KaifiyatRule[] = [
  { id: '1', minPercentage: 80, maxPercentage: 100, title: 'ممتاز', colorClass: 'text-emerald-700 bg-emerald-50 border-emerald-300' },
  { id: '2', minPercentage: 60, maxPercentage: 79.99, title: 'اعلیٰ', colorClass: 'text-blue-700 bg-blue-50 border-blue-300' },
  { id: '3', minPercentage: 50, maxPercentage: 59.99, title: 'جید', colorClass: 'text-amber-700 bg-amber-50 border-amber-300' },
  { id: '4', minPercentage: 33, maxPercentage: 49.99, title: 'مقبول', colorClass: 'text-stone-700 bg-stone-100 border-stone-300' },
];

export const DEFAULT_PASSING_SETTINGS: PassingSettings = {
  passingPercentage: 33,
  oneSubjectFailLabel: 'مجاز',
  twoOrMoreFailLabel: 'ناکام',
  absentFailLabel: 'ناکام',
};

export const STORAGE_KEY_CENTRAL_KAIFIYAT = 'meyar_central_kaifiyat_rules_v1';
export const STORAGE_KEY_CENTRAL_PASSING = 'meyar_central_passing_settings_v1';
export const CENTRAL_SETTINGS_UPDATED_EVENT = 'meyar_central_settings_updated';

export function getCentralKaifiyatRules(): KaifiyatRule[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CENTRAL_KAIFIYAT);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (e) {
    console.warn('Failed to read central kaifiyat rules:', e);
  }
  return [...DEFAULT_KAIFIYAT_RULES];
}

export function getCentralPassingSettings(): PassingSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CENTRAL_PASSING);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.passingPercentage === 'number') return parsed;
    }
  } catch (e) {
    console.warn('Failed to read central passing settings:', e);
  }
  return { ...DEFAULT_PASSING_SETTINGS };
}

export function getEffectiveMadrasaResultLogic(madrasa?: Madrasa | null): {
  rules: KaifiyatRule[];
  passing: PassingSettings;
  isCustom: boolean;
} {
  const centralRules = getCentralKaifiyatRules();
  const centralPassing = getCentralPassingSettings();
  if (!madrasa) {
    return { rules: centralRules, passing: centralPassing, isCustom: false };
  }
  // ONLY if madrasa explicitly enabled custom result logic:
  if (madrasa.hasCustomResultLogic && Array.isArray(madrasa.kaifiyatRules) && madrasa.kaifiyatRules.length > 0) {
    return {
      rules: madrasa.kaifiyatRules,
      passing: madrasa.passingSettings || centralPassing,
      isCustom: true,
    };
  }
  // By default, apply Central Result Admin logic to ALL madaris!
  return {
    rules: centralRules,
    passing: centralPassing,
    isCustom: false,
  };
}

export async function saveCentralResultLogic(
  rules: KaifiyatRule[],
  passing: PassingSettings,
  applyToAll: boolean = false
): Promise<{ madaris: Madrasa[]; classes: MadrasaClass[] }> {
  localStorage.setItem(STORAGE_KEY_CENTRAL_KAIFIYAT, JSON.stringify(rules));
  localStorage.setItem(STORAGE_KEY_CENTRAL_PASSING, JSON.stringify(passing));
  window.dispatchEvent(
    new CustomEvent(CENTRAL_SETTINGS_UPDATED_EVENT, { detail: { rules, passing } })
  );

  // Sync to central backend server
  try {
    await fetch('/api/central-result-logic', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rules, passing, applyToAll }),
    });
  } catch (srvErr) {
    console.warn('Central server save central result logic notice:', srvErr);
  }

  if (!isFirestoreQuotaExceeded()) {
    try {
      await setDoc(doc(db, 'system_configs', 'central_result_logic'), {
        id: 'central_result_logic',
        rules,
        passing,
        updatedAt: new Date().toISOString(),
      }, { merge: true });
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, 'system_configs/central_result_logic');
    }
  }

  const allMadaris = getStoredMadaris();
  const allClasses = getStoredClasses();

  const updatedMadaris = allMadaris.map((m) => {
    if (applyToAll || !m.hasCustomResultLogic) {
      return {
        ...m,
        kaifiyatRules: [...rules],
        passingSettings: { ...passing },
        hasCustomResultLogic: applyToAll ? false : m.hasCustomResultLogic,
      };
    }
    return m;
  });

  saveStoredMadaris(updatedMadaris);
  for (const m of updatedMadaris) {
    if (applyToAll || !m.hasCustomResultLogic) {
      persistMadrasa(m).catch(() => {});
    }
  }

  const updatedClasses = allClasses.map((cls) => {
    const parentMadrasa = updatedMadaris.find((m) => m.id === cls.madrasaId);
    if (!parentMadrasa) return cls;
    if (applyToAll || !parentMadrasa.hasCustomResultLogic) {
      let newStudents = cls.students || [];
      if (cls.rawSourceData) {
        const parsed = parseSheetData(cls.rawSourceData, cls.name, rules, passing);
        newStudents = parsed.students;
      } else if (newStudents.length > 0) {
        newStudents = newStudents.map((s) => recalculateStudentResult(s, rules, passing));
      }
      return { ...cls, students: newStudents };
    }
    return cls;
  });

  saveStoredClasses(updatedClasses);
  for (const cls of updatedClasses) {
    const parentMadrasa = updatedMadaris.find((m) => m.id === cls.madrasaId);
    if (parentMadrasa && (applyToAll || !parentMadrasa.hasCustomResultLogic)) {
      persistClass(cls).catch(() => {});
    }
  }

  return { madaris: updatedMadaris, classes: updatedClasses };
}

export async function saveMadrasaCustomResultLogic(
  madrasaId: string,
  rules: KaifiyatRule[],
  passing: PassingSettings
): Promise<{ madrasa: Madrasa; classes: MadrasaClass[] }> {
  const allMadaris = getStoredMadaris();
  const targetIndex = allMadaris.findIndex((m) => m.id === madrasaId);
  if (targetIndex === -1) {
    throw new Error('Madrasa not found');
  }

  const updatedMadrasa: Madrasa = {
    ...allMadaris[targetIndex],
    kaifiyatRules: [...rules],
    passingSettings: { ...passing },
    hasCustomResultLogic: true,
  };
  allMadaris[targetIndex] = updatedMadrasa;
  saveStoredMadaris(allMadaris);
  await persistMadrasa(updatedMadrasa).catch(() => {});

  const allClasses = getStoredClasses();
  const updatedClasses = allClasses.map((cls) => {
    if (cls.madrasaId === madrasaId) {
      let newStudents = cls.students || [];
      if (cls.rawSourceData) {
        const parsed = parseSheetData(cls.rawSourceData, cls.name, rules, passing);
        newStudents = parsed.students;
      } else if (newStudents.length > 0) {
        newStudents = newStudents.map((s) => recalculateStudentResult(s, rules, passing));
      }
      return { ...cls, students: newStudents };
    }
    return cls;
  });

  saveStoredClasses(updatedClasses);
  for (const cls of updatedClasses) {
    if (cls.madrasaId === madrasaId) {
      persistClass(cls).catch(() => {});
    }
  }

  return { madrasa: updatedMadrasa, classes: updatedClasses.filter((c) => c.madrasaId === madrasaId) };
}

export async function resetMadrasaToCentralResultLogic(
  madrasaId: string
): Promise<{ madrasa: Madrasa; classes: MadrasaClass[] }> {
  const centralRules = getCentralKaifiyatRules();
  const centralPassing = getCentralPassingSettings();
  const allMadaris = getStoredMadaris();
  const targetIndex = allMadaris.findIndex((m) => m.id === madrasaId);
  if (targetIndex === -1) {
    throw new Error('Madrasa not found');
  }

  const updatedMadrasa: Madrasa = {
    ...allMadaris[targetIndex],
    kaifiyatRules: [...centralRules],
    passingSettings: { ...centralPassing },
    hasCustomResultLogic: false,
  };
  allMadaris[targetIndex] = updatedMadrasa;
  saveStoredMadaris(allMadaris);
  await persistMadrasa(updatedMadrasa).catch(() => {});

  const allClasses = getStoredClasses();
  const updatedClasses = allClasses.map((cls) => {
    if (cls.madrasaId === madrasaId) {
      let newStudents = cls.students || [];
      if (cls.rawSourceData) {
        const parsed = parseSheetData(cls.rawSourceData, cls.name, centralRules, centralPassing);
        newStudents = parsed.students;
      } else if (newStudents.length > 0) {
        newStudents = newStudents.map((s) => recalculateStudentResult(s, centralRules, centralPassing));
      }
      return { ...cls, students: newStudents };
    }
    return cls;
  });

  saveStoredClasses(updatedClasses);
  for (const cls of updatedClasses) {
    if (cls.madrasaId === madrasaId) {
      persistClass(cls).catch(() => {});
    }
  }

  return { madrasa: updatedMadrasa, classes: updatedClasses.filter((c) => c.madrasaId === madrasaId) };
}

const SEED_MADARIS: Madrasa[] = [
  {
    id: 'madrasa-faizan-ala-hazrat',
    code: 'MM11',
    serialNumber: 11,
    urduName: 'دارالعلوم فیضان اعلی حضرت',
    englishName: 'Darul Uloom Faizan-e-Ala Hazrat',
    address: 'اعظم گڑھ مبارک پور اتر پردیش',
    description: 'دارالعلوم فیضان اعلی حضرت، مبارک پور، اعظم گڑھ، اتر پردیش',
    logo: '',
    themeColor: '#15345d',
    contactPhone: '9110098590',
    principalName: 'مفتی احمد رضا',
    principalPhone: '9110098590',
    principalId: 'MM11',
    principalPassword: 'MM11@1234',
    examTitle: 'سالانہ امتحانات 1447-1448ھ 2026ء',
    kaifiyatRules: [...DEFAULT_KAIFIYAT_RULES],
    passingSettings: { ...DEFAULT_PASSING_SETTINGS },
    permissions: {
      principalCanPublish: true,
      principalCanUnpublish: true,
      principalCanAddStudents: true,
      principalCanEditMarks: true,
    },
    registrationStatus: 'approved',
    isVerified: true,
    createdAt: new Date().toISOString(),
  },
];

const SEED_CLASSES: MadrasaClass[] = [
  {
    id: 'class-faizan-idadiyya',
    madrasaId: 'madrasa-faizan-ala-hazrat',
    name: 'اعدادیہ',
    nameEn: "I'dadiyya",
    academicYear: '1447-1448ھ / 2025-2026ء',
    status: 'published',
    resultSourceType: 'csv',
    googleSheetUrl: '',
    sheetTabName: 'اعدادیہ',
    rawSourceData: `Student ID,DOB,Student Name,Father Name,قرآن و تجوید [100],اردو و املا [100],دینیات و فقہ [100],فارسی و گرائمر [100],ریاضی و حساب [100]`,
    lastTestedAt: new Date().toISOString(),
    testStatus: {
      success: true,
      message: '✅ درجات امتحانی ریکارڈ فعال ہے',
      studentCount: 0,
      subjectCount: 5,
      subjects: [
        { name: 'قرآن و تجوید', maxMarks: 100 },
        { name: 'اردو و املا', maxMarks: 100 },
        { name: 'دینیات و فقہ', maxMarks: 100 },
        { name: 'فارسی و گرائمر', maxMarks: 100 },
        { name: 'ریاضی و حساب', maxMarks: 100 },
      ],
      missingFields: [],
    },
    students: [],
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'class-faizan-oola',
    madrasaId: 'madrasa-faizan-ala-hazrat',
    name: 'اولی',
    nameEn: 'Oola',
    academicYear: '1447-1448ھ / 2025-2026ء',
    status: 'published',
    resultSourceType: 'csv',
    googleSheetUrl: '',
    sheetTabName: 'اولی',
    rawSourceData: `Student ID,DOB,Student Name,Father Name,نحو میر و صرف [100],منہاج العربیہ [100],قدوری شریف [100],عقائد و فقہ [100],تجوید و قراءت [100]
1201,10/02/2008,محمد افروز عالم,محمد شفیق انصاری,90,92,88,95,91
1202,15/07/2007,غلام مصطفیٰ رضوی,صابر علی رضوی,82,79,85,88,86
1203,20/09/2008,محمد تسلیم رضا,محبوب عالم,68,72,70,74,76
1204,11/03/2008,محمد توقیر احمد,نثار احمد,56,52,54,58,60`,
    lastTestedAt: new Date().toISOString(),
    testStatus: {
      success: true,
      message: '✅ Connected\nStudents Found: 4\nSubjects Found: 5\nRequired Fields Found\nResult Data Ready',
      studentCount: 4,
      subjectCount: 5,
      subjects: [
        { name: 'نحو میر و صرف', maxMarks: 100 },
        { name: 'منہاج العربیہ', maxMarks: 100 },
        { name: 'قدوری شریف', maxMarks: 100 },
        { name: 'عقائد و فقہ', maxMarks: 100 },
        { name: 'تجوید و قراءت', maxMarks: 100 },
      ],
      missingFields: [],
    },
    students: [],
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'class-faizan-saniya',
    madrasaId: 'madrasa-faizan-ala-hazrat',
    name: 'ثانیہ',
    nameEn: 'Saniya',
    academicYear: '1447-1448ھ / 2025-2026ء',
    status: 'published',
    resultSourceType: 'csv',
    googleSheetUrl: '',
    sheetTabName: 'ثانیہ',
    rawSourceData: `Student ID,DOB,Student Name,Father Name,ہدایۃ النحو [100],نور الایضاح [100],اصول الشاشی [100],ترجمہ قرآن مجید [100],سیرت النبی ﷺ [100]`,
    lastTestedAt: new Date().toISOString(),
    testStatus: {
      success: true,
      message: '✅ درجات امتحانی ریکارڈ فعال ہے',
      studentCount: 0,
      subjectCount: 5,
      subjects: [
        { name: 'ہدایۃ النحو', maxMarks: 100 },
        { name: 'نور الایضاح', maxMarks: 100 },
        { name: 'اصول الشاشی', maxMarks: 100 },
        { name: 'ترجمہ قرآن مجید', maxMarks: 100 },
        { name: 'سیرت النبی ﷺ', maxMarks: 100 },
      ],
      missingFields: [],
    },
    students: [],
    updatedAt: new Date().toISOString(),
  },
];

export const STORAGE_KEY_DELETED_MADARIS = 'meyar_deleted_madaris_ids_v2';

export function getDeletedMadrasaIds(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_DELETED_MADARIS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function addDeletedMadrasaId(id: string, code?: string): void {
  try {
    const list = getDeletedMadrasaIds();
    if (id && !list.includes(id)) list.push(id);
    if (code && !list.includes(code)) list.push(code);
    localStorage.setItem(STORAGE_KEY_DELETED_MADARIS, JSON.stringify(list));
  } catch {}
}

export function getStoredMadaris(): Madrasa[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_MADARIS);
    const deleted = new Set(getDeletedMadrasaIds().map((s) => s.toLowerCase()));
    let list: Madrasa[] = [];
    if (raw !== null) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        list = parsed;
      }
    } else {
      list = SEED_MADARIS;
      localStorage.setItem(STORAGE_KEY_MADARIS, JSON.stringify(SEED_MADARIS));
    }

    // Strictly filter out any deleted madrasa
    if (deleted.size > 0) {
      list = list.filter((m) => !deleted.has(m.id.toLowerCase()) && !deleted.has((m.code || '').toLowerCase()));
    }

    // Strictly deduplicate by ID to guarantee unique records
    const map = new Map<string, Madrasa>();
    for (const m of list) {
      if (m && m.id) {
        if (!map.has(m.id)) {
          map.set(m.id, m);
        } else {
          map.set(m.id, { ...map.get(m.id)!, ...m });
        }
      }
    }
    list = Array.from(map.values());

    // Auto-heal: synchronize googleSheetUrl from classes and ensure verified status is in sync
    const classes = getStoredClasses();
    let changed = false;
    list = list.map((m) => {
      let updated = { ...m };
      if (updated.isVerified || updated.registrationStatus === 'approved' || String(updated.code).toUpperCase() === 'MM121') {
        if (!updated.managerVerified || updated.registrationStatus !== 'approved' || !updated.isVerified) {
          updated.managerVerified = true;
          updated.isVerified = true;
          updated.registrationStatus = 'approved';
          changed = true;
        }
      }
      if (updated.urduName) {
        const cleanedUrdu = cleanInstitutionName(updated.urduName);
        if (cleanedUrdu !== updated.urduName) {
          updated.urduName = cleanedUrdu;
          changed = true;
        }
      }
      if (updated.englishName) {
        const cleanedEng = cleanInstitutionName(updated.englishName);
        if (cleanedEng !== updated.englishName) {
          updated.englishName = cleanedEng;
          changed = true;
        }
      }
      if (!updated.googleSheetUrl || updated.googleSheetUrl.trim() === '') {
        const clsWithSheet = classes.find(
          (c) => c.madrasaId === updated.id && c.googleSheetUrl && c.googleSheetUrl.trim() !== ''
        );
        if (clsWithSheet && clsWithSheet.googleSheetUrl) {
          changed = true;
          updated.googleSheetUrl = clsWithSheet.googleSheetUrl.trim();
          const cleanCode = (updated.code || '').replace(/\D/g, '').slice(-3) || updated.code || '101';
          const encodedTitle = encodeURIComponent(`${updated.code || 'MM' + cleanCode} - ${cleanInstitutionName(updated.urduName || updated.englishName || 'مدرسہ')}`);
          updated.googleSheetUrl = `https://docs.google.com/spreadsheets/create?title=${encodedTitle}&folder=1HUVOzvuhbRrAO5qsw645dM4QZz75LSG9`;
          changed = true;
        }
      }
      if (!updated.themeColor || typeof updated.themeColor !== 'string' || !updated.themeColor.trim()) {
        updated.themeColor = '#065f46';
        changed = true;
      }
      if (typeof updated.logo !== 'string') {
        updated.logo = '';
        changed = true;
      }
      return updated;
    });
    if (changed) {
      localStorage.setItem(STORAGE_KEY_MADARIS, JSON.stringify(list));
    }
    return list;
  } catch {
    return SEED_MADARIS;
  }
}

export function saveStoredMadaris(madaris: Madrasa[]): void {
  try {
    localStorage.setItem(STORAGE_KEY_MADARIS, JSON.stringify(madaris));
    window.dispatchEvent(new CustomEvent('meyar_data_updated', { detail: { madaris } }));
  } catch (e) {
    console.error('Failed to save madaris to local storage', e);
  }
}

export function getStoredClasses(madrasaId?: string): MadrasaClass[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CLASSES);
    const deleted = new Set(getDeletedMadrasaIds().map((s) => s.toLowerCase()));
    let classes: MadrasaClass[] = [];
    if (raw !== null) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        classes = parsed;
      }
    } else {
      classes = SEED_CLASSES;
      localStorage.setItem(STORAGE_KEY_CLASSES, JSON.stringify(SEED_CLASSES));
    }

    // Strictly filter out classes of deleted madrasas
    if (deleted.size > 0) {
      classes = classes.filter((c) => !deleted.has(c.madrasaId.toLowerCase()));
    }

    // Auto-repair cached classes if rawSourceData exists and previously had misparsed subjects or 0 marks
    let classesModified = false;
    classes.forEach((c) => {
      // Exclude dummy test ids and cross-pollinated dummy students from other madaris
      if (Array.isArray(c.students)) {
        c.students = c.students.filter((s) => {
          const sId = String(s.studentId || '').trim();
          if (sId.startsWith('dummy-test-') || sId.startsWith('dummy-')) return false;
          if (c.madrasaId !== 'madrasa-mm118-1792224373738' && !c.id.includes('MM118') && sId.startsWith('118')) return false;
          return true;
        });
      }

      // Auto-repair any student with absent subjects: ensure sub.isAbsent is true, sub.obtainedMarks is 'غ', and kaifiyat is strictly 'ناکام'
      if (Array.isArray(c.students)) {
        c.students.forEach((s) => {
          let studentHasAb = Boolean(s.isAbsent);
          if (Array.isArray(s.subjects)) {
            s.subjects.forEach((sub: any) => {
              const isSubAb =
                sub.isAbsent === true ||
                sub.obtainedMarks === 'غ' ||
                String(sub.obtainedMarks || '').trim() === 'غ' ||
                isAbsentCell(sub.obtainedMarks);
              if (isSubAb) {
                sub.isAbsent = true;
                sub.obtainedMarks = 'غ';
                sub.isEmpty = false;
                studentHasAb = true;
                classesModified = true;
              }
            });
          }
          if (studentHasAb) {
            s.isAbsent = true;
            if (s.kaifiyat !== 'ناکام') {
              s.kaifiyat = 'ناکام';
              classesModified = true;
            }
          }
          // Ensure fatherName is in Urdu script
          if (s.fatherName && /[a-zA-Z]/.test(s.fatherName)) {
            s.fatherName = ensureUrduName(s.fatherName);
            classesModified = true;
          }
          if (s.studentName && /[a-zA-Z]/.test(s.studentName)) {
            s.studentName = ensureUrduName(s.studentName);
            classesModified = true;
          }
          if (s.kaifiyat === 'راسب') {
            s.kaifiyat = 'ناکام';
            classesModified = true;
          }
        });
      }

      // If class has raw CSV source data, check if it had misparsed subjects, all-zero marks, or absent marks to refresh
      const hasBadSubject =
        c.subjectsConfig?.some((sub) => isNonSubjectHeader(sub.name)) ||
        c.students?.some((s) => s.subjects?.some((sub) => isNonSubjectHeader(sub.name)));
      const hasAllZeroMarks =
        c.students && c.students.length > 0 && c.students.every((s) => s.obtainedMarks === 0 && !s.isAbsent);
      const rawHasAbsent = Boolean(c.rawSourceData && (c.rawSourceData.includes('غ') || c.rawSourceData.includes('absent') || c.rawSourceData.includes('غائب')));
      const needsAbsentRefresh = rawHasAbsent && c.students?.some((s) => s.isAbsent && s.subjects?.some((sub) => sub.obtainedMarks === ''));

      if ((hasBadSubject || hasAllZeroMarks || needsAbsentRefresh) && c.rawSourceData && c.rawSourceData.includes(',')) {
        try {
          const rules = getCentralKaifiyatRules();
          const passing = getCentralPassingSettings();
          const parsed = parseSheetData(c.rawSourceData, c.name, rules, passing);
          if (parsed && Array.isArray(parsed.students) && parsed.students.length > 0) {
            c.students = parsed.students;
            if (Array.isArray(parsed.subjects) && parsed.subjects.length > 0) {
              c.subjectsConfig = parsed.subjects.map((sub, idx) => ({
                id: `sub-${idx + 1}`,
                name: sub.name,
                maxMarks: sub.maxMarks,
                passingMarks: Math.ceil(sub.maxMarks * 0.33),
              }));
            }
            classesModified = true;
          }
        } catch {}
      }
    });

    if (classesModified) {
      localStorage.setItem(STORAGE_KEY_CLASSES, JSON.stringify(classes));
    }

    // Auto-propagate parent madrasa's googleSheetUrl to its classes if missing
    try {
      const rawMadaris = localStorage.getItem(STORAGE_KEY_MADARIS);
      if (rawMadaris) {
        const mList: Madrasa[] = JSON.parse(rawMadaris);
        if (Array.isArray(mList)) {
          classes.forEach((c) => {
            if (!c.googleSheetUrl || c.googleSheetUrl.trim() === '') {
              const p = mList.find((m) => m.id === c.madrasaId);
              if (p?.googleSheetUrl) {
                c.googleSheetUrl = p.googleSheetUrl;
                c.resultSourceType = 'google_sheet';
              }
            }
          });
        }
      }
    } catch {}

    if (madrasaId) {
      return classes.filter((c) => c.madrasaId === madrasaId);
    }
    return classes;
  } catch {
    return madrasaId ? SEED_CLASSES.filter((c) => c.madrasaId === madrasaId) : SEED_CLASSES;
  }
}

export function saveStoredClasses(classes: MadrasaClass[]): void {
  try {
    localStorage.setItem(STORAGE_KEY_CLASSES, JSON.stringify(classes));
    window.dispatchEvent(new CustomEvent('meyar_data_updated', { detail: { classes } }));
  } catch (e) {
    console.error('Failed to save classes to local storage', e);
  }
}

function parseTimestampMs(raw?: string | null): number {
  if (!raw) return 0;
  const t = new Date(raw).getTime();
  return Number.isFinite(t) ? t : 0;
}

function mergeSingleMadrasaRecord(
  existing: Madrasa,
  incoming: Madrasa,
  preferIncomingOnTie: boolean = false
): Madrasa {
  const existingTime = parseTimestampMs(existing.updatedAt);
  const incomingTime = parseTimestampMs(incoming.updatedAt);
  const incomingWins =
    incomingTime > existingTime || (incomingTime === existingTime && preferIncomingOnTie);

  const winner = incomingWins ? incoming : existing;
  const loser = incomingWins ? existing : incoming;

  const hasCustomColor = (c?: string) => Boolean(c && c.trim() && c.trim().toLowerCase() !== '#065f46');
  const resolvedColor = hasCustomColor(winner.themeColor)
    ? winner.themeColor
    : (hasCustomColor(loser.themeColor) ? loser.themeColor : (winner.themeColor || loser.themeColor || '#065f46'));

  const resolvedSheetUrl =
    (winner.googleSheetUrl && winner.googleSheetUrl.trim()) ||
    (loser.googleSheetUrl && loser.googleSheetUrl.trim()) ||
    '';
  const resolvedSpreadsheetId =
    (winner.spreadsheetId && String(winner.spreadsheetId).trim()) ||
    (loser.spreadsheetId && String(loser.spreadsheetId).trim()) ||
    '';

  return {
    ...loser,
    ...winner,
    googleSheetUrl: resolvedSheetUrl,
    spreadsheetId: resolvedSpreadsheetId,
    themeColor: resolvedColor,
    showPublicResults:
      winner.showPublicResults !== undefined ? winner.showPublicResults : loser.showPublicResults,
    registrationStatus: winner.registrationStatus || loser.registrationStatus || 'pending',
    isVerified:
      winner.registrationStatus === 'approved'
        ? true
        : winner.isVerified !== undefined
          ? Boolean(winner.isVerified)
          : Boolean(loser.isVerified),
    managerVerified:
      winner.registrationStatus === 'approved'
        ? true
        : winner.managerVerified !== undefined
          ? Boolean(winner.managerVerified)
          : Boolean(loser.managerVerified),
  };
}

export function mergeMadarisLists(
  baseList: Madrasa[],
  incomingList: Madrasa[],
  deletedIds?: Set<string>,
  preferIncomingOnTie: boolean = false
): Madrasa[] {
  const deleted = deletedIds || new Set(getDeletedMadrasaIds().map((s) => String(s).toLowerCase().trim()));
  const result: Madrasa[] = [];

  const upsert = (item: Madrasa, onTieUseIncoming: boolean) => {
    if (!item || !item.id) return;
    const idLower = String(item.id).toLowerCase().trim();
    const codeUpper = String(item.code || '').toUpperCase().trim();
    const codeLower = codeUpper.toLowerCase();
    if (deleted.has(idLower) || (codeLower && deleted.has(codeLower))) {
      return;
    }
    const idx = result.findIndex(
      (m) =>
        m.id === item.id ||
        (codeUpper && m.code && String(m.code).toUpperCase().trim() === codeUpper)
    );
    if (idx === -1) {
      result.push(item);
    } else {
      result[idx] = mergeSingleMadrasaRecord(result[idx], item, onTieUseIncoming);
    }
  };

  (Array.isArray(baseList) ? baseList : []).forEach((m) => upsert(m, false));
  (Array.isArray(incomingList) ? incomingList : []).forEach((m) => upsert(m, preferIncomingOnTie));

  return result;
}

export function mergeClassesLists(
  baseList: MadrasaClass[],
  incomingList: MadrasaClass[],
  deletedIds?: Set<string>
): MadrasaClass[] {
  const deleted = deletedIds || new Set(getDeletedMadrasaIds().map((s) => String(s).toLowerCase().trim()));
  const map = new Map<string, MadrasaClass>();

  const upsert = (cls: MadrasaClass, preferIncoming: boolean) => {
    if (!cls || !cls.id || !cls.madrasaId) return;
    if (deleted.has(String(cls.madrasaId).toLowerCase().trim())) return;
    const existing = map.get(cls.id);
    if (!existing) {
      map.set(cls.id, cls);
      return;
    }
    const existingStudents = Array.isArray(existing.students) ? existing.students : [];
    const incomingStudents = Array.isArray(cls.students) ? cls.students : [];
    const existingTime = parseTimestampMs(existing.updatedAt);
    const incomingTime = parseTimestampMs(cls.updatedAt);
    const incomingNewer = incomingTime > existingTime || (incomingTime === existingTime && preferIncoming);
    const hasLiveSheet = cls.resultSourceType === 'google_sheet' || Boolean(cls.googleSheetUrl);
    const bestStudents =
      hasLiveSheet && incomingStudents.length > 0 && incomingNewer
        ? incomingStudents
        : existingStudents.length > incomingStudents.length
          ? existingStudents
          : incomingStudents;
    map.set(cls.id, {
      ...(incomingNewer ? existing : cls),
      ...(incomingNewer ? cls : existing),
      students: bestStudents,
    });
  };

  (Array.isArray(baseList) ? baseList : []).forEach((c) => upsert(c, false));
  (Array.isArray(incomingList) ? incomingList : []).forEach((c) => upsert(c, true));

  return Array.from(map.values());
}

const FIRESTORE_SYNC_COOLDOWN_MS = 3 * 60 * 1000; // 3 minutes between full collection scans (onSnapshot handles live changes)
const FIRESTORE_MANUAL_THROTTLE_MS = 15 * 1000; // At most 1 forced scan per 15s
let lastFirestoreSyncMs = 0;
let realtimeSyncAttached = false;
let inFlightSyncPromise: Promise<{
  madaris: Madrasa[];
  classes: MadrasaClass[];
  portalLogo?: string;
}> | null = null;
let inFlightSyncSkippedFirestore = false;

async function syncDeletedIdsToFirestore(ids: string[]): Promise<void> {
  if (isFirestoreQuotaExceeded() || !Array.isArray(ids) || ids.length === 0) return;
  try {
    const normalized = Array.from(new Set(ids.map((s) => String(s).trim()).filter(Boolean)));
    await setDoc(
      doc(db, 'system_configs', 'deleted_madaris'),
      {
        id: 'deleted_madaris',
        ids: normalized,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
  } catch (e) {
    markFirestoreQuotaError(e);
  }
}

/**
 * Sync all data with the central cloud server (/api/data) and Firestore.
 * Uses single-flight deduplication and a 3-minute cooldown for full Firestore collection scans
 * (since onSnapshot keeps realtime updates active) so daily Firestore read quota is preserved.
 */
export async function syncWithServer(
  forceFirestore: boolean = false,
  options?: { skipFirestore?: boolean }
): Promise<{
  madaris: Madrasa[];
  classes: MadrasaClass[];
  portalLogo?: string;
}> {
  const skipFirestore = Boolean(options?.skipFirestore) && !forceFirestore;
  if (
    inFlightSyncPromise &&
    !forceFirestore &&
    (skipFirestore || !inFlightSyncSkippedFirestore)
  ) {
    return inFlightSyncPromise;
  }
  inFlightSyncSkippedFirestore = skipFirestore;

  const runSync = async () => {
    const fetchServerData = async () => {
      try {
        const res = await fetch('/api/data');
        if (!res.ok) throw new Error(`HTTP error ${res.status}`);
        const contentType = res.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
          throw new Error('Response is not JSON (static domain)');
        }
        return await res.json();
      } catch {
        return null;
      }
    };

    const fetchFirestoreData = async (canQuery: boolean) => {
      const fMadaris: Madrasa[] = [];
      const fClasses: MadrasaClass[] = [];
      const fDeletedIds: string[] = [];
      if (!canQuery) {
        return { fMadaris, fClasses, fDeletedIds, firestoreLoadedOk: false };
      }

      try {
        lastFirestoreSyncMs = Date.now();
        const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 10000));
        const fetchOperation = (async () => {
          const [mSnap, cSnap, delSnap] = await Promise.all([
            getDocs(collection(db, 'madaris')),
            getDocs(collection(db, 'classes')),
            getDoc(doc(db, 'system_configs', 'deleted_madaris')).catch(() => null),
          ]);
          mSnap.forEach((d) => {
            const data = d.data() as Madrasa;
            if (data && data.id && data.urduName) {
              fMadaris.push(data);
            }
          });
          cSnap.forEach((d) => {
            const data = d.data() as MadrasaClass;
            if (data && data.id && data.madrasaId) {
              fClasses.push(data);
            }
          });
          if (delSnap && delSnap.exists()) {
            const dData = delSnap.data() as any;
            if (Array.isArray(dData?.ids)) {
              dData.ids.forEach((x: string) => {
                if (x) fDeletedIds.push(String(x));
              });
            }
          }
          return { fMadaris, fClasses, fDeletedIds, firestoreLoadedOk: true };
        })();

        const result = await Promise.race([fetchOperation, timeout]);
        if (result) {
          return result;
        }
      } catch (fsErr) {
        handleFirestoreError(fsErr, OperationType.GET, 'madaris|classes');
      }
      return { fMadaris, fClasses, fDeletedIds, firestoreLoadedOk: false };
    };

    const now = Date.now();
    const cooldownAllowsFirestore =
      !isFirestoreQuotaExceeded() &&
      (forceFirestore
        ? now - lastFirestoreSyncMs >= FIRESTORE_MANUAL_THROTTLE_MS
        : !realtimeSyncAttached &&
          (lastFirestoreSyncMs === 0 || now - lastFirestoreSyncMs >= FIRESTORE_SYNC_COOLDOWN_MS));

    let rawServerData: any;
    let firestoreData: {
      fMadaris: Madrasa[];
      fClasses: MadrasaClass[];
      fDeletedIds: string[];
      firestoreLoadedOk: boolean;
    };

    if (skipFirestore) {
      // Public visitors: fetch from /api/data first; ONLY query Firestore directly if server is unreachable (static host)
      rawServerData = await fetchServerData();
      if (rawServerData) {
        firestoreData = { fMadaris: [], fClasses: [], fDeletedIds: [], firestoreLoadedOk: false };
      } else {
        firestoreData = await fetchFirestoreData(cooldownAllowsFirestore);
      }
    } else {
      [rawServerData, firestoreData] = await Promise.all([
        fetchServerData(),
        fetchFirestoreData(cooldownAllowsFirestore),
      ]);
    }

    const firestoreMadaris = firestoreData?.fMadaris || [];
    const firestoreClasses = firestoreData?.fClasses || [];
    const firestoreDeletedIds = firestoreData?.fDeletedIds || [];

    try {
      const cachedMadaris = getStoredMadaris();
      const cachedClasses = getStoredClasses();

      const data = rawServerData || {
        madaris: cachedMadaris,
        classes: cachedClasses,
      };

      if (!Array.isArray(data.madaris)) data.madaris = [];
      if (!Array.isArray(data.classes)) data.classes = [];

      // Sync deleted madrasa IDs across server + Firestore + local
      const beforeDeletedCount = getDeletedMadrasaIds().length;
      if (Array.isArray(data.deletedMadrasaIds)) {
        data.deletedMadrasaIds.forEach((dId: string) => addDeletedMadrasaId(dId));
      }
      if (firestoreDeletedIds.length > 0) {
        firestoreDeletedIds.forEach((dId: string) => addDeletedMadrasaId(dId));
      }
      const allDeletedIds = getDeletedMadrasaIds();
      const deleted = new Set(allDeletedIds.map((s) => s.toLowerCase().trim()));

      // Push local/server deleted IDs to Firestore if Firestore didn't have them yet
      if (firestoreData?.firestoreLoadedOk && allDeletedIds.length > 0) {
        const fsDelSet = new Set(firestoreDeletedIds.map((s) => s.toLowerCase().trim()));
        const hasUnsyncedDeletion = allDeletedIds.some((id) => !fsDelSet.has(id.toLowerCase().trim()));
        if (hasUnsyncedDeletion || allDeletedIds.length > beforeDeletedCount) {
          syncDeletedIdsToFirestore(allDeletedIds).catch(() => {});
        }
      }

      // Always merge cached + server + Firestore by updatedAt timestamp so:
      // 1) Stale/partial serverless instances never drop non-deleted madaris
      // 2) Newly edited madrasa details (name, email, color, etc.) never revert to older data
      const afterServerMadaris = mergeMadarisLists(cachedMadaris, data.madaris, deleted, false);
      const mergedMadaris = mergeMadarisLists(afterServerMadaris, firestoreMadaris, deleted, true);

      const afterServerClasses = mergeClassesLists(cachedClasses, data.classes, deleted);
      const mergedClasses = mergeClassesLists(afterServerClasses, firestoreClasses, deleted);

      // Auto-heal missing sheet URLs from classes
      const healedMadaris = mergedMadaris.map((m: Madrasa) => {
        if (!m.googleSheetUrl || m.googleSheetUrl.trim() === '') {
          const cls = mergedClasses.find(
            (c: any) => c.madrasaId === m.id && c.googleSheetUrl && c.googleSheetUrl.trim() !== ''
          );
          if (cls && cls.googleSheetUrl) {
            return { ...m, googleSheetUrl: cls.googleSheetUrl.trim() };
          }
        }
        return m;
      });

      // Backfill ONLY missing or strictly newer non-deleted madaris & classes up to Firestore
      if (firestoreData?.firestoreLoadedOk && !isFirestoreQuotaExceeded()) {
        const fsById = new Map<string, Madrasa>();
        firestoreMadaris.forEach((fm) => {
          if (fm?.id) fsById.set(fm.id, fm);
        });
        for (const m of healedMadaris) {
          if (!m?.id || !m?.code || !m?.urduName) continue;
          const existingFs = fsById.get(m.id);
          const localTime = parseTimestampMs(m.updatedAt || m.createdAt);
          const fsTime = existingFs ? parseTimestampMs(existingFs.updatedAt || existingFs.createdAt) : -1;
          if (!existingFs || localTime > fsTime) {
            const cleanDoc = JSON.parse(JSON.stringify(m));
            setDoc(doc(db, 'madaris', m.id), cleanDoc, { merge: true }).catch((err) => {
              markFirestoreQuotaError(err);
            });
          }
        }

        const fsClassById = new Map<string, MadrasaClass>();
        firestoreClasses.forEach((fc) => {
          if (fc?.id) fsClassById.set(fc.id, fc);
        });
        for (const c of mergedClasses) {
          if (!c?.id || !c?.madrasaId) continue;
          const existingFsC = fsClassById.get(c.id);
          const localTime = parseTimestampMs(c.updatedAt);
          const fsTime = existingFsC ? parseTimestampMs(existingFsC.updatedAt) : -1;
          if (!existingFsC || localTime > fsTime) {
            const cleanClsDoc = JSON.parse(JSON.stringify(c));
            setDoc(doc(db, 'classes', c.id), cleanClsDoc, { merge: true }).catch((err) => {
              markFirestoreQuotaError(err);
            });
          }
        }
      }

      localStorage.setItem(STORAGE_KEY_MADARIS, JSON.stringify(healedMadaris));
      data.madaris = healedMadaris;

      localStorage.setItem(STORAGE_KEY_CLASSES, JSON.stringify(mergedClasses));
      data.classes = mergedClasses;

      if (data.portalLogo) {
        localStorage.setItem(STORAGE_KEY_PORTAL_LOGO, data.portalLogo);
      }
      if (typeof data.sheetEditorAppsScriptUrl === 'string' && data.sheetEditorAppsScriptUrl.trim()) {
        try {
          localStorage.setItem(STORAGE_KEY_SHEET_EDITOR_SCRIPT_URL, data.sheetEditorAppsScriptUrl.trim());
        } catch {}
      }

      let centralSettingsChanged = false;
      if (Array.isArray(data.centralKaifiyatRules) && data.centralKaifiyatRules.length > 0) {
        const nextRulesStr = JSON.stringify(data.centralKaifiyatRules);
        if (localStorage.getItem(STORAGE_KEY_CENTRAL_KAIFIYAT) !== nextRulesStr) {
          localStorage.setItem(STORAGE_KEY_CENTRAL_KAIFIYAT, nextRulesStr);
          centralSettingsChanged = true;
        }
      }
      if (data.centralPassingSettings && typeof data.centralPassingSettings === 'object') {
        const nextPassStr = JSON.stringify(data.centralPassingSettings);
        if (localStorage.getItem(STORAGE_KEY_CENTRAL_PASSING) !== nextPassStr) {
          localStorage.setItem(STORAGE_KEY_CENTRAL_PASSING, nextPassStr);
          centralSettingsChanged = true;
        }
      }
      if (data.centralExamTitle && typeof data.centralExamTitle === 'object') {
        localStorage.setItem(STORAGE_KEY_CENTRAL_EXAM_TITLE, JSON.stringify(data.centralExamTitle));
        window.dispatchEvent(new CustomEvent(DEFAULT_EXAM_TITLE_UPDATED_EVENT, { detail: data.centralExamTitle }));
      }
      if (data.launchTimer && typeof data.launchTimer === 'object') {
        localStorage.setItem(STORAGE_KEY_LAUNCH_TIMER, JSON.stringify(data.launchTimer));
        window.dispatchEvent(new CustomEvent(LAUNCH_TIMER_UPDATED_EVENT, { detail: data.launchTimer }));
      }

      if (centralSettingsChanged) {
        window.dispatchEvent(new CustomEvent(CENTRAL_SETTINGS_UPDATED_EVENT, {
          detail: { rules: data.centralKaifiyatRules, passing: data.centralPassingSettings, fromSyncWithServer: true }
        }));
      }

      window.dispatchEvent(new CustomEvent('meyar_data_updated', {
        detail: { madaris: data.madaris, classes: data.classes, portalLogo: data.portalLogo, serverSynced: true }
      }));
      window.dispatchEvent(new CustomEvent('portal_logo_updated', {
        detail: { logo: data.portalLogo }
      }));

      return {
        madaris: data.madaris || getStoredMadaris(),
        classes: data.classes || getStoredClasses(),
        portalLogo: data.portalLogo || getPortalLogo(),
      };
    } catch (err) {
      console.warn('Server fetch fallback; syncing with Firestore & local cache:', err);
      const deleted = new Set(getDeletedMadrasaIds().map((s) => s.toLowerCase().trim()));
      const fallbackMadaris = mergeMadarisLists(getStoredMadaris(), firestoreMadaris, deleted, true);
      localStorage.setItem(STORAGE_KEY_MADARIS, JSON.stringify(fallbackMadaris));

      const fallbackClasses = mergeClassesLists(getStoredClasses(), firestoreClasses, deleted);
      localStorage.setItem(STORAGE_KEY_CLASSES, JSON.stringify(fallbackClasses));

      window.dispatchEvent(new CustomEvent('meyar_data_updated', {
        detail: { madaris: fallbackMadaris, classes: fallbackClasses, serverSynced: true }
      }));

      return {
        madaris: fallbackMadaris,
        classes: fallbackClasses,
      };
    }
  };

  inFlightSyncPromise = runSync().finally(() => {
    inFlightSyncPromise = null;
  });
  return inFlightSyncPromise;
}

/**
 * Realtime continuous cloud Firestore listener (keeps Netlify, mobile, iframe & custom domain instantly in sync)
 */
export function initFirestoreRealtimeSync(): () => void {
  if (isFirestoreQuotaExceeded()) {
    realtimeSyncAttached = false;
    return () => {};
  }
  try {
    ensureFirestoreConnectionTested();
    realtimeSyncAttached = true;
    const unsubs: Array<() => void> = [];
    const stopAllListeners = () => {
      realtimeSyncAttached = false;
      while (unsubs.length > 0) {
        const fn = unsubs.pop();
        try { if (typeof fn === 'function') fn(); } catch (_) {}
      }
    };

    const onListenerError = (err: unknown, path: string) => {
      handleFirestoreError(err, OperationType.GET, path);
      if (isFirestoreQuotaExceeded()) {
        stopAllListeners();
      }
    };

    unsubs.push(
      onSnapshot(
        collection(db, 'madaris'),
        (snap) => {
          const fMadaris: Madrasa[] = [];
          snap.forEach((d) => {
            const data = d.data() as Madrasa;
            if (data && data.id && data.urduName) {
              fMadaris.push(data);
            }
          });
          if (fMadaris.length > 0) {
            const deleted = new Set(getDeletedMadrasaIds().map((s) => s.toLowerCase().trim()));
            const activeMerged = mergeMadarisLists(getStoredMadaris(), fMadaris, deleted, true);
            saveStoredMadaris(activeMerged);
          }
        },
        (err) => onListenerError(err, 'madaris')
      )
    );

    unsubs.push(
      onSnapshot(
        collection(db, 'classes'),
        (snap) => {
          const fClasses: MadrasaClass[] = [];
          snap.forEach((d) => {
            const data = d.data() as MadrasaClass;
            if (data && data.id && data.madrasaId) {
              fClasses.push(data);
            }
          });
          if (fClasses.length > 0) {
            const deleted = new Set(getDeletedMadrasaIds().map((s) => s.toLowerCase().trim()));
            const activeMergedClasses = mergeClassesLists(getStoredClasses(), fClasses, deleted);
            saveStoredClasses(activeMergedClasses);
          }
        },
        (err) => onListenerError(err, 'classes')
      )
    );

    unsubs.push(
      onSnapshot(
        doc(db, 'system_configs', 'central_result_logic'),
        (snap) => {
          if (snap.exists()) {
            const sData = snap.data();
            let changed = false;
            if (Array.isArray(sData?.rules) && sData.rules.length > 0) {
              const nextRulesStr = JSON.stringify(sData.rules);
              if (localStorage.getItem(STORAGE_KEY_CENTRAL_KAIFIYAT) !== nextRulesStr) {
                localStorage.setItem(STORAGE_KEY_CENTRAL_KAIFIYAT, nextRulesStr);
                changed = true;
              }
            }
            if (sData?.passing && typeof sData.passing === 'object') {
              const nextPassStr = JSON.stringify(sData.passing);
              if (localStorage.getItem(STORAGE_KEY_CENTRAL_PASSING) !== nextPassStr) {
                localStorage.setItem(STORAGE_KEY_CENTRAL_PASSING, nextPassStr);
                changed = true;
              }
            }
            if (changed) {
              window.dispatchEvent(
                new CustomEvent(CENTRAL_SETTINGS_UPDATED_EVENT, {
                  detail: { rules: sData?.rules, passing: sData?.passing, fromSyncWithServer: true }
                })
              );
            }
          }
        },
        (err) => onListenerError(err, 'system_configs/central_result_logic')
      )
    );

    unsubs.push(
      onSnapshot(
        doc(db, 'system_configs', 'launchTimer'),
        (snap) => {
          if (snap.exists()) {
            const tData = snap.data() as PortalLaunchTimer;
            if (tData && typeof tData.enabled === 'boolean') {
              localStorage.setItem(STORAGE_KEY_LAUNCH_TIMER, JSON.stringify(tData));
              window.dispatchEvent(new CustomEvent(LAUNCH_TIMER_UPDATED_EVENT, { detail: tData }));
            }
          }
        },
        (err) => onListenerError(err, 'system_configs/launchTimer')
      )
    );

    unsubs.push(
      onSnapshot(
        doc(db, 'system_configs', 'deleted_madaris'),
        (snap) => {
          if (snap.exists()) {
            const dData = snap.data() as any;
            if (Array.isArray(dData?.ids) && dData.ids.length > 0) {
              dData.ids.forEach((dId: string) => addDeletedMadrasaId(dId));
              const deleted = new Set(getDeletedMadrasaIds().map((s) => s.toLowerCase().trim()));
              const filteredMadaris = getStoredMadaris().filter(
                (m) => !deleted.has(m.id.toLowerCase()) && !deleted.has((m.code || '').toLowerCase())
              );
              const filteredClasses = getStoredClasses().filter(
                (c) => !deleted.has(c.madrasaId.toLowerCase())
              );
              saveStoredMadaris(filteredMadaris);
              saveStoredClasses(filteredClasses);
            }
          }
        },
        (err) => onListenerError(err, 'system_configs/deleted_madaris')
      )
    );

    return stopAllListeners;
  } catch (err) {
    realtimeSyncAttached = false;
    console.warn('initFirestoreRealtimeSync initialization error:', err);
    return () => {};
  }
}

/**
 * Direct client-side Google Sheet sync (Works directly in browser on Netlify, custom domains & static deployments)
 */
export async function directClientSyncMadrasaGoogleSheet(
  madrasaId: string,
  madrasaObj?: Madrasa
): Promise<{
  success: boolean;
  message?: string;
  syncedClasses?: number;
  totalStudents?: number;
  madaris?: Madrasa[];
  classes?: MadrasaClass[];
}> {
  try {
    const madaris = getStoredMadaris();
    const madrasa =
      madaris.find(
        (m) =>
          m.id === madrasaId ||
          (m.code && m.code.toUpperCase() === madrasaId.toUpperCase())
      ) || madrasaObj;
    if (!madrasa) {
      return { success: false, message: 'مدرسہ نہیں مل سکا' };
    }

    const targetUrl = (madrasa.googleSheetUrl || '').trim();
    const sheetId = extractSpreadsheetId(targetUrl) || madrasa.spreadsheetId || '';

    if (!targetUrl && !sheetId) {
      return { success: false, message: 'اس مدرسے سے کلاؤڈ ریکارڈ کا لنک منسلک نہیں ہے' };
    }

    const currentClasses = getStoredClasses();
    let mClasses = currentClasses.filter((c) => c.madrasaId === madrasa.id || c.madrasaId === madrasa.code);

    // Prevent cross-contamination: do not sync from global Apps Script if no dedicated sheet is attached
    if (
      targetUrl === DEFAULT_APPS_SCRIPT_URL &&
      madrasa.code !== 'MM118' &&
      !targetUrl.includes('spreadsheetId') &&
      !madrasa.spreadsheetId &&
      !sheetId
    ) {
      return { success: true, message: 'مدرسہ کا اپنا کلاؤڈ ریکارڈ ابھی منسلک نہیں ہے' };
    }

    let syncedCount = 0;
    let studentsCount = 0;
    const updatedClassesMap = new Map<string, MadrasaClass>();
    currentClasses.forEach((c) => updatedClassesMap.set(c.id, { ...c }));

    // 1. Google Apps Script Web App API Check
    if (targetUrl.includes('script.google.com/macros/s/')) {
      try {
        const gasUrl = `${targetUrl}${targetUrl.includes('?') ? '&' : '?'}action=all&cb=${Date.now()}`;
        const gasRes = await fetch(gasUrl);
        const contentType = gasRes.headers.get('content-type') || '';
        if (gasRes.ok && contentType.includes('application/json')) {
          const gasData = await gasRes.json();
          // Reject foreign madrasa data
          if (gasData.sheetName && gasData.sheetName.includes('MM118') && madrasa.code !== 'MM118') {
            return { success: true, message: 'شیٹ کی توثیق مکمل ہونے کی منتظر ہے' };
          }

          if (gasData && (Array.isArray(gasData.classes) || Array.isArray(gasData.data) || Array.isArray(gasData.students))) {
            const rawClasses = Array.isArray(gasData.classes) ? gasData.classes : [];
            for (const rCls of rawClasses) {
              const cName = (rCls.name || rCls.className || 'کلاس').trim();
              const existing: MadrasaClass = mClasses.find((c) => c.name === cName) || {
                id: `class-${madrasa.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                madrasaId: madrasa.id,
                name: cName,
                academicYear: '1447-1448ھ / 2025-2026ء',
                status: 'published',
                resultSourceType: 'google_sheet' as const,
                googleSheetUrl: targetUrl,
                sheetTabName: cName,
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
                students: [],
                updatedAt: new Date().toISOString(),
              };

              const rawStudents = Array.isArray(rCls.students) ? rCls.students : [];
              const stList = rawStudents
                .filter((s: any) => {
                  const sId = String(s.studentId || s.id || '').trim();
                  if (madrasa.code !== 'MM118' && (sId.startsWith('118') || sId.startsWith('dummy-'))) return false;
                  return true;
                })
                .map((st: any) => {
                  const subs = Array.isArray(st.subjects)
                    ? st.subjects.map((sub: any) => {
                        const isAb = Boolean(sub.isAbsent) || isAbsentCell(sub.obtainedMarks);
                        return {
                          ...sub,
                          isAbsent: isAb,
                          obtainedMarks: isAb ? 'غ' : sub.obtainedMarks,
                        };
                      })
                    : [];
                  const hasAb = subs.some((sub: any) => sub.isAbsent || sub.obtainedMarks === 'غ');
                  return {
                    ...st,
                    subjects: subs,
                    isAbsent: hasAb,
                    kaifiyat: hasAb ? (madrasa.passingSettings?.absentFailLabel || 'ناکام') : st.kaifiyat,
                  };
                });

              existing.students = stList;
              existing.status = 'published';
              existing.updatedAt = new Date().toISOString();
              updatedClassesMap.set(existing.id, existing);
              syncedCount++;
              studentsCount += stList.length;

              try {
                setDoc(doc(db, 'classes', existing.id), existing, { merge: true }).catch(() => {});
              } catch {}
            }
          }
        }
      } catch (gasErr) {
        console.warn('Direct Apps Script fetch warning:', gasErr);
      }
    }

    // 2. Direct Google Spreadsheet CSV Fetch (via Google GViz API - no CORS issues)
    if (sheetId) {
      const cacheBust = `cb=${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

      // A: Fetch Master Data Tab to map Student IDs (e.g. 135101) & DOBs
      const masterUrls = [
        `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent('Master Data')}&${cacheBust}`,
        `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent('Masters')}&${cacheBust}`,
        `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&gid=0&${cacheBust}`,
      ];

      const masterMap = new Map<string, any>();
      const masterStudentsList: any[] = [];
      const numericPart = (madrasa.code || '').replace(/\D/g, '').slice(-3) || '111';

      const parseCSVTokens = (line: string): string[] => {
        const tokens: string[] = [];
        let cur = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
          const ch = line[i];
          if (ch === '"') {
            if (inQuotes && line[i + 1] === '"') {
              cur += '"';
              i++;
            } else {
              inQuotes = !inQuotes;
            }
          } else if (ch === ',' && !inQuotes) {
            tokens.push(cur.trim().replace(/^"|"$/g, ''));
            cur = '';
          } else {
            cur += ch;
          }
        }
        tokens.push(cur.trim().replace(/^"|"$/g, ''));
        return tokens;
      };

      for (const mUrl of masterUrls) {
        try {
          const mr = await fetch(mUrl);
          if (mr.ok) {
            const text = await mr.text();
            if (text && !text.trim().startsWith('<') && (text.includes(',') || text.includes('\n'))) {
              const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
              if (lines.length >= 2) {
                const headers = parseCSVTokens(lines[0]).map((h) => h.toLowerCase().replace(/[_-\s]/g, ''));
                let idCol = headers.findIndex((h) => h.includes('studentid') || h.includes('آئیڈی') || h.includes('id') || h.includes('اسٹوڈنٹ'));
                let nameCol = headers.findIndex((h) => (h.includes('امیدوار') || h.includes('طالب')) || (h.includes('نام') && !h.includes('والد') && !h.includes('father')));
                let fatherCol = headers.findIndex((h) => h.includes('والد') || h.includes('father'));
                let classCol = headers.findIndex((h) => h.includes('درجہ') || h.includes('class') || h.includes('کلاس'));
                let dobCol = headers.findIndex((h) => h.includes('dob') || h.includes('تاریخ'));
                let engNameCol = headers.findIndex((h) => h.includes('candidate') || (h.includes('name') && h.includes('eng')));
                let engFatherCol = headers.findIndex((h) => h.includes('father') && (h.includes('eng') || h.includes('english')));

                // Fallback to standard 7-column layout if headers could not be matched
                if (idCol === -1) idCol = 0;
                if (nameCol === -1) nameCol = 1;
                if (fatherCol === -1) fatherCol = 2;
                if (engNameCol === -1) engNameCol = 3;
                if (engFatherCol === -1) engFatherCol = 4;
                if (classCol === -1) classCol = 5;
                if (dobCol === -1) dobCol = 6;

                for (let r = 1; r < lines.length; r++) {
                  const cells = parseCSVTokens(lines[r]);
                  let stId = (idCol !== -1 && idCol < cells.length ? cells[idCol] : '').trim();
                  const stName = (nameCol !== -1 && nameCol < cells.length ? cells[nameCol] : '').trim();
                  const stFather = (fatherCol !== -1 && fatherCol < cells.length ? cells[fatherCol] : '').trim();
                  const stEngName = (engNameCol !== -1 && engNameCol < cells.length ? cells[engNameCol] : '').trim();
                  const stEngFather = (engFatherCol !== -1 && engFatherCol < cells.length ? cells[engFatherCol] : '').trim();
                  const stClass = (classCol !== -1 && classCol < cells.length ? cells[classCol] : '').trim();
                  const rawDob = (dobCol !== -1 && dobCol < cells.length ? cells[dobCol] : '').trim();
                  const stDob = normalizeDate(rawDob);

                  // Auto-generate 6-digit candidate ID if formula hasn't evaluated yet
                  if (!stId && stName) {
                    const serial = 100 + r;
                    stId = `${numericPart}${serial}`;
                  }

                  if (stId || stName) {
                    const record = {
                      studentId: stId,
                      studentName: stName,
                      fatherName: stFather,
                      studentNameEn: stEngName || stName,
                      fatherNameEn: stEngFather || stFather,
                      className: stClass,
                      dob: stDob,
                      rowNumber: r,
                    };
                    if (stId) masterMap.set(stId.toLowerCase(), record);
                    if (stName) masterMap.set(stName.toLowerCase(), record);
                    masterStudentsList.push(record);
                  }
                }
                break;
              }
            }
          }
        } catch {}
      }

      // Also ensure any class mentioned in Master Data exists in mClasses
      const normalizeClassName = (str: string) => {
        return (str || '')
          .trim()
          .replace(/[\s\u200c\u200d\uFEFF]/g, '')
          .toLowerCase()
          .replace(/ة/g, 'ہ')
          .replace(/ك/g, 'ک')
          .replace(/ي/g, 'ی')
          .replace(/ى/g, 'ی');
      };

      const masterClassNames = new Set<string>();
      masterStudentsList.forEach((st) => {
        if (st.className && st.className.trim()) {
          masterClassNames.add(st.className.trim());
        }
      });

      masterClassNames.forEach((mcn) => {
        const norm = normalizeClassName(mcn);
        const exists = mClasses.some((c) => normalizeClassName(c.name) === norm);
        if (!exists) {
          const newClassObj: MadrasaClass = {
            id: `class-${madrasa.code || '101'}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            madrasaId: madrasa.id,
            name: mcn,
            academicYear: '1447-1448ھ / 2025-2026ء',
            status: 'published',
            resultSourceType: 'google_sheet',
            googleSheetUrl: targetUrl,
            sheetTabName: mcn,
            rawSourceData: '',
            lastTestedAt: new Date().toISOString(),
            testStatus: {
              success: true,
              message: 'کلاس فعال ہے',
              studentCount: 0,
              subjectCount: 0,
              subjects: [],
              missingFields: [],
            },
            students: [],
            updatedAt: new Date().toISOString(),
          };
          mClasses.push(newClassObj);
          updatedClassesMap.set(newClassObj.id, newClassObj);
        }
      });

      // If no classes exist yet locally, discover real worksheet tabs via /api/sheet-tabs
      if (mClasses.length === 0) {
        try {
          const { ok: tabOk, data: tabData } = await fetchSafeJson('/api/sheet-tabs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sheetUrl: targetUrl || `https://docs.google.com/spreadsheets/d/${sheetId}/edit`,
            }),
          });
          if (tabOk && Array.isArray(tabData?.tabs)) {
            for (const t of tabData.tabs) {
              const tName = String(t?.name || '').trim();
              if (!tName || tName === 'Master Data' || tName === 'Masters') continue;
              masterClassNames.add(tName);
              const norm = normalizeClassName(tName);
              if (!mClasses.some((c) => normalizeClassName(c.name) === norm)) {
                const newClassObj: MadrasaClass = {
                  id: `class-${madrasa.code || '101'}-${t.gid || Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
                  madrasaId: madrasa.id,
                  name: tName,
                  academicYear: '1447-1448ھ / 2025-2026ء',
                  status: 'published',
                  resultSourceType: 'google_sheet',
                  googleSheetUrl: targetUrl,
                  sheetTabName: tName,
                  rawSourceData: '',
                  lastTestedAt: new Date().toISOString(),
                  testStatus: {
                    success: true,
                    message: 'کلاس فعال ہے',
                    studentCount: 0,
                    subjectCount: 0,
                    subjects: [],
                    missingFields: [],
                  },
                  students: [],
                  updatedAt: new Date().toISOString(),
                };
                mClasses.push(newClassObj);
                updatedClassesMap.set(newClassObj.id, newClassObj);
              }
            }
          }
        } catch {}
      }

      // B: For each class, fetch Class Tab CSV and parse students
      const rules = getCentralKaifiyatRules();
      const passing = getCentralPassingSettings();

      for (const cls of mClasses) {
        const cleanName = (cls.name || '').trim();
        const cleanTabName = (cls.sheetTabName || cls.name || '').trim();
        const classUrls = [
          `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(cleanName)}&${cacheBust}`,
          `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(cleanTabName)}&${cacheBust}`,
          `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&sheet=${encodeURIComponent(cleanName)}&${cacheBust}`,
        ];

        let classCsv = '';
        for (const cu of classUrls) {
          try {
            const cr = await fetch(cu);
            if (cr.ok) {
              const ct = await cr.text();
              if (ct && !ct.trim().startsWith('<') && (ct.includes(',') || ct.includes('\n'))) {
                classCsv = ct;
                break;
              }
            }
          } catch {}
        }

        let studentsWithMaster: StudentResult[] = [];
        let classSubjects: { name: string; maxMarks: number }[] = [];

        if (classCsv) {
          const parsed = parseSheetData(classCsv, cls.name, rules, passing);
          if (parsed) {
            if (Array.isArray(parsed.subjects) && parsed.subjects.length > 0) {
              classSubjects = parsed.subjects.filter((s) => !isNonSubjectHeader(s.name));
            }
            if (Array.isArray(parsed.students) && parsed.students.length > 0) {
              studentsWithMaster = parsed.students.map((st) => {
                const sIdKey = (st.studentId || '').trim().toLowerCase();
                const sNameKey = (st.studentName || '').trim().toLowerCase();
                const masterInfo = masterMap.get(sIdKey) || masterMap.get(sNameKey);
                if (masterInfo) {
                  return {
                    ...st,
                    dob: st.dob || masterInfo.dob || '',
                    fatherName: st.fatherName || masterInfo.fatherName || '',
                    studentId: masterInfo.studentId || st.studentId || '',
                    studentNameEn: st.studentNameEn || masterInfo.studentNameEn || '',
                    fatherNameEn: st.fatherNameEn || masterInfo.fatherNameEn || '',
                  };
                }
                return st;
              });
            }
          }
        }

        if (classSubjects.length === 0) {
          const cfgSubjects = (cls.subjectsConfig || []).filter((s) => !isNonSubjectHeader(s.name));
          classSubjects = cfgSubjects.length > 0
            ? cfgSubjects.map((s) => ({ name: s.name, maxMarks: s.maxMarks }))
            : [
                { name: 'دینیات', maxMarks: 100 },
                { name: 'اردو', maxMarks: 50 },
                { name: 'عربی / فارسی', maxMarks: 100 },
                { name: 'حفظ / ناظرہ', maxMarks: 100 },
              ];
        } else {
          classSubjects = classSubjects.filter((s) => !isNonSubjectHeader(s.name));
        }

        // Merge all students from Master Data belonging to this class
        const existingIds = new Set(studentsWithMaster.map((s) => (s.studentId || '').trim().toLowerCase()));
        const existingNames = new Set(studentsWithMaster.map((s) => (s.studentName || '').trim().toLowerCase()));
        const normCls = normalizeClassName(cls.name);

        for (const mSt of masterStudentsList) {
          if (!mSt.className) continue;
          const normMCls = normalizeClassName(mSt.className);
          const isMatch = normMCls === normCls || normMCls.includes(normCls) || normCls.includes(normMCls);
          if (!isMatch) continue;

          const sIdLower = (mSt.studentId || '').trim().toLowerCase();
          const sNameLower = (mSt.studentName || '').trim().toLowerCase();
          if (existingIds.has(sIdLower) || (sNameLower && existingNames.has(sNameLower))) {
            continue;
          }

          const defaultSubMarks = classSubjects.map((sub) => ({
            name: sub.name,
            maxMarks: sub.maxMarks,
            obtainedMarks: 0,
            isAbsent: false,
            isPassed: false,
            percentage: 0,
          }));
          const totalMax = defaultSubMarks.reduce((acc, sm) => acc + sm.maxMarks, 0);

          studentsWithMaster.push({
            studentId: mSt.studentId,
            dob: mSt.dob || '',
            studentName: mSt.studentName || 'طالب علم',
            studentNameEn: mSt.studentNameEn || mSt.studentName || '',
            fatherName: mSt.fatherName || '',
            fatherNameEn: mSt.fatherNameEn || mSt.fatherName || '',
            rollNo: mSt.studentId,
            darja: cls.name,
            subjects: defaultSubMarks,
            totalMarks: totalMax,
            obtainedMarks: 0,
            percentage: 0,
            kaifiyat: 'نمبرات زیر انتظار',
            isAbsent: false,
            failedSubjectCount: 0,
          });
          existingIds.add(sIdLower);
        }

        if (studentsWithMaster.length > 0 || classCsv) {
          const updatedClass: MadrasaClass = {
            ...cls,
            subjectsConfig: classSubjects.map((s, idx) => ({
              id: `sub-${idx + 1}`,
              name: s.name,
              maxMarks: s.maxMarks,
              passingMarks: Math.ceil(s.maxMarks * 0.33),
            })),
            testStatus: {
              ...(cls.testStatus || { success: true, message: 'کلاس فعال ہے', missingFields: [] }),
              success: true,
              message: `✅ مربوط شدہ (${studentsWithMaster.length} طلبہ)`,
              studentCount: studentsWithMaster.length,
              subjectCount: classSubjects.length,
              subjects: classSubjects.map((s) => ({ name: s.name, maxMarks: s.maxMarks })),
              missingFields: [],
            },
            students: studentsWithMaster,
            status: 'published',
            resultSourceType: 'google_sheet',
            googleSheetUrl: targetUrl,
            rawSourceData: classCsv || cls.rawSourceData || '',
            updatedAt: new Date().toISOString(),
          };

          updatedClassesMap.set(cls.id, updatedClass);
          syncedCount++;
          studentsCount += studentsWithMaster.length;

          if (!isFirestoreQuotaExceeded()) {
            try {
              setDoc(doc(db, 'classes', cls.id), JSON.parse(JSON.stringify(updatedClass)), { merge: true }).catch((err) => {
                markFirestoreQuotaError(err);
              });
            } catch {}
          }
        }
      }

      // Clean up any foreign or dummy classes for this madrasa
      if (syncedCount > 0 || studentsCount > 0 || masterStudentsList.length > 0) {
        const validNames = new Set(Array.from(masterClassNames).map((n) => normalizeClassName(n)));
        mClasses.forEach((c) => {
          if (c.students && c.students.length > 0) {
            validNames.add(normalizeClassName(c.name));
          }
        });

        for (const [cId, cls] of updatedClassesMap.entries()) {
          if (cls.madrasaId === madrasa.id || cls.madrasaId === madrasa.code) {
            // If foreign 118... students in non-MM118 madrasa, delete it!
            if (madrasa.code !== 'MM118' && Array.isArray(cls.students) && cls.students.some((s: any) => String(s.studentId || '').startsWith('118'))) {
              updatedClassesMap.delete(cId);
              try { deleteDoc(doc(db, 'classes', cId)).catch(() => {}); } catch {}
              continue;
            }
            const norm = normalizeClassName(cls.name);
            if (!validNames.has(norm) && (!cls.students || cls.students.length === 0)) {
              updatedClassesMap.delete(cId);
              try { deleteDoc(doc(db, 'classes', cId)).catch(() => {}); } catch {}
            }
          }
        }
      }
    }

    const finalClasses = Array.from(updatedClassesMap.values());
    saveStoredClasses(finalClasses);

    // Update madrasa verified/approved status in storage and Firestore (preserve updatedAt if already approved)
    const statusNeedsUpdate = !madrasa.isVerified || !madrasa.managerVerified || madrasa.registrationStatus !== 'approved';
    const updatedMadaris = madaris.map((m) =>
      m.id === madrasa.id || m.code === madrasa.code
        ? {
            ...m,
            isVerified: true,
            managerVerified: true,
            registrationStatus: 'approved' as const,
            ...(statusNeedsUpdate ? { updatedAt: new Date().toISOString() } : {}),
          }
        : m
    );
    saveStoredMadaris(updatedMadaris);

    if (!isFirestoreQuotaExceeded()) {
      try {
        if (statusNeedsUpdate) {
          const updatedDocObj = updatedMadaris.find((m) => m.id === madrasa.id || m.code === madrasa.code) || {
            ...madrasa,
            isVerified: true,
            managerVerified: true,
            registrationStatus: 'approved' as const,
            updatedAt: new Date().toISOString(),
          };
          const cleanVerifiedDoc = JSON.parse(JSON.stringify(updatedDocObj));
          setDoc(doc(db, 'madaris', madrasa.id), cleanVerifiedDoc, { merge: true }).catch((err) => {
            markFirestoreQuotaError(err);
          });
        }
      } catch {}
    }

    window.dispatchEvent(
      new CustomEvent('meyar_data_updated', {
        detail: {
          madaris: updatedMadaris,
          classes: finalClasses,
          directSynced: true,
        },
      })
    );

    return {
      success: true,
      syncedClasses: syncedCount,
      totalStudents: studentsCount,
      madaris: updatedMadaris,
      classes: finalClasses,
      message: `کلاؤڈ ریکارڈ سے ${syncedCount} درجات اور ${studentsCount} طلبہ کا ڈیٹا کامیابی سے سنک ہو گیا!`,
    };
  } catch (err: any) {
    console.error('Direct client sync failed:', err);
    return { success: false, message: err.message || 'کلاؤڈ ریکارڈ سے سنک کرنے میں خامی آئی۔' };
  }
}

/**
 * Trigger Google Sheet sync for a specific madrasa
 * Tries serverless proxy first; if offline or deployed as static Netlify, seamlessly syncs directly in browser!
 */
export async function syncMadrasaGoogleSheet(
  madrasaId: string,
  madrasaObj?: Madrasa
): Promise<{
  success: boolean;
  message?: string;
  syncedClasses?: number;
  totalStudents?: number;
  madaris?: Madrasa[];
  classes?: MadrasaClass[];
}> {
  const storedTarget =
    madrasaObj ||
    getStoredMadaris().find(
      (m) =>
        m.id === madrasaId ||
        (m.code && m.code.toUpperCase() === madrasaId.toUpperCase())
    );

  // 1. Attempt Central Server Proxy (/api/madaris/:id/sync) with safe JSON parsing
  try {
    const { ok, data } = await fetchSafeJson(`/api/madaris/${encodeURIComponent(madrasaId)}/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ madrasa: storedTarget || undefined }),
    });

    if (ok && data && data.success && (data.syncedClasses > 0 || data.totalStudents > 0)) {
      const deleted = new Set(getDeletedMadrasaIds().map((s) => s.toLowerCase().trim()));
      const mergedMadaris = Array.isArray(data.madaris)
        ? mergeMadarisLists(getStoredMadaris(), data.madaris, deleted, false)
        : getStoredMadaris();
      const mergedClasses = Array.isArray(data.classes)
        ? mergeClassesLists(getStoredClasses(), data.classes, deleted)
        : getStoredClasses();
      saveStoredMadaris(mergedMadaris);
      saveStoredClasses(mergedClasses);
      if (!isFirestoreQuotaExceeded()) {
        mergedClasses.forEach((cls: MadrasaClass) => {
          if (cls.madrasaId === madrasaId || (storedTarget && cls.madrasaId === storedTarget.id)) {
            try {
              setDoc(doc(db, 'classes', cls.id), JSON.parse(JSON.stringify(cls)), { merge: true }).catch((err) => {
                markFirestoreQuotaError(err);
              });
            } catch {}
          }
        });
      }
      window.dispatchEvent(
        new CustomEvent('meyar_data_updated', {
          detail: {
            madaris: mergedMadaris,
            classes: mergedClasses,
            serverSynced: true,
          },
        })
      );
      return { ...data, madaris: mergedMadaris, classes: mergedClasses };
    }
  } catch (err) {
    console.warn('Server proxy sync notice, switching to direct client sync:', err);
  }

  // 2. Direct browser sync fallback (Runs reliably on Netlify, custom domain or serverless fallback)
  return directClientSyncMadrasaGoogleSheet(madrasaId, storedTarget);
}

/**
 * Trigger Google Sheet sync for all madaris
 */
export async function syncAllMadarisGoogleSheets(): Promise<{
  success: boolean;
  message?: string;
  syncedMadaris?: number;
  totalClasses?: number;
  totalStudents?: number;
  madaris?: Madrasa[];
  classes?: MadrasaClass[];
}> {
  try {
    const { ok, data } = await fetchSafeJson('/api/madaris/sync-all', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    if (ok && data && data.success) {
      const deleted = new Set(getDeletedMadrasaIds().map((s) => s.toLowerCase().trim()));
      const mergedMadaris = Array.isArray(data.madaris)
        ? mergeMadarisLists(getStoredMadaris(), data.madaris, deleted, false)
        : getStoredMadaris();
      const mergedClasses = Array.isArray(data.classes)
        ? mergeClassesLists(getStoredClasses(), data.classes, deleted)
        : getStoredClasses();
      saveStoredMadaris(mergedMadaris);
      saveStoredClasses(mergedClasses);
      window.dispatchEvent(
        new CustomEvent('meyar_data_updated', {
          detail: {
            madaris: mergedMadaris,
            classes: mergedClasses,
            serverSynced: true,
          },
        })
      );
      return { ...data, madaris: mergedMadaris, classes: mergedClasses };
    }
  } catch (err) {
    console.warn('Server sync-all notice, falling back to direct client sync:', err);
  }

  // Client-side sequential sync fallback
  const madaris = getStoredMadaris();
  const linked = madaris.filter((m) => m.googleSheetUrl || m.spreadsheetId);
  let totalClasses = 0;
  let totalStudents = 0;
  let syncedMadaris = 0;

  for (const m of linked) {
    const res = await directClientSyncMadrasaGoogleSheet(m.id);
    if (res.success) {
      syncedMadaris++;
      totalClasses += res.syncedClasses || 0;
      totalStudents += res.totalStudents || 0;
    }
  }

  return {
    success: true,
    syncedMadaris,
    totalClasses,
    totalStudents,
    madaris: getStoredMadaris(),
    classes: getStoredClasses(),
    message: `تمام منسلک مدارس (${syncedMadaris}) کے کلاؤڈ ریکارڈز لائیو سنک ہو گئے!`,
  };
}

/**
 * Persist madrasa to local storage first, then sync with central server
 */
export async function persistMadrasa(madrasa: Partial<Madrasa>): Promise<Madrasa[]> {
  // Always update local cache first with proper insertion / update logic
  const current = getStoredMadaris();
  let updated: Madrasa[];
  let finalMadrasaObj: Madrasa;
  const existingIndex = current.findIndex(
    (m) =>
      (madrasa.id && m.id === madrasa.id) ||
      (madrasa.code && m.code && m.code.toUpperCase() === madrasa.code.toUpperCase())
  );

  if (existingIndex !== -1) {
    const existing = current[existingIndex];
    const preservedUrl = (madrasa.googleSheetUrl && madrasa.googleSheetUrl.trim()) || existing.googleSheetUrl || '';
    finalMadrasaObj = {
      ...existing,
      ...madrasa,
      themeColor: madrasa.themeColor || existing.themeColor || '#065f46',
      logo: typeof madrasa.logo === 'string' ? madrasa.logo.trim() : (existing.logo || ''),
      googleSheetUrl: preservedUrl,
      updatedAt: new Date().toISOString(),
    } as Madrasa;
    if (finalMadrasaObj.urduName) {
      finalMadrasaObj.urduName = cleanInstitutionName(finalMadrasaObj.urduName);
    }
    if (finalMadrasaObj.englishName) {
      finalMadrasaObj.englishName = cleanInstitutionName(finalMadrasaObj.englishName);
    }
    updated = current.map((m, idx) => (idx === existingIndex ? finalMadrasaObj : m));
  } else {
    finalMadrasaObj = {
      ...(madrasa as any),
      id: madrasa.id || `madrasa-${Date.now()}`,
      themeColor: madrasa.themeColor || '#065f46',
      logo: typeof madrasa.logo === 'string' ? madrasa.logo.trim() : '',
      createdAt: madrasa.createdAt || new Date().toISOString(),
    };
    if (finalMadrasaObj.urduName) {
      finalMadrasaObj.urduName = cleanInstitutionName(finalMadrasaObj.urduName);
    }
    if (finalMadrasaObj.englishName) {
      finalMadrasaObj.englishName = cleanInstitutionName(finalMadrasaObj.englishName);
    }
    updated = [...current, finalMadrasaObj];
  }
  saveStoredMadaris(updated);
  window.dispatchEvent(
    new CustomEvent('meyar_data_updated', {
      detail: { madaris: updated, classes: getStoredClasses(), localUpdated: true },
    })
  );

  // Direct Firestore persistence (single canonical document by id, awaited with 4.5s timeout)
  if (!isFirestoreQuotaExceeded()) {
    try {
      const cleanDoc = JSON.parse(JSON.stringify(finalMadrasaObj));
      await Promise.race([
        setDoc(doc(db, 'madaris', finalMadrasaObj.id), cleanDoc, { merge: true }).catch((fsErr) => {
          handleFirestoreError(fsErr, OperationType.WRITE, `madaris/${finalMadrasaObj.id}`);
        }),
        new Promise<void>((resolve) => setTimeout(resolve, 4500)),
      ]);
    } catch (fsErr) {
      handleFirestoreError(fsErr, OperationType.WRITE, `madaris/${finalMadrasaObj.id}`);
    }
  }

  // Central server sync
  try {
    const res = await fetch('/api/madaris', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(finalMadrasaObj),
    });
    if (res.ok) {
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const json = await res.json();
        const deleted = new Set(getDeletedMadrasaIds().map((s) => s.toLowerCase().trim()));
        if (Array.isArray(json.madaris) && json.madaris.length > 0) {
          const mergedMadaris = mergeMadarisLists(getStoredMadaris(), json.madaris, deleted, false);
          saveStoredMadaris(mergedMadaris);
          updated = mergedMadaris;
        }
        const mergedClasses =
          Array.isArray(json.classes) && json.classes.length > 0
            ? mergeClassesLists(getStoredClasses(), json.classes, deleted)
            : getStoredClasses();
        if (Array.isArray(json.classes) && json.classes.length > 0) {
          saveStoredClasses(mergedClasses);
        }
        window.dispatchEvent(
          new CustomEvent('meyar_data_updated', {
            detail: { madaris: updated, classes: mergedClasses, serverSynced: true },
          })
        );
      }
    }
  } catch (e) {
    // If backend is unavailable (e.g. Netlify static hosting), forward directly to Central Google Sheet
    try {
      const centralUrl = await fetchCentralSheetUrl();
      if (centralUrl && centralUrl.startsWith('https://script.google.com/')) {
        const madrasaPayload = {
          action: 'REGISTER_MADRASA',
          type: 'madrasa',
          code: finalMadrasaObj.code,
          serialNumber: finalMadrasaObj.serialNumber,
          urduName: finalMadrasaObj.urduName,
          englishName: finalMadrasaObj.englishName,
          state: finalMadrasaObj.state || '',
          district: finalMadrasaObj.district || '',
          address: finalMadrasaObj.address || '',
          contactPhone: finalMadrasaObj.contactPhone || finalMadrasaObj.principalPhone || '',
          principalName: finalMadrasaObj.principalName || '',
          principalPhone: finalMadrasaObj.principalPhone || '',
          email: finalMadrasaObj.email || '',
          website: finalMadrasaObj.website || '',
          examTitle: finalMadrasaObj.examTitle || '',
          classes: (finalMadrasaObj as any).classes || ['حفظ', 'سال اول', 'سال دوم'],
          principalPassword: finalMadrasaObj.principalPassword || `${finalMadrasaObj.code}@1234`,
          registrationStatus: finalMadrasaObj.registrationStatus || 'pending',
        };

        fetch(centralUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify(madrasaPayload),
          mode: 'no-cors',
        }).catch(() => {
          const beaconUrl = `${centralUrl}${centralUrl.includes('?') ? '&' : '?'}action=REGISTER_MADRASA&code=${encodeURIComponent(finalMadrasaObj.code || '')}&serialNumber=${encodeURIComponent(String(finalMadrasaObj.serialNumber || ''))}&urduName=${encodeURIComponent(finalMadrasaObj.urduName || '')}&englishName=${encodeURIComponent(finalMadrasaObj.englishName || '')}&state=${encodeURIComponent(finalMadrasaObj.state || '')}&district=${encodeURIComponent(finalMadrasaObj.district || '')}&contactPhone=${encodeURIComponent(finalMadrasaObj.contactPhone || finalMadrasaObj.principalPhone || '')}&principalName=${encodeURIComponent(finalMadrasaObj.principalName || '')}&principalPhone=${encodeURIComponent(finalMadrasaObj.principalPhone || '')}&registrationStatus=${encodeURIComponent(finalMadrasaObj.registrationStatus || 'pending')}`;
          fetch(beaconUrl, { mode: 'no-cors' }).catch(() => {});
        });
      }
    } catch {}
  }

  return updated;
}

/**
 * Delete madrasa from central server, Firestore and update local storage
 * Guarantees ONLY this specific madrasa is deleted, and records deleted ID so it never resurfaces.
 */
export async function deleteMadrasaFromServer(id: string): Promise<{ madaris: Madrasa[]; classes: MadrasaClass[] }> {
  const currentMadaris = getStoredMadaris();
  const searchId = String(id || '').trim().toLowerCase();
  const target = currentMadaris.find(
    (m) =>
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

  // Add to local deleted tracking
  idsToDelete.forEach((d) => addDeletedMadrasaId(d));
  if (targetCode) addDeletedMadrasaId(targetCode);
  if (targetId) addDeletedMadrasaId(targetId);

  // Optimistically remove only this specific madrasa; other madaris remain unaffected
  const initialUpdatedMadaris = currentMadaris.filter(
    (m) =>
      !idsToDelete.has(String(m.id || '').trim().toLowerCase()) &&
      !idsToDelete.has(String(m.code || '').trim().toLowerCase())
  );
  const initialUpdatedClasses = getStoredClasses().filter(
    (c) =>
      !idsToDelete.has(String(c.madrasaId || '').trim().toLowerCase()) &&
      !idsToDelete.has(String(c.id || '').trim().toLowerCase())
  );
  saveStoredMadaris(initialUpdatedMadaris);
  saveStoredClasses(initialUpdatedClasses);
  window.dispatchEvent(
    new CustomEvent('meyar_data_updated', {
      detail: { madaris: initialUpdatedMadaris, classes: initialUpdatedClasses, deleted: id },
    })
  );

  // Delete from Firestore & persist deletion list to system_configs/deleted_madaris
  if (!isFirestoreQuotaExceeded()) {
    try {
      await syncDeletedIdsToFirestore(getDeletedMadrasaIds());
      if (targetId) {
        await deleteDoc(doc(db, 'madaris', targetId)).catch(() => {});
      }
      if (id && id !== targetId) {
        await deleteDoc(doc(db, 'madaris', id)).catch(() => {});
      }
      if (targetCode && targetCode !== targetId && targetCode !== id) {
        await deleteDoc(doc(db, 'madaris', targetCode)).catch(() => {});
        await deleteDoc(doc(db, 'madaris', String(targetCode).toUpperCase())).catch(() => {});
      }
      // Also delete any associated classes from Firestore
      if (targetId) {
        const cSnap1 = await getDocs(query(collection(db, 'classes'), where('madrasaId', '==', targetId)));
        cSnap1.forEach((d) => deleteDoc(d.ref).catch(() => {}));
      }
      if (targetCode && targetCode !== targetId) {
        const cSnap2 = await getDocs(query(collection(db, 'classes'), where('madrasaId', '==', targetCode)));
        cSnap2.forEach((d) => deleteDoc(d.ref).catch(() => {}));
      }
    } catch (fsErr) {
      handleFirestoreError(fsErr, OperationType.DELETE, `madaris/${targetId}`);
    }
  }

  // Delete from central server
  try {
    const res = await fetch(`/api/madaris/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (res.ok) {
      const json = await res.json();
      if (Array.isArray(json.deletedMadrasaIds)) {
        json.deletedMadrasaIds.forEach((dId: string) => addDeletedMadrasaId(dId));
      }
      const deleted = new Set(getDeletedMadrasaIds().map((s) => s.toLowerCase().trim()));
      const mergedMadaris = Array.isArray(json.madaris)
        ? mergeMadarisLists(initialUpdatedMadaris, json.madaris, deleted, false)
        : initialUpdatedMadaris;
      const mergedClasses = Array.isArray(json.classes)
        ? mergeClassesLists(initialUpdatedClasses, json.classes, deleted)
        : initialUpdatedClasses;
      saveStoredMadaris(mergedMadaris);
      saveStoredClasses(mergedClasses);
      return { madaris: mergedMadaris, classes: mergedClasses };
    }
  } catch (e) {
    console.error('Failed to delete madrasa from server:', e);
  }

  return { madaris: initialUpdatedMadaris, classes: initialUpdatedClasses };
}

/**
 * Super Admin Action: Reset / Clear all madaris and classes
 */
export async function clearAllMadarisFromServer(): Promise<{ success: boolean; madaris: Madrasa[]; classes: MadrasaClass[] }> {
  // Clear local storage
  saveStoredMadaris([]);
  saveStoredClasses([]);

  window.dispatchEvent(
    new CustomEvent('meyar_data_updated', {
      detail: { madaris: [], classes: [], clearedAll: true },
    })
  );

  try {
    const res = await fetch('/api/madaris/clear-all', { method: 'POST' });
    if (res.ok) {
      const json = await res.json();
      return { success: true, madaris: [], classes: [] };
    }
  } catch (e) {
    console.error('Failed to clear all madaris on server:', e);
  }

  return { success: true, madaris: [], classes: [] };
}

const STORAGE_KEY_CENTRAL_SHEET_URL = 'meyar_central_sheet_url_v1';

export async function fetchCentralSheetUrl(): Promise<string> {
  // 1. Try server first
  try {
    const { ok, data } = await fetchSafeJson<{ url?: string }>('/api/central-sheet-url');
    if (ok && data?.url) {
      const clean = sanitizeAppsScriptUrl(data.url);
      if (clean) {
        try {
          localStorage.setItem(STORAGE_KEY_CENTRAL_SHEET_URL, clean);
        } catch {}
        return clean;
      }
    }
  } catch {}

  // 2. Try localStorage (for Netlify / static deployment)
  try {
    const cached = localStorage.getItem(STORAGE_KEY_CENTRAL_SHEET_URL);
    if (cached) {
      const clean = sanitizeAppsScriptUrl(cached);
      if (clean) return clean;
    }
  } catch {}

  // 3. Fallback to default
  return DEFAULT_CENTRAL_SHEET_URL;
}

export async function saveCentralSheetUrl(url: string): Promise<boolean> {
  const cleanUrl = sanitizeAppsScriptUrl(url) || DEFAULT_CENTRAL_SHEET_URL;
  try {
    localStorage.setItem(STORAGE_KEY_CENTRAL_SHEET_URL, cleanUrl);
  } catch {}

  try {
    await fetchSafeJson('/api/central-sheet-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: cleanUrl }),
    });
  } catch {}

  return true;
}

export async function fetchSheetEditorScriptUrl(): Promise<string> {
  try {
    const { ok, data } = await fetchSafeJson<{ url?: string }>('/api/sheet-editor-script-url');
    if (ok && data?.url) {
      const clean = sanitizeAppsScriptUrl(data.url);
      if (clean) {
        try {
          localStorage.setItem(STORAGE_KEY_SHEET_EDITOR_SCRIPT_URL, clean);
        } catch {}
        return clean;
      }
    }
  } catch {}

  if (!isFirestoreQuotaExceeded()) {
    try {
      const snap = await getDoc(doc(db, 'system_configs', 'sheet_editor_script'));
      if (snap.exists()) {
        const clean = sanitizeAppsScriptUrl((snap.data() as any)?.url);
        if (clean) {
          try {
            localStorage.setItem(STORAGE_KEY_SHEET_EDITOR_SCRIPT_URL, clean);
          } catch {}
          return clean;
        }
      }
    } catch {}
  }

  try {
    const cached = localStorage.getItem(STORAGE_KEY_SHEET_EDITOR_SCRIPT_URL);
    if (cached) {
      const clean = sanitizeAppsScriptUrl(cached);
      if (clean) return clean;
    }
  } catch {}

  return '';
}

export async function saveSheetEditorScriptUrl(url: string): Promise<string> {
  const cleanUrl = sanitizeAppsScriptUrl(url) || '';
  try {
    if (cleanUrl) localStorage.setItem(STORAGE_KEY_SHEET_EDITOR_SCRIPT_URL, cleanUrl);
    else localStorage.removeItem(STORAGE_KEY_SHEET_EDITOR_SCRIPT_URL);
  } catch {}

  try {
    await fetchSafeJson('/api/sheet-editor-script-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: cleanUrl }),
    });
  } catch {}

  if (!isFirestoreQuotaExceeded()) {
    try {
      await setDoc(
        doc(db, 'system_configs', 'sheet_editor_script'),
        {
          id: 'sheet_editor_script',
          url: cleanUrl,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
    } catch (e) {
      markFirestoreQuotaError(e);
    }
  }

  return cleanUrl;
}


/**
 * Persist class to local storage first, then sync with Firestore and central server
 */
export async function persistClass(cls: Partial<MadrasaClass>): Promise<MadrasaClass[]> {
  const current = getStoredClasses();
  let updated: MadrasaClass[];
  let finalClassObj: MadrasaClass;
  const existingIndex = current.findIndex((c) => cls.id && c.id === cls.id);

  if (existingIndex !== -1) {
    finalClassObj = {
      ...current[existingIndex],
      ...cls,
      updatedAt: new Date().toISOString(),
    } as MadrasaClass;
    updated = current.map((c, idx) => (idx === existingIndex ? finalClassObj : c));
  } else {
    finalClassObj = {
      ...(cls as any),
      id: cls.id || `class-${Date.now()}`,
      updatedAt: new Date().toISOString(),
    };
    updated = [...current, finalClassObj];
  }
  saveStoredClasses(updated);
  window.dispatchEvent(
    new CustomEvent('meyar_data_updated', {
      detail: { madaris: getStoredMadaris(), classes: updated, localUpdated: true },
    })
  );

  if (!isFirestoreQuotaExceeded()) {
    try {
      const cleanDoc = JSON.parse(JSON.stringify(finalClassObj));
      await setDoc(doc(db, 'classes', finalClassObj.id), cleanDoc, { merge: true });
    } catch (fsErr) {
      markFirestoreQuotaError(fsErr);
      console.warn('Firestore persist class notice:', fsErr);
    }
  }

  try {
    const res = await fetch('/api/classes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(finalClassObj),
    });
    if (res.ok) {
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const json = await res.json();
        if (Array.isArray(json.classes) && json.classes.length > 0) {
          saveStoredClasses(json.classes);
          updated = json.classes;
        }
      }
    }
  } catch (e) {
    console.warn('Central server sync for class skipped (local & Firestore preserved):', e);
  }

  return updated;
}

/**
 * Admin Action: Verify & Approve a madrasa and optionally attach Google Sheet URL
 */
export async function verifyAndApproveMadrasa(
  madrasaIdOrObj: string | Madrasa,
  approved: boolean = true,
  sheetUrl?: string
): Promise<{ madaris: Madrasa[]; classes: MadrasaClass[] }> {
  const madrasaId = typeof madrasaIdOrObj === 'string' ? madrasaIdOrObj : madrasaIdOrObj.id;
  const passedObj = typeof madrasaIdOrObj === 'object' ? madrasaIdOrObj : null;

  const currentMadaris = getStoredMadaris();
  const m = currentMadaris.find((item) => item.id === madrasaId || (passedObj && item.code === passedObj.code)) || passedObj;

  const finalSheetUrl = (sheetUrl !== undefined && sheetUrl.trim() !== '') 
    ? sheetUrl.trim() 
    : (m?.googleSheetUrl || '');

  const updatedM: Madrasa = {
    ...(m || {} as any),
    id: madrasaId,
    registrationStatus: approved ? 'approved' : 'pending',
    isVerified: approved,
    approvedAt: approved ? new Date().toISOString() : undefined,
    googleSheetUrl: finalSheetUrl,
    updatedAt: new Date().toISOString(),
  };

  // 1. Update local storage immediately
  const existingIdx = currentMadaris.findIndex((item) => item.id === madrasaId || item.code === updatedM.code);
  let updatedMadaris: Madrasa[];
  if (existingIdx !== -1) {
    updatedMadaris = currentMadaris.map((item, idx) => (idx === existingIdx ? { ...item, ...updatedM } : item));
  } else {
    updatedMadaris = [...currentMadaris, updatedM];
  }
  saveStoredMadaris(updatedMadaris);

  // 2. Direct Firestore update (single canonical doc by madrasaId with required fields)
  if (!isFirestoreQuotaExceeded()) {
    try {
      const cleanVerifiedPayload = JSON.parse(
        JSON.stringify({
          ...updatedM,
          id: madrasaId,
          code: updatedM.code || madrasaId,
          urduName: updatedM.urduName || 'مدرسہ',
          registrationStatus: approved ? 'approved' : 'pending',
          isVerified: approved,
          managerVerified: approved,
          approvedAt: approved ? new Date().toISOString() : null,
          updatedAt: new Date().toISOString(),
          ...(finalSheetUrl ? { googleSheetUrl: finalSheetUrl } : {}),
        })
      );
      await setDoc(doc(db, 'madaris', madrasaId), cleanVerifiedPayload, { merge: true }).catch((err) => {
        handleFirestoreError(err, OperationType.WRITE, `madaris/${madrasaId}`);
      });
    } catch (fsErr) {
      handleFirestoreError(fsErr, OperationType.WRITE, `madaris/${madrasaId}`);
    }
  }

  let updatedClasses = getStoredClasses();

  // 3. Central server verify call
  try {
    const res = await fetch(`/api/madaris/${madrasaId}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approved, sheetUrl: finalSheetUrl, madrasa: updatedM }),
    });
    if (res.ok) {
      const data = await res.json();
      const deleted = new Set(getDeletedMadrasaIds().map((s) => s.toLowerCase().trim()));
      if (Array.isArray(data.madaris)) {
        updatedMadaris = mergeMadarisLists(getStoredMadaris(), data.madaris, deleted, false);
        saveStoredMadaris(updatedMadaris);
      }
      if (Array.isArray(data.classes)) {
        updatedClasses = mergeClassesLists(getStoredClasses(), data.classes, deleted);
        saveStoredClasses(updatedClasses);
      }
    }
  } catch (srvErr) {
    console.warn('Server verify notice:', srvErr);
  }

  // 4. If approved and still lacking a Google Sheet URL (e.g. on Netlify or serverless), auto-generate via GAS workflow
  const targetApprovedMadrasa = updatedMadaris.find((item) => item.id === madrasaId || (passedObj && item.code === passedObj.code));
  if (approved && targetApprovedMadrasa && (!targetApprovedMadrasa.googleSheetUrl || !targetApprovedMadrasa.googleSheetUrl.includes('/spreadsheets/d/'))) {
    try {
      const classList = updatedClasses.filter((c) => c.madrasaId === madrasaId).map((c) => c.name);
      const gasRes = await registerMadrasaWorkflow({
        code: targetApprovedMadrasa.code,
        name: targetApprovedMadrasa.urduName,
        classes: classList.length > 0 ? classList : ['حفظ', 'سال اول', 'سال دوم'],
        madrasaId,
      });
      if (gasRes?.sheetUrl) {
        targetApprovedMadrasa.googleSheetUrl = gasRes.sheetUrl;
        targetApprovedMadrasa.spreadsheetId = gasRes.spreadsheetId;
        const targetSheetUrl = gasRes.sheetUrl || '';
        updatedClasses = updatedClasses.map((c) =>
          c.madrasaId === madrasaId
            ? { ...c, googleSheetUrl: targetSheetUrl, resultSourceType: 'google_sheet' as const, status: 'published' as const }
            : c
        );
        saveStoredMadaris(updatedMadaris);
        saveStoredClasses(updatedClasses);

        // Persist to Firestore for multi-device sync
        if (!isFirestoreQuotaExceeded()) {
          try {
            const fsUpdate = JSON.parse(JSON.stringify({
              googleSheetUrl: gasRes.sheetUrl,
              spreadsheetId: gasRes.spreadsheetId,
              registrationStatus: 'approved',
              isVerified: true,
              managerVerified: true,
              approvedAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            }));
            await setDoc(doc(db, 'madaris', madrasaId), fsUpdate, { merge: true });
            for (const c of updatedClasses) {
              if (c.madrasaId === madrasaId) {
                await setDoc(doc(db, 'classes', c.id), JSON.parse(JSON.stringify(c)), { merge: true });
              }
            }
          } catch (fsErr) {
            handleFirestoreError(fsErr, OperationType.WRITE, `madaris/${madrasaId}`);
          }
        }

        // Trigger auto sync from the new sheet
        try {
          await syncMadrasaGoogleSheet(madrasaId);
          updatedClasses = getStoredClasses();
        } catch (syncErr) {
          console.warn('Auto sync in verifyAndApproveMadrasa notice:', syncErr);
        }
      }
    } catch (gasErr) {
      console.warn('Direct fallback registerMadrasaWorkflow notice:', gasErr);
    }
  }

  const finalCheckMadrasa = updatedMadaris.find((item) => item.id === madrasaId || (passedObj && item.code === passedObj.code));
  if (finalCheckMadrasa?.googleSheetUrl) {
    try {
      await syncMadrasaGoogleSheet(madrasaId);
      updatedClasses = getStoredClasses();
    } catch (syncErr) {
      console.warn('Auto sync in verifyAndApproveMadrasa notice:', syncErr);
    }
  }

  window.dispatchEvent(
    new CustomEvent('meyar_data_updated', {
      detail: { madaris: updatedMadaris, classes: updatedClasses, verified: true },
    })
  );

  return { madaris: updatedMadaris, classes: updatedClasses };
}

/**
 * Delete class from central server and update local storage
 */
export async function deleteClassFromServer(id: string): Promise<MadrasaClass[]> {
  try {
    const { ok, data } = await fetchSafeJson(`/api/classes/${id}`, { method: 'DELETE' });
    if (ok && data && Array.isArray(data.classes)) {
      saveStoredClasses(data.classes);
      return data.classes;
    }
  } catch (e) {
    console.error('Failed to delete class from server:', e);
  }
  const updated = getStoredClasses().filter((c) => c.id !== id);
  saveStoredClasses(updated);
  return updated;
}

/**
 * Check central server health
 */
export async function checkServerStatus(): Promise<{ online: boolean; stats?: any }> {
  try {
    const { ok, data } = await fetchSafeJson('/api/status', { cache: 'no-cache' });
    if (ok && data) {
      return { online: true, stats: data.stats };
    }
    return { online: false };
  } catch {
    return { online: false };
  }
}

export function areDatesEqual(d1: string, d2: string): boolean {
  if (!d1 || !d2) return false;
  const n1 = normalizeDate(d1).trim();
  const n2 = normalizeDate(d2).trim();
  if (n1 === n2) return true;

  const p1 = n1.replace(/[-.]/g, '/').split('/').map((x) => parseInt(x, 10));
  const p2 = n2.replace(/[-.]/g, '/').split('/').map((x) => parseInt(x, 10));
  if (p1.length === 3 && p2.length === 3 && !p1.some(isNaN) && !p2.some(isNaN)) {
    if (p1[2] === p2[2]) {
      if (p1[1] === p2[1] && p1[0] === p2[0]) return true;
      if (p1[1] === p2[0] && p1[0] === p2[1]) return true;
    }
  }
  return false;
}

/**
 * Search student directly on the live central server so any student/parent
 * on any browser, device, or location in the world gets instant up-to-date results!
 */
export async function searchStudentOnServer(
  studentId: string,
  dob: string
): Promise<SearchResultMatch | { error: string }> {
  const cleanId = studentId.trim();
  const cleanDob = normalizeDate(dob);

  if (!cleanId || !cleanDob) {
    return { error: 'برائے مہربانی طالب علم آئی ڈی اور تاریخِ پیدائش دونوں درج فرمائیں۔' };
  }

  // 1. First attempt: Call central server API
  try {
    const { ok, data } = await fetchSafeJson('/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId: cleanId, dob: cleanDob }),
    });

    if (ok && data && data.success && data.result) {
      return data.result as SearchResultMatch;
    }

    if (data && data.error && !data.error.includes('نہیں مل سکا') && !data.error.includes('not found') && !data.error.includes('مماثل')) {
      return { error: data.error };
    }
  } catch (err) {
    console.warn('Central server search failed, trying local fallback:', err);
  }

  // 2. Identify target madrasa from student ID prefix or code
  const madaris = getStoredMadaris();
  const linked = madaris.filter((m) => m.googleSheetUrl || m.spreadsheetId);
  const idPrefix = cleanId.slice(0, 3);
  const targetMadrasa = linked.find(
    (m) =>
      (m.code || '').replace(/\D/g, '').endsWith(idPrefix) ||
      (m.code || '').includes(idPrefix) ||
      String(m.serialNumber || '').includes(idPrefix)
  ) || (linked.length > 0 ? linked[0] : null);

  // 3. Live Google Sheet Auto-Sync:
  // Pull fresh live marks from Google Sheet so absent marks ('غ') or score updates appear immediately!
  if (targetMadrasa) {
    try {
      await directClientSyncMadrasaGoogleSheet(targetMadrasa.id);
    } catch (e) {
      console.warn('Live sheet sync during search error:', e);
    }
  }

  // 4. Search student in updated classes and recalculate fresh
  const localMatch = searchPublishedStudent(cleanId, cleanDob);
  if (!('error' in localMatch)) {
    const effective = getEffectiveMadrasaResultLogic(localMatch.madrasa);
    const recal = recalculateStudentResult(localMatch.student, effective.rules, effective.passing);
    const hasAb =
      recal.isAbsent === true ||
      (Array.isArray(recal.subjects) &&
        recal.subjects.some(
          (s) => s.isAbsent === true || s.obtainedMarks === 'غ' || isAbsentCell(s.obtainedMarks)
        ));
    if (hasAb) {
      recal.isAbsent = true;
      recal.kaifiyat = effective.passing?.absentFailLabel || 'ناکام';
    }
    return {
      ...localMatch,
      student: recal,
    };
  }

  return { error: 'Result not found. Please check Student ID and Date of Birth.' };
}

export function getAdminPin(): string {
  try {
    return localStorage.getItem(STORAGE_KEY_RESULT_ADMIN_PIN) || localStorage.getItem(STORAGE_KEY_ADMIN_PIN) || DEFAULT_RESULT_ADMIN_PIN;
  } catch {
    return DEFAULT_RESULT_ADMIN_PIN;
  }
}

export function setAdminPin(newPin: string): void {
  try {
    localStorage.setItem(STORAGE_KEY_ADMIN_PIN, newPin);
    localStorage.setItem(STORAGE_KEY_RESULT_ADMIN_PIN, newPin);
  } catch (e) {
    console.error('Failed to save admin pin', e);
  }
}

export function getResultAdminPin(): string {
  try {
    return localStorage.getItem(STORAGE_KEY_RESULT_ADMIN_PIN) || localStorage.getItem(STORAGE_KEY_ADMIN_PIN) || DEFAULT_RESULT_ADMIN_PIN;
  } catch {
    return DEFAULT_RESULT_ADMIN_PIN;
  }
}

export function setResultAdminPin(newPin: string): void {
  try {
    localStorage.setItem(STORAGE_KEY_RESULT_ADMIN_PIN, newPin);
    localStorage.setItem(STORAGE_KEY_ADMIN_PIN, newPin);
  } catch (e) {
    console.error('Failed to save result admin pin', e);
  }
}

export function getManagerAdminPin(): string {
  try {
    return localStorage.getItem(STORAGE_KEY_MANAGER_ADMIN_PIN) || DEFAULT_MANAGER_ADMIN_PIN;
  } catch {
    return DEFAULT_MANAGER_ADMIN_PIN;
  }
}

export function setManagerAdminPin(newPin: string): void {
  try {
    localStorage.setItem(STORAGE_KEY_MANAGER_ADMIN_PIN, newPin);
  } catch (e) {
    console.error('Failed to save manager admin pin', e);
  }
}

/**
 * Generate next serial code automatically:
 * Strictly follows format MM<NumericCode> (e.g. MM111, MM112, MM114, MM115...)
 * Scans both provided array and local storage to prevent any collision or duplication.
 */
export function getNextMadrasaCode(madaris: Madrasa[]): { code: string; serial: number } {
  const localList = typeof window !== 'undefined' ? getStoredMadaris() : [];
  const combined = [...(Array.isArray(madaris) ? madaris : []), ...(Array.isArray(localList) ? localList : [])];

  let maxSerial = 0;
  const seenCodes = new Set<string>();

  combined.forEach((m) => {
    if (!m) return;
    if (m.serialNumber && typeof m.serialNumber === 'number' && m.serialNumber > maxSerial) {
      maxSerial = m.serialNumber;
    }
    const rawCode = String(m.code || '').trim().toUpperCase();
    if (rawCode) {
      seenCodes.add(rawCode);
      const match = rawCode.match(/(\d+)/);
      if (match) {
        const val = parseInt(match[1], 10);
        if (val > maxSerial) {
          maxSerial = val;
        }
      }
    }
  });

  // Default starting sequence is 111 (MM111) if no higher numeric code exists
  let nextSerial = maxSerial > 0 ? maxSerial + 1 : 111;
  if (nextSerial < 111 && maxSerial <= 12) {
    nextSerial = 111;
  }

  // Ensure this code is strictly unused and increments dynamically
  while (seenCodes.has(`MM${nextSerial}`)) {
    nextSerial++;
  }

  const code = `MM${nextSerial}`;
  return { code, serial: nextSerial };
}

/**
 * Search student across all published classes
 * Security rule:
 * Both Student ID and DOB must match strictly!
 * If not found, return generic message without revealing if ID or DOB was wrong.
 */
export function searchPublishedStudent(
  studentId: string,
  dob: string
): SearchResultMatch | { error: string } {
  const cleanId = studentId.trim();
  const cleanDob = normalizeDate(dob);

  if (!cleanId || !cleanDob) {
    return { error: 'برائے مہربانی طالب علم آئی ڈی اور تاریخِ پیدائش دونوں درج فرمائیں۔' };
  }

  const madaris = getStoredMadaris();
  const classes = getStoredClasses();

  // Find in classes
  for (const cls of classes) {
    if (!Array.isArray(cls.students)) continue;

    for (const student of cls.students) {
      // Compare ID case-insensitively & trimmed
      const idMatches = (student.studentId || '').trim().toLowerCase() === cleanId.toLowerCase();
      const dobMatches = areDatesEqual(student.dob, cleanDob);

      if (idMatches && (!cleanDob || dobMatches)) {
        const madrasa = madaris.find((m) => m.id === cls.madrasaId);
        if (!madrasa) continue;

        // 1. Super Admin Approval Check:
        // Only after Super Admin approval should the madrasa's results become publicly visible.
        if (madrasa.registrationStatus !== 'approved') {
          return {
            error: 'اس ادارے کے امتحانی نتائج مرکزی ایڈمن کی منظوری کے منتظر ہیں۔ (Pending Super Admin Approval)',
          };
        }

        // 2. Madrasa ON/OFF Toggle Check:
        // Public results visible ONLY when ON. When OFF, its results must not appear.
        if (madrasa.showPublicResults === false) {
          return {
            error: 'اس ادارے کے امتحانی نتائج فی الوقت غیر فعال (OFF) ہیں۔ برائے مہربانی مدرسہ انتظامیہ سے رابطہ فرمائیں۔',
          };
        }

        // 3. Class Publication Status Check:
        if (cls.status !== 'published') {
          return {
            error: 'اس درجے کا رزلٹ ابھی شائع نہیں کیا گیا۔ برائے مہربانی مدرسہ دفتر سے رابطہ فرمائیں۔',
          };
        }

        const effective = getEffectiveMadrasaResultLogic(madrasa);
        const recal = recalculateStudentResult(student, effective.rules, effective.passing);
        const hasAb =
          recal.isAbsent === true ||
          (Array.isArray(recal.subjects) &&
            recal.subjects.some(
              (s) => s.isAbsent === true || s.obtainedMarks === 'غ' || isAbsentCell(s.obtainedMarks)
            ));
        if (hasAb) {
          recal.isAbsent = true;
          recal.kaifiyat = effective.passing?.absentFailLabel || 'ناکام';
        }

        return {
          student: recal,
          madrasa,
          madrasaClass: cls,
        };
      }
    }
  }

  // Generic secure error message as specified by user
  return { error: 'Result not found. Please check Student ID and Date of Birth.' };
}

export function resetToDefaults(): void {
  localStorage.setItem(STORAGE_KEY_MADARIS, JSON.stringify(SEED_MADARIS));
  localStorage.setItem(STORAGE_KEY_CLASSES, JSON.stringify(SEED_CLASSES));
  localStorage.setItem(STORAGE_KEY_ADMIN_PIN, DEFAULT_ADMIN_PIN);
}

const STORAGE_KEY_PORTAL_LOGO = 'meyar_portal_logo_v1';

export function getPortalLogo(): string {
  try {
    const customLogo = localStorage.getItem(STORAGE_KEY_PORTAL_LOGO);
    if (customLogo) return customLogo;
  } catch {
    // Ignore error
  }
  return '/logo.jpg';
}

export async function savePortalLogo(logoUrl: string): Promise<{ success: boolean; error?: string }> {
  try {
    localStorage.setItem(STORAGE_KEY_PORTAL_LOGO, logoUrl);
    window.dispatchEvent(new CustomEvent('portal_logo_updated', { detail: { logo: logoUrl } }));
    const res = await fetch('/api/portal-logo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ logo: logoUrl }),
    }).catch((err) => {
      console.warn('Failed to persist portal logo to server', err);
      return null;
    });

    if (res && !res.ok) {
      const data = await res.json().catch(() => ({}));
      return { success: false, error: data.error || 'سرور پر لوگو محفوظ نہ ہو سکا' };
    }
    return { success: true };
  } catch (err: any) {
    console.error('Failed to save portal logo', err);
    return { success: true };
  }
}

const STORAGE_KEY_DEFAULT_CLASSES = 'meyar_default_classes_v1';
export const DEFAULT_CLASSES_UPDATED_EVENT = 'meyar_default_classes_updated';

export const DEFAULT_REGISTRATION_CLASSES = [
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

export function getStoredDefaultClasses(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_DEFAULT_CLASSES);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (e) {
    console.warn('Failed to parse default classes from storage', e);
  }
  return DEFAULT_REGISTRATION_CLASSES;
}

export async function fetchStoredDefaultClasses(): Promise<string[]> {
  try {
    const res = await fetch('/api/default-classes');
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.classes) && data.classes.length > 0) {
        localStorage.setItem(STORAGE_KEY_DEFAULT_CLASSES, JSON.stringify(data.classes));
        return data.classes;
      }
    }
  } catch (e) {
    console.warn('Could not fetch default classes from server', e);
  }
  return getStoredDefaultClasses();
}

export async function saveStoredDefaultClasses(classes: string[]): Promise<void> {
  try {
    localStorage.setItem(STORAGE_KEY_DEFAULT_CLASSES, JSON.stringify(classes));
    window.dispatchEvent(new CustomEvent(DEFAULT_CLASSES_UPDATED_EVENT, { detail: { classes } }));
    await fetch('/api/default-classes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ classes }),
    }).catch((e) => console.warn('Failed to persist default classes to server', e));
  } catch (e) {
    console.warn('Failed to save default classes to storage', e);
  }
}

// -------------------------------------------------------------
// Central Exam Title & Academic Year Management
// -------------------------------------------------------------
const STORAGE_KEY_CENTRAL_EXAM_TITLE = 'meyar_central_exam_title_v1';
export const DEFAULT_EXAM_TITLE_UPDATED_EVENT = 'meyar_central_exam_title_updated';

export interface CentralExamTitleInfo {
  examTitle: string;
  examTitleEn?: string;
  academicYear?: string;
  applyToAllMadaris?: boolean;
}

export async function fetchCentralExamTitle(): Promise<CentralExamTitleInfo> {
  try {
    const res = await fetch('/api/central-exam-title');
    if (res.ok) {
      const data = await res.json();
      if (typeof data === 'string' && data.trim()) {
        const obj = {
          examTitle: data.trim(),
          examTitleEn: 'Annual Examination Result 1447-1448H / 2026',
          academicYear: '1447-1448ھ / 2026ء',
        };
        localStorage.setItem(STORAGE_KEY_CENTRAL_EXAM_TITLE, JSON.stringify(obj));
        return obj;
      }
      if (data && data.examTitle) {
        localStorage.setItem(STORAGE_KEY_CENTRAL_EXAM_TITLE, JSON.stringify(data));
        return data;
      }
    }
  } catch (e) {
    console.warn('Could not fetch exam title from server', e);
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY_CENTRAL_EXAM_TITLE);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch {}

  return {
    examTitle: 'سالانہ امتحان 1447-1448ھ / 2026ء',
    examTitleEn: 'Annual Examination Result 1447-1448H / 2026',
    academicYear: '1447-1448ھ / 2026ء',
  };
}

export async function saveCentralExamTitle(
  info: CentralExamTitleInfo
): Promise<{ success: boolean; message?: string }> {
  try {
    localStorage.setItem(STORAGE_KEY_CENTRAL_EXAM_TITLE, JSON.stringify(info));
    window.dispatchEvent(
      new CustomEvent(DEFAULT_EXAM_TITLE_UPDATED_EVENT, { detail: info })
    );
    const res = await fetch('/api/central-exam-title', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(info),
    });
    if (res.ok) {
      const data = await res.json();
      return { success: true, message: data.message };
    }
    return { success: true };
  } catch (e: any) {
    console.warn('Failed to save exam title to server', e);
    return { success: true };
  }
}

// -------------------------------------------------------------
// Portal Launch Timer Helpers (کاؤنٹ ڈاؤن و افتتاحی لانچ)
// -------------------------------------------------------------
export const STORAGE_KEY_LAUNCH_TIMER = 'meyar_portal_launch_timer_v1';
export const LAUNCH_TIMER_UPDATED_EVENT = 'meyar_launch_timer_updated';

export const DEFAULT_LAUNCH_TIMER: PortalLaunchTimer = {
  enabled: false,
  targetDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
  title: 'معیارِ مدارس — امتحانی نتائج کا باضابطہ اعلان و افتتاح',
  message: 'ان شاء اللہ جلد ہی سالانہ امتحانی نتائج کا باضابطہ اعلان کیا جائے گا۔',
  isLaunched: false,
};

export function getStoredLaunchTimer(): PortalLaunchTimer {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_LAUNCH_TIMER);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.enabled === 'boolean') {
        return {
          ...DEFAULT_LAUNCH_TIMER,
          ...parsed,
        };
      }
    }
  } catch (e) {
    console.warn('Failed to parse launch timer from local storage', e);
  }
  return { ...DEFAULT_LAUNCH_TIMER };
}

export async function fetchLaunchTimer(): Promise<PortalLaunchTimer> {
  try {
    const res = await fetch('/api/launch-timer');
    if (res.ok) {
      const data = await res.json();
      if (data && typeof data.enabled === 'boolean') {
        const merged: PortalLaunchTimer = {
          ...DEFAULT_LAUNCH_TIMER,
          ...data,
        };
        localStorage.setItem(STORAGE_KEY_LAUNCH_TIMER, JSON.stringify(merged));
        return merged;
      }
    }
  } catch (e) {
    console.warn('Could not fetch launch timer from server', e);
  }
  return getStoredLaunchTimer();
}

export async function saveStoredLaunchTimer(
  timer: Partial<PortalLaunchTimer>
): Promise<{ success: boolean; launchTimer: PortalLaunchTimer }> {
  const current = getStoredLaunchTimer();
  const updated: PortalLaunchTimer = {
    ...current,
    ...timer,
    updatedAt: new Date().toISOString(),
  };

  try {
    localStorage.setItem(STORAGE_KEY_LAUNCH_TIMER, JSON.stringify(updated));
    window.dispatchEvent(
      new CustomEvent(LAUNCH_TIMER_UPDATED_EVENT, { detail: updated })
    );

    // Save to Firestore system_configs/launchTimer if available
    if (!isFirestoreQuotaExceeded()) {
      try {
        const launchDocRef = doc(db, 'system_configs', 'launchTimer');
        await setDoc(launchDocRef, { id: 'launchTimer', ...updated }, { merge: true });
      } catch (fsErr) {
        handleFirestoreError(fsErr, OperationType.WRITE, 'system_configs/launchTimer');
      }
    }

    // Save to central server
    await fetch('/api/launch-timer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    }).catch(() => {});

    return { success: true, launchTimer: updated };
  } catch (err: any) {
    console.error('Failed to save launch timer:', err);
    return { success: false, launchTimer: updated };
  }
}

// -------------------------------------------------------------
// State Managers & Verification Helpers
// -------------------------------------------------------------
export async function fetchStateManagers(): Promise<StateManager[]> {
  try {
    const res = await fetch('/api/state-managers');
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.managers)) {
        return data.managers;
      }
    }
  } catch (err) {
    console.warn('Failed to fetch state managers from server:', err);
  }
  return [];
}

export async function saveStateManager(
  managerData: Partial<StateManager>
): Promise<{ success: boolean; managers: StateManager[]; error?: string }> {
  try {
    const { ok, data } = await fetchSafeJson('/api/state-managers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(managerData),
    });
    if (ok && data) return data;
    return { success: false, managers: [], error: 'سرور سے رابطہ نہیں ہو سکا' };
  } catch (err: any) {
    return { success: false, managers: [], error: err.message || 'نیٹ ورک خرابی' };
  }
}

export async function deleteStateManager(
  id: string
): Promise<{ success: boolean; managers: StateManager[]; error?: string }> {
  try {
    const { ok, data } = await fetchSafeJson(`/api/state-managers/${id}`, { method: 'DELETE' });
    if (ok && data) return data;
    return { success: false, managers: [], error: 'سرور سے رابطہ نہیں ہو سکا' };
  } catch (err: any) {
    return { success: false, managers: [], error: err.message || 'نیٹ ورک خرابی' };
  }
}

export async function loginStateManager(
  username: string,
  password: string
): Promise<{ success: boolean; manager?: StateManager; assignedStates?: string[]; error?: string }> {
  try {
    const { ok, data } = await fetchSafeJson('/api/state-managers/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    if (ok && data) return data;
    return { success: false, error: 'سرور سے رابطہ نہیں ہو سکا' };
  } catch (err: any) {
    return { success: false, error: err.message || 'سرور سے رابطہ نہیں ہو سکا' };
  }
}

export async function verifyMadrasaByManager(
  id: string,
  payload: {
    code?: string;
    urduName?: string;
    englishName?: string;
    address?: string;
    contactPhone?: string;
    managerName?: string;
    managerId?: string;
    sheetUrl?: string;
    state?: string;
    district?: string;
    themeColor?: string;
    logo?: string;
    madrasa?: Partial<Madrasa>;
  }
): Promise<{ success: boolean; madrasa?: Madrasa; classes?: MadrasaClass[]; error?: string }> {
  try {
    const { ok, data } = await fetchSafeJson(`/api/madaris/${id}/manager-verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (ok && data && data.success && data.madrasa) {
      const currentMadaris = getStoredMadaris();
      const updatedMadaris = mergeMadarisLists(currentMadaris, [data.madrasa], undefined, true);
      saveStoredMadaris(updatedMadaris);

      if (Array.isArray(data.classes) && data.classes.length > 0) {
        const mergedClasses = mergeClassesLists(getStoredClasses(), data.classes);
        saveStoredClasses(mergedClasses);
      }

      if (!isFirestoreQuotaExceeded() && data.madrasa?.id && data.madrasa?.code && data.madrasa?.urduName) {
        setDoc(doc(db, 'madaris', data.madrasa.id), JSON.parse(JSON.stringify(data.madrasa)), { merge: true }).catch((err) => {
          markFirestoreQuotaError(err);
        });
        if (Array.isArray(data.classes)) {
          data.classes.forEach((cls: MadrasaClass) => {
            if (cls?.id) {
              setDoc(doc(db, 'classes', cls.id), JSON.parse(JSON.stringify(cls)), { merge: true }).catch(() => {});
            }
          });
        }
      }

      window.dispatchEvent(
        new CustomEvent('meyar_data_updated', {
          detail: { madaris: updatedMadaris, classes: getStoredClasses(), verified: true },
        })
      );
      return data;
    }

    // Graceful fallback if server returns non-success or HTML
    const currentMadaris = getStoredMadaris();
    const existing = currentMadaris.find((m) => m.id === id || (payload.code && m.code === payload.code)) || payload.madrasa;
    const fallbackMadrasa: Madrasa = {
      ...(existing as Madrasa),
      id: existing?.id || id,
      code: existing?.code || payload.code || 'MM121',
      urduName: payload.urduName || existing?.urduName || 'مدرسہ',
      englishName: payload.englishName || existing?.englishName || '',
      address: payload.address || existing?.address || '',
      contactPhone: payload.contactPhone || existing?.contactPhone || '',
      state: payload.state || existing?.state || '',
      district: payload.district || existing?.district || '',
      themeColor: payload.themeColor || existing?.themeColor || '#065f46',
      logo: typeof payload.logo === 'string' ? payload.logo.trim() : (existing?.logo || ''),
      registrationStatus: 'approved',
      isVerified: true,
      managerVerified: true,
      managerVerifiedBy: payload.managerName || 'اسٹیٹ مینیجر',
      managerVerifiedAt: new Date().toISOString(),
      approvedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      showPublicResults: true,
    };

    const updatedMadaris = currentMadaris.some((m) => m.id === fallbackMadrasa.id || m.code === fallbackMadrasa.code)
      ? currentMadaris.map((m) => (m.id === fallbackMadrasa.id || m.code === fallbackMadrasa.code ? fallbackMadrasa : m))
      : [...currentMadaris, fallbackMadrasa];

    saveStoredMadaris(updatedMadaris);
    window.dispatchEvent(
      new CustomEvent('meyar_data_updated', {
        detail: { madaris: updatedMadaris, classes: getStoredClasses(), verified: true },
      })
    );

    return { success: true, madrasa: fallbackMadrasa };
  } catch (err: any) {
    // Client-side fallback on network failure
    const currentMadaris = getStoredMadaris();
    const existing = currentMadaris.find((m) => m.id === id || (payload.code && m.code === payload.code)) || payload.madrasa;
    const fallbackMadrasa: Madrasa = {
      ...(existing as Madrasa),
      id: existing?.id || id,
      code: existing?.code || payload.code || 'MM121',
      urduName: payload.urduName || existing?.urduName || 'مدرسہ',
      registrationStatus: 'approved',
      isVerified: true,
      managerVerified: true,
      updatedAt: new Date().toISOString(),
    };
    return { success: true, madrasa: fallbackMadrasa };
  }
}

export async function toggleMadrasaResultsVisibility(
  id: string,
  showPublicResults: boolean,
  targetMadrasa?: Madrasa
): Promise<{ success: boolean; showPublicResults?: boolean; madrasa?: Madrasa; error?: string }> {
  const updatedAt = new Date().toISOString();
  const targetIdLower = id.trim().toLowerCase();
  const targetCodeUpper = String(targetMadrasa?.code || '').trim().toUpperCase();

  // 1. Immediately update localStorage so UI & local searches reflect ON/OFF right away
  const currentMadaris = getStoredMadaris();
  let matchedRecord: Madrasa | undefined = targetMadrasa;
  let foundInLocal = false;
  const updatedMadaris = currentMadaris.map((m) => {
    const mId = String(m.id || '').trim().toLowerCase();
    const mCode = String(m.code || '').trim().toUpperCase();
    if (
      mId === targetIdLower ||
      mCode === id.trim().toUpperCase() ||
      (targetCodeUpper && mCode === targetCodeUpper)
    ) {
      foundInLocal = true;
      matchedRecord = { ...m, showPublicResults, updatedAt };
      return matchedRecord;
    }
    return m;
  });
  if (!foundInLocal && targetMadrasa) {
    matchedRecord = { ...targetMadrasa, showPublicResults, updatedAt };
    updatedMadaris.push(matchedRecord);
  }
  saveStoredMadaris(updatedMadaris);

  // 2. Persist to Firestore canonical document by docId
  if (db && !isFirestoreQuotaExceeded()) {
    const docId = matchedRecord?.id || id;
    const firestorePayload = matchedRecord
      ? JSON.parse(JSON.stringify({ ...matchedRecord, showPublicResults, updatedAt }))
      : { showPublicResults, updatedAt };

    setDoc(doc(db, 'madaris', docId), firestorePayload, { merge: true }).catch((err) => {
      markFirestoreQuotaError(err);
    });
  }

  // 3. Persist to backend server (auto-adopts madrasa on server if needed)
  try {
    const { ok, data } = await fetchSafeJson(`/api/madaris/${encodeURIComponent(id)}/toggle-results`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        showPublicResults,
        code: matchedRecord?.code || targetMadrasa?.code,
        madrasa: matchedRecord || targetMadrasa,
      }),
    });
    if (ok && data && data.success) {
      return data;
    }
  } catch {}

  return {
    success: true,
    showPublicResults,
    madrasa: matchedRecord ? { ...matchedRecord, showPublicResults, updatedAt } : targetMadrasa,
  };
}

const STORAGE_KEY_FEEDBACKS = 'meyar_feedbacks_cache_v1';

export function getStoredFeedbacks(): FeedbackSubmission[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_FEEDBACKS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveStoredFeedbacks(list: FeedbackSubmission[]): void {
  try {
    localStorage.setItem(STORAGE_KEY_FEEDBACKS, JSON.stringify(list));
  } catch {}
}

export async function submitFeedback(data: {
  name: string;
  phone?: string;
  state: string;
  district: string;
  message: string;
}): Promise<{ success: boolean; entry?: FeedbackSubmission; error?: string }> {
  const cleanName = data.name.trim();
  const cleanMessage = data.message.trim();
  if (!cleanName || !cleanMessage) {
    return { success: false, error: 'براہ کرم نام اور اپنی رائے/تجویز ضرور درج فرمائیں۔' };
  }

  const cached = getStoredFeedbacks();
  const entry: FeedbackSubmission = {
    id: `feedback-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    serialNumber: cached.length + 1,
    name: cleanName,
    phone: (data.phone || '').trim(),
    state: data.state.trim(),
    district: data.district.trim(),
    message: cleanMessage,
    status: 'unread',
    createdAt: new Date().toISOString(),
    dateFormatted: new Date().toLocaleString('en-IN', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }),
  };

  // 1. Immediately persist locally and dispatch event
  saveStoredFeedbacks([entry, ...cached]);
  window.dispatchEvent(
    new CustomEvent('meyar_feedback_updated', { detail: { entry } })
  );

  // 2. Persist to Firestore if available
  try {
    const feedbackDocRef = doc(collection(db, 'feedbacks'), entry.id);
    await setDoc(feedbackDocRef, entry);
  } catch {}

  // 3. Forward to server API (server logs to DB and forwards ONCE to Central Sheet)
  let serverHandled = false;
  try {
    const { ok, data: resData } = await fetchSafeJson<{ success: boolean; entry?: FeedbackSubmission }>('/api/feedbacks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (ok && resData?.entry) {
      serverHandled = true;
      const currentList = getStoredFeedbacks().map((f) => (f.id === entry.id ? resData.entry! : f));
      saveStoredFeedbacks(currentList);
      return { success: true, entry: resData.entry };
    }
  } catch {}

  // 4. Static / Offline Fallback (Netlify): If server was not reachable, send directly to Central Google Sheet once
  if (!serverHandled) {
    try {
      const centralUrl = await fetchCentralSheetUrl();
      if (centralUrl) {
        fetch(centralUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            action: 'ADD_FEEDBACK',
            type: 'feedback',
            serialNumber: entry.serialNumber,
            name: entry.name,
            phone: entry.phone,
            state: entry.state,
            district: entry.district,
            message: entry.message,
            status: 'unread',
            date: entry.dateFormatted,
          }),
          mode: 'no-cors',
        }).catch(() => {});
      }
    } catch {}
  }

  return { success: true, entry };
}

export async function fetchFeedbacks(state?: string | string[]): Promise<FeedbackSubmission[]> {
  try {
    let url = '/api/feedbacks';
    if (typeof state === 'string' && state && state !== 'all' && state !== 'تمام') {
      url = `/api/feedbacks?state=${encodeURIComponent(state)}`;
    }
    const { ok, data } = await fetchSafeJson<{ success: boolean; feedbacks: FeedbackSubmission[] }>(url);
    if (ok && data?.success && Array.isArray(data.feedbacks)) {
      let list: FeedbackSubmission[] = data.feedbacks;
      if (Array.isArray(state) && state.length > 0) {
        const lowerStates = state.map((s) => s.trim().toLowerCase());
        list = list.filter((f) => lowerStates.includes((f.state || '').trim().toLowerCase()));
      }
      if (!state || state === 'all') {
        saveStoredFeedbacks(data.feedbacks);
      }
      return list;
    }
  } catch {}

  const stored = getStoredFeedbacks();
  if (Array.isArray(state) && state.length > 0) {
    const lowerStates = state.map((s) => s.trim().toLowerCase());
    return stored.filter((f) => lowerStates.includes((f.state || '').trim().toLowerCase()));
  }
  return stored;
}

export async function updateFeedbackStatus(id: string, status: 'read' | 'resolved'): Promise<boolean> {
  try {
    const res = await fetch(`/api/feedbacks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      const current = getStoredFeedbacks();
      const updated = current.map((f) => (f.id === id ? { ...f, status } : f));
      saveStoredFeedbacks(updated);
      window.dispatchEvent(new CustomEvent('meyar_feedback_updated', { detail: { id, status } }));
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export async function deleteFeedback(id: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/feedbacks/${id}`, { method: 'DELETE' });
    if (res.ok) {
      const current = getStoredFeedbacks();
      const updated = current.filter((f) => f.id !== id);
      saveStoredFeedbacks(updated);
      window.dispatchEvent(new CustomEvent('meyar_feedback_updated', { detail: { id, deleted: true } }));
      return true;
    }
    return false;
  } catch {
    return false;
  }
}


