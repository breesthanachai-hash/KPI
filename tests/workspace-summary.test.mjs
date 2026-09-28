import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

test('daily badge counts pending work beyond 500 and isolates employee scope', () => {
  const route = readFileSync(new URL('../app/api/daily-assignments/route.ts', import.meta.url), 'utf8');
  const query = route.match(/db\.prepare\("(SELECT COUNT\(\*\) AS pending[^"\n]+)"\)/)?.[1];
  assert.ok(query);
  const db = new DatabaseSync(':memory:');
  try {
    db.exec("CREATE TABLE employees(id TEXT); CREATE TABLE daily_assignments(employee_id TEXT,submitted_at TEXT); INSERT INTO employees VALUES ('one'),('two');");
    const insert = db.prepare('INSERT INTO daily_assignments VALUES (?,?)');
    for (let i=0;i<501;i++) insert.run('one',null);
    insert.run('one','2026-09-28'); insert.run('two',null);
    assert.equal(db.prepare(query).get(1,'').pending,502);
    assert.equal(db.prepare(query).get(0,'one').pending,501);
    assert.equal(db.prepare(query).get(0,'two').pending,1);
    assert.equal(db.prepare(query).get(0,'').pending,0);
  } finally { db.close(); }
});
