import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AuthProvider, useAuth } from 'react-oidc-context';
import {
  Save,
  Search,
  Plus,
  Database,
  ShieldCheck,
  RefreshCw,
  Pencil,
  Upload,
  XCircle,
  LayoutDashboard,
  ClipboardList,
  Users,
  FileText,
  Settings,
  LogOut,
  Bell,
  UserCircle,
  ChevronDown,
  Eye,
  Download,
  BarChart3,
  CheckCircle2,
  Clock3,
  PauseCircle,
  TrendingUp,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import './styles.css';

const RAW_API_BASE = (
  import.meta.env.VITE_API_BASE_URL ||
  'https://jp1bupouyl.execute-api.ap-south-1.amazonaws.com/prod'
).replace(/\/+$/, '');

// Accept either the API root or a mistakenly saved full resource URL.
// Examples supported:
//   https://...amazonaws.com/prod
//   https://...amazonaws.com/prod/employee-data-entry
//   https://...amazonaws.com/prod/employee-data-entry-requests
const API_ROOT = RAW_API_BASE
  .replace(/\/employee-data-entry-requests$/, '')
  .replace(/\/employee-data-entry$/, '');

const COMPANY_API_URL = `${API_ROOT}/employee-data-entry`;
const REQUESTS_API_URL = `${API_ROOT}/employee-data-entry-requests`;
// Shared, hardcoded choices. To publish admin edits for all employees,
// replace this constant with the exported settings and redeploy Amplify.
const HARD_CODED_OPTIONS = {
  countries: ['India', 'United States', 'United Kingdom', 'United Arab Emirates', 'Germany', 'Malaysia', 'Singapore', 'Australia', 'Canada', 'Saudi Arabia'],
  industries: ['Agriculture', 'Automotive', 'Chemicals', 'Construction', 'Education', 'Electronics', 'Energy', 'Food & Beverages', 'Healthcare', 'Information Technology', 'Manufacturing', 'Pharmaceuticals', 'Retail', 'Textiles', 'Transportation & Logistics'],
};
const ADMIN_EMAIL = 'manikya93@gmail.com';
const PORTAL_KEY = import.meta.env.VITE_EMPLOYEE_PORTAL_KEY || '';

const companyTypes = ['Importer', 'Retail Chain', 'Retailer', 'Distributor', 'Buying House', 'Wholesaler', 'Sourcing Agent', 'Agent', 'Ecommerce', 'Manufacturer', 'Other'];

const emptyForm = {
  company_id: '',
  company_name: '',
  country: '',
  industry: '',
  product: 'Unassigned',
  company_briefing: '',
  brands: '',
  supply_requested: '',
  email: '',
  phone: '',
  website: '',
  address: '',
  city: '',
  type: 'Importer',
  priority: '3',
  verified: true,
  active: true,
  contact_person: '',
  designation: '',
  imports_from_india: 'Unknown',
  source_name: '',
  source_url: '',
  notes: '',
  request_id: '',
  request_batch_id: '',
};

const emptyRequestForm = {
  product: '',
  countries_text: '',
  target_companies_per_country: '10',
  priority: '3',
  assigned_to: '',
  due_date: '',
  instructions: '',
};


const EXCEL_BATCH_SIZE = 25;
const UPLOAD_STEP_LABELS = ['Reading Excel', 'Verifying data', 'Uploading records', 'Synchronising database', 'Completed'];

function uploadPhaseStepIndex(phase) {
  const indexes = {
    reading: 0,
    verifying: 1,
    ready: 1,
    uploading: 2,
    syncing: 3,
    success: 4,
  };
  return indexes[phase] ?? -1;
}

function uploadPhaseTitle(phase) {
  const titles = {
    idle: 'Select an Excel file',
    reading: 'Reading Excel file...',
    verifying: 'Verifying data...',
    ready: 'Data verified and ready',
    uploading: 'Uploading records...',
    syncing: 'Synchronising with the database...',
    success: 'Data upload success!',
    failed: 'Data upload failed',
  };
  return titles[phase] || 'Excel upload';
}
const EXCEL_COLUMNS = [
  'company_name',
  'country',
  'industry',
  'product',
  'type',
  'brands',
  'company_briefing',
  'supply_requested',
  'email',
  'phone',
  'website',
  'address',
  'city',
  'priority',
  'contact_person',
  'designation',
  'imports_from_india',
  'source_name',
  'source_url',
  'notes',
  'verified',
  'active',
];

const EXCEL_HEADER_ALIASES = {
  companyid: 'company_id',
  company_id: 'company_id',
  companyname: 'company_name',
  company_name: 'company_name',
  country: 'country',
  industry: 'industry',
  product: 'product',
  productcategory: 'product',
  product_category: 'product',
  type: 'type',
  brands: 'brands',
  companybriefing: 'company_briefing',
  company_briefing: 'company_briefing',
  supplyrequested: 'supply_requested',
  supply_requested: 'supply_requested',
  email: 'email',
  phone: 'phone',
  website: 'website',
  address: 'address',
  city: 'city',
  priority: 'priority',
  contactperson: 'contact_person',
  contact_person: 'contact_person',
  designation: 'designation',
  importsfromindia: 'imports_from_india',
  imports_from_india: 'imports_from_india',
  sourcename: 'source_name',
  source_name: 'source_name',
  sourceurl: 'source_url',
  source_url: 'source_url',
  notes: 'notes',
  verified: 'verified',
  active: 'active',
};

function normalizeExcelHeader(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  return EXCEL_HEADER_ALIASES[normalized] || EXCEL_HEADER_ALIASES[normalized.replace(/_/g, '')] || normalized;
}

function parseExcelBoolean(value, fallback = true) {
  if (typeof value === 'boolean') return value;
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!normalized) return fallback;
  if (['true', 'yes', 'y', '1', 'active', 'verified'].includes(normalized)) return true;
  if (['false', 'no', 'n', '0', 'inactive', 'unverified'].includes(normalized)) return false;
  return fallback;
}

function normalizeExcelRow(rawRow, index) {
  const mapped = {};
  let suppliedCompanyId = '';

  Object.entries(rawRow || {}).forEach(([header, value]) => {
    const field = normalizeExcelHeader(header);
    const textValue = typeof value === 'string' ? value.trim() : value;

    // company_id is never accepted from an associate upload. New IDs are
    // generated only by the backend sequence.
    if (field === 'company_id') {
      suppliedCompanyId = String(textValue || '').trim();
      return;
    }

    if (!EXCEL_COLUMNS.includes(field)) return;
    if (textValue === '' || textValue === null || textValue === undefined) return;
    mapped[field] = textValue;
  });

  if ('priority' in mapped) {
    const priority = Number(mapped.priority);
    mapped.priority = Number.isFinite(priority) ? Math.max(1, Math.min(Math.round(priority), 5)) : 3;
  }

  if ('verified' in mapped) mapped.verified = parseExcelBoolean(mapped.verified, true);
  if ('active' in mapped) mapped.active = parseExcelBoolean(mapped.active, true);

  return {
    ...mapped,
    _supplied_company_id: suppliedCompanyId,
    _excel_row: index + 2,
    _errors: [],
  };
}

function chunkRows(rows, size) {
  const chunks = [];
  for (let index = 0; index < rows.length; index += size) {
    chunks.push(rows.slice(index, index + size));
  }
  return chunks;
}

function parseCountries(value) {
  const seen = new Set();
  return String(value || '')
    .split(/[,;\n]/)
    .map((country) => country.trim().replace(/\s+/g, ' '))
    .filter((country) => {
      if (!country) return false;
      const key = country.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function requestIdentity(item = {}, index = 0) {
  return item.request_id || item.request_item_id || `${item.batch_id || 'request'}-${item.product_country_key || index}`;
}

function normalizeUnderscore(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function splitTerms(value) {
  return String(value || '')
    .split(/[,\.\n]/)
    .map(normalizeUnderscore)
    .filter(Boolean);
}

function buildPayload(form, employeeName) {
  const countryKey = normalizeUnderscore(form.country);
  const productKey = normalizeUnderscore(form.product);
  const companyKey = normalizeUnderscore(form.company_name);
  const now = new Date().toISOString();

  const searchTerms = Array.from(new Set([
    countryKey,
    productKey,
    companyKey,
    normalizeUnderscore(form.city),
    normalizeUnderscore(form.type),
    ...splitTerms(form.product),
    ...splitTerms(form.company_name),
    ...splitTerms(form.brands),
    ...splitTerms(form.supply_requested),
    ...splitTerms(form.company_briefing),
  ].filter(Boolean)));

  return {
    ...form,
    priority: Number(form.priority || 3),
    verified: Boolean(form.verified),
    active: Boolean(form.active),
    product_country_key: productKey && countryKey ? `${productKey}#${countryKey}` : form.product_country_key || '',
    country_key: countryKey,
    product_key: productKey,
    company_key: companyKey,
    search_terms: searchTerms,
    updated_at: now,
    added_by: employeeName || localStorage.getItem('rbr_employee_name') || 'employee_portal',
  };
}


function titleFromKeyPart(value) {
  return String(value || '')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function splitProductCountryKey(item) {
  const key = String(item?.product_country_key || '');
  const [productKey = '', countryKey = ''] = key.split('#');
  return { productKey, countryKey };
}

function getCompanyProduct(item) {
  const { productKey } = splitProductCountryKey(item);
  return item?.product || item?.product_category || titleFromKeyPart(productKey) || '-';
}

function getCompanyCountry(item) {
  const { countryKey } = splitProductCountryKey(item);
  return item?.country || titleFromKeyPart(countryKey) || '-';
}

function normalizeCompanyRecord(item = {}) {
  return {
    ...item,
    product: getCompanyProduct(item),
    country: getCompanyCountry(item),
    priority: item.priority || 3,
    verified: item.verified !== false,
    active: item.active !== false,
  };
}

// Show company records created on or after 26 Sep 2026 (00:00 IST).
// 26 Sep 2026 00:00 IST = 25 Sep 2026 18:30 UTC.
const COMPANY_TABLE_CREATED_CUTOFF = Date.parse('2026-09-25T18:30:00.000Z');

function getCompanyCreatedTimestamp(item = {}) {
  const rawCreatedAt =
    item.created_at ||
    item.createdAt ||
    item.created_on ||
    item.createdOn ||
    item.added_at ||
    item.addedAt ||
    '';

  if (!rawCreatedAt) return Number.NaN;

  const timestamp = Date.parse(rawCreatedAt);
  return Number.isFinite(timestamp) ? timestamp : Number.NaN;
}

function wasCompanyCreatedSinceCutoff(item = {}) {
  const timestamp = getCompanyCreatedTimestamp(item);
  return Number.isFinite(timestamp) && timestamp >= COMPANY_TABLE_CREATED_CUTOFF;
}

// Use the employee identity and the calendar day in India, not UTC.
function indiaDateKey(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date);
}

function isMyRecordToday(item, employeeEmail) {
  const email = String(employeeEmail || '').trim().toLowerCase();
  const creatorEmail = String(item.employee_email || item.created_by_email || '').trim().toLowerCase();
  return Boolean(email && creatorEmail && email === creatorEmail &&
    indiaDateKey(getCompanyCreatedTimestamp(item)) === indiaDateKey(new Date()));
}

function normalizeRequestRecord(item = {}, index = 0) {
  const product = item.product || item.product_name || titleFromKeyPart(item.product_key);
  const country = item.country || item.country_name || titleFromKeyPart(item.country_key);
  const productKey = item.product_key || normalizeUnderscore(product);
  const countryKey = item.country_key || normalizeUnderscore(country);

  return {
    ...item,
    request_id: requestIdentity(item, index),
    batch_id: item.batch_id || item.request_batch_id || '',
    product,
    country,
    product_key: productKey,
    country_key: countryKey,
    product_country_key: item.product_country_key || `${productKey}#${countryKey}`,
    target_companies: Number(item.target_companies || item.target_companies_per_country || 10),
    priority: Number(item.priority || 3),
    status: item.status || 'Open',
  };
}

function expandRequestRecords(items = []) {
  return items.flatMap((item, itemIndex) => {
    if (item.country || !Array.isArray(item.countries)) {
      return [normalizeRequestRecord(item, itemIndex)];
    }

    return item.countries.map((country, countryIndex) => normalizeRequestRecord({
      ...item,
      country: typeof country === 'string' ? country : country.country,
      country_key: typeof country === 'string' ? normalizeUnderscore(country) : country.country_key,
      request_id: typeof country === 'string'
        ? `${item.request_id || item.batch_id || `request-${itemIndex}`}#${normalizeUnderscore(country)}`
        : country.request_id,
      target_companies: typeof country === 'string'
        ? item.target_companies_per_country
        : country.target_companies || item.target_companies_per_country,
    }, countryIndex));
  });
}

function truncateText(value, max = 70) {
  const text = String(value || '').trim();
  if (!text) return '-';
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function recordKey(item, index = 0) {
  return item?.company_id || `${item?.product_country_key || 'record'}-${index}`;
}

async function apiFetch(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'x-employee-portal-key': PORTAL_KEY,
      ...(options.headers || {}),
    },
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.message || `Request failed with ${res.status}`);
  return data;
}

function companyCompletionPercent(item) {
  const requiredFields = [
    'company_id',
    'company_name',
    'country',
    'product_country_key',
    'company_briefing',
    'brands',
    'supply_requested',
    'email',
    'phone',
    'type',
  ];

  const normalized = normalizeCompanyRecord(item);
  const filled = requiredFields.filter((field) => String(normalized?.[field] || '').trim()).length;
  return Math.round((filled / requiredFields.length) * 100);
}

function statusLabel(percent) {
  if (percent >= 100) return 'Completed';
  if (percent <= 0) return 'Not Started';
  return `${percent}% Complete`;
}

function statusClass(percent) {
  if (percent >= 100) return 'status-completed';
  if (percent <= 0) return 'status-not-started';
  if (percent < 25) return 'status-low';
  return 'status-progress';
}

function getCognitoGroups(profile = {}) {
  const rawGroups = profile?.['cognito:groups'] ?? profile?.cognito_groups ?? [];

  if (Array.isArray(rawGroups)) {
    return rawGroups.map((group) => String(group).trim()).filter(Boolean);
  }

  return String(rawGroups || '')
    .split(',')
    .map((group) => group.trim())
    .filter(Boolean);
}

function PortalApp() {
  const auth = useAuth();

  const employeeEmail = auth.user?.profile?.email || '';
  // The only portal administrator. Cognito group membership does not grant
  // administration in this UI; all other authenticated users are associates.
  const isAdjudicator = String(employeeEmail).trim().toLowerCase() === ADMIN_EMAIL;

  const employeeDisplayName =
    auth.user?.profile?.name ||
    employeeEmail ||
    localStorage.getItem('rbr_employee_name') ||
    '';

  const [employeeName, setEmployeeName] = useState(employeeDisplayName);
  const [form, setForm] = useState(emptyForm);
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState([]);
  const [query, setQuery] = useState({ country: '', product: '', text: '', type: '', status: '' });
  const [expandedCompanyId, setExpandedCompanyId] = useState('');
  const [hasLoadedRecords, setHasLoadedRecords] = useState(false);
  const [isRecordModalOpen, setIsRecordModalOpen] = useState(false);
  const [showAdvancedFields, setShowAdvancedFields] = useState(false);
  const [activeView, setActiveView] = useState(isAdjudicator ? 'dashboard' : 'myRecords');
  useEffect(() => { if (!isAdjudicator) setActiveView((view) => ['dashboard', 'completedRecords'].includes(view) ? 'myRecords' : view); }, [isAdjudicator]);
  const [saveNotice, setSaveNotice] = useState(null);
  const [entryRequest, setEntryRequest] = useState(null);
  const [requests, setRequests] = useState([]);
  const [requestForm, setRequestForm] = useState(emptyRequestForm);
  const [requestMessage, setRequestMessage] = useState('');
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [savingRequest, setSavingRequest] = useState(false);
  const [hasLoadedRequests, setHasLoadedRequests] = useState(false);
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [expandedRequestId, setExpandedRequestId] = useState('');
  const [editingCompanyId, setEditingCompanyId] = useState('');
  const [deactivatingCompanyId, setDeactivatingCompanyId] = useState('');
  const uploadInputRef = useRef(null);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [uploadFileName, setUploadFileName] = useState('');
  const [uploadRows, setUploadRows] = useState([]);
  const [uploadMessage, setUploadMessage] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ processed: 0, total: 0 });
  const [uploadSummary, setUploadSummary] = useState(null);
  const [uploadPhase, setUploadPhase] = useState('idle');
  const [dropdownOptions, setDropdownOptions] = useState(() => ({
    countries: [...HARD_CODED_OPTIONS.countries],
    industries: [...HARD_CODED_OPTIONS.industries],
  }));
  const [optionDrafts, setOptionDrafts] = useState(() => ({
    countries: [...HARD_CODED_OPTIONS.countries],
    industries: [...HARD_CODED_OPTIONS.industries],
  }));
  const [newOption, setNewOption] = useState({ countries: '', industries: '' });
  const [optionsMessage, setOptionsMessage] = useState('');

  const isEditing = Boolean(editingCompanyId);
  const preview = useMemo(() => buildPayload(form, employeeName), [form, employeeName]);

  useEffect(() => {
    loadCompanies({}, 'initial');
  }, []);

  function resetDropdownDrafts() {
    setOptionDrafts({ countries: [...HARD_CODED_OPTIONS.countries], industries: [...HARD_CODED_OPTIONS.industries] });
    setDropdownOptions({ countries: [...HARD_CODED_OPTIONS.countries], industries: [...HARD_CODED_OPTIONS.industries] });
    setOptionsMessage('Restored the currently deployed dropdown choices.');
  }

  function addDropdownOption(key) {
    const value = newOption[key].trim().replace(/\s+/g, ' ');
    if (!value) return;
    if (optionDrafts[key].some((item) => item.toLowerCase() === value.toLowerCase())) {
      setOptionsMessage(`${value} is already in the ${key} list.`);
      return;
    }
    setOptionDrafts((prev) => ({ ...prev, [key]: [...prev[key], value].sort((a, b) => a.localeCompare(b)) }));
    setNewOption((prev) => ({ ...prev, [key]: '' }));
    setOptionsMessage('Changes are only a draft until you export and deploy them.');
  }

  function exportDropdownOptions() {
    if (!isAdjudicator) return;
    const cleaned = {};
    for (const key of ['countries', 'industries']) {
      const values = optionDrafts[key].map((value) => value.trim().replace(/\s+/g, ' ')).filter(Boolean);
      if (!values.length || new Set(values.map((value) => value.toLowerCase())).size !== values.length) {
        setOptionsMessage(`Please keep at least one unique, non-empty choice in ${key}.`);
        return;
      }
      cleaned[key] = values;
    }
    setDropdownOptions(cleaned); // Preview changes in this admin tab only.
    const content = `const HARD_CODED_OPTIONS = ${JSON.stringify(cleaned, null, 2)};\n`;
    const objectUrl = URL.createObjectURL(new Blob([content], { type: 'text/plain' }));
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = 'RBR_Hardcoded_Dropdown_Lists.txt';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(objectUrl);
    setOptionsMessage('Exported. Replace HARD_CODED_OPTIONS at the top of main.jsx with the downloaded constant, then redeploy Amplify. Employees will see the new list after deployment.');
  }

  async function signOutRedirect() {
    await auth.removeUser();

    const clientId = '7km97qil933t8gpe30gl4e9is9';
    const logoutUri = `${window.location.origin}/`;
    const cognitoDomain = 'https://ap-south-1ixh4ujl1x.auth.ap-south-1.amazoncognito.com';

    window.location.href = `${cognitoDomain}/logout?client_id=${clientId}&logout_uri=${encodeURIComponent(logoutUri)}`;
  }

  function setField(name, value) {
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  function validate() {
    if (!form.company_name.trim()) return 'Company name is mandatory.';
    if (!form.phone.trim()) return 'Company phone number is mandatory.';
    if (!form.country.trim()) return 'Please select a Country Name.';
    if (!form.industry.trim()) return 'Please select an Industry.';
    if (!dropdownOptions.countries.includes(form.country) || !dropdownOptions.industries.includes(form.industry)) {
      return 'The selected Country Name or Industry is not in the approved dropdown list. Reload the page and select again.';
    }
    return '';
  }

  async function saveCompany(e) {
    e.preventDefault();
    const linkedRequest = entryRequest;
    setStatus('');
    setSaveNotice(null);

    const error = validate();
    if (error) return setStatus(error);

    const effectiveEmployeeName = employeeName.trim() || employeeEmail || 'employee_portal';
    localStorage.setItem('rbr_employee_name', effectiveEmployeeName);
    setSaving(true);

    try {
      const payload = {
        ...buildPayload(form, effectiveEmployeeName),
        // New records get an explicit creation timestamp. Existing records keep
        // their original creation timestamp when they are updated later.
        created_at: isEditing
          ? (form.created_at || form.createdAt || form.created_on || form.createdOn || form.added_at || form.addedAt || '')
          : new Date().toISOString(),
        employee_email: employeeEmail,
        updated_by: employeeEmail || effectiveEmployeeName,
      };

      // Associates create records. Only Cognito Adjudicators can reach edit mode.
      const method = isEditing ? 'PUT' : 'POST';
      const data = await apiFetch(COMPANY_API_URL, {
        method,
        body: JSON.stringify(payload),
      });

      setStatus(isEditing ? 'Company updated successfully.' : 'Company saved successfully.');
      setSaveNotice({
        company: payload.company_name,
        companyId: data.item?.company_id || data.company_id || '',
        edited: isEditing,
      });
      if (!isAdjudicator) setActiveView('myRecords');

      if (data.item) {
        const normalizedItem = normalizeCompanyRecord(data.item);
        setResults((prev) => {
          const exists = prev.some((x) => x.company_id === normalizedItem.company_id);
          if (exists) {
            return prev.map((x) => (x.company_id === normalizedItem.company_id ? normalizedItem : x));
          }
          return [normalizedItem, ...prev];
        });
      } else if (linkedRequest) {
        await loadCompanies({}, 'request-progress');
      }

      if (linkedRequest) {
        setRequestMessage(`${payload.company_name} saved for ${linkedRequest.product} in ${linkedRequest.country}.`);
      }

      setForm(emptyForm);
      setEditingCompanyId('');
      setEntryRequest(null);
      setIsRecordModalOpen(false);
      setShowAdvancedFields(false);
      // Reload from DynamoDB, rather than displaying the company's overall statistics.
      if (!isAdjudicator) await loadCompanies({}, 'employee-refresh');
    } catch (err) {
      setStatus(err.message || 'Save failed.');
    } finally {
      setSaving(false);
    }
  }

  async function loadCompanies(filters = {}, mode = 'filter') {
    setLoading(true);
    setStatus('');

    try {
      const params = new URLSearchParams();
      if (filters.country) params.set('country', filters.country);
      if (filters.product) params.set('product', filters.product);
      if (filters.text) params.set('q', filters.text);
      if (filters.type) params.set('type', filters.type);

      const queryString = params.toString();
      const data = await apiFetch(`${COMPANY_API_URL}${queryString ? `?${queryString}` : ''}`);
      const items = (data.items || [])
        .map(normalizeCompanyRecord)
        .filter((item) => item.active !== false)
        .filter(wasCompanyCreatedSinceCutoff);

      setResults(items);
      setHasLoadedRecords(true);
      setExpandedCompanyId('');

      if (!items.length) {
        if (mode !== 'employee-refresh') setStatus(mode === 'initial' ? 'No company records created since 26 Sep 2026 were found.' : 'No matching companies found.');
      } else if (mode === 'initial') {
        setStatus(`Loaded ${items.length} company record${items.length === 1 ? '' : 's'} created since 26 Sep 2026.`);
      }
    } catch (err) {
      setStatus(err.message || 'Company records could not be loaded.');
    } finally {
      setLoading(false);
    }
  }

  async function loadRequests(mode = 'load') {
    setLoadingRequests(true);
    setRequestMessage('');

    try {
      const data = await apiFetch(REQUESTS_API_URL);
      const items = expandRequestRecords(data.items || data.requests || []);
      setRequests(items);
      setHasLoadedRequests(true);
      setExpandedRequestId('');

      if (!items.length) {
        setRequestMessage('No collection requests have been created yet.');
      } else if (mode === 'open') {
        setRequestMessage(`Loaded ${items.length} country request${items.length === 1 ? '' : 's'}.`);
      }
    } catch (err) {
      setHasLoadedRequests(true);
      setRequestMessage(err.message || 'Collection requests could not be loaded.');
    } finally {
      setLoadingRequests(false);
    }
  }

  function validateRequest() {
    const countries = parseCountries(requestForm.countries_text);
    const target = Number(requestForm.target_companies_per_country);

    if (!employeeName.trim()) return 'Please enter the employee name before creating a request.';
    if (!requestForm.product.trim()) return 'Product name is mandatory.';
    if (!countries.length) return 'Please enter at least one country.';
    if (!Number.isInteger(target) || target < 1) return 'Target companies per country must be a whole number greater than zero.';
    return '';
  }

  async function saveCollectionRequest(e) {
    e.preventDefault();
    if (!isAdjudicator) { setRequestMessage('Only the administrator can create collection requests.'); return; }
    setRequestMessage('');
    const error = validateRequest();
    if (error) return setRequestMessage(error);

    const countries = parseCountries(requestForm.countries_text);
    const now = new Date().toISOString();
    const payload = {
      product: requestForm.product.trim(),
      product_key: normalizeUnderscore(requestForm.product),
      countries,
      country_keys: countries.map(normalizeUnderscore),
      target_companies_per_country: Number(requestForm.target_companies_per_country),
      priority: Number(requestForm.priority || 3),
      assigned_to: requestForm.assigned_to.trim(),
      due_date: requestForm.due_date || '',
      instructions: requestForm.instructions.trim(),
      status: 'Open',
      created_by: employeeName.trim(),
      employee_email: employeeEmail,
      created_at: now,
      updated_at: now,
    };

    localStorage.setItem('rbr_employee_name', employeeName.trim());
    setSavingRequest(true);

    try {
      const data = await apiFetch(REQUESTS_API_URL, {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      const created = expandRequestRecords(data.items || data.requests || (data.item ? [data.item] : []));
      if (created.length) {
        setRequests((previous) => {
          const map = new Map(previous.map((item) => [item.request_id, item]));
          created.forEach((item) => map.set(item.request_id, item));
          return Array.from(map.values());
        });
      } else {
        await loadRequests();
      }

      setRequestMessage(`Created ${countries.length} country request${countries.length === 1 ? '' : 's'} for ${requestForm.product.trim()}.`);
      setRequestForm(emptyRequestForm);
      setIsRequestModalOpen(false);
    } catch (err) {
      setRequestMessage(err.message || 'Collection request could not be created.');
    } finally {
      setSavingRequest(false);
    }
  }

  function resetUploadState() {
    setUploadFileName('');
    setUploadRows([]);
    setUploadMessage('');
    setUploadSummary(null);
    setUploadProgress({ processed: 0, total: 0 });
    setUploadPhase('idle');
    if (uploadInputRef.current) uploadInputRef.current.value = '';
  }

  function closeUploadModal() {
    if (uploading) return;
    setIsUploadModalOpen(false);
    resetUploadState();
  }

  function downloadExcelTemplate() {
    const sampleRow = {
      company_name: 'Example Importer Ltd',
      country: 'Malaysia',
      product: 'Readymade Garments',
      type: 'Importer',
      brands: 'Example Brand',
      company_briefing: 'Replace this sample row with company information.',
      supply_requested: 'Private label garments',
      email: 'buyer@example.com',
      phone: '+60123456789',
      website: 'https://example.com',
      address: '',
      city: 'Kuala Lumpur',
      priority: 3,
      contact_person: '',
      designation: '',
      imports_from_india: 'Unknown',
      source_name: 'Company website',
      source_url: 'https://example.com',
      notes: '',
      verified: true,
      active: true,
    };

    const worksheet = XLSX.utils.json_to_sheet([sampleRow], { header: EXCEL_COLUMNS });
    worksheet['!cols'] = EXCEL_COLUMNS.map((column) => ({
      wch: ['company_briefing', 'supply_requested', 'address', 'notes'].includes(column) ? 34 : 20,
    }));

    const instructions = XLSX.utils.aoa_to_sheet([
      ['RBR Company Upload Instructions'],
      ['Rule', 'Explanation'],
      ['New companies only', 'Every valid row creates a new company. The backend generates the permanent sequential company ID.'],
      ['No updates in Excel', 'Do not include company_id. Existing records can be changed only by an Adjudicator.'],
      ['Mandatory fields', 'company_name, country, product'],
      ['Deletion', 'Removing an Excel row never deactivates a DynamoDB record.'],
      ['Recommended batch size', `${EXCEL_BATCH_SIZE} records are sent per API request automatically.`],
    ]);
    instructions['!cols'] = [{ wch: 28 }, { wch: 90 }];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Companies Upload');
    XLSX.utils.book_append_sheet(workbook, instructions, 'Instructions');
    XLSX.writeFile(workbook, 'RBR_Company_Upload_Template.xlsx');
  }

  async function handleExcelFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploadPhase('reading');
    setUploadMessage('Opening the workbook and reading the first worksheet...');
    setUploadSummary(null);
    setUploadRows([]);
    setUploadFileName(file.name);
    setIsUploadModalOpen(true);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: false });
      const firstSheetName = workbook.SheetNames[0];
      if (!firstSheetName) throw new Error('The workbook does not contain a worksheet.');

      const rawRows = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheetName], {
        defval: '',
        raw: false,
      });

      if (!rawRows.length) {
        throw new Error('No company rows were found in the first worksheet.');
      }

      setUploadPhase('verifying');
      setUploadMessage(`Verifying ${rawRows.length} new company row${rawRows.length === 1 ? '' : 's'}...`);

      const validatedRows = rawRows.map((rawRow, index) => {
        const row = normalizeExcelRow(rawRow, index);
        const errors = [];

        if (row._supplied_company_id) {
          errors.push(
            'company_id is not allowed in associate uploads. Existing records can be changed only by an Adjudicator.'
          );
        }

        if (!String(row.company_name || '').trim()) errors.push('company_name is mandatory.');
        if (!String(row.country || '').trim()) errors.push('country is mandatory.');
        if (!String(row.product || '').trim()) errors.push('product is mandatory.');

        return { ...row, _errors: errors };
      });

      const validCount = validatedRows.filter((row) => !row._errors.length).length;
      const invalidCount = validatedRows.length - validCount;

      setUploadRows(validatedRows);
      setUploadPhase('ready');
      setUploadMessage(
        `Verification complete: ${validCount} row${validCount === 1 ? '' : 's'} ready and ` +
        `${invalidCount} row${invalidCount === 1 ? '' : 's'} requiring correction.`
      );
    } catch (error) {
      setUploadRows([]);
      setUploadPhase('failed');
      setUploadMessage(error.message || 'The Excel file could not be read.');
    } finally {
      if (uploadInputRef.current) uploadInputRef.current.value = '';
    }
  }

  async function importExcelRows() {
    const validRows = uploadRows.filter((row) => !row._errors.length);
    if (!validRows.length) {
      setUploadPhase('failed');
      setUploadMessage('There are no valid rows to import. Correct the validation errors and upload the file again.');
      return;
    }

    setUploading(true);
    setUploadPhase('uploading');
    setUploadMessage(`Uploading 0 of ${validRows.length} valid rows...`);
    setUploadSummary(null);
    setUploadProgress({ processed: 0, total: validRows.length });

    const aggregate = {
      total: validRows.length,
      created: 0,
      failed: 0,
      results: [],
      errors: [],
    };

    try {
      const batches = chunkRows(validRows, EXCEL_BATCH_SIZE);
      let processed = 0;

      for (const [batchIndex, batch] of batches.entries()) {
        const rowsForApi = batch.map(({ _errors, _supplied_company_id, ...row }) => row);
        setUploadMessage(
          `Uploading batch ${batchIndex + 1} of ${batches.length} ` +
          `(${processed} of ${validRows.length} rows processed)...`
        );

        try {
          const response = await apiFetch(COMPANY_API_URL, {
            method: 'POST',
            body: JSON.stringify({
              action: 'bulk_import',
              employee_name: employeeName.trim(),
              employee_email: employeeEmail,
              rows: rowsForApi,
            }),
          });

          aggregate.created += Number(response.created || 0);
          aggregate.failed += Number(response.failed || 0);
          aggregate.results.push(...(response.results || []));
          aggregate.errors.push(...(response.errors || []));
        } catch (error) {
          aggregate.failed += batch.length;
          batch.forEach((row) => {
            aggregate.errors.push({
              excel_row: row._excel_row,
              message: error.message || 'The batch request failed.',
            });
          });
        }

        processed += batch.length;
        setUploadProgress({ processed, total: validRows.length });
        setUploadMessage(`Uploaded ${processed} of ${validRows.length} valid rows...`);
      }

      setUploadSummary(aggregate);
      setUploadPhase('syncing');
      setUploadMessage('Synchronising uploaded records with the company database...');
      await loadCompanies({}, 'initial');

      if (aggregate.failed === 0) {
        const successMessage =
          `Data upload success! ${aggregate.created} new compan${aggregate.created === 1 ? 'y was' : 'ies were'} created.`;
        setUploadPhase('success');
        setUploadMessage(successMessage);
        setStatus(successMessage);

        // Keep the success state visible briefly, then close and clear the popup.
        await new Promise((resolve) => window.setTimeout(resolve, 1800));
        setIsUploadModalOpen(false);
        resetUploadState();
        return;
      }

      const partialMessage =
        `Upload completed with issues: ${aggregate.created} created and ` +
        `${aggregate.failed} failed. Review the reasons below.`;
      setUploadPhase('failed');
      setUploadMessage(partialMessage);
      setStatus(partialMessage);
    } catch (error) {
      const failureMessage = error.message || 'The Excel upload failed unexpectedly.';
      setUploadPhase('failed');
      setUploadMessage(`Data upload failed: ${failureMessage}`);
      setStatus(`Excel upload failed: ${failureMessage}`);
    } finally {
      setUploading(false);
    }
  }

  async function searchCompanies() {
    await loadCompanies(query, 'filter');
  }

  function resetSearch() {
    const emptyQuery = { country: '', product: '', text: '', type: '', status: '' };
    setQuery(emptyQuery);
    loadCompanies(emptyQuery, 'initial');
  }


  function editCompany(item) {
    if (!isAdjudicator) { setStatus('Only the administrator can update company records.'); return; }
    const normalized = normalizeCompanyRecord(item);
    setEditingCompanyId(normalized.company_id || '');
    setEntryRequest(null);
    setForm({
      ...emptyForm,
      ...normalized,
      product: getCompanyProduct(normalized),
      country: getCompanyCountry(normalized),
      priority: String(normalized.priority || 3),
    });

    setShowAdvancedFields(false);
    setIsRecordModalOpen(true);
    setStatus(`Editing company: ${item.company_name}`);
  }

  async function deactivateCompany(item) {
    if (!isAdjudicator) {
      setStatus('Only an Adjudicator can deactivate a company record.');
      return;
    }

    const companyId = String(item.company_id || '').trim();
    if (!companyId) {
      setStatus('This record does not have a company ID and cannot be deactivated.');
      return;
    }

    const confirmed = window.confirm(
      `Deactivate ${item.company_name || companyId}?\n\n` +
      'The record will remain in DynamoDB with active set to false.'
    );
    if (!confirmed) return;

    setDeactivatingCompanyId(companyId);
    setStatus('');

    try {
      const payload = {
        ...normalizeCompanyRecord(item),
        active: false,
        employee_email: employeeEmail,
        updated_by: employeeEmail || employeeName.trim(),
        deactivated_at: new Date().toISOString(),
        deactivated_by: employeeEmail || employeeName.trim(),
      };

      await apiFetch(COMPANY_API_URL, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });

      setResults((previous) => previous.filter(
        (company) => String(company.company_id || '') !== companyId
      ));
      setExpandedCompanyId('');
      setStatus(
        `${item.company_name || companyId} was deactivated successfully. ` +
        'The DynamoDB record remains stored with active set to false.'
      );
    } catch (error) {
      setStatus(error.message || 'The company record could not be deactivated.');
    } finally {
      setDeactivatingCompanyId('');
    }
  }

  function newCompany() {
    setEditingCompanyId('');
    setEntryRequest(null);
    setForm(emptyForm);
    setShowAdvancedFields(false);
    setIsRecordModalOpen(true);
    setStatus('Ready for a new company entry.');
  }

  function closeRecordModal() {
    if (saving) return;
    setIsRecordModalOpen(false);
    setShowAdvancedFields(false);
    setEditingCompanyId('');
    setEntryRequest(null);
    setForm(emptyForm);
  }

  function addCompanyFromRequest(request) {
    setEditingCompanyId('');
    setEntryRequest(request);
    setForm({
      ...emptyForm,
      request_id: request.request_id,
      request_batch_id: request.batch_id || '',
      product: request.product,
      country: request.country,
      priority: String(request.priority || 3),
      notes: request.instructions || '',
    });
    setShowAdvancedFields(false);
    setIsRecordModalOpen(true);
    setStatus(`Adding ${request.product} importer for ${request.country}.`);
  }

  async function viewRequestCompanies(request) {
    const nextQuery = {
      country: request.country,
      product: request.product,
      text: '',
      type: '',
      status: '',
    };
    setQuery(nextQuery);
    setActiveView(isAdjudicator ? 'dashboard' : 'myRecords');
    await loadCompanies(nextQuery, 'filter');
  }

  function openDashboard() {
    setActiveView(isAdjudicator ? 'dashboard' : 'myRecords');
    setExpandedCompanyId('');
  }

  async function openRequests() {
    setActiveView('requests');
    setExpandedCompanyId('');
    await Promise.all([
      loadCompanies({}, 'request-progress'),
      loadRequests('open'),
    ]);
  }

  function openCompletedRecords() {
    if (!isAdjudicator) { setActiveView('myRecords'); return; }
    setActiveView('completedRecords');
    setExpandedCompanyId('');
  }

  const displayedResults = useMemo(() => {
    return results.filter((item) => {
      const percent = companyCompletionPercent(item);
      const typeMatch = !query.type || item.type === query.type;
      let statusMatch = true;

      if (query.status === 'Completed') statusMatch = percent >= 100;
      if (query.status === 'In Progress') statusMatch = percent > 0 && percent < 100;
      if (query.status === 'Not Started') statusMatch = percent <= 0;

      return typeMatch && statusMatch;
    });
  }, [results, query.type, query.status]);

  const dashboard = useMemo(() => {
    const total = displayedResults.length;
    const completionValues = displayedResults.map(companyCompletionPercent);
    const completed = completionValues.filter((value) => value >= 100).length;
    const notStarted = completionValues.filter((value) => value <= 0).length;
    const inProgress = Math.max(total - completed - notStarted, 0);
    const average = total
      ? Math.round(completionValues.reduce((sum, value) => sum + value, 0) / total)
      : 0;

    const bucketDefs = [
      { key: 'completed', label: '100% Completed', count: completionValues.filter((v) => v >= 100).length },
      { key: 'high', label: '75% - 99%', count: completionValues.filter((v) => v >= 75 && v < 100).length },
      { key: 'mid', label: '50% - 74%', count: completionValues.filter((v) => v >= 50 && v < 75).length },
      { key: 'low', label: '25% - 49%', count: completionValues.filter((v) => v >= 25 && v < 50).length },
      { key: 'started', label: '1% - 24%', count: completionValues.filter((v) => v > 0 && v < 25).length },
      { key: 'zero', label: '0% Not Started', count: completionValues.filter((v) => v <= 0).length },
    ];

    return { total, completed, inProgress, notStarted, average, bucketDefs };
  }, [displayedResults]);

  const myTodayRecords = useMemo(
    () => results.filter((item) => isMyRecordToday(item, employeeEmail)),
    [results, employeeEmail]
  );

  const completedRecords = useMemo(() => {
    return displayedResults.filter((item) => companyCompletionPercent(item) >= 100);
  }, [displayedResults]);

  const tableRecords = activeView === 'completedRecords' ? completedRecords : displayedResults;
  const tableTitle = activeView === 'completedRecords' ? 'Completed Records' : 'All Company Records';
  const tableEmptyMessage = activeView === 'completedRecords'
    ? 'No completed records found from the currently displayed company records.'
    : 'No matching company records found.';

  const requestRows = useMemo(() => {
    return requests.map((request) => {
      const matching = results.filter((company) => (
        normalizeUnderscore(getCompanyProduct(company)) === normalizeUnderscore(request.product) &&
        normalizeUnderscore(getCompanyCountry(company)) === normalizeUnderscore(request.country)
      ));
      const completedDetails = matching.filter((company) => companyCompletionPercent(company) >= 100).length;
      const collected = matching.length;
      const target = Math.max(Number(request.target_companies || 1), 1);
      const percent = Math.min(100, Math.round((collected / target) * 100));
      const derivedStatus = collected >= target ? 'Completed' : collected > 0 ? 'In Progress' : request.status || 'Open';

      return {
        ...request,
        collected,
        completedDetails,
        percent,
        derivedStatus,
      };
    });
  }, [requests, results]);

  const requestStats = useMemo(() => {
    const total = requestRows.length;
    const completed = requestRows.filter((item) => item.derivedStatus === 'Completed').length;
    const inProgress = requestRows.filter((item) => item.derivedStatus === 'In Progress').length;
    const open = Math.max(total - completed - inProgress, 0);
    const countries = new Set(requestRows.map((item) => normalizeUnderscore(item.country)).filter(Boolean)).size;
    const targetCompanies = requestRows.reduce((sum, item) => sum + Number(item.target_companies || 0), 0);
    return { total, completed, inProgress, open, countries, targetCompanies };
  }, [requestRows]);

  const progressSegments = useMemo(() => {
    const total = dashboard.total || 1;
    return [
      { key: 'completed', label: 'Completed', value: dashboard.completed, colorClass: 'green', percent: Math.round((dashboard.completed / total) * 100) },
      { key: 'progress', label: 'In Progress', value: dashboard.inProgress, colorClass: 'blue', percent: Math.round((dashboard.inProgress / total) * 100) },
      { key: 'not-started', label: 'Not Started', value: dashboard.notStarted, colorClass: 'orange', percent: Math.round((dashboard.notStarted / total) * 100) },
    ];
  }, [dashboard]);

  return (
    <div className="dashboard-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon"><Search size={25} /></div>
          <span>RBR ASSIGNER</span>
        </div>

        <nav className="sidebar-nav">
          {isAdjudicator && (
            <button type="button" className={`nav-item ${activeView === 'dashboard' ? 'active' : ''}`} onClick={openDashboard}>
              <LayoutDashboard size={21} /> Dashboard
            </button>
          )}
          <button type="button" className={`nav-item ${activeView === 'myRecords' ? 'active' : ''}`} onClick={() => { setActiveView('myRecords'); setExpandedCompanyId(''); loadCompanies({}, 'employee-refresh'); }}>
            <Database size={21} /> Record Submission
          </button>
          <button type="button" className={`nav-item ${activeView === 'requests' ? 'active' : ''}`} onClick={openRequests}><ClipboardList size={21} /> Requests</button>
          {isAdjudicator && <div className="nav-group">
            <button type="button" className={`nav-item ${activeView === 'completedRecords' ? 'parent-active' : ''}`}>
              <Users size={21} /> Associates
            </button>
            <button
              type="button"
              className={`nav-sub-item ${activeView === 'completedRecords' ? 'active' : ''}`}
              onClick={openCompletedRecords}
            >
              <CheckCircle2 size={18} />
              <span>Completed Records</span>
              <em>{dashboard.completed}</em>
            </button>
          </div>}
          {isAdjudicator && <button type="button" className="nav-item"><FileText size={21} /> Reports</button>}
          {isAdjudicator && <button type="button" className={`nav-item ${activeView === 'settings' ? 'active' : ''}`} onClick={() => { setActiveView('settings'); setOptionsMessage(''); }}><Settings size={21} /> Dropdown Settings</button>}
        </nav>

        <button type="button" className="nav-item logout" onClick={signOutRedirect}>
          <LogOut size={21} /> Logout
        </button>
      </aside>

      <main className="dashboard-main">
        <header className="dashboard-topbar">
          <div>
            <h1>{activeView === 'requests' ? 'Import Company Collection Requests' : activeView === 'myRecords' ? 'Record Submission' : activeView === 'settings' ? 'Dropdown Settings' : activeView === 'completedRecords' ? 'Completed Records' : 'RBR - Company Data Entry Dashboard'}</h1>
            <p>
              {activeView === 'requests'
                ? 'Create one product request across multiple countries, track the target for each country, and open a prefilled company-entry form for associates.'
                : activeView === 'myRecords'
                  ? 'Add company records and review the records you submitted today.'
                : activeView === 'settings'
                  ? 'Manage the Country Name and Industry choices available in the employee Add Record form.'
                : activeView === 'completedRecords'
                  ? 'This segment shows only the records marked as completed from the company records currently displayed in the portal.'
                  : 'Company records are loaded from DynamoDB table rbrmain-import_export_companies. Each record should include company, contact, brands, supply requirement, and briefing details.'}
            </p>
          </div>

          <div className="topbar-actions">
            <button className="notification-button" aria-label="Notifications">
              <Bell size={24} />
              <span>4</span>
            </button>
            <div className="admin-chip">
              <UserCircle size={38} />
              <div>
                <b>{employeeName || 'Admin'}</b>
                <small>
                  {employeeEmail || 'Employee Portal'}
                  {isAdjudicator ? ' · Adjudicator' : ' · Data Entry'}
                </small>
              </div>
              <ChevronDown size={18} />
            </div>
          </div>
        </header>

        {isAdjudicator && activeView === 'settings' && (
          <section className="panel" style={{ padding: 24, marginBottom: 22 }}>
            <h3>Manage Add Record Dropdowns</h3>
            <p>Edit the lists here, then export the updated values and replace HARD_CODED_OPTIONS in the React source before deploying. Changes are not shared until deployment.</p>
            <div className="modal-form" style={{ marginTop: 20 }}>
                {[
                  { key: 'countries', title: 'Country Name' },
                  { key: 'industries', title: 'Industry' },
                ].map(({ key, title }) => (
                  <div key={key} style={{ minWidth: 0 }}>
                    <h4>{title} choices ({optionDrafts[key].length})</h4>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                      <input aria-label={`Add ${title}`} placeholder={`Enter new ${title.toLowerCase()}`}
                        value={newOption[key]}
                        onChange={(e) => setNewOption((prev) => ({ ...prev, [key]: e.target.value }))}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addDropdownOption(key); } }} />
                      <button type="button" className="secondary" onClick={() => addDropdownOption(key)}><Plus size={16} /> Add</button>
                    </div>
                    <div style={{ maxHeight: 330, overflowY: 'auto', display: 'grid', gap: 8 }}>
                      {optionDrafts[key].map((value, index) => (
                        <div key={`${key}-${index}`} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <input aria-label={`Edit ${title} ${value}`} value={value}
                            onChange={(e) => setOptionDrafts((prev) => ({ ...prev, [key]: prev[key].map((item, i) => i === index ? e.target.value : item) }))} />
                          <button type="button" className="secondary" title={`Remove ${value}`} aria-label={`Remove ${value}`}
                            onClick={() => setOptionDrafts((prev) => ({ ...prev, [key]: prev[key].filter((_, i) => i !== index) }))}>
                            <Trash2 size={16} />
                          </button>
                        </div>
                      ))}
                      {!optionDrafts[key].length && <p>No choices yet. Add one above.</p>}
                    </div>
                  </div>
                ))}
                <div className="span2" style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                  <button type="button" className="primary" onClick={exportDropdownOptions}>
                    <Save size={18} /> Export Lists for Deployment
                  </button>
                  <button type="button" className="secondary" onClick={resetDropdownDrafts}>Restore deployed lists</button>
                  {optionsMessage && <p role="status">{optionsMessage}</p>}
                </div>
              </div>
          </section>
        )}

        {activeView === 'dashboard' && isAdjudicator && (
          <>
                    <section className="stats-grid">
                      <div className="stat-card">
                        <div className="stat-icon icon-blue"><FileText size={27} /></div>
                        <div><p>Total Records</p><h2>{dashboard.total}</h2><span>DynamoDB records shown</span></div>
                      </div>
                      <div className="stat-card">
                        <div className="stat-icon icon-green"><CheckCircle2 size={30} /></div>
                        <div><p>Completed Records</p><h2>{dashboard.completed}</h2><span>All key fields added</span></div>
                      </div>
                      <div className="stat-card">
                        <div className="stat-icon icon-blue-soft"><Clock3 size={30} /></div>
                        <div><p>In Progress Records</p><h2>{dashboard.inProgress}</h2><span>Partially completed</span></div>
                      </div>
                      <div className="stat-card">
                        <div className="stat-icon icon-orange"><PauseCircle size={30} /></div>
                        <div><p>Not Started</p><h2>{dashboard.notStarted}</h2><span>No data entered</span></div>
                      </div>
                      <div className="stat-card">
                        <div className="stat-icon icon-purple"><TrendingUp size={30} /></div>
                        <div><p>Average Completion</p><h2>{dashboard.average}%</h2><span>Across displayed records</span></div>
                      </div>
                    </section>

                    <section className="overview-grid">
                      <article className="panel progress-panel">
                        <h3>Request Progress Overview</h3>
                        <div className="stacked-progress">
                          {progressSegments.map((segment) => (
                            <span
                              key={segment.key}
                              className={`segment ${segment.colorClass}`}
                              style={{ width: `${Math.max(segment.percent, segment.value ? 5 : 0)}%` }}
                            />
                          ))}
                        </div>
                        <div className="progress-legend">
                          {progressSegments.map((segment) => (
                            <div key={segment.key}>
                              <span className={`dot ${segment.colorClass}`} />
                              <b>{segment.label} ({segment.value})</b>
                              <small>{dashboard.total ? `${segment.percent}%` : '0%'}</small>
                            </div>
                          ))}
                        </div>
                      </article>

                      <article className="panel distribution-panel">
                        <h3>Records by Progress</h3>
                        <div className="distribution-body">
                          <div className="donut" style={{ '--complete': `${dashboard.average * 3.6}deg` }}>
                            <span>{dashboard.average}%</span>
                          </div>
                          <div className="bucket-list">
                            {dashboard.bucketDefs.map((bucket) => (
                              <div key={bucket.key}>
                                <span className={`dot bucket-${bucket.key}`} />
                                <b>{bucket.label}</b>
                                <em>{bucket.count}</em>
                                <small>{dashboard.total ? `${((bucket.count / dashboard.total) * 100).toFixed(2)}%` : '0.00%'}</small>
                              </div>
                            ))}
                          </div>
                        </div>
                      </article>
                    </section>

          </>
        )}

        {activeView === 'requests' && (
          <>
            <section className="stats-grid">
              <div className="stat-card">
                <div className="stat-icon icon-blue"><ClipboardList size={27} /></div>
                <div><p>Country Requests</p><h2>{requestStats.total}</h2><span>Product-country assignments</span></div>
              </div>
              <div className="stat-card">
                <div className="stat-icon icon-green"><CheckCircle2 size={30} /></div>
                <div><p>Completed Targets</p><h2>{requestStats.completed}</h2><span>Target company count reached</span></div>
              </div>
              <div className="stat-card">
                <div className="stat-icon icon-blue-soft"><Clock3 size={30} /></div>
                <div><p>In Progress</p><h2>{requestStats.inProgress}</h2><span>Some companies collected</span></div>
              </div>
              <div className="stat-card">
                <div className="stat-icon icon-orange"><PauseCircle size={30} /></div>
                <div><p>Open</p><h2>{requestStats.open}</h2><span>Collection not started</span></div>
              </div>
              <div className="stat-card">
                <div className="stat-icon icon-purple"><TrendingUp size={30} /></div>
                <div><p>Total Target</p><h2>{requestStats.targetCompanies}</h2><span>Across {requestStats.countries} countries</span></div>
              </div>
            </section>

            <section className="panel requests-panel">
              <div className="section-title-row">
                <div>
                  <h3>Product and Country Collection Plan</h3>
                  <p style={{ margin: '6px 0 0', color: '#667085' }}>Each country becomes a separate trackable request under the selected product.</p>
                </div>
                <div className="table-actions">
                  {isAdjudicator && <button type="button" className="add-record-button" onClick={() => { setRequestForm(emptyRequestForm); setIsRequestModalOpen(true); setRequestMessage(''); }}>
                    <Plus size={17} /> New Request
                  </button>}
                  <button type="button" className="export-button" onClick={() => loadRequests('open')} disabled={loadingRequests}>
                    <RefreshCw size={17} /> {loadingRequests ? 'Refreshing...' : 'Refresh'}
                  </button>
                </div>
              </div>

              {requestMessage && <p className="status-message table-status">{requestMessage}</p>}

              <div className="table-wrap">
                <table className="data-table company-records-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Product</th>
                      <th>Country</th>
                      <th>Target</th>
                      <th>Collected</th>
                      <th>Complete Details</th>
                      <th>Progress</th>
                      <th>Status</th>
                      <th>Assigned To</th>
                      <th>Due Date</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {requestRows.map((request, index) => {
                      const isExpanded = expandedRequestId === request.request_id;
                      return (
                        <React.Fragment key={request.request_id}>
                          <tr>
                            <td>{index + 1}</td>
                            <td><b>{request.product || '-'}</b></td>
                            <td><b>{request.country || '-'}</b></td>
                            <td>{request.target_companies}</td>
                            <td>{request.collected}</td>
                            <td>{request.completedDetails}</td>
                            <td>
                              <div style={{ minWidth: 120 }}>
                                <div style={{ height: 8, borderRadius: 999, background: '#e9edf5', overflow: 'hidden' }}>
                                  <span style={{ display: 'block', width: `${request.percent}%`, height: '100%', background: request.percent >= 100 ? '#16a34a' : '#2563eb' }} />
                                </div>
                                <small>{request.percent}%</small>
                              </div>
                            </td>
                            <td><span className={`status-pill ${request.derivedStatus === 'Completed' ? 'status-completed' : request.derivedStatus === 'In Progress' ? 'status-progress' : 'status-not-started'}`}>{request.derivedStatus}</span></td>
                            <td>{request.assigned_to || 'Any associate'}</td>
                            <td>{request.due_date || '-'}</td>
                            <td>
                              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                <button type="button" className="filter-button" onClick={() => addCompanyFromRequest(request)}><Plus size={15} /> Add Company</button>
                                <button type="button" className="view-button" onClick={() => setExpandedRequestId(isExpanded ? '' : request.request_id)}><Eye size={15} /> {isExpanded ? 'Hide' : 'Details'}</button>
                              </div>
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr className="details-row">
                              <td colSpan="11">
                                <div className="details-grid">
                                  <div><span>Request ID</span><p>{request.request_id}</p></div>
                                  <div><span>Batch ID</span><p>{request.batch_id || '-'}</p></div>
                                  <div><span>Product-country key</span><p>{request.product_country_key}</p></div>
                                  <div><span>Priority</span><p>{request.priority}</p></div>
                                  <div><span>Created By</span><p>{request.created_by || '-'}</p></div>
                                  <div><span>Instructions</span><p>{request.instructions || '-'}</p></div>
                                  <div className="details-actions">
                                    <button type="button" className="filter-button" onClick={() => viewRequestCompanies(request)}><Eye size={15} /> View Collected Companies</button>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}

                    {!requestRows.length && (
                      <tr>
                        <td colSpan="11" className="empty-table">
                          {loadingRequests ? 'Loading collection requests...' : hasLoadedRequests ? 'No collection requests found.' : 'Open this segment or create the first request.'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="table-footer">
                <span>Showing {requestRows.length} country request{requestRows.length === 1 ? '' : 's'}</span>
              </div>
            </section>
          </>
        )}

        {isAdjudicator && activeView === 'completedRecords' && (
          <section className="panel completed-records-intro">
            <div>
              <h3><CheckCircle2 size={20} /> Completed Records</h3>
              <p>Showing records that have 100% completion based on the currently displayed DynamoDB records and active filters.</p>
            </div>
            <div className="completed-records-count">
              <span>{completedRecords.length}</span>
              <small>completed records</small>
            </div>
          </section>
        )}

        {activeView === 'myRecords' && (
          <section className="panel requests-panel">
            <div className="section-title-row">
              <div>
                <h3>My Records Submitted Today</h3>
                <p style={{ margin: '6px 0 0', color: '#667085' }}>
                  {indiaDateKey(new Date())} (India time) · {myTodayRecords.length} record{myTodayRecords.length === 1 ? '' : 's'}
                </p>
              </div>
              <div className="table-actions">
                <button type="button" className="add-record-button" onClick={newCompany}><Plus size={17} /> Add Record</button>
                <button type="button" className="export-button" onClick={() => loadCompanies({}, 'employee-refresh')} disabled={loading}>
                  <RefreshCw size={17} /> {loading ? 'Refreshing...' : 'Refresh'}
                </button>
              </div>
            </div>
            {saveNotice && (
              <div role="status" style={{ background: '#ecfdf3', border: '1px solid #a6f4c5', color: '#067647', borderRadius: 12, padding: '16px 18px', marginBottom: 16, display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <CheckCircle2 size={24} />
                <div style={{ flex: 1 }}>
                  <b>{saveNotice.edited ? 'Record updated successfully!' : 'Record added successfully!'}</b>
                  <p style={{ margin: '4px 0 0' }}>{saveNotice.company}{saveNotice.companyId ? ` · ID: ${saveNotice.companyId}` : ''}</p>
                </div>
                <button type="button" aria-label="Dismiss confirmation" onClick={() => setSaveNotice(null)} style={{ background: 'none', border: 0, cursor: 'pointer' }}><XCircle size={19} /></button>
              </div>
            )}
            {!employeeEmail && <p role="alert" className="status-message">Your login has no email claim. Contact the administrator to enable employee record tracking.</p>}
            <div className="table-wrap">
              <table className="data-table company-records-table">
                <thead><tr><th>#</th><th>Company ID</th><th>Company Name</th><th>Phone Number</th><th>Submitted At (IST)</th><th>Status</th></tr></thead>
                <tbody>
                  {myTodayRecords.map((item, index) => (
                    <tr key={recordKey(item, index)}>
                      <td>{index + 1}</td>
                      <td>{item.company_id || '-'}</td>
                      <td><b>{item.company_name || '-'}</b></td>
                      <td>{item.phone || '-'}</td>
                      <td>{new Date(getCompanyCreatedTimestamp(item)).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' })}</td>
                      <td><span className="status-pill status-completed">Saved</span></td>
                    </tr>
                  ))}
                  {!myTodayRecords.length && (
                    <tr><td colSpan="6" className="empty-table">{loading ? 'Loading today’s entries...' : 'No records submitted with this login today. Select Add Record to begin.'}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {isAdjudicator && activeView !== 'requests' && activeView !== 'myRecords' && (
        <section className="panel requests-panel">
          <div className="section-title-row">
            <h3>{tableTitle}</h3>
            <div className="table-actions">
              <input
                ref={uploadInputRef}
                type="file"
                accept=".xlsx,.xls"
                className="excel-file-input"
                onChange={handleExcelFile}
              />
              <button type="button" className="add-record-button" onClick={newCompany}>
                <Plus size={17} /> Add Record
              </button>
              <button type="button" className="upload-button" onClick={() => uploadInputRef.current?.click()}>
                <Upload size={17} /> Upload Excel
              </button>
              <button type="button" className="export-button" onClick={downloadExcelTemplate}>
                <Download size={17} /> Excel Template
              </button>
            </div>
          </div>

          <div className="filters-row">
            <input value={query.country} onChange={(e) => setQuery({ ...query, country: e.target.value })} placeholder="All Countries" />
            <input value={query.product} onChange={(e) => setQuery({ ...query, product: e.target.value })} placeholder="All Products" />
            <input value={query.text} onChange={(e) => setQuery({ ...query, text: e.target.value })} placeholder="Keyword / Company" />
            <select value={query.type} onChange={(e) => setQuery({ ...query, type: e.target.value })}>
              <option value="">All Types</option>
              {companyTypes.map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
            <select value={query.status} onChange={(e) => setQuery({ ...query, status: e.target.value })}>
              <option value="">All Status</option>
              <option value="Completed">Completed</option>
              <option value="In Progress">In Progress</option>
              <option value="Not Started">Not Started</option>
            </select>
            <button type="button" className="filter-button" onClick={searchCompanies} disabled={loading}>
              <RefreshCw size={16} /> {loading ? 'Searching...' : 'Filter'}
            </button>
            <button type="button" className="reset-button" onClick={resetSearch}>
              <RotateCcw size={15} /> Reset
            </button>
          </div>

          {status && <p className="status-message table-status">{status}</p>}

          <div className="table-wrap">
            <table className="data-table company-records-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>product_country_key</th>
                  <th>company_id</th>
                  <th>brands</th>
                  <th>company_briefing</th>
                  <th>company_name</th>
                  <th>country</th>
                  <th>email</th>
                  <th>phone</th>
                  <th>supply_requested</th>
                  <th>type</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {tableRecords.map((item, index) => {
                  const percent = companyCompletionPercent(item);
                  const rowKey = recordKey(item, index);
                  const isExpanded = expandedCompanyId === rowKey;
                  return (
                    <React.Fragment key={rowKey}>
                      <tr>
                        <td>{index + 1}</td>
                        <td><b>{item.product_country_key || '-'}</b></td>
                        <td><b>{item.company_id || '-'}</b></td>
                        <td>{truncateText(item.brands, 52)}</td>
                        <td>{truncateText(item.company_briefing, 64)}</td>
                        <td><b>{item.company_name || '-'}</b></td>
                        <td>{item.country || '-'}</td>
                        <td>{item.email || '-'}</td>
                        <td>{item.phone || '-'}</td>
                        <td>{truncateText(item.supply_requested, 64)}</td>
                        <td>{item.type || '-'}</td>
                        <td>
                          <button type="button" className="view-button" onClick={() => setExpandedCompanyId(isExpanded ? '' : rowKey)}>
                            <Eye size={15} /> {isExpanded ? 'Hide' : 'View'} Details
                          </button>
                        </td>
                      </tr>

                      {isExpanded && (
                        <tr className="details-row">
                          <td colSpan="12">
                            <div className="details-grid">
                              <div><span>product_country_key</span><p>{item.product_country_key || '-'}</p></div>
                              <div><span>company_id</span><p>{item.company_id || '-'}</p></div>
                              <div><span>brands</span><p>{item.brands || '-'}</p></div>
                              <div><span>company_briefing</span><p>{item.company_briefing || '-'}</p></div>
                              <div><span>company_name</span><p>{item.company_name || '-'}</p></div>
                              <div><span>country</span><p>{item.country || '-'}</p></div>
                              <div><span>email</span><p>{item.email || '-'}</p></div>
                              <div><span>phone</span><p>{item.phone || '-'}</p></div>
                              <div><span>supply_requested</span><p>{item.supply_requested || '-'}</p></div>
                              <div><span>type</span><p>{item.type || '-'}</p></div>
                              <div><span>record_completeness</span><p><span className={`status-pill ${statusClass(percent)}`}>{statusLabel(percent)} · {percent}%</span></p></div>
                              <div className="details-actions">
                                <div style={{ display: 'flex', gap: 10, width: '100%', flexWrap: 'wrap' }}>
                                  <button
                                    type="button"
                                    className="filter-button"
                                    onClick={() => editCompany(item)}
                                    style={{ flex: '1 1 170px' }}
                                  >
                                    <Pencil size={15} /> Update Record
                                  </button>
                                  {isAdjudicator && (
                                    <button
                                      type="button"
                                      className="secondary"
                                      onClick={() => deactivateCompany(item)}
                                      disabled={deactivatingCompanyId === item.company_id}
                                      style={{
                                        flex: '1 1 170px',
                                        color: '#b42318',
                                        borderColor: '#f3b7b2',
                                        background: '#fff5f4',
                                      }}
                                    >
                                      <Trash2 size={15} />
                                      {deactivatingCompanyId === item.company_id ? 'Deactivating...' : 'Deactivate'}
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}

                {!tableRecords.length && (
                  <tr>
                    <td colSpan="12" className="empty-table">
                      {loading ? 'Loading company records from DynamoDB...' : hasLoadedRecords ? tableEmptyMessage : 'Company records will appear here after loading.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="table-footer">
            <span>Showing {tableRecords.length ? `1 to ${tableRecords.length}` : '0'} of {tableRecords.length} records</span>
            <div className="pagination"><button disabled>‹</button><button className="active">1</button><button disabled>›</button><select defaultValue="10"><option>10</option><option>25</option><option>50</option></select></div>
          </div>
        </section>
        )}

        {isRequestModalOpen && (
          <div className="modal-overlay" role="presentation">
            <section className="record-modal" role="dialog" aria-modal="true" aria-labelledby="request-modal-title">
              <div className="modal-head">
                <div>
                  <h3 id="request-modal-title">Create Importer Collection Request</h3>
                  <p>Enter one product and all countries required. The backend will create one trackable request per country.</p>
                </div>
                <button type="button" className="modal-close" onClick={() => !savingRequest && setIsRequestModalOpen(false)} aria-label="Close popup">
                  <XCircle size={22} />
                </button>
              </div>

              <label className="employee-label">
                Request Created By
                <input value={employeeName} onChange={(e) => setEmployeeName(e.target.value)} placeholder="Example: Rajan / Priya" />
              </label>

              <form onSubmit={saveCollectionRequest} className="modal-form">
                <label className="span2">Product Name *
                  <input value={requestForm.product} onChange={(e) => setRequestForm({ ...requestForm, product: e.target.value })} placeholder="Example: Readymade Garments" />
                </label>
                <label className="span2">Countries *
                  <textarea value={requestForm.countries_text} onChange={(e) => setRequestForm({ ...requestForm, countries_text: e.target.value })} rows="5" placeholder={'Malaysia\nSingapore\nUnited Arab Emirates\nSaudi Arabia'} />
                  <small>Enter one country per line, or separate countries with commas.</small>
                </label>
                <label>Target Companies Per Country *
                  <input type="number" min="1" step="1" value={requestForm.target_companies_per_country} onChange={(e) => setRequestForm({ ...requestForm, target_companies_per_country: e.target.value })} />
                </label>
                <label>Priority
                  <select value={requestForm.priority} onChange={(e) => setRequestForm({ ...requestForm, priority: e.target.value })}>
                    <option value="1">1 - Highest</option>
                    <option value="2">2 - High</option>
                    <option value="3">3 - Normal</option>
                    <option value="4">4 - Low</option>
                    <option value="5">5 - Lowest</option>
                  </select>
                </label>
                <label>Assign To
                  <input value={requestForm.assigned_to} onChange={(e) => setRequestForm({ ...requestForm, assigned_to: e.target.value })} placeholder="Employee name or leave blank" />
                </label>
                <label>Due Date
                  <input type="date" value={requestForm.due_date} onChange={(e) => setRequestForm({ ...requestForm, due_date: e.target.value })} />
                </label>
                <label className="span2">Research Instructions
                  <textarea value={requestForm.instructions} onChange={(e) => setRequestForm({ ...requestForm, instructions: e.target.value })} rows="3" placeholder="Example: Focus on active importers, distributors, retail chains and buying houses. Verify the source URL." />
                </label>

                <div className="mini-preview span2">
                  <h4><BarChart3 size={17} /> Request Preview</h4>
                  <div className="mini-preview-grid">
                    <p><b>Product key:</b> {normalizeUnderscore(requestForm.product) || '-'}</p>
                    <p><b>Countries:</b> {parseCountries(requestForm.countries_text).length}</p>
                    <p><b>Total target:</b> {parseCountries(requestForm.countries_text).length * Number(requestForm.target_companies_per_country || 0)}</p>
                    <p><b>Country list:</b> {parseCountries(requestForm.countries_text).join(', ') || '-'}</p>
                  </div>
                </div>

                {requestMessage && <p className="status-message span2">{requestMessage}</p>}

                <div className="modal-actions span2">
                  <button type="button" className="secondary" onClick={() => setIsRequestModalOpen(false)} disabled={savingRequest}>Cancel</button>
                  <button className="primary" disabled={savingRequest}>
                    <Save size={18} /> {savingRequest ? 'Creating...' : 'Create Country Requests'}
                  </button>
                </div>
              </form>
            </section>
          </div>
        )}

        {isUploadModalOpen && (
          <div className="modal-overlay" role="presentation">
            <section className="record-modal upload-modal" role="dialog" aria-modal="true" aria-labelledby="upload-modal-title">
              <div className="modal-head">
                <div>
                  <h3 id="upload-modal-title"><Upload size={20} /> Upload Company Excel</h3>
                  <p>
                    Every valid row creates a new company with a backend-generated sequential ID.
                    Existing records cannot be updated through Excel.
                  </p>
                </div>
                <button type="button" className="modal-close" onClick={closeUploadModal} aria-label="Close upload popup">
                  <XCircle size={22} />
                </button>
              </div>

              <div className="upload-summary-strip">
                <div><span>File</span><b>{uploadFileName || '-'}</b></div>
                <div><span>Total rows</span><b>{uploadRows.length}</b></div>
                <div><span>Ready</span><b>{uploadRows.filter((row) => !row._errors.length).length}</b></div>
                <div><span>Invalid</span><b>{uploadRows.filter((row) => row._errors.length).length}</b></div>
              </div>

              <div className={`upload-stage-card upload-stage-${uploadPhase}`}>
                <div className="upload-stage-heading">
                  <span className={`upload-stage-symbol ${['reading', 'verifying', 'uploading', 'syncing'].includes(uploadPhase) ? 'is-spinning' : ''}`}>
                    {uploadPhase === 'success'
                      ? <CheckCircle2 size={24} />
                      : uploadPhase === 'failed'
                        ? <XCircle size={24} />
                        : <RefreshCw size={24} />}
                  </span>
                  <div>
                    <b>{uploadPhaseTitle(uploadPhase)}</b>
                    <p>{uploadMessage || 'Choose an Excel file to begin.'}</p>
                  </div>
                </div>

                <div className="upload-step-track">
                  {UPLOAD_STEP_LABELS.map((label, index) => {
                    const activeIndex = uploadPhaseStepIndex(uploadPhase);
                    const stepClass = uploadPhase === 'failed'
                      ? (index < activeIndex ? 'done' : index === activeIndex ? 'failed' : 'pending')
                      : index < activeIndex
                        ? 'done'
                        : index === activeIndex
                          ? (uploadPhase === 'success' ? 'done' : 'active')
                          : 'pending';

                    return (
                      <div className={`upload-step ${stepClass}`} key={label}>
                        <span>{index + 1}</span>
                        <small>{label}</small>
                      </div>
                    );
                  })}
                </div>
              </div>

              {uploading && (
                <div className="upload-progress">
                  <div>
                    <span
                      style={{
                        width: `${uploadProgress.total ? Math.round((uploadProgress.processed / uploadProgress.total) * 100) : 0}%`,
                      }}
                    />
                  </div>
                  <small>{uploadProgress.processed} of {uploadProgress.total} valid rows processed</small>
                </div>
              )}

              {uploadSummary && (
                <div className="upload-result-grid">
                  <div><span>Created</span><b>{uploadSummary.created}</b></div>
                  <div><span>Failed</span><b>{uploadSummary.failed}</b></div>
                </div>
              )}

              <div className="upload-preview-wrap">
                <table className="data-table upload-preview-table">
                  <thead>
                    <tr>
                      <th>Excel Row</th>
                      <th>Action</th>
                      <th>company_name</th>
                      <th>country</th>
                      <th>product</th>
                      <th>Validation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {uploadRows.slice(0, 200).map((row) => (
                      <tr key={`${row._excel_row}-${row.company_name || 'row'}`}>
                        <td>{row._excel_row}</td>
                        <td>
                          <span className="status-pill status-completed">
                            Create
                          </span>
                        </td>
                        <td>{row.company_name || '-'}</td>
                        <td>{row.country || '-'}</td>
                        <td>{row.product || '-'}</td>
                        <td>
                          {row._errors.length
                            ? <span className="upload-error-text">{row._errors.join(' ')}</span>
                            : <span className="upload-valid-text">Ready</span>}
                        </td>
                      </tr>
                    ))}
                    {!uploadRows.length && (
                      <tr><td colSpan="6" className="empty-table">Select an Excel file to preview its rows.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              {uploadRows.length > 200 && (
                <small className="upload-preview-note">Preview shows the first 200 rows. All valid rows will still be imported.</small>
              )}

              {uploadSummary?.errors?.length > 0 && (
                <div className="upload-errors-panel">
                  <h4>Import errors</h4>
                  {uploadSummary.errors.slice(0, 50).map((error, index) => (
                    <p key={`${error.excel_row || 'row'}-${index}`}>
                      Row {error.excel_row || '-'}: {error.message}
                    </p>
                  ))}
                </div>
              )}

              <div className="modal-actions upload-modal-actions">
                <button type="button" className="secondary" onClick={closeUploadModal} disabled={uploading}>Close</button>
                <button type="button" className="secondary" onClick={downloadExcelTemplate} disabled={uploading}>
                  <Download size={17} /> Download Template
                </button>
                <button
                  type="button"
                  className="primary"
                  onClick={importExcelRows}
                  disabled={uploading || !uploadRows.some((row) => !row._errors.length)}
                >
                  <Upload size={17} /> {uploading ? 'Importing...' : 'Import Valid Rows'}
                </button>
              </div>
            </section>
          </div>
        )}

        {isRecordModalOpen && (
          <div className="modal-overlay" role="presentation">
            <section className="record-modal" role="dialog" aria-modal="true" aria-labelledby="record-modal-title">
              <div className="modal-head">
                <div>
                  <h3 id="record-modal-title">
                    {isEditing ? 'Update Company Record' : 'Add Company Record'}
                  </h3>
                  <p>
                    {isEditing
                      ? 'Update the company details below. More fields can be added later without losing this record.'
                      : 'Enter the company name and phone number, then select the country and industry.'}
                  </p>
                </div>
                <button type="button" className="modal-close" onClick={closeRecordModal} aria-label="Close popup">
                  <XCircle size={22} />
                </button>
              </div>

              <form onSubmit={saveCompany} className="modal-form">
                {entryRequest && (
                  <div className="mini-preview span2">
                    <h4><ClipboardList size={17} /> Linked Collection Request</h4>
                    <div className="mini-preview-grid">
                      <p><b>Product:</b> {entryRequest.product}</p>
                      <p><b>Country:</b> {entryRequest.country}</p>
                    </div>
                  </div>
                )}

                <label className="span2">
                  Company Name *
                  <input
                    value={form.company_name}
                    onChange={(e) => setField('company_name', e.target.value)}
                    placeholder="Enter company name"
                    autoFocus
                  />
                </label>

                <label className="span2">
                  Company Phone Number *
                  <input
                    value={form.phone}
                    onChange={(e) => setField('phone', e.target.value)}
                    placeholder="Enter phone number"
                  />
                </label>

                <label className="span2">
                  Country Name *
                  <select required value={form.country} 
                    onChange={(e) => setField('country', e.target.value)}>
                    <option value="">Select country</option>
                    {dropdownOptions.countries.map((value) => <option key={value} value={value}>{value}</option>)}
                  </select>
                </label>

                <label className="span2">
                  Industry *
                  <select required value={form.industry} 
                    onChange={(e) => setField('industry', e.target.value)}>
                    <option value="">Select industry</option>
                    {dropdownOptions.industries.map((value) => <option key={value} value={value}>{value}</option>)}
                  </select>
                </label>
                {(!dropdownOptions.countries.length || !dropdownOptions.industries.length) && (
                  <p className="status-message span2">Country and Industry lists must contain at least one option in the React source.</p>
                )}

                <div className="modal-actions span2">
                  <button type="button" className="secondary" onClick={closeRecordModal} disabled={saving}>Cancel</button>
                  <button className="primary" disabled={saving || !dropdownOptions.countries.length || !dropdownOptions.industries.length}>
                    <Save size={18} />{saving ? 'Saving...' : isEditing ? 'Update Record' : 'Save Record'}
                  </button>
                </div>
              </form>
            </section>
          </div>
        )}

      </main>
    </div>
  );
}

function App() {
  const auth = useAuth();

  if (auth.isLoading) {
    return <div className="auth-shell"><section className="auth-card"><h2>Loading...</h2></section></div>;
  }

  if (auth.error) {
    const rawMessage = String(auth.error.message || '');

    const friendlyMessage =
      rawMessage.toLowerCase().includes('access not approved') ||
      rawMessage.toLowerCase().includes('not approved') ||
      rawMessage.toLowerCase().includes('not authorized') ||
      rawMessage.toLowerCase().includes('preauthentication') ||
      rawMessage.toLowerCase().includes('presignup')
        ? 'This portal is restricted to approved RBR employee email IDs only. Please contact RBR admin if you need access.'
        : rawMessage || 'We could not complete sign-in. Please try again.';

    return (
      <div className="auth-shell">
        <section className="auth-card">
          <div className="auth-logo"><ShieldCheck size={34} /></div>
          <h1>Access not approved</h1>
          <p>{friendlyMessage}</p>
          <button className="primary" onClick={() => auth.signinRedirect()}>
            Back to sign in
          </button>
        </section>
      </div>
    );
  }

  if (!auth.isAuthenticated) {
    return (
      <div className="auth-shell">
        <section className="auth-card">
          <div className="auth-logo"><Search size={34} /></div>
          <h1>RBR Employee Portal</h1>
          <p>Please sign in with your approved employee email.</p>
          <button className="primary" onClick={() => auth.signinRedirect()}>
            Sign in / Sign up
          </button>
        </section>
      </div>
    );
  }

  return <PortalApp />;
}

const cognitoAuthConfig = {
  authority: 'https://cognito-idp.ap-south-1.amazonaws.com/ap-south-1_ixh4UjL1x',
  client_id: '7km97qil933t8gpe30gl4e9is9',
  redirect_uri: 'https://main.d399lp2wrw5lfc.amplifyapp.com/',
  response_type: 'code',
  scope: 'openid email',
};

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider {...cognitoAuthConfig}>
      <App />
    </AuthProvider>
  </React.StrictMode>
);
