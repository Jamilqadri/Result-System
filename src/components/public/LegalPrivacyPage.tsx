import React, { useState } from 'react';
import {
  ArrowRight,
  ShieldCheck,
  FileText,
  AlertTriangle,
  Lock,
  Database,
  Building2,
  Users,
  CheckCircle2,
  Info,
  Globe,
  Sparkles,
} from 'lucide-react';
import { getPortalLogo } from '../../utils/storage';

interface LegalPrivacyPageProps {
  onBack: () => void;
  onOpenResults: () => void;
  onOpenRegister?: () => void;
  onOpenAdmin?: () => void;
}

export const LegalPrivacyPage: React.FC<LegalPrivacyPageProps> = ({
  onBack,
  onOpenResults,
  onOpenRegister,
  onOpenAdmin,
}) => {
  const portalLogo = getPortalLogo() || '/logo.jpg';
  const [lang, setLang] = useState<'ur' | 'en'>(() => {
    return (localStorage.getItem('meyar_lang') as 'ur' | 'en') || 'ur';
  });
  const isEn = lang === 'en';

  const toggleLanguage = () => {
    const next = isEn ? 'ur' : 'en';
    setLang(next);
    localStorage.setItem('meyar_lang', next);
  };

  return (
    <div
      className={`min-h-screen bg-stone-50 text-stone-900 ${isEn ? 'font-sans' : 'font-urdu'} flex flex-col justify-between selection:bg-emerald-100 selection:text-emerald-900`}
      dir={isEn ? 'ltr' : 'rtl'}
    >
      {/* ------------------------------------------------------------- */}
      {/* 1. STICKY TOP HEADER */}
      {/* ------------------------------------------------------------- */}
      <header className="bg-white border-b border-stone-200 sticky top-0 z-30 shadow-2xs">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          {/* Brand Logo & Title */}
          <div className="flex items-center gap-3">
            <img
              src={portalLogo}
              alt="معیار مدارس"
              className="w-10 h-10 rounded-xl object-contain p-0.5 bg-white border border-stone-200 shadow-2xs"
              onError={(e) => {
                (e.target as HTMLImageElement).src = '/logo.jpg';
              }}
            />
            <div>
              <h1
                style={{ fontFamily: isEn ? undefined : "'Aslam Aslam', 'Aslam', serif" }}
                className={`text-2xl sm:text-3xl font-bold text-emerald-950 leading-tight ${isEn ? 'font-sans' : 'font-aslam'}`}
              >
                {isEn ? 'Mayaar-e-Madaris' : 'معیار مدارس'}
              </h1>
              <p className="text-[11px] text-stone-500 -mt-0.5">
                {isEn ? 'Legal & Privacy Center' : 'قانونی دستاویزات و پرائیویسی پالیسی'}
              </p>
            </div>
          </div>

          {/* Action Buttons: Language Toggle & Back to Results */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleLanguage}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-stone-700 bg-stone-100 hover:bg-stone-200 rounded-xl transition-colors cursor-pointer"
              title="Change Language"
            >
              <Globe className="w-3.5 h-3.5 text-emerald-700" />
              <span>{isEn ? 'اردو' : 'English'}</span>
            </button>

            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs sm:text-sm font-bold text-emerald-900 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl transition-all cursor-pointer shadow-2xs"
            >
              <ArrowRight className={`w-4 h-4 ${isEn ? 'rotate-180' : ''}`} />
              <span>{isEn ? 'Back to Results' : 'واپس امتحانی نتائج'}</span>
            </button>
          </div>
        </div>
      </header>

      {/* ------------------------------------------------------------- */}
      {/* 2. MAIN CONTENT BODY */}
      {/* ------------------------------------------------------------- */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-8 sm:py-12 space-y-8">
        {/* Hero Section */}
        <div className="relative overflow-hidden bg-gradient-to-br from-emerald-900 via-emerald-950 to-teal-950 text-white rounded-3xl p-6 sm:p-10 shadow-xl border border-emerald-700/30 text-center">
          <div className="absolute top-0 right-0 -mt-10 -mr-10 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 -mb-10 -ml-10 w-48 h-48 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 max-w-2xl mx-auto space-y-3">
            <span className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full text-xs font-semibold bg-emerald-800/80 text-amber-300 border border-amber-400/30 shadow-xs">
              <ShieldCheck className="w-3.5 h-3.5 text-amber-300" />
              <span>{isEn ? 'Legal & Privacy' : 'قانونی رہنما اصول و پرائیویسی'}</span>
            </span>

            <h2
              style={{ fontFamily: isEn ? undefined : "'Aslam Aslam', 'Aslam', serif" }}
              className={`text-2xl sm:text-4xl font-bold text-amber-300 leading-normal tracking-wide drop-shadow-xs ${isEn ? 'font-sans' : 'font-aslam'}`}
            >
              {isEn ? 'Legal & Privacy Policies' : 'قانونی و پرائیویسی پالیسی — معیارِ مدارس'}
            </h2>

            <p className="text-sm sm:text-base text-emerald-100 leading-relaxed pt-1">
              {isEn
                ? 'Mayaar-e-Madaris is committed to transparency, data protection, and responsible usage across all affiliated institutions and examination services.'
                : 'معیارِ مدارس تمام الحاق شدہ دینی و عصری اداروں کے لیے تعلیمی رازداری، شفافیت اور ڈیٹا کے تحفظ کا پختہ عزم رکھتا ہے۔'}
            </p>
          </div>
        </div>

        {/* ========================================================= */}
        {/* SECTION 1: PRIVACY POLICY */}
        {/* ========================================================= */}
        <section className="bg-white rounded-3xl p-6 sm:p-8 border border-stone-200 shadow-sm space-y-5">
          <div className="flex items-center gap-3 pb-4 border-b border-stone-100">
            <div className="w-11 h-11 rounded-2xl bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0 shadow-2xs">
              <Lock className="w-6 h-6 text-emerald-800" />
            </div>
            <div>
              <span className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider block">
                {isEn ? 'Section 1' : 'حصہ اول'}
              </span>
              <h3 className="text-xl sm:text-2xl font-bold text-stone-900 leading-tight">
                {isEn ? '1. Privacy Policy' : '۱۔ پرائیویسی پالیسی (Privacy Policy)'}
              </h3>
            </div>
          </div>

          <div className="space-y-4 text-stone-700 leading-relaxed text-sm sm:text-base">
            <p className="bg-emerald-50/70 border border-emerald-200/80 rounded-2xl p-4 text-emerald-950 font-medium">
              {isEn
                ? 'We collect madrasa name, address, contact details, and student information such as name, date of birth, roll number, and academic results. Data is stored securely in encrypted cloud databases and accessed only for relevant system purposes. Protect personal data and restrict unauthorized access.'
                : 'ہم ادارہ کا نام، پتہ، رابطہ کی تفصیلات اور طلبہ کی معلومات جیسے نام، تاریخِ پیدائش، رول نمبر اور تعلیمی نتائج جمع کرتے ہیں۔ یہ تمام ڈیٹا محفوظ کلاؤڈ ڈیٹابیس میں محفوظ کیا جاتا ہے اور صرف متعلقہ امتحانی و تعلیمی مقاصد کے لیے ہی استعمال کیا جاتا ہے۔ ذاتی ڈیٹا کا تحفظ اور غیر مجاز رسائی کو روکنا ہماری ترجیح ہے۔'}
            </p>

            {/* Structured Breakdown Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 pt-1">
              <div className="p-4 rounded-2xl bg-stone-50 border border-stone-200/80 space-y-2">
                <div className="flex items-center gap-2 text-emerald-800 font-bold text-sm">
                  <Building2 className="w-4 h-4 text-emerald-700 shrink-0" />
                  <span>{isEn ? 'Information Collected' : 'جمع کی جانے والی معلومات'}</span>
                </div>
                <p className="text-xs text-stone-600 leading-relaxed">
                  {isEn
                    ? 'Madrasa registration details (name, code, address, contact) and enrolled students’ academic records (name, father name, roll number, date of birth, exam marks).'
                    : 'مدرسہ کی تفصیلات (نام، کوڈ، پتہ، رابطہ) اور طلبہ کے تعلیمی کوائف (نام، ولدیت، رول نمبر، تاریخ پیدائش، اور امتحانی نمبرات)۔'}
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-stone-50 border border-stone-200/80 space-y-2">
                <div className="flex items-center gap-2 text-emerald-800 font-bold text-sm">
                  <Database className="w-4 h-4 text-emerald-700 shrink-0" />
                  <span>{isEn ? 'Secure Storage' : 'محفوظ کلاؤڈ ڈیٹابیس (Encrypted Cloud)'}</span>
                </div>
                <p className="text-xs text-stone-600 leading-relaxed">
                  {isEn
                    ? 'All academic and student examination records are stored securely in cloud databases, protected by cloud access controls and encrypted channels.'
                    : 'تمام تر امتحانی ڈیٹا اور طلبہ کا ریکارڈ کلاؤڈ ڈیٹابیس کے اندر محفوظ کنکشن اور انکرپٹڈ سیکیورٹی کے ساتھ محفوظ کیا جاتا ہے۔'}
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-stone-50 border border-stone-200/80 space-y-2">
                <div className="flex items-center gap-2 text-emerald-800 font-bold text-sm">
                  <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0" />
                  <span>{isEn ? 'Access Restriction' : 'غیر مجاز رسائی کی روک تھام'}</span>
                </div>
                <p className="text-xs text-stone-600 leading-relaxed">
                  {isEn
                    ? 'Strict authentication protocols restrict administrative access to authorized madrasa principals and verified portal managers only.'
                    : 'سیکیورٹی پروٹوکولز کے ذریعے غیر متعلقہ افراد کی رسائی سختی سے روکی جاتی ہے اور صرف بااختیار پرنسپل اور ایڈمنسٹریٹرز ہی لاگ ان کر سکتے ہیں۔'}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ========================================================= */}
        {/* SECTION 2: TERMS & CONDITIONS */}
        {/* ========================================================= */}
        <section className="bg-white rounded-3xl p-6 sm:p-8 border border-stone-200 shadow-sm space-y-5">
          <div className="flex items-center gap-3 pb-4 border-b border-stone-100">
            <div className="w-11 h-11 rounded-2xl bg-blue-100 text-blue-800 flex items-center justify-center shrink-0 shadow-2xs">
              <FileText className="w-6 h-6 text-blue-800" />
            </div>
            <div>
              <span className="text-[11px] font-bold text-blue-800 uppercase tracking-wider block">
                {isEn ? 'Section 2' : 'حصہ دوم'}
              </span>
              <h3 className="text-xl sm:text-2xl font-bold text-stone-900 leading-tight">
                {isEn ? '2. Terms & Conditions' : '۲۔ شرائط و ضوابط (Terms & Conditions)'}
              </h3>
            </div>
          </div>

          <div className="space-y-4 text-stone-700 leading-relaxed text-sm sm:text-base">
            <p className="bg-blue-50/70 border border-blue-200/80 rounded-2xl p-4 text-blue-950 font-medium">
              {isEn
                ? 'Users must provide accurate information and use the system responsibly. Only authorized users may manage student records and results.'
                : 'تمام صارفین کے لیے درست اور سچی معلومات فراہم کرنا اور پورٹل کو ذمہ داری کے ساتھ استعمال کرنا لازمی ہے۔ طلبہ کے امتحانی ریکارڈ اور نتائج کو صرف بااختیار صارفین ہی منظم اور تبدیل کر سکتے ہیں۔'}
            </p>

            <ul className="space-y-2.5 pt-1 text-xs sm:text-sm text-stone-700">
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>
                  {isEn
                    ? 'Affiliated madaris are responsible for the validity, completeness, and accuracy of names, dates of birth, and marks entered.'
                    : 'الحاق شدہ مدارس اپنے اندراج شدہ طلبہ کے نام، تاریخِ پیدائش اور نمبرات کی صداقت اور درستگی کے خود ذمہ دار ہیں۔'}
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>
                  {isEn
                    ? 'Principal login credentials must be safeguarded and not shared with unauthorized parties or external entities.'
                    : 'پرنسپل پورٹل کے لاگ ان کریڈینشلز (یوزر کوڈ اور پاسورڈ) کی حفاظت ضروری ہے اور اسے کسی غیر مجاز شخص کے ساتھ شیئر نہ کیا جائے۔'}
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>
                  {isEn
                    ? 'The platform may be used solely for institutional and academic examination purposes in accordance with ethical Islamic principles.'
                    : 'اس پلیٹ فارم کو صرف تعلیمی و امتحانی خدمات اور دیانت دارانہ شرعی اصولوں کے مطابق استعمال کیا جائے گا۔'}
                </span>
              </li>
            </ul>
          </div>
        </section>

        {/* ========================================================= */}
        {/* SECTION 3: DISCLAIMER */}
        {/* ========================================================= */}
        <section className="bg-white rounded-3xl p-6 sm:p-8 border border-stone-200 shadow-sm space-y-5">
          <div className="flex items-center gap-3 pb-4 border-b border-stone-100">
            <div className="w-11 h-11 rounded-2xl bg-amber-100 text-amber-900 flex items-center justify-center shrink-0 shadow-2xs">
              <AlertTriangle className="w-6 h-6 text-amber-700" />
            </div>
            <div>
              <span className="text-[11px] font-bold text-amber-800 uppercase tracking-wider block">
                {isEn ? 'Section 3' : 'حصہ سوم'}
              </span>
              <h3 className="text-xl sm:text-2xl font-bold text-stone-900 leading-tight">
                {isEn ? '3. Disclaimer' : '۳۔ دستبرداری و ڈس کلیمر (Disclaimer)'}
              </h3>
            </div>
          </div>

          <div className="space-y-4 text-stone-700 leading-relaxed text-sm sm:text-base">
            <p className="bg-amber-50/70 border border-amber-200/80 rounded-2xl p-4 text-amber-950 font-medium">
              {isEn
                ? 'Results are based on the information provided by the respective madrasa. Please contact the madrasa to verify any discrepancies. Temporary technical issues may affect service availability.'
                : 'امتحانی نتائج متعلقہ مدرسے کی فراہم کردہ معلومات اور امتحانی شیٹ پر مبنی ہوتے ہیں۔ کسی بھی غلطی یا اختلاف کی صورت میں تصدیق کے لیے براہ کرم متعلقہ مدرسے سے رابطہ فرمائیں۔ عارضی تکنیکی مسائل کی وجہ سے سروس کی دستیابی پر اثر پڑ سکتا ہے۔'}
            </p>

            <div className="p-4 rounded-2xl bg-stone-50 border border-stone-200/80 space-y-2 text-xs sm:text-sm text-stone-600">
              <div className="flex items-center gap-2 text-stone-800 font-bold">
                <Info className="w-4 h-4 text-stone-600 shrink-0" />
                <span>{isEn ? 'Discrepancy Resolution Notice' : 'ضروری وضاحت برائے تصدیق'}</span>
              </div>
              <p className="leading-relaxed">
                {isEn
                  ? 'Mayaar-e-Madaris functions as a digital hosting and display portal for examination marks submitted by registered madaris. In case of any typographic errors, missing subjects, or name corrections, parents and students should contact their madrasa administration directly.'
                  : 'معیارِ مدارس ایک ڈیجیٹل پورٹل ہے جو الحاق شدہ مدارس کے امتحانی نتائج کو محفوظ اور شائع کرنے کی سہولت دیتا ہے۔ نتائج میں کسی بھی قسم کے سہو یا تبدیلی کے لیے مدرسہ انتظامیہ ہی مجاز اتھارٹی ہے۔'}
              </p>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------------- */}
        {/* FOOTER CTA & NAVIGATION */}
        {/* ------------------------------------------------------------- */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-6 bg-emerald-950 text-white rounded-3xl shadow-lg border border-emerald-900">
          <div className="text-center sm:text-start space-y-1">
            <h4
              style={{ fontFamily: isEn ? undefined : "'Aslam Aslam', 'Aslam', serif" }}
              className={`text-lg sm:text-xl font-bold text-amber-300 ${isEn ? 'font-sans' : 'font-aslam'}`}
            >
              {isEn ? 'Mayaar-e-Madaris Examination System' : 'معیارِ مدارس — مرکزی امتحانی نظام'}
            </h4>
            <p className="text-xs text-emerald-200">
              {isEn
                ? 'Dedicated to the educational upliftment and transparency of Islamic institutions.'
                : 'مدارسِ اسلامیہ کے تعلیمی و امتحانی نظم کو جدید، شفاف اور منظم بنانے کا باوقار سفر۔'}
            </p>
          </div>

          <button
            type="button"
            onClick={onOpenResults}
            className="px-5 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-emerald-950 font-bold text-xs sm:text-sm shadow-md transition-all cursor-pointer shrink-0"
          >
            {isEn ? 'Go to Student Search' : 'طلبہ رزلٹ تلاش کریں'}
          </button>
        </div>
      </main>

      {/* ------------------------------------------------------------- */}
      {/* 3. FOOTER */}
      {/* ------------------------------------------------------------- */}
      <footer className="bg-white border-t border-stone-200 py-5 text-center text-xs text-stone-500">
        <div className="max-w-5xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>
            {isEn
              ? '© 2026 Mayaar-e-Madaris. All rights reserved.'
              : '© 2026ء معیارِ مدارس۔ جملہ حقوق محفوظ ہیں۔'}
          </span>
          <div className="flex items-center gap-4 text-xs font-semibold text-emerald-800">
            <button
              type="button"
              onClick={onOpenResults}
              className="hover:underline cursor-pointer"
            >
              {isEn ? 'Results' : 'امتحانی نتائج'}
            </button>
            {onOpenRegister && (
              <button
                type="button"
                onClick={onOpenRegister}
                className="hover:underline cursor-pointer"
              >
                {isEn ? 'Registration' : 'رجسٹریشن'}
              </button>
            )}
            {onOpenAdmin && (
              <button
                type="button"
                onClick={onOpenAdmin}
                className="hover:underline cursor-pointer"
              >
                {isEn ? 'Admin' : 'ایڈمن'}
              </button>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
};
