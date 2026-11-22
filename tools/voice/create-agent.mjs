#!/usr/bin/env node
// Creates (or updates) the Relay MKE phone agent on ElevenLabs Agents:
//   1. a webhook tool `create_request` -> POST {PUBLIC_BASE_URL}/api/voice/tool
//   2. the agent "Jordan · Relay MKE" using tools/voice/prompt.md
// Usage:  ELEVENLABS_API_KEY=... PUBLIC_BASE_URL=https://xxx.trycloudflare.com node tools/voice/create-agent.mjs
// Re-running updates the existing tool/agent (ids cached in tools/voice/.agent.json, git-ignored).

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const envFile = join(here, "../../src/.env.local");
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const API_KEY = process.env.ELEVENLABS_API_KEY;
const BASE = (process.env.PUBLIC_BASE_URL ?? "").replace(/\/$/, "");
const SECRET = process.env.VOICE_TOOL_SECRET ?? "";
const VOICE_ID = process.env.ELEVENLABS_VOICE_ID ?? "cjVigY5qzO86Huf0OWal";
const API = process.env.ELEVENLABS_API_BASE ?? "https://api.elevenlabs.io";

if (!API_KEY) die("ELEVENLABS_API_KEY is required");
if (!/^https:\/\//.test(BASE)) die("PUBLIC_BASE_URL must be an https URL (e.g. your cloudflared tunnel)");

const cachePath = join(here, ".agent.json");
const cache = existsSync(cachePath) ? JSON.parse(readFileSync(cachePath, "utf8")) : {};
const prompt = readFileSync(join(here, "prompt.md"), "utf8");
const dispatchPrompt = readFileSync(join(here, "dispatch-prompt.md"), "utf8");
const followupPrompt = readFileSync(join(here, "followup-prompt.md"), "utf8");

const toolConfig = {
  type: "webhook",
  name: "create_request",
  description:
    "Log the caller's request on the Relay Board. Call exactly once, after you know what they need, roughly where they are, and have asked for a number to text. If the response says texted=true, tell them the code is in their messages; only spell it out if texted=false.",
  execution_mode: "immediate",
  pre_tool_speech: "force",
  response_timeout_secs: 20,
  api_schema: {
    url: `${BASE}/api/voice/tool`,
    method: "POST",
    request_headers: SECRET ? { "x-relay-secret": SECRET } : {},
    request_body_schema: {
      type: "object",
      required: ["what_they_need", "area"],
      properties: {
        what_they_need: { type: "string", description: "What the caller needs, in their own words, one or two sentences. Do not include their name or phone number." },
        area: { type: "string", description: "Milwaukee neighborhood or nearest cross streets, e.g. '35th and Burleigh' or 'Harambee'." },
        household_size: { type: "integer", description: "Number of people in the home, if mentioned." },
        urgency: { type: "string", enum: ["critical", "high", "normal", "low"], description: "critical = tonight / safety / a missing person, high = within a day or two, normal = this week, low = whenever." },
        language: { type: "string", enum: ["en", "es", "hmn", "other"], description: "Language the caller is speaking: en, es (Spanish), hmn (Hmong), other." },
        safety_concern: { type: "boolean", description: "True if the caller described risk to themselves or others: abuse, a weapon, threats, thoughts of self-harm, overdose, afraid to go home, or a missing child or adult." },
        safety_level: { type: "string", enum: ["concern", "crisis"], description: "crisis = self-harm, weapon, threat to kill, overdose, a missing person. concern = abuse, feeling unsafe at home, threats, stalking." },
        safety_note: { type: "string", description: "One neutral sentence about the safety situation. No names. For a missing person: age, where and when last seen, clothing." },
        resources_shared: { type: "string", description: "Comma-separated lines you read out, from: 911, ncmec, 988, county, sojourner, 211. Example: \"988, 211\". For a missing person: \"911\" or \"911, ncmec\"." },
        callback_ok: { type: "boolean", description: "True if the caller said the number they are calling from is fine to text back." },
        callback_number: { type: "string", description: "A phone number the caller gave to be texted at, digits as spoken, e.g. '414 555 0123'. Omit if they want the number they're calling from." },
        conversation_id: { type: "string", dynamic_variable: "system__conversation_id" },
        caller_id: { type: "string", dynamic_variable: "system__caller_id" },
      },
    },
  },
};

const agentConfig = {
  name: "Jordan · Relay MKE",
  conversation_config: {
    agent: {
      first_message: "Hey, this is Jordan with ComForce. What's going on today?",
      language: "en",
      prompt: { prompt, llm: process.env.ELEVENLABS_LLM ?? "gpt-4.1", temperature: 0.4, tool_ids: [] },
    },
    tts: { voice_id: VOICE_ID, model_id: "eleven_v4_turbo", stability: 0.45, speed: 1.0 },
    turn: { turn_eagerness: "normal" },
    language_presets: {
      es: { overrides: { agent: { first_message: "Hola, habla Jordan de ComForce. Cuénteme, ¿qué está pasando?" } } },
    },
  },
};

// ---- Dispatch agent: Jordan calls a partner organization to hand off a request ----
const partnerToolConfig = {
  type: "webhook",
  name: "partner_response",
  description: "Record whether the partner organization accepted the request and when it will be ready for pickup. Call exactly once, as soon as you have a clear yes or no.",
  execution_mode: "immediate",
  pre_tool_speech: "auto",
  response_timeout_secs: 20,
  api_schema: {
    url: `${BASE}/api/voice/partner-tool`,
    method: "POST",
    request_headers: SECRET ? { "x-relay-secret": SECRET } : {},
    request_body_schema: {
      type: "object",
      required: ["accepted"],
      properties: {
        accepted: { type: "boolean", description: "True if the partner can take this request." },
        ready_by: { type: "string", description: "When it will be ready for pickup, in their words, e.g. 'in about 20 minutes' or 'after 2 pm'." },
        notes: { type: "string", description: "Anything the volunteer should know: which door, what to bring, limits, who to ask for." },
        contact_name: { type: "string", description: "First name of the person you spoke with, if given." },
        request_id: { type: "string", dynamic_variable: "request_id" },
        request_code: { type: "string", dynamic_variable: "request_code" },
        conversation_id: { type: "string", dynamic_variable: "system__conversation_id" },
      },
    },
  },
};

const dispatchAgentConfig = {
  name: "Jordan · Relay dispatch (calls partners)",
  conversation_config: {
    agent: {
      first_message: "Hi, this is Jordan calling from ComForce Milwaukee — have I reached {{partner_name}}?",
      language: "en",
      dynamic_variables: {
        dynamic_variable_placeholders: {
          partner_name: "Northside Community Pantry", contact_name: "the front desk", request_code: "R-0000", request_id: "", need_summary: "Groceries for a family", needs: "Food", household: "not stated", neighborhood: "Sherman Park", urgency: "high", details: "", volunteer: "a ComForce volunteer",
        },
      },
      prompt: { prompt: dispatchPrompt, llm: process.env.ELEVENLABS_LLM ?? "gpt-4.1", temperature: 0.3, tool_ids: [] },
    },
    tts: { voice_id: VOICE_ID, model_id: "eleven_v4_turbo", stability: 0.5, speed: 1.05 },
    turn: { turn_eagerness: "normal" },
  },
  platform_settings: {
    widget: { variant: "compact", action_text: "Incoming call · ComForce MKE", start_call_text: "Answer", end_call_text: "Hang up", listening_text: "Jordan is listening", speaking_text: "Jordan", bg_color: "#ffffff", btn_color: "#16a34a", btn_text_color: "#ffffff" },
  },
};

// ---- Follow-up agent: Jordan calls the resident back (in the browser on /phone) to confirm the help arrived ----
const followupToolConfig = {
  type: "webhook",
  name: "followup_result",
  description: "Record whether the delivered help actually arrived for the resident. Call exactly once, as soon as the resident has answered. This does not end the call: keep talking and let the resident hang up.",
  execution_mode: "immediate",
  pre_tool_speech: "auto",
  response_timeout_secs: 20,
  api_schema: {
    url: `${BASE}/api/voice/followup-tool`,
    method: "POST",
    request_headers: SECRET ? { "x-relay-secret": SECRET } : {},
    request_body_schema: {
      type: "object",
      required: ["arrived"],
      properties: {
        arrived: { type: "string", enum: ["yes", "partial", "no"], description: "yes = it all arrived; partial = some of it / something wrong; no = nothing arrived." },
        notes: { type: "string", description: "One sentence in English, in the resident's words, no names." },
        request_id: { type: "string", dynamic_variable: "request_id" },
        request_code: { type: "string", dynamic_variable: "request_code" },
        conversation_id: { type: "string", dynamic_variable: "system__conversation_id" },
      },
    },
  },
};

const followupAgentConfig = {
  name: "Jordan · Relay follow-up (calls residents)",
  conversation_config: {
    agent: {
      first_message: "Hi, this is Jordan with ComForce Milwaukee — I'm calling about your request {{request_code}}. {{volunteer}} came by with the {{need_summary}}. Did it get to you okay?",
      language: "en",
      dynamic_variables: {
        dynamic_variable_placeholders: { request_code: "R-0000", request_id: "", need_summary: "groceries", volunteer: "a ComForce volunteer", partner_name: "a partner pantry", language_name: "English" },
      },
      prompt: { prompt: followupPrompt, llm: process.env.ELEVENLABS_LLM ?? "gpt-4.1", temperature: 0.3, tool_ids: [] },
    },
    tts: { voice_id: VOICE_ID, model_id: "eleven_v4_turbo", stability: 0.45, speed: 1.0 },
    turn: { turn_eagerness: "normal" },
    language_presets: {
      es: { overrides: { agent: { first_message: "Hola, habla Jordan de ComForce Milwaukee. Le llamo por su solicitud {{request_code}}. {{volunteer}} pasó a dejar {{need_summary}}. ¿Le llegó bien?" } } },
    },
  },
  platform_settings: {
    // /phone starts this session in the browser and passes the resident's language as an override.
    overrides: { conversation_config_override: { agent: { language: true, first_message: false, prompt: { prompt: false } } } },
    widget: { variant: "compact", action_text: "Jordan · ComForce MKE", start_call_text: "Answer", end_call_text: "Hang up", listening_text: "Jordan is listening", speaking_text: "Jordan", bg_color: "#ffffff", btn_color: "#16a34a", btn_text_color: "#ffffff" },
  },
};

const tool = cache.toolId
  ? await api("PATCH", `/v1/convai/tools/${cache.toolId}`, { tool_config: toolConfig })
  : await api("POST", "/v1/convai/tools", { tool_config: toolConfig });
cache.toolId = tool.id;
agentConfig.conversation_config.agent.prompt.tool_ids = [tool.id];

const agent = cache.agentId
  ? await api("PATCH", `/v1/convai/agents/${cache.agentId}`, agentConfig)
  : await api("POST", "/v1/convai/agents/create", agentConfig);
cache.agentId = agent.agent_id ?? cache.agentId;

const partnerTool = cache.partnerToolId
  ? await api("PATCH", `/v1/convai/tools/${cache.partnerToolId}`, { tool_config: partnerToolConfig })
  : await api("POST", "/v1/convai/tools", { tool_config: partnerToolConfig });
cache.partnerToolId = partnerTool.id;
dispatchAgentConfig.conversation_config.agent.prompt.tool_ids = [partnerTool.id];

const dispatchAgent = cache.dispatchAgentId
  ? await api("PATCH", `/v1/convai/agents/${cache.dispatchAgentId}`, dispatchAgentConfig)
  : await api("POST", "/v1/convai/agents/create", dispatchAgentConfig);
cache.dispatchAgentId = dispatchAgent.agent_id ?? cache.dispatchAgentId;

const followupTool = cache.followupToolId
  ? await api("PATCH", `/v1/convai/tools/${cache.followupToolId}`, { tool_config: followupToolConfig })
  : await api("POST", "/v1/convai/tools", { tool_config: followupToolConfig });
cache.followupToolId = followupTool.id;
followupAgentConfig.conversation_config.agent.prompt.tool_ids = [followupTool.id];

const followupAgent = cache.followupAgentId
  ? await api("PATCH", `/v1/convai/agents/${cache.followupAgentId}`, followupAgentConfig)
  : await api("POST", "/v1/convai/agents/create", followupAgentConfig);
cache.followupAgentId = followupAgent.agent_id ?? cache.followupAgentId;
writeFileSync(cachePath, JSON.stringify(cache, null, 2));

console.log(`\n✔ tool  ${cache.toolId}\n✔ agent ${cache.agentId}\n✔ partner tool  ${cache.partnerToolId}\n✔ dispatch agent ${cache.dispatchAgentId}\n✔ follow-up tool ${cache.followupToolId}\n✔ follow-up agent ${cache.followupAgentId}\n`);
console.log(`Add to src/.env.local:\n  NEXT_PUBLIC_ELEVENLABS_AGENT_ID=${cache.agentId}\n  NEXT_PUBLIC_ELEVENLABS_DISPATCH_AGENT_ID=${cache.dispatchAgentId}\n  NEXT_PUBLIC_ELEVENLABS_FOLLOWUP_AGENT_ID=${cache.followupAgentId}\n  (for real outbound calls also set ELEVENLABS_PHONE_NUMBER_ID from an imported Twilio number)\n`);
console.log(`Then in https://elevenlabs.io/app/agents/settings → Post-call webhooks, add:\n  ${BASE}/api/voice/elevenlabs   (copy its signing secret to ELEVENLABS_WEBHOOK_SECRET)\n`);
console.log(`Test in the browser: https://elevenlabs.io/app/agents/${cache.agentId}  or the widget on ${BASE}/r`);

async function api(method, path, body) {
  const r = await fetch(API + path, { method, headers: { "xi-api-key": API_KEY, "content-type": "application/json" }, body: JSON.stringify(body) });
  const text = await r.text();
  if (!r.ok) die(`${method} ${path} → ${r.status}\n${text}`);
  return text ? JSON.parse(text) : {};
}

function die(msg) {
  console.error("✖ " + msg);
  process.exit(1);
}
