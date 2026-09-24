import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

const migration = name => readFileSync(new URL('../supabase/migrations/' + name, import.meta.url), 'utf8');
const userA = '11111111-1111-4111-8111-111111111111';
const userB = '22222222-2222-4222-8222-222222222222';
const userC = '33333333-3333-4333-8333-333333333333';
const missingUser = '44444444-4444-4444-8444-444444444444';
const profileColumns = 'id, username, display_name, created_at, updated_at';
const denied = action => assert.rejects(action, error => error.code === '42501');
const checkViolation = action => assert.rejects(action, error => error.code === '23514');

// This suite runs real SQL only in an in-memory Postgres (PGlite) instance.
// auth.users/auth.uid() are minimal test doubles, not a Supabase Auth server.
// No environment variables, production connections, CLI apply or seed are used.
test('Phase 1 migrations: catalogue access, profiles ownership and sharing isolation', async t => {
  const db = new PGlite();
  const asRole = async (role, uid, action) => {
    assert.ok(['anon', 'authenticated'].includes(role));
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [uid || '']);
    await db.exec('set role ' + role);
    try { return await action(); }
    finally { await db.exec('reset role'); }
  };
  const protectedMetadata = async () => ({
    functions: (await db.query(`select n.nspname, p.proname, p.proacl,
      pg_get_functiondef(p.oid) as definition from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname in ('public', 'tactics_private') order by n.nspname, p.proname`)).rows,
    tables: (await db.query(`select n.nspname, c.relname, c.relacl, c.relrowsecurity
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where (n.nspname = 'public' and c.relname = 'shared_lineups')
         or (n.nspname = 'tactics_private' and c.relname = 'share_limits')
      order by n.nspname, c.relname`)).rows,
    policies: (await db.query(`select * from pg_policies
      where tablename in ('shared_lineups', 'share_limits')
         or policyname in ('teams_public_catalogue', 'players_public_catalogue')
      order by schemaname, tablename, policyname`)).rows,
    schemas: (await db.query(`select nspname, nspacl from pg_namespace
      where nspname in ('public', 'tactics_private') order by nspname`)).rows,
  });
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create role service_role bypassrls;
      create schema auth;
      create table auth.users (id uuid primary key);
      create function auth.uid() returns uuid language sql stable
        set search_path = '' as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
        $$;
      grant usage on schema auth to anon, authenticated;
      grant execute on function auth.uid() to anon, authenticated;
    `);
    await db.exec(migration('20260913063249_football_backend.sql'));
    await db.exec(`
      insert into public.teams (id, name, short_name, color_primary, color_secondary)
        values ('test', 'Test Team', 'TST', '#123456', '#abcdef');
      insert into public.players (id, team_id, name, position)
        values ('test-player', 'test', 'Test Player', 'M');
    `);
    await db.query('insert into auth.users (id) values ($1), ($2), ($3)', [userA, userB, userC]);
    const before = await protectedMetadata();

    // Model a hosted project with permissive default grants. The new table must
    // explicitly revoke them; a clean database alone would not catch that bug.
    await db.exec('alter default privileges in schema public grant all on tables to public, anon, authenticated');
    await db.exec(migration('20260920094922_catalogue_authenticated_read.sql'));
    await db.exec(migration('20260920102243_profiles_ownership.sql'));

    await t.test('existing sharing functions, ACLs and anon policies remain unchanged', async () => {
      assert.deepEqual(await protectedMetadata(), before);
      for (const role of ['anon', 'authenticated']) {
        await asRole(role, userA, async () => {
          for (const sql of [
            'select * from public.shared_lineups',
            "insert into public.shared_lineups (team_name, formation, lineup_data) values ('T', '4-3-3', '{}')",
            "update public.shared_lineups set team_name = 'changed'",
            'delete from public.shared_lineups',
            "select public.create_shared_lineup('{}'::jsonb, 'x')",
          ]) await denied(() => db.exec(sql));
        });
        assert.equal((await db.query("select has_function_privilege($1, 'public.create_shared_lineup(jsonb,text)', 'EXECUTE') as allowed", [role])).rows[0].allowed, false);
      }
    });

    for (const role of ['anon', 'authenticated']) {
      await t.test(role + ' can read both catalogue tables but cannot write', async () => {
        await asRole(role, userA, async () => {
          assert.deepEqual((await db.query('select id from public.teams')).rows, [{id: 'test'}]);
          assert.deepEqual((await db.query('select id from public.players')).rows, [{id: 'test-player'}]);
          for (const sql of [
            "insert into public.teams (id,name,short_name,color_primary,color_secondary) values ('other','Other','O','#123456','#abcdef')",
            "insert into public.players (id,team_id,name,position) values ('other','test','Other','M')",
            "update public.teams set name = 'changed'",
            "update public.players set name = 'changed'",
            'delete from public.teams',
            'delete from public.players',
          ]) await denied(() => db.exec(sql));
        });
        const privileges = (await db.query(`select table_name, privilege_type
          from information_schema.role_table_grants where grantee = $1
          and table_schema = 'public' and table_name in ('teams', 'players')
          order by table_name, privilege_type`, [role])).rows;
        assert.deepEqual(privileges, [
          {table_name: 'players', privilege_type: 'SELECT'},
          {table_name: 'teams', privilege_type: 'SELECT'},
        ]);
      });
    }

    await t.test('profiles schema, RLS and effective column permissions are minimal', async () => {
      const columns = (await db.query(`select column_name, data_type, is_nullable, column_default
        from information_schema.columns where table_schema = 'public' and table_name = 'profiles'
        order by ordinal_position`)).rows;
      assert.deepEqual(columns, [
        {column_name: 'id', data_type: 'uuid', is_nullable: 'NO', column_default: null},
        {column_name: 'username', data_type: 'text', is_nullable: 'NO', column_default: null},
        {column_name: 'display_name', data_type: 'text', is_nullable: 'YES', column_default: null},
        {column_name: 'avatar_url', data_type: 'text', is_nullable: 'YES', column_default: null},
        {column_name: 'created_at', data_type: 'timestamp with time zone', is_nullable: 'NO', column_default: 'now()'},
        {column_name: 'updated_at', data_type: 'timestamp with time zone', is_nullable: 'NO', column_default: 'now()'},
      ]);
      assert.equal((await db.query("select relrowsecurity from pg_class where oid = 'public.profiles'::regclass")).rows[0].relrowsecurity, true);
      const policies = (await db.query("select cmd, roles, qual, with_check from pg_policies where schemaname = 'public' and tablename = 'profiles' order by cmd")).rows;
      assert.deepEqual(policies.map(p => p.cmd), ['INSERT', 'SELECT', 'UPDATE']);
      for (const policy of policies) assert.deepEqual(policy.roles, ['authenticated']);
      assert.match(policies[0].with_check, /auth\.uid\(\)/);
      assert.match(policies[1].qual, /auth\.uid\(\)/);
      assert.match(policies[2].qual, /auth\.uid\(\)/);
      assert.match(policies[2].with_check, /auth\.uid\(\)/);
      const allowed = {
        SELECT: ['id', 'username', 'display_name', 'created_at', 'updated_at'],
        INSERT: ['id', 'username', 'display_name'],
        UPDATE: ['username', 'display_name'],
      };
      for (const role of ['anon', 'authenticated']) {
        for (const [privilege, names] of Object.entries(allowed)) {
          for (const {column_name} of columns) {
            const result = await db.query("select has_column_privilege($1, 'public.profiles', $2, $3) as allowed", [role, column_name, privilege]);
            assert.equal(result.rows[0].allowed, role === 'authenticated' && names.includes(column_name), `${role} ${privilege} ${column_name}`);
          }
        }
        for (const privilege of ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) {
          assert.equal((await db.query("select has_table_privilege($1, 'public.profiles', $2) as allowed", [role, privilege])).rows[0].allowed, false);
        }
      }
    });

    await t.test('anon cannot select, insert, update or delete profiles', async () => {
      await asRole('anon', null, async () => {
        for (const sql of [
          'select id from public.profiles',
          `insert into public.profiles (id, username) values ('${userA}', 'Alice')`,
          "update public.profiles set username = 'changed'",
          'delete from public.profiles',
        ]) await denied(() => db.exec(sql));
      });
    });

    await t.test('each authenticated user can create, read and edit only their own profile', async () => {
      for (const [uid, name] of [[userA, 'Alice'], [userB, 'Bobby']]) {
        await asRole('authenticated', uid, async () => {
          const row = (await db.query(`insert into public.profiles (id, username, display_name)
            values ($1, $2, $3) returning ${profileColumns}`, [uid, name, name])).rows[0];
          assert.equal(row.id, uid);
          assert.ok(row.created_at);
          assert.ok(row.updated_at);
          assert.deepEqual((await db.query('select id from public.profiles')).rows, [{id: uid}]);
          assert.equal((await db.query('update public.profiles set display_name = $1 where id = $2 returning id', [name + ' Updated', uid])).rows[0].id, uid);
        });
      }
      await asRole('authenticated', userA, async () => {
        assert.deepEqual((await db.query(`select ${profileColumns} from public.profiles where id = $1`, [userB])).rows, []);
        assert.deepEqual((await db.query("update public.profiles set username = 'Stolen' where id = $1 returning id", [userB])).rows, []);
        // C exists in auth.users but has no profile: rejection must be RLS, not a PK/FK error.
        await denied(() => db.query('insert into public.profiles (id, username) values ($1, $2)', [userC, 'Stolen']));
      });
      assert.equal((await db.query('select username from public.profiles where id = $1', [userB])).rows[0].username, 'Bobby');
      assert.equal((await db.query('select count(*)::int as n from public.profiles')).rows[0].n, 2);
      await asRole('authenticated', null, async () => {
        assert.deepEqual((await db.query('select id from public.profiles')).rows, []);
        await denied(() => db.query('insert into public.profiles (id, username) values ($1, $2)', [userC, 'NoIdentity']));
      });
    });

    await t.test('protected columns cannot be inserted/updated and DELETE stays forbidden', async () => {
      await asRole('authenticated', userA, async () => {
        for (const [column, value] of [
          ['id', userC], ['created_at', '2000-01-01'], ['updated_at', '2000-01-01'], ['avatar_url', 'https://example.com/a.png'],
        ]) await denied(() => db.query(`update public.profiles set ${column} = $1 where id = $2`, [value, userA]));
        await denied(() => db.query('delete from public.profiles where id = $1', [userA]));
        await denied(() => db.query('select avatar_url from public.profiles where id = $1', [userA]));
      });
      await asRole('authenticated', userC, async () => {
        for (const [column, value] of [
          ['created_at', '2000-01-01'], ['updated_at', '2000-01-01'], ['avatar_url', 'https://example.com/a.png'],
        ]) await denied(() => db.query(`insert into public.profiles (id, username, ${column}) values ($1, $2, $3)`, [userC, 'Charlie', value]));
      });
    });

    await t.test('UPDATE WITH CHECK also blocks ownership transfer behind the column privilege layer', async () => {
      // Temporary test-only grant exercises the RLS check independently; always roll it back.
      await db.exec('begin; grant update (id) on public.profiles to authenticated');
      try {
        await db.query("select set_config('request.jwt.claim.sub', $1, true)", [userA]);
        await db.exec('set local role authenticated');
        await denied(() => db.query('update public.profiles set id = $1 where id = $2', [userC, userA]));
      } finally { await db.exec('rollback'); }
      assert.equal((await db.query("select has_column_privilege('authenticated', 'public.profiles', 'id', 'UPDATE') as allowed")).rows[0].allowed, false);
      assert.deepEqual((await db.query('select id from public.profiles order by id')).rows, [{id: userA}, {id: userB}]);
    });

    await t.test('username boundaries, ASCII characters, NOT NULL and case-insensitive uniqueness', async () => {
      await asRole('authenticated', userA, async () => {
        for (const username of ['abc', 'a'.repeat(24), 'A_Z09']) {
          await db.query('update public.profiles set username = $1 where id = $2', [username, userA]);
        }
        for (const username of ['', 'ab', 'a'.repeat(25), 'a b', 'abc-', 'İsim', 'abcé', 'ａｂｃ', 'abc\n', 'abc\t']) {
          await checkViolation(() => db.query('update public.profiles set username = $1 where id = $2', [username, userA]));
        }
        await assert.rejects(db.query('update public.profiles set username = null where id = $1', [userA]), error => error.code === '23502');
        await db.query('update public.profiles set username = $1 where id = $2', ['Alice', userA]);
      });
      await asRole('authenticated', userB, async () => {
        await assert.rejects(db.query('update public.profiles set username = $1 where id = $2', ['aLiCe', userB]), error => error.code === '23505');
      });
      await asRole('authenticated', userC, async () => {
        await assert.rejects(db.query('insert into public.profiles (id, username) values ($1, $2)', [userC, 'ALICE']), error => error.code === '23505');
        await checkViolation(() => db.query('insert into public.profiles (id, username) values ($1, $2)', [userC, 'ab']));
      });
    });

    await t.test('display_name accepts NULL and trimmed 1–60 characters, rejects controls', async () => {
      await asRole('authenticated', userA, async () => {
        for (const name of [null, 'A', 'İstanbul Çağrı', 'x'.repeat(60), '  Name  ']) {
          assert.equal((await db.query('update public.profiles set display_name = $1 where id = $2 returning display_name', [name, userA])).rows[0].display_name, name);
        }
        for (const name of ['', '   ', 'x'.repeat(61), ' ' + 'x'.repeat(61) + ' ', 'A\nB', 'A\rB', 'A\tB', 'A\u0001B', 'A\u007fB', 'A\u0085B', 'A\u009fB']) {
          await checkViolation(() => db.query('update public.profiles set display_name = $1 where id = $2', [name, userA]));
        }
      });
      await asRole('authenticated', userC, async () => {
        await checkViolation(() => db.query('insert into public.profiles (id, username, display_name) values ($1, $2, $3)', [userC, 'Charlie', '  ']));
      });
    });

    await t.test('updated_at runs through the existing invoker trigger without client EXECUTE', async () => {
      // Owner-only fixture with old timestamps makes the trigger check deterministic.
      await db.query("insert into public.profiles (id, username, created_at, updated_at) values ($1, 'ClockTest', '2000-01-01', '2000-01-01')", [userC]);
      await db.exec('begin');
      try {
        await db.exec("set local timezone = 'UTC'");
        const before = (await db.query('select created_at, updated_at from public.profiles where id = $1', [userC])).rows[0];
        const transactionTime = (await db.query('select now() as value')).rows[0].value;
        await asRole('authenticated', userC, async () => {
          const after = (await db.query('update public.profiles set display_name = $1 where id = $2 returning created_at, updated_at', ['Updated', userC])).rows[0];
          assert.deepEqual(after.created_at, before.created_at);
          assert.deepEqual(after.updated_at, transactionTime);
          assert.ok(new Date(after.updated_at) > new Date(before.updated_at));
        });
      } finally { await db.exec('rollback'); }
      await db.query('delete from public.profiles where id = $1', [userC]);
      const fn = (await db.query("select prosecdef, proconfig from pg_proc where oid = 'tactics_private.touch_updated_at()'::regprocedure")).rows[0];
      assert.equal(fn.prosecdef, false);
      assert.deepEqual(fn.proconfig, ['search_path=""']);
      for (const role of ['anon', 'authenticated']) {
        assert.equal((await db.query("select has_function_privilege($1, 'tactics_private.touch_updated_at()', 'EXECUTE') as allowed", [role])).rows[0].allowed, false);
      }
    });

    await t.test('profiles require an Auth user and cascade only with account deletion', async () => {
      await asRole('authenticated', missingUser, async () => {
        await assert.rejects(db.query('insert into public.profiles (id, username) values ($1, $2)', [missingUser, 'Missing']), error => error.code === '23503');
      });
      await asRole('authenticated', userC, async () => {
        await db.query('insert into public.profiles (id, username) values ($1, $2)', [userC, 'Charlie']);
      });
      assert.equal((await db.query('select avatar_url from public.profiles where id = $1', [userC])).rows[0].avatar_url, null);
      await db.query('delete from auth.users where id = $1', [userC]);
      assert.deepEqual((await db.query('select id from public.profiles where id = $1', [userC])).rows, []);
      assert.equal((await db.query('select count(*)::int as n from public.profiles')).rows[0].n, 2);
      assert.deepEqual(await protectedMetadata(), before);
    });
  } finally { await db.close(); }
});
