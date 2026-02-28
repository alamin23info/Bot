import express from "express";
import { createServer as createViteServer } from "vite";
import { Telegraf } from "telegraf";
import Database from "better-sqlite3";
import cors from "cors";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;
const db = new Database("chilly_earning.db");

// --- Database Initialization ---
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    telegram_id TEXT UNIQUE,
    username TEXT,
    first_name TEXT,
    points REAL DEFAULT 0,
    total_earnings REAL DEFAULT 0,
    ads_watched INTEGER DEFAULT 0,
    ads_in_window INTEGER DEFAULT 0,
    last_ad_reset DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_check_in DATE,
    check_in_streak INTEGER DEFAULT 0,
    referred_by TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS bonus_claims (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    bonus_index INTEGER,
    claimed_at DATE DEFAULT CURRENT_DATE,
    UNIQUE(user_id, bonus_index, claimed_at),
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS withdrawals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    method TEXT,
    amount REAL,
    wallet_address TEXT,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT,
    reward REAL,
    link TEXT,
    type TEXT
  );

  CREATE TABLE IF NOT EXISTS special_task_claims (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    task_id INTEGER,
    last_claimed_at DATETIME,
    FOREIGN KEY(user_id) REFERENCES users(id),
    FOREIGN KEY(task_id) REFERENCES tasks(id)
  );
`);

// Seed initial tasks if empty
const taskCount = db.prepare("SELECT COUNT(*) as count FROM tasks").get() as { count: number };
if (taskCount.count === 0) {
  db.prepare("INSERT INTO tasks (title, reward, link, type) VALUES (?, ?, ?, ?)").run(
    "Join Official Channel",
    0.01,
    "https://t.me/chilly_earning_news",
    "telegram"
  );
}

// Ensure special Monetag tasks exist
const specialTask1 = db.prepare("SELECT * FROM tasks WHERE link = ?").get("https://omg10.com/4/10515520");
if (!specialTask1) {
  db.prepare("INSERT INTO tasks (title, reward, link, type) VALUES (?, ?, ?, ?)").run(
    "Monetag Bonus 1",
    2.00,
    "https://omg10.com/4/10515520",
    "special"
  );
}
const specialTask2 = db.prepare("SELECT * FROM tasks WHERE link = ?").get("https://omg10.com/4/10514902");
if (!specialTask2) {
  db.prepare("INSERT INTO tasks (title, reward, link, type) VALUES (?, ?, ?, ?)").run(
    "Monetag Bonus 2",
    2.00,
    "https://omg10.com/4/10514902",
    "special"
  );
}

// --- Middleware ---
app.use(cors());
app.use(express.json());

// --- Telegram Bot ---
const BOT_TOKEN = "8762637545:AAFXG_Y4jqNICBLWxykpi0hUmgyk5-VcjLw";
const bot = new Telegraf(BOT_TOKEN);

bot.start((ctx) => {
  const telegramId = ctx.from.id.toString();
  const username = ctx.from.username || "";
  const firstName = ctx.from.first_name || "";
  const startPayload = ctx.payload; // For referrals

  // Register user if not exists
  const existingUser = db.prepare("SELECT * FROM users WHERE telegram_id = ?").get(telegramId);
  if (!existingUser) {
    let referredBy = null;
    if (startPayload && startPayload.startsWith("ref_")) {
      referredBy = startPayload.replace("ref_", "");
      // Give referral bonus to the referrer (5.00 points)
      db.prepare("UPDATE users SET points = points + 5.00, total_earnings = total_earnings + 5.00 WHERE telegram_id = ?").run(referredBy);
    }
    db.prepare("INSERT INTO users (telegram_id, username, first_name, referred_by) VALUES (?, ?, ?, ?)").run(
      telegramId, username, firstName, referredBy
    );
  }

  ctx.reply(`Welcome to Chilly 🌶️ Earning, ${firstName}!`, {
    reply_markup: {
      inline_keyboard: [
        [{ text: "🚀 Start Earning", web_app: { url: process.env.APP_URL || "http://localhost:3000" } }]
      ]
    }
  });
});

bot.launch().catch(err => console.error("Bot launch failed:", err));

// --- API Routes ---

// Sync user (Register or Update)
app.post("/api/user/sync", (req, res) => {
  const { telegramId, username, firstName } = req.body;
  
  let user = db.prepare("SELECT * FROM users WHERE telegram_id = ?").get(telegramId) as any;
  
  if (!user) {
    db.prepare("INSERT INTO users (telegram_id, username, first_name) VALUES (?, ?, ?)").run(
      telegramId, username || "", firstName || ""
    );
    user = db.prepare("SELECT * FROM users WHERE telegram_id = ?").get(telegramId);
  } else {
    // Update info if changed
    db.prepare("UPDATE users SET username = ?, first_name = ? WHERE telegram_id = ?").run(
      username || "", firstName || "", telegramId
    );
  }

  // Check 8-hour window for ads
  const now = new Date();
  const lastReset = new Date(user.last_ad_reset);
  const hoursSinceReset = (now.getTime() - lastReset.getTime()) / (1000 * 60 * 60);

  if (hoursSinceReset >= 8) {
    db.prepare("UPDATE users SET ads_in_window = 0, last_ad_reset = CURRENT_TIMESTAMP WHERE telegram_id = ?").run(telegramId);
    user = db.prepare("SELECT * FROM users WHERE telegram_id = ?").get(telegramId);
  }
  
  res.json(user);
});

// Get user profile
app.get("/api/user/:telegramId", (req, res) => {
  const user = db.prepare("SELECT * FROM users WHERE telegram_id = ?").get(req.params.telegramId);
  if (!user) return res.status(404).json({ error: "User not found" });
  
  const referrals = db.prepare("SELECT COUNT(*) as count FROM users WHERE referred_by = ?").get(req.params.telegramId) as { count: number };
  
  res.json({ ...user, total_referrals: referrals.count });
});

// Watch Ad (Update points)
app.post("/api/user/watch-ad", (req, res) => {
  const { telegramId } = req.body;
  const reward = 0.25; // Points per ad (Updated to 0.25)

  const user = db.prepare("SELECT ads_in_window FROM users WHERE telegram_id = ?").get(telegramId) as any;
  if (user && user.ads_in_window >= 500) {
    return res.status(400).json({ error: "Ad limit reached! Try again after 8 hours." });
  }
  
  db.prepare(`
    UPDATE users 
    SET points = points + ?, 
        total_earnings = total_earnings + ?, 
        ads_watched = ads_watched + 1,
        ads_in_window = ads_in_window + 1
    WHERE telegram_id = ?
  `).run(reward, reward, telegramId);
  
  const updatedUser = db.prepare("SELECT points, ads_in_window FROM users WHERE telegram_id = ?").get(telegramId);
  res.json({ success: true, points: updatedUser });
});

// Claim Bonus Task
app.post("/api/user/claim-bonus", (req, res) => {
  const { telegramId, bonusIndex } = req.body;
  const reward = 0.25;

  const user = db.prepare("SELECT id FROM users WHERE telegram_id = ?").get(telegramId) as any;
  if (!user) return res.status(404).json({ error: "User not found" });

  try {
    db.prepare("INSERT INTO bonus_claims (user_id, bonus_index) VALUES (?, ?)").run(user.id, bonusIndex);
    db.prepare("UPDATE users SET points = points + ?, total_earnings = total_earnings + ? WHERE id = ?").run(reward, reward, user.id);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: "Already claimed today" });
  }
});

// Get claimed bonuses for today
app.get("/api/user/bonuses/:telegramId", (req, res) => {
  const user = db.prepare("SELECT id FROM users WHERE telegram_id = ?").get(req.params.telegramId) as any;
  if (!user) return res.json([]);
  
  const claims = db.prepare("SELECT bonus_index FROM bonus_claims WHERE user_id = ? AND claimed_at = CURRENT_DATE").all(user.id);
  res.json(claims.map((c: any) => c.bonus_index));
});

// Daily Check-in
app.post("/api/user/check-in", (req, res) => {
  const { telegramId } = req.body;
  const user = db.prepare("SELECT id, last_check_in, check_in_streak FROM users WHERE telegram_id = ?").get(telegramId) as any;
  
  if (!user) return res.status(404).json({ error: "User not found" });

  const today = new Date().toISOString().split('T')[0];
  if (user.last_check_in === today) {
    return res.status(400).json({ error: "Already checked in today" });
  }

  let newStreak = (user.check_in_streak || 0) + 1;
  if (newStreak > 7) newStreak = 1;

  // Reward based on day (Day 1: 0.5, Day 2: 1.0, ..., Day 7: 5.0)
  const rewards = [0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 5.0];
  const reward = rewards[newStreak - 1];

  db.prepare(`
    UPDATE users 
    SET points = points + ?, 
        total_earnings = total_earnings + ?, 
        check_in_streak = ?, 
        last_check_in = ? 
    WHERE id = ?
  `).run(reward, reward, newStreak, today, user.id);

  res.json({ success: true, streak: newStreak, reward });
});

// Get rankings (Top 5)
app.get("/api/rankings", (req, res) => {
  const rankings = db.prepare(`
    SELECT first_name, username, total_earnings 
    FROM users 
    ORDER BY total_earnings DESC 
    LIMIT 5
  `).all();
  res.json(rankings);
});

// Claim Special Task (12-hour cooldown)
app.post("/api/user/claim-special-task", (req, res) => {
  const { telegramId, taskId } = req.body;
  
  const user = db.prepare("SELECT id FROM users WHERE telegram_id = ?").get(telegramId) as any;
  if (!user) return res.status(404).json({ error: "User not found" });

  const task = db.prepare("SELECT * FROM tasks WHERE id = ?").get(taskId) as any;
  if (!task) return res.status(404).json({ error: "Task not found" });

  // Check 12-hour cooldown
  const lastClaim = db.prepare(`
    SELECT last_claimed_at 
    FROM special_task_claims 
    WHERE user_id = ? AND task_id = ? 
    ORDER BY last_claimed_at DESC 
    LIMIT 1
  `).get(user.id, taskId) as { last_claimed_at: string } | undefined;

  if (lastClaim) {
    const lastClaimDate = new Date(lastClaim.last_claimed_at);
    const now = new Date();
    const diffHours = (now.getTime() - lastClaimDate.getTime()) / (1000 * 60 * 60);
    if (diffHours < 12) {
      const remaining = Math.ceil(12 - diffHours);
      return res.status(400).json({ error: `Please wait ${remaining} more hours to claim again.` });
    }
  }

  // Grant reward
  db.prepare("UPDATE users SET points = points + ?, total_earnings = total_earnings + ? WHERE id = ?").run(task.reward, task.reward, user.id);
  
  // Record claim
  db.prepare("INSERT INTO special_task_claims (user_id, task_id, last_claimed_at) VALUES (?, ?, CURRENT_TIMESTAMP)").run(user.id, taskId);

  res.json({ success: true, reward: task.reward });
});

// Get special task claims for user
app.get("/api/user/special-claims/:telegramId", (req, res) => {
  const user = db.prepare("SELECT id FROM users WHERE telegram_id = ?").get(req.params.telegramId) as any;
  if (!user) return res.json([]);
  
  const claims = db.prepare("SELECT task_id, last_claimed_at FROM special_task_claims WHERE user_id = ?").all(user.id);
  res.json(claims);
});

// Get tasks
app.get("/api/tasks", (req, res) => {
  const tasks = db.prepare("SELECT * FROM tasks").all();
  res.json(tasks);
});

// Submit Withdrawal
app.post("/api/withdraw", (req, res) => {
  const { telegramId, method, amount, walletAddress } = req.body;
  
  const user = db.prepare("SELECT id, points FROM users WHERE telegram_id = ?").get(telegramId) as any;
  if (!user || user.points < amount) return res.status(400).json({ error: "পর্যাপ্ত টাকা নেই" });
  if (amount < 3750) return res.status(400).json({ error: "Minimum withdrawal is 3750" });
  
  db.prepare("UPDATE users SET points = points - ? WHERE id = ?").run(amount, user.id);
  db.prepare("INSERT INTO withdrawals (user_id, method, amount, wallet_address) VALUES (?, ?, ?, ?)").run(
    user.id, method, amount, walletAddress
  );
  
  res.json({ success: true });
});

// --- Vite Integration ---
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
