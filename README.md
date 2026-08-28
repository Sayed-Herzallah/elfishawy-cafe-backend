# El Fishawy Cafe Backend

> **Production-ready POS & Cafe Management REST API** built with **Node.js (ES Modules)**, **Express.js**, and **MongoDB (Mongoose)**. Features a robust Controller-Service-Validation pattern, real-time analytics, inventory control, and secure RBAC.

[![Node.js](https://img.shields.io/badge/Node.js-20+-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![Express](https://img.shields.io/badge/Express-5.x-000000?logo=express&logoColor=white)](https://expressjs.com)
[![MongoDB](https://img.shields.io/badge/MongoDB-Mongoose-47A248?logo=mongodb&logoColor=white)](https://mongoosejs.com)
[![Vercel](https://img.shields.io/badge/Deployed-Vercel-000000?logo=vercel&logoColor=white)](https://elfishawy-cafe-backend.vercel.app)
[![Cloudinary](https://img.shields.io/badge/Cloud-Cloudinary-3448C5?logo=cloudinary&logoColor=white)](https://cloudinary.com)

---

## ☕ Overview

El Fishawy Backend is a complete point-of-sale (POS) and inventory telemetry API designed specifically for cafe restaurant operations. It manages product catalogs, ingredients recipes, orders, inventory logs, expenses, and automated stock synchronization.

---

## 🚀 Key Features

- 🔐 **Custom Authentication & OTP Flow** — JWT-based user session control with secure verification emails via `nodemailer`
- 🛡️ **Granular Authorization Middleware** — Multi-role access control (Admin, Cashier, Kitchen, Inventory Manager)
- 📦 **Inventory & Ingredient Tracking** — Automated stock deductions based on custom product recipes and conversion units
- 📈 **Real-Time Analytics & Dashboard Telemetry** — Track sales velocity, top products, daily expenses, and profit margins
- ⚙️ **Modular Controller-Service Architecture** — Highly scalable code separation following solid engineering principles
- 📤 **Cloudinary Integration** — Fast file upload pipeline using `multer` memory storage and remote image hosting
- ⏱️ **Automated Cron Jobs** — Scheduled tasks utilizing `node-cron` for periodic database cleanup and stock notifications
- 🔒 **Express Shield** — Enhanced API security using `helmet` headers, `cors` whitelisting, and strict request rate limiting

---

## 📐 Project Architecture

This codebase implements a clean **Controller-Service-Validation** pattern:
1. **Validation Middleware (`joi`)**: Sanitizes and validates client inputs before processing.
2. **Controllers**: Act as the HTTP transport layer, returning clean responses.
3. **Services**: Contain all core business rules, database mutations, and domain logic.
4. **Models (`Mongoose`)**: Define structured schema models with data validation indexes.

---

## 📂 Directory Structure

```
├── index.js                  # Entry point & Express server configuration
├── vercel.json               # Serverless runtime configuration for Vercel
├── src/
│   ├── database/             # MongoDB Mongoose connection handler
│   │   ├── connect.js
│   │   └── model/            # Schema declarations
│   │       ├── category.model.js
│   │       ├── expense.model.js
│   │       ├── inventory.model.js
│   │       ├── order.model.js
│   │       ├── otp.model.js
│   │       ├── product.model.js
│   │       ├── recipe.model.js
│   │       └── user.model.js
│   ├── middleware/           # Security, Auth Guards, Validation, Rate Limits
│   │   ├── authaction.middleware.js
│   │   ├── authorization.middleware.js
│   │   ├── express.limit.middleware.js
│   │   └── validation.middleware.js
│   ├── modules/              # Feature modules (Controller + Service + Joi Validation)
│   │   ├── analytics/
│   │   ├── auth/
│   │   ├── category/
│   │   ├── expense/
│   │   ├── inventory/
│   │   ├── order/
│   │   ├── product/
│   │   ├── recipe/
│   │   └── user/
│   └── utils/                # Encryption, image uploaders, error handlers, cron tasks
│       ├── encryption/
│       ├── errorhandling/
│       ├── hashing/
│       ├── recipe/
│       ├── token/
│       └── uploadfile/
```

---

## 🛡️ Security Features

- **JSON Web Tokens (JWT)**: Secured state-less auth payload signed with custom expiration.
- **Helmet Headers**: Protects against well-known web vulnerabilities.
- **Joi Validation**: Rejects malformed JSON bodies, query params, and route parameters.
- **Express Limit**: Restricts abuse on authentication attempts.

---

## 🔧 Environment Configuration

Create a `.env` file in the root folder:

```env
PORT=5000
MONGO_URI=mongodb+srv://<username>:<password>@cluster.mongodb.net/elfishawy
JWT_SECRET=your_jwt_signature_secret
CLOUDINARY_CLOUD_NAME=your_cloudinary_name
CLOUDINARY_API_KEY=your_cloudinary_api_key
CLOUDINARY_API_SECRET=your_cloudinary_api_secret
EMAIL_USER=your_nodemailer_email
EMAIL_PASS=your_nodemailer_app_password
```

---

## 💻 Running Locally

```bash
# Install dependencies
npm install

# Start Dev Server
npm run dev
```

---

## 🔗 Related Repositories

- [elfishawy-cafe-frontend](https://github.com/Sayed-Herzallah/elfishawy-cafe-frontend) (React + Vite + Tailwind CSS)

---

## Author

**Sayed Herzallah** — [herzallah.me](https://herzallah.me) · [GitHub](https://github.com/Sayed-Herzallah)
