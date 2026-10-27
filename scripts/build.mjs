import { readFile, writeFile } from 'node:fs/promises';
const root=new URL('../',import.meta.url);
const {version}=JSON.parse(await readFile(new URL('package.json',root),'utf8'));
if(!/^\d+\.\d+\.\d+$/.test(version))throw new Error('Invalid package version');
const listFilterCore=(await readFile(new URL('src/list-filter-core.mjs',root),'utf8')).replace(/^export /gm,'');
const listFilter=await readFile(new URL('src/list-filter.js',root),'utf8');
const theme=(await readFile(new URL('src/theme.js',root),'utf8')).replace(/^\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==\s*/, '');
const interfacePreference=(await readFile(new URL('src/interface-preference.mjs',root),'utf8')).replace(/^export /gm,'');
const reviewCss=await readFile(new URL('src/review.css',root),'utf8');
const workspaceCss=await readFile(new URL('src/workspace.css',root),'utf8');
const workspace=await readFile(new URL('src/workspace.js',root),'utf8');
const runtime=await readFile(new URL('src/runtime.js',root),'utf8');
const core=(await readFile(new URL('src/contest-core.mjs',root),'utf8')).replace(/^export /gm,'');
const ui=await readFile(new URL('src/contest-board.js',root),'utf8');
const contestTheme=await readFile(new URL('src/contest-theme.js',root),'utf8');
const mathRepair=await readFile(new URL('src/math-repair.js',root),'utf8');
const mathJax=await readFile(new URL('vendor/mathjax2/mathjax-svg.js',root),'utf8');
const activationCore=(await readFile(new URL('src/upsolve-activation-core.mjs',root),'utf8')).replace(/^export /gm,'');
const activation=await readFile(new URL('src/upsolve-activation.js',root),'utf8');
const statementCore=(await readFile(new URL('src/statement-core.mjs',root),'utf8')).replace(/^export /gm,'');
const statementExport=await readFile(new URL('src/statement-export.js',root),'utf8');
const markdownCore=(await readFile(new URL('src/markdown-core.mjs',root),'utf8')).replace(/^export /gm,'');
const markdownEditor=await readFile(new URL('src/markdown-editor.js',root),'utf8');
const batchCore=(await readFile(new URL('src/batch-core.mjs',root),'utf8')).replace(/^export /gm,'');
const batchUpload=await readFile(new URL('src/batch-upload.js',root),'utf8');
const backNavigation=await readFile(new URL('src/back-navigation.js',root),'utf8');
const testdataCore=(await readFile(new URL('src/testdata-core.mjs',root),'utf8')).replace(/^export /gm,'');
const testdataGuard=await readFile(new URL('src/testdata-guard.js',root),'utf8');
const classCore=(await readFile(new URL('src/class-core.mjs',root),'utf8')).replace(/^export /gm,'');
const classXlsx=(await readFile(new URL('src/class-xlsx.mjs',root),'utf8')).replace(/^export /gm,'');
const classXlsReader=(await readFile(new URL('vendor/sheetjs/reader.mjs',root),'utf8')).replace(/^export /gm,'');
const classWorkbook=(await readFile(new URL('src/class-workbook.mjs',root),'utf8')).replace(/^import .*;\r?\n/gm,'').replace(/^export /gm,'');
const classManager=await readFile(new URL('src/class-manager.js',root),'utf8');
const teachingContest=(await readFile(new URL('src/teaching-contest.mjs',root),'utf8')).replace(/^export /gm,'');
const teachingClient=await readFile(new URL('src/teaching-client.js',root),'utf8');
const teachingCss=await readFile(new URL('src/teaching.css',root),'utf8');
const upsolveCore=(await readFile(new URL('src/upsolve-core.mjs',root),'utf8')).replace(/^export /gm,'');
const upsolveReader=await readFile(new URL('src/upsolve-reader.js',root),'utf8');
const reviewCore=(await readFile(new URL('src/ai-review-core.mjs',root),'utf8')).replace(/^export /gm,'');
const reviewXlsx=(await readFile(new URL('src/ai-review-xlsx.mjs',root),'utf8')).replace(/^import .*;\r?\n/gm,'').replace(/^export /gm,'');
const reviewAccess=await readFile(new URL('src/review-access.js',root),'utf8');
const reviewTransport=await readFile(new URL('src/review-transport.js',root),'utf8');
const submissionCore=(await readFile(new URL('src/submission-core.mjs',root),'utf8')).replace(/^export /gm,'');
const submissionReview=await readFile(new URL('src/submission-review.js',root),'utf8');
const reviewUi=await readFile(new URL('src/ai-review.js',root),'utf8');
const similarityUi=await readFile(new URL('src/code-similarity.js',root),'utf8');
const updateCore=(await readFile(new URL('src/update-core.mjs',root),'utf8')).replace(/^export /gm,'');
const updateNotice=await readFile(new URL('src/update-notice.js',root),'utf8');
const header=`// ==UserScript==
// @name         Accoding Modern · 北航 OJ 管理界面
// @namespace    local.accoding.modern
// @version      ${version}
// @description  界面美化、教学工作台、按题筛选通过提交、页内代码复核、独立补题排行榜与提交查看、赛事统计看板、Markdown 兼容编辑与批量测试点选择，保留原站登录和操作。
// @include      https://accoding.buaa.edu.cn:4000/*
// @include      https://accoding-4000.e1.buaa.edu.cn/*
// @include      https://accoding-4000.e2.buaa.edu.cn/*
// @include      https://accoding-4000.e3.buaa.edu.cn/*
// @include      https://d.buaa.edu.cn/https-4000/77726476706e69737468656265737421f1f4429323396657300a9cad991b26317219996f/*
// @run-at       document-end
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addValueChangeListener
// @grant        unsafeWindow
// @connect      muzermat.online
// @homepageURL  https://github.com/y38501148-max/accoding-modern
// @downloadURL  https://raw.githubusercontent.com/y38501148-max/accoding-modern/main/accoding-modern.user.js
// @updateURL    https://raw.githubusercontent.com/y38501148-max/accoding-modern/main/accoding-modern.meta.js
// ==/UserScript==
// Generated by scripts/build.mjs. Edit src/ files, then run npm run build.

`;
const preview=process.argv.includes('--preview');
const output=preview?'preview/accoding-modern.preview.user.js':'accoding-modern.user.js';
const scriptHeader=preview?header.replace('Accoding Modern · 北航 OJ 管理界面','Accoding Modern · Peeker 本地预览').replace(/^\/\/ @(downloadURL|updateURL).*\n/gm,''):header;
await writeFile(new URL(output,root),scriptHeader+`(() => {\n'use strict';\nconst ACCODING_MODERN_VERSION=${JSON.stringify(version)};\n${runtime}\nif (!ACCODING_MODERN_IS_APP) return;\nconst pageWindow=typeof unsafeWindow==='undefined'?window:unsafeWindow;\n${mathRepair}\nconst ACCODING_MATHJAX_SOURCE=${JSON.stringify(mathJax)};\nconst accodingMath=createMathRepair(ACCODING_MATHJAX_SOURCE);\n${reviewTransport}\n${core}\n${ui}\nmountContestBoard(createContestCore());\n${activationCore}\n${activation}\nmountUpsolveActivation(createContestCore());\n${statementCore}\n${statementExport}\nmountStatementExport(createContestCore());\n${interfacePreference}\nconst interfacePreference=createInterfacePreference({getShared:typeof GM_getValue==='function'?GM_getValue:undefined,setShared:typeof GM_setValue==='function'?GM_setValue:undefined});\nconst ACCODING_WORKSPACE_CSS=${JSON.stringify(workspaceCss)};\nconst ACCODING_REVIEW_CSS=${JSON.stringify(reviewCss)};\n${workspace}\n${contestTheme}\n${listFilterCore}\n${listFilter}\n${theme}\n${markdownCore}\n${markdownEditor}\nmountMarkdownEditor(createMarkdownCore());\n${batchCore}\n${batchUpload}\nmountBatchUpload(createBatchCore());\n${backNavigation}\nmountBackNavigation();\n${testdataCore}\n${testdataGuard}\nmountTestdataGuard(createTestdataCore());\n${classCore}\n${classXlsReader}\n${classXlsx}\n${classWorkbook}\n${reviewCore}\n${reviewXlsx}\n${reviewAccess}\n${similarityUi}\n${reviewUi}\n${teachingContest}\n${teachingClient}\nconst ACCODING_TEACHING_CSS=${JSON.stringify(teachingCss)};\n${classManager}\n${upsolveCore}\n${upsolveReader}\n${submissionCore}\n${submissionReview}\nmountClassManager(createClassCore(),createContestCore(),createUpsolveCore(),createUpsolveReader(createContestCore().time),createAiReviewCore());\nmountSubmissionReview(createAiReviewCore());\n${updateCore}\n${updateNotice}\nmountUpdateNotice(ACCODING_MODERN_VERSION);\nmountWorkspace();\n})();\n`);

if(!preview)await writeFile(new URL('accoding-modern.meta.js',root),header.slice(0,header.indexOf('// Generated')));
if(!preview)await writeFile(new URL('version.json',root),JSON.stringify({version},null,2)+'\n');
