/**
 * A PROJECT LINKED TO A FILE: what the linked file's text means for the open project.
 * The file is the user's (often in their own git repo), so it is read like an import: its own C code waits for
 * “allow” (firmware.customReview) when it changed since NAVI's saved copy, whatever the file says about review.
 */
import { hasCustomCode } from '../qmk/customCode';
import { sameContent } from './diff';
import type { Project } from './types';
import { parseProjectText, serializeProject, type ValidationIssue } from './validate';

/**
 * The text written to a linked file, ending with a newline. Field order is the validator's (a project built in memory
 * may order fields differently), so the same project always gives the same text and git diffs show only real edits.
 */
export function linkedFileText(project: Project): string {
  const text = serializeProject(project);
  const canonical = parseProjectText(text).project;
  return `${canonical ? serializeProject(canonical) : text}\n`;
}

const customOf = (p: Project | null) => JSON.stringify(p?.firmware.custom ?? {});

/**
 * The project from a linked file's text, as the project `id`. `saved` is NAVI's saved copy (null for a project
 * opened from the file just now): own code that differs from it must be reviewed; a review still pending there stays.
 */
export function projectFromLinkedFile(text: string, id: string, saved: Project | null): { project: Project | null; issues: ValidationIssue[] } {
  const { project, issues } = parseProjectText(text);
  if (!project) return { project: null, issues };
  const hasCode = hasCustomCode(project.firmware.custom);
  const changedCode = customOf(project) !== customOf(saved);
  const review = hasCode && (changedCode || !saved || !!saved.firmware.customReview);
  return { project: { ...project, id, firmware: { ...project.firmware, customReview: review || undefined } }, issues };
}

/** The file holds what NAVI has saved (formatting and updatedAt aside). */
export function fileMatchesSaved(file: Project, saved: Project | null): boolean {
  return !!saved && sameContent(file, saved);
}
