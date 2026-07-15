import React, { useEffect, useMemo, useState } from 'react';
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
} from 'lucide-react';
import './styles.css';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';
const PORTAL_KEY = import.meta.env.VITE_EMPLOYEE_PORTAL_KEY || '';

const companyTypes = ['Importer', 'Retail Chain', 'Retailer', 'Distributor', 'Buying House', 'Wholesaler', 'Sourcing Agent', 'Agent', 'Ecommerce', 'Manufacturer', 'Other'];

const emptyForm = {
  company_id: '',
  company_name: '',
  country: '',
  product: '',
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
};

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

function truncateText(value, max = 70) {
  const text = String(value || '').trim();
  if (!text) return '-';
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function recordKey(item, index = 0) {
  return item?.company_id || `${item?.product_country_key || 'record'}-${index}`;
}

async function apiFetch(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
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

function PortalApp() {
  const auth = useAuth();

  const employeeEmail = auth.user?.profile?.email || '';
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
  const [activeView, setActiveView] = useState('dashboard');

  const isEditing = Boolean(form.company_id);
  const preview = useMemo(() => buildPayload(form, employeeName), [form, employeeName]);

  useEffect(() => {
    loadCompanies({}, 'initial');
  }, []);

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
    if (!employeeName.trim()) return 'Please enter employee name before saving.';
    if (!form.country.trim()) return 'Country is mandatory.';
    if (!form.product.trim()) return 'Product is mandatory.';
    if (!form.company_name.trim()) return 'Company name is mandatory.';
    return '';
  }

  async function saveCompany(e) {
    e.preventDefault();
    setStatus('');
    const error = validate();
    if (error) return setStatus(error);

    localStorage.setItem('rbr_employee_name', employeeName.trim());
    setSaving(true);

    try {
      const payload = {
        ...buildPayload(form, employeeName.trim()),
        employee_email: employeeEmail,
      };

      const path = isEditing
        ? `/employee-data-entry/${encodeURIComponent(form.company_id)}`
        : '/employee-data-entry';

      const method = isEditing ? 'PUT' : 'POST';
      const data = await apiFetch(path, { method, body: JSON.stringify(payload) });

      setStatus(isEditing ? 'Company updated successfully.' : 'Company saved successfully.');

      if (data.item) {
        const normalizedItem = normalizeCompanyRecord(data.item);
        setResults((prev) => {
          const exists = prev.some((x) => x.company_id === normalizedItem.company_id);
          if (exists) {
            return prev.map((x) => (x.company_id === normalizedItem.company_id ? normalizedItem : x));
          }
          return [normalizedItem, ...prev];
        });
      }

      setForm(emptyForm);
      setIsRecordModalOpen(false);
      setShowAdvancedFields(false);
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
      const data = await apiFetch(`/employee-data-entry${queryString ? `?${queryString}` : ''}`);
      const items = (data.items || []).map(normalizeCompanyRecord);

      setResults(items);
      setHasLoadedRecords(true);
      setExpandedCompanyId('');

      if (!items.length) {
        setStatus(mode === 'initial' ? 'No company records found in DynamoDB yet.' : 'No matching companies found.');
      } else if (mode === 'initial') {
        setStatus(`Loaded ${items.length} company record${items.length === 1 ? '' : 's'} from DynamoDB.`);
      }
    } catch (err) {
      setStatus(err.message || 'Company records could not be loaded.');
    } finally {
      setLoading(false);
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
    const normalized = normalizeCompanyRecord(item);
    setForm({
      ...emptyForm,
      ...normalized,
      product: getCompanyProduct(normalized),
      country: getCompanyCountry(normalized),
      priority: String(normalized.priority || 3),
    });

    setShowAdvancedFields(false);
    setIsRecordModalOpen(true);
    setStatus(`Editing: ${item.company_name}`);
  }

  function newCompany() {
    setForm(emptyForm);
    setShowAdvancedFields(false);
    setIsRecordModalOpen(true);
    setStatus('Ready for a new company entry.');
  }

  function closeRecordModal() {
    if (saving) return;
    setIsRecordModalOpen(false);
    setShowAdvancedFields(false);
    setForm(emptyForm);
  }

  function openDashboard() {
    setActiveView('dashboard');
    setExpandedCompanyId('');
  }

  function openCompletedRecords() {
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

  const completedRecords = useMemo(() => {
    return displayedResults.filter((item) => companyCompletionPercent(item) >= 100);
  }, [displayedResults]);

  const tableRecords = activeView === 'completedRecords' ? completedRecords : displayedResults;
  const tableTitle = activeView === 'completedRecords' ? 'Completed Records' : 'All Company Records';
  const tableEmptyMessage = activeView === 'completedRecords'
    ? 'No completed records found from the currently displayed company records.'
    : 'No matching company records found.';

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
          <button type="button" className={`nav-item ${activeView === 'dashboard' ? 'active' : ''}`} onClick={openDashboard}>
            <LayoutDashboard size={21} /> Dashboard
          </button>
          <button type="button" className="nav-item"><ClipboardList size={21} /> Requests</button>
          <div className="nav-group">
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
          </div>
          <button type="button" className="nav-item"><FileText size={21} /> Reports</button>
          <button type="button" className="nav-item"><Database size={21} /> Data Entry</button>
          <button type="button" className="nav-item"><Settings size={21} /> Settings</button>
        </nav>

        <button type="button" className="nav-item logout" onClick={signOutRedirect}>
          <LogOut size={21} /> Logout
        </button>
      </aside>

      <main className="dashboard-main">
        <header className="dashboard-topbar">
          <div>
            <h1>{activeView === 'completedRecords' ? 'Completed Records' : 'RBR - Company Data Entry Dashboard'}</h1>
            <p>
              {activeView === 'completedRecords'
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
                <small>{employeeEmail || 'Employee Portal'}</small>
              </div>
              <ChevronDown size={18} />
            </div>
          </div>
        </header>

        {activeView === 'dashboard' && (
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

        {activeView === 'completedRecords' && (
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

        <section className="panel requests-panel">
          <div className="section-title-row">
            <h3>{tableTitle}</h3>
            <div className="table-actions">
              <button type="button" className="add-record-button" onClick={newCompany}>
                <Plus size={17} /> Add Record
              </button>
              <button type="button" className="export-button">
                <Download size={17} /> Export <ChevronDown size={15} />
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
                                <button type="button" className="filter-button" onClick={() => editCompany(item)}>
                                  <Pencil size={15} /> Edit This Record
                                </button>
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

        {isRecordModalOpen && (
          <div className="modal-overlay" role="presentation">
            <section className="record-modal" role="dialog" aria-modal="true" aria-labelledby="record-modal-title">
              <div className="modal-head">
                <div>
                  <h3 id="record-modal-title">{isEditing ? 'Edit Company Record' : 'Add Company Record'}</h3>
                  <p>Enter only the key DynamoDB fields first. Extra internal fields are hidden under additional details.</p>
                </div>
                <button type="button" className="modal-close" onClick={closeRecordModal} aria-label="Close popup">
                  <XCircle size={22} />
                </button>
              </div>

              <label className="employee-label">
                Employee Name
                <input
                  value={employeeName}
                  onChange={(e) => setEmployeeName(e.target.value)}
                  placeholder="Example: Rajan / Priya"
                />
              </label>

              <form onSubmit={saveCompany} className="modal-form">
                <label>company_id<input value={form.company_id} onChange={(e) => setField('company_id', e.target.value)} placeholder="MY000002 or leave blank if Lambda generates" disabled={isEditing} /></label>
                <label>type
                  <select value={form.type} onChange={(e) => setField('type', e.target.value)}>
                    {companyTypes.map((t) => <option key={t}>{t}</option>)}
                  </select>
                </label>
                <label>country *<input value={form.country} onChange={(e) => setField('country', e.target.value)} placeholder="Malaysia" /></label>
                <label>product *<input value={form.product} onChange={(e) => setField('product', e.target.value)} placeholder="Readymade Garments" /></label>
                <label className="span2">company_name *<input value={form.company_name} onChange={(e) => setField('company_name', e.target.value)} placeholder="Padini Holdings Berhad" /></label>
                <label className="span2">brands<textarea value={form.brands} onChange={(e) => setField('brands', e.target.value)} rows="2" placeholder="Padini, Seed, Vincci, PDI" /></label>
                <label>email<input value={form.email} onChange={(e) => setField('email', e.target.value)} placeholder="purchasing@example.com" /></label>
                <label>phone<input value={form.phone} onChange={(e) => setField('phone', e.target.value)} placeholder="+60350211388" /></label>
                <label className="span2">supply_requested<textarea value={form.supply_requested} onChange={(e) => setField('supply_requested', e.target.value)} rows="2" placeholder="budget fashion, private label garments, seasonal collections" /></label>
                <label className="span2">company_briefing<textarea value={form.company_briefing} onChange={(e) => setField('company_briefing', e.target.value)} rows="3" placeholder="Large fashion retail group in Malaysia." /></label>

                <button type="button" className="advanced-toggle span2" onClick={() => setShowAdvancedFields((value) => !value)}>
                  {showAdvancedFields ? 'Hide Additional Details' : 'Show Additional Details'}
                </button>

                {showAdvancedFields && (
                  <div className="advanced-fields span2">
                    <label>Website<input value={form.website} onChange={(e) => setField('website', e.target.value)} placeholder="https://example.com" /></label>
                    <label>City<input value={form.city} onChange={(e) => setField('city', e.target.value)} placeholder="Kuala Lumpur" /></label>
                    <label className="span2">Address<textarea value={form.address} onChange={(e) => setField('address', e.target.value)} rows="2" /></label>
                    <label>Priority
                      <select value={form.priority} onChange={(e) => setField('priority', e.target.value)}>
                        <option value="1">1 - Highest</option>
                        <option value="2">2 - High</option>
                        <option value="3">3 - Normal</option>
                        <option value="4">4 - Low</option>
                        <option value="5">5 - Lowest</option>
                      </select>
                    </label>
                    <label>Contact Person<input value={form.contact_person} onChange={(e) => setField('contact_person', e.target.value)} /></label>
                    <label>Designation<input value={form.designation} onChange={(e) => setField('designation', e.target.value)} /></label>
                    <label>Imports From India
                      <select value={form.imports_from_india} onChange={(e) => setField('imports_from_india', e.target.value)}>
                        <option>Unknown</option>
                        <option>Yes</option>
                        <option>Likely</option>
                        <option>No</option>
                      </select>
                    </label>
                    <label>Source Name<input value={form.source_name} onChange={(e) => setField('source_name', e.target.value)} placeholder="Company website / Directory / Employee research" /></label>
                    <label className="span2">Source URL<input value={form.source_url} onChange={(e) => setField('source_url', e.target.value)} placeholder="https://..." /></label>
                    <label className="span2">Internal Notes<textarea value={form.notes} onChange={(e) => setField('notes', e.target.value)} rows="2" /></label>
                    <label className="toggle"><input type="checkbox" checked={form.verified} onChange={(e) => setField('verified', e.target.checked)} /> Verified</label>
                    <label className="toggle"><input type="checkbox" checked={form.active} onChange={(e) => setField('active', e.target.checked)} /> Active</label>
                  </div>
                )}

                <div className="mini-preview span2">
                  <h4><BarChart3 size={17} /> Auto Generated Keys</h4>
                  <div className="mini-preview-grid">
                    <p><b>product_country_key:</b> {preview.product_country_key || '-'}</p>
                    <p><b>country_key:</b> {preview.country_key || '-'}</p>
                    <p><b>product_key:</b> {preview.product_key || '-'}</p>
                    <p><b>company_key:</b> {preview.company_key || '-'}</p>
                  </div>
                </div>

                <div className="modal-actions span2">
                  <button type="button" className="secondary" onClick={closeRecordModal} disabled={saving}>Cancel</button>
                  <button className="primary" disabled={saving}>
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
