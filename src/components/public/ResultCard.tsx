/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { StudentResult, Madrasa, MadrasaClass } from '../../types';
import { transliterateUrduToEnglish, getMadrasaEnglishName, cleanInstitutionName, ensureUrduName } from '../../utils/transliterate';
import { Language, translations } from '../../utils/translations';
import { normalizeDate, getSubjectPassingMarks, isAbsentCell } from '../../utils/sheetParser';
import { getEffectiveMadrasaResultLogic, getStoredMadaris } from '../../utils/storage';

// Helper to detect if a text contains Arabic/Urdu unicode characters
export const isUrduText = (str: string | undefined | null): boolean => {
  if (!str) return false;
  return /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/.test(str);
};

export const getTextDir = (str: string | undefined | null, fallback: 'rtl' | 'ltr' = 'rtl'): 'rtl' | 'ltr' => {
  if (!str) return fallback;
  return isUrduText(str) ? 'rtl' : 'ltr';
};

/**
 * Helper to display only the address entered by the madrasa in its registration/profile form.
 * Does not automatically append State or District dropdown values to the address.
 * Removes duplicate State/District text.
 */
export const cleanMadrasaAddress = (
  rawAddress: string | undefined | null,
  state?: string | null,
  district?: string | null
): string => {
  if (!rawAddress || !rawAddress.trim()) return '';
  const addr = rawAddress.trim();

  // Split into comma-separated segments
  const segments = addr.split(/[,،]+/).map((s) => s.trim()).filter(Boolean);
  const keptSegments: string[] = [];

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const segLower = seg.toLowerCase();

    // 1. Check for exact duplicate among already kept segments
    const isExactDup = keptSegments.some((k) => k.toLowerCase() === segLower);
    if (isExactDup) continue;

    // 2. Check if this segment represents a state or district already mentioned earlier in the address
    const isContainedInEarlier = keptSegments.some((k) => {
      const kWords = k.toLowerCase().split(/[\s,،.\-_/]+/).filter(Boolean);
      return kWords.includes(segLower) || (segLower.length >= 4 && k.toLowerCase().includes(segLower));
    });

    if (isContainedInEarlier) continue;

    keptSegments.push(seg);
  }

  return keptSegments.join(', ');
};

// Helper to ensure address is presented in English and clean Latin typography when English UI is selected
export const toEnglishAddress = (address: string | undefined | null): string => {
  if (!address || !address.trim()) return '';
  const trimmed = address.trim();
  if (!/[\u0600-\u06FF]/.test(trimmed)) {
    return trimmed;
  }
  let result = trimmed;
  const addressReplacements: [RegExp, string][] = [
    [/نزد\s*جامع\s*مسجد/g, 'Near Jama Masjid'],
    [/نزد\s*مسجد/g, 'Near Masjid'],
    [/نزد/g, 'Near'],
    [/جامع\s*مسجد/g, 'Jama Masjid'],
    [/موتی\s*ہاری/g, 'Motihari'],
    [/بہار/g, 'Bihar'],
    [/بگوڈر|بگودر/g, 'Bagodar'],
    [/جھارکھنڈ/g, 'Jharkhand'],
    [/گرڈیہہ|گرڈیہ|گردیہ/g, 'Giridih'],
    [/پٹنہ/g, 'Patna'],
    [/رانچی/g, 'Ranchi'],
    [/مظفرپور/g, 'Muzaffarpur'],
    [/دربھنگہ/g, 'Darbhanga'],
    [/دہلی/g, 'Delhi'],
    [/یوپی|اتر\s*پردیش/g, 'Uttar Pradesh'],
    [/بھارت|ہندوستان/g, 'India'],
    [/،/g, ','],
  ];

  for (const [pattern, text] of addressReplacements) {
    result = result.replace(pattern, text);
  }

  if (/[\u0600-\u06FF]/.test(result)) {
    return transliterateUrduToEnglish(result);
  }
  return result;
};

export const ALVI_FONT = "'Alvi Nastaleeq Regular', 'Alvi Nastaleeq', 'Alvi Nastaliq', 'Noto Nastaliq Urdu', serif";
export const ASLAM_FONT = "'Aslam', 'Aslam Aslam', serif";

interface ResultCardProps {
  student: StudentResult;
  madrasa: Madrasa;
  madrasaClass: MadrasaClass;
  lang?: Language;
}

export const ResultCard: React.FC<ResultCardProps> = ({
  student,
  madrasa,
  madrasaClass,
  lang = 'ur',
}) => {
  const t = translations[lang];
  const isEn = lang === 'en';

  // Extract both Urdu names and both English names accurately
  let rawStudentUrdu = (student.studentName || (student as any).candidateNameUrdu || '').trim();
  let rawFatherUrdu = (student.fatherName || (student as any).fatherNameUrdu || '').trim();
  let rawStudentEng = (student.studentNameEn || (student as any).candidateNameEng || '').trim();
  let rawFatherEng = (student.fatherNameEn || (student as any).fatherNameEng || '').trim();

  // If sheet or Apps Script returned Urdu father in English student column and English student in father column, un-swap:
  if (isUrduText(rawStudentEng) && !isUrduText(rawFatherUrdu)) {
    const tempUrduFather = rawStudentEng;
    const tempEngStudent = rawFatherUrdu;
    rawFatherUrdu = tempUrduFather;
    rawStudentEng = tempEngStudent;
  } else if (!isUrduText(rawStudentUrdu) && isUrduText(rawStudentEng)) {
    const temp = rawStudentUrdu;
    rawStudentUrdu = rawStudentEng;
    rawStudentEng = temp;
  }
  if (!isUrduText(rawFatherUrdu) && isUrduText(rawFatherEng)) {
    const temp = rawFatherUrdu;
    rawFatherUrdu = rawFatherEng;
    rawFatherEng = temp;
  }

  const studentNameUrdu = ensureUrduName(rawStudentUrdu) || 'طالب علم';
  const fatherNameUrdu = ensureUrduName(rawFatherUrdu) || '';
  const studentNameEn = rawStudentEng || transliterateUrduToEnglish(studentNameUrdu);
  const fatherNameEn = rawFatherEng || transliterateUrduToEnglish(fatherNameUrdu);

  // Dynamic Examination Name:
  // If language is English and English title exists, use it; otherwise use Urdu examTitle
  const examinationName =
    (isEn && (madrasa as any).examTitleEn)
      ? (madrasa as any).examTitleEn
      : (madrasa.examTitle || (isEn ? 'Bi-Annual Examination Result 1448H / 2026' : 'نتیجہ ششماہی امتحان 1448ھ 2026ء'));

  const examIsUrdu = isUrduText(examinationName);

  // Dynamic Class/Darja Name
  const darjaName = (isEn && madrasaClass?.nameEn)
    ? madrasaClass.nameEn
    : (student?.darja || madrasaClass?.name || (isEn ? 'Class 3' : 'سال سوم'));

  const darjaIsUrdu = isUrduText(darjaName);

  // Local state to gracefully handle image loading failures without DOM manipulation
  const [logoLoadFailed, setLogoLoadFailed] = useState(false);

  // Fallback lookup: ensure madrasa logo and chosen themeColor are retrieved even if /api/search returned default #065f46
  const effectiveMadrasa = useMemo(() => {
    const hasCustomColor = (c?: string) => Boolean(c && c.trim() && c.trim().toLowerCase() !== '#065f46');
    try {
      const stored = getStoredMadaris();
      const match = stored.find(
        (m) =>
          (madrasa?.id && m.id === madrasa.id) ||
          (madrasa?.code && m.code && m.code.toUpperCase() === madrasa.code.toUpperCase()) ||
          (madrasa?.urduName && m.urduName && m.urduName.trim() === madrasa.urduName.trim())
      );
      if (match) {
        const resolvedColor = hasCustomColor(madrasa?.themeColor)
          ? madrasa!.themeColor
          : (hasCustomColor(match.themeColor) ? match.themeColor : (madrasa?.themeColor || match.themeColor || '#065f46'));
        return {
          ...match,
          ...madrasa,
          logo: (madrasa?.logo && madrasa.logo.trim()) || (match.logo && match.logo.trim()) || (match as any).logoUrl || '',
          themeColor: resolvedColor,
        };
      }
    } catch {}
    return madrasa;
  }, [madrasa]);

  // Madrasa logo: use madrasa's own logo uploaded during registration
  const madrasaLogo =
    (effectiveMadrasa?.logo && effectiveMadrasa.logo.trim()) ||
    ((effectiveMadrasa as any)?.logoUrl && (effectiveMadrasa as any).logoUrl.trim()) ||
    '';

  // Madrasa Theme Color: Use chosen color from registration, or default to emerald #065f46
  const cardThemeColor = (effectiveMadrasa?.themeColor && effectiveMadrasa.themeColor.trim()) || '#065f46';

  // Format percentage to two decimals as in reference: e.g. "78.20%"
  const numPercentage = typeof student?.percentage === 'number' ? student.percentage : (Number(student?.percentage) || 0);
  const formattedPercentage = `${numPercentage.toFixed(2)}%`;

  // Madrasa address: display only the address entered by the madrasa in its registration/profile form.
  // Do not automatically append State or District dropdown values to the address. Remove duplicate State/District text.
  const rawMadrasaAddress = (madrasa?.address || '').trim();
  const cleanedAddress = cleanMadrasaAddress(rawMadrasaAddress, madrasa?.state, madrasa?.district);
  const englishAddress = cleanMadrasaAddress(toEnglishAddress(cleanedAddress) || cleanedAddress, madrasa?.state, madrasa?.district);

  // Language separation & data mapping for Madrasa Header:
  // Line 1: Madrasa Urdu Name
  // Line 2: Madrasa English Name strictly in English only (no Urdu text)
  const hasUrduLetters = (str: string | undefined | null) =>
    Boolean(str && /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/.test(str));

  const rawUrduInst = cleanInstitutionName(madrasa?.urduName || (madrasa as any)?.name || '');
  const rawEngInst = cleanInstitutionName(madrasa?.englishName || '');

  // 1. Line 1: Pure Urdu name
  const madrasaUrduName = hasUrduLetters(rawUrduInst)
    ? rawUrduInst
    : hasUrduLetters(rawEngInst)
    ? rawEngInst
    : (rawUrduInst || 'معیار مدارس');

  // 2. Line 2: Pure English name only (guarantees no Urdu text)
  const madrasaEnglishName = getMadrasaEnglishName(madrasa);

  // Effective result logic: use central rules from Result Admin unless madrasa has personal custom logic
  const effectiveLogic = getEffectiveMadrasaResultLogic(madrasa);

  // Color matching exact screenshot provided by user:
  // ناکام -> Bright Red (#ff0000)
  // ممتاز -> Bright Lime/Yellow Green (#7ec845)
  // اعلی / اعلیٰ -> Medium Green (#5b9e54)
  // جید جدا / جید جداً -> Sky / Ocean Blue (#0284c7)
  // جید -> Sky Blue (#00a2ed)
  // مقبول -> Very Light Pastel Blue / Lavender-Blue (#c6d9f1) with dark text
  // مجاز -> Coral / Orange (#ff6b35)
  const getKaifiyatStyle = (k: string) => {
    const norm = (k || '').trim().replace(/[\s\u200c\u200d\uFEFF]/g, '');

    // Check if custom rule with custom color exists in effective logic
    const matchedRule = effectiveLogic.rules?.find((r) => {
      const rNorm = (r.title || '').trim().replace(/[\s\u200c\u200d\uFEFF]/g, '');
      return rNorm === norm;
    });

    if (matchedRule && matchedRule.color) {
      return {
        bg: matchedRule.color,
        text: matchedRule.textColor || '#ffffff',
        border: matchedRule.borderColor || matchedRule.color,
      };
    }

    if (norm === 'ناکام' || norm.includes('ناکام') || norm.includes('فیل')) {
      return { bg: '#ff0000', text: '#ffffff', border: '#e60000' };
    }
    if (norm === 'ممتاز' || norm.includes('ممتاز')) {
      return { bg: '#7ec845', text: '#000000', border: '#6eb837' };
    }
    if (norm === 'اعلی' || norm === 'اعلیٰ' || norm.includes('اعلی')) {
      return { bg: '#5b9e54', text: '#ffffff', border: '#4f8c49' };
    }
    if (norm === 'جید جدا' || norm === 'جید جداً' || norm.includes('جید جدا')) {
      return { bg: '#0284c7', text: '#ffffff', border: '#0369a1' };
    }
    if (norm === 'جید' || norm.includes('جید')) {
      return { bg: '#00a2ed', text: '#ffffff', border: '#0090d4' };
    }
    if (norm === 'مقبول' || norm.includes('مقبول')) {
      return { bg: '#c6d9f1', text: '#000000', border: '#b0c7e4' };
    }
    if (norm === 'مجاز' || norm.includes('مجاز')) {
      return { bg: '#f97316', text: '#ffffff', border: '#ea580c' };
    }
    if (norm.includes('زیر جائزہ') || norm.includes('انتظار')) {
      return { bg: '#64748b', text: '#ffffff', border: '#475569' };
    }
    return { bg: '#7ec845', text: '#000000', border: '#6eb837' };
  };

  // Determine if student has any absent subject or is marked absent
  const studentHasAbsent =
    student?.isAbsent === true ||
    (Array.isArray(student?.subjects) &&
      student.subjects.some(
        (sub) =>
          sub.isAbsent === true ||
          sub.obtainedMarks === 'غ' ||
          String(sub.obtainedMarks || '').trim() === 'غ' ||
          isAbsentCell(sub.obtainedMarks)
      ));

  // Absent students strictly get ناکام with bright red badge
  const effectiveKaifiyat = studentHasAbsent
    ? (effectiveLogic?.passing?.absentFailLabel || 'ناکام')
    : (student?.kaifiyat || 'ناکام');

  const kaifiyatStyle = getKaifiyatStyle(effectiveKaifiyat);

  return (
    <div
      id="madrasa-result-card"
      dir="rtl"
      className="w-full max-w-[420px] mx-auto bg-white rounded-3xl shadow-lg border border-slate-200/90 overflow-hidden print:shadow-none print:border-none print:w-full print:max-w-none text-right"
    >
      {/* 1. Header Section: Uses madrasa's chosen themeColor, or default emerald #065f46 */}
      <header
        style={{ backgroundColor: cardThemeColor }}
        className="text-white pt-3.5 px-4 pb-3 rounded-t-3xl transition-colors"
      >
        {(() => {
          const showLogo = Boolean(madrasaLogo && !logoLoadFailed);
          return (
            <div className={`flex items-center ${showLogo ? 'gap-3' : 'justify-center'} w-full`} dir="rtl">
              {/* Madrasa Circular Logo: Only rendered if a logo was uploaded */}
              {showLogo ? (
                <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center p-0.5 bg-gradient-to-b from-amber-300/40 via-white/20 to-black/30 shadow-md shrink-0">
                  <img
                    src={madrasaLogo}
                    alt={madrasa?.urduName || 'لوگو'}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover rounded-full shadow-inner bg-white"
                    onError={() => setLogoLoadFailed(true)}
                  />
                </div>
              ) : null}

              {/* Madrasa Titles: Uses full remaining width without truncation */}
              <div className={`flex-1 min-w-0 flex flex-col justify-center ${showLogo ? 'text-center' : 'text-center items-center'}`}>
                {/* 1. Arabic / Urdu Madrasa Name: Full name on header */}
                <h1
                  dir="rtl"
                  style={{ fontFamily: ASLAM_FONT }}
                  className="font-aslam text-base sm:text-lg font-bold text-white leading-snug break-words whitespace-normal tracking-normal text-center w-full"
                >
                  {cleanInstitutionName(madrasaUrduName)}
                </h1>

                {/* 2. Madrasa English Name: Full English name without ellipsis */}
                {madrasaEnglishName ? (
                  <h2
                    dir="ltr"
                    className="text-[11px] sm:text-xs font-sans font-medium text-slate-200 leading-snug break-words whitespace-normal mt-0.5 text-center w-full"
                  >
                    {madrasaEnglishName}
                  </h2>
                ) : null}

                {/* 3. Institution Address: Full address without ellipsis */}
                {englishAddress ? (
                  <p
                    dir="ltr"
                    className="text-[9.5px] sm:text-[10.5px] font-sans font-normal text-slate-300 leading-snug break-words whitespace-normal mt-0.5 text-center w-full"
                  >
                    {englishAddress}
                  </p>
                ) : null}
              </div>
            </div>
          );
        })()}

        {/* Examination Strip */}
        <div className="mt-2.5 w-full bg-black/20 rounded-xl py-1.5 px-3 text-center border border-white/10 shadow-inner">
          <span
            dir={examIsUrdu ? 'rtl' : 'ltr'}
            style={examIsUrdu ? { fontFamily: ALVI_FONT } : undefined}
            className={`${examIsUrdu ? 'font-alvi' : 'font-sans'} text-white text-sm sm:text-base font-semibold leading-normal tracking-wide`}
          >
            {examinationName}
          </span>
        </div>
      </header>

      {/* Body Area: Tight and compact spacing, fixed RTL overall card direction */}
      <div className="px-4 pt-3 pb-2 sm:px-5 sm:pt-3.5 sm:pb-2.5 space-y-2" dir="rtl">
        {/* 2. Top Two Boxes: Student ID & Darja (Fixed RTL grid: Darja on right, Student ID on left) */}
        <div className="grid grid-cols-2 gap-2.5" dir="rtl">
          {/* Class / درجہ (First on right in RTL) */}
          <div className="border border-slate-200/90 rounded-xl py-1 px-2.5 text-center bg-white shadow-2xs">
            <div
              dir={isUrduText(t.darjaClass) ? 'rtl' : 'ltr'}
              style={isUrduText(t.darjaClass) ? { fontFamily: ALVI_FONT } : undefined}
              className={`text-[10px] text-stone-400 font-normal leading-none ${isUrduText(t.darjaClass) ? 'font-alvi' : 'font-sans'}`}
            >
              {t.darjaClass}
            </div>
            <div
              dir={darjaIsUrdu ? 'rtl' : 'ltr'}
              style={darjaIsUrdu ? { fontFamily: ALVI_FONT } : undefined}
              className={`text-sm sm:text-base font-bold text-stone-900 mt-0.5 leading-tight ${darjaIsUrdu ? 'font-alvi' : 'font-sans'}`}
            >
              {darjaName}
            </div>
          </div>

          {/* Student ID / طالب علم آئی ڈی (Second on left in RTL) */}
          <div className="border border-slate-200/90 rounded-xl py-1 px-2.5 text-center bg-white shadow-2xs">
            <div
              dir={isUrduText(t.studentId) ? 'rtl' : 'ltr'}
              style={isUrduText(t.studentId) ? { fontFamily: ALVI_FONT } : undefined}
              className={`text-[10px] text-stone-400 font-normal leading-none ${isUrduText(t.studentId) ? 'font-alvi' : 'font-sans'}`}
            >
              {t.studentId}
            </div>
            <div className="text-sm sm:text-base font-bold font-mono text-stone-900 tracking-wider mt-0.5 leading-tight" dir="ltr">
              {student.studentId}
            </div>
          </div>
        </div>

        {/* 3. Student Details: Name & Father Name */}
        {/* Fixed columns: Right side has BOTH Urdu Names (RTL), Left side has BOTH English Names (LTR) */}
        <div className="space-y-1.5 pt-0.5" dir="rtl">
          {/* Student Name Row */}
          <div className="flex items-center justify-between" dir="rtl">
            {/* Urdu Student Name on the Right Side */}
            <div dir="rtl" className="text-right">
              <div
                style={{ fontFamily: ALVI_FONT }}
                className="text-[10px] text-stone-400 font-normal leading-none font-alvi"
              >
                طالب علم
              </div>
              <div
                style={{ fontFamily: ALVI_FONT }}
                className="text-base font-bold text-stone-900 font-alvi leading-tight mt-0.5"
              >
                {studentNameUrdu}
              </div>
            </div>

            {/* English Student Name on the Left Side */}
            <div dir="ltr" className="text-left">
              <div className="text-[10px] text-stone-400 font-normal leading-none font-sans">
                Student Name
              </div>
              <div className="text-sm font-bold text-stone-900 font-sans leading-tight mt-0.5">
                {studentNameEn}
              </div>
            </div>
          </div>

          {/* Father Name Row */}
          <div className="flex items-center justify-between" dir="rtl">
            {/* Urdu Father Name on the Right Side */}
            <div dir="rtl" className="text-right">
              <div
                style={{ fontFamily: ALVI_FONT }}
                className="text-[10px] text-stone-400 font-normal leading-none font-alvi"
              >
                والد کا نام
              </div>
              <div
                style={{ fontFamily: ALVI_FONT }}
                className="text-base font-bold text-stone-900 font-alvi leading-tight mt-0.5"
              >
                {fatherNameUrdu}
              </div>
            </div>

            {/* English Father Name on the Left Side */}
            <div dir="ltr" className="text-left">
              <div className="text-[10px] text-stone-400 font-normal leading-none font-sans">
                Father Name
              </div>
              <div className="text-sm font-bold text-stone-900 font-sans leading-tight mt-0.5">
                {fatherNameEn}
              </div>
            </div>
          </div>
        </div>

        {/* 4. Subject Marks Table: Fixed Structure */}
        {/* Right column: Subject (مضمون), Center: Total Marks (کل نمبر), Left column: Obtained Marks (حاصل کردہ) */}
        <div className="w-full overflow-hidden mt-1.5" dir="rtl">
          <table className="w-full border-collapse" dir="rtl">
            <thead>
              <tr style={{ backgroundColor: cardThemeColor }} className="text-white text-xs sm:text-sm font-medium transition-colors">
                {/* Right Header: Subject */}
                <th
                  dir={isUrduText(t.subject) ? 'rtl' : 'ltr'}
                  style={isUrduText(t.subject) ? { fontFamily: ALVI_FONT } : undefined}
                  className={`py-1.5 px-3.5 text-right rounded-r-xl font-medium ${
                    isUrduText(t.subject) ? 'font-alvi' : 'font-sans'
                  }`}
                >
                  {t.subject}
                </th>
                {/* Center Header: Total Marks */}
                <th
                  dir={isUrduText(t.totalMarks) ? 'rtl' : 'ltr'}
                  style={isUrduText(t.totalMarks) ? { fontFamily: ALVI_FONT } : undefined}
                  className={`py-1.5 px-2.5 text-center font-medium ${
                    isUrduText(t.totalMarks) ? 'font-alvi' : 'font-sans'
                  }`}
                >
                  {t.totalMarks}
                </th>
                {/* Left Header: Obtained Marks */}
                <th
                  dir={isUrduText(t.obtainedMarks) ? 'rtl' : 'ltr'}
                  style={isUrduText(t.obtainedMarks) ? { fontFamily: ALVI_FONT } : undefined}
                  className={`py-1.5 px-3.5 text-left rounded-l-xl font-medium ${
                    isUrduText(t.obtainedMarks) ? 'font-alvi' : 'font-sans'
                  }`}
                >
                  {t.obtainedMarks}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs sm:text-sm">
              {student.subjects.map((sub, idx) => {
                const subIsUrdu = isUrduText(sub.name);
                const subDir = subIsUrdu ? 'rtl' : 'ltr';
                const subFont = subIsUrdu ? 'font-alvi' : 'font-sans';

                // Subject-specific or madrasa-configured passing marks:
                // 1. Check if class has subject-specific passing marks in subjectsConfig
                const subConfig = madrasaClass?.subjectsConfig?.find(
                  (s) =>
                    (s.name && sub.name && s.name.trim().toLowerCase() === sub.name.trim().toLowerCase()) ||
                    (s.id && (sub as any).id && s.id === (sub as any).id)
                );
                const explicitPassing = typeof subConfig?.passingMarks === 'number' && subConfig.passingMarks > 0
                  ? subConfig.passingMarks
                  : null;

                // 2. Otherwise calculate based on configured passing percentage for this madrasa
                const passingPercentage = effectiveLogic?.passing?.passingPercentage || 33;
                const passingThreshold = explicitPassing !== null
                  ? explicitPassing
                  : getSubjectPassingMarks(sub.maxMarks || 100, passingPercentage);

                const isAbsentMark =
                  sub.isAbsent === true ||
                  sub.obtainedMarks === 'غ' ||
                  String(sub.obtainedMarks || '').trim() === 'غ' ||
                  isAbsentCell(sub.obtainedMarks);

                const isEmptyVal =
                  !isAbsentMark && (
                    (sub as any).isEmpty === true ||
                    sub.obtainedMarks === '' ||
                    sub.obtainedMarks === undefined ||
                    sub.obtainedMarks === null
                  );

                const isNumericZero = sub.obtainedMarks === 0 || sub.obtainedMarks === '0';
                const obtainedNum = typeof sub.obtainedMarks === 'number'
                  ? sub.obtainedMarks
                  : parseFloat(String(sub.obtainedMarks ?? '0').replace(/[^0-9.]/g, '')) || 0;

                // Highlight marks in red whenever absent or student's obtained marks are below passing threshold (including 0)
                const isFailed = !isAbsentMark && !isEmptyVal && (isNumericZero || obtainedNum < passingThreshold);

                return (
                  <tr key={idx} className="transition-colors hover:bg-slate-50/50">
                    {/* Subject Name: right aligned if Urdu, left aligned if English */}
                    <td
                      dir={subDir}
                      style={subIsUrdu ? { fontFamily: ALVI_FONT } : undefined}
                      className={`py-1.5 px-3.5 font-normal text-black text-right ${subFont}`}
                    >
                      {sub.name}
                    </td>
                    {/* Max Marks: always centered in numeric font */}
                    <td className="py-1.5 px-2.5 text-center font-mono font-normal text-black" dir="ltr">
                      {sub.maxMarks}
                    </td>
                    {/* Obtained Marks: on left side */}
                    <td
                      className={`py-1.5 px-3.5 font-mono font-bold text-left ${
                        isAbsentMark || isFailed ? 'text-red-600' : 'text-black'
                      }`}
                      dir="ltr"
                    >
                      {isAbsentMark ? (
                        <span
                          style={!isEn ? { fontFamily: ALVI_FONT } : undefined}
                          className={`text-red-600 font-bold ${isEn ? 'font-sans' : 'font-alvi'}`}
                          dir={isEn ? 'ltr' : 'rtl'}
                        >
                          {isEn ? 'Abs' : 'غ'}
                        </span>
                      ) : isEmptyVal ? (
                        <span className="text-stone-300 font-normal"></span>
                      ) : isFailed ? (
                        <span className="text-red-600 font-bold">
                          {sub.obtainedMarks}
                        </span>
                      ) : (
                        <span className="text-black font-bold">
                          {sub.obtainedMarks}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* 5. Final Summary Section: 4 columns in fixed RTL layout */}
        {/* Order from Right to Left: Total Marks (کل نمبر) -> Obtained Marks (حاصل کردہ) -> Percentage (فیصد) -> Grade/Kaifiyat (کیفیت) */}
        <div className="pt-2 mt-1.5 border-t border-slate-100 grid grid-cols-4 gap-1 text-center items-end" dir="rtl">
          {/* Column 1 (Right): Total Marks / کل نمبر */}
          <div>
            <div
              dir={isUrduText(t.totalMarks) ? 'rtl' : 'ltr'}
              style={isUrduText(t.totalMarks) ? { fontFamily: ALVI_FONT } : undefined}
              className={`text-[10px] text-stone-500 font-normal leading-none ${isUrduText(t.totalMarks) ? 'font-alvi' : 'font-sans'}`}
            >
              {t.totalMarks}
            </div>
            <div className="text-base sm:text-lg font-bold font-mono text-stone-900 mt-0.5 leading-tight" dir="ltr">
              {student.totalMarks}
            </div>
            <div className="text-[8px] text-stone-400 font-sans font-semibold tracking-wider uppercase mt-0.5" dir="ltr">
              TOTAL
            </div>
          </div>

          {/* Column 2: Obtained Marks / حاصل کردہ */}
          <div>
            <div
              dir={isUrduText(t.obtainedMarks) ? 'rtl' : 'ltr'}
              style={isUrduText(t.obtainedMarks) ? { fontFamily: ALVI_FONT } : undefined}
              className={`text-[10px] text-stone-500 font-normal leading-none ${isUrduText(t.obtainedMarks) ? 'font-alvi' : 'font-sans'}`}
            >
              {t.obtainedMarks}
            </div>
            <div className="text-base sm:text-lg font-bold font-mono text-stone-900 mt-0.5 leading-tight" dir="ltr">
              {student.obtainedMarks}
            </div>
            <div className="text-[8px] text-stone-400 font-sans font-semibold tracking-wider uppercase mt-0.5" dir="ltr">
              OBTAINED
            </div>
          </div>

          {/* Column 3: Percentage / فیصد */}
          <div>
            <div
              dir={isUrduText(t.percentage) ? 'rtl' : 'ltr'}
              style={isUrduText(t.percentage) ? { fontFamily: ALVI_FONT } : undefined}
              className={`text-[10px] text-stone-500 font-normal leading-none ${isUrduText(t.percentage) ? 'font-alvi' : 'font-sans'}`}
            >
              {t.percentage}
            </div>
            <div className="text-base sm:text-lg font-bold font-mono text-stone-900 mt-0.5 leading-tight" dir="ltr">
              {formattedPercentage}
            </div>
            <div className="text-[8px] text-stone-400 font-sans font-semibold tracking-wider uppercase mt-0.5" dir="ltr">
              PERCENTAGE
            </div>
          </div>

          {/* Column 4 (Left): Kaifiyat / Grade Badge / کیفیت */}
          <div>
            <div
              dir={isUrduText(t.gradeKaifiyat) ? 'rtl' : 'ltr'}
              style={isUrduText(t.gradeKaifiyat) ? { fontFamily: ALVI_FONT } : undefined}
              className={`text-[10px] text-stone-500 font-normal leading-none ${isUrduText(t.gradeKaifiyat) ? 'font-alvi' : 'font-sans'}`}
            >
              {t.gradeKaifiyat}
            </div>
            <div className="mt-0.5">
              <span
                dir={isUrduText(effectiveKaifiyat) ? 'rtl' : 'ltr'}
                style={{
                  backgroundColor: kaifiyatStyle.bg,
                  color: kaifiyatStyle.text,
                  borderColor: kaifiyatStyle.border,
                  ...(isUrduText(effectiveKaifiyat) ? { fontFamily: ALVI_FONT } : {}),
                }}
                className={`inline-block rounded-lg px-2.5 py-0.5 text-xs sm:text-sm font-bold shadow-2xs border transition-transform ${
                  isUrduText(effectiveKaifiyat) ? 'font-alvi' : 'font-sans'
                }`}
              >
                {effectiveKaifiyat}
              </span>
            </div>
            <div className="text-[8px] text-stone-400 font-sans font-semibold tracking-wider uppercase mt-0.5" dir="ltr">
              GRADE
            </div>
          </div>
        </div>

        {/* Bottom Center: معیارِ مدارس */}
        <div className="!mt-1 text-center" dir="rtl">
          <span
            style={{ fontFamily: ALVI_FONT }}
            className="text-[13px] sm:text-[14px] text-stone-500 font-alvi leading-none select-none"
          >
            معیارِ مدارس
          </span>
        </div>
      </div>
    </div>
  );
};

