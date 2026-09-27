import 'dotenv/config';
import express from 'express';
import { once } from 'node:events';
import mongoose from 'mongoose';
import { bootstrap } from '../src/app.controller.js';
import { categoryModel } from '../src/database/model/category.model.js';
import { expenseModel } from '../src/database/model/expense.model.js';
import { inventoryModel } from '../src/database/model/inventory.model.js';
import { orderModel } from '../src/database/model/order.model.js';
import { productModel } from '../src/database/model/product.model.js';
import { getBusinessDayKey } from '../src/utils/businessDay.js';

const TEST_DB = 'elfishawy_cafe_test';
const API = process.env.TEST_API_URL || 'http://127.0.0.1:3100';
const parsedUri = new URL(process.env.MONGO_URI || '');
if (parsedUri.pathname.replace(/^\//, '') !== TEST_DB) {
  throw new Error(`Refusing to run integration writes against database: ${parsedUri.pathname}`);
}
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/i.test(API)) {
  throw new Error('Refusing to run test writes unless TEST_API_URL points to localhost');
}

const results = [];
const check = (name, passed, evidence) => {
  results.push({ name, result: passed ? 'PASS' : 'FAIL', evidence });
  console.log(`${passed ? 'PASS' : 'FAIL'} ${name}: ${evidence}`);
  if (!passed) throw new Error(`Isolated runtime assertion failed: ${name}`);
};

let categoryId;
let productId;
let purchaseInventoryId;
let zeroInventoryId;
let testIds;
let dayKey;
let server;
let safeToDropTestDb = false;

try {
  const app = express();
  app.use(express.json());
  app.get('/', (_req, res) => res.json({ message: 'Isolated test API is running' }));
  await bootstrap(app, express);
  server = app.listen(Number(process.env.PORT) || 3100, '127.0.0.1');
  await once(server, 'listening');
  if (mongoose.connection.name !== TEST_DB) throw new Error('Connected database name mismatch');
  console.log(`Connected DB verified: ${mongoose.connection.name}`);

  const existing = await Promise.all([
    orderModel.countDocuments(), productModel.countDocuments(), inventoryModel.countDocuments(),
    expenseModel.countDocuments(), categoryModel.countDocuments(),
  ]);
  if (existing.some((count) => count !== 0)) {
    throw new Error(`Test database is not clean (business collection counts: ${existing.join(',')})`);
  }
  safeToDropTestDb = true;

  const loginResponse = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD }),
  });
  const login = await loginResponse.json();
  if (!loginResponse.ok || !login?.tokens?.accessToken) {
    throw new Error(`Test backend login failed: HTTP ${loginResponse.status}`);
  }
  const token = login.tokens.accessToken;
  const request = async (path, body, method = 'POST') => {
    const response = await fetch(`${API}${path}`, {
      method,
      headers: { authorization: token, 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const data = await response.json();
    if (!response.ok || data?.success === false) {
      throw new Error(`${method} ${path} failed: HTTP ${response.status} ${data?.message || ''}`);
    }
    return data.data;
  };

  const runId = `qa_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
  testIds = {
    sale: `${runId}_sale`, lost: `${runId}_lost`, double: `${runId}_double`,
    concurrentA: `${runId}_a`, concurrentB: `${runId}_b`, purchase: `${runId}_purchase`,
    zeroRestock: `${runId}_zero_restock`,
  };
  dayKey = getBusinessDayKey(new Date());

  const category = await categoryModel.create({ name: `QA ${runId}` });
  categoryId = category._id;
  const product = await productModel.create({
    name: `QA Product ${runId}`, price: 10, category: categoryId,
    stockQuantity: 50, inStock: true,
  });
  productId = product._id;
  const purchaseInventory = await inventoryModel.create({
    name: `QA Purchase ${runId}`, quantity: 0, unit: 'KG', minLimit: 1,
  });
  purchaseInventoryId = purchaseInventory._id;
  const zeroInventory = await inventoryModel.create({
    name: `QA Zero ${runId}`, quantity: 0, unit: 'KG', minLimit: 1,
  });
  zeroInventoryId = zeroInventory._id;

  const saleBody = (clientOrderId) => ({
    items: [{ product: String(productId), quantity: 1 }], tableNumber: 1, clientOrderId,
  });
  const firstSale = await request('/orders', saleBody(testIds.sale));
  const repeatedSale = await request('/orders', saleBody(testIds.sale));
  const orderAfterRetry = await orderModel.countDocuments({ clientOrderId: testIds.sale });
  const productAfterRetry = await productModel.findById(productId).lean();
  check('same clientOrderId returns same order/invoice and deducts stock once',
    String(firstSale._id) === String(repeatedSale._id) && firstSale.orderNumber === repeatedSale.orderNumber &&
    orderAfterRetry === 1 && productAfterRetry.stockQuantity === 49,
    `orderCount=${orderAfterRetry}; invoice=${firstSale.orderNumber}; stock=49`);

  // Approximate a lost HTTP response: the backend finishes the first request, the client
  // deliberately discards its body, then retries with the same stable operation id.
  await request('/orders', saleBody(testIds.lost));
  const lostRetry = await request('/orders', saleBody(testIds.lost));
  const lostCount = await orderModel.countDocuments({ clientOrderId: testIds.lost });
  const stockAfterLostRetry = (await productModel.findById(productId).lean()).stockQuantity;
  check('retry after intentionally discarded response is idempotent',
    lostCount === 1 && stockAfterLostRetry === 48,
    `orderCount=${lostCount}; invoice=${lostRetry.orderNumber}; stock=48 (transport was not severed)`);

  const doubleClick = await Promise.all([
    request('/orders', saleBody(testIds.double)),
    request('/orders', saleBody(testIds.double)),
  ]);
  const doubleCount = await orderModel.countDocuments({ clientOrderId: testIds.double });
  const doubleStock = (await productModel.findById(productId).lean()).stockQuantity;
  check('two concurrent duplicate save requests create one order and one deduction',
    doubleCount === 1 && String(doubleClick[0]._id) === String(doubleClick[1]._id) && doubleStock === 47,
    `orderCount=${doubleCount}; sameInvoice=${doubleClick[0].orderNumber === doubleClick[1].orderNumber}; stock=47`);

  const concurrent = await Promise.all([
    request('/orders', saleBody(testIds.concurrentA)),
    request('/orders', saleBody(testIds.concurrentB)),
  ]);
  const concurrentNumbers = concurrent.map((order) => Number(order.orderNumber)).sort((a, b) => a - b);
  const concurrentCount = await orderModel.countDocuments({ clientOrderId: { $in: [testIds.concurrentA, testIds.concurrentB] } });
  const concurrentStock = (await productModel.findById(productId).lean()).stockQuantity;
  check('concurrent orders receive unique consecutive invoice numbers',
    concurrentCount === 2 && concurrentNumbers[1] === concurrentNumbers[0] + 1 && concurrentStock === 45,
    `invoiceNumbers=${concurrentNumbers.join(',')}; orderCount=${concurrentCount}; stock=45`);

  const purchaseBody = {
    description: `QA purchase ${runId}`, amount: 50, totalCost: 50, category: 'inventory',
    inventoryItemLinked: String(purchaseInventoryId), inventoryQuantityAdded: 5,
    clientExpenseId: testIds.purchase,
  };
  const purchaseOne = await request('/expenses', purchaseBody);
  const purchaseTwo = await request('/expenses', purchaseBody);
  for (let i = 0; i < 4; i++) await request('/expenses', purchaseBody);
  const purchaseRows = await expenseModel.countDocuments({ clientExpenseId: testIds.purchase });
  const purchaseStock = (await inventoryModel.findById(purchaseInventoryId).lean()).quantity;
  check('purchase retry/four repeated syncs create one purchase and add five once',
    purchaseRows === 1 && purchaseStock === 5 && String(purchaseOne._id) === String(purchaseTwo._id),
    `purchaseRows=${purchaseRows}; inventoryStock=${purchaseStock}`);

  const restockBody = {
    quantity: 20, totalCost: 200, clientRestockId: testIds.zeroRestock,
  };
  const restockOne = await request(`/inventory/${zeroInventoryId}/restock`, restockBody, 'PATCH');
  for (let i = 0; i < 4; i++) await request(`/inventory/${zeroInventoryId}/restock`, restockBody, 'PATCH');
  const restockRows = await expenseModel.countDocuments({ clientRestockId: testIds.zeroRestock });
  const zeroAfterRestock = await inventoryModel.findById(zeroInventoryId).lean();
  check('stock zero plus twenty and four retries stays twenty on same inventory id',
    restockRows === 1 && zeroAfterRestock.quantity === 20 && String(zeroAfterRestock._id) === String(zeroInventoryId),
    `stock=${zeroAfterRestock.quantity}; expenseRows=${restockRows}; inventoryIdStable=true; purchase=${restockOne.purchaseNumber}`);

  const dayOrders = await orderModel.find({ dayKey }).sort({ orderNumber: 1 }).lean();
  check('invoice records use the current Cairo business-day key',
    dayOrders.length === 5 && dayOrders.every((order) => order.dayKey === dayKey),
    `todayKey=${dayKey}; testOrders=${dayOrders.length}`);

  console.log(`RUNTIME_SUMMARY=${JSON.stringify(results)}`);
} finally {
  if (safeToDropTestDb && mongoose.connection.readyState === 1 && mongoose.connection.name === TEST_DB) {
    if (process.env.KEEP_TEST_DB === 'true') {
      console.log('Test DB retained by KEEP_TEST_DB=true for the following Electron runtime check.');
    } else {
      await mongoose.connection.dropDatabase().catch(() => {});
      console.log('Isolated test database dropped after the runtime checks.');
    }
  }
  if (server) await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
}
