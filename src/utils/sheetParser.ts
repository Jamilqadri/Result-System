/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { StudentResult, SubjectMark, TestConnectionResult, KaifiyatRule, PassingSettings } from '../types';
import { transliterateUrduToEnglish, ensureUrduName } from './transliterate';

/**
 * Standardize dates to DD/MM/YYYY and YYYY-MM-DD for comparison
 */
export function normalizeDate(dateStr: string): string {
  if (!dateStr) return '';
  const trimmed = dateStr.trim();

  // If already YYYY-MM-DD
  const ymdMatch = trimmed.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (ymdMatch) {
    const y = ymdMatch[1];
    const m = ymdMatch[2].padStart(2, '0');
    const d = ymdMatch[3].padStart(2, '0');
    return `${d}/${m}/${y}`;
  }

  // If DD/MM/YYYY or DD-MM-YYYY
  const dmyMatch = trimmed.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (dmyMatch) {
    const d = dmyMatch[1].padStart(2, '0');
    const m = dmyMatch[2].padStart(2, '0');
    const y = dmyMatch[3];
    return `${d}/${m}/${y}`;
  }

  return trimmed;
}

/**
 * Split CSV line handling quotes
 */
function parseCSVLine(line: string, delimiter: string = ','): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

/**
 * Converts Eastern Arabic and Urdu numerals (۰-۹ and ٠-٩) to standard Western digits (0-9)
 */
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

/**
 * Checks if a column header represents non-subject metadata (ID, Candidate Name, Father Name, Total, Obtained, Percentage, Kaifiyat, etc.)
 */
export function isNonSubjectHeader(header: string): boolean {
  if (!header || !header.trim()) return true;
  const norm = header.toLowerCase().replace(/[_-\s]/g, '');
  if (!norm) return true;

  // Student ID
  if (
    norm.includes('studentid') ||
    norm === 'id' ||
    norm.includes('طالبعلمآئیڈی') ||
    norm.includes('اسٹوڈنٹآئیڈی') ||
    norm.includes('آئیڈی') ||
    norm.includes('ایڈی') ||
    norm.includes('طالبعلمکوڈ')
  ) {
    return true;
  }

  // DOB
  if (
    norm.includes('dob') ||
    norm.includes('تاریخپیدائش') ||
    norm.includes('تاریخ') ||
    norm.includes('dateofbirth') ||
    norm.includes('birthdate')
  ) {
    return true;
  }

  // Candidate / Student Name
  if (
    norm.includes('studentname') ||
    norm.includes('امیدوار') ||
    norm.includes('طالبعلم') ||
    norm.includes('طالب') ||
    norm === 'نام' ||
    norm === 'name' ||
    (norm.includes('نام') && !norm.includes('والد') && !norm.includes('father'))
  ) {
    return true;
  }

  // Father Name
  if (
    norm.includes('fathername') ||
    norm.includes('والد') ||
    norm.includes('ولدیت') ||
    norm === 'father'
  ) {
    return true;
  }

  // Roll Number
  if (norm.includes('roll') || norm.includes('رول')) {
    return true;
  }

  // Class / Darja
  if (norm.includes('درجہ') || norm.includes('کلاس') || norm.includes('class') || norm === 'darja') {
    return true;
  }

  // Summary / Calculated / Result Columns
  if (
    norm.includes('حاصلکردہ') ||
    norm.includes('obtained') ||
    norm.includes('obtmarks') ||
    norm.includes('مجموعہنمبر') ||
    norm.includes('کلحاصل')
  ) {
    return true;
  }
  if (
    norm.includes('کلنمبر') ||
    norm.includes('totalmarks') ||
    norm.includes('maxmarks') ||
    norm === 'total' ||
    norm.includes('ٹوٹل')
  ) {
    return true;
  }
  if (
    norm.includes('فیصد') ||
    norm.includes('percent') ||
    norm === '%' ||
    norm.includes('pct')
  ) {
    return true;
  }
  if (
    norm.includes('کیفیت') ||
    norm.includes('kaifiyat') ||
    norm.includes('grade') ||
    norm.includes('status') ||
    norm.includes('نتیجہ') ||
    norm.includes('پوزیشن') ||
    norm.includes('مقام') ||
    norm.includes('رینک')
  ) {
    return true;
  }
  if (
    norm.includes('ملاحظہ') ||
    norm.includes('ملاحظات') ||
    norm.includes('remarks') ||
    norm.includes('comments') ||
    norm.includes('note')
  ) {
    return true;
  }
  if (
    norm.includes('سیریل') ||
    norm.includes('نمبرشمار') ||
    norm === 'sno' ||
    norm === 'srno' ||
    norm === 'sn'
  ) {
    return true;
  }

  return false;
}

/**
 * Parse subject header for name and maximum marks.
 * e.g. "ریاضی [100]" -> { name: "ریاضی", maxMarks: 100 }
 * e.g. "املا [50]" -> { name: "املا", maxMarks: 50 }
 * e.g. "اردو 50" -> { name: "اردو", maxMarks: 50 }
 * e.g. "تجوید (100)" -> { name: "تجوید", maxMarks: 100 }
 * e.g. "فقہ" -> { name: "فقہ", maxMarks: 100 }
 */
export function parseSubjectHeader(header: string): { name: string; maxMarks: number } {
  if (isNonSubjectHeader(header)) {
    return { name: '', maxMarks: 0 };
  }

  const cleanHeader = header.trim();

  // 1. Bracket format: [100], (50), {50}
  const bracketMatch = cleanHeader.match(/^(.*?)\s*[[({]([0-9]+)[\])}]$/);
  if (bracketMatch && bracketMatch[1].trim()) {
    const sName = bracketMatch[1].trim();
    if (isNonSubjectHeader(sName)) return { name: '', maxMarks: 0 };
    return {
      name: sName,
      maxMarks: parseInt(bracketMatch[2], 10) || 100,
    };
  }

  // 2. Delimiter format: "اردو - 50", "اردو: 50", "اردو / 50"
  const delimMatch = cleanHeader.match(/^(.*?)\s*[:\-\/]\s*([0-9]+)$/);
  if (delimMatch && delimMatch[1].trim()) {
    const sName = delimMatch[1].trim();
    if (isNonSubjectHeader(sName)) return { name: '', maxMarks: 0 };
    return {
      name: sName,
      maxMarks: parseInt(delimMatch[2], 10) || 100,
    };
  }

  // 3. Space separated suffix: "املا 50", "اردو 50"
  const spaceMatch = cleanHeader.match(/^(.*?)\s+([0-9]{2,3})$/);
  if (spaceMatch && spaceMatch[1].trim()) {
    const sName = spaceMatch[1].trim();
    if (isNonSubjectHeader(sName)) return { name: '', maxMarks: 0 };
    return {
      name: sName,
      maxMarks: parseInt(spaceMatch[2], 10) || 100,
    };
  }

  return {
    name: cleanHeader,
    maxMarks: 100,
  };
}

/**
 * Check if a cell indicates student was absent
 */
export const isAbsentValue = isAbsentCell;

export function isAbsentCell(value: string | number | undefined | null): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === 'number') return false;
  const rawStr = String(value);
  if (!rawStr) return false;

  const normalized = rawStr
    .normalize('NFKC')
    .replace(/[\u064a\u0649]/g, '\u06cc') // Arabic Yeh to Urdu Yeh
    .replace(/\u0643/g, '\u06a9') // Arabic Kaf to Urdu Kaf
    .replace(/[\u064b-\u065f\u0670]/g, '') // Strip tashkeel / diacritics
    .replace(/^=+/g, '') // Strip leading Excel formulas =
    .replace(/["'“”‘’\u200e\u200f\u061c\u200b\u200c\u200d\ufeff\u00a0]/g, '') // Strip zero-width, invisible & quote chars
    .trim()
    .toLowerCase();

  if (!normalized) return false;

  const noPunct = normalized.replace(/[\s()[\]{}_\-\/.:؛،,]/g, '');

  return (
    noPunct === 'غ' ||
    noPunct === 'غائب' ||
    noPunct === 'غیرحاضر' ||
    noPunct === 'غیر' ||
    noPunct === 'absent' ||
    noPunct === 'ab' ||
    noPunct === 'abs' ||
    noPunct === 'a' ||
    normalized === 'غ' ||
    normalized.startsWith('غائب') ||
    normalized.startsWith('غیر حاضر') ||
    normalized.startsWith('غیرحاضر') ||
    normalized.includes('غائب') ||
    normalized.includes('غیر حاضر') ||
    normalized.includes('غیرحاضر')
  );
}

/**
 * Calculates subject passing marks:
 * 50 نمبر والے مضمون میں طے شدہ کا نصف کا اعتبار ہوگا یعنی 100 میں سے 33 تو 50 میں سے 17
 */
export function getSubjectPassingMarks(maxMarks: number, passingPercentage: number = 33): number {
  const effectivePct = passingPercentage || 33;
  if (maxMarks === 50) {
    // 50 marks subject requires half of passing percentage rounded up (e.g. 33 -> 16.5 -> 17)
    return Math.ceil(effectivePct / 2);
  }
  return Math.ceil((effectivePct * (maxMarks || 100)) / 100);
}

/**
 * Evaluates individual subject mark against passing criteria
 */
export function evaluateSubjectMarks(
  obtainedVal: number | string | undefined | null,
  maxMarks: number,
  passingPercentage: number = 33
): {
  isAbsent: boolean;
  isEmpty: boolean;
  obtainedMarks: number | 'غ' | '';
  isPassed: boolean;
  percentage: number;
} {
  const isAbsent = isAbsentCell(obtainedVal);
  if (isAbsent) {
    return {
      isAbsent: true,
      isEmpty: false,
      obtainedMarks: 'غ',
      isPassed: false,
      percentage: 0,
    };
  }

  // Check if completely blank / empty
  if (
    obtainedVal === undefined ||
    obtainedVal === null ||
    String(obtainedVal).trim() === '' ||
    String(obtainedVal).trim() === '-'
  ) {
    return {
      isAbsent: false,
      isEmpty: true,
      obtainedMarks: '',
      isPassed: false,
      percentage: 0,
    };
  }

  const rawClean = convertEasternToWesternDigits(String(obtainedVal).trim());
  const parsedNum = typeof obtainedVal === 'number'
    ? obtainedVal
    : parseFloat(rawClean.replace(/[^0-9.]/g, ''));
  const num = isNaN(parsedNum) ? 0 : parsedNum;

  const passingThreshold = getSubjectPassingMarks(maxMarks, passingPercentage);
  const isPassed = num >= passingThreshold;
  const pct = maxMarks > 0 ? (num / maxMarks) * 100 : 0;

  return {
    isAbsent: false,
    isEmpty: false,
    obtainedMarks: num,
    isPassed,
    percentage: Math.round(pct * 100) / 100,
  };
}

/**
 * Calculates grade / kaifiyat based on percentage & passing settings
 * Rule: A student failing in 2 or more subjects CANNOT be 'مقبول' (must be 'ناکام').
 */
export function calculateStudentKaifiyat(
  percentage: number,
  failedCount: number,
  hasAbsent: boolean,
  rules: KaifiyatRule[],
  passingSettings: PassingSettings
): string {
  // 1. If absent in any subject
  if (hasAbsent) {
    return passingSettings?.absentFailLabel || 'ناکام';
  }

  // 2. If failed in 2 or more subjects -> Strictly FAIL (ناکام)!
  if (failedCount >= 2) {
    return passingSettings?.twoOrMoreFailLabel || 'ناکام';
  }

  // 3. If failed in exactly 1 subject -> مجاز (or configured label)
  if (failedCount === 1) {
    return passingSettings?.oneSubjectFailLabel || 'مجاز';
  }

  const minPassPct = passingSettings?.passingPercentage || 33;

  // 4. If failed in 0 subjects, but overall percentage is below passing percentage
  if (percentage < minPassPct) {
    return passingSettings?.twoOrMoreFailLabel || 'ناکام';
  }

  // 5. Match custom / configured rules descending by minPercentage
  const sortedRules = [...(rules || [])].sort((a, b) => b.minPercentage - a.minPercentage);
  for (const rule of sortedRules) {
    if (percentage >= rule.minPercentage && percentage <= (rule.maxPercentage || 100)) {
      return rule.title;
    }
  }

  // 6. Fallback defaults
  if (percentage >= 80) return 'ممتاز';
  if (percentage >= 60) return 'اعلیٰ';
  if (percentage >= 50) return 'جید';
  if (percentage >= minPassPct) return 'مقبول';

  return passingSettings?.twoOrMoreFailLabel || 'ناکام';
}

/**
 * Recalculates all marks, subject pass/fail states, and Kaifiyat for a student
 */
export function recalculateStudentResult(
  student: StudentResult,
  rules: KaifiyatRule[],
  passingSettings: PassingSettings
): StudentResult {
  let totalMarks = 0;
  let obtainedMarks = 0;
  let hasAbsent = false;
  let failedSubjectCount = 0;

  const updatedSubjects = (student.subjects || []).map((sub) => {
    totalMarks += sub.maxMarks;
    const isSubAlreadyAbsent =
      sub.isAbsent === true ||
      sub.obtainedMarks === 'غ' ||
      String(sub.obtainedMarks || '').trim() === 'غ' ||
      isAbsentCell(sub.obtainedMarks);

    const valToEval = isSubAlreadyAbsent ? 'غ' : sub.obtainedMarks;
    const evaluated = evaluateSubjectMarks(
      valToEval,
      sub.maxMarks,
      passingSettings?.passingPercentage || 33
    );

    if (isSubAlreadyAbsent || evaluated.isAbsent) {
      hasAbsent = true;
      failedSubjectCount++;
      return {
        name: sub.name,
        maxMarks: sub.maxMarks,
        isAbsent: true,
        isEmpty: false,
        obtainedMarks: 'غ' as const,
        isPassed: false,
        percentage: 0,
      };
    } else if (evaluated.isEmpty) {
      failedSubjectCount++;
    } else {
      obtainedMarks += typeof evaluated.obtainedMarks === 'number' ? evaluated.obtainedMarks : 0;
      if (!evaluated.isPassed) {
        failedSubjectCount++;
      }
    }

    return {
      name: sub.name,
      maxMarks: sub.maxMarks,
      ...evaluated,
    };
  });

  const overallPercentage = totalMarks > 0 ? (obtainedMarks / totalMarks) * 100 : 0;
  const roundedPercentage = Math.round(overallPercentage * 100) / 100;

  const kaifiyat = calculateStudentKaifiyat(
    roundedPercentage,
    failedSubjectCount,
    hasAbsent,
    rules,
    passingSettings
  );

  return {
    ...student,
    subjects: updatedSubjects,
    totalMarks: totalMarks > 0 ? totalMarks : student.totalMarks,
    obtainedMarks,
    percentage: roundedPercentage,
    kaifiyat,
    isAbsent: hasAbsent,
    failedSubjectCount,
  };
}

/**
 * Parse CSV or Sheet data into StudentResult[]
 */
export function parseSheetData(
  rawData: string,
  darjaName: string,
  kaifiyatRules: KaifiyatRule[],
  passingSettings: PassingSettings
): {
  students: StudentResult[];
  subjects: { name: string; maxMarks: number }[];
  missingFields: string[];
} {
  if (!rawData || !rawData.trim()) {
    return { students: [], subjects: [], missingFields: ['ڈیٹا خالی ہے (No Data)'] };
  }

  const lines = rawData
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length < 2) {
    return {
      students: [],
      subjects: [],
      missingFields: ['ڈیٹا میں کم از کم ہیڈر اور ایک طالب علم کا ریکارڈ ہونا ضروری ہے'],
    };
  }

  // Detect delimiter (tab or comma)
  const firstLine = lines[0];
  const delimiter = firstLine.includes('\t') ? '\t' : ',';
  const headers = parseCSVLine(firstLine, delimiter).map((h) => h.trim());

  // Identify fixed column indices
  let idCol = -1;
  let dobCol = -1;
  let nameCol = -1;
  let fatherCol = -1;
  let rollCol = -1;

  const subjectColIndices: { index: number; name: string; maxMarks: number }[] = [];

  headers.forEach((h, idx) => {
    const norm = h.toLowerCase().replace(/[_-\s]/g, '');
    if (
      norm.includes('studentid') ||
      norm === 'id' ||
      norm.includes('طالبعلمآئیڈی') ||
      norm.includes('اسٹوڈنٹآئیڈی') ||
      norm.includes('آئیڈی') ||
      norm.includes('ایڈی') ||
      norm.includes('اسٹوڈنٹ') ||
      norm.includes('طالبعلمکوڈ')
    ) {
      if (idCol === -1) idCol = idx;
    } else if (
      norm.includes('dob') ||
      norm.includes('تاریخپیدائش') ||
      norm.includes('تاریخ') ||
      norm.includes('dateofbirth') ||
      norm.includes('birthdate')
    ) {
      if (dobCol === -1) dobCol = idx;
    } else if (
      norm.includes('studentname') ||
      norm.includes('امیدوار') ||
      norm.includes('طالبعلمکانام') ||
      norm.includes('طالبعلم') ||
      norm.includes('طالب') ||
      norm === 'نام' ||
      norm === 'name' ||
      (norm.includes('نام') && !norm.includes('والد') && !norm.includes('father'))
    ) {
      if (nameCol === -1) nameCol = idx;
    } else if (
      norm.includes('fathername') ||
      norm.includes('والدکانام') ||
      norm.includes('والدیت') ||
      norm.includes('ولدیت') ||
      norm.includes('والد') ||
      norm === 'father'
    ) {
      if (fatherCol === -1) fatherCol = idx;
    } else if (
      norm.includes('roll') ||
      norm.includes('رولنمبر') ||
      norm.includes('رولکوڈ') ||
      norm.includes('رول')
    ) {
      if (rollCol === -1) rollCol = idx;
    } else if (isNonSubjectHeader(h)) {
      // Summary / non-subject column (Total, Obtained, Percentage, Kaifiyat, remarks, etc.) - do not add as subject
    } else {
      // Dynamic Subject column
      const parsedSubject = parseSubjectHeader(h);
      if (parsedSubject.name) {
        subjectColIndices.push({
          index: idx,
          name: parsedSubject.name,
          maxMarks: parsedSubject.maxMarks,
        });
      }
    }
  });

  if (idCol === -1 && rollCol !== -1) {
    idCol = rollCol;
  }

  const missingFields: string[] = [];
  if (idCol === -1 && nameCol === -1) missingFields.push('اسٹوڈنٹ آئی ڈی یا نام کا کالم غائب ہے');
  if (subjectColIndices.length === 0) missingFields.push('کوئی مضامین (Subjects) دریافت نہیں ہوئے');

  if (missingFields.length > 0) {
    return {
      students: [],
      subjects: subjectColIndices.map((s) => ({ name: s.name, maxMarks: s.maxMarks })),
      missingFields,
    };
  }

  const students: StudentResult[] = [];

  for (let r = 1; r < lines.length; r++) {
    const row = parseCSVLine(lines[r], delimiter);
    const rawId = idCol !== -1 ? (row[idCol] || '').trim() : '';
    const studentName = nameCol !== -1 ? (row[nameCol] || '').trim() : '';

    if (!rawId && !studentName) continue; // Skip completely empty row

    const rawDob = dobCol !== -1 ? (row[dobCol] || '').trim() : '';
    const fatherName = fatherCol !== -1 ? (row[fatherCol] || '').trim() : '';
    const rollNo = rollCol !== -1 ? (row[rollCol] || '').trim() : '';
    const effectiveId = rawId || (rollNo ? rollNo : `ST-${r}`);

    let totalMarks = 0;
    let obtainedMarks = 0;
    let hasAbsent = false;
    let failedSubjectCount = 0;

    const subjects: SubjectMark[] = [];

    subjectColIndices.forEach((sub) => {
      const cellVal = row[sub.index];
      totalMarks += sub.maxMarks;

      const evaluated = evaluateSubjectMarks(
        cellVal,
        sub.maxMarks,
        passingSettings?.passingPercentage || 33
      );

      if (evaluated.isAbsent) {
        hasAbsent = true;
        failedSubjectCount++;
      } else if (evaluated.isEmpty) {
        failedSubjectCount++;
      } else {
        obtainedMarks += typeof evaluated.obtainedMarks === 'number' ? evaluated.obtainedMarks : 0;
        if (!evaluated.isPassed) {
          failedSubjectCount++;
        }
      }

      subjects.push({
        name: sub.name,
        maxMarks: sub.maxMarks,
        ...evaluated,
      });
    });

    const overallPercentage = totalMarks > 0 ? (obtainedMarks / totalMarks) * 100 : 0;
    const roundedPercentage = Math.round(overallPercentage * 100) / 100;

    const kaifiyat = calculateStudentKaifiyat(
      roundedPercentage,
      failedSubjectCount,
      hasAbsent,
      kaifiyatRules,
      passingSettings
    );

    students.push({
      studentId: effectiveId,
      dob: normalizeDate(rawDob),
      studentName: ensureUrduName(studentName) || 'طالب علم',
      studentNameEn: transliterateUrduToEnglish(studentName || ''),
      fatherName: ensureUrduName(fatherName),
      fatherNameEn: transliterateUrduToEnglish(fatherName),
      rollNo: rollNo || effectiveId,
      darja: darjaName,
      subjects,
      totalMarks,
      obtainedMarks,
      percentage: roundedPercentage,
      kaifiyat,
      isAbsent: hasAbsent,
      failedSubjectCount,
    });
  }

  return {
    students,
    subjects: subjectColIndices.map((s) => ({ name: s.name, maxMarks: s.maxMarks })),
    missingFields: [],
  };
}

/**
 * Tests connection with Google Sheet URL or raw CSV
 */
export async function testSheetConnection(
  sourceUrlOrData: string,
  tabName: string,
  darjaName: string,
  kaifiyatRules: KaifiyatRule[],
  passingSettings: PassingSettings
): Promise<TestConnectionResult> {
  let content = sourceUrlOrData;

  // Check if it is a Google Sheets URL
  if (sourceUrlOrData.includes('docs.google.com/spreadsheets')) {
    try {
      // First attempt: Server-side proxy (bypasses browser CORS completely)
      const proxyRes = await fetch('/api/fetch-sheet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sheetUrl: sourceUrlOrData, tabName }),
      });

      if (proxyRes.ok) {
        const proxyData = await proxyRes.json();
        if (proxyData.csv) {
          content = proxyData.csv;
        }
      } else {
        throw new Error('Proxy returned non-200');
      }
    } catch {
      // Second attempt: Direct fetch
      try {
        const match = sourceUrlOrData.match(/\/d\/([a-zA-Z0-9-_]+)/);
        if (!match) {
          return {
            success: false,
            message: '❌ امتحانی ریکارڈ URL کا فارمیٹ درست نہیں ہے',
            studentCount: 0,
            subjectCount: 0,
            subjects: [],
            missingFields: ['غلط ریکارڈ لنک'],
          };
        }
        const sheetId = match[1];
        const exportUrl = tabName
          ? `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tabName)}`
          : `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`;

        const response = await fetch(exportUrl);
        if (!response.ok) {
          throw new Error(`HTTP Error ${response.status}`);
        }
        content = await response.text();
      } catch {
        return {
          success: false,
          message: '❌ امتحانی ریکارڈ سے کنکشن قائم نہیں ہو سکا۔ برائے مہربانی شیئرنگ سیٹنگ چیک کریں یا دوبارہ سنک فرمائیں۔',
          studentCount: 0,
          subjectCount: 0,
          subjects: [],
          missingFields: ['پبلک شیئرنگ سیٹنگ چیک کریں'],
        };
      }
    }
  }

  const { students, subjects, missingFields } = parseSheetData(
    content,
    darjaName,
    kaifiyatRules,
    passingSettings
  );

  if (missingFields.length > 0) {
    return {
      success: false,
      message: `❌ شیٹ میں ضروری فیلڈز غائب ہیں:\n${missingFields.join('\n')}`,
      studentCount: students.length,
      subjectCount: subjects.length,
      subjects,
      missingFields,
    };
  }

  const sample = students[0];

  return {
    success: true,
    message: `✅ Connected\nStudents Found: ${students.length}\nSubjects Found: ${subjects.length} (${subjects.map((s) => `${s.name} [${s.maxMarks}]`).join(', ')})\nRequired Fields Found: Student ID, DOB, Name, Father Name\nResult Data Ready`,
    studentCount: students.length,
    subjectCount: subjects.length,
    subjects,
    missingFields: [],
    fetchedCsv: content,
    sampleStudent: sample
      ? {
          id: sample.studentId,
          name: sample.studentName,
          dob: sample.dob,
        }
      : undefined,
  };
}
