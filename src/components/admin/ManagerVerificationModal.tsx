/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Madrasa, MadrasaClass } from '../../types';
import { verifyMadrasaByManager, persistMadrasa, persistClass } from '../../utils/storage';
import { cleanInstitutionName } from '../../utils/transliterate';
import { registerMadrasaWorkflow, DEFAULT_APPS_SCRIPT_URL, getUnifiedAppsScriptCode } from '../../services/appsScriptService';
import { INDIAN_STATES_DISTRICTS } from '../../utils/indiaLocations';
import {
  Building2,
  X,
  CheckCircle2,
  AlertCircle,
  MapPin,
  Phone,
  Mail,
  Globe,
  BookOpen,
  CheckSquare,
  Square,
  ShieldCheck,
  Clock,
  Sparkles,
  Palette,
  Lock,
  Layers,
  FileText,
  User,
  Image as ImageIcon,
  KeyRound,
  Check,
  FileSpreadsheet,
  Award,
  Hash,
  ExternalLink,
  MessageCircle,
} from 'lucide-react';

interface ManagerVerificationModalProps {
  madrasa: Madrasa;
  classes: MadrasaClass[];
  isOpen: boolean;
  onClose: () => void;
  onVerified: (updatedMadrasa: Madrasa) => void;
  managerName?: string;
  managerId?: string;
  isSuperAdmin?: boolean;
}

const PRESET_COLORS = [
  { name: 'زمردی سبز (Emerald Green)', hex: '#065f46' },
  { name: 'نیوی بلیو (Navy Blue)', hex: '#1e3a8a' },
  { name: 'یاقوتی لال (Maroon Ruby)', hex: '#831843' },
  { name: 'عنبری گولڈ (Amber Gold)', hex: '#78350f' },
  { name: 'شاہی جامنی (Royal Purple)', hex: '#581c87' },
];

const VERIFICATION_WHATSAPP_MESSAGE = `السلام علیکم ورحمۃ اللَّهُ و برکاتہ !


🎉 Your Madrasa Registration Has Been Successfully Verified!

الحمدللہ! آپ کے مدرسے کی رجسٹریشن کامیابی کے ساتھ تصدیق ہو چکی ہے۔

معیارِ مدارس سے منسلک ہونے پر آپ کا شکریہ!

معیارِ مدارس — شفاف نتائج، محفوظ ریکارڈ`;

function buildPrincipalWhatsAppUrl(rawPhone?: string): { url: string; displayPhone: string } {
  const western = String(rawPhone || '')
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
  const digits = western.replace(/\D/g, '');
  let waNumber = '';
  if (digits.length === 10) {
    waNumber = `91${digits}`;
  } else if (digits.length === 11 && digits.startsWith('0')) {
    waNumber = `91${digits.slice(1)}`;
  } else if (digits.length >= 11) {
    waNumber = digits;
  }
  const encodedMsg = encodeURIComponent(VERIFICATION_WHATSAPP_MESSAGE);
  const url = waNumber
    ? `https://wa.me/${waNumber}?text=${encodedMsg}`
    : `https://wa.me/?text=${encodedMsg}`;
  const displayPhone = waNumber
    ? waNumber.startsWith('91') && waNumber.length === 12
      ? `+91 ${waNumber.slice(2)}`
      : `+${waNumber}`
    : '';
  return { url, displayPhone };
}

export const ManagerVerificationModal: React.FC<ManagerVerificationModalProps> = ({
  madrasa,
  classes,
  isOpen,
  onClose,
  onVerified,
  managerName = 'اسٹیٹ مینیجر',
  managerId,
  isSuperAdmin = false,
}) => {
  // Editable Madrasa Form Fields
  const [urduName, setUrduName] = useState(madrasa.urduName || '');
  const [englishName, setEnglishName] = useState(madrasa.englishName || '');
  const [selectedState, setSelectedState] = useState(madrasa.state || 'Jharkhand');
  const [selectedDistrict, setSelectedDistrict] = useState(madrasa.district || '');
  const [address, setAddress] = useState(madrasa.address || '');
  const [principalName, setPrincipalName] = useState(madrasa.principalName || '');
  const [contactPhone, setContactPhone] = useState(madrasa.contactPhone || madrasa.principalPhone || '');
  const [principalPhone, setPrincipalPhone] = useState(madrasa.principalPhone || madrasa.contactPhone || '');
  const [email, setEmail] = useState(madrasa.email || '');
  const [website, setWebsite] = useState(madrasa.website || '');
  const [examTitle, setExamTitle] = useState(madrasa.examTitle || 'نتیجہ سالانہ امتحان 1448ھ / 2026ء');
  const [themeColor, setThemeColor] = useState(madrasa.themeColor || '#065f46');
  const [logo, setLogo] = useState(
    (madrasa.logo && madrasa.logo.trim()) ||
    ((madrasa as any)?.logoUrl && (madrasa as any).logoUrl.trim()) ||
    ''
  );

  // Mandatory Verification Tick Checkbox ("ٹک لگا کر کے اب ویریفائی کر دے گا")
  const [isConfirmedByManager, setIsConfirmedByManager] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatusText, setSubmitStatusText] = useState('');
  const [verificationDone, setVerificationDone] = useState(false);
  const [verificationMadrasa, setVerificationMadrasa] = useState<Madrasa | null>(null);
  const [sheetCreationSuccess, setSheetCreationSuccess] = useState<boolean | null>(null);
  const [createdSheetUrl, setCreatedSheetUrl] = useState('');
  const [showScriptModal, setShowScriptModal] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  React.useEffect(() => {
    if (!isOpen || !madrasa) return;
    setUrduName(madrasa.urduName || '');
    setEnglishName(madrasa.englishName || '');
    setSelectedState(madrasa.state || 'Jharkhand');
    setSelectedDistrict(madrasa.district || '');
    setAddress(madrasa.address || '');
    setPrincipalName(madrasa.principalName || '');
    setContactPhone(madrasa.contactPhone || madrasa.principalPhone || '');
    setPrincipalPhone(madrasa.principalPhone || madrasa.contactPhone || '');
    setEmail(madrasa.email || '');
    setWebsite(madrasa.website || '');
    setExamTitle(madrasa.examTitle || 'نتیجہ سالانہ امتحان 1448ھ / 2026ء');
    setThemeColor((madrasa.themeColor && madrasa.themeColor.trim()) || '#065f46');
    setLogo(
      (madrasa.logo && madrasa.logo.trim()) ||
      ((madrasa as any)?.logoUrl && (madrasa as any).logoUrl.trim()) ||
      ''
    );
  }, [isOpen, madrasa?.id, madrasa?.themeColor, madrasa?.email]);

  if (!isOpen) return null;

  const madrasaClasses = classes.filter((c) => c.madrasaId === madrasa.id || c.madrasaId === madrasa.code);
  const availableDistricts = INDIAN_STATES_DISTRICTS[selectedState] || [];

  const handleApproveOrVerify = async () => {
    if (!isConfirmedByManager) {
      setErrorMsg('برائے مہربانی نیچے دیے گئے لازمی تصدیقی چیک باکس پر نشان (ٹک) لگائیں۔');
      return;
    }

    if (address.trim() && /[\u0600-\u06FF]/.test(address)) {
      setErrorMsg('براہ کرم ڈاک پتہ صرف انگریزی (English) میں درج فرمائیں، اردو حروف کی اجازت نہیں ہے۔');
      return;
    }

    setIsSubmitting(true);
    setSubmitStatusText('گوگل ڈرائیو فولڈر (معیارِ مدارس) میں امتحانی شیٹ تیار کی جا رہی ہے...');
    setErrorMsg('');

    const finalUrdu = cleanInstitutionName((urduName || madrasa.urduName || 'مدرسہ').trim());
    const finalEnglish = cleanInstitutionName((englishName || madrasa.englishName || madrasa.urduName || '').trim());
    const finalAddress = (address || madrasa.address || '').trim();
    const finalPhone = (contactPhone || madrasa.contactPhone || madrasa.principalPhone || '').trim();
    const finalPrincipalPhone = (principalPhone || contactPhone || madrasa.principalPhone || '').trim();
    const finalPrincipalName = (principalName || madrasa.principalName || '').trim();
    const finalEmail = (email || madrasa.email || '').trim();
    const finalWebsite = (website || madrasa.website || '').trim();
    const finalExamTitle = (examTitle || madrasa.examTitle || 'نتیجہ سالانہ امتحان 1448ھ / 2026ء').trim();

    let targetSheetUrl = madrasa.googleSheetUrl || '';
    let targetSpreadsheetId = madrasa.spreadsheetId || '';
    let sheetSuccess = false;

    // 1. If madrasa already has a real Google Sheet, preserve it
    if (targetSheetUrl && targetSheetUrl.includes('/spreadsheets/d/')) {
      sheetSuccess = true;
      if (!targetSpreadsheetId) {
        const m = targetSheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
        if (m) targetSpreadsheetId = m[1];
      }
    } else {
      // 2. Request Google Apps Script to create dedicated Google Sheet in "معیار مدارس" folder
      try {
        const classNames = madrasaClasses.map((c) => c.name);
        const gasResult = await registerMadrasaWorkflow({
          code: madrasa.code,
          name: finalUrdu,
          classes: classNames.length > 0 ? classNames : ['حفظ', 'سال اول', 'سال دوم'],
          madrasaId: madrasa.id,
        });

        if (gasResult && gasResult.success && (gasResult.sheetUrl || gasResult.spreadsheetId)) {
          const sId = gasResult.spreadsheetId || '';
          const sUrl = gasResult.sheetUrl || (sId ? `https://docs.google.com/spreadsheets/d/${sId}/edit` : '');
          if (sUrl.includes('/spreadsheets/d/')) {
            targetSheetUrl = sUrl;
            targetSpreadsheetId = sId;
            sheetSuccess = true;
          }
        }
      } catch (e: any) {
        console.warn('Manager verification sheet creation call notice:', e?.message);
      }
    }

    setSheetCreationSuccess(sheetSuccess);
    if (targetSheetUrl && targetSheetUrl.includes('/spreadsheets/d/')) {
      setCreatedSheetUrl(targetSheetUrl);
    }

    // 3. Prepare fully verified & approved madrasa object
    const approvedMadrasa: Madrasa = {
      ...madrasa,
      urduName: finalUrdu,
      englishName: finalEnglish,
      state: selectedState,
      district: selectedDistrict,
      address: finalAddress,
      contactPhone: finalPhone,
      principalPhone: finalPrincipalPhone,
      principalName: finalPrincipalName,
      email: finalEmail,
      website: finalWebsite,
      examTitle: finalExamTitle,
      themeColor: themeColor,
      logo: logo,
      registrationStatus: isSuperAdmin ? 'approved' : (madrasa.registrationStatus || 'pending'),
      isVerified: true,
      managerVerified: true,
      managerVerifiedBy: isSuperAdmin ? (madrasa.managerVerifiedBy || 'مرکزی ایڈمنسٹریٹر (سپر ایڈمن)') : managerName,
      managerVerifiedAt: madrasa.managerVerifiedAt || new Date().toISOString(),
      approvedAt: isSuperAdmin ? new Date().toISOString() : madrasa.approvedAt,
      updatedAt: new Date().toISOString(),
      showPublicResults: isSuperAdmin ? true : (madrasa.showPublicResults ?? false),
      googleSheetUrl: targetSheetUrl,
      spreadsheetId: targetSpreadsheetId,
    };

    setSubmitStatusText('مدرسہ اور درجات کو مرکزی سرور اور ڈیش بورڈ سے منسلک کیا جا رہا ہے...');

    try {
      await persistMadrasa(approvedMadrasa);
    } catch (pErr) {
      console.warn('Persist approved madrasa error:', pErr);
    }

    // 4. Ensure madrasa classes exist & link with sheet
    let classesToLink = [...madrasaClasses];
    if (classesToLink.length === 0) {
      const defaultNames = ['حفظ', 'سال اول', 'سال دوم'];
      for (let i = 0; i < defaultNames.length; i++) {
        const cn = defaultNames[i];
        const autoClass: MadrasaClass = {
          id: `class-${madrasa.code}-${i + 1}-${Date.now()}`,
          madrasaId: madrasa.id,
          name: cn,
          academicYear: '1447-1448ھ / 2025-2026ء',
          status: 'published',
          resultSourceType: targetSheetUrl.includes('/spreadsheets/d/') ? 'google_sheet' : 'direct',
          googleSheetUrl: targetSheetUrl,
          sheetTabName: cn,
          subjectsConfig: [
            { id: 'sub-1', name: 'دینیات', maxMarks: 100, passingMarks: 33 },
            { id: 'sub-2', name: 'اردو', maxMarks: 50, passingMarks: 17 },
            { id: 'sub-3', name: 'عربی / فارسی', maxMarks: 100, passingMarks: 33 },
          ],
          students: [],
          rawSourceData: '',
          lastTestedAt: new Date().toISOString(),
          testStatus: {
            success: true,
            message: targetSheetUrl.includes('/spreadsheets/d/') ? 'گوگل شیٹ مربوط ہے' : 'کلاس تیار ہے',
            studentCount: 0,
            subjectCount: 3,
            subjects: [],
            missingFields: [],
          },
          updatedAt: new Date().toISOString(),
        };
        classesToLink.push(autoClass);
      }
    }

    // Propagate linked sheet to each class
    for (const cls of classesToLink) {
      await persistClass({
        ...cls,
        googleSheetUrl: targetSheetUrl,
        sheetTabName: cls.name,
        resultSourceType: targetSheetUrl.includes('/spreadsheets/d/') ? 'google_sheet' : cls.resultSourceType,
        updatedAt: new Date().toISOString(),
      });
    }

    try {
      await verifyMadrasaByManager(madrasa.id, {
        code: madrasa.code,
        urduName: finalUrdu,
        englishName: finalEnglish,
        address: finalAddress,
        contactPhone: finalPhone,
        state: selectedState,
        district: selectedDistrict,
        themeColor: themeColor,
        logo: logo,
        managerName: isSuperAdmin ? 'مرکزی ایڈمنسٹریٹر' : managerName,
        managerId: isSuperAdmin ? 'super-admin' : managerId,
        sheetUrl: targetSheetUrl,
        madrasa: approvedMadrasa,
      });
    } catch (vErr) {
      console.warn('verifyMadrasaByManager notice:', vErr);
    }

    // 5. Notify parent component with fully updated madrasa
    onVerified(approvedMadrasa);
    setVerificationMadrasa(approvedMadrasa);
    setIsSubmitting(false);
    setVerificationDone(true);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto font-urdu">
      <div
        className="bg-white rounded-3xl max-w-3xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-stone-200 overflow-hidden animate-fade-in my-auto text-right"
        dir="rtl"
      >
        {/* ------------------------------------------------------------- */}
        {/* 1. Header Banner */}
        {/* ------------------------------------------------------------- */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-emerald-950 via-emerald-900 to-teal-950 text-white shrink-0 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-12 h-12 rounded-2xl bg-amber-400 text-emerald-950 flex items-center justify-center font-bold shrink-0 shadow-md">
                <ShieldCheck className="w-7 h-7 text-emerald-950" />
              </div>
              <div className="space-y-1 min-w-0">
                <h2 className="text-base sm:text-xl font-bold text-amber-300 leading-tight font-aslam truncate">
                  مدرسہ رجسٹریشن فارم — کوائف، جائزہ و تصدیق
                </h2>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-mono text-xs px-2.5 py-0.5 rounded-lg bg-amber-400 text-emerald-950 font-extrabold shrink-0 shadow-2xs">
                    کوڈ: {madrasa.code}
                  </span>
                  {madrasa.serialNumber && (
                    <span className="text-[11px] font-mono bg-emerald-800/90 text-emerald-100 border border-emerald-600 px-2 py-0.5 rounded-md font-bold shrink-0">
                      شمار: #{madrasa.serialNumber}
                    </span>
                  )}
                  {madrasa.state && (
                    <span className="text-[11px] bg-emerald-800/90 text-emerald-100 border border-emerald-600 px-2 py-0.5 rounded-md font-bold shrink-0">
                      {madrasa.state} {madrasa.district ? `· ${madrasa.district}` : ''}
                    </span>
                  )}
                  <span className="text-[11px] bg-amber-400/20 text-amber-300 border border-amber-400/40 px-2 py-0.5 rounded-md font-bold shrink-0 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    <span>زیرِ جائزہ مینیجر</span>
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setShowScriptModal(true)}
                className="px-3 py-1.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-emerald-950 font-bold text-xs flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
                title="گوگل اسکرپٹ کوڈ دیکھیں"
              >
                <KeyRound className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">گوگل اسکرپٹ کوڈ</span>
              </button>

              <button
                type="button"
                onClick={onClose}
                className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-all cursor-pointer shrink-0"
                title="بند کریں"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        {/* ------------------------------------------------------------- */}
        {/* 2. Scrollable Body: Full Madrasa Registration Form Review or Completion */}
        {/* ------------------------------------------------------------- */}
        {verificationDone ? (
          <div className="p-6 sm:p-8 space-y-6 text-center animate-fade-in font-urdu overflow-y-auto">
            <div className="w-20 h-20 mx-auto rounded-3xl bg-emerald-100 text-emerald-700 flex items-center justify-center shadow-inner">
              <CheckCircle2 className="w-12 h-12 stroke-[2.5]" />
            </div>

            <div className="space-y-2">
              <h3 className="text-xl sm:text-2xl font-bold text-emerald-950 font-aslam">
                {isSuperAdmin
                  ? '✓ مبارک ہو! مدرسہ کی منظوری و الحاق مکمل ہو گیا'
                  : '✓ مبارک ہو! مدرسہ کی مینیجر تصدیق و شیٹ الحاق مکمل ہو گیا'}
              </h3>
              <p className="text-xs sm:text-sm text-stone-600 max-w-lg mx-auto">
                {isSuperAdmin
                  ? <>ادارہ <strong className="text-emerald-900 font-bold">{urduName}</strong> (کوڈ: {madrasa.code}) باضابطہ منظور شدہ ہو چکا ہے اور اس کے نتائج پبلک سرچ کے لیے فعال ہیں۔</>
                  : <>ادارہ <strong className="text-emerald-900 font-bold">{urduName}</strong> (کوڈ: {madrasa.code}) کی صوبائی مینیجر تصدیق مکمل ہو گئی ہے۔ مرکزی ایڈمن کی حتمی منظوری کے بعد رزلٹ پبلک سرچ میں ظاہر ہوگا۔</>}
              </p>
            </div>

            {/* Google Drive Sheet Status */}
            <div
              className={`p-4 rounded-2xl border text-right space-y-3 ${
                sheetCreationSuccess && createdSheetUrl
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                  : 'bg-amber-50 border-amber-300 text-amber-950'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs sm:text-sm flex items-center gap-2">
                  <FileSpreadsheet className="w-5 h-5 text-emerald-700 shrink-0" />
                  <span>گوگل ڈرائیو امتحانی شیٹ (Google Drive Sheet):</span>
                </span>
                <span
                  className={`text-[11px] font-bold px-2 py-0.5 rounded-md ${
                    sheetCreationSuccess && createdSheetUrl
                      ? 'bg-emerald-200 text-emerald-900'
                      : 'bg-amber-200 text-amber-900'
                  }`}
                >
                  {sheetCreationSuccess && createdSheetUrl ? '✓ منسلک و فعال' : '⚠️ اسکرپٹ کوڈ اپڈیٹ مطلوب'}
                </span>
              </div>

              {sheetCreationSuccess && createdSheetUrl ? (
                <div className="space-y-3 pt-1">
                  <p className="text-xs leading-relaxed text-emerald-900">
                    اس مدرسے کی امتحانی شیٹ مع تمام درجات کے الگ الگ ٹیبز گوگل ڈرائیو کے فولڈر{' '}
                    <strong className="font-bold text-emerald-950">"معیار مدارس"</strong> میں کامیابی سے تیار ہو چکی ہے اور پورٹل سے لنک ہو چکی ہے۔
                  </p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <a
                      href={createdSheetUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold transition-all shadow-xs cursor-pointer"
                    >
                      <ExternalLink className="w-4 h-4" />
                      <span>گوگل شیٹ کھولیں (Open Google Sheet)</span>
                    </a>
                  </div>
                </div>
              ) : (
                <div className="space-y-2.5 pt-1 text-xs text-amber-900">
                  <p className="leading-relaxed">
                    مدرسہ تصدیق ہو گیا! تاہم گوگل ڈرائیو (معیار مدارس فولڈر) میں خودکار شیٹ تیار کرنے کے لیے Google Apps Script میں نیا کوڈ تعینات کرنا ضروری ہے۔
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowScriptModal(true)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-700 hover:bg-amber-800 text-white text-xs font-bold transition-all shadow-xs cursor-pointer"
                  >
                    <KeyRound className="w-4 h-4" />
                    <span>گوگل اسکرپٹ کوڈ دیکھیں اور کاپی کریں (Copy Script Code)</span>
                  </button>
                </div>
              )}
            </div>

            {/* 1-Click WhatsApp Notification to Principal */}
            {(() => {
              const targetPhone =
                verificationMadrasa?.principalPhone ||
                principalPhone ||
                verificationMadrasa?.contactPhone ||
                contactPhone ||
                madrasa.principalPhone ||
                madrasa.contactPhone ||
                '';
              const { url: waUrl, displayPhone } = buildPrincipalWhatsAppUrl(targetPhone);
              return (
                <div className="p-4 rounded-2xl border border-green-300 bg-green-50/80 text-right space-y-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="font-bold text-xs sm:text-sm text-green-950 flex items-center gap-2">
                      <MessageCircle className="w-5 h-5 text-green-600 shrink-0" />
                      <span>پرنسپل کو تصدیقی واٹس ایپ میسج بھیجیں</span>
                    </span>
                    {displayPhone && (
                      <span
                        dir="ltr"
                        className="font-mono text-[11px] font-bold px-2.5 py-0.5 rounded-md bg-white border border-green-200 text-green-900"
                      >
                        {displayPhone}
                      </span>
                    )}
                  </div>

                  <p className="text-[11px] sm:text-xs text-green-900/90 leading-relaxed whitespace-pre-line bg-white/80 border border-green-200/80 rounded-xl p-3">
                    {VERIFICATION_WHATSAPP_MESSAGE}
                  </p>

                  <a
                    href={waUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full py-3 px-5 rounded-xl bg-green-600 hover:bg-green-700 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer"
                  >
                    <MessageCircle className="w-4 h-4 shrink-0" />
                    <span>
                      {displayPhone
                        ? `واٹس ایپ میسج بھیجیں (${displayPhone})`
                        : 'واٹس ایپ میسج بھیجیں'}
                    </span>
                  </a>
                </div>
              );
            })()}

            <div className="pt-2">
              <button
                type="button"
                onClick={onClose}
                className="w-full sm:w-auto px-8 py-3 rounded-2xl bg-emerald-800 hover:bg-emerald-900 text-white font-bold text-xs sm:text-sm shadow-md transition-all cursor-pointer"
              >
                مکمل ہو گیا — بند کریں (Close)
              </button>
            </div>
          </div>
        ) : isSubmitting ? (
          <div className="p-12 space-y-5 text-center font-urdu my-auto">
            <div className="w-16 h-16 mx-auto rounded-3xl bg-emerald-50 border border-emerald-200 flex items-center justify-center">
              <div className="w-8 h-8 border-4 border-emerald-700 border-t-transparent rounded-full animate-spin" />
            </div>
            <div className="space-y-2">
              <h3 className="text-base sm:text-lg font-bold text-emerald-950 font-aslam">
                براہ کرم انتظار فرمائیں...
              </h3>
              <p className="text-xs sm:text-sm text-stone-600 font-bold max-w-md mx-auto leading-relaxed">
                {submitStatusText || 'گوگل ڈرائیو فولڈر (معیارِ مدارس) میں امتحانی شیٹ تیار کی جا رہی ہے...'}
              </p>
            </div>
          </div>
        ) : (
          <div className="p-4 sm:p-6 overflow-y-auto space-y-4 text-stone-800 text-xs sm:text-sm">
            {/* Top Instruction Banner */}
            <div className="p-3.5 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-300 rounded-2xl flex items-start gap-3 text-amber-950 text-xs shadow-2xs">
              <Clock className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <span className="font-bold text-amber-900 block text-xs sm:text-sm">
                  صوبائی مینیجر رہنمائی:
                </span>
                <p className="leading-relaxed text-amber-900/90">
                  مدرسہ رجسٹریشن فارم کے تمام کوائف (نام، پتہ، مہتمم صاحب کی تفصیلات، درجات اور تھیم) کا غور سے جائزہ لیں۔
                  تصدیق ہوتے ہی گوگل ڈرائیو کے فولڈر <strong className="font-bold">"معیار مدارس"</strong> میں اس مدرسے کی شیٹ خودکار بن کر منسلک ہو جائے گی۔
                </p>
              </div>
            </div>

          {/* SECTION 1: ادارہ و مدرسہ کے بنیادی کوائف */}
          <div className="p-4 rounded-2xl bg-stone-50 border border-stone-200/90 space-y-3">
            <div className="flex items-center justify-between border-b border-stone-200 pb-2">
              <span className="font-bold text-xs sm:text-sm text-stone-700 uppercase flex items-center gap-2">
                <Building2 className="w-4 h-4 text-emerald-700" />
                <span>۱۔ ادارہ و مدرسہ کے بنیادی کوائف (Basic Madrasa Details)</span>
              </span>
              <span className="font-mono text-xs px-2.5 py-0.5 rounded-lg bg-emerald-100 text-emerald-950 border border-emerald-300 font-bold">
                {madrasa.code}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-stone-700 mb-1">
                  مدرسہ کا باضابطہ نام (اردو میں) *
                </label>
                <input
                  type="text"
                  value={urduName}
                  onChange={(e) => setUrduName(e.target.value)}
                  placeholder="مثلاً: دارالعلوم فیضان مدینہ"
                  className="w-full px-3 py-2 bg-white border border-stone-300 rounded-xl text-stone-900 font-bold font-aslam text-base focus:ring-2 focus:ring-emerald-600 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-stone-700 mb-1">
                  مدرسہ کا نام (انگریزی میں - برائے آن لائن رزلٹ کارڈ) *
                </label>
                <input
                  type="text"
                  dir="ltr"
                  value={englishName}
                  onChange={(e) => setEnglishName(e.target.value)}
                  placeholder="e.g. Darul Uloom Faizan-e-Madina"
                  className="w-full px-3 py-2 bg-white border border-stone-300 rounded-xl text-stone-900 font-sans text-xs focus:ring-2 focus:ring-emerald-600 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-stone-700 mb-1">
                  ریاست / صوبہ (State) *
                </label>
                <select
                  value={selectedState}
                  onChange={(e) => {
                    setSelectedState(e.target.value);
                    const dists = INDIAN_STATES_DISTRICTS[e.target.value] || [];
                    setSelectedDistrict(dists[0] || '');
                  }}
                  className="w-full px-3 py-2 bg-white border border-stone-300 rounded-xl text-stone-900 text-xs focus:ring-2 focus:ring-emerald-600 focus:outline-hidden"
                >
                  {Object.keys(INDIAN_STATES_DISTRICTS).map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-stone-700 mb-1">
                  ضلع (District) *
                </label>
                <select
                  value={selectedDistrict}
                  onChange={(e) => setSelectedDistrict(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-stone-300 rounded-xl text-stone-900 text-xs focus:ring-2 focus:ring-emerald-600 focus:outline-hidden"
                >
                  {availableDistricts.length > 0 ? (
                    availableDistricts.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))
                  ) : (
                    <option value={selectedDistrict || ''}>{selectedDistrict || 'ضلع منتخب کریں'}</option>
                  )}
                </select>
              </div>

              <div className="sm:col-span-2">
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-[11px] font-bold text-stone-700">
                    مکمل ڈاک پتہ مع پن کوڈ (صرف انگریزی میں - English Only) *
                  </label>
                  <span className="text-[10px] font-mono text-emerald-800 font-bold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                    English Only
                  </span>
                </div>
                <input
                  type="text"
                  dir="ltr"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="e.g. Near Jama Masjid, Main Road, Bagodar, PIN: 825322"
                  className={`w-full px-3 py-2 bg-white border ${
                    /[\u0600-\u06FF]/.test(address) ? 'border-rose-500 ring-2 ring-rose-200' : 'border-stone-300'
                  } rounded-xl text-stone-900 text-xs font-sans text-left focus:ring-2 focus:ring-emerald-600 focus:outline-hidden`}
                />
                {/[\u0600-\u06FF]/.test(address) && (
                  <p className="text-[11px] text-rose-600 font-semibold mt-1">
                    ⚠️ پتہ صرف انگریزی حروف میں درج فرمائیں۔ (Address must be in English only)
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* SECTION 2: مہتمم / ناظم و رابطہ تفصیلات */}
          <div className="p-4 rounded-2xl bg-stone-50 border border-stone-200/90 space-y-3">
            <span className="font-bold text-xs sm:text-sm text-stone-700 uppercase flex items-center gap-2 border-b border-stone-200 pb-2">
              <User className="w-4 h-4 text-emerald-700" />
              <span>۲۔ مہتمم / ناظم و رابطہ تفصیلات (Authority & Contact Info)</span>
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-stone-700 mb-1">
                  مہتمم / ناظم صاحب کا نام *
                </label>
                <input
                  type="text"
                  value={principalName}
                  onChange={(e) => setPrincipalName(e.target.value)}
                  placeholder="مولانا مفتی صاحب"
                  className="w-full px-3 py-2 bg-white border border-stone-300 rounded-xl text-stone-900 text-xs focus:ring-2 focus:ring-emerald-600 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-stone-700 mb-1">
                  رابطہ نمبر ۱: مہتمم / پرنسپل موبائل و واٹس ایپ نمبر *
                </label>
                <input
                  type="tel"
                  dir="ltr"
                  value={principalPhone}
                  onChange={(e) => setPrincipalPhone(e.target.value)}
                  placeholder="9876543210"
                  className="w-full px-3 py-2 bg-white border border-stone-300 rounded-xl text-stone-900 font-mono text-xs focus:ring-2 focus:ring-emerald-600 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-stone-700 mb-1">
                  رابطہ نمبر ۲: متبادل فون / دفتری رابطہ نمبر (اختیاری)
                </label>
                <input
                  type="tel"
                  dir="ltr"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  placeholder="9876543210"
                  className="w-full px-3 py-2 bg-white border border-stone-300 rounded-xl text-stone-900 font-mono text-xs focus:ring-2 focus:ring-emerald-600 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-stone-700 mb-1">
                  دفتری ای میل ایڈریس (اختیاری)
                </label>
                <input
                  type="text"
                  dir="ltr"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="info@madrasa.org"
                  className="w-full px-3 py-2 bg-white border border-stone-300 rounded-xl text-stone-900 text-xs focus:ring-2 focus:ring-emerald-600 focus:outline-hidden"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-[11px] font-bold text-stone-700 mb-1">
                  ویب سائٹ یا آن لائن لنک (اختیاری)
                </label>
                <input
                  type="text"
                  dir="ltr"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  placeholder="https://..."
                  className="w-full px-3 py-2 bg-white border border-stone-300 rounded-xl text-stone-900 text-xs font-mono focus:ring-2 focus:ring-emerald-600 focus:outline-hidden"
                />
              </div>
            </div>
          </div>

          {/* SECTION 3: تعلیمی و امتحانی سیٹ اپ */}
          <div className="p-4 rounded-2xl bg-stone-50 border border-stone-200/90 space-y-3.5">
            <span className="font-bold text-xs sm:text-sm text-stone-700 uppercase flex items-center gap-2 border-b border-stone-200 pb-2">
              <BookOpen className="w-4 h-4 text-emerald-700" />
              <span>۳۔ تعلیمی و امتحانی سیٹ اپ (Academic & Examination Setup)</span>
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-stone-700 mb-1">
                  سالانہ امتحانی عنوان (Annual Exam Title) *
                </label>
                <input
                  type="text"
                  value={examTitle}
                  onChange={(e) => setExamTitle(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-stone-300 rounded-xl text-stone-900 font-bold text-xs focus:ring-2 focus:ring-emerald-600 focus:outline-hidden"
                />
              </div>

              {/* Theme Color Picker */}
              <div>
                <label className="block text-[11px] font-bold text-stone-700 mb-1">
                  مارک شیٹ کا منتخب کردہ تھیم کلر:
                </label>
                <div className="flex items-center gap-2 flex-wrap pt-0.5">
                  {PRESET_COLORS.map((col) => {
                    const isSelected = themeColor.toLowerCase() === col.hex.toLowerCase();
                    return (
                      <button
                        type="button"
                        key={col.hex}
                        onClick={() => setThemeColor(col.hex)}
                        className={`w-7 h-7 rounded-xl border-2 transition-all cursor-pointer flex items-center justify-center shadow-2xs ${
                          isSelected ? 'border-amber-400 scale-110 ring-2 ring-emerald-500/50' : 'border-white hover:scale-105'
                        }`}
                        style={{ backgroundColor: col.hex }}
                        title={col.name}
                      >
                        {isSelected && <Check className="w-4 h-4 text-white drop-shadow-sm" />}
                      </button>
                    );
                  })}
                  <input
                    type="color"
                    value={themeColor || '#065f46'}
                    onChange={(e) => setThemeColor(e.target.value)}
                    className="w-7 h-7 rounded-lg cursor-pointer border border-stone-300 p-0 bg-white"
                    title="کسٹم رنگ"
                  />
                  <span className="font-mono text-xs font-bold text-stone-700 bg-white border border-stone-200 px-2 py-1 rounded-lg">
                    {themeColor}
                  </span>
                </div>
              </div>
            </div>

            {/* Logo Status & Preview */}
            <div className="p-3 bg-white rounded-xl border border-stone-200 flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold text-stone-700">
                  ادارہ کا مونوگرام / لوگو:
                </span>
                {logo ? (
                  <div className="flex items-center gap-2">
                    <div className="w-10 h-10 rounded-xl border border-stone-300 bg-white p-0.5 overflow-hidden shadow-2xs">
                      <img src={logo} alt="مدرسہ لوگو" className="w-full h-full object-contain" />
                    </div>
                    <span className="text-xs text-emerald-800 font-bold bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">
                      لوگو موجود ہے
                    </span>
                  </div>
                ) : (
                  <span className="text-xs text-stone-500 bg-stone-100 border border-stone-200 px-2.5 py-1 rounded-md">
                    کوئی لوگو اپلوڈ نہیں کیا گیا (رزلٹ کارڈ پر نام خودکار درمیان میں رہے گا)
                  </span>
                )}
              </div>
            </div>

            {/* Enrolled Classes List */}
            <div className="space-y-1.5 pt-1">
              <span className="block text-[11px] font-bold text-stone-700">
                درخواست میں شامل کردہ فعال درجات ({madrasaClasses.length}):
              </span>
              <div className="flex flex-wrap items-center gap-2">
                {madrasaClasses.length === 0 ? (
                  <span className="text-xs text-stone-500 bg-stone-100 px-3 py-1.5 rounded-xl border border-stone-200">
                    کوئی کلاس رجسٹر نہیں کی گئی
                  </span>
                ) : (
                  madrasaClasses.map((cls, cIdx) => (
                    <span
                      key={`cls-chip-${cls.id || cIdx}`}
                      className="px-3 py-1.5 bg-white border border-emerald-300 text-emerald-950 rounded-xl text-xs font-bold shadow-2xs flex items-center gap-1.5"
                    >
                      <Layers className="w-3.5 h-3.5 text-emerald-700" />
                      <span>{cls.name}</span>
                      {cls.subjectsConfig && cls.subjectsConfig.length > 0 && (
                        <span className="text-[10px] text-stone-500 font-normal">
                          ({cls.subjectsConfig.length} مضامین)
                        </span>
                      )}
                    </span>
                  ))
                )}
              </div>
            </div>

            {/* Google Sheet Status in Academic Section */}
            <div className="p-3 bg-white rounded-xl border border-stone-200 flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-emerald-700" />
                <span className="text-xs font-bold text-stone-700">
                  گوگل شیٹ (معیارِ مدارس فولڈر):
                </span>
                {madrasa.googleSheetUrl ? (
                  <span className="text-xs text-emerald-800 font-bold bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">
                    شیٹ تیار و منسلک ہے
                  </span>
                ) : (
                  <span className="text-xs text-amber-800 font-bold bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md">
                    تصدیق پر خودکار بنے گی
                  </span>
                )}
              </div>
              {madrasa.googleSheetUrl && (
                <a
                  href={madrasa.googleSheetUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-bold flex items-center gap-1 transition-all shadow-xs"
                >
                  <ExternalLink className="w-3 h-3" />
                  <span>شیٹ دیکھیں</span>
                </a>
              )}
            </div>
          </div>

          {/* SECTION 4: پرنسپل لاگ ان کریڈینشلز */}
          <div className="p-4 rounded-2xl bg-emerald-50/70 border border-emerald-200 space-y-2">
            <span className="font-bold text-xs sm:text-sm text-emerald-950 uppercase flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-emerald-800" />
              <span>۴۔ پرنسپل لاگ ان کریڈینشلز (Principal Portal Access)</span>
            </span>
            <div className="grid grid-cols-2 gap-3 text-center pt-1">
              <div className="p-3 bg-white rounded-xl border border-emerald-200 shadow-2xs">
                <span className="text-[10px] text-stone-400 block uppercase font-bold">یوزر آئی ڈی / کوڈ</span>
                <span className="font-mono text-sm sm:text-base font-extrabold text-stone-900">{madrasa.code}</span>
              </div>
              <div className="p-3 bg-white rounded-xl border border-emerald-200 shadow-2xs">
                <span className="text-[10px] text-stone-400 block uppercase font-bold">ابتدائی پاسورڈ</span>
                <span className="font-mono text-sm sm:text-base font-extrabold text-emerald-800">
                  {madrasa.principalPassword || `${madrasa.code}@1234`}
                </span>
              </div>
            </div>
          </div>

          {/* ------------------------------------------------------------- */}
          {/* SECTION 5: VERIFICATION TICK CHECKBOX: "اس کے بعد وہ ٹک لگا کر کے اب ویریفائی کر دے گا" */}
          {/* ------------------------------------------------------------- */}
          <div className="p-4 sm:p-5 bg-gradient-to-r from-amber-500/10 via-amber-50 to-orange-50 border-2 border-amber-400 rounded-3xl space-y-3 shadow-xs">
            <div className="flex items-center gap-2 text-amber-950 font-bold text-sm sm:text-base">
              <ShieldCheck className="w-5 h-5 text-amber-700 shrink-0" />
              <span>لازمی توثیقی اقرار نامہ (تصدیق کے لیے نیچے ٹک لگائیں)</span>
            </div>

            <label
              onClick={() => setIsConfirmedByManager(!isConfirmedByManager)}
              className={`flex items-start gap-3 p-3.5 sm:p-4 rounded-2xl border-2 transition-all cursor-pointer select-none ${
                isConfirmedByManager
                  ? 'bg-white border-emerald-600 ring-2 ring-emerald-500/30 shadow-xs'
                  : 'bg-white/90 border-amber-300 hover:border-amber-500'
              }`}
            >
              <div className="shrink-0 mt-0.5">
                {isConfirmedByManager ? (
                  <div className="w-6 h-6 rounded-lg bg-emerald-700 text-white flex items-center justify-center shadow-xs">
                    <Check className="w-4 h-4 stroke-[3]" />
                  </div>
                ) : (
                  <div className="w-6 h-6 rounded-lg border-2 border-stone-400 bg-white hover:border-amber-600 transition-colors" />
                )}
              </div>
              <div className="space-y-1">
                <span className="font-bold text-xs sm:text-sm text-stone-900 block leading-relaxed">
                  میں نے بطور اسٹیٹ مینیجر ({managerName}) اس مدرسے کے تمام کوائف، نام، پتہ، رابطہ اور درجات کی مکمل تصدیق و جانچ کر لی ہے۔
                </span>
                <span className="text-[11px] sm:text-xs text-stone-600 block leading-normal">
                  تمام تفصیلات درست پائی گئیں اور یہ ادارہ باضابطہ الحاق اور نتائج اشاعت کے لیے مکمل طور پر اہل و منظور ہے۔
                </span>
              </div>
            </label>
          </div>

          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2 text-rose-800 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{errorMsg}</span>
            </div>
          )}
        </div>
      )}

        {/* ------------------------------------------------------------- */}
        {/* 3. Modal Footer: Actions (only when reviewing form) */}
        {/* ------------------------------------------------------------- */}
        {!verificationDone && !isSubmitting && (
          <div className="p-4 bg-stone-100 border-t border-stone-200 flex items-center justify-between gap-3 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="py-2.5 px-4 rounded-xl border border-stone-300 text-stone-700 hover:bg-stone-200 text-xs font-bold cursor-pointer transition-colors"
            >
              بند کریں (Cancel)
            </button>

            <button
              type="button"
              onClick={handleApproveOrVerify}
              disabled={!isConfirmedByManager || isSubmitting}
              className={`py-3 px-6 sm:px-8 rounded-2xl text-xs sm:text-sm font-bold flex items-center gap-2 transition-all shadow-md cursor-pointer ${
                isConfirmedByManager && !isSubmitting
                  ? 'bg-emerald-700 hover:bg-emerald-800 text-white hover:scale-[1.02] shadow-emerald-900/20 ring-2 ring-emerald-500/50'
                  : 'bg-stone-300 text-stone-500 cursor-not-allowed opacity-60'
              }`}
            >
              <CheckCircle2 className="w-4 h-4 text-amber-300 shrink-0" />
              <span>
                {isSubmitting
                  ? 'تصدیق ہو رہی ہے...'
                  : '✓ اب ویریفائی کریں (Verify Madrasa Now)'}
              </span>
            </button>
          </div>
        )}
      </div>

      {/* Google Apps Script Code Modal */}
      {showScriptModal && (
        <div className="fixed inset-0 z-60 bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
          <div
            className="bg-white rounded-3xl max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-stone-200 overflow-hidden animate-fade-in my-auto text-right font-urdu"
            dir="rtl"
          >
            <div className="p-4 sm:p-5 bg-gradient-to-r from-emerald-950 to-teal-950 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-400 text-emerald-950 flex items-center justify-center font-bold">
                  <KeyRound className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm sm:text-base text-amber-300 font-aslam">
                    گوگل اسکرپٹ مکمل کوڈ و تعیناتی
                  </h3>
                  <p className="text-[11px] text-emerald-200">
                    Google Drive Folder: "معیار مدارس" (ID: 1HUVOzvuhbRrAO5qsw645dM4QZz75LSG9)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowScriptModal(false)}
                className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 sm:p-5 overflow-y-auto space-y-4 text-xs">
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-950 space-y-1.5">
                <span className="font-bold block text-xs">تعیناتی کی ۳ آسان ہدایات (برائے Kanzuttahreer@gmail.com):</span>
                <ol className="list-decimal list-inside space-y-1 text-amber-900 leading-relaxed">
                  <li>
                    <a
                      href="https://script.google.com"
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-700 underline font-bold"
                    >
                      script.google.com
                    </a>{' '}
                    پر جائیں اور اکاؤنٹ (Kanzuttahreer@gmail.com) سے پراجیکٹ کھولیں۔
                  </li>
                  <li>تمام پرانا کوڈ مٹا کر نیچے دیا گیا نیا مکمل کوڈ پیسٹ کریں اور محفوظ (Ctrl+S) کریں۔</li>
                  <li>
                    اوپر <strong>Deploy &gt; Manage deployments &gt; Edit (پنسل)</strong> پر کلک کر کے{' '}
                    <strong>New version</strong> منتخب کریں اور <strong>Deploy</strong> کر دیں!
                  </li>
                </ol>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-stone-700">مکمل Google Apps Script کوڈ:</span>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(getUnifiedAppsScriptCode());
                      setCopiedCode(true);
                      setTimeout(() => setCopiedCode(false), 3000);
                    }}
                    className="px-3 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
                  >
                    {copiedCode ? <Check className="w-3.5 h-3.5" /> : <ExternalLink className="w-3.5 h-3.5" />}
                    <span>{copiedCode ? 'کاپی ہو گیا ✓' : 'کوڈ کاپی کریں (Copy Code)'}</span>
                  </button>
                </div>

                <div className="bg-stone-900 rounded-2xl p-3 border border-stone-800">
                  <textarea
                    readOnly
                    dir="ltr"
                    value={getUnifiedAppsScriptCode()}
                    className="w-full h-56 bg-transparent text-emerald-300 font-mono text-[11px] focus:outline-none resize-none leading-relaxed"
                  />
                </div>
              </div>
            </div>

            <div className="p-3 bg-stone-100 border-t border-stone-200 flex items-center justify-between">
              <a
                href="https://script.google.com"
                target="_blank"
                rel="noreferrer"
                className="px-4 py-2 rounded-xl bg-stone-200 hover:bg-stone-300 text-stone-800 text-xs font-bold flex items-center gap-1"
              >
                <span>script.google.com کھولیں</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
              <button
                type="button"
                onClick={() => setShowScriptModal(false)}
                className="px-5 py-2 rounded-xl bg-emerald-800 text-white text-xs font-bold"
              >
                بند کریں
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
