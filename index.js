import express from "express";
import { bootstrap } from "./src/app.controller.js";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json());

app.get("/", (req, res) => {
  res.json({ success: true, message: "Elfishawy Cafe API is running ☕🚀" });
});

await bootstrap(app, express);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT} ✅`);
});

export default app;
