/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { Madrasa } from '../../types';
import { getNextMadrasaCode, getStoredDefaultClasses } from '../../utils/storage';
import { INDIAN_STATES_DISTRICTS } from '../../utils/indiaLocations';
import { Building2, Palette, ShieldCheck, X, Upload, Image, MapPin, Check, Plus, ExternalLink, Copy, FileSpreadsheet, Trash2 } from 'lucide-react';

interface MadrasaFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (madrasaData: Partial<Madrasa> & Omit<Madrasa, 'id' | 'createdAt'>, selectedClasses?: string[]) => void;
  onDelete?: (id: string) => void;
  existingMadrasa?: Madrasa | null;
  allMadaris: Madrasa[];
}

const PRESET_COLORS = [
  { name: 'زمردی سبز', hex: '#065f46' },
  { name: 'گہرا نیلا', hex: '#1e3a8a' },
  { name: 'یاقوتی مہرون', hex: '#831843' },
  { name: 'سنہری عنبر', hex: '#92400e' },
  { name: 'گہرا صنوبر', hex: '#14532d' },
  { name: 'جامنی شاہی', hex: '#581c87' },
];

export const MadrasaFormModal: React.FC<MadrasaFormModalProps> = ({
  isOpen,
  onClose,
  onSave,
  onDelete,
  existingMadrasa,
  allMadaris,
}) => {
  const nextGen = getNextMadrasaCode(allMadaris);

  const [urduName, setUrduName] = useState(existingMadrasa?.urduName || '');
  const [englishName, setEnglishName] = useState(existingMadrasa?.englishName || '');
  const [selectedState, setSelectedState] = useState('Jharkhand');
  const [selectedDistrict, setSelectedDistrict] = useState('Giridih');
  const [customAddress, setCustomAddress] = useState(existingMadrasa?.address || '');
  const [description, setDescription] = useState(existingMadrasa?.description || '');
  const [logo, setLogo] = useState(existingMadrasa?.logo || '');
  const [themeColor, setThemeColor] = useState(existingMadrasa?.themeColor || '#065f46');
  const [contactPhone, setContactPhone] = useState(existingMadrasa?.contactPhone || '');
  const [email, setEmail] = useState(existingMadrasa?.email || '');
  const [website, setWebsite] = useState(existingMadrasa?.website || '');
  const [principalName, setPrincipalName] = useState(existingMadrasa?.principalName || '');
  const [principalPhone, setPrincipalPhone] = useState(existingMadrasa?.principalPhone || '');
  const [principalPassword, setPrincipalPassword] = useState(
    existingMadrasa?.principalPassword || ''
  );
  const [googleSheetUrl, setGoogleSheetUrl] = useState(
    existingMadrasa?.googleSheetUrl || ''
  );
  const [examTitle, setExamTitle] = useState(
    existingMadrasa?.examTitle || 'نتیجہ امتحان 1448ھ / 2026ء'
  );

  useEffect(() => {
    if (existingMadrasa) {
      setUrduName(existingMadrasa.urduName || '');
      setEnglishName(existingMadrasa.englishName || '');
      setCustomAddress(existingMadrasa.address || '');
      setDescription(existingMadrasa.description || '');
      setLogo(existingMadrasa.logo || '');
      setThemeColor(existingMadrasa.themeColor || '#065f46');
      setContactPhone(existingMadrasa.contactPhone || '');
      setEmail(existingMadrasa.email || '');
      setWebsite(existingMadrasa.website || '');
      setPrincipalName(existingMadrasa.principalName || '');
      setPrincipalPhone(existingMadrasa.principalPhone || '');
      setPrincipalPassword(existingMadrasa.principalPassword || '');
      setGoogleSheetUrl(existingMadrasa.googleSheetUrl || '');
      setExamTitle(existingMadrasa.examTitle || 'نتیجہ امتحان 1448ھ / 2026ء');
    } else {
      setEmail('');
    }
  }, [existingMadrasa]);

  // Default Classes Chips for registration (Synced with Admin Panel settings)
  const [availableClasses, setAvailableClasses] = useState<string[]>(() => getStoredDefaultClasses());
  const [selectedClasses, setSelectedClasses] = useState<string[]>(() => {
    const defaultList = getStoredDefaultClasses();
    return defaultList.slice(0, Math.min(defaultList.length, 3));
  });

  useEffect(() => {
    if (isOpen) {
      const currentList = getStoredDefaultClasses();
      setAvailableClasses(currentList);
      if (!existingMadrasa) {
        setSelectedClasses((prev) => {
          const valid = prev.filter((c) => currentList.includes(c));
          return valid.length > 0 ? valid : currentList.slice(0, Math.min(currentList.length, 3));
        });
      }
    }
  }, [isOpen, existingMadrasa]);
  const [newCustomClass, setNewCustomClass] = useState('');
  const [showAddClassInput, setShowAddClassInput] = useState(false);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const madrasaCode = existingMadrasa ? existingMadrasa.code : nextGen.code;
  const serialNumber = existingMadrasa ? existingMadrasa.serialNumber : nextGen.serial;

  const toggleClassSelection = (clsName: string) => {
    if (selectedClasses.includes(clsName)) {
      if (selectedClasses.length === 1) return; // Keep at least one
      setSelectedClasses(selectedClasses.filter((c) => c !== clsName));
    } else {
      setSelectedClasses([...selectedClasses, clsName]);
    }
  };

  const handleAddCustomClass = () => {
    const trimmed = newCustomClass.trim();
    if (!trimmed) return;
    if (!selectedClasses.includes(trimmed)) {
      setSelectedClasses([...selectedClasses, trimmed]);
    }
    setNewCustomClass('');
    setShowAddClassInput(false);
  };

  const handleLogoFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('براہ کرم صرف تصویر فائل منتخب کریں۔');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      alert('تصویر کا سائز زیادہ سے زیادہ 5MB ہونا چاہیے۔');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        const img = new window.Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const maxDim = 320;
          let w = img.width;
          let h = img.height;
          if (w > maxDim || h > maxDim) {
            if (w > h) {
              h = Math.round((h * maxDim) / w);
              w = maxDim;
            } else {
              w = Math.round((w * maxDim) / h);
              h = maxDim;
            }
          }
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, w, h);
            const compressed = canvas.toDataURL('image/jpeg', 0.82);
            setLogo(compressed);
          } else {
            setLogo(reader.result as string);
          }
        };
        img.src = reader.result;
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!urduName.trim()) {
      setErrorMessage('براہ کرم مدرسہ کا اردو نام درج فرمائیں۔');
      return;
    }
    if (customAddress.trim() && /[\u0600-\u06FF]/.test(customAddress)) {
      setErrorMessage('براہ کرم ڈاک پتہ صرف انگریزی (English) میں درج فرمائیں، اردو حروف کی اجازت نہیں ہے۔');
      return;
    }
    setErrorMessage(null);

    // Use only the address entered by the madrasa; do not automatically append State or District dropdown values
    const fullAddress = customAddress.trim() || [selectedDistrict, selectedState].filter(Boolean).join(', ');

    onSave(
      {
        ...(existingMadrasa
          ? {
              id: existingMadrasa.id,
              createdAt: existingMadrasa.createdAt,
              registrationStatus: existingMadrasa.registrationStatus || 'approved',
              isVerified: existingMadrasa.isVerified !== undefined ? existingMadrasa.isVerified : true,
              hasCustomResultLogic: Boolean(existingMadrasa.hasCustomResultLogic),
            }
          : {
              registrationStatus: 'approved',
              isVerified: true,
              hasCustomResultLogic: false,
            }),
        code: madrasaCode,
        serialNumber,
        urduName: urduName.trim(),
        englishName: englishName.trim() || urduName.trim(),
        address: fullAddress,
        description: description.trim(),
        logo: logo.trim(),
        themeColor,
        contactPhone: contactPhone.trim(),
        email: email.trim(),
        website: website.trim(),
        principalName: principalName.trim(),
        principalPhone: principalPhone.trim(),
        principalPassword: principalPassword.trim() || `${madrasaCode}@1234`,
        googleSheetUrl: googleSheetUrl.trim() || existingMadrasa?.googleSheetUrl || '',
        examTitle: examTitle.trim() || 'نتیجہ امتحان 1448ھ / 2026ء',
        kaifiyatRules: existingMadrasa?.kaifiyatRules || [
          { id: '1', minPercentage: 80, maxPercentage: 100, title: 'ممتاز', colorClass: 'text-emerald-700 bg-emerald-50 border-emerald-300' },
          { id: '2', minPercentage: 60, maxPercentage: 79.99, title: 'اعلیٰ', colorClass: 'text-blue-700 bg-blue-50 border-blue-300' },
          { id: '3', minPercentage: 50, maxPercentage: 59.99, title: 'جید', colorClass: 'text-amber-700 bg-amber-50 border-amber-300' },
          { id: '4', minPercentage: 0, maxPercentage: 49.99, title: 'مقبول', colorClass: 'text-stone-700 bg-stone-100 border-stone-300' },
        ],
        passingSettings: existingMadrasa?.passingSettings || {
          passingPercentage: 33,
          oneSubjectFailLabel: 'مجاز',
          twoOrMoreFailLabel: 'ناکام',
          absentFailLabel: 'ناکام',
        },
      },
      selectedClasses
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-xs font-urdu overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-stone-200 my-auto overflow-hidden animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-200 bg-stone-50/90 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-emerald-100 text-emerald-800 flex items-center justify-center shadow-xs">
              <Building2 className="w-5 h-5 text-emerald-800" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-stone-900 leading-tight">
                {existingMadrasa ? 'مدرسہ کی تفصیلات' : 'مدرسہ رجسٹریشن'}
              </h3>
              <p className="text-[11px] text-stone-500">
                مدرسہ کوڈ: <span className="font-mono font-bold text-emerald-800 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">{madrasaCode}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-stone-400 hover:text-stone-700 hover:bg-stone-200/70 transition-colors cursor-pointer"
            aria-label="بند کریں"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Wrap */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          {/* Form Body */}
          <div className="p-5 sm:p-6 overflow-y-auto flex-1 overscroll-contain space-y-4 text-xs sm:text-sm">
            {errorMessage && (
              <div className="p-3 bg-rose-50 border border-rose-300 text-rose-800 rounded-xl text-xs font-semibold flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-rose-600 shrink-0"></span>
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Names */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block font-semibold text-stone-800 mb-1">
                  مدرسہ کا نام (اردو) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="مثلاً: دارالعلوم اہلسنت غوثیہ نظامیہ"
                  value={urduName}
                  onChange={(e) => setUrduName(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-300 rounded-2xl text-stone-900 text-sm focus:bg-white focus:ring-2 focus:ring-emerald-600 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block font-semibold text-stone-800 mb-1 font-sans">
                  Madrasa Name (English)
                </label>
                <input
                  type="text"
                  dir="ltr"
                  placeholder="e.g. Darul Uloom Ahle Sunnat"
                  value={englishName}
                  onChange={(e) => setEnglishName(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-300 rounded-2xl text-stone-900 text-xs font-sans text-left focus:bg-white focus:ring-2 focus:ring-emerald-600 focus:outline-hidden"
                />
              </div>
            </div>

            {/* Location */}
            <div className="p-4 bg-stone-50 border border-stone-200 rounded-2xl space-y-3">
              <span className="font-semibold text-stone-800 text-xs flex items-center gap-1.5 border-b border-stone-200 pb-2">
                <MapPin className="w-3.5 h-3.5 text-emerald-700" />
                <span>مدرسہ کا پتہ اور مقام</span>
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" dir="ltr">
                <div>
                  <label className="block text-xs font-bold text-stone-800 mb-1 font-sans">
                    State <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={selectedState}
                    onChange={(e) => {
                      const newState = e.target.value;
                      setSelectedState(newState);
                      const availableDistricts = INDIAN_STATES_DISTRICTS[newState] || [];
                      setSelectedDistrict(availableDistricts[0] || '');
                    }}
                    className="w-full px-3 py-2 bg-white border border-stone-300 rounded-xl text-stone-900 text-xs font-sans focus:ring-2 focus:ring-emerald-600 focus:outline-hidden"
                  >
                    {Object.keys(INDIAN_STATES_DISTRICTS).map((state) => (
                      <option key={state} value={state}>
                        {state}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-800 mb-1 font-sans">
                    District <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={selectedDistrict}
                    onChange={(e) => setSelectedDistrict(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-stone-300 rounded-xl text-stone-900 text-xs font-sans focus:ring-2 focus:ring-emerald-600 focus:outline-hidden"
                  >
                    {(INDIAN_STATES_DISTRICTS[selectedState] || []).map((district) => (
                      <option key={district} value={district}>
                        {district}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div dir="ltr" className="text-left">
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-stone-800 font-sans">
                    Detailed Address / PIN Code (English Only)
                  </label>
                  <span className="text-[10px] font-mono text-emerald-800 font-bold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                    English Only
                  </span>
                </div>
                <input
                  type="text"
                  dir="ltr"
                  placeholder="e.g. Near Jama Masjid, Main Road, Bagodar, PIN: 825322"
                  value={customAddress}
                  onChange={(e) => setCustomAddress(e.target.value)}
                  className={`w-full px-3 py-2 bg-white border ${
                    /[\u0600-\u06FF]/.test(customAddress) ? 'border-rose-500 ring-2 ring-rose-200' : 'border-stone-300'
                  } rounded-xl text-stone-900 text-xs font-sans text-left focus:ring-2 focus:ring-emerald-600 focus:outline-hidden`}
                />
                {/[\u0600-\u06FF]/.test(customAddress) && (
                  <p className="text-[11px] text-rose-600 font-semibold mt-1 font-sans">
                    ⚠️ Address must be in English letters only. اردو حروف کی اجازت نہیں ہے۔
                  </p>
                )}
              </div>
            </div>

            {/* Selectable Classes Chips */}
            {!existingMadrasa && (
              <div className="p-4 bg-emerald-50/60 border border-emerald-200 rounded-2xl space-y-2.5">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="block font-bold text-emerald-950 text-xs">
                      شامل کردہ درجات (درجہ منتخب فرمائیں)
                    </label>
                    <span className="text-[11px] text-emerald-800">
                      جن درجات کے لیے ریکارڈ اور شیٹ تیار کرنی ہے ان پر کلک کریں:
                    </span>
                  </div>
                  <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-200 text-emerald-900">
                    {selectedClasses.length} منتخب
                  </span>
                </div>

                <div className="flex flex-wrap gap-2 pt-1">
                  {availableClasses.map((clsName) => {
                    const isSelected = selectedClasses.includes(clsName);
                    return (
                      <button
                        key={clsName}
                        type="button"
                        onClick={() => toggleClassSelection(clsName)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                          isSelected
                            ? 'bg-emerald-800 text-white shadow-xs'
                            : 'bg-white text-stone-700 border border-stone-300 hover:bg-stone-100'
                        }`}
                      >
                        {isSelected && <Check className="w-3.5 h-3.5 text-amber-300" />}
                        <span>{clsName}</span>
                      </button>
                    );
                  })}

                  {/* Custom added classes */}
                  {selectedClasses
                    .filter((c) => !availableClasses.includes(c))
                    .map((customCls) => (
                      <button
                        key={customCls}
                        type="button"
                        onClick={() => toggleClassSelection(customCls)}
                        className="px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-800 text-white shadow-xs flex items-center gap-1.5 cursor-pointer"
                      >
                        <Check className="w-3.5 h-3.5 text-amber-300" />
                        <span>{customCls}</span>
                      </button>
                    ))}

                  {/* Add Class Button / Input */}
                  {showAddClassInput ? (
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        placeholder="درجہ کا نام"
                        value={newCustomClass}
                        onChange={(e) => setNewCustomClass(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddCustomClass();
                          }
                        }}
                        className="px-2.5 py-1 bg-white border border-emerald-400 rounded-xl text-xs text-stone-900 focus:outline-hidden"
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={handleAddCustomClass}
                        className="px-2.5 py-1 bg-emerald-700 text-white rounded-xl text-xs font-bold cursor-pointer"
                      >
                        شامل
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowAddClassInput(true)}
                      className="px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-white border border-dashed border-emerald-400 text-emerald-800 hover:bg-emerald-50 flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                      <span>دیگر درجہ</span>
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Exam Title */}
            <div>
              <label className="block font-semibold text-stone-800 mb-1">
                امتحانی عنوان
              </label>
              <input
                type="text"
                placeholder="مثلاً: نتیجہ سالانہ امتحان 1448ھ / 2026ء"
                value={examTitle}
                onChange={(e) => setExamTitle(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-300 rounded-2xl text-stone-900 focus:bg-white focus:ring-2 focus:ring-emerald-600 focus:outline-hidden"
              />
            </div>

            {/* Principal Profile */}
            <div className="p-4 bg-stone-50 border border-stone-200 rounded-2xl space-y-3">
              <span className="font-semibold text-stone-800 text-xs flex items-center gap-1.5 border-b border-stone-200 pb-2">
                <span className="w-2 h-2 rounded-full bg-emerald-600"></span>
                <span>پرنسپل لاگ ان پروفائل</span>
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-stone-700 mb-1">
                    نام مہتمم / پرنسپل
                  </label>
                  <input
                    type="text"
                    placeholder="مثلاً: مولانا عبد المنان صاحب"
                    value={principalName}
                    onChange={(e) => setPrincipalName(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-stone-300 rounded-xl text-stone-900 text-xs focus:ring-2 focus:ring-emerald-600 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-stone-700 mb-1">
                    رابطہ نمبر ۱: مہتمم / پرنسپل موبائل و واٹس ایپ
                  </label>
                  <input
                    type="tel"
                    dir="ltr"
                    placeholder="+91 98765 43210"
                    value={principalPhone}
                    onChange={(e) => setPrincipalPhone(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-stone-300 rounded-xl text-stone-900 font-mono text-xs text-left focus:ring-2 focus:ring-emerald-600 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-stone-700 mb-1">
                    رابطہ نمبر ۲: متبادل فون / دفتری رابطہ (اختیاری)
                  </label>
                  <input
                    type="tel"
                    dir="ltr"
                    placeholder="+91 98765 43210"
                    value={contactPhone}
                    onChange={(e) => setContactPhone(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-stone-300 rounded-xl text-stone-900 font-mono text-xs text-left focus:ring-2 focus:ring-emerald-600 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-stone-700 mb-1">
                    ای میل آئی ڈی (Email ID)
                  </label>
                  <input
                    type="email"
                    dir="ltr"
                    placeholder="principal@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-stone-300 rounded-xl text-stone-900 font-mono text-xs text-left focus:ring-2 focus:ring-emerald-600 focus:outline-hidden"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-medium text-stone-700">
                    لاگ ان پاسورڈ
                  </label>
                  <button
                    type="button"
                    onClick={() => setPrincipalPassword(`${madrasaCode}@1234`)}
                    className="text-[11px] text-emerald-800 hover:underline cursor-pointer font-bold"
                  >
                    ڈیفالٹ لگائیں ({madrasaCode}@1234)
                  </button>
                </div>
                <input
                  type="text"
                  dir="ltr"
                  placeholder={`خالی چھوڑنے پر ${madrasaCode}@1234 رہے گا`}
                  value={principalPassword}
                  onChange={(e) => setPrincipalPassword(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-stone-300 rounded-xl text-stone-900 font-mono text-xs text-left tracking-wider focus:ring-2 focus:ring-emerald-600 focus:outline-hidden"
                />
              </div>
            </div>

            {/* Theme Color & Logo */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
              <div>
                <label className="block font-medium text-stone-700 text-xs mb-1.5 flex items-center gap-1.5">
                  <Palette className="w-3.5 h-3.5 text-stone-500" />
                  <span>تھیم کا رنگ</span>
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  {PRESET_COLORS.map((c) => (
                    <button
                      key={c.hex}
                      type="button"
                      onClick={() => setThemeColor(c.hex)}
                      className={`w-6 h-6 rounded-full transition-transform cursor-pointer ${
                        themeColor === c.hex ? 'ring-2 ring-offset-2 ring-stone-800 scale-110' : 'opacity-80 hover:opacity-100'
                      }`}
                      style={{ backgroundColor: c.hex }}
                      title={c.name}
                    />
                  ))}
                  <input
                    type="color"
                    value={themeColor}
                    onChange={(e) => setThemeColor(e.target.value)}
                    className="w-6 h-6 rounded-full cursor-pointer border-0 p-0"
                    title="کسٹم رنگ چنیں"
                  />
                </div>
              </div>

              {/* Logo File Upload */}
              <div className="space-y-2">
                <label className="block font-medium text-stone-700 text-xs mb-1 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Upload className="w-3.5 h-3.5 text-emerald-700" />
                    <span>لوگو / مونوگرام</span>
                  </span>
                  <span className="text-[10px] text-stone-400">اختیاری</span>
                </label>

                <div className="flex items-center gap-2">
                  {logo ? (
                    <div className="relative w-10 h-10 rounded-xl border border-stone-300 bg-white p-0.5 shrink-0 flex items-center justify-center">
                      <img src={logo} alt="Logo" className="w-full h-full object-contain rounded-lg" />
                      <button
                        type="button"
                        onClick={() => setLogo('')}
                        className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-rose-600 text-white rounded-full flex items-center justify-center text-[10px] cursor-pointer"
                        title="ہٹائیں"
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <div className="w-10 h-10 rounded-xl border border-dashed border-stone-300 bg-white flex items-center justify-center text-stone-400 shrink-0">
                      <Image className="w-4 h-4" />
                    </div>
                  )}

                  <div className="flex-1">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleLogoFileUpload}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full py-2 px-3 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-300 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Upload className="w-3.5 h-3.5 text-emerald-700" />
                      <span>فائل منتخب کریں</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Action Footer */}
          <div className="p-4 border-t border-stone-200 bg-stone-50/90 flex items-center gap-2.5 shrink-0">
            {existingMadrasa && onDelete && (
              <button
                type="button"
                onClick={() => {
                  onDelete(existingMadrasa.id);
                  onClose();
                }}
                className="py-2.5 px-3.5 rounded-2xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 transition-colors text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
                title="مدرسہ حذف کریں"
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                <span>حذف کریں</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 px-4 rounded-2xl border border-stone-300 text-stone-700 hover:bg-stone-100 transition-colors text-xs font-bold cursor-pointer"
            >
              منسوخ
            </button>
            <button
              type="submit"
              className="flex-1 py-2.5 px-4 rounded-2xl bg-emerald-800 hover:bg-emerald-900 text-white font-bold text-xs shadow-md transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>{existingMadrasa ? 'محفوظ کریں' : 'رجسٹر کریں'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
