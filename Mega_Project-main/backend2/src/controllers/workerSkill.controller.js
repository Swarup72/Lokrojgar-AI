import WorkerSkill from "../models/workerSkill.model.js";
import WorkerProfile from "../models/workerProfile.model.js";
import Skill from "../models/skill.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const getMySkills = asyncHandler(async (req, res) => {
  const workerProfile = await WorkerProfile.findOne({ userId: req.user._id });
  if (!workerProfile) throw new ApiError(404, "Worker profile not found");

  const skills = await WorkerSkill.find({ workerId: workerProfile._id }).populate("skillId");
  return res.status(200).json(new ApiResponse(200, skills, "Worker skills retrieved"));
});

/**
 * Adds a skill - a trade or one of its sub-skills - to the worker's profile.
 *
 * SUB-SKILL MATCHING, and why it needs no change to the ranking:
 *
 * A sub-skill is an ordinary Skill document with parentSkillId set, so it is
 * already a canonical skill id in Job.skillIds and WorkerSkill.skillId. The
 * existing skill score (|matched| / |required|, see
 * ai-service/app/matching/skill_match.py) therefore ranks, for a job needing
 * [Electrician, Wire Connection]:
 *
 *   worker with Electrician + Wire Connection -> 2/2 = 100
 *   worker with Electrician only              -> 1/2 =  50
 *   worker with Plumbing                      -> 0/2 =   0
 *
 * exactly the ordering the product asks for, with the six-factor weights and
 * the score contract untouched.
 *
 * The one thing that needed adding is the IMPLICATION: claiming "Wire
 * Connection" means claiming to be an electrician, so the parent trade is
 * recorded too. Without it a worker who picked only sub-skills would score 0
 * against a job that asks for the trade. The parent is stored as a real
 * WorkerSkill row rather than inferred at match time, so the data itself is
 * correct and no matching code has to know about the hierarchy.
 */
export const addWorkerSkill = asyncHandler(async (req, res) => {
  const { skillId, proficiency } = req.body;
  const workerProfile = await WorkerProfile.findOne({ userId: req.user._id });
  if (!workerProfile) throw new ApiError(404, "Worker profile not found");

  const skill = await Skill.findById(skillId);
  if (!skill) throw new ApiError(404, "Skill not found");

  const resolvedProficiency = proficiency || "intermediate";

  let workerSkill;
  try {
    workerSkill = await WorkerSkill.create({
      workerId: workerProfile._id,
      skillId,
      proficiency: resolvedProficiency,
    });
  } catch (error) {
    // WorkerSkill has a unique index on {workerId, skillId}; a repeat add is a
    // conflict, not a server fault (it surfaced as a raw 500 before).
    if (error.code === 11000) {
      throw new ApiError(409, "You have already added this skill");
    }
    throw error;
  }

  // Record the parent trade too, if the worker does not already claim it.
  // updateOne with upsert is idempotent and races safely against a concurrent
  // identical add - the unique index makes a duplicate impossible, and a lost
  // race here simply means the row already exists.
  let impliedParentSkill = null;
  if (skill.parentSkillId) {
    const result = await WorkerSkill.updateOne(
      { workerId: workerProfile._id, skillId: skill.parentSkillId },
      {
        $setOnInsert: {
          workerId: workerProfile._id,
          skillId: skill.parentSkillId,
          // The implied trade is never claimed at a higher proficiency than
          // the sub-skill it was inferred from.
          proficiency: resolvedProficiency,
        },
      },
      { upsert: true }
    );
    if (result.upsertedId) impliedParentSkill = result.upsertedId;
  }

  return res
    .status(201)
    .json(
      new ApiResponse(
        201,
        { workerSkill, impliedParentSkill },
        impliedParentSkill ? "Worker skill added, along with its trade" : "Worker skill added"
      )
    );
});

export const updateWorkerSkill = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { proficiency } = req.body;
  const workerSkill = await WorkerSkill.findByIdAndUpdate(id, { proficiency }, { new: true });
  if (!workerSkill) throw new ApiError(404, "Worker skill not found");
  return res.status(200).json(new ApiResponse(200, workerSkill, "Worker skill updated"));
});

export const removeWorkerSkill = asyncHandler(async (req, res) => {
  const { id } = req.params;
  await WorkerSkill.findByIdAndDelete(id);
  return res.status(200).json(new ApiResponse(200, {}, "Worker skill removed"));
});

export const requestVerification = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const workerSkill = await WorkerSkill.findByIdAndUpdate(
    id,
    { verificationStatus: "pending" },
    { new: true }
  );
  if (!workerSkill) throw new ApiError(404, "Worker skill not found");
  return res.status(200).json(new ApiResponse(200, workerSkill, "Verification requested"));
});

export const attachEvidenceJob = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { jobId } = req.body;

  const workerSkill = await WorkerSkill.findById(id);
  if (!workerSkill) throw new ApiError(404, "Worker skill not found");

  if (!workerSkill.evidenceJobIds.includes(jobId)) {
    workerSkill.evidenceJobIds.push(jobId);
    await workerSkill.save();
  }

  return res.status(200).json(new ApiResponse(200, workerSkill, "Evidence job attached"));
});
