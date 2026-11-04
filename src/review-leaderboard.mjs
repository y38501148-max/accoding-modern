export function reviewLeaderboardContests(context) {
  const source=context.reviewContests||Object.entries(context.contestNames||{}).map(([id,title])=>({id,title}));
  return [...new Map(source.filter(c=>/^C\d+(?:\D|$)/i.test(c.title?.trim()||'')).map(c=>[String(c.id),{...c,id:String(c.id),label:c.title.trim().match(/^C\d+/i)[0].toUpperCase()}])).values()]
    .sort((a,b)=>Number(a.label.slice(1))-Number(b.label.slice(1))||Number(a.id)-Number(b.id));
}


export function reviewLeaderboardQuery(core,context,page=0,revision=null) {
  const members=[...core.members(context.summary.rows).values()];
  return {contests:reviewLeaderboardContests(context).map(c=>({id:Number(c.id),label:c.label})),
    members:members.map(m=>({userId:String(m.userId),studentId:String(m.studentId),name:m.name,group:m.group||m.teachingGroup||''})),
    unmatched:context.summary.rows.length-members.length,offset:page*10,limit:10,...(revision?{revision}:{})};
}

export async function loadReviewLeaderboard(client,core,context,signal,page=0) {
  return client.leaderboard(reviewLeaderboardQuery(core,context,page),signal);
}
