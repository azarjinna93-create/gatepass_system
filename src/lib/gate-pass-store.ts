// Acacia LLC Gate Pass System — TypeScript data store
// Two modes: local (localStorage) and api (Express backend).
// Set NEXT_PUBLIC_API_URL to use the shared database API.

import { nanoid } from 'nanoid';

export interface GPLine {
  slNo: number;
  plantCode: string;
  plantDesc: string;
  potSize: string;
  height: string;
  girth: string;
  qty: string;
  postedQty: string;
  remainingQty: string;
  location: string;
}

export interface GatePass {
  no: string;
  doNo: string;
  doDate: string;
  lpoNo: string;
  lpoDate: string;
  prRef: string;
  soRef: string;
  customerName: string;
  customerCode: string;
  project: string;
  party: string;
  createdBy: string;
  createdAt: string;
  modifiedBy: string | null;
  modifiedAt: string | null;
  dnNo: string | null;
  assignedTo: string[];
  lines: GPLine[];
}

export interface DNLine {
  slNo: number;
  plantName: string;
  plantCode: string;
  spec: string;
  qty: number;
  deliveryQty: number;
  postedQty: string;
  remainingQty: string;
  remarks: string;
  location: string;
  serials: string[];
  hasSplit: boolean;
  isPending: boolean;
  doRef: string;
}

export interface DNAttachment {
  id: string;
  name: string;
  type: string;
  size: number;
  dataUrl: string;
  uploadedBy: string;
  uploadedAt: string;
}

export interface DeliveryNote {
  no: string;
  gpNo: string;
  customerProject: string;
  customerCode: string;
  date: string;
  vhNumber: string;
  project: string;
  preparedBy: string;
  modifiedBy: string | null;
  modifiedAt: string | null;
  status: 'scanning' | 'completed';
  lines: DNLine[];
  attachments: DNAttachment[];
}

export interface Customer {
  id: string;
  customerName: string;
  projects: string[];
  party: 'EXT' | 'INT';
  createdBy: string;
  createdAt: string;
  modifiedBy: string | null;
  modifiedAt: string | null;
}

export interface PlantMaster {
  id: string;
  category: string;
  plantName: string;
  createdBy: string;
  createdAt: string;
  modifiedBy: string | null;
  modifiedAt: string | null;
}

export interface LocationMaster {
  id: string;
  name: string;
  createdBy: string;
  createdAt: string;
  modifiedBy: string | null;
  modifiedAt: string | null;
}

export interface UserAccount {
  id: string;
  username: string;
  password: string;
  role: 'admin' | 'garden';
  createdBy: string;
  createdAt: string;
  modifiedBy: string | null;
  modifiedAt: string | null;
}

export interface LpoSoMapping {
  id: string;
  customerName: string;
  project: string;
  poNo: string;
  soRef: string;
  createdBy: string;
  createdAt: string;
  modifiedBy: string | null;
  modifiedAt: string | null;
}

export interface NumberSettings {
  gpPrefix: string;
  gpNext: number;
  dnPrefix: string;
  dnNext: number;
}

export interface ReprintLog {
  id: string;
  docType: 'gp' | 'dn';
  docNo: string;
  customerProject: string;
  createdBy: string;
  createdAt: string;
}

// Standalone plant tag / label print (not tied to a Gate Pass or Delivery Note) —
// scanned SRL# is checked for duplicates before a new tag is created.
export interface PlantTag {
  id: string;
  plantCode: string;
  plantName: string;
  srlNo: string;
  size: string;
  location: string;
  warehouse: string;
  createdBy: string;
  createdAt: string;
}

// Onhand inventory snapshot (bulk-imported from an ERP export) — re-uploading
// replaces the whole table rather than accumulating, since this represents a
// point-in-time stock snapshot, not an accumulating master list.
export interface OnhandItem {
  id: string;
  style: string;
  itemNumber: string;
  itemName: string;
  searchName: string;
  size: string;
  color: string;
  site: string;
  warehouse: string;
  location: string;
  physicalInventory: number;
  unitRate: number;
}

export interface AppData {
  gps: GatePass[];
  dns: DeliveryNote[];
  customers: Customer[];
  plants: PlantMaster[];
  locations: LocationMaster[];
  users: UserAccount[];
  numberSettings: NumberSettings;
  lpoSoMappings: LpoSoMapping[];
  reprintLogs: ReprintLog[];
  plantTags: PlantTag[];
  onhandItems: OnhandItem[];
}


export type AuthUser = { name: string; role: 'admin' | 'garden' };

export type GatePassForm = {
  customerName: string;
  customerCode: string;
  doNo: string;
  doDate: string;
  lpoNo: string;
  lpoDate: string;
  prRef: string;
  soRef: string;
  project: string;
  party: string;
  assignedTo: string[];
  lines: Array<{ plantCode: string; plantDesc: string; potSize: string; height: string; girth: string; qty: string; postedQty: string; remainingQty: string; location: string }>;
};

export type DeliveryNoteForm = {
  gpNo: string;
  customerProject: string;
  date: string;
  vhNumber: string;
  project: string;
  lines: Array<{ slNo: number; deliveryQty: number; remarks: string; location: string }>;
};

export interface DataStore {
  auth: AuthUser | null;
  login(username: string, password: string): Promise<AuthUser>;
  logout(): Promise<void> | void;
  loadAll(): Promise<AppData>;
  getNumberSettings(): Promise<NumberSettings>;
  updateNumberSettings(settings: NumberSettings): Promise<NumberSettings>;
  createGatePass(form: GatePassForm): Promise<GatePass>;
  updateGatePass(no: string, form: GatePassForm): Promise<GatePass>;
  createDeliveryNote(form: DeliveryNoteForm): Promise<DeliveryNote>;
  updateDeliveryNoteHeader(dnNo: string, form: { customerProject: string; vhNumber: string; project: string; date: string }): Promise<DeliveryNote>;
  updateDeliveryNoteLine(dnNo: string, slNo: number, form: { postedQty: string; remarks: string }): Promise<DeliveryNote>;
  updateDeliveryNoteLineDoRef(dnNo: string, slNo: number, doRef: string): Promise<DeliveryNote>;
  updateGatePassHeaderRefs(gpNo: string, form: { soRef: string; prRef: string; lpoNo: string }): Promise<GatePass>;
  splitDeliveryNoteLine(dnNo: string, slNo: number): Promise<DeliveryNote>;
  removeDeliveryNoteLine(dnNo: string, slNo: number): Promise<DeliveryNote>;
  addSerial(dnNo: string, slNo: number, code: string): Promise<DeliveryNote>;
  removeSerial(dnNo: string, slNo: number, code: string): Promise<DeliveryNote>;
  completeDeliveryNote(dnNo: string): Promise<DeliveryNote>;
  addDeliveryNoteAttachment(dnNo: string, file: { name: string; type: string; size: number; dataUrl: string }): Promise<DeliveryNote>;
  removeDeliveryNoteAttachment(dnNo: string, attachmentId: string): Promise<DeliveryNote>;
  createCustomer(form: { customerName: string; party: 'EXT' | 'INT'; projects: string[] }): Promise<Customer>;
  updateCustomer(id: string, form: { customerName: string; party: 'EXT' | 'INT'; projects: string[] }): Promise<Customer>;
  createPlantMaster(form: { category: string; plantName: string }): Promise<PlantMaster>;
  createPlantsBulk(rows: Array<{ category: string; plantName: string }>): Promise<PlantMaster[]>;
  createLocation(form: { name: string }): Promise<LocationMaster>;
  createLpoSoMapping(form: { customerName: string; project: string; poNo: string; soRef: string }): Promise<LpoSoMapping>;
  createReprintLog(form: { docType: 'gp' | 'dn'; docNo: string; customerProject: string }): Promise<ReprintLog>;
  createPlantTag(form: { plantCode: string; plantName: string; srlNo: string; size: string; location: string; warehouse: string }): Promise<PlantTag>;
  replaceOnhandItems(rows: Array<Omit<OnhandItem, 'id'>>): Promise<OnhandItem[]>;
  createOnhandItem(form: Omit<OnhandItem, 'id'>): Promise<OnhandItem>;
  deleteOnhandItem(id: string): Promise<void>;
  deleteOnhandItems(ids: string[]): Promise<void>;
  createUserAccount(form: { username: string; password: string; role: 'admin' | 'garden' }): Promise<UserAccount>;
  resetPassword(id: string, newPassword: string): Promise<UserAccount>;
  deleteUserAccount(id: string): Promise<void>;
}


// ── Helpers ───────────────────────────────────────────────────────────────────

const LS_KEY = 'acacia_gp_v3';

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

export function today() {
  const d = new Date();
  return `${pad2(d.getDate())}-${pad2(d.getMonth() + 1)}-${d.getFullYear()}`;
}

function defaultLocations(): LocationMaster[] {
  const names = ['MARNUR', 'MFNUR', 'KJNUR', 'RAK 1', 'RAK 2', 'NZ 1', 'NZ 2', 'NZ 3'];
  const createdAt = today();
  return names.map(name => ({ id: nanoid(), name, createdBy: 'Admin User', createdAt, modifiedBy: null, modifiedAt: null }));
}

function defaultNumberSettings(): NumberSettings {
  return { gpPrefix: 'GP-', gpNext: 100001, dnPrefix: 'DO-', dnNext: 100001 };
}

function defaultUsers(): UserAccount[] {
  const createdAt = today();
  return [
    { id: nanoid(), username: 'admin', password: 'admin123', role: 'admin', createdBy: 'System', createdAt, modifiedBy: null, modifiedAt: null },
    { id: nanoid(), username: 'garden', password: 'garden123', role: 'garden', createdBy: 'System', createdAt, modifiedBy: null, modifiedAt: null },
  ];
}

export function specOf(l: { potSize?: string; height?: string; girth?: string }) {
  const a: string[] = [];
  if (l.potSize) a.push(l.potSize);
  if (l.height) a.push('H' + l.height);
  if (l.girth) a.push(l.girth);
  return a.join(', ');
}

// ── Seed data (mirrors the backend seed.js) ───────────────────────────────────

function seedData(): AppData {
  return {
    gps: [
      {
        no: '06608', doNo: 'DO-2026-118', doDate: '23-06-2026', lpoNo: '', lpoDate: '', prRef: '', soRef: '',
        customerName: 'RYM - Project', customerCode: 'PSE 20241022', project: '', party: '',
        assignedTo: ['garden'],
        lines: [{ slNo: 1, plantCode: 'N-1', plantDesc: 'Ruellia ciliosa', potSize: '0.4', height: '30-40', girth: '', qty: '12', postedQty: '0', remainingQty: '0', location: '' }],
        createdBy: 'Admin User', createdAt: '23-06-2026', modifiedBy: null, modifiedAt: null, dnNo: null,
      },
      {
        no: '06607', doNo: 'DO-2026-110', doDate: '15-06-2026', lpoNo: '', lpoDate: '', prRef: '', soRef: '',
        customerName: 'Opal Garden', customerCode: 'PSE 20240915', project: '', party: '',
        assignedTo: ['garden'],
        lines: [
          { slNo: 1, plantCode: 'BG-12', plantDesc: 'Bougainvillea G. Pink', potSize: '11', height: '30-40', girth: '', qty: '8', postedQty: '0', remainingQty: '0', location: '' },
          { slNo: 2, plantCode: 'DR-04', plantDesc: 'Duranta Golden', potSize: '5', height: '25-30', girth: '', qty: '4', postedQty: '0', remainingQty: '0', location: '' },
        ],
        createdBy: 'Admin User', createdAt: '15-06-2026', modifiedBy: null, modifiedAt: null, dnNo: '34099',
      },
    ],
    dns: [
      {
        no: '34099', gpNo: '06607',
        customerProject: 'Opal Garden', customerCode: 'PSE 20240915',
        date: '16-06-2026', vhNumber: 'OM 4-21877',
        project: 'Opal Garden', preparedBy: 'Garden Incharge', modifiedBy: null, modifiedAt: null, status: 'completed',
        lines: [
          {
            slNo: 1, plantName: 'Bougainvillea G. Pink', plantCode: 'BG-12',
            spec: '11L · H30-40', qty: 8, deliveryQty: 8, postedQty: '0', remainingQty: '0', remarks: '', location: 'Nizwa - 03',
            serials: ['AC-880142','AC-880143','AC-880144','AC-880145','AC-880146','AC-880147','AC-880148','AC-880149'], hasSplit: false, isPending: false, doRef: '',
          },
          {
            slNo: 2, plantName: 'Duranta Golden', plantCode: 'DR-04',
            spec: '5L · H25-30', qty: 4, deliveryQty: 4, postedQty: '0', remainingQty: '0', remarks: '', location: 'Nizwa - 03',
            serials: ['AC-900311','AC-900312','AC-900313','AC-900314'], hasSplit: false, isPending: false, doRef: '',
          },
        ],
        attachments: [],
      },
    ],
    customers: [],
    plants: [],
    locations: defaultLocations(),
    users: defaultUsers(),
    numberSettings: defaultNumberSettings(),
    lpoSoMappings: [],
    reprintLogs: [],
    plantTags: [],
    onhandItems: [],
  };
}

// ── Local Store (localStorage backend) ───────────────────────────────────────

export class LocalStore implements DataStore {
  auth: AuthUser | null = null;

  async login(username: string, password: string): Promise<AuthUser> {
    const data = this.read();
    const u = data.users.find(u => u.username.toLowerCase() === (username || '').trim().toLowerCase());
    if (!u || u.password !== password) throw new Error('Invalid credentials');
    this.auth = { name: u.username, role: u.role };
    return this.auth;
  }

  async logout() {
    this.auth = null;
  }

  private read(): AppData {
    if (typeof window === 'undefined') return seedData();
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const d = JSON.parse(raw) as AppData;
        if (d?.gps) {
          const result: AppData = {
            gps: d.gps.map(g => ({
              ...g, project: g.project || '', party: g.party || '',
              prRef: g.prRef || '', soRef: g.soRef || '',
              assignedTo: Array.isArray(g.assignedTo) ? g.assignedTo : [],
              modifiedBy: g.modifiedBy ?? null, modifiedAt: g.modifiedAt ?? null,
              lines: g.lines.map(l => ({ ...l, location: l.location || '' })),
            })),
            dns: (d.dns || []).map(dn => ({
              ...dn, modifiedBy: dn.modifiedBy ?? null, modifiedAt: dn.modifiedAt ?? null,
              lines: dn.lines.map(l => ({ ...l, location: l.location || '', postedQty: l.postedQty || '0', remainingQty: l.remainingQty || '0', hasSplit: l.hasSplit ?? false, isPending: l.isPending ?? false, doRef: l.doRef ?? '' })),
              attachments: Array.isArray(dn.attachments) ? dn.attachments : [],
            })),
            customers: (d.customers || []).map(c => ({
              ...c, projects: c.projects || [], createdBy: c.createdBy || 'Admin',
              modifiedBy: c.modifiedBy ?? null, modifiedAt: c.modifiedAt ?? null,
            })),
            plants: (d.plants || []).map(p => ({ ...p, modifiedBy: p.modifiedBy ?? null, modifiedAt: p.modifiedAt ?? null })),
            locations: ((d.locations && d.locations.length) ? d.locations : defaultLocations())
              .map(l => ({ ...l, modifiedBy: l.modifiedBy ?? null, modifiedAt: l.modifiedAt ?? null })),
            users: ((d.users && d.users.length) ? d.users : defaultUsers())
              .map(u => ({ ...u, modifiedBy: u.modifiedBy ?? null, modifiedAt: u.modifiedAt ?? null })),
            numberSettings: d.numberSettings ?? defaultNumberSettings(),
            lpoSoMappings: (d.lpoSoMappings || []).map(m => ({ ...m, modifiedBy: m.modifiedBy ?? null, modifiedAt: m.modifiedAt ?? null })),
            reprintLogs: d.reprintLogs || [],
            plantTags: (d.plantTags || []).map(t => ({ ...t, warehouse: t.warehouse || '' })),
            onhandItems: d.onhandItems || [],
          };
          if ((!d.locations || !d.locations.length) || (!d.users || !d.users.length) || !d.numberSettings) this.write(result);
          return result;
        }
      }
    } catch {}
    const s = seedData();
    this.write(s);
    return s;
  }

  private write(data: AppData) {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(data));
    } catch {}
  }

  private formatSeqNo(prefix: string, n: number) {
    return `${prefix}${String(n).padStart(6, '0')}`;
  }

  private nextGpNo(data: AppData) {
    return this.formatSeqNo(data.numberSettings.gpPrefix, data.numberSettings.gpNext);
  }

  private nextDnNo(data: AppData) {
    return this.formatSeqNo(data.numberSettings.dnPrefix, data.numberSettings.dnNext);
  }

  async loadAll(): Promise<AppData> {
    return this.read();
  }

  async getNumberSettings(): Promise<NumberSettings> {
    return this.read().numberSettings;
  }

  async updateNumberSettings(settings: NumberSettings): Promise<NumberSettings> {
    const data = this.read();
    const updated: NumberSettings = {
      gpPrefix: settings.gpPrefix.trim(),
      gpNext: Math.max(1, Math.floor(settings.gpNext) || 1),
      dnPrefix: settings.dnPrefix.trim(),
      dnNext: Math.max(1, Math.floor(settings.dnNext) || 1),
    };
    this.write({ ...data, numberSettings: updated });
    return updated;
  }

  async createGatePass(form: GatePassForm): Promise<GatePass> {
    const data = this.read();
    const lines: GPLine[] = form.lines
      .filter(l => l.plantDesc.trim() || l.plantCode.trim())
      .map((l, i) => ({ slNo: i + 1, plantCode: l.plantCode, plantDesc: l.plantDesc, potSize: l.potSize, height: l.height, girth: l.girth, qty: l.qty, postedQty: l.postedQty, remainingQty: l.remainingQty, location: l.location }));
    const gp: GatePass = {
      no: this.nextGpNo(data),
      doNo: form.doNo || '', doDate: form.doDate || '',
      lpoNo: form.lpoNo || '', lpoDate: form.lpoDate || '',
      prRef: form.prRef || '', soRef: form.soRef || '',
      customerName: form.customerName, customerCode: form.customerCode || '',
      project: form.project || '', party: form.party || '',
      assignedTo: form.assignedTo || [],
      lines, createdBy: this.auth?.name || 'Admin', createdAt: today(),
      modifiedBy: null, modifiedAt: null, dnNo: null,
    };
    this.write({ ...data, gps: [gp, ...data.gps], numberSettings: { ...data.numberSettings, gpNext: data.numberSettings.gpNext + 1 } });
    return gp;
  }

  async updateGatePass(no: string, form: GatePassForm): Promise<GatePass> {
    const data = this.read();
    const existing = data.gps.find(g => g.no === no);
    if (!existing) throw new Error('Gate pass not found');
    if (existing.dnNo) throw new Error('Cannot edit — this gate pass already has a delivery note');
    const lines: GPLine[] = form.lines
      .filter(l => l.plantDesc.trim() || l.plantCode.trim())
      .map((l, i) => ({ slNo: i + 1, plantCode: l.plantCode, plantDesc: l.plantDesc, potSize: l.potSize, height: l.height, girth: l.girth, qty: l.qty, postedQty: l.postedQty, remainingQty: l.remainingQty, location: l.location }));
    const updated: GatePass = {
      ...existing,
      doNo: form.doNo || '', doDate: form.doDate || '',
      lpoNo: form.lpoNo || '', lpoDate: form.lpoDate || '',
      prRef: form.prRef || '', soRef: form.soRef || '',
      customerName: form.customerName, customerCode: form.customerCode || '',
      project: form.project || '', party: form.party || '',
      assignedTo: form.assignedTo || [],
      lines,
      modifiedBy: this.auth?.name || 'Admin', modifiedAt: today(),
    };
    this.write({ ...data, gps: data.gps.map(g => g.no === no ? updated : g) });
    return updated;
  }

  async createDeliveryNote(form: DeliveryNoteForm): Promise<DeliveryNote> {
    const data = this.read();
    const gp = data.gps.find(g => g.no === form.gpNo);
    if (!gp) throw new Error('Gate pass not found');
    if (gp.dnNo) throw new Error('This gate pass already has a delivery note');

    const overrides: Record<number, { slNo: number; deliveryQty: number; remarks: string; location: string }> = {};
    for (const l of form.lines) overrides[l.slNo] = l;

    const dnLines: DNLine[] = gp.lines.map((l) => {
      const ov = overrides[l.slNo];
      return {
        slNo: l.slNo, plantName: l.plantDesc || l.plantCode, plantCode: l.plantCode,
        spec: specOf(l), qty: Number(l.qty) || 0,
        deliveryQty: ov?.deliveryQty != null ? ov.deliveryQty : Number(l.qty) || 0,
        postedQty: '0', remainingQty: '0',
        remarks: ov?.remarks || '', location: ov?.location || l.location || '', serials: [], hasSplit: false, isPending: false, doRef: '',
      };
    });

    const dn: DeliveryNote = {
      no: this.nextDnNo(data), gpNo: gp.no,
      customerProject: form.customerProject || gp.customerName,
      customerCode: gp.customerCode,
      date: form.date || today(), vhNumber: form.vhNumber,
      project: form.project || gp.project,
      preparedBy: this.auth?.name || 'Garden Incharge',
      modifiedBy: null, modifiedAt: null,
      status: 'scanning', lines: dnLines,
      attachments: [],
    };

    this.write({
      ...data,
      gps: data.gps.map(g => g.no === gp.no ? { ...g, dnNo: dn.no } : g),
      dns: [dn, ...data.dns],
      numberSettings: { ...data.numberSettings, dnNext: data.numberSettings.dnNext + 1 },
    });
    return dn;
  }

  async updateDeliveryNoteHeader(dnNo: string, form: {
    customerProject: string; vhNumber: string; project: string; date: string;
  }): Promise<DeliveryNote> {
    const data = this.read();
    const existing = data.dns.find(d => d.no === dnNo);
    if (!existing) throw new Error('Delivery note not found');
    const updated: DeliveryNote = {
      ...existing,
      customerProject: form.customerProject || '', vhNumber: form.vhNumber || '',
      project: form.project || '', date: form.date || '',
      modifiedBy: this.auth?.name || 'Admin', modifiedAt: today(),
    };
    this.write({ ...data, dns: data.dns.map(d => d.no === dnNo ? updated : d) });
    return updated;
  }

  async updateDeliveryNoteLine(dnNo: string, slNo: number, form: { postedQty: string; remarks: string }): Promise<DeliveryNote> {
    const data = this.read();
    const dn = data.dns.find(d => d.no === dnNo);
    if (!dn) throw new Error('Delivery note not found');
    const line = dn.lines.find(l => l.slNo === slNo);
    if (!line) throw new Error('Delivery note line not found');
    line.postedQty = form.postedQty;
    const target = line.deliveryQty || 0;
    const posted = Number(form.postedQty) || 0;
    line.remainingQty = String(Math.max(0, target - posted));
    line.remarks = form.remarks;
    dn.modifiedBy = this.auth?.name || 'Admin';
    dn.modifiedAt = today();
    this.write(data);
    return dn;
  }

  async updateDeliveryNoteLineDoRef(dnNo: string, slNo: number, doRef: string): Promise<DeliveryNote> {
    const data = this.read();
    const dn = data.dns.find(d => d.no === dnNo);
    if (!dn) throw new Error('Delivery note not found');
    const line = dn.lines.find(l => l.slNo === slNo);
    if (!line) throw new Error('Delivery note line not found');
    line.doRef = doRef;
    dn.modifiedBy = this.auth?.name || 'Admin';
    dn.modifiedAt = today();
    this.write(data);
    return dn;
  }

  async updateGatePassHeaderRefs(gpNo: string, form: { soRef: string; prRef: string; lpoNo: string }): Promise<GatePass> {
    const data = this.read();
    const gp = data.gps.find(g => g.no === gpNo);
    if (!gp) throw new Error('Gate pass not found');
    gp.soRef = form.soRef;
    gp.prRef = form.prRef;
    gp.lpoNo = form.lpoNo;
    gp.modifiedBy = this.auth?.name || 'Admin';
    gp.modifiedAt = today();
    this.write(data);
    return gp;
  }

  async splitDeliveryNoteLine(dnNo: string, slNo: number): Promise<DeliveryNote> {
    const data = this.read();
    const dn = data.dns.find(d => d.no === dnNo);
    if (!dn) throw new Error('Delivery note not found');
    const line = dn.lines.find(l => l.slNo === slNo);
    if (!line) throw new Error('Delivery note line not found');
    if (line.hasSplit) throw new Error('This line has already been split');
    const posted = Number(line.postedQty) || 0;
    const shortfall = (line.deliveryQty || 0) - posted;
    if (shortfall <= 0) throw new Error('Nothing to split — line is already fully posted');

    line.hasSplit = true;
    const nextSlNo = Math.max(...dn.lines.map(l => l.slNo)) + 1;
    const newLine: DNLine = {
      slNo: nextSlNo, plantName: line.plantName, plantCode: line.plantCode, spec: line.spec,
      qty: shortfall, deliveryQty: shortfall, postedQty: '0', remainingQty: String(shortfall),
      remarks: '', location: line.location, serials: [], hasSplit: false, isPending: true,
      doRef: '', // deliberately blank — does not inherit the original line's reference
    };
    dn.lines = [...dn.lines, newLine];
    dn.modifiedBy = this.auth?.name || 'Admin';
    dn.modifiedAt = today();
    this.write(data);
    return dn;
  }

  async removeDeliveryNoteLine(dnNo: string, slNo: number): Promise<DeliveryNote> {
    const data = this.read();
    const dn = data.dns.find(d => d.no === dnNo);
    if (!dn) throw new Error('Delivery note not found');
    const line = dn.lines.find(l => l.slNo === slNo);
    if (!line) throw new Error('Delivery note line not found');
    if (dn.lines.length <= 1) throw new Error('A delivery note must have at least one line');
    if (line.serials.length > 0) throw new Error('Cannot remove — barcodes have already been scanned against this line');
    dn.lines = dn.lines.filter(l => l.slNo !== slNo);
    dn.modifiedBy = this.auth?.name || 'Admin';
    dn.modifiedAt = today();
    this.write(data);
    return dn;
  }

  async addSerial(dnNo: string, slNo: number, code: string): Promise<DeliveryNote> {
    code = code.trim();
    if (!code) throw new Error('Empty barcode');
    const data = this.read();
    const dn = data.dns.find(d => d.no === dnNo);
    if (!dn) throw new Error('Delivery note not found');
    // Completed delivery notes can still have a barcode swapped (cancel the
    // wrong one, scan the correct one) — the Qty cap below is what actually
    // prevents over-scanning, not the completed status.
    const line = dn.lines.find(l => l.slNo === slNo);
    if (!line) throw new Error('Delivery note line not found');
    if (line.serials.includes(code)) throw new Error('Duplicate barcode: ' + code);
    if (line.serials.length >= line.deliveryQty) throw new Error('This line is already complete — pick another');
    line.serials = [...line.serials, code];
    dn.modifiedBy = this.auth?.name || 'Garden Incharge';
    dn.modifiedAt = today();
    this.write(data);
    return dn;
  }

  async removeSerial(dnNo: string, slNo: number, code: string): Promise<DeliveryNote> {
    const data = this.read();
    const dn = data.dns.find(d => d.no === dnNo);
    if (!dn) throw new Error('Delivery note not found');
    const line = dn.lines.find(l => l.slNo === slNo);
    if (!line) throw new Error('Delivery note line not found');
    line.serials = line.serials.filter(s => s !== code);
    dn.modifiedBy = this.auth?.name || 'Garden Incharge';
    dn.modifiedAt = today();
    this.write(data);
    return dn;
  }

  async completeDeliveryNote(dnNo: string): Promise<DeliveryNote> {
    const data = this.read();
    const dn = data.dns.find(d => d.no === dnNo);
    if (!dn) throw new Error('Delivery note not found');
    const incomplete = dn.lines.some(l => l.serials.length < l.deliveryQty);
    if (incomplete) throw new Error('Some lines are not fully scanned');
    dn.status = 'completed';
    dn.modifiedBy = this.auth?.name || 'Garden Incharge';
    dn.modifiedAt = today();
    this.write(data);
    return dn;
  }

  async addDeliveryNoteAttachment(dnNo: string, file: { name: string; type: string; size: number; dataUrl: string }): Promise<DeliveryNote> {
    const data = this.read();
    const dn = data.dns.find(d => d.no === dnNo);
    if (!dn) throw new Error('Delivery note not found');
    const attachment: DNAttachment = {
      id: nanoid(), name: file.name, type: file.type, size: file.size, dataUrl: file.dataUrl,
      uploadedBy: this.auth?.name || 'Admin', uploadedAt: today(),
    };
    dn.attachments = [...dn.attachments, attachment];
    dn.modifiedBy = this.auth?.name || 'Admin';
    dn.modifiedAt = today();
    this.write(data);
    return dn;
  }

  async removeDeliveryNoteAttachment(dnNo: string, attachmentId: string): Promise<DeliveryNote> {
    const data = this.read();
    const dn = data.dns.find(d => d.no === dnNo);
    if (!dn) throw new Error('Delivery note not found');
    dn.attachments = dn.attachments.filter(a => a.id !== attachmentId);
    dn.modifiedBy = this.auth?.name || 'Admin';
    dn.modifiedAt = today();
    this.write(data);
    return dn;
  }

  async createCustomer(form: { customerName: string; party: 'EXT' | 'INT'; projects: string[] }): Promise<Customer> {
    const data = this.read();
    const c: Customer = {
      id: nanoid(),
      customerName: form.customerName,
      projects: form.projects,
      party: form.party,
      createdBy: this.auth?.name || 'Admin',
      createdAt: today(),
      modifiedBy: null,
      modifiedAt: null,
    };
    this.write({ ...data, customers: [c, ...data.customers] });
    return c;
  }

  async updateCustomer(id: string, form: { customerName: string; party: 'EXT' | 'INT'; projects: string[] }): Promise<Customer> {
    const data = this.read();
    const existing = data.customers.find(c => c.id === id);
    if (!existing) throw new Error('Customer not found');
    const updated: Customer = {
      ...existing, customerName: form.customerName, party: form.party, projects: form.projects,
      modifiedBy: this.auth?.name || 'Admin', modifiedAt: today(),
    };
    this.write({ ...data, customers: data.customers.map(c => c.id === id ? updated : c) });
    return updated;
  }

  async createPlantMaster(form: { category: string; plantName: string }): Promise<PlantMaster> {
    const data = this.read();
    const p: PlantMaster = {
      id: nanoid(),
      category: form.category,
      plantName: form.plantName,
      createdBy: this.auth?.name || 'Admin',
      createdAt: today(),
      modifiedBy: null,
      modifiedAt: null,
    };
    this.write({ ...data, plants: [p, ...data.plants] });
    return p;
  }

  async createPlantsBulk(rows: Array<{ category: string; plantName: string }>): Promise<PlantMaster[]> {
    const data = this.read();
    const createdBy = this.auth?.name || 'Admin';
    const createdAt = today();
    const newPlants: PlantMaster[] = rows.map(r => ({
      id: nanoid(),
      category: r.category,
      plantName: r.plantName,
      createdBy,
      createdAt,
      modifiedBy: null,
      modifiedAt: null,
    }));
    this.write({ ...data, plants: [...newPlants, ...data.plants] });
    return newPlants;
  }

  async createLocation(form: { name: string }): Promise<LocationMaster> {
    const data = this.read();
    const l: LocationMaster = {
      id: nanoid(),
      name: form.name,
      createdBy: this.auth?.name || 'Admin',
      createdAt: today(),
      modifiedBy: null,
      modifiedAt: null,
    };
    this.write({ ...data, locations: [l, ...data.locations] });
    return l;
  }

  async createLpoSoMapping(form: { customerName: string; project: string; poNo: string; soRef: string }): Promise<LpoSoMapping> {
    const data = this.read();
    const m: LpoSoMapping = {
      id: nanoid(),
      customerName: form.customerName,
      project: form.project,
      poNo: form.poNo,
      soRef: form.soRef,
      createdBy: this.auth?.name || 'Admin',
      createdAt: today(),
      modifiedBy: null,
      modifiedAt: null,
    };
    this.write({ ...data, lpoSoMappings: [m, ...data.lpoSoMappings] });
    return m;
  }

  async createReprintLog(form: { docType: 'gp' | 'dn'; docNo: string; customerProject: string }): Promise<ReprintLog> {
    const data = this.read();
    const log: ReprintLog = {
      id: nanoid(),
      docType: form.docType,
      docNo: form.docNo,
      customerProject: form.customerProject,
      createdBy: this.auth?.name || 'Admin',
      createdAt: today(),
    };
    this.write({ ...data, reprintLogs: [log, ...data.reprintLogs] });
    return log;
  }

  async createPlantTag(form: { plantCode: string; plantName: string; srlNo: string; size: string; location: string; warehouse: string }): Promise<PlantTag> {
    const data = this.read();
    const srlNo = form.srlNo.trim();
    if (!srlNo) throw new Error('SRL# is required');
    if (data.plantTags.some(t => t.srlNo.toLowerCase() === srlNo.toLowerCase())) {
      throw new Error(`SRL# ${srlNo} is already tagged`);
    }
    const tag: PlantTag = {
      id: nanoid(),
      plantCode: form.plantCode,
      plantName: form.plantName,
      srlNo,
      size: form.size,
      location: form.location,
      warehouse: form.warehouse,
      createdBy: this.auth?.name || 'Admin',
      createdAt: today(),
    };
    this.write({ ...data, plantTags: [tag, ...data.plantTags] });
    return tag;
  }

  async replaceOnhandItems(rows: Array<Omit<OnhandItem, 'id'>>): Promise<OnhandItem[]> {
    const data = this.read();
    const items: OnhandItem[] = rows.map(r => ({ id: nanoid(), ...r }));
    this.write({ ...data, onhandItems: items });
    return items;
  }

  async createOnhandItem(form: Omit<OnhandItem, 'id'>): Promise<OnhandItem> {
    const data = this.read();
    const item: OnhandItem = { id: nanoid(), ...form };
    this.write({ ...data, onhandItems: [item, ...data.onhandItems] });
    return item;
  }

  async deleteOnhandItem(id: string): Promise<void> {
    const data = this.read();
    this.write({ ...data, onhandItems: data.onhandItems.filter(i => i.id !== id) });
  }

  async deleteOnhandItems(ids: string[]): Promise<void> {
    const data = this.read();
    const idSet = new Set(ids);
    this.write({ ...data, onhandItems: data.onhandItems.filter(i => !idSet.has(i.id)) });
  }

  async createUserAccount(form: { username: string; password: string; role: 'admin' | 'garden' }): Promise<UserAccount> {
    const data = this.read();
    const uname = form.username.trim();
    if (data.users.some(u => u.username.toLowerCase() === uname.toLowerCase())) {
      throw new Error('A user with that username already exists');
    }
    const u: UserAccount = {
      id: nanoid(),
      username: uname,
      password: form.password,
      role: form.role,
      createdBy: this.auth?.name || 'Admin',
      createdAt: today(),
      modifiedBy: null,
      modifiedAt: null,
    };
    this.write({ ...data, users: [u, ...data.users] });
    return u;
  }

  async deleteUserAccount(id: string): Promise<void> {
    const data = this.read();
    const existing = data.users.find(u => u.id === id);
    if (!existing) throw new Error('User not found');
    if (existing.role === 'admin' && data.users.filter(u => u.role === 'admin').length <= 1) {
      throw new Error('Cannot delete the last remaining Admin account');
    }
    if (this.auth?.name === existing.username) {
      throw new Error('Cannot delete the account you are currently signed in with');
    }
    this.write({ ...data, users: data.users.filter(u => u.id !== id) });
  }

  async resetPassword(id: string, newPassword: string): Promise<UserAccount> {
    const data = this.read();
    const existing = data.users.find(u => u.id === id);
    if (!existing) throw new Error('User not found');
    const updated: UserAccount = {
      ...existing, password: newPassword,
      modifiedBy: this.auth?.name || 'Admin', modifiedAt: today(),
    };
    this.write({ ...data, users: data.users.map(u => u.id === id ? updated : u) });
    return updated;
  }
}

// ── API Store (Express + Postgres backend) ───────────────────────────────────

const TOKEN_KEY = 'acacia_gp_token';
const AUTH_KEY = 'acacia_gp_auth';

export class ApiStore implements DataStore {
  auth: AuthUser | null = null;
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    if (typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem(AUTH_KEY);
        if (raw) this.auth = JSON.parse(raw) as AuthUser;
      } catch {}
    }
  }

  private token(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(TOKEN_KEY);
  }

  private setSession(token: string, auth: AuthUser) {
    this.auth = auth;
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(AUTH_KEY, JSON.stringify(auth));
  }

  private clearSession() {
    this.auth = null;
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(AUTH_KEY);
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> | undefined),
    };
    const token = this.token();
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch(`${this.baseUrl}${path}`, { ...options, headers });
    if (res.status === 204) return undefined as T;
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error((body as { error?: string }).error || `Request failed (${res.status})`);
    }
    return body as T;
  }

  async login(username: string, password: string): Promise<AuthUser> {
    const data = await this.request<{ token: string; user: { username: string; role: 'admin' | 'garden' } }>(
      '/api/auth/login',
      { method: 'POST', body: JSON.stringify({ username, password }) }
    );
    // Use username (not display name) so assignedTo matching works like LocalStore
    const auth: AuthUser = { name: data.user.username, role: data.user.role };
    this.setSession(data.token, auth);
    return auth;
  }

  async logout() {
    this.clearSession();
  }

  async loadAll(): Promise<AppData> {
    const [gps, dns, customers, plants, locations, users, numberSettings] = await Promise.all([
      this.request<GatePass[]>('/api/gate-passes'),
      this.request<DeliveryNote[]>('/api/delivery-notes'),
      this.request<Customer[]>('/api/masters/customers'),
      this.request<PlantMaster[]>('/api/masters/plants'),
      this.request<LocationMaster[]>('/api/masters/locations'),
      this.request<UserAccount[]>('/api/users'),
      this.request<NumberSettings>('/api/masters/number-settings'),
    ]);
    return {
      gps, customers, plants, locations, users, numberSettings, lpoSoMappings: [], reprintLogs: [], plantTags: [], onhandItems: [],
      dns: dns.map(dn => ({ ...dn, attachments: dn.attachments || [] })),
    };
  }

  async getNumberSettings(): Promise<NumberSettings> {
    return this.request('/api/masters/number-settings');
  }

  async updateNumberSettings(settings: NumberSettings): Promise<NumberSettings> {
    return this.request('/api/masters/number-settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    });
  }

  async createGatePass(form: GatePassForm): Promise<GatePass> {
    return this.request('/api/gate-passes', { method: 'POST', body: JSON.stringify(form) });
  }

  async updateGatePass(no: string, form: GatePassForm): Promise<GatePass> {
    return this.request(`/api/gate-passes/${encodeURIComponent(no)}`, {
      method: 'PUT',
      body: JSON.stringify(form),
    });
  }

  async createDeliveryNote(form: DeliveryNoteForm): Promise<DeliveryNote> {
    return this.request('/api/delivery-notes', { method: 'POST', body: JSON.stringify(form) });
  }

  async updateDeliveryNoteHeader(dnNo: string, form: { customerProject: string; vhNumber: string; project: string; date: string }): Promise<DeliveryNote> {
    return this.request(`/api/delivery-notes/${encodeURIComponent(dnNo)}/header`, {
      method: 'PATCH',
      body: JSON.stringify(form),
    });
  }

  async updateDeliveryNoteLine(dnNo: string, slNo: number, form: { postedQty: string; remarks: string }): Promise<DeliveryNote> {
    return this.request(`/api/delivery-notes/${encodeURIComponent(dnNo)}/lines/${slNo}`, {
      method: 'PATCH',
      body: JSON.stringify(form),
    });
  }

  async updateDeliveryNoteLineDoRef(dnNo: string, slNo: number, doRef: string): Promise<DeliveryNote> {
    return this.request(`/api/delivery-notes/${encodeURIComponent(dnNo)}/lines/${slNo}`, {
      method: 'PATCH',
      body: JSON.stringify({ doRef }),
    });
  }

  async updateGatePassHeaderRefs(gpNo: string, form: { soRef: string; prRef: string; lpoNo: string }): Promise<GatePass> {
    return this.request(`/api/gate-passes/${encodeURIComponent(gpNo)}/refs`, {
      method: 'PATCH',
      body: JSON.stringify(form),
    });
  }

  async splitDeliveryNoteLine(dnNo: string, slNo: number): Promise<DeliveryNote> {
    return this.request(`/api/delivery-notes/${encodeURIComponent(dnNo)}/lines/${slNo}/split`, {
      method: 'POST',
    });
  }

  async removeDeliveryNoteLine(dnNo: string, slNo: number): Promise<DeliveryNote> {
    return this.request(`/api/delivery-notes/${encodeURIComponent(dnNo)}/lines/${slNo}`, {
      method: 'DELETE',
    });
  }

  async addSerial(dnNo: string, slNo: number, code: string): Promise<DeliveryNote> {
    return this.request(`/api/delivery-notes/${encodeURIComponent(dnNo)}/lines/${slNo}/serials`, {
      method: 'POST',
      body: JSON.stringify({ code }),
    });
  }

  async removeSerial(dnNo: string, slNo: number, code: string): Promise<DeliveryNote> {
    return this.request(
      `/api/delivery-notes/${encodeURIComponent(dnNo)}/lines/${slNo}/serials/${encodeURIComponent(code)}`,
      { method: 'DELETE' }
    );
  }

  async completeDeliveryNote(dnNo: string): Promise<DeliveryNote> {
    return this.request(`/api/delivery-notes/${encodeURIComponent(dnNo)}/complete`, { method: 'POST' });
  }

  async addDeliveryNoteAttachment(): Promise<DeliveryNote> {
    throw new Error('Attachments are not yet available when connected to the shared database');
  }

  async removeDeliveryNoteAttachment(): Promise<DeliveryNote> {
    throw new Error('Attachments are not yet available when connected to the shared database');
  }

  async createCustomer(form: { customerName: string; party: 'EXT' | 'INT'; projects: string[] }): Promise<Customer> {
    return this.request('/api/masters/customers', { method: 'POST', body: JSON.stringify(form) });
  }

  async updateCustomer(id: string, form: { customerName: string; party: 'EXT' | 'INT'; projects: string[] }): Promise<Customer> {
    return this.request(`/api/masters/customers/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(form),
    });
  }

  async createPlantMaster(form: { category: string; plantName: string }): Promise<PlantMaster> {
    return this.request('/api/masters/plants', { method: 'POST', body: JSON.stringify(form) });
  }

  async createPlantsBulk(rows: Array<{ category: string; plantName: string }>): Promise<PlantMaster[]> {
    return this.request('/api/masters/plants/bulk', { method: 'POST', body: JSON.stringify(rows) });
  }

  async createLocation(form: { name: string }): Promise<LocationMaster> {
    return this.request('/api/masters/locations', { method: 'POST', body: JSON.stringify(form) });
  }

  async createLpoSoMapping(): Promise<LpoSoMapping> {
    throw new Error('LPO / SO mapping is not yet available when connected to the shared database');
  }

  async createReprintLog(): Promise<ReprintLog> {
    throw new Error('Reprint log is not yet available when connected to the shared database');
  }

  async createPlantTag(): Promise<PlantTag> {
    throw new Error('Tag Print is not yet available when connected to the shared database');
  }

  async replaceOnhandItems(): Promise<OnhandItem[]> {
    throw new Error('Onhand is not yet available when connected to the shared database');
  }

  async createOnhandItem(): Promise<OnhandItem> {
    throw new Error('Onhand is not yet available when connected to the shared database');
  }

  async deleteOnhandItem(): Promise<void> {
    throw new Error('Onhand is not yet available when connected to the shared database');
  }

  async deleteOnhandItems(): Promise<void> {
    throw new Error('Onhand is not yet available when connected to the shared database');
  }

  async createUserAccount(form: { username: string; password: string; role: 'admin' | 'garden' }): Promise<UserAccount> {
    return this.request('/api/users', { method: 'POST', body: JSON.stringify(form) });
  }

  async resetPassword(id: string, newPassword: string): Promise<UserAccount> {
    return this.request(`/api/users/${encodeURIComponent(id)}/password`, {
      method: 'PATCH',
      body: JSON.stringify({ password: newPassword }),
    });
  }

  async deleteUserAccount(id: string): Promise<void> {
    await this.request(`/api/users/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }
}

export function createStore(): DataStore {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (apiUrl) return new ApiStore(apiUrl);
  return new LocalStore();
}
