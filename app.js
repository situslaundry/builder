import { auth, db, storage } from './firebase-config.js';
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
  doc, setDoc, getDoc, updateDoc, collection, query, where, getDocs, addDoc, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Ambil Base Path dinamis (misal: /builder/)
const getBasePath = () => {
  const path = window.location.pathname;
  const segments = path.split('/').filter(Boolean);
  if (window.location.hostname.includes('github.io') && segments.length > 0) {
    return `/${segments[0]}`;
  }
  return '';
};

const BASE_PATH = getBasePath();

const RESERVED_USERNAMES = [
  'administrator', 'api', 'app', 'assets', 'auth', 'blog', 
  'dashboard', 'help', 'login', 'logout', 'mail', 'register', 'signup', 
  'site', 'static', 'support', 'system', 'user', 'users', 'www', 
  'official', 'security', 'billing', 'payment'
];

let currentUser = null;
let currentUserProfile = null;

// --- ROUTER ENGINE ---
const router = async () => {
  const path = window.location.pathname;
  const hash = window.location.hash || '';

  // Cek apakah rute publik /site/:username dari path biasa ATAU dari hash #/site/:username
  let siteMatch = path.match(/\/site\/([a-zA-Z0-9_-]+)/);
  if (!siteMatch && hash.startsWith('#/site/')) {
    siteMatch = hash.match(/#\/site\/([a-zA-Z0-9_-]+)/);
  }

  if (siteMatch) {
    const targetUsername = siteMatch[1].toLowerCase();
    renderPublicSite(targetUsername);
    return;
  }

  renderNavbar();

  if (hash === '#/register') renderRegister();
  else if (hash === '#/login') renderLogin();
  else if (hash === '#/terms') renderTerms();
  else if (hash === '#/admin') requireAdmin(renderAdminDashboard);
  else if (hash === '#/admin/reviews') requireAdmin(renderAdminReviews);
  else if (hash === '#/builder') requireAuth(renderBuilder);
  else renderDashboard();
};

window.addEventListener('hashchange', router);
window.addEventListener('load', () => {
  onAuthStateChanged(auth, async (user) => {
    currentUser = user;
    if (user) {
      try {
        const snap = await getDoc(doc(db, 'users', user.uid));
        currentUserProfile = snap.exists() ? snap.data() : null;
      } catch (err) {
        console.error("Gagal load profile:", err);
      }
    } else {
      currentUserProfile = null;
    }
    router();
  });
});

const navigate = (path) => {
  window.location.hash = path;
};

// --- AUTH GUARDS ---
const requireAuth = (callback) => {
  if (!currentUser) return navigate('#/login');
  if (currentUserProfile?.status === 'suspended' || currentUserProfile?.status === 'banned') {
    document.getElementById('app').innerHTML = `<div class="card"><h2>Akun Ditangguhkan</h2><p>Akun Anda dinonaktifkan oleh administrator.</p></div>`;
    return;
  }
  callback();
};

const requireAdmin = async (callback) => {
  if (!currentUser) return navigate('#/login');
  if (currentUserProfile?.role !== 'admin') {
    document.getElementById('app').innerHTML = `<div class="card"><h2>Akses Ditolak</h2><p>Halaman ini hanya untuk Administrator.</p></div>`;
    return;
  }
  callback();
};

// --- NAVBAR ---
function renderNavbar() {
  const container = document.getElementById('navbar-container');
  const path = window.location.pathname;
  const hash = window.location.hash;
  
  if (path.includes('/site/') || hash.startsWith('#/site/')) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = `
    <header class="navbar">
      <a href="#/dashboard" class="brand">BandarBuilder</a>
      <nav class="nav-links">
        ${currentUser ? `
          <a href="#/dashboard">Dashboard</a>
          ${currentUserProfile?.role === 'admin' ? '<a href="#/admin" style="color:var(--primary); font-weight:bold;">Admin Panel</a>' : ''}
          <button id="btnLogout" class="btn btn-sm btn-secondary">Logout</button>
        ` : `
          <a href="#/login">Login</a>
          <a href="#/register" class="btn btn-sm btn-primary">Daftar</a>
        `}
      </nav>
    </header>
  `;

  document.getElementById('btnLogout')?.addEventListener('click', async () => {
    await signOut(auth);
    navigate('#/login');
  });
}

// --- VIEWS ---

// 1. Register View
function renderRegister() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="card" style="max-width:450px; margin: 2rem auto;">
      <h2>Registrasi User</h2>
      <form id="formRegister" style="margin-top:1rem;">
        <div class="form-group">
          <label>Nama Lengkap</label>
          <input type="text" id="regName" class="form-control" required />
        </div>
        <div class="form-group">
          <label>Email</label>
          <input type="email" id="regEmail" class="form-control" required />
        </div>
        <div class="form-group">
          <label>Password</label>
          <input type="password" id="regPass" class="form-control" minlength="6" required />
        </div>
        <div class="form-group">
          <label>Username Domain (/site/username)</label>
          <input type="text" id="regUsername" class="form-control" placeholder="contoh: laundry-jaya" required />
          <div class="help-text">3-30 karakter, lowercase, angka, dan tanda '-'</div>
        </div>
        <button type="submit" class="btn btn-primary" style="width:100%;">Daftar Sekarang</button>
      </form>
    </div>
  `;

  document.getElementById('formRegister').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('regName').value.trim();
    const email = document.getElementById('regEmail').value.trim();
    const pass = document.getElementById('regPass').value;
    const username = document.getElementById('regUsername').value.trim().toLowerCase();

    if (!/^[a-z0-9-]{3,30}$/.test(username)) {
      alert('Username tidak valid (Gunakan 3-30 huruf kecil, angka, atau tanda -)');
      return;
    }

    if (RESERVED_USERNAMES.includes(username)) {
      alert('Username ini terdaftar sebagai kata yang dilindungi sistem.');
      return;
    }

    try {
      const uDoc = await getDoc(doc(db, 'usernames', username));
      if (uDoc.exists()) {
        alert('Username sudah digunakan oleh akun lain!');
        return;
      }

      const cred = await createUserWithEmailAndPassword(auth, email, pass);
      const uid = cred.user.uid;

      await setDoc(doc(db, 'users', uid), {
        name, email, username, role: 'user', status: 'active', createdAt: serverTimestamp()
      });

      await setDoc(doc(db, 'usernames', username), { uid });

      await setDoc(doc(db, 'websites', uid), {
        ownerId: uid,
        username,
        siteName: name,
        description: 'Selamat datang di website resmi kami.',
        templateId: 'umkm',
        plan: 'free',
        status: 'draft',
        published: false,
        approved: false,
        products: [],
        contact: { whatsapp: '', address: '' },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      window.location.hash = '#/dashboard';
    } catch (err) {
      alert('Registrasi gagal: ' + err.message);
    }
  });
}

// 2. Login View
function renderLogin() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="card" style="max-width:400px; margin: 2rem auto;">
      <h2>Login</h2>
      <form id="formLogin" style="margin-top:1rem;">
        <div class="form-group">
          <label>Email</label>
          <input type="email" id="logEmail" class="form-control" required />
        </div>
        <div class="form-group">
          <label>Password</label>
          <input type="password" id="logPass" class="form-control" required />
        </div>
        <button type="submit" class="btn btn-primary" style="width:100%;">Masuk</button>
      </form>
    </div>
  `;

  document.getElementById('formLogin').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await signInWithEmailAndPassword(auth, document.getElementById('logEmail').value, document.getElementById('logPass').value);
      window.location.hash = '#/dashboard';
    } catch (err) {
      alert('Login gagal: ' + err.message);
    }
  });
}

// 3. User Dashboard
async function renderDashboard() {
  if (!currentUser) return renderLogin();
  const app = document.getElementById('app');
  app.innerHTML = `<div class="card"><p>Memuat data dashboard...</p></div>`;

  const siteDoc = await getDoc(doc(db, 'websites', currentUser.uid));
  const site = siteDoc.data() || {};
  const username = site.username || 'admin';

  // Format URL publik lengkap dengan base path GitHub Pages
  const publicRelativeUrl = `${BASE_PATH}/site/${username}`;
  const publicHashUrl = `${BASE_PATH}/#/site/${username}`;
  const fullDisplayUrl = `${window.location.origin}${publicRelativeUrl}`;

  app.innerHTML = `
    <div class="card">
      <h2>Selamat Datang, ${currentUserProfile?.name || 'Admin'}</h2>
      <div style="margin-top: 1rem;">
        <p><strong>Website:</strong> ${site.siteName || '-'}</p>
        <p><strong>Username:</strong> @${username}</p>
        <p><strong>URL Publik:</strong> <a href="${publicRelativeUrl}" target="_blank">${fullDisplayUrl}</a></p>
        <p><strong>Paket:</strong> <span class="badge" style="background:#0284c7;">${site.plan?.toUpperCase() || 'FREE'}</span></p>
        <p><strong>Status:</strong> <span class="badge badge-${site.status}">${site.status?.replace('_', ' ').toUpperCase()}</span></p>
        
        ${site.status === 'rejected' ? `
          <div style="margin-top:1rem; padding:0.75rem; background:#fee2e2; border:1px solid #f87171; border-radius:6px; color:#991b1b;">
            <strong>Catatan Penolakan Moderasi:</strong> ${site.moderationNote || 'Perbaiki konten agar sesuai ketentuan.'}
          </div>
        ` : ''}
      </div>

      <div style="margin-top: 1.5rem; display: flex; gap: 0.5rem; flex-wrap: wrap;">
        <a href="#/builder" class="btn btn-primary">Edit Website</a>
        <button id="btnSubmitReview" class="btn btn-secondary" ${['pending_review', 'approved', 'published'].includes(site.status) ? 'disabled' : ''}>
          ${site.status === 'pending_review' ? 'Menunggu Review Admin' : 'Ajukan Review'}
        </button>
        <a href="${publicRelativeUrl}" class="btn btn-success" ${site.status !== 'published' ? 'style="opacity:0.5; pointer-events:none;"' : ''}>
          Lihat Website (Path)
        </a>
        <a href="${publicHashUrl}" class="btn btn-secondary" ${site.status !== 'published' ? 'style="opacity:0.5; pointer-events:none;"' : ''}>
          Lihat Website (Hash Fallback)
        </a>
      </div>
    </div>
  `;

  document.getElementById('btnSubmitReview')?.addEventListener('click', async () => {
    if (confirm('Ajukan website ini untuk diperiksa dan dimoderasi oleh admin?')) {
      await updateDoc(doc(db, 'websites', currentUser.uid), {
        status: 'pending_review',
        published: false,
        updatedAt: serverTimestamp()
      });
      alert('Website berhasil diajukan untuk review.');
      renderDashboard();
    }
  });
}

// 4. Section Builder
async function renderBuilder() {
  const app = document.getElementById('app');
  const siteDoc = await getDoc(doc(db, 'websites', currentUser.uid));
  const site = siteDoc.data() || {};

  app.innerHTML = `
    <div class="card">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <h2>Website Editor</h2>
        <a href="#/dashboard" class="btn btn-sm btn-secondary">Kembali</a>
      </div>
      
      <form id="formBuilder" style="margin-top:1.5rem;">
        <h3>Identitas Bisnis</h3>
        <div class="form-group">
          <label>Nama Bisnis</label>
          <input type="text" id="siteName" class="form-control" value="${site.siteName || ''}" required />
        </div>
        <div class="form-group">
          <label>Deskripsi Singkat</label>
          <textarea id="siteDesc" class="form-control">${site.description || ''}</textarea>
        </div>
        <div class="form-group">
          <label>Nomor WhatsApp (Format: 628xxxxxxxxxx)</label>
          <input type="text" id="siteWa" class="form-control" value="${site.contact?.whatsapp || ''}" />
        </div>
        <div class="form-group">
          <label>Alamat Bisnis</label>
          <input type="text" id="siteAddress" class="form-control" value="${site.contact?.address || ''}" />
        </div>

        <hr style="margin: 2rem 0; border: none; border-top: 1px solid var(--border);" />

        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem;">
          <h3>Daftar Produk (Maks 5 untuk Free)</h3>
          <button type="button" id="btnAddProduct" class="btn btn-sm btn-secondary">+ Tambah Produk</button>
        </div>
        <div id="productContainer"></div>

        <hr style="margin: 2rem 0; border: none; border-top: 1px solid var(--border);" />

        <button type="submit" class="btn btn-primary">Simpan Draft</button>
      </form>
    </div>
  `;

  let products = site.products || [];

  const renderProductInputs = () => {
    const container = document.getElementById('productContainer');
    container.innerHTML = products.map((p, idx) => `
      <div class="section-item">
        <div class="section-header">
          <strong>Produk #${idx + 1}</strong>
          <button type="button" class="btn btn-sm btn-danger btnDelProd" data-idx="${idx}">Hapus</button>
        </div>
        <div class="form-group">
          <input type="text" class="form-control prod-name" placeholder="Nama Produk" value="${p.name || ''}" required />
        </div>
        <div class="form-group">
          <input type="number" class="form-control prod-price" placeholder="Harga (Rp)" value="${p.price || ''}" required />
        </div>
        <div class="form-group">
          <input type="text" class="form-control prod-desc" placeholder="Keterangan singkat" value="${p.description || ''}" />
        </div>
      </div>
    `).join('');

    document.querySelectorAll('.btnDelProd').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = e.target.getAttribute('data-idx');
        products.splice(idx, 1);
        renderProductInputs();
      });
    });
  };

  renderProductInputs();

  document.getElementById('btnAddProduct').addEventListener('click', () => {
    if (products.length >= 5) {
      alert('Paket FREE hanya mendukung maksimal 5 produk.');
      return;
    }
    products.push({ name: '', price: '', description: '' });
    renderProductInputs();
  });

  document.getElementById('formBuilder').addEventListener('submit', async (e) => {
    e.preventDefault();
    const names = document.querySelectorAll('.prod-name');
    const prices = document.querySelectorAll('.prod-price');
    const descs = document.querySelectorAll('.prod-desc');
    const updatedProducts = [];

    for (let i = 0; i < names.length; i++) {
      updatedProducts.push({
        name: names[i].value,
        price: Number(prices[i].value),
        description: descs[i].value
      });
    }

    try {
      await updateDoc(doc(db, 'websites', currentUser.uid), {
        siteName: document.getElementById('siteName').value,
        description: document.getElementById('siteDesc').value,
        contact: {
          whatsapp: document.getElementById('siteWa').value,
          address: document.getElementById('siteAddress').value
        },
        products: updatedProducts,
        updatedAt: serverTimestamp()
      });
      alert('Draft website berhasil disimpan.');
      navigate('#/dashboard');
    } catch (err) {
      alert('Gagal menyimpan: ' + err.message);
    }
  });
}

// 5. Admin Panel
async function renderAdminDashboard() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="card">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <h2>Admin Moderation Dashboard</h2>
        <a href="#/admin/reviews" class="btn btn-primary">Buka Antrean Review</a>
      </div>
      <div class="site-grid" style="margin-top:1.5rem;">
        <div class="site-card">
          <h4 id="statUsers">-</h4>
          <p>Total User</p>
        </div>
        <div class="site-card">
          <h4 id="statPending">-</h4>
          <p>Menunggu Review</p>
        </div>
        <div class="site-card">
          <h4 id="statPublished">-</h4>
          <p>Website Aktif</p>
        </div>
      </div>
    </div>
  `;

  const uSnap = await getDocs(collection(db, 'users'));
  const pSnap = await getDocs(query(collection(db, 'websites'), where('status', '==', 'pending_review')));
  const pubSnap = await getDocs(query(collection(db, 'websites'), where('status', '==', 'published')));

  document.getElementById('statUsers').innerText = uSnap.size;
  document.getElementById('statPending').innerText = pSnap.size;
  document.getElementById('statPublished').innerText = pubSnap.size;
}

async function renderAdminReviews() {
  const app = document.getElementById('app');
  app.innerHTML = `<div class="card"><p>Memuat antrean review...</p></div>`;

  const q = query(collection(db, 'websites'), where('status', '==', 'pending_review'));
  const snap = await getDocs(q);

  if (snap.empty) {
    app.innerHTML = `
      <div class="card">
        <h2>Antrean Moderasi</h2>
        <p style="margin-top:1rem;">Tidak ada website yang sedang menunggu review.</p>
        <a href="#/admin" class="btn btn-secondary" style="margin-top:1rem;">Kembali</a>
      </div>
    `;
    return;
  }

  let html = `
    <div class="card">
      <h2>Antrean Moderasi Website</h2>
      <div class="table-responsive">
        <table>
          <thead>
            <tr>
              <th>Bisnis</th>
              <th>Username</th>
              <th>Owner ID</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
  `;

  snap.forEach(docSnap => {
    const data = docSnap.data();
    html += `
      <tr>
        <td><strong>${data.siteName}</strong></td>
        <td>@${data.username}</td>
        <td><code>${data.ownerId}</code></td>
        <td>
          <button class="btn btn-sm btn-secondary btnPreviewAdmin" data-user="${data.username}">Preview</button>
          <button class="btn btn-sm btn-success btnApprove" data-id="${docSnap.id}">Approve</button>
          <button class="btn btn-sm btn-danger btnReject" data-id="${docSnap.id}">Reject</button>
          <button class="btn btn-sm btn-danger btnSuspend" data-id="${docSnap.id}">Suspend</button>
        </td>
      </tr>
    `;
  });

  html += `</tbody></table></div><a href="#/admin" class="btn btn-secondary" style="margin-top:1rem;">Kembali</a></div>`;
  app.innerHTML = html;

  document.querySelectorAll('.btnPreviewAdmin').forEach(b => {
    b.addEventListener('click', (e) => {
      window.open(`${BASE_PATH}/site/${e.target.dataset.user}`, '_blank');
    });
  });

  document.querySelectorAll('.btnApprove').forEach(b => {
    b.addEventListener('click', async (e) => {
      const siteId = e.target.dataset.id;
      if (confirm('Setujui dan publikasikan website ini?')) {
        await updateDoc(doc(db, 'websites', siteId), {
          status: 'published',
          published: true,
          approved: true,
          reviewedBy: currentUser.uid,
          reviewedAt: serverTimestamp()
        });

        await addDoc(collection(db, 'moderationLogs'), {
          adminId: currentUser.uid,
          websiteId: siteId,
          action: 'approve',
          reason: 'Konten lolos moderasi standard',
          createdAt: serverTimestamp()
        });

        alert('Website resmi dipublikasikan!');
        renderAdminReviews();
      }
    });
  });

  document.querySelectorAll('.btnReject').forEach(b => {
    b.addEventListener('click', async (e) => {
      const siteId = e.target.dataset.id;
      const reason = prompt('Masukkan alasan penolakan website:');
      if (reason) {
        await updateDoc(doc(db, 'websites', siteId), {
          status: 'rejected',
          published: false,
          approved: false,
          moderationNote: reason,
          reviewedBy: currentUser.uid,
          reviewedAt: serverTimestamp()
        });

        await addDoc(collection(db, 'moderationLogs'), {
          adminId: currentUser.uid,
          websiteId: siteId,
          action: 'reject',
          reason,
          createdAt: serverTimestamp()
        });

        alert('Website ditolak.');
        renderAdminReviews();
      }
    });
  });

  document.querySelectorAll('.btnSuspend').forEach(b => {
    b.addEventListener('click', async (e) => {
      const siteId = e.target.dataset.id;
      const reason = prompt('Alasan penangguhan (Penipuan/Spam/Judi/Konten Ilegal):');
      if (reason) {
        await updateDoc(doc(db, 'websites', siteId), {
          status: 'suspended',
          published: false,
          moderationNote: reason,
          reviewedBy: currentUser.uid,
          reviewedAt: serverTimestamp()
        });

        await addDoc(collection(db, 'moderationLogs'), {
          adminId: currentUser.uid,
          websiteId: siteId,
          action: 'suspend',
          reason,
          createdAt: serverTimestamp()
        });

        alert('Website telah disuspend!');
        renderAdminReviews();
      }
    });
  });
}

// 6. Public Site Renderer
async function renderPublicSite(username) {
  const root = document.getElementById('app');
  document.getElementById('navbar-container').innerHTML = '';
  root.innerHTML = `<div style="text-align:center; padding:4rem;">Memuat website @${username}...</div>`;

  try {
    const q = query(collection(db, 'websites'), where('username', '==', username));
    const snap = await getDocs(q);

    if (snap.empty) {
      root.innerHTML = `
        <div class="card" style="text-align:center;">
          <h2>404 - Tidak Ditemukan</h2>
          <p>Website dengan username @${username} tidak ditemukan di database.</p>
          <a href="${BASE_PATH}/#/dashboard" class="btn btn-secondary" style="margin-top:1rem;">Ke Dashboard</a>
        </div>
      `;
      return;
    }

    const siteDoc = snap.docs[0];
    const site = siteDoc.data();

    if (site.status === 'suspended') {
      root.innerHTML = `<div class="card" style="text-align:center; color:#991b1b;"><h2>Website Ditangguhkan</h2><p>Website ini sedang tidak tersedia karena melanggar aturan platform.</p></div>`;
      return;
    }

    const isOwner = currentUser && currentUser.uid === site.ownerId;
    const isAdminUser = currentUserProfile?.role === 'admin';

    if (site.status !== 'published' && !isOwner && !isAdminUser) {
      root.innerHTML = `<div class="card" style="text-align:center;"><h2>Website Belum Publik</h2><p>Website ini sedang dalam masa peninjauan atau masih berstatus draft.</p></div>`;
      return;
    }

    root.innerHTML = `
      <div class="public-site-view">
        <header class="site-hero">
          <h1>${site.siteName || 'Bandar Official'}</h1>
          <p style="margin-top:0.5rem; color:var(--text-muted);">${site.description || ''}</p>
        </header>

        ${site.products?.length ? `
          <section class="site-section">
            <h2 style="text-align:center; margin-bottom:1.5rem;">Katalog Produk</h2>
            <div class="site-grid">
              ${site.products.map(p => `
                <div class="site-card">
                  <h3>${p.name}</h3>
                  <p style="color:var(--primary); font-weight:700; margin: 0.5rem 0;">Rp ${Number(p.price).toLocaleString('id-ID')}</p>
                  <p style="font-size:0.85rem; color:var(--text-muted);">${p.description || ''}</p>
                  ${site.contact?.whatsapp ? `
                    <a href="https://wa.me/${site.contact.whatsapp}?text=Halo%20saya%20tertarik%20pesan%20${encodeURIComponent(p.name)}" 
                       target="_blank" class="btn btn-sm btn-success" style="margin-top:0.75rem;">
                       Pesan via WhatsApp
                    </a>
                  ` : ''}
                </div>
              `).join('')}
            </div>
          </section>
        ` : ''}

        <section class="site-section" style="text-align:center;">
          <h2>Hubungi Kami</h2>
          <p style="margin-top:0.5rem;">${site.contact?.address || 'Alamat belum diatur.'}</p>
          ${site.contact?.whatsapp ? `<p>WhatsApp: <strong>+${site.contact.whatsapp}</strong></p>` : ''}
        </section>

        <footer class="report-bar">
          <p>&copy; ${new Date().getFullYear()} ${site.siteName || 'Bandar'} &bull; Powered by BandarBuilder</p>
          <a href="javascript:void(0)" id="btnReport" style="color:var(--text-muted); text-decoration:underline; font-size:0.75rem;">Laporkan Website</a>
        </footer>
      </div>
    `;

    document.getElementById('btnReport')?.addEventListener('click', () => {
      renderReportModal(siteDoc.id);
    });

  } catch (err) {
    root.innerHTML = `<div class="card">Terjadi kesalahan: ${err.message}</div>`;
  }
}

// 7. Abuse Reporting
function renderReportModal(websiteId) {
  const reason = prompt("Pilih Alasan Laporan:\n1. Penipuan\n2. Spam\n3. Judi\n4. Phishing\n5. Konten Ilegal\n\nKetik alasan:");
  if (!reason) return;
  
  const desc = prompt("Keterangan tambahan (opsional):");
  const email = prompt("Email pelapor (opsional):");

  addDoc(collection(db, 'reports'), {
    websiteId,
    reason,
    description: desc || '',
    reporterEmail: email || 'anonymous',
    status: 'new',
    createdAt: serverTimestamp()
  }).then(() => {
    alert('Laporan Anda telah dikirim untuk ditinjau oleh tim keamanan.');
  }).catch(err => alert('Gagal mengirim laporan: ' + err.message));
}

// 8. Terms
function renderTerms() {
  document.getElementById('app').innerHTML = `
    <div class="card">
      <h2>Kebijakan Penggunaan Platform</h2>
      <p style="margin-top:1rem;">Platform ini melarang segala bentuk penipuan, judi, spam, dan konten ilegal.</p>
    </div>
  `;
}
