/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, X, Check, Sparkles } from 'lucide-react';

interface CalendarDatePickerProps {
  id?: string;
  value: string; // Typically DD/MM/YYYY
  onChange: (formattedDate: string) => void;
  placeholder?: string;
}

const URDU_MONTHS = [
  { urdu: 'جنوری', en: 'January', days: 31 },
  { urdu: 'فروری', en: 'February', days: 28 }, // leap year handled dynamically
  { urdu: 'مارچ', en: 'March', days: 31 },
  { urdu: 'اپریل', en: 'April', days: 30 },
  { urdu: 'مئی', en: 'May', days: 31 },
  { urdu: 'جون', en: 'June', days: 30 },
  { urdu: 'جولائی', en: 'July', days: 31 },
  { urdu: 'اگست', en: 'August', days: 31 },
  { urdu: 'ستمبر', en: 'September', days: 30 },
  { urdu: 'اکتوبر', en: 'October', days: 31 },
  { urdu: 'نومبر', en: 'November', days: 30 },
  { urdu: 'دسمبر', en: 'December', days: 31 },
];

const URDU_DAYS = ['اتوار', 'پیر', 'منگل', 'بدھ', 'جمعرات', 'جمعہ', 'ہفتہ'];

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function getDaysInMonth(year: number, monthIndex: number): number {
  if (monthIndex === 1) {
    return isLeapYear(year) ? 29 : 28;
  }
  return URDU_MONTHS[monthIndex].days;
}

// Convert DD/MM/YYYY to { year, month, day }
function parseDateParts(val: string): { year: number; month: number; day: number } | null {
  if (!val) return null;
  const match = val.trim().match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (match) {
    const d = parseInt(match[1], 10);
    const m = parseInt(match[2], 10) - 1; // 0-indexed
    const y = parseInt(match[3], 10);
    if (m >= 0 && m <= 11 && d >= 1 && d <= 31 && y >= 1950 && y <= 2030) {
      return { year: y, month: m, day: d };
    }
  }
  // Try YYYY-MM-DD
  const ymdMatch = val.trim().match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (ymdMatch) {
    const y = parseInt(ymdMatch[1], 10);
    const m = parseInt(ymdMatch[2], 10) - 1;
    const d = parseInt(ymdMatch[3], 10);
    if (m >= 0 && m <= 11 && d >= 1 && d <= 31) {
      return { year: y, month: m, day: d };
    }
  }
  return null;
}

// Convert { year, month, day } to ISO YYYY-MM-DD for native input
function toISODate(parts: { year: number; month: number; day: number } | null): string {
  if (!parts) return '';
  const y = parts.year;
  const m = String(parts.month + 1).padStart(2, '0');
  const d = String(parts.day).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export const CalendarDatePicker: React.FC<CalendarDatePickerProps> = ({
  id = 'student-dob',
  value,
  onChange,
  placeholder = 'DD/MM/YYYY (مثلاً: 15/05/2008)',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const nativeInputRef = useRef<HTMLInputElement>(null);

  // Initial state derived from value or sensible student default (e.g. 2008)
  const parsed = parseDateParts(value);
  const [selectedYear, setSelectedYear] = useState<number>(parsed?.year || 2008);
  const [selectedMonth, setSelectedMonth] = useState<number>(parsed?.month ?? 4); // May (0-indexed 4)
  const [selectedDay, setSelectedDay] = useState<number | null>(parsed?.day || null);

  // Sync internal state if external value changes
  useEffect(() => {
    const p = parseDateParts(value);
    if (p) {
      setSelectedYear(p.year);
      setSelectedMonth(p.month);
      setSelectedDay(p.day);
    }
  }, [value]);

  // Close calendar popover on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleSelectDay = (day: number) => {
    setSelectedDay(day);
    const dayStr = String(day).padStart(2, '0');
    const monthStr = String(selectedMonth + 1).padStart(2, '0');
    const formatted = `${dayStr}/${monthStr}/${selectedYear}`;
    onChange(formatted);
    setIsOpen(false);
  };

  const handlePrevMonth = () => {
    if (selectedMonth === 0) {
      setSelectedMonth(11);
      setSelectedYear((prev) => prev - 1);
    } else {
      setSelectedMonth((prev) => prev - 1);
    }
  };

  const handleNextMonth = () => {
    if (selectedMonth === 11) {
      setSelectedMonth(0);
      setSelectedYear((prev) => prev + 1);
    } else {
      setSelectedMonth((prev) => prev + 1);
    }
  };

  // Handle native date input change
  const handleNativeDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value; // YYYY-MM-DD
    if (val) {
      const parts = val.split('-');
      if (parts.length === 3) {
        const y = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10) - 1;
        const d = parseInt(parts[2], 10);
        setSelectedYear(y);
        setSelectedMonth(m);
        setSelectedDay(d);
        const formatted = `${String(d).padStart(2, '0')}/${String(m + 1).padStart(2, '0')}/${y}`;
        onChange(formatted);
      }
    }
  };

  // Generate Year options (1980 to 2026)
  const currentYear = new Date().getFullYear();
  const yearOptions: number[] = [];
  for (let y = currentYear; y >= 1980; y--) {
    yearOptions.push(y);
  }

  // Calculate calendar grid
  const daysInMonth = getDaysInMonth(selectedYear, selectedMonth);
  const firstDayOfWeek = new Date(selectedYear, selectedMonth, 1).getDay(); // 0 is Sunday

  // Verbal description for reassurance
  const verbalDate = parsed
    ? `${parsed.day} ${URDU_MONTHS[parsed.month].urdu} ${parsed.year}ء`
    : '';

  // Handle manual typing with strict DD/MM/YYYY auto-masking
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawVal = e.target.value;

    // Check if user pasted ISO format YYYY-MM-DD
    const isoMatch = rawVal.trim().match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
    if (isoMatch) {
      const y = isoMatch[1];
      const m = isoMatch[2].padStart(2, '0');
      const d = isoMatch[3].padStart(2, '0');
      onChange(`${d}/${m}/${y}`);
      return;
    }

    // Allow backspacing over slashes smoothly
    if (rawVal.length < value.length && value.endsWith('/') && !rawVal.endsWith('/')) {
      onChange(rawVal.slice(0, -1));
      return;
    }

    // Keep only numbers and limit to 8 digits (DDMMYYYY)
    const digits = rawVal.replace(/\D/g, '').slice(0, 8);
    if (digits.length === 0) {
      onChange('');
      return;
    }

    let formatted = '';
    if (digits.length <= 2) {
      formatted = digits;
    } else if (digits.length <= 4) {
      formatted = `${digits.slice(0, 2)}/${digits.slice(2)}`;
    } else {
      formatted = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4, 8)}`;
    }

    onChange(formatted);
  };

  return (
    <div className="relative w-full" ref={containerRef}>
      <div className="relative flex items-center">
        {/* Text Input with strict DD/MM/YYYY formatting */}
        <input
          id={id}
          type="text"
          dir="ltr"
          inputMode="numeric"
          maxLength={10}
          placeholder="DD/MM/YYYY (مثلاً: 01/02/2020)"
          value={value}
          onChange={handleInputChange}
          className="w-full px-4 py-3 bg-stone-50 border border-stone-300 rounded-xl text-stone-900 font-mono text-base focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-transparent transition-all tracking-wider text-left pl-11 pr-24"
        />

        {/* Calendar Icon Button (Left side) */}
        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          title="کلینڈر کھولیں"
          className="absolute inset-y-0 left-0 pl-3.5 pr-2 flex items-center text-emerald-700 hover:text-emerald-800 transition-colors cursor-pointer"
        >
          <CalendarIcon className="w-5 h-5" />
        </button>

        {/* Right side buttons */}
        <div className="absolute inset-y-0 right-0 pr-2 flex items-center gap-1">
          {value && (
            <button
              type="button"
              onClick={() => onChange('')}
              title="تاریخ صاف کریں"
              className="p-1 rounded-md text-stone-400 hover:text-stone-600 hover:bg-stone-200 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}

          {/* Open interactive calendar button */}
          <button
            type="button"
            onClick={() => setIsOpen((prev) => !prev)}
            className="px-2.5 py-1.5 rounded-lg bg-emerald-100/80 hover:bg-emerald-200 text-emerald-900 text-xs font-semibold flex items-center gap-1 border border-emerald-300/60 transition-colors cursor-pointer"
          >
            <span>کلینڈر</span>
          </button>

          {/* Hidden native input for mobile picker */}
          <input
            ref={nativeInputRef}
            type="date"
            tabIndex={-1}
            value={toISODate(parsed)}
            onChange={handleNativeDateChange}
            className="sr-only"
          />
        </div>
      </div>

      {/* Helpful format guidance note and verbal date representation */}
      <div className="flex items-center justify-between text-[11px] text-stone-500 mt-1 px-1" dir="rtl">
        <span>فارمیٹ: <strong>DD/MM/YYYY</strong> (دن / ماہ / سال)</span>
        {parsed && (
          <span className="text-emerald-800 font-urdu font-bold bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200/80">
            ✓ {verbalDate}
          </span>
        )}
      </div>

      {/* Interactive Calendar Popover */}
      {isOpen && (
        <div
          dir="rtl"
          className="absolute z-50 mt-2 left-0 right-0 sm:left-auto sm:right-0 sm:w-80 bg-white border border-stone-200 rounded-2xl shadow-xl p-4 animate-in fade-in zoom-in-95 duration-150"
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-3 border-b border-stone-100">
            <div className="flex items-center gap-1.5 text-stone-800 font-bold text-sm">
              <CalendarIcon className="w-4 h-4 text-emerald-700" />
              <span>تاریخِ پیدائش کا کلینڈر</span>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="p-1 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Quick Selectors: Year & Month */}
          <div className="flex items-center justify-between gap-2 mt-3 mb-3">
            {/* Previous Month */}
            <button
              type="button"
              onClick={handlePrevMonth}
              title="پچھلا مہینہ"
              className="p-1.5 rounded-lg hover:bg-stone-100 text-stone-600 transition-colors cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-1.5">
              {/* Month Dropdown */}
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(parseInt(e.target.value, 10))}
                className="px-2 py-1 bg-stone-100 hover:bg-stone-200 border border-stone-200 rounded-lg text-xs font-semibold text-stone-800 focus:outline-none focus:ring-1 focus:ring-emerald-600 cursor-pointer"
              >
                {URDU_MONTHS.map((m, idx) => (
                  <option key={m.urdu} value={idx}>
                    {m.urdu} ({m.en.slice(0, 3)})
                  </option>
                ))}
              </select>

              {/* Year Dropdown */}
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(parseInt(e.target.value, 10))}
                className="px-2 py-1 bg-stone-100 hover:bg-stone-200 border border-stone-200 rounded-lg text-xs font-semibold text-stone-800 font-mono focus:outline-none focus:ring-1 focus:ring-emerald-600 cursor-pointer"
              >
                {yearOptions.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>

            {/* Next Month */}
            <button
              type="button"
              onClick={handleNextMonth}
              title="اگلا مہینہ"
              className="p-1.5 rounded-lg hover:bg-stone-100 text-stone-600 transition-colors cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>

          {/* Quick Student Birth Year Jump Tags */}
          <div className="flex items-center justify-center gap-1 mb-3 text-[11px] font-mono text-stone-600 bg-stone-50 py-1 px-2 rounded-lg border border-stone-100 overflow-x-auto">
            <span className="font-urdu text-[10px] text-stone-500 whitespace-nowrap">فوری سال:</span>
            {[2004, 2006, 2008, 2010, 2012, 2014].map((yr) => (
              <button
                key={yr}
                type="button"
                onClick={() => setSelectedYear(yr)}
                className={`px-1.5 py-0.5 rounded cursor-pointer transition-colors ${
                  selectedYear === yr
                    ? 'bg-emerald-700 text-white font-bold'
                    : 'hover:bg-stone-200 text-stone-700'
                }`}
              >
                {yr}
              </button>
            ))}
          </div>

          {/* Weekday Labels */}
          <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-stone-500 mb-1 border-b border-stone-100 pb-1">
            {URDU_DAYS.map((day) => (
              <span key={day} className="py-0.5">
                {day}
              </span>
            ))}
          </div>

          {/* Days Grid */}
          <div className="grid grid-cols-7 gap-1 text-center font-mono text-xs">
            {/* Leading empty spaces */}
            {Array.from({ length: firstDayOfWeek }).map((_, i) => (
              <div key={`empty-${i}`} className="py-2" />
            ))}

            {/* Days of month */}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const isSelected =
                parsed &&
                parsed.year === selectedYear &&
                parsed.month === selectedMonth &&
                parsed.day === day;

              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => handleSelectDay(day)}
                  className={`py-2 rounded-lg font-semibold transition-all cursor-pointer flex items-center justify-center ${
                    isSelected
                      ? 'bg-emerald-700 text-white shadow-sm font-bold scale-105'
                      : 'hover:bg-emerald-50 hover:text-emerald-800 text-stone-800'
                  }`}
                >
                  {day}
                </button>
              );
            })}
          </div>

          {/* Footer with Mobile Native Picker Option */}
          <div className="mt-3 pt-2.5 border-t border-stone-100 flex items-center justify-between text-xs">
            <button
              type="button"
              onClick={() => {
                if (nativeInputRef.current) {
                  try {
                    nativeInputRef.current.showPicker?.();
                  } catch {
                    nativeInputRef.current.focus();
                  }
                }
              }}
              className="text-stone-500 hover:text-emerald-700 font-urdu text-[11px] underline underline-offset-2 transition-colors cursor-pointer"
            >
              موبائل کلینڈر کھولیں
            </button>

            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="px-3 py-1 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-lg text-xs font-medium transition-colors cursor-pointer"
            >
              بند کریں
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
