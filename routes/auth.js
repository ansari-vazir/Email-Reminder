const express = require("express");
const passport = require("passport");
const router = express.Router();

router.get('/google',
  passport.authenticate('google', {
    scope: ['profile', 'email', 'https://mail.google.com/'],
    accessType: 'offline',
    prompt: 'consent'
  })
);


router.get(
  "/google/callback",
  passport.authenticate("google", {
    scope: ['profile', 'email', 'https://mail.google.com/'],
    accessType: 'offline',
    prompt: 'consent',
    failureRedirect: "https://email-scheduler-sk2o.onrender.com",
    successRedirect: "https://email-scheduler-sk2o.onrender.com/schedule",
  })
);

router.get("/logout", (req, res) => {
  req.logout(() => {
    res.redirect("/");
  });
});

module.exports = router;
