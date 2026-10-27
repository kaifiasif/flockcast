/**
 * Moves an account to a plan, for operators of a hosted server (FLOCKCAST_PLANS=on).
 *
 *   npm run plan -- someone@example.com studio
 *
 * Plans are changed here, never over HTTP, so nobody can upgrade themselves.
 */
import { configFromEnv, loadEnv } from '../src/config/env.ts';
import { PLAN_IDS, PLANS } from '../src/core/plans.ts';
import { openDatabase } from '../src/db/client.ts';
import { migrate } from '../src/db/migrate.ts';
import { createAccountsRepository } from '../src/db/repositories/accounts.repository.ts';

const [email, plan] = process.argv.slice(2);
if (!email || !PLAN_IDS.includes(plan as never)) {
  console.error(`Usage: npm run plan -- <email> <${PLAN_IDS.join('|')}>`);
  process.exit(1);
}
const env = loadEnv();
const db = openDatabase(env.REHEARSAL_DB);
migrate(db);
if (!createAccountsRepository(db).setPlan(email, plan)) {
  console.error(`No account with the email ${email}.`);
  process.exit(1);
}
const name = PLANS[plan as keyof typeof PLANS].name;
console.log(`${email} is now on ${name}.${configFromEnv(env).plans ? '' : ' Plans are off on this server (FLOCKCAST_PLANS=off), so it changes nothing until you turn them on.'}`);
