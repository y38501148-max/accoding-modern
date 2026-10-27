export function createStatementCore(Core) {
  function compile(value, id) {
    const raw=Core.decode(value),contest=Core.normalizeContest(raw);
    if(contest.id!==String(id))throw new Error('返回的比赛 ID 不匹配。');
    if(!contest.problems.length)throw new Error('本场比赛没有题目。');
    const name=contest.title.split(/[-－–—]/,1)[0].trim();
    const title=`${name}-Statement`;
    const originals=new Map(raw.problems.map(p=>[String(p.id),p]));
    const problems=contest.problems.map(p=>{
      const description=originals.get(p.id).description;
      if(typeof description!=='string'||!description.trim())throw new Error(`${p.label} 题题面为空或无权读取，未导出。`);
      return {...p,description};
    });
    return {title,problems};
  }
  return {compile};
}
