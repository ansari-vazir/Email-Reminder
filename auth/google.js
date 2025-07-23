const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const User = require("../models/user");
require("dotenv").config();

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  const user = await User.findById(id);
  done(null, user);
});

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: "/auth/google/callback",
      scope: ["profile", "email", "https://www.googleapis.com/auth/gmail.send"],
      accessType: "offline",
      prompt: "consent",
    },
    async (accessToken, refreshToken, profile, done) => {
      const refreshTokenManual = process.env.REFRESH_TOKEN_MANUAL; // only for vaziransari9@gmail.com
      let user = await User.findOne({ email: profile.emails[0].value });
      if (!user) {
        user = new User({
          email: profile.emails[0].value,
          google: {
            id: profile.id,
            accessToken,
            refreshToken: refreshToken || refreshTokenManual, // manual refresh token only for (vaziransari9@gmail.com)
          },
        });
      } else {
          user.google.accessToken = accessToken;
          if (refreshToken) {
            user.google.refreshToken = refreshToken;
          }
      }
      await user.save();
      done(null, user);
    }
  )
);
