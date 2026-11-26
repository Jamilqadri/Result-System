import React, { useState } from 'react';
import { X, MessageSquareQuote, CheckCircle2, Send, AlertCircle, Phone, MapPin, Building, Sparkles } from 'lucide-react';
import { INDIAN_STATES_DISTRICTS } from '../../utils/indiaLocations';
import { submitFeedback, fetchCentralSheetUrl } from '../../utils/storage';

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  isEn?: boolean;
}

export const FeedbackModal: React.FC<FeedbackModalProps> = ({
  isOpen,
  onClose,
  isEn = false,
}) => {
  const statesList = Object.keys(INDIAN_STATES_DISTRICTS);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [selectedState, setSelectedState] = useState('Jharkhand');
  const [selectedDistrict, setSelectedDistrict] = useState(
    INDIAN_STATES_DISTRICTS['Jharkhand']?.[0] || 'Giridih'
  );
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);

  if (!isOpen) return null;

  const handleStateChange = (newState: string) => {
    setSelectedState(newState);
    const districts = INDIAN_STATES_DISTRICTS[newState] || [];
    setSelectedDistrict(districts[0] || '');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!name.trim()) {
      setErrorMsg(isEn ? 'Please enter your name.' : 'برائے مہربانی اپنا نام درج فرمائیں۔');
      return;
    }
    if (!selectedState) {
      setErrorMsg(isEn ? 'Please select your state.' : 'برائے مہربانی اپنی ریاست منتخب فرمائیں۔');
      return;
    }
    if (!selectedDistrict) {
      setErrorMsg(isEn ? 'Please select your district.' : 'برائے مہربانی اپنا ضلع منتخب فرمائیں۔');
      return;
    }
    if (!message.trim() || message.trim().length < 5) {
      setErrorMsg(
        isEn
          ? 'Please write your feedback or suggestion (at least 5 characters).'
          : 'برائے مہربانی اپنی رائے، تجویز یا فیڈ بیک تفصیل سے تحریر فرمائیں۔'
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await submitFeedback({
        name: name.trim(),
        phone: phone.trim(),
        state: selectedState,
        district: selectedDistrict,
        message: message.trim(),
      });

      if (res.success) {
        setIsSubmitted(true);
      } else {
        setErrorMsg(res.error || (isEn ? 'Submission failed. Please try again.' : 'ارسال میں کوئی خامی پیش آئی۔'));
      }
    } catch (err: any) {
      setErrorMsg(err.message || (isEn ? 'Network error occurred.' : 'نیٹ ورک کنکشن میں کوئی مسئلہ پیش آیا۔'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetAndClose = () => {
    setName('');
    setPhone('');
    setMessage('');
    setIsSubmitted(false);
    setErrorMsg('');
    onClose();
  };

  const availableDistricts = INDIAN_STATES_DISTRICTS[selectedState] || [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/65 backdrop-blur-xs font-sans overflow-y-auto"
      dir={isEn ? 'ltr' : 'rtl'}
    >
      <div className="bg-white rounded-3xl max-w-lg w-full p-5 sm:p-7 shadow-2xl border border-stone-200 animate-fade-in relative my-auto">
        {/* Close Button */}
        <button
          type="button"
          onClick={handleResetAndClose}
          className="absolute top-4 sm:top-5 left-4 sm:left-5 rtl:left-auto rtl:right-auto rtl:left-4 w-9 h-9 rounded-full bg-stone-100 hover:bg-stone-200 text-stone-600 flex items-center justify-center transition-colors cursor-pointer z-10"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>

        {isSubmitted ? (
          /* Success Screen */
          <div className="py-6 sm:py-8 text-center space-y-4">
            <div className="w-16 h-16 sm:w-20 sm:h-20 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center mx-auto shadow-inner">
              <CheckCircle2 className="w-10 h-10 sm:w-12 sm:h-12" />
            </div>
            <div className="space-y-1.5">
              <h3 className={`text-xl sm:text-2xl font-bold text-stone-900 ${isEn ? 'font-sans' : 'font-aslam text-2xl sm:text-3xl'}`}>
                {isEn ? 'Thank You for Your Feedback!' : 'جزاکم اللہ خیراً! آپ کی رائے موصول ہو گئی'}
              </h3>
              <p className="text-xs sm:text-sm text-stone-600 font-urdu max-w-sm mx-auto leading-relaxed">
                {isEn
                  ? 'Your suggestion has been recorded and submitted to the administration and State Manager.'
                  : 'آپ کی قیمتی تجویز اور فیڈ بیک معیارِ مدارس ایڈمن پینل اور متعلقہ صوبائی مینیجر کے ریکارڈ میں محفوظ کر لی گئی ہے۔'}
              </p>
            </div>
            <div className="pt-3">
              <button
                type="button"
                onClick={handleResetAndClose}
                className="py-2.5 px-6 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white font-bold text-xs sm:text-sm shadow-sm transition-all cursor-pointer"
              >
                {isEn ? 'Done' : 'ٹھیک ہے'}
              </button>
            </div>
          </div>
        ) : (
          /* Feedback Form */
          <div>
            {/* Header */}
            <div className="flex items-center gap-3 pb-3.5 mb-4 border-b border-stone-100 pe-10">
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-800 text-white flex items-center justify-center shadow-md shrink-0">
                <MessageSquareQuote className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h3 className={`text-lg sm:text-xl font-bold text-stone-900 leading-tight ${isEn ? 'font-sans' : 'font-aslam text-xl sm:text-2xl'}`}>
                  {isEn ? 'Suggestion & Feedback' : 'رائے، تجاویز و فیڈ بیک'}
                </h3>
                <p className="text-[11px] text-stone-500 font-urdu truncate mt-0.5">
                  {isEn
                    ? 'Help us improve the Meyar-e-Madaris platform'
                    : 'معیارِ مدارس امتحانی پورٹل کو مزید بہتر بنانے کے لیے اپنی رائے دیجیے'}
                </p>
              </div>
            </div>

            {errorMsg && (
              <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2.5 text-rose-800 text-xs font-urdu">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-3.5 font-urdu">
              {/* 1. Name */}
              <div>
                <label className="block text-xs font-bold text-stone-800 mb-1">
                  {isEn ? 'Your Name / Institution *' : 'آپ کا نام یا ادارے کا نام *'}
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={isEn ? 'e.g. Maulana Muhammad Rashid' : 'مثال: مولانا محمد ارشد / قاری عبد اللہ'}
                  className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-300 rounded-xl text-stone-900 text-xs sm:text-sm focus:bg-white focus:ring-2 focus:ring-emerald-600 focus:outline-none transition-all"
                />
              </div>

              {/* 2. Contact Phone (Optional) */}
              <div>
                <label className="block text-xs font-bold text-stone-800 mb-1 flex items-center justify-between">
                  <span>{isEn ? 'Mobile / WhatsApp Number (Optional)' : 'موبائل / واٹس ایپ نمبر (اختیاری)'}</span>
                  <span className="text-[10px] text-stone-400 font-sans">Optional</span>
                </label>
                <div className="relative">
                  <input
                    type="tel"
                    dir="ltr"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="e.g. 9876543210"
                    className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-300 rounded-xl text-stone-900 text-xs sm:text-sm font-mono focus:bg-white focus:ring-2 focus:ring-emerald-600 focus:outline-none transition-all pl-9"
                  />
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-stone-400">
                    <Phone className="w-4 h-4" />
                  </div>
                </div>
              </div>

              {/* 3. State & District Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* State Dropdown - All 28 States */}
                <div>
                  <label className="block text-xs font-bold text-stone-800 mb-1">
                    {isEn ? 'State (ریاست) *' : 'ریاست (State) *'}
                  </label>
                  <select
                    value={selectedState}
                    onChange={(e) => handleStateChange(e.target.value)}
                    className="w-full px-3 py-2.5 bg-stone-50 border border-stone-300 rounded-xl text-stone-900 text-xs sm:text-sm focus:bg-white focus:ring-2 focus:ring-emerald-600 focus:outline-none transition-all font-sans"
                  >
                    {statesList.map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>
                </div>

                {/* District Dropdown */}
                <div>
                  <label className="block text-xs font-bold text-stone-800 mb-1">
                    {isEn ? 'District (ضلع) *' : 'ضلع (District) *'}
                  </label>
                  <select
                    value={selectedDistrict}
                    onChange={(e) => setSelectedDistrict(e.target.value)}
                    className="w-full px-3 py-2.5 bg-stone-50 border border-stone-300 rounded-xl text-stone-900 text-xs sm:text-sm focus:bg-white focus:ring-2 focus:ring-emerald-600 focus:outline-none transition-all font-sans"
                  >
                    {availableDistricts.length > 0 ? (
                      availableDistricts.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))
                    ) : (
                      <option value="General">General / دیگر</option>
                    )}
                  </select>
                </div>
              </div>

              {/* 4. Message / Suggestion */}
              <div>
                <label className="block text-xs font-bold text-stone-800 mb-1">
                  {isEn ? 'Your Suggestion / Feedback *' : 'اپنی رائے، تجویز یا فیڈ بیک یہاں لکھیں *'}
                </label>
                <textarea
                  rows={4}
                  required
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder={
                    isEn
                      ? 'Write your valuable feedback, feature suggestion or query here...'
                      : 'معیارِ مدارس کے رزلٹ سسٹم، طلبہ مارک شیٹ، یا کسی سہولت کے متعلق اپنی مفید تجویز یا فیڈ بیک یہاں تحریر فرمائیں...'
                  }
                  className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-300 rounded-xl text-stone-900 text-xs sm:text-sm focus:bg-white focus:ring-2 focus:ring-emerald-600 focus:outline-none transition-all leading-relaxed"
                />
              </div>

              {/* Submit Button */}
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-700 via-emerald-800 to-teal-900 hover:from-emerald-600 hover:to-teal-800 text-white font-bold text-xs sm:text-sm shadow-md flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-60 active:scale-[0.99]"
                >
                  <Send className="w-4 h-4" />
                  <span>
                    {isSubmitting
                      ? (isEn ? 'Submitting...' : 'ارسال ہو رہا ہے...')
                      : (isEn ? 'Submit Feedback' : 'تجویز و فیڈ بیک ارسال کریں')}
                  </span>
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};
