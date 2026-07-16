const dns = require("node:dns");

// Force Node to use public DNS servers
dns.setServers(["1.1.1.1", "8.8.8.8"]);

require("dotenv").config();


const app = require("./src/app");
const connectToDB = require("./src/config/database");


connectToDB();

app.listen(3000, () => {
  console.log("Server is running on port 3000");
});