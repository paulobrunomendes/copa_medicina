// ===== CONFIGURAÇÃO =====
const API_URL = window.location.origin + '/api';

// ===== API CLIENT =====
const api = {
  token: localStorage.getItem('copa_token'),

  headers() {
    const h = { 'Content-Type': 'application/json' };
    if (this.token) h['Authorization'] = `Bearer ${this.token}`;
    return h;
  },

  _check(r) {
    if (r.status === 401 || r.status === 403) {
      localStorage.removeItem('copa_token');
      localStorage.removeItem('copa_admin');
      if (!window.location.pathname.includes('login')) window.location.href = '/login.html';
    }
    return r;
  },

  async get(path) {
    const r = this._check(await fetch(API_URL + path, { headers: this.headers() }));
    if (!r.ok) throw await r.json();
    return r.json();
  },

  async post(path, data) {
    const r = this._check(await fetch(API_URL + path, { method: 'POST', headers: this.headers(), body: JSON.stringify(data) }));
    if (!r.ok) throw await r.json();
    return r.json();
  },

  async put(path, data) {
    const r = this._check(await fetch(API_URL + path, { method: 'PUT', headers: this.headers(), body: JSON.stringify(data) }));
    if (!r.ok) throw await r.json();
    return r.json();
  },

  async del(path) {
    const r = this._check(await fetch(API_URL + path, { method: 'DELETE', headers: this.headers() }));
    if (!r.ok) throw await r.json();
    return r.json();
  }
};

// ===== TOAST =====
function toast(msg, tipo = 'success') {
  const container = document.getElementById('toastContainer') || (() => {
    const el = document.createElement('div');
    el.id = 'toastContainer';
    el.className = 'toast-container';
    document.body.appendChild(el);
    return el;
  })();

  const icons = { success: '✅', error: '❌', info: 'ℹ️' };
  const el = document.createElement('div');
  el.className = `toast toast-${tipo}`;
  el.innerHTML = `<span>${icons[tipo]}</span> ${msg}`;
  container.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

// ===== LOADING STATE =====
function btnLoading(btn, loading, textoOriginal) {
  if (typeof btn === 'string') btn = document.getElementById(btn);
  if (!btn) return;
  btn.disabled = loading;
  if (loading) {
    btn._textoOriginal = btn.textContent;
    btn.textContent = textoOriginal || 'Aguarde...';
  } else {
    btn.textContent = btn._textoOriginal || textoOriginal || btn.textContent;
  }
}

// ===== MODAL =====
function abrirModal(id) {
  document.getElementById(id)?.classList.add('show');
}

function fecharModal(id) {
  document.getElementById(id)?.classList.remove('show');
}

// Fechar modal clicando fora
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal-overlay')) {
    e.target.classList.remove('show');
  }
});

// ===== UTILITÁRIOS =====
function formatarData(dt) {
  if (!dt) return '—';
  return new Date(dt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function formatarHora(dt) {
  if (!dt) return '';
  return new Date(dt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function faseLabel(fase) {
  const labels = {
    grupos: 'Fase de Grupos',
    oitavas: 'Oitavas de Final',
    quartas: 'Quartas de Final',
    semifinal: 'Semifinal',
    terceiro_lugar: '3º Lugar',
    final: 'Final'
  };
  return labels[fase] || fase;
}

function statusLabel(status) {
  const labels = { ao_vivo: 'AO VIVO', agendado: 'Agendado', encerrado: 'Encerrado' };
  return labels[status] || status;
}

function corParaInicial(cor) {
  return cor || '#1a3a6b';
}

function escudoHTML(sigla, cor) {
  return `<div class="time-escudo" style="background:${cor || '#1a3a6b'}">${sigla}</div>`;
}

// ===== PWA — PROMPT DE INSTALAÇÃO =====
(function() {
  let deferredPrompt = null;

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;

    // Só mostra se não foi dispensado antes
    if (localStorage.getItem('pwa_dismissed')) return;

    const banner = document.createElement('div');
    banner.id = 'pwa-banner';
    banner.style.cssText = `
      position:fixed;bottom:1rem;left:50%;transform:translateX(-50%);
      background:#111;color:white;border:1.5px solid rgba(245,194,0,0.5);
      border-radius:14px;padding:0.85rem 1.25rem;
      display:flex;align-items:center;gap:0.85rem;
      box-shadow:0 8px 32px rgba(0,0,0,0.5);z-index:9999;
      max-width:360px;width:calc(100% - 2rem);font-family:inherit;
      animation:slideUp 0.3s ease;
    `;
    banner.innerHTML = `
      <img src="/public/favicon-192.png" style="width:40px;height:40px;border-radius:10px;flex-shrink:0">
      <div style="flex:1;min-width:0">
        <div style="font-weight:800;font-size:0.9rem">Instalar Copa Med Horus</div>
        <div style="font-size:0.75rem;color:rgba(255,255,255,0.6);margin-top:1px">Acesso rápido na tela inicial</div>
      </div>
      <button id="pwa-install-btn" style="background:#F5C200;color:#111;border:none;border-radius:8px;padding:0.45rem 0.9rem;font-weight:800;font-size:0.8rem;cursor:pointer;white-space:nowrap">Instalar</button>
      <button id="pwa-dismiss-btn" style="background:none;border:none;color:rgba(255,255,255,0.4);font-size:1.2rem;cursor:pointer;padding:0;line-height:1">×</button>
    `;

    if (!document.getElementById('pwa-slide-style')) {
      const s = document.createElement('style');
      s.id = 'pwa-slide-style';
      s.textContent = '@keyframes slideUp{from{transform:translateX(-50%) translateY(100px);opacity:0}to{transform:translateX(-50%) translateY(0);opacity:1}}';
      document.head.appendChild(s);
    }

    document.body.appendChild(banner);

    document.getElementById('pwa-install-btn').onclick = async () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      deferredPrompt = null;
      banner.remove();
      if (outcome === 'accepted') localStorage.setItem('pwa_dismissed', '1');
    };

    document.getElementById('pwa-dismiss-btn').onclick = () => {
      banner.remove();
      localStorage.setItem('pwa_dismissed', '1');
    };
  });

  window.addEventListener('appinstalled', () => {
    localStorage.setItem('pwa_dismissed', '1');
    document.getElementById('pwa-banner')?.remove();
  });
})();
