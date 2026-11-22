// Task templates per need. Wording is deliberately "refer / request / offer", never "secured / delivered",
// because a partner has not accepted anything when these drafts are created.

import type { NeedId } from "./needs.ts";

export type HelperType = "volunteer" | "partner" | "coordinator_only";

export interface TaskTemplate {
  title: string;
  helperType: HelperType;
  role: string;
  why: string;
}

export interface NeedTemplate {
  label: string;
  tasks: TaskTemplate[];
  question: string; // what a coordinator should still ask
}

export const NEED_TEMPLATES: Record<NeedId, NeedTemplate> = {
  food: {
    label: "Food",
    tasks: [
      { title: "Confirm household size, dietary needs, and how many days of food are left", helperType: "volunteer", role: "intake volunteer", why: "Sizes the request and sets urgency." },
      { title: "Request an emergency food box or pantry visit", helperType: "partner", role: "food resource navigator", why: "A partner pantry decides what it can provide." },
    ],
    question: "How many days of food does the household have left?",
  },
  water: {
    label: "Water",
    tasks: [
      { title: "Bring drinking water as a short-term stopgap", helperType: "volunteer", role: "delivery volunteer", why: "Covers the gap while the cause is addressed." },
      { title: "Refer to water bill or shutoff assistance", helperType: "partner", role: "utility resource navigator", why: "Restoring service is up to the utility and assistance programs." },
    ],
    question: "Is the water shut off for nonpayment, or is it a repair problem?",
  },
  housing: {
    label: "Housing",
    tasks: [
      { title: "Clarify the housing situation and any notice deadlines", helperType: "coordinator_only", role: "housing coordinator", why: "Deadlines decide how fast this must move." },
      { title: "Refer to rent assistance, mediation, or shelter options", helperType: "partner", role: "housing resource navigator", why: "Only a partner can confirm eligibility or a bed." },
    ],
    question: "Is there a written notice, and what date is on it?",
  },
  utilities: {
    label: "Utilities",
    tasks: [
      { title: "Refer to utility bill or energy assistance before any disconnect date", helperType: "partner", role: "utility resource navigator", why: "Assistance programs decide eligibility." },
    ],
    question: "Which utility is affected, and is there a disconnect date?",
  },
  medical: {
    label: "Medical",
    tasks: [
      { title: "Ask whether this is urgent and connect to a clinic or nurse line", helperType: "coordinator_only", role: "coordinator", why: "Volunteers do not judge medical urgency." },
      { title: "Help with getting medicine or supplies, with the resident's own authorization", helperType: "volunteer", role: "errand volunteer", why: "Practical support only; no medical advice." },
    ],
    question: "Is anyone in danger right now, or is this a routine medical need?",
  },
  home_repair: {
    label: "Home repair",
    tasks: [
      { title: "Request an assessment from a qualified repair partner", helperType: "partner", role: "repair partner", why: "Repairs like roofs, furnaces, and electrical need qualified people." },
    ],
    question: "Is the problem getting worse, and is the home still safe to stay in?",
  },
  disaster_cleanup: {
    label: "Cleanup",
    tasks: [
      { title: "Request a cleanup crew (muck-out, debris) after the safety check", helperType: "partner", role: "cleanup crew lead", why: "Trained crews handle flood cleanup and mold." },
      { title: "Help carry out light debris once the area is confirmed safe", helperType: "volunteer", role: "cleanup volunteer", why: "Volunteers help only in areas cleared as safe." },
    ],
    question: "Is there still standing water, and is the power off in that area?",
  },
  disaster_recovery: {
    label: "Disaster recovery",
    tasks: [
      { title: "Help the resident report damage and start a disaster-aid application", helperType: "volunteer", role: "application helper", why: "Applications have deadlines; awards are never promised." },
    ],
    question: "Has the resident already reported the damage or applied for disaster aid?",
  },
  transportation: {
    label: "Transportation",
    tasks: [
      { title: "Offer a ride or find a transport option for the appointment", helperType: "volunteer", role: "driver volunteer", why: "Only after the date, time, and accessibility needs are known." },
    ],
    question: "What is the date and time, and are there any accessibility needs?",
  },
  household_goods: {
    label: "Household goods",
    tasks: [
      { title: "Request the needed items from a goods or donation partner", helperType: "partner", role: "goods resource navigator", why: "Stock is unknown until a partner confirms." },
    ],
    question: "Which items are needed most urgently?",
  },
  clothing: {
    label: "Clothing",
    tasks: [
      { title: "Collect sizes and request clothing or blankets from a clothing partner", helperType: "partner", role: "clothing resource navigator", why: "Sizes first, then a partner confirms what it has." },
    ],
    question: "What sizes are needed, and for how many people?",
  },
  financial: {
    label: "Financial",
    tasks: [
      { title: "Refer to emergency financial or benefits help", helperType: "partner", role: "benefits navigator", why: "Programs decide eligibility; never promise money." },
    ],
    question: "Which bill or benefit is the problem, and is there a deadline?",
  },
  legal_aid: {
    label: "Legal aid",
    tasks: [
      { title: "Refer to free legal help and note any court date", helperType: "partner", role: "legal resource navigator", why: "A referral is not legal representation." },
    ],
    question: "Is there a court date or a deadline on any notice?",
  },
  language_access: {
    label: "Language access",
    tasks: [
      { title: "Arrange an interpreter or a volunteer who speaks the resident's language for every contact", helperType: "volunteer", role: "language support volunteer", why: "Applies to every task on this ticket." },
    ],
    question: "Which language does the resident prefer?",
  },
  internet_access: {
    label: "Internet access",
    tasks: [
      { title: "Refer to low-cost internet or library hotspot options", helperType: "partner", role: "digital resource navigator", why: "Program availability changes; a partner confirms." },
    ],
    question: "What is internet needed for (school, work, health)?",
  },
  employment: {
    label: "Employment",
    tasks: [
      { title: "Refer to job-search and resume help", helperType: "partner", role: "employment navigator", why: "A referral is not a job offer." },
    ],
    question: "What kind of work is the person looking for?",
  },
  mental_health: {
    label: "Mental health",
    tasks: [
      { title: "Coordinator follows the crisis protocol and shares crisis line resources now", helperType: "coordinator_only", role: "trained crisis coordinator", why: "Never assigned to volunteers." },
    ],
    question: "Is the person safe right now?",
  },
  safety: {
    label: "Safety",
    tasks: [
      { title: "Coordinator assesses immediate danger and contacts emergency services if needed", helperType: "coordinator_only", role: "trained coordinator", why: "Danger is handled by a coordinator, never a volunteer." },
    ],
    question: "Is anyone in danger right now?",
  },
};
