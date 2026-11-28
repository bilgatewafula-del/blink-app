// Run: deno test --allow-read identity-core.test.ts
import * as ng from 'npm:namespace-guard@0.23.0';
import { createEnglishProfanityValidator } from 'npm:namespace-guard@0.23.0/profanity-en';
import { createEngine, type Rule } from './identity-core.ts';

const rules: Rule[] = JSON.parse(await Deno.readTextFile(new URL('./rules-fixture.json', import.meta.url)));
const taken = new Set(['taken_name', 'john_taken']);
const make = (over: Partial<Parameters<typeof createEngine>[1]> = {}) =>
  createEngine({ ng, profanityEn: createEnglishProfanityValidator }, {
    userId: 'u1', staff: false, overrides: [], rules,
    findUsername: async (v) => (taken.has(v.toLowerCase()) ? 'someone' : null), ...over });

type V = [string, string]; // value, expected code or 'ok'
const USER: V[] = [
  ['john_doe', 'ok'], ['Kamau.254', 'ok'], ['wanjiku', 'ok'], ['blinkingstar', 'ok'], ['teamwork', 'ok'], ['essex_boy', 'ok'], ['mohamed_a', 'ok'],
  ['kevin.o', 'ok'], ['peter_mwangi', 'ok'], ['hancock_x', 'ok'], ['classic_man', 'ok'],
  ['ab', 'length'], ['.john', 'period_edge'], ['john.', 'period_edge'], ['jo..hn', 'period_double'], ['12345', 'numeric_only'],
  ['John Doe', 'charset'], ['jo-hn', 'charset'], ['аdmin', 'lookalike'], ['ad\u200bmin', 'invisible'], ['taken_name', 'taken'], ['TAKEN_NAME', 'taken'],
  ['admin', 'reserved'], ['Administrator', 'reserved'], ['moderator', 'reserved'], ['support', 'reserved'], ['official', 'reserved'], ['verified', 'reserved'],
  ['staff', 'reserved'], ['owner', 'reserved'], ['founder', 'reserved'], ['developer', 'reserved'], ['security', 'reserved'], ['system', 'reserved'],
  ['blink', 'reserved'], ['b-link', 'charset'], ['blink_admin', 'reserved'], ['blink_support', 'reserved'],
  ['adm1n', 'impersonation'], ['b1ink', 'impersonation'], ['fuck', 'blocked'], ['fvck', 'blocked'], ['f.u.c.k', 'blocked'], ['nigga_x', 'blocked'],
];
const DISP: V[] = [
  ['Wanjiku Mwangi', 'ok'], ['José García-López', 'ok'], ['محمد علي', 'ok'], ['王小明', 'ok'], ["O'Brien", 'ok'], ['Kenya Trends 🇰🇪', 'ok'], ['👨‍👩‍👧 Family', 'ok'],
  ['Dr. Amina Yusuf', 'ok'], ['Alexander Essex', 'ok'], ['Scunthorpe Dickson', 'ok'], ['Apple Mwangi', 'ok'], ['मोहन', 'ok'], ['Тимур Иванов', 'ok'], ['فاطمه می‌خواهد', 'ok'],
  ['Wafula Wekesa', 'ok'], ['Njeri 🌸', 'ok'], ['Ōtāne Wiremu', 'ok'],
  ['A', 'length'], ['x'.repeat(41), 'length'], ['Jo\u200bhn', 'invisible'], ['John\u202eDoe', 'invisible'], ['<b>Hi</b>', 'chars'], ['@BlinkSupport', 'chars'],
  ['Call 0712 345 678', 'contact_details'], ['visit www.scam.com', 'contact_details'], ['Аlex Smith', 'mixed_script'],
  ['Fuck You', 'blocked'], ['B1ink Support', 'impersonation'], ['Admin', 'impersonation'],
];

Deno.test('username vectors', async () => {
  const e = make(); const bad: string[] = [];
  for (const [v, want] of USER) { const r = await e.checkUsername(v); const got = r.ok ? 'ok' : r.code!; if (got !== want) bad.push(`${JSON.stringify(v)} want ${want} got ${got}`); }
  if (bad.length) throw new Error('\n' + bad.join('\n'));
});
Deno.test('display-name vectors', async () => {
  const e = make(); const bad: string[] = [];
  for (const [v, want] of DISP) { const r = await e.checkDisplayName(v); const got = r.ok ? 'ok' : r.code!; if (got !== want) bad.push(`${JSON.stringify(v)} want ${want} got ${got}`); }
  if (bad.length) throw new Error('\n' + bad.join('\n'));
});
Deno.test('taken name returns available suggestions', async () => {
  const r = await make().checkUsername('taken_name');
  if (r.code !== 'taken' || !r.suggestions?.length) throw new Error(JSON.stringify(r));
  if (r.suggestions.some((s) => taken.has(s))) throw new Error('suggested a taken name');
});
Deno.test('staff and overrides may use reserved names, hate terms stay blocked for staff', async () => {
  if (!(await make({ staff: true }).checkUsername('admin')).ok) throw new Error('staff admin');
  if (!(await make({ staff: true }).checkUsername('blink_support')).ok) throw new Error('staff blink_support');
  if ((await make({ staff: true }).checkUsername('nigga_x')).ok) throw new Error('staff hate');
  if (!(await make({ overrides: [{ kind: 'username', value: 'support' }] }).checkUsername('support')).ok) throw new Error('override');
  if ((await make({ overrides: [{ kind: 'username', value: 'support' }] }).checkUsername('admin')).ok) throw new Error('override leaks');
});
