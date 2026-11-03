export function createStatementCore(Core) {
  function compile(value, id) {
    const raw=Core.decode(value),contest=Core.normalizeContest(raw);
    if(contest.id!==String(id))throw new Error('返回的比赛 ID 不匹配。');
    if(!contest.problems.length)throw new Error('本场比赛没有题目。');
    const name=contest.title.split(/[-－–—]/,1)[0].trim();
    const title=`${name}-Statement`;
    const originals=new Map(raw.problems.map(p=>[String(p.id),p]));
    const problems=contest.problems.map(p=>{
      const original=originals.get(p.id),description=original.description;
      if(typeof description!=='string'||!description.trim())throw new Error(`${p.label} 题题面为空或无权读取，未导出。`);
      let settings;
      try{settings=Core.decode(original.test_setting);}catch{}
      const limits={};
      for(const [field,key,name]of [['time_limit','timeLimit','时间限制'],['memory_limit','memoryLimit','空间限制']]){
        const value=settings?.[field];
        if(!['string','number'].includes(typeof value)||!/^\d+$/.test(String(value).trim())||!Number.isSafeInteger(Number(value))||Number(value)<=0)throw new Error(`${p.label} 题${name}缺失或无效，未导出。`);
        limits[key]=Number(value);
      }
      return {...p,description,...limits};
    });
    return {title,problems};
  }
  return {compile};
}
