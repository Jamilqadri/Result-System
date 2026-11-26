import React, { useState, useEffect } from 'react';
import {
  MessageSquareQuote,
  Search,
  Filter,
  CheckCircle2,
  Trash2,
  RefreshCw,
  Phone,
  MapPin,
  Calendar,
  AlertCircle,
  Eye,
  X,
  Send,
  MessageCircle,
  Clock,
  Sparkles,
} from 'lucide-react';
import { FeedbackSubmission } from '../../../types';
import { fetchFeedbacks, updateFeedbackStatus, deleteFeedback } from '../../../utils/storage';
import { INDIAN_STATES_DISTRICTS } from '../../../utils/indiaLocations';

interface FeedbackTabProps {
  isManagerView?: boolean;
  assignedState?: string | string[];
  isEn?: boolean;
}

export const FeedbackTab: React.FC<FeedbackTabProps> = ({
  isManagerView = false,
  assignedState,
  isEn = false,
}) => {
  const statesList = Object.keys(INDIAN_STATES_DISTRICTS);

  // Normalize manager assigned states
  const managerStates: string[] = Array.isArray(assignedState)
    ? assignedState
    : assignedState
    ? [assignedState]
    : [];

  const [feedbacks, setFeedbacks] = useState<FeedbackSubmission[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedStateFilter, setSelectedStateFilter] = useState<string>(
    isManagerView && managerStates.length > 0 ? managerStates[0] : 'all'
  );
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<'all' | 'unread' | 'read' | 'resolved'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFeedback, setActiveFeedback] = useState<FeedbackSubmission | null>(null);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const data = await fetchFeedbacks(
        isManagerView && selectedStateFilter !== 'all' ? selectedStateFilter : undefined
      );
      setFeedbacks(data || []);
    } catch (err) {
      console.warn('Failed to fetch feedbacks:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    const handleUpdate = () => {
      loadData();
    };
    window.addEventListener('meyar_feedback_updated', handleUpdate);
    return () => window.removeEventListener('meyar_feedback_updated', handleUpdate);
  }, [selectedStateFilter]);

  const handleMarkStatus = async (id: string, status: 'read' | 'resolved') => {
    const success = await updateFeedbackStatus(id, status);
    if (success) {
      setFeedbacks((prev) =>
        prev.map((f) => (f.id === id ? { ...f, status } : f))
      );
      if (activeFeedback && activeFeedback.id === id) {
        setActiveFeedback((prev) => (prev ? { ...prev, status } : null));
      }
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm(isEn ? 'Are you sure you want to delete this feedback?' : 'کیا آپ واقعی یہ فیڈ بیک حذف کرنا چاہتے ہیں؟')) {
      return;
    }
    const success = await deleteFeedback(id);
    if (success) {
      setFeedbacks((prev) => prev.filter((f) => f.id !== id));
      if (activeFeedback && activeFeedback.id === id) {
        setActiveFeedback(null);
      }
    }
  };

  // Filtered feedbacks
  const filteredFeedbacks = feedbacks.filter((f) => {
    // 1. Manager State Constraint
    if (isManagerView && managerStates.length > 0) {
      const matchesManager = managerStates.some(
        (st) => st.toLowerCase() === (f.state || '').toLowerCase()
      );
      if (!matchesManager) return false;
    } else if (selectedStateFilter !== 'all') {
      if ((f.state || '').toLowerCase() !== selectedStateFilter.toLowerCase()) {
        return false;
      }
    }

    // 2. Status Filter
    if (selectedStatusFilter !== 'all') {
      if (f.status !== selectedStatusFilter) return false;
    }

    // 3. Search Query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const matchName = (f.name || '').toLowerCase().includes(q);
      const matchDist = (f.district || '').toLowerCase().includes(q);
      const matchState = (f.state || '').toLowerCase().includes(q);
      const matchPhone = (f.phone || '').includes(q);
      const matchMsg = (f.message || '').toLowerCase().includes(q);
      return matchName || matchDist || matchState || matchPhone || matchMsg;
    }

    return true;
  });

  const unreadCount = feedbacks.filter((f) => f.status === 'unread').length;

  return (
    <div className="space-y-5 animate-fade-in font-urdu" dir="rtl">
      {/* 1. Header Banner */}
      <div className="bg-gradient-to-r from-emerald-900 via-teal-900 to-slate-900 text-white rounded-3xl p-5 sm:p-7 shadow-lg border border-emerald-800/40 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-amber-400/5 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-800/80 border border-emerald-700/50 text-[11px] font-bold text-emerald-200 shadow-2xs">
              <MessageSquareQuote className="w-3.5 h-3.5 text-amber-300" />
              <span>
                {isManagerView
                  ? `صوبائی تجاویز و فیڈ بیک پینل (${managerStates.join(', ') || 'مینیجر'})`
                  : 'مرکزی تجاویز و فیڈ بیک سسٹم (All Feedbacks)'}
              </span>
            </div>
            <h2 className={`text-xl sm:text-2xl font-bold tracking-tight text-white ${isEn ? 'font-sans' : 'font-aslam text-2xl sm:text-3xl'}`}>
              {isEn ? 'User Suggestions & Feedback' : 'موصولہ تجاویز، نوٹیفکیشنز و عوامی آراء'}
            </h2>
            <p className="text-xs text-emerald-100/90 max-w-2xl leading-relaxed">
              {isEn
                ? 'Review user suggestions, feedback, and issue reports submitted from the public portal.'
                : 'عوام، اساتذہ اور سرپرستوں کی طرف سے پورٹل کے متعلق موصول ہونے والی تجاویز، آراء اور نوٹسز کی مکمل تفصیلات۔'}
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {/* Unread Counter Badge */}
            <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl px-4 py-2.5 text-center shadow-xs">
              <span className="text-[10px] text-amber-200 block uppercase font-sans font-bold">
                نئی تجاویز
              </span>
              <span className="text-xl sm:text-2xl font-bold font-mono text-white leading-tight">
                {unreadCount}
              </span>
            </div>

            {/* Refresh Button */}
            <button
              onClick={loadData}
              disabled={isLoading}
              className="p-3 bg-emerald-800 hover:bg-emerald-700 text-white rounded-2xl border border-emerald-600/40 shadow-xs transition-all cursor-pointer disabled:opacity-60"
              title="تازہ کریں"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* 2. Filter & Search Controls */}
      <div className="bg-white rounded-2xl p-4 border border-stone-200 shadow-2xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Search Input */}
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="نام، ضلع، فون یا کی ورڈ سے تلاش کریں..."
              className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-300 rounded-xl text-stone-900 text-xs sm:text-sm focus:bg-white focus:ring-2 focus:ring-emerald-600 focus:outline-none transition-all pl-9"
            />
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-stone-400">
              <Search className="w-4 h-4" />
            </div>
          </div>

          {/* State Filter (Disabled/Locked for State Managers with single state) */}
          <div>
            <select
              value={selectedStateFilter}
              onChange={(e) => setSelectedStateFilter(e.target.value)}
              disabled={isManagerView && managerStates.length <= 1}
              className="w-full px-3 py-2.5 bg-stone-50 border border-stone-300 rounded-xl text-stone-900 text-xs sm:text-sm focus:bg-white focus:ring-2 focus:ring-emerald-600 focus:outline-none transition-all font-sans cursor-pointer disabled:opacity-75"
            >
              {!isManagerView && <option value="all">تمام ریاستیں (All States)</option>}
              {isManagerView && managerStates.length > 1 && (
                <option value="all">تمام تفویض کردہ ریاستیں</option>
              )}
              {(isManagerView ? managerStates : statesList).map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <select
              value={selectedStatusFilter}
              onChange={(e) => setSelectedStatusFilter(e.target.value as any)}
              className="w-full px-3 py-2.5 bg-stone-50 border border-stone-300 rounded-xl text-stone-900 text-xs sm:text-sm focus:bg-white focus:ring-2 focus:ring-emerald-600 focus:outline-none transition-all cursor-pointer"
            >
              <option value="all">تمام حالتیں (All Status)</option>
              <option value="unread">صرف غیر پڑھے ہوئے (Unread)</option>
              <option value="read">پڑھے ہوئے (Read)</option>
              <option value="resolved">حل شدہ (Resolved)</option>
            </select>
          </div>
        </div>

        {/* Quick status tabs */}
        <div className="flex items-center gap-2 pt-1 border-t border-stone-100 flex-wrap">
          <span className="text-xs text-stone-500 font-bold">فوری فلٹر:</span>
          <button
            onClick={() => setSelectedStatusFilter('all')}
            className={`px-3 py-1 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
              selectedStatusFilter === 'all'
                ? 'bg-emerald-800 text-white'
                : 'bg-stone-100 hover:bg-stone-200 text-stone-700'
            }`}
          >
            کل تجاویز ({feedbacks.length})
          </button>
          <button
            onClick={() => setSelectedStatusFilter('unread')}
            className={`px-3 py-1 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
              selectedStatusFilter === 'unread'
                ? 'bg-amber-500 text-white'
                : 'bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100'
            }`}
          >
            نئی / غیر پڑھا ہوا ({unreadCount})
          </button>
          <button
            onClick={() => setSelectedStatusFilter('resolved')}
            className={`px-3 py-1 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
              selectedStatusFilter === 'resolved'
                ? 'bg-teal-700 text-white'
                : 'bg-teal-50 text-teal-800 border border-teal-200 hover:bg-teal-100'
            }`}
          >
            حل شدہ ({feedbacks.filter((f) => f.status === 'resolved').length})
          </button>
        </div>
      </div>

      {/* 3. Feedbacks List in Chronological Order */}
      <div className="space-y-3">
        {filteredFeedbacks.length === 0 ? (
          <div className="bg-white rounded-3xl p-8 sm:p-12 text-center border border-stone-200 shadow-2xs space-y-3">
            <div className="w-16 h-16 bg-stone-100 text-stone-400 rounded-full flex items-center justify-center mx-auto">
              <MessageSquareQuote className="w-8 h-8" />
            </div>
            <h3 className="text-base sm:text-lg font-bold text-stone-800">
              کوئی تجویز یا فیڈ بیک ریکارڈ نہیں ملا
            </h3>
            <p className="text-xs sm:text-sm text-stone-500 max-w-sm mx-auto">
              {searchQuery || selectedStateFilter !== 'all' || selectedStatusFilter !== 'all'
                ? 'منتخب کردہ فلٹر کے مطابق کوئی نتیجہ دستیاب نہیں ہے۔'
                : 'فی الوقت اس زمرے میں کوئی فیڈ بیک موصول نہیں ہوا ہے۔ پورٹل پر جمع ہونے والے فیڈ بیک یہاں ترتیب سے نظر آئیں گے۔'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {filteredFeedbacks.map((f, idx) => {
              const isUnread = f.status === 'unread';
              const isResolved = f.status === 'resolved';

              return (
                <div
                  key={f.id}
                  className={`bg-white rounded-2xl p-4 sm:p-5 border transition-all shadow-2xs hover:shadow-xs ${
                    isUnread
                      ? 'border-amber-300/80 bg-amber-50/20 ring-1 ring-amber-300/30'
                      : isResolved
                      ? 'border-teal-200 bg-teal-50/10'
                      : 'border-stone-200'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    {/* Left/Top Meta: Name, State, District, Date */}
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {/* Serial Badge */}
                        <span className="w-6 h-6 rounded-lg bg-stone-100 text-stone-700 font-mono text-xs font-bold flex items-center justify-center">
                          {idx + 1}
                        </span>

                        {/* Name */}
                        <h4 className="font-bold text-base text-stone-900">
                          {f.name}
                        </h4>

                        {/* Status Badge */}
                        <span
                          className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${
                            isUnread
                              ? 'bg-amber-100 text-amber-900 border border-amber-300'
                              : isResolved
                              ? 'bg-teal-100 text-teal-800 border border-teal-300'
                              : 'bg-stone-100 text-stone-600'
                          }`}
                        >
                          {isUnread ? 'نیا / غیر پڑھا ہوا' : isResolved ? 'حل شدہ' : 'پڑھا گیا'}
                        </span>

                        {/* State & District Tag */}
                        <span className="inline-flex items-center gap-1 text-[11px] font-sans font-bold px-2 py-0.5 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-lg">
                          <MapPin className="w-3 h-3 text-emerald-600" />
                          <span>
                            {f.district ? `${f.district}, ` : ''}
                            {f.state}
                          </span>
                        </span>
                      </div>

                      {/* Contact & Date */}
                      <div className="flex items-center gap-4 text-xs text-stone-500 font-sans flex-wrap">
                        {f.phone && (
                          <a
                            href={`tel:${f.phone}`}
                            className="inline-flex items-center gap-1 text-emerald-700 hover:text-emerald-800 font-mono font-semibold"
                            dir="ltr"
                          >
                            <Phone className="w-3 h-3" />
                            <span>{f.phone}</span>
                          </a>
                        )}

                        <span className="inline-flex items-center gap-1 font-sans text-stone-400">
                          <Clock className="w-3 h-3" />
                          <span>{f.dateFormatted || new Date(f.createdAt).toLocaleString()}</span>
                        </span>
                      </div>

                      {/* Feedback Message Content */}
                      <div className="p-3 bg-stone-50 rounded-xl border border-stone-200/80 text-xs sm:text-sm text-stone-800 leading-relaxed font-urdu whitespace-pre-wrap mt-2">
                        {f.message}
                      </div>
                    </div>

                    {/* Right/Bottom Action Buttons */}
                    <div className="flex sm:flex-col items-center gap-2 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-stone-100">
                      {f.phone && (
                        <a
                          href={`https://wa.me/91${f.phone.replace(/\D/g, '').slice(-10)}?text=${encodeURIComponent(
                            `السلام علیکم ${f.name} صاحب! معیارِ مدارس پورٹل پر آپ کی بھیجی گئی رائے و تجویز کے سلسلے میں:`
                          )}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                          title="واٹس ایپ پر رابطہ کریں"
                        >
                          <MessageCircle className="w-3.5 h-3.5" />
                          <span>WhatsApp</span>
                        </a>
                      )}

                      {isUnread && (
                        <button
                          onClick={() => handleMarkStatus(f.id, 'read')}
                          className="px-3 py-1.5 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer"
                          title="پڑھا ہوا نشان زد کریں"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5 text-stone-500" />
                          <span>پڑھا ہوا</span>
                        </button>
                      )}

                      {!isResolved && (
                        <button
                          onClick={() => handleMarkStatus(f.id, 'resolved')}
                          className="px-3 py-1.5 rounded-xl bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer"
                          title="حل شدہ نشان زد کریں"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5 text-teal-600" />
                          <span>حل شدہ</span>
                        </button>
                      )}

                      <button
                        onClick={() => handleDelete(f.id)}
                        className="px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer"
                        title="حذف کریں"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                        <span>حذف</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
