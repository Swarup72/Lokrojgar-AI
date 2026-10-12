import Skill from "../models/skill.model.js";
import JobCategory from "../models/jobCategory.model.js";
import { resolveSkillsSemantically } from "../services/aiService.client.js";
import logger from "./logger.js";

/**
 * Bridges voice-extracted free text (e.g. "plumber", "प्लंबर", "नळ
 * दुरुस्तीचं काम") to the real catalog's structured ObjectId references
 * (Skill / JobCategory), so the existing ID-based matching system
 * (app/matching/skill_match.py - pure set-intersection on skillId) can
 * actually use voice-derived data.
 *
 * Two-stage resolution for skills (JobCategory stays Stage 1 only - no
 * semantic-resolution need has been observed for categories):
 *
 *   Stage 1 (this file, deterministic, no LLM): Unicode NFKC + trim +
 *     whitespace normalization, exact multilingual name matching, and a
 *     small hand-maintained alias table. No fuzzy/similarity scoring.
 *
 *   Stage 2 (only for whatever Stage 1 could not resolve): the existing
 *   local LLM (via FastAPI's /skills/resolve, app/skills/semantic_resolver.py)
 *   selects a catalog skill by meaning (e.g. "नळ दुरुस्तीचं काम" ->
 *   Plumbing) - it may ONLY select from the real catalog it's given, never
 *   invent one, and this file re-validates that independently (never trusts
 *   the LLM's own claim) before accepting a result.
 */

function normalizeText(text) {
  return text.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}

// Deterministic alias table: known occupation/trade-word variants that
// voice transcription or the extraction LLM might produce, mapped to a
// catalog Skill's canonical English name. Only skills that actually exist
// in the seeded catalog today are represented here - there is no entry
// for a trade with no matching catalog Skill, so that case correctly stays
// unresolved rather than being force-matched to an unrelated skill. Extend
// this table as the real catalog grows - anything NOT covered here still
// gets a chance via Stage 2 semantic resolution.
//
// (This comment previously said the catalog had no Electrician skill. It
// does now - src/seeds/skillCatalog.js seeds the Electrician trade and its
// five sub-skills - so the entries below map the spoken variants onto it.)
const SKILL_ALIASES = {
  // Electrician. The catalog stores one Devanagari spelling for both mr and
  // hi ("इलेक्ट्रिशियन"), but Hindi is commonly written "इलेक्ट्रीशियन" and
  // spoken as "बिजली मिस्त्री" - neither matched the catalog name, so a Hindi
  // employer describing exactly this job got no suggestion at all.
  electrician: "Electrician",
  electricians: "Electrician",
  electrical: "Electrician",
  wireman: "Electrician",
  "इलेक्ट्रीशियन": "Electrician",
  "इलेक्ट्रिशियन": "Electrician",
  "बिजली मिस्त्री": "Electrician",
  "बिजलीवाला": "Electrician",
  "वायरमन": "Electrician",
  "विजेची कामे": "Electrician",

  plumber: "Plumbing",
  plumbers: "Plumbing",
  "प्लंबर": "Plumbing",
  "प्लम्बर": "Plumbing",
  mason: "Masonry",
  masons: "Masonry",
  "गवंडी": "Masonry",
  carpenter: "Carpentry",
  carpenters: "Carpentry",
  "सुतार": "Carpentry",
  painter: "Painting",
  painters: "Painting",
  "रंगारी": "Painting",
  cook: "Cooking",
  cooks: "Cooking",
  chef: "Cooking",
  "रसोइया": "Cooking",
  cleaner: "Cleaning",
  cleaners: "Cleaning",
  waiter: "Waiter Service",
  waiters: "Waiter Service",
  "वेटर": "Waiter Service",
  "tractor driver": "Tractor Driving",
  "tempo driver": "Tempo Driver",
  "delivery boy": "Delivery Agent",
  "delivery agent": "Delivery Agent",
};

// No JobCategory aliases exist yet - the seeded categories are broad
// (e.g. "Construction Work") and voice extraction has not been observed
// to produce category-shaped text that isn't already just a skill name.
// Left as an empty, extensible table rather than invented entries.
const JOB_CATEGORY_ALIASES = {};

// Conservative acceptance threshold for Stage 2 (semantic) results - an
// implementation choice, not a spec requirement. A local instruct model's
// self-reported confidence is not trusted blindly for persistence (see
// module docstring); requiring >=0.7 on top of the id already having been
// independently re-validated against the real catalog is the "conservative
// acceptance rule" the two-stage design calls for.
const SEMANTIC_CONFIDENCE_THRESHOLD = 0.7;

function buildAliasLookup(aliasTable) {
  const lookup = new Map();
  for (const [alias, canonicalName] of Object.entries(aliasTable)) {
    lookup.set(normalizeText(alias), canonicalName);
  }
  return lookup;
}

function buildCatalogLookup(docs) {
  const lookup = new Map(); // normalized name -> {id, canonicalName}
  for (const doc of docs) {
    const canonicalName = doc.name?.en;
    if (!canonicalName) continue;
    for (const lang of ["en", "hi", "mr"]) {
      const name = doc.name?.[lang];
      if (name) {
        lookup.set(normalizeText(name), { id: doc._id.toString(), canonicalName });
      }
    }
  }
  return lookup;
}

/**
 * Stage 1 only: exact (post-normalization) name matching, then alias table.
 *
 * Returns:
 *   resolved: [{ rawText, id, canonicalName }] - one entry per successfully
 *     matched *unique* catalog id (duplicates collapse to their first
 *     rawText, not reported as unresolved).
 *   unresolved: [rawText, ...] - values that matched nothing; preserved
 *     verbatim so the caller can show them to the user as free text
 *     rather than silently discarding them.
 */
function resolveDeterministic(rawValues, docs, aliasTable) {
  const catalogLookup = buildCatalogLookup(docs);
  const aliasLookup = buildAliasLookup(aliasTable);

  const resolved = [];
  const unresolved = [];
  const seenIds = new Set();

  for (const raw of rawValues) {
    if (typeof raw !== "string" || !raw.trim()) continue;
    const normalized = normalizeText(raw);

    let match = catalogLookup.get(normalized);
    if (!match) {
      const aliasTarget = aliasLookup.get(normalized);
      if (aliasTarget) {
        match = catalogLookup.get(normalizeText(aliasTarget));
      }
    }

    if (match) {
      if (!seenIds.has(match.id)) {
        seenIds.add(match.id);
        resolved.push({ rawText: raw, id: match.id, canonicalName: match.canonicalName });
      }
    } else {
      unresolved.push(raw);
    }
  }

  return { resolved, unresolved };
}

async function resolveAgainstCatalog(rawValues, { Model, aliasTable }) {
  if (!Array.isArray(rawValues) || rawValues.length === 0) {
    return { resolved: [], unresolved: [] };
  }

  const docs = await Model.find({ isActive: true });
  return resolveDeterministic(rawValues, docs, aliasTable);
}

/**
 * Stage 2: for whatever Stage 1 left unresolved, ask the local LLM (via
 * FastAPI) to select a match from the real, active Skill catalog by
 * meaning. Fails gracefully - if the AI service is unreachable/down, the
 * affected skills simply stay unresolved rather than the whole confirm
 * flow failing (same "never let an AI-service outage break something else"
 * principle already used for translation).
 */
async function resolveSemanticallyWithAcceptanceRule(rawValues, docs, transcript) {
  if (rawValues.length === 0 || docs.length === 0) {
    return { resolved: [], unresolved: rawValues };
  }

  const catalog = docs.map((doc) => ({
    id: doc._id.toString(),
    name: { mr: doc.name?.mr, hi: doc.name?.hi, en: doc.name?.en },
  }));
  const validIds = new Set(catalog.map((entry) => entry.id));
  const idToName = new Map(catalog.map((entry) => [entry.id, entry.name.en]));

  let response;
  try {
    response = await resolveSkillsSemantically({ transcript: transcript || "", rawSkills: rawValues, catalog });
  } catch (error) {
    logger.warn("Semantic skill resolution unavailable - leaving affected skills unresolved", error.message);
    return { resolved: [], unresolved: rawValues };
  }

  const resolved = [];
  const unresolved = [];
  const seenIds = new Set();

  for (const result of response?.results || []) {
    const accepted =
      result.resolved === true &&
      typeof result.canonicalSkillId === "string" &&
      validIds.has(result.canonicalSkillId) &&
      typeof result.confidence === "number" &&
      result.confidence >= SEMANTIC_CONFIDENCE_THRESHOLD;

    if (accepted && !seenIds.has(result.canonicalSkillId)) {
      seenIds.add(result.canonicalSkillId);
      resolved.push({
        rawText: result.rawSkill,
        id: result.canonicalSkillId,
        canonicalName: idToName.get(result.canonicalSkillId),
      });
    } else if (!accepted) {
      unresolved.push(result.rawSkill);
    }
    // accepted but a duplicate id we already resolved: silently collapse,
    // same behavior as Stage 1's own deduplication.
  }

  return { resolved, unresolved };
}

export async function resolveSkillsFromText(rawSkills, transcript) {
  if (!Array.isArray(rawSkills) || rawSkills.length === 0) {
    return { resolved: [], unresolved: [] };
  }

  const docs = await Skill.find({ isActive: true });
  const stage1 = resolveDeterministic(rawSkills, docs, SKILL_ALIASES);

  if (stage1.unresolved.length === 0) {
    // Nothing left for Stage 2 to do - the semantic resolver (and the AI
    // service call it requires) is never invoked when Stage 1 already
    // resolved everything.
    return stage1;
  }

  const stage2 = await resolveSemanticallyWithAcceptanceRule(stage1.unresolved, docs, transcript);

  const seenIds = new Set(stage1.resolved.map((r) => r.id));
  const mergedResolved = [...stage1.resolved];
  for (const entry of stage2.resolved) {
    if (!seenIds.has(entry.id)) {
      seenIds.add(entry.id);
      mergedResolved.push(entry);
    }
  }

  return { resolved: mergedResolved, unresolved: stage2.unresolved };
}

export async function resolveJobCategoriesFromText(rawCategories) {
  return resolveAgainstCatalog(rawCategories, { Model: JobCategory, aliasTable: JOB_CATEGORY_ALIASES });
}

// Exported for tests only - not part of the public normalization contract.
export const _internal = {
  normalizeText,
  resolveDeterministic,
  resolveSemanticallyWithAcceptanceRule,
  SEMANTIC_CONFIDENCE_THRESHOLD,
  SKILL_ALIASES,
};

/**
 * Suggest catalog skills mentioned in a job's title and description.
 *
 * This is the Add Job form's replacement for showing every skill in a
 * category as a chip grid. It is DETERMINISTIC and makes no AI call: an
 * employer typing a title is a synchronous interaction, and a 10-17s local
 * LLM round trip per keystroke-blur is not one.
 *
 * It differs from resolveDeterministic() above only in how it reads the
 * input. That function matches a LIST of already-separated skill phrases
 * against catalog names exactly. This one searches free prose, so it asks
 * the opposite question: which catalog names appear inside this sentence?
 *
 * Everything returned is a real catalog document - the ids come from the
 * documents themselves, so a suggestion can never be an invented skill.
 * Suggestions are exactly that: the caller presents them unconfirmed, and
 * the employer removes or adds to them before anything is published.
 *
 * @param {string} text - title and description, concatenated by the caller
 * @param {object[]} docs - candidate Skill documents (optionally pre-filtered
 *   to a category by the caller)
 * @param {number} limit - most suggestions to return
 * @returns {{id:string, canonicalName:string, matched:string}[]}
 */
export function suggestSkillsFromText(text, docs, limit = 8) {
  if (typeof text !== "string" || !text.trim() || !Array.isArray(docs)) return [];

  const haystack = normalizeText(text);
  const hits = new Map(); // id -> suggestion

  // `matchedTerm` is the wording actually found in the text, which is not
  // always the catalog name: an alias hit finds "plumber" and credits the
  // Plumbing skill. Recording the term the employer used is what lets the UI
  // explain why a skill was suggested.
  const addHit = (doc, matchedTerm, weight) => {
    const id = doc._id.toString();
    const len = normalizeText(matchedTerm).length;
    const existing = hits.get(id);
    // Prefer the longest match: "switch board fitting" beats "fitting".
    if (!existing || len > existing._len) {
      hits.set(id, {
        id,
        canonicalName: doc.name?.en || matchedTerm,
        matched: matchedTerm,
        _len: len,
        _weight: Math.max(weight, existing?._weight ?? 0),
      });
    }
  };

  const consider = (doc, name, weight) => {
    if (!name) return;
    const needle = normalizeText(name);
    // Two characters would match inside unrelated words in every language.
    if (needle.length < 3 || !haystack.includes(needle)) return;
    addHit(doc, name, weight);
  };

  for (const doc of docs) {
    for (const lang of ["en", "hi", "mr"]) consider(doc, doc.name?.[lang], 2);
  }

  // The alias table already encodes the spoken variants of each trade
  // ("plumber" -> "Plumbing"), so free prose benefits from it too.
  const byCanonical = new Map();
  for (const doc of docs) {
    if (doc.name?.en) byCanonical.set(normalizeText(doc.name.en), doc);
  }
  for (const [alias, canonicalName] of Object.entries(SKILL_ALIASES)) {
    const needle = normalizeText(alias);
    if (needle.length < 3 || !haystack.includes(needle)) continue;
    const doc = byCanonical.get(normalizeText(canonicalName));
    // Credited directly: the alias itself is the evidence. Re-testing the
    // canonical name against the text would throw the match away, because
    // "Plumber required" does not contain the word "plumbing".
    if (doc) addHit(doc, alias, 1);
  }

  return [...hits.values()]
    // A specific sub-skill is more useful than the trade it belongs to, and a
    // longer name is a more specific match.
    .sort((a, b) => b._weight - a._weight || b._len - a._len)
    .slice(0, limit)
    .map(({ id, canonicalName, matched }) => ({ id, canonicalName, matched }));
}
