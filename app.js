const DAYS=["月","火","水","木","金","土","日"];
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const RECIPES=window.RECIPES||[];

function settings(){
  return JSON.parse(localStorage.getItem('kondate.settings')||'null')||{
    people:'2',budget:'mid',meals:['朝食','昼食','夕食'],genres:['和食'],options:[],dislikes:'',fridge:''
  };
}
function terms(s){return (s||'').split(/[、,，\s]+/).map(x=>x.trim()).filter(Boolean)}
function hasBlockedIngredient(r,blocked){return blocked.some(b=>r.name.includes(b)||r.ingredients.some(i=>i.name.includes(b)))}
function candidates(type,used=new Set()){
  const s=settings(); const blocked=terms(s.dislikes); const selected=s.genres||[]; const opts=s.options||[];
  let list=RECIPES.filter(r=>r.meals.includes(type)&&!hasBlockedIngredient(r,blocked)&&!used.has(r.id));
  if(selected.length && !selected.includes('なんでも')){
    const x=list.filter(r=>selected.includes(r.genre)); if(x.length) list=x;
  }
  // Preferences are scoring factors, not hard filters, to avoid empty results.
  return list.map(r=>{
    let score=1;
    opts.forEach(o=>{if(r.tags.includes(o)) score+=3});
    if(s.budget==='low'&&r.tags.includes('節約')) score+=3;
    const fridge=terms(s.fridge); fridge.forEach(f=>{if(r.ingredients.some(i=>i.name.includes(f))) score+=2});
    return {r,score};
  });
}
function weightedPick(scored){
  if(!scored.length) return null;
  const total=scored.reduce((a,x)=>a+x.score,0); let n=Math.random()*total;
  for(const x of scored){n-=x.score;if(n<=0)return x.r} return scored[scored.length-1].r;
}
function pickMeal(type,used=new Set()){
  return weightedPick(candidates(type,used)) || weightedPick(RECIPES.filter(r=>r.meals.includes(type)).map(r=>({r,score:1})));
}
function activeMeals(){const m=settings().meals||[];return m.length?m:['朝食','昼食','夕食']}
function makeToday(){
  const used=new Set(); return activeMeals().map(type=>{const r=pickMeal(type,used);if(r)used.add(r.id);return r?{...r,type,favorite:false}:null}).filter(Boolean);
}
function makeWeek(){
  const used=new Set(); return DAYS.map(day=>({day,meals:activeMeals().map(type=>{const r=pickMeal(type,used);if(r)used.add(r.id);return r?{...r,type}:null}).filter(Boolean)}));
}
function roundQty(n){if(Number.isInteger(n))return String(n);return String(Math.round(n*10)/10)}
function buildShopping(week){
  const s=settings(), people=Number(s.people||2), fridge=terms(s.fridge);
  const map=new Map();
  week.forEach(d=>d.meals.forEach(r=>r.ingredients.forEach(i=>{
    if(fridge.some(f=>i.name.includes(f)||f.includes(i.name))) return;
    const key=`${i.group}|${i.name}|${i.unit}`;
    const prev=map.get(key)||{group:i.group,name:i.name,qty:0,unit:i.unit,done:false}; prev.qty+=Number(i.qty)*people; map.set(key,prev);
  })));
  const groups=['野菜・きのこ','肉・魚','卵・乳製品','その他'];
  return groups.map(g=>[g,[...map.values()].filter(x=>x.group===g).map(x=>({name:x.name,qty:`${roundQty(x.qty)}${x.unit}`,done:false}))]).filter(x=>x[1].length);
}
function normalizeStoredMeals(items){
  if(!Array.isArray(items))return null;
  // Phase 1 data had no recipe ids/ingredients, so regenerate once after update.
  const hasNew=items.some?.(x=>x&&x.id&&x.ingredients); return hasNew?items:null;
}
let storedToday=JSON.parse(localStorage.getItem('kondate.today')||'null');
let storedWeek=JSON.parse(localStorage.getItem('kondate.week')||'null');
let weekOk=Array.isArray(storedWeek)&&storedWeek.every(d=>Array.isArray(d.meals)&&d.meals.every(m=>m.id&&m.ingredients));
let state={today:normalizeStoredMeals(storedToday)||makeToday(),week:weekOk?storedWeek:makeWeek(),shopping:[]};
let storedShopping=JSON.parse(localStorage.getItem('kondate.shopping.v2')||'null');
state.shopping=storedShopping||buildShopping(state.week);
function persist(){
  localStorage.setItem('kondate.today',JSON.stringify(state.today));
  localStorage.setItem('kondate.week',JSON.stringify(state.week));
  localStorage.setItem('kondate.shopping.v2',JSON.stringify(state.shopping));
}
function toast(msg){const e=$('#toast');e.textContent=msg;e.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>e.classList.remove('show'),1600)}
function showView(id){$$('.view').forEach(v=>v.classList.toggle('active',v.id===id));$$('.nav-btn').forEach(b=>b.classList.toggle('active',b.dataset.target===id));window.scrollTo({top:0,behavior:'smooth'})}
function renderToday(){
  $('#todayMeals').innerHTML=state.today.map((m,i)=>`<article class="meal-card"><div class="meal-icon">${m.emoji}</div><div class="meal-meta"><small>${m.type} ・ ${m.genre} ・ 約${m.minutes}分</small><strong>${m.name}</strong></div><button class="fav-btn ${m.favorite?'on':''}" data-fav="${i}">${m.favorite?'♥':'♡'}</button></article>`).join('');
  $$('[data-fav]').forEach(b=>b.onclick=()=>{const i=+b.dataset.fav;state.today[i].favorite=!state.today[i].favorite;persist();renderToday()})
}
function renderWeek(){
  $('#weekList').innerHTML=state.week.map(d=>`<article class="day-card"><div class="day-head"><strong>${d.day}曜日</strong><span>›</span></div><div class="day-grid">${d.meals.map(m=>`<div class="mini"><small>${m.type} ・ ${m.genre}</small><span>${m.name}</span></div>`).join('')}</div></article>`).join('')
}
function renderShopping(){
  $('#shoppingList').innerHTML=state.shopping.map(([g,items],gi)=>`<section class="shop-group"><h3>${g}</h3>${items.map((it,ii)=>`<label class="shop-row ${it.done?'done':''}"><input type="checkbox" data-shop="${gi}:${ii}" ${it.done?'checked':''}><span>${it.name}</span><em>${it.qty}</em></label>`).join('')}</section>`).join('')||'<p>買い物項目がありません。</p>';
  $$('[data-shop]').forEach(c=>c.onchange=()=>{const [gi,ii]=c.dataset.shop.split(':').map(Number);state.shopping[gi][1][ii].done=c.checked;persist();renderShopping()})
}
function renderRecipes(){
  $('#recipeList').innerHTML=RECIPES.map(r=>`<article class="recipe-card"><div class="emoji">${r.emoji}</div><h3>${r.name}</h3><p>${r.genre} ・ ${r.meals.join('/')} ・ 約${r.minutes}分</p><p>${r.tags.join(' / ')}</p></article>`).join('')
}
function loadSettings(){const s=settings();$('#people').value=s.people||'2';$('#budget').value=s.budget||'mid';$('#dislikes').value=s.dislikes||'';$('#fridge').value=s.fridge||'';[["mealChecks",s.meals],["genreChecks",s.genres],["optionChecks",s.options]].forEach(([id,vals])=>{if(!vals)return;$$(`#${id} input`).forEach(c=>c.checked=vals.includes(c.value))})}
function checked(id){return $$(`#${id} input:checked`).map(c=>c.value)}
function regenerateAll(){state.today=makeToday();state.week=makeWeek();state.shopping=buildShopping(state.week);persist();renderToday();renderWeek();renderShopping()}
$$('.nav-btn,.shortcut').forEach(b=>b.addEventListener('click',()=>showView(b.dataset.target)));
$('#openSettings').onclick=()=>showView('settingsView');
$('#regenToday').onclick=()=>{state.today=makeToday();persist();renderToday();toast('条件に合わせて今日の献立を変更しました')};
$('#regenWeek').onclick=()=>{state.week=makeWeek();state.shopping=buildShopping(state.week);persist();renderWeek();renderShopping();toast('1週間の献立と買い物リストを再作成しました')};
$('#resetShopping').onclick=()=>{state.shopping.forEach(g=>g[1].forEach(i=>i.done=false));persist();renderShopping();toast('未購入に戻しました')};
$('#saveSettings').onclick=()=>{
  const s={people:$('#people').value,budget:$('#budget').value,meals:checked('mealChecks'),genres:checked('genreChecks'),options:checked('optionChecks'),dislikes:$('#dislikes').value,fridge:$('#fridge').value};
  localStorage.setItem('kondate.settings',JSON.stringify(s));regenerateAll();toast('条件を保存し、献立を作り直しました');showView('homeView')
};
const d=new Date();$('#todayLabel').textContent=`${d.getMonth()+1}月${d.getDate()}日 ・ ローカル献立DB ${RECIPES.length}品`;
renderToday();renderWeek();renderShopping();renderRecipes();loadSettings();persist();
if('serviceWorker' in navigator){window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(console.error))}
