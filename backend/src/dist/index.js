"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const bcrypt_1 = __importDefault(require("bcrypt"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const whatsapp_web_js_1 = require("whatsapp-web.js");
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(express_1.default.json());
const JWT_SECRET = "SUPER_SECRET_123";
const USERS_FILE = path_1.default.join(__dirname, "users.json");
const SESSIONS_DIR = path_1.default.join(__dirname, "sessions");
if (!fs_1.default.existsSync(SESSIONS_DIR))
    fs_1.default.mkdirSync(SESSIONS_DIR);
if (!fs_1.default.existsSync(USERS_FILE))
    fs_1.default.writeFileSync(USERS_FILE, JSON.stringify([]));
let clients = {};
let statusMap = {};
let messagesMap = {}; // username -> contato -> mensagens
function loadUsers() {
    return JSON.parse(fs_1.default.readFileSync(USERS_FILE, "utf-8"));
}
function saveUsers(users) {
    fs_1.default.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}
// Registrar
app.post("/register", async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password)
        return res.status(400).send("Dados incompletos");
    const users = loadUsers();
    if (users.find(u => u.username === username))
        return res.status(400).send("Usuário já existe");
    const hash = await bcrypt_1.default.hash(password, 10);
    users.push({ username, password: hash });
    saveUsers(users);
    res.json({ ok: true });
});
// Login
app.post("/login", async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password)
        return res.status(400).send("Dados incompletos");
    const users = loadUsers();
    const user = users.find(u => u.username === username);
    if (!user)
        return res.status(401).send("Usuário não encontrado");
    const valid = await bcrypt_1.default.compare(password, user.password);
    if (!valid)
        return res.status(401).send("Senha incorreta");
    const token = jsonwebtoken_1.default.sign({ username }, JWT_SECRET, { expiresIn: "1d" });
    // Inicializa WhatsApp para este usuário
    if (!clients[username]) {
        const client = new whatsapp_web_js_1.Client({
            authStrategy: new whatsapp_web_js_1.LocalAuth({ clientId: username, dataPath: path_1.default.join(SESSIONS_DIR, username) })
        });
        clients[username] = client;
        statusMap[username] = "init";
        messagesMap[username] = {};
        client.on("qr", qr => {
            statusMap[username] = "qr";
            fs_1.default.writeFileSync(path_1.default.join(SESSIONS_DIR, username, "lastQR.txt"), qr);
        });
        client.on("ready", () => { statusMap[username] = "ready"; });
        client.on("disconnected", () => { statusMap[username] = "disconnected"; });
        client.on("auth_failure", () => { statusMap[username] = "error"; });
        client.on("message", (msg) => {
            const from = msg.from;
            if (!messagesMap[username][from])
                messagesMap[username][from] = [];
            messagesMap[username][from].push({ from, body: msg.body });
        });
        client.initialize();
    }
    res.json({ token });
});
// Logout
app.post("/logout", (req, res) => {
    const auth = req.headers.authorization;
    if (!auth)
        return res.status(401).send("Não autorizado");
    const token = auth.split(" ")[1];
    try {
        const data = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        delete clients[data.username];
        delete statusMap[data.username];
        delete messagesMap[data.username];
        res.json({ ok: true });
    }
    catch {
        res.status(401).send("Token inválido");
    }
});
// Middleware JWT
function authMiddleware(req, res, next) {
    const auth = req.headers.authorization;
    if (!auth)
        return res.status(401).send("Não autorizado");
    const token = auth.split(" ")[1];
    try {
        const data = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        req.user = data.username;
        next();
    }
    catch {
        res.status(401).send("Token inválido");
    }
}
// Status do usuário
app.get("/status", authMiddleware, (req, res) => {
    const username = req.user;
    res.json({ status: statusMap[username] || "init" });
});
// QR Code do usuário
app.get("/qr", authMiddleware, async (req, res) => {
    const username = req.user;
    const qrPath = path_1.default.join(SESSIONS_DIR, username, "lastQR.txt");
    if (!fs_1.default.existsSync(qrPath))
        return res.status(404).send("QR Code não disponível");
    const qr = fs_1.default.readFileSync(qrPath, "utf-8");
    const QRCode = require("qrcode");
    const img = await QRCode.toBuffer(qr, { type: "png" });
    res.writeHead(200, { "Content-Type": "image/png", "Content-Length": img.length });
    res.end(img);
});
// Enviar mensagem
app.post("/send", authMiddleware, async (req, res) => {
    const username = req.user;
    const { to, message } = req.body;
    if (!to || !message)
        return res.status(400).send("Dados incompletos");
    try {
        await clients[username].sendMessage(to, message);
        if (!messagesMap[username])
            messagesMap[username] = {};
        if (!messagesMap[username][to])
            messagesMap[username][to] = [];
        messagesMap[username][to].push({ from: "me", body: message });
        res.json({ ok: true });
    }
    catch {
        res.status(500).send("Erro ao enviar mensagem");
    }
});
// Listar contatos do usuário
app.get("/contacts", authMiddleware, (req, res) => {
    const username = req.user;
    const userMsgs = messagesMap[username] || {};
    res.json({ contacts: Object.keys(userMsgs) });
});
// Listar mensagens de um contato
app.get("/messages/:contact", authMiddleware, (req, res) => {
    const username = req.user;
    const contact = req.params.contact;
    const userMsgs = messagesMap[username] || {};
    res.json(userMsgs[contact] || []);
});
// Retorna o número do WhatsApp conectado para o usuário autenticado
app.get("/getNumber", authMiddleware, (req, res) => {
    const username = req.user;
    const client = clients[username];
    if (!client)
        return res.status(404).send("Cliente não inicializado");
    if (statusMap[username] !== "ready")
        return res.status(400).send("WhatsApp não conectado");
    try {
        const infoAny = client.info;
        const wid = infoAny && infoAny.wid && infoAny.wid.user;
        const number = wid || null;
        res.json({ number });
    }
    catch {
        res.status(500).send("Erro ao obter número");
    }
});
app.listen(3001, () => console.log("Backend rodando em http://localhost:3001"));
