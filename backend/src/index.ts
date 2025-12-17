import express from "express"
import cors from "cors"
import bcrypt from "bcrypt"
import jwt from "jsonwebtoken"
import fs from "fs"
import path from "path"
import { Client, LocalAuth, Message } from "whatsapp-web.js"

const app = express()
app.use(cors())
app.use(express.json())

const JWT_SECRET = "SUPER_SECRET_123"
const USERS_FILE = path.join(__dirname, "users.json")
const SESSIONS_DIR = path.join(__dirname, "sessions")

if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR)
if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, JSON.stringify([]))

interface User { username: string; password: string }
interface ChatMessage { from: string; body: string }

let clients: Record<string, Client> = {}
let statusMap: Record<string, "init"|"qr"|"ready"|"disconnected"|"error"> = {}
let messagesMap: Record<string, Record<string, ChatMessage[]>> = {} // username -> contato -> mensagens

function loadUsers(): User[] {
  return JSON.parse(fs.readFileSync(USERS_FILE, "utf-8"))
}
function saveUsers(users: User[]) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2))
}

// Registrar
app.post("/register", async (req,res)=>{
  const { username, password } = req.body
  if (!username||!password) return res.status(400).send("Dados incompletos")
  const users = loadUsers()
  if (users.find(u=>u.username===username)) return res.status(400).send("Usuário já existe")
  const hash = await bcrypt.hash(password,10)
  users.push({username,password:hash})
  saveUsers(users)
  res.json({ok:true})
})

// Login
app.post("/login", async (req,res)=>{
  const { username,password } = req.body
  if (!username||!password) return res.status(400).send("Dados incompletos")
  const users = loadUsers()
  const user = users.find(u=>u.username===username)
  if (!user) return res.status(401).send("Usuário não encontrado")
  const valid = await bcrypt.compare(password,user.password)
  if (!valid) return res.status(401).send("Senha incorreta")

  const token = jwt.sign({ username },JWT_SECRET,{ expiresIn:"1d" })

  // Inicializa WhatsApp para este usuário
  if (!clients[username]){
    const client = new Client({
      authStrategy: new LocalAuth({ clientId: username, dataPath: path.join(SESSIONS_DIR, username) })
    })
    clients[username] = client
    statusMap[username] = "init"
    messagesMap[username] = {}

    client.on("qr", qr=>{
      statusMap[username] = "qr"
      fs.writeFileSync(path.join(SESSIONS_DIR, username,"lastQR.txt"),qr)
    })

    client.on("ready", ()=>{ statusMap[username] = "ready" })
    client.on("disconnected", ()=>{ statusMap[username] = "disconnected" })
    client.on("auth_failure", ()=>{ statusMap[username] = "error" })

    client.on("message", (msg:Message)=>{
      const from = msg.from
      if (!messagesMap[username][from]) messagesMap[username][from] = []
      messagesMap[username][from].push({ from, body: msg.body })
    })

    client.initialize()
  }

  res.json({ token })
})

// Logout
app.post("/logout", (req,res)=>{
  const auth = req.headers.authorization
  if (!auth) return res.status(401).send("Não autorizado")
  const token = auth.split(" ")[1]
  try{
    const data:any = jwt.verify(token,JWT_SECRET)
    delete clients[data.username]
    delete statusMap[data.username]
    delete messagesMap[data.username]
    res.json({ok:true})
  } catch {
    res.status(401).send("Token inválido")
  }
})


// Middleware JWT
function authMiddleware(req:any,res:any,next:any){
  const auth = req.headers.authorization
  if (!auth) return res.status(401).send("Não autorizado")
  const token = auth.split(" ")[1]
  try{
    const data:any = jwt.verify(token,JWT_SECRET)
    req.user = data.username
    next()
  } catch {
    res.status(401).send("Token inválido")
  }
}

// Status do usuário
app.get("/status", authMiddleware, (req:any,res)=>{
  const username = req.user
  res.json({ status: statusMap[username]||"init" })
})

// QR Code do usuário
app.get("/qr", authMiddleware, async (req:any,res)=>{
  const username = req.user
  const qrPath = path.join(SESSIONS_DIR,username,"lastQR.txt")
  if (!fs.existsSync(qrPath)) return res.status(404).send("QR Code não disponível")
  const qr = fs.readFileSync(qrPath,"utf-8")
  const QRCode = require("qrcode")
  const img = await QRCode.toBuffer(qr,{ type:"png" })
  res.writeHead(200,{"Content-Type":"image/png","Content-Length":img.length})
  res.end(img)
})

// Enviar mensagem
app.post("/send", authMiddleware, async (req:any,res)=>{
  const username = req.user
  const { to,message } = req.body
  if (!to || !message) return res.status(400).send("Dados incompletos")
  try{
    await clients[username].sendMessage(to,message)
    if (!messagesMap[username]) messagesMap[username] = {}
    if (!messagesMap[username][to]) messagesMap[username][to] = []
    messagesMap[username][to].push({ from:"me", body: message })
    res.json({ ok:true })
  } catch {
    res.status(500).send("Erro ao enviar mensagem")
  }
})

// Listar contatos do usuário
app.get("/contacts", authMiddleware, (req:any,res)=>{
  const username = req.user
  const userMsgs = messagesMap[username] || {}
  res.json({ contacts: Object.keys(userMsgs) })
})

// Listar mensagens de um contato
app.get("/messages/:contact", authMiddleware, (req:any,res)=>{
  const username = req.user
  const contact = req.params.contact
  const userMsgs = messagesMap[username] || {}
  res.json(userMsgs[contact] || [])
})

// Retorna o número do WhatsApp conectado para o usuário autenticado
app.get("/getNumber", authMiddleware, (req:any,res)=>{
  const username = req.user
  const client = clients[username]
  if (!client) return res.status(404).send("Cliente não inicializado")
  if (statusMap[username] !== "ready") return res.status(400).send("WhatsApp não conectado")
  try{
    const infoAny = client.info as any
    const wid = infoAny && infoAny.wid && infoAny.wid.user
    const number = wid || null
    res.json({ number })
  } catch {
    res.status(500).send("Erro ao obter número")
  }
})

app.listen(3001, ()=>console.log("Backend rodando em http://localhost:3001"))
