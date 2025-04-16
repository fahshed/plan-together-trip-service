const axios = require("axios");

const authenticateUser = async (req, res, next) => {
  const authToken = req.headers.authorization;

  if (!authToken) {
    return res.status(401).json({ error: "Authorization token is missing" });
  }

  try {
    const response = await axios.get(
      `${process.env.USER_SERVICE_URL}/users/me`,
      {
        headers: { Authorization: authToken },
      }
    );

    const user = response.data;

    if (!user) {
      return res.status(401).json({ error: "Invalid or expired token" });
    }

    req.user = user;
    next();
  } catch (err) {
    if (err.response && err.response.status === 401) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    res
      .status(500)
      .json({ error: "Failed to authenticate user", details: err.message });
  }
};

module.exports = authenticateUser;
