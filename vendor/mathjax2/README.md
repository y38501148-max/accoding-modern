# MathJax 2.7.7 SVG bundle

Source: https://registry.npmjs.org/mathjax/-/mathjax-2.7.7.tgz

Archive SHA-256: `f0054315d40f7288b2373b23520677fd1132a405702dfca05ee6ebe5cd0a8677`

Unmodified upstream files, concatenated in this order:

- `MathJax.js`
- A generated `MathJax.Ajax.Preloading(...)` declaration for the combined configuration
- `config/TeX-AMS_SVG-full.js`
- SVG TeX font metadata, then all SVG TeX glyph tables, SVG autoload modules and the TeX extensions AMScd, bbox, boldsymbol, cancel, color, enclose, mathchoice, newcommand, unicode and verb (sorted by path; components already in the combined configuration excluded)

- A preloading declaration and all MathML operator tables (`jax/element/mml/optable/*.js`, sorted by path), to keep operator lookup offline as well

Bundled to render formulas through the VPN without CDN scripts or web fonts. Apache-2.0; see LICENSE.
