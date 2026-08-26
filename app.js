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

// ========================================================
// TOAST & MODAL ENGINE
// ========================================================
export function showToast(message, type = 'info', duration = 3500) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <div class="toast-content">
      <span>${icons[type] || 'ℹ️'}</span>
      <span>${message}</span>
    </div>
    <button class="toast-close">&times;</button>
  `;

  container.appendChild(toast);
  const removeToast = () => {
    toast.style.animation = 'toastFadeOut 0.3s forwards';
    setTimeout(() => toast.remove(), 300);
  };

  toast.querySelector('.toast-close').onclick = removeToast;
  setTimeout(removeToast, duration);
}

export function showConfirm(title, message, onConfirm, confirmText = 'Ya, Lanjutkan', isDanger = false) {
  const container = document.getElementById('modal-container');
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-card">
      <div class="modal-title">${title}</div>
      <div class="modal-body">${message}</div>
      <div class="modal-actions">
        <button class="btn btn-sm btn-secondary btnCancel">Batal</button>
        <button class="btn btn-sm ${isDanger ? 'btn-danger' : 'btn-primary'} btnConfirm">${confirmText}</button>
      </div>
    </div>
  `;
  container.appendChild(modal);

  modal.querySelector('.btnCancel').onclick = () => modal.remove();
  modal.querySelector('.btnConfirm').onclick = () => {
    modal.remove();
    onConfirm();
  };
}

export function showPrompt(title, message, defaultValue = '', onConfirm, placeholder = 'Tuliskan di sini...') {
  const container = document.getElementById('modal-container');
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-card">
      <div class="modal-title">${title}</div>
      <div class="modal-body">
        <p style="margin-bottom:0.75rem;">${message}</p>
        <input type="text" class="form-control modal-input" placeholder="${placeholder}" value="${defaultValue}" />
      </div>
      <div class="modal-actions">
        <button class="btn btn-sm btn-secondary btnCancel">Batal</button>
        <button class="btn btn-sm btn-primary btnConfirm">Kirim</button>
      </div>
    </div>
  `;
  container.appendChild(modal);
  const input = modal.querySelector('.modal-input');
  input.focus();

  modal.querySelector('.btnCancel').onclick = () => modal.remove();
  modal.querySelector('.btnConfirm').onclick = () => {
    const val = input.value.trim();
    if (val) {
      modal.remove();
      onConfirm(val);
    } else {
      showToast('Input tidak boleh kosong!', 'warning');
    }
  };
}

// Modal Laporan Target URL Lengkap & Anti-Spam
export function showReportModal(websiteId, targetUrl, siteName) {
  // Cek apakah perangkat sudah pernah melaporkan URL ini
  const reportedSites = JSON.parse(localStorage.getItem('bandar_reported_urls') || '[]');
  if (reportedSites.includes(targetUrl)) {
    showToast('Anda sudah pernah mengirimkan laporan untuk website ini.', 'warning', 4000);
    return;
  }

  const container = document.getElementById('modal-container');
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-card">
      <div class="modal-title">Laporkan Website</div>
      <div class="modal-body">
        <div style="background:#f1f5f9; padding:0.6rem; border-radius:6px; margin-bottom:1rem; font-size:0.85rem;">
          <strong>Target URL:</strong><br/>
          <span class="url-box" style="color:var(--primary); font-weight:600;">${targetUrl}</span>
        </div>
        <div class="form-group">
          <label>Alasan Pelanggaran</label>
          <select class="form-control report-reason">
            <option value="Penipuan / Scam">Penipuan / Scam</option>
            <option value="Judi Online">Judi Online</option>
            <option value="Phishing / Pencurian Data">Phishing / Pencurian Data</option>
            <option value="Spam / Konten Palsu">Spam / Konten Palsu</option>
            <option value="Konten Ilegal / Berbahaya">Konten Ilegal / Berbahaya</option>
            <option value="Lainnya">Lainnya</option>
          </select>
        </div>
        <div class="form-group">
          <label>Keterangan Tambahan (Opsional)</label>
          <textarea class="form-control report-desc" rows="2" placeholder="Jelaskan detail pelanggaran..."></textarea>
        </div>
        <div class="form-group">
          <label>Email Anda (Opsional)</label>
          <input type="email" class="form-control report-email" placeholder="nama@email.com" />
        </div>
      </div>
      <div class="modal-actions">
        <button class="btn btn-sm btn-secondary btnCancel">Batal</button>
        <button class="btn btn-sm btn-danger btnSendReport">Kirim Laporan</button>
      </div>
    </div>
  `;

  container.appendChild(modal);

  modal.querySelector('.btnCancel').onclick = () => modal.remove();
  modal.querySelector('.btnSendReport').onclick = async () => {
    const reason = modal.querySelector('.report-reason').value;
    const description = modal.querySelector('.report-desc').value.trim();
    const reporterEmail = modal.querySelector('.report-email').value.trim() || 'Anonymous';

    modal.remove();
    try {
      await addDoc(collection(db, 'reports'), {
        websiteId,
        targetUrl,
        siteName,
        reason,
        description,
        reporterEmail,
        status: 'new',
        createdAt: serverTimestamp()
      });

      // Simpan URL di LocalStorage perangkat pelapor
      reportedSites.push(targetUrl);
      localStorage.setItem('bandar_reported_urls', JSON.stringify(reportedSites));

      showToast('Laporan telah dikirim ke Admin untuk diperiksa.', 'success');
    } catch (err) {
      showToast('Gagal mengirim laporan: ' + err.message, 'error');
    }
  };
}

// ========================================================
// SMART ULTRA-LIGHT IMAGE COMPRESSOR (~50KB - 90KB, HD Sharpening)
// ========================================================
async function compressImageToUltraLight(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        // Pertahankan lebar 1080px (Standar HD tajam untuk komputer & HP)
        let maxDim = 1080;
        let width = img.width;
        let height = img.height;

        if (width > height && width > maxDim) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else if (height > maxDim) {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        
        // Anti-aliasing rendering untuk menjaga ketajaman font & detail produk
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        // Kualitas 0.65 menghasilkan ukuran ~40KB - 80KB dengan visual sangat tajam
        canvas.toBlob((blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Gagal kompres gambar'));
        }, 'image/jpeg', 0.65);
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
}

async function uploadImageFile(file, path) {
  if (!file) return null;
  const compressedBlob = await compressImageToUltraLight(file);
  const storageRef = ref(storage, path);
  
  const uploadPromise = uploadBytes(storageRef, compressedBlob, { contentType: 'image/jpeg' });
  const timeoutPromise = new Promise((_, reject) => 
    setTimeout(() => reject(new Error("Unggah gambar timeout. Silakan gunakan opsi URL Gambar.")), 15000)
  );

  await Promise.race([uploadPromise, timeoutPromise]);
  return await getDownloadURL(storageRef);
}

// ========================================================
// ROUTER & CORE ENGINE
// ========================================================
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
let currentMathCaptcha = { question: '', answer: 0 };

function generateMathCaptcha() {
  const isMultiplication = Math.random() > 0.5;
  let num1, num2, answer, question;

  if (isMultiplication) {
    num1 = Math.floor(Math.random() * 8) + 2;
    num2 = Math.floor(Math.random() * 8) + 2;
    answer = num1 * num2;
    question = `${num1} × ${num2}`;
  } else {
    num1 = Math.floor(Math.random() * 30) + 5;
    num2 = Math.floor(Math.random() * 30) + 5;
    answer = num1 + num2;
    question = `${num1} + ${num2}`;
  }

  currentMathCaptcha = { question, answer };
  return question;
}

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
  else if (hash.startsWith('#/builder')) requireAuth(() => {
    // Tangkap section tab dari hash: #/builder?tab=hero
    const urlParams = new URLSearchParams(hash.split('?')[1] || '');
    const activeSection = urlParams.get('tab') || 'identity';
    renderModularBuilder(activeSection);
  });
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
  const isAdmin = currentUserProfile?.role === 'admin' || currentUser.email === 'bandardeterjen@gmail.com';
  if (!isAdmin) {
    document.getElementById('app').innerHTML = `<div class="card"><h2>Akses Ditolak</h2><p>Halaman ini khusus Administrator.</p></div>`;
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

  const isAdmin = currentUserProfile?.role === 'admin' || currentUser?.email === 'bandardeterjen@gmail.com';

  container.innerHTML = `
    <header class="navbar">
      <a href="#/dashboard" class="brand">BandarBuilder</a>
      <nav class="nav-links">
        ${currentUser ? `
          <a href="#/dashboard">Dashboard</a>
          ${isAdmin ? '<a href="#/admin" style="color:var(--primary); font-weight:bold;">Admin Control Panel</a>' : ''}
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
    showToast('Berhasil keluar.', 'info');
    navigate('#/login');
  });
}

// 1. Registrasi
function renderRegister() {
  const app = document.getElementById('app');
  const mathQuestion = generateMathCaptcha();

  app.innerHTML = `
    <div class="card" style="max-width:460px; margin: 2rem auto;">
      <h2>Registrasi Akun Baru</h2>
      <p class="help-text">Buat akun untuk meluncurkan landing page bisnis Anda.</p>
      
      <form id="formRegister" style="margin-top:1.25rem;">
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
          <div class="help-text">3-30 karakter huruf kecil, angka, dan tanda '-'</div>
        </div>

        <div class="form-group" style="background:#f1f5f9; padding:1rem; border-radius:6px; border:1px solid var(--border);">
          <label style="color:#0f172a; font-weight:bold;">🛡️ Verifikasi Keamanan (Anti-Spam)</label>
          <p class="help-text" style="margin-bottom:0.5rem;">Berapakah hasil dari: <strong style="font-size:1.1rem; color:var(--primary);">${mathQuestion} = ?</strong></p>
          <input type="number" id="regCaptcha" class="form-control" placeholder="Tulis jawaban angka..." required />
        </div>

        <button type="submit" class="btn btn-primary" style="width:100%; margin-top:0.5rem;">Daftar Sekarang</button>
      </form>
    </div>
  `;

  document.getElementById('formRegister').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('regName').value.trim();
    const email = document.getElementById('regEmail').value.trim();
    const pass = document.getElementById('regPass').value;
    const username = document.getElementById('regUsername').value.trim().toLowerCase();
    const captchaInput = Number(document.getElementById('regCaptcha').value.trim());

    if (captchaInput !== currentMathCaptcha.answer) {
      showToast('Jawaban verifikasi keamanan salah!', 'error');
      renderRegister();
      return;
    }

    if (!/^[a-z0-9-]{3,30}$/.test(username)) {
      showToast('Username harus 3-30 karakter.', 'warning');
      return;
    }
    if (RESERVED_USERNAMES.includes(username)) {
      showToast('Username ini dicadangkan oleh sistem.', 'warning');
      return;
    }

    try {
      const uDoc = await getDoc(doc(db, 'usernames', username));
      if (uDoc.exists()) {
        showToast('Username sudah terpakai.', 'warning');
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

      showToast('Akun berhasil terdaftar!', 'success');
      window.location.hash = '#/dashboard';
    } catch (err) {
      showToast('Registrasi gagal: ' + err.message, 'error');
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
      showToast('Berhasil masuk.', 'success');
      window.location.hash = '#/dashboard';
    } catch (err) {
      showToast('Login gagal: ' + err.message, 'error');
    }
  });
}

// 3. User Dashboard
async function renderDashboard() {
  if (!currentUser) return renderLogin();
  const app = document.getElementById('app');
  app.innerHTML = `<div class="card"><p>Memuat data dashboard...</p></div>`;

  const isAdmin = currentUserProfile?.role === 'admin' || currentUser.email === 'bandardeterjen@gmail.com';

  if (isAdmin) {
    renderAdminDashboard();
    return;
  }

  const siteDoc = await getDoc(doc(db, 'websites', currentUser.uid));
  const site = siteDoc.data() || {};
  const username = site.username || 'user';

  const publicRelativeUrl = `${BASE_PATH}/#/site/${username}`;
  const fullDisplayUrl = `${window.location.origin}${BASE_PATH}/site/${username}`;

  app.innerHTML = `
    <div class="card">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <h2>Selamat Datang, ${currentUserProfile?.name || 'User'}</h2>
      </div>
      
      <div style="margin-top: 1rem;">
        <p><strong>Website:</strong> ${site.siteName || '-'}</p>
        <p><strong>Username:</strong> @${username}</p>
        <p>
          <strong>URL Landing Page:</strong><br/>
          <a href="${publicRelativeUrl}" target="_blank" class="url-box" style="color:var(--primary); font-weight:600;">${fullDisplayUrl}</a>
        </p>
        <p><strong>Paket:</strong> <span class="badge" style="background:#0284c7;">${site.plan?.toUpperCase() || 'FREE'}</span></p>
        <p><strong>Status:</strong> <span class="badge badge-${site.status}">${site.status?.replace('_', ' ').toUpperCase()}</span></p>
        
        ${site.status === 'rejected' ? `
          <div style="margin-top:1rem; padding:0.75rem; background:#fee2e2; border:1px solid #f87171; border-radius:6px; color:#991b1b;">
            <strong>Catatan Penolakan:</strong> ${site.moderationNote || 'Perbaiki konten agar sesuai ketentuan.'}
          </div>
        ` : ''}
        ${site.status === 'suspended' ? `
          <div style="margin-top:1rem; padding:0.75rem; background:#fee2e2; border:1px solid #f87171; border-radius:6px; color:#991b1b;">
            <strong>Website Disuspend oleh Admin:</strong> ${site.moderationNote || 'Melanggar kebijakan platform.'}
          </div>
        ` : ''}
      </div>

      <div style="margin-top: 1.5rem; display: flex; gap: 0.5rem; flex-wrap: wrap;">
        <a href="#/builder?tab=identity" class="btn btn-primary">Edit Website</a>
        <button id="btnSubmitReview" class="btn btn-secondary" ${['pending_review', 'approved', 'published'].includes(site.status) ? 'disabled' : ''}>
          ${site.status === 'pending_review' ? 'Menunggu Review Admin' : 'Ajukan Review'}
        </button>
        <a href="${publicRelativeUrl}" class="btn btn-success" ${site.status !== 'published' ? 'style="opacity:0.5; pointer-events:none;"' : ''}>
          Lihat Landing Page
        </a>
      </div>
    </div>

    <div class="card">
      <h3>Komponen & Layanan Landing Page</h3>
      <p class="help-text" style="margin-bottom:1rem;">Pilih bagian yang ingin diedit secara spesifik:</p>
      <div class="lp-grid">
        <div class="lp-card" style="text-align:left;">
          <h4>🏷️ Identitas & SEO</h4>
          <p class="help-text">${site.siteName || '-'}</p>
          <a href="#/builder?tab=identity" class="btn btn-sm btn-secondary" style="margin-top:0.5rem;">Edit Identitas</a>
        </div>
        <div class="lp-card" style="text-align:left;">
          <h4>🖼️ Hero Banner</h4>
          <p class="help-text">${site.hero?.imageUrl ? '✅ Gambar Terpasang' : '⚪ Polos Tanpa Gambar'}</p>
          <a href="#/builder?tab=hero" class="btn btn-sm btn-secondary" style="margin-top:0.5rem;">Edit Hero Banner</a>
        </div>
        <div class="lp-card" style="text-align:left;">
          <h4>📖 Tentang Kami</h4>
          <p class="help-text">${site.about?.content ? '✅ Profil Terisi' : '⚪ Belum ada isi'}</p>
          <a href="#/builder?tab=about" class="btn btn-sm btn-secondary" style="margin-top:0.5rem;">Edit Tentang Kami</a>
        </div>
        <div class="lp-card" style="text-align:left;">
          <h4>💼 Layanan (${site.services?.length || 0})</h4>
          <p class="help-text">${site.services?.length ? '✅ ' + site.services.length + ' Layanan' : '⚪ Belum ada layanan'}</p>
          <a href="#/builder?tab=services" class="btn btn-sm btn-secondary" style="margin-top:0.5rem;">Kelola Layanan</a>
        </div>
        <div class="lp-card" style="text-align:left;">
          <h4>🛍️ Produk (${site.products?.length || 0}/5)</h4>
          <p class="help-text">${site.products?.length ? '✅ ' + site.products.length + ' Produk' : '⚪ Belum ada produk'}</p>
          <a href="#/builder?tab=products" class="btn btn-sm btn-secondary" style="margin-top:0.5rem;">Kelola Produk</a>
        </div>
        <div class="lp-card" style="text-align:left;">
          <h4>❓ FAQ (${site.faqs?.length || 0})</h4>
          <p class="help-text">${site.faqs?.length ? '✅ ' + site.faqs.length + ' Tanya Jawab' : '⚪ Belum ada FAQ'}</p>
          <a href="#/builder?tab=faqs" class="btn btn-sm btn-secondary" style="margin-top:0.5rem;">Kelola FAQ</a>
        </div>
        <div class="lp-card" style="text-align:left;">
          <h4>⭐ Testimoni (${site.testimonials?.length || 0})</h4>
          <p class="help-text">${site.testimonials?.length ? '✅ ' + site.testimonials.length + ' Testimoni' : '⚪ Belum ada ulasan'}</p>
          <a href="#/builder?tab=testimonials" class="btn btn-sm btn-secondary" style="margin-top:0.5rem;">Kelola Testimoni</a>
        </div>
        <div class="lp-card" style="text-align:left;">
          <h4>📞 Kontak & WhatsApp</h4>
          <p class="help-text">${site.contact?.whatsapp ? '✅ +' + site.contact.whatsapp : '⚪ Belum diatur'}</p>
          <a href="#/builder?tab=contact" class="btn btn-sm btn-secondary" style="margin-top:0.5rem;">Edit Kontak</a>
        </div>
      </div>
    </div>
  `;

  document.getElementById('btnSubmitReview')?.addEventListener('click', () => {
    showConfirm(
      'Ajukan Review Website',
      'Apakah Anda yakin ingin mengajukan landing page ini untuk dimoderasi oleh admin?',
      async () => {
        await updateDoc(doc(db, 'websites', currentUser.uid), {
          status: 'pending_review',
          published: false,
          updatedAt: serverTimestamp()
        });
        showToast('Landing page berhasil diajukan untuk review!', 'success');
        renderDashboard();
      }
    );
  });
}

// 4. MODULAR SECTION BUILDER (Hanya Menampilkan Bagian yang Dipilih)
async function renderModularBuilder(activeTab = 'identity') {
  const app = document.getElementById('app');
  app.innerHTML = `<div class="card"><p>Memuat editor...</p></div>`;

  const siteDoc = await getDoc(doc(db, 'websites', currentUser.uid));
  const site = siteDoc.data() || {};
  const isAdmin = currentUserProfile?.role === 'admin' || currentUser.email === 'bandardeterjen@gmail.com';

  let products = site.products || [];
  let services = site.services || [];
  let faqs = site.faqs || [];
  let testimonials = site.testimonials || [];

  const tabList = [
    { id: 'identity', label: '🏷️ Identitas' },
    { id: 'hero', label: '🖼️ Hero Banner' },
    { id: 'about', label: '📖 Tentang Kami' },
    { id: 'services', label: '💼 Layanan' },
    { id: 'products', label: '🛍️ Produk' },
    { id: 'faqs', label: '❓ FAQ' },
    { id: 'testimonials', label: '⭐ Testimoni' },
    { id: 'contact', label: '📞 Kontak' }
  ];

  const tabsHtml = `
    <div class="builder-tabs">
      ${tabList.map(t => `
        <button type="button" class="builder-tab-btn ${t.id === activeTab ? 'active' : ''}" data-tab="${t.id}">
          ${t.label}
        </button>
      `).join('')}
    </div>
  `;

  // Formulir Spesifik Berdasarkan Tab Aktif
  let formBodyHtml = '';

  if (activeTab === 'identity') {
    formBodyHtml = `
      <h3>Identitas Bisnis & SEO</h3>
      <div class="form-group" style="margin-top:1rem;">
        <label>Nama Bisnis / Brand (Title Website)</label>
        <input type="text" id="siteName" class="form-control" value="${site.siteName || ''}" required />
      </div>
      <div class="form-group">
        <label>Deskripsi Bisnis (SEO & OpenGraph)</label>
        <textarea id="siteDesc" class="form-control" rows="3" required>${site.description || ''}</textarea>
      </div>
    `;
  } else if (activeTab === 'hero') {
    formBodyHtml = `
      <h3>Hero Section (Banner Utama)</h3>
      <div class="form-group" style="margin-top:1rem;">
        <label>Judul Hero Banner</label>
        <input type="text" id="heroTitle" class="form-control" value="${site.hero?.title || ''}" required />
      </div>
      <div class="form-group">
        <label>Subjudul Hero</label>
        <input type="text" id="heroSubtitle" class="form-control" value="${site.hero?.subtitle || ''}" />
      </div>
      <div class="form-group" style="background:#f8fafc; padding:1rem; border-radius:6px; border:1px solid var(--border);">
        <label><strong>Gambar Hero Banner (Opsional / Ringan ~50KB)</strong></label>
        <p class="help-text" style="margin-bottom:0.5rem;">Pilihan 1: Masukkan link URL langsung</p>
        <input type="url" id="heroImageUrl" class="form-control" placeholder="https://contoh.com/gambar-hero.jpg" value="${site.hero?.imageUrl || ''}" />
        <p class="help-text" style="margin-top:0.75rem; margin-bottom:0.25rem;">Pilihan 2: Upload file (Auto-Compress Ringan)</p>
        <input type="file" id="heroImageFile" class="form-control" accept="image/*" />
      </div>
    `;
  } else if (activeTab === 'about') {
    formBodyHtml = `
      <h3>Tentang Kami</h3>
      <div class="form-group" style="margin-top:1rem;">
        <label>Judul Section</label>
        <input type="text" id="aboutTitle" class="form-control" value="${site.about?.title || 'Tentang Kami'}" />
      </div>
      <div class="form-group">
        <label>Konten Profil / Cerita Bisnis</label>
        <textarea id="aboutContent" class="form-control" rows="5">${site.about?.content || ''}</textarea>
      </div>
    `;
  } else if (activeTab === 'services') {
    formBodyHtml = `
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <h3>Kelola Layanan & Keunggulan</h3>
        <button type="button" id="btnAddService" class="btn btn-sm btn-secondary">+ Tambah</button>
      </div>
      <div id="serviceContainer" style="margin-top:1rem;"></div>
    `;
  } else if (activeTab === 'products') {
    formBodyHtml = `
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <h3>Katalog Produk (Maksimal 5 Produk)</h3>
        <button type="button" id="btnAddProduct" class="btn btn-sm btn-secondary">+ Tambah Produk</button>
      </div>
      <div id="productContainer" style="margin-top:1rem;"></div>
    `;
  } else if (activeTab === 'faqs') {
    formBodyHtml = `
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <h3>Pertanyaan yang Sering Diajukan (FAQ)</h3>
        <button type="button" id="btnAddFaq" class="btn btn-sm btn-secondary">+ Tambah FAQ</button>
      </div>
      <div id="faqContainer" style="margin-top:1rem;"></div>
    `;
  } else if (activeTab === 'testimonials') {
    formBodyHtml = `
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <h3>Testimoni Pelanggan</h3>
        <button type="button" id="btnAddTesti" class="btn btn-sm btn-secondary">+ Tambah Testimoni</button>
      </div>
      <div id="testiContainer" style="margin-top:1rem;"></div>
    `;
  } else if (activeTab === 'contact') {
    formBodyHtml = `
      <h3>Kontak & Pemesanan</h3>
      <div class="form-group" style="margin-top:1rem;">
        <label>Nomor WhatsApp (Format: 628xxxxxxxxxx)</label>
        <input type="text" id="siteWa" class="form-control" value="${site.contact?.whatsapp || ''}" required />
      </div>
      <div class="form-group">
        <label>Alamat / Lokasi Operasional</label>
        <input type="text" id="siteAddress" class="form-control" value="${site.contact?.address || ''}" />
      </div>
    `;
  }

  app.innerHTML = `
    <div class="card">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem;">
        <h2>${isAdmin ? 'Edit Website Demo' : 'Editor Landing Page'}</h2>
        <a href="#/dashboard" class="btn btn-sm btn-secondary">Dashboard</a>
      </div>

      ${tabsHtml}
      
      <form id="formModularBuilder">
        ${formBodyHtml}
        <button type="submit" id="btnSaveBuilder" class="btn btn-primary" style="margin-top:1.5rem; width:100%; font-size:1.05rem; padding:0.8rem;">
          Simpan Bagian Ini
        </button>
      </form>
    </div>
  `;

  // Tab Switching Listener
  document.querySelectorAll('.builder-tab-btn').forEach(btn => {
    btn.onclick = (e) => {
      const targetTab = e.target.dataset.tab;
      window.location.hash = `#/builder?tab=${targetTab}`;
    };
  });

  // Render Sub-Komponen Berdasarkan Tab
  if (activeTab === 'services') {
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
    renderServices();
    document.getElementById('btnAddService').onclick = () => {
      services.push({ title: '', desc: '' });
      renderServices();
    };
  }

  if (activeTab === 'products') {
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
            <label style="font-size:0.8rem; font-weight:bold;">Foto Produk (Pilihan 1: URL Gambar)</label>
            <input type="url" class="form-control p-url" placeholder="https://contoh.com/foto-produk.jpg" value="${p.imageUrl || ''}" style="margin-bottom:0.5rem;" />
            <label style="font-size:0.8rem; font-weight:bold;">Pilihan 2: Upload File (Kompresi Ringan ~50KB):</label>
            <input type="file" class="form-control p-file" accept="image/*" />
          </div>
        </div>
      `).join('');
      document.querySelectorAll('.btnDelProd').forEach(b => b.onclick = (e) => {
        products.splice(e.target.dataset.idx, 1);
        renderProducts();
      });
    };
    renderProducts();
    document.getElementById('btnAddProduct').onclick = () => {
      if (products.length >= 5) {
        showToast('Paket Free dibatasi maksimal 5 produk.', 'warning');
        return;
      }
      products.push({ name: '', price: '', description: '', imageUrl: '' });
      renderProducts();
    };
  }

  if (activeTab === 'faqs') {
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
    renderFaqs();
    document.getElementById('btnAddFaq').onclick = () => {
      faqs.push({ q: '', a: '' });
      renderFaqs();
    };
  }

  if (activeTab === 'testimonials') {
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
    renderTestis();
    document.getElementById('btnAddTesti').onclick = () => {
      testimonials.push({ name: '', text: '' });
      renderTestis();
    };
  }

  // Submit Handler Per-Section (Menyimpan Hanya Perubahan Terkait)
  document.getElementById('formModularBuilder').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btnSave = document.getElementById('btnSaveBuilder');
    btnSave.disabled = true;
    btnSave.innerText = "⏳ Sedang Menyimpan...";
    showToast('Sedang menyimpan perubahan...', 'info', 1500);

    const updatePayload = { updatedAt: serverTimestamp() };

    try {
      if (activeTab === 'identity') {
        updatePayload.siteName = document.getElementById('siteName').value.trim();
        updatePayload.description = document.getElementById('siteDesc').value.trim();
      } else if (activeTab === 'hero') {
        let heroImgUrl = document.getElementById('heroImageUrl').value.trim();
        const heroFileInput = document.getElementById('heroImageFile');
        if (heroFileInput.files[0]) {
          btnSave.innerText = "⏳ Mengunggah Hero Banner...";
          heroImgUrl = await uploadImageFile(heroFileInput.files[0], `websites/${currentUser.uid}/hero_${Date.now()}`);
        }
        updatePayload.hero = {
          title: document.getElementById('heroTitle').value.trim(),
          subtitle: document.getElementById('heroSubtitle').value.trim(),
          imageUrl: heroImgUrl
        };
      } else if (activeTab === 'about') {
        updatePayload.about = {
          title: document.getElementById('aboutTitle').value.trim(),
          content: document.getElementById('aboutContent').value.trim()
        };
      } else if (activeTab === 'services') {
        const sTitles = document.querySelectorAll('.s-title');
        const sDescs = document.querySelectorAll('.s-desc');
        const updatedServices = [];
        for (let i = 0; i < sTitles.length; i++) {
          updatedServices.push({ title: sTitles[i].value, desc: sDescs[i].value });
        }
        updatePayload.services = updatedServices;
      } else if (activeTab === 'products') {
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
        updatePayload.products = updatedProducts;
      } else if (activeTab === 'faqs') {
        const fQs = document.querySelectorAll('.f-q');
        const fAs = document.querySelectorAll('.f-a');
        const updatedFaqs = [];
        for (let i = 0; i < fQs.length; i++) {
          updatedFaqs.push({ q: fQs[i].value, a: fAs[i].value });
        }
        updatePayload.faqs = updatedFaqs;
      } else if (activeTab === 'testimonials') {
        const tNames = document.querySelectorAll('.t-name');
        const tTexts = document.querySelectorAll('.t-text');
        const updatedTestis = [];
        for (let i = 0; i < tNames.length; i++) {
          updatedTestis.push({ name: tNames[i].value, text: tTexts[i].value });
        }
        updatePayload.testimonials = updatedTestis;
      } else if (activeTab === 'contact') {
        updatePayload.contact = {
          whatsapp: document.getElementById('siteWa').value.trim(),
          address: document.getElementById('siteAddress').value.trim()
        };
      }

      await updateDoc(doc(db, 'websites', currentUser.uid), updatePayload);
      showToast('Bagian berhasil disimpan!', 'success');
      navigate('#/dashboard');
    } catch (err) {
      showToast('Gagal menyimpan: ' + err.message, 'error');
    } finally {
      btnSave.disabled = false;
      btnSave.innerText = "Simpan Bagian Ini";
    }
  });
}

// 5. ADMIN CONTROL PANEL
async function renderAdminDashboard() {
  const app = document.getElementById('app');
  app.innerHTML = `<div class="card"><p>Memuat Admin Dashboard...</p></div>`;

  const uSnap = await getDocs(collection(db, 'users'));
  const wSnap = await getDocs(collection(db, 'websites'));
  const pSnap = await getDocs(query(collection(db, 'websites'), where('status', '==', 'pending_review')));
  const pubSnap = await getDocs(query(collection(db, 'websites'), where('status', '==', 'published')));
  const susSnap = await getDocs(query(collection(db, 'websites'), where('status', '==', 'suspended')));
  const repSnap = await getDocs(collection(db, 'reports'));

  const adminSiteDoc = await getDoc(doc(db, 'websites', currentUser.uid));
  const adminSite = adminSiteDoc.data() || {};
  const adminDemoUrl = `${BASE_PATH}/#/site/${adminSite.username || 'admin'}`;

  // 1. Baris Tabel Users
  let usersHtml = '';
  uSnap.forEach(uDoc => {
    const u = uDoc.data();
    const uid = uDoc.id;
    const isMe = uid === currentUser.uid;
    const isSuspended = u.status === 'suspended' || u.status === 'banned';

    usersHtml += `
      <tr>
        <td>
          <strong>${u.name || '-'}</strong><br/>
          <small class="url-box">${u.email || '-'} (@${u.username || '-'})</small>
        </td>
        <td>
          <span class="badge ${u.role === 'admin' ? 'badge-published' : 'badge-draft'}">${u.role?.toUpperCase() || 'USER'}</span>
        </td>
        <td>
          <span class="badge ${isSuspended ? 'badge-rejected' : 'badge-published'}">${u.status?.toUpperCase() || 'ACTIVE'}</span>
        </td>
        <td>
          ${!isMe ? `
            <div style="display:flex; gap:4px; flex-wrap:wrap;">
              ${!isSuspended ? `
                <button class="btn btn-sm btn-danger btnSuspendUser" data-id="${uid}" data-name="${u.name}">
                  ⛔ Suspend
                </button>
              ` : `
                <button class="btn btn-sm btn-success btnReactivateUser" data-id="${uid}">
                  ✅ Aktifkan
                </button>
              `}
              <button class="btn btn-sm btn-secondary btnToggleRole" data-id="${uid}" data-role="${u.role || 'user'}">
                ${u.role === 'admin' ? 'Set User' : 'Set Admin'}
              </button>
            </div>
          ` : '<span style="color:var(--text-muted); font-size:0.8rem;">(Akun Anda)</span>'}
        </td>
      </tr>
    `;
  });

  // 2. Baris Tabel Websites
  let sitesHtml = '';
  wSnap.forEach(docSnap => {
    const site = docSnap.data();
    const siteId = docSnap.id;
    const isPublished = site.status === 'published';
    const isSuspended = site.status === 'suspended';
    const isDraft = site.status === 'draft';
    const isAdminDemo = siteId === currentUser.uid;

    sitesHtml += `
      <tr>
        <td>
          <strong>${site.siteName || '-'}</strong> ${isAdminDemo ? '<span class="badge badge-approved" style="font-size:0.65rem;">DEMO</span>' : ''}<br/>
          <small class="url-box">@${site.username}</small>
        </td>
        <td>
          <span class="badge badge-${site.status}">${site.status?.replace('_', ' ').toUpperCase()}</span>
        </td>
        <td>
          <div style="display:flex; gap:4px; flex-wrap:wrap;">
            <a href="${BASE_PATH}/#/site/${site.username}" target="_blank" class="btn btn-sm btn-secondary">Preview</a>
            
            ${!isPublished ? `
              <button class="btn btn-sm btn-success btnDirectPublish" data-id="${siteId}" data-name="${site.siteName}">
                🚀 Publish
              </button>
            ` : ''}

            ${!isDraft ? `
              <button class="btn btn-sm btn-secondary btnDirectDraft" data-id="${siteId}" data-name="${site.siteName}">
                📝 Draft
              </button>
            ` : ''}

            ${!isSuspended ? `
              <button class="btn btn-sm btn-danger btnDirectSuspend" data-id="${siteId}" data-name="${site.siteName}">
                ⛔ Suspend
              </button>
            ` : `
              <button class="btn btn-sm btn-primary btnDirectUnsuspend" data-id="${siteId}">
                🔓 Unsuspend
              </button>
            `}
          </div>
        </td>
      </tr>
    `;
  });

  // 3. Baris Tabel Laporan Pelanggaran (Dengan URL Landing Page Lengkap)
  let reportsHtml = '';
  let newReportsCount = 0;
  repSnap.forEach(rDoc => {
    const r = rDoc.data();
    const repId = rDoc.id;
    const isNew = r.status === 'new';
    if (isNew) newReportsCount++;

    const dateStr = r.createdAt?.toDate ? r.createdAt.toDate().toLocaleDateString('id-ID') : 'Baru saja';
    const reportedUrl = r.targetUrl || `${window.location.origin}${BASE_PATH}/#/site/${r.websiteId}`;

    reportsHtml += `
      <tr style="${isNew ? 'background:#fffbeb;' : ''}">
        <td>
          <strong>${r.siteName || '-'}</strong><br/>
          <a href="${reportedUrl}" target="_blank" class="url-box" style="color:var(--primary); font-size:0.8rem; font-weight:600;">
            ${reportedUrl}
          </a><br/>
          <small style="color:var(--text-muted);">${dateStr}</small>
        </td>
        <td>
          <strong style="color:#b91c1c;">${r.reason || '-'}</strong>
          ${r.description ? `<p style="font-size:0.8rem; color:#475569; margin-top:2px;">"${r.description}"</p>` : ''}
          <small class="url-box" style="color:var(--text-muted);">Pelapor: ${r.reporterEmail || 'Anonim'}</small>
        </td>
        <td>
          <span class="badge ${isNew ? 'badge-rejected' : (r.status === 'resolved' ? 'badge-published' : 'badge-draft')}">
            ${r.status?.toUpperCase() || 'NEW'}
          </span>
        </td>
        <td>
          <div style="display:flex; gap:4px; flex-wrap:wrap;">
            <button class="btn btn-sm btn-danger btnReportSuspend" data-siteid="${r.websiteId}" data-sitename="${r.siteName || ''}" data-repid="${repId}">
              ⛔ Suspend Site
            </button>
            ${isNew ? `
              <button class="btn btn-sm btn-success btnResolveReport" data-id="${repId}">
                ✅ Selesai
              </button>
              <button class="btn btn-sm btn-secondary btnDismissReport" data-id="${repId}">
                Abaikan
              </button>
            ` : ''}
          </div>
        </td>
      </tr>
    `;
  });

  app.innerHTML = `
    <div class="card">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem;">
        <div>
          <h2>Pusat Kendali Administrator</h2>
          <p class="help-text">Pengawasan Platform, Moderasi Konten & Manajemen Pengguna</p>
        </div>
        <div>
          <a href="#/builder?tab=identity" class="btn btn-sm btn-primary">🛠️ Edit Demo</a>
          <a href="${adminDemoUrl}" target="_blank" class="btn btn-sm btn-success">Lihat Demo</a>
        </div>
      </div>

      <div class="lp-grid" style="margin-top:1.5rem;">
        <div class="lp-card">
          <h2 style="color:var(--primary);">${uSnap.size}</h2>
          <p>Pengguna</p>
        </div>
        <div class="lp-card">
          <h2 style="color:var(--badge-pending);">${pSnap.size}</h2>
          <p>Menunggu Review</p>
        </div>
        <div class="lp-card">
          <h2 style="color:var(--badge-published);">${pubSnap.size}</h2>
          <p>Published</p>
        </div>
        <div class="lp-card">
          <h2 style="color:#dc2626;">${repSnap.size}</h2>
          <p>Laporan</p>
        </div>
      </div>
    </div>

    ${pSnap.size > 0 ? `
      <div class="card" style="border: 2px solid var(--badge-pending); background: #fffbeb;">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem;">
          <div>
            <h3 style="color:#b45309;">⚠️ Ada ${pSnap.size} Website Menunggu Moderasi!</h3>
            <p style="margin-top:0.25rem;">Pengguna telah mengajukan permohonan publikasi website baru.</p>
          </div>
          <a href="#/admin/reviews" class="btn btn-primary">Buka Antrean Moderasi</a>
        </div>
      </div>
    ` : ''}

    <div class="card" style="${newReportsCount > 0 ? 'border: 2px solid #ef4444;' : ''}">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <h3>🚨 Laporan Penyalahgunaan Website (${repSnap.size})</h3>
        ${newReportsCount > 0 ? `<span class="badge badge-rejected">${newReportsCount} Baru</span>` : ''}
      </div>
      <p class="help-text" style="margin-bottom:1rem;">Daftar target URL landing page yang dilaporkan masyarakat.</p>
      
      <div class="table-responsive">
        <table>
          <thead>
            <tr>
              <th>Target Website & URL</th>
              <th>Detail Laporan</th>
              <th>Status</th>
              <th>Tindakan Admin</th>
            </tr>
          </thead>
          <tbody>
            ${reportsHtml || '<tr><td colspan="4" style="text-align:center;">Belum ada laporan penyalahgunaan.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>

    <div class="card">
      <h3>👥 Kelola Akun Pengguna</h3>
      <div class="table-responsive">
        <table>
          <thead>
            <tr>
              <th>Pengguna</th>
              <th>Role</th>
              <th>Status</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            ${usersHtml || '<tr><td colspan="4">Belum ada user.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>

    <div class="card">
      <h3>🌐 Kelola Seluruh Landing Page</h3>
      <div class="table-responsive">
        <table>
          <thead>
            <tr>
              <th>Website</th>
              <th>Status</th>
              <th>Aksi Cepat</th>
            </tr>
          </thead>
          <tbody>
            ${sitesHtml || '<tr><td colspan="3">Belum ada website.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `;

  // === LISTENERS LAPORAN ===
  document.querySelectorAll('.btnReportSuspend').forEach(btn => {
    btn.onclick = (e) => {
      const siteId = e.target.dataset.siteid;
      const siteName = e.target.dataset.sitename || 'Website Terlapor';
      const repId = e.target.dataset.repid;

      showPrompt(
        'Tangguhkan Website Terlapor',
        `Tuliskan alasan penangguhan untuk "${siteName}":`,
        'Terbukti melanggar kebijakan platform berdasarkan laporan publik',
        async (reason) => {
          await updateDoc(doc(db, 'websites', siteId), {
            status: 'suspended',
            published: false,
            moderationNote: reason,
            reviewedBy: currentUser.uid,
            reviewedAt: serverTimestamp()
          });

          await updateDoc(doc(db, 'reports', repId), {
            status: 'resolved',
            actionTaken: 'suspended',
            resolvedAt: serverTimestamp()
          });

          showToast(`Website "${siteName}" telah disuspend!`, 'success');
          renderAdminDashboard();
        }
      );
    };
  });

  document.querySelectorAll('.btnResolveReport').forEach(btn => {
    btn.onclick = (e) => {
      const repId = e.target.dataset.id;
      showConfirm('Selesaikan Laporan', 'Tandai laporan ini sebagai SELESAI (Resolved)?', async () => {
        await updateDoc(doc(db, 'reports', repId), {
          status: 'resolved',
          resolvedAt: serverTimestamp()
        });
        showToast('Laporan diselesaikan.', 'success');
        renderAdminDashboard();
      });
    };
  });

  document.querySelectorAll('.btnDismissReport').forEach(btn => {
    btn.onclick = (e) => {
      const repId = e.target.dataset.id;
      showConfirm('Abaikan Laporan', 'Abaikan laporan ini?', async () => {
        await updateDoc(doc(db, 'reports', repId), {
          status: 'dismissed',
          dismissedAt: serverTimestamp()
        });
        showToast('Laporan diabaikan.', 'info');
        renderAdminDashboard();
      });
    };
  });

  // User & Website Actions
  document.querySelectorAll('.btnSuspendUser').forEach(btn => {
    btn.onclick = (e) => {
      const uid = e.target.dataset.id;
      const name = e.target.dataset.name;
      showConfirm(
        'Tangguhkan Pengguna',
        `Tangguhkan akun "${name}"? Seluruh website miliknya tidak akan bisa diakses.`,
        async () => {
          await updateDoc(doc(db, 'users', uid), { status: 'suspended' });
          await updateDoc(doc(db, 'websites', uid), { 
            status: 'suspended', 
            published: false,
            moderationNote: 'Akun dinonaktifkan administrator.'
          });
          showToast(`Akun "${name}" telah ditangguhkan!`, 'warning');
          renderAdminDashboard();
        },
        'Suspend Akun',
        true
      );
    };
  });

  document.querySelectorAll('.btnReactivateUser').forEach(btn => {
    btn.onclick = (e) => {
      const uid = e.target.dataset.id;
      showConfirm('Aktifkan Akun', 'Aktifkan kembali akun pengguna ini?', async () => {
        await updateDoc(doc(db, 'users', uid), { status: 'active' });
        showToast('Akun user kembali aktif.', 'success');
        renderAdminDashboard();
      });
    };
  });

  document.querySelectorAll('.btnToggleRole').forEach(btn => {
    btn.onclick = (e) => {
      const uid = e.target.dataset.id;
      const currentRole = e.target.dataset.role;
      const newRole = currentRole === 'admin' ? 'user' : 'admin';
      showConfirm('Ubah Peran', `Ubah role pengguna menjadi "${newRole.toUpperCase()}"?`, async () => {
        await updateDoc(doc(db, 'users', uid), { role: newRole });
        showToast(`Role diubah menjadi ${newRole.toUpperCase()}.`, 'success');
        renderAdminDashboard();
      });
    };
  });

  document.querySelectorAll('.btnDirectPublish').forEach(btn => {
    btn.onclick = (e) => {
      const siteId = e.target.dataset.id;
      const name = e.target.dataset.name;
      showConfirm('Publikasikan Website', `Publikasikan "${name}" sekarang?`, async () => {
        await updateDoc(doc(db, 'websites', siteId), {
          status: 'published',
          published: true,
          approved: true,
          reviewedBy: currentUser.uid,
          reviewedAt: serverTimestamp()
        });
        showToast(`Website "${name}" telah DIPUBLIKASIKAN!`, 'success');
        renderAdminDashboard();
      }, 'Publikasikan');
    };
  });

  document.querySelectorAll('.btnDirectDraft').forEach(btn => {
    btn.onclick = (e) => {
      const siteId = e.target.dataset.id;
      const name = e.target.dataset.name;
      showConfirm('Kembalikan ke Draft', `Ubah "${name}" menjadi DRAFT?`, async () => {
        await updateDoc(doc(db, 'websites', siteId), {
          status: 'draft',
          published: false,
          approved: false,
          updatedAt: serverTimestamp()
        });
        showToast(`Website "${name}" diubah ke DRAFT.`, 'info');
        renderAdminDashboard();
      });
    };
  });

  document.querySelectorAll('.btnDirectSuspend').forEach(btn => {
    btn.onclick = (e) => {
      const siteId = e.target.dataset.id;
      const name = e.target.dataset.name;
      showPrompt(
        'Penangguhan Website',
        `Alasan penangguhan "${name}":`,
        'Melanggar kebijakan platform / Spam',
        async (reason) => {
          await updateDoc(doc(db, 'websites', siteId), {
            status: 'suspended',
            published: false,
            moderationNote: reason,
            reviewedBy: currentUser.uid,
            reviewedAt: serverTimestamp()
          });
          showToast(`Website "${name}" telah di-SUSPEND!`, 'warning');
          renderAdminDashboard();
        }
      );
    };
  });

  document.querySelectorAll('.btnDirectUnsuspend').forEach(btn => {
    btn.onclick = (e) => {
      const siteId = e.target.dataset.id;
      showConfirm('Buka Penangguhan', 'Buka penangguhan website ini?', async () => {
        await updateDoc(doc(db, 'websites', siteId), {
          status: 'draft',
          published: false,
          moderationNote: '',
          updatedAt: serverTimestamp()
        });
        showToast('Website telah di-unsuspend.', 'success');
        renderAdminDashboard();
      });
    };
  });
}

// Antrean Moderasi Khusus
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
        <a href="#/admin" class="btn btn-secondary" style="margin-top:1rem;">Kembali ke Admin Panel</a>
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
        <div style="margin-top:1rem; display:flex; gap:0.5rem; flex-wrap:wrap;">
          <button class="btn btn-sm btn-secondary btnPreviewAdmin" data-user="${data.username}">Preview</button>
          <button class="btn btn-sm btn-success btnApprove" data-id="${docSnap.id}">Approve & Publish</button>
          <button class="btn btn-sm btn-danger btnReject" data-id="${docSnap.id}">Reject</button>
        </div>
      </div>
    `;
  });

  html += `</div><a href="#/admin" class="btn btn-secondary">Kembali ke Admin Panel</a></div>`;
  app.innerHTML = html;

  document.querySelectorAll('.btnPreviewAdmin').forEach(b => {
    b.onclick = (e) => window.open(`${BASE_PATH}/#/site/${e.target.dataset.user}`, '_blank');
  });

  document.querySelectorAll('.btnApprove').forEach(b => {
    b.onclick = (e) => {
      const siteId = e.target.dataset.id;
      showConfirm('Setujui Website', 'Setujui dan publikasikan landing page ini?', async () => {
        await updateDoc(doc(db, 'websites', siteId), {
          status: 'published',
          published: true,
          approved: true,
          reviewedBy: currentUser.uid,
          reviewedAt: serverTimestamp()
        });
        showToast('Landing page berhasil dipublikasikan!', 'success');
        renderAdminReviews();
      }, 'Setujui & Publish');
    };
  });

  document.querySelectorAll('.btnReject').forEach(b => {
    b.onclick = (e) => {
      const siteId = e.target.dataset.id;
      showPrompt('Penolakan Landing Page', 'Masukkan alasan penolakan website:', '', async (reason) => {
        await updateDoc(doc(db, 'websites', siteId), {
          status: 'rejected',
          published: false,
          approved: false,
          moderationNote: reason,
          reviewedBy: currentUser.uid,
          reviewedAt: serverTimestamp()
        });
        showToast('Landing page ditolak.', 'warning');
        renderAdminReviews();
      });
    };
  });
}

// 6. Public Landing Page View
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
    const targetUrl = window.location.href;

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
    const isAdminUser = currentUserProfile?.role === 'admin' || currentUser?.email === 'bandardeterjen@gmail.com';

    if (site.status !== 'published' && !isOwner && !isAdminUser) {
      root.innerHTML = `<div class="card" style="text-align:center; margin:3rem auto; max-width:500px;"><h2>Website Belum Publik</h2><p>Landing page ini sedang dalam proses moderasi atau masih berstatus draft.</p></div>`;
      return;
    }

    root.innerHTML = `
      <div class="landing-page">
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

        ${site.about?.content ? `
          <section class="lp-section">
            <h2 class="lp-section-title">${site.about.title || 'Tentang Kami'}</h2>
            <p style="text-align:center; max-width:700px; margin:1rem auto; color:#334155; font-size:1.05rem;">
              ${site.about.content}
            </p>
          </section>
        ` : ''}

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
      showReportModal(siteDoc.id, targetUrl, site.siteName || `@${username}`);
    });

  } catch (err) {
    root.innerHTML = `<div class="card">Gagal memuat: ${err.message}</div>`;
  }
}
