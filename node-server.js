import express from "express";
import session from "express-session";
import { ConfidentialClientApplication } from "@azure/msal-node";

const app = express();

const msalConfig = {
  auth: {
    clientId: process.env.AZURE_CLIENT_ID,
    authority: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}`,
    clientSecret: process.env.AZURE_CLIENT_SECRET,
  },
};

const msalClient = new ConfidentialClientApplication(msalConfig);

app.use(
  session({
    secret: process.env.SESSION_SECRET || "replace-with-a-long-secret",
    resave: false,
    saveUninitialized: false,
  })
);

const buildAuthCodeUrl = async () => {
  return msalClient.getAuthCodeUrl({
    scopes: ["User.Read"],
    redirectUri: process.env.AZURE_REDIRECT_URI,
  });
};

app.get("/", (req, res) => {
  res.send(
    `<h1>Node.js MSAL Demo</h1>
     <p><a href="/login">Login mit Microsoft</a></p>
     <p><a href="/me">Profil abrufen</a></p>
     <p><a href="/logout">Logout</a></p>`
  );
});

app.get("/login", async (req, res, next) => {
  try {
    const authUrl = await buildAuthCodeUrl();
    res.redirect(authUrl);
  } catch (error) {
    next(error);
  }
});

app.get("/redirect", async (req, res, next) => {
  try {
    const tokenResponse = await msalClient.acquireTokenByCode({
      code: req.query.code,
      scopes: ["User.Read"],
      redirectUri: process.env.AZURE_REDIRECT_URI,
    });
    req.session.account = tokenResponse.account;
    req.session.accessToken = tokenResponse.accessToken;
    res.redirect("/me");
  } catch (error) {
    next(error);
  }
});

app.get("/me", (req, res) => {
  if (!req.session.accessToken) {
    res.status(401).send("Nicht angemeldet. <a href=\"/login\">Login</a>");
    return;
  }

  res.send(
    `<h2>Angemeldet als ${req.session.account?.username}</h2>
     <pre>${req.session.accessToken.slice(0, 120)}...</pre>
     <p><a href="/logout">Logout</a></p>`
  );
});

app.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/");
  });
});

app.use((error, req, res, next) => {
  res.status(500).send(`Fehler: ${error.message}`);
});

const port = Number(process.env.PORT || 4000);
app.listen(port, () => {
  console.log(`Server läuft auf http://localhost:${port}`);
});
