/**
 * Help for the Patients panel. RadarOpus's help button opens its help outside the program window, so
 * the panel's ? leaves the workspace as it is and shows this page in a new browser tab.
 */

const PAGE = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>Help: list of patients</title>
<style>
  :root { color-scheme: light dark; --bg: #f4dfd8; --text: #222; --head: #8c3913; --rule: #cd9481; --kbd: #ffffff; }
  @media (prefers-color-scheme: dark) { :root { --bg: #2c2425; --text: #e3e6eb; --head: #e09a78; --rule: #6e4a3e; --kbd: #1d2127; } }
  body { margin: 0; padding: 24px 32px 40px; max-width: 760px; background: var(--bg); color: var(--text);
    font: 13px/1.5 Verdana, Geneva, "DejaVu Sans", sans-serif; }
  h1 { font-size: 18px; color: var(--head); margin: 0 0 12px; }
  h2 { font-size: 14px; color: var(--head); margin: 22px 0 6px; border-bottom: 2px solid var(--rule); padding-bottom: 2px; }
  dt { font-weight: bold; margin-top: 8px; }
  dd { margin: 2px 0 0 18px; }
  kbd { font: 12px Verdana, Geneva, sans-serif; background: var(--kbd); border: 1px solid var(--rule); border-radius: 3px; padding: 0 4px; }
  table { border-collapse: collapse; }
  td { padding: 2px 16px 2px 0; vertical-align: top; }
</style></head><body>
<h1>The list of patients</h1>
<p>The list of patients is shown in the left pane with the <b>Patients</b> toolbar button or View › Open list of patients.
It finds patients, shows the selected patient on a card and opens a patient's case.</p>

<h2>Looking for a patient</h2>
<dl>
  <dt>Look for patient</dt>
  <dd>Type part of a name, a date or another administrative value. The list shows the patients that match in any of the
  fields ticked in the search options.</dd>
  <dt>Refresh</dt>
  <dd>Clears the search text and runs the search again with the current choice of humans or animals and the Clificol
  filter.</dd>
  <dt>Search options (gear)</dt>
  <dd>Shows or hides the administrative fields to search in. <b>Select all</b> ticks or clears every field. The ticked
  fields are also the columns of the list.</dd>
</dl>

<h2>The list</h2>
<dl>
  <dt>Selecting and opening</dt>
  <dd>Click a patient to show it on the card. Double-click it, or press <kbd>Enter</kbd>, to open the patient's case.</dd>
  <dt>Humans and animals</dt>
  <dd>The two radio buttons choose between human patients and animal patients. The choice applies when you click Refresh.</dd>
  <dt>Case sent to Clificol</dt>
  <dd>When ticked, Refresh lists only the cases that were sent to Clificol.</dd>
  <dt>Group</dt>
  <dd>Shows only the patients of one group. <b>All</b> shows every patient.</dd>
  <dt>Found</dt>
  <dd>The number of patients listed, and the number of patients of the chosen kind on file.</dd>
</dl>

<h2>The patient card</h2>
<dl>
  <dt>Code, Age, Consultations</dt>
  <dd>The patient's code, the age in years, months and days, and the number of consultations.</dd>
  <dt>Last consultation and prescribed</dt>
  <dd>The date of the consultation and the remedies prescribed in it. The arrows under the picture step to the previous
  and the next consultation.</dd>
  <dt>Picture</dt>
  <dd><b>Choose another picture</b> puts a picture of the patient on the card; <b>Delete this picture</b> removes it.</dd>
  <dt>Next contact</dt>
  <dd>A note of when to contact the patient next. It is saved when you press <kbd>Enter</kbd> or leave the field.</dd>
</dl>

<h2>Keyboard</h2>
<table>
  <tr><td><kbd>↓</kbd> in Look for patient</td><td>Go to the first patient in the list</td></tr>
  <tr><td><kbd>Esc</kbd> in Look for patient</td><td>Clear the search text</td></tr>
  <tr><td><kbd>↑</kbd> <kbd>↓</kbd> <kbd>Page Up</kbd> <kbd>Page Down</kbd> <kbd>Home</kbd> <kbd>End</kbd></td><td>Move through the list</td></tr>
  <tr><td><kbd>Enter</kbd></td><td>Open the selected patient's case</td></tr>
  <tr><td><kbd>Delete</kbd></td><td>Delete the selected patient (asks first)</td></tr>
  <tr><td><kbd>Shift</kbd>+<kbd>F10</kbd> or the context menu key</td><td>Open the patient's menu</td></tr>
  <tr><td>Typing a letter in the list</td><td>Continue in Look for patient</td></tr>
</table>
</body></html>`

/** Open the Patients panel help in a new browser tab. */
export function openPanelHelp(): void {
  const url = URL.createObjectURL(new Blob([PAGE], { type: 'text/html' }))
  window.open(url, '_blank', 'noopener')
  // the new tab has loaded the page long before this
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
