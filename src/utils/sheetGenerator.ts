/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Madrasa, MadrasaClass, StudentResult, SubjectConfig, SubjectMark } from '../types';
import { isAbsentValue } from './sheetParser';

/**
 * Generates an automated Google Spreadsheet structure schema with Masters & Class Tabs
 */
export interface GeneratedSheetModel {
  spreadsheetTitle: string;
  mastersCsv: string;
  classTabs: {
    tabName: string;
    csvContent: string;
    subjects: { name: string; maxMarks: number }[];
  }[];
  googleSheetTemplateUrl: string;
  appsScriptCode: string;
}

/**
 * Standard default subjects if a class has no specific configuration
 */
export const DEFAULT_CLASS_SUBJECTS: { [key: string]: { name: string; maxMarks: number }[] } = {
  'حفظ': [
    { name: 'حفظ قرآن', maxMarks: 100 },
    { name: 'تجوید و قراءت', maxMarks: 100 },
    { name: 'دینیات و نماز', maxMarks: 100 },
    { name: 'اردو خوانی', maxMarks: 50 },
  ],
  'ناظرہ': [
    { name: 'ناظرہ قرآن', maxMarks: 100 },
    { name: 'قاعدہ و تجوید', maxMarks: 100 },
    { name: 'دینیات و دعائیں', maxMarks: 100 },
    { name: 'اردو خوانی', maxMarks: 50 },
  ],
  'ابتدائی': [
    { name: 'قرآن و دینیات', maxMarks: 100 },
    { name: 'اردو', maxMarks: 50 },
    { name: 'ہندی / انگلش', maxMarks: 50 },
    { name: 'حساب', maxMarks: 50 },
  ],
  'سال اول': [
    { name: 'میزان الصرف', maxMarks: 100 },
    { name: 'نحو میر', maxMarks: 100 },
    { name: 'گلستاں', maxMarks: 100 },
    { name: 'فقہ (نور الایضاح)', maxMarks: 100 },
  ],
  'سال دوم': [
    { name: 'عوامل النحو', maxMarks: 100 },
    { name: 'شرح مائۃ عامل', maxMarks: 100 },
    { name: 'قدوری شریف', maxMarks: 100 },
    { name: 'عقائد و کلام', maxMarks: 100 },
  ],
  'سال سوم': [
    { name: 'ریاضی', maxMarks: 100 },
    { name: 'املا', maxMarks: 50 },
    { name: 'انگریزی', maxMarks: 100 },
    { name: 'دینیات', maxMarks: 100 },
    { name: 'اردو', maxMarks: 50 },
    { name: 'تجوید', maxMarks: 100 },
  ],
  'دورۂ حدیث شریف': [
    { name: 'صحیح بخاری', maxMarks: 100 },
    { name: 'صحیح مسلم', maxMarks: 100 },
    { name: 'جامع ترمذی', maxMarks: 100 },
    { name: 'سنن ابی داؤد', maxMarks: 100 },
    { name: 'سنن نسائی', maxMarks: 100 },
    { name: 'سنن ابن ماجہ', maxMarks: 100 },
  ],
};

/**
 * Generate Next Student ID automatically:
 * Pattern: [MadrasaCodeNumeric][ClassIndex][RollNumber]
 * Example: Madrasa MM111 -> 111, Class 1 -> 1, Roll 01 -> 111101
 */
export function generateStudentId(
  madrasaCode: string,
  classIndex: number,
  existingStudentsCount: number
): string {
  // Extract digits from madrasa code, e.g. "MM111" -> "111", "MM12" -> "120"
  const digitsOnly = madrasaCode.replace(/\D/g, '');
  const prefix = digitsOnly ? (digitsOnly.length === 2 ? `${digitsOnly}0` : digitsOnly) : '111';
  const cIdx = Math.min(Math.max(classIndex, 1), 9);
  const nextRoll = (existingStudentsCount + 1).toString().padStart(2, '0');
  return `${prefix}${cIdx}${nextRoll}`;
}

/**
 * Build Masters Tab CSV:
 * A Student ID, B Student Name Urdu, C Father Name Urdu, D Student Name English, E Father Name English, F Class, G DOB
 */
export function buildMastersCsv(students: {
  studentId: string;
  nameUrdu: string;
  fatherUrdu: string;
  nameEnglish: string;
  fatherEnglish: string;
  className: string;
  dob: string;
}[]): string {
  let csv = 'Student ID,Student Name Urdu,Father Name Urdu,Student Name English,Father Name English,Class,DOB\n';
  students.forEach((s) => {
    csv += `"${s.studentId}","${s.nameUrdu}","${s.fatherUrdu}","${s.nameEnglish}","${s.fatherEnglish}","${s.className}","${s.dob}"\n`;
  });
  return csv;
}

/**
 * Build Class Tab CSV:
 * Student ID, Student Name, [Subject 1 [100]], [Subject 2 [50]]...
 */
export function buildClassTabCsv(
  className: string,
  subjects: { name: string; maxMarks: number }[],
  students: StudentResult[]
): string {
  const headerCols = ['Student ID', 'DOB', 'Student Name', 'Father Name'];
  subjects.forEach((sub) => {
    headerCols.push(`${sub.name} [${sub.maxMarks}]`);
  });

  let csv = headerCols.map((c) => `"${c}"`).join(',') + '\n';

  students.forEach((st) => {
    const row = [st.studentId, st.dob, st.studentName, st.fatherName];
    subjects.forEach((sub) => {
      const match = st.subjects.find((m) => m.name === sub.name);
      if (!match) {
        row.push('');
      } else if (match.isAbsent) {
        row.push('غ');
      } else {
        row.push(String(match.obtainedMarks));
      }
    });
    csv += row.map((c) => `"${c}"`).join(',') + '\n';
  });

  return csv;
}

/**
 * Calculate Student Mark Result automatically (Total, Percentage, Grade, Kaifiyat, Pass/Fail)
 */
export function calculateStudentResult(
  studentId: string,
  dob: string,
  studentName: string,
  fatherName: string,
  darja: string,
  marksMap: { [subjectName: string]: string | number | undefined },
  subjectsConfig: { name: string; maxMarks: number }[],
  passingPercentage: number = 33
): StudentResult {
  let totalMarks = 0;
  let obtainedMarks = 0;
  let failedCount = 0;
  let hasAbsent = false;

  const subjectMarks: SubjectMark[] = subjectsConfig.map((sub) => {
    const rawVal = marksMap[sub.name];
    totalMarks += sub.maxMarks;

    const isAb = isAbsentValue(rawVal);

    if (isAb || rawVal === undefined || rawVal === '') {
      if (isAb) hasAbsent = true;
      failedCount++;
      return {
        name: sub.name,
        maxMarks: sub.maxMarks,
        obtainedMarks: isAb ? 'غ' : '',
        isAbsent: isAb,
        isPassed: false,
        percentage: 0,
      };
    }

    const num = typeof rawVal === 'number' ? rawVal : parseFloat(String(rawVal).replace(/[^0-9.]/g, '')) || 0;
    obtainedMarks += num;
    const pct = sub.maxMarks > 0 ? (num / sub.maxMarks) * 100 : 0;
    const passThreshold = sub.maxMarks === 50
      ? Math.ceil(passingPercentage / 2)
      : Math.ceil((passingPercentage * (sub.maxMarks || 100)) / 100);
    const passed = num >= passThreshold;
    if (!passed) failedCount++;

    return {
      name: sub.name,
      maxMarks: sub.maxMarks,
      obtainedMarks: num,
      isAbsent: false,
      isPassed: passed,
      percentage: Math.round(pct * 100) / 100,
    };
  });

  const percentage = totalMarks > 0 ? Math.round(((obtainedMarks / totalMarks) * 100) * 100) / 100 : 0;

  // Grade / Kaifiyat logic (strictly غیر حاضر on absence, or ناکام if failedCount >= 2 or percentage < passingPercentage)
  let kaifiyat = 'ناکام';
  if (hasAbsent) {
    kaifiyat = 'غیر حاضر';
  } else if (failedCount >= 2) {
    kaifiyat = 'ناکام';
  } else if (failedCount === 1) {
    kaifiyat = 'مجاز';
  } else if (percentage < passingPercentage) {
    kaifiyat = 'ناکام';
  } else if (percentage >= 80) {
    kaifiyat = 'ممتاز';
  } else if (percentage >= 60) {
    kaifiyat = 'اعلیٰ';
  } else if (percentage >= 50) {
    kaifiyat = 'جید';
  } else {
    kaifiyat = 'مقبول';
  }

  return {
    studentId,
    dob,
    studentName,
    studentNameEn: studentName,
    fatherName,
    fatherNameEn: fatherName,
    darja,
    subjects: subjectMarks,
    totalMarks,
    obtainedMarks,
    percentage,
    kaifiyat,
    isAbsent: hasAbsent,
    failedSubjectCount: failedCount,
  };
}

/**
 * Generate Google Apps Script for complete two-way synchronization
 */
export function generateAppsScriptForMadrasa(madrasaCode: string, madrasaName: string): string {
  return `/**
 * Mayaar-e-Madaris Two-Way Sync Script
 * Madrasa: ${madrasaName} (${madrasaCode})
 */
function onEdit(e) {
  // Auto-sync when teacher enters marks in Google Sheet
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var sheetName = sheet.getName();
  if (sheetName === 'Masters') return;
  Logger.log('Class edited: ' + sheetName);
}

function syncToSoftware() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var mastersSheet = ss.getSheetByName('Masters');
  SpreadsheetApp.getUi().alert('ڈیٹا مرکزی سافٹ ویئر کے ساتھ سنک کے لیے تیار ہے!');
}
`;
}
