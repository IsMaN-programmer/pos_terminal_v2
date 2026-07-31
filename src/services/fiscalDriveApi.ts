/**
 * FiscalDrive API Service Client
 * Covers all 22 endpoints from FiscalDriveService Swagger (http://127.0.0.1:3449/swagger/index.html)
 */

const BASE_PROXY = '/api/fiscal-drive-proxy';

async function postForm<T = any>(endpoint: string, params: Record<string, any> = {}, extraHeaders: Record<string, string> = {}): Promise<T> {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) {
      if (Array.isArray(v)) {
        body.append(k, v.join(','));
      } else {
        body.append(k, String(v));
      }
    }
  }
  const res = await fetch(`${BASE_PROXY}/${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      ...extraHeaders,
    },
    body: body.toString(),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${errText || res.statusText}`);
  }
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return text as unknown as T;
  }
}

async function postJson<T = any>(endpoint: string, payload: any = {}, extraHeaders: Record<string, string> = {}): Promise<T> {
  const res = await fetch(`${BASE_PROXY}/${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...extraHeaders,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${errText || res.statusText}`);
  }
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return text as unknown as T;
  }
}

export interface ReceiptFileInfo {
  TXID: number;
  TerminalID: string;
  ReceiptSeq: number;
  Time: string;
  Version: number;
  ReceiptType: string;
  OperationType: string;
  StatusChangeTime?: string;
  Message?: string;
}

export interface SyncLogItem {
  TerminalID: string;
  ReceiptSeq: number;
  CloseTime: string;
  Status: number;
  StatusText: string;
}

export interface SyncLog {
  SuccessfulsCount: number;
  FailsCount: number;
  Items: SyncLogItem[];
}

export interface FiscalDriveDevice {
  FactoryID?: string;
  factoryId?: string;
  Description?: string;
  description?: string;
  ReaderName?: string;
  readerName?: string;
  TerminalID?: string;
  terminalId?: string;
}

export const fiscalDriveApi = {
  // 1. Auth/SignChallenge/{FactoryID}
  signChallenge: (factoryId: string, data: any = {}) =>
    postJson(`Auth/SignChallenge/${encodeURIComponent(factoryId)}`, data),

  // 2. DataBase/Files/Count (Status: 0=New, 1=Sent, 2=Acknowledged, 3=Rejected, 4=Error)
  getFilesCount: (status: number = 0) =>
    postForm<Record<string, number>>('DataBase/Files/Count', { Status: status }),

  // 3. DataBase/Files/List/{FactoryID}/{Limit}/{Offset}
  getFilesList: (factoryId: string, limit: number = 10, offset: number = 0, status: number = 0) =>
    postForm<ReceiptFileInfo[]>(`DataBase/Files/List/${encodeURIComponent(factoryId)}/${limit}/${offset}`, { Status: status }),

  // 4. DataBase/Files/Resend/FullReceipts/{FactoryID}
  resendFullReceipts: (factoryId: string, numbers: string, ack: boolean = false) =>
    postForm<SyncLog>(`DataBase/Files/Resend/FullReceipts/${encodeURIComponent(factoryId)}`, { Numbers: numbers, Ack: ack }),

  // 5. DataBase/Files/Status/Reset
  resetFileStatus: (txid: number) =>
    postForm<string>('DataBase/Files/Status/Reset', { TXID: txid }),

  // 6. DataBase/Files/Sync/FullReceipts/{FactoryID}
  syncFullReceipts: (factoryId: string, itemsCount: number = 32) =>
    postForm<SyncLog>(`DataBase/Files/Sync/FullReceipts/${encodeURIComponent(factoryId)}`, { ItemsCount: itemsCount }),

  // 7. DataBase/Files/Sync/Receipts/{FactoryID}
  syncReceipts: (factoryId: string, itemsCount: number = 32) =>
    postForm<SyncLog>(`DataBase/Files/Sync/Receipts/${encodeURIComponent(factoryId)}`, { ItemsCount: itemsCount }),

  // 8. DataBase/Files/Sync/ZReports/{FactoryID}
  syncZReports: (factoryId: string, itemsCount: number = 5) =>
    postForm<SyncLog>(`DataBase/Files/Sync/ZReports/${encodeURIComponent(factoryId)}`, { ItemsCount: itemsCount }),

  // 9. FiscalDrive/FiscalMemory/Info/{FactoryID}
  getFiscalMemoryInfo: (factoryId: string, tags?: string[]) =>
    postForm<any>(`FiscalDrive/FiscalMemory/Info/${encodeURIComponent(factoryId)}`, tags ? { Tags: tags } : {}),

  // 10. FiscalDrive/Info/{FactoryID}
  getFiscalDriveInfo: (factoryId: string, tags?: string[]) =>
    postForm<any>(`FiscalDrive/Info/${encodeURIComponent(factoryId)}`, tags ? { Tags: tags } : {}),

  // 11. FiscalDrive/List
  listFiscalDrives: () =>
    postJson<FiscalDriveDevice[]>('FiscalDrive/List', {}),

  // 12. FiscalDrive/Receipt/GetTXID/{FactoryID}
  getReceiptTXID: (factoryId: string, receiptData: any) =>
    postJson<any>(`FiscalDrive/Receipt/GetTXID/${encodeURIComponent(factoryId)}`, receiptData),

  // 13. FiscalDrive/Receipt/Info/{FactoryID}
  getReceiptInfo: (factoryId: string, index: number = 0, tags?: string[]) =>
    postForm<any>(`FiscalDrive/Receipt/Info/${encodeURIComponent(factoryId)}`, { Index: index, ...(tags ? { Tags: tags } : {}) }),

  // 14. FiscalDrive/Receipt/RegisterTXID/{FactoryID}
  registerReceiptTXID: (factoryId: string, txid: number, posAuth?: string) =>
    postForm<any>(`FiscalDrive/Receipt/RegisterTXID/${encodeURIComponent(factoryId)}`, { TXID: txid }, posAuth ? { 'X-POS-Auth': posAuth } : {}),

  // 15. FiscalDrive/State/Sync/{FactoryID}
  syncFiscalDriveState: (factoryId: string) =>
    postForm<string>(`FiscalDrive/State/Sync/${encodeURIComponent(factoryId)}`, {}),

  // 16. FiscalDrive/ZReport/Close/{FactoryID}
  closeZReport: (factoryId: string, dateTime: string = 'now', posAuth?: string) =>
    postForm<string>(`FiscalDrive/ZReport/Close/${encodeURIComponent(factoryId)}`, { DateTime: dateTime }, posAuth ? { 'X-POS-Auth': posAuth } : {}),

  // 17. FiscalDrive/ZReport/Info/{FactoryID}
  getZReportInfo: (factoryId: string, index: number = 0, tags?: string[]) =>
    postForm<any>(`FiscalDrive/ZReport/Info/${encodeURIComponent(factoryId)}`, { Index: index, ...(tags ? { Tags: tags } : {}) }),

  // 18. FiscalDrive/ZReport/Open/{FactoryID}
  openZReport: (factoryId: string, dateTime: string = 'now', posAuth?: string) =>
    postForm<string>(`FiscalDrive/ZReport/Open/${encodeURIComponent(factoryId)}`, { DateTime: dateTime }, posAuth ? { 'X-POS-Auth': posAuth } : {}),

  // 19. FiscalDrive/ZReport/UnackowledgedIndexes/{FactoryID}
  getUnacknowledgedZReportsIndexes: (factoryId: string) =>
    postForm<number[]>(`FiscalDrive/ZReport/UnackowledgedIndexes/${encodeURIComponent(factoryId)}`, {}),

  // 20. POS/Auth/{FactoryID}
  posAuth: (factoryId: string, posAuthHeader: string) =>
    postForm<string>(`POS/Auth/${encodeURIComponent(factoryId)}`, {}, { 'X-POS-Auth': posAuthHeader }),

  // 21. POS/Challenge/{FactoryID}
  getPosChallenge: (factoryId: string) =>
    postForm<string>(`POS/Challenge/${encodeURIComponent(factoryId)}`, {}),

  // 22. POS/Lock/{FactoryID}
  posLock: (factoryId: string, secretKey: string) =>
    postForm<string>(`POS/Lock/${encodeURIComponent(factoryId)}`, { SecretKey: secretKey }),
};

/**
 * Execute full batch OFD sync pipeline
 */
export async function runFullOfdSync(factoryId: string) {
  const results: Record<string, any> = {};
  if (!factoryId) return { success: false, error: 'FactoryID missing' };

  try {
    // 1. Sync full receipts
    try {
      results.fullReceipts = await fiscalDriveApi.syncFullReceipts(factoryId, 32);
    } catch (e: any) {
      results.fullReceiptsError = e.message;
    }

    // 2. Sync receipts
    try {
      results.receipts = await fiscalDriveApi.syncReceipts(factoryId, 32);
    } catch (e: any) {
      results.receiptsError = e.message;
    }

    // 3. Sync ZReports
    try {
      results.zReports = await fiscalDriveApi.syncZReports(factoryId, 5);
    } catch (e: any) {
      results.zReportsError = e.message;
    }

    // 4. Sync state
    try {
      results.state = await fiscalDriveApi.syncFiscalDriveState(factoryId);
    } catch (e: any) {
      results.stateError = e.message;
    }

    // 5. Get DB unsent count (Status=0)
    let dbUnsentCount = 0;
    try {
      const counts = await fiscalDriveApi.getFilesCount(0);
      if (counts && typeof counts === 'object') {
        dbUnsentCount = Object.values(counts).reduce((a, b) => a + (Number(b) || 0), 0);
      }
    } catch {}

    // 6. Get FM Memory Info unsent count
    let fmUnsentCount = 0;
    try {
      const info = await fiscalDriveApi.getFiscalMemoryInfo(factoryId);
      const i = info?.data || info || {};
      fmUnsentCount = i.ReceiptsCount ?? i.receiptsCount ?? 0;
    } catch {}

    const totalRemaining = Math.max(dbUnsentCount, fmUnsentCount);

    return {
      success: true,
      totalRemaining,
      dbUnsentCount,
      fmUnsentCount,
      details: results,
    };
  } catch (e: any) {
    return {
      success: false,
      error: e.message || 'OFD sync failed',
      details: results,
    };
  }
}
