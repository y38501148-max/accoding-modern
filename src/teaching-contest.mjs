export function acceptanceAxis(peak){
  const target=Math.max(1,peak/4),power=10**Math.floor(Math.log10(target));
  const step=[1,2,5,10].map(n=>n*power).find(n=>n>=target);
  const max=Math.max(step,Math.ceil(peak/step)*step);
  return {max,ticks:Array.from({length:max/step+1},(_,i)=>i*step)};
}

export function mergeTeachingContests(discovered,collected,includeSpecial){
  const known=new Map(collected.map(c=>[String(c.id),c]));
  const rows=new Map(collected.map(c=>[String(c.id),{...c,id:String(c.id)}]));
  for(const c of discovered){const stored=known.get(c.id);rows.set(c.id,{...c,...stored,id:c.id,title:c.title,state:stored?.state||'oj'});}
  return [...rows.values()].filter(c=>includeSpecial||!(/^(?:special|t)(?:\s*[-·]|$)/i.test(c.title))).sort((a,b)=>Number(b.id)-Number(a.id));
}
export function createTeachingContest(contest,rank,members,groupId,core){
  if(String(contest.group_id)!==String(groupId))throw Error('比赛不属于当前课程');
  const labels=core.normalizeContest(contest).problems;
  const byUser=new Map(rank.map((r,i)=>[String(r.user.id),{...r,rank:i+1}])),byNumber=new Map();
  for(const row of byUser.values()){const sid=String(row.user.student_id||'').trim();if(!byNumber.has(sid))byNumber.set(sid,[]);byNumber.get(sid).push(row);}
  const problemResults={},scores=[],identities={},unsubmitted=[];
  for(const m of members){
    const candidates=byNumber.get(m.studentId)||[],r=byUser.get(String(m.userId))||(candidates.length===1?candidates[0]:null);
    const details=Object.fromEntries(labels.map(p=>[p.label,r?.detail?.[p.rankKey]]).filter(([,d])=>d));problemResults[m.studentId]=details;
    if(r){identities[m.studentId]=String(r.user.id);scores.push({student_id:m.studentId,name:m.name,total_score:Number(r.score)||0,rank:r.rank,penalty_seconds:(Number(r.penalty)||0)/1000});}
    if(!Object.values(details).some(Boolean))unsubmitted.push({student_id:m.studentId,name:m.name,participated:!!r});
  }
  const scoreValues=scores.map(r=>r.total_score),average=rows=>rows.length?rows.reduce((a,b)=>a+b,0)/rows.length:null;
  const problems=[...contest.problems].sort((a,b)=>a.contest_problem_list.order-b.contest_problem_list.order).map((p,index)=>{
    const letter=labels[index].label,details=Object.values(problemResults).map(r=>r[letter]).filter(Boolean),max=Number(p.contest_problem_list.score);
    return {problem_id:String(p.id),title:p.title,order_letter:letter,max_score:max,attempted:details.length,accepted:details.filter(d=>d.result==='AC').length,accept_rate:members.length?details.filter(d=>d.result==='AC').length/members.length:0,average_score:average(details.map(d=>Number(d.score)||0))};
  });
  const outcomes={problems:problems.map(p=>{
    const buckets={full:[],partial:[],zero:[],missing:[]};
    for(const m of members){const d=problemResults[m.studentId][p.order_letter],score=Number(d?.score)||0;const kind=!d?'missing':d.result==='AC'||p.max_score>0&&score>=p.max_score?'full':score>0?'partial':'zero';
      buckets[kind].push({student_id:m.studentId,name:m.name,score_ratio:p.max_score?score/p.max_score:0,attempts:d?(Number(d.wrong_count)||0)+1:0,best_result:d?.result||'',last_result:d?.result||''});}
    return {order_letter:p.order_letter,...buckets};
  })};
  return {contest_id:String(contest.id),name:contest.title,start_time:contest.start_time,end_time:contest.end_time,syncedAt:null,source:'oj',problems,scores,problemResults,identities,outcomes,unsubmitted,classes:[],summary:{expected:members.length,participated:scores.length,scored:scores.length,unsubmitted:unsubmitted.length,average_score:average(scoreValues),contest_max_score:problems.reduce((sum,p)=>sum+p.max_score,0)}};
}
