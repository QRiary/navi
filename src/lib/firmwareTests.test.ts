// Running the firmware tests (firmware.runTests): the project field and why the tick / button can't be used.
import { describe, expect, it } from 'vitest';
import { createDilemmaProject } from '../core/project/factory';
import { migrateProject } from '../core/project/migrate';
import { serializeProject, validateProject } from '../core/project/validate';
import { PROJECT_SCHEMA_VERSION, type Project } from '../core/project/types';
import { testsBlocker, testsResultDetail, testsResultSentence } from './firmwareTests';

const wsl = { kind: 'wsl' as const, path: 'QMK' };
const with_ = (f: Partial<Project['firmware']>): Project => {
  const p = createDilemmaProject();
  return { ...p, firmware: { ...p.firmware, ...f } };
};

describe('firmware tests', () => {
  it('schema 17: a format 16 file opens with the tick off; validate keeps it', () => {
    const p = createDilemmaProject();
    expect(p.firmware.runTests).toBe(false);
    const v16 = JSON.parse(serializeProject(p));
    v16.schemaVersion = 16;
    delete v16.firmware.runTests;
    expect(migrateProject(v16)).toMatchObject({ from: 16, data: { schemaVersion: PROJECT_SCHEMA_VERSION, firmware: { runTests: false } } });
    expect(validateProject(v16).project?.firmware.runTests).toBe(false);
    const on = JSON.parse(serializeProject(with_({ runTests: true })));
    expect(validateProject(on).project?.firmware.runTests).toBe(true);
    expect(PROJECT_SCHEMA_VERSION).toBeGreaterThanOrEqual(17);
  });

  it('blocked without “Write firmware tests”, on MSYS or qmk on Windows’ PATH, and while own code waits for “allow”', () => {
    expect(testsBlocker(with_({ tests: true }), wsl, true)).toBeNull();
    expect(testsBlocker(with_({ tests: true }), { kind: 'path', path: 'qmk' }, false)).toBeNull();
    expect(testsBlocker(with_({ tests: false }), wsl, true)).toMatch(/Write firmware tests/);
    expect(testsBlocker(with_({ tests: true }), { kind: 'msys', path: 'C:/QMK_MSYS' }, true)).toMatch(/WSL or on Linux/);
    expect(testsBlocker(with_({ tests: true }), { kind: 'path', path: 'qmk' }, true)).toMatch(/WSL or on Linux/);
    expect(testsBlocker(with_({ tests: true, customReview: true }), wsl, true)).toMatch(/isn’t allowed yet/);
  });

  it('a result as a sentence and its raw details', () => {
    expect(testsResultSentence({ status: 'pass', passed: 4, failed: 0 })).toMatch(/passed: 4 of 4/);
    const fail = { status: 'fail' as const, passed: 3, failed: 1, failures: ['navi_tests.txt:7: r0c1\n  expected: x\n  actual: b'] };
    expect(testsResultSentence(fail)).toMatch(/1 of 4/);
    expect(testsResultDetail(fail)).toBe(fail.failures[0]);
    expect(testsResultDetail({ status: 'cant-build', errors: ['a', 'b'] })).toBe('a\nb');
  });
});
