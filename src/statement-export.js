function downloadBlob(blob, filename) {
  const link = document.createElement('a'), url = URL.createObjectURL(blob);
  link.href = url; link.download = filename;
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function imageType(bytes) {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  return '';
}

async function canvasPng(bytes, type) {
  const blob = new Blob([bytes], {type: type || 'application/octet-stream'});
  let source;
  try {
    source = await createImageBitmap(blob);
  } catch {
    throw new Error('图片无法解码，可能是损坏的图片或当前浏览器不支持该格式。');
  }
  const scale = Math.min(1, 2000 / Math.max(source.width, source.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(source.width * scale));
  canvas.height = Math.max(1, Math.round(source.height * scale));
  const context = canvas.getContext('2d');
  context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  source.close?.();
  const result = await new Promise((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('图片转换失败。')), 'image/png'));
  return {bytes: new Uint8Array(await result.arrayBuffer()), contentType: 'image/png'};
}

function decodeDataUrl(url) {
  const match = /^data:([^;,]*)?((?:;[^,]*)*?),(.*)$/is.exec(url);
  if (!match) throw new Error('图片 data URL 格式不正确。');
  const contentType = (match[1] || 'application/octet-stream').trim();
  const metadata = match[2] || '', body = match[3];
  if (/;base64/i.test(metadata)) {
    const binary = atob(body.replace(/\s+/g, ''));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return {bytes, contentType};
  }
  return {bytes: new TextEncoder().encode(decodeURIComponent(body)), contentType};
}

async function fetchStatementImage(rawUrl, {signal} = {}) {
  const url = String(rawUrl || '').trim();
  if (!url) throw new Error('题面图片缺少地址。');
  if (/^data:/i.test(url)) {
    const result = decodeDataUrl(url);
    if (result.bytes.length > 10 * 1024 * 1024) throw new Error('图片超过 10 MB。');
    return result.contentType === 'image/png' || result.contentType === 'image/jpeg'
      ? result : canvasPng(result.bytes, result.contentType);
  }
  let target;
  try { target = new URL(url, location.href); } catch { throw new Error(`图片地址无效：${url}`); }
  if (!['http:', 'https:'].includes(target.protocol)) throw new Error(`不支持的图片协议：${url}`);
  if (target.origin === location.origin) target.pathname = accodingPath(target.pathname);
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 20000);
  const abort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', abort, {once: true});
  }
  try {
    const response = await fetch(target.href, {credentials: 'same-origin', cache: 'no-store', signal: controller.signal});
    if (!response.ok) throw new Error(`图片读取失败（HTTP ${response.status}）：${url}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (!bytes.length) throw new Error(`图片为空：${url}`);
    if (bytes.length > 10 * 1024 * 1024) throw new Error(`图片超过 10 MB：${url}`);
    const declared = (response.headers.get('content-type') || '').split(';', 1)[0].trim().toLowerCase();
    const detected = imageType(bytes);
    if (detected === 'image/png' || detected === 'image/jpeg') return {bytes, contentType: detected};
    if (declared === 'image/svg+xml' || declared === 'image/gif' || declared === 'image/webp' || declared.startsWith('image/')) {
      return canvasPng(bytes, declared);
    }
    throw new Error(`不支持的图片格式（${declared || '未知'}）：${url}`);
  } catch (error) {
    if (error.name === 'AbortError') throw new DOMException('已取消导出。', 'AbortError');
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}

function createExportDialog() {
  const dialog = document.createElement('dialog');
  dialog.style.cssText = 'width:min(680px,94vw);max-height:86vh;padding:0;border:1px solid #ccd7e6;border-radius:12px;background:#fff;color:#20314a';
  const heading = document.createElement('h2');
  heading.textContent = '导出 Statement PDF';
  heading.style.cssText = 'margin:0;padding:18px 22px;font-size:18px;border-bottom:1px solid #e3eaf3';
  const body = document.createElement('div');
  body.style.cssText = 'padding:18px 22px;line-height:1.7';
  const status = document.createElement('p');
  status.textContent = '正在读取本场比赛题面…';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  const progress = document.createElement('progress');
  progress.max = 1; progress.value = 0;
  progress.style.cssText = 'display:none;width:100%;height:10px;margin:12px 0';
  const download = document.createElement('button');
  download.type = 'button'; download.textContent = '下载 PDF'; download.disabled = true;
  download.style.cssText = 'padding:8px 14px;margin:4px 8px 0 0;border:1px solid #2458d3;border-radius:7px;background:#2458d3;color:#fff;cursor:pointer';
  const close = document.createElement('button');
  close.type = 'button'; close.textContent = '关闭';
  close.style.cssText = 'padding:8px 14px;margin-top:4px;border:1px solid #cbd7e6;border-radius:7px;background:#fff;color:#334862;cursor:pointer';
  const actions = document.createElement('div');
  actions.append(download, close);
  body.append(status, progress, actions);
  dialog.append(heading, body);
  close.onclick = () => dialog.close();
  return {dialog, status, progress, download};
}

function mountStatementExport(Core) {
  const root = document.getElementById('am-upsolve-activation')?.shadowRoot;
  if (!root) return;
  const action = document.createElement('button');
  action.type = 'button'; action.className = 'statement-export'; action.textContent = '导出 Statement';
  action.title = '按 OI 题面模板排版并直接下载 PDF';
  root.querySelector('.launch').append(action);
  const status = document.createElement('span');
  status.className = 'hint';
  status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  root.querySelector('.launch').append(status);
  const id = () => ACCODING_APP_PATHNAME.match(/^\/contest\/(\d+)(?:\/(?:index)?)?$/)?.[1] || location.hash.match(/^#\/(\d+)(?:\/|$)/)?.[1];
  action.addEventListener('click', async () => {
    if (action.disabled) return;
    const progressText = text => { status.textContent = text; action.title = text; };
    const current = id();
    if (!current) { progressText('无法识别当前比赛。'); return; }
    const {dialog, status: dialogStatus, progress, download} = createExportDialog();
    document.body.append(dialog);
    let project = null;
    const aborter = new AbortController();
    const cleanup = () => {
      aborter.abort();
      dialog.remove();
    };
    dialog.addEventListener('close', cleanup, {once: true});
    dialog.showModal();
    action.disabled = true; action.setAttribute('aria-busy', 'true');
    const setStatus = (text, value = null) => {
      dialogStatus.textContent = text;
      progressText(text);
      if (value != null) { progress.value = value; progress.style.display = 'block'; }
    };
    try {
      setStatus('正在读取本场比赛题面…');
      const value = await createUpsolveActivationIO().readContest(current);
      if (current !== id()) throw new Error('已切换比赛，导出已停止。');
      const statement = createStatementCore(Core).compile(value, current);
      setStatus('正在转换题面…');
      project = await createStatementPdf(statement, {
        signal: aborter.signal,
        onProgress: text => setStatus(text)
      });
      if (current !== id()) throw new Error('已切换比赛，导出已停止。');
      if (aborter.signal.aborted) throw new DOMException('已取消导出。', 'AbortError');
      download.disabled = false;
      download.onclick = () => downloadBlob(project.blob, project.filename);
      setStatus(`已生成 ${project.filename}。`);
      progress.value = 1;
      download.click();
    } catch (error) {
      if (error.name !== 'AbortError') setStatus(`导出失败：${error.message}`);
    } finally {
      action.disabled = false; action.removeAttribute('aria-busy');
    }
  });
}
