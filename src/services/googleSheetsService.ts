/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  User,
  signOut,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import { Madrasa, MadrasaClass, StudentResult } from '../types';
import { persistClass, persistMadrasa } from '../utils/storage';
import { cleanInstitutionName } from '../utils/transliterate';

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);

// All Google Workspace Scopes
export const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive',
];

// Target Google Drive Folder: "معیار مدارس"
export const MAYAAR_DRIVE_FOLDER_ID = '1HUVOzvuhbRrAO5qsw645dM4QZz75LSG9';
export const MAYAAR_DRIVE_FOLDER_URL = `https://drive.google.com/drive/folders/${MAYAAR_DRIVE_FOLDER_ID}`;

const provider = new GoogleAuthProvider();
SCOPES.forEach((scope) => provider.addScope(scope));

let isSigningIn = false;
let cachedAccessToken: string | null =
  typeof window !== 'undefined' ? localStorage.getItem('meyar_google_access_token') : null;

export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      const token =
        cachedAccessToken ||
        (typeof window !== 'undefined'
          ? localStorage.getItem('meyar_google_access_token')
          : null);
      if (token) {
        cachedAccessToken = token;
        if (onAuthSuccess) onAuthSuccess(user, token);
      } else if (!isSigningIn) {
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      cachedAccessToken = null;
      if (typeof window !== 'undefined') {
        localStorage.removeItem('meyar_google_access_token');
      }
      if (onAuthFailure) onAuthFailure();
    }
  });
};

export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  if (isSigningIn) {
    return null;
  }

  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('گوگل ڈرائیو اور شیٹس کی اجازت حاصل نہیں ہو سکی۔ براہ کرم دوبارہ کوشش فرمائیں۔');
    }

    cachedAccessToken = credential.accessToken;
    if (typeof window !== 'undefined') {
      localStorage.setItem('meyar_google_access_token', credential.accessToken);
    }
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    // If the user simply closed or cancelled the popup, handle gracefully without logging an error
    if (
      error?.code === 'auth/popup-closed-by-user' ||
      error?.code === 'auth/cancelled-popup-request' ||
      (typeof error?.message === 'string' && error.message.includes('popup-closed-by-user'))
    ) {
      console.warn('Google sign-in popup was dismissed by user.');
      return null;
    }

    if (error?.code === 'auth/popup-blocked') {
      console.warn('Google sign-in popup was blocked by browser.');
      throw new Error('براؤزر نے لاگ ان پاپ اپ ونڈو کو بلاک کر دیا ہے۔ برائے مہربانی پاپ اپ کی اجازت دیں۔');
    }

    console.error('Sign in notice:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  if (!cachedAccessToken && typeof window !== 'undefined') {
    cachedAccessToken = localStorage.getItem('meyar_google_access_token');
  }
  return cachedAccessToken;
};

export const ensureGoogleToken = async (): Promise<string | null> => {
  let token = await getAccessToken();
  if (!token) {
    const res = await googleSignIn();
    if (!res?.accessToken) {
      return null;
    }
    token = res.accessToken;
  }
  return token;
};

export const logoutGoogle = async () => {
  await signOut(auth);
  cachedAccessToken = null;
  if (typeof window !== 'undefined') {
    localStorage.removeItem('meyar_google_access_token');
  }
};

/**
 * Creates an authentic Google Spreadsheet directly in Google Drive,
 * placed directly inside the "معیار مدارس" folder (1HUVOzvuhbRrAO5qsw645dM4QZz75LSG9),
 * and generates class tabs with their subject headers.
 */
export async function createLiveGoogleSheetInDrive(
  madrasaName: string,
  madrasaCode: string,
  classNames: string[],
  classConfigs?: { [className: string]: { name: string; maxMarks: number }[] }
): Promise<{ spreadsheetId: string; spreadsheetUrl: string }> {
  const token = await ensureGoogleToken();
  if (!token) {
    throw new Error('گوگل اکاؤنٹ کنیکٹ نہیں ہو سکا۔ شیٹ بنانے کے لیے گوگل سائن ان ضروری ہے۔');
  }

  const cleanName = cleanInstitutionName(madrasaName)
    .replace(/\s*\(امتحانی ریکارڈ و درجات\)\s*/g, '')
    .replace(/\s*امتحانی ریکارڈ و درجات\s*/g, '')
    .replace(/\s*\(امتحانی ریکارڈ\)\s*/g, '')
    .replace(/\s*امتحانی ریکارڈ\s*/g, '')
    .replace(/\s*\(درجات\)\s*/g, '')
    .replace(/\s*-\s*$/g, '')
    .trim() || madrasaName.trim();
  const title = `${madrasaCode} - ${cleanName}`;

  let spreadsheetId = '';
  let spreadsheetUrl = '';

  // 1. Create Spreadsheet file directly in the "معیار مدارس" folder: 1HUVOzvuhbRrAO5qsw645dM4QZz75LSG9
  try {
    const driveCreateRes = await fetch('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: title,
        mimeType: 'application/vnd.google-apps.spreadsheet',
        parents: [MAYAAR_DRIVE_FOLDER_ID],
      }),
    });

    if (driveCreateRes.ok) {
      const driveData = await driveCreateRes.json();
      spreadsheetId = driveData.id;
      spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
    } else {
      const driveErrText = await driveCreateRes.text();
      console.warn('Direct Drive create warning, falling back to Sheets API:', driveErrText);
      // Fallback: Create via Sheets API
      const sheetsRes = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          properties: { title },
        }),
      });

      if (!sheetsRes.ok) {
        const errData = await sheetsRes.json().catch(() => ({}));
        throw new Error(errData?.error?.message || 'گوگل شیٹ بنانے میں مسئلہ پیش آیا۔');
      }

      const sheetData = await sheetsRes.json();
      spreadsheetId = sheetData.spreadsheetId;
      spreadsheetUrl = sheetData.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;

      // Move into designated folder
      try {
        await fetch(
          `https://www.googleapis.com/drive/v3/files/${spreadsheetId}?addParents=${MAYAAR_DRIVE_FOLDER_ID}&fields=id,parents`,
          {
            method: 'PATCH',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          }
        );
      } catch (moveErr) {
        console.warn('Notice moving spreadsheet to folder:', moveErr);
      }
    }
  } catch (err: any) {
    console.error('Failed to create spreadsheet:', err);
    throw new Error(err.message || 'گوگل شیٹ بنانے میں مسئلہ پیش آیا۔');
  }

  // 2. Set permission so anyone with link can edit the spreadsheet (teachers can enter marks)
  try {
    await fetch(`https://www.googleapis.com/drive/v3/files/${spreadsheetId}/permissions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        role: 'writer',
        type: 'anyone',
      }),
    });
  } catch (permErr) {
    console.warn('Notice while setting sheet permissions:', permErr);
  }

  // 3. Configure Sheet Tabs: Add "Master Data" and Class tabs
  try {
    const metaRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    const metaData = await metaRes.json();
    const existingSheets = metaData.sheets || [];
    const firstSheetId = existingSheets[0]?.properties?.sheetId ?? 0;

    const requests: any[] = [];

    // Rename the initial default sheet to "Master Data"
    requests.push({
      updateSheetProperties: {
        properties: {
          sheetId: firstSheetId,
          title: 'Master Data',
          gridProperties: { rowCount: 500, columnCount: 15 },
        },
        fields: 'title,gridProperties',
      },
    });

    // Add Data Validation dropdown rule on Master Data tab for Column F (درجہ / کلاس)
    if (classNames && classNames.length > 0) {
      requests.push({
        setDataValidation: {
          range: {
            sheetId: firstSheetId,
            startRowIndex: 1,
            endRowIndex: 500,
            startColumnIndex: 5,
            endColumnIndex: 6,
          },
          rule: {
            condition: {
              type: 'ONE_OF_LIST',
              values: classNames.map((name) => ({ userEnteredValue: name })),
            },
            inputMessage: 'براہ کرم اس مدرسے کی منظور شدہ کلاسز میں سے منتخب فرمائیں',
            showCustomUi: true,
            strict: false,
          },
        },
      });
    }

    // Add each class tab
    classNames.forEach((cName, idx) => {
      const already = existingSheets.some((s: any) => s.properties?.title === cName);
      if (!already) {
        requests.push({
          addSheet: {
            properties: {
              title: cName,
              sheetId: idx + 10,
              gridProperties: { rowCount: 200, columnCount: 30 },
            },
          },
        });
      }
    });

    if (requests.length > 0) {
      await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ requests }),
      });
    }
  } catch (tabErr) {
    console.warn('Notice configuring sheet tabs:', tabErr);
  }

  // 4. Populate Headers for Master Data and each Class Tab
  const valueRanges: any[] = [
    {
      range: "'Master Data'!A1:H1",
      values: [
        [
          'طالب علم آئی ڈی (Student ID)',
          'نام اردو (Student Name Urdu)',
          'والد کا نام اردو (Father Name Urdu)',
          'نام انگریزی (Student Name English)',
          'والد کا نام انگریزی (Father Name English)',
          'درجہ (Class)',
          'رول نمبر (Roll No)',
          'تاریخ پیدائش (DOB: DD/MM/YYYY)',
        ],
      ],
    },
  ];

  classNames.forEach((cName) => {
    const subjects = classConfigs?.[cName] || [
      { name: 'دینیات', maxMarks: 100 },
      { name: 'اردو', maxMarks: 50 },
      { name: 'عربی / فارسی', maxMarks: 100 },
    ];

    const subjectHeaders = subjects.map((s) => `${s.name} [${s.maxMarks}]`);
    const rowHeaders = [
      'Student ID',
      'تاریخ پیدائش',
      'نام طالب علم',
      'ولدیت',
      'Roll No',
      ...subjectHeaders,
    ];

    const lastColLetter = String.fromCharCode(65 + Math.min(rowHeaders.length - 1, 25));
    valueRanges.push({
      range: `'${cName}'!A1:${lastColLetter}1`,
      values: [rowHeaders],
    });
  });

  // Batch update headers
  try {
    await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          valueInputOption: 'USER_ENTERED',
          data: valueRanges,
        }),
      }
    );
  } catch (valErr) {
    console.warn('Notice while writing headers:', valErr);
  }

  return { spreadsheetId, spreadsheetUrl };
}

/**
 * Creates live sheet for a madrasa, moves it to "معیار مدارس" folder,
 * updates the madrasa and its classes in storage and on server, and returns the sheet URL.
 */
export async function createAndAttachSheetForMadrasa(
  madrasa: Madrasa,
  classes: MadrasaClass[]
): Promise<{ spreadsheetUrl: string; spreadsheetId: string }> {
  const madrasaClasses = classes.filter((c) => c.madrasaId === madrasa.id);
  let classNames = madrasaClasses.map((c) => c.name);
  if (classNames.length === 0) {
    classNames = ['حفظ', 'سال اول', 'سال دوم'];
  }

  const classConfigs: { [cName: string]: { name: string; maxMarks: number }[] } = {};
  madrasaClasses.forEach((cls) => {
    const subs = cls.testStatus?.subjects || [
      { name: 'دینیات', maxMarks: 100 },
      { name: 'اردو', maxMarks: 50 },
      { name: 'عربی / فارسی', maxMarks: 100 },
    ];
    classConfigs[cls.name] = subs;
  });

  const { spreadsheetId, spreadsheetUrl } = await createLiveGoogleSheetInDrive(
    madrasa.urduName,
    madrasa.code,
    classNames,
    classConfigs
  );

  // 1. Update madrasa with Google Sheet URL
  const updatedMadrasa: Madrasa = {
    ...madrasa,
    googleSheetUrl: spreadsheetUrl,
  };
  await persistMadrasa(updatedMadrasa);

  // 2. Update each class of this madrasa
  for (const cls of madrasaClasses) {
    await persistClass({
      ...cls,
      googleSheetUrl: spreadsheetUrl,
      sheetTabName: cls.name,
      resultSourceType: 'google_sheet',
    });
  }

  return { spreadsheetId, spreadsheetUrl };
}

/**
 * Append newly admitted student directly to Google Sheet Masters and Class tab
 */
export async function appendStudentToGoogleSheet(
  spreadsheetUrl: string,
  student: StudentResult,
  darjaName: string
) {
  try {
    const token = await getAccessToken();
    if (!token || !spreadsheetUrl) return;

    const match = spreadsheetUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
    if (!match) return;
    const spreadsheetId = match[1];

    // Append to Master Data Tab: [Student ID, Urdu Name, Father Urdu, English Name, English Father, Class, DOB]
    await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/'Master Data'!A:G:append?valueInputOption=USER_ENTERED`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          values: [
            [
              student.studentId,
              student.studentName,
              student.fatherName,
              student.studentNameEn || '',
              student.fatherNameEn || '',
              darjaName,
              student.dob,
            ],
          ],
        }),
      }
    );
  } catch (err) {
    console.warn('Could not append student to Google Sheet:', err);
  }
}
