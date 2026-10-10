// ISO 3166-1 alpha-2 country to ISO 4217 currency dataset and utilities for Frontend

export const COUNTRIES = [
  { countryCode: 'LK', countryName: 'Sri Lanka', currencyCode: 'LKR', currencyName: 'Sri Lankan Rupee', currencySymbol: 'Rs.', locale: 'en-LK', decimalPlaces: 2 },
  { countryCode: 'US', countryName: 'United States', currencyCode: 'USD', currencyName: 'US Dollar', currencySymbol: '$', locale: 'en-US', decimalPlaces: 2 },
  { countryCode: 'GB', countryName: 'United Kingdom', currencyCode: 'GBP', currencyName: 'British Pound', currencySymbol: '£', locale: 'en-GB', decimalPlaces: 2 },
  { countryCode: 'IN', countryName: 'India', currencyCode: 'INR', currencyName: 'Indian Rupee', currencySymbol: '₹', locale: 'en-IN', decimalPlaces: 2 },
  { countryCode: 'AE', countryName: 'United Arab Emirates', currencyCode: 'AED', currencyName: 'UAE Dirham', currencySymbol: 'د.إ', locale: 'ar-AE', decimalPlaces: 2 },
  { countryCode: 'AU', countryName: 'Australia', currencyCode: 'AUD', currencyName: 'Australian Dollar', currencySymbol: 'A$', locale: 'en-AU', decimalPlaces: 2 },
  { countryCode: 'CA', countryName: 'Canada', currencyCode: 'CAD', currencyName: 'Canadian Dollar', currencySymbol: 'CA$', locale: 'en-CA', decimalPlaces: 2 },
  { countryCode: 'SG', countryName: 'Singapore', currencyCode: 'SGD', currencyName: 'Singapore Dollar', currencySymbol: 'S$', locale: 'en-SG', decimalPlaces: 2 },
  { countryCode: 'JP', countryName: 'Japan', currencyCode: 'JPY', currencyName: 'Japanese Yen', currencySymbol: '¥', locale: 'ja-JP', decimalPlaces: 0 },
  { countryCode: 'DE', countryName: 'Germany', currencyCode: 'EUR', currencyName: 'Euro', currencySymbol: '€', locale: 'de-DE', decimalPlaces: 2 },
  { countryCode: 'FR', countryName: 'France', currencyCode: 'EUR', currencyName: 'Euro', currencySymbol: '€', locale: 'fr-FR', decimalPlaces: 2 },
  { countryCode: 'IT', countryName: 'Italy', currencyCode: 'EUR', currencyName: 'Euro', currencySymbol: '€', locale: 'it-IT', decimalPlaces: 2 },
  { countryCode: 'ES', countryName: 'Spain', currencyCode: 'EUR', currencyName: 'Euro', currencySymbol: '€', locale: 'es-ES', decimalPlaces: 2 },
  { countryCode: 'NL', countryName: 'Netherlands', currencyCode: 'EUR', currencyName: 'Euro', currencySymbol: '€', locale: 'nl-NL', decimalPlaces: 2 },
  { countryCode: 'BE', countryName: 'Belgium', currencyCode: 'EUR', currencyName: 'Euro', currencySymbol: '€', locale: 'nl-BE', decimalPlaces: 2 },
  { countryCode: 'IE', countryName: 'Ireland', currencyCode: 'EUR', currencyName: 'Euro', currencySymbol: '€', locale: 'en-IE', decimalPlaces: 2 },
  { countryCode: 'NZ', countryName: 'New Zealand', currencyCode: 'NZD', currencyName: 'New Zealand Dollar', currencySymbol: 'NZ$', locale: 'en-NZ', decimalPlaces: 2 },
  { countryCode: 'CH', countryName: 'Switzerland', currencyCode: 'CHF', currencyName: 'Swiss Franc', currencySymbol: 'CHF', locale: 'de-CH', decimalPlaces: 2 },
  { countryCode: 'CN', countryName: 'China', currencyCode: 'CNY', currencyName: 'Chinese Yuan', currencySymbol: '¥', locale: 'zh-CN', decimalPlaces: 2 },
  { countryCode: 'HK', countryName: 'Hong Kong', currencyCode: 'HKD', currencyName: 'Hong Kong Dollar', currencySymbol: 'HK$', locale: 'zh-HK', decimalPlaces: 2 },
  { countryCode: 'SA', countryName: 'Saudi Arabia', currencyCode: 'SAR', currencyName: 'Saudi Riyal', currencySymbol: '﷼', locale: 'ar-SA', decimalPlaces: 2 },
  { countryCode: 'QA', countryName: 'Qatar', currencyCode: 'QAR', currencyName: 'Qatari Riyal', currencySymbol: '﷼', locale: 'ar-QA', decimalPlaces: 2 },
  { countryCode: 'KW', countryName: 'Kuwait', currencyCode: 'KWD', currencyName: 'Kuwaiti Dinar', currencySymbol: 'د.ك', locale: 'ar-KW', decimalPlaces: 3 },
  { countryCode: 'BH', countryName: 'Bahrain', currencyCode: 'BHD', currencyName: 'Bahraini Dinar', currencySymbol: '.د.ب', locale: 'ar-BH', decimalPlaces: 3 },
  { countryCode: 'OM', countryName: 'Oman', currencyCode: 'OMR', currencyName: 'Omani Rial', currencySymbol: 'ر.ع.', locale: 'ar-OM', decimalPlaces: 3 },
  { countryCode: 'ZA', countryName: 'South Africa', currencyCode: 'ZAR', currencyName: 'South African Rand', currencySymbol: 'R', locale: 'en-ZA', decimalPlaces: 2 },
  { countryCode: 'MY', countryName: 'Malaysia', currencyCode: 'MYR', currencyName: 'Malaysian Ringgit', currencySymbol: 'RM', locale: 'ms-MY', decimalPlaces: 2 },
  { countryCode: 'ID', countryName: 'Indonesia', currencyCode: 'IDR', currencyName: 'Indonesian Rupiah', currencySymbol: 'Rp', locale: 'id-ID', decimalPlaces: 0 },
  { countryCode: 'PH', countryName: 'Philippines', currencyCode: 'PHP', currencyName: 'Philippine Peso', currencySymbol: '₱', locale: 'en-PH', decimalPlaces: 2 },
  { countryCode: 'TH', countryName: 'Thailand', currencyCode: 'THB', currencyName: 'Thai Baht', currencySymbol: '฿', locale: 'th-TH', decimalPlaces: 2 },
  { countryCode: 'VN', countryName: 'Vietnam', currencyCode: 'VND', currencyName: 'Vietnamese Dong', currencySymbol: '₫', locale: 'vi-VN', decimalPlaces: 0 },
  { countryCode: 'PK', countryName: 'Pakistan', currencyCode: 'PKR', currencyName: 'Pakistani Rupee', currencySymbol: 'Rs', locale: 'ur-PK', decimalPlaces: 2 },
  { countryCode: 'BD', countryName: 'Bangladesh', currencyCode: 'BDT', currencyName: 'Bangladeshi Taka', currencySymbol: '৳', locale: 'bn-BD', decimalPlaces: 2 },
  { countryCode: 'NP', countryName: 'Nepal', currencyCode: 'NPR', currencyName: 'Nepalese Rupee', currencySymbol: 'Rs', locale: 'ne-NP', decimalPlaces: 2 },
  { countryCode: 'MV', countryName: 'Maldives', currencyCode: 'MVR', currencyName: 'Maldivian Rufiyaa', currencySymbol: 'Rf', locale: 'dv-MV', decimalPlaces: 2 },
  { countryCode: 'KR', countryName: 'South Korea', currencyCode: 'KRW', currencyName: 'South Korean Won', currencySymbol: '₩', locale: 'ko-KR', decimalPlaces: 0 },
  { countryCode: 'SE', countryName: 'Sweden', currencyCode: 'SEK', currencyName: 'Swedish Krona', currencySymbol: 'kr', locale: 'sv-SE', decimalPlaces: 2 },
  { countryCode: 'NO', countryName: 'Norway', currencyCode: 'NOK', currencyName: 'Norwegian Krone', currencySymbol: 'kr', locale: 'nb-NO', decimalPlaces: 2 },
  { countryCode: 'DK', countryName: 'Denmark', currencyCode: 'DKK', currencyName: 'Danish Krone', currencySymbol: 'kr', locale: 'da-DK', decimalPlaces: 2 },
  { countryCode: 'PL', countryName: 'Poland', currencyCode: 'PLN', currencyName: 'Polish Zloty', currencySymbol: 'zł', locale: 'pl-PL', decimalPlaces: 2 },
  { countryCode: 'TR', countryName: 'Turkey', currencyCode: 'TRY', currencyName: 'Turkish Lira', currencySymbol: '₺', locale: 'tr-TR', decimalPlaces: 2 },
  { countryCode: 'BR', countryName: 'Brazil', currencyCode: 'BRL', currencyName: 'Brazilian Real', currencySymbol: 'R$', locale: 'pt-BR', decimalPlaces: 2 },
  { countryCode: 'MX', countryName: 'Mexico', currencyCode: 'MXN', currencyName: 'Mexican Peso', currencySymbol: 'Mex$', locale: 'es-MX', decimalPlaces: 2 },
  { countryCode: 'EG', countryName: 'Egypt', currencyCode: 'EGP', currencyName: 'Egyptian Pound', currencySymbol: 'E£', locale: 'ar-EG', decimalPlaces: 2 },
  { countryCode: 'NG', countryName: 'Nigeria', currencyCode: 'NGN', currencyName: 'Nigerian Naira', currencySymbol: '₦', locale: 'en-NG', decimalPlaces: 2 },
  { countryCode: 'KE', countryName: 'Kenya', currencyCode: 'KES', currencyName: 'Kenyan Shilling', currencySymbol: 'KSh', locale: 'en-KE', decimalPlaces: 2 },
  { countryCode: 'GH', countryName: 'Ghana', currencyCode: 'GHS', currencyName: 'Ghanaian Cedi', currencySymbol: 'GH₵', locale: 'en-GH', decimalPlaces: 2 },
  { countryCode: 'AT', countryName: 'Austria', currencyCode: 'EUR', currencyName: 'Euro', currencySymbol: '€', locale: 'de-AT', decimalPlaces: 2 },
  { countryCode: 'PT', countryName: 'Portugal', currencyCode: 'EUR', currencyName: 'Euro', currencySymbol: '€', locale: 'pt-PT', decimalPlaces: 2 },
  { countryCode: 'GR', countryName: 'Greece', currencyCode: 'EUR', currencyName: 'Euro', currencySymbol: '€', locale: 'el-GR', decimalPlaces: 2 },
  { countryCode: 'FI', countryName: 'Finland', currencyCode: 'EUR', currencyName: 'Euro', currencySymbol: '€', locale: 'fi-FI', decimalPlaces: 2 },
];

const countryMapByCode = new Map(COUNTRIES.map((c) => [c.countryCode.toUpperCase(), c]));
const currencyMapByCode = new Map(COUNTRIES.map((c) => [c.currencyCode.toUpperCase(), c]));

export function getCountryByCode(code) {
  if (!code) return null;
  return countryMapByCode.get(String(code).trim().toUpperCase()) || null;
}

export function getCurrencyMetadata(currencyCode) {
  if (!currencyCode) return null;
  const upper = String(currencyCode).trim().toUpperCase();
  const match = currencyMapByCode.get(upper);
  if (match) {
    return {
      currencyCode: match.currencyCode,
      currencyName: match.currencyName,
      currencySymbol: match.currencySymbol,
      locale: match.locale,
      decimalPlaces: match.decimalPlaces,
    };
  }
  return {
    currencyCode: upper,
    currencyName: upper,
    currencySymbol: upper,
    locale: 'en-US',
    decimalPlaces: 2,
  };
}

export function resolveCurrencyForCountry(countryCode) {
  const country = getCountryByCode(countryCode);
  if (country) {
    return {
      countryCode: country.countryCode,
      countryName: country.countryName,
      currencyCode: country.currencyCode,
      currencyName: country.currencyName,
      currencySymbol: country.currencySymbol,
      locale: country.locale,
      decimalPlaces: country.decimalPlaces,
    };
  }
  return {
    countryCode: 'LK',
    countryName: 'Sri Lanka',
    currencyCode: 'LKR',
    currencyName: 'Sri Lankan Rupee',
    currencySymbol: 'Rs.',
    locale: 'en-LK',
    decimalPlaces: 2,
  };
}

/**
 * Universal Currency Formatter
 * Formats a numeric price into a currency string with appropriate symbol,
 * grouping, and decimal precision without altering the underlying numerical value.
 */
export function formatCurrencyValue(amount, currencyCode = 'LKR') {
  const num = Number(amount ?? 0);
  const validNum = Number.isFinite(num) ? num : 0;
  const upperCode = String(currencyCode || 'LKR').trim().toUpperCase();
  const meta = getCurrencyMetadata(upperCode);

  try {
    const formattedNumber = new Intl.NumberFormat(meta.locale || 'en-US', {
      minimumFractionDigits: meta.decimalPlaces,
      maximumFractionDigits: meta.decimalPlaces,
    }).format(validNum);

    // Format with symbol
    if (meta.currencySymbol) {
      if (['Rs.', 'Rs', 'د.إ', 'RM', 'Rp', 'Rf', 'KSh', 'GH₵'].includes(meta.currencySymbol)) {
        return `${meta.currencySymbol} ${formattedNumber}`;
      }
      return `${meta.currencySymbol}${formattedNumber}`;
    }

    return `${upperCode} ${formattedNumber}`;
  } catch {
    return `${meta.currencySymbol || upperCode} ${validNum.toFixed(meta.decimalPlaces ?? 2)}`;
  }
}
