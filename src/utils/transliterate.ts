/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Dictionary of common madrasa terms and names for accurate transliteration
const MADRASA_TERMS: Record<string, string> = {
  'دارالعلوم': 'Darul Uloom',
  'دار العلوم': 'Darul Uloom',
  'جامعہ': 'Jamia',
  'مدرسہ': 'Madrasa',
  'مکتب': 'Maktab',
  'ادارہ': 'Idara',
  'مرکز': 'Markaz',
  'فیضان': 'Faizan-e-',
  'قرآن و حدیث': 'Quran o Hadith',
  'قرآن وحدیث': 'Quran o Hadith',
  'قرآن و سنت': 'Quran o Sunnat',
  'قرآن وسنت': 'Quran o Sunnat',
  'قرآن پاک': 'Quran Pak',
  'قرآن مجید': 'Quran Majeed',
  'قرآن': 'Quran',
  'حدیث': 'Hadith',
  'سنت': 'Sunnat',
  'عطار': 'Attar',
  'مدینہ': 'Madina',
  'غوث اعظم': 'Ghaus-e-Azam',
  'غوث پاک': 'Ghaus-e-Pak',
  'غریب نواز': 'Gareeb Nawaz',
  'تعلیم القرآن': 'Taleem-ul-Quran',
  'تحفیظ القرآن': 'Tahfeez-ul-Quran',
  'تجوید القرآن': 'Tajweed-ul-Quran',
  'تجوید و قرأت': 'Tajweed o Qirat',
  'تجوید': 'Tajweed',
  'قرأت': 'Qirat',
  'مصطفیٰ': 'Mustafa',
  'مصطفی': 'Mustafa',
  'اعلی حضرت': 'Ala Hazrat',
  'اعلیٰ حضرت': 'Ala Hazrat',
  'امام احمد رضا': 'Imam Ahmad Raza',
  'رضا': 'Raza',
  'غوثیہ': 'Ghausia',
  'رضویہ': 'Rizvia',
  'نظامیہ': 'Nizamiya',
  'حسینیہ': 'Hussainia',
  'اسلامیہ': 'Islamia',
  'اہلسنت': 'Ahle Sunnat',
  'اہل سنت': 'Ahle Sunnat',
  'فیض العلوم': 'Faiz-ul-Uloom',
  'نور الاسلام': 'Noor-ul-Islam',
  'اشرفیہ': 'Ashrafia',
  'برکاتیہ': 'Barkatiya',
  'قادریہ': 'Qadria',
  'چشتیہ': 'Chishtia',
  'مصباحیہ': 'Misbahia',
  'نوریہ': 'Nooria',
  'ضیاء العلوم': 'Zia-ul-Uloom',
  'شمس العلوم': 'Shams-ul-Uloom',
  'بحر العلوم': 'Bahr-ul-Uloom',
  'انوار العلوم': 'Anwar-ul-Uloom',
  'گلشن': 'Gulshan-e-',
  'سنی': 'Sunni',
  'حنفی': 'Hanafi',
  'مرکزی': 'Markazi',
  'معیار': 'Meyar-e-',
  'مدارس': 'Madaris',
  'بھارت': 'India',
  'جھارکھنڈ': 'Jharkhand',
  'بہار': 'Bihar',
  'اتر پردیش': 'Uttar Pradesh',
  'بنگال': 'Bengal',
  'رانچی': 'Ranchi',
  'بوکارو': 'Bokaro',
  'دھنباد': 'Dhanbad',
  'جمشیدپور': 'Jamshedpur',
  'ہزاری باغ': 'Hazaribagh',
  'گرڈیہہ': 'Giridih',
  'گرڈیہ': 'Giridih',
  'دیوگھر': 'Deoghar',
  'پٹنہ': 'Patna',
  'بیکو': 'Beko',
  'بگوڈر': 'Bagodar',
};

const NAME_MAP: Record<string, string> = {
  'رومانہ آفرین': 'Rumana Afrin',
  'ریاض انصاری': 'Riyaz Ansari',
  'محمد زید عالم': 'Mohammad Zaid Alam',
  'مولانا ارشد حسین': 'Arshad Husain',
  'فاطمہ زہرا': 'Fatima Zahra',
  'قاری شفیق احمد': 'Shafiq Ahmad',
  'عبد اللہ سراج': 'Abdullah Siraj',
  'سراج الدین': 'Sirajuddin',
  'زینب پروین': 'Zainab Parveen',
  'محمد الیاس': 'Mohammad Ilyas',
  'محمد احمد رضا': 'Mohammad Ahmad Raza',
  'مولانا عبد المنان': 'Abdul Mannan',
  'محمد حسان برکاتی': 'Hassan Barkati',
  'علامہ شمس الدین': 'Shamsuddin',
  'محمد عمار یاسر': 'Ammar Yasir',
  'محمد ارسلان': 'Mohammad Arslan',
  'محمد احمد': 'Muhammad Ahmad',
  'محمد حسن': 'Muhammad Hasan',
  'عبداللہ رضا': 'Abdullah Raza',
  'عمر فاروق': 'Umar Farooq',
  'احمد رضا': 'Ahmad Raza',
  'بلال احمد': 'Bilal Ahmad',
  'عثمان غنی': 'Usman Ghani',
  'زید حسن': 'Zaid Hasan',
  'حمزہ خان': 'Hamza Khan',
  'یوسف علی': 'Yusuf Ali',
  'عبدالرحمن': 'Abdul Rahman',
  'محمد سلیم': 'Muhammad Saleem',
  'عبدالکریم': 'Abdul Karim',
  'غلام مصطفیٰ': 'Ghulam Mustafa',
  'محمد یوسف': 'Muhammad Yusuf',
  'عبدالحمید': 'Abdul Hameed',
  'محمد اکرم': 'Muhammad Akram',
  'عبدالواحد': 'Abdul Wahid',
  'محمد طاہر': 'Muhammad Tahir',
};

const URDU_CHAR_MAP: Record<string, string> = {
  'ا': 'a', 'آ': 'Aa', 'ب': 'b', 'پ': 'p', 'ت': 't', 'ٹ': 't', 'ث': 's',
  'ج': 'j', 'چ': 'ch', 'ح': 'h', 'خ': 'kh', 'د': 'd', 'ڈ': 'd', 'ذ': 'z',
  'ر': 'r', 'ڑ': 'r', 'ز': 'z', 'ژ': 'zh', 'س': 's', 'ش': 'sh', 'ص': 's',
  'ض': 'z', 'ط': 't', 'ظ': 'z', 'ع': 'a', 'غ': 'gh', 'ف': 'f', 'ق': 'q',
  'ک': 'k', 'گ': 'g', 'ل': 'l', 'م': 'm', 'ن': 'n', 'ں': 'n', 'و': 'o',
  'ہ': 'h', 'ھ': 'h', 'ء': '', 'ی': 'i', 'ے': 'e', 'ۃ': 't',
};

export function transliterateUrduToEnglish(urduText: string): string {
  if (!urduText) return '';
  const trimmed = urduText.trim();
  if (NAME_MAP[trimmed]) return NAME_MAP[trimmed];
  if (MADRASA_TERMS[trimmed]) return MADRASA_TERMS[trimmed];

  // Replace compound terms first, sorted descending by length to match multi-word phrases first
  let working = trimmed;
  const sortedTerms = Object.keys(MADRASA_TERMS).sort((a, b) => b.length - a.length);
  for (const key of sortedTerms) {
    if (working.includes(key)) {
      working = working.replace(new RegExp(key, 'g'), ` ${MADRASA_TERMS[key]} `);
    }
  }

  const words = working.trim().split(/\s+/);
  const translatedWords = words.map((w) => {
    if (NAME_MAP[w]) return NAME_MAP[w];
    if (MADRASA_TERMS[w]) return MADRASA_TERMS[w];
    if (w === 'و') return 'o';
    // If word is already English letters, leave it intact
    if (!/[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/.test(w)) return w;

    let result = '';
    for (const char of w) {
      result += URDU_CHAR_MAP[char] || char;
    }
    return result.charAt(0).toUpperCase() + result.slice(1).toLowerCase();
  });

  return translatedWords
    .join(' ')
    .replace(/\s+-\s+/g, '-')
    .replace(/Faizan-e-\s+/g, 'Faizan-e-')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s*-\s*$/g, '')
    .trim() || trimmed;
}

/**
 * Ensures only the pure registered institution name is used, strictly stripping any appended
 * suffixes like '(امتحانی ریکارڈ و درجات)', 'امتحانی ریکارڈ', 'امتحان ریکارڈ', 'Exam Records', etc.
 */
export function cleanInstitutionName(name: string | undefined | null): string {
  if (!name || typeof name !== 'string') return '';
  let cleaned = name.trim();
  // Strip patterns like (امتحانی ریکارڈ و درجات), امتحانی ریکارڈ, امتحان ریکارڈ, Examination Records, etc.
  cleaned = cleaned
    .replace(/[\(\[\{]?\s*(امتحانی\s*ریکارڈ\s*و\s*درجات|امتحانی\s*ریکارڈز?|امتحان\s*ریکارڈ|امتحانی\s*نتائج|امتحانی\s*سیٹ\s*اپ|examination\s*records?|exam\s*records?|exam\s*result)\s*[\)\]\}]?/gi, '')
    .replace(/\s*\(امتحانی ریکارڈ و درجات\)\s*/gi, ' ')
    .replace(/\s*امتحانی ریکارڈ و درجات\s*/gi, ' ')
    .replace(/\s*\(امتحانی ریکارڈ\)\s*/gi, ' ')
    .replace(/\s*امتحانی ریکارڈ\s*/gi, ' ')
    .replace(/\s*\(درجات\)\s*/gi, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s*-\s*$/g, '')
    .trim();
  return cleaned;
}

/**
 * Resolves a reliable English institution name.
 * Strictly guarantees that ONLY English letters are returned without any Urdu/Arabic characters.
 * If englishName is provided and is purely in English, returns it.
 * If englishName has mixed English and Urdu text (e.g. "Darul Uloom Faizan-e- قرآن و حدیث"),
 * converts all Urdu segments into proper English.
 * If englishName is missing, transliterates urduName accurately.
 */
export function getMadrasaEnglishName(madrasa: any): string {
  if (!madrasa) return '';
  const rawEng = cleanInstitutionName(madrasa.englishName || '');
  const rawUrdu = cleanInstitutionName(madrasa.urduName || (madrasa as any).name || '');

  const hasUrdu = (str: string | undefined | null) =>
    Boolean(str && /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/.test(str));

  let candidate = '';

  // 1. If englishName is provided and contains NO Urdu characters, use it directly
  if (rawEng && !hasUrdu(rawEng)) {
    candidate = rawEng;
  } else if (rawEng && hasUrdu(rawEng)) {
    // 2. If englishName contains mixed English and Urdu text (e.g. "Darul Uloom Faizan-e- قرآن و حدیث"),
    // transliterate all the Urdu words inside it to English
    candidate = transliterateUrduToEnglish(rawEng);
  } else if (rawUrdu) {
    // 3. Fallback to urduName
    candidate = !hasUrdu(rawUrdu) ? rawUrdu : transliterateUrduToEnglish(rawUrdu);
  }

  // 4. Strict guarantee: If any Urdu characters still remain, strip them so line 2 is 100% pure English
  if (hasUrdu(candidate)) {
    candidate = transliterateUrduToEnglish(candidate);
    candidate = candidate.replace(/[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/g, '').trim();
  }

  return candidate
    .replace(/\s*-\s*-+\s*/g, '-')
    .replace(/Faizan-e-\s+/g, 'Faizan-e-')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s*-\s*$/g, '')
    .trim();
}

// Common English to Urdu Name Dictionary
const ENGLISH_TO_URDU_MAP: Record<string, string> = {
  'mohammad': 'محمد',
  'muhammad': 'محمد',
  'mohd': 'محمد',
  'md': 'محمد',
  'ahmad': 'احمد',
  'ahmed': 'احمد',
  'ali': 'علی',
  'hasan': 'حسن',
  'hassan': 'حسن',
  'hussain': 'حسین',
  'husain': 'حسین',
  'abdul allah': 'عبد اللہ',
  'abdulallah': 'عبد اللہ',
  'abdullah': 'عبد اللہ',
  'abdul': 'عبدال',
  'rahman': 'رحمن',
  'rehman': 'رحمن',
  'abdur rahman': 'عبدالرحمن',
  'abdul rahman': 'عبدالرحمن',
  'abdur rehman': 'عبدالرحمن',
  'abdul rehman': 'عبدالرحمن',
  'karim': 'کریم',
  'kareem': 'کریم',
  'abdul karim': 'عبدالکریم',
  'abdul kareem': 'عبدالکریم',
  'jamil': 'جمیل',
  'jameel': 'جمیل',
  'jalikn': 'جمیل اختر',
  'akram': 'اکرم',
  'irfan': 'عرفان',
  'erfan': 'عرفان',
  'khalid': 'خالد',
  'khalod': 'خالد',
  'farooq': 'فاروق',
  'farouq': 'فاروق',
  'umar': 'عمر',
  'omer': 'عمر',
  'usman': 'عثمان',
  'osman': 'عثمان',
  'bilal': 'بلال',
  'salim': 'سلیم',
  'saleem': 'سلیم',
  'arshad': 'ارشد',
  'raza': 'رضا',
  'shahid': 'شاہد',
  'makram': 'مکرم',
  'mokarram': 'مکرم',
  'zaid': 'زید',
  'hamza': 'حمزہ',
  'yusuf': 'یوسف',
  'yousuf': 'یوسف',
  'mustafa': 'مصطفیٰ',
  'murtaza': 'مرتضیٰ',
  'iqbal': 'اقبال',
  'anwar': 'انوار',
  'aslam': 'اسلم',
  'rashid': 'راشد',
  'sajid': 'ساجد',
  'zahid': 'زاہد',
  'tahir': 'طاہر',
  'nadeem': 'ندیم',
  'wasim': 'وسیم',
  'waseem': 'وسیم',
  'naeem': 'نعیم',
  'nasir': 'ناصر',
  'bashir': 'بشیر',
  'nazir': 'نذیر',
  'zubair': 'زبیر',
  'sohail': 'سہیل',
  'tanveer': 'تنویر',
  'shabbir': 'شبیر',
  'alam': 'عالم',
  'akhtar': 'اختر',
  'ansari': 'انصاری',
  'qadri': 'قادری',
  'chishti': 'چشتی',
  'rizvi': 'رضوی',
  'barkati': 'برکاتی',
  'khan': 'خان',
  'noori': 'نوری',
  'attari': 'عطاری',
  'ashrafi': 'اشرفی',
  'misbahi': 'مصباحی',
  'qasim': 'قاسم',
  'imran': 'عمران',
  'rizwan': 'رضوان',
  'kamran': 'کامران',
  'shafiq': 'شفیق',
  'shams': 'شمس',
  'habib': 'حبیب',
  'munawwar': 'منور',
  'afzal': 'افضل',
  'ajmal': 'اجمل',
  'akbar': 'اکبر',
  'asghar': 'اصغر',
  'altaf': 'الطاف',
  'ayub': 'ایوب',
  'dawood': 'داؤد',
  'haroon': 'ہارون',
  'idrees': 'ادریس',
  'ilyas': 'الیاس',
  'ismail': 'اسماعیل',
  'ishaq': 'اسحاق',
  'yaqoob': 'یعقوب',
  'sulaiman': 'سلیمان',
  'zakariya': 'زکریا',
  'yahya': 'یحییٰ',
  'shoeb': 'شعیب',
  'luqman': 'لقمان',
  'yunus': 'یونس',
  'zafar': 'ظفر',
  'masood': 'مسعود',
  'mahmood': 'محمود',
  'maqsood': 'مقصود',
  'manzoor': 'منظور',
  'mansoor': 'منصور',
  'mubarak': 'مبارک',
  'mushtaq': 'مشتاق',
  'mukhtar': 'مختار',
  'mumtaz': 'ممتاز',
  'munir': 'منیر',
  'mujtaba': 'مجتبیٰ',
  'nawaz': 'نواز',
  'nizam': 'نظام',
  'pervez': 'پرویز',
  'qamar': 'قمر',
  'rafiq': 'رفیق',
  'sabir': 'صابر',
  'sadiq': 'صادق',
  'saeed': 'سعید',
  'samad': 'صمد',
  'sarfaraz': 'سرفراز',
  'shakir': 'شاکر',
  'shaukat': 'شوکت',
  'zaheer': 'ظہیر',
  'zia': 'ضیاء',
  'sahil': 'ساحل',
  'mohtasham': 'محتشم',
  'siddique': 'صدیق',
  'siddiq': 'صدیق',
  'farhan': 'فرحان',
  'faizan': 'فیضان',
  'rehan': 'ریحان',
  'azhar': 'اظہر',
  'athar': 'اطہر',
  'arif': 'عارف',
  'asif': 'آصف',
  'aatif': 'عاطف',
  'atif': 'عاطف',
  'tariq': 'طارق',
  'faisal': 'فیصل',
  'jawaid': 'جاوید',
  'javed': 'جاوید',
  'shahbaz': 'شہباز',
  'ejaz': 'اعجاز',
  'aijaz': 'اعجاز',
  'mumshad': 'ممشاد',
  'dilshad': 'دلشاد',
  'naushad': 'نوشاد',
  'arfat': 'عرفات',
  'arafat': 'عرفات',
};

const ENGLISH_CHAR_TO_URDU: Record<string, string> = {
  'a': 'ا', 'b': 'ب', 'c': 'ک', 'd': 'د', 'e': 'ے',
  'f': 'ف', 'g': 'گ', 'h': 'ہ', 'i': 'ی', 'j': 'ج',
  'k': 'ک', 'l': 'ل', 'm': 'م', 'n': 'ن', 'o': 'و',
  'p': 'پ', 'q': 'ق', 'r': 'ر', 's': 'س', 't': 'ت',
  'u': 'و', 'v': 'و', 'w': 'و', 'x': 'کس', 'y': 'ی', 'z': 'ز'
};

/**
 * Transliterates an English name into Urdu script
 */
export function transliterateEnglishToUrdu(engText: string): string {
  if (!engText) return '';
  const trimmed = engText.trim();
  const lower = trimmed.toLowerCase();

  // 1. Direct match for full name
  if (ENGLISH_TO_URDU_MAP[lower]) {
    return ENGLISH_TO_URDU_MAP[lower];
  }

  // 2. Word-by-word match
  const words = trimmed.split(/\s+/);
  const urduWords = words.map((w) => {
    const wLower = w.toLowerCase().replace(/[^a-z]/g, '');
    if (ENGLISH_TO_URDU_MAP[wLower]) {
      return ENGLISH_TO_URDU_MAP[wLower];
    }
    // Sub-word match (e.g., "AbdulAllah" -> "Abdul" + "Allah")
    if (wLower.startsWith('abdul') && wLower.length > 5) {
      const rest = wLower.slice(5);
      if (ENGLISH_TO_URDU_MAP[rest]) {
        return 'عبدال' + ENGLISH_TO_URDU_MAP[rest];
      }
    }
    // Phonetic letter-by-letter approximation
    let result = '';
    for (const ch of wLower) {
      result += ENGLISH_CHAR_TO_URDU[ch] || ch;
    }
    return result;
  });

  return urduWords.join(' ');
}

/**
 * Strictly ensures a name is returned in Urdu script.
 * If the string contains Latin/English letters, it converts them to Urdu.
 */
export function ensureUrduName(name: string | undefined | null): string {
  if (!name) return '';
  const str = String(name).trim();
  if (!str) return '';

  // If already completely in Urdu/Arabic script, return cleaned version
  const hasEnglish = /[a-zA-Z]/.test(str);
  if (!hasEnglish) {
    return str;
  }

  // If mixed or purely English, convert English segments to Urdu
  return transliterateEnglishToUrdu(str);
}
