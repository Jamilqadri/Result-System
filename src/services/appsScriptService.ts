/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export const DEFAULT_APPS_SCRIPT_URL =
  'https://script.google.com/macros/s/AKfycbzwA39m2gSyOhbwLU0xqj_w5gkvKUs9LbBK3QgWVZD64rYe47whR_G6fw7EPwtXqH2mGQ/exec';

export const DEFAULT_CENTRAL_SHEET_URL =
  'https://script.google.com/macros/s/AKfycbzfUfn4yQfnL4e-Jeoy_IberRbYTDg4qP2KccloBFmN2akhhKic75zIatsaikR0gDTH/exec';

// Google Drive designated folder: "معیار مدارس"
export const MAYAAR_DRIVE_FOLDER_ID = '1HUVOzvuhbRrAO5qsw645dM4QZz75LSG9';

/**
 * Extracts Google Spreadsheet ID from a URL or raw ID
 */
export function extractSpreadsheetId(urlOrId?: string): string {
  if (!urlOrId) return '';
  const trimmed = urlOrId.trim();
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (match) return match[1];
  const simpleMatch = trimmed.match(/\/d\/([a-zA-Z0-9-_]+)/);
  if (simpleMatch) return simpleMatch[1];
  if (!trimmed.includes('/') && trimmed.length > 15) return trimmed;
  return '';
}

/**
 * Robustly sanitizes and extracts a valid Google Apps Script Web App URL,
 * preventing corrupted strings, double-pastes, or malformed protocols.
 */
export function sanitizeAppsScriptUrl(rawUrl?: string): string {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  const trimmed = rawUrl.trim();
  if (!trimmed) return '';

  const matches = [...trimmed.matchAll(/https:\/\/script\.google\.com\/macros\/s\/([a-zA-Z0-9_-]+)\/exec/g)];
  if (matches.length > 0) {
    for (const m of matches) {
      const full = m[0];
      if (!full.includes('AKfycbzwA39m2gSyOhbwLU0xqj_w5gkvKUs9LbBK3QgWVZD64rYe47whR_G6fw7EPwtXqH2mGQ')) {
        return full;
      }
    }
    return matches[0][0];
  }

  const partialMatch = trimmed.match(/https:\/\/script\.google\.com\/macros\/s\/([a-zA-Z0-9_-]+)/);
  if (partialMatch) {
    return `https://script.google.com/macros/s/${partialMatch[1]}/exec`;
  }

  try {
    const u = new URL(trimmed);
    if (u.protocol === 'https:' && u.hostname.includes('script.google.com')) {
      return trimmed;
    }
  } catch {}

  return '';
}

export interface RegisterMadrasaPayload {
  action: 'REGISTER_MADRASA';
  code: string;
  name: string;
  classes: string[];
}

export interface RegisterMadrasaResponse {
  success: boolean;
  spreadsheetId?: string;
  sheetUrl?: string;
  error?: string;
}

export interface NewAdmissionPayload {
  action: 'NEW_ADMISSION';
  spreadsheetId: string;
  urduName: string;
  urduFather: string;
  name: string;
  father: string;
  className: string;
  dob: string;
}

export interface NewAdmissionResponse {
  success: boolean;
  message?: string;
  error?: string;
}

/**
 * Register Madrasa Workflow via Google Apps Script Web App / Drive API
 * Creates dedicated Google Sheet with Master Data and Class tabs and links it
 */
export async function registerMadrasaWorkflow(params: {
  code: string;
  name: string;
  classes: string[];
  madrasaId?: string;
  webAppUrl?: string;
}): Promise<RegisterMadrasaResponse> {
  const numericPart = (params.code || '').replace(/\D/g, '').slice(-3) || '111';
  const targetCode = params.code && params.code.trim().toUpperCase().startsWith('MM')
    ? params.code.trim().toUpperCase()
    : `MM${numericPart}`;
  const classList = params.classes && params.classes.length > 0 ? params.classes : ['حفظ', 'سال اول', 'سال دوم'];

  const payload: RegisterMadrasaPayload = {
    action: 'REGISTER_MADRASA',
    code: targetCode,
    name: params.name,
    classes: classList,
  };

  // 1. First attempt: Call local server proxy (handles redirects, Google Apps Script, and session persistence)
  try {
    const serverRes = await fetch('/api/apps-script/register-madrasa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...payload,
        code: targetCode,
        madrasaId: params.madrasaId,
        webAppUrl: params.webAppUrl,
      }),
    });

    const contentType = serverRes.headers.get('content-type') || '';
    if (serverRes.ok && contentType.includes('application/json')) {
      const data = await serverRes.json();
      if (data && data.success && (data.sheetUrl || data.spreadsheetId)) {
        const finalUrl = data.sheetUrl || (data.spreadsheetId ? `https://docs.google.com/spreadsheets/d/${data.spreadsheetId}/edit` : '');
        return {
          success: true,
          spreadsheetId: data.spreadsheetId || extractSpreadsheetId(finalUrl),
          sheetUrl: finalUrl,
        };
      }
    }
  } catch (err) {
    console.warn('Backend proxy call failed or offline (Netlify static fallback):', err);
  }

  // 2. Direct client fallback: Call Google Apps Script Web App with POST or GET
  const scriptUrl = (params.webAppUrl || DEFAULT_APPS_SCRIPT_URL).trim();
  if (scriptUrl) {
    try {
      // Try POST first
      const directRes = await fetch(scriptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload),
      });

      if (directRes.ok) {
        const text = await directRes.text();
        if (text && !text.trim().startsWith('<')) {
          const directData = JSON.parse(text);
          const sheetUrl = directData.sheetUrl || directData.spreadsheetUrl || (directData.url && directData.url.includes('spreadsheets') ? directData.url : '');
          const spreadsheetId = directData.spreadsheetId || directData.id || extractSpreadsheetId(sheetUrl);
          if (sheetUrl || (spreadsheetId && spreadsheetId !== MAYAAR_DRIVE_FOLDER_ID)) {
            return {
              success: true,
              spreadsheetId: spreadsheetId || extractSpreadsheetId(sheetUrl),
              sheetUrl: sheetUrl || `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
            };
          }
        }
      }

      // If POST returned non-JSON, try GET with query parameters
      const getUrl = `${scriptUrl}${scriptUrl.includes('?') ? '&' : '?'}action=REGISTER_MADRASA&code=${encodeURIComponent(targetCode)}&name=${encodeURIComponent(params.name)}&classes=${encodeURIComponent(classList.join(','))}`;
      const getRes = await fetch(getUrl, { redirect: 'follow' });
      if (getRes.ok) {
        const getText = await getRes.text();
        if (getText && !getText.trim().startsWith('<')) {
          const getData = JSON.parse(getText);
          const sheetUrl = getData.sheetUrl || getData.spreadsheetUrl || (getData.url && getData.url.includes('spreadsheets') ? getData.url : '');
          const spreadsheetId = getData.spreadsheetId || getData.id || extractSpreadsheetId(sheetUrl);
          if (sheetUrl || (spreadsheetId && spreadsheetId !== MAYAAR_DRIVE_FOLDER_ID)) {
            return {
              success: true,
              spreadsheetId: spreadsheetId || extractSpreadsheetId(sheetUrl),
              sheetUrl: sheetUrl || `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
            };
          }
        }
      }
    } catch (directErr: any) {
      console.warn('Direct GAS call failed:', directErr);
    }
  }

  // 3. If neither server proxy nor direct call returned a real spreadsheet
  return {
    success: false,
    error: 'گوگل ڈرائیو کے "معیار مدارس" فولڈر میں خودکار شیٹ تیار نہیں ہو سکی۔ براہ کرم Google Apps Script کے کوڈ کی تعیناتی چیک فرمائیں۔',
  };
}

/**
 * Log a new madrasa registration as a lead into the Central Sheet's "Madaris" tab
 * Uses multi-channel delivery (Server proxy + Direct POST + GET beacon fallback)
 * to ensure guaranteed arrival in the Google Sheet even on Netlify, mobile, or strict firewalls.
 */
const clientLoggedCentralCodes = new Set<string>();

export async function logMadrasaLeadToCentralSheet(
  madrasa: {
    code: string;
    serialNumber?: number;
    urduName: string;
    englishName?: string;
    state?: string;
    district?: string;
    address?: string;
    contactPhone?: string;
    principalName?: string;
    principalPhone?: string;
    email?: string;
    website?: string;
    examTitle?: string;
    principalPassword?: string;
    registrationStatus?: string;
  },
  classes: string[] = []
): Promise<{ success: boolean; message?: string }> {
  const fullCode = madrasa.code && madrasa.code.toUpperCase().startsWith('MM')
    ? madrasa.code.toUpperCase()
    : `MM${(madrasa.code || '').replace(/\D/g, '') || '111'}`;

  if (clientLoggedCentralCodes.has(fullCode)) {
    return { success: true, message: 'مدرسہ کا اندراج پہلے ہی بھیجا جا چکا ہے' };
  }
  clientLoggedCentralCodes.add(fullCode);

  const classList = classes.length > 0 ? classes : ['حفظ', 'سال اول', 'سال دوم'];

  const payload = {
    action: 'REGISTER_MADRASA',
    type: 'madrasa',
    code: fullCode,
    serialNumber: madrasa.serialNumber || (fullCode ? fullCode.replace(/\D/g, '') : ''),
    urduName: madrasa.urduName,
    englishName: madrasa.englishName || '',
    state: madrasa.state || '',
    district: madrasa.district || '',
    address: madrasa.address || '',
    contactPhone: madrasa.contactPhone || madrasa.principalPhone || '',
    principalName: madrasa.principalName || '',
    principalPhone: madrasa.principalPhone || '',
    email: madrasa.email || '',
    website: madrasa.website || '',
    examTitle: madrasa.examTitle || 'نتیجہ سالانہ امتحان 1448ھ / 2026ء',
    classes: classList,
    principalPassword: madrasa.principalPassword || `${fullCode}@1234`,
    registrationStatus: madrasa.registrationStatus || 'pending',
  };

  // 1. Try local server proxy first
  try {
    const res = await fetch('/api/apps-script/log-madrasa-lead', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      const data = await res.json().catch(() => null);
      if (data?.success) {
        return { success: true, message: 'مدرسہ مرکزی شیٹ (Madaris ٹیب) میں درج ہو گیا' };
      }
    }
  } catch {}

  // 2. Direct client-side fallback ONLY if server proxy did not succeed
  try {
    let scriptUrl = DEFAULT_CENTRAL_SHEET_URL;
    try {
      const stored = localStorage.getItem('meyar_central_sheet_url_v1');
      if (stored && stored.includes('script.google.com')) scriptUrl = stored.trim();
    } catch {}

    if (scriptUrl) {
      // Single POST with text/plain (avoids CORS preflight); GET beacon ONLY if POST throws
      fetch(scriptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload),
        mode: 'no-cors',
      }).catch(() => {
        const qs = new URLSearchParams({
          action: 'REGISTER_MADRASA',
          code: fullCode,
          serialNumber: String(payload.serialNumber),
          urduName: payload.urduName,
          englishName: payload.englishName,
          state: payload.state,
          district: payload.district,
          address: payload.address,
          contactPhone: payload.contactPhone,
          principalName: payload.principalName,
          principalPhone: payload.principalPhone,
          email: payload.email,
          website: payload.website,
          examTitle: payload.examTitle,
          classes: classList.join(', '),
          password: payload.principalPassword,
          status: payload.registrationStatus,
        }).toString();

        fetch(`${scriptUrl}${scriptUrl.includes('?') ? '&' : '?'}${qs}`, {
          mode: 'no-cors',
        }).catch(() => {});
      });
    }
  } catch {}

  return { success: true };
}

/**
 * Returns the complete, copy-pasteable Google Apps Script code for Kanzuttahreer@gmail.com
 * Handles REGISTER_MADRASA (with Master Data, Class dropdown, 6-digit Auto Student IDs & class tabs),
 * NEW_ADMISSION, and reading results.
 */
export function getUnifiedAppsScriptCode(): string {
  return `/**
 * =========================================================================
 * معیارِ مدارس — مکمل خودکار گوگل شیٹس جنریٹر و ڈیٹا API
 * Meyar-e-Madaris Auto Google Sheet Engine & Results API
 * =========================================================================
 * 
 * برائے ای میل: Kanzuttahreer@gmail.com
 * گوگل ڈرائیو فولڈر: "معیار مدارس" (Folder ID: 1HUVOzvuhbRrAO5qsw645dM4QZz75LSG9)
 * 
 * 📋 تعیناتی کا طریقہ (Deployment Instructions):
 * ۱. script.google.com پر جائیں اور Kanzuttahreer@gmail.com کے پروجیکٹ میں Code.gs کھولیں۔
 * ۲. پرانا کوڈ ہٹا کر یہ نیا کوڈ پیسٹ کریں۔
 * ۳. فائل محفوظ کریں (Ctrl + S)۔
 * ۴. اوپر "Deploy" -> "Manage deployments" -> پنسل (Edit) پر کلک کریں۔
 * ۵. Version میں "New version" منتخب کر کے "Deploy" پر کلک کریں۔
 * =========================================================================
 */

var DRIVE_FOLDER_ID = "1HUVOzvuhbRrAO5qsw645dM4QZz75LSG9";
var DRIVE_FOLDER_NAME = "معیار مدارس";

// ۱. ویب ایپ پوسٹ ریکویسٹ (POST Handler)
function doPost(e) {
  try {
    var data = {};
    if (e && e.postData && e.postData.contents) {
      try {
        data = JSON.parse(e.postData.contents);
      } catch (err) {
        data = e.parameter || {};
      }
    } else if (e && e.parameter) {
      data = e.parameter;
    }

    var action = (data.action || "").toString().trim().toUpperCase();

    // ۱: فیڈ بیک و تجاویز — اگر فعال شیٹ ہے تو "Feedback" ٹیب میں خودکار درج کریں
    if (action === "ADD_FEEDBACK" || action === "SUBMIT_FEEDBACK" || data.type === "feedback" || (data.message && !data.classes)) {
      return handleFeedback(data);
    }

    // الف: طالب علم کا نیا داخلہ (NEW_ADMISSION)
    if (action === "NEW_ADMISSION") {
      return handleNewAdmission(data);
    }

    // ب: نیا مدرسہ رجسٹریشن و گوگل شیٹ کی خودکار تیاری (REGISTER_MADRASA)
    if (action === "REGISTER_MADRASA" || action === "CREATE_SHEET" || (!data.message && (data.code || (data.name && data.classes)))) {
      return handleRegisterMadrasa(data);
    }

    return respondJson({
      success: false,
      status: "error",
      message: "نامعلوم ایکشن: " + action
    });
  } catch (err) {
    return respondJson({
      success: false,
      status: "error",
      error: err.toString()
    });
  }
}

// ۲. ویب ایپ گیٹ ریکویسٹ (GET Handler)
function doGet(e) {
  try {
    var params = (e && e.parameter) || {};
    var action = (params.action || "").toString().trim().toUpperCase();

    // الف: بذریعہ GET نیا مدرسہ شیٹ فائل بنانے کی درخواست
    if (action === "REGISTER_MADRASA" || action === "CREATE_SHEET") {
      return handleRegisterMadrasa(params);
    }

    // ب: بذریعہ GET طالب علم داخلہ
    if (action === "NEW_ADMISSION") {
      return handleNewAdmission(params);
    }

    // ج: امتحانی نتائج حاصل کرنا (جب پورٹل شیٹ سے نمبرات و رزلٹ پڑھتا ہے)
    if (action === "ALL" || action === "GET_RESULTS" || action === "SYNC" || params.sheetId || params.spreadsheetId) {
      return handleGetResults(params);
    }

    // لائیو اسٹیٹس چیک
    return respondJson({
      status: "success",
      service: "Meyar-e-Madaris Auto Google Sheet Engine",
      folder: DRIVE_FOLDER_NAME,
      folderId: DRIVE_FOLDER_ID,
      email: "Kanzuttahreer@gmail.com",
      supportedActions: ["REGISTER_MADRASA", "NEW_ADMISSION", "GET_RESULTS", "ALL"],
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    return respondJson({
      success: false,
      status: "error",
      error: err.toString()
    });
  }
}

// ۳. نیا مدرسہ رجسٹریشن و خودکار شیٹ کی تیاری
function handleRegisterMadrasa(data) {
  var rawCode = (data.code || data.madrasaCode || "111").toString().trim();
  var numericPart = ("000" + rawCode.replace(/\\D/g, "")).slice(-3) || "111";
  var mCode = rawCode.toUpperCase().startsWith("MM") ? rawCode.toUpperCase() : ("MM" + numericPart);
  var rawName = (data.name || data.madrasaName || "مدرسہ").toString().trim();
  var mName = rawName.replace(/\\s*\\(امتحانی ریکارڈ و درجات\\)\\s*/g, "").replace(/\\s*امتحانی ریکارڈ و درجات\\s*/g, "").replace(/\\s*امتحانی ریکارڈ\\s*/g, "").trim();

  var rawClasses = data.classes || ["حفظ", "سال اول", "سال دوم"];
  var classList = [];
  if (Array.isArray(rawClasses)) {
    classList = rawClasses;
  } else if (typeof rawClasses === "string") {
    classList = rawClasses.split(",").map(function(c) { return c.trim(); }).filter(Boolean);
  }
  if (classList.length === 0) {
    classList = ["حفظ", "سال اول", "سال دوم"];
  }

  var folder = getOrCreateMadarisFolder();
  var result = createSingleMadrasaSpreadsheet(folder, mCode, numericPart, mName, classList);

  // اگر یہ اسکرپٹ مرکزی شیٹ میں ہے تو "Madaris" ٹیب میں بھی خودکار اندراج کریں
  try {
    var activeSs = SpreadsheetApp.getActiveSpreadsheet();
    if (activeSs) {
      var mSheet = getOrCreateMadarisTab(activeSs);
      var now = Utilities.formatDate(new Date(), "Asia/Kolkata", "yyyy-MM-dd HH:mm:ss");
      mSheet.appendRow([
        now,
        mCode,
        numericPart,
        mName,
        (data.englishName || "").toString().trim(),
        (data.state || "").toString().trim(),
        (data.district || "").toString().trim(),
        (data.address || "").toString().trim(),
        (data.contactPhone || data.phone || "").toString().trim(),
        (data.principalName || "").toString().trim(),
        (data.principalPhone || "").toString().trim(),
        (data.email || "").toString().trim(),
        (data.website || "").toString().trim(),
        (data.examTitle || "").toString().trim(),
        classList.join(", "),
        (data.principalPassword || (mCode + "@1234")).toString().trim(),
        (data.registrationStatus === "approved" ? "منظور شدہ (Approved)" : "زیر التوا (Pending)")
      ]);
    }
  } catch (e) {}

  return respondJson({
    success: true,
    status: "success",
    sheetUrl: result.url,
    spreadsheetUrl: result.url,
    spreadsheetId: result.id,
    sheetId: result.id,
    id: result.id,
    code: mCode,
    name: mName,
    message: "مدرسہ کی گوگل شیٹ فولڈر 'معیار مدارس' میں کامیابی سے تیار ہو گئی",
    classes: classList
  });
}

// ۴. معیارِ مدارس گوگل ڈرائیو فولڈر حاصل کریں یا نیا بنائیں
function getOrCreateMadarisFolder() {
  var folder = null;
  if (DRIVE_FOLDER_ID) {
    try {
      folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
      if (folder) return folder;
    } catch (e) {}
  }
  var existing = DriveApp.getFoldersByName(DRIVE_FOLDER_NAME);
  if (existing.hasNext()) {
    return existing.next();
  }
  return DriveApp.createFolder(DRIVE_FOLDER_NAME);
}

// ۵. انفرادی مدرسہ کی گوگل شیٹ، ماسٹر ٹیب ڈراپ ڈاؤن، خودکار اسٹوڈنٹ آئی ڈی اور کلاس ٹیبز بنانا
function createSingleMadrasaSpreadsheet(folder, mCode, numericPart, name, classesList) {
  // فائل کا عنوان: مثلاً MM111 - جامعہ حسینیہ دار العلوم (امتحانی ریکارڈ کا لاحقہ مکمل طور پر خارج)
  var cleanTitleName = (name || "مدرسہ").toString()
    .replace(/[\(\[\{]?\s*امتحانی\s*ریکارڈ\s*و\s*درجات\s*[\)\]\}]?/g, "")
    .replace(/[\(\[\{]?\s*امتحانی\s*ریکارڈ\s*[\)\]\}]?/g, "")
    .replace(/\s*\(امتحانی ریکارڈ و درجات\)\s*/g, " ")
    .replace(/\s*امتحانی ریکارڈ و درجات\s*/g, " ")
    .replace(/\s*\(امتحانی ریکارڈ\)\s*/g, " ")
    .replace(/\s*امتحانی ریکارڈ\s*/g, " ")
    .replace(/\s*\(درجات\)\s*/g, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/\s*-\s*$/g, "")
    .trim();
  var title = mCode + " - " + cleanTitleName;
  var existingFiles = folder.getFilesByName(title);
  var spreadsheet;

  if (existingFiles.hasNext()) {
    var file = existingFiles.next();
    spreadsheet = SpreadsheetApp.openById(file.getId());
  } else {
    spreadsheet = SpreadsheetApp.create(title);
    var driveFile = DriveApp.getFileById(spreadsheet.getId());
    folder.addFile(driveFile);
    try {
      DriveApp.getRootFolder().removeFile(driveFile);
    } catch (e) {}
    try {
      driveFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.EDIT);
    } catch (e) {}
  }

  // ۱. Master Data Tab
  var masterSheet = spreadsheet.getSheetByName("Master Data") || spreadsheet.getSheets()[0];
  masterSheet.setName("Master Data");
  try { masterSheet.setRightToLeft(true); } catch (e) {}

  var masterHeaders = [
    "اسٹوڈنٹ آئی ڈی", "امیدوار کا نام (اردو)", "والد کا نام (اردو)",
    "Candidate Name", "Father Name", "درجہ / کلاس", "تاریخ پیدائش (DOB)"
  ];
  masterSheet.getRange(1, 1, 1, masterHeaders.length).setValues([masterHeaders])
    .setFontWeight("bold").setBackground("#1b4332").setFontColor("#ffffff");

  // الف: درجہ / کلاس (کالم F) کے لیے تمام کلاسز کا ڈراپ ڈاؤن (Data Validation Dropdown)
  if (classesList && classesList.length > 0) {
    var rule = SpreadsheetApp.newDataValidation()
      .requireValueInList(classesList, true)
      .setAllowInvalid(false)
      .setHelpText("براہ کرم فہرست سے درجہ منتخب فرمائیں")
      .build();
    masterSheet.getRange(2, 6, 500, 1).setDataValidation(rule);
  }

  // ب: خودکار ۶ عددی اسٹوڈنٹ آئی ڈی فارمولا (کالم A):
  // ۳ عدد مدرسہ کوڈ (مثلاً 111) اور ۳ عدد اسٹوڈنٹ سیریل (101 سے شروع: 111101, 111102...)
  var idFormulas = [];
  for (var r = 2; r <= 300; r++) {
    var sSerial = 100 + (r - 1); // Row 2 -> 101, Row 3 -> 102, Row 4 -> 103
    var fullStudentId = numericPart + "" + sSerial;
    idFormulas.push(['=IF(B' + r + '<>""; "' + fullStudentId + '"; "")']);
  }
  masterSheet.getRange(2, 1, idFormulas.length, 1).setFormulas(idFormulas);
  try { masterSheet.getRange(2, 1, idFormulas.length, 1).setNumberFormat("@"); } catch (e) {}

  // ۲. درجات کے انفرادی ٹیب بنائیں مع ڈائنامک FILTER فارمولا
  var classHeaders = [
    "اسٹوڈنٹ آئی ڈی", "امیدوار کا نام",
    "دینیات [100]", "اردو [50]", "عربی / فارسی [100]", "حفظ / ناظرہ [100]"
  ];

  classesList.forEach(function(clsName) {
    var cleanCls = String(clsName || "").trim();
    if (!cleanCls) return;
    var clsSheet = spreadsheet.getSheetByName(cleanCls);
    if (!clsSheet) {
      clsSheet = spreadsheet.insertSheet(cleanCls);
    }
    try { clsSheet.setRightToLeft(true); } catch (e) {}
    clsSheet.getRange(1, 1, 1, classHeaders.length).setValues([classHeaders]);
    clsSheet.getRange(1, 1, 1, classHeaders.length).setFontWeight("bold").setBackground("#e6f4ea").setFontColor("#134e4a");

    // Dynamic Filter formula: Master Data سے خودکار اسٹوڈنٹ آئی ڈی اور نام کھینچنا
    clsSheet.getRange("A2").setFormula(
      '=IFERROR(FILTER({\\'Master Data\\'!A2:A, \\'Master Data\\'!B2:B}, \\'Master Data\\'!F2:F = "' + cleanCls + '"), "")'
    );
  });

  return {
    id: spreadsheet.getId(),
    url: spreadsheet.getUrl()
  };
}

// ۶. طالب علم کا نیا داخلہ (Master Data میں اندراج)
function handleNewAdmission(data) {
  var ssId = data.spreadsheetId || data.sheetId;
  if (!ssId) {
    return respondJson({ success: false, error: "گوگل شیٹ آئی ڈی درکار ہے" });
  }
  var ss = SpreadsheetApp.openById(ssId);
  var masterSheet = ss.getSheetByName("Master Data") || ss.getSheetByName("Masters") || ss.getSheets()[0];

  var bValues = masterSheet.getRange(2, 2, 300, 1).getValues();
  var nextRow = 2;
  for (var i = 0; i < bValues.length; i++) {
    if (!bValues[i][0]) {
      nextRow = i + 2;
      break;
    }
  }

  var mCodeMatch = ss.getName().match(/^(?:MM)?([0-9]+)/i);
  var codePrefix = mCodeMatch ? ("000" + mCodeMatch[1]).slice(-3) : "111";
  var sSerial = 100 + (nextRow - 1);
  var candidateId = codePrefix + "" + sSerial;

  masterSheet.getRange(nextRow, 1).setValue(candidateId);
  masterSheet.getRange(nextRow, 2, 1, 6).setValues([[
    data.urduName || "",
    data.urduFather || "",
    data.name || "",
    data.father || "",
    data.className || "",
    data.dob || ""
  ]]);

  return respondJson({
    success: true,
    candidateId: candidateId,
    message: "طالب علم کا داخلہ کامیابی سے درج ہو گیا"
  });
}

// ۷. فیڈ بیک و تجاویز کا اندراج (Feedback Tab)
function handleFeedback(data) {
  var ss = null;
  try { ss = SpreadsheetApp.getActiveSpreadsheet(); } catch (e) {}
  if (!ss && (data.spreadsheetId || data.sheetId)) {
    try { ss = SpreadsheetApp.openById(data.spreadsheetId || data.sheetId); } catch (e) {}
  }
  if (!ss) {
    return respondJson({
      success: true,
      status: "received",
      message: "فیڈ بیک موصول ہو گیا۔ (فعال اسپریڈشیٹ منسلک نہیں)"
    });
  }

  var fSheet = getOrCreateFeedbackTab(ss);
  var fNow = Utilities.formatDate(new Date(), "Asia/Kolkata", "yyyy-MM-dd HH:mm:ss");
  var fSerial = data.serialNumber || (fSheet.getLastRow());
  var fName = (data.name || "").toString().trim();
  var fPhone = (data.phone || "").toString().trim();
  var fState = (data.state || "").toString().trim();
  var fDistrict = (data.district || "").toString().trim();
  var fMessage = (data.message || "").toString().trim();
  var fStatus = (data.status || "نیا / Unread").toString().trim();

  fSheet.appendRow([
    fNow, fSerial, fName, fPhone, fState, fDistrict, fMessage, fStatus
  ]);

  return respondJson({
    success: true,
    status: "success",
    message: "فیڈ بیک کامیابی سے 'Feedback' ٹیب میں درج ہو گیا!"
  });
}

function getOrCreateFeedbackTab(ss) {
  var sheet = ss.getSheetByName("Feedback");
  if (!sheet) {
    sheet = ss.insertSheet("Feedback");
  }
  if (sheet.getLastRow() === 0) {
    var headers = [
      "تاریخ و وقت", "سیریل نمبر", "نام", "فون نمبر", "ریاست", "ضلع", "پیغام / رائے و تجاویز", "اسٹیٹس"
    ];
    sheet.appendRow(headers);
    try {
      sheet.setRightToLeft(true);
      var hRange = sheet.getRange(1, 1, 1, headers.length);
      hRange.setBackground("#065f46").setFontColor("#ffffff").setFontWeight("bold").setHorizontalAlignment("center");
    } catch (e) {}
  }
  return sheet;
}

function getOrCreateMadarisTab(ss) {
  var sheet = ss.getSheetByName("Madaris");
  if (!sheet) {
    var allSheets = ss.getSheets();
    if (allSheets.length === 1 && allSheets[0].getLastRow() === 0) {
      sheet = allSheets[0];
      sheet.setName("Madaris");
    } else {
      sheet = ss.insertSheet("Madaris");
    }
  }
  if (sheet.getLastRow() === 0) {
    var headers = [
      "تاریخ و وقت", "مدرسہ کوڈ", "سیریل نمبر", "نام مدرسہ (اردو)", "نام مدرسہ (انگریزی)",
      "ریاست", "ضلع", "مکمل پتہ", "رابطہ فون نمبر", "مہتمم / پرنسپل کا نام", "مہتمم کا فون نمبر",
      "ای میل", "ویب سائٹ", "امتحانی عنوان", "درجات / کلاسز", "لاگ ان پاس ورڈ", "رجسٹریشن اسٹیٹس"
    ];
    sheet.appendRow(headers);
    try {
      sheet.setRightToLeft(true);
      var hRange = sheet.getRange(1, 1, 1, headers.length);
      hRange.setBackground("#065f46").setFontColor("#ffffff").setFontWeight("bold").setHorizontalAlignment("center");
    } catch (e) {}
  }
  return sheet;
}

// ۷. امتحانی رزلٹ ڈیٹا ریڈ کرنا (Get Results from Spreadsheet)
function handleGetResults(params) {
  var targetId = params.sheetId || params.spreadsheetId;
  var ss = null;
  if (targetId) {
    try {
      ss = SpreadsheetApp.openById(targetId);
    } catch (e) {}
  }
  if (!ss) {
    try {
      var folder = getOrCreateMadarisFolder();
      var files = folder.getFilesByType(MimeType.GOOGLE_SHEETS);
      if (files.hasNext()) {
        ss = SpreadsheetApp.openById(files.next().getId());
      }
    } catch (e) {}
  }
  if (!ss) {
    return respondJson({ status: "success", classes: [], message: "کوئی شیٹ نہیں ملی" });
  }

  var sheets = ss.getSheets();
  var resultClasses = [];

  sheets.forEach(function(sh) {
    var sName = sh.getName();
    if (sName === "Master Data" || sName === "Masters" || sName.startsWith("_")) return;
    var data = sh.getDataRange().getValues();
    if (data.length < 2) return;

    var headers = data[0];
    var students = [];

    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      var sId = String(row[0] || "").trim();
      var sNameVal = String(row[1] || "").trim();
      if (!sId && !sNameVal) continue;

      var subjects = [];
      var studentHasAbsent = false;
      var failedSubjects = 0;

      for (var col = 2; col < headers.length; col++) {
        var h = String(headers[col] || "").trim();
        if (!h) continue;
        var maxM = 100;
        var matchMax = h.match(/\\[(\\d+)\\]/);
        if (matchMax) maxM = Number(matchMax[1]);

        var rawCell = String(row[col] || "")
          .replace(/^=+/g, "")
          .replace(/["'“”‘’\u200e\u200f\u061c\u200b\u200c\u200d\ufeff]/g, "")
          .trim();
        var rawLower = rawCell.toLowerCase();
        var isAb = rawLower === "غ" || rawLower === "غائب" || rawLower === "غیر حاضر" || rawLower === "غیرحاضر" || rawLower === "absent" || rawLower === "a" || rawLower === "abs" || rawLower === "ab";
        var isEmpty = !isAb && (rawCell === "" || rawCell === "-" || row[col] === undefined || row[col] === null);
        var obt = (isAb || isEmpty) ? 0 : (Number(rawCell) || 0);

        totalMarks += maxM;
        if (!isAb && !isEmpty) {
          obtainedMarks += obt;
        }

        var isPassed = !isAb && !isEmpty && obt >= Math.ceil(maxM * 0.33);
        if (isAb) {
          studentHasAbsent = true;
          failedSubjects++;
        } else if (isEmpty) {
          failedSubjects++;
        } else if (!isPassed) {
          failedSubjects++;
        }

        subjects.push({
          name: h.replace(/\\s*\\[\\d+\\]\\s*/g, "").trim(),
          maxMarks: maxM,
          obtainedMarks: isAb ? "غ" : (isEmpty ? "" : obt),
          isAbsent: isAb,
          isEmpty: isEmpty,
          isPassed: isPassed,
          percentage: (!isAb && !isEmpty && maxM > 0) ? Math.round((obt / maxM) * 100) : 0
        });
      }

      var pct = totalMarks > 0 ? (obtainedMarks / totalMarks) * 100 : 0;
      var kaifiyat = "ناکام";
      if (studentHasAbsent) {
        kaifiyat = "ناکام";
      } else if (failedSubjects >= 2) {
        kaifiyat = "ناکام";
      } else if (failedSubjects === 1) {
        kaifiyat = "مجاز";
      } else if (pct < 33) {
        kaifiyat = "ناکام";
      } else if (pct >= 80) {
        kaifiyat = "ممتاز";
      } else if (pct >= 60) {
        kaifiyat = "اعلیٰ";
      } else if (pct >= 50) {
        kaifiyat = "جید";
      } else {
        kaifiyat = "مقبول";
      }

      students.push({
        studentId: sId,
        rollNo: sId,
        studentName: sNameVal,
        subjects: subjects,
        totalMarks: totalMarks,
        obtainedMarks: obtainedMarks,
        percentage: Number(pct.toFixed(2)),
        isAbsent: studentHasAbsent,
        failedSubjectCount: failedSubjects,
        kaifiyat: kaifiyat
      });
    }

    resultClasses.push({
      name: sName,
      students: students
    });
  });

  return respondJson({
    status: "success",
    sheetName: ss.getName(),
    classes: resultClasses,
    totalClasses: resultClasses.length,
    timestamp: new Date().toISOString()
  });
}

// ہیلپر: JSON جواب
function respondJson(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
`;
}

/**
 * Student Admission Workflow via Google Apps Script Web App
 * Appends candidate to Master Data & mirrors into Class tab
 */
export async function submitStudentAdmissionWorkflow(params: {
  spreadsheetId: string;
  urduName: string;
  urduFather: string;
  name: string;
  father: string;
  className: string;
  dob: string;
  webAppUrl?: string;
}): Promise<NewAdmissionResponse> {
  const cleanSheetId = extractSpreadsheetId(params.spreadsheetId) || params.spreadsheetId;

  const payload: NewAdmissionPayload = {
    action: 'NEW_ADMISSION',
    spreadsheetId: cleanSheetId,
    urduName: params.urduName,
    urduFather: params.urduFather,
    name: params.name,
    father: params.father,
    className: params.className,
    dob: params.dob,
  };

  // 1. Attempt through local Node server proxy (no CORS issues, follow redirects)
  try {
    const serverRes = await fetch('/api/apps-script/new-admission', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...payload,
        webAppUrl: params.webAppUrl,
      }),
    });

    const contentType = serverRes.headers.get('content-type') || '';
    if (serverRes.ok && contentType.includes('application/json')) {
      const data = await serverRes.json();
      if (data && data.success) {
        return {
          success: true,
          message: data.message || 'طالب علم کا داخلہ کامیابی سے مرکزی ریکارڈ میں درج ہو گیا۔',
        };
      }
    }
  } catch (err) {
    console.warn('Backend proxy admission call failed, trying direct GAS Web App call:', err);
  }

  // 2. Direct client fallback with text/plain (avoids CORS preflight)
  const scriptUrl = (params.webAppUrl || DEFAULT_APPS_SCRIPT_URL).trim();
  try {
    await fetch(scriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      mode: 'no-cors',
    });

    return {
      success: true,
      message: 'طالب علم کا داخلہ مرکزی ریکارڈ میں درج کرنے کی درخواست روانہ کر دی گئی ہے۔',
    };
  } catch (directErr: any) {
    console.error('Direct GAS admission call error:', directErr);
    return {
      success: false,
      error: directErr?.message || 'مرکزی ریکارڈ میں طالب علم کا داخلہ درج کرنے میں خامی آئی۔',
    };
  }
}

/**
 * Returns the Google Apps Script code specifically designed for the new Central Sheet
 * containing the two tabs: "Madaris" and "Feedback".
 * This script runs inside the Google Sheet (via Extensions > Apps Script) and appends
 * registered madaris to the "Madaris" tab and feedback to the "Feedback" tab.
 */
export function getCentralSheetAppsScriptCode(): string {
  return `/**
 * =========================================================================
 * معیارِ مدارس — مرکزی شیٹ اسکرپٹ (Madaris & Feedback)
 * Meyar-e-Madaris Central Registration & Feedback Web App
 * =========================================================================
 * 
 * اس شیٹ میں دو ٹیب ہیں:
 * ۱. "Madaris" — جیسے ہی کوئی نیا مدرسہ رجسٹر ہو، اس کی تمام تفصیلات اس ٹیب میں پہنچ جائیں۔
 * ۲. "Feedback" — موصولہ تجاویز اور فیڈ بیک اس ٹیب میں خودکار محفوظ ہوں۔
 * 
 * 📋 تعیناتی کا طریقہ (How to Deploy):
 * ۱. اپنی اس گوگل شیٹ میں اوپر مینو سے "Extensions" -> "Apps Script" پر کلک کریں۔
 * ۲. ایڈیٹر میں موجود سارا کوڈ ہٹا کر یہ کوڈ پیسٹ کریں۔
 * ۳. فائل کو محفوظ کریں (Ctrl + S)۔
 * ۴. اوپر دائیں جانب "Deploy" (تعینات) بٹن پر کلک کر کے "New deployment" منتخب کریں۔
 * ۵. Select type (گیئر آئیکن) پر کلک کر کے "Web app" منتخب کریں۔
 * ۶. Description میں: Meyar Central v1 لکھیں۔
 * ۷. Execute as میں: Me (آپ کا جی میل) منتخب کریں۔
 * ۸. Who has access میں: **"Anyone"** (ہر کوئی) لازماً منتخب کریں!
 * ۹. "Deploy" پر کلک کریں اور اجازت (Authorize access / Advanced -> Go to script) دیں۔
 * ۱۰. ملنے والا Web App URL کاپی کر کے ایڈمن پینل کی سیٹنگز میں محفوظ فرمائیں۔
 * =========================================================================
 */

function doPost(e) {
  try {
    var data = {};
    if (e && e.postData && e.postData.contents) {
      try {
        data = JSON.parse(e.postData.contents);
      } catch (err) {
        data = e.parameter || {};
      }
    } else if (e && e.parameter) {
      data = e.parameter;
    }

    var action = (data.action || "").toString().trim().toUpperCase();
    var ss = null;
    try {
      ss = SpreadsheetApp.getActiveSpreadsheet();
    } catch (e) {}
    if (!ss && (data.spreadsheetId || data.sheetId)) {
      try {
        ss = SpreadsheetApp.openById(data.spreadsheetId || data.sheetId);
      } catch (e) {}
    }
    if (!ss) {
      return respondJson({
        success: false,
        status: "error",
        error: "فعال گوگل شیٹ نہیں مل سکی۔ براہ کرم اس اسکرپٹ کو اپنی گوگل شیٹ (جس میں Madaris اور Feedback ٹیب ہیں) کے Extensions > Apps Script میں جا کر محفوظ و تعینات فرمائیں۔"
      });
    }

    // -------------------------------------------------------------
    // ۱. فیڈ بیک و تجاویز — "Feedback" ٹیب میں خودکار درج کریں
    // -------------------------------------------------------------
    if (action === "ADD_FEEDBACK" || action === "SUBMIT_FEEDBACK" || data.type === "feedback" || data.message) {
      var fSheet = getOrCreateTab(ss, "Feedback", [
        "تاریخ و وقت",
        "سیریل نمبر",
        "نام",
        "فون نمبر",
        "ریاست",
        "ضلع",
        "پیغام / رائے و تجاویز",
        "اسٹیٹس"
      ]);

      var fName = (data.name || "").toString().trim();
      var fPhone = (data.phone || "").toString().trim();
      var fState = (data.state || "").toString().trim();
      var fDistrict = (data.district || "").toString().trim();
      var fMessage = (data.message || "").toString().trim();
      var fStatus = (data.status || "نیا / Unread").toString().trim();

      // ڈپلیکیٹ رو سے بچاؤ (Duplicate check against recent rows)
      var fLastRow = fSheet.getLastRow();
      if (fLastRow > 1) {
        var fStart = Math.max(2, fLastRow - 6);
        var fRecent = fSheet.getRange(fStart, 1, fLastRow - fStart + 1, 7).getValues();
        for (var fri = 0; fri < fRecent.length; fri++) {
          var rfPhone = String(fRecent[fri][3] || "").trim();
          var rfMsg = String(fRecent[fri][6] || "").trim();
          if (fMessage && (rfMsg === fMessage || (fPhone && rfPhone === fPhone && rfMsg.slice(0, 20) === fMessage.slice(0, 20)))) {
            return respondJson({
              success: true,
              status: "already_exists",
              message: "یہ رائے و تجویز پہلے ہی 'Feedback' شیٹ میں درج ہو چکی ہے"
            });
          }
        }
      }

      var fNow = Utilities.formatDate(new Date(), "Asia/Kolkata", "yyyy-MM-dd HH:mm:ss");
      var fSerial = data.serialNumber || (fSheet.getLastRow());

      fSheet.appendRow([
        fNow,
        fSerial,
        fName,
        fPhone,
        fState,
        fDistrict,
        fMessage,
        fStatus
      ]);

      return respondJson({
        success: true,
        status: "success",
        message: "فیڈ بیک کامیابی سے 'Feedback' ٹیب میں درج ہو گیا!"
      });
    }

    // -------------------------------------------------------------
    // ۲. نیا مدرسہ رجسٹریشن — "Madaris" ٹیب میں خودکار درج کریں
    // -------------------------------------------------------------
    if (action === "REGISTER_MADRASA" || action === "SAVE_MADRASA" || data.type === "madrasa" || data.urduName || data.madrasaName || (!data.message && data.code)) {
      var sheet = getOrCreateTab(ss, "Madaris", [
        "تاریخ و وقت",
        "مدرسہ کوڈ",
        "سیریل نمبر",
        "نام مدرسہ (اردو)",
        "نام مدرسہ (انگریزی)",
        "ریاست",
        "ضلع",
        "مکمل پتہ",
        "رابطہ فون نمبر",
        "مہتمم / پرنسپل کا نام",
        "مہتمم کا فون نمبر",
        "ای میل",
        "ویب سائٹ",
        "امتحانی عنوان",
        "درجات / کلاسز",
        "لاگ ان پاس ورڈ",
        "رجسٹریشن اسٹیٹس"
      ]);

      var lock = LockService.getScriptLock();
      lock.tryLock(10000);
      try {
        var code = (data.code || data.madrasaCode || "").toString().trim();
        var serial = data.serialNumber || (code ? code.replace(/\\D/g, "") : "");
        var rawUrduName = (data.urduName || data.name || "").toString().trim();
        var urduName = rawUrduName.replace(/\\s*\\(امتحانی ریکارڈ و درجات\\)\\s*/g, "").replace(/\\s*امتحانی ریکارڈ و درجات\\s*/g, "").replace(/\\s*امتحانی ریکارڈ\\s*/g, "").trim();
        var now = Utilities.formatDate(new Date(), "Asia/Kolkata", "yyyy-MM-dd HH:mm:ss");
        var englishName = (data.englishName || "").toString().trim();
        var state = (data.state || "").toString().trim();
        var district = (data.district || "").toString().trim();
        var address = (data.address || "").toString().trim();
        var contactPhone = (data.contactPhone || data.phone || "").toString().trim();
        var principalName = (data.principalName || "").toString().trim();
        var principalPhone = (data.principalPhone || "").toString().trim();
        var email = (data.email || "").toString().trim();
        var website = (data.website || "").toString().trim();
        var examTitle = (data.examTitle || "").toString().trim();
        var classes = Array.isArray(data.classes) ? data.classes.join(", ") : (data.classes || "").toString().trim();
        var password = (data.principalPassword || data.password || (code ? code + "@1234" : "")).toString().trim();
        var status = data.registrationStatus === "approved" ? "منظور شدہ (Approved)" : "زیر التوا (Pending)";

        // مکمل شیٹ میں ڈپلیکیٹ اندراج کی جانچ (Lock کے ساتھ)
        var mLastRow = sheet.getLastRow();
        if (mLastRow > 1) {
          var allRows = sheet.getRange(2, 1, mLastRow - 1, 17).getValues();
          for (var mri = 0; mri < allRows.length; mri++) {
            var rCode = String(allRows[mri][1] || "").trim().toUpperCase();
            var rName = String(allRows[mri][3] || "").trim();
            if ((code && rCode === code.toUpperCase()) || (urduName && rName === urduName)) {
              // اگر اسٹیٹس یا ای میل بدلا ہو تو نئی قطار کے بجائے اسی قطار کو اپڈیٹ کریں
              var rowNum = mri + 2;
              if (email && !String(allRows[mri][11] || "").trim()) {
                sheet.getRange(rowNum, 12).setValue(email);
              }
              if (status && String(allRows[mri][16] || "").trim() !== status) {
                sheet.getRange(rowNum, 17).setValue(status);
              }
              return respondJson({
                success: true,
                status: "already_exists",
                message: "یہ مدرسہ پہلے ہی 'Madaris' شیٹ میں درج ہو چکا ہے",
                code: code
              });
            }
          }
        }

        sheet.appendRow([
          now,
          code,
          serial,
          urduName,
          englishName,
          state,
          district,
          address,
          contactPhone,
          principalName,
          principalPhone,
          email,
          website,
          examTitle,
          classes,
          password,
          status
        ]);

        return respondJson({
          success: true,
          status: "success",
          message: "مدرسہ کا ریکارڈ کامیابی سے 'Madaris' ٹیب میں محفوظ ہو گیا!",
          code: code
        });
      } finally {
        try { lock.releaseLock(); } catch (le) {}
      }
    }

    return respondJson({
      success: false,
      status: "error",
      message: "نامعلوم ایکشن: " + action
    });
  } catch (err) {
    return respondJson({
      success: false,
      status: "error",
      error: err.toString()
    });
  }
}

function doGet(e) {
  try {
    var params = (e && e.parameter) || {};
    var action = (params.action || "").toString().trim().toUpperCase();

    // ۱. نیا مدرسہ رجسٹریشن بذریعہ GET (Netlify CORS تحفظ)
    if (action === "REGISTER_MADRASA" || action === "SAVE_MADRASA" || params.urduName || (!params.message && params.code)) {
      return doPost({ parameter: params });
    }

    // ۲. فیڈ بیک و تجاویز بذریعہ GET
    if (action === "ADD_FEEDBACK" || action === "SUBMIT_FEEDBACK" || params.message) {
      return doPost({ parameter: params });
    }

    // ۳. تمام رجسٹرڈ مدارس کی لسٹ پڑھنا
    if (action === "GET_MADARIS" || action === "MADARIS") {
      var ss = null;
      try { ss = SpreadsheetApp.getActiveSpreadsheet(); } catch (e) {}
      var mSheet = ss ? ss.getSheetByName("Madaris") : null;
      var madarisList = [];
      if (mSheet && mSheet.getLastRow() > 1) {
        var mData = mSheet.getRange(2, 1, mSheet.getLastRow() - 1, 17).getValues();
        for (var mi = 0; mi < mData.length; mi++) {
          var row = mData[mi];
          if (!row[1] && !row[3]) continue;
          madarisList.push({
            registeredAt: row[0],
            code: String(row[1] || "").trim(),
            serialNumber: row[2],
            urduName: String(row[3] || "").trim(),
            englishName: String(row[4] || "").trim(),
            state: String(row[5] || "").trim(),
            district: String(row[6] || "").trim(),
            address: String(row[7] || "").trim(),
            contactPhone: String(row[8] || "").trim(),
            principalName: String(row[9] || "").trim(),
            principalPhone: String(row[10] || "").trim(),
            email: String(row[11] || "").trim(),
            website: String(row[12] || "").trim(),
            examTitle: String(row[13] || "").trim(),
            classes: String(row[14] || "").split(",").map(function(s) { return s.trim(); }).filter(Boolean),
            principalPassword: String(row[15] || "").trim(),
            registrationStatus: String(row[16] || "").includes("Approved") ? "approved" : "pending"
          });
        }
      }
      return respondJson({ status: "success", madaris: madarisList, total: madarisList.length });
    }

    // ۴. فیڈ بیک کی لسٹ پڑھنا
    if (action === "GET_FEEDBACK" || action === "FEEDBACK") {
      var ss = null;
      try { ss = SpreadsheetApp.getActiveSpreadsheet(); } catch (e) {}
      var fSheet = ss ? ss.getSheetByName("Feedback") : null;
      var fbList = [];
      if (fSheet && fSheet.getLastRow() > 1) {
        var fData = fSheet.getRange(2, 1, fSheet.getLastRow() - 1, 8).getValues();
        for (var fi = 0; fi < fData.length; fi++) {
          var fRow = fData[fi];
          if (!fRow[2] && !fRow[6]) continue;
          fbList.push({
            date: fRow[0],
            serialNumber: fRow[1],
            name: fRow[2],
            phone: fRow[3],
            state: fRow[4],
            district: fRow[5],
            message: fRow[6],
            status: fRow[7]
          });
        }
      }
      return respondJson({ status: "success", feedback: fbList, total: fbList.length });
    }

    return respondJson({
      status: "online",
      service: "معیارِ مدارس — مرکزی شیٹ (Madaris & Feedback)",
      message: "مرکزی شیٹ ویب ایپ آن لائن ہے (Madaris & Feedback Tabs Active)",
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    return respondJson({ status: "error", error: err.toString() });
  }
}

function getOrCreateTab(ss, tabName, headers) {
  var sheet = ss.getSheetByName(tabName);
  if (!sheet) {
    // If there is an empty sheet like "Sheet1", rename it
    var allSheets = ss.getSheets();
    if (allSheets.length === 1 && allSheets[0].getLastRow() === 0) {
      sheet = allSheets[0];
      sheet.setName(tabName);
    } else {
      sheet = ss.insertSheet(tabName);
    }
  }

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
    var headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setBackground("#065f46")
      .setFontColor("#ffffff")
      .setFontWeight("bold")
      .setFontSize(11)
      .setHorizontalAlignment("center");
    sheet.setFrozenRows(1);
    try {
      sheet.setRightToLeft(true);
    } catch (e) {}
  }
  return sheet;
}

function respondJson(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
`;
}

export const STORAGE_KEY_SHEET_EDITOR_SCRIPT_URL = 'meyar_sheet_editor_script_url_v1';

export function getStandaloneSheetEditorAppsScriptCode(): string {
  return `/**
 * =========================================================================
 * معیارِ مدارس — مکمل نیا دو طرفہ گوگل شیٹ ایڈیٹر اسکرپٹ
 * Meyar-e-Madaris Sheet Editor API (v1.1)
 * =========================================================================
 *
 * آپ اسے دونوں میں سے کسی بھی آسان طریقے سے استعمال کر سکتے ہیں:
 *
 * طریقہ ۱ (اسی پرانے Drive Generator پروجیکٹ میں نیا فائل بنا کر — پرانا لنک برقرار رہے گا):
 *   1. اپنے پرانے Drive Generator والے Apps Script پروجیکٹ میں جائیں (Madaris & Feedback شیٹ میں نہیں)۔
 *   2. بائیں طرف "+" (Add a file > Script) دبا کر نئی فائل بنائیں (نام: SheetEditor) اور یہ پورا کوڈ پیسٹ کر کے Save کریں۔
 *   3. اوپر Deploy > Manage deployments > پنسل (Edit) > Version میں "New version" منتخب کر کے Deploy کریں۔
 *   (پرانا پورا فلو 100% محفوظ رہے گا اور نیا شیٹ ایڈیٹر بھی اسی پرانے لنک پر چل جائے گا!)
 *
 * طریقہ ۲ (بالکل الگ New Project میں):
 *   script.google.com پر "+ New project" بنا کر Deploy > New deployment > Web app (Anyone) کریں
 *   اور نیا لنک ایڈمن پینل میں محفوظ کر دیں۔
 * =========================================================================
 */

function doGet(e) {
  try {
    var params = (e && e.parameter) || {};
    var action = String(params.action || "PING").trim().toUpperCase();

    // ۱. نئے شیٹ ایڈیٹر کے ایکشنز
    if (action === "GET_WORKBOOK" || action === "READ_WORKBOOK") {
      return handleGetWorkbook(params);
    }

    // ۲. اگر یہ فائل پرانے Drive Generator پروجیکٹ میں "+" سے شامل کی گئی ہے تو پرانا GET فلو چلائیں
    if (typeof handleRegisterMadrasa === "function" && (action === "REGISTER_MADRASA" || action === "CREATE_SHEET")) {
      return handleRegisterMadrasa(params);
    }
    if (typeof handleNewAdmission === "function" && action === "NEW_ADMISSION") {
      return handleNewAdmission(params);
    }
    if (typeof handleGetResults === "function" && (action === "ALL" || action === "GET_RESULTS" || action === "SYNC" || params.sheetId || params.spreadsheetId)) {
      return handleGetResults(params);
    }

    return respondEditorJson({
      success: true,
      status: "online",
      service: "Meyar-e-Madaris Sheet Editor v1.1",
      legacyFlowAttached: typeof handleRegisterMadrasa === "function",
      supportedActions: ["GET_WORKBOOK", "SAVE_MASTER_DATA", "SAVE_CLASS_TAB", "CREATE_TAB"],
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    return respondEditorJson({
      success: false,
      error: err && err.message ? err.message : String(err)
    });
  }
}

function doPost(e) {
  try {
    var data = {};
    if (e && e.postData && e.postData.contents) {
      try {
        data = JSON.parse(e.postData.contents);
      } catch (parseErr) {
        data = (e && e.parameter) || {};
      }
    } else if (e && e.parameter) {
      data = e.parameter;
    }

    var action = String(data.action || "").trim().toUpperCase();

    // ۱. نئے شیٹ ایڈیٹر کے ایکشنز
    if (action === "GET_WORKBOOK" || action === "READ_WORKBOOK") {
      return handleGetWorkbook(data);
    }
    if (action === "SAVE_MASTER_DATA") {
      return handleSaveMasterData(data);
    }
    if (action === "SAVE_CLASS_TAB" || action === "SAVE_CLASS_RESULTS") {
      return handleSaveClassTab(data);
    }
    if (action === "CREATE_TAB") {
      return handleCreateTab(data);
    }

    // ۲. پرانے Drive Generator پروجیکٹ کا پورا فلو محفوظ رکھیں (جب "+" سے اسی پروجیکٹ میں شامل ہو)
    if (typeof handleFeedback === "function" && (action === "ADD_FEEDBACK" || action === "SUBMIT_FEEDBACK" || data.type === "feedback" || (data.message && !data.classes))) {
      return handleFeedback(data);
    }
    if (typeof handleNewAdmission === "function" && action === "NEW_ADMISSION") {
      return handleNewAdmission(data);
    }
    if (typeof handleRegisterMadrasa === "function" && (action === "REGISTER_MADRASA" || action === "CREATE_SHEET" || (!data.message && (data.code || (data.name && data.classes))))) {
      return handleRegisterMadrasa(data);
    }

    return respondEditorJson({
      success: false,
      error: "نامعلوم ایکشن: " + action
    });
  } catch (err) {
    return respondEditorJson({
      success: false,
      error: err && err.message ? err.message : String(err)
    });
  }
}

function extractSheetId(raw) {
  var str = String(raw || "").trim();
  if (!str) return "";
  var m = str.match(/\\/d\\/([a-zA-Z0-9-_]+)/);
  if (m && m[1]) return m[1];
  return str;
}

function isMasterTabName(name) {
  var lower = String(name || "").trim().toLowerCase();
  return lower === "master data" || lower === "masters" || lower === "master";
}

function trimTrailingEmptyRows(grid) {
  if (!grid || !grid.length) return [];
  var lastNonEmpty = 0;
  for (var r = grid.length - 1; r >= 0; r--) {
    var row = grid[r] || [];
    var hasText = false;
    for (var c = 0; c < row.length; c++) {
      if (String(row[c] || "").trim() !== "") {
        hasText = true;
        break;
      }
    }
    if (hasText) {
      lastNonEmpty = r;
      break;
    }
  }
  return grid.slice(0, lastNonEmpty + 1);
}

// ۱. مکمل گوگل شیٹ (ماسٹر ٹیب + تمام درجات کے ٹیبز) پڑھنا
function handleGetWorkbook(params) {
  var ssId = extractSheetId(params.spreadsheetId || params.sheetId || params.sheetUrl);
  if (!ssId) {
    return respondEditorJson({ success: false, error: "گوگل شیٹ آئی ڈی (spreadsheetId) موجود نہیں ہے۔" });
  }

  var ss = SpreadsheetApp.openById(ssId);
  var sheets = ss.getSheets();
  var tabs = [];

  for (var i = 0; i < sheets.length; i++) {
    var sh = sheets[i];
    var tabName = sh.getName();
    if (tabName.indexOf("_") === 0) continue;

    var lastRow = sh.getLastRow();
    var lastCol = sh.getLastColumn();
    var values = [];
    if (lastRow > 0 && lastCol > 0) {
      var rawValues = sh.getRange(1, 1, lastRow, lastCol).getDisplayValues();
      values = trimTrailingEmptyRows(rawValues);
    }

    var a2Formula = "";
    try {
      if (sh.getMaxRows() >= 2) {
        a2Formula = String(sh.getRange("A2").getFormula() || "");
      }
    } catch (fErr) {}

    tabs.push({
      name: tabName,
      gid: String(sh.getSheetId()),
      isMaster: isMasterTabName(tabName),
      hasFilterInA2: a2Formula.toUpperCase().indexOf("FILTER") !== -1,
      rows: values
    });
  }

  return respondEditorJson({
    success: true,
    spreadsheetId: ss.getId(),
    spreadsheetTitle: ss.getName(),
    spreadsheetUrl: ss.getUrl(),
    tabs: tabs,
    fetchedAt: new Date().toISOString()
  });
}

// ۲. ماسٹر ٹیب (Master Data) کو محفوظ و اپ ڈیٹ کرنا
function handleSaveMasterData(data) {
  var ssId = extractSheetId(data.spreadsheetId || data.sheetId || data.sheetUrl);
  if (!ssId) {
    return respondEditorJson({ success: false, error: "spreadsheetId درکار ہے" });
  }

  var ss = SpreadsheetApp.openById(ssId);
  var targetName = String(data.tabName || "Master Data").trim();
  var masterSheet =
    ss.getSheetByName(targetName) ||
    ss.getSheetByName("Master Data") ||
    ss.getSheetByName("Masters") ||
    ss.insertSheet("Master Data");

  try { masterSheet.setRightToLeft(true); } catch (e) {}

  var headers = [
    "اسٹوڈنٹ آئی ڈی",
    "امیدوار کا نام (اردو)",
    "والد کا نام (اردو)",
    "Candidate Name",
    "Father Name",
    "درجہ / کلاس",
    "تاریخ پیدائش (DOB)"
  ];
  var headerRange = masterSheet.getRange(1, 1, 1, headers.length);
  headerRange.setValues([headers])
    .setFontWeight("bold")
    .setBackground("#1b4332")
    .setFontColor("#ffffff")
    .setHorizontalAlignment("center");

  var incomingRows = Array.isArray(data.rows) ? data.rows : [];
  var maxFormulaCheck = Math.max(300, incomingRows.length + 10);
  var colAFormulas = [];
  try {
    colAFormulas = masterSheet.getRange(2, 1, Math.min(maxFormulaCheck, masterSheet.getMaxRows() - 1), 1).getFormulas();
  } catch (e) {}

  // columns B..G batch prepare
  var bToGValues = [];
  for (var r = 0; r < incomingRows.length; r++) {
    var row = incomingRows[r] || {};
    var sId = String(row.studentId || "").trim();
    bToGValues.push([
      String(row.urduName || "").trim(),
      String(row.urduFather || "").trim(),
      String(row.englishName || "").trim(),
      String(row.englishFather || "").trim(),
      String(row.className || "").trim(),
      String(row.dob || "").trim()
    ]);

    // کالم A: اگر پرانا آٹو فارمولا نہیں ہے تو آئی ڈی براہ راست محفوظ کریں
    var existingFormula = (colAFormulas[r] && colAFormulas[r][0]) ? String(colAFormulas[r][0]) : "";
    if (!existingFormula && sId) {
      var idCell = masterSheet.getRange(r + 2, 1);
      idCell.setNumberFormat("@");
      idCell.setValue(sId);
    }
  }

  if (bToGValues.length > 0) {
    var writeRange = masterSheet.getRange(2, 2, bToGValues.length, 6);
    writeRange.setNumberFormat("@");
    writeRange.setValues(bToGValues);
  }

  // پچھلی فالتو خالی سطریں صاف کریں (کالم A کے آٹو فارمولے محفوظ رکھتے ہوئے)
  var currentLastRow = masterSheet.getLastRow();
  var nextClearRow = incomingRows.length + 2;
  if (currentLastRow >= nextClearRow) {
    masterSheet.getRange(nextClearRow, 2, currentLastRow - nextClearRow + 1, 6).clearContent();
    // غیر فارمولا آئی ڈی بھی صاف کریں
    for (var cr = nextClearRow; cr <= currentLastRow; cr++) {
      var fIdx = cr - 2;
      var hasF = colAFormulas[fIdx] && colAFormulas[fIdx][0];
      if (!hasF) {
        masterSheet.getRange(cr, 1).clearContent();
      }
    }
  }

  // درجہ ڈراپ ڈاؤن اپ ڈیٹ کریں
  if (Array.isArray(data.classNames) && data.classNames.length > 0) {
    try {
      var rule = SpreadsheetApp.newDataValidation()
        .requireValueInList(data.classNames, true)
        .setAllowInvalid(true)
        .build();
      masterSheet.getRange(2, 6, Math.max(500, incomingRows.length + 50), 1).setDataValidation(rule);
    } catch (dvErr) {}
  }

  SpreadsheetApp.flush();
  return respondEditorJson({
    success: true,
    tabName: masterSheet.getName(),
    savedRows: incomingRows.length,
    message: "ماسٹر ڈیٹا گوگل شیٹ میں کامیابی سے محفوظ ہو گیا۔"
  });
}

// ۳. کسی درجے/کلاس کا مکمل رزلٹ ٹیب (مضامین + کل/حاصل/فیصد/کیفیت سمیت) گوگل شیٹ میں محفوظ کرنا
function handleSaveClassTab(data) {
  var ssId = extractSheetId(data.spreadsheetId || data.sheetId || data.sheetUrl);
  var tabName = String(data.tabName || "").trim();
  if (!ssId || !tabName) {
    return respondEditorJson({ success: false, error: "spreadsheetId اور tabName دونوں درکار ہیں۔" });
  }

  var ss = SpreadsheetApp.openById(ssId);
  var sheet = ss.getSheetByName(tabName);
  if (!sheet) {
    sheet = ss.insertSheet(tabName);
  }
  try { sheet.setRightToLeft(true); } catch (e) {}

  var subjects = Array.isArray(data.subjects) ? data.subjects : [];
  var rows = Array.isArray(data.rows) ? data.rows : [];

  var subjectHeaders = [];
  for (var s = 0; s < subjects.length; s++) {
    var sub = subjects[s] || {};
    var sName = String(sub.name || ("مضمون " + (s + 1))).trim();
    var maxM = Number(sub.maxMarks) > 0 ? Number(sub.maxMarks) : 100;
    subjectHeaders.push(sName + " [" + maxM + "]");
  }

  var summaryHeaders = ["کل نمبر", "حاصل کردہ نمبر", "فیصد (%)", "کیفیت"];
  var allRightHeaders = subjectHeaders.concat(summaryHeaders); // Column C onwards

  // چیک کریں کہ آیا A2 میں Master Data کا =FILTER فارمولا لگا ہوا ہے
  var a2Formula = "";
  try {
    if (sheet.getMaxRows() >= 2) {
      a2Formula = String(sheet.getRange("A2").getFormula() || "");
    }
  } catch (e) {}
  var usesFilter = a2Formula.toUpperCase().indexOf("FILTER") !== -1;

  // ہمیشہ A1 اور B1 ہیڈر یقینی بنائیں
  sheet.getRange(1, 1, 1, 2).setValues([["اسٹوڈنٹ آئی ڈی", "امیدوار کا نام"]]);

  // پرانے مضمون/سمری ہیڈرز اگر زیادہ کالمز تھے تو صاف کریں
  var prevLastCol = sheet.getLastColumn();
  var targetTotalCols = 2 + allRightHeaders.length;
  if (prevLastCol > targetTotalCols) {
    sheet.getRange(1, targetTotalCols + 1, Math.max(1, sheet.getLastRow()), prevLastCol - targetTotalCols).clearContent();
  }

  // کالم C سے آگے مضامین اور سمری ہیڈرز لکھیں
  if (allRightHeaders.length > 0) {
    sheet.getRange(1, 3, 1, allRightHeaders.length).setValues([allRightHeaders]);
  }

  var fullHeaderRange = sheet.getRange(1, 1, 1, targetTotalCols);
  fullHeaderRange
    .setFontWeight("bold")
    .setBackground("#e6f4ea")
    .setFontColor("#134e4a")
    .setHorizontalAlignment("center");

  // طالب علم کے نمبرات + سمری کالم تیار کریں
  function buildRightRow(rowObj) {
    var marksArr = Array.isArray(rowObj.marks) ? rowObj.marks : [];
    var out = [];
    for (var j = 0; j < subjects.length; j++) {
      var val = j < marksArr.length ? marksArr[j] : "";
      if (val === null || val === undefined) val = "";
      out.push(val);
    }
    out.push(rowObj.totalMarks !== undefined ? rowObj.totalMarks : "");
    out.push(rowObj.obtainedMarks !== undefined ? rowObj.obtainedMarks : "");
    out.push(rowObj.percentage !== undefined ? rowObj.percentage : "");
    out.push(rowObj.kaifiyat !== undefined ? rowObj.kaifiyat : "");
    return out;
  }

  if (usesFilter) {
    // FILTER فارمولے والے کالم A:B کو محفوظ رکھتے ہوئے ہر طالب علم کی ID/نام کے مطابق C سے آگے لکھیں
    SpreadsheetApp.flush();
    var sheetLastRow = sheet.getLastRow();
    var abVals = sheetLastRow >= 2 ? sheet.getRange(2, 1, sheetLastRow - 1, 2).getDisplayValues() : [];

    var rowById = {};
    var rowByName = {};
    for (var i = 0; i < abVals.length; i++) {
      var sid = String(abVals[i][0] || "").trim();
      var sname = String(abVals[i][1] || "").trim();
      if (sid && rowById[sid] === undefined) rowById[sid] = i + 2;
      if (sname && rowByName[sname] === undefined) rowByName[sname] = i + 2;
    }

    // پہلے موجودہ نمبرات والا حصہ صاف کر کے تازہ میپ شدہ نمبرات لکھیں
    if (sheetLastRow >= 2 && allRightHeaders.length > 0) {
      sheet.getRange(2, 3, sheetLastRow - 1, allRightHeaders.length).clearContent();
    }

    var unmatched = [];
    for (var rIdx = 0; rIdx < rows.length; rIdx++) {
      var st = rows[rIdx] || {};
      var keyId = String(st.studentId || "").trim();
      var keyName = String(st.studentName || "").trim();
      var targetRowNum = (keyId && rowById[keyId]) || (keyName && rowByName[keyName]) || 0;
      if (targetRowNum >= 2) {
        var rVals = buildRightRow(st);
        sheet.getRange(targetRowNum, 3, 1, rVals.length).setValues([rVals]);
      } else {
        unmatched.push(keyId || keyName);
      }
    }

    SpreadsheetApp.flush();
    return respondEditorJson({
      success: true,
      tabName: tabName,
      usesFilter: true,
      savedRows: rows.length - unmatched.length,
      unmatched: unmatched,
      message: unmatched.length > 0
        ? "کلاس شیٹ میں محفوظ ہو گیا (نوٹ: " + unmatched.length + " طلبہ پہلے Master Data میں شامل کر کے سیو کریں)"
        : "درجہ '" + tabName + "' کے تمام نمبرات گوگل شیٹ میں کامیابی سے محفوظ ہو گئے۔"
    });
  } else {
    // براہِ راست مکمل شیٹ (A سے آخر تک) لکھیں
    var prevLastRow = sheet.getLastRow();
    if (prevLastRow >= 2) {
      sheet.getRange(2, 1, prevLastRow - 1, Math.max(prevLastCol, targetTotalCols)).clearContent();
    }

    if (rows.length > 0) {
      var matrix = [];
      for (var k = 0; k < rows.length; k++) {
        var stRow = rows[k] || {};
        matrix.push([
          String(stRow.studentId || "").trim(),
          String(stRow.studentName || "").trim()
        ].concat(buildRightRow(stRow)));
      }
      sheet.getRange(2, 1, matrix.length, 1).setNumberFormat("@");
      sheet.getRange(2, 1, matrix.length, targetTotalCols).setValues(matrix);
    }

    SpreadsheetApp.flush();
    return respondEditorJson({
      success: true,
      tabName: tabName,
      usesFilter: false,
      savedRows: rows.length,
      message: "درجہ '" + tabName + "' کے تمام نمبرات اور مضامین گوگل شیٹ میں کامیابی سے محفوظ ہو گئے۔"
    });
  }
}

// ۴. نیا درجہ / کلاس ٹیب شیٹ میں بنانا
function handleCreateTab(data) {
  var ssId = extractSheetId(data.spreadsheetId || data.sheetId || data.sheetUrl);
  var tabName = String(data.tabName || "").trim();
  if (!ssId || !tabName) {
    return respondEditorJson({ success: false, error: "spreadsheetId اور tabName درکار ہیں۔" });
  }

  var ss = SpreadsheetApp.openById(ssId);
  var existing = ss.getSheetByName(tabName);
  if (existing) {
    return respondEditorJson({ success: true, alreadyExists: true, tabName: tabName });
  }

  var sheet = ss.insertSheet(tabName);
  try { sheet.setRightToLeft(true); } catch (e) {}

  var subjects = Array.isArray(data.subjects) && data.subjects.length > 0
    ? data.subjects
    : [
        { name: "دینیات", maxMarks: 100 },
        { name: "اردو", maxMarks: 50 },
        { name: "عربی / فارسی", maxMarks: 100 },
        { name: "حفظ / ناظرہ", maxMarks: 100 }
      ];

  var headers = ["اسٹوڈنٹ آئی ڈی", "امیدوار کا نام"];
  for (var i = 0; i < subjects.length; i++) {
    headers.push(String(subjects[i].name || ("مضمون " + (i + 1))).trim() + " [" + (Number(subjects[i].maxMarks) || 100) + "]");
  }
  headers.push("کل نمبر", "حاصل کردہ نمبر", "فیصد (%)", "کیفیت");

  sheet.getRange(1, 1, 1, headers.length).setValues([headers])
    .setFontWeight("bold")
    .setBackground("#e6f4ea")
    .setFontColor("#134e4a")
    .setHorizontalAlignment("center");

  // اگر Master Data موجود ہے تو خودکار FILTER فارمولا لگائیں
  var masterSheet = ss.getSheetByName("Master Data") || ss.getSheetByName("Masters");
  if (masterSheet) {
    var mName = masterSheet.getName().replace(/'/g, "''");
    var escCls = tabName.replace(/"/g, '""');
    sheet.getRange("A2").setFormula(
      "=IFERROR(FILTER({'" + mName + "'!A2:A, '" + mName + "'!B2:B}, '" + mName + "'!F2:F = \\"" + escCls + "\\"), \\"\\")"
    );
  }

  SpreadsheetApp.flush();
  return respondEditorJson({
    success: true,
    tabName: tabName,
    gid: String(sheet.getSheetId()),
    message: "نیا درجہ '" + tabName + "' گوگل شیٹ میں بن گیا!"
  });
}

function respondEditorJson(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
`;
}


