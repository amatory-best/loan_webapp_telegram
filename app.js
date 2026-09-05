let tg=null;
try{tg=window.Telegram.WebApp;tg.ready();tg.expand();tg.setHeaderColor('#ffffff');tg.setBackgroundColor('#f0f2f5');if(tg.colorScheme==='dark')document.documentElement.setAttribute('data-theme','dark');tg.HapticFeedback.impactOccurred('light');}catch(e){console.log('Telegram WebApp SDK не доступен');}

// ============================================
// ДАННЫЕ
// ============================================
let loansData = (typeof window !== 'undefined' && window.DEFAULT_LOANS_DATA) ? window.DEFAULT_LOANS_DATA : [];
let currentScreen = 'home';
let chartInstances = {};
let lastSyncTime = localStorage.getItem('last_sync_time') || null;
let serverUrl = localStorage.getItem('server_url') || 'http://localhost:5000';
let serverStatus = 'disconnected';

async function fetchLoans(){
  try{
    const res = await fetch(serverUrl + '/api/loans', {method:'GET'});
    if(!res.ok) throw new Error('HTTP '+res.status);
    const data = await res.json();
    if(data.success && data.loans && data.loans.length>0){
      loansData = data.loans;
      renderLoans();
      updateSummary();
      updateBadges();
      if(currentScreen==='stats') renderStats();
      lastSyncTime = Date.now();
      localStorage.setItem('last_sync_time', lastSyncTime);
      updateSyncStatus();
      updateFileList(data.files || []);
      localStorage.setItem('sync_files', JSON.stringify(data.files || []));
      serverStatus = 'connected';
      return true;
    }
  }catch(e){
    console.error('Server fetch error:', e);
    serverStatus = 'error';
  }
  return false;
}

async function checkServer(){
  try{
    const res = await fetch(serverUrl + '/api/health', {method:'GET'});
    if(res.ok){
      const data = await res.json();
      serverStatus = data.folder_exists ? 'connected' : 'no_folder';
      return true;
    }
  }catch(e){}
  serverStatus = 'disconnected';
  return false;
}

async function syncNow(){
  showToast('Синхронизация с сервером...', 1500);
  const ok = await fetchLoans();
  if(ok){
    showToast('Синхронизировано ' + loansData.length + ' записей');
  }else{
    showToast('Сервер недоступен, используются встроенные данные');
  }
}

async function autoSyncStartup(){
  const ok = await checkServer();
  if(ok){
    console.log('Server connected, fetching loans...');
    await fetchLoans();
  }else{
    console.log('Server not available, using embedded data');
    showToast('Сервер не найден, используются встроенные данные');
  }
}


// ============================================
// УТИЛИТЫ
// ============================================
function formatAmount(v){return v.toLocaleString('ru-RU')}
function formatCurrency(v){return v.toFixed(2).replace('.',',')+' руб.'}
function getStatusClass(s){const m={overdue:'danger',active:'success',warning:'warning',closed:'info'};return m[s]||'info'}
function showToast(msg,dur=2000){
  const t=document.getElementById('toast');t.textContent=msg;t.classList.add('show');
  if(tg&&tg.HapticFeedback)tg.HapticFeedback.notificationOccurred('success');
  setTimeout(()=>t.classList.remove('show'),dur);
}
async function copyToClipboard(txt){
  try{await navigator.clipboard.writeText(txt);showToast('Идентификатор скопирован!');}
  catch(e){const ta=document.createElement('textarea');ta.value=txt;ta.style.position='fixed';ta.style.opacity='0';document.body.appendChild(ta);ta.select();document.execCommand('copy');document.body.removeChild(ta);showToast('Идентификатор скопирован!');}
}

// ============================================
// ТЕМА
// ============================================
function initTheme(){
  const saved = localStorage.getItem('app_theme') || 'system';
  applyTheme(saved);
  updateThemeButtons(saved);
}

function applyTheme(theme){
  const root = document.documentElement;
  if(theme === 'dark'){
    root.setAttribute('data-theme','dark');
    if(tg){tg.setHeaderColor('#1c1c1e');tg.setBackgroundColor('#000000');}
  }else if(theme === 'light'){
    root.removeAttribute('data-theme');
    if(tg){tg.setHeaderColor('#ffffff');tg.setBackgroundColor('#f0f2f5');}
  }else{
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if(prefersDark){
      root.setAttribute('data-theme','dark');
      if(tg){tg.setHeaderColor('#1c1c1e');tg.setBackgroundColor('#000000');}
    }else{
      root.removeAttribute('data-theme');
      if(tg){tg.setHeaderColor('#ffffff');tg.setBackgroundColor('#f0f2f5');}
    }
  }
}

function updateThemeButtons(active){
  document.querySelectorAll('.theme-btn').forEach(btn=>{
    const t = btn.dataset.theme;
    if(t === active){
      btn.style.borderColor = 'var(--color-accent)';
      btn.style.background = 'var(--color-accent-light)';
    }else{
      btn.style.borderColor = 'var(--color-border)';
      btn.style.background = 'var(--color-surface)';
    }
  });
}

function setTheme(theme){
  localStorage.setItem('app_theme', theme);
  applyTheme(theme);
  updateThemeButtons(theme);
  showToast('Тема применена');
}

// ============================================
// НАВИГАЦИЯ МЕЖДУ ЭКРАНАМИ
// ============================================
function showScreen(screen){
  currentScreen = screen;
  document.getElementById('contentArea').style.display = screen==='home' ? 'block' : 'none';
  document.querySelector('.summary-section').style.display = screen==='home' ? 'block' : 'none';
  document.querySelector('.tabs-section').style.display = screen==='home' ? 'block' : 'none';
  document.getElementById('screenStats').style.display = screen==='stats' ? 'flex' : 'none';
  document.getElementById('screenProfile').style.display = screen==='profile' ? 'flex' : 'none';

  document.querySelectorAll('.nav-item').forEach(i=>i.classList.remove('active'));
  const activeNav = document.querySelector('.nav-item[data-screen="'+screen+'"]');
  if(activeNav) activeNav.classList.add('active');

  if(screen==='stats') renderStats();
  if(screen==='profile') updateSyncStatus();
  if(tg&&tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
}

// ============================================
// РЕНДЕРИНГ ГЛАВНОГО ЭКРАНА
// ============================================
let currentFilter='nearest';

function getFilteredLoans(filter){
  if(filter==='nearest'){
    const today=new Date();today.setHours(0,0,0,0);
    return loansData.filter(l=>{
      if(!l.returnDate)return false;
      const parts=l.returnDate.split('.');
      if(parts.length!==3)return false;
      const d=new Date(parseInt(parts[2]),parseInt(parts[1])-1,parseInt(parts[0]));
      d.setHours(0,0,0,0);
      return d.getTime()===today.getTime();
    });
  }
  return loansData.filter(l=>l.status===filter);
}

function renderLoans(filter='nearest'){
  const c=document.getElementById('loansList');
  const f=filter==='nearest'?getFilteredLoans('nearest'):loansData.filter(l=>l.status===filter);
  if(f.length===0){
    c.innerHTML='<div class="empty-state"><div class="empty-state-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg></div><div class="empty-state-title">Нет займов</div><div class="empty-state-desc">В этой категории пока нет записей.</div></div>';
    return;
  }
  c.innerHTML=f.map((loan,idx)=>{
    const sc=getStatusClass(loan.status);
    const dt=loan.daysLeft<0?`Просрочка ${Math.abs(loan.daysLeft)} дн.`:loan.daysLeft===0?(loan.status==='closed'?'Возвращён':'Сегодня'):`Осталось ${loan.daysLeft} дн.`;
    return `<article class="loan-card status-${sc}" data-id="${loan.id}" onclick="openLoanModal('${loan.id}')" style="animation-delay:${idx*0.05}s"><div class="loan-card-header"><div class="loan-card-amount">${formatAmount(loan.amount)} <span class="currency">${loan.currency}</span></div><span class="loan-status-chip ${sc}">${loan.statusLabel}</span></div><div class="loan-card-body"><div class="loan-card-field"><span class="loan-card-field-label">Заёмщик</span><span class="loan-card-field-value">${loan.clientName}</span></div><div class="loan-card-field"><span class="loan-card-field-label">Ставка</span><span class="loan-card-field-value">${loan.rate}</span></div><div class="loan-card-field"><span class="loan-card-field-label">Срок</span><span class="loan-card-field-value">${loan.term}</span></div><div class="loan-card-field"><span class="loan-card-field-label">К возврату</span><span class="loan-card-field-value">${formatAmount(loan.totalReturn)} ${loan.currency}</span></div></div><div class="loan-card-footer"><span class="loan-card-date">${dt}</span><span class="loan-card-profit">+${formatAmount(loan.profit)} ${loan.currency}</span></div></article>`;
  }).join('');
}

function updateBadges(){
  const nearestCount=getFilteredLoans('nearest').length;
  const c={nearest:nearestCount,active:loansData.filter(l=>l.status==='active').length,overdue:loansData.filter(l=>l.status==='overdue').length,closed:loansData.filter(l=>l.status==='closed').length};
  document.getElementById('badgeNearest').textContent=c.nearest;
  document.getElementById('badgeActive').textContent=c.active;
  document.getElementById('badgeOverdue').textContent=c.overdue;
  document.getElementById('badgeClosed').textContent=c.closed;
  const nb=document.getElementById('navBadge');
  if(c.overdue>0){nb.textContent=c.overdue;nb.style.display='flex';}else{nb.style.display='none';}
}

function updateSummary(){
  const a=loansData.filter(l=>l.status!=='closed');
  const t=a.reduce((s,l)=>s+l.amount,0);
  const o=loansData.filter(l=>l.status==='overdue').reduce((s,l)=>s+l.amount,0);
  const p=loansData.filter(l=>l.status==='closed').reduce((s,l)=>s+l.profit,0);
  document.getElementById('summaryTotal').textContent=formatAmount(t)+' ₽';
  document.getElementById('summaryOverdue').textContent=formatAmount(o)+' ₽';
  document.getElementById('summaryProfit').textContent='+'+formatAmount(p)+' ₽';
}

// ============================================
// ПОИСК
// ============================================
let searchMode=false;

function initSearch(){
  const btn=document.getElementById('btnSearch');
  const input=document.getElementById('searchInput');
  if(!btn||!input)return;

  btn.addEventListener('click',()=>{
    searchMode=!searchMode;
    if(searchMode){
      input.style.display='block';
      input.style.width='180px';
      input.style.opacity='1';
      input.focus();
    }else{
      input.style.width='0';
      input.style.opacity='0';
      setTimeout(()=>{input.style.display='none';input.value='';renderLoans(currentFilter);},300);
    }
    if(tg&&tg.HapticFeedback)tg.HapticFeedback.impactOccurred('light');
  });

  input.addEventListener('input',(e)=>{
    const q=e.target.value.trim().toLowerCase();
    if(!q){renderLoans(currentFilter);return;}
    const results=loansData.filter(l=>{
      const byName = l.clientName.toLowerCase().includes(q);
      const byContract = (l.contract && l.contract.number && l.contract.number.toLowerCase().includes(q));
      const byId = l.id && l.id.toLowerCase().includes(q);
      return byName || byContract || byId;
    });
    const c=document.getElementById('loansList');
    if(results.length===0){
      c.innerHTML='<div class="empty-state"><div class="empty-state-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg></div><div class="empty-state-title">Ничего не найдено</div><div class="empty-state-desc">Попробуйте другую фамилию.</div></div>';
      return;
    }
    c.innerHTML=results.map((loan,idx)=>{
      const sc=getStatusClass(loan.status);
      const dt=loan.daysLeft<0?`Просрочка ${Math.abs(loan.daysLeft)} дн.`:loan.daysLeft===0?(loan.status==='closed'?'Возвращён':'Сегодня'):`Осталось ${loan.daysLeft} дн.`;
      return `<article class="loan-card status-${sc}" data-id="${loan.id}" onclick="openLoanModal('${loan.id}')" style="animation-delay:${idx*0.05}s"><div class="loan-card-header"><div class="loan-card-amount">${formatAmount(loan.amount)} <span class="currency">${loan.currency}</span></div><span class="loan-status-chip ${sc}">${loan.statusLabel}</span></div><div class="loan-card-body"><div class="loan-card-field"><span class="loan-card-field-label">Заёмщик</span><span class="loan-card-field-value">${loan.clientName}</span></div><div class="loan-card-field"><span class="loan-card-field-label">Ставка</span><span class="loan-card-field-value">${loan.rate}</span></div><div class="loan-card-field"><span class="loan-card-field-label">Срок</span><span class="loan-card-field-value">${loan.term}</span></div><div class="loan-card-field"><span class="loan-card-field-label">К возврату</span><span class="loan-card-field-value">${formatAmount(loan.totalReturn)} ${loan.currency}</span></div></div><div class="loan-card-footer"><span class="loan-card-date">${dt}</span><span class="loan-card-profit">+${formatAmount(loan.profit)} ${loan.currency}</span></div></article>`;
    }).join('');
  });

  input.addEventListener('keydown',(e)=>{
    if(e.key==='Escape'){
      searchMode=false;
      input.style.width='0';
      input.style.opacity='0';
      setTimeout(()=>{input.style.display='none';input.value='';renderLoans(currentFilter);},300);
    }
  });
}

// ============================================
// МОДАЛЬНОЕ ОКНО
// ============================================
function openLoanModal(loanId){
  const loan=loansData.find(l=>l.id===loanId);
  if(!loan)return;
  if(tg&&tg.HapticFeedback)tg.HapticFeedback.impactOccurred('light');

  const badge=document.getElementById('statusBadge');
  badge.textContent=loan.statusLabel;
  badge.className='status-badge '+getStatusClass(loan.status);

  document.getElementById('modalTitle').textContent=loan.contract.number;

  const sourceEl = document.getElementById('loanSource');
  if(sourceEl){
    let source = loan.source || '';
    if(source){
      source = source.replace(/^.*[\\\/]/, '');
      source = source.replace(/\.[^\/.]+$/, '');
      source = source.trim();
    }
    sourceEl.textContent = source ? 'Источник: ' + source : 'Источник: не указан';
    sourceEl.title = source || '';
  }

  document.getElementById('loanAmount').innerHTML=`${loan.amount} <span class="currency">${loan.currency}</span>`;
  document.getElementById('loanTerm').textContent=loan.term;
  document.getElementById('loanRate').textContent=loan.rate;
  document.getElementById('issueDate').textContent=loan.issueDate;
  document.getElementById('returnDate').textContent=loan.returnDate;

  document.getElementById('totalReturn').textContent=formatCurrency(loan.totalReturn);
  document.getElementById('taxes').textContent=formatCurrency(loan.finance.taxes);
  document.getElementById('serviceFee').textContent=formatCurrency(loan.finance.serviceFee);
  document.getElementById('toCard').textContent=formatCurrency(loan.finance.toCard);
  document.getElementById('netProfit').textContent=formatCurrency(loan.finance.netProfit);

  document.getElementById('clientAvatar').textContent=loan.client.score || loan.client.initials;
  document.getElementById('clientName').textContent=loan.client.fullName;
  const pl=document.getElementById('clientPhone');
  const pt=document.getElementById('phoneText');
  const mi=document.getElementById('messengerIcons');
  if(loan.client.phone){
    pl.href='tel:'+loan.client.phone;
    const phoneClean=loan.client.phone.replace(/\D/g,'');
    const phoneHtml = (loan.client.phoneFormatted || loan.client.phone);
    const messengersHtml = '<div class="messenger-icons" style="gap:4px;margin-top:0;margin-left:6px">'+
      '<a class="messenger-icon messenger-tg" href="https://t.me/+'+phoneClean+'" target="_blank" title="Telegram" style="width:28px;height:28px"><svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 0 0-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z"/></svg></a>'+
      '<a class="messenger-icon messenger-wa" href="https://wa.me/'+phoneClean+'" target="_blank" title="WhatsApp" style="width:28px;height:28px"><svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.051-1.38l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg></a>'+
      '<a class="messenger-icon messenger-vb" href="viber://add?number='+phoneClean+'" target="_blank" title="Viber" style="width:28px;height:28px"><svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M11.96 0C5.36 0 .01 5.24.01 11.7c0 3.36 1.47 6.68 4.02 8.97l.01 3.63c0 .32.19.6.48.73.1.04.2.06.31.06.19 0 .37-.07.51-.2l3.17-2.85c1.06.29 2.17.44 3.29.44 6.6 0 11.95-5.24 11.95-11.7C23.91 5.24 18.56 0 11.96 0zm6.35 15.16c-.28.78-1.53 1.43-2.13 1.52-.59.09-1.16.27-3.88-.82-3.29-1.3-5.36-4.67-5.52-4.89-.16-.22-1.31-1.74-1.31-3.32 0-1.58.83-2.35 1.13-2.67.3-.32.65-.4.87-.4.22 0 .43 0 .62.01.2.01.46-.08.72.55.26.63 1.02 2.47 1.11 2.64.09.18.15.38.03.61-.12.23-.18.38-.36.58-.18.2-.38.44-.54.59-.18.17-.36.35-.24.69.12.34.56 1.85 1.19 2.99.82 1.45 1.49 1.95 1.76 2.16.26.21.44.18.6-.1.16-.28.69-.8.87-1.08.18-.28.36-.23.6-.14.24.09 1.53.72 1.79.85.26.13.44.2.5.31.06.11.06.64-.22 1.42z"/></svg></a>'+
    '</div>';
    pl.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>'+phoneHtml+messengersHtml;
    pl.style.display='inline-flex';
    if(mi)mi.style.display='none';
  }else{
    pl.href='#';
    pl.innerHTML='<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>Не указан';
    pl.style.display='inline-flex';
    if(mi)mi.style.display='none';
  }
  const notesEl = document.getElementById('clientNotes');
  if(notesEl){
    const rating = loan.client?.rating ?? loan.rating ?? null;
    notesEl.textContent = (rating !== null && rating !== undefined && rating !== '') ? rating : '—';
  }
  const idEl=document.getElementById('clientId');
  if(loan.client.idNumber){
    idEl.dataset.copy=loan.client.idNumber;
    idEl.innerHTML=loan.client.idNumber+'<svg class="copy-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
    idEl.style.display='inline-flex';
  }else{
    idEl.dataset.copy='';
    idEl.innerHTML='Не указан<svg class="copy-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
    idEl.style.display='inline-flex';
  }

  const extraRow = document.getElementById('extraInfoRow');
  const extraEl = document.getElementById('clientExtraInfo');
  if(loan.extraInfo && loan.extraInfo.trim()){
    extraEl.textContent = loan.extraInfo;
    extraRow.style.display = 'flex';
  }else{
    extraRow.style.display = 'none';
  }

  document.getElementById('loanModalOverlay').classList.add('open');
  document.body.style.overflow='hidden';
}

function closeLoanModal(){
  document.getElementById('loanModalOverlay').classList.remove('open');
  document.body.style.overflow='';
}

// ============================================
// СТАТИСТИКА
// ============================================
function renderStats(){
  if(!loansData.length)return;

  const totalProfit = loansData.filter(l=>l.status==='closed').reduce((s,l)=>s+l.profit,0);
  const totalOverdue = loansData.filter(l=>l.status==='overdue').reduce((s,l)=>s+l.amount,0);
  const totalActive = loansData.filter(l=>l.status!=='closed').reduce((s,l)=>s+l.amount,0);
  const activeCount = loansData.filter(l=>l.status!=='closed').length;
  const avgCheck = loansData.length ? (loansData.reduce((s,l)=>s+l.amount,0)/loansData.length) : 0;
  const overduePct = totalActive ? (totalOverdue/totalActive*100) : 0;

  document.getElementById('kpiProfit').textContent = formatAmount(Math.round(totalProfit))+' ₽';
  document.getElementById('kpiOverdue').textContent = formatAmount(Math.round(totalOverdue))+' ₽';
  document.getElementById('kpiOverduePct').textContent = overduePct.toFixed(1)+'%';
  document.getElementById('kpiActive').textContent = activeCount;
  document.getElementById('kpiAvg').textContent = formatAmount(Math.round(avgCheck))+' ₽';

  renderCharts();

  const debtors = loansData
    .filter(l=>l.status==='overdue')
    .sort((a,b)=>b.amount-a.amount)
    .slice(0,10);

  const debtorsHtml = debtors.length ? `
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <thead><tr style="border-bottom:1px solid var(--color-border)">
        <th style="text-align:left;padding:8px 4px;color:var(--color-text-secondary);font-weight:500">Заёмщик</th>
        <th style="text-align:right;padding:8px 4px;color:var(--color-text-secondary);font-weight:500">Сумма</th>
        <th style="text-align:right;padding:8px 4px;color:var(--color-text-secondary);font-weight:500">Дней</th>
      </tr></thead>
      <tbody>
        ${debtors.map(d=>`<tr style="border-bottom:1px solid var(--color-border-light);cursor:pointer" onclick="openLoanModal('${d.id}')">
          <td style="padding:10px 4px;color:var(--color-text-primary)">${d.clientName}</td>
          <td style="padding:10px 4px;text-align:right;font-weight:600;color:var(--color-danger)">${formatAmount(d.amount)} ₽</td>
          <td style="padding:10px 4px;text-align:right;color:var(--color-text-secondary)">${Math.abs(d.daysLeft)}</td>
        </tr>`).join('')}
      </tbody>
    </table>` : '<div style="text-align:center;color:var(--color-text-secondary);padding:20px">Нет просрочек</div>';
  document.getElementById('topDebtorsTable').innerHTML = debtorsHtml;

  const today = new Date(); today.setHours(0,0,0,0);
  const forecast = [];
  const year = today.getFullYear();
  const month = today.getMonth();
  const lastDay = new Date(year, month + 1, 0).getDate();
  for(let day=today.getDate(); day<=lastDay; day++){
    const d = new Date(year, month, day);
    const ds = d.getDate().toString().padStart(2,'0')+'.'+(d.getMonth()+1).toString().padStart(2,'0')+'.'+d.getFullYear();
    const dayLoans = loansData.filter(l=>l.returnDate===ds && l.status!=='closed');
    const daySum = dayLoans.reduce((s,l)=>s+l.totalReturn,0);
    forecast.push({date:ds,sum:daySum,count:dayLoans.length});
  }

  const forecastHtml = forecast.some(f=>f.sum>0) ? `
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <thead><tr style="border-bottom:1px solid var(--color-border)">
        <th style="text-align:left;padding:8px 4px;color:var(--color-text-secondary);font-weight:500">Дата</th>
        <th style="text-align:right;padding:8px 4px;color:var(--color-text-secondary);font-weight:500">Кол-во</th>
        <th style="text-align:right;padding:8px 4px;color:var(--color-text-secondary);font-weight:500">Сумма</th>
      </tr></thead>
      <tbody>
        ${forecast.filter(f=>f.sum>0).map(f=>`<tr style="border-bottom:1px solid var(--color-border-light)">
          <td style="padding:10px 4px;color:var(--color-text-primary)">${f.date}</td>
          <td style="padding:10px 4px;text-align:right;color:var(--color-text-secondary)">${f.count}</td>
          <td style="padding:10px 4px;text-align:right;font-weight:600;color:var(--color-accent-dark)">${formatAmount(Math.round(f.sum))} ₽</td>
        </tr>`).join('')}
      </tbody>
    </table>` : '<div style="text-align:center;color:var(--color-text-secondary);padding:20px">Нет ожидаемых платежей</div>';
  document.getElementById('forecastTable').innerHTML = forecastHtml;
}

function renderCharts(){
  Object.values(chartInstances).forEach(c=>c&&c.destroy&&c.destroy());
  chartInstances = {};

  const isDark = document.documentElement.getAttribute('data-theme')==='dark';
  const textColor = isDark ? '#8e8e93' : '#8e8e93';
  const gridColor = isDark ? '#38383a' : '#e5e5ea';

  const dateMap = {};
  loansData.forEach(l=>{
    if(!dateMap[l.issueDate]) dateMap[l.issueDate]={profit:0,overdue:0};
    dateMap[l.issueDate].profit += l.profit;
    if(l.status==='overdue') dateMap[l.issueDate].overdue += l.amount;
  });
  const sortedDates = Object.keys(dateMap).sort();
  const profits = sortedDates.map(d=>dateMap[d].profit);
  const overdues = sortedDates.map(d=>dateMap[d].overdue);

  const ctx1 = document.getElementById('chartDynamics');
  if(ctx1){
    chartInstances.dynamics = new Chart(ctx1,{
      type:'line',
      data:{
        labels:sortedDates,
        datasets:[
          {label:'Прибыль',data:profits,borderColor:'#34c759',backgroundColor:'rgba(52,199,89,0.1)',tension:0.4,fill:true},
          {label:'Просрочка',data:overdues,borderColor:'#ff3b30',backgroundColor:'rgba(255,59,48,0.1)',tension:0.4,fill:true}
        ]
      },
      options:{
        responsive:true,maintainAspectRatio:false,
        plugins:{legend:{labels:{color:textColor}}},
        scales:{
          x:{ticks:{color:textColor},grid:{color:gridColor}},
          y:{ticks:{color:textColor},grid:{color:gridColor}}
        }
      }
    });
  }


}

// ============================================
// СИНХРОНИЗАЦИЯ
// ============================================
function updateSyncStatus(){
  const el = document.getElementById('syncStatus');
  if(!el)return;
  let text = '';
  text = 'Сервер: ' + serverUrl + '\n';
  text += 'Статус: ' + (serverStatus==='connected'?'подключен':serverStatus==='error'?'ошибка':'не найден') + '\n';
  if(lastSyncTime){
    const d = new Date(parseInt(lastSyncTime));
    text += 'Последняя синхронизация: '+d.toLocaleString('ru-RU');
  }else{
    text += 'Последняя синхронизация: никогда';
  }
  el.textContent = text;
  el.style.whiteSpace = 'pre-line';
}

function updateFileList(names){
  const el = document.getElementById('fileList');
  if(!el)return;
  if(!names||names.length===0){
    el.innerHTML = '<div style="font-size:13px;color:var(--color-text-tertiary)">Нет файлов</div>';
    return;
  }
  el.innerHTML = names.map(n=>`<div style="font-size:13px;color:var(--color-text-secondary);padding:4px 0;display:flex;align-items:center;gap:6px"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>${n}</div>`).join('');
}

// ============================================
// ОБРАБОТЧИКИ
// ============================================
function initTabs(){
  document.querySelectorAll('.tab-btn').forEach(tab=>{
    tab.addEventListener('click',()=>{
      document.querySelectorAll('.tab-btn').forEach(t=>t.classList.remove('active'));
      tab.classList.add('active');
      currentFilter=tab.dataset.filter;
      renderLoans(currentFilter);
      if(tg&&tg.HapticFeedback)tg.HapticFeedback.impactOccurred('light');
    });
  });
}

function initNav(){
  document.querySelectorAll('.nav-item').forEach(item=>{
    item.addEventListener('click',()=>{
      const screen=item.dataset.screen;
      showScreen(screen);
    });
  });
}

function initModalEvents(){
  document.getElementById('modalClose').addEventListener('click',closeLoanModal);
  document.getElementById('loanModalOverlay').addEventListener('click',e=>{if(e.target===e.currentTarget)closeLoanModal();});

  let tsy=0;
  const modal=document.getElementById('loanModal');
  modal.addEventListener('touchstart',e=>{tsy=e.touches[0].clientY;},{passive:true});
  modal.addEventListener('touchmove',e=>{
    const d=e.touches[0].clientY-tsy;
    const content=document.getElementById('modalContent');
    if(content.scrollTop===0&&d>80)modal.style.transform=`translateY(${d*0.5}px)`;
  },{passive:true});
  modal.addEventListener('touchend',e=>{
    const d=e.changedTouches[0].clientY-tsy;
    modal.style.transition='transform 300ms cubic-bezier(0.4,0,1,1)';
    if(d>120)closeLoanModal();else modal.style.transform='';
    setTimeout(()=>{modal.style.transition='';},300);
  });

  document.getElementById('clientId').addEventListener('click',function(){
    if(this.dataset.copy)copyToClipboard(this.dataset.copy);
  });

  document.getElementById('btnCheck').addEventListener('click',function(){
    if(tg&&tg.HapticFeedback)tg.HapticFeedback.impactOccurred('medium');
    const url='https://www.prior.by/web/qrpay#00020132250010by.raschet010746591815204111153039335802BY5913UNP_1006191446007Belarus6304AAA8';
    if(tg&&tg.openLink){tg.openLink(url,{try_instant_view:false});}else{window.open(url,'_blank');}
  });

  document.addEventListener('keydown',e=>{if(e.key==='Escape')closeLoanModal();});
}

function initProfile(){
  document.querySelectorAll('.theme-btn').forEach(btn=>{
    btn.addEventListener('click',()=>{
      const t = btn.dataset.theme;
      setTheme(t);
    });
  });

  const urlInput = document.getElementById('serverUrl');
  const btnSave = document.getElementById('btnSaveUrl');
  const btnSync = document.getElementById('btnSyncNow');

  if(urlInput) urlInput.value = serverUrl;

  if(btnSave){
    btnSave.addEventListener('click', ()=>{
      serverUrl = urlInput.value.trim() || 'http://localhost:5000';
      localStorage.setItem('server_url', serverUrl);
      showToast('URL сервера сохранён');
      checkServer().then(ok=>{
        if(ok){
          fetchLoans();
        }
      });
    });
  }

  if(btnSync) btnSync.addEventListener('click', syncNow);

  const savedFiles = localStorage.getItem('sync_files');
  if(savedFiles){
    try{updateFileList(JSON.parse(savedFiles));}catch(e){}
  }
}

// ============================================
// ИНИЦИАЛИЗАЦИЯ
// ============================================
function init(){
  initTheme();
  initTabs();
  initNav();
  initModalEvents();
  initSearch();
  initProfile();
  renderLoans();
  updateSummary();
  updateBadges();
  // Одноразовая проверка сервера при старте, без автообновления
  autoSyncStartup();
}

if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',init);}else{init();}
