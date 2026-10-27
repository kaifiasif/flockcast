/**
 * One suite, four plans. Every feature ships in the same build; a plan decides which ones an account
 * may use and how far. A project's features follow its owner's plan, so members see what the owner
 * pays for.
 *
 * Self-hosted servers run with plans off (the default): everyone gets everything. A hosted server
 * sets FLOCKCAST_PLANS=on, new accounts start on Free, and the operator moves them with
 * `npm run plan -- <email> <plan>`. No payment provider is built in.
 */
import { AppError, ErrorCode } from './errors.ts';

export const PLAN_IDS = ['free', 'creator', 'studio', 'enterprise'] as const;
export type PlanId = (typeof PLAN_IDS)[number];

/** What a plan can switch on, named for what people see. */
export const FEATURES = {
  quick: 'Quick read',
  interviews: 'Ask followers questions',
  compare: 'Compare drafts',
  calibration: 'Real results and accuracy',
  advisor: 'Launch advisor',
  api: 'API keys',
  members: 'Team members',
  approvals: 'Approvals',
  export: 'Export',
  webhooks: 'Webhooks',
  audit: 'Audit log',
  research: 'Focus groups, message tests and crisis rehearsals',
  brand: 'Brand rules',
} as const;
export type Feature = keyof typeof FEATURES;

export interface Plan {
  id: PlanId;
  name: string;
  price: string;
  who: string;
  /** null means no cap. */
  limits: { rehearsalsPerMonth: number | null; maxPersonas: number; projects: number | null; members: number | null };
  features: Feature[];
}

const FREE: Feature[] = ['quick', 'interviews'];
const CREATOR: Feature[] = [...FREE, 'compare', 'calibration', 'advisor', 'api'];
const STUDIO: Feature[] = [...CREATOR, 'members', 'approvals', 'export', 'webhooks', 'brand'];
const ENTERPRISE: Feature[] = [...STUDIO, 'audit', 'research'];

export const PLANS: Record<PlanId, Plan> = {
  free: { id: 'free', name: 'Free', price: '$0', who: 'Trying it out', limits: { rehearsalsPerMonth: 15, maxPersonas: 12, projects: 1, members: 0 }, features: FREE },
  creator: { id: 'creator', name: 'Creator', price: '$19 a month', who: 'People who post every week', limits: { rehearsalsPerMonth: 300, maxPersonas: 30, projects: 3, members: 0 }, features: CREATOR },
  studio: { id: 'studio', name: 'Studio', price: '$49 a month', who: 'Ghostwriters, agencies and small teams', limits: { rehearsalsPerMonth: 1500, maxPersonas: 30, projects: 25, members: 5 }, features: STUDIO },
  enterprise: { id: 'enterprise', name: 'Enterprise', price: 'Talk to us', who: 'Brands, comms teams and research groups', limits: { rehearsalsPerMonth: null, maxPersonas: 50, projects: null, members: null }, features: ENTERPRISE },
};

/** The plan whose rules apply. With plans off, everyone is on Enterprise. */
export const effectivePlan = (enabled: boolean, plan: string | null | undefined): Plan => (enabled ? (PLANS[plan as PlanId] ?? PLANS.free) : PLANS.enterprise);

/** The cheapest plan that has a feature, for the message that says where to find it. */
const cheapestWith = (f: Feature) => PLAN_IDS.map((id) => PLANS[id]).find((p) => p.features.includes(f))!;

export function requireFeature(plan: Plan, feature: Feature): void {
  if (plan.features.includes(feature)) return;
  throw new AppError(403, ErrorCode.PLAN_REQUIRED, `${FEATURES[feature]} is on the ${cheapestWith(feature).name} plan and above. This project is on ${plan.name}.`, { feature, plan: plan.id });
}

export function requireLimit(plan: Plan, what: keyof Plan['limits'], used: number, adding = 1): void {
  const cap = plan.limits[what];
  if (cap === null || used + adding <= cap) return;
  const words: Record<keyof Plan['limits'], string> = {
    rehearsalsPerMonth: `${cap} rehearsals a month`,
    maxPersonas: `crowds of up to ${cap} followers`,
    projects: `${cap} ${cap === 1 ? 'project' : 'projects'}`,
    members: cap === 0 ? 'no team members' : `${cap} team members per project`,
  };
  throw new AppError(403, ErrorCode.PLAN_REQUIRED, `The ${plan.name} plan includes ${words[what]}. Move to a bigger plan to go further.`, { limit: what, plan: plan.id });
}
