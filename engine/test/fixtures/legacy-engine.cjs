// สร้างอัตโนมัติจาก ../prototype/index.html — อย่าแก้ไขเอง
(function(root){
'use strict';
const CODES=['OFF','ด','ช','บ','ด/บ','ช/บ','ช/ด','VA'];
const MASK={'OFF':0,'ด':1,'ช':2,'บ':4,'ด/บ':5,'ช/บ':6,'ช/ด':3,'VA':0,'':0};
const FROM={0:'OFF',1:'ด',2:'ช',3:'ช/ด',4:'บ',5:'ด/บ',6:'ช/บ'};
const W=m=>(m&1?1:0)+(m&2?1:0)+(m&4?1:0);
const pad=n=>String(n).padStart(2,'0');
const key=(y,m,d)=>`${y}-${pad(m)}-${pad(d)}`;
const days=(y,m)=>new Date(Date.UTC(y,m,0)).getUTCDate();
const weekday=(y,m,d)=>new Date(Date.UTC(y,m-1,d)).getUTCDay();
const fixed=[['01-01','วันขึ้นปีใหม่'],['04-06','วันจักรี'],['04-13','สงกรานต์'],['04-14','สงกรานต์'],['04-15','สงกรานต์'],['05-04','วันฉัตรมงคล'],['06-03','วันเฉลิมพระชนมพรรษาพระบรมราชินี'],['07-28','วันเฉลิมพระชนมพรรษาพระบาทสมเด็จพระเจ้าอยู่หัว'],['08-12','วันแม่แห่งชาติ'],['10-13','วันนวมินทรมหาราช'],['10-23','วันปิยมหาราช'],['12-05','วันพ่อแห่งชาติ / วันชาติ'],['12-10','วันรัฐธรรมนูญ'],['12-31','วันสิ้นปี']];
function holidays(){
 const out=[];
 for(const y of [2026,2027]){
  for(const [dt,name] of fixed)out.push({date:`${y}-${dt}`,name,status:y===2027?'ฐานวางแผน — รอยืนยันหน่วยงาน':'วันหยุดประจำปี',enabled:true});
 }
 const extra={2026:[['01-02','วันหยุดพิเศษ'],['03-03','วันมาฆบูชา'],['05-13','วันพืชมงคล'],['05-31','วันวิสาขบูชา'],['06-01','ชดเชยวันวิสาขบูชา'],['07-29','วันอาสาฬหบูชา'],['07-30','วันเข้าพรรษา'],['12-07','ชดเชยวันพ่อแห่งชาติ']],2027:[['02-21','วันมาฆบูชา'],['02-22','ชดเชยวันมาฆบูชา'],['05-20','วันวิสาขบูชา'],['07-18','วันอาสาฬหบูชา'],['07-19','วันเข้าพรรษา'],['07-20','ชดเชยวันอาสาฬหบูชา'],['10-25','ชดเชยวันปิยมหาราช'],['12-06','ชดเชยวันพ่อแห่งชาติ']]};
 for(const y of [2026,2027])for(const [dt,name] of extra[y])out.push({date:`${y}-${dt}`,name,enabled:true,status:y===2027?'ประมาณการ — รอยืนยันประกาศ':'ฐานราชการทั่วไป'});
 return out.sort((a,b)=>a.date.localeCompare(b.date));
}
function calendar(y,m,hs,overrides={}){
 const rows=Array.from({length:days(y,m)},(_,i)=>{const d=i+1,k=key(y,m,d),h=hs.filter(x=>x.enabled&&x.date===k),wd=weekday(y,m,d);return {day:d,date:k,weekday:wd,holiday:h.map(x=>x.name).join(' / '),work:overrides[k]!==undefined?overrides[k]:(wd!==0&&wd!==6&&!h.length)};});
 return {rows,workdays:rows.filter(x=>x.work).length};
}
function summary(row,base,credit=0,rate=null){
 const units=row.reduce((s,c)=>s+W(MASK[c]||0),0),worked=row.filter(c=>W(MASK[c]||0)>0).length;
 let maxoff=0,run=0,blocks=[];row.forEach((c,i)=>{if(c==='OFF'){run++;maxoff=Math.max(maxoff,run);}else{if(run>=3)blocks.push([i-run+1,i]);run=0;}});if(run>=3)blocks.push([row.length-run+1,row.length]);
 const ot=Math.max(0,units-Math.max(0,base-credit));
 const shifts=Object.fromEntries([['ด',1],['ช',2],['บ',4]].map(([label,bit])=>[label,row.filter(c=>(MASK[c]||0)&bit).length]));
 return {shifts,units,worked,va:row.filter(c=>c==='VA').length,off:row.filter(c=>c==='OFF').length,ot,hours:units*8,otHours:ot*8,money:rate===null||rate===''?null:ot*8*Number(rate),maxoff,blocks};
}
function nightMode(p){return p.nightMode==='front'?'front':'back';}
function allowedMasks(p){return nightMode(p)==='front'?[0,1,2,3,4,6]:[0,1,2,4,5,6];}
function activeCodes(p){return ['OFF',...allowedMasks(p).filter(Boolean).map(m=>FROM[m]),'VA'];}
// Convert labelled cells to real calendar days; retain source indices for warnings.
function temporalIssues(codes,p){
 const front=nightMode(p)==='front',out=[],masks=codes.map(c=>typeof c==='number'?c:(MASK[c]||0));
 const source=(j,bit)=>front&&bit===1?j-1:j;
 const actual=Array.from({length:codes.length+(front?1:0)},(_,j)=>front?((masks[j]||0)&6)|((masks[j-1]||0)&1):(masks[j]||0));
 const add=(type,text,indices)=>out.push({type,text,indices:[...new Set(indices.filter(i=>i>=0&&i<codes.length))]});
 for(let j=0;j<actual.length;j++){
  if((actual[j]&3)===3)add('pair','ด ต่อ ช ไม่มีช่วงพัก (ตามเวลาทำงานจริง)',[source(j,1),source(j,2)]);
  if(j>0&&(actual[j-1]&4)&&(actual[j]&1))add('transition','บ ต่อ ด ไม่มีช่วงพัก (ตามเวลาทำงานจริง)',[source(j-1,4),source(j,1)]);
  if(j>=2)for(const [label,bit]of [['ด',1],['ช',2],['บ',4]])if(actual.slice(j-2,j+1).every(m=>m&bit))add('repeat',`เวร ${label} ติดกันเกิน 2 วัน`,[j-2,j-1,j].map(k=>source(k,bit)));
  if(rollingEnabled(p)&&j>=6){const total=actual.slice(j-6,j+1).reduce((a,m)=>a+W(m),0);if(total>8){const indices=[];for(let k=j-6;k<=j;k++)for(const bit of [1,2,4])if(actual[k]&bit)indices.push(source(k,bit));add('rolling',`${total} เวรใน 7 วันตามวันทำงานจริง`,indices);}}
 }
 return out;
}
function rollingEnabled(p){return p.useRolling!==false;}
function demand(p){return p.demand||{'ช':3,'บ':3,'ด':3};}
function enabled(p,k){return k==='stroke'?p.useStroke!==false:!!p['use'+k[0].toUpperCase()+k.slice(1)];}
function skill(p){return enabled(p,'stroke')?(p.skill||{'ช':1,'บ':1,'ด':1}):{'ช':0,'บ':0,'ด':0};}
function seniorNeed(p){return enabled(p,'senior')?(p.seniorNeed||{'ช':1,'บ':1,'ด':1}):{'ช':0,'บ':0,'ด':0};}
function noviceNeed(p){return enabled(p,'novice')?(p.noviceNeed||{'ช':0,'บ':0,'ด':0}):{'ช':0,'บ':0,'ด':0};}
function levelOf(n){return n.level||(n.novice?'novice':n.senior?'senior':'rn');}
function isNovice(p,n){return enabled(p,'novice')&&levelOf(n)==='novice';}
function competentNeed(p){return enabled(p,'competent')?(p.competentNeed||{'ช':0,'บ':0,'ด':0}):{'ช':0,'บ':0,'ด':0};}
function mentorEligible(n){return !!n.mentor&&levelOf(n)!=='novice';}
function matchTeam(p,team){
 const mode=p.mentorMode||'none';if(mode==='none')return {pairs:[],unmatched:[]};
 const cap=p.mentorCapacity||1,mentors=team.filter(mentorEligible),learners=team.filter(n=>levelOf(n)==='novice');
 const slots=mentors.flatMap(m=>Array.from({length:Math.min(cap,learners.length)},()=>m)),owners=Array(slots.length).fill(null);
 const allowed=n=>slots.map((m,i)=>mode==='fixed'&&n.mentorId&&n.mentorId!==m.id?-1:i).filter(i=>i>=0&&slots[i].id!==n.id);
 function place(n,seen){for(const i of allowed(n)){if(seen.has(i))continue;seen.add(i);if(!owners[i]||place(owners[i],seen)){owners[i]=n;return true;}}return false;}
 for(const n of [...learners].sort((a,b)=>allowed(a).length-allowed(b).length))place(n,new Set());
 const pairs=owners.flatMap((n,i)=>n?[{noviceId:n.id,mentorId:slots[i].id}]:[]),assigned=new Set(pairs.map(x=>x.noviceId));
 return {pairs,unmatched:learners.filter(n=>!assigned.has(n.id)).map(n=>({noviceId:n.id,reason:mode==='fixed'&&n.mentorId&&!mentors.some(m=>m.id===n.mentorId)?'พี่เลี้ยงที่เลือกไม่อยู่ในเวรหรือไม่มีสิทธิ์เป็นพี่เลี้ยง':!mentors.length?'ไม่มีผู้มีสิทธิ์เป็นพี่เลี้ยงร่วมเวร':'พี่เลี้ยงรับดูแลเต็มจำนวนในเวรนี้'}))};
}


function validate(p){
 const {nurses,rows,D,base,requests={},prior={},next={},locks={},minimum='units',vaCredit=false}=p;
 const issues=[],bad={},badDays={},sums={},coverage=[];
 const add=(type,message,id=null,ds=[])=>{issues.push({type,message,id,days:ds});if(id)for(const d of ds)if(d>=0&&d<D)(bad[id]??={})[d]=true;for(const d of ds)if(d>=0&&d<D)badDays[d]=true;};
 for(const n of nurses){
  const row=rows[n.id]||Array(D).fill(''),credit=vaCredit?Object.values(requests[n.id]||{}).filter(r=>r.type==='VA'&&r.status==='approved'&&r.work).length:0;
  const s=summary(row,base,credit,p.rate);sums[n.id]=s;
  if(s[minimum==='days'?'worked':'units']<Math.max(0,base-credit))add('minimum',`${n.name}: ${minimum==='days'?'วันขึ้นงาน':'เวรรวม'} ${s[minimum==='days'?'worked':'units']} ต่ำกว่าเกณฑ์ ${Math.max(0,base-credit)}`,n.id,Array.from({length:D},(_,i)=>i));
  for(let d=0;d<D;d++){
   if(!CODES.includes(row[d]))add('empty',`${n.name} วันที่ ${d+1}: ยังไม่มีเวร`,n.id,[d]);
   const r=requests[n.id]?.[d];if(r&&r.status==='approved'&&row[d]!==r.type)add('leave',`${n.name} วันที่ ${d+1}: ไม่ตรงวันหยุดที่อนุมัติ (${r.type})`,n.id,[d]);
   if(row[d]==='VA'&&!(r?.type==='VA'&&r.status==='approved'))add('va',`${n.name} วันที่ ${d+1}: VA ยังไม่มีคำขออนุมัติ`,n.id,[d]);
   if(locks[n.id]?.[d]!==undefined&&locks[n.id][d]!==row[d])add('lock',`${n.name} วันที่ ${d+1}: เวรไม่ตรงช่องล็อก`,n.id,[d]);
  }
  const before=(prior[n.id]||Array(6).fill(null)).slice(-7),after=(next[n.id]||[]).slice(0,6),joined=[...before,...row,...after],offset=before.length;
  for(const x of temporalIssues(joined,p)){const ds=x.indices.map(i=>i-offset);if(ds.some(d=>d>=0&&d<D))add(x.type,`${n.name}: ${x.text} (ช่องวันที่ ${ds.map(d=>d+1).join(', ')})`,n.id,ds);}
  if(nightMode(p)==='front')for(let d=0;d<=D;d++){
   const leave=d===D?p.afterLeave?.[n.id]:requests[n.id]?.[d],prev=d===0?before.at(-1):row[d-1];
   if((leave?.status==='approved'||(d<D&&row[d]==='VA')||(d===D&&after[0]==='VA'))&&(MASK[prev]&1))add('leave',`${n.name}: ดึกช่องวันที่ ${d} ทำงานเช้าวันที่ ${d+1} ทับวันหยุด/VA ที่อนุมัติ`,n.id,[d-1,d]);
  }

 }
 for(let d=0;d<D;d++){
  const day={};for(const [label,bit] of [['ด',1],['ช',2],['บ',4]]){
   const all=nurses.filter(n=>(MASK[rows[n.id]?.[d]]||0)&bit),members=all.filter(n=>!isNovice(p,n)),novices=all.filter(n=>isNovice(p,n)),stroke=members.filter(n=>n.stroke),senior=members.filter(n=>levelOf(n)==='senior'),competent=members.filter(n=>levelOf(n)==='competent');const pairing=matchTeam(p,all);day[label]={count:members.length,stroke:stroke.length,senior:senior.length,competent:competent.length,novice:novices.length,pairs:pairing.pairs};
   if(competent.length<competentNeed(p)[label])add('competent',`วันที่ ${d+1} เวร ${label}: Competent ${competent.length}/${competentNeed(p)[label]} คน (ขั้นต่ำ)`,null,[d]);
   for(const x of pairing.unmatched)add('mentor',`วันที่ ${d+1} เวร ${label}: ${nurses.find(n=>n.id===x.noviceId)?.name} — ${x.reason}`,x.noviceId,[d]);
   if((p.mentorMode||'none')!=='none'&&novices.length<noviceNeed(p)[label])for(const n of nurses.filter(n=>levelOf(n)==='novice'&&!all.some(x=>x.id===n.id))){const blocked=matchTeam(p,[...all,n]).unmatched.find(x=>x.noviceId===n.id);if(blocked){const leave=p.mentorMode==='fixed'&&n.mentorId&&requests[n.mentorId]?.[d]?.status==='approved';add('mentorAvailability',`วันที่ ${d+1} เวร ${label}: ยังเพิ่ม ${n.name} ไม่ได้ตามตารางปัจจุบัน — ${leave?'พี่เลี้ยงที่เลือกมีวันหยุดอนุมัติ':blocked.reason}`,null,[d]);}}
   if(senior.length<seniorNeed(p)[label])add('senior',`วันที่ ${d+1} เวร ${label}: Senior ${senior.length}/${seniorNeed(p)[label]} คน (ขั้นต่ำ)`,null,[d]);
   if(enabled(p,'novice')&&novices.length!==noviceNeed(p)[label])add('novice',`วันที่ ${d+1} เวร ${label}: Novice ${novices.length}/${noviceNeed(p)[label]} คน (แยกจากกำลังหลัก)`,null,[d]);
   if(members.length!==demand(p)[label]){add('coverage',`วันที่ ${d+1} เวร ${label}: ${members.length}/${demand(p)[label]} คน`,null,[d]);for(const n of members)(bad[n.id]??={})[d]=true;}
   if(stroke.length<skill(p)[label]){add('stroke',`วันที่ ${d+1} เวร ${label}: Stroke nurse ${stroke.length}/${skill(p)[label]} คน (ขั้นต่ำ)`,null,[d]);for(const n of stroke)(bad[n.id]??={})[d]=true;}
  }coverage.push(day);
 }
 return {issues,bad,badDays,sums,coverage,valid:issues.length===0};
}
function rand(seed){let a=seed>>>0;return()=>{a+=0x6D2B79F5;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
function solveGroup(ns,target,p,reserved,timeMs,seed){
 const start=Date.now(),rnd=rand(seed),D=p.D,N=ns.length; target=Array.isArray(target)?target:[target,target,target]; const totalTarget=target.reduce((a,b)=>a+b,0)+Object.values(noviceNeed(p)).reduce((a,b)=>a+b,0);
 if(!N&&totalTarget===0)return {ok:true,rows:{}};
 if(!N)return {ok:false,reason:'ไม่มีกำลังคนในกลุ่ม'};
 const hist=ns.map(n=>(p.prior[n.id]||Array(6).fill(null)).slice(-7).map(c=>c===null||c===undefined||c===''?null:MASK[c]||0));
 const historyLengths=hist.map(h=>h.length);
 const shiftcounts=ns.map(()=>[0,0,0]);
 const rows=ns.map(()=>[]),counts=ns.map(()=>0),workcounts=ns.map(()=>0),endtails=ns.map(n=>(p.next[n.id]||[]).slice(0,6));
 const mins=ns.map(n=>Math.max(0,p.base-(p.vaCredit?Object.values(p.requests[n.id]||{}).filter(r=>r.status==='approved'&&r.type==='VA'&&r.work).length:0)));
 const allowed=ns.map(n=>Array.from({length:D},(_,d)=>{
  const req=p.requests[n.id]?.[d],lock=p.locks[n.id]?.[d];let values=allowedMasks(p);
  if(req?.status==='approved')values=[0];
  if(reserved[n.id]?.includes(d))values=[0];
  if(lock!==undefined)values=values.filter(v=>v===(MASK[lock]||0));return values;
 }));
 const capacity=ns.map((n,i)=>Array.from({length:D+1},(_,d)=>allowed[i].slice(d).reduce((s,a)=>s+(p.minimum==='days'?(a.some(x=>x)?1:0):Math.max(0,...a.map(W))),0)));
 if(mins.reduce((a,b)=>a+b,0)>totalTarget*D)return {ok:false,reason:'เวรที่ต้องให้ครบขั้นต่ำมากกว่าจำนวนเวรที่เปิด'};
 let nodes=0,bestDepth=0;
 function validMask(i,d,m){
  const h=hist[i],idx=h.length,n=ns[i],t=[...h,m,...(d===D-1?endtails[i]:[])];
  if(temporalIssues(t,p).some(x=>d===D-1?x.indices.some(j=>j>=historyLengths[i]&&j<=idx):x.indices.includes(idx)))return false;
  if(nightMode(p)==='front'){
   const nextReq=d+1===D?p.afterLeave?.[n.id]:p.requests[n.id]?.[d+1];
   if((m&1)&&(nextReq?.status==='approved'||reserved[n.id]?.includes(d+1)||(d===D-1&&endtails[i][0]==='VA')))return false;
   if((h.at(-1)&1)&&(p.requests[n.id]?.[d]?.status==='approved'||reserved[n.id]?.includes(d)))return false;
  }
  const val=p.minimum==='days'?workcounts[i]+(m?1:0):counts[i]+W(m);if(val+capacity[i][d+1]<mins[i])return false;

  return true;
 }
 function dfs(d){
  if(Date.now()-start>timeMs)return false;
  if(d===D)return mins.every((min,i)=>(p.minimum==='days'?workcounts[i]:counts[i])>=min);
  bestDepth=Math.max(bestDepth,d);nodes++;
  const opts=ns.map((n,i)=>allowed[i][d].filter(m=>validMask(i,d,m)));if(opts.some(a=>!a.length))return false;
  const order=Array.from({length:N},(_,i)=>i).sort((a,b)=>opts[a].length-opts[b].length),pick=Array(N),candidates=[];
  const codes=['ด','ช','บ'],targets=[...target,...codes.map(c=>noviceNeed(p)[c]),...codes.map(c=>skill(p)[c]),...codes.map(c=>seniorNeed(p)[c]),...codes.map(c=>competentNeed(p)[c])];
  const contributions=(i,m)=>Array.from({length:15},(_,j)=>{const bit=1<<(j%3),n=ns[i],nov=isNovice(p,n);return (m&bit)&&((j<3&&!nov)||(j>=3&&j<6&&nov)||(j>=6&&j<9&&!nov&&n.stroke)||(j>=9&&j<12&&!nov&&levelOf(n)==='senior')||(j>=12&&!nov&&levelOf(n)==='competent'))?1:0;});
  const remaining=Array.from({length:N+1},()=>Array(15).fill(0));
  for(let k=N-1;k>=0;k--)for(let j=0;j<15;j++)remaining[k][j]=remaining[k+1][j]+Math.max(0,...opts[order[k]].map(m=>contributions(order[k],m)[j]));
  let comboNodes=0,timedOut=false;const actual=Array(15).fill(0);
  function combos(k,score){
   if(timedOut)return;
   if((++comboNodes&127)===0&&Date.now()-start>timeMs){timedOut=true;return;}
   if(actual.some((v,j)=>(j<6&&v>targets[j])||v+remaining[k][j]<targets[j]))return;
   if(k===N){if(codes.some((code,j)=>matchTeam(p,ns.filter((n,i)=>pick[i]&(1<<j))).unmatched.length))return;candidates.push({m:pick.slice(),score:score+rnd()*2});if(candidates.length>256){candidates.sort((a,b)=>a.score-b.score);candidates.length=64;}return;}
   const i=order[k],ideal=(d+1)*totalTarget/N;
   for(const m of opts[i]){
    pick[i]=m;const w=W(m),total=counts[i]+w,delta=contributions(i,m);let cost=(total-ideal)**2*.7+(w===2?.6:0);
    for(let j=0;j<3;j++)cost+=(shiftcounts[i][j]+(m&(1<<j)?1:0)-total/3)**2;
    for(let j=0;j<15;j++)actual[j]+=delta[j];combos(k+1,score+cost);for(let j=0;j<15;j++)actual[j]-=delta[j];
   }
  }combos(0,0);
  candidates.sort((a,b)=>a.score-b.score);
  for(const choice of candidates.slice(0,18)){
   for(let i=0;i<N;i++){const m=choice.m[i];hist[i].push(m);rows[i].push(m);counts[i]+=W(m);workcounts[i]+=m?1:0;for(let b=0;b<3;b++)if(m&(1<<b))shiftcounts[i][b]++;}
   if(dfs(d+1))return true;
   for(let i=0;i<N;i++){const m=rows[i].pop();hist[i].pop();counts[i]-=W(m);workcounts[i]-=m?1:0;for(let b=0;b<3;b++)if(m&(1<<b))shiftcounts[i][b]--;}
   if(Date.now()-start>timeMs)return false;
  }return false;
 }
 const ok=dfs(0);return {ok,nodes,bestDepth,rows:ok?Object.fromEntries(ns.map((n,i)=>[n.id,rows[i].map((m,d)=>p.requests[n.id]?.[d]?.status==='approved'?p.requests[n.id][d].type:FROM[m])])):null};
}
function preflight(p){
 const reasons=[],N=p.nurses.filter(n=>!isNovice(p,n)).length,S=p.nurses.filter(n=>!isNovice(p,n)&&n.stroke).length,t=demand(p),sk=skill(p),total=Object.values(t).reduce((a,b)=>a+b,0),st=Object.values(sk).reduce((a,b)=>a+b,0);
 if(rollingEnabled(p)&&p.D>=7&&N*8<(total*7-(nightMode(p)==='front'&&p.D===7?t['ด']:0)))reasons.push(`กำลังคนไม่พอตามเพดาน 8 เวร/7 วัน: มี ${N} คน ต้องมีอย่างน้อย ${Math.ceil(total*7/8)} คน (ยังไม่รวมวันลาและรอยต่อ)`);
 if(rollingEnabled(p)&&p.D>=7&&S*8<(st*7-(nightMode(p)==='front'&&p.D===7?sk['ด']:0)))reasons.push(`Stroke ไม่พอตามเพดาน: มี ${S} คน ต้องมีอย่างน้อย ${Math.ceil(st*7/8)} คน`);
 for(let d=0;d<p.D;d++){
 const available=p.nurses.filter(n=>!isNovice(p,n)&&p.requests[n.id]?.[d]?.status!=='approved');
 for(const code of ['ช','บ','ด']){if(available.length<t[code])reasons.push(`วันที่ ${d+1} เวร ${code}: คนไม่ลา ${available.length}/${t[code]}`);if(available.filter(n=>n.stroke).length<sk[code])reasons.push(`วันที่ ${d+1} เวร ${code}: Stroke ไม่เพียงพอ`);}
 if(available.length*2<total)reasons.push(`วันที่ ${d+1}: กำลังคนรองรับไม่ถึง ${total} เวร แม้ขึ้นเวรคู่`);
 }
 for(const c of ['ช','บ','ด']){if(p.nurses.filter(n=>!isNovice(p,n)&&levelOf(n)==='senior').length<seniorNeed(p)[c])reasons.push(`เวร ${c}: Senior ไม่พอตามจำนวนขั้นต่ำ`);if(p.nurses.filter(n=>isNovice(p,n)).length<noviceNeed(p)[c])reasons.push(`เวร ${c}: Novice ไม่พอตามเป้าหมายแยก`);if((p.mentorMode||'none')!=='none'&&noviceNeed(p)[c]>0&&demand(p)[c]===0)reasons.push(`เวร ${c}: เป้าหมาย Novice มี แต่ไม่มี RN กำลังหลักสำหรับขึ้นร่วมเวร`);}
 for(const c of ['ช','บ','ด']){if(seniorNeed(p)[c]+competentNeed(p)[c]>demand(p)[c])reasons.push(`เวร ${c}: ขั้นต่ำ Senior + Competent เกิน RN รวม (สองระดับเป็นคนละคน)`);if(p.nurses.filter(n=>levelOf(n)==='competent').length<competentNeed(p)[c])reasons.push(`เวร ${c}: บุคลากรระดับ Competent ไม่เพียงพอ`);}
 if((p.mentorMode||'none')!=='none')for(const n of p.nurses.filter(n=>levelOf(n)==='novice')){if(p.mentorMode==='fixed'&&n.mentorId&&!p.nurses.some(m=>m.id===n.mentorId&&mentorEligible(m)))reasons.push(`${n.name}: พี่เลี้ยงที่เลือกไม่ได้ร่วมจัดเดือนนี้หรือไม่มีสิทธิ์`);}
 for(const n of p.nurses)for(const [d,code] of Object.entries(p.locks[n.id]||{})){
  const req=p.requests[n.id]?.[d];if(req?.status==='approved'&&req.type!==code)reasons.push(`${n.name} วันที่ ${+d+1}: ช่องล็อกขัดกับวันลาที่อนุมัติ`);
  if(code==='VA'&&!(req?.type==='VA'&&req.status==='approved'))reasons.push(`${n.name} วันที่ ${+d+1}: ล็อก VA ที่ยังไม่อนุมัติ`);
 }
 return [...new Set(reasons)];
}
function generateExact(p,progress=()=>{}){
 p={requests:{},prior:{},next:{},locks:{},minimum:'units',...p};
 const reasons=preflight(p);if(reasons.length)return {ok:false,reasons};
 const output={},reserved={},report=[],seed=p.seed||Date.now();
 for(const [gi,ns] of [p.nurses].entries()){
  const target=['ด','ช','บ'].map(c=>demand(p)[c]);progress({message:'จัดเวร RN และบทบาทที่เลือก',percent:gi*40+5});
  let result=null;for(let a=0;a<4;a++){result=solveGroup(ns,target,p,{},p.budget||1600,seed+a*731+gi);if(result.ok)break;}
  if(!result?.ok)return {ok:false,reasons:[`${'บุคลากร'}: ยังหาตารางที่ผ่านครบไม่พบในเวลาที่กำหนด (ไม่ใช่ข้อพิสูจน์ว่าไม่มีคำตอบ) ตรวจ VA / ช่องล็อก / เวรเดือนข้างเคียง แล้วลองเพิ่มเวลาค้นหา` ]};
  if(p.version===2){
   const order=ns.slice().sort((a,b)=>summary(result.rows[a.id],p.base).maxoff-summary(result.rows[b.id],p.base).maxoff);
   for(let ni=0;ni<order.length;ni++){
    const n=order[ni],wanted=p.blockLength||4;progress({message:`หาช่วง OFF ให้ ${n.name}`,percent:gi*40+10+Math.round(ni/order.length*30)});
    let found=false;
    for(const len of (wanted===4?[4,3]:[3])){
     const sum=summary(result.rows[n.id],p.base);if(sum.maxoff>=len){const block=sum.blocks.find(b=>b[1]-b[0]+1>=len);reserved[n.id]=Array.from({length:len},(_,i)=>block[0]-1+i);found=true;break;}
     const starts=Array.from({length:p.D-len+1},(_,i)=>i).filter(d=>Array.from({length:len},(_,k)=>d+k).every(k=>!p.requests[n.id]?.[k]&&!p.locks[n.id]?.[k]));
     starts.sort((a,b)=>{const cost=d=>Array.from({length:len},(_,k)=>W(MASK[result.rows[n.id][d+k]]||0)).reduce((x,y)=>x+y,0);return cost(a)-cost(b);});
     for(const d of starts.slice(0,6)){
      const trial={...reserved,[n.id]:Array.from({length:len},(_,i)=>d+i)};
      const candidate=solveGroup(ns,target,p,trial,Math.max(180,(p.budget||1600)/5),seed+ni*971+d*53+len);
      if(candidate.ok){result=candidate;Object.assign(reserved,trial);found=true;break;}
     }if(found)break;
    }
    report.push({id:n.id,name:n.name,found});
   }
  }
  Object.assign(output,result.rows);
 }
 const check=validate({...p,rows:output});if(!check.valid)return {ok:false,reasons:['ผลค้นหายังไม่ผ่านการตรวจซ้ำ จึงยังไม่แทนที่ตารางเดิม',...check.issues.slice(0,5).map(x=>x.message)]};
 return {ok:true,rows:output,report,check};
}
// Partial search retains mandatory leave and locks; every new assignment is checked.
function partial(p,progress){
 const t=demand(p),sk=skill(p),rnd=rand(p.seed||Date.now());let best=null;
 const hard=new Set(['leave','va','lock','transition','pair','repeat','rolling']);
 const until=Date.now()+Math.max(500,p.budget||1600);
 for(let attempt=0;attempt<20&&(!best||Date.now()<until);attempt++){
 const rows=Object.fromEntries(p.nurses.map(n=>[n.id,Array.from({length:p.D},(_,d)=>p.locks[n.id]?.[d]??(p.requests[n.id]?.[d]?.status==='approved'?p.requests[n.id][d].type:'OFF'))]));
 for(let d=0;d<p.D;d++){
 for(const code of ['ด','ช','บ'].sort(()=>rnd()-.5)){
 const bit=MASK[code];let members=()=>p.nurses.filter(n=>!isNovice(p,n)&&(MASK[rows[n.id][d]]&bit));
 while(members().length<t[code]){
 const needSkill=members().filter(n=>n.stroke).length<sk[code],needSenior=members().filter(n=>levelOf(n)==='senior').length<seniorNeed(p)[code],needCompetent=members().filter(n=>levelOf(n)==='competent').length<competentNeed(p)[code];
 const options=p.nurses.filter(n=>!isNovice(p,n)&&!(MASK[rows[n.id][d]]&bit)&&p.locks[n.id]?.[d]===undefined&&p.requests[n.id]?.[d]?.status!=='approved').map(n=>({n,score:summary(rows[n.id],p.base).units+rnd()*4+(needSkill&&!n.stroke?1000:0)+(needSenior&&levelOf(n)!=='senior'?1000:0)+(needCompetent&&levelOf(n)!=='competent'?1000:0)+((p.mentorMode||'none')!=='none'&&!mentorEligible(n)?80:0)})).sort((a,b)=>a.score-b.score);
 let placed=false;
 for(const {n} of options){const old=rows[n.id][d],m=(MASK[old]||0)|bit;if(!allowedMasks(p).includes(m))continue;rows[n.id][d]=FROM[m];
 const check=validate({...p,nurses:[n],rows});
 if(check.issues.some(x=>hard.has(x.type)&&x.days.includes(d))){rows[n.id][d]=old;continue;}
 placed=true;break;
 }if(!placed)break;
 }
 if(true){let count=p.nurses.filter(n=>isNovice(p,n)&&(MASK[rows[n.id][d]]&bit)).length;
 for(const n of p.nurses.filter(n=>isNovice(p,n)).sort((a,b)=>summary(rows[a.id],p.base).units-summary(rows[b.id],p.base).units)){
 if(count>=noviceNeed(p)[code])break;if((MASK[rows[n.id][d]]&bit)||p.locks[n.id]?.[d]!==undefined||p.requests[n.id]?.[d]?.status==='approved')continue;
 const old=rows[n.id][d],m=(MASK[old]||0)|bit;if(!allowedMasks(p).includes(m))continue;rows[n.id][d]=FROM[m];
 if(validate({...p,nurses:[n],rows}).issues.some(x=>hard.has(x.type)&&x.days.includes(d)))rows[n.id][d]=old;else if(matchTeam(p,p.nurses.filter(x=>MASK[rows[x.id][d]]&bit)).unmatched.length)rows[n.id][d]=old;else count++;
 }}
 }
 }
 for(let d=0;d<p.D;d++)for(const bit of [1,2,4]){const pairing=matchTeam(p,p.nurses.filter(n=>MASK[rows[n.id][d]]&bit));for(const x of pairing.unmatched)if(p.locks[x.noviceId]?.[d]===undefined)rows[x.noviceId][d]=FROM[(MASK[rows[x.noviceId][d]]||0)&~bit];}
 const check=validate({...p,rows}),missing=check.coverage.reduce((sum,c)=>sum+Object.keys(t).reduce((v,k)=>v+Math.max(0,t[k]-c[k].count)*10+Math.max(0,sk[k]-c[k].stroke)*5+Math.max(0,seniorNeed(p)[k]-c[k].senior)*5+Math.max(0,competentNeed(p)[k]-c[k].competent)*5+Math.max(0,noviceNeed(p)[k]-c[k].novice)*3,0),0),score=missing+check.issues.filter(x=>x.type==='minimum').length;
 if(!best||score<best.score)best={rows,check,score};if(check.valid)break;
 }
 progress({message:'ตรวจตารางและตำแหน่งที่ยังขาด',percent:95});
 return {ok:true,partial:!best.check.valid,rows:best.rows,check:best.check,report:[],reasons:[...preflight(p),'ผลค้นหาบางส่วน ไม่ใช่ข้อพิสูจน์ว่าไม่มีตารางครบ: ตรวจรายการที่ยังขาดและลองเพิ่มเวลาค้นหา']};
}
function generate(p,progress=()=>{}){
 p={requests:{},prior:{},next:{},locks:{},minimum:'units',...p};
 for(const c of ['ช','บ','ด'])if(!Number.isInteger(demand(p)[c])||demand(p)[c]<0||demand(p)[c]>100||!Number.isInteger(skill(p)[c])||skill(p)[c]<0||skill(p)[c]>demand(p)[c])return {ok:false,reasons:['จำนวนคนต้องเป็นจำนวนเต็ม 0–100 และ Stroke ต้องไม่เกินจำนวนคนในเวร']};
 for(const c of ['ช','บ','ด'])if(!Number.isInteger(seniorNeed(p)[c])||seniorNeed(p)[c]<0||seniorNeed(p)[c]>demand(p)[c]||!Number.isInteger(noviceNeed(p)[c])||noviceNeed(p)[c]<0||noviceNeed(p)[c]>100)return {ok:false,reasons:['ตรวจจำนวน Senior และ Novice: ต้องเป็นจำนวนเต็ม และ Senior ไม่เกินกำลังหลัก']};
 if(p.nightMode!==undefined&&!['front','back'].includes(p.nightMode))return {ok:false,reasons:['รูปแบบเวรดึกไม่ถูกต้อง']};
 if(!['none','auto','fixed'].includes(p.mentorMode||'none')||((p.mentorMode||'none')!=='none'&&(!Number.isInteger(p.mentorCapacity??1)||(p.mentorCapacity??1)<1||(p.mentorCapacity??1)>20)))return {ok:false,reasons:['อัตราส่วนพี่เลี้ยงต้องเป็นจำนวนเต็ม 1–20']};
 for(const c of ['ช','บ','ด'])if(!Number.isInteger(competentNeed(p)[c])||competentNeed(p)[c]<0||competentNeed(p)[c]>100)return {ok:false,reasons:['จำนวน Competent ต้องเป็นจำนวนเต็ม 0–100']};
 if(p.partialOnly&&p.allowPartial){const result=partial(p,progress);result.reasons=[...new Set([...(p.failureReasons||[]),...result.reasons])];return result;}
 const exact=generateExact(p,progress);if(exact.ok)return exact;
 if(!p.allowPartial)return {ok:false,needsConfirmation:true,reasons:exact.reasons};
 const result=partial(p,progress);result.reasons=[...new Set([...exact.reasons,...result.reasons])];return result;
}
root.RNCore={nightMode,activeCodes,temporalIssues,rollingEnabled,levelOf,mentorEligible,matchTeam,competentNeed,enabled,isNovice,seniorNeed,noviceNeed,demand,skill,CODES,MASK,W,FROM,days,key,weekday,holidays,calendar,summary,validate,generate,preflight,solveGroup};
if(typeof module!=='undefined')module.exports=root.RNCore;
})(typeof self!=='undefined'?self:globalThis);
