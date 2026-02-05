const msalConfig = {
  auth: {
    clientId: "YOUR_CLIENT_ID",
    authority: "https://login.microsoftonline.com/YOUR_TENANT_ID",
    redirectUri: "http://localhost:5500",
  },
  cache: {
    cacheLocation: "sessionStorage",
    storeAuthStateInCookie: false,
  },
};

const loginRequest = {
  scopes: ["User.Read"],
};

const statusText = document.getElementById("statusText");
const loginButton = document.getElementById("loginButton");
const logoutButton = document.getElementById("logoutButton");
const tokenSection = document.getElementById("tokenSection");
const tokenPreview = document.getElementById("tokenPreview");
const debugSection = document.getElementById("debugSection");
const debugOutput = document.getElementById("debugOutput");

const msalInstance = new msal.PublicClientApplication(msalConfig);

const setSignedOutState = () => {
  statusText.textContent = "Nicht angemeldet";
  loginButton.disabled = false;
  logoutButton.disabled = true;
  tokenSection.hidden = true;
  tokenPreview.textContent = "";
  debugSection.hidden = true;
  debugOutput.textContent = "";
};

const setSignedInState = (account, accessToken) => {
  statusText.textContent = `Angemeldet als ${account.username}`;
  loginButton.disabled = true;
  logoutButton.disabled = false;
  tokenSection.hidden = false;
  tokenPreview.textContent = `${accessToken.slice(0, 120)}...`;
  debugSection.hidden = true;
  debugOutput.textContent = "";
};

const setDebugState = (error, context) => {
  const errorInfo = {
    message: error?.message,
    errorCode: error?.errorCode,
    errorMessage: error?.errorMessage,
    suberror: error?.suberror,
    correlationId: error?.correlationId,
    traceId: error?.traceId,
    timestamp: error?.timestamp,
    statusCode: error?.statusCode,
    name: error?.name,
  };
  statusText.textContent = context;
  debugSection.hidden = false;
  debugOutput.textContent = JSON.stringify(errorInfo, null, 2);
};

const getAccessToken = async (account) => {
  const response = await msalInstance.acquireTokenSilent({
    ...loginRequest,
    account,
  });
  return response.accessToken;
};

const handleLogin = async () => {
  const loginResponse = await msalInstance.loginPopup(loginRequest);
  const accessToken = await getAccessToken(loginResponse.account);
  setSignedInState(loginResponse.account, accessToken);
};

const handleLogout = async () => {
  const account = msalInstance.getActiveAccount();
  await msalInstance.logoutPopup({
    account,
  });
  setSignedOutState();
};

const initialize = async () => {
  await msalInstance.initialize();
  const accounts = msalInstance.getAllAccounts();
  if (accounts.length > 0) {
    msalInstance.setActiveAccount(accounts[0]);
    const accessToken = await getAccessToken(accounts[0]);
    setSignedInState(accounts[0], accessToken);
  } else {
    setSignedOutState();
  }
};

loginButton.addEventListener("click", () => {
  handleLogin().catch((error) => {
    setDebugState(error, "Login fehlgeschlagen");
  });
});

logoutButton.addEventListener("click", () => {
  handleLogout().catch((error) => {
    setDebugState(error, "Logout fehlgeschlagen");
  });
});

initialize().catch((error) => {
  setDebugState(error, "Initialisierung fehlgeschlagen");
});
