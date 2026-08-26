
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const crypto = require("crypto");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
app.use(express.static("public"));

const rooms = new Map();
const WORDS = ["TACO","CAT","GOAT","CHEESE","PIZZA"];

function code() {
  let c;
  do c = crypto.randomBytes(3).toString("hex").toUpperCase();
  while (rooms.has(c));
  return c;
}
function deck() {
  // 70 cards: 14 of each word. This is a simplified first playable deck.
  const d = [];
  for (let i=0;i<70;i++) d.push(i % 5);
  for (let i=d.length-1;i>0;i--) {
    const j=Math.floor(Math.random()*(i+1));
    [d[i],d[j]]=[d[j],d[i]];
  }
  return d;
}
function publicRoom(r) {
  return {
    code:r.code,
    host:r.host,
    started:r.started,
    callIndex:r.callIndex,
    pileCount:r.pile.length,
    turn:r.turn,
    slapOpen:r.slapOpen,
    players:r.players.map(p=>({
      id:p.id,name:p.name,cards:p.cards.length,connected:p.connected
    }))
  };
}
function sendRoom(r) { io.to(r.code).emit("state", publicRoom(r)); }

function endIfNeeded(r) {
  const alive = r.players.filter(p=>p.cards.length > 0);
  if (r.started && alive.length === 1 && r.players.length > 1) {
    r.started=false;
    r.loser=alive[0].name;
    io.to(r.code).emit("gameOver",{loser:r.loser});
    return true;
  }
  return false;
}
function advance(r) {
  if (!r.started) return;
  const alive = r.players.filter(p=>p.cards.length > 0);
  if (!alive.length) return;
  let idx = r.turn;
  for (let n=0;n<r.players.length;n++) {
    idx=(idx+1)%r.players.length;
    if (r.players[idx].cards.length>0) { r.turn=idx; break; }
  }
  r.callIndex=(r.callIndex+1)%5;
  r.slapOpen=false;
  r.played=false;
  r.lastSlapper=null;
}
function broadcastPrivate(r) {
  r.players.forEach(p=>{
    io.to(p.id).emit("private",{
      hand:p.cards,
      yourTurn:r.started && r.players[r.turn]?.id===p.id,
      slapOpen:r.slapOpen
    });
  });
}
function resolveSlap(r, winnerIndex) {
  if (!r.started || !r.slapOpen) return;
  clearTimeout(r.slapTimer);
  r.slapOpen=false;
  const winner=r.players[winnerIndex];
  winner.cards.push(...r.pile);
  const amount=r.pile.length;
  r.pile=[];
  io.to(r.code).emit("event",`${winner.name} slapped last and takes ${amount} cards.`);
  if (!endIfNeeded(r)) {
    advance(r);
    sendRoom(r);
    broadcastPrivate(r);
  }
}

app.get("/health", (req,res)=>res.json({status:"ok",service:"taco-cat-online"}));

io.on("connection", socket=>{
  socket.on("createRoom", ({name}, cb)=>{
    name=String(name||"Player").trim().slice(0,18);
    const r={code:code(),host:socket.id,players:[],started:false,pile:[],turn:0,callIndex:0,slapOpen:false,played:false,lastSlapper:null};
    rooms.set(r.code,r);
    r.players.push({id:socket.id,name,cards:[],connected:true});
    socket.join(r.code);
    cb({ok:true,code:r.code});
    sendRoom(r); broadcastPrivate(r);
  });

  socket.on("joinRoom", ({code,name}, cb)=>{
    const r=rooms.get(String(code||"").toUpperCase());
    name=String(name||"Player").trim().slice(0,18);
    if(!r) return cb({ok:false,error:"Room not found."});
    if(r.started) return cb({ok:false,error:"Game already started."});
    if(r.players.length>=5) return cb({ok:false,error:"Room is full (5 players)."});
    if(r.players.some(p=>p.name.toLowerCase()===name.toLowerCase())) return cb({ok:false,error:"Name already in use."});
    r.players.push({id:socket.id,name,cards:[],connected:true});
    socket.join(r.code);
    cb({ok:true,code:r.code});
    sendRoom(r); broadcastPrivate(r);
  });

  socket.on("startGame", ({code})=>{
    const r=rooms.get(code); if(!r || r.host!==socket.id || r.started || r.players.length<2) return;
    const d=deck();
    r.players.forEach(p=>p.cards=[]);
    for(let round=0;round<7;round++) r.players.forEach(p=>p.cards.push(d.pop()));
    r.pile=[]; r.turn=0; r.callIndex=0; r.started=true; r.slapOpen=false; r.played=false;
    io.to(r.code).emit("event","Game started!");
    sendRoom(r); broadcastPrivate(r);
  });

  socket.on("playCard", ({code})=>{
    const r=rooms.get(code); if(!r || !r.started || r.slapOpen) return;
    const p=r.players[r.turn];
    if(!p || p.id!==socket.id || r.played || !p.cards.length) return;
    const card=p.cards.shift();
    r.pile.push(card); r.played=true;
    const match=card===r.callIndex;
    io.to(r.code).emit("played",{player:p.name,card,word:WORDS[r.callIndex],match,pileCount:r.pile.length});
    if(match){
      r.slapOpen=true;
      clearTimeout(r.slapTimer);
      r.slapTimer=setTimeout(()=>resolveSlap(r,r.turn),5000);
    } else {
      setTimeout(()=>{
        if(!r.started || r.slapOpen) return;
        advance(r); sendRoom(r); broadcastPrivate(r);
      },850);
    }
    sendRoom(r); broadcastPrivate(r);
  });

  socket.on("slap", ({code})=>{
    const r=rooms.get(code); if(!r || !r.started || !r.slapOpen)return;
    const i=r.players.findIndex(p=>p.id===socket.id);
    if(i<0)return;
    // First server-received slap wins.
    r.lastSlapper=i;
    resolveSlap(r,i);
  });

  socket.on("disconnect",()=>{
    for(const r of rooms.values()){
      const p=r.players.find(x=>x.id===socket.id);
      if(!p) continue;
      p.connected=false;
      if(!r.started){
        r.players=r.players.filter(x=>x.id!==socket.id);
        if(r.host===socket.id && r.players.length) r.host=r.players[0].id;
        if(!r.players.length) rooms.delete(r.code);
        else {sendRoom(r);broadcastPrivate(r);}
      } else {
        io.to(r.code).emit("event",`${p.name} disconnected.`);
        sendRoom(r);
      }
    }
  });
});

const PORT=process.env.PORT||3000;
server.listen(PORT,()=>console.log(`Taco Cat online server listening on ${PORT}`));
