const { Client, Databases } = require("node-appwrite");

const endpoint = process.env.APPWRITE_ENDPOINT;
const projectId = process.env.APPWRITE_PROJECT_ID;
const apiKey = process.env.APPWRITE_API_KEY;

if (!endpoint || !projectId || !apiKey) {
  console.error("❌ Appwrite env vars missing. Appwrite disabled.");
  module.exports = null;
  return;
}

const client = new Client();

client
  .setEndpoint(endpoint)
  .setProject(projectId)
  .setKey(apiKey); // ✅ works ONLY with node-appwrite

const databases = new Databases(client);

module.exports = databases;
