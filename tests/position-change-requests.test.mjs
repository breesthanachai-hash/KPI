import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import ts from "typescript";

const root = path.resolve(import.meta.dirname,"..");
const admin = {id:"admin-1",displayName:"Test HR",role:"admin",status:"active"};
const source = file => readFileSync(path.join(root,file),"utf8");
function harness() {
  const sql = new DatabaseSync(":memory:");
  sql.exec("PRAGMA foreign_keys=ON; CREATE TABLE employees(id TEXT PRIMARY KEY,name TEXT,role_id TEXT,status TEXT,updated_at TEXT); CREATE TABLE user_accounts(id TEXT PRIMARY KEY,role TEXT,status TEXT);");
  sql.exec(source("drizzle/0023_complex_ken_ellis.sql"));
  sql.exec(source("drizzle/0026_employee_position_change_requests.sql"));
  const init = source("db/initialize.ts");
  for(const name of ["employee_position_event_insert_guard","employee_position_update_guard","employee_position_event_apply","employee_position_event_update_guard","employee_position_event_delete_guard"]){
    const start=init.indexOf(`d1.prepare(\`CREATE TRIGGER IF NOT EXISTS ${name}`) + "d1.prepare(\`".length;
    sql.exec(init.slice(start,init.indexOf("\`)",start)));
  }
  sql.exec("INSERT INTO user_accounts VALUES ('admin-1','admin','active'),('manager-1','manager','active'),('employee-1','employee','active'); INSERT INTO employees VALUES ('e1','Test Employee','accounting-cashflow','active','2026-09-01T00:00:00.000Z','');");
  for(const name of ["auth_credentials","auth_sessions","auth_events","employee_profiles","hr_profiles"]) sql.exec(`CREATE TABLE ${name}(id TEXT PRIMARY KEY,private_value TEXT); INSERT INTO ${name} VALUES ('fixture','sensitive-fixture-only')`);
  const reads=[];
  let beforeBatch=null;
  const d1 = {
    prepare(query) { reads.push(query);let args=[];return {bind(...values){args=values;return this;},async first(){return sql.prepare(query).get(...args)??null;},async all(){return {results:sql.prepare(query).all(...args)};},async run(){const result=sql.prepare(query).run(...args);return {meta:{changes:Number(result.changes)}};}}; },
    async batch(statements){if(beforeBatch){const hook=beforeBatch;beforeBatch=null;hook();}sql.exec("BEGIN");try{const results=[];for(const statement of statements)results.push(await statement.run());sql.exec("COMMIT");return results;}catch(error){sql.exec("ROLLBACK");throw error;}},
  };
  const cache=new Map();
  const h={sql,d1,reads,actor:admin,gate:null,approval:false,beforeBatch:fn=>{beforeBatch=fn;}};
  const load = relative => {
    const file=path.resolve(root,relative);
    if(cache.has(file))return cache.get(file);
    const exports={};cache.set(file,exports);
    const code=ts.transpileModule(readFileSync(file,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
    const require=specifier=>{
      const absolute=path.resolve(path.dirname(file),specifier);
      if(absolute===path.join(root,"db"))return {getD1:()=>d1};
      if(absolute===path.join(root,"lib/access-control"))return {privateNoStoreHeaders:{"cache-control":"private, no-store"},authenticatedRequestGate:async()=>h.gate?{response:h.gate}:{currentUser:h.actor}};
      return load(path.relative(root,absolute)+".ts");
    };
    // Isolate the approval flag from the host environment.
    new Function("require","exports","process",code)(require,exports,{env:{get PEOPLE_PULSE_POSITION_REQUEST_APPROVAL_ENABLED(){return h.approval?"true":undefined;}}});
    return exports;
  };
  h.service=load("lib/position-request-service.ts");
  h.format=load("lib/position-request-format.ts");
  h.route=load("app/api/position-change-requests/route.ts");
  h.ready=()=>h.service.readyPositionRequests(d1);
  h.create=(overrides={})=>h.service.createPositionRequest(d1,admin,{employee_id:"e1",expected_employee_updated_at:"2026-09-01T00:00:00.000Z",requested_role_id:"hr-payroll-commission",requested_position_title:"People Coordinator",reason:"Approved test purpose",...overrides});
  h.review=(id,action="approve",extra={})=>h.service.reviewPositionRequest(d1,admin,{id,action,review_note:action==="reject"?"Not approved":"Reviewed",confirmed:true,...extra},true);
  h.protected=()=>JSON.stringify(["user_accounts","auth_credentials","auth_sessions","auth_events","employee_profiles","hr_profiles"].map(table=>sql.prepare(`SELECT * FROM ${table}`).all()));
  return h;
}

test("create/export/import preview never changes employees or protected account data",async()=>{
  const h=harness();try{
    await h.ready();const before=h.protected();const employeeBefore=JSON.stringify(h.sql.prepare("SELECT * FROM employees").all());
    const row=await h.create();assert.equal(row.status,"pending");
    const bundle=await h.service.exportPositionRequests(h.d1,admin);
    assert.equal(bundle.file.requests.length,1);
    assert.equal((await h.service.importPositionRequests(h.d1,admin,bundle.file,true)).duplicates,1);
    assert.equal((await h.service.importPositionRequests(h.d1,admin,bundle.file,false)).imported,0);
    assert.equal(h.protected(),before);assert.equal(JSON.stringify(h.sql.prepare("SELECT * FROM employees").all()),employeeBefore);
  }finally{h.sql.close();}
});

test("pending to approved changes only role/title/revision with existing employee history",async()=>{
  const h=harness();try{
    await h.ready();const before=h.protected();const row=await h.create();
    assert.equal((await h.review(row.id)).status,"approved");
    const employee=h.sql.prepare("SELECT * FROM employees").get();
    assert.equal(employee.role_id,"hr-payroll-commission");assert.equal(employee.position_title,"People Coordinator");
    assert.equal(employee.name,"Test Employee");assert.equal(employee.status,"active");
    const request=h.sql.prepare("SELECT * FROM employee_position_change_requests").get();
    assert.equal(request.reviewed_by,admin.id);assert.ok(request.approved_at);assert.equal(request.rejected_at,null);
    const history=h.sql.prepare("SELECT * FROM employee_profile_audit").get();
    assert.equal(history.actor_id,admin.id);assert.equal(JSON.parse(history.before_json).roleId,"accounting-cashflow");
    assert.equal(JSON.parse(history.after_json).roleId,"hr-payroll-commission");
    assert.equal(JSON.parse(history.after_json).positionRequestId,row.id);
    assert.equal(h.sql.prepare("SELECT count(*) n FROM employee_position_events").get().n,1);
    assert.equal(h.protected(),before);
    await assert.rejects(h.review(row.id),error=>error.status===409);
    await assert.rejects(h.review(row.id,"reject"),error=>error.status===409);
  }finally{h.sql.close();}
});

test("role-only approval and display-title-only approval both work",async()=>{
  for(const input of [{requested_position_title:""},{requested_role_id:"accounting-cashflow"}]){
    const h=harness();try{await h.ready();const row=await h.create(input);await h.review(row.id);
      assert.equal(h.sql.prepare("SELECT status FROM employee_position_change_requests").get().status,"approved");
      assert.equal(h.sql.prepare("SELECT count(*) n FROM employee_profile_audit").get().n,1);
    }finally{h.sql.close();}
  }
});

test("pending to rejected requires note and leaves employee/credentials/audit unchanged",async()=>{
  const h=harness();try{await h.ready();const before=h.protected();const employee=JSON.stringify(h.sql.prepare("SELECT * FROM employees").all());const row=await h.create();
    await assert.rejects(h.review(row.id,"reject",{review_note:""}),error=>error.status===400);
    await h.review(row.id,"reject");const result=h.sql.prepare("SELECT * FROM employee_position_change_requests").get();
    assert.equal(result.status,"rejected");assert.ok(result.rejected_at);assert.equal(result.approved_at,null);
    assert.equal(JSON.stringify(h.sql.prepare("SELECT * FROM employees").all()),employee);assert.equal(h.protected(),before);
    assert.equal(h.sql.prepare("SELECT count(*) n FROM employee_profile_audit").get().n,0);
  }finally{h.sql.close();}
});

test("changed revision, changed role, missing or inactive employee conflicts, stays pending",async()=>{
  for(const query of ["UPDATE employees SET updated_at='2026-09-02T00:00:00.000Z'","UPDATE employees SET role_id='sales-service-admin'","DELETE FROM employees","UPDATE employees SET status='resigned'"]){
    const h=harness();try{await h.ready();const row=await h.create();h.sql.exec(query);const changed=JSON.stringify(h.sql.prepare("SELECT * FROM employees").all());
      await assert.rejects(h.review(row.id),error=>error.status===409);
      assert.equal(h.sql.prepare("SELECT status FROM employee_position_change_requests").get().status,"pending");
      assert.equal(JSON.stringify(h.sql.prepare("SELECT * FROM employees").all()),changed);
    }finally{h.sql.close();}
  }
});

test("employee race after pre-read and audit failure roll back whole approval",async()=>{
  const h=harness();try{await h.ready();const row=await h.create();
    h.beforeBatch(()=>h.sql.exec("UPDATE employees SET updated_at='2026-09-02T00:00:00.000Z'"));
    await assert.rejects(h.review(row.id),error=>error.status===409);
    assert.equal(h.sql.prepare("SELECT status FROM employee_position_change_requests").get().status,"pending");
    assert.equal(h.sql.prepare("SELECT count(*) n FROM employee_profile_audit").get().n,0);
    h.sql.exec("UPDATE employees SET updated_at='2026-09-01T00:00:00.000Z'; CREATE TRIGGER simulate_failure BEFORE INSERT ON employee_position_events BEGIN SELECT RAISE(ABORT,'EMPLOYEE_POSITION_TEST_FAILURE'); END");
    await assert.rejects(h.review(row.id),error=>error.status===409);
    assert.equal(h.sql.prepare("SELECT role_id FROM employees").get().role_id,"accounting-cashflow");
    assert.equal(h.sql.prepare("SELECT count(*) n FROM employee_profile_audit").get().n,0);
  }finally{h.sql.close();}
});

test("rejection winning a race prevents subsequent approval",async()=>{
  const h=harness();try{await h.ready();const row=await h.create();
    h.beforeBatch(()=>h.sql.prepare("UPDATE employee_position_change_requests SET status='rejected',reviewed_by='admin-1',reviewed_by_name='HR',rejected_at='2026-09-29T00:00:00.000Z' WHERE id=?").run(row.id));
    await assert.rejects(h.review(row.id),error=>error.status===409);
    assert.equal(h.sql.prepare("SELECT status FROM employee_position_change_requests").get().status,"rejected");
    assert.equal(h.sql.prepare("SELECT position_title FROM employees").get().position_title,"");
  }finally{h.sql.close();}
});

test("separate test/main import preserves requester provenance and duplicate terminal status",async()=>{
  const testMachine=harness(),main=harness();try{
    await testMachine.ready();await main.ready();
    const row=await testMachine.create();const bundle=await testMachine.service.exportPositionRequests(testMachine.d1,admin);
    const preview=await main.service.importPositionRequests(main.d1,admin,bundle.file,true);
    assert.equal(preview.preview[0].duplicate,false);
    assert.equal(main.sql.prepare("SELECT count(*) n FROM employee_position_change_requests").get().n,0);
    assert.equal((await main.service.importPositionRequests(main.d1,admin,bundle.file,false)).imported,1);
    assert.equal(main.sql.prepare("SELECT position_title FROM employees").get().position_title,"");
    await main.review(row.id);
    assert.equal((await main.service.importPositionRequests(main.d1,admin,bundle.file,false)).duplicates,1);
    assert.equal(main.sql.prepare("SELECT status FROM employee_position_change_requests").get().status,"approved");
    bundle.file.requests[0].reason="Tampered replacement";
    await assert.rejects(main.service.importPositionRequests(main.d1,admin,bundle.file,false),error=>error.status===409);
  }finally{testMachine.sql.close();main.sql.close();}
});

test("export allowlist excludes credentials even if unknown sensitive columns are added",async()=>{
  const h=harness();try{await h.ready();await h.create();h.sql.exec("ALTER TABLE employee_position_change_requests ADD password_hash TEXT DEFAULT 'SECRET_SENTINEL'; ALTER TABLE employee_position_change_requests ADD token TEXT DEFAULT 'SECRET_TOKEN'");
    const result=await h.service.exportPositionRequests(h.d1,admin);
    const encoded=JSON.stringify(result.file);
    assert.doesNotMatch(encoded,/password_hash|SECRET_SENTINEL|SECRET_TOKEN|salt|session|token|\.env/);
    assert.ok(h.reads.every(query=>!query.includes("FROM auth_credentials")&&!query.includes("FROM auth_sessions")));
    const malformed=structuredClone(result.file);malformed.requests[0].token="leak";
    assert.throws(()=>h.format.parseRequestFile(malformed),/ข้อมูลนอกแบบ/);
    assert.throws(()=>h.format.parseRequestFile({...result.file,auth_credentials:[]}),/ข้อมูลนอกแบบ/);
    malformed.requests[0]={...result.file.requests[0],status:"approved"};
    assert.throws(()=>h.format.parseRequestFile(malformed),/รออนุมัติ/);
  }finally{h.sql.close();}
});

test("default test mode cannot approve/reject; inactive HR and other roles cannot access",async()=>{
  const h=harness();try{await h.ready();const row=await h.create();
    await assert.rejects(h.service.reviewPositionRequest(h.d1,admin,{id:row.id,action:"approve",confirmed:true,review_note:""},false),error=>error.status===403);
    for(const actor of [{...admin,role:"employee"},{...admin,role:"manager"},{...admin,status:"inactive"}]){
      await assert.rejects(h.service.exportPositionRequests(h.d1,actor),error=>error.status===403);
      await assert.rejects(h.service.importPositionRequests(h.d1,actor,{},true),error=>error.status===403);
      await assert.rejects(h.service.createPositionRequest(h.d1,actor,{}),error=>error.status===403);
      h.actor=actor;assert.equal((await h.route.GET(new Request("http://test/api/position-change-requests"))).status,403);
      assert.equal((await h.route.POST(new Request("http://test/api/position-change-requests",{method:"POST",body:"{}"}))).status,403);
    }
    h.actor=admin;h.gate=Response.json({error:"login"},{status:401});
    assert.equal((await h.route.GET(new Request("http://test/api/position-change-requests"))).status,401);
    h.gate=null;
    assert.equal((await h.route.POST(new Request("http://test/api/position-change-requests",{method:"POST",body:"x".repeat(256*1024+1)}))).status,413);
  }finally{h.sql.close();}
});

test("guarded requests are immutable; no partial import on invalid input",async()=>{
  const h=harness();try{await h.ready();const row=await h.create();
    assert.throws(()=>h.sql.prepare("UPDATE employee_position_change_requests SET reason='rewrite' WHERE id=?").run(row.id),/IMMUTABLE/);
    assert.throws(()=>h.sql.prepare("DELETE FROM employee_position_change_requests WHERE id=?").run(row.id),/IMMUTABLE/);
    const exported=await h.service.exportPositionRequests(h.d1,admin);
    const bad=structuredClone(exported.file);bad.requests.push({...bad.requests[0],id:"other",requested_role_id:"administrator"});
    await assert.rejects(h.service.importPositionRequests(h.d1,admin,bad,false),error=>error.status===400);
    assert.equal(h.sql.prepare("SELECT count(*) n FROM employee_position_change_requests").get().n,1);
  }finally{h.sql.close();}
});

test("UTF-8 exports are bounded and all pending requests can be imported without omissions",async()=>{
  const h=harness();try{
    await h.ready();
    for(let i=0;i<101;i++)await h.create({reason:"ก".repeat(1000),requested_position_title:"ง".repeat(120)});
    const ids=new Set();let after="";
    do{
      const result=await h.service.exportPositionRequests(h.d1,admin,after);
      const bytes=new TextEncoder().encode(JSON.stringify(result.file,null,2)).byteLength;
      assert.ok(bytes<h.format.MAX_POSITION_REQUEST_FILE_BYTES);
      assert.ok(result.file.requests.length<=100);
      h.format.parseRequestFile(result.file);
      for(const row of result.file.requests){assert.ok(!ids.has(row.id));ids.add(row.id);}
      after=result.nextCursor;
    }while(after);
    assert.equal(ids.size,101);
  }finally{h.sql.close();}
});

test("UI separates preview/import/individual review and preserves employee history",()=>{
  const page=source("app/page.tsx"),ui=source("app/position-change-requests.tsx");
  assert.match(page,/view === "positionRequests" && canManageEmployeeFiles/);
  assert.match(ui,/action:"previewImport"/);assert.match(ui,/action:"import"/);
  assert.match(ui,/action:"approve"/);assert.match(ui,/action:"reject"/);
  assert.match(ui,/approvalEnabled/);assert.match(ui,/confirmed/);
  assert.match(source("app/employee-history.tsx"),/positionRequestId/);
  const route=source("app/api/position-change-requests/route.ts");
  assert.ok(route.indexOf("requirePositionAdmin(auth.currentUser)",route.indexOf("export async function POST"))<route.indexOf("await readBody(request)"));
  assert.match(route,/PEOPLE_PULSE_POSITION_REQUEST_APPROVAL_ENABLED === "true"/);
  assert.doesNotMatch(source("lib/position-request-service.ts"),/(?:UPDATE|DELETE FROM|INSERT INTO) (?:auth_credentials|auth_sessions|user_accounts)/);
});
