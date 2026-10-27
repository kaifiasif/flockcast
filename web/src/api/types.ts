/** Response shapes, inferred from the server routes. Import these instead of redeclaring them. */
import type { InferRequestType, InferResponseType } from 'hono/client';
import type { api } from './client';

type Api = typeof api;
type Ok<T> = InferResponseType<T, 200>;

export type AppConfig = Ok<Api['config']['$get']>;
export type Platform = AppConfig['platforms'][number];
export type AuthSession = Ok<Api['auth']['session']['$get']>;
export type PublicUser = NonNullable<AuthSession['user']>;
export type MfaSetup = Ok<Api['auth']['mfa']['setup']['$post']>;

export type ProjectSummary = Ok<Api['projects']['$get']>['projects'][number];
export type Project = Ok<Api['projects'][':id']['$get']>['project'];
export type ProjectInput = InferRequestType<Api['projects']['$post']>['json'];
export type ApiKey = Ok<Api['projects'][':id']['keys']['$get']>['keys'][number];

export type Rehearsal = Ok<Api['projects'][':id']['rehearsals'][':rid']['$get']>['rehearsal'];
export type RehearsalResult = NonNullable<Rehearsal['result']>;
export type RehearsalInput = InferRequestType<Api['projects'][':id']['rehearsals']['$post']>['json'];
export type Interview = Rehearsal['interviews'][number];
export type Outcome = NonNullable<Rehearsal['outcome']>;
export type OutcomeInput = InferRequestType<Api['projects'][':id']['rehearsals'][':rid']['outcome']['$put']>['json'];
export type CompareInput = InferRequestType<Api['projects'][':id']['comparisons']['$post']>['json'];
export type Member = Ok<Api['projects'][':id']['members']['$get']>['members'][number];
export type Invite = Ok<Api['projects'][':id']['members']['$get']>['invites'][number];
export type Approval = NonNullable<Ok<Api['projects'][':id']['rehearsals'][':rid']['approval']['$get']>['approval']>;
export type Webhook = Ok<Api['projects'][':id']['webhooks']['$get']>['webhooks'][number];
export type AuditEvent = Ok<Api['projects'][':id']['audit']['$get']>['events'][number];
export type Usage = Ok<Api['projects'][':id']['usage']['$get']>;
export type Calibration = Ok<Api['projects'][':id']['calibration']['$get']>['calibration'];

export type Advice = Ok<Api['projects'][':id']['advice'][':aid']['$get']>['advice'];
export type AdviceResult = NonNullable<Advice['result']>;
export type AdviceInput = InferRequestType<Api['projects'][':id']['advice']['$post']>['json'];
export type AdvisorInfo = AppConfig['advisor'];
export type AdvisorAgent = keyof AdvisorInfo['agents'];
export type StudioInfo = AppConfig['studio'];
export type StudioAgent = keyof StudioInfo['agents'];

export type Study = Ok<Api['projects'][':id']['studies'][':sid']['$get']>['study'];
export type StudySummary = Ok<Api['projects'][':id']['studies']['$get']>['studies'][number];
export type StudyResult = NonNullable<Study['result']>;
export type StudyInput = InferRequestType<Api['projects'][':id']['studies']['$post']>['json'];
export type ResearchInfo = AppConfig['research'];
export type ResearchAgent = keyof ResearchInfo['agents'];
export type BrandRules = NonNullable<Project['brand']>;
export type BrandCheck = NonNullable<RehearsalResult['brand']>;
