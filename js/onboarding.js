// ===== ONBOARDING BOT =====

const BOT_FLOW = [
  { id:'welcome',     msg:['שלום! ברוך הבא ל-NitPark 🚗','אני ParkBot — אעזור לך להתחיל תוך דקה.','מה שמך?'], type:'input', placeholder:'הכנס שם...', next:'role' },
  { id:'role',        msg:['נעים מאוד {name}! 😊','האם יש לך חניה פנויה שאתה רוצה לפרסם?'],
    options:[{ text:'🏠 כן, יש לי חניה!', next:'host_type' },{ text:'🔍 לא, מחפש חניה', next:'search_area' }] },
  { id:'host_type',   msg:['מעולה! 🎉','איזה סוג חניה יש לך?'],
    options:[{ text:'🏢 פרטית בבניין', next:'host_city' },{ text:'🔽 תת-קרקעית', next:'host_city' },{ text:'☀️ חיצונית / חצר', next:'host_city' }] },
  { id:'host_city',   msg:['באיזה עיר נמצאת החניה?'],
    options:[{ text:'📍 תל אביב', next:'host_price' },{ text:'📍 רמת גן', next:'host_price' },{ text:'📍 הרצליה', next:'host_price' },{ text:'📍 עיר אחרת', next:'host_price' }] },
  { id:'host_price',  msg:['כמה אתה רוצה לקבל לשעה?'],
    options:[{ text:'₪8–12 לשעה', next:'host_done' },{ text:'₪12–20 לשעה', next:'host_done' },{ text:'₪20+ לשעה', next:'host_done' }] },
  { id:'host_done',   msg:['נהדר! {name}, כל מה שצריך נשמר. 🚀','עכשיו בוא נפרסם את החניה שלך — ייקח רק 3 דקות!'],
    options:[{ text:'🚀 פרסם עכשיו!', action:'host' },{ text:'👀 קודם תראה לי את האפליקציה', action:'home' }] },
  { id:'search_area', msg:['מגניב! 🔍','באיזה אזור אתה בדרך כלל מחפש חניה?'],
    options:[{ text:'📍 תל אביב', next:'search_freq' },{ text:'📍 רמת גן', next:'search_freq' },{ text:'📍 הרצליה', next:'search_freq' },{ text:'📍 אזור אחר', next:'search_freq' }] },
  { id:'search_freq', msg:['כמה פעמים בשבוע אתה צריך חניה?'],
    options:[{ text:'📅 כל יום', next:'search_pref' },{ text:'📅 2–3 פעמים', next:'search_pref' },{ text:'🎲 לפעמים', next:'search_pref' }] },
  { id:'search_pref', msg:['מה הכי חשוב לך בחניה?'],
    options:[{ text:'💰 מחיר זול', next:'search_done' },{ text:'📍 קרוב ליעד', next:'search_done' },{ text:'🛡️ מאובטח ומקורה', next:'search_done' },{ text:'⚡ עמדת טעינה EV', next:'search_done' }] },
  { id:'search_done', msg:['מצוין {name}! 🎉','מצאתי עשרות חניות שמתאימות לך באזורך. בוא נחפש!'],
    options:[{ text:'🔍 חפש חניה עכשיו!', action:'search' },{ text:'🏠 קח אותי לדף הבית', action:'home' }] },
];

let obHistory = [];
let obUserName = '';

function startOnboarding() {
  const ob = document.getElementById('onboarding-screen');
  ob.style.display = 'flex';
  document.getElementById('ob-chat').innerHTML    = '';
  document.getElementById('ob-options').innerHTML = '';
  obHistory  = [];
  obUserName = '';
  setTimeout(() => runStep('welcome'), 400);
}

function runStep(stepId) {
  const step = BOT_FLOW.find(s => s.id === stepId);
  if (!step) return;
  const msgs = step.msg.map(m => m.replace('{name}', obUserName || 'חבר'));
  showBotMessages(msgs, () => {
    if (step.type === 'input') showBotInput(step.placeholder, step.next);
    else if (step.options)     showBotOptions(step.options);
  });
}

function showBotMessages(msgs, cb) {
  const chat = document.getElementById('ob-chat');
  let i = 0;
  function next() {
    if (i >= msgs.length) { if (cb) cb(); return; }
    const typing = document.createElement('div');
    typing.className = 'ob-bubble bot typing';
    typing.innerHTML = '<span></span><span></span><span></span>';
    chat.appendChild(typing);
    chat.scrollTop = chat.scrollHeight;
    setTimeout(() => {
      chat.removeChild(typing);
      const bubble = document.createElement('div');
      bubble.className  = 'ob-bubble bot';
      bubble.textContent = msgs[i];
      chat.appendChild(bubble);
      chat.scrollTop = chat.scrollHeight;
      i++;
      setTimeout(next, 600);
    }, 900 + msgs[i].length * 18);
  }
  next();
}

function showBotOptions(options) {
  const el = document.getElementById('ob-options');
  el.innerHTML = '';
  options.forEach(opt => {
    const btn = document.createElement('button');
    btn.className  = 'ob-option-btn';
    btn.textContent = opt.text;
    btn.onclick = () => {
      addUserBubble(opt.text);
      el.innerHTML = '';
      if (opt.action)      setTimeout(() => finishOnboarding(opt.action), 600);
      else if (opt.next)   setTimeout(() => runStep(opt.next), 500);
    };
    el.appendChild(btn);
  });
}

function showBotInput(placeholder, next) {
  const el = document.getElementById('ob-options');
  el.innerHTML = `
    <div class="ob-input-row">
      <input type="text" class="ob-text-input" placeholder="${placeholder}" id="ob-input-field" autocomplete="given-name" />
      <button class="ob-send-btn" onclick="submitBotInput('${next}')">שלח →</button>
    </div>`;
  const field = document.getElementById('ob-input-field');
  field.focus();
  field.addEventListener('keydown', e => { if (e.key === 'Enter') submitBotInput(next); });
}

function submitBotInput(next) {
  const val = document.getElementById('ob-input-field')?.value?.trim();
  if (!val) return;
  obUserName = val;
  userName   = val;
  sessionStorage.setItem('nitpark_name', val);
  addUserBubble(val);
  document.getElementById('ob-options').innerHTML = '';
  setTimeout(() => runStep(next), 500);
}

function addUserBubble(text) {
  const chat = document.getElementById('ob-chat');
  const b = document.createElement('div');
  b.className  = 'ob-bubble user';
  b.textContent = text;
  chat.appendChild(b);
  chat.scrollTop = chat.scrollHeight;
}

function finishOnboarding(destination) {
  const ob = document.getElementById('onboarding-screen');
  ob.style.opacity    = '0';
  ob.style.transition = 'opacity .4s';
  setTimeout(() => {
    ob.style.display  = 'none';
    ob.style.opacity  = '';
    if (obUserName) { userName = obUserName; sessionStorage.setItem('nitpark_name', userName); }
    updateNavbar();
    showPage(destination);
    showToast(`ברוך הבא ${userName || ''}! 🎉`, 'success');
  }, 400);
}
