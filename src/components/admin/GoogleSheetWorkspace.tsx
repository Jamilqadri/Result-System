/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Madrasa, MadrasaClass, KaifiyatRule, PassingSettings } from '../../types';
import {
  getEffectiveMadrasaResultLogic,
  fetchSheetEditorScriptUrl,
  persistClass,
} from '../../utils/storage';
import { parseSubjectHeader, convertEasternToWesternDigits } from '../../utils/sheetParser';
import { getKaifiyatBadgeClass } from '../../utils/kaifiyatStyles';
import {
  FileSpreadsheet,
  RefreshCw,
  Save,
  Printer,
  Plus,
  Trash2,
  Edit3,
  Check,
  X,
  AlertCircle,
  CheckCircle2,
  Monitor,
  ArrowRight,
  Search,
  Layers,
} from 'lucide-react';

interface GoogleSheetWorkspaceProps {
  madrasa: Madrasa;
  portalClasses: MadrasaClass[];
  onClose: () => void;
  onSaved?: (updatedClasses: MadrasaClass[]) => void;
}

interface SheetSubjectCol {
  id: string;
  name: string;
  maxMarks: number;
}

interface MasterRow {
  studentId: string;
  urduName: string;
  urduFather: string;
  englishName: string;
  englishFather: string;
  className: string;
  dob: string;
}

interface ClassMarkRow {
  studentId: string;
  studentName: string;
  fatherName?: string;
  dob?: string;
  marks: string[];
}

interface WorkbookTab {
  name: string;
  gid?: string;
  isMaster: boolean;
  hasFilterInA2?: boolean;
  masterRows?: MasterRow[];
  subjects?: SheetSubjectCol[];
  classRows?: ClassMarkRow[];
  dirty?: boolean;
}

function isAbsentToken(val: string): boolean {
  const v = convertEasternToWesternDigits(String(val || '').trim()).toLowerCase();
  return v === 'غ' || v === 'غائب' || v === 'a' || v === 'ab' || v === 'absent';
}

function normalizeDobString(raw: string): string {
  const s = convertEasternToWesternDigits(String(raw ?? '')).trim();
  if (!s) return '';

  // ISO / YYYY-MM-DD / YYYY/MM/DD (including timestamps like 2026-11-21T00:00:00.000Z)
  const isoMatch = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s].*)?$/);
  if (isoMatch) {
    const [, yyyy, mm, dd] = isoMatch;
    return `${dd.padStart(2, '0')}/${mm.padStart(2, '0')}/${yyyy}`;
  }

  // Separated D/M/YYYY, DD-MM-YYYY, DD.MM.YY, etc.
  const sepMatch = s.match(/^(\d{1,2})[-/.\s](\d{1,2})[-/.\s](\d{2,4})$/);
  if (sepMatch) {
    let [, dd, mm, yy] = sepMatch;
    if (yy.length === 2) {
      const n = parseInt(yy, 10);
      yy = n <= 35 ? `20${yy}` : `19${yy}`;
    }
    return `${dd.padStart(2, '0')}/${mm.padStart(2, '0')}/${yy}`;
  }

  // Pure digits: DDMMYYYY or DDMMYY or partial
  const digits = s.replace(/\D/g, '').slice(0, 8);
  if (digits.length === 8) {
    return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4, 8)}`;
  }
  if (digits.length === 6) {
    const yy = parseInt(digits.slice(4, 6), 10);
    const yyyy = yy <= 35 ? `20${digits.slice(4, 6)}` : `19${digits.slice(4, 6)}`;
    return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${yyyy}`;
  }
  if (digits.length > 4) {
    return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
  }
  if (digits.length > 2) {
    return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  }
  return digits || s;
}

function formatDobLive(raw: string, prev: string): string {
  const s = convertEasternToWesternDigits(String(raw ?? ''));
  const isAdding = s.length >= prev.length;

  // Handle pasted ISO date YYYY-MM-DD directly
  const isoMatch = s.trim().match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s].*)?$/);
  if (isoMatch) {
    const [, yyyy, mm, dd] = isoMatch;
    return `${dd.padStart(2, '0')}/${mm.padStart(2, '0')}/${yyyy}`;
  }

  // Expand single-digit day/month when user types a separator forward (e.g. "5/" -> "05/")
  if (isAdding) {
    const mDaySep = s.match(/^(\d)[-/.\s]$/);
    if (mDaySep) return `0${mDaySep[1]}/`;
    const mMonSep = s.match(/^(\d{2})\/(\d)[-/.\s]$/);
    if (mMonSep) return `${mMonSep[1]}/0${mMonSep[2]}/`;
  }

  const digits = s.replace(/\D/g, '').slice(0, 8);
  if (digits.length === 0) return '';
  if (digits.length <= 2) {
    if (isAdding && digits.length === 2 && /[-/.\s]$/.test(s)) {
      return `${digits}/`;
    }
    return digits;
  }
  if (digits.length <= 4) {
    if (isAdding && digits.length === 4 && /[-/.\s]$/.test(s)) {
      return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/`;
    }
    return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  }
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

function isSummaryColHeader(h: string): boolean {
  const norm = String(h || '').toLowerCase().replace(/[_-\s]/g, '');
  if (!norm) return true;
  return (
    norm.includes('کلنمبر') ||
    norm.includes('totalmarks') ||
    norm.includes('maxmarks') ||
    norm === 'total' ||
    norm.includes('حاصلکردہ') ||
    norm.includes('obtained') ||
    norm.includes('obtmarks') ||
    norm.includes('فیصد') ||
    norm.includes('percent') ||
    norm === '%' ||
    norm.includes('pct') ||
    norm.includes('کیفیت') ||
    norm.includes('kaifiyat') ||
    norm.includes('grade') ||
    norm.includes('نتیجہ') ||
    norm.includes('پوزیشن')
  );
}

function computeRowSummary(
  row: ClassMarkRow,
  subjects: SheetSubjectCol[],
  rules: KaifiyatRule[],
  passing: PassingSettings
) {
  const passPct = passing?.passingPercentage ?? 33;
  let totalMax = 0;
  let totalObt = 0;
  let hasAbsent = false;
  let failedSubjects = 0;
  let filledCount = 0;

  subjects.forEach((sub, idx) => {
    const maxM = Number(sub.maxMarks) > 0 ? Number(sub.maxMarks) : 100;
    totalMax += maxM;
    const raw = convertEasternToWesternDigits(String(row.marks[idx] ?? '').trim());
    if (!raw) {
      failedSubjects++;
      return;
    }
    filledCount++;
    if (isAbsentToken(raw)) {
      hasAbsent = true;
      failedSubjects++;
      return;
    }
    const num = parseFloat(raw);
    if (!isNaN(num)) {
      totalObt += num;
      const pct = maxM > 0 ? (num / maxM) * 100 : 0;
      if (pct < passPct) {
        failedSubjects++;
      }
    } else {
      failedSubjects++;
    }
  });

  const percentage = totalMax > 0 ? Math.round(((totalObt / totalMax) * 100) * 100) / 100 : 0;

  let kaifiyat = '—';
  if (filledCount > 0) {
    if (hasAbsent) {
      kaifiyat = passing?.absentFailLabel || 'ناکام';
    } else if (failedSubjects >= 2) {
      kaifiyat = passing?.twoOrMoreFailLabel || 'ناکام';
    } else if (failedSubjects === 1) {
      kaifiyat = passing?.oneSubjectFailLabel || 'مجاز';
    } else if (percentage < passPct) {
      kaifiyat = passing?.twoOrMoreFailLabel || 'ناکام';
    } else {
      const matched = [...rules]
        .sort((a, b) => b.minPercentage - a.minPercentage)
        .find((r) => percentage >= r.minPercentage && percentage <= (r.maxPercentage ?? 100));
      kaifiyat =
        matched?.title ||
        (percentage >= 80
          ? 'ممتاز'
          : percentage >= 60
            ? 'اعلیٰ'
            : percentage >= 50
              ? 'جید'
              : 'مقبول');
    }
  }

  return {
    totalMarks: totalMax,
    obtainedMarks: Math.round(totalObt * 100) / 100,
    percentage,
    kaifiyat,
    isAbsent: hasAbsent,
    filledCount,
  };
}

interface MarkCellInputProps {
  rowIdx: number;
  subIdx: number;
  cellKey: string;
  externalValue: string;
  className: string;
  onPendingChange: (rowIdx: number, subIdx: number, val: string) => void;
  onCommitValue: (rowIdx: number, subIdx: number, val: string) => void;
  onKeyDownCell: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  registerRef: (key: string, el: HTMLInputElement | null) => void;
}

const MarkCellInput: React.FC<MarkCellInputProps> = React.memo(
  ({
    rowIdx,
    subIdx,
    cellKey,
    externalValue,
    className,
    onPendingChange,
    onCommitValue,
    onKeyDownCell,
    registerRef,
  }) => {
    const inputRef = useRef<HTMLInputElement | null>(null);
    const prevValRef = useRef<string>(externalValue);
    const manualEditRef = useRef<boolean>(false);
    const wasFocusedRef = useRef<boolean>(false);

    useEffect(() => {
      registerRef(cellKey, inputRef.current);
      return () => registerRef(cellKey, null);
    }, [cellKey, registerRef]);

    useEffect(() => {
      const el = inputRef.current;
      if (!el) return;
      if (document.activeElement !== el) {
        if (el.value !== externalValue) {
          el.value = externalValue;
        }
        prevValRef.current = externalValue;
      }
    }, [externalValue]);

    const placeCaretAtEnd = (el: HTMLInputElement) => {
      const len = el.value.length;
      try {
        if (el.selectionStart !== len || el.selectionEnd !== len) {
          el.setSelectionRange(len, len);
        }
      } catch {}
    };

    return (
      <input
        ref={inputRef}
        type="text"
        lang="en"
        dir="ltr"
        defaultValue={externalValue}
        style={{
          direction: 'ltr',
          unicodeBidi: 'isolate',
          textAlign: 'left',
          userSelect: 'text',
          WebkitUserSelect: 'text',
        }}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        onPointerDown={() => {
          wasFocusedRef.current = document.activeElement === inputRef.current;
        }}
        onPointerUp={() => {
          const el = inputRef.current;
          if (wasFocusedRef.current && el && el.value.length > 0) {
            manualEditRef.current = true;
          }
        }}
        onFocus={(e) => {
          const el = e.currentTarget;
          prevValRef.current = el.value;
          manualEditRef.current = false;
          placeCaretAtEnd(el);
          requestAnimationFrame(() => {
            if (document.activeElement === el && !manualEditRef.current) {
              placeCaretAtEnd(el);
            }
          });
        }}
        onInput={(e) => {
          const el = e.currentTarget;
          let val = el.value;
          const prev = prevValRef.current;

          // Guard against Android RTL/WebView cursor-at-0 inversion:
          // e.g. typing "9" then "0" yielding "09" -> immediately restore "90".
          if (
            !manualEditRef.current &&
            prev.length >= 1 &&
            val.length === prev.length + 1 &&
            !val.startsWith(prev) &&
            val.slice(1) === prev
          ) {
            const corrected = prev + val[0];
            el.value = corrected;
            val = corrected;
          }

          prevValRef.current = val;
          onPendingChange(rowIdx, subIdx, val);

          if (!manualEditRef.current && val.length >= prev.length) {
            placeCaretAtEnd(el);
            requestAnimationFrame(() => {
              if (document.activeElement === el && !manualEditRef.current) {
                placeCaretAtEnd(el);
              }
            });
          }
        }}
        onBlur={(e) => {
          const el = e.currentTarget;
          const normalized = convertEasternToWesternDigits(el.value).trim();
          if (normalized !== el.value) {
            el.value = normalized;
          }
          prevValRef.current = normalized;
          manualEditRef.current = false;
          onCommitValue(rowIdx, subIdx, normalized);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Home') {
            manualEditRef.current = true;
            return;
          }
          onKeyDownCell(e);
        }}
        placeholder="—"
        className={className}
      />
    );
  }
);

interface DobCellInputProps {
  externalValue: string;
  onValueChange: (val: string) => void;
}

const DobCellInput: React.FC<DobCellInputProps> = React.memo(({ externalValue, onValueChange }) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const prevValRef = useRef<string>(externalValue);
  const manualEditRef = useRef<boolean>(false);
  const wasFocusedRef = useRef<boolean>(false);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    if (document.activeElement !== el) {
      if (el.value !== externalValue) {
        el.value = externalValue;
      }
      prevValRef.current = externalValue;
    }
  }, [externalValue]);

  const placeCaretAtEnd = (el: HTMLInputElement) => {
    const len = el.value.length;
    try {
      if (el.selectionStart !== len || el.selectionEnd !== len) {
        el.setSelectionRange(len, len);
      }
    } catch {}
  };

  return (
    <input
      ref={inputRef}
      type="text"
      inputMode="numeric"
      lang="en"
      dir="ltr"
      maxLength={10}
      defaultValue={externalValue}
      style={{
        direction: 'ltr',
        unicodeBidi: 'isolate',
        textAlign: 'center',
        userSelect: 'text',
        WebkitUserSelect: 'text',
      }}
      autoComplete="off"
      autoCorrect="off"
      autoCapitalize="off"
      spellCheck={false}
      onPointerDown={() => {
        wasFocusedRef.current = document.activeElement === inputRef.current;
      }}
      onPointerUp={() => {
        const el = inputRef.current;
        if (wasFocusedRef.current && el && el.value.length > 0) {
          manualEditRef.current = true;
        }
      }}
      onFocus={(e) => {
        const el = e.currentTarget;
        prevValRef.current = el.value;
        manualEditRef.current = false;
        placeCaretAtEnd(el);
        requestAnimationFrame(() => {
          if (document.activeElement === el && !manualEditRef.current) {
            placeCaretAtEnd(el);
          }
        });
      }}
      onInput={(e) => {
        const el = e.currentTarget;
        let raw = el.value;
        const prev = prevValRef.current;

        // Guard against Android RTL/WebView caret-at-0 inversion
        if (
          !manualEditRef.current &&
          prev.length >= 1 &&
          raw.length === prev.length + 1 &&
          !raw.startsWith(prev) &&
          raw.slice(1) === prev
        ) {
          raw = prev + raw[0];
        }

        const formatted = formatDobLive(raw, prev);
        if (el.value !== formatted) {
          el.value = formatted;
        }
        prevValRef.current = formatted;
        onValueChange(formatted);

        if (!manualEditRef.current && formatted.length >= prev.length) {
          placeCaretAtEnd(el);
          requestAnimationFrame(() => {
            if (document.activeElement === el && !manualEditRef.current) {
              placeCaretAtEnd(el);
            }
          });
        }
      }}
      onBlur={(e) => {
        const el = e.currentTarget;
        const finalVal = normalizeDobString(el.value);
        if (el.value !== finalVal) {
          el.value = finalVal;
        }
        prevValRef.current = finalVal;
        manualEditRef.current = false;
        if (finalVal !== externalValue) {
          onValueChange(finalVal);
        }
      }}
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Home') {
          manualEditRef.current = true;
        }
      }}
      placeholder="21/11/2026"
      className="w-full px-2 py-2 text-center font-mono tabular-nums text-stone-800 bg-transparent focus:bg-amber-50 focus:outline-none"
    />
  );
});

export const GoogleSheetWorkspace: React.FC<GoogleSheetWorkspaceProps> = ({
  madrasa,
  portalClasses,
  onClose,
  onSaved,
}) => {
  const [tabs, setTabs] = useState<WorkbookTab[]>([]);
  const [activeTabIndex, setActiveTabIndex] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [editorScriptUrl, setEditorScriptUrl] = useState<string>('');
  const [loadSource, setLoadSource] = useState<'apps_script' | 'csv_readonly' | 'portal'>('portal');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusMessage, setStatusMessage] = useState<{
    type: 'success' | 'warning' | 'error';
    text: string;
  } | null>(null);

  // Subject editing inline modal state
  const [editingSubjectIdx, setEditingSubjectIdx] = useState<number | null>(null);
  const [tempSubjectName, setTempSubjectName] = useState<string>('');
  const [tempSubjectMax, setTempSubjectMax] = useState<string>('100');

  // New Tab modal state
  const [showNewTabBar, setShowNewTabBar] = useState<boolean>(false);
  const [newTabName, setNewTabName] = useState<string>('');
  const [isCreatingTab, setIsCreatingTab] = useState<boolean>(false);

  // Compact centered unsaved-changes guard modal state
  const [pendingNavAction, setPendingNavAction] = useState<
    | { type: 'switch_tab'; targetIndex: number }
    | { type: 'close' }
    | { type: 'refresh' }
    | null
  >(null);

  const cellRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const pendingMarksRef = useRef<Record<string, string>>({});
  const dirtyTabsRef = useRef<Set<number>>(new Set());
  const registerCellRef = useCallback((key: string, el: HTMLInputElement | null) => {
    if (el) {
      cellRefs.current[key] = el;
    } else {
      delete cellRefs.current[key];
    }
  }, []);

  const { rules, passing } = useMemo(() => getEffectiveMadrasaResultLogic(madrasa), [madrasa]);

  const parseRawTabToStructured = (rawTab: any): WorkbookTab => {
    const rawName = String(rawTab.name || 'Tab').trim();
    const isMaster =
      Boolean(rawTab.isMaster) ||
      ['master data', 'masters', 'master'].includes(rawName.toLowerCase());
    const grid: string[][] = Array.isArray(rawTab.rows) ? rawTab.rows : [];

    if (isMaster) {
      const headers = (grid[0] || []).map((h) => String(h || '').toLowerCase().replace(/[_-\s]/g, ''));
      const findCol = (preds: string[], fallback: number) => {
        const idx = headers.findIndex((h) => preds.some((p) => h.includes(p)));
        return idx !== -1 ? idx : fallback;
      };
      const idIdx = findCol(['studentid', 'آئیڈی', 'کوڈ'], 0);
      const uNameIdx = findCol(['امیدوارکانام(اردو)', 'امیدوار', 'طالبعلم', 'اردونام'], 1);
      const uFatherIdx = findCol(['والدکانام(اردو)', 'والد', 'ولدیت'], 2);
      const eNameIdx = findCol(['candidatename', 'englishname', 'name'], 3);
      const eFatherIdx = findCol(['fathername', 'father'], 4);
      const clsIdx = findCol(['درجہ', 'کلاس', 'class', 'darja'], 5);
      const dobIdx = findCol(['تاریخپیدائش', 'dob', 'birthdate', 'تاریخ'], 6);

      const masterRows: MasterRow[] = [];
      for (let r = 1; r < grid.length; r++) {
        const row = grid[r] || [];
        const sId = String(row[idIdx] ?? '').trim();
        const uName = String(row[uNameIdx] ?? '').trim();
        const eName = String(row[eNameIdx] ?? '').trim();
        const clsName = String(row[clsIdx] ?? '').trim();
        if (!sId && !uName && !eName && !clsName) continue;
        masterRows.push({
          studentId: sId,
          urduName: uName,
          urduFather: String(row[uFatherIdx] ?? '').trim(),
          englishName: eName,
          englishFather: String(row[eFatherIdx] ?? '').trim(),
          className: clsName,
          dob: normalizeDobString(String(row[dobIdx] ?? '')),
        });
      }

      return {
        name: rawName,
        gid: rawTab.gid,
        isMaster: true,
        masterRows,
        dirty: false,
      };
    }

    // Class / Darja tab
    const headerRow = grid[0] || [];
    const normHeaders = headerRow.map((h) => String(h || '').toLowerCase().replace(/[_-\s]/g, ''));
    let idCol = normHeaders.findIndex((h) => h.includes('studentid') || h === 'id' || h.includes('آئیڈی'));
    if (idCol === -1) idCol = 0;
    let nameCol = normHeaders.findIndex(
      (h, idx) =>
        idx !== idCol &&
        (h.includes('studentname') || h.includes('امیدوار') || (h.includes('نام') && !h.includes('والد')) || h === 'name')
    );
    if (nameCol === -1) nameCol = 1;

    const subjectCols: { colIdx: number; subject: SheetSubjectCol }[] = [];
    for (let c = 0; c < headerRow.length; c++) {
      if (c === idCol || c === nameCol) continue;
      const hRaw = String(headerRow[c] || '').trim();
      if (!hRaw || isSummaryColHeader(hRaw)) continue;
      const parsed = parseSubjectHeader(hRaw);
      if (parsed.name) {
        subjectCols.push({
          colIdx: c,
          subject: {
            id: `sub-${c}-${Date.now()}`,
            name: parsed.name,
            maxMarks: parsed.maxMarks || 100,
          },
        });
      }
    }

    // Fallback to portal class subjects if sheet header row had none
    const portalMatch = portalClasses.find(
      (pc) => pc.name === rawName || pc.sheetTabName === rawName
    );
    if (subjectCols.length === 0) {
      const firstStudentSubs = portalMatch?.students?.[0]?.subjects;
      const pSubs =
        portalMatch?.subjectsConfig && portalMatch.subjectsConfig.length > 0
          ? portalMatch.subjectsConfig
          : firstStudentSubs && firstStudentSubs.length > 0
          ? firstStudentSubs.map((s, idx) => ({ id: `sub-${idx}`, name: s.name, maxMarks: s.maxMarks }))
          : [
              { id: 's1', name: 'دینیات', maxMarks: 100 },
              { id: 's2', name: 'اردو', maxMarks: 50 },
              { id: 's3', name: 'عربی / فارسی', maxMarks: 100 },
              { id: 's4', name: 'حفظ / ناظرہ', maxMarks: 100 },
            ];
      pSubs.forEach((s: any, idx: number) => {
        subjectCols.push({
          colIdx: 2 + idx,
          subject: {
            id: s.id || `sub-${idx}`,
            name: s.name,
            maxMarks: Number(s.maxMarks) || 100,
          },
        });
      });
    }

    const subjects = subjectCols.map((sc) => sc.subject);
    const classRows: ClassMarkRow[] = [];

    for (let r = 1; r < grid.length; r++) {
      const row = grid[r] || [];
      const sid = String(row[idCol] ?? '').trim();
      const sname = String(row[nameCol] ?? '').trim();
      if (!sid && !sname) continue;
      const marks = subjectCols.map((sc) => String(row[sc.colIdx] ?? '').trim());
      classRows.push({
        studentId: sid,
        studentName: sname,
        marks,
      });
    }

    // If sheet tab had 0 rows but portal class had students, include them so no data is lost
    if (classRows.length === 0 && portalMatch?.students && portalMatch.students.length > 0) {
      portalMatch.students.forEach((st) => {
        const marks = subjects.map((sub) => {
          const foundSub = (st.subjects || []).find((x) => x.name === sub.name);
          if (!foundSub) return '';
          if (foundSub.isAbsent) return 'غ';
          return foundSub.obtainedMarks !== undefined && foundSub.obtainedMarks !== null
            ? String(foundSub.obtainedMarks)
            : '';
        });
        classRows.push({
          studentId: st.studentId,
          studentName: st.studentName,
          fatherName: st.fatherName,
          dob: normalizeDobString(st.dob || ''),
          marks,
        });
      });
    }

    return {
      name: rawName,
      gid: rawTab.gid,
      isMaster: false,
      hasFilterInA2: Boolean(rawTab.hasFilterInA2),
      subjects,
      classRows,
      dirty: false,
    };
  };

  const buildFallbackFromPortalClasses = (): WorkbookTab[] => {
    const result: WorkbookTab[] = [];
    const masterRows: MasterRow[] = [];
    portalClasses.forEach((cls) => {
      (cls.students || []).forEach((st) => {
        masterRows.push({
          studentId: st.studentId,
          urduName: st.studentName,
          urduFather: st.fatherName || '',
          englishName: st.studentNameEn || '',
          englishFather: st.fatherNameEn || '',
          className: cls.name,
          dob: normalizeDobString(st.dob || ''),
        });
      });
    });

    result.push({
      name: 'Master Data',
      isMaster: true,
      masterRows,
      dirty: false,
    });

    portalClasses.forEach((cls) => {
      const firstStudentSubs = cls.students?.[0]?.subjects;
      const subs: SheetSubjectCol[] =
        cls.subjectsConfig && cls.subjectsConfig.length > 0
          ? cls.subjectsConfig.map((s, idx) => ({
              id: s.id || `sub-${idx}`,
              name: s.name,
              maxMarks: Number(s.maxMarks) || 100,
            }))
          : firstStudentSubs && firstStudentSubs.length > 0
          ? firstStudentSubs.map((s, idx) => ({
              id: `sub-${idx}`,
              name: s.name,
              maxMarks: Number(s.maxMarks) || 100,
            }))
          : [
              { id: 's1', name: 'دینیات', maxMarks: 100 },
              { id: 's2', name: 'اردو', maxMarks: 50 },
              { id: 's3', name: 'عربی / فارسی', maxMarks: 100 },
              { id: 's4', name: 'حفظ / ناظرہ', maxMarks: 100 },
            ];
      const rows: ClassMarkRow[] = (cls.students || []).map((st) => ({
        studentId: st.studentId,
        studentName: st.studentName,
        fatherName: st.fatherName,
        dob: normalizeDobString(st.dob || ''),
        marks: subs.map((sub) => {
          const m = (st.subjects || []).find((x) => x.name === sub.name);
          if (!m) return '';
          if (m.isAbsent) return 'غ';
          return m.obtainedMarks !== undefined && m.obtainedMarks !== null
            ? String(m.obtainedMarks)
            : '';
        }),
      }));
      result.push({
        name: cls.name,
        isMaster: false,
        subjects: subs,
        classRows: rows,
        dirty: false,
      });
    });
    return result;
  };

  const loadWorkbook = async () => {
    pendingMarksRef.current = {};
    dirtyTabsRef.current.clear();
    setIsLoading(true);
    setStatusMessage(null);
    try {
      const scriptUrl = await fetchSheetEditorScriptUrl();
      setEditorScriptUrl(scriptUrl);
      if (madrasa.googleSheetUrl && madrasa.googleSheetUrl.trim()) {
        const res = await fetch('/api/madrasa/sheet-workbook', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            madrasaId: madrasa.id,
            sheetUrl: madrasa.googleSheetUrl,
            editorScriptUrl: scriptUrl,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.success && Array.isArray(data.tabs) && data.tabs.length > 0) {
            const parsedRaw: WorkbookTab[] = data.tabs.map(parseRawTabToStructured);
            const seenNames = new Set<string>();
            const parsed = parsedRaw.filter((t) => {
              const k = `${t.isMaster ? 'master' : 'cls'}:${t.name.trim()}`;
              if (seenNames.has(k)) return false;
              seenNames.add(k);
              return true;
            });
            setTabs(parsed);
            setLoadSource(data.source === 'apps_script' ? 'apps_script' : 'csv_readonly');
            setActiveTabIndex((prev) => (prev < parsed.length ? prev : 0));
            setIsLoading(false);
            return;
          }
        }
      }
      const fallbackRaw = buildFallbackFromPortalClasses();
      const seenFallback = new Set<string>();
      const fallback = fallbackRaw.filter((t) => {
        const k = `${t.isMaster ? 'master' : 'cls'}:${t.name.trim()}`;
        if (seenFallback.has(k)) return false;
        seenFallback.add(k);
        return true;
      });
      setTabs(fallback);
      setLoadSource('portal');
      setActiveTabIndex(fallback.length > 1 ? 1 : 0);
    } catch (err: any) {
      const fallback = buildFallbackFromPortalClasses();
      setTabs(fallback);
      setLoadSource('portal');
      setStatusMessage({
        type: 'warning',
        text: err?.message || 'آن لائن ریکارڈ لوڈ نہیں ہو سکا؛ مقامی ریکارڈ دکھایا جا رہا ہے۔',
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadWorkbook();
  }, [madrasa.id, madrasa.googleSheetUrl]);

  const activeTab = tabs[activeTabIndex] || null;
  const classTabNames = useMemo(
    () =>
      Array.from(
        new Set(
          tabs
            .filter((t) => !t.isMaster)
            .map((t) => String(t.name || '').trim())
            .filter(Boolean)
        )
      ),
    [tabs]
  );

  // Update Active Tab helper
  const updateActiveTab = (updater: (tab: WorkbookTab) => WorkbookTab) => {
    dirtyTabsRef.current.add(activeTabIndex);
    setTabs((prev) =>
      prev.map((t, idx) => (idx === activeTabIndex ? { ...updater(t), dirty: true } : t))
    );
  };

  // Generate next 6-digit student ID based on madrasa serial
  const generateNextStudentId = (existingRows: MasterRow[]) => {
    const codeDigits = String(madrasa.code || '').replace(/\D/g, '').slice(-3).padStart(3, '1');
    let maxSerial = 100;
    existingRows.forEach((r) => {
      const sid = String(r.studentId || '').trim();
      if (sid.startsWith(codeDigits) && sid.length >= 6) {
        const tail = parseInt(sid.slice(3), 10);
        if (!isNaN(tail) && tail > maxSerial) maxSerial = tail;
      }
    });
    return `${codeDigits}${maxSerial + 1}`;
  };

  // Master Data actions
  const handleAddMasterRow = () => {
    if (!activeTab?.isMaster) return;
    const rows = activeTab.masterRows || [];
    const nextId = generateNextStudentId(rows);
    const defaultClass = classTabNames[0] || '';
    updateActiveTab((tab) => ({
      ...tab,
      masterRows: [
        ...(tab.masterRows || []),
        {
          studentId: nextId,
          urduName: '',
          urduFather: '',
          englishName: '',
          englishFather: '',
          className: defaultClass,
          dob: '',
        },
      ],
    }));
  };

  const handleMasterCellChange = (rowIdx: number, field: keyof MasterRow, val: string) => {
    updateActiveTab((tab) => ({
      ...tab,
      masterRows: (tab.masterRows || []).map((row, i) =>
        i === rowIdx ? { ...row, [field]: val } : row
      ),
    }));
  };

  const handleDeleteMasterRow = (rowIdx: number) => {
    updateActiveTab((tab) => ({
      ...tab,
      masterRows: (tab.masterRows || []).filter((_, i) => i !== rowIdx),
    }));
  };

  // Class Tab actions (zero parent re-renders while typing; commit on blur & flush before save/print)
  const handlePendingMarkChange = useCallback(
    (rowIdx: number, subIdx: number, val: string) => {
      pendingMarksRef.current[`${activeTabIndex}:${rowIdx}:${subIdx}`] = val;
    },
    [activeTabIndex]
  );

  const handleMarkChange = useCallback(
    (rowIdx: number, subIdx: number, val: string) => {
      delete pendingMarksRef.current[`${activeTabIndex}:${rowIdx}:${subIdx}`];
      setTabs((prev) =>
        prev.map((t, tIdx) => {
          if (tIdx !== activeTabIndex) return t;
          const curVal = t.classRows?.[rowIdx]?.marks?.[subIdx] ?? '';
          if (curVal === val) return t;
          dirtyTabsRef.current.add(activeTabIndex);
          return {
            ...t,
            dirty: true,
            classRows: (t.classRows || []).map((row, i) => {
              if (i !== rowIdx) return row;
              const nextMarks = [...(row.marks || [])];
              nextMarks[subIdx] = val;
              return { ...row, marks: nextMarks };
            }),
          };
        })
      );
    },
    [activeTabIndex]
  );

  const flushPendingMarksForActiveTab = useCallback(
    (rowsSnapshot: ClassMarkRow[]): ClassMarkRow[] => {
      const prefix = `${activeTabIndex}:`;
      const pendingEntries = Object.entries(pendingMarksRef.current).filter(([k]) =>
        k.startsWith(prefix)
      );
      if (pendingEntries.length === 0) return rowsSnapshot;

      const updatedRows = rowsSnapshot.map((r) => ({ ...r, marks: [...(r.marks || [])] }));
      let changed = false;
      pendingEntries.forEach(([k, val]) => {
        const parts = k.slice(prefix.length).split(':');
        const rIdx = parseInt(parts[0], 10);
        const sIdx = parseInt(parts[1], 10);
        if (!isNaN(rIdx) && !isNaN(sIdx) && updatedRows[rIdx]) {
          const nextClean = convertEasternToWesternDigits(val).trim();
          const prevClean = convertEasternToWesternDigits(
            String(updatedRows[rIdx].marks[sIdx] ?? '')
          ).trim();
          if (nextClean !== prevClean) changed = true;
          updatedRows[rIdx].marks[sIdx] = nextClean;
        }
        delete pendingMarksRef.current[k];
      });

      if (changed) {
        dirtyTabsRef.current.add(activeTabIndex);
      }

      setTabs((prev) =>
        prev.map((t, idx) =>
          idx === activeTabIndex
            ? { ...t, dirty: Boolean(t.dirty || changed), classRows: updatedRows }
            : t
        )
      );
      return updatedRows;
    },
    [activeTabIndex]
  );

  // Students are added and edited strictly on the Master Data tab only.

  const handleAddSubjectColumn = () => {
    if (!activeTab || activeTab.isMaster) return;
    const nextNum = (activeTab.subjects?.length || 0) + 1;
    updateActiveTab((tab) => ({
      ...tab,
      subjects: [
        ...(tab.subjects || []),
        { id: `sub-${Date.now()}`, name: `مضمون ${nextNum}`, maxMarks: 100 },
      ],
      classRows: (tab.classRows || []).map((r) => ({
        ...r,
        marks: [...(r.marks || []), ''],
      })),
    }));
    setEditingSubjectIdx(activeTab.subjects?.length || 0);
    setTempSubjectName(`مضمون ${nextNum}`);
    setTempSubjectMax('100');
  };

  const handleSaveSubjectHeaderEdit = (idx: number) => {
    const cleanName = tempSubjectName.trim();
    const maxM = Math.max(1, parseInt(convertEasternToWesternDigits(tempSubjectMax), 10) || 100);
    if (!cleanName) return;
    updateActiveTab((tab) => ({
      ...tab,
      subjects: (tab.subjects || []).map((s, i) =>
        i === idx ? { ...s, name: cleanName, maxMarks: maxM } : s
      ),
    }));
    setEditingSubjectIdx(null);
  };

  const handleDeleteSubjectColumn = (idx: number) => {
    if (!activeTab || (activeTab.subjects?.length || 0) <= 1) return;
    updateActiveTab((tab) => ({
      ...tab,
      subjects: (tab.subjects || []).filter((_, i) => i !== idx),
      classRows: (tab.classRows || []).map((r) => ({
        ...r,
        marks: (r.marks || []).filter((_, mIdx) => mIdx !== idx),
      })),
    }));
    setEditingSubjectIdx(null);
  };

  // Excel-like vertical keyboard navigation
  const handleCellKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    rowIdx: number,
    colKey: string,
    totalRows: number
  ) => {
    if (e.key === 'Enter' || e.key === 'ArrowDown') {
      e.preventDefault();
      const next = cellRefs.current[`${rowIdx + 1}:${colKey}`];
      if (next) {
        next.focus();
        next.select();
      }
    } else if (e.key === 'ArrowUp' && rowIdx > 0) {
      e.preventDefault();
      const prev = cellRefs.current[`${rowIdx - 1}:${colKey}`];
      if (prev) {
        prev.focus();
        prev.select();
      }
    }
  };

  // Create New Tab
  const handleCreateNewTab = async () => {
    const clean = newTabName.trim();
    if (!clean) return;
    if (tabs.some((t) => t.name === clean)) {
      setStatusMessage({ type: 'warning', text: `درجہ "${clean}" پہلے سے موجود ہے۔` });
      return;
    }
    setIsCreatingTab(true);
    try {
      const defaultSubjects: SheetSubjectCol[] = [
        { id: 's1', name: 'دینیات', maxMarks: 100 },
        { id: 's2', name: 'اردو', maxMarks: 50 },
        { id: 's3', name: 'عربی / فارسی', maxMarks: 100 },
        { id: 's4', name: 'حفظ / ناظرہ', maxMarks: 100 },
      ];
      const res = await fetch('/api/madrasa/create-sheet-tab', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          madrasaId: madrasa.id,
          sheetUrl: madrasa.googleSheetUrl,
          tabName: clean,
          subjects: defaultSubjects,
          editorScriptUrl,
        }),
      });
      const data = await res.json();
      if (data.success) {
        const nextTabs: WorkbookTab[] = [
          ...tabs,
          {
            name: clean,
            isMaster: false,
            subjects: defaultSubjects,
            classRows: [],
            dirty: false,
          },
        ];
        setTabs(nextTabs);
        setActiveTabIndex(nextTabs.length - 1);
        setNewTabName('');
        setShowNewTabBar(false);
        setStatusMessage({
          type: 'success',
          text: `نیا درجہ "${clean}" کامیابی سے شامل ہو گیا!`,
        });
        if (onSaved && Array.isArray(data.classes)) onSaved(data.classes);
      }
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err?.message || 'نیا درجہ بنانے میں خرابی آئی۔' });
    } finally {
      setIsCreatingTab(false);
    }
  };

  // SAVE ACTIVE TAB TO GOOGLE SHEET + PORTAL + FIRESTORE
  const handleSaveActiveTab = async (): Promise<boolean> => {
    if (!activeTab) return false;
    if (document.activeElement instanceof HTMLInputElement) {
      document.activeElement.blur();
    }
    setIsSaving(true);
    setStatusMessage(null);

    try {
      let payload: any;

      if (activeTab.isMaster) {
        const cleanMasterRows = (activeTab.masterRows || [])
          .filter((r) => r.urduName.trim() || r.englishName.trim() || r.studentId.trim())
          .map((r) => ({ ...r, dob: normalizeDobString(r.dob) }));
        payload = {
          madrasaId: madrasa.id,
          sheetUrl: madrasa.googleSheetUrl,
          tabName: activeTab.name,
          isMaster: true,
          masterRows: cleanMasterRows,
          classNames: classTabNames,
          editorScriptUrl,
        };
      } else {
        const subjects = activeTab.subjects || [];
        const masterTab = tabs.find((t) => t.isMaster);
        const masterMap = new Map<string, MasterRow>();
        (masterTab?.masterRows || []).forEach((mr) => {
          if (mr.studentId) masterMap.set(mr.studentId.trim(), mr);
        });

        const mergedClassRows = flushPendingMarksForActiveTab(activeTab.classRows || []);
        const enrichedRows = mergedClassRows.map((row) => {
          const normalizedMarks = (row.marks || []).map((m) =>
            convertEasternToWesternDigits(String(m ?? '')).trim()
          );
          const normalizedRow: ClassMarkRow = { ...row, marks: normalizedMarks };
          const sum = computeRowSummary(normalizedRow, subjects, rules, passing);
          const mInfo = masterMap.get(String(row.studentId || '').trim());
          return {
            studentId: row.studentId,
            studentName: row.studentName || mInfo?.urduName || '',
            fatherName: row.fatherName || mInfo?.urduFather || '',
            dob: normalizeDobString(row.dob || mInfo?.dob || ''),
            marks: normalizedMarks,
            totalMarks: sum.totalMarks,
            obtainedMarks: sum.obtainedMarks,
            percentage: sum.percentage,
            kaifiyat: sum.filledCount > 0 ? sum.kaifiyat : 'ناکام',
          };
        });

        payload = {
          madrasaId: madrasa.id,
          sheetUrl: madrasa.googleSheetUrl,
          tabName: activeTab.name,
          isMaster: false,
          subjects,
          classRows: enrichedRows,
          editorScriptUrl,
        };
      }

      const res = await fetch('/api/madrasa/save-sheet-tab', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'محفوظ کرنے میں خرابی آئی۔');
      }

      // Also sync local state & Firestore via client persistClass if returned
      if (Array.isArray(data.classes)) {
        for (const cls of data.classes) {
          if (cls.name === activeTab.name || activeTab.isMaster) {
            await persistClass(cls).catch(() => {});
          }
        }
        if (onSaved) onSaved(data.classes);
      }

      // If Master Data saved, immediately mirror new/updated students into local class tabs inside workspace
      setTabs((prev) => {
        const next = prev.map((t, i) => (i === activeTabIndex ? { ...t, dirty: false } : t));
        if (activeTab.isMaster) {
          const mRows = activeTab.masterRows || [];
          return next.map((tab) => {
            if (tab.isMaster) return tab;
            const assigned = mRows.filter((mr) => mr.className.trim() === tab.name.trim());
            if (assigned.length === 0) return tab;
            const existingRows = [...(tab.classRows || [])];
            const subs = tab.subjects || [];
            assigned.forEach((mr) => {
              const sid = mr.studentId.trim();
              const uname = mr.urduName.trim();
              if (!sid && !uname) return;
              const foundIdx = existingRows.findIndex(
                (er) => (sid && er.studentId.trim() === sid) || (uname && er.studentName.trim() === uname)
              );
              if (foundIdx === -1) {
                existingRows.push({
                  studentId: sid,
                  studentName: uname,
                  fatherName: mr.urduFather,
                  dob: mr.dob,
                  marks: subs.map(() => ''),
                });
              } else {
                existingRows[foundIdx] = {
                  ...existingRows[foundIdx],
                  studentName: uname || existingRows[foundIdx].studentName,
                  fatherName: mr.urduFather || existingRows[foundIdx].fatherName,
                  dob: mr.dob || existingRows[foundIdx].dob,
                };
              }
            });
            return { ...tab, classRows: existingRows };
          });
        }
        return next;
      });

      dirtyTabsRef.current.delete(activeTabIndex);
      setStatusMessage({
        type: 'success',
        text: `✓ "${activeTab.name}" کی تمام تفصیلات کامیابی سے محفوظ ہو گئیں!`,
      });
      return true;
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: err?.message || 'ڈیٹا محفوظ کرنے میں خرابی آئی۔',
      });
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  // Detect unsaved changes (including still-focused pending mark input)
  const hasPendingDiff = useCallback(
    (scope: 'active' | 'any'): boolean => {
      for (const [k, val] of Object.entries(pendingMarksRef.current)) {
        const parts = k.split(':');
        const tIdx = parseInt(parts[0], 10);
        const rIdx = parseInt(parts[1], 10);
        const sIdx = parseInt(parts[2], 10);
        if (isNaN(tIdx) || isNaN(rIdx) || isNaN(sIdx)) continue;
        if (scope === 'active' && tIdx !== activeTabIndex) continue;
        const stored = convertEasternToWesternDigits(
          String(tabs[tIdx]?.classRows?.[rIdx]?.marks?.[sIdx] ?? '')
        ).trim();
        const typed = convertEasternToWesternDigits(String(val ?? '')).trim();
        if (typed !== stored) return true;
      }
      return false;
    },
    [activeTabIndex, tabs]
  );

  const hasUnsavedChanges = useCallback(
    (scope: 'active' | 'any'): boolean => {
      if (hasPendingDiff(scope)) return true;
      if (scope === 'active') {
        return Boolean(activeTab?.dirty) || dirtyTabsRef.current.has(activeTabIndex);
      }
      return dirtyTabsRef.current.size > 0 || tabs.some((t) => Boolean(t.dirty));
    },
    [activeTab, activeTabIndex, hasPendingDiff, tabs]
  );

  // Warn browser reload / tab close if any unsaved work exists
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges('any')) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  const executeNavigation = (
    action:
      | { type: 'switch_tab'; targetIndex: number }
      | { type: 'close' }
      | { type: 'refresh' }
  ) => {
    if (action.type === 'switch_tab') {
      setEditingSubjectIdx(null);
      setSearchQuery('');
      setActiveTabIndex(action.targetIndex);
    } else if (action.type === 'close') {
      onClose();
    } else if (action.type === 'refresh') {
      loadWorkbook();
    }
  };

  const requestNavigation = (
    action:
      | { type: 'switch_tab'; targetIndex: number }
      | { type: 'close' }
      | { type: 'refresh' }
  ) => {
    if (action.type === 'switch_tab' && action.targetIndex === activeTabIndex) return;
    const scope = action.type === 'switch_tab' ? 'active' : 'any';
    const unsavedBeforeBlur = hasUnsavedChanges(scope);
    if (document.activeElement instanceof HTMLInputElement) {
      document.activeElement.blur();
    }
    if (activeTab && !activeTab.isMaster) {
      flushPendingMarksForActiveTab(activeTab.classRows || []);
    }
    const unsaved = unsavedBeforeBlur || hasUnsavedChanges(scope);
    if (unsaved) {
      setPendingNavAction(action);
    } else {
      executeNavigation(action);
    }
  };

  const handleSaveAndContinueNav = async () => {
    if (!pendingNavAction) return;
    const action = pendingNavAction;
    const activeIsDirty = Boolean(activeTab?.dirty) || dirtyTabsRef.current.has(activeTabIndex);
    if (activeIsDirty) {
      const ok = await handleSaveActiveTab();
      setPendingNavAction(null);
      if (ok) {
        executeNavigation(action);
      }
    } else {
      const firstDirtyIdx = tabs.findIndex((t, i) => Boolean(t.dirty) || dirtyTabsRef.current.has(i));
      setPendingNavAction(null);
      if (firstDirtyIdx !== -1) {
        setEditingSubjectIdx(null);
        setSearchQuery('');
        setActiveTabIndex(firstDirtyIdx);
      } else {
        executeNavigation(action);
      }
    }
  };

  // Ensure print class is always cleaned up if workspace unmounts
  useEffect(() => {
    return () => {
      document.documentElement.classList.remove('gazette-print-active');
      document.body.classList.remove('gazette-print-active');
    };
  }, []);

  // Build Father's Name lookup from Master Data tab & portal classes for PDF Gazette
  const fatherNameLookup = useMemo(() => {
    const byId = new Map<string, string>();
    const byName = new Map<string, string>();

    portalClasses.forEach((cls) => {
      (cls.students || []).forEach((st) => {
        const fName = String(st.fatherName || st.fatherNameEn || '').trim();
        if (!fName) return;
        const idKey = convertEasternToWesternDigits(String(st.studentId || '').trim()).toLowerCase();
        const nameKey = String(st.studentName || '').trim().toLowerCase();
        if (idKey && !byId.has(idKey)) byId.set(idKey, fName);
        if (nameKey && !byName.has(nameKey)) byName.set(nameKey, fName);
      });
    });

    const masterTab = tabs.find((t) => t.isMaster);
    (masterTab?.masterRows || []).forEach((mr) => {
      const fName = String(mr.urduFather || mr.englishFather || '').trim();
      if (!fName) return;
      const idKey = convertEasternToWesternDigits(String(mr.studentId || '').trim()).toLowerCase();
      const nameKey = String(mr.urduName || mr.englishName || '').trim().toLowerCase();
      if (idKey) byId.set(idKey, fName);
      if (nameKey) byName.set(nameKey, fName);
    });

    return { byId, byName };
  }, [tabs, portalClasses]);

  // Trigger Crisp Landscape A4 Gazette PDF Print (No window.open)
  const handlePrintGazettePDF = () => {
    if (document.activeElement instanceof HTMLInputElement) {
      document.activeElement.blur();
    }
    if (activeTab && !activeTab.isMaster) {
      flushPendingMarksForActiveTab(activeTab.classRows || []);
    }
    document.documentElement.classList.add('gazette-print-active');
    document.body.classList.add('gazette-print-active');

    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      document.documentElement.classList.remove('gazette-print-active');
      document.body.classList.remove('gazette-print-active');
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup, { once: true });

    setTimeout(() => {
      window.print();
      // Fallback cleanup for browsers that do not fire afterprint reliably
      setTimeout(cleanup, 1200);
    }, 80);
  };

  // Filtered indices for search
  const filteredMasterRows = useMemo(() => {
    if (!activeTab?.isMaster) return [];
    const list = (activeTab.masterRows || []).map((row, idx) => ({ row, idx }));
    if (!searchQuery.trim()) return list;
    const q = searchQuery.toLowerCase().trim();
    return list.filter(
      ({ row }) =>
        row.studentId.toLowerCase().includes(q) ||
        row.urduName.toLowerCase().includes(q) ||
        row.englishName.toLowerCase().includes(q) ||
        row.urduFather.toLowerCase().includes(q) ||
        row.className.toLowerCase().includes(q)
    );
  }, [activeTab, searchQuery]);

  const filteredClassRows = useMemo(() => {
    if (!activeTab || activeTab.isMaster) return [];
    const list = (activeTab.classRows || []).map((row, idx) => ({ row, idx }));
    if (!searchQuery.trim()) return list;
    const q = searchQuery.toLowerCase().trim();
    return list.filter(
      ({ row }) =>
        row.studentId.toLowerCase().includes(q) ||
        row.studentName.toLowerCase().includes(q)
    );
  }, [activeTab, searchQuery]);

  const classStats = useMemo(() => {
    if (!activeTab || activeTab.isMaster) return null;
    const subs = activeTab.subjects || [];
    const rows = activeTab.classRows || [];
    let passed = 0;
    let mujaz = 0;
    let failed = 0;
    rows.forEach((r) => {
      const s = computeRowSummary(r, subs, rules, passing);
      if (s.filledCount === 0) return;
      if (s.kaifiyat === (passing?.oneSubjectFailLabel || 'مجاز')) mujaz++;
      else if (
        s.kaifiyat === (passing?.twoOrMoreFailLabel || 'ناکام') ||
        s.kaifiyat === (passing?.absentFailLabel || 'ناکام') ||
        s.kaifiyat === 'ناکام'
      ) {
        failed++;
      } else {
        passed++;
      }
    });
    return { total: rows.length, passed, mujaz, failed };
  }, [activeTab, rules, passing]);

  return (
    <>
      <div
        dir="rtl"
        className="fixed inset-0 z-50 bg-stone-50 flex flex-col font-urdu text-stone-900 print:hidden"
      >
        {/* Top Workspace Header */}
        <header className="bg-emerald-950 text-white px-3 sm:px-4 py-2.5 border-b border-emerald-800/80 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <button
              type="button"
              onClick={() => requestNavigation({ type: 'close' })}
              className="px-2.5 py-1.5 rounded-lg bg-emerald-900 hover:bg-emerald-800 text-emerald-100 text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors shrink-0 whitespace-nowrap"
            >
              <ArrowRight className="w-4 h-4 shrink-0" />
              <span>واپس</span>
            </button>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <FileSpreadsheet className="w-4 h-4 text-amber-300 shrink-0" />
                <h1 className="font-bold text-xs sm:text-base text-white truncate">
                  {madrasa.urduName} — آن لائن رزلٹ پینل
                </h1>
              </div>
              <div className="flex items-center gap-2 text-[10px] sm:text-[11px] text-emerald-200/80">
                <span className="font-mono">{madrasa.code}</span>
                <span aria-hidden="true">·</span>
                <span>
                  {loadSource === 'portal' ? 'پورٹل ریکارڈ' : 'لائیو کلاؤڈ ریکارڈ'}
                </span>
              </div>
            </div>
          </div>

          {/* Primary Actions — Strictly 1 Single Row with Compact Labels */}
          <div className="w-full md:w-auto flex items-center justify-end gap-1.5 flex-nowrap shrink-0">
            <button
              type="button"
              onClick={() => requestNavigation({ type: 'refresh' })}
              disabled={isLoading || isSaving}
              className="px-2.5 sm:px-3 py-1.5 rounded-lg bg-emerald-900 hover:bg-emerald-800 text-emerald-100 text-[11px] sm:text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors disabled:opacity-50 whitespace-nowrap"
            >
              <RefreshCw className={`w-3.5 h-3.5 shrink-0 ${isLoading ? 'animate-spin' : ''}`} />
              <span>ریفریش</span>
            </button>

            {activeTab && !activeTab.isMaster && (
              <button
                type="button"
                onClick={handlePrintGazettePDF}
                className="px-2.5 sm:px-3 py-1.5 rounded-lg bg-stone-100 hover:bg-white text-stone-900 text-[11px] sm:text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors whitespace-nowrap"
              >
                <Printer className="w-3.5 h-3.5 text-emerald-800 shrink-0" />
                <span dir="ltr">Result PDF</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                void handleSaveActiveTab();
              }}
              disabled={isSaving || isLoading || !activeTab}
              className="px-3 sm:px-4 py-1.5 rounded-lg bg-amber-400 hover:bg-amber-300 text-emerald-950 text-[11px] sm:text-xs font-extrabold flex items-center gap-1 cursor-pointer shadow-sm transition-colors disabled:opacity-50 whitespace-nowrap"
            >
              <Save className="w-3.5 h-3.5 shrink-0" />
              <span>{isSaving ? 'محفوظ ہو رہا...' : 'سیو رزلٹ'}</span>
            </button>
          </div>
        </header>

        {/* Single-line Mobile Computer Hint Bar */}
        <div className="md:hidden bg-amber-50 border-b border-amber-200 px-3 py-1.5 text-[11px] font-bold text-amber-950 flex items-center gap-1.5 shrink-0">
          <Monitor className="w-3.5 h-3.5 text-amber-700 shrink-0" />
          <span className="truncate whitespace-nowrap">
            بہتر ویو اور مکمل جدول دیکھنے کے لیے کمپیوٹر / لیپ ٹاپ استعمال کریں
          </span>
        </div>

        {/* Save / Status Feedback Bar */}
        {statusMessage && (
          <div
            className={`px-4 py-2 border-b text-xs font-bold flex items-center justify-between gap-2 shrink-0 ${
              statusMessage.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : statusMessage.type === 'warning'
                  ? 'bg-amber-50 border-amber-200 text-amber-950'
                  : 'bg-rose-50 border-rose-200 text-rose-900'
            }`}
          >
            <div className="flex items-center gap-2">
              {statusMessage.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0" />
              )}
              <span>{statusMessage.text}</span>
            </div>
            <button
              type="button"
              onClick={() => setStatusMessage(null)}
              className="text-xs opacity-60 hover:opacity-100 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Google Sheet Style Tabs Strip (Master Data + All Darja Tabs) */}
        <div className="bg-stone-100 border-b border-stone-200 px-4 pt-2 flex items-center gap-1.5 overflow-x-auto shrink-0">
          {tabs.map((tab, idx) => {
            const isActive = idx === activeTabIndex;
            return (
              <button
                key={`wb-tab-${tab.name}-${idx}`}
                type="button"
                onClick={() => requestNavigation({ type: 'switch_tab', targetIndex: idx })}
                className={`px-3.5 py-2 rounded-t-xl text-xs font-bold whitespace-nowrap flex items-center gap-2 border border-b-0 transition-colors cursor-pointer ${
                  isActive
                    ? tab.isMaster
                      ? 'bg-white text-emerald-900 border-stone-300 shadow-2xs'
                      : 'bg-white text-stone-900 border-stone-300 shadow-2xs'
                    : 'bg-stone-200/70 hover:bg-stone-200 text-stone-600 border-transparent'
                }`}
              >
                {tab.isMaster && <Layers className="w-3.5 h-3.5 text-amber-600" />}
                <span>{tab.isMaster ? `${tab.name} (ماسٹر ٹیب)` : tab.name}</span>
                <span className="font-mono text-[10px] text-stone-400">
                  ({tab.isMaster ? tab.masterRows?.length || 0 : tab.classRows?.length || 0})
                </span>
                {tab.dirty && (
                  <span className="text-amber-600 font-bold" title="غیر محفوظ تبدیلیاں">
                    *
                  </span>
                )}
              </button>
            );
          })}

          {!showNewTabBar ? (
            <button
              type="button"
              onClick={() => setShowNewTabBar(true)}
              className="px-2.5 py-1.5 mb-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-200 text-[11px] font-bold flex items-center gap-1 cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>نیا درجہ</span>
            </button>
          ) : (
            <div className="flex items-center gap-1.5 mb-1 bg-white px-2 py-1 rounded-lg border border-emerald-300">
              <input
                type="text"
                placeholder="درجہ کا نام..."
                value={newTabName}
                onChange={(e) => setNewTabName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateNewTab();
                }}
                className="text-xs px-2 py-0.5 w-32 focus:outline-none"
                autoFocus
              />
              <button
                type="button"
                onClick={handleCreateNewTab}
                disabled={isCreatingTab || !newTabName.trim()}
                className="px-2 py-0.5 bg-emerald-800 text-white rounded text-[11px] font-bold cursor-pointer disabled:opacity-50"
              >
                {isCreatingTab ? '...' : 'شامل'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowNewTabBar(false);
                  setNewTabName('');
                }}
                className="text-stone-400 hover:text-stone-700 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Sub-Toolbar for Active Tab */}
        {activeTab && !isLoading && (
          <div className="bg-white border-b border-stone-200 px-4 py-2 flex flex-wrap items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <div className="relative w-56">
                <input
                  type="text"
                  placeholder="آئی ڈی یا نام سے تلاش..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full px-3 py-1.5 pr-8 bg-stone-50 border border-stone-300 rounded-lg text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
                <Search className="w-3.5 h-3.5 text-stone-400 absolute right-2.5 top-2 pointer-events-none" />
              </div>

              {activeTab.isMaster ? (
                <button
                  type="button"
                  onClick={handleAddMasterRow}
                  className="px-3 py-1.5 rounded-lg bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>نیا طالب علم داخل کریں</span>
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={handleAddSubjectColumn}
                    className="px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-950 border border-emerald-300 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>نیا مضمون شامل کریں</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const masterIdx = tabs.findIndex((t) => t.isMaster);
                      if (masterIdx !== -1) {
                        requestNavigation({ type: 'switch_tab', targetIndex: masterIdx });
                      }
                    }}
                    className="px-3 py-1.5 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-700 border border-stone-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                    title="نیا طالب علم شامل کرنے کے لیے ماسٹر ٹیب کھولیں"
                  >
                    <Layers className="w-3.5 h-3.5 text-amber-600" />
                    <span>نیا طالب علم صرف ماسٹر ٹیب سے شامل ہوگا</span>
                  </button>
                </>
              )}
            </div>

            {/* Quiet Unboxed Stats Metadata */}
            {!activeTab.isMaster && classStats && (
              <div className="flex items-center gap-2 text-xs text-stone-600 font-bold">
                <span>کل طلبہ: {classStats.total}</span>
                <span aria-hidden="true">·</span>
                <span className="text-emerald-700">کامیاب: {classStats.passed}</span>
                <span aria-hidden="true">·</span>
                <span className="text-amber-700">مجاز: {classStats.mujaz}</span>
                <span aria-hidden="true">·</span>
                <span className="text-rose-700">ناکام: {classStats.failed}</span>
                <span aria-hidden="true">·</span>
                <span className="text-stone-400 font-normal">غیر حاضر کے لیے غ لکھیں</span>
              </div>
            )}

            {activeTab.isMaster && (
              <div className="text-xs text-stone-500">
                ماسٹر ٹیب میں درجہ منتخب کر کے <strong>سیو رزلٹ</strong> دبائیں — متعلقہ درجہ ٹیب میں طالب علم خودکار شامل ہو جائے گا۔
              </div>
            )}
          </div>
        )}

        {/* Main Scrollable Spreadsheet Canvas */}
        <div className="flex-1 overflow-auto bg-white">
          {isLoading ? (
            <div className="h-full flex flex-col items-center justify-center gap-3 text-stone-500 p-8">
              <RefreshCw className="w-8 h-8 animate-spin text-emerald-700" />
              <p className="text-sm font-bold text-stone-700">
                آن لائن ریکارڈ اور تمام درجات لوڈ ہو رہے ہیں...
              </p>
            </div>
          ) : !activeTab ? (
            <div className="h-full flex items-center justify-center text-stone-400 text-sm">
              کوئی ریکارڈ ٹیب نہیں ملا۔
            </div>
          ) : activeTab.isMaster ? (
            /* MASTER DATA SPREADSHEET TABLE */
            <table className="w-full border-collapse text-xs text-right min-w-[960px]">
              <thead className="sticky top-0 z-20 bg-emerald-950 text-white font-bold">
                <tr>
                  <th className="border border-emerald-800 px-2 py-2.5 w-[74px] min-w-[74px] max-w-[74px] sm:w-24 sm:min-w-24 sm:max-w-24 text-center sticky right-0 bg-emerald-950 z-30">
                    اسٹوڈنٹ آئی ڈی
                  </th>
                  <th className="border border-emerald-800 px-2.5 py-2.5 min-w-[140px] sm:min-w-[175px]">
                    امیدوار کا نام (اردو)
                  </th>
                  <th className="border border-emerald-800 px-2.5 py-2.5 min-w-[140px] sm:min-w-[165px]">
                    والد کا نام (اردو)
                  </th>
                  <th className="border border-emerald-800 px-2.5 py-2.5 min-w-[140px] sm:min-w-[155px]">
                    Candidate Name (EN)
                  </th>
                  <th className="border border-emerald-800 px-2.5 py-2.5 min-w-[140px] sm:min-w-[150px]">
                    Father Name (EN)
                  </th>
                  <th className="border border-emerald-800 px-2.5 py-2.5 w-36">درجہ / کلاس</th>
                  <th className="border border-emerald-800 px-2.5 py-2.5 w-28 text-center">
                    تاریخ پیدائش (DOB)
                  </th>
                  <th className="border border-emerald-800 px-2 py-2.5 w-11 text-center">حذف</th>
                </tr>
              </thead>
              <tbody>
                {filteredMasterRows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-10 text-center text-stone-400">
                      ماسٹر ٹیب میں ابھی کوئی طالب علم نہیں ہے۔ اوپر "نیا طالب علم داخل کریں" پر کلک کریں۔
                    </td>
                  </tr>
                ) : (
                  filteredMasterRows.map(({ row, idx }) => (
                    <tr key={`m-row-${idx}`} className="hover:bg-emerald-50/40 border-b border-stone-200">
                      <td dir="ltr" className="border border-stone-200 p-0 sticky right-0 bg-stone-50 z-10 w-[74px] min-w-[74px] max-w-[74px] sm:w-24 sm:min-w-24 sm:max-w-24">
                        <input
                          type="text"
                          dir="ltr"
                          style={{ direction: 'ltr', unicodeBidi: 'isolate' }}
                          autoComplete="off"
                          autoCorrect="off"
                          spellCheck={false}
                          value={row.studentId}
                          onChange={(e) => handleMasterCellChange(idx, 'studentId', e.target.value)}
                          className="w-full px-1.5 py-2 text-center font-mono text-[11px] sm:text-xs font-bold text-stone-900 bg-transparent focus:bg-amber-50 focus:outline-none"
                        />
                      </td>
                      <td className="border border-stone-200 p-0">
                        <input
                          type="text"
                          value={row.urduName}
                          onChange={(e) => handleMasterCellChange(idx, 'urduName', e.target.value)}
                          placeholder="اردو نام..."
                          className="w-full px-2.5 py-2 font-bold text-stone-900 bg-transparent focus:bg-amber-50 focus:outline-none"
                        />
                      </td>
                      <td className="border border-stone-200 p-0">
                        <input
                          type="text"
                          value={row.urduFather}
                          onChange={(e) => handleMasterCellChange(idx, 'urduFather', e.target.value)}
                          placeholder="والد کا نام..."
                          className="w-full px-2.5 py-2 text-stone-800 bg-transparent focus:bg-amber-50 focus:outline-none"
                        />
                      </td>
                      <td className="border border-stone-200 p-0">
                        <input
                          type="text"
                          dir="ltr"
                          value={row.englishName}
                          onChange={(e) => handleMasterCellChange(idx, 'englishName', e.target.value)}
                          placeholder="English Name..."
                          className="w-full px-2.5 py-2 text-stone-700 bg-transparent focus:bg-amber-50 focus:outline-none"
                        />
                      </td>
                      <td className="border border-stone-200 p-0">
                        <input
                          type="text"
                          dir="ltr"
                          value={row.englishFather}
                          onChange={(e) => handleMasterCellChange(idx, 'englishFather', e.target.value)}
                          placeholder="Father Name..."
                          className="w-full px-2.5 py-2 text-stone-700 bg-transparent focus:bg-amber-50 focus:outline-none"
                        />
                      </td>
                      <td className="border border-stone-200 p-0">
                        <select
                          value={row.className}
                          onChange={(e) => handleMasterCellChange(idx, 'className', e.target.value)}
                          className="w-full px-2 py-2 bg-transparent font-bold text-emerald-900 focus:bg-amber-50 focus:outline-none cursor-pointer"
                        >
                          <option value="">-- درجہ --</option>
                          {classTabNames.map((cn, cnIdx) => (
                            <option key={`cls-opt-${cnIdx}-${cn}`} value={cn}>
                              {cn}
                            </option>
                          ))}
                          {row.className && !classTabNames.includes(row.className) && (
                            <option key={`cls-opt-extra-${row.className}`} value={row.className}>{row.className}</option>
                          )}
                        </select>
                      </td>
                      <td dir="ltr" className="border border-stone-200 p-0">
                        <DobCellInput
                          externalValue={row.dob}
                          onValueChange={(val) => handleMasterCellChange(idx, 'dob', val)}
                        />
                      </td>
                      <td className="border border-stone-200 px-1 py-1 text-center">
                        <button
                          type="button"
                          onClick={() => handleDeleteMasterRow(idx)}
                          className="p-1 text-stone-400 hover:text-rose-600 cursor-pointer"
                          title="سطر حذف کریں"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          ) : (
            /* CLASS / DARJA RESULT SPREADSHEET GRID (RTL: ID -> Name -> Subjects -> Total -> Obtained -> % -> Kaifiyat) */
            <table className="w-max min-w-full border-collapse text-xs text-right">
              <thead className="sticky top-0 z-20 bg-emerald-950 text-white font-bold">
                <tr>
                  <th className="border border-emerald-800 px-1.5 py-2 w-[68px] min-w-[68px] max-w-[68px] sm:w-[88px] sm:min-w-[88px] sm:max-w-[88px] text-center sticky right-0 bg-emerald-950 z-30 text-[11px] sm:text-xs leading-tight">
                    اسٹوڈنٹ آئی ڈی
                  </th>
                  <th className="border border-emerald-800 px-2 py-2 w-[112px] min-w-[112px] max-w-[112px] sm:w-[165px] sm:min-w-[165px] sm:max-w-[165px] sticky right-[68px] sm:right-[88px] bg-emerald-950 z-30 shadow-xs text-right text-[11px] sm:text-xs">
                    نام طالب علم
                  </th>

                  {/* Editable Subject Headers */}
                  {(activeTab.subjects || []).map((sub, sIdx) => (
                    <th
                      key={sub.id}
                      className="border border-emerald-800 px-1.5 py-2 w-[84px] min-w-[84px] sm:w-[115px] sm:min-w-[115px] text-center align-middle bg-emerald-900/90"
                    >
                      {editingSubjectIdx === sIdx ? (
                        <div className="space-y-1 p-1 bg-white text-stone-900 rounded-lg shadow-md">
                          <input
                            type="text"
                            value={tempSubjectName}
                            onChange={(e) => setTempSubjectName(e.target.value)}
                            placeholder="مضمون کا نام"
                            className="w-full px-1.5 py-1 border border-stone-300 rounded text-[11px] font-bold text-center focus:outline-none focus:border-emerald-700"
                            autoFocus
                          />
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] text-stone-500 shrink-0">کل:</span>
                            <input
                              type="number"
                              value={tempSubjectMax}
                              onChange={(e) => setTempSubjectMax(e.target.value)}
                              className="w-full px-1.5 py-0.5 border border-stone-300 rounded text-[11px] font-mono text-center focus:outline-none"
                            />
                          </div>
                          <div className="flex items-center justify-between gap-1 pt-0.5">
                            <button
                              type="button"
                              onClick={() => handleSaveSubjectHeaderEdit(sIdx)}
                              className="flex-1 py-0.5 bg-emerald-800 text-white rounded text-[10px] font-bold flex items-center justify-center gap-0.5 cursor-pointer"
                            >
                              <Check className="w-3 h-3" />
                              <span>ٹھیک</span>
                            </button>
                            {(activeTab.subjects?.length || 0) > 1 && (
                              <button
                                type="button"
                                onClick={() => handleDeleteSubjectColumn(sIdx)}
                                className="p-1 bg-rose-50 text-rose-700 rounded cursor-pointer"
                                title="مضمون حذف کریں"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => setEditingSubjectIdx(null)}
                              className="p-1 bg-stone-100 text-stone-600 rounded cursor-pointer"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingSubjectIdx(sIdx);
                            setTempSubjectName(sub.name);
                            setTempSubjectMax(String(sub.maxMarks || 100));
                          }}
                          className="w-full group flex flex-col items-center gap-0.5 cursor-pointer hover:text-amber-300 transition-colors"
                          title="مضمون کا نام یا کل نمبر تبدیل کرنے کے لیے کلک کریں"
                        >
                          <span className="flex items-center gap-1 text-xs font-bold leading-tight">
                            <span>{sub.name}</span>
                            <Edit3 className="w-3 h-3 opacity-60 group-hover:opacity-100" />
                          </span>
                          <span className="text-[10px] font-mono text-amber-300 font-normal">
                            کل نمبر: {sub.maxMarks}
                          </span>
                        </button>
                      )}
                    </th>
                  ))}

                  {/* Auto-Calculated Summary Columns at End (Left side in RTL) */}
                  <th className="border border-emerald-800 px-2.5 py-2.5 w-20 text-center bg-stone-800">
                    کل نمبر
                  </th>
                  <th className="border border-emerald-800 px-2.5 py-2.5 w-24 text-center bg-stone-800">
                    حاصل کردہ
                  </th>
                  <th className="border border-emerald-800 px-2.5 py-2.5 w-20 text-center bg-stone-800">
                    فیصد (%)
                  </th>
                  <th className="border border-emerald-800 px-3 py-2.5 w-24 text-center bg-stone-800">
                    کیفیت
                  </th>
                </tr>
              </thead>

              <tbody>
                {filteredClassRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={(activeTab.subjects?.length || 0) + 6}
                      className="p-12 text-center text-stone-500 space-y-2"
                    >
                      <p className="font-bold text-sm">
                        اس درجہ ({activeTab.name}) میں ابھی کوئی طالب علم درج نہیں ہے۔
                      </p>
                      <p className="text-xs text-stone-400">
                        ماسٹر ٹیب (Master Data) میں طلبہ داخل کر کے درجہ "{activeTab.name}" منتخب کریں اور سیو کریں۔
                      </p>
                    </td>
                  </tr>
                ) : (
                  filteredClassRows.map(({ row, idx }) => {
                    const subs = activeTab.subjects || [];
                    const summary = computeRowSummary(row, subs, rules, passing);
                    const totalRowsCount = activeTab.classRows?.length || 0;
                    const passPct = passing?.passingPercentage ?? 33;

                    return (
                      <tr
                        key={`c-row-${idx}`}
                        className="hover:bg-emerald-50/30 border-b border-stone-200"
                      >
                        {/* Sticky Student ID (Managed in Master Data) */}
                        <td className="border border-stone-200 px-1 py-2 text-center font-mono tabular-nums text-[11px] sm:text-xs font-bold text-stone-900 sticky right-0 bg-stone-50/95 z-10 w-[68px] min-w-[68px] max-w-[68px] sm:w-[88px] sm:min-w-[88px] sm:max-w-[88px]">
                          {row.studentId}
                        </td>

                        {/* Sticky Candidate Name (Managed in Master Data) */}
                        <td className="border border-stone-200 px-2 py-2 font-bold text-stone-900 text-[11px] sm:text-xs text-right sticky right-[68px] sm:right-[88px] bg-white z-10 shadow-2xs w-[112px] min-w-[112px] max-w-[112px] sm:w-[165px] sm:min-w-[165px] sm:max-w-[165px] truncate">
                          {row.studentName}
                        </td>

                        {/* Subject Marks Inputs */}
                        {subs.map((sub, sIdx) => {
                          const rawMark = row.marks[sIdx] ?? '';
                          const isAb = isAbsentToken(rawMark);
                          const numeric = parseFloat(convertEasternToWesternDigits(rawMark));
                          const isFail =
                            isAb ||
                            (!isNaN(numeric) &&
                              sub.maxMarks > 0 &&
                              (numeric / sub.maxMarks) * 100 < passPct);

                          return (
                            <td key={`cell-${idx}-${sub.id}`} dir="ltr" className="border border-stone-200 p-0">
                              <MarkCellInput
                                key={`${idx}:${activeTab.name}-sub-${sIdx}`}
                                rowIdx={idx}
                                subIdx={sIdx}
                                cellKey={`${idx}:${activeTab.name}-sub-${sIdx}`}
                                externalValue={rawMark}
                                registerRef={registerCellRef}
                                onPendingChange={handlePendingMarkChange}
                                onCommitValue={handleMarkChange}
                                onKeyDownCell={(e) =>
                                  handleCellKeyDown(
                                    e,
                                    idx,
                                    `${activeTab.name}-sub-${sIdx}`,
                                    totalRowsCount
                                  )
                                }
                                className={`w-full px-2.5 py-2 text-left font-sans tabular-nums font-bold focus:bg-amber-50 focus:ring-2 focus:ring-inset focus:ring-emerald-600 focus:outline-none ${
                                  isAb
                                    ? 'text-rose-700 bg-rose-50/60'
                                    : isFail && rawMark.trim() !== ''
                                      ? 'text-rose-700'
                                      : 'text-stone-900 bg-transparent'
                                }`}
                              />
                            </td>
                          );
                        })}

                        {/* Auto Summary Columns */}
                        <td className="border border-stone-200 px-2 py-2 text-center font-mono tabular-nums font-bold text-stone-600 bg-stone-50">
                          {summary.totalMarks}
                        </td>
                        <td className="border border-stone-200 px-2 py-2 text-center font-mono tabular-nums font-extrabold text-emerald-950 bg-stone-50">
                          {summary.filledCount > 0 ? summary.obtainedMarks : '—'}
                        </td>
                        <td className="border border-stone-200 px-2 py-2 text-center font-mono tabular-nums font-bold text-stone-800 bg-stone-50">
                          {summary.filledCount > 0 ? `${summary.percentage}%` : '—'}
                        </td>
                        <td className="border border-stone-200 px-2 py-1.5 text-center bg-stone-50">
                          {summary.filledCount > 0 ? (
                            <span
                              className={`inline-block px-2 py-0.5 rounded text-[11px] font-bold border ${getKaifiyatBadgeClass(
                                summary.kaifiyat,
                                rules
                              )}`}
                            >
                              {summary.kaifiyat}
                            </span>
                          ) : (
                            <span className="text-stone-400">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ================================================================= */}
      {/* PRINTABLE A4 LANDSCAPE URDU GAZETTE PDF SHEET (Portaled to body)  */}
      {/* ================================================================= */}
      {activeTab &&
        !activeTab.isMaster &&
        typeof document !== 'undefined' &&
        createPortal(
          (() => {
            const subs = activeTab.subjects || [];
            const subjectCount = Math.max(subs.length, 1);
            const isManySubjects = subjectCount >= 6;

            // Balanced fixed-layout column percentages so Name & Father stay crisp and ALL subject columns are strictly equal width
            const colSerial = isManySubjects ? 3 : 3.5;
            const colId = isManySubjects ? 6.5 : 7.5;
            const colName = isManySubjects ? 11.5 : 13;
            const colFather = isManySubjects ? 11.5 : 13;
            const colTotal = isManySubjects ? 5 : 5.5;
            const colObtained = isManySubjects ? 5 : 5.5;
            const colPct = isManySubjects ? 5.5 : 6;
            const colKaifiyat = isManySubjects ? 7 : 7.5;
            const fixedSum =
              colSerial + colId + colName + colFather + colTotal + colObtained + colPct + colKaifiyat;
            const subjectColWidth = (100 - fixedSum) / subjectCount;

            const printableRows = (activeTab.classRows || []).filter(
              (r) =>
                Boolean(String(r.studentId || '').trim()) ||
                Boolean(String(r.studentName || '').trim()) ||
                (r.marks || []).some((m) => Boolean(String(m || '').trim()))
            );

            return (
              <div
                id="gazette-print-sheet"
                dir="rtl"
                className="hidden print:block font-urdu text-stone-950 bg-white"
              >
                <div className="gazette-frame border-2 border-emerald-900 p-3 rounded-lg">
                  {/* Page 1 Only: Madrasa Details, Logo & Summary Strip (never repeats on Page 2+) */}
                  <div className="gazette-header-block">
                    <div className="flex items-center justify-between border-b-2 border-emerald-900 pb-2.5 mb-2.5">
                      <div className="flex items-center gap-3">
                        {madrasa.logo && (
                          <img
                            src={madrasa.logo}
                            alt={madrasa.urduName}
                            className="w-14 h-14 object-contain rounded-lg border border-stone-200 shrink-0"
                          />
                        )}
                        <div>
                          <h2 className="font-aslam text-2xl font-bold text-emerald-950 leading-snug">
                            {madrasa.urduName}
                          </h2>
                          <div className="text-xs text-stone-700 flex items-center gap-2">
                            <span>
                              {madrasa.address || `${madrasa.district || ''} ${madrasa.state || ''}`}
                            </span>
                            <span>·</span>
                            <span className="font-mono font-bold">کوڈ: {madrasa.code}</span>
                          </div>
                        </div>
                      </div>

                      <div className="text-left space-y-0.5 shrink-0">
                        <div className="text-sm font-bold text-emerald-950">
                          {madrasa.examTitle || 'نتیجہ سالانہ امتحان 1448ھ / 2026ء'}
                        </div>
                        <div className="text-sm font-bold text-stone-900">
                          درجہ / کلاس: <span className="text-emerald-900">{activeTab.name}</span>
                        </div>
                        <div className="text-[11px] text-stone-500 font-mono">
                          تاریخِ اجرا: {new Date().toLocaleDateString('ur-PK')}
                        </div>
                      </div>
                    </div>

                    {/* Summary Strip (Page 1 Only) */}
                    {classStats && (
                      <div className="flex items-center justify-between bg-stone-100 border border-stone-300 rounded-lg px-3 py-1.5 mb-2.5 text-xs font-bold">
                        <span>کل طلبہ: {classStats.total}</span>
                        <span className="text-emerald-800">کامیاب: {classStats.passed}</span>
                        <span className="text-amber-800">مجاز: {classStats.mujaz}</span>
                        <span className="text-rose-800">ناکام: {classStats.failed}</span>
                      </div>
                    )}
                  </div>

                  {/* Gazette Results Table: Fixed Equal-Width Subject Columns + Clean Page 2+ Continuation */}
                  <table
                    className={`w-full border-collapse table-fixed text-center ${
                      isManySubjects ? 'text-[10px]' : 'text-[11px]'
                    }`}
                  >
                    <colgroup>
                      <col style={{ width: `${colSerial}%` }} />
                      <col style={{ width: `${colId}%` }} />
                      <col style={{ width: `${colName}%` }} />
                      <col style={{ width: `${colFather}%` }} />
                      {subs.map((sub) => (
                        <col key={`p-col-${sub.id}`} style={{ width: `${subjectColWidth}%` }} />
                      ))}
                      <col style={{ width: `${colTotal}%` }} />
                      <col style={{ width: `${colObtained}%` }} />
                      <col style={{ width: `${colPct}%` }} />
                      <col style={{ width: `${colKaifiyat}%` }} />
                    </colgroup>

                    <thead>
                      <tr className="bg-emerald-950 text-white font-bold">
                        <th className="border border-stone-400 px-1 py-1.5">#</th>
                        <th className="border border-stone-400 px-1 py-1.5">آئی ڈی</th>
                        <th className="border border-stone-400 px-1.5 py-1.5 text-right">
                          نام طالب علم
                        </th>
                        <th className="border border-stone-400 px-1.5 py-1.5 text-right">
                          والد کا نام
                        </th>
                        {subs.map((sub) => (
                          <th
                            key={`p-h-${sub.id}`}
                            className="border border-stone-400 px-1 py-1.5 leading-tight break-words"
                          >
                            <div>{sub.name}</div>
                            <div className="text-[9px] font-mono text-amber-200">
                              ({sub.maxMarks})
                            </div>
                          </th>
                        ))}
                        <th className="border border-stone-400 px-1 py-1.5">کل نمبر</th>
                        <th className="border border-stone-400 px-1 py-1.5">حاصل</th>
                        <th className="border border-stone-400 px-1 py-1.5">فیصد</th>
                        <th className="border border-stone-400 px-1 py-1.5">کیفیت</th>
                      </tr>
                    </thead>

                    <tbody>
                      {printableRows.map((row, idx) => {
                        const sum = computeRowSummary(row, subs, rules, passing);
                        const idKey = convertEasternToWesternDigits(
                          String(row.studentId || '').trim()
                        ).toLowerCase();
                        const nameKey = String(row.studentName || '').trim().toLowerCase();
                        const resolvedFatherName =
                          String(row.fatherName || '').trim() ||
                          (idKey ? fatherNameLookup.byId.get(idKey) : '') ||
                          (nameKey ? fatherNameLookup.byName.get(nameKey) : '') ||
                          '—';
                        const kaifiyatColorClasses =
                          sum.filledCount > 0 ? getKaifiyatBadgeClass(sum.kaifiyat, rules) : '';

                        return (
                          <tr
                            key={`p-r-${idx}`}
                            className={idx % 2 === 1 ? 'bg-stone-50' : 'bg-white'}
                          >
                            <td className="border border-stone-300 px-1 py-1 font-mono tabular-nums">
                              {idx + 1}
                            </td>
                            <td className="border border-stone-300 px-1 py-1 font-mono tabular-nums font-bold">
                              {row.studentId || '—'}
                            </td>
                            <td className="border border-stone-300 px-1.5 py-1 text-right font-bold break-words leading-snug">
                              {row.studentName || '—'}
                            </td>
                            <td className="border border-stone-300 px-1.5 py-1 text-right text-stone-800 break-words leading-snug">
                              {resolvedFatherName}
                            </td>
                            {subs.map((sub, sIdx) => {
                              const rawMark = String(row.marks[sIdx] ?? '').trim();
                              const isAbs = rawMark ? isAbsentToken(rawMark) : false;
                              return (
                                <td
                                  key={`p-m-${idx}-${sub.id}`}
                                  className={`border border-stone-300 px-1 py-1 font-mono tabular-nums ${
                                    isAbs ? 'text-rose-700 font-bold' : 'text-stone-900'
                                  }`}
                                >
                                  {rawMark || '—'}
                                </td>
                              );
                            })}
                            <td className="border border-stone-300 px-1 py-1 font-mono tabular-nums font-bold">
                              {sum.totalMarks}
                            </td>
                            <td className="border border-stone-300 px-1 py-1 font-mono tabular-nums font-bold">
                              {sum.filledCount > 0 ? sum.obtainedMarks : '—'}
                            </td>
                            <td className="border border-stone-300 px-1 py-1 font-mono tabular-nums">
                              {sum.filledCount > 0 ? `${sum.percentage}%` : '—'}
                            </td>
                            <td className="border border-stone-300 px-1 py-0.5 text-center">
                              {sum.filledCount > 0 ? (
                                <span
                                  className={`inline-block w-full px-1 py-0.5 rounded border text-[10px] font-bold leading-tight ${kaifiyatColorClasses}`}
                                >
                                  {sum.kaifiyat}
                                </span>
                              ) : (
                                <span className="text-stone-400">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  {/* Signature Footer (Appears cleanly once at the end of the last page) */}
                  <div className="gazette-signatures flex items-center justify-between pt-9 px-6 text-xs font-bold text-stone-800">
                    <div className="border-t border-stone-500 pt-1 px-6">دستخط مدرس / ممتحن</div>
                    <div className="border-t border-stone-500 pt-1 px-6">دستخط ناظمِ تعلیمات</div>
                    <div className="border-t border-stone-500 pt-1 px-6">
                      مہر و دستخط مہتمم / پرنسپل
                    </div>
                  </div>
                </div>
              </div>
            );
          })(),
          document.body
        )}

      {/* Compact Centered Unsaved Changes Alert Modal */}
      {pendingNavAction && (
        <div
          dir="rtl"
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[70] bg-stone-950/55 backdrop-blur-[2px] flex items-center justify-center p-4 font-urdu print:hidden"
        >
          <div className="bg-white rounded-2xl shadow-2xl border border-amber-200 max-w-xs w-full p-4 text-center space-y-3">
            <div className="w-10 h-10 rounded-full bg-amber-100 text-amber-700 mx-auto flex items-center justify-center">
              <AlertCircle className="w-5 h-5" />
            </div>

            <div className="space-y-1">
              <h3 className="text-sm font-extrabold text-stone-900">
                انٹری ابھی سیو نہیں ہوئی!
              </h3>
              <p className="text-xs text-stone-600 leading-relaxed">
                {pendingNavAction.type === 'switch_tab'
                  ? `"${activeTab?.name || ''}" کی تبدیلیاں محفوظ کیے بغیر پیج بدلنے پر ڈیٹا ضائع ہو سکتا ہے۔`
                  : 'غیر محفوظ انٹری سیو کیے بغیر باہر جانے پر ڈیٹا ضائع ہو سکتا ہے۔'}
              </p>
            </div>

            <div className="space-y-2 pt-1">
              <button
                type="button"
                disabled={isSaving}
                onClick={handleSaveAndContinueNav}
                className="w-full py-2 px-3 rounded-xl bg-amber-400 hover:bg-amber-300 text-emerald-950 text-xs font-extrabold flex items-center justify-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-60 transition-colors"
              >
                <Save className="w-3.5 h-3.5 shrink-0" />
                <span>
                  {isSaving
                    ? 'محفوظ ہو رہا...'
                    : activeTab?.dirty || dirtyTabsRef.current.has(activeTabIndex)
                      ? 'پہلے سیو کریں'
                      : 'غیر محفوظ ٹیب کھولیں'}
                </span>
              </button>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => {
                    const action = pendingNavAction;
                    setPendingNavAction(null);
                    executeNavigation(action);
                  }}
                  className="py-2 px-2.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold cursor-pointer disabled:opacity-60 transition-colors"
                >
                  بغیر سیو جائیں
                </button>
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => setPendingNavAction(null)}
                  className="py-2 px-2.5 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-bold cursor-pointer disabled:opacity-60 transition-colors"
                >
                  واپس رہیں
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
