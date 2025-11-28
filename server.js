const express = require('express');
const cors = require('cors');
const fs = require('fs');
const multer = require('multer');
const path = require('path');

const app = express();
const PORT = 3000;

// --- CONFIGURAÇÃO INTELIGENTE ---
// Isto faz o servidor mostrar o teu site diretamente!
// Não precisas mais do Live Server.
app.use(express.static(__dirname)); 
app.use(cors());
app.use(express.json());

// --- ARQUIVOS DE DADOS ---
const DB = {
    users: 'usuarios.json', feed: 'dados.json', carros: 'carros.json',
    sprints: 'sprints.json', comunidades: 'comunidades.json', forum: 'forum.json',
    chats: 'chats.json', notificacoes: 'notificacoes.json', stories: 'stories.json'
};

// --- UPLOAD ---
const storage = multer.diskStorage({
    destination: (req, file, cb) => { if (!fs.existsSync('uploads')) fs.mkdirSync('uploads'); cb(null, 'uploads/') },
    filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });

function ler(arquivo) { 
    if (!fs.existsSync(arquivo)) fs.writeFileSync(arquivo, '[]'); 
    try { return JSON.parse(fs.readFileSync(arquivo)); } catch { return []; } 
}
function salvar(arquivo, dados) { fs.writeFileSync(arquivo, JSON.stringify(dados, null, 2)); }
function notificar(tipo, de, para, texto, img) {
    if (de.email === para) return;
    const n = ler(DB.notificacoes);
    n.push({ id: Date.now(), tipo, de: de.nome, avatar: de.avatar, para, texto, imgPreview: img, lida: false, timestamp: Date.now() });
    salvar(DB.notificacoes, n);
}
function ganharXP(email, qtd) {
    const us = ler(DB.users); const i = us.findIndex(u => u.email === email);
    if (i !== -1) { us[i].xp = (us[i].xp || 0) + qtd; salvar(DB.users, us); }
}

// ================= ROTAS =================

// Feed
app.get('/posts', (req, res) => res.json(ler(DB.feed)));
app.post('/posts', upload.single('midia'), (req, res) => {
    const d = ler(DB.feed);
    const url = req.file ? `http://localhost:${PORT}/uploads/${req.file.filename}` : null;
    const tipo = (req.file && req.file.mimetype.startsWith('video')) ? 'video' : 'imagem';
    d.push({ id: Date.now(), ...req.body, midiaUrl: url, tipo, likes: 0, comentarios: [] });
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
        if (!p.comentarios) p.comentarios = []; p.comentarios.push({ id: Date.now(), ...req.body }); salvar(DB.feed, d);
        if (p.emailAutor) notificar('comentario', { nome: req.body.autor, email: '?', avatar: req.body.avatar }, p.emailAutor, 'comentou.', p.midiaUrl);
        res.json(p.comentarios);
    } else res.status(404).send('Erro');
});

// Stories
app.get('/stories', (req, res) => {
    const todos = ler(DB.stories);
    const validos = todos.filter(s => (Date.now() - s.timestamp) < 86400000);
    res.json(validos);
});
app.post('/stories', upload.single('midia'), (req, res) => {
    const dados = ler(DB.stories);
    if (!req.file) return res.status(400).send('Sem arquivo');
    const isVideo = req.file.mimetype.startsWith('video');
    dados.push({ id: Date.now(), ...req.body, midiaUrl: `http://localhost:${PORT}/uploads/${req.file.filename}`, tipo: isVideo ? 'video' : 'imagem', timestamp: Date.now() });
    salvar(DB.stories, dados); res.status(201).send('Ok');
});

// Outras Rotas Essenciais
app.post('/registro', (req, res) => { const us = ler(DB.users); if (us.find(u => u.email === req.body.email)) return res.status(400).send('Existe'); const novo = { id: Date.now(), ...req.body, avatar: `https://ui-avatars.com/api/?name=${req.body.nome}&background=ef4444&color=fff`, capa: "https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?q=80&w=1000", bio: "Novo piloto", xp: 0, nivel: 1, seguindo: [], seguidores: [] }; us.push(novo); salvar(DB.users, us); res.status(201).json(novo); });
app.post('/login', (req, res) => { const u = ler(DB.users).find(u => u.email === req.body.email && u.senha === req.body.senha); u ? res.json(u) : res.status(401).send('Erro'); });
app.get('/perfil/dados', (req, res) => { const u = ler(DB.users).find(x => x.email === req.query.email); u ? res.json(u) : res.status(404).json({}); });
app.post('/perfil/atualizar', upload.fields([{name:'avatar'},{name:'capa'}]), (req, res) => { const us = ler(DB.users); const i = us.findIndex(u => u.email === req.body.emailOriginal); if(i!==-1){ us[i].nome=req.body.nome; us[i].bio=req.body.bio; if(req.files['avatar']) us[i].avatar=`http://localhost:${PORT}/uploads/${req.files['avatar'][0].filename}`; if(req.files['capa']) us[i].capa=`http://localhost:${PORT}/uploads/${req.files['capa'][0].filename}`; salvar(DB.users, us); res.json(us[i]); } else res.status(404).send('Erro'); });
app.get('/carros', (req, res) => res.json(ler(DB.carros)));
app.post('/carros', upload.single('imagem'), (req, res) => { const d = ler(DB.carros); const url = req.file ? `http://localhost:${PORT}/uploads/${req.file.filename}` : 'https://via.placeholder.com/600'; const user = ler(DB.users).find(u => u.nome === req.body.dono); if(user) ganharXP(user.email, 100); d.push({id:Date.now(), ...req.body, mods:req.body.mods?req.body.mods.split(','):[], imagemUrl:url, specs:{hp:req.body.hp, torque:req.body.torque, zero_cem:req.body.zero_cem, top_speed:req.body.top_speed, cor:req.body.cor, ano:req.body.ano}}); salvar(DB.carros, d); res.status(201).send('Ok'); });
app.delete('/carros/:id', (req, res) => { const d = ler(DB.carros); const n = d.filter(c => c.id !== parseInt(req.params.id)); salvar(DB.carros, n); res.status(200).send('Del'); });
app.get('/usuarios', (req, res) => res.json(ler(DB.users).map(u=>({nome:u.nome, email:u.email, avatar:u.avatar}))));
app.post('/seguir', (req, res) => { const { eu, ele } = req.body; const us = ler(DB.users); const idxEu = us.findIndex(u=>u.email===eu); const idxEle = us.findIndex(u=>u.email===ele); if (idxEu===-1 || idxEle===-1) return res.status(404).send('Erro'); if(!us[idxEu].seguindo) us[idxEu].seguindo=[]; if(!us[idxEle].seguidores) us[idxEle].seguidores=[]; if(us[idxEu].seguindo.includes(ele)) { us[idxEu].seguindo = us[idxEu].seguindo.filter(e=>e!==ele); us[idxEle].seguidores = us[idxEle].seguidores.filter(e=>e!==eu); salvar(DB.users, us); res.json({aSeguir: false}); } else { us[idxEu].seguindo.push(ele); us[idxEle].seguidores.push(eu); notificar('follow', { nome: us[idxEu].nome, email: eu, avatar: us[idxEu].avatar }, ele, 'seguiu-te.'); salvar(DB.users, us); res.json({aSeguir: true}); } });
app.get('/notificacoes', (req, res) => res.json(ler(DB.notificacoes).filter(n => n.para === req.query.user)));
app.get('/pesquisa', (req, res) => { const t = req.query.q ? req.query.q.toLowerCase() : ''; res.json({ usuarios: ler(DB.users).filter(u => u.nome.toLowerCase().includes(t)), carros: ler(DB.carros).filter(c => c.modelo.toLowerCase().includes(t) || c.apelido.toLowerCase().includes(t)) }); });
app.get('/mensagens', (req, res) => { const { eu, ele } = req.query; res.json(ler(DB.chats).filter(m => (m.de === eu && m.para === ele) || (m.de === ele && m.para === eu)).sort((a, b) => a.timestamp - b.timestamp)); });
app.post('/mensagens', (req, res) => { const m = ler(DB.chats); m.push({ id: Date.now(), ...req.body, timestamp: Date.now() }); salvar(DB.chats, m); res.status(201).send('Ok'); });
app.get('/sprints', (req, res) => res.json(ler(DB.sprints)));
app.post('/sprints', upload.single('video'), (req, res) => { const d = ler(DB.sprints); if (!req.file) return res.status(400).send('Sem vídeo'); const user = ler(DB.users).find(u => u.nome === req.body.autor); if(user) ganharXP(user.email, 40); d.push({ id: Date.now(), ...req.body, videoUrl: `http://localhost:${PORT}/uploads/${req.file.filename}`, likes: 0 }); salvar(DB.sprints, d); res.status(201).send('Ok'); });
app.post('/sprints/like/:id', (req, res) => { const d = ler(DB.sprints); const s = d.find(x => x.id === parseInt(req.params.id)); if(s) { s.likes++; salvar(DB.sprints, d); res.status(200).send('Ok'); } });
app.get('/comunidades', (req, res) => res.json(ler(DB.comunidades)));

app.listen(PORT, () => console.log(`🔥 Servidor Web Ativo em: http://localhost:${PORT}/feed.html`));