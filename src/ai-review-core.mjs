export function createAiReviewCore() {
  const api='https://muzermat.online:8443/oj-review-api/v1';
  const states={not_collected:'尚未采集',rules_only:'规则已完成，未运行模型',queued:'排队',running:'处理中',completed:'完成',failed:'失败',stale:'结果过期',cancelled:'已取消'};
  function classSubmissions(records,members) {
    const ids=new Map(members.filter(m=>m.status==='matched'&&m.userId).map(m=>[String(m.userId),m]));
    return records.filter(s=>/^[1-9]\d*$/.test(String(s.id))&&ids.has(String(s.creator_id??s.creator?.id))).map(s=>({...s,id:String(s.id),member:ids.get(String(s.creator_id??s.creator?.id))}));
  }
  function batches(ids){const unique=[...new Set(ids.map(String))];return Array.from({length:Math.ceil(unique.length/250)},(_,i)=>unique.slice(i*250,i*250+250));}
  function client(getToken,fetcher=fetch) {
    const cache=new Map();
    async function request(path,body,signal) {
      const token=getToken().trim();if(!token)throw new Error('请先在复核设置中填写只读令牌。');
      const res=await fetcher(api+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},credentials:'omit',cache:'no-store',signal,body:body?JSON.stringify(body):undefined});
      if(!res.ok)throw new Error(`复核读取失败（HTTP ${res.status}）。${[401,403].includes(res.status)?'请检查只读令牌。':''}`);
      return res.json();
    }
    return {clear:()=>cache.clear(),detail:(id,signal)=>request(`/submissions/${encodeURIComponent(id)}/review`,null,signal),
      async query(ids,signal,force=false){
        const found=new Map();
        const wanted=ids.map(String).filter(id=>{const hit=cache.get(id);if(!force&&hit&&Date.now()-hit.time<60000){found.set(id,hit.review);return false;}return true;});
        for(const batch of batches(wanted)){
          if(signal?.aborted)throw new DOMException('Aborted','AbortError');
          const data=await request('/reviews/query',{submission_ids:batch},signal);
          if(!Array.isArray(data.reviews))throw new Error('复核 API 返回格式无效');
          for(const review of data.reviews){if(!batch.includes(review.submission_id))continue;found.set(review.submission_id,review);if(review.state==='completed')cache.set(review.submission_id,{time:Date.now(),review});}
          for(const id of batch)if(!found.has(id))throw new Error('复核 API 缺少查询结果，请刷新重试');
        }
        return ids.map(id=>found.get(String(id)));
      }};
  }
  return {api,states,classSubmissions,batches,client};
}
