/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type Language = 'ur' | 'en';

export interface Translations {
  // Brand & Header
  portalTitle: string;
  portalSubtitle: string;
  adminApp: string;
  publicPortal: string;
  homeButton: string;
  logout: string;
  switchLang: string;
  
  // Public Portal Search
  resultTitle: string;
  resultSubtitle: string;
  searchHeroTag: string;
  searchHeroTitle: string;
  searchHeroDesc: string;
  studentIdLabel: string;
  studentIdHint: string;
  dobLabel: string;
  searchButton: string;
  searchingButton: string;
  newSearch: string;
  printPdf: string;
  resultNotFound: string;
  enterBothFields: string;

  // Result Card Labels
  studentId: string;
  darjaClass: string;
  studentName: string;
  fatherName: string;
  subject: string;
  totalMarks: string;
  obtainedMarks: string;
  percentage: string;
  gradeKaifiyat: string;
  absentLetter: string;
  passed: string;
  failed: string;
  
  // Admin Bottom Nav
  dashboard: string;
  madrasas: string;
  students: string;
  results: string;
  more: string;
  settings: string;

  // Admin Overview
  totalMadrasas: string;
  studentsCount: string;
  publishedResults: string;
  pendingRegs: string;
  recentActivity: string;
  activeSelected: string;
  classesCount: string;
  openSheet: string;
  kaifiyatRules: string;
  addStudent: string;
  
  // Madrasa & Student Actions
  createMadrasa: string;
  edit: string;
  delete: string;
  save: string;
  cancel: string;
  searchPlaceholder: string;
  allClasses: string;
  liveStatus: string;
  draftStatus: string;
  published: string;
  unpublished: string;
  
  // Results Tab
  top10Inst: string;
  top3Class: string;
  downloadReport: string;
  filterByClass: string;

  // Statistics & Detailed Counters
  allMadaris: string;
  affiliated: string;
  totalStudents: string;
  enrolled: string;
  publishedResultsCount: string;
  classesLive: string;
  syncedSheets: string;
  googleSheets: string;
  pending: string;
  sheetLinked: string;
  unlinked: string;
  systemSummaryTitle: string;
  systemSummaryDesc: string;
  recentActivitiesTitle: string;
  searchMadrasaPlaceholder: string;
  shareFormLink: string;
  registerNewMadrasa: string;
  madarisDirectory: string;
  clickToViewDetails: string;
  noMadrasaFound: string;
  liveSheetStatus: string;
  activeSheet: string;
  notLinked: string;
  openGoogleSheet: string;
  attachSheet: string;
  syncFromSheet: string;
  lastSyncTime: string;
  summaryClassesStudents: string;
  totalClasses: string;
  resultsStatus: string;
  newStudentAdmission: string;
  copyCredentials: string;
  deleteMadrasa: string;
  close: string;
  classwiseEnrolmentSummary: string;
  priorityOrderClasses: string;
  passedCount: string;
  mumtazCount: string;
  admitStudentBtn: string;
  resultsMeritShowcase: string;
  resultsMeritSub: string;
  selectMadrasaLabel: string;
  selectMadrasaSub: string;
  allMadarisOption: string;
  syncBtn: string;
  syncingBtn: string;
  welcomeAdmin: string;
  distinction: string;
  realTime: string;
  noRecentActivity: string;
  quickAccess: string;
  searchStudents: string;
  resultsAndRanking: string;
  madarisPortal: string;
  publishingStatus: string;
  totalEnrollments: string;
  changeSheetLink: string;
  syncSheetNow: string;
  syncingNow: string;
}

export const translations: Record<Language, Translations> = {
  ur: {
    portalTitle: 'مِعیارِ مدارس',
    portalSubtitle: 'شفاف نتائج، محفوظ ریکارڈ',
    adminApp: 'ایڈمن ایپ',
    publicPortal: 'پبلک پورٹل',
    homeButton: 'مرکزی ہوم',
    logout: 'لاگ آؤٹ',
    switchLang: 'English',

    resultTitle: 'امتحانی نتائج',
    resultSubtitle: 'ملحقہ مدارس کا مرکزی رزلٹ سسٹم',
    searchHeroTag: 'سالانہ و ششماہی امتحانی نتائج',
    searchHeroTitle: 'طالب علم کا نتیجہ معلوم کریں',
    searchHeroDesc: 'اپنا رزلٹ کارڈ دیکھنے کے لیے طالب علم آئی ڈی اور تاریخِ پیدائش درج کریں۔',
    studentIdLabel: 'طالب علم آئی ڈی (Student ID)',
    studentIdHint: 'مثال: 111101 (پہلے تین ہندسے مدرسہ کوڈ، چوتھا کلاس، اور آخری رول نمبر)',
    dobLabel: 'تاریخِ پیدائش (Date of Birth)',
    searchButton: 'نتیجہ تلاش کریں',
    searchingButton: 'تلاش ہو رہا ہے...',
    newSearch: 'نئی تلاش',
    printPdf: 'ڈاؤنلوڈ',
    resultNotFound: 'نتیجہ نہیں ملا۔ براہ کرم طالب علم آئی ڈی اور تاریخِ پیدائش چیک فرمائیں۔',
    enterBothFields: 'برائے مہربانی طالب علم آئی ڈی اور تاریخِ پیدائش درج فرمائیں۔',

    studentId: 'طالب علم آئی ڈی',
    darjaClass: 'درجہ',
    studentName: 'طالب علم',
    fatherName: 'والد کا نام',
    subject: 'مضمون',
    totalMarks: 'کل نمبر',
    obtainedMarks: 'حاصل کردہ',
    percentage: 'فیصد',
    gradeKaifiyat: 'کیفیت',
    absentLetter: 'غ',
    passed: 'کامیاب',
    failed: 'ناکام',

    dashboard: 'ڈیش بورڈ',
    madrasas: 'مدارس',
    students: 'طلبہ',
    results: 'نتائج',
    more: 'مزید',
    settings: 'ترتیبات',

    totalMadrasas: 'کل مدارس',
    studentsCount: 'طلبہ کی تعداد',
    publishedResults: 'شائع نتائج',
    pendingRegs: 'زیرِ التواء',
    recentActivity: 'حالیہ سرگرمیاں',
    activeSelected: 'فعال منتخب',
    classesCount: 'مربوط درجات',
    openSheet: 'امتحانی ریکارڈ دیکھیں',
    kaifiyatRules: 'کیفیت قواعد',
    addStudent: '+ نیا طالب علم داخل کریں',

    createMadrasa: '+ نیا مدرسہ بنائیں',
    edit: 'ترمیم',
    delete: 'حذف',
    save: 'محفوظ کریں',
    cancel: 'منسوخ',
    searchPlaceholder: 'طالب علم کا نام، والد کا نام یا Student ID تلاش کریں...',
    allClasses: 'تمام درجات',
    liveStatus: 'لائیو (شائع)',
    draftStatus: 'ڈرافٹ (غیر شائع)',
    published: 'شائع شدہ',
    unpublished: 'غیر شائع',

    top10Inst: 'مدرسہ کے ٹاپ 10 طلبہ (Top 10 Institution)',
    top3Class: 'ہر درجہ کے ٹاپ 3 پوزیشن ہولڈرز (Top 3 by Class)',
    downloadReport: 'امتحانی رپورٹ ڈاؤن لوڈ',
    filterByClass: 'درجہ کے مطابق فلٹر:',

    allMadaris: 'تمام مدارس',
    affiliated: 'الحاق شدہ',
    totalStudents: 'کل طلبہ',
    enrolled: 'داخلہ شدہ',
    publishedResultsCount: 'شائع شدہ نتائج',
    classesLive: 'درجات لائیو',
    syncedSheets: 'فعال ریکارڈز',
    googleSheets: 'مرکزی کلاؤڈ ریکارڈ',
    pending: 'زیر التوا',
    sheetLinked: 'ریکارڈ فعال',
    unlinked: 'غیر منسلک',
    systemSummaryTitle: 'امتحانی نظام سمری و خلاصہ',
    systemSummaryDesc: 'یہ امتحانی پورٹل الحاق شدہ تمام مدارس کے درجات، داخلہ طلبہ اور امتحانی نتائج کا مرکزی خلاصہ پیش کرتا ہے۔ مکمل تفصیلی ریکارڈز مرکزی محفوظ کلاؤڈ سسٹم میں محفوظ ہیں۔',
    recentActivitiesTitle: 'حالیہ سرگرمیاں',
    searchMadrasaPlaceholder: 'مدرسہ کا نام یا کوڈ تلاش کریں...',
    shareFormLink: 'فارم لنک کاپی',
    registerNewMadrasa: 'نیا مدرسہ رجسٹر کریں',
    madarisDirectory: 'فہرست مدارس',
    clickToViewDetails: 'تفصیلات دیکھنے کے لیے کلک کریں',
    noMadrasaFound: 'کوئی مدرسہ نہیں ملا',
    liveSheetStatus: 'لائیو ریکارڈ اسٹیٹس:',
    activeSheet: 'فعال ریکارڈ (Active)',
    notLinked: 'غیر منسلک',
    openGoogleSheet: 'امتحانی ریکارڈ دیکھیں',
    attachSheet: 'ریکارڈ منسلک کریں',
    syncFromSheet: 'لائیو سنک کریں',
    lastSyncTime: 'آخری سنک وقت:',
    summaryClassesStudents: 'درجات و طلبہ کا خلاصہ:',
    totalClasses: 'کل درجات',
    resultsStatus: 'نتائج کی صورت حال:',
    newStudentAdmission: 'طالب علم کا نیا داخلہ',
    copyCredentials: 'کریڈینشلز کاپی',
    deleteMadrasa: 'مدرسہ حذف کریں',
    close: 'بند کریں',
    classwiseEnrolmentSummary: 'درجہ وار طلبہ داخلہ و سمری',
    priorityOrderClasses: 'زیادہ طلبہ والی کلاسز ترجیحی ترتیب میں',
    passedCount: 'کامیاب',
    mumtazCount: 'ممتاز',
    admitStudentBtn: 'داخلہ کریں',
    resultsMeritShowcase: 'امتحانی نتائج و میرٹ شوکیس',
    resultsMeritSub: 'ٹاپ 10 ادارے، درجہ وار ٹاپ 3 پوزیشن ہولڈرز اور نتائج پبلشنگ',
    selectMadrasaLabel: 'مدرسہ منتخب کریں',
    selectMadrasaSub: 'مخصوص مدرسہ یا تمام مدارس کے نتائج دیکھیں',
    allMadarisOption: 'تمام مدارس (All Madaris)',
    syncBtn: 'سنک کریں',
    syncingBtn: 'سنک ہو رہا ہے...',
    welcomeAdmin: 'خوش آمدید، امتحانی ایڈمنسٹریٹر',
    distinction: 'ممتاز کارکردگی 🏆',
    realTime: 'ریئل ٹائم',
    noRecentActivity: 'کوئی حالیہ سرگرمی موجود نہیں',
    quickAccess: 'فوری رسائی:',
    searchStudents: 'طلبہ تلاش ➔',
    resultsAndRanking: 'نتائج و رینکنگ ➔',
    madarisPortal: 'مدارس پورٹل ➔',
    publishingStatus: 'پبلشنگ کی حالت',
    totalEnrollments: 'مجموعی داخلے',
    changeSheetLink: 'شیٹ لنک تبدیل کریں',
    syncSheetNow: 'شیٹ سنک کریں',
    syncingNow: 'سنک ہو رہا ہے...',
  },
  en: {
    portalTitle: 'Meyar-e-Madaris',
    portalSubtitle: 'Transparent Results, Secure Records',
    adminApp: 'Admin App',
    publicPortal: 'Public Portal',
    homeButton: 'Main Home',
    logout: 'Logout',
    switchLang: 'اردو',

    resultTitle: 'Exam Results',
    resultSubtitle: 'Central Examination System for Affiliated Madaris',
    searchHeroTag: 'Annual & Bi-Annual Examination Results',
    searchHeroTitle: 'Check Student Result',
    searchHeroDesc: 'Enter your assigned Student ID and Date of Birth to view the official Marksheet.',
    studentIdLabel: 'Student ID',
    studentIdHint: 'Example: 111101 (First 3 digits Madrasa code, 4th class, and last serial)',
    dobLabel: 'Date of Birth (DD/MM/YYYY)',
    searchButton: 'Search Result',
    searchingButton: 'Searching...',
    newSearch: 'New Search',
    printPdf: 'Download',
    resultNotFound: 'Result not found. Please verify the Student ID and Date of Birth.',
    enterBothFields: 'Please enter both Student ID and Date of Birth.',

    studentId: 'Student ID',
    darjaClass: 'Class',
    studentName: 'Student Name',
    fatherName: 'Father Name',
    subject: 'Subject',
    totalMarks: 'Total Marks',
    obtainedMarks: 'Obtained',
    percentage: 'Percentage',
    gradeKaifiyat: 'Grade',
    absentLetter: 'Abs',
    passed: 'Passed',
    failed: 'Failed',

    dashboard: 'Dashboard',
    madrasas: 'Madrasas',
    students: 'Students',
    results: 'Results',
    more: 'More',
    settings: 'Settings',

    totalMadrasas: 'Total Madrasas',
    studentsCount: 'Total Students',
    publishedResults: 'Published Results',
    pendingRegs: 'Pending Regs',
    recentActivity: 'Recent Activity',
    activeSelected: 'Active',
    classesCount: 'Linked Classes',
    openSheet: 'Academic Records',
    kaifiyatRules: 'Grading Rules',
    addStudent: '+ Register New Student',

    createMadrasa: '+ Create Madrasa',
    edit: 'Edit',
    delete: 'Delete',
    save: 'Save',
    cancel: 'Cancel',
    searchPlaceholder: 'Search student by name, father name or Student ID...',
    allClasses: 'All Classes',
    liveStatus: 'Live (Published)',
    draftStatus: 'Draft (Unpublished)',
    published: 'Published',
    unpublished: 'Unpublished',

    top10Inst: 'Top 10 Students (Institution)',
    top3Class: 'Top 3 Position Holders (By Class)',
    downloadReport: 'Download Results CSV',
    filterByClass: 'Filter by Class:',

    allMadaris: 'All Madaris',
    affiliated: 'Affiliated',
    totalStudents: 'Total Students',
    enrolled: 'Enrolled',
    publishedResultsCount: 'Published Results',
    classesLive: 'Classes Live',
    syncedSheets: 'Active Records',
    googleSheets: 'Cloud Records',
    pending: 'Pending',
    sheetLinked: 'Record Active',
    unlinked: 'Unlinked',
    systemSummaryTitle: 'Examination System Summary & Overview',
    systemSummaryDesc: 'This examination portal presents a centralized overview of all affiliated madaris, enrolled students, and examination results. Detailed academic records are maintained in the secure central cloud system.',
    recentActivitiesTitle: 'Recent Activity',
    searchMadrasaPlaceholder: 'Search madrasa name or code...',
    shareFormLink: 'Copy Form Link',
    registerNewMadrasa: 'Register New Madrasa',
    madarisDirectory: 'Madaris Directory',
    clickToViewDetails: 'Click to view details',
    noMadrasaFound: 'No madrasa found',
    liveSheetStatus: 'Live Record Status:',
    activeSheet: 'Active Record',
    notLinked: 'Not Linked',
    openGoogleSheet: 'Academic Records',
    attachSheet: 'Link Record',
    syncFromSheet: 'Live Sync',
    lastSyncTime: 'Last Sync Time:',
    summaryClassesStudents: 'Classes & Students Summary:',
    totalClasses: 'Total Classes',
    resultsStatus: 'Results Status:',
    newStudentAdmission: 'New Student Admission',
    copyCredentials: 'Copy Credentials',
    deleteMadrasa: 'Delete Madrasa',
    close: 'Close',
    classwiseEnrolmentSummary: 'Class-wise Enrolment & Summary',
    priorityOrderClasses: 'Classes ordered by highest enrolment',
    passedCount: 'Passed',
    mumtazCount: 'Mumtaz',
    admitStudentBtn: 'Admit Student',
    resultsMeritShowcase: 'Examination Results & Merit Showcase',
    resultsMeritSub: 'Top 10 Institutions, Class-wise Top 3 Position Holders and Results Publishing',
    selectMadrasaLabel: 'Select Madrasa',
    selectMadrasaSub: 'View results for a specific madrasa or all institutions',
    allMadarisOption: 'All Madaris (تمام مدارس)',
    syncBtn: 'Sync Now',
    syncingBtn: 'Syncing...',
    welcomeAdmin: 'Welcome, Examination Administrator',
    distinction: 'Distinction 🏆',
    realTime: 'Real-time',
    noRecentActivity: 'No recent activity found',
    quickAccess: 'Quick Access:',
    searchStudents: 'Search Students ➔',
    resultsAndRanking: 'Results & Ranking ➔',
    madarisPortal: 'Madaris Portal ➔',
    publishingStatus: 'Publishing Status',
    totalEnrollments: 'Total Enrollments',
    changeSheetLink: 'Change Sheet Link',
    syncSheetNow: 'Sync Sheet',
    syncingNow: 'Syncing...',
  },
};
