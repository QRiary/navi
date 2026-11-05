/**
 * RIGHT-CLICK MENU: Cut / Copy / Paste / Select all, for text fields and for selected text; nothing elsewhere.
 * Items are enabled per Chromium's editFlags; labels in the interface language (the renderer reports it: uiState).
 * The keyboard drawing blocks `contextmenu` itself (right drag pans), so it never gets here.
 */

const LABELS = {
  en: { cut: 'Cut', copy: 'Copy', paste: 'Paste', selectAll: 'Select all' },
  ru: { cut: 'Вырезать', copy: 'Копировать', paste: 'Вставить', selectAll: 'Выделить всё' },
};

/** The menu template for a `context-menu` event's params, or null when no menu is shown. */
function contextMenuTemplate(params, language) {
  const editable = Boolean(params?.isEditable);
  const selected = typeof params?.selectionText === 'string' && params.selectionText.length > 0;
  if (!editable && !selected) return null;
  const text = LABELS[language] ?? LABELS.en;
  const flags = params.editFlags ?? {};
  return [
    { role: 'cut', label: text.cut, enabled: Boolean(flags.canCut) },
    { role: 'copy', label: text.copy, enabled: Boolean(flags.canCopy) },
    { role: 'paste', label: text.paste, enabled: Boolean(flags.canPaste) },
    { type: 'separator' },
    { role: 'selectAll', label: text.selectAll, enabled: Boolean(flags.canSelectAll) },
  ];
}

/** Shows the menu on right-click in this window's page. */
function attachContextMenu(win, Menu, getLanguage) {
  win.webContents.on('context-menu', (_event, params) => {
    const template = contextMenuTemplate(params, getLanguage());
    if (template) Menu.buildFromTemplate(template).popup({ window: win });
  });
}

module.exports = { contextMenuTemplate, attachContextMenu };
