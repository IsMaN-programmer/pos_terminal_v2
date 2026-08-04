import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "url";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import { execSync } from "node:child_process";
import pool, { initDb } from "./db.js";
import { decodePng } from "./png.js";
import { buildReceiptEscposJob, buildTextEscposJob, dotsWidthForPaper } from "./escpos.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

const distPath = path.resolve(__dirname, "..", "..", "dist");
app.use(express.static(distPath));

app.all("/api/fiscal-drive-proxy/*", async (req, res) => {
  const proxyPath = req.url.replace("/api/fiscal-drive-proxy/", "").split("?")[0];
  const queryStr = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
  try {
    const raw = req.body;
    const reqContentType = (req.headers["content-type"] || "").toLowerCase();
    const isFormUrlEncoded = reqContentType.includes("x-www-form-urlencoded") ||
      proxyPath.startsWith("DataBase/Files/") ||
      proxyPath.startsWith("FiscalDrive/State/Sync") ||
      proxyPath.startsWith("POS/Lock") ||
      proxyPath.startsWith("POS/Auth");

    let body;
    let contentType;

    if (isFormUrlEncoded) {
      contentType = "application/x-www-form-urlencoded";
      if (raw === undefined || raw === null || (typeof raw === 'object' && Object.keys(raw).length === 0)) {
        if (proxyPath.startsWith("DataBase/Files/Sync/")) {
          body = "ItemsCount=32";
        } else {
          body = "";
        }
      } else if (typeof raw === 'object' && !Array.isArray(raw)) {
        body = new URLSearchParams(raw).toString();
      } else {
        body = String(raw);
      }
    } else {
      contentType = "application/json";
      if (raw === undefined || raw === null) {
        body = '{}';
      } else if (typeof raw === 'object' && !Array.isArray(raw)) {
        body = JSON.stringify(raw);
      } else {
        body = String(raw);
      }
    }

    const headers = { "Content-Type": contentType };
    if (req.headers["x-pos-auth"]) headers["X-POS-Auth"] = req.headers["x-pos-auth"];
    if (req.headers["authorization"]) headers["Authorization"] = req.headers["authorization"];

    const opts = { method: "POST", headers, body: body || undefined };

    const targetUrl = `http://127.0.0.1:3449/${proxyPath}${queryStr}`;
    const fdRes = await fetch(targetUrl, opts);
    const text = await fdRes.text();
    try { res.status(fdRes.status).json(JSON.parse(text)); }
    catch { res.status(fdRes.status).send(text); }
  } catch (e) {
    res.status(502).json({ error: "FiscalDriveService unavailable", message: e.message });
  }
});

app.get("/api/internet-check", async (_req, res) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    await fetch("https://cabinet.posvk.uz", { signal: controller.signal });
    res.json({ ok: true });
  } catch (e) {
    res.status(502).json({ ok: false, error: e.message });
  } finally {
    clearTimeout(timer);
  }
});

app.all("/api/cabinet-proxy/*", async (req, res) => {
  const proxyPath = req.url.replace("/api/cabinet-proxy/", "");
  try {
    const cabinetBase = "https://cabinet.posvk.uz/api/cabinet-api";
    const auth = req.headers.authorization || "";
    const headers = { "Content-Type": "application/json" };
    if (auth) headers["Authorization"] = auth;
    const fdRes = await fetch(`${cabinetBase}/${proxyPath}`, {
      method: req.method,
      headers,
      body: req.method !== "GET" ? JSON.stringify(req.body || {}) : undefined
    });
    const text = await fdRes.text();
    try { res.status(fdRes.status).json(JSON.parse(text)); }
    catch { res.status(fdRes.status).send(text); }
  } catch (e) {
    res.status(502).json({ error: "Cabinet API unavailable", message: e.message });
  }
});

app.all("/api/marking-proxy/*", async (req, res) => {
  const proxyPath = req.url.replace("/api/marking-proxy/", "");
  try {
    const tasnifBase = "https://tasnif.soliq.uz/api/cl-api/marking";
    const auth = req.headers.authorization || "";
    const headers = { "Content-Type": "application/json" };
    if (auth) headers["Authorization"] = auth;
    const fdRes = await fetch(`${tasnifBase}/${proxyPath}`, {
      method: req.method,
      headers,
      body: req.method !== "GET" ? JSON.stringify(req.body || {}) : undefined
    });
    const text = await fdRes.text();
    try { res.status(fdRes.status).json(JSON.parse(text)); }
    catch { res.status(fdRes.status).send(text); }
  } catch (e) {
    res.status(502).json({ error: "Marking API unavailable", message: e.message });
  }
});

app.post("/api/fiscal-register-receipt/:factoryId", async (req, res) => {
  const { factoryId } = req.params;
  const receipt = req.body;
  if (!factoryId || !receipt) {
    return res.status(400).json({ error: "factoryId and receipt body required" });
  }
  try {
    // Strip internal fields (underscore-prefixed) before sending to FD service
    const fdReceipt = { ...receipt };
    for (const key of Object.keys(fdReceipt)) {
      if (key.startsWith('_')) delete fdReceipt[key];
    }
    // Helper to format a Date as "YYYY-MM-DD HH:mm:ss"
    const fmtDt = (d) => {
      const pad = (n) => String(n).padStart(2, "0");
      return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    };
    // Compute a safe timestamp for FD operations (fallback Date.now+5min)
    const fmNow = () => {
      const d = new Date();
      d.setMinutes(d.getMinutes() + 5);
      return fmtDt(d);
    };
    const openShift = async (dt) => {
      try {
        await fetch(`http://127.0.0.1:3449/FiscalDrive/ZReport/Open/${factoryId}?DateTime=${encodeURIComponent(dt || fmNow())}`, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: "{}"
        });
      } catch (_) {}
    };
    // Ensure the shift is open before registering
    let shiftOpenTime = "";
    try {
      const zInfoRes = await fetch(`http://127.0.0.1:3449/FiscalDrive/ZReport/Info/${factoryId}`, {
        method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "Index=0"
      });
      if (zInfoRes.ok) {
        const zi = await zInfoRes.json().catch(() => ({}));
        const zd = zi?.data && typeof zi.data === 'object' ? zi.data : zi;
        shiftOpenTime = zd.OpenTime || zd.openTime || zd.opentime || zd.LastOpenTime || zd.lastOpenTime || zd.lastopentime || "";
        if (!shiftOpenTime) {
          await openShift(fmNow());
        }
      } else {
        await openShift(fmNow());
      }
    } catch (_) {}
    // Read the FM's last operation time
    let lastOp = "";
    try {
      const infoRes = await fetch(`http://127.0.0.1:3449/FiscalDrive/FiscalMemory/Info/${factoryId}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: "{}"
      });
      if (infoRes.ok) {
        const info = await infoRes.json();
        lastOp = info?.LastOperationTime || info?.lastOperationTime || "";
      }
    } catch (_) {}
    // Receipt time must be after the FM clock and after all known FD times
    const refs = [new Date(Date.now() + 300000)];
    for (const t of [fdReceipt.Time, lastOp, shiftOpenTime]) {
      if (!t) continue;
      const parsed = new Date(String(t).replace(" ", "T"));
      if (!isNaN(parsed.getTime())) refs.push(parsed);
    }
    const safeBase = new Date(Math.max(...refs.map(r => r.getTime())));
    safeBase.setSeconds(safeBase.getSeconds() + 30);
    fdReceipt.Time = fmtDt(safeBase);
    let txidText = "";
    const doGetTXID = async () => {
      const txidRes = await fetch(`http://127.0.0.1:3449/FiscalDrive/Receipt/GetTXID/${factoryId}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(fdReceipt)
      });
      if (!txidRes.ok) throw new Error(`GetTXID failed: ${txidRes.status} ${await txidRes.text().catch(() => "")}`);
      const raw = await txidRes.text();
      // Try to parse as JSON (e.g. {"TXID":123}), fall back to plain text number
      try {
        const parsed = JSON.parse(raw);
        return String(parsed.TXID || parsed.txId || parsed.data || parsed);
      } catch {
        return raw.trim();
      }
    };
    try {
      txidText = await doGetTXID();
    } catch (e) {
      // Shift likely not open — try opening it, then retry GetTXID
      await openShift(fdReceipt.Time);
      txidText = await doGetTXID();
    }
    const txIdVal = parseInt(txidText, 10);
    if (isNaN(txIdVal)) throw new Error(`Invalid TXID: ${txidText}`);

    const registerTXID = async () => {
      const r = await fetch(`http://127.0.0.1:3449/FiscalDrive/Receipt/RegisterTXID/${factoryId}`, {
        method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: `TXID=${txIdVal}`
      });
      if (!r.ok) {
        const errText = await r.text().catch(() => "");
        throw new Error(`RegisterTXID failed: ${r.status} ${errText}`);
      }
      return r;
    };
    let registerRes;
    try {
      registerRes = await registerTXID();
    } catch (e) {
      // Shift likely already closed — open it with a time just before the
      // receipt time (receipt must be later than the shift open), then retry
      try {
        const d = new Date(fdReceipt.Time.replace(" ", "T"));
        d.setSeconds(d.getSeconds() - 5);
        await openShift(fmtDt(d));
      } catch (_) {}
      registerRes = await registerTXID();
    }
    const registerData = await registerRes.json();

    const tid = registerData?.TerminalID || "";
    const seq = registerData?.ReceiptSeq || 0;
    const sign = registerData?.FiscalSign || "";
    const dt = registerData?.DateTime || "";
    const qrCodeUrl = registerData?.QRCodeURL || (tid ? `https://ofd.soliq.uz/check?t=${tid}&r=${seq}&c=${dt.replace(/[^0-9]/g, "")}&s=${sign}` : "");
    const cashSum = (receipt.Items || []).reduce((s, it) => s + (it.Price || 0), 0);
    const receiptId = receipt._receiptId || `FM-${seq}-${Date.now()}`;
    const locId = crypto.randomUUID();

    // Push receipt data to Cabinet API (non-blocking)
    try {
      const auth = req.headers.authorization || "";
      if (auth) {
        const cabinetBase = "https://cabinet.posvk.uz/api/cabinet-api";
        const nowISO = new Date().toISOString();
        const cabinetPayload = {
          id: receiptId,
          locId,
          terminalId: tid,
          receiptSec: seq,
          fiscalSign: sign,
          qrcodeUrl: qrCodeUrl,
          dateTime: dt || nowISO,
          createdDate: nowISO,
          totalSum: cashSum,
          totalPay: cashSum,
          totalVat: Math.round((receipt.Items || []).reduce((s, it) => s + (it.VAT || 0), 0) * 100) / 100,
          cashSum: receipt.ReceivedCash || 0,
          cashId: receipt._cashId || null,
          cashName: receipt._cashName || "",
          companyId: receipt._companyId || null,
          license: receipt._license || factoryId,
          saleDayId: receipt._saleDayId || "",
          sendOfdStatus: 1,
          status: 0,
          type: receipt.Type || 0,
          userId: receipt._userId || null,
          userName: receipt._userName || receipt._cashier || "",
          cardNumber: receipt._cardNumber || "",
          rrn: receipt._rrn || "",
          cashBack: 0,
          certificateSum: 0,
          commentary: "",
          enabled: 1,
          extraInfo: receipt.ExtraInfo || {},
          latitude: receipt.ExtraInfo?.latitude || null,
          longitude: receipt.ExtraInfo?.longitude || null,
          txId: txIdVal,
          cashier: receipt._cashier || "",
          items: (receipt.Items || []).map(it => ({
            name: it.Name || "",
            amount: it.Amount || 1,
            price: it.Price || 0,
            vatPercent: it.VATPercent || 12,
            vat: it.VAT || 0,
            discount: it.Discount || 0,
            spic: it.SPIC || "",
            barcode: it.Barcode || ""
          }))
        };
        fetch(`${cabinetBase}/desktop/receipt/sync`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": auth },
          body: JSON.stringify(cabinetPayload)
        }).catch(e => console.error("Cabinet sync error:", e.message));
      }
    } catch (e) { console.error("Cabinet sync exception:", e.message); }

    // Sync receipts and full files to OFD
    (async () => {
      try {
        await fetch(`http://127.0.0.1:3449/DataBase/Files/Sync/FullReceipts/${factoryId}`, {
          method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "ItemsCount=32"
        });
        await fetch(`http://127.0.0.1:3449/DataBase/Files/Sync/Receipts/${factoryId}`, {
          method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "ItemsCount=32"
        });
        await fetch(`http://127.0.0.1:3449/FiscalDrive/State/Sync/${factoryId}`, {
          method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }
        });
      } catch (e) {
        console.error("OFD sync error:", e.message);
      }
    })();

    res.json({
      fiscalSign: sign,
      qrCodeUrl,
      receiptNumber: seq,
      receiptSeq: seq,
      receiptId,
      locId,
      terminalId: tid,
      dateTime: dt,
    });
  } catch (e) {
    console.error("Fiscal registration error:", e.message);
    res.status(502).json({ error: "Fiscal registration failed", message: e.message });
  }
});

app.get("/api/fiscal-receipt-history", async (req, res) => {
  const auth = req.headers.authorization || "";
  try {
    const cabinetBase = "https://cabinet.posvk.uz/api/cabinet-api";
    const fdRes = await fetch(`${cabinetBase}/receipt/history?${new URLSearchParams(req.query)}`, {
      headers: { "Content-Type": "application/json", ...(auth ? { "Authorization": auth } : {}) }
    });
    const text = await fdRes.text();
    try { res.json(JSON.parse(text)); }
    catch { res.send(text); }
  } catch (e) {
    res.status(502).json({ error: "Cabinet API unavailable", message: e.message });
  }
});

app.post("/api/login", async (req, res) => {
  const { pin } = req.body;
  try {
    const result = await pool.query("SELECT id, email, role, is_admin as isAdmin FROM users WHERE pin = $1", [pin]);
    if (result.rows.length === 0) {
      return res.status(401).json({ ok: false, error: "Invalid PIN" });
    }
    return res.json({ ok: true, user: result.rows[0] });
  } catch (err) {
    return res.status(500).json({ ok: false, error: "Internal server error" });
  }
});

app.get("/api/menu", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM menu");
    res.json({ ok: true, items: result.rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: "Failed to fetch menu" });
  }
});

app.post("/api/menu", async (req, res) => {
  const { name, price, category, mxik_code, emoji, photo } = req.body;
  try {
    const result = await pool.query(
      "INSERT INTO menu (name, price, category, mxik_code, emoji, photo) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *",
      [name, price, category, mxik_code, emoji, photo || null]
    );
    res.status(201).json({ ok: true, item: result.rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, error: "Failed to save menu item" });
  }
});

app.get("/api/orders", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM orders ORDER BY timestamp DESC");
    const orders = result.rows.map(row => ({
      id: row.id, orderNumber: row.order_number || row.ordernumber,
      timestamp: row.timestamp, total: parseInt(row.total || 0, 10),
      paymentType: row.payment_type || row.paymenttype,
      splitPayments: typeof row.split_payments === 'string' ? JSON.parse(row.split_payments) : row.split_payments,
      items: typeof row.items === 'string' ? JSON.parse(row.items) : row.items,
      cashier: row.cashier, guestCount: row.guest_count || row.guestcount,
      discount: parseInt(row.discount || 0, 10)
    }));
    res.json({ ok: true, orders });
  } catch (err) {
    res.status(500).json({ ok: false, error: "Failed to fetch orders" });
  }
});

app.post("/api/orders", async (req, res) => {
  const { id, orderNumber, timestamp, total, paymentType, items, splitPayments, cashier, guestCount, discount } = req.body;
  try {
    await pool.query(
      `INSERT INTO orders (id, order_number, timestamp, total, payment_type, items, split_payments, cashier, guest_count, discount) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (id) DO UPDATE SET 
       total = EXCLUDED.total, items = EXCLUDED.items, payment_type = EXCLUDED.payment_type`,
      [id, orderNumber, timestamp || new Date().toISOString(), total, paymentType,
        JSON.stringify(items || []), splitPayments ? JSON.stringify(splitPayments) : null,
        cashier, guestCount, discount || 0]
    );
    res.status(201).json({ ok: true, id });
  } catch (err) {
    res.status(500).json({ ok: false, error: "Failed to save order" });
  }
});

app.get("/api/categories", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM categories");
    res.json({ ok: true, categories: result.rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: "Failed to fetch categories" });
  }
});

app.get("/api/tables", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM tables");
    res.json({ ok: true, tables: result.rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: "Failed to fetch tables" });
  }
});

app.get("/api/printers", async (_req, res) => {
  try {
    const output = execSync('powershell -NoProfile -Command "Get-Printer | Select-Object -ExpandProperty Name"', {
      encoding: "utf8", timeout: 5000,
    })
    const printers = output.trim().split("\n").map(p => p.trim()).filter(p => p)
    res.json({ printers })
  } catch {
    res.json({ printers: [] })
  }
})

// Sends a raw byte buffer straight to a Windows printer's spooler (RAW
// datatype), bypassing System.Drawing / the printer driver entirely. This is
// the standard technique for ESC/POS thermal printers (Microsoft KB322091):
// no driver-decided page size, no driver-side text re-encoding - the printer
// firmware interprets our bytes directly, exactly as we wrote them.
function sendRawBytesToPrinter(printerName, bytes) {
  const id = Date.now()
  const dataFile = path.join(os.tmpdir(), `pos-print-${id}.bin`)
  const psFile = path.join(os.tmpdir(), `pos-print-${id}.ps1`)
  fs.writeFileSync(dataFile, bytes)

  const escapedPrinter = printerName.replace(/'/g, "''")
  const escapedDataPath = dataFile.replace(/\\/g, "\\\\")

  const psScript = `
$ErrorActionPreference = "Stop"
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public class RawPrinterHelper {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
    public class DOCINFOA {
        [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
    }

    [DllImport("winspool.Drv", EntryPoint = "OpenPrinterA", SetLastError = true, CharSet = CharSet.Ansi, ExactSpelling = true)]
    public static extern bool OpenPrinter(string szPrinter, out IntPtr hPrinter, IntPtr pd);

    [DllImport("winspool.Drv", EntryPoint = "ClosePrinter", SetLastError = true, ExactSpelling = true)]
    public static extern bool ClosePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "StartDocPrinterA", SetLastError = true, CharSet = CharSet.Ansi, ExactSpelling = true)]
    public static extern int StartDocPrinter(IntPtr hPrinter, int level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOA di);

    [DllImport("winspool.Drv", EntryPoint = "EndDocPrinter", SetLastError = true, ExactSpelling = true)]
    public static extern bool EndDocPrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "StartPagePrinter", SetLastError = true, ExactSpelling = true)]
    public static extern bool StartPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "EndPagePrinter", SetLastError = true, ExactSpelling = true)]
    public static extern bool EndPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "WritePrinter", SetLastError = true, ExactSpelling = true)]
    public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, int dwCount, out int dwWritten);

    public static bool SendBytes(string printerName, byte[] bytes) {
        IntPtr hPrinter;
        if (!OpenPrinter(printerName, out hPrinter, IntPtr.Zero)) return false;
        try {
            DOCINFOA di = new DOCINFOA();
            di.pDocName = "POS Receipt";
            di.pDataType = "RAW";
            if (StartDocPrinter(hPrinter, 1, di) == 0) return false;
            try {
                if (!StartPagePrinter(hPrinter)) return false;
                try {
                    IntPtr pUnmanaged = Marshal.AllocCoTaskMem(bytes.Length);
                    try {
                        Marshal.Copy(bytes, 0, pUnmanaged, bytes.Length);
                        int written;
                        return WritePrinter(hPrinter, pUnmanaged, bytes.Length, out written);
                    } finally {
                        Marshal.FreeCoTaskMem(pUnmanaged);
                    }
                } finally {
                    EndPagePrinter(hPrinter);
                }
            } finally {
                EndDocPrinter(hPrinter);
            }
        } finally {
            ClosePrinter(hPrinter);
        }
    }
}
"@ -Language CSharp

$bytes = [System.IO.File]::ReadAllBytes('${escapedDataPath}')
$ok = [RawPrinterHelper]::SendBytes('${escapedPrinter}', $bytes)
if (-not $ok) { Write-Error "WritePrinter failed"; exit 1 }
`
  fs.writeFileSync(psFile, psScript, "utf8")
  try {
    execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${psFile}"`, {
      encoding: "utf8", timeout: 60000,
    })
  } finally {
    fs.unlinkSync(dataFile)
    fs.unlinkSync(psFile)
  }
}

app.post("/api/print", async (req, res) => {
  const { printerName, content } = req.body
  if (!printerName || !content) {
    return res.status(400).json({ error: "printerName and content required" })
  }
  try {
    sendRawBytesToPrinter(printerName, buildTextEscposJob(content))
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.post("/api/print-image", async (req, res) => {
  const { printerName, image, paperWidthMm } = req.body
  if (!printerName || !image) {
    return res.status(400).json({ error: "printerName and image required" })
  }
  try {
    const base64 = String(image).replace(/^data:image\/png;base64,/, "")
    const { width, height, rgba } = decodePng(Buffer.from(base64, "base64"))
    const dotsWidth = dotsWidthForPaper(paperWidthMm)
    const job = buildReceiptEscposJob({ rgba, width, height, dotsWidth })
    sendRawBytesToPrinter(printerName, job)
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

async function startServer() {
  await initDb();
  app.listen(PORT, () => {
    console.log(`===== POS Terminal v2 =====`);
    console.log(`API:   http://localhost:${PORT}`);
    console.log(`Press Ctrl+C to stop`);
  });
}

startServer();
