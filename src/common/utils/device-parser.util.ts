export interface ParsedDeviceInfo {
  deviceType: string;
  nameAr: string;
  nameEn: string;
  os: string;
  browser: string;
  category: 'desktop' | 'mobile' | 'tablet' | 'unknown';
  model?: string;
  date?: string;
}

/**
 * Parses a raw User-Agent string and optional timestamp to produce
 * a structured, human-readable device specification in both Arabic and English.
 */
export function parseDeviceDetails(userAgent?: string | null, date?: Date | string | null): ParsedDeviceInfo {
  const ua = userAgent || '';
  let os = 'Unknown OS';
  let category: 'desktop' | 'mobile' | 'tablet' | 'unknown' = 'unknown';
  let deviceType = 'Unknown Device';
  let nameAr = 'جهاز غير محدد';
  let nameEn = 'Unspecified Device';
  let browser = 'Unknown Browser';
  let model: string | undefined = undefined;

  if (!ua) {
    return {
      deviceType: 'Authorized Device',
      nameAr: 'الجهاز المسجل الأساسي',
      nameEn: 'Primary Registered Device',
      os: 'Unknown',
      browser: 'Unknown',
      category: 'unknown',
      date: date ? new Date(date).toISOString() : undefined,
    };
  }

  // 1. Detect OS & Category
  if (/Windows NT 10.0/i.test(ua)) {
    os = 'Windows 10 / 11';
    category = 'desktop';
  } else if (/Windows NT 6.3/i.test(ua)) {
    os = 'Windows 8.1';
    category = 'desktop';
  } else if (/Windows NT 6.2/i.test(ua)) {
    os = 'Windows 8';
    category = 'desktop';
  } else if (/Windows NT 6.1/i.test(ua)) {
    os = 'Windows 7';
    category = 'desktop';
  } else if (/Windows/i.test(ua)) {
    os = 'Windows';
    category = 'desktop';
  } else if (/Android/i.test(ua)) {
    const androidMatch = ua.match(/Android\s+([0-9\.]+)/i);
    os = androidMatch ? `Android ${androidMatch[1]}` : 'Android';
    
    if (/Mobile/i.test(ua)) {
      category = 'mobile';
    } else {
      category = 'tablet';
    }

    const modelMatch = ua.match(/;\s*([^;]+?)\s*Build/i) || ua.match(/Android[^;]+;\s*([^;\)]+)/i);
    if (modelMatch && modelMatch[1]) {
      const candidate = modelMatch[1].trim();
      if (!candidate.toLowerCase().includes('k') && candidate.length < 35) {
        model = candidate;
      }
    }
  } else if (/iPad/i.test(ua)) {
    const iosMatch = ua.match(/OS\s+([0-9_]+)/i);
    os = iosMatch ? `iPadOS ${iosMatch[1].replace(/_/g, '.')}` : 'iPadOS';
    category = 'tablet';
  } else if (/iPhone/i.test(ua)) {
    const iosMatch = ua.match(/OS\s+([0-9_]+)/i);
    os = iosMatch ? `iOS ${iosMatch[1].replace(/_/g, '.')}` : 'iOS';
    category = 'mobile';
  } else if (/Macintosh|Mac OS X/i.test(ua)) {
    os = 'macOS';
    category = 'desktop';
  } else if (/CrOS/i.test(ua)) {
    os = 'ChromeOS';
    category = 'desktop';
  } else if (/Linux/i.test(ua)) {
    os = 'Linux';
    category = 'desktop';
  }

  // 2. Detect Device Type Names (Arabic & English)
  if (/iPhone/i.test(ua)) {
    deviceType = 'iPhone';
    nameAr = 'هاتف آيفون (iPhone)';
    nameEn = 'iPhone';
  } else if (/iPad/i.test(ua)) {
    deviceType = 'iPad';
    nameAr = 'جهاز لوحي آيباد (iPad)';
    nameEn = 'iPad Tablet';
  } else if (/Android/i.test(ua)) {
    if (category === 'tablet') {
      deviceType = 'Android Tablet';
      nameAr = model ? `تابلت أندرويد (${model})` : 'تابلت أندرويد (Android Tablet)';
      nameEn = model ? `Android Tablet (${model})` : 'Android Tablet';
    } else {
      deviceType = 'Android Phone';
      nameAr = model ? `هاتف أندرويد (${model})` : 'هاتف أندرويد (Android)';
      nameEn = model ? `Android Phone (${model})` : 'Android Phone';
    }
  } else if (category === 'desktop') {
    if (os.includes('Windows')) {
      deviceType = 'Windows PC';
      nameAr = 'كمبيوتر / لابتوب (Windows)';
      nameEn = 'Windows PC / Laptop';
    } else if (os.includes('macOS')) {
      deviceType = 'Mac';
      nameAr = 'كمبيوتر ماك (MacBook / Mac)';
      nameEn = 'Mac / MacBook';
    } else if (os.includes('ChromeOS')) {
      deviceType = 'Chromebook';
      nameAr = 'جهاز كروم بوك (Chromebook)';
      nameEn = 'Chromebook';
    } else {
      deviceType = 'Linux PC';
      nameAr = 'كمبيوتر (Linux)';
      nameEn = 'Linux PC';
    }
  } else {
    deviceType = 'Other Device';
    nameAr = 'جهاز غير محدد';
    nameEn = 'Other Device';
  }

  // 3. Detect Browser
  if (/Edg\/|Edge\//i.test(ua)) {
    browser = 'Microsoft Edge';
  } else if (/SamsungBrowser\//i.test(ua)) {
    browser = 'Samsung Internet';
  } else if (/OPR\/|Opera\//i.test(ua)) {
    browser = 'Opera';
  } else if (/Firefox\/|FxiOS\//i.test(ua)) {
    browser = 'Mozilla Firefox';
  } else if (/Brave/i.test(ua)) {
    browser = 'Brave';
  } else if (/Chrome\/|CriOS\//i.test(ua)) {
    browser = 'Google Chrome';
  } else if (/Safari/i.test(ua) && !/Chrome|CriOS|Android/i.test(ua)) {
    browser = 'Apple Safari';
  } else if (/FBAN|FBAV|Instagram|WhatsApp|Telegram/i.test(ua)) {
    browser = 'In-App Webview';
  }

  return {
    deviceType,
    nameAr,
    nameEn,
    os,
    browser,
    category,
    model,
    date: date ? new Date(date).toISOString() : undefined,
  };
}
