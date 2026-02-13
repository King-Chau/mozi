/**
 * 静态文件服务和 Control UI
 */

import { existsSync, readFileSync } from "fs";
import { join, extname } from "path";
import type { IncomingMessage, ServerResponse } from "http";
import { getChildLogger } from "../utils/logger.js";
import type { MoziConfig } from "../types/index.js";

const logger = getChildLogger("static");

/** 墨狗吉祥物 SVG (小尺寸，用于头像) */
const MASCOT_SVG_SMALL = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80" width="32" height="32"><circle cx="40" cy="40" r="38" fill="#0f172a"/><path d="M12 30 L22 8 L30 28 Z" fill="#d4a054"/><path d="M50 28 L58 8 L68 30 Z" fill="#d4a054"/><ellipse cx="40" cy="46" rx="26" ry="22" fill="#e8a840"/><ellipse cx="40" cy="52" rx="18" ry="16" fill="#fff8f0"/><path d="M32 34 Q40 28 48 34 L46 40 Q40 36 34 40 Z" fill="#fff8f0"/><ellipse cx="30" cy="44" rx="4" ry="5" fill="#1a1a2e"/><circle cx="31" cy="43" r="1.5" fill="white"/><ellipse cx="50" cy="44" rx="4" ry="5" fill="#1a1a2e"/><circle cx="51" cy="43" r="1.5" fill="white"/><ellipse cx="30" cy="38" rx="4" ry="1.5" fill="#c4903c"/><ellipse cx="50" cy="38" rx="4" ry="1.5" fill="#c4903c"/><ellipse cx="20" cy="50" rx="4" ry="2.5" fill="#fca5a5" opacity="0.4"/><ellipse cx="60" cy="50" rx="4" ry="2.5" fill="#fca5a5" opacity="0.4"/><ellipse cx="40" cy="52" rx="4" ry="3" fill="#1a1a2e"/><path d="M40 55 L40 58" stroke="#1a1a2e" stroke-width="1.5" stroke-linecap="round"/><path d="M34 60 Q40 64 46 60" stroke="#1a1a2e" stroke-width="1.5" fill="none" stroke-linecap="round"/><path d="M18 66 Q40 74 62 66" stroke="#10b981" stroke-width="3" fill="none" stroke-linecap="round"/><circle cx="40" cy="72" r="4" fill="#10b981"/></svg>`;

/** 墨狗吉祥物 SVG (中尺寸，用于侧边栏) */
const MASCOT_SVG_MEDIUM = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80" width="28" height="28"><circle cx="40" cy="40" r="38" fill="#0f172a"/><path d="M12 30 L22 8 L30 28 Z" fill="#d4a054"/><path d="M50 28 L58 8 L68 30 Z" fill="#d4a054"/><ellipse cx="40" cy="46" rx="26" ry="22" fill="#e8a840"/><ellipse cx="40" cy="52" rx="18" ry="16" fill="#fff8f0"/><path d="M32 34 Q40 28 48 34 L46 40 Q40 36 34 40 Z" fill="#fff8f0"/><ellipse cx="30" cy="44" rx="4" ry="5" fill="#1a1a2e"/><circle cx="31" cy="43" r="1.5" fill="white"/><ellipse cx="50" cy="44" rx="4" ry="5" fill="#1a1a2e"/><circle cx="51" cy="43" r="1.5" fill="white"/><ellipse cx="30" cy="38" rx="4" ry="1.5" fill="#c4903c"/><ellipse cx="50" cy="38" rx="4" ry="1.5" fill="#c4903c"/><ellipse cx="20" cy="50" rx="4" ry="2.5" fill="#fca5a5" opacity="0.4"/><ellipse cx="60" cy="50" rx="4" ry="2.5" fill="#fca5a5" opacity="0.4"/><ellipse cx="40" cy="52" rx="4" ry="3" fill="#1a1a2e"/><path d="M40 55 L40 58" stroke="#1a1a2e" stroke-width="1.5" stroke-linecap="round"/><path d="M34 60 Q40 64 46 60" stroke="#1a1a2e" stroke-width="1.5" fill="none" stroke-linecap="round"/><path d="M18 66 Q40 74 62 66" stroke="#10b981" stroke-width="3" fill="none" stroke-linecap="round"/><circle cx="40" cy="72" r="4" fill="#10b981"/></svg>`;

/** 墨狗吉祥物 SVG (大尺寸，带动画，用于欢迎页面) */
const MASCOT_SVG_LARGE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80" width="80" height="80"><defs><linearGradient id="mascot-g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#10b981"/><stop offset="100%" stop-color="#3b82f6"/></linearGradient></defs><style>@keyframes mascot-wink{0%,90%,100%{transform:scaleY(1)}95%{transform:scaleY(0.1)}}@keyframes mascot-hide{0%,90%,100%{opacity:1}95%{opacity:0}}.mascot-left-eye{animation:mascot-wink 3s infinite;transform-origin:30px 44px}.mascot-left-highlight{animation:mascot-hide 3s infinite}</style><circle cx="40" cy="40" r="38" fill="#0f172a"/><path d="M12 30 L22 8 L30 28 Z" fill="#d4a054"/><path d="M15 28 L22 12 L28 26 Z" fill="#fca5a5" opacity="0.3"/><path d="M50 28 L58 8 L68 30 Z" fill="#d4a054"/><path d="M52 26 L58 12 L65 28 Z" fill="#fca5a5" opacity="0.3"/><ellipse cx="40" cy="46" rx="26" ry="22" fill="#e8a840"/><ellipse cx="40" cy="52" rx="18" ry="16" fill="#fff8f0"/><path d="M32 34 Q40 28 48 34 L46 40 Q40 36 34 40 Z" fill="#fff8f0"/><ellipse class="mascot-left-eye" cx="30" cy="44" rx="4" ry="5" fill="#1a1a2e"/><circle class="mascot-left-highlight" cx="31" cy="43" r="1.5" fill="white"/><ellipse cx="50" cy="44" rx="4" ry="5" fill="#1a1a2e"/><circle cx="51" cy="43" r="1.5" fill="white"/><ellipse cx="30" cy="38" rx="4" ry="1.5" fill="#c4903c"/><ellipse cx="50" cy="38" rx="4" ry="1.5" fill="#c4903c"/><ellipse cx="20" cy="50" rx="4" ry="2.5" fill="#fca5a5" opacity="0.4"/><ellipse cx="60" cy="50" rx="4" ry="2.5" fill="#fca5a5" opacity="0.4"/><ellipse cx="40" cy="52" rx="4" ry="3" fill="#1a1a2e"/><ellipse cx="39" cy="51" rx="1" ry="0.8" fill="white" opacity="0.3"/><path d="M40 55 L40 58" stroke="#1a1a2e" stroke-width="1.5" stroke-linecap="round"/><path d="M34 60 Q40 64 46 60" stroke="#1a1a2e" stroke-width="1.5" fill="none" stroke-linecap="round"/><path d="M18 66 Q40 74 62 66" stroke="#10b981" stroke-width="3" fill="none" stroke-linecap="round"/><circle cx="40" cy="72" r="4" fill="url(#mascot-g)"><animate attributeName="opacity" values="1;0.5;1" dur="2s" repeatCount="indefinite"/></circle></svg>`;

/** MIME 类型映射 */
const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
};

/** 获取内嵌的 HTML 页面 */
function getEmbeddedHtml(config: MoziConfig): string {
  const assistantName = "墨子";
  const defaultModel = config.agent.defaultModel;
  const defaultProvider = config.agent.defaultProvider;

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${assistantName} - AI 助手</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    :root {
      --primary: #4f46e5;
      --primary-hover: #4338ca;
      --bg: #f9fafb;
      --bg-card: #ffffff;
      --text: #111827;
      --text-secondary: #6b7280;
      --border: #e5e7eb;
      --user-bg: #4f46e5;
      --assistant-bg: #f3f4f6;
      --sidebar-width: 280px;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      background: var(--bg);
      color: var(--text);
      height: 100vh;
      display: flex;
    }
    /* 侧边栏 */
    .sidebar {
      width: var(--sidebar-width);
      background: var(--bg-card);
      border-right: 1px solid var(--border);
      display: flex;
      flex-direction: column;
      flex-shrink: 0;
    }
    .sidebar-header {
      padding: 1rem;
      border-bottom: 1px solid var(--border);
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }
    .sidebar-logo { font-size: 1.5rem; }
    .sidebar-title { font-weight: 600; font-size: 1.125rem; }
    .new-chat-btn {
      margin: 1rem;
      padding: 0.75rem 1rem;
      background: var(--primary);
      color: white;
      border: none;
      border-radius: 0.5rem;
      font-size: 0.875rem;
      font-weight: 500;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      transition: background 0.2s;
    }
    .new-chat-btn:hover { background: var(--primary-hover); }
    .session-list {
      flex: 1;
      overflow-y: auto;
      padding: 0.5rem;
    }
    .session-item {
      padding: 0.75rem 1rem;
      border-radius: 0.5rem;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 0.75rem;
      margin-bottom: 0.25rem;
      transition: background 0.15s;
    }
    .session-item:hover { background: var(--bg); }
    .session-item.active { background: #eef2ff; }
    .session-icon { font-size: 1rem; opacity: 0.7; }
    .session-info { flex: 1; min-width: 0; }
    .session-title {
      font-size: 0.875rem;
      font-weight: 500;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .session-meta {
      font-size: 0.75rem;
      color: var(--text-secondary);
      display: flex;
      gap: 0.5rem;
    }
    .session-delete {
      opacity: 0;
      padding: 0.25rem;
      border: none;
      background: none;
      cursor: pointer;
      font-size: 0.875rem;
      color: var(--text-secondary);
      border-radius: 0.25rem;
    }
    .session-item:hover .session-delete { opacity: 1; }
    .session-delete:hover { background: #fee2e2; color: #dc2626; }
    .sidebar-footer {
      padding: 0.75rem 1rem;
      border-top: 1px solid var(--border);
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 0.75rem;
      color: var(--text-secondary);
    }
    /* 主内容区 */
    .main-container {
      flex: 1;
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
    .header {
      background: var(--bg-card);
      border-bottom: 1px solid var(--border);
      padding: 1rem 1.5rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .header-left { display: flex; align-items: center; gap: 0.75rem; }
    .menu-btn {
      display: none;
      padding: 0.5rem;
      border: none;
      background: none;
      cursor: pointer;
      font-size: 1.25rem;
    }
    .title { font-size: 1.25rem; font-weight: 600; }
    .subtitle { font-size: 0.75rem; color: var(--text-secondary); }
    .status { display: flex; align-items: center; gap: 0.5rem; font-size: 0.875rem; color: var(--text-secondary); }
    .status-dot { width: 8px; height: 8px; border-radius: 50%; background: #10b981; }
    .status-dot.disconnected { background: #ef4444; }
    .main { flex: 1; display: flex; flex-direction: column; max-width: 900px; width: 100%; margin: 0 auto; padding: 1rem; overflow: hidden; }
    .messages { flex: 1; overflow-y: auto; padding: 1rem 0; display: flex; flex-direction: column; gap: 1rem; }
    .message { display: flex; gap: 0.75rem; max-width: 85%; }
    .message.user { align-self: flex-end; flex-direction: row-reverse; }
    .message-avatar { width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 1rem; flex-shrink: 0; }
    .message.user .message-avatar { background: var(--user-bg); color: white; }
    .message.assistant .message-avatar { background: var(--assistant-bg); }
    .message-content { padding: 0.75rem 1rem; border-radius: 1rem; line-height: 1.5; white-space: pre-wrap; word-break: break-word; }
    .message.user .message-content { background: var(--user-bg); color: white; border-bottom-right-radius: 0.25rem; }
    .message.assistant .message-content { background: var(--assistant-bg); border-bottom-left-radius: 0.25rem; }
    .message-content code { background: rgba(0, 0, 0, 0.1); padding: 0.125rem 0.375rem; border-radius: 0.25rem; font-family: "SF Mono", Monaco, monospace; font-size: 0.875em; }
    .message.user .message-content code { background: rgba(255, 255, 255, 0.2); }
    .message-content pre { background: rgba(0, 0, 0, 0.05); padding: 0.75rem; border-radius: 0.5rem; overflow-x: auto; margin: 0.5rem 0; }
    .message.user .message-content pre { background: rgba(255, 255, 255, 0.1); }
    .typing { display: flex; gap: 0.25rem; padding: 0.5rem; }
    .typing span { width: 8px; height: 8px; background: var(--text-secondary); border-radius: 50%; animation: typing 1.4s infinite; }
    .typing span:nth-child(2) { animation-delay: 0.2s; }
    .typing span:nth-child(3) { animation-delay: 0.4s; }
    @keyframes typing { 0%, 60%, 100% { transform: translateY(0); } 30% { transform: translateY(-4px); } }
    .input-area { background: var(--bg-card); border: 1px solid var(--border); border-radius: 1rem; padding: 0.75rem; display: flex; gap: 0.75rem; align-items: flex-end; }
    .input-area textarea { flex: 1; border: none; outline: none; resize: none; font-size: 1rem; line-height: 1.5; max-height: 150px; font-family: inherit; background: transparent; }
    .input-area button { background: var(--primary); color: white; border: none; border-radius: 0.5rem; padding: 0.5rem 1rem; font-size: 0.875rem; font-weight: 500; cursor: pointer; transition: background 0.2s; display: flex; align-items: center; gap: 0.375rem; }
    .input-area button:hover { background: var(--primary-hover); }
    .input-area button:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn-icon { background: transparent !important; color: var(--text-secondary) !important; padding: 0.5rem !important; }
    .btn-icon:hover { color: var(--text) !important; background: var(--bg) !important; }
    .cancel-btn { background: var(--border) !important; color: var(--text) !important; }
    .cancel-btn:hover { background: var(--text-secondary) !important; color: white !important; }
    .cancelled-hint { color: var(--text-secondary); margin-top: 0.5rem; font-size: 0.875rem; }
    .welcome { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; gap: 1rem; color: var(--text-secondary); }
    .welcome-icon { font-size: 4rem; }
    .welcome h2 { color: var(--text); font-size: 1.5rem; }
    .welcome p { max-width: 400px; }
    .features { display: flex; gap: 1rem; margin-top: 1rem; flex-wrap: wrap; justify-content: center; }
    .feature { background: var(--bg-card); border: 1px solid var(--border); border-radius: 0.75rem; padding: 1rem; width: 140px; text-align: center; }
    .feature-icon { font-size: 1.5rem; margin-bottom: 0.5rem; }
    .feature-text { font-size: 0.875rem; color: var(--text); }
    /* Markdown styles */
    .message-content.markdown { white-space: normal; }
    .message-content.markdown h1, .message-content.markdown h2, .message-content.markdown h3, .message-content.markdown h4 { margin: 0.75em 0 0.5em 0; font-weight: 600; line-height: 1.3; }
    .message-content.markdown h1 { font-size: 1.4em; }
    .message-content.markdown h2 { font-size: 1.25em; }
    .message-content.markdown h3 { font-size: 1.1em; }
    .message-content.markdown p { margin: 0.5em 0; }
    .message-content.markdown ul, .message-content.markdown ol { margin: 0.5em 0; padding-left: 1.5em; }
    .message-content.markdown li { margin: 0.25em 0; }
    .message-content.markdown pre { background: #1e1e1e; color: #d4d4d4; padding: 1em; border-radius: 0.5em; overflow-x: auto; margin: 0.75em 0; font-family: "SF Mono", Monaco, Consolas, monospace; font-size: 0.9em; line-height: 1.4; }
    .message-content.markdown pre code { background: none; padding: 0; color: inherit; font-size: inherit; }
    .message-content.markdown code { background: rgba(0, 0, 0, 0.08); padding: 0.15em 0.4em; border-radius: 0.25em; font-family: "SF Mono", Monaco, Consolas, monospace; font-size: 0.9em; }
    .message.user .message-content.markdown code { background: rgba(255, 255, 255, 0.15); }
    .message-content.markdown table { border-collapse: collapse; margin: 0.75em 0; width: 100%; font-size: 0.9em; }
    .message-content.markdown th, .message-content.markdown td { border: 1px solid var(--border); padding: 0.5em 0.75em; text-align: left; }
    .message-content.markdown th { background: rgba(0, 0, 0, 0.04); font-weight: 600; }
    .message-content.markdown blockquote { border-left: 3px solid var(--primary); margin: 0.75em 0; padding: 0.5em 1em; background: rgba(0, 0, 0, 0.03); }
    .message-content.markdown hr { border: none; border-top: 1px solid var(--border); margin: 1em 0; }
    .message-content.markdown a { color: var(--primary); text-decoration: none; }
    .message-content.markdown a:hover { text-decoration: underline; }
    .message-content.markdown strong { font-weight: 600; }
    .message-content.markdown em { font-style: italic; }
    /* 响应式 */
    @media (max-width: 768px) {
      .sidebar { position: fixed; left: -100%; top: 0; bottom: 0; z-index: 100; transition: left 0.3s; }
      .sidebar.open { left: 0; }
      .sidebar-overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.3); z-index: 99; }
      .sidebar.open + .sidebar-overlay { display: block; }
      .menu-btn { display: block; }
      .message { max-width: 95%; }
    }
    .empty-sessions { padding: 2rem 1rem; text-align: center; color: var(--text-secondary); font-size: 0.875rem; }
  </style>
  <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
</head>
<body>
  <aside class="sidebar" id="sidebar">
    <div class="sidebar-header">
      <span class="sidebar-logo">${MASCOT_SVG_MEDIUM}</span>
      <span class="sidebar-title">${assistantName}</span>
    </div>
    <button class="new-chat-btn" id="newChatBtn">➕ 新建对话</button>
    <div class="session-list" id="sessionList">
      <div class="empty-sessions">暂无历史会话</div>
    </div>
    <div class="sidebar-footer">
      <span id="sessionCount">0 个会话</span>
      <a href="/control" style="color: var(--primary); text-decoration: none;">控制台</a>
    </div>
  </aside>
  <div class="sidebar-overlay" id="sidebarOverlay"></div>

  <div class="main-container">
    <header class="header">
      <div class="header-left">
        <button class="menu-btn" id="menuBtn">☰</button>
        <div>
          <div class="title">${assistantName}</div>
          <div class="subtitle">${defaultProvider} / ${defaultModel}</div>
        </div>
      </div>
      <div class="status">
        <span class="status-dot" id="statusDot"></span>
        <span id="statusText">连接中...</span>
      </div>
    </header>

    <main class="main">
      <div class="messages" id="messages">
        <div class="welcome" id="welcome">
          <div class="welcome-icon">${MASCOT_SVG_LARGE}</div>
          <h2>欢迎使用 ${assistantName}</h2>
          <p>我是一个支持国产模型的智能助手，可以帮助你回答问题、编写代码、分析数据等。</p>
          <div class="features">
            <div class="feature"><div class="feature-icon">💬</div><div class="feature-text">智能对话</div></div>
            <div class="feature"><div class="feature-icon">💻</div><div class="feature-text">代码助手</div></div>
            <div class="feature"><div class="feature-icon">📊</div><div class="feature-text">数据分析</div></div>
            <div class="feature"><div class="feature-icon">🔧</div><div class="feature-text">工具调用</div></div>
          </div>
        </div>
      </div>
      <div class="input-area">
        <textarea id="input" placeholder="输入消息... (Enter 发送, Shift+Enter 换行, Esc 取消)" rows="1"></textarea>
        <button class="btn-icon" id="clearBtn" title="清除对话">🗑️</button>
        <button id="cancelBtn" class="cancel-btn" title="取消本次请求" style="display: none;">取消</button>
        <button id="sendBtn"><span>发送</span><span>↵</span></button>
      </div>
    </main>
  </div>

  <script>
    const MASCOT_AVATAR = \`${MASCOT_SVG_SMALL}\`;
    let ws = null;
    let reconnectTimer = null;
    let pendingRequests = new Map();
    let requestId = 0;
    let isStreaming = false;
    let currentStreamContent = '';
    let currentSessionKey = null;
    let sessionRestored = false;
    let allSessions = [];

    const STORAGE_KEY = 'mozi_session_key';

    const sidebar = document.getElementById('sidebar');
    const sidebarOverlay = document.getElementById('sidebarOverlay');
    const menuBtn = document.getElementById('menuBtn');
    const sessionList = document.getElementById('sessionList');
    const sessionCount = document.getElementById('sessionCount');
    const newChatBtn = document.getElementById('newChatBtn');
    const messagesEl = document.getElementById('messages');
    const welcomeEl = document.getElementById('welcome');
    const inputEl = document.getElementById('input');
    const sendBtn = document.getElementById('sendBtn');
    const cancelBtn = document.getElementById('cancelBtn');
    const clearBtn = document.getElementById('clearBtn');
    const statusDot = document.getElementById('statusDot');
    const statusText = document.getElementById('statusText');

    function getSavedSessionKey() { return localStorage.getItem(STORAGE_KEY); }
    function saveSessionKey(sessionKey) { localStorage.setItem(STORAGE_KEY, sessionKey); currentSessionKey = sessionKey; }

    function toggleSidebar() {
      sidebar.classList.toggle('open');
    }

    menuBtn.addEventListener('click', toggleSidebar);
    sidebarOverlay.addEventListener('click', toggleSidebar);

    function connect() {
      const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      ws = new WebSocket(protocol + '//' + location.host + '/ws');

      ws.onopen = () => {
        statusDot.classList.remove('disconnected');
        statusText.textContent = '已连接';
        sessionRestored = false;
        // 注意：不在此处加载数据，等待服务器发送 connected 事件后再操作
      };

      ws.onclose = () => {
        statusDot.classList.add('disconnected');
        statusText.textContent = '已断开';
        reconnectTimer = setTimeout(connect, 3000);
      };

      ws.onerror = (err) => { console.error('WebSocket error:', err); };
      ws.onmessage = (event) => {
        try {
          const frame = JSON.parse(event.data);
          handleFrame(frame);
        } catch (e) { console.error('Failed to parse message:', e); }
      };
    }

    async function restoreSession(sessionKey) {
      try {
        const result = await request('sessions.restore', { sessionKey });
        sessionRestored = true;
        if (result && result.sessionKey) {
          saveSessionKey(result.sessionKey);
        }
        if (result && result.messages && result.messages.length > 0) {
          loadHistoryMessages(result.messages);
        }
        updateSessionListActive();
      } catch (e) {
        console.log('No previous session found, starting fresh');
        localStorage.removeItem(STORAGE_KEY);
        sessionRestored = true;
      }
    }

    async function loadSessionList() {
      try {
        const result = await request('sessions.list', { limit: 50 });
        allSessions = result.sessions || [];
        renderSessionList();
      } catch (e) { console.error('Failed to load sessions:', e); }
    }

    function renderSessionList() {
      // 过滤掉没有消息的空会话
      const sessionsWithMessages = allSessions.filter(s => (s.messageCount || 0) > 0);

      if (sessionsWithMessages.length === 0) {
        sessionList.innerHTML = '<div class="empty-sessions">暂无历史会话</div>';
        sessionCount.textContent = '0 个会话';
        return;
      }

      sessionCount.textContent = sessionsWithMessages.length + ' 个会话';
      const currentKey = getSavedSessionKey();

      sessionList.innerHTML = sessionsWithMessages.map(s => {
        const isActive = s.sessionKey === currentKey;
        const title = s.label || s.sessionKey.replace(/^webchat:/, '').slice(0, 12) + '...';
        const time = new Date(s.updatedAt).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
        const msgCount = s.messageCount || 0;
        return \`
          <div class="session-item \${isActive ? 'active' : ''}" data-key="\${s.sessionKey}">
            <span class="session-icon">💬</span>
            <div class="session-info">
              <div class="session-title">\${escapeHtml(title)}</div>
              <div class="session-meta"><span>\${msgCount} 条消息</span><span>\${time}</span></div>
            </div>
            <button class="session-delete" data-key="\${s.sessionKey}" title="删除">🗑️</button>
          </div>
        \`;
      }).join('');

      sessionList.querySelectorAll('.session-item').forEach(el => {
        el.addEventListener('click', (e) => {
          if (e.target.classList.contains('session-delete')) return;
          switchToSession(el.dataset.key);
        });
      });

      sessionList.querySelectorAll('.session-delete').forEach(el => {
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          deleteSession(el.dataset.key);
        });
      });
    }

    function updateSessionListActive() {
      const currentKey = getSavedSessionKey();
      sessionList.querySelectorAll('.session-item').forEach(el => {
        el.classList.toggle('active', el.dataset.key === currentKey);
      });
    }

    async function switchToSession(sessionKey) {
      if (isStreaming) return;
      clearMessagesUI();
      saveSessionKey(sessionKey);
      try {
        const result = await request('sessions.restore', { sessionKey });
        if (result && result.messages && result.messages.length > 0) {
          loadHistoryMessages(result.messages);
        }
        updateSessionListActive();
        if (window.innerWidth <= 768) toggleSidebar();
      } catch (e) {
        console.error('Failed to switch session:', e);
      }
    }

    async function deleteSession(sessionKey) {
      if (!confirm('确定要删除这个会话吗？')) return;
      try {
        await request('sessions.delete', { sessionKey });
        if (getSavedSessionKey() === sessionKey) {
          localStorage.removeItem(STORAGE_KEY);
          clearMessagesUI();
          showWelcome();
        }
        loadSessionList();
      } catch (e) { console.error('Failed to delete session:', e); }
    }

    async function createNewChat() {
      if (isStreaming) return;
      // 通知服务器创建新会话，清除 Agent 上下文
      try {
        const result = await request('chat.clear');
        // 不保存返回的 sessionKey 到 localStorage
        // 这样 UI 会显示欢迎页面，而非立即绑定新会话
      } catch (e) {
        // 如果当前没有 session（服务器端），忽略错误
        console.log('Create new chat:', e.message);
      }
      localStorage.removeItem(STORAGE_KEY);
      clearMessagesUI();
      showWelcome();
      currentSessionKey = null;
      loadSessionList();
      if (window.innerWidth <= 768) toggleSidebar();
    }

    newChatBtn.addEventListener('click', createNewChat);

    function clearMessagesUI() {
      const msgs = messagesEl.querySelectorAll('.message');
      msgs.forEach(m => m.remove());
    }

    function showWelcome() {
      if (welcomeEl) welcomeEl.style.display = 'flex';
    }

    function loadHistoryMessages(messages) {
      if (!messages || messages.length === 0) return;
      if (welcomeEl) welcomeEl.style.display = 'none';
      for (const msg of messages) {
        if (msg.role === 'user' || msg.role === 'assistant') {
          const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
          addMessage(msg.role, content, false);
        }
      }
    }

    function handleFrame(frame) {
      if (frame.type === 'res') {
        const pending = pendingRequests.get(frame.id);
        if (pending) {
          pendingRequests.delete(frame.id);
          if (frame.ok) pending.resolve(frame.payload);
          else pending.reject(new Error(frame.error?.message || 'Unknown error'));
        }
      } else if (frame.type === 'event') {
        handleEvent(frame.event, frame.payload);
      }
    }

    function handleEvent(event, payload) {
      if (event === 'connected') {
        console.log('Connected, clientId:', payload.clientId);
        // 服务器准备好了，现在加载数据
        const savedSessionKey = getSavedSessionKey();
        if (savedSessionKey) {
          restoreSession(savedSessionKey);
        } else {
          // 没有保存的 session，等第一次发消息时服务器会自动创建
          sessionRestored = true;
        }
        loadSessionList();
      } else if (event === 'chat.delta') {
        if (!isStreaming) {
          isStreaming = true;
          currentStreamContent = '';
          addMessage('assistant', '', true);
          sendBtn.style.display = 'none';
          cancelBtn.style.display = '';
        }
        if (payload.delta) {
          currentStreamContent += payload.delta;
          updateStreamingMessage(currentStreamContent);
        }
        if (payload.done) {
          isStreaming = false;
          sendBtn.style.display = '';
          cancelBtn.style.display = 'none';
          if (payload.cancelled && currentStreamContent.trim()) {
            const msgEl = document.getElementById('streaming-message');
            if (msgEl) {
              const contentEl = msgEl.querySelector('.message-content');
              if (contentEl) contentEl.innerHTML += '<p class="cancelled-hint"><em>（已取消）</em></p>';
            }
          }
          finalizeStreamingMessage();
          loadSessionList();
        }
      } else if (event === 'chat.error') {
        isStreaming = false;
        sendBtn.style.display = '';
        cancelBtn.style.display = 'none';
        addMessage('assistant', '❌ 错误: ' + payload.error);
      }
    }

    function request(method, params) {
      return new Promise((resolve, reject) => {
        const id = String(++requestId);
        console.log(\`发送请求: \${method}, id: \${id}, params:\`, params);
        pendingRequests.set(id, { resolve, reject });
        if (ws?.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'req', id, method, params }));
        } else {
          reject(new Error('WebSocket 未连接'));
        }
      });
    }

    function renderContent(content, isAssistant = false) {
      if (isAssistant && typeof marked !== 'undefined') {
        marked.setOptions({ breaks: true, gfm: true });
        return marked.parse(content);
      }
      return escapeHtml(content);
    }

    function addMessage(role, content, streaming = false) {
      if (welcomeEl) welcomeEl.style.display = 'none';
      const msgEl = document.createElement('div');
      msgEl.className = 'message ' + role;
      if (streaming) msgEl.id = 'streaming-message';
      const avatar = role === 'user' ? '👤' : MASCOT_AVATAR;
      const isAssistant = role === 'assistant';
      const contentClass = isAssistant ? 'message-content markdown' : 'message-content';
      msgEl.innerHTML = \`<div class="message-avatar">\${avatar}</div><div class="\${contentClass}">\${streaming ? '<div class="typing"><span></span><span></span><span></span></div>' : renderContent(content, isAssistant)}</div>\`;
      messagesEl.appendChild(msgEl);
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function updateStreamingMessage(content) {
      const msgEl = document.getElementById('streaming-message');
      if (msgEl) {
        const contentEl = msgEl.querySelector('.message-content');
        contentEl.innerHTML = renderContent(content, true);
        contentEl.classList.add('markdown');
        messagesEl.scrollTop = messagesEl.scrollHeight;
      }
    }

    function finalizeStreamingMessage() {
      const msgEl = document.getElementById('streaming-message');
      if (msgEl) msgEl.removeAttribute('id');
    }

    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    function cancelRequest() {
      if (!isStreaming) return;
      request('chat.cancel').catch(() => {});
      isStreaming = false;
      sendBtn.style.display = '';
      cancelBtn.style.display = 'none';
      const msgEl = document.getElementById('streaming-message');
      if (msgEl && currentStreamContent.trim()) {
        const contentEl = msgEl.querySelector('.message-content');
        if (contentEl) contentEl.innerHTML += '<p class="cancelled-hint"><em>（已取消）</em></p>';
      }
      finalizeStreamingMessage();
      loadSessionList();
    }

    async function sendMessage() {
      const message = inputEl.value.trim();
      if (!message || isStreaming) return;
      inputEl.value = '';
      inputEl.style.height = 'auto';
      addMessage('user', message);
      try {
        await request('chat.send', { message });
      } catch (e) {
        addMessage('assistant', '❌ 发送失败: ' + e.message);
      }
    }

    async function clearChat() {
      if (isStreaming) return;
      try {
        const result = await request('chat.clear');
        if (result && result.sessionKey) saveSessionKey(result.sessionKey);
        clearMessagesUI();
        showWelcome();
        loadSessionList();
      } catch (e) { console.error('Failed to clear:', e); }
    }

    function autoResize() {
      inputEl.style.height = 'auto';
      inputEl.style.height = Math.min(inputEl.scrollHeight, 150) + 'px';
    }

    sendBtn.addEventListener('click', sendMessage);
    cancelBtn.addEventListener('click', cancelRequest);
    clearBtn.addEventListener('click', clearChat);
    inputEl.addEventListener('input', autoResize);
    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); cancelRequest(); return; }
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isStreaming) { e.preventDefault(); cancelRequest(); }
    });

    connect();
  </script>
</body>
</html>`;
}

/** 获取 Control UI 页面 */
function getControlHtml(config: MoziConfig): string {
  const assistantName = "墨子";
  const defaultModel = config.agent.defaultModel;
  const defaultProvider = config.agent.defaultProvider;

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${assistantName} - 控制台</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    :root {
      --primary: #4f46e5;
      --primary-hover: #4338ca;
      --bg: #f1f5f9;
      --bg-card: #ffffff;
      --text: #1e293b;
      --text-secondary: #64748b;
      --border: #e2e8f0;
      --success: #22c55e;
      --warning: #f59e0b;
      --error: #ef4444;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
    }
    .layout {
      display: flex;
      min-height: 100vh;
    }
    /* 侧边栏 */
    .sidebar {
      width: 240px;
      background: var(--bg-card);
      border-right: 1px solid var(--border);
      padding: 1.5rem 0;
      display: flex;
      flex-direction: column;
    }
    .sidebar-header {
      padding: 0 1.5rem 1.5rem;
      border-bottom: 1px solid var(--border);
      margin-bottom: 1rem;
    }
    .sidebar-logo {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }
    .sidebar-logo span:first-child { font-size: 1.75rem; }
    .sidebar-logo span:last-child { font-size: 1.25rem; font-weight: 600; }
    .nav-section {
      padding: 0.5rem 1rem;
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .nav-item {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.75rem 1.5rem;
      color: var(--text-secondary);
      text-decoration: none;
      cursor: pointer;
      transition: all 0.15s;
    }
    .nav-item:hover { background: var(--bg); color: var(--text); }
    .nav-item.active { background: #eef2ff; color: var(--primary); font-weight: 500; }
    .nav-item-icon { font-size: 1.125rem; }
    /* 主内容 */
    .main-content {
      flex: 1;
      padding: 2rem;
      overflow-y: auto;
    }
    .page-header {
      margin-bottom: 2rem;
    }
    .page-title {
      font-size: 1.5rem;
      font-weight: 600;
      margin-bottom: 0.5rem;
    }
    .page-desc {
      color: var(--text-secondary);
    }
    /* 卡片 */
    .cards {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 1.5rem;
      margin-bottom: 2rem;
    }
    .card {
      background: var(--bg-card);
      border-radius: 0.75rem;
      padding: 1.5rem;
      border: 1px solid var(--border);
    }
    .card-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 1rem;
    }
    .card-title {
      font-size: 0.875rem;
      font-weight: 500;
      color: var(--text-secondary);
    }
    .card-icon {
      font-size: 1.5rem;
    }
    .card-value {
      font-size: 2rem;
      font-weight: 600;
      margin-bottom: 0.25rem;
    }
    .card-label {
      font-size: 0.875rem;
      color: var(--text-secondary);
    }
    /* 状态指示器 */
    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.375rem;
      padding: 0.25rem 0.75rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 500;
    }
    .status-badge.online { background: #dcfce7; color: #166534; }
    .status-badge.offline { background: #fee2e2; color: #991b1b; }
    .status-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: currentColor;
    }
    /* 表格 */
    .table-container {
      background: var(--bg-card);
      border-radius: 0.75rem;
      border: 1px solid var(--border);
      overflow: hidden;
    }
    .table-header {
      padding: 1rem 1.5rem;
      border-bottom: 1px solid var(--border);
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .table-title {
      font-weight: 600;
    }
    table {
      width: 100%;
      border-collapse: collapse;
    }
    th, td {
      padding: 0.875rem 1.5rem;
      text-align: left;
      border-bottom: 1px solid var(--border);
    }
    th {
      background: var(--bg);
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    tr:last-child td { border-bottom: none; }
    tr:hover td { background: var(--bg); }
    /* 按钮 */
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 1rem;
      border-radius: 0.5rem;
      font-size: 0.875rem;
      font-weight: 500;
      cursor: pointer;
      border: none;
      transition: all 0.15s;
    }
    .btn-primary { background: var(--primary); color: white; }
    .btn-primary:hover { background: var(--primary-hover); }
    .btn-secondary { background: var(--bg); color: var(--text); border: 1px solid var(--border); }
    .btn-secondary:hover { background: var(--border); }
    .btn-danger { background: var(--error); color: white; }
    .btn-danger:hover { opacity: 0.9; }
    /* 隐藏视图 */
    .view { display: none; }
    .view.active { display: block; }
    /* 空状态 */
    .empty-state {
      text-align: center;
      padding: 3rem;
      color: var(--text-secondary);
    }
    .empty-state-icon { font-size: 3rem; margin-bottom: 1rem; }
    /* 模型卡片 */
    .model-card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 0.75rem;
      padding: 1rem 1.25rem;
    }
    .model-name { font-weight: 600; margin-bottom: 0.25rem; }
    .model-id { font-size: 0.75rem; color: var(--text-secondary); font-family: monospace; }
    .model-tags { display: flex; gap: 0.5rem; margin-top: 0.75rem; }
    .model-tag {
      padding: 0.125rem 0.5rem;
      border-radius: 0.25rem;
      font-size: 0.75rem;
      background: var(--bg);
      color: var(--text-secondary);
    }
    .model-tag.vision { background: #dbeafe; color: #1e40af; }
    .model-tag.reasoning { background: #fef3c7; color: #92400e; }
    /* 日志 */
    .log-container {
      background: #1e293b;
      border-radius: 0.75rem;
      padding: 1rem;
      max-height: 400px;
      overflow-y: auto;
      font-family: "SF Mono", Monaco, monospace;
      font-size: 0.8125rem;
      line-height: 1.6;
    }
    .log-entry { color: #e2e8f0; }
    .log-entry.info { color: #38bdf8; }
    .log-entry.warn { color: #fbbf24; }
    .log-entry.error { color: #f87171; }
    .log-entry .time { color: #64748b; }
    /* 表单样式 */
    .config-tabs button {
      padding: 0.5rem 1rem;
      background: transparent;
      border: none;
      border-bottom: 2px solid transparent;
      color: var(--text-secondary);
      font-size: 0.875rem;
      cursor: pointer;
      transition: all 0.2s;
    }
    .config-tabs button:hover {
      color: var(--text);
      border-bottom-color: var(--border);
    }
    .config-tabs button.active {
      color: var(--primary);
      border-bottom-color: var(--primary);
      font-weight: 500;
    }
    .config-content { display: none; }
    .config-content.active { display: block; }
    .form-section {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 0.75rem;
      padding: 1.5rem;
    }
    .form-section-title {
      font-size: 1.125rem;
      font-weight: 600;
      margin-bottom: 1rem;
      padding-bottom: 0.5rem;
      border-bottom: 1px solid var(--border);
    }
    .form-group {
      margin-bottom: 1rem;
    }
    .form-group label {
      display: block;
      font-size: 0.875rem;
      font-weight: 500;
      color: var(--text-secondary);
      margin-bottom: 0.375rem;
    }
    .form-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1rem;
    }
    .form-input {
      width: 100%;
      padding: 0.5rem 0.75rem;
      border: 1px solid var(--border);
      border-radius: 0.5rem;
      font-size: 0.875rem;
      font-family: inherit;
      background: var(--bg);
      color: var(--text);
      transition: border-color 0.2s;
    }
    .form-input:focus {
      outline: none;
      border-color: var(--primary);
    }
    .form-input::placeholder {
      color: var(--text-muted);
    }
    .form-hint {
      font-size: 0.75rem;
      color: var(--text-muted);
      margin-top: 0.5rem;
    }
    .checkbox-label {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      cursor: pointer;
      font-size: 0.875rem;
    }
    .checkbox-label input[type="checkbox"] {
      cursor: pointer;
    }
    /* 开关 */
    .toggle-switch {
      position: relative;
      width: 44px;
      height: 24px;
      margin: 0;
    }
    .toggle-switch input {
      opacity: 0;
      width: 0;
      height: 0;
    }
    .toggle-slider {
      position: absolute;
      cursor: pointer;
      inset: 0;
      background: var(--border);
      border-radius: 24px;
      transition: background 0.2s;
    }
    .toggle-slider::before {
      position: absolute;
      content: "";
      height: 18px;
      width: 18px;
      left: 3px;
      bottom: 3px;
      background: white;
      border-radius: 50%;
      transition: transform 0.2s;
    }
    .toggle-switch input:checked + .toggle-slider {
      background: var(--primary);
    }
    .toggle-switch input:checked + .toggle-slider::before {
      transform: translateX(20px);
    }
    /* 提供商网格 */
    .providers-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 1rem;
    }
    .provider-form-card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 0.75rem;
      padding: 1rem;
    }
    .provider-form-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1rem;
    }
    .provider-form-header h4 {
      font-size: 0.875rem;
      font-weight: 600;
    }
    .provider-status-badge {
      padding: 0.125rem 0.5rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      background: var(--bg);
      color: var(--text-secondary);
    }
    .provider-status-badge.configured {
      background: #dcfce7;
      color: #166534;
    }
    .provider-actions button {
      padding: 0.25rem 0.5rem;
      font-size: 0.75rem;
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 0.375rem;
      cursor: pointer;
    }
    .provider-actions button:hover {
      background: var(--border);
    }
    .provider-actions button.danger:hover {
      background: #fee2e2;
      color: #dc2626;
    }
    .channel-config-card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 0.75rem;
      padding: 1rem;
    }
    .channel-config-card .card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1rem;
    }
    .channel-form-fields {
      display: grid;
      gap: 0.75rem;
    }
    .channel-form-fields input:not([type="checkbox"]) {
      margin-bottom: 0;
    }
    .channel-form-fields .checkbox-label {
      margin-top: 0.5rem;
    }
    /* 保存结果 */
    .save-result {
      padding: 0.75rem;
      border-radius: 0.5rem;
      margin-top: 1rem;
      display: none;
    }
    .save-result.show {
      display: block;
    }
    .save-result.success {
      background: #dcfce7;
      color: #166534;
    }
    .save-result.error {
      background: #fee2e2;
      color: #dc2626;
    }
    .save-result.warning {
      background: #fef3c7;
      color: #92400e;
    }
    /* Modal */
    .modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.5);
      display: none;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    }
    .modal-overlay.show {
      display: flex;
    }
    .modal {
      background: var(--bg-card);
      border-radius: 0.75rem;
      padding: 1.5rem;
      max-width: 500px;
      width: 90%;
    }
    .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1rem;
    }
    .modal-header h3 {
      font-size: 1.125rem;
      font-weight: 600;
    }
    .modal-close {
      background: none;
      border: none;
      font-size: 1.5rem;
      cursor: pointer;
      color: var(--text-muted);
    }
    .modal-footer {
      display: flex;
      justify-content: flex-end;
      gap: 0.5rem;
      margin-top: 1rem;
    }
    .channels-form-grid {
      display: grid;
      gap: 1rem;
    }
  </style>
</head>
<body>
  <div class="layout">
    <aside class="sidebar">
      <div class="sidebar-header">
        <div class="sidebar-logo">
          <span>${MASCOT_SVG_MEDIUM}</span>
          <span>${assistantName}</span>
        </div>
      </div>
      <div class="nav-section">监控</div>
      <div class="nav-item active" data-view="overview">
        <span class="nav-item-icon">📊</span>
        <span>概览</span>
      </div>
      <div class="nav-item" data-view="sessions">
        <span class="nav-item-icon">💬</span>
        <span>会话</span>
      </div>
      <div class="nav-section">配置</div>
      <div class="nav-item" data-view="config">
        <span class="nav-item-icon">⚙️</span>
        <span>配置</span>
      </div>
      <div class="nav-item" data-view="providers">
        <span class="nav-item-icon">🤖</span>
        <span>模型提供商</span>
      </div>
      <div class="nav-item" data-view="channels">
        <span class="nav-item-icon">📱</span>
        <span>通讯通道</span>
      </div>
      <div class="nav-section">工具</div>
      <div class="nav-item" data-view="logs">
        <span class="nav-item-icon">📋</span>
        <span>日志</span>
      </div>
      <div style="flex:1"></div>
      <a href="/" class="nav-item">
        <span class="nav-item-icon">💬</span>
        <span>返回聊天</span>
      </a>
    </aside>

    <main class="main-content">
      <!-- 概览视图 -->
      <div class="view active" id="view-overview">
        <div class="page-header">
          <h1 class="page-title">系统概览</h1>
          <p class="page-desc">查看系统运行状态和关键指标</p>
        </div>
        <div class="cards">
          <div class="card">
            <div class="card-header">
              <span class="card-title">连接状态</span>
              <span class="card-icon">🔌</span>
            </div>
            <div id="connection-status">
              <span class="status-badge offline"><span class="status-dot"></span>连接中</span>
            </div>
          </div>
          <div class="card">
            <div class="card-header">
              <span class="card-title">运行时间</span>
              <span class="card-icon">⏱️</span>
            </div>
            <div class="card-value" id="uptime">--</div>
            <div class="card-label">自服务启动</div>
          </div>
          <div class="card">
            <div class="card-header">
              <span class="card-title">活跃会话</span>
              <span class="card-icon">👥</span>
            </div>
            <div class="card-value" id="session-count">0</div>
            <div class="card-label">当前连接数</div>
          </div>
          <div class="card">
            <div class="card-header">
              <span class="card-title">默认模型</span>
              <span class="card-icon">🧠</span>
            </div>
            <div class="card-value" style="font-size:1rem;word-break:break-all">${defaultModel}</div>
            <div class="card-label">${defaultProvider}</div>
          </div>
        </div>
        <div class="table-container">
          <div class="table-header">
            <span class="table-title">系统信息</span>
            <button class="btn btn-secondary" onclick="refreshStatus()">刷新</button>
          </div>
          <table>
            <tbody id="system-info">
              <tr><td>版本</td><td id="version">--</td></tr>
              <tr><td>模型提供商</td><td id="provider-count">--</td></tr>
              <tr><td>通讯通道</td><td id="channel-count">--</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- 会话视图 -->
      <div class="view" id="view-sessions">
        <div class="page-header">
          <h1 class="page-title">会话管理</h1>
          <p class="page-desc">查看和管理当前活跃的聊天会话</p>
        </div>
        <div class="table-container">
          <div class="table-header">
            <span class="table-title">活跃会话</span>
            <button class="btn btn-secondary" onclick="refreshSessions()">刷新</button>
          </div>
          <table>
            <thead>
              <tr>
                <th>会话 ID</th>
                <th>通道</th>
                <th>消息数</th>
                <th>最后活跃</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody id="sessions-list">
              <tr><td colspan="5" class="empty-state">暂无活跃会话</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- 模型提供商视图 -->
      <div class="view" id="view-providers">
        <div class="page-header">
          <h1 class="page-title">模型提供商</h1>
          <p class="page-desc">查看已配置的 AI 模型提供商和可用模型</p>
        </div>
        <div class="cards" id="providers-list">
          <div class="empty-state">
            <div class="empty-state-icon">🤖</div>
            <p>加载中...</p>
          </div>
        </div>
      </div>

      <!-- 通讯通道视图 -->
      <div class="view" id="view-channels">
        <div class="page-header">
          <h1 class="page-title">通讯通道</h1>
          <p class="page-desc">查看已配置的通讯平台连接状态</p>
        </div>
        <div class="table-container">
          <table>
            <thead>
              <tr>
                <th>通道</th>
                <th>状态</th>
                <th>类型</th>
              </tr>
            </thead>
            <tbody id="channels-list">
              <tr><td colspan="3" class="empty-state">加载中...</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- 配置视图 -->
      <div class="view" id="view-config">
        <div class="page-header">
          <h1 class="page-title">配置管理</h1>
          <p class="page-desc">可视化配置模型提供商、通讯通道和系统设置</p>
        </div>
        <div style="display:flex;gap:0.5rem;margin-bottom:1.5rem;flex-wrap:wrap;">
          <button class="btn btn-primary" onclick="loadConfig()">刷新配置</button>
          <button class="btn btn-secondary" onclick="saveAllConfig()">保存所有更改</button>
        </div>
        <div id="config-tabs" style="display:flex;gap:0.5rem;border-bottom:1px solid var(--border);padding-bottom:0.5rem;margin-bottom:1.5rem;">
          <button class="config-tab active" data-tab="agent">Agent</button>
          <button class="config-tab" data-tab="providers">模型提供商</button>
          <button class="config-tab" data-tab="channels">通讯通道</button>
          <button class="config-tab" data-tab="server">服务器</button>
          <button class="config-tab" data-tab="memory">记忆系统</button>
        </div>

        <!-- Agent 配置 -->
        <div class="config-content active" id="tab-agent">
          <div class="form-section">
            <h3 class="form-section-title">Agent 设置</h3>
            <div class="form-group">
              <label>默认提供商</label>
              <select id="agent-provider" class="form-input">
                <option value="deepseek">DeepSeek</option>
                <option value="doubao">豆包</option>
                <option value="minimax">MiniMax</option>
                <option value="kimi">Kimi</option>
                <option value="stepfun">阶跃星辰</option>
                <option value="modelscope">ModelScope</option>
                <option value="dashscope">DashScope (Qwen)</option>
                <option value="zhipu">智谱 AI</option>
                <option value="openai">OpenAI</option>
                <option value="ollama">Ollama</option>
                <option value="openrouter">OpenRouter</option>
                <option value="together">Together AI</option>
                <option value="groq">Groq</option>
                <option value="custom-openai">自定义 OpenAI</option>
                <option value="custom-anthropic">自定义 Anthropic</option>
              </select>
            </div>
            <div class="form-group">
              <label>默认模型</label>
              <input type="text" id="agent-model" class="form-input" placeholder="例如: deepseek-chat" />
            </div>
            <div class="form-row">
              <div class="form-group">
                <label>Temperature</label>
                <input type="number" id="agent-temperature" class="form-input" step="0.1" min="0" max="2" placeholder="0.7" />
              </div>
              <div class="form-group">
                <label>Max Tokens</label>
                <input type="number" id="agent-max-tokens" class="form-input" min="1" placeholder="4096" />
              </div>
            </div>
            <div class="form-group">
              <label>系统提示词</label>
              <textarea id="agent-system-prompt" class="form-input" rows="4" placeholder="自定义系统提示词..."></textarea>
            </div>
          </div>
        </div>

        <!-- 提供商配置 -->
        <div class="config-content" id="tab-providers">
          <div class="form-section">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;">
              <h3 class="form-section-title">模型提供商</h3>
              <button class="btn btn-secondary" onclick="showAddProviderModal()">+ 添加提供商</button>
            </div>
            <div id="providers-list-form" class="providers-grid"></div>
          </div>
        </div>

        <!-- 通道配置 -->
        <div class="config-content" id="tab-channels">
          <div class="form-section">
            <h3 class="form-section-title">通讯通道</h3>
            <div class="channels-form-grid">
              <div class="channel-config-card">
                <div class="card-header">
                  <span class="card-title">飞书</span>
                  <label class="toggle-switch">
                    <input type="checkbox" id="feishu-enabled" />
                    <span class="toggle-slider"></span>
                  </label>
                </div>
                <div class="channel-form-fields">
                  <input type="text" id="feishu-app-id" class="form-input" placeholder="App ID" />
                  <input type="password" id="feishu-app-secret" class="form-input" placeholder="App Secret" />
                </div>
              </div>
              <div class="channel-config-card">
                <div class="card-header">
                  <span class="card-title">钉钉</span>
                  <label class="toggle-switch">
                    <input type="checkbox" id="dingtalk-enabled" />
                    <span class="toggle-slider"></span>
                  </label>
                </div>
                <div class="channel-form-fields">
                  <input type="text" id="dingtalk-app-key" class="form-input" placeholder="App Key" />
                  <input type="password" id="dingtalk-app-secret" class="form-input" placeholder="App Secret" />
                  <input type="text" id="dingtalk-robot-code" class="form-input" placeholder="Robot Code (可选)" />
                </div>
              </div>
              <div class="channel-config-card">
                <div class="card-header">
                  <span class="card-title">QQ</span>
                  <label class="toggle-switch">
                    <input type="checkbox" id="qq-enabled" />
                    <span class="toggle-slider"></span>
                  </label>
                </div>
                <div class="channel-form-fields">
                  <input type="text" id="qq-app-id" class="form-input" placeholder="App ID" />
                  <input type="password" id="qq-client-secret" class="form-input" placeholder="Client Secret" />
                  <label class="checkbox-label">
                    <input type="checkbox" id="qq-sandbox" />
                    <span>沙箱环境</span>
                  </label>
                </div>
              </div>
              <div class="channel-config-card">
                <div class="card-header">
                  <span class="card-title">企业微信</span>
                  <label class="toggle-switch">
                    <input type="checkbox" id="wecom-enabled" />
                    <span class="toggle-slider"></span>
                  </label>
                </div>
                <div class="channel-form-fields">
                  <input type="text" id="wecom-corp-id" class="form-input" placeholder="Corp ID" />
                  <input type="password" id="wecom-corp-secret" class="form-input" placeholder="Corp Secret" />
                  <input type="number" id="wecom-agent-id" class="form-input" placeholder="Agent ID" />
                  <input type="text" id="wecom-token" class="form-input" placeholder="Token (可选)" />
                  <input type="text" id="wecom-encoding-aes-key" class="form-input" placeholder="Encoding AES Key (可选)" />
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 服务器配置 -->
        <div class="config-content" id="tab-server">
          <div class="form-section">
            <h3 class="form-section-title">服务器设置</h3>
            <div class="form-row">
              <div class="form-group">
                <label>端口</label>
                <input type="number" id="server-port" class="form-input" min="1" max="65535" />
              </div>
              <div class="form-group">
                <label>主机</label>
                <input type="text" id="server-host" class="form-input" placeholder="0.0.0.0" />
              </div>
            </div>
            <div class="form-group">
              <label>日志级别</label>
              <select id="logging-level" class="form-input">
                <option value="debug">Debug</option>
                <option value="info">Info</option>
                <option value="warn">Warn</option>
                <option value="error">Error</option>
              </select>
            </div>
            <p class="form-hint">修改服务器端口需要重启服务才能生效</p>
          </div>
        </div>

        <!-- 记忆系统配置 -->
        <div class="config-content" id="tab-memory">
          <div class="form-section">
            <h3 class="form-section-title">记忆系统</h3>
            <div class="form-group">
              <label class="checkbox-label">
                <input type="checkbox" id="memory-enabled" />
                <span>启用长期记忆</span>
              </label>
              <p class="form-hint">让 Agent 跨会话记住用户偏好和重要信息</p>
            </div>
            <div class="form-group">
              <label>存储目录</label>
              <input type="text" id="memory-directory" class="form-input" placeholder="~/.mozi/memory" />
            </div>
          </div>
        </div>

        <!-- 保存结果 -->
        <div id="save-result" class="save-result"></div>
      </div>

      <!-- 日志视图 -->
      <div class="view" id="view-logs">
        <div class="page-header">
          <h1 class="page-title">系统日志</h1>
          <p class="page-desc">实时查看系统运行日志</p>
        </div>
        <div class="log-container" id="log-container">
          <div class="log-entry info"><span class="time">[--:--:--]</span> 等待连接...</div>
        </div>
      </div>
    </main>
  </div>

  <!-- 添加提供商 Modal -->
  <div class="modal-overlay" id="add-provider-modal">
    <div class="modal">
      <div class="modal-header">
        <h3>添加提供商</h3>
        <button class="modal-close" onclick="hideAddProviderModal()">&times;</button>
      </div>
      <div class="form-group">
        <label>提供商类型</label>
        <select id="new-provider-type" class="form-input" onchange="updateProviderModalFields()">
          <option value="deepseek">DeepSeek</option>
          <option value="doubao">豆包</option>
          <option value="minimax">MiniMax</option>
          <option value="kimi">Kimi</option>
          <option value="stepfun">阶跃星辰</option>
          <option value="modelscope">ModelScope</option>
          <option value="dashscope">DashScope (Qwen)</option>
          <option value="zhipu">智谱 AI</option>
          <option value="openai">OpenAI</option>
          <option value="ollama">Ollama</option>
          <option value="openrouter">OpenRouter</option>
          <option value="together">Together AI</option>
          <option value="groq">Groq</option>
          <option value="custom-openai">自定义 OpenAI</option>
          <option value="custom-anthropic">自定义 Anthropic</option>
        </select>
      </div>
      <div class="form-group" id="new-provider-base-url-group" style="display:none;">
        <label>Base URL</label>
        <input type="text" id="new-provider-base-url" class="form-input" placeholder="例如: https://api.openai.com/v1" />
      </div>
      <div class="form-group" id="new-provider-name-group" style="display:none;">
        <label>显示名称</label>
        <input type="text" id="new-provider-name" class="form-input" placeholder="例如: My OpenAI" />
      </div>
      <div class="form-group" id="new-provider-group-id-group" style="display:none;">
        <label>Group ID (MiniMax)</label>
        <input type="text" id="new-provider-group-id" class="form-input" placeholder="Group ID" />
      </div>
      <div class="form-group">
        <label>API Key</label>
        <input type="password" id="new-provider-api-key" class="form-input" placeholder="输入 API Key" />
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="hideAddProviderModal()">取消</button>
        <button class="btn btn-primary" onclick="addProvider()">添加</button>
      </div>
    </div>
  </div>

  <script>
    let ws = null;
    let pendingRequests = new Map();
    let requestId = 0;
    let systemStatus = null;

    // 导航
    document.querySelectorAll('.nav-item[data-view]').forEach(item => {
      item.addEventListener('click', () => {
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        item.classList.add('active');
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        document.getElementById('view-' + item.dataset.view).classList.add('active');

        // 切换到配置页面时自动加载配置
        if (item.dataset.view === 'config' && ws?.readyState === WebSocket.OPEN) {
          loadConfig();
        }
      });
    });

    // WebSocket 连接
    function connect() {
      const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      ws = new WebSocket(protocol + '//' + location.host + '/ws');

      ws.onopen = () => {
        document.getElementById('connection-status').innerHTML =
          '<span class="status-badge online"><span class="status-dot"></span>已连接</span>';
        addLog('info', '已连接到服务器');
        refreshStatus();
      };

      ws.onclose = () => {
        document.getElementById('connection-status').innerHTML =
          '<span class="status-badge offline"><span class="status-dot"></span>已断开</span>';
        addLog('warn', '连接已断开，正在重连...');
        setTimeout(connect, 3000);
      };

      ws.onmessage = (event) => {
        try {
          const frame = JSON.parse(event.data);
          console.log('收到 WebSocket 消息:', frame);
          if (frame.type === 'res') {
            const pending = pendingRequests.get(frame.id);
            if (pending) {
              pendingRequests.delete(frame.id);
              if (frame.ok) {
                console.log('请求成功:', frame.id, frame.payload);
                pending.resolve(frame.payload);
              } else {
                console.error('请求失败:', frame.id, frame.error);
                pending.reject(new Error(frame.error?.message || 'Unknown error'));
              }
            } else {
              console.warn('未找到挂起请求:', frame.id);
            }
          }
        } catch (e) {
          console.error('Parse error:', e);
        }
      };
    }

    function request(method, params) {
      return new Promise((resolve, reject) => {
        const id = String(++requestId);
        pendingRequests.set(id, { resolve, reject });
        ws.send(JSON.stringify({ type: 'req', id, method, params }));
      });
    }

    async function refreshStatus() {
      try {
        systemStatus = await request('status.get');
        updateOverview(systemStatus);
        updateProviders(systemStatus);
        updateChannels(systemStatus);
        addLog('info', '状态已刷新');
      } catch (e) {
        addLog('error', '获取状态失败: ' + e.message);
      }
    }

    function updateOverview(status) {
      document.getElementById('version').textContent = status.version || '--';
      document.getElementById('session-count').textContent = status.sessions || 0;
      document.getElementById('provider-count').textContent = (status.providers || []).length + ' 个';
      document.getElementById('channel-count').textContent = (status.channels || []).length + ' 个';

      const uptime = status.uptime || 0;
      const hours = Math.floor(uptime / 3600000);
      const mins = Math.floor((uptime % 3600000) / 60000);
      document.getElementById('uptime').textContent = hours + 'h ' + mins + 'm';
    }

    function updateProviders(status) {
      const providers = status.providers || [];
      const container = document.getElementById('providers-list');

      if (providers.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🤖</div><p>暂无已配置的提供商</p></div>';
        return;
      }

      container.innerHTML = providers.map(p => \`
        <div class="card">
          <div class="card-header">
            <span class="card-title">\${p.name || p.id}</span>
            <span class="status-badge \${p.available ? 'online' : 'offline'}">
              <span class="status-dot"></span>\${p.available ? '可用' : '不可用'}
            </span>
          </div>
          <div class="card-label">ID: \${p.id}</div>
        </div>
      \`).join('');
    }

    function updateChannels(status) {
      const channels = status.channels || [];
      const tbody = document.getElementById('channels-list');

      // 添加 WebChat
      const allChannels = [
        { id: 'webchat', name: 'WebChat', connected: true },
        ...channels
      ];

      tbody.innerHTML = allChannels.map(c => \`
        <tr>
          <td>\${c.name || c.id}</td>
          <td>
            <span class="status-badge \${c.connected ? 'online' : 'offline'}">
              <span class="status-dot"></span>\${c.connected ? '已连接' : '未连接'}
            </span>
          </td>
          <td>\${c.id}</td>
        </tr>
      \`).join('');
    }

    function refreshSessions() {
      // 会话数据通过 status 获取
      addLog('info', '会话列表已刷新');
    }

    function addLog(level, message) {
      const container = document.getElementById('log-container');
      const time = new Date().toLocaleTimeString();
      const entry = document.createElement('div');
      entry.className = 'log-entry ' + level;
      entry.innerHTML = '<span class="time">[' + time + ']</span> ' + message;
      container.appendChild(entry);
      container.scrollTop = container.scrollHeight;

      // 限制日志数量
      while (container.children.length > 100) {
        container.removeChild(container.firstChild);
      }
    }

    // ===== 配置管理 =====
    let currentConfig = null;
    let pendingProviders = {};  // 临时保存提供商数据

    // 配置标签切换
    document.querySelectorAll('.config-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.config-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        document.querySelectorAll('.config-content').forEach(c => c.classList.remove('active'));
        document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
      });
    });

    // 加载配置
    async function loadConfig() {
      try {
        console.log('开始加载配置...');
        if (ws?.readyState !== WebSocket.OPEN) {
          console.warn('WebSocket 未连接，等待连接...');
          // 等待连接后加载
          const waitConnection = new Promise(resolve => {
            const check = () => {
              if (ws?.readyState === WebSocket.OPEN) {
                resolve();
              } else {
                setTimeout(check, 500);
              }
            };
            check();
          });
          await waitConnection;
        }
        console.log('发送 config.get 请求...');
        currentConfig = await request('config.get');
        console.log('收到配置数据:', currentConfig);
        populateConfigForm(currentConfig);
        hideSaveResult();
        addLog('info', '配置已加载');
      } catch (e) {
        console.error('加载配置失败:', e);
        addLog('error', '加载配置失败: ' + e.message);
        showSaveResult('error', '加载配置失败: ' + e.message);
      }
    }

    // 填充表单
    function populateConfigForm(config) {
      console.log('populateConfigForm 调用，配置:', config);

      // Agent 配置
      if (config.agent) {
        const providerSelect = document.getElementById('agent-provider');
        if (providerSelect) {
          providerSelect.value = config.agent.defaultProvider || 'deepseek';
          console.log('设置提供商值:', providerSelect.value);
        }
        document.getElementById('agent-model').value = config.agent.defaultModel || '';
        document.getElementById('agent-temperature').value = config.agent.temperature || '';
        document.getElementById('agent-max-tokens').value = config.agent.maxTokens || '';
        document.getElementById('agent-system-prompt').value = config.agent.systemPrompt || '';
      }

      // 提供商列表
      populateProvidersForm(config.providers);

      // 通道配置
      if (config.channels) {
        populateChannelsForm(config.channels);
      }

      // 服务器配置
      if (config.server) {
        document.getElementById('server-port').value = config.server.port || 3000;
        document.getElementById('server-host').value = config.server.host || '0.0.0.0';
      }

      // 日志配置
      if (config.logging) {
        document.getElementById('logging-level').value = config.logging.level || 'info';
      }

      // 记忆系统配置
      if (config.memory) {
        document.getElementById('memory-enabled').checked = config.memory.enabled !== false;
        document.getElementById('memory-directory').value = config.memory.directory || '';
      }
    }

    // 填充提供商列表
    function populateProvidersForm(providers) {
      const container = document.getElementById('providers-list-form');
      if (!providers || Object.keys(providers).length === 0) {
        container.innerHTML = '<div style="grid-column:1/-1;padding:2rem;text-align:center;color:var(--text-muted);">暂无配置的提供商</div>';
        return;
      }

      const providerNames = {
        deepseek: 'DeepSeek', doubao: '豆包', minimax: 'MiniMax', kimi: 'Kimi',
        stepfun: '阶跃星辰', modelscope: 'ModelScope', dashscope: 'DashScope',
        zhipu: '智谱 AI', openai: 'OpenAI', ollama: 'Ollama',
        openrouter: 'OpenRouter', together: 'Together AI', groq: 'Groq',
        'custom-openai': '自定义 OpenAI', 'custom-anthropic': '自定义 Anthropic'
      };

      container.innerHTML = Object.entries(providers).map(([id, p]) => \`
        <div class="provider-form-card" data-provider-id="\${id}">
          <div class="provider-form-header">
            <h4>\${p.name || providerNames[id] || id}</h4>
            <span class="provider-status-badge \${p.hasApiKey ? 'configured' : ''}">
              \${p.hasApiKey ? '已配置' : '未配置'}
            </span>
          </div>
          <div class="provider-actions">
            <button onclick="editProvider('\${id}')">编辑</button>
            <button class="danger" onclick="removeProvider('\${id}')">删除</button>
          </div>
        </div>
      \`).join('');
    }

    // 填充通道配置
    function populateChannelsForm(channels) {
      // 先重置所有通道为未配置状态
      document.getElementById('feishu-enabled').checked = false;
      document.getElementById('feishu-app-id').value = '';
      document.getElementById('feishu-app-secret').value = '';

      document.getElementById('dingtalk-enabled').checked = false;
      document.getElementById('dingtalk-app-key').value = '';
      document.getElementById('dingtalk-app-secret').value = '';
      document.getElementById('dingtalk-robot-code').value = '';

      document.getElementById('qq-enabled').checked = false;
      document.getElementById('qq-app-id').value = '';
      document.getElementById('qq-client-secret').value = '';
      document.getElementById('qq-sandbox').checked = false;

      document.getElementById('wecom-enabled').checked = false;
      document.getElementById('wecom-corp-id').value = '';
      document.getElementById('wecom-corp-secret').value = '';
      document.getElementById('wecom-agent-id').value = '';
      document.getElementById('wecom-token').value = '';
      document.getElementById('wecom-encoding-aes-key').value = '';

      // 飞书 - 只要有配置就启用
      const feishu = channels.feishu;
      if (feishu) {
        console.log('加载飞书配置:', feishu);
        // 有 appId 就认为是已配置
        const hasConfig = !!feishu.appId || !!feishu.appSecret;
        document.getElementById('feishu-enabled').checked = hasConfig && feishu.enabled !== false;
        document.getElementById('feishu-app-id').value = feishu.appId || '';
        // App Secret 不显示，用占位符
        document.getElementById('feishu-app-secret').value = '';
      }
      // 钉钉 - 只要有配置就启用
      const dingtalk = channels.dingtalk;
      if (dingtalk) {
        console.log('加载钉钉配置:', dingtalk);
        const hasConfig = !!dingtalk.appKey || !!dingtalk.appSecret || !!dingtalk.robotCode;
        document.getElementById('dingtalk-enabled').checked = hasConfig && dingtalk.enabled !== false;
        document.getElementById('dingtalk-app-key').value = dingtalk.appKey || '';
        document.getElementById('dingtalk-robot-code').value = dingtalk.robotCode || '';
      }
      // QQ - 只要有配置就启用
      const qq = channels.qq;
      if (qq) {
        console.log('加载 QQ 配置:', qq);
        const hasConfig = !!qq.appId || !!qq.clientSecret;
        document.getElementById('qq-enabled').checked = hasConfig && qq.enabled !== false;
        document.getElementById('qq-app-id').value = qq.appId || '';
        document.getElementById('qq-sandbox').checked = qq.sandbox || false;
      }
      // 企业微信 - 只要有配置就启用
      const wecom = channels.wecom;
      if (wecom) {
        console.log('加载企业微信配置:', wecom);
        const hasConfig = !!wecom.corpId || !!wecom.corpSecret || !!wecom.agentId || !!wecom.token || !!wecom.encodingAESKey;
        document.getElementById('wecom-enabled').checked = hasConfig && wecom.enabled !== false;
        document.getElementById('wecom-corp-id').value = wecom.corpId || '';
        document.getElementById('wecom-agent-id').value = wecom.agentId || '';
        document.getElementById('wecom-token').value = wecom.token || '';
        document.getElementById('wecom-encoding-aes-key').value = wecom.encodingAESKey || '';
      }
    }

    // 显示添加提供商 Modal
    function showAddProviderModal() {
      document.getElementById('add-provider-modal').classList.add('show');
      updateProviderModalFields();
    }

    // 隐藏添加提供商 Modal
    function hideAddProviderModal() {
      document.getElementById('add-provider-modal').classList.remove('show');
      // 清空表单
      document.getElementById('new-provider-api-key').value = '';
      document.getElementById('new-provider-base-url').value = '';
      document.getElementById('new-provider-name').value = '';
      document.getElementById('new-provider-group-id').value = '';
    }

    // 更新提供商 Modal 字段显示
    function updateProviderModalFields() {
      const type = document.getElementById('new-provider-type').value;
      const baseUrlGroup = document.getElementById('new-provider-base-url-group');
      const nameGroup = document.getElementById('new-provider-name-group');
      const groupIdGroup = document.getElementById('new-provider-group-id-group');

      baseUrlGroup.style.display = (type === 'custom-openai' || type === 'custom-anthropic') ? 'block' : 'none';
      nameGroup.style.display = (type === 'custom-openai' || type === 'custom-anthropic') ? 'block' : 'none';
      groupIdGroup.style.display = type === 'minimax' ? 'block' : 'none';
    }

    // 添加提供商
    function addProvider() {
      const type = document.getElementById('new-provider-type').value;
      const apiKey = document.getElementById('new-provider-api-key').value.trim();
      const baseUrl = document.getElementById('new-provider-base-url').value.trim();
      const name = document.getElementById('new-provider-name').value.trim();
      const groupId = document.getElementById('new-provider-group-id').value.trim();

      if (!apiKey) {
        alert('请输入 API Key');
        return;
      }

      if ((type === 'custom-openai' || type === 'custom-anthropic') && !baseUrl) {
        alert('请输入 Base URL');
        return;
      }

      // 保存到 pendingProviders，包含 apiKey
      pendingProviders[type] = {
        id: type,
        name: name || undefined,
        baseUrl: baseUrl || undefined,
        groupId: groupId || undefined,
        hasApiKey: true,
        apiKey: apiKey  // 保存 apiKey
      };

      hideAddProviderModal();
      // 刷新提供商列表显示
      if (currentConfig) {
        const mergedProviders = { ...currentConfig.providers, ...pendingProviders };
        populateProvidersForm(mergedProviders);
      }

      showSaveResult('success', '提供商已添加（请点击保存使更改生效）');
    }

    // 编辑提供商
    function editProvider(id) {
      const provider = currentConfig?.providers[id];
      if (!provider) return;

      const apiKey = prompt('请输入新的 API Key（留空保持不变）:');
      if (apiKey === null) return;

      if (apiKey) {
        pendingProviders[id] = {
          ...provider,
          hasApiKey: true,
          apiKey: apiKey  // 保存新的 apiKey
        };
        showSaveResult('success', '提供商已更新（请点击保存使更改生效）');
      }
    }

    // 删除提供商
    function removeProvider(id) {
      if (!confirm('确定要删除此提供商吗？')) return;

      pendingProviders[id] = { id: id, hasApiKey: false };
      const mergedProviders = { ...currentConfig.providers };
      delete mergedProviders[id];
      populateProvidersForm(mergedProviders);

      showSaveResult('success', '提供商已删除（请点击保存使更改生效）');
    }

    // 保存所有配置
    async function saveAllConfig() {
      try {
        hideSaveResult();

        // 构建配置对象
        const configToSave = {};

        // Agent 配置
        const agentProvider = document.getElementById('agent-provider').value;
        const agentModel = document.getElementById('agent-model').value.trim();
        const agentTemperatureStr = document.getElementById('agent-temperature').value;
        const agentMaxTokensStr = document.getElementById('agent-max-tokens').value;
        const agentSystemPrompt = document.getElementById('agent-system-prompt').value.trim();

        // 只要任何字段与当前配置不同，就需要保存
        const currentAgent = currentConfig && currentConfig.agent ? currentConfig.agent : {};
        const agentChanged =
          agentProvider !== (currentAgent.defaultProvider || '') ||
          agentModel !== (currentAgent.defaultModel || '') ||
          agentTemperatureStr !== String(currentAgent.temperature || '') ||
          agentMaxTokensStr !== String(currentAgent.maxTokens || '') ||
          agentSystemPrompt !== (currentAgent.systemPrompt || '');

        const agentTemperature = parseFloat(agentTemperatureStr);
        const agentMaxTokens = parseInt(agentMaxTokensStr, 10);

        if (agentChanged || agentModel || agentSystemPrompt || !isNaN(agentTemperature) || !isNaN(agentMaxTokens)) {
          configToSave.agent = {
            defaultProvider: agentProvider || currentAgent.defaultProvider || 'deepseek',
            defaultModel: agentModel || currentAgent.defaultModel || '',
            ...(agentTemperature >= 0 && { temperature: agentTemperature }),
            ...(agentMaxTokens > 0 && { maxTokens: agentMaxTokens }),
            ...(agentSystemPrompt && { systemPrompt: agentSystemPrompt })
          };
        }

        // 提供商配置
        if (Object.keys(pendingProviders).length > 0) {
          configToSave.providers = pendingProviders;
        }

        // 通道配置 - 始终包含每个通道的配置状态
        const channels = {};

        // 飞书 - 如果填写了 appId 或 appSecret，自动启用
        const feishuEnabled = document.getElementById('feishu-enabled').checked;
        const feishuAppId = document.getElementById('feishu-app-id').value.trim();
        const feishuAppSecret = document.getElementById('feishu-app-secret').value.trim();
        const feishuHasConfig = feishuEnabled || feishuAppId || feishuAppSecret;
        if (feishuHasConfig) {
          channels.feishu = {
            hasConfig: true,
            enabled: feishuEnabled || feishuAppId || feishuAppSecret,
            ...(feishuAppId && { appId: feishuAppId }),
            ...(feishuAppSecret && { appSecret: feishuAppSecret })
          };
        } else {
          channels.feishu = { hasConfig: false };
        }

        // 钉钉 - 如果填写了任何配置，自动启用
        const dingtalkEnabled = document.getElementById('dingtalk-enabled').checked;
        const dingtalkAppKey = document.getElementById('dingtalk-app-key').value.trim();
        const dingtalkAppSecret = document.getElementById('dingtalk-app-secret').value.trim();
        const dingtalkRobotCode = document.getElementById('dingtalk-robot-code').value.trim();
        const dingtalkHasConfig = dingtalkEnabled || dingtalkAppKey || dingtalkAppSecret || dingtalkRobotCode;
        if (dingtalkHasConfig) {
          channels.dingtalk = {
            hasConfig: true,
            enabled: dingtalkHasConfig,
            ...(dingtalkAppKey && { appKey: dingtalkAppKey }),
            ...(dingtalkAppSecret && { appSecret: dingtalkAppSecret }),
            ...(dingtalkRobotCode && { robotCode: dingtalkRobotCode })
          };
        } else {
          channels.dingtalk = { hasConfig: false };
        }

        // QQ - 如果填写了任何配置，自动启用
        const qqEnabled = document.getElementById('qq-enabled').checked;
        const qqAppId = document.getElementById('qq-app-id').value.trim();
        const qqClientSecret = document.getElementById('qq-client-secret').value.trim();
        const qqSandbox = document.getElementById('qq-sandbox').checked;
        const qqHasConfig = qqEnabled || qqAppId || qqClientSecret;
        if (qqHasConfig) {
          channels.qq = {
            hasConfig: true,
            enabled: qqHasConfig,
            ...(qqAppId && { appId: qqAppId }),
            ...(qqClientSecret && { clientSecret: qqClientSecret }),
            ...(qqSandbox && { sandbox: qqSandbox })
          };
        } else {
          channels.qq = { hasConfig: false };
        }

        // 企业微信 - 如果填写了任何配置，自动启用
        const wecomEnabled = document.getElementById('wecom-enabled').checked;
        const wecomCorpId = document.getElementById('wecom-corp-id').value.trim();
        const wecomCorpSecret = document.getElementById('wecom-corp-secret').value.trim();
        const wecomAgentId = parseInt(document.getElementById('wecom-agent-id').value, 10);
        const wecomToken = document.getElementById('wecom-token').value.trim();
        const wecomEncodingAESKey = document.getElementById('wecom-encoding-aes-key').value.trim();
        const wecomHasConfig = wecomEnabled || wecomCorpId || wecomCorpSecret || wecomAgentId || wecomToken || wecomEncodingAESKey;
        if (wecomHasConfig) {
          channels.wecom = {
            hasConfig: true,
            enabled: wecomHasConfig,
            ...(wecomCorpId && { corpId: wecomCorpId }),
            ...(wecomCorpSecret && { corpSecret: wecomCorpSecret }),
            ...(wecomAgentId && { agentId: wecomAgentId }),
            ...(wecomToken && { token: wecomToken }),
            ...(wecomEncodingAESKey && { encodingAESKey: wecomEncodingAESKey })
          };
        } else {
          channels.wecom = { hasConfig: false };
        }

        if (Object.keys(channels).length > 0) {
          configToSave.channels = channels;
        }

        // 服务器配置
        const serverPortStr = document.getElementById('server-port').value;
        const serverPort = parseInt(serverPortStr, 10);
        const serverHost = document.getElementById('server-host').value.trim();

        // 检查配置是否有变化
        const currentServer = currentConfig && currentConfig.server ? currentConfig.server : {};
        const serverChanged =
          serverPortStr !== String(currentServer.port || '3000') ||
          serverHost !== (currentServer.host || '0.0.0.0');

        if ((serverPort > 0 && serverPort <= 65535 && serverHost) || serverChanged) {
          configToSave.server = {
            port: serverPort > 0 ? serverPort : currentServer.port || 3000,
            host: serverHost || currentServer.host || '0.0.0.0'
          };
        }

        // 日志配置
        const logLevel = document.getElementById('logging-level').value;
        const currentLogging = currentConfig && currentConfig.logging ? currentConfig.logging : {};
        const logLevelChanged = logLevel !== (currentLogging.level || 'info');
        if (logLevelChanged) {
          configToSave.logging = { level: logLevel };
        }

        // 记忆系统配置
        const memoryEnabled = document.getElementById('memory-enabled').checked;
        const memoryDir = document.getElementById('memory-directory').value.trim();
        const currentMemory = currentConfig && currentConfig.memory ? currentConfig.memory : {};
        const memoryChanged =
          memoryEnabled !== (currentMemory.enabled || false) ||
          memoryDir !== (currentMemory.directory || '');

        if (memoryChanged) {
          configToSave.memory = {
            enabled: memoryEnabled,
            ...(memoryDir && { directory: memoryDir })
          };
        }

        // 保存
        const result = await request('config.save', configToSave);

        if (result.success) {
          showSaveResult(result.requiresRestart ? 'warning' : 'success', result.message);
          // 清空 pending
          pendingProviders = {};
          // 重新加载配置
          await loadConfig();
          addLog('info', result.message);
        } else {
          showSaveResult('error', result.message || '保存失败');
        }

      } catch (e) {
        addLog('error', '保存配置失败: ' + e.message);
        showSaveResult('error', '保存配置失败: ' + e.message);
      }
    }

    // 显示保存结果
    function showSaveResult(type, message) {
      const resultEl = document.getElementById('save-result');
      resultEl.textContent = message;
      resultEl.className = 'save-result show ' + type;
      // 5秒后隐藏
      setTimeout(() => {
        hideSaveResult();
      }, 5000);
    }

    // 隐藏保存结果
    function hideSaveResult() {
      const resultEl = document.getElementById('save-result');
      resultEl.className = 'save-result';
      resultEl.textContent = '';
    }

    // 启动
    connect();
  </script>
</body>
</html>`;
}

/** 静态文件服务选项 */
export interface StaticServerOptions {
  config: MoziConfig;
}

/** 处理静态文件请求 */
export function handleStaticRequest(
  req: IncomingMessage,
  res: ServerResponse,
  options: StaticServerOptions
): boolean {
  const url = req.url || "/";
  const pathname = url.split("?")[0] || "/";

  // WebSocket 路径跳过
  if (pathname === "/ws") {
    return false;
  }

  // API 路径跳过
  if (pathname.startsWith("/api/") || pathname.startsWith("/webhook/") || pathname.startsWith("/feishu/") || pathname.startsWith("/dingtalk/")) {
    return false;
  }

  // 健康检查跳过
  if (pathname === "/health") {
    return false;
  }

  // Control UI
  if (pathname === "/control" || pathname === "/control/") {
    const html = getControlHtml(options.config);
    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Length": Buffer.byteLength(html),
    });
    res.end(html);
    return true;
  }

  // 根路径或 index.html - 返回 WebChat HTML
  if (pathname === "/" || pathname === "/index.html") {
    const html = getEmbeddedHtml(options.config);
    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Length": Buffer.byteLength(html),
    });
    res.end(html);
    return true;
  }

  // 其他静态文件 - 暂不支持外部文件
  // 可以后续添加从 public 目录读取文件的功能

  return false;
}
