import { describe, expect, it } from 'vitest';
import { createBlankProject } from './factory';
import { fileMatchesSaved, linkedFileText, projectFromLinkedFile } from './link';
import type { Project } from './types';

const built = createBlankProject('Test board', 2, 3, false);
/** As NAVI holds a project it opened (through the validator). */
const base = projectFromLinkedFile(linkedFileText(built), built.id, built).project!;
const withCode = (p: Project, code: string | undefined, review?: boolean): Project => ({
  ...p,
  firmware: { ...p.firmware, custom: code === undefined ? undefined : { 'keymap.c': code }, customReview: review },
});

describe('linked file', () => {
  it('is written the same way every time, ending with a newline', () => {
    const text = linkedFileText(built);
    expect(text.endsWith('}\n')).toBe(true);
    expect(linkedFileText(base)).toBe(text);
    expect(linkedFileText(projectFromLinkedFile(text, base.id, base).project!)).toBe(text);
  });

  it('takes the open project id, not the one in the file', () => {
    const { project } = projectFromLinkedFile(linkedFileText({ ...base, id: 'prj_other' }), base.id, base);
    expect(project?.id).toBe(base.id);
  });

  it('a broken file gives issues and no project', () => {
    const { project, issues } = projectFromLinkedFile('{ nope', base.id, base);
    expect(project).toBeNull();
    expect(issues[0]?.level).toBe('error');
  });

  it('own code opened from a file for the first time waits for “allow”', () => {
    const { project } = projectFromLinkedFile(linkedFileText(withCode(base, 'void x(void) {}')), base.id, null);
    expect(project?.firmware.customReview).toBe(true);
  });

  it('own code changed outside NAVI waits for “allow”, whatever the file says', () => {
    const saved = withCode(base, 'void x(void) {}');
    const { project } = projectFromLinkedFile(linkedFileText(withCode(base, 'void y(void) {}', false)), base.id, saved);
    expect(project?.firmware.customReview).toBe(true);
  });

  it('unchanged own code that was allowed stays allowed; a pending review stays pending', () => {
    const code = 'void x(void) {}';
    expect(projectFromLinkedFile(linkedFileText(withCode(base, code)), base.id, withCode(base, code)).project?.firmware.customReview).toBeUndefined();
    expect(projectFromLinkedFile(linkedFileText(withCode(base, code)), base.id, withCode(base, code, true)).project?.firmware.customReview).toBe(true);
  });

  it('no own code means nothing to review', () => {
    expect(projectFromLinkedFile(linkedFileText(base), base.id, null).project?.firmware.customReview).toBeUndefined();
  });

  it('matches the saved copy regardless of updatedAt', () => {
    const file = projectFromLinkedFile(linkedFileText({ ...base, updatedAt: '2001-01-01T00:00:00.000Z' }), base.id, base).project!;
    expect(fileMatchesSaved(file, base)).toBe(true);
    expect(fileMatchesSaved({ ...file, name: 'Renamed' }, base)).toBe(false);
    expect(fileMatchesSaved(file, null)).toBe(false);
  });
});
