// server.js (backend)
const express = require("express");
const axios = require("axios");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const MESSAGES_FILE = path.join(__dirname, "messages.json");

// load messages (if exist)
let messages = [];
try {
  if (fs.existsSync(MESSAGES_FILE)) {
    const raw = fs.readFileSync(MESSAGES_FILE, "utf8");
    messages = raw ? JSON.parse(raw) : [];
  }
} catch (e) {
  console.error("Failed to read messages.json:", e);
  messages = [];
}

function saveMessagesToDisk() {
  try {
    fs.writeFileSync(MESSAGES_FILE, JSON.stringify(messages, null, 2), "utf8");
  } catch (e) {
    console.error("Failed to write messages.json:", e);
  }
}

/* ---------------------------
   Contact / Messages routes
   --------------------------- */

// Save contact message to messages.json
app.post("/contact", (req, res) => {
  const { name, email, message } = req.body || {};
  if (!name || !email || !message) {
    return res.status(400).json({ success: false, error: "Missing fields" });
  }

  const newMsg = {
    id: Date.now(),
    name: String(name).slice(0, 200),
    email: String(email).slice(0, 200),
    message: String(message).slice(0, 2000),
    date: new Date().toISOString(),
  };

  messages.unshift(newMsg); // newest first
  saveMessagesToDisk();

  console.log("Saved message:", newMsg);
  return res.json({ success: true });
});

// Optional: (admin removed) but keep endpoint to debug if needed
app.get("/messages-debug", (req, res) => {
  // WARNING: this endpoint is for local debugging only. Remove if you don't want it accessible.
  res.json(messages);
});

/* ---------------------------
   Roblox user lookup route
   --------------------------- */
/*
  GET /api/user/:username
  returns: profile, avatar, favorites, createdGames, inventory, notes, summary
*/
app.get("/api/user/:username", async (req, res) => {
  const username = req.params.username;
  if (!username) return res.status(400).json({ error: "Missing username" });

  try {
    // 1) username -> userId
    const lookup = await axios.post("https://users.roblox.com/v1/usernames/users", { usernames: [username] });
    const userObj = lookup?.data?.data?.[0];
    if (!userObj || !userObj.id) {
      return res.status(404).json({ error: `User "${username}" not found` });
    }
    const userId = userObj.id;

    // Make parallel requests (best-effort)
    const [
      profileP,
      avatarP,
      favoritesP,
      createdP,
      inventoryP
    ] = await Promise.allSettled([
      axios.get(`https://users.roblox.com/v1/users/${userId}`),
      axios.get("https://thumbnails.roblox.com/v1/users/avatar-headshot", { params: { userIds: userId, size: "150x150", format: "Png", isCircular: false } }),
      axios.get(`https://games.roblox.com/v2/users/${userId}/favorite/games?limit=25`),
      axios.get(`https://games.roblox.com/v2/users/${userId}/games?limit=25`),
      // inventory - try collectibles endpoint (public); may return empty depending on privacy/api
      axios.get(`https://inventory.roblox.com/v1/users/${userId}/assets/collectibles?limit=25`)
    ]);

    const out = {
      profile: null,
      avatar: null,
      favorites: [],
      createdGames: [],
      inventory: [],
      notes: []
    };

    // profile
    if (profileP.status === "fulfilled" && profileP.value.data) {
      out.profile = profileP.value.data;
    } else {
      out.notes.push("Profile info unavailable.");
    }

    // avatar
    if (avatarP.status === "fulfilled" && avatarP.value.data?.data?.[0]?.imageUrl) {
      out.avatar = avatarP.value.data.data[0].imageUrl;
    } else {
      out.notes.push("Avatar thumbnail unavailable.");
    }

    // favorites
    if (favoritesP.status === "fulfilled" && Array.isArray(favoritesP.value.data?.data)) {
      out.favorites = favoritesP.value.data.data.map(g => ({
        id: g.id || null,
        name: g.name || "Unknown",
        rootPlaceId: g.rootPlaceId || null,
        url: (g.rootPlaceId ? `https://www.roblox.com/games/${g.rootPlaceId}` : null)
      }));
    } else {
      out.notes.push("Favorite games unavailable or empty.");
    }

    // created games
    if (createdP.status === "fulfilled" && Array.isArray(createdP.value.data?.data)) {
      out.createdGames = createdP.value.data.data.map(g => ({
        id: g.id || g.rootPlaceId || null,
        name: g.name || g.title || "Untitled",
        visits: g.visits || g.totalVisits || 0,
        url: (g.rootPlaceId ? `https://www.roblox.com/games/${g.rootPlaceId}` : null)
      }));
    } else {
      out.notes.push("Created games unavailable or empty.");
    }

    // inventory
    if (inventoryP.status === "fulfilled" && Array.isArray(inventoryP.value.data?.data)) {
      out.inventory = inventoryP.value.data.data.map(i => {
        const assetId = i?.id || i?.assetId || i?.itemId || null;
        return {
          id: assetId,
          name: i.name || i.assetName || "Item",
          image: assetId ? `https://www.roblox.com/asset-thumbnail/image?assetId=${assetId}&width=150&height=150&format=png` : null
        };
      });
    } else {
      out.notes.push("Inventory unavailable or empty.");
    }

    // summary
    out.summary = {
      userId,
      username: userObj.name,
      displayName: out.profile?.displayName || userObj.name,
      scoutScore: (out.favorites?.length || 0) + (out.createdGames?.length || 0) + (out.inventory?.length || 0)
    };

    return res.json(out);
  } catch (err) {
    console.error("Roblox API error:", err?.response?.data || err.message || err);
    return res.status(500).json({ error: "Failed to fetch Roblox data" });
  }
});

/* ---------------------------
   Start server
   --------------------------- */
app.listen(PORT, () => {
  console.log(`✅ Backend running on http://localhost:${PORT}`);
});
