/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { getPortalLogo, savePortalLogo } from '../../utils/storage';
import { Image, Upload, RotateCcw, Check, X, Loader2 } from 'lucide-react';

interface PortalLogoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

/**
 * Resizes and compresses an image file to a lightweight data URL (max 400x400)
 * to ensure rapid storage, low memory usage, and zero localStorage quota issues.
 */
function compressImageFile(file: File, maxDim = 400): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const src = e.target?.result as string;
      const img = new window.Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, width);
        canvas.height = Math.max(1, height);
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(src);
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const mime = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
        const dataUrl = canvas.toDataURL(mime, 0.9);
        resolve(dataUrl);
      };
      img.onerror = () => resolve(src);
      img.src = src;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export const PortalLogoModal: React.FC<PortalLogoModalProps> = ({ isOpen, onClose, onSaved }) => {
  const [currentLogo, setCurrentLogo] = useState<string>(() => getPortalLogo());
  const [previewLogo, setPreviewLogo] = useState<string>(() => getPortalLogo());
  const [urlInput, setUrlInput] = useState<string>('');
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      const active = getPortalLogo();
      setCurrentLogo(active);
      setPreviewLogo(active);
      setUrlInput('');
      setSuccessMsg(false);
      setErrorMsg(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('براہ کرم صرف تصویر والی فائل (PNG, JPG, WEBP) منتخب کریں۔');
      return;
    }

    setIsProcessingFile(true);
    setErrorMsg(null);
    try {
      const compressedDataUrl = await compressImageFile(file, 400);
      setPreviewLogo(compressedDataUrl);
      setUrlInput('');
    } catch (err) {
      console.error('File read error:', err);
      setErrorMsg('تصویر پراسیس کرنے میں مسئلہ پیش آیا۔ برائے مہربانی دوسری تصویر منتخب کریں۔');
    } finally {
      setIsProcessingFile(false);
    }
  };

  const handleSave = async () => {
    const targetLogo = previewLogo.trim() || '/logo.jpg';
    setIsSaving(true);
    setErrorMsg(null);

    try {
      const res = await savePortalLogo(targetLogo);
      if (res.success) {
        setCurrentLogo(targetLogo);
        setSuccessMsg(true);
        if (onSaved) onSaved();
        setTimeout(() => {
          setSuccessMsg(false);
          setIsSaving(false);
          onClose();
        }, 800);
      } else {
        setErrorMsg(res.error || 'لوگو محفوظ کرنے میں مسئلہ پیش آیا');
        setIsSaving(false);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'نیٹ ورک خرابی');
      setIsSaving(false);
    }
  };

  const handleResetToDefault = () => {
    setPreviewLogo('/logo.jpg');
    setUrlInput('');
    setErrorMsg(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs font-arabic">
      <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl border border-stone-200 overflow-hidden text-right animate-scale-up">
        {/* Header */}
        <div className="bg-[#15345d] text-white p-5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-amber-300 shadow-inner">
              <Image className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-nastaliq text-xl font-bold">پورٹل لوگو مینجمنٹ</h3>
              <p className="text-[11px] text-sky-200">مرکزی پورٹل کا لوگو تبدیل یا نیا لوگو اپلوڈ کریں</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-white/10 text-white/80 transition-colors cursor-pointer"
            title="بند کریں"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          {/* Logo Preview Area */}
          <div className="flex flex-col items-center justify-center p-4 bg-stone-50 border border-stone-200 rounded-2xl">
            <span className="text-xs font-bold text-stone-700 mb-2">لوگو پیش نظارہ (Live Preview)</span>
            <div className="w-28 h-28 rounded-2xl border-2 border-emerald-500 bg-white p-2 flex items-center justify-center shadow-md relative overflow-hidden">
              {isProcessingFile ? (
                <div className="flex flex-col items-center justify-center gap-1.5 text-emerald-800">
                  <Loader2 className="w-6 h-6 animate-spin" />
                  <span className="text-[10px] font-bold">پراسیس ہو رہا ہے...</span>
                </div>
              ) : (
                <img
                  src={previewLogo}
                  alt="Portal Logo Preview"
                  className="w-full h-full object-contain"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = '/logo.jpg';
                  }}
                />
              )}
            </div>
            <span className="text-[11px] text-stone-500 mt-2 font-medium">
              مرکزی پورٹل، ایڈمن پینل اور ہیڈر پر یہی لوگو نظر آئے گا
            </span>
          </div>

          {/* Action: Upload File */}
          <div className="space-y-3">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileUpload}
              className="hidden"
            />

            <button
              type="button"
              disabled={isProcessingFile || isSaving}
              onClick={() => fileInputRef.current?.click()}
              className="w-full py-3 px-4 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-xs transition-colors cursor-pointer disabled:opacity-60"
            >
              <Upload className="w-4 h-4 text-amber-300" />
              <span>📁 کمپیوٹر / موبائل سے نیا لوگو منتخب کریں</span>
            </button>

            {/* Direct URL input option */}
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                یا تصویر کا آن لائن لنک (Image URL) درج کریں:
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  dir="ltr"
                  placeholder="https://example.com/logo.png"
                  value={urlInput}
                  onChange={(e) => {
                    const val = e.target.value;
                    setUrlInput(val);
                    if (val.trim()) {
                      setPreviewLogo(val.trim());
                    }
                  }}
                  className="flex-1 px-3 py-2 bg-stone-50 border border-stone-300 rounded-xl text-xs font-mono text-stone-900 focus:bg-white focus:ring-2 focus:ring-emerald-600 focus:outline-none"
                />
              </div>
            </div>

            {/* Reset to default button */}
            <div className="flex items-center justify-between pt-1">
              <span className="text-[11px] text-stone-400">
                {previewLogo === '/logo.jpg' ? 'ڈیفالٹ لوگو منتخب ہے' : 'تبدیل شدہ لوگو منتخب ہے'}
              </span>
              <button
                type="button"
                onClick={handleResetToDefault}
                className="text-xs text-stone-500 hover:text-stone-800 flex items-center gap-1 font-semibold cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>ڈیفالٹ لوگو پر واپس جائیں</span>
              </button>
            </div>
          </div>

          {/* Error Message */}
          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-300 rounded-xl text-rose-800 text-xs font-bold flex items-center gap-2">
              <X className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Success Message Banner */}
          {successMsg && (
            <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-xl text-emerald-800 text-xs font-bold flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>لوگو کامیابی سے اپڈیٹ اور لائیو محفوظ کر دیا گیا ہے!</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-stone-50 border-t border-stone-200 flex items-center justify-end gap-2.5">
          <button
            type="button"
            disabled={isSaving}
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-stone-700 bg-white border border-stone-300 hover:bg-stone-100 rounded-xl cursor-pointer disabled:opacity-50"
          >
            منسوخ
          </button>
          <button
            type="button"
            disabled={isSaving || isProcessingFile}
            onClick={handleSave}
            className="px-5 py-2 text-xs font-bold text-white bg-emerald-800 hover:bg-emerald-900 rounded-xl shadow-xs transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-60"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-amber-300" />
                <span>محفوظ ہو رہا ہے...</span>
              </>
            ) : (
              <>
                <Check className="w-4 h-4 text-amber-300" />
                <span>محفوظ کریں (Save Logo)</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
