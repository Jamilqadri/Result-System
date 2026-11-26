import React, { useState, useEffect, useRef } from 'react';
import { PortalLaunchTimer } from '../../types';
import { Sparkles, Clock, Calendar, CheckCircle2, Award, ArrowLeft, LogIn, Volume2, VolumeX, X } from 'lucide-react';

interface LaunchCountdownModalProps {
  timer: PortalLaunchTimer;
  onLaunchComplete?: () => void;
  onOpenLogin?: () => void;
  isPreview?: boolean;
  onClosePreview?: () => void;
}

interface TimeRemaining {
  total: number;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

function calculateTimeRemaining(targetDateStr: string): TimeRemaining {
  const target = new Date(targetDateStr).getTime();
  const now = Date.now();
  const diff = target - now;

  if (diff <= 0) {
    return { total: 0, days: 0, hours: 0, minutes: 0, seconds: 0 };
  }

  const seconds = Math.floor((diff / 1000) % 60);
  const minutes = Math.floor((diff / 1000 / 60) % 60);
  const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  return { total: diff, days, hours, minutes, seconds };
}

export const LaunchCountdownModal: React.FC<LaunchCountdownModalProps> = ({
  timer,
  onLaunchComplete,
  onOpenLogin,
  isPreview = false,
  onClosePreview,
}) => {
  const [remaining, setRemaining] = useState<TimeRemaining>(() => calculateTimeRemaining(timer.targetDate));
  const [hasLaunched, setHasLaunched] = useState<boolean>(Boolean(timer.isLaunched));
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameId = useRef<number | null>(null);

  // Live timer tick
  useEffect(() => {
    if (hasLaunched && !isPreview) return;

    const interval = setInterval(() => {
      const rem = calculateTimeRemaining(timer.targetDate);
      setRemaining(rem);

      if (rem.total <= 0 && !hasLaunched) {
        setHasLaunched(true);
        triggerCelebration();
        if (onLaunchComplete) onLaunchComplete();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [timer.targetDate, hasLaunched, isPreview, onLaunchComplete]);

  // If preview mode, trigger celebration if requested
  useEffect(() => {
    if (isPreview && hasLaunched) {
      triggerCelebration();
    }
  }, [isPreview, hasLaunched]);

  // Canvas confetti animation engine
  const triggerCelebration = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    interface Particle {
      x: number;
      y: number;
      r: number;
      d: number;
      color: string;
      tilt: number;
      tiltAngle: number;
      tiltAngleIncremental: number;
    }

    const colors = ['#f59e0b', '#10b981', '#065f46', '#fbbf24', '#3b82f6', '#ec4899', '#8b5cf6'];
    const particles: Particle[] = [];
    const count = 120;

    for (let i = 0; i < count; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height - canvas.height,
        r: Math.random() * 8 + 4,
        d: Math.random() * count + 10,
        color: colors[Math.floor(Math.random() * colors.length)],
        tilt: Math.floor(Math.random() * 10) - 10,
        tiltAngle: 0,
        tiltAngleIncremental: (Math.random() * 0.07) + 0.05,
      });
    }

    let animationSteps = 0;
    const maxSteps = 240; // ~4-5 seconds

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      animationSteps++;

      particles.forEach((p) => {
        p.tiltAngle += p.tiltAngleIncremental;
        p.y += (Math.cos(p.d) + 3 + p.r / 2) / 1.5;
        p.x += Math.sin(p.d);
        p.tilt = Math.sin(p.tiltAngle) * 15;

        ctx.beginPath();
        ctx.lineWidth = p.r / 2;
        ctx.strokeStyle = p.color;
        ctx.fillStyle = p.color;
        ctx.arc(p.x, p.y, p.r / 2, 0, Math.PI * 2, false);
        ctx.fill();
      });

      if (animationSteps < maxSteps) {
        animFrameId.current = requestAnimationFrame(draw);
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    };

    draw();
  };

  const handleManualLaunchNow = () => {
    setHasLaunched(true);
    triggerCelebration();
    if (onLaunchComplete) onLaunchComplete();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-950/75 backdrop-blur-md animate-fade-in font-urdu select-none">
      <canvas ref={canvasRef} className="pointer-events-none fixed inset-0 z-50" />

      <div className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-amber-300/60 overflow-hidden flex flex-col text-right">
        {/* Header Ribbon */}
        <div className="bg-gradient-to-r from-emerald-950 via-emerald-900 to-teal-950 text-white p-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-amber-400/10 rounded-full blur-2xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-32 h-32 bg-emerald-400/10 rounded-full blur-2xl pointer-events-none" />

          {isPreview && onClosePreview && (
            <button
              onClick={onClosePreview}
              className="absolute top-4 left-4 p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
              title="بند کریں"
            >
              <X className="w-5 h-5" />
            </button>
          )}

          <div className="flex items-center gap-2 mb-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-400/20 text-amber-300 text-xs font-bold border border-amber-400/30">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping inline-block" />
              <span>{hasLaunched ? '🎉 باضابطہ افتتاح مکمل!' : '⏱️ لائیو افتتاحی کاؤنٹ ڈاؤن'}</span>
            </span>
          </div>

          <h2 className="text-xl sm:text-2xl font-black text-amber-300 leading-snug">
            {timer.title || 'معیارِ مدارس — امتحانی نتائج کا باضابطہ افتتاح'}
          </h2>
          <p className="text-xs sm:text-sm text-emerald-100/90 mt-1.5 leading-relaxed">
            {timer.message || 'ان شاء اللہ جلد ہی سالانہ امتحانی نتائج اور تعلیمی ریکارڈز کا لائیو اجرا ہوگا۔'}
          </p>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-6">
          {!hasLaunched ? (
            <>
              {/* Countdown Grid (Cards for Days, Hours, Minutes, Seconds) */}
              <div className="grid grid-cols-4 gap-2.5 text-center">
                {/* Days */}
                <div className="bg-gradient-to-b from-stone-50 to-stone-100 p-3 rounded-2xl border border-stone-200 shadow-2xs">
                  <div className="text-2xl sm:text-3xl font-black font-mono text-emerald-950">
                    {String(remaining.days).padStart(2, '0')}
                  </div>
                  <div className="text-[11px] font-bold text-stone-600 mt-1">دن</div>
                </div>

                {/* Hours */}
                <div className="bg-gradient-to-b from-stone-50 to-stone-100 p-3 rounded-2xl border border-stone-200 shadow-2xs">
                  <div className="text-2xl sm:text-3xl font-black font-mono text-emerald-950">
                    {String(remaining.hours).padStart(2, '0')}
                  </div>
                  <div className="text-[11px] font-bold text-stone-600 mt-1">گھنٹے</div>
                </div>

                {/* Minutes */}
                <div className="bg-gradient-to-b from-stone-50 to-stone-100 p-3 rounded-2xl border border-stone-200 shadow-2xs">
                  <div className="text-2xl sm:text-3xl font-black font-mono text-emerald-950">
                    {String(remaining.minutes).padStart(2, '0')}
                  </div>
                  <div className="text-[11px] font-bold text-stone-600 mt-1">منٹ</div>
                </div>

                {/* Seconds */}
                <div className="bg-gradient-to-b from-amber-50 to-amber-100/60 p-3 rounded-2xl border border-amber-300 shadow-2xs">
                  <div className="text-2xl sm:text-3xl font-black font-mono text-amber-700 animate-pulse">
                    {String(remaining.seconds).padStart(2, '0')}
                  </div>
                  <div className="text-[11px] font-bold text-amber-800 mt-1">سیکنڈ</div>
                </div>
              </div>

              {/* Target Date Note */}
              <div className="p-3 bg-stone-50 rounded-2xl border border-stone-200/80 flex items-center justify-between text-xs text-stone-600">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-emerald-700 shrink-0" />
                  <span>مقررہ وقت:</span>
                </div>
                <span className="font-mono font-bold text-stone-800 text-[11px]" dir="ltr">
                  {new Date(timer.targetDate).toLocaleString('ur-PK', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                </span>
              </div>
            </>
          ) : (
            /* Celebration Card */
            <div className="text-center py-4 space-y-3">
              <div className="w-16 h-16 mx-auto rounded-3xl bg-amber-100 border-2 border-amber-400 text-amber-800 flex items-center justify-center text-3xl shadow-lg animate-bounce">
                🎊
              </div>
              <h3 className="text-xl font-black text-stone-900">
                مبارک ہو! پورٹل لائیو ہو چکا ہے
              </h3>
              <p className="text-xs text-stone-600 max-w-sm mx-auto leading-relaxed">
                معیارِ مدارس کا باضابطہ افتتاح مکمل ہو گیا۔ اب تمام طلبہ، سرپرست اور مدارس نتائج و رزلٹ کارڈز ملاحظہ فرما سکتے ہیں۔
              </p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="pt-2 flex flex-col gap-2.5">
            {hasLaunched ? (
              <button
                type="button"
                onClick={() => {
                  if (onClosePreview) onClosePreview();
                  if (onLaunchComplete) onLaunchComplete();
                }}
                className="w-full py-3 px-4 bg-emerald-800 hover:bg-emerald-900 text-white rounded-2xl font-bold text-sm shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <Sparkles className="w-4 h-4 text-amber-300" />
                <span>نتائج پورٹل میں داخل ہوں</span>
              </button>
            ) : (
              <>
                {onOpenLogin && (
                  <button
                    type="button"
                    onClick={onOpenLogin}
                    className="w-full py-2.5 px-4 bg-stone-100 hover:bg-stone-200 text-stone-800 rounded-2xl font-bold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer border border-stone-200"
                  >
                    <LogIn className="w-4 h-4 text-emerald-800" />
                    <span>ایڈمن و پرنسپل لاگ ان (Staff Access)</span>
                  </button>
                )}

                {isPreview && (
                  <button
                    type="button"
                    onClick={handleManualLaunchNow}
                    className="w-full py-2.5 px-4 bg-amber-500 hover:bg-amber-600 text-stone-950 rounded-2xl font-bold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm"
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>ابھی فوری لانچ کا مظاہرہ کریں (Simulate Launch Now)</span>
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
