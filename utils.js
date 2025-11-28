// utils.js
// Se o site estiver online, usa o endereço relativo. Se for local, usa o localhost.
const URL_SERVIDOR = window.location.hostname.includes('localhost') 
    ? 'http://localhost:3000' 
    : '';
function showToast(msg, tipo='success') {
    let c = document.getElementById('toast-container');
    if(!c){ c=document.createElement('div'); c.id='toast-container'; document.body.appendChild(c); }
    const t = document.createElement('div');
    const ic = tipo==='success'?'check_circle':'error'; const cl = tipo==='success'?'text-green-500':'text-red-500';
    t.className = `toast toast-${tipo}`; t.innerHTML = `<span class="material-symbols-outlined ${cl}">${ic}</span><span class="text-sm font-bold">${msg}</span>`;
    c.appendChild(t); setTimeout(()=>t.remove(),3000);
}
function setBtnLoading(id, load) { const b=document.getElementById(id); if(b) load?b.classList.add('btn-loading'):b.classList.remove('btn-loading'); }
function verificarLogin() {
    const d = localStorage.getItem('usuario_logado');
    if (!d && !window.location.href.includes('login') && !window.location.href.includes('registro')) window.location.href='login.html';
    return JSON.parse(d || '{}');
}
function logout() { localStorage.removeItem('usuario_logado'); window.location.href='login.html'; }
const tema = localStorage.getItem('midnight_tema') || 'theme-red'; document.body.classList.add(tema);