import React, { useEffect, useState } from "react"

type status = "init"|"qr"|"ready"|"disconnected"|"error"
type Tab = "chat"|"connect"|"settings"|"admin"|"chatbot"

interface Notification { id:number; text:string }

export default function App(){
  const [token,setToken] = useState(localStorage.getItem("token")||"")
  const [username,setUsername] = useState("")
  const [password,setPassword] = useState("")
  const [status,setStatus] = useState<status>("init")
  const [contacts,setContacts] = useState<string[]>([])
  const [activeContact,setActiveContact] = useState<string>("")
  const [messages,setMessages] = useState<any[]>([])
  const [message,setMessage] = useState("")
  const [qrCode,setQrCode] = useState("")
  const [tab,setTab] = useState<Tab>("chat")
  const [darkMode,setDarkMode] = useState(true)
  const [notifications,setNotifications] = useState<Notification[]>([])
  const [siteTitle,setSiteTitle] = useState("WhatClient")
  const [notifyNewMsg,setNotifyNewMsg] = useState(true)
  const [adminMode,setAdminMode] = useState(false)

  const API = "http://localhost:3001"

  const addNotification = (text:string)=>{
    const id = Date.now()
    setNotifications(prev=>[...prev,{id,text}])
    setTimeout(()=>setNotifications(prev=>prev.filter(n=>n.id!==id)),4000)
  }

  useEffect(()=>{ document.title = siteTitle },[siteTitle])

  useEffect(()=>{
    if (!messages.length) return
    const last = messages[messages.length-1]
    if (last.from !== "me" && notifyNewMsg) addNotification(`Nova mensagem de ${last.from}`)
  },[messages,notifyNewMsg])

  useEffect(()=>{
    if (!token) return
    const interval = setInterval(async ()=>{
      try{
        const res = await fetch(`${API}/status`,{ headers:{ Authorization:`Bearer ${token}` }})
        const data = await res.json()
        setStatus(data.status)
        const contactsRes = await fetch(`${API}/contacts`,{ headers:{ Authorization:`Bearer ${token}` }})
        const contactsData = await contactsRes.json()
        setContacts(contactsData.contacts)
      }catch{ setStatus("error") }
    },1000)
    return ()=>clearInterval(interval)
  },[token])
  
  useEffect(()=>{
    if (!token||!activeContact) return
    const interval = setInterval(async ()=>{
      const res = await fetch(`${API}/messages/${activeContact}`,{ headers:{ Authorization:`Bearer ${token}` }})
      const data = await res.json()
      setMessages(data)
    },1000)
    return ()=>clearInterval(interval)
  },[token,activeContact])

  useEffect(()=>{
    if (status !== "qr") { setQrCode(""); return }
    let canceled = false
    const fetchQr = async ()=>{
      try{
        const res = await fetch(`${API}/qr`,{ headers:{ Authorization:`Bearer ${token}` }})
        if (res.ok && !canceled){
          const blob = await res.blob()
          const url = URL.createObjectURL(blob)
          setQrCode(url)
        }
      }catch{}
    }
    fetchQr()
    return ()=>{ canceled = true }
  },[status,token])

  const register = async ()=>{
    await fetch(`${API}/register`, { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({username,password})})
    addNotification("Registrado com sucesso!")
  }

  const login = async ()=>{
    const res = await fetch(`${API}/login`, { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({username,password})})
    if (!res.ok) return addNotification("Falha no login")
    const data = await res.json()
    setToken(data.token)
    localStorage.setItem("token",data.token)
    addNotification("Login realizado!")
  }

  const logout = async ()=>{
    await fetch(`${API}/logout`,{ method:"POST", headers:{ Authorization:`Bearer ${token}` } })
    localStorage.removeItem("token")
    setToken("")
    setUsername("")
    setPassword("")
    setAdminMode(false)
  }

  const send = async ()=>{
    if (!activeContact||!message) return
    await fetch(`${API}/send`, { method:"POST", headers:{"Content-Type":"application/json", Authorization:`Bearer ${token}`}, body: JSON.stringify({ to:activeContact, message }) })
    addNotification(`Mensagem enviada para ${activeContact}`)
    setMessage("")
  }

  if (!token) return (
    <div style={{ display:"flex", justifyContent:"center", alignItems:"center", height:"100vh", background:"#0a0a0a", color:"#0ff", fontFamily:"Orbitron, sans-serif" }}>
      <div style={{ padding:50, border:"2px solid #0ff", borderRadius:20, boxShadow:"0 0 30px #0ff", textAlign:"center" }}>
        <h2 style={{ marginBottom:30, textShadow:"0 0 10px #0ff" }}>Login / Registro</h2>
        <input placeholder="Usuário" value={username} onChange={e=>setUsername(e.target.value)} style={inputStyle}/><br/>
        <input placeholder="Senha" type="password" value={password} onChange={e=>setPassword(e.target.value)} style={inputStyle}/><br/><br/>
        <div style={{ display:"flex", justifyContent:"space-between" }}>
          <button onClick={login} style={buttonStyle}>Login</button>
          <button onClick={register} style={buttonStyle}>Registrar</button>
        </div>
      </div>
    </div>
  )

  const bgColor = darkMode?"#111":"#eee"
  const textColor = darkMode?"#fff":"#000"
  const inputBg = darkMode?"#222":"#fff"
  const inputColor = darkMode?"#fff":"#000"
  const statusShow = status !== "qr"

  return (
    <div style={{ display:"flex", height:"100vh", background:bgColor, color:textColor, fontFamily:"Orbitron, sans-serif", transition:"all 0.3s" }}>
      {/* Sidebar */}
      <div style={{ width:220, borderRight:`2px solid ${darkMode?"#0ff":"#5f5a5aff"}`, display:"flex", flexDirection:"column", padding:15, gap:10 }}>
        <h2 style={{ textAlign:"center", textShadow:"0 0 10px #0ff" }}>{siteTitle}</h2>
        <button onClick={()=>{ setTab("chat"); setAdminMode(false) }} style={sidebarBtn(tab==="chat")}>Conversas</button>
        <button onClick={()=>{ setTab("connect"); setAdminMode(false) }} style={sidebarBtn(tab==="connect")}>{ statusShow ? "Status" : "Conectar" }</button>
        <button onClick={()=>{ setTab("settings"); setAdminMode(false) }} style={sidebarBtn(tab==="settings")}>Configurações</button>
        <button onClick={()=>{ setTab("chatbot"); setAdminMode(false) }} style={sidebarBtn(tab==="chatbot")}>ChatBot (Beta)</button>
        <button onClick={logout} style={{ marginTop:"auto", padding:10, background:"#f55", color:"#fff", border:"none", cursor:"pointer", borderRadius:5 }}>Logout</button>
      </div>

      {/* Conteúdo principal */}
      <div style={{ flex:1, padding:25, display:"flex", flexDirection:"column", gap:20, transition:"all 0.5s" }}>
        {tab==="chat" && !adminMode && <ChatTab {...{contacts,activeContact,setActiveContact,messages,message,setMessage,send,darkMode,textColor,inputBg,inputColor}} />}
        {tab==="connect" && !adminMode && <ConnectTab {...{status,qrCode,token,API}} />}
        {tab==="settings" && !adminMode && <SettingsTab {...{darkMode,setDarkMode,siteTitle,setSiteTitle,notifyNewMsg,setNotifyNewMsg,setAdminMode}} />}
        {adminMode && <AdminTab token={token} />}
        {tab==="chatbot" && !adminMode && <ChatbotTab addNotification={addNotification} />}
      </div>

      {/* Notificações */}
      <div style={{ position:"fixed", bottom:20, right:20, display:"flex", flexDirection:"column", gap:10 }}>
        {notifications.map(n=>(
          <div key={n.id} style={{ background:"#0ff", color:"#000", padding:10, borderRadius:10, boxShadow:"0 0 15px #0ff", animation:"fadeInOut 4s forwards" }}>
            {n.text}
          </div>
        ))}
      </div>

      <style>{`
        @keyframes fadeInOut {
          0% { opacity:0; transform: translateX(50px); }
          10% { opacity:1; transform: translateX(0); }
          90% { opacity:1; transform: translateX(0); }
          100% { opacity:0; transform: translateX(50px); }
        }
        @keyframes glow {
          0% { text-shadow: 0 0 5px #0ff; }
          50% { text-shadow: 0 0 20px #0ff; }
          100% { text-shadow: 0 0 5px #0ff; }
        }
        @keyframes pulse {
          0% { transform: scale(1); }
          50% { transform: scale(1.1); }
          100% { transform: scale(1); }
        }
        @keyframes fadeSlide {
          0% { opacity:0; transform: translateY(20px); }
          100% { opacity:1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )

  // === Chatbot Tab ===
  function ChatbotTab({addNotification}:{addNotification:(text:string)=>void}){
    const [projects,setProjects] = useState<string[]>(() => {
      try {
        const saved = localStorage.getItem("chatbotProjects")
        return saved ? JSON.parse(saved) : []
      } catch { return [] }
    })
    const [activeProject,setActiveProject] = useState<string>(() => {
      try {
        const savedProjects = localStorage.getItem("chatbotProjects")
        const projects = savedProjects ? JSON.parse(savedProjects) : []
        return projects[0] || ""
      } catch { return "" }
    })
    const [nodes,setNodes] = useState<any[]>([])
    const [search,setSearch] = useState("")

    useEffect(()=>{
      if(!activeProject){ setNodes([]); return }
      try{
        const saved = localStorage.getItem(`chatbotNodes_${activeProject}`)
        setNodes(saved ? JSON.parse(saved) : [])
      }catch{ setNodes([]) }
    },[activeProject])

    const saveProject = ()=>{
      if(!activeProject) return
      localStorage.setItem(`chatbotNodes_${activeProject}`, JSON.stringify(nodes))
      addNotification("Projeto salvo!")
    }

    const createProject = ()=>{
      const name = prompt("Nome do projeto:") || `Projeto_${Date.now()}`
      setProjects(prev=>{
        const newList = [...prev,name]
        localStorage.setItem("chatbotProjects", JSON.stringify(newList))
        return newList
      })
      setActiveProject(name)
      setNodes([])
    }

    const deleteProject = (name:string)=>{
      if(!confirm(`Excluir projeto ${name}?`)) return
      const newList = projects.filter(p=>p!==name)
      localStorage.setItem("chatbotProjects", JSON.stringify(newList))
      localStorage.removeItem(`chatbotNodes_${name}`)
      setProjects(newList)
      if(activeProject===name) setActiveProject(newList[0] || "")
    }

    const allNodes = [
      "WhatsApp Connect","WhatsApp QR Code","On Message Received","On Media Received","On Sticker Received",
      "Send Text Message","Send Media","Send Sticker","Send Template","Text Parser","Regex Filter",
      "Keyword Router","AI/NLP Node","Conditional Node","Switch/Router","Delay Node","Loop Node",
      "Database Node","Cookie/Local Storage Node","Session Node","HTTP Request","Webhook Node","Notification Node"
    ]
    const filteredNodes = allNodes.filter(n=>n.toLowerCase().includes(search.toLowerCase()))

    const addNode = (type:string)=>{
      if(!activeProject) return
      setNodes(prev=>{
        const newNodes = [...prev,{ id:Date.now(), type, label:type }]
        localStorage.setItem(`chatbotNodes_${activeProject}`, JSON.stringify(newNodes))
        return newNodes
      })
    }

    return (
      <div style={{ display:"flex", flex:1, gap:15 }}>
        <div style={{ width:220, borderRight:"1px solid #0ff", padding:10, display:"flex", flexDirection:"column" }}>
          <h3>Projetos</h3>
          <button onClick={createProject} style={{ marginBottom:10, padding:5 }}>Novo Projeto</button>
          <div style={{ flex:1, overflowY:"auto" }}>
            {projects.map(p=>(
              <div key={p} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:5 }}>
                <span onClick={()=>setActiveProject(p)} style={{ cursor:"pointer", color:p===activeProject?"#0ff":"#fff" }}>{p}</span>
                <button onClick={()=>deleteProject(p)} style={{ background:"#f55", border:"none", borderRadius:3, padding:2, color:"#fff" }}>X</button>
              </div>
            ))}
          </div>
          {activeProject && <button onClick={saveProject} style={{ marginTop:10, padding:5 }}>Salvar Projeto</button>}
        </div>

        <div style={{ flex:1, padding:10, borderRadius:10, background:"#111", display:"flex", flexDirection:"column" }}>
          <h3>Editor Visual {activeProject && `- ${activeProject}`}</h3>
          <div style={{ display:"flex", gap:10, marginBottom:10 }}>
            <input placeholder="Buscar Node..." value={search} onChange={e=>setSearch(e.target.value)} 
              style={{ flex:1, padding:5, borderRadius:5, border:"1px solid #0ff", background:"#222", color:"#fff" }}/>
          </div>
          <div style={{ flex:1, display:"flex", flexWrap:"wrap", gap:10, overflow:"auto", border:"1px solid #0ff", borderRadius:5, padding:10 }}>
            {nodes.map(n=>(
              <div key={n.id} style={{ padding:10, border:"1px solid #0ff", borderRadius:5, background:"#222", minWidth:120 }}>
                {n.label}
              </div>
            ))}
          </div>
          {activeProject && (
            <div style={{ marginTop:10 }}>
              <h4>Adicionar Node</h4>
              {filteredNodes.map(n=>(
                <button key={n} onClick={()=>addNode(n)} style={{ margin:3, padding:5, borderRadius:5, background:"#0ff", color:"#000", border:"none", cursor:"pointer" }}>{n}</button>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }
}

// --- Estilos ---
const inputStyle = { margin:5, padding:10, width:"100%", borderRadius:10, border:"1px solid #0ff", background:"#111", color:"#fff" }
const buttonStyle = { padding:10, borderRadius:10, border:"none", background:"#0ff", color:"#000", cursor:"pointer", width:100 }
const sidebarBtn = (active:boolean) => ({ margin:5, padding:10, background:active?"rgba(75, 75, 75, 1)":"transparent", color:"#8a8a8aff", border:"none", cursor:"pointer", borderRadius:5, transition:"all 0.3s" })

// Componentes das abas
function ChatTab({contacts,activeContact,setActiveContact,messages,message,setMessage,send,darkMode,textColor,inputBg,inputColor}:any){
  return (
    <div style={{ display:"flex", flex:1, gap:15 }}>
      <div style={{ width:200, borderRight:`1px solid ${darkMode?"#0ff":"#333"}`, paddingRight:10 }}>
        <h3>Contatos</h3>
        <div style={{ overflowY:"auto", maxHeight:"80vh" }}>
          {contacts.map((c:string)=><div key={c} onClick={()=>setActiveContact(c)}
            style={{ padding:5, margin:3, cursor:"pointer", borderRadius:5, background:c===activeContact?"#0ff":"transparent", color:"#000", transition:"all 0.3s" }}>{c}</div>)}
        </div>
      </div>
      <div style={{ flex:1, display:"flex", flexDirection:"column" }}>
        {activeContact && <h3>Conversando com {activeContact}</h3>}
        <div style={{ flex:1, padding:10, borderRadius:10, background:inputBg, overflowY:"auto", display:"flex", flexDirection:"column", gap:5 }}>
          {messages.map((m:any,i:number)=><div key={i} style={{ maxWidth:"70%", padding:6, borderRadius:8, background:m.from==="me"?"#0ff":"#005577", alignSelf:m.from==="me"?"flex-end":"flex-start", color:"#000", opacity:0, animation:`fadeSlide 0.5s forwards`, animationDelay:`${i*0.05}s` }}>
            <b>{m.from}:</b> {m.body}
          </div>)}
        </div>
        {activeContact && <div style={{ display:"flex", gap:10, marginTop:10 }}>
          <input value={message} onChange={e=>setMessage(e.target.value)} onKeyDown={e=>e.key==="Enter" && send()} placeholder="Mensagem"
            style={{ flex:1, padding:5, borderRadius:5, border:"none", background:inputBg, color:inputColor }}/>
          <button onClick={send} style={{ padding:5, borderRadius:5, background:"#0ff", color:"#000", border:"none", cursor:"pointer" }}>Enviar</button>
        </div>}
      </div>
    </div>
  )
}

function ConnectTab({status,qrCode,token,API}:any){
  const [number,setNumber] = useState("")
  const statusHuman = status==="init"?"Iniciando":status==="qr"?"Aguardando QR":status==="ready"?"Conectado":status==="disconnected"?"Desconectado":status==="error"?"Erro":"Um Erro Critico Aconteceu"

  useEffect(()=>{
    let canceled = false
    const fetchNumber = async ()=>{
      if (!token) return
      try{
        if (status !== "ready") { setNumber(""); return }
        const res = await fetch(`${API}/getNumber`,{ headers:{ Authorization:`Bearer ${token}` }})
        if (!res.ok) return setNumber("")
        const data = await res.json()
        if (!canceled) setNumber(data.number || "")
      }catch{ if (!canceled) setNumber("") }
    }
    fetchNumber()
    return ()=>{ canceled = true }
  },[status,token,API])

  return (
    <div style={{ textAlign:"center" }}>
      <h3 >Status: {statusHuman}</h3>
      {status==="qr" && <img src={qrCode} alt="QR" style={{ width:200, borderRadius:10, animation:"pulse 1s infinite"}}/>}
      {status==="ready" && <p style={{ color:"#0ff" }}>Conectado ✅ {number? `- ${number}` : ""}</p>}
      {status==="disconnected" && <p style={{ color:"#f55" }}>Desconectado ❌</p>}
      {status==="error" && <p style={{ color:"#f55" }}>Erro no Sistema ⚠️</p>}
    </div>
  )
}

function SettingsTab({darkMode,setDarkMode,siteTitle,setSiteTitle,notifyNewMsg,setNotifyNewMsg,setAdminMode}:any){
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:15 }}>
      <button onClick={()=>setDarkMode(!darkMode)} style={{ padding:10 }}>{darkMode?"Modo Claro":"Modo Escuro"}</button>
      <div>
        <label>Título do Site:</label>
        <input value={siteTitle} onChange={e=>setSiteTitle(e.target.value)} style={{ marginLeft:10, padding:5 }}/>
      </div>
      <div>
        <label><input type="checkbox" checked={notifyNewMsg} onChange={e=>setNotifyNewMsg(e.target.checked)}/> Notificar novas mensagens</label>
      </div>
      <button onClick={()=>setAdminMode(true)} style={{ opacity:0.2, transition:"all 0.3s", padding:5 }}>Clique secreto</button>
    </div>
  )
}

function AdminTab({token}:{token:string}){
  const [apiRes,setApiRes] = useState("")
  const callApi = async ()=>{
    const res = await fetch("http://localhost:3001/status",{ headers:{ Authorization:`Bearer ${token}` }})
    const data = await res.json()
    setApiRes(JSON.stringify(data,null,2))
  }
  return (
    <div style={{ background:"#111", color:"#0ff", padding:20, borderRadius:10, fontFamily:"monospace" }}>
      <h3>Painel Admin</h3>
      <button onClick={callApi} style={{ marginBottom:10, padding:5 }}>Testar API /status</button>
      <pre>{apiRes}</pre>
    </div>
  )
}
