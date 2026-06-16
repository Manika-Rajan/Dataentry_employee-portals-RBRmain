import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AuthProvider, useAuth } from 'react-oidc-context';
import { Save, Search, Plus, Database, ShieldCheck, RefreshCw, Pencil, Upload, XCircle } from 'lucide-react';
import './styles.css';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';
const PORTAL_KEY = import.meta.env.VITE_EMPLOYEE_PORTAL_KEY || '';

const companyTypes = ['Importer', 'Retailer', 'Distributor', 'Buying House', 'Wholesaler', 'Sourcing Agent', 'Agent', 'Ecommerce', 'Manufacturer', 'Other'];

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
    .split(/[,.\n]/)
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
    country_key: countryKey,
    product_key: productKey,
    company_key: companyKey,
    search_terms: searchTerms,
    updated_at: now,
    added_by: employeeName || localStorage.getItem('rbr_employee_name') || 'employee_portal',
  };
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
  const [query, setQuery] = useState({ country: '', product: '', text: '' });

  const isEditing = Boolean(form.company_id);
  const preview = useMemo(() => buildPayload(form, employeeName), [form, employeeName]);

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
        ? `/export-companies/${encodeURIComponent(form.company_id)}`
        : '/export-companies';

      const method = isEditing ? 'PUT' : 'POST';
      const data = await apiFetch(path, { method, body: JSON.stringify(payload) });

      setStatus(isEditing ? 'Company updated successfully.' : 'Company saved successfully. You can enter the next company now.');

      if (isEditing) {
        setResults((prev) =>
          prev.map((x) => (x.company_id === data.item.company_id ? data.item : x))
        );
      }

      setForm(emptyForm);
    } catch (err) {
      setStatus(err.message || 'Save failed.');
    } finally {
      setSaving(false);
    }
  }

  async function searchCompanies() {
    setLoading(true);
    setStatus('');

    try {
      const params = new URLSearchParams();
      if (query.country) params.set('country', query.country);
      if (query.product) params.set('product', query.product);
      if (query.text) params.set('q', query.text);

      const data = await apiFetch(`/export-companies?${params.toString()}`);
      setResults(data.items || []);

      if (!data.items?.length) setStatus('No matching companies found.');
    } catch (err) {
      setStatus(err.message || 'Search failed.');
    } finally {
      setLoading(false);
    }
  }

  function editCompany(item) {
    setForm({
      ...emptyForm,
      ...item,
      product: item.product || item.product_category || '',
      priority: String(item.priority || 3),
    });

    window.scrollTo({ top: 0, behavior: 'smooth' });
    setStatus(`Editing: ${item.company_name}`);
  }

  function newCompany() {
    setForm(emptyForm);
    setStatus('Ready for a new company entry.');
  }

  return (
    <div className="page">
      <header className="topbar">
        <div>
          <p className="eyebrow">Rajan Business Reports - Data Research Department</p>
          <h1>Export Company Data Entry Portal</h1>
          <p className="subtext">
            Enter, search, and update verified importers, sourcing agents, distributors,
            wholesalers, buying houses, and retail chains for RBR instant reports.
          </p>
        </div>

        <div>
          <div className="badge">
            <ShieldCheck size={18} /> {employeeEmail || 'Employee Portal'}
          </div>
          <button type="button" className="ghost" onClick={signOutRedirect} style={{ marginTop: 10 }}>
            Sign out
          </button>
        </div>
      </header>

      <main className="layout">
        <section className="card form-card">
          <div className="section-head">
            <div className="card-title">
              <Database size={20} /> {isEditing ? 'Edit company' : 'Add company'}
            </div>
            {isEditing && (
              <button type="button" className="ghost" onClick={newCompany}>
                <XCircle size={17} /> Cancel edit
              </button>
            )}
          </div>

          <label className="employee-label">
            Employee name
            <input
              value={employeeName}
              onChange={(e) => setEmployeeName(e.target.value)}
              placeholder="Example: Rajan / Priya"
            />
          </label>

          <form onSubmit={saveCompany} className="grid-form">
            <label>Country *<input value={form.country} onChange={(e)=>setField('country', e.target.value)} placeholder="Malaysia" /></label>
            <label>Product *<input value={form.product} onChange={(e)=>setField('product', e.target.value)} placeholder="Readymade Garments" /></label>
            <label className="span2">Company Name *<input value={form.company_name} onChange={(e)=>setField('company_name', e.target.value)} placeholder="Padini Holdings Berhad" /></label>
            <label className="span2">Company Briefing<textarea value={form.company_briefing} onChange={(e)=>setField('company_briefing', e.target.value)} rows="3" placeholder="Very large textile/fashion network. Useful detail for report generation." /></label>
            <label className="span2">Brands<textarea value={form.brands} onChange={(e)=>setField('brands', e.target.value)} rows="2" placeholder="Padini, Seed, Vincci, PDI" /></label>
            <label className="span2">Supply Requested<textarea value={form.supply_requested} onChange={(e)=>setField('supply_requested', e.target.value)} rows="2" placeholder="budget fashion, private label garments, seasonal collections" /></label>
            <label>Email<input value={form.email} onChange={(e)=>setField('email', e.target.value)} placeholder="buyer@example.com" /></label>
            <label>Phone<input value={form.phone} onChange={(e)=>setField('phone', e.target.value)} placeholder="+60123456789" /></label>
            <label>Website<input value={form.website} onChange={(e)=>setField('website', e.target.value)} placeholder="https://example.com" /></label>
            <label>City<input value={form.city} onChange={(e)=>setField('city', e.target.value)} placeholder="Kuala Lumpur" /></label>
            <label className="span2">Address<textarea value={form.address} onChange={(e)=>setField('address', e.target.value)} rows="2" /></label>

            <label>
              Type
              <select value={form.type} onChange={(e)=>setField('type', e.target.value)}>
                {companyTypes.map((t) => <option key={t}>{t}</option>)}
              </select>
            </label>

            <label>
              Priority
              <select value={form.priority} onChange={(e)=>setField('priority', e.target.value)}>
                <option value="1">1 - Highest</option>
                <option value="2">2 - High</option>
                <option value="3">3 - Normal</option>
                <option value="4">4 - Low</option>
                <option value="5">5 - Lowest</option>
              </select>
            </label>

            <label>Contact Person<input value={form.contact_person} onChange={(e)=>setField('contact_person', e.target.value)} /></label>
            <label>Designation<input value={form.designation} onChange={(e)=>setField('designation', e.target.value)} /></label>

            <label>
              Imports From India
              <select value={form.imports_from_india} onChange={(e)=>setField('imports_from_india', e.target.value)}>
                <option>Unknown</option>
                <option>Yes</option>
                <option>Likely</option>
                <option>No</option>
              </select>
            </label>

            <label>Source Name<input value={form.source_name} onChange={(e)=>setField('source_name', e.target.value)} placeholder="Company website / Directory / Employee research" /></label>
            <label className="span2">Source URL<input value={form.source_url} onChange={(e)=>setField('source_url', e.target.value)} placeholder="https://..." /></label>
            <label className="span2">Internal Notes<textarea value={form.notes} onChange={(e)=>setField('notes', e.target.value)} rows="2" /></label>

            <label className="toggle"><input type="checkbox" checked={form.verified} onChange={(e)=>setField('verified', e.target.checked)} /> Verified</label>
            <label className="toggle"><input type="checkbox" checked={form.active} onChange={(e)=>setField('active', e.target.checked)} /> Active</label>

            <div className="actions span2">
              <button className="primary" disabled={saving}>
                <Save size={18} />{saving ? 'Saving...' : isEditing ? 'Update Company' : 'Save Company'}
              </button>
              <button type="button" className="secondary" onClick={newCompany}>
                <Plus size={18} />New Company
              </button>
              <button type="button" className="secondary disabled" title="Coming next">
                <Upload size={18} />Upload Excel
              </button>
            </div>
          </form>

          {status && <p className="status">{status}</p>}
        </section>

        <aside className="side">
          <section className="card">
            <div className="card-title"><Search size={20} /> Search Company</div>

            <label>Keyword<input value={query.text} onChange={(e)=>setQuery({...query, text:e.target.value})} placeholder="Padini / garment / sourcing" /></label>
            <label>Country<input value={query.country} onChange={(e)=>setQuery({...query, country:e.target.value})} placeholder="Malaysia" /></label>
            <label>Product<input value={query.product} onChange={(e)=>setQuery({...query, product:e.target.value})} placeholder="Readymade Garments" /></label>

            <button className="primary full" onClick={searchCompanies} disabled={loading}>
              <RefreshCw size={18} />{loading ? 'Searching...' : 'Search'}
            </button>

            <div className="results">
              {results.map((item, i) => (
                <div className="result" key={item.company_id || i}>
                  <div className="result-top">
                    <b>{item.company_name}</b>
                    <button onClick={() => editCompany(item)}>
                      <Pencil size={15} />Edit
                    </button>
                  </div>
                  <span>{item.country} · {item.product || item.product_category || '-'} · {item.type}</span>
                  <small>Priority {item.priority || 3} · {item.verified ? 'Verified' : 'Not verified'}</small>
                </div>
              ))}

              {!results.length && <p className="muted">Search results will appear here.</p>}
            </div>
          </section>

          <section className="card preview">
            <div className="card-title">Auto Generated Keys</div>
            <p><b>country_key:</b> {preview.country_key || '-'}</p>
            <p><b>product_key:</b> {preview.product_key || '-'}</p>
            <p><b>company_key:</b> {preview.company_key || '-'}</p>
            <p><b>Partition Key:</b> {preview.country_key && preview.product_key ? `${preview.country_key}#${preview.product_key}` : '-'}</p>
            <p><b>search_terms:</b> {(preview.search_terms || []).slice(0, 25).join(', ') || '-'}</p>
          </section>
        </aside>
      </main>
    </div>
  );
}

function App() {
  const auth = useAuth();

  if (auth.isLoading) {
    return <div className="page"><h2>Loading...</h2></div>;
  }

  if (auth.error) {
    return (
      <div className="page">
        <section className="card" style={{ maxWidth: 520, margin: '80px auto', textAlign: 'center' }}>
          <h1>Login error</h1>
          <p>{auth.error.message}</p>
          <button className="primary" onClick={() => auth.signinRedirect()}>
            Try again
          </button>
        </section>
      </div>
    );
  }

  if (!auth.isAuthenticated) {
    return (
      <div className="page">
        <section className="card" style={{ maxWidth: 520, margin: '80px auto', textAlign: 'center' }}>
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
