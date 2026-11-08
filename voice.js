// ═══════════════════════════════════════════════
//  語音記帳：把一句話拆成一筆或多筆帳（規則判斷，不用 AI）
//  判斷順序：日期 → 拆筆 → 金額 → 收入/支出 → 帳本 → 分類 → 戶頭 → 案場 → 備註
//  分類會先參考「以前怎麼記」，找不到才用內建關鍵字
// ═══════════════════════════════════════════════
(function(global){
const CN_DIGIT={'零':0,'〇':0,'一':1,'壹':1,'二':2,'兩':2,'两':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9};
const CN_UNIT={'十':10,'拾':10,'百':100,'佰':100,'千':1000,'仟':1000};

// 國字數字 → 數字（一千二=1200、三百五=350、一百零五=105、兩萬三=23000、1千2=1200）
function cnSection(s){
  let total=0,cur=null,lastUnit=0,afterZero=false,num='';
  const flush=()=>{if(num!==''){cur=parseFloat(num);num='';}};
  for(const ch of s){
    if(/[\d.]/.test(ch)){num+=ch;continue;}
    flush();
    if(ch in CN_DIGIT){if(CN_DIGIT[ch]===0){afterZero=true;cur=null;}else cur=CN_DIGIT[ch];}
    else if(ch in CN_UNIT){total+=(cur===null?1:cur)*CN_UNIT[ch];lastUnit=CN_UNIT[ch];cur=null;afterZero=false;}
  }
  flush();
  if(cur!==null){
    if(lastUnit>=100&&!afterZero&&cur<10&&!/\d{2,}$/.test(s))total+=cur*lastUnit/10; // 一千二、三百五
    else total+=cur;
  }
  return total;
}
function cn2num(s){
  if(/^[\d.]+$/.test(s))return parseFloat(s);
  const i=s.indexOf('萬');
  if(i<0)return cnSection(s);
  const hi=s.slice(0,i),lo=s.slice(i+1);
  let low=lo?cnSection(lo):0;
  if(lo&&/^[一二兩三四五六七八九\d]$/.test(lo))low*=1000; // 兩萬三
  return (hi?cnSection(hi):1)*10000+low;
}
// 句子裡的國字數字換成阿拉伯數字（只換「看起來是數字」的，避免「一起」「百香果」被換掉）
function normalizeNumbers(t){
  return t.replace(/[零〇一二兩两三四五六七八九十百千萬\d.]+/g,(m,off,all)=>{
    if(/^[\d.]+$/.test(m))return m;
    const hasDigit=/[零〇一二兩两三四五六七八九\d]/.test(m)||/^十/.test(m);
    if(!hasDigit)return m;
    const hasUnit=/[十百千萬]/.test(m);
    const next=all.slice(off+m.length,off+m.length+2);
    const prev=all.slice(Math.max(0,off-2),off);
    if(m.length===1&&!hasUnit&&!/^[元塊圓]|^[月號日]/.test(next))return m; // 單一個「一」「兩」不換
    if(/^(禮拜|星期)$/.test(prev)||/[週周]$/.test(prev))return m;     // 禮拜五
    if(/^[個人起下些點半樣直]/.test(next)&&m.length===1)return m;
    const v=cn2num(m);
    return isFinite(v)&&v>0?String(v):m;
  });
}

// ── 日期 ──
const WD={'一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'日':0,'天':0,'1':1,'2':2,'3':3,'4':4,'5':5,'6':6,'7':0};
function fmt(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function addDays(d,n){const x=new Date(d);x.setDate(x.getDate()+n);return x;}
function findDate(s,today){
  let m,d=null,txt=null;
  if((m=s.match(/大前天/))){d=addDays(today,-3);txt=m[0];}
  else if((m=s.match(/前天/))){d=addDays(today,-2);txt=m[0];}
  else if((m=s.match(/昨天|昨日|昨晚/))){d=addDays(today,-1);txt=m[0];}
  else if((m=s.match(/今天|今日|今晚|剛剛|剛才/))){d=new Date(today);txt=m[0];}
  else if((m=s.match(/(上上|上)(個)?(禮拜|星期|週|周)([一二三四五六日天1-7])/))){
    const back=m[1]==='上上'?14:7;
    const cur=addDays(today,-((today.getDay()+6)%7)); // 這週一
    const wd=WD[m[4]];d=addDays(cur,(wd===0?6:wd-1)-back);txt=m[0];
  }
  else if((m=s.match(/(這)?(禮拜|星期|週|周)([一二三四五六日天1-7])/))){
    const cur=addDays(today,-((today.getDay()+6)%7));
    const wd=WD[m[3]];d=addDays(cur,wd===0?6:wd-1);
    if(d>today)d=addDays(d,-7);
    txt=m[0];
  }
  else if((m=s.match(/(\d{1,2})月(\d{1,2})[號日]?/))){
    d=new Date(today.getFullYear(),+m[1]-1,+m[2]);if(d>today)d.setFullYear(d.getFullYear()-1);txt=m[0];
  }
  else if((m=s.match(/(\d{1,2})\/(\d{1,2})/))){
    d=new Date(today.getFullYear(),+m[1]-1,+m[2]);if(d>today)d.setFullYear(d.getFullYear()-1);txt=m[0];
  }
  else if((m=s.match(/(\d{1,2})[號日](?!本)/))){
    d=new Date(today.getFullYear(),today.getMonth(),+m[1]);if(d>today)d.setMonth(d.getMonth()-1);txt=m[0];
  }
  return d?{date:fmt(d),text:txt}:null;
}

// ── 關鍵字 ──
const QTY_UNIT='個顆份杯瓶張人次包罐箱卷捲條支隻組台件盒片位碗盤斤克尺米吋瓦匹號日月點折%x×度歲樓趟';
const INCOME_RE=/收到|收入|收款|收了|進帳|入帳|賺了?|薪水|薪資|領薪|退款|退費|退錢|獎金|中獎|工錢|賣了?|收(?=\s*\d)|^收(?!納|據|音|藏|銀)/;
const LEDGER_KW=[
  ['烤布蕾',/烤布蕾|布蕾/],
  ['鵝代收',/代收|幫鵝|鵝的/],
  ['投資',/股票|ETF|基金|投資/i],
  ['生意',/生意|公司|進貨|工人|助手|小工|水泥|砂|磁磚|矽利康|膠帶|螺絲|釘|油漆|木板|夾板|石膏板|角材|鐵管|PVC|接頭|彎頭|電箱|網路線|插頭|延長線|束帶|保溫|銅管|白鐵|案場|工地|客人|業主|師傅|工資|電線|線材|花線|[Cc][Dd]管|管件|管材|開關|插座|吸頂燈|軌道燈|燈具|燈泡|小便斗|馬桶|水管|面盆|洗臉盆|洗手槽|冷媒|冷氣|熱水器|抽油煙機|馬達|鑽頭|電鑽|工具|點焊|配電|斷路器|無熔絲|電錶|五金|壓條|牙條|材料行|水電|裝修|查修|維修|修理/],
  ['家用',/家用|家裡|全家人|爸|媽|小黑|房租|房貸|水費|電費|瓦斯|網路費|電話費|保險|家具|收納|衛生紙|洗衣|洗碗|垃圾袋|除螞蟻|燃料稅|牌照稅/],
];
// 分類名稱 → 關鍵字（對應到該帳本裡同名的分類）
const CAT_KW=[
  ['銷售收入',/裝冷氣|修理|更換|查修|維修|安裝|工錢|施工|裝|修/,'income'],
  ['薪資',/薪水|薪資|領薪/,'income'],
  ['投資收入',/股息|配息|利息|投資收入/,'income'],
  ['其他收入',/./,'income'],
  ['軟體訂閱',/訂閱|claude|chatgpt|openai|netflix|spotify|youtube|midjourney|tradingview|icloud|google/i],
  ['繳卡費',/卡費/],
  ['進貨',/進貨|材料|水泥|砂|磁磚|矽利康|膠帶|螺絲|釘|油漆|木板|夾板|石膏板|角材|鐵管|PVC|接頭|彎頭|電箱|網路線|插頭|延長線|束帶|保溫|銅管|白鐵|電線|線材|花線|[Cc][Dd]管|管件|管材|開關|插座|燈|小便斗|馬桶|水管|面盆|洗臉盆|洗手槽|冷媒|熱水器|馬達|鑽頭|工具|五金|壓條|牙條|配電|斷路器/],
  ['運費',/運費|加油|油錢|^油$|過路費|停車/],
  ['薪資',/工資|師傅|工人|助手/],
  ['租金',/租金|房租/],
  ['廣告行銷',/廣告|行銷|名片|招牌/],
  ['日常用品',/(全聯|好市多|家樂福|大潤發|超市|大賣場).*(買東西|日用品|用品)|寶雅|家樂福|大潤發|大賣場|日用品/],
  ['餐飲',/早餐|午餐|晚餐|宵夜|消夜|早午餐|便當|飯|麵|粥|雞排|鹹酥雞|滷味|火鍋|燒烤|燒肉|拉麵|壽司|小吃|夜市|點心|零食|餅乾|蛋糕|麵包|飲料|咖啡|奶茶|紅茶|綠茶|茶|果汁|汽水|可樂|氣泡水|礦泉水|水$|冰|豆花|仙草|湯|水果|菜|肉|雞|魚|蛋|牛奶|鮮奶|食材|吃|喝|麥當勞|肯德基|摩斯|漢堡|披薩|超商|7-11|小7|全家|萊爾富|全聯|好市多|請.*吃/],
  ['交通',/加油|油錢|^油$|停車|過路費|ETC|高鐵|台鐵|火車|捷運|公車|客運|計程車|小黃|uber|修車|輪胎|機油|保養車|車子|汽車|機車|燃料稅|牌照稅|洗車/i],
  ['水電/瓦斯',/水費|電費|瓦斯/],
  ['通訊',/電話費|手機費|網路費|電信|中華電信|台哥大|遠傳/],
  ['保險',/保險|保費/],
  ['房租/房貸',/房租|房貸/],
  ['醫療',/看醫生|掛號|診所|醫院|藥|牙醫|健保|看病/],
  ['教育',/學費|補習|課本|書|上課|課程/],
  ['家具',/家具|椅子|桌子|櫃子|床|沙發/],
  ['日常用品',/衛生紙|洗衣|洗碗|牙膏|牙刷|洗髮|沐浴|垃圾袋|清潔|收納|電池|日用品|除螞蟻|殺蟲/],
  ['美容/保養',/剪頭髮|剪髮|洗頭|按摩|推拿|美甲|保養品|化妝|健身|spa|面膜/i],
  ['娛樂',/電影|ktv|唱歌|遊戲|旅遊|出遊|門票|釣具|釣魚|玩/i],
  ['娛樂/購物',/電影|ktv|唱歌|遊戲|旅遊|出遊|門票|衣服|鞋|褲|包包|蝦皮|網購|玩/i],
  ['購物',/衣服|鞋|褲|裙|包包|蝦皮|網購|手機|耳機|3c|電腦|買東西/i],
  ['耗材',/耗材|電池|大頭照|影印/],
  ['雜費',/雜費|雜支/],
];
const ACC_KW=[
  [/富邦/,'富邦'],
  [/台新/,'台新'],
  [/公司戶|土銀|土地銀行/,'土地銀行'],
  [/刷卡|信用卡|中信卡|中信|line ?pay|賴 ?pay|街口|行動支付|手機付/i,'中信卡'],
  [/轉帳|匯款/,'中國信託'],
  [/現金|付現/,'現金'],
];
const ACC_STRIP=/(用|是)?(刷卡|信用卡|中信卡|中信|富邦卡|富邦|台新|line ?pay|賴 ?pay|街口|行動支付|手機付|現金|付現|轉帳|匯款|公司戶|土銀)(付的?|刷的?|付款|支付)?/gi;
const FILLER=/^買|我|幫我|記一下|記帳|一下|花了|花|買了|付了|用了|總共|一共|合計|大概|大約|左右|元|塊錢|塊|圓|錢|的|了|這筆|消費|支出|生意帳?|公司的?|家用帳?|個人帳?|帳$/g;

function cleanNote(n){return String(n||'').replace(/^(\[[^\]]*\]\s*)+/,'').trim();}

// 以前的紀錄：備註裡的詞 → 帳本/分類（越常用分數越高）
function buildHistory(db){
  const idx=[];
  for(const t of db.transactions||[]){
    if(t.type!=='expense'&&t.type!=='income')continue;
    const n=cleanNote(t.note);
    if(!n)continue;
    const words=new Set([n.replace(/\s+/g,''),...n.split(/[\s,，、（()）×x\d]+/)].filter(w=>w.length>=2&&w.length<=12));
    for(const w of words)idx.push({w,ledger:t.ledger,category:t.category,type:t.type});
  }
  return idx;
}
function historyVote(item,idx,ledger,type){
  const votes={};
  for(const h of idx){
    if(type&&h.type!==type)continue;
    if(ledger&&h.ledger!==ledger)continue;
    if(item.includes(h.w)||(item.length>=2&&h.w.includes(item))){
      const k=h.ledger+'|'+h.category;
      votes[k]=(votes[k]||0)+Math.min(h.w.length,item.length);
    }
  }
  let best=null,bs=0;
  for(const k in votes)if(votes[k]>bs){bs=votes[k];best=k;}
  if(!best)return null;
  const [l,c]=best.split('|');return{ledger:l,category:c,score:bs};
}

// 案場：講到名稱裡連續 3 個字（名稱短的 2 個字）就算
function findProject(seg,db){
  const s=seg.toLowerCase().replace(/\s+/g,'');
  let best=null,bl=0;
  for(const p of db.projects||[]){
    const n=p.name.toLowerCase().replace(/\s+/g,'');
    const min=Math.min(3,n.length);
    for(let len=n.length;len>=min&&len>bl;len--){
      let hit=false;
      for(let i=0;i+len<=n.length;i++)if(s.includes(n.slice(i,i+len))){hit=true;break;}
      if(hit){best=p.id;bl=len;break;}
    }
  }
  return best||'';
}

function findAmounts(seg){
  // 回傳 [{value,start,end,currency}]
  const out=[];const re=/(\d+(?:\.\d+)?)\s*(塊半|塊錢|元|塊|圓)?/g;let m;
  while((m=re.exec(seg))){
    const after=seg.slice(m.index+m[0].length).trimStart().charAt(0);
    const before=seg.slice(Math.max(0,m.index-1),m.index);
    if(!m[2]&&after&&QTY_UNIT.includes(after))continue;
    if(/[第×xX#\-]/.test(before))continue;
    if(!m[2]&&/^\d{5,}$/.test(m[1])&&/[^\d\s]/.test(seg.charAt(m.index+m[0].length)||''))continue; // 18560電池 這種型號
    let v=parseFloat(m[1]);if(m[2]==='塊半')v+=0.5;
    out.push({value:v,start:m.index,end:m.index+m[0].length,currency:!!m[2]});
  }
  return out;
}

function parseVoice(text,ctx){
  const db=ctx.db,today=ctx.today||new Date();
  const hist=ctx.history||buildHistory(db);
  let t=String(text||'').replace(/[Ａ-Ｚａ-ｚ０-９]/g,c=>String.fromCharCode(c.charCodeAt(0)-0xFEE0)).replace(/　/g,' ');
  t=t.replace(/七十一|seven ?eleven|7 ?eleven|小七/gi,'7-11');
  t=normalizeNumbers(t);
  // 一、先用標點和連接詞切
  const chunks=t.split(/[，,、；;。！!？?\n]+|還有|然後|另外|以及|再來/).map(s=>s.trim()).filter(Boolean);
  // 二、一段裡有好幾個金額 → 再拆（「早餐50午餐120」）
  const segs=[];
  for(const ch of chunks){
    if(/總共|一共|合計|全部/.test(ch)){segs.push(ch);continue;}
    const am=findAmounts(ch);
    if(am.length<=1){segs.push(ch);continue;}
    let start=0;
    am.forEach((a,i)=>{
      const prefix=ch.slice(start,a.start).replace(FILLER,'').replace(ACC_STRIP,'').trim();
      if(!prefix&&i<am.length-1)return; // 前面沒有東西的數字不當作一筆的結尾
      segs.push(ch.slice(start,a.end));start=a.end;
    });
    const rest=ch.slice(start).trim();
    if(rest&&segs.length)segs[segs.length-1]+=rest; else if(rest)segs.push(rest);
  }
  // 三、每一段各自判斷
  let carryDate=fmt(today),carryLedger=null;
  const utterProject=findProject(t,db); // 講到案場 → 這句話的生意帳都算這個案場
  const items=[];
  for(let seg of segs){
    const raw=seg;
    const dt=findDate(seg,today);
    if(dt){carryDate=dt.date;seg=seg.replace(dt.text,' ');}
    let am=findAmounts(seg);
    let amount=null;
    if(/總共|一共|合計|全部/.test(seg)){
      const k=seg.search(/總共|一共|合計|全部/);
      const after=am.filter(a=>a.start>k);amount=(after[0]||am[am.length-1]||{}).value??null;
      seg=am.reduce((s,a)=>s.replace(seg.slice(a.start,a.end),' '),seg);
    }else if(am.length){
      const pick=am.find(a=>a.currency)||am[am.length-1];
      amount=pick.value;seg=seg.slice(0,pick.start)+' '+seg.slice(pick.end);
    }
    // 平分
    let split=1,m;
    if((m=seg.match(/([\d一二兩三四五六七八九十]+)\s*個?人\s*(平分|分攤|分|均分|AA)/i))){split=cn2num(m[1])||1;seg=seg.replace(m[0],' ');}
    else if(/一半|平分|AA|分攤|對分/i.test(seg)){split=2;seg=seg.replace(/我?付?一半|平分|AA|分攤|對分/ig,' ');}
    if(amount!=null&&split>1)amount=Math.round(amount/split);
    // 收入/支出
    const payOut=/工人|師傅|助手|小工|付|發薪|給.{0,4}(薪|工錢)/.test(seg);
    const type=!payOut&&(INCOME_RE.test(raw)||INCOME_RE.test(seg))?'income':'expense';
    const kwText=seg; // 拿掉金額、日期後的原句，給關鍵字判斷用
    const cardBill=/卡費/.test(seg);
    // 戶頭
    let accName=null;
    if(cardBill)accName='中國信託'; // 繳卡費通常從銀行扣
    else for(const [re,name] of ACC_KW)if(re.test(seg)){accName=name;break;}
    // 案場
    let project=findProject(seg,db)||utterProject;
    // 備註（物品名稱）
    let note=(cardBill?seg:seg.replace(ACC_STRIP,' ')).replace(new RegExp(INCOME_RE.source,'g'),' ').replace(FILLER,' ').replace(/\s+/g,' ').trim();
    if(split>1)note=(note+' （'+split+'人分）').trim();
    let item=note.replace(/\s+/g,'');
    // 投票時拿掉案場名稱，免得「梅山口」把分類拉走
    if(project){const pn=((db.projects||[]).find(p=>p.id===project)||{}).name||'';const n=pn.replace(/\s+/g,'');
      for(let L=n.length;L>=2;L--)for(let i=0;i+L<=n.length;i++){const sub=n.slice(i,i+L);if(item.includes(sub))item=item.split(sub).join('');}}
    // 帳本：明講的 → 案場 → 以前的紀錄 → 內建關鍵字 → 目前選的帳本
    let ledger=null;
    if(/生意|公司/.test(seg))ledger='生意';
    else if(/烤布蕾|布蕾/.test(seg))ledger='烤布蕾';
    else if(/代收|幫鵝/.test(seg))ledger='鵝代收';
    else if(/家用|家裡/.test(seg))ledger='家用';
    else if(/個人/.test(seg))ledger='個人';
    if(ledger)carryLedger=ledger;
    else if(carryLedger)ledger=carryLedger; // 同一句前面講過帳本，後面沿用
    if(!ledger&&project)ledger='生意';
    let hv=null;
    if(!ledger&&item){hv=historyVote(item,hist,null,type);if(hv&&hv.score>=2)ledger=hv.ledger;}
    if(!ledger)for(const [l,re] of LEDGER_KW)if(re.test(seg)){ledger=l;if(['烤布蕾','鵝代收'].includes(l))carryLedger=l;break;}
    if(!ledger){
      // 關鍵字對到的分類只在別的帳本有（例如「醫療」只在家用）→ 換到那個帳本
      const def=ctx.defaultLedger||'個人';
      for(const [name,re,onlyType] of CAT_KW){
        if((onlyType||'expense')!==type||name==='其他收入'||!re.test(kwText))continue;
        const here=(db.categories||[]).find(c=>c.ledger===def&&c.name===name);
        const other=(db.categories||[]).find(c=>c.name===name&&['個人','家用','生意'].includes(c.ledger));
        ledger=here?def:(other?other.ledger:null);
        break;
      }
    }
    if(!ledger)ledger=ctx.defaultLedger||'個人';
    if(!(db.ledgers||[]).includes(ledger))ledger=ctx.defaultLedger||(db.ledgers||['個人'])[0];
    // 分類：以前的紀錄（同帳本）→ 內建關鍵字 → 預設
    const cats=(db.categories||[]).filter(c=>c.ledger===ledger);
    let category=null;
    if(item){const v=historyVote(item,hist,ledger,type);if(v&&cats.some(c=>c.id===v.category))category=v.category;}
    if(!category){
      for(const [name,re,onlyType] of CAT_KW){
        if((onlyType||'expense')!==type)continue;
        if(!re.test(kwText))continue;
        const c=cats.find(c=>c.name===name);
        if(c){category=c.id;break;}
      }
    }
    let guess=false;
    if(!category){
      guess=true;
      const prefer=type==='income'?['其他收入','銷售收入']:['雜費','餐飲','其他'];
      const c=prefer.map(n=>cats.find(c=>c.name===n)).find(Boolean)||cats[0];
      category=c?c.id:'';
    }
    // 戶頭 id
    const accs=db.accounts||[];
    let acc=accName?accs.find(a=>a.name.includes(accName)):null;
    if(!acc)acc=accs.find(a=>a.name==='現金')||accs[0];
    if(amount==null&&!item)continue;
    items.push({date:carryDate,ledger,type,category,account:acc?acc.id:'',amount,note,project:ledger==='生意'?project:'',raw,guess});
  }
  return items;
}

global.VoiceParse={parseVoice,buildHistory,cn2num,normalizeNumbers,findDate};
})(typeof window!=='undefined'?window:globalThis);

// ═══════════════════════════════════════════════
//  畫面：🎤 按鈕、聽寫、確認視窗
// ═══════════════════════════════════════════════
if(typeof window!=='undefined'&&typeof document!=='undefined'){
  let voiceItems=[],voiceRec=null;
  const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  function catName(id){const c=db.categories.find(c=>c.id===id);return c?c.name:'未分類';}
  function accName(id){const a=db.accounts.find(a=>a.id===id);return a?a.name:'';}
  function projName(id){const p=(db.projects||[]).find(p=>p.id===id);return p?p.name:'';}

  let voiceOverride={}; // 使用者手動選的分類：key = 第幾筆|原句
  function catOptions(it){
    return (db.ledgers||[]).map(l=>{
      const cs=db.categories.filter(c=>c.ledger===l);if(!cs.length)return '';
      return `<optgroup label="${esc(l)}帳">`+cs.map(c=>`<option value="${esc(l+'|'+c.id)}" ${l===it.ledger&&c.id===it.category?'selected':''}>${esc(l)}／${esc(c.name)}</option>`).join('')+'</optgroup>';
    }).join('');
  }
  window.voiceSetCat=function(i,v){
    const it=voiceItems[i];if(!it)return;
    const k=v.indexOf('|');it.ledger=v.slice(0,k);it.category=v.slice(k+1);it.guess=false;
    if(it.ledger!=='生意')it.project='';
    voiceOverride[i+'|'+it.raw]={ledger:it.ledger,category:it.category};
    voiceReparse(true);
  };
  window.voiceReparse=function(keep){
    const text=document.getElementById('voiceText').value;
    voiceItems=VoiceParse.parseVoice(text,{db,defaultLedger:currentLedger});
    voiceItems.forEach((it,i)=>{const o=voiceOverride[i+'|'+it.raw];if(o){it.ledger=o.ledger;it.category=o.category;it.guess=false;if(o.ledger!=='生意')it.project='';}});
    const box=document.getElementById('voiceItems');
    if(!voiceItems.length){box.innerHTML='<div class="hint" style="padding:8px 0;">還沒聽到可以記的內容。可以說「雞排 80」，或直接在上面打字修改。</div>';}
    else box.innerHTML=voiceItems.map((it,i)=>{
      const bad=it.amount==null;
      const sign=it.type==='income'?'+':'-';
      return `<label class="setting-item" style="align-items:flex-start;gap:8px;cursor:pointer;">
        <input type="checkbox" id="vchk${i}" ${bad?'disabled':'checked'} style="margin-top:4px;width:18px;height:18px;">
        <div style="flex:1;min-width:0;">
          <div style="font-weight:600;">${esc(it.note||'（沒有品名）')}</div>
          <div class="hint">${esc(it.date)}・${esc(accName(it.account))}${it.project?'・'+esc(projName(it.project)):''}</div>
          <select onclick="event.preventDefault();event.stopPropagation()" onchange="voiceSetCat(${i},this.value)" style="margin-top:4px;width:100%;padding:4px;font-size:.85rem;${it.guess?'border:2px solid #f59e0b;':''}">${catOptions(it)}</select>
          ${it.guess?'<div class="hint" style="color:#b45309;">⚠ 分類沒把握，請點上面選一下</div>':''}
        </div>
        <div class="tx-amount ${it.type==='income'?'income':'expense'}" style="font-size:1rem;white-space:nowrap;">${bad?'<span style="color:var(--danger)">沒聽到金額</span>':sign+fmtMoney(it.amount)}</div>
      </label>`;
    }).join('');
    document.getElementById('voiceFillBtn').style.display=voiceItems.length===1?'':'none';
    document.getElementById('voiceSaveBtn').textContent=voiceItems.length>1?'全部儲存':'儲存';
  };

  // 一直聽，直到按「講完了」；中間停下來喘氣不會結束（瀏覽器自己停掉就自動再開）
  let voiceOn=false,voiceBase='',voiceIdle=null;
  function voiceUI(on){
    const b=document.getElementById('voiceMicBtn'),s=document.getElementById('voiceSaveBtn'),f=document.getElementById('voiceFillBtn');
    if(b){b.textContent=on?'⏹ 講完了':'🎤 繼續講';b.className='btn '+(on?'btn-danger':'btn-gray');}
    if(s)s.disabled=on;if(f&&on)f.style.display='none';
  }
  function voiceKick(){clearTimeout(voiceIdle);voiceIdle=setTimeout(()=>window.voiceStop(),60000);} // 一分鐘都沒聲音才自己停
  window.voiceStop=function(){
    voiceOn=false;clearTimeout(voiceIdle);
    try{if(voiceRec)voiceRec.stop();}catch(e){}
    const st=document.getElementById('voiceStatus');if(st)st.textContent='聽完了。不對的地方可以直接改上面的文字，再按「儲存」';
    voiceUI(false);voiceReparse();
  };
  window.voiceMic=function(){if(voiceOn)voiceStop();else voiceListen(false);};
  function voiceListen(fresh){
    const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
    const st=document.getElementById('voiceStatus');
    if(!SR){st.textContent='這個瀏覽器不支援語音，請直接在下面打字（也可以用鍵盤上的麥克風）';document.getElementById('voiceText').focus();return;}
    try{if(voiceRec){voiceRec.onend=null;voiceRec.abort();}}catch(e){}
    const ta=document.getElementById('voiceText');
    if(fresh)ta.value='';
    voiceOn=true;voiceUI(true);voiceKick();
    st.textContent='🎤 慢慢講，可以停下來想，講完按「⏹ 講完了」';
    const run=()=>{
      voiceBase=ta.value.trim();
      const r=new SR();voiceRec=r;
      r.lang='zh-TW';r.interimResults=true;r.continuous=true;
      r.onresult=e=>{
        voiceKick();
        let fin='',interim='';
        for(let i=0;i<e.results.length;i++){
          const t=e.results[i][0].transcript.trim();
          if(e.results[i].isFinal){
            // 有些手機每一段會把前面講過的再給一次，避免重複
            if(fin&&t.startsWith(fin))fin=t;else if(!fin.endsWith(t))fin=(fin?fin+' ':'')+t;
          }else interim+=t;
        }
        if(interim&&fin&&interim.startsWith(fin))interim=interim.slice(fin.length).trim();
        ta.value=[voiceBase,fin,interim].filter(Boolean).join(' ');
        voiceReparse();
      };
      r.onerror=e=>{
        if(e.error==='not-allowed'||e.error==='service-not-allowed'){voiceOn=false;voiceUI(false);st.textContent='沒有麥克風權限，請在瀏覽器設定允許，或直接打字';}
      };
      r.onend=()=>{if(voiceOn&&voiceRec===r)setTimeout(()=>{if(voiceOn)run();},150);else voiceReparse();};
      try{r.start();}catch(e){voiceOn=false;voiceUI(false);st.textContent='無法開始錄音，請直接打字';}
    };
    run();
  }
  window.voiceStart=function(){
    openModal('modalVoice');
    document.getElementById('voiceText').value='';
    voiceOverride={};
    voiceReparse();
    voiceListen(true);
  };

  window.voiceFillForm=function(){
    const it=voiceItems[0];if(!it)return;
    const lb=[...document.querySelectorAll('#ledgerSegControl button')].find(b=>b.textContent===it.ledger+'帳');
    if(lb)switchLedger(it.ledger,lb);
    switchType(it.type);
    document.getElementById('inAmount').value=it.amount??'';
    document.getElementById('inDate').value=it.date;
    document.getElementById('inCategory').value=it.category;
    document.getElementById('inAccount').value=it.account;
    document.getElementById('inNote').value=it.note;
    if(it.ledger==='生意'&&it.project)document.getElementById('inProject').value=it.project;
    closeModal('modalVoice');
    showToast('已填好，確認後按「儲存記錄」');
  };

  window.voiceSaveAll=function(){
    if(voiceOn)voiceStop();
    const recorder=document.getElementById('inRecorder').value;
    let n=0;
    voiceItems.forEach((it,i)=>{
      const cb=document.getElementById('vchk'+i);
      if(!cb||!cb.checked||it.amount==null||!(it.amount>0))return;
      db.transactions.push({id:uid(),date:it.date,ledger:it.ledger,type:it.type,category:it.category,
        account:it.account,amount:it.amount,note:it.note,recorder,project:it.project||''});
      n++;
    });
    if(!n){showToast('沒有可以儲存的項目','err');return;}
    db.transactions.sort((a,b)=>b.date.localeCompare(a.date));
    saveLocal();
    closeModal('modalVoice');
    showToast(`✓ 已記錄 ${n} 筆，同步中…`);
    autoSync();
  };
}
