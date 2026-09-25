import test from 'node:test';
import assert from 'node:assert/strict';
import { attendanceTime, validAttendanceLocation, ensureAttendanceEvidence, attendanceOffice, officeDistanceMeters, isInsideAttendanceOffice } from '../lib/attendance-capture.ts';
import { DatabaseSync } from 'node:sqlite';

test('office fence uses the place pin and a strict 3 meter measured radius',()=>{
  const {latitude,longitude}=attendanceOffice;
  assert.equal(latitude,16.4716921);assert.equal(longitude,99.5139851);
  assert.equal(officeDistanceMeters(latitude,longitude),0);
  assert.equal(isInsideAttendanceOffice(latitude,longitude),true);
  for(const meters of [2.99,3.01,10]) {
    const lat=latitude+(meters/6371000)*(180/Math.PI);
    assert.ok(Math.abs(officeDistanceMeters(lat,longitude)-meters)<0.000001);
    assert.equal(isInsideAttendanceOffice(lat,longitude),meters<=3);
  }
  assert.equal(isInsideAttendanceOffice(NaN,longitude),false);
  assert.equal(isInsideAttendanceOffice(latitude,181),false);
  assert.equal(isInsideAttendanceOffice(16.4716919,99.5132794),false); // viewport center is not the pin
});

test('attendance uses Bangkok server day and 9am start',()=>{
  assert.deepEqual(attendanceTime(new Date('2026-09-25T02:00:00Z')), {day:'2026-09-25',time:'09:00',minutesLate:0});
  assert.equal(attendanceTime(new Date('2026-09-25T02:15:00Z')).minutesLate,15);
  assert.equal(attendanceTime(new Date('2026-09-25T18:00:00Z')).day,'2026-09-26');
});
test('coordinates must be finite, in bounds and fresh',()=>{
  const now=Date.now();
  assert.equal(validAttendanceLocation(13,100,25,now,now),true);
  for(const args of [[91,100,25,now], [13,181,25,now], [NaN,100,25,now], [13,100,-1,now], [13,100,25,now-120001], [13,100,25,now+11000]]) assert.equal(validAttendanceLocation(...args,now),false);
});
test('evidence schema is additive and prevents duplicate clock events',async()=>{
  const sql=new DatabaseSync(':memory:');
  const db={prepare(query){return {async run(){sql.exec(query);}};}};
  await ensureAttendanceEvidence(db);await ensureAttendanceEvidence(db);
  const insert=sql.prepare('INSERT INTO attendance_capture_evidence VALUES (?,?,?,?,?,?,?,?,?)');
  insert.run('one','e1','2026-09-25','in','now',13,100,20,'private.jpg');
  assert.throws(()=>insert.run('two','e1','2026-09-25','in','now',13,100,20,'private2.jpg'));
  assert.throws(()=>insert.run(null,'e1','2026-09-25','out','now',13,100,20,'private2.jpg'));
  sql.close();
});
