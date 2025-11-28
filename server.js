const express = require('express');
const cors = require('cors');
const fs = require('fs');
const multer = require('multer');
const path = require('path');
const bcrypt = require('bcryptjs');

const app = express();
// server.js
const PORT = process.env.PORT || 3000; // Usa a porta da nuvem OU a 3000 se for local

// --- ARQUIVOS DE DADOS ---
const DB = {
    users: 'usuarios.json',
    feed: 'dados.json',
    carros: 'carros.json',
    sprints: 'sprints.json',
    comunidades: 'comunidades.json',
    forum: 'forum.json',
    chats: 'chats.json',
    notificacoes: 'notificacoes.json',
    stories: 'stories.json'
};

// --- CONFIGURAÇÃO UPLOAD ---
if (!fs.existsSync('uploads')) fs.mkdirSync('uploads');
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage, limits: { fileSize: 100 * 1024 * 1024 } });

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static('uploads'));

// --- FUNÇÕES AUXILIARES ---
function ler(arquivo) {
    if (!fs.existsSync(arquivo)) fs.writeFileSync(arquivo, '[]');
    try { return JSON.parse(fs.readFileSync(arquivo)); } catch { return []; }
}
function salvar(arquivo, dados) {
    fs.writeFileSync(arquivo, JSON.stringify(dados, null, 2));
}
function ganharXP(email, qtd) {
    const us = ler(DB.users);
    const i = us.findIndex(u => u.email === email);
    if (i !== -1) {
        us[i].xp = (us[i].xp || 0) + qtd;
        const novoNivel = Math.floor(us[i].xp / 1000) + 1;
        if (novoNivel > (us[i].nivel || 1)) us[i].nivel = novoNivel;
        salvar(DB.users, us);
    }
}
function notificar(tipo, de, para, texto, img = null) {
    if (de.email === para) return;
    const n = ler(DB.notificacoes);
    n.push({ id: Date.now(), tipo, de: de.nome, avatar: de.avatar, para, texto, imgPreview: img, lida: false, timestamp: Date.now() });
    salvar(DB.notificacoes, n);
}

// ================= ROTAS =================

// 1. AUTENTICAÇÃO
app.post('/registro', async (req, res) => {
    const us = ler(DB.users);
    if (us.find(u => u.email === req.body.email)) return res.status(400).send('Email já existe');
    const senhaHash = await bcrypt.hash(req.body.senha, 10);
    const novo = { id: Date.now(), ...req.body, senha: senhaHash, avatar: `https://ui-avatars.com/api/?name=${req.body.nome}&background=ef4444&color=fff`, capa: "https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?q=80&w=1000", bio: "Novo piloto", xp: 0, nivel: 1, seguindo: [], seguidores: [] };
    us.push(novo); salvar(DB.users, us); res.status(201).json(novo);
});
app.post('/login', async (req, res) => {
    const u = ler(DB.users).find(u => u.email === req.body.email);
    if (!u || !(await bcrypt.compare(req.body.senha, u.senha))) return res.status(401).send('Erro');
    res.json(u);
});

// 2. PERFIL & CONFIGURAÇÕES
app.get('/perfil/dados', (req, res) => {
    const u = ler(DB.users).find(x => x.email === req.query.email);
    u ? res.json(u) : res.status(404).json({});
});
app.post('/perfil/atualizar', upload.fields([{ name: 'avatar' }, { name: 'capa' }]), (req, res) => {
    const us = ler(DB.users); const i = us.findIndex(u => u.email === req.body.emailOriginal);
    if (i !== -1) {
        us[i].nome = req.body.nome; us[i].bio = req.body.bio;
        if (req.files['avatar']) us[i].avatar = `http://localhost:${PORT}/uploads/${req.files['avatar'][0].filename}`;
        if (req.files['capa']) us[i].capa = `http://localhost:${PORT}/uploads/${req.files['capa'][0].filename}`;
        salvar(DB.users, us); res.json(us[i]);
    } else res.status(404).send('Erro');
});
app.post('/perfil/senha', async (req, res) => {
    const { email, senhaAntiga, senhaNova } = req.body;
    const us = ler(DB.users); const i = us.findIndex(u => u.email === email);
    if (i === -1) return res.status(404).send('Erro');
    if (!(await bcrypt.compare(senhaAntiga, us[i].senha))) return res.status(401).send('Senha antiga errada');
    us[i].senha = await bcrypt.hash(senhaNova, 10); salvar(DB.users, us); res.send('Ok');
});
app.post('/perfil/email', (req, res) => {
    const { emailAtual, novoEmail } = req.body;
    const us = ler(DB.users);
    if (us.find(u => u.email === novoEmail)) return res.status(400).send('Email em uso');
    const i = us.findIndex(u => u.email === emailAtual);
    if (i !== -1) { us[i].email = novoEmail; salvar(DB.users, us); res.json(us[i]); } else res.status(404).send('Erro');
});
app.delete('/perfil/deletar', (req, res) => {
    const { email } = req.body;
    const us = ler(DB.users); const n = us.filter(u => u.email !== email);
    if (us.length === n.length) return res.status(404).send('Erro');
    salvar(DB.users, n); res.send('Apagada');
});

// 3. FEED & POSTS
app.get('/posts', (req, res) => res.json(ler(DB.feed)));
app.post('/posts', upload.single('midia'), (req, res) => {
    const d = ler(DB.feed);
    const url = req.file ? `http://localhost:${PORT}/uploads/${req.file.filename}` : null;
    const t = (req.file && req.file.mimetype.startsWith('video')) ? 'video' : 'imagem';
    d.push({ id: Date.now(), ...req.body, midiaUrl: url, tipo: t, likes: 0, comentarios: [] });
    salvar(DB.feed, d); ganharXP(req.body.emailAutor, 50); res.status(201).send('Ok');
});
app.post('/posts/like/:id', (req, res) => {
    const { quemDeuLikeEmail, quemDeuLikeNome, quemDeuLikeAvatar } = req.body;
    const d = ler(DB.feed); const p = d.find(x => x.id === parseInt(req.params.id));
    if (p) {
        p.likes++; salvar(DB.feed, d);
        if (p.emailAutor) notificar('like', { nome: quemDeuLikeNome, email: quemDeuLikeEmail, avatar: quemDeuLikeAvatar }, p.emailAutor, 'curtiu.', p.midiaUrl);
        res.status(200).send('Ok');
    } else res.status(404).send('Erro');
});
app.post('/posts/comentar/:id', (req, res) => {
    const d = ler(DB.feed); const p = d.find(x => x.id === parseInt(req.params.id));
    if (p) {
        if (!p.comentarios) p.comentarios = [];
        p.comentarios.push({ id: Date.now(), ...req.body });
        salvar(DB.feed, d);
        if (p.emailAutor) notificar('comentario', { nome: req.body.autor, email: '?', avatar: req.body.avatar }, p.emailAutor, 'comentou.', p.midiaUrl);
        res.json(p.comentarios);
    } else res.status(404).send('Erro');
});
app.delete('/posts/:id', (req, res) => {
    const id = parseInt(req.params.id); const d = ler(DB.feed); const n = d.filter(x => x.id !== id);
    salvar(DB.feed, n); res.status(200).send('Del');
});

// 4. STORIES
app.get('/stories', (req, res) => {
    const t = ler(DB.stories); res.json(t.filter(s => (Date.now() - s.timestamp) < 86400000));
});
app.post('/stories', upload.single('midia'), (req, res) => {
    const d = ler(DB.stories); if (!req.file) return res.status(400).send('Sem arquivo');
    const v = req.file.mimetype.startsWith('video');
    d.push({ id: Date.now(), ...req.body, midiaUrl: `http://localhost:${PORT}/uploads/${req.file.filename}`, tipo: v ? 'video' : 'imagem', timestamp: Date.now() });
    salvar(DB.stories, d); res.status(201).send('Ok');
});

// 5. CARROS
app.get('/carros', (req, res) => res.json(ler(DB.carros)));
app.post('/carros', upload.single('imagem'), (req, res) => {
    const d = ler(DB.carros);
    const u = req.file ? `http://localhost:${PORT}/uploads/${req.file.filename}` : 'https://via.placeholder.com/600';
    const usr = ler(DB.users).find(u => u.nome === req.body.dono); if (usr) ganharXP(usr.email, 100);
    d.push({ id: Date.now(), ...req.body, mods: req.body.mods ? req.body.mods.split(',') : [], imagemUrl: u, specs: { hp: req.body.potencia, torque: req.body.torque, zero_cem: req.body.zero_cem, top_speed: req.body.top_speed, cor: req.body.cor, ano: req.body.ano, motor: req.body.motor, cambio: req.body.cambio, tracao: req.body.tracao, peso: req.body.peso } });
    salvar(DB.carros, d); res.status(201).send('Ok');
});
app.delete('/carros/:id', (req, res) => {
    const d = ler(DB.carros); const n = d.filter(c => c.id !== parseInt(req.params.id));
    salvar(DB.carros, n); res.status(200).send('Del');
});

// 6. SPRINTS
app.get('/sprints', (req, res) => res.json(ler(DB.sprints)));
app.post('/sprints', upload.single('video'), (req, res) => {
    const d = ler(DB.sprints); if (!req.file) return res.status(400).send('Sem vídeo');
    const user = ler(DB.users).find(u => u.nome === req.body.autor); if (user) ganharXP(user.email, 40);
    d.push({ id: Date.now(), ...req.body, videoUrl: `http://localhost:${PORT}/uploads/${req.file.filename}`, likes: 0, comentarios: [] });
    salvar(DB.sprints, d); res.status(201).send('Ok');
});
app.post('/sprints/like/:id', (req, res) => {
    const d = ler(DB.sprints); const s = d.find(x => x.id === parseInt(req.params.id));
    if (s) { s.likes++; salvar(DB.sprints, d); res.status(200).send('Ok'); }
});
app.post('/sprints/comentar/:id', (req, res) => {
    const d = ler(DB.sprints); const s = d.find(x => x.id === parseInt(req.params.id));
    if (s) { if (!s.comentarios) s.comentarios = []; s.comentarios.push({ id: Date.now(), ...req.body }); salvar(DB.sprints, d); res.json(s.comentarios); }
});

// 7. COMUNIDADES
app.get('/comunidades', (req, res) => res.json(ler(DB.comunidades)));
app.post('/comunidades', upload.single('imagem'), (req, res) => {
    const d = ler(DB.comunidades);
    const u = req.file ? `http://localhost:${PORT}/uploads/${req.file.filename}` : 'https://via.placeholder.com/800x200';
    d.push({ id: Date.now(), nome: req.body.nome, descricao: req.body.descricao, dono: req.body.donoEmail, imagem: u, membros: [req.body.donoEmail], admins: [], online: 1 });
    salvar(DB.comunidades, d); ganharXP(req.body.donoEmail, 150); res.status(201).send('Ok');
});
app.post('/comunidades/entrar', (req, res) => {
    const { idComunidade, emailUsuario } = req.body; const d = ler(DB.comunidades); const i = d.findIndex(c => c.id == idComunidade);
    if (i !== -1) { if (!d[i].membros) d[i].membros = []; if (!d[i].membros.includes(emailUsuario)) { d[i].membros.push(emailUsuario); salvar(DB.comunidades, d); res.status(200).send('Ok'); } else res.status(400).send('Já membro'); } else res.status(404).send('Erro');
});
app.post('/comunidades/sair', (req, res) => {
    const { idComunidade, emailUsuario } = req.body; const d = ler(DB.comunidades); const i = d.findIndex(c => c.id == idComunidade);
    if (i !== -1) { if (d[i].membros) d[i].membros = d[i].membros.filter(m => m !== emailUsuario); if (d[i].admins) d[i].admins = d[i].admins.filter(m => m !== emailUsuario); salvar(DB.comunidades, d); res.status(200).send('Ok'); } else res.status(404).send('Erro');
});
app.post('/comunidades/promover', (req, res) => {
    const { idComunidade, emailAlvo } = req.body; const d = ler(DB.comunidades); const i = d.findIndex(c => c.id == idComunidade);
    if (i !== -1) { if (!d[i].admins) d[i].admins = []; if (!d[i].admins.includes(emailAlvo)) { d[i].admins.push(emailAlvo); salvar(DB.comunidades, d); res.status(200).send('Ok'); } } else res.status(404).send('Erro');
});
app.post('/comunidades/expulsar', (req, res) => {
    const { idComunidade, emailAlvo } = req.body; const d = ler(DB.comunidades); const i = d.findIndex(c => c.id == idComunidade);
    if (i !== -1) { if (d[i].membros) d[i].membros = d[i].membros.filter(m => m !== emailAlvo); if (d[i].admins) d[i].admins = d[i].admins.filter(m => m !== emailAlvo); salvar(DB.comunidades, d); res.status(200).send('Ok'); } else res.status(404).send('Erro');
});

// 8. FÓRUM
app.get('/topicos/:id', (req, res) => res.json(ler(DB.forum).filter(t => t.comunidadeId == req.params.id)));
app.post('/topicos', upload.single('imagem'), (req, res) => {
    const dados = ler(DB.forum); const url = req.file ? `http://localhost:${PORT}/uploads/${req.file.filename}` : null;
    dados.push({ id: Date.now(), ...req.body, imagemUrl: url, likes: 0, comentarios: 0 });
    salvar(DB.forum, dados); ganharXP(req.body.emailAutor, 30); res.status(201).send('Ok');
});
app.post('/topicos/like/:id', (req, res) => { const d = ler(DB.forum); const t = d.find(x => x.id === parseInt(req.params.id)); if (t) { t.likes++; salvar(DB.forum, d); res.status(200).send('Ok'); } });
app.delete('/topicos/:id', (req, res) => { const d = ler(DB.forum); const n = d.filter(t => t.id !== parseInt(req.params.id)); salvar(DB.forum, n); res.status(200).send('Del'); });

// 9. OUTROS (Pesquisa, Seguir, Chat, Notificações)
app.get('/usuarios', (req, res) => res.json(ler(DB.users).map(u => ({ nome: u.nome, email: u.email, avatar: u.avatar, nivel: u.nivel, seguidores: u.seguidores || [] }))));
app.get('/pesquisa', (req, res) => {
    const t = req.query.q ? req.query.q.toLowerCase() : '';
    res.json({ usuarios: ler(DB.users).filter(u => u.nome.toLowerCase().includes(t)), carros: ler(DB.carros).filter(c => c.modelo.toLowerCase().includes(t) || c.apelido.toLowerCase().includes(t)) });
});
app.post('/seguir', (req, res) => {
    const { eu, ele } = req.body; const us = ler(DB.users); const i1 = us.findIndex(u => u.email === eu); const i2 = us.findIndex(u => u.email === ele);
    if (i1 !== -1 && i2 !== -1) {
        if (!us[i1].seguindo) us[i1].seguindo = []; if (!us[i2].seguidores) us[i2].seguidores = [];
        if (us[i1].seguindo.includes(ele)) {
            us[i1].seguindo = us[i1].seguindo.filter(e => e !== ele); us[i2].seguidores = us[i2].seguidores.filter(e => e !== eu); salvar(DB.users, us); res.json({ aSeguir: false });
        } else {
            us[i1].seguindo.push(ele); us[i2].seguidores.push(eu); notificar('follow', { nome: us[i1].nome, email: eu, avatar: us[i1].avatar }, ele, 'seguiu-te.'); salvar(DB.users, us); res.json({ aSeguir: true });
        }
    }
});
app.get('/notificacoes', (req, res) => res.json(ler(DB.notificacoes).filter(n => n.para === req.query.user)));
app.post('/notificacoes/ler', (req, res) => { const t = ler(DB.notificacoes); t.forEach(n => { if (n.para === req.body.user) n.lida = true; }); salvar(DB.notificacoes, t); res.send('Ok'); });
app.get('/mensagens', (req, res) => { const { eu, ele } = req.query; res.json(ler(DB.chats).filter(m => (m.de === eu && m.para === ele) || (m.de === ele && m.para === eu)).sort((a, b) => a.timestamp - b.timestamp)); });
app.post('/mensagens', (req, res) => { const m = ler(DB.chats); m.push({ id: Date.now(), ...req.body, timestamp: Date.now() }); salvar(DB.chats, m); res.status(201).send('Ok'); });
app.get('/ranking', (req, res) => res.json(ler(DB.users).sort((a, b) => (b.xp || 0) - (a.xp || 0)).slice(0, 50).map(u => ({ nome: u.nome, avatar: u.avatar, nivel: u.nivel || 1, xp: u.xp || 0, email: u.email }))));

app.listen(PORT, () => console.log(`🔥 Midnight Server ATIVO: http://localhost:${PORT}/feed.html`));