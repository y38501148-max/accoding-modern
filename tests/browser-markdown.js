// Run in an isolated, authenticated problem edit page after installing the userscript.
// All edits are temporary; submit is replaced locally before testing the site's save path.
(async () => {
  const field = document.querySelector('#problem-description');
  const form = field.form, original = field.value;
  const oldConfirm = window.confirm, ownSubmit = Object.getOwnPropertyDescriptor(form, 'submit');
  const preview = document.querySelector('#preview');
  const checks = [];
  const check = (name, ok) => { if (!ok) throw new Error(name); checks.push(name); };
  const sample = '# 兼容验证\n\n普通 $a_i+b_j$，OJ $a\\_i+b\\_j$，括号 \\(c_k\\)。\n\n\\[x_1+y_2\\]\n\n'
    + String.raw`集合 $\{a_i\}$，矩阵 $$\begin{matrix}a_i & b_j \\ c_k & d_l\end{matrix}$$。` + '\n\n'
    + '```c\nint a_b = 0;\n    a_b++;\n```\n\n`$leave_me$`';
  const expected = '# 兼容验证\n\n普通 $a\\_i+b\\_j$，OJ $a\\_i+b\\_j$，括号 $c\\_k$。\n\n$$x\\_1+y\\_2$$\n\n'
    + String.raw`集合 $\\{a\_i\\}$，矩阵 $$\\begin{matrix}a\_i & b\_j \\\\ c\_k & d\_l\\end{matrix}$$。` + '\n\n'
    + '    int a_b = 0;\n        a_b++;\n\n\n`$leave_me$`';
  try {
    field.value = sample;
    field.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(resolve => MathJax.Hub.Queue(resolve));
    check('MathJax receives intact subscripts, set braces and matrix row separators', JSON.stringify(MathJax.Hub.getAllJax(preview).map(j => j.originalText)) === JSON.stringify(['a_i+b_j','a_i+b_j','c_k','x_1+y_2',String.raw`\{a_i\}`,String.raw`\begin{matrix}a_i & b_j \\ c_k & d_l\end{matrix}`]));
    check('set and matrix previews render without TeX errors', !preview.querySelector('.MathJax_Error,.merror,[data-mjx-error]'));
    check('code preview retains original indentation and identifiers', preview.querySelector('pre code')?.textContent === 'int a_b = 0;\n    a_b++;');
    const data = new FormData(form);
    check('outgoing description uses OJ format', data.get('description') === expected);
    check('SPJ field is not converted', data.get('special_judge') === document.querySelector('#makefile').value);
    check('serializing leaves the draft unchanged', field.value === sample);
    check('repeated serialization does not add escaping layers', new FormData(form).get('description') === expected);
    document.querySelector('#am-markdown-tools [data-show]').click();
    check('save format viewer matches serialization', document.querySelector('#am-markdown-tools textarea').value === expected);
    let submitted = null;
    // jQuery invokes elem.submit() after the site's original confirmation succeeds.
    Object.defineProperty(form, 'submit', { configurable: true, value() { submitted = new FormData(form).get('description'); } });
    window.confirm = () => false;
    window.jQuery(form).submit();
    check('cancelling original confirmation neither submits nor changes draft', submitted === null && field.value === sample);
    window.confirm = () => true;
    window.jQuery(form).submit();
    check('original jQuery submit path serializes OJ content', submitted === expected && field.value === sample);
    return { passed: checks.length, checks, networkWrites: 0 };
  } finally {
    window.confirm = oldConfirm;
    if (ownSubmit) Object.defineProperty(form, 'submit', ownSubmit); else delete form.submit;
    field.value = original;
    field.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('#am-markdown-tools details').open = false;
  }
})()
