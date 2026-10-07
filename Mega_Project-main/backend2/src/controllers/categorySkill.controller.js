import JobCategory from "../models/jobCategory.model.js";
import Skill from "../models/skill.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { pickLanguage } from "../utils/languagePicker.js";

// Public Language-Aware List Categories
export const getCategories = asyncHandler(async (req, res) => {
  const categories = await JobCategory.find({ isActive: true });
  const lang = req.lang || "en";

  const localizedCategories = categories.map((cat) => ({
    _id: cat._id,
    name: pickLanguage(cat.name, lang),
    nameMultilingual: cat.name,
    description: cat.description,
  }));

  return res.status(200).json(new ApiResponse(200, localizedCategories, "Categories retrieved"));
});

/**
 * Public, language-aware skill list - trades AND their sub-skills.
 *
 * A sub-skill is an ordinary Skill with parentSkillId set, so one query
 * returns the whole hierarchy and `parentSkillId` tells the caller which is
 * which. Filters:
 *   ?categoryId=     - a trade and its sub-skills share a category
 *   ?parentSkillId=  - the sub-skills of one trade
 *   ?topLevel=true   - trades only (parentSkillId === null)
 */
export const getSkills = asyncHandler(async (req, res) => {
  const { categoryId, parentSkillId, topLevel } = req.query;

  const filter = { isActive: true };
  if (categoryId) filter.categoryId = categoryId;
  if (parentSkillId) filter.parentSkillId = parentSkillId;
  // Documents created before parentSkillId existed have no such field at all,
  // so "top level" must mean null OR absent - not just null.
  if (topLevel === "true") filter.parentSkillId = null;

  const skills = await Skill.find(filter).populate("categoryId");
  const lang = req.lang || "en";

  const localizedSkills = skills.map((skill) => ({
    _id: skill._id,
    name: pickLanguage(skill.name, lang),
    nameMultilingual: skill.name,
    categoryId: skill.categoryId?._id || skill.categoryId,
    categoryName: pickLanguage(skill.categoryId?.name, lang),
    // null for a trade, the trade's id for a sub-skill. The frontend groups on
    // this; it is never inferred from the name.
    parentSkillId: skill.parentSkillId || null,
  }));

  return res.status(200).json(new ApiResponse(200, localizedSkills, "Skills retrieved"));
});

// Admin CRUD - Category
export const createCategory = asyncHandler(async (req, res) => {
  const { name, description } = req.body;
  const category = await JobCategory.create({ name, description });
  return res.status(201).json(new ApiResponse(201, category, "Category created"));
});

export const updateCategory = asyncHandler(async (req, res) => {
  const { categoryId } = req.params;
  const category = await JobCategory.findByIdAndUpdate(categoryId, req.body, { new: true });
  if (!category) throw new ApiError(404, "Category not found");
  return res.status(200).json(new ApiResponse(200, category, "Category updated"));
});

export const deleteCategory = asyncHandler(async (req, res) => {
  const { categoryId } = req.params;
  await JobCategory.findByIdAndUpdate(categoryId, { isActive: false });
  return res.status(200).json(new ApiResponse(200, {}, "Category deleted"));
});

// Admin CRUD - Skill
export const createSkill = asyncHandler(async (req, res) => {
  const { name, categoryId, parentSkillId = null } = req.body;

  if (parentSkillId) {
    const parent = await Skill.findById(parentSkillId);
    if (!parent) throw new ApiError(404, "Parent skill not found");
    // Exactly one level of nesting. Allowing a sub-skill of a sub-skill would
    // let the catalog grow into a tree the UI has no way to render and the
    // matching has no way to weight.
    if (parent.parentSkillId) {
      throw new ApiError(400, "A sub-skill cannot itself have sub-skills");
    }
  }

  const skill = await Skill.create({ name, categoryId, parentSkillId: parentSkillId || null });
  return res.status(201).json(new ApiResponse(201, skill, "Skill created"));
});

export const updateSkill = asyncHandler(async (req, res) => {
  const { skillId } = req.params;
  const skill = await Skill.findByIdAndUpdate(skillId, req.body, { new: true });
  if (!skill) throw new ApiError(404, "Skill not found");
  return res.status(200).json(new ApiResponse(200, skill, "Skill updated"));
});

export const deleteSkill = asyncHandler(async (req, res) => {
  const { skillId } = req.params;
  await Skill.findByIdAndUpdate(skillId, { isActive: false });
  return res.status(200).json(new ApiResponse(200, {}, "Skill deleted"));
});
