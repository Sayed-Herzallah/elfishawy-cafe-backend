import { productModel } from "../../database/model/product.model.js";
import { categoryModel } from "../../database/model/category.model.js";
import { recipeModel } from "../../database/model/recipe.model.js";
import { consumptionPerUnit, convertToBase, repairIngredientInput } from "../../utils/recipe/unitConverter.js";
import cloudinary from "../../utils/uploadfile/cloudinary.js";

// Helper to upload file buffer to Cloudinary
const uploadToCloudinary = (fileBuffer, folder = "elfishawy/products") => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    );
    stream.end(fileBuffer);
  });
};

// Calculate available product quantity based on recipe and current inventory
const calcAvailableByRecipe = async (productId) => {
  const recipe = await recipeModel.findOne({ product: productId, isActive: { $ne: false } })
    .populate("ingredients.inventoryItem", "quantity unit");

  if (!recipe || recipe.ingredients.length === 0) return null;

  let minAvailable = Infinity;
  let recipeDirty = false;

  for (const ing of recipe.ingredients) {
    if (!ing.inventoryItem) continue;

    const stockBase = convertToBase(ing.inventoryItem.quantity, ing.inventoryItem.unit);
    const repaired = repairIngredientInput(ing, stockBase);

    if (repaired.repaired) {
      ing.inputQuantity = repaired.inputQuantity;
      ing.inputUnit = repaired.inputUnit;
      recipeDirty = true;
    }

    const cpu = consumptionPerUnit(repaired.inputQuantity, repaired.inputUnit, ing.outputQuantity || 1);
    const canMake = cpu > 0 ? Math.floor(stockBase / cpu) : Infinity;
    if (canMake < minAvailable) minAvailable = canMake;
  }

  if (recipeDirty) {
    recipe.markModified("ingredients");
    recipe.save().catch(() => {});
  }

  return minAvailable === Infinity ? 0 : minAvailable;
};

// =========================== 1) Create Product ===========================
export const createProduct = async (req, res, next) => {
  const { name, description, price, category, stockQuantity } = req.body;

  const categoryExists = await categoryModel.findById(category);
  if (!categoryExists) return next(new Error("Category not found", { cause: 404 }));

  const productName = String(name).trim();

  const existing = await productModel.findOne({ name: productName });
  if (existing) return next(new Error("Product name already exists", { cause: 409 }));

  let image;
  if (!req.file) {
    return next(new Error("Product image is required (upload an image with 'image' field)", { cause: 400 }));
  }

  try {
    const uploadResult = await uploadToCloudinary(req.file.buffer);
    image = {
      secure_url: uploadResult.secure_url,
      public_id: uploadResult.public_id,
    };
  } catch (err) {
    return next(new Error(`Failed to upload product image: ${err.message}`, { cause: 500 }));
  }

  const newProduct = await productModel.create({
    name: productName,
    description,
    price,
    category,
    stockQuantity: Number(stockQuantity) || 0,
    inStock: (Number(stockQuantity) || 0) > 0,
    image,
  });

  return res.status(201).json({
    success: true,
    message: "Product created successfully",
    data: newProduct,
  });
};

// =========================== 2) List Products ===========================
export const listProducts = async (req, res, next) => {
  const { search, category, inStock } = req.query;

  const filter = {};

  if (search) {
    filter.name = { $regex: search, $options: "i" };
  }

  if (category) {
    filter.category = category;
  }

  if (inStock !== undefined) {
    filter.inStock = inStock === "true";
  }

  const data = await productModel.find(filter)
    .sort({ createdAt: -1 })
    .populate("category")
    .lean();

  const enriched = await Promise.all(
    data.map(async (p) => {
      const availableQuantityByRecipe = await calcAvailableByRecipe(p._id);

      // ✅ المنتجات المربوطة بوصفة: الرصيد الفعلي = المحسوب من الخامات
      if (availableQuantityByRecipe !== null) {
        const nextInStock = availableQuantityByRecipe > 0;
        if (p.stockQuantity !== availableQuantityByRecipe || p.inStock !== nextInStock) {
          await productModel.findByIdAndUpdate(p._id, {
            stockQuantity: availableQuantityByRecipe,
            inStock: nextInStock,
          });
          p.stockQuantity = availableQuantityByRecipe;
          p.inStock = nextInStock;
        }
      }

      return {
        ...p,
        availableQuantityByRecipe,
      };
    })
  );

  return res.status(200).json({
    success: true,
    message: "Products list retrieved successfully",
    data: enriched,
  });
};

// =========================== 3) Get Product ===========================
export const getProduct = async (req, res, next) => {
  const { id } = req.params;

  const product = await productModel.findById(id).populate("category");
  if (!product) return next(new Error("Product not found", { cause: 404 }));

  const availableQuantityByRecipe = await calcAvailableByRecipe(product._id);

  return res.status(200).json({
    success: true,
    message: "Product retrieved successfully",
    data: {
      ...product.toObject(),
      availableQuantityByRecipe,
    },
  });
};

// =========================== 4) Update Product ===========================
export const updateProduct = async (req, res, next) => {
  const { id } = req.params;
  const { name, description, price, category, stockQuantity, inStock } = req.body;

  const product = await productModel.findById(id);
  if (!product) return next(new Error("Product not found", { cause: 404 }));

  if (category) {
    const categoryExists = await categoryModel.findById(category);
    if (!categoryExists) return next(new Error("Category not found", { cause: 404 }));
    product.category = category;
  }

  if (name !== undefined && String(name).trim() !== product.name) {
    const productName = String(name).trim();
    const existing = await productModel.findOne({ name: productName });
    if (existing) return next(new Error("Product name already exists", { cause: 409 }));
    product.name = productName;
  }

  if (stockQuantity !== undefined) {
    product.stockQuantity = Math.max(0, Math.floor(Number(stockQuantity) || 0));
    product.inStock = product.stockQuantity > 0;
  }

  if (inStock !== undefined) {
    product.inStock = inStock === true || inStock === "true";
  }

  if (req.file) {
    try {
      // Delete old image if exists
      if (product.image?.public_id) {
        await cloudinary.uploader.destroy(product.image.public_id);
      }
      // Upload new image
      const uploadResult = await uploadToCloudinary(req.file.buffer);
      product.image = {
        secure_url: uploadResult.secure_url,
        public_id: uploadResult.public_id,
      };
    } catch (err) {
      return next(new Error(`Failed to upload product image: ${err.message}`, { cause: 500 }));
    }
  }

  const updated = await product.save();

  return res.status(200).json({
    success: true,
    message: "Product updated successfully",
    data: updated,
  });
};

// =========================== 5) Delete Product ===========================
export const deleteProduct = async (req, res, next) => {
  const { id } = req.params;

  const product = await productModel.findById(id);
  if (!product) return next(new Error("Product not found", { cause: 404 }));

  // Delete image from Cloudinary
  if (product.image?.public_id) {
    try {
      await cloudinary.uploader.destroy(product.image.public_id);
    } catch (err) {
      console.error("Cloudinary image deletion failed: ", err.message);
    }
  }

  await productModel.findByIdAndDelete(id);

  return res.status(200).json({
    success: true,
    message: "Product deleted successfully",
  });
};
