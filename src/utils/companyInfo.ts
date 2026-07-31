/**
 * Organization Company Info Helper
 * Fetches real STIR (TIN / ИНН), company name, address, and phone from Cabinet API
 * and persists them in localStorage.
 */

export interface CompanyInfo {
  name: string;
  stir: string; // TIN / ИНН
  address: string;
  phone: string;
  employee: string;
}

export function getCompanyTin(): string {
  return localStorage.getItem('pos_v2_company_tin') || localStorage.getItem('pos_v2_company_stir') || '';
}

export function getCompanyName(): string {
  return localStorage.getItem('pos_v2_company_name') || 'OOO "Soliq Servis"';
}

export function getCompanyAddress(): string {
  return localStorage.getItem('pos_v2_company_address') || 'г. Ташкент, ул. Мукимий, 166';
}

export function getCompanyPhone(): string {
  return localStorage.getItem('pos_v2_company_phone') || '+998 90 123 45 67';
}

export async function fetchAndStoreCompanyData(): Promise<CompanyInfo | null> {
  try {
    const token = localStorage.getItem('pos_v2_cabinet_token') || '';
    if (!token) return null;

    const res = await fetch('/api/cabinet-proxy/api/company-data', {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) return null;
    const data = await res.json();
    const d = data?.data || data || {};

    if (d && (d.tin || d.name)) {
      const stir = String(d.tin || '').trim();
      const name = String(d.name || d.correctName || '').trim();
      const address = String(d.address || '').trim();
      const phone = String(d.phone || d.agentPhone || '').trim();
      const employee = String(d.agentFio || '').trim();

      if (stir) {
        localStorage.setItem('pos_v2_company_tin', stir);
        localStorage.setItem('pos_v2_company_stir', stir);
      }
      if (name) localStorage.setItem('pos_v2_company_name', name);
      if (address) localStorage.setItem('pos_v2_company_address', address);
      if (phone) localStorage.setItem('pos_v2_company_phone', phone);

      return { name, stir, address, phone, employee };
    }
  } catch (e: any) {
    console.error('Failed to fetch company data:', e.message);
  }
  return null;
}
