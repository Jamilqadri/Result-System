/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { Madrasa, KaifiyatRule, PassingSettings } from '../../types';
import { Sliders, Plus, Trash2, RotateCcw, Check, X, ShieldCheck, Globe, Building2, AlertTriangle, Sparkles, Palette } from 'lucide-react';
import { getCentralKaifiyatRules, getCentralPassingSettings } from '../../utils/storage';

interface KaifiyatSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (rules: KaifiyatRule[], passing: PassingSettings, applyToAll?: boolean) => void;
  madrasa?: Madrasa | null;
}

const DEFAULT_KAIFIYAT_RULES: KaifiyatRule[] = [
  { id: '1', minPercentage: 80, maxPercentage: 100, title: 'ممتاز', colorClass: 'text-emerald-700 bg-emerald-50 border-emerald-300' },
  { id: '2', minPercentage: 60, maxPercentage: 79.99, title: 'اعلیٰ', colorClass: 'text-blue-700 bg-blue-50 border-blue-300' },
  { id: '3', minPercentage: 50, maxPercentage: 59.99, title: 'جید', colorClass: 'text-amber-700 bg-amber-50 border-amber-300' },
  { id: '4', minPercentage: 33, maxPercentage: 49.99, title: 'مقبول', colorClass: 'text-stone-700 bg-stone-100 border-stone-300' },
];

const DEFAULT_PASSING_SETTINGS: PassingSettings = {
  passingPercentage: 33,
  oneSubjectFailLabel: 'مجاز',
  twoOrMoreFailLabel: 'ناکام',
  absentFailLabel: 'ناکام',
};

// Preset colors for grades with optimal text contrast
const COLOR_PRESETS = [
  { name: 'سبز (ممتاز)', bg: '#7ec845', text: '#000000', border: '#6eb837' },
  { name: 'اعلیٰ سبز', bg: '#5b9e54', text: '#ffffff', border: '#4f8c49' },
  { name: 'زمردی گہرا', bg: '#10b981', text: '#ffffff', border: '#059669' },
  { name: 'آسمانی نیلا (جید)', bg: '#00a2ed', text: '#ffffff', border: '#0090d4' },
  { name: 'شاہی نیلا', bg: '#2563eb', text: '#ffffff', border: '#1d4ed8' },
  { name: 'ہلکا نیلا (مقبول)', bg: '#c6d9f1', text: '#000000', border: '#b0c7e4' },
  { name: 'نارنجی (مجاز)', bg: '#f97316', text: '#ffffff', border: '#ea580c' },
  { name: 'سنہری زرد', bg: '#f59e0b', text: '#000000', border: '#d97706' },
  { name: 'جامنی / ارغوانی', bg: '#8b5cf6', text: '#ffffff', border: '#7c3aed' },
  { name: 'سرخ (ناکام)', bg: '#ff0000', text: '#ffffff', border: '#e60000' },
  { name: 'گلابی', bg: '#ec4899', text: '#ffffff', border: '#db2777' },
  { name: 'سرمئی پالش', bg: '#64748b', text: '#ffffff', border: '#475569' },
];

function isColorDark(hexColor: string): boolean {
  const hex = hexColor.replace('#', '');
  if (hex.length === 3) {
    const r = parseInt(hex[0] + hex[0], 16);
    const g = parseInt(hex[1] + hex[1], 16);
    const b = parseInt(hex[2] + hex[2], 16);
    return (r * 299 + g * 587 + b * 114) / 1000 < 150;
  }
  if (hex.length === 6) {
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    return (r * 299 + g * 587 + b * 114) / 1000 < 150;
  }
  return false;
}

function getRuleColors(rule: KaifiyatRule): { bg: string; text: string; border: string } {
  if (rule.color) {
    return {
      bg: rule.color,
      text: rule.textColor || (isColorDark(rule.color) ? '#ffffff' : '#000000'),
      border: rule.borderColor || rule.color,
    };
  }
  const norm = (rule.title || '').trim().replace(/[\s\u200c\u200d\uFEFF]/g, '');
  if (norm === 'ناکام' || norm.includes('ناکام') || norm.includes('فیل')) {
    return { bg: '#ff0000', text: '#ffffff', border: '#e60000' };
  }
  if (norm === 'ممتاز' || norm.includes('ممتاز')) {
    return { bg: '#7ec845', text: '#000000', border: '#6eb837' };
  }
  if (norm === 'اعلی' || norm === 'اعلیٰ' || norm.includes('اعلی')) {
    return { bg: '#5b9e54', text: '#ffffff', border: '#4f8c49' };
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
  return { bg: '#7ec845', text: '#000000', border: '#6eb837' };
}

export const KaifiyatSettingsModal: React.FC<KaifiyatSettingsModalProps> = ({
  isOpen,
  onClose,
  onSave,
  madrasa,
}) => {
  const isCentralMode = !madrasa;

  const [rules, setRules] = useState<KaifiyatRule[]>(() => {
    if (madrasa?.kaifiyatRules && madrasa.kaifiyatRules.length > 0) {
      return JSON.parse(JSON.stringify(madrasa.kaifiyatRules));
    }
    return JSON.parse(JSON.stringify(getCentralKaifiyatRules()));
  });

  const [passing, setPassing] = useState<PassingSettings>(() => {
    if (madrasa?.passingSettings) {
      return { ...madrasa.passingSettings };
    }
    return { ...getCentralPassingSettings() };
  });

  const [applyToAll, setApplyToAll] = useState(false);
  const [activeColorPickerId, setActiveColorPickerId] = useState<string | null>(null);
  const colorPickerRef = useRef<HTMLDivElement>(null);

  // Close color popover on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (colorPickerRef.current && !colorPickerRef.current.contains(e.target as Node)) {
        setActiveColorPickerId(null);
      }
    }
    if (activeColorPickerId) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [activeColorPickerId]);

  if (!isOpen) return null;

  const handleAddRule = () => {
    const newRule: KaifiyatRule = {
      id: String(Date.now()),
      minPercentage: 70,
      maxPercentage: 79.99,
      title: 'جدید درجہ',
      colorClass: 'text-emerald-700 bg-emerald-50 border-emerald-300',
      color: '#10b981',
      textColor: '#ffffff',
      borderColor: '#059669',
    };
    setRules([...rules, newRule]);
  };

  const handleRemoveRule = (id: string) => {
    setRules(rules.filter((r) => r.id !== id));
  };

  const handleRuleChange = (id: string, field: keyof KaifiyatRule, value: any) => {
    setRules(
      rules.map((r) => {
        if (r.id === id) {
          return { ...r, [field]: value };
        }
        return r;
      })
    );
  };

  const handleSelectColor = (ruleId: string, bg: string, text: string, border: string) => {
    setRules(
      rules.map((r) => {
        if (r.id === ruleId) {
          return {
            ...r,
            color: bg,
            textColor: text,
            borderColor: border,
          };
        }
        return r;
      })
    );
    setActiveColorPickerId(null);
  };

  const handleCustomColor = (ruleId: string, hexColor: string) => {
    const dark = isColorDark(hexColor);
    setRules(
      rules.map((r) => {
        if (r.id === ruleId) {
          return {
            ...r,
            color: hexColor,
            textColor: dark ? '#ffffff' : '#000000',
            borderColor: hexColor,
          };
        }
        return r;
      })
    );
  };

  const handleResetDefaults = () => {
    if (isCentralMode) {
      setRules([...DEFAULT_KAIFIYAT_RULES]);
      setPassing({ ...DEFAULT_PASSING_SETTINGS });
    } else {
      // Revert to central default logic
      const centralR = getCentralKaifiyatRules();
      const centralP = getCentralPassingSettings();
      setRules(JSON.parse(JSON.stringify(centralR)));
      setPassing({ ...centralP });
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(rules, passing, isCentralMode ? applyToAll : false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-xs font-arabic overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-stone-200 my-auto overflow-hidden animate-fade-in">
        {/* Sticky Header with prominent close button */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-200 bg-stone-50/90 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shadow-xs ${
              isCentralMode ? 'bg-purple-100 text-purple-800' : 'bg-amber-100 text-amber-800'
            }`}>
              {isCentralMode ? <Globe className="w-5 h-5" /> : <Sliders className="w-5 h-5" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-nastaliq text-xl font-bold text-stone-900 leading-tight">
                  {isCentralMode ? 'مرکزی رزلٹ لاجک و گریڈنگ قواعد' : 'رزلٹ لاجک و کیفیت پالیسی'}
                </h3>
                {isCentralMode ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-200">
                    مرکزی عمومی ڈیفالٹ (Global Default)
                  </span>
                ) : (
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                    madrasa?.hasCustomResultLogic
                      ? 'bg-amber-100 text-amber-800 border-amber-300'
                      : 'bg-emerald-100 text-emerald-800 border-emerald-300'
                  }`}>
                    {madrasa?.hasCustomResultLogic ? 'مخصوص کسٹم لاجک' : 'مرکزی ڈیفالٹ لاگو'}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-stone-500 mt-0.5">
                {isCentralMode ? (
                  <span>یہ لاجک تمام ملحقہ مدارس پر بطورِ ڈیفالٹ نافذ ہوتی ہے، جب تک کوئی پرنسپل اپنا الگ رزلٹ لاجک نہ سیٹ کرے۔</span>
                ) : (
                  <span>
                    ادارہ: <strong className="font-aslam text-emerald-800 text-sm">{madrasa?.urduName}</strong> ({madrasa?.code})
                  </span>
                )}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-stone-400 hover:text-stone-700 hover:bg-stone-200/70 transition-colors cursor-pointer"
            aria-label="بند کریں"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <div className="p-5 sm:p-6 overflow-y-auto flex-1 overscroll-contain">
          {/* Informational Guidance Banner */}
          {isCentralMode ? (
            <div className="mb-5 p-3.5 bg-purple-50/80 border border-purple-200 rounded-2xl flex items-start gap-3 text-xs text-purple-950">
              <Sparkles className="w-5 h-5 text-purple-700 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-purple-900">مرکزی کنٹرول: تمام مدارس کے لیے عمومی ڈیفالٹ رزلٹ لاجک</p>
                <p className="text-purple-800 text-[11px] mt-0.5">
                  یہاں کی گئی ترتیبات خودکار طور پر ان تمام مدارس اور درجات کے رزلٹ پر لاگو ہوں گی جنہوں نے اپنے پرنسپل پینل سے اپنی الگ مخصوص لاجک سیٹ نہیں کی ہے۔
                </p>
              </div>
            </div>
          ) : (
            <div className="mb-5 p-3.5 bg-amber-50/80 border border-amber-200 rounded-2xl flex items-start gap-3 text-xs text-amber-950">
              <Building2 className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-amber-900">پرنسپل پینل: آپ کے ادارے کے لیے مخصوص رزلٹ لاجک</p>
                <p className="text-amber-800 text-[11px] mt-0.5">
                  یہاں تبدیلیاں کرنے کے بعد آپ کے مدرسے کا رزلٹ آپ کی منتخب کردہ حدود اور پالیسی کے مطابق شمار ہوگا۔ اگر آپ مرکزی ڈیفالٹ لاگو رکھنا چاہتے ہیں تو نیچے دیے گئے ری سیٹ بٹن سے واپس مرکزی قواعد بحال کر سکتے ہیں۔
                </p>
              </div>
            </div>
          )}

          <form id="kaifiyat-form" onSubmit={handleSubmit} className="space-y-6 text-sm">
          {/* Section 1: Passing Marks Rules */}
          <div className="p-4 bg-stone-50 rounded-xl border border-stone-200 space-y-4">
            <div className="flex items-center justify-between border-b pb-2">
              <h4 className="font-semibold text-stone-900 flex items-center gap-2">
                <span>1. بنیادی پاسنگ رولز (Passing Marks Criteria)</span>
              </h4>
              <button
                type="button"
                onClick={handleResetDefaults}
                className="text-xs text-stone-600 hover:text-stone-900 flex items-center gap-1 cursor-pointer bg-white px-2.5 py-1 rounded-lg border border-stone-200 shadow-2xs hover:bg-stone-50"
              >
                <RotateCcw className="w-3.5 h-3.5 text-stone-500" />
                <span>{isCentralMode ? 'فیکٹری ڈیفالٹ بحال کریں' : 'مرکزی ڈیفالٹ لاجک بحال کریں'}</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1">
                  کم از کم پاسنگ فیصد
                </label>
                <div className="relative">
                  <input
                    type="number"
                    dir="ltr"
                    min="1"
                    max="100"
                    value={passing.passingPercentage}
                    onChange={(e) =>
                      setPassing({ ...passing, passingPercentage: Number(e.target.value) || 33 })
                    }
                    className="w-full px-3 py-2 bg-white border border-stone-300 rounded-lg text-stone-900 font-mono text-center font-bold focus:ring-2 focus:ring-emerald-600 focus:outline-none"
                  />
                  <span className="absolute inset-y-0 right-2.5 flex items-center text-xs text-stone-400">
                    %
                  </span>
                </div>
                <span className="text-[10px] text-stone-400 mt-0.5 block">معیار: 33% فی مضمون</span>
              </div>

              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1">
                  ایک مضمون میں فیل کا عنوان
                </label>
                <input
                  type="text"
                  value={passing.oneSubjectFailLabel}
                  onChange={(e) =>
                    setPassing({ ...passing, oneSubjectFailLabel: e.target.value })
                  }
                  className="w-full px-3 py-2 bg-white border border-stone-300 rounded-lg text-stone-900 font-semibold focus:ring-2 focus:ring-emerald-600 focus:outline-none"
                />
                <span className="text-[10px] text-stone-400 mt-0.5 block">ڈیفالٹ: مجاز</span>
              </div>

              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1">
                  دو یا زائد مضامین میں فیل
                </label>
                <input
                  type="text"
                  value={passing.twoOrMoreFailLabel}
                  onChange={(e) =>
                    setPassing({ ...passing, twoOrMoreFailLabel: e.target.value })
                  }
                  className="w-full px-3 py-2 bg-white border border-stone-300 rounded-lg text-stone-900 font-semibold focus:ring-2 focus:ring-emerald-600 focus:outline-none"
                />
                <span className="text-[10px] text-stone-400 mt-0.5 block">ڈیفالٹ: ناکام</span>
              </div>

              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1">
                  کسی ایک مضمون میں غیر حاضر (غ)
                </label>
                <input
                  type="text"
                  value={passing.absentFailLabel}
                  onChange={(e) =>
                    setPassing({ ...passing, absentFailLabel: e.target.value })
                  }
                  className="w-full px-3 py-2 bg-white border border-stone-300 rounded-lg text-stone-900 font-semibold focus:ring-2 focus:ring-emerald-600 focus:outline-none"
                />
                <span className="text-[10px] text-stone-400 mt-0.5 block">ڈیفالٹ: ناکام</span>
              </div>
            </div>

            {/* Note about 50 marks subjects and fail rules */}
            <div className="mt-3 p-3 bg-emerald-50/80 border border-emerald-200/90 rounded-xl text-emerald-950 text-xs space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-emerald-900">
                <span>📌 وضاحتی ضابطۂ نمبرات و پاسنگ پالیسی:</span>
              </div>
              <ul className="list-disc list-inside space-y-0.5 text-[11px] text-emerald-800">
                <li>
                  <strong>100 نمبر والا مضمون:</strong> کم از کم پاسنگ {passing.passingPercentage} نمبر درکار ہوں گے۔
                </li>
                <li>
                  <strong>50 نمبر والا مضمون:</strong> طے شدہ کا نصف یعنی <strong>{Math.ceil(passing.passingPercentage / 2)}</strong> نمبر (مثلاً 33 کا نصف 17 نمبر) پر پاس شمار ہوگا۔
                </li>
                <li>
                  <strong>ایک سے زائد میں ناکام:</strong> اگر طالب علم 2 یا زیادہ مضامین میں ناکام ہو تو حتمی کیفیت لازماً <strong>"{passing.twoOrMoreFailLabel || 'ناکام'}"</strong> ہوگی، مقبول نہیں آ سکتی۔
                </li>
              </ul>
            </div>
          </div>

          {/* Section 2: Kaifiyat Percentage Brackets & Color Chooser */}
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <div>
                <h4 className="font-semibold text-stone-900 text-sm flex items-center gap-1.5">
                  <Palette className="w-4 h-4 text-emerald-700" />
                  <span>2. درجات و کیفیت بریکٹس (Grades & Colors)</span>
                </h4>
                <p className="text-[11px] text-stone-500 mt-0.5">
                  درجات کے نام، ان کی کم از کم و زیادہ سے زیادہ فیصد حدود اور مخصوص رنگ مقرر فرمائیں۔
                </p>
              </div>

              {/* Add Grade Option (Top) */}
              <button
                type="button"
                onClick={handleAddRule}
                className="py-1.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ نیا گریڈ شامل کریں</span>
              </button>
            </div>

            {/* Mobile View: Compact Row-Style Cards (sm:hidden) with smaller fonts */}
            <div className="block sm:hidden space-y-2">
              {rules.map((rule, idx) => {
                const ruleColors = getRuleColors(rule);
                const isColorOpen = activeColorPickerId === rule.id;

                return (
                  <div
                    key={rule.id}
                    className="p-2.5 bg-stone-50 border border-stone-200/90 hover:border-stone-300 rounded-xl space-y-2 shadow-2xs transition-colors"
                  >
                    {/* Row 1: Index + Title Input + Color Chooser + Badge Preview + Delete */}
                    <div className="flex items-center gap-1.5">
                      <span className="w-6 h-6 rounded-md bg-stone-200 text-stone-700 text-[11px] font-mono font-bold flex items-center justify-center shrink-0">
                        {idx + 1}
                      </span>

                      <input
                        type="text"
                        value={rule.title}
                        onChange={(e) => handleRuleChange(rule.id, 'title', e.target.value)}
                        className="flex-1 min-w-0 px-2 py-1 bg-white border border-stone-300 rounded-lg text-stone-900 font-nastaliq text-sm font-bold focus:ring-1 focus:ring-emerald-600 focus:outline-none"
                        placeholder="گریڈ کا عنوان"
                      />

                      {/* Color Chooser Button & Popover */}
                      <div className="relative shrink-0" ref={isColorOpen ? colorPickerRef : undefined}>
                        <button
                          type="button"
                          onClick={() => setActiveColorPickerId(isColorOpen ? null : rule.id)}
                          className="px-2 py-1 rounded-lg border border-stone-300 bg-white hover:bg-stone-100 flex items-center gap-1 text-[11px] font-semibold text-stone-700 transition-colors cursor-pointer shadow-2xs"
                          title="رنگ منتخب کریں"
                        >
                          <span
                            style={{ backgroundColor: ruleColors.bg }}
                            className="w-3.5 h-3.5 rounded-full border border-black/20 shrink-0 shadow-2xs inline-block"
                          />
                          <Palette className="w-3 h-3 text-stone-500" />
                        </button>

                        {/* Floating Color Chooser Popover */}
                        {isColorOpen && (
                          <div
                            dir="rtl"
                            className="absolute z-50 mt-1 right-0 w-64 bg-white border border-stone-300 rounded-2xl shadow-xl p-3 animate-in fade-in zoom-in-95 text-right"
                          >
                            <div className="flex items-center justify-between pb-2 border-b border-stone-100 mb-2">
                              <span className="text-xs font-bold text-stone-800 flex items-center gap-1">
                                <Palette className="w-3.5 h-3.5 text-emerald-700" />
                                <span>رنگ کا انتخاب کریں</span>
                              </span>
                              <button
                                type="button"
                                onClick={() => setActiveColorPickerId(null)}
                                className="p-0.5 text-stone-400 hover:text-stone-700"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>

                            {/* Presets Grid */}
                            <div className="grid grid-cols-4 gap-2 mb-3">
                              {COLOR_PRESETS.map((preset, pIdx) => {
                                const isSelected = ruleColors.bg.toLowerCase() === preset.bg.toLowerCase();
                                return (
                                  <button
                                    key={pIdx}
                                    type="button"
                                    onClick={() => handleSelectColor(rule.id, preset.bg, preset.text, preset.border)}
                                    style={{ backgroundColor: preset.bg }}
                                    className={`h-7 rounded-lg border flex items-center justify-center transition-transform hover:scale-105 shadow-2xs cursor-pointer ${
                                      isSelected ? 'ring-2 ring-emerald-600 scale-105' : 'border-black/10'
                                    }`}
                                    title={preset.name}
                                  >
                                    {isSelected && (
                                      <Check
                                        style={{ color: preset.text }}
                                        className="w-3.5 h-3.5 drop-shadow-xs"
                                      />
                                    )}
                                  </button>
                                );
                              })}
                            </div>

                            {/* Custom Native Color Picker */}
                            <div className="pt-2 border-t border-stone-100 flex items-center justify-between text-xs">
                              <span className="text-[11px] text-stone-600">اپنی مرضی کا رنگ:</span>
                              <div className="flex items-center gap-1.5">
                                <input
                                  type="color"
                                  value={ruleColors.bg}
                                  onChange={(e) => handleCustomColor(rule.id, e.target.value)}
                                  className="w-7 h-7 p-0.5 rounded-lg border border-stone-300 cursor-pointer bg-white"
                                />
                                <span className="font-mono text-[10px] text-stone-500">{ruleColors.bg}</span>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Live Preview Badge */}
                      <span
                        style={{
                          backgroundColor: ruleColors.bg,
                          color: ruleColors.text,
                          borderColor: ruleColors.border,
                        }}
                        className="px-2 py-0.5 rounded-md text-xs font-nastaliq font-bold border shadow-2xs shrink-0"
                      >
                        {rule.title || 'گریڈ'}
                      </span>

                      {rules.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveRule(rule.id)}
                          className="p-1 text-stone-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer shrink-0"
                          title="حذف کریں"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    {/* Row 2: Percentage Limits in a Single Compact Row (تھوڑے چھوٹے فانٹ سائز کے ساتھ) */}
                    <div className="flex items-center gap-2 pt-1.5 border-t border-stone-200/70 text-xs">
                      <div className="flex-1 flex items-center gap-1.5 bg-white px-2 py-1 rounded-lg border border-stone-200">
                        <span className="text-[10px] text-stone-500 shrink-0 font-medium">کم از کم (Min):</span>
                        <input
                          type="number"
                          dir="ltr"
                          step="0.01"
                          value={rule.minPercentage}
                          onChange={(e) =>
                            handleRuleChange(rule.id, 'minPercentage', parseFloat(e.target.value) || 0)
                          }
                          className="w-full text-center font-mono font-bold text-xs text-stone-900 focus:outline-none"
                        />
                        <span className="text-[10px] text-stone-400 font-mono">%</span>
                      </div>

                      <span className="text-stone-300 font-mono text-[11px]">تا</span>

                      <div className="flex-1 flex items-center gap-1.5 bg-white px-2 py-1 rounded-lg border border-stone-200">
                        <span className="text-[10px] text-stone-500 shrink-0 font-medium">زیادہ سے زیادہ (Max):</span>
                        <input
                          type="number"
                          dir="ltr"
                          step="0.01"
                          value={rule.maxPercentage}
                          onChange={(e) =>
                            handleRuleChange(rule.id, 'maxPercentage', parseFloat(e.target.value) || 100)
                          }
                          className="w-full text-center font-mono font-bold text-xs text-stone-900 focus:outline-none"
                        />
                        <span className="text-[10px] text-stone-400 font-mono">%</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop / Tablet View: Streamlined Horizontal Row Table (hidden sm:block) */}
            <div className="hidden sm:block border border-stone-200 rounded-xl overflow-x-auto bg-white shadow-2xs">
              <table className="w-full text-right text-xs min-w-[560px]">
                <thead className="bg-stone-100 text-stone-700 font-semibold border-b border-stone-200">
                  <tr>
                    <th className="py-2 px-3 w-8 text-center font-mono text-[11px]">#</th>
                    <th className="py-2 px-3">گریڈ کا عنوان (Title)</th>
                    <th className="py-2 px-2 text-center w-28">رنگ (Color)</th>
                    <th className="py-2 px-3 text-center w-32">کم از کم فیصد (Min %)</th>
                    <th className="py-2 px-3 text-center w-32">زیادہ سے زیادہ (Max %)</th>
                    <th className="py-2 px-2 text-center w-24">پیش نظارہ</th>
                    <th className="py-2 px-2 text-center w-10">حذف</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {rules.map((rule, idx) => {
                    const ruleColors = getRuleColors(rule);
                    const isColorOpen = activeColorPickerId === rule.id;

                    return (
                      <tr key={rule.id} className="hover:bg-stone-50/80 transition-colors">
                        <td className="py-2 px-3 text-center font-mono text-stone-400 text-xs font-bold">{idx + 1}</td>
                        <td className="py-1.5 px-3">
                          <input
                            type="text"
                            value={rule.title}
                            onChange={(e) => handleRuleChange(rule.id, 'title', e.target.value)}
                            className="w-full px-2 py-1 bg-stone-50 border border-stone-200 rounded-lg text-stone-900 font-nastaliq text-sm font-bold focus:bg-white focus:ring-1 focus:ring-emerald-600 focus:outline-none"
                          />
                        </td>
                        <td className="py-1.5 px-2 text-center">
                          <div className="relative inline-block" ref={isColorOpen ? colorPickerRef : undefined}>
                            <button
                              type="button"
                              onClick={() => setActiveColorPickerId(isColorOpen ? null : rule.id)}
                              className="px-2 py-1 rounded-lg border border-stone-200 bg-white hover:bg-stone-50 flex items-center gap-1.5 text-xs text-stone-700 transition-colors cursor-pointer shadow-2xs mx-auto"
                            >
                              <span
                                style={{ backgroundColor: ruleColors.bg }}
                                className="w-3.5 h-3.5 rounded-full border border-black/20 shrink-0 inline-block"
                              />
                              <Palette className="w-3 h-3 text-stone-400" />
                            </button>

                            {/* Floating Popover on Desktop */}
                            {isColorOpen && (
                              <div
                                dir="rtl"
                                className="absolute z-50 mt-1 right-0 w-64 bg-white border border-stone-300 rounded-2xl shadow-xl p-3 animate-in fade-in zoom-in-95 text-right"
                              >
                                <div className="flex items-center justify-between pb-2 border-b border-stone-100 mb-2">
                                  <span className="text-xs font-bold text-stone-800 flex items-center gap-1">
                                    <Palette className="w-3.5 h-3.5 text-emerald-700" />
                                    <span>رنگ منتخب کریں</span>
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => setActiveColorPickerId(null)}
                                    className="p-0.5 text-stone-400 hover:text-stone-700"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </div>

                                <div className="grid grid-cols-4 gap-2 mb-3">
                                  {COLOR_PRESETS.map((preset, pIdx) => {
                                    const isSelected = ruleColors.bg.toLowerCase() === preset.bg.toLowerCase();
                                    return (
                                      <button
                                        key={pIdx}
                                        type="button"
                                        onClick={() => handleSelectColor(rule.id, preset.bg, preset.text, preset.border)}
                                        style={{ backgroundColor: preset.bg }}
                                        className={`h-7 rounded-lg border flex items-center justify-center transition-transform hover:scale-105 shadow-2xs cursor-pointer ${
                                          isSelected ? 'ring-2 ring-emerald-600 scale-105' : 'border-black/10'
                                        }`}
                                        title={preset.name}
                                      >
                                        {isSelected && (
                                          <Check
                                            style={{ color: preset.text }}
                                            className="w-3.5 h-3.5 drop-shadow-xs"
                                          />
                                        )}
                                      </button>
                                    );
                                  })}
                                </div>

                                <div className="pt-2 border-t border-stone-100 flex items-center justify-between text-xs">
                                  <span className="text-[11px] text-stone-600">اپنی مرضی کا رنگ:</span>
                                  <div className="flex items-center gap-1.5">
                                    <input
                                      type="color"
                                      value={ruleColors.bg}
                                      onChange={(e) => handleCustomColor(rule.id, e.target.value)}
                                      className="w-7 h-7 p-0.5 rounded-lg border border-stone-300 cursor-pointer bg-white"
                                    />
                                    <span className="font-mono text-[10px] text-stone-500">{ruleColors.bg}</span>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="py-1.5 px-3">
                          <div className="relative">
                            <input
                              type="number"
                              dir="ltr"
                              step="0.01"
                              value={rule.minPercentage}
                              onChange={(e) =>
                                handleRuleChange(rule.id, 'minPercentage', parseFloat(e.target.value) || 0)
                              }
                              className="w-full px-2 py-1 bg-stone-50 border border-stone-200 rounded-lg text-stone-900 font-mono text-center font-bold text-xs focus:bg-white focus:ring-1 focus:ring-emerald-600 focus:outline-none"
                            />
                            <span className="absolute inset-y-0 right-1.5 flex items-center text-[10px] text-stone-400 font-mono">
                              %
                            </span>
                          </div>
                        </td>
                        <td className="py-1.5 px-3">
                          <div className="relative">
                            <input
                              type="number"
                              dir="ltr"
                              step="0.01"
                              value={rule.maxPercentage}
                              onChange={(e) =>
                                handleRuleChange(rule.id, 'maxPercentage', parseFloat(e.target.value) || 100)
                              }
                              className="w-full px-2 py-1 bg-stone-50 border border-stone-200 rounded-lg text-stone-900 font-mono text-center font-bold text-xs focus:bg-white focus:ring-1 focus:ring-emerald-600 focus:outline-none"
                            />
                            <span className="absolute inset-y-0 right-1.5 flex items-center text-[10px] text-stone-400 font-mono">
                              %
                            </span>
                          </div>
                        </td>
                        <td className="py-1.5 px-2 text-center">
                          <span
                            style={{
                              backgroundColor: ruleColors.bg,
                              color: ruleColors.text,
                              borderColor: ruleColors.border,
                            }}
                            className="px-2.5 py-0.5 rounded text-xs font-nastaliq font-bold border shadow-2xs inline-block"
                          >
                            {rule.title || 'گریڈ'}
                          </span>
                        </td>
                        <td className="py-1.5 px-2 text-center">
                          {rules.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveRule(rule.id)}
                              className="p-1 rounded text-stone-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer transition-colors"
                              title="حذف کریں"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Add Grade Option (Bottom - Prominent Full Width Button) */}
            <button
              type="button"
              onClick={handleAddRule}
              className="w-full mt-3 py-2 px-3 border border-dashed border-emerald-400/90 bg-emerald-50/60 hover:bg-emerald-100/70 text-emerald-800 font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-2xs hover:shadow-xs"
            >
              <Plus className="w-4 h-4 text-emerald-700" />
              <span>+ نیا گریڈ شامل کریں (Add New Grade)</span>
            </button>
          </div>
        </form>
        </div>

        {/* Optional Force Apply Checkbox for Central Mode */}
        {isCentralMode && (
          <div className="px-5 py-2.5 bg-purple-50/70 border-t border-purple-200/60 flex items-center gap-2.5 text-xs text-purple-950 shrink-0">
            <input
              type="checkbox"
              id="apply-to-all-cb"
              checked={applyToAll}
              onChange={(e) => setApplyToAll(e.target.checked)}
              className="w-4 h-4 rounded text-purple-700 border-stone-300 focus:ring-purple-600 cursor-pointer"
            />
            <label htmlFor="apply-to-all-cb" className="cursor-pointer font-medium select-none">
              یہ رزلٹ لاجک تمام مدارس کے تمام درجات پر یکساں فوری لاگو کریں (Force apply to all madaris)
            </label>
          </div>
        )}

        {/* Sticky Action Footer */}
        <div className="p-4 border-t border-stone-200 bg-stone-50/90 flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 px-4 rounded-xl border border-stone-300 text-stone-700 hover:bg-stone-100 transition-colors text-xs font-semibold cursor-pointer"
          >
            منسوخ
          </button>
          <button
            type="submit"
            form="kaifiyat-form"
            className="flex-1 py-2.5 px-4 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-semibold text-xs shadow-xs transition-colors flex items-center justify-center gap-2 cursor-pointer"
          >
            <ShieldCheck className="w-4 h-4" />
            <span>{isCentralMode ? 'مرکزی ڈیفالٹ لاجک محفوظ کریں' : 'مدرسے کے لیے لاجک محفوظ کریں'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
