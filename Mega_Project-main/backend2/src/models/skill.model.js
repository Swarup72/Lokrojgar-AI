import mongoose from "mongoose";

const skillSchema = new mongoose.Schema({
  name: {
    mr: {
      type: String,
      required: true,
      trim: true,
    },

    hi: {
      type: String,
      required: true,
      trim: true,
    },

    en: {
      type: String,
      required: true,
      trim: true,
    },
  },

  categoryId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "JobCategory",
    required: true,
    index: true,
  },

  // Sub-skill support, as structured data rather than free text.
  //
  // A Skill with parentSkillId === null is a trade ("Electrician"); a Skill
  // with a parent is one of its sub-skills ("Wire Connection"). Deliberately
  // the SAME collection, because that is what makes matching work with no
  // change to the ranking: a sub-skill is an ordinary canonical skill id, so
  // Job.skillIds and WorkerSkill.skillId already reference it, and the
  // existing |matched| / |required| skill score naturally ranks
  //   parent + sub-skill  >  parent only  >  unrelated trade.
  // Introducing a separate SubSkill collection would have required changing
  // the frozen matching pipeline to understand a second kind of identifier.
  //
  // Only one level is modelled. A sub-skill of a sub-skill is rejected in the
  // catalog controller rather than silently allowed, so the hierarchy cannot
  // drift into an arbitrary tree the UI has no way to render.
  parentSkillId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Skill",
    default: null,
    index: true,
  },

  isActive: {
    type: Boolean,
    default: true,
  },
});

const Skill = mongoose.model("Skill", skillSchema);

export default Skill;