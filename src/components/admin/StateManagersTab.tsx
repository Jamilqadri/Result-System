/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { StateManager, Madrasa } from '../../types';
import { fetchStateManagers, saveStateManager, deleteStateManager, getDeletedMadrasaIds } from '../../utils/storage';
import { INDIAN_STATES_DISTRICTS } from '../../utils/indiaLocations';
import {
  Users,
  UserCheck,
  Plus,
  Trash2,
  Edit,
  ShieldCheck,
  KeyRound,
  Phone,
  Mail,
  MapPin,
  Check,
  X,
  AlertCircle,
  Copy,
  CheckCheck,
  Building2,
  Trophy,
  Medal,
  Award,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Percent,
  BarChart3,
  ExternalLink,
  Clock,
  Sparkles,
} from 'lucide-react';

interface StateManagersTabProps {
  madaris: Madrasa[];
  isEn?: boolean;
  initialOpenAddModal?: boolean;
}

const COMMON_STATES = [
  'Jharkhand',
  'Bihar',
  'Uttar Pradesh',
  'West Bengal',
  'Delhi',
  'Maharashtra',
  'Madhya Pradesh',
  'Rajasthan',
  'Odisha',
  'Assam',
  'Gujarat',
  'Karnataka',
  'Telangana',
  'Andhra Pradesh',
  'Tamil Nadu',
  'Kerala',
  'Punjab',
  'Haryana',
  'Uttarakhand',
  'Chhattisgarh',
];

const STATE_CANONICAL_MAP: { [key: string]: { en: string; ur: string } } = {
  'jharkhand': { en: 'Jharkhand', ur: 'جھارکھنڈ' },
  'جھارکھنڈ': { en: 'Jharkhand', ur: 'جھارکھنڈ' },
  'bihar': { en: 'Bihar', ur: 'بہار' },
  'بہار': { en: 'Bihar', ur: 'بہار' },
  'uttar pradesh': { en: 'Uttar Pradesh', ur: 'اتر پردیش' },
  'up': { en: 'Uttar Pradesh', ur: 'اتر پردیش' },
  'یوپی': { en: 'Uttar Pradesh', ur: 'اتر پردیش' },
  'اتر پردیش': { en: 'Uttar Pradesh', ur: 'اتر پردیش' },
  'west bengal': { en: 'West Bengal', ur: 'مغربی بنگال' },
  'wb': { en: 'West Bengal', ur: 'مغربی بنگال' },
  'مغربی بنگال': { en: 'West Bengal', ur: 'مغربی بنگال' },
  'بنگال': { en: 'West Bengal', ur: 'مغربی بنگال' },
  'delhi': { en: 'Delhi', ur: 'دہلی' },
  'دہلی': { en: 'Delhi', ur: 'دہلی' },
  'maharashtra': { en: 'Maharashtra', ur: 'مہاراشٹر' },
  'مہاراشٹر': { en: 'Maharashtra', ur: 'مہاراشٹر' },
  'madhya pradesh': { en: 'Madhya Pradesh', ur: 'مدھیہ پردیش' },
  'mp': { en: 'Madhya Pradesh', ur: 'مدھیہ پردیش' },
  'مدھیہ پردیش': { en: 'Madhya Pradesh', ur: 'مدھیہ پردیش' },
  'rajasthan': { en: 'Rajasthan', ur: 'راجستھان' },
  'راجستھان': { en: 'Rajasthan', ur: 'راجستھان' },
  'odisha': { en: 'Odisha', ur: 'اوڈیشہ' },
  'orissa': { en: 'Odisha', ur: 'اوڈیشہ' },
  'اوڈیشہ': { en: 'Odisha', ur: 'اوڈیشہ' },
  'assam': { en: 'Assam', ur: 'آسام' },
  'آسام': { en: 'Assam', ur: 'آسام' },
  'gujarat': { en: 'Gujarat', ur: 'گجرات' },
  'گجرات': { en: 'Gujarat', ur: 'گجرات' },
  'karnataka': { en: 'Karnataka', ur: 'کرناٹک' },
  'کرناٹک': { en: 'Karnataka', ur: 'کرناٹک' },
  'telangana': { en: 'Telangana', ur: 'تلنگانہ' },
  'تلنگانہ': { en: 'Telangana', ur: 'تلنگانہ' },
};

function getCanonicalState(rawState: string | undefined | null): { en: string; ur: string } {
  if (!rawState) return { en: 'Other', ur: 'دیگر' };
  const cleaned = rawState.trim().toLowerCase();
  if (STATE_CANONICAL_MAP[cleaned]) return STATE_CANONICAL_MAP[cleaned];
  for (const [k, v] of Object.entries(STATE_CANONICAL_MAP)) {
    if (cleaned.includes(k) || k.includes(cleaned)) return v;
  }
  return { en: rawState.trim(), ur: rawState.trim() };
}

export const StateManagersTab: React.FC<StateManagersTabProps> = ({
  madaris,
  isEn = false,
  initialOpenAddModal = false,
}) => {
  // Main view option: 'managers' (مینیجرز) | 'states' (اسٹیٹ)
  const [activeSubTab, setActiveSubTab] = useState<'managers' | 'states'>('managers');

  const [managers, setManagers] = useState<StateManager[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Manager Profile Modal state (جب کسی مینیجر کو ٹچ کریں گے تو اس کی تفصیل کھلے گی)
  const [selectedManagerForProfile, setSelectedManagerForProfile] = useState<StateManager | null>(null);

  // State Drilldown state for Leaderboard (جب اسٹیٹ کو ٹچ کریں گے تو اس کے اضلاع کھلیں گے)
  const [selectedStateForDistricts, setSelectedStateForDistricts] = useState<{ en: string; ur: string } | null>(null);

  // Add / Edit Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [selectedStates, setSelectedStates] = useState<string[]>(['Jharkhand']);
  const [status, setStatus] = useState<'active' | 'inactive'>('active');
  const [isSaving, setIsSaving] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const loadManagers = async () => {
    setIsLoading(true);
    try {
      const data = await fetchStateManagers();
      setManagers(data);
    } catch {
      // Local fallback
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadManagers();
    if (initialOpenAddModal) {
      openAddModal();
    }
  }, [initialOpenAddModal]);

  const openAddModal = () => {
    setEditingId(null);
    setName('');
    const randomNum = Math.floor(100 + Math.random() * 900);
    setUsername(`SM${randomNum}`);
    setPassword(`SM${randomNum}@2026`);
    setPhone('');
    setEmail('');
    setSelectedStates(['Jharkhand']);
    setStatus('active');
    setErrorMsg('');
    setIsModalOpen(true);
  };

  const openEditModal = (mgr: StateManager) => {
    setEditingId(mgr.id);
    setName(mgr.name);
    setUsername(mgr.username);
    setPassword(mgr.password);
    setPhone(mgr.phone || '');
    setEmail(mgr.email || '');
    setSelectedStates(mgr.assignedStates || ['Jharkhand']);
    setStatus(mgr.status || 'active');
    setErrorMsg('');
    setIsModalOpen(true);
  };

  const handleCopyCredentials = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setSuccessMsg(`لاگ ان معلومات کاپی ہو گئیں: ${text}`);
    setTimeout(() => {
      setCopiedId(null);
      setSuccessMsg('');
    }, 2500);
  };

  const toggleStateSelection = (stateName: string) => {
    if (selectedStates.includes(stateName)) {
      if (selectedStates.length <= 1) {
        setErrorMsg('کم از کم ایک ریاست کا انتخاب ضروری ہے');
        return;
      }
      setSelectedStates(selectedStates.filter((s) => s !== stateName));
    } else {
      setSelectedStates([...selectedStates, stateName]);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setErrorMsg('مینیجر کا نام درج کرنا ضروری ہے');
      return;
    }
    if (!username.trim()) {
      setErrorMsg('یوزر نیم درج کرنا ضروری ہے');
      return;
    }
    if (!password.trim() || password.trim().length < 4) {
      setErrorMsg('پاسورڈ کم از کم 4 حروف پر مشتمل ہونا چاہیے');
      return;
    }
    if (selectedStates.length === 0) {
      setErrorMsg('کم از کم ایک ریاست کا انتخاب ضروری ہے');
      return;
    }

    setIsSaving(true);
    setErrorMsg('');

    try {
      const payload: Partial<StateManager> = {
        name: name.trim(),
        username: username.trim().toUpperCase(),
        password: password.trim(),
        phone: phone.trim(),
        email: email.trim(),
        assignedStates: selectedStates,
        status,
      };
      if (editingId) {
        payload.id = editingId;
      }

      const res = await saveStateManager(payload);
      if (res.success && Array.isArray(res.managers)) {
        setManagers(res.managers);
        setIsModalOpen(false);
        setSuccessMsg(editingId ? 'مینیجر کی تفصیلات اپ ڈیٹ ہو گئیں' : 'نیا اسٹیٹ مینیجر کامیابی سے شامل ہو گیا');
        setTimeout(() => setSuccessMsg(''), 3500);

        // If this manager was open in profile modal, update profile state
        if (selectedManagerForProfile && (selectedManagerForProfile.id === editingId || selectedManagerForProfile.username === payload.username)) {
          const updatedTarget = res.managers.find((m) => m.id === editingId || m.username === payload.username);
          if (updatedTarget) setSelectedManagerForProfile(updatedTarget);
        }
      } else {
        setErrorMsg(res.error || 'محفوظ کرنے میں مسئلہ پیش آیا');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'نیٹ ورک خرابی');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (mgr: StateManager) => {
    if (!window.confirm(`کیا آپ واقعی مینیجر "${mgr.name}" (${mgr.username}) کو حذف کرنا چاہتے ہیں؟`)) {
      return;
    }

    try {
      const res = await deleteStateManager(mgr.id);
      if (res.success && Array.isArray(res.managers)) {
        setManagers(res.managers);
        if (selectedManagerForProfile?.id === mgr.id) {
          setSelectedManagerForProfile(null);
        }
        setSuccessMsg(`مینیجر "${mgr.name}" کو کامیابی سے حذف کر دیا گیا`);
        setTimeout(() => setSuccessMsg(''), 3500);
      } else {
        alert(res.error || 'حذف کرنے میں خرابی پیش آئی');
      }
    } catch (err: any) {
      alert('نیٹ ورک خرابی: ' + err.message);
    }
  };

  // Filter out any deleted madaris
  const activeMadaris = useMemo(() => {
    const deleted = new Set(getDeletedMadrasaIds().map((s) => s.toLowerCase().trim()));
    return madaris.filter(
      (m) =>
        m &&
        m.id &&
        !deleted.has(String(m.id).toLowerCase().trim()) &&
        !deleted.has(String(m.code || '').toLowerCase().trim())
    );
  }, [madaris]);

  // Total active madaris registrations
  const totalRegistrations = activeMadaris.length;

  // Compute States Leaderboard Data
  const statesLeaderboard = useMemo(() => {
    const stateMap = new Map<
      string,
      {
        canonical: { en: string; ur: string };
        madaris: Madrasa[];
        approvedCount: number;
        pendingCount: number;
      }
    >();

    activeMadaris.forEach((m) => {
      const canonical = getCanonicalState(m.state || m.address);
      const key = canonical.en.toLowerCase();
      if (!stateMap.has(key)) {
        stateMap.set(key, {
          canonical,
          madaris: [],
          approvedCount: 0,
          pendingCount: 0,
        });
      }
      const item = stateMap.get(key)!;
      item.madaris.push(m);
      if (m.registrationStatus === 'approved' || m.managerVerified) {
        item.approvedCount++;
      } else {
        item.pendingCount++;
      }
    });

    // Also include any COMMON_STATES that have 0 registrations so admin sees complete picture
    COMMON_STATES.forEach((st) => {
      const key = st.toLowerCase();
      if (!stateMap.has(key)) {
        stateMap.set(key, {
          canonical: getCanonicalState(st),
          madaris: [],
          approvedCount: 0,
          pendingCount: 0,
        });
      }
    });

    // Convert to array and sort descending by registration count
    const list = Array.from(stateMap.values()).map((entry) => {
      const count = entry.madaris.length;
      const pct = totalRegistrations > 0 ? (count / totalRegistrations) * 100 : 0;

      // Find assigned managers for this state
      const assignedMgrs = managers.filter((mgr) =>
        (mgr.assignedStates || []).some(
          (s) => s.toLowerCase() === entry.canonical.en.toLowerCase() || s.toLowerCase() === entry.canonical.ur.toLowerCase()
        )
      );

      return {
        ...entry,
        count,
        percentage: pct,
        assignedManagers: assignedMgrs,
      };
    });

    // Sort descending by count, then alphabetically
    return list.sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.canonical.en.localeCompare(b.canonical.en);
    });
  }, [activeMadaris, totalRegistrations, managers]);

  // Compute District Leaderboard Data for a selected state
  const selectedStateDistrictsLeaderboard = useMemo(() => {
    if (!selectedStateForDistricts) return [];

    const stateEntry = statesLeaderboard.find(
      (s) => s.canonical.en.toLowerCase() === selectedStateForDistricts.en.toLowerCase()
    );

    const stateMadaris = stateEntry ? stateEntry.madaris : [];
    const stateTotal = stateMadaris.length;

    const districtMap = new Map<
      string,
      {
        name: string;
        madaris: Madrasa[];
        approvedCount: number;
        pendingCount: number;
      }
    >();

    stateMadaris.forEach((m) => {
      let distName = (m.district || '').trim();
      if (!distName) {
        distName = 'نامعلوم ضلع (Unspecified)';
      }
      const key = distName.toLowerCase();
      if (!districtMap.has(key)) {
        districtMap.set(key, {
          name: distName,
          madaris: [],
          approvedCount: 0,
          pendingCount: 0,
        });
      }
      const item = districtMap.get(key)!;
      item.madaris.push(m);
      if (m.registrationStatus === 'approved' || m.managerVerified) {
        item.approvedCount++;
      } else {
        item.pendingCount++;
      }
    });

    // Also include official districts of this state from INDIAN_STATES_DISTRICTS
    const officialDistricts = INDIAN_STATES_DISTRICTS[selectedStateForDistricts.en] || [];
    officialDistricts.forEach((dist) => {
      const key = dist.toLowerCase();
      if (!districtMap.has(key)) {
        districtMap.set(key, {
          name: dist,
          madaris: [],
          approvedCount: 0,
          pendingCount: 0,
        });
      }
    });

    const list = Array.from(districtMap.values()).map((entry) => {
      const count = entry.madaris.length;
      const pct = stateTotal > 0 ? (count / stateTotal) * 100 : 0;
      return {
        ...entry,
        count,
        percentage: pct,
      };
    });

    return list.sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.name.localeCompare(b.name);
    });
  }, [selectedStateForDistricts, statesLeaderboard]);

  return (
    <div className="space-y-5 animate-fade-in">
      {/* ------------------------------------------------------------- */}
      {/* 1. TOP HEADER & MAIN TOGGLE OPTIONS: مینیجرز | اسٹیٹ */}
      {/* ------------------------------------------------------------- */}
      <div className="bg-white rounded-3xl p-4 sm:p-5 border border-stone-200/90 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {/* Two Options / Segmented Control */}
        <div className="flex items-center gap-1.5 p-1 bg-stone-100 rounded-2xl border border-stone-200/80">
          {/* Option 1: مینیجرز (Managers) */}
          <button
            type="button"
            onClick={() => {
              setActiveSubTab('managers');
              setSelectedStateForDistricts(null);
            }}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
              activeSubTab === 'managers'
                ? 'bg-emerald-800 text-white shadow-xs scale-102'
                : 'text-stone-600 hover:text-stone-900 hover:bg-stone-200/60'
            }`}
          >
            <Users className="w-4 h-4 text-amber-300" />
            <span>{isEn ? 'Managers' : 'مینیجرز'}</span>
            <span
              className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded-full ${
                activeSubTab === 'managers'
                  ? 'bg-emerald-950/40 text-amber-300'
                  : 'bg-stone-200 text-stone-700'
              }`}
            >
              {managers.length}
            </span>
          </button>

          {/* Option 2: اسٹیٹ (States Leaderboard) */}
          <button
            type="button"
            onClick={() => {
              setActiveSubTab('states');
            }}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
              activeSubTab === 'states'
                ? 'bg-emerald-800 text-white shadow-xs scale-102'
                : 'text-stone-600 hover:text-stone-900 hover:bg-stone-200/60'
            }`}
          >
            <Trophy className="w-4 h-4 text-amber-300" />
            <span>{isEn ? 'States Leaderboard' : 'اسٹیٹ (لیڈر بورڈ)'}</span>
            <span
              className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded-full ${
                activeSubTab === 'states'
                  ? 'bg-emerald-950/40 text-amber-300'
                  : 'bg-stone-200 text-stone-700'
              }`}
            >
              {statesLeaderboard.filter((s) => s.count > 0).length} فعال
            </span>
          </button>
        </div>

        {/* Action Button: Add Manager */}
        <button
          type="button"
          onClick={openAddModal}
          className="px-4 py-2.5 rounded-2xl bg-amber-400 hover:bg-amber-300 text-emerald-950 text-xs font-bold font-mono tracking-wide flex items-center justify-center gap-2 cursor-pointer shadow-xs transition-all hover:scale-103 shrink-0 self-start sm:self-auto"
        >
          <Plus className="w-4 h-4 text-emerald-950" />
          <span>{isEn ? '+ Add New Manager' : '+ نیا مینیجر شامل کریں'}</span>
        </button>
      </div>

      {successMsg && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-300 rounded-2xl text-emerald-900 text-xs flex items-center gap-2 font-urdu shadow-2xs">
          <CheckCheck className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 2. OPTION 1: مینیجرز کی فہرست (MANAGERS LIST VIEW) */}
      {/* ------------------------------------------------------------- */}
      {activeSubTab === 'managers' && (
        <div className="space-y-4">
          <div className="bg-white rounded-3xl p-5 border border-stone-200/90 shadow-xs space-y-3">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <div>
                <h3 className="font-bold text-stone-900 text-sm sm:text-base flex items-center gap-2">
                  <Users className="w-4 h-4 text-emerald-700" />
                  <span>تمام مینیجرز کی فہرست ({managers.length})</span>
                </h3>
                <p className="text-xs text-stone-500 mt-0.5">
                  کسی بھی مینیجر کی تفصیلی پروفائل، پاسورڈ اور تفویض کردہ مدارس دیکھنے کے لیے اس کی سطر پر کلک فرمائیں۔
                </p>
              </div>

              <span className="text-xs bg-emerald-100 text-emerald-900 border border-emerald-300 font-bold px-3 py-1 rounded-full">
                کل فعال مینیجرز: {managers.filter((m) => m.status === 'active').length}
              </span>
            </div>

            {isLoading ? (
              <div className="py-12 text-center text-stone-500 font-urdu text-sm">
                <span className="inline-block w-5 h-5 border-2 border-emerald-700 border-t-transparent rounded-full animate-spin mb-2"></span>
                <p>مینیجرز کی فہرست لوڈ ہو رہی ہے...</p>
              </div>
            ) : managers.length === 0 ? (
              <div className="py-12 text-center bg-stone-50 rounded-2xl border border-dashed border-stone-300 p-6 space-y-3">
                <UserCheck className="w-12 h-12 text-stone-400 mx-auto" />
                <h4 className="font-bold text-stone-800 text-sm">کوئی اسٹیٹ مینیجر موجود نہیں ہے</h4>
                <p className="text-xs text-stone-500">اوپر دیے گئے بٹن سے نیا مینیجر شامل کریں۔</p>
              </div>
            ) : (
              <div className="divide-y divide-stone-100">
                {managers.map((mgr, idx) => {
                  // Compute stats for this manager
                  const mgrMadaris = activeMadaris.filter(
                    (m) =>
                      m.state &&
                      (mgr.assignedStates || []).some(
                        (s) => s.toLowerCase() === (m.state || '').toLowerCase()
                      )
                  );
                  const verifiedCount = mgrMadaris.filter(
                    (m) => m.registrationStatus === 'approved' || m.managerVerified
                  ).length;
                  const pendingCount = mgrMadaris.filter(
                    (m) => m.registrationStatus === 'pending' || !m.managerVerified
                  ).length;

                  return (
                    <div
                      key={mgr.id}
                      onClick={() => setSelectedManagerForProfile(mgr)}
                      className="py-3.5 px-3 sm:px-4 rounded-2xl hover:bg-emerald-50/70 border border-transparent hover:border-emerald-200 transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3 group"
                    >
                      {/* Left: Avatar & Basic Info */}
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="w-7 h-7 rounded-xl bg-stone-100 group-hover:bg-emerald-200 text-stone-600 group-hover:text-emerald-900 font-mono text-xs font-bold flex items-center justify-center shrink-0">
                          #{idx + 1}
                        </span>

                        <div className="w-11 h-11 rounded-2xl bg-emerald-100 text-emerald-900 border border-emerald-300 flex items-center justify-center shrink-0 font-bold">
                          <Users className="w-5 h-5 text-emerald-800" />
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="font-bold text-stone-900 group-hover:text-emerald-900 text-sm sm:text-base font-aslam truncate">
                              {mgr.name}
                            </h4>
                            <span className="font-mono text-xs text-stone-500 font-semibold px-2 py-0.5 rounded-md bg-stone-100">
                              @{mgr.username}
                            </span>
                            <span
                              className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                                mgr.status === 'active'
                                  ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                                  : 'bg-stone-200 text-stone-600'
                              }`}
                            >
                              {mgr.status === 'active' ? 'فعال' : 'غیر فعال'}
                            </span>
                          </div>

                          {/* Phone & Email */}
                          <div className="flex items-center gap-3 text-xs text-stone-500 mt-1 flex-wrap font-mono">
                            {mgr.phone && (
                              <span className="flex items-center gap-1">
                                <Phone className="w-3 h-3 text-emerald-600" />
                                <span>{mgr.phone}</span>
                              </span>
                            )}
                            {mgr.email && (
                              <span className="flex items-center gap-1 font-sans">
                                <Mail className="w-3 h-3 text-stone-400" />
                                <span>{mgr.email}</span>
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Right: Assigned States & Registration Counts */}
                      <div className="flex items-center gap-3 justify-between sm:justify-end shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-stone-100">
                        {/* Assigned States chips */}
                        <div className="flex items-center gap-1 flex-wrap max-w-xs justify-end">
                          {(mgr.assignedStates || []).slice(0, 3).map((st) => (
                            <span
                              key={st}
                              className="px-2 py-0.5 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-lg text-[11px] font-bold"
                            >
                              {st}
                            </span>
                          ))}
                          {(mgr.assignedStates || []).length > 3 && (
                            <span className="text-[10px] text-stone-500 font-mono font-bold">
                              +{(mgr.assignedStates || []).length - 3} مزید
                            </span>
                          )}
                        </div>

                        {/* Counts badges */}
                        <div className="flex items-center gap-1.5 font-urdu">
                          <span className="px-2 py-1 rounded-xl bg-emerald-100 text-emerald-900 border border-emerald-200 text-[11px] font-bold">
                            {verifiedCount} تصدیق شدہ
                          </span>
                          {pendingCount > 0 && (
                            <span className="px-2 py-1 rounded-xl bg-amber-100 text-amber-900 border border-amber-300 text-[11px] font-bold animate-pulse">
                              {pendingCount} زیر التوا
                            </span>
                          )}
                        </div>

                        {/* Touch Indicator Arrow */}
                        <div className="w-8 h-8 rounded-xl bg-stone-100 group-hover:bg-emerald-800 text-stone-400 group-hover:text-amber-300 flex items-center justify-center transition-colors shrink-0">
                          <ChevronLeft className="w-4 h-4" />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 3. OPTION 2: اسٹیٹ لیڈر بورڈ (STATES & DISTRICTS LEADERBOARD) */}
      {/* ------------------------------------------------------------- */}
      {activeSubTab === 'states' && (
        <div className="space-y-4">
          {/* Breadcrumb if a specific state district is opened */}
          {selectedStateForDistricts ? (
            /* ------------------------------------------------------------- */
            /* 3.B. DISTRICTS DRILL-DOWN LEADERBOARD FOR SELECTED STATE */
            /* ------------------------------------------------------------- */
            <div className="space-y-4">
              {/* Back to States button & State Banner */}
              <div className="bg-white rounded-3xl p-5 border border-stone-200/90 shadow-xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-stone-100 pb-3">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setSelectedStateForDistricts(null)}
                      className="px-3 py-1.5 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-2xs"
                    >
                      <ArrowRight className="w-3.5 h-3.5" />
                      <span>{isEn ? 'Back to All States' : '← واپس تمام ریاستیں'}</span>
                    </button>

                    <div>
                      <h3 className="font-bold text-stone-900 text-base sm:text-lg font-aslam flex items-center gap-2">
                        <span>{selectedStateForDistricts.ur} ({selectedStateForDistricts.en})</span>
                        <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-900 border border-emerald-300 font-bold">
                          اضلاع لیڈر بورڈ
                        </span>
                      </h3>
                      <p className="text-xs text-stone-500 mt-0.5">
                        اس ریاست کے اضلاع میں رجسٹریشن کا فیصد (Percentage) اور تمام رجسٹرڈ مدارس کی تفصیل۔
                      </p>
                    </div>
                  </div>

                  {/* State Manager Info for this State */}
                  {(() => {
                    const assigned = managers.filter((mgr) =>
                      (mgr.assignedStates || []).some(
                        (s) =>
                          s.toLowerCase() === selectedStateForDistricts.en.toLowerCase() ||
                          s.toLowerCase() === selectedStateForDistricts.ur.toLowerCase()
                      )
                    );
                    return assigned.length > 0 ? (
                      <div className="text-xs bg-emerald-50 border border-emerald-200 rounded-2xl p-2 px-3 text-emerald-950 font-urdu self-start sm:self-auto">
                        <span className="font-bold text-emerald-800 block text-[11px]">صوبائی نگران / مینیجر:</span>
                        <span className="font-bold">{assigned.map((m) => m.name).join('، ')}</span>
                      </div>
                    ) : null;
                  })()}
                </div>

                {/* Districts Leaderboard Table / Cards */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs text-stone-500 font-bold px-2">
                    <span>ضلع (District)</span>
                    <span className="flex items-center gap-4">
                      <span>رجسٹریشن و حصہ داری (%)</span>
                      <span>تعدادِ مدارس</span>
                    </span>
                  </div>

                  {selectedStateDistrictsLeaderboard.map((dist, idx) => {
                    const isTop1 = idx === 0 && dist.count > 0;
                    const isTop2 = idx === 1 && dist.count > 0;
                    const isTop3 = idx === 2 && dist.count > 0;

                    return (
                      <div
                        key={dist.name}
                        className={`p-4 rounded-2xl border transition-all ${
                          isTop1
                            ? 'bg-amber-50/80 border-amber-300 shadow-xs'
                            : isTop2
                            ? 'bg-slate-50 border-slate-300'
                            : isTop3
                            ? 'bg-orange-50/60 border-orange-200'
                            : 'bg-white border-stone-200/90'
                        }`}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          {/* Rank & District Name */}
                          <div className="flex items-center gap-3">
                            <span
                              className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 ${
                                isTop1
                                  ? 'bg-amber-400 text-amber-950 shadow-2xs'
                                  : isTop2
                                  ? 'bg-slate-300 text-slate-800'
                                  : isTop3
                                  ? 'bg-orange-300 text-orange-950'
                                  : 'bg-stone-100 text-stone-600'
                              }`}
                            >
                              {isTop1 ? '🥇 #1' : isTop2 ? '🥈 #2' : isTop3 ? '🥉 #3' : `#${idx + 1}`}
                            </span>

                            <div>
                              <h4 className="font-bold text-stone-900 text-sm sm:text-base font-aslam flex items-center gap-2">
                                <span>{dist.name}</span>
                                {dist.count > 0 && (
                                  <span className="text-[11px] font-mono font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-md">
                                    {dist.percentage.toFixed(1)}%
                                  </span>
                                )}
                              </h4>
                              <p className="text-[11px] text-stone-500">
                                {dist.count > 0
                                  ? `${dist.approvedCount} منظور شدہ · ${dist.pendingCount} زیرِ جائزہ`
                                  : 'اس ضلع میں ابھی کوئی رجسٹریشن نہیں ہے'}
                              </p>
                            </div>
                          </div>

                          {/* Progress Bar & Percentage Share */}
                          <div className="flex items-center gap-3 w-full sm:w-64">
                            <div className="flex-1">
                              <div className="w-full h-2.5 bg-stone-100 rounded-full overflow-hidden border border-stone-200">
                                <div
                                  className={`h-full rounded-full transition-all duration-500 ${
                                    isTop1
                                      ? 'bg-amber-500'
                                      : 'bg-emerald-600'
                                  }`}
                                  style={{ width: `${Math.max(dist.percentage, dist.count > 0 ? 5 : 0)}%` }}
                                />
                              </div>
                            </div>
                            <span className="font-mono text-sm font-bold text-stone-900 shrink-0 w-16 text-left">
                              {dist.count} مدارس
                            </span>
                          </div>
                        </div>

                        {/* List of registered madaris in this district */}
                        {dist.madaris.length > 0 && (
                          <div className="mt-3 pt-3 border-t border-stone-200/60 space-y-1.5 font-urdu">
                            <span className="text-[11px] font-bold text-stone-600 block">
                              اس ضلع کے رجسٹرڈ ادارے:
                            </span>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {dist.madaris.map((m) => (
                                <div
                                  key={m.id}
                                  className="p-2.5 rounded-xl bg-white border border-stone-200 shadow-2xs flex items-center justify-between text-xs"
                                >
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-1.5">
                                      <span className="font-mono font-bold text-[10px] text-emerald-950 bg-emerald-100 px-1.5 py-0.5 rounded">
                                        {m.code}
                                      </span>
                                      <span className="font-bold text-stone-900 truncate">
                                        {m.urduName}
                                      </span>
                                    </div>
                                    <p className="text-[10px] text-stone-500 mt-0.5">
                                      مہتمم: {m.principalName || 'نامعلوم'} · {m.principalPhone || m.contactPhone || ''}
                                    </p>
                                  </div>

                                  <span
                                    className={`text-[10px] px-2 py-0.5 rounded-full font-bold shrink-0 ${
                                      m.registrationStatus === 'approved' || m.managerVerified
                                        ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                                        : 'bg-rose-100 text-rose-900 border border-rose-300'
                                    }`}
                                  >
                                    {m.registrationStatus === 'approved' || m.managerVerified ? '✓ منظور' : 'زیرِ جائزہ'}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            /* ------------------------------------------------------------- */
            /* 3.A. ALL STATES LEADERBOARD (سب سے زیادہ رجسٹریشن والی ریاستیں اوپر) */
            /* ------------------------------------------------------------- */
            <div className="space-y-4">
              {/* Leaderboard Summary Banner */}
              <div className="bg-gradient-to-r from-emerald-900 via-teal-900 to-emerald-950 rounded-3xl p-5 sm:p-6 text-white shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Trophy className="w-6 h-6 text-amber-400" />
                    <h3 className="text-xl sm:text-2xl font-bold font-aslam text-amber-300">
                      ریاستی رجسٹریشن لیڈر بورڈ (State-wise Leaderboard)
                    </h3>
                  </div>
                  <p className="text-xs sm:text-sm text-emerald-200/90 font-urdu leading-relaxed">
                    جس ریاست میں سب سے زیادہ مدارس رجسٹرڈ ہیں وہ سب سے اوپر رہے گی۔ کسی بھی ریاست پر کلک کر کے اس کے اضلاع اور فیصد کی تفصیل ملاحظہ فرمائیں۔
                  </p>
                </div>

                {/* Top Metrics Badges */}
                <div className="flex items-center gap-3 shrink-0">
                  <div className="bg-white/10 backdrop-blur-xs p-3 rounded-2xl border border-white/20 text-center">
                    <span className="text-[10px] text-emerald-200 block font-urdu">کل رجسٹریشن</span>
                    <span className="font-mono text-xl font-extrabold text-amber-300">
                      {totalRegistrations}
                    </span>
                  </div>
                  <div className="bg-white/10 backdrop-blur-xs p-3 rounded-2xl border border-white/20 text-center">
                    <span className="text-[10px] text-emerald-200 block font-urdu">سب سے آگے (#1)</span>
                    <span className="font-bold text-sm text-white font-aslam">
                      {statesLeaderboard[0]?.canonical?.ur || 'کوئی نہیں'}
                    </span>
                  </div>
                </div>
              </div>

              {/* States Leaderboard List */}
              <div className="bg-white rounded-3xl p-5 border border-stone-200/90 shadow-xs space-y-3">
                <div className="flex items-center justify-between border-b border-stone-100 pb-3 text-xs text-stone-500 font-bold px-2">
                  <span>ریاست (State) اور مینیجر</span>
                  <span className="flex items-center gap-6">
                    <span>حصہ داری (Percentage Share)</span>
                    <span>مدارس کی تعداد</span>
                  </span>
                </div>

                <div className="space-y-2.5">
                  {statesLeaderboard.map((item, idx) => {
                    const isTop1 = idx === 0 && item.count > 0;
                    const isTop2 = idx === 1 && item.count > 0;
                    const isTop3 = idx === 2 && item.count > 0;

                    return (
                      <div
                        key={item.canonical.en}
                        onClick={() => setSelectedStateForDistricts(item.canonical)}
                        className={`p-4 rounded-2xl border transition-all cursor-pointer group hover:scale-[1.01] hover:shadow-md ${
                          isTop1
                            ? 'bg-amber-50/70 hover:bg-amber-100/70 border-amber-300 shadow-xs'
                            : isTop2
                            ? 'bg-slate-50/70 hover:bg-slate-100/70 border-slate-300'
                            : isTop3
                            ? 'bg-orange-50/60 hover:bg-orange-100/60 border-orange-200'
                            : 'bg-white hover:bg-emerald-50/50 border-stone-200/90 hover:border-emerald-300'
                        }`}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          {/* Left: Medal, State Name, Manager */}
                          <div className="flex items-center gap-3">
                            <span
                              className={`w-9 h-9 rounded-2xl flex items-center justify-center font-bold text-xs sm:text-sm shrink-0 ${
                                isTop1
                                  ? 'bg-amber-400 text-amber-950 shadow-xs'
                                  : isTop2
                                  ? 'bg-slate-300 text-slate-800'
                                  : isTop3
                                  ? 'bg-orange-300 text-orange-950'
                                  : 'bg-stone-100 text-stone-600'
                              }`}
                            >
                              {isTop1 ? '🥇 #1' : isTop2 ? '🥈 #2' : isTop3 ? '🥉 #3' : `#${idx + 1}`}
                            </span>

                            <div>
                              <div className="flex items-center gap-2">
                                <h4 className="font-bold text-stone-900 group-hover:text-emerald-900 text-base sm:text-lg font-aslam leading-snug">
                                  {item.canonical.ur} ({item.canonical.en})
                                </h4>
                                {isTop1 && (
                                  <span className="text-[10px] bg-amber-400 text-amber-950 font-bold px-2 py-0.5 rounded-full shadow-2xs">
                                    سب سے زیادہ رجسٹریشن
                                  </span>
                                )}
                              </div>

                              <p className="text-xs text-stone-500 mt-0.5">
                                {item.assignedManagers.length > 0 ? (
                                  <span>
                                    مینیجر: <strong className="text-emerald-800">{item.assignedManagers.map((m) => m.name).join('، ')}</strong>
                                  </span>
                                ) : (
                                  <span className="text-stone-400">کوئی مخصوص مینیجر تفویض نہیں</span>
                                )}
                                <span className="mx-1.5">·</span>
                                <span>{item.approvedCount} منظور شدہ</span>
                                {item.pendingCount > 0 && (
                                  <span className="text-amber-700 font-bold mr-1.5">({item.pendingCount} زیر جائزہ)</span>
                                )}
                              </p>
                            </div>
                          </div>

                          {/* Right: Percentage & Progress Bar */}
                          <div className="flex items-center gap-3 w-full sm:w-80 justify-between sm:justify-end">
                            <div className="flex-1">
                              <div className="flex items-center justify-between text-[11px] mb-1 font-mono">
                                <span className="text-stone-500 font-urdu">کل کا فیصد:</span>
                                <span className="font-bold text-emerald-900">
                                  {item.percentage.toFixed(1)}%
                                </span>
                              </div>
                              <div className="w-full h-3 bg-stone-100 rounded-full overflow-hidden border border-stone-200">
                                <div
                                  className={`h-full rounded-full transition-all duration-500 ${
                                    isTop1
                                      ? 'bg-amber-500'
                                      : 'bg-emerald-700'
                                  }`}
                                  style={{ width: `${Math.max(item.percentage, item.count > 0 ? 5 : 0)}%` }}
                                />
                              </div>
                            </div>

                            <div className="text-left shrink-0 min-w-20">
                              <span className="font-mono text-base font-extrabold text-stone-900 block">
                                {item.count} مدارس
                              </span>
                              <span className="text-[10px] text-emerald-700 group-hover:underline flex items-center gap-0.5 font-urdu">
                                <span>اضلاع دیکھیں</span>
                                <ChevronLeft className="w-3 h-3" />
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 4. MANAGER PROFILE DETAIL MODAL (جب مینیجر کو ٹچ کریں گے تو تفصیل کھلے گی) */}
      {/* ------------------------------------------------------------- */}
      {selectedManagerForProfile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs font-sans animate-fade-in">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-5 sm:p-6 shadow-2xl border border-stone-200 space-y-5 max-h-[92vh] flex flex-col font-urdu text-right">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-stone-100 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-900 border border-emerald-300 flex items-center justify-center font-bold text-lg shrink-0">
                  <Users className="w-6 h-6 text-emerald-800" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-bold text-stone-900 font-aslam leading-snug">
                      {selectedManagerForProfile.name}
                    </h3>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                        selectedManagerForProfile.status === 'active'
                          ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                          : 'bg-stone-200 text-stone-600'
                      }`}
                    >
                      {selectedManagerForProfile.status === 'active' ? 'فعال (Active)' : 'غیر فعال'}
                    </span>
                  </div>
                  <span className="font-mono text-xs text-stone-500 font-bold block">
                    مینیجر آئی ڈی: @{selectedManagerForProfile.username}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedManagerForProfile(null)}
                className="w-8 h-8 rounded-full bg-stone-100 hover:bg-stone-200 text-stone-600 flex items-center justify-center cursor-pointer font-bold transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Scrollable Body */}
            <div className="overflow-y-auto space-y-4 pr-1">
              {/* Credentials Card */}
              <div className="p-4 bg-stone-50 rounded-2xl border border-stone-200 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-stone-700">لاگ ان یوزر نیم و پاسورڈ:</span>
                  <button
                    type="button"
                    onClick={() =>
                      handleCopyCredentials(
                        `ID: ${selectedManagerForProfile.username} | Password: ${selectedManagerForProfile.password}`,
                        selectedManagerForProfile.id
                      )
                    }
                    className="text-[11px] font-bold text-emerald-800 hover:text-emerald-950 underline flex items-center gap-1 cursor-pointer"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>لاگ ان کاپی کریں</span>
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                  <div className="bg-white p-2.5 rounded-xl border border-stone-200">
                    <span className="text-[10px] text-stone-400 block font-urdu">یوزر نیم:</span>
                    <span className="font-bold text-stone-900 text-sm">{selectedManagerForProfile.username}</span>
                  </div>
                  <div className="bg-white p-2.5 rounded-xl border border-stone-200">
                    <span className="text-[10px] text-stone-400 block font-urdu">پاسورڈ:</span>
                    <span className="font-bold text-stone-900 text-sm">{selectedManagerForProfile.password}</span>
                  </div>
                </div>
              </div>

              {/* Contact Information */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                <div className="p-3 bg-stone-50 rounded-2xl border border-stone-200 flex items-center gap-2.5">
                  <Phone className="w-4 h-4 text-emerald-700 shrink-0" />
                  <div>
                    <span className="text-[10px] text-stone-400 block">رابطہ نمبر (موبائل):</span>
                    {selectedManagerForProfile.phone ? (
                      <a
                        href={`tel:${selectedManagerForProfile.phone}`}
                        className="font-mono font-bold text-stone-900 hover:text-emerald-800 hover:underline"
                      >
                        {selectedManagerForProfile.phone}
                      </a>
                    ) : (
                      <span className="text-stone-400">درج نہیں</span>
                    )}
                  </div>
                </div>

                <div className="p-3 bg-stone-50 rounded-2xl border border-stone-200 flex items-center gap-2.5">
                  <Mail className="w-4 h-4 text-emerald-700 shrink-0" />
                  <div>
                    <span className="text-[10px] text-stone-400 block">ای میل:</span>
                    {selectedManagerForProfile.email ? (
                      <a
                        href={`mailto:${selectedManagerForProfile.email}`}
                        className="font-mono font-bold text-stone-900 hover:text-emerald-800 hover:underline"
                      >
                        {selectedManagerForProfile.email}
                      </a>
                    ) : (
                      <span className="text-stone-400">درج نہیں</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Assigned States List */}
              <div className="p-4 bg-emerald-50/60 border border-emerald-200 rounded-2xl space-y-2">
                <span className="text-xs font-bold text-emerald-950 flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 text-emerald-700" />
                  <span>تفویض کردہ ریاستیں (Assigned States):</span>
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {(selectedManagerForProfile.assignedStates || []).map((st) => (
                    <span
                      key={st}
                      className="px-3 py-1 bg-white border border-emerald-300 text-emerald-950 rounded-xl text-xs font-bold shadow-2xs"
                    >
                      {st}
                    </span>
                  ))}
                </div>
              </div>

              {/* Madaris under this Manager's supervision */}
              {(() => {
                const assignedMadaris = activeMadaris.filter(
                  (m) =>
                    m.state &&
                    (selectedManagerForProfile.assignedStates || []).some(
                      (s) => s.toLowerCase() === (m.state || '').toLowerCase()
                    )
                );
                return (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs font-bold text-stone-800">
                      <span>اس مینیجر کے ماتحت رجسٹرڈ مدارس ({assignedMadaris.length}):</span>
                      <span className="text-emerald-800">
                        {assignedMadaris.filter((m) => m.registrationStatus === 'approved' || m.managerVerified).length} منظور شدہ
                      </span>
                    </div>

                    {assignedMadaris.length === 0 ? (
                      <p className="text-xs text-stone-400 p-4 text-center bg-stone-50 rounded-2xl border border-dashed border-stone-200">
                        ان ریاستوں سے ابھی کوئی مدرسہ رجسٹرڈ نہیں ہے۔
                      </p>
                    ) : (
                      <div className="max-h-56 overflow-y-auto space-y-1.5 p-1">
                        {assignedMadaris.map((m) => (
                          <div
                            key={m.id}
                            className="p-2.5 rounded-xl bg-stone-50 border border-stone-200 flex items-center justify-between text-xs"
                          >
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono font-bold text-[10px] text-emerald-950 bg-emerald-100 px-1.5 py-0.5 rounded">
                                  {m.code}
                                </span>
                                <span className="font-bold text-stone-900">{m.urduName}</span>
                              </div>
                              <p className="text-[10px] text-stone-500 mt-0.5">
                                {m.district || ''}{m.district && m.state ? ' · ' : ''}{m.state || ''} | مہتمم: {m.principalName || 'نامعلوم'}
                              </p>
                            </div>

                            <span
                              className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                                m.registrationStatus === 'approved' || m.managerVerified
                                  ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                                  : 'bg-amber-100 text-amber-900 border border-amber-300'
                              }`}
                            >
                              {m.registrationStatus === 'approved' || m.managerVerified ? '✓ منظور شدہ' : 'زیرِ جائزہ'}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-between gap-2 pt-3 border-t border-stone-200 shrink-0">
              <button
                type="button"
                onClick={() => handleDelete(selectedManagerForProfile)}
                className="px-4 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>مینیجر حذف کریں</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    openEditModal(selectedManagerForProfile);
                  }}
                  className="px-4 py-2 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                >
                  <Edit className="w-3.5 h-3.5" />
                  <span>تفصیلات ایڈٹ کریں</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedManagerForProfile(null)}
                  className="px-4 py-2 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-bold transition-colors cursor-pointer"
                >
                  بند کریں
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 5. ADD / EDIT MANAGER FORM MODAL */}
      {/* ------------------------------------------------------------- */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs font-sans">
          <div className="bg-white rounded-3xl max-w-lg w-full p-5 sm:p-6 shadow-2xl border border-stone-200 space-y-4 max-h-[90vh] flex flex-col font-urdu text-right">
            <div className="flex items-center justify-between pb-3 border-b border-stone-100 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-stone-900 font-aslam leading-tight">
                    {editingId ? 'اسٹیٹ مینیجر کی تفصیلات تبدیل کریں' : 'نیا اسٹیٹ مینیجر شامل کریں'}
                  </h3>
                  <p className="text-xs text-stone-500">مینیجر کے اختیارات اور تفویض کردہ ریاستیں مقرر فرمائیں</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="w-8 h-8 rounded-full bg-stone-100 hover:bg-stone-200 text-stone-600 flex items-center justify-center cursor-pointer font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-3.5 overflow-y-auto pr-1">
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">
                  مینیجر کا پورا نام: <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="مثلاً: مولانا مفتی عبد الرحیم صاحب"
                  className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-300 rounded-xl text-xs font-bold text-stone-900 focus:bg-white focus:ring-2 focus:ring-emerald-700 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">
                    یوزر نیم (آئی ڈی): <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    dir="ltr"
                    value={username}
                    onChange={(e) => setUsername(e.target.value.toUpperCase())}
                    placeholder="SM101"
                    className="w-full px-3.5 py-2 bg-stone-50 border border-stone-300 rounded-xl text-xs font-mono font-bold text-stone-900 focus:bg-white focus:ring-2 focus:ring-emerald-700 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">
                    پاسورڈ: <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    dir="ltr"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="SM101@2026"
                    className="w-full px-3.5 py-2 bg-stone-50 border border-stone-300 rounded-xl text-xs font-mono font-bold text-stone-900 focus:bg-white focus:ring-2 focus:ring-emerald-700 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">موبائل / واٹس ایپ نمبر:</label>
                  <input
                    type="tel"
                    dir="ltr"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+91 9876543210"
                    className="w-full px-3.5 py-2 bg-stone-50 border border-stone-300 rounded-xl text-xs font-mono text-stone-900 focus:bg-white focus:ring-2 focus:ring-emerald-700 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">اسٹیٹس:</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as any)}
                    className="w-full px-3.5 py-2 bg-stone-50 border border-stone-300 rounded-xl text-xs font-bold text-stone-900 focus:bg-white focus:ring-2 focus:ring-emerald-700 focus:outline-none"
                  >
                    <option value="active">فعال (Active)</option>
                    <option value="inactive">غیر فعال (Inactive)</option>
                  </select>
                </div>
              </div>

              {/* State Selection */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-bold text-stone-700">
                    تفویض کردہ ریاستیں (Select States): <span className="text-rose-500">*</span>
                  </label>
                  <span className="text-[11px] font-bold text-emerald-800 font-mono">
                    {selectedStates.length} ریاستیں منتخب
                  </span>
                </div>
                <div className="max-h-36 overflow-y-auto p-2 bg-stone-50 border border-stone-200 rounded-xl flex flex-wrap gap-1.5">
                  {COMMON_STATES.map((st) => {
                    const isSelected = selectedStates.includes(st);
                    return (
                      <button
                        type="button"
                        key={st}
                        onClick={() => toggleStateSelection(st)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
                          isSelected
                            ? 'bg-emerald-700 text-white shadow-2xs font-extrabold'
                            : 'bg-white text-stone-700 border border-stone-300 hover:bg-stone-100'
                        }`}
                      >
                        {isSelected && <Check className="w-3 h-3 text-amber-300" />}
                        <span>{st}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {errorMsg && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-stone-200">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  disabled={isSaving}
                  className="py-2 px-4 rounded-xl border border-stone-300 text-stone-600 hover:bg-stone-100 text-xs font-bold cursor-pointer"
                >
                  منسوخ کریں
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="py-2 px-5 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-md disabled:opacity-60"
                >
                  {isSaving ? (
                    <span>محفوظ ہو رہا ہے...</span>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5 text-amber-300" />
                      <span>{editingId ? 'تبدیلیاں محفوظ کریں' : 'مینیجر شامل کریں'}</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
