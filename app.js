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



const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    type: "OAuth2",
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  },
});

transporter.set("oauth2_provision_cb", async (userEmail, renew, callback) => {
  try {
    const user = await User.findOne({ email: userEmail });
    if (!user) return callback(new Error("User not found"));

    const tokenDoc = await RefreshToken.findOne({ userId: user._id });
    if (!tokenDoc) return callback(new Error("Refresh token not found"));

    refresh.requestNewAccessToken(
      "google",
      tokenDoc.token,
      async (err, accessToken, newRefreshToken) => {
        if (err || !accessToken) {
          console.error("Failed to refresh token:", err);
          return callback(err);
        }
        else { console.log("Access token refreshed");
        }

        // Save new refresh token if rotation occurred
        if (newRefreshToken) {
          tokenDoc.token = newRefreshToken;
          await tokenDoc.save().catch(e =>
            console.error("Error saving new refresh token:", e)
          );
        }

        // Update user’s access token
        user.google.accessToken = accessToken;
        await user.save();

        callback(null, accessToken);
      }
    );
  } catch (error) {
    console.error("Error in oauth2_provision_cb:", error);
    callback(error);
  }
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
    const reminders = await Reminder.find({
      scheduledTime: { $lte: now },
      sent: false,
    }).populate("sender");

    let sentCount = 0;

    if (reminders.length > 0) {
      for (const reminder of reminders) {
        try {
          await transporter.sendMail({
            from: reminder.sender.email,
            to: reminder.email,
            subject: "Reminder",
            text: reminder.message,
            auth: { user: reminder.sender.email },
          });

          reminder.sent = true;
          await reminder.save();
          sentCount++;
          console.log(
            `✅ Reminder sent to ${reminder.email} from ${reminder.sender.email}`
          );
        } catch (error) {
          console.error(
            `❌ Error sending reminder to ${reminder.email} for user ${reminder.sender.email}:`,
            error
          );
        }
      }
    }

    res.json({
      message: "Cron executed",
      remindersProcessed: reminders.length,
      remindersSent: sentCount,
    });
  } catch (error) {
    console.error("❌ Error processing reminders:", error);
    res.status(500).json({ error: "Failed to process reminders" });
  }
});


const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
