// Starting playbook from the PRD appendix ("Appendix: seed data"), loaded by
// `npm run seed:library`. Geography is India on all personas; account filters are HQ India
// unless the PRD says otherwise. Seniority is left for Admins to fill in (the PRD doesn't
// say which levels each persona covers; D-015). No SMB QR items yet (D-016).
import type { AccountFilterInput, PersonaInput, TemplateInput } from "@/lib/validation/library";

export const SEED_PERSONAS: PersonaInput[] = [
  {
    name: "Research & Insights",
    tier: 1,
    functions: ["Research", "Insights"],
    seniority: [],
    jobTitles: [
      "Head of Research",
      "Research Manager",
      "User Researcher",
      "Consumer Insights Manager",
      "Market Research Manager",
    ],
    geography: ["India"],
    toolsUsedToday: "Qualtrics, SurveyMonkey, Typeform, Google Forms, Dovetail",
    leadWithAngle:
      "One platform from survey to panel to report; Logic Map; AI that proposes changes for review",
  },
  {
    name: "Product & Design",
    tier: 2,
    functions: ["Product", "Design"],
    seniority: [],
    jobTitles: [
      "Product Manager",
      "Head of Product",
      "Product Designer",
      "UX Designer",
      "Head of Design",
    ],
    geography: ["India"],
    toolsUsedToday: "Maze, Ballpark, Typeform, Google Forms",
    leadWithAngle: "Real research with recruited users, without hiring a researcher",
  },
  {
    name: "CX, Brand & Marketing",
    tier: 2,
    functions: ["CX", "Brand", "Marketing"],
    seniority: [],
    jobTitles: [
      "CX Manager",
      "Brand Manager",
      "Product Marketing Manager",
      "CMO",
      "Planning Director",
    ],
    geography: ["India"],
    toolsUsedToday: "SurveyMonkey, Typeform, in-house NPS tools, agencies",
    leadWithAngle: "NPS and concept or ad tests in-house, with AI on open-ended answers",
  },
  {
    name: "Founders & Agency Directors",
    tier: 1,
    functions: ["Leadership"],
    seniority: [],
    jobTitles: ["Founder", "Co-Founder", "Managing Director", "CEO", "Research Director"],
    geography: ["India"],
    toolsUsedToday: "Qualtrics, Forsta/Decipher, Alchemer",
    leadWithAngle:
      "Agencies: intercepts through their own panel. Startups: one tool for all research",
  },
  {
    name: "Independent Researchers & Consultants",
    tier: 1,
    functions: ["Research", "Consulting"],
    seniority: [],
    jobTitles: ["Research Consultant", "Independent Researcher", "UX Researcher"],
    geography: ["India"],
    toolsUsedToday: "Typeform, SurveyMonkey, Google Forms",
    leadWithAngle: "Panel access plus client-ready reports in one subscription",
  },
];

const RESEARCH_EXCLUSIONS = "Market Research, Staffing, Higher Ed, Hospitals, Biotech, Pharma";

export const SEED_ACCOUNT_FILTERS: AccountFilterInput[] = [
  {
    code: "A1",
    name: "Research Agencies",
    industries: ["Market Research"],
    companyHeadcount: "11–500",
    hqLocations: ["India"],
    keywords: 'fieldwork OR quantitative OR "consumer research"',
  },
  {
    code: "A2",
    name: "Ad & Creative Agencies",
    industries: ["Advertising Services"],
    companyHeadcount: "11–1,000",
    hqLocations: ["India"],
  },
  {
    code: "A3",
    name: "Research-Mature Companies",
    industries: [],
    companyHeadcount: "201–10,000",
    hqLocations: ["India"],
    keyFilters: "Any industry. Research dept 5+; consider no HQ filter",
    exclusions: RESEARCH_EXCLUSIONS,
  },
  {
    code: "A4",
    name: "Emerging Research Teams",
    industries: [],
    companyHeadcount: "51–1,000",
    hqLocations: ["India"],
    keyFilters: "Any industry. Research dept 1–4",
    exclusions: RESEARCH_EXCLUSIONS,
  },
  {
    code: "A5",
    name: "Product Companies",
    industries: ["Software", "Tech and Internet", "Financial Services"],
    companyHeadcount: "11–500",
    hqLocations: ["India"],
    keyFilters: "Product dept 3+",
  },
  {
    code: "A6",
    name: "Consumer & D2C Brands",
    industries: ["Consumer Goods", "Retail", "Food and Beverage", "Personal Care", "Apparel"],
    companyHeadcount: "51–2,000",
    hqLocations: ["Bengaluru", "Mumbai", "Delhi NCR"],
  },
];

/** Templates link to a seeded persona by name (resolved to its id when loading). */
export type SeedTemplate = Omit<TemplateInput, "personaId" | "version"> & { persona?: string };

export const SEED_TEMPLATES: SeedTemplate[] = [
  {
    name: "Message 1 – Research & Insights, Leader",
    purpose: "Message 1",
    persona: "Research & Insights",
    level: "Leader",
    body: "Hi {Name}, Lumor brings survey building, partner-panel recruitment and AI analysis into one platform, so a study goes from brief to report without switching tools. How is the research stack set up at {Company} today?",
  },
  {
    name: "Message 1 – Research & Insights, Practitioner",
    purpose: "Message 1",
    persona: "Research & Insights",
    level: "Practitioner",
    body: "Hi {Name}, enjoyed your post on {topic}. What do you use when a survey has heavy branching? We built a visual Logic Map in Lumor for exactly that.",
  },
  {
    name: "Message 1 – Product & Design",
    purpose: "Message 1",
    persona: "Product & Design",
    level: "Any",
    body: "Hi {Name}, does {Company} have a dedicated researcher, or do PMs and designers run research themselves? Lumor lets product teams test ideas with real recruited users in days.",
  },
  {
    name: "Message 1 – CX, Brand & Marketing",
    purpose: "Message 1",
    persona: "CX, Brand & Marketing",
    level: "Any",
    body: "Hi {Name}, how are you running NPS at {Company} today? Lumor runs the survey, recruits follow-up respondents and summarises open-ended answers with AI.",
  },
  {
    name: "Message 1 – Founders & Agency Directors",
    purpose: "Message 1",
    persona: "Founders & Agency Directors",
    level: "Any",
    body: "Hi {Name}, Lumor lets {Company} route respondents from your own panel through our logic, quota and AI analysis layer, without switching tools. Open to seeing it on one live study?",
  },
  {
    name: "Message 1 – Independent Researchers",
    purpose: "Message 1",
    persona: "Independent Researchers & Consultants",
    level: "Any",
    body: "Hi {Name}, how do you handle recruitment for client studies? Lumor gives independent researchers panel access and client-ready reports in one workspace.",
  },
  {
    name: "Follow-up 1",
    purpose: "Follow-up 1",
    level: "Any",
    body: "{Name}, here's a 60-second look at {workflow}: {video}. Worth 20 minutes to see it on a study like yours?",
  },
  {
    name: "Follow-up 2",
    purpose: "Follow-up 2",
    level: "Any",
    body: "Thought this might be useful: {link}. Happy to show how teams like {Company} use it.",
  },
  {
    name: "Break-up",
    purpose: "Break-up",
    level: "Any",
    body: "I'll leave it here, {Name}. If a study with tricky logic or recruitment comes up, I'm one message away.",
  },
  {
    name: "Reply – interested",
    purpose: "Reply – interested",
    level: "Any",
    body: "Great. Does {slot 1} or {slot 2} work for 20 minutes? Or pick a slot here: {calendar link}. I'll show it on a study like yours.",
  },
  {
    name: "Reply – not now",
    purpose: "Reply – not now",
    level: "Any",
    body: "Understood. When does research planning usually happen at {Company}?",
  },
  {
    name: "Reply – competitor",
    purpose: "Reply – competitor",
    level: "Any",
    body: "Makes sense. Most teams we talk to use {tool} for surveys and something else for recruitment and analysis. Is that the case for you too?",
  },
];
