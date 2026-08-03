/**
 * Organization Company Info Helper
 * Stores and reads manually-entered STIR (TIN / ИНН), company name, address,
 * and phone from localStorage. These values are shown on receipts.
 */

export interface CompanyInfo {
  name: string;
  stir: string; // TIN / ИНН
  address: string;
  phone: string;
  employee: string;
}

export const DEFAULT_COMPANY_INFO: CompanyInfo = {
  name: 'OOO "Soliq Servis"',
  stir: '',
  address: 'г. Ташкент, ул. Мукимий, 166',
  phone: '+998 90 123 45 67',
  employee: '',
};

export function getCompanyTin(): string {
  return localStorage.getItem('pos_v2_company_tin') || localStorage.getItem('pos_v2_company_stir') || '';
}

export function getCompanyName(): string {
  return localStorage.getItem('pos_v2_company_name') || DEFAULT_COMPANY_INFO.name;
}

export function getCompanyAddress(): string {
  return localStorage.getItem('pos_v2_company_address') || DEFAULT_COMPANY_INFO.address;
}

export function getCompanyPhone(): string {
  return localStorage.getItem('pos_v2_company_phone') || DEFAULT_COMPANY_INFO.phone;
}

export function getCompanyEmployee(): string {
  return localStorage.getItem('pos_v2_company_employee') || '';
}

export function saveCompanyData(data: CompanyInfo): void {
  localStorage.setItem('pos_v2_company_tin', data.stir.trim());
  localStorage.setItem('pos_v2_company_stir', data.stir.trim());
  localStorage.setItem('pos_v2_company_name', data.name.trim());
  localStorage.setItem('pos_v2_company_address', data.address.trim());
  localStorage.setItem('pos_v2_company_phone', data.phone.trim());
  localStorage.setItem('pos_v2_company_employee', data.employee.trim());
}

/**
 * Kept for compatibility with receipt components: previously fetched the data
 * from Cabinet API (returned 401), now it just returns the manually entered
 * values saved in localStorage.
 */
export async function fetchAndStoreCompanyData(): Promise<CompanyInfo | null> {
  return {
    name: getCompanyName(),
    stir: getCompanyTin(),
    address: getCompanyAddress(),
    phone: getCompanyPhone(),
    employee: getCompanyEmployee(),
  };
}