export function createClassCore() {
  const clean = value => String(value ?? '').normalize('NFKC').trim();
  function roster(rows) {
    const header = rows.findIndex(row => row.some(v => clean(v) === '学号') && row.some(v => clean(v) === '姓名'));
    if (header < 0) throw new Error('找不到“学号”和“姓名”列，请检查工作表。');
    const columns = rows[header].map(clean), id = columns.indexOf('学号'), name = columns.indexOf('姓名'), group = columns.indexOf('班级');
    const members = [], seen = new Map(), warnings = [];
    for (let i = header + 1; i < rows.length; i++) {
      const row = rows[i], studentId = clean(row[id]), studentName = clean(row[name]);
      if (!studentId && !studentName) continue;
      if (!studentId || !studentName || !/^[A-Za-z0-9_-]{3,32}$/.test(studentId)) {
        warnings.push(`第 ${i + 1} 行缺少有效学号或姓名，未导入`); continue;
      }
      if (seen.has(studentId)) {
        if (seen.get(studentId) !== studentName) throw new Error(`第 ${i + 1} 行学号重复且姓名不同，请先核对名册。`);
        warnings.push(`第 ${i + 1} 行重复，已合并`); continue;
      }
      seen.set(studentId, studentName);
      members.push({studentId, name: studentName, group: group < 0 ? '' : clean(row[group])});
    }
    if (!members.length) throw new Error('没有找到有效学生。');
    if (members.length > 5000) throw new Error('单个班级最多支持 5000 名学生。');
    return {members, warnings, header: header + 1};
  }
  function hasProblemDetail(detail) {
    if (detail == null) return false;
    if (typeof detail !== 'object') return true;
    return Array.isArray(detail) ? detail.length > 0 : Object.keys(detail).length > 0;
  }
  function summarize(members, rank, problems) {
    if (!Array.isArray(rank)) throw new Error('榜单格式不匹配，无法计算班级统计。');
    const byNumber = new Map();
    for (const row of rank) {
      const number = clean(row.user?.student_id);
      if (!number) continue;
      if (!row.detail || typeof row.detail !== 'object' || Array.isArray(row.detail)) throw new Error('榜单明细格式不匹配。');
      if (!byNumber.has(number)) byNumber.set(number, []);
      byNumber.get(number).push(row);
    }
    const rows = members.map(member => {
      const candidates = byNumber.get(member.studentId) || [];
      // Ambiguous numbers are excluded, never guess by nickname or rank position.
      const match = candidates.length === 1 && /^\d+$/.test(String(candidates[0].user?.id)) ? candidates[0] : null;
      return {...member, userId: match ? String(match.user.id) : null,
        status: match ? 'matched' : candidates.length ? 'ambiguous' : 'missing',
        details: match?.detail || {},
        accepted: match ? problems.filter(p => match.detail[p.rankKey]?.result === 'AC').length : null,
        tried: match ? problems.filter(p => hasProblemDetail(match.detail[p.rankKey])).length : null};
    });
    const stats = problems.map(p => ({...p,
      accepted: rows.filter(m => m.userId && m.details[p.rankKey]?.result === 'AC').length,
      tried: rows.filter(m => m.userId && hasProblemDetail(m.details[p.rankKey])).length}));
    return {rows, stats, matched: rows.filter(m => m.userId).length,
      missing: rows.filter(m => m.status === 'missing').length, ambiguous: rows.filter(m => m.status === 'ambiguous').length};
  }
  function letters(index) {
    let label = '';
    for (let n = Number(index) + 1; n > 0; n = Math.floor((n - 1) / 26)) label = String.fromCharCode(65 + (n - 1) % 26) + label;
    return label;
  }
  // Uses the normalized contest problem list, including the original site's rank keys.
  function scoreMatrix(members, summary, problems) {
    if (!summary || !Array.isArray(summary.rows) || !Array.isArray(problems)) throw new Error('请先读取比赛榜单。');
    const byStudentId = new Map(summary.rows.map(row => [row.studentId, row]));
    const normalized = problems.map((problem, index) => ({...problem,
      rankKey: String(problem.rankKey ?? letters(index)),
      label: String(problem.label || letters(index)),
      title: String(problem.title || '未命名题目')
    }));
    const headers = ['学号', '姓名', '通过题数', '尝试题数', ...normalized.map(p => `${p.label} · ${p.title}`)];
    const rows = members.map(member => {
      const row = byStudentId.get(member.studentId);
      const details = row?.userId && row.status !== 'missing' && row.status !== 'ambiguous' ? row.details : {};
      const statuses = normalized.map(p => {
        const detail = details?.[p.rankKey];
        return !hasProblemDetail(detail) ? '未尝试' : detail.result === 'AC' ? 'AC' : 'WA';
      });
      return [member.studentId, member.name, statuses.filter(s => s === 'AC').length,
        statuses.filter(s => s !== '未尝试').length, ...statuses];
    });
    return {headers, rows};
  }
  function submissions(raw, userId) {
    if (!Array.isArray(raw)) throw new Error('提交记录格式不匹配。');
    const seen = new Set();
    return raw.filter(s => String(s.creator_id ?? s.creator?.id) === String(userId))
      .filter(s => {if (seen.has(String(s.id))) return false; seen.add(String(s.id)); return true;})
      .sort((a,b) => Number(b.id) - Number(a.id));
  }
  function sortMembers(rows) {
    const score=m=>m.userId ? (m.during ?? m.accepted ?? -1) : -1;
    return [...rows].sort((a,b)=>score(b)-score(a)||String(a.studentId).localeCompare(String(b.studentId),'en',{numeric:true}));
  }
  function problemSubmissions(raw, members, problemId) {
    if (!Array.isArray(raw)) throw new Error('提交记录格式不匹配。');
    const byUser = new Map(members.filter(m => m.status === 'matched' && m.userId).map(m => [String(m.userId), m]));
    const seen = new Set();
    return raw.filter(s => s.result === 'AC' && String(s.problem_id) === String(problemId)
      && byUser.has(String(s.creator_id ?? s.creator?.id)) && /^[1-9]\d*$/.test(String(s.id)))
      .filter(s => {if (seen.has(String(s.id))) return false; seen.add(String(s.id)); return true;})
      .sort((a,b) => Number(b.id) - Number(a.id))
      .map(submission => ({submission, member: byUser.get(String(submission.creator_id ?? submission.creator?.id))}));
  }
  function problemReviewSubmissions(raw, members, problemId) {
    if (!Array.isArray(raw)) throw new Error('提交记录格式不匹配。');
    const byUser = new Map(members.filter(m => m.status === 'matched' && m.userId).map(m => [String(m.userId), m]));
    const groups = new Map(), seen = new Set();
    for (const submission of raw) {
      const id=String(submission.id), uid=String(submission.creator_id ?? submission.creator?.id);
      if(String(submission.problem_id)!==String(problemId)||!byUser.has(uid)||!(/^[1-9]\d*$/.test(id))||seen.has(id))continue;
      seen.add(id);if(!groups.has(uid))groups.set(uid,[]);groups.get(uid).push(submission);
    }
    const chosen=[];
    for(const [uid,attempts] of groups){
      attempts.sort((a,b)=>Number(b.id)-Number(a.id));
      const accepted=attempts.find(s=>s.result==='AC');
      for(const submission of accepted?[accepted]:attempts.slice(0,2))
        chosen.push({submission,member:byUser.get(uid)});
    }
    chosen.sort((a,b)=>Number(a.member.userId)-Number(b.member.userId)||Number(b.submission.id)-Number(a.submission.id));
    return chosen;
  }
  return {clean, roster, summarize, scoreMatrix, createScoreMatrix: scoreMatrix, submissions, sortMembers, problemSubmissions, problemReviewSubmissions};
}
