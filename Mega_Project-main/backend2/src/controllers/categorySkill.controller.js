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

// Public Language-Aware List Skills
export const getSkills = asyncHandler(async (req, res) => {
  const { categoryId } = req.query;
  const filter = { isActive: true, ...(categoryId && { categoryId }) };
  const skills = await Skill.find(filter).populate("categoryId");
  const lang = req.lang || "en";

  const localizedSkills = skills.map((skill) => ({
    _id: skill._id,
    name: pickLanguage(skill.name, lang),
    nameMultilingual: skill.name,
    categoryId: skill.categoryId?._id || skill.categoryId,
    categoryName: pickLanguage(skill.categoryId?.name, lang),
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
  const { name, categoryId } = req.body;
  const skill = await Skill.create({ name, categoryId });
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
