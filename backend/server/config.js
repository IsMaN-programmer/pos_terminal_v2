import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isElectron = !!process.versions.electron;
const CONFIG_PATH = isElectron
  ? path.join(process.env.APPDATA || os.homedir(), 'pos-terminal-v2', 'config.json')
  : path.join(__dirname, 'config.json');

const DEFAULT_CONFIG = {
  role: 'neutral',
  masterIp: '',
  printers: {
    receipt: { terminal: '', printer: '' },
    kitchen: { terminal: '', printer: '' },
    waiter: { terminal: '', printer: '' },
  },
};

function normalizePrinter(v) {
  if (!v) return { terminal: '', printer: '' };
  if (typeof v === 'string') return { terminal: '', printer: v };
  return { terminal: String(v.terminal || ''), printer: String(v.printer || '') };
}

let cache = null;

export function getConfig() {
  if (cache) return cache;
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
      const printers = raw.printers || {};
      cache = {
        ...DEFAULT_CONFIG,
        ...raw,
        printers: {
          receipt: normalizePrinter(printers.receipt),
          kitchen: normalizePrinter(printers.kitchen),
          waiter: normalizePrinter(printers.waiter),
        },
      };
    } else {
      cache = { ...DEFAULT_CONFIG };
    }
  } catch (err) {
    console.error('[CONFIG] Load error:', err.message);
    cache = { ...DEFAULT_CONFIG };
  }
  return cache;
}

export function setConfig(patch) {
  const next = { ...getConfig(), ...patch };
  if (patch.printers) {
    const p = patch.printers;
    next.printers = {
      receipt: normalizePrinter(p.receipt),
      kitchen: normalizePrinter(p.kitchen),
      waiter: normalizePrinter(p.waiter),
    };
  }
  try {
    fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(next, null, 2));
    cache = next;
  } catch (err) {
    console.error('[CONFIG] Save error:', err.message);
  }
  return next;
}

export function configPath() {
  return CONFIG_PATH;
}

export function getTerminalName() {
  return os.hostname() || 'TERMINAL';
}

export function getLanIps() {
  const ips = [];
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal && !iface.address.startsWith('169.254.')) {
        ips.push({ name, address: iface.address });
      }
    }
  }
  return ips;
}

export function getMainLanIp() {
  const ips = getLanIps();
  return ips.length > 0 ? ips[0].address : '127.0.0.1';
}
