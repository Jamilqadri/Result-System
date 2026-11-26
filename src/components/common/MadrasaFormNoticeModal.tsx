/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Madrasa Form Maintenance & Work-in-Progress Notice Modal
 * مدرسہ فارم معطلی / کام جاری ہے کا باوقار اطلاعیہ
 */

import React from 'react';
import {
  Clock,
  ArrowRight,
  MessageCircle,
  Home,
  CheckCircle2,
  X,
  Power,
  ShieldCheck,
} from 'lucide-react';
import { MadrasaFormStatus } from '../../types';

interface MadrasaFormNoticeModalProps {
  isOpen: boolean;
  onClose: () => void;
  status?: MadrasaFormStatus;
  isAdmin?: boolean;
  onTurnOnForm?: () => void;
  onGoToHome?: () => void;
}

export const MadrasaFormNoticeModal: React.FC<MadrasaFormNoticeModalProps> = ({
  isOpen,
  onClose,
  status,
  isAdmin = false,
  onTurnOnForm,
  onGoToHome,
}) => {
  if (!isOpen) return null;

  const greeting = status?.greeting || 'السلام علیکم ورحمۃ اللہ وبرکاتہ';
  const rawMessage = status?.message || 'ابھی اس پر کام ہو رہا ہے\nکچھ دن بعد دوبارہ کوشش کریں';
  const messageLines = rawMessage.split('\n').filter(Boolean);

  const handleWhatsAppContact = () => {
    const text = `${greeting}\n\nمعیار مدارس پورٹل پر مدرسہ الحاق و رجسٹریشن فارم کے حوالے سے رہنمائی درکار ہے۔`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank');
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn"
      dir="rtl"
    >
      <div
        className="bg-white rounded-3xl max-w-lg w-full border border-stone-200 shadow-2xl overflow-hidden animate-scaleUp"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header Decorative Banner */}
        <div className="bg-gradient-to-r from-emerald-800 via-teal-800 to-amber-900 p-6 text-white text-center relative overflow-hidden">
          <button
            onClick={onClose}
            className="absolute top-4 left-4 p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white/80 hover:text-white transition-colors cursor-pointer"
            title="بند کریں"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="w-16 h-16 mx-auto mb-3 rounded-2xl bg-white/10 backdrop-blur-xs border border-white/20 flex items-center justify-center shadow-inner">
            <Clock className="w-8 h-8 text-amber-300 animate-pulse" />
          </div>

          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-400/20 text-amber-200 border border-amber-300/30 text-xs font-bold tracking-wide mb-2">
            <span>مدرسہ الحاق و رجسٹریشن فارم</span>
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
            <span>کام جاری ہے</span>
          </span>

          <h2 className="text-xl sm:text-2xl font-bold font-nastaliq text-amber-100 tracking-wide mt-1">
            {greeting}
          </h2>
        </div>

        {/* Notice Content Body */}
        <div className="p-6 sm:p-8 space-y-6 text-center">
          {/* Main Work in Progress Highlight Box */}
          <div className="bg-gradient-to-br from-amber-50/80 via-orange-50/40 to-stone-50 border border-amber-200/90 rounded-2xl p-6 shadow-inner text-stone-800">
            <div className="space-y-3 font-nastaliq text-xl sm:text-2xl text-emerald-950 font-bold leading-relaxed">
              {messageLines.map((line, idx) => (
                <p key={idx} className={idx === 0 ? 'text-emerald-900 font-extrabold' : 'text-stone-700'}>
                  {line}
                </p>
              ))}
            </div>

            <p className="mt-4 text-xs sm:text-sm text-stone-500 font-sans border-t border-amber-200/60 pt-3">
              آن لائن مدرسہ رجسٹریشن سسٹم کو مزید بہتر اور خودکار بنایا جا رہا ہے۔ براہ کرم کچھ دن بعد پورٹل دوبارہ ملاحظہ فرمائیں۔
            </p>
          </div>

          {/* Admin Override Card if opened by Result Admin */}
          {isAdmin && onTurnOnForm && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3.5 text-right flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-700 shrink-0" />
                <div className="text-xs">
                  <strong className="text-emerald-900 block">امتحانی ایڈمن کنٹرول</strong>
                  <span className="text-emerald-700">آپ اس فارم کو ابھی فوری طور پر آن کر سکتے ہیں۔</span>
                </div>
              </div>
              <button
                onClick={() => {
                  onTurnOnForm();
                  onClose();
                }}
                className="px-3.5 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer flex items-center gap-1.5 shrink-0"
              >
                <Power className="w-3.5 h-3.5" />
                <span>فارم آن کریں</span>
              </button>
            </div>
          )}

          {/* Action Buttons */}
          <div className="space-y-2.5 pt-2">
            <button
              onClick={() => {
                onClose();
                if (onGoToHome) {
                  onGoToHome();
                } else {
                  window.location.hash = '';
                }
              }}
              className="w-full py-3 px-4 bg-emerald-800 hover:bg-emerald-900 text-white rounded-xl text-xs sm:text-sm font-bold shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <Home className="w-4 h-4 text-amber-300" />
              <span>ہوم پیج پر واپس جائیں</span>
            </button>

            <button
              onClick={handleWhatsAppContact}
              className="w-full py-2.5 px-3 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-200 rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <MessageCircle className="w-4 h-4 text-emerald-600" />
              <span>واٹس ایپ پر رابطہ کریں</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
