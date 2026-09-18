import test from 'node:test';
import assert from 'node:assert/strict';
import {createProfileBootstrap,profileColumns} from '../src/lib/profile-bootstrap.js';
import {fixture,user,id} from './helpers/auth-fixture.mjs';

test('existing own profile selects exact allowed columns, never avatar/wildcard or insert', async () => {
  const f = fixture(), ensure = createProfileBootstrap(f.client,value => value === id);
  assert.deepEqual(await ensure(),{ok:true,status:'ready'});
  assert.equal(f.calls.getUser,1);
  assert.deepEqual(f.calls.select,[{table:'profiles',columns:'id,username,display_name,created_at,updated_at',column:'id',value:id}]);
  assert.doesNotMatch(profileColumns,/avatar_url|\*/);
  assert.equal(f.calls.insert.length,0);
});

test('missing own profile inserts only verified user id and validated username, no metadata authority/upsert', async () => {
  const f = fixture(); f.rows = [{data:null,error:null}];
  assert.deepEqual(await createProfileBootstrap(f.client,value => value === id)(),{ok:true,status:'ready'});
  assert.deepEqual(f.calls.insert,[{id,username:'Test_12'}]);
  assert.equal(f.calls.select.length,1);
});

test('missing or invalid metadata username gives incomplete profile, not insert', async () => {
  for (const username of [undefined,null,{},'', 'ab', 'a'.repeat(25),'Enes Ünal','name-name','abc\n']) {
    const f = fixture(); f.rows = [{data:null,error:null}];
    f.userResult = {data:{user:{...user,user_metadata:{username,role:'admin',id:'other-user'}}}};
    assert.deepEqual(await createProfileBootstrap(f.client,() => true)(),{ok:false,status:'profile_incomplete'});
    assert.equal(f.calls.insert.length,0);
  }
});

test('server validation, verified email and current identity required before profile access', async () => {
  for (const result of [{error:{message:'private'},data:{user}}, {data:{user:null}},
    {data:{user:{...user,id:'other-user'}}}, {data:{user:{...user,email_confirmed_at:null}}},
    {data:{user:{...user,is_anonymous:true}}}]) {
    const f = fixture(); f.userResult = result;
    assert.equal((await createProfileBootstrap(f.client,value => value === id)()).ok,false);
    assert.equal(f.calls.select.length,0); assert.equal(f.calls.insert.length,0);
  }
});

test('two-tab duplicate race reselects own row and treats it as success without upsert', async () => {
  const f = fixture(); f.rows = [{data:null}, {data:{id,username:'Already_chosen'}}];
  f.insertResult = {error:{code:'23505',message:'private duplicate'}};
  assert.deepEqual(await createProfileBootstrap(f.client,() => true)(),{ok:true,status:'ready'});
  assert.equal(f.calls.select.length,2); assert.equal(f.calls.insert.length,1);
  assert.ok(f.calls.select.every(call => call.value === id));
});

test('username conflict is controlled and distinct from transient profile error', async () => {
  for (const code of ['23505','42501','08006']) {
    const f = fixture(); f.rows = [{data:null}]; f.insertResult = {error:{code,message:'private details'}};
    assert.deepEqual(await createProfileBootstrap(f.client,() => true)(),{ok:false,status:code === '23505' ? 'username_conflict' : 'profile_error'});
    assert.equal(f.calls.select.length,2);
  }
});

test('profile stops on identity switch, wrong returned owner, query errors or exceptions', async () => {
  const f = fixture(); f.rows = [{data:null}];
  let checks = 0;
  assert.deepEqual(await createProfileBootstrap(f.client,() => ++checks === 1)(),{ok:false,status:'profile_error'});
  assert.equal(f.calls.insert.length,0);
  f.rows = [{data:{id:'other-user'}}];
  assert.equal((await createProfileBootstrap(f.client,() => true)()).status,'profile_error');
  f.client.auth.getUser = async () => {throw Error('private detail');};
  assert.deepEqual(await createProfileBootstrap(f.client,() => true)(),{ok:false,status:'profile_error'});
  assert.deepEqual(await createProfileBootstrap(null,() => true)(),{ok:false,status:'profile_error'});
});
