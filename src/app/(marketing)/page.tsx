'use client';

import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import * as XLSX from 'xlsx';
import QRCode from 'qrcode';
import { createStore, today, specOf } from '@/lib/gate-pass-store';
import type { DeliveryNote, DNLine, GatePass, Customer, PlantMaster, LocationMaster, UserAccount, NumberSettings, LpoSoMapping, DataStore, DNAttachment, ReprintLog, PlantTag, OnhandItem } from '@/lib/gate-pass-store';

// ── Store singleton ───────────────────────────────────────────────────────────
let _store: DataStore | null = null;
function getStore() {
  if (!_store) _store = createStore();
  return _store;
}

// ── Brand colours ─────────────────────────────────────────────────────────────
const C = {
  bg: '#f1f4f1',
  header: '#123c2b',
  primary: '#1d6043',
  ph: '#174f38',       // primary hover
  text: '#19211d',
  muted: '#7a857e',
  border: '#e2e7e3',
  borderL: '#eef1ee',
  gold: '#e9d9a6',
  white: '#fff',
  red: '#c0532e',
  amber: '#b06a1e',
};

// ── Logo ──────────────────────────────────────────────────────────────────────
function Logo({ style }: { style?: React.CSSProperties }) {
  return <img src="/acacia-logo.png" alt="Acacia" style={{ objectFit: 'contain', ...style }} />;
}

// ── QR Code ───────────────────────────────────────────────────────────────────
// Drawn in useLayoutEffect (not a dynamic import) so the canvas has real
// pixels as soon as possible after mount, well before any PDF/print capture.
function QrCode({ value, size = 60, color = '#9aa39d' }: { value: string; size?: number; color?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    if (!canvasRef.current || !value) return;
    QRCode.toCanvas(canvasRef.current, value, {
      width: size, margin: 0, color: { dark: color, light: '#0000' },
    }).catch(() => {
      // encoding failure — leave the canvas blank
    });
  }, [value, size, color]);
  if (!value) return null;
  return <canvas ref={canvasRef} style={{ display: 'block' }} />;
}

// ── Status chip ───────────────────────────────────────────────────────────────
function chipSt(st: string) {
  if (st === 'completed') return { background: '#e0f0e8', color: C.primary };
  if (st === 'scanning')  return { background: '#e8f0fe', color: '#1a56c0' };
  return { background: '#fbf0e0', color: C.amber };
}
function chipLabel(st: string) {
  if (st === 'completed') return 'Completed';
  if (st === 'scanning')  return 'Scanning';
  return 'Pending';
}
function Chip({ st, label }: { st: string; label?: string }) {
  return (
    <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 20, ...chipSt(st) }}>
      {label ?? chipLabel(st)}
    </span>
  );
}

// ── Hover button ──────────────────────────────────────────────────────────────
function Btn({
  onClick, style, hov, children, disabled,
}: {
  onClick?: () => void;
  style: React.CSSProperties;
  hov?: React.CSSProperties;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  const [h, setH] = useState(false);
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={h && hov ? { ...style, ...hov } : style}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
    >
      {children}
    </button>
  );
}

// ── Input ─────────────────────────────────────────────────────────────────────
function Inp({
  value, onChange, placeholder, type, style,
  onKeyDown, onFocus, onBlur, inputRef,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  style?: React.CSSProperties;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  inputRef?: React.RefObject<HTMLInputElement | null>;
}) {
  const [foc, setFoc] = useState(false);
  const baseStyle: React.CSSProperties = {
    width: '100%', padding: '9px 11px',
    border: `1px solid ${foc ? C.primary : '#d7ddd9'}`,
    borderRadius: 8, fontSize: 13.5, background: '#fbfcfb',
    outline: 'none', color: C.text, fontFamily: 'inherit',
    ...style,
  };
  return (
    <input
      ref={inputRef as React.RefObject<HTMLInputElement>}
      type={type || 'text'}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      style={baseStyle}
      onFocus={() => { setFoc(true); onFocus?.(); }}
      onBlur={() => { setFoc(false); onBlur?.(); }}
      onKeyDown={onKeyDown}
    />
  );
}

// ── Select ────────────────────────────────────────────────────────────────────
function Select({ value, onChange, options, style }: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  style?: React.CSSProperties;
}) {
  const [foc, setFoc] = useState(false);
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{
        width: '100%', padding: '9px 11px',
        border: `1px solid ${foc ? C.primary : '#d7ddd9'}`,
        borderRadius: 8, fontSize: 13.5, background: '#fbfcfb',
        outline: 'none', color: C.text, fontFamily: 'inherit',
        ...style,
      }}
      onFocus={() => setFoc(true)}
      onBlur={() => setFoc(false)}
    >
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

// ── Customer combo (searchable dropdown) ────────────────────────────────────────
function CustomerCombo({ value, customers, onChangeText, onSelect }: {
  value: string;
  customers: Customer[];
  onChangeText: (v: string) => void;
  onSelect: (c: Customer) => void;
}) {
  const [open, setOpen] = useState(false);
  const q = (value || '').trim().toLowerCase();
  const filtered = q ? customers.filter(c => c.customerName.toLowerCase().includes(q)) : customers;
  return (
    <div style={{ position: 'relative' }}>
      <Inp
        value={value || ''}
        onChange={v => { onChangeText(v); setOpen(true); }}
        placeholder="Search or type customer name"
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={e => { if (e.key === 'Escape') setOpen(false); }}
      />
      {open && filtered.length > 0 && (
        <div
          style={{
            position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4,
            background: '#fff', border: '1px solid #d7ddd9', borderRadius: 8,
            maxHeight: 220, overflowY: 'auto', zIndex: 40,
            boxShadow: '0 10px 26px rgba(0,0,0,.12)',
          }}
        >
          {filtered.map(c => (
            <button
              key={c.id}
              type="button"
              onMouseDown={e => e.preventDefault()}
              onClick={() => { onSelect(c); setOpen(false); }}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '9px 12px', border: 'none', background: 'none',
                cursor: 'pointer', fontFamily: 'inherit', fontSize: 13.5, fontWeight: 600,
              }}
            >
              {c.customerName}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Project combo (searchable, scoped to the selected customer's projects) ──────
function ProjectCombo({ value, options, onChangeText, onSelect }: {
  value: string;
  options: string[];
  onChangeText: (v: string) => void;
  onSelect: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const q = (value || '').trim().toLowerCase();
  const uniqueOptions = Array.from(new Set(options));
  const filtered = q ? uniqueOptions.filter(p => p.toLowerCase().includes(q)) : uniqueOptions;
  return (
    <div style={{ position: 'relative' }}>
      <Inp
        value={value || ''}
        onChange={v => { onChangeText(v); setOpen(true); }}
        placeholder={options.length ? 'Search project' : 'Select a customer first'}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={e => { if (e.key === 'Escape') setOpen(false); }}
      />
      {open && filtered.length > 0 && (
        <div
          style={{
            position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4,
            background: '#fff', border: '1px solid #d7ddd9', borderRadius: 8,
            maxHeight: 220, overflowY: 'auto', zIndex: 40,
            boxShadow: '0 10px 26px rgba(0,0,0,.12)',
          }}
        >
          {filtered.map(p => (
            <button
              key={p}
              type="button"
              onMouseDown={e => e.preventDefault()}
              onClick={() => { onSelect(p); setOpen(false); }}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '9px 12px', border: 'none', background: 'none',
                cursor: 'pointer', fontFamily: 'inherit', fontSize: 13.5,
              }}
            >
              {p}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Filter combo (free-text search with matching suggestions, used in Report filters) ──
function FilterCombo({ value, options, onChange, placeholder }: {
  value: string;
  options: string[];
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const q = (value || '').trim().toLowerCase();
  const filtered = q ? options.filter(o => o.toLowerCase().includes(q)) : options;
  return (
    <div style={{ position: 'relative' }}>
      <Inp
        value={value || ''}
        onChange={v => { onChange(v); setOpen(true); }}
        placeholder={placeholder}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={e => { if (e.key === 'Escape') setOpen(false); }}
      />
      {open && filtered.length > 0 && (
        <div
          style={{
            position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4,
            background: '#fff', border: '1px solid #d7ddd9', borderRadius: 8,
            maxHeight: 220, overflowY: 'auto', zIndex: 40,
            boxShadow: '0 10px 26px rgba(0,0,0,.12)',
          }}
        >
          {filtered.map(o => (
            <button
              key={o}
              type="button"
              onMouseDown={e => e.preventDefault()}
              onClick={() => { onChange(o); setOpen(false); }}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '9px 12px', border: 'none', background: 'none',
                cursor: 'pointer', fontFamily: 'inherit', fontSize: 13.5,
              }}
            >
              {o}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Table input (smaller) ─────────────────────────────────────────────────────
function TInp({ value, onChange, placeholder, style, onFocus, onBlur }: {
  value: string; onChange: (v: string) => void; placeholder?: string; style?: React.CSSProperties;
  onFocus?: () => void; onBlur?: () => void;
}) {
  const [f, setF] = useState(false);
  return (
    <input
      type="text" value={value} onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      style={{ width: '100%', padding: '7px 8px', border: `1px solid ${f ? C.primary : '#dfe4e0'}`, borderRadius: 6, fontSize: 13, outline: 'none', background: '#fff', fontFamily: 'inherit', ...style }}
      onFocus={() => { setF(true); onFocus?.(); }}
      onBlur={() => { setF(false); onBlur?.(); }}
    />
  );
}

// ── Plant name combo (compact, table-cell sized, searchable against Plant Master) ──
function PlantNameCombo({ value, plants, onChangeText, onSelect }: {
  value: string;
  plants: PlantMaster[];
  onChangeText: (v: string) => void;
  onSelect: (p: PlantMaster) => void;
}) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const q = (value || '').trim().toLowerCase();
  const filtered = q ? plants.filter(p => p.plantName.toLowerCase().includes(q)) : plants;

  const openDropdown = () => {
    const r = wrapRef.current?.getBoundingClientRect();
    if (r) setRect({ top: r.bottom + 4, left: r.left, width: r.width });
    setOpen(true);
  };

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <TInp
        value={value || ''}
        onChange={v => { onChangeText(v); openDropdown(); }}
        placeholder="Plant name"
        onFocus={openDropdown}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
      />
      {open && filtered.length > 0 && rect && typeof document !== 'undefined' && createPortal(
        <div
          style={{
            position: 'fixed', top: rect.top, left: rect.left, width: rect.width,
            background: '#fff', border: '1px solid #d7ddd9', borderRadius: 8,
            maxHeight: 200, overflowY: 'auto', zIndex: 1000,
            boxShadow: '0 10px 26px rgba(0,0,0,.12)',
          }}
        >
          {filtered.map(p => (
            <button
              key={p.id}
              type="button"
              onMouseDown={e => e.preventDefault()}
              onClick={() => { onSelect(p); setOpen(false); }}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '8px 10px', border: 'none', background: 'none',
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 600 }}>{p.plantName}</div>
              <div style={{ fontSize: 11, color: '#7a857e' }}>{p.category}</div>
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}

// ── Location combo (compact, table-cell sized, searchable against Location Master) ──
function LocationCombo({ value, locations, onChangeText, onSelect }: {
  value: string;
  locations: LocationMaster[];
  onChangeText: (v: string) => void;
  onSelect: (l: LocationMaster) => void;
}) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const q = (value || '').trim().toLowerCase();
  const filtered = q ? locations.filter(l => l.name.toLowerCase().includes(q)) : locations;

  const openDropdown = () => {
    const r = wrapRef.current?.getBoundingClientRect();
    if (r) setRect({ top: r.bottom + 4, left: r.left, width: r.width });
    setOpen(true);
  };

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <TInp
        value={value || ''}
        onChange={v => { onChangeText(v); openDropdown(); }}
        placeholder="e.g. Location A"
        onFocus={openDropdown}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
      />
      {open && filtered.length > 0 && rect && typeof document !== 'undefined' && createPortal(
        <div
          style={{
            position: 'fixed', top: rect.top, left: rect.left, width: rect.width,
            background: '#fff', border: '1px solid #d7ddd9', borderRadius: 8,
            maxHeight: 200, overflowY: 'auto', zIndex: 1000,
            boxShadow: '0 10px 26px rgba(0,0,0,.12)',
          }}
        >
          {filtered.map(l => (
            <button
              key={l.id}
              type="button"
              onMouseDown={e => e.preventDefault()}
              onClick={() => { onSelect(l); setOpen(false); }}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '8px 10px', border: 'none', background: 'none',
                cursor: 'pointer', fontFamily: 'inherit', fontSize: 13,
              }}
            >
              {l.name}
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}

// ── Section label ─────────────────────────────────────────────────────────────
function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: C.muted, marginBottom: 5 }}>
      {children}
    </label>
  );
}

// ── Toast ─────────────────────────────────────────────────────────────────────
function Toast({ msg }: { msg: string | null }) {
  if (!msg) return null;
  return (
    <div style={{
      position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)',
      background: C.text, color: '#fff', borderRadius: 10, padding: '11px 22px',
      fontSize: 14, fontWeight: 600, zIndex: 999, whiteSpace: 'nowrap',
      boxShadow: '0 8px 28px rgba(0,0,0,.25)',
      animation: 'fadeUp .2s ease',
    }}>
      {msg}
    </div>
  );
}

// ── Progress bar ──────────────────────────────────────────────────────────────
function ProgBar({ scanned, target }: { scanned: number; target: number }) {
  const pct = target > 0 ? Math.min(100, (scanned / target) * 100) : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
      <div style={{ flex: 1, height: 7, borderRadius: 5, background: '#eaeeea', overflow: 'hidden' }}>
        <div style={{ height: '100%', background: C.primary, width: pct + '%', transition: 'width .3s' }} />
      </div>
      <span style={{ fontSize: 12.5, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: '#46514a' }}>
        {scanned}/{target}
      </span>
    </div>
  );
}

// ── GP form state (Admin-created — Step 1) ─────────────────────────────────────
interface GPFormLine { idx: number; plantCode: string; plantDesc: string; potSize: string; height: string; girth: string; qty: string; postedQty: string; remainingQty: string; location: string; }
interface GPForm { customerName: string; customerCode: string; doDate: string; doNo: string; lpoNo: string; lpoDate: string; prRef: string; soRef: string; project: string; party: string; assignedTo: string[]; lines: GPFormLine[]; }
function emptyGPForm(): GPForm {
  return { customerName: '', customerCode: '', doDate: today(), doNo: '', lpoNo: '', lpoDate: '', prRef: '', soRef: '', project: '', party: '', assignedTo: [], lines: [emptyLine(0)] };
}
function emptyLine(idx: number): GPFormLine {
  return { idx, plantCode: '', plantDesc: '', potSize: '', height: '', girth: '', qty: '', postedQty: '', remainingQty: '', location: '' };
}

// ── DN form state (Garden-created — Step 2) ────────────────────────────────────
interface DNFormLine { slNo: number; plantName: string; plantCode: string; spec: string; qty: number; deliveryQty: string; remarks: string; location: string; }
interface DNForm { gpNo: string; customerProject: string; vhNumber: string; project: string; date: string; lines: DNFormLine[]; }

// ── Customer form state ─────────────────────────────────────────────────────────
interface CustomerFormProject { idx: number; value: string; }
interface CustomerForm { customerName: string; party: 'EXT' | 'INT'; projects: CustomerFormProject[]; }
function emptyCustomerForm(): CustomerForm {
  return { customerName: '', party: 'EXT', projects: [{ idx: 0, value: '' }] };
}

// ── Plant Master form state ─────────────────────────────────────────────────────
interface PlantForm { category: string; plantName: string; }
function emptyPlantForm(): PlantForm {
  return { category: '', plantName: '' };
}

// ── Location Master form state ──────────────────────────────────────────────────
interface LocationForm { name: string; }
function emptyLocationForm(): LocationForm {
  return { name: '' };
}

// ── LPO / SO Mapping form state ─────────────────────────────────────────────────
interface LpoSoForm { customerName: string; project: string; poNo: string; soRef: string; }
function emptyLpoSoForm(): LpoSoForm {
  return { customerName: '', project: '', poNo: '', soRef: '' };
}

// ── User Account form state ─────────────────────────────────────────────────────
interface UserForm { username: string; password: string; role: 'admin' | 'garden'; }
function emptyUserForm(): UserForm {
  return { username: '', password: '', role: 'admin' };
}

// ── Report row (combined Gate Pass + Delivery Note line item) ──────────────────
interface ReportRow {
  key: string; slNo: number;
  date: string; gpNo: string; dnNo: string; category: string; itemDescription: string;
  plantCode: string; plantName: string; spec: string;
  party: string; customerProject: string; project: string;
  lpoNo: string; prRef: string; soRef: string; doNo: string;
  deliveryQty: number; postedQty: string; remainingQty: string; location: string; remarks: string;
  status: LineStatus; serials: string[];
}

type LineStatus = 'Closed' | 'Open' | 'Pending';
function lineStatus(postedQty: string, deliveryQty: number): LineStatus {
  const posted = Number(postedQty) || 0;
  if (posted >= deliveryQty) return 'Closed';
  if (posted > 0) return 'Pending';
  return 'Open';
}
function statusColors(status: LineStatus): { background: string; color: string } {
  if (status === 'Closed') return { background: '#e0f0e8', color: C.primary };
  if (status === 'Pending') return { background: '#e8f0fe', color: '#1a56c0' };
  return { background: '#fbf0e0', color: C.amber };
}

// Converts a "DD-MM-YYYY" display date to "YYYY-MM-DD" so it can be compared
// against a native <input type="date"> value with plain string comparison.
function dmyToIso(s: string): string {
  const m = s.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : '';
}

// ── Delivery Note attachments (Photo / Excel / PDF reference files) ───────────
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024; // 5MB — localStorage has limited total quota

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error || new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function downloadDataUrl(dataUrl: string, filename: string) {
  const a = document.createElement('a');
  a.href = dataUrl; a.download = filename; a.click();
}

// Some existing external QR codes/labels encode a full lookup URL like
//   http://acaciallc.dyndns.org/index.php?s=TRETERMAN~S000463462~OT_5B_150LP
// where the middle "~"-separated segment is the actual serial/code wanted.
// Scan fields run raw scanner input through this so pasting/typing a plain
// code (not a URL) still passes through unchanged.
function extractScanCode(raw: string): string {
  const trimmed = raw.trim();
  // The serial shows up in several raw shapes depending on the scanner/QR:
  //   - wrapped in a lookup URL:      ?s=TRETERMAN~S000463462~OT_5B_150LP
  //   - "~"-separated, no URL:        S000036722~PL_5_240LP
  //   - concatenated with no gap at all (tildes dropped in transit):
  //                                   TREPLUOBS000036722PL_5_240LP
  // In every case the serial itself looks like "S" followed by exactly 9
  // digits — matched as a FIXED length (not "6 or more") because when there's
  // no separator between the serial and the next segment (e.g. a size code
  // starting with digits, "...S000036722" immediately followed by "5240..."),
  // an open-ended digit run greedily swallows the next segment's digits too.
  const urlMatch = trimmed.match(/[?&]s=([^&]+)/i);
  const candidate = urlMatch?.[1] ? decodeURIComponent(urlMatch[1]) : trimmed;
  const embedded = candidate.match(/S\d{9}/i);
  if (embedded) return embedded[0];
  if (candidate.includes('~')) {
    const first = candidate.split('~').map(p => p.trim()).find(Boolean);
    if (first) return first;
  }
  return trimmed;
}

// One row per physical unit (not per line) — Plant Name/Specification copied down
// to match the line's quantity, for barcode label printing / manual reference.
function exportDnScanSheet(dn: DeliveryNote) {
  const rows: Array<Record<string, string | number>> = [];
  dn.lines.forEach(ln => {
    const qty = ln.deliveryQty || 0;
    for (let i = 0; i < qty; i++) {
      rows.push({
        'Sl.no': ln.slNo,
        'Plant Name': ln.plantName,
        'Specification': ln.spec,
        'Unit #': i + 1,
        'Barcode': ln.serials[i] || '',
        'Location': ln.location,
      });
    }
  });
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Scan Sheet');
  XLSX.writeFile(wb, `ScanSheet-DN-${dn.no}.xlsx`);
}

// ── Shared PDF export / share-sheet logic (Delivery Note + Gate Pass) ──────────
async function buildPdfFromElement(el: HTMLElement, orientation: 'portrait' | 'landscape' = 'portrait') {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
  ]);
  const canvas = await html2canvas(el, {
    scale: 2, backgroundColor: '#ffffff',
    ignoreElements: e => e.hasAttribute('data-print-hide'),
  });
  const imgData = canvas.toDataURL('image/png');
  const pdf = new jsPDF({ orientation, unit: 'pt', format: 'a4' });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const imgWidth = pageWidth;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;
  let heightLeft = imgHeight;
  let position = 0;
  pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
  heightLeft -= pageHeight;
  while (heightLeft > 0) {
    position = heightLeft - imgHeight;
    pdf.addPage();
    pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;
  }
  return pdf;
}

// cloneNode(true) copies a <canvas> element but not its drawn pixels (the
// bitmap lives outside the DOM tree), so anything drawn on a canvas — like
// the QR code — comes out blank in a clone unless it's re-painted here.
function copyCanvasBitmaps(source: HTMLElement, target: HTMLElement) {
  const sourceCanvases = source.querySelectorAll('canvas');
  const targetCanvases = target.querySelectorAll('canvas');
  sourceCanvases.forEach((sourceCanvas, i) => {
    const targetCanvas = targetCanvases[i];
    if (!targetCanvas) return;
    targetCanvas.getContext('2d')?.drawImage(sourceCanvas, 0, 0);
  });
}

// Builds the Delivery Note PDF with the header (everything before the table —
// Acacia LLC through PO No.) repeated at the top of every page, the footer
// (Prepared By through the Note line) placed once at the true end of the
// document, and the line-items table as the only part that flows/paginates
// across pages in between. Falls back to the simple whole-element capture if
// there's no table or no rows to paginate.
async function buildDeliveryNotePdf(el: HTMLElement, orientation: 'portrait' | 'landscape') {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
  ]);

  const pdf = new jsPDF({ orientation, unit: 'pt', format: 'a4' });
  const pageWidthPt = pdf.internal.pageSize.getWidth();
  const pageHeightPt = pdf.internal.pageSize.getHeight();

  const addCanvasAsPage = (canvas: HTMLCanvasElement, isFirst: boolean) => {
    const imgData = canvas.toDataURL('image/png');
    const imgWidth = pageWidthPt;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    if (!isFirst) pdf.addPage();
    pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, Math.min(imgHeight, pageHeightPt));
  };

  const capture = (target: HTMLElement) => html2canvas(target, {
    scale: 2, backgroundColor: '#ffffff',
    ignoreElements: e => e.hasAttribute('data-print-hide'),
  });

  const table = el.querySelector('table');
  const children = Array.from(el.children) as HTMLElement[];
  const tableIndex = table ? children.indexOf(table) : -1;
  const tbody = table?.querySelector('tbody');
  const rows = tbody ? (Array.from(tbody.children) as HTMLElement[]) : [];

  if (!table || tableIndex === -1 || rows.length === 0) {
    const canvas = await capture(el);
    addCanvasAsPage(canvas, true);
    return pdf;
  }

  const headerNodes = children.slice(0, tableIndex);
  const footerNodes = children.slice(tableIndex + 1).filter(c => !c.hasAttribute('data-print-hide'));
  const thead = table.querySelector('thead') as HTMLElement | null;

  const ptPerPx = pageWidthPt / el.offsetWidth;
  const maxPagePx = pageHeightPt / ptPerPx;
  const headerPx = headerNodes.reduce((a, n) => a + n.offsetHeight, 0);
  const footerPx = footerNodes.reduce((a, n) => a + n.offsetHeight, 0);
  const theadPx = thead?.offsetHeight || 0;

  // Greedily pack rows into pages, leaving room for header + thead (the
  // footer is intentionally excluded from this budget — it only needs to fit
  // on the true last page, handled below).
  const rowBudgetPx = Math.max(100, maxPagePx - headerPx - theadPx - 20);
  const pages: HTMLElement[][] = [];
  let current: HTMLElement[] = [];
  let currentHeight = 0;
  for (const row of rows) {
    const h = row.offsetHeight;
    if (current.length > 0 && currentHeight + h > rowBudgetPx) {
      pages.push(current);
      current = [];
      currentHeight = 0;
    }
    current.push(row);
    currentHeight += h;
  }
  if (current.length > 0) pages.push(current);
  if (pages.length === 0) pages.push([]);

  // If the footer doesn't fit alongside the last page's rows, bump the
  // overflowing rows onto a fresh final page so the footer never gets cut off.
  const lastPageRows = pages[pages.length - 1];
  if (lastPageRows) {
    let lastPageRowsHeight = lastPageRows.reduce((a, r) => a + r.offsetHeight, 0);
    if (headerPx + theadPx + lastPageRowsHeight + footerPx > maxPagePx) {
      const moved: HTMLElement[] = [];
      while (lastPageRows.length > 0 && headerPx + theadPx + lastPageRowsHeight + footerPx > maxPagePx) {
        const popped = lastPageRows.pop();
        if (!popped) break;
        moved.unshift(popped);
        lastPageRowsHeight -= popped.offsetHeight;
      }
      if (moved.length > 0) pages.push(moved);
    }
  }

  for (let i = 0; i < pages.length; i++) {
    const pageRows = pages[i] ?? [];
    const isLast = i === pages.length - 1;

    const wrapper = document.createElement('div');
    wrapper.style.cssText = `position:fixed; left:-10000px; top:0; background:#fff; width:${el.offsetWidth}px;`;

    headerNodes.forEach(n => {
      const clone = n.cloneNode(true) as HTMLElement;
      copyCanvasBitmaps(n, clone);
      wrapper.appendChild(clone);
    });

    const tableClone = table.cloneNode(true) as HTMLTableElement;
    const tbodyClone = tableClone.querySelector('tbody');
    if (tbodyClone) {
      tbodyClone.innerHTML = '';
      pageRows.forEach(r => tbodyClone.appendChild(r.cloneNode(true)));
    }
    wrapper.appendChild(tableClone);

    if (isLast) {
      footerNodes.forEach(n => wrapper.appendChild(n.cloneNode(true) as HTMLElement));
    }

    document.body.appendChild(wrapper);
    try {
      const canvas = await capture(wrapper);
      addCanvasAsPage(canvas, i === 0);
    } finally {
      document.body.removeChild(wrapper);
    }
  }

  return pdf;
}

function downloadFile(file: File) {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url; a.download = file.name; a.click();
  URL.revokeObjectURL(url);
}

function usePdfShare(printRef: React.RefObject<HTMLElement | null>, options?: { orientation?: 'portrait' | 'landscape'; paginated?: boolean }) {
  const [downloading, setDownloading] = useState(false);
  const [shareMenuOpen, setShareMenuOpen] = useState(false);
  const [sharing, setSharing] = useState(false);

  const buildPdf = () => options?.paginated
    ? buildDeliveryNotePdf(printRef.current!, options?.orientation ?? 'portrait')
    : buildPdfFromElement(printRef.current!, options?.orientation ?? 'portrait');

  const getPdfFile = async (filename: string) => {
    const pdf = await buildPdf();
    const blob = pdf.output('blob') as Blob;
    return new File([blob], filename, { type: 'application/pdf' });
  };

  const handleDownloadPdf = async (filename: string) => {
    if (!printRef.current || downloading) return;
    setDownloading(true);
    try {
      const pdf = await buildPdf();
      pdf.save(filename);
    } finally {
      setDownloading(false);
    }
  };

  const nativeShare = (typeof navigator !== 'undefined' ? navigator : undefined) as (Navigator & {
    canShare?: (data: { files: File[] }) => boolean;
    share?: (data: { files: File[]; title?: string; text?: string }) => Promise<void>;
  }) | undefined;

  const handleSharePdf = async (filename: string, title: string, text: string) => {
    if (!printRef.current || sharing) return;
    setShareMenuOpen(false);
    setSharing(true);
    try {
      const file = await getPdfFile(filename);
      if (nativeShare?.share && nativeShare.canShare?.({ files: [file] })) {
        await nativeShare.share({ files: [file], title, text });
      } else {
        downloadFile(file);
      }
    } catch {
      // user cancelled the share sheet — no-op
    } finally {
      setSharing(false);
    }
  };

  const handleShareWhatsApp = async (filename: string, title: string, text: string, waText: string) => {
    if (!printRef.current || sharing) return;
    setShareMenuOpen(false);
    setSharing(true);
    try {
      const file = await getPdfFile(filename);
      if (nativeShare?.share && nativeShare.canShare?.({ files: [file] })) {
        await nativeShare.share({ files: [file], title, text });
      } else {
        downloadFile(file);
        window.open(`https://wa.me/?text=${encodeURIComponent(waText)}`, '_blank');
      }
    } catch {
      // user cancelled the share sheet — no-op
    } finally {
      setSharing(false);
    }
  };

  return { downloading, shareMenuOpen, setShareMenuOpen, sharing, handleDownloadPdf, handleSharePdf, handleShareWhatsApp };
}

// ── Nav item ──────────────────────────────────────────────────────────────────
function NavItem({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  const [h, setH] = useState(false);
  const st: React.CSSProperties = {
    display: 'block', width: '100%', textAlign: 'left',
    padding: '10px 12px', borderRadius: 8, border: 'none',
    fontFamily: 'inherit', fontSize: 14, fontWeight: active ? 700 : 500,
    cursor: 'pointer',
    background: active ? '#e8f0ec' : (h ? '#f4f7f5' : 'transparent'),
    color: active ? C.primary : (h ? C.text : '#46514a'),
  };
  return (
    <button style={st} onClick={onClick} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}>
      {label}
    </button>
  );
}

function SettingsCard({ label, description, onClick }: { label: string; description: string; onClick: () => void }) {
  const [h, setH] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        textAlign: 'left', background: C.white, border: `1px solid ${h ? C.primary : C.border}`,
        borderRadius: 12, padding: '18px 20px', cursor: 'pointer', fontFamily: 'inherit',
        boxShadow: h ? '0 4px 14px rgba(0,0,0,.06)' : 'none', transition: 'box-shadow .15s, border-color .15s',
      }}
    >
      <div style={{ fontWeight: 700, fontSize: 15.5, color: C.text }}>{label}</div>
      <div style={{ marginTop: 5, fontSize: 13, color: '#5b6660' }}>{description}</div>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN APP COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

type ViewKey =
  | 'login_roles' | 'login_form'
  | 'admin_dashboard' | 'admin_gps' | 'admin_new_gp' | 'admin_view_gp'
  | 'admin_dns' | 'admin_view_dn'
  | 'admin_customers' | 'admin_new_customer'
  | 'admin_settings'
  | 'admin_plants' | 'admin_new_plant'
  | 'admin_locations' | 'admin_new_location'
  | 'admin_users' | 'admin_new_user' | 'admin_reset_password'
  | 'admin_number_settings'
  | 'admin_lposo' | 'admin_new_lposo'
  | 'admin_reprints' | 'admin_new_reprint'
  | 'admin_tags' | 'admin_new_tag'
  | 'admin_onhand' | 'admin_new_onhand'
  | 'report'
  | 'garden_home' | 'garden_scanning' | 'garden_new_dn' | 'garden_scan' | 'garden_view_dn';

export default function GatePassApp() {
  // ── Auth ──
  const [view, setView]           = useState<ViewKey>('login_roles');
  const [loginRole, setLoginRole] = useState<'admin' | 'garden' | null>(null);
  const [loginUser, setLoginUser] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [loginErr, setLoginErr]   = useState('');
  const [auth, setAuth]           = useState<{ name: string; role: 'admin' | 'garden' } | null>(null);

  // ── Data ──
  const [gps, setGps] = useState<GatePass[]>([]);
  const [dns, setDns] = useState<DeliveryNote[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [plants, setPlants] = useState<PlantMaster[]>([]);
  const [locations, setLocations] = useState<LocationMaster[]>([]);
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [numberSettings, setNumberSettings] = useState<NumberSettings>({ gpPrefix: 'GP-', gpNext: 100001, dnPrefix: 'DO-', dnNext: 100001 });
  const [lpoSoMappings, setLpoSoMappings] = useState<LpoSoMapping[]>([]);
  const [reprintLogs, setReprintLogs] = useState<ReprintLog[]>([]);
  const [plantTags, setPlantTags] = useState<PlantTag[]>([]);
  const [onhandItems, setOnhandItems] = useState<OnhandItem[]>([]);
  const [onhandSearch, setOnhandSearch] = useState('');
  const [onhandSelected, setOnhandSelected] = useState<Set<string>>(new Set());

  // ── Navigation targets ──
  const [activeGpNo, setActiveGpNo] = useState<string | null>(null);
  const [activeDnNo, setActiveDnNo] = useState<string | null>(null);

  // ── Forms ──
  const [gpForm, setGpForm] = useState<GPForm>(emptyGPForm);
  const [editingGpNo, setEditingGpNo] = useState<string | null>(null);
  const [gpForGardenDn, setGpForGardenDn] = useState(false);
  const gpPrintRef = useRef<HTMLDivElement>(null);
  const gpShare = usePdfShare(gpPrintRef);
  const tagPrintRef = useRef<HTMLDivElement>(null);
  const [dnForm, setDnForm] = useState<DNForm | null>(null);
  const [customerForm, setCustomerForm] = useState<CustomerForm>(emptyCustomerForm);
  const [editingCustomerId, setEditingCustomerId] = useState<string | null>(null);
  const [plantForm, setPlantForm] = useState<PlantForm>(emptyPlantForm);
  const [locationForm, setLocationForm] = useState<LocationForm>(emptyLocationForm);
  const [lpoSoForm, setLpoSoForm] = useState<LpoSoForm>(emptyLpoSoForm);
  const [reprintScanValue, setReprintScanValue] = useState('');
  const [reprintMatch, setReprintMatch] = useState<{ type: 'gp' | 'dn'; no: string; customerProject: string; date: string; status: string } | null>(null);
  const [reprintNotFound, setReprintNotFound] = useState(false);
  const [tagForm, setTagForm] = useState({ srlNo: '', plantCode: '', plantName: '', size: '', location: '', warehouse: '' });
  const [onhandForm, setOnhandForm] = useState({
    style: '', itemNumber: '', itemName: '', searchName: '', size: '', color: '',
    site: '', warehouse: '', location: '', physicalInventory: '', unitRate: '',
  });
  const [tagError, setTagError] = useState<string | null>(null);
  const [userForm, setUserForm] = useState<UserForm>(emptyUserForm);
  const [resetPasswordUserId, setResetPasswordUserId] = useState<string | null>(null);
  const [resetPasswordValue, setResetPasswordValue] = useState('');
  const [numberSettingsForm, setNumberSettingsForm] = useState({ gpPrefix: '', gpNext: '', dnPrefix: '', dnNext: '' });
  const [reportFilterGpNo, setReportFilterGpNo] = useState('');
  const [reportFilterDnNo, setReportFilterDnNo] = useState('');
  const [reportFilterCustomerProject, setReportFilterCustomerProject] = useState('');
  const [reportFilterProject, setReportFilterProject] = useState('');
  const [reportFilterFromDate, setReportFilterFromDate] = useState('');
  const [reportFilterToDate, setReportFilterToDate] = useState('');
  const [reportFilterStatus, setReportFilterStatus] = useState('');
  const [gardenDnSearchField, setGardenDnSearchField] = useState<'customer' | 'dnNo' | 'gpNo' | 'project' | 'status'>('customer');
  const [gardenDnSearchQuery, setGardenDnSearchQuery] = useState('');

  // ── Scan ──
  const [scanDnNo,      setScanDnNo]      = useState<string | null>(null);
  const [scanLineSlNo,  setScanLineSlNo]  = useState(1);
  const [scanInput,     setScanInput]     = useState('');
  const [scanFeedback,  setScanFeedback]  = useState<{ msg: string; ok: boolean } | null>(null);
  const scanRef = useRef<HTMLInputElement | null>(null);
  const reprintScanRef = useRef<HTMLInputElement | null>(null);
  const tagScanRef = useRef<HTMLInputElement | null>(null);

  // ── Toast ──
  const [toast, setToast] = useState<string | null>(null);

  // ── Side-effects ──
  useEffect(() => {
    if (view === 'garden_scan') setTimeout(() => scanRef.current?.focus(), 80);
    if (view === 'admin_new_reprint') setTimeout(() => reprintScanRef.current?.focus(), 80);
    if (view === 'admin_new_tag') setTimeout(() => tagScanRef.current?.focus(), 80);
  }, [view]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  // ── Data helpers ──
  const reload = async () => {
    const d = await getStore().loadAll();
    setGps(d.gps);
    setDns(d.dns);
    setCustomers(d.customers);
    setPlants(d.plants);
    setLocations(d.locations);
    setUsers(d.users);
    setNumberSettings(d.numberSettings);
    setLpoSoMappings(d.lpoSoMappings);
    setReprintLogs(d.reprintLogs);
    setPlantTags(d.plantTags);
    setOnhandItems(d.onhandItems);
  };

  // Restore API/local session after refresh
  useEffect(() => {
    const store = getStore();
    if (!store.auth) return;
    setAuth(store.auth);
    void (async () => {
      try {
        const d = await store.loadAll();
        setGps(d.gps);
        setDns(d.dns);
        setCustomers(d.customers);
        setPlants(d.plants);
        setLocations(d.locations);
        setUsers(d.users);
        setNumberSettings(d.numberSettings);
        setView(store.auth!.role === 'admin' ? 'admin_dashboard' : 'garden_home');
      } catch {
        await store.logout();
        setAuth(null);
      }
    })();
  }, []);

  // Keep data in sync with other users on the shared database — poll in the
  // background, plus an immediate refresh whenever the tab regains focus so
  // switching back to it doesn't leave stale data waiting on the next tick.
  useEffect(() => {
    if (!auth) return;
    const interval = setInterval(() => { void reload(); }, 15000);
    const onFocus = () => { void reload(); };
    const onVisibility = () => { if (document.visibilityState === 'visible') onFocus(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [auth]);

  const activeGp = gps.find(g => g.no === activeGpNo) || null;
  const activeDn = dns.find(d => d.no === activeDnNo) || null;
  const scanDn   = dns.find(d => d.no === scanDnNo) || null;

  // ── Stats ──
  const kPending = gps.filter(g => !g.dnNo).length;
  const kOpen = dns.filter(d => d.lines.some(l => lineStatus(l.postedQty, l.deliveryQty) === 'Open')).length;

  // ── Auth handlers ──
  const signIn = async () => {
    try {
      const user = await getStore().login(loginUser, loginPass);
      setAuth(user);
      await reload();
      setLoginErr('');
      setView(user.role === 'admin' ? 'admin_dashboard' : 'garden_home');
    } catch (e) {
      setLoginErr((e as Error).message || 'Invalid credentials');
    }
  };

  const logout = async () => {
    await getStore().logout();
    setAuth(null); setLoginRole(null);
    setLoginUser(''); setLoginPass(''); setLoginErr('');
    setView('login_roles');
  };

  // ── GP form handlers (Admin creates — Step 1) ──
  const openNewGp = () => {
    setEditingGpNo(null);
    setGpForm(emptyGPForm());
    setGpForGardenDn(false);
    setView('admin_new_gp');
  };

  // Garden creating a Delivery Note with no pre-existing Gate Pass: reuses the
  // same header form, then chains straight into the Delivery Note detail step.
  const openNewGpForGardenDn = () => {
    setEditingGpNo(null);
    setGpForm({ ...emptyGPForm(), assignedTo: auth?.name ? [auth.name] : [] });
    setGpForGardenDn(true);
    setView('admin_new_gp');
  };

  const openEditGp = (gp: GatePass) => {
    setEditingGpNo(gp.no);
    setGpForm({
      customerName: gp.customerName, customerCode: gp.customerCode,
      doDate: gp.doDate, doNo: gp.doNo, lpoNo: gp.lpoNo, lpoDate: gp.lpoDate,
      prRef: gp.prRef, soRef: gp.soRef,
      project: gp.project, party: gp.party, assignedTo: gp.assignedTo,
      lines: gp.lines.map((l, i) => ({
        idx: i, plantCode: l.plantCode, plantDesc: l.plantDesc, potSize: l.potSize,
        height: l.height, girth: l.girth, qty: l.qty, postedQty: l.postedQty,
        remainingQty: l.remainingQty, location: l.location,
      })),
    });
    setView('admin_new_gp');
  };

  const updateGpField = (k: keyof Omit<GPForm, 'lines' | 'customerName' | 'project' | 'party' | 'assignedTo'>, v: string) =>
    setGpForm(f => ({ ...f, [k]: v }));

  const updateGpCustomerName = (v: string) =>
    setGpForm(f => ({ ...f, customerName: v }));

  const selectGpCustomer = (c: Customer) =>
    setGpForm(f => ({ ...f, customerName: c.customerName, party: c.party, project: '' }));

  const updateGpProject = (v: string) =>
    setGpForm(f => ({ ...f, project: v }));

  const toggleGpAssignedUser = (username: string) =>
    setGpForm(f => ({
      ...f,
      assignedTo: f.assignedTo.includes(username)
        ? f.assignedTo.filter(u => u !== username)
        : [...f.assignedTo, username],
    }));

  const updateGpLine = (idx: number, k: keyof GPFormLine, v: string) =>
    setGpForm(f => ({ ...f, lines: f.lines.map(l => l.idx === idx ? { ...l, [k]: v } : l) }));

  const addGpLine = () =>
    setGpForm(f => ({ ...f, lines: [...f.lines, emptyLine(f.lines.length)] }));

  const removeGpLine = (idx: number) =>
    setGpForm(f => ({ ...f, lines: f.lines.filter(l => l.idx !== idx) }));

  const saveGp = async () => {
    if (!gpForm.customerName.trim()) { setToast('Customer name is required'); return; }
    const validLines = gpForm.lines.filter(l => l.plantDesc.trim() || l.plantCode.trim());
    if (!validLines.length) { setToast('At least one plant line is required'); return; }
    if (!gpForm.assignedTo.length) { setToast('Please assign at least one user before submitting'); return; }
    try {
      if (editingGpNo) {
        await getStore().updateGatePass(editingGpNo, { ...gpForm, lines: validLines });
        setToast('Gate pass updated');
        await reload();
        setEditingGpNo(null);
        setView('admin_gps');
      } else if (gpForGardenDn) {
        const gp = await getStore().createGatePass({ ...gpForm, lines: validLines });
        await reload();
        setGpForGardenDn(false);
        openNewDn(gp);
      } else {
        await getStore().createGatePass({ ...gpForm, lines: validLines });
        setToast('Gate pass saved');
        await reload();
        setEditingGpNo(null);
        setView('admin_gps');
      }
    } catch (e) { setToast((e as Error).message); }
  };

  // ── DN form handlers (Garden creates — Step 2) ──
  const openNewDn = (gp: GatePass) => {
    setDnForm({
      gpNo: gp.no, customerProject: gp.customerName,
      vhNumber: '', project: gp.project, date: today(),
      lines: gp.lines.map(l => ({
        slNo: l.slNo, plantName: l.plantDesc || l.plantCode, plantCode: l.plantCode,
        spec: specOf(l), qty: Number(l.qty) || 0,
        deliveryQty: l.qty, remarks: '', location: l.location || '',
      })),
    });
    setView('garden_new_dn');
  };

  const updateDnField = (k: keyof Omit<DNForm, 'lines' | 'gpNo'>, v: string) =>
    setDnForm(f => f ? { ...f, [k]: v } : f);

  const updateDnLine = (slNo: number, k: keyof DNFormLine, v: string) =>
    setDnForm(f => f ? {
      ...f, lines: f.lines.map(l => l.slNo === slNo ? { ...l, [k]: v } : l),
    } : f);

  const saveDn = async (startScanning: boolean) => {
    if (!dnForm) return;
    if (!dnForm.vhNumber.trim()) { setToast('Vehicle number is required'); return; }
    try {
      const dn = await getStore().createDeliveryNote({
        ...dnForm,
        lines: dnForm.lines.map(l => ({ slNo: l.slNo, deliveryQty: Number(l.deliveryQty) || 0, remarks: l.remarks, location: l.location })),
      });
      await reload();
      setDnForm(null);
      if (startScanning) {
        setScanDnNo(dn.no);
        setScanLineSlNo(dn.lines[0]?.slNo ?? 1);
        setScanInput(''); setScanFeedback(null);
        setToast('Delivery note saved');
        setView('garden_scan');
      } else {
        setActiveDnNo(dn.no);
        setToast('DO submitted');
        setView('garden_view_dn');
      }
    } catch (e) { setToast((e as Error).message); }
  };

  // ── Customer form handlers ──
  const openNewCustomer = () => {
    setEditingCustomerId(null);
    setCustomerForm(emptyCustomerForm());
    setView('admin_new_customer');
  };

  const openEditCustomer = (c: Customer) => {
    setEditingCustomerId(c.id);
    setCustomerForm({
      customerName: c.customerName,
      party: c.party,
      projects: c.projects.length ? c.projects.map((p, i) => ({ idx: i, value: p })) : [{ idx: 0, value: '' }],
    });
    setView('admin_new_customer');
  };

  const updateCustomerName = (v: string) =>
    setCustomerForm(f => ({ ...f, customerName: v }));

  const updateCustomerParty = (v: 'EXT' | 'INT') =>
    setCustomerForm(f => ({ ...f, party: v }));

  const updateCustomerProject = (idx: number, v: string) =>
    setCustomerForm(f => ({ ...f, projects: f.projects.map(p => p.idx === idx ? { ...p, value: v } : p) }));

  const addCustomerProject = () =>
    setCustomerForm(f => ({ ...f, projects: [...f.projects, { idx: f.projects.length, value: '' }] }));

  const removeCustomerProject = (idx: number) =>
    setCustomerForm(f => ({ ...f, projects: f.projects.filter(p => p.idx !== idx) }));

  const saveCustomer = async () => {
    if (!customerForm.customerName.trim()) { setToast('Customer name is required'); return; }
    const validProjects = Array.from(new Set(customerForm.projects.map(p => p.value.trim()).filter(Boolean)));
    if (!validProjects.length) { setToast('At least one project is required'); return; }
    try {
      if (editingCustomerId) {
        await getStore().updateCustomer(editingCustomerId, { customerName: customerForm.customerName, party: customerForm.party, projects: validProjects });
        setToast('Customer updated');
      } else {
        await getStore().createCustomer({ customerName: customerForm.customerName, party: customerForm.party, projects: validProjects });
        setToast('Customer saved');
      }
      await reload();
      setEditingCustomerId(null);
      setView('admin_customers');
    } catch (e) { setToast((e as Error).message); }
  };

  // ── Plant Master form handlers ──
  const openNewPlant = () => {
    setPlantForm(emptyPlantForm());
    setView('admin_new_plant');
  };

  const updatePlantField = (k: keyof PlantForm, v: string) =>
    setPlantForm(f => ({ ...f, [k]: v }));

  const savePlant = async () => {
    if (!plantForm.category.trim()) { setToast('Category is required'); return; }
    if (!plantForm.plantName.trim()) { setToast('Plant name is required'); return; }
    try {
      await getStore().createPlantMaster(plantForm);
      await reload();
      setToast('Plant saved');
      setView('admin_plants');
    } catch (e) { setToast((e as Error).message); }
  };

  const plantFileRef = useRef<HTMLInputElement | null>(null);

  const handlePlantExcelUpload = async (file: File) => {
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const firstSheetName = wb.SheetNames[0];
      if (!firstSheetName) { setToast('The Excel file has no sheets'); return; }
      const sheet = wb.Sheets[firstSheetName];
      if (!sheet) { setToast('The Excel file has no sheets'); return; }
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });

      const findKey = (row: Record<string, unknown>, pattern: RegExp) =>
        Object.keys(row).find(k => pattern.test(k.trim()));

      const parsed: Array<{ category: string; plantName: string }> = [];
      for (const row of rows) {
        const catKey = findKey(row, /^category$/i);
        const nameKey = findKey(row, /^plant\s*name$/i);
        const category = catKey ? String(row[catKey]).trim() : '';
        const plantName = nameKey ? String(row[nameKey]).trim() : '';
        if (category && plantName) parsed.push({ category, plantName });
      }

      if (!parsed.length) {
        setToast('No valid rows found — expected "Category" and "Plant Name" columns');
        return;
      }
      await getStore().createPlantsBulk(parsed);
      await reload();
      setToast(`Imported ${parsed.length} plant${parsed.length === 1 ? '' : 's'}`);
    } catch {
      setToast('Could not read the Excel file');
    }
  };

  // ── Location Master form handlers ──
  const openNewLocation = () => {
    setLocationForm(emptyLocationForm());
    setView('admin_new_location');
  };

  const updateLocationField = (k: keyof LocationForm, v: string) =>
    setLocationForm(f => ({ ...f, [k]: v }));

  const saveLocation = async () => {
    if (!locationForm.name.trim()) { setToast('Location name is required'); return; }
    try {
      await getStore().createLocation(locationForm);
      await reload();
      setToast('Location saved');
      setView('admin_locations');
    } catch (e) { setToast((e as Error).message); }
  };

  // ── LPO / SO Mapping form handlers ──
  const openNewLpoSo = () => {
    setLpoSoForm(emptyLpoSoForm());
    setView('admin_new_lposo');
  };

  const updateLpoSoField = (k: keyof LpoSoForm, v: string) =>
    setLpoSoForm(f => ({ ...f, [k]: v }));

  const saveLpoSo = async () => {
    if (!lpoSoForm.customerName.trim()) { setToast('Customer name is required'); return; }
    try {
      await getStore().createLpoSoMapping(lpoSoForm);
      await reload();
      setToast('LPO / SO mapping saved');
      setView('admin_lposo');
    } catch (e) { setToast((e as Error).message); }
  };

  // ── Reprint form handlers ──
  const openNewReprint = () => {
    setReprintScanValue('');
    setReprintMatch(null);
    setReprintNotFound(false);
    setView('admin_new_reprint');
  };

  const handleReprintScan = (value: string) => {
    setReprintScanValue(value);
    setReprintNotFound(false);
    setReprintMatch(null);
  };

  const submitReprintScan = () => {
    const code = extractScanCode(reprintScanValue);
    if (!code) return;
    if (code !== reprintScanValue) setReprintScanValue(code);
    const dn = dns.find(d => d.no.toLowerCase() === code.toLowerCase());
    if (dn) {
      setReprintMatch({ type: 'dn', no: dn.no, customerProject: dn.customerProject, date: dn.date, status: dn.status });
      setReprintNotFound(false);
      return;
    }
    const gp = gps.find(g => g.no.toLowerCase() === code.toLowerCase());
    if (gp) {
      setReprintMatch({ type: 'gp', no: gp.no, customerProject: gp.customerName, date: gp.doDate, status: gp.dnNo ? 'completed' : 'pending' });
      setReprintNotFound(false);
      return;
    }
    setReprintMatch(null);
    setReprintNotFound(true);
  };

  const confirmReprint = async () => {
    if (!reprintMatch) return;
    try {
      await getStore().createReprintLog({ docType: reprintMatch.type, docNo: reprintMatch.no, customerProject: reprintMatch.customerProject });
      await reload();
      if (reprintMatch.type === 'dn') {
        setActiveDnNo(reprintMatch.no);
        setView('admin_view_dn');
      } else {
        setActiveGpNo(reprintMatch.no);
        setView('admin_view_gp');
      }
    } catch (e) { setToast((e as Error).message); }
  };

  // ── Tag Print form handlers (standalone — not tied to a Gate Pass or Delivery Note) ──
  const openNewTag = () => {
    setTagForm({ srlNo: '', plantCode: '', plantName: '', size: '', location: '', warehouse: '' });
    setTagError(null);
    setView('admin_new_tag');
  };

  const updateTagField = (k: keyof typeof tagForm, v: string) => {
    setTagForm(f => ({ ...f, [k]: v }));
    setTagError(null);
  };

  // Scanning the SRL# looks it up against Onhand (matching Style or Item Number)
  // and auto-fills Plant Name / Plant Code / Size / Location / Warehouse from that record.
  const handleTagSrlScan = (raw: string) => {
    const srlNo = extractScanCode(raw);
    const match = onhandItems.find(o => o.style === srlNo || o.itemNumber === srlNo);
    setTagForm(f => ({
      ...f,
      srlNo,
      plantName: match ? match.itemName : f.plantName,
      plantCode: match ? match.itemNumber : f.plantCode,
      size: match ? match.size : f.size,
      location: match ? match.location : f.location,
      warehouse: match ? match.warehouse : f.warehouse,
    }));
    setTagError(null);
  };

  const saveAndPrintTag = async () => {
    if (!tagForm.srlNo.trim()) { setTagError('Scan or enter an SRL# first'); return; }
    if (!tagForm.plantName.trim()) { setTagError('Plant Name is required'); return; }
    try {
      await getStore().createPlantTag(tagForm);
      await reload();
      setTimeout(() => window.print(), 80);
    } catch (e) { setTagError((e as Error).message); }
  };

  // ── Onhand inventory handlers (standalone reference table, bulk-imported from an ERP export) ──
  const onhandFileRef = useRef<HTMLInputElement | null>(null);

  const handleOnhandExcelUpload = async (file: File) => {
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const firstSheetName = wb.SheetNames[0];
      if (!firstSheetName) { setToast('The Excel file has no sheets'); return; }
      const sheet = wb.Sheets[firstSheetName];
      if (!sheet) { setToast('The Excel file has no sheets'); return; }
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });

      const findKey = (row: Record<string, unknown>, pattern: RegExp) =>
        Object.keys(row).find(k => pattern.test(k.trim()));
      const str = (row: Record<string, unknown>, key: string | undefined) => key ? String(row[key]).trim() : '';
      const num = (row: Record<string, unknown>, key: string | undefined) => {
        if (!key) return 0;
        const n = Number(String(row[key]).replace(/,/g, '').trim());
        return Number.isFinite(n) ? n : 0;
      };

      const parsed: Array<Omit<OnhandItem, 'id'>> = [];
      for (const row of rows) {
        const styleKey = findKey(row, /^style$/i);
        const itemNumberKey = findKey(row, /^item\s*number$/i);
        const itemNameKey = findKey(row, /^item\s*name$/i);
        const searchNameKey = findKey(row, /^search\s*name$/i);
        const sizeKey = findKey(row, /^size$/i);
        const colorKey = findKey(row, /^color$/i);
        const siteKey = findKey(row, /^site$/i);
        const warehouseKey = findKey(row, /^warehouse$/i);
        const locationKey = findKey(row, /^location$/i);
        const physicalKey = findKey(row, /^physical\s*inventory$/i);
        const rateKey = findKey(row, /^unit\s*rate$/i);
        const itemNumber = str(row, itemNumberKey);
        const itemName = str(row, itemNameKey);
        if (!itemNumber && !itemName) continue;
        parsed.push({
          style: str(row, styleKey), itemNumber, itemName, searchName: str(row, searchNameKey),
          size: str(row, sizeKey), color: str(row, colorKey), site: str(row, siteKey),
          warehouse: str(row, warehouseKey), location: str(row, locationKey),
          physicalInventory: num(row, physicalKey), unitRate: num(row, rateKey),
        });
      }

      if (!parsed.length) {
        setToast('No valid rows found — expected "Item Number" / "Item Name" columns');
        return;
      }
      await getStore().replaceOnhandItems(parsed);
      await reload();
      setToast(`Imported ${parsed.length} onhand item${parsed.length === 1 ? '' : 's'} (replaced previous data)`);
    } catch {
      setToast('Could not read the Excel file');
    }
  };

  const openNewOnhand = () => {
    setOnhandForm({ style: '', itemNumber: '', itemName: '', searchName: '', size: '', color: '', site: '', warehouse: '', location: '', physicalInventory: '', unitRate: '' });
    setView('admin_new_onhand');
  };

  const updateOnhandField = (k: keyof typeof onhandForm, v: string) =>
    setOnhandForm(f => ({ ...f, [k]: v }));

  const saveOnhandItem = async () => {
    if (!onhandForm.itemNumber.trim() && !onhandForm.itemName.trim()) { setToast('Item Number or Item Name is required'); return; }
    try {
      await getStore().createOnhandItem({
        ...onhandForm,
        physicalInventory: Number(onhandForm.physicalInventory) || 0,
        unitRate: Number(onhandForm.unitRate) || 0,
      });
      await reload();
      setToast('Onhand item saved');
      setView('admin_onhand');
    } catch (e) { setToast((e as Error).message); }
  };

  const deleteOnhandItem = async (it: OnhandItem) => {
    if (!window.confirm(`Delete onhand item "${it.itemNumber || it.itemName}"? This cannot be undone.`)) return;
    try {
      await getStore().deleteOnhandItem(it.id);
      await reload();
      setToast('Onhand item deleted');
    } catch (e) { setToast((e as Error).message); }
  };

  const toggleOnhandSelected = (id: string) => {
    setOnhandSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleOnhandSelectAll = (ids: string[]) => {
    setOnhandSelected(prev => {
      const allSelected = ids.length > 0 && ids.every(id => prev.has(id));
      return allSelected ? new Set() : new Set(ids);
    });
  };

  const deleteSelectedOnhandItems = async () => {
    const count = onhandSelected.size;
    if (count === 0) return;
    if (!window.confirm(`Delete ${count} selected onhand item${count === 1 ? '' : 's'}? This cannot be undone.`)) return;
    try {
      await getStore().deleteOnhandItems(Array.from(onhandSelected));
      setOnhandSelected(new Set());
      await reload();
      setToast(`${count} onhand item${count === 1 ? '' : 's'} deleted`);
    } catch (e) { setToast((e as Error).message); }
  };

  // ── User Account form handlers ──
  const openNewUser = () => {
    setUserForm(emptyUserForm());
    setView('admin_new_user');
  };

  const updateUserField = (k: keyof Omit<UserForm, 'role'>, v: string) =>
    setUserForm(f => ({ ...f, [k]: v }));

  const updateUserRole = (v: 'admin' | 'garden') =>
    setUserForm(f => ({ ...f, role: v }));

  const saveUser = async () => {
    if (!userForm.username.trim()) { setToast('User name is required'); return; }
    if (!userForm.password.trim()) { setToast('Password is required'); return; }
    try {
      await getStore().createUserAccount(userForm);
      await reload();
      setToast('User account saved');
      setView('admin_users');
    } catch (e) { setToast((e as Error).message); }
  };

  const openResetPassword = (u: UserAccount) => {
    setResetPasswordUserId(u.id);
    setResetPasswordValue('');
    setView('admin_reset_password');
  };

  const saveResetPassword = async () => {
    if (!resetPasswordUserId) return;
    if (!resetPasswordValue.trim()) { setToast('New password is required'); return; }
    try {
      await getStore().resetPassword(resetPasswordUserId, resetPasswordValue);
      await reload();
      setResetPasswordUserId(null);
      setToast('Password reset');
      setView('admin_users');
    } catch (e) { setToast((e as Error).message); }
  };

  const deleteUser = async (u: UserAccount) => {
    if (!window.confirm(`Delete user account "${u.username}"? This cannot be undone.`)) return;
    try {
      await getStore().deleteUserAccount(u.id);
      await reload();
      setToast('User account deleted');
    } catch (e) { setToast((e as Error).message); }
  };

  // ── Number Sequence Settings form handlers ──
  useEffect(() => {
    if (view === 'admin_number_settings') {
      setNumberSettingsForm({
        gpPrefix: numberSettings.gpPrefix,
        gpNext: String(numberSettings.gpNext),
        dnPrefix: numberSettings.dnPrefix,
        dnNext: String(numberSettings.dnNext),
      });
    }
  }, [view, numberSettings]);

  const updateNumberSettingsField = (k: keyof typeof numberSettingsForm, v: string) =>
    setNumberSettingsForm(f => ({ ...f, [k]: v }));

  const saveNumberSettings = async () => {
    const gpNext = parseInt(numberSettingsForm.gpNext, 10);
    const dnNext = parseInt(numberSettingsForm.dnNext, 10);
    if (!numberSettingsForm.gpPrefix.trim() || !numberSettingsForm.dnPrefix.trim()) { setToast('Prefix is required for both sequences'); return; }
    if (!Number.isFinite(gpNext) || gpNext < 1 || !Number.isFinite(dnNext) || dnNext < 1) { setToast('Next number must be a positive number'); return; }
    try {
      await getStore().updateNumberSettings({ gpPrefix: numberSettingsForm.gpPrefix, gpNext, dnPrefix: numberSettingsForm.dnPrefix, dnNext });
      await reload();
      setToast('Number sequence updated');
    } catch (e) { setToast((e as Error).message); }
  };

  // ── Scan handlers ──
  const doScan = async (code: string) => {
    if (!code.trim() || !scanDnNo) return;
    try {
      await getStore().addSerial(scanDnNo, scanLineSlNo, code.trim());
      await reload();
      setScanFeedback({ msg: `✓  ${code.trim()} scanned`, ok: true });
      setTimeout(() => setScanFeedback(null), 2500);
      // auto-advance to next incomplete line
      const fresh = (await getStore().loadAll()).dns.find(d => d.no === scanDnNo);
      if (fresh) {
        const cur = fresh.lines.find(l => l.slNo === scanLineSlNo);
        if (cur && cur.serials.length >= cur.deliveryQty) {
          const next = fresh.lines.find(l => l.serials.length < l.deliveryQty);
          if (next) setScanLineSlNo(next.slNo);
        }
      }
    } catch (e) {
      setScanFeedback({ msg: (e as Error).message, ok: false });
      setTimeout(() => setScanFeedback(null), 3500);
    }
    setScanInput('');
    setTimeout(() => scanRef.current?.focus(), 50);
  };

  const removeSerial = async (dnNo: string, slNo: number, code: string) => {
    try {
      await getStore().removeSerial(dnNo, slNo, code);
      await reload();
    } catch (e) { setToast((e as Error).message); }
  };

  const completeDn = async () => {
    if (!scanDnNo) return;
    try {
      await getStore().completeDeliveryNote(scanDnNo);
      await reload();
      setActiveDnNo(scanDnNo);
      setScanDnNo(null);
      setView(auth?.role === 'admin' ? 'admin_view_dn' : 'garden_view_dn');
    } catch (e) { setToast((e as Error).message); }
  };

  const simulateScan = () => {
    const code = `AC-${Math.floor(800000 + Math.random() * 200000)}`;
    doScan(code);
  };

  // ── Render helpers ──
  const dnScanned = (dn: DeliveryNote) => dn.lines.reduce((a, l) => a + l.serials.length, 0);
  const dnTarget  = (dn: DeliveryNote) => dn.lines.reduce((a, l) => a + l.deliveryQty, 0);
  const matchedGpCustomer = customers.find(c => c.customerName === gpForm.customerName) || null;

  // ── Garden: Delivery Notes list search (one field-type dropdown + one query box) ──
  const uniqueSortedVals = (vals: string[]) => Array.from(new Set(vals.filter(Boolean))).sort();
  const gardenDnSearchFieldOptions: { value: typeof gardenDnSearchField; label: string }[] = [
    { value: 'customer', label: 'Customer Search' },
    { value: 'dnNo', label: 'Delivery Note Search' },
    { value: 'gpNo', label: 'Gate Pass Search' },
    { value: 'project', label: 'Project Search' },
    { value: 'status', label: 'Status Search' },
  ];
  const gardenDnValueFor = (d: DeliveryNote, field: typeof gardenDnSearchField): string => {
    if (field === 'customer') return d.customerProject;
    if (field === 'dnNo') return d.no;
    if (field === 'gpNo') return d.gpNo;
    if (field === 'project') return d.project;
    return chipLabel(d.status);
  };
  const gardenDnSearchOptions = uniqueSortedVals(dns.map(d => gardenDnValueFor(d, gardenDnSearchField)));

  const filteredGardenDns = dns.filter(d =>
    !gardenDnSearchQuery.trim() ||
    gardenDnValueFor(d, gardenDnSearchField).toLowerCase().includes(gardenDnSearchQuery.trim().toLowerCase())
  );

  // ── Report rows (Admin + Garden, combined Gate Pass + Delivery Note line items) ──
  const reportRows: ReportRow[] = dns.flatMap(dn => {
    const gp = gps.find(g => g.no === dn.gpNo);
    return dn.lines.map((line): ReportRow => {
      const plant = plants.find(p => p.plantName === line.plantName);
      return {
        key: `${dn.no}-${line.slNo}`,
        slNo: line.slNo,
        date: dn.date,
        gpNo: dn.gpNo,
        dnNo: dn.no,
        category: plant?.category || '',
        itemDescription: line.spec ? `${line.plantName} · ${line.spec}` : line.plantName,
        plantCode: line.plantCode,
        plantName: line.plantName,
        spec: line.spec,
        party: gp?.party || '',
        customerProject: dn.customerProject,
        project: gp?.project || '',
        lpoNo: gp?.lpoNo || '',
        prRef: gp?.prRef || '',
        soRef: gp?.soRef || '',
        doNo: line.doRef || '',
        deliveryQty: line.deliveryQty,
        postedQty: line.postedQty,
        remainingQty: line.remainingQty,
        location: line.location,
        remarks: line.remarks,
        status: lineStatus(line.postedQty, line.deliveryQty),
        serials: line.serials,
      };
    });
  });

  const uniqueSorted = (vals: string[]) => Array.from(new Set(vals.filter(Boolean))).sort();
  const reportGpNoOptions = uniqueSorted(reportRows.map(r => r.gpNo));
  const reportDnNoOptions = uniqueSorted(reportRows.map(r => r.dnNo));
  const reportCustomerProjectOptions = uniqueSorted(reportRows.map(r => r.customerProject));
  const reportProjectOptions = uniqueSorted(reportRows.map(r => r.project));
  const reportStatusOptions = uniqueSorted(reportRows.map(r => r.status));

  const filteredReportRows = reportRows.filter(r => {
    const rowIso = dmyToIso(r.date);
    return (
      (!reportFilterGpNo || r.gpNo.toLowerCase().includes(reportFilterGpNo.trim().toLowerCase())) &&
      (!reportFilterDnNo || r.dnNo.toLowerCase().includes(reportFilterDnNo.trim().toLowerCase())) &&
      (!reportFilterCustomerProject || r.customerProject.toLowerCase().includes(reportFilterCustomerProject.trim().toLowerCase())) &&
      (!reportFilterProject || r.project.toLowerCase().includes(reportFilterProject.trim().toLowerCase())) &&
      (!reportFilterFromDate || (!!rowIso && rowIso >= reportFilterFromDate)) &&
      (!reportFilterToDate || (!!rowIso && rowIso <= reportFilterToDate)) &&
      (!reportFilterStatus || r.status.toLowerCase() === reportFilterStatus.trim().toLowerCase())
    );
  });

  const exportReportToExcel = () => {
    const rows = filteredReportRows.map(r => ({
      'Date': r.date,
      'Gate Pass No.': r.gpNo,
      'Delivery Note No.': r.dnNo,
      'Category': r.category,
      'Item Description': r.itemDescription,
      'Party': r.party,
      'Customer & Project': r.customerProject,
      'Project': r.project,
      'PR Ref.': r.prRef,
      'LPO No.': r.lpoNo,
      'SO Reference': r.soRef,
      'DO Reference': r.doNo,
      'Delivery Qty': r.deliveryQty,
      'SYS Posted Qty': r.postedQty,
      'Remaining Qty': r.remainingQty,
      'Status': r.status,
      'Location': r.location,
      'Remarks': r.remarks,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Report');
    const filterActive = !!(reportFilterGpNo || reportFilterDnNo || reportFilterCustomerProject || reportFilterProject || reportFilterFromDate || reportFilterToDate || reportFilterStatus);
    XLSX.writeFile(wb, `Report-${filterActive ? 'Filtered' : 'Full'}-${today()}.xlsx`);
  };

  // One row per physically scanned barcode (not per line), across every
  // Delivery Note in the system — no filters, joined back to its DO Number /
  // Customer & Project / item. Triggered from a single one-click Settings action.
  const exportAllScanDataToExcel = () => {
    const rows: Record<string, unknown>[] = [];
    reportRows.forEach(r => {
      r.serials.forEach(serial => {
        rows.push({
          'DO Number': r.doNo,
          'Customer & Project': r.customerProject,
          'Project': r.project,
          'Plant Code': r.plantCode,
          'Plant Name': r.plantName,
          'Specification': r.spec,
          'Scanned Serial No.': serial,
          'Delivery Note No.': r.dnNo,
          'Gate Pass No.': r.gpNo,
          'Date': r.date,
          'Location': r.location,
        });
      });
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Scan Data');
    XLSX.writeFile(wb, `DO-Scanner-Data-${today()}.xlsx`);
  };

  // ── Sidebar nav items ─────────────────────────────────────────────────────
  type NavDef = { label: string; view: ViewKey };
  const adminNav: NavDef[] = [
    { label: 'Dashboard',       view: 'admin_dashboard' },
    { label: 'Gate Passes',     view: 'admin_gps' },
    { label: 'Delivery Notes',  view: 'admin_dns' },
    { label: 'Customers',       view: 'admin_customers' },
    { label: 'Reprint',         view: 'admin_reprints' },
    { label: 'Tag Print',       view: 'admin_tags' },
    { label: 'Onhand',          view: 'admin_onhand' },
    { label: 'Settings',        view: 'admin_settings' },
    { label: 'Report',         view: 'report' },
  ];
  const settingsViews = new Set<ViewKey>([
    'admin_settings',
    'admin_plants', 'admin_new_plant',
    'admin_locations', 'admin_new_location',
    'admin_users', 'admin_new_user', 'admin_reset_password',
    'admin_number_settings',
    'admin_lposo', 'admin_new_lposo',
  ]);
  const gardenNav: NavDef[] = [
    { label: 'My Tasks',        view: 'garden_home' },
    { label: 'Delivery Notes',  view: 'garden_scanning' },
    { label: 'Report',          view: 'report' },
  ];
  const navItems = auth?.role === 'admin' ? adminNav : gardenNav;

  // ─────────────────────────────────────────────────────────────────────────
  // LOGIN: ROLE CHOOSER
  // ─────────────────────────────────────────────────────────────────────────
  if (view === 'login_roles') return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32, background: 'radial-gradient(120% 120% at 50% 0%, #1d6043 0%, #123c2b 55%, #0d2c20 100%)' }}>
      <div style={{ width: '100%', maxWidth: 760, textAlign: 'center', color: C.white }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, marginBottom: 8 }}>
          <div style={{ background: '#fff', borderRadius: 10, padding: 6, display: 'flex' }}>
            <Logo style={{ width: 56, height: 44 }} />
          </div>
          <div style={{ textAlign: 'left' }}>
            <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: '.01em', lineHeight: 1 }}>Acacia LLC</div>
            <div style={{ fontSize: 12, letterSpacing: '.34em', textTransform: 'uppercase', color: '#a9c9b6', marginTop: 5 }}>Nursery</div>
          </div>
        </div>
        <h1 style={{ fontFamily: 'var(--font-spectral), serif', fontWeight: 600, fontSize: 32, margin: '26px 0 6px' }}>Gate Pass System</h1>
        <p style={{ margin: '0 0 34px', color: '#bcd5c6', fontSize: 15 }}>Select your role to sign in</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, textAlign: 'left' }}>
          {[
            { role: 'admin' as const, label: 'Administrator', letter: 'A', desc: 'Create gate passes & review barcodes linked to delivery notes' },
            { role: 'garden' as const, label: 'Garden Incharge', letter: 'G', desc: 'Generate delivery notes & scan plant barcodes against gate passes' },
          ].map(r => (
            <RoleCard key={r.role} {...r} onChoose={() => { setLoginRole(r.role); setView('login_form'); }} />
          ))}
        </div>
      </div>
      <Toast msg={toast} />
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────────
  // LOGIN: SIGN-IN FORM
  // ─────────────────────────────────────────────────────────────────────────
  if (view === 'login_form') return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32, background: 'radial-gradient(120% 120% at 50% 0%, #1d6043 0%, #123c2b 55%, #0d2c20 100%)' }}>
      <div style={{ width: '100%', maxWidth: 400, background: C.white, borderRadius: 16, padding: 34, boxShadow: '0 30px 70px rgba(0,0,0,.32)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 24 }}>
          <Logo style={{ width: 40, height: 32, color: C.primary }} />
          <div style={{ fontWeight: 800, fontSize: 17 }}>Acacia LLC</div>
        </div>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: C.primary }}>
          {loginRole === 'admin' ? 'Administrator' : 'Garden Incharge'}
        </div>
        <h2 style={{ fontFamily: 'var(--font-spectral), serif', fontWeight: 600, fontSize: 24, margin: '4px 0 22px' }}>Sign in</h2>
        <FieldLabel>Username</FieldLabel>
        <Inp value={loginUser} onChange={setLoginUser} placeholder="username"
          style={{ marginBottom: 16 }}
          onKeyDown={e => e.key === 'Enter' && signIn()} />
        <FieldLabel>Password</FieldLabel>
        <Inp value={loginPass} onChange={setLoginPass} placeholder="password" type="password"
          style={{ marginBottom: 22 }}
          onKeyDown={e => e.key === 'Enter' && signIn()} />
        {loginErr && <div style={{ color: '#c33', fontSize: 13, marginBottom: 12, fontWeight: 600 }}>{loginErr}</div>}
        <Btn onClick={signIn} style={{ width: '100%', padding: 12, background: C.primary, color: C.white, border: 'none', borderRadius: 9, fontSize: 15, fontWeight: 700, cursor: 'pointer' }} hov={{ background: C.ph }}>
          Sign in
        </Btn>
        <button onClick={() => { setLoginRole(null); setLoginErr(''); setView('login_roles'); }}
          style={{ width: '100%', marginTop: 10, padding: 10, background: 'transparent', color: '#5b6660', border: 'none', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
          ← Choose a different role
        </button>
      </div>
      <Toast msg={toast} />
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────────
  // APP SHELL
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div data-app-bg style={{ minHeight: '100vh', background: C.bg, fontFamily: 'var(--font-hanken), system-ui, sans-serif', color: C.text }}>

      {/* Header */}
      <header data-print-hide className="gp-header" style={{ height: 62, background: C.header, color: C.white, display: 'flex', alignItems: 'center', padding: '0 22px', gap: 14, position: 'sticky', top: 0, zIndex: 20 }}>
        <div style={{ background: '#fff', borderRadius: 8, padding: 4, display: 'flex' }}>
          <Logo style={{ width: 34, height: 27 }} />
        </div>
        <div style={{ fontWeight: 800, fontSize: 16, letterSpacing: '.01em' }}>Acacia LLC</div>
        <div className="gp-header-subtitle" style={{ width: 1, height: 24, background: 'rgba(255,255,255,.18)', margin: '0 4px' }} />
        <div className="gp-header-subtitle" style={{ fontSize: 13, color: '#a9c9b6', fontWeight: 600 }}>Gate Pass System</div>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="gp-header-name" style={{ textAlign: 'right', lineHeight: 1.15 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700 }}>{auth?.name}</div>
            <div style={{ fontSize: 11, color: '#a9c9b6' }}>{auth?.role === 'admin' ? 'Administrator' : 'Garden Incharge'}</div>
          </div>
          <div style={{ width: 34, height: 34, borderRadius: '50%', background: C.gold, color: C.header, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 14 }}>
            {auth?.name?.[0] ?? '?'}
          </div>
          <Btn onClick={logout} style={{ marginLeft: 6, background: 'rgba(255,255,255,.1)', color: C.white, border: 'none', borderRadius: 8, padding: '8px 13px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }} hov={{ background: 'rgba(255,255,255,.2)' }}>
            Sign out
          </Btn>
        </div>
      </header>

      <div className="gp-shell-row" style={{ display: 'flex', alignItems: 'flex-start' }}>
        {/* Sidebar */}
        <nav data-print-hide className="gp-sidebar" style={{ width: 212, flexShrink: 0, background: C.white, borderRight: `1px solid ${C.border}`, minHeight: 'calc(100vh - 62px)', padding: '16px 12px', position: 'sticky', top: 62 }}>
          <div className="gp-sidebar-label" style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: '#9aa39d', padding: '6px 10px 10px' }}>Menu</div>
          <div className="gp-sidebar-list" style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {navItems.map(n => (
              <NavItem key={n.view} label={n.label} active={n.view === 'admin_settings' ? settingsViews.has(view) : view === n.view} onClick={() => setView(n.view)} />
            ))}
          </div>
        </nav>

        {/* Main content */}
        <main className="gp-main" style={{ flex: 1, minWidth: 0, padding: '26px 30px 60px' }}>

          {/* ── ADMIN: DASHBOARD ── */}
          {view === 'admin_dashboard' && (
            <div>
              <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 20 }}>
                <div>
                  <h1 style={{ fontFamily: 'var(--font-spectral),serif', fontWeight: 600, fontSize: 26, margin: 0 }}>Dashboard</h1>
                  <p style={{ margin: '4px 0 0', color: '#5b6660', fontSize: 14 }}>Overview of gate passes &amp; delivery notes</p>
                </div>
                <Btn onClick={openNewGp} style={{ background: C.primary, color: C.white, border: 'none', borderRadius: 9, padding: '11px 18px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }} hov={{ background: C.ph }}>
                  + New Gate Pass
                </Btn>
              </div>

              {/* Stats */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 26 }}>
                {[
                  { label: 'Gate Passes', value: gps.length, color: C.header },
                  { label: 'Awaiting Delivery Note', value: kPending, color: C.amber },
                  { label: 'Delivery Notes', value: dns.length, color: C.header },
                  { label: 'Open Status', value: kOpen, color: C.amber },
                ].map(s => (
                  <div key={s.label} style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: 17 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: C.muted }}>{s.label}</div>
                    <div style={{ fontSize: 30, fontWeight: 800, marginTop: 5, color: s.color }}>{s.value}</div>
                  </div>
                ))}
              </div>

              {/* Recent lists */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
                {/* Recent GPs */}
                <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
                  <div style={{ padding: '14px 16px', borderBottom: `1px solid ${C.borderL}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>Recent Gate Passes</div>
                    <button onClick={() => setView('admin_gps')} style={{ background: 'none', border: 'none', color: C.primary, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>View all →</button>
                  </div>
                  {gps.slice(0, 4).map(g => (
                    <GpRow key={g.no} gp={g} onOpen={() => { setActiveGpNo(g.no); setView('admin_view_gp'); }} />
                  ))}
                  {gps.length === 0 && <Empty text="No gate passes yet." />}
                </div>

                {/* Recent DNs */}
                <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
                  <div style={{ padding: '14px 16px', borderBottom: `1px solid ${C.borderL}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>Recent Delivery Notes</div>
                    <button onClick={() => setView('admin_dns')} style={{ background: 'none', border: 'none', color: C.primary, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>View all →</button>
                  </div>
                  {dns.slice(0, 4).map(d => (
                    <DnRow key={d.no} dn={d} onOpen={() => { setActiveDnNo(d.no); setView('admin_view_dn'); }} scanned={dnScanned(d)} target={dnTarget(d)} />
                  ))}
                  {dns.length === 0 && <Empty text="No delivery notes yet." />}
                </div>
              </div>
            </div>
          )}

          {/* ── ADMIN: GATE PASSES LIST ── */}
          {view === 'admin_gps' && (
            <div>
              <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 20 }}>
                <div>
                  <h1 style={{ fontFamily: 'var(--font-spectral),serif', fontWeight: 600, fontSize: 26, margin: 0 }}>Plants Gate Passes</h1>
                  <p style={{ margin: '4px 0 0', color: '#5b6660', fontSize: 14 }}>Step 1 — Admin creates a gate pass for the garden team</p>
                </div>
                <Btn onClick={openNewGp} style={{ background: C.primary, color: C.white, border: 'none', borderRadius: 9, padding: '11px 18px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }} hov={{ background: C.ph }}>
                  + New Gate Pass
                </Btn>
              </div>
              <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#f6f8f6' }}>
                      {['No', 'Customer', 'Date', 'Plants', 'Qty', 'Assigned', 'Status', 'Last Modified'].map((h) => (
                        <Th key={h} right={h === 'Qty'}>{h}</Th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {gps.map(g => (
                      <GpTableRow key={g.no} gp={g} onOpen={() => { setActiveGpNo(g.no); setView('admin_view_gp'); }} />
                    ))}
                  </tbody>
                </table>
                {gps.length === 0 && <Empty text="No gate passes yet." />}
              </div>
            </div>
          )}

          {/* ── ADMIN: NEW GATE PASS ── */}
          {view === 'admin_new_gp' && (
            <div>
              <button onClick={() => { setEditingGpNo(null); setGpForGardenDn(false); setView(gpForGardenDn ? 'garden_home' : 'admin_gps'); }} data-print-hide style={{ background: 'none', border: 'none', color: '#5b6660', fontWeight: 600, fontSize: 13.5, cursor: 'pointer', marginBottom: 12, fontFamily: 'inherit' }}>← Cancel</button>
              <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, maxWidth: 1040, overflow: 'hidden' }}>
                <div style={{ padding: '20px 24px', borderBottom: `1px solid ${C.borderL}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h1 style={{ fontFamily: 'var(--font-spectral),serif', fontWeight: 600, fontSize: 22, margin: 0 }}>{editingGpNo ? 'Edit Gate Pass' : gpForGardenDn ? 'New Delivery Note — Header Details' : 'New Plants Gate Pass'}</h1>
                    {gpForGardenDn && <p style={{ margin: '3px 0 0', color: C.muted, fontSize: 13 }}>Step 1 of 2 — this becomes the Gate Pass these details are stored under</p>}
                  </div>
                </div>
                <div style={{ padding: '22px 24px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 8 }}>
                    <div>
                      <FieldLabel>Customer Name *</FieldLabel>
                      <CustomerCombo
                        value={gpForm.customerName}
                        customers={customers}
                        onChangeText={updateGpCustomerName}
                        onSelect={selectGpCustomer}
                      />
                    </div>
                    <div>
                      <FieldLabel>Project</FieldLabel>
                      <ProjectCombo
                        value={gpForm.project}
                        options={matchedGpCustomer?.projects || []}
                        onChangeText={updateGpProject}
                        onSelect={updateGpProject}
                      />
                    </div>
                    <div>
                      <FieldLabel>Party</FieldLabel>
                      <div style={{
                        padding: '9px 11px', minHeight: 39, boxSizing: 'border-box',
                        border: '1px solid #eef1ee', borderRadius: 8, fontSize: 13.5,
                        background: '#f6f8f6', color: gpForm.party ? C.text : '#9aa39d',
                        display: 'flex', alignItems: 'center', fontWeight: gpForm.party ? 700 : 400,
                      }}>
                        {gpForm.party === 'EXT' ? 'External (EXT)' : gpForm.party === 'INT' ? 'Internal (INT)' : 'Select a customer above'}
                      </div>
                    </div>

                    {([
                      ['customerCode', 'Customer Code',   'e.g. PSE 20241022'],
                      ['doDate',       'DO Date',          ''],
                      ['doNo',         'DO No.',           'optional'],
                      ['lpoNo',        'LPO No.',          'optional'],
                      ['lpoDate',      'LPO Date',         'optional'],
                      ['prRef',        'PR Ref.',          'optional'],
                      ['soRef',        'SO Reference',     'optional'],
                    ] as [keyof Omit<GPForm, 'lines' | 'customerName' | 'project' | 'party' | 'assignedTo'>, string, string][]).map(([k, lbl, ph]) => (
                      <div key={k}>
                        <FieldLabel>{lbl}</FieldLabel>
                        <Inp value={gpForm[k]} onChange={v => updateGpField(k, v)} placeholder={ph} />
                      </div>
                    ))}
                    <div>
                      <FieldLabel>Assign User(s) *</FieldLabel>
                      <div style={{ border: '1px solid #d7ddd9', borderRadius: 8, padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 110, overflowY: 'auto', background: '#fbfcfb' }}>
                        {users.filter(u => u.role === 'garden').map(u => (
                          <label key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, cursor: 'pointer' }}>
                            <input type="checkbox" checked={gpForm.assignedTo.includes(u.username)} onChange={() => toggleGpAssignedUser(u.username)} />
                            {u.username}
                          </label>
                        ))}
                        {users.filter(u => u.role === 'garden').length === 0 && (
                          <span style={{ fontSize: 12.5, color: '#9aa39d' }}>No Garden users yet — add one under User Accounts.</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Plant rows */}
                  <div style={{ marginTop: 18, border: `1px solid #e7ebe7`, borderRadius: 10, overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead>
                        <tr style={{ background: '#f6f8f6' }}>
                          {['#', 'Plant Description', 'Pot (L)', 'Height M', 'Girth', 'Qty', 'Location', ''].map((h, i) => (
                            <th key={i} style={{ textAlign: 'left', fontSize: 10.5, textTransform: 'uppercase', color: C.muted, fontWeight: 700, padding: '9px 8px', width: i === 0 ? 38 : i === 1 ? 260 : i === 7 ? 40 : undefined }}>
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {gpForm.lines.map((ln, i) => (
                          <tr key={ln.idx} style={{ borderTop: `1px solid ${C.borderL}` }}>
                            <td style={{ padding: '5px 8px', color: '#9aa39d', fontWeight: 700 }}>{i + 1}</td>
                            <td style={{ padding: '5px 8px' }}>
                              <PlantNameCombo
                                value={ln.plantDesc}
                                plants={plants}
                                onChangeText={v => updateGpLine(ln.idx, 'plantDesc', v)}
                                onSelect={p => updateGpLine(ln.idx, 'plantDesc', p.plantName)}
                              />
                            </td>
                            <td style={{ padding: '5px 8px' }}><TInp value={ln.potSize}   onChange={v => updateGpLine(ln.idx, 'potSize',   v)} /></td>
                            <td style={{ padding: '5px 8px' }}><TInp value={ln.height}    onChange={v => updateGpLine(ln.idx, 'height',    v)} placeholder="30-40" /></td>
                            <td style={{ padding: '5px 8px' }}><TInp value={ln.girth}     onChange={v => updateGpLine(ln.idx, 'girth',     v)} /></td>
                            <td style={{ padding: '5px 8px' }}><TInp value={ln.qty}       onChange={v => updateGpLine(ln.idx, 'qty',       v)} placeholder="0" /></td>
                            <td style={{ padding: '5px 8px' }}>
                              <LocationCombo
                                value={ln.location}
                                locations={locations}
                                onChangeText={v => updateGpLine(ln.idx, 'location', v)}
                                onSelect={l => updateGpLine(ln.idx, 'location', l.name)}
                              />
                            </td>
                            <td style={{ padding: '5px 8px', textAlign: 'center' }}>
                              <button onClick={() => removeGpLine(ln.idx)} style={{ background: 'none', border: 'none', color: '#c46', fontSize: 17, cursor: 'pointer', lineHeight: 1, fontFamily: 'inherit' }}>×</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <button onClick={addGpLine} style={{ width: '100%', padding: 10, background: '#f6f8f6', border: 'none', borderTop: `1px solid ${C.borderL}`, color: C.primary, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
                      + Add plant row
                    </button>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
                    <Btn onClick={() => { setEditingGpNo(null); setGpForGardenDn(false); setView(gpForGardenDn ? 'garden_home' : 'admin_gps'); }} style={{ background: C.white, border: `1px solid #cfd8d2`, color: '#46514a', borderRadius: 9, padding: '11px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                      Cancel
                    </Btn>
                    <Btn onClick={saveGp} style={{ background: C.primary, color: C.white, border: 'none', borderRadius: 9, padding: '11px 22px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }} hov={{ background: C.ph }}>
                      {editingGpNo ? 'Save Changes' : gpForGardenDn ? 'Continue →' : 'Save Gate Pass'}
                    </Btn>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── ADMIN: VIEW GATE PASS ── */}
          {view === 'admin_view_gp' && activeGp && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <button data-print-hide onClick={() => setView('admin_gps')} style={{ background: 'none', border: 'none', color: '#5b6660', fontWeight: 600, fontSize: 13.5, cursor: 'pointer', fontFamily: 'inherit' }}>← Back</button>
                <div style={{ display: 'flex', gap: 10 }} data-print-hide>
                  {!activeGp.dnNo && (
                    <Btn onClick={() => openEditGp(activeGp)} style={{ background: C.white, border: `1px solid #cfd8d2`, color: '#46514a', borderRadius: 9, padding: '10px 18px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                      Edit
                    </Btn>
                  )}
                  <div style={{ position: 'relative' }}>
                    <Btn onClick={() => gpShare.setShareMenuOpen(o => !o)} disabled={gpShare.sharing} style={{ background: '#fff', border: `1px solid ${C.primary}`, color: C.primary, borderRadius: 9, padding: '10px 18px', fontSize: 14, fontWeight: 700, cursor: gpShare.sharing ? 'default' : 'pointer', opacity: gpShare.sharing ? 0.6 : 1 }}>
                      {gpShare.sharing ? 'Preparing…' : 'Share ▾'}
                    </Btn>
                    {gpShare.shareMenuOpen && (
                      <>
                        <div onClick={() => gpShare.setShareMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
                        <div style={{ position: 'absolute', top: '110%', right: 0, background: C.white, border: '1px solid #d7ddd9', borderRadius: 10, boxShadow: '0 10px 26px rgba(0,0,0,.12)', minWidth: 190, zIndex: 50, overflow: 'hidden' }}>
                          <button
                            onClick={() => gpShare.handleSharePdf(`GatePass-${activeGp.no}.pdf`, `Gate Pass ${activeGp.no}`, `Gate Pass ${activeGp.no} — ${activeGp.customerName}`)}
                            style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px', border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13.5, color: C.text }}
                          >
                            Share as PDF
                          </button>
                          <button
                            onClick={() => gpShare.handleShareWhatsApp(`GatePass-${activeGp.no}.pdf`, `Gate Pass ${activeGp.no}`, `Gate Pass ${activeGp.no} — ${activeGp.customerName}`, `Gate Pass ${activeGp.no} — PDF downloaded, attach it here.`)}
                            style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px', border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13.5, color: C.text }}
                          >
                            WhatsApp
                          </button>
                          <button
                            onClick={() => { gpShare.setShareMenuOpen(false); window.print(); }}
                            style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px', border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13.5, color: C.text }}
                          >
                            Send to Printer
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                  {!activeGp.dnNo && (
                    <Btn onClick={() => openNewDn(activeGp)} style={{ background: C.primary, color: C.white, border: 'none', borderRadius: 9, padding: '10px 18px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }} hov={{ background: C.ph }}>
                      Generate Delivery Note →
                    </Btn>
                  )}
                  {activeGp.dnNo && (
                    <Btn onClick={() => { setActiveDnNo(activeGp.dnNo!); setView('admin_view_dn'); }} style={{ background: C.white, border: `1px solid #cfd8d2`, color: C.primary, borderRadius: 9, padding: '10px 18px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                      View Delivery Note {activeGp.dnNo} →
                    </Btn>
                  )}
                </div>
              </div>
              <PrintableGP gp={activeGp} printRef={gpPrintRef} />
            </div>
          )}

          {/* ── ADMIN: DELIVERY NOTES LIST ── */}
          {view === 'admin_dns' && (
            <div>
              <div style={{ marginBottom: 20 }}>
                <h1 style={{ fontFamily: 'var(--font-spectral),serif', fontWeight: 600, fontSize: 26, margin: 0 }}>Delivery Notes</h1>
                <p style={{ margin: '4px 0 0', color: '#5b6660', fontSize: 14 }}>Step 4 — Review delivery notes and the barcodes linked to each</p>
              </div>
              <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#f6f8f6' }}>
                      {['No', 'Gate Pass No.', 'Customer / Project', 'Location', 'Date', 'Barcodes', 'Status', 'Last Modified'].map(h => <Th key={h}>{h}</Th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {dns.map(d => (
                      <DnTableRow key={d.no} dn={d} scanned={dnScanned(d)} target={dnTarget(d)} onOpen={() => { setActiveDnNo(d.no); setView('admin_view_dn'); }} />
                    ))}
                  </tbody>
                </table>
                {dns.length === 0 && <Empty text="No delivery notes generated yet." />}
              </div>
            </div>
          )}

          {/* ── ADMIN: VIEW DELIVERY NOTE ── */}
          {(view === 'admin_view_dn' || view === 'garden_view_dn') && activeDn && (
            <ViewDeliveryNote
              dn={activeDn} gp={gps.find(g => g.no === activeDn.gpNo) || null} role={auth?.role || 'admin'}
              scanned={dnScanned(activeDn)} target={dnTarget(activeDn)}
              onBack={() => setView(auth?.role === 'admin' ? 'admin_dns' : 'garden_scanning')}
              onContinueScan={() => {
                setScanDnNo(activeDn.no);
                const inc = activeDn.lines.find(l => l.serials.length < l.deliveryQty);
                setScanLineSlNo(inc?.slNo ?? activeDn.lines[0]?.slNo ?? 1);
                setScanInput(''); setScanFeedback(null);
                setView('garden_scan');
              }}
              onRemoveSerial={async (slNo, code) => {
                await removeSerial(activeDn.no, slNo, code);
                await reload();
                const fresh = (await getStore().loadAll()).dns.find(d => d.no === activeDn.no);
                if (fresh) setActiveDnNo(fresh.no);
              }}
              onPrint={() => window.print()}
              onSaveHeader={async (dnNo, form) => {
                try {
                  await getStore().updateDeliveryNoteHeader(dnNo, form);
                  await reload();
                } catch (e) { setToast((e as Error).message); }
              }}
              onSaveLine={async (dnNo, slNo, form) => {
                try {
                  await getStore().updateDeliveryNoteLine(dnNo, slNo, form);
                  await reload();
                } catch (e) { setToast((e as Error).message); }
              }}
              onSaveDoRef={async (dnNo, slNo, doRef) => {
                try {
                  await getStore().updateDeliveryNoteLineDoRef(dnNo, slNo, doRef);
                  await reload();
                } catch (e) { setToast((e as Error).message); }
              }}
              onSaveGpRefs={async (gpNo, form) => {
                try {
                  await getStore().updateGatePassHeaderRefs(gpNo, form);
                  await reload();
                } catch (e) { setToast((e as Error).message); }
              }}
              onRemoveLine={async (dnNo, slNo) => {
                try {
                  await getStore().removeDeliveryNoteLine(dnNo, slNo);
                  await reload();
                } catch (e) { setToast((e as Error).message); }
              }}
              onAddAttachment={async (dnNo, file) => {
                try {
                  await getStore().addDeliveryNoteAttachment(dnNo, file);
                  await reload();
                } catch (e) { setToast((e as Error).message); }
              }}
              onRemoveAttachment={async (dnNo, attachmentId) => {
                try {
                  await getStore().removeDeliveryNoteAttachment(dnNo, attachmentId);
                  await reload();
                } catch (e) { setToast((e as Error).message); }
              }}
            />
          )}

          {/* ── ADMIN: CUSTOMERS LIST ── */}
          {view === 'admin_customers' && (
            <div>
              <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 20 }}>
                <div>
                  <h1 style={{ fontFamily: 'var(--font-spectral),serif', fontWeight: 600, fontSize: 26, margin: 0 }}>Customers</h1>
                  <p style={{ margin: '4px 0 0', color: '#5b6660', fontSize: 14 }}>Customer &amp; project reference list</p>
                </div>
                <Btn onClick={openNewCustomer} style={{ background: C.primary, color: C.white, border: 'none', borderRadius: 9, padding: '11px 18px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }} hov={{ background: C.ph }}>
                  + New Customer
                </Btn>
              </div>
              <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#f6f8f6' }}>
                      {['Customer Name', 'Project', 'Party', 'Created By', 'Date', 'Last Modified'].map(h => <Th key={h}>{h}</Th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {customers.map(c => (
                      <CustomerTableRow key={c.id} c={c} onOpen={() => openEditCustomer(c)} />
                    ))}
                  </tbody>
                </table>
                {customers.length === 0 && <Empty text="No customers yet." />}
              </div>
            </div>
          )}

          {/* ── ADMIN: NEW CUSTOMER ── */}
          {view === 'admin_new_customer' && (
            <div>
              <button onClick={() => { setEditingCustomerId(null); setView('admin_customers'); }} style={{ background: 'none', border: 'none', color: '#5b6660', fontWeight: 600, fontSize: 13.5, cursor: 'pointer', marginBottom: 12, fontFamily: 'inherit' }}>← Cancel</button>
              <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, maxWidth: 560, overflow: 'hidden' }}>
                <div style={{ padding: '20px 24px', borderBottom: `1px solid ${C.borderL}` }}>
                  <h1 style={{ fontFamily: 'var(--font-spectral),serif', fontWeight: 600, fontSize: 22, margin: 0 }}>{editingCustomerId ? 'Edit Customer' : 'New Customer'}</h1>
                </div>
                <div style={{ padding: '22px 24px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <div>
                      <FieldLabel>Customer Name *</FieldLabel>
                      <Inp value={customerForm.customerName} onChange={updateCustomerName} placeholder="e.g. RYM - Project" />
                    </div>
                    <div>
                      <FieldLabel>Party</FieldLabel>
                      <Select
                        value={customerForm.party}
                        onChange={v => updateCustomerParty(v as 'EXT' | 'INT')}
                        options={[{ value: 'EXT', label: 'External (EXT)' }, { value: 'INT', label: 'Internal (INT)' }]}
                      />
                    </div>
                  </div>

                  {/* Projects */}
                  <div style={{ marginTop: 18 }}>
                    <FieldLabel>Projects *</FieldLabel>
                    <div style={{ border: `1px solid #e7ebe7`, borderRadius: 10, overflow: 'hidden' }}>
                      {customerForm.projects.map((p, i) => (
                        <div key={p.idx} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderTop: i === 0 ? 'none' : `1px solid ${C.borderL}` }}>
                          <div style={{ flex: 1 }}>
                            <TInp value={p.value} onChange={v => updateCustomerProject(p.idx, v)} placeholder={`Project ${i + 1}`} />
                          </div>
                          <button onClick={() => removeCustomerProject(p.idx)} style={{ background: 'none', border: 'none', color: '#c46', fontSize: 17, cursor: 'pointer', lineHeight: 1, fontFamily: 'inherit', padding: '0 4px' }}>×</button>
                        </div>
                      ))}
                      <button onClick={addCustomerProject} style={{ width: '100%', padding: 10, background: '#f6f8f6', border: 'none', borderTop: `1px solid ${C.borderL}`, color: C.primary, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
                        + Add project
                      </button>
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
                    <Btn onClick={() => { setEditingCustomerId(null); setView('admin_customers'); }} style={{ background: C.white, border: `1px solid #cfd8d2`, color: '#46514a', borderRadius: 9, padding: '11px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                      Cancel
                    </Btn>
                    <Btn onClick={saveCustomer} style={{ background: C.primary, color: C.white, border: 'none', borderRadius: 9, padding: '11px 22px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }} hov={{ background: C.ph }}>
                      {editingCustomerId ? 'Save Changes' : 'Save Customer'}
                    </Btn>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── ADMIN: SETTINGS HUB ── */}
          {view === 'admin_settings' && (
            <div>
              <div style={{ marginBottom: 20 }}>
                <h1 style={{ fontFamily: 'var(--font-spectral),serif', fontWeight: 600, fontSize: 26, margin: 0 }}>Settings</h1>
                <p style={{ margin: '4px 0 0', color: '#5b6660', fontSize: 14 }}>Reference data, user accounts &amp; document numbering</p>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14, maxWidth: 720 }}>
                <SettingsCard
                  label="Plant Master"
                  description={`${plants.length} plant${plants.length === 1 ? '' : 's'} in the reference list`}
                  onClick={() => setView('admin_plants')}
                />
                <SettingsCard
                  label="Location Master"
                  description={`${locations.length} location${locations.length === 1 ? '' : 's'} in the reference list`}
                  onClick={() => setView('admin_locations')}
                />
                <SettingsCard
                  label="User Accounts"
                  description={`${users.length} login account${users.length === 1 ? '' : 's'}`}
                  onClick={() => setView('admin_users')}
                />
                <SettingsCard
                  label="Number Sequence"
                  description="Control Gate Pass & Delivery Note numbering"
                  onClick={() => setView('admin_number_settings')}
                />
                <SettingsCard
                  label="LPO / SO Mapping"
                  description={`${lpoSoMappings.length} mapping${lpoSoMappings.length === 1 ? '' : 's'} on file`}
                  onClick={() => setView('admin_lposo')}
                />
                <SettingsCard
                  label="DO Scanner Data"
                  description="One-click Excel export of every scanned barcode, all Delivery Notes"
                  onClick={exportAllScanDataToExcel}
                />
              </div>
            </div>
          )}

          {/* ── ADMIN: PLANT MASTER LIST ── */}
          {view === 'admin_plants' && (
            <div>
              <button onClick={() => setView('admin_settings')} style={{ background: 'none', border: 'none', color: '#5b6660', fontWeight: 600, fontSize: 13.5, cursor: 'pointer', marginBottom: 12, fontFamily: 'inherit' }}>← Back to Settings</button>
              <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 20 }}>
                <div>
                  <h1 style={{ fontFamily: 'var(--font-spectral),serif', fontWeight: 600, fontSize: 26, margin: 0 }}>Plant Master</h1>
                  <p style={{ margin: '4px 0 0', color: '#5b6660', fontSize: 14 }}>Plant name &amp; category reference list</p>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <Btn onClick={() => plantFileRef.current?.click()} style={{ background: C.white, border: `1px solid #cfd8d2`, color: '#46514a', borderRadius: 9, padding: '11px 18px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                    ⇪ Upload Excel
                  </Btn>
                  <input
                    ref={plantFileRef}
                    type="file"
                    accept=".xlsx,.xls"
                    style={{ display: 'none' }}
                    onChange={e => {
                      const file = e.target.files?.[0];
                      if (file) handlePlantExcelUpload(file);
                      e.target.value = '';
                    }}
                  />
                  <Btn onClick={openNewPlant} style={{ background: C.primary, color: C.white, border: 'none', borderRadius: 9, padding: '11px 18px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }} hov={{ background: C.ph }}>
                    + New Plant
                  </Btn>
                </div>
              </div>
              <p style={{ margin: '-12px 0 16px', fontSize: 12.5, color: '#9aa39d' }}>
                Excel file must have &quot;Category&quot; and &quot;Plant Name&quot; columns.
              </p>
              <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#f6f8f6' }}>
                      {['Category', 'Plant Name', 'Created By', 'Date', 'Last Modified'].map(h => <Th key={h}>{h}</Th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {plants.map(p => (
                      <tr key={p.id} style={{ borderTop: `1px solid #eef1ee` }}>
                        <td style={{ padding: '13px 16px', fontSize: 13.5, color: '#46514a' }}>{p.category}</td>
                        <td style={{ padding: '13px 16px', fontWeight: 600, fontSize: 14 }}>{p.plantName}</td>
                        <td style={{ padding: '13px 16px', fontSize: 13.5, color: '#46514a' }}>{p.createdBy}</td>
                        <td style={{ padding: '13px 16px', fontSize: 13.5, color: '#46514a' }}>{p.createdAt}</td>
                        <td style={{ padding: '13px 16px' }}><LastModified by={p.modifiedBy} at={p.modifiedAt} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {plants.length === 0 && <Empty text="No plants yet." />}
              </div>
            </div>
          )}

          {/* ── ADMIN: NEW PLANT ── */}
          {view === 'admin_new_plant' && (
            <div>
              <button onClick={() => setView('admin_plants')} style={{ background: 'none', border: 'none', color: '#5b6660', fontWeight: 600, fontSize: 13.5, cursor: 'pointer', marginBottom: 12, fontFamily: 'inherit' }}>← Cancel</button>
              <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, maxWidth: 560, overflow: 'hidden' }}>
                <div style={{ padding: '20px 24px', borderBottom: `1px solid ${C.borderL}` }}>
                  <h1 style={{ fontFamily: 'var(--font-spectral),serif', fontWeight: 600, fontSize: 22, margin: 0 }}>New Plant</h1>
                </div>
                <div style={{ padding: '22px 24px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <div>
                      <FieldLabel>Category *</FieldLabel>
                      <Inp value={plantForm.category} onChange={v => updatePlantField('category', v)} placeholder="e.g. Shrub" />
                    </div>
                    <div>
                      <FieldLabel>Plant Name *</FieldLabel>
                      <Inp value={plantForm.plantName} onChange={v => updatePlantField('plantName', v)} placeholder="e.g. Bougainvillea G. Pink" />
                    </div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
                    <Btn onClick={() => setView('admin_plants')} style={{ background: C.white, border: `1px solid #cfd8d2`, color: '#46514a', borderRadius: 9, padding: '11px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                      Cancel
                    </Btn>
                    <Btn onClick={savePlant} style={{ background: C.primary, color: C.white, border: 'none', borderRadius: 9, padding: '11px 22px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }} hov={{ background: C.ph }}>
                      Save Plant
                    </Btn>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── ADMIN: LOCATION MASTER LIST ── */}
          {view === 'admin_locations' && (
            <div>
              <button onClick={() => setView('admin_settings')} style={{ background: 'none', border: 'none', color: '#5b6660', fontWeight: 600, fontSize: 13.5, cursor: 'pointer', marginBottom: 12, fontFamily: 'inherit' }}>← Back to Settings</button>
              <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 20 }}>
                <div>
                  <h1 style={{ fontFamily: 'var(--font-spectral),serif', fontWeight: 600, fontSize: 26, margin: 0 }}>Location Master</h1>
                  <p style={{ margin: '4px 0 0', color: '#5b6660', fontSize: 14 }}>Location reference list</p>
                </div>
                <Btn onClick={openNewLocation} style={{ background: C.primary, color: C.white, border: 'none', borderRadius: 9, padding: '11px 18px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }} hov={{ background: C.ph }}>
                  + New Location
                </Btn>
              </div>
              <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#f6f8f6' }}>
                      {['Location Name', 'Created By', 'Date', 'Last Modified'].map(h => <Th key={h}>{h}</Th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {locations.map(l => (
                      <tr key={l.id} style={{ borderTop: `1px solid #eef1ee` }}>
                        <td style={{ padding: '13px 16px', fontWeight: 600, fontSize: 14 }}>{l.name}</td>
                        <td style={{ padding: '13px 16px', fontSize: 13.5, color: '#46514a' }}>{l.createdBy}</td>
                        <td style={{ padding: '13px 16px', fontSize: 13.5, color: '#46514a' }}>{l.createdAt}</td>
                        <td style={{ padding: '13px 16px' }}><LastModified by={l.modifiedBy} at={l.modifiedAt} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {locations.length === 0 && <Empty text="No locations yet." />}
              </div>
            </div>
          )}

          {/* ── ADMIN: NEW LOCATION ── */}
          {view === 'admin_new_location' && (
            <div>
              <button onClick={() => setView('admin_locations')} style={{ background: 'none', border: 'none', color: '#5b6660', fontWeight: 600, fontSize: 13.5, cursor: 'pointer', marginBottom: 12, fontFamily: 'inherit' }}>← Cancel</button>
              <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, maxWidth: 560, overflow: 'hidden' }}>
                <div style={{ padding: '20px 24px', borderBottom: `1px solid ${C.borderL}` }}>
                  <h1 style={{ fontFamily: 'var(--font-spectral),serif', fontWeight: 600, fontSize: 22, margin: 0 }}>New Location</h1>
                </div>
                <div style={{ padding: '22px 24px' }}>
                  <div>
                    <FieldLabel>Location Name *</FieldLabel>
                    <Inp value={locationForm.name} onChange={v => updateLocationField('name', v)} placeholder="e.g. RAK 3" />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
                    <Btn onClick={() => setView('admin_locations')} style={{ background: C.white, border: `1px solid #cfd8d2`, color: '#46514a', borderRadius: 9, padding: '11px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                      Cancel
                    </Btn>
                    <Btn onClick={saveLocation} style={{ background: C.primary, color: C.white, border: 'none', borderRadius: 9, padding: '11px 22px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }} hov={{ background: C.ph }}>
                      Save Location
                    </Btn>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── ADMIN: USER ACCOUNTS LIST ── */}
          {view === 'admin_users' && (
            <div>
              <button onClick={() => setView('admin_settings')} style={{ background: 'none', border: 'none', color: '#5b6660', fontWeight: 600, fontSize: 13.5, cursor: 'pointer', marginBottom: 12, fontFamily: 'inherit' }}>← Back to Settings</button>
              <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 20 }}>
                <div>
                  <h1 style={{ fontFamily: 'var(--font-spectral),serif', fontWeight: 600, fontSize: 26, margin: 0 }}>User Accounts</h1>
                  <p style={{ margin: '4px 0 0', color: '#5b6660', fontSize: 14 }}>Admin &amp; Garden Incharge login accounts</p>
                </div>
                <Btn onClick={openNewUser} style={{ background: C.primary, color: C.white, border: 'none', borderRadius: 9, padding: '11px 18px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }} hov={{ background: C.ph }}>
                  + New User
                </Btn>
              </div>
              <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#f6f8f6' }}>
                      {['User Name', 'User Type', 'Created By', 'Date', 'Last Modified', ''].map(h => <Th key={h}>{h}</Th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {users.map(u => (
                      <tr key={u.id} style={{ borderTop: `1px solid #eef1ee` }}>
                        <td style={{ padding: '13px 16px', fontWeight: 600, fontSize: 14 }}>{u.username}</td>
                        <td style={{ padding: '13px 16px' }}>
                          <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 20, background: u.role === 'admin' ? '#fbf0e0' : '#e8f0fe', color: u.role === 'admin' ? C.amber : '#1a56c0' }}>
                            {u.role === 'admin' ? 'ADMIN' : 'GARDEN'}
                          </span>
                        </td>
                        <td style={{ padding: '13px 16px', fontSize: 13.5, color: '#46514a' }}>{u.createdBy}</td>
                        <td style={{ padding: '13px 16px', fontSize: 13.5, color: '#46514a' }}>{u.createdAt}</td>
                        <td style={{ padding: '13px 16px' }}><LastModified by={u.modifiedBy} at={u.modifiedAt} /></td>
                        <td style={{ padding: '13px 16px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <button onClick={() => openResetPassword(u)} style={{ background: 'none', border: 'none', color: C.primary, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
                            Reset Password
                          </button>
                          <button onClick={() => deleteUser(u)} style={{ background: 'none', border: 'none', color: '#c46', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', marginLeft: 14 }}>
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {users.length === 0 && <Empty text="No user accounts yet." />}
              </div>
            </div>
          )}

          {/* ── ADMIN: NEW USER ── */}
          {view === 'admin_new_user' && (
            <div>
              <button onClick={() => setView('admin_users')} style={{ background: 'none', border: 'none', color: '#5b6660', fontWeight: 600, fontSize: 13.5, cursor: 'pointer', marginBottom: 12, fontFamily: 'inherit' }}>← Cancel</button>
              <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, maxWidth: 560, overflow: 'hidden' }}>
                <div style={{ padding: '20px 24px', borderBottom: `1px solid ${C.borderL}` }}>
                  <h1 style={{ fontFamily: 'var(--font-spectral),serif', fontWeight: 600, fontSize: 22, margin: 0 }}>New User</h1>
                </div>
                <div style={{ padding: '22px 24px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <div>
                      <FieldLabel>User Name *</FieldLabel>
                      <Inp value={userForm.username} onChange={v => updateUserField('username', v)} placeholder="e.g. jsmith" />
                    </div>
                    <div>
                      <FieldLabel>User Type *</FieldLabel>
                      <Select
                        value={userForm.role}
                        onChange={v => updateUserRole(v as 'admin' | 'garden')}
                        options={[{ value: 'admin', label: 'Admin' }, { value: 'garden', label: 'Garden' }]}
                      />
                    </div>
                  </div>
                  <div style={{ marginTop: 16 }}>
                    <FieldLabel>Password *</FieldLabel>
                    <Inp value={userForm.password} onChange={v => updateUserField('password', v)} placeholder="Password" type="password" />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
                    <Btn onClick={() => setView('admin_users')} style={{ background: C.white, border: `1px solid #cfd8d2`, color: '#46514a', borderRadius: 9, padding: '11px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                      Cancel
                    </Btn>
                    <Btn onClick={saveUser} style={{ background: C.primary, color: C.white, border: 'none', borderRadius: 9, padding: '11px 22px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }} hov={{ background: C.ph }}>
                      Save User
                    </Btn>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── ADMIN: RESET PASSWORD ── */}
          {view === 'admin_reset_password' && (
            <div>
              <button onClick={() => { setResetPasswordUserId(null); setView('admin_users'); }} style={{ background: 'none', border: 'none', color: '#5b6660', fontWeight: 600, fontSize: 13.5, cursor: 'pointer', marginBottom: 12, fontFamily: 'inherit' }}>← Cancel</button>
              <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, maxWidth: 560, overflow: 'hidden' }}>
                <div style={{ padding: '20px 24px', borderBottom: `1px solid ${C.borderL}` }}>
                  <h1 style={{ fontFamily: 'var(--font-spectral),serif', fontWeight: 600, fontSize: 22, margin: 0 }}>Reset Password</h1>
                  <p style={{ margin: '3px 0 0', color: C.muted, fontSize: 13 }}>
                    {users.find(u => u.id === resetPasswordUserId)?.username}
                  </p>
                </div>
                <div style={{ padding: '22px 24px' }}>
                  <div>
                    <FieldLabel>New Password *</FieldLabel>
                    <Inp value={resetPasswordValue} onChange={setResetPasswordValue} placeholder="New password" type="password" />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
                    <Btn onClick={() => { setResetPasswordUserId(null); setView('admin_users'); }} style={{ background: C.white, border: `1px solid #cfd8d2`, color: '#46514a', borderRadius: 9, padding: '11px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                      Cancel
                    </Btn>
                    <Btn onClick={saveResetPassword} style={{ background: C.primary, color: C.white, border: 'none', borderRadius: 9, padding: '11px 22px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }} hov={{ background: C.ph }}>
                      Reset Password
                    </Btn>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── ADMIN: NUMBER SEQUENCE SETTINGS ── */}
          {view === 'admin_number_settings' && (
            <div>
              <button onClick={() => setView('admin_settings')} style={{ background: 'none', border: 'none', color: '#5b6660', fontWeight: 600, fontSize: 13.5, cursor: 'pointer', marginBottom: 12, fontFamily: 'inherit' }}>← Back to Settings</button>
              <div style={{ marginBottom: 20 }}>
                <h1 style={{ fontFamily: 'var(--font-spectral),serif', fontWeight: 600, fontSize: 26, margin: 0 }}>Number Sequence</h1>
                <p style={{ margin: '4px 0 0', color: '#5b6660', fontSize: 14 }}>Control the auto-generated Gate Pass &amp; Delivery Note numbers</p>
              </div>
              <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, maxWidth: 560, overflow: 'hidden' }}>
                <div style={{ padding: '22px 24px', borderBottom: `1px solid ${C.borderL}` }}>
                  <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 14 }}>Gate Pass Numbering</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                    <div>
                      <FieldLabel>Prefix *</FieldLabel>
                      <Inp value={numberSettingsForm.gpPrefix} onChange={v => updateNumberSettingsField('gpPrefix', v)} placeholder="e.g. GP-" />
                    </div>
                    <div>
                      <FieldLabel>Next Number *</FieldLabel>
                      <Inp value={numberSettingsForm.gpNext} onChange={v => updateNumberSettingsField('gpNext', v.replace(/[^0-9]/g, ''))} placeholder="e.g. 100001" />
                    </div>
                  </div>
                  <div style={{ marginTop: 10, fontSize: 12.5, color: '#9aa39d' }}>
                    Next Gate Pass No.: <b style={{ color: C.text }}>{numberSettingsForm.gpPrefix}{String(parseInt(numberSettingsForm.gpNext, 10) || 0).padStart(6, '0')}</b>
                  </div>
                </div>
                <div style={{ padding: '22px 24px', borderBottom: `1px solid ${C.borderL}` }}>
                  <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 14 }}>Delivery Note Numbering</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                    <div>
                      <FieldLabel>Prefix *</FieldLabel>
                      <Inp value={numberSettingsForm.dnPrefix} onChange={v => updateNumberSettingsField('dnPrefix', v)} placeholder="e.g. DO-" />
                    </div>
                    <div>
                      <FieldLabel>Next Number *</FieldLabel>
                      <Inp value={numberSettingsForm.dnNext} onChange={v => updateNumberSettingsField('dnNext', v.replace(/[^0-9]/g, ''))} placeholder="e.g. 100001" />
                    </div>
                  </div>
                  <div style={{ marginTop: 10, fontSize: 12.5, color: '#9aa39d' }}>
                    Next Delivery Note No.: <b style={{ color: C.text }}>{numberSettingsForm.dnPrefix}{String(parseInt(numberSettingsForm.dnNext, 10) || 0).padStart(6, '0')}</b>
                  </div>
                </div>
                <div style={{ padding: '18px 24px', display: 'flex', justifyContent: 'flex-end' }}>
                  <Btn onClick={saveNumberSettings} style={{ background: C.primary, color: C.white, border: 'none', borderRadius: 9, padding: '11px 22px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }} hov={{ background: C.ph }}>
                    Save
                  </Btn>
                </div>
              </div>
              <p style={{ maxWidth: 560, marginTop: 14, fontSize: 12.5, color: '#9aa39d' }}>
                Applies to newly created Gate Passes and Delivery Notes going forward — existing document numbers are unchanged. Each save advances by one automatically as new documents are created.
              </p>
            </div>
          )}

          {/* ── ADMIN: LPO / SO MAPPING LIST ── */}
          {view === 'admin_lposo' && (
            <div>
              <button onClick={() => setView('admin_settings')} style={{ background: 'none', border: 'none', color: '#5b6660', fontWeight: 600, fontSize: 13.5, cursor: 'pointer', marginBottom: 12, fontFamily: 'inherit' }}>← Back to Settings</button>
              <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 20 }}>
                <div>
                  <h1 style={{ fontFamily: 'var(--font-spectral),serif', fontWeight: 600, fontSize: 26, margin: 0 }}>LPO / SO Mapping</h1>
                  <p style={{ margin: '4px 0 0', color: '#5b6660', fontSize: 14 }}>Customer / Project reference for PO &amp; SO numbers</p>
                </div>
                <Btn onClick={openNewLpoSo} style={{ background: C.primary, color: C.white, border: 'none', borderRadius: 9, padding: '11px 18px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }} hov={{ background: C.ph }}>
                  + New Mapping
                </Btn>
              </div>
              <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#f6f8f6' }}>
                      {['Customer Name', 'Project', 'PO No.', 'SO Ref.', 'Created By', 'Date', 'Last Modified'].map(h => <Th key={h}>{h}</Th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {lpoSoMappings.map(m => (
                      <tr key={m.id} style={{ borderTop: `1px solid #eef1ee` }}>
                        <td style={{ padding: '13px 16px', fontWeight: 600, fontSize: 14 }}>{m.customerName}</td>
                        <td style={{ padding: '13px 16px', fontSize: 13.5, color: '#46514a' }}>{m.project || '—'}</td>
                        <td style={{ padding: '13px 16px', fontSize: 13.5, color: '#46514a' }}>{m.poNo || '—'}</td>
                        <td style={{ padding: '13px 16px', fontSize: 13.5, color: '#46514a' }}>{m.soRef || '—'}</td>
                        <td style={{ padding: '13px 16px', fontSize: 13.5, color: '#46514a' }}>{m.createdBy}</td>
                        <td style={{ padding: '13px 16px', fontSize: 13.5, color: '#46514a' }}>{m.createdAt}</td>
                        <td style={{ padding: '13px 16px' }}><LastModified by={m.modifiedBy} at={m.modifiedAt} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {lpoSoMappings.length === 0 && <Empty text="No LPO / SO mappings yet." />}
              </div>
            </div>
          )}

          {/* ── ADMIN: NEW LPO / SO MAPPING ── */}
          {view === 'admin_new_lposo' && (
            <div>
              <button onClick={() => setView('admin_lposo')} style={{ background: 'none', border: 'none', color: '#5b6660', fontWeight: 600, fontSize: 13.5, cursor: 'pointer', marginBottom: 12, fontFamily: 'inherit' }}>← Cancel</button>
              <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, maxWidth: 560, overflow: 'hidden' }}>
                <div style={{ padding: '20px 24px', borderBottom: `1px solid ${C.borderL}` }}>
                  <h1 style={{ fontFamily: 'var(--font-spectral),serif', fontWeight: 600, fontSize: 22, margin: 0 }}>New LPO / SO Mapping</h1>
                </div>
                <div style={{ padding: '22px 24px' }}>
                  <div>
                    <FieldLabel>Customer Name *</FieldLabel>
                    <Inp value={lpoSoForm.customerName} onChange={v => updateLpoSoField('customerName', v)} placeholder="e.g. Opal Garden" />
                  </div>
                  <div style={{ marginTop: 16 }}>
                    <FieldLabel>Project</FieldLabel>
                    <Inp value={lpoSoForm.project} onChange={v => updateLpoSoField('project', v)} placeholder="optional" />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 }}>
                    <div>
                      <FieldLabel>PO No.</FieldLabel>
                      <Inp value={lpoSoForm.poNo} onChange={v => updateLpoSoField('poNo', v)} placeholder="optional" />
                    </div>
                    <div>
                      <FieldLabel>SO Reference</FieldLabel>
                      <Inp value={lpoSoForm.soRef} onChange={v => updateLpoSoField('soRef', v)} placeholder="optional" />
                    </div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
                    <Btn onClick={() => setView('admin_lposo')} style={{ background: C.white, border: `1px solid #cfd8d2`, color: '#46514a', borderRadius: 9, padding: '11px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                      Cancel
                    </Btn>
                    <Btn onClick={saveLpoSo} style={{ background: C.primary, color: C.white, border: 'none', borderRadius: 9, padding: '11px 22px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }} hov={{ background: C.ph }}>
                      Save Mapping
                    </Btn>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── ADMIN: REPRINT LOG LIST ── */}
          {view === 'admin_reprints' && (
            <div>
              <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 20 }}>
                <div>
                  <h1 style={{ fontFamily: 'var(--font-spectral),serif', fontWeight: 600, fontSize: 26, margin: 0 }}>Reprint</h1>
                  <p style={{ margin: '4px 0 0', color: '#5b6660', fontSize: 14 }}>Scan a Gate Pass or Delivery Note to reprint it</p>
                </div>
                <Btn onClick={openNewReprint} style={{ background: C.primary, color: C.white, border: 'none', borderRadius: 9, padding: '11px 18px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }} hov={{ background: C.ph }}>
                  + New Reprint
                </Btn>
              </div>
              <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#f6f8f6' }}>
                      {['Doc Type', 'Doc No.', 'Customer / Project', 'Reprinted By', 'Date'].map(h => <Th key={h}>{h}</Th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {reprintLogs.map(log => (
                      <tr key={log.id} style={{ borderTop: `1px solid #eef1ee` }}>
                        <td style={{ padding: '13px 16px', fontSize: 13.5 }}>{log.docType === 'gp' ? 'Gate Pass' : 'Delivery Note'}</td>
                        <td style={{ padding: '13px 16px', fontWeight: 700, fontSize: 14 }}>{log.docNo}</td>
                        <td style={{ padding: '13px 16px', fontSize: 13.5, color: '#46514a' }}>{log.customerProject}</td>
                        <td style={{ padding: '13px 16px', fontSize: 13.5, color: '#46514a' }}>{log.createdBy}</td>
                        <td style={{ padding: '13px 16px', fontSize: 13.5, color: '#46514a' }}>{log.createdAt}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {reprintLogs.length === 0 && <Empty text="No reprints logged yet." />}
              </div>
            </div>
          )}

          {/* ── ADMIN: NEW REPRINT (Scan) ── */}
          {view === 'admin_new_reprint' && (
            <div>
              <button onClick={() => setView('admin_reprints')} style={{ background: 'none', border: 'none', color: '#5b6660', fontWeight: 600, fontSize: 13.5, cursor: 'pointer', marginBottom: 12, fontFamily: 'inherit' }}>← Cancel</button>
              <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, maxWidth: 560, overflow: 'hidden' }}>
                <div style={{ padding: '20px 24px', borderBottom: `1px solid ${C.borderL}` }}>
                  <h1 style={{ fontFamily: 'var(--font-spectral),serif', fontWeight: 600, fontSize: 22, margin: 0 }}>New Reprint</h1>
                </div>
                <div style={{ padding: '22px 24px' }}>
                  <div>
                    <FieldLabel>Scan Gate Pass / Delivery Note No. *</FieldLabel>
                    <Inp
                      value={reprintScanValue}
                      onChange={handleReprintScan}
                      onKeyDown={e => { if (e.key === 'Enter') submitReprintScan(); }}
                      inputRef={reprintScanRef}
                      placeholder="Scan or type a No., then Enter"
                    />
                  </div>
                  {reprintNotFound && (
                    <div style={{ marginTop: 12, fontSize: 13, color: '#c46' }}>
                      No matching Gate Pass or Delivery Note found for &quot;{reprintScanValue}&quot;.
                    </div>
                  )}
                  {reprintMatch && (
                    <div style={{ marginTop: 16, border: `1px solid ${C.borderL}`, borderRadius: 10, padding: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>
                          {reprintMatch.type === 'gp' ? 'Gate Pass' : 'Delivery Note'} #{reprintMatch.no}
                        </div>
                        <div style={{ fontSize: 13, color: '#46514a', marginTop: 2 }}>{reprintMatch.customerProject}</div>
                        <div style={{ fontSize: 12, color: '#9aa39d', marginTop: 2 }}>{reprintMatch.date}</div>
                      </div>
                      <Chip st={reprintMatch.status} />
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
                    <Btn onClick={() => setView('admin_reprints')} style={{ background: C.white, border: `1px solid #cfd8d2`, color: '#46514a', borderRadius: 9, padding: '11px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                      Cancel
                    </Btn>
                    <Btn onClick={confirmReprint} disabled={!reprintMatch} style={{ background: reprintMatch ? C.primary : '#a9c9b6', color: C.white, border: 'none', borderRadius: 9, padding: '11px 22px', fontSize: 14, fontWeight: 700, cursor: reprintMatch ? 'pointer' : 'default' }} hov={reprintMatch ? { background: C.ph } : undefined}>
                      View &amp; Print →
                    </Btn>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── TAG PRINT: LIST (standalone plant tag / label — not tied to a Gate Pass or Delivery Note) ── */}
          {view === 'admin_tags' && (
            <div>
              <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 20 }}>
                <div>
                  <h1 style={{ fontFamily: 'var(--font-spectral),serif', fontWeight: 600, fontSize: 26, margin: 0 }}>Tag Print</h1>
                  <p style={{ margin: '4px 0 0', color: '#5b6660', fontSize: 14 }}>Scan a serial number and print a plant tag (25.4cm × 2.5cm)</p>
                </div>
                <Btn onClick={openNewTag} style={{ background: C.primary, color: C.white, border: 'none', borderRadius: 9, padding: '11px 18px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }} hov={{ background: C.ph }}>
                  + New Tag
                </Btn>
              </div>
              <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#f6f8f6' }}>
                      {['SRL#', 'Plant Code', 'Plant Name', 'Size', 'Location', 'Warehouse', 'Printed By', 'Date'].map(h => <Th key={h}>{h}</Th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {plantTags.map(t => (
                      <tr key={t.id} style={{ borderTop: `1px solid #eef1ee` }}>
                        <td style={{ padding: '13px 16px', fontWeight: 700, fontSize: 14 }}>{t.srlNo}</td>
                        <td style={{ padding: '13px 16px', fontSize: 13.5, color: '#46514a' }}>{t.plantCode || '—'}</td>
                        <td style={{ padding: '13px 16px', fontSize: 13.5, color: '#46514a' }}>{t.plantName}</td>
                        <td style={{ padding: '13px 16px', fontSize: 13.5, color: '#46514a' }}>{t.size || '—'}</td>
                        <td style={{ padding: '13px 16px', fontSize: 13.5, color: '#46514a' }}>{t.location || '—'}</td>
                        <td style={{ padding: '13px 16px', fontSize: 13.5, color: '#46514a' }}>{t.warehouse || '—'}</td>
                        <td style={{ padding: '13px 16px', fontSize: 13.5, color: '#46514a' }}>{t.createdBy}</td>
                        <td style={{ padding: '13px 16px', fontSize: 13.5, color: '#46514a' }}>{t.createdAt}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {plantTags.length === 0 && <Empty text="No tags printed yet." />}
              </div>
            </div>
          )}

          {/* ── TAG PRINT: NEW (Scan + direct print) ── */}
          {view === 'admin_new_tag' && (
            <div>
              {/* Override the default @page size just for this view's print/PDF output —
                  the tag is a small 25.4cm x 2.5cm strip, not A4. */}
              <style>{'@page { size: 254mm 25mm; margin: 0; }'}</style>
              <div data-print-hide>
                <button onClick={() => setView('admin_tags')} style={{ background: 'none', border: 'none', color: '#5b6660', fontWeight: 600, fontSize: 13.5, cursor: 'pointer', marginBottom: 12, fontFamily: 'inherit' }}>← Cancel</button>
                <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, maxWidth: 560, overflow: 'hidden' }}>
                  <div style={{ padding: '20px 24px', borderBottom: `1px solid ${C.borderL}` }}>
                    <h1 style={{ fontFamily: 'var(--font-spectral),serif', fontWeight: 600, fontSize: 22, margin: 0 }}>New Tag</h1>
                  </div>
                  <div style={{ padding: '22px 24px' }}>
                    <div>
                      <FieldLabel>Scan SRL# *</FieldLabel>
                      <Inp
                        value={tagForm.srlNo}
                        onChange={handleTagSrlScan}
                        inputRef={tagScanRef}
                        placeholder="Scan or type a serial number"
                      />
                    </div>
                    <div style={{ marginTop: 16 }}>
                      <FieldLabel>Plant Name *</FieldLabel>
                      <PlantNameCombo
                        value={tagForm.plantName}
                        plants={plants}
                        onChangeText={v => updateTagField('plantName', v)}
                        onSelect={p => updateTagField('plantName', p.plantName)}
                      />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 }}>
                      <div>
                        <FieldLabel>Plant Code</FieldLabel>
                        <Inp value={tagForm.plantCode} onChange={v => updateTagField('plantCode', v)} placeholder="optional" />
                      </div>
                      <div>
                        <FieldLabel>Size</FieldLabel>
                        <Inp value={tagForm.size} onChange={v => updateTagField('size', v)} placeholder="e.g. CL_C_1.5LP" />
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 }}>
                      <div>
                        <FieldLabel>Location</FieldLabel>
                        <LocationCombo
                          value={tagForm.location}
                          locations={locations}
                          onChangeText={v => updateTagField('location', v)}
                          onSelect={l => updateTagField('location', l.name)}
                        />
                      </div>
                      <div>
                        <FieldLabel>Warehouse</FieldLabel>
                        <Inp value={tagForm.warehouse} onChange={v => updateTagField('warehouse', v)} placeholder="optional" />
                      </div>
                    </div>
                    {tagError && <div style={{ marginTop: 12, fontSize: 13, color: '#c46' }}>{tagError}</div>}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
                      <Btn onClick={() => setView('admin_tags')} style={{ background: C.white, border: `1px solid #cfd8d2`, color: '#46514a', borderRadius: 9, padding: '11px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                        Cancel
                      </Btn>
                      <Btn onClick={saveAndPrintTag} style={{ background: C.primary, color: C.white, border: 'none', borderRadius: 9, padding: '11px 22px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }} hov={{ background: C.ph }}>
                        Save &amp; Print
                      </Btn>
                    </div>
                  </div>
                </div>
                <p style={{ maxWidth: 560, marginTop: 14, fontSize: 12.5, color: '#9aa39d' }}>Preview — this is what will print:</p>
              </div>
              <div data-print-hide style={{ height: 8 }} />
              <div style={{ overflowX: 'auto' }}>
                <PrintableTag
                  tag={{ plantCode: tagForm.plantCode, plantName: tagForm.plantName || '—', srlNo: tagForm.srlNo || '—', size: tagForm.size, location: tagForm.location, warehouse: tagForm.warehouse, date: today() }}
                  printRef={tagPrintRef}
                />
              </div>
            </div>
          )}

          {/* ── ONHAND: LIST (standalone inventory snapshot, bulk-imported from an ERP export) ── */}
          {view === 'admin_onhand' && (
            <div>
              <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 20 }}>
                <div>
                  <h1 style={{ fontFamily: 'var(--font-spectral),serif', fontWeight: 600, fontSize: 26, margin: 0 }}>Onhand</h1>
                  <p style={{ margin: '4px 0 0', color: '#5b6660', fontSize: 14 }}>Inventory snapshot — uploading a new Excel file replaces this list</p>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <Btn onClick={() => onhandFileRef.current?.click()} style={{ background: C.white, border: `1px solid #cfd8d2`, color: '#46514a', borderRadius: 9, padding: '11px 18px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                    ⇪ Upload Excel
                  </Btn>
                  <input
                    ref={onhandFileRef}
                    type="file"
                    accept=".xlsx,.xls"
                    style={{ display: 'none' }}
                    onChange={e => {
                      const file = e.target.files?.[0];
                      if (file) handleOnhandExcelUpload(file);
                      e.target.value = '';
                    }}
                  />
                  <Btn onClick={openNewOnhand} style={{ background: C.primary, color: C.white, border: 'none', borderRadius: 9, padding: '11px 18px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }} hov={{ background: C.ph }}>
                    + New Item
                  </Btn>
                </div>
              </div>
              <p style={{ marginTop: '-12px', marginBottom: 16, fontSize: 12.5, color: '#9aa39d' }}>
                Excel file must have &quot;Item Number&quot; and/or &quot;Item Name&quot; columns (Style, Search Name, Size, Color, Site, Warehouse, Location, Physical Inventory, Unit Rate are optional).
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <div style={{ maxWidth: 360, flex: 1 }}>
                  <Inp value={onhandSearch} onChange={setOnhandSearch} placeholder="Search item number, name, style..." />
                </div>
                {onhandSelected.size > 0 && (
                  <Btn onClick={deleteSelectedOnhandItems} style={{ background: '#fdecea', border: '1px solid #f0c4bd', color: '#c0532e', borderRadius: 9, padding: '11px 18px', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>
                    Delete Selected ({onhandSelected.size})
                  </Btn>
                )}
              </div>
              {(() => {
                const filteredOnhandItems = onhandItems.filter(it => {
                  const q = onhandSearch.trim().toLowerCase();
                  if (!q) return true;
                  return [it.itemNumber, it.itemName, it.searchName, it.style].some(v => v.toLowerCase().includes(q));
                });
                const filteredIds = filteredOnhandItems.map(it => it.id);
                const allSelected = filteredIds.length > 0 && filteredIds.every(id => onhandSelected.has(id));
                return (
              <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden', overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#f6f8f6' }}>
                      <Th>
                        <input type="checkbox" checked={allSelected} onChange={() => toggleOnhandSelectAll(filteredIds)} style={{ cursor: 'pointer' }} />
                      </Th>
                      {['Style', 'Item Number', 'Item Name', 'Search Name', 'Size', 'Color', 'Site', 'Warehouse', 'Location', 'Physical Inventory', 'Unit Rate', ''].map(h => <Th key={h}>{h}</Th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredOnhandItems.map(it => (
                        <tr key={it.id} style={{ borderTop: `1px solid #eef1ee` }}>
                          <td style={{ padding: '13px 16px' }}>
                            <input type="checkbox" checked={onhandSelected.has(it.id)} onChange={() => toggleOnhandSelected(it.id)} style={{ cursor: 'pointer' }} />
                          </td>
                          <td style={{ padding: '13px 16px', fontSize: 13.5, whiteSpace: 'nowrap' }}>{it.style || '—'}</td>
                          <td style={{ padding: '13px 16px', fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap' }}>{it.itemNumber || '—'}</td>
                          <td style={{ padding: '13px 16px', fontSize: 13.5, color: '#46514a' }}>{it.itemName || '—'}</td>
                          <td style={{ padding: '13px 16px', fontSize: 13.5, color: '#46514a' }}>{it.searchName || '—'}</td>
                          <td style={{ padding: '13px 16px', fontSize: 13.5, whiteSpace: 'nowrap' }}>{it.size || '—'}</td>
                          <td style={{ padding: '13px 16px', fontSize: 13.5, whiteSpace: 'nowrap' }}>{it.color || '—'}</td>
                          <td style={{ padding: '13px 16px', fontSize: 13.5, whiteSpace: 'nowrap' }}>{it.site || '—'}</td>
                          <td style={{ padding: '13px 16px', fontSize: 13.5, whiteSpace: 'nowrap' }}>{it.warehouse || '—'}</td>
                          <td style={{ padding: '13px 16px', fontSize: 13.5, whiteSpace: 'nowrap' }}>{it.location || '—'}</td>
                          <td style={{ padding: '13px 16px', fontSize: 13.5, textAlign: 'right' }}>{it.physicalInventory.toFixed(2)}</td>
                          <td style={{ padding: '13px 16px', fontSize: 13.5, textAlign: 'right' }}>{it.unitRate.toFixed(2)}</td>
                          <td style={{ padding: '13px 16px', textAlign: 'right' }}>
                            <button onClick={() => deleteOnhandItem(it)} style={{ background: 'none', border: 'none', color: '#c0532e', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
                {filteredOnhandItems.length === 0 && <Empty text="No onhand data yet." />}
              </div>
                );
              })()}
            </div>
          )}

          {/* ── ONHAND: NEW (manual single-item entry) ── */}
          {view === 'admin_new_onhand' && (
            <div>
              <button onClick={() => setView('admin_onhand')} style={{ background: 'none', border: 'none', color: '#5b6660', fontWeight: 600, fontSize: 13.5, cursor: 'pointer', marginBottom: 12, fontFamily: 'inherit' }}>← Cancel</button>
              <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, maxWidth: 640, overflow: 'hidden' }}>
                <div style={{ padding: '20px 24px', borderBottom: `1px solid ${C.borderL}` }}>
                  <h1 style={{ fontFamily: 'var(--font-spectral),serif', fontWeight: 600, fontSize: 22, margin: 0 }}>New Onhand Item</h1>
                </div>
                <div style={{ padding: '22px 24px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <div>
                      <FieldLabel>Style</FieldLabel>
                      <Inp value={onhandForm.style} onChange={v => updateOnhandField('style', v)} placeholder="optional" />
                    </div>
                    <div>
                      <FieldLabel>Item Number *</FieldLabel>
                      <Inp value={onhandForm.itemNumber} onChange={v => updateOnhandField('itemNumber', v)} placeholder="e.g. B00000001" />
                    </div>
                    <div>
                      <FieldLabel>Item Name</FieldLabel>
                      <Inp value={onhandForm.itemName} onChange={v => updateOnhandField('itemName', v)} placeholder="optional" />
                    </div>
                    <div>
                      <FieldLabel>Search Name</FieldLabel>
                      <Inp value={onhandForm.searchName} onChange={v => updateOnhandField('searchName', v)} placeholder="optional" />
                    </div>
                    <div>
                      <FieldLabel>Size</FieldLabel>
                      <Inp value={onhandForm.size} onChange={v => updateOnhandField('size', v)} placeholder="optional" />
                    </div>
                    <div>
                      <FieldLabel>Color</FieldLabel>
                      <Inp value={onhandForm.color} onChange={v => updateOnhandField('color', v)} placeholder="optional" />
                    </div>
                    <div>
                      <FieldLabel>Site</FieldLabel>
                      <Inp value={onhandForm.site} onChange={v => updateOnhandField('site', v)} placeholder="optional" />
                    </div>
                    <div>
                      <FieldLabel>Warehouse</FieldLabel>
                      <Inp value={onhandForm.warehouse} onChange={v => updateOnhandField('warehouse', v)} placeholder="optional" />
                    </div>
                    <div>
                      <FieldLabel>Location</FieldLabel>
                      <Inp value={onhandForm.location} onChange={v => updateOnhandField('location', v)} placeholder="optional" />
                    </div>
                    <div>
                      <FieldLabel>Physical Inventory</FieldLabel>
                      <Inp value={onhandForm.physicalInventory} onChange={v => updateOnhandField('physicalInventory', v)} placeholder="0" />
                    </div>
                    <div>
                      <FieldLabel>Unit Rate</FieldLabel>
                      <Inp value={onhandForm.unitRate} onChange={v => updateOnhandField('unitRate', v)} placeholder="0" />
                    </div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
                    <Btn onClick={() => setView('admin_onhand')} style={{ background: C.white, border: `1px solid #cfd8d2`, color: '#46514a', borderRadius: 9, padding: '11px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                      Cancel
                    </Btn>
                    <Btn onClick={saveOnhandItem} style={{ background: C.primary, color: C.white, border: 'none', borderRadius: 9, padding: '11px 22px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }} hov={{ background: C.ph }}>
                      Save Item
                    </Btn>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── REPORT (Admin + Garden): combined Gate Pass + Delivery Note line items ── */}
          {view === 'report' && (
            <div>
              <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 20 }}>
                <div>
                  <h1 style={{ fontFamily: 'var(--font-spectral),serif', fontWeight: 600, fontSize: 26, margin: 0 }}>Report</h1>
                  <p style={{ margin: '4px 0 0', color: '#5b6660', fontSize: 14 }}>All posted delivery note lines.</p>
                </div>
                <Btn onClick={exportReportToExcel} style={{ background: C.white, border: `1px solid ${C.primary}`, color: C.primary, borderRadius: 9, padding: '11px 18px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                  Excel Report
                </Btn>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
                <div style={{ minWidth: 170 }}>
                  <FieldLabel>Gate Pass No.</FieldLabel>
                  <FilterCombo
                    value={reportFilterGpNo}
                    options={reportGpNoOptions}
                    onChange={setReportFilterGpNo}
                    placeholder="Search or type..."
                  />
                </div>
                <div style={{ minWidth: 170 }}>
                  <FieldLabel>Delivery Note No.</FieldLabel>
                  <FilterCombo
                    value={reportFilterDnNo}
                    options={reportDnNoOptions}
                    onChange={setReportFilterDnNo}
                    placeholder="Search or type..."
                  />
                </div>
                <div style={{ minWidth: 220 }}>
                  <FieldLabel>Customer &amp; Project</FieldLabel>
                  <FilterCombo
                    value={reportFilterCustomerProject}
                    options={reportCustomerProjectOptions}
                    onChange={setReportFilterCustomerProject}
                    placeholder="Search or type..."
                  />
                </div>
                <div style={{ minWidth: 170 }}>
                  <FieldLabel>Project</FieldLabel>
                  <FilterCombo
                    value={reportFilterProject}
                    options={reportProjectOptions}
                    onChange={setReportFilterProject}
                    placeholder="Search or type..."
                  />
                </div>
                <div style={{ minWidth: 150 }}>
                  <FieldLabel>From Date</FieldLabel>
                  <Inp value={reportFilterFromDate} onChange={setReportFilterFromDate} type="date" />
                </div>
                <div style={{ minWidth: 150 }}>
                  <FieldLabel>To Date</FieldLabel>
                  <Inp value={reportFilterToDate} onChange={setReportFilterToDate} type="date" />
                </div>
                <div style={{ minWidth: 150 }}>
                  <FieldLabel>Status</FieldLabel>
                  <FilterCombo
                    value={reportFilterStatus}
                    options={reportStatusOptions}
                    onChange={setReportFilterStatus}
                    placeholder="Search or type..."
                  />
                </div>
                {(reportFilterGpNo || reportFilterDnNo || reportFilterCustomerProject || reportFilterProject || reportFilterFromDate || reportFilterToDate || reportFilterStatus) && (
                  <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                    <button
                      onClick={() => { setReportFilterGpNo(''); setReportFilterDnNo(''); setReportFilterCustomerProject(''); setReportFilterProject(''); setReportFilterFromDate(''); setReportFilterToDate(''); setReportFilterStatus(''); }}
                      style={{ background: 'none', border: 'none', color: C.primary, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', padding: '9px 4px' }}
                    >
                      Clear filters
                    </button>
                  </div>
                )}
              </div>
              <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1600 }}>
                  <thead>
                    <tr style={{ background: '#f6f8f6' }}>
                      {['Date', 'Gate Pass No.', 'Delivery Note No.', 'Category', 'Item Description', 'Party', 'Customer & Project', 'Project', 'PR Ref.', 'LPO No.', 'SO Reference', 'DO Reference', 'Delivery Qty', 'SYS Posted Qty', 'Remaining Qty', 'Status', 'Location', 'Remarks'].map(h => (
                        <Th key={h}>{h}</Th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredReportRows.map(row => (
                      <tr key={row.key} style={{ borderTop: `1px solid #eef1ee` }}>
                        <td style={{ padding: '10px 12px', fontSize: 13, whiteSpace: 'nowrap' }}>{row.date}</td>
                        <td style={{ padding: '10px 12px', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}>{row.gpNo}</td>
                        <td style={{ padding: '10px 12px', fontSize: 13, whiteSpace: 'nowrap' }}>
                          <button
                            onClick={() => { setActiveDnNo(row.dnNo); setView(auth?.role === 'admin' ? 'admin_view_dn' : 'garden_view_dn'); }}
                            style={{ background: 'none', border: 'none', padding: 0, color: C.primary, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'underline' }}
                          >
                            {row.dnNo}
                          </button>
                        </td>
                        <td style={{ padding: '10px 12px', fontSize: 13 }}>{row.category}</td>
                        <td style={{ padding: '10px 12px', fontSize: 13 }}>{row.itemDescription}</td>
                        <td style={{ padding: '10px 12px', fontSize: 13 }}>{row.party}</td>
                        <td style={{ padding: '10px 12px', fontSize: 13 }}>{row.customerProject}</td>
                        <td style={{ padding: '10px 12px', fontSize: 13 }}>{row.project || '—'}</td>
                        <td style={{ padding: '10px 12px', fontSize: 13 }}>{row.prRef || '—'}</td>
                        <td style={{ padding: '10px 12px', fontSize: 13 }}>{row.lpoNo || '—'}</td>
                        <td style={{ padding: '10px 12px', fontSize: 13 }}>{row.soRef || '—'}</td>
                        <td style={{ padding: '10px 12px', fontSize: 13 }}>{row.doNo || '—'}</td>
                        <td style={{ padding: '10px 12px', fontSize: 13, textAlign: 'right' }}>{row.deliveryQty}</td>
                        <td style={{ padding: '10px 12px', fontSize: 13, textAlign: 'right' }}>{row.postedQty}</td>
                        <td style={{ padding: '10px 12px', fontSize: 13, textAlign: 'right' }}>{row.remainingQty}</td>
                        <td style={{ padding: '10px 12px' }}>
                          <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 20, ...statusColors(row.status) }}>
                            {row.status.toUpperCase()}
                          </span>
                        </td>
                        <td style={{ padding: '10px 12px', fontSize: 13, whiteSpace: 'nowrap' }}>{row.location}</td>
                        <td style={{ padding: '10px 12px', fontSize: 13 }}>{row.remarks || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filteredReportRows.length === 0 && <Empty text={reportRows.length === 0 ? 'No delivery note lines yet.' : 'No rows match the selected filters.'} />}
              </div>
            </div>
          )}

          {/* ── GARDEN: MY TASKS ── */}
          {view === 'garden_home' && (
            <div>
              <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 20 }}>
                <div>
                  <h1 style={{ fontFamily: 'var(--font-spectral),serif', fontWeight: 600, fontSize: 26, margin: 0 }}>My Tasks</h1>
                  <p style={{ margin: '4px 0 0', color: '#5b6660', fontSize: 14 }}>Step 2 — Generate a delivery note for each gate pass awaiting action</p>
                </div>
                <Btn onClick={openNewGpForGardenDn} style={{ background: C.white, border: `1px solid ${C.primary}`, color: C.primary, borderRadius: 9, padding: '11px 18px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                  + New Delivery Note
                </Btn>
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: '#9aa39d', margin: '6px 0 12px' }}>Awaiting Delivery Note</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(340px,1fr))', gap: 16 }}>
                {gps.filter(g => !g.dnNo && g.assignedTo.includes(auth?.name || '')).map(g => (
                  <GardenTaskCard key={g.no} gp={g} onStart={() => openNewDn(g)} />
                ))}
              </div>
              {gps.filter(g => !g.dnNo && g.assignedTo.includes(auth?.name || '')).length === 0 && (
                <div style={{ background: C.white, border: `1px dashed #cfd8d2`, borderRadius: 12, padding: 40, textAlign: 'center', color: '#9aa39d', fontSize: 14 }}>
                  No gate passes awaiting a delivery note. 🎉
                </div>
              )}
            </div>
          )}

          {/* ── GARDEN: DELIVERY NOTES (SCANNING LIST) ── */}
          {view === 'garden_scanning' && (
            <div>
              <div style={{ marginBottom: 20 }}>
                <h1 style={{ fontFamily: 'var(--font-spectral),serif', fontWeight: 600, fontSize: 26, margin: 0 }}>Delivery Notes</h1>
                <p style={{ margin: '4px 0 0', color: '#5b6660', fontSize: 14 }}>Step 3 — Scan barcodes. Once all are scanned you can view &amp; print the delivery note.</p>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
                <div style={{ minWidth: 190 }}>
                  <FieldLabel>Search By</FieldLabel>
                  <Select
                    value={gardenDnSearchField}
                    onChange={v => { setGardenDnSearchField(v as typeof gardenDnSearchField); setGardenDnSearchQuery(''); }}
                    options={gardenDnSearchFieldOptions}
                  />
                </div>
                <div style={{ minWidth: 240 }}>
                  <FieldLabel>{gardenDnSearchFieldOptions.find(o => o.value === gardenDnSearchField)?.label}</FieldLabel>
                  <FilterCombo value={gardenDnSearchQuery} options={gardenDnSearchOptions} onChange={setGardenDnSearchQuery} placeholder="Search or type..." />
                </div>
                {gardenDnSearchQuery && (
                  <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                    <button
                      onClick={() => setGardenDnSearchQuery('')}
                      style={{ background: 'none', border: 'none', color: C.primary, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', padding: '9px 4px' }}
                    >
                      Clear filters
                    </button>
                  </div>
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(340px,1fr))', gap: 16 }}>
                {filteredGardenDns.map(d => {
                  const sc = dnScanned(d), t = dnTarget(d);
                  return (
                    <GardenDnCard key={d.no} dn={d} scanned={sc} target={t}
                      onScan={() => {
                        setScanDnNo(d.no);
                        const inc = d.lines.find(l => l.serials.length < l.deliveryQty);
                        setScanLineSlNo(inc?.slNo ?? d.lines[0]?.slNo ?? 1);
                        setScanInput(''); setScanFeedback(null);
                        setView('garden_scan');
                      }}
                      onView={() => { setActiveDnNo(d.no); setView('garden_view_dn'); }}
                    />
                  );
                })}
              </div>
              {filteredGardenDns.length === 0 && (
                <div style={{ background: C.white, border: `1px dashed #cfd8d2`, borderRadius: 12, padding: 40, textAlign: 'center', color: '#9aa39d', fontSize: 14 }}>
                  {dns.length === 0 ? 'No delivery notes yet. Generate one from My Tasks.' : 'No delivery notes match the selected filters.'}
                </div>
              )}
            </div>
          )}

          {/* ── GARDEN: GENERATE DELIVERY NOTE ── */}
          {view === 'garden_new_dn' && dnForm && (
            <div>
              <button onClick={() => { setDnForm(null); setView('garden_home'); }} style={{ background: 'none', border: 'none', color: '#5b6660', fontWeight: 600, fontSize: 13.5, cursor: 'pointer', marginBottom: 12, fontFamily: 'inherit' }}>← Cancel</button>
              <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, maxWidth: 1000, overflow: 'hidden' }}>
                <div style={{ padding: '20px 24px', borderBottom: `1px solid ${C.borderL}`, background: '#f7faf8' }}>
                  <h1 style={{ fontFamily: 'var(--font-spectral),serif', fontWeight: 600, fontSize: 22, margin: 0 }}>Generate Delivery Note</h1>
                  <p style={{ margin: '3px 0 0', color: C.muted, fontSize: 13 }}>From Gate Pass #{dnForm.gpNo}</p>
                </div>
                <div style={{ padding: '22px 24px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
                    {([
                      ['customerProject', 'Customer / Project', ''],
                      ['vhNumber',        'Vehicle No. *',      'e.g. OM 4-12345'],
                      ['project',         'Project',            ''],
                      ['date',            'Date',               ''],
                    ] as [keyof Omit<DNForm, 'lines' | 'gpNo'>, string, string][]).map(([k, lbl, ph]) => (
                      <div key={k}>
                        <FieldLabel>{lbl}</FieldLabel>
                        <Inp value={dnForm[k]} onChange={v => updateDnField(k, v)} placeholder={ph} />
                      </div>
                    ))}
                  </div>

                  <div style={{ marginTop: 18, border: `1px solid #e7ebe7`, borderRadius: 10, overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead>
                        <tr style={{ background: '#f6f8f6' }}>
                          {['#', 'Plant Name', 'Specification', 'Order Qty', 'Deliver Qty', 'Location', 'Remarks'].map((h, i) => (
                            <th key={i} style={{ textAlign: 'left', fontSize: 10.5, textTransform: 'uppercase', color: C.muted, fontWeight: 700, padding: '9px 10px', width: i === 0 ? 38 : i === 2 ? 150 : i === 3 ? 80 : i === 4 ? 96 : undefined }}>
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {dnForm.lines.map(ln => (
                          <tr key={ln.slNo} style={{ borderTop: `1px solid ${C.borderL}` }}>
                            <td style={{ padding: '6px 10px', color: '#9aa39d', fontWeight: 700 }}>{ln.slNo}</td>
                            <td style={{ padding: '6px 10px', fontWeight: 600 }}>{ln.plantName}</td>
                            <td style={{ padding: '6px 10px', color: '#46514a' }}>{ln.spec}</td>
                            <td style={{ padding: '6px 10px', color: '#46514a', fontWeight: 700 }}>{ln.qty}</td>
                            <td style={{ padding: '6px 10px' }}><TInp value={ln.deliveryQty} onChange={v => updateDnLine(ln.slNo, 'deliveryQty', v)} /></td>
                            <td style={{ padding: '6px 10px' }}>
                              <LocationCombo
                                value={ln.location}
                                locations={locations}
                                onChangeText={v => updateDnLine(ln.slNo, 'location', v)}
                                onSelect={l => updateDnLine(ln.slNo, 'location', l.name)}
                              />
                            </td>
                            <td style={{ padding: '6px 10px' }}><TInp value={ln.remarks} onChange={v => updateDnLine(ln.slNo, 'remarks', v)} placeholder="optional" /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
                    <Btn onClick={() => { setDnForm(null); setView('garden_home'); }} style={{ background: C.white, border: `1px solid #cfd8d2`, color: '#46514a', borderRadius: 9, padding: '11px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                      Cancel
                    </Btn>
                    <Btn onClick={() => saveDn(false)} style={{ background: C.white, border: `1px solid ${C.primary}`, color: C.primary, borderRadius: 9, padding: '11px 22px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                      Submit DO
                    </Btn>
                    <Btn onClick={() => saveDn(true)} style={{ background: C.primary, color: C.white, border: 'none', borderRadius: 9, padding: '11px 22px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }} hov={{ background: C.ph }}>
                      Generate &amp; Start Scanning →
                    </Btn>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── GARDEN: SCAN SCREEN ── */}
          {view === 'garden_scan' && scanDn && (
            <ScanScreen
              dn={scanDn}
              activeSlNo={scanLineSlNo}
              scanInput={scanInput}
              feedback={scanFeedback}
              inputRef={scanRef}
              onScanInput={setScanInput}
              onScanKey={e => { if (e.key === 'Enter') doScan(scanInput); }}
              onSimulate={simulateScan}
              onSelectLine={setScanLineSlNo}
              onRemoveSerial={async (slNo, code) => { await removeSerial(scanDn.no, slNo, code); await reload(); }}
              onComplete={completeDn}
              onBack={() => setView(auth?.role === 'admin' ? 'admin_dns' : 'garden_scanning')}
            />
          )}

        </main>
      </div>

      <Toast msg={toast} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────

function RoleCard({ label, letter, desc, onChoose }: { label: string; letter: string; desc: string; onChoose: () => void }) {
  const [h, setH] = useState(false);
  return (
    <button
      onClick={onChoose}
      style={{
        cursor: 'pointer', border: '1px solid rgba(255,255,255,.16)',
        background: h ? 'rgba(255,255,255,.14)' : 'rgba(255,255,255,.07)',
        backdropFilter: 'blur(6px)', borderRadius: 14, padding: 24,
        color: '#fff', textAlign: 'left', transition: 'transform .12s,background .12s',
        transform: h ? 'translateY(-3px)' : 'none', fontFamily: 'inherit',
      }}
      onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
    >
      <div style={{ width: 42, height: 42, borderRadius: 10, background: '#e9d9a6', color: '#123c2b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 18 }}>{letter}</div>
      <div style={{ fontSize: 19, fontWeight: 700, marginTop: 16 }}>{label}</div>
      <div style={{ fontSize: 13.5, color: '#bcd5c6', marginTop: 5, lineHeight: 1.45 }}>{desc}</div>
    </button>
  );
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th style={{ textAlign: right ? 'right' : 'left', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em', color: '#7a857e', fontWeight: 700, padding: '12px 16px' }}>
      {children}
    </th>
  );
}

function Empty({ text }: { text: string }) {
  return <div style={{ padding: 40, textAlign: 'center', color: '#9aa39d', fontSize: 14 }}>{text}</div>;
}

function LastModified({ by, at }: { by: string | null; at: string | null }) {
  if (!by) return <span style={{ color: '#c3c9c5' }}>—</span>;
  return (
    <div>
      <div style={{ fontSize: 13.5, color: '#46514a' }}>{by}</div>
      <div style={{ fontSize: 11.5, color: '#9aa39d' }}>{at}</div>
    </div>
  );
}

function GpRow({ gp, onOpen }: { gp: GatePass; onOpen: () => void }) {
  const [h, setH] = useState(false);
  const plants = gp.lines.map(l => l.plantDesc || l.plantCode).join(', ');
  const st = gp.dnNo ? 'completed' : 'pending';
  return (
    <button onClick={onOpen} style={{ display: 'flex', width: '100%', textAlign: 'left', alignItems: 'center', gap: 12, padding: '13px 16px', border: 'none', borderBottom: `1px solid #f1f4f1`, background: h ? '#f7faf8' : '#fff', cursor: 'pointer', fontFamily: 'inherit' }}
      onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}>
      <div style={{ fontWeight: 700, fontSize: 13.5, color: '#123c2b', fontVariantNumeric: 'tabular-nums' }}>#{gp.no}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{gp.customerName}</div>
        <div style={{ fontSize: 12, color: '#7a857e', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{plants}</div>
      </div>
      <Chip st={st} />
    </button>
  );
}

function DnRow({ dn, onOpen, scanned, target }: { dn: DeliveryNote; onOpen: () => void; scanned: number; target: number }) {
  const [h, setH] = useState(false);
  return (
    <button onClick={onOpen} style={{ display: 'flex', width: '100%', textAlign: 'left', alignItems: 'center', gap: 12, padding: '13px 16px', border: 'none', borderBottom: `1px solid #f1f4f1`, background: h ? '#f7faf8' : '#fff', cursor: 'pointer', fontFamily: 'inherit' }}
      onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}>
      <div style={{ fontWeight: 700, fontSize: 13.5, color: C.red, fontVariantNumeric: 'tabular-nums' }}>No {dn.no}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{dn.customerProject}</div>
        <div style={{ fontSize: 12, color: '#7a857e' }}>{scanned}/{target} barcodes</div>
      </div>
      <Chip st={dn.status} />
    </button>
  );
}

function GpTableRow({ gp, onOpen }: { gp: GatePass; onOpen: () => void }) {
  const [h, setH] = useState(false);
  const plants = gp.lines.map(l => l.plantDesc || l.plantCode).join(', ');
  const total = gp.lines.reduce((a, l) => a + (Number(l.qty) || 0), 0);
  const st = gp.dnNo ? 'completed' : 'pending';
  return (
    <tr onClick={onOpen} style={{ cursor: 'pointer', borderTop: `1px solid #eef1ee`, background: h ? '#f7faf8' : undefined }}
      onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}>
      <td style={{ padding: '13px 16px', fontWeight: 700, color: '#123c2b', fontVariantNumeric: 'tabular-nums' }}>#{gp.no}</td>
      <td style={{ padding: '13px 16px' }}>
        <div style={{ fontWeight: 600, fontSize: 14 }}>{gp.customerName}</div>
        <div style={{ fontSize: 12, color: '#7a857e' }}>{gp.customerCode}</div>
      </td>
      <td style={{ padding: '13px 16px', fontSize: 13.5, color: '#46514a' }}>{gp.doDate}</td>
      <td style={{ padding: '13px 16px', fontSize: 13, color: '#46514a', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{plants}</td>
      <td style={{ padding: '13px 16px', textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{total}</td>
      <td style={{ padding: '13px 16px', fontSize: 13, color: '#46514a' }}>{gp.assignedTo.join(', ') || '—'}</td>
      <td style={{ padding: '13px 16px' }}><Chip st={st} /></td>
      <td style={{ padding: '13px 16px' }}><LastModified by={gp.modifiedBy} at={gp.modifiedAt} /></td>
    </tr>
  );
}

function CustomerTableRow({ c, onOpen }: { c: Customer; onOpen: () => void }) {
  const [h, setH] = useState(false);
  return (
    <tr onClick={onOpen} style={{ cursor: 'pointer', borderTop: `1px solid #eef1ee`, background: h ? '#f7faf8' : undefined }}
      onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}>
      <td style={{ padding: '13px 16px', fontWeight: 600, fontSize: 14 }}>{c.customerName}</td>
      <td style={{ padding: '13px 16px', fontSize: 13.5, color: '#46514a' }}>{(c.projects || []).join(', ')}</td>
      <td style={{ padding: '13px 16px' }}>
        <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 20, background: c.party === 'EXT' ? '#fbf0e0' : '#e8f0fe', color: c.party === 'EXT' ? C.amber : '#1a56c0' }}>
          {c.party}
        </span>
      </td>
      <td style={{ padding: '13px 16px', fontSize: 13.5, color: '#46514a' }}>{c.createdBy}</td>
      <td style={{ padding: '13px 16px', fontSize: 13.5, color: '#46514a' }}>{c.createdAt}</td>
      <td style={{ padding: '13px 16px' }}><LastModified by={c.modifiedBy} at={c.modifiedAt} /></td>
    </tr>
  );
}

function DnTableRow({ dn, onOpen, scanned, target }: { dn: DeliveryNote; onOpen: () => void; scanned: number; target: number }) {
  const [h, setH] = useState(false);
  const pct = target > 0 ? Math.min(100, (scanned / target) * 100) : 0;
  const locs = Array.from(new Set(dn.lines.map(l => l.location).filter(Boolean))).join(', ');
  return (
    <tr onClick={onOpen} style={{ cursor: 'pointer', borderTop: `1px solid #eef1ee`, background: h ? '#f7faf8' : undefined }}
      onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}>
      <td style={{ padding: '13px 16px', fontWeight: 700, color: C.red, fontVariantNumeric: 'tabular-nums' }}>{dn.no}</td>
      <td style={{ padding: '13px 16px', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{dn.gpNo}</td>
      <td style={{ padding: '13px 16px', fontWeight: 600, fontSize: 14 }}>{dn.customerProject}</td>
      <td style={{ padding: '13px 16px', fontSize: 13.5, color: '#46514a' }}>{locs}</td>
      <td style={{ padding: '13px 16px', fontSize: 13.5, color: '#46514a' }}>{dn.date}</td>
      <td style={{ padding: '13px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 64, height: 7, borderRadius: 5, background: '#eaeeea', overflow: 'hidden' }}>
            <div style={{ height: '100%', background: C.primary, width: pct + '%' }} />
          </div>
          <span style={{ fontSize: 12.5, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: '#46514a' }}>{scanned}/{target}</span>
        </div>
      </td>
      <td style={{ padding: '13px 16px' }}><Chip st={dn.status} /></td>
      <td style={{ padding: '13px 16px' }}><LastModified by={dn.modifiedBy} at={dn.modifiedAt} /></td>
    </tr>
  );
}

// ── Printable Plant Tag (standalone label, 25.4cm x 2.5cm) ──
// The @page override for this exact size is injected inline while this view
// is active (see the <style> tag in the admin_new_tag screen) rather than
// via a named CSS page — Chromium was inserting a spurious blank leading
// page when a named @page size was assigned to an element nested deep in
// the app's layout tree.
function PrintableTag({ tag, printRef }: {
  tag: { plantCode: string; plantName: string; srlNo: string; size: string; location: string; warehouse: string; date: string };
  printRef?: React.RefObject<HTMLDivElement | null>;
}) {
  const panelDivider: React.CSSProperties = { borderRight: '1px solid #888' };
  // Matches the existing external lookup system's QR format so tags printed
  // here scan the same way as their other labels — and so extractScanCode()
  // (which parses this exact ?s=A~B~C shape) can pull the serial back out.
  const qrUrl = `http://acaciallc.dyndns.org/index.php?s=${tag.plantCode}~${tag.srlNo}~${tag.size}`;
  return (
    <div
      ref={printRef}
      data-print-doc
      style={{ display: 'flex', width: '254mm', height: '25mm', boxSizing: 'border-box', border: '1px solid #888', background: '#fff', overflow: 'hidden', fontFamily: 'inherit' }}
    >
      <div style={{ ...panelDivider, flex: '0 0 24%', padding: '3mm 3mm', display: 'flex', gap: '2mm', alignItems: 'center', minWidth: 0 }}>
        <QrCode value={qrUrl} size={68} color="#000000" />
        <div style={{ fontSize: 8, lineHeight: 1.35, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 9.5 }}>{tag.plantCode}</div>
          <div style={{ marginTop: 1 }}>{tag.plantName}</div>
          <div style={{ marginTop: 4, fontWeight: 700 }}>SRL#:{tag.srlNo}</div>
          <div>Size: {tag.size}</div>
        </div>
      </div>
      <div style={{ ...panelDivider, flex: '0 0 29%', padding: '3mm 3mm', display: 'flex', gap: '2mm', alignItems: 'center', minWidth: 0 }}>
        <QrCode value={qrUrl} size={68} color="#000000" />
        <div style={{ fontSize: 8, lineHeight: 1.35, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 9.5 }}>{tag.plantCode}</div>
          <div style={{ marginTop: 1 }}>{tag.plantName}</div>
          <div style={{ marginTop: 4, fontWeight: 700 }}>Size :{tag.size}</div>
        </div>
      </div>
      <div style={{ flex: 1, padding: '3mm 4mm', display: 'flex', alignItems: 'center', justifyContent: 'space-between', minWidth: 0 }}>
        <div style={{ fontSize: 8, lineHeight: 1.4 }}>
          <div style={{ textAlign: 'right', color: '#333' }}>Date: {tag.date}</div>
          <div style={{ fontWeight: 700, marginTop: 4 }}>SRL#:{tag.srlNo}</div>
          <div>Location:{tag.location}</div>
          <div>Warehouse:{tag.warehouse}</div>
        </div>
        <Logo style={{ width: 68, height: 65, color: '#123c2b', flexShrink: 0 }} />
      </div>
    </div>
  );
}

function PrintableGP({ gp, printRef }: { gp: GatePass; printRef?: React.RefObject<HTMLDivElement | null> }) {
  return (
    <div ref={printRef} data-print-doc style={{ background: '#fff', border: '1px solid #e2e7e3', borderRadius: 10, maxWidth: 920, margin: '0 auto', padding: '34px 40px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 11, color: '#7a857e', fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase' }}>No.</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: C.red, fontVariantNumeric: 'tabular-nums' }}>{gp.no}</div>
        </div>
        <div style={{ textAlign: 'center', flex: 1 }}>
          <h2 style={{ fontFamily: 'var(--font-spectral),serif', fontWeight: 700, fontSize: 21, letterSpacing: '.06em', margin: 0, textTransform: 'uppercase' }}>Plants Gate Pass</h2>
        </div>
        <Logo style={{ width: 92, height: 73, color: '#123c2b' }} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 28px', margin: '22px 0 6px', fontSize: 13.5 }}>
        <Field label="Customer Name" value={gp.customerName} />
        <Field label="DO Date" value={gp.doDate} />
        <Field label="Customer Code" value={gp.customerCode} />
        <Field label="DO No." value={gp.doNo} />
        <Field label="Project" value={gp.project} />
        <Field label="LPO No." value={gp.lpoNo} />
        {gp.lpoDate && <Field label="LPO Date" value={gp.lpoDate} />}
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 14, border: '1px solid #cdd6d0' }}>
        <thead>
          <tr style={{ background: '#f3f6f3' }}>
            {['S.No', 'Plant Code', 'Plant Description', 'Pot L', 'Height M', 'Girth', 'Qty', 'Posted Qty', 'Remaining Qty', 'Location'].map(h => (
              <th key={h} style={{ border: '1px solid #cdd6d0', padding: 8, fontSize: 11, textTransform: 'uppercase', color: '#46514a', textAlign: h === 'Plant Description' ? 'left' : 'center' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {gp.lines.map(l => (
            <tr key={l.slNo}>
              <td style={{ border: '1px solid #cdd6d0', padding: 8, textAlign: 'center', fontSize: 13 }}>{l.slNo}</td>
              <td style={{ border: '1px solid #cdd6d0', padding: 8, textAlign: 'center', fontSize: 13 }}>{l.plantCode}</td>
              <td style={{ border: '1px solid #cdd6d0', padding: 8, fontSize: 13, fontWeight: 600 }}>{l.plantDesc}</td>
              <td style={{ border: '1px solid #cdd6d0', padding: 8, textAlign: 'center', fontSize: 13 }}>{l.potSize}</td>
              <td style={{ border: '1px solid #cdd6d0', padding: 8, textAlign: 'center', fontSize: 13 }}>{l.height}</td>
              <td style={{ border: '1px solid #cdd6d0', padding: 8, textAlign: 'center', fontSize: 13 }}>{l.girth}</td>
              <td style={{ border: '1px solid #cdd6d0', padding: 8, textAlign: 'center', fontSize: 13, fontWeight: 700 }}>{l.qty}</td>
              <td style={{ border: '1px solid #cdd6d0', padding: 8, textAlign: 'center', fontSize: 13, fontWeight: 700 }}>{l.postedQty ?? ''}</td>
              <td style={{ border: '1px solid #cdd6d0', padding: 8, textAlign: 'center', fontSize: 13, fontWeight: 700 }}>{l.remainingQty ?? ''}</td>
              <td style={{ border: '1px solid #cdd6d0', padding: 8, textAlign: 'center', fontSize: 13 }}>{l.location ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 36, fontSize: 13, color: '#46514a' }}>
        <div>Receiver&apos;s Name: <span style={{ display: 'inline-block', width: 180, borderBottom: '1px dotted #9aa39d' }} /></div>
        <div>For Acacia LLC — Authorised Signature</div>
      </div>
      <div style={{ marginTop: 18, fontSize: 11, color: '#9aa39d' }}>Note: Goods once sold cannot be returned / exchanged.</div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <span style={{ color: '#7a857e', minWidth: 96 }}>{label}</span>
      <b>{value}</b>
    </div>
  );
}

// ── Delivery Note header field: static text unless editMode is on ────────────
function DnHeaderField({ label, value, onChange, editMode, align, minWidth = 96, maxWidth }: {
  label: string; value: string; onChange: (v: string) => void; editMode: boolean;
  align?: 'right'; minWidth?: number; maxWidth?: number;
}) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: align === 'right' ? 'flex-end' : 'flex-start' }}>
      <span style={{ color: '#7a857e', minWidth }}>{label}</span>
      {editMode ? (
        <TInp value={value} onChange={onChange} placeholder="optional" style={{ fontWeight: 700, ...(maxWidth ? { maxWidth } : {}) }} />
      ) : (
        <b>{value || '—'}</b>
      )}
    </div>
  );
}

function ViewDeliveryNote({ dn, gp, role, scanned, target, onBack, onContinueScan, onRemoveSerial, onPrint, onSaveHeader, onSaveLine, onSaveDoRef, onSaveGpRefs, onRemoveLine, onAddAttachment, onRemoveAttachment }: {
  dn: DeliveryNote; gp: GatePass | null; role: string; scanned: number; target: number;
  onBack: () => void; onContinueScan: () => void;
  onRemoveSerial: (slNo: number, code: string) => void; onPrint: () => void;
  onSaveHeader: (dnNo: string, form: { customerProject: string; vhNumber: string; project: string; date: string }) => void;
  onSaveLine: (dnNo: string, slNo: number, form: { postedQty: string; remarks: string }) => void;
  onSaveDoRef: (dnNo: string, slNo: number, doRef: string) => void;
  onSaveGpRefs: (gpNo: string, form: { soRef: string; prRef: string; lpoNo: string }) => void;
  onRemoveLine: (dnNo: string, slNo: number) => void;
  onAddAttachment: (dnNo: string, file: { name: string; type: string; size: number; dataUrl: string }) => void;
  onRemoveAttachment: (dnNo: string, attachmentId: string) => void;
}) {
  const isComplete = dn.status === 'completed';
  const isScanning = dn.status === 'scanning';
  const printRef = useRef<HTMLDivElement | null>(null);
  const { downloading, shareMenuOpen, setShareMenuOpen, sharing, handleDownloadPdf, handleSharePdf, handleShareWhatsApp } = usePdfShare(printRef, { orientation: 'landscape', paginated: true });

  const [editMode, setEditMode] = useState(false);

  const [headerForm, setHeaderForm] = useState({ customerProject: dn.customerProject, vhNumber: dn.vhNumber, project: dn.project, date: dn.date });
  useEffect(() => {
    setHeaderForm({ customerProject: dn.customerProject, vhNumber: dn.vhNumber, project: dn.project, date: dn.date });
  }, [dn.no]);
  const updateHeaderField = (field: keyof typeof headerForm, v: string) => setHeaderForm(prev => ({ ...prev, [field]: v }));

  const [gpRefsForm, setGpRefsForm] = useState({ soRef: gp?.soRef || '', prRef: gp?.prRef || '', lpoNo: gp?.lpoNo || '' });
  useEffect(() => { setGpRefsForm({ soRef: gp?.soRef || '', prRef: gp?.prRef || '', lpoNo: gp?.lpoNo || '' }); }, [gp?.no]);
  const updateGpRefsField = (field: keyof typeof gpRefsForm, v: string) => setGpRefsForm(prev => ({ ...prev, [field]: v }));

  const [lineForm, setLineForm] = useState<Record<number, { postedQty: string; remarks: string }>>({});
  useEffect(() => {
    const obj: Record<number, { postedQty: string; remarks: string }> = {};
    dn.lines.forEach(l => { obj[l.slNo] = { postedQty: l.postedQty, remarks: l.remarks }; });
    setLineForm(obj);
  }, [dn]);
  const updateLineField = (slNo: number, field: 'postedQty' | 'remarks', v: string) =>
    setLineForm(prev => {
      const current = prev[slNo] || { postedQty: '', remarks: '' };
      return { ...prev, [slNo]: { ...current, [field]: v } };
    });

  const [pendingRemovals, setPendingRemovals] = useState<Set<number>>(new Set());
  useEffect(() => { setPendingRemovals(new Set()); }, [dn]);
  const toggleRemoveLine = (slNo: number) => setPendingRemovals(prev => {
    const next = new Set(prev);
    if (next.has(slNo)) next.delete(slNo);
    else next.add(slNo);
    return next;
  });

  // Mandatory DO Reference gate: fires once at Save time (not per line as you type) for any
  // line whose SYS Posted Qty just changed and still has no DO Reference.
  const [doRefModal, setDoRefModal] = useState<{ lines: DNLine[]; values: Record<number, string> } | null>(null);

  const attachFileRef = useRef<HTMLInputElement>(null);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [previewAttachment, setPreviewAttachment] = useState<DNAttachment | null>(null);
  const handleAttachFiles = async (files: FileList | null) => {
    if (!files || !files.length) return;
    setAttachError(null);
    setUploadingAttachment(true);
    try {
      for (const file of Array.from(files)) {
        if (file.size > MAX_ATTACHMENT_BYTES) {
          setAttachError(`"${file.name}" is too large — max 5MB per file`);
          continue;
        }
        const dataUrl = await readFileAsDataUrl(file);
        onAddAttachment(dn.no, { name: file.name, type: file.type, size: file.size, dataUrl });
      }
    } finally {
      setUploadingAttachment(false);
    }
  };

  const startEdit = () => setEditMode(true);
  const cancelEdit = () => {
    setHeaderForm({ customerProject: dn.customerProject, vhNumber: dn.vhNumber, project: dn.project, date: dn.date });
    setGpRefsForm({ soRef: gp?.soRef || '', prRef: gp?.prRef || '', lpoNo: gp?.lpoNo || '' });
    const obj: Record<number, { postedQty: string; remarks: string }> = {};
    dn.lines.forEach(l => { obj[l.slNo] = { postedQty: l.postedQty, remarks: l.remarks }; });
    setLineForm(obj);
    setPendingRemovals(new Set());
    setEditMode(false);
  };

  const finalizeSave = (doRefValues: Record<number, string> = {}) => {
    onSaveHeader(dn.no, headerForm);
    if (gp) onSaveGpRefs(gp.no, gpRefsForm);
    dn.lines.forEach(l => {
      if (pendingRemovals.has(l.slNo)) return;
      const form = lineForm[l.slNo];
      if (form) onSaveLine(dn.no, l.slNo, form);
      const doRefVal = doRefValues[l.slNo];
      if (doRefVal !== undefined) onSaveDoRef(dn.no, l.slNo, doRefVal);
    });
    pendingRemovals.forEach(slNo => onRemoveLine(dn.no, slNo));
    setEditMode(false);
    setDoRefModal(null);
  };

  const requestSave = () => {
    const changedLines = dn.lines.filter(l => {
      if (pendingRemovals.has(l.slNo)) return false;
      const form = lineForm[l.slNo];
      return !!form && form.postedQty !== l.postedQty;
    });
    const needingDoRef = changedLines.filter(l => !l.doRef);

    if (needingDoRef.length > 0) {
      setDoRefModal({ lines: needingDoRef, values: Object.fromEntries(needingDoRef.map(l => [l.slNo, ''])) });
    } else {
      finalizeSave();
    }
  };

  const submitDoRefModal = () => {
    if (!doRefModal) return;
    finalizeSave(doRefModal.values);
  };
  const doRefModalIncomplete = doRefModal ? doRefModal.lines.some(l => !doRefModal.values[l.slNo]?.trim()) : true;

  const dnPdfFilename = `DeliveryNote-${dn.no}.pdf`;
  const dnShareTitle = `Delivery Note ${dn.no}`;
  const dnShareText = `Delivery Note ${dn.no} — ${dn.customerProject}`;

  // Printed/PDF output is a single A4 sheet carrying two identical copies of the
  // note (upper + lower half) so it can be torn in two — one copy for the
  // customer, one for the office. Rendering the same closure twice keeps the
  // halves guaranteed-identical instead of hand-syncing two copies of markup.
  const renderDnCopy = () => (
    <>
      <div style={{ textAlign: 'center', position: 'relative' }}>
        <div style={{ position: 'absolute', right: 0, top: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <Logo style={{ width: 98, height: 78, color: '#123c2b' }} />
          <QrCode value={dn.no} size={44} color="#b9c2bc" />
        </div>
        <div style={{ fontWeight: 800, fontSize: 22 }}>Acacia LLC</div>
        <h2 style={{ fontFamily: 'var(--font-spectral),serif', fontWeight: 700, fontSize: 24, margin: '10px 0 0', textDecoration: 'underline', textUnderlineOffset: 5 }}>Delivery Note</h2>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 28px', margin: '26px 0 6px', fontSize: 14, alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 8 }}><span style={{ color: '#7a857e' }}>No:</span><b style={{ color: C.red, fontSize: 16 }}>{dn.no}</b></div>
        <DnHeaderField label="Date" value={headerForm.date} onChange={v => updateHeaderField('date', v)} editMode={editMode} minWidth={40} />
        <DnHeaderField label="Customer / Project" value={headerForm.customerProject} onChange={v => updateHeaderField('customerProject', v)} editMode={editMode} />
        <DnHeaderField label="Vehicle No." value={headerForm.vhNumber} onChange={v => updateHeaderField('vhNumber', v)} editMode={editMode} />
        <DnHeaderField label="Project:" value={headerForm.project} onChange={v => updateHeaderField('project', v)} editMode={editMode} maxWidth={180} />
        <DnHeaderField label="SO Reference" value={gpRefsForm.soRef} onChange={v => updateGpRefsField('soRef', v)} editMode={editMode} />
        <DnHeaderField label="PR Ref." value={gpRefsForm.prRef} onChange={v => updateGpRefsField('prRef', v)} editMode={editMode} />
        <DnHeaderField label="PO No." value={gpRefsForm.lpoNo} onChange={v => updateGpRefsField('lpoNo', v)} editMode={editMode} />
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 14, border: '1px solid #1f2a24' }}>
        <thead>
          <tr>
            {['Sl.no', 'Plant Name', 'Specification', 'Qty', 'SYS Posted Qty', 'Remaining Qty', 'Status', 'Location', 'DO Reference', 'Remarks', ''].map((h, i) => (
              <th
                key={h}
                data-print-hide={[4, 5, 6, 8, 9, 10].includes(i) || undefined}
                style={{ border: '1px solid #1f2a24', padding: 9, fontSize: 12, textAlign: i === 1 ? 'left' : 'center', width: i === 0 ? 54 : i === 3 ? 70 : i === 10 ? 34 : undefined }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(() => {
            const visibleLineCount = dn.lines.filter(l => !pendingRemovals.has(l.slNo)).length;
            const mainLines = dn.lines.filter(l => !l.isPending);
            const pendingLines = dn.lines.filter(l => l.isPending);

            const renderRow = (ln: DNLine, displaySlNo: number) => {
              const marked = pendingRemovals.has(ln.slNo);
              const status = lineStatus(ln.postedQty, ln.deliveryQty);
              const rowStyle: React.CSSProperties = marked ? { opacity: 0.45, textDecoration: 'line-through' } : {};
              return (
                <tr key={ln.slNo} style={rowStyle}>
                  <td style={{ border: '1px solid #1f2a24', padding: 9, textAlign: 'center', fontSize: 13.5 }}>{displaySlNo}</td>
                  <td style={{ border: '1px solid #1f2a24', padding: 9, fontSize: 13.5, fontWeight: 600 }}>{ln.plantName}</td>
                  <td style={{ border: '1px solid #1f2a24', padding: 9, textAlign: 'center', fontSize: 13.5 }}>{ln.spec}</td>
                  <td style={{ border: '1px solid #1f2a24', padding: 9, textAlign: 'center', fontSize: 13.5, fontWeight: 700 }}>{ln.deliveryQty}</td>
                  <td data-print-hide style={{ border: '1px solid #1f2a24', padding: 6, textAlign: 'center' }}>
                    {role === 'admin' && editMode && !marked ? (
                      <TInp
                        value={lineForm[ln.slNo]?.postedQty ?? ln.postedQty}
                        onChange={v => updateLineField(ln.slNo, 'postedQty', v)}
                        style={{ textAlign: 'center' }}
                      />
                    ) : (
                      <span style={{ fontSize: 13.5 }}>{ln.postedQty}</span>
                    )}
                  </td>
                  <td data-print-hide style={{ border: '1px solid #1f2a24', padding: 9, textAlign: 'center', fontSize: 13.5 }}>{ln.remainingQty}</td>
                  <td data-print-hide style={{ border: '1px solid #1f2a24', padding: 9, textAlign: 'center' }}>
                    <span style={{ fontSize: 10.5, fontWeight: 700, padding: '3px 8px', borderRadius: 20, ...statusColors(status) }}>
                      {marked ? 'REMOVING' : status.toUpperCase()}
                    </span>
                  </td>
                  <td style={{ border: '1px solid #1f2a24', padding: 9, textAlign: 'center', fontSize: 13.5 }}>{ln.location}</td>
                  <td data-print-hide style={{ border: '1px solid #1f2a24', padding: 9, textAlign: 'center', fontSize: 13.5 }}>{ln.doRef || '—'}</td>
                  <td data-print-hide style={{ border: '1px solid #1f2a24', padding: 6 }}>
                    {editMode && !marked ? (
                      <TInp
                        value={lineForm[ln.slNo]?.remarks ?? ln.remarks}
                        onChange={v => updateLineField(ln.slNo, 'remarks', v)}
                        placeholder="optional"
                      />
                    ) : (
                      <span style={{ fontSize: 13.5 }}>{ln.remarks || '—'}</span>
                    )}
                  </td>
                  <td data-print-hide style={{ border: '1px solid #1f2a24', padding: 9, textAlign: 'center' }}>
                    {role === 'admin' && editMode && ln.serials.length === 0 && (marked || visibleLineCount > 1) ? (
                      <button
                        onClick={() => toggleRemoveLine(ln.slNo)}
                        title={marked ? 'Undo — keep this line' : 'Cancel this line (applied on Save)'}
                        style={{ background: 'none', border: 'none', color: marked ? C.primary : '#c46', fontSize: marked ? 13 : 17, fontWeight: marked ? 700 : 400, cursor: 'pointer', lineHeight: 1, fontFamily: 'inherit', padding: 0 }}
                      >
                        {marked ? '↺' : '×'}
                      </button>
                    ) : null}
                  </td>
                </tr>
              );
            };

            return (
              <>
                {mainLines.map(ln => renderRow(ln, ln.slNo))}
                {pendingLines.length > 0 && (
                  <tr>
                    <td colSpan={11} style={{ border: '1px solid #1f2a24', padding: '7px 9px', fontSize: 11.5, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', background: '#f6f8f6', color: '#5b6660' }}>
                      Pending Item
                    </td>
                  </tr>
                )}
                {pendingLines.map((ln, i) => renderRow(ln, i + 1))}
              </>
            );
          })()}
        </tbody>
      </table>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 40, fontSize: 13.5, color: '#46514a' }}>
        <div>Prepared By: <b>{dn.preparedBy}</b></div>
        <div>Received By: <span style={{ display: 'inline-block', width: 160, borderBottom: '1px dotted #9aa39d' }} /></div>
      </div>
      <div style={{ marginTop: 10, fontSize: 10.5, color: '#9aa39d' }}>Gate Pass No: {dn.gpNo} (for reference)</div>
      <div style={{ marginTop: 18, fontSize: 11, color: '#9aa39d' }}>Note: Goods once sold cannot be returned / exchanged.</div>
    </>
  );

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }} data-print-hide>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#5b6660', fontWeight: 600, fontSize: 13.5, cursor: 'pointer', fontFamily: 'inherit' }}>← Back</button>
        <div style={{ display: 'flex', gap: 10 }}>
          <Btn onClick={() => handleDownloadPdf(dnPdfFilename)} disabled={downloading} style={{ background: '#fff', border: `1px solid ${C.primary}`, color: C.primary, borderRadius: 9, padding: '10px 18px', fontSize: 14, fontWeight: 700, cursor: downloading ? 'default' : 'pointer', opacity: downloading ? 0.6 : 1 }}>
            {downloading ? 'Preparing PDF…' : 'Download PDF'}
          </Btn>
          <div style={{ position: 'relative' }}>
            <Btn onClick={() => setShareMenuOpen(o => !o)} disabled={sharing} style={{ background: '#fff', border: `1px solid ${C.primary}`, color: C.primary, borderRadius: 9, padding: '10px 18px', fontSize: 14, fontWeight: 700, cursor: sharing ? 'default' : 'pointer', opacity: sharing ? 0.6 : 1 }}>
              {sharing ? 'Preparing…' : 'Share ▾'}
            </Btn>
            {shareMenuOpen && (
              <>
                <div onClick={() => setShareMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
                <div style={{ position: 'absolute', top: '110%', right: 0, background: C.white, border: '1px solid #d7ddd9', borderRadius: 10, boxShadow: '0 10px 26px rgba(0,0,0,.12)', minWidth: 190, zIndex: 50, overflow: 'hidden' }}>
                  <button onClick={() => handleSharePdf(dnPdfFilename, dnShareTitle, dnShareText)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px', border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13.5, color: C.text }}>
                    Share as PDF
                  </button>
                  <button onClick={() => handleShareWhatsApp(dnPdfFilename, dnShareTitle, dnShareText, `${dnShareText} — PDF downloaded, attach it here.`)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px', border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13.5, color: C.text }}>
                    WhatsApp
                  </button>
                  <button onClick={() => { setShareMenuOpen(false); onPrint(); }} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px', border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13.5, color: C.text }}>
                    Send to Printer
                  </button>
                </div>
              </>
            )}
          </div>
          <Btn onClick={onPrint} style={{ background: C.primary, color: C.white, border: 'none', borderRadius: 9, padding: '10px 18px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }} hov={{ background: C.ph }}>
            Print Delivery Note
          </Btn>
        </div>
      </div>

      {/* Printable DN — single copy on screen, in PDF, and in print. Print/PDF render
          on A4 landscape (see .dn-print-landscape in globals.css and the 'landscape'
          orientation passed to usePdfShare below) since the table is wide. */}
      <div ref={printRef} data-print-doc className="dn-print-landscape" style={{ background: '#fff', border: '1px solid #e2e7e3', borderRadius: 10, maxWidth: 920, margin: '0 auto', padding: '34px 44px' }}>
        {renderDnCopy()}
        <div data-print-hide style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 24 }}>
          {(isScanning || isComplete) && (
            <Btn onClick={onContinueScan} style={{ background: C.white, border: '1px solid #cfd8d2', color: C.primary, borderRadius: 9, padding: '10px 18px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
              Scanner
            </Btn>
          )}
          <Btn onClick={() => exportDnScanSheet(dn)} style={{ background: C.white, border: `1px solid ${C.primary}`, color: C.primary, borderRadius: 9, padding: '10px 18px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
            QR Code
          </Btn>
          {editMode ? (
            <>
              <Btn onClick={cancelEdit} style={{ background: C.white, border: `1px solid #cfd8d2`, color: '#46514a', borderRadius: 9, padding: '10px 18px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                Cancel
              </Btn>
              <Btn onClick={requestSave} style={{ background: C.primary, color: C.white, border: 'none', borderRadius: 9, padding: '10px 20px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }} hov={{ background: C.ph }}>
                Save
              </Btn>
            </>
          ) : (
            <Btn onClick={startEdit} style={{ background: C.white, border: `1px solid ${C.primary}`, color: C.primary, borderRadius: 9, padding: '10px 18px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
              Edit
            </Btn>
          )}
        </div>
      </div>

      {/* Linked barcodes */}
      <div data-print-hide style={{ background: '#fff', border: '1px solid #e2e7e3', borderRadius: 12, maxWidth: 920, margin: '18px auto 0', overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #eef1ee', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>Linked Barcodes</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.primary, fontVariantNumeric: 'tabular-nums' }}>{scanned} / {target} scanned</div>
        </div>
        <div style={{ padding: '8px 20px 20px' }}>
          {dn.lines.map(ln => {
            const sc = ln.serials.length, t = ln.deliveryQty;
            const chip = sc >= t ? { background: '#e0f0e8', color: C.primary } : { background: '#fbf0e0', color: C.amber };
            return (
              <div key={ln.slNo} style={{ padding: '14px 0', borderBottom: '1px solid #f1f4f1' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{ln.slNo}. {ln.plantName} <span style={{ color: '#9aa39d', fontWeight: 500 }}>· {ln.spec}</span></div>
                  <span style={{ fontSize: 12.5, fontWeight: 700, padding: '3px 10px', borderRadius: 20, ...chip }}>{sc}/{t}</span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                  {ln.serials.map(code => (
                    <span key={code} style={{ fontFamily: 'ui-monospace,monospace', fontSize: 12, background: '#f1f5f2', border: '1px solid #dde6df', color: '#2c3a32', padding: '4px 9px', borderRadius: 6, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                      {code}
                      <button onClick={() => onRemoveSerial(ln.slNo, code)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#c46', fontSize: 14, lineHeight: 1, padding: 0, marginLeft: 2, fontFamily: 'inherit' }}>×</button>
                    </span>
                  ))}
                  {ln.serials.length === 0 && <span style={{ fontSize: 12.5, color: C.amber }}>No barcodes scanned yet</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Attachments (Photo / Excel / PDF reference files) — not part of the printable document */}
      <div data-print-hide style={{ background: '#fff', border: '1px solid #e2e7e3', borderRadius: 12, maxWidth: 920, margin: '18px auto 0', overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #eef1ee', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>Attachments</div>
          <Btn onClick={() => attachFileRef.current?.click()} disabled={uploadingAttachment} style={{ background: C.white, border: `1px solid ${C.primary}`, color: C.primary, borderRadius: 9, padding: '8px 14px', fontSize: 13, fontWeight: 700, cursor: uploadingAttachment ? 'default' : 'pointer', opacity: uploadingAttachment ? 0.6 : 1 }}>
            {uploadingAttachment ? 'Uploading…' : '⇪ Add File'}
          </Btn>
          <input
            ref={attachFileRef}
            type="file"
            multiple
            accept=".pdf,.jpg,.jpeg,.png,.xlsx,.xls"
            style={{ display: 'none' }}
            onChange={e => { handleAttachFiles(e.target.files); e.target.value = ''; }}
          />
        </div>
        <div style={{ padding: '8px 20px 20px' }}>
          {attachError && <div style={{ color: '#c46', fontSize: 12.5, margin: '8px 0' }}>{attachError}</div>}
          {dn.attachments.length === 0 && !attachError && (
            <div style={{ padding: '14px 0' }}><Empty text="No attachments yet — add photos, Excel sheets, or PDFs." /></div>
          )}
          {dn.attachments.map(a => (
            <div key={a.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #f1f4f1' }}>
              <button
                onClick={() => a.type.startsWith('image/') ? setPreviewAttachment(a) : downloadDataUrl(a.dataUrl, a.name)}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}
              >
                <span style={{ fontSize: 13.5, fontWeight: 600, color: C.primary }}>{a.name}</span>
                <span style={{ fontSize: 11.5, color: '#9aa39d' }}>{formatBytes(a.size)} · {a.uploadedBy} · {a.uploadedAt}</span>
              </button>
              <button onClick={() => onRemoveAttachment(dn.no, a.id)} style={{ background: 'none', border: 'none', color: '#c46', fontSize: 17, cursor: 'pointer', lineHeight: 1, fontFamily: 'inherit', padding: '0 4px' }}>×</button>
            </div>
          ))}
        </div>
      </div>

      {previewAttachment && (
        <div
          data-print-hide
          onClick={() => setPreviewAttachment(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(20,30,24,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}
        >
          <div onClick={e => e.stopPropagation()} style={{ background: C.white, borderRadius: 14, padding: 16, boxShadow: '0 24px 60px rgba(0,0,0,.3)', maxWidth: '90vw' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 20 }}>
              <span style={{ fontSize: 13.5, fontWeight: 600 }}>{previewAttachment.name}</span>
              <button onClick={() => setPreviewAttachment(null)} style={{ background: 'none', border: 'none', color: '#5b6660', fontSize: 18, cursor: 'pointer', lineHeight: 1, fontFamily: 'inherit' }}>×</button>
            </div>
            <img src={previewAttachment.dataUrl} alt={previewAttachment.name} style={{ display: 'block', maxWidth: 320, maxHeight: 320, borderRadius: 8, objectFit: 'contain' }} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
              <Btn onClick={() => downloadDataUrl(previewAttachment.dataUrl, previewAttachment.name)} style={{ background: C.white, border: `1px solid ${C.primary}`, color: C.primary, borderRadius: 9, padding: '8px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                Download
              </Btn>
            </div>
          </div>
        </div>
      )}

      {doRefModal && (
        <div data-print-hide style={{ position: 'fixed', inset: 0, background: 'rgba(20,30,24,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: C.white, borderRadius: 14, maxWidth: 440, width: '90%', padding: '22px 24px', boxShadow: '0 24px 60px rgba(0,0,0,.3)' }}>
            <h3 style={{ fontFamily: 'var(--font-spectral),serif', fontWeight: 600, fontSize: 19, margin: '0 0 4px' }}>DO Reference Required</h3>
            <p style={{ margin: '0 0 18px', color: C.muted, fontSize: 13 }}>
              SYS Posted Qty changed for {doRefModal.lines.length === 1 ? 'this line' : 'these lines'} — DO Reference is mandatory before saving.
            </p>
            {doRefModal.lines.map(l => (
              <div key={l.slNo} style={{ marginBottom: 14 }}>
                <FieldLabel>{l.slNo}. {l.plantName} — DO Reference *</FieldLabel>
                <Inp
                  value={doRefModal.values[l.slNo] ?? ''}
                  onChange={v => setDoRefModal(prev => prev && { ...prev, values: { ...prev.values, [l.slNo]: v } })}
                  placeholder="required"
                />
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 6 }}>
              <Btn onClick={() => setDoRefModal(null)} style={{ background: C.white, border: `1px solid #cfd8d2`, color: '#46514a', borderRadius: 9, padding: '10px 18px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                Cancel
              </Btn>
              <Btn
                onClick={submitDoRefModal}
                disabled={doRefModalIncomplete}
                style={{ background: doRefModalIncomplete ? '#a9c9b6' : C.primary, color: C.white, border: 'none', borderRadius: 9, padding: '10px 20px', fontSize: 14, fontWeight: 700, cursor: doRefModalIncomplete ? 'default' : 'pointer' }}
                hov={doRefModalIncomplete ? undefined : { background: C.ph }}
              >
                Save
              </Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function GardenTaskCard({ gp, onStart }: { gp: GatePass; onStart: () => void }) {
  const plants = gp.lines.map(l => l.plantDesc || l.plantCode).join(', ');
  const total = gp.lines.reduce((a, l) => a + (Number(l.qty) || 0), 0);
  return (
    <div style={{ background: '#fff', border: '1px solid #e2e7e3', borderRadius: 12, padding: 18, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 12, color: '#7a857e', fontWeight: 600 }}>Gate Pass</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#123c2b' }}>#{gp.no}</div>
        </div>
        <Chip st="pending" />
      </div>
      <div style={{ margin: '12px 0', fontSize: 13.5 }}>
        <div style={{ fontWeight: 700 }}>{gp.customerName}</div>
        <div style={{ color: '#7a857e', fontSize: 12.5 }}>{gp.customerCode} · {gp.doDate}</div>
      </div>
      <div style={{ fontSize: 13, color: '#46514a', background: '#f6f8f6', borderRadius: 8, padding: '10px 12px', flex: 1 }}>
        {plants}
        <div style={{ marginTop: 6, fontSize: 12, color: '#7a857e' }}>{gp.lines.length} item(s) · {total} plants</div>
      </div>
      <Btn onClick={onStart} style={{ marginTop: 14, background: C.primary, color: '#fff', border: 'none', borderRadius: 9, padding: 11, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }} hov={{ background: C.ph }}>
        Generate Delivery Note →
      </Btn>
    </div>
  );
}

function GardenDnCard({ dn, scanned, target, onScan, onView }: {
  dn: DeliveryNote; scanned: number; target: number; onScan: () => void; onView: () => void;
}) {
  const locs = Array.from(new Set(dn.lines.map(l => l.location).filter(Boolean))).join(', ');
  return (
    <div style={{ background: '#fff', border: '1px solid #e2e7e3', borderRadius: 12, padding: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 12, color: '#7a857e', fontWeight: 600 }}>Delivery Note</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: C.red }}>No {dn.no}</div>
        </div>
        <Chip st={dn.status} />
      </div>
      <div style={{ margin: '12px 0', fontSize: 13.5 }}>
        <div style={{ fontWeight: 700 }}>{dn.customerProject}</div>
        <div style={{ color: '#7a857e', fontSize: 12.5 }}>{locs ? locs + ' · ' : ''}{dn.vhNumber}</div>
      </div>
      <ProgBar scanned={scanned} target={target} />
      <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
        <Btn onClick={onScan} style={{ flex: 1, background: C.primary, color: '#fff', border: 'none', borderRadius: 9, padding: 11, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }} hov={{ background: C.ph }}>
          Open Scanner →
        </Btn>
        <Btn onClick={onView} style={{ flex: 1, background: '#fff', border: `1px solid ${C.primary}`, color: C.primary, borderRadius: 9, padding: 11, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
          View DO →
        </Btn>
      </div>
    </div>
  );
}

function ScanScreen({
  dn, activeSlNo, scanInput, feedback, inputRef,
  onScanInput, onScanKey, onSimulate, onSelectLine, onRemoveSerial, onComplete, onBack,
}: {
  dn: DeliveryNote; activeSlNo: number;
  scanInput: string; feedback: { msg: string; ok: boolean } | null;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onScanInput: (v: string) => void;
  onScanKey: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onSimulate: () => void;
  onSelectLine: (slNo: number) => void;
  onRemoveSerial: (slNo: number, code: string) => void;
  onComplete: () => void;
  onBack: () => void;
}) {
  const totalScanned = dn.lines.reduce((a, l) => a + l.serials.length, 0);
  const totalTarget  = dn.lines.reduce((a, l) => a + l.deliveryQty, 0);
  const allDone = totalScanned >= totalTarget;
  const activeLine = dn.lines.find(l => l.slNo === activeSlNo);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#5b6660', fontWeight: 600, fontSize: 13.5, cursor: 'pointer', fontFamily: 'inherit' }}>← Back</button>
        <Btn onClick={() => exportDnScanSheet(dn)} style={{ background: C.white, border: `1px solid ${C.primary}`, color: C.primary, borderRadius: 9, padding: '9px 16px', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>
          QR Code
        </Btn>
      </div>
      <div className="gp-scan-grid" style={{ display: 'grid', gridTemplateColumns: '1.15fr 1fr', gap: 20, alignItems: 'start' }}>

        {/* Scanner panel */}
        <div>
          <div style={{ background: '#123c2b', color: '#fff', borderRadius: 14, padding: 22 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <div style={{ fontSize: 12.5, color: '#a9c9b6', fontWeight: 600 }}>Delivery Note No {dn.no} · {dn.customerProject}</div>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: '#e9d9a6' }}>{totalScanned}/{totalTarget} total</div>
            </div>
            <div style={{ fontSize: 13, color: '#cfe3d6', marginBottom: 14 }}>
              Scanning into: <b style={{ color: '#fff' }}>{activeLine?.plantName || '—'}</b>
            </div>
            <div style={{ background: 'rgba(255,255,255,.08)', border: '1.5px dashed rgba(233,217,166,.5)', borderRadius: 11, padding: 18, textAlign: 'center' }}>
              <div style={{ fontSize: 28, lineHeight: 1, marginBottom: 8, letterSpacing: 4, color: '#e9d9a6', fontFamily: 'ui-monospace,monospace' }}>▮▏▮▮▏▮▕▏▮</div>
              <input
                ref={inputRef as React.RefObject<HTMLInputElement>}
                value={scanInput}
                onChange={e => onScanInput(e.target.value)}
                onKeyDown={onScanKey}
                placeholder="Scan or type barcode, then Enter"
                style={{ width: '100%', maxWidth: 360, padding: '12px 14px', borderRadius: 9, border: 'none', fontSize: 16, textAlign: 'center', fontFamily: 'ui-monospace,monospace', outline: 'none', color: '#19211d' }}
              />
              <div style={{ fontSize: 12, color: '#a9c9b6', marginTop: 9 }}>Hardware scanner auto-submits on scan</div>
              <button
                onClick={onSimulate}
                style={{ marginTop: 12, background: '#e9d9a6', color: '#123c2b', border: 'none', borderRadius: 8, padding: '9px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                ⌁ Simulate scan
              </button>
            </div>

            {/* Feedback */}
            {feedback && (
              <div style={{ marginTop: 14, padding: '10px 14px', borderRadius: 8, background: feedback.ok ? 'rgba(0,200,100,.15)' : 'rgba(255,80,80,.15)', color: feedback.ok ? '#7fffb0' : '#ffaaaa', fontWeight: 600, fontSize: 13.5 }}>
                {feedback.msg}
              </div>
            )}
          </div>

          {/* Complete button */}
          {allDone ? (
            <Btn onClick={onComplete} style={{ width: '100%', marginTop: 16, background: C.primary, color: '#fff', border: 'none', borderRadius: 11, padding: 15, fontSize: 16, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }} hov={{ background: C.ph }}>
              ✓ Complete Delivery Note {dn.no}
            </Btn>
          ) : (
            <div style={{ marginTop: 16, textAlign: 'center', fontSize: 13, color: '#7a857e' }}>
              Scan all required barcodes to complete · <b>{totalTarget - totalScanned}</b> remaining
            </div>
          )}
        </div>

        {/* Line list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {dn.lines.map(ln => {
            const sc = ln.serials.length, t = ln.deliveryQty;
            const pct = t > 0 ? Math.min(100, (sc / t) * 100) : 0;
            const isActive = ln.slNo === activeSlNo;
            const done = sc >= t;
            const chip = done ? { background: '#e0f0e8', color: C.primary } : { background: '#fbf0e0', color: C.amber };
            const cardStyle: React.CSSProperties = {
              border: `${isActive ? 2 : 1}px solid ${isActive ? C.primary : '#e2e7e3'}`,
              borderRadius: 12, padding: 16, cursor: 'pointer', background: isActive ? '#f4faf7' : '#fff',
            };
            return (
              <div key={ln.slNo} style={cardStyle} onClick={() => !done && onSelectLine(ln.slNo)}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontWeight: 700, fontSize: 14.5 }}>{ln.slNo}. {ln.plantName}</div>
                  <span style={{ fontSize: 12.5, fontWeight: 800, padding: '3px 11px', borderRadius: 20, ...chip }}>{sc}/{t}</span>
                </div>
                <div style={{ fontSize: 12, color: '#7a857e', marginTop: 2 }}>{ln.spec}</div>
                <div style={{ height: 7, borderRadius: 5, background: '#eaeeea', overflow: 'hidden', margin: '10px 0' }}>
                  <div style={{ height: '100%', background: C.primary, width: pct + '%', transition: 'width .3s' }} />
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {ln.serials.map(code => (
                    <span key={code} style={{ fontFamily: 'ui-monospace,monospace', fontSize: 11.5, background: '#f1f5f2', border: '1px solid #dde6df', color: '#2c3a32', padding: '3px 7px', borderRadius: 6, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                      {code}
                      <button onClick={e => { e.stopPropagation(); onRemoveSerial(ln.slNo, code); }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#c46', fontSize: 13, lineHeight: 1, padding: 0, fontFamily: 'inherit' }}>×</button>
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
