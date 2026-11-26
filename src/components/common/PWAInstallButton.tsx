import React, { useState } from 'react';
import { usePWAInstall } from '../../hooks/usePWAInstall';
import { Download, Smartphone, X } from 'lucide-react';

interface PWAInstallButtonProps {
  className?: string;
  variant?: 'primary' | 'secondary' | 'badge' | 'sidebar';
  label?: string;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  className = '',
  variant = 'secondary',
  label,
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  // If already running as an installed PWA / standalone window, hide
  if (isInstalled) {
    return null;
  }

  const defaultLabel = label || 'ایپ انسٹال کریں (Install App)';

  const handleClick = () => {
    if (isInstallable) {
      install();
    } else if (isIOS) {
      setShowIOSGuide(true);
    } else {
      setShowGuide(true);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-urdu text-xs font-bold transition-all cursor-pointer shadow-xs ${
          variant === 'primary'
            ? 'bg-amber-400 hover:bg-amber-300 text-emerald-950 font-extrabold'
            : variant === 'sidebar'
            ? 'w-full bg-emerald-800/80 hover:bg-emerald-700 text-emerald-100 border border-emerald-600/50 justify-center py-2'
            : variant === 'badge'
            ? 'bg-emerald-100 hover:bg-emerald-200 text-emerald-900 border border-emerald-300 text-[11px]'
            : 'bg-white/10 hover:bg-white/20 text-white border border-white/20'
        } ${className}`}
        title="اس ویب ایپ کو کروم یا موبائل ہوم اسکرین پر انسٹال کریں"
      >
        {isIOS ? (
          <Smartphone className="w-3.5 h-3.5 shrink-0" />
        ) : (
          <Download className="w-3.5 h-3.5 shrink-0" />
        )}
        <span>{defaultLabel}</span>
      </button>

      {/* iOS Safari Guide Modal */}
      {showIOSGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 font-urdu text-right" dir="rtl">
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl space-y-4 border border-stone-200 text-stone-900">
            <div className="flex items-center justify-between border-b border-stone-100 pb-2">
              <h3 className="text-base font-bold text-stone-900">iPhone / iPad پر انسٹالیشن کا طریقہ</h3>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="p-1 rounded-lg text-stone-400 hover:text-stone-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <ol className="text-xs space-y-2 text-stone-700 leading-relaxed list-decimal pr-4">
              <li>سفاری (Safari) براؤزر میں نیچے <strong>Share</strong> (شیئر) کے بٹن کو دبائیں۔</li>
              <li>تھوڑا نیچے سکرول کر کے <strong>"Add to Home Screen"</strong> منتخب فرمائیں۔</li>
              <li>اوپر دائیں جانب <strong>"Add"</strong> دبائیں۔ ایپ ہوم اسکرین پر شامل ہو جائے گی!</li>
            </ol>
            <button
              type="button"
              onClick={() => setShowIOSGuide(false)}
              className="w-full py-2.5 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-bold transition-colors cursor-pointer"
            >
              سمجھ گیا (بند کریں)
            </button>
          </div>
        </div>
      )}

      {/* Desktop / Android Guide Modal when direct prompt is inactive */}
      {showGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 font-urdu text-right" dir="rtl">
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl space-y-4 border border-stone-200 text-stone-900">
            <div className="flex items-center justify-between border-b border-stone-100 pb-2">
              <div className="flex items-center gap-2">
                <Download className="w-4 h-4 text-emerald-800" />
                <h3 className="text-base font-bold text-stone-900">ایپ انسٹالیشن کا طریقہ</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                className="p-1 rounded-lg text-stone-400 hover:text-stone-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="text-xs space-y-2 text-stone-700 leading-relaxed">
              <p>
                کروم (Chrome) یا ایج (Edge) براؤزر کے اوپر دائیں جانب ایڈریس بار میں <strong>انسٹال آئکن (⊕ یا Download)</strong> موجود ہے، اس پر کلک کریں۔
              </p>
              <p className="text-[11px] text-stone-500">
                یا براؤزر کے تھری ڈاٹ مینو (⋮) پر کلک کر کے <strong>"Install App"</strong> یا <strong>"Add to Home screen"</strong> منتخب فرمائیں۔
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowGuide(false)}
              className="w-full py-2.5 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-bold transition-colors cursor-pointer"
            >
              سمجھ گیا (بند کریں)
            </button>
          </div>
        </div>
      )}
    </>
  );
};
