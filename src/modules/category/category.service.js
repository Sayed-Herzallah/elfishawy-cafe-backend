import { categoryModel } from "../../database/model/category.model.js";
import { productModel } from "../../database/model/product.model.js";

// =========================== 1) Create Category ===========================
export const createCategory = async (req, res, next) => {
  const { name, description } = req.body;

  const existing = await categoryModel.findOne({ name });
  if (existing) return next(new Error("Category name already exists", { cause: 409 }));

  const newCategory = await categoryModel.create({ name, description });

  return res.status(201).json({
    success: true,
    message: "Category created successfully",
    data: newCategory,
  });
};

// =========================== 2) List Categories ===========================
export const listCategories = async (req, res, next) => {
  const categories = await categoryModel.find({}).sort({ name: 1 }).lean();

  return res.status(200).json({
    success: true,
    message: "Categories retrieved successfully",
    data: categories,
  });
};

// =========================== 3) Update Category ===========================
export const updateCategory = async (req, res, next) => {
  const { id } = req.params;
  const { name, description } = req.body;

  const category = await categoryModel.findById(id);
  if (!category) return next(new Error("Category not found", { cause: 404 }));

  if (name && name !== category.name) {
    const existing = await categoryModel.findOne({ name });
    if (existing) return next(new Error("Category name already exists", { cause: 409 }));
    category.name = name;
  }

  if (description !== undefined) category.description = description;

  const updated = await category.save();

  return res.status(200).json({
    success: true,
    message: "Category updated successfully",
    data: updated,
  });
};

// =========================== 4) Delete Category ===========================
export const deleteCategory = async (req, res, next) => {
  const { id } = req.params;

  const category = await categoryModel.findById(id);
  if (!category) return next(new Error("Category not found", { cause: 404 }));

  // Check if any products are associated with this category
  const productsCount = await productModel.countDocuments({ category: id });
  if (productsCount > 0) {
    return next(new Error("Cannot delete category associated with active products", { cause: 400 }));
  }

  await categoryModel.findByIdAndDelete(id);

  return res.status(200).json({
    success: true,
    message: "Category deleted successfully",
  });
};
