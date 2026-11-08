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
  ['生意',/生意|公司|進貨|工人|助手|小工|水泥|砂石|磁磚|矽利康|膠帶|螺絲|釘|油漆|木板|夾板|石膏板|角材|鐵管|PVC|接頭|彎頭|電箱|網路線|插頭|延長線|束帶|保溫|銅管|白鐵|案場|工地|客人|業主|師傅|工資|電線|線材|花線|[Cc][Dd]管|管件|管材|開關|插座|吸頂燈|軌道燈|燈具|燈泡|小便斗|馬桶|水管|面盆|洗臉盆|洗手槽|冷媒|冷氣|熱水器|抽油煙機|馬達|鑽頭|電鑽|工具|點焊|配電|斷路器|無熔絲|電錶|五金|壓條|牙條|材料行|水電|裝修|查修|維修|修理/],
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
  ['進貨',/進貨|材料|水泥|砂石|磁磚|矽利康|膠帶|螺絲|釘|油漆|木板|夾板|石膏板|角材|鐵管|PVC|接頭|彎頭|電箱|網路線|插頭|延長線|束帶|保溫|銅管|白鐵|電線|線材|花線|[Cc][Dd]管|管件|管材|開關|插座|燈|小便斗|馬桶|水管|面盆|洗臉盆|洗手槽|冷媒|熱水器|馬達|五金|壓條|牙條|配電|斷路器/],
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
const FILLER=/^買|\s買(?=\S)|我|幫我|記一下|記帳|一下|花了|買了|付了|用了|總共|一共|共(?=\s*$)|合計|大概|大約|左右|元|塊錢|塊|圓|錢|的|了|這筆|消費|支出|生意帳?|公司的?|家用帳?|個人帳?|帳$/g;

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
// 常見物品字典（台灣一般人常買的東西）：分類名稱 → 詞。比對時「對到的詞越長越準」
const DICT={
'日常用品':'牙線 牙線棒 牙膏 牙刷 漱口水 衛生紙 廚房紙巾 擦手紙 濕紙巾 面紙 棉花棒 化妝棉 洗衣精 洗衣粉 洗衣球 洗衣膠囊 柔軟精 漂白水 洗碗精 菜瓜布 海綿 抹布 拖把 掃把 畚箕 垃圾袋 保鮮膜 保鮮盒 鋁箔紙 夾鏈袋 塑膠袋 洗髮精 洗髮乳 潤髮乳 沐浴乳 沐浴露 肥皂 香皂 洗手乳 洗面乳 刮鬍刀 刮鬍泡 衛生棉 護墊 棉條 除濕盒 除濕劑 芳香劑 除臭劑 除臭噴霧 殺蟲劑 蚊香 捕蚊燈 電蚊拍 防蚊液 螞蟻藥 蟑螂藥 除螞蟻 衣架 曬衣夾 收納箱 收納盒 收納袋 置物架 水桶 臉盆 浴巾 毛巾 拖鞋 雨傘 雨衣 打火機 指甲剪 梳子 杯子 碗盤 盤子 筷子 湯匙 叉子 鍋子 平底鍋 菜刀 砧板 免洗餐具 紙杯 紙盤 貓砂 狗飼料 貓飼料 飼料 寵物 貓罐 狗罐 尿墊 雞毛撢子 清潔劑 浴廁清潔 馬桶刷 通樂 小蘇打 檸檬酸 寶雅 大創 日用品 生活用品 濾水壺 濾心 電蚊香',
'育兒':'尿布 紙尿褲 奶粉 奶瓶 奶嘴 嬰兒 寶寶 新生兒 嬰兒車 推車 安全座椅 汽座 嬰兒床 包巾 口水巾 紗布巾 副食品 米精 吸乳器 集乳袋 溢乳墊 孕婦 產檢 月子 月子中心 月嫂 保母 保姆 托嬰 幼兒園 托兒所 玩具 童裝 童鞋 兒童 小孩 屁屁膏 溫奶器 消毒鍋 背巾 揹巾 學步 彌月',
'人情/孝親':'紅包 白包 禮金 喜酒 喜帖 奠儀 包紅包 孝親 孝親費 給媽 給爸 給爸媽 請爸 請媽 送禮 禮物 禮盒 伴手禮 生日禮物 彌月蛋糕 拜拜 香油錢 金紙 祭拜 供品 隨禮',
'醫療':'口罩 OK繃 ok繃 繃帶 優碘 酒精 體溫計 耳溫槍 額溫槍 血壓計 退燒 感冒藥 止痛藥 胃藥 眼藥水 藥膏 痠痛貼布 貼布 撒隆巴斯 維他命 維生素 葉酸 魚油 益生菌 保健食品 鈣片 葉黃素 洗牙 看診 復健 中醫 西醫 掛號費 健保費 藥局 藥房 健康檢查 疫苗 打針 眼科 皮膚科 小兒科 婦產科 牙科 拔牙 補牙 喉糖',
'餐飲':'便當 自助餐 炒飯 炒麵 水餃 鍋貼 煎餃 蔥油餅 蛋餅 飯糰 三明治 吐司 漢堡 薯條 炸雞 雞塊 滷肉飯 肉燥飯 雞肉飯 排骨飯 雞腿飯 牛肉麵 陽春麵 乾麵 米粉 粄條 冬粉 河粉 鍋燒 意麵 義大利麵 披薩 壽司 生魚片 丼飯 咖哩 燒臘 熱炒 合菜 鐵板燒 牛排 豆漿 米漿 珍奶 珍珠奶茶 手搖 星巴克 路易莎 85度C 50嵐 清心 可不可 迷客夏 冰沙 冰淇淋 霜淇淋 雪糕 冰棒 布丁 甜點 甜甜圈 鬆餅 紅豆餅 車輪餅 雞蛋糕 烤地瓜 玉米 臭豆腐 肉圓 碗粿 蚵仔煎 麵線 粽子 月餅 湯圓 年菜 蘋果 香蕉 芭樂 西瓜 葡萄 橘子 柳丁 草莓 芒果 鳳梨 木瓜 奇異果 番茄 青菜 高麗菜 白菜 菠菜 地瓜葉 空心菜 洋蔥 大蒜 香菇 杏鮑菇 金針菇 豆腐 豆干 雞蛋 豬肉 牛肉 雞肉 雞腿 蛤蜊 白米 麵條 沙拉油 橄欖油 食用油 醬油 調味料 味醂 米酒 啤酒 高粱 紅酒 茶葉 優格 優酪乳 起司 麥片 燕麥 泡麵 罐頭 洋芋片 巧克力 糖果 堅果 花生 口香糖 果醬 花生醬 礦泉水 椰子水 運動飲料 外送 foodpanda ubereats 熊貓 小北百貨',
'交通':'汽油 柴油 停車費 eTag 悠遊卡 一卡通 火車票 換機油 補胎 雨刷 電瓶 驗車 罰單 汽車美容 安全帽 行車紀錄器 機票 租車',
'車貸/車輛':'車貸 貨車 發財車',
'工具設備':'電動工具 電鑽 起子機 衝擊起子 砂輪機 切割機 鑽頭 鎢鋼 圓穴 點焊機 電焊 焊條 梯子 鋁梯 工具箱 工作手套 三用電表 勾表 剝線鉗 鉗子 老虎鉗 板手 扳手 螺絲起子 捲尺 水平儀 熱熔機 冷媒錶 真空泵 壓接鉗',
'進貨':'電纜 PVC管 排水管 給水管 不鏽鋼管 水龍頭 角閥 止水閥 凡而 球閥 地排 落水頭 存水彎 軟管 蓮蓬頭 浴缸 水槽 洗手台 馬桶蓋 免治馬桶 電熱水器 瓦斯熱水器 加壓馬達 抽水馬達 水塔 濾水器 LED 燈管 崁燈 嵌燈 筒燈 燈座 蓋板 盲蓋 配電箱 漏電斷路器 NFB 單芯線 絞線 電話線 同軸線 線槽 端子 絕緣膠帶 電火布 AB膠 膨脹螺絲 壁虎 鐵釘 砂石 防水漆 排風扇 抽風機 瓦斯爐 暖風機',
'材料':'鋁箔杯 布丁杯 焦糖 香草莢 鮮奶油 細砂糖 蛋黃 吉利丁 包材 提袋',
'購物':'上衣 T恤 襯衫 外套 褲子 牛仔褲 短褲 裙子 洋裝 內衣 內褲 襪子 鞋子 球鞋 涼鞋 皮帶 帽子 背包 皮夾 錢包 手錶 眼鏡 隱形眼鏡 鏡片 飾品 項鍊 戒指 耳環 手機殼 保護貼 充電器 充電線 行動電源 藍牙耳機 喇叭 筆電 平板 iPad 滑鼠 鍵盤 螢幕 硬碟 隨身碟 記憶卡 相機 印表機 吹風機 momo PChome 淘寶',
'家具':'沙發 床墊 枕頭 棉被 被子 床單 床包 窗簾 地毯 地墊 書桌 餐桌 衣櫃 鞋櫃 書櫃 層架 IKEA 宜家 宜得利 特力屋 家電 冰箱 洗衣機 烘衣機 電視 除濕機 空氣清淨機 吸塵器 掃地機 氣炸鍋 電鍋 微波爐 烤箱 熱水瓶 飲水機 電扇 電風扇',
'娛樂':'Switch PS5 steam 遊戲點數 住宿 飯店 民宿 露營 釣竿 魚餌 漫畫 小說 演唱會 展覽 遊樂園 桌遊 樂透 彩券 刮刮樂 運彩',
'美容/保養':'頭髮 染頭髮 燙頭髮 做頭髮 燙髮 染髮 美髮 理髮 腳底按摩 美睫 化妝品 化妝水 精華液 乳霜 防曬 口紅 粉底 卸妝 香水 健身房 瑜珈 屈臣氏 康是美',
'教育':'補習費 書籍 講座 文具 筆記本 考試 報名費 證照 線上課程',
'通訊':'台灣大哥大 亞太 第四台 有線電視 MOD 寬頻 光世代 月租',
'水電/瓦斯':'瓦斯費 桶裝瓦斯 台電 自來水',
'保險':'壽險 醫療險 意外險 車險 強制險',
'房租/房貸':'管理費',
'耗材':'影印 列印 沖洗照片 墨水 碳粉 影印紙',
'軟體訂閱':'canva notion dropbox adobe gemini copilot disney',
'運費':'貨運 宅配 郵資 寄件 黑貓 新竹物流 物流',
'廣告行銷':'傳單 DM 臉書廣告 印刷',
'雜費':'手續費 規費',
'薪資':'點工 臨時工',
};
const DICT_ENTRIES=[];
for(const n in DICT)for(const w of DICT[n].split(/\s+/))if(w)DICT_ENTRIES.push([n,w.toLowerCase()]);
// 同一種東西在不同帳本的分類名稱
const CAT_ALIAS={'購物':['娛樂/購物'],'娛樂':['娛樂/購物'],'娛樂/購物':['購物','娛樂']};
// 依「對到的詞長度」排出可能的分類（長的優先；一樣長時內建規則優先）
function catCandidates(text,type){
  const t=text.toLowerCase(),sc={},order=[];
  const add=(n,len)=>{if(!(n in sc)){sc[n]=0;order.push(n);}if(len>sc[n])sc[n]=len;};
  for(const [name,re,onlyType] of CAT_KW){
    if((onlyType||'expense')!==type)continue;
    const m=text.match(re);if(m)add(name,name==='其他收入'?0.5:Math.max(1,m[0].length));
  }
  if(type==='expense')for(const [n,w] of DICT_ENTRIES)if(t.includes(w))add(n,w.length);
  return order.sort((a,b)=>sc[b]-sc[a]||order.indexOf(a)-order.indexOf(b));
}
function findCat(cats,name){
  for(const n of [name,...(CAT_ALIAS[name]||[])]){const c=cats.find(c=>c.name===n);if(c)return c;}
  return null;
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
      const all=db.categories||[];
      for(const name of catCandidates(kwText,type)){
        if(name==='其他收入')continue;
        if(findCat(all.filter(c=>c.ledger===def),name)){ledger=def;break;}
        const o=['家用','個人','生意'].find(l=>findCat(all.filter(c=>c.ledger===l),name));
        if(o){ledger=o;break;}
      }
    }
    if(!ledger)ledger=ctx.defaultLedger||'個人';
    if(!(db.ledgers||[]).includes(ledger))ledger=ctx.defaultLedger||(db.ledgers||['個人'])[0];
    // 分類：以前的紀錄（同帳本）→ 內建關鍵字 → 預設
    const cats=(db.categories||[]).filter(c=>c.ledger===ledger);
    let category=null;
    if(item){const v=historyVote(item,hist,ledger,type);if(v&&cats.some(c=>c.id===v.category))category=v.category;}
    if(!category){
      for(const name of catCandidates(kwText,type)){const c=findCat(cats,name);if(c){category=c.id;break;}}
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
