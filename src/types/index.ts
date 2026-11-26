/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface KaifiyatRule {
  id: string;
  minPercentage: number;
  maxPercentage: number;
  title: string;
  colorClass: string;
  color?: string;
  textColor?: string;
  borderColor?: string;
}

export interface PassingSettings {
  passingPercentage: number;
  oneSubjectFailLabel: string;
  twoOrMoreFailLabel: string;
  absentFailLabel: string;
}

export interface MadrasaPermissions {
  principalCanPublish: boolean;
  principalCanUnpublish: boolean;
  principalCanAddStudents: boolean;
  principalCanEditMarks: boolean;
}

export type MadrasaRegistrationStatus = 'pending' | 'approved' | 'rejected';

export interface Madrasa {
  id: string;
  code: string; // e.g. MM111 or MM11
  serialNumber: number; // e.g. 111
  urduName: string;
  englishName: string;
  address: string;
  description: string;
  logo: string;
  logoUrl?: string;
  themeColor: string; // hex or tailwind identifier
  contactPhone?: string;
  email?: string;
  website?: string;
  principalName?: string;
  principalPhone?: string;
  principalId?: string; // Auto-generated Principal Login ID, e.g. MM111
  principalPassword?: string; // Auto-generated temporary password, e.g. MM111@1234
  googleSheetUrl?: string; // Automated or linked Google Spreadsheet URL
  spreadsheetId?: string; // Dedicated Google Spreadsheet ID (from Apps Script)
  examTitle: string; // e.g. نتیجہ ششماہی امتحان 1448ھ 2026ء
  kaifiyatRules: KaifiyatRule[];
  passingSettings: PassingSettings;
  hasCustomResultLogic?: boolean; // Flag whether this madrasa has configured its own custom result logic
  permissions?: MadrasaPermissions;
  registrationStatus?: MadrasaRegistrationStatus;
  isVerified?: boolean;
  state?: string; // e.g. Jharkhand, Bihar
  district?: string;
  managerVerified?: boolean;
  managerVerifiedAt?: string;
  managerVerifiedBy?: string;
  systemSelfTestPassed?: boolean;
  systemSelfTestMessage?: string;
  showPublicResults?: boolean; // Admin ON/OFF toggle for public results visibility
  createdAt: string;
  approvedAt?: string;
  updatedAt?: string;
}

export interface StateManager {
  id: string;
  name: string;
  username: string; // Login ID, e.g. SM101
  password: string; // PIN or Password, e.g. SM2026
  phone?: string;
  email?: string;
  assignedStates: string[]; // e.g. ["Jharkhand", "Bihar"]
  status: 'active' | 'inactive';
  createdAt: string;
  updatedAt: string;
}

export interface SubjectConfig {
  id: string;
  name: string;
  nameEn?: string;
  maxMarks: number;
  passingMarks?: number;
}

export interface SubjectMark {
  name: string;
  maxMarks: number;
  obtainedMarks: number | 'غ' | 'Absent' | string;
  isAbsent: boolean;
  isEmpty?: boolean;
  isPassed: boolean;
  percentage: number;
}

export interface StudentRecord {
  id: string;
  studentId: string; // e.g. 111101
  madrasaId: string;
  classId: string;
  className: string;
  studentNameUrdu: string;
  studentNameEnglish: string;
  fatherNameUrdu: string;
  fatherNameEnglish: string;
  dob: string; // DD/MM/YYYY
  rollNo?: string;
  subjectsMarks?: { [subjectName: string]: number | 'غ' | 'Absent' };
  createdAt?: string;
  updatedAt?: string;
}

export interface StudentResult {
  studentId: string;
  dob: string; // YYYY-MM-DD or DD/MM/YYYY
  studentName: string;
  studentNameEn?: string;
  fatherName: string;
  fatherNameEn?: string;
  rollNo?: string;
  darja: string;
  subjects: SubjectMark[];
  totalMarks: number;
  obtainedMarks: number;
  percentage: number;
  kaifiyat: string;
  isAbsent: boolean;
  failedSubjectCount: number;
  position?: number;
}

export type ClassStatus = 'draft' | 'published' | 'unpublished';

export interface TestConnectionResult {
  success: boolean;
  message: string;
  studentCount: number;
  subjectCount: number;
  subjects: { name: string; maxMarks: number }[];
  missingFields: string[];
  fetchedCsv?: string;
  sampleStudent?: {
    id: string;
    name: string;
    dob: string;
  };
}

export interface MadrasaClass {
  id: string;
  madrasaId: string;
  name: string; // e.g. سال اول، سال دوم، سال سوم، دورۂ حدیث، حفظ، تخصص
  nameEn?: string;
  academicYear: string;
  status: ClassStatus;
  resultSourceType: 'google_sheet' | 'csv' | 'direct';
  googleSheetUrl: string;
  sheetTabName: string;
  subjectsConfig?: SubjectConfig[];
  rawSourceData: string;
  lastTestedAt: string | null;
  testStatus: TestConnectionResult | null;
  students: StudentResult[];
  updatedAt: string;
}

export interface SearchQuery {
  studentId: string;
  dob: string;
}

export interface SearchResultMatch {
  student: StudentResult;
  madrasa: Madrasa;
  madrasaClass: MadrasaClass;
}


export interface MadrasaFormStatus {
  enabled: boolean;
  greeting: string;
  message: string;
  updatedAt?: string;
}

export interface FeedbackSubmission {
  id: string;
  serialNumber?: number;
  name: string;
  phone?: string;
  state: string;
  district: string;
  message: string;
  status: 'unread' | 'read' | 'resolved';
  createdAt: string;
  dateFormatted?: string;
}

export interface PortalLaunchTimer {
  enabled: boolean;
  targetDate: string; // ISO 8601 string or date string
  title: string;
  message: string;
  isLaunched?: boolean;
  updatedAt?: string;
}

