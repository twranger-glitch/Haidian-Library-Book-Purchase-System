import React, { useState, useEffect, Component, useRef, useMemo, useCallback } from 'react';
import { initializeApp } from "firebase/app";
import { getAuth, onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut, signInAnonymously, signInWithCustomToken } from "firebase/auth";
import { getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager, collection, onSnapshot, doc, updateDoc, addDoc, arrayUnion, arrayRemove, setDoc, getDoc, writeBatch, deleteDoc } from "firebase/firestore";

// --- 圖示索引表 (對應 Google Material Symbols) ---
const ICON_REGISTRY = {
   'alert-triangle': 'warning', 'image-off': 'image_not_supported', 'heart': 'favorite',
   'ticket': 'local_activity', 'party-popper': 'celebration', 'info': 'info',
   'book-open': 'menu_book', 'pen-tool': 'edit_square', 'target': 'my_location',
   'user': 'person', 'user-circle-2': 'account_circle', 'barcode': 'barcode_scanner',
   'calendar-days': 'calendar_month', 'circle-dollar-sign': 'monetization_on', 'badge-info': 'new_releases',
   'building-2': 'domain', 'check-circle-2': 'check_circle', 'clock': 'schedule',
   'ticket-check': 'airplane_ticket', 'alert-circle': 'error', 'quote': 'format_quote',
   'x': 'close', 'sparkles': 'auto_awesome', 'key-round': 'key', 'library': 'local_library',
   'bell': 'notifications', 'log-out': 'logout', 'log-in': 'login', 'list-filter': 'filter_list',
   'search-x': 'search_off', 'book-dashed': 'library_books', 'edit-3': 'edit',
   'send': 'send', 'inbox': 'inbox', 'lightbulb': 'lightbulb', 'book-heart': 'favorite',
   'loader-2': 'autorenew', 'award': 'emoji_events', 'history': 'history', 'trash': 'delete_forever',
   'lock': 'lock', 'search': 'search', 'fire': 'local_fire_department', 'map': 'map'
};

// --- 通用圖示組件 ---
const Icon = React.memo(({ name, className = "w-5 h-5", fill = "none", strokeWidth = 2 }) => {
  const materialName = ICON_REGISTRY[name] || 'help';
  const isFilled = fill === 'currentColor' || fill !== 'none';
  let sizeClass = 'text-[1.25rem]'; 
  if (className.includes('w-3.5')) sizeClass = 'text-[0.875rem]';
  else if (className.includes('w-4')) sizeClass = 'text-[1rem]';
  else if (className.includes('w-5')) sizeClass = 'text-[1.25rem]';
  else if (className.includes('w-6')) sizeClass = 'text-[1.5rem]';
  else if (className.includes('w-7')) sizeClass = 'text-[1.75rem]';
  const cleanedClass = className.replace(/\bw-\S+/g, '').replace(/\bh-\S+/g, '').trim();

  return (
    <span
      className={`material-symbols-rounded shrink-0 flex items-center justify-center leading-none ${sizeClass} ${cleanedClass}`}
      aria-hidden="true"
      style={{ fontVariationSettings: `'FILL' ${isFilled ? 1 : 0}, 'wght' ${strokeWidth > 1 ? 600 : 400}`, width: '1em', height: '1em' }}
    >
      {materialName}
    </span>
  );
});

// --- Firebase 初始化 ---
const FALLBACK_CONFIG = {
  apiKey: "AIzaSyA4gSwrBmvv0pThiWdS27zWWY0i--e2xv4",
  authDomain: "book-purchase-system.firebaseapp.com",
  projectId: "book-purchase-system",
  storageBucket: "book-purchase-system.firebasestorage.app",
  messagingSenderId: "659149394622",
  appId: "1:659149394622:web:4505c2d1cbb3e94d83c4ef"
};

const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : FALLBACK_CONFIG;
const app = initializeApp(firebaseConfig);

const isIOSSafari = /iP(hone|ad|od)/i.test(navigator.userAgent) && /WebKit/i.test(navigator.userAgent) && !/CriOS|FxiOS|EdgiOS|OPiOS|mercury/i.test(navigator.userAgent);
let db;
try {
  db = initializeFirestore(app, { 
    localCache: persistentLocalCache({tabManager: persistentMultipleTabManager()}),
    experimentalForceLongPolling: isIOSSafari 
  });
} catch (e) {
  db = getFirestore(app);
}

const auth = getAuth(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : "school-library-app";

// --- 固定資料集 ---
const AUTHORS = ['齊藤洋', '張友漁', '艾琳．杭特', '原京子', '原裕', '王文華', '林哲璋', '王淑芬', '陳郁如', '林世仁', '廖炳焜', '廣嶋玲子', '吉靜如', '肥志', '鄭宗弦', '岑澎維', '哲也', '張嘉驊', 'Popcorn Story', '吉竹伸介', '海狗房東', '阿德蝸', 'Troll', '香川元太郎', '林柏廷', '宮西達也', '李光福', '賴馬', '劉旭恭'].sort((a, b) => a.localeCompare(b, 'zh-TW')); 
const SERIES = ['神奇柑仔店', '達克比', '科學發明王', '科學實驗王', '楓之谷數學神偷', 'X尋寶探險隊', 'X超強對決王', 'X萬獸探險隊', 'X極限挑戰王', '狼人生存遊戲', '科學偵探謎野真實', 'X機器人戰隊', '植物大戰殭屍', '紅豆綠豆碰'].sort((a, b) => a.localeCompare(b, 'zh-TW'));

// --- 工具函數 ---
const Utils = {
  getTodayStr: () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  },
  getTaiwanDayKey: () => Math.floor((Date.now() + 28800000) / 86400000), 
  maskName: (name) => {
    if (!name) return '無名氏';
    const str = String(name).trim();
    if (str.length <= 1) return str;
    if (str.length === 2) return str[0] + 'O'; 
    if (str.length === 3) return str[0] + 'O' + str[2]; 
    return str[0] + 'O'.repeat(str.length - 2) + str[str.length - 1]; 
  },
  formatDate: (dateVal) => {
    if (!dateVal) return "未知日期";
    try {
      if (typeof dateVal === 'string') {
        const m = dateVal.match(/^(\d{4})[-\/年](\d{1,2})[-\/月](\d{1,2})/);
        if (m) return `${m[1]}-${String(m[2]).padStart(2,'0')}-${String(m[3]).padStart(2,'0')}`;
        return dateVal;
      }
      const d = new Date(typeof dateVal === 'number' ? dateVal : (dateVal.seconds ? dateVal.seconds * 1000 : dateVal));
      if (!isNaN(d.getTime())) return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      return String(dateVal);
    } catch(e) { return "未知日期"; }
  },
  formatTime: (dateVal) => {
    if (!dateVal) return "未知時間";
    try {
      const d = new Date(typeof dateVal === 'number' ? dateVal : (dateVal.seconds ? dateVal.seconds * 1000 : dateVal));
      if (!isNaN(d.getTime())) return `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
      return String(dateVal);
    } catch(e) { return "未知時間"; }
  },
  getTimestamp: (val) => {
    if (!val) return 0;
    try {
      if (typeof val === 'number') return val;
      if (typeof val === 'string') {
        const parsed = new Date(val.replace(/[-\/]/g, '/')).getTime();
        return isNaN(parsed) ? 0 : parsed;
      }
      if (val instanceof Date) return val.getTime();
      if (val.toDate && typeof val.toDate === 'function') return val.toDate().getTime();
      if (val.seconds) return val.seconds * 1000;
      const fallback = new Date(val).getTime();
      return isNaN(fallback) ? 0 : fallback;
    } catch (e) { return 0; }
  },
  getCachedArray: (key) => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : null; 
    } catch { return null; }
  }
};

const getVipRanking = (vipRequests) => {
   if (!vipRequests || vipRequests.length === 0) return { winner: null, log: [], total: 0 };
   
   const userMap = {};
   vipRequests.forEach(req => {
     if (!userMap[req.uid]) {
       userMap[req.uid] = { uid: req.uid, name: req.name, count: 0, firstTime: req.timestamp };
     }
     userMap[req.uid].count += 1;
     userMap[req.uid].firstTime = Math.min(userMap[req.uid].firstTime, req.timestamp);
   });

   const sorted = Object.values(userMap).sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count; 
      return a.firstTime - b.firstTime; 
   });

   return {
     winner: sorted[0],
     log: sorted,
     total: vipRequests.length
   };
};

// --- 書籍卡片組件 ---
const BookCard = React.memo(({ book, user, isAdmin, handleVote, setFastPassModalBook, handleAdminRemoveVip, handleWithdrawPass, handleAdminDelete }) => {
  const votesCount = book.votes ? book.votes.length : 0;
  const hasVoted = book.votes && user && book.votes.includes(user.uid);
  const vipRequests = book.vipRequests || [];
  const ranking = useMemo(() => getVipRanking(vipRequests), [vipRequests]);
  const isAchieved = ranking.total >= 15;
  
  const myVipCount = user ? vipRequests.filter(v => v.uid === user.uid).length : 0;

  return (
    <article className={`group bg-white rounded-2xl shadow-sm border overflow-hidden flex flex-col transition-all duration-300 hover:shadow-xl hover:-translate-y-1 focus-within:ring-2 focus-within:ring-indigo-500 ${isAchieved ? 'border-amber-400 ring-4 ring-amber-100' : 'border-slate-200'}`} style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 620px' }}>
      <div className="h-72 bg-gradient-to-br from-slate-100 via-slate-50 to-slate-200 flex items-center justify-center relative border-b border-slate-100 overflow-hidden">
          <div className="absolute top-3 left-3 flex flex-col gap-2 items-start z-10">
             <span className={`px-3 py-1 text-xs font-bold rounded-lg shadow-sm backdrop-blur-md border border-white/20 tracking-wide ${book.category === '套書續集' ? 'bg-blue-600/90 text-white' : 'bg-emerald-600/90 text-white'}`}>{book.keyword || book.category}</span>
             {book.hasBopomofo === '有注音' && <span className="px-3 py-1 text-xs font-extrabold rounded-lg shadow-sm bg-amber-400/95 text-amber-950 backdrop-blur-md border border-white/30">有注音</span>}
          </div>
          
          {isAchieved && (
            <div onDoubleClick={isAdmin ? () => handleAdminRemoveVip(book, 'books') : undefined} className={`absolute top-3 right-3 z-10 bg-gradient-to-br from-amber-400 to-amber-500 text-white text-xs font-bold px-3 py-1.5 rounded-lg shadow-sm flex items-center gap-1.5 border border-amber-300 animate-bounce ${isAdmin ? 'cursor-pointer hover:ring-2 ring-amber-300' : ''}`} title={isAdmin ? "【管理員權限】雙擊可移除保送紀錄" : "達標保送中"}>
               <Icon name="award" className="w-3.5 h-3.5" /> 優先採購中
            </div>
          )}
          
          {book.coverUrl ? 
             <img src={book.coverUrl} alt={`《${book.title}》封面`} className="w-full h-full object-contain p-2 mix-blend-multiply group-hover:scale-105 transition-transform duration-500" draggable="false" /> : 
             <div className="flex flex-col items-center gap-3 text-slate-400"><Icon name="image-off" className="w-12 h-12" /><span className="text-xs font-bold tracking-widest uppercase">無封面</span></div>
          }
      </div>
      
      <div className="p-6 flex-grow flex flex-col bg-white relative">
         <h3 className="font-bold text-lg text-slate-800 mb-2 line-clamp-2 leading-snug group-hover:text-indigo-600 transition-colors" title={book.title}>{book.title}</h3>
         <p className="text-sm text-slate-600 mb-4 font-medium flex items-center gap-2"><Icon name="pen-tool" className="w-4 h-4 flex-shrink-0 text-slate-400" /><span className="truncate">{book.author || '作者未知'}{book.publisher ? ` / ${book.publisher}` : ''}</span></p>

         <div className="text-sm text-slate-600 mb-6 space-y-2.5 bg-slate-50 p-4 rounded-xl border border-slate-100 mt-auto">
           <p className="flex justify-between items-center gap-3 w-full">
             <span className="flex items-center gap-1.5 text-slate-500 shrink-0"><Icon name="calendar-days" className="w-4 h-4"/> 出版</span>
             <span className="font-bold text-slate-800 text-right truncate flex-1 min-w-0">{Utils.formatDate(book.pubDate)}</span>
           </p>
           <p className="flex justify-between items-center gap-3 w-full">
             <span className="flex items-center gap-1.5 text-slate-500 shrink-0"><Icon name="barcode" className="w-4 h-4"/> ISBN</span>
             <span className="font-mono text-slate-800 font-medium text-right text-[12px] sm:text-[13px] tracking-tight truncate flex-1 min-w-0" title={book.isbn}>{book.isbn || '—'}</span>
           </p>
           <p className="flex justify-between items-center gap-3 w-full">
             <span className="flex items-center gap-1.5 text-slate-500 shrink-0"><Icon name="circle-dollar-sign" className="w-4 h-4"/> 定價</span>
             <span className="font-bold text-slate-800 text-right truncate flex-1 min-w-0">{book.price ? `${Number(book.price) || 0} 元` : '—'}</span>
           </p>
         </div>
         
         <div className={`rounded-xl p-3 mb-4 ${isAchieved ? 'bg-amber-50 border border-amber-200 shadow-sm' : 'bg-slate-50 border border-slate-100'}`}>
            <div className="flex justify-between items-center mb-2">
              <span className="flex items-center gap-1.5 text-sm font-black text-slate-700"><Icon name="ticket" className="w-4 h-4 text-amber-500"/> 快通進度</span>
              <span className={`font-mono text-sm font-black ${isAchieved ? 'text-amber-600' : 'text-slate-400'}`}>{ranking.total} / 15</span>
            </div>
            <div className="w-full bg-slate-200 rounded-full h-2 mb-3 overflow-hidden shadow-inner">
               <div className={`h-full transition-all duration-1000 ${isAchieved ? 'bg-amber-500' : 'bg-amber-400'}`} style={{ width: `${Math.min((ranking.total/15)*100, 100)}%` }}></div>
            </div>

            {ranking.winner ? (
              <div className="space-y-2 w-full">
                <div className="flex items-center gap-1.5 p-2 bg-white rounded-lg border border-amber-100 shadow-sm w-full min-w-0">
                  <div className="flex items-center gap-1 shrink-0 text-amber-600">
                    <Icon name="award" className="w-4 h-4" fill="currentColor" />
                    <span className="text-[11px] sm:text-xs font-black">首讀領先</span>
                  </div>
                  <span className="font-bold text-xs sm:text-sm text-slate-700 truncate flex-1 min-w-0 text-center" title={Utils.maskName(ranking.winner.name)}>
                    {Utils.maskName(ranking.winner.name)}
                  </span>
                  <span className="text-slate-400 font-mono text-[10px] sm:text-xs shrink-0 text-right">
                    ({ranking.winner.count} 張)
                  </span>
                </div>
                <div className="max-h-24 overflow-y-auto hide-scrollbar space-y-1 mt-2 border-t border-slate-200/50 pt-2">
                  {ranking.log.map((entry, idx) => (
                    <div key={entry.uid} className="flex items-center text-[11px] sm:text-xs text-slate-500 opacity-80 pl-1 w-full gap-1.5 min-w-0">
                      <span className="shrink-0 w-3 text-left">{idx+1}.</span>
                      <span className="truncate flex-1 min-w-0" title={Utils.maskName(entry.name)}>{Utils.maskName(entry.name)}</span>
                      <span className="whitespace-nowrap shrink-0 text-right">{entry.count} 張</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-center text-slate-400 italic py-1 text-xs">目前尚無快通券投入</p>
            )}
         </div>
         
         <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
           <div className="flex items-center flex-shrink-0">
             {book.status === 'purchased' ? 
               <div className="text-sm font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-2 rounded-xl flex items-center gap-2 shadow-sm"><Icon name="check-circle-2" className="w-4 h-4"/> <span>{book.statusNote || '已採購'}</span></div>
              : book.status === 'processing' ? 
               <div className="text-sm font-bold text-blue-700 bg-blue-50 border border-blue-200 px-3 py-2 rounded-xl flex items-center gap-2 shadow-sm"><Icon name="clock" className="w-4 h-4"/> <span>{book.statusNote || '處理中'}</span></div>
              : isAchieved ? (
                 <div className="text-sm font-bold text-rose-600 bg-rose-50 border border-rose-200 px-3 py-2 rounded-xl flex items-center gap-1.5 shadow-sm cursor-default" title="已列入優先採購名單">
                   <Icon name="award" className="w-4 h-4" /> 達標保送
                 </div>
              ) : (
               <button onClick={() => setFastPassModalBook({...book, collectionName: 'books'})} title="投入快通券，參與首讀爭奪戰！" className="text-xs sm:text-sm font-bold text-amber-700 bg-amber-50 border border-amber-200 px-3 py-2 rounded-xl hover:bg-amber-100 hover:shadow-md transition-all flex items-center gap-1.5 shadow-sm focus:ring-2 focus:ring-amber-500 outline-none">
                 <Icon name="ticket" className="w-4 h-4" /> 搶首讀特權
               </button>
              )
             }
           </div>
           <button onClick={() => handleVote(book, 'books')} title={hasVoted ? "收回愛心" : "點擊按愛心增加書籍熱度！"} className={`flex-shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-full text-sm font-black transition-all outline-none h-[34px] ${hasVoted ? 'bg-rose-500 text-white shadow-md focus:ring-2 focus:ring-rose-600' : 'bg-rose-50 text-rose-500 border border-rose-100 focus:ring-2 focus:ring-rose-300 hover:bg-rose-100 hover:shadow-sm'}`}>
             <Icon name="heart" className={`w-4 h-4 transition-transform ${hasVoted ? 'scale-110' : ''}`} fill={hasVoted ? "currentColor" : "none"} strokeWidth={hasVoted ? 0 : 2} />
             <span>{votesCount}</span>
           </button>
         </div>
         
         <div className="flex flex-col gap-1.5 mt-3 pt-3 border-t border-slate-50">
           <button 
             onClick={() => setFastPassModalBook({...book, collectionName: 'books'})}
             className={`text-sm font-black px-3 py-2.5 rounded-lg shadow-sm flex items-center justify-center gap-1.5 transition-all outline-none ${isAchieved ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:from-amber-600 hover:to-orange-600 active:scale-95 focus:ring-2 focus:ring-amber-500'}`}
             disabled={isAchieved}
             title={isAchieved ? "此書已達標鎖定" : "投入快通券，參與首讀爭奪戰！"}
           >
             <Icon name="ticket" className="w-4 h-4" /> 投入快通券爭奪首讀
           </button>
           {myVipCount > 0 && !isAchieved && (
             <button 
                onClick={() => handleWithdrawPass(book, 'books')}
                className="text-xs font-bold text-rose-500 hover:text-rose-700 flex items-center justify-center gap-1 outline-none focus:ring-2 focus:ring-rose-500 rounded py-1 mt-1"
                title="撤回您投入的快通券"
             >
                <Icon name="history" className="w-3.5 h-3.5" /> 撤回 1 張 (您已投 {myVipCount} 張)
             </button>
           )}
         </div>
      </div>
      {isAdmin && (
        <div className="flex flex-col bg-slate-800 rounded-b-xl opacity-0 group-hover:opacity-100 transition-opacity">
          <button onDoubleClick={() => handleAdminRemoveVip(book, 'books')} className="text-white text-[9px] py-1.5 font-bold outline-none focus:opacity-100 tracking-wider">管理員雙擊強制清空所有券</button>
          <button onDoubleClick={() => handleAdminDelete(book, 'books')} className="text-rose-300 hover:text-white bg-rose-900/50 hover:bg-rose-700 text-[9px] py-1.5 font-bold outline-none focus:opacity-100 tracking-wider transition-colors rounded-b-xl">管理員雙擊徹底刪除</button>
        </div>
      )}
    </article>
  );
});

// --- 許願單卡片組件 ---
const WishlistCard = React.memo(({ wish, user, isAdmin, handleVote, setFastPassModalBook, handleAdminRemoveVip, handleWithdrawPass, handleAdminDelete }) => {
  const votesCount = wish.votes ? wish.votes.length : 0;
  const hasVoted = wish.votes && user && wish.votes.includes(user.uid);
  
  const vipRequests = wish.vipRequests || (wish.vipCode ? [{uid: wish.userId, name: wish.userName, code: wish.vipCode, timestamp: wish.createdAt}] : []);
  const ranking = useMemo(() => getVipRanking(vipRequests), [vipRequests]);
  const isAchieved = ranking.total >= 15;
  const myVipCount = user ? vipRequests.filter(v => v.uid === user.uid).length : 0;

  return (
    <article className={`bg-white p-5 sm:p-6 rounded-2xl shadow-sm border transition-all duration-300 flex flex-col focus-within:ring-2 focus-within:ring-indigo-500 ${isAchieved ? 'border-amber-400 ring-4 ring-amber-50' : 'border-slate-200 hover:shadow-md'}`} style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 620px' }}>
       <div className="flex justify-between items-start mb-3 gap-4">
          <h3 className="font-black text-slate-800 text-base sm:text-lg leading-snug">{wish.title}</h3>
          <span className={`text-[11px] sm:text-xs px-2.5 py-1 rounded-md font-bold whitespace-nowrap border shadow-sm ${wish.status === 'purchased' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : wish.status === 'rejected' ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-slate-50 text-slate-600 border-slate-200'}`}>
            {wish.status === 'pending' ? '集氣中' : wish.status === 'purchased' ? '已買到囉' : wish.status}
          </span>
       </div>
       
       <div className="flex flex-wrap items-center gap-4 text-[11px] sm:text-xs text-slate-500 mb-4 font-bold uppercase tracking-widest bg-slate-50 p-2.5 rounded-lg border border-slate-100">
          <span className="flex items-center gap-1.5"><Icon name="user" className="w-3.5 h-3.5"/> {Utils.maskName(wish.userName)}</span>
          {wish.isbn && <span className="flex items-center gap-1.5 truncate"><Icon name="barcode" className="w-3.5 h-3.5 shrink-0"/> <span className="truncate min-w-0" title={wish.isbn}>{wish.isbn}</span></span>}
       </div>
      
      {wish.duplicateReason && (
         <div className="mb-4 text-xs sm:text-sm bg-rose-50 text-rose-800 p-3.5 rounded-xl border border-rose-200 flex items-start gap-2.5 shadow-sm min-w-0">
           <Icon name="alert-circle" className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0 mt-0.5 text-rose-600" />
           <div className="leading-relaxed truncate flex-1 min-w-0"><span className="font-black shrink-0">重複申請原因：</span>{wish.duplicateReason}</div>
        </div>
      )}

      {wish.reason && (
         <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl mb-5 text-slate-700 text-sm sm:text-base leading-relaxed shadow-sm flex items-start gap-2.5">
           <Icon name="quote" className="w-5 h-5 flex-shrink-0 text-indigo-400 mt-0.5 opacity-60" />
           <span className="italic">{wish.reason}</span>
         </div>
      )}

       <div className={`rounded-xl p-4 mb-2 ${isAchieved ? 'bg-amber-50 border border-amber-200 shadow-sm' : 'bg-slate-50 border border-slate-100'}`}>
          <div className="flex justify-between items-center mb-3">
            <span className="font-black text-slate-700 text-sm flex items-center gap-1.5"><Icon name="ticket" className="w-4 h-4 text-amber-500"/> 快通達標進度</span>
            <span className="font-mono font-black text-sm">{ranking.total} / 15</span>
          </div>
          <div className="w-full bg-slate-200 rounded-full h-2 mb-3 shadow-inner"><div className="h-full bg-amber-500 rounded-full transition-all duration-1000" style={{ width: `${Math.min((ranking.total/15)*100, 100)}%` }}></div></div>
          
          {ranking.winner ? (
            <div className="space-y-2 w-full">
              <div className="flex items-center gap-1.5 p-2 bg-white rounded-lg border border-amber-100 shadow-sm w-full min-w-0">
                <div className="flex items-center gap-1 shrink-0 text-amber-600">
                  <Icon name="award" className="w-4 h-4" fill="currentColor" />
                  <span className="text-[11px] sm:text-xs font-black">首讀領先</span>
                </div>
                <span className="font-bold text-xs sm:text-sm text-slate-700 truncate flex-1 min-w-0 text-center" title={Utils.maskName(ranking.winner.name)}>
                  {Utils.maskName(ranking.winner.name)}
                </span>
                <span className="text-slate-400 font-mono text-[10px] sm:text-xs shrink-0 text-right">
                  ({ranking.winner.count} 張)
                </span>
              </div>
              <div className="max-h-24 overflow-y-auto hide-scrollbar space-y-1 mt-2 border-t border-slate-200/50 pt-2">
                {ranking.log.map((entry, idx) => (
                  <div key={entry.uid} className="flex items-center text-[11px] sm:text-xs text-slate-500 opacity-80 pl-1 w-full gap-1.5 min-w-0">
                    <span className="shrink-0 w-3 text-left">{idx+1}.</span>
                    <span className="truncate flex-1 min-w-0" title={Utils.maskName(entry.name)}>{Utils.maskName(entry.name)}</span>
                    <span className="whitespace-nowrap shrink-0 text-right">{entry.count} 張</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-center text-slate-400 italic py-1 text-xs">這本好書需要快通券支援！</p>
          )}
       </div>

       <div className="mt-auto flex items-center justify-between gap-3 pt-4 border-t border-slate-50">
         <div className="flex items-center flex-shrink-0">
           {isAchieved ? (
             <div className="text-sm font-bold text-rose-600 bg-rose-50 border border-rose-200 px-3 py-1.5 rounded-xl flex items-center gap-1.5 shadow-sm cursor-default">
               <Icon name="award" className="w-4 h-4 text-rose-500" /> 達標保送中
             </div>
           ) : (
             <button onClick={() => setFastPassModalBook({...wish, collectionName: 'wishlists'})} title="搶下首讀特權！" className="text-xs sm:text-sm font-bold text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-xl hover:bg-amber-100 hover:shadow-md transition-all flex items-center gap-1.5 shadow-sm focus:ring-2 focus:ring-amber-50 outline-none">
               <Icon name="ticket" className="w-4 h-4" /> 搶首讀特權
             </button>
           )}
         </div>
         
         <button onClick={() => handleVote(wish, 'wishlists')} title={hasVoted ? "收回愛心" : "點擊按愛心增加書籍熱度！"} className={`flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-black outline-none transition-all h-[36px] ${hasVoted ? 'bg-rose-500 text-white shadow-md focus:ring-2 focus:ring-rose-600' : 'bg-slate-50 text-rose-500 focus:ring-2 focus:ring-rose-300 hover:bg-rose-100 border border-rose-100 hover:shadow-sm'}`}>
           <Icon name="heart" className={`w-3.5 h-3.5 transition-transform ${hasVoted ? 'scale-110' : ''}`} fill={hasVoted ? "currentColor" : "none"} strokeWidth={2}/> <span>{votesCount}</span>
         </button>
       </div>
       
       <div className="flex flex-col gap-1.5 mt-3 pt-3 border-t border-slate-50">
          <button 
            onClick={() => setFastPassModalBook({...wish, collectionName: 'wishlists'})} 
            disabled={isAchieved} 
            title={isAchieved ? "此書已達標鎖定" : "投入快通券，參與首讀爭奪戰！"}
            className={`text-sm font-black px-4 py-2.5 rounded-lg flex items-center justify-center gap-1.5 outline-none transition-all shadow-sm ${isAchieved ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:from-amber-600 hover:to-orange-600 active:scale-95 focus:ring-2 focus:ring-amber-500'}`}
          >
            <Icon name="ticket" className="w-4 h-4" /> 投快通助攻
          </button>
          {myVipCount > 0 && !isAchieved && (
            <button 
              onClick={() => handleWithdrawPass(wish, 'wishlists')} 
              className="text-xs font-bold text-rose-500 hover:text-rose-700 flex items-center justify-center gap-1 outline-none focus:ring-2 focus:ring-rose-500 rounded py-1 mt-1"
              title="撤回您投入的快通券"
            >
              <Icon name="history" className="w-3 h-3" /> 撤回 1 張 (您已投 {myVipCount} 張)
            </button>
          )}
       </div>

       {isAdmin && (
        <div className="flex flex-col bg-slate-800 rounded-b-xl opacity-0 hover:opacity-100 transition-opacity mt-3">
          <button onDoubleClick={() => handleAdminRemoveVip(wish, 'wishlists')} className="text-white text-[11px] py-1.5 font-bold outline-none focus:opacity-100 tracking-wider">管理員雙擊強制清空所有券</button>
          <button onDoubleClick={() => handleAdminDelete(wish, 'wishlists')} className="text-rose-300 hover:text-white bg-rose-900/50 hover:bg-rose-700 text-[11px] py-1.5 font-bold outline-none focus:opacity-100 tracking-wider transition-colors rounded-b-xl">管理員雙擊徹底刪除</button>
        </div>
      )}
    </article>
  );
});

// --- 錯誤處理界殼 ---
class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null }; }
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 max-w-2xl mx-auto mt-10 bg-rose-50 border border-rose-200 rounded-2xl text-rose-800 shadow-sm" role="alert">
           <div className="flex items-center gap-3 mb-4"><Icon name="alert-triangle" className="w-8 h-8 text-rose-600" /><h1 className="text-2xl font-bold">系統發生錯誤</h1></div>
           <p className="mb-4 text-rose-700 font-medium">網頁渲染時遇到無法解析的資料，請嘗試清除瀏覽器快取後重新整理：</p>
           <pre className="bg-white p-5 rounded-xl overflow-auto text-sm border border-rose-100 shadow-inner font-mono">{this.state.error?.toString()}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

// --- 主程式入口 ---
function App() {
  const [user, setUser] = useState(null);
  const ADMIN_UIDS = ['NisQ7ZkSc8h59efkGRGEif0AOyz2'];
  const isAdmin = user && user.uid && ADMIN_UIDS.includes(user.uid);

  const [activeTab, setActiveTab] = useState('new-books'); 
  const [books, setBooks] = useState(() => Utils.getCachedArray('haidian_books') || []);
  const [wishlists, setWishlists] = useState(() => Utils.getCachedArray('haidian_wishlists') || []);
  
  const [inventoryDict, setInventoryDict] = useState({}); 
  const [inventoryLastUpdated, setInventoryLastUpdated] = useState(null);
  const [dailyVotesCount, setDailyVotesCount] = useState(0); 
  const [lastVoteDayKey, setLastVoteDayKey] = useState(0); 
  const [votingIds, setVotingIds] = useState({}); 
  
  const [filterType, setFilterType] = useState('all'); 
  const [filterKeyword, setFilterKeyword] = useState('all');
  const [searchQuery, setSearchQuery] = useState(''); 
  
  const [wishFormData, setWishFormData] = useState({ title: '', isbn: '', reason: '', duplicateReason: '', vipCode: '' });
  const [inventoryCheckResult, setInventoryCheckResult] = useState(null);
  const [inventoryCount, setInventoryCount] = useState(0);
  const debounceTimerRef = useRef(null);

  const [fastPassModalBook, setFastPassModalBook] = useState(null);
  const [fastPassInput, setFastPassInput] = useState('');
  const [modalContent, setModalContent] = useState(null);
  const [showAbout, setShowAbout] = useState(false);
  const [visibleBookCount, setVisibleBookCount] = useState(12);
  const [slowLoadWarning, setSlowLoadWarning] = useState(false);
  
  const loaderRef = useRef(null);
  const [booksReady, setBooksReady] = useState(false);
  const [wishlistsReady, setWishlistsReady] = useState(false); 
  
  const showMessage = useCallback((message, title = "系統提示") => { setModalContent({ title, message }); }, []);

  const handleOpenFastPass = useCallback((item) => {
    if (!user || user.isAnonymous) {
      showMessage("請先點擊右上角「Google 登入」才能使用快通券唷！", "需要登入");
      return;
    }
    setFastPassModalBook(item);
  }, [user, showMessage]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!booksReady || !wishlistsReady) {
        setSlowLoadWarning(true);
      }
    }, 8000); 
    return () => clearTimeout(timer);
  }, [booksReady, wishlistsReady]);

  // Firebase 身份驗證監聽
  useEffect(() => {
    let isPreviewMode = false;
    const initAuth = async () => {
      try { 
        await auth.authStateReady();
        if (auth.currentUser) return;
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth); 
        }
      } catch (error) { 
        console.warn("Firebase Auth Error:", error);
        isPreviewMode = true; 
        setUser({ isAnonymous: true, uid: 'preview-guest-uid', displayName: '訪客模式' });
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => { 
      if (!isPreviewMode) {
         setUser(currentUser);
         if (!currentUser) {
           try { await signInAnonymously(auth); } catch (e) {}
         }
      }
    });
    return () => unsubscribe();
  }, []);

  // 動靜分離同步核心 (Restored & Improved)
  useEffect(() => {
    const fetchCacheAndSubscribe = async () => {
      try {
        // 1. 優先讀取超級快取
        const cacheRef = doc(db, 'artifacts', appId, 'public', 'data', 'system', 'cache_books');
        const cacheSnap = await getDoc(cacheRef);
        if (cacheSnap.exists()) {
          setBooks(cacheSnap.data().list || []);
        }
      } catch (e) { console.error("Cache load error:", e); }
      
      setBooksReady(true);

      // 2. 開啟即時同步監聽 (合併快取與即時資料)
      const unsubscribeBooks = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'books'), (snapshot) => {
        const liveData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setBooks(prevBooks => {
          const newBooks = prevBooks.map(staticBook => {
            const liveMatch = liveData.find(l => l.isbn === staticBook.isbn || (staticBook.title && l.title === staticBook.title));
            return liveMatch ? { ...staticBook, ...liveMatch } : staticBook;
          });
          const existingIds = new Set(newBooks.map(b => b.id || b.isbn));
          const unsyncedNewOnes = liveData.filter(l => !existingIds.has(l.id || l.isbn));
          const finalResult = [...newBooks, ...unsyncedNewOnes];
          finalResult.sort((a, b) => (b.votes?.length || 0) - (a.votes?.length || 0));
          return finalResult;
        });
      });

      const unsubscribeWish = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'wishlists'), (snapshot) => {
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        data.sort((a,b) => Utils.getTimestamp(b.createdAt) - Utils.getTimestamp(a.createdAt));
        setWishlists(data);
        setWishlistsReady(true);
      });

      const unsubscribeInventory = onSnapshot(doc(db, 'artifacts', appId, 'public', 'data', 'system', 'inventory'), (docSnap) => {
        if (docSnap.exists() && docSnap.data().dict) {
          setInventoryDict(docSnap.data().dict);
          if (docSnap.data().lastUpdated) setInventoryLastUpdated(docSnap.data().lastUpdated);
        }
      });
      
      return () => { unsubscribeBooks(); unsubscribeWish(); unsubscribeInventory(); };
    };
    fetchCacheAndSubscribe();
  }, []); 

  // 監聽每日額度
  useEffect(() => {
    if (!user || user.isAnonymous) {
      setDailyVotesCount(0);
      setLastVoteDayKey(0);
      return;
    }
    const currentDayKey = Utils.getTaiwanDayKey(); 
    const unsubStats = onSnapshot(doc(db, 'artifacts', appId, 'users', user.uid, 'voteStats', 'daily'), (d) => {
      if (d.exists()) {
         const data = d.data();
         const dbDayKey = data.dayKey || 0;
         setDailyVotesCount(dbDayKey === currentDayKey ? (data.count || 0) : 0);
         setLastVoteDayKey(dbDayKey);
      } else {
         setDailyVotesCount(0);
         setLastVoteDayKey(0);
      }
    });
    return () => unsubStats();
  }, [user]);

  const handleGoogleLogin = async () => {
    try { await signInWithPopup(auth, new GoogleAuthProvider()); } catch (error) { 
      if (error.code === 'auth/unauthorized-domain' || error.message.includes('blocked')) showMessage("登入失敗：未授權的網域。\n請至 Firebase 後台加入此網站網址。", "登入錯誤");
      else if (error.message.includes('invalid')) showMessage("登入失敗：無效的操作。\n請確認您的 Firebase 後台是否已經啟用 Google 登入選項！", "登入錯誤");
      else showMessage(`登入失敗 (${error.code})，請稍後再試！`, "登入錯誤");
    }
  };
  
  const handleLogout = async () => { try { await signOut(auth); } catch (error) {} };

  const handleWithdrawPass = async (item, collectionName) => {
    if (!user || user.isAnonymous) return;
    const myVips = (item.vipRequests || []).filter(v => v.uid === user.uid);
    if (myVips.length === 0) return;
    
    const target = myVips.sort((a,b) => b.timestamp - a.timestamp)[0];
    const ok = window.confirm(`【確認撤回】\n確定要撤回您在 ${Utils.formatTime(target.timestamp)} 投入的快通券嗎？\n(該序號將會退回您的手中)`);
    if (!ok) return;

    try {
      const batch = writeBatch(db);
      const itemRef = doc(db, 'artifacts', appId, 'public', 'data', collectionName, item.id);
      const vipDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'vipCodes', target.code); 

      batch.update(itemRef, { vipRequests: arrayRemove(target) });
      batch.update(vipDocRef, { status: '未使用', usedBy: null, usedAt: null, usedForColl: null, usedForId: null, usedName: null });
      await batch.commit();
      showMessage("已成功撤回 1 張快通券，該序號已自動退回！您可以重新使用在別本書上。", "撤回成功");
    } catch(e) { showMessage("撤回失敗：" + e.message); }
  };

  const handleVote = async (item, collectionName) => {
    if (!user || user.isAnonymous) return showMessage("請先使用 Google 帳號登入才能按愛心唷！", "需要登入");
    
    const voteKey = `${collectionName}:${item.id}`;
    if (votingIds[voteKey]) return; 

    setVotingIds(prev => ({ ...prev, [voteKey]: true })); 
    
    const itemRef = doc(db, 'artifacts', appId, 'public', 'data', collectionName, item.id);
    const statsRef = doc(db, 'artifacts', appId, 'users', user.uid, 'voteStats', 'daily');
    const hasVoted = (item.votes || []).includes(user.uid);
    
    try {
      if (hasVoted) {
        await updateDoc(itemRef, { votes: arrayRemove(user.uid) });
      } else {
        const currentDayKey = Utils.getTaiwanDayKey();
        let previousCount = dailyVotesCount;
        if (lastVoteDayKey !== currentDayKey) previousCount = 0; 

        if (previousCount >= 3) {
          showMessage("今天已經用完 3 次愛心額度囉！\n請注意，收回愛心是不會退還額度的。\n請明天再來幫喜歡的書本增加熱度吧！", "額度用盡");
          setVotingIds(prev => { const next = {...prev}; delete next[voteKey]; return next; });
          return;
        }
        
        const newCount = previousCount + 1;
        setDailyVotesCount(newCount); 
        setLastVoteDayKey(currentDayKey);
        
        const batch = writeBatch(db);
        batch.set(statsRef, { dayKey: currentDayKey, count: newCount });
        batch.update(itemRef, { votes: arrayUnion(user.uid) });
        await batch.commit(); 
      }
    } catch(e) {
      if (!hasVoted) setDailyVotesCount(prev => Math.max(0, prev - 1)); 
      showMessage("愛心送出失敗，請稍後再試。\n" + e.message, "操作失敗");
    } finally {
      setVotingIds(prev => { const next = {...prev}; delete next[voteKey]; return next; });
    }
  };

  const handleFastPassBoost = async () => {
    if (!user || user.isAnonymous) { setFastPassModalBook(null); return showMessage("請先登入才能使用快通券序號！", "需要登入"); }
    const code = fastPassInput.trim().toLowerCase();
    if (code.length !== 5 || !/^[a-z0-9]{5}$/i.test(code)) return showMessage("快通券序號應為 5 碼英數字！", "格式錯誤");
    
    try {
      const vipDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'vipCodes', code);
      const vipDocSnap = await getDoc(vipDocRef);
      
      if (!vipDocSnap.exists()) return showMessage("這組序號不存在，請確認是否輸入錯誤！", "無效序號");
      
      const vipData = vipDocSnap.data();
      if (vipData.status === '已使用') return showMessage("這組快通券序號已經被其他人使用過囉！", "序號已失效");

      const collName = fastPassModalBook.collectionName;
      const itemRef = doc(db, 'artifacts', appId, 'public', 'data', collName, fastPassModalBook.id);
      
      const finalName = vipData.studentName || user.displayName || '圖書室讀者';
      const maskedName = Utils.maskName(finalName);
      const nowMs = Date.now();

      const batch = writeBatch(db);
      batch.update(itemRef, { vipRequests: arrayUnion({ uid: user.uid, name: maskedName, code: code, timestamp: nowMs }) });
      batch.update(vipDocRef, { status: '已使用', usedBy: user.uid, usedAt: nowMs, usedForColl: collName, usedForId: fastPassModalBook.id, usedName: maskedName });
      
      await batch.commit();
      showMessage("成功投入快通券！快邀請朋友一起衝到 15 張吧！", "投入成功 🎉");
      setFastPassModalBook(null); setFastPassInput('');
      
    } catch(e) { 
      showMessage("操作失敗：" + e.message + "\n\n(提示：系統權限不足，請檢查 Firebase 規則是否已更新)", "錯誤"); 
    }
  };

  const handleAdminRemoveVip = async (item, coll) => {
    if (!isAdmin) return showMessage("權限不足！此操作僅限圖書室管理員使用。", "存取拒絕");
    const ok = window.confirm("【管理員操作】\n確定要「清空」這本書所有的快通券紀錄並退回所有序號嗎？");
    if (!ok) return;
    showMessage("正在清除所有快通券紀錄...", "請稍候");
    try {
        const batch = writeBatch(db);
        const vips = item.vipRequests || (item.vipCode ? [{code: item.vipCode}] : []);
        vips.forEach(v => { 
           const vipDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'vipCodes', v.code);
           batch.update(vipDocRef, { status: '未使用', usedBy: null, usedAt: null, usedForColl: null, usedForId: null, usedName: null }); 
        });
        batch.update(doc(db, 'artifacts', appId, 'public', 'data', coll, item.id), { vipRequests: [], vipCode: "", achiever: null });
        await batch.commit();
        showMessage("已清空所有快通紀錄並將所有序號退回序號庫！", "清理成功 🎉");
    } catch(e) { showMessage("清空失敗：" + e.message, "系統錯誤"); }
  };

  const handleAdminDelete = async (item, coll) => {
    if (!isAdmin) return;
    if (!window.confirm(`【危險操作】\n確定要徹底從網頁上刪除《${item.title}》嗎？\n\n(注意：若該書有學生已投入快通券，建議先點擊「清空所有券」退回給學生，再執行刪除！)`)) return;
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', coll, item.id));
      showMessage("已徹底刪除該書籍/許願單！", "刪除成功");
    } catch(e) { showMessage("刪除失敗：" + e.message, "系統錯誤"); }
  };

  // 許願池邏輯 (🔥 找回完整的防呆合併與每日愛心扣除邏輯)
  const handleIsbnChange = (e) => {
    const isbn = e.target.value.replace(/[^0-9Xx]/g, ''); setWishFormData({ ...wishFormData, isbn });
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    if (isbn.length >= 10) {
      setInventoryCheckResult('checking');
      debounceTimerRef.current = setTimeout(() => {
        const count = inventoryDict[isbn];
        if (count && count > 0) { setInventoryCount(count); setInventoryCheckResult('found'); } else setInventoryCheckResult('clear');
      }, 300);
    } else setInventoryCheckResult(null); 
  };

  const submitWishlist = async (e) => {
    e.preventDefault();
    if (!user || user.isAnonymous) return showMessage("請先使用 Google 帳號登入才能許願唷！", "需要登入");
    if (!wishFormData.title) return showMessage("請填寫書名");
    if (inventoryCheckResult === 'found' && !wishFormData.duplicateReason) return showMessage("館內已有此書，請填寫重複採購原因！");
    
    const currentDayKey = Utils.getTaiwanDayKey();
    let previousCount = dailyVotesCount;
    if (lastVoteDayKey !== currentDayKey) previousCount = 0;
    
    if (previousCount >= 3) return showMessage("今天已經用完 3 次愛心額度囉！\n無法再新增許願單，請明天再來吧！", "額度用盡");
    
    const cleanInputIsbn = wishFormData.isbn.replace(/[^0-9Xx]/g, '');
    const cleanTitle = wishFormData.title.trim().toLowerCase();
    let existingBook = null;
    let existingCollection = '';

    if (cleanInputIsbn || cleanTitle) {
      existingBook = books.find(b => (cleanInputIsbn && b.isbn && b.isbn.replace(/[^0-9Xx]/g, '') === cleanInputIsbn) || (b.title && b.title.trim().toLowerCase() === cleanTitle));
      if (existingBook) existingCollection = 'books';
      else {
        existingBook = wishlists.find(w => (cleanInputIsbn && w.isbn && w.isbn.replace(/[^0-9Xx]/g, '') === cleanInputIsbn) || (w.title && w.title.trim().toLowerCase() === cleanTitle));
        if (existingBook) existingCollection = 'wishlists';
      }
    }

    const hasVip = wishFormData.vipCode; 
    let codeToUse = null;
    let vipDocRef = null;
    let finalUserName = user.displayName || '圖書室讀者';

    if (hasVip) {
       codeToUse = wishFormData.vipCode.trim().toLowerCase();
       if (codeToUse.length !== 5 || !/^[a-z0-9]{5}$/i.test(codeToUse)) return showMessage("快通券序號應為 5 碼英數字！", "格式錯誤");
       try {
         vipDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'vipCodes', codeToUse);
         const vipDocSnap = await getDoc(vipDocRef);
         if (!vipDocSnap.exists()) return showMessage("您填寫的快通券序號不存在，請確認是否輸入錯誤！", "無效序號");
         if (vipDocSnap.data().status === '已使用') return showMessage("這組快通券序號已經被其他人使用過囉！", "序號已失效");
         finalUserName = vipDocSnap.data().studentName || finalUserName;
       } catch (e) { return showMessage("驗證序號失敗，請確保 Firebase 權限已更新！", "系統錯誤"); }
    }

    let maskedUserName = Utils.maskName(finalUserName);
    const nowMs = Date.now();

    try {
      const batch = writeBatch(db);
      const initialVipRequests = codeToUse ? [{uid: user.uid, name: maskedUserName, code: codeToUse, timestamp: nowMs}] : [];

      if (existingBook) {
         const isAchieved = (existingBook.vipRequests || []).length >= 15;
         if (isAchieved && codeToUse) return showMessage(`這本書已經在【${existingCollection === 'books' ? '逛好書' : '許願池'}】區，而且已經集滿 15 張快通券達標鎖定囉！\n\n您的快通券序號【沒有】被扣除，請保留給其他好書吧！`, "書籍已達標鎖定 👑");

         const itemRef = doc(db, 'artifacts', appId, 'public', 'data', existingCollection, existingBook.id);
         const updates = {};
         let messageExtra = "";

         if (codeToUse) {
             updates.vipRequests = arrayUnion(initialVipRequests[0]);
             batch.update(vipDocRef, { status: '已使用', usedBy: user.uid, usedAt: nowMs, usedForColl: existingCollection, usedForId: existingBook.id, usedName: maskedUserName });
             messageExtra += "快通券 ";
         }

         const currentVotes = existingBook.votes || [];
         if (!currentVotes.includes(user.uid)) {
             updates.votes = arrayUnion(user.uid);
             messageExtra += (messageExtra ? "與愛心 " : "愛心 ");
             const newCount = previousCount + 1;
             setDailyVotesCount(newCount); 
             setLastVoteDayKey(currentDayKey);
             const statsRef = doc(db, 'artifacts', appId, 'users', user.uid, 'voteStats', 'daily');
             batch.set(statsRef, { dayKey: currentDayKey, count: newCount });
         }

         if (Object.keys(updates).length > 0) {
             batch.update(itemRef, updates);
             await batch.commit();
         }

         setWishFormData({ title: '', isbn: '', reason: '', duplicateReason: '', vipCode: '' }); 
         setInventoryCheckResult(null);
         const collNameZhtw = existingCollection === 'books' ? '逛嚴選好書' : '專屬許願單';
         return showMessage(`這本書其實已經在【${collNameZhtw}】區囉！\n系統已自動為您防呆，將您的 ${messageExtra}合併灌注到那本書上！\n\n快去列表看看它現在的排名吧！`, "發現重複書籍，已自動合併 🌟");
      }

      // 若為全新許願單
      const newWishDoc = doc(collection(db, 'artifacts', appId, 'public', 'data', 'wishlists')); 
      batch.set(newWishDoc, {
        title: wishFormData.title, isbn: wishFormData.isbn, reason: wishFormData.reason, duplicateReason: wishFormData.duplicateReason, 
        vipRequests: initialVipRequests, vipCode: "", 
        status: 'pending', userId: user.uid, userName: maskedUserName, createdAt: nowMs, votes: [user.uid]
      });
      if (codeToUse) {
        batch.update(vipDocRef, { status: '已使用', usedBy: user.uid, usedAt: nowMs, usedForColl: 'wishlists', usedForId: newWishDoc.id, usedName: maskedUserName });
      }
      
      const newCount = previousCount + 1;
      setDailyVotesCount(newCount); 
      setLastVoteDayKey(currentDayKey);
      const statsRef = doc(db, 'artifacts', appId, 'users', user.uid, 'voteStats', 'daily');
      batch.set(statsRef, { dayKey: currentDayKey, count: newCount });
      
      await batch.commit();

      setWishFormData({ title: '', isbn: '', reason: '', duplicateReason: '', vipCode: '' }); 
      setInventoryCheckResult(null);
      showMessage("許願成功！\n" + (hasVip ? "快通券已投入！成功搶下本書的第一順位排隊！" : "趕快邀請同學幫忙按愛心，或投入快通券集氣吧！"), "大成功 🎉");
    } catch (error) { 
      console.error("Error submitting wishlist:", error);
      showMessage("許願失敗：" + error.message + "\n\n(若是權限問題，請確認已開放 system 寫入權限)", "系統錯誤");
    }
  };

  // 篩選與搜尋邏輯 (Restored Full Logic)
  const filteredBooks = useMemo(() => {
    return books.filter(book => {
      if (filterType !== 'all') {
         if (book.category !== filterType) return false;
         if (filterKeyword !== 'all' && book.keyword !== filterKeyword) return false;
      }
      if (searchQuery.trim() !== '') {
        const q = searchQuery.toLowerCase().trim();
        const t = String(book.title || '').toLowerCase();
        const a = String(book.author || '').toLowerCase();
        const p = String(book.publisher || '').toLowerCase();
        if (!t.includes(q) && !a.includes(q) && !p.includes(q)) return false;
      }
      return true;
    });
  }, [books, filterType, filterKeyword, searchQuery]);

  const achievedBooks = filteredBooks.filter(b => (b.vipRequests?.length || 0) >= 15);
  const regularBooks = filteredBooks.filter(b => (b.vipRequests?.length || 0) < 15);
  
  const filteredWishlists = useMemo(() => {
    if (!searchQuery.trim()) return wishlists;
    const q = searchQuery.toLowerCase().trim();
    return wishlists.filter(wish => {
      const t = String(wish.title || '').toLowerCase();
      const u = String(wish.userName || '').toLowerCase();
      return t.includes(q) || u.includes(q);
    });
  }, [wishlists, searchQuery]);

  const achievedWishlists = filteredWishlists.filter(w => {
     const count = w.vipRequests?.length || (w.vipCode ? 1 : 0);
     return count >= 15;
  });
  const regularWishlists = filteredWishlists.filter(w => {
     const count = w.vipRequests?.length || (w.vipCode ? 1 : 0);
     return count < 15;
  });

  // 分頁加載
  useEffect(() => { if (activeTab === 'new-books') setVisibleBookCount(12); }, [activeTab, filterType, filterKeyword, searchQuery]);
  useEffect(() => {
    if (activeTab !== 'new-books' || regularBooks.length === 0) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        setVisibleBookCount(prev => Math.min(prev + 12, regularBooks.length));
      }
    }, { threshold: 0.1 });
    
    if (loaderRef.current) observer.observe(loaderRef.current);
    return () => { if (loaderRef.current) observer.unobserve(loaderRef.current); };
  }, [activeTab, regularBooks.length]);

  const displayedRegularBooks = regularBooks.slice(0, visibleBookCount);

  const latestUpdateStr = useMemo(() => {
    if (!books || books.length === 0) return '';
    const validDates = books.map(b => Utils.getTimestamp(b.createdAt)).filter(t => t > 0);
    if (validDates.length === 0) return '';
    const d = new Date(Math.max(...validDates));
    return `${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日`;
  }, [books]);

  const invDateStr = useMemo(() => {
    if (!inventoryLastUpdated) return '';
    const d = new Date(inventoryLastUpdated);
    return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
  }, [inventoryLastUpdated]);

  if (!booksReady) return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 px-4 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-indigo-50 mb-4 shadow-sm">
           <Icon name="loader-2" className="w-8 h-8 animate-spin text-indigo-600" />
        </div>
        <p className="text-slate-600 font-extrabold tracking-widest text-lg mb-2">系統資料載入中...</p>
        {slowLoadWarning && (
           <div className="mt-4 bg-amber-50 border border-amber-200 text-amber-800 p-4 rounded-2xl max-w-xs animate-in zoom-in-95 shadow-sm">
             <p className="font-bold flex items-center justify-center gap-1.5 mb-1"><Icon name="alert-triangle" className="w-4 h-4"/> 載入時間較長</p>
             <p className="text-xs leading-relaxed opacity-90">若您使用 iPhone Safari 無痕模式，蘋果的防護機制會使初次連線等待約 20~30 秒。請耐心等候，或改用一般模式 / Chrome 瀏覽器。</p>
           </div>
        )}
      </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 pb-20">
      
      {/* 關於海佃地圖彈窗 */}
      {showAbout && (
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden flex flex-col animate-in zoom-in-95 duration-300">
             <div className="bg-gradient-to-br from-indigo-900 to-slate-800 p-10 text-center relative overflow-hidden">
               <div className="absolute inset-0 opacity-10 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')]"></div>
               <button onClick={() => setShowAbout(false)} className="absolute top-4 right-4 z-20 text-white/50 hover:text-white bg-black/20 hover:bg-black/40 rounded-full p-2 transition-all backdrop-blur-md outline-none focus:ring-2 focus:ring-white">
                 <Icon name="x" className="w-5 h-5" />
               </button>
               <div className="relative z-10 flex flex-col items-center">
                  <div className="w-16 h-16 bg-gradient-to-br from-indigo-400 to-blue-500 rounded-2xl flex items-center justify-center border border-white/20 mb-5 shadow-lg shadow-indigo-500/30 transform rotate-3 hover:rotate-0 transition-transform">
                    <Icon name="map" className="w-8 h-8 text-white -rotate-3" />
                  </div>
                  <h3 className="text-2xl sm:text-3xl font-black text-white tracking-widest mb-1">海佃地圖</h3>
                  <p className="text-indigo-300 font-bold tracking-[0.2em] text-xs uppercase">Haidian Hidden Library</p>
               </div>
             </div>
             <div className="p-8 sm:p-10 text-slate-700 space-y-6 text-sm sm:text-base leading-relaxed font-medium bg-white">
               <div className="text-center">
                 <p className="font-black text-xl text-slate-800 mb-3">海佃<span className="text-indigo-600 inline-block scale-125 mx-1">地</span>下<span className="text-indigo-600 inline-block scale-125 mx-1">圖</span>書室</p>
                 <div className="inline-flex items-center justify-center gap-1.5 text-xs font-bold text-amber-700 bg-amber-50 px-3.5 py-1.5 rounded-full border border-amber-200">
                   <Icon name="lightbulb" className="w-4 h-4" /> 簡稱「海佃地圖」
                 </div>
               </div>
               <p className="text-center font-bold text-slate-400 italic mt-2">" Hidden below, growing beyond. "</p>
               <div className="space-y-4 text-justify px-2 text-slate-600">
                 <p>不只是空間，而是校園閱讀的根系。在看不見的地方，收藏問題、灌溉想像，讓閱讀悄悄生長。</p>
                 <p>孩子從這裡出發，帶走的不只是一本書，而是一張通往世界的<strong className="text-indigo-600 font-black px-1 text-lg">地圖</strong>。</p>
               </div>
               <div className="flex items-center gap-4 py-2">
                 <div className="h-px bg-slate-200 flex-1"></div>
                 <Icon name="book-heart" className="w-5 h-5 text-slate-300" />
                 <div className="h-px bg-slate-200 flex-1"></div>
               </div>
               <div className="space-y-4 text-justify px-2 text-slate-600">
                 <p>如今，我們將地圖的邊界延伸，打造了這座<strong className="text-amber-600 font-black px-1 text-lg">新書許願池</strong>。</p>
                 <p>在這裡，閱讀不再只是單向的給予，而是雙向的參與。孩子們可以為喜歡的書集氣、用實體快通券爭取首讀特權，甚至主動許願，決定圖書館未來的風景！</p>
               </div>
             </div>
             <div className="p-4 sm:p-6 bg-slate-50 border-t border-slate-100">
               <button onClick={() => setShowAbout(false)} className="w-full bg-slate-800 text-white font-bold py-3.5 rounded-xl hover:bg-slate-700 transition-colors outline-none focus:ring-2 focus:ring-slate-800 focus:ring-offset-2 flex justify-center items-center gap-2"><Icon name="check-circle-2" className="w-5 h-5"/> 開始探索</button>
             </div>
          </div>
        </div>
      )}

      {/* 訊息彈窗 */}
      {modalContent && (
         <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
           <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 text-center animate-in zoom-in-95">
             <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-indigo-50 text-indigo-600 mb-4"><Icon name="bell" className="w-6 h-6" /></div>
             <h3 className="text-lg font-black mb-2">{modalContent.title}</h3>
             <p className="text-slate-600 text-sm mb-6 whitespace-pre-wrap">{modalContent.message}</p>
             <button onClick={() => setModalContent(null)} className="w-full bg-slate-900 text-white font-bold py-3 rounded-xl hover:bg-slate-800 transition-colors outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2">我知道了</button>
           </div>
         </div>
      )}

      {/* 快通券輸入彈窗 */}
      {fastPassModalBook && (
        <div className="fixed inset-0 z-[90] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
           <div className="bg-white rounded-3xl p-8 w-full max-w-md animate-in zoom-in-95 shadow-2xl border border-slate-200">
             <div className="flex justify-between items-start mb-6">
               <div>
                 <h3 className="text-2xl font-black mb-1 flex items-center gap-3"><div className="bg-amber-100 text-amber-600 p-2.5 rounded-2xl"><Icon name="ticket" className="w-6 h-6" /></div> 投入快通券 🎟️</h3>
                 <p className="text-sm text-slate-500 font-bold leading-relaxed mt-2">為 <span className="text-indigo-600">《{fastPassModalBook.title}》</span> 增加熱度！<br/>集滿 15 張即可保送採購，投入最多券者獨享首讀特權！目前已有 <span className="text-amber-600 text-lg">{(fastPassModalBook.vipRequests || []).length}</span> 張。</p>
               </div>
               <button onClick={() => { setFastPassModalBook(null); setFastPassInput(''); }} className="text-slate-400 hover:text-slate-700 p-2 rounded-full hover:bg-slate-100 transition-colors outline-none focus:ring-2 focus:ring-slate-200"><Icon name="x" className="w-5 h-5" /></button>
             </div>
             <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 mb-6 shadow-inner">
               <label htmlFor="fastpass-input" className="block text-sm font-bold text-amber-800 mb-3 flex items-center gap-2"><Icon name="key-round" className="w-4 h-4" /> 請輸入您的快通券代碼：</label>
               <input id="fastpass-input" value={fastPassInput} onChange={e=>setFastPassInput(e.target.value)} maxLength={5} className="w-full p-4 border-2 border-amber-300 rounded-xl text-center text-3xl font-black uppercase tracking-[0.3em] bg-white shadow-sm text-amber-900 outline-none focus:ring-4 focus:ring-amber-100 focus:border-amber-500 transition-all" placeholder="XXXXX" />
             </div>
             <div className="flex gap-4">
               <button onClick={()=>{setFastPassModalBook(null); setFastPassInput('');}} className="flex-1 py-3.5 font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-all rounded-xl outline-none focus:ring-2 focus:ring-slate-200">取消</button>
               <button onClick={handleFastPassBoost} className="flex-1 py-3.5 font-black text-white bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 rounded-xl shadow-lg shadow-amber-200 transition-all active:scale-95 outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-1 flex justify-center items-center gap-2"><Icon name="sparkles" className="w-5 h-5"/> 確認投入</button>
             </div>
           </div>
        </div>
      )}
      
      {/* 導覽列 */}
      <header className="bg-white/80 backdrop-blur-lg shadow-sm sticky top-0 z-40 border-b border-slate-200/50">
        <div className="max-w-6xl mx-auto px-3 sm:px-6 lg:px-8">
           <div className="flex justify-between items-center h-16 sm:h-20 gap-2">
             <div className="cursor-pointer hover:opacity-80 transition-opacity flex items-center gap-2 sm:gap-3 min-w-0" onClick={() => { setActiveTab('new-books'); window.scrollTo(0,0); setSearchQuery(''); setFilterType('all'); setFilterKeyword('all'); }}>
               <div className="bg-gradient-to-br from-indigo-500 to-blue-600 p-2 sm:p-3 rounded-lg sm:rounded-xl shadow-sm text-white shrink-0" aria-hidden="true"><Icon name="library" className="w-5 h-5 sm:w-7 sm:h-7" /></div>
               <div className="flex flex-col min-w-0">
                 <div className="flex items-center gap-2 sm:gap-3">
                    <h1 className="text-[16px] sm:text-2xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-indigo-900 to-slate-800 tracking-tight select-none truncate">海佃國小｜新書許願池</h1>
                    <span className="hidden lg:inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] sm:text-sm font-black bg-rose-100 text-rose-700 border border-rose-200 shrink-0"><Icon name="fire" className="w-4 h-4"/>首讀爭奪戰</span>
                 </div>
                 <p className="text-xs sm:text-sm text-slate-500 font-bold hidden sm:block mt-1 truncate">快通券滿 15 張優先採購，最多張者享首讀特權！</p>
               </div>
             </div>
             
             <div className="flex items-center gap-1 sm:gap-4 shrink-0">
               <button onClick={() => setShowAbout(true)} className="flex items-center gap-1 text-[11px] sm:text-sm font-bold text-slate-500 hover:text-indigo-600 transition-colors px-2 sm:px-3 py-1.5 sm:py-2 rounded-xl hover:bg-indigo-50 border border-transparent hover:border-indigo-100 outline-none focus:ring-2 focus:ring-indigo-200 shrink-0">
                 <Icon name="map" className="w-[18px] h-[18px] sm:w-5 sm:h-5" /> <span className="hidden sm:inline">海佃地圖</span>
               </button>
               
               {user && user.isAnonymous === false ? (
                 <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                   <div className="hidden sm:flex items-center gap-1.5 bg-rose-50 border border-rose-100 pl-2.5 pr-3 py-1.5 rounded-full shadow-sm text-rose-600 shrink-0" title="愛心可作為書籍的熱門風向球，每人每天有 3 次集氣機會">
                    <Icon name="heart" className="w-4 h-4 shrink-0" fill="currentColor" strokeWidth={0}/>
                     <span className="text-xs font-extrabold tracking-wide">額度: {Math.max(0, 3 - (lastVoteDayKey === Utils.getTaiwanDayKey() ? dailyVotesCount : 0))}/3</span>
                   </div>
                  
                   <div className="hidden sm:flex items-center gap-2.5 bg-slate-100/80 border border-slate-200 pl-1.5 pr-4 py-1.5 rounded-full shadow-sm shrink-0">
                     {user.photoURL ? <img src={user.photoURL} alt="使用者頭像" className="w-7 h-7 rounded-full shadow-sm shrink-0" /> : <div className="w-7 h-7 rounded-full bg-indigo-200 flex items-center justify-center shrink-0"><Icon name="user" className="w-4 h-4 text-indigo-700" /></div>}
                     <span className="text-sm font-bold text-slate-700 truncate max-w-[120px]">{user.displayName || '圖書室讀者'}</span>
                   </div>
                   <button onClick={handleLogout} aria-label="登出帳號" className="text-xs sm:text-sm text-slate-500 hover:text-rose-600 font-bold flex items-center gap-1 sm:gap-2 px-2.5 sm:px-3 py-2 rounded-lg hover:bg-rose-50 transition-all focus:ring-2 focus:ring-rose-200 outline-none shrink-0"><Icon name="log-out" className="w-4 h-4 shrink-0" /> <span className="hidden sm:block">登出</span></button>
                 </div>
               ) : (
                 <div className="flex items-center gap-2 sm:gap-4 shrink-0">
                   <span className="text-sm font-bold text-slate-400 hidden sm:inline-block tracking-wide shrink-0">訪客瀏覽中</span>
                   <button onClick={handleGoogleLogin} className="flex items-center gap-1 sm:gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-3 sm:px-5 py-2 sm:py-2.5 rounded-lg sm:rounded-xl text-[13px] sm:text-sm font-bold shadow-md shadow-indigo-200 transition-all hover:shadow-lg active:scale-95 focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 outline-none shrink-0"><Icon name="log-in" className="w-4 h-4 shrink-0" /> <span className="hidden sm:inline">Google </span>登入</button>
                 </div>
               )}
             </div>
           </div>
        </div>
      </header>

      {/* 玩法說明區 */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 mt-6">
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-3xl p-6 sm:p-8 shadow-sm relative overflow-hidden">
            <div className="absolute right-0 top-0 opacity-10 pointer-events-none" aria-hidden="true"><Icon name="ticket" className="w-64 h-64 -mt-10 -mr-10" /></div>
            <h2 className="text-amber-900 font-black text-2xl mb-5 flex items-center gap-2 relative z-10"><Icon name="ticket" className="w-8 h-8 text-amber-600"/> 許願池全新玩法：快通競標 & 愛心集氣</h2>
            <ul className="space-y-4 relative z-10 text-base sm:text-lg font-bold text-amber-900/80">
                <li className="flex items-start gap-3">
                   <div className="mt-1 bg-rose-100 p-1.5 rounded-lg text-rose-600 shadow-sm shrink-0"><Icon name="target" className="w-5 h-5"/></div>
                   <div><strong className="text-rose-700 text-lg">15張保送：</strong>書籍集滿 <strong className="text-rose-600 bg-white px-2 py-0.5 rounded shadow-sm border border-rose-100">15 張</strong> 快通券，圖書館即刻優先採購！</div>
                </li>
                <li className="flex items-start gap-3">
                   <div className="mt-1 bg-amber-200 p-1.5 rounded-lg text-amber-700 shadow-sm shrink-0"><Icon name="award" className="w-5 h-5"/></div>
                   <div><strong className="text-amber-800 text-lg">爭奪首讀權：</strong>同一本書，<strong className="text-indigo-700 bg-white px-2 py-0.5 rounded shadow-sm border border-indigo-100">投入最多張券</strong> 的同學，獨享新書「第一順位」借閱特權。</div>
                </li>
                <li className="flex items-start gap-3">
                   <div className="mt-1 bg-slate-200 p-1.5 rounded-lg text-slate-600 shadow-sm shrink-0"><Icon name="history" className="w-5 h-5"/></div>
                   <div><strong className="text-slate-700 text-lg">自由撤回：</strong>只要還沒集滿 15 張，隨時可以撤回您的快通券，改投其他好書。</div>
                </li>
                <li className="flex items-start gap-3">
                   <div className="mt-1 bg-pink-100 p-1.5 rounded-lg text-pink-600 shadow-sm shrink-0"><Icon name="heart" fill="currentColor" className="w-5 h-5"/></div>
                   <div>
                     <strong className="text-pink-700 text-lg">愛心風向球：</strong>每人每天可按 3 次。<br/>
                     <span className="text-amber-700/90 text-sm sm:text-base mt-2 inline-flex items-start gap-1.5 font-bold">
                       <Icon name="lightbulb" className="w-5 h-5 shrink-0 mt-0.5 text-amber-500"/>
                       <span>愛心雖不影響採購，但熱度越高的書，越容易吸引別人來投資快通券喔！</span>
                     </span>
                   </div>
                </li>
            </ul>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 my-8">
        <nav className="flex flex-col md:flex-row justify-between items-center gap-4 sm:gap-6" aria-label="主要導覽列">
           <div className="flex justify-center gap-2 sm:gap-4 overflow-x-auto hide-scrollbar w-full md:w-auto pb-2 md:pb-0">
             {['new-books','wishlist','achieved'].map(t => (
               <button key={t} onClick={()=>setActiveTab(t)} className={`px-4 sm:px-6 py-2.5 rounded-2xl sm:rounded-full text-sm font-black transition-all outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 whitespace-nowrap flex items-center gap-3 ${activeTab===t ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200/50 border border-transparent'}`}>
                 <Icon name={t==='new-books'?'book-open':t==='wishlist'?'pen-tool':'award'} className="w-5 h-5 sm:w-6 sm:h-6" />
                 <div className="flex flex-col items-start text-left justify-center">
                   <span className="text-[15px] sm:text-[17px] leading-tight">{t==='new-books'?'逛嚴選好書':t==='wishlist'?'寫專屬許願單':'達標英雄榜'}</span>
                   <span className={`text-[11px] sm:text-xs leading-tight mt-1 hidden sm:block ${activeTab===t ? 'text-indigo-200' : 'text-slate-400'}`}>{t==='new-books'?'挑選想看的新書':t==='wishlist'?'清單裡沒有喜歡的？':'誰搶到了首讀特權？'}</span>
                 </div>
               </button>
             ))}
           </div>
           
           <div className="w-full md:w-80 relative flex-shrink-0 animate-in fade-in duration-300">
             <Icon name="search" className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
             <input 
               type="text" 
               placeholder="🔍 搜尋書名、作者或出版社..." 
               value={searchQuery} 
               onChange={(e) => setSearchQuery(e.target.value)} 
               className="w-full pl-11 pr-10 py-3 border-2 border-slate-200 rounded-full text-sm font-bold text-slate-700 focus:ring-4 focus:ring-indigo-100 focus:border-indigo-400 bg-white shadow-sm outline-none transition-all placeholder-slate-400"
             />
             {searchQuery && (
               <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-full p-1.5 transition-colors">
                 <Icon name="x" className="w-3 h-3" />
               </button>
             )}
           </div>
        </nav>
      </div>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        {activeTab === 'new-books' && (
          <section className="space-y-6">
            
            <div className="bg-white p-4 sm:p-5 rounded-2xl shadow-sm border border-slate-200 flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
              <div className="flex flex-col sm:flex-row items-center gap-4 w-full lg:w-auto">
                <div className="flex items-center gap-2 text-slate-600 font-bold whitespace-nowrap bg-slate-50 px-3 py-2 rounded-lg"><Icon name="list-filter" className="w-4 h-4" /> 篩選分類</div>
                <select aria-label="選擇圖書類別" className="w-full sm:w-auto px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-slate-50 outline-none transition-all hover:border-slate-300" value={filterType} onChange={(e) => { setFilterType(e.target.value); setFilterKeyword('all'); }}>
                  <option value="all">顯示全部分類</option>
                  <option value="特定作家">特定作家</option>
                  <option value="套書續集">特定套書</option>
                </select>
                {filterType !== 'all' && (
                  <select aria-label="選擇特定標籤" className="w-full sm:w-auto px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-slate-50 outline-none transition-all hover:border-slate-300 animate-in zoom-in-95" value={filterKeyword} onChange={(e) => setFilterKeyword(e.target.value)}>
                    <option value="all">顯示所有項目</option>
                    {(filterType === '特定作家' ? AUTHORS : SERIES).map(item => <option key={item} value={item}>{item}</option>)}
                  </select>
                )}
              </div>
              
              {latestUpdateStr && (
                <div className="flex items-center justify-center gap-2 text-indigo-700 bg-indigo-50 border border-indigo-100 px-4 py-2.5 rounded-xl text-sm sm:text-base font-bold shadow-sm whitespace-nowrap w-full lg:w-auto">
                   <Icon name="calendar-days" className="w-5 h-5" /> 本期書單產製於：{latestUpdateStr}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 xl:gap-8">
              {displayedRegularBooks.length === 0 ? (
                 <div className="col-span-full flex flex-col items-center justify-center py-24 text-slate-400 bg-white rounded-3xl border border-dashed border-slate-200 shadow-sm" role="status">
                   <Icon name="search-x" className="w-16 h-16 mb-4 text-slate-300" />
                   <p className="font-bold text-lg text-slate-500">
                     {searchQuery ? "找不到符合搜尋字詞的書本 😢" : "目前沒有待集氣的書單"}
                   </p>
                 </div>
              ) : (
                displayedRegularBooks.map(b => <BookCard key={b.id || b.isbn} book={b} user={user} isAdmin={isAdmin} handleVote={handleVote} setFastPassModalBook={handleOpenFastPass} handleAdminRemoveVip={handleAdminRemoveVip} handleWithdrawPass={handleWithdrawPass} handleAdminDelete={handleAdminDelete} />)
              )}
              
              {visibleBookCount < regularBooks.length && (
                 <div ref={loaderRef} className="col-span-full py-8 flex items-center justify-center text-indigo-400">
                   <Icon name="loader-2" className="w-8 h-8 animate-spin" />
                 </div>
              )}
            </div>
          </section>
        )}
        
        {activeTab === 'wishlist' && (
           <div className="grid grid-cols-1 lg:grid-cols-12 gap-8" aria-labelledby="section-wishlist-title">
             <div className="lg:col-span-5 xl:col-span-4">
               <div className="bg-white p-6 sm:p-8 rounded-3xl shadow-sm border border-slate-200 sticky top-28">
                 <h2 id="section-wishlist-title" className="text-xl font-extrabold text-slate-800 mb-6 flex items-center gap-3"><div className="bg-indigo-100 p-2 rounded-xl text-indigo-600"><Icon name="edit-3" className="w-5 h-5" /></div> 提交許願書單</h2>
                 
                 {(!user || user.isAnonymous) && (
                   <div className="mb-6 p-4 bg-amber-50 text-amber-800 text-sm font-bold rounded-2xl border border-amber-200 flex items-start gap-3 shadow-sm"><Icon name="info" className="w-5 h-5 flex-shrink-0 text-amber-600"/>請先點擊右上角「Google 登入」再填寫唷！</div>
                 )}
                 
                 <form onSubmit={submitWishlist} className="space-y-6">
                   <div>
                     <label htmlFor="input-title" className="block text-sm font-bold text-slate-700 mb-2">書籍名稱 <span className="text-rose-500">*</span></label>
                     <input id="input-title" type="text" required disabled={!user || user.isAnonymous} className="w-full px-4 py-3.5 border-2 border-slate-200 rounded-xl disabled:bg-slate-50 disabled:text-slate-400 focus:ring-4 focus:ring-indigo-50 focus:border-indigo-500 outline-none transition-all font-medium text-slate-700" value={wishFormData.title} onChange={(e) => setWishFormData({...wishFormData, title: e.target.value})} placeholder="請輸入完整書名" />
                   </div>
                   
                   <div>
                     <label htmlFor="input-isbn" className="block text-sm font-bold text-slate-700 mb-2">ISBN 國際標準書號{invDateStr && <span className="font-semibold text-slate-400 text-xs ml-2">(庫存基準：{invDateStr})</span>}</label>
                     <input id="input-isbn" type="text" disabled={!user || user.isAnonymous} className="w-full px-4 py-3.5 border-2 border-slate-200 rounded-xl disabled:bg-slate-50 disabled:text-slate-400 focus:ring-4 focus:ring-indigo-50 focus:border-indigo-500 outline-none font-mono text-slate-700 transition-all tracking-wider" value={wishFormData.isbn} onChange={handleIsbnChange} placeholder="輸入自動比對館藏" />
                     {inventoryCheckResult === 'checking' && <p className="text-xs text-blue-600 mt-2.5 flex items-center gap-1.5 font-bold" role="status"><Icon name="loader-2" className="w-4 h-4 animate-spin text-blue-600"/> 比對館藏系統中...</p>}
                     {inventoryCheckResult === 'clear' && <p className="text-xs text-emerald-600 mt-2.5 flex items-center gap-1.5 font-bold" role="status"><Icon name="check-circle-2" className="w-4 h-4 text-emerald-600"/> 館內無此書，歡迎許願！</p>}
                     {inventoryCheckResult === 'found' && (
                       <div className="mt-3 p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800 shadow-sm animate-in zoom-in-95" role="alert">
                         <p className="font-extrabold flex items-center gap-2 mb-1.5"><Icon name="alert-triangle" className="w-4 h-4 text-amber-600"/> 圖書館已有此書 {inventoryCount} 本！</p>
                         <p className="text-xs font-medium text-amber-700/80">若確定採購，請在下方填寫重複原因。</p>
                       </div>
                     )}
                   </div>
                   
                   {inventoryCheckResult === 'found' && (
                     <div className="animate-in fade-in slide-in-from-top-2">
                       <label htmlFor="input-duplicate" className="block text-sm font-bold text-rose-700 mb-2">重複採購原因 <span className="text-rose-500">*</span></label>
                       <input id="input-duplicate" type="text" required disabled={!user || user.isAnonymous} className="w-full px-4 py-3.5 border-2 border-rose-200 rounded-xl focus:ring-4 focus:ring-rose-50 focus:border-rose-500 outline-none transition-all font-medium text-slate-700" value={wishFormData.duplicateReason} onChange={(e) => setWishFormData({...wishFormData, duplicateReason: e.target.value})} placeholder="例：原書已破損掉頁" />
                     </div>
                   )}
                   
                   <div>
                     <label htmlFor="input-reason" className="block text-sm font-bold text-slate-700 mb-2">推薦原因</label>
                     <textarea id="input-reason" disabled={!user || user.isAnonymous} className="w-full px-4 py-4 border-2 border-slate-200 rounded-xl h-28 resize-none disabled:bg-slate-50 disabled:text-slate-400 focus:ring-4 focus:ring-indigo-50 focus:border-indigo-500 outline-none transition-all font-medium text-slate-700 leading-relaxed" value={wishFormData.reason} onChange={(e) => setWishFormData({...wishFormData, reason: e.target.value})} placeholder="為什麼想推薦這本書？" />
                   </div>
                   
                   <div className="bg-amber-50/50 p-5 rounded-2xl border border-amber-100">
                     <label htmlFor="input-vip" className="flex items-center justify-between text-sm font-extrabold text-amber-800 mb-3"><span className="inline-flex items-center gap-2"><Icon name="ticket" className="w-4 h-4 text-amber-600" /> 優先快通券</span><span className="text-amber-600/70 font-bold text-xs">(選填)</span></label>
                     <input id="input-vip" type="text" disabled={!user || user.isAnonymous} className="w-full px-4 py-3 border-2 border-amber-200 rounded-xl bg-white focus:outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-50 placeholder-amber-300 font-mono text-lg lowercase transition-all tracking-widest text-amber-900 font-bold" value={wishFormData.vipCode} onChange={(e) => setWishFormData({...wishFormData, vipCode: e.target.value})} placeholder="5碼序號" />
                   </div>

                   <button type="submit" disabled={!user || user.isAnonymous} className="w-full bg-gradient-to-r from-indigo-600 to-blue-600 text-white font-extrabold py-4 rounded-xl hover:from-indigo-700 hover:to-blue-700 hover:shadow-lg hover:shadow-indigo-200 transition-all disabled:opacity-50 disabled:shadow-none disabled:transform-none flex items-center justify-center gap-2 active:scale-95 text-base tracking-wide focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 outline-none"><Icon name="send" className="w-5 h-5" /> 送出許願清單</button>
                 </form>
               </div>
             </div>

             <div className="lg:col-span-7 xl:col-span-8">
               <h2 className="text-xl font-extrabold text-slate-800 mb-6 flex items-center gap-3 ml-1"><div className="bg-blue-100 p-2 rounded-xl text-blue-600"><Icon name="book-heart" className="w-5 h-5" /></div>大家的許願待集氣清單</h2>
               <div className="space-y-5">
                 {regularWishlists.length === 0 ? (
                   <div className="flex flex-col items-center justify-center py-24 text-slate-400 bg-white rounded-3xl border border-dashed border-slate-200 shadow-sm" role="status">
                     <Icon name="inbox" className="w-16 h-16 mb-4 text-slate-300" />
                     <p className="font-bold text-lg text-slate-500">
                       {searchQuery ? "找不到符合搜尋字詞的許願單 😢" : "目前沒有待集氣的許願單喔！"}
                     </p>
                   </div>
                 ) : (
                  regularWishlists.map(wish => <WishlistCard key={wish.id} wish={wish} user={user} isAdmin={isAdmin} handleVote={handleVote} setFastPassModalBook={handleOpenFastPass} handleAdminRemoveVip={handleAdminRemoveVip} handleWithdrawPass={handleWithdrawPass} handleAdminDelete={handleAdminDelete} />)
                 )}
               </div>
             </div>
           </div>
        )}

        {activeTab === 'achieved' && (
           <div className="space-y-12">
              <div className="bg-gradient-to-r from-rose-50 via-white to-pink-50 border border-rose-200 rounded-3xl p-8 shadow-sm flex flex-col sm:flex-row items-start gap-6 relative overflow-hidden">
                <div className="absolute right-0 top-0 opacity-5 pointer-events-none" aria-hidden="true"><Icon name="target" className="w-64 h-64 -mt-10 -mr-10" /></div>
                <div className="bg-rose-100 p-3 rounded-2xl shadow-sm text-rose-600 flex-shrink-0 z-10 border border-rose-50"><Icon name="target" className="w-8 h-8" /></div>
                <div className="z-10">
                  <h2 className="text-xl font-extrabold text-rose-900 mb-3 tracking-wide">恭喜以下書籍達成門檻！</h2>
                  <p className="text-rose-800/80 leading-relaxed text-sm sm:text-base font-bold">這些書籍已經成功累積 <span className="text-rose-600 bg-white px-1.5 rounded shadow-sm border border-rose-100">15 張快通券</span>，並成功產生了首讀特權得主！<br/>圖書室已將它們列入最優先的採購清單，敬請期待它們上架的日子！</p>
                </div>
              </div>
              
              {achievedBooks.length > 0 && (
                <div>
                  <h3 className="text-xl font-extrabold text-slate-800 mb-6 flex items-center gap-2 ml-1"><Icon name="book-open" className="w-6 h-6 text-indigo-500" /> 🌟 新書推薦達標</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 xl:gap-8">
                    {achievedBooks.map(b => <BookCard key={b.id || b.isbn} book={b} user={user} isAdmin={isAdmin} handleVote={handleVote} setFastPassModalBook={handleOpenFastPass} handleAdminRemoveVip={handleAdminRemoveVip} handleWithdrawPass={handleWithdrawPass} handleAdminDelete={handleAdminDelete} />)}
                  </div>
                </div>
              )}
              {achievedWishlists.length > 0 && (
                <div>
                  <h3 className="text-xl font-extrabold text-slate-800 mb-6 flex items-center gap-2 ml-1"><Icon name="pen-tool" className="w-6 h-6 text-indigo-500" /> 🌟 讀者許願達標</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 xl:gap-8 max-w-4xl">
                    {achievedWishlists.map(w => <WishlistCard key={w.id} wish={w} user={user} isAdmin={isAdmin} handleVote={handleVote} setFastPassModalBook={handleOpenFastPass} handleAdminRemoveVip={handleAdminRemoveVip} handleWithdrawPass={handleWithdrawPass} handleAdminDelete={handleAdminDelete} />)}
                  </div>
                </div>
              )}
              {achievedBooks.length === 0 && achievedWishlists.length === 0 && (
                <div className="flex flex-col items-center justify-center py-24 text-slate-400 bg-white rounded-3xl border border-dashed border-slate-200 shadow-sm" role="status">
                   <Icon name="search-x" className="w-16 h-16 mb-4 text-slate-300 opacity-70" />
                   <p className="font-bold text-lg text-slate-500">
                      {searchQuery ? "找不到符合搜尋字詞的達標書本 😢" : "目前還沒有書籍達成門檻，快去幫喜歡的書集氣吧！"}
                   </p>
                </div>
              )}
           </div>
        )}
      </main>
      
      {/* 🔥 流量守門員：加入快取運作狀態指示燈，讓校方安心 */}
      <footer className="py-8 mt-12 text-center text-slate-400 text-[11px] sm:text-xs font-medium border-t border-slate-200/60">
        <div className="flex items-center justify-center gap-2 mb-3 bg-emerald-50/50 text-emerald-600 border border-emerald-100/50 w-fit mx-auto px-3.5 py-1.5 rounded-full shadow-sm">
           <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></div>
           <span className="font-bold tracking-wide">PWA 邊緣快取與即時同步運作中</span>
        </div>
        <p>海佃國小圖書室版權所有 © {new Date().getFullYear()}</p>
      </footer>
      
    </div>
  );
}

export default function MainApp() {
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}