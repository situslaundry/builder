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
import { 
  ref, uploadBytes, getDownloadURL 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";

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

// --- AUTO-COMPRESS GAMBAR (Client-Side Resizer) ---
// Mengompresi gambar otomatis sebelum diunggah agar proses hanya 1-2 detik
async function compressImage(file, maxWidth = 1200, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob((blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Gagal mengompres gambar'));
        }, 'image/jpeg', quality);
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
}

// Helper Upload Image ke Firebase Storage dengan Timeout & Kompresi
async function uploadImageFile(file, path) {
  if (!file) return null;
  const compressedBlob = await compressImage(file);
  const storageRef = ref(storage, path);
  
  // Timeout 15 detik untuk mencegah loading terus menerus
  const uploadPromise = uploadBytes(storageRef, compressedBlob, { contentType: 'image/jpeg' });
  const timeoutPromise = new Promise((_, reject) => 
    setTimeout(() => reject(new Error("Unggah gambar timeout. Silakan gunakan opsi URL Gambar.")), 15000)
  );

  await Promise.race([uploadPromise, timeoutPromise]);
  return await getDownloadURL(storageRef);
}

// Router
const router = async () => {
  const path = window.location.pathname;
  const hash = window.location.hash || '';
  const search = window.location.search || '';

  let siteMatch = path.match(/\/site\/([a-zA-Z0-9_-]+)/);
  if (!siteMatch && hash.startsWith('#/site/')) {
    siteMatch = hash.match(/#\/site\/([a-zA-Z0-9_-]+)/);
  }
  if (!siteMatch && search.includes('site/')) {
    siteMatch = search.match(/site\/([a-zA-Z0-9_-]+)/);
  }

  if (siteMatch) {
    const targetUsername = siteMatch[1].toLowerCase();
    renderPublicLandingPage(targetUsername);
    return;
  }

  document.title = "Bandar Builder - Landing Page Engine";
  renderNavbar();

  if (hash === '#/register') renderRegister();
  else if (hash === '#/login') renderLogin();
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
        console.error("Profile err:", err);
      }
    } else {
      currentUserProfile = null;
    }
    router();
  });
});

const navigate = (path) => { window.location.hash = path; };

const requireAuth = (callback) => {
  if (!currentUser) return navigate('#/login');
  if (currentUserProfile?.status === 'suspended' || currentUserProfile?.status === 'banned') {
    document.getElementById('app').innerHTML = `<div class="card"><h2>Akun Ditangguhkan</h2><p>Akun dinonaktifkan oleh administrator.</p></div>`;
    return;
  }
  callback();
};

const requireAdmin = (callback) => {
  if (!currentUser) return navigate('#/login');
  if (currentUserProfile?.role !== 'admin') {
    document.getElementById('app').innerHTML = `<div class="card"><h2>Akses Ditolak</h2><p>Hanya untuk Administrator.</p></div>`;
    return;
  }
  callback();
};

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

// 1. Register
function renderRegister() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="card" style="max-width:450px; margin: 2rem auto;">
      <h2>Registrasi Akun Baru</h2>
      <form id="formRegister" style="margin-top:1rem;">
        <div class="form-group">
          <label>Nama Bisnis / Brand</label>
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
          <label>Pilih Username (/site/username)</label>
          <input type="text" id="regUsername" class="form-control" placeholder="contoh: bandar-clean" required />
          <div class="help-text">3-30 karakter huruf kecil, angka, dan '-'</div>
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
      alert('Username tidak valid.');
      return;
    }
    if (RESERVED_USERNAMES.includes(username)) {
      alert('Username dicadangkan sistem.');
      return;
    }

    try {
      const uDoc = await getDoc(doc(db, 'usernames', username));
      if (uDoc.exists()) {
        alert('Username sudah terpakai.');
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
        description: 'Pusat produk dan layanan terpercaya dengan mutu terbaik.',
        plan: 'free',
        status: 'draft',
        published: false,
        approved: false,
        hero: {
          title: `Solusi Terbaik Bersama ${name}`,
          subtitle: 'Kualitas terjamin untuk kepuasan Anda.',
          imageUrl: ''
        },
        about: {
          title: 'Tentang Kami',
          content: 'Kami berkomitmen memberikan pengalaman dan layanan terbaik.'
        },
        services: [
          { title: 'Layanan Cepat', desc: 'Pengerjaan kilat dan hasil rapi.' }
        ],
        products: [],
        faqs: [],
        testimonials: [],
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

// 2. Login
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
  const username = site.username || 'user';

  const publicRelativeUrl = `${BASE_PATH}/#/site/${username}`;
  const fullDisplayUrl = `${window.location.origin}${BASE_PATH}/site/${username}`;

  app.innerHTML = `
    <div class="card">
      <h2>Selamat Datang, ${currentUserProfile?.name || 'User'}</h2>
      <div style="margin-top: 1rem;">
        <p><strong>Website:</strong> ${site.siteName || '-'}</p>
        <p><strong>Username:</strong> @${username}</p>
        <p><strong>URL Landing Page:</strong> <a href="${publicRelativeUrl}" target="_blank">${fullDisplayUrl}</a></p>
        <p><strong>Paket:</strong> <span class="badge" style="background:#0284c7;">${site.plan?.toUpperCase() || 'FREE'}</span></p>
        <p><strong>Status:</strong> <span class="badge badge-${site.status}">${site.status?.replace('_', ' ').toUpperCase()}</span></p>
        
        ${site.status === 'rejected' ? `
          <div style="margin-top:1rem; padding:0.75rem; background:#fee2e2; border:1px solid #f87171; border-radius:6px; color:#991b1b;">
            <strong>Catatan Penolakan:</strong> ${site.moderationNote || 'Perbaiki konten agar sesuai ketentuan.'}
          </div>
        ` : ''}
      </div>

      <div style="margin-top: 1.5rem; display: flex; gap: 0.5rem; flex-wrap: wrap;">
        <a href="#/builder" class="btn btn-primary">Edit Landing Page</a>
        <button id="btnSubmitReview" class="btn btn-secondary" ${['pending_review', 'approved', 'published'].includes(site.status) ? 'disabled' : ''}>
          ${site.status === 'pending_review' ? 'Menunggu Review Admin' : 'Ajukan Review'}
        </button>
        <a href="${publicRelativeUrl}" class="btn btn-success" ${site.status !== 'published' ? 'style="opacity:0.5; pointer-events:none;"' : ''}>
          Lihat Landing Page
        </a>
      </div>
    </div>

    <!-- Section Card Shortcuts -->
    <div class="card">
      <h3>Komponen & Layanan Landing Page</h3>
      <div class="lp-grid" style="margin-top:1rem;">
        <div class="lp-card" style="text-align:left;">
          <h4>🖼️ Hero Banner</h4>
          <p class="help-text">Status: ${site.hero?.imageUrl ? '✅ Gambar Terpasang' : '⚪ Polos Tanpa Gambar (Opsional)'}</p>
          <a href="#/builder" class="btn btn-sm btn-secondary" style="margin-top:0.5rem;">Edit Hero</a>
        </div>

        <div class="lp-card" style="text-align:left;">
          <h4>💼 Layanan (${site.services?.length || 0})</h4>
          <p class="help-text">${site.services?.length ? '✅ ' + site.services.length + ' Layanan aktif' : '⚪ Belum ada layanan'}</p>
          <a href="#/builder" class="btn btn-sm btn-secondary" style="margin-top:0.5rem;">Kelola Layanan</a>
        </div>

        <div class="lp-card" style="text-align:left;">
          <h4>🛍️ Produk (${site.products?.length || 0}/5)</h4>
          <p class="help-text">${site.products?.length ? '✅ ' + site.products.length + ' Produk' : '⚪ Belum ada produk'}</p>
          <a href="#/builder" class="btn btn-sm btn-secondary" style="margin-top:0.5rem;">Kelola Produk</a>
        </div>

        <div class="lp-card" style="text-align:left;">
          <h4>❓ FAQ (${site.faqs?.length || 0})</h4>
          <p class="help-text">${site.faqs?.length ? '✅ ' + site.faqs.length + ' Tanya Jawab' : '⚪ Belum ada FAQ'}</p>
          <a href="#/builder" class="btn btn-sm btn-secondary" style="margin-top:0.5rem;">Kelola FAQ</a>
        </div>

        <div class="lp-card" style="text-align:left;">
          <h4>⭐ Testimoni (${site.testimonials?.length || 0})</h4>
          <p class="help-text">${site.testimonials?.length ? '✅ ' + site.testimonials.length + ' Testimoni' : '⚪ Belum ada ulasan'}</p>
          <a href="#/builder" class="btn btn-sm btn-secondary" style="margin-top:0.5rem;">Kelola Testimoni</a>
        </div>

        <div class="lp-card" style="text-align:left;">
          <h4>📞 Kontak & WhatsApp</h4>
          <p class="help-text">${site.contact?.whatsapp ? '✅ +' + site.contact.whatsapp : '⚪ Belum diatur'}</p>
          <a href="#/builder" class="btn btn-sm btn-secondary" style="margin-top:0.5rem;">Edit Kontak</a>
        </div>
      </div>
    </div>
  `;

  document.getElementById('btnSubmitReview')?.addEventListener('click', async () => {
    if (confirm('Ajukan landing page ini untuk dimoderasi oleh admin?')) {
      await updateDoc(doc(db, 'websites', currentUser.uid), {
        status: 'pending_review',
        published: false,
        updatedAt: serverTimestamp()
      });
      alert('Landing page berhasil diajukan untuk review.');
      renderDashboard();
    }
  });
}

// 4. Section Builder (Dual Mode: URL & Upload File)
async function renderBuilder() {
  const app = document.getElementById('app');
  app.innerHTML = `<div class="card"><p>Memuat data builder...</p></div>`;

  const siteDoc = await getDoc(doc(db, 'websites', currentUser.uid));
  const site = siteDoc.data() || {};

  let products = site.products || [];
  let services = site.services || [];
  let faqs = site.faqs || [];
  let testimonials = site.testimonials || [];

  app.innerHTML = `
    <div class="card">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <h2>Landing Page Builder</h2>
        <a href="#/dashboard" class="btn btn-sm btn-secondary">Kembali ke Dashboard</a>
      </div>
      
      <form id="formBuilder" style="margin-top:1.5rem;">
        <!-- SEO & Identitas -->
        <h3>1. Identitas Bisnis & SEO</h3>
        <div class="form-group">
          <label>Nama Bisnis (Menjadi Title Website)</label>
          <input type="text" id="siteName" class="form-control" value="${site.siteName || ''}" required />
        </div>
        <div class="form-group">
          <label>Deskripsi Bisnis (SEO & OpenGraph)</label>
          <textarea id="siteDesc" class="form-control" rows="2" required>${site.description || ''}</textarea>
        </div>

        <hr style="margin: 2rem 0; border: none; border-top: 1px solid var(--border);" />

        <!-- Hero Section -->
        <h3>2. Hero Section</h3>
        <div class="form-group">
          <label>Judul Hero Banner</label>
          <input type="text" id="heroTitle" class="form-control" value="${site.hero?.title || ''}" required />
        </div>
        <div class="form-group">
          <label>Subjudul Hero</label>
          <input type="text" id="heroSubtitle" class="form-control" value="${site.hero?.subtitle || ''}" />
        </div>
        
        <div class="form-group" style="background:#f8fafc; padding:1rem; border-radius:6px; border:1px solid var(--border);">
          <label><strong>Gambar Hero Banner (Opsional / Tidak Wajib)</strong></label>
          <p class="help-text" style="margin-bottom:0.5rem;">Pilihan 1: Masukkan link URL langsung (Instan & Cepat)</p>
          <input type="url" id="heroImageUrl" class="form-control" placeholder="https://contoh.com/gambar-hero.jpg" value="${site.hero?.imageUrl || ''}" />
          
          <p class="help-text" style="margin-top:0.75rem; margin-bottom:0.25rem;">Pilihan 2: Atau unggah file dari perangkat</p>
          <input type="file" id="heroImageFile" class="form-control" accept="image/*" />
        </div>

        <hr style="margin: 2rem 0; border: none; border-top: 1px solid var(--border);" />

        <!-- Tentang Kami -->
        <h3>3. Tentang Kami</h3>
        <div class="form-group">
          <label>Judul Section</label>
          <input type="text" id="aboutTitle" class="form-control" value="${site.about?.title || 'Tentang Kami'}" />
        </div>
        <div class="form-group">
          <label>Konten Profil Bisnis</label>
          <textarea id="aboutContent" class="form-control" rows="3">${site.about?.content || ''}</textarea>
        </div>

        <hr style="margin: 2rem 0; border: none; border-top: 1px solid var(--border);" />

        <!-- Layanan -->
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <h3>4. Layanan & Keunggulan</h3>
          <button type="button" id="btnAddService" class="btn btn-sm btn-secondary">+ Tambah Layanan</button>
        </div>
        <div id="serviceContainer" style="margin-top:1rem;"></div>

        <hr style="margin: 2rem 0; border: none; border-top: 1px solid var(--border);" />

        <!-- Produk -->
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <h3>5. Produk & Paket (Maks 5 Produk)</h3>
          <button type="button" id="btnAddProduct" class="btn btn-sm btn-secondary">+ Tambah Produk</button>
        </div>
        <div id="productContainer" style="margin-top:1rem;"></div>

        <hr style="margin: 2rem 0; border: none; border-top: 1px solid var(--border);" />

        <!-- FAQ -->
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <h3>6. FAQ (Tanya Jawab)</h3>
          <button type="button" id="btnAddFaq" class="btn btn-sm btn-secondary">+ Tambah FAQ</button>
        </div>
        <div id="faqContainer" style="margin-top:1rem;"></div>

        <hr style="margin: 2rem 0; border: none; border-top: 1px solid var(--border);" />

        <!-- Testimoni -->
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <h3>7. Testimoni Pelanggan</h3>
          <button type="button" id="btnAddTesti" class="btn btn-sm btn-secondary">+ Tambah Testimoni</button>
        </div>
        <div id="testiContainer" style="margin-top:1rem;"></div>

        <hr style="margin: 2rem 0; border: none; border-top: 1px solid var(--border);" />

        <!-- Kontak -->
        <h3>8. Kontak & Lokasi</h3>
        <div class="form-group">
          <label>Nomor WhatsApp (Format: 628xxxxxxxxxx)</label>
          <input type="text" id="siteWa" class="form-control" value="${site.contact?.whatsapp || ''}" required />
        </div>
        <div class="form-group">
          <label>Alamat / Lokasi Usaha</label>
          <input type="text" id="siteAddress" class="form-control" value="${site.contact?.address || ''}" />
        </div>

        <button type="submit" id="btnSaveBuilder" class="btn btn-primary" style="margin-top:1.5rem; width:100%; font-size:1.1rem; padding:0.85rem;">
          Simpan Seluruh Perubahan
        </button>
      </form>
    </div>
  `;

  // Render Layanan
  const renderServices = () => {
    const box = document.getElementById('serviceContainer');
    box.innerHTML = services.map((s, i) => `
      <div class="section-item">
        <div class="section-header">
          <strong>Layanan #${i + 1}</strong>
          <button type="button" class="btn btn-sm btn-danger btnDelService" data-idx="${i}">Hapus</button>
        </div>
        <input type="text" class="form-control s-title" placeholder="Nama Layanan" value="${s.title || ''}" style="margin-bottom:0.5rem;" required />
        <input type="text" class="form-control s-desc" placeholder="Keterangan Singkat" value="${s.desc || ''}" />
      </div>
    `).join('');
    document.querySelectorAll('.btnDelService').forEach(b => b.onclick = (e) => {
      services.splice(e.target.dataset.idx, 1);
      renderServices();
    });
  };

  // Render Produk (Dual-Input: URL & Upload)
  const renderProducts = () => {
    const box = document.getElementById('productContainer');
    box.innerHTML = products.map((p, i) => `
      <div class="section-item">
        <div class="section-header">
          <strong>Produk #${i + 1}</strong>
          <button type="button" class="btn btn-sm btn-danger btnDelProd" data-idx="${i}">Hapus</button>
        </div>
        <div class="form-group">
          <input type="text" class="form-control p-name" placeholder="Nama Produk" value="${p.name || ''}" required />
        </div>
        <div class="form-group">
          <input type="number" class="form-control p-price" placeholder="Harga (Rp)" value="${p.price || ''}" required />
        </div>
        <div class="form-group">
          <input type="text" class="form-control p-desc" placeholder="Keterangan singkat" value="${p.description || ''}" />
        </div>
        <div class="form-group" style="background:#f1f5f9; padding:0.75rem; border-radius:6px;">
          <label style="font-size:0.8rem; font-weight:bold;">Foto Produk (Pilihan Utama: URL Gambar)</label>
          <input type="url" class="form-control p-url" placeholder="https://contoh.com/foto-produk.jpg" value="${p.imageUrl || ''}" style="margin-bottom:0.5rem;" />
          
          <label style="font-size:0.8rem; font-weight:bold;">Atau Upload File:</label>
          <input type="file" class="form-control p-file" accept="image/*" />
        </div>
      </div>
    `).join('');
    document.querySelectorAll('.btnDelProd').forEach(b => b.onclick = (e) => {
      products.splice(e.target.dataset.idx, 1);
      renderProducts();
    });
  };

  // Render FAQ
  const renderFaqs = () => {
    const box = document.getElementById('faqContainer');
    box.innerHTML = faqs.map((f, i) => `
      <div class="section-item">
        <div class="section-header">
          <strong>FAQ #${i + 1}</strong>
          <button type="button" class="btn btn-sm btn-danger btnDelFaq" data-idx="${i}">Hapus</button>
        </div>
        <input type="text" class="form-control f-q" placeholder="Pertanyaan (Q)" value="${f.q || ''}" style="margin-bottom:0.5rem;" required />
        <textarea class="form-control f-a" placeholder="Jawaban (A)" rows="2">${f.a || ''}</textarea>
      </div>
    `).join('');
    document.querySelectorAll('.btnDelFaq').forEach(b => b.onclick = (e) => {
      faqs.splice(e.target.dataset.idx, 1);
      renderFaqs();
    });
  };

  // Render Testimoni
  const renderTestis = () => {
    const box = document.getElementById('testiContainer');
    box.innerHTML = testimonials.map((t, i) => `
      <div class="section-item">
        <div class="section-header">
          <strong>Testimoni #${i + 1}</strong>
          <button type="button" class="btn btn-sm btn-danger btnDelTesti" data-idx="${i}">Hapus</button>
        </div>
        <input type="text" class="form-control t-name" placeholder="Nama Pelanggan" value="${t.name || ''}" style="margin-bottom:0.5rem;" required />
        <textarea class="form-control t-text" placeholder="Ulasan / Testimoni" rows="2">${t.text || ''}</textarea>
      </div>
    `).join('');
    document.querySelectorAll('.btnDelTesti').forEach(b => b.onclick = (e) => {
      testimonials.splice(e.target.dataset.idx, 1);
      renderTestis();
    });
  };

  renderServices();
  renderProducts();
  renderFaqs();
  renderTestis();

  document.getElementById('btnAddService').onclick = () => {
    services.push({ title: '', desc: '' });
    renderServices();
  };
  document.getElementById('btnAddProduct').onclick = () => {
    if (products.length >= 5) return alert('Paket Free dibatasi maksimal 5 produk.');
    products.push({ name: '', price: '', description: '', imageUrl: '' });
    renderProducts();
  };
  document.getElementById('btnAddFaq').onclick = () => {
    faqs.push({ q: '', a: '' });
    renderFaqs();
  };
  document.getElementById('btnAddTesti').onclick = () => {
    testimonials.push({ name: '', text: '' });
    renderTestis();
  };

  // Submit Handler (Cepat & Non-Blocking)
  document.getElementById('formBuilder').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btnSave = document.getElementById('btnSaveBuilder');
    btnSave.disabled = true;
    btnSave.innerText = "⏳ Sedang Menyimpan Data...";

    try {
      // 1. Prioritaskan URL Gambar, lalu file upload
      let heroImgUrl = document.getElementById('heroImageUrl').value.trim();
      const heroFileInput = document.getElementById('heroImageFile');
      if (heroFileInput.files[0]) {
        btnSave.innerText = "⏳ Mengunggah Hero Banner...";
        heroImgUrl = await uploadImageFile(heroFileInput.files[0], `websites/${currentUser.uid}/hero_${Date.now()}`);
      }

      // 2. Ambil data produk
      const pNames = document.querySelectorAll('.p-name');
      const pPrices = document.querySelectorAll('.p-price');
      const pDescs = document.querySelectorAll('.p-desc');
      const pUrls = document.querySelectorAll('.p-url');
      const pFiles = document.querySelectorAll('.p-file');

      const updatedProducts = [];
      for (let i = 0; i < pNames.length; i++) {
        let pImgUrl = pUrls[i].value.trim();
        if (pFiles[i].files[0]) {
          btnSave.innerText = `⏳ Mengunggah Foto Produk #${i+1}...`;
          pImgUrl = await uploadImageFile(pFiles[i].files[0], `websites/${currentUser.uid}/prod_${i}_${Date.now()}`);
        }
        updatedProducts.push({
          name: pNames[i].value,
          price: Number(pPrices[i].value),
          description: pDescs[i].value,
          imageUrl: pImgUrl
        });
      }

      // 3. Layanan
      const sTitles = document.querySelectorAll('.s-title');
      const sDescs = document.querySelectorAll('.s-desc');
      const updatedServices = [];
      for (let i = 0; i < sTitles.length; i++) {
        updatedServices.push({ title: sTitles[i].value, desc: sDescs[i].value });
      }

      // 4. FAQ
      const fQs = document.querySelectorAll('.f-q');
      const fAs = document.querySelectorAll('.f-a');
      const updatedFaqs = [];
      for (let i = 0; i < fQs.length; i++) {
        updatedFaqs.push({ q: fQs[i].value, a: fAs[i].value });
      }

      // 5. Testimoni
      const tNames = document.querySelectorAll('.t-name');
      const tTexts = document.querySelectorAll('.t-text');
      const updatedTestis = [];
      for (let i = 0; i < tNames.length; i++) {
        updatedTestis.push({ name: tNames[i].value, text: tTexts[i].value });
      }

      // Simpan Langsung ke Firestore
      await updateDoc(doc(db, 'websites', currentUser.uid), {
        siteName: document.getElementById('siteName').value,
        description: document.getElementById('siteDesc').value,
        hero: {
          title: document.getElementById('heroTitle').value,
          subtitle: document.getElementById('heroSubtitle').value,
          imageUrl: heroImgUrl
        },
        about: {
          title: document.getElementById('aboutTitle').value,
          content: document.getElementById('aboutContent').value
        },
        services: updatedServices,
        products: updatedProducts,
        faqs: updatedFaqs,
        testimonials: updatedTestis,
        contact: {
          whatsapp: document.getElementById('siteWa').value,
          address: document.getElementById('siteAddress').value
        },
        updatedAt: serverTimestamp()
      });

      alert('Landing page berhasil disimpan dengan sukses!');
      navigate('#/dashboard');
    } catch (err) {
      alert('Gagal menyimpan: ' + err.message);
    } finally {
      btnSave.disabled = false;
      btnSave.innerText = "Simpan Seluruh Perubahan";
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
      <div class="lp-grid" style="margin-top:1.5rem;">
        <div class="lp-card">
          <h2 id="statUsers" style="color:var(--primary);">-</h2>
          <p>Total User</p>
        </div>
        <div class="lp-card">
          <h2 id="statPending" style="color:var(--badge-pending);">-</h2>
          <p>Menunggu Review</p>
        </div>
        <div class="lp-card">
          <h2 id="statPublished" style="color:var(--badge-published);">-</h2>
          <p>Landing Page Aktif</p>
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
  app.innerHTML = `<div class="card"><p>Memuat antrean...</p></div>`;

  const q = query(collection(db, 'websites'), where('status', '==', 'pending_review'));
  const snap = await getDocs(q);

  if (snap.empty) {
    app.innerHTML = `
      <div class="card">
        <h2>Antrean Moderasi</h2>
        <p style="margin-top:1rem;">Tidak ada website/landing page yang menunggu review.</p>
        <a href="#/admin" class="btn btn-secondary" style="margin-top:1rem;">Kembali</a>
      </div>
    `;
    return;
  }

  let html = `
    <div class="card">
      <h2>Antrean Moderasi Landing Page</h2>
      <div style="margin-top:1rem;">
  `;

  snap.forEach(docSnap => {
    const data = docSnap.data();
    html += `
      <div class="section-item">
        <h3>${data.siteName} (@${data.username})</h3>
        <p style="color:var(--text-muted); font-size:0.9rem; margin-top:0.25rem;">${data.description || '-'}</p>
        <div style="margin-top:1rem; display:flex; gap:0.5rem;">
          <button class="btn btn-sm btn-secondary btnPreviewAdmin" data-user="${data.username}">Preview Landing Page</button>
          <button class="btn btn-sm btn-success btnApprove" data-id="${docSnap.id}">Approve</button>
          <button class="btn btn-sm btn-danger btnReject" data-id="${docSnap.id}">Reject</button>
        </div>
      </div>
    `;
  });

  html += `</div><a href="#/admin" class="btn btn-secondary">Kembali ke Admin</a></div>`;
  app.innerHTML = html;

  document.querySelectorAll('.btnPreviewAdmin').forEach(b => {
    b.onclick = (e) => window.open(`${BASE_PATH}/#/site/${e.target.dataset.user}`, '_blank');
  });

  document.querySelectorAll('.btnApprove').forEach(b => {
    b.onclick = async (e) => {
      const siteId = e.target.dataset.id;
      if (confirm('Setujui dan publikasikan landing page ini?')) {
        await updateDoc(doc(db, 'websites', siteId), {
          status: 'published',
          published: true,
          approved: true,
          reviewedBy: currentUser.uid,
          reviewedAt: serverTimestamp()
        });
        alert('Landing page berhasil disetujui!');
        renderAdminReviews();
      }
    };
  });

  document.querySelectorAll('.btnReject').forEach(b => {
    b.onclick = async (e) => {
      const siteId = e.target.dataset.id;
      const reason = prompt('Alasan penolakan:');
      if (reason) {
        await updateDoc(doc(db, 'websites', siteId), {
          status: 'rejected',
          published: false,
          approved: false,
          moderationNote: reason,
          reviewedBy: currentUser.uid,
          reviewedAt: serverTimestamp()
        });
        alert('Landing page ditolak.');
        renderAdminReviews();
      }
    };
  });
}

// 6. Public Landing Page View (Hero Bersih & Adaptif)
async function renderPublicLandingPage(username) {
  const root = document.getElementById('app');
  document.getElementById('navbar-container').innerHTML = '';
  root.innerHTML = `<div style="text-align:center; padding:5rem 0;">Memuat landing page @${username}...</div>`;

  try {
    const q = query(collection(db, 'websites'), where('username', '==', username));
    const snap = await getDocs(q);

    if (snap.empty) {
      document.title = "404 - Halaman Tidak Ditemukan";
      root.innerHTML = `<div class="card" style="text-align:center; margin:3rem auto; max-width:500px;"><h2>404 - Tidak Ditemukan</h2><p>Landing page @${username} tidak terdaftar.</p></div>`;
      return;
    }

    const siteDoc = snap.docs[0];
    const site = siteDoc.data();

    // Set Title Browser Sesuai Nama Bisnis
    document.title = site.siteName || "Official Website";
    
    const metaDesc = site.description || `Website resmi ${site.siteName}`;
    const shareImage = site.hero?.imageUrl || (site.products?.[0]?.imageUrl || '');

    document.getElementById('meta-desc')?.setAttribute('content', metaDesc);
    document.getElementById('og-title')?.setAttribute('content', site.siteName);
    document.getElementById('og-desc')?.setAttribute('content', metaDesc);
    document.getElementById('og-image')?.setAttribute('content', shareImage);

    if (site.status === 'suspended') {
      root.innerHTML = `<div class="card" style="text-align:center; margin:3rem auto; max-width:500px; color:#991b1b;"><h2>Website Ditangguhkan</h2><p>Landing page ini tidak dapat diakses karena pelanggaran aturan platform.</p></div>`;
      return;
    }

    const isOwner = currentUser && currentUser.uid === site.ownerId;
    const isAdminUser = currentUserProfile?.role === 'admin';

    if (site.status !== 'published' && !isOwner && !isAdminUser) {
      root.innerHTML = `<div class="card" style="text-align:center; margin:3rem auto; max-width:500px;"><h2>Website Belum Publik</h2><p>Landing page ini sedang dalam proses moderasi atau berstatus draft.</p></div>`;
      return;
    }

    root.innerHTML = `
      <div class="landing-page">
        <!-- Hero Section (Opsional Image: Jika tidak ada image, otomatis layout bersih terpusat) -->
        <header class="lp-hero">
          <div class="lp-hero-with-img">
            ${site.hero?.imageUrl ? `<img src="${site.hero.imageUrl}" class="lp-hero-img" alt="${site.siteName}" />` : ''}
            <div>
              <h1>${site.hero?.title || site.siteName}</h1>
              <p>${site.hero?.subtitle || site.description || ''}</p>
              ${site.contact?.whatsapp ? `
                <a href="https://wa.me/${site.contact.whatsapp}?text=Halo%20${encodeURIComponent(site.siteName)},%20saya%20tertarik%20dengan%20layanan%20Anda" 
                   target="_blank" class="btn btn-success" style="font-size:1.1rem; padding:0.85rem 2rem;">
                   💬 Hubungi via WhatsApp
                </a>
              ` : ''}
            </div>
          </div>
        </header>

        <!-- Tentang Kami -->
        ${site.about?.content ? `
          <section class="lp-section">
            <h2 class="lp-section-title">${site.about.title || 'Tentang Kami'}</h2>
            <p style="text-align:center; max-width:700px; margin:1rem auto; color:#334155; font-size:1.05rem;">
              ${site.about.content}
            </p>
          </section>
        ` : ''}

        <!-- Layanan -->
        ${site.services?.length ? `
          <section class="lp-section">
            <h2 class="lp-section-title">Layanan & Keunggulan</h2>
            <p class="lp-section-sub">Mengapa Anda harus memilih kami</p>
            <div class="lp-grid">
              ${site.services.map(s => `
                <div class="lp-card">
                  <h3 style="color:#0f172a; margin-bottom:0.5rem;">${s.title}</h3>
                  <p style="color:var(--text-muted); font-size:0.95rem;">${s.desc || ''}</p>
                </div>
              `).join('')}
            </div>
          </section>
        ` : ''}

        <!-- Produk -->
        ${site.products?.length ? `
          <section class="lp-section">
            <h2 class="lp-section-title">Pilihan Produk & Paket</h2>
            <p class="lp-section-sub">Dapatkan penawaran terbaik</p>
            <div class="lp-grid">
              ${site.products.map(p => `
                <div class="lp-card">
                  ${p.imageUrl ? `<img src="${p.imageUrl}" class="lp-prod-img" alt="${p.name}" />` : ''}
                  <h3>${p.name}</h3>
                  <div class="lp-prod-price">Rp ${Number(p.price).toLocaleString('id-ID')}</div>
                  <p style="color:var(--text-muted); font-size:0.85rem; margin-bottom:1rem;">${p.description || ''}</p>
                  ${site.contact?.whatsapp ? `
                    <a href="https://wa.me/${site.contact.whatsapp}?text=Halo%20${encodeURIComponent(site.siteName)},%20saya%20mau%20pesan%20${encodeURIComponent(p.name)}" 
                       target="_blank" class="btn btn-sm btn-primary" style="width:100%;">
                       Pesan Sekarang
                    </a>
                  ` : ''}
                </div>
              `).join('')}
            </div>
          </section>
        ` : ''}

        <!-- FAQ -->
        ${site.faqs?.length ? `
          <section class="lp-section">
            <h2 class="lp-section-title">Pertanyaan yang Sering Diajukan (FAQ)</h2>
            <p class="lp-section-sub">Informasi seputar pemesanan dan layanan</p>
            <div style="max-width:700px; margin:0 auto;">
              ${site.faqs.map(f => `
                <div class="lp-faq-item">
                  <div class="lp-faq-q">❓ ${f.q}</div>
                  <div class="lp-faq-a">${f.a}</div>
                </div>
              `).join('')}
            </div>
          </section>
        ` : ''}

        <!-- Testimoni -->
        ${site.testimonials?.length ? `
          <section class="lp-section">
            <h2 class="lp-section-title">Ulasan Pelanggan</h2>
            <p class="lp-section-sub">Testimoni nyata dari pelanggan kami</p>
            <div class="lp-grid">
              ${site.testimonials.map(t => `
                <div class="lp-testi-card">
                  "${t.text}"
                  <div class="lp-testi-author">— ${t.name}</div>
                </div>
              `).join('')}
            </div>
          </section>
        ` : ''}

        <!-- Kontak & Alamat -->
        <section class="lp-section" style="text-align:center; background:#fafafa;">
          <h2 class="lp-section-title">Hubungi Kami</h2>
          <p style="margin-top:0.5rem; color:#475569;">${site.contact?.address || 'Alamat operasional belum dicantumkan.'}</p>
          ${site.contact?.whatsapp ? `
            <div style="margin-top:1.5rem;">
              <a href="https://wa.me/${site.contact.whatsapp}" target="_blank" class="btn btn-success">
                Chat WhatsApp (+${site.contact.whatsapp})
              </a>
            </div>
          ` : ''}
        </section>

        <div class="lp-report-bar">
          <span>&copy; ${new Date().getFullYear()} ${site.siteName}</span> &bull; 
          <a href="javascript:void(0)" id="btnReport" style="color:var(--text-muted); text-decoration:underline;">Laporkan Halaman</a>
        </div>
      </div>
    `;

    document.getElementById('btnReport')?.addEventListener('click', () => {
      const reason = prompt("Alasan Laporan (Penipuan/Spam/Judi/Konten Ilegal):");
      if (reason) {
        addDoc(collection(db, 'reports'), {
          websiteId: siteDoc.id,
          reason,
          createdAt: serverTimestamp()
        }).then(() => alert('Laporan terkirim.'));
      }
    });

  } catch (err) {
    root.innerHTML = `<div class="card">Gagal memuat: ${err.message}</div>`;
  }
}
