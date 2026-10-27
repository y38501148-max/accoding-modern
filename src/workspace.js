// One home for shared tools; moving hosts preserves their listeners and state.
function workspaceIcon(name) {
  const paths={grid:'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',problem:'M5 3h14v18H5z M8 7h8 M8 11h8 M8 15h5',contest:'M8 3h8v5a4 4 0 0 1-8 0z M8 5H4v3a4 4 0 0 0 5 4 M16 5h4v3a4 4 0 0 1-5 4 M12 12v6 M8 21h8 M9 18h6',submission:'M9 5h12 M9 12h12 M9 19h12 M3 5h1 M3 12h1 M3 19h1',group:'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M16 3a4 4 0 0 1 0 8 M22 21v-2a4 4 0 0 0-3-3.87 M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0',user:'M20 21v-2a7 7 0 0 0-14 0v2 M17 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0',settings:'M4 6h16 M4 12h16 M4 18h16 M8 3v6 M16 9v6 M10 15v6',search:'M21 21l-5-5 M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0'};
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width','1.7');svg.setAttribute('stroke-linecap','round');svg.setAttribute('stroke-linejoin','round');svg.setAttribute('aria-hidden','true');svg.classList.add('am-nav-icon');
  const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',paths[name]||paths.grid);svg.append(path);return svg;
}

function mountWorkspace() {
  const submissionRoot=document.querySelector('#am-submission-review')?.shadowRoot;
  const modern=document.documentElement.matches('.am,.am-ng')||!!submissionRoot;
  if(!modern)return;
  const make=(tag,cls,text)=>{const node=document.createElement(tag);node.className=cls;if(text)node.textContent=text;return node;};
  let header=document.querySelector('.am-topbar')||submissionRoot?.querySelector('.am-topbar');
  if(!header){header=make('header','am-topbar');header.append(make('div','','比赛'));header.append(make('div','am-top-actions'));}
  const actions=header.querySelector('.am-top-actions');
  const classHost=document.getElementById('am-classes'),classRoot=classHost?.shadowRoot;
  const classes=make('div','am-class-header');
  const selector=make('select','');selector.setAttribute('aria-label','当前班级');
  const manage=make('button','am-button','教学工作台');manage.type='button';
  manage.onclick=()=>classRoot?.querySelector('.launch').click();
  const syncClass=()=>{
    const original=classRoot?.querySelector('#class-select');if(!original)return;
    const signature=[...original.options].map(o=>o.value+'='+o.textContent).join('|');
    if(selector.dataset.signature!==signature){selector.replaceChildren(...[...original.options].map(o=>new Option(o.textContent,o.value)));selector.dataset.signature=signature;}
    selector.value=original.value;selector.disabled=original.disabled||original.options.length<2;
  };
  selector.onchange=()=>{const original=classRoot.querySelector('#class-select');original.value=selector.value;original.dispatchEvent(new Event('change'));};
  classes.append(selector,manage);actions.prepend(classes);syncClass();
  if(classRoot){new MutationObserver(syncClass).observe(classRoot.querySelector('#class-select'),{childList:true,subtree:true,characterData:true});classHost.addEventListener('am-class-change',syncClass);}
  const settings=make('details','am-settings'),summary=make('summary','','设置');summary.prepend(workspaceIcon('settings'));
  const settingsPanel=make('div','am-settings-panel');settingsPanel.append(make('span','am-settings-version','OJ Modern · '+ACCODING_MODERN_VERSION));
  let reset=actions.querySelector('button.am-button:not(.am-class-header button)')||document.querySelector('.am-ng-reset');
  const update=make('button','am-button','检查更新');update.type='button';update.onclick=()=>classRoot?.querySelector('[data-action=check-script-update]')?.click();settingsPanel.append(update);
  const classUpdate=classRoot?.querySelector('[data-action=check-script-update]');
  if(classUpdate&&classRoot.querySelector('.class-admin')){const feedback=classUpdate.nextElementSibling;classRoot.querySelector('.class-admin').append(classUpdate);if(feedback)classRoot.querySelector('.class-admin').append(feedback);}
  settings.append(summary,settingsPanel);actions.append(settings);
  const account=make('details','am-account'),accountSummary=make('summary',''),accountName=make('span','am-account-name','账号'),accountPanel=make('div','am-account-panel');
  accountSummary.append(workspaceIcon('user'),accountName);account.append(accountSummary,accountPanel);
  for(const menu of [settings,account]){
    document.addEventListener('click',event=>{if(!event.composedPath().includes(menu))menu.open=false;});
    menu.addEventListener('keydown',event=>{if(event.key==='Escape'){menu.open=false;menu.querySelector('summary').focus();}});
    menu.addEventListener('toggle',()=>{if(menu.open)for(const other of [settings,account])if(other!==menu)other.open=false;});
  }
  const tools=make('section','am-tools'),slots=make('div','am-tool-slots');tools.setAttribute('aria-label','比赛工具');tools.append(make('h2','','比赛工具'),slots);
  const board=document.getElementById('am-contest-tools'),activation=document.getElementById('am-upsolve-activation');
  if(board){
    // Keep the fullscreen host at body level so a sticky sidebar cannot clip it
    // or put document content above its overlay.
    board.dataset.docked='true';
    const launch=board.shadowRoot.querySelector('.launch');
    const control=make('button','am-button am-board-control','赛事统计看板');control.prepend(workspaceIcon('grid'));control.type='button';control.onclick=()=>launch.click();
    const sync=()=>{control.hidden=launch.hidden;};sync();new MutationObserver(sync).observe(launch,{attributes:true,attributeFilter:['hidden']});slots.append(control);
  }
  if(activation){activation.dataset.docked='true';for(const button of activation.shadowRoot.querySelectorAll('.launch button'))button.prepend(workspaceIcon('problem'));slots.append(activation);}
  if(classHost){classHost.dataset.docked='true';}
  const updates=document.getElementById('am-update-notice');if(updates){updates.dataset.docked='true';if(submissionRoot)submissionRoot.querySelector('.submission-content').prepend(updates);else header.after(updates);}
  // Docking styles live in each ShadowRoot, so the original interface keeps its tools.
  for(const host of [board,activation,classHost,updates]){
    if(!host?.shadowRoot)continue;
    const style=make('style','');style.textContent=`
      :host([data-docked]){display:block;font:14px/1.6 -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;color:#182536}
      :host([data-docked])>.launch{position:static;inset:auto;width:100%;max-width:none;min-height:44px;margin:0;padding:10px 12px;border:1px solid #dfe5eb;border-radius:7px;background:#f8fafc;color:#234ba4;box-shadow:none;font-size:14px;font-weight:500;text-align:left}
      :host([data-docked]) div.launch{display:flex;flex-direction:column;align-items:stretch;gap:8px;padding:0;border:0;border-radius:0;background:transparent;min-height:0}
      :host([data-docked]) .launch button{display:flex;align-items:center;gap:10px;width:100%;padding:10px 12px;min-height:44px;border:1px solid #dfe5eb;border-radius:7px;background:#f8fafc;color:#234ba4;font:500 14px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;text-align:left;transition:background .16s,border-color .16s}
      :host([data-docked]) .launch button:hover:not(:disabled){background:#edf3ff;border-color:#9cb4e9}
      :host([data-docked]) .launch button:disabled{background:#f8fafc;color:#718096;border-color:#dfe5eb}
      :host([data-docked]) .launch .am-nav-icon{width:19px;height:19px;flex:none}
      :host([data-docked]) section[aria-label="脚本更新"]{position:static;max-width:none;margin:0 0 20px;padding:16px;border-radius:8px;box-shadow:none;background:#edf3ff}
      button,a,summary{touch-action:manipulation}:focus-visible{outline:3px solid #275ad6;outline-offset:3px}
      @media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important;scroll-behavior:auto!important}}
    `;
    if(host===classHost)style.textContent+=':host([data-docked])>.launch{display:none}';
    if(host===board)style.textContent+=':host([data-docked]){color:#e6edf7}:host([data-docked])>.launch{display:none}.overlay h1{color:#eef3fc}';
    host.shadowRoot.append(style);
  }
  const place=()=>{
    // ng-include can create the reset control after the workspace has mounted.
    reset ||= document.querySelector('.am-ng-reset');
    if(reset&&reset.parentElement!==settingsPanel){const slot=reset.closest('.am-ng-reset-item');settingsPanel.insertBefore(reset,update);slot?.remove();}
    const nav=document.querySelector('#navbar')||submissionRoot?.querySelector('.submission-rail');
    const context=document.querySelector('[ng-view]>.col-lg-2');
    if(nav&&!nav.contains(tools)){const links=nav.querySelector('.navbar-middle');if(links)links.after(tools);else nav.append(tools);}
    if(context&&!context.contains(tools))context.append(tools);
    const ngNav=document.querySelector('[ng-view]>nav');
    if(ngNav){
      // Move the native account lists (including ng-show/ng-hide and their links),
      // and replace stale lists when Angular renders a new route or nav include.
      const lists=[...ngNav.querySelectorAll('.navbar-right')].filter(list=>!account.contains(list));
      if(lists.length)accountPanel.replaceChildren(...lists);
      if(account.parentElement!==actions)actions.append(account);
      const visible=[...accountPanel.children].find(list=>!list.hidden&&!list.classList.contains('ng-hide'));
      const label=visible?.querySelector('a')?.textContent.trim()||'账号';
      if(accountName.textContent!==label)accountName.textContent=label;
    }
    if(ngNav&&!context&&!ngNav.contains(tools))ngNav.append(tools);
    if(ngNav&&!ngNav.contains(header))ngNav.append(header);
    if(updates&&submissionRoot){const content=submissionRoot.querySelector('.submission-content');if(content.firstElementChild!==updates)content.prepend(updates);}else if(updates&&header.nextElementSibling!==updates)header.after(updates);
  };
  let queued=false;new MutationObserver(()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;place();});}).observe(document.body,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['class']});place();
  // Use the native nodes, including their links and all Bootstrap/Angular events.
  for(const [id,name]of [['grouppage','group'],['problempage','problem'],['contestpage','contest'],['submissionpage','submission'],['informationpage','user']])document.getElementById(id)?.prepend(workspaceIcon(name));
  for(const search of document.querySelectorAll('.am-search>span'))search.replaceChildren(workspaceIcon('search'));
}

function layoutClassWorkspace(root) {
  const make=(tag,cls,text)=>{const node=document.createElement(tag);node.className=cls;if(text)node.textContent=text;return node;};
  const shell=root.querySelector('.shell'),header=root.querySelector('.top'),workspace=root.querySelector('#workspace');
  const rail=make('aside','class-rail');rail.setAttribute('aria-label','班级比赛工具');
  const brand=make('a','class-brand','accoding');brand.href=accodingPath('/');brand.prepend(workspaceIcon('grid'));rail.append(brand,make('h2','rail-label','比赛'));
  const contestPanel=workspace.firstElementChild;contestPanel.classList.add('class-contest-picker');rail.append(contestPanel);
  const tabs=workspace.querySelector('[role=tablist]');rail.append(tabs);
  const admin=shell.querySelector(':scope>.toolbar');
  const classSelect=root.querySelector('#class-select');
  const headerClass=make('div','header-class');headerClass.append(classSelect);header.insertBefore(headerClass,header.lastElementChild);
  const adminMenu=make('details','class-admin');adminMenu.append(make('summary','','名册管理'),admin);rail.append(adminMenu);
  const content=make('div','class-content');
  for(const child of [...shell.children])if(child!==header)content.append(child);
  shell.append(rail,content);
  root.querySelector('.eyebrow').remove();header.querySelector('h1').textContent='班级工作区';
  const legend=root.querySelector('#chart-legend');if(legend)legend.textContent='通过 / 尝试';
  const style=make('style','');style.textContent=`
    :host{font:14px/1.65 -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;color:#182536;--line:#dfe5eb;--ink:#182536;--muted:#59697b;--blue:#275ad6;--surface:#fff;--bg:#f6f8fa}
    .overlay{background:var(--bg)}.shell{display:grid;grid-template-columns:244px minmax(0,1fr);grid-template-rows:auto 1fr;max-width:none;min-height:100dvh;margin:0;padding:0}
    .top{grid-column:2;grid-row:1;justify-content:space-between;gap:16px;min-height:88px;margin:0;padding:16px 32px;border-bottom:1px solid var(--line);background:var(--surface)}.top>div:first-child{display:flex;align-items:center;gap:12px}.top h1{font-size:20px;margin:0;white-space:nowrap}.top .tag{background:#f1f4f7;color:var(--muted);font:12px ui-monospace,monospace;border-radius:5px}.header-class{margin-left:auto}.header-class select{max-width:320px}.top [role=status]{flex-basis:100%}
    .class-rail{grid-column:1;grid-row:1/3;position:sticky;top:0;align-self:start;height:100dvh;overflow:auto;padding:28px 16px;border-right:1px solid var(--line);background:var(--surface)}.class-brand{display:flex;align-items:center;gap:12px;margin:0 8px 32px;color:var(--ink);font-size:22px;font-weight:750;letter-spacing:-.8px}.am-nav-icon{width:24px;height:24px;flex:none;color:var(--blue)}.rail-label{margin:0 12px 12px;font-size:12px;color:var(--muted);font-weight:500}
    .class-content{grid-column:2;grid-row:2;min-width:0;padding:24px 32px 48px}.class-content>.message{margin:0 0 16px}.class-content>#workspace>.panel:first-child{margin-top:0}
    .class-contest-picker.panel{padding:0;margin:0 0 20px;border:0;border-radius:0;box-shadow:none}.class-contest-picker h2{display:none}.class-contest-picker .toolbar,.class-contest-picker .row{display:flex;flex-direction:column;align-items:stretch;gap:10px}.class-contest-picker .row{width:100%}.class-contest-picker .wide{width:100%;min-width:0}.class-contest-picker input{width:100%}.class-contest-picker .row label{display:flex;justify-content:space-between;font-size:12px;color:var(--muted)}.class-contest-picker #contest-title{overflow-wrap:anywhere;font-size:12px;margin:12px 0 0}.class-contest-picker [data-action=export-score]{font-size:13px}
    .class-rail>[role=tablist]{display:flex;flex-direction:column;align-items:stretch;flex-wrap:nowrap;gap:4px;padding:16px 0;border-top:1px solid var(--line);border-radius:0;background:transparent}.class-rail>[role=tablist] button{width:100%;min-height:44px;min-width:0;text-align:left;padding:10px 12px;color:var(--muted);font-weight:500}.class-rail>[role=tablist] button.primary{background:#edf3ff;color:var(--blue);box-shadow:none}
    .class-admin{margin-top:20px;padding-top:16px;border-top:1px solid var(--line)}.class-admin summary{padding:10px 12px;color:var(--muted);cursor:pointer}.class-admin .toolbar,.class-admin .row{display:flex;flex-direction:column;align-items:stretch;gap:8px}.class-admin .toolbar{margin-top:12px}.class-admin .row{width:100%}.class-admin [data-action=check-script-update]{width:100%;margin-top:8px}.class-contest-picker label{white-space:nowrap}.top button{white-space:nowrap}
    .panel{padding:24px;margin:20px 0;border-color:var(--line);border-radius:10px;box-shadow:none}.cards{gap:16px;margin:0 0 20px}.metric{padding:20px;border-color:var(--line);border-radius:10px}.metric strong{margin-top:8px;color:var(--ink);font:600 32px/1.3 ui-monospace,SFMono-Regular,monospace}.muted{color:var(--muted)}.metric .muted{font-size:13px}.problem{border-radius:8px;border-color:var(--line)}.problem small{color:var(--muted)}.chart{grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px}.toolbar{gap:16px;margin-bottom:16px}h2{color:var(--ink);font-size:18px;font-weight:650}h3{color:var(--ink)}
    button{min-height:40px;border-color:#c3ced9;border-radius:7px;color:var(--ink);font-size:14px;transition:background .16s,border-color .16s}button:hover{background:#f0f5ff;border-color:#98b1e5}button.primary{background:var(--blue);border-color:var(--blue);color:#fff}.primary:hover{background:#204bb4}button:disabled{cursor:default;opacity:.5}input,select{min-height:40px;border-color:#b8c4d1;border-radius:7px;color:var(--ink);font-size:14px}input[type=checkbox]{min-height:0}a{color:var(--blue)}th{background:#f8fafb;color:var(--muted);font-size:12px}th,td{border-color:var(--line);padding:13px 12px}.table-wrap{border:1px solid var(--line);border-radius:8px;max-height:640px}.empty{color:var(--muted);padding:48px 24px}.message{background:#edf3ff;color:#284d95;border-radius:7px}.message.error{background:#fff0ed;color:#a33e36}.pager{flex-wrap:wrap}.ac{color:#16765d}.bad{color:#aa3047}.counts span:first-child{color:#275ad6}.bar{background:#edf1f5}.bar i{background:#bacdf6}.bar em{background:var(--blue)}

    :focus-visible{outline:3px solid var(--blue);outline-offset:3px}summary{cursor:pointer}button,a{touch-action:manipulation}
    @media(max-width:1100px){.shell{grid-template-columns:214px minmax(0,1fr)}.top,.class-content{padding:20px 24px}.top{flex-wrap:wrap}.top [data-action=check-script-update]{display:none}.cards{grid-template-columns:repeat(2,minmax(0,1fr))}.header-class{margin-left:0}.header-class select{max-width:260px}}
    @media(max-width:767px){.shell{display:flex;flex-direction:column}.top{order:0;padding:16px;min-height:0;gap:12px}.top>div:first-child{flex:1}.top h1{font-size:18px}.top .tag{display:none}.header-class{order:3;flex-basis:100%}.header-class select{width:100%;max-width:none}.top>button{padding:8px 10px}.class-rail{order:1;position:static;height:auto;width:100%;padding:16px;border:0;border-bottom:1px solid var(--line)}.class-brand,.rail-label{display:none}.class-contest-picker.panel{margin:0 0 12px}.class-contest-picker .row{display:grid;grid-template-columns:1fr 1fr;gap:8px}.class-contest-picker .row #contest-select,.class-contest-picker .row #contest-id{grid-column:1/-1}.class-contest-picker #contest-title:empty{display:none}.class-rail>[role=tablist]{flex-direction:row;padding:12px 0 0;gap:8px}.class-rail>[role=tablist] button{flex:1;text-align:center;white-space:nowrap;padding:8px}.class-admin{margin-top:12px;padding-top:8px}.class-admin .row{display:flex;flex-direction:row;flex-wrap:wrap}.class-content{order:2;padding:20px 16px}.panel{padding:16px;margin:16px 0}.metric{padding:16px}.metric strong{font-size:28px}.toolbar>.row{width:100%}.toolbar input,.toolbar select{min-width:0;max-width:100%}.table-wrap{max-height:65vh}.chart{grid-template-columns:repeat(2,minmax(0,1fr))}.problem{padding:12px}.counts{flex-wrap:wrap}.problem-review-page{padding:12px}}
    @media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important;scroll-behavior:auto!important}}
  `;root.append(style);
}
