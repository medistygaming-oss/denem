// ===================== VAZGUÇXN • GUARD & TICKET BOT & WEB PANEL =====================
// discord.js v14 | Slash Komutlar & Express Web Yönetim Paneli (Railway Uyumlu)
// ===========================================================================

process.on("unhandledRejection", (r) => console.error("UNHANDLED_REJECTION:", r));
process.on("uncaughtException", (e) => console.error("UNCAUGHT_EXCEPTION:", e));

const fs = require("fs");
const path = require("path");
const express = require("express");
const session = require("express-session");
const { MongoClient } = require("mongodb");
const { joinVoiceChannel, getVoiceConnection } = require("@discordjs/voice");

const {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionsBitField,
  ChannelType,
  ActivityType,
  SlashCommandBuilder,
  Events,
  REST,
  Routes
} = require("discord.js");

// ===================== FETCH (Node 18+ global) fallback =====================
let _fetch = global.fetch;
if (!_fetch) {
  try {
    _fetch = (...args) => import("node-fetch").then(({ default: f }) => f(...args));
  } catch (e) {
    console.error("❌ fetch yok! Node 18+ kullan veya node-fetch kur.");
    process.exit(1);
  }
}

// ===================== ENV =====================
const TOKEN = (process.env.DISCORD_TOKEN || "").trim();
const CLIENT_ID = (process.env.CLIENT_ID || "").trim();
const GUILD_ID = (process.env.GUILD_ID || "").trim();
const CLIENT_SECRET = (process.env.CLIENT_SECRET || "").trim();
const COOKIE_SECRET = (process.env.COOKIE_SECRET || "vazgucxn_super_secret_cookie_key").trim();

// Railway Domain Desteği (Örn: https://senin-projen.up.railway.app)
const PUBLIC_URL = (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : (process.env.PUBLIC_URL || "")).trim();
const PORT = process.env.PORT || 10000;

if (!TOKEN) {
  console.error("❌ DISCORD_TOKEN eksik! (.env / Railway ENV'e ekle)");
  process.exit(1);
}

// ===================== AYARLAR / MARKA =====================
const OWNER_IDS = (process.env.OWNER_IDS || "827905938923978823,1129811807570247761")
  .split(",").map((x) => x.trim()).filter(Boolean);
const isOwner = (id) => OWNER_IDS.includes(id);

const ENV_STAFF_IDS = (process.env.STAFF_IDS || "").split(",").map((x) => x.trim()).filter(Boolean);
let staffIds; 
const isStaff = (id) => isOwner(id) || (staffIds && staffIds.has(id));

const GUARD_MASTER_ID = "827905938923978823";
const isGuardCommandUser = (id) => id === GUARD_MASTER_ID;

const DEFAULT_IMAGE_URL = "https://cdn.discordapp.com/attachments/1525920078720143551/1525933790554231027/content.png";
const BOT_IMAGE_URL = (process.env.BOT_IMAGE_URL || "").trim() || DEFAULT_IMAGE_URL;
const TICKET_BANNER_URL = (process.env.TICKET_BANNER_URL || "").trim() || BOT_IMAGE_URL;
const PANEL_AUTHOR = (process.env.PANEL_AUTHOR || "Vazgucxn Assistant").trim();
const FOOTER_TEXT = (process.env.FOOTER_TEXT || "Developed by Vazgucxn").trim();
const CFX_CODE = (process.env.CFX_CODE || "xjx5kr").trim();

const NAVY = 0x0b1a3a;

// ===================== EMOJİLER =====================
const EMOJI = {
  settings: "<a:settings:1525963621975462032>",
  success: "<a:success:1525963728309190680>",
  info: "<:info:1525963915564159046>",
  lock: "<a:lock:1525964141695598612>",
  right: "<a:right:1525964486115201166>",
  warn: "<:warn:1525965027545452544>",
  ban: "<:ban:1525965485424902276>",
  kick: "<:ban:1525965485424902276>",
  trash: "<:trash:1525965599627546684>",
  shield: "<:shield:1525966402312343702>",
  crown: "<a:crown:1525965818037276853>",
  star: "<:yildiz:1520167832678301890>",
  weed: "<:weed:1520169653358428351>",
  box: "<:box:1520169843452543169>",
  refresh: "<:refresh:1520170092975882260>",
  headphones: "<:headphones:1520170199368601710>",
  muted: "<:muted:1520170268524281866>",
  unmute: "<:unmute:1520170332659646564>",
  move: "<a:sagok:1520167724355948744>",
  search: "<:search:1520171230009753770>",
  fivem: "<:fivem:1520171196518240546>"
};
const line = (emoji, text) => `${emoji} ・ ${text}`;

// ===================== MONGODB =====================
const MONGODB_URI = (process.env.MONGODB_URI || process.env.MONGODB_URL || "").trim();
const MONGODB_DB = (process.env.MONGODB_DB || "vazguxn_bot").trim();

let mongoCol = null;
let mongoReady = false;

async function initMongo() {
  if (!MONGODB_URI) {
    console.log("ℹ️ MONGODB_URI tanımlı değil, sadece yerel JSON kullanılacak.");
    return;
  }
  try {
    const client = new MongoClient(MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
    await client.connect();
    mongoCol = client.db(MONGODB_DB).collection("kv_store");
    mongoReady = true;
    console.log("✅ MongoDB bağlantısı OK — veriler kalıcı olacak.");
  } catch (e) {
    console.error("❌ MongoDB bağlantı hatası:", e.message);
  }
}

async function pullFromMongo(key, localFile) {
  if (!mongoReady) return;
  try {
    const doc = await mongoCol.findOne({ _id: key });
    if (doc && doc.value !== undefined) {
      fs.writeFileSync(localFile, JSON.stringify(doc.value, null, 2));
    }
  } catch (e) {
    console.error(`Mongo pull hata (${key}):`, e.message);
  }
}

async function pushToMongo(key, value) {
  if (!mongoReady) return;
  try {
    await mongoCol.updateOne({ _id: key }, { $set: { value, updatedAt: new Date() } }, { upsert: true });
  } catch (e) {
    console.error(`Mongo push hata (${key}):`, e.message);
  }
}

// ===================== DATA / CONFIG =====================
const DATA_DIR = path.join(__dirname, "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function loadJSON(file, fallback) {
  try {
    if (!fs.existsSync(file)) {
      fs.writeFileSync(file, JSON.stringify(fallback, null, 2));
      return fallback;
    }
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}
function saveJSON(file, data, mongoKey) {
  try { fs.writeFileSync(file, JSON.stringify(data, null, 2)); } catch {}
  pushToMongo(mongoKey || path.basename(file), data).catch(() => {});
}

const CONFIG_FILE = path.join(DATA_DIR, "config.json");
const GUARD_FILE = path.join(DATA_DIR, "guard.json");
const WHITELIST_FILE = path.join(DATA_DIR, "whitelist.json");
const STAFF_FILE = path.join(DATA_DIR, "staff.json");

let config, guardConfig, whitelist;

// ===================== CLIENT =====================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildBans,
    GatewayIntentBits.GuildVoiceStates
  ],
  partials: [Partials.Channel]
});

const ticketOwners = new Map(); 
const guardCounters = new Map(); 
const aktiflikList = new Map(); 
const activityStats = new Map(); 
let aktiflikLogChannelId = null;

// ===================== EXPRESS WEB PANEL APP =====================
const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
  secret: COOKIE_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }
}));

// Web Panel Yetki Kontrolü Middleware
function checkAuth(req, res, next) {
  if (req.session && req.session.authenticated) {
    return next();
  }
  return res.redirect("/login");
}

// Şifre ile Giriş Rotaları
app.get("/login", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="tr">
    <head>
      <meta charset="UTF-8">
      <title>Giriş Yap — Vazgucxn Bot</title>
      <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #070d1b; color: #fff; margin: 0; padding: 0; display: flex; justify-content: center; align-items: center; height: 100vh; }
        .card { background: #0b1a3a; padding: 40px; border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.6); text-align: center; border: 1px solid #1a3668; max-width: 400px; width: 100%; }
        h1 { margin-bottom: 10px; color: #60a5fa; font-size: 24px; }
        p { color: #94a3b8; font-size: 14px; margin-bottom: 25px; }
        input { background: #050b14; border: 1px solid #334155; color: #fff; padding: 12px; border-radius: 6px; width: 100%; margin-bottom: 20px; font-size: 14px; box-sizing: border-box; }
        .btn { display: inline-block; background: #5865F2; color: #fff; padding: 12px 28px; border-radius: 6px; text-decoration: none; font-weight: 600; transition: 0.2s; box-shadow: 0 4px 12px rgba(88,101,242,0.4); width: 100%; border: none; cursor: pointer; font-size: 14px; }
        .btn:hover { background: #4752C4; transform: translateY(-2px); }
        .error { color: #ef4444; font-size: 13px; margin-bottom: 15px; }
      </style>
    </head>
    <body>
      <div class="card">
        <h1>Yönetim Paneli Girişi</h1>
        <p>Lütfen panele erişmek için şifrenizi girin.</p>
        ${req.query.error ? '<div class="error">❌ Hatalı şifre, tekrar deneyin.</div>' : ''}
        <form action="/login" method="POST">
          <input type="password" name="password" placeholder="Şifre..." required />
          <button type="submit" class="btn">Giriş Yap</button>
        </form>
      </div>
    </body>
    </html>
  `);
});

app.post("/login", (req, res) => {
  const { password } = req.body;
  if (password === "knesta112233") {
    req.session.authenticated = true;
    return res.redirect("/panel");
  }
  return res.redirect("/login?error=true");
});

app.get("/logout", (req, res) => {
  req.session.destroy();
  res.redirect("/login");
});

// Modern Web Panel Arayüzü (HTML / CSS / JS)
app.get("/", (req, res) => {
  res.redirect("/panel");
});

app.get("/panel", checkAuth, async (req, res) => {
  const guild = client.guilds.cache.first();
  const guildName = guild ? guild.name : "Sunucu Bulunamadı";
  const memberCount = guild ? guild.memberCount : 0;
  const channelsCount = guild ? guild.channels.cache.size : 0;
  
  let voiceChannels = [];
  if (guild) {
    try {
      await guild.members.fetch();
      voiceChannels = guild.channels.cache.filter(c => c.isVoiceBased()).map(c => ({
        id: c.id,
        name: c.name,
        members: c.members.map(m => ({ id: m.id, tag: m.user.tag, deaf: m.voice.deaf, mute: m.voice.serverMute }))
      }));
    } catch {}
  }

  res.send(`
    <!DOCTYPE html>
    <html lang="tr">
    <head>
      <meta charset="UTF-8">
      <title>Yönetim Paneli — Vazgucxn Bot</title>
      <style>
        * { box-sizing: border-box; }
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #050b14; color: #e2e8f0; margin: 0; padding: 0; display: flex; }
        sidebar { width: 260px; background: #0b1a3a; height: 100vh; position: fixed; padding: 25px 20px; border-right: 1px solid #1a3668; display: flex; flex-direction: column; }
        sidebar h2 { font-size: 18px; color: #60a5fa; margin-top: 0; margin-bottom: 30px; letter-spacing: 0.5px; }
        sidebar a { color: #94a3b8; text-decoration: none; padding: 10px 14px; border-radius: 6px; margin-bottom: 6px; display: block; font-weight: 500; transition: 0.2s; }
        sidebar a:hover, sidebar a.active { background: #1e3a8a; color: #fff; }
        .main { margin-left: 260px; padding: 40px; width: calc(100% - 260px); max-width: 1400px; }
        .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 35px; border-bottom: 1px solid #1e293b; padding-bottom: 20px; }
        .header h1 { margin: 0; font-size: 24px; color: #f8fafc; }
        .user-badge { background: #0f172a; padding: 8px 16px; border-radius: 20px; border: 1px solid #334155; font-size: 14px; }
        .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 20px; margin-bottom: 35px; }
        .stat-card { background: #0b1a3a; padding: 22px; border-radius: 10px; border: 1px solid #1a3668; }
        .stat-card h3 { margin: 0 0 10px 0; font-size: 14px; color: #94a3b8; text-transform: uppercase; }
        .stat-card .val { font-size: 26px; font-weight: bold; color: #60a5fa; }
        .section { background: #0b1a3a; padding: 25px; border-radius: 10px; border: 1px solid #1a3668; margin-bottom: 30px; }
        .section h2 { margin-top: 0; color: #60a5fa; font-size: 18px; border-bottom: 1px solid #1e3a8a; padding-bottom: 10px; }
      </style>
    </head>
    <body>
      <sidebar>
        <h2>🛡️ Vazgucxn Panel</h2>
        <a href="/panel" class="active">📊 Genel Bakış</a>
        <a href="/panel/moderation">🔨 Moderasyon</a>
        <a href="/panel/voice">🎧 Ses Kontrolü</a>
        <a href="/panel/fivem">🎮 FiveM Sorgu & Tag</a>
        <a href="/logout" style="margin-top:auto; color:#ef4444;">🚪 Çıkış Yap</a>
      </sidebar>

      <div class="main">
        <div class="header">
          <h1>Sunucu Yönetim Paneli — ${guildName}</h1>
          <div class="user-badge">👤 Admin</div>
        </div>

        <div class="stats-grid">
          <div class="stat-card">
            <h3>Toplam Üye</h3>
            <div class="val">${memberCount}</div>
          </div>
          <div class="stat-card">
            <h3>Toplam Kanal</h3>
            <div class="val">${channelsCount}</div>
          </div>
          <div class="stat-card">
            <h3>Ses Kanalları</h3>
            <div class="val">${voiceChannels.length}</div>
          </div>
          <div class="stat-card">
            <h3>Guard Durumu</h3>
            <div class="val" style="color:#10b981;">AKTİF</div>
          </div>
        </div>

        <div class="section">
          <h2>⚡ Hızlı Bot Durumu & Bilgi</h2>
          <p>Bot sistemsel olarak aktif çalışmaktadır. Sol menüden ses kanallarındaki üyeleri sağırlaştırabilir, muteleyebilir, kick/ban atabilir veya FiveM ID & Tag sorgulaması yapabilirsiniz.</p>
        </div>
      </div>
    </body>
    </html>
  `);
});

// Moderasyon Sayfası (Ban, Kick, vb.)
app.get("/panel/moderation", checkAuth, async (req, res) => {
  const guild = client.guilds.cache.first();
  let members = [];
  if (guild) {
    try {
      await guild.members.fetch();
      members = guild.members.cache.filter(m => !m.user.bot).map(m => ({ id: m.id, tag: m.user.tag }));
    } catch {}
  }

  res.send(`
    <!DOCTYPE html>
    <html lang="tr">
    <head>
      <meta charset="UTF-8">
      <title>Moderasyon — Vazgucxn Panel</title>
      <style>
        * { box-sizing: border-box; }
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #050b14; color: #e2e8f0; margin: 0; padding: 0; display: flex; }
        sidebar { width: 260px; background: #0b1a3a; height: 100vh; position: fixed; padding: 25px 20px; border-right: 1px solid #1a3668; display: flex; flex-direction: column; }
        sidebar h2 { font-size: 18px; color: #60a5fa; margin-top: 0; margin-bottom: 30px; }
        sidebar a { color: #94a3b8; text-decoration: none; padding: 10px 14px; border-radius: 6px; margin-bottom: 6px; display: block; font-weight: 500; transition: 0.2s; }
        sidebar a:hover, sidebar a.active { background: #1e3a8a; color: #fff; }
        .main { margin-left: 260px; padding: 40px; width: calc(100% - 260px); max-width: 1400px; }
        .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 35px; border-bottom: 1px solid #1e293b; padding-bottom: 20px; }
        .header h1 { margin: 0; font-size: 24px; color: #f8fafc; }
        .section { background: #0b1a3a; padding: 25px; border-radius: 10px; border: 1px solid #1a3668; margin-bottom: 30px; }
        .section h2 { margin-top: 0; color: #60a5fa; font-size: 18px; border-bottom: 1px solid #1e3a8a; padding-bottom: 10px; }
        .btn { background: #3b82f6; color: #fff; border: none; padding: 10px 18px; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 14px; transition: 0.2s; }
        .btn:hover { background: #2563eb; }
        .btn-danger { background: #ef4444; }
        .btn-danger:hover { background: #dc2626; }
        input, select, textarea { background: #050b14; border: 1px solid #334155; color: #fff; padding: 10px 14px; border-radius: 6px; width: 100%; margin-top: 6px; margin-bottom: 15px; font-size: 14px; }
        label { font-size: 13px; color: #94a3b8; font-weight: 600; }
        .alert { padding: 12px; background: rgba(16, 185, 129, 0.2); border: 1px solid #10b981; color: #34d399; border-radius: 6px; margin-bottom: 20px; display: none; }
      </style>
    </head>
    <body>
      <sidebar>
        <h2>🛡️ Vazgucxn Panel</h2>
        <a href="/panel">📊 Genel Bakış</a>
        <a href="/panel/moderation" class="active">🔨 Moderasyon</a>
        <a href="/panel/voice">🎧 Ses Kontrolü</a>
        <a href="/panel/fivem">🎮 FiveM Sorgu & Tag</a>
        <a href="/logout" style="margin-top:auto; color:#ef4444;">🚪 Çıkış Yap</a>
      </sidebar>

      <div class="main">
        <div class="header">
          <h1>Moderasyon İşlemleri (Ban / Kick)</h1>
        </div>

        <div id="alertBox" class="alert">İşlem başarıyla gerçekleştirildi.</div>

        <div class="section">
          <h2>🔨 Üye Yasakla (Ban)</h2>
          <form id="banForm">
            <label>Kullanıcı Seçin</label>
            <select name="userId" required>
              <option value="">Seçiniz...</option>
              ${members.map(m => `<option value="${m.id}">${m.tag} (${m.id})</option>`).join("")}
            </select>
            <label>Sebep</label>
            <input type="text" name="reason" placeholder="Ban sebebi..." />
            <button type="submit" class="btn btn-danger">Üyeyi Banla</button>
          </form>
        </div>

        <div class="section">
          <h2>👢 Üye Sunucudan At (Kick)</h2>
          <form id="kickForm">
            <label>Kullanıcı Seçin</label>
            <select name="userId" required>
              <option value="">Seçiniz...</option>
              ${members.map(m => `<option value="${m.id}">${m.tag} (${m.id})</option>`).join("")}
            </select>
            <label>Sebep</label>
            <input type="text" name="reason" placeholder="Kick sebebi..." />
            <button type="submit" class="btn" style="background:#f59e0b;">Üyeyi At</button>
          </form>
        </div>
      </div>

      <script>
        document.getElementById('banForm').addEventListener('submit', async (e) => {
          e.preventDefault();
          const formData = new FormData(e.target);
          const res = await fetch('/api/action/ban', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: formData.get('userId'), reason: formData.get('reason') })
          });
          const data = await res.json();
          alert(data.message || (data.success ? 'Başarıyla banlandı.' : 'İşlem başarısız.'));
          location.reload();
        });

        document.getElementById('kickForm').addEventListener('submit', async (e) => {
          e.preventDefault();
          const formData = new FormData(e.target);
          const res = await fetch('/api/action/kick', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: formData.get('userId'), reason: formData.get('reason') })
          });
          const data = await res.json();
          alert(data.message || (data.success ? 'Başarıyla atıldı.' : 'İşlem başarısız.'));
          location.reload();
        });
      </script>
    </body>
    </html>
  `);
});

// Ses Kontrolü Sayfası
app.get("/panel/voice", checkAuth, async (req, res) => {
  const guild = client.guilds.cache.first();
  let voiceChannels = [];
  if (guild) {
    try {
      await guild.members.fetch();
      voiceChannels = guild.channels.cache.filter(c => c.isVoiceBased()).map(c => ({
        id: c.id,
        name: c.name,
        members: c.members.map(m => ({ 
          id: m.id, 
          tag: m.user.tag, 
          deaf: m.voice.serverDeaf || m.voice.selfDeaf, 
          mute: m.voice.serverMute || m.voice.selfMute 
        }))
      }));
    } catch {}
  }

  res.send(`
    <!DOCTYPE html>
    <html lang="tr">
    <head>
      <meta charset="UTF-8">
      <title>Ses Kontrolü — Vazgucxn Panel</title>
      <style>
        * { box-sizing: border-box; }
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #050b14; color: #e2e8f0; margin: 0; padding: 0; display: flex; }
        sidebar { width: 260px; background: #0b1a3a; height: 100vh; position: fixed; padding: 25px 20px; border-right: 1px solid #1a3668; display: flex; flex-direction: column; }
        sidebar h2 { font-size: 18px; color: #60a5fa; margin-top: 0; margin-bottom: 30px; }
        sidebar a { color: #94a3b8; text-decoration: none; padding: 10px 14px; border-radius: 6px; margin-bottom: 6px; display: block; font-weight: 500; transition: 0.2s; }
        sidebar a:hover, sidebar a.active { background: #1e3a8a; color: #fff; }
        .main { margin-left: 260px; padding: 40px; width: calc(100% - 260px); max-width: 1400px; }
        .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 35px; border-bottom: 1px solid #1e293b; padding-bottom: 20px; }
        .header h1 { margin: 0; font-size: 24px; color: #f8fafc; }
        .section { background: #0b1a3a; padding: 25px; border-radius: 10px; border: 1px solid #1a3668; margin-bottom: 30px; }
        .section h2 { margin-top: 0; color: #60a5fa; font-size: 18px; border-bottom: 1px solid #1e3a8a; padding-bottom: 10px; }
        table { width: 100%; border-collapse: collapse; margin-top: 15px; }
        th, td { padding: 12px; text-align: left; border-bottom: 1px solid #1e293b; font-size: 14px; }
        th { color: #94a3b8; }
        .btn { background: #3b82f6; color: #fff; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-weight: 600; font-size: 12px; transition: 0.2s; text-decoration: none; display: inline-block; margin-right: 4px; }
        .btn:hover { background: #2563eb; }
        .btn-danger { background: #ef4444; }
        .btn-danger:hover { background: #dc2626; }
        .btn-success { background: #10b981; }
        .btn-success:hover { background: #059669; }
      </style>
    </head>
    <body>
      <sidebar>
        <h2>🛡️ Vazgucxn Panel</h2>
        <a href="/panel">📊 Genel Bakış</a>
        <a href="/panel/moderation">🔨 Moderasyon</a>
        <a href="/panel/voice" class="active">🎧 Ses Kontrolü</a>
        <a href="/panel/fivem">🎮 FiveM Sorgu & Tag</a>
        <a href="/logout" style="margin-top:auto; color:#ef4444;">🚪 Çıkış Yap</a>
      </sidebar>

      <div class="main">
        <div class="header">
          <h1>Ses Kanalı Üye Kontrolü (Mute, Deafen, Yönet)</h1>
        </div>

        <div class="section">
          <h2>🔊 Ses Kanallarındaki Aktif Üyeler</h2>
          ${voiceChannels.length === 0 ? '<p>Aktif ses kanalında kimse bulunmuyor.</p>' : voiceChannels.map(vc => `
            <h3 style="color:#60a5fa; margin-top:20px;">📁 ${vc.name} (${vc.members.length} kişi)</h3>
            ${vc.members.length === 0 ? '<p style="color:#94a3b8; font-size:13px;">Boş kanal</p>' : `
              <table>
                <thead>
                  <tr>
                    <th>Kullanıcı</th>
                    <th>Durum</th>
                    <th>İşlemler</th>
                  </tr>
                </thead>
                <tbody>
                  ${vc.members.map(m => `
                    <tr>
                      <td>${m.tag} <code style="color:#94a3b8;">(${m.id})</code></td>
                      <td>${m.mute ? '🔴 Mute' : '🟢 Sesli'} | ${m.deaf ? '🔇 Sağır' : '🔊 Duyuyor'}</td>
                      <td>
                        <button class="btn btn-danger" onclick="voiceAction('${m.id}', 'mute')">Mutele</button>
                        <button class="btn btn-success" onclick="voiceAction('${m.id}', 'unmute')">Mute Aç</button>
                        <button class="btn btn-danger" onclick="voiceAction('${m.id}', 'deaf')">Sağırlaştır</button>
                        <button class="btn btn-success" onclick="voiceAction('${m.id}', 'undeaf')">Sağır Aç</button>
                        <button class="btn" style="background:#f59e0b;" onclick="voiceAction('${m.id}', 'disconnect')">Sesten At</button>
                      </td>
                    </tr>
                  `).join("")}
                </tbody>
              </table>
            `}
          `).join("")}
        </div>
      </div>

      <script>
        async function voiceAction(userId, action) {
          const res = await fetch('/api/action/voice', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, action })
          });
          const data = await res.json();
          alert(data.message || (data.success ? 'İşlem başarılı.' : 'İşlem başarısız.'));
          location.reload();
        }
      </script>
    </body>
    </html>
  `);
});

// FiveM Sorgu & Tag Sayfası
app.get("/panel/fivem", checkAuth, async (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="tr">
    <head>
      <meta charset="UTF-8">
      <title>FiveM Sorgu — Vazgucxn Panel</title>
      <style>
        * { box-sizing: border-box; }
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #050b14; color: #e2e8f0; margin: 0; padding: 0; display: flex; }
        sidebar { width: 260px; background: #0b1a3a; height: 100vh; position: fixed; padding: 25px 20px; border-right: 1px solid #1a3668; display: flex; flex-direction: column; }
        sidebar h2 { font-size: 18px; color: #60a5fa; margin-top: 0; margin-bottom: 30px; }
        sidebar a { color: #94a3b8; text-decoration: none; padding: 10px 14px; border-radius: 6px; margin-bottom: 6px; display: block; font-weight: 500; transition: 0.2s; }
        sidebar a:hover, sidebar a.active { background: #1e3a8a; color: #fff; }
        .main { margin-left: 260px; padding: 40px; width: calc(100% - 260px); max-width: 1400px; }
        .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 35px; border-bottom: 1px solid #1e293b; padding-bottom: 20px; }
        .header h1 { margin: 0; font-size: 24px; color: #f8fafc; }
        .section { background: #0b1a3a; padding: 25px; border-radius: 10px; border: 1px solid #1a3668; margin-bottom: 30px; }
        .section h2 { margin-top: 0; color: #60a5fa; font-size: 18px; border-bottom: 1px solid #1e3a8a; padding-bottom: 10px; }
        .btn { background: #3b82f6; color: #fff; border: none; padding: 10px 18px; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 14px; transition: 0.2s; }
        .btn:hover { background: #2563eb; }
        input { background: #050b14; border: 1px solid #334155; color: #fff; padding: 10px 14px; border-radius: 6px; width: 100%; margin-top: 6px; margin-bottom: 15px; font-size: 14px; }
        label { font-size: 13px; color: #94a3b8; font-weight: 600; }
        pre { background: #050b14; padding: 15px; border-radius: 6px; border: 1px solid #334155; color: #34d399; overflow-x: auto; font-family: monospace; }
      </style>
    </head>
    <body>
      <sidebar>
        <h2>🛡️ Vazgucxn Panel</h2>
        <a href="/panel">📊 Genel Bakış</a>
        <a href="/panel/moderation">🔨 Moderasyon</a>
        <a href="/panel/voice">🎧 Ses Kontrolü</a>
        <a href="/panel/fivem" class="active">🎮 FiveM Sorgu & Tag</a>
        <a href="/logout" style="margin-top:auto; color:#ef4444;">🚪 Çıkış Yap</a>
      </sidebar>

      <div class="main">
        <div class="header">
          <h1>FiveM ID & Tag Sorgulama</h1>
        </div>

        <div class="section">
          <h2>🔍 ID ile Oyuncu Sorgula</h2>
          <form id="idForm">
            <label>Oyuncu ID (In-game ID)</label>
            <input type="number" name="playerId" placeholder="Örn: 14" required min="0" />
            <button type="submit" class="btn">Sorgula</button>
          </form>
          <pre id="idResult">Sonuç burada görünecek...</pre>
        </div>

        <div class="section">
          <h2>🔎 Tag / İsim ile Oyuncu Ara</h2>
          <form id="tagForm">
            <label>Arama Metni</label>
            <input type="text" name="search" placeholder="Örn: kaisen" required />
            <button type="submit" class="btn">Ara</button>
          </form>
          <pre id="tagResult">Sonuç burada görünecek...</pre>
        </div>
      </div>

      <script>
        document.getElementById('idForm').addEventListener('submit', async (e) => {
          e.preventDefault();
          const formData = new FormData(e.target);
          const res = await fetch('/api/fivem/id?id=' + formData.get('playerId'));
          const data = await res.json();
          document.getElementById('idResult').textContent = JSON.stringify(data, null, 2);
        });

        document.getElementById('tagForm').addEventListener('submit', async (e) => {
          e.preventDefault();
          const formData = new FormData(e.target);
          const res = await fetch('/api/fivem/tag?q=' + encodeURIComponent(formData.get('search')));
          const data = await res.json();
          document.getElementById('tagResult').textContent = JSON.stringify(data, null, 2);
        });
      </script>
    </body>
    </html>
  `);
});

// Panel API Endpoints (Ban, Kick, Voice Mute/Deaf, FiveM)
app.post("/api/action/ban", checkAuth, async (req, res) => {
  const { userId, reason } = req.body;
  const guild = client.guilds.cache.first();
  if (!guild) return res.json({ success: false, message: "Sunucu bulunamadı." });
  try {
    await guild.members.ban(userId, { reason: reason || "Web panel üzerinden banlandı" });
    res.json({ success: true, message: "Kullanıcı başarıyla banlandı." });
  } catch (e) {
    res.json({ success: false, message: e.message });
  }
});

app.post("/api/action/kick", checkAuth, async (req, res) => {
  const { userId, reason } = req.body;
  const guild = client.guilds.cache.first();
  if (!guild) return res.json({ success: false, message: "Sunucu bulunamadı." });
  try {
    const member = await guild.members.fetch(userId);
    await member.kick(reason || "Web panel üzerinden atıldı");
    res.json({ success: true, message: "Kullanıcı başarıyla atıldı." });
  } catch (e) {
    res.json({ success: false, message: e.message });
  }
});

app.post("/api/action/voice", checkAuth, async (req, res) => {
  const { userId, action } = req.body;
  const guild = client.guilds.cache.first();
  if (!guild) return res.json({ success: false, message: "Sunucu bulunamadı." });
  try {
    const member = await guild.members.fetch(userId);
    if (!member.voice.channel) return res.json({ success: false, message: "Kullanıcı ses kanalında değil." });

    if (action === 'mute') await member.voice.setMute(true);
    else if (action === 'unmute') await member.voice.setMute(false);
    else if (action === 'deaf') await member.voice.setDeaf(true);
    else if (action === 'undeaf') await member.voice.setDeaf(false);
    else if (action === 'disconnect') await member.voice.disconnect();

    res.json({ success: true, message: "Ses işlemi başarıyla uygulandı." });
  } catch (e) {
    res.json({ success: false, message: e.message });
  }
});

app.get("/api/fivem/id", checkAuth, async (req, res) => {
  const playerId = req.query.id;
  try {
    const data = await getPlayerFromCFX(playerId);
    res.json(data);
  } catch (e) {
    res.json({ found: false, error: e.message });
  }
});

app.get("/api/fivem/tag", checkAuth, async (req, res) => {
  const query = (req.query.q || "").toLowerCase();
  try {
    const json = await getServerPlayersCached();
    const players = json?.Data?.players || [];
    const matched = players.filter((p) => cleanFiveMName(p.name).includes(query));
    res.json({ count: matched.length, players: matched.slice(0, 30) });
  } catch (e) {
    res.json({ count: 0, error: e.message });
  }
});

app.get("/health", (req, res) => res.status(200).send("OK"));

// ===================== GUARD SİSTEMİ =====================
function isGuardOwner(id) {
  return isOwner(id) || whitelist.has(id);
}
function saveGuard() { saveJSON(GUARD_FILE, guardConfig); }
function saveWhitelist() { saveJSON(WHITELIST_FILE, Array.from(whitelist)); }
function saveStaff() { saveJSON(STAFF_FILE, Array.from(staffIds)); }
function saveConfig() { saveJSON(CONFIG_FILE, config); }

// ===================== FiveM Cache =====================
let lastPlayersFetchAt = 0;
let cachedPlayersJson = null;

async function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await _fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function cleanFiveMName(name = "") {
  return String(name).replace(/\^\d/g, "").toLowerCase();
}

async function getServerPlayersCached() {
  const now = Date.now();
  if (cachedPlayersJson && now - lastPlayersFetchAt < 30000) return cachedPlayersJson;

  const url = `https://servers-frontend.fivem.net/api/servers/single/${CFX_CODE}`;
  const res = await fetchWithTimeout(url, {}, 5000);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const json = await res.json();
  cachedPlayersJson = json;
  lastPlayersFetchAt = now;
  return json;
}

async function getPlayerFromCFX(playerId) {
  const json = await getServerPlayersCached();
  const players = json?.Data?.players || [];
  const p = players.find((x) => String(x.id) === String(playerId));
  if (!p) return { found: false };

  const ids = Array.isArray(p.identifiers) ? p.identifiers : [];
  return {
    found: true,
    id: p.id,
    name: p.name,
    ping: p.ping,
    steam: ids.find((i) => i.startsWith("steam:")) || "Yok",
    discord: ids.find((i) => i.startsWith("discord:"))?.replace("discord:", "") || "Yok"
  };
}

// ===================== Aktivite Takip =====================
function ensureActivity(id) {
  if (!activityStats.has(id)) {
    activityStats.set(id, { lastMessageAt: null, lastVoiceJoinAt: null, ingameCount: 0 });
  }
  return activityStats.get(id);
}
function touchLastMessage(id) { ensureActivity(id).lastMessageAt = Date.now(); }
function touchLastVoiceJoin(id) { ensureActivity(id).lastVoiceJoinAt = Date.now(); }

function getCounterBucket(guildId) {
  if (!guardCounters.has(guildId)) guardCounters.set(guildId, new Map());
  return guardCounters.get(guildId);
}
function ensureUserCounter(guildId, userId) {
  const bucket = getCounterBucket(guildId);
  if (!bucket.has(userId)) {
    bucket.set(userId, { ban: 0, kick: 0, channel: 0, role: 0, lastReset: Date.now() });
  }
  return bucket.get(userId);
}
function maybeResetWindow(counter) {
  const windowMs = Math.max(1, Number(guardConfig.windowMinutes || 10)) * 60 * 1000;
  if (Date.now() - counter.lastReset >= windowMs) {
    counter.ban = 0; counter.kick = 0; counter.channel = 0; counter.role = 0;
    counter.lastReset = Date.now();
  }
}
function isGuardEnabled(systemKey) {
  if (!guardConfig.enabled) return false;
  if (!guardConfig.systems?.[systemKey]) return false;
  return true;
}
function getLimit(key) {
  const n = Number(guardConfig.limits?.[key] ?? 0);
  return Number.isNaN(n) ? 0 : Math.max(0, Math.floor(n));
}

function baseEmbed(guild) {
  const authorIcon = guild?.iconURL?.({ size: 128 }) || undefined;
  return new EmbedBuilder()
    .setColor(NAVY)
    .setThumbnail(BOT_IMAGE_URL || null)
    .setAuthor({ name: PANEL_AUTHOR, iconURL: authorIcon })
    .setFooter({ text: FOOTER_TEXT, iconURL: authorIcon })
    .setTimestamp();
}
function createEmbed(guild, { title, description, fields, image }) {
  const e = baseEmbed(guild);
  if (title) e.setTitle(title);
  if (description) e.setDescription(description);
  if (fields?.length) e.addFields(fields);
  if (image) e.setImage(image);
  return e;
}
async function replyE(interaction, embed, ephemeral = false) {
  const payload = { embeds: [embed] };
  if (ephemeral) payload.flags = 64;
  if (interaction.deferred || interaction.replied) return interaction.editReply(payload).catch(() => {});
  return interaction.reply(payload).catch(() => {});
}
async function sendLog(guild, embed) {
  const ch = guild.channels.cache.get(config.logs?.guardLog || config.logChannelId);
  if (ch) ch.send({ embeds: [embed] }).catch(() => {});
}
function noPerm(interaction) {
  return replyE(interaction, createEmbed(interaction.guild, {
    title: line(EMOJI.lock, "ʏᴇᴛᴋɪ ʏᴏᴋ"),
    description: line(EMOJI.warn, "Bu komutu kullanma yetkin yok.")
  }), false);
}

function guardPanelEmbed(guild) {
  const on = `${EMOJI.success} ・ **AÇIK**`;
  const off = `${EMOJI.warn} ・ **KAPALI**`;
  const win = Math.max(1, Number(guardConfig.windowMinutes || 10));

  return createEmbed(guild, {
    title: line(EMOJI.shield, "ɢᴜᴀʀᴅ ᴘᴀɴᴇʟ"),
    description:
      `${EMOJI.settings} ・ **Sistem Durumu**\n` +
      `${EMOJI.ban} ・ Ban Guard: ${isGuardEnabled("ban") ? on : off}\n` +
      `${EMOJI.kick} ・ Kick Guard: ${isGuardEnabled("kick") ? on : off}\n` +
      `${EMOJI.trash} ・ Kanal Guard: ${isGuardEnabled("channel") ? on : off}\n` +
      `${EMOJI.crown} ・ Rol Guard: ${isGuardEnabled("role") ? on : off}\n\n` +
      `${EMOJI.info} ・ **Limitler (/${win} dk)**\n` +
      `${EMOJI.ban} ・ Ban Limit: **${getLimit("ban")}**\n` +
      `${EMOJI.kick} ・ Kick Limit: **${getLimit("kick")}**\n` +
      `${EMOJI.trash} ・ Kanal Silme Limit: **${getLimit("channel")}**\n` +
      `${EMOJI.crown} ・ Rol Silme Limit: **${getLimit("role")}**\n\n` +
      `${EMOJI.shield} ・ **Whitelist:** ${whitelist.size} kişi\n\n` +
      `${EMOJI.right} ・ Komutlar: \`/guard panel\` \`/guard limit\` \`/guard sistem\` \`/guard whitelist\``,
    image: BOT_IMAGE_URL || undefined
  });
}

async function fetchExecutor(guild, type) {
  try {
    const logs = await guild.fetchAuditLogs({ limit: 1, type });
    return logs.entries.first() || null;
  } catch {
    return null;
  }
}
async function punishMember(guild, userId, reason) {
  try {
    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) return false;
    if (isGuardOwner(member.id)) return false;
    await member.kick(reason).catch(() => {});
    return true;
  } catch {
    return false;
  }
}
async function guardHit(guild, executorId, key, reasonText) {
  if (!guild || !executorId) return;
  if (isGuardOwner(executorId)) return;

  const limit = getLimit(key);
  if (limit === 0) return;

  const counter = ensureUserCounter(guild.id, executorId);
  maybeResetWindow(counter);
  counter[key] = (counter[key] || 0) + 1;

  await sendLog(guild, createEmbed(guild, {
    title: line(EMOJI.warn, "ɢᴜᴀʀᴅ ᴀʟᴀʀᴍ"),
    description:
      `${EMOJI.info} ・ İşlem: **${key.toUpperCase()}**\n` +
      `${EMOJI.right} ・ Yapan: <@${executorId}>\n` +
      `${EMOJI.settings} ・ Sayaç: **${counter[key]}/${limit}**\n` +
      `${EMOJI.warn} ・ Sebep: **${reasonText}**`,
    image: BOT_IMAGE_URL || undefined
  }));

  if (counter[key] >= limit) {
    const punished = await punishMember(guild, executorId, `GUARD: ${reasonText} (limit aşıldı)`);
    await sendLog(guild, createEmbed(guild, {
      title: line(EMOJI.lock, "ɢᴜᴀʀᴅ ᴍᴜᴅᴀʜᴀʟᴇ"),
      description:
        `${EMOJI.success} ・ Limit aşıldı, işlem uygulandı.\n` +
        `${EMOJI.right} ・ Yapan: <@${executorId}>\n` +
        `${EMOJI.settings} ・ Sistem: **${key.toUpperCase()}**\n` +
        `${EMOJI.info} ・ Sonuç: **${punished ? "Kick uygulandı" : "Üye bulunamadı / yetki yok"}**`,
      image: BOT_IMAGE_URL || undefined
    }));
  }
}

client.on("guildBanAdd", async (ban) => {
  try {
    const guild = ban.guild;
    if (!isGuardEnabled("ban")) return;
    const entry = await fetchExecutor(guild, 22);
    if (!entry?.executor?.id) return;
    if (entry.target?.id && String(entry.target.id) !== String(ban.user.id)) return;
    await guardHit(guild, entry.executor.id, "ban", `Üye banlandı: ${ban.user.tag}`);
  } catch {}
});
client.on("guildMemberRemove", async (member) => {
  try {
    const guild = member.guild;
    if (!isGuardEnabled("kick")) return;
    const entry = await fetchExecutor(guild, 20);
    if (!entry?.executor?.id) return;
    if (entry.target?.id && String(entry.target.id) !== String(member.id)) return;
    await guardHit(guild, entry.executor.id, "kick", `Üye kicklendi: ${member.user.tag}`);
  } catch {}
});
client.on("channelDelete", async (channel) => {
  try {
    const guild = channel.guild;
    if (!guild || !isGuardEnabled("channel")) return;
    const entry = await fetchExecutor(guild, 12);
    if (!entry?.executor?.id) return;
    if (entry.target?.id && String(entry.target.id) !== String(channel.id)) return;
    await guardHit(guild, entry.executor.id, "channel", `Kanal silindi: #${channel.name}`);
  } catch {}
});
client.on("roleDelete", async (role) => {
  try {
    const guild = role.guild;
    if (!guild || !isGuardEnabled("role")) return;
    const entry = await fetchExecutor(guild, 32);
    if (!entry?.executor?.id) return;
    if (entry.target?.id && String(entry.target.id) !== String(role.id)) return;
    await guardHit(guild, entry.executor.id, "role", `Rol silindi: ${role.name}`);
  } catch {}
});

// ===================== LOG EVENTS =====================
client.on("guildBanAdd", async (ban) => {
  const ch = ban.guild.channels.cache.get(config.logs?.banLog);
  if (!ch) return;
  ch.send({ embeds: [createEmbed(ban.guild, {
    title: line(EMOJI.ban, "ʙᴀɴ ʟᴏɢ"),
    description: `${EMOJI.info} ・ Kullanıcı: ${ban.user}\n${EMOJI.right} ・ ID: ${ban.user.id}`
  })] }).catch(() => {});
});
client.on("guildMemberRemove", async (member) => {
  const logs = await member.guild.fetchAuditLogs({ limit: 1, type: 20 }).catch(() => null);
  const entry = logs?.entries?.first();
  if (!entry || entry.action !== 20) return;
  const ch = member.guild.channels.cache.get(config.logs?.kickLog);
  if (!ch) return;
  ch.send({ embeds: [createEmbed(member.guild, {
    title: line(EMOJI.kick, "ᴋɪᴄᴋ ʟᴏɢ"),
    description: `${EMOJI.info} ・ Atılan: ${member.user}\n${EMOJI.right} ・ Yetkili: ${entry.executor}`
  })] }).catch(() => {});
});
client.on("channelDelete", async (channel) => {
  const ch = channel.guild.channels.cache.get(config.logs?.channelLog);
  if (!ch) return;
  ch.send({ embeds: [createEmbed(channel.guild, {
    title: line(EMOJI.warn, "ᴋᴀɴᴀʟ ꜱɪʟɪɴᴅɪ"),
    description: `${EMOJI.info} ・ İsim: ${channel.name}\n${EMOJI.right} ・ ID: ${channel.id}`
  })] }).catch(() => {});
});
client.on("roleDelete", async (role) => {
  const ch = role.guild.channels.cache.get(config.logs?.roleLog);
  if (!ch) return;
  ch.send({ embeds: [createEmbed(role.guild, {
    title: line(EMOJI.crown, "ʀᴏʟ ꜱɪʟɪɴᴅɪ"),
    description: `${EMOJI.info} ・ İsim: ${role.name}\n${EMOJI.right} ・ ID: ${role.id}`
  })] }).catch(() => {});
});

client.on("messageCreate", (message) => {
  if (!message.guild || message.author.bot) return;
  touchLastMessage(message.author.id);
});

client.on("voiceStateUpdate", (oldState, newState) => {
  try {
    const member = newState.member;
    if (!member || member.user.bot) return;
    if (!oldState.channelId && newState.channelId) {
      touchLastVoiceJoin(member.id);
    }
  } catch {}
});

// ===================== TICKET SİSTEMİ =====================
function isTicketOpen() {
  return (config.ticketDurum || "acik") === "acik";
}
function ticketPanelEmbed(guild) {
  const acik = isTicketOpen();
  const durumKutusu = "```\n[ DURUM: " + (acik ? "AKTİF" : "KAPALI") + " ]\n```";
  const aciklama = (config.ticketPanelMesaji || "").trim() ||
    "Sende kazananların tarafında olmak istiyorsan başvuru oluştur butonuna tıkla!";
  return createEmbed(guild, {
    title: config.ticketPanelBaslik || `${guild.name} | Başvuru Sistemi`,
    description: `${durumKutusu}\n${aciklama}`,
    image: TICKET_BANNER_URL || undefined
  });
}
function ticketPanelRow() {
  const acik = isTicketOpen();
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("ticket_open")
      .setStyle(ButtonStyle.Primary)
      .setLabel(acik ? "Başvuru Oluştur" : "Başvurular Kapalı")
      .setEmoji("📝")
      .setDisabled(!acik)
  );
}

async function refreshTicketPanelMessage(guild) {
  if (!config.ticketPanelChannelId || !config.ticketPanelMessageId) return false;
  try {
    const ch = await guild.channels.fetch(config.ticketPanelChannelId).catch(() => null);
    if (!ch) return false;
    const msg = await ch.messages.fetch(config.ticketPanelMessageId).catch(() => null);
    if (!msg) return false;
    await msg.edit({ embeds: [ticketPanelEmbed(guild)], components: [ticketPanelRow()] });
    return true;
  } catch {
    return false;
  }
}

async function handleTicketOpen(interaction) {
  const guild = interaction.guild;
  await interaction.deferReply({ flags: 64 });
  if (!isTicketOpen()) return interaction.editReply(`${EMOJI.warn} ・ Başvurular şu an kapalı.`);
  if (!config.ticketCategoryId || !config.ticketStaffRoleId) return interaction.editReply("Ticket sistemi ayarlı değil.");

  const category = guild.channels.cache.get(config.ticketCategoryId);
  if (!category) return interaction.editReply("Ticket kategorisi geçersiz.");

  const safe = (interaction.user.username || "user").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 12);
  const name = `basvuru-${safe}`;
  const existing = guild.channels.cache.find((c) => c.parentId === category.id && c.name === name);
  if (existing) return interaction.editReply(`Zaten açık ticketin var: ${existing}`);

  const ch = await guild.channels.create({
    name,
    parent: category.id,
    type: ChannelType.GuildText,
    permissionOverwrites: [
      { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
      { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
      { id: config.ticketStaffRoleId, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
    ]
  });
  ticketOwners.set(ch.id, interaction.user.id);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`basvuru_kabul_${interaction.user.id}`).setLabel("Kabul Et").setStyle(ButtonStyle.Success).setEmoji(EMOJI.success),
    new ButtonBuilder().setCustomId(`basvuru_reddet_${interaction.user.id}`).setLabel("Reddet").setStyle(ButtonStyle.Danger).setEmoji(EMOJI.warn),
    new ButtonBuilder().setCustomId("ticket_close").setLabel("Kapat & Sil").setStyle(ButtonStyle.Secondary).setEmoji(EMOJI.lock)
  );

  const basvuruFormu = `> **_Günde kaç saat aktif olabilirsin?:_**\n> **_Kaç yaşındasın?:_**\n> **_Oynadığın ekipler:_**\n> **_FiveM'de kaç saatin var?:_**\n> **_Gelişmiş map bilgin var mı?:_**\n> **_En az 5/10 adet kill POV (zorunlu):_**`;

  await ch.send({
    content: `<@${interaction.user.id}> | <@&${config.ticketStaffRoleId}>`,
    embeds: [createEmbed(guild, {
      title: `Hoş Geldin, ${interaction.user.username}`,
      description: `**Başvuru Formu**\n\n*Alttaki formu doldurup yetkili arkadaşların cevap vermesini beklemeden lütfen formu iletiniz.*\n\n${basvuruFormu}`,
      image: TICKET_BANNER_URL || undefined
    })],
    components: [row]
  });

  return interaction.editReply(`✅ Ticket açıldı: ${ch}`);
}

async function handleBasvuruKarar(interaction, kabul) {
  const guild = interaction.guild;
  const isAdmin = interaction.member.permissions.has(PermissionsBitField.Flags.Administrator);
  if (!isStaff(interaction.user.id) && !isAdmin) return interaction.reply({ content: "❌ Bu işlemi yapma yetkin yok.", flags: 64 });
  await interaction.deferReply({ flags: 64 });

  const applicantId = interaction.customId.replace(kabul ? "basvuru_kabul_" : "basvuru_reddet_", "");
  const member = await guild.members.fetch(applicantId).catch(() => null);
  if (kabul && !member) return interaction.editReply("❌ Başvuru sahibi sunucuda bulunamadı.");

  if (kabul) {
    const rolesToAdd = [];
    if (config.ekipRoleId && guild.roles.cache.has(config.ekipRoleId)) rolesToAdd.push(config.ekipRoleId);
    if (config.newRoleId && guild.roles.cache.has(config.newRoleId)) rolesToAdd.push(config.newRoleId);
    if (rolesToAdd.length) await member.roles.add(rolesToAdd).catch(() => {});
  }

  const disabledRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("basvuru_kabul_done").setLabel(kabul ? "Kabul Edildi" : "Kabul Et").setStyle(ButtonStyle.Success).setEmoji(EMOJI.success).setDisabled(true),
    new ButtonBuilder().setCustomId("basvuru_reddet_done").setLabel(kabul ? "Reddet" : "Reddedildi").setStyle(ButtonStyle.Danger).setEmoji(EMOJI.warn).setDisabled(true),
    new ButtonBuilder().setCustomId("ticket_close").setLabel("Kapat & Sil").setStyle(ButtonStyle.Secondary).setEmoji(EMOJI.lock)
  );
  await interaction.message.edit({ components: [disabledRow] }).catch(() => {});

  await interaction.channel.send({
    embeds: [createEmbed(guild, {
      title: kabul ? line(EMOJI.success, "ʙᴀşᴠᴜʀᴜ ᴋᴀʙᴜʟ ᴇᴅɪʟᴅɪ") : line(EMOJI.warn, "ʙᴀşᴠᴜʀᴜ ʀᴇᴅᴅᴇᴅɪʟᴅɪ"),
      description: kabul
        ? `${EMOJI.success} ・ ${member} adlı kullanıcının başvurusu **kabul edildi** (<@${interaction.user.id}> tarafından).`
        : `${EMOJI.warn} ・ Başvuru **reddedildi** (<@${interaction.user.id}> tarafından).`
    })]
  }).catch(() => {});

  if (member) {
    await member.send({
      embeds: [createEmbed(guild, {
        title: kabul ? line(EMOJI.success, "ʙᴀşᴠᴜʀᴜɴ ᴋᴀʙᴜʟ ᴇᴅɪʟᴅɪ") : line(EMOJI.warn, "ʙᴀşᴠᴜʀᴜɴ ʀᴇᴅᴅᴇᴅɪʟᴅɪ"),
        description: kabul
          ? `${EMOJI.success} ・ Tebrikler! **${guild.name}** sunucusundaki başvurun kabul edildi.`
          : `${EMOJI.warn} ・ **${guild.name}** sunucusundaki başvurun reddedildi.`
      })]
    }).catch(() => {});
  }

  return interaction.editReply(kabul ? "✅ Başvuru kabul edildi." : "🔴 Başvuru reddedildi.");
}

async function handleTicketClose(interaction) {
  await interaction.deferReply({ flags: 64 });
  const opener = ticketOwners.get(interaction.channel.id);
  const admin = interaction.member.permissions.has(PermissionsBitField.Flags.Administrator);
  if (interaction.user.id !== opener && !admin && !isStaff(interaction.user.id)) return interaction.editReply("Yetkin yok.");
  await interaction.channel.delete().catch(() => {});
  ticketOwners.delete(interaction.channel.id);
}

// ===================== SLASH KOMUTLARI =====================
const commands = [
  new SlashCommandBuilder()
    .setName("guard")
    .setDescription("Guard (anti-nuke) sistemi yönetimi")
    .addSubcommand((s) => s.setName("panel").setDescription("Guard panelini gösterir"))
    .addSubcommand((s) => s
      .setName("limit")
      .setDescription("Bir guard sisteminin limitini ayarlar")
      .addStringOption((o) => o.setName("sistem").setDescription("Sistem").setRequired(true)
        .addChoices({ name: "Ban", value: "ban" }, { name: "Kick", value: "kick" }, { name: "Kanal", value: "channel" }, { name: "Rol", value: "role" }))
      .addIntegerOption((o) => o.setName("miktar").setDescription("Yeni limit").setRequired(true).setMinValue(0)))
    .addSubcommand((s) => s
      .setName("sistem")
      .setDescription("Bir guard sistemini açar/kapatır")
      .addStringOption((o) => o.setName("sistem").setDescription("Sistem").setRequired(true)
        .addChoices({ name: "Ban", value: "ban" }, { name: "Kick", value: "kick" }, { name: "Kanal", value: "channel" }, { name: "Rol", value: "role" }))
      .addBooleanOption((o) => o.setName("durum").setDescription("Açık mı?").setRequired(true)))
    .addSubcommand((s) => s
      .setName("whitelist")
      .setDescription("Guard'dan muaf kullanıcıları yönetir")
      .addStringOption((o) => o.setName("islem").setDescription("İşlem").setRequired(true)
        .addChoices({ name: "Ekle", value: "ekle" }, { name: "Kaldır", value: "kaldir" }, { name: "Liste", value: "liste" }))
      .addUserOption((o) => o.setName("kullanici").setDescription("Kullanıcı"))),

  new SlashCommandBuilder()
    .setName("setup")
    .setDescription("Log kanallarını otomatik kurar")
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),

  new SlashCommandBuilder()
    .setName("logkanal")
    .setDescription("Guard alarmlarının düşeceği kanal")
    .addChannelOption((o) => o.setName("kanal").setDescription("Kanal").setRequired(true).addChannelTypes(ChannelType.GuildText)),

  new SlashCommandBuilder()
    .setName("ticket")
    .setDescription("Ticket / Başvuru sistemi yönetimi")
    .addSubcommand((s) => s.setName("kategori").setDescription("Kategori ayarla").addChannelOption((o) => o.setName("kategori").setDescription("Kategori").setRequired(true).addChannelTypes(ChannelType.GuildCategory)))
    .addSubcommand((s) => s.setName("panel").setDescription("Panel gönder").addRoleOption((o) => o.setName("yetkili_rol").setDescription("Yetkili rol").setRequired(true)))
    .addSubcommand((s) => s.setName("ekiprol").setDescription("Ekip rolü").addRoleOption((o) => o.setName("rol").setDescription("Rol").setRequired(true)))
    .addSubcommand((s) => s.setName("yenirol").setDescription("Yeni rol").addRoleOption((o) => o.setName("rol").setDescription("Rol").setRequired(true)))
    .addSubcommand((s) => s.setName("durum").setDescription("Durum değiştir").addStringOption((o) => o.setName("durum").setDescription("Durum").setRequired(true).addChoices({ name: "Aktif", value: "acik" }, { name: "Kapalı", value: "kapali" }))),

  new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Üye banla")
    .addUserOption((o) => o.setName("kullanici").setDescription("Kullanıcı").setRequired(true))
    .addStringOption((o) => o.setName("sebep").setDescription("Sebep").setRequired(false)),

  new SlashCommandBuilder()
    .setName("kick")
    .setDescription("Üye at")
    .addUserOption((o) => o.setName("kullanici").setDescription("Kullanıcı").setRequired(true))
    .addStringOption((o) => o.setName("sebep").setDescription("Sebep").setRequired(false)),

  new SlashCommandBuilder()
    .setName("ses")
    .setDescription("Ses işlemleri")
    .addSubcommand((s) => s.setName("gir").setDescription("Botu sese sokar")),

  new SlashCommandBuilder()
    .setName("sestopla")
    .setDescription("Herkesi yanına toplar"),

  new SlashCommandBuilder()
    .setName("nuke")
    .setDescription("Kanalı temizler"),

  new SlashCommandBuilder()
    .setName("ingame")
    .setDescription("Kadro paneli")
    .addSubcommand((s) => s.setName("olustur").setDescription("Oluştur").addStringOption((o) => o.setName("baslik").setDescription("Başlık").setRequired(true)).addIntegerOption((o) => o.setName("limit").setDescription("Limit").setRequired(true).setMinValue(1)).addStringOption((o) => o.setName("sure").setDescription("Süre").setRequired(false)))
    .addSubcommand((s) => s.setName("iptal").setDescription("İptal et")),

  new SlashCommandBuilder()
    .setName("yetkili")
    .setDescription("Yetkili yönetimi")
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
    .addSubcommand((s) => s.setName("ekle").setDescription("Ekle").addUserOption((o) => o.setName("kullanici").setDescription("Kullanıcı").setRequired(true)))
    .addSubcommand((s) => s.setName("kaldir").setDescription("Kaldır").addUserOption((o) => o.setName("kullanici").setDescription("Kullanıcı").setRequired(true)))
    .addSubcommand((s) => s.setName("liste").setDescription("Liste")),

  new SlashCommandBuilder()
    .setName("id")
    .setDescription("FiveM ID sorgula")
    .addIntegerOption((o) => o.setName("oyuncu_id").setDescription("ID").setRequired(true).setMinValue(0)),

  new SlashCommandBuilder()
    .setName("tag")
    .setDescription("FiveM tag ara")
    .addStringOption((o) => o.setName("arama").setDescription("Arama").setRequired(true))
].map((c) => c.toJSON());

async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(TOKEN);
  try {
    if (GUILD_ID) {
      await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
      console.log("✅ Slash komutlar sunucuya kaydedildi.");
    } else {
      await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
      console.log("✅ Slash komutlar global kaydedildi.");
    }
  } catch (e) {
    console.error("❌ Komut kaydı başarısız:", e);
  }
}

// ===================== INTERACTION HANDLER =====================
client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isButton()) {
      if (interaction.customId === "ticket_open") return handleTicketOpen(interaction);
      if (interaction.customId.startsWith("basvuru_kabul_")) return handleBasvuruKarar(interaction, true);
      if (interaction.customId.startsWith("basvuru_reddet_")) return handleBasvuruKarar(interaction, false);
      if (interaction.customId === "ticket_close") return handleTicketClose(interaction);
      return;
    }

    if (!interaction.isChatInputCommand()) return;
    const { commandName, guild } = interaction;
    if (!guild) return;

    if (commandName === "guard") {
      const sub = interaction.options.getSubcommand();
      if (sub === "panel") {
        if (!isGuardCommandUser(interaction.user.id)) return noPerm(interaction);
        return replyE(interaction, guardPanelEmbed(guild));
      }
      if (sub === "limit") {
        if (!isGuardCommandUser(interaction.user.id)) return noPerm(interaction);
        const sistem = interaction.options.getString("sistem");
        const miktar = interaction.options.getInteger("miktar");
        guardConfig.limits[sistem] = miktar;
        saveGuard();
        return replyE(interaction, createEmbed(guild, { title: line(EMOJI.success, "ʟɪᴍɪᴛ"), description: `${sistem} limit: ${miktar}` }));
      }
      if (sub === "sistem") {
        if (!isGuardCommandUser(interaction.user.id)) return noPerm(interaction);
        const sistem = interaction.options.getString("sistem");
        const durum = interaction.options.getBoolean("durum");
        guardConfig.systems[sistem] = durum;
        saveGuard();
        return replyE(interaction, createEmbed(guild, { title: line(EMOJI.success, "ꜱɪꜱᴛᴇᴍ"), description: `${sistem}: ${durum}` }));
      }
      if (sub === "whitelist") {
        if (!isGuardCommandUser(interaction.user.id)) return noPerm(interaction);
        const islem = interaction.options.getString("islem");
        const kullanici = interaction.options.getUser("kullanici");
        if (islem === "liste") {
          const list = whitelist.size ? Array.from(whitelist).map(id => `<@${id}>`).join(", ") : "Boş";
          return replyE(interaction, createEmbed(guild, { title: "Whitelist", description: list }));
        }
        if (islem === "ekle" && kullanici) {
          whitelist.add(kullanici.id);
          saveWhitelist();
          return replyE(interaction, createEmbed(guild, { title: "Whitelist", description: `${kullanici} eklendi.` }));
        }
        if (islem === "kaldir" && kullanici) {
          whitelist.delete(kullanici.id);
          saveWhitelist();
          return replyE(interaction, createEmbed(guild, { title: "Whitelist", description: `${kullanici} kaldırıldı.` }));
        }
      }
      return;
    }

    if (commandName === "setup") {
      if (!isOwner(interaction.user.id) && !isStaff(interaction.user.id)) return noPerm(interaction);
      await interaction.deferReply();
      const category = await guild.channels.create({ name: "📂・ᴍᴏᴅᴇʀᴀsʏᴏɴ-ʟᴏɢs", type: ChannelType.GuildCategory });
      const logs = [
        { name: "・ban-log", key: "banLog" },
        { name: "・kick-log", key: "kickLog" },
        { name: "・rol-log", key: "roleLog" },
        { name: "・kanal-log", key: "channelLog" },
        { name: "・ticket-log", key: "ticketLog" },
        { name: "・guard-log", key: "guardLog" }
      ];
      if (!config.logs) config.logs = {};
      for (const l of logs) {
        const ch = await guild.channels.create({ name: l.name, type: ChannelType.GuildText, parent: category.id });
        config.logs[l.key] = ch.id;
      }
      config.logChannelId = config.logs.guardLog;
      saveConfig();
      return interaction.editReply({ embeds: [createEmbed(guild, { title: "Setup Tamam", description: "Log kanalları kuruldu." })] });
    }

    if (commandName === "logkanal") {
      if (!isOwner(interaction.user.id) && !isStaff(interaction.user.id)) return noPerm(interaction);
      const ch = interaction.options.getChannel("kanal");
      config.logChannelId = ch.id;
      saveConfig();
      return replyE(interaction, createEmbed(guild, { title: "Log Kanal", description: `${ch}` }));
    }

    if (commandName === "ticket") {
      if (!isOwner(interaction.user.id) && !isStaff(interaction.user.id)) return noPerm(interaction);
      const sub = interaction.options.getSubcommand();
      if (sub === "kategori") {
        config.ticketCategoryId = interaction.options.getChannel("kategori").id;
        saveConfig();
        return replyE(interaction, createEmbed(guild, { title: "Kategori", description: "Kategori ayarlandı." }));
      }
      if (sub === "panel") {
        config.ticketStaffRoleId = interaction.options.getRole("yetkili_rol").id;
        saveConfig();
        const msg = await interaction.channel.send({ embeds: [ticketPanelEmbed(guild)], components: [ticketPanelRow()] });
        config.ticketPanelChannelId = msg.channel.id;
        config.ticketPanelMessageId = msg.id;
        saveConfig();
        return replyE(interaction, createEmbed(guild, { title: "Panel", description: "Panel gönderildi." }));
      }
      if (sub === "durum") {
        config.ticketDurum = interaction.options.getString("durum");
        saveConfig();
        await refreshTicketPanelMessage(guild);
        return replyE(interaction, createEmbed(guild, { title: "Durum", description: `Durum: ${config.ticketDurum}` }));
      }
      if (sub === "ekiprol") {
        config.ekipRoleId = interaction.options.getRole("rol").id;
        saveConfig();
        return replyE(interaction, createEmbed(guild, { title: "Ekip Rol", description: "Ayarlandı." }));
      }
      if (sub === "yenirol") {
        config.newRoleId = interaction.options.getRole("rol").id;
        saveConfig();
        return replyE(interaction, createEmbed(guild, { title: "Yeni Rol", description: "Ayarlandı." }));
      }
    }

    if (commandName === "ban") {
      if (!isOwner(interaction.user.id) && !isStaff(interaction.user.id)) return noPerm(interaction);
      const user = interaction.options.getUser("kullanici");
      const sebep = interaction.options.getString("sebep") || "Sebep yok";
      await guild.members.ban(user.id, { reason: sebep });
      return replyE(interaction, createEmbed(guild, { title: "Ban", description: `${user} banlandı.` }));
    }

    if (commandName === "kick") {
      if (!isOwner(interaction.user.id) && !isStaff(interaction.user.id)) return noPerm(interaction);
      const user = interaction.options.getUser("kullanici");
      const sebep = interaction.options.getString("sebep") || "Sebep yok";
      const member = await guild.members.fetch(user.id);
      await member.kick(sebep);
      return replyE(interaction, createEmbed(guild, { title: "Kick", description: `${user} atıldı.` }));
    }

    if (commandName === "ses") {
      if (!isOwner(interaction.user.id) && !isStaff(interaction.user.id)) return noPerm(interaction);
      const vc = interaction.member.voice.channel;
      if (!vc) return replyE(interaction, createEmbed(guild, { title: "Hata", description: "Ses kanalında değilsin." }));
      joinVoiceChannel({ channelId: vc.id, guildId: guild.id, adapterCreator: guild.voiceAdapterCreator, selfDeaf: true });
      return replyE(interaction, createEmbed(guild, { title: "Ses", description: `${vc} kanalına girildi.` }));
    }

    if (commandName === "sestopla") {
      if (!isOwner(interaction.user.id) && !isStaff(interaction.user.id)) return noPerm(interaction);
      const hedef = interaction.member.voice.channel;
      if (!hedef) return replyE(interaction, createEmbed(guild, { title: "Hata", description: "Önce sese gir." }));
      for (const [, c] of guild.channels.cache.filter(c => c.isVoiceBased() && c.id !== hedef.id)) {
        for (const [, m] of c.members) {
          await m.voice.setChannel(hedef).catch(() => {});
        }
      }
      return replyE(interaction, createEmbed(guild, { title: "Ses Topla", description: "Herkes toplandı." }));
    }

    if (commandName === "nuke") {
      if (!isOwner(interaction.user.id) && !isStaff(interaction.user.id)) return noPerm(interaction);
      const ch = interaction.channel;
      const pos = ch.position;
      const newCh = await ch.clone();
      await newCh.setPosition(pos);
      await ch.delete();
      await newCh.send("💥 Kanal nuke'lendi.");
      return;
    }

    if (commandName === "yetkili") {
      if (!isOwner(interaction.user.id)) return noPerm(interaction);
      const sub = interaction.options.getSubcommand();
      if (sub === "liste") {
        const list = staffIds.size ? Array.from(staffIds).map(id => `<@${id}>`).join(", ") : "Boş";
        return replyE(interaction, createEmbed(guild, { title: "Yetkililer", description: list }));
      }
      const user = interaction.options.getUser("kullanici");
      if (sub === "ekle") {
        staffIds.add(user.id);
        saveStaff();
        return replyE(interaction, createEmbed(guild, { title: "Yetkili", description: `${user} yetkili yapıldı.` }));
      }
      if (sub === "kaldir") {
        staffIds.delete(user.id);
        saveStaff();
        return replyE(interaction, createEmbed(guild, { title: "Yetkili", description: `${user} yetkisi alındı.` }));
      }
    }

    if (commandName === "id") {
      if (!isOwner(interaction.user.id) && !isStaff(interaction.user.id)) return noPerm(interaction);
      const data = await getPlayerFromCFX(interaction.options.getInteger("oyuncu_id"));
      if (!data.found) return replyE(interaction, createEmbed(guild, { title: "Bulunamadı", description: "Oyuncu yok." }));
      return replyE(interaction, createEmbed(guild, { title: "FiveM Oyuncu", fields: [{ name: "İsim", value: data.name }, { name: "ID", value: String(data.id), inline: true }, { name: "Ping", value: String(data.ping), inline: true }] }));
    }

    if (commandName === "tag") {
      if (!isOwner(interaction.user.id) && !isStaff(interaction.user.id)) return noPerm(interaction);
      const q = interaction.options.getString("arama").toLowerCase();
      const json = await getServerPlayersCached();
      const matched = (json?.Data?.players || []).filter(p => cleanFiveMName(p.name).includes(q));
      if (!matched.length) return replyE(interaction, createEmbed(guild, { title: "Bulunamadı", description: "Eşleşme yok." }));
      return replyE(interaction, createEmbed(guild, { title: "Tag Arama", description: matched.slice(0, 20).map(p => `**${p.name}** (ID: \`${p.id}\`)`).join("\n") }));
    }
  } catch (e) {
    console.error("Interaction hata:", e);
  }
});

// ===================== READY & BOOTSTRAP =====================
function setBotPresence() {
  if (!client.user) return;
  client.user.setPresence({ activities: [{ name: "Vazgucxn Web Panel", type: ActivityType.Playing }], status: "dnd" });
}

client.once(Events.ClientReady, () => {
  console.log(`🟢 Bot aktif: ${client.user.tag}`);
  setBotPresence();
});

// Express Web Sunucusu Başlatılıyor
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🌐 Web Paneli ve Keep-Alive aktif: Port ${PORT}`);
});

(async () => {
  await initMongo();
  await pullFromMongo("config.json", CONFIG_FILE);
  await pullFromMongo("guard.json", GUARD_FILE);
  await pullFromMongo("whitelist.json", WHITELIST_FILE);
  await pullFromMongo("staff.json", STAFF_FILE);

  config = loadJSON(CONFIG_FILE, {
    logChannelId: null,
    ticketCategoryId: null,
    ticketStaffRoleId: null,
    ekipRoleId: null,
    newRoleId: null,
    ticketDurum: "acik",
    logs: {}
  });
  guardConfig = loadJSON(GUARD_FILE, {
    enabled: true,
    systems: { ban: true, kick: true, channel: true, role: true },
    limits: { ban: 2, kick: 3, channel: 1, role: 2 },
    windowMinutes: 10
  });
  whitelist = new Set(loadJSON(WHITELIST_FILE, []));
  staffIds = new Set(loadJSON(STAFF_FILE, ENV_STAFF_IDS));

  if (CLIENT_ID) await registerCommands();
  await client.login(TOKEN);
})();
