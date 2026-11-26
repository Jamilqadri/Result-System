import { KaifiyatRule } from '../types';

/**
 * Normalizes kaifiyat title string for comparison
 */
export function normalizeKaifiyat(title: string | undefined | null): string {
  if (!title) return '';
  return String(title)
    .trim()
    .replace(/[\s\u200c\u200d\uFEFF]/g, '');
}

/**
 * Checks whether a student is eligible to be listed as a Top Performer (نمایاں طلبہ).
 * Top Performers MUST be successful, passing students with positive marks (> 0%).
 * Any student who failed ('ناکام', 'راسب', 'فیل'), is absent ('غیر حاضر', 'غائب'),
 * or whose result is pending/under review ('زیر جائزہ', 'انتظار') or has 0%
 * is strictly DISQUALIFIED from Top Performers.
 */
export function isStudentEligibleForTopPerformers(student: {
  isAbsent?: boolean;
  kaifiyat?: string;
  percentage?: number | string;
  obtainedMarks?: number | string;
}): boolean {
  if (!student) return false;
  if (student.isAbsent === true) return false;

  const pct = Number(student.percentage);
  if (isNaN(pct) || pct <= 0) return false;

  const obt = Number(student.obtainedMarks);
  if (!isNaN(obt) && obt <= 0 && pct <= 0) return false;

  const norm = normalizeKaifiyat(student.kaifiyat);
  if (!norm) return false;

  // Disqualifying labels
  if (
    norm.includes('ناکام') ||
    norm.includes('راسب') ||
    norm.includes('فیل') ||
    norm.includes('غیرحاضر') ||
    norm.includes('غائب') ||
    norm.includes('زیرجائزہ') ||
    norm.includes('زیرِجائزہ') ||
    norm.includes('انتظار')
  ) {
    return false;
  }

  return true;
}

/**
 * Returns tailored Tailwind CSS classes for Kaifiyat badge according to status and colors.
 * If a custom rule in madrasa.kaifiyatRules matches, its colorClass is preferred.
 */
export function getKaifiyatBadgeClass(
  kaifiyat: string | undefined | null,
  customRules?: KaifiyatRule[]
): string {
  const norm = normalizeKaifiyat(kaifiyat);
  if (!norm) {
    return 'bg-stone-100 text-stone-700 border-stone-300';
  }

  // Check matching custom rule
  if (Array.isArray(customRules) && customRules.length > 0) {
    const matched = customRules.find((r) => normalizeKaifiyat(r.title) === norm);
    if (matched && matched.colorClass) {
      return matched.colorClass;
    }
  }

  // 1. ممتاز (Distinction) -> Rich Emerald Green
  if (norm.includes('ممتاز')) {
    return 'bg-emerald-100 text-emerald-900 border-emerald-300';
  }

  // 2. اعلیٰ / اعلی (First Division / Excellent) -> Deep Blue / Royal Blue
  if (norm === 'اعلی' || norm === 'اعلیٰ' || norm.includes('اعلی')) {
    return 'bg-blue-100 text-blue-900 border-blue-300';
  }

  // 3. جید جدا / جید جداً (Very Good) -> Sky / Cyan
  if (norm.includes('جیدجدا') || norm.includes('جیدجداً')) {
    return 'bg-sky-100 text-sky-900 border-sky-300';
  }

  // 4. جید (Good) -> Teal / Turquoise
  if (norm.includes('جید')) {
    return 'bg-teal-100 text-teal-900 border-teal-300';
  }

  // 5. مجاز (Compartment / Conditional Pass) -> Vibrant Amber / Orange
  if (norm.includes('مجاز')) {
    return 'bg-amber-100 text-amber-900 border-amber-300';
  }

  // 6. مقبول (Pass / Satisfactory) -> Slate / Indigo
  if (norm.includes('مقبول')) {
    return 'bg-indigo-50 text-indigo-900 border-indigo-200';
  }

  // 7. ناکام / راسب / فیل (Fail) -> Rose / Red
  if (norm.includes('ناکام') || norm.includes('راسب') || norm.includes('فیل')) {
    return 'bg-rose-100 text-rose-900 border-rose-300';
  }

  // 8. غیر حاضر / غائب (Absent) -> Stone Gray
  if (norm.includes('غیرحاضر') || norm.includes('غائب')) {
    return 'bg-stone-200 text-stone-700 border-stone-300';
  }

  // 9. زیر جائزہ / انتظار (Pending / Under Review) -> Purple
  if (norm.includes('زیرجائزہ') || norm.includes('انتظار')) {
    return 'bg-purple-100 text-purple-900 border-purple-300';
  }

  return 'bg-stone-100 text-stone-800 border-stone-300';
}
