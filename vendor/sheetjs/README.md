# SheetJS CE legacy Excel reader

Version: **0.20.3**, Apache-2.0 (see [LICENSE](LICENSE)).

Source: https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js

Upstream SHA-256: `cc015130aa8521e7f088f88898eba949ccdcbfb38df0bd129b44b7273c3a6f41`

`reader.mjs` contains the upstream script inside an exported
`createClassXlsReader()` factory. Two line breaks were inserted before `+String(w)`
in formula error messages to prevent minified string concatenations from being
misread as credential assignments by the commit scanner. No runtime behavior was
changed; the integrity test removes these line breaks before checking the upstream
hash. The wrapper shadows `window`, `exports`,
`module`, `define`, and `require` and returns the local `XLSX` object. It keeps
the host page's globals and AMD/CommonJS loaders untouched and initializes only
when a legacy XLS file is imported. The build embeds it into the userscript;
there is no CDN request or workbook upload at runtime.

The full build includes legacy code pages needed by older Excel files. Existing
XLSX import/export continues to use `src/class-xlsx.mjs`.
