import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { dailyTemplates, generateDailyAssignments, ensureDailyAssignments } from '../lib/daily-assignments.ts';

test('accounting uses one combined template for both legacy bindings',async()=>{
  const {db,sql}=fixture(); await ensureDailyAssignments(db);
  assert.equal(dailyTemplates.filter(t=>t.name==='บัญชี').length,1);
  sql.exec("INSERT INTO daily_assignment_bindings VALUES ('neer','e1',1,'2026-09-26'),('toey','e1',1,'2026-09-26')");
  await generateDailyAssignments(db,new Date('2026-09-26T02:00:00Z'));
  const rows=sql.prepare('SELECT * FROM daily_assignments').all();
  assert.equal(rows.length,1);
  assert.equal(rows[0].template_id,'toey');
  assert.equal(JSON.parse(rows[0].tasks_json).length,4);
  sql.close();
});

function fixture() {
  const sql = new DatabaseSync(':memory:');
  sql.exec("CREATE TABLE employees(id TEXT, status TEXT); CREATE TABLE user_accounts(employee_id TEXT,status TEXT); INSERT INTO employees VALUES ('e1','active'); INSERT INTO user_accounts VALUES ('e1','active');");
  const db = { prepare(query) {
    let args=[];
    return { bind(...values){args=values;return this;},async run(){return sql.prepare(query).run(...args);},async all(){return {results:sql.prepare(query).all(...args)};} };
  },async batch(statements){return Promise.all(statements.map(s=>s.run()));} };
  return {db,sql};
}
test('unbound employees receive no automatic assignments',async()=>{
  const {db,sql}=fixture();
  await generateDailyAssignments(db,new Date('2026-09-26T02:00:00Z'));
  assert.equal(sql.prepare('SELECT count(*) AS n FROM daily_assignments').get().n,0);
  sql.close();
});
test('9am Bangkok gate, Sunday exclusion, catch-up and duplicate prevention',async()=>{
  const {db,sql}=fixture(); await ensureDailyAssignments(db);
  sql.exec("INSERT INTO daily_assignment_bindings VALUES ('boss','e1',1,'2026-09-26')");
  await generateDailyAssignments(db,new Date('2026-09-26T01:59:59Z'));
  assert.equal(sql.prepare('SELECT count(*) AS n FROM daily_assignments').get().n,0);
  await generateDailyAssignments(db,new Date('2026-09-28T02:00:00Z'));
  await generateDailyAssignments(db,new Date('2026-09-28T02:00:00Z'));
  assert.deepEqual(sql.prepare('SELECT day FROM daily_assignments ORDER BY day').all().map(r=>r.day),['2026-09-26','2026-09-28']);
  sql.close();
});
test('paused binding does not create work',async()=>{
  const {db,sql}=fixture(); await ensureDailyAssignments(db);
  sql.exec("INSERT INTO daily_assignment_bindings VALUES ('tam','e1',0,'2026-09-26')");
  await generateDailyAssignments(db,new Date('2026-09-28T02:00:00Z'));
  assert.equal(sql.prepare('SELECT count(*) AS n FROM daily_assignments').get().n,0);
  sql.close();
});
test('legacy editor bindings share one daily assignment and preserve existing evidence',async()=>{
  const {db,sql}=fixture(); await ensureDailyAssignments(db);
  sql.exec("INSERT INTO daily_assignment_bindings VALUES ('tam','e1',1,'2026-09-26'),('boss','e1',1,'2026-09-26'); INSERT INTO daily_assignments VALUES ('old','tam','e1','2026-09-26','old title','[]','2026-09-26T08:00:00Z','{\"note\":\"original\"}')");
  await generateDailyAssignments(db,new Date('2026-09-28T02:00:00Z'));
  await generateDailyAssignments(db,new Date('2026-09-28T02:00:00Z'));
  assert.equal(sql.prepare('SELECT count(*) AS n FROM daily_assignments').get().n,2);
  assert.equal(sql.prepare("SELECT evidence_json FROM daily_assignments WHERE id='old'").get().evidence_json,'{"note":"original"}');
  assert.equal(sql.prepare("SELECT template_id FROM daily_assignments WHERE day='2026-09-28'").get().template_id,'boss');
  assert.equal(sql.prepare("SELECT next_day FROM daily_assignment_bindings WHERE template_id='tam'").get().next_day,'2026-09-29');
  sql.close();
});
