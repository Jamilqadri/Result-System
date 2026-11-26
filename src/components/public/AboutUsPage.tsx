import React from 'react';
import { ArrowRight, ArrowLeft, ShieldCheck, CheckCircle2, Sparkles, Building2, Search, HeartHandshake, Award, FileCheck2, Globe } from 'lucide-react';
import { getPortalLogo } from '../../utils/storage';

interface AboutUsPageProps {
  onBack: () => void;
  onOpenResults: () => void;
  onOpenRegister?: () => void;
  onOpenAdmin?: () => void;
}

export const AboutUsPage: React.FC<AboutUsPageProps> = ({
  onBack,
  onOpenResults,
  onOpenRegister,
  onOpenAdmin,
}) => {
  const portalLogo = getPortalLogo() || '/logo.jpg';

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900 font-urdu flex flex-col justify-between selection:bg-emerald-100 selection:text-emerald-900" dir="rtl">
      {/* Header */}
      <header className="bg-white border-b border-stone-200 sticky top-0 z-30 shadow-2xs">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          {/* Logo & Brand Name in Aslam font */}
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
                style={{ fontFamily: "'Aslam Aslam', 'Aslam', serif" }}
                className="text-2xl sm:text-3xl font-bold text-emerald-950 leading-tight"
              >
                معیار مدارس
              </h1>
              <p className="text-[11px] text-stone-500 font-urdu -mt-0.5">
                تعارف و اغراض و مقاصد
              </p>
            </div>
          </div>

          {/* Back to Results */}
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs sm:text-sm font-bold text-emerald-900 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl transition-all cursor-pointer shadow-2xs"
          >
            <ArrowRight className="w-4 h-4" />
            <span>واپس امتحانی نتائج</span>
          </button>
        </div>
      </header>

      {/* Main Body */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-8 sm:py-12 space-y-8">
        {/* Hero Card */}
        <div className="relative overflow-hidden bg-gradient-to-br from-emerald-900 via-emerald-950 to-teal-950 text-white rounded-3xl p-6 sm:p-10 shadow-xl border border-emerald-700/30 text-center">
          <div className="absolute top-0 right-0 -mt-10 -mr-10 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 -mb-10 -ml-10 w-48 h-48 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 max-w-2xl mx-auto space-y-4">
            <span className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full text-xs font-semibold bg-emerald-800/80 text-amber-300 border border-amber-400/30 shadow-xs">
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              <span>ہمارے بارے میں — About Us</span>
            </span>

            <h2
              style={{ fontFamily: "'Aslam Aslam', 'Aslam', serif" }}
              className="text-3xl sm:text-5xl font-bold text-amber-300 leading-normal tracking-wide drop-shadow-xs"
            >
              معیارِ مدارس — Mayaar-e-Madaris
            </h2>

            <p className="text-base sm:text-lg text-emerald-100 leading-relaxed font-alvi pt-1">
              معیارِ مدارس ایک ایسا تعلیمی پلیٹ فارم ہے جس کا مقصد مدارس کے تعلیمی نظام کو بہتر، منظم اور مؤثر بنانے میں معاونت فراہم کرنا ہے۔
            </p>

            <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-white/10 backdrop-blur-xs text-xs font-medium text-emerald-100 border border-white/10">
                <CheckCircle2 className="w-3.5 h-3.5 text-amber-300" />
                <span>شفاف نتائج</span>
              </div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-white/10 backdrop-blur-xs text-xs font-medium text-emerald-100 border border-white/10">
                <ShieldCheck className="w-3.5 h-3.5 text-amber-300" />
                <span>محفوظ ریکارڈ</span>
              </div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-white/10 backdrop-blur-xs text-xs font-medium text-emerald-100 border border-white/10">
                <Award className="w-3.5 h-3.5 text-amber-300" />
                <span>تعلیمی معیار</span>
              </div>
            </div>
          </div>
        </div>

        {/* Core Principles & Vision Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Card 1: Modern Technology */}
          <div className="bg-white p-6 sm:p-7 rounded-3xl border border-stone-200/90 shadow-sm space-y-3 hover:shadow-md transition-shadow">
            <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-800 flex items-center justify-center shadow-2xs">
              <FileCheck2 className="w-6 h-6" />
            </div>
            <h3 className="text-lg sm:text-xl font-bold text-stone-900 leading-snug">
              جدید ٹیکنالوجی اور شفافیت
            </h3>
            <p className="text-stone-700 text-sm sm:text-base leading-relaxed font-alvi">
              ہم جدید ٹیکنالوجی کے ذریعے مدارس کے تعلیمی امور کو آسان بنانے، معلومات کو منظم انداز میں محفوظ رکھنے اور تعلیمی عمل میں شفافیت و سہولت کو فروغ دینے کے لیے کوشاں ہیں۔
            </p>
          </div>

          {/* Card 2: Religious & Modern Balance */}
          <div className="bg-white p-6 sm:p-7 rounded-3xl border border-stone-200/90 shadow-sm space-y-3 hover:shadow-md transition-shadow">
            <div className="w-12 h-12 rounded-2xl bg-blue-100 text-blue-800 flex items-center justify-center shadow-2xs">
              <HeartHandshake className="w-6 h-6" />
            </div>
            <h3 className="text-lg sm:text-xl font-bold text-stone-900 leading-snug">
              دینی خدمات اور جدید سہولیات
            </h3>
            <p className="text-stone-700 text-sm sm:text-base leading-relaxed font-alvi">
              ہمارا یقین ہے کہ دینی تعلیم کی عظیم خدمات کو برقرار رکھتے ہوئے جدید دور کی مفید ٹیکنالوجی سے فائدہ اٹھانا وقت کی اہم ضرورت ہے۔
            </p>
          </div>
        </div>

        {/* Mission & Commitment Banners */}
        <div className="space-y-4">
          {/* Goal */}
          <div className="bg-gradient-to-r from-emerald-50 via-teal-50 to-white p-5 sm:p-6 rounded-2xl border-r-4 border-emerald-600 border-t border-b border-l border-stone-200 shadow-2xs flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 mt-0.5 shadow-xs">
              <Award className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <h4 className="text-base sm:text-lg font-bold text-emerald-950">
                ہمارا مقصد:
              </h4>
              <p className="text-stone-800 text-sm sm:text-base leading-relaxed font-alvi">
                مدارس کے لیے آسان، قابلِ اعتماد اور مؤثر ڈیجیٹل سہولیات فراہم کرنا۔
              </p>
            </div>
          </div>

          {/* Commitment */}
          <div className="bg-gradient-to-r from-amber-50 via-yellow-50 to-white p-5 sm:p-6 rounded-2xl border-r-4 border-amber-500 border-t border-b border-l border-stone-200 shadow-2xs flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 mt-0.5 shadow-xs">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <h4 className="text-base sm:text-lg font-bold text-stone-900">
                ہمارا عزم:
              </h4>
              <p className="text-stone-800 text-sm sm:text-base leading-relaxed font-alvi">
                شفافیت، معیار، اعتماد اور تعلیمی ترقی۔
              </p>
            </div>
          </div>
        </div>

        {/* Bottom Slogan Card */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-stone-200 text-center shadow-xs space-y-4">
          <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-800 mx-auto flex items-center justify-center shadow-2xs">
            <Building2 className="w-7 h-7" />
          </div>

          <h3
            style={{ fontFamily: "'Aslam Aslam', 'Aslam', serif" }}
            className="text-2xl sm:text-3xl font-bold text-emerald-950"
          >
            معیارِ مدارس — شفاف نتائج، محفوظ ریکارڈ۔
          </h3>

          <p className="text-stone-600 text-xs sm:text-sm max-w-xl mx-auto leading-relaxed">
            امتحانی نتائج، طلبہ کی داخلہ فہرست، اور مرکزی ریکارڈز کی بروقت اور محفوظ ترین فراہمی۔
          </p>

          <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={onOpenResults}
              className="px-5 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs sm:text-sm shadow-xs transition-colors flex items-center gap-2 cursor-pointer"
            >
              <Search className="w-4 h-4" />
              <span>امتحانی نتائج دیکھیں (Search Results)</span>
            </button>

            {onOpenRegister && (
              <button
                type="button"
                onClick={onOpenRegister}
                className="px-5 py-2.5 rounded-xl bg-white hover:bg-stone-50 text-stone-800 border border-stone-300 font-bold text-xs sm:text-sm shadow-2xs transition-colors flex items-center gap-2 cursor-pointer"
              >
                <Building2 className="w-4 h-4 text-emerald-700" />
                <span>نئے مدرسے کی رجسٹریشن</span>
              </button>
            )}

            {onOpenAdmin && (
              <button
                type="button"
                onClick={onOpenAdmin}
                className="px-5 py-2.5 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold text-xs sm:text-sm shadow-2xs transition-colors flex items-center gap-2 cursor-pointer"
              >
                <ShieldCheck className="w-4 h-4 text-stone-600" />
                <span>ایڈمن پینل</span>
              </button>
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-stone-200 py-5 text-center text-xs text-stone-500">
        <div className="max-w-5xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <p style={{ fontFamily: "'Aslam Aslam', 'Aslam', serif" }} className="text-emerald-950 font-bold text-sm">
            معیارِ مدارس — Mayaar-e-Madaris
          </p>
          <p className="font-urdu text-[11px] text-stone-500">
            جملہ حقوق محفوظ ہیں۔ شفاف نتائج، محفوظ ریکارڈ۔
          </p>
        </div>
      </footer>
    </div>
  );
};
