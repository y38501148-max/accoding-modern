export function createReviewPageCache({ttl=120000,limit=24,now=Date.now}={}) {
  const pages=new Map();let generation=0;
  const clone=value=>structuredClone(value);
  function clear(){generation++;for(const entry of pages.values())entry.controller?.abort();pages.clear();}
  function read(key,load,signal){
    signal?.throwIfAborted();
    let entry=pages.get(key);
    if(entry&&entry.expires<=now()){entry.controller?.abort();pages.delete(key);entry=null;}
    if(!entry){
      const controller=new AbortController(),version=generation;
      entry={controller,expires:Infinity,promise:null};pages.set(key,entry);
      const current=entry,timeout=setTimeout(()=>controller.abort(),20000);
      current.promise=Promise.resolve().then(()=>load(controller.signal)).then(value=>{
        if(version!==generation||controller.signal.aborted)throw new DOMException('Aborted','AbortError');
        current.expires=now()+ttl;return clone(value);
      }).catch(error=>{if(pages.get(key)===current)pages.delete(key);throw error;}).finally(()=>{clearTimeout(timeout);current.controller=null;});
      while(pages.size>limit){const oldest=pages.keys().next().value;pages.get(oldest).controller?.abort();pages.delete(oldest);}
    }else{pages.delete(key);pages.set(key,entry);}
    return new Promise((resolve,reject)=>{
      const abort=()=>{cleanup();reject(signal.reason||new DOMException('Aborted','AbortError'));};
      const cleanup=()=>signal?.removeEventListener('abort',abort);
      signal?.addEventListener('abort',abort,{once:true});
      entry.promise.then(value=>{cleanup();if(signal?.aborted)abort();else resolve(clone(value));},error=>{cleanup();reject(error);});
      if(signal?.aborted)abort();
    });
  }
  return {read,clear};
}

export function createAiReviewCore() {
  const api='https://muzermat.online:8443/oj-review-api/v2';
  const apiV4='https://muzermat.online:8443/oj-review-api/v4';
  const apiV3='https://muzermat.online:8443/oj-review-api/v3';
  const featureLabels=['输入失败防护','讲解性注释','编号步骤','对答式注释','模板化说明','注释密集','生成回答残留','短时间大幅改写','单题码风突变','短时间码风突变','注释表达特征','模型来源注释','代码结构大幅变化','跨题码风变化','罕见共同代码片段','罕见高级用法','快速过题','CE 使用非 C 语言语法','AC 后重复提交码风变化'];
  const selections={candidate:'候选复核',sample:'连续提交抽样',manual:'单独复核'};
  const states={paused:'已暂停',running:'正在复核',completed:'复核完成',completed_with_errors:'已结束，部分失败',failed:'运行失败'};
  const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
  const humanLabels={ordinary:'无 AI',uncertain:'存疑',suspected:'有 AI'};
  const reviewStates={rule_unmatched:'规则未命中',rule_hit_unreviewed:'规则命中/未核查',reviewed_no_ai:'已核查为无AI',reviewed_uncertain:'已核查为存疑',reviewed_ai:'已核查为AI'};
  const legacyFeatureLabels=['长变量命名','函数与变量命名'];
  const courseGroups=[{course:'C语言',ids:[1305,1312,1319,1327]},{course:'程序设计基础',ids:[1299,1309,1315,1323,1304,1310]}];
  function courseContests(contestId){const group=courseGroups.find(item=>item.ids.includes(Number(contestId)));return group?group.ids.map((id,index)=>({id,label:`${group.course} ${index<4?'C'+(index+1):'E'+(index-3)}`})):[];}
  function collectedContests(){return courseGroups.flatMap(group=>courseContests(group.ids[0]));}
  function contestLabel(contestId,titles={}){const known=courseGroups.flatMap(group=>courseContests(group.ids[0])).find(item=>String(item.id)===String(contestId));return known?.label||titles[contestId]||'其他比赛';}
  function beijingTime(value,empty='时间未提供'){
    if(value==null||value==='')return empty;const number=typeof value==='number'||/^\d+(?:\.\d+)?$/.test(String(value))?Number(value):null;
    const date=new Date(number==null?value:number<1e12?number*1000:number);if(!Number.isFinite(date.getTime()))return empty;
    const parts=Object.fromEntries(new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(date).map(item=>[item.type,item.value]));
    return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
  }
  function profileNarrative(snapshot,currentContestId,titles={}){
    const summary=snapshot.profile?.summary||{},coverage=summary.coverage||{},base=summary.baseline||{},scope=(snapshot.scope_contest_ids||[]).map(Number),ids=(coverage.contest_ids||scope).map(Number),course=courseContests(currentContestId),missing=course.filter(item=>!scope.includes(item.id));
    const names=ids.map(id=>contestLabel(id,titles));
    const range=`当前画像包含${names.length?names.join('、'):'当前可查看比赛'}的 ${coverage.source_count??coverage.submissions??0} 份提交代码。`;
    let gap=scope.length<=1?'本次仅能查看这一场比赛，其他比赛的历史尚未计入，跨场习惯还无法判断。':missing.length?`${missing.map(item=>item.label).join('、')}尚未计入；以下观察只依据当前可查看的比赛。`:'以上范围仅限已授权且已采集的比赛。';
    if(snapshot.scope_pending)gap+=' 新增比赛的历史正在汇总，画像和辅助分值待更新。';
    else if(snapshot.stale)gap+=' 人工结论已更新，历史观察和辅助分值正在重新计算。';
    if(coverage.parse_failed)gap+=` 其中 ${coverage.parse_failed} 份代码未能可靠分析，未用于习惯比较。`;
    const count=base.sample_count??0,problems=base.problem_count??0;
    const confirmation=base.status==='confirmed'?'这些代码已由助教核查为无 AI。':base.status==='provisional'?'这些代码尚未经人工确认。':'可比较的历史代码不足，暂不能形成稳定对照。';
    const baseline=`目前用于描述习惯的参照代码：${count} 份，覆盖 ${problems} 题。${confirmation}`;
    const habits=Object.entries(summary.habits||{}).map(([kind,habit])=>({kind,habit,text:habit.applicable?`${habit.applicable} 份可比较的代码中，${habit.present??0} 份${kind==='input_guard'?'包含额外输入失败检查':kind==='comment'?'包含说明性注释':'具有这项写法'}。`:`暂无可用于比较${kind==='input_guard'?'输入检查':kind==='comment'?'说明性注释':'这项写法'}的代码。`}));
    return {range,gap,baseline,habits,updated:`统计更新至 ${beijingTime(snapshot.cutoff)}（北京时间）。`,distribution:Object.entries(summary.distribution||{}).map(([id,item])=>({label:contestLabel(id,titles),item,score:summary.member_score?.[id]}))};
  }
  function contestPairNarrative(record){
    const pair=record?.rule_metadata?.cross_problem_style;
    if(pair?.comparison_mode!=='within_contest_non_overlapping_pair_v1')return null;
    const names={helper_organization:'辅助函数组织',input_idiom:'额外输入失败检查',comment_organization:'说明性注释组织'};
    const side=pair.selected_side==='earlier'?'较早':pair.selected_side==='later'?'较晚':'未标明先后';
    const groups=(pair.changed_evidence_groups||[]).map(group=>names[group]||group);
    return {pairIndex:pair.pair_index,problemIds:pair.pair_problem_ids||[],selectedProblemId:pair.selected_problem_id,
      chronology:`当前提交是本次${side}的一侧，规则只选择内容组织更规范的题目作为候选。`,
      timing:pair.selected_side==='earlier'?'本次配对对照晚于当前提交，按实际提交时间回看两份代码。':'本次配对按实际提交时间列出先后。',
      content:`内容变化：${groups.join('、')||'未提供'}。${pair.admission==='one_content_group_with_strong_layout'?'另有排版佐证；相关排版变化合为一组，不独立计分。':'至少两组内容变化方向一致。'}`,
      references:Array.isArray(pair.comparison_references)&&pair.comparison_references.length?pair.comparison_references:pair.pair_references||[],
      technical:{pair_id:pair.pair_id,pairing_policy:pair.pairing_policy,pair_created_at:pair.pair_created_at,
        initial_target_reference:pair.initial_target_reference,decision_cutoff:pair.decision_cutoff,
        standardization:pair.standardization,cohort_role:pair.cohort_role,
        pairing_population_references:pair.pairing_population_references,cohort_references:pair.cohort_references}};
  }
  function recomputeNotice(record){
    if(record?.needs_recompute!==true&&record?.recompute_reason!=='baseline_feedback_changed'&&record?.scope_evidence_status!=='baseline_feedback_changed')return '';
    return record.scope_explanation||record.scope_evidence_explanation||'基线参考后来被人工判为有 AI 或存疑，该比较需重新核查并重跑；其他独立证据仍可查看。';
  }
  function profileRecompute(snapshot,record){
    const evidence=snapshot.profile?.evidence||[],count=snapshot.profile?.summary?.permission_projection?.needs_recompute_submissions;
    const matching=evidence.find(ref=>String(ref.submission_id)===String(record.submission_id)&&ref.code_hash===record.code_hash);
    return {count:Math.max(Number.isInteger(count)&&count>=0?count:0,evidence.filter(ref=>recomputeNotice(ref)).length),current:recomputeNotice(matching)};
  }
  function selectReviewRun(values,preferred='latest'){
    const moment=run=>{const numeric=Number(run.created_at);return Number.isFinite(numeric)?numeric:(Date.parse(run.created_at)||0);};
    const runs=[...values].sort((a,b)=>moment(b)-moment(a)||b.run_id.localeCompare(a.run_id));
    const latest=runs.find(run=>run.publication_ready!==false)||null;
    const explicit=preferred!=='latest'&&runs.some(run=>run.run_id===preferred);
    return {runs,selected:explicit?runs.find(run=>run.run_id===preferred):latest,latest,explicit,pending:runs.filter(run=>run.publication_ready===false)};
  }
  function humanState(status){const state={ordinary:'reviewed_no_ai',uncertain:'reviewed_uncertain',suspected:'reviewed_ai'}[status];if(!state)throw new Error('人工结论格式无效，请升级插件或联系管理员。');return state;}
  function validAnnotation(a){return a&&Object.hasOwn(humanLabels,a.status)&&Number.isInteger(a.id)&&a.id>0&&typeof a.reason==='string';}
  function feedbackPacket(value){if(!value||!Array.isArray(value.history)||value.history.some(x=>!validAnnotation(x))||(value.latest!=null&&!validAnnotation(value.latest)))throw new Error('人工结论格式无效，请升级插件或联系管理员。');return value;}
  function inReviewFilter(record,filter='queue',problemList=false){if(!Object.hasOwn(reviewStates,record.review_status))throw new Error('核查状态格式无效');return (problemList||filter==='all'||filter==='reviewed_no_ai'||record.review_status!=='reviewed_no_ai')&&(filter==='all'||filter==='queue'||filter===record.review_status);}
  function scoreSummary(record){const score=record.scoring||record.scores||{},raw=Object.hasOwn(record,'raw_score')?record.raw_score:record.rule_score??score.raw_score??score.score??score.raw,adjusted=record.profile_scores_valid===false?null:Object.hasOwn(record,'auxiliary_score')?record.auxiliary_score:record.profile_adjusted_score??record.profile_score??score.auxiliary_score??score.profile_adjusted_score??score.adjusted_score??score.adjusted;return {raw:Number.isFinite(raw)?raw:null,adjusted:Number.isFinite(adjusted)?adjusted:null};}
  function submissionUrl(id){if(!/^[1-9]\d*$/.test(String(id)))throw new Error('提交编号格式无效');return 'https://accoding.buaa.edu.cn:4000/submission/'+id;}
  function exportTables(records,feedback=[]){
    const newest=new Map();for(const item of feedback){if(!validAnnotation(item))throw new Error('导出反馈格式无效');const key=String(item.submission_id)+':'+item.code_hash,old=newest.get(key);if(!old||item.id>old.id)newest.set(key,item);}
    const current=records.map(record=>{const saved=newest.get(String(record.submission_id)+':'+record.code_hash),annotation=saved&&(!record.annotation||saved.id>=record.annotation.id)?saved:record.annotation;const projected=annotation?{...record,annotation,review_status:humanState(annotation.status)}:record;return {...projected,source_url:submissionUrl(record.submission_id),score_summary:scoreSummary(record)};});
    const counts=Object.fromEntries(Object.keys(reviewStates).map(key=>[key,0]));for(const record of current){if(!Object.hasOwn(counts,record.review_status))throw new Error('导出核查状态格式无效');counts[record.review_status]++;}
    return {current_review:current,complete_evidence:current.map(record=>({submission_id:record.submission_id,code_hash:record.code_hash,evidence:record.evidence||[],context_references:record.context_references||[],history_hits:record.history_hits||[],previous_submission:record.previous_submission||null})),feedback_history:feedback,counts};
  }
  function hasReviewRecord(r){
    if(!r||!Object.hasOwn(reviewStates,r.review_status))return false;
    if(r.annotation&&(!validAnnotation(r.annotation)||humanState(r.annotation.status)!==r.review_status))return false;
    if(r.review_status.startsWith('reviewed_')&&!validAnnotation(r.annotation))return false;
    if(r.decision_kind==='rule_feature_unretained')return hash(r.configuration_sha256)&&hash(r.code_hash)&&!!r.run_id&&r.review_status!=='rule_unmatched';
    if(r.decision_kind==='unflagged')return hash(r.configuration_sha256)&&hash(r.code_hash)&&!!r.run_id&&r.review_status!=='rule_hit_unreviewed';
    if(r.decision_kind==='human_review')return hasFeatureReview(r);
    return hasFeatureReview(r);
  }
  function hasFeatureReview(r){const d=r?.result;if(r?.decision_kind==='human_review')return hash(r.configuration_sha256)&&hash(r.code_hash)&&typeof r.run_id==='string'&&!!r.run_id&&d===null&&validAnnotation(r.annotation)&&r.human_status===r.annotation.status;return ((r?.decision_kind==='rule_feature_candidate'&&typeof r.rule_version==='string'&&!!r.rule_version&&r.call_id===null)||(r?.decision_kind==='llm_feature_presence'&&(hash(r.model_digest)||(r.backend_kind==='remote_api'&&r.model_digest===null&&hash(r.execution_config_sha256)&&typeof r.requested_model==='string'))))&&hash(r.configuration_sha256)&&hash(r.code_hash)&&typeof r.run_id==='string'&&!!r.run_id&&d?.ai_suspected===true&&Object.keys(d).sort().join(',')==='ai_suspected,label,reason'&&typeof d.reason==='string'&&!!d.reason.trim()&&Array.isArray(d.label)&&d.label.length>0&&new Set(d.label).size===d.label.length&&d.label.every(x=>featureLabels.includes(x)||legacyFeatureLabels.includes(x));}
  async function verifySource(code,expected){if(typeof code!=='string'||!hash(expected))throw new Error('源码或校验摘要缺失');const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(code));const actual=[...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,'0')).join('');if(actual!==expected)throw new Error('源码哈希与核查时不一致，请打开 OJ 原提交人工核验。');return code;}
  function sourceVariants(text,id){
    const header=text.match(/^\/\*[\s\S]*?\*\//),candidates=[text];
    if(header&&/Author:/.test(header[0])&&/Created at:/.test(header[0])&&/Submission_id:/.test(header[0])){
      if(header[0].match(/Submission_id:\s*(\d+)/)?.[1]!==String(id))throw new Error('OJ 返回的提交编号与上下文不一致');
      const body=text.slice(header[0].length);candidates.push(body,body.replace(/^\r?\n\r?\n/,''),body.trim());
    }
    return [...new Set(candidates.flatMap(code=>[code,...(code.startsWith('\n')?[code.slice(1)]:[]),...(code.startsWith('\r\n')?[code.slice(2)]:[])]))];
  }
  async function sourceFromOj(text,id,expected){
    for(const code of sourceVariants(text,id)){try{return await verifySource(code,expected);}catch{}}
    throw new Error('源码哈希与核查时不一致，请打开 OJ 原提交人工核验。');
  }
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
  function featureClient(getToken,fetcher=fetch,version=3){
    const sourceCache=new Map(),referenceRuns=new Map();
    const remember=(cache,key,value)=>{cache.delete(key);cache.set(key,value);if(cache.size>128)cache.delete(cache.keys().next().value);return value;};
    async function request(path,body,signal,absent=false,write=false,writeToken){
      const token=version===4&&!write?'':(writeToken??getToken()).trim();if(version!==4&&!token)throw new Error('请先在复核设置中填写只读令牌。');
      const res=await fetcher((version===4?apiV4:apiV3)+path,{method:body?'POST':'GET',headers:{...(token?{Authorization:'Bearer '+token}:{}),...(version===4?{'X-Review-State-Protocol':'2'}:{}),...(body?{'Content-Type':'application/json'}:{})},credentials:'omit',cache:'no-store',signal,body:body?JSON.stringify(body):undefined});
      if(res.status===404&&absent)return null;
      if(!res.ok){let body={};try{body=await res.json();}catch{}const error=new Error(body.detail||`复核请求失败（HTTP ${res.status}）`);error.httpStatus=res.status;throw error;}
      return res.json();
    }
    async function runs(path,signal,contest){const r=await request(path,null,signal);if(!Array.isArray(r.runs)||r.runs.some(x=>typeof x.run_id!=='string'||(Object.hasOwn(x,'publication_ready')&&typeof x.publication_ready!=='boolean')||!hash(x.configuration_sha256)||(contest!==undefined&&x.contest_id!==Number(contest))))throw new Error('运行清单格式或比赛不一致');return r;}
    async function reviewRecord(r,id,runId){
      if(r&&(r.run_id!==runId||String(r.submission_id)!==String(id)))throw new Error('复核详情与所选运行或提交不一致');
      if(r&&!(version===4?hasReviewRecord(r):hasFeatureReview(r)))throw new Error('复核结果包含当前插件不支持的规则或格式，请更新插件后重试');
      if(r&&typeof r.code==='string')await verifySource(r.code,r.code_hash);
      if(r?.feedback){
        feedbackPacket(r.feedback);
        for(const note of [r.feedback.latest,...r.feedback.history].filter(Boolean))if(String(note.submission_id)!==String(id)||note.code_hash!==r.code_hash)throw new Error('人工记录与当前源码不一致');
        if((r.annotation?.id||0)!==(r.feedback.latest?.id||0))throw new Error('人工记录版本与详情不一致');
      }
      if(r?.reference_sources){
        if(!Array.isArray(r.reference_sources)||r.reference_sources.length>128)throw new Error('历史源码身份清单格式无效');
        for(const source of r.reference_sources){
          if(!/^[1-9]\d*$/.test(String(source.submission_id))||!hash(source.code_hash)||source.run_id!==runId||String(source.creator_id)!==String(r.creator_id)||source.contest_id!==r.contest_id)throw new Error('历史源码身份与当前运行不一致');
          remember(sourceCache,version+':'+(version===4?'public':getToken().trim())+':'+runId+':'+source.submission_id+':'+source.code_hash,source);
        }
      }
      return r;
    }
    async function detail(id,runId,signal,includeFeedback=false){
      if(!runId)throw new Error('请先选择核查运行');
      return reviewRecord(await request(`/runs/${encodeURIComponent(runId)}/submissions/${encodeURIComponent(id)}${version===4?'?include_candidates=true'+(includeFeedback?'&include_feedback=true':''):''}`,null,signal,true),id,runId);
    }
    async function referenceSource(ref,current,signal){
      signal?.throwIfAborted();
      const id=String(ref?.submission_id||''),author=String(current?.creator_id||'');
      if(!/^[1-9]\d*$/.test(id)||!hash(ref?.code_hash)||!author)throw new Error('历史对照缺少有效的提交身份或源码校验信息');
      const locator=typeof ref.source_locator==='object'&&ref.source_locator!==null?ref.source_locator.run_id:ref.source_locator;
      if(ref.source_locator!=null&&(typeof locator!=='string'||!locator))throw new Error('历史对照运行编号无效');
      if(ref.run_id&&locator&&ref.run_id!==locator)throw new Error('历史对照运行编号不一致');
      const explicit=ref.run_id||locator;
      if(explicit!=null&&(typeof explicit!=='string'||!explicit||!/^[\w.-]+$/.test(explicit)))throw new Error('历史对照运行编号无效');
      const sameContest=ref.contest_id!=null&&String(ref.contest_id)===String(current.contest_id);
      const cachedHere=sourceCache.has(version+':'+(version===4?'public':getToken().trim())+':'+current.run_id+':'+id+':'+ref.code_hash);
      const hinted=explicit||((sameContest||cachedHere)?current.run_id:null),attempted=new Set();
      function verify(source,run){
        if(!source||String(source.submission_id)!==id||source.code_hash!==ref.code_hash||String(source.creator_id)!==author
          ||(ref.creator_id!=null&&String(source.creator_id)!==String(ref.creator_id))
          ||(ref.contest_id!=null&&String(source.contest_id)!==String(ref.contest_id))
          ||(ref.problem_id!=null&&String(source.problem_id)!==String(ref.problem_id))
          ||(run.contest_id!=null&&String(source.contest_id)!==String(run.contest_id))
          ||(source.run_id!=null&&source.run_id!==run.run_id)
          ||! /^[1-9]\d*$/.test(String(source.problem_id))||! /^[1-9]\d*$/.test(String(source.contest_id)))throw new Error('历史对照的提交、源码哈希、作者或题目与冻结记录不一致');
        return {...source,run_id:run.run_id};
      }
      async function read(run){
        signal?.throwIfAborted();attempted.add(run.run_id);
        const key=version+':'+(version===4?'public':getToken().trim())+':'+run.run_id+':'+id+':'+ref.code_hash;
        if(sourceCache.has(key))return verify(sourceCache.get(key),run);
        const source=await request(`/runs/${encodeURIComponent(run.run_id)}/sources/${encodeURIComponent(id)}`,null,signal);
        signal?.throwIfAborted();const result=verify(source,run);remember(sourceCache,key,source);return result;
      }
      if(hinted){try{return await read({run_id:hinted,contest_id:ref.contest_id});}catch(error){if(error.httpStatus!==404)throw error;}}
      const scopeKey=version+':'+(version===4?'public':getToken().trim())+':'+id;
      let found=referenceRuns.get(scopeKey);
      if(!found||Date.now()-found.at>30000){
        const packet=await runs(`/submissions/${encodeURIComponent(id)}/runs${version===4?'?include_candidates=true&include_unpublished=true':''}`,signal);
        signal?.throwIfAborted();found={at:Date.now(),runs:packet.runs};if(packet.runs.length)remember(referenceRuns,scopeKey,found);
      }
      const choices=selectReviewRun(found.runs).runs.filter(run=>run.publication_ready!==false&&!attempted.has(run.run_id)&&(ref.contest_id==null||String(run.contest_id)===String(ref.contest_id)));
      for(const run of choices){try{return await read(run);}catch(error){if(error.httpStatus!==404)throw error;}}
      throw new Error('尚无可读取的历史冻结快照，请稍后重试或打开原提交');
    }
    function validateSimilarity(record,contestId){
      const ident=value=>/^[1-9]\d*$/.test(String(value));
      if(!record||!ident(record.submission_id)||!ident(record.creator_id)||!ident(record.problem_id)||String(record.contest_id)!==String(contestId)||!hash(record.code_hash)
        ||!['matched','no_match','too_short','unsupported','out_of_scope'].includes(record.status)||!Array.isArray(record.matches)||record.matches.length>3
        ||(record.status==='matched')!==Boolean(record.matches.length)||!Number.isInteger(record.peer_count)||record.peer_count<record.matches.length)throw new Error('代码查重结果格式或比赛范围不一致');
      const seen=new Set();
      for(const match of record.matches){
        const ref=match.reference;
        if(!ref||!ident(ref.submission_id)||!ident(ref.creator_id)||!hash(ref.code_hash)||String(ref.creator_id)===String(record.creator_id)||String(ref.submission_id)===String(record.submission_id)
          ||String(ref.contest_id)!==String(record.contest_id)||String(ref.problem_id)!==String(record.problem_id)||seen.has(String(ref.creator_id))
          ||!Number.isFinite(match.similarity)||match.similarity<.95||match.similarity>1||!Number.isInteger(match.matched_tokens)||match.matched_tokens<1||!Array.isArray(match.snippets)||match.snippets.length>3)throw new Error('查重对照必须为同场同题的不同学生，且相似率至少为 95%');
        for(const pair of match.snippets)for(const alias of ['current','reference']){
          const s=pair[alias];if(!s||!Number.isInteger(s.start_line)||s.start_line<1||!Number.isInteger(s.end_line)||s.end_line<s.start_line||typeof s.quote!=='string'||s.quote.split('\n').length!==s.end_line-s.start_line+1)throw new Error('查重引用行号或原文无效');
        }
        seen.add(String(ref.creator_id));
        if(match.annotation!=null)validatePairFeedback(match.annotation,{run_id:record.run_id,submission_id:record.submission_id,code_hash:record.code_hash,reference_id:ref.submission_id,reference_hash:ref.code_hash});
      }
      return record;
    }
    function validatePairFeedback(note,pair){
      const identities=value=>[[String(value.submission_id),value.code_hash],[String(value.reference_id),value.reference_hash]].sort((a,b)=>a[0].localeCompare(b[0]));
      if(!note||!Number.isInteger(note.id)||note.id<1||!['ordinary','uncertain','suspected'].includes(note.status)||typeof note.reason!=='string'||note.run_id!==pair.run_id||JSON.stringify(identities(note))!==JSON.stringify(identities(pair)))throw new Error('核对记录与这两份提交不一致');
      return note;
    }
    async function peerSource(ref,current,signal){
      validateSimilarity({...current,status:'matched',matches:[{reference:ref,similarity:1,matched_tokens:1,snippets:[]}],peer_count:1},current.contest_id);
      if(!current.run_id)throw new Error('代码查重缺少冻结运行编号');
      const source=await request(`/runs/${encodeURIComponent(current.run_id)}/sources/${encodeURIComponent(ref.submission_id)}`,null,signal);
      for(const key of ['submission_id','creator_id','contest_id','problem_id','code_hash'])if(String(source?.[key])!==String(ref[key]))throw new Error('查重对照身份或源码哈希与冻结记录不一致');
      if(source.run_id!=null&&source.run_id!==current.run_id)throw new Error('查重对照的冻结运行不一致');
      return source;
    }
    return {
      referenceSource,
      peerSource,
      async openList(query,preferred,signal){
        const packet=await request('/reviews/search',{...query,run_id:preferred,resolve_run:true,include_candidates:true,include_all:true},signal);
        if(!Array.isArray(packet.runs)||packet.runs.some(run=>typeof run.run_id!=='string'||run.contest_id!==query.contest_id||!hash(run.configuration_sha256)||(Object.hasOwn(run,'publication_ready')&&typeof run.publication_ready!=='boolean')))throw new Error('运行清单格式或比赛不一致');
        const selected=selectReviewRun(packet.runs,preferred).selected;
        if(packet.run_id!==(selected?.run_id||null)||!Array.isArray(packet.reviews)||!Number.isInteger(packet.total)||packet.total<0||packet.reviews.length>query.limit)throw new Error('复核 API 返回格式或运行无效');
        if(packet.reviews.some(r=>!r||r.run_id!==packet.run_id||r.contest_id!==query.contest_id||!query.creator_ids.includes(String(r.creator_id))||!hasReviewRecord(r)))throw new Error('复核结果与当前运行或班级不一致');
        return packet;
      },
      async openReview(id,runId,signal){
        if(runId)return {record:await detail(id,runId,signal,true)};
        const packet=await runs(`/submissions/${encodeURIComponent(id)}/runs${version===4?'?include_candidates=true&include_unpublished=true&include_review=true':''}`,signal);
        const selected=selectReviewRun(packet.runs).selected;
        const record=Object.hasOwn(packet,'review')?await reviewRecord(packet.review,id,selected?.run_id):selected?await detail(id,selected.run_id,signal,true):null;
        if(selected&&Object.hasOwn(packet,'review')&&!record)throw new Error('核查运行与合并详情不一致');
        return {runs:packet.runs,record};
      },
      async similaritySearch(query,signal){
        const packet=await request('/code-similarity/search',query,signal);
        if(packet.run_id!==query.run_id||packet.contest_id!==query.contest_id||packet.version!=='same-contest-peer-tokens-v1'||!Array.isArray(packet.records)||!Number.isInteger(packet.total)||packet.total<0||packet.records.length>query.limit)throw new Error('代码查重运行或返回格式不一致');
        if(query.pair_view&&(packet.pair_view!==true||!['pair_count','source_count','status_count'].every(key=>Number.isInteger(packet[key])&&packet[key]>=0)||packet.total!==packet.pair_count+packet.status_count||packet.records.some(r=>r.status==='matched'&&r.matches?.length!==1)))throw new Error('代码查重服务尚未提供按代码对合并的结果，请更新本地复核核心。');
        for(const record of packet.records){validateSimilarity({...record,run_id:packet.run_id},query.contest_id);if(!query.creator_ids.includes(String(record.creator_id))||(query.problem_id!=null&&record.problem_id!==query.problem_id)||(query.submission_ids&&!query.submission_ids.includes(String(record.submission_id))))throw new Error('代码查重结果与当前班级或题目不一致');}
        return packet;
      },
      async similarityDetail(id,runId,contestId,signal){
        const packet=await request(`/runs/${encodeURIComponent(runId)}/code-similarity/${encodeURIComponent(id)}`,null,signal);
        if(packet.run_id!==runId||String(packet.submission_id)!==String(id)||packet.version!=='same-contest-peer-tokens-v1')throw new Error('代码查重详情与所选运行或提交不一致');
        return validateSimilarity(packet,contestId);
      },
      async similarityFeedback(pair,signal){
        const packet=await request('/code-similarity/feedback/history',pair,signal);
        if(!packet||!Array.isArray(packet.history))throw new Error('核对记录格式有误');
        for(const note of packet.history)validatePairFeedback(note,pair);
        if(packet.latest!=null)validatePairFeedback(packet.latest,pair);
        return packet;
      },
      async saveSimilarityFeedback(body,signal,token){
        if(!['ordinary','uncertain','suspected'].includes(body.status))throw new Error('请选择结论');
        body={...body,reason:body.reason??''};
        const result=await request('/code-similarity/feedback',body,signal,false,true,token);
        if(result.saved!==true)throw new Error('核对记录未保存');
        validatePairFeedback(result.feedback,body);return result;
      },
      session:(signal,write=false)=>request('/feedback/session',null,signal,false,write),
      source:(id,runId,signal)=>request(`/runs/${encodeURIComponent(runId)}/sources/${encodeURIComponent(id)}`,null,signal),
      feedback:async(id,codeHash,runId,signal)=>feedbackPacket(await request(`/feedback/${encodeURIComponent(id)}?code_hash=${encodeURIComponent(codeHash)}&run_id=${encodeURIComponent(runId)}`,null,signal)),
      saveFeedback:(body,signal)=>{humanState(body.status);return request('/feedback',{...body,reason:body.reason??''},signal,false,true);},
      exportEvidence:(runId,offset=0,signal)=>request(`/runs/${encodeURIComponent(runId)}/evidence/export?offset=${offset}&limit=200`,null,signal),
      exportFeedback:(contest,after=0,signal)=>request(`/contests/${encodeURIComponent(contest)}/feedback/export?after=${after}`,null,signal),
      progress:(contest,signal)=>runs(`/contests/${encodeURIComponent(contest)}/progress${version===4?'?include_unpublished=true':''}`,signal,contest),
      submissionRuns:(id,signal)=>runs(`/submissions/${encodeURIComponent(id)}/runs${version===4?'?include_candidates=true&include_unpublished=true':''}`,signal),
      detail,
      async search(query,signal){
        if(!query.run_id)throw new Error('请先选择核查运行');const r=await request('/reviews/search',version===4?{...query,include_candidates:true,include_all:true}:query,signal);
        if(r.run_id!==query.run_id||!Array.isArray(r.reviews)||!Number.isInteger(r.total)||r.total<0||r.reviews.length>query.limit)throw new Error('复核 API 返回格式或运行无效');
        if(r.reviews.some(x=>!x||x.run_id!==query.run_id||x.contest_id!==query.contest_id||!query.creator_ids.includes(String(x.creator_id))))throw new Error('复核结果与当前运行或班级不一致');
        if(r.reviews.some(x=>!(version===4?hasReviewRecord(x):hasFeatureReview(x))))throw new Error('复核结果包含当前插件不支持的规则或格式，请更新插件后重试');
        return r;
      }
    };
  }
  // Keep the current record as an anchor even when feedback removes it from the queue.
  function reviewCursor(records,offset,total) {
    let items=records.map(r=>String(r.submission_id)),start=offset,count=total;
    const removed=new Set();
    return {
      setVisible(id,visible){id=String(id);if(!items.includes(id))return;const wasVisible=!removed.has(id);if(visible===wasVisible)return;if(visible)removed.delete(id);else removed.add(id);count+=visible?1:-1;},
      neighbor(id,direction){for(let i=items.indexOf(String(id))+direction;i>=0&&i<items.length;i+=direction)if(!removed.has(items[i]))return items[i];return null;},
      request(direction){const end=start+items.length-removed.size;if(direction>0)return end<count?{offset:end,limit:30}:null;return start>0?{offset:Math.max(0,start-30),limit:Math.min(30,start)}:null;},
      has(id,direction){return items.includes(String(id))&&!!(this.neighbor(id,direction)||this.request(direction));},
      extend(result,request,direction){const ids=result.reviews.map(r=>String(r.submission_id));count=result.total;if(direction>0)items.push(...ids.filter(id=>!items.includes(id)));else{items.unshift(...ids.filter(id=>!items.includes(id)));start=request.offset;}}
    };
  }
  function lineDiff(before,after){
    const a=before.replace(/\r\n/g,'\n').split('\n'),b=after.replace(/\r\n/g,'\n').split('\n');
    const output=[];
    function row(x,y){let p=new Uint32Array(y.length+1);for(const v of x){const q=new Uint32Array(y.length+1);for(let j=0;j<y.length;j++)q[j+1]=v===y[j]?p[j]+1:Math.max(p[j+1],q[j]);p=q;}return p;}
    function solve(x,y,oldStart,newStart){
      let front=0;while(front<x.length&&front<y.length&&x[front]===y[front]){output.push({kind:'equal',text:x[front],oldLine:oldStart+front,newLine:newStart+front});front++;}
      x=x.slice(front);y=y.slice(front);oldStart+=front;newStart+=front;
      let tail=0;while(tail<x.length&&tail<y.length&&x[x.length-1-tail]===y[y.length-1-tail])tail++;
      const xx=tail?x.slice(0,-tail):x,yy=tail?y.slice(0,-tail):y;
      if(!xx.length)yy.forEach((text,i)=>output.push({kind:'add',text,oldLine:null,newLine:newStart+i}));
      else if(!yy.length)xx.forEach((text,i)=>output.push({kind:'remove',text,oldLine:oldStart+i,newLine:null}));
      else if(xx.length===1){const at=yy.indexOf(xx[0]);if(at<0){output.push({kind:'remove',text:xx[0],oldLine:oldStart,newLine:null});yy.forEach((text,i)=>output.push({kind:'add',text,oldLine:null,newLine:newStart+i}));}else{solve([],yy.slice(0,at),oldStart,newStart);output.push({kind:'equal',text:xx[0],oldLine:oldStart,newLine:newStart+at});solve([],yy.slice(at+1),oldStart+1,newStart+at+1);}}
      else{const mid=Math.floor(xx.length/2),left=row(xx.slice(0,mid),yy),right=row(xx.slice(mid).reverse(),[...yy].reverse());let split=0;for(let j=1;j<=yy.length;j++)if(left[j]+right[yy.length-j]>left[split]+right[yy.length-split])split=j;solve(xx.slice(0,mid),yy.slice(0,split),oldStart,newStart);solve(xx.slice(mid),yy.slice(split),oldStart+mid,newStart+split);}
      for(let i=0;i<tail;i++)output.push({kind:'equal',text:x[xx.length+i],oldLine:oldStart+xx.length+i,newLine:newStart+yy.length+i});
    }
    solve(a,b,1,1);return output;
  }
  return {createPageCache:createReviewPageCache,contestPairNarrative,recomputeNotice,profileRecompute,collectedContests,courseContests,contestLabel,beijingTime,profileNarrative,selectReviewRun,humanLabels,humanState,feedbackPacket,inReviewFilter,scoreSummary,submissionUrl,exportTables,reviewCursor,lineDiff,api,apiV3,apiV4,selections,states,reviewStates,featureLabels,members,hasFlaggedReview,hasFeatureReview,hasReviewRecord,verifySource,sourceVariants,sourceFromOj,client,featureClient};
}
