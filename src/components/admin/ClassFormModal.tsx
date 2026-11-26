/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { MadrasaClass, Madrasa, TestConnectionResult } from '../../types';
import { testSheetConnection, parseSheetData } from '../../utils/sheetParser';
import { BookOpen, FileSpreadsheet, CheckCircle2, AlertCircle, X, RefreshCw, Upload, Eye } from 'lucide-react';

interface ClassFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (classData: Omit<MadrasaClass, 'id' | 'updatedAt'>) => void;
  madrasa: Madrasa;
  existingClass?: MadrasaClass | null;
}

const PRESET_DARAJAAT = [
  'سال اول (درجہ اولیٰ)',
  'سال دوم (درجہ ثانیہ)',
  'سال سوم (درجہ ثالثہ)',
  'سال چہارم (درجہ رابعہ)',
  'سال پنجم (درجہ خامسہ)',
  'دورۂ حدیث شریف',
  'تخصص فی الفقہ والافتاء',
  'حفظ القرآن الکریم',
  'درجہ قراءت و تجوید',
];

const SAMPLE_CSV_TEMPLATE = `Student ID,DOB,Student Name,Father Name,ریاضی [100],املا [50],انگلش [100],دینیات [100],اردو [50],تجوید [100]`;


export const ClassFormModal: React.FC<ClassFormModalProps> = ({
  isOpen,
  onClose,
  onSave,
  madrasa,
  existingClass,
}) => {
  const defaultSheetUrl = existingClass?.googleSheetUrl || madrasa.googleSheetUrl || '';
  const [name, setName] = useState(existingClass?.name || 'سال سوم');
  const [academicYear, setAcademicYear] = useState(
    existingClass?.academicYear || '1447-1448ھ / 2025-2026ء'
  );
  const [status, setStatus] = useState<MadrasaClass['status']>(existingClass?.status || 'draft');
  const [sourceType, setSourceType] = useState<MadrasaClass['resultSourceType']>(
    existingClass?.resultSourceType || (defaultSheetUrl ? 'google_sheet' : 'csv')
  );
  const [googleSheetUrl, setGoogleSheetUrl] = useState(defaultSheetUrl);
  const [sheetTabName, setSheetTabName] = useState(existingClass?.sheetTabName || existingClass?.name || 'سال سوم');
  const [rawSourceData, setRawSourceData] = useState(
    existingClass?.rawSourceData || SAMPLE_CSV_TEMPLATE
  );

  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestConnectionResult | null>(
    existingClass?.testStatus || null
  );
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const [fetchedCsvData, setFetchedCsvData] = useState<string>(
    existingClass?.resultSourceType === 'google_sheet' ? existingClass.rawSourceData : ''
  );
  const [availableTabs, setAvailableTabs] = useState<{ name: string; gid: string }[]>([]);
  const [isLoadingTabs, setIsLoadingTabs] = useState(false);

  // Auto load tabs whenever googleSheetUrl changes
  useEffect(() => {
    if (!googleSheetUrl || !googleSheetUrl.includes('docs.google.com/spreadsheets')) return;
    setIsLoadingTabs(true);
    fetch('/api/sheet-tabs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sheetUrl: googleSheetUrl }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.tabs) && data.tabs.length > 0) {
          setAvailableTabs(data.tabs);
          // If sheetTabName not yet selected or defaults to something else
          if (!sheetTabName || sheetTabName === 'سال سوم') {
            const match = data.tabs.find((t: any) => t.name.includes(name) || name.includes(t.name));
            if (match) setSheetTabName(match.name);
          }
        }
      })
      .catch((e) => console.warn('Could not fetch sheet tabs:', e))
      .finally(() => setIsLoadingTabs(false));
  }, [googleSheetUrl, name]);

  if (!isOpen) return null;

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);

    const source = sourceType === 'google_sheet' ? googleSheetUrl : rawSourceData;
    const res = await testSheetConnection(
      source,
      sheetTabName,
      name,
      madrasa.kaifiyatRules,
      madrasa.passingSettings
    );
    if (res.fetchedCsv) {
      setFetchedCsvData(res.fetchedCsv);
    }
    setTestResult(res);
    setIsTesting(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      showToast('براہ کرم درجہ کا نام درج فرمائیں۔');
      return;
    }

    let csvContentToParse = rawSourceData;

    if (sourceType === 'google_sheet') {
      if (fetchedCsvData) {
        csvContentToParse = fetchedCsvData;
      } else {
        // If user didn't test connection yet, test now to fetch live CSV
        setIsTesting(true);
        const res = await testSheetConnection(
          googleSheetUrl,
          sheetTabName,
          name,
          madrasa.kaifiyatRules,
          madrasa.passingSettings
        );
        setIsTesting(false);
        if (res.fetchedCsv) {
          csvContentToParse = res.fetchedCsv;
          setFetchedCsvData(res.fetchedCsv);
        }
      }
    }

    // Parse students from data
    const { students } = parseSheetData(
      csvContentToParse,
      name,
      madrasa.kaifiyatRules,
      madrasa.passingSettings
    );

    onSave({
      madrasaId: madrasa.id,
      name: name.trim(),
      academicYear: academicYear.trim(),
      status,
      resultSourceType: sourceType,
      googleSheetUrl: googleSheetUrl.trim(),
      sheetTabName: sheetTabName.trim(),
      rawSourceData: csvContentToParse,
      lastTestedAt: new Date().toISOString(),
      testStatus: testResult,
      students,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-xs font-arabic overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-stone-200 my-auto overflow-hidden animate-fade-in">
        {/* Sticky Header with prominent close button */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-200 bg-stone-50/90 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center shadow-xs">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-nastaliq text-xl font-bold text-stone-900 leading-tight">
                {existingClass ? `درجہ ترمیم: ${existingClass.name}` : `نیا درجہ بنائیں (+ Create Class)`}
              </h3>
              <p className="text-[11px] text-stone-500">
                مدرسہ: <strong className="font-aslam text-emerald-800 text-sm">{madrasa.urduName}</strong> ({madrasa.code})
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
          {toastMessage && (
            <div className="mb-4 p-3 bg-emerald-50 border border-emerald-300 text-emerald-900 rounded-xl text-xs font-semibold flex items-center gap-2 animate-fade-in">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{toastMessage}</span>
            </div>
          )}

          <form id="class-form" onSubmit={handleSubmit} className="space-y-5 text-sm">
          {/* Class Basic Info */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-1">
              <label className="block font-medium text-stone-800 mb-1">
                درجہ کا نام (Class Name) <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="مثلاً: سال سوم"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-300 rounded-lg text-stone-900 font-nastaliq text-base focus:bg-white focus:ring-2 focus:ring-emerald-600 focus:outline-none"
              />
              {/* Presets quick tags */}
              <div className="mt-1 flex flex-wrap gap-1">
                {['سال اول', 'سال دوم', 'سال سوم', 'دورۂ حدیث', 'حفظ'].map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setName(p)}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-stone-100 text-stone-600 hover:bg-emerald-50 hover:text-emerald-700 cursor-pointer"
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            <div className="sm:col-span-1">
              <label className="block font-medium text-stone-800 mb-1">تعلیمی سال (Academic Year)</label>
              <input
                type="text"
                placeholder="1447-1448ھ / 2025-2026ء"
                value={academicYear}
                onChange={(e) => setAcademicYear(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-300 rounded-lg text-stone-900 focus:bg-white focus:ring-2 focus:ring-emerald-600 focus:outline-none"
              />
            </div>

            <div className="sm:col-span-1">
              <label className="block font-medium text-stone-800 mb-1">
                رزلٹ کی اشاعت (Publish Status)
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as MadrasaClass['status'])}
                className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-300 rounded-lg text-stone-900 font-semibold focus:bg-white focus:ring-2 focus:ring-emerald-600 focus:outline-none"
              >
                <option value="draft">مسودہ (Draft - غیر شائع)</option>
                <option value="published">شائع شدہ (Published - لائیو)</option>
                <option value="unpublished">غیر شائع (Unpublished)</option>
              </select>
              <p className="text-[10px] text-stone-500 mt-1">
                صرف Published رزلٹ پبلک پورٹل پر نظر آئے گا۔
              </p>
            </div>
          </div>

          {/* Result Source Config */}
          <div className="p-4 bg-stone-50 rounded-xl border border-stone-200 space-y-4">
            <div className="flex items-center justify-between border-b pb-2">
              <span className="font-semibold text-stone-800 flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-emerald-700" />
                <span>رزلٹ سورس (Result Source)</span>
              </span>

              {/* Source Tabs */}
              <div className="flex items-center gap-1 bg-stone-200/70 p-0.5 rounded-lg text-xs">
                <button
                  type="button"
                  onClick={() => setSourceType('google_sheet')}
                  className={`px-3 py-1 rounded-md transition-colors cursor-pointer ${
                    sourceType === 'google_sheet' ? 'bg-white font-semibold text-stone-900 shadow-2xs' : 'text-stone-600'
                  }`}
                >
                  آن لائن کلاؤڈ ریکارڈ (Online Cloud Record)
                </button>
                <button
                  type="button"
                  onClick={() => setSourceType('csv')}
                  className={`px-3 py-1 rounded-md transition-colors cursor-pointer ${
                    sourceType === 'csv' ? 'bg-white font-semibold text-stone-900 shadow-2xs' : 'text-stone-600'
                  }`}
                >
                  براہِ راست ڈیٹا / CSV Paste
                </button>
              </div>
            </div>

            {sourceType === 'google_sheet' ? (
              <div className="space-y-3">
                {/* Automatic Cloud & Google Sheet Banner */}
                <div className="p-4 bg-emerald-50 border border-emerald-300 rounded-xl text-xs space-y-2 text-emerald-950 font-urdu">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-emerald-900 flex items-center gap-2 text-sm">
                      <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                      <span>کلاؤڈ ریکارڈ خودکار فعال ہے (Automatic Cloud Data)</span>
                    </span>
                    <span className="text-[10px] bg-emerald-200 text-emerald-900 px-2.5 py-0.5 rounded-full font-bold border border-emerald-300">
                      خودکار لنک فعال ✓
                    </span>
                  </div>
                  <p className="text-emerald-800 text-[11.5px] leading-relaxed">
                    تمام ڈیٹا مرکزی ڈیٹابیس کے ذریعے خودکار طور پر ہم آہنگ (Sync) ہو رہا ہے۔ اساتذہ یا منتظمین کے اندراج کرتے ہی پورٹل لائیو اپڈیٹ ہو جائے گا۔
                  </p>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-stone-700">
                      Sheet Tab / ورک شیٹ کا نام (Worksheet Tab Name)
                    </label>
                    <span className="text-[11px] text-emerald-700 font-urdu">
                      شیٹ کے نچلے ٹیب کا ہوبہو نام
                    </span>
                  </div>
                  <input
                    type="text"
                    placeholder="مثلاً: سال سوم، سال اول، دورۂ حدیث"
                    value={sheetTabName}
                    onChange={(e) => setSheetTabName(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-white border border-stone-300 rounded-lg text-stone-900 focus:ring-2 focus:ring-emerald-600 focus:outline-none font-nastaliq text-base"
                  />
                  {/* Live detected tabs from Google Sheet */}
                  {availableTabs.length > 0 ? (
                    <div className="mt-2 p-2.5 bg-emerald-50/80 rounded-xl border border-emerald-200">
                      <span className="text-[11px] font-bold text-emerald-950 block mb-1.5 flex items-center gap-1">
                        <span>📊 آن لائن کلاؤڈ فائل میں موجود لائیو ٹیبس (کلک کر کے منتخب کریں):</span>
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {availableTabs.map((t) => (
                          <button
                            key={t.gid}
                            type="button"
                            onClick={() => {
                              setSheetTabName(t.name);
                              setName(t.name);
                            }}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-all border ${
                              sheetTabName === t.name
                                ? 'bg-emerald-700 text-white border-emerald-800 shadow-xs'
                                : 'bg-white text-emerald-900 border-emerald-300 hover:bg-emerald-100'
                            }`}
                          >
                            <span className="font-nastaliq text-sm">{t.name}</span>
                            <span className="font-mono text-[10px] opacity-75">#{t.gid}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : isLoadingTabs ? (
                    <div className="mt-1 text-[11px] text-emerald-700 flex items-center gap-1">
                      <RefreshCw className="w-3 h-3 animate-spin" />
                      <span>آن لائن فائل کے درجات و ٹیبس لوڈ ہو رہے ہیں...</span>
                    </div>
                  ) : null}

                  {/* Quick select tabs matching class */}
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-stone-600 font-urdu">
                    <span className="text-[11px] text-stone-500">عام نام:</span>
                    {[name, 'سال اول', 'سال دوم', 'سال سوم', 'سال چہارم', 'دورۂ حدیث', 'تخصص', 'حفظ'].filter(Boolean).map((t, idx) => (
                      <button
                        key={`${t}-${idx}`}
                        type="button"
                        onClick={() => setSheetTabName(t)}
                        className={`text-[11px] px-2 py-0.5 rounded cursor-pointer transition-colors ${
                          sheetTabName === t
                            ? 'bg-emerald-600 text-white font-bold'
                            : 'bg-stone-100 text-stone-700 hover:bg-emerald-50 hover:text-emerald-800'
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] text-stone-500 mt-1">
                    آن لائن فائل کے نیچے جس ٹیب پر اس درجے کا رزلٹ ہے، اس کا نام درج کریں۔ (خالی چھوڑنے پر پہلی شیٹ پڑھی جائے گی)۔
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-stone-600">
                  <span>CSV یا ایکسل سے کاپی کردہ ٹیبل ڈیٹا پیسٹ کریں:</span>
                  <button
                    type="button"
                    onClick={() => setRawSourceData(SAMPLE_CSV_TEMPLATE)}
                    className="text-emerald-700 hover:underline cursor-pointer"
                  >
                    نمونہ ڈیٹا بھریں (Load Sample Template)
                  </button>
                </div>
                <textarea
                  rows={6}
                  dir="ltr"
                  value={rawSourceData}
                  onChange={(e) => setRawSourceData(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-stone-300 rounded-lg text-stone-900 font-mono text-xs focus:ring-2 focus:ring-emerald-600 focus:outline-none"
                  placeholder="Student ID,DOB,Student Name,Father Name,ریاضی [100],املا [50]..."
                />
                <p className="text-[11px] text-stone-500">
                  سمارٹ ریڈنگ: کالم ہیڈر میں بریکٹ میں کل نمبر لکھیں، مثلاً: <code className="font-mono text-emerald-800">ریاضی [100]</code> یا <code className="font-mono text-emerald-800">اردو [50]</code>۔
                </p>
              </div>
            )}

            {/* Test Connection Button */}
            <div className="pt-2 flex items-center justify-between">
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={isTesting}
                className="py-2 px-4 rounded-lg bg-stone-800 hover:bg-stone-900 text-white text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin' : ''}`} />
                <span>{isTesting ? 'کنکشن ٹیسٹ ہو رہا ہے...' : 'Test Connection (ٹیسٹ کنکشن)'}</span>
              </button>

              <span className="text-[11px] text-stone-500">
                سسٹم خودکار طور پر کالمز، طلبہ اور مضامین کی تعداد چیک کرے گا۔
              </span>
            </div>

            {/* Test Result Feedback Box */}
            {testResult && (
              <div
                className={`p-4 rounded-xl border text-xs whitespace-pre-line ${
                  testResult.success
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                    : 'bg-rose-50 border-rose-300 text-rose-900'
                }`}
              >
                <div className="flex items-start gap-2">
                  {testResult.success ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1">
                    <div className="font-semibold text-sm mb-1">{testResult.message}</div>
                    {testResult.success && testResult.sampleStudent && (
                      <div className="mt-2 pt-2 border-t border-emerald-200 text-stone-700">
                        نمونہ پہلا ریکارڈ: <strong className="font-nastaliq">{testResult.sampleStudent.name}</strong> | ID:{' '}
                        <code className="font-mono font-bold">{testResult.sampleStudent.id}</code> | DOB:{' '}
                        <code className="font-mono">{testResult.sampleStudent.dob}</code>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </form>
        </div>

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
            form="class-form"
            className="flex-1 py-2.5 px-4 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-semibold text-xs shadow-xs transition-colors flex items-center justify-center gap-2 cursor-pointer"
          >
            <span>{existingClass ? 'تبدیلیاں محفوظ کریں' : 'درجہ شامل کریں'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
