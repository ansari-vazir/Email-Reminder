require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const path = require("path");
const session = require("express-session");
const passport = require("passport");
const authRoutes = require("./routes/auth");
const cron = require("node-cron");
const nodemailer = require("nodemailer");
const expressLayouts = require("express-ejs-layouts");
const Reminder = require("./models/reminder");
const User = require("./models/user");
require("./auth/google");


const app = express();

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
// Session setup
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
  })
);
app.use(passport.initialize());
app.use(passport.session());
app.use("/auth", authRoutes);

// Make user available in all views
app.use((req, res, next) => {
  res.locals.user = req.user || null;
  next();
});


function createOAuthTransport(user) {
  console.log("Using refresh token:", user.google);

  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      type: "OAuth2",
      user: user.email,
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      refreshToken: user.google.refreshToken,
      accessToken: user.google.accessToken,
    },
  });
}

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
cron.schedule("* * * * *", async () => {
  try {
    const now = new Date();
    const reminders = await Reminder.find({
      scheduledTime: { $lte: now },
      sent: false,
    }).populate("sender");
    if (reminders.length > 0) {  
      const transporter = createOAuthTransport(reminders[0].sender);
      for (const reminder of reminders) {
        await transporter.sendMail({
          from: reminder.sender.email,
          to: reminder.email,
          subject: "Reminder",
          text: reminder.message,
        });

        reminder.sent = true;
        await reminder.save();
      }
    }
  } catch (error) {
    console.error("Error sending reminders:", error);
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
