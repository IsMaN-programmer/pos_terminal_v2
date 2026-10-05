/**
 * Organization Company Info Helper
 * Stores and reads STIR (TIN / ИНН), company name, address, and phone from the
 * shared data store. These values are shown on receipts. Values are either
 * entered manually in settings or synced from the Cabinet API (like mobile).
 */
import { dataStore } from '../services/dataStore'
import { fetchCabinetUserDetails } from '../services/cabinetApi'

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
  return dataStore.getItem('pos_v2_company_tin') || dataStore.getItem('pos_v2_company_stir') || '';
}

export function getCompanyName(): string {
  return dataStore.getItem('pos_v2_company_name') || DEFAULT_COMPANY_INFO.name;
}

export function getCompanyAddress(): string {
  return dataStore.getItem('pos_v2_company_address') || DEFAULT_COMPANY_INFO.address;
}

export function getCompanyPhone(): string {
  return dataStore.getItem('pos_v2_company_phone') || DEFAULT_COMPANY_INFO.phone;
}

export function getCompanyEmployee(): string {
  return dataStore.getItem('pos_v2_company_employee') || '';
}

export function isCompanyApiSynced(): boolean {
  return dataStore.getItem('pos_v2_company_api_synced') === '1';
}

export function setCompanyApiSynced(value: boolean): void {
  if (value) dataStore.setItem('pos_v2_company_api_synced', '1')
  else dataStore.removeItem('pos_v2_company_api_synced')
}

export function saveCompanyData(data: CompanyInfo): void {
  dataStore.setItem('pos_v2_company_tin', data.stir.trim());
  dataStore.setItem('pos_v2_company_stir', data.stir.trim());
  dataStore.setItem('pos_v2_company_name', data.name.trim());
  dataStore.setItem('pos_v2_company_address', data.address.trim());
  dataStore.setItem('pos_v2_company_phone', data.phone.trim());
  dataStore.setItem('pos_v2_company_employee', data.employee.trim());
}

/**
 * Fetches the organization's requisites (name, STIR, address) from the Cabinet
 * API — the same endpoint the mobile app uses — and saves them to the shared
 * store. Phone and employee stay manual (the API does not provide them).
 * Throws when offline or when there is no saved cabinet token.
 */
export async function syncCompanyDataFromCabinet(): Promise<CompanyInfo> {
  const details = await fetchCabinetUserDetails()
  const c = details.company
  if (!c) throw new Error('Company data missing in cabinet response')

  const name = c.name?.trim() || c.correctName?.trim() || ''
  const tin = c.tin?.trim() || ''
  const address = c.address?.trim() || ''
  const companyId = c.id != null ? String(c.id) : ''
  const cashId = c.cashId != null ? String(c.cashId) : ''
  const rawCabinetUserId = details.user?.id ?? c.userId
  const cabinetUserId = rawCabinetUserId != null ? String(rawCabinetUserId) : ''

  if (name) dataStore.setItem('pos_v2_company_name', name)
  if (tin) {
    dataStore.setItem('pos_v2_company_tin', tin)
    dataStore.setItem('pos_v2_company_stir', tin)
  }
  if (address) dataStore.setItem('pos_v2_company_address', address)
  if (companyId) dataStore.setItem('pos_v2_cabinet_company_id', companyId)
  if (cashId) dataStore.setItem('pos_v2_cabinet_cash_id', cashId)
  if (cabinetUserId) dataStore.setItem('pos_v2_cabinet_user_id', cabinetUserId)

  setCompanyApiSynced(true)

  return {
    name: name || getCompanyName(),
    stir: tin || getCompanyTin(),
    address: address || getCompanyAddress(),
    phone: getCompanyPhone(),
    employee: getCompanyEmployee(),
  }
}

/**
 * Kept for compatibility with receipt components: previously fetched the data
 * from Cabinet API (returned 401), now it just returns the manually entered
 * values saved in the shared store. Use syncCompanyDataFromCabinet() to pull
 * fresh values from the Cabinet API.
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
