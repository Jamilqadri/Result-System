/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Madrasa, MadrasaClass, StudentResult } from '../../types';
import { UserCheck, X, AlertCircle } from 'lucide-react';
import { CalendarDatePicker } from '../common/CalendarDatePicker';
import { submitStudentAdmissionWorkflow } from '../../services/appsScriptService';

interface StudentFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (student: StudentResult, targetClassId: string) => void;
  madrasa: Madrasa;
  classes: MadrasaClass[];
  existingStudent?: { student: StudentResult; classId: string } | null;
}

export const StudentFormModal: React.FC<StudentFormModalProps> = ({
  isOpen,
  onClose,
  onSave,
  madrasa,
  classes,
  existingStudent,
}) => {
  const [targetClassId, setTargetClassId] = useState<string>(() => {
    return existingStudent?.classId || classes[0]?.id || '';
  });

  // Calculate Next 6-Digit Student ID automatically across the ENTIRE madrasa
  const computeNextStudentId = () => {
    const allMadrasaStudents = classes.flatMap((c) => c.students || []);
    let maxIdNum = 0;
    allMadrasaStudents.forEach((st) => {
      const match = (st.studentId || '').match(/(\d+)/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxIdNum) maxIdNum = num;
      }
    });

    const madrasaDigits = madrasa.code.replace(/\D/g, '').slice(-3) || '101';
    const prefix = madrasaDigits.padStart(3, '0');

    if (maxIdNum > 0) {
      return String(maxIdNum + 1);
    }
    return `${prefix}001`;
  };

  const initialId = computeNextStudentId();

  const [studentId] = useState<string>(
    existingStudent?.student.studentId || initialId
  );
  const [studentName, setStudentName] = useState<string>(
    existingStudent?.student.studentName || ''
  );
  const [studentNameEn, setStudentNameEn] = useState<string>(
    existingStudent?.student.studentNameEn || ''
  );
  const [fatherName, setFatherName] = useState<string>(
    existingStudent?.student.fatherName || ''
  );
  const [fatherNameEn, setFatherNameEn] = useState<string>(
    existingStudent?.student.fatherNameEn || ''
  );
  const [dob, setDob] = useState<string>(
    existingStudent?.student.dob || '01/01/2008'
  );

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const targetClass = classes.find((c) => c.id === targetClassId) || classes[0];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentName.trim()) {
      setErrorMessage('طالب علم کا اردو نام درج فرمائیں۔');
      return;
    }
    if (!fatherName.trim()) {
      setErrorMessage('والد کا اردو نام درج فرمائیں۔');
      return;
    }
    if (!dob.trim()) {
      setErrorMessage('تاریخِ پیدائش منتخب فرمائیں۔');
      return;
    }
    if (!targetClassId) {
      setErrorMessage('درجہ منتخب فرمائیں۔');
      return;
    }

    setErrorMessage(null);
    setIsSubmitting(true);

    const existingStudentObj = existingStudent?.student;

    const newStudent: StudentResult = {
      studentId,
      studentName: studentName.trim(),
      studentNameEn: studentNameEn.trim() || studentName.trim(),
      fatherName: fatherName.trim(),
      fatherNameEn: fatherNameEn.trim() || fatherName.trim(),
      darja: targetClass?.name || 'کلاس',
      rollNo: existingStudentObj?.rollNo || studentId.slice(-2) || '01',
      dob: dob.trim(),
      subjects: existingStudentObj?.subjects || [],
      totalMarks: existingStudentObj?.totalMarks || 0,
      obtainedMarks: existingStudentObj?.obtainedMarks || 0,
      percentage: existingStudentObj?.percentage || 0,
      kaifiyat: existingStudentObj?.kaifiyat || 'زیرِ جائزہ',
      isAbsent: existingStudentObj?.isAbsent || false,
      failedSubjectCount: existingStudentObj?.failedSubjectCount || 0,
    };

    // 1. Immediately save to local application state
    onSave(newStudent, targetClassId);

    // 2. Asynchronously push to Google Sheet Master Data in background without UI freeze
    if (madrasa.googleSheetUrl) {
      submitStudentAdmissionWorkflow({
        spreadsheetId: madrasa.googleSheetUrl,
        urduName: newStudent.studentName,
        urduFather: newStudent.fatherName,
        name: newStudent.studentNameEn || '',
        father: newStudent.fatherNameEn || '',
        className: targetClass?.name || '',
        dob: newStudent.dob,
      }).catch((err) => {
        console.warn('Background admission sync notice:', err);
      });
    }

    setIsSubmitting(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-xs font-urdu overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-lg w-full max-h-[92vh] flex flex-col shadow-2xl border border-stone-200 my-auto overflow-hidden animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-200 bg-stone-50/90 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-emerald-100 text-emerald-800 flex items-center justify-center shadow-xs">
              <UserCheck className="w-5 h-5 text-emerald-800" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-stone-900 leading-tight">
                {existingStudent ? 'طالب علم کی تفصیلات' : 'طالب علم کا نیا داخلہ'}
              </h3>
              <p className="text-[11px] text-stone-500">
                {madrasa.urduName} — (<span className="font-mono font-bold text-emerald-800">{madrasa.code}</span>)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-stone-400 hover:text-stone-700 hover:bg-stone-200/70 transition-colors cursor-pointer"
            aria-label="بند کریں"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 sm:p-6 overflow-y-auto flex-1 space-y-4 text-xs sm:text-sm">
          {errorMessage && (
            <div className="p-3 bg-rose-50 border border-rose-300 text-rose-800 rounded-2xl text-xs font-semibold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Top Row: Class Selector & Auto Assigned Student ID */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">
                داخلہ برائے درجہ <span className="text-rose-500">*</span>
              </label>
              <select
                value={targetClassId}
                onChange={(e) => setTargetClassId(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-300 rounded-2xl text-xs font-bold text-stone-900 focus:bg-white focus:ring-2 focus:ring-emerald-600 focus:outline-hidden"
              >
                {classes.map((cls) => (
                  <option key={cls.id} value={cls.id}>
                    {cls.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">
                طالب علم آئی ڈی (خودکار تفویض)
              </label>
              <div className="px-3.5 py-2.5 bg-emerald-50/80 border border-emerald-300 rounded-2xl flex items-center justify-between">
                <span className="font-mono text-sm font-bold text-emerald-950 tracking-wider">
                  {studentId}
                </span>
                <span className="text-[10px] font-bold text-emerald-800 px-2 py-0.5 rounded-full bg-emerald-200/80">
                  خودکار
                </span>
              </div>
            </div>
          </div>

          {/* Student Name (Urdu & English) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">
                طالب علم کا نام (اردو) <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={studentName}
                onChange={(e) => setStudentName(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-300 rounded-2xl text-sm text-stone-900 focus:bg-white focus:ring-2 focus:ring-emerald-600 focus:outline-hidden"
                placeholder="مثلاً: محمد زید عالم"
              />
            </div>

            <div dir="ltr">
              <label className="block text-xs font-semibold text-stone-700 mb-1 font-sans">
                Student Name (English)
              </label>
              <input
                type="text"
                value={studentNameEn}
                onChange={(e) => setStudentNameEn(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-300 rounded-2xl text-xs font-sans text-stone-900 focus:bg-white focus:ring-2 focus:ring-emerald-600 focus:outline-hidden"
                placeholder="e.g. Mohammad Zaid Alam"
              />
            </div>
          </div>

          {/* Father's Name (Urdu & English) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">
                والد کا نام (اردو) <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={fatherName}
                onChange={(e) => setFatherName(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-300 rounded-2xl text-sm text-stone-900 focus:bg-white focus:ring-2 focus:ring-emerald-600 focus:outline-hidden"
                placeholder="مثلاً: مولانا ارشد حسین"
              />
            </div>

            <div dir="ltr">
              <label className="block text-xs font-semibold text-stone-700 mb-1 font-sans">
                Father Name (English)
              </label>
              <input
                type="text"
                value={fatherNameEn}
                onChange={(e) => setFatherNameEn(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-300 rounded-2xl text-xs font-sans text-stone-900 focus:bg-white focus:ring-2 focus:ring-emerald-600 focus:outline-hidden"
                placeholder="e.g. Arshad Hussain"
              />
            </div>
          </div>

          {/* Date of Birth */}
          <div>
            <label className="block text-xs font-bold text-stone-700 mb-1">
              تاریخِ پیدائش <span className="text-rose-500">*</span>
            </label>
            <CalendarDatePicker
              value={dob}
              onChange={(val) => setDob(val)}
            />
          </div>

          {/* Action Footer */}
          <div className="pt-3 flex items-center justify-end gap-2.5 border-t border-stone-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-2xl border border-stone-300 text-stone-700 text-xs font-bold hover:bg-stone-50 cursor-pointer"
            >
              منسوخ
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2.5 rounded-2xl bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-bold shadow-md cursor-pointer transition-all flex items-center gap-1.5 disabled:opacity-60"
            >
              <span>{existingStudent ? 'محفوظ کریں' : 'داخلہ کریں'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
