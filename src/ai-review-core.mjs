export function createAiReviewCore() {
  const api='https://muzermat.online:8443/oj-review-api/v2';
  const selections={candidate:'候选复核',sample:'连续提交抽样',manual:'单独复核'};
  const states={paused:'已暂停',running:'正在复核',completed:'复核完成',failed:'运行失败'};
  function hasFlaggedReview(r){return r?.ai_suspected===true&&typeof r.model_digest==='string'&&/^[a-f0-9]{64}$/.test(r.model_digest)&&Number.isFinite(r.score)&&Number.isFinite(r.threshold)&&r.score>=r.threshold;}
  function members(rows){return new Map(rows.filter(m=>m.status==='matched'&&/^[1-9]\d*$/.test(String(m.userId))).map(m=>[String(m.userId),m]));}
  function client(getToken,fetcher=fetch){
    async function request(path,body,signal){
      const token=getToken().trim();if(!token)throw new Error('请先在复核设置中填写只读令牌。');
      const res=await fetcher(api+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},credentials:'omit',cache:'no-store',signal,body:body?JSON.stringify(body):undefined});
      if(res.status===404&&path.startsWith('/submissions/'))return null;
      if(!res.ok)throw new Error(`复核读取失败（HTTP ${res.status}）。${[401,403].includes(res.status)?'请检查只读令牌。':''}`);
      return res.json();
    }
    return {
      progress:(contest,signal)=>request(`/contests/${contest}/progress`,null,signal),
      async detail(id,signal){const r=await request(`/submissions/${encodeURIComponent(id)}/review`,null,signal);if(r&&!hasFlaggedReview(r))throw new Error('复核结果缺少有效模型判断');return r;},
      async search(query,signal){
        const r=await request('/reviews/search',query,signal);
        if(!Array.isArray(r.reviews)||!Number.isInteger(r.total)||r.total<0||r.reviews.length>query.limit)throw new Error('复核 API 返回格式无效');
        if(r.reviews.some(x=>!hasFlaggedReview(x)||x.contest_id!==query.contest_id||!query.creator_ids.includes(String(x.creator_id))))throw new Error('复核结果与当前班级不一致');
        return r;
      }
    };
  }
  return {api,selections,states,members,hasFlaggedReview,client};
}
