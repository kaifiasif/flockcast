/**
 * Audience rehearsal engine: simulate how an audience reacts to a post before it goes out.
 *
 *   const rehearsals = createRehearsals({
 *     store: sqliteStore(db),                       // or memoryStore(), or your own Store
 *     engine: swarmEngine({ agents: pythonAgents({ llm: llmFromEnv() }) }),   // offline estimate when no key is set
 *     sources: [textSource()],                      // plus your app's own adapter (see examples/custom-source)
 *   });
 *   const r = await rehearsals.start(projectId, { ref: { text: 'My post' }, settings: { platform: 'linkedin' } });
 */
export { createRehearsals, RehearsalError, DEFAULT_LIMITS, DEFAULT_SETTINGS } from './core.ts';
export type { Rehearsals, StartRequest, Limits, CreateRehearsalsOptions, RehearsalErrorCode } from './core.ts';
export { swarmEngine, DEFAULT_AUDIENCE, draftOf } from './swarm/index.ts';
export { mirofishEngine } from './mirofish/engine.ts';
export { mirofishClient, MiroFishError } from './mirofish/client.ts';
export { llmFromEnv, checkBaseUrl, LlmError, PROVIDERS } from './llm.ts';
export type { LlmConfig, LlmEnv, ProviderName } from './llm.ts';
export { pythonAgents, AgentError } from './agents.ts';
export type { Agents, AgentsOptions, AgentJob } from './agents.ts';
export { PLATFORMS, PLATFORM_IDS, platformOf } from './platforms.ts';
export type { Platform } from './platforms.ts';
export { sqliteStore, ensureRehearsalsTable, rehearsalsSql, REHEARSALS_SQL } from './stores/sqlite.ts';
export type { SqlDb } from './stores/sqlite.ts';
export { memoryStore } from './stores/memory.ts';
export { textSource } from './sources/text.ts';
export type { TextRef } from './sources/text.ts';
export { sentencesOf } from './text.ts';
export * from './types.ts';
export { createAdvisor, DEFAULT_ADVISOR_LIMITS } from './advisor/service.ts';
export type { Advisor, AdviceRequest, AdvisorLimits, CreateAdvisorOptions } from './advisor/service.ts';
export { sqliteAdviceStore, memoryAdviceStore, ADVICE_SQL } from './advisor/store.ts';
export { searchSourcesFromEnv } from './advisor/search.ts';
export type { SearchEnv } from './advisor/search.ts';
export { ADVISOR_AGENTS, AGENTS_AT } from './advisor/agents.ts';
export type { AdvisorAgent } from './advisor/agents.ts';
export * from './advisor/types.ts';
