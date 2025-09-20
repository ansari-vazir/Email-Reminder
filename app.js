require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const path = require("path");
const session = require("express-session");
const passport = require("passport");
const authRoutes = require("./routes/auth");
const cron = require("node-cron");
const RefreshToken = require("./models/refreshToken");
const nodemailer = require("nodemailer");
const expressLayouts = require("express-ejs-layouts");
const Reminder = require("./models/reminder");
const User = require("./models/user");
const refresh = require("passport-oauth2-refresh");
require("./auth/google");

const app = express();
// Session setup
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
  })
);

const googleStrategy = passport._strategy("google");
if (googleStrategy) {
  refresh.use("google", googleStrategy);
}

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(expressLayouts);
app.set("layout", "layout");

// MongoDB Connection
const mongoURI = process.env.MONGODB_URI || "mongodb://localhost:27017/email-reminder";

mongoose
  .connect(mongoURI)
  .then(() => {
    console.log("✅ Connected to MongoDB");
  })
  .catch((err) => {
    console.error("❌ MongoDB connection error:", err);
    process.exit(1);
  });

app.use(passport.initialize());
app.use(passport.session());
app.use("/auth", authRoutes);

// Make user available in all views
app.use((req, res, next) => {
  res.locals.user = req.user || null;
  next();
});

// Routes
app.get("/", (req, res) => {
  res.render("index", {
    title: "Email Reminder App",
    currentPage: "home",
  });
});

app.get("/about", (req, res) => {
  res.render("about", {
    title: "About - Email Reminder App",
    currentPage: "about",
  });
});

app.get("/reminders", async (req, res) => {
  try {
    const reminders = await Reminder.find({sender:req.user._id}).sort({ scheduledTime: 1 });
    res.render("reminders", {
      reminders,
      title: "My Reminders",
      currentPage: "reminders",
    });
  } catch (error) {
    res.redirect("/?error=true");
  }
});

app.get("/schedule", (req, res) => {
  res.render("schedule", {
    title: "Schedule Reminder",
    currentPage: "schedule",
  });
});

app.post("/schedule", async (req, res) => {
  try {
    const { email, message, datetime } = req.body;
    const reminder = new Reminder({
      sender: req.user._id,
      email,
      message,
      scheduledTime: new Date(datetime),
    });
    await reminder.save();
    res.redirect("/schedule?success=true");
  } catch (error) {
    console.error("Error scheduling reminder:", error);
    res.redirect("/schedule?error=true");
  }
});

// Cron job to check and send reminders
app.get("/api/run-cron", async (req, res) => {
  try {
    const now = new Date();
    console.log("🔄 Running cron at:", now);

    const reminders = await Reminder.find({
      scheduledTime: { $lte: now },
      sent: false,
    }).populate("sender");

    console.log(`📌 Found ${reminders.length} reminders`);

    let sentCount = 0;

    for (const reminder of reminders) {
      try {
        const tokenDoc = await RefreshToken.findOne({ userId: reminder.sender._id });
        if (!tokenDoc) {
          console.error("❌ No refresh token for", reminder.sender.email);
          continue;
        }

        // Refresh the access token
        const newTokens = await new Promise((resolve, reject) => {
          refresh.requestNewAccessToken(
            "google",
            tokenDoc.token,
            (err, accessToken, newRefreshToken) => {
              if (err || !accessToken) return reject(err);
              resolve({ accessToken, newRefreshToken });
            }
          );
        });

        // Save rotated refresh token if provided
        if (newTokens.newRefreshToken) {
          tokenDoc.token = newTokens.newRefreshToken;
          await tokenDoc.save();
          console.log("♻️ Refresh token rotated and saved");
        }

        // Create transporter for this user
        const userTransporter = nodemailer.createTransport({
          service: "gmail",
          auth: {
            type: "OAuth2",
            user: reminder.sender.email,
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            refreshToken: tokenDoc.token,
            accessToken: newTokens.accessToken,
          },
        });

        // Send mail
        await userTransporter.sendMail({
          from: reminder.sender.email,
          to: reminder.email,
          subject: "Reminder",
          text: reminder.message,
        });

        reminder.sent = true;
        await reminder.save();
        sentCount++;
        console.log(`📨 Sent reminder to ${reminder.email}`);
      } catch (err) {
        console.error(
          `❌ Error sending reminder for ${reminder.email} (user ${reminder.sender.email}):`,
          err
        );
      }
    }

    res.json({
      message: "Cron executed",
      remindersProcessed: reminders.length,
      remindersSent: sentCount,
    });
  } catch (error) {
    console.error("❌ Error in /api/run-cron:", error);
    res.status(500).json({ error: "Failed to process reminders" });
  }
});


const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
