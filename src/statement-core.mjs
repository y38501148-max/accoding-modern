function statementDateParts(time) {
  const parts = new Intl.DateTimeFormat('en-US', {timeZone: 'Asia/Shanghai', year: 'numeric', month: 'numeric', day: 'numeric'}).formatToParts(new Date(time));
  const value = type => parts.find(part => part.type === type)?.value || '';
  return {year: value('year'), month: value('month'), day: value('day')};
}

function statementDateRange(start, end) {
  const from = statementDateParts(start), to = statementDateParts(end);
  const first = `${from.year} 年 ${from.month} 月 ${from.day} 日`;
  return from.year === to.year && from.month === to.month && from.day === to.day
    ? first
    : `${first} — ${to.year} 年 ${to.month} 月 ${to.day} 日`;
}

function cssString(value) {
  return '"' + String(value)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/[\n\r\f]+/g, ' ') + '"';
}

const statementPageFont = '"Times New Roman","SimSun","Songti SC","Noto Serif CJK SC",serif';

export function statementCoverRows(statement) {
  return [
    {label: '题目名称', values: statement.problems.map(problem => problem.heading)},
    {label: '时间限制', values: statement.problems.map(problem => problem.timeLimitText)},
    {label: '空间限制', values: statement.problems.map(problem => problem.memoryLimitText)}
  ];
}

export function statementPageRules(statement) {
  const header = `width:50%;vertical-align:top;padding-top:41pt;font-family:${statementPageFont};font-size:10pt;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis`;
  const footer = `font-family:${statementPageFont};font-size:10pt;line-height:1.2;color:#000;vertical-align:middle`;
  return [
    `@page{size:A4;margin:25mm;@top-left{content:${cssString(statement.contestTitle)};${header}}@top-right{content:"";${header};text-align:right}@top-center{content:"";width:100%;margin-top:54pt;border-top:0.2pt solid #000}@bottom-center{content:"第 " counter(page) " 页\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0共 " counter(pages) " 页";${footer}}}`,
    '@page cover{@top-left{content:none}@top-right{content:none}@top-center{content:none;border-top:none}@bottom-center{content:none}}',
    ...statement.problems.map((problem, index) => `@page p${index}{@top-right{content:${cssString(problem.heading)};}}`)
  ].join('\n');
}

export function createStatementCore(Core) {
  function compile(value, id) {
    const raw=Core.decode(value),contest=Core.normalizeContest(raw);
    if(contest.id!==String(id))throw new Error('返回的比赛 ID 不匹配。');
    if(!contest.problems.length)throw new Error('本场比赛没有题目。');
    const name=contest.title.split(/[-－–—]/,1)[0].trim();
    const title=`${name}-Statement`;
    const contestTitle=String(contest.title).trim()||'未命名赛事';
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
      const problemTitle=String(p.title).trim()||'未命名题目';
      return {...p,title:problemTitle,description,...limits,
        heading:`${p.label} ${problemTitle}`,
        timeLimitText:`${limits.timeLimit} ms`,
        memoryLimitText:`${limits.memoryLimit} KB`};
    });
    return {title,contestTitle,dateText:statementDateRange(contest.start,contest.end),problems};
  }
  return {compile};
}
