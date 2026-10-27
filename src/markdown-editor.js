function mountMarkdownEditor(Core) {
  const input = document.querySelector('textarea#problem-description[name="description"]');
  const preview = document.getElementById('preview');
  if (!input?.form || !preview || document.getElementById('am-markdown-tools')) return;
  const form = input.form;
  // Decode saved formulas once; all preview/copy/save paths then encode the draft once.
  const loaded = input.value;
  input.defaultValue = Core.fromOJ(input.defaultValue);
  input.value = Core.fromOJ(loaded);
  const toolbar = document.createElement('div');
  toolbar.id = 'am-markdown-tools';
  toolbar.innerHTML = `<div class="am-md-actions"><strong>Markdown 兼容编辑</strong><button type="button" data-copy="common">复制通用 Markdown</button><button type="button" data-copy="oj">复制 OJ 格式</button><button type="button" data-show>查看保存格式</button></div><p>支持公式反斜杠、普通／转义下标、两种公式定界符及围栏代码。载入时还原公式转义，保存时自动适配 OJ。</p><span role="status" aria-live="polite"></span><details><summary>将保存的题面源码</summary><textarea readonly aria-label="将保存的题面源码" spellcheck="false"></textarea></details>`;
  const style = document.createElement('style');
  style.textContent = `#am-markdown-tools{margin:12px 0;padding:14px 16px;border:1px solid #dbe5ef;background:#f5f8fc;border-radius:10px;color:#344258;font:13px/1.6 -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif}#am-markdown-tools .am-md-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}#am-markdown-tools strong{margin-right:auto}#am-markdown-tools button{border:1px solid #cbd7e6;background:#fff;color:#315787;border-radius:6px;padding:6px 10px;cursor:pointer;font:inherit}#am-markdown-tools p{margin:8px 0 0}#am-markdown-tools [role=status]{color:#386749}#am-markdown-tools details:not([open]){display:none}#am-markdown-tools details{margin-top:10px}#am-markdown-tools textarea{display:block;width:100%!important;min-height:220px;font:13px/1.65 ui-monospace,monospace;white-space:pre;overflow:auto;padding:12px;border:1px solid #cbd7e6;border-radius:6px;background:white;color:#243249}#am-markdown-tools button:focus-visible{outline:2px solid #377ce2;outline-offset:2px}`;
  document.head.append(style);
  const editRow = input.closest('.problem-edit-left')?.parentElement;
  (editRow || input).before(toolbar);
  const status = toolbar.querySelector('[role=status]');
  const details = toolbar.querySelector('details');
  const saved = details.querySelector('textarea');
  const setSaved = value => { saved.value = value; saved.setAttribute('_value', value); };
  const updateSaved = () => { if (details.open) setSaved(Core.toOJ(input.value)); };
  toolbar.querySelector('[data-show]').addEventListener('click', () => { details.open = !details.open; updateSaved(); });
  for (const button of toolbar.querySelectorAll('[data-copy]')) {
    button.addEventListener('click', async () => {
      const value = button.dataset.copy === 'oj' ? Core.toOJ(input.value) : Core.toCommon(input.value);
      try {
        await navigator.clipboard.writeText(value);
        status.textContent = button.dataset.copy === 'oj' ? '已复制 OJ 格式。' : '已复制通用 Markdown。';
      } catch {
        details.open = true; setSaved(value); saved.focus(); saved.select();
        status.textContent = '浏览器未允许剪贴板写入，已选中源码，可按 Ctrl/Cmd+C 复制。';
      }
    });
  }
  // FormData runs for native submission, jQuery .submit(), and new FormData(form).
  // It changes only the outgoing description, so cancelled confirmation keeps the draft intact.
  form.addEventListener('formdata', event => {
    if (!input.disabled && input.form === form && event.formData.has(input.name)) {
      event.formData.set(input.name, Core.toOJ(input.value));
    }
  });
  function render() {
    if (!pageWindow.markdown?.toHTML) return;
    preview.innerHTML = pageWindow.markdown.toHTML(Core.toOJ(input.value), 'Maruku');
    accodingMath.typeset([preview]);
    updateSaved();
  }
  // Preserve the site's other editors and oninput handler; only this description uses conversion.
  const original = pageWindow.Editor;
  if (typeof original === 'function') {
    pageWindow.Editor = function(inputId, previewId) {
      if (inputId !== input.id || previewId !== preview.id) return original.apply(this, arguments);
      input.editor = { update: render };
      render();
    };
  } else input.addEventListener('input', render);
  input.addEventListener('input', updateSaved);
  form.addEventListener('reset', () => setTimeout(render, 0));
  render();
}
