const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const User = require("../models/user");
const RefreshToken = require("../models/refreshToken");
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
      callbackURL: process.env.GOOGLE_CALLBACK_URL || "http://localhost:5000/auth/google/callback",
      passReqToCallback: true,
    },
    async (req, accessToken, refreshToken, profile, done) => {
      console.log("accessToken:", accessToken);
      console.log("refreshToken:", refreshToken);

      let user = await User.findOne({ email: profile.emails[0].value });
      console.log(user);
      if (!user) {
        user = new User({
          email: profile.emails[0].value,
          google: {
            id: profile.id,
            accessToken: accessToken,
          },
        });
        await user.save();
      } else {
          user.google.accessToken = accessToken;
          await user.save();
      }
      if (refreshToken) {
        await RefreshToken.findOneAndUpdate(
          { userId: user._id },
          { token: refreshToken },
          { upsert: true, new: true }
        );
      }
      else console.log("No refresh token received");

      done(null, user);
    }
  )
);
