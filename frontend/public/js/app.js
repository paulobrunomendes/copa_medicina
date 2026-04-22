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
