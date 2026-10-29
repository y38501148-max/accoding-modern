import {createTextXlsx} from './class-xlsx.mjs';

/** Export the selected roster against one observed OJ rank, without cloud collection. */
export function createTeachingScoreExport(view, members, context) {
  if (view?.source !== 'oj' || !context?.contestId || String(view.contest_id) !== String(context.contestId)) {
    throw new Error('榜单来源或比赛不匹配，请重新读取当前比赛后导出。');
  }
  if (!Array.isArray(members) || !Array.isArray(view.problems) || !Array.isArray(view.scores) || !view.problemResults) {
    throw new Error('比赛成绩数据不完整，请重新读取榜单。');
  }
  const timestamp = (value, label) => {
    const date = new Date(value);
    if (!value || !Number.isFinite(date.getTime())) throw new Error(`${label}无效，请重新读取榜单。`);
    return date.toISOString();
  };
  const observedAt = timestamp(context.observedAt, '榜单读取时间');
  const exportedAt = timestamp(context.exportedAt, '导出时间');
  const numeric = value => {
    if (value == null || value === '') return null;
    if (!['number', 'string'].includes(typeof value) || !Number.isFinite(Number(value))) throw new Error('榜单成绩格式无效，未导出。');
    return Number(value);
  };
  const scores = new Map(view.scores.map(row => [String(row.student_id), row]));
  const selected = members.map(member => {
    const id = String(member.studentId ?? '');
    if (!id.trim()) throw new Error('班级成员缺少学号，无法导出。');
    const score = scores.get(id);
    return {member, id, total: score ? numeric(score.total_score) : null, rank: score ? numeric(score.rank) : null};
  });
  selected.sort((a, b) => (a.total == null) - (b.total == null) || (b.total ?? 0) - (a.total ?? 0)
    || (a.rank ?? Infinity) - (b.rank ?? Infinity) || a.id.localeCompare(b.id));
  const rows = selected.map(({member, id, total, rank}) => [id, member.name, total, rank,
    ...view.problems.flatMap(problem => {
      const detail = view.problemResults[id]?.[problem.order_letter];
      return detail ? [numeric(detail.score), detail.result || '待评测'] : [null, '未提交'];
    })]);
  const headers = ['学号', '姓名', '总分', 'OJ 原始名次', ...view.problems.flatMap(problem => {
    const label = `${problem.order_letter} · ${problem.title}`;
    return [label + ' · 分数', label + ' · 判定'];
  })];
  const content = createTextXlsx([
    {name: '成绩表', headers, rows,
      numericColumns: [2, 3, ...view.problems.map((_, index) => 4 + index * 2)],
      widths: [18, 16, 12, 16, ...view.problems.flatMap(() => [20, 20])]},
    {name: '统计范围', headers: ['项目', '内容'], widths: [26, 90], rows: [
      ['数据来源', 'OJ 当前可见榜单'],
      ['数据说明', '非云端赛内定稿；比赛结束后的榜单可能包含补题成绩。'],
      ['课程', context.courseName || ''],
      ['班级', context.className || '全部班级'],
      ['含重修', context.includeRetake ? '是' : '否'],
      ['比赛编号', String(context.contestId)],
      ['比赛', view.name || String(context.contestId)],
      ['榜单读取时间（UTC）', observedAt],
      ['导出时间（UTC）', exportedAt],
      ['导出人数', String(members.length)]
    ]}
  ]);
  const cleanName = value => String(value ?? '').normalize('NFKC').replace(/[\u0000-\u001f\u007f\\/:*?"<>|]/g, '_').trim().slice(0, 60) || '未命名';
  return {filename: `${cleanName(context.className || '全部班级')}-${cleanName(view.name || context.contestId)}-成绩.xlsx`,
    blob: new Blob([content], {type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'})};
}
